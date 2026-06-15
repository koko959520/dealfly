#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DealFly — Script de setup Google Cloud + Firebase
#  Projet : traveler-9051a
#  Exécuter UNE SEULE FOIS avant le premier déploiement
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -euo pipefail

PROJECT="traveler-9051a"
REGION="europe-west1"
SA_NAME="dealfly-runner"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║     DealFly — Setup Google Cloud         ║"
echo "║     Projet : ${PROJECT}     ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── 0. Vérifications préalables ──────────────────────────────────────
command -v gcloud  >/dev/null || { echo "❌ gcloud CLI non trouvé — https://cloud.google.com/sdk"; exit 1; }
command -v firebase >/dev/null || { echo "❌ firebase CLI non trouvé — npm i -g firebase-tools"; exit 1; }

echo "✅ Pré-requis OK"
gcloud config set project "${PROJECT}"

# ─── 1. Activer les APIs ───────────────────────────────────────────────
echo ""
echo "▶ Activation des APIs Google Cloud..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com
echo "✅ APIs activées"

# ─── 2. Compte de service IAM ─────────────────────────────────────────
echo ""
echo "▶ Création du compte de service ${SA_NAME}..."
if gcloud iam service-accounts describe "${SA}" --project="${PROJECT}" &>/dev/null; then
  echo "  (déjà existant, on passe)"
else
  gcloud iam service-accounts create "${SA_NAME}" \
    --display-name="DealFly Cloud Run" \
    --project="${PROJECT}"
fi

echo "▶ Attribution des rôles IAM..."
for ROLE in roles/datastore.user roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "${PROJECT}" \
    --member="serviceAccount:${SA}" \
    --role="${ROLE}" \
    --quiet
done
echo "✅ IAM configuré"

# ─── 3. Clé de compte de service → Secret Manager ────────────────────
echo ""
echo "▶ Génération de la clé de compte de service..."
gcloud iam service-accounts keys create /tmp/sa-key.json \
  --iam-account="${SA}" \
  --project="${PROJECT}"

echo "▶ Stockage dans Secret Manager..."
gcloud secrets create GOOGLE_APPLICATION_CREDENTIALS_JSON \
  --project="${PROJECT}" \
  --data-file=/tmp/sa-key.json 2>/dev/null || \
gcloud secrets versions add GOOGLE_APPLICATION_CREDENTIALS_JSON \
  --project="${PROJECT}" \
  --data-file=/tmp/sa-key.json

rm -f /tmp/sa-key.json
echo "✅ Clé de service stockée (fichier local supprimé)"

# ─── 4. Secrets applicatifs ───────────────────────────────────────────
echo ""
echo "▶ Configuration des secrets applicatifs..."
echo "  (Vous allez être invité à entrer chaque valeur)"
echo ""

create_or_update_secret() {
  local NAME="$1"
  local VALUE="$2"
  if gcloud secrets describe "${NAME}" --project="${PROJECT}" &>/dev/null; then
    echo -n "${VALUE}" | gcloud secrets versions add "${NAME}" \
      --project="${PROJECT}" --data-file=-
  else
    echo -n "${VALUE}" | gcloud secrets create "${NAME}" \
      --project="${PROJECT}" --data-file=-
  fi
  # Accorder l'accès au SA
  gcloud secrets add-iam-policy-binding "${NAME}" \
    --project="${PROJECT}" \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet 2>/dev/null || true
}

prompt_secret() {
  local NAME="$1"
  local HINT="$2"
  read -rsp "  ${NAME} (${HINT}): " VALUE
  echo ""
  create_or_update_secret "${NAME}" "${VALUE}"
}

create_or_update_secret "FIREBASE_PROJECT_ID" "${PROJECT}"
create_or_update_secret "AVIATIONSTACK_API_KEY" "ceacb774ea930e52d4c5b70fdc836e1d"
create_or_update_secret "SERPAPI_KEY" "e5d3711f9b6154fbceafccdde8a02d4880e38d52fee46f80a56b12099c9442ba"
create_or_update_secret "RAPIDAPI_KEY" "a8d3cf9375mshf5d047ac89bf21cp178aa2jsn6f4e883a012c"
create_or_update_secret "KIWI_API_KEY" ""
create_or_update_secret "REDIS_URL" "rediss://default:gQAAAAAAAkYFAAIgcDE3NGFhMjA3YTA3YWY0Y2EwYWI5ZjFhNjg2ZjUzZDQyYg@warm-bobcat-148997.upstash.io:6379"
create_or_update_secret "RESEND_API_KEY" "re_61RjSbU7_6Lidk26fBf2hxnjYHQ4zAzym"
create_or_update_secret "EMAIL_FROM" "onboarding@resend.dev"
create_or_update_secret "ADMIN_EMAIL" "bamba.kramoko95@gmail.com"
create_or_update_secret "ADMIN_PASSWORD_HASH" "$2b$10$WlUbDxo2pmOPULCS.KH8DO0ePKM8XhWN2Ib/ar1Hn8MyE6VjSDcLa"
create_or_update_secret "NEXT_PUBLIC_BASE_URL" "https://traveler-9051a.web.app"

# Secrets auto-générés
NEXTAUTH_SECRET=$(openssl rand -hex 32)
HMAC_SECRET=$(openssl rand -hex 32)
create_or_update_secret "NEXTAUTH_SECRET"         "${NEXTAUTH_SECRET}"
create_or_update_secret "UNSUBSCRIBE_HMAC_SECRET" "${HMAC_SECRET}"
echo "  ✅ NEXTAUTH_SECRET et HMAC_SECRET générés automatiquement"

echo ""
echo "✅ Tous les secrets configurés"

# ─── 5. Cloud Build — autorisation de déployer Cloud Run ─────────────
echo ""
echo "▶ Autorisation Cloud Build → Cloud Run..."
CB_SA="$(gcloud projects describe "${PROJECT}" --format='value(projectNumber)')@cloudbuild.gserviceaccount.com"
gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/run.admin" --quiet
gcloud projects add-iam-policy-binding "${PROJECT}" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/iam.serviceAccountUser" --quiet
echo "✅ Cloud Build autorisé"

# ─── 6. Firebase Hosting ─────────────────────────────────────────────
echo ""
echo "▶ Configuration Firebase Hosting..."
firebase use "${PROJECT}"
firebase deploy --only firestore:rules,firestore:indexes
echo "✅ Règles et index Firestore déployés"

# ─── 7. Résumé ────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅ Setup terminé !                                          ║"
echo "║                                                              ║"
echo "║  Prochaine étape — déployer l'application :                  ║"
echo "║    gcloud builds submit --config cloudbuild.yaml .           ║"
echo "║                                                              ║"
echo "║  Puis déployer Firebase Hosting :                            ║"
echo "║    firebase deploy --only hosting                            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
