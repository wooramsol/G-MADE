import { sleepMs } from "./retry";
import { searchLaws, type LawSearchHit } from "./search";

const DEFAULT_QUERY_DELAY_MS = 350;

export type LawSearchBatchFailure = {
  query: string;
  error: unknown;
};

export type LawSearchBatchResult = {
  hits: LawSearchHit[];
  failures: LawSearchBatchFailure[];
};

/** 법령 키워드를 순차 조회해 law.go.kr 동시 연결 부담을 줄입니다. */
export async function searchLawsBatch(
  queries: string[],
  display = 4,
  options?: { delayMs?: number },
): Promise<LawSearchBatchResult> {
  const delayMs = options?.delayMs ?? DEFAULT_QUERY_DELAY_MS;
  const hits: LawSearchHit[] = [];
  const failures: LawSearchBatchFailure[] = [];

  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    if (index > 0) {
      await sleepMs(delayMs);
    }

    try {
      hits.push(...(await searchLaws(query, display)));
    } catch (error) {
      failures.push({ query, error });
    }
  }

  return { hits, failures };
}
