/**
 * 인메모리 고정 윈도우 rate limiter.
 *
 * 서버리스 환경에서는 인스턴스별로 카운터가 분리되므로 완전한 방어는 아니지만,
 * 단일 인스턴스 기준 brute-force·고비용 API 남용 속도를 크게 낮춘다.
 * (분산 rate limit이 필요하면 Vercel KV/Upstash 등으로 교체)
 */

type WindowEntry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, WindowEntry>();
const MAX_BUCKETS = 10_000;

export type RateLimitResult = {
  allowed: boolean;
  /** 윈도우 초기화까지 남은 시간(초). allowed=true면 0 */
  retryAfterSeconds: number;
};

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      pruneExpired(now);
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  entry.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

function pruneExpired(now: number) {
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) {
      buckets.delete(key);
    }
  }
  // 만료 항목이 없어 여전히 가득 차 있으면 가장 오래된 항목부터 제거
  if (buckets.size >= MAX_BUCKETS) {
    const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of oldest.slice(0, Math.ceil(MAX_BUCKETS / 10))) {
      buckets.delete(key);
    }
  }
}

export const RATE_LIMITS = {
  /** 로그인 시도: IP당 1분에 10회 */
  login: { limit: 10, windowMs: 60_000 },
  /** AI 평가 실행: 사용자당 1분에 5회 */
  evaluation: { limit: 5, windowMs: 60_000 },
  /** AI 연결 probe: 사용자당 1분에 3회 (실제 API 비용 발생) */
  aiProbe: { limit: 3, windowMs: 60_000 },
} as const;
