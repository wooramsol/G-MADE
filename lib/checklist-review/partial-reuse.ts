import type { ChecklistFinding, ChecklistItem } from "./types";

/**
 * 문서 재제출 시 "완전히 같은 파일"이 아니어도, 실제로 바뀌지 않은 페이지에 근거한
 * 항목은 재분석을 건너뛰고 이전 검토 결과를 재사용하기 위한 순수 로직 모음입니다.
 * (I/O 없음 — PDF 읽기·해시 계산은 run-checklist-review.ts에서 수행 후 이 함수들에 전달)
 */

export type FileFingerprint = {
  originalName: string;
  contentHash?: string;
  /** 페이지별 내용 해시 (인덱스 i = 원본 p.(i+1)). PDF 비전 자산이 없는 파일은 undefined. */
  pageHashes?: string[];
};

/**
 * 파일명 -> "변경되지 않았다고 확인된" 페이지 정보.
 * - "all-unchanged": 파일 내용 해시가 완전히 같아 전체가 안전함.
 * - "all-changed": 비교 불가(새 파일·페이지 수 변경 등) — 전체를 안전하지 않은 것으로 취급.
 * - Set<number>: 이 페이지 번호들만 해시 비교로 안전을 "확인"함. 목록에 없는 페이지
 *   (범위를 벗어난 페이지 번호 포함)는 안전하지 않은 것으로 취급합니다 — 화이트리스트
 *   방식이라 존재하지 않는 페이지 번호를 실수로 "안전"으로 오판하지 않습니다.
 */
export type ChangedPagesByFile = Map<string, "all-unchanged" | "all-changed" | Set<number>>;

/**
 * 현재 파일들과 기준(직전) 검토의 파일들을 비교해 파일별로 "변경되지 않았다고 확인된
 * 페이지"를 계산합니다.
 * - 파일명이 기준에 없으면(새 파일) 전체를 안전하지 않은 것으로 취급.
 * - 내용 해시가 완전히 같으면 전체 안전(페이지 해시 계산·비교 불필요).
 * - 페이지 해시가 없거나(계산 불가·용량 초과) 페이지 수가 다르면(페이지 삽입·삭제로 번호가
 *   밀릴 위험) 안전하게 전체를 안전하지 않은 것으로 취급.
 * - 그 외에는 페이지별로 해시를 비교해 실제로 같은 페이지만 "확인됨"으로 기록합니다.
 */
export function computeChangedPages(
  currentFiles: FileFingerprint[],
  baselineFiles: FileFingerprint[],
): ChangedPagesByFile {
  const baselineByName = new Map(baselineFiles.map((file) => [file.originalName, file]));
  const result: ChangedPagesByFile = new Map();

  for (const file of currentFiles) {
    const baseline = baselineByName.get(file.originalName);
    if (!baseline) {
      result.set(file.originalName, "all-changed");
      continue;
    }

    if (baseline.contentHash && file.contentHash && baseline.contentHash === file.contentHash) {
      result.set(file.originalName, "all-unchanged");
      continue;
    }

    if (!baseline.pageHashes || !file.pageHashes || baseline.pageHashes.length !== file.pageHashes.length) {
      result.set(file.originalName, "all-changed");
      continue;
    }

    const unchangedPages = new Set<number>();
    for (let index = 0; index < file.pageHashes.length; index += 1) {
      if (file.pageHashes[index] === baseline.pageHashes[index]) unchangedPages.add(index + 1);
    }
    result.set(file.originalName, unchangedPages);
  }

  return result;
}

/** 해당 파일·페이지가 변경되지 않았다고 "확인"됐는지. 비교 대상 자체가 없으면 안전하게 false. */
export function isPageUnchanged(changed: ChangedPagesByFile, fileName: string, page: number): boolean {
  const entry = changed.get(fileName);
  if (entry === undefined || entry === "all-changed") return false;
  if (entry === "all-unchanged") return true;
  return entry.has(page);
}

/**
 * 이전 판정을 재사용해도 안전한지 판단합니다. 근거(evidence)가 하나도 없는 판정(주로
 * "확인불가")은 재사용하지 않습니다 — 다른 곳에 새로 생긴 근거를 놓칠 수 있어 보수적으로
 * 항상 재분석합니다. 근거가 있는 판정은, 그 근거 페이지가 전부 변경되지 않았다고 확인된
 * 경우에만 재사용합니다.
 */
export function isFindingReusable(finding: ChecklistFinding, changed: ChangedPagesByFile): boolean {
  if (finding.evidence.length === 0) return false;
  return finding.evidence.every((entry) => isPageUnchanged(changed, entry.fileName, entry.page));
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
 * 일치하고, 그 판정의 근거 페이지가 변경되지 않았다고 확인됐을 때만 재사용합니다.
 */
export function partitionItemsForReuse(
  items: ChecklistItem[],
  baselineFindingsByText: Map<string, ChecklistFinding>,
  changed: ChangedPagesByFile,
): { reused: Map<string, ChecklistFinding>; needEval: ChecklistItem[] } {
  const reused = new Map<string, ChecklistFinding>();
  const needEval: ChecklistItem[] = [];

  for (const item of items) {
    const baselineFinding = baselineFindingsByText.get(normalizeItemText(item.text));
    if (baselineFinding && isFindingReusable(baselineFinding, changed)) {
      reused.set(item.id, { ...baselineFinding, itemId: item.id });
    } else {
      needEval.push(item);
    }
  }

  return { reused, needEval };
}
