# Specifications pour l'equipe API

**Date:** 2025-01-05
**Statut:** FINAL
**Destinataire:** Equipe API / Backend

---

## 1. Contexte

L'architecture Discord Bot utilise:
- **Redis** pour les secrets Stripe (gere par n8n)
- **Stripe API** comme source de verite pour les abonnements
- **PostgreSQL** pour les credits utilisateurs (VOTRE RESPONSABILITE)

---

## 2. Ce que l'equipe API doit implementer

### 2.1 Schema PostgreSQL

```sql
CREATE TABLE IF NOT EXISTS user_credits (
    project_id VARCHAR(50) NOT NULL,
    discord_user_id VARCHAR(50) NOT NULL,
    credits_remaining INTEGER DEFAULT 0,
    credits_total INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, discord_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_credits_project ON user_credits(project_id);
```

### 2.2 Endpoints a exposer

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `/webhook/credits-get` | GET | Recupere les credits d'un utilisateur |
| `/webhook/credits-debit` | POST | Debite des credits |
| `/webhook/credits-credit` | POST | Credite des credits |
| `/webhook/credits-set` | POST | Definit les credits (admin/webhook) |

---

## 3. Specifications des endpoints

### 3.1 GET /webhook/credits-get

**Description:** Recupere les credits d'un utilisateur

**Input:**
```http
GET /webhook/credits-get?project_id=torah&discord_user_id=123456789 HTTP/1.1
Host: pi6.local:5678
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

### 3.2 POST /webhook/credits-debit

**Description:** Debite des credits (utilisation)

**Input:**
```http
POST /webhook/credits-debit HTTP/1.1
Host: pi6.local:5678
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
UPDATE user_credits
SET credits_remaining = credits_remaining - :amount,
    updated_at = CURRENT_TIMESTAMP
WHERE project_id = :project_id
  AND discord_user_id = :discord_user_id
  AND credits_remaining >= :amount
RETURNING credits_remaining, credits_total;
```

---

### 3.3 POST /webhook/credits-credit

**Description:** Credite des credits (renouvellement, achat)

**Input:**
```http
POST /webhook/credits-credit HTTP/1.1
Host: pi6.local:5678
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
INSERT INTO user_credits (project_id, discord_user_id, credits_remaining, credits_total)
VALUES (:project_id, :discord_user_id, :amount, :amount)
ON CONFLICT (project_id, discord_user_id)
DO UPDATE SET
    credits_remaining = user_credits.credits_remaining + :amount,
    credits_total = user_credits.credits_total + :amount,
    updated_at = CURRENT_TIMESTAMP
RETURNING credits_remaining, credits_total;
```

---

### 3.4 POST /webhook/credits-set

**Description:** Definit les credits (admin, initialisation)

**Input:**
```http
POST /webhook/credits-set HTTP/1.1
Host: pi6.local:5678
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
INSERT INTO user_credits (project_id, discord_user_id, credits_remaining, credits_total)
VALUES (:project_id, :discord_user_id, :credits_remaining, :credits_total)
ON CONFLICT (project_id, discord_user_id)
DO UPDATE SET
    credits_remaining = :credits_remaining,
    credits_total = :credits_total,
    updated_at = CURRENT_TIMESTAMP
RETURNING credits_remaining, credits_total;
```

---

## 4. Appels depuis les webhooks Stripe

Les webhooks Stripe (geres par n8n) appelleront vos endpoints:

| Event Stripe | Action | Endpoint appele |
|--------------|--------|-----------------|
| `checkout.session.completed` | Nouvel abonnement | `POST /credits-set` |
| `invoice.paid` | Renouvellement mensuel | `POST /credits-credit` |
| `customer.subscription.deleted` | Annulation | `POST /credits-set` (credits=0) |

**Exemple d'appel depuis n8n:**
```javascript
// Apres validation webhook Stripe
const credits = plan.metadata.credits_per_month || 1000;

await $http.request({
    method: 'POST',
    url: 'http://localhost:5678/webhook/credits-set',
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
| Logs | Logger toutes les operations de credits |

---

## 7. Tests recommandes

```bash
# Creer un utilisateur
curl -X POST http://pi6.local:5678/webhook/credits-set \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: torah" \
  -d '{"discord_user_id": "test123", "credits_remaining": 100, "credits_total": 100}'

# Recuperer credits
curl "http://pi6.local:5678/webhook/credits-get?project_id=torah&discord_user_id=test123"

# Debiter
curl -X POST http://pi6.local:5678/webhook/credits-debit \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: torah" \
  -d '{"discord_user_id": "test123", "amount": 10, "reason": "test"}'

# Crediter
curl -X POST http://pi6.local:5678/webhook/credits-credit \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: torah" \
  -d '{"discord_user_id": "test123", "amount": 50, "reason": "bonus"}'
```

---

## 8. Questions?

Contacter l'equipe n8n pour toute question sur l'integration.
