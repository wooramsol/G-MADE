import { buildVWorldParams, extractVWorldError, vworldGetJson } from "./http";

export type AddressSearchResult = {
  id: string;
  label: string;
  category: "road" | "parcel" | "place";
  x: number;
  y: number;
  roadAddress?: string;
  parcelAddress?: string;
  adminRegion?: string;
};

type VWorldSearchResponse = {
  response?: {
    status?: string;
    result?: {
      items?: Array<Record<string, unknown>>;
    };
  };
};

export async function searchAddresses(query: string, category: "road" | "parcel"): Promise<AddressSearchResult[]> {
  return searchByType(query, "address", category);
}

export async function searchPlaces(query: string): Promise<AddressSearchResult[]> {
  return searchByType(query, "place", "place");
}

async function searchByType(
  query: string,
  type: "address" | "place",
  category: "road" | "parcel" | "place",
): Promise<AddressSearchResult[]> {
  const params = buildVWorldParams({
    service: "search",
    request: "search",
    version: "2.0",
    crs: "EPSG:4326",
    size: "10",
    page: "1",
    query: query.trim(),
    type,
    category: category === "place" ? "place" : category,
    format: "json",
    errorformat: "json",
    key: process.env.VWORLD_API_KEY?.trim() ?? "",
  });

  const result = await vworldGetJson<VWorldSearchResponse>(
    `https://api.vworld.kr/req/search?${params.toString()}`,
    `검색(${type}/${category})`,
  );

  if (!result.ok) {
    throw new Error(result.error ?? `주소 검색에 실패했습니다. (${query})`);
  }

  const vworldError = extractVWorldError(result.data);
  if (vworldError) {
    throw new Error(vworldError);
  }

  const items = result.data.response?.result?.items;
  if (!Array.isArray(items)) return [];

  return items
    .map((item, index) => mapSearchItem(item, index, category))
    .filter((item): item is AddressSearchResult => item !== null);
}

function mapSearchItem(
  item: Record<string, unknown>,
  index: number,
  category: "road" | "parcel" | "place",
): AddressSearchResult | null {
  const point = item.point as { x?: string | number; y?: string | number } | undefined;
  const x = Number(point?.x);
  const y = Number(point?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  const address = item.address as Record<string, unknown> | undefined;
  const roadAddress = pickAddressText(address, ["road", "roadAddress", "text"]);
  const parcelAddress = pickAddressText(address, ["parcel", "parcelAddress"]);
  const adminRegion = buildSearchAdminRegion(address);
  const title = typeof item.title === "string" ? item.title.trim() : "";

  const label =
    category === "place"
      ? title || roadAddress || parcelAddress || "선택한 장소"
      : category === "road"
        ? roadAddress || mergeAdminAndRoad(adminRegion, title) || parcelAddress || "도로명 주소"
        : parcelAddress || roadAddress || title || "지번 주소";

  return {
    id: `${category}-${index}-${x}-${y}`,
    label,
    category,
    x,
    y,
    roadAddress: roadAddress ?? undefined,
    parcelAddress: parcelAddress ?? undefined,
    adminRegion: adminRegion ?? undefined,
  };
}

function buildSearchAdminRegion(address: Record<string, unknown> | undefined): string | null {
  if (!address) return null;

  const parts = [
    pickAddressText(address, ["sido", "sidoName", "level1"]),
    pickAddressText(address, ["sigugun", "sigungu", "sgg", "level2"]),
    pickAddressText(address, ["eupmyeondong", "emd", "level3", "level4A"]),
  ].filter(Boolean) as string[];

  if (parts.length === 0) return null;
  return parts.join(" ").trim();
}

function mergeAdminAndRoad(adminRegion: string | null, roadOnly: string): string | null {
  if (!roadOnly.trim()) return null;
  if (!adminRegion) return roadOnly.trim();
  if (roadOnly.includes(adminRegion)) return roadOnly.trim();
  return `${adminRegion} ${roadOnly.trim()}`.trim();
}

function pickAddressText(address: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!address) return null;

  for (const key of keys) {
    const value = address[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  if (typeof address.text === "string" && address.text.trim()) {
    return address.text.trim();
  }

  return null;
}
