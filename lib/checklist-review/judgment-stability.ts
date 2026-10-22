import type { ChecklistFinding } from "./types";

/**
 * 판정 안정화 — 같은 도서를 다시 평가할 때 판정이 근거 없이 흔들리지 않게 한다.
 *
 * 배경: 같은 도서를 '새로 분석'으로 다시 돌리면 AI 판정이 매번 2~4개씩 오르내렸다
 * (강하 실측: 개선 3·하락 4). 행정 판단의 신뢰는 "같은 서류엔 같은 판정"에서 나오므로,
 * 이전 판정을 기준점으로 주고(프롬프트), 근거 없이 달라진 판정은 되돌린다(여기).
 *
 * 변경을 인정하는 경우 (둘 중 하나):
 * - rationale에 "[판정 변경]" 표시 + 원문 인용(anchorText)이 있는 근거 — 뒤집을 근거를 명시함
 * - 고해상도 확대 판독 근거("확대 판독:") — 이전보다 더 정밀하게 읽어 낸 결과
 */
export function isJustifiedChange(finding: ChecklistFinding): boolean {
  const marked = finding.rationale.includes("[판정 변경]");
  // 원문 인용(anchorText) 또는 위치를 짚은 이미지 관찰 근거가 있으면 뒤집을 근거를 명시한 것으로 봄
  const anchored = finding.evidence.some(
    (entry) => (entry.anchorText ?? "").trim().length >= 2 || (entry.kind === "visual" && Boolean(entry.region)),
  );
  const zoomBacked = finding.evidence.some((entry) => /^\s*확대 판독/.test(entry.note ?? ""));
  return (marked && anchored) || zoomBacked;
}

export function stabilizeFindings(
  findings: ChecklistFinding[],
  priorById: Map<string, ChecklistFinding>,
): { findings: ChecklistFinding[]; reverted: string[]; changed: string[] } {
  const reverted: string[] = [];
  const changed: string[] = [];
  const result = findings.map((finding) => {
    const prior = priorById.get(finding.itemId);
    if (!prior || prior.status === finding.status) return finding;
    if (isJustifiedChange(finding)) {
      changed.push(finding.itemId);
      return finding;
    }
    reverted.push(finding.itemId);
    // 이전 판정을 그대로 복원 (같은 도서이므로 근거 페이지도 유효). 항목 id는 현재 기준.
    return { ...prior, itemId: finding.itemId };
  });
  return { findings: result, reverted, changed };
}
