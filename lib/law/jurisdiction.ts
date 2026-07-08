import { METRO_PROVINCES, PROVINCE_ORG_CODES, PROVINCE_PATTERN } from "./jurisdiction-constants";

export type ParsedJurisdiction = {
  province: string | null;
  city: string | null;
  district: string | null;
  town: string | null;
  orgCode: string | null;
  /** 자치법규 검색에 쓸 행정구역 라벨 (구체적인 순) */
  labels: string[];
};

export function parseJurisdiction(location: string): ParsedJurisdiction {
  const normalized = location.trim();
  const provinceMatch = normalized.match(PROVINCE_PATTERN);
  const province = provinceMatch?.[1] ?? null;
  const remainder = province ? normalized.slice(province.length).trim() : normalized;

  const adminUnits: string[] = [];
  let rest = remainder;
  while (rest.length > 0) {
    const unitMatch = rest.match(/^([가-힣]+(?:시|군|구|읍|면|동|리))/);
    if (!unitMatch) break;
    adminUnits.push(unitMatch[1]);
    rest = rest.slice(unitMatch[1].length).trim();
  }

  const isMetro = province ? METRO_PROVINCES.has(province) : false;
  let city: string | null = null;
  let district: string | null = null;
  let town: string | null = null;

  if (isMetro) {
    district = adminUnits.find((unit) => unit.endsWith("구")) ?? adminUnits[0] ?? null;
    town = adminUnits.find((unit) => unit.endsWith("동") || unit.endsWith("읍") || unit.endsWith("면")) ?? null;
  } else {
    city = adminUnits.find((unit) => unit.endsWith("시") || unit.endsWith("군")) ?? null;
    district = adminUnits.find((unit) => unit.endsWith("구")) ?? null;
    town =
      adminUnits.find((unit) => unit.endsWith("읍") || unit.endsWith("면") || unit.endsWith("동")) ??
      adminUnits.find((unit) => unit.endsWith("리")) ??
      null;
  }

  const labels = new Set<string>();
  if (town) labels.add(town);
  if (district && district !== town) labels.add(district);
  if (city) labels.add(city);
  if (province) labels.add(province);

  return {
    province,
    city,
    district,
    town,
    orgCode: province ? (PROVINCE_ORG_CODES[province] ?? null) : null,
    labels: Array.from(labels),
  };
}

export function isMetroProvince(province: string | null): boolean {
  return Boolean(province && METRO_PROVINCES.has(province));
}
