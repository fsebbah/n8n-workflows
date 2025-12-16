# P2-07: bulk_url_processor_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | P2-07 |
| **Nom** | bulk_url_processor_tool |
| **Priorité** | Haute |
| **Statut** | Fragile - A durcir |
| **Catégorie** | Scraping / Orchestration |

## Description

Workflow n8n pour le traitement batch d'URLs avec parallélisme contrôlé et rate-limiting par domaine. Utilise Crawlee avec autoscaling et BullMQ pour la gestion de queue.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| Orchestration | **Crawlee** | Autoscaling, retry intégré |
| Queue | **BullMQ** | Production-ready, rate-limit/domaine |
| Cache | **Redis** | Dedup URLs, cache résultats |
| Stockage résultats | Redis / PostgreSQL | Selon volume |

## Endpoint

```
POST /webhook/bulk-url-processor
Content-Type: application/json

{
  "urls": [
    "https://example1.com/page1",
    "https://example2.com/page2",
    "https://example1.com/page3"
  ],
  "operation": "scrape" | "extract" | "metadata",
  "options": {
    "concurrency": 5,
    "rate_limit_per_domain": 2,
    "delay_ms": 2000,
    "timeout_per_url_ms": 30000,
    "continue_on_fail": true,
    "callback_url": "https://my-webhook.com/results"
  },
  "execution_mode": "online" | "offline"
}
```

## Response (mode synchrone)

```json
{
  "success": true,
  "data": {
    "results": [
      {
        "url": "https://example1.com/page1",
        "status": "success",
        "data": { "title": "...", "content": "..." }
      },
      {
        "url": "https://example2.com/page2",
        "status": "success",
        "data": { "title": "...", "content": "..." }
      },
      {
        "url": "https://example1.com/page3",
        "status": "error",
        "error": { "code": 404, "message": "Not found" }
      }
    ],
    "summary": {
      "total": 3,
      "success": 2,
      "failed": 1,
      "skipped": 0
    }
  },
  "meta": {
    "provider": "crawlee-bullmq",
    "execution_mode": "online",
    "total_time_ms": 8500
  }
}
```

## Response (mode async)

```json
{
  "success": true,
  "data": {
    "job_id": "bulk-job-abc123",
    "status": "queued",
    "urls_count": 50,
    "estimated_time_seconds": 120,
    "status_url": "/webhook/bulk-url-processor/status/bulk-job-abc123",
    "results_url": "/webhook/bulk-url-processor/results/bulk-job-abc123"
  }
}
```

## Endpoints complémentaires (mode async)

```
GET /webhook/bulk-url-processor/status/:job_id
→ { "status": "processing", "progress": { "completed": 25, "total": 50 } }

GET /webhook/bulk-url-processor/results/:job_id?page=1&limit=20
→ { "results": [...], "pagination": { "page": 1, "total_pages": 3 } }
```

## Configuration Rate-limiting

```yaml
global:
  max_concurrent: 10
  max_urls_per_request: 100

per_domain:
  max_concurrent: 2
  delay_between_requests_ms: 2000-5000  # randomisé

retry:
  on_429: wait 60s, max 3 attempts
  on_5xx: exponential backoff, max 5 attempts

queue:
  job_timeout: 300000  # 5 minutes
  attempts: 3
  backoff:
    type: exponential
    delay: 5000
```

## Definition of Done

- [ ] Endpoint `POST /webhook/bulk-url-processor`
- [ ] Input: array URLs (max 100)
- [ ] Parallélisme: configurable (défaut 5)
- [ ] Rate-limit: par domaine
- [ ] Output: résultats agrégés avec statuts individuels
- [ ] Mode async: webhook callback optionnel
- [ ] Split in Batches (1-5 URLs)
- [ ] Continue On Fail activé
- [ ] Backoff 60s sur 429
- [ ] Résultats paginés/streamables
- [ ] Tests: 10 URLs mixtes, timeout partiel, retry

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| Batch 10 URLs | URLs variées | Résultats complets |
| Même domaine | 5 URLs example.com | Rate-limit respecté |
| Échec partiel | 2/10 en 404 | continue_on_fail |
| 429 | Rate limited | Retry avec backoff |
| Mode async | 50 URLs | Job ID retourné |
| Pagination | Résultats async | Pages correctes |
| Callback | URL de callback | Webhook appelé |

## Dépendances

- **Crawlee** (npm) - Orchestration
- **BullMQ** (npm) - Queue management
- **Redis** - Queue, cache, rate-limit
- web_scraper_tool - Pour le scraping individuel
- Variables d'environnement:
  - `REDIS_URL`

## Notes d'implémentation

1. Grouper les URLs par domaine pour optimiser rate-limit
2. Déduplication des URLs avant traitement
3. Stocker progression pour mode async
4. Callback webhook avec signature HMAC
5. Cleanup jobs terminés après 24h
6. Métriques: jobs/minute, taux échec, temps moyen

## Références

- [TOOLS_WORKFLOWS_MAPPING.md - Stack Scraping](../mcp-server/TOOLS_WORKFLOWS_MAPPING.md#stack-scraping-n8n--phase-2-v2)
- [tools-complementaire.md](../n8n/tools-complementaire.md)
- [BullMQ documentation](https://docs.bullmq.io/)
