import type { GeoPoint } from "./geocode";
import { querySpatialLayersNearPoint, type SpatialLayerFeature } from "./wfs";

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
  layerFeatures: Array<{
    layerId: string;
    layerLabel: string;
    name: string;
    geometry: GeoJSON.Geometry | null;
  }>;
  source: "vworld-wfs";
  disclaimer: string;
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
  const layerFeatures = await querySpatialLayersNearPoint(point);
  const matchedZones = layerFeatures
    .filter((feature) => feature.layerId === "landscape-zone")
    .map((feature) => mapLayerToLandscapeZone(feature));

  return {
    address,
    point,
    inLandscapeZone: matchedZones.length > 0,
    matchedZones,
    layerFeatures: layerFeatures.map((feature) => ({
      layerId: feature.layerId,
      layerLabel: feature.layerLabel,
      name: feature.name,
      geometry: feature.geometry,
    })),
    source: "vworld-wfs",
    disclaimer: DISCLAIMER,
  };
}

function mapLayerToLandscapeZone(feature: SpatialLayerFeature): LandscapeZoneFeature {
  const props = feature.properties;
  return {
    id: feature.id,
    name: feature.name,
    code: props.ucode ?? props.UCODE ?? props.code ?? "-",
    jurisdiction: props.sido_name ?? props.SIDO_NAME ?? props.sigg_name ?? "-",
    designationYear: props.dyear ?? props.DYEAR ?? "-",
    geometryType: feature.geometry?.type ?? "Unknown",
  };
}
