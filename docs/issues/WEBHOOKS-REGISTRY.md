# Registre des Webhooks n8n

> **Dernière mise à jour :** 2026-02-05
> **Base URL :** `{N8N_WEBHOOK_URL}/webhook/`

---

## Vue d'ensemble

Ce document référence tous les webhooks exposés par les workflows n8n, organisés par domaine fonctionnel.

---

## Infrastructure (RFC-023)

### Crons (pas de webhook)

| Workflow | Fichier | Fréquence | Description |
|----------|---------|-----------|-------------|
| `INFRA---Process-Pending-Events` | `workflows/INFRA-Process-Pending-Events.json` | Toutes les minutes | Traite les events en fallback DB |

---

## Formation Management (RFC-023)

| Endpoint | Méthode | Workflow | Fichier |
|----------|---------|----------|---------|
| `/webhook/formation-create-promotion` | POST | `FORMATION---Create-Promotion` | `workflows/FORMATION-Create-Promotion.json` |
| `/webhook/formation-archive-promotion` | POST | `FORMATION---Archive-Promotion` | `workflows/FORMATION-Archive-Promotion.json` |
| `/webhook/formation-sync` | POST | `FORMATION---Sync` | `workflows/FORMATION-Sync.json` |

### Détails des endpoints

#### POST /webhook/formation-create-promotion

Crée une nouvelle promotion et publie un event Redis pour déclencher la création de la structure Discord.

**Headers:**
- `X-Project-ID` (optionnel) : ID du projet

**Body:**
```json
{
  "guild_id": "123456789",
  "formation_id": "uuid",
  "formation_name": "CAP Cuisine",
  "formation_emoji": "👨‍🍳",
  "year_start": 2024,
  "year_end": 2025,
  "matieres": ["techniques", "patisserie", "hygiene"]
}
```

**Response (201):**
```json
{
  "success": true,
  "message": "Promotion créée avec succès",
  "promotion": {
    "id": "uuid",
    "formation_id": "uuid",
    "year_start": 2024,
    "year_end": 2025
  },
  "event_published": true
}
```

**Event Redis:** `promotion.created` → `formation:events:stream`

---

#### POST /webhook/formation-archive-promotion

Archive une promotion existante et publie un event Redis.

**Headers:**
- `X-Project-ID` (optionnel) : ID du projet

**Body:**
```json
{
  "guild_id": "123456789",
  "promotion_id": "uuid"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Promotion archivée avec succès",
  "promotion_id": "uuid",
  "archived_at": "2026-02-05T12:00:00Z",
  "event_published": true
}
```

**Event Redis:** `promotion.archived` → `formation:events:stream`

---

#### POST /webhook/formation-sync

Réconcilie l'état API avec Discord. Détecte et corrige les désynchronisations.

**Headers:**
- `X-Project-ID` (optionnel) : ID du projet

**Body:**
```json
{
  "guild_id": "123456789",
  "mode": "check"
}
```

**Modes:**
- `check` : Rapport sans correction (default)
- `repair` : Corrige les désynchronisations

**Response (200) - Mode check:**
```json
{
  "success": true,
  "mode": "check",
  "guild_id": "123456789",
  "report": {
    "promotions_checked": 5,
    "discord_structures_found": 4,
    "anomalies_detected": 2,
    "anomalies": [
      {
        "type": "MISSING_DISCORD_STRUCTURE",
        "severity": "high",
        "promotion_id": "uuid",
        "message": "Structure Discord manquante"
      }
    ],
    "suggested_repairs": 1
  },
  "message": "2 anomalies détectées. Utilisez mode=repair pour corriger."
}
```

**Response (200) - Mode repair:**
```json
{
  "success": true,
  "mode": "repair",
  "guild_id": "123456789",
  "report": {
    "promotions_checked": 5,
    "discord_structures_found": 4,
    "anomalies_detected": 2,
    "repairs_attempted": 1,
    "events_published": 1
  },
  "message": "Réconciliation terminée: 2 anomalies détectées, 1 réparations lancées"
}
```

**Event Redis (mode repair):** `promotion.repair_structure` → `formation:events:stream`

---

## Events Redis publiés

| Event Type | Stream | Publisher | Consumer |
|------------|--------|-----------|----------|
| `promotion.created` | `formation:events:stream` | formation-create-promotion | chatbot-core (FormationEventSubscriber) |
| `promotion.archived` | `formation:events:stream` | formation-archive-promotion | chatbot-core (FormationEventSubscriber) |
| `promotion.repair_structure` | `formation:events:stream` | formation-sync | chatbot-core (FormationEventSubscriber) |

### Format des events (RFC-023)

Tous les events suivent le format standard défini dans `REDIS-STREAMS-EVENTS-API.md` :

```json
{
  "event": "promotion.created",
  "guild_id": "123456789",
  "timestamp": "2026-02-05T15:30:00Z",
  "data": {
    "promotion_id": "uuid",
    "formation_id": "uuid",
    "formation_name": "CAP Cuisine",
    "formation_emoji": "👨‍🍳",
    "year_start": 2024,
    "year_end": 2025,
    "matieres": ["techniques", "patisserie"]
  }
}
```

**Champs obligatoires :**
- `event` : Type d'événement (format `domain.action`)
- `guild_id` : ID du serveur Discord
- `timestamp` : ISO 8601 UTC
- `data` : Payload spécifique à l'événement

---

## Codes d'erreur

| Code | Status | Description |
|------|--------|-------------|
| 400 | BAD_REQUEST | Paramètres manquants ou invalides |
| 404 | NOT_FOUND | Ressource non trouvée |
| 500 | API_ERROR | Erreur lors de l'appel API |

---

## Configuration

### Variables d'environnement n8n requises

| Variable | Description | Exemple |
|----------|-------------|---------|
| `API_URL` | URL de l'API backend | `http://localhost:3031` |
| `DISCORD_ADMIN_WEBHOOK` | Webhook Discord pour alertes admin | `https://discord.com/api/webhooks/xxx/yyy` |

### Credentials n8n requis

| Credential | Type | Usage |
|------------|------|-------|
| `Redis account` | Redis | Publication events Redis Streams |
| `PostgreSQL Pending Events` | PostgreSQL | Table pending_events (fallback) |

---

## Arborescence des fichiers

```
workflows/
├── INFRA-Process-Pending-Events.json    # Cron fallback DB
├── FORMATION-Create-Promotion.json      # POST /webhook/formation-create-promotion
├── FORMATION-Archive-Promotion.json     # POST /webhook/formation-archive-promotion
└── FORMATION-Sync.json                  # POST /webhook/formation-sync
```

---

*Document généré le 2026-02-05*
*Sources : RFC-023, Issues #268, #269*
