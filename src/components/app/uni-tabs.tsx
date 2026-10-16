"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";
import { Icon, useRowIcon } from "@/components/ep/kit";
import type { IconName } from "@/components/ep/icons";

export const UNI_PAGES: { seg: string; label: string; icon: IconName }[] = [
  { seg: "", label: "SOP library", icon: "book-open-text" },
  { seg: "venues", label: "Venues", icon: "building-2" },
  { seg: "vendors", label: "Vendors", icon: "store" },
];

function Tab({ href, label, icon, active }: { href: string; label: string; icon: IconName; active: boolean }) {
  const row = useRowIcon();
  return (
    <Link href={href} onMouseEnter={row.onMouseEnter} onMouseLeave={row.onMouseLeave} className={cn("relative flex items-center gap-1.5 whitespace-nowrap px-1 pb-2.5 pt-1 text-sm", active ? "font-semibold" : "text-muted-foreground hover:text-ink")}>
      <Icon ref={row.ref} name={icon} size={14} manual className={active ? "text-tomato" : ""} />
      {label}
      {active && <motion.span layoutId="uni-tab" className="absolute inset-x-0 -bottom-px h-[3px] rounded-t bg-tomato" transition={SPRING.default} />}
    </Link>
  );
}

export function UniTabs({ id }: { id: string }) {
  const path = usePathname();
  const base = `/universities/${id}`;
  return (
    <nav className="flex gap-6 border-b-[1.5px] border-ink">
      {UNI_PAGES.map((t) => {
        const href = t.seg ? `${base}/${t.seg}` : base;
        return <Tab key={t.seg} href={href} label={t.label} icon={t.icon} active={t.seg ? path.startsWith(href) : path === base} />;
      })}
    </nav>
  );
}
