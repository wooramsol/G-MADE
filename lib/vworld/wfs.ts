import { getVWorldApiKey } from "./config";
import type { GeoPoint } from "./geocode";
import { buildVWorldParams, extractVWorldError, vworldGetJson } from "./http";

export type SpatialLayerConfig = {
  id: string;
  typename: string;
  label: string;
  description: string;
};

export const SPATIAL_LAYERS: SpatialLayerConfig[] = [
  {
    id: "landscape-zone",
    typename: "lt_c_uq121",
    label: "경관지구",
    description: "경관법상 경관지구",
  },
  {
    id: "land-use-zone",
    typename: "lt_c_uq111",
    label: "용도지역",
    description: "국토계획법 용도지역",
  },
  {
    id: "cultural-heritage",
    typename: "lt_c_mcsp",
    label: "문화재",
    description: "문화재 보호구역",
  },
];

type GeoJsonFeature = {
  id?: string;
  type?: string;
  geometry?: GeoJSON.Geometry;
  properties?: Record<string, unknown>;
};

type GeoJsonCollection = {
  type?: string;
  features?: GeoJsonFeature[];
};

export type SpatialLayerFeature = {
  layerId: string;
  layerLabel: string;
  id: string;
  name: string;
  properties: Record<string, string>;
  geometry: GeoJSON.Geometry | null;
};

export class VWorldWfsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VWorldWfsError";
  }
}

export async function querySpatialLayersNearPoint(
  point: GeoPoint,
  layerIds?: string[],
): Promise<SpatialLayerFeature[]> {
  const selected =
    layerIds && layerIds.length > 0
      ? SPATIAL_LAYERS.filter((layer) => layerIds.includes(layer.id))
      : SPATIAL_LAYERS;

  const results = await Promise.all(
    selected.map((layer) => queryWfsLayer(point, layer).catch(() => [] as SpatialLayerFeature[])),
  );

  return results.flat();
}

async function queryWfsLayer(point: GeoPoint, layer: SpatialLayerConfig): Promise<SpatialLayerFeature[]> {
  const key = getVWorldApiKey();
  if (!key) return [];

  const buffer = 0.002;
  const bbox = [point.y - buffer, point.x - buffer, point.y + buffer, point.x + buffer].join(",");

  const params = buildVWorldParams({
    service: "WFS",
    request: "GetFeature",
    version: "1.1.0",
    typename: layer.typename,
    srsname: "EPSG:4326",
    bbox,
    output: "application/json",
    maxfeatures: "10",
    key,
  });

  const result = await vworldGetJson<GeoJsonCollection>(
    `https://api.vworld.kr/req/wfs?${params.toString()}`,
    `${layer.label}(WFS)`,
  );

  if (!result.ok) {
    throw new VWorldWfsError(result.error);
  }

  const vworldError = extractVWorldError(result.data);
  if (vworldError) {
    throw new VWorldWfsError(vworldError);
  }

  if (!Array.isArray(result.data.features)) {
    return [];
  }

  return result.data.features.map((feature, index) => mapWfsFeature(feature, layer, index));
}

function mapWfsFeature(
  feature: GeoJsonFeature,
  layer: SpatialLayerConfig,
  index: number,
): SpatialLayerFeature {
  const properties = feature.properties ?? {};
  const name =
    pickProperty(properties, ["uname", "UNAME", "name", "NAME", "ccba_knm", "CCBA_KNM", "zoneName"]) ??
    `${layer.label} ${index + 1}`;

  const flatProperties: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === null || value === undefined) continue;
    flatProperties[key] = String(value);
  }

  return {
    layerId: layer.id,
    layerLabel: layer.label,
    id: String(feature.id ?? `${layer.id}-${index}`),
    name,
    properties: flatProperties,
    geometry: feature.geometry ?? null,
  };
}

function pickProperty(properties: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = properties[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}
