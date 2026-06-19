import { searchAdmbyls, type AdmbylSearchHit } from "./admbyl-search";
import { sleepMs } from "./retry";
import { searchAdmruls, type AdmrulSearchHit } from "./admrul-search";
import { searchOrdins, type OrdinSearchHit } from "./ordin-search";
import type { OrdinSearchPlan } from "./query-plan";
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

export type OrdinSearchBatchResult = {
  hits: OrdinSearchHit[];
  failures: LawSearchBatchFailure[];
};

export type AdmbylSearchBatchResult = {
  hits: AdmbylSearchHit[];
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

/** 자치법규를 지역별 검색 계획에 따라 순차 조회합니다. */
export async function searchOrdinsBatch(
  plans: OrdinSearchPlan[],
  display = 4,
  options?: { delayMs?: number },
): Promise<OrdinSearchBatchResult> {
  const delayMs = options?.delayMs ?? DEFAULT_QUERY_DELAY_MS;
  const hits: OrdinSearchHit[] = [];
  const failures: LawSearchBatchFailure[] = [];

  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    if (index > 0) {
      await sleepMs(delayMs);
    }

    try {
      hits.push(
        ...(await searchOrdins(plan.query, {
          display,
          orgCode: plan.orgCode,
        })),
      );
    } catch (error) {
      failures.push({ query: plan.query, error });
    }
  }

  return { hits, failures };
}

/** 행정규칙 별표·서식을 순차 조회합니다. */
export async function searchAdmbylsBatch(
  queries: string[],
  display = 4,
  options?: { delayMs?: number; kind?: "1" | "2" | "3" },
): Promise<AdmbylSearchBatchResult> {
  const delayMs = options?.delayMs ?? DEFAULT_QUERY_DELAY_MS;
  const hits: AdmbylSearchHit[] = [];
  const failures: LawSearchBatchFailure[] = [];

  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    if (index > 0) {
      await sleepMs(delayMs);
    }

    try {
      hits.push(
        ...(await searchAdmbyls(query, {
          display,
          kind: options?.kind,
        })),
      );
    } catch (error) {
      failures.push({ query, error });
    }
  }

  return { hits, failures };
}
