import { readServerEnv } from "../server-env";

export function getLawOc(): string | null {
  return readServerEnv("LAW_OC") ?? readServerEnv("LAW_API_KEY") ?? null;
}

export function getLawReferer(): string {
  const referer = readServerEnv("LAW_REFERER");
  if (referer) {
    return referer.startsWith("http") ? referer : `https://${referer}`;
  }

  const domain = readServerEnv("VWORLD_DOMAIN") || "www.gmadehive.com";
  return domain.startsWith("http") ? domain : `https://${domain}`;
}

export function isLawApiConfigured(): boolean {
  return Boolean(getLawOc());
}

export function getLawRefererSource(): "law_referer" | "vworld_domain" | "default" {
  if (readServerEnv("LAW_REFERER")) return "law_referer";
  if (readServerEnv("VWORLD_DOMAIN")) return "vworld_domain";
  return "default";
}
