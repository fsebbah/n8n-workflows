# Subscription Flow - Analyse et Spécifications

**Date:** 2026-01-07
**Status:** En cours d'analyse
**Équipes concernées:** Chatbot Core, Plugins

---

## 1. Problèmes Identifiés

### Problème 1: `/subscribe` crée un compte Free au lieu de rediriger vers Stripe

**Comportement actuel:**
```
User: /subscribe email@test.com
Bot: Crée compte FREE automatiquement
Bot: "Vous avez déjà un compte"
```

**Comportement attendu:**
```
User: /subscribe
Bot: Redirige vers page Stripe avec tous les plans
User: Choisit son plan sur Stripe
Stripe: Gère le paiement et callback
```

### Problème 2: `/plan` affiche les plans mais ne permet pas de changer

**Comportement actuel:**
```
User: /plan
Bot: Affiche liste des plans (informatif seulement)
Bot: Aucune action possible
```

**Comportement attendu:**
```
User: /plan
Bot: Affiche plan actuel + lien pour changer
User: Clique sur "Changer de plan"
Bot: Redirige vers Stripe Billing Portal ou Checkout
```

---

## 2. Architecture Actuelle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DISCORD                                         │
│  ┌─────────┐                                                                │
│  │  User   │                                                                │
│  └────┬────┘                                                                │
│       │ /subscribe, /plan, /credits                                         │
│       ▼                                                                     │
│  ┌─────────────────┐                                                        │
│  │  Discord Bot    │                                                        │
│  │  (Chatbot Core) │                                                        │
│  └────────┬────────┘                                                        │
└───────────┼─────────────────────────────────────────────────────────────────┘
            │ HTTP Requests
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              N8N WORKFLOWS                                   │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ discord-get-plans│  │ discord-subscribe│  │discord-get-      │          │
│  │                  │  │                  │  │subscriber        │          │
│  │ GET /plans       │  │ POST /subscribe  │  │ GET /subscriber  │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
│           │                     │                     │                     │
└───────────┼─────────────────────┼─────────────────────┼─────────────────────┘
            │                     │                     │
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXTERNAL SERVICES                                  │
│                                                                             │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐       │
│  │   STRIPE    │           │   STRIPE    │           │ TORAH API   │       │
│  │  Products   │           │  Checkout   │           │ /subscription│       │
│  │    API      │           │   Session   │           │   /status   │       │
│  └─────────────┘           └─────────────┘           └─────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Workflows N8N - Spécifications API

### 3.1 GET /webhook/discord-get-plans

**Description:** Récupère la liste des plans actifs depuis Stripe

**Input:**
```
Query Parameters:
  - project_id (required): "torah-fun"
```

**Output:**
```json
{
  "success": true,
  "project_id": "torah-fun",
  "plans_count": 5,
  "plans": [
    {
      "id": "price_xxx",
      "product_id": "prod_xxx",
      "name": "Free",
      "description": null,
      "price": 0,
      "currency": "eur",
      "interval": "month",
      "credits_per_month": 10,
      "features": []
    },
    {
      "id": "price_yyy",
      "product_id": "prod_yyy",
      "name": "Premium",
      "price": 19,
      "currency": "eur",
      "interval": "month",
      "credits_per_month": 1000,
      "features": ["Traductions illimitées", "Support prioritaire"]
    }
  ]
}
```

**Status:** ✅ Fonctionnel

---

### 3.2 POST /webhook/discord-subscribe

**Description:** Crée une session Stripe Checkout pour un plan donné

**Input:**
```json
{
  "project_id": "torah-fun",
  "discord_user_id": "123456789",
  "plan_id": "price_xxx"
}
```

**Output:**
```json
{
  "success": true,
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_xxx",
  "session_id": "cs_xxx",
  "project_id": "torah-fun",
  "discord_user_id": "123456789",
  "plan_id": "price_xxx",
  "expires_at": "2026-01-08T18:49:28.000Z"
}
```

**Status:** ✅ Fonctionnel

---

### 3.3 GET /webhook/discord-get-subscriber

**Description:** Récupère les informations d'abonnement d'un utilisateur

**Input:**
```
Query Parameters:
  - project_id (required): "torah-fun"
  - discord_user_id (required): "123456789"
```

**Output (utilisateur existant):**
```json
{
  "success": true,
  "subscriber": {
    "discord_user_id": "123456789",
    "discord_username": "user#1234",
    "email": "user@example.com",
    "plan_id": "premium",
    "subscription_status": "active",
    "subscription_plan": "premium",
    "credits_remaining": 850,
    "credits_total": 1000,
    "is_active": true
  }
}
```

**Output (nouvel utilisateur - 404 géré):**
```json
{
  "success": true,
  "subscriber": {
    "discord_user_id": "123456789",
    "subscription_plan": "free",
    "subscription_status": "none",
    "credits_remaining": 0,
    "is_active": false
  }
}
```

**Status:** ✅ Fonctionnel

---

## 4. Flow Attendu - Commande `/subscribe`

### 4.1 Diagramme de Séquence

```
┌──────┐          ┌───────────┐          ┌─────────┐          ┌────────┐
│ User │          │Discord Bot│          │   N8N   │          │ Stripe │
└──┬───┘          └─────┬─────┘          └────┬────┘          └───┬────┘
   │                    │                     │                   │
   │  /subscribe        │                     │                   │
   │───────────────────>│                     │                   │
   │                    │                     │                   │
   │                    │ POST /discord-subscribe                 │
   │                    │ {project_id, discord_user_id}           │
   │                    │────────────────────>│                   │
   │                    │                     │                   │
   │                    │                     │ Create Checkout   │
   │                    │                     │ (mode: subscription)
   │                    │                     │──────────────────>│
   │                    │                     │                   │
   │                    │                     │   checkout_url    │
   │                    │                     │<──────────────────│
   │                    │                     │                   │
   │                    │    checkout_url     │                   │
   │                    │<────────────────────│                   │
   │                    │                     │                   │
   │  "Choisissez votre │                     │                   │
   │   plan: [URL]"     │                     │                   │
   │<───────────────────│                     │                   │
   │                    │                     │                   │
   │  Clique sur URL    │                     │                   │
   │─────────────────────────────────────────────────────────────>│
   │                    │                     │                   │
   │         Page Stripe Checkout (affiche tous les plans)        │
   │<─────────────────────────────────────────────────────────────│
   │                    │                     │                   │
```

### 4.2 Option Stripe Pricing Table

Stripe propose une **Pricing Table** intégrable qui affiche tous les plans:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Choisissez votre plan                        │
├─────────────┬─────────────┬─────────────┬─────────────┬────────┤
│    FREE     │  DAY YOMI   │  DA YOMI+   │   AVANCÉ    │PREMIUM │
│    0€/mois  │   5€/mois   │   9€/mois   │   9€/mois   │19€/mois│
├─────────────┼─────────────┼─────────────┼─────────────┼────────┤
│ 10 credits  │ 100 credits │ 200 credits │ 500 credits │Illimité│
│             │             │             │             │        │
│ [Gratuit]   │ [Choisir]   │ [Choisir]   │ [Choisir]   │[Choisir│
└─────────────┴─────────────┴─────────────┴─────────────┴────────┘
```

**Configuration Stripe Dashboard:**
1. Products → Pricing Tables → Create
2. Ajouter les 5 produits
3. Récupérer l'URL de la Pricing Table
4. Utiliser cette URL dans le bot

---

## 5. Flow Attendu - Commande `/plan`

### 5.1 Diagramme de Séquence

```
┌──────┐          ┌───────────┐          ┌─────────┐          ┌────────┐
│ User │          │Discord Bot│          │   N8N   │          │ Stripe │
└──┬───┘          └─────┬─────┘          └────┬────┘          └───┬────┘
   │                    │                     │                   │
   │  /plan             │                     │                   │
   │───────────────────>│                     │                   │
   │                    │                     │                   │
   │                    │ GET /discord-get-subscriber             │
   │                    │────────────────────>│                   │
   │                    │                     │                   │
   │                    │  subscriber info    │                   │
   │                    │<────────────────────│                   │
   │                    │                     │                   │
   │                    │ GET /discord-get-plans                  │
   │                    │────────────────────>│                   │
   │                    │                     │                   │
   │                    │     plans list      │                   │
   │                    │<────────────────────│                   │
   │                    │                     │                   │
   │  "Plan actuel: Day Yomi (5€/mois)        │                   │
   │   Credits: 45/100                        │                   │
   │   [Voir les plans] [Gérer abonnement]"   │                   │
   │<───────────────────│                     │                   │
   │                    │                     │                   │
   │  Clique "Gérer"    │                     │                   │
   │───────────────────>│                     │                   │
   │                    │                     │                   │
   │                    │ Create Billing Portal Session           │
   │                    │────────────────────────────────────────>│
   │                    │                     │                   │
   │                    │      portal_url     │                   │
   │                    │<────────────────────────────────────────│
   │                    │                     │                   │
   │  [URL Portal]      │                     │                   │
   │<───────────────────│                     │                   │
   │                    │                     │                   │
```

### 5.2 Stripe Billing Portal

Pour les utilisateurs existants, Stripe propose un **Customer Portal** qui permet:
- Voir l'abonnement actuel
- Changer de plan (upgrade/downgrade)
- Mettre à jour le moyen de paiement
- Annuler l'abonnement

**Nouveau workflow nécessaire:** `discord-billing-portal`

```
POST /webhook/discord-billing-portal
Input: { project_id, discord_user_id }
Output: { portal_url: "https://billing.stripe.com/session/xxx" }
```

---

## 6. Actions Requises

### 6.1 Équipe Chatbot Core

| Priorité | Action | Description |
|----------|--------|-------------|
| P0 | Fix `/subscribe` | Ne pas créer de compte Free. Rediriger vers Stripe |
| P0 | Fix `/plan` | Ajouter bouton "Changer de plan" → checkout_url |
| P1 | Intégrer Billing Portal | Pour gestion abonnement existant |

**Changements de logique:**

```python
# AVANT (problématique)
@bot.command()
async def subscribe(ctx, email):
    create_free_account(email)  # ❌ NE PAS FAIRE
    return "Compte créé"

# APRÈS (correct)
@bot.command()
async def subscribe(ctx):
    # Option 1: Rediriger vers Pricing Table Stripe
    pricing_url = "https://billing.stripe.com/p/pricing/xxx"
    return f"Choisissez votre plan: {pricing_url}"

    # Option 2: Créer checkout avec plan par défaut
    result = await n8n.discord_subscribe(
        project_id="torah-fun",
        discord_user_id=str(ctx.author.id),
        plan_id="price_default"  # Plan recommandé
    )
    return f"Finalisez votre abonnement: {result['checkout_url']}"
```

### 6.2 Équipe Plugins (N8N)

| Priorité | Action | Description |
|----------|--------|-------------|
| P1 | Créer workflow Billing Portal | `discord-billing-portal` |
| P2 | Ajouter Pricing Table URL | Dans config Redis par projet |

**Nouveau workflow `discord-billing-portal`:**

```
POST /webhook/discord-billing-portal

Input:
{
  "project_id": "torah-fun",
  "discord_user_id": "123456789"
}

Flow:
1. Récupérer stripe_customer_id depuis Torah API
2. Créer session Stripe Billing Portal
3. Retourner portal_url

Output:
{
  "success": true,
  "portal_url": "https://billing.stripe.com/session/xxx"
}
```

---

## 7. Configuration Stripe Recommandée

### 7.1 Pricing Table

1. Stripe Dashboard → Products → Pricing Tables
2. Create new pricing table
3. Ajouter les 5 plans (Free, Day Yomi, Da Yomi+, Avancé, Premium)
4. Configurer:
   - `success_url`: `https://torah-fun.solutions/subscription/success`
   - `cancel_url`: `https://torah-fun.solutions/subscription/cancel`
5. Copier l'URL de la pricing table

### 7.2 Customer Portal

1. Stripe Dashboard → Settings → Billing → Customer Portal
2. Activer les fonctionnalités:
   - [x] Update subscriptions (upgrade/downgrade)
   - [x] Cancel subscriptions
   - [x] Update payment methods
   - [x] View invoices
3. Configurer les plans disponibles pour upgrade/downgrade

---

## 8. Résumé

| Composant | Status | Action |
|-----------|--------|--------|
| N8N discord-get-plans | ✅ OK | - |
| N8N discord-subscribe | ✅ OK | - |
| N8N discord-get-subscriber | ✅ OK | - |
| N8N discord-billing-portal | ❌ Manquant | À créer |
| Bot /subscribe | ❌ Bugué | Fix requis |
| Bot /plan | ❌ Incomplet | Fix requis |
| Stripe Pricing Table | ❌ Non configuré | À configurer |
| Stripe Customer Portal | ❓ À vérifier | Configurer si besoin |
