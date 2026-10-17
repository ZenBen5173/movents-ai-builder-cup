#!/usr/bin/env bash
# Deploy Movents to Google Cloud Run (asia-southeast1), end to end:
#   APIs → service account → Secret Manager → Cloud Build + Cloud Run → Cloud Scheduler.
# Safe to run again: it updates what is already there.
#
#   DATABASE_URL='postgresql://...neon.tech/neondb?sslmode=require' bash scripts/deploy-cloudrun.sh
#
# Needs: gcloud signed in (gcloud auth login), billing on the project.
# GEMINI_API_KEY and CLOUD_DATABASE_URL are read from .env.local when not set in the shell.
set -euo pipefail

PROJECT="${PROJECT:-ai-builder-cup-511813}"
REGION="${REGION:-asia-southeast1}"
SERVICE="${SERVICE:-movents}"
SA_NAME="movents-run"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
cd "$(dirname "$0")/.."

# Values not set in the shell come from .env.local. CLOUD_DATABASE_URL keeps the
# cloud database apart from local development (which uses PGlite).
from_env_file() { [ -f .env.local ] && grep -E "^$1=" .env.local | head -1 | cut -d= -f2- | tr -d "\"'\r" || true; }
GEMINI_API_KEY="${GEMINI_API_KEY:-$(from_env_file GEMINI_API_KEY)}"
DATABASE_URL="${DATABASE_URL:-$(from_env_file CLOUD_DATABASE_URL)}"

gcloud config set project "$PROJECT" >/dev/null
if [ "$(gcloud billing projects describe "$PROJECT" --format='value(billingEnabled)')" != "True" ]; then
  echo "Billing is not enabled on $PROJECT. Link a billing account first:"
  echo "  https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT"
  exit 1
fi
NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
URL="https://${SERVICE}-${NUMBER}.${REGION}.run.app"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

say "Enabling APIs"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com aiplatform.googleapis.com generativelanguage.googleapis.com firestore.googleapis.com

say "Service accounts"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" --display-name "Movents on Cloud Run"
# The app calls Gemini on Vertex AI as this account (no API key in production).
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/aiplatform.user --condition None >/dev/null
# Firestore (Native mode, same region) holds the live agent run feed.
gcloud firestore databases describe --database="(default)" >/dev/null 2>&1 ||
  gcloud firestore databases create --location="$REGION" --type=firestore-native >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role roles/datastore.user --condition None >/dev/null
# Source deploys build with the default compute account; it needs the builder role on new projects.
gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:${NUMBER}-compute@developer.gserviceaccount.com" \
  --role roles/cloudbuild.builds.builder --condition None >/dev/null

say "Secrets (Secret Manager)"
put_secret() { # name value [only-if-missing]
  local name="$1" value="$2" keep="${3:-}"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    [ -n "$keep" ] && { echo "  $name: kept"; return; }
    [ -z "$value" ] && { echo "  $name: kept (no new value given)"; return; }
    printf %s "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null && echo "  $name: new version"
  else
    [ -z "$value" ] && { echo "Missing value for $name. Set it in the shell and run again."; exit 1; }
    printf %s "$value" | gcloud secrets create "$name" --replication-policy automatic --data-file=- >/dev/null && echo "  $name: created"
  fi
  gcloud secrets add-iam-policy-binding "$name" --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor >/dev/null
}
put_secret movents-gemini-key "${GEMINI_API_KEY:-}"
put_secret movents-database-url "${DATABASE_URL:-}"
put_secret movents-app-secret "$(openssl rand -hex 32)" keep
put_secret movents-cron-secret "$(openssl rand -hex 24)" keep

say "Build and deploy to Cloud Run ($REGION)"
# --no-cpu-throttling: agent runs keep working after the request that started them returns.
gcloud run deploy "$SERVICE" --source . --region "$REGION" --quiet \
  --service-account "$SA" --allow-unauthenticated \
  --cpu 1 --memory 1Gi --no-cpu-throttling --min-instances 0 --max-instances 3 --concurrency 80 --timeout 300 \
  --set-env-vars "APP_URL=${URL},DEMO_MODE=1,GEMINI_PROVIDER=vertex,GOOGLE_CLOUD_PROJECT=${PROJECT},VERTEX_LOCATION=global,GEMINI_MODEL=gemini-3-flash-preview,GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite;gemini-3.5-flash,EVENT_TIMEZONE=Asia/Kuala_Lumpur,DATABASE_POOL_MAX=5,FIRESTORE_RUNS=1" \
  --set-secrets "GEMINI_API_KEY=movents-gemini-key:latest,DATABASE_URL=movents-database-url:latest,APP_SECRET=movents-app-secret:latest,CRON_SECRET=movents-cron-secret:latest"

say "Daily automations (Cloud Scheduler, 09:00 Malaysia time)"
CRON="$(gcloud secrets versions access latest --secret movents-cron-secret)"
JOB=(--location "$REGION" --schedule "0 9 * * *" --time-zone "Asia/Kuala_Lumpur" --uri "${URL}/api/cron/daily" --http-method GET --attempt-deadline 300s)
if gcloud scheduler jobs describe movents-daily --location "$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http movents-daily "${JOB[@]}" --update-headers "Authorization=Bearer ${CRON}" >/dev/null
else
  gcloud scheduler jobs create http movents-daily "${JOB[@]}" --headers "Authorization=Bearer ${CRON}" >/dev/null
fi

say "Health check"
curl -fsS "${URL}/api/health" && echo
echo
echo "Live at ${URL}"
