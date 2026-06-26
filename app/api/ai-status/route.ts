import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getConfiguredProviders } from "@/lib/ai/env-keys";
import { getConfiguredModelSummary, probeConfiguredAiProviders } from "@/lib/ai/probe-providers";
import { getDefaultAiProvider } from "@/lib/ai/select-provider";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const providers = getConfiguredProviders();
  const shouldProbe = request.nextUrl.searchParams.get("probe") === "1";
  const probes = shouldProbe ? await probeConfiguredAiProviders() : undefined;

  return NextResponse.json({
    defaultProvider: getDefaultAiProvider(),
    models: getConfiguredModelSummary(),
    providers: {
      gemini: {
        configured: providers.gemini,
        envKey: providers.geminiEnvKey ?? "GEMINI_API_KEY",
        acceptedKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
        keyHint: providers.geminiKeyHint,
      },
      openai: {
        configured: providers.openai,
        envKey: "OPENAI_API_KEY",
        keyHint: providers.openaiKeyHint,
      },
      claude: {
        configured: providers.claude,
        envKey: providers.claudeEnvKey ?? "CLAUDE_API_KEY",
        acceptedKeys: ["CLAUDE_API_KEY", "ANTHROPIC_API_KEY"],
        keyHint: providers.claudeKeyHint,
      },
    },
    probes,
    note: "키 값 전체는 노출하지 않습니다. configured가 false면 Vercel 환경 변수 이름·환경(Production/Preview)·재배포를 확인하세요. probe=1로 실제 API 응답을 테스트할 수 있습니다.",
  });
}
