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
 * 기준(과거 검토) 파일 하나가 현재 제출물의 어느 파일과 어떻게 대응되는지.
 * - "identical": 내용 해시가 완전히 같음 — 페이지 번호도 그대로(항등 매핑).
 * - "aligned": 페이지 내용(해시) 기준 최장 공통 부분수열(LCS)로 정렬한 결과.
 *   baselineToCurrent는 기준 검토의 페이지 번호 -> 현재 문서에서 같은 내용을 가진
 *   페이지 번호. 삽입·삭제·순서 변경으로 밀린 페이지도 내용만 같으면 대응됩니다.
 *
 * currentFileName: 대응된 현재 파일명. 업체가 재제출하며 파일명을 바꾸는 경우가
 * 흔하므로(날짜·버전 표기 등) 이름이 아니라 내용으로 매칭하며, 기준 파일명과 다를 수
 * 있습니다. 재사용하는 근거·페이지 참조의 파일명은 이 값으로 재작성해야 합니다.
 */
export type FileAlignment =
  | { kind: "identical"; currentFileName: string }
  | { kind: "aligned"; currentFileName: string; baselineToCurrent: Map<number, number> };

/** key: 기준(과거 검토)의 파일명. 항목이 없는 파일은 비교 불가(전체 변경 취급). */
export type AlignmentByFile = Map<string, FileAlignment>;

/**
 * 제출물 전체의 대응 결과.
 * - byFile: 파일 단위 대응 (이름 매칭 + 내용 교차 매칭).
 * - movedPages: 파일 분권·합본·페이지 이동으로 "다른 파일"로 옮겨간 페이지의 개별 대응
 *   (key: "기준파일명#페이지"). 내용 해시가 기준·현재 양쪽에서 유일한 페이지만 포함되므로
 *   표지·간지 같은 중복 페이지가 엉뚱하게 대응될 위험이 없습니다.
 */
export type SubmissionAlignment = {
  byFile: AlignmentByFile;
  movedPages: Map<string, { fileName: string; page: number }>;
};

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

/** 이름이 다른 파일끼리 내용으로 교차 매칭할 때 요구하는 최소 대응 페이지 수·비율. */
const MIN_CROSS_MATCH_PAGES = 3;
const MIN_CROSS_MATCH_RATIO = 0.3;

/** 두 파일을 내용으로 대응시킵니다. 대응 근거가 전혀 없으면 null. */
function alignPair(baseline: FileFingerprint, current: FileFingerprint): FileAlignment | null {
  if (baseline.contentHash && current.contentHash && baseline.contentHash === current.contentHash) {
    return { kind: "identical", currentFileName: current.originalName };
  }
  if (!baseline.pageHashes || !current.pageHashes) return null;
  if (baseline.pageHashes.length * current.pageHashes.length > MAX_ALIGNMENT_CELLS) return null;
  const baselineToCurrent = alignPagesByContent(baseline.pageHashes, current.pageHashes);
  if (baselineToCurrent.size === 0) return null;
  return { kind: "aligned", currentFileName: current.originalName, baselineToCurrent };
}

/**
 * 현재 파일들과 기준(과거) 검토의 파일들을 내용 기준으로 대응시킵니다.
 *
 * 1차로 같은 파일명끼리 비교하고, 남은 파일들은 이름이 달라도 내용으로 교차 매칭합니다 —
 * 업체가 "2024.12.03 접수용.pdf" -> "2025.01.10 최종.pdf"처럼 파일명을 바꿔 재제출하는
 * 것이 일반적이므로, 이름만 보고 "완전히 새 파일"로 취급하면 이전 판정을 전혀 재사용하지
 * 못하고 회차 간 판정 편차(충족 개수 요동)까지 생깁니다. 교차 매칭은 오매칭을 막기 위해
 * 대응 페이지가 임계값(최소 3페이지, 짧은 쪽의 30%) 이상일 때만 인정하며 1:1로만 맺습니다.
 */
export function computeFileAlignments(
  currentFiles: FileFingerprint[],
  baselineFiles: FileFingerprint[],
): SubmissionAlignment {
  const result: AlignmentByFile = new Map();
  const usedCurrentNames = new Set<string>();
  const currentByName = new Map(currentFiles.map((file) => [file.originalName, file]));
  const unmatchedBaselines: FileFingerprint[] = [];

  // 1차: 같은 파일명끼리
  for (const baseline of baselineFiles) {
    const current = currentByName.get(baseline.originalName);
    if (!current) {
      unmatchedBaselines.push(baseline);
      continue;
    }
    usedCurrentNames.add(current.originalName);
    const entry = alignPair(baseline, current);
    if (entry) result.set(baseline.originalName, entry);
  }

  // 2차: 이름이 다른 파일끼리 내용으로 교차 매칭 (파일명 변경 재제출 대응)
  for (const baseline of unmatchedBaselines) {
    let best: FileAlignment | null = null;
    let bestScore = 0;

    for (const current of currentFiles) {
      if (usedCurrentNames.has(current.originalName)) continue;
      const entry = alignPair(baseline, current);
      if (!entry) continue;

      if (entry.kind === "identical") {
        best = entry;
        bestScore = Number.MAX_SAFE_INTEGER;
        break;
      }

      const minPages = Math.min(baseline.pageHashes?.length ?? 0, current.pageHashes?.length ?? 0);
      const threshold = Math.max(MIN_CROSS_MATCH_PAGES, Math.ceil(minPages * MIN_CROSS_MATCH_RATIO));
      if (entry.baselineToCurrent.size < threshold) continue;
      if (entry.baselineToCurrent.size > bestScore) {
        best = entry;
        bestScore = entry.baselineToCurrent.size;
      }
    }

    if (best) {
      result.set(baseline.originalName, best);
      usedCurrentNames.add(best.currentFileName);
    }
  }

  // 3차: 파일 분권·합본·페이지 이동 대응 — 파일쌍 대응으로 커버되지 못한 기준 페이지를
  // 전역에서 탐색합니다 (예: 도서 1권을 2권으로 분권하면 뒷부분 페이지들이 "다른 파일"에
  // 있음). 내용 해시가 기준·현재 양쪽에서 유일하고 아직 다른 대응에 점유되지 않은
  // 페이지만 이동으로 인정해 오매칭을 방지합니다.
  const movedPages = new Map<string, { fileName: string; page: number }>();

  const baselineHashCount = new Map<string, number>();
  for (const file of baselineFiles) {
    for (const hash of file.pageHashes ?? []) {
      baselineHashCount.set(hash, (baselineHashCount.get(hash) ?? 0) + 1);
    }
  }

  const currentHashLocations = new Map<string, Array<{ fileName: string; page: number }>>();
  for (const file of currentFiles) {
    (file.pageHashes ?? []).forEach((hash, index) => {
      const list = currentHashLocations.get(hash) ?? [];
      list.push({ fileName: file.originalName, page: index + 1 });
      currentHashLocations.set(hash, list);
    });
  }

  // 파일쌍 대응이 이미 점유한 현재 페이지 집합
  const claimedCurrent = new Set<string>();
  for (const entry of result.values()) {
    if (entry.kind === "identical") {
      const current = currentByName.get(entry.currentFileName) ?? currentFiles.find((f) => f.originalName === entry.currentFileName);
      const pageCount = current?.pageHashes?.length ?? 0;
      for (let page = 1; page <= pageCount; page += 1) claimedCurrent.add(`${entry.currentFileName}#${page}`);
    } else {
      for (const page of entry.baselineToCurrent.values()) claimedCurrent.add(`${entry.currentFileName}#${page}`);
    }
  }

  for (const baseline of baselineFiles) {
    const entry = result.get(baseline.originalName);
    if (entry?.kind === "identical") continue; // 전 페이지가 이미 대응됨
    const hashes = baseline.pageHashes ?? [];
    for (let index = 0; index < hashes.length; index += 1) {
      const page = index + 1;
      if (entry?.kind === "aligned" && entry.baselineToCurrent.has(page)) continue;
      const hash = hashes[index];
      if (baselineHashCount.get(hash) !== 1) continue; // 기준 쪽에서 중복 → 모호
      const locations = currentHashLocations.get(hash) ?? [];
      if (locations.length !== 1) continue; // 현재 쪽에 없거나 중복 → 모호
      const target = locations[0];
      if (claimedCurrent.has(`${target.fileName}#${target.page}`)) continue;
      movedPages.set(`${baseline.originalName}#${page}`, target);
      claimedCurrent.add(`${target.fileName}#${target.page}`);
    }
  }

  return { byFile: result, movedPages };
}

/**
 * 제출물에 어떤 변경이라도 있는지 판별합니다 — 파일이 추가/제거됐거나, 어느 파일이든
 * 내용이 완전히 동일하지 않으면(페이지 추가·삭제·수정 포함) true.
 *
 * 반복 개선 워크플로우(보완 요구 -> 업체 수정 -> 재제출)에서 재사용 정책을 가르는
 * 기준입니다: 업체가 미충족 항목을 고치려고 "새 페이지를 추가"하는 경우, 기존 근거
 * 페이지는 안 바뀌었어도 개선 내용은 새 페이지에 있으므로, 문서에 변경이 있는 한
 * 비충족(미충족·부분충족·확인불가) 판정은 재사용하면 안 됩니다.
 */
export function hasAnyDocumentChange(
  currentFiles: FileFingerprint[],
  baselineFiles: FileFingerprint[],
  alignments: SubmissionAlignment,
): boolean {
  if (currentFiles.length !== baselineFiles.length) return true;

  // 모든 기준 파일이 현재 파일과 "identical"로 1:1 대응돼야 무변경 — 파일명은 바뀌어도
  // 내용이 같으면(이름만 바꾼 재제출) 무변경으로 봅니다.
  const matchedCurrentNames = new Set<string>();
  for (const baseline of baselineFiles) {
    const entry = alignments.byFile.get(baseline.originalName);
    if (!entry || entry.kind !== "identical") return true;
    if (matchedCurrentNames.has(entry.currentFileName)) return true;
    matchedCurrentNames.add(entry.currentFileName);
  }
  return matchedCurrentNames.size !== currentFiles.length;
}

export type BaselineCandidate<T> = {
  review: T;
  alignments: SubmissionAlignment;
  /** 현재 제출물과 완전히 동일한가 (파일 집합·내용 모두) */
  exactMatch: boolean;
};

/**
 * 전체 검토 이력에서 현재 제출물과 가장 잘 맞는 기준 검토를 고릅니다.
 *
 * 직전 검토 1건만 기준으로 삼으면 "초안 분석 -> 개선안 분석 -> 다시 초안 분석"처럼
 * 과거에 이미 분석한 파일이 다시 올라오는 경우를 놓칩니다(직전=개선안과 비교해
 * "변경됨"으로 오판 -> 전액 재분석). 한 번이라도 분석한 적 있는 제출물은 이력
 * 어디에 있든 찾아 재사용해야 합니다.
 *
 * 선택 규칙:
 * 1. 파일 집합·내용이 완전히 일치하는 검토가 있으면 그중 최신 것 (전액 재사용 가능).
 * 2. 없으면 페이지 대응 수(내용이 같다고 확인된 페이지 합)가 가장 많은 검토.
 *    동점이면 최신 검토 우선.
 * 3. 대응 페이지가 하나도 없으면 null (기준 없음 — 전체 새로 분석).
 */
export function selectBestBaseline<T extends { files: FileFingerprint[] }>(
  currentFiles: FileFingerprint[],
  reviews: T[],
): BaselineCandidate<T> | null {
  let best: BaselineCandidate<T> | null = null;
  let bestScore = 0;

  // 최신 -> 과거 순으로 순회: 완전 일치는 최신 것을 즉시 선택, 점수 동점도 최신 우선.
  for (const review of [...reviews].reverse()) {
    const alignments = computeFileAlignments(currentFiles, review.files);
    if (!hasAnyDocumentChange(currentFiles, review.files, alignments)) {
      return { review, alignments, exactMatch: true };
    }

    let score = alignments.movedPages.size;
    for (const entry of alignments.byFile.values()) {
      if (entry.kind === "identical") {
        const current = currentFiles.find((file) => file.originalName === entry.currentFileName);
        score += current?.pageHashes?.length ?? 1;
      } else {
        score += entry.baselineToCurrent.size;
      }
    }

    if (score > bestScore) {
      best = { review, alignments, exactMatch: false };
      bestScore = score;
    }
  }

  return best;
}

/**
 * 기준 검토의 (파일명, 페이지)를 현재 문서 기준으로 변환합니다. 파일명이 바뀐 재제출도
 * 내용 매칭으로 대응되며, 반환되는 fileName은 현재 파일명입니다. 그 페이지 내용이 현재
 * 문서에서 확인되지 않으면(삭제됐거나 내용이 바뀜) undefined를 반환합니다.
 */
export function mapBaselinePageToCurrent(
  alignments: SubmissionAlignment,
  fileName: string,
  baselinePage: number,
): { fileName: string; page: number } | undefined {
  const entry = alignments.byFile.get(fileName);
  if (entry) {
    if (entry.kind === "identical") return { fileName: entry.currentFileName, page: baselinePage };
    const page = entry.baselineToCurrent.get(baselinePage);
    if (page !== undefined) return { fileName: entry.currentFileName, page };
  }
  // 파일쌍 대응에 없으면 분권·합본으로 다른 파일로 이동한 페이지인지 확인
  return alignments.movedPages.get(`${fileName}#${baselinePage}`);
}

/**
 * 판정의 근거 페이지를 전부 현재 문서 기준 페이지 번호로 재매핑합니다. 근거가 하나도
 * 없는 판정(주로 "확인불가")은 재사용하지 않습니다 — 다른 곳에 새로 생긴 근거를 놓칠 수
 * 있어 보수적으로 항상 재분석합니다. 근거 페이지 중 하나라도 현재 문서에서 확인되지
 * 않으면(삭제됨 등) 재사용하지 않습니다.
 */
export function remapFindingToCurrentPages(
  finding: ChecklistFinding,
  alignments: SubmissionAlignment,
): ChecklistFinding | null {
  if (finding.evidence.length === 0) return null;

  const remappedEvidence: ChecklistEvidence[] = [];
  for (const entry of finding.evidence) {
    const mapped = mapBaselinePageToCurrent(alignments, entry.fileName, entry.page);
    if (mapped === undefined) return null;
    remappedEvidence.push({ ...entry, fileName: mapped.fileName, page: mapped.page });
  }

  return { ...finding, evidence: remappedEvidence };
}

/** 체크리스트 표 페이지 목록을 전부 현재 문서 기준으로 재매핑합니다. 하나라도 실패하면 null. */
export function remapChecklistPages(
  pages: ChecklistSourcePage[],
  alignments: SubmissionAlignment,
): ChecklistSourcePage[] | null {
  const remapped: ChecklistSourcePage[] = [];
  for (const page of pages) {
    const mapped = mapBaselinePageToCurrent(alignments, page.fileName, page.page);
    if (mapped === undefined) return null;
    remapped.push({ fileName: mapped.fileName, page: mapped.page });
  }
  return remapped;
}

/** 항목의 출처 페이지(source)를 현재 문서 기준으로 재매핑합니다. 실패하면 source만 제거(항목 자체는 유지). */
export function remapItem(item: ChecklistItem, alignments: SubmissionAlignment): ChecklistItem {
  if (!item.source) return item;
  const mapped = mapBaselinePageToCurrent(alignments, item.source.fileName, item.source.page);
  return mapped === undefined
    ? { ...item, source: undefined }
    : { ...item, source: { ...item.source, fileName: mapped.fileName, page: mapped.page } };
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
 * 현재 항목들을 "재사용 가능"과 "재분석 필요"로 나눕니다.
 *
 * 재사용 조건 (모두 만족해야 함):
 * 1. 항목 원문이 기준 검토의 항목과 일치.
 * 2. 판정의 근거 페이지 전부가 현재 문서에서 확인됨(페이지 번호는 현재 문서 기준으로
 *    재매핑됨 — 삽입·삭제로 번호가 밀린 경우 포함).
 * 3. documentChanged가 true(제출물 어딘가가 바뀜)인 경우, 판정이 "충족"일 것.
 *    충족 판정은 그 근거가 그대로 남아 있는 한 안전하게 재사용할 수 있지만,
 *    비충족(미충족·부분충족·확인불가) 판정은 업체가 보완 내용을 "새 페이지 추가"나
 *    "다른 페이지 수정"으로 반영했을 수 있어 — 기존 근거 페이지가 안 바뀌었어도 —
 *    반드시 재분석해야 합니다. 그렇지 않으면 보완이 반영돼도 판정이 영영 갱신되지
 *    않아, 재제출을 반복하며 충족률을 높이는 워크플로우가 성립하지 않습니다.
 *    (documentChanged가 false, 즉 완전히 동일한 재제출이면 아무것도 달라질 수 없으므로
 *    비충족 판정도 그대로 재사용합니다.)
 */
/** 항목이 재사용되지 못한 사유 (진단 로그용). */
export type ReuseSkipReason =
  | "원문불일치" // 기준 검토에 같은 원문의 항목이 없음
  | "비충족재분석" // 문서 변경이 있어 비충족 판정은 재분석 (정상 동작)
  | "근거없음" // 판정에 근거가 없어(주로 확인불가) 항상 재분석
  | "근거재매핑실패"; // 근거 페이지가 현재 문서에서 확인 안 됨 (삭제·변경 or 파일명 불일치)

export function partitionItemsForReuse(
  items: ChecklistItem[],
  baselineFindingsByText: Map<string, ChecklistFinding>,
  alignments: SubmissionAlignment,
  documentChanged: boolean,
): { reused: Map<string, ChecklistFinding>; needEval: ChecklistItem[]; skipReasons: Map<string, ReuseSkipReason> } {
  const reused = new Map<string, ChecklistFinding>();
  const needEval: ChecklistItem[] = [];
  const skipReasons = new Map<string, ReuseSkipReason>();

  for (const item of items) {
    const baselineFinding = baselineFindingsByText.get(normalizeItemText(item.text));
    if (!baselineFinding) {
      skipReasons.set(item.id, "원문불일치");
      needEval.push(item);
      continue;
    }
    if (!documentChanged) {
      // 제출물이 완전히 동일하면 결과가 달라질 수 없으므로 근거 유무·재매핑과 무관하게
      // 그대로 재사용합니다 (근거 없는 확인불가 판정 포함 — 페이지 번호도 항등).
      reused.set(item.id, { ...baselineFinding, itemId: item.id });
      continue;
    }
    if (baselineFinding.status !== "충족") {
      skipReasons.set(item.id, "비충족재분석");
      needEval.push(item);
      continue;
    }
    if (baselineFinding.evidence.length === 0) {
      skipReasons.set(item.id, "근거없음");
      needEval.push(item);
      continue;
    }
    const remapped = remapFindingToCurrentPages(baselineFinding, alignments);
    if (remapped) {
      reused.set(item.id, { ...remapped, itemId: item.id });
    } else {
      skipReasons.set(item.id, "근거재매핑실패");
      needEval.push(item);
    }
  }

  return { reused, needEval, skipReasons };
}
