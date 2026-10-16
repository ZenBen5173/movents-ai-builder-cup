import { NextResponse } from "next/server";
import { one, update } from "@/lib/db";
import { audit } from "@/lib/audit";
import { verifyStripeSignature } from "@/lib/integrations/payments";

/** Stripe webhook: marks a vendor deposit paid when Checkout completes. */
export async function POST(req: Request) {
  const payload = await req.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }
  const event = JSON.parse(payload) as {
    type: string;
    data: { object: { client_reference_id?: string; metadata?: { payment_id?: string }; payment_status?: string; amount_total?: number } };
  };
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const obj = event.data.object;
    const pid = obj.metadata?.payment_id ?? obj.client_reference_id;
    const pay = pid ? await one<{ id: string; vendor_id: string; event_id: string; amount: number; status: string }>("SELECT * FROM payments WHERE id = $1", [pid]) : null;
    const paidInFull = obj.payment_status === "paid" && (obj.amount_total == null || obj.amount_total >= Math.round(Number(pay?.amount ?? 0) * 100));
    if (pay && pay.status !== "paid" && paidInFull) {
      await update("payments", pay.id, { status: "paid", paid_at: new Date() });
      await update("vendors", pay.vendor_id, { deposit_status: "paid" });
      await audit({ id: null, name: "Stripe" }, "payment.deposit_paid", { payment_id: pay.id, amount: pay.amount }, { eventId: pay.event_id });
    }
  }
  return NextResponse.json({ received: true });
}
