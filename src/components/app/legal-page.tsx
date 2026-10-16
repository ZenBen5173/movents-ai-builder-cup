import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";

export const LEGAL = {
  operator: "Teo Zen Ben",
  email: "teozenben05@gmail.com",
  updated: "14 October 2026",
};

/** Shared layout for the public Privacy Policy and Terms of Use pages. */
export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-background px-4 py-12">
      <article className="mx-auto w-full max-w-2xl">
        <BrandMark />
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mono-label mt-2 text-[11px] text-muted-foreground">Last updated: {LEGAL.updated}</p>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-foreground/90">{intro}</div>
        <div className="mt-8 space-y-8">{children}</div>
        <footer className="mt-12 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-6 text-xs text-muted-foreground">
          <span>
            Contact: <a className="underline underline-offset-2 hover:text-foreground" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
          </span>
          <Link className="underline underline-offset-2 hover:text-foreground" href="/privacy">Privacy Policy</Link>
          <Link className="underline underline-offset-2 hover:text-foreground" href="/terms">Terms of Use</Link>
        </footer>
      </article>
    </main>
  );
}

export function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 text-sm leading-relaxed text-foreground/90">
      <h2 className="font-display text-lg font-bold text-foreground">
        <span className="mr-2 text-muted-foreground">{n}.</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">{children}</ul>;
}
