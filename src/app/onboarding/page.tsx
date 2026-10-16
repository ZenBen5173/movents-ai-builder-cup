import { redirect } from "next/navigation";
import { BrandMark } from "@/components/app/brand-mark";
import { currentUser } from "@/lib/session";
import { query } from "@/lib/db";
import { pendingInvitesFor } from "@/lib/workspace";
import { signOut } from "@/app/auth-actions";
import { ROLE_LABEL } from "@/lib/types";
import { CreateSocietyForm, AcceptInviteButton } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Set up your society" };

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await currentUser();
  if (!user) redirect("/login?next=/onboarding");
  const { new: adding } = await searchParams;
  if (user.society_id && !adding) redirect("/");
  const [invites, universities] = await Promise.all([
    pendingInvitesFor(user.email),
    query<{ id: string; name: string }>("SELECT id, name FROM universities ORDER BY name"),
  ]);
  return (
    <main className="min-h-dvh bg-background px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <BrandMark />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Movents works per society. Join one you were invited to, or set up your own.</p>

        {invites.length > 0 && (
          <section className="mt-8">
            <h2 className="text-sm font-semibold">Your invites</h2>
            <ul className="mt-3 space-y-2">
              {invites.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{i.society}</span>
                    <span className="block text-xs text-muted-foreground">as {ROLE_LABEL[i.role]}</span>
                  </span>
                  <AcceptInviteButton id={i.id} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-sm font-semibold">Set up a new society</h2>
          <p className="mt-1 text-xs text-muted-foreground">You&apos;ll be its President and can invite your committee next.</p>
          <CreateSocietyForm universities={universities} />
        </section>

        <form action={signOut} className="mt-10">
          <button className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground">Signed in as {user.email}. Sign out</button>
        </form>
      </div>
    </main>
  );
}
