export function getVWorldApiKey(): string | null {
  const key = process.env.VWORLD_API_KEY?.trim();
  return key || null;
}

export function getVWorldDomain(): string {
  const raw = process.env.VWORLD_DOMAIN?.trim() || "www.gmadehive.com";
  return raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function isVWorldConfigured(): boolean {
  return Boolean(getVWorldApiKey());
}
