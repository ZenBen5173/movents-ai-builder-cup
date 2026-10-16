/**
 * Message safe to show a user. Errors we throw on purpose (plain Error with
 * a sentence) pass through; driver and runtime errors are logged and hidden.
 */
export function publicError(err: unknown) {
  if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) throw err;
  const e = err as { name?: string; code?: unknown; severity?: unknown; message?: string; retryAfter?: number };
  const internal =
    !(err instanceof Error) ||
    e.name === "PostgresError" ||
    typeof e.severity === "string" ||
    (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) ||
    err instanceof TypeError ||
    err instanceof RangeError ||
    err instanceof SyntaxError ||
    err instanceof ReferenceError;
  if (internal) {
    console.error("[error]", err);
    return "Something went wrong. Please try again.";
  }
  return e.message || "Something went wrong.";
}
