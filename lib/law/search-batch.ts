import { sleepMs } from "./retry";
import { searchAdmruls, type AdmrulSearchHit } from "./admrul-search";
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

export type AdmrulSearchBatchResult = {
  hits: AdmrulSearchHit[];
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

/** 행정규칙 키워드를 순차 조회합니다. */
export async function searchAdmrulsBatch(
  queries: string[],
  display = 3,
  options?: { delayMs?: number },
): Promise<AdmrulSearchBatchResult> {
  const delayMs = options?.delayMs ?? DEFAULT_QUERY_DELAY_MS;
  const hits: AdmrulSearchHit[] = [];
  const failures: LawSearchBatchFailure[] = [];

  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    if (index > 0) {
      await sleepMs(delayMs);
    }

    try {
      hits.push(...(await searchAdmruls(query, display)));
    } catch (error) {
      failures.push({ query, error });
    }
  }

  return { hits, failures };
}
