# RFC-031 Intent API Endpoints

> Documentation des endpoints API requis pour les workflows n8n RFC-031.

| Metadata | |
|----------|---------|
| **Équipe destinataire** | api-backend |
| **Équipe source** | n8n-workflows |
| **RFC** | RFC-031 - Classification d'Intention Hybride |
| **PR n8n** | #297 |
| **Date** | 2026-02-10 |

---

## Contexte

Les workflows n8n RFC-031 nécessitent des endpoints API pour :
- Stocker l'historique des intent events (MongoDB)
- Agréger et synchroniser les keywords (MongoDB → Redis)
- Calculer et stocker les métriques (MongoDB → PostgreSQL)
- Logger les alertes (MongoDB)

**Redis reste géré en direct par n8n** pour les streams temps réel.

---

## Endpoints Requis

### 1. POST /api/intent/history

**Workflow:** `N8N-Intent-Events-Consumer`
**Fréquence:** Every 10 seconds (batch up to 50 events)

**Description:** Insère un événement d'intent classification dans MongoDB.

**Request:**
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

**Response (success):**
```json
{
  "success": true,
  "id": "mongo_object_id"
}
```

**Response (error):**
```json
{
  "error": "Database connection failed",
  "code": 500
}
```

**MongoDB Collection:** `intent_history`

---

### 2. POST /api/intent/keywords/aggregate

**Workflow:** `CRON-Intent-Keywords-Sync`
**Fréquence:** Daily 03:00 AM

**Description:** Agrège les tokens validés des dernières 24h pour calculer les poids.

**Request:**
```json
{
  "period": "24h",
  "min_count": 3
}
```

**Response:**
```json
{
  "data": [
    {
      "_id": { "domain": "recipes", "token": "recette" },
      "count": 150,
      "avg_confidence": 0.87
    },
    {
      "_id": { "domain": "recipes", "token": "cookies" },
      "count": 45,
      "avg_confidence": 0.82
    },
    {
      "_id": { "domain": "books", "token": "livre" },
      "count": 78,
      "avg_confidence": 0.91
    }
  ]
}
```

**MongoDB Aggregation Pipeline:**
```javascript
[
  {
    $match: {
      was_validated: true,
      created_at: { $gte: ISODate("now - 24h") }
    }
  },
  { $unwind: "$tokens" },
  {
    $group: {
      _id: { domain: "$domain", token: "$tokens" },
      count: { $sum: 1 },
      avg_confidence: { $avg: "$confidence_at_prediction" }
    }
  },
  { $match: { count: { $gte: 3 } } },
  { $sort: { count: -1 } }
]
```

---

### 3. POST /api/intent/keywords/sync

**Workflow:** `CRON-Intent-Keywords-Sync`
**Fréquence:** Daily 03:00 AM (après aggregate)

**Description:** Synchronise les keywords calculés vers Redis ZSET.

**Request:**
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

**Response:**
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

**Actions Redis:**
```
ZADD keywords:recipes:triggers 8.5 "recette" 4.2 "cookies"
ZADD keywords:books:triggers 7.1 "livre"
SET keywords:version "2026-02-10T03:00:00Z"
```

---

### 4. POST /api/intent/stats/aggregate

**Workflow:** `CRON-Intent-Stats-Daily`
**Fréquence:** Daily 04:00 AM

**Description:** Agrège les statistiques de la veille.

**Request:**
```json
{
  "date": "2026-02-09"
}
```

**Response:**
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

**MongoDB Aggregation:** Voir workflow pour le pipeline complet avec `$facet`.

---

### 5. POST /api/intent/stats/hourly

**Workflow:** `ALERT-Intent-Clarification-High`
**Fréquence:** Every hour

**Description:** Statistiques de la dernière heure pour monitoring.

**Request:**
```json
{
  "period": "1h"
}
```

**Response:**
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

### 6. POST /api/intent/metrics

**Workflow:** `CRON-Intent-Stats-Daily`
**Fréquence:** Daily 04:00 AM

**Description:** Sauvegarde les métriques quotidiennes (PostgreSQL).

**Request:**
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

**Response:**
```json
{
  "success": true,
  "action": "upsert",
  "stats_date": "2026-02-09"
}
```

**PostgreSQL Table:** `intent_metrics`
```sql
CREATE TABLE intent_metrics (
  stats_date DATE PRIMARY KEY,
  total_requests INTEGER,
  unique_users INTEGER,
  unique_guilds INTEGER,
  clarification_rate NUMERIC(5,2),
  accuracy NUMERIC(5,2),
  latency_p50 INTEGER,
  latency_p95 INTEGER,
  latency_p99 INTEGER,
  domain_breakdown JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**SQL:** `INSERT ... ON CONFLICT (stats_date) DO UPDATE`

---

### 7. POST /api/intent/alerts

**Workflows:** `ALERT-Intent-Clarification-High`, `ALERT-Intent-DLQ-Monitor`
**Fréquence:** Hourly / Every 15 min

**Description:** Log une alerte dans MongoDB.

**Request (clarification_high):**
```json
{
  "alert_type": "clarification_high",
  "severity": "WARNING",
  "clarification_rate": 35.5,
  "total_requests": 85,
  "clarification_count": 30,
  "domain_breakdown": {
    "recipes": { "total": 60, "clarifications": 25 }
  }
}
```

**Request (dlq_messages):**
```json
{
  "alert_type": "dlq_messages",
  "severity": "CRITICAL",
  "dlq_count": 15,
  "sample_errors": [
    {
      "stream_id": "1234567890-0",
      "message": "test message",
      "error": "MongoDB connection timeout",
      "failed_at": "2026-02-10T10:30:00Z"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "id": "mongo_alert_id"
}
```

**MongoDB Collection:** `intent_alerts`

---

## Résumé des endpoints

| Endpoint | Method | Workflow | Fréquence | DB |
|----------|--------|----------|-----------|-----|
| `/api/intent/history` | POST | Events Consumer | 10s | MongoDB |
| `/api/intent/keywords/aggregate` | POST | Keywords Sync | Daily 03:00 | MongoDB |
| `/api/intent/keywords/sync` | POST | Keywords Sync | Daily 03:00 | Redis |
| `/api/intent/stats/aggregate` | POST | Stats Daily | Daily 04:00 | MongoDB |
| `/api/intent/stats/hourly` | POST | Clarification Alert | Hourly | MongoDB |
| `/api/intent/metrics` | POST | Stats Daily | Daily 04:00 | PostgreSQL |
| `/api/intent/alerts` | POST | Alerts | Variable | MongoDB |

---

## Schémas de base de données

### MongoDB Collections

```javascript
// intent_history
{
  stream_id: String,
  message: String,
  tokens: [String],
  domain: String,
  was_validated: Boolean,
  validation_type: String,  // "implicit" | "explicit" | "clarification"
  confidence_at_prediction: Number,
  user_id: String,
  guild_id: String,
  tool_used: String,
  original_timestamp: String,
  created_at: Date
}

// intent_alerts
{
  alert_type: String,       // "clarification_high" | "dlq_messages"
  severity: String,         // "OK" | "WARNING" | "CRITICAL"
  clarification_rate: Number,
  dlq_count: Number,
  total_requests: Number,
  domain_breakdown: Object,
  sample_errors: Array,
  created_at: Date
}
```

### PostgreSQL Table

```sql
CREATE TABLE intent_metrics (
  stats_date DATE PRIMARY KEY,
  total_requests INTEGER,
  unique_users INTEGER,
  unique_guilds INTEGER,
  clarification_rate NUMERIC(5,2),
  accuracy NUMERIC(5,2),
  latency_p50 INTEGER,
  latency_p95 INTEGER,
  latency_p99 INTEGER,
  domain_breakdown JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Redis Keys

```
keywords:{domain}:triggers  → ZSET (token → weight)
keywords:version            → STRING (ISO timestamp)
intent:events               → STREAM (géré par chatbot-core)
intent:dlq                  → STREAM (géré par n8n)
```

---

## Notes d'implémentation

1. **Authentification:** Les endpoints sont internes (n8n → API). Pas besoin d'auth externe, mais valider l'origine si nécessaire.

2. **Timeout:** Les workflows ont des timeouts configurés (10-60s). L'API doit répondre rapidement.

3. **Idempotence:**
   - `/api/intent/history` : Utiliser `stream_id` comme clé unique
   - `/api/intent/metrics` : UPSERT sur `stats_date`

4. **Error handling:** Retourner un objet `{ error: "message" }` en cas d'erreur. Le workflow Consumer redirigera vers la DLQ.

5. **Batch processing:** `/api/intent/history` reçoit 1 event à la fois, mais peut être appelé ~5 fois/seconde en pic.

---

## Contact

Questions → équipe n8n-workflows
