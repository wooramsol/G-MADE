import { loadLawArticles, type LawArticle } from "./law/corpus";
import { parseJurisdiction } from "./law/jurisdiction";
import { searchOrdins } from "./law/ordin-search";
import { getVWorldApiKey } from "./vworld/config";
import { buildVWorldParams, vworldGetJson } from "./vworld/http";

/**
 * 법정 기준 자동 대조 — 사업지 용도지역을 조회하고, 도서의 사업 규모 수치를
 * 지역 도시·군계획 조례(없으면 국토계획법 시행령 상한)의 건폐율·용적률과 코드로 비교한다.
 * 계산은 AI가 아니라 코드가 하므로 수치 오판이 없다. 결과는 공무원 판단 보조용.
 */

export type LegalCheckStatus = "적합" | "초과 의심" | "확인 필요";

export type LegalCheckRow = {
  label: string;
  planned?: string;
  limit?: string;
  basis?: string;
  basisUrl?: string;
  status: LegalCheckStatus;
  note?: string;
};

export type LegalCheck = {
  zone?: string;
  parcel?: { pnu?: string; jibun?: string; address?: string };
  rows: LegalCheckRow[];
  checkedAt: string;
  disclaimer: string;
};

/** 국토의 계획 및 이용에 관한 법률 시행령 제84조(건폐율)·제85조(용적률) 상한 — 조례로 더 낮게 정할 수 있음 */
const STATUTORY_LIMITS: Record<string, { bcr: number; far: number }> = {
  제1종전용주거지역: { bcr: 50, far: 100 },
  제2종전용주거지역: { bcr: 50, far: 150 },
  제1종일반주거지역: { bcr: 60, far: 200 },
  제2종일반주거지역: { bcr: 60, far: 250 },
  제3종일반주거지역: { bcr: 50, far: 300 },
  준주거지역: { bcr: 70, far: 500 },
  중심상업지역: { bcr: 90, far: 1500 },
  일반상업지역: { bcr: 80, far: 1300 },
  근린상업지역: { bcr: 70, far: 900 },
  유통상업지역: { bcr: 80, far: 1100 },
  전용공업지역: { bcr: 70, far: 300 },
  일반공업지역: { bcr: 70, far: 350 },
  준공업지역: { bcr: 70, far: 400 },
  보전녹지지역: { bcr: 20, far: 80 },
  생산녹지지역: { bcr: 20, far: 100 },
  자연녹지지역: { bcr: 20, far: 100 },
  보전관리지역: { bcr: 20, far: 80 },
  생산관리지역: { bcr: 20, far: 80 },
  계획관리지역: { bcr: 40, far: 100 },
  농림지역: { bcr: 20, far: 80 },
  자연환경보전지역: { bcr: 20, far: 80 },
};

const ZONE_LAYERS = ["LT_C_UQ111", "LT_C_UQ112", "LT_C_UQ113", "LT_C_UQ114"];

type VWorldDataResponse = {
  response?: {
    status?: string;
    result?: { featureCollection?: { features?: Array<{ properties?: Record<string, unknown> }> } };
  };
};

async function queryPointLayer(data: string, x: number, y: number): Promise<Record<string, unknown>[]> {
  const key = getVWorldApiKey();
  if (!key) return [];
  const params = buildVWorldParams({
    service: "data",
    request: "GetFeature",
    data,
    geomFilter: `POINT(${x} ${y})`,
    crs: "EPSG:4326",
    geometry: "false",
    attribute: "true",
    size: "10",
    format: "json",
    key,
  });
  const result = await vworldGetJson<VWorldDataResponse>(`https://api.vworld.kr/req/data?${params.toString()}`, `용도지역(${data})`);
  if (!result.ok || result.data.response?.status !== "OK") return [];
  return (result.data.response.result?.featureCollection?.features ?? []).map((feature) => feature.properties ?? {});
}

/** 사업지 좌표가 속한 용도지역과 필지 */
export async function lookupLandUse(point: { x: number; y: number }) {
  const [zones, parcels] = await Promise.all([
    Promise.all(ZONE_LAYERS.map((layer) => queryPointLayer(layer, point.x, point.y).catch(() => []))).then((rows) => rows.flat()),
    queryPointLayer("LP_PA_CBND_BUBUN", point.x, point.y).catch(() => []),
  ]);
  const zone = zones.map((row) => String(row.uname ?? "").trim()).find((name) => name.length > 0);
  const parcel = parcels[0];
  return {
    zone,
    parcel: parcel
      ? { pnu: String(parcel.pnu ?? ""), jibun: String(parcel.jibun ?? ""), address: String(parcel.addr ?? "") }
      : undefined,
  };
}

/** "7,621.00㎡" → 7621 */
export function parseArea(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(㎡|m2|m²|제곱미터)?/i);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function parsePercent(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(%|퍼센트)/);
  return match ? Number(match[1]) : null;
}

/**
 * 조례 조문에서 해당 용도지역의 비율 한도 찾기.
 * 지역마다 표기가 달라 모두 처리: "계획관리지역 : 40퍼센트 이하", "일반상업지역：100분의 70",
 * "제2종 일반주거지역: 60퍼센트"(띄어쓰기). 완화·특례·성장관리구역 등 예외 조문은 제외하고
 * "용도지역 안에서의 건폐율" 같은 본 조문을 우선한다.
 */
export function findZoneLimit(articles: LawArticle[], zone: string, keyword: "건폐율" | "용적률"): { value: number; article: LawArticle } | null {
  const exception = /(특례|완화|예외|성장관리|지구단위|경관지구|취락|기존|공장|개발진흥|산업단지|녹지지역 등)/;
  const candidates = articles
    .filter((article) => article.title.includes(keyword) && !exception.test(article.title))
    .sort((a, b) => Number(!a.title.includes("용도지역")) - Number(!b.title.includes("용도지역")));
  const target = zone.replace(/\s+/g, "");
  for (const article of candidates) {
    const compact = article.text.replace(/\s+/g, "");
    let index = compact.indexOf(target);
    while (index >= 0) {
      // 더 긴 지역명의 일부인 경우 제외 (예: "관리지역"이 "계획관리지역" 안에 있는 경우)
      const before = compact.slice(Math.max(0, index - 1), index);
      if (!/[가-힣]/.test(before)) {
        const window = compact.slice(index + target.length, index + target.length + 24);
        const match = window.match(/^[:：]?(?:(\d+(?:\.\d+)?)(?:퍼센트|%)|100분의(\d+))/);
        if (match) {
          let raw = match[1] ?? match[2];
          // "100분의 70" 뒤에 다음 호 번호가 붙어 "100분의709." 처럼 이어진 경우 — 다음 호 번호를 떼어냄
          const listNo = compact.slice(Math.max(0, index - 4), index).match(/(\d{1,2})\.$/)?.[1];
          const after = window.slice(match[0].length, match[0].length + 1);
          if (match[2] && listNo && after === "." && raw.endsWith(String(Number(listNo) + 1)) && raw.length > String(Number(listNo) + 1).length) {
            raw = raw.slice(0, raw.length - String(Number(listNo) + 1).length);
          }
          return { value: Number(raw), article };
        }
      }
      index = compact.indexOf(target, index + target.length);
    }
  }
  return null;
}

async function loadLocalPlanningOrdinance(location: string): Promise<LawArticle[]> {
  const parsed = parseJurisdiction(location);
  const queries: Array<{ query: string; owner: string }> = [];
  // 군 지역도 "도시계획 조례"로 둔 곳이 많음 (예: 양평군 도시계획 조례)
  if (parsed.city) {
    queries.push({ query: `${parsed.city} 도시계획 조례`, owner: parsed.city });
    if (parsed.city.endsWith("군")) queries.push({ query: `${parsed.city} 군계획 조례`, owner: parsed.city });
  }
  if (parsed.province) queries.push({ query: `${parsed.province} 도시계획 조례`, owner: parsed.province });
  for (const { query, owner } of queries) {
    // 검색 결과가 가나다순이라 같은 이름의 구 조례들에 밀려 정확한 조례가 뒤로 감 — 넉넉히 받아 정확히 일치하는 것을 우선
    const hits = await searchOrdins(query, { display: 30 }).catch(() => []);
    const ownerOf = (jurisdiction: string) => jurisdiction.replace(/\s+/g, " ").trim();
    const hit =
      hits.find((entry) => entry.title.replace(/\s+/g, " ").trim() === query) ??
      hits.find(
        (entry) =>
          /(도시|군)계획 조례$/.test(entry.title.trim()) &&
          (ownerOf(entry.jurisdiction) === owner || ownerOf(entry.jurisdiction).endsWith(` ${owner}`)),
      );
    if (!hit) continue;
    const articles = await loadLawArticles({ kind: "ordin", mst: hit.ordinSeq, title: hit.title, sourceUrl: hit.sourceUrl }).catch(() => []);
    if (articles.length > 0) return articles;
  }
  return [];
}

function metricValue(metrics: Array<{ label: string; value: string }>, pattern: RegExp): string | undefined {
  return metrics.find((metric) => pattern.test(metric.label.replace(/\s+/g, "")))?.value;
}

function ratioRow(
  label: "건폐율" | "용적률",
  planned: number | null,
  stated: number | null,
  ordinanceLimit: { value: number; article: LawArticle } | null,
  statutory: number | undefined,
): LegalCheckRow {
  const plannedText = planned !== null ? `${planned.toFixed(2)}%` : stated !== null ? `${stated}% (도서 표기)` : undefined;
  const value = planned ?? stated;
  const notes: string[] = [];
  if (planned !== null && stated !== null && Math.abs(planned - stated) > 1) {
    notes.push(`도서 표기 ${stated}%와 면적으로 계산한 ${planned.toFixed(2)}%가 다릅니다.`);
  }
  if (value === null) {
    return { label, status: "확인 필요", note: "도서에서 면적·비율을 찾지 못했습니다." };
  }
  if (ordinanceLimit) {
    return {
      label,
      planned: plannedText,
      limit: `${ordinanceLimit.value}% 이하`,
      basis: `${ordinanceLimit.article.lawTitle} 제${ordinanceLimit.article.no}조(${ordinanceLimit.article.title})`,
      basisUrl: ordinanceLimit.article.sourceUrl,
      status: value > ordinanceLimit.value ? "초과 의심" : "적합",
      note: notes.join(" ") || undefined,
    };
  }
  if (statutory !== undefined) {
    const over = value > statutory;
    if (!over) notes.push("지역 조례 기준을 찾지 못해 법령 상한으로만 확인했습니다. 조례 기준이 더 낮을 수 있습니다.");
    return {
      label,
      planned: plannedText,
      limit: `${statutory}% 이하 (법령 상한)`,
      basis: `국토의 계획 및 이용에 관한 법률 시행령 ${label === "건폐율" ? "제84조" : "제85조"}`,
      status: over ? "초과 의심" : "확인 필요",
      note: notes.join(" ") || undefined,
    };
  }
  return { label, planned: plannedText, status: "확인 필요", note: "용도지역을 확인하지 못해 기준과 비교하지 못했습니다." };
}

export type LegalCheckPrep = {
  landUse: Awaited<ReturnType<typeof lookupLandUse>>;
  ordinance: LawArticle[];
};

/** 용도지역·도시계획 조례 조회 — 도서 수치와 무관하므로 분석 초반에 미리 시작 (시간 단축) */
export async function prepareLegalCheck(input: { point?: { x: number; y: number } | null; location: string }): Promise<LegalCheckPrep | null> {
  if (!input.point) return null;
  const [landUse, ordinance] = await Promise.all([
    lookupLandUse(input.point).catch(() => ({ zone: undefined, parcel: undefined })),
    loadLocalPlanningOrdinance(input.location).catch(() => [] as LawArticle[]),
  ]);
  return { landUse, ordinance };
}

export async function buildLegalCheck(input: {
  point?: { x: number; y: number } | null;
  location: string;
  metrics: Array<{ label: string; value: string }>;
}): Promise<LegalCheck | null> {
  const prep = await prepareLegalCheck(input);
  return prep ? finishLegalCheck(prep, input.metrics) : null;
}

/** 미리 조회한 기준과 도서 수치를 비교 (계산만 — 즉시 끝남) */
export function finishLegalCheck(prep: LegalCheckPrep, metrics: Array<{ label: string; value: string }>): LegalCheck {
  const { landUse, ordinance } = prep;
  const input = { metrics };
  const zone = landUse.zone;
  const siteArea = parseArea(metricValue(input.metrics, /^대지면적/));
  const buildingArea = parseArea(metricValue(input.metrics, /^건축면적/));
  const floorArea = parseArea(metricValue(input.metrics, /^(지상연면적|용적률산정|용적률산정용연면적)/)) ??
    parseArea(metricValue(input.metrics, /^연면적/));
  const statedBcr = parsePercent(metricValue(input.metrics, /^건폐율/));
  const statedFar = parsePercent(metricValue(input.metrics, /^용적률/));
  const bcr = siteArea && buildingArea ? (buildingArea / siteArea) * 100 : null;
  const far = siteArea && floorArea ? (floorArea / siteArea) * 100 : null;
  const statutory = zone ? STATUTORY_LIMITS[zone.replace(/\s+/g, "")] : undefined;

  const rows: LegalCheckRow[] = [
    ratioRow("건폐율", bcr, statedBcr, zone ? findZoneLimit(ordinance, zone, "건폐율") : null, statutory?.bcr),
    ratioRow("용적률", far, statedFar, zone ? findZoneLimit(ordinance, zone, "용적률") : null, statutory?.far),
  ];
  return {
    zone,
    parcel: landUse.parcel,
    rows,
    checkedAt: new Date().toISOString(),
    disclaimer:
      "용도지역은 브이월드, 기준은 국가법령정보센터 조문을 자동 조회해 코드로 비교한 결과입니다. 지구단위계획·개발행위허가 조건 등 개별 규제는 반영되지 않으므로 최종 판단은 담당 공무원이 확인해 주세요.",
  };
}
