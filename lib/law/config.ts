export function getLawOc(): string | null {
  const oc = process.env.LAW_OC?.trim() || process.env.LAW_API_KEY?.trim();
  return oc || null;
}

export function getLawReferer(): string {
  const referer = process.env.LAW_REFERER?.trim();
  if (referer) {
    return referer.startsWith("http") ? referer : `https://${referer}`;
  }
  const domain = process.env.VWORLD_DOMAIN?.trim() || "www.gmadehive.com";
  return domain.startsWith("http") ? domain : `https://${domain}`;
}

export function isLawApiConfigured(): boolean {
  return Boolean(getLawOc());
}
