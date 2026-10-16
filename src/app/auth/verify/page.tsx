import { BrandMark } from "@/components/app/brand-mark";
import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import { confirmLoginLink } from "@/app/auth-actions";
import { one } from "@/lib/db";
import { hashToken } from "@/lib/auth/tokens";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in" };

/** Email scanners open links automatically; spending the token needs a click. */
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  // Name the account, so nobody is signed into someone else's account by a forwarded link.
  const row = token ? await one<{ email: string }>("SELECT email FROM login_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()", [hashToken(token)]) : null;
  if (!row) redirect("/login?error=link");
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <BrandMark />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Finish signing in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You&apos;re signing in as <b className="text-foreground">{row.email}</b>. If that isn&apos;t you, close this page.
        </p>
        <form action={confirmLoginLink} className="mt-6">
          <input type="hidden" name="token" value={token ?? ""} />
          <Button type="submit" className="h-11 w-full">Continue as {row.email}</Button>
        </form>
      </div>
    </main>
  );
}
