import "server-only";
import crypto from "node:crypto";

export type CalMode = "google" | "ics";

export function calendarMode(): CalMode {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_CALENDAR_ID) return "google";
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) return "google";
  return "ics";
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  let body: URLSearchParams;
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) as { client_email: string; private_key: string };
    const now = Math.floor(Date.now() / 1000);
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/calendar",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })}`;
    const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(sa.private_key.replace(/\\n/g, "\n"), "base64url");
    body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` });
  } else {
    body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
    });
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Google token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

function nextDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function createGoogleEvent(ev: { title: string; date: string; description?: string; startTime?: string; endTime?: string }) {
  const token = await accessToken();
  const cal = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID ?? "primary");
  const tz = process.env.EVENT_TIMEZONE ?? "Asia/Kuala_Lumpur";
  const timed = ev.startTime && ev.endTime;
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${cal}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      summary: ev.title,
      description: ev.description,
      start: timed ? { dateTime: `${ev.date}T${ev.startTime}:00`, timeZone: tz } : { date: ev.date },
      end: timed ? { dateTime: `${ev.date}T${ev.endTime}:00`, timeZone: tz } : { date: nextDay(ev.date) },
    }),
  });
  if (!res.ok) throw new Error(`Google Calendar ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { id: string; htmlLink: string };
  return { id: json.id, htmlLink: json.htmlLink };
}

/** RFC 5545 calendar file — importable into Google, Outlook or Apple Calendar, or subscribable by URL. */
export function buildIcs(
  calName: string,
  items: { uid: string; title: string; date: string; description?: string; startTime?: string; endTime?: string }[],
) {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Movents//Campus Event Agent//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${esc(calName)}`,
    "X-WR-TIMEZONE:Asia/Kuala_Lumpur",
  ];
  for (const it of items) {
    const d = it.date.replace(/-/g, "");
    lines.push("BEGIN:VEVENT", `UID:${it.uid}@movents`, `DTSTAMP:${stamp}`);
    if (it.startTime && it.endTime) {
      lines.push(
        `DTSTART;TZID=Asia/Kuala_Lumpur:${d}T${it.startTime.replace(":", "")}00`,
        `DTEND;TZID=Asia/Kuala_Lumpur:${d}T${it.endTime.replace(":", "")}00`,
      );
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nextDay(it.date).replace(/-/g, "")}`);
    }
    lines.push(`SUMMARY:${esc(it.title)}`);
    if (it.description) lines.push(`DESCRIPTION:${esc(it.description)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
