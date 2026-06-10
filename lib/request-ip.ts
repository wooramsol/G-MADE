export function getClientIp(headersList: Headers): string {
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = headersList.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}
