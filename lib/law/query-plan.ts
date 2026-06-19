import type { EvaluationItem, Project } from "../types";
import { parseJurisdiction } from "./jurisdiction";

const ITEM_LAW_QUERIES: Record<string, string[]> = {
  "law-landscape": ["경관의 법률", "경관법 시행령"],
  "law-light": ["인공조명에 의한 빛공해 방지법"],
  "law-universal": ["장애인·노인·임산부 등의 편의증진 보장에 관한 법률"],
  "law-green": ["도시공원 및 녹지 등에 관한 법률"],
  "law-public-design": ["공공디자인의 진흥에 관한 법률"],
  "law-admin": ["행정절차법"],
};

const ITEM_ADMRUL_QUERIES: Record<string, string[]> = {
  "guide-skyline": ["경관계획수립지침"],
  "guide-facade": ["경관심의운영지침"],
  "guide-document": ["경관심의운영지침"],
  "guide-public-space": ["공공디자인 진흥"],
};

export type OrdinSearchPlan = {
  query: string;
  orgCode?: string | null;
};

/** 평가 항목·프로젝트 맥락에 맞는 국가법령 검색어만 생성합니다. (자치법규는 buildOrdinSearchPlans 사용) */
export function buildLawQueries(project?: Project, evaluationItems?: EvaluationItem[]): string[] {
  const queries = new Set<string>();

  for (const item of evaluationItems ?? []) {
    for (const lawId of item.lawIds ?? []) {
      if (lawId === "law-ordinance") continue;
      for (const query of ITEM_LAW_QUERIES[lawId] ?? []) {
        queries.add(query);
      }
    }
  }

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
export function buildOrdinSearchPlans(project?: Project, evaluationItems?: EvaluationItem[]): OrdinSearchPlan[] {
  const parsed = parseJurisdiction(project?.location ?? "");
  const topics = new Set<string>(["경관"]);

  if (project?.reviewType.includes("공공디자인")) {
    topics.add("공공디자인");
  }

  for (const item of evaluationItems ?? []) {
    if (item.lawIds?.includes("law-ordinance")) {
      topics.add("경관");
    }
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
export function buildAdmrulQueries(project?: Project, evaluationItems?: EvaluationItem[]): string[] {
  const queries = new Set<string>();

  for (const item of evaluationItems ?? []) {
    for (const guidelineId of item.guidelineIds ?? []) {
      for (const query of ITEM_ADMRUL_QUERIES[guidelineId] ?? []) {
        queries.add(query);
      }
    }
  }

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
export function buildAdmbylQueries(project?: Project, evaluationItems?: EvaluationItem[]): string[] {
  const queries = new Set<string>([
    "경관심의운영지침",
    "개발사업의 경관 체크리스트",
    "별지 제6호",
  ]);

  for (const item of evaluationItems ?? []) {
    if (item.guidelineIds?.includes("guide-document")) {
      queries.add("경관심의운영지침 별지");
      queries.add("제출도서");
    }
  }

  if (project?.reviewType.includes("경관")) {
    queries.add("경관 체크리스트");
  }

  return Array.from(queries);
}
