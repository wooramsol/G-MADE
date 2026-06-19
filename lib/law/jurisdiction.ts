/** 사업 위치 문자열에서 시·도·시·군·구 단위를 추출합니다. */

const PROVINCE_PATTERN =
  /^(서울특별시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)/;

const METRO_PROVINCES = new Set([
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
]);

/** law.go.kr 자치법규 검색 org 파라미터 (시·도 단위) */
const PROVINCE_ORG_CODES: Record<string, string> = {
  서울특별시: "6110000",
  부산광역시: "6260000",
  대구광역시: "6270000",
  인천광역시: "6280000",
  광주광역시: "6290000",
  대전광역시: "6300000",
  울산광역시: "6310000",
  세종특별자치시: "5690000",
  경기도: "6410000",
  강원특별자치도: "6420000",
  충청북도: "6430000",
  충청남도: "6440000",
  전북특별자치도: "6450000",
  전라남도: "6460000",
  경상북도: "6470000",
  경상남도: "6480000",
  제주특별자치도: "6490000",
};

export type ParsedJurisdiction = {
  province: string | null;
  city: string | null;
  district: string | null;
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
    const unitMatch = rest.match(/^([가-힣]+(?:시|군|구))/);
    if (!unitMatch) break;
    adminUnits.push(unitMatch[1]);
    rest = rest.slice(unitMatch[1].length).trim();
  }

  const isMetro = province ? METRO_PROVINCES.has(province) : false;
  let city: string | null = null;
  let district: string | null = null;

  if (isMetro) {
    district = adminUnits.find((unit) => unit.endsWith("구")) ?? adminUnits[0] ?? null;
  } else {
    city = adminUnits.find((unit) => unit.endsWith("시") || unit.endsWith("군")) ?? null;
    district = adminUnits.find((unit) => unit.endsWith("구")) ?? null;
  }

  const labels = new Set<string>();
  if (district) labels.add(district);
  if (city) labels.add(city);
  if (province) labels.add(province);

  return {
    province,
    city,
    district,
    orgCode: province ? (PROVINCE_ORG_CODES[province] ?? null) : null,
    labels: Array.from(labels),
  };
}

export function isMetroProvince(province: string | null): boolean {
  return Boolean(province && METRO_PROVINCES.has(province));
}
