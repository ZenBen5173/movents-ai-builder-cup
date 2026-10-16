"use client";

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

// From the App Template library (controls/shared-tooltip-avatars), with an
// initials fallback for people without a photo and an optional sub-label.

export interface AvatarItem {
  id: string;
  name: string;
  image?: string | null;
  sub?: string;
  className?: string;
}

export interface SharedTooltipAvatarsProps extends React.HTMLAttributes<HTMLDivElement> {
  items: AvatarItem[];
  size?: number;
  onItemClick?: (item: AvatarItem) => void;
}

const initials = (n: string) => n.replace(/^(Dr\.?|Prof\.?)\s+/i, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export function SharedTooltipAvatars({ items, className, size = 36, onItemClick, ...props }: SharedTooltipAvatarsProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ left: 0, top: 0 });
  const [active, setActive] = useState<AvatarItem | null>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const avatarRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleMouseEnter = (index: number) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const avatar = avatarRefs.current[index];
    if (avatar) {
      setTooltipPos({ left: avatar.offsetLeft + avatar.offsetWidth / 2, top: avatar.offsetTop });
      setActive(items[index]);
      setHoveredIndex(index);
    }
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setHoveredIndex(null), 150);
  };

  return (
    <div className={cn("relative flex items-center", className)} role="list" {...props}>
      <AnimatePresence>
        {hoveredIndex !== null && active && (
          <motion.div
            initial={{ opacity: 0, x: "-50%", y: "-80%", scale: 0.95, left: tooltipPos.left, top: tooltipPos.top - 8 }}
            animate={{ opacity: 1, x: "-50%", y: "-100%", scale: 1, left: tooltipPos.left, top: tooltipPos.top - 8 }}
            exit={{ opacity: 0, x: "-50%", y: "-80%", scale: 0.95 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="pointer-events-none absolute z-50 whitespace-nowrap rounded-xl border-[1.5px] border-ink bg-card px-3 py-1.5 text-sm font-medium shadow-[2px_2px_0_0_#161514]"
            role="tooltip"
          >
            <AnimatePresence mode="wait">
              <motion.span key={active.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15, ease: "easeOut" }} className="inline-block">
                {active.name}
                {active.sub && <span className="ml-1.5 font-mono text-[10px] uppercase text-muted-foreground">{active.sub}</span>}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {items.map((item, index) => (
        <div
          key={item.id}
          ref={(el) => {
            avatarRefs.current[index] = el;
          }}
          className="relative -ml-1.5 cursor-pointer transition-transform duration-300 ease-out first:ml-0 hover:z-10 hover:-translate-y-1.5"
          onMouseEnter={() => handleMouseEnter(index)}
          onMouseLeave={handleMouseLeave}
          onFocus={() => handleMouseEnter(index)}
          onBlur={handleMouseLeave}
          onClick={() => onItemClick?.(item)}
          tabIndex={0}
          role="listitem"
        >
          {item.image ? (
            <img src={item.image} alt={item.name} style={{ width: size, height: size }} className="rounded-full border-2 border-background object-cover shadow-sm transition-shadow duration-300 hover:shadow-lg" />
          ) : (
            <span style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }} className={cn("grid place-items-center rounded-full border-[1.5px] border-ink font-display font-bold leading-none tracking-tight shadow-[0_0_0_2px_var(--background)] transition-shadow duration-300 hover:shadow-[0_0_0_2px_var(--background),2px_2px_0_2px_#161514]", item.className ?? "bg-sand")}>
              {initials(item.name)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default SharedTooltipAvatars;
