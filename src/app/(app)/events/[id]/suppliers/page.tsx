import { IdCard, Package, Ribbon, Shirt, Utensils } from "lucide-react";
import { loadBundle } from "@/lib/docs/builders";
import { query } from "@/lib/db";
import { fmtRM } from "@/lib/appurl";
import { Card } from "@/components/app/ui";
import { VendorRowActions } from "@/components/app/people-forms";
import { cn } from "@/lib/utils";
import { canViewEvent } from "@/lib/guard";

export const dynamic = "force-dynamic";

const STEPS = ["Quote", "Contract", "Deposit"] as const;
const CAT_ICON: Record<string, typeof Package> = { food: Utensils, tshirt: Shirt, lanyard: Ribbon, cardholder: IdCard };
const CAT_LABEL: Record<string, string> = { food: "Food", tshirt: "T-shirts", lanyard: "Lanyards", cardholder: "Card holders" };

/** Chosen suppliers only, each with a three-step track: quote, contract, deposit. Swap suppliers on the Budget page. */
export default async function SuppliersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const b = (await loadBundle(id))!;
  const payments = await query<{ vendor_id: string; checkout_url: string; status: string }>("SELECT * FROM payments WHERE event_id = $1 ORDER BY created_at DESC", [id]);
  const chosen = b.vendors.filter((v) => v.selected);
  return (
    <Card title="Suppliers" surface actions={<a href={`/events/${id}/budget`} className="text-xs font-medium text-tomato-ink hover:underline">Change on Budget</a>}>
      <div className="-mx-4 -my-4 overflow-x-auto">
        <table className="w-full min-w-[820px] table-fixed text-sm">
          <colgroup>
            <col className="w-[150px]" />
            <col />
            <col className="w-[110px]" />
            <col className="w-[150px]" />
            <col className="w-[300px]" />
          </colgroup>
          <thead>
            <tr className="mono-label border-b-[1.5px] border-ink bg-sand/50 text-left text-[10px] text-muted-foreground">
              <th className="px-4 py-2.5 font-normal">Item</th>
              <th className="py-2.5 font-normal">Supplier</th>
              <th className="py-2.5 pr-4 text-right font-normal">Quote</th>
              <th className="py-2.5 font-normal">Progress</th>
              <th className="py-2.5 pr-4 text-right font-normal"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {chosen.map((v) => {
              const done = [v.quote != null, v.contract_status === "signed", v.deposit_status === "paid"];
              const tips = [
                v.quote != null ? `Quote ${fmtRM(v.quote)}` : "No quote yet",
                v.contract_status === "signed" ? "Contract signed" : v.contract_status === "sent" ? "Contract sent" : "No contract yet",
                v.deposit_status === "paid" ? `Deposit ${fmtRM(v.deposit_amount)} paid` : v.deposit_status === "none" ? "No deposit yet" : "Deposit waiting",
              ];
              const I = CAT_ICON[v.category] ?? Package;
              return (
                <tr key={v.id} className="group border-b border-border align-middle transition-colors last:border-b-0 hover:bg-sand/30">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2.5">
                      <span className="grid size-8 place-items-center rounded-lg border-[1.5px] border-ink bg-sand transition-transform group-hover:-rotate-6"><I className="size-4" /></span>
                      {CAT_LABEL[v.category] ?? v.category}
                    </span>
                  </td>
                  <td className="truncate py-3 pr-3">
                    <a href={v.url ?? "#"} target="_blank" rel="noreferrer" title={v.snippet ?? undefined} className="font-semibold hover:text-tomato-ink">{v.name.split(" — ")[0]}</a>
                  </td>
                  <td className="py-3 pr-4 text-right font-mono font-bold">{fmtRM(v.quote)}</td>
                  <td className="py-3">
                    <ol className="flex items-center">
                      {STEPS.map((st, i) => (
                        <li key={st} className="flex items-center">
                          {i > 0 && <span className={cn("h-[2px] w-5", done[i] ? "bg-ink" : "bg-ink/15")} />}
                          <span title={tips[i]} className={cn("grid size-7 place-items-center rounded-full border-[1.5px] font-mono text-[10px] font-bold transition-transform hover:scale-110", done[i] ? "border-ink bg-mint" : "border-dashed border-ink/30 text-muted-foreground")}>{st[0]}</span>
                        </li>
                      ))}
                    </ol>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    <VendorRowActions vendor={v} eventId={id} checkoutUrl={payments.find((p) => p.vendor_id === v.id && p.status === "pending")?.checkout_url ?? null} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
