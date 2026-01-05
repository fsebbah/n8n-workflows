# Stripe Workflows - Documentation API

## Vue d'ensemble

Cette documentation decrit tous les workflows n8n pour l'integration Stripe.

Base URL: `http://pi6.local:5678/webhook/`

---

## Workflows principaux

### 1. stripe-webhook-handler

**Endpoint:** `POST /webhook/stripe-webhook/{project_id}`

**Description:** Handler de webhooks Stripe avec verification d'evenement via l'API Torah. Utilise pour les projets integres (ex: torah-fun).

**Parametres (Path):**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| project_id | string | oui | ID du projet (ex: "torah-fun") |

**Events geres:**
| Evenement | Action | Description |
|-----------|--------|-------------|
| `checkout.session.completed` | `set` | Initialise les credits (nouveau subscriber) |
| `invoice.paid` | `credit` | Ajoute credits (renouvellement mensuel) |
| `customer.subscription.deleted` | `set` | Remet credits a 0 (annulation) |

**Flow:**
1. Extrait project_id et event_id du payload
2. Appelle `/api/stripe/verify/{project_id}` pour verifier l'evenement
3. Traite l'evenement et appelle l'API Credits

**Reponse (Succes):**
```json
{"received": true}
```

**Reponse (Erreur):**
```json
{
  "error": {
    "code": 401,
    "message": "Invalid signature"
  }
}
```

---

### 2. stripe-register-project

**Endpoint:** `POST /webhook/stripe-register-project`

**Description:** Enregistre les secrets Stripe d'un projet dans Redis. Appele par les plugins au demarrage.

**Body:**
```json
{
  "project_id": "torah",
  "stripe_key": "sk_live_xxx",
  "webhook_secret": "whsec_xxx",
  "display_name": "Torah App"
}
```

**Validation:**
- `project_id`: requis
- `stripe_key`: requis, doit commencer par `sk_`
- `webhook_secret`: requis, doit commencer par `whsec_`
- `display_name`: optionnel (defaut: project_id)

**Stockage Redis:**
```
SET project:{project_id} '{"stripe_key":"sk_xxx","webhook_secret":"whsec_xxx","display_name":"...","registered_at":"..."}'
```

**Reponse:**
```json
{
  "success": true,
  "message": "Project registered successfully",
  "project": {
    "project_id": "torah",
    "display_name": "Torah App",
    "redis_key": "project:torah"
  }
}
```

---

### 3. subscription-checkout-create

**Endpoint:** `POST /webhook/subscription-checkout-create`

**Description:** Cree une session Stripe Checkout pour un abonnement. Agit comme proxy multi-tenant - chaque projet a son propre compte Stripe.

**Body:**
```json
{
  "project_id": "torah",
  "price_id": "price_xxx",
  "customer_email": "user@example.com",
  "callbacks": {
    "success": "http://plugin/webhook/success",
    "renewal": "http://plugin/webhook/renewal",
    "failure": "http://plugin/webhook/failure",
    "cancel": "http://plugin/webhook/cancel"
  },
  "urls": {
    "success": "https://app.com/success",
    "cancel": "https://app.com/cancel"
  },
  "metadata": {
    "discord_user_id": "123456789012345678",
    "credits_per_month": "1000"
  },
  "options": {
    "trial_days": 7,
    "coupon_code": "WELCOME10",
    "allow_promotion_codes": true
  }
}
```

**Parametres requis:**
- `project_id`: ID du projet (doit exister dans SQLite)
- `price_id`: ID du prix Stripe
- `customer_email`: Email du client
- `urls.success`: URL de redirection succes
- `urls.cancel`: URL de redirection annulation

**Options:**
| Option | Type | Description |
|--------|------|-------------|
| trial_days | number | Jours d'essai gratuit |
| coupon_code | string | Code coupon a appliquer |
| allow_promotion_codes | boolean | Permettre les codes promo |

**Reponse (Succes):**
```json
{
  "success": true,
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_xxx",
  "session_id": "cs_xxx",
  "expires_at": 1234567890
}
```

**Reponse (Erreur):**
```json
{
  "success": false,
  "error": {
    "code": 404,
    "message": "Project 'unknown' not found or inactive",
    "status": "NOT_FOUND"
  }
}
```

---

### 4. subscription-cancel

**Endpoint:** `POST /webhook/subscription-cancel`

**Description:** Annule un abonnement (immediatement ou a la fin de la periode).

**Body:**
```json
{
  "project_id": "torah",
  "stripe_subscription_id": "sub_xxx",
  "cancel_immediately": false
}
```

**Comportement:**
- `cancel_immediately: false` (defaut): L'abonnement reste actif jusqu'a la fin de la periode en cours
- `cancel_immediately: true`: L'abonnement est annule immediatement

**Reponse (Succes):**
```json
{
  "success": true,
  "subscription_id": "sub_xxx",
  "status": "canceled",
  "cancel_at_period_end": true,
  "canceled_at": 1234567890,
  "current_period_end": 1234567890
}
```

---

### 5. subscription-change-plan

**Endpoint:** `POST /webhook/subscription-change-plan`

**Description:** Upgrade ou downgrade d'un abonnement vers un nouveau plan/prix.

**Body:**
```json
{
  "project_id": "torah",
  "stripe_subscription_id": "sub_xxx",
  "new_price_id": "price_yyy",
  "proration_behavior": "create_prorations"
}
```

**Proration behaviors:**
| Valeur | Description |
|--------|-------------|
| `create_prorations` | (defaut) Calcule et applique le prorata |
| `none` | Pas de prorata, changement a la prochaine facturation |
| `always_invoice` | Cree une facture immediatement |

**Reponse (Succes):**
```json
{
  "success": true,
  "subscription_id": "sub_xxx",
  "status": "active",
  "new_price_id": "price_yyy",
  "current_period_end": 1234567890,
  "latest_invoice": "in_xxx"
}
```

---

### 6. subscription-webhook-handler

**Endpoint:** `POST /webhook/stripe-events`

**Description:** Handler de webhooks generique avec verification HMAC signature et routage vers callbacks. Alternative au stripe-webhook-handler pour les projets autonomes.

**Flow:**
```
1. Webhook Stripe -> Parse Payload -> Extraire project_id des metadata
2. Recuperer webhook_secret depuis SQLite
3. Verifier signature HMAC (Stripe-Signature header)
4. Router vers le callback approprie
5. Retourner 200 OK a Stripe
```

**Events geres:**
| Evenement | Callback | Description |
|-----------|----------|-------------|
| `checkout.session.completed` | callback_success | Nouveau checkout complete |
| `invoice.payment_succeeded` | callback_renewal | Paiement reussi |
| `invoice.payment_failed` | callback_failure | Echec de paiement |
| `customer.subscription.deleted` | callback_cancel | Abonnement supprime |
| `customer.subscription.updated` | callback_success | Abonnement modifie |

**Payload envoye aux callbacks:**
```json
{
  "event_type": "checkout.session.completed",
  "event_id": "evt_xxx",
  "project_id": "torah",
  "timestamp": "2026-01-06T00:00:00Z",
  "data": {
    "customer_id": "cus_xxx",
    "customer_email": "user@example.com",
    "subscription_id": "sub_xxx",
    "payment_status": "paid",
    "amount_total": 999,
    "currency": "eur",
    "metadata": {}
  }
}
```

**Headers envoyes aux callbacks:**
- `Content-Type: application/json`
- `X-Stripe-Event-Id: evt_xxx`
- `X-Stripe-Event-Type: checkout.session.completed`

---

## Structure d'erreur commune

Toutes les endpoints retournent les erreurs au format:

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Description de l'erreur",
    "status": "BAD_REQUEST|NOT_FOUND|STRIPE_ERROR"
  }
}
```

---

## Tableau recapitulatif

| Workflow | Method | Path | Description |
|----------|--------|------|-------------|
| stripe-webhook-handler | POST | `/stripe-webhook/{project_id}` | Handler webhooks (event_id verify) |
| stripe-register-project | POST | `/stripe-register-project` | Enregistrer credentials Redis |
| subscription-checkout-create | POST | `/subscription-checkout-create` | Creer session Checkout |
| subscription-cancel | POST | `/subscription-cancel` | Annuler abonnement |
| subscription-change-plan | POST | `/subscription-change-plan` | Changer de plan |
| subscription-webhook-handler | POST | `/stripe-events` | Handler webhooks (HMAC verify) |

---

## Configuration requise

### SQLite (pour subscription-*)

Les workflows `subscription-*` utilisent SQLite pour stocker les configurations projet:

```sql
CREATE TABLE stripe_projects (
  project_id TEXT PRIMARY KEY,
  display_name TEXT,
  secret_key TEXT NOT NULL,
  webhook_secret TEXT,
  prices TEXT,  -- JSON array of price IDs
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Credential n8n:** `Stripe Config DB` pointant vers `data/stripe-config.db`

### Redis (pour stripe-webhook-handler)

Le workflow `stripe-webhook-handler` utilise Redis (DB 2) pour stocker les credentials:

```bash
redis-cli -h host3.local -p 6381 -n 2

SET "project:{project_id}" '{
  "webhook_secret": "whsec_xxx",
  "api_key": "sk_live_xxx",
  "display_name": "Nom du projet",
  "registered_at": "2026-01-06T00:00:00Z"
}'
```

---

## Metadata Stripe requises

Lors de la creation d'une Checkout Session, inclure ces metadata:

```javascript
const session = await stripe.checkout.sessions.create({
  // ... autres parametres
  metadata: {
    project_id: "torah",                  // ID du projet
    discord_user_id: "123456789012345678", // ID Discord
    credits_per_month: "1000",             // Credits mensuels
    callback_success: "http://...",        // URL callback success
    callback_renewal: "http://...",        // URL callback renewal
    callback_failure: "http://...",        // URL callback failure
    callback_cancel: "http://..."          // URL callback cancel
  },
  subscription_data: {
    metadata: {
      // Memes metadata pour les evenements subscription
      discord_user_id: "123456789012345678",
      credits_per_month: "1000"
    }
  }
});
```

---

## Choix du workflow

| Scenario | Workflow recommande |
|----------|---------------------|
| Projet integre (Torah, MCP) | stripe-webhook-handler |
| Nouveau projet autonome | subscription-webhook-handler |
| Gestion complete via n8n | subscription-checkout-create + subscription-cancel + subscription-change-plan |

---

## Differences entre les handlers

| Caracteristique | stripe-webhook-handler | subscription-webhook-handler |
|-----------------|------------------------|------------------------------|
| Verification | Via API (event_id lookup) | HMAC signature locale |
| Stockage config | Redis | SQLite |
| project_id | Dans URL path | Dans metadata |
| Callbacks | Appelle API Credits directement | Route vers URLs configurees |
| Cas d'usage | Projets integres | Projets autonomes |

---

*Document genere le 2026-01-06*
