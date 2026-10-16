import crypto from "node:crypto";

export function appUrl() {
  return (
    process.env.APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000")
  );
}

function secret() {
  const s = process.env.APP_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("APP_SECRET must be set to a random string of at least 32 characters");
  }
  return s || "movents-local-development-secret-not-for-production";
}

/**
 * Signed, expiring token for links that work without a login (faculty
 * approval, uploads, tracking pixels). `value` should name the purpose,
 * e.g. `faculty:<id>`, so a token for one use can't be replayed for another.
 */
export function signToken(value: string, ttlDays = 30) {
  const exp = Math.floor(Date.now() / 1000) + Math.round(ttlDays * 86400);
  const sig = crypto.createHmac("sha256", secret()).update(`${value}.${exp}`).digest("base64url").slice(0, 32);
  return `${exp.toString(36)}.${sig}`;
}

export function verifyToken(value: string, token: string | null | undefined) {
  if (!token) return false;
  const [expPart, sig] = token.split(".");
  const exp = parseInt(expPart ?? "", 36);
  if (!sig || !Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = crypto.createHmac("sha256", secret()).update(`${value}.${exp}`).digest("base64url").slice(0, 32);
  return expected.length === sig.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

/** A generated document link that works without signing in (for the faculty advisor). */
export function outputsUrl(eventId: string, file: string, ttlDays = 60) {
  return `${appUrl()}/api/outputs/${eventId}/${file}?t=${signToken(`outputs:${eventId}:${file}`, ttlDays)}`;
}

export const fmtRM = (n: number | null | undefined) =>
  n == null ? "" : `RM${n.toLocaleString("en-MY", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

export function fmtDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

/** Today in Malaysia time, as YYYY-MM-DD. DEMO_TODAY overrides it outside production. */
export function today() {
  if (process.env.DEMO_TODAY && process.env.NODE_ENV !== "production") return process.env.DEMO_TODAY;
  return new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
}
