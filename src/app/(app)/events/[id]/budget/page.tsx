import { FileSpreadsheet, RefreshCcw } from "lucide-react";
import { loadBundle, budgetTotals } from "@/lib/docs/builders";
import { Card } from "@/components/app/ui";
import { BudgetTable } from "@/components/app/budget-table";
import { BudgetBar } from "@/components/app/budget-bar";
import { BudgetCharts } from "@/components/app/budget-charts";
import { ActionButton } from "@/components/app/action-button";
import { SupplierPicks } from "@/components/app/supplier-picks";
import { rerunBudget } from "@/app/actions";
import { canViewEvent } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canViewEvent(id))) return null;
  const b = (await loadBundle(id))!;
  const sop = b.university!.sop;
  const t = budgetTotals(b.lines, sop.budget_rules.contingency_pct);
  const byCat = new Map<string, number>();
  for (const l of b.lines) byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.estimated);
  return (
    <div className="space-y-12">
      <Card title="Spend" surface>
        <div className="space-y-6">
          <BudgetCharts cap={b.event.budget_cap} spent={t.actual} planned={t.subtotal} contingency={t.contingency} categories={[...byCat].map(([name, value]) => ({ name, value }))} />
          <BudgetBar estimate={t.subtotal} contingency={t.contingency} cap={b.event.budget_cap} approved={b.event.approved_budget} actual={t.actual} alertPct={sop.budget_rules.alert_pct} />
        </div>
      </Card>

      <Card
        title="Budget sheet"
        surface
        actions={
          <div className="flex gap-2">
            <ActionButton action={rerunBudget.bind(null, id)} size="xs" icon={<RefreshCcw className="size-3.5" />} confirm="Recompose the budget from current supplier quotes? Actuals will be cleared.">Re-run</ActionButton>
            <a href={`/api/outputs/${id}/budget.xlsx`} className="inline-flex h-7 items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-[#46a758] px-2 text-xs font-medium text-white"><FileSpreadsheet className="size-3.5" />.xlsx</a>
            <a href={`/api/outputs/${id}/budget.csv`} className="inline-flex h-7 items-center rounded-lg border-[1.5px] border-ink/20 px-2 text-xs hover:border-ink">.csv</a>
          </div>
        }
      >
        <BudgetTable
          lines={b.lines.map((l) => ({ ...l, vendor: b.vendors.find((v) => v.id === l.vendor_id)?.name ?? null }))}
          totals={{ ...t, cap: b.event.budget_cap, pct: sop.budget_rules.contingency_pct }}
        />
      </Card>

      <Card title="Suppliers" surface>
        <SupplierPicks
          groups={[...new Set(b.vendors.map((v) => v.category))].map((cat) => {
            const opts = b.vendors.filter((v) => v.category === cat);
            const chosen = opts.find((v) => v.selected);
            const line = b.lines.find((l) => l.vendor_id === chosen?.id);
            return {
              category: cat,
              total: line?.estimated ?? null,
              options: opts.map((v) => ({ id: v.id, name: v.name, url: v.url, unit_price: v.unit_price, unit: v.unit, selected: v.selected, snippet: v.snippet, locked: v.contract_status === "signed" || v.deposit_status === "paid" })),
            };
          })}
        />
      </Card>
    </div>
  );
}
