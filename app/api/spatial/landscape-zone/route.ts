import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { geocodeAddress, VWorldGeocodeError } from "@/lib/vworld/geocode";
import { lookupLandscapeZoneByAddress, VWorldLandscapeZoneError } from "@/lib/vworld/landscape-zone";
import { getVWorldDomain, isVWorldConfigured } from "@/lib/vworld/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;
export const preferredRegion = "icn1";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!isVWorldConfigured()) {
    return NextResponse.json(
      { error: "VWORLD_API_KEY 환경 변수가 설정되지 않았습니다." },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address")?.trim() ?? "";
  const x = Number(searchParams.get("x"));
  const y = Number(searchParams.get("y"));
  const hasCoordinates = Number.isFinite(x) && Number.isFinite(y);

  if (!hasCoordinates && !address) {
    return NextResponse.json({ error: "address 또는 x,y 좌표가 필요합니다." }, { status: 400 });
  }

  try {
    const point = hasCoordinates
      ? { x, y, crs: "EPSG:4326" as const }
      : await geocodeAddress(address);
    const result = await lookupLandscapeZoneByAddress(address || `좌표 ${y.toFixed(6)}, ${x.toFixed(6)}`, point);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof VWorldGeocodeError) {
      return NextResponse.json(
        {
          error: error.message,
          stage: "geocode",
          address,
          domain: getVWorldDomain(),
          hint: "브이월드 개발자센터에서 '지오코더 API' 사용 권한이 켜져 있는지 확인해 주세요.",
        },
        { status: 502 },
      );
    }

    if (error instanceof VWorldLandscapeZoneError) {
      return NextResponse.json(
        {
          error: error.message,
          stage: "wfs",
          address,
          domain: getVWorldDomain(),
          hint: "브이월드 개발자센터에서 2D 데이터 API의 '경관지구(lt_c_uq121)' 레이어 권한을 확인해 주세요.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "경관지구 조회 중 오류가 발생했습니다.",
        stage: "unknown",
        address,
        domain: getVWorldDomain(),
      },
      { status: 502 },
    );
  }
}
