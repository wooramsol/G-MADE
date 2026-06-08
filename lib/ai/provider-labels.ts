import type { UploadAnalysisResult } from "./analysis-types";

export function formatProviderBadgeLabel(provider: UploadAnalysisResult["provider"]): string {
  const labels: Record<UploadAnalysisResult["provider"], string> = {
    demo: "데모",
    openai: "ChatGPT",
    gemini: "Gemini",
    claude: "Claude",
  };

  return labels[provider];
}
