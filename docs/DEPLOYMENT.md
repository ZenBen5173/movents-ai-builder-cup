# Deploying Movents

Movents is a Next.js app with a Postgres database. The reference setup is **Google Cloud Run + Vertex AI + Neon**
(one script, below), but any Node 20+ host that runs a container and any Postgres 14+ works.

## Quick deploy to Cloud Run

Needs the gcloud CLI signed in (`gcloud auth login`) and billing on the Google Cloud project. Create a Neon project
(Singapore region for asia-southeast1) and copy its pooled connection string, then:

```bash
DATABASE_URL='postgresql://...-pooler...neon.tech/neondb?sslmode=require' bash scripts/deploy-cloudrun.sh
```

(Or put `CLOUD_DATABASE_URL=...` in `.env.local` and run the script without it.) The script is safe to run again. It:

1. enables Cloud Run, Cloud Build, Artifact Registry, Secret Manager, Cloud Scheduler and Vertex AI;
2. creates the `movents-run` service account and grants it Vertex AI access (no Gemini API key in production);
3. stores `DATABASE_URL`, `APP_SECRET`, `CRON_SECRET` (and `GEMINI_API_KEY` from `.env.local`, used for poster
   images) in Secret Manager;
4. builds the `Dockerfile` with Cloud Build and deploys to Cloud Run in asia-southeast1, with CPU always on so agent
   runs keep working after the request that started them returns;
5. schedules `/api/cron/daily` at 09:00 Malaysia time with Cloud Scheduler;
6. checks `/api/health`.

Override `PROJECT`, `REGION` or `SERVICE` in the shell to deploy elsewhere.

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
| `CRON_SECRET` | yes | Protects `/api/cron/daily`; the scheduler sends it as `Authorization: Bearer <secret>` |
| `GEMINI_PROVIDER`, `GOOGLE_CLOUD_PROJECT` | for the Gemini agents | `vertex` plus the project ID uses Vertex AI as the service account. Optional `VERTEX_LOCATION` (default `global`) |
| `GEMINI_API_KEY` | alternative | Gemini API key instead of Vertex AI (local development); also used for poster images |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS` | optional | Main model and fallbacks, tried in order when one is busy (comma or semicolon separated) |
| `DEMO_MODE` | optional | `1` shows "Try the live demo" on the sign-in page: a private sandbox society per click |
| Email provider | for real accounts | One of: `RESEND_API_KEY` + `RESEND_FROM`, `SMTP_*`, or `GRAPH_*` (Outlook). Needed for sign-in links and invites. Without one, event emails stay in the in-app outbox |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | optional | "Continue with Google" |
| `BLOB_READ_WRITE_TOKEN` | optional | Vercel Blob store for poster and video uploads and daily backups. Without it, media is kept in the database (fine for a demo) and backups are skipped |
| `DATABASE_POOL_MAX` | optional | Connections per instance (default 3) |
| `PLATFORM_ADMIN_EMAILS` | optional | Operators who may maintain any university's SOP, templates and supplier registry |
| Integrations | optional | `LUMA_API_KEY`, `MEETUP_*`, `STRIPE_*`, `GOOGLE_*` (calendar) |

See `.env.example` for the full list.

### Google sign-in

In Google Cloud Console → APIs & Services → Credentials, create an **OAuth client ID** (Web application) with the
authorized redirect URI `https://<your-domain>/auth/google/callback`. Put the client ID and secret in
`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

### Email

Sign-in links and invites are sent through the configured provider. With Resend, verify your sending domain and set
`RESEND_FROM` to an address on it. Never set `EMAIL_REDIRECT_TO` in production (it reroutes event emails to test inboxes).

## 3. Other hosts

The `Dockerfile` builds the Next.js standalone server (`node server.js` on port 8080) and runs on any container host.
Run the daily job by calling `GET /api/cron/daily` with `Authorization: Bearer $CRON_SECRET` once a day. Agent runs
continue in the background after the request returns, so the host must keep CPU available between requests.
`vercel.json` is only used on Vercel.

## 4. After deploying

- Sign in, create your society, invite the committee from **Settings → Members**.
- Connect your AI assistant: see [AI_ASSISTANTS.md](AI_ASSISTANTS.md).
- Point an uptime monitor at `/api/health` (`.github/workflows/uptime.yml` checks the Cloud Run URL every 15 minutes;
  set the repository variable `APP_URL` to change it).
- Server errors are logged as JSON lines (see `src/instrumentation.ts`); connect your log drain or error tracker there.

## Operations

- **Rate limits** use the client IP from `x-real-ip` / `x-forwarded-for`. Cloud Run and Vercel set these; behind your
  own proxy, make sure it overwrites them.
- **Logs:** Cloud Run sends server output to Cloud Logging. Gemini retries show as `[gemini] ...` lines.
- **Backups:** with a Blob store connected, the daily cron writes a compressed copy of the data to the private Blob store as `backups/YYYY-MM-DD.json.gz` and keeps 14 days. It leaves out sessions, sign-in links, OAuth tokens and rate limits (people sign in again after a restore). Restore into a migrated database (try a Neon branch first):
  ```bash
  DATABASE_URL=... BLOB_READ_WRITE_TOKEN=... npm run restore-backup -- backups/2026-10-14.json.gz        # dry run
  DATABASE_URL=... BLOB_READ_WRITE_TOKEN=... npm run restore-backup -- backups/2026-10-14.json.gz --yes  # replace data
  ```
  For anything within the last few hours, your database provider's point-in-time restore is quicker.
- **Rotating `APP_SECRET`:** invalidates outstanding faculty, upload and document links (they can be re-sent).
  Sessions and API tokens are unaffected.
- **Revoking access:** remove a member in Settings (their event access ends immediately); users revoke their own
  tokens and connected apps in Settings.
