import Link from "next/link";
import { BrandMark } from "@/components/app/brand-mark";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/lib/session";
import { inviteByToken } from "@/lib/workspace";
import { acceptInviteTokenAction } from "@/app/workspace-actions";
import { ROLE_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [inv, user] = await Promise.all([inviteByToken(token), currentUser()]);
  const valid = inv && !inv.expired && !inv.used;
  const next = `/invite/${encodeURIComponent(token)}`;
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <BrandMark />
        {!valid ? (
          <>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Invite not valid</h1>
            <p className="mt-1 text-sm text-muted-foreground">This invite has expired or was already used. Ask your society&apos;s President for a new one.</p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Join {inv.society}</h1>
            <p className="mt-1 text-sm text-muted-foreground">You&apos;ve been invited as <b className="text-foreground">{ROLE_LABEL[inv.role]}</b>.</p>
            {!user ? (
              <Button asChild className="mt-6 h-11 w-full">
                <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in as {inv.email} to accept</Link>
              </Button>
            ) : user.email.toLowerCase() !== inv.email.toLowerCase() ? (
              <p className="mt-6 rounded-xl border border-border bg-card p-3 text-sm">
                This invite is for <b>{inv.email}</b>, but you&apos;re signed in as <b>{user.email}</b>. Sign out and sign in with the invited email.
              </p>
            ) : (
              <form action={acceptInviteTokenAction} className="mt-6">
                <input type="hidden" name="token" value={token} />
                <Button type="submit" className="h-11 w-full">Accept and join</Button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
