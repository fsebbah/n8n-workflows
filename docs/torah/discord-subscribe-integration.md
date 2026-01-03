# Discord Bot - Stripe Subscription Integration

## Overview

This document describes how to integrate the Stripe subscription system with the Torah Discord bot.

## Architecture

```
Discord Bot                    n8n Workflows                    Stripe
───────────                    ─────────────                    ──────
     │                              │                              │
     │  1. /subscribe premium       │                              │
     │─────────────────────────────▶│                              │
     │                              │  2. Create Checkout Session  │
     │                              │─────────────────────────────▶│
     │                              │                              │
     │                              │  3. Return checkout_url      │
     │                              │◀─────────────────────────────│
     │  4. Send DM with link        │                              │
     │◀─────────────────────────────│                              │
     │                              │                              │
     │  5. User clicks link ───────────────────────────────────────▶
     │                              │                              │
     │                              │  6. Webhook: payment OK      │
     │                              │◀─────────────────────────────│
     │                              │                              │
     │                              │  7. Call torah-sub-success   │
     │                              │──────▶(n8n)                  │
     │                              │                              │
     │  8. Welcome DM               │                              │
     │◀─────────────────────────────│                              │
```

## Discord Bot Implementation

### 1. `/subscribe` Command

```python
import discord
from discord import app_commands
import aiohttp

class SubscribeView(discord.ui.View):
    def __init__(self, checkout_url: str):
        super().__init__(timeout=300)  # 5 minutes
        self.add_item(discord.ui.Button(
            label="💳 Souscrire",
            url=checkout_url,
            style=discord.ButtonStyle.link
        ))

@app_commands.command(name="subscribe", description="S'abonner à Torah Premium")
@app_commands.describe(plan="Le plan souhaité")
@app_commands.choices(plan=[
    app_commands.Choice(name="Basic - 4.99€/mois (1000 crédits)", value="basic"),
    app_commands.Choice(name="Premium - 9.99€/mois (5000 crédits)", value="premium"),
    app_commands.Choice(name="Unlimited - 19.99€/mois (illimité)", value="unlimited"),
])
async def subscribe(interaction: discord.Interaction, plan: str = "basic"):
    await interaction.response.defer(ephemeral=True)

    # Get price_id from config
    price_ids = {
        "basic": "price_basic_xxx",      # Replace with actual Stripe price IDs
        "premium": "price_premium_xxx",
        "unlimited": "price_unlimited_xxx"
    }

    # Build success/cancel URLs
    guild_id = interaction.guild_id or "@me"
    channel_id = interaction.channel_id
    success_url = f"https://discord.com/channels/{guild_id}/{channel_id}"
    cancel_url = success_url

    # Call n8n workflow
    payload = {
        "project_id": "torah",
        "price_id": price_ids[plan],
        "customer_email": None,  # Optional, Stripe will ask
        "callbacks": {
            "success": "http://n8n.local:5678/webhook/torah-sub-success",
            "renewal": "http://n8n.local:5678/webhook/torah-sub-renewal",
            "failure": "http://n8n.local:5678/webhook/torah-sub-failure",
            "cancel": "http://n8n.local:5678/webhook/torah-sub-cancel"
        },
        "urls": {
            "success": success_url,
            "cancel": cancel_url
        },
        "metadata": {
            "discord_user_id": str(interaction.user.id),
            "discord_username": str(interaction.user),
            "plan": plan
        },
        "options": {
            "trial_days": 7 if plan == "basic" else 0
        }
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "http://n8n.local:5678/webhook/subscription-checkout-create",
            json=payload
        ) as response:
            data = await response.json()

    if not data.get("success"):
        await interaction.followup.send(
            "❌ Erreur lors de la création du lien de paiement. Réessayez plus tard.",
            ephemeral=True
        )
        return

    # Send checkout link
    embed = discord.Embed(
        title=f"Abonnement Torah {plan.title()}",
        description=(
            f"Cliquez sur le bouton ci-dessous pour finaliser votre abonnement.\n\n"
            f"**Plan:** {plan.title()}\n"
            f"**Crédits/mois:** {{'basic': 1000, 'premium': 5000, 'unlimited': '∞'}[plan]}\n"
        ),
        color=discord.Color.gold()
    )
    embed.set_footer(text="Le lien expire dans 30 minutes")

    view = SubscribeView(data["checkout_url"])
    await interaction.followup.send(embed=embed, view=view, ephemeral=True)
```

### 2. `/cancel-subscription` Command

```python
@app_commands.command(name="cancel-subscription", description="Annuler votre abonnement")
async def cancel_subscription(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)

    # Get user's subscription ID from database
    subscriber = await get_subscriber(interaction.user.id)

    if not subscriber or not subscriber.stripe_subscription_id:
        await interaction.followup.send(
            "❌ Vous n'avez pas d'abonnement actif.",
            ephemeral=True
        )
        return

    # Call n8n cancel workflow
    payload = {
        "project_id": "torah",
        "stripe_subscription_id": subscriber.stripe_subscription_id,
        "cancel_immediately": False  # Cancel at period end
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(
            "http://n8n.local:5678/webhook/subscription-cancel",
            json=payload
        ) as response:
            data = await response.json()

    if data.get("success"):
        await interaction.followup.send(
            "✅ Votre abonnement sera annulé à la fin de la période en cours.\n"
            "Vous conserverez l'accès jusqu'à cette date.",
            ephemeral=True
        )
    else:
        await interaction.followup.send(
            "❌ Erreur lors de l'annulation. Contactez le support.",
            ephemeral=True
        )
```

### 3. `/subscription-status` Command

```python
@app_commands.command(name="subscription-status", description="Voir le statut de votre abonnement")
async def subscription_status(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)

    subscriber = await get_subscriber(interaction.user.id)

    if not subscriber:
        await interaction.followup.send(
            "Vous n'êtes pas encore inscrit. Utilisez `/subscribe` pour commencer!",
            ephemeral=True
        )
        return

    status_emoji = {
        "active": "✅",
        "past_due": "⚠️",
        "canceled": "❌",
        "free": "🆓"
    }

    embed = discord.Embed(
        title="Statut de votre abonnement",
        color=discord.Color.blue()
    )
    embed.add_field(
        name="Plan",
        value=subscriber.subscription_plan.title(),
        inline=True
    )
    embed.add_field(
        name="Statut",
        value=f"{status_emoji.get(subscriber.subscription_status, '❓')} {subscriber.subscription_status}",
        inline=True
    )
    embed.add_field(
        name="Crédits restants",
        value=str(subscriber.credits),
        inline=True
    )

    if subscriber.current_period_end:
        embed.add_field(
            name="Prochaine facturation",
            value=subscriber.current_period_end.strftime("%d/%m/%Y"),
            inline=True
        )

    await interaction.followup.send(embed=embed, ephemeral=True)
```

## Environment Variables

The Discord bot needs these environment variables:

```env
# n8n Webhook URLs
N8N_WEBHOOK_URL=http://n8n.local:5678/webhook

# Stripe Price IDs (from Stripe Dashboard)
STRIPE_PRICE_BASIC=price_xxx
STRIPE_PRICE_PREMIUM=price_xxx
STRIPE_PRICE_UNLIMITED=price_xxx
```

## Database Helper Functions

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
import asyncpg

@dataclass
class Subscriber:
    id: int
    discord_user_id: str
    credits: int
    subscription_plan: str
    subscription_status: str
    stripe_customer_id: Optional[str]
    stripe_subscription_id: Optional[str]
    current_period_end: Optional[datetime]

async def get_subscriber(discord_user_id: int) -> Optional[Subscriber]:
    """Get subscriber by Discord user ID"""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, discord_user_id, credits, subscription_plan,
                   subscription_status, stripe_customer_id,
                   stripe_subscription_id, current_period_end
            FROM subscribers
            WHERE discord_user_id = $1
            """,
            str(discord_user_id)
        )
        if row:
            return Subscriber(**dict(row))
        return None
```

## Webhook Configuration

### n8n Callback URLs

Configure these in the Stripe checkout request metadata:

| Event | Callback URL |
|-------|--------------|
| Success (checkout completed) | `http://n8n.local:5678/webhook/torah-sub-success` |
| Renewal (payment succeeded) | `http://n8n.local:5678/webhook/torah-sub-renewal` |
| Failure (payment failed) | `http://n8n.local:5678/webhook/torah-sub-failure` |
| Cancel (subscription deleted) | `http://n8n.local:5678/webhook/torah-sub-cancel` |

### Stripe Webhook

Configure in Stripe Dashboard:
- **URL:** `https://your-domain.com/webhook/stripe-events`
- **Events to listen:**
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.subscription.deleted`
  - `customer.subscription.updated`

## Testing

### Test Cards

| Scenario | Card Number |
|----------|-------------|
| Success | `4242 4242 4242 4242` |
| Decline | `4000 0000 0000 0002` |
| Requires auth | `4000 0025 0000 3155` |

### Test Flow

1. Use `/subscribe premium` in Discord
2. Click the payment link
3. Use test card `4242 4242 4242 4242`
4. Verify webhook callback received
5. Check database updated
6. Verify DM sent to user

## Error Handling

The bot should handle these error cases:

1. **n8n unreachable:** Show maintenance message
2. **Invalid response:** Log error, show generic message
3. **User already subscribed:** Show current plan, offer upgrade
4. **Payment link expired:** Generate new link

## Security Considerations

1. All `/subscribe` responses are ephemeral (only visible to user)
2. Never expose Stripe API keys in bot code
3. Validate webhook signatures in n8n
4. Use HTTPS for all webhook URLs in production
