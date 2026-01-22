# RFC-016: Architecture de Traitement de Documents

**Status:** Draft
**Date:** 2026-01-22
**Authors:** Équipe n8n + Plugin Torah
**Target Teams:** chatbot-core, n8n-workflows, torah-api
**Depends on:** RFC-017 (Job Lifecycle & Credits)

---

## Résumé

Architecture unifiée pour le traitement de documents (PDF, images, texte) avec :
- **LLM-Intention** comme point d'entrée conversationnel unique
- **Plugin** gérant la mémoire et l'affichage
- **n8n** restant stateless et exécutant les actions
- **Proposition d'actions** avec validation utilisateur avant exécution

---

## Problème

### Situation actuelle

```
┌─────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE FRAGMENTÉE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  User ──→ /translate-page     (traduction page)                 │
│  User ──→ /translate-document (traduction document)             │
│  User ──→ /summarize          (résumé)                          │
│  User ──→ /ocr                (extraction texte)                │
│  User ──→ /ask                (question LLM)                    │
│                                                                  │
│  ❌ Pas de mémoire conversationnelle                            │
│  ❌ Utilisateur doit connaître la bonne commande                │
│  ❌ Pas de confirmation avant action coûteuse                   │
│  ❌ Logique dupliquée entre commandes                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Problèmes identifiés

| Problème | Impact |
|----------|--------|
| **Commandes multiples** | UX confuse, utilisateur perdu |
| **Pas de contexte** | Chaque commande est isolée |
| **Actions immédiates** | Pas de confirmation, erreurs coûteuses |
| **Pas d'estimation** | Utilisateur ne connaît pas le coût avant |

---

## Solution : Architecture Conversationnelle

### Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                         PLUGIN (chatbot-core)                    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Mémoire conversationnelle (par user/channel)           │    │
│  │  - Historique des messages                               │    │
│  │  - Contexte de session                                   │    │
│  │  - Fichiers attachés                                     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  À chaque message user:                                  │    │
│  │  POST /webhook/mcp-llm-intention                        │    │
│  │  body: { query, history[], context, user }              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      n8n: MCP-LLM-Intention                      │
│                         (STATELESS)                              │
│                                                                  │
│  Input:                                                          │
│  {                                                               │
│    "query": "Je veux traduire ce PDF",                          │
│    "history": [...],                                             │
│    "context": { "attached_file": { "type": "pdf", ... } },      │
│    "user": { "id": "123", "channel_id": "456" }                 │
│  }                                                               │
│                                                                  │
│  Output:                                                         │
│  {                                                               │
│    "response_type": "action_proposal",                          │
│    "message": "Voulez-vous traduire ce PDF de 15 pages ?",      │
│    "proposed_actions": [                                         │
│      {                                                           │
│        "id": "translate",                                        │
│        "label": "🌐 Traduire en français",                       │
│        "webhook": "document-translate-worker",                   │
│        "params": { ... },                                        │
│        "estimate": { "pages": 15, "cost": "~0.05€" }            │
│      }                                                           │
│    ]                                                             │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      PLUGIN: Affichage                           │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  📄 Voulez-vous traduire ce PDF de 15 pages ?            │    │
│  │                                                           │    │
│  │  Estimation: ~0.05€ | ~2 minutes                         │    │
│  │                                                           │    │
│  │  [🌐 Traduire] [📝 Résumer] [❌ Annuler]                  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (user clique "Traduire")
┌─────────────────────────────────────────────────────────────────┐
│                      PLUGIN: Exécution                           │
│                                                                  │
│  1. POST /api/v2/jobs (créer le job)                            │
│  2. POST /webhook/document-translate-worker (lancer)            │
│  3. Polling GET /api/v2/jobs/{job_id} (progress)                │
│  4. Afficher LoadingView avec progression                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Contrats d'API

### 1. MCP-LLM-Intention (Point d'entrée)

**Endpoint:** `POST /webhook/mcp-llm-intention`

#### Request

```json
{
  "query": "Je veux traduire ce document en français",
  "history": [
    { "role": "user", "content": "Bonjour" },
    { "role": "assistant", "content": "Bonjour ! Comment puis-je vous aider ?" }
  ],
  "context": {
    "type": "torah",
    "auto_web_search": false,
    "attached_file": {
      "type": "pdf",
      "name": "talmud-page.pdf",
      "size": 1048576,
      "url": "https://cdn.discord.com/attachments/.../talmud-page.pdf",
      "pages_count": 15
    }
  },
  "user": {
    "id": "123456789",
    "channel_id": "987654321",
    "guild_id": "111222333"
  },
  "plugin_context": {
    "llm_model": "claude-3-haiku-20240307"
  }
}
```

#### Response - Message simple

```json
{
  "success": true,
  "response_type": "message",
  "message": "Je vois que vous avez joint un PDF. Souhaitez-vous le traduire ou en faire un résumé ?",
  "proposed_actions": [],
  "requires_confirmation": false
}
```

#### Response - Proposition d'actions

```json
{
  "success": true,
  "response_type": "action_proposal",
  "message": "J'ai analysé votre PDF (15 pages). Que souhaitez-vous faire ?",
  "proposed_actions": [
    {
      "id": "translate",
      "label": "🌐 Traduire en français",
      "description": "Traduction complète du document",
      "webhook": "document-translate-worker",
      "params": {
        "job_type": "document_translation",
        "document": {
          "type": "pdf",
          "url": "https://...",
          "pages_count": 15
        },
        "source_language": "he",
        "target_language": "fr"
      },
      "estimate": {
        "pages": 15,
        "tokens_estimated": 45000,
        "cost_estimated_eur": 0.05,
        "time_estimated_seconds": 120
      }
    },
    {
      "id": "summarize",
      "label": "📝 Résumer",
      "description": "Créer un résumé du document",
      "webhook": "document-summarize-worker",
      "params": {
        "job_type": "document_summary",
        "document": { "type": "pdf", "url": "https://..." }
      },
      "estimate": {
        "tokens_estimated": 5000,
        "cost_estimated_eur": 0.01
      }
    }
  ],
  "requires_confirmation": true
}
```

---

### 2. Document-Translate-Worker

**Endpoint:** `POST /webhook/document-translate-worker`

Workflow intelligent qui route selon le type de document.

#### Request

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "job_type": "document_translation",
  "document": {
    "type": "pdf",
    "url": "https://cdn.discord.com/attachments/.../document.pdf",
    "pages_count": 15
  },
  "source_language": "he",
  "target_language": "fr",
  "api_key": "sk-ant-...",
  "openai_api_key": "sk-...",
  "callback": {
    "discord_channel_id": "987654321",
    "discord_token": "Bot xxx"
  }
}
```

#### Routing interne

```
                    ┌─────────────────┐
                    │  Document Type  │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
    ┌─────────┐        ┌─────────┐        ┌─────────┐
    │   PDF   │        │  Image  │        │  Text   │
    └────┬────┘        └────┬────┘        └────┬────┘
         │                  │                  │
         ▼                  ▼                  │
┌─────────────────┐ ┌─────────────────┐        │
│ PDF Extractor   │ │  Image OCR      │        │
│ (Mistral/PDF)   │ │  (Mistral)      │        │
└────────┬────────┘ └────────┬────────┘        │
         │                   │                  │
         └───────────────────┴──────────────────┘
                             │
                             ▼
                 ┌─────────────────────┐
                 │ Torah-Translate     │
                 │ Worker (segments)   │
                 └─────────────────────┘
```

#### Response immédiate

```json
{
  "received": true,
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "steps": ["extracting", "translating"],
  "message": "Traitement démarré"
}
```

---

### 3. Documents Estimate

**Endpoint:** `POST /webhook/documents/estimate`

#### Request

```json
{
  "document": {
    "type": "pdf",
    "url": "https://...",
    "pages_count": 15
  },
  "operation": "translate",
  "source_language": "he",
  "target_language": "fr"
}
```

#### Response

```json
{
  "success": true,
  "estimate": {
    "pages": 15,
    "segments_estimated": 45,
    "tokens": {
      "input_estimated": 30000,
      "output_estimated": 15000,
      "total_estimated": 45000
    },
    "cost": {
      "claude_usd": 0.035,
      "gpt_usd": 0.015,
      "total_usd": 0.05,
      "total_eur": 0.046
    },
    "time_seconds": 120,
    "pivot_required": true
  }
}
```

---

## Types de documents supportés

| Type | Extension | Extraction | Worker |
|------|-----------|------------|--------|
| PDF | `.pdf` | `pdf-extractor` (Mistral) | `document-translate-worker` |
| Image | `.png`, `.jpg`, `.jpeg` | `image-ocr` (Mistral) | `document-translate-worker` |
| Text | `.txt`, `.md` | Passthrough | `document-translate-worker` |
| Torah Pages | structured JSON | Passthrough | `torah-translate-worker` |

---

## Flux détaillé : Traduction de PDF

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           FLUX COMPLET                                    │
└──────────────────────────────────────────────────────────────────────────┘

1. USER: Envoie PDF + "traduis ça"
   │
   ▼
2. PLUGIN: Stocke le fichier, construit le contexte
   │
   ▼
3. PLUGIN → n8n: POST /webhook/mcp-llm-intention
   │         { query: "traduis ça", context: { attached_file: {...} } }
   │
   ▼
4. n8n: LLM analyse l'intention
   │     → Détecte: PDF + demande traduction
   │     → Appelle /webhook/documents/estimate
   │
   ▼
5. n8n → PLUGIN: Response avec proposed_actions
   │
   ▼
6. PLUGIN: Affiche embed Discord avec boutons
   │        [🌐 Traduire] [📝 Résumer] [❌ Annuler]
   │
   ▼
7. USER: Clique "Traduire"
   │
   ▼
8. PLUGIN:
   │  a) POST /api/v2/jobs → Crée job (status: pending)
   │  b) POST /webhook/document-translate-worker → Lance traitement
   │  c) Démarre LoadingView avec polling
   │
   ▼
9. n8n: Document-Translate-Worker
   │  a) PATCH /api/v2/jobs/{id} → status: processing
   │  b) Détecte type PDF → POST /webhook/pdf-extractor
   │  c) Reçoit segments extraits
   │  d) Pour chaque segment:
   │     - CHECK status (voir RFC-017)
   │     - Si cancelled → exit avec crédits consommés
   │     - Sinon → traduire + PATCH progress
   │  e) PATCH /api/v2/jobs/{id} → status: completed
   │
   ▼
10. PLUGIN: Polling détecte completed
    │  → Affiche résultat
    │  → Propose téléchargement
    │
    ▼
11. FIN
```

---

## Webhooks du système

| Webhook | Rôle | Statut |
|---------|------|--------|
| `POST /webhook/mcp-llm-intention` | Point d'entrée conversationnel | ✅ Existe |
| `POST /webhook/documents/estimate` | Estimation coût/temps | ✅ Existe |
| `POST /webhook/document-translate-worker` | Orchestration traduction | ✅ Créé |
| `POST /webhook/pdf-extractor` | Extraction texte PDF | ✅ Existe |
| `POST /webhook/image-ocr` | OCR images (Mistral) | ✅ Existe |
| `POST /webhook/torah-translate-worker` | Traduction segments | ✅ Existe |
| `POST /webhook/document-cancel` | Annulation job | 📋 RFC-017 |

---

## Répartition des responsabilités

| Composant | Responsabilités |
|-----------|-----------------|
| **Plugin (chatbot-core)** | Mémoire conversationnelle, historique, UI Discord, boutons, polling, affichage progression |
| **MCP-LLM-Intention (n8n)** | Analyse intention, proposition actions, estimation, reste STATELESS |
| **Document-Translate-Worker (n8n)** | Routing par type, extraction, orchestration traduction |
| **Torah-Translate-Worker (n8n)** | Traduction segment par segment, vérification, sauvegarde |
| **API Torah** | Jobs CRUD, stockage traductions, crédits utilisateur |

---

## Configuration requise

### Variables d'environnement (ecosystem.config.js)

```javascript
{
  // API
  API_URL: 'http://pi6.local:3031',
  API_KEY: '...',

  // Discord (pour callbacks)
  DISCORD_API_URL: 'https://discord.com/api/v10',
  DISCORD_URL_CHANNEL: 'https://discord.com/api/v10/channels/',
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || '',

  // LLM
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY || ''
}
```

---

## Limites et contraintes

| Contrainte | Valeur | Raison |
|------------|--------|--------|
| Historique max | 10 messages | Limite tokens LLM |
| Taille fichier max | 25 MB | Limite Discord |
| Pages PDF max | 100 | Temps de traitement |
| Timeout job | 10 min | Limite n8n |
| Polling interval | 2s | Balance UX/charge |

---

## Questions ouvertes

1. **Format boutons Discord** : Buttons vs Select Menu pour les actions ?
2. **Multi-fichiers** : Supporter plusieurs fichiers dans une conversation ?
3. **Reprise sur erreur** : Comment gérer les jobs partiellement complétés ?
4. **Cache estimations** : Mettre en cache les estimations pour éviter recalcul ?

---

## Réponse équipe API (chatbot.api)

**Date:** 2026-01-22
**Reviewer:** Équipe API

### ✅ Ce qui est cohérent avec l'implémentation actuelle

| Point RFC | Implémentation | Status |
|-----------|----------------|--------|
| `POST /api/v2/jobs` | Créer un job | ✅ Existe |
| `GET /api/v2/jobs/{job_id}` | Récupérer un job | ✅ Existe |
| `GET /api/v2/jobs` | Lister les jobs (filtres) | ✅ Existe |
| `PATCH /api/v2/jobs/{job_id}` | Mettre à jour status/output | ✅ Existe |
| `DELETE /api/v2/jobs/{job_id}` | Annuler job pending | ✅ Existe |

### ⚠️ Problèmes identifiés

#### 1. Deux systèmes de jobs en parallèle

```
Situation actuelle:
├── MongoDB /api/v2/jobs     → Jobs Torah + MCP (chatbot.api)
└── Redis document:job:*     → Jobs Documents (chatbot-core)

❌ INCOHÉRENCE : Quel système est autoritaire ?
```

**Impact** :
- Confusion sur où créer/suivre les jobs
- Duplication de logique (TTL, cleanup, stats)
- API admin document-jobs lit Redis, pas MongoDB

**Question à trancher** : Migrer les jobs documents vers MongoDB (`/api/v2/jobs`) ou garder Redis ?

---

#### 2. Flux de création de job risqué

```
Step 8 du RFC:
  a) POST /api/v2/jobs → Crée job (pending)
  b) POST /webhook/worker → Lance traitement

❌ Si (b) échoue → job orphelin en "pending" dans MongoDB
```

**Suggestions** :
1. Le worker crée le job (pas le plugin)
2. Ou transaction compensatoire : si (b) échoue, supprimer le job
3. Ou job créé avec status "initializing", worker passe à "pending"

---

#### 3. Polling inefficace

```
RFC: "Polling GET /api/v2/jobs/{job_id}" toutes les 2s
Job de 10 min = 300 requêtes par job
× 10 jobs concurrents = 3000 requêtes

❌ Charge API significative
```

**Suggestion** : Implémenter Server-Sent Events (SSE) :
```
GET /api/v2/jobs/{job_id}/stream
Content-Type: text/event-stream

event: progress
data: {"status": "processing", "progress": {"current": 5, "total": 15}}

event: completed
data: {"status": "completed", "output": {...}}
```

**Priorité** : Moyenne (optimisation)

---

#### 4. Pas de champ `progress` dédié

Le modèle actuel :
```python
class JobUpdateRequest:
    status: str | None
    output: dict | None  # ← Tout va dans output
    error: dict | None
```

**Suggestion** : Ajouter un champ `progress` structuré :
```python
progress: {
    "current": 5,
    "total": 15,
    "percentage": 33,
    "current_step": "Traduction page 5/15"
}
```

**Impact** : Permet un affichage cohérent de la progression côté plugin.

---

#### 5. Gestion des crédits absente

RFC dit : "API Torah gère crédits utilisateur" mais **aucun endpoint défini**.

**Questions** :
- Qui débite les crédits au démarrage ?
- Qui rembourse sur annulation ?
- L'endpoint `/api/admin/document-jobs/cleanup` retourne `refund_details` mais qui le consomme ?

**Suggestion** : Définir si l'API doit exposer :
```
GET  /api/credits/{user_id}           → Solde
POST /api/credits/{user_id}/debit     → Débit
POST /api/credits/{user_id}/refund    → Remboursement
```

Ou si c'est géré ailleurs (PostgreSQL autre API ?).

---

#### 6. Pas de déduplication / idempotency

```
User clique 2× rapidement sur "Traduire"
→ 2 jobs créés pour le même document
→ Double facturation potentielle
```

**Suggestion** : Ajouter support `idempotency_key` :
```json
POST /api/v2/jobs
{
  "idempotency_key": "user-123-file-abc-translate-1706000000",
  ...
}
```

Si clé existe et job < 5 min → retourner le job existant.

---

#### 7. Erreurs partielles non gérées

```
Scénario:
- Job: Traduire 15 pages
- Pages 1-5 ✅ Traduites
- Page 6 ❌ Erreur LLM
- Pages 7-15 ❓ Non traitées

Questions:
- Status final ? "failed" ou "partial_failure" ?
- Crédits consommés : 5 pages ou 0 ?
```

**Suggestion** :
- Ajouter status `partial_failure`
- Tracker `segments_completed` vs `segments_total` dans output
- Définir politique de remboursement (prorata ou tout-ou-rien)

---

### 📋 Résumé des actions API

| Action | Priorité | Complexité | Status |
|--------|----------|------------|--------|
| Clarifier MongoDB vs Redis pour jobs documents | 🔴 Haute | Décision | ❓ À discuter |
| Ajouter champ `progress` au modèle Job | 🟡 Moyenne | Faible | 📋 À faire |
| Implémenter SSE `/jobs/{id}/stream` | 🟡 Moyenne | Moyenne | 📋 À planifier |
| Ajouter `idempotency_key` | 🟡 Moyenne | Faible | 📋 À faire |
| Définir endpoints crédits (ou déléguer) | 🔴 Haute | Décision | ❓ À discuter |
| Gérer status `partial_failure` | 🟢 Basse | Moyenne | 📋 Backlog |

---

### Question clé : MongoDB ou Redis ?

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| **MongoDB uniquement** (`/api/v2/jobs`) | Historique permanent, requêtes complexes, stats, un seul système | chatbot-core doit appeler API HTTP |
| **Redis uniquement** (chatbot-core) | Ultra-rapide, local au plugin, TTL auto | Pas d'historique, pas de stats complexes |
| **Hybride** (actuel) | Chaque système optimisé pour son cas | Complexité, 2 sources de vérité, sync à maintenir |

**Recommandation équipe API** : Migrer vers MongoDB uniquement pour simplifier l'architecture. Le surcoût HTTP est négligeable vs la complexité de maintenir deux systèmes.

---

## Questions pour l'équipe n8n

**Date:** 2026-01-22
**De:** Équipe chatbot-core

Suite à l'implémentation du `DocumentTranslationClient` (v0.6.56), nous avons identifié des écarts avec le RFC-016. Merci de clarifier les points suivants :

### Question 1 : Endpoints de polling

```
RFC-016 préconise : GET /api/v2/jobs/{job_id}
Notre implémentation : GET /webhook/torah-job-status?job_id=...
```

**Questions :**
- Ces deux endpoints existent-ils en parallèle ?
- Retournent-ils les mêmes informations (status, progress, output) ?
- Lequel est autoritaire pour le statut des jobs ?

---

### Question 2 : Création de job préalable

```
RFC-016 Step 8:
  a) POST /api/v2/jobs → Crée job (status: pending)
  b) POST /webhook/document-translate-worker → Lance traitement
```

**Questions :**
- Le worker `/document-translate-worker` nécessite-t-il un `job_id` pré-existant ?
- Ou crée-t-il automatiquement le job s'il n'existe pas ?
- Si on passe un `job_id` inexistant, que se passe-t-il ?

---

### Question 3 : Estimation des coûts

```
RFC-016 mentionne : POST /webhook/documents/estimate
```

**Questions :**
- Cet endpoint est-il implémenté et opérationnel ?
- Quel format de réponse exact ?
- Est-il appelé automatiquement par `mcp-llm-intention` ou doit-on l'appeler explicitement ?

---

### Question 4 : Annulation de job

```
RFC-016 mentionne : POST /webhook/document-cancel (📋 RFC-017)
```

**Questions :**
- Cet endpoint existe-t-il déjà ?
- Comment le worker gère-t-il l'annulation mid-process ?
- Les segments déjà traduits sont-ils sauvegardés ou perdus ?

---

### Question 5 : Cohérence des réponses

Notre implémentation attend ce format du worker :

```json
{
  "success": true,
  "job_id": "doc_m5x8k2...",
  "status": "accepted",
  "total_pages": 35
}
```

Et ce format du polling :

```json
{
  "status": "processing",
  "progress": {
    "current": 12,
    "total": 35,
    "percentage": 34
  }
}
```

**Questions :**
- Ces formats sont-ils corrects ?
- Y a-t-il des champs additionnels à prendre en compte ?
- Le résultat final (texte traduit, URL fichier) est-il dans la réponse du polling ou dans un endpoint séparé ?

---

### Résumé des clarifications demandées

| # | Question | Impact chatbot-core |
|---|----------|---------------------|
| 1 | Endpoint polling | Modifier `get_job_status()` si nécessaire |
| 2 | Création job préalable | Ajouter `create_job()` ou pas |
| 3 | Estimation | Implémenter `estimate_cost()` |
| 4 | Annulation | Implémenter `cancel_job()` |
| 5 | Format réponses | Adapter les dataclasses |

---

## Réponse équipe n8n

**Date:** _(à compléter)_
**Reviewer:** Équipe n8n

_(Réponses à compléter par l'équipe n8n)_

### Réponse Q1 : Endpoints de polling

```
TODO: Clarifier la relation entre /api/v2/jobs/{id} et /webhook/torah-job-status
```

### Réponse Q2 : Création de job préalable

```
TODO: Expliquer si le worker crée le job ou attend un job_id existant
```

### Réponse Q3 : Estimation des coûts

```
TODO: Confirmer que /webhook/documents/estimate est opérationnel et son format
```

### Réponse Q4 : Annulation de job

```
TODO: Statut de l'implémentation et comportement
```

### Réponse Q5 : Format des réponses

```
TODO: Valider les formats JSON attendus
```

---

## Réponse équipe chatbot-core

**Date:** 2026-01-22
**Reviewer:** Équipe chatbot-core

### Analyse de l'implémentation actuelle

#### Ce qui a été livré (v0.6.56)

| Composant | Description | Fichier |
|-----------|-------------|---------|
| `DocumentTranslationClient` | Client pour appel direct au worker | `services/n8n/document_translation.py` |
| `TranslationJobStatus` | Dataclass statut job | idem |
| `DocumentTranslationResult` | Dataclass résultat | idem |
| Tests unitaires | 100% coverage des méthodes | `tests/services/test_document_translation.py` |
| Guide plugin | Documentation complète | `docs/guides/GUIDE-DOCUMENT-TRANSLATION-CLIENT.md` |

#### Écarts avec RFC-016

| Aspect | RFC-016 | Implémentation actuelle | Écart |
|--------|---------|------------------------|-------|
| Point d'entrée | `MCP-LLM-Intention` | Appel direct worker | ⚠️ Bypass flux conversationnel |
| Création job | `POST /api/v2/jobs` avant worker | Pas de création explicite | ❌ Manquant |
| Polling | `GET /api/v2/jobs/{id}` | `GET /webhook/torah-job-status` | ⚠️ Endpoint différent |
| Estimation | `/webhook/documents/estimate` | Non implémenté | ❌ Manquant |
| Annulation | `/webhook/document-cancel` | Non implémenté | ❌ Manquant |

---

### Position chatbot-core

#### Option retenue : Client hybride (deux niveaux)

Nous proposons de maintenir **deux niveaux d'abstraction** :

```
┌─────────────────────────────────────────────────────────────────┐
│  NIVEAU 1 : DocumentWorkflowService (RFC-016 compliant)          │
│  ─────────────────────────────────────────────────────────────── │
│  Pour : Flux conversationnel complet avec MCP-LLM-Intention      │
│                                                                  │
│  - Passe par mcp-llm-intention                                   │
│  - Crée job via /api/v2/jobs                                     │
│  - Polling via /api/v2/jobs/{id}                                 │
│  - Supporte estimation, annulation                               │
│  - Intégré avec DocumentMentionHandler existant                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ utilise en interne
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  NIVEAU 2 : DocumentTranslationClient (Low-level, actuel)        │
│  ─────────────────────────────────────────────────────────────── │
│  Pour : Commandes slash directes, cas simples                    │
│                                                                  │
│  - Appel direct au worker                                        │
│  - Polling via /webhook/torah-job-status                         │
│  - Pas de création job explicite                                 │
│  - Simple et rapide                                              │
└─────────────────────────────────────────────────────────────────┘
```

#### Justification

| Cas d'usage | Client recommandé | Raison |
|-------------|-------------------|--------|
| Mention @Bot avec fichier | `DocumentWorkflowService` | Flux conversationnel, proposition d'actions |
| Commande `/traduire` directe | `DocumentTranslationClient` | User sait déjà ce qu'il veut |
| Intégration API externe | `DocumentTranslationClient` | Simplicité, pas de UI |

---

### Actions planifiées chatbot-core

#### Phase 1 : Adaptations immédiates (selon réponses n8n)

| Action | Condition | Priorité |
|--------|-----------|----------|
| Modifier endpoint polling | Si `/api/v2/jobs/{id}` est préféré | Haute |
| Ajouter `estimate_cost()` | Si `/documents/estimate` existe | Haute |
| Ajouter `cancel_job()` | Si `/document-cancel` existe | Moyenne |

#### Phase 2 : Nouveau service (si validé)

| Action | Description | Priorité |
|--------|-------------|----------|
| Créer `DocumentWorkflowService` | Service RFC-016 compliant | Moyenne |
| Intégrer avec `DocumentMentionHandler` | Utiliser le nouveau flux | Moyenne |
| Migrer jobs vers MongoDB | Si décision API confirmée | Basse |

---

### Questions en suspens pour décision d'équipe

1. **MongoDB vs Redis pour jobs**
   - L'équipe API recommande MongoDB uniquement
   - Impact : `DocumentJobStore` (Redis) devient obsolète ?
   - Qui tranche ?

2. **Deux niveaux de client**
   - Est-ce acceptable d'avoir `DocumentTranslationClient` (simple) + `DocumentWorkflowService` (complet) ?
   - Ou doit-on forcer le passage par le flux RFC-016 systématiquement ?

3. **Gestion des crédits**
   - Actuellement géré par `CreditsClient` (chatbot-core) via n8n
   - RFC-016 mentionne "API Torah gère crédits"
   - Qui est responsable du débit/remboursement ?

---

### Conclusion chatbot-core

L'implémentation actuelle (`DocumentTranslationClient` v0.6.56) est **fonctionnelle mais incomplète** par rapport au RFC-016.

**Recommandation** : Attendre les réponses de l'équipe n8n avant de modifier le client. Les adaptations seront mineures si les endpoints sont compatibles.

**Prochaine étape** : Réunion de synchronisation chatbot-core / n8n / API pour trancher :
- Endpoint de polling autoritaire
- Nécessité de création job préalable
- Responsabilité des crédits

---

## Questions plugin-torah

**Date:** 2026-01-22
**Reviewer:** Équipe plugin-torah

### Contexte

Les commandes existantes (`/traduire-page`, `/traduire`, `@mention`, `DocumentMentionHandler`) **coexistent** avec le nouveau flux conversationnel.

### Questions à clarifier

#### 1. `/api/v2/jobs` - Quel service ?

Le flux montre :
```
8. PLUGIN:
   a) POST /api/v2/jobs → Crée job
```

Actuellement le plugin utilise `DocumentJobStore` (Redis via chatbot-core) pour les jobs.

**Question :** `/api/v2/jobs` est géré par Torah-API ? n8n ? Quel est le contrat ?

---

#### 2. Polling - Incohérence d'endpoint

| RFC-016 | Plugin actuel |
|---------|---------------|
| `GET /api/v2/jobs/{job_id}` | `GET /webhook/torah-job-status?job_id={job_id}` |

**Question :** Quel endpoint utiliser ? Faut-il migrer le plugin ?

---

#### 3. Bouton Stop - `cancel_url` non implémenté

Le RFC mentionne `POST /webhook/document-cancel` (RFC-017).

**Situation actuelle :** Le bouton Stop arrête uniquement le polling côté client. Le job continue côté n8n.

**Action requise :**
- n8n : Confirmer que `/webhook/document-cancel` existe
- Plugin : Passer `cancel_url` au `PollingService`

---

#### 4. Extraction métadonnées fichier

```json
"attached_file": {
  "pages_count": 15,
  "size": 1048576
}
```

**Question :** Qui extrait `pages_count` ?
- Option A : Le plugin (avant appel n8n)
- Option B : n8n (via `/documents/estimate` ou autre)

---

#### 5. Affichage résultat traduction

```
10. PLUGIN: Affiche résultat, propose téléchargement
```

**Questions :**
- Format du résultat ? (`translated_text`, `translated_pages[]`, `file_url` ?)
- PDF traduit : Lien Backblaze direct ?
- Aperçu dans Discord (embed) ou téléchargement uniquement ?

---

#### 6. Flux crédits

Le RFC ne précise pas le cycle de vie des crédits côté plugin.

**Questions :**
- Quand vérifier ? Avant proposition ou avant exécution ?
- Quand débiter ? Progressivement ou après succès ?
- Remboursement si annulation en cours ?

---

#### 7. LoadingView vs ProgressView

Le RFC mentionne "LoadingView". Le plugin utilise `ProgressView` (chatbot-core).

**Question :** Même composant ou nouveau à créer ?

---

### Points bloquants avant implémentation

| # | Point | Dépend de | Priorité |
|---|-------|-----------|----------|
| 1 | Clarifier `/api/v2/jobs` | Équipe n8n / Torah-API | Haute |
| 2 | Harmoniser endpoint polling | Équipe n8n | Haute |
| 3 | Créer `/webhook/document-cancel` | Équipe n8n (RFC-017) | Haute |
| 4 | Définir qui extrait `pages_count` | Équipe n8n | Moyenne |
| 5 | Définir format résultat | Équipe n8n | Moyenne |
| 6 | Clarifier flux crédits | Équipe chatbot-core | Moyenne |

---

## Questions plugin-recipes (Bot Appetit)

**Date:** 2026-01-22
**Reviewer:** Équipe plugin-recipes

### Contexte

Plugin-recipes utilise actuellement `llm-intention` pour la détection d'intention lors des mentions `@Bot Appetit`. Le comportement actuel diffère du RFC-016 sur plusieurs points.

### Questions à clarifier

#### 1. Endpoint `llm-intention` vs `mcp-llm-intention`

| RFC-016 | Plugin-recipes actuel |
|---------|----------------------|
| `POST /webhook/mcp-llm-intention` | `POST /webhook/llm-intention` |

**Questions :**
- S'agit-il du même workflow ou de deux workflows distincts ?
- Si distincts, y a-t-il une migration prévue vers `mcp-llm-intention` ?
- Le préfixe `mcp-` implique-t-il une différence fonctionnelle ?

---

#### 2. Format de réponse incompatible

**RFC-016 préconise :**
```json
{
  "response_type": "action_proposal",
  "proposed_actions": [
    { "id": "web_search", "label": "🌐 Chercher", "webhook": "llm-web-search", "estimate": {...} }
  ]
}
```

**Plugin-recipes attend :**
```json
{
  "next_action": "propose_web_search",
  "message": "Pas de recette trouvée..."
}
```

**Questions :**
- Le workflow `llm-intention` va-t-il migrer vers le format `response_type` + `proposed_actions[]` ?
- Si oui, quel est le calendrier ? Le code `mentions.py:440-548` devra être réécrit.
- Peut-on avoir une période de transition avec les deux formats supportés ?

---

#### 3. Mémoire conversationnelle

Le RFC stipule :
> **Plugin** gérant la mémoire et l'affichage (historique des messages)

**Situation plugin-recipes :** Pas d'historique conversationnel implémenté. Chaque mention est isolée.

```python
# Payload actuel (mentions.py)
return {
    "query": context.content,
    # ❌ Pas de "history": [...]
}
```

**Questions :**
- Bot Appetit nécessite-t-il une mémoire conversationnelle ?
- Cas d'usage potentiel : "Donne-moi une recette de pâtes" → "Pour combien de personnes ?" → "5"
- Si oui, quelle est la priorité vs autres features ?

---

#### 4. Estimation des coûts avant recherche web

Le RFC montre un pattern avec estimation :
```json
"estimate": {
  "tokens_estimated": 5000,
  "cost_estimated_eur": 0.01
}
```

**Situation plugin-recipes :** La recherche web consomme des crédits sans estimation préalable affichée à l'utilisateur.

**Proposition :**
```
🔍 Pas de recette en base pour "tajine végétarien"

Recherche web estimée : ~1 crédit, ~10 secondes
[🌐 Chercher sur le web] [❌ Annuler]
```

**Questions :**
- Le workflow `llm-intention` peut-il fournir une estimation pour `propose_web_search` ?
- Ou doit-on appeler `/webhook/documents/estimate` séparément ?

---

#### 5. Flag `auto_web_search` - Confirmation

Nous avons ajouté `auto_web_search: false` dans le payload (cf. ligne 150 du RFC).

```python
# mentions.py - Ajouté aujourd'hui
"context": {
    "type": "recipe",
    "auto_web_search": False,  # Ne pas lancer web search auto
}
```

**Questions :**
- Le workflow `llm-intention` vérifie-t-il ce flag ?
- Si `auto_web_search: false`, le workflow doit retourner `propose_web_search` au lieu de lancer la recherche automatiquement
- Confirmation que ce comportement est implémenté côté n8n ?

---

#### 6. Pattern Jobs pour recherche web ?

Le RFC décrit un pattern avec création de job :
```
1. POST /api/v2/jobs → Crée job
2. POST /webhook/xxx-worker → Lance traitement
3. Polling GET /api/v2/jobs/{id}
```

**Situation plugin-recipes :** Appel direct à `llm-web-search` sans job tracking.

**Questions :**
- La recherche web devrait-elle utiliser le pattern Jobs ?
- Avantages potentiels : annulation, historique, tracking crédits
- Ou est-ce overkill pour une recherche web de 10-15 secondes ?

---

#### 7. Pertinence du traitement de documents pour Bot Appetit

Le RFC est orienté traduction de documents (PDF Talmud, images OCR).

**Questions :**
- Bot Appetit doit-il supporter le traitement de documents ?
- Cas d'usage potentiels :
  - Extraire une recette depuis une photo (OCR)
  - Traduire un PDF de recettes étrangères
- Si oui, quelle est la priorité ?

---

### Résumé des actions plugin-recipes

| # | Action | Dépend de | Priorité |
|---|--------|-----------|----------|
| 1 | Clarifier `llm-intention` vs `mcp-llm-intention` | Équipe n8n | 🔴 Haute |
| 2 | Préparer migration format `response_type` | Équipe n8n (calendrier) | 🟡 Moyenne |
| 3 | Confirmer flag `auto_web_search` côté n8n | Équipe n8n | 🔴 Haute |
| 4 | Décider mémoire conversationnelle | Product Owner | 🟢 Basse |
| 5 | Décider support documents (OCR recettes) | Product Owner | 🟢 Basse |

---

### Points bloquants immédiats

1. **`auto_web_search: false`** - Sans confirmation que le workflow vérifie ce flag, la recherche web continuera de se lancer automatiquement
2. **Format de réponse** - Si le workflow migre vers `response_type`, le code actuel cassera

---

# 📋 SYNTHÈSE ET DÉCISIONS

**Date:** 2026-01-22
**Status:** Validé par les équipes

---

## Décisions actées

### 1. Source de vérité pour les jobs : MongoDB uniquement

```
┌─────────────────────────────────────────────────────────────────┐
│  DÉCISION : MongoDB /api/v2/jobs pour TOUS les jobs             │
│                                                                 │
│  ✅ Jobs Torah                                                  │
│  ✅ Jobs MCP                                                    │
│  ✅ Jobs Documents (migration depuis Redis)                     │
│                                                                 │
│  ❌ Redis document:job:* → DÉPRÉCIÉ                             │
│     DocumentJobStore (chatbot-core) → À supprimer               │
└─────────────────────────────────────────────────────────────────┘
```

**Justification** : Une seule source de vérité, historique permanent, requêtes complexes possibles.

---

### 2. Endpoint de polling autoritaire : `/api/v2/jobs/{job_id}`

| Endpoint | Status |
|----------|--------|
| `GET /api/v2/jobs/{job_id}` | ✅ **AUTORITAIRE** |
| `GET /webhook/torah-job-status` | ❌ DÉPRÉCIÉ |

Tous les plugins doivent migrer vers `/api/v2/jobs/{id}`.

---

### 3. Création job : Plugin crée, Worker exécute

```
┌─────────┐  1. POST /api/v2/jobs   ┌─────────┐
│ Plugin  │ ───────────────────────▶│   API   │ → job_id (status: pending)
└─────────┘                         └─────────┘
     │
     │ 2. POST /webhook/worker (avec job_id)
     ▼
┌─────────┐                         ┌─────────┐
│   n8n   │ ───────────────────────▶│   API   │ → PATCH status: processing
└─────────┘  3. PATCH job           └─────────┘

Si étape 2 échoue → Plugin supprime le job (DELETE /api/v2/jobs/{job_id})
```

---

### 4. Format de réponse : Migration directe vers `response_type`

```json
{
  "response_type": "action_proposal",
  "message": "...",
  "proposed_actions": [
    { "id": "translate", "label": "🌐 Traduire", "webhook": "...", "params": {...} }
  ]
}
```

**Pas de rétrocompatibilité** avec l'ancien format `next_action`. Les plugins migrent immédiatement.

---

### 5. Mémoire conversationnelle : Côté plugin

```
┌─────────────────────────────────────────────────────────────────┐
│  Plugin gère :                                                  │
│  - Historique des messages (history[])                          │
│  - Contexte de session                                          │
│  - Fichiers attachés                                            │
│                                                                 │
│  n8n reste STATELESS :                                          │
│  - Reçoit history[] à chaque appel                              │
│  - Ne stocke rien entre les appels                              │
└─────────────────────────────────────────────────────────────────┘
```

L'architecture est prête. Chaque plugin implémente la mémoire quand pertinent pour son cas d'usage.

---

### 6. Crédits : Passent par n8n vers l'API

```
┌─────────┐     ┌─────────┐     ┌─────────────────────────┐
│ Plugin  │────▶│   n8n   │────▶│ API Torah (PostgreSQL)  │
│         │     │ webhook │     │ table: user_credits     │
└─────────┘     └─────────┘     └─────────────────────────┘
```

**Endpoints API existants :**
- `GET /api/subscription/credits/{discord_user_id}` ✅

**Endpoints API à créer :**
- `POST /api/credits/{user_id}/debit`
- `POST /api/credits/{user_id}/refund`

**Webhooks n8n à créer :**
- `POST /webhook/credits-check`
- `POST /webhook/credits-debit`
- `POST /webhook/credits-refund`

---

### 7. Workflows LLM-Intention

| Workflow | Usage | Status |
|----------|-------|--------|
| `mcp-llm-intention` | Appels via MCP protocol | ✅ Existe |
| `llm-intention` | Appels webhook directs | ✅ Existe |

Les deux ont le **même contrat de sortie** (`response_type` + `proposed_actions`).

Le flag `auto_web_search` est supporté :
- `false` → retourne `propose_web_search`
- `true` (défaut) → lance la recherche automatiquement

---

## Réponses aux questions n8n

| # | Question | Réponse |
|---|----------|---------|
| Q1 | Endpoint polling | `/api/v2/jobs/{id}` est autoritaire. `/webhook/torah-job-status` est déprécié. |
| Q2 | Création job préalable | Oui, le worker attend un `job_id` existant créé par le plugin. |
| Q3 | Estimation | `/webhook/documents/estimate` existe et retourne `{ tokens, cost, time }`. |
| Q4 | Annulation | `/webhook/document-cancel` à créer (RFC-017). Segments déjà traduits sont sauvegardés. |
| Q5 | Format réponses | Formats proposés validés. Résultat final dans `output` du job lors du polling. |

---

# 🔵 TRAVAIL ÉQUIPE API TORAH

## Actions à réaliser

| # | Action | Priorité | Complexité |
|---|--------|----------|------------|
| 1 | Ajouter champ `progress` au modèle Job | 🔴 Haute | Faible |
| 2 | Créer `POST /api/credits/{user_id}/debit` | 🔴 Haute | Moyenne |
| 3 | Créer `POST /api/credits/{user_id}/refund` | 🔴 Haute | Moyenne |
| 4 | Valider transitions d'état (rejeter invalides) | 🟡 Moyenne | Faible |
| 5 | Auto-set timestamps (cancelled_at, completed_at) | 🟡 Moyenne | Faible |
| 6 | Supporter `credits` dans PATCH /api/v2/jobs | 🟡 Moyenne | Faible |

## Spécifications

### Champ `progress` dans Job

```python
class JobUpdateRequest:
    status: str | None
    progress: dict | None  # ← NOUVEAU
    output: dict | None
    error: dict | None

# Format progress
{
    "current": 5,
    "total": 15,
    "percentage": 33,
    "step": "translating"
}
```

### Endpoints crédits

```bash
# Débiter des crédits
POST /api/credits/{discord_user_id}/debit
Content-Type: application/json
{
    "project_id": "torah",
    "amount": 10,
    "reason": "document_translation",
    "job_id": "xxx"
}

# Response
{
    "success": true,
    "credits_remaining": 90,
    "credits_debited": 10
}

# Rembourser des crédits
POST /api/credits/{discord_user_id}/refund
Content-Type: application/json
{
    "project_id": "torah",
    "amount": 5,
    "reason": "job_cancelled",
    "job_id": "xxx"
}

# Response
{
    "success": true,
    "credits_remaining": 95,
    "credits_refunded": 5
}
```

---

# 🟠 TRAVAIL ÉQUIPE N8N

## Actions à réaliser

| # | Action | Priorité | Fichier |
|---|--------|----------|---------|
| 1 | Créer `/webhook/document-cancel` | 🔴 Haute | `Document-Cancel.json` |
| 2 | Créer `/webhook/credits-check` | 🔴 Haute | `Credits-Check.json` |
| 3 | Créer `/webhook/credits-debit` | 🔴 Haute | `Credits-Debit.json` |
| 4 | Créer `/webhook/credits-refund` | 🔴 Haute | `Credits-Refund.json` |
| 5 | Modifier Torah-Translate-Worker (check-before-process) | 🔴 Haute | `Torah-Translate-Worker.json` |
| 6 | Confirmer `auto_web_search` déployé | 🔴 Haute | `MCP-LLM-Intention.json` |
| 7 | Migrer format `response_type` dans llm-intention | 🟡 Moyenne | `LLM-Intention.json` |

## Spécifications

### Webhook document-cancel

Voir **RFC-017** section "Équipe n8n" pour les détails complets.

```json
// Request
POST /webhook/document-cancel
{
    "job_id": "xxx",
    "user_id": "123",
    "reason": "user_requested"
}

// Response
{
    "success": true,
    "job_id": "xxx",
    "credits_consumed": { "total_tokens": 9000, "cost_usd": 0.015 },
    "credits_saved": { "tokens_not_used": 18000, "cost_usd": 0.030 }
}
```

### Webhooks crédits

```json
// POST /webhook/credits-check
{ "discord_user_id": "123", "project_id": "torah" }
→ Appelle GET /api/subscription/credits/{discord_user_id}

// POST /webhook/credits-debit
{ "discord_user_id": "123", "project_id": "torah", "amount": 10, "job_id": "xxx" }
→ Appelle POST /api/credits/{user_id}/debit

// POST /webhook/credits-refund
{ "discord_user_id": "123", "project_id": "torah", "amount": 5, "job_id": "xxx" }
→ Appelle POST /api/credits/{user_id}/refund
```

---

# 🟢 TRAVAIL ÉQUIPE CHATBOT-CORE

## Actions à réaliser

| # | Action | Priorité | Impact |
|---|--------|----------|--------|
| 1 | Migrer polling vers `/api/v2/jobs/{id}` | 🔴 Haute | `DocumentTranslationClient` |
| 2 | Supprimer `DocumentJobStore` (Redis) | 🔴 Haute | Nettoyage |
| 3 | Ajouter `cancel_url` au PollingService | 🔴 Haute | Voir RFC-017 |
| 4 | Adapter `CreditsClient` pour nouveaux endpoints | 🟡 Moyenne | Via webhooks n8n |
| 5 | Créer `DocumentWorkflowService` (RFC-016 compliant) | 🟡 Moyenne | Nouveau service |

## Architecture deux niveaux (validée)

```
┌─────────────────────────────────────────────────────────────────┐
│  NIVEAU 1 : DocumentWorkflowService (RFC-016 compliant)         │
│  ─────────────────────────────────────────────────────────────  │
│  Pour : Flux conversationnel complet avec MCP-LLM-Intention     │
│  - Passe par mcp-llm-intention                                  │
│  - Crée job via /api/v2/jobs                                    │
│  - Polling via /api/v2/jobs/{id}                                │
│  - Supporte estimation, annulation                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ utilise en interne
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  NIVEAU 2 : DocumentTranslationClient (Low-level)               │
│  ─────────────────────────────────────────────────────────────  │
│  Pour : Commandes slash directes, cas simples                   │
│  - Appel direct au worker                                       │
│  - Polling via /api/v2/jobs/{id}                                │
│  - Simple et rapide                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

# 🟣 TRAVAIL ÉQUIPE PLUGIN-TORAH

## Actions à réaliser

| # | Action | Priorité |
|---|--------|----------|
| 1 | Migrer polling vers `/api/v2/jobs/{id}` | 🔴 Haute |
| 2 | Passer `cancel_url` au PollingService | 🔴 Haute |
| 3 | Afficher crédits consommés/économisés à l'annulation | 🟡 Moyenne |
| 4 | Utiliser `DocumentWorkflowService` pour mentions | 🟡 Moyenne |

---

# 🟤 TRAVAIL ÉQUIPE PLUGIN-RECIPES (Bot Appetit)

## Actions à réaliser

| # | Action | Priorité |
|---|--------|----------|
| 1 | Migrer vers format `response_type` + `proposed_actions` | 🔴 Haute |
| 2 | Confirmer que `auto_web_search: false` fonctionne | 🔴 Haute |
| 3 | Implémenter mémoire conversationnelle (optionnel) | 🟢 Quand pertinent |
| 4 | Supporter OCR recettes (optionnel) | 🟢 Quand pertinent |

## Migration format réponse

```python
# AVANT (à supprimer)
if response.get("next_action") == "propose_web_search":
    ...

# APRÈS
if response.get("response_type") == "action_proposal":
    for action in response.get("proposed_actions", []):
        if action["id"] == "web_search":
            ...
```

---

# 📅 ORDRE D'IMPLÉMENTATION

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1 : Fondations (API + n8n)                               │
│  ─────────────────────────────────────────────────────────────  │
│  1. API : Ajouter champ progress                                │
│  2. API : Créer endpoints crédits (debit/refund)                │
│  3. n8n : Créer webhooks crédits                                │
│  4. n8n : Créer /webhook/document-cancel                        │
│  5. n8n : Confirmer auto_web_search déployé                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2 : Adaptation plugins                                   │
│  ─────────────────────────────────────────────────────────────  │
│  1. chatbot-core : Migrer polling                               │
│  2. chatbot-core : Ajouter cancel_url au PollingService         │
│  3. chatbot-core : Supprimer DocumentJobStore                   │
│  4. plugin-recipes : Migrer format response_type                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3 : Améliorations (optionnel)                            │
│  ─────────────────────────────────────────────────────────────  │
│  1. chatbot-core : DocumentWorkflowService                      │
│  2. n8n : Workers check-before-process (RFC-017)                │
│  3. API : SSE /jobs/{id}/stream                                 │
│  4. API : Idempotency key                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Voir aussi

- **RFC-017**: Job Lifecycle & Credits (gestion générique des jobs)
- **RFC-014**: Document Translation Synthesis (détails traduction)
- **RFC-010**: Loading View (composant progression)
