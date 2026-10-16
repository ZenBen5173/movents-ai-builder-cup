"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteMyAccount, signOutEverywhere } from "@/app/auth-actions";

export function AccountPanel({ email }: { email: string }) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border-[1.5px] border-ink bg-card p-5">
      <h2 className="mono-label mb-4 font-bold text-ink">Your account</h2>
      <p className="text-sm text-muted-foreground">Signed in as <b className="text-foreground">{email}</b>.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <form action={signOutEverywhere}>
          <button className="h-8 rounded-lg border-[1.5px] border-ink px-3 text-xs font-medium hover:bg-sand/60">Sign out on all devices</button>
        </form>
        <a href="/api/account/export" download className="inline-flex h-8 items-center rounded-lg border-[1.5px] border-ink px-3 text-xs font-medium hover:bg-sand/60">Download my data</a>
        <button onClick={() => setOpen((o) => !o)} className="h-8 rounded-lg px-3 text-xs font-medium text-tomato-ink hover:bg-peach">Delete account…</button>
      </div>
      {open && (
        <div className="mt-3 space-y-2 rounded-lg border border-[var(--red-6)] bg-[var(--red-2)] p-3 text-sm">
          <p>This removes you from every society and deletes your sign-ins and tokens. Events and records you created stay with the society. This can&apos;t be undone.</p>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={`Type ${email} to confirm`} aria-label="Confirm email" className="h-8 w-full rounded-lg border border-input bg-card px-2.5 text-xs" />
          <button
            disabled={pending || confirm.trim().toLowerCase() !== email.toLowerCase()}
            onClick={() =>
              start(async () => {
                const r = await deleteMyAccount(confirm);
                if (r && !r.ok) toast.error(r.error);
              })
            }
            className="h-8 rounded-lg bg-[var(--red-9)] px-3 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      )}
    </section>
  );
}
