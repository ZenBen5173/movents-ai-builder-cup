"use client";

import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import {
  Bell,
  BookOpenText,
  Building2,
  CalendarDays,
  CalendarPlus,
  Check,
  Clock4,
  CreditCard,
  File,
  FileChartColumn,
  FileSpreadsheet,
  FileText,
  FileType,
  FolderOpen,
  ChartGantt,
  History,
  Inbox,
  Handshake,
  CalendarClock,
  Kanban,
  SquareKanban,
  Landmark,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  Lock,
  Mail,
  Megaphone,
  MicVocal,
  Rocket,
  ScanLine,
  ScrollText,
  Settings2,
  Sheet,
  ShieldAlert,
  Sparkles,
  Store,
  Ticket,
  TicketPlus,
  UserCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DURATION, EASE } from "@/lib/motion";

/**
 * Only the icons the app uses, imported statically. The library's
 * AnimatedLucide loads icons through lucide's dynamic import map, which puts
 * all ~1,800 icons in the dev bundle and made every page take a minute to
 * compile. Same draw-on animation, same start/stop handle.
 */
export const ICONS = {
  bell: Bell,
  "book-open-text": BookOpenText,
  "building-2": Building2,
  "calendar-days": CalendarDays,
  "calendar-plus": CalendarPlus,
  check: Check,
  "clock-4": Clock4,
  "credit-card": CreditCard,
  file: File,
  "file-chart-column": FileChartColumn,
  "file-spreadsheet": FileSpreadsheet,
  "file-text": FileText,
  "file-type": FileType,
  "folder-open": FolderOpen,
  "gantt-chart": ChartGantt,
  history: History,
  inbox: Inbox,
  handshake: Handshake,
  "calendar-clock": CalendarClock,
  kanban: Kanban,
  "kanban-square": SquareKanban,
  landmark: Landmark,
  "layout-dashboard": LayoutDashboard,
  "list-checks": ListChecks,
  "list-todo": ListTodo,
  lock: Lock,
  mail: Mail,
  megaphone: Megaphone,
  "mic-vocal": MicVocal,
  rocket: Rocket,
  "scan-line": ScanLine,
  "scroll-text": ScrollText,
  "settings-2": Settings2,
  sheet: Sheet,
  "shield-alert": ShieldAlert,
  sparkles: Sparkles,
  store: Store,
  ticket: Ticket,
  "ticket-plus": TicketPlus,
  "user-check": UserCheck,
  wallet: Wallet,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;
export type IconHandle = { startAnimation: () => void; stopAnimation: () => void };

const SHAPES = "path, circle, line, rect, polyline, polygon, ellipse";

export const DrawIcon = forwardRef<IconHandle, { name: IconName; size?: number; className?: string; trigger?: "hover" | "manual"; duration?: number }>(function DrawIcon(
  { name, size = 16, className, trigger = "hover", duration = DURATION.slow },
  ref,
) {
  const host = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(false);
  useLayoutEffect(() => {
    host.current?.querySelectorAll(SHAPES).forEach((s) => s.setAttribute("pathLength", "1"));
  }, [name, playing]);
  const start = useCallback(() => setPlaying(true), []);
  const stop = useCallback(() => setPlaying(false), []);
  useImperativeHandle(ref, () => ({ startAnimation: start, stopAnimation: stop }), [start, stop]);
  const Glyph = ICONS[name] ?? File;
  return (
    <span
      ref={host}
      key={playing ? "on" : "off"}
      data-icon-draw
      onMouseEnter={trigger === "hover" ? start : undefined}
      onMouseLeave={trigger === "hover" ? stop : undefined}
      className={cn("inline-grid shrink-0 place-items-center", className)}
      style={{ "--icon-draw-duration": `${duration}s`, "--icon-draw-ease": `cubic-bezier(${EASE.standard.join(",")})` } as React.CSSProperties}
    >
      <Glyph size={size} className={cn(playing && "[&_*]:[stroke-dasharray:1] [&_*]:[animation:icon-draw_var(--icon-draw-duration)_var(--icon-draw-ease)_forwards]")} />
    </span>
  );
});
