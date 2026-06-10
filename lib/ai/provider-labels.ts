import type { UploadAnalysisResult } from "./analysis-types";

export function formatProviderBadgeLabel(provider: UploadAnalysisResult["provider"]): string {
  const labels: Record<UploadAnalysisResult["provider"], string> = {
    demo: "데모",
    openai: "챗GPT",
    gemini: "제미니",
    claude: "클로드",
  };

  return labels[provider];
}
