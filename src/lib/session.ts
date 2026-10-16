import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { one, query } from "./db";
import { hashToken, randomToken } from "./auth/tokens";
import type { User } from "./types";

export const SESSION_COOKIE = "mv_session";
const SESSION_DAYS = 30;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Users columns with the active society, role and department taken from the
 * live membership row: if the membership is gone, so is the access, whatever
 * users.society_id still says.
 */
const USER_COLS = `u.id, u.name, u.email, u.phone, u.email_verified_at, u.avatar_url,
  CASE WHEN m.user_id IS NULL THEN NULL ELSE u.society_id END AS society_id,
  coalesce(m.role, 'committee') AS role, m.department AS department`;
const MEMBERSHIP_JOIN = "LEFT JOIN memberships m ON m.user_id = u.id AND m.society_id = u.society_id";

/** A user who has picked (or been given) a society workspace. */
export type WorkspaceUser = User & { society_id: string };

/**
 * The signed-in user: a browser session cookie, or `Authorization: Bearer`
 * with a personal API token or OAuth access token (MCP and API clients).
 * The middleware strips Authorization everywhere except the API routes
 * meant for tokens, so a token cannot drive pages or server actions.
 * Memoised per request.
 */
export const currentUser = cache(async (): Promise<User | null> => {
  const h = await headers();
  const auth = h.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return userForBearer(auth.slice(7).trim());
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const hash = hashToken(token);
  const row = await one<User & { _last_seen: string }>(
    `SELECT ${USER_COLS}, s.last_seen_at AS _last_seen FROM sessions s JOIN users u ON u.id = s.user_id ${MEMBERSHIP_JOIN}
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hash],
  );
  if (!row) return null;
  // Sliding expiry, written at most once an hour.
  if (Date.now() - new Date(row._last_seen).getTime() > 3600_000) {
    void query(`UPDATE sessions SET last_seen_at = now(), expires_at = now() + interval '${SESSION_DAYS} days' WHERE token_hash = $1`, [hash]).catch(() => {});
  }
  const { _last_seen: _, ...user } = row;
  return user as User;
});

/** Personal API token (mvp_…) or OAuth access token (mvo_…). */
export async function userForBearer(token: string): Promise<User | null> {
  if (!token) return null;
  const hash = hashToken(token);
  if (token.startsWith("mvo_")) {
    const u = await one<User>(
      `SELECT ${USER_COLS} FROM oauth_tokens t JOIN users u ON u.id = t.user_id ${MEMBERSHIP_JOIN}
       WHERE t.access_hash = $1 AND t.access_expires_at > now() AND t.revoked_at IS NULL`,
      [hash],
    );
    return u;
  }
  const u = await one<User & { _tok: string; _used: string | null }>(
    `SELECT ${USER_COLS}, t.id AS _tok, t.last_used_at AS _used FROM api_tokens t JOIN users u ON u.id = t.user_id ${MEMBERSHIP_JOIN}
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now())`,
    [hash],
  );
  if (!u) return null;
  if (!u._used || Date.now() - new Date(u._used).getTime() > 300_000) {
    void query("UPDATE api_tokens SET last_used_at = now() WHERE id = $1", [u._tok]).catch(() => {});
  }
  const { _tok: _a, _used: _b, ...user } = u;
  return user as User;
}

export async function requireUser(): Promise<WorkspaceUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Not signed in");
  if (!u.society_id) throw new HttpError(403, "Join or create a society first");
  return u as WorkspaceUser;
}

/** Start a browser session and set its cookie. */
export async function startSession(userId: string) {
  const token = randomToken();
  const h = await headers();
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip)
     VALUES ($1, $2, now() + interval '${SESSION_DAYS} days', $3, $4)`,
    [hashToken(token), userId, h.get("user-agent")?.slice(0, 300) ?? null, h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? null],
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function endSession() {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  c.delete(SESSION_COOKIE);
}
