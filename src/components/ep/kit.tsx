"use client";

/**
 * Movents's event kit — the visual language from the pitch deck:
 * lanyard passes, tickets with perforations, wristbands, sticky notes,
 * rubber stamps, bunting and a stage spotlight. Hand-built: nothing in the
 * component library covers event props like these.
 */

import { forwardRef, useMemo, useRef } from "react";
import { motion } from "motion/react";
import type { IconName } from "@/components/ep/icons";
import { DrawIcon, type IconHandle } from "@/components/ep/icons";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

// ------------------------------------------------------------------ icons

export const Icon = forwardRef<IconHandle, { name: IconName; size?: number; className?: string; manual?: boolean }>(function Icon(
  { name, size = 16, className, manual },
  ref,
) {
  return <DrawIcon ref={ref} name={name} size={size} className={className} trigger={manual ? "manual" : "hover"} />;
});

/** A row that plays its icon when the whole row is hovered, not just the 16px glyph. */
export function useRowIcon() {
  const ref = useRef<IconHandle>(null);
  return { ref, onMouseEnter: () => ref.current?.startAnimation(), onMouseLeave: () => ref.current?.stopAnimation() };
}

// ------------------------------------------------------------------ type

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mono-label text-tomato", className)}>{children}</div>;
}

export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("mono-label text-muted-foreground", className)}>{children}</span>;
}

export function Hand({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-hand text-xl leading-none text-tomato-ink", className)}>{children}</span>;
}

// ------------------------------------------------------------------ wristbands (roles & statuses)

export const ROLE_BAND: Record<Role, { label: string; bg: string; fg: string; tail: string }> = {
  president: { label: "All access", bg: "bg-tomato", fg: "text-ink", tail: "bg-[#d9472a]" },
  vp: { label: "All access", bg: "bg-tomato", fg: "text-ink", tail: "bg-[#d9472a]" },
  director: { label: "Staff", bg: "bg-sun", fg: "text-ink", tail: "bg-[#e3bf3a]" },
  faculty_advisor: { label: "Guest list", bg: "bg-ticket-blue", fg: "text-white", tail: "bg-[#2f57d1]" },
  committee: { label: "Crew", bg: "bg-sand", fg: "text-ink", tail: "bg-[#d8d1c2]" },
};

export function Wristband({ role, label, className, size = "sm" }: { role: Role; label?: string; className?: string; size?: "xs" | "sm" | "md" }) {
  const b = ROLE_BAND[role];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-ink", b.bg, b.fg, size === "xs" ? "py-px pl-[3px] pr-2" : size === "md" ? "py-1 pl-1.5 pr-3.5" : "py-0.5 pl-1 pr-2.5", className)}>
      <span aria-hidden className={cn("shrink-0 rounded-full border-[1.5px] border-ink bg-white", size === "xs" ? "size-2" : size === "md" ? "size-3" : "size-2.5")} />
      <span className={cn("mono-label whitespace-nowrap font-bold leading-none", size === "xs" ? "text-[8.5px]" : size === "md" ? "text-[12px]" : "text-[9.5px]")}>{label ?? b.label}</span>
    </span>
  );
}

// ------------------------------------------------------------------ barcode

export function Barcode({ value, className, height = 34 }: { value: string; className?: string; height?: number }) {
  const bars = useMemo(() => {
    let h = 7;
    for (const c of value) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const out: number[] = [];
    for (let i = 0; i < 42; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      out.push(1 + (h % 3));
    }
    return out;
  }, [value]);
  let x = 0;
  return (
    <svg viewBox={`0 0 ${bars.reduce((a, b) => a + b + 1.4, 0)} ${height}`} preserveAspectRatio="none" className={cn("h-8 w-28 text-ink", className)} aria-hidden>
      {bars.map((w, i) => {
        const r = <rect key={i} x={x} y={0} width={w} height={height} fill="currentColor" />;
        x += w + 1.4;
        return r;
      })}
    </svg>
  );
}

// ------------------------------------------------------------------ ticket

/** "Admit one" ticket: a white body, a dotted tear line with notches, and a coloured stub. */
export function Ticket({ children, stub, className, stubClassName }: { children: React.ReactNode; stub?: React.ReactNode; className?: string; stubClassName?: string }) {
  return (
    <div className={cn("relative flex flex-col overflow-visible rounded-2xl border-[1.5px] border-ink bg-card shadow-pop md:flex-row", className)}>
      <div className="min-w-0 flex-1 p-5 md:p-6">{children}</div>
      {stub && (
        <div className={cn("relative rounded-b-2xl border-t-[1.5px] border-dashed border-ink bg-tomato p-5 text-ink md:w-72 md:rounded-b-none md:rounded-r-2xl md:border-l-[1.5px] md:border-t-0", stubClassName)}>
          <span aria-hidden className="absolute -left-[11px] -top-[11px] hidden size-5 rounded-full border-[1.5px] border-ink bg-background md:block" />
          <span aria-hidden className="absolute -bottom-[11px] -left-[11px] hidden size-5 rounded-full border-[1.5px] border-ink bg-background md:block" />
          {stub}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ lanyard pass

export function Pass({ header, tone = "tomato", children, className, swing = true, number }: { header: string; tone?: "tomato" | "blue" | "sun" | "sand"; children: React.ReactNode; className?: string; swing?: boolean; number?: string }) {
  const bg = { tomato: "bg-tomato text-ink", blue: "bg-ticket-blue text-white", sun: "bg-sun text-ink", sand: "bg-sand text-ink" }[tone];
  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <div aria-hidden className="flex h-10 items-end gap-6">
        <span className="h-full w-3 -rotate-[14deg] rounded-sm bg-tomato" />
        <span className="h-full w-3 rotate-[14deg] rounded-sm bg-[#e24a2a]" />
      </div>
      <div aria-hidden className="z-10 -mb-1.5 h-3 w-8 rounded-sm bg-[#a9a49a]" />
      <div className={cn("w-full origin-top overflow-hidden rounded-2xl border-[1.5px] border-ink bg-card shadow-pop", swing && "animate-[sway_6s_ease-in-out_infinite]")}>
        <div className={cn("relative px-4 pb-3 pt-5 text-center", bg)}>
          <span aria-hidden className="absolute left-1/2 top-2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/80" />
          <span className="mono-label text-[13px] font-bold">{header}</span>
        </div>
        <div className="p-4">
          {children}
          {number && (
            <div className="mt-3 flex items-end justify-between gap-2">
              <Barcode value={number} className="h-7 w-32" />
              <span className="mono-label text-[10px] text-muted-foreground">{number}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ sticky note

const STICKY = { sun: "bg-[#ffe680]", peach: "bg-peach", sky: "bg-sky", mint: "bg-mint" };

export function Sticky({ tone = "sun", title, children, tilt = 0, className }: { tone?: keyof typeof STICKY; title?: React.ReactNode; children?: React.ReactNode; tilt?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, rotate: tilt }}
      animate={{ opacity: 1, y: 0, rotate: tilt }}
      whileHover={{ y: -4, rotate: tilt * 0.4, transition: { type: "spring", stiffness: 300, damping: 18 } }}
      className={cn("relative p-4 pt-6 shadow-[0_12px_20px_-14px_rgba(22,21,20,.5)]", STICKY[tone], className)}
    >
      <span aria-hidden className="absolute -top-2.5 left-1/2 h-5 w-20 -translate-x-1/2 rotate-[-2deg] bg-[#e9e3d4]/90" />
      {title && <div className="font-hand text-2xl font-bold leading-tight">{title}</div>}
      {children && <div className="mt-1 text-sm text-ink/80">{children}</div>}
    </motion.div>
  );
}

// ------------------------------------------------------------------ stamp

export function Stamp({ children, tone = "tomato", animate = false, className }: { children: React.ReactNode; tone?: "tomato" | "ink" | "green" | "blue"; animate?: boolean; className?: string }) {
  const c = { tomato: "border-tomato-ink text-tomato-ink", ink: "border-ink text-ink", green: "border-[#2a7e3b] text-[#2a7e3b]", blue: "border-ticket-blue text-ticket-blue" }[tone];
  return (
    <span className={cn("mono-label inline-block -rotate-[8deg] rounded-md border-2 px-2.5 py-1 text-[11px] font-bold", c, animate && "animate-[stamp-in_.45s_cubic-bezier(.2,.9,.3,1.2)_both]", className)}>
      {children}
    </span>
  );
}

// ------------------------------------------------------------------ bunting

const FLAGS = ["#ff5a36", "#ffd84d", "#3d6cf5", "#d3efca", "#ffc9b8", "#ff5a36", "#ffd84d", "#3d6cf5", "#d3efca", "#ffc9b8", "#ff5a36", "#ffd84d", "#3d6cf5", "#d3efca"];

export function Bunting({ className, count = 14 }: { className?: string; count?: number }) {
  return (
    <div aria-hidden className={cn("pointer-events-none relative h-7 overflow-hidden", className)}>
      <svg className="absolute inset-x-0 top-0 h-3 w-full" preserveAspectRatio="none" viewBox="0 0 100 10">
        <path d="M0 2 Q 50 9 100 2" fill="none" stroke="#161514" strokeWidth=".35" />
      </svg>
      <div className="absolute inset-x-0 top-0 flex justify-around px-2">
        {FLAGS.slice(0, count).map((c, i) => {
          const t = i / (count - 1);
          const sag = Math.sin(t * Math.PI) * 6;
          return (
            <span
              key={i}
              className="block origin-top animate-[flag_3.2s_ease-in-out_infinite]"
              style={{ marginTop: 1 + sag, animationDelay: `${i * 0.18}s` }}
            >
              <svg width="14" height="16" viewBox="0 0 14 16">
                <path d="M0 0 H14 L7 16 Z" fill={c} stroke="#161514" strokeWidth="1" />
              </svg>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ clipboard

export function Clipboard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative rounded-2xl bg-tan p-3 pt-5 shadow-pop", className)}>
      <span aria-hidden className="absolute left-1/2 top-0 h-5 w-28 -translate-x-1/2 -translate-y-1.5 rounded-b-md bg-[#a9adb4]" />
      <div className="rounded-lg bg-card px-5 py-4">
        <div className="mono-label border-b-[1.5px] border-ink pb-2 text-ink/70">{title}</div>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ stage spotlight (empty states)

export function StageEmpty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="relative flex flex-col items-center overflow-hidden rounded-2xl border-[1.5px] border-dashed border-border px-6 pb-10 pt-6 text-center">
      <svg aria-hidden viewBox="0 0 320 150" className="h-36 w-full max-w-md">
        <g className="origin-[60px_0px] animate-[beam_5s_ease-in-out_infinite]">
          <path d="M60 0 L30 150 L120 150 Z" fill="#ffd84d" opacity=".35" />
        </g>
        <g className="origin-[260px_0px] animate-[beam_5s_ease-in-out_infinite]" style={{ animationDelay: "-2.5s" }}>
          <path d="M260 0 L200 150 L290 150 Z" fill="#ff5a36" opacity=".18" />
        </g>
        <rect x="20" y="118" width="280" height="14" rx="3" fill="#161514" />
        <path d="M20 118 Q 60 92 100 118" fill="#ff5a36" opacity=".9" />
        <path d="M300 118 Q 260 92 220 118" fill="#ff5a36" opacity=".9" />
        <circle cx="160" cy="104" r="5" fill="#161514" />
        <rect x="157" y="84" width="6" height="16" rx="3" fill="#161514" />
      </svg>
      <p className="font-display text-lg font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ confetti

export function fireConfetti(x = window.innerWidth / 2, y = window.innerHeight / 3) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#ff5a36", "#ffd84d", "#3d6cf5", "#46a758", "#ffc9b8"];
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden";
  document.body.appendChild(host);
  for (let i = 0; i < 70; i++) {
    const p = document.createElement("span");
    const size = 6 + Math.random() * 6;
    p.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size * 0.45}px;background:${colors[i % colors.length]};border-radius:1px`;
    host.appendChild(p);
    const angle = Math.random() * Math.PI * 2;
    const v = 180 + Math.random() * 320;
    p.animate(
      [
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${Math.cos(angle) * v}px, ${Math.sin(angle) * v * 0.6 + 420}px) rotate(${Math.random() * 900}deg)`, opacity: 0 },
      ],
      { duration: 1400 + Math.random() * 700, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" },
    );
  }
  setTimeout(() => host.remove(), 2400);
}

// ------------------------------------------------------------------ buttons

export function Btn({
  children,
  variant = "ink",
  size = "md",
  className,
  icon,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "ink" | "tomato" | "ghost" | "outline"; size?: "sm" | "md"; icon?: IconName }) {
  const row = useRowIcon();
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ y: -1 }}
      onMouseEnter={row.onMouseEnter}
      onMouseLeave={row.onMouseLeave}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-medium transition-[box-shadow,background] disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm",
        variant === "ink" && "bg-ink text-white shadow-[2px_2px_0_0_#ff5a36] hover:shadow-[3px_3px_0_0_#ff5a36]",
        variant === "tomato" && "border-[1.5px] border-ink bg-tomato text-ink shadow-[2px_2px_0_0_#161514] hover:shadow-[3px_3px_0_0_#161514]",
        variant === "outline" && "border-[1.5px] border-ink bg-card text-ink hover:bg-sand/50",
        variant === "ghost" && "text-muted-foreground hover:bg-sand/60 hover:text-ink",
        className,
      )}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      {icon && <Icon ref={row.ref} name={icon} size={15} manual />}
      {children}
    </motion.button>
  );
}
