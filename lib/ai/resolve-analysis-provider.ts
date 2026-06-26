import { selectProvider } from "./select-provider";
import type { AiProviderId, AiProviderPreference } from "./types";

export function resolveAnalysisProvider(preference: AiProviderPreference): AiProviderId | null {
  if (preference === "auto") {
    return selectProvider("auto");
  }

  return preference;
}
