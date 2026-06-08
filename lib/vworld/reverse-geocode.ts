import type { GeoPoint } from "./geocode";
import { buildVWorldParams, extractVWorldError, vworldGetJson } from "./http";

type VWorldReverseResponse = {
  response?: {
    status?: string;
    result?: Array<{
      type?: string;
      text?: string;
    }>;
  };
};

export async function reverseGeocodePoint(point: GeoPoint): Promise<string | null> {
  const params = buildVWorldParams({
    service: "address",
    request: "getAddress",
    version: "2.0",
    crs: "EPSG:4326",
    point: `${point.x},${point.y}`,
    format: "json",
    type: "both",
    zipcode: "false",
    simple: "false",
    key: process.env.VWORLD_API_KEY?.trim() ?? "",
  });

  const result = await vworldGetJson<VWorldReverseResponse>(
    `https://api.vworld.kr/req/address?${params.toString()}`,
    "역지오코딩",
  );

  if (!result.ok) return null;

  const vworldError = extractVWorldError(result.data);
  if (vworldError) return null;

  const records = result.data.response?.result;
  if (!Array.isArray(records) || records.length === 0) return null;

  const road = records.find((record) => record.type === "road")?.text;
  const parcel = records.find((record) => record.type === "parcel")?.text;
  return road ?? parcel ?? records[0]?.text ?? null;
}
