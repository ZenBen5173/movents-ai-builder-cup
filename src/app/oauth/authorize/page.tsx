import { redirect } from "next/navigation";
import { BrandMark } from "@/components/app/brand-mark";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/lib/session";
import { one } from "@/lib/db";
import { authorizeParamError, checkAuthorizeRequest, OAuthError } from "@/lib/oauth";
import { ROLE_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Connect an AI assistant" };

type P = Record<string, string | undefined>;

export default async function Authorize({ searchParams }: { searchParams: Promise<P> }) {
  const p = await searchParams;
  let client: { id: string; name: string };
  try {
    client = await checkAuthorizeRequest(p);
  } catch (err) {
    return <Problem text={err instanceof OAuthError ? err.message : "This connection request is invalid."} />;
  }
  const bad = authorizeParamError(p);
  if (bad) {
    const u = new URL(p.redirect_uri!);
    u.searchParams.set("error", bad);
    if (p.state) u.searchParams.set("state", p.state);
    redirect(u.toString());
  }
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${new URLSearchParams(p as Record<string, string>)}`)}`);
  if (!user.society_id) redirect(`/onboarding`);
  const soc = await one<{ name: string }>("SELECT name FROM societies WHERE id = $1", [user.society_id]);
  const fields = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <BrandMark />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Connect {client.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <b className="text-foreground">{client.name}</b> wants to plan events in Movents as you:
        </p>
        <div className="mt-4 rounded-xl border border-border bg-card p-3 text-sm">
          <p className="font-medium">{user.name}</p>
          <p className="text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-muted-foreground">{ROLE_LABEL[user.role]} · {soc?.name}</p>
        </div>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>See and edit the events you can see</li>
          <li>Send emails and requests with your permissions; anything you can&apos;t do alone goes to an approver</li>
          <li>You can disconnect it any time in Settings</li>
        </ul>
        <p className="mt-3 break-all text-xs text-muted-foreground">You&apos;ll return to {new URL(p.redirect_uri!).host || p.redirect_uri}</p>
        <form method="post" action="/oauth/authorize/decide" className="mt-6 grid grid-cols-2 gap-2">
          {fields.map((f) => (p[f] ? <input key={f} type="hidden" name={f} value={p[f]} /> : null))}
          <Button type="submit" name="decision" value="deny" variant="outline" className="h-11">Cancel</Button>
          <Button type="submit" name="decision" value="allow" className="h-11">Allow</Button>
        </form>
      </div>
    </main>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <BrandMark />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Can&apos;t connect</h1>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
    </main>
  );
}
