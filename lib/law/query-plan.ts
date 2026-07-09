import type { Project } from "../types";
import { resolveOrdinanceLocation } from "../address/resolve-location-label";
import { parseJurisdiction } from "./jurisdiction";

export type OrdinSearchPlan = {
  query: string;
  orgCode?: string | null;
};

/** 평가 항목·프로젝트 맥락에 맞는 국가법령 검색어만 생성합니다. (자치법규는 buildOrdinSearchPlans 사용) */
export function buildLawQueries(project?: Project ): string[] {
  const queries = new Set<string>();


  if (project?.reviewType.includes("공공디자인")) {
    queries.add("공공디자인의 진흥에 관한 법률");
    queries.add("공공디자인 진흥법 시행령");
  }

  if (project?.reviewType.includes("경관")) {
    queries.add("경관의 법률");
    queries.add("경관법 시행령");
    queries.add("건축법");
    queries.add("국토계획법");
  }

  if (queries.size === 0) {
    queries.add("경관의 법률");
    queries.add("경관법 시행령");
  }

  return Array.from(queries);
}

/** 사업 위치의 시·군·구·도 단위별 자치법규 검색 계획을 생성합니다. */
export function buildOrdinSearchPlans(project?: Project ): OrdinSearchPlan[] {
  const locationText = project ? resolveOrdinanceLocation(project) : "";
  const parsed = parseJurisdiction(locationText);
  const topics = new Set<string>(["경관"]);

  if (project?.reviewType.includes("공공디자인")) {
    topics.add("공공디자인");
  }


  const plans: OrdinSearchPlan[] = [];
  const seen = new Set<string>();

  for (const label of parsed.labels) {
    for (const topic of topics) {
      const query = `${label} ${topic} 조례`;
      const key = `${query}::${parsed.orgCode ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      plans.push({ query, orgCode: parsed.orgCode });
    }
  }

  if (plans.length === 0) {
    for (const topic of topics) {
      plans.push({ query: `${topic} 조례`, orgCode: null });
    }
  }

  return plans;
}

/** 평가 항목·프로젝트 맥락에 맞는 행정규칙 검색어만 생성합니다. */
export function buildAdmrulQueries(project?: Project ): string[] {
  const queries = new Set<string>();


  if (project?.reviewType.includes("경관")) {
    queries.add("경관심의운영지침");
    queries.add("경관계획수립지침");
    queries.add("자연경관심의 지침");
  }

  if (project?.reviewType.includes("공공디자인")) {
    queries.add("공공디자인 진흥");
  }

  if (queries.size === 0) {
    queries.add("경관심의운영지침");
  }

  return Array.from(queries);
}

/** 행정규칙 별표·서식 검색어를 생성합니다. */
export function buildAdmbylQueries(project?: Project ): string[] {
  const queries = new Set<string>([
    "경관심의운영지침",
    "개발사업의 경관 체크리스트",
    "별지 제6호",
  ]);


  if (project?.reviewType.includes("경관")) {
    queries.add("경관 체크리스트");
  }

  return Array.from(queries);
}
