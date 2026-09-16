import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getProjectById } from "@/lib/project-store";
import { fetchElevations } from "@/lib/terrain/terrain-stats";
import { isR2Configured, r2GetObject, r2PutObject } from "@/lib/r2-storage";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * 3D 지형 뷰용 표고 격자 — 대상지 중심 31×31 격자(16m 간격, ±240m)를
 * 위성 DEM에서 샘플링해 반환한다. 지형은 변하지 않으므로 좌표 기준으로
 * R2에 영구 캐시 (같은 대상지는 외부 API를 다시 부르지 않음).
 *
 * 응답: { n, spacingM, elevations } — elevations는 남→북(행), 서→동(열)
 * 순서의 행우선 배열.
 */
const GRID_N = 31; // 홀수 — 중심점이 정확히 대상지
const SPACING_M = 16;
const BATCH = 100;

export async function GET(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? "";
  if (!projectId) {
    return NextResponse.json({ error: "projectId가 필요합니다." }, { status: 400 });
  }
  const project = await getProjectById(projectId);
  if (!project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }
  const point = project.locationPoint;
  if (!point) {
    return NextResponse.json(
      { error: "사업 위치 좌표가 설정되지 않았습니다. 프로젝트 정보에서 위치를 지정해 주세요." },
      { status: 422 },
    );
  }

  const cacheKey = `terrain-mesh/${point.y.toFixed(5)}_${point.x.toFixed(5)}-n${GRID_N}s${SPACING_M}-v1.json`;

  if (isR2Configured()) {
    try {
      const cached = await r2GetObject(cacheKey);
      if (cached) {
        return new NextResponse(new Uint8Array(cached), {
          headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=86400" },
        });
      }
    } catch {
      // 캐시 미스 취급
    }
  }

  try {
    const half = (GRID_N - 1) / 2;
    const latStep = SPACING_M / 111_000;
    const lngStep = SPACING_M / (111_000 * Math.cos((point.y * Math.PI) / 180));

    const locations: string[] = [];
    for (let row = 0; row < GRID_N; row += 1) {
      for (let col = 0; col < GRID_N; col += 1) {
        locations.push(
          `${(point.y + (row - half) * latStep).toFixed(5)},${(point.x + (col - half) * lngStep).toFixed(5)}`,
        );
      }
    }

    const elevations: number[] = [];
    for (let index = 0; index < locations.length; index += BATCH) {
      elevations.push(...(await fetchElevations(locations.slice(index, index + BATCH))));
    }

    const body = JSON.stringify({ n: GRID_N, spacingM: SPACING_M, elevations });
    if (isR2Configured()) {
      await r2PutObject(cacheKey, Buffer.from(body), "application/json").catch(() => undefined);
    }
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=86400" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "지형 격자 조회에 실패했습니다.";
    console.warn(`[terrain] 3D 격자 조회 실패: ${message}`);
    return NextResponse.json({ error: `지형 데이터를 불러오지 못했습니다. ${message}` }, { status: 502 });
  }
}
