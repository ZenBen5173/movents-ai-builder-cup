"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { acceptInviteAction, createSocietyAction } from "@/app/workspace-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateSocietyForm({ universities }: { universities: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createSocietyAction, null);
  const [uni, setUni] = useState(universities[0]?.id ?? "__new");
  return (
    <form action={action} className="mt-3 space-y-3 rounded-2xl border border-border bg-card p-4">
      <label className="block text-sm font-medium" htmlFor="name">Society name</label>
      <Input id="name" name="name" required minLength={2} maxLength={120} placeholder="e.g. AI & Tech Society" />
      <label className="block text-sm font-medium" htmlFor="university">University</label>
      <select id="university" name="university" required value={uni} onChange={(e) => setUni(e.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
        {universities.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
        <option value="__new">My university isn&apos;t listed…</option>
      </select>
      {uni === "__new" && (
        <div className="grid grid-cols-[1fr_120px] gap-2">
          <Input name="uni_name" required minLength={3} maxLength={160} placeholder="University name" aria-label="University name" />
          <Input name="uni_short" maxLength={40} placeholder="Short name" aria-label="Short name" />
          <p className="col-span-2 text-xs text-muted-foreground">It starts with a template SOP. Upload your university&apos;s event SOP afterwards from Universities.</p>
        </div>
      )}
      {state && !state.ok && <p role="alert" className="text-sm text-[var(--red-11)]">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>{pending ? "Creating…" : "Create society"}</Button>
    </form>
  );
}

export function AcceptInviteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await acceptInviteAction(id);
          if (r && !r.ok) toast.error(r.error);
        })
      }
    >
      {pending ? "Joining…" : "Join"}
    </Button>
  );
}
