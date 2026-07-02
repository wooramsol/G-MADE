/** Read env at request/runtime (bracket access avoids build-time inlining issues). */
export function readServerEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (typeof raw !== "string") return undefined;

  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  return trimmed || undefined;
}