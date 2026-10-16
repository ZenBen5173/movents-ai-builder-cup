import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

if (!process.env.DATABASE_URL) process.env.PGLITE_DIR = "memory://";
const { signToken, verifyToken } = await import("../src/lib/appurl");
const { validateArgs, InvalidArgs } = await import("../src/lib/agent/validate");
const { sniff, toMedia } = await import("../src/lib/media");
const { publicError } = await import("../src/lib/errors");
const { safeNext } = await import("../src/lib/auth/tokens");
const O = await import("../src/lib/oauth");
const { findOrCreateUser } = await import("../src/lib/auth/accounts");

test("signed links are bound to their purpose and expire", () => {
  const t = signToken("faculty:apr_1", 1);
  assert.equal(verifyToken("faculty:apr_1", t), true);
  assert.equal(verifyToken("upload:apr_1", t), false);
  assert.equal(verifyToken("faculty:apr_2", t), false);
  assert.equal(verifyToken("faculty:apr_1", signToken("faculty:apr_1", -1)), false);
  assert.equal(verifyToken("faculty:apr_1", "garbage"), false);
});

test("tool arguments are validated and unknown keys dropped", () => {
  const schema = { type: "object", properties: { event_id: { type: "string" }, n: { type: "number" }, kind: { type: "string", enum: ["a", "b"] } }, required: ["event_id"] };
  assert.deepEqual(validateArgs(schema, { event_id: "evt_1", n: "3", extra: "x" }), { event_id: "evt_1", n: 3 });
  assert.throws(() => validateArgs(schema, {}), InvalidArgs);
  assert.throws(() => validateArgs(schema, { event_id: "e", kind: "c" }), /must be one of/);
  assert.throws(() => validateArgs(schema, { event_id: { $ne: 1 } }), /must be a string/);
});

test("media: real image types pass, SVG and HTML are refused", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
  assert.equal(sniff(png), "image/png");
  assert.throws(() => toMedia(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), /Unsupported/);
  assert.throws(() => toMedia(Buffer.from("<html><script>alert(1)</script></html>")), /Unsupported/);
});

test("middleware keeps the Authorization header only where routes check it themselves", async () => {
  const { NextRequest } = await import("next/server");
  const { middleware } = await import("../src/middleware");
  const run = (path: string) => middleware(new NextRequest(`https://movents.test${path}`, { headers: { authorization: "Bearer x", accept: "text/plain" } }));
  // Header untouched: no request-header override from middleware.
  assert.equal(run("/api/cron/daily").headers.get("x-middleware-override-headers"), null, "cron must receive CRON_SECRET");
  assert.equal(run("/api/mcp").headers.get("x-middleware-override-headers"), null);
  // Elsewhere the header is stripped, so tokens can't drive pages or other APIs.
  const stripped = run("/api/health").headers.get("x-middleware-override-headers") ?? "";
  assert.ok(stripped.split(",").includes("accept") && !stripped.split(",").includes("authorization"), "authorization removed on other routes");
});

test("browser uploads may only write to their own creative's folder", async () => {
  const { uploadKeyOk } = await import("../src/lib/marketing");
  assert.equal(uploadKeyOk("crv_a1", "creatives/crv_a1/1791899337018.png"), true);
  assert.equal(uploadKeyOk("crv_a1", "creatives/crv_b2/1791899337018.png"), false);
  assert.equal(uploadKeyOk("crv_a1", "creatives/crv_a1/../crv_b2/1791899337018.png"), false);
  assert.equal(uploadKeyOk("crv_a1", "creatives/crv_a1/1791899337018.svg"), false);
  assert.equal(uploadKeyOk("crv_a1", "creatives/crv_a1/evil.png"), false);
});

test("database errors are not shown to users; deliberate messages are", () => {
  const pg = Object.assign(new Error('relation "x" does not exist'), { severity: "ERROR", code: "42P01" });
  const orig = console.error;
  console.error = () => {};
  assert.match(publicError(pg), /Something went wrong/);
  console.error = orig;
  assert.equal(publicError(new Error("Pick a role.")), "Pick a role.");
});

test("sign-in redirects stay on this site", () => {
  assert.equal(safeNext("/events/1"), "/events/1");
  assert.equal(safeNext("//evil.com"), "/");
  assert.equal(safeNext("https://evil.com"), "/");
  assert.equal(safeNext("/\\evil.com"), "/");
});

test("data export has the person's own records and no token secrets", async () => {
  const { exportAccount } = await import("../src/lib/auth/accounts");
  const { createApiToken } = await import("../src/lib/auth/api-tokens");
  const user = await findOrCreateUser({ email: `export-${crypto.randomUUID()}@uni.test`, verified: true });
  const token = await createApiToken(user.id, "Laptop");
  const data = await exportAccount(user.id);
  const json = JSON.stringify(data);
  assert.equal((data.account as { email: string }).email, user.email);
  assert.equal(data.api_tokens.length, 1);
  assert.ok(!json.includes(token), "full token must not appear");
  assert.ok(!/token_hash|access_hash|refresh_hash|api_key/.test(json), "no hashes or legacy keys");
});

test("OAuth: redirect URIs are restricted", () => {
  assert.equal(O.validRedirect("https://claude.ai/api/mcp/auth_callback"), true);
  assert.equal(O.validRedirect("http://localhost:6274/cb"), true);
  assert.equal(O.validRedirect("cursor://anysphere.cursor-mcp/oauth/callback"), true);
  assert.equal(O.validRedirect("http://evil.com/cb"), false);
  assert.equal(O.validRedirect("javascript:alert(1)"), false);
});

test("OAuth: code needs the right PKCE verifier, works once, refresh rotates", async () => {
  const user = await findOrCreateUser({ email: `oauth-${crypto.randomUUID()}@uni.test`, verified: true });
  const c = await O.registerClient({ client_name: "Test", redirect_uris: ["https://client.test/cb"] });
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const p = { client_id: c.client_id, redirect_uri: "https://client.test/cb", code_challenge: challenge };
  const bad = await O.issueCode(user.id, p);
  await assert.rejects(O.exchangeCode({ ...p, code: bad, code_verifier: "wrong" }), /PKCE/);
  const code = await O.issueCode(user.id, p);
  const t = await O.exchangeCode({ ...p, code, code_verifier: verifier });
  assert.match(t.access_token, /^mvo_/);
  await assert.rejects(O.exchangeCode({ ...p, code, code_verifier: verifier }), /Invalid or expired/);
  const t2 = await O.refreshTokens({ refresh_token: t.refresh_token, client_id: c.client_id });
  assert.notEqual(t2.access_token, t.access_token);
  await assert.rejects(O.refreshTokens({ refresh_token: t.refresh_token, client_id: c.client_id }), /Invalid or expired/);
});

test("media fetch refuses private and internal addresses", async () => {
  const { fetchMedia } = await import("../src/lib/media");
  await assert.rejects(fetchMedia("https://127.0.0.1/x.png"), /private/);
  await assert.rejects(fetchMedia("https://[::1]/x.png"), /private/);
  await assert.rejects(fetchMedia("https://localhost/x.png"), /private/);
  await assert.rejects(fetchMedia("http://example.com/x.png"), /https/);
});

test("sign-in redirect refuses control-character tricks", () => {
  assert.equal(safeNext("/\t/evil.com"), "/");
  assert.equal(safeNext("/\n/evil.com"), "/");
  assert.equal(safeNext("/events?x=1#y"), "/events?x=1#y");
});
