# Phase 1 : n8n-nodes-google-genai-core

## Informations

| Champ | Valeur |
|-------|--------|
| **Priorité** | 1 (Première) |
| **Complexité** | ⭐ Simple |
| **Durée estimée** | 3-4 jours |
| **Dépendances** | Aucune |
| **Bloque** | Phases 2, 3, 4, 5 |

---

## Objectif

Créer le package de base partagé contenant :
- Les credentials Vertex AI / Google AI Studio
- Le client wrapper pour les APIs Google GenAI
- Les utilitaires communs (GCS, polling, types)

Ce package sera une **dépendance** de tous les autres nodes.

---

## Documentation Obligatoire

> **AVANT DE COMMENCER** : Lire attentivement ces documents.

| Document | Chemin | Pourquoi |
|----------|--------|----------|
| Guide Custom Nodes | [`docs/n8n/CUSTOM_NODE_DEVELOPMENT.md`](../../n8n/CUSTOM_NODE_DEVELOPMENT.md) | Structure, installation, erreurs courantes |
| n8n Official Docs | [Creating Nodes](https://docs.n8n.io/integrations/creating-nodes/) | Documentation officielle |
| Google GenAI SDK | [PyPI](https://pypi.org/project/google-genai/) | Référence pour l'API (Python, adapter en TS) |

---

## Livrables

### 1. Structure du package

```
custom-nodes/n8n-nodes-google-genai-core/
├── package.json
├── tsconfig.json
├── index.ts                         # Exports publics
├── credentials/
│   ├── GoogleVertexAiApi.credentials.ts
│   └── GoogleAiStudioApi.credentials.ts
├── shared/
│   ├── GenAiClient.ts               # Client wrapper
│   ├── GcsUploader.ts               # Upload vers GCS
│   ├── PollingHelper.ts             # Gestion polling async
│   ├── ErrorHandler.ts              # Gestion erreurs user-friendly
│   └── types.ts                     # Types partagés
└── README.md
```

### 2. Credentials

#### GoogleVertexAiApi.credentials.ts

```typescript
// Champs requis :
// - projectId: string (VERTEX_PROJECT_ID)
// - location: string (VERTEX_LOCATION, default: us-central1)
// - serviceAccountKey: string (JSON ou chemin vers fichier)

// Méthode d'authentification : Service Account
```

#### GoogleAiStudioApi.credentials.ts (Alternative)

```typescript
// Champs requis :
// - apiKey: string (GEMINI_API_KEY)

// Méthode d'authentification : API Key
```

### 3. GenAiClient

```typescript
// Fonctionnalités :
// - Initialisation avec credentials (Vertex AI ou AI Studio)
// - Appels text generation (Gemini)
// - Appels image generation (Gemini Flash Image)
// - Appels video generation (Veo 3) - structure préparée
// - Gestion des retries avec exponential backoff
// - Timeout configurable
```

### 4. GcsUploader

```typescript
// Fonctionnalités :
// - Upload de fichiers binaires vers GCS
// - Génération d'URLs signées (durée: 24h)
// - Organisation par user_id: gs://bucket/{user_id}/...
// - Support des formats: MP4, PNG, WEBP, JSON
```

### 5. PollingHelper

```typescript
// Fonctionnalités :
// - Polling d'opérations long-running (Veo 3)
// - Intervalle configurable (default: 5s)
// - Timeout maximum (default: 5min)
// - Callback de progression (pour streaming)
```

### 6. Types partagés

```typescript
// Types à définir :
interface GenAiConfig {
  projectId?: string;
  location?: string;
  apiKey?: string;
}

interface GcsUploadResult {
  bucket: string;
  path: string;
  signedUrl: string;
  expiresAt: Date;
}

interface PollingOptions {
  intervalMs: number;
  timeoutMs: number;
  onProgress?: (status: string, progress?: number) => void;
}

interface GenAiError {
  code: string;
  message: string;
  isRecoverable: boolean;
}
```

---

## Critères d'Acceptation

### Fonctionnels

- [ ] Les credentials Vertex AI peuvent être créés dans n8n
- [ ] Les credentials AI Studio peuvent être créés dans n8n
- [ ] Le client peut s'authentifier avec Vertex AI
- [ ] Le client peut s'authentifier avec AI Studio
- [ ] L'upload GCS fonctionne
- [ ] Les URLs signées sont générées correctement (24h)
- [ ] Le polling helper fonctionne (test avec mock)

### Techniques

- [ ] Le package compile sans erreur (`npm run build`)
- [ ] Le package peut être importé par d'autres nodes
- [ ] Les types sont exportés correctement
- [ ] Tests unitaires pour chaque module (>80% coverage)

### Documentation

- [ ] README.md complet avec exemples d'utilisation
- [ ] Mise à jour de `docs/n8n/CUSTOM_NODE_DEVELOPMENT.md` si nouveaux problèmes rencontrés

---

## Tests à Effectuer

### Tests Unitaires

```typescript
// GenAiClient
describe('GenAiClient', () => {
  it('should initialize with Vertex AI credentials');
  it('should initialize with AI Studio credentials');
  it('should throw error if no credentials');
  it('should retry on transient errors');
  it('should respect timeout');
});

// GcsUploader
describe('GcsUploader', () => {
  it('should upload binary file');
  it('should generate signed URL');
  it('should organize by user_id');
  it('should handle upload errors');
});

// PollingHelper
describe('PollingHelper', () => {
  it('should poll until done');
  it('should timeout after max duration');
  it('should call onProgress callback');
  it('should handle polling errors');
});
```

### Tests d'Intégration

- [ ] Connexion réelle à Vertex AI (staging)
- [ ] Upload réel vers GCS (staging)
- [ ] Vérification URL signée accessible

---

## Risques et Mitigation

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Credentials n8n différents de Google SDK | Moyen | Adapter le format, documenter |
| GCS permissions insuffisantes | Bloquant | Vérifier Service Account roles |
| Différences Vertex AI vs AI Studio | Moyen | Abstraire dans le client |

---

## Notes de Développement

### Points d'attention

1. **Credentials n8n** : Le format n8n est spécifique, voir les exemples existants dans `custom-nodes/n8n-nodes-gmail-dynamic/`

2. **Pas de node visible** : Ce package ne crée PAS de node visible dans l'UI, seulement des credentials et des utilitaires

3. **Export des modules** : S'assurer que tous les modules sont exportés dans `index.ts` pour être utilisables par les autres packages

### Commandes utiles

```bash
# Initialiser le package
cd custom-nodes
mkdir n8n-nodes-google-genai-core
cd n8n-nodes-google-genai-core
npm init -y

# Installer les dépendances
npm install @google-cloud/storage @google-cloud/aiplatform
npm install -D typescript @types/node

# Build
npm run build
```

---

## Validation Finale

Avant de passer à la Phase 2, vérifier :

- [ ] Le package est installable comme dépendance
- [ ] Les credentials apparaissent dans n8n (Credentials > Add)
- [ ] Un test d'authentification Vertex AI réussit
- [ ] Un test d'upload GCS réussit
- [ ] La documentation est à jour

---

## Liens

- **Issue suivante** : [Phase 2 - Knowledge Graph](./PHASE-2-KNOWLEDGE-GRAPH.md)
- **Synthèse projet** : [`docs/gemini/SYNTHESE_MULTIMODALE_GEMINIV3.md`](../../gemini/SYNTHESE_MULTIMODALE_GEMINIV3.md)
