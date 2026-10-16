"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, IdCard, Loader2, Package, Pencil, Ribbon, Shirt, Utensils, X } from "lucide-react";

const CAT_ICON: Record<string, typeof Package> = { food: Utensils, tshirt: Shirt, lanyard: Ribbon, cardholder: IdCard };
const CAT_LABEL: Record<string, string> = { food: "Food", tshirt: "T-shirts", lanyard: "Lanyards", cardholder: "Card holders" };
import { toast } from "sonner";
import { swapSupplier } from "@/app/actions";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string; url: string | null; unit_price: number | null; unit: string | null; selected: boolean; snippet: string | null; locked: boolean };

const rm = (n: number) => `RM${n.toLocaleString("en-MY", { maximumFractionDigits: 2 })}`;
const clean = (n: string) => n.split(" — ")[0];

/** One row per category: the chosen supplier. "Change" opens the other quotes. */
export function SupplierPicks({ groups }: { groups: { category: string; total: number | null; options: Option[] }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  return (
    <ul>
      {groups.map((g, gi) => {
        const pick = g.options.find((o) => o.selected) ?? g.options[0];
        const others = g.options.filter((o) => o.id !== pick?.id).sort((a, b) => (a.unit_price ?? 0) - (b.unit_price ?? 0));
        const isOpen = open === g.category;
        return (
          <motion.li key={g.category} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: gi * 0.05 }} className="border-b border-border">
            <div className="group/row flex items-center gap-4 py-3">
              {(() => {
                const I = CAT_ICON[g.category] ?? Package;
                return (
                  <span title={CAT_LABEL[g.category] ?? g.category} className="grid size-9 shrink-0 place-items-center rounded-lg border-[1.5px] border-ink bg-sand transition-transform group-hover/row:-rotate-6">
                    <I className="size-4" />
                  </span>
                );
              })()}
              <span className="w-24 shrink-0 text-sm text-muted-foreground">{CAT_LABEL[g.category] ?? g.category}</span>
              <a href={pick?.url ?? "#"} target="_blank" rel="noreferrer" title={pick?.snippet ?? undefined} className="group flex min-w-0 flex-1 items-center gap-1 font-medium hover:text-tomato-ink">
                <span className="truncate">{pick ? clean(pick.name) : "None"}</span>
                <ArrowUpRight className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
              <span className="w-24 text-right font-mono text-xs text-muted-foreground">{pick?.unit_price != null ? `${rm(pick.unit_price)}/${pick.unit}` : ""}</span>
              <span className="w-20 text-right font-mono text-sm font-bold">{g.total != null ? rm(g.total) : ""}</span>
              {others.length > 0 && (
                <button onClick={() => setOpen(isOpen ? null : g.category)} aria-label={isOpen ? "Close" : "Change supplier"} title={isOpen ? "Close" : `${others.length} other quotes`} className={cn("grid size-8 place-items-center rounded-lg border-[1.5px] transition-all", isOpen ? "border-ink bg-ink text-white" : "border-ink/20 text-muted-foreground hover:rotate-[-8deg] hover:border-ink hover:text-ink")}>
                  {isOpen ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}
                </button>
              )}
            </div>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden pb-3 pl-[9.5rem]">
                  {others.map((o) => {
                    const diff = (o.unit_price ?? 0) - (pick?.unit_price ?? 0);
                    return (
                      <li key={o.id} className="flex items-center gap-4 rounded-lg px-2 py-1.5 text-sm hover:bg-sand/50">
                        <a href={o.url ?? "#"} target="_blank" rel="noreferrer" title={o.snippet ?? undefined} className="min-w-0 flex-1 truncate hover:underline">{clean(o.name)}</a>
                        <span className="font-mono text-xs text-muted-foreground">{o.unit_price != null ? `${rm(o.unit_price)}/${o.unit}` : ""}</span>
                        <span className={cn("w-16 text-right font-mono text-xs font-bold", diff < 0 ? "text-[#2f7d3b]" : diff > 0 ? "text-tomato-ink" : "text-muted-foreground")}>{diff === 0 ? "same" : `${diff > 0 ? "+" : "-"}${rm(Math.abs(diff))}`}</span>
                        <button
                          disabled={busy !== null || pick?.locked}
                          title={pick?.locked ? "Current supplier is signed or paid" : undefined}
                          onClick={() => {
                            setBusy(o.id);
                            start(async () => {
                              const r = await swapSupplier(o.id);
                              if (r.ok) toast.success(r.message ?? "Switched");
                              else toast.error(r.error);
                              setBusy(null);
                              setOpen(null);
                              router.refresh();
                            });
                          }}
                          className="grid h-7 w-14 place-items-center rounded-lg border-[1.5px] border-ink bg-sun text-xs font-semibold shadow-[2px_2px_0_0_#161514] transition-transform active:translate-y-px disabled:opacity-40"
                        >
                          {busy === o.id ? <Loader2 className="size-3.5 animate-spin" /> : "Use"}
                        </button>
                      </li>
                    );
                  })}
                </motion.ul>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ul>
  );
}
