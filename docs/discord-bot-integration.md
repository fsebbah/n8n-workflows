# Integration Bot Discord - Workflows n8n

## Contexte

Ce document décrit l'intégration entre les commandes du bot Discord et les workflows n8n pour la gestion des abonnements, crédits, etc.

**Objectif :** Remplacer les accès directs PostgreSQL du bot par des appels aux webhooks n8n.

---

## 1. Vue d'ensemble

### Statut des workflows

| Statut | Description |
|--------|-------------|
| ✅ EXISTE | Workflow déjà créé dans `workflows/Stripe/` |
| ❌ A CRÉER | Workflow à développer (spec dans ce document) |

### Correspondance commandes ↔ workflows

| Commande Bot | Action Actuelle | Workflow n8n | Statut |
|--------------|-----------------|--------------|--------|
| `/plans` | Dictionnaire PLANS en dur | `DISCORD - Get Plans` | ❌ A CRÉER |
| `/plan` | SELECT/UPDATE PostgreSQL | `DISCORD - Get Subscriber` | ❌ A CRÉER |
| `/credits` | SELECT PostgreSQL | `DISCORD - Get Subscriber` | ❌ A CRÉER |
| `/solde` | SELECT PostgreSQL | `DISCORD - Get Balance` | ❌ A CRÉER |
| `/account` | SELECT PostgreSQL | `DISCORD - Get Transactions` | ❌ A CRÉER |
| `/subscribe` | INSERT PostgreSQL | `Stripe - Subscription Checkout Create` | ✅ EXISTE |

---

## 2. Workflows EXISTANTS (Stripe)

Ces workflows **existent déjà** dans `workflows/Stripe/` et gèrent l'interaction avec l'API Stripe.

| Workflow | Fichier | Webhook |
|----------|---------|---------|
| `Stripe - Subscription Checkout Create` | `subscription-checkout-create.json` | `POST /webhook/subscription-checkout-create` |
| `Stripe - Subscription Change Plan` | `subscription-change-plan.json` | `POST /webhook/subscription-change-plan` |
| `Stripe - Subscription Cancel` | `subscription-cancel.json` | `POST /webhook/subscription-cancel` |
| `Stripe - Subscription Webhook Handler` | `subscription-webhook-handler.json` | `POST /webhook/stripe-events` |

**Note :** Ces workflows sont fonctionnels et ne nécessitent pas de modification.

---

## 3. Workflows À CRÉER (Discord)

Les workflows suivants **n'existent pas encore**. Cette section décrit les spécifications pour leur développement.

Ils seront créés dans `workflows/Discord/`

### 3.1 DISCORD - Registry

**Fichier:** `workflows/Discord/discord-registry.json`

**Webhook:** `GET /webhook/discord-registry`

**Description:** Liste tous les workflows Discord disponibles.

**Réponse:**
```json
{
  "version": "1.0",
  "updated_at": "2025-01-05T...",
  "n8n": {
    "host": "pi6.local",
    "port": 5678,
    "webhook_base": "http://pi6.local:5678/webhook"
  },
  "total_tools": 6,
  "tools": {
    "discord-get-plans": { ... },
    "discord-get-subscriber": { ... },
    ...
  }
}
```

---

### 3.2 DISCORD - Get Plans

**Fichier:** `workflows/Discord/discord-get-plans.json`

**Webhook:** `GET /webhook/discord-get-plans`

**Commande bot:** `/plans`

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | string | Oui | ID du projet (ex: `torah`) |

**Réponse:**
```json
{
  "success": true,
  "project_id": "torah",
  "plans": [
    {
      "id": "free",
      "name": "Free",
      "price_id": null,
      "price": 0,
      "currency": "EUR",
      "credits_per_month": 100,
      "features": ["Basic access"]
    },
    {
      "id": "premium",
      "name": "Premium",
      "price_id": "price_xxx",
      "price": 9.99,
      "currency": "EUR",
      "credits_per_month": 1000,
      "features": ["Priority support", "Advanced features"]
    }
  ]
}
```

**Source de données:** SQLite `stripe_projects.prices` (JSON)

---

### 3.3 DISCORD - Get Subscriber

**Fichier:** `workflows/Discord/discord-get-subscriber.json`

**Webhook:** `GET /webhook/discord-get-subscriber`

**Commandes bot:** `/plan`, `/credits`

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | string | Oui | ID du projet |
| `discord_user_id` | string | Oui | ID Discord de l'utilisateur |

**Réponse:**
```json
{
  "success": true,
  "subscriber": {
    "id": 123,
    "discord_user_id": "123456789",
    "email": "user@example.com",
    "plan_id": "premium",
    "stripe_customer_id": "cus_xxx",
    "stripe_subscription_id": "sub_xxx",
    "credits_remaining": 850,
    "credits_total": 1000,
    "subscription_status": "active",
    "current_period_end": "2025-02-01T00:00:00Z"
  }
}
```

**Source de données:** PostgreSQL `subscribers`

---

### 3.4 DISCORD - Get Balance

**Fichier:** `workflows/Discord/discord-get-balance.json`

**Webhook:** `GET /webhook/discord-get-balance`

**Commande bot:** `/solde`

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | string | Oui | ID du projet |
| `discord_user_id` | string | Oui | ID Discord de l'utilisateur |

**Réponse:**
```json
{
  "success": true,
  "balance": {
    "credits_remaining": 850,
    "credits_total": 1000,
    "credits_used": 150,
    "usage_percent": 15,
    "renewal_date": "2025-02-01T00:00:00Z",
    "recent_transactions": [
      {
        "type": "usage",
        "amount": -10,
        "description": "Translation: Berakhot 2a",
        "created_at": "2025-01-04T10:00:00Z"
      }
    ]
  }
}
```

**Source de données:** PostgreSQL `subscribers` + `transactions`

---

### 3.5 DISCORD - Get Transactions

**Fichier:** `workflows/Discord/discord-get-transactions.json`

**Webhook:** `GET /webhook/discord-get-transactions`

**Commande bot:** `/account`

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | string | Oui | ID du projet |
| `discord_user_id` | string | Oui | ID Discord |
| `limit` | number | Non | Max résultats (défaut: 20) |
| `offset` | number | Non | Pagination (défaut: 0) |

**Réponse:**
```json
{
  "success": true,
  "transactions": [
    {
      "id": 456,
      "type": "credit",
      "amount": 1000,
      "description": "Monthly renewal - Premium",
      "created_at": "2025-01-01T00:00:00Z"
    },
    {
      "id": 455,
      "type": "usage",
      "amount": -10,
      "description": "Translation: Berakhot 2a",
      "created_at": "2024-12-30T15:00:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

**Source de données:** PostgreSQL `transactions`

---

## 4. Gestion des credentials

### Principe fondamental

**JAMAIS de credentials en dur dans les workflows.**

### Comment passer les credentials

#### Pour le bot Discord

Le bot passe uniquement des identifiants (pas de secrets) :
```json
{
  "project_id": "torah",
  "discord_user_id": "123456789"
}
```

#### Pour les workflows n8n

Les workflows récupèrent les secrets via :

1. **SQLite** (`stripe-config.db`) pour les clés Stripe par projet
2. **Credentials n8n** pour PostgreSQL
3. **Variables d'environnement** pour les configurations globales

### Credentials requis dans n8n

| Credential Name | Type | Usage |
|-----------------|------|-------|
| `Stripe Config DB` | SQLite | Lecture `stripe_projects` |
| `PostgreSQL Subscribers` | PostgreSQL | Lecture `subscribers`, `transactions` |
| `Header Auth n8n` | HTTP Header | Appels API n8n internes |

---

## 5. Implementation côté Bot

### Client Python

```python
import aiohttp
from typing import Optional, Dict, Any

class DiscordN8nClient:
    """Client pour les workflows n8n Discord."""

    def __init__(self, base_url: str = "http://pi6.local:5678"):
        self.base_url = base_url
        self.webhook_base = f"{base_url}/webhook"

    async def _get(self, endpoint: str, params: Dict) -> Dict[str, Any]:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.webhook_base}/{endpoint}",
                params=params
            ) as response:
                return await response.json()

    async def _post(self, endpoint: str, data: Dict) -> Dict[str, Any]:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.webhook_base}/{endpoint}",
                json=data
            ) as response:
                return await response.json()

    # ==================== Nouveaux workflows Discord ====================

    async def get_plans(self, project_id: str) -> Dict[str, Any]:
        """GET /webhook/discord-get-plans"""
        return await self._get("discord-get-plans", {
            "project_id": project_id
        })

    async def get_subscriber(
        self, project_id: str, discord_user_id: str
    ) -> Dict[str, Any]:
        """GET /webhook/discord-get-subscriber"""
        return await self._get("discord-get-subscriber", {
            "project_id": project_id,
            "discord_user_id": discord_user_id
        })

    async def get_balance(
        self, project_id: str, discord_user_id: str
    ) -> Dict[str, Any]:
        """GET /webhook/discord-get-balance"""
        return await self._get("discord-get-balance", {
            "project_id": project_id,
            "discord_user_id": discord_user_id
        })

    async def get_transactions(
        self,
        project_id: str,
        discord_user_id: str,
        limit: int = 20,
        offset: int = 0
    ) -> Dict[str, Any]:
        """GET /webhook/discord-get-transactions"""
        return await self._get("discord-get-transactions", {
            "project_id": project_id,
            "discord_user_id": discord_user_id,
            "limit": limit,
            "offset": offset
        })

    # ==================== Workflows Stripe existants ====================

    async def create_checkout(
        self,
        project_id: str,
        price_id: str,
        customer_email: str,
        discord_user_id: str,
        success_url: str,
        cancel_url: str
    ) -> Dict[str, Any]:
        """POST /webhook/subscription-checkout-create"""
        return await self._post("subscription-checkout-create", {
            "project_id": project_id,
            "price_id": price_id,
            "customer_email": customer_email,
            "callbacks": {
                "success": f"{self.webhook_base}/discord-sub-success",
                "renewal": f"{self.webhook_base}/discord-sub-renewal",
                "failure": f"{self.webhook_base}/discord-sub-failure",
                "cancel": f"{self.webhook_base}/discord-sub-cancel"
            },
            "urls": {
                "success": success_url,
                "cancel": cancel_url
            },
            "metadata": {
                "discord_user_id": discord_user_id
            }
        })

    async def change_plan(
        self,
        project_id: str,
        stripe_subscription_id: str,
        new_price_id: str
    ) -> Dict[str, Any]:
        """POST /webhook/subscription-change-plan"""
        return await self._post("subscription-change-plan", {
            "project_id": project_id,
            "stripe_subscription_id": stripe_subscription_id,
            "new_price_id": new_price_id
        })

    async def cancel_subscription(
        self,
        project_id: str,
        stripe_subscription_id: str,
        cancel_immediately: bool = False
    ) -> Dict[str, Any]:
        """POST /webhook/subscription-cancel"""
        return await self._post("subscription-cancel", {
            "project_id": project_id,
            "stripe_subscription_id": stripe_subscription_id,
            "cancel_immediately": cancel_immediately
        })
```

### Exemple d'utilisation

```python
@bot.slash_command(name="plans")
async def plans_command(ctx):
    client = DiscordN8nClient()
    result = await client.get_plans("torah")

    if result.get("success"):
        # Afficher les plans...
        pass

@bot.slash_command(name="credits")
async def credits_command(ctx):
    client = DiscordN8nClient()
    result = await client.get_subscriber("torah", str(ctx.author.id))

    if result.get("success"):
        sub = result["subscriber"]
        await ctx.respond(f"Crédits: {sub['credits_remaining']}/{sub['credits_total']}")
```

---

## 6. Résumé des webhooks

### ❌ À CRÉER (Discord)

| Webhook | Méthode | Commande | Fichier |
|---------|---------|----------|---------|
| `/webhook/discord-registry` | GET | Discovery | `workflows/Discord/discord-registry.json` |
| `/webhook/discord-get-plans` | GET | `/plans` | `workflows/Discord/discord-get-plans.json` |
| `/webhook/discord-get-subscriber` | GET | `/plan`, `/credits` | `workflows/Discord/discord-get-subscriber.json` |
| `/webhook/discord-get-balance` | GET | `/solde` | `workflows/Discord/discord-get-balance.json` |
| `/webhook/discord-get-transactions` | GET | `/account` | `workflows/Discord/discord-get-transactions.json` |

### ✅ EXISTANTS (Stripe)

| Webhook | Méthode | Usage | Fichier |
|---------|---------|-------|---------|
| `/webhook/subscription-checkout-create` | POST | `/subscribe` | `workflows/Stripe/subscription-checkout-create.json` |
| `/webhook/subscription-change-plan` | POST | Upgrade/downgrade | `workflows/Stripe/subscription-change-plan.json` |
| `/webhook/subscription-cancel` | POST | Annulation | `workflows/Stripe/subscription-cancel.json` |
| `/webhook/stripe-events` | POST | Webhooks Stripe | `workflows/Stripe/subscription-webhook-handler.json` |

---

## 7. Questions pour l'équipe

1. **Schéma PostgreSQL** : Tables `subscribers` et `transactions` - quel est le schéma exact ?
2. **Multi-projet** : Le bot gère-t-il plusieurs projets ou un seul ?
3. **Callbacks Stripe** : Les workflows `discord-sub-success`, `discord-sub-renewal`, etc. doivent-ils être créés ?
