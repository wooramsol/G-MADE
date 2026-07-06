import type { AiProviderId } from "./types";

type AnalysisProviderBadge = AiProviderId | "ensemble" | "none" | "demo";

export function formatProviderBadgeLabel(provider: AnalysisProviderBadge): string {
  const labels: Record<AnalysisProviderBadge, string> = {
    none: "AI 생략",
    demo: "데모(구)",
    openai: "ChatGPT",
    gemini: "Gemini",
    claude: "Claude",
    ensemble: "AI 종합",
  };

  return labels[provider] ?? provider;
}

export function getProviderBadgeClass(provider: AnalysisProviderBadge): string {
  const classes: Record<AnalysisProviderBadge, string> = {
    none: "bg-slate-100 text-slate-600",
    demo: "bg-orange-50 text-orange-800",
    openai: "bg-emerald-50 text-emerald-800",
    gemini: "bg-[#e8f1ff] text-[#2463b3]",
    claude: "bg-amber-50 text-amber-900",
    ensemble: "bg-violet-50 text-violet-900",
  };

  return classes[provider] ?? "bg-slate-100 text-slate-700";
}
