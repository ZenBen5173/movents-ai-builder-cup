import "server-only";
import crypto from "node:crypto";
import { id, one, query, transaction } from "./db";
import { appUrl } from "./appurl";
import { hashToken, randomToken } from "./auth/tokens";

/**
 * OAuth 2.1 authorization server for MCP clients (authorization code + PKCE,
 * dynamic client registration, rotating refresh tokens). Public clients
 * only: there are no client secrets.
 */
export const ACCESS_TTL_SEC = 3600;
export const REFRESH_TTL_DAYS = 30;
const CODE_TTL_SEC = 600;

export class OAuthError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export const mcpResource = () => `${appUrl()}/api/mcp`;

export function serverMetadata() {
  const base = appUrl();
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  };
}

export function resourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [appUrl()],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
    resource_name: "Movents",
  };
}

/** https anywhere, http only for loopback, or an app's custom scheme (cursor://, vscode://). */
export function validRedirect(uri: string) {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    return /^[a-z][a-z0-9+.-]*:$/.test(u.protocol) && !["javascript:", "data:", "file:", "vbscript:", "blob:", "about:"].includes(u.protocol);
  } catch {
    return false;
  }
}

export async function registerClient(input: { client_name?: unknown; redirect_uris?: unknown }) {
  const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris.map(String) : [];
  if (!uris.length || uris.length > 10 || !uris.every(validRedirect)) throw new OAuthError("invalid_redirect_uri", "redirect_uris must be https, loopback http, or an app scheme");
  const name = String(input.client_name ?? "AI assistant").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80) || "AI assistant";
  const clientId = `mcp_${randomToken("", 16)}`;
  await query("INSERT INTO oauth_clients (id, name, redirect_uris) VALUES ($1, $2, $3)", [clientId, name, JSON.stringify(uris)]);
  return { client_id: clientId, client_name: name, redirect_uris: uris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], client_id_issued_at: Math.floor(Date.now() / 1000) };
}

export function getClient(clientId: string) {
  return one<{ id: string; name: string; redirect_uris: string[] }>("SELECT id, name, redirect_uris FROM oauth_clients WHERE id = $1", [clientId]);
}

/** Validate an /authorize request. Returns the client, or throws without redirecting (unsafe redirect target). */
export async function checkAuthorizeRequest(p: Record<string, string | undefined>) {
  const client = p.client_id ? await getClient(p.client_id) : null;
  if (!client) throw new OAuthError("invalid_client", "Unknown client. Remove the connector and add it again.");
  if (!p.redirect_uri || !client.redirect_uris.includes(p.redirect_uri)) throw new OAuthError("invalid_request", "redirect_uri does not match the registered one.");
  return client;
}

/** Problems that are reported back to the client's redirect_uri. */
export function authorizeParamError(p: Record<string, string | undefined>) {
  if (p.response_type !== "code") return "unsupported_response_type";
  if (!p.code_challenge || p.code_challenge_method !== "S256") return "invalid_request";
  if (p.resource && p.resource.replace(/\/$/, "") !== mcpResource()) return "invalid_target";
  return null;
}

export async function issueCode(userId: string, p: { client_id: string; redirect_uri: string; code_challenge: string; scope?: string; resource?: string }) {
  const code = randomToken("mvc_");
  await query(
    `INSERT INTO oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(secs => $8))`,
    [hashToken(code), p.client_id, userId, p.redirect_uri, p.code_challenge, p.scope ?? "mcp", p.resource ?? null, CODE_TTL_SEC],
  );
  return code;
}

async function issueTokens(clientId: string, userId: string, scope: string) {
  const access = randomToken("mvo_");
  const refresh = randomToken("mvr_");
  await query(
    `INSERT INTO oauth_tokens (id, client_id, user_id, access_hash, refresh_hash, scope, access_expires_at, refresh_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(secs => $7), now() + make_interval(days => $8))`,
    [id("oat"), clientId, userId, hashToken(access), hashToken(refresh), scope, ACCESS_TTL_SEC, REFRESH_TTL_DAYS],
  );
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SEC, refresh_token: refresh, scope };
}

export async function exchangeCode(p: { code?: string; redirect_uri?: string; client_id?: string; code_verifier?: string }) {
  if (!p.code || !p.client_id || !p.code_verifier || !p.redirect_uri) throw new OAuthError("invalid_request", "code, client_id, redirect_uri and code_verifier are required");
  return transaction(async () => {
    const row = await one<{ client_id: string; user_id: string; redirect_uri: string; code_challenge: string; scope: string | null }>(
      "UPDATE oauth_codes SET used_at = now() WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING *",
      [hashToken(p.code!)],
    );
    if (!row || row.client_id !== p.client_id || row.redirect_uri !== p.redirect_uri) throw new OAuthError("invalid_grant", "Invalid or expired authorization code");
    const challenge = crypto.createHash("sha256").update(p.code_verifier!).digest("base64url");
    if (challenge !== row.code_challenge) throw new OAuthError("invalid_grant", "PKCE verification failed");
    return issueTokens(row.client_id, row.user_id, row.scope ?? "mcp");
  });
}

/** Rotate: the old refresh token stops working once used. */
export async function refreshTokens(p: { refresh_token?: string; client_id?: string }) {
  if (!p.refresh_token || !p.client_id) throw new OAuthError("invalid_request", "refresh_token and client_id are required");
  return transaction(async () => {
    const row = await one<{ id: string; client_id: string; user_id: string; scope: string | null }>(
      `UPDATE oauth_tokens SET revoked_at = now()
       WHERE refresh_hash = $1 AND revoked_at IS NULL AND refresh_expires_at > now() RETURNING id, client_id, user_id, scope`,
      [hashToken(p.refresh_token!)],
    );
    if (!row || row.client_id !== p.client_id) throw new OAuthError("invalid_grant", "Invalid or expired refresh token");
    return issueTokens(row.client_id, row.user_id, row.scope ?? "mcp");
  });
}

export async function revokeToken(token: string) {
  const h = hashToken(token);
  await query("UPDATE oauth_tokens SET revoked_at = now() WHERE (access_hash = $1 OR refresh_hash = $1) AND revoked_at IS NULL", [h]);
}
