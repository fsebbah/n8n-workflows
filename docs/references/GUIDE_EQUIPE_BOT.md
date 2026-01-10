# Guide Équipe Bot - Intégration Stripe Torah

**Date:** 2026-01-03
**Version:** 1.0
**Statut:** Prêt pour tests

---

## 1. Vue d'ensemble

Ce document décrit l'intégration Stripe pour le bot Discord Torah. L'architecture utilise n8n comme proxy pour gérer les paiements Stripe de manière sécurisée.

### 1.1 Architecture

```
Discord Bot                    n8n                         Stripe
───────────                    ───                         ──────
     │                          │                            │
     │  1. /subscribe premium   │                            │
     │─────────────────────────▶│                            │
     │                          │  2. Create Checkout        │
     │                          │───────────────────────────▶│
     │                          │                            │
     │                          │  3. Checkout URL           │
     │                          │◀───────────────────────────│
     │  4. Send payment link    │                            │
     │◀─────────────────────────│                            │
     │                          │                            │
     │  5. User pays on Stripe  │                            │
     │                          │                            │
     │                          │  6. Webhook event          │
     │                          │◀───────────────────────────│
     │                          │                            │
     │                          │  7. torah-sub-success      │
     │                          │────▶ Update DB             │
     │                          │────▶ Add credits           │
     │                          │────▶ Send DM               │
     │  8. Confirmation DM      │                            │
     │◀─────────────────────────│                            │
```

---

## 2. Prérequis

### 2.1 Base de données PostgreSQL

Exécuter la migration pour ajouter les colonnes Stripe à la table `subscribers` :

```bash
cd /path/to/n8n-workflows
./scripts/torah/migrate-stripe.sh --host localhost --user torah --db torah_db
```

**Colonnes ajoutées à `subscribers` :**
| Colonne | Type | Description |
|---------|------|-------------|
| `stripe_customer_id` | VARCHAR(255) | ID client Stripe |
| `stripe_subscription_id` | VARCHAR(255) | ID abonnement Stripe |
| `subscription_status` | VARCHAR(50) | active, canceled, past_due, free |
| `subscription_plan` | VARCHAR(50) | free, basic, premium, unlimited |
| `current_period_end` | TIMESTAMP | Fin de période actuelle |

**Nouvelle table `payment_history` :**
| Colonne | Type | Description |
|---------|------|-------------|
| `discord_user_id` | VARCHAR(50) | ID Discord |
| `stripe_payment_id` | VARCHAR(255) | ID paiement Stripe |
| `amount_cents` | INTEGER | Montant en centimes |
| `status` | VARCHAR(50) | succeeded, failed, refunded |
| `plan` | VARCHAR(50) | Plan souscrit |

### 2.2 Variables d'environnement Bot

```env
# URL de base n8n
N8N_WEBHOOK_URL=http://pi6.local:5678

# URL de l'API Torah (pour les DM Discord)
TORAH_API_URL=http://pi6.local:3031
```

### 2.3 Workflows n8n à importer

Importer ces workflows dans n8n :

| Workflow | Fichier | Endpoint |
|----------|---------|----------|
| Checkout Create | `workflows/Stripe/subscription-checkout-create.json` | `/webhook/subscription-checkout-create` |
| Webhook Handler | `workflows/Stripe/subscription-webhook-handler.json` | `/webhook/stripe-events` |
| Cancel | `workflows/Stripe/subscription-cancel.json` | `/webhook/subscription-cancel` |
| Change Plan | `workflows/Stripe/subscription-change-plan.json` | `/webhook/subscription-change-plan` |
| Torah Success | `workflows/Torah/torah-sub-success.json` | `/webhook/torah-sub-success` |
| Torah Renewal | `workflows/Torah/torah-sub-renewal.json` | `/webhook/torah-sub-renewal` |
| Torah Cancel | `workflows/Torah/torah-sub-cancel.json` | `/webhook/torah-sub-cancel` |
| Torah Failure | `workflows/Torah/torah-sub-failure.json` | `/webhook/torah-sub-failure` |

---

## 3. Implémentation Bot Discord

### 3.1 Commande `/subscribe`

```python
import aiohttp
import discord
from discord import app_commands

N8N_WEBHOOK_URL = "http://pi6.local:5678"

class SubscribeView(discord.ui.View):
    def __init__(self, checkout_url: str):
        super().__init__(timeout=300)
        self.add_item(discord.ui.Button(
            label="💳 Payer avec Stripe",
            url=checkout_url,
            style=discord.ButtonStyle.link
        ))

@app_commands.command(name="subscribe", description="Souscrire à un plan premium")
@app_commands.describe(plan="Le plan souhaité")
@app_commands.choices(plan=[
    app_commands.Choice(name="Basic - 4.99€/mois (1000 crédits)", value="basic"),
    app_commands.Choice(name="Premium - 9.99€/mois (5000 crédits)", value="premium"),
    app_commands.Choice(name="Unlimited - 19.99€/mois (illimité)", value="unlimited"),
])
async def subscribe(interaction: discord.Interaction, plan: str):
    await interaction.response.defer(ephemeral=True)

    # Prix IDs Stripe (à configurer selon votre Stripe Dashboard)
    price_ids = {
        "basic": "price_basic_xxx",
        "premium": "price_premium_xxx",
        "unlimited": "price_unlimited_xxx"
    }

    payload = {
        "project_id": "torah",
        "price_id": price_ids[plan],
        "customer_email": None,  # Sera demandé par Stripe
        "callbacks": {
            "success": f"{N8N_WEBHOOK_URL}/webhook/torah-sub-success",
            "renewal": f"{N8N_WEBHOOK_URL}/webhook/torah-sub-renewal",
            "cancel": f"{N8N_WEBHOOK_URL}/webhook/torah-sub-cancel",
            "failure": f"{N8N_WEBHOOK_URL}/webhook/torah-sub-failure"
        },
        "urls": {
            "success": "https://discord.com/channels/@me",
            "cancel": "https://discord.com/channels/@me"
        },
        "metadata": {
            "discord_user_id": str(interaction.user.id),
            "discord_username": str(interaction.user),
            "plan": plan
        }
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{N8N_WEBHOOK_URL}/webhook/subscription-checkout-create",
            json=payload
        ) as resp:
            if resp.status == 200:
                data = await resp.json()
                checkout_url = data.get("checkout_url")

                view = SubscribeView(checkout_url)
                await interaction.followup.send(
                    f"🎉 **Abonnement {plan.title()}**\n\n"
                    f"Cliquez sur le bouton ci-dessous pour procéder au paiement sécurisé.",
                    view=view,
                    ephemeral=True
                )
            else:
                await interaction.followup.send(
                    "❌ Erreur lors de la création du lien de paiement.",
                    ephemeral=True
                )
```

### 3.2 Commande `/cancel-subscription`

```python
@app_commands.command(name="cancel-subscription", description="Annuler votre abonnement")
async def cancel_subscription(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)

    # Récupérer l'abonnement de l'utilisateur depuis la DB
    subscriber = await get_subscriber(str(interaction.user.id))

    if not subscriber or not subscriber.get("stripe_subscription_id"):
        await interaction.followup.send(
            "❌ Vous n'avez pas d'abonnement actif.",
            ephemeral=True
        )
        return

    payload = {
        "project_id": "torah",
        "stripe_subscription_id": subscriber["stripe_subscription_id"],
        "cancel_immediately": False  # Annulation à la fin de la période
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            f"{N8N_WEBHOOK_URL}/webhook/subscription-cancel",
            json=payload
        ) as resp:
            if resp.status == 200:
                await interaction.followup.send(
                    "✅ Votre abonnement sera annulé à la fin de la période en cours.\n"
                    "Vous conservez vos crédits restants jusqu'à cette date.",
                    ephemeral=True
                )
            else:
                await interaction.followup.send(
                    "❌ Erreur lors de l'annulation.",
                    ephemeral=True
                )
```

### 3.3 Commande `/subscription-status`

```python
@app_commands.command(name="subscription-status", description="Voir le statut de votre abonnement")
async def subscription_status(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)

    subscriber = await get_subscriber(str(interaction.user.id))

    if not subscriber:
        embed = discord.Embed(
            title="📊 Statut Abonnement",
            description="Vous êtes sur le plan **Gratuit**",
            color=discord.Color.blue()
        )
        embed.add_field(name="Crédits", value=f"{subscriber.get('credits', 100)}/100", inline=True)
    else:
        status_emoji = {
            "active": "✅",
            "canceled": "⚠️",
            "past_due": "❌",
            "free": "📘"
        }

        embed = discord.Embed(
            title="📊 Statut Abonnement",
            color=discord.Color.green() if subscriber["subscription_status"] == "active" else discord.Color.orange()
        )
        embed.add_field(
            name="Plan",
            value=subscriber.get("subscription_plan", "free").title(),
            inline=True
        )
        embed.add_field(
            name="Statut",
            value=f"{status_emoji.get(subscriber['subscription_status'], '❓')} {subscriber['subscription_status'].title()}",
            inline=True
        )
        embed.add_field(
            name="Crédits",
            value=f"{subscriber.get('credits', 0):,}",
            inline=True
        )

        if subscriber.get("current_period_end"):
            embed.add_field(
                name="Renouvellement",
                value=f"<t:{int(subscriber['current_period_end'].timestamp())}:R>",
                inline=True
            )

    await interaction.followup.send(embed=embed, ephemeral=True)
```

### 3.4 Helpers Base de Données

```python
import asyncpg

async def get_subscriber(discord_user_id: str) -> dict | None:
    """Récupère les infos d'un subscriber depuis PostgreSQL."""
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        row = await conn.fetchrow(
            """
            SELECT discord_user_id, credits, stripe_customer_id,
                   stripe_subscription_id, subscription_status,
                   subscription_plan, current_period_end
            FROM subscribers
            WHERE discord_user_id = $1
            """,
            discord_user_id
        )
        return dict(row) if row else None
    finally:
        await conn.close()

async def update_subscriber_credits(discord_user_id: str, credits_delta: int):
    """Met à jour les crédits d'un subscriber."""
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute(
            """
            UPDATE subscribers
            SET credits = COALESCE(credits, 0) + $2,
                updated_at = NOW()
            WHERE discord_user_id = $1
            """,
            discord_user_id, credits_delta
        )
    finally:
        await conn.close()
```

---

## 4. Callbacks Stripe → n8n → Bot

Les workflows n8n gèrent automatiquement les événements Stripe. Voici ce qui se passe pour chaque événement :

### 4.1 `checkout.session.completed` → torah-sub-success

**Déclenché quand :** L'utilisateur termine le paiement initial

**Actions automatiques :**
1. ✅ Mise à jour `subscribers` avec `stripe_customer_id`, `stripe_subscription_id`
2. ✅ Ajout des crédits selon le plan
3. ✅ Envoi d'un DM Discord de confirmation (via TORAH_API_URL)
4. ✅ Log dans `payment_history`

### 4.2 `invoice.payment_succeeded` → torah-sub-renewal

**Déclenché quand :** Renouvellement mensuel réussi

**Actions automatiques :**
1. ✅ Ajout des crédits mensuels
2. ✅ Mise à jour `current_period_end`
3. ✅ Log dans `payment_history`

### 4.3 `customer.subscription.deleted` → torah-sub-cancel

**Déclenché quand :** Abonnement annulé (fin de période ou immédiat)

**Actions automatiques :**
1. ✅ `subscription_status` → "canceled"
2. ✅ `subscription_plan` → "free"
3. ✅ Envoi d'un DM Discord d'information

### 4.4 `invoice.payment_failed` → torah-sub-failure

**Déclenché quand :** Échec de paiement (carte expirée, fonds insuffisants)

**Actions automatiques :**
1. ✅ `subscription_status` → "past_due"
2. ✅ Log dans `payment_history` avec `status: failed`
3. ✅ Envoi d'un DM Discord d'avertissement

---

## 5. Tests

### 5.1 Script de test

```bash
# Tester tous les endpoints Torah
./scripts/test/test-stripe-webhooks.sh --base-url http://pi6.local:5678 --project torah

# Mode verbose pour voir les réponses
./scripts/test/test-stripe-webhooks.sh --project torah --verbose
```

### 5.2 Test manuel d'un callback

```bash
# Simuler un checkout réussi
curl -X POST http://pi6.local:5678/webhook/torah-sub-success \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "checkout.session.completed",
    "event_id": "evt_test_123",
    "data": {
      "customer_id": "cus_test_123",
      "customer_email": "test@example.com",
      "subscription_id": "sub_test_123",
      "amount_total": 999,
      "currency": "eur",
      "metadata": {
        "discord_user_id": "123456789012345678",
        "plan": "premium"
      }
    }
  }'
```

### 5.3 Carte de test Stripe

Pour les tests avec Stripe en mode test :
- **Numéro :** `4242 4242 4242 4242`
- **Date :** N'importe quelle date future
- **CVC :** N'importe quel nombre à 3 chiffres

---

## 6. Plans et Crédits

| Plan | Prix/mois | Crédits/mois | Fonctionnalités |
|------|-----------|--------------|-----------------|
| Free | 0€ | 100 | Traductions limitées |
| Basic | 4.99€ | 1,000 | Salle privée |
| Premium | 9.99€ | 5,000 | Salle privée + priorité |
| Unlimited | 19.99€ | ∞ | Tout illimité |

---

## 7. Checklist Intégration

- [ ] Migration DB exécutée (`./scripts/torah/migrate-stripe.sh`)
- [ ] Workflows n8n importés et actifs
- [ ] Variables d'environnement configurées
- [ ] Commande `/subscribe` implémentée
- [ ] Commande `/cancel-subscription` implémentée
- [ ] Commande `/subscription-status` implémentée
- [ ] Tests webhook passés
- [ ] DM Discord fonctionnels

---

## 8. Support

**Fichiers de référence :**
- Migration DB : `scripts/torah/migrate-stripe-columns.sql`
- Workflows : `workflows/Torah/torah-sub-*.json`
- Documentation complète : `docs/torah/discord-subscribe-integration.md`

**En cas de problème :**
1. Vérifier les logs n8n pour les exécutions de workflow
2. Vérifier que les workflows sont actifs
3. Tester avec le script `test-stripe-webhooks.sh`
