import type { GeoPoint } from "@/lib/vworld/geocode";

/**
 * 대상지 지형(경사·표고) 통계 — 위성 DEM(Copernicus GLO-30, 약 30m 격자)을
 * OpenTopoData 공개 API로 샘플링해 계산한다.
 *
 * 용도: "구릉지 지형 순응 배치", "옹벽 발생 지양", "스카이라인" 계열 항목을
 * 판정할 때 대상지가 실제로 경사지인지, 고저차가 얼마나 되는지의 참고 근거.
 *
 * 정밀도 주의: 30m 격자 위성 기반 근사값 — 필지 단위 정밀 측량이 아니므로
 * 항상 "약" 표기의 참고값으로만 쓴다 (프롬프트·화면 모두 명시).
 */

export type TerrainStats = {
  gridSize: number;
  spacingM: number;
  elevMinM: number;
  elevMaxM: number;
  reliefM: number;
  avgSlopeDeg: number;
  maxSlopeDeg: number;
  source: "copernicus-glo30";
};

const GRID = 7;
const SPACING_M = 30;
const TIMEOUT_MS = 7_000;
const ENDPOINT = "https://api.opentopodata.org/v1/cop30";

export type TerrainProfiles = {
  /** 샘플 간격(m) */
  spacingM: number;
  /** 중심 기준 반경(m) — 단면 길이는 2×halfSpanM */
  halfSpanM: number;
  /** 서→동 표고열 (m) */
  ew: number[];
  /** 남→북 표고열 (m) */
  ns: number[];
  source: "copernicus-glo30";
};

const PROFILE_POINTS = 21; // ±250m, 25m 간격
const PROFILE_SPACING_M = 25;

/** 통계 격자 + 단면을 "한 번의" API 호출로 — 공개 API 속도 제한(초당 1회) 대응 */
export async function getTerrainData(
  point: GeoPoint,
): Promise<{ stats: TerrainStats; profiles: TerrainProfiles } | null> {
  const half = (GRID - 1) / 2;
  const latStep = SPACING_M / 111_000;
  const lngStep = SPACING_M / (111_000 * Math.cos((point.y * Math.PI) / 180));

  const locations: string[] = [];
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      locations.push(
        `${(point.y + (row - half) * latStep).toFixed(5)},${(point.x + (col - half) * lngStep).toFixed(5)}`,
      );
    }
  }
  const profileHalf = (PROFILE_POINTS - 1) / 2;
  const pLatStep = PROFILE_SPACING_M / 111_000;
  const pLngStep = PROFILE_SPACING_M / (111_000 * Math.cos((point.y * Math.PI) / 180));
  for (let index = 0; index < PROFILE_POINTS; index += 1) {
    locations.push(`${point.y.toFixed(5)},${(point.x + (index - profileHalf) * pLngStep).toFixed(5)}`);
  }
  for (let index = 0; index < PROFILE_POINTS; index += 1) {
    locations.push(`${(point.y + (index - profileHalf) * pLatStep).toFixed(5)},${point.x.toFixed(5)}`);
  }

  const values = await fetchElevations(locations);
  const gridValues = values.slice(0, GRID * GRID);
  const ew = values.slice(GRID * GRID, GRID * GRID + PROFILE_POINTS);
  const ns = values.slice(GRID * GRID + PROFILE_POINTS);

  return {
    stats: computeStats(gridValues),
    profiles: {
      spacingM: PROFILE_SPACING_M,
      halfSpanM: profileHalf * PROFILE_SPACING_M,
      ew,
      ns,
      source: "copernicus-glo30",
    },
  };
}

/** 표고 일괄 조회 — 429(속도 제한) 시 1.2초 뒤 1회 재시도, 실패 원인 로그 */
async function fetchElevations(locations: string[]): Promise<number[]> {
  const attempt = async (): Promise<number[]> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      // 공개 API가 POST를 거부(HTTP 400, 실측) — GET 사용. 91지점 좌표(소수 5자리,
      // 약 1m 정밀도)로 URL ~1.8KB — 한도 내.
      const response = await fetch(`${ENDPOINT}?locations=${locations.join("|")}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`지형 API HTTP ${response.status}`);
      const payload = (await response.json()) as {
        status?: string;
        results?: Array<{ elevation?: number | null }>;
      };
      if (payload.status !== "OK" || !Array.isArray(payload.results) || payload.results.length !== locations.length) {
        throw new Error(`지형 API 응답 이상 (status=${payload.status ?? "?"})`);
      }
      return payload.results.map((entry) => {
        if (typeof entry?.elevation !== "number" || !Number.isFinite(entry.elevation)) {
          throw new Error("지형 API 표고 값 누락");
        }
        return Math.round(entry.elevation * 10) / 10;
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await attempt();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[terrain] 1차 조회 실패 (${message}) — 1.2초 후 재시도`);
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    return attempt();
  }
}

function computeStats(flatGrid: number[]): TerrainStats {
  const grid: number[][] = [];
  for (let row = 0; row < GRID; row += 1) {
    grid.push(flatGrid.slice(row * GRID, (row + 1) * GRID));
  }
  const slopes: number[] = [];
  for (let row = 1; row < GRID - 1; row += 1) {
    for (let col = 1; col < GRID - 1; col += 1) {
      const dzdx = (grid[row][col + 1] - grid[row][col - 1]) / (2 * SPACING_M);
      const dzdy = (grid[row + 1][col] - grid[row - 1][col]) / (2 * SPACING_M);
      slopes.push((Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI);
    }
  }
  const elevMin = Math.min(...flatGrid);
  const elevMax = Math.max(...flatGrid);
  const round1 = (value: number) => Math.round(value * 10) / 10;
  return {
    gridSize: GRID,
    spacingM: SPACING_M,
    elevMinM: round1(elevMin),
    elevMaxM: round1(elevMax),
    reliefM: round1(elevMax - elevMin),
    avgSlopeDeg: round1(slopes.reduce((a, b) => a + b, 0) / slopes.length),
    maxSlopeDeg: round1(Math.max(...slopes)),
    source: "copernicus-glo30",
  };
}

/** 프롬프트·화면 공용 요약 문장 — 근사값임을 항상 명시 */
export function formatTerrainStats(stats: TerrainStats): string {
  return (
    `대상지 주변 ±100m: 표고 약 ${stats.elevMinM}~${stats.elevMaxM}m(고저차 약 ${stats.reliefM}m) · ` +
    `평균경사 약 ${stats.avgSlopeDeg}° · 최대 약 ${stats.maxSlopeDeg}° (위성 DEM 30m 격자 근사값)`
  );
}
