import type { EvaluationItem, Project } from "../types";

const ITEM_LAW_QUERIES: Record<string, string[]> = {
  "law-landscape": ["경관의 법률", "경관법 시행령"],
  "law-ordinance": ["경관 조례"],
  "law-light": ["인공조명에 의한 빛공해 방지법"],
  "law-universal": ["장애인·노인·임산부 등의 편의증진 보장에 관한 법률"],
  "law-green": ["도시공원 및 녹지 등에 관한 법률"],
  "law-public-design": ["공공디자인의 진흥에 관한 법률"],
};

function extractJurisdiction(location: string): string | null {
  const match = location.match(
    /^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)/,
  );
  return match?.[1] ?? null;
}

/** 평가 항목·프로젝트 맥락에 맞는 법령 검색어만 생성합니다. */
export function buildLawQueries(project?: Project, evaluationItems?: EvaluationItem[]): string[] {
  const queries = new Set<string>();

  for (const item of evaluationItems ?? []) {
    for (const lawId of item.lawIds ?? []) {
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
  }

  const jurisdiction = extractJurisdiction(project?.location ?? "");
  if (jurisdiction) {
    queries.add(`${jurisdiction} 경관 조례`);
  }

  if (queries.size === 0) {
    queries.add("경관의 법률");
    queries.add("경관법 시행령");
  }

  return Array.from(queries);
}
