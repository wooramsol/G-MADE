import type { ChecklistReview } from "./types";

/**
 * 도서 버전 — 제출본 단위로 검토 이력을 묶는다.
 *
 * - 버전 식별: 원본 바이트 해시(contentHash). 같은 파일을 다시 올리면(파일명이 달라도) 같은 버전,
 *   내용이 조금이라도 바뀌면 새 버전. 해시가 없는 옛 검토는 파일명+크기로 대신 식별.
 * - 순서: 각 버전이 처음 검토된 시각 순 → 자동 이름 "1차 제출", "2차 보완", "3차 보완"…
 *   (프로젝트에 저장한 이름이 있으면 그 이름)
 * - 이전 버전 대비 페이지 변화: 페이지별 내용 해시로 비교 — 내용이 바뀐 페이지, 새로 생긴 페이지,
 *   없어진 페이지를 센다. 페이지가 끼워지거나 빠져 번호가 밀려도 "내용"으로 대응하므로
 *   번호만 밀린 페이지는 동일로 본다.
 */

export type VersionPageChange = {
  /** 이전 버전과 내용이 같은 페이지 수 (번호가 밀렸어도 동일) */
  unchanged: number;
  /** 내용이 바뀐 페이지 수 (추정: 새 페이지와 사라진 페이지가 짝을 이루는 수) */
  modified: number;
  /** 새로 추가된 페이지 수 */
  added: number;
  /** 삭제된 페이지 수 */
  removed: number;
  /** 이번 버전에서 새로 생겼거나 바뀐 페이지 번호 (현재 버전 기준) */
  changedPages: number[];
  /** 페이지 수 */
  pageCount: number;
  previousPageCount: number;
};

export type DocumentVersion = {
  key: string;
  /** 1부터 시작하는 제출 순번 */
  order: number;
  label: string;
  defaultLabel: string;
  fileName: string;
  firstReviewedAt: string;
  /** 이 버전의 검토 (최신순) */
  reviews: ChecklistReview[];
  pageCount?: number;
  /** 직전 버전 대비 페이지 변화 (첫 버전이거나 비교 불가면 undefined) */
  change?: VersionPageChange;
};

export function versionKeyOfReview(review: ChecklistReview): string {
  const file = review.files[0];
  if (!file) return "unknown";
  return file.contentHash ? `h:${file.contentHash}` : `n:${file.originalName}:${file.sizeBytes}`;
}

export function defaultVersionLabel(order: number): string {
  return order === 1 ? "1차 제출" : `${order}차 보완`;
}

export function comparePageHashes(previous: string[], current: string[]): VersionPageChange {
  const remaining = new Map<string, number>();
  for (const hash of previous) remaining.set(hash, (remaining.get(hash) ?? 0) + 1);
  let unchanged = 0;
  const changedPages: number[] = [];
  current.forEach((hash, index) => {
    const left = remaining.get(hash) ?? 0;
    if (left > 0) {
      remaining.set(hash, left - 1);
      unchanged += 1;
    } else {
      changedPages.push(index + 1);
    }
  });
  const gone = [...remaining.values()].reduce((sum, count) => sum + count, 0);
  const fresh = changedPages.length;
  const modified = Math.min(fresh, gone);
  return {
    unchanged,
    modified,
    added: fresh - modified,
    removed: gone - modified,
    changedPages,
    pageCount: current.length,
    previousPageCount: previous.length,
  };
}

export function buildDocumentVersions(
  reviews: ChecklistReview[],
  labelOverrides: Record<string, string> = {},
): DocumentVersion[] {
  const byKey = new Map<string, ChecklistReview[]>();
  for (const review of reviews) {
    const key = versionKeyOfReview(review);
    const list = byKey.get(key) ?? [];
    list.push(review);
    byKey.set(key, list);
  }

  const versions = [...byKey.entries()].map(([key, list]) => {
    const sorted = [...list].sort((a, b) => new Date(b.reviewedAt).getTime() - new Date(a.reviewedAt).getTime());
    const first = sorted[sorted.length - 1];
    return { key, reviews: sorted, firstReviewedAt: first.reviewedAt };
  });
  versions.sort((a, b) => new Date(a.firstReviewedAt).getTime() - new Date(b.firstReviewedAt).getTime());

  let previousHashes: string[] | undefined;
  return versions.map((entry, index) => {
    const order = index + 1;
    const defaultLabel = defaultVersionLabel(order);
    const latest = entry.reviews[0];
    const hashes = entry.reviews.find((review) => review.files[0]?.pageHashes?.length)?.files[0]?.pageHashes;
    const change = previousHashes && hashes ? comparePageHashes(previousHashes, hashes) : undefined;
    if (hashes) previousHashes = hashes;
    else previousHashes = undefined;
    return {
      key: entry.key,
      order,
      defaultLabel,
      label: labelOverrides[entry.key]?.trim() || defaultLabel,
      fileName: latest.files[0]?.originalName ?? "",
      firstReviewedAt: entry.firstReviewedAt,
      reviews: entry.reviews,
      pageCount: hashes?.length,
      change,
    };
  });
}
