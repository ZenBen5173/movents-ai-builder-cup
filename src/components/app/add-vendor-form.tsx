"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { addVendor } from "@/app/actions";

const input = "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

export function AddVendorForm({ universityId }: { universityId?: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ category: "food", name: "", url: "", unit_price: "", unit: "pax", contact_email: "", rating: "" });
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">
        <Plus className={`size-4 transition-transform ${open ? "rotate-45" : ""}`} /> Add vendor
      </button>
      <AnimatePresence>
        {open && (
          <motion.form
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await addVendor({ category: f.category, name: f.name, url: f.url, unit_price: Number(f.unit_price), unit: f.unit, contact_email: f.contact_email, rating: f.rating ? Number(f.rating) : null, university_id: universityId });
                if (!r.ok) return void toast.error(r.error);
                toast.success("Vendor added");
                setOpen(false);
                router.refresh();
              });
            }}
            className="absolute right-0 top-full z-30 mt-2 grid w-80 gap-2 rounded-xl border border-border bg-popover p-3 shadow-xl"
          >
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, unit: e.target.value === "food" ? "pax" : "piece" })} className={input}>
              <option value="food">Food catering</option>
              <option value="tshirt">T-shirts</option>
              <option value="lanyard">Lanyards</option>
              <option value="cardholder">Card holders</option>
              <option value="av">AV / equipment</option>
              <option value="printing">Printing</option>
            </select>
            <input required placeholder="Vendor name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
            <input placeholder="Website / quote URL" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} className={input} />
            <div className="flex gap-2">
              <input required placeholder="Unit price (RM)" inputMode="decimal" value={f.unit_price} onChange={(e) => setF({ ...f, unit_price: e.target.value })} className={input} />
              <input placeholder="Rating 1-5" inputMode="decimal" value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })} className={input} />
            </div>
            <input type="email" placeholder="Contact email" value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} className={input} />
            <button disabled={pending} className="h-9 rounded-lg bg-primary text-sm text-primary-foreground">{pending ? "Saving…" : "Save vendor"}</button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
