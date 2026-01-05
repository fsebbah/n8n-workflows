# Discord Workflows - Documentation API

## Vue d'ensemble

Cette documentation decrit tous les workflows n8n pour l'integration Discord.

Base URL: `http://pi6.local:5678/webhook/`

---

## Workflows principaux

### 1. discord-get-balance

**Endpoint:** `GET /webhook/discord-get-balance`

**Description:** Recupere le solde de credits d'un utilisateur avec statut d'abonnement et historique recent.

**Commande bot:** `/solde`

**Parametres (Query):**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| project_id | string | oui | ID du projet |
| discord_user_id | string | oui | ID Discord de l'utilisateur |

**Reponse:**
```json
{
  "success": true,
  "balance": {
    "credits_remaining": 850,
    "credits_total": 1000,
    "credits_used": 150,
    "usage_percent": 15,
    "subscription_status": "active",
    "renewal_date": "2025-02-01",
    "recent_transactions": [
      {
        "id": 123,
        "type": "debit",
        "amount": -10,
        "description": "Translation request",
        "created_at": "2025-01-05T10:00:00Z"
      }
    ]
  }
}
```

---

### 2. discord-get-plans

**Endpoint:** `GET /webhook/discord-get-plans`

**Description:** Recupere les plans d'abonnement disponibles depuis Stripe.

**Commande bot:** `/plans`

**Parametres (Query):**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| project_id | string | oui | ID du projet (ex: torah, mcp) |

**Reponse:**
```json
{
  "success": true,
  "project_id": "torah",
  "project_name": "Torah",
  "plans_count": 3,
  "plans": [
    {
      "id": "price_xxx",
      "product_id": "prod_xxx",
      "name": "Premium",
      "description": "Acces premium avec 1000 credits/mois",
      "price": 9.99,
      "currency": "eur",
      "interval": "month",
      "interval_count": 1,
      "credits_per_month": 1000,
      "features": ["Traductions illimitees", "Support prioritaire"],
      "metadata": {}
    }
  ]
}
```

---

### 3. discord-get-subscriber

**Endpoint:** `GET /webhook/discord-get-subscriber`

**Description:** Recupere les informations completes d'un abonne.

**Commandes bot:** `/plan`, `/credits`

**Parametres (Query):**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| project_id | string | oui | ID du projet |
| discord_user_id | string | oui | ID Discord de l'utilisateur |

**Reponse:**
```json
{
  "success": true,
  "subscriber": {
    "id": 123,
    "project_id": "torah",
    "discord_user_id": "123456789012345678",
    "email": "user@example.com",
    "plan_id": "price_xxx",
    "stripe_customer_id": "cus_xxx",
    "stripe_subscription_id": "sub_xxx",
    "credits_remaining": 850,
    "credits_total": 1000,
    "credits_used": 150,
    "usage_percent": 15,
    "subscription_status": "active",
    "current_period_start": "2025-01-01T00:00:00Z",
    "current_period_end": "2025-02-01T00:00:00Z",
    "created_at": "2024-12-01T00:00:00Z",
    "updated_at": "2025-01-05T00:00:00Z"
  }
}
```

---

### 4. discord-get-transactions

**Endpoint:** `GET /webhook/discord-get-transactions`

**Description:** Recupere l'historique des transactions avec pagination.

**Commande bot:** `/account`

**Parametres (Query):**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| project_id | string | oui | ID du projet |
| discord_user_id | string | oui | ID Discord de l'utilisateur |
| limit | number | non | Max resultats (defaut: 20, max: 100) |
| offset | number | non | Offset pagination (defaut: 0) |

**Reponse:**
```json
{
  "success": true,
  "transactions": [
    {
      "id": 456,
      "type": "credit",
      "amount": 1000,
      "description": "Monthly renewal",
      "reference": "sub_xxx",
      "created_at": "2025-01-01T00:00:00Z"
    },
    {
      "id": 455,
      "type": "debit",
      "amount": -25,
      "description": "Batch translation",
      "reference": "job_xxx",
      "created_at": "2024-12-28T15:30:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0,
    "count": 20,
    "has_more": true
  }
}
```

---

### 5. discord-registry

**Endpoint:** `GET /webhook/discord-registry`

**Description:** Registre dynamique de tous les workflows Discord actifs.

**Parametres:** Aucun

**Reponse:**
```json
{
  "version": "1.0",
  "updated_at": "2026-01-05T00:00:00Z",
  "n8n": {
    "host": "pi6.local",
    "port": 5678,
    "protocol": "http",
    "webhook_base": "http://pi6.local:5678/webhook"
  },
  "scopes": {
    "user": "Endpoint accessible par le bot Discord",
    "system": "Endpoint interne pour orchestration"
  },
  "total_tools": 5,
  "tools": {
    "discord-get-plans": {
      "name": "DISCORD - Get Plans",
      "label": "Get Plans",
      "icon": "📊",
      "description": "Recupere les plans disponibles",
      "tags": ["discord", "plans", "subscription"],
      "scope": "user",
      "command": "/plans",
      "workflow_id": "xxx",
      "endpoint": "/webhook/discord-get-plans",
      "webhook_url": "http://pi6.local:5678/webhook/discord-get-plans",
      "method": "GET",
      "active": true
    }
  }
}
```

---

### 6. discord-subscribe

**Endpoint:** `POST /webhook/discord-subscribe`

**Description:** Cree une session Stripe Checkout pour initier un abonnement.

**Commande bot:** `/subscribe`

**Body:**
```json
{
  "project_id": "torah",
  "discord_user_id": "123456789012345678",
  "plan_id": "price_xxx"
}
```

**Reponse:**
```json
{
  "success": true,
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_live_xxx",
  "session_id": "cs_live_xxx",
  "project_id": "torah",
  "discord_user_id": "123456789012345678",
  "plan_id": "price_xxx",
  "expires_at": "2026-01-06T12:00:00Z"
}
```

---

## Structure d'erreur commune

Toutes les endpoints retournent les erreurs au format:

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Description de l'erreur",
    "status": "BAD_REQUEST|NOT_FOUND|INTERNAL_ERROR|STRIPE_ERROR"
  }
}
```

---

## Tableau recapitulatif

| Workflow | Method | Path | Commande | Description |
|----------|--------|------|----------|-------------|
| discord-get-balance | GET | `/discord-get-balance` | /solde | Solde credits |
| discord-get-plans | GET | `/discord-get-plans` | /plans | Liste plans |
| discord-get-subscriber | GET | `/discord-get-subscriber` | /plan | Info abonne |
| discord-get-transactions | GET | `/discord-get-transactions` | /account | Historique |
| discord-registry | GET | `/discord-registry` | - | Registre |
| discord-subscribe | POST | `/discord-subscribe` | /subscribe | Checkout |

---

## Details techniques

- **Base de donnees:** PostgreSQL (tables: `subscribers`, `transactions`)
- **Paiement:** Stripe API
- **Configuration:** Redis (cles Stripe par projet)
- **Host n8n:** `http://pi6.local:5678`

---

*Document genere le 2026-01-06*
