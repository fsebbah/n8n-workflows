# Integration Bot Discord - Workflows n8n

## Contexte

Ce document décrit l'intégration entre les commandes du bot Discord et les workflows n8n pour la gestion des abonnements, crédits, etc.

**Objectif :** Le bot Discord n'accède **jamais** directement aux bases de données. Toutes les opérations passent par les webhooks n8n.

---

## 1. Architecture Multi-Bot Centralisee

### Schema

```
┌─────────────────┐
│ Bot Torah       │──┐
│ (serveur 1)     │  │
└─────────────────┘  │
                     │     ┌─────────────────────┐     ┌─────────────────┐
┌─────────────────┐  │     │   n8n Workflows     │     │   PostgreSQL    │
│ Bot MCP         │──┼────▶│   (centralise)      │────▶│   (centralise)  │
│ (serveur 2)     │  │     │   pi6.local:5678    │     │   subscribers   │
└─────────────────┘  │     └─────────────────────┘     └─────────────────┘
                     │              │
┌─────────────────┐  │              ▼
│ Bot X           │──┘     ┌─────────────────┐
│ (serveur 3)     │        │   Stripe API    │
└─────────────────┘        │   (par projet)  │
                           └─────────────────┘
```

### Principes cles

| Principe | Description |
|----------|-------------|
| **Multi-tenant** | Plusieurs bots peuvent appeler les memes workflows via `project_id` |
| **Pas d'acces direct DB** | Le bot ne connait pas PostgreSQL, il passe par n8n |
| **Plans depuis Stripe** | Les plans sont recuperes en temps reel depuis l'API Stripe |
| **Centralisation** | n8n est le point d'entree unique pour toutes les operations |

### Sources de donnees

| Donnee | Source | Raison |
|--------|--------|--------|
| Plans/Prix | **Stripe API** | Source de verite, temps reel |
| Config Stripe (cles) | SQLite `stripe_projects` | Config multi-tenant |
| Subscribers | PostgreSQL | Donnees utilisateurs |
| Transactions | PostgreSQL | Historique |

---

## 2. Vue d'ensemble des workflows

### Statut

| Statut | Description |
|--------|-------------|
| ✅ EXISTE | Workflow deja cree |
| ❌ A CREER | Workflow a developper |

### Correspondance commandes - workflows

| Commande Bot | Workflow n8n | Source | Statut |
|--------------|--------------|--------|--------|
| `/plans` | `DISCORD - Get Plans` | **Stripe API** | ❌ A CREER |
| `/plan` | `DISCORD - Get Subscriber` | PostgreSQL (via n8n) | ❌ A CREER |
| `/credits` | `DISCORD - Get Subscriber` | PostgreSQL (via n8n) | ❌ A CREER |
| `/solde` | `DISCORD - Get Balance` | PostgreSQL (via n8n) | ❌ A CREER |
| `/account` | `DISCORD - Get Transactions` | PostgreSQL (via n8n) | ❌ A CREER |
| `/subscribe` | `Stripe - Subscription Checkout Create` | Stripe API | ✅ EXISTE |

---

## 3. Workflows EXISTANTS (Stripe)

Ces workflows **existent deja** dans `workflows/Stripe/` :

| Workflow | Webhook | Usage |
|----------|---------|-------|
| `Stripe - Subscription Checkout Create` | `POST /webhook/subscription-checkout-create` | Creer session Stripe |
| `Stripe - Subscription Change Plan` | `POST /webhook/subscription-change-plan` | Changer de plan |
| `Stripe - Subscription Cancel` | `POST /webhook/subscription-cancel` | Annuler abonnement |
| `Stripe - Subscription Webhook Handler` | `POST /webhook/stripe-events` | Recevoir evenements Stripe |

---

## 4. Workflows A CREER (Discord)

### 4.1 DISCORD - Registry

**Fichier:** `workflows/Discord/discord-registry.json`

**Webhook:** `GET /webhook/discord-registry`

**Description:** Liste tous les workflows Discord disponibles.

**Reponse:**
```json
{
  "version": "1.0",
  "updated_at": "2025-01-05T...",
  "n8n": {
    "host": "pi6.local",
    "port": 5678,
    "webhook_base": "http://pi6.local:5678/webhook"
  },
  "total_tools": 5,
  "tools": {
    "discord-get-plans": { "method": "GET", "command": "/plans" },
    "discord-get-subscriber": { "method": "GET", "command": "/plan, /credits" }
  }
}
```

---

### 4.2 DISCORD - Get Plans

**Fichier:** `workflows/Discord/discord-get-plans.json`

**Webhook:** `GET /webhook/discord-get-plans`

**Commande bot:** `/plans`

**Source:** **Stripe API** (temps reel)

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | string | Oui | ID du projet (ex: `torah`, `mcp`) |

**Flux interne:**
1. Valider `project_id`
2. Recuperer `secret_key` Stripe depuis SQLite (`stripe_projects`)
3. Appeler Stripe API `GET /v1/prices?active=true&expand[]=data.product`
4. Formater et retourner les plans

**Reponse:**
```json
{
  "success": true,
  "project_id": "torah",
  "project_name": "Torah App",
  "plans_count": 2,
  "plans": [
    {
      "id": "price_xxx",
      "product_id": "prod_xxx",
      "name": "Free",
      "description": "Acces de base",
      "price": 0,
      "currency": "eur",
      "interval": "month",
      "credits_per_month": 100,
      "features": ["Acces basique", "100 credits/mois"]
    },
    {
      "id": "price_yyy",
      "product_id": "prod_yyy",
      "name": "Premium",
      "description": "Acces complet",
      "price": 9.99,
      "currency": "eur",
      "interval": "month",
      "credits_per_month": 1000,
      "features": ["Support prioritaire", "1000 credits/mois"]
    }
  ]
}
```

**Configuration Stripe requise:**
Les produits Stripe doivent avoir ces metadata :
- `credits_per_month`: Nombre de credits par mois
- `features`: Liste JSON des fonctionnalites (ex: `["Feature 1", "Feature 2"]`)

---

### 4.3 DISCORD - Get Subscriber

**Fichier:** `workflows/Discord/discord-get-subscriber.json`

**Webhook:** `GET /webhook/discord-get-subscriber`

**Commandes bot:** `/plan`, `/credits`

**Source:** PostgreSQL `subscribers` (via n8n)

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | string | Oui | ID du projet |
| `discord_user_id` | string | Oui | ID Discord de l'utilisateur |

**Reponse:**
```json
{
  "success": true,
  "subscriber": {
    "id": 123,
    "discord_user_id": "123456789",
    "email": "user@example.com",
    "plan_id": "price_yyy",
    "stripe_customer_id": "cus_xxx",
    "stripe_subscription_id": "sub_xxx",
    "credits_remaining": 850,
    "credits_total": 1000,
    "subscription_status": "active",
    "current_period_end": "2025-02-01T00:00:00Z"
  }
}
```

---

### 4.4 DISCORD - Get Balance

**Fichier:** `workflows/Discord/discord-get-balance.json`

**Webhook:** `GET /webhook/discord-get-balance`

**Commande bot:** `/solde`

**Source:** PostgreSQL `subscribers` + `transactions` (via n8n)

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | string | Oui | ID du projet |
| `discord_user_id` | string | Oui | ID Discord de l'utilisateur |

**Reponse:**
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

---

### 4.5 DISCORD - Get Transactions

**Fichier:** `workflows/Discord/discord-get-transactions.json`

**Webhook:** `GET /webhook/discord-get-transactions`

**Commande bot:** `/account`

**Source:** PostgreSQL `transactions` (via n8n)

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `project_id` | string | Oui | ID du projet |
| `discord_user_id` | string | Oui | ID Discord |
| `limit` | number | Non | Max resultats (defaut: 20) |
| `offset` | number | Non | Pagination (defaut: 0) |

**Reponse:**
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

---

## 5. Gestion des callbacks Stripe

### Comment ca fonctionne

```
┌─────────────┐     ┌─────────────────────────┐     ┌─────────────────────┐
│   Stripe    │────▶│ Stripe - Webhook Handler│────▶│ Callback workflows  │
│   Events    │     │ /webhook/stripe-events  │     │ discord-sub-*       │
└─────────────┘     └─────────────────────────┘     └─────────────────────┘
                                                              │
                                                              ▼
                                                    ┌─────────────────────┐
                                                    │ PostgreSQL          │
                                                    │ (mise a jour)       │
                                                    └─────────────────────┘
```

### Workflows de callback (a creer)

| Callback | Evenement Stripe | Action |
|----------|------------------|--------|
| `discord-sub-success` | `checkout.session.completed` | Creer subscriber en DB |
| `discord-sub-renewal` | `invoice.payment_succeeded` | Renouveler credits |
| `discord-sub-failure` | `invoice.payment_failed` | Marquer echec paiement |
| `discord-sub-cancel` | `customer.subscription.deleted` | Desactiver subscriber |

### Comment le bot est notifie ?

Le bot **n'est pas notifie en temps reel**. Il query les workflows n8n :
1. Stripe envoie evenement → `stripe-events`
2. Handler route vers callback → `discord-sub-success`
3. Callback met a jour PostgreSQL
4. Bot appelle `/webhook/discord-get-subscriber` → donnees a jour

**Avantages:**
- Pas besoin d'API cote bot
- Le bot peut etre hors ligne pendant l'evenement
- Source de verite unique (PostgreSQL via n8n)

---

## 6. Implementation cote Bot

### Principe fondamental

**Le bot ne connait que l'URL n8n et le `project_id`.**

Il n'a pas :
- Acces direct a PostgreSQL
- Cles Stripe
- Credentials quelconques

### Client Python

```python
import aiohttp
from typing import Dict, Any

class DiscordN8nClient:
    """Client pour les workflows n8n Discord.

    Le bot passe uniquement des identifiants (project_id, discord_user_id).
    Toutes les operations DB et Stripe sont gerees par n8n.
    """

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

    # ==================== Workflows Discord ====================

    async def get_registry(self) -> Dict[str, Any]:
        """GET /webhook/discord-registry
        Decouvre tous les workflows disponibles.
        """
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.webhook_base}/discord-registry"
            ) as response:
                return await response.json()

    async def get_plans(self, project_id: str) -> Dict[str, Any]:
        """GET /webhook/discord-get-plans
        Recupere les plans depuis Stripe API.
        """
        return await self._get("discord-get-plans", {
            "project_id": project_id
        })

    async def get_subscriber(
        self, project_id: str, discord_user_id: str
    ) -> Dict[str, Any]:
        """GET /webhook/discord-get-subscriber
        Recupere les infos d'un abonne.
        """
        return await self._get("discord-get-subscriber", {
            "project_id": project_id,
            "discord_user_id": discord_user_id
        })

    async def get_balance(
        self, project_id: str, discord_user_id: str
    ) -> Dict[str, Any]:
        """GET /webhook/discord-get-balance
        Recupere le solde et transactions recentes.
        """
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
        """GET /webhook/discord-get-transactions
        Recupere l'historique des transactions.
        """
        return await self._get("discord-get-transactions", {
            "project_id": project_id,
            "discord_user_id": discord_user_id,
            "limit": limit,
            "offset": offset
        })

    # ==================== Workflows Stripe ====================

    async def create_checkout(
        self,
        project_id: str,
        price_id: str,
        customer_email: str,
        discord_user_id: str,
        success_url: str,
        cancel_url: str
    ) -> Dict[str, Any]:
        """POST /webhook/subscription-checkout-create
        Cree une session Stripe Checkout.
        """
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
        """POST /webhook/subscription-change-plan
        Change le plan d'un abonne.
        """
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
        """POST /webhook/subscription-cancel
        Annule un abonnement.
        """
        return await self._post("subscription-cancel", {
            "project_id": project_id,
            "stripe_subscription_id": stripe_subscription_id,
            "cancel_immediately": cancel_immediately
        })
```

### Exemple d'utilisation

```python
# Configuration
PROJECT_ID = "torah"  # ou "mcp", ou autre
client = DiscordN8nClient(base_url="http://pi6.local:5678")

@bot.slash_command(name="plans")
async def plans_command(ctx):
    """Affiche les plans disponibles (depuis Stripe)."""
    result = await client.get_plans(PROJECT_ID)

    if not result.get("success"):
        await ctx.respond(f"Erreur: {result.get('error', {}).get('message')}")
        return

    embed = discord.Embed(title="Plans disponibles")
    for plan in result["plans"]:
        embed.add_field(
            name=f"{plan['name']} - {plan['price']} {plan['currency'].upper()}/mois",
            value=f"Credits: {plan['credits_per_month']}/mois\n" +
                  "\n".join(f"- {f}" for f in plan.get('features', [])),
            inline=False
        )

    await ctx.respond(embed=embed)

@bot.slash_command(name="credits")
async def credits_command(ctx):
    """Affiche les credits restants."""
    result = await client.get_subscriber(PROJECT_ID, str(ctx.author.id))

    if not result.get("success"):
        await ctx.respond("Vous n'avez pas d'abonnement. Utilisez /subscribe")
        return

    sub = result["subscriber"]
    await ctx.respond(
        f"Credits: {sub['credits_remaining']}/{sub['credits_total']}\n"
        f"Plan: {sub['plan_id']}\n"
        f"Renouvellement: {sub['current_period_end']}"
    )

@bot.slash_command(name="subscribe")
async def subscribe_command(ctx, plan: str, email: str):
    """Cree un abonnement."""
    # D'abord recuperer les plans pour avoir le price_id
    plans_result = await client.get_plans(PROJECT_ID)
    if not plans_result.get("success"):
        await ctx.respond("Erreur lors de la recuperation des plans")
        return

    # Trouver le plan demande
    price_id = None
    for p in plans_result["plans"]:
        if p["name"].lower() == plan.lower():
            price_id = p["id"]
            break

    if not price_id:
        await ctx.respond(f"Plan '{plan}' non trouve")
        return

    # Creer la session checkout
    result = await client.create_checkout(
        project_id=PROJECT_ID,
        price_id=price_id,
        customer_email=email,
        discord_user_id=str(ctx.author.id),
        success_url="https://votresite.com/success",
        cancel_url="https://votresite.com/cancel"
    )

    if result.get("success"):
        await ctx.respond(f"Cliquez ici pour payer: {result['checkout_url']}")
    else:
        await ctx.respond(f"Erreur: {result.get('error', {}).get('message')}")
```

---

## 7. Resume des webhooks

### ❌ A CREER (Discord)

| Webhook | Methode | Commande | Source |
|---------|---------|----------|--------|
| `/webhook/discord-registry` | GET | Discovery | n8n API |
| `/webhook/discord-get-plans` | GET | `/plans` | **Stripe API** |
| `/webhook/discord-get-subscriber` | GET | `/plan`, `/credits` | PostgreSQL |
| `/webhook/discord-get-balance` | GET | `/solde` | PostgreSQL |
| `/webhook/discord-get-transactions` | GET | `/account` | PostgreSQL |
| `/webhook/discord-sub-success` | POST | Callback | PostgreSQL |
| `/webhook/discord-sub-renewal` | POST | Callback | PostgreSQL |
| `/webhook/discord-sub-failure` | POST | Callback | PostgreSQL |
| `/webhook/discord-sub-cancel` | POST | Callback | PostgreSQL |

### ✅ EXISTANTS (Stripe)

| Webhook | Methode | Usage |
|---------|---------|-------|
| `/webhook/subscription-checkout-create` | POST | `/subscribe` |
| `/webhook/subscription-change-plan` | POST | Upgrade/downgrade |
| `/webhook/subscription-cancel` | POST | Annulation |
| `/webhook/stripe-events` | POST | Webhooks Stripe |

---

## 8. Configuration requise

### Cote Stripe (par projet)

Chaque produit Stripe doit avoir ces **metadata** :
- `credits_per_month`: Nombre de credits mensuels
- `features`: JSON array des fonctionnalites

Exemple:
```
metadata.credits_per_month = "1000"
metadata.features = "[\"Support prioritaire\", \"API access\"]"
```

### Cote n8n

| Credential | Type | Usage |
|------------|------|-------|
| `Stripe Config DB` | SQLite | Config multi-tenant (`stripe_projects`) |
| `PostgreSQL Subscribers` | PostgreSQL | Donnees utilisateurs |
| `Header Auth n8n` | HTTP Header | Appels API n8n internes |
