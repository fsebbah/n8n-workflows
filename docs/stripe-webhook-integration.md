# Stripe Webhook Integration - Guide Plugin

## Architecture

```
┌─────────────┐     ┌─────────┐     ┌─────────┐     ┌───────────┐     ┌─────────────┐
│   Stripe    │────▶│  nginx  │────▶│   n8n   │────▶│ Torah API │────▶│ Stripe API  │
│  Webhooks   │     │ (proxy) │     │ workflow│     │  /verify  │     │ (validate)  │
└─────────────┘     └─────────┘     └─────────┘     └───────────┘     └─────────────┘
                                          │
                                          ▼
                                    ┌───────────┐
                                    │ Torah API │
                                    │ /credits  │
                                    └───────────┘
```

## Webhook URL

```
https://stripe.azy.solutions/webhook/stripe-webhook/{project_id}
```

Exemple pour le projet `torah-fun`:
```
https://stripe.azy.solutions/webhook/stripe-webhook/torah-fun
```

## Configuration Stripe Dashboard

1. Aller dans **Developers > Webhooks**
2. Ajouter un endpoint avec l'URL ci-dessus
3. Selectionner les evenements:
   - `checkout.session.completed`
   - `invoice.paid`
   - `customer.subscription.deleted`
4. Noter le **Signing Secret** (`whsec_xxx`)

## Configuration Redis

Le projet doit etre enregistre dans Redis (DB 2) avec:

```bash
redis-cli -h host3.local -p 6381 -n 2

SET "project:{project_id}" '{
  "webhook_secret": "whsec_xxx",
  "api_key": "sk_live_xxx",
  "display_name": "Nom du projet",
  "registered_at": "2026-01-05T00:00:00Z"
}'
```

**Important**: `api_key` est necessaire pour la verification via l'API Stripe.

## Metadata Stripe Requises

Lors de la creation d'une Checkout Session, inclure ces metadata:

```javascript
const session = await stripe.checkout.sessions.create({
  // ... autres parametres
  metadata: {
    discord_user_id: "123456789012345678",  // ID Discord de l'utilisateur
    credits_per_month: "1000"                // Nombre de credits mensuels
  },
  subscription_data: {
    metadata: {
      discord_user_id: "123456789012345678",
      credits_per_month: "1000"
    }
  }
});
```

## Evenements Geres

| Evenement | Action | Description |
|-----------|--------|-------------|
| `checkout.session.completed` | `set` | Initialise les credits (nouveau subscriber) |
| `invoice.paid` | `credit` | Ajoute credits (renouvellement mensuel) |
| `customer.subscription.deleted` | `set` | Remet credits a 0 (annulation) |

## Flow de Verification

1. Stripe envoie l'evenement au webhook
2. n8n extrait `event_id` du body
3. n8n appelle `POST /api/stripe/verify/{project_id}` avec `{ "event_id": "evt_xxx" }`
4. Torah API appelle l'API Stripe pour verifier que l'evenement existe
5. Si valide, n8n traite l'evenement et appelle l'API Credits

## Test avec Stripe CLI

```bash
# Terminal 1: Ecouter les webhooks
stripe listen --forward-to https://stripe.azy.solutions/webhook/stripe-webhook/torah-fun

# Terminal 2: Declencher un evenement
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger customer.subscription.deleted
```

## Reponses Attendues

**Succes (200)**:
```json
{"received": true}
```

**Erreur validation (400)**:
```json
{"error": {"code": 400, "message": "Event Stripe invalide"}}
```

**Signature invalide (401)**:
```json
{"error": {"code": 401, "message": "Invalid signature"}}
```

## API Credits (appelees par n8n)

### Set Credits
```
POST /api/webhook/account/set
X-Project-ID: torah-fun

{
  "discord_user_id": "123456789",
  "credits_remaining": 1000,
  "credits_total": 1000
}
```

### Add Credits (renouvellement)
```
POST /api/webhook/account/credit
X-Project-ID: torah-fun

{
  "discord_user_id": "123456789",
  "amount": 1000,
  "reason": "renewal"
}
```

## Checklist Integration Plugin

- [ ] Configurer webhook dans Stripe Dashboard
- [ ] Ajouter `api_key` et `webhook_secret` dans Redis
- [ ] Inclure `discord_user_id` dans metadata Checkout Session
- [ ] Inclure `credits_per_month` dans metadata
- [ ] Tester avec Stripe CLI
- [ ] Verifier que les credits sont mis a jour dans Discord

## Contact

- **n8n Workflow**: `STRIPE - Webhook Handler` (ID: ugNi9V1Zmxo0MER3)
- **PR**: #190 (merged)
