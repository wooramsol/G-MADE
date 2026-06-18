import { toStoredReferenceLaws } from "./dedupe-reference-laws";
import { guidelines as demoGuidelines, laws as demoLaws } from "./demo-data";
import { buildAdmrulReferenceUrl, buildGuidelineReferenceUrl, buildLawReferenceUrl } from "./reference-links";
import { fetchAdmrulReferences, type FetchedAdmrulReference } from "./law/admrul-articles";
import { fetchLawReferences, type FetchedLawReference } from "./law/articles";
import { isLawApiConfigured } from "./law/config";
import { buildAdmrulQueries, buildLawQueries } from "./law/query-plan";
import { formatAdmrulSearchFailure, formatLawSearchFailure, LAW_OC_MISSING_WARNING } from "./law/warnings";
import { searchAdmrulsBatch, searchLawsBatch } from "./law/search-batch";
import { getProjectById } from "./project-store";
import type { EvaluationItem, Project, ProjectLocationPoint } from "./types";
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
  referenceGuidelines: FetchedAdmrulReference[];
  guidelines: Array<{ title: string; section: string; summary: string; sourceUrl?: string }>;
  lawSource: "law.go.kr" | "demo-fallback";
  guidelineSource: "law.go.kr" | "demo-fallback";
  fetchedAt: string;
  warnings: string[];
};

export async function buildEvaluationContext(
  projectId?: string,
  evaluationItems?: EvaluationItem[],
): Promise<EvaluationContext> {
  const fetchedAt = new Date().toISOString();
  const warnings: string[] = [];
  const project = projectId ? await getProjectById(projectId) : undefined;

  const [spatial, referenceLaws, referenceGuidelines] = await Promise.all([
    project ? loadSpatialContext(project, warnings) : Promise.resolve(null),
    loadReferenceLaws(project, warnings, evaluationItems),
    loadReferenceGuidelines(project, warnings, evaluationItems),
  ]);

  const guidelinesForPrompt =
    referenceGuidelines.length > 0
      ? referenceGuidelines.map((guide) => ({
          title: guide.title,
          section: guide.section,
          summary: guide.summary,
          sourceUrl: guide.sourceUrl,
        }))
      : demoGuidelines
          .filter((guide) => buildGuidelineReferenceUrl(guide) !== null)
          .slice(0, 6)
          .map((guide) => ({
            title: guide.title,
            section: guide.section,
            summary: guide.summary,
            sourceUrl: buildGuidelineReferenceUrl(guide) ?? undefined,
          }));

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
    referenceGuidelines,
    guidelines: guidelinesForPrompt,
    lawSource: referenceLaws[0]?.source === "law.go.kr" ? "law.go.kr" : "demo-fallback",
    guidelineSource: referenceGuidelines[0]?.source === "law.go.kr" ? "law.go.kr" : "demo-fallback",
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
  evaluationItems?: EvaluationItem[],
): Promise<FetchedLawReference[]> {
  if (!isLawApiConfigured()) {
    warnings.push(LAW_OC_MISSING_WARNING);
    return toStoredReferenceLaws(demoLawsToReferences());
  }

  const queries = buildLawQueries(project, evaluationItems);
  const { hits, failures } = await searchLawsBatch(queries, 4);
  for (const failure of failures) {
    warnings.push(formatLawSearchFailure(failure.query, failure.error));
  }

  const uniqueHits = dedupeLawHits(hits);
  if (uniqueHits.length === 0) {
    warnings.push("국가법령정보 API 검색 결과가 없어 내장 법령 요약을 사용했습니다.");
    return toStoredReferenceLaws(demoLawsToReferences());
  }

  const references = (await fetchLawReferences(uniqueHits, 10)).filter(
    (reference) => buildLawReferenceUrl(reference.title, reference.sourceUrl) !== null,
  );
  if (references.length === 0) {
    warnings.push("법령 본문 조회에 실패해 검색 메타데이터·내장 요약을 사용했습니다.");
    return toStoredReferenceLaws(uniqueHitsToReferences(uniqueHits));
  }

  return toStoredReferenceLaws(references, 12);
}

async function loadReferenceGuidelines(
  project: Project | undefined,
  warnings: string[],
  evaluationItems?: EvaluationItem[],
): Promise<FetchedAdmrulReference[]> {
  if (!isLawApiConfigured()) {
    return demoGuidelinesToReferences();
  }

  const queries = buildAdmrulQueries(project, evaluationItems);
  const { hits, failures } = await searchAdmrulsBatch(queries, 3);
  for (const failure of failures) {
    warnings.push(formatAdmrulSearchFailure(failure.query, failure.error));
  }

  const uniqueHits = dedupeAdmrulHits(hits);
  if (uniqueHits.length === 0) {
    warnings.push("행정규칙 API 검색 결과가 없어 내장 지침 요약을 사용했습니다.");
    return demoGuidelinesToReferences();
  }

  const references = (await fetchAdmrulReferences(uniqueHits, 6)).filter(
    (reference) => buildAdmrulReferenceUrl(reference.title, reference.sourceUrl) !== null,
  );
  if (references.length === 0) {
    warnings.push("행정규칙 본문 조회에 실패해 검색 메타데이터·내장 지침 요약을 사용했습니다.");
    return uniqueAdmrulHitsToReferences(uniqueHits);
  }

  return references;
}

function dedupeAdmrulHits<T extends { admRulSeq: string }>(hits: T[]): T[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.admRulSeq)) return false;
    seen.add(hit.admRulSeq);
    return true;
  });
}

function demoGuidelinesToReferences(): FetchedAdmrulReference[] {
  return demoGuidelines.flatMap((guide) => {
    const sourceUrl = buildGuidelineReferenceUrl(guide);
    if (!sourceUrl) return [];

    return [
      {
        id: guide.id,
        title: guide.title,
        section: guide.section,
        summary: guide.summary,
        ministry: "",
        enforcementDate: "",
        sourceUrl,
        source: "demo-fallback" as const,
      },
    ];
  });
}

function uniqueAdmrulHitsToReferences(
  hits: Array<{
    admRulSeq: string;
    title: string;
    ministry: string;
    enforcementDate: string;
    sourceUrl: string;
    ruleType: string;
  }>,
): FetchedAdmrulReference[] {
  return hits.flatMap((hit) => {
    if (!hit.sourceUrl) return [];

    return [
      {
        id: `admrul-${hit.admRulSeq}`,
        title: hit.title,
        section: "본문",
        summary: `${hit.ministry ? `${hit.ministry} 소관 ` : ""}${hit.ruleType || "행정규칙"} 검색 결과`,
        ministry: hit.ministry,
        enforcementDate: hit.enforcementDate,
        sourceUrl: hit.sourceUrl,
        source: "law.go.kr" as const,
      },
    ];
  });
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
  return demoLaws.flatMap((law) => {
    const sourceUrl = buildLawReferenceUrl(law.title);
    if (!sourceUrl) return [];

    return [
      {
        id: law.id,
        title: law.title,
        article: law.article,
        summary: law.summary,
        ministry: law.jurisdiction,
        enforcementDate: "",
        sourceUrl,
        source: "demo-fallback" as const,
      },
    ];
  });
}

function uniqueHitsToReferences(
  hits: Array<{ lawId: string; title: string; ministry: string; enforcementDate: string; sourceUrl: string }>,
): FetchedLawReference[] {
  return hits.flatMap((hit) => {
    if (!hit.sourceUrl) return [];

    return [
      {
        id: `law-${hit.lawId}`,
        title: hit.title,
        article: hit.enforcementDate ? `시행 ${hit.enforcementDate}` : "현행",
        summary: `${hit.ministry ? `${hit.ministry} 소관 ` : ""}국가법령정보센터 검색 결과`,
        ministry: hit.ministry,
        enforcementDate: hit.enforcementDate,
        sourceUrl: hit.sourceUrl,
        source: "law.go.kr" as const,
      },
    ];
  });
}
