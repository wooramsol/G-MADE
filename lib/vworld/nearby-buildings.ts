import { getVWorldApiKey } from "./config";
import type { GeoPoint } from "./geocode";
import { buildVWorldParams, extractVWorldError, vworldGetJson } from "./http";

/**
 * 주변 건축물 현황 — 대상지 반경 안의 건물 층수 분포를 브이월드
 * 건물통합정보(WFS, lt_c_spbd)에서 집계한다.
 *
 * 용도: "주변 건축물과의 조화·스카이라인·규모" 계열 항목을 판정할 때,
 * 도면만 보고 추측하는 대신 "주변 평균 2.8층·최고 7층" 같은 실데이터를
 * 평가 컨텍스트로 제공한다 (참고용 — 법적 효력 없음).
 */

export type NearbyBuildingStats = {
  radiusM: number;
  /** 조회된 건물 수 (조회 상한에 걸리면 그 수까지만) */
  count: number;
  /** 층수 정보가 있는 건물 수 */
  withFloorData: number;
  avgFloors: number;
  maxFloors: number;
  /** 층수 구간별 동수: 1~2층 / 3~5층 / 6~10층 / 11층 이상 */
  buckets: { low: number; mid: number; high: number; tower: number };
  source: "vworld-spbd";
};

const RADIUS_M = 250;
/** 위도 1도 ≈ 111km — 반경을 도 단위로 근사 (경도는 위도 보정 생략, 참고 통계 용도) */
const RADIUS_DEG = RADIUS_M / 111_000;
const MAX_FEATURES = 900;

/** 층수 속성 후보 키 — 브이월드 응답 스키마 변형 대응 */
const FLOOR_KEYS = ["gro_flo_co", "GRO_FLO_CO", "grnd_flr", "GRND_FLR", "ground_floor"];

function readFloors(properties: Record<string, unknown>): number | null {
  for (const key of FLOOR_KEYS) {
    const raw = properties[key];
    const value = typeof raw === "string" ? Number(raw) : typeof raw === "number" ? raw : NaN;
    if (Number.isFinite(value) && value > 0 && value < 200) return Math.round(value);
  }
  return null;
}

type GeoJsonCollection = {
  features?: Array<{ properties?: Record<string, unknown> }>;
};

export async function getNearbyBuildingStats(point: GeoPoint): Promise<NearbyBuildingStats | null> {
  const key = getVWorldApiKey();
  if (!key) return null;

  const bbox = [
    point.y - RADIUS_DEG,
    point.x - RADIUS_DEG,
    point.y + RADIUS_DEG,
    point.x + RADIUS_DEG,
  ].join(",");

  const params = buildVWorldParams({
    service: "WFS",
    request: "GetFeature",
    version: "1.1.0",
    typename: "lt_c_spbd",
    srsname: "EPSG:4326",
    bbox,
    output: "application/json",
    maxfeatures: String(MAX_FEATURES),
    key,
  });

  const result = await vworldGetJson<GeoJsonCollection>(
    `https://api.vworld.kr/req/wfs?${params.toString()}`,
    "건물통합정보(WFS)",
  );
  if (!result.ok) throw new Error(result.error);
  const vworldError = extractVWorldError(result.data);
  if (vworldError) throw new Error(vworldError);

  const features = Array.isArray(result.data.features) ? result.data.features : [];
  if (features.length === 0) {
    return {
      radiusM: RADIUS_M,
      count: 0,
      withFloorData: 0,
      avgFloors: 0,
      maxFloors: 0,
      buckets: { low: 0, mid: 0, high: 0, tower: 0 },
      source: "vworld-spbd",
    };
  }

  // 진단: 층수 키가 하나도 안 잡히면 스키마가 바뀐 것 — 첫 건물의 키 목록을 남긴다
  const floors: number[] = [];
  for (const feature of features) {
    const value = readFloors(feature.properties ?? {});
    if (value !== null) floors.push(value);
  }
  if (floors.length === 0 && features[0]?.properties) {
    console.warn(
      `[vworld] 건물통합정보 층수 속성 미발견 — keys=${Object.keys(features[0].properties).slice(0, 20).join(",")}`,
    );
  }

  const buckets = { low: 0, mid: 0, high: 0, tower: 0 };
  for (const value of floors) {
    if (value <= 2) buckets.low += 1;
    else if (value <= 5) buckets.mid += 1;
    else if (value <= 10) buckets.high += 1;
    else buckets.tower += 1;
  }

  return {
    radiusM: RADIUS_M,
    count: features.length,
    withFloorData: floors.length,
    avgFloors: floors.length > 0 ? Math.round((floors.reduce((a, b) => a + b, 0) / floors.length) * 10) / 10 : 0,
    maxFloors: floors.length > 0 ? Math.max(...floors) : 0,
    buckets,
    source: "vworld-spbd",
  };
}

export type BuildingFootprint = {
  /** 지상층수 (정보 없으면 1로 간주) */
  floors: number;
  /** 대상지 기준 로컬 좌표(m) 외곽 링 — x=동(+), z=남(+) (Three.js 월드와 일치) */
  ring: Array<[number, number]>;
};

/**
 * 3D 지형 뷰용 — 반경 내 건물의 "외곽 형상 + 층수"를 대상지 기준 로컬
 * 좌표(m)로 변환해 반환한다.
 */
export async function getNearbyBuildingFootprints(
  point: GeoPoint,
  radiusM: number,
  maxCount = 500,
): Promise<BuildingFootprint[]> {
  const key = getVWorldApiKey();
  if (!key) return [];

  const radiusDeg = radiusM / 111_000;
  const bbox = [point.y - radiusDeg, point.x - radiusDeg, point.y + radiusDeg, point.x + radiusDeg].join(",");
  const params = buildVWorldParams({
    service: "WFS",
    request: "GetFeature",
    version: "1.1.0",
    typename: "lt_c_spbd",
    srsname: "EPSG:4326",
    bbox,
    output: "application/json",
    maxfeatures: String(Math.min(maxCount * 2, 1000)),
    key,
  });

  const result = await vworldGetJson<{
    features?: Array<{
      properties?: Record<string, unknown>;
      geometry?: { type?: string; coordinates?: unknown };
    }>;
  }>(`https://api.vworld.kr/req/wfs?${params.toString()}`, "건물형상(WFS)");
  if (!result.ok) throw new Error(result.error);
  const vworldError = extractVWorldError(result.data);
  if (vworldError) throw new Error(vworldError);

  const metersPerLng = 111_000 * Math.cos((point.y * Math.PI) / 180);
  const toLocal = (lng: number, lat: number): [number, number] => [
    Math.round((lng - point.x) * metersPerLng * 10) / 10,
    Math.round((point.y - lat) * 111_000 * 10) / 10, // z=남(+) — Three.js에서 -z=북과 일치
  ];

  const footprints: BuildingFootprint[] = [];
  for (const feature of result.data.features ?? []) {
    if (footprints.length >= maxCount) break;
    const geometry = feature.geometry;
    if (!geometry?.coordinates) continue;
    // Polygon: [ring][pt][lng,lat] / MultiPolygon: [poly][ring][pt] — 첫 외곽 링만 사용
    const raw =
      geometry.type === "MultiPolygon"
        ? (geometry.coordinates as number[][][][])[0]?.[0]
        : (geometry.coordinates as number[][][])[0];
    if (!Array.isArray(raw) || raw.length < 3) continue;
    const ring = raw
      .filter((pt) => Array.isArray(pt) && pt.length >= 2)
      .map((pt) => toLocal(pt[0], pt[1]));
    if (ring.length < 3) continue;
    footprints.push({ floors: readFloors(feature.properties ?? {}) ?? 1, ring });
  }
  return footprints;
}

/** 프롬프트·화면 공용 요약 문장 */
export function formatNearbyBuildingStats(stats: NearbyBuildingStats): string {
  if (stats.count === 0) return `반경 ${stats.radiusM}m 내 등록 건물 없음`;
  if (stats.withFloorData === 0) return `반경 ${stats.radiusM}m 내 건물 ${stats.count}동 (층수 정보 없음)`;
  const parts = [
    `총 ${stats.count}동(층수 확인 ${stats.withFloorData}동)`,
    `평균 지상 ${stats.avgFloors}층`,
    `최고 ${stats.maxFloors}층`,
    `분포 1~2층 ${stats.buckets.low} · 3~5층 ${stats.buckets.mid} · 6~10층 ${stats.buckets.high} · 11층+ ${stats.buckets.tower}`,
  ];
  return `반경 ${stats.radiusM}m: ${parts.join(" · ")}`;
}
