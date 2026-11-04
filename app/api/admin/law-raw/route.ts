import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { getLawOc } from "@/lib/law/config";
import { lawGetJson } from "@/lib/law/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 관리자 전용 진단 — 국가법령정보센터 원본 응답 구조 확인 (파싱 버그 점검용) */
export async function GET(request: NextRequest) {
  const auth = await requireAdminSession();
  if (auth.response) return auth.response;
  const oc = getLawOc();
  if (!oc) return NextResponse.json({ error: "LAW_OC 없음" }, { status: 503 });
  const sp = request.nextUrl.searchParams;
  const path = sp.get("path") === "service" ? "/DRF/lawService.do" : "/DRF/lawSearch.do";
  const params: Record<string, string> = { OC: oc, type: "JSON" };
  for (const key of ["target", "query", "ID", "MST", "JO", "org", "display", "nw", "knd", "search"]) {
    const value = sp.get(key);
    if (value) params[key] = value;
  }
  const result = await lawGetJson<Record<string, unknown>>(path, params, "진단");
  if (!result.ok) return NextResponse.json({ ok: false, status: result.status, error: result.error, raw: result.rawBody?.slice(0, 2000) });
  const text = JSON.stringify(result.data);
  const top = Object.keys(result.data);
  const inner = top[0] && typeof result.data[top[0]] === "object" ? Object.keys(result.data[top[0]] as object) : [];
  return NextResponse.json({ ok: true, top, inner, length: text.length, sample: text.slice(0, Number(sp.get("len") ?? 3000)) });
}
