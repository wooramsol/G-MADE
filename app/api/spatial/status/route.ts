import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getVWorldDomain, isVWorldConfigured } from "@/lib/vworld/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  return NextResponse.json({
    configured: isVWorldConfigured(),
    domain: getVWorldDomain(),
    layers: ["lt_c_uq121"],
    provider: "vworld",
  });
}
