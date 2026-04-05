import { RequestHandler } from "express";

type Bucket = { count: number; resetAt: number };

function pruneIfHuge(map: Map<string, Bucket>, now: number) {
  if (map.size <= 10_000) return;
  for (const [k, v] of map) {
    if (now >= v.resetAt) map.delete(k);
  }
}

/**
 * Fixed-window limiter keyed by client IP (and optional prefix for different policies).
 */
export function createIpRateLimiter(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
}): RequestHandler {
  const buckets = new Map<string, Bucket>();
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();
    pruneIfHuge(buckets, now);

    let b = buckets.get(key);
    if (!b || now >= b.resetAt) {
      b = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, b);
    }
    b.count += 1;
    if (b.count > options.max) {
      return res.status(429).json({
        error: "Too many requests",
        message: "Try again later.",
      });
    }
    next();
  };
}

const emailBuckets = new Map<string, Bucket>();

/**
 * Per-normalized-email limit for sensitive flows (e.g. issuing a new reset OTP).
 * Returns true if the request is allowed, false if the email is over quota.
 */
export function allowEmailAction(
  emailNorm: string,
  windowMs: number,
  max: number
): boolean {
  const now = Date.now();
  pruneIfHuge(emailBuckets, now);
  const key = emailNorm.toLowerCase().trim();

  let b = emailBuckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    emailBuckets.set(key, b);
  }
  if (b.count >= max) {
    return false;
  }
  b.count += 1;
  return true;
}
