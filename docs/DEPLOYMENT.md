# Deploying Movents

Movents is a Next.js app with a Postgres database. The reference setup is **Vercel + Neon**, but any Node 20+ host and
any Postgres 14+ works.

## 1. Database

Create a Postgres database (Neon, Supabase, RDS…). On serverless hosts use the **pooled** connection string (Neon:
the `-pooler` host). Set it as `DATABASE_URL`.

Migrations run automatically on the first request of each server instance (under an advisory lock, so concurrent
instances are safe). To run them as a deploy step instead:

```bash
DATABASE_URL=... npm run migrate
```

A new database gets reference data: Sunway University's SOP template, venues and a supplier registry with public
list prices. Other universities are added from **Universities → Add university** with their SOP.

A university's SOP applies to every society there, so it can only be changed by the President/VP of the society
that added the university, or by a platform admin (`PLATFORM_ADMIN_EMAILS`). Reference universities (like Sunway)
are maintained by platform admins.

**Upgrading the hackathon deployment:** the first run migrates existing data (memberships, hashed API keys, repaired
JSON). Then remove the old demo societies, people and events:

```bash
DATABASE_URL=... npm run purge-demo          # dry run
DATABASE_URL=... npm run purge-demo -- --yes # delete
```

## 2. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `APP_SECRET` | yes | 32+ random characters; signs shared links. `openssl rand -base64 48` |
| `APP_URL` | yes | Public URL, e.g. `https://movents.example.com` (links in emails, OAuth issuer) |
| `CRON_SECRET` | yes on Vercel | Protects `/api/cron/daily`; Vercel Cron sends it automatically |
| Email provider | yes | One of: `RESEND_API_KEY` + `RESEND_FROM`, `SMTP_*`, or `GRAPH_*` (Outlook). Needed for sign-in links and invites |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | optional | "Continue with Google" |
| `BLOB_READ_WRITE_TOKEN` | yes on Vercel | Private Vercel Blob store for poster and video uploads (`vercel blob create-store <name> --access private` connects it). Without it, media is kept in the database, which suits local development only |
| `DATABASE_POOL_MAX` | optional | Connections per instance (default 3) |
| `PLATFORM_ADMIN_EMAILS` | optional | Operators who may maintain any university's SOP, templates and supplier registry |
| Integrations | optional | `LUMA_API_KEY`, `MEETUP_*`, `STRIPE_*`, `GOOGLE_*` (calendar), `GEMINI_API_KEY` (images) |

See `.env.example` for the full list.

### Google sign-in

In Google Cloud Console → APIs & Services → Credentials, create an **OAuth client ID** (Web application) with the
authorized redirect URI `https://<your-domain>/auth/google/callback`. Put the client ID and secret in
`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

### Email

Sign-in links and invites are sent through the configured provider. With Resend, verify your sending domain and set
`RESEND_FROM` to an address on it. Never set `EMAIL_REDIRECT_TO` in production (it reroutes event emails to test inboxes).

## 3. Vercel

1. Import the repository. Framework: Next.js. Node 20 or 22.
2. Add the environment variables above (Production and Preview; use a separate database for Preview).
3. Deploy. `vercel.json` schedules the daily automations at 01:00 UTC.
4. Check `https://<your-domain>/api/health` returns `{"ok":true}`.

## 4. After deploying

- Sign in, create your society, invite the committee from **Settings → Members**.
- Connect your AI assistant: see [AI_ASSISTANTS.md](AI_ASSISTANTS.md).
- Point an uptime monitor at `/api/health`.
- Server errors are logged as JSON lines (see `src/instrumentation.ts`); connect your log drain or error tracker there.

## Operations

- **Rate limits** use the client IP from `x-real-ip` / `x-forwarded-for`. Vercel sets these; behind your own proxy,
  make sure it overwrites them.
- **Backups:** the daily cron (01:00 UTC) writes a compressed copy of the data to the private Blob store as `backups/YYYY-MM-DD.json.gz` and keeps 14 days. It leaves out sessions, sign-in links, OAuth tokens and rate limits (people sign in again after a restore). Restore into a migrated database (try a Neon branch first):
  ```bash
  DATABASE_URL=... BLOB_READ_WRITE_TOKEN=... npm run restore-backup -- backups/2026-10-14.json.gz        # dry run
  DATABASE_URL=... BLOB_READ_WRITE_TOKEN=... npm run restore-backup -- backups/2026-10-14.json.gz --yes  # replace data
  ```
  For anything within the last few hours, your database provider's point-in-time restore is quicker.
- **Rotating `APP_SECRET`:** invalidates outstanding faculty, upload and document links (they can be re-sent).
  Sessions and API tokens are unaffected.
- **Revoking access:** remove a member in Settings (their event access ends immediately); users revoke their own
  tokens and connected apps in Settings.
