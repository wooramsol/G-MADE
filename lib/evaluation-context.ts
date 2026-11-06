import { toStoredReferenceLaws } from "./dedupe-reference-laws";
import { resolveOrdinanceLocation } from "./address/resolve-location-label";
import { guidelines as demoGuidelines, laws as demoLaws } from "./demo-data";
import { buildAdmbylReferenceUrl, buildAdmrulReferenceUrl, buildGuidelineReferenceUrl, buildLawReferenceUrl, buildOrdinReferenceUrl } from "./reference-links";
import { fetchAdmbylReferences } from "./law/admbyl-articles";
import { fetchAdmrulReferences, type FetchedAdmrulReference } from "./law/admrul-articles";
import { fetchLawReferences, type FetchedLawReference } from "./law/articles";
import { fetchOrdinReferences } from "./law/ordin-articles";
import { isLawApiConfigured } from "./law/config";
import { buildAdmbylQueries, buildAdmrulQueries, buildLawQueries, buildOrdinSearchPlans } from "./law/query-plan";
import {
  formatAdmbylSearchFailure,
  formatAdmrulSearchFailure,
  formatLawSearchFailure,
  formatOrdinSearchFailure,
  LAW_OC_MISSING_WARNING,
} from "./law/warnings";
import { searchAdmbylsBatch, searchAdmrulsBatch, searchLawsBatch, searchOrdinsBatch } from "./law/search-batch";
import { getProjectById } from "./project-store";
import { articleKey, articleLabel, isStandardArticle, loadLawArticles, selectRelevantArticles, type LawArticle, type LawSourceRef } from "./law/corpus";
import { parseJurisdiction } from "./law/jurisdiction";
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
  /** 경관지구 외 조회된 인접 공간정보 (용도지역·문화재 등) */
  nearbyFeatures?: Array<{ layerLabel: string; name: string }>;
  /** 주변 건축물 층수 통계 (브이월드 건물통합정보, 반경 250m) — 조화·규모 판단 참고 */
  nearbyBuildings?: import("./vworld/nearby-buildings").NearbyBuildingStats;
  /** 대상지 지형 통계 (위성 DEM 근사값) — 구릉지·옹벽 계열 판단 참고 */
  terrain?: import("./terrain/terrain-stats").TerrainStats;
  /** 대상지 동서·남북 지형 단면 (위성 DEM 근사값) — 결과 화면 차트용 */
  terrainProfiles?: import("./terrain/terrain-stats").TerrainProfiles;
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
  /** 조문 전문을 불러올 법령·조례 (검색 결과) */
  lawSources?: LawSourceRef[];
  /** 체크리스트 항목 id → 관련 조문 후보 라벨 (예: "양평군 경관 조례 제12조(색채)") */
  articleHints?: Record<string, string[]>;
};

export async function buildEvaluationContext(projectId?: string): Promise<EvaluationContext> {
  const project = projectId ? await getProjectById(projectId) : undefined;
  return buildEvaluationContextForProject(project);
}

/** 프로젝트 객체로 바로 조회 (점검용 미리보기에서 임의 주소로 시험할 때도 사용) */
export async function buildEvaluationContextForProject(project: Project | undefined): Promise<EvaluationContext> {
  const fetchedAt = new Date().toISOString();
  const warnings: string[] = [];

  const lawSources: LawSourceRef[] = [];
  const [spatial, referenceLaws, referenceGuidelines] = await Promise.all([
    project ? loadSpatialContext(project, warnings) : Promise.resolve(null),
    loadReferenceLaws(project, warnings, lawSources),
    loadReferenceGuidelines(project, warnings),
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
    lawSources,
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

    const [result, nearbyBuildings, terrainData] = await Promise.all([
      lookupLandscapeZoneByAddress(project.location, point) as Promise<LandscapeZoneLookupResult>,
      import("./vworld/nearby-buildings")
        .then((mod) => mod.getNearbyBuildingStats(point))
        .catch((error) => {
          warnings.push(
            `주변 건축물 현황 조회 실패 — 평가에 반영되지 않았습니다 (${error instanceof Error ? error.message : String(error)})`,
          );
          return null;
        }),
      import("./terrain/terrain-stats")
        .then((mod) => mod.getTerrainData(point))
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[terrain] 대상지 지형 조회 최종 실패: ${message}`);
          warnings.push(`대상지 지형(경사·표고) 조회 실패 — 평가에 반영되지 않았습니다 (${message})`);
          return null;
        }),
    ]);

    if (result.failedLayerLabels.length > 0) {
      warnings.push(
        `공간정보 일부 레이어(${result.failedLayerLabels.join(", ")}) 조회에 실패해 결과에 반영되지 않았습니다.`,
      );
    }

    const nearbySeen = new Set<string>();
    const nearbyFeatures = result.layerFeatures
      .filter((feature) => feature.layerId !== "landscape-zone" && feature.name)
      .filter((feature) => {
        const key = `${feature.layerLabel}::${feature.name}`;
        if (nearbySeen.has(key)) return false;
        nearbySeen.add(key);
        return true;
      })
      .slice(0, 8)
      .map((feature) => ({ layerLabel: feature.layerLabel, name: feature.name }));

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
      nearbyFeatures,
      nearbyBuildings: nearbyBuildings ?? undefined,
      terrain: terrainData?.stats ?? undefined,
      terrainProfiles: terrainData?.profiles ?? undefined,
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
  sources: LawSourceRef[] = [],
): Promise<FetchedLawReference[]> {
  if (!isLawApiConfigured()) {
    warnings.push(LAW_OC_MISSING_WARNING);
    return toStoredReferenceLaws(demoLawsToReferences());
  }

  const [nationalReferences, ordinanceReferences] = await Promise.all([
    loadNationalLawReferences(project, warnings, sources),
    loadOrdinanceReferences(project, warnings, sources),
  ]);

  const merged = [...nationalReferences, ...ordinanceReferences];
  if (merged.length === 0) {
    warnings.push("국가법령·자치법규 API 검색 결과가 없어 내장 법령 요약을 사용했습니다.");
    return toStoredReferenceLaws(demoLawsToReferences());
  }

  return toStoredReferenceLaws(merged, 15);
}

async function loadNationalLawReferences(
  project: Project | undefined,
  warnings: string[],
  sources: LawSourceRef[] = [],
): Promise<FetchedLawReference[]> {
  const queries = buildLawQueries(project);
  const { hits, failures } = await searchLawsBatch(queries, 4);
  for (const failure of failures) {
    warnings.push(formatLawSearchFailure(failure.query, failure.error));
  }

  const uniqueHits = dedupeLawHits(hits);
  if (uniqueHits.length === 0) return [];
  // 조문 전문을 볼 법령 — 경관 심의 기준이 들어 있는 법률 본법 위주 (시행규칙·정의 위주 법령 제외)
  for (const hit of uniqueHits) {
    if (/^(경관법|경관법 시행령|건축법|공공디자인의 진흥에 관한 법률|공공디자인의 진흥에 관한 법률 시행령)$/.test(hit.title.trim())) {
      sources.push({ kind: "law", id: hit.lawId, title: hit.title, sourceUrl: hit.sourceUrl });
    }
  }

  const references = (await fetchLawReferences(uniqueHits, 8)).filter(
    (reference) => buildLawReferenceUrl(reference.title, reference.sourceUrl) !== null,
  );
  if (references.length === 0) {
    warnings.push("국가법령 본문 조회에 실패해 검색 메타데이터를 사용했습니다.");
    return uniqueHitsToReferences(uniqueHits);
  }

  return references;
}

async function loadOrdinanceReferences(
  project: Project | undefined,
  warnings: string[],
  sources: LawSourceRef[] = [],
): Promise<FetchedLawReference[]> {
  const plans = buildOrdinSearchPlans(project);
  const { hits, failures } = await searchOrdinsBatch(plans, 4);
  for (const failure of failures) {
    warnings.push(formatOrdinSearchFailure(failure.query, failure.error));
  }

  // 사업 위치의 시·군·구와 그 상위 도의 자치법규만 (다른 지역 조례 제외)
  const parsedLocation = parseJurisdiction(project ? resolveOrdinanceLocation(project) : "");
  const localUnits = [parsedLocation.city, parsedLocation.district].filter((unit): unit is string => Boolean(unit));
  const uniqueHits = dedupeOrdinHits(hits).filter((hit) => {
    const owner = hit.jurisdiction.replace(/\s+/g, " ").trim();
    if (!owner) return true;
    if (localUnits.some((unit) => owner.endsWith(unit))) return true;
    return Boolean(parsedLocation.province && owner === parsedLocation.province);
  });
  for (const hit of uniqueHits.slice(0, 6)) {
    sources.push({ kind: "ordin", mst: hit.ordinSeq, title: hit.title, sourceUrl: hit.sourceUrl });
  }
  if (uniqueHits.length === 0) {
    if (project?.location) {
      warnings.push(
        `사업 위치(${resolveOrdinanceLocation(project)})에 해당하는 경관 조례 검색 결과가 없습니다.`,
      );
    }
    return [];
  }

  const references = (await fetchOrdinReferences(uniqueHits, 6)).filter(
    (reference) => buildOrdinReferenceUrl(reference.title, reference.sourceUrl) !== null,
  );
  if (references.length === 0) {
    warnings.push("자치법규 본문 조회에 실패해 검색 메타데이터를 사용했습니다.");
    return uniqueOrdinHitsToReferences(uniqueHits);
  }

  return references;
}

async function loadReferenceGuidelines(
  project: Project | undefined,
  warnings: string[],
): Promise<FetchedAdmrulReference[]> {
  if (!isLawApiConfigured()) {
    return demoGuidelinesToReferences();
  }

  const [admrulReferences, admbylReferences] = await Promise.all([
    loadAdmrulGuidelineReferences(project, warnings),
    loadAdmbylGuidelineReferences(project, warnings),
  ]);

  const merged = [...admrulReferences, ...admbylReferences];
  if (merged.length === 0) {
    warnings.push("행정규칙·별표 API 검색 결과가 없어 내장 지침 요약을 사용했습니다.");
    return demoGuidelinesToReferences();
  }

  return merged;
}

async function loadAdmrulGuidelineReferences(
  project: Project | undefined,
  warnings: string[],
): Promise<FetchedAdmrulReference[]> {
  const queries = buildAdmrulQueries(project);
  const { hits, failures } = await searchAdmrulsBatch(queries, 3);
  for (const failure of failures) {
    warnings.push(formatAdmrulSearchFailure(failure.query, failure.error));
  }

  const uniqueHits = dedupeAdmrulHits(hits);
  if (uniqueHits.length === 0) return [];

  const references = (await fetchAdmrulReferences(uniqueHits, 5)).filter(
    (reference) => buildAdmrulReferenceUrl(reference.title, reference.sourceUrl) !== null,
  );
  if (references.length === 0) {
    warnings.push("행정규칙 본문 조회에 실패해 검색 메타데이터를 사용했습니다.");
    return uniqueAdmrulHitsToReferences(uniqueHits);
  }

  return references;
}

async function loadAdmbylGuidelineReferences(
  project: Project | undefined,
  warnings: string[],
): Promise<FetchedAdmrulReference[]> {
  const queries = buildAdmbylQueries(project);
  const { hits, failures } = await searchAdmbylsBatch(queries, 3, { kind: "2" });
  for (const failure of failures) {
    warnings.push(formatAdmbylSearchFailure(failure.query, failure.error));
  }

  const uniqueHits = dedupeAdmbylHits(hits);
  if (uniqueHits.length === 0) return [];

  const references = (await fetchAdmbylReferences(uniqueHits, 4)).filter(
    (reference) => buildAdmbylReferenceUrl(reference.title, reference.sourceUrl) !== null,
  );
  if (references.length === 0) {
    warnings.push("별표·서식 본문 조회에 실패해 검색 메타데이터를 사용했습니다.");
    return uniqueAdmbylHitsToReferences(uniqueHits);
  }

  return references;
}

function dedupeOrdinHits<T extends { ordinSeq: string }>(hits: T[]): T[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.ordinSeq)) return false;
    seen.add(hit.ordinSeq);
    return true;
  });
}

function dedupeAdmbylHits<T extends { bylSeq: string }>(hits: T[]): T[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.bylSeq)) return false;
    seen.add(hit.bylSeq);
    return true;
  });
}

function uniqueOrdinHitsToReferences(
  hits: Array<{
    ordinSeq: string;
    title: string;
    jurisdiction: string;
    enforcementDate: string;
    sourceUrl: string;
  }>,
): FetchedLawReference[] {
  return hits.flatMap((hit) => {
    if (!hit.sourceUrl) return [];

    return [
      {
        id: `ordin-${hit.ordinSeq}`,
        title: hit.title,
        article: hit.enforcementDate ? `시행 ${hit.enforcementDate}` : "현행",
        summary: `${hit.jurisdiction ? `${hit.jurisdiction} ` : ""}자치법규 검색 결과`,
        ministry: hit.jurisdiction,
        enforcementDate: hit.enforcementDate,
        sourceUrl: hit.sourceUrl,
        source: "law.go.kr" as const,
      },
    ];
  });
}

function uniqueAdmbylHitsToReferences(
  hits: Array<{
    bylSeq: string;
    title: string;
    relatedRuleTitle: string;
    ministry: string;
    annexNumber: string;
    annexKind: string;
    sourceUrl: string;
  }>,
): FetchedAdmrulReference[] {
  return hits.flatMap((hit) => {
    if (!hit.sourceUrl) return [];

    return [
      {
        id: `admbyl-${hit.bylSeq}`,
        title: hit.relatedRuleTitle ? `${hit.relatedRuleTitle} ${hit.title}` : hit.title,
        section: hit.annexNumber ? `별표 ${hit.annexNumber}` : hit.annexKind || "별표·서식",
        summary: `${hit.ministry ? `${hit.ministry} 소관 ` : ""}행정규칙 별표·서식 검색 결과`,
        ministry: hit.ministry,
        enforcementDate: "",
        sourceUrl: hit.sourceUrl,
        source: "law.go.kr" as const,
      },
    ];
  });
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


/** 항목이 아직 없을 때(한 번에 추출·평가하는 경로) 쓰는 경관 심의 주요 주제 */
const GENERIC_TOPICS = [
  "건축물 색채 외벽", "야간경관 조명", "옥외광고물 간판", "조경 녹지 식재", "높이 층수 스카이라인",
  "건축선 후퇴", "담장 울타리", "옹벽 지형", "보행 가로 공개공지", "옥상 설비", "조망 통경축", "재료 마감",
  "자연경관 하천 산림", "공공시설물", "경관심의 대상",
].map((text, index) => ({ id: `topic-${index + 1}`, text }));

/**
 * 법령·조례 전문을 불러와 체크리스트 항목과 관련된 조문 원문만 평가 맥락에 넣는다.
 * 실패해도 기존 요약 목록으로 진행 (평가를 막지 않음).
 */
export async function attachRelevantLawArticles(
  context: EvaluationContext,
  items: Array<{ id: string; text: string; category?: string }> | null,
): Promise<void> {
  const sources = context.lawSources ?? [];
  if (sources.length === 0) return;
  try {
    const loaded = await Promise.race([
      Promise.all(sources.map((source) => loadLawArticles(source).catch(() => [] as LawArticle[]))),
      new Promise<LawArticle[][]>((resolve) => setTimeout(() => resolve([]), 25_000)),
    ]);
    const corpus = loaded.flat();
    if (corpus.length === 0) {
      context.warnings.push("법령·조례 조문 전문을 불러오지 못해 법령 목록 요약만 참고했습니다.");
      return;
    }
    const { articles, byItem } = selectRelevantArticles(corpus, items && items.length > 0 ? items : GENERIC_TOPICS, {
      perItem: 3,
      limit: 26,
    });
    if (articles.length === 0) return;
    const labelByKey = new Map(articles.map((article) => [articleKey(article), `${article.lawTitle} ${articleLabel(article)}`]));
    context.referenceLaws = articles.map((article) => ({
      id: `article-${articleKey(article)}`,
      title: article.lawTitle,
      article: articleLabel(article),
      // 심의 기준 조문(예: 색채·조명·조경 기준을 담은 시행규칙)은 본문을 더 길게 전달
      summary:
        (/별표\s*\d+\s*에\s*(의한다|따른다)/.test(article.text)
          ? "※ 세부 기준은 별표(첨부 파일)에 있으며 원문이 제공되지 않음 — 별표 내용을 추정해 인용하지 말 것. "
          : "") + article.text.slice(0, isStandardArticle(article) ? 2500 : 700),
      ministry: "",
      enforcementDate: "",
      sourceUrl: article.sourceUrl,
      source: "law.go.kr" as const,
    }));
    if (items && items.length > 0) {
      const hints: Record<string, string[]> = {};
      for (const [itemId, keys] of byItem) {
        const labels = keys.map((key) => labelByKey.get(key)).filter((label): label is string => Boolean(label));
        if (labels.length > 0) hints[itemId] = labels;
      }
      context.articleHints = hints;
    }
    const ordinCount = new Set(articles.filter((article) => article.kind === "ordin").map((article) => article.lawTitle)).size;
    console.log(`[law-corpus] 조문 ${corpus.length}개 중 ${articles.length}개 선정 (조례 ${ordinCount}종)`);
  } catch (error) {
    console.warn("[law-corpus] 조문 선정 실패:", error instanceof Error ? error.message : error);
  }
}
