import "server-only";
import { id, query } from "../db";
import { hashToken, randomToken } from "./tokens";

export type ApiTokenRow = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null };

export function listApiTokens(userId: string) {
  return query<ApiTokenRow>(
    "SELECT id, name, prefix, created_at, last_used_at FROM api_tokens WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC",
    [userId],
  );
}

/** Returns the token once; only its hash is stored. */
export async function createApiToken(userId: string, name: string) {
  const clean = name.trim().slice(0, 60) || "AI assistant";
  const n = await query<{ n: number }>("SELECT count(*)::int AS n FROM api_tokens WHERE user_id = $1 AND revoked_at IS NULL", [userId]);
  if ((n[0]?.n ?? 0) >= 20) throw new Error("You have 20 active tokens. Revoke one first.");
  const token = randomToken("mvp_");
  await query("INSERT INTO api_tokens (id, user_id, name, token_hash, prefix) VALUES ($1, $2, $3, $4, $5)", [id("tok"), userId, clean, hashToken(token), token.slice(0, 10)]);
  return token;
}

export async function revokeApiToken(userId: string, tokenId: string) {
  await query("UPDATE api_tokens SET revoked_at = now() WHERE id = $1 AND user_id = $2", [tokenId, userId]);
}

export function listOAuthGrants(userId: string) {
  return query<{ client_id: string; name: string; created_at: string }>(
    `SELECT c.id AS client_id, c.name, min(t.created_at) AS created_at FROM oauth_tokens t JOIN oauth_clients c ON c.id = t.client_id
     WHERE t.user_id = $1 AND t.revoked_at IS NULL AND (t.refresh_expires_at > now() OR t.access_expires_at > now())
     GROUP BY c.id, c.name ORDER BY created_at DESC`,
    [userId],
  );
}

export async function revokeOAuthGrant(userId: string, clientId: string) {
  await query("UPDATE oauth_tokens SET revoked_at = now() WHERE user_id = $1 AND client_id = $2 AND revoked_at IS NULL", [userId, clientId]);
}
