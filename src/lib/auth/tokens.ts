import crypto from "node:crypto";

/** A random secret for cookies, links and API tokens. */
export function randomToken(prefix = "", bytes = 32) {
  return prefix + crypto.randomBytes(bytes).toString("base64url");
}

/** Only hashes are stored, so a database leak does not leak credentials. */
export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Only same-site paths after sign-in. Control characters and backslashes are
 * refused outright (browsers strip tabs/newlines, turning "/\t/evil.com" into
 * "//evil.com"), then the path is resolved and must stay on this origin.
 */
export function safeNext(next: unknown, fallback = "/") {
  if (typeof next !== "string" || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const base = "https://movents.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
