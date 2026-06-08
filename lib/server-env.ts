/** Read env at request/runtime (bracket access avoids build-time inlining issues). */
export function readServerEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== "string") return undefined;

  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  return trimmed || undefined;
}

export function readServerEnvHint(name: string, visible = 4): string | null {
  const value = readServerEnv(name);
  if (!value) return null;
  if (value.length <= visible) return value;
  return `${value.slice(0, visible)}…`;
}
