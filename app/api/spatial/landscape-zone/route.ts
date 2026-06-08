import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { geocodeAddress } from "@/lib/vworld/geocode";
import { lookupLandscapeZoneByAddress } from "@/lib/vworld/landscape-zone";
import { isVWorldConfigured } from "@/lib/vworld/config";

export const dynamic = "force-dynamic";

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
  const address = searchParams.get("address")?.trim();

  if (!address) {
    return NextResponse.json({ error: "address 파라미터가 필요합니다." }, { status: 400 });
  }

  try {
    const point = await geocodeAddress(address);
    if (!point) {
      return NextResponse.json(
        {
          error: "주소를 좌표로 변환하지 못했습니다. 도로명 또는 지번 주소를 더 구체적으로 입력해 주세요.",
          address,
        },
        { status: 404 },
      );
    }

    const result = await lookupLandscapeZoneByAddress(address, point);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "경관지구 조회 중 오류가 발생했습니다.",
        address,
      },
      { status: 502 },
    );
  }
}
