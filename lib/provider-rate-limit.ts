type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function createRequestRateLimiter({
  limit,
  windowMs,
}: RateLimitOptions) {
  const buckets = new Map<string, { count: number; resetsAt: number }>();
  let requestCount = 0;

  return {
    take(key: string, now = Date.now()): RateLimitResult {
      requestCount += 1;
      if (requestCount % 100 === 0) {
        for (const [bucketKey, bucket] of buckets) {
          if (bucket.resetsAt <= now) buckets.delete(bucketKey);
        }
      }

      const current = buckets.get(key);
      if (!current || current.resetsAt <= now) {
        buckets.set(key, { count: 1, resetsAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      if (current.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((current.resetsAt - now) / 1_000),
          ),
        };
      }
      current.count += 1;
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}

export function requestClientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unidentified-client"
  );
}
