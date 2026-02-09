# RFC031-N8N-000: Vue d'ensemble - Workflows n8n pour RFC-031

| Metadata | |
|----------|---------|
| **Équipe** | n8n-workflows |
| **RFC** | RFC-031 - Classification d'Intention Hybride |
| **Status** | In Progress |
| **Date** | 2026-02-09 |

---

## Contexte

La RFC-031 introduit un système de classification d'intention hybride (Keywords + Similarité Sémantique). L'équipe n8n-workflows est responsable des workflows de support : consumers, jobs batch, alertes.

## Architecture choisie

**Option C (Hybride)** - Section 17.4 :
- Qdrant/Redis : accès direct (temps réel)
- MongoDB : via Redis Stream + n8n consumer (async)

## Workflows à créer

| # | GitHub | Workflow | Type | Priorité | PR | Status |
|---|--------|----------|------|----------|-----|--------|
| 1 | #285 | Intent Events Consumer | Stream Consumer | P1 | #291 | Merged |
| 2 | #286 | CRON Intent Keywords Sync | Cron Daily | P1 | #292 | Merged |
| 3 | #287 | CRON Intent Stats Daily | Cron Daily | P2 | #293 | Open |
| 4 | #288 | ALERT Clarification High | Cron Hourly | P2 | #294 | Open |
| 5 | #289 | ALERT DLQ Monitor | Cron 15min | P2 | #295 | Open |
| 6 | #290 | (Réservé) | - | - | - | - |

## Décisions techniques

| Item | Décision |
|------|----------|
| Cache embedding format | Redis STRING |
| Cache embedding TTL | 24h |
| Consumer group name | `n8n-intent-consumer` |
| DLQ stream name | `intent:dlq` |
| Events stream name | `intent:events` |

## Fichiers workflows

```
workflows/
├── N8N-Intent-Events-Consumer.json      # #285
├── CRON-Intent-Keywords-Sync.json       # #286
├── CRON-Intent-Stats-Daily.json         # #287
├── ALERT-Intent-Clarification-High.json # #288
└── ALERT-Intent-DLQ-Monitor.json        # #289
```
