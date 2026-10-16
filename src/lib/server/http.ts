import { NextResponse } from "next/server";
import { HttpError } from "../session";
import { RateLimitError } from "../ratelimit";
import { publicError } from "../errors";

export function handle(fn: () => Promise<unknown>) {
  return fn()
    .then((data) => NextResponse.json(data))
    .catch((err) => {
      if (err instanceof RateLimitError) return NextResponse.json({ error: err.message }, { status: 429, headers: { "retry-after": String(err.retryAfter) } });
      const status = err instanceof HttpError ? err.status : 400;
      return NextResponse.json({ error: publicError(err) }, { status });
    });
}
