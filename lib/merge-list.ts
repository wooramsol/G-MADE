/** 목록 병합 — 내가 본 목록(base)에서 바꾼 부분만 현재 저장본에 반영 (다른 사람이 동시에 바꾼 항목은 지키기) */
export function mergeListChanges<T>(current: T[], base: T[], next: T[], keyOf: (item: T) => string): T[] {
  const baseKeys = new Set(base.map(keyOf));
  const nextKeys = new Set(next.map(keyOf));
  const removed = new Set([...baseKeys].filter((key) => !nextKeys.has(key)));
  const nextByKey = new Map(next.map((item) => [keyOf(item), item]));
  const baseByKey = new Map(base.map((item) => [keyOf(item), item]));
  const same = (a: T | undefined, b: T | undefined) => JSON.stringify(a) === JSON.stringify(b);
  const kept = current
    .filter((item) => !removed.has(keyOf(item)))
    .map((item) => {
      const key = keyOf(item);
      const mine = nextByKey.get(key);
      // 내가 실제로 바꾼 항목만 내 값으로 — 안 건드린 항목은 다른 사람이 바꾼 현재값 유지
      return mine && !same(mine, baseByKey.get(key)) ? mine : item;
    });
  const keptKeys = new Set(kept.map(keyOf));
  const added = next.filter((item) => !baseKeys.has(keyOf(item)) && !keptKeys.has(keyOf(item)));
  return [...kept, ...added];
}
