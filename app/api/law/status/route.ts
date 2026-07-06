import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getLawOc,
  getLawReferer,
  getLawRefererSource,
  isLawApiConfigured,
} from "@/lib/law/config";
import { readServerEnv } from "@/lib/server-env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const oc = getLawOc();

  return NextResponse.json({
    configured: isLawApiConfigured(),
    ocRegistered: Boolean(oc),
    referer: getLawReferer(),
    provider: "law.go.kr",
    diagnostics: {
      vercelEnv: process.env.VERCEL_ENV ?? null,
      lawOcEnvDefined: Boolean(readServerEnv("LAW_OC")),
      lawApiKeyEnvDefined: Boolean(readServerEnv("LAW_API_KEY")),
      lawRefererEnvDefined: Boolean(readServerEnv("LAW_REFERER")),
      lawRefererSource: getLawRefererSource(),
      vworldApiKeyDefined: Boolean(readServerEnv("VWORLD_API_KEY")),
      vworldDomainDefined: Boolean(readServerEnv("VWORLD_DOMAIN")),
    },
    setupHint: oc
      ? null
      : "Vercel Project Settings > Environment Variables에서 LAW_OC(open.law.go.kr에서 발급한 OC)를 Production에 추가한 뒤 Redeploy 하세요. referer만 보이는 것은 기본값일 수 있습니다.",
  });
}
