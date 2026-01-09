# Architecture : Gestion des Subscriptions et Credits

**Version:** 1.0
**Date:** 2026-01-09
**Destinataire:** Equipe Chatbot Core
**Auteur:** Equipe n8n

---

## 1. Vue d'ensemble

```
+------------------+       +------------------+       +------------------+
|   Discord Bot    | ----> |       n8n        | ----> |    Torah API     |
|  (Chatbot Core)  |       |   (Orchestrator) |       |    (Backend)     |
+------------------+       +------------------+       +------------------+
         |                         |                          |
         |  HTTP Webhooks          |  HTTP REST               |
         |  (n8n endpoints)        |  (API endpoints)         |
         v                         v                          v
   Commandes Discord        Workflows JSON            Base de donnees
   /plan, /credits          Logique metier            user_credits
   /subscribe, /billing                               user_credit_logs
```

---

## 2. Endpoints n8n disponibles

Le bot doit appeler les **webhooks n8n**, pas l'API directement.

### 2.1 Lecture des informations utilisateur

| Endpoint n8n | Methode | Description |
|--------------|---------|-------------|
| `/webhook/discord-get-subscriber` | GET | Recuperer infos abonnement + credits |
| `/webhook/discord-get-credits` | GET | Recuperer uniquement les credits |
| `/webhook/discord-get-balance` | GET | Recuperer le solde |
| `/webhook/discord-get-plans` | GET | Liste des plans disponibles |
| `/webhook/discord-get-transactions` | GET | Historique des transactions |

### 2.2 Actions

| Endpoint n8n | Methode | Description |
|--------------|---------|-------------|
| `/webhook/discord-subscribe` | POST | Creer une session Stripe Checkout |
| `/webhook/discord-billing-portal` | POST | Creer une session Stripe Billing Portal |

---

## 3. Flux detailles

### 3.1 Commande `/plan` ou `/credits`

```
Discord User
     |
     | /plan ou /credits
     v
+------------------+
|   Discord Bot    |
+------------------+
     |
     | GET /webhook/discord-get-subscriber
     |     ?project_id=xxx
     |     &discord_user_id=xxx
     v
+------------------+
|       n8n        |
| Workflow:        |
| DISCORD - Get    |
| Subscriber       |
+------------------+
     |
     | GET /api/webhook/account
     |     ?discord_user_id=xxx
     |     Header: X-Project-ID: xxx
     v
+------------------+
|    Torah API     |
+------------------+
     |
     | Lecture table: user_credits
     v
+------------------+
| Response JSON    |
+------------------+
     |
     v
Discord User recoit embed avec:
- Plan actuel
- Credits restants / total
- Statut abonnement
- Date fin periode
```

**Requete du bot vers n8n :**
```http
GET https://n8n.example.com/webhook/discord-get-subscriber?project_id=torah-fun&discord_user_id=123456789
```

**Reponse n8n vers bot :**
```json
{
  "success": true,
  "subscriber": {
    "discord_user_id": "123456789",
    "discord_username": "user#1234",
    "plan_id": "premium",
    "credits_remaining": 850,
    "credits_total": 1000,
    "credits_used": 150,
    "usage_percent": 15,
    "subscription_status": "active",
    "subscription_plan": "premium",
    "current_period_end": "2026-02-08T00:00:00Z",
    "is_active": true
  }
}
```

---

### 3.2 Commande `/subscribe`

```
Discord User
     |
     | /subscribe plan:premium
     v
+------------------+
|   Discord Bot    |
+------------------+
     |
     | POST /webhook/discord-subscribe
     |      Body: { project_id, discord_user_id, plan_id }
     v
+------------------+
|       n8n        |
| Workflow:        |
| DISCORD -        |
| Subscribe        |
+------------------+
     |
     | 1. Get Stripe config from Redis
     | 2. Create Stripe Checkout Session
     v
+------------------+
|   Stripe API     |
+------------------+
     |
     v
+------------------+
| Response:        |
| checkout_url     |
+------------------+
     |
     v
Discord User recoit:
- Bouton "Payer" avec URL Stripe
```

**Requete du bot vers n8n :**
```http
POST https://n8n.example.com/webhook/discord-subscribe
Content-Type: application/json

{
  "project_id": "torah-fun",
  "discord_user_id": "123456789",
  "discord_username": "user#1234",
  "plan_id": "premium"
}
```

**Reponse n8n vers bot :**
```json
{
  "success": true,
  "checkout_url": "https://checkout.stripe.com/c/pay/xxx",
  "plan": {
    "id": "premium",
    "name": "Premium",
    "price": 9.99,
    "credits": 1000
  }
}
```

---

### 3.3 Commande `/billing`

```
Discord User
     |
     | /billing
     v
+------------------+
|   Discord Bot    |
+------------------+
     |
     | POST /webhook/discord-billing-portal
     |      Body: { project_id, discord_user_id }
     v
+------------------+
|       n8n        |
| Workflow:        |
| DISCORD -        |
| Billing Portal   |
+------------------+
     |
     | 1. Get subscriber (stripe_customer_id)
     | 2. Get Stripe config from Redis
     | 3. Create Billing Portal Session
     v
+------------------+
|   Stripe API     |
+------------------+
     |
     v
+------------------+
| Response:        |
| portal_url       |
+------------------+
     |
     v
Discord User recoit:
- Bouton "Gerer abonnement" avec URL Portal
```

**Requete du bot vers n8n :**
```http
POST https://n8n.example.com/webhook/discord-billing-portal
Content-Type: application/json

{
  "project_id": "torah-fun",
  "discord_user_id": "123456789"
}
```

**Reponse n8n vers bot :**
```json
{
  "success": true,
  "portal_url": "https://billing.stripe.com/session/xxx",
  "return_url": "https://stripe.example.com/webhook/subscription-result?project_id=torah-fun&action=portal"
}
```

---

### 3.4 Webhook Stripe (apres paiement)

```
Stripe
     |
     | Webhook: checkout.session.completed
     |          invoice.paid
     |          customer.subscription.deleted
     v
+------------------+
|       n8n        |
| Workflow:        |
| STRIPE -         |
| Webhook Handler  |
+------------------+
     |
     | POST /api/webhook/account/set
     |      Body: credits, status, plan_id, metadata
     v
+------------------+
|    Torah API     |
+------------------+
     |
     | MAJ table: user_credits
     v
+------------------+
|       n8n        |
| (suite workflow) |
+------------------+
     |
     | POST /api/discord/send-dm
     v
Discord User recoit DM:
- Confirmation paiement
- Credits ajoutes
```

**Note:** Ce flux est automatique, le bot n'intervient pas.

---

## 4. Mapping des commandes Discord

| Commande Discord | Endpoint n8n | Methode |
|------------------|--------------|---------|
| `/plan` | `/webhook/discord-get-subscriber` | GET |
| `/credits` | `/webhook/discord-get-subscriber` | GET |
| `/balance` | `/webhook/discord-get-balance` | GET |
| `/subscribe` | `/webhook/discord-subscribe` | POST |
| `/billing` | `/webhook/discord-billing-portal` | POST |
| `/transactions` | `/webhook/discord-get-transactions` | GET |

---

## 5. Parametres communs

### 5.1 Query Parameters (GET)

| Parametre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `project_id` | string | Oui | ID du projet (ex: "torah-fun") |
| `discord_user_id` | string | Oui | ID Discord de l'utilisateur |

### 5.2 Body Parameters (POST)

| Parametre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `project_id` | string | Oui | ID du projet |
| `discord_user_id` | string | Oui | ID Discord de l'utilisateur |
| `discord_username` | string | Non | Username Discord (pour affichage) |
| `plan_id` | string | Selon | ID du plan (requis pour /subscribe) |

---

## 6. Codes de reponse

| Code | Signification | Action bot |
|------|---------------|------------|
| 200 | Succes | Afficher les donnees |
| 400 | Parametres manquants | Afficher erreur utilisateur |
| 404 | Utilisateur non trouve | Proposer /subscribe |
| 500 | Erreur serveur | Afficher erreur technique |
| 503 | Service indisponible | Reessayer plus tard |

---

## 7. Exemple d'implementation bot

### 7.1 Classe N8nClient (Python)

```python
class N8nClient:
    def __init__(self, base_url: str):
        self.base_url = base_url  # Ex: "https://n8n.example.com"

    async def get_subscriber(self, project_id: str, discord_user_id: str) -> dict:
        """Recuperer les infos d'un abonne"""
        url = f"{self.base_url}/webhook/discord-get-subscriber"
        params = {
            "project_id": project_id,
            "discord_user_id": discord_user_id
        }
        response = await self.http.get(url, params=params)
        return response.json()

    async def create_checkout(self, project_id: str, discord_user_id: str,
                              discord_username: str, plan_id: str) -> dict:
        """Creer une session Stripe Checkout"""
        url = f"{self.base_url}/webhook/discord-subscribe"
        body = {
            "project_id": project_id,
            "discord_user_id": discord_user_id,
            "discord_username": discord_username,
            "plan_id": plan_id
        }
        response = await self.http.post(url, json=body)
        return response.json()

    async def create_billing_portal(self, project_id: str, discord_user_id: str) -> dict:
        """Creer une session Stripe Billing Portal"""
        url = f"{self.base_url}/webhook/discord-billing-portal"
        body = {
            "project_id": project_id,
            "discord_user_id": discord_user_id
        }
        response = await self.http.post(url, json=body)
        return response.json()
```

### 7.2 Commande /plan (Python Discord.py)

```python
@bot.slash_command(name="plan")
async def plan_command(ctx):
    """Afficher son plan actuel"""
    await ctx.defer()

    try:
        result = await n8n_client.get_subscriber(
            project_id=PROJECT_ID,
            discord_user_id=str(ctx.author.id)
        )

        if result.get("success"):
            sub = result["subscriber"]
            embed = discord.Embed(
                title=f"Plan: {sub['plan_id'].title()}",
                color=0x00ff00 if sub['is_active'] else 0xff0000
            )
            embed.add_field(
                name="Credits",
                value=f"{sub['credits_remaining']} / {sub['credits_total']}"
            )
            embed.add_field(
                name="Statut",
                value=sub['subscription_status']
            )
            if sub['current_period_end']:
                embed.add_field(
                    name="Renouvellement",
                    value=sub['current_period_end'][:10]
                )
            await ctx.respond(embed=embed)
        else:
            await ctx.respond(f"Erreur: {result['error']['message']}")

    except Exception as e:
        await ctx.respond(f"Erreur technique: {str(e)}")
```

---

## 8. IMPORTANT : Erreurs courantes

### 8.1 Erreur 404 "webhook not registered"

```
The requested webhook "GET account" is not registered.
```

**Cause:** Le bot appelle `/webhook/account` au lieu de `/webhook/discord-get-subscriber`

**Solution:** Utiliser les endpoints n8n corrects (voir section 2)

### 8.2 Erreur "workflow not active"

**Cause:** Le workflow n8n n'est pas active

**Solution:** Activer le workflow dans l'interface n8n (toggle en haut a droite)

### 8.3 Erreur parametres manquants

**Cause:** `project_id` ou `discord_user_id` non fourni

**Solution:** Toujours fournir les deux parametres

---

## 9. URLs de production

| Service | URL |
|---------|-----|
| n8n Webhooks | `https://n8n.azy.solutions/webhook/` |
| Stripe Results | `https://stripe.azy.solutions/webhook/` |

**Exemple complet :**
```
GET https://n8n.azy.solutions/webhook/discord-get-subscriber?project_id=torah-fun&discord_user_id=123456789
```

---

## 10. Contact

- **Questions n8n :** Equipe n8n
- **Questions API :** Equipe API
- **Questions Stripe :** Equipe n8n (workflows) + API (verification)

---

*Document genere le 2026-01-09*
