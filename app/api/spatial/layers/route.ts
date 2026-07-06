import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { geocodeAddress } from "@/lib/vworld/geocode";
import { isVWorldConfigured } from "@/lib/vworld/config";
import { SPATIAL_LAYERS, querySpatialLayersNearPoint } from "@/lib/vworld/wfs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = "icn1";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!isVWorldConfigured()) {
    return NextResponse.json({ error: "VWORLD_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const x = Number(searchParams.get("x"));
  const y = Number(searchParams.get("y"));
  const address = searchParams.get("address")?.trim() ?? "";
  const layers = searchParams.get("layers")?.split(",").filter(Boolean);

  try {
    const point =
      Number.isFinite(x) && Number.isFinite(y)
        ? { x, y, crs: "EPSG:4326" as const }
        : address
          ? await geocodeAddress(address)
          : null;

    if (!point) {
      return NextResponse.json({ error: "address 또는 x,y 좌표가 필요합니다." }, { status: 400 });
    }

    const { features, failedLayers } = await querySpatialLayersNearPoint(point, layers);
    return NextResponse.json({
      point,
      layers: SPATIAL_LAYERS,
      features,
      failedLayers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "공간 레이어 조회 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }
}
