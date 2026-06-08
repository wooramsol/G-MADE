import { getVWorldApiKey, getVWorldDomain } from "./config";

export type GeoPoint = {
  x: number;
  y: number;
  crs: "EPSG:4326";
};

type VWorldAddressResponse = {
  response?: {
    status?: string;
    result?: {
      point?: {
        x?: string;
        y?: string;
      };
    };
  };
};

export async function geocodeAddress(address: string): Promise<GeoPoint | null> {
  const road = await geocodeAddressByType(address, "ROAD");
  if (road) return road;
  return geocodeAddressByType(address, "PARCEL");
}

async function geocodeAddressByType(address: string, type: "ROAD" | "PARCEL"): Promise<GeoPoint | null> {
  const key = getVWorldApiKey();
  if (!key) return null;

  const params = new URLSearchParams({
    service: "address",
    request: "getcoord",
    version: "2.0",
    crs: "EPSG:4326",
    address: address.trim(),
    refine: "true",
    simple: "false",
    format: "json",
    type,
    key,
    domain: getVWorldDomain(),
  });

  const response = await fetch(`https://api.vworld.kr/req/address?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as VWorldAddressResponse;
  if (payload.response?.status !== "OK") return null;

  const x = Number(payload.response.result?.point?.x);
  const y = Number(payload.response.result?.point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x, y, crs: "EPSG:4326" };
}
