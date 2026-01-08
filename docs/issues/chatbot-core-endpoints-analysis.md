# Analyse des Endpoints - Retour Equipe Chatbot-Core

**Date:** 2026-01-08
**Version:** 1.0
**Statut:** En cours de validation

---

## Contexte

L'equipe chatbot-core a analyse les 14 endpoints n8n disponibles et identifie 4 endpoints qu'ils n'utilisent pas.

## Retour de l'equipe Chatbot-Core

| Endpoint | Raison |
|----------|--------|
| `discord-get-credits` | Alias de discord-get-balance (redondant) |
| `POST /webhook/:project_id` | Gere par n8n (webhooks Stripe) |
| `GET /:project_id/subscription/:action` | Pages HTML navigateur |
| `credits-get` | Non-Discord, pas necessaire |

---

## Analyse

### Classification des endpoints

#### Endpoints utilises par le bot (6)

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `/webhook/discord-subscribe` | POST | Cree une session Stripe Checkout |
| `/webhook/discord-billing-portal` | POST | Cree une session Billing Portal |
| `/webhook/discord-get-plans` | GET | Liste les plans disponibles |
| `/webhook/discord-get-subscriber` | GET | Verifie le statut d'abonnement |
| `/webhook/discord-get-balance` | GET | Recupere le solde de credits |
| `/webhook/discord-get-transactions` | GET | Historique des transactions |

#### Endpoints infrastructure (2) - A NE PAS SUPPRIMER

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `/webhook/:project_id` | POST | Recoit les webhooks Stripe (paiements, abonnements) |
| `/webhook/subscription-result` | GET | Page HTML apres checkout/portal |

**Note:** Ces endpoints ne sont pas appeles par le bot mais sont essentiels au fonctionnement du systeme de paiement.

#### Endpoints redondants/inutilises (4) - SUPPRIMABLES

| Endpoint | Methode | Raison |
|----------|---------|--------|
| `/webhook/discord-get-credits` | GET | Alias de discord-get-balance |
| `/webhook/credits-get` | GET | Version generique non utilisee |
| `/webhook/discord-registry` | GET | Info projet (peu utilise) |
| `/webhook/subscription-checkout-create` | POST | Version generique de discord-subscribe |

---

## Schema de Flux Stripe

```
                    FLUX COMPLET D'ABONNEMENT STRIPE
    ================================================================

    ACTEURS:
    [Bot]     = Discord Bot (chatbot-core)
    [User]    = Utilisateur Discord
    [Stripe]  = API Stripe
    [n8n]     = Workflows n8n
    [Browser] = Navigateur de l'utilisateur

    ================================================================

    1. SOUSCRIPTION
    ---------------

    [User]                [Bot]                  [n8n]                 [Stripe]
      |                     |                      |                      |
      | /subscribe          |                      |                      |
      |-------------------->|                      |                      |
      |                     |                      |                      |
      |                     | POST /discord-subscribe                     |
      |                     |--------------------->|                      |
      |                     |                      |                      |
      |                     |                      | Create Checkout      |
      |                     |                      |--------------------->|
      |                     |                      |                      |
      |                     |                      |<-- checkout_url -----|
      |                     |                      |                      |
      |                     |<-- checkout_url -----|                      |
      |                     |                      |                      |
      |<-- Bouton "Payer" --|                      |                      |
      |                     |                      |                      |


    2. PAIEMENT (dans le navigateur)
    ---------------------------------

    [User]              [Browser]              [Stripe]               [n8n]
      |                     |                      |                      |
      | Clic "Payer"        |                      |                      |
      |-------------------->|                      |                      |
      |                     | checkout.stripe.com  |                      |
      |                     |--------------------->|                      |
      |                     |                      |                      |
      |                     |    [Paiement CB]     |                      |
      |                     |                      |                      |
      |                     |                      | Webhook POST         |
      |                     |                      | /webhook/:project_id |
      |                     |                      |--------------------->|
      |                     |                      |                      |
      |                     |                      |    [Traitement]      |
      |                     |                      |    - Update Redis    |
      |                     |                      |    - Callback bot    |
      |                     |                      |                      |
      |                     | Redirect to          |                      |
      |                     | /subscription-result |                      |
      |                     |<---------------------|                      |
      |                     |                      |                      |
      |                     | GET /subscription-result?                   |
      |                     | project_id=xxx&action=success               |
      |                     |-------------------------------------------->|
      |                     |                      |                      |
      |                     |<------------ Page HTML "Succes" ------------|
      |                     |                      |                      |
      |<-- "Retour Discord" |                      |                      |
      |                     |                      |                      |


    3. VERIFICATION (par le bot)
    ----------------------------

    [User]                [Bot]                  [n8n]
      |                     |                      |
      | /status             |                      |
      |-------------------->|                      |
      |                     |                      |
      |                     | GET /discord-get-subscriber?
      |                     | project_id=xxx&discord_user_id=yyy
      |                     |--------------------->|
      |                     |                      |
      |                     |<-- subscriber info --|
      |                     |                      |
      |<-- "Abonne actif" --|                      |
      |                     |                      |
```

---

## URLs de Test

### Test du webhook subscription-result

```bash
# Page succes
curl "http://pi6.local:5678/webhook/subscription-result?project_id=torah-fun&action=success"

# Page annulation
curl "http://pi6.local:5678/webhook/subscription-result?project_id=torah-fun&action=cancel"

# Page portal
curl "http://pi6.local:5678/webhook/subscription-result?project_id=torah-fun&action=portal"
```

### Test via nginx (production)

```bash
# Via stripe.azy.solutions
curl "https://stripe.azy.solutions/webhook/subscription-result?project_id=torah-fun&action=success"
```

---

## Points de Retour pour Tests

### 1. Logs n8n
```bash
pm2 logs n8n --lines 100
```

### 2. Logs du bot Discord
```bash
pm2 logs torah-bot --lines 100
```

### 3. Dashboard Stripe
- URL: https://dashboard.stripe.com/test/workbench/logs
- Voir les webhooks envoyes et leurs reponses

### 4. Executions n8n
- URL: http://pi6.local:5678/executions
- Voir l'historique des executions de workflows

### 5. Redis (donnees abonnes)
```bash
redis-cli
> GET project:torah-fun
> KEYS subscriber:*
```

---

## Recommandations

### A court terme

1. **Garder** tous les endpoints infrastructure
2. **Tester** le flux complet avec une carte de test Stripe
3. **Documenter** les codes erreur possibles

### A moyen terme

1. **Supprimer** les endpoints redondants:
   - `discord-get-credits`
   - `credits-get`

2. **Evaluer** l'utilite de:
   - `discord-registry`
   - `subscription-checkout-create`

### Cartes de test Stripe

| Scenario | Numero de carte |
|----------|-----------------|
| Paiement reussi | 4242 4242 4242 4242 |
| Paiement refuse | 4000 0000 0000 0002 |
| Authentification 3DS | 4000 0025 0000 3155 |

---

## Contact

- **n8n workflows:** Repository n8n-workflows
- **Chatbot-core:** Equipe framework Discord
- **Tests Stripe:** Dashboard Stripe (mode test)
