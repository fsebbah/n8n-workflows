# Issue: RFC-027 - Workflows Notifications (Optionnel)

> **Source:** RFC-027-COMMAND-ARCHITECTURE.md
> **Équipe:** n8n
> **Priorité:** P2
> **Effort estimé:** 1 jour

---

## Contexte

Dans l'architecture RFC-027, n8n peut être **consommateur d'events Redis** pour envoyer des notifications Discord. Ces workflows sont optionnels et dépendent des décisions de l'équipe architecture.

## Question ouverte

**Qui envoie les notifications Discord (level up, badges)?**

| Option | Description | Avantage | Inconvénient |
|--------|-------------|----------|--------------|
| A | chatbot-core (event subscriber) | Déjà connecté à Discord | Couplage |
| B | n8n (event subscriber + webhook) | Découplé, configurable | +1 service |
| C | azy.mcp (mcp-discord.send_dm) | Centralisé | Overhead NLU inutile |

**Attendre validation de l'équipe architecture avant implémentation.**

## Workflows potentiels à créer

| Workflow | Trigger | Action |
|----------|---------|--------|
| `NOTIF-Level-Up.json` | Event `level:up` | DM Discord + embed célébratoire |
| `NOTIF-Badge-Earned.json` | Event `badge:earned` | DM Discord |
| `NOTIF-Course-Expiring.json` | Event `course.access.expiring` | DM Discord rappel |
| `ALERT-Anomaly-Detected.json` | Event `reconciliation.anomaly` | Webhook admin Discord |

## Architecture proposée

```
Redis Streams ──subscribe──> n8n ──> Discord Webhook
     │
     └── formation:events:stream
     └── learning:events:stream
     └── xp:events:stream (nouveau?)
```

## Tâches (si validé)

- [ ] Attendre décision architecture (Option A, B ou C)
- [ ] Si Option B: Créer `NOTIF-Level-Up.json`
- [ ] Si Option B: Créer `NOTIF-Badge-Earned.json`
- [ ] Si Option B: Créer `NOTIF-Course-Expiring.json`
- [ ] Si Option B: Créer `ALERT-Anomaly-Detected.json`
- [ ] Documenter dans WEBHOOKS-REGISTRY.md

## Dépendances

- Décision architecture sur le responsable des notifications
- Events Redis définis (`level:up`, `badge:earned`, etc.)
- Webhook Discord admin configuré

## Statut

⏸️ **EN ATTENTE** - Nécessite validation architecture

---

*Issue créée le 2026-02-05*
*Source: RFC-027 Section "Workflows Potentiels à Créer"*
