import { getVWorldApiKey } from "./config";
import { buildVWorldParams, extractVWorldError, vworldGetJson } from "./http";

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
    error?: {
      text?: string;
      message?: string;
    };
  };
};

export class VWorldGeocodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VWorldGeocodeError";
  }
}

export async function geocodeAddress(address: string): Promise<GeoPoint> {
  const road = await geocodeAddressByType(address, "ROAD");
  if (road) return road;

  const parcel = await geocodeAddressByType(address, "PARCEL");
  if (parcel) return parcel;

  throw new VWorldGeocodeError(
    "주소를 좌표로 변환하지 못했습니다. 도로명주소를 더 구체적으로 입력해 주세요. (예: 서울특별시 중구 세종대로 175)",
  );
}

async function geocodeAddressByType(address: string, type: "ROAD" | "PARCEL"): Promise<GeoPoint | null> {
  const key = getVWorldApiKey();
  if (!key) return null;

  const params = buildVWorldParams({
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
  });

  const result = await vworldGetJson<VWorldAddressResponse>(
    `https://api.vworld.kr/req/address?${params.toString()}`,
    `지오코딩(${type})`,
  );

  if (!result.ok) {
    throw new VWorldGeocodeError(result.error);
  }

  const vworldError = extractVWorldError(result.data);
  if (vworldError) {
    throw new VWorldGeocodeError(vworldError);
  }

  if (result.data.response?.status === "NOT_FOUND") {
    return null;
  }

  if (result.data.response?.status !== "OK") {
    return null;
  }

  const x = Number(result.data.response.result?.point?.x);
  const y = Number(result.data.response.result?.point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x, y, crs: "EPSG:4326" };
}
