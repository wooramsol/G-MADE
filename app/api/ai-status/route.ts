import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getConfiguredProviders } from "@/lib/ai/env-keys";
import { getConfiguredModelSummary, probeConfiguredAiProviders } from "@/lib/ai/probe-providers";
import { probeDocumentAnalysisForProviders } from "@/lib/ai/probe-document-analysis";
import { getDefaultAiProvider } from "@/lib/ai/select-provider";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const providers = getConfiguredProviders();
  const probeMode = request.nextUrl.searchParams.get("probe");

  if (probeMode) {
    // probe는 실제 AI API 호출(비용 발생)이므로 호출 빈도를 제한한다.
    const rateKey = `ai-probe:${authResult.session.user?.id ?? authResult.session.user?.email ?? "anonymous"}`;
    const rate = checkRateLimit(rateKey, RATE_LIMITS.aiProbe.limit, RATE_LIMITS.aiProbe.windowMs);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: `AI 연결 확인 요청이 너무 잦습니다. ${rate.retryAfterSeconds}초 후 다시 시도해 주세요.` },
        { status: 429 },
      );
    }
  }

  const probes =
    probeMode === "analysis"
      ? await probeDocumentAnalysisForProviders()
      : probeMode === "1" || probeMode === "ping"
        ? await probeConfiguredAiProviders()
        : undefined;

  return NextResponse.json({
    defaultProvider: getDefaultAiProvider(),
    models: getConfiguredModelSummary(),
    providers: {
      gemini: {
        configured: providers.gemini,
        envKey: providers.geminiEnvKey ?? "GEMINI_API_KEY",
        acceptedKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
      },
      openai: {
        configured: providers.openai,
        envKey: "OPENAI_API_KEY",
      },
      claude: {
        configured: providers.claude,
        envKey: providers.claudeEnvKey ?? "CLAUDE_API_KEY",
        acceptedKeys: ["CLAUDE_API_KEY", "ANTHROPIC_API_KEY"],
      },
    },
    probes,
    note: "probe=analysis(기본·권장)은 실제 심의 분석과 동일한 JSON 평가를 축소 실행합니다. probe=ping은 키·모델 연결만 확인합니다.",
  });
}
