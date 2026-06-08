import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isVWorldConfigured } from "@/lib/vworld/config";
import { searchAddresses } from "@/lib/vworld/search";
import { searchPlaces } from "@/lib/vworld/search";

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
  const query = searchParams.get("q")?.trim() ?? "";
  const mode = searchParams.get("mode") ?? "address";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    if (mode === "place") {
      const results = await searchPlaces(query);
      return NextResponse.json({ results });
    }

    const roadResults = await searchAddresses(query, "road");
    const parcelResults = roadResults.length > 0 ? [] : await searchAddresses(query, "parcel");
    return NextResponse.json({ results: [...roadResults, ...parcelResults] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "주소 검색 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }
}
