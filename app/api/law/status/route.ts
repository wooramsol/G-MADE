import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getLawOc,
  getLawReferer,
  getLawRefererSource,
  isLawApiConfigured,
} from "@/lib/law/config";
import { readServerEnv, readServerEnvHint } from "@/lib/server-env";

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
      vercelUrl: process.env.VERCEL_URL ?? null,
      vercelGitBranch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      lawOcEnvDefined: Boolean(readServerEnv("LAW_OC")),
      lawOcLength: readServerEnv("LAW_OC")?.length ?? 0,
      lawOcHint: readServerEnvHint("LAW_OC", 6),
      lawApiKeyEnvDefined: Boolean(readServerEnv("LAW_API_KEY")),
      lawRefererEnvDefined: Boolean(readServerEnv("LAW_REFERER")),
      lawRefererSource: getLawRefererSource(),
      vworldApiKeyDefined: Boolean(readServerEnv("VWORLD_API_KEY")),
      vworldDomainDefined: Boolean(readServerEnv("VWORLD_DOMAIN")),
    },
    setupHint: oc
      ? null
      : "Vercel Project Settings > Environment Variables에서 LAW_OC=gmadehive0515 를 Production에 추가한 뒤 Redeploy 하세요. referer만 보이는 것은 기본값일 수 있습니다.",
  });
}
