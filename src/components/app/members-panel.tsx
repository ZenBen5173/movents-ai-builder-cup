"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, X } from "lucide-react";
import { changeRoleAction, inviteMemberAction, removeMemberAction, revokeInviteAction } from "@/app/workspace-actions";
import { ROLE_LABEL, type Role } from "@/lib/types";

type Person = { id: string; name: string; email: string; role: Role; department: string | null; joined: string };
type Invite = { id: string; email: string; role: Role; department: string | null; expires_at: string };

const ROLES: Role[] = ["president", "vp", "director", "committee", "faculty_advisor"];
const select = "h-8 rounded-lg border-[1.5px] border-ink bg-background px-2 text-xs";

export function MembersPanel({ me, admin, people, invites }: { me: string; admin: boolean; people: Person[]; invites: Invite[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("committee");
  const [dept, setDept] = useState("");

  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      if (r.message) toast.success(r.message);
      router.refresh();
    });

  return (
    <section className="rounded-xl border-[1.5px] border-ink bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="mono-label font-bold text-ink">Members</h2>
        <span className="mono-label text-[10px] text-muted-foreground">{people.length} people</span>
      </div>

      {admin && (
        <form
          className="mb-4 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              const r = await inviteMemberAction({ email, role, department: dept || null });
              if (r.ok) {
                setEmail("");
                setDept("");
              }
              return r;
            });
          }}
        >
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@university.edu" aria-label="Email to invite" className="h-8 min-w-48 flex-1 rounded-lg border-[1.5px] border-ink bg-background px-2.5 text-xs" />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Role" className={select}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABEL[r]}</option>
            ))}
          </select>
          <input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="Department (optional)" aria-label="Department" maxLength={60} className="h-8 w-40 rounded-lg border-[1.5px] border-ink bg-background px-2.5 text-xs" />
          <button disabled={pending} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-medium text-white disabled:opacity-50">
            <UserPlus className="size-3.5" /> Invite
          </button>
        </form>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border">
        {people.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}{p.id === me && <span className="text-muted-foreground"> (you)</span>}</span>
              <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
            </span>
            {admin ? (
              <>
                <select
                  value={p.role}
                  disabled={pending}
                  aria-label={`Role for ${p.name}`}
                  onChange={(e) => act(() => changeRoleAction(p.id, e.target.value as Role, p.department))}
                  className={select}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                  ))}
                </select>
                <input
                  defaultValue={p.department ?? ""}
                  aria-label={`Department for ${p.name}`}
                  placeholder="Department"
                  maxLength={60}
                  onBlur={(e) => e.target.value !== (p.department ?? "") && act(() => changeRoleAction(p.id, p.role, e.target.value || null))}
                  className="h-8 w-32 rounded-lg border-[1.5px] border-ink bg-background px-2 text-xs"
                />
                {p.id !== me && (
                  <button
                    disabled={pending}
                    aria-label={`Remove ${p.name}`}
                    onClick={() => window.confirm(`Remove ${p.name} from the society?`) && act(() => removeMemberAction(p.id))}
                    className="grid size-8 place-items-center rounded-lg hover:bg-peach"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">{ROLE_LABEL[p.role]}{p.department ? ` · ${p.department}` : ""}</span>
            )}
          </li>
        ))}
      </ul>

      {admin && invites.length > 0 && (
        <>
          <p className="mono-label mb-2 mt-4 text-[10px] text-muted-foreground">Pending invites</p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{i.email} · {ROLE_LABEL[i.role]}{i.department ? ` · ${i.department}` : ""}</span>
                <button disabled={pending} onClick={() => act(() => revokeInviteAction(i.id))} className="rounded-md px-2 py-1 text-tomato-ink hover:bg-peach">Cancel</button>
              </li>
            ))}
          </ul>
        </>
      )}

      {!admin && (
        <button
          disabled={pending}
          onClick={() => window.confirm("Leave this society? You will lose access to its events.") && act(() => removeMemberAction(me))}
          className="mt-4 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Leave society
        </button>
      )}
    </section>
  );
}
