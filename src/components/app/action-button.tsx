"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Res = { ok: true; message?: string; data?: unknown } | { ok: false; error: string };

const VARIANTS = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20",
  outline: "border border-border bg-card hover:bg-accent",
  ghost: "hover:bg-accent text-muted-foreground hover:text-foreground",
  success: "bg-[var(--grass-9)] text-white hover:bg-[var(--grass-10)]",
  danger: "border border-[var(--red-6)] text-[var(--red-11)] hover:bg-[var(--red-3)]",
};

export function ActionButton({
  action,
  children,
  variant = "outline",
  size = "sm",
  className,
  confirm,
  onDone,
  icon,
}: {
  action: () => Promise<Res>;
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
  size?: "xs" | "sm" | "md";
  className?: string;
  confirm?: string;
  onDone?: (r: Res) => void;
  icon?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      disabled={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          if (r.ok) {
            if (r.message) toast.success(r.message);
          } else toast.error(r.error);
          onDone?.(r);
          router.refresh();
        });
      }}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors disabled:opacity-60",
        size === "xs" && "h-7 px-2 text-xs",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {children}
    </motion.button>
  );
}
