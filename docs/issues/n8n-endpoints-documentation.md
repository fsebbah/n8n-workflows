# Documentation des Endpoints n8n pour Discord Bot

**Date:** 2026-01-08
**Version:** 1.0
**Base URL:** `http://pi6.local:5678` (interne) ou via nginx pour Stripe

---

## Table des matieres

1. [Endpoints Discord](#endpoints-discord)
2. [Endpoints Stripe](#endpoints-stripe)
3. [Autres Endpoints](#autres-endpoints)
4. [Configuration Requise](#configuration-requise)

---

## Endpoints Discord

### 1. POST /webhook/discord-subscribe

**Description:** Cree une session Stripe Checkout pour un nouvel abonnement.

**Request:**
```json
{
  "project_id": "torah-fun",
  "discord_user_id": "123456789012345678",
  "plan_id": "price_xxxxxxxxxxxxx",
  "customer_email": "user@example.com"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| project_id | string | Oui | Identifiant du projet (doit etre enregistre via stripe-register-project) |
| discord_user_id | string | Oui | ID Discord de l'utilisateur |
| plan_id | string | Oui | ID du prix Stripe (format: `price_xxx`) |
| customer_email | string | Non | Email pour pre-remplir le checkout |

**Response Success (200):**
```json
{
  "success": true,
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_xxx",
  "session_id": "cs_xxx",
  "project_id": "torah-fun",
  "discord_user_id": "123456789012345678",
  "plan_id": "price_xxx",
  "expires_at": "2026-01-08T16:00:00.000Z"
}
```

**Response Error (400/404/500):**
```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Parametres requis manquants: project_id",
    "status": "BAD_REQUEST"
  }
}
```

**Notes:**
- Apres paiement, l'utilisateur est redirige vers `https://stripe.azy.solutions/webhook/{project_id}/subscription/success`
- En cas d'annulation: `https://stripe.azy.solutions/webhook/{project_id}/subscription/cancel`

---

### 2. POST /webhook/discord-billing-portal

**Description:** Cree une session Stripe Billing Portal pour gerer l'abonnement existant.

**Request:**
```json
{
  "project_id": "torah-fun",
  "discord_user_id": "123456789012345678"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| project_id | string | Oui | Identifiant du projet |
| discord_user_id | string | Oui | ID Discord de l'utilisateur |

**Response Success (200):**
```json
{
  "success": true,
  "portal_url": "https://billing.stripe.com/p/session/xxx",
  "project_id": "torah-fun",
  "discord_user_id": "123456789012345678"
}
```

**Response Error:**
```json
{
  "success": false,
  "error": {
    "code": 404,
    "message": "Aucun client Stripe trouve pour cet utilisateur Discord",
    "status": "NOT_FOUND"
  }
}
```

**Notes:**
- Necessite que l'utilisateur ait deja un customer_id Stripe (via un abonnement passe)
- URL de retour: `https://stripe.azy.solutions/webhook/{project_id}/subscription/portal`

---

### 3. GET /webhook/discord-get-plans

**Description:** Recupere la liste des plans/prix disponibles pour un projet.

**Request:**
```
GET /webhook/discord-get-plans?project_id=torah-fun
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| project_id | string | Oui | Identifiant du projet |

**Response Success (200):**
```json
{
  "success": true,
  "plans": [
    {
      "id": "price_xxx",
      "product_id": "prod_xxx",
      "name": "Premium Mensuel",
      "description": "Acces premium pendant 1 mois",
      "amount": 999,
      "currency": "eur",
      "interval": "month",
      "interval_count": 1,
      "active": true
    },
    {
      "id": "price_yyy",
      "product_id": "prod_yyy",
      "name": "Premium Annuel",
      "description": "Acces premium pendant 1 an",
      "amount": 9900,
      "currency": "eur",
      "interval": "year",
      "interval_count": 1,
      "active": true
    }
  ],
  "project_id": "torah-fun"
}
```

**Notes:**
- Les montants sont en centimes (999 = 9.99 EUR)
- Seuls les prix actifs et non-archives sont retournes

---

### 4. GET /webhook/discord-get-subscriber

**Description:** Recupere les informations d'abonnement d'un utilisateur Discord.

**Request:**
```
GET /webhook/discord-get-subscriber?project_id=torah-fun&discord_user_id=123456789012345678
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| project_id | string | Oui | Identifiant du projet |
| discord_user_id | string | Oui | ID Discord de l'utilisateur |

**Response Success - Abonne (200):**
```json
{
  "success": true,
  "subscriber": {
    "discord_user_id": "123456789012345678",
    "customer_id": "cus_xxx",
    "subscription_id": "sub_xxx",
    "status": "active",
    "plan_id": "price_xxx",
    "current_period_start": "2026-01-01T00:00:00.000Z",
    "current_period_end": "2026-02-01T00:00:00.000Z",
    "cancel_at_period_end": false
  },
  "project_id": "torah-fun"
}
```

**Response Success - Non abonne (200):**
```json
{
  "success": true,
  "subscriber": null,
  "project_id": "torah-fun"
}
```

**Status possibles:**
- `active` - Abonnement actif
- `trialing` - En periode d'essai
- `past_due` - Paiement en retard
- `canceled` - Annule
- `unpaid` - Impaye

---

### 5. GET /webhook/discord-get-balance

**Description:** Recupere le solde de credits d'un utilisateur.

**Request:**
```
GET /webhook/discord-get-balance?project_id=torah-fun&discord_user_id=123456789012345678
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| project_id | string | Oui | Identifiant du projet |
| discord_user_id | string | Oui | ID Discord de l'utilisateur |

**Response Success (200):**
```json
{
  "success": true,
  "balance": {
    "discord_user_id": "123456789012345678",
    "credits": 150,
    "lifetime_credits": 500
  },
  "project_id": "torah-fun"
}
```

---

### 6. GET /webhook/discord-get-credits

**Description:** Alias/variante de get-balance pour recuperer les credits.

**Request:**
```
GET /webhook/discord-get-credits?project_id=torah-fun&discord_user_id=123456789012345678
```

**Response:** Identique a discord-get-balance.

---

### 7. GET /webhook/discord-get-transactions

**Description:** Recupere l'historique des transactions d'un utilisateur.

**Request:**
```
GET /webhook/discord-get-transactions?project_id=torah-fun&discord_user_id=123456789012345678&limit=10
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| project_id | string | Oui | Identifiant du projet |
| discord_user_id | string | Oui | ID Discord de l'utilisateur |
| limit | number | Non | Nombre max de transactions (defaut: 10) |

**Response Success (200):**
```json
{
  "success": true,
  "transactions": [
    {
      "id": "txn_xxx",
      "type": "subscription_created",
      "amount": 999,
      "currency": "eur",
      "status": "succeeded",
      "created_at": "2026-01-01T12:00:00.000Z",
      "description": "Abonnement Premium Mensuel"
    }
  ],
  "project_id": "torah-fun"
}
```

---

### 8. GET /webhook/discord-registry

**Description:** Recupere les informations de configuration d'un projet enregistre.

**Request:**
```
GET /webhook/discord-registry?project_id=torah-fun
```

**Response Success (200):**
```json
{
  "success": true,
  "project": {
    "project_id": "torah-fun",
    "display_name": "Torah Fun",
    "registered_at": "2026-01-01T00:00:00.000Z",
    "has_stripe": true
  }
}
```

---

## Endpoints Stripe

### 1. POST /webhook/stripe-register-project

**Description:** Enregistre un nouveau projet avec sa cle Stripe API.

**Request:**
```json
{
  "project_id": "torah-fun",
  "stripe_key": "sk_live_xxx",
  "display_name": "Torah Fun",
  "webhook_secret": "whsec_xxx"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| project_id | string | Oui | Identifiant unique du projet |
| stripe_key | string | Oui | Cle API Stripe (sk_live_xxx ou sk_test_xxx) |
| display_name | string | Non | Nom affichable du projet |
| webhook_secret | string | Non | Secret pour valider les webhooks Stripe |

**Response Success (200):**
```json
{
  "success": true,
  "message": "Projet enregistre avec succes",
  "project_id": "torah-fun"
}
```

**Notes:**
- Les credentials sont stockes dans Redis (cle: `project:{project_id}`)
- A appeler au demarrage du bot/plugin

---

### 2. POST /webhook/:project_id

**Description:** Webhook handler pour les evenements Stripe (checkout complete, subscription updated, etc.)

**Headers requis:**
```
Stripe-Signature: t=xxx,v1=xxx
Content-Type: application/json
```

**Evenements traites:**
- `checkout.session.completed` - Paiement checkout complete
- `customer.subscription.created` - Nouvel abonnement
- `customer.subscription.updated` - Abonnement modifie
- `customer.subscription.deleted` - Abonnement annule
- `invoice.payment_succeeded` - Renouvellement reussi
- `invoice.payment_failed` - Echec de paiement

**Notes:**
- Configurer l'URL webhook dans Stripe Dashboard: `https://stripe.azy.solutions/webhook/{project_id}`
- Le webhook_secret doit correspondre a celui enregistre

---

### 3. GET /webhook/:project_id/subscription/:action

**Description:** Page de resultat apres checkout/portal Stripe (HTML).

**Actions disponibles:**
| Action | Description | Affichage |
|--------|-------------|-----------|
| success | Paiement reussi | "Paiement reussi!" (vert) |
| cancel | Paiement annule | "Paiement annule" (rouge) |
| portal | Retour du billing portal | "Gestion terminee" (violet) |

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| session_id | string | ID de session Stripe (optionnel) |

**Response:** Page HTML avec message et bouton "Retourner sur Discord"

---

### 4. POST /webhook/subscription-checkout-create

**Description:** Endpoint generique pour creer une session checkout (alternative a discord-subscribe).

**Request:**
```json
{
  "project_id": "torah-fun",
  "price_id": "price_xxx",
  "customer_email": "user@example.com",
  "urls": {
    "success": "https://example.com/success",
    "cancel": "https://example.com/cancel"
  },
  "metadata": {
    "discord_user_id": "123456789"
  },
  "options": {
    "trial_days": 7,
    "allow_promotion_codes": true
  }
}
```

**Response:** Similaire a discord-subscribe.

---

### 5. POST /webhook/subscription-change-plan

**Description:** Change le plan d'un abonnement existant.

**Request:**
```json
{
  "project_id": "torah-fun",
  "subscription_id": "sub_xxx",
  "new_price_id": "price_yyy",
  "proration_behavior": "create_prorations"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| project_id | string | Oui | Identifiant du projet |
| subscription_id | string | Oui | ID de l'abonnement a modifier |
| new_price_id | string | Oui | Nouveau prix Stripe |
| proration_behavior | string | Non | `create_prorations`, `none`, `always_invoice` |

**Response Success (200):**
```json
{
  "success": true,
  "subscription": {
    "id": "sub_xxx",
    "status": "active",
    "current_period_end": "2026-02-01T00:00:00.000Z"
  }
}
```

---

## Autres Endpoints

### GET /webhook/credits-get

**Description:** Endpoint generique pour recuperer les credits (non lie a Discord).

**Request:**
```
GET /webhook/credits-get?project_id=torah-fun&user_id=xxx
```

---

## Configuration Requise

### Variables d'environnement n8n

```bash
# Dans ecosystem.config.js
STRIPE_WEBHOOK_URL=https://stripe.azy.solutions
WEBHOOK_URL=http://pi6.local:5678/
```

### Redis

Les projets sont stockes dans Redis avec la structure:
```
Cle: project:{project_id}
Valeur: {
  "stripe_key": "sk_xxx",
  "display_name": "Nom du projet",
  "webhook_secret": "whsec_xxx",
  "registered_at": "2026-01-01T00:00:00.000Z"
}
```

### Nginx (stripe.azy.solutions)

Le domaine `stripe.azy.solutions` redirige `/webhook/*` vers n8n:
```nginx
location /webhook/ {
    proxy_pass http://pi6.local:5678/webhook/;
}
```

---

## Codes d'erreur communs

| Code | Status | Description |
|------|--------|-------------|
| 400 | BAD_REQUEST | Parametres manquants ou invalides |
| 404 | NOT_FOUND | Projet non enregistre ou utilisateur non trouve |
| 500 | INTERNAL_ERROR | Erreur serveur (Redis, Stripe API) |
| 503 | SERVICE_UNAVAILABLE | Redis indisponible |

---

## Contact

Pour toute question sur ces endpoints, contacter l'equipe n8n-workflows.
