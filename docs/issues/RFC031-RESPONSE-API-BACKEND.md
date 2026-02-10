# RFC-031 — Reponse equipe api-backend

> Reponse a `RFC031-INTENT-API-ENDPOINTS.md` (equipe n8n-workflows)

| Metadata | |
|----------|---------|
| **Equipe source** | api-backend |
| **Equipe destinataire** | n8n-workflows |
| **RFC** | RFC-031 - Classification d'Intention Hybride |
| **Date** | 2026-02-10 |
| **Statut** | Proposition — en attente validation n8n |

---

## 1. Perimetre accepte

api-backend prend en charge :

- **Stockage** des events bruts dans MongoDB (`chatbot_analytics`)
- **Agregation** des keywords et statistiques (logique metier cote API, pas cote n8n)
- **Sync Redis** des keywords agreges vers ZSET
- **UPSERT metriques** daily dans PostgreSQL
- **Stockage alertes** dans MongoDB

n8n se limite a :

- Consommer le Redis Stream `intent:events`
- Appeler les endpoints api-backend (ecriture + lecture)
- Declencher les CRONs (sync keywords, stats daily, alertes)

---

## 2. Corrections sur les endpoints proposes

### 2.1 Verbes HTTP — 3 endpoints doivent passer en GET

Les endpoints `keywords/aggregate`, `stats/aggregate` et `stats/hourly` sont des **lectures**.
Un POST implique la creation ou modification d'une ressource. Lire des donnees agregees = GET.

| # | Proposition n8n (POST) | Correction api-backend (GET) | Raison |
|---|------------------------|------------------------------|--------|
| 2 | `POST /api/intent/keywords/aggregate` | `GET /api/intent/keywords` | Lecture de donnees agregees, pas de side-effect |
| 4 | `POST /api/intent/stats/aggregate` | `GET /api/intent/stats/daily` | Lecture de stats journalieres |
| 5 | `POST /api/intent/stats/hourly` | `GET /api/intent/stats/hourly` | Lecture de stats horaires |

Les parametres passent du body vers les **query parameters** (convention REST standard).

### 2.2 Nommage

| Proposition n8n | Correction | Raison |
|-----------------|------------|--------|
| `/api/intent/history` | `/api/intent/events` | On ecrit un **event**, on lit l'**historique**. Le POST cree un event. |
| `/api/intent/keywords/aggregate` | `/api/intent/keywords` | L'agregation est un detail d'implementation, pas une ressource |
| `/api/intent/stats/aggregate` | `/api/intent/stats/daily` | Coherence avec `stats/hourly` |

### 2.3 Endpoint batch recommande

Le doc mentionne "batch up to 50 events" toutes les 10 secondes, mais l'endpoint recoit 1 event a la fois.
Envoyer 50 requetes HTTP en 10 secondes est inefficace. Ajout d'un endpoint batch :

```
POST /api/intent/events        → 1 event (conserve pour compatibilite)
POST /api/intent/events/batch  → jusqu'a 50 events en un appel
```

---

## 3. Contrat d'API revise

### 3.1 Ecritures (POST) — 4 endpoints

#### `POST /api/intent/events`

Insere un event d'intent classification dans MongoDB.

**Workflow :** `N8N-Intent-Events-Consumer`
**Frequence :** ~5/s en pic
**Collection MongoDB :** `intent_events` (base `chatbot_analytics`)

```
POST /api/intent/events
Content-Type: application/json
```

```json
{
  "stream_id": "1234567890-0",
  "message": "je veux une recette de cookies",
  "tokens": ["recette", "cookies"],
  "domain": "recipes",
  "was_validated": true,
  "validation_type": "implicit",
  "confidence_at_prediction": 0.85,
  "user_id": "user123",
  "guild_id": "guild456",
  "tool_used": "recipe_search",
  "original_timestamp": "2026-02-10T10:30:00Z"
}
```

**Reponse (201) :**

```json
{
  "success": true,
  "id": "65f1a2b3c4d5e6f7a8b9c0d1"
}
```

**Idempotence :** Index unique sur `stream_id`. Un doublon retourne 200 avec l'id existant.

---

#### `POST /api/intent/events/batch`

Insere un batch d'events en un seul appel (recommande).

**Workflow :** `N8N-Intent-Events-Consumer`
**Frequence :** toutes les 10 secondes (batch de 1 a 50)

```
POST /api/intent/events/batch
Content-Type: application/json
```

```json
{
  "events": [
    {
      "stream_id": "1234567890-0",
      "message": "je veux une recette de cookies",
      "tokens": ["recette", "cookies"],
      "domain": "recipes",
      "was_validated": true,
      "validation_type": "implicit",
      "confidence_at_prediction": 0.85,
      "user_id": "user123",
      "guild_id": "guild456",
      "tool_used": "recipe_search",
      "original_timestamp": "2026-02-10T10:30:00Z"
    }
  ]
}
```

**Reponse (201) :**

```json
{
  "success": true,
  "inserted": 48,
  "duplicates": 2
}
```

**Implementation :** `insert_many(ordered=False)` avec gestion des doublons `stream_id`.

---

#### `POST /api/intent/metrics`

UPSERT des metriques quotidiennes dans PostgreSQL.

**Workflow :** `CRON-Intent-Stats-Daily`
**Frequence :** Daily 04:00 AM
**Table PostgreSQL :** `intent_metrics` (schema public)

```
POST /api/intent/metrics
Content-Type: application/json
```

```json
{
  "stats_date": "2026-02-09",
  "total_requests": 1250,
  "unique_users": 89,
  "unique_guilds": 12,
  "clarification_rate": 10.0,
  "accuracy": 78.4,
  "latency_p50": 45,
  "latency_p95": 120,
  "latency_p99": 250,
  "domain_breakdown": {
    "recipes": { "count": 800, "accuracy": 90.0 },
    "books": { "count": 450, "accuracy": 57.8 }
  }
}
```

**Reponse (200) :**

```json
{
  "success": true,
  "action": "upsert",
  "stats_date": "2026-02-09"
}
```

**Idempotence :** `INSERT ... ON CONFLICT (stats_date) DO UPDATE`.

---

#### `POST /api/intent/alerts`

Log une alerte dans MongoDB.

**Workflows :** `ALERT-Intent-Clarification-High`, `ALERT-Intent-DLQ-Monitor`
**Frequence :** Horaire / toutes les 15 min
**Collection MongoDB :** `intent_alerts` (base `chatbot_analytics`)

```
POST /api/intent/alerts
Content-Type: application/json
```

```json
{
  "alert_type": "clarification_high",
  "severity": "WARNING",
  "payload": {
    "clarification_rate": 35.5,
    "total_requests": 85,
    "clarification_count": 30,
    "domain_breakdown": {
      "recipes": { "total": 60, "clarifications": 25 }
    }
  }
}
```

**Reponse (201) :**

```json
{
  "success": true,
  "id": "65f1a2b3c4d5e6f7a8b9c0d2"
}
```

**Note :** Le payload est un champ JSONB flexible — les champs varient selon `alert_type`
(`clarification_high` vs `dlq_messages`). Pas de schema rigide sur le payload.

---

### 3.2 Lectures (GET) — 3 endpoints

#### `GET /api/intent/keywords`

Retourne les tokens agreges par domaine (agregation MongoDB cote api-backend).

**Workflow :** `CRON-Intent-Keywords-Sync`
**Frequence :** Daily 03:00 AM

```
GET /api/intent/keywords?period=24h&min_count=3
```

| Parametre | Type | Defaut | Description |
|-----------|------|--------|-------------|
| `period` | string | `24h` | Fenetre d'agregation (`1h`, `6h`, `12h`, `24h`, `7d`) |
| `min_count` | int | `3` | Seuil minimum d'occurrences |

**Reponse (200) :**

```json
{
  "data": [
    {
      "domain": "recipes",
      "token": "recette",
      "count": 150,
      "avg_confidence": 0.87
    },
    {
      "domain": "recipes",
      "token": "cookies",
      "count": 45,
      "avg_confidence": 0.82
    },
    {
      "domain": "books",
      "token": "livre",
      "count": 78,
      "avg_confidence": 0.91
    }
  ]
}
```

**Note :** L'agregation (pipeline `$unwind` + `$group`) est executee cote api-backend.
Le format de reponse est aplati (`domain` + `token`) au lieu du `_id: { domain, token }` MongoDB
pour faciliter le parsing cote n8n.

---

#### `GET /api/intent/stats/daily`

Retourne les statistiques agregees d'une journee (agregation MongoDB cote api-backend).

**Workflow :** `CRON-Intent-Stats-Daily`
**Frequence :** Daily 04:00 AM

```
GET /api/intent/stats/daily?date=2026-02-09
```

| Parametre | Type | Defaut | Description |
|-----------|------|--------|-------------|
| `date` | string (YYYY-MM-DD) | **requis** | Journee a agreger |

**Reponse (200) :**

```json
{
  "data": {
    "total_requests": 1250,
    "validated_count": 980,
    "clarification_count": 125,
    "unique_users": 89,
    "unique_guilds": 12,
    "latency_p50": 45,
    "latency_p95": 120,
    "latency_p99": 250,
    "domain_breakdown": {
      "recipes": { "count": 800, "validated": 720 },
      "books": { "count": 450, "validated": 260 }
    }
  }
}
```

---

#### `GET /api/intent/stats/hourly`

Retourne les statistiques de la derniere periode pour le monitoring.

**Workflow :** `ALERT-Intent-Clarification-High`
**Frequence :** Toutes les heures

```
GET /api/intent/stats/hourly?period=1h
```

| Parametre | Type | Defaut | Description |
|-----------|------|--------|-------------|
| `period` | string | `1h` | Fenetre de lookback (`1h`, `3h`, `6h`) |

**Reponse (200) :**

```json
{
  "data": {
    "total": 85,
    "clarification_count": 12,
    "domain_breakdown": {
      "recipes": { "total": 60, "clarifications": 8 },
      "books": { "total": 25, "clarifications": 4 }
    }
  }
}
```

---

### 3.3 Action (POST) — 1 endpoint

#### `POST /api/intent/keywords/sync`

Synchronise les keywords calcules vers Redis ZSET.

**Workflow :** `CRON-Intent-Keywords-Sync`
**Frequence :** Daily 03:00 AM (apres GET /keywords)

```
POST /api/intent/keywords/sync
Content-Type: application/json
```

```json
{
  "keywords_by_domain": {
    "recipes": [
      { "token": "recette", "weight": 8.5 },
      { "token": "cookies", "weight": 4.2 }
    ],
    "books": [
      { "token": "livre", "weight": 7.1 }
    ]
  },
  "total_domains": 2,
  "total_keywords": 3
}
```

**Reponse (200) :**

```json
{
  "success": true,
  "domains_updated": 2,
  "keywords_synced": 3,
  "redis_keys": [
    "keywords:recipes:triggers",
    "keywords:books:triggers"
  ]
}
```

---

## 4. Resume des changements vs proposition n8n

| Changement | Detail |
|------------|--------|
| **3 POST → GET** | `keywords/aggregate`, `stats/aggregate`, `stats/hourly` deviennent des GET avec query params |
| **Nommage** | `history` → `events`, `keywords/aggregate` → `keywords`, `stats/aggregate` → `stats/daily` |
| **Endpoint batch** | Ajout `POST /events/batch` (recommande pour le consumer, 1 appel / 10s au lieu de 50) |
| **Reponse keywords aplatie** | `{ domain, token, count }` au lieu de `{ _id: { domain, token } }` |
| **Alertes payload flexible** | Champ `payload` JSONB unique au lieu de champs a plat variables selon `alert_type` |
| **Agregation** | Executee cote api-backend (pipelines MongoDB), n8n consomme les resultats via GET |

## 5. Stockage

| Donnee | Stockage | Base / Schema |
|--------|----------|---------------|
| Events bruts (historique) | MongoDB | `chatbot_analytics.intent_events` |
| Alertes | MongoDB | `chatbot_analytics.intent_alerts` |
| Metriques daily | PostgreSQL | `public.intent_metrics` |
| Domaines (config) | PostgreSQL | `public.intent_domains` |
| Keywords (cache) | Redis | ZSET `keywords:{domain}:triggers` |
| Domaines actifs (cache) | Redis | SET `config:intent:domains` |

## 6. Pre-requis api-backend

| Pre-requis | Statut |
|------------|--------|
| Ajouter `motor` dans `requirements.txt` | A faire |
| Client Motor async (singleton, pattern Redis) | A faire |
| Variable `MONGODB_URI` + `MONGODB_DATABASE` | Disponible (`.env.local`) |

## 7. Tableau recapitulatif des endpoints

| # | Methode | Endpoint | Workflow n8n | Frequence | Stockage |
|---|---------|----------|-------------|-----------|----------|
| 1 | POST | `/api/intent/events` | Events Consumer | ~5/s pic | MongoDB |
| 2 | POST | `/api/intent/events/batch` | Events Consumer | /10s | MongoDB |
| 3 | GET | `/api/intent/keywords` | Keywords Sync | Daily 03:00 | MongoDB (read) |
| 4 | POST | `/api/intent/keywords/sync` | Keywords Sync | Daily 03:00 | Redis (write) |
| 5 | GET | `/api/intent/stats/daily` | Stats Daily | Daily 04:00 | MongoDB (read) |
| 6 | GET | `/api/intent/stats/hourly` | Clarification Alert | Horaire | MongoDB (read) |
| 7 | POST | `/api/intent/metrics` | Stats Daily | Daily 04:00 | PostgreSQL |
| 8 | POST | `/api/intent/alerts` | Alerts | Variable | MongoDB |

**Total : 8 endpoints** (5 POST, 3 GET)

---

## Contact

Questions → equipe api-backend
