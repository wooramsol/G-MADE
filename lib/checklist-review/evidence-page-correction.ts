import { parsePageSlices } from "@/lib/ai/page-citation";
import type { UploadedFileSummary } from "@/lib/ai/uploaded-file";
import type { ChecklistFinding } from "./types";

/**
 * 근거 페이지 교정 — AI가 인용한 원문(anchorText)이 실제로 있는 페이지로 근거 페이지를 바로잡는다.
 *
 * 배경(강하 실측): 체크리스트 문구를 정확히 인용했는데 근거 페이지가 p.3·p.5로 기록돼
 * 있었고, 실제 문구는 p.6·p.7에 있었다. AI가 발췌본 순번·인쇄된 쪽번호를 섞어 쓰면서
 * 페이지가 어긋난 것 — 그 결과 근거 캡처가 엉뚱한 페이지를 보여주고 위치 박스도 못 그렸다.
 * 인용 문구는 페이지 텍스트(텍스트층 + 도면 판독)에서 기계적으로 찾을 수 있으므로,
 * 문구가 실제로 있는 페이지를 정답으로 삼는다.
 *
 * 안전장치: 인용문이 6자 이상이고, 인용한 페이지에는 없으며, 다른 페이지 1~3곳에서만
 * 발견될 때만 교정한다 (흔한 짧은 문구로 엉뚱하게 옮기지 않도록). 여러 곳이면 원래
 * 인용 페이지에 가장 가까운 곳.
 */
function normalize(text: string): string {
  return text.replace(/[\s·ㆍ.,/|()（）\-–~]/g, "");
}

export function correctEvidencePages(
  findings: ChecklistFinding[],
  files: UploadedFileSummary[],
): { findings: ChecklistFinding[]; corrected: number; checked: number } {
  const pagesByFile = new Map<string, Array<{ page: number; text: string }>>();
  for (const slice of parsePageSlices(files)) {
    const list = pagesByFile.get(slice.fileName) ?? [];
    list.push({ page: slice.page, text: normalize(slice.text) });
    pagesByFile.set(slice.fileName, list);
  }
  const allPages = [...pagesByFile.values()].flat();
  let corrected = 0;
  let checked = 0;

  // 원본(이전 검토 객체일 수 있음)을 건드리지 않도록 복제본을 교정
  const result = findings.map((finding) => ({
    ...finding,
    evidence: finding.evidence.map((entry) => ({ ...entry })),
  }));
  for (const finding of result) {
    for (const evidence of finding.evidence) {
      // 이미지 관찰 근거는 그림 속 내용을 본 것 — 같은 글자가 다른 페이지(색채계획 등)에 있다고
      // 옮기면 엉뚱한 페이지를 가리키게 됨 (실제 오류 사례). 페이지·위치를 그대로 둔다.
      if (evidence.kind === "visual") continue;
      const needle = normalize(evidence.anchorText ?? "");
      if (needle.length < 6) continue;
      const pages = pagesByFile.get(evidence.fileName) ?? (pagesByFile.size === 1 ? allPages : []);
      if (pages.length === 0) continue;
      checked += 1;
      const hits = pages.filter((entry) => entry.text.includes(needle)).map((entry) => entry.page);
      if (hits.length === 0 || hits.includes(evidence.page) || hits.length > 3) continue;
      const nearest = hits.reduce((best, page) =>
        Math.abs(page - evidence.page) < Math.abs(best - evidence.page) ? page : best,
      );
      evidence.page = nearest;
      // 다른 페이지 기준으로 추정했던 영역은 무의미 — 위치는 인용문으로 다시 찾는다
      delete evidence.region;
      corrected += 1;
    }
  }
  return { findings: result, corrected, checked };
}
