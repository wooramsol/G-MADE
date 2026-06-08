import { getVWorldApiKey } from "./config";
import type { GeoPoint } from "./geocode";
import { buildVWorldParams, extractVWorldError, vworldGetJson } from "./http";

export type LandscapeZoneFeature = {
  id: string;
  name: string;
  code: string;
  jurisdiction: string;
  designationYear: string;
  geometryType: string;
};

export type LandscapeZoneLookupResult = {
  address: string;
  point: GeoPoint;
  inLandscapeZone: boolean;
  matchedZones: LandscapeZoneFeature[];
  source: "vworld-wfs";
  disclaimer: string;
};

type GeoJsonFeature = {
  id?: string;
  type?: string;
  geometry?: { type?: string };
  properties?: Record<string, unknown>;
};

type GeoJsonCollection = {
  type?: string;
  features?: GeoJsonFeature[];
};

const DISCLAIMER =
  "브이월드 공공 공간정보를 참고한 결과이며 법적 효력이 없습니다. 최종 판단은 담당 공무원·심의위원회 확인이 필요합니다.";

export class VWorldLandscapeZoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VWorldLandscapeZoneError";
  }
}

export async function lookupLandscapeZoneByAddress(address: string, point: GeoPoint): Promise<LandscapeZoneLookupResult> {
  const matchedZones = await queryLandscapeZonesNearPoint(point);

  return {
    address,
    point,
    inLandscapeZone: matchedZones.length > 0,
    matchedZones,
    source: "vworld-wfs",
    disclaimer: DISCLAIMER,
  };
}

async function queryLandscapeZonesNearPoint(point: GeoPoint): Promise<LandscapeZoneFeature[]> {
  const key = getVWorldApiKey();
  if (!key) return [];

  const buffer = 0.002;
  const bbox = [point.y - buffer, point.x - buffer, point.y + buffer, point.x + buffer].join(",");

  const params = buildVWorldParams({
    service: "WFS",
    request: "GetFeature",
    version: "1.1.0",
    typename: "lt_c_uq121",
    srsname: "EPSG:4326",
    bbox,
    output: "application/json",
    maxfeatures: "10",
    key,
  });

  const result = await vworldGetJson<GeoJsonCollection>(
    `https://api.vworld.kr/req/wfs?${params.toString()}`,
    "경관지구(WFS)",
  );

  if (!result.ok) {
    throw new VWorldLandscapeZoneError(result.error);
  }

  const vworldError = extractVWorldError(result.data);
  if (vworldError) {
    throw new VWorldLandscapeZoneError(vworldError);
  }

  if (!Array.isArray(result.data.features)) {
    return [];
  }

  return result.data.features
    .map((feature, index) => mapLandscapeZoneFeature(feature, index))
    .filter((feature): feature is LandscapeZoneFeature => feature !== null);
}

function mapLandscapeZoneFeature(feature: GeoJsonFeature, index: number): LandscapeZoneFeature | null {
  const properties = feature.properties ?? {};
  const name = pickString(properties, ["uname", "UNAME", "name", "NAME"]) ?? `경관지구 ${index + 1}`;
  const code = pickString(properties, ["ucode", "UCODE", "code", "CODE"]) ?? "-";
  const jurisdiction = pickString(properties, ["sido_name", "SIDO_NAME", "sigg_name", "SIGG_NAME"]) ?? "-";
  const designationYear = pickString(properties, ["dyear", "DYEAR", "year", "YEAR"]) ?? "-";

  return {
    id: String(feature.id ?? `${code}-${index}`),
    name,
    code,
    jurisdiction,
    designationYear,
    geometryType: feature.geometry?.type ?? "Unknown",
  };
}

function pickString(properties: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}
