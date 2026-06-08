export function getVWorldApiKey(): string | null {
  const key = process.env.VWORLD_API_KEY?.trim();
  return key || null;
}

export function getVWorldDomain(): string {
  return process.env.VWORLD_DOMAIN?.trim() || "gmadehive.com";
}

export function isVWorldConfigured(): boolean {
  return Boolean(getVWorldApiKey());
}
