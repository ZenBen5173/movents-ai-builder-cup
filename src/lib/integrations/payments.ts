import "server-only";
import crypto from "node:crypto";

import { appUrl } from "../appurl";

/**
 * Vendor deposits through Stripe Checkout when STRIPE_SECRET_KEY is set.
 * Without a key, development gets an in-app test checkout; production
 * reports payments as not configured.
 */
export function paymentsMode(): "stripe" | "mock" | "off" {
  if (process.env.STRIPE_SECRET_KEY) return "stripe";
  return process.env.NODE_ENV === "production" ? "off" : "mock";
}

export async function createCheckout(p: { paymentId: string; amount: number; description: string; currency?: string }) {
  if (paymentsMode() === "off") throw new Error("Online payments are not set up for this workspace. Pay the supplier directly and record it.");
  if (paymentsMode() === "mock") {
    return { url: `${appUrl()}/pay/${p.paymentId}`, ref: `mock_${p.paymentId}` };
  }
  const body = new URLSearchParams({
    mode: "payment",
    success_url: `${appUrl()}/pay/${p.paymentId}?status=success`,
    cancel_url: `${appUrl()}/pay/${p.paymentId}?status=cancelled`,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": p.currency ?? "myr",
    "line_items[0][price_data][unit_amount]": String(Math.round(p.amount * 100)),
    "line_items[0][price_data][product_data][name]": p.description,
    client_reference_id: p.paymentId,
    "metadata[payment_id]": p.paymentId,
  });
  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { id: string; url: string };
  return { url: json.url, ref: json.id };
}

export async function retrieveCheckout(ref: string) {
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${ref}`, {
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Stripe ${res.status}`);
  return (await res.json()) as { payment_status: string; status: string };
}

/** Verifies a Stripe-Signature header (v1 HMAC-SHA256) without the SDK. */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, toleranceSec = 300) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}
