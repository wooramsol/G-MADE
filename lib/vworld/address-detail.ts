import type { GeoPoint } from "./geocode";
import { buildVWorldParams, extractVWorldError, vworldGetJson } from "./http";

export type VWorldAddressStructure = {
  province: string | null;
  city: string | null;
  town: string | null;
  village: string | null;
  road: string | null;
  buildingNo: string | null;
};

export type ResolvedAddressDetail = {
  fullAddress: string;
  adminRegion: string;
  roadAddress: string | null;
  parcelAddress: string | null;
  structure: VWorldAddressStructure;
};

type VWorldReverseResponse = {
  response?: {
    status?: string;
    result?: Array<{
      type?: string;
      text?: string;
      structure?: Record<string, unknown>;
    }>;
  };
};

export function parseAddressStructure(raw: Record<string, unknown> | undefined): VWorldAddressStructure {
  if (!raw) {
    return {
      province: null,
      city: null,
      town: null,
      village: null,
      road: null,
      buildingNo: null,
    };
  }

  return {
    province: pickString(raw, ["level1"]),
    city: pickString(raw, ["level2"]),
    town: pickString(raw, ["level3", "level4A"]),
    village: pickString(raw, ["detail"]),
    road: pickString(raw, ["level4L"]),
    buildingNo: pickString(raw, ["level5"]),
  };
}

export function buildAdminRegion(structure: VWorldAddressStructure): string {
  const parts = [structure.province, structure.city, structure.town].filter(Boolean) as string[];
  return parts.join(" ").trim();
}

export function buildFullAddressFromStructure(structure: VWorldAddressStructure): string | null {
  const admin = buildAdminRegion(structure);
  const roadParts = [structure.road, structure.buildingNo].filter(Boolean);
  if (!admin && roadParts.length === 0) return null;
  if (roadParts.length === 0) return admin || null;
  return `${admin} ${roadParts.join(" ")}`.trim();
}

/** 도로명만 있는 주소에 행정구역 접두어가 없으면 붙입니다. */
export function mergeAdminRegion(adminRegion: string, address: string): string {
  const normalizedAdmin = adminRegion.trim();
  const normalizedAddress = address.trim();
  if (!normalizedAdmin) return normalizedAddress;
  if (!normalizedAddress) return normalizedAdmin;
  if (normalizedAddress.startsWith(normalizedAdmin)) return normalizedAddress;
  if (normalizedAdmin.startsWith(normalizedAddress)) return normalizedAdmin;
  return `${normalizedAdmin} ${normalizedAddress}`.trim();
}

export async function reverseGeocodeDetailed(point: GeoPoint): Promise<ResolvedAddressDetail | null> {
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
    "역지오코딩(상세)",
  );

  if (!result.ok) return null;

  const vworldError = extractVWorldError(result.data);
  if (vworldError) return null;

  const records = result.data.response?.result;
  if (!Array.isArray(records) || records.length === 0) return null;

  const roadRecord = records.find((record) => record.type === "road") ?? records[0];
  const parcelRecord = records.find((record) => record.type === "parcel");

  const roadStructure = parseAddressStructure(roadRecord?.structure as Record<string, unknown> | undefined);
  const parcelStructure = parseAddressStructure(parcelRecord?.structure as Record<string, unknown> | undefined);
  const structure = pickRicherStructure(roadStructure, parcelStructure);

  const roadAddress = roadRecord?.text?.trim() ?? buildFullAddressFromStructure(roadStructure);
  const parcelAddress = parcelRecord?.text?.trim() ?? buildFullAddressFromStructure(parcelStructure);
  const adminRegion = buildAdminRegion(structure);
  const fullAddress =
    roadAddress ??
    parcelAddress ??
    buildFullAddressFromStructure(structure) ??
    adminRegion ??
    null;

  if (!fullAddress) return null;

  return {
    fullAddress,
    adminRegion,
    roadAddress: roadAddress ?? null,
    parcelAddress: parcelAddress ?? null,
    structure,
  };
}

function pickRicherStructure(
  road: VWorldAddressStructure,
  parcel: VWorldAddressStructure,
): VWorldAddressStructure {
  const score = (structure: VWorldAddressStructure) =>
    [structure.province, structure.city, structure.town, structure.road, structure.buildingNo].filter(Boolean)
      .length;

  return score(road) >= score(parcel) ? road : parcel;
}

function pickString(raw: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
