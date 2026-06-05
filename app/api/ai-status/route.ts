import { NextResponse } from "next/server";
import { getConfiguredProviders } from "@/lib/ai/env-keys";
import { getDefaultAiProvider } from "@/lib/ai/select-provider";

export const runtime = "nodejs";

export async function GET() {
  const providers = getConfiguredProviders();

  return NextResponse.json({
    defaultProvider: getDefaultAiProvider(),
    providers: {
      gemini: {
        configured: providers.gemini,
        envKey: "GEMINI_API_KEY",
        keyHint: providers.geminiKeyHint,
      },
      openai: {
        configured: providers.openai,
        envKey: "OPENAI_API_KEY",
        keyHint: providers.openaiKeyHint,
      },
      claude: {
        configured: providers.claude,
        envKey: "ANTHROPIC_API_KEY",
        keyHint: providers.anthropicKeyHint,
      },
    },
    note: "키 값 전체는 노출하지 않습니다. configured가 false면 Vercel 환경 변수 이름·환경(Production/Preview)·재배포를 확인하세요.",
  });
}
