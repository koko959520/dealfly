# Guide de déploiement — DealFly sur Firebase + Cloud Run

## Architecture
```
Firebase Hosting  →  redirige vers  →  Cloud Run (dealfly-app)
                                         Cloud Run (dealfly-worker)
Firestore         →  base de données NoSQL
Upstash Redis     →  file BullMQ (workers)
Google Secret Manager → secrets chiffrés
```

---

## Pré-requis

- [gcloud CLI](https://cloud.google.com/sdk/docs/install) installé et authentifié
- [Firebase CLI](https://firebase.google.com/docs/cli) installé (`npm i -g firebase-tools`)
- Projet Firebase existant : **traveler-9051a**
- Compte [Upstash](https://upstash.com) (Redis gratuit pour BullMQ)
- Compte [Resend](https://resend.com) (emails transactionnels)
- Clés API Amadeus et/ou Kiwi

---

## Étape 1 — Activer les APIs Google Cloud

```bash
gcloud config set project traveler-9051a

gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com
```

---

## Étape 2 — Créer la base Firestore

1. Ouvrir la [console Firebase](https://console.firebase.google.com/project/traveler-9051a/firestore)
2. Cliquer **Créer une base de données**
3. Choisir le mode **Production**
4. Région : **europe-west1** (même région que Cloud Run)

### Déployer les règles et index Firestore

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

> ⚠️ Les index composites sont nécessaires pour les requêtes multi-champs.
> Si Firestore renvoie une erreur "index requis", cliquer le lien fourni dans l'erreur pour le créer automatiquement.

---

## Étape 3 — Compte de service IAM

```bash
# Créer le compte de service
gcloud iam service-accounts create dealfly-runner \
  --display-name="DealFly Cloud Run"

# Permissions nécessaires
PROJECT=traveler-9051a
SA=dealfly-runner@${PROJECT}.iam.gserviceaccount.com

gcloud projects add-iam-policy-binding ${PROJECT} \
  --member="serviceAccount:${SA}" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding ${PROJECT} \
  --member="serviceAccount:${SA}" \
  --role="roles/secretmanager.secretAccessor"

# Générer la clé JSON (pour Secret Manager, PAS à stocker localement en prod)
gcloud iam service-accounts keys create sa-key.json \
  --iam-account=${SA}
```

---

## Étape 4 — Stocker les secrets dans Secret Manager

```bash
# Copier le contenu du fichier sa-key.json généré à l'étape 3
gcloud secrets create GOOGLE_APPLICATION_CREDENTIALS_JSON \
  --data-file=sa-key.json

# Supprimer la clé locale après upload
rm sa-key.json

# Autres secrets
echo -n "votre_amadeus_key"    | gcloud secrets create AMADEUS_API_KEY --data-file=-
echo -n "votre_amadeus_secret" | gcloud secrets create AMADEUS_API_SECRET --data-file=-
echo -n "votre_kiwi_key"       | gcloud secrets create KIWI_API_KEY --data-file=-
echo -n "redis://..."          | gcloud secrets create REDIS_URL --data-file=-
echo -n "re_xxx..."            | gcloud secrets create RESEND_API_KEY --data-file=-
echo -n "deals@domaine.com"    | gcloud secrets create EMAIL_FROM --data-file=-
echo -n "$(openssl rand -hex 32)" | gcloud secrets create NEXTAUTH_SECRET --data-file=-
echo -n "admin@domaine.com"    | gcloud secrets create ADMIN_EMAIL --data-file=-
# Générer le hash bcrypt puis stocker :
# node -e "console.log(require('bcryptjs').hashSync('motdepasse',10))"
echo -n '$2b$10$...' | gcloud secrets create ADMIN_PASSWORD_HASH --data-file=-
echo -n "$(openssl rand -hex 32)" | gcloud secrets create UNSUBSCRIBE_HMAC_SECRET --data-file=-
echo -n "https://dealfly.example.com" | gcloud secrets create NEXT_PUBLIC_BASE_URL --data-file=-
echo -n "traveler-9051a" | gcloud secrets create FIREBASE_PROJECT_ID --data-file=-

# Accorder l'accès au compte de service
for SECRET in GOOGLE_APPLICATION_CREDENTIALS_JSON AMADEUS_API_KEY AMADEUS_API_SECRET \
              KIWI_API_KEY REDIS_URL RESEND_API_KEY EMAIL_FROM NEXTAUTH_SECRET \
              ADMIN_EMAIL ADMIN_PASSWORD_HASH UNSUBSCRIBE_HMAC_SECRET \
              NEXT_PUBLIC_BASE_URL FIREBASE_PROJECT_ID; do
  gcloud secrets add-iam-policy-binding ${SECRET} \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## Étape 5 — Configurer Firebase Hosting

```bash
firebase login
firebase use traveler-9051a
```

Vérifier que `firebase.json` et `.firebaserc` sont présents (déjà dans le repo).

---

## Étape 6 — Premier déploiement via Cloud Build

```bash
gcloud builds submit --config cloudbuild.yaml .
```

Ce pipeline :
1. Construit l'image Next.js (`dealfly-app`) avec `output: standalone`
2. Construit l'image Worker BullMQ (`dealfly-worker`)
3. Déploie les deux sur Cloud Run `europe-west1`
4. Injecte tous les secrets via Secret Manager

---

## Étape 7 — Déployer Firebase Hosting

```bash
firebase deploy --only hosting
```

Après cette commande, Firebase redirige `https://traveler-9051a.web.app` vers Cloud Run.

---

## Étape 8 — Vérifications post-déploiement

```bash
# Voir les logs de l'app
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=dealfly-app" \
  --limit=50 --format=json

# Voir les logs du worker
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=dealfly-worker" \
  --limit=50 --format=json

# Tester l'API
curl https://VOTRE_CLOUD_RUN_URL/api/deals
```

---

## Étape 9 — Domaine personnalisé (optionnel)

```bash
firebase hosting:channel:deploy preview   # test préalable
# Puis dans la console Firebase > Hosting > Ajouter un domaine personnalisé
```

---

## Développement local

```bash
# 1. Authentifier gcloud pour ADC (Application Default Credentials)
gcloud auth application-default login

# 2. Copier et remplir les variables
cp .env.example .env.local
# Remplir : AMADEUS_API_KEY, KIWI_API_KEY, RESEND_API_KEY, etc.
# Laisser GOOGLE_APPLICATION_CREDENTIALS_JSON vide (ADC utilisé automatiquement)

# 3. Démarrer Redis local (nécessaire pour BullMQ)
docker run -d -p 6379:6379 redis:7-alpine

# 4. Lancer le dev server
npm run dev

# 5. Lancer le worker (dans un autre terminal)
npm run worker
```

> **Note Firestore local** : Par défaut, les requêtes pointent vers Firestore en production
> (projet `traveler-9051a`). Pour un émulateur local :
> `export FIRESTORE_EMULATOR_HOST=localhost:8080` puis `firebase emulators:start --only firestore`

---

## Variables d'environnement (référence complète)

| Variable | Description | Requis |
|---|---|---|
| `FIREBASE_PROJECT_ID` | ID du projet Firebase (`traveler-9051a`) | ✅ |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | JSON du compte de service (prod uniquement) | ✅ prod |
| `AMADEUS_API_KEY` | Clé API Amadeus | ✅ |
| `AMADEUS_API_SECRET` | Secret API Amadeus | ✅ |
| `KIWI_API_KEY` | Clé API Kiwi/Tequila | ✅ |
| `REDIS_URL` | URL Redis Upstash pour BullMQ | ✅ |
| `RESEND_API_KEY` | Clé Resend pour emails | ✅ |
| `EMAIL_FROM` | Adresse expéditeur des emails | ✅ |
| `NEXTAUTH_SECRET` | Secret JWT NextAuth (32+ chars) | ✅ |
| `NEXTAUTH_URL` | URL publique de l'app | ✅ |
| `ADMIN_EMAIL` | Email de connexion admin | ✅ |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt du mot de passe admin | ✅ |
| `UNSUBSCRIBE_HMAC_SECRET` | Secret HMAC pour tokens newsletter | ✅ |
| `NEXT_PUBLIC_BASE_URL` | URL publique (ex: https://dealfly.example.com) | ✅ |
| `SKYSCANNER_RAPIDAPI_KEY` | Clé RapidAPI Skyscanner (optionnel) | ➖ |
