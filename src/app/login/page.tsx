import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/app/brand-mark";
import { currentUser } from "@/lib/session";
import { googleEnabled } from "@/lib/auth/google";
import { safeNext } from "@/lib/auth/tokens";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link is invalid or has expired. Request a new one below.",
  google: "Google sign-in did not complete. Try again or use your email.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const target = safeNext(next);
  if (await currentUser()) redirect(target);
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <BrandMark />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Sign in to Movents</h1>
        <p className="mt-1 text-sm text-muted-foreground">Plan your society&apos;s events with your team. New here? Signing in creates your account.</p>
        {error && ERRORS[error] && (
          <p role="alert" className="mt-5 rounded-xl border border-[var(--red-6)] bg-[var(--red-2)] p-3 text-sm text-[var(--red-11)]">{ERRORS[error]}</p>
        )}
        <LoginForm next={target} google={googleEnabled()} />
        <p className="mt-8 text-xs text-muted-foreground">
          By continuing you agree to the <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">Terms of Use</Link> and{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">Privacy Policy</Link>.
        </p>
      </div>
    </main>
  );
}
