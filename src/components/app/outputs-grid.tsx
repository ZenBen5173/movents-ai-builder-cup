"use client";

import { motion } from "motion/react";
import { ArrowDownToLine } from "lucide-react";
import type { IconName } from "@/components/ep/icons";
import { Icon, useRowIcon } from "@/components/ep/kit";

export type OutputItem = { label: string; href: string; kind: string; note?: string };

const ICON: Record<string, IconName> = { pdf: "file-text", docx: "file-type", xlsx: "file-spreadsheet", csv: "sheet", ics: "calendar-days", link: "calendar-plus" };
const TONE: Record<string, string> = { pdf: "bg-peach", docx: "bg-sky", xlsx: "bg-mint", csv: "bg-mint", ics: "bg-sun", link: "bg-sun" };

function FileRow({ o, i }: { o: OutputItem; i: number }) {
  const row = useRowIcon();
  return (
    <motion.a
      href={o.href}
      target="_blank"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.035, duration: 0.3 }}
      onMouseEnter={row.onMouseEnter}
      onMouseLeave={row.onMouseLeave}
      className="group grid grid-cols-[40px_1fr_auto] items-center gap-3 border-b border-border py-3 transition-colors hover:bg-sand/40"
    >
      <span className={`grid size-10 place-items-center rounded-xl border-[1.5px] border-ink ${TONE[o.kind] ?? "bg-card"} transition-transform group-hover:-rotate-6`}>
        <Icon ref={row.ref} name={ICON[o.kind] ?? "file"} size={17} manual />
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">{o.label}</span>
        {o.note && <span className="block truncate text-xs text-muted-foreground">{o.note}</span>}
      </span>
      <span className="flex items-center gap-3">
        <span className="mono-label text-[10px] text-muted-foreground">.{o.kind === "link" ? "web" : o.kind}</span>
        <ArrowDownToLine className="size-4 -translate-y-0.5 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100" />
      </span>
    </motion.a>
  );
}

/** Files as a plain list, Notion-style — each one rendered live when opened. */
export function OutputsGrid({ items }: { items: OutputItem[] }) {
  return <div className="border-t-[1.5px] border-ink">{items.map((o, i) => <FileRow key={o.href} o={o} i={i} />)}</div>;
}
