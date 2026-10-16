import Link from "next/link";
import { BrandMark } from "@/components/app/brand-mark";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <BrandMark />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">That page moved, never existed, or you don&apos;t have access to it.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-tomato-ink hover:underline">Go to Movents</Link>
      </div>
    </main>
  );
}
