import { pageUser } from "@/lib/guard";
import { appUrl } from "@/lib/appurl";
import { isFinal } from "@/lib/rbac";
import { emailProvider } from "@/lib/integrations/email";
import { calendarMode } from "@/lib/integrations/gcal";
import { lumaMode, meetupMode } from "@/lib/integrations/ticketing";
import { paymentsMode } from "@/lib/integrations/payments";
import { nanoBananaEnabled } from "@/lib/integrations/nanobanana";
import { listApiTokens, listOAuthGrants } from "@/lib/auth/api-tokens";
import { listOpenInvites, listPeople } from "@/lib/workspace";
import { PageHeader } from "@/components/app/ui";
import { SettingsClient, type Integration } from "@/components/app/settings-client";
import { MembersPanel } from "@/components/app/members-panel";
import { AccountPanel } from "@/components/app/account-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await pageUser();
  const admin = isFinal(user);
  const [tokens, grants, people, invites] = await Promise.all([
    listApiTokens(user.id),
    listOAuthGrants(user.id),
    listPeople(user.society_id),
    admin ? listOpenInvites(user.society_id) : Promise.resolve([]),
  ]);
  const email = emailProvider();
  const integrations: Integration[] = [
    { name: "Email", mark: "@", tone: "bg-tomato", live: email !== "outbox", mode: email === "outbox" ? "Not configured" : email, why: "Speaker, supplier and faculty mail", env: "GRAPH_* (Outlook), SMTP_* or RESEND_API_KEY" },
    { name: "Calendar", mark: "G", tone: "bg-sky", live: calendarMode() === "google", mode: calendarMode() === "google" ? "Google Calendar" : ".ics feed", why: "Timeline milestones", env: "GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_CALENDAR_ID" },
    { name: "Luma", mark: "L", tone: "bg-peach", live: lumaMode() === "live", mode: lumaMode() === "live" ? "Live" : "Not configured", why: "Event page and RSVPs", env: "LUMA_API_KEY" },
    { name: "Meetup", mark: "M", tone: "bg-tomato", live: meetupMode() === "live", mode: meetupMode() === "live" ? "Live" : "Not configured", why: "Event page and RSVPs", env: "MEETUP_ACCESS_TOKEN + MEETUP_GROUP_URLNAME" },
    { name: "Payments", mark: "S", tone: "bg-ticket-blue text-white", live: paymentsMode() === "stripe", mode: paymentsMode() === "stripe" ? "Stripe" : "Not configured", why: "Supplier deposits", env: "STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET" },
    { name: "Images", mark: "N", tone: "bg-sun", live: nanoBananaEnabled(), mode: nanoBananaEnabled() ? "Gemini" : "Your AI assistant", why: "Posters and social images", env: "GEMINI_API_KEY (optional)" },
    { name: "Weather", mark: "W", tone: "bg-mint", live: true, mode: "Open-Meteo", why: "Risk contingency plans", env: "No key needed" },
  ];
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Settings" />
      <SettingsClient
        mcpUrl={`${appUrl()}/api/mcp`}
        tokens={tokens.map((t) => ({ ...t, created_at: new Date(t.created_at).toISOString(), last_used_at: t.last_used_at ? new Date(t.last_used_at).toISOString() : null }))}
        grants={grants.map((g) => ({ ...g, created_at: new Date(g.created_at).toISOString() }))}
        integrations={integrations}
        isFinal={admin}
      />
      <MembersPanel
        me={user.id}
        admin={admin}
        people={people.map((p) => ({ ...p, joined: new Date(p.joined).toISOString() }))}
        invites={invites.map((i) => ({ ...i, expires_at: new Date(i.expires_at).toISOString() }))}
      />
      <AccountPanel email={user.email} />
    </div>
  );
}
