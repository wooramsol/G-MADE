import type {
  ChecklistEvidence,
  ChecklistFinding,
  ChecklistItem,
  ChecklistSourcePage,
} from "./types";

/**
 * 문서 재제출 시 "완전히 같은 파일"이 아니어도, 실제로 바뀌지 않은 페이지에 근거한
 * 항목은 재분석을 건너뛰고 이전 검토 결과를 재사용하기 위한 순수 로직 모음입니다.
 * (I/O 없음 — PDF 읽기·해시 계산은 run-checklist-review.ts에서 수행 후 이 함수들에 전달)
 *
 * 페이지 삽입·삭제(=번호 밀림)에도 대응하기 위해, 단순히 같은 인덱스의 페이지를
 * 비교하지 않고 페이지 "내용"(해시) 기준으로 두 문서를 정렬(alignment)합니다.
 * 예: 3페이지 앞에 새 페이지가 하나 끼어들면, 기존 방식(인덱스 비교)은 3페이지
 * 이후 전부를 "변경"으로 오판하지만, 내용 기반 정렬은 밀린 페이지들도 내용이
 * 같으면 올바르게 "안 바뀜"으로 인식합니다.
 */

export type FileFingerprint = {
  originalName: string;
  contentHash?: string;
  /** 페이지별 내용 해시 (인덱스 i = 원본 p.(i+1)). PDF 비전 자산이 없는 파일은 undefined. */
  pageHashes?: string[];
};

/**
 * 파일 하나에 대한 기준(직전 검토) 대비 정렬 결과.
 * - "identical": 파일 내용 해시가 완전히 같음 — 페이지 번호도 그대로(항등 매핑).
 * - "unavailable": 비교 불가(새 파일·페이지 해시 계산 불가/용량 초과 등) — 이 파일의
 *   어떤 페이지도 "안 바뀜"으로 확인할 수 없습니다.
 * - "aligned": 페이지 내용(해시) 기준 최장 공통 부분수열(LCS)로 정렬한 결과.
 *   baselineToCurrent는 기준 검토의 페이지 번호 -> 현재 문서에서 같은 내용을 가진
 *   페이지 번호. 삽입·삭제·순서 변경으로 밀린 페이지도 내용만 같으면 대응됩니다.
 *   대응이 없으면(그 페이지가 삭제됐거나 내용이 바뀜) 매핑에 없습니다.
 */
export type FileAlignment =
  | { kind: "identical" }
  | { kind: "unavailable" }
  | { kind: "aligned"; baselineToCurrent: Map<number, number> };

export type AlignmentByFile = Map<string, FileAlignment>;

/**
 * 두 페이지 해시 시퀀스를 LCS(최장 공통 부분수열)로 정렬합니다. 반환값은
 * baseline 페이지 번호(1-based) -> current 페이지 번호(1-based) 매핑이며,
 * 순서를 보존하는 대응만 포함합니다(내용이 같아도 순서가 뒤바뀐 경우는 대응하지 않음
 * — 실제로는 페이지가 이동한 것이므로 안전하게 "변경"으로 취급).
 */
export function alignPagesByContent(baselineHashes: string[], currentHashes: string[]): Map<number, number> {
  const n = baselineHashes.length;
  const m = currentHashes.length;
  const mapping = new Map<number, number>();
  if (n === 0 || m === 0) return mapping;

  // dp[i][j] = baseline[0..i) 와 current[0..j)의 LCS 길이
  const dp: Uint32Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i += 1) dp[i] = new Uint32Array(m + 1);

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      if (baselineHashes[i - 1] === currentHashes[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (baselineHashes[i - 1] === currentHashes[j - 1]) {
      mapping.set(i, j);
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return mapping;
}

/** 페이지 단위 정렬 계산 상한 — LCS는 O(n*m)이라 너무 크면 계산을 포기합니다. */
const MAX_ALIGNMENT_CELLS = 400 * 400;

/**
 * 현재 파일들과 기준(직전) 검토의 파일들을 파일별로 정렬합니다.
 * - 파일명이 기준에 없으면(새 파일) "unavailable".
 * - 내용 해시가 완전히 같으면 "identical"(정렬 계산 생략, 빠른 경로).
 * - 페이지 해시가 없거나(계산 불가) 정렬 비용이 상한을 넘으면 "unavailable".
 * - 그 외에는 내용 기준 LCS 정렬을 계산합니다.
 */
export function computeFileAlignments(
  currentFiles: FileFingerprint[],
  baselineFiles: FileFingerprint[],
): AlignmentByFile {
  const baselineByName = new Map(baselineFiles.map((file) => [file.originalName, file]));
  const result: AlignmentByFile = new Map();

  for (const file of currentFiles) {
    const baseline = baselineByName.get(file.originalName);
    if (!baseline) {
      result.set(file.originalName, { kind: "unavailable" });
      continue;
    }

    if (baseline.contentHash && file.contentHash && baseline.contentHash === file.contentHash) {
      result.set(file.originalName, { kind: "identical" });
      continue;
    }

    if (!baseline.pageHashes || !file.pageHashes) {
      result.set(file.originalName, { kind: "unavailable" });
      continue;
    }

    if (baseline.pageHashes.length * file.pageHashes.length > MAX_ALIGNMENT_CELLS) {
      result.set(file.originalName, { kind: "unavailable" });
      continue;
    }

    const baselineToCurrent = alignPagesByContent(baseline.pageHashes, file.pageHashes);
    result.set(file.originalName, { kind: "aligned", baselineToCurrent });
  }

  return result;
}

/**
 * 기준 검토의 페이지 번호를 현재 문서 기준 페이지 번호로 변환합니다. 그 페이지 내용이
 * 현재 문서에서 확인되지 않으면(삭제됐거나 내용이 바뀜) undefined를 반환합니다.
 */
export function mapBaselinePageToCurrent(
  alignments: AlignmentByFile,
  fileName: string,
  baselinePage: number,
): number | undefined {
  const entry = alignments.get(fileName);
  if (!entry) return undefined;
  if (entry.kind === "identical") return baselinePage;
  if (entry.kind === "unavailable") return undefined;
  return entry.baselineToCurrent.get(baselinePage);
}

/**
 * 판정의 근거 페이지를 전부 현재 문서 기준 페이지 번호로 재매핑합니다. 근거가 하나도
 * 없는 판정(주로 "확인불가")은 재사용하지 않습니다 — 다른 곳에 새로 생긴 근거를 놓칠 수
 * 있어 보수적으로 항상 재분석합니다. 근거 페이지 중 하나라도 현재 문서에서 확인되지
 * 않으면(삭제됨 등) 재사용하지 않습니다.
 */
export function remapFindingToCurrentPages(
  finding: ChecklistFinding,
  alignments: AlignmentByFile,
): ChecklistFinding | null {
  if (finding.evidence.length === 0) return null;

  const remappedEvidence: ChecklistEvidence[] = [];
  for (const entry of finding.evidence) {
    const mappedPage = mapBaselinePageToCurrent(alignments, entry.fileName, entry.page);
    if (mappedPage === undefined) return null;
    remappedEvidence.push({ ...entry, page: mappedPage });
  }

  return { ...finding, evidence: remappedEvidence };
}

/** 체크리스트 표 페이지 목록을 전부 현재 문서 기준으로 재매핑합니다. 하나라도 실패하면 null. */
export function remapChecklistPages(
  pages: ChecklistSourcePage[],
  alignments: AlignmentByFile,
): ChecklistSourcePage[] | null {
  const remapped: ChecklistSourcePage[] = [];
  for (const page of pages) {
    const mappedPage = mapBaselinePageToCurrent(alignments, page.fileName, page.page);
    if (mappedPage === undefined) return null;
    remapped.push({ fileName: page.fileName, page: mappedPage });
  }
  return remapped;
}

/** 항목의 출처 페이지(source)를 현재 문서 기준으로 재매핑합니다. 실패하면 source만 제거(항목 자체는 유지). */
export function remapItem(item: ChecklistItem, alignments: AlignmentByFile): ChecklistItem {
  if (!item.source) return item;
  const mappedPage = mapBaselinePageToCurrent(alignments, item.source.fileName, item.source.page);
  return mappedPage === undefined
    ? { ...item, source: undefined }
    : { ...item, source: { ...item.source, page: mappedPage } };
}

export function normalizeItemText(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 항목 원문(공백 무시) -> 판정 매핑을 만듭니다. */
export function buildFindingsByText(
  items: ChecklistItem[],
  findings: ChecklistFinding[],
): Map<string, ChecklistFinding> {
  const findingById = new Map(findings.map((finding) => [finding.itemId, finding]));
  const map = new Map<string, ChecklistFinding>();
  for (const item of items) {
    const finding = findingById.get(item.id);
    if (finding) map.set(normalizeItemText(item.text), finding);
  }
  return map;
}

/**
 * 현재 항목들을 "재사용 가능"과 "재분석 필요"로 나눕니다. 항목 원문이 기준 검토의 항목과
 * 일치하고, 그 판정의 근거 페이지 전부가 현재 문서에서 확인될 때만 재사용하며(페이지
 * 번호는 현재 문서 기준으로 재매핑됨), 그 외에는 재분석 대상으로 분류합니다.
 */
export function partitionItemsForReuse(
  items: ChecklistItem[],
  baselineFindingsByText: Map<string, ChecklistFinding>,
  alignments: AlignmentByFile,
): { reused: Map<string, ChecklistFinding>; needEval: ChecklistItem[] } {
  const reused = new Map<string, ChecklistFinding>();
  const needEval: ChecklistItem[] = [];

  for (const item of items) {
    const baselineFinding = baselineFindingsByText.get(normalizeItemText(item.text));
    const remapped = baselineFinding ? remapFindingToCurrentPages(baselineFinding, alignments) : null;
    if (remapped) {
      reused.set(item.id, { ...remapped, itemId: item.id });
    } else {
      needEval.push(item);
    }
  }

  return { reused, needEval };
}
