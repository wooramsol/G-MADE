import { guidelines, laws as demoLaws } from "./demo-data";
import { buildLawReferenceUrl } from "./reference-links";
import { fetchLawReferences, type FetchedLawReference } from "./law/articles";
import { isLawApiConfigured } from "./law/config";
import { searchLaws } from "./law/search";
import { getProjectById } from "./project-store";
import type { Project, ProjectLocationPoint } from "./types";
import { geocodeAddress } from "./vworld/geocode";
import { isVWorldConfigured } from "./vworld/config";
import { lookupLandscapeZoneByAddress, type LandscapeZoneLookupResult } from "./vworld/landscape-zone";

export type EvaluationSpatialContext = {
  address: string;
  point: ProjectLocationPoint;
  inLandscapeZone: boolean;
  matchedZones: Array<{
    name: string;
    code: string;
    jurisdiction: string;
    designationYear: string;
  }>;
  disclaimer: string;
};

export type EvaluationContext = {
  project?: Pick<Project, "id" | "name" | "location" | "reviewType" | "projectType" | "locationPoint">;
  spatial: EvaluationSpatialContext | null;
  referenceLaws: FetchedLawReference[];
  guidelines: Array<{ title: string; section: string; summary: string }>;
  lawSource: "law.go.kr" | "demo-fallback";
  fetchedAt: string;
  warnings: string[];
};

export async function buildEvaluationContext(projectId?: string): Promise<EvaluationContext> {
  const fetchedAt = new Date().toISOString();
  const warnings: string[] = [];
  const project = projectId ? await getProjectById(projectId) : undefined;

  const [spatial, referenceLaws] = await Promise.all([
    project ? loadSpatialContext(project, warnings) : Promise.resolve(null),
    loadReferenceLaws(project, warnings),
  ]);

  return {
    project: project
      ? {
          id: project.id,
          name: project.name,
          location: project.location,
          reviewType: project.reviewType,
          projectType: project.projectType,
          locationPoint: project.locationPoint,
        }
      : undefined,
    spatial,
    referenceLaws,
    guidelines: guidelines.slice(0, 6).map((guide) => ({
      title: guide.title,
      section: guide.section,
      summary: guide.summary,
    })),
    lawSource: referenceLaws[0]?.source === "law.go.kr" ? "law.go.kr" : "demo-fallback",
    fetchedAt,
    warnings,
  };
}

async function loadSpatialContext(
  project: Project,
  warnings: string[],
): Promise<EvaluationSpatialContext | null> {
  if (!isVWorldConfigured()) {
    warnings.push("VWORLD_API_KEY가 없어 경관지구 공간정보를 평가에 반영하지 못했습니다.");
    return null;
  }

  try {
    const point = project.locationPoint
      ? { x: project.locationPoint.x, y: project.locationPoint.y, crs: "EPSG:4326" as const }
      : await geocodeAddress(project.location);

    const result: LandscapeZoneLookupResult = await lookupLandscapeZoneByAddress(project.location, point);

    return {
      address: result.address,
      point: {
        x: result.point.x,
        y: result.point.y,
        source: project.locationPoint?.source ?? "address",
        note: project.locationPoint?.note,
      },
      inLandscapeZone: result.inLandscapeZone,
      matchedZones: result.matchedZones.map((zone) => ({
        name: zone.name,
        code: zone.code,
        jurisdiction: zone.jurisdiction,
        designationYear: zone.designationYear,
      })),
      disclaimer: result.disclaimer,
    };
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? `경관지구 조회 실패: ${error.message}`
        : "경관지구 조회 중 오류가 발생했습니다.",
    );
    return null;
  }
}

async function loadReferenceLaws(
  project: Project | undefined,
  warnings: string[],
): Promise<FetchedLawReference[]> {
  if (!isLawApiConfigured()) {
    warnings.push("LAW_OC가 없어 국가법령정보 API 대신 내장 법령 요약을 사용했습니다.");
    return demoLawsToReferences();
  }

  const queries = buildLawQueries(project);
  const hits = (
    await Promise.all(queries.map((query) => searchLaws(query, 4)))
  ).flat();

  const uniqueHits = dedupeLawHits(hits);
  if (uniqueHits.length === 0) {
    warnings.push("국가법령정보 API 검색 결과가 없어 내장 법령 요약을 사용했습니다.");
    return demoLawsToReferences();
  }

  const references = await fetchLawReferences(uniqueHits, 6);
  if (references.length === 0) {
    warnings.push("법령 본문 조회에 실패해 검색 메타데이터·내장 요약을 사용했습니다.");
    return uniqueHitsToReferences(uniqueHits);
  }

  return references;
}

function buildLawQueries(project?: Project): string[] {
  const queries = new Set<string>([
    "경관의 법률",
    "경관법 시행령",
    "공공디자인의 진흥에 관한 법률",
    "공공디자인 진흥법 시행령",
    "인공조명에 의한 빛공해 방지법",
    "도시공원 및 녹지 등에 관한 법률",
    "장애인·노인·임산부 등의 편의증진 보장에 관한 법률",
    "건축법",
  ]);

  if (project?.reviewType.includes("공공디자인")) {
    queries.add("공공디자인 진흥");
  }
  if (project?.reviewType.includes("경관")) {
    queries.add("경관법 시행령");
  }

  const jurisdiction = extractJurisdiction(project?.location ?? "");
  if (jurisdiction) {
    queries.add(`${jurisdiction} 경관 조례`);
    queries.add(`${jurisdiction} 도시계획 조례`);
  }

  return Array.from(queries);
}

function extractJurisdiction(location: string): string | null {
  const match = location.match(
    /^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)/,
  );
  return match?.[1] ?? null;
}

function dedupeLawHits<T extends { lawId: string }>(hits: T[]): T[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.lawId)) return false;
    seen.add(hit.lawId);
    return true;
  });
}

function demoLawsToReferences(): FetchedLawReference[] {
  return demoLaws.map((law) => ({
    id: law.id,
    title: law.title,
    article: law.article,
    summary: law.summary,
    ministry: law.jurisdiction,
    enforcementDate: "",
    sourceUrl: buildLawReferenceUrl(law.title) ?? `https://www.law.go.kr/법령/${encodeURIComponent(law.title)}`,
    source: "demo-fallback",
  }));
}

function uniqueHitsToReferences(
  hits: Array<{ lawId: string; title: string; ministry: string; enforcementDate: string; sourceUrl: string }>,
): FetchedLawReference[] {
  return hits.map((hit) => ({
    id: `law-${hit.lawId}`,
    title: hit.title,
    article: hit.enforcementDate ? `시행 ${hit.enforcementDate}` : "현행",
    summary: `${hit.ministry ? `${hit.ministry} 소관 ` : ""}국가법령정보센터 검색 결과`,
    ministry: hit.ministry,
    enforcementDate: hit.enforcementDate,
    sourceUrl: hit.sourceUrl,
    source: "law.go.kr",
  }));
}
