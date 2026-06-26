import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
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
    note: "probe=analysis(기본·권장)은 실제 심의 분석과 동일한 JSON 평가를 축소 실행합니다. probe=ping은 키·모델 연결만 확인합니다.",
  });
}
