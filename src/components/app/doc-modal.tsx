"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Download, X } from "lucide-react";

/** Click the trigger to read a generated document in place, with a download button. */
export function DocModal({ href, title, children, className }: { href: string; title: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} className="fixed inset-0 z-[80] grid place-items-center bg-ink/40 p-4 backdrop-blur-sm">
                <motion.div
                  initial={{ y: 24, scale: 0.97 }}
                  animate={{ y: 0, scale: 1 }}
                  exit={{ y: 24, scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card shadow-[6px_6px_0_0_#161514]"
                >
                  <div className="flex items-center gap-3 border-b-[1.5px] border-ink px-4 py-2.5">
                    <p className="min-w-0 flex-1 truncate font-display font-bold">{title}</p>
                    <a href={href} download className="flex h-8 items-center gap-1.5 rounded-lg border-[1.5px] border-ink bg-sun px-2.5 text-xs font-semibold"><Download className="size-3.5" />PDF</a>
                    <button onClick={() => setOpen(false)} aria-label="Close" className="grid size-8 place-items-center rounded-lg hover:bg-sand"><X className="size-4" /></button>
                  </div>
                  <iframe src={`${href}#toolbar=0&view=FitH`} title={title} className="min-h-0 flex-1 bg-sand" />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
