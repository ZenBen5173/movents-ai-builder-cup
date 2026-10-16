"use client";

/**
 * Project build of the library's AnimatedLucide. Same props and handle, but
 * icons come from a static map instead of `lucide-react/dynamic` — the dynamic
 * map drags all ~1,800 icons into the bundle and made pages with the Data
 * Table take 15–30s to compile in dev. Unknown names fall back to a dot.
 */

import { forwardRef } from "react";
import {
  AlignLeft,
  ArrowDownUp,
  AtSign,
  CalendarDays,
  ChevronLeft,
  CircleChevronDown,
  CircleDashed,
  CircleUser,
  Clock,
  Dot,
  EyeOff,
  Filter,
  Hash,
  IdCard,
  Link,
  List,
  MapPin,
  MousePointerClick,
  Paperclip,
  Phone,
  RefreshCw,
  Rows3,
  SquareCheck,
  Users,
  WrapText,
  Star,
  Store,
  Mail,
  Ticket,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { DrawIcon, ICONS, type IconHandle } from "@/components/ep/icons";

export type { IconHandle };

export const TABLE_ICONS: Record<string, LucideIcon> = {
  "align-left": AlignLeft,
  "arrow-down-up": ArrowDownUp,
  "at-sign": AtSign,
  "calendar-days": CalendarDays,
  "chevron-left": ChevronLeft,
  "circle-chevron-down": CircleChevronDown,
  "circle-dashed": CircleDashed,
  "circle-user": CircleUser,
  clock: Clock,
  "eye-off": EyeOff,
  filter: Filter,
  hash: Hash,
  "id-card": IdCard,
  link: Link,
  list: List,
  "map-pin": MapPin,
  "mouse-pointer-click": MousePointerClick,
  paperclip: Paperclip,
  phone: Phone,
  "refresh-cw": RefreshCw,
  "rows-3": Rows3,
  "square-check": SquareCheck,
  users: Users,
  "wrap-text": WrapText,
  star: Star,
  store: Store,
  mail: Mail,
  ticket: Ticket,
  wallet: Wallet,
};

export const AnimatedLucide = forwardRef<IconHandle, { name: string; size?: number; className?: string; trigger?: "hover" | "manual"; duration?: number }>(function AnimatedLucide(
  { name, size = 16, className, trigger = "hover", duration },
  ref,
) {
  if (name in ICONS) return <DrawIcon ref={ref} name={name as keyof typeof ICONS} size={size} className={className} trigger={trigger} duration={duration} />;
  const Glyph = TABLE_ICONS[name] ?? Dot;
  return (
    <span className={className} style={{ display: "inline-grid", placeItems: "center" }}>
      <Glyph size={size} />
    </span>
  );
});
