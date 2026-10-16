import Link from "next/link";

/** Small "Movents" lockup for pages people reach from outside the app. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`mb-5 inline-flex items-center gap-2 ${className}`}>
      <img src="/movents-logo.svg" alt="" className="size-7" />
      <span className="font-display text-sm font-bold">Movents</span>
    </Link>
  );
}
