# Architecture Technique - Systeme Recipes

> Vue d'ensemble des choix d'architecture, responsabilites des composants et bonnes pratiques.

## Table des matieres

1. [Frontiere API vs n8n](#1-frontiere-api-vs-n8n)
2. [Modele de confiance & securite](#2-modele-de-confiance--securite)
3. [Contrats d'interface](#3-contrats-dinterface)
4. [Observabilite](#4-observabilite)

---

## 1. Frontiere API vs n8n

### Principe de separation

L'architecture separe clairement les responsabilites entre l'API backend (FastAPI) et n8n (orchestration).

```
┌────────────────────────────────────────────────────────────────────┐
│                           PLUGIN DISCORD                            │
└───────────────────────┬────────────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
┌───────────────┐               ┌───────────────┐
│   API (Core)  │               │ n8n (Metier)  │
│    FastAPI    │◄─────────────►│   Workflows   │
└───────────────┘               └───────────────┘
```

### API Backend (FastAPI) - Logique "Core"

L'API backend gere la **persistance et les operations CRUD** :

| Responsabilite | Exemples |
|----------------|----------|
| **CRUD Donnees** | Creer/lire/modifier/supprimer recettes, shopping lists |
| **Persistance** | PostgreSQL (stockage), Redis (cache) |
| **Planification** | Celery (timers de cuisson) |
| **Validation** | Schemas Pydantic, contraintes DB |
| **Authentification** | Validation `discord_user_id`, rate limiting |

**Endpoints API (acces direct):**
```
POST   /api/recipes                    # CRUD recettes
GET    /api/recipes/{id}
GET    /api/recipes/user/{user_id}
DELETE /api/recipes/{id}

POST   /api/shopping-list/{user}/items # CRUD shopping list
PUT    /api/shopping-list/item/{id}
DELETE /api/shopping-list/item/{id}

POST   /api/recipes/timer              # Timers (Celery)
GET    /api/recipes/timers/{user}
DELETE /api/recipes/timer/{id}
```

### n8n Workflows - Logique "Metier"

n8n gere l'**orchestration et les integrations externes** :

| Responsabilite | Exemples |
|----------------|----------|
| **Generation IA** | Appels Anthropic/OpenAI pour generer recettes |
| **Recherche semantique** | Embeddings OpenAI + recherche Qdrant |
| **Extraction contenu** | YouTube transcriptions, web scraping |
| **Orchestration multi-services** | Chainer API + Qdrant + LLM |
| **Transformation donnees** | Mapping champs, normalisation |
| **Notifications** | Envoyer messages Discord via webhooks |

**Webhooks n8n (orchestration):**
```
POST /webhook/recipes-generate     # LLM: generer recette
POST /webhook/recipes-search       # Qdrant: recherche semantique
POST /webhook/recipes-similar      # Qdrant: recettes similaires
POST /webhook/recipes-save         # Orchestrer: Qdrant + API
POST /webhook/recipes-youtube      # YouTube: extraire recette
POST /webhook/recipes-web-search   # Multi-provider: recherche web
POST /webhook/recipes-timer-notify # Discord: notification timer
```

### Matrice de decision

| Type d'operation | Composant | Justification |
|------------------|-----------|---------------|
| Stockage donnees | API | Source de verite unique (PostgreSQL) |
| Cache sessions | API | Redis avec TTL, proche des donnees |
| Appel LLM | n8n | Multi-provider, prompts complexes |
| Recherche vectorielle | n8n | Orchestration embedding + Qdrant |
| Timer notification | API→n8n | Celery schedule, n8n notifie Discord |
| Validation metier | API | Schemas Pydantic, contraintes DB |
| Transformation format | n8n | Mapping champs LLM→API |

---

## 2. Modele de confiance & securite

### Architecture de confiance

```
┌─────────────────────────────────────────────────────────────┐
│                     ZONE DE CONFIANCE                        │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐     │
│  │   API   │◄──│   n8n   │◄──│ Celery  │◄──│  Redis  │     │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘     │
│       ▲             ▲                                       │
│       │             │                                       │
└───────┼─────────────┼───────────────────────────────────────┘
        │             │
        │   ┌─────────┴─────────┐
        │   │  ZONE EXTERNE     │
        │   │  ┌─────────────┐  │
        └───┼──│   Plugin    │──┘
            │  │   Discord   │
            │  └─────────────┘
            │
     ┌──────┴──────┐
     │  Discord    │
     │  Gateway    │
     └─────────────┘
```

### Authentification des webhooks n8n

**1. Identification par `discord_user_id`**
```json
{
  "user_id": "123456789012345678",  // ID Discord (snowflake)
  "query": "gateau au chocolat"
}
```

**2. Validation cote n8n (Validate Input node)**
```javascript
// Validation obligatoire
if (!body.user_id || !/^\d{17,19}$/.test(body.user_id)) {
  return { valid: false, error: { code: 401, message: "Invalid user_id" } };
}
```

**3. Headers recommandes pour production**
```
X-Request-ID: uuid          # Tracabilite
X-Forwarded-For: ip         # Rate limiting
Authorization: Bearer token # Si API keys projet
```

### Gestion des secrets

| Secret | Stockage | Acces |
|--------|----------|-------|
| **API Keys LLM** | Passe par le plugin | Jamais stocke dans n8n |
| **Qdrant API Key** | Variable env n8n | `process.env.QDRANT_API_KEY` |
| **Discord Webhooks** | Variable env ou request | Passe par Celery pour timers |
| **PostgreSQL** | Variable env API | `DATABASE_URL` |
| **Redis** | Variable env API/Celery | `REDIS_URL` |

**Principe: Zero credentials dans les workflows JSON**
```javascript
// BON - Credentials dynamiques
"apiKey": "={{ $json.body.openai_api_key }}"

// MAUVAIS - Credentials en dur
"apiKey": "sk-xxx-actual-key"  // INTERDIT
```

### Controle d'acces multi-projets

```
┌─────────────────────────────────────────────────────────┐
│                     PROJET A (Guild 1)                   │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   │
│  │ discord_id  │──▶│  Recipes    │──▶│  Shopping   │   │
│  │  user_123   │   │  user_123   │   │  user_123   │   │
│  └─────────────┘   └─────────────┘   └─────────────┘   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                     PROJET B (Guild 2)                   │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐   │
│  │ discord_id  │──▶│  Recipes    │──▶│  Shopping   │   │
│  │  user_456   │   │  user_456   │   │  user_456   │   │
│  └─────────────┘   └─────────────┘   └─────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Isolation par `discord_user_id`:**
- Chaque utilisateur accede uniquement a ses donnees
- Les recettes sont liees a un `discord_user_id` unique
- Pas de partage cross-user sans logique explicite

---

## 3. Contrats d'interface

### Format de reponse standard

Toutes les reponses (n8n et API) suivent ce schema:

```json
{
  "success": true,
  "data": {
    // Payload specifique a l'operation
  },
  "meta": {
    "provider": "anthropic|openai|qdrant|api",
    "model": "claude-sonnet-4-20250514",
    "tokens_used": 1250,
    "request_id": "uuid"
  }
}
```

### Format d'erreur standard

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Description lisible",
    "status": "BAD_REQUEST|UNAUTHORIZED|NOT_FOUND|RATE_LIMITED|API_ERROR|PARSE_ERROR"
  },
  "meta": {
    "provider": "anthropic",
    "request_id": "uuid"
  }
}
```

### Codes d'erreur

| Code | Status | Description | Action client |
|------|--------|-------------|---------------|
| 400 | BAD_REQUEST | Parametres invalides | Corriger la requete |
| 401 | UNAUTHORIZED | API key manquante/invalide | Verifier credentials |
| 404 | NOT_FOUND | Ressource inexistante | Verifier l'ID |
| 429 | RATE_LIMITED | Trop de requetes | Retry avec backoff |
| 500 | API_ERROR | Erreur provider externe | Retry ou fallback |
| 500 | PARSE_ERROR | Reponse LLM invalide | Retry |

### Idempotence

**Webhooks n8n (stateless):**
```
POST /webhook/recipes-generate  # Non-idempotent (genere nouveau contenu)
POST /webhook/recipes-search    # Idempotent (meme query = meme resultats)
POST /webhook/recipes-save      # Idempotent si recipe_id fourni
```

**API Backend (idempotent par design):**
```
POST /api/recipes               # Idempotent si qdrant_point_id unique
PUT  /api/shopping-list/item/x  # Idempotent
DELETE /api/recipes/x           # Idempotent
```

### Contrat Timer (Celery → n8n → Discord)

**1. Creation timer (API):**
```json
POST /api/recipes/timer
{
  "discord_user_id": "123456789",
  "discord_channel_id": "channel_123",
  "discord_webhook_url": "https://discord.com/api/webhooks/...",
  "label": "Sortir le gateau",
  "duration_minutes": 15,
  "recipe_id": "recipe_123",
  "recipe_title": "Gateau au chocolat"
}
```

**2. Notification (Celery → n8n):**
```json
POST /webhook/recipes-timer-notify
{
  "timer_id": "timer_abc",
  "discord_user_id": "123456789",
  "discord_webhook_url": "https://discord.com/api/webhooks/...",
  "label": "Sortir le gateau",
  "duration_minutes": 15,
  "recipe_id": "recipe_123",
  "recipe_title": "Gateau au chocolat"
}
```

### Mapping des champs (n8n ↔ API)

| Source (n8n/LLM) | Destination (API) | Transformation |
|------------------|-------------------|----------------|
| `user_id` | `discord_user_id` | Rename |
| `prep_time_minutes` | `prep_time` | Rename |
| `cook_time_minutes` | `cook_time` | Rename |
| `steps` | `instructions` | Rename |
| `qdrant_id` | `qdrant_point_id` | Rename |
| `tips` | *(ignore)* | Non supporte par API |

---

## 4. Observabilite

### Correlation des logs

**Principe: Un `request_id` unique traverse tous les composants**

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Plugin  │────▶│   n8n    │────▶│   API    │────▶│ Celery   │
│ req_abc  │     │ req_abc  │     │ req_abc  │     │ job_123  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                │                │                │
     ▼                ▼                ▼                ▼
┌────────────────────────────────────────────────────────────┐
│                    LOGS CORRELES                            │
│  [req_abc] Plugin: !recette gateau                         │
│  [req_abc] n8n: recipes-generate started                   │
│  [req_abc] n8n: Anthropic API call (1250 tokens)           │
│  [req_abc] n8n: recipes-generate completed (2.3s)          │
│  [job_123] Celery: timer scheduled (15min)                 │
│  [job_123] Celery: timer fired → n8n webhook               │
└────────────────────────────────────────────────────────────┘
```

**Implementation n8n (Code node):**
```javascript
const requestId = $json.body.request_id || crypto.randomUUID();
console.log(`[${requestId}] Processing recipes-generate`);

return [{
  json: {
    ...data,
    meta: { request_id: requestId }
  }
}];
```

### Metriques cles

| Composant | Metrique | Seuil alerte |
|-----------|----------|--------------|
| **n8n Webhooks** | Latence p95 | > 5s |
| **n8n Webhooks** | Taux d'erreur | > 5% |
| **API Endpoints** | Latence p95 | > 500ms |
| **API Endpoints** | Taux 5xx | > 1% |
| **Celery Tasks** | Queue depth | > 100 |
| **Celery Tasks** | Task failures | > 5/min |
| **Qdrant** | Search latency | > 200ms |
| **Redis** | Memory usage | > 80% |
| **PostgreSQL** | Connection pool | > 90% |

### Points de monitoring

```yaml
# Prometheus scrape config (exemple)
scrape_configs:
  - job_name: 'n8n'
    static_configs:
      - targets: ['n8n:5678']
    metrics_path: /metrics  # Si disponible

  - job_name: 'api'
    static_configs:
      - targets: ['api:8000']
    metrics_path: /metrics

  - job_name: 'celery'
    static_configs:
      - targets: ['flower:5555']
    metrics_path: /metrics

  - job_name: 'qdrant'
    static_configs:
      - targets: ['qdrant:6333']
    metrics_path: /metrics
```

### Alerting recommande

**Critiques (PagerDuty/SMS):**
```yaml
- alert: N8nWebhookDown
  expr: up{job="n8n"} == 0
  for: 2m
  severity: critical

- alert: CeleryQueueBacklog
  expr: celery_queue_length > 500
  for: 5m
  severity: critical
```

**Warnings (Slack):**
```yaml
- alert: HighLLMLatency
  expr: n8n_webhook_duration_seconds{path="recipes-generate"} > 10
  for: 5m
  severity: warning

- alert: QdrantSearchSlow
  expr: qdrant_search_latency_p95 > 500
  for: 5m
  severity: warning
```

### Dashboards recommandes

**1. Vue d'ensemble systeme:**
- Requetes/sec par endpoint (n8n + API)
- Latence p50/p95/p99
- Taux d'erreur par type

**2. Vue LLM:**
- Tokens utilises par provider
- Cout estime (tokens * prix)
- Taux de parse errors

**3. Vue Celery/Timers:**
- Timers actifs par utilisateur
- Queue depth
- Temps moyen d'execution

**4. Vue Qdrant:**
- Nombre de vectors par collection
- Latence de recherche
- Hit rate cache

---

## Annexes

### A. Checklist deploiement

- [ ] Variables d'environnement configurees (API, n8n, Celery)
- [ ] Secrets non exposes dans les workflows
- [ ] Rate limiting configure
- [ ] Logs centralises (ELK/Loki)
- [ ] Metriques exportees (Prometheus)
- [ ] Alertes configurees
- [ ] Backups PostgreSQL planifies
- [ ] Health checks configures

### B. Variables d'environnement

```bash
# API Backend
DATABASE_URL=postgresql://user:pass@host:5432/recipes
REDIS_URL=redis://host:6379/0
CELERY_BROKER_URL=redis://host:6379/1

# n8n
N8N_WEBHOOK_URL=http://n8n:5678/webhook
QDRANT_URL=http://qdrant:6333
QDRANT_API_KEY=xxx

# Optionnel (si API keys centralisees)
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx
```

### C. Documents connexes

- [RECIPES_PLUGIN_SPEC.md](./RECIPES_PLUGIN_SPEC.md) - Specification plugin Discord
- [RECIPES_API_SPEC.md](./RECIPES_API_SPEC.md) - Specification API backend
- [WORKFLOW_BEST_PRACTICES.md](../n8n/WORKFLOW_BEST_PRACTICES.md) - Bonnes pratiques n8n
