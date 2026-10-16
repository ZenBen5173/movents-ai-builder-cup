"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/motion";
import { PROJECT_PAGES } from "./app-shell";
import { Icon, useRowIcon } from "@/components/ep/kit";

function Tab({ href, label, icon, active }: { href: string; label: string; icon: (typeof PROJECT_PAGES)[number]["icon"]; active: boolean }) {
  const row = useRowIcon();
  return (
    <Link href={href} onMouseEnter={row.onMouseEnter} onMouseLeave={row.onMouseLeave} data-active={active} className={cn("relative flex items-center gap-1.5 whitespace-nowrap px-1 pb-2.5 pt-1 text-sm transition-colors", active ? "font-semibold text-ink" : "text-muted-foreground hover:text-ink")}>
      <Icon ref={row.ref} name={icon} size={14} manual className={active ? "text-tomato" : ""} />
      {label}
      {active && <motion.span layoutId="project-tab" className="absolute inset-x-0 -bottom-px h-[3px] rounded-t bg-tomato" transition={SPRING.default} />}
    </Link>
  );
}

/** Underline tabs across the project — the same pages as the sidebar tree. */
export function EventTabs({ id }: { id: string }) {
  const path = usePathname();
  const base = `/events/${id}`;
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.querySelector<HTMLElement>("[data-active=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, []);
  const nudge = (d: number) => ref.current?.scrollBy({ left: d * 220, behavior: "smooth" });
  return (
    <div className="relative">
    <AnimatePresence>
      {edge.left && (
        <motion.button key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => nudge(-1)} aria-label="More tabs" className="absolute left-0 top-0 z-10 flex h-[38px] w-12 items-center bg-gradient-to-r from-background via-background to-transparent">
          <ChevronLeft className="size-4" />
        </motion.button>
      )}
      {edge.right && (
        <motion.button key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => nudge(1)} aria-label="More tabs" className="absolute right-0 top-0 z-10 flex h-[38px] w-16 items-center justify-end bg-gradient-to-l from-background via-background to-transparent">
          <motion.span animate={{ x: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.4 }} className="grid size-6 place-items-center rounded-full border-[1.5px] border-ink bg-card"><ChevronRight className="size-3.5" /></motion.span>
        </motion.button>
      )}
    </AnimatePresence>
    <div ref={ref} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
      <nav className="flex w-max min-w-full gap-5 border-b-[1.5px] border-ink">
        {PROJECT_PAGES.map((t) => {
          const href = t.seg ? `${base}/${t.seg}` : base;
          return <Tab key={t.seg} href={href} label={t.label} icon={t.icon} active={t.seg ? path.startsWith(href) : path === base} />;
        })}
      </nav>
    </div>
    </div>
  );
}
