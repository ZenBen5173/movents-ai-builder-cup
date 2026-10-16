"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { requestLoginLink, type LoginState } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ next, google }: { next: string; google: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestLoginLink, { ok: false });
  if (state.ok) {
    return (
      <div className="mt-6 rounded-2xl border border-border bg-card p-5" role="status">
        <Mail className="size-5 text-primary" />
        <p className="mt-2 font-medium">Check your inbox</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a sign-in link to <b className="text-foreground">{state.sentTo}</b>. It expires in 15 minutes.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-6 space-y-4">
      {google && (
        <>
          <Button asChild variant="outline" className="h-11 w-full">
            <a href={`/auth/google?next=${encodeURIComponent(next)}`}>
              <GoogleIcon /> Continue with Google
            </a>
          </Button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
          </div>
        </>
      )}
      <form action={action} className="space-y-3">
        <input type="hidden" name="next" value={next} />
        <label className="block text-sm font-medium" htmlFor="email">Email</label>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@university.edu" className="h-11" />
        {state.error && <p role="alert" className="text-sm text-[var(--red-11)]">{state.error}</p>}
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </form>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.3 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
    </svg>
  );
}
