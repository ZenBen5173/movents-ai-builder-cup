import "server-only";
import { id, one, query, transaction } from "../db";
import { appUrl } from "../appurl";
import { emailShell, sendSystemEmail } from "../integrations/email";
import { hashToken, randomToken, safeNext } from "./tokens";
import type { User } from "../types";

const LINK_MINUTES = 15;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

/** Email a one-time sign-in link. Works for new and existing accounts. */
export async function sendLoginLink(rawEmail: string, next?: string) {
  const email = normaliseEmail(rawEmail);
  if (!EMAIL_RE.test(email) || email.length > 254) throw new Error("Enter a valid email address.");
  const token = randomToken();
  await query(
    `INSERT INTO login_tokens (token_hash, email, next_path, expires_at) VALUES ($1, $2, $3, now() + interval '${LINK_MINUTES} minutes')`,
    [hashToken(token), email, safeNext(next)],
  );
  const link = `${appUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
  await sendSystemEmail(
    email,
    "Your Movents sign-in link",
    emailShell(
      "Sign in to Movents",
      `<p>Click the button below to sign in. The link works once and expires in ${LINK_MINUTES} minutes.</p>
<p style="margin:24px 0"><a href="${link}" style="background:#161514;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Sign in to Movents</a></p>
<p style="font-size:13px;color:#60646c">If you did not ask for this, you can ignore this email.</p>`,
    ),
    link,
  );
}

/** Spend a sign-in link. Returns the user and where to send them. */
export async function consumeLoginLink(token: string) {
  const row = await one<{ email: string; next_path: string | null }>(
    `UPDATE login_tokens SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING email, next_path`,
    [hashToken(token)],
  );
  if (!row) return null;
  const user = await findOrCreateUser({ email: row.email, verified: true });
  return { user, next: safeNext(row.next_path) };
}

/**
 * The account for a verified email, created on first sign-in. A Google
 * subject id is linked to the account the first time it is seen.
 */
export async function findOrCreateUser(input: { email: string; name?: string | null; googleSub?: string | null; avatarUrl?: string | null; verified: boolean }): Promise<User> {
  const email = normaliseEmail(input.email);
  return transaction(async () => {
    let user = input.googleSub ? await one<User>("SELECT * FROM users WHERE google_sub = $1", [input.googleSub]) : null;
    user ??= await one<User>("SELECT * FROM users WHERE lower(email) = $1", [email]);
    if (user) {
      await query(
        `UPDATE users SET
           email_verified_at = coalesce(email_verified_at, CASE WHEN $2 THEN now() END),
           google_sub = coalesce(google_sub, $3),
           avatar_url = coalesce(avatar_url, $4)
         WHERE id = $1`,
        [user.id, input.verified, input.googleSub ?? null, input.avatarUrl ?? null],
      );
      return user;
    }
    const name = input.name?.trim() || email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const [created] = await query<User>(
      `INSERT INTO users (id, society_id, name, email, role, email_verified_at, google_sub, avatar_url)
       VALUES ($1, NULL, $2, $3, 'committee', CASE WHEN $4 THEN now() END, $5, $6) RETURNING *`,
      [id("usr"), name.slice(0, 120), email, input.verified, input.googleSub ?? null, input.avatarUrl ?? null],
    );
    return created;
  });
}

/** Remove expired one-time rows; called from the daily cron. */
export async function pruneAuthTables() {
  await query("DELETE FROM login_tokens WHERE expires_at < now() - interval '1 day'");
  await query("DELETE FROM sessions WHERE expires_at < now()");
  await query("DELETE FROM oauth_codes WHERE expires_at < now() - interval '1 day'");
  await query("DELETE FROM oauth_tokens WHERE (refresh_expires_at IS NULL OR refresh_expires_at < now()) AND access_expires_at < now() - interval '1 day'");
  await query("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'");
}

/**
 * Delete an account: memberships, team places, sessions and tokens go; the
 * user row is anonymised so audit history keeps its shape without personal
 * data. Refused while the user is the only President of a society.
 */
export async function deleteAccount(userId: string) {
  const sole = await one<{ name: string }>(
    `SELECT s.name FROM memberships m JOIN societies s ON s.id = m.society_id
     WHERE m.user_id = $1 AND m.role = 'president'
       AND NOT EXISTS (SELECT 1 FROM memberships o WHERE o.society_id = m.society_id AND o.role = 'president' AND o.user_id <> $1)
     LIMIT 1`,
    [userId],
  );
  if (sole) throw new Error(`You are the only President of ${sole.name}. Appoint another President first.`);
  await transaction(async () => {
    for (const t of ["memberships", "event_members", "sessions", "api_tokens", "oauth_tokens", "oauth_codes", "notifications"]) {
      await query(`DELETE FROM ${t} WHERE user_id = $1`, [userId]);
    }
    await query(
      `UPDATE users SET name = 'Deleted user', email = 'deleted+' || id || '@invalid', phone = NULL, google_sub = NULL,
         avatar_url = NULL, email_verified_at = NULL, society_id = NULL, department = NULL WHERE id = $1`,
      [userId],
    );
  });
}

/**
 * Everything Movents holds about one person (PDPA access request), for the
 * "Download my data" button. Their own records only: no token hashes, and no
 * other members' or guests' details.
 */
export async function exportAccount(userId: string) {
  const [account, memberships, eventTeams, tasks, actions, sessions, apiTokens, connectedApps] = await Promise.all([
    one("SELECT id, name, email, phone, department, avatar_url, email_verified_at, created_at, (google_sub IS NOT NULL) AS google_linked FROM users WHERE id = $1", [userId]),
    query("SELECT s.name AS society, u.name AS university, m.role, m.department, m.created_at AS joined_at FROM memberships m JOIN societies s ON s.id = m.society_id LEFT JOIN universities u ON u.id = s.university_id WHERE m.user_id = $1 ORDER BY m.created_at", [userId]),
    query("SELECT e.title AS event, e.date, em.role, em.added_at FROM event_members em JOIN events e ON e.id = em.event_id WHERE em.user_id = $1 ORDER BY e.date", [userId]),
    query("SELECT e.title AS event, t.title, t.status, t.due_date FROM tasks t JOIN events e ON e.id = t.event_id WHERE t.owner_id = $1 ORDER BY t.due_date", [userId]),
    query("SELECT action, event_id, created_at FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5000", [userId]),
    query("SELECT created_at, last_seen_at, expires_at, user_agent, ip FROM sessions WHERE user_id = $1 ORDER BY created_at DESC", [userId]),
    query("SELECT name, prefix, created_at, last_used_at, expires_at, revoked_at FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC", [userId]),
    query("SELECT c.name AS app, t.scope, t.created_at, t.revoked_at FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.id = t.client_id WHERE t.user_id = $1 ORDER BY t.created_at DESC", [userId]),
  ]);
  return {
    exported_at: new Date().toISOString(),
    note: "Your personal data held by Movents. Society records you helped create (events, budgets, files) belong to your society; ask a President for a copy.",
    account,
    memberships,
    event_teams: eventTeams,
    tasks_assigned_to_you: tasks,
    your_actions: actions,
    sign_in_sessions: sessions,
    api_tokens: apiTokens,
    connected_apps: connectedApps,
  };
}

export async function endAllSessions(userId: string) {
  await query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}
