import { isProviderConfigured, selectProvider } from "./select-provider";
import type { AiProviderId, AiProviderPreference } from "./types";

export function resolveAnalysisProvider(preference: AiProviderPreference): AiProviderId | null {
  if (preference === "auto") {
    return selectProvider("auto");
  }

  // 명시적으로 선택했더라도 키가 없으면 실행 불가이므로 null을 반환한다.
  return isProviderConfigured(preference) ? preference : null;
}
