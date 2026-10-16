import "server-only";
import { esc } from "../html";
import { id, insert, update } from "../db";
import type { Email } from "../types";

export type EmailProvider = "graph" | "smtp" | "resend" | "outbox";

export function emailProvider(): EmailProvider {
  const forced = process.env.EMAIL_PROVIDER as EmailProvider | undefined;
  if (forced) return forced;
  if (process.env.GRAPH_TENANT_ID && process.env.GRAPH_CLIENT_ID && process.env.GRAPH_CLIENT_SECRET && process.env.GRAPH_SENDER) return "graph";
  if (process.env.SMTP_HOST && process.env.SMTP_USER) return "smtp";
  if (process.env.RESEND_API_KEY) return "resend";
  return "outbox";
}

/** Test safety: when EMAIL_REDIRECT_TO is set, every email goes to the team test inboxes instead. */
function redirectTargets() {
  return (process.env.EMAIL_REDIRECT_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

let rotate = 0;

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  kind: string;
  eventId?: string | null;
  relatedId?: string | null;
  sentBy?: string | null;
}): Promise<Email> {
  const targets = redirectTargets();
  const actualTo = targets.length ? targets[rotate++ % targets.length] : input.to;
  const provider = emailProvider();
  const row = await insert<Email>("emails", {
    id: id("eml"),
    event_id: input.eventId ?? null,
    kind: input.kind,
    to_addr: actualTo,
    intended_to: input.to,
    subject: input.subject,
    body: input.html,
    status: "queued",
    provider,
    related_id: input.relatedId ?? null,
    sent_by: input.sentBy ?? null,
  });

  try {
    const providerId = await deliver(provider, actualTo, input.subject, input.html);
    return (await update<Email>("emails", row.id, {
      status: provider === "outbox" ? "outbox" : "sent",
      provider_id: providerId,
      sent_at: new Date(),
    }))!;
  } catch (err) {
    return (await update<Email>("emails", row.id, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    }))!;
  }
}

/**
 * Account emails (sign-in links, invites). Sent straight to the recipient,
 * never stored in the outbox and never redirected, because they carry
 * credentials. Without a provider the link is printed to the server log in
 * development and refused in production.
 */
export async function sendSystemEmail(to: string, subject: string, html: string, devLink?: string) {
  const provider = emailProvider();
  if (provider === "outbox") {
    if (process.env.NODE_ENV === "production") throw new Error("Email is not configured on this server. Ask the administrator to set up an email provider.");
    console.info(`[email:dev] To ${to}: ${subject}${devLink ? `\n  ${devLink}` : ""}`);
    return;
  }
  await deliver(provider, to, subject, html);
}

async function deliver(provider: EmailProvider, to: string, subject: string, html: string): Promise<string | null> {
  switch (provider) {
    case "graph":
      return sendGraph(to, subject, html);
    case "smtp":
      return sendSmtp(to, subject, html);
    case "resend":
      return sendResend(to, subject, html);
    default:
      return null;
  }
}

async function sendGraph(to: string, subject: string, html: string) {
  const tenant = process.env.GRAPH_TENANT_ID!;
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GRAPH_CLIENT_ID!,
      client_secret: process.env.GRAPH_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Graph token ${tokenRes.status}: ${(await tokenRes.text()).slice(0, 200)}`);
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const sender = encodeURIComponent(process.env.GRAPH_SENDER!);
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${sender}/sendMail`, {
    method: "POST",
    headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (res.status !== 202) throw new Error(`Graph sendMail ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.headers.get("request-id");
}

async function sendSmtp(to: string, subject: string, html: string) {
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to,
    subject,
    html,
  });
  return info.messageId ?? null;
}

async function sendResend(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM ?? "Movents <onboarding@resend.dev>", to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { id: string };
  return json.id;
}

export function emailShell(title: string, inner: string) {
  return `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:620px;margin:auto;color:#1c2024">
<div style="padding:16px 20px;background:#3e63dd;color:#fff;border-radius:10px 10px 0 0;font-weight:600">${esc(title)}</div>
<div style="padding:20px;border:1px solid #d9d9e0;border-top:0;border-radius:0 0 10px 10px;line-height:1.55">${inner}</div>
<p style="font-size:12px;color:#60646c;margin-top:12px">Sent by Movents on behalf of the society. Every send is logged in the society's audit trail.</p></div>`;
}
