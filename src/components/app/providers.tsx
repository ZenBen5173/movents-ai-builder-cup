"use client";

import { useEffect } from "react";
import { MotionConfig } from "motion/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // PWA: offline shell + installable on phones.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return (
    <ThemeProvider attribute="class" forcedTheme="light" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster position="bottom-right" toastOptions={{ classNames: { toast: "!rounded-xl !border-ink !border-[1.5px] !shadow-[3px_3px_0_0_#161514] !font-sans" } }} />
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
