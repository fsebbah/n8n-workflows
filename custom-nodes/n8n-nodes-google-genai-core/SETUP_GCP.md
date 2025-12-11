# Configuration Google Cloud Platform pour n8n-nodes-google-genai-core

Ce guide explique comment configurer GCP pour utiliser les nodes Google GenAI dans n8n.

## Prérequis

- Un compte Google Cloud
- gcloud CLI installé et configuré
- Droits Owner ou Editor sur le projet GCP

---

## 1. Configuration initiale (nouveau projet)

### 1.1 Créer le projet GCP

```bash
# Créer un nouveau projet
gcloud projects create n8n-genai-480909 --name="n8n GenAI"

# Définir le projet par défaut
gcloud config set project n8n-genai-480909
```

### 1.2 Activer les APIs requises

```bash
gcloud services enable \
  aiplatform.googleapis.com \
  storage.googleapis.com \
  iamcredentials.googleapis.com \
  --project=n8n-genai-480909
```

| API | Usage |
|-----|-------|
| `aiplatform.googleapis.com` | Vertex AI (Gemini, Veo) |
| `storage.googleapis.com` | Google Cloud Storage |
| `iamcredentials.googleapis.com` | Impersonation pour URLs signées |

### 1.3 Créer le bucket GCS

```bash
gcloud storage buckets create gs://n8n-genai-480909-media \
  --location=europe-west1 \
  --uniform-bucket-level-access \
  --project=n8n-genai-480909
```

### 1.4 Créer le Service Account

```bash
# Créer le service account
gcloud iam service-accounts create n8n-genai-sa \
  --display-name="n8n GenAI Service Account" \
  --project=n8n-genai-480909
```

### 1.5 Configurer les permissions

```bash
PROJECT_ID="n8n-genai-480909"
SA_EMAIL="n8n-genai-sa@${PROJECT_ID}.iam.gserviceaccount.com"

# Permission Vertex AI
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user"

# Permission Storage
gcloud storage buckets add-iam-policy-binding gs://n8n-genai-480909-media \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin"
```

### 1.6 Configurer l'impersonation (pour ADC)

Si vous utilisez ADC (Application Default Credentials) au lieu d'une clé JSON :

```bash
# Remplacer par votre email Google
USER_EMAIL="votre-email@example.com"
SA_EMAIL="n8n-genai-sa@n8n-genai-480909.iam.gserviceaccount.com"

# Permettre à votre compte d'impersonner le SA
gcloud iam service-accounts add-iam-policy-binding ${SA_EMAIL} \
  --member="user:${USER_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project=n8n-genai-480909
```

---

## 2. Configuration de l'authentification

### Option A : ADC (Application Default Credentials) - Recommandé pour dev

```bash
# Se connecter avec votre compte Google
gcloud auth login

# Configurer les credentials par défaut pour les applications
gcloud auth application-default login
```

Avantages :
- Pas de fichier de clé à gérer
- Plus sécurisé (pas de secrets)
- Fonctionne automatiquement

### Option B : Service Account Key (JSON) - Pour production sans ADC

```bash
# Générer une clé JSON (si l'organisation le permet)
gcloud iam service-accounts keys create ~/n8n-genai-sa-key.json \
  --iam-account="n8n-genai-sa@n8n-genai-480909.iam.gserviceaccount.com"
```

> **Note** : Certaines organisations désactivent la création de clés. Dans ce cas, utilisez ADC.

---

## 3. Configuration dans n8n

### 3.1 Installer le package

```bash
# Copier le package
cp -r custom-nodes/n8n-nodes-google-genai-core ~/.n8n/nodes/

# Ajouter la dépendance
cd ~/.n8n/nodes
# Éditer package.json pour ajouter :
# "n8n-nodes-google-genai-core": "file:./n8n-nodes-google-genai-core"

# Installer
npm install

# Redémarrer n8n
```

### 3.2 Créer les credentials dans n8n

1. Aller dans **Settings > Credentials > Add Credential**
2. Chercher "Google Vertex AI API"
3. Remplir :
   - **Project ID** : `n8n-genai-480909`
   - **Location** : `europe-west1`
   - **Authentication Method** : `Application Default Credentials (ADC)`
   - **GCS Bucket Name** : `n8n-genai-480909-media`

---

## 4. Vérification

### 4.1 Tester l'authentification

```bash
cd custom-nodes/n8n-nodes-google-genai-core
npx ts-node test-client.ts
```

Résultat attendu :
```
GenAiClient: ✓ OK
GcsUploader: ✓ OK
```

### 4.2 Vérifier dans les logs n8n

Au démarrage de n8n, vous devriez voir :
```
Loaded all credentials and nodes from n8n-nodes-google-genai-core { "credentials": 2, "nodes": 0 }
```

---

## 5. Déploiement sur un autre serveur

### 5.1 Prérequis serveur

- Node.js 18+
- n8n installé
- gcloud CLI installé

### 5.2 Configuration rapide

```bash
# 1. Se connecter à GCP
gcloud auth login
gcloud auth application-default login
gcloud config set project n8n-genai-480909

# 2. Vérifier les permissions
gcloud projects get-iam-policy n8n-genai-480909 --format="table(bindings.role,bindings.members)" | grep -i "votre-email"

# 3. Installer le package n8n
cp -r custom-nodes/n8n-nodes-google-genai-core ~/.n8n/nodes/
cd ~/.n8n/nodes && npm install

# 4. Redémarrer n8n
```

### 5.3 Variables d'environnement (optionnel)

Si vous ne pouvez pas utiliser `gcloud auth`, définissez :

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
```

---

## 6. Dépannage

### Erreur : "Cannot sign data without client_email"

**Cause** : ADC ne peut pas signer les URLs sans impersonation.

**Solution** : Configurer l'impersonation (voir section 1.6).

### Erreur : "IAM Service Account Credentials API has not been used"

**Solution** :
```bash
gcloud services enable iamcredentials.googleapis.com --project=n8n-genai-480909
```

### Erreur : "The specified bucket does not exist"

**Solution** : Créer le bucket (voir section 1.3).

### Erreur : "Permission denied"

**Solutions** :
1. Vérifier que les APIs sont activées
2. Vérifier les rôles IAM du service account
3. Vérifier l'impersonation si vous utilisez ADC

---

## 7. Résumé des ressources GCP

| Ressource | Valeur |
|-----------|--------|
| Project ID | `n8n-genai-480909` |
| Region | `europe-west1` |
| Bucket GCS | `n8n-genai-480909-media` |
| Service Account | `n8n-genai-sa@n8n-genai-480909.iam.gserviceaccount.com` |

## 8. Commandes utiles

```bash
# Lister les APIs activées
gcloud services list --enabled --project=n8n-genai-480909

# Vérifier les permissions du SA
gcloud projects get-iam-policy n8n-genai-480909 \
  --flatten="bindings[].members" \
  --filter="bindings.members:n8n-genai-sa"

# Lister les buckets
gcloud storage buckets list --project=n8n-genai-480909

# Tester l'authentification
gcloud auth application-default print-access-token
```
