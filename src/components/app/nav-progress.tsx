"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

/**
 * A thin tomato bar across the top the moment you click a link, so a page
 * that takes a second to load never feels like a dead click. It creeps
 * forward while waiting and snaps to the end when the new page arrives.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [width, setWidth] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const first = useRef(true);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  function start() {
    if (timer.current) clearInterval(timer.current);
    setState("loading");
    setWidth(12);
    timer.current = setInterval(() => setWidth((w) => (w < 85 ? w + (90 - w) * 0.08 : w)), 180);
  }

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (timer.current) clearInterval(timer.current);
    setWidth(100);
    setState("done");
    const t = setTimeout(() => {
      setState("idle");
      setWidth(0);
    }, 320);
    return () => clearTimeout(t);
  }, [pathname, search]);

  return (
    <AnimatePresence>
      {state !== "idle" && (
        <motion.div key="bar" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.25 } }} className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[3px]">
          <motion.div className="h-full bg-tomato shadow-[0_0_8px_#ff5a36]" animate={{ width: `${width}%` }} transition={{ ease: "easeOut", duration: 0.2 }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
