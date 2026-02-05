# Issue: RFC-027 - Cleanup Workflows n8n

> **Source:** RFC-027-COMMAND-ARCHITECTURE.md
> **Équipe:** n8n
> **Priorité:** P0
> **Effort estimé:** 0.5 jour

---

## Contexte

Suite à l'adoption de RFC-027 (Architecture Conversationnelle Unifiée), certains workflows n8n deviennent obsolètes car:
- Les flux conversationnels passent par **azy.mcp** qui appelle l'API directement
- L'API publie les events Redis directement via `ResilientEventPublisher`
- n8n n'est plus un proxy entre plugin et API

## Workflows à supprimer

| Workflow | Raison de suppression |
|----------|----------------------|
| `COURSE-CRUD-Webhooks.json` | Proxy inutile - azy.mcp → API directement |
| `FORMATION-Create-Promotion.json` | L'API publie events directement |
| `FORMATION-Archive-Promotion.json` | L'API publie events directement |
| `FORMATION-Sync.json` | Endpoint API + events, pas besoin de n8n |

## Workflows à conserver

```
workflows/
├── STRIPE-Webhook-Handler.json          # Externe - Stripe webhooks
├── STRIPE-Handler-Subscription-Updated.json
├── STRIPE-Handler-Payment-Intent.json
├── STRIPE-Handler-Payment-Failed.json
├── SUBSCRIPTION-Reconciliation.json     # Cron 3h00
├── COURSE-Expiration-Cron.json          # Cron 6h00
└── INFRA-Process-Pending-Events.json    # Infra fallback DB
```

## Tâches

- [ ] Supprimer `workflows/COURSE-CRUD-Webhooks.json`
- [ ] Supprimer `workflows/FORMATION-Create-Promotion.json`
- [ ] Supprimer `workflows/FORMATION-Archive-Promotion.json`
- [ ] Supprimer `workflows/FORMATION-Sync.json`
- [ ] Mettre à jour `docs/issues/WEBHOOKS-REGISTRY.md` (retirer les sections obsolètes)

## Impact

- **Avant:** 11 workflows
- **Après:** 7 workflows
- **Lignes supprimées:** ~2000 lignes JSON

## Documentation à mettre à jour

- `docs/issues/WEBHOOKS-REGISTRY.md` - Retirer sections Formation et Course CRUD

## Dépendances

- Aucune - suppression pure, pas de migration nécessaire
- L'API doit implémenter `ResilientEventPublisher` pour que les events continuent à être publiés

---

*Issue créée le 2026-02-05*
*Source: RFC-027 Section "Tâches par Équipe - n8n"*
