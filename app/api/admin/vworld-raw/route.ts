import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { getVWorldApiKey } from "@/lib/vworld/config";
import { buildVWorldParams, vworldGetJson } from "@/lib/vworld/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "icn1";

/** 관리자 전용 진단 — 브이월드 데이터 API(점 포함 필지·용도지역) 원본 응답 확인 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminSession();
  if (auth.response) return auth.response;
  const key = getVWorldApiKey();
  if (!key) return NextResponse.json({ error: "VWORLD_API_KEY 없음" }, { status: 503 });
  const sp = request.nextUrl.searchParams;
  const x = Number(sp.get("x"));
  const y = Number(sp.get("y"));
  const data = (sp.get("data") ?? "LT_C_UQ111").replace(/[^A-Z0-9_]/gi, "");
  const params = buildVWorldParams({
    service: "data",
    request: "GetFeature",
    data,
    geomFilter: `POINT(${x} ${y})`,
    crs: "EPSG:4326",
    geometry: "false",
    attribute: "true",
    size: "10",
    format: "json",
    key,
  });
  const result = await vworldGetJson<Record<string, unknown>>(`https://api.vworld.kr/req/data?${params.toString()}`, `진단(${data})`);
  return NextResponse.json({ ok: result.ok, sample: JSON.stringify(result.ok ? result.data : result).slice(0, 3000) });
}
