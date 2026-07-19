import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getVWorldApiKey, getVWorldDomain } from "@/lib/vworld/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 브이월드 3D 클라이언트 임베드용 키를 로그인 사용자에게만 전달합니다.
 * (별도 NEXT_PUBLIC 환경변수 없이 서버의 VWORLD_API_KEY를 재사용.
 *  브이월드 키는 등록된 서비스 도메인에서만 유효합니다.)
 */
export async function GET() {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const key = getVWorldApiKey();
  if (!key) {
    return NextResponse.json({ error: "서버에 VWORLD_API_KEY가 설정되지 않았습니다." }, { status: 503 });
  }

  return NextResponse.json({ key, domain: getVWorldDomain() });
}
