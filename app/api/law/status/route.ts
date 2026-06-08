import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getLawOc, getLawReferer, isLawApiConfigured } from "@/lib/law/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json({
    configured: isLawApiConfigured(),
    ocRegistered: Boolean(getLawOc()),
    referer: getLawReferer(),
    provider: "law.go.kr",
  });
}
