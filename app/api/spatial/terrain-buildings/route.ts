import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getProjectById } from "@/lib/project-store";
import { getNearbyBuildingFootprints } from "@/lib/vworld/nearby-buildings";
import { isR2Configured, r2GetObject, r2PutObject } from "@/lib/r2-storage";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * 3D 지형 뷰용 주변 건물 형상 — 대상지 반경 220m(지형 범위)의 건물
 * 외곽 링·층수를 로컬 좌표(m)로 반환. 좌표 기준 R2 캐시(7일).
 */
const RADIUS_M = 220;

export async function GET(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId가 필요합니다." }, { status: 400 });
  const project = await getProjectById(projectId);
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  const point = project.locationPoint;
  if (!point) {
    return NextResponse.json({ error: "사업 위치 좌표가 설정되지 않았습니다." }, { status: 422 });
  }

  const cacheKey = `terrain-buildings/${point.y.toFixed(5)}_${point.x.toFixed(5)}-r${RADIUS_M}-v1.json`;
  if (isR2Configured()) {
    try {
      const cached = await r2GetObject(cacheKey);
      if (cached) {
        return new NextResponse(new Uint8Array(cached), {
          headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=86400" },
        });
      }
    } catch {
      // 캐시 미스
    }
  }

  try {
    const buildings = await getNearbyBuildingFootprints(
      { x: point.x, y: point.y, crs: "EPSG:4326" },
      RADIUS_M,
    );
    const body = JSON.stringify({ buildings });
    if (isR2Configured()) {
      await r2PutObject(cacheKey, Buffer.from(body), "application/json").catch(() => undefined);
    }
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=86400" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "건물 정보를 불러오지 못했습니다.";
    console.warn(`[terrain] 주변 건물 형상 조회 실패: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
