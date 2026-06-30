import type { UploadAnalysisResult } from "./analysis-types";

export type AiProviderId = UploadAnalysisResult["provider"];

export function formatProviderBadgeLabel(provider: AiProviderId): string {
  const labels: Record<AiProviderId, string> = {
    none: "AI 생략",
    demo: "데모(구)",
    openai: "ChatGPT",
    gemini: "Gemini",
    claude: "Claude",
  };

  return labels[provider] ?? provider;
}

export function getProviderBadgeClass(provider: AiProviderId): string {
  const classes: Record<AiProviderId, string> = {
    none: "bg-slate-100 text-slate-600",
    demo: "bg-orange-50 text-orange-800",
    openai: "bg-emerald-50 text-emerald-800",
    gemini: "bg-[#e8f1ff] text-[#2463b3]",
    claude: "bg-amber-50 text-amber-900",
  };

  return classes[provider] ?? "bg-slate-100 text-slate-700";
}
