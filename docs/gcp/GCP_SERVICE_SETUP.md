# Guide de Configuration GCP pour les Services n8n

Ce document explique comment configurer Google Cloud Platform pour créer un nouveau service n8n utilisant les APIs Google (Gemini, Vertex AI, etc.).

## Prérequis

- Compte Google Cloud Platform
- `gcloud` CLI installé
- Accès administrateur au projet GCP

## 1. Installation de gcloud CLI

### Linux/Raspberry Pi

```bash
# Télécharger et installer
curl https://sdk.cloud.google.com | bash

# Redémarrer le shell
exec -l $SHELL

# Vérifier l'installation
gcloud version
```

### macOS

```bash
brew install google-cloud-sdk
```

### Windows

Télécharger l'installateur depuis : https://cloud.google.com/sdk/docs/install

## 2. Authentification et Configuration

### Connexion à GCP

```bash
# Se connecter à son compte Google
gcloud auth login

# Définir le projet par défaut
gcloud config set project YOUR_PROJECT_ID

# Vérifier la configuration
gcloud config list
```

### Configuration ADC (Application Default Credentials)

Pour que les applications locales (n8n, scripts Python) puissent s'authentifier :

```bash
# Créer les credentials par défaut
gcloud auth application-default login

# Les credentials sont stockés dans :
# Linux/macOS: ~/.config/gcloud/application_default_credentials.json
# Windows: %APPDATA%\gcloud\application_default_credentials.json
```

## 3. Création d'un Projet GCP

```bash
# Créer un nouveau projet
gcloud projects create my-n8n-project --name="n8n Workflows"

# Définir comme projet par défaut
gcloud config set project my-n8n-project

# Activer la facturation (requis pour les APIs)
# Faire via la console : https://console.cloud.google.com/billing
```

## 4. Activation des APIs

### APIs de base pour Gemini/Vertex AI

```bash
# Vertex AI (pour Gemini via Vertex)
gcloud services enable aiplatform.googleapis.com

# Generative Language API (pour Gemini via AI Studio)
gcloud services enable generativelanguage.googleapis.com

# Cloud Storage (pour stocker des fichiers)
gcloud services enable storage.googleapis.com
```

### APIs pour Cloud Functions (extraction d'images)

```bash
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

### APIs pour les services Google Workspace

```bash
gcloud services enable gmail.googleapis.com
gcloud services enable calendar-json.googleapis.com
gcloud services enable drive.googleapis.com
gcloud services enable people.googleapis.com
```

### Vérifier les APIs activées

```bash
gcloud services list --enabled
```

## 5. Création d'un Service Account

### Créer le Service Account

```bash
# Créer le service account
gcloud iam service-accounts create n8n-service \
  --display-name="n8n Service Account" \
  --description="Service account for n8n workflows"

# Lister les service accounts
gcloud iam service-accounts list
```

### Attribuer les rôles

```bash
PROJECT_ID=$(gcloud config get-value project)
SA_EMAIL="n8n-service@${PROJECT_ID}.iam.gserviceaccount.com"

# Rôle Vertex AI User (pour Gemini)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/aiplatform.user"

# Rôle Storage Admin (pour GCS)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.admin"

# Rôle Cloud Functions Invoker (pour appeler des fonctions)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/cloudfunctions.invoker"
```

### Générer la clé JSON

```bash
# Créer le fichier de clé
gcloud iam service-accounts keys create ~/n8n-service-key.json \
  --iam-account=$SA_EMAIL

# Sécuriser le fichier
chmod 600 ~/n8n-service-key.json

echo "Clé créée : ~/n8n-service-key.json"
```

## 6. Configuration dans n8n

### Option 1 : Via Service Account Key (recommandé pour production)

1. Aller dans n8n → Credentials → Add Credential
2. Chercher "Google Vertex AI"
3. Remplir :
   - **Project ID** : `YOUR_PROJECT_ID`
   - **Region** : `us-central1` (ou `europe-west1`)
   - **Authentication** : Service Account Key
   - **Service Account Key** : Coller le contenu de `n8n-service-key.json`

### Option 2 : Via ADC (pour développement local)

1. S'assurer que `gcloud auth application-default login` a été exécuté
2. Dans n8n Credentials :
   - **Authentication** : ADC (Application Default Credentials)
   - **Project ID** : `YOUR_PROJECT_ID`
   - **Region** : `us-central1`

## 7. Configuration pour Raspberry Pi / Serveur

### Copier les credentials sur le serveur

```bash
# Depuis votre machine locale
scp ~/n8n-service-key.json pi@raspberry:/home/pi/.config/gcloud/

# Sur le Raspberry Pi
export GOOGLE_APPLICATION_CREDENTIALS="/home/pi/.config/gcloud/n8n-service-key.json"

# Ajouter à ~/.bashrc pour persistance
echo 'export GOOGLE_APPLICATION_CREDENTIALS="/home/pi/.config/gcloud/n8n-service-key.json"' >> ~/.bashrc
```

### Configurer ADC sur le serveur (alternative)

```bash
# Sur le Raspberry Pi
gcloud auth application-default login --no-launch-browser

# Suivre les instructions pour copier l'URL et le code
```

## 8. Vérification

### Tester l'authentification

```bash
# Tester avec gcloud
gcloud auth application-default print-access-token

# Tester avec curl (Vertex AI)
curl -X POST \
  -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
  -H "Content-Type: application/json" \
  "https://us-central1-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/us-central1/publishers/google/models/gemini-2.0-flash:generateContent" \
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
```

### Tester dans n8n

1. Créer un workflow simple avec le node "Google Vertex AI"
2. Envoyer un prompt test : "Say hello"
3. Vérifier que la réponse est reçue

## 9. Quotas et Limites

### Vérifier les quotas

```bash
gcloud compute project-info describe --project=$PROJECT_ID
```

### Quotas Gemini par défaut

| Modèle | Requêtes/minute | Tokens/minute |
|--------|-----------------|---------------|
| gemini-2.5-flash | 60 | 1,000,000 |
| gemini-2.5-pro | 10 | 250,000 |

### Demander une augmentation

Console GCP → IAM & Admin → Quotas → Filtrer par "aiplatform" → Request Increase

## 10. Coûts estimés

| Service | Coût |
|---------|------|
| Gemini 2.5 Flash | $0.075 / 1M tokens input |
| Gemini 2.5 Pro | $1.25 / 1M tokens input |
| Cloud Storage | $0.02 / GB / mois |
| Cloud Functions | $0.0000025 / invocation |

**Free tier inclus :**
- Cloud Functions : 2M invocations/mois
- Cloud Storage : 5GB
- Gemini via AI Studio : Limité mais gratuit

## 11. Checklist Nouveau Service

- [ ] Projet GCP créé
- [ ] Facturation activée
- [ ] APIs nécessaires activées
- [ ] Service Account créé
- [ ] Rôles IAM attribués
- [ ] Clé JSON générée
- [ ] Credentials configurés dans n8n
- [ ] Test de connexion réussi

## 12. Dépannage

### Erreur "Permission denied"

```bash
# Vérifier les rôles du service account
gcloud projects get-iam-policy $PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:$SA_EMAIL"
```

### Erreur "API not enabled"

```bash
# Lister les APIs désactivées
gcloud services list --available --filter="state:DISABLED" | grep -i "gemini\|vertex\|ai"

# Activer l'API manquante
gcloud services enable SERVICE_NAME
```

### Erreur "Quota exceeded"

Attendre ou demander une augmentation de quota via la console GCP.

## Voir aussi

- [Documentation Vertex AI](https://cloud.google.com/vertex-ai/docs)
- [Google Gemini API](https://ai.google.dev/docs)
- [n8n Google Credentials](https://docs.n8n.io/integrations/builtin/credentials/google/)
