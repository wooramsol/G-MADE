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
    // 법령명 검색은 정식 명칭 기준 — "경관법"이 정식 명칭입니다 ("경관의 법률"은 0건).
    queries.add("경관법");
    queries.add("경관법 시행령");
    queries.add("건축법");
    queries.add("국토계획법");
  }

  if (queries.size === 0) {
    queries.add("경관법");
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

  // 읍·면·동·리에는 자치법규가 없으므로 시·군·구·도 단위만 검색
  const ordinanceLabels = parsed.labels.filter((label) => !/(읍|면|동|리)$/.test(label) || label === parsed.province);
  for (const label of ordinanceLabels) {
    for (const topic of topics) {
      const query = `${label} ${topic} 조례`;
      const key = `${query}::${parsed.orgCode ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // 시·도 기관코드 필터는 쓰지 않음 — 특별자치도 전환으로 코드가 바뀌어 결과가 0건이 되던 문제. 관할은 지자체명으로 거름
      plans.push({ query, orgCode: null });
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
