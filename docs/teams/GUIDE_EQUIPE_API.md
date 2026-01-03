# Guide Équipe API - Intégration Stripe MCP

**Date:** 2026-01-03
**Version:** 1.0
**Statut:** Prêt pour tests

---

## 1. Vue d'ensemble

Ce document décrit l'intégration Stripe pour la plateforme MCP (Model Context Protocol). L'architecture utilise n8n comme proxy pour gérer les paiements et l'authentification par API key.

### 1.1 Architecture

```
Client API                     n8n                         Stripe
──────────                     ───                         ──────
     │                          │                            │
     │  1. POST /subscribe      │                            │
     │─────────────────────────▶│                            │
     │                          │  2. Create Checkout        │
     │                          │───────────────────────────▶│
     │                          │                            │
     │                          │  3. Checkout URL           │
     │                          │◀───────────────────────────│
     │  4. Return checkout_url  │                            │
     │◀─────────────────────────│                            │
     │                          │                            │
     │  5. User pays on Stripe  │                            │
     │                          │                            │
     │                          │  6. Webhook event          │
     │                          │◀───────────────────────────│
     │                          │                            │
     │                          │  7. mcp-sub-success        │
     │                          │────▶ Create user           │
     │                          │────▶ Generate API key      │
     │                          │────▶ Set credits           │
     │                          │                            │
     │  8. User can now use API │                            │
     │  with API key            │                            │
```

---

## 2. Prérequis

### 2.1 Base de données PostgreSQL

Exécuter la migration pour créer les tables MCP :

```bash
cd /path/to/n8n-workflows
./scripts/mcp/migrate-stripe.sh --host localhost --user mcp --db mcp_db
```

**Tables créées :**

#### `mcp_users`
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | SERIAL | ID interne |
| `email` | VARCHAR(255) | Email unique |
| `api_key` | VARCHAR(64) | Clé API (format: `mcp_xxx...`) |
| `stripe_customer_id` | VARCHAR(255) | ID client Stripe |
| `stripe_subscription_id` | VARCHAR(255) | ID abonnement Stripe |
| `subscription_status` | VARCHAR(50) | active, canceled, past_due, free |
| `subscription_plan` | VARCHAR(50) | free, basic, premium, unlimited |
| `credits` | INTEGER | Crédits disponibles |
| `credits_used_this_month` | INTEGER | Crédits utilisés ce mois |
| `rate_limit_per_minute` | INTEGER | Limite requêtes/minute |
| `rate_limit_per_day` | INTEGER | Limite requêtes/jour |
| `is_active` | BOOLEAN | Compte actif |

#### `mcp_api_usage`
| Colonne | Type | Description |
|---------|------|-------------|
| `user_id` | INTEGER | FK vers mcp_users |
| `api_key` | VARCHAR(64) | Clé API utilisée |
| `tool_name` | VARCHAR(100) | Nom de l'outil appelé |
| `tokens_input` | INTEGER | Tokens en entrée |
| `tokens_output` | INTEGER | Tokens en sortie |
| `cost_usd` | DECIMAL | Coût estimé |
| `credits_consumed` | INTEGER | Crédits consommés |

#### `mcp_payment_history`
| Colonne | Type | Description |
|---------|------|-------------|
| `user_id` | INTEGER | FK vers mcp_users |
| `email` | VARCHAR(255) | Email |
| `stripe_payment_id` | VARCHAR(255) | ID paiement |
| `amount_cents` | INTEGER | Montant en centimes |
| `status` | VARCHAR(50) | succeeded, failed |
| `plan` | VARCHAR(50) | Plan souscrit |

#### `mcp_api_keys`
| Colonne | Type | Description |
|---------|------|-------------|
| `user_id` | INTEGER | FK vers mcp_users |
| `api_key` | VARCHAR(64) | Clé API |
| `name` | VARCHAR(100) | Nom de la clé |
| `is_active` | BOOLEAN | Clé active |
| `expires_at` | TIMESTAMP | Date d'expiration |

### 2.2 Variables d'environnement

```env
# URL de base n8n
N8N_WEBHOOK_URL=http://pi6.local:5678

# Base de données MCP
MCP_DB_HOST=localhost
MCP_DB_PORT=5432
MCP_DB_USER=mcp
MCP_DB_NAME=mcp
MCP_DB_PASSWORD=xxx
```

### 2.3 Workflows n8n à importer

| Workflow | Fichier | Endpoint |
|----------|---------|----------|
| Checkout Create | `workflows/Stripe/subscription-checkout-create.json` | `/webhook/subscription-checkout-create` |
| Webhook Handler | `workflows/Stripe/subscription-webhook-handler.json` | `/webhook/stripe-events` |
| Cancel | `workflows/Stripe/subscription-cancel.json` | `/webhook/subscription-cancel` |
| MCP Success | `workflows/MCP/mcp-sub-success.json` | `/webhook/mcp-sub-success` |
| MCP Renewal | `workflows/MCP/mcp-sub-renewal.json` | `/webhook/mcp-sub-renewal` |
| MCP Cancel | `workflows/MCP/mcp-sub-cancel.json` | `/webhook/mcp-sub-cancel` |
| MCP Failure | `workflows/MCP/mcp-sub-failure.json` | `/webhook/mcp-sub-failure` |

---

## 3. API Endpoints

### 3.1 Créer un checkout (inscription)

**Endpoint suggéré pour votre API :**

```
POST /api/v1/subscribe
```

**Implémentation :**

```python
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx

app = FastAPI()
N8N_WEBHOOK_URL = "http://pi6.local:5678"

class SubscribeRequest(BaseModel):
    email: str
    plan: str  # basic, premium, unlimited
    name: str | None = None
    company: str | None = None

class SubscribeResponse(BaseModel):
    success: bool
    checkout_url: str | None = None
    session_id: str | None = None
    error: str | None = None

@app.post("/api/v1/subscribe", response_model=SubscribeResponse)
async def create_subscription(req: SubscribeRequest):
    # Prix IDs Stripe (à configurer)
    price_ids = {
        "basic": "price_basic_xxx",
        "premium": "price_premium_xxx",
        "unlimited": "price_unlimited_xxx"
    }

    if req.plan not in price_ids:
        raise HTTPException(400, "Invalid plan")

    payload = {
        "project_id": "mcp",
        "price_id": price_ids[req.plan],
        "customer_email": req.email,
        "callbacks": {
            "success": f"{N8N_WEBHOOK_URL}/webhook/mcp-sub-success",
            "renewal": f"{N8N_WEBHOOK_URL}/webhook/mcp-sub-renewal",
            "cancel": f"{N8N_WEBHOOK_URL}/webhook/mcp-sub-cancel",
            "failure": f"{N8N_WEBHOOK_URL}/webhook/mcp-sub-failure"
        },
        "urls": {
            "success": "https://mcp.example.com/subscription/success",
            "cancel": "https://mcp.example.com/subscription/cancel"
        },
        "metadata": {
            "plan": req.plan,
            "name": req.name,
            "company": req.company
        }
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{N8N_WEBHOOK_URL}/webhook/subscription-checkout-create",
            json=payload
        )

        if resp.status_code == 200:
            data = resp.json()
            return SubscribeResponse(
                success=True,
                checkout_url=data.get("checkout_url"),
                session_id=data.get("session_id")
            )
        else:
            return SubscribeResponse(
                success=False,
                error="Failed to create checkout session"
            )
```

### 3.2 Annuler un abonnement

```python
class CancelRequest(BaseModel):
    api_key: str
    cancel_immediately: bool = False

@app.post("/api/v1/subscription/cancel")
async def cancel_subscription(req: CancelRequest):
    # Récupérer l'utilisateur par API key
    user = await get_user_by_api_key(req.api_key)

    if not user or not user.get("stripe_subscription_id"):
        raise HTTPException(404, "No active subscription")

    payload = {
        "project_id": "mcp",
        "stripe_subscription_id": user["stripe_subscription_id"],
        "cancel_immediately": req.cancel_immediately
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{N8N_WEBHOOK_URL}/webhook/subscription-cancel",
            json=payload
        )

        return {"success": resp.status_code == 200}
```

### 3.3 Statut abonnement

```python
@app.get("/api/v1/subscription/status")
async def get_subscription_status(api_key: str):
    user = await get_user_by_api_key(api_key)

    if not user:
        raise HTTPException(401, "Invalid API key")

    return {
        "email": user["email"],
        "plan": user["subscription_plan"],
        "status": user["subscription_status"],
        "credits": user["credits"],
        "credits_used": user["credits_used_this_month"],
        "rate_limit": {
            "per_minute": user["rate_limit_per_minute"],
            "per_day": user["rate_limit_per_day"]
        },
        "period_end": user.get("current_period_end")
    }
```

---

## 4. Authentification API Key

### 4.1 Format des clés

Les clés API MCP ont le format : `mcp_` suivi de 56 caractères alphanumériques.

Exemple : `mcp_Abc123...xyz789`

### 4.2 Middleware d'authentification

```python
from fastapi import Security, HTTPException
from fastapi.security import APIKeyHeader
import asyncpg

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(api_key: str = Security(api_key_header)):
    if not api_key or not api_key.startswith("mcp_"):
        raise HTTPException(401, "Invalid API key format")

    user = await get_user_by_api_key(api_key)

    if not user:
        raise HTTPException(401, "Invalid API key")

    if not user["is_active"]:
        raise HTTPException(403, "Account disabled")

    if user["subscription_status"] == "past_due":
        raise HTTPException(402, "Payment required")

    return user

async def get_user_by_api_key(api_key: str) -> dict | None:
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        row = await conn.fetchrow(
            """
            SELECT id, email, api_key, subscription_plan, subscription_status,
                   credits, credits_used_this_month, rate_limit_per_minute,
                   rate_limit_per_day, is_active, current_period_end
            FROM mcp_users
            WHERE api_key = $1
            """,
            api_key
        )
        return dict(row) if row else None
    finally:
        await conn.close()
```

### 4.3 Vérification des crédits

```python
async def check_credits(user: dict, credits_needed: int = 1):
    """Vérifie si l'utilisateur a assez de crédits."""
    if user["subscription_plan"] == "unlimited":
        return True

    available = user["credits"] - user["credits_used_this_month"]
    return available >= credits_needed

async def consume_credits(user_id: int, credits: int = 1):
    """Consomme des crédits pour un utilisateur."""
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute(
            """
            UPDATE mcp_users
            SET credits_used_this_month = credits_used_this_month + $2,
                updated_at = NOW()
            WHERE id = $1
            """,
            user_id, credits
        )
    finally:
        await conn.close()
```

### 4.4 Rate Limiting

```python
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# Limiter dynamique basé sur le plan
async def get_rate_limit(request: Request):
    api_key = request.headers.get("X-API-Key")
    if api_key:
        user = await get_user_by_api_key(api_key)
        if user:
            return f"{user['rate_limit_per_minute']}/minute"
    return "10/minute"  # Default pour non-authentifié
```

---

## 5. Callbacks Stripe → n8n → MCP

### 5.1 `checkout.session.completed` → mcp-sub-success

**Actions automatiques :**
1. ✅ Création/mise à jour utilisateur dans `mcp_users`
2. ✅ Génération d'une nouvelle API key
3. ✅ Attribution des crédits selon le plan
4. ✅ Configuration des rate limits
5. ✅ Log dans `mcp_payment_history`

**Réponse du workflow :**
```json
{
  "success": true,
  "email": "user@example.com",
  "api_key": "mcp_Abc123...",
  "plan": "premium",
  "credits": 5000
}
```

### 5.2 `invoice.payment_succeeded` → mcp-sub-renewal

**Actions automatiques :**
1. ✅ Ajout des crédits mensuels
2. ✅ Reset de `credits_used_this_month`
3. ✅ Mise à jour `current_period_end`
4. ✅ Log dans `mcp_payment_history`

### 5.3 `customer.subscription.deleted` → mcp-sub-cancel

**Actions automatiques :**
1. ✅ `subscription_status` → "canceled"
2. ✅ `subscription_plan` → "free"
3. ✅ Rate limits réduits au niveau gratuit

### 5.4 `invoice.payment_failed` → mcp-sub-failure

**Actions automatiques :**
1. ✅ `subscription_status` → "past_due"
2. ✅ Log dans `mcp_payment_history`

---

## 6. Plans et Limites

| Plan | Prix/mois | Crédits | Rate/min | Rate/jour |
|------|-----------|---------|----------|-----------|
| Free | 0€ | 100 | 10 | 100 |
| Basic | 4.99€ | 1,000 | 30 | 1,000 |
| Premium | 9.99€ | 5,000 | 60 | 5,000 |
| Unlimited | 19.99€ | ∞ | 120 | ∞ |

---

## 7. Tests

### 7.1 Script de test

```bash
# Tester tous les endpoints MCP
./scripts/test/test-stripe-webhooks.sh --base-url http://pi6.local:5678 --project mcp

# Mode verbose
./scripts/test/test-stripe-webhooks.sh --project mcp --verbose
```

### 7.2 Test manuel

```bash
# Simuler un checkout réussi
curl -X POST http://pi6.local:5678/webhook/mcp-sub-success \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "checkout.session.completed",
    "event_id": "evt_test_123",
    "data": {
      "customer_id": "cus_mcp_123",
      "customer_email": "api-user@example.com",
      "subscription_id": "sub_mcp_123",
      "amount_total": 999,
      "currency": "eur",
      "metadata": {
        "plan": "premium",
        "name": "API User",
        "company": "Example Corp"
      }
    }
  }'
```

### 7.3 Vérifier la création d'utilisateur

```sql
-- Vérifier l'utilisateur créé
SELECT email, api_key, subscription_plan, credits, rate_limit_per_minute
FROM mcp_users
WHERE email = 'api-user@example.com';
```

---

## 8. Tracking d'utilisation

### 8.1 Logger chaque appel API

```python
async def log_api_usage(
    user_id: int,
    api_key: str,
    tool_name: str,
    tokens_in: int = 0,
    tokens_out: int = 0,
    cost_usd: float = 0.0,
    credits: int = 1
):
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        await conn.execute(
            """
            INSERT INTO mcp_api_usage
            (user_id, api_key, tool_name, tokens_input, tokens_output,
             cost_usd, credits_consumed)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
            user_id, api_key, tool_name, tokens_in, tokens_out,
            cost_usd, credits
        )
    finally:
        await conn.close()
```

### 8.2 Statistiques d'utilisation

```python
@app.get("/api/v1/usage/stats")
async def get_usage_stats(api_key: str):
    user = await get_user_by_api_key(api_key)
    if not user:
        raise HTTPException(401, "Invalid API key")

    conn = await asyncpg.connect(DATABASE_URL)
    try:
        stats = await conn.fetchrow(
            """
            SELECT
                COUNT(*) as total_requests,
                SUM(tokens_input) as total_tokens_in,
                SUM(tokens_output) as total_tokens_out,
                SUM(credits_consumed) as total_credits,
                SUM(cost_usd) as total_cost
            FROM mcp_api_usage
            WHERE user_id = $1
            AND created_at >= date_trunc('month', NOW())
            """,
            user["id"]
        )
        return dict(stats)
    finally:
        await conn.close()
```

---

## 9. Checklist Intégration

- [ ] Migration DB exécutée (`./scripts/mcp/migrate-stripe.sh`)
- [ ] Workflows n8n importés et actifs
- [ ] Variables d'environnement configurées
- [ ] Endpoint `/subscribe` implémenté
- [ ] Authentification API key fonctionnelle
- [ ] Vérification des crédits implémentée
- [ ] Rate limiting configuré
- [ ] Logging d'utilisation actif
- [ ] Tests webhook passés

---

## 10. Support

**Fichiers de référence :**
- Migration DB : `scripts/mcp/migrate-stripe-columns.sql`
- Workflows : `workflows/MCP/mcp-sub-*.json`

**En cas de problème :**
1. Vérifier les logs n8n pour les exécutions de workflow
2. Vérifier que les workflows sont actifs
3. Tester avec le script `test-stripe-webhooks.sh`
4. Vérifier les tables PostgreSQL
