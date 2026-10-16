"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, LayoutGrid, Search, Star, Table2 } from "lucide-react";
import { VendorTable } from "@/components/app/vendor-table";
import { SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type GalleryVendor = {
  id: string;
  name: string;
  category: string;
  unit_price: number | null;
  unit: string | null;
  rating: number | null;
  url: string | null;
  snippet: string | null;
  photo: string;
  used: number;
};

const LABEL: Record<string, string> = { food: "Food", tshirt: "T-shirts", lanyard: "Lanyards", cardholder: "Card holders", av: "AV", printing: "Printing" };
const ORDER = ["food", "tshirt", "lanyard", "cardholder", "av", "printing"];

function Stars({ value }: { value: number | null }) {
  const v = value ?? 0;
  return (
    <span title={value ? `${value.toFixed(1)} from past events` : "Not rated yet"} className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("size-3.5", i <= Math.round(v) ? "fill-sun text-ink" : "text-ink/20")} strokeWidth={1.5} />
      ))}
      <span className="ml-1 font-mono text-[11px] text-muted-foreground">{value ? value.toFixed(1) : "new"}</span>
    </span>
  );
}

/** Approved vendors as a photo wall, switched by category. The editable table is one click away. */
export function VendorGallery({ vendors, rows }: { vendors: GalleryVendor[]; rows: Record<string, unknown>[] }) {
  const cats = ORDER.filter((c) => vendors.some((v) => v.category === c)).concat([...new Set(vendors.map((v) => v.category))].filter((c) => !ORDER.includes(c)));
  const [cat, setCat] = useState(cats[0] ?? "food");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "table">("grid");
  const shown = vendors.filter((v) => v.category === cat && v.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end gap-4 border-b-[1.5px] border-ink">
        {view === "grid" && (
          <nav className="flex gap-6">
            {cats.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cn("relative pb-2.5 text-sm transition-colors", cat === c ? "font-semibold" : "text-muted-foreground hover:text-ink")}>
                {LABEL[c] ?? c} <span className="font-mono text-xs">{vendors.filter((v) => v.category === c).length}</span>
                {cat === c && <motion.span layoutId="vendor-cat" className="absolute inset-x-0 -bottom-px h-[3px] rounded-t bg-tomato" transition={SPRING.default} />}
              </button>
            ))}
          </nav>
        )}
        <div className="mb-2 ml-auto flex items-center gap-2">
          {view === "grid" && (
            <label className="flex h-9 items-center gap-2 rounded-xl border-[1.5px] border-ink/20 bg-card px-3 transition-colors focus-within:border-ink">
              <Search className="size-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-36 bg-transparent text-sm outline-none" />
            </label>
          )}
          <div className="flex rounded-xl border-[1.5px] border-ink bg-card p-0.5">
            {(["grid", "table"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-label={v} className={cn("relative grid size-8 place-items-center rounded-[9px]", view === v ? "text-white" : "text-ink/60 hover:text-ink")}>
                {view === v && <motion.span layoutId="vendor-view" className="absolute inset-0 rounded-[9px] bg-ink" transition={SPRING.default} />}
                <span className="relative">{v === "grid" ? <LayoutGrid className="size-4" /> : <Table2 className="size-4" />}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "table" ? (
        <VendorTable rows={rows} />
      ) : (
        <AnimatePresence mode="wait">
          <motion.ul key={cat} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22 }} className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((v, i) => (
              <motion.li key={v.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <a href={v.url ?? "#"} target="_blank" rel="noreferrer" className="group block">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl border-[1.5px] border-ink bg-sand shadow-[3px_3px_0_0_#161514] transition-all group-hover:-translate-y-0.5 group-hover:shadow-[5px_5px_0_0_#161514]">
                    { }
                    <img src={v.photo} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    {v.unit_price != null && (
                      <span className="absolute left-3 top-3 rounded-md border-[1.5px] border-ink bg-card px-2 py-0.5 font-mono text-xs font-bold">
                        RM{v.unit_price}
                        <span className="font-normal text-muted-foreground">/{v.unit}</span>
                      </span>
                    )}
                    {v.used > 0 && (
                      <span title={`Picked for ${v.used} past or current event${v.used > 1 ? "s" : ""}`} className="absolute right-3 top-3 rotate-6 rounded-md border-[1.5px] border-ink bg-sun px-2 py-0.5 font-mono text-[10px] font-bold uppercase">
                        Used {v.used}x
                      </span>
                    )}
                    {v.snippet && (
                      <span className="absolute inset-x-0 bottom-0 translate-y-full bg-ink/85 px-3 py-2 text-xs text-white transition-transform duration-300 group-hover:translate-y-0">{v.snippet}</span>
                    )}
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1 truncate font-display text-lg font-bold leading-tight transition-colors group-hover:text-tomato-ink">
                        <span className="truncate">{v.name.split(" — ")[0].split(", ")[0]}</span>
                        <ArrowUpRight className="size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{v.name.includes(", ") ? v.name.split(", ").slice(1).join(", ") : v.url ? new URL(v.url).hostname.replace(/^www\./, "") : ""}</p>
                    </div>
                    <Stars value={v.rating} />
                  </div>
                </a>
              </motion.li>
            ))}
            {shown.length === 0 && <li className="col-span-full py-12 text-center font-mono text-xs text-muted-foreground">Nothing here</li>}
          </motion.ul>
        </AnimatePresence>
      )}
    </div>
  );
}
