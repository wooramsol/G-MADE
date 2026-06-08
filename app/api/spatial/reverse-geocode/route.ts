import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isVWorldConfigured } from "@/lib/vworld/config";
import { reverseGeocodePoint } from "@/lib/vworld/reverse-geocode";

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

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return NextResponse.json({ error: "유효한 좌표가 필요합니다." }, { status: 400 });
  }

  try {
    const address = await reverseGeocodePoint({ x, y, crs: "EPSG:4326" });
    return NextResponse.json({
      x,
      y,
      address: address ?? `좌표 ${y.toFixed(6)}, ${x.toFixed(6)}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "역지오코딩 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }
}
