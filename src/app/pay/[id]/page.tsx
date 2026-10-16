import { notFound } from "next/navigation";
import { CreditCard } from "lucide-react";
import { one } from "@/lib/db";
import { fmtRM } from "@/lib/appurl";
import { PayButton } from "./pay-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deposit checkout" };

export default async function PayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string }> }) {
  const { id } = await params;
  const { status } = await searchParams;
  const p = await one<{ id: string; amount: number; status: string; provider: string; vendor: string; event: string | null }>(
    "SELECT p.*, v.name AS vendor, e.title AS event FROM payments p JOIN vendors v ON v.id = p.vendor_id LEFT JOIN events e ON e.id = p.event_id WHERE p.id = $1",
    [id],
  );
  if (!p) notFound();
  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-sm rounded-2xl border-[1.5px] border-ink bg-card p-6 shadow-[4px_4px_0_0_#161514]">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><CreditCard className="size-4" />{p.provider === "stripe" ? "Secure checkout by Stripe" : "Test checkout, no real money moves"}</div>
        <p className="mt-4 text-sm text-muted-foreground">Deposit to</p>
        <p className="font-semibold">{p.vendor}</p>
        {p.event && <p className="text-xs text-muted-foreground">for {p.event}</p>}
        <p className="mt-4 text-3xl font-semibold tabular">{fmtRM(p.amount)}</p>
        {status === "cancelled" && <p className="mt-2 text-sm text-[var(--red-11)]">Payment was cancelled.</p>}
        <PayButton id={p.id} paid={p.status === "paid"} provider={p.provider} returned={status === "success"} />
      </div>
    </div>
  );
}
