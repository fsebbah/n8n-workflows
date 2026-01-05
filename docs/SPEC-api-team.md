# Specifications pour l'equipe API

**Date:** 2025-01-05
**Statut:** FINAL v2
**Destinataire:** Equipe API / Backend

---

## 1. Contexte

L'architecture Discord Bot utilise:
- **Redis** pour les secrets Stripe (gere par n8n)
- **Stripe API** comme source de verite pour les abonnements
- **PostgreSQL** pour les credits utilisateurs (VOTRE RESPONSABILITE)

**Base URL API:** `http://pi6.local:3031`

---

## 2. Ce que l'equipe API doit implementer

### 2.1 Schema PostgreSQL

```sql
-- Table principale des credits
CREATE TABLE IF NOT EXISTS user_credits (
    project_id VARCHAR(50) NOT NULL,
    discord_user_id VARCHAR(50) NOT NULL,
    credits_remaining INTEGER DEFAULT 0,
    credits_total INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, discord_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_credits_project ON user_credits(project_id);

-- Table d'historique des transactions
CREATE TABLE IF NOT EXISTS credit_transactions (
    id SERIAL PRIMARY KEY,
    project_id VARCHAR(50) NOT NULL,
    discord_user_id VARCHAR(50) NOT NULL,
    operation VARCHAR(20) NOT NULL,  -- 'debit', 'credit', 'set'
    amount INTEGER NOT NULL,
    reason VARCHAR(100),
    credits_before INTEGER,
    credits_after INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user
    ON credit_transactions(project_id, discord_user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_date
    ON credit_transactions(created_at);
```

### 2.2 Endpoints a exposer

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `/api/webhook/account` | GET | Recupere les credits d'un utilisateur |
| `/api/webhook/account/debit` | POST | Debite des credits |
| `/api/webhook/account/credit` | POST | Credite des credits |
| `/api/webhook/account/set` | POST | Definit les credits (admin/webhook) |

---

## 3. Specifications des endpoints

### 3.1 GET /api/webhook/account

**Description:** Recupere les credits d'un utilisateur

**Input:**
```http
GET /api/webhook/account?project_id=torah&discord_user_id=123456789 HTTP/1.1
Host: pi6.local:3031
X-Project-ID: torah
```

**Output (succes):**
```json
{
    "success": true,
    "credits": {
        "project_id": "torah",
        "discord_user_id": "123456789",
        "credits_remaining": 850,
        "credits_total": 1000,
        "updated_at": "2025-01-05T10:00:00Z"
    }
}
```

**Output (utilisateur non trouve):**
```json
{
    "success": false,
    "error": {
        "code": 404,
        "message": "User not found",
        "status": "NOT_FOUND"
    }
}
```

---

### 3.2 POST /api/webhook/account/debit

**Description:** Debite des credits (utilisation)

**Input:**
```http
POST /api/webhook/account/debit HTTP/1.1
Host: pi6.local:3031
Content-Type: application/json
X-Project-ID: torah

{
    "discord_user_id": "123456789",
    "amount": 1,
    "reason": "translation"
}
```

**Output (succes):**
```json
{
    "success": true,
    "credits": {
        "credits_remaining": 849,
        "credits_total": 1000,
        "debited": 1
    }
}
```

**Output (credits insuffisants):**
```json
{
    "success": false,
    "error": {
        "code": 402,
        "message": "Insufficient credits",
        "status": "PAYMENT_REQUIRED",
        "credits_remaining": 0
    }
}
```

**Logique SQL:**
```sql
-- 1. Verifier et debiter
UPDATE user_credits
SET credits_remaining = credits_remaining - :amount,
    updated_at = CURRENT_TIMESTAMP
WHERE project_id = :project_id
  AND discord_user_id = :discord_user_id
  AND credits_remaining >= :amount
RETURNING credits_remaining, credits_total;

-- 2. Logger la transaction
INSERT INTO credit_transactions
    (project_id, discord_user_id, operation, amount, reason, credits_before, credits_after)
VALUES
    (:project_id, :discord_user_id, 'debit', :amount, :reason, :before, :after);
```

---

### 3.3 POST /api/webhook/account/credit

**Description:** Credite des credits (renouvellement, achat)

**Input:**
```http
POST /api/webhook/account/credit HTTP/1.1
Host: pi6.local:3031
Content-Type: application/json
X-Project-ID: torah

{
    "discord_user_id": "123456789",
    "amount": 1000,
    "reason": "subscription_renewal"
}
```

**Output:**
```json
{
    "success": true,
    "credits": {
        "credits_remaining": 1849,
        "credits_total": 2000,
        "credited": 1000
    }
}
```

**Logique SQL:**
```sql
-- 1. Crediter (upsert)
INSERT INTO user_credits (project_id, discord_user_id, credits_remaining, credits_total)
VALUES (:project_id, :discord_user_id, :amount, :amount)
ON CONFLICT (project_id, discord_user_id)
DO UPDATE SET
    credits_remaining = user_credits.credits_remaining + :amount,
    credits_total = user_credits.credits_total + :amount,
    updated_at = CURRENT_TIMESTAMP
RETURNING credits_remaining, credits_total;

-- 2. Logger la transaction
INSERT INTO credit_transactions
    (project_id, discord_user_id, operation, amount, reason, credits_before, credits_after)
VALUES
    (:project_id, :discord_user_id, 'credit', :amount, :reason, :before, :after);
```

---

### 3.4 POST /api/webhook/account/set

**Description:** Definit les credits (admin, initialisation)

**Input:**
```http
POST /api/webhook/account/set HTTP/1.1
Host: pi6.local:3031
Content-Type: application/json
X-Project-ID: torah

{
    "discord_user_id": "123456789",
    "credits_remaining": 1000,
    "credits_total": 1000
}
```

**Output:**
```json
{
    "success": true,
    "credits": {
        "credits_remaining": 1000,
        "credits_total": 1000
    }
}
```

**Logique SQL:**
```sql
-- 1. Set (upsert)
INSERT INTO user_credits (project_id, discord_user_id, credits_remaining, credits_total)
VALUES (:project_id, :discord_user_id, :credits_remaining, :credits_total)
ON CONFLICT (project_id, discord_user_id)
DO UPDATE SET
    credits_remaining = :credits_remaining,
    credits_total = :credits_total,
    updated_at = CURRENT_TIMESTAMP
RETURNING credits_remaining, credits_total;

-- 2. Logger la transaction
INSERT INTO credit_transactions
    (project_id, discord_user_id, operation, amount, reason, credits_before, credits_after)
VALUES
    (:project_id, :discord_user_id, 'set', :credits_remaining, 'admin_set', :before, :after);
```

---

## 4. Appels depuis les webhooks Stripe

Les webhooks Stripe (geres par n8n) appelleront vos endpoints:

| Event Stripe | Action | Endpoint appele |
|--------------|--------|-----------------|
| `checkout.session.completed` | Nouvel abonnement | `POST /api/webhook/account/set` |
| `invoice.paid` | Renouvellement mensuel | `POST /api/webhook/account/credit` |
| `customer.subscription.deleted` | Annulation | `POST /api/webhook/account/set` (credits=0) |

**Exemple d'appel depuis n8n:**
```javascript
// Apres validation webhook Stripe
const credits = plan.metadata.credits_per_month || 1000;

await $http.request({
    method: 'POST',
    url: 'http://pi6.local:3031/api/webhook/account/set',
    headers: { 'X-Project-ID': projectId },
    body: {
        discord_user_id: metadata.discord_user_id,
        credits_remaining: credits,
        credits_total: credits
    }
});
```

---

## 5. Codes d'erreur standards

| Code | Status | Description |
|------|--------|-------------|
| 200 | OK | Succes |
| 400 | BAD_REQUEST | Parametres manquants/invalides |
| 402 | PAYMENT_REQUIRED | Credits insuffisants |
| 404 | NOT_FOUND | Utilisateur non trouve |
| 500 | INTERNAL_ERROR | Erreur serveur |

---

## 6. Securite

| Aspect | Implementation |
|--------|----------------|
| Authentification | Header `X-Project-ID` requis |
| Validation | Verifier que `amount > 0` |
| Atomicite | Utiliser transactions SQL |
| Logs | Table `credit_transactions` pour audit |

---

## 7. Tests recommandes

```bash
# Base URL
API_URL="http://pi6.local:3031"

# Creer un utilisateur
curl -X POST "$API_URL/api/webhook/account/set" \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: torah" \
  -d '{"discord_user_id": "test123", "credits_remaining": 100, "credits_total": 100}'

# Recuperer credits
curl "$API_URL/api/webhook/account?project_id=torah&discord_user_id=test123"

# Debiter
curl -X POST "$API_URL/api/webhook/account/debit" \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: torah" \
  -d '{"discord_user_id": "test123", "amount": 10, "reason": "test"}'

# Crediter
curl -X POST "$API_URL/api/webhook/account/credit" \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: torah" \
  -d '{"discord_user_id": "test123", "amount": 50, "reason": "bonus"}'
```

---

## 8. Questions?

Contacter l'equipe n8n pour toute question sur l'integration.
