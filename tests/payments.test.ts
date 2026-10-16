import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyStripeSignature } from "../src/lib/integrations/payments";

test("stripe webhook signature: accepts valid, rejects tampered/stale", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ type: "checkout.session.completed" });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  assert.equal(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret), true);
  assert.equal(verifyStripeSignature(body + " ", `t=${t},v1=${sig}`, secret), false);
  assert.equal(verifyStripeSignature(body, `t=${t - 3600},v1=${sig}`, secret), false);
  assert.equal(verifyStripeSignature(body, null, secret), false);
});
