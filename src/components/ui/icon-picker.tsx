"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { ICONS } from "@/components/ep/icons";
import { TABLE_ICONS } from "@/components/ui/animated-lucide";

type IconName = string;
// Project build: a curated static set instead of lucide's dynamic map (keeps dev compiles fast).
const iconNames = [...new Set([...Object.keys(TABLE_ICONS), ...Object.keys(ICONS)])];
import { Search, X } from "lucide-react";
import { AnimatedLucide } from "@/components/ui/animated-lucide";
import { cn } from "@/lib/utils";

/**
 * Pick any icon in lucide.
 *
 * All eighteen hundred of them, so the grid is capped and search is the way
 * through rather than scrolling: each tile is a real icon module fetched on
 * demand, and rendering the entire set at once would fetch the entire set at
 * once. A capped grid keeps that to a few dozen requests and stays instant.
 *
 * Every tile animates on hover — they are drawn on, not hand-authored, so this
 * works for the whole set rather than the handful anyone would build by hand.
 */

/** Enough to browse, few enough that the grid is never the slow part. */
const LIMIT = 90;

/** A first screen worth looking at, rather than everything beginning with "a". */
const SUGGESTED: IconName[] = iconNames.slice(0, 36);

export function IconPicker({
  value,
  onChange,
  onClear,
  className,
}: {
  value?: string;
  onChange: (name: IconName) => void;
  /** Offered when there is something to go back to. */
  onClear?: () => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  // The list is long enough that filtering on every keystroke stutters; this
  // lets the field stay responsive and the grid catch up.
  const deferred = useDeferredValue(query);

  const results = useMemo(() => {
    const q = deferred.trim().toLowerCase().replace(/\s+/g, "-");
    if (!q) return SUGGESTED;
    const names = iconNames as readonly IconName[];
    const starts: IconName[] = [];
    const contains: IconName[] = [];
    for (const name of names) {
      if (name.startsWith(q)) starts.push(name);
      else if (name.includes(q)) contains.push(name);
      if (starts.length >= LIMIT) break;
    }
    // Names that begin with what was typed first — searching "check" should
    // lead with "check", not "circle-check".
    return [...starts, ...contains].slice(0, LIMIT);
  }, [deferred]);

  return (
    <div className={cn("w-[288px]", className)}>
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            title="Remove icon"
            className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {results.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          Nothing matches “{query.trim()}”.
        </p>
      ) : (
        <div className="grid max-h-[248px] grid-cols-8 gap-0.5 overflow-y-auto p-1.5">
          {results.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => onChange(name)}
              className={cn(
                "grid aspect-square place-items-center rounded-md text-foreground transition-colors",
                value === name ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              <AnimatedLucide name={name} size={16} />
            </button>
          ))}
        </div>
      )}

      {!deferred.trim() && (
        <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
          Search to reach all {iconNames.length.toLocaleString()}.
        </p>
      )}
    </div>
  );
}
