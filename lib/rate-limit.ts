type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
};

const buckets = new Map<string, RateLimitEntry>();

/**
 * In-memory fixed-window limiter for MVP deployments.
 * It is intentionally simple: per-process only, no cross-instance coordination.
 * Upgrade to Redis or another shared store before running multiple instances.
 */
export function checkRateLimit({
  key,
  limit,
  windowMs,
  now = Date.now(),
}: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): RateLimitResult {
  pruneExpired(now);

  const existing = buckets.get(key);
  const current = existing && existing.resetAt > now ? existing : { count: 0, resetAt: now + windowMs };

  current.count += 1;
  buckets.set(key, current);

  const remaining = Math.max(limit - current.count, 0);
  if (current.count > limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: current.resetAt,
      retryAfterSeconds: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
    };
  }

  return {
    allowed: true,
    limit,
    remaining,
    resetAt: current.resetAt,
  };
}

function pruneExpired(now: number): void {
  // Bound memory growth on small VPS/serverless instances.
  if (buckets.size < 10_000) return;

  Array.from(buckets.entries()).forEach(([key, entry]) => {
    if (entry.resetAt <= now) buckets.delete(key);
  });
}
