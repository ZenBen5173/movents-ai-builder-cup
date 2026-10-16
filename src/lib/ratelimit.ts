import "server-only";
import { headers } from "next/headers";
import { one } from "./db";

export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super("Too many attempts. Please wait a moment and try again.");
  }
}

/**
 * Fixed-window counter in Postgres, so limits hold across serverless
 * instances. Throws RateLimitError once `limit` hits land in `windowSec`.
 */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const r = await one<{ count: number; window_start: string }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END
     RETURNING count, window_start`,
    [key, windowSec],
  );
  if (r && r.count > limit) {
    const retry = Math.max(1, Math.ceil(windowSec - (Date.now() - new Date(r.window_start).getTime()) / 1000));
    throw new RateLimitError(retry);
  }
}

/** Best-effort client IP (Vercel sets x-real-ip / x-forwarded-for). */
export async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
