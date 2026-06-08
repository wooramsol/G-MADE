import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getVWorldApiKey, getVWorldDomain, isVWorldConfigured } from "@/lib/vworld/config";
import { geocodeAddress } from "@/lib/vworld/geocode";
import { lookupLandscapeZoneByAddress } from "@/lib/vworld/landscape-zone";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const sampleAddress = "서울특별시 중구 세종대로 175";
  const key = getVWorldApiKey();
  const domain = getVWorldDomain();

  if (!isVWorldConfigured() || !key) {
    return NextResponse.json({
      configured: false,
      domain,
      checks: [],
    });
  }

  const checks: Array<{ step: string; ok: boolean; detail: string }> = [];

  try {
    const point = await geocodeAddress(sampleAddress);
    checks.push({
      step: "geocode",
      ok: true,
      detail: `${sampleAddress} → ${point.y}, ${point.x}`,
    });

    const zone = await lookupLandscapeZoneByAddress(sampleAddress, point);
    checks.push({
      step: "wfs",
      ok: true,
      detail: `경관지구 매칭 ${zone.matchedZones.length}건`,
    });
  } catch (error) {
    checks.push({
      step: "vworld",
      ok: false,
      detail: error instanceof Error ? error.message : "브이월드 호출 실패",
    });
  }

  return NextResponse.json({
    configured: true,
    domain,
    keyPreview: `${key.slice(0, 6)}...`,
    sampleAddress,
    checks,
    notes: [
      "브이월드 키에 '지오코더 API'와 '2D 데이터 API(경관지구)' 권한이 모두 필요합니다.",
      "VWORLD_DOMAIN은 키 발급 시 등록한 도메인과 동일해야 합니다. (예: www.gmadehive.com)",
    ],
  });
}
