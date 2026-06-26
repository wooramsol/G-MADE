import type { UploadAnalysisResult } from "./analysis-types";

export function formatProviderBadgeLabel(provider: UploadAnalysisResult["provider"]): string {
  const labels: Record<UploadAnalysisResult["provider"], string> = {
    none: "생략",
    demo: "데모(구)",
    openai: "ChatGPT",
    gemini: "Gemini",
    claude: "Claude",
  };

  return labels[provider] ?? provider;
}
