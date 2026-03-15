# Spec n8n : Webhook create-free-subscriber

**Date:** 2026-03-13
**Priorite:** Haute
**Equipe:** n8n

---

## Objectif

Creer un webhook n8n pour enregistrer un abonne au plan gratuit (free) avec 1500 credits initiaux. Ce webhook bypass Stripe car Stripe n'accepte pas les abonnements a 0$.

---

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Discord   │────▶│  Plugin Bot │────▶│     n8n     │
│ /chess      │     │ subscribe   │     │  Webhook    │
│  subscribe  │     │  command    │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │   Postgres  │
                                        │ subscribers │
                                        │  + credits  │
                                        └─────────────┘
```

---

## Endpoint

| Parametre | Valeur |
|-----------|--------|
| **URL** | `POST /webhook/create-free-subscriber` |
| **Content-Type** | `application/json` |
| **Response** | `application/json` |

---

## Input

```json
{
  "discord_user_id": "636639897767378954",
  "discord_username": "john_doe",
  "discord_guild_id": "1480582323639554264",
  "plan_id": "free",
  "initial_credits": 1500
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `discord_user_id` | string | ID Discord de l'utilisateur |
| `discord_username` | string | Nom d'utilisateur Discord |
| `discord_guild_id` | string | ID du serveur Discord |
| `plan_id` | string | Toujours "free" pour ce webhook |
| `initial_credits` | number | Credits initiaux (1500) |

---

## Output

### Succes

```json
{
  "success": true,
  "subscriber_id": "sub_abc123",
  "credits": 1500,
  "plan": "free",
  "message": "Abonnement cree avec succes"
}
```

### Deja abonne

```json
{
  "success": false,
  "error": "already_subscribed",
  "message": "L'utilisateur est deja abonne"
}
```

### Erreur

```json
{
  "success": false,
  "error": "database_error",
  "message": "Erreur lors de la creation"
}
```

---

## Workflow n8n

### Node 1: Webhook Trigger

```json
{
  "name": "Create Free Subscriber",
  "type": "n8n-nodes-base.webhook",
  "parameters": {
    "httpMethod": "POST",
    "path": "create-free-subscriber",
    "responseMode": "responseNode"
  }
}
```

---

### Node 2: Validate Input (Function)

```javascript
const body = $input.first().json.body;

const discordUserId = body.discord_user_id;
const discordUsername = body.discord_username;
const discordGuildId = body.discord_guild_id;
const planId = body.plan_id || 'free';
const initialCredits = body.initial_credits || 1500;

if (!discordUserId) {
  return [{
    json: {
      success: false,
      error: 'missing_user_id',
      message: 'discord_user_id requis'
    }
  }];
}

return [{
  json: {
    discord_user_id: discordUserId,
    discord_username: discordUsername || 'unknown',
    discord_guild_id: discordGuildId,
    plan_id: planId,
    initial_credits: initialCredits
  }
}];
```

---

### Node 3: Check Existing Subscriber (Postgres)

```sql
SELECT id, plan_id, created_at
FROM subscribers
WHERE discord_user_id = $1
  AND project_id = 'chess-bot'
LIMIT 1;
```

**Parametres:**
- `$1`: `{{ $json.discord_user_id }}`

---

### Node 4: Already Subscribed? (IF)

```json
{
  "name": "Already Subscribed?",
  "type": "n8n-nodes-base.if",
  "parameters": {
    "conditions": {
      "number": [{
        "value1": "={{ $json.length }}",
        "operation": "larger",
        "value2": 0
      }]
    }
  }
}
```

**Si TRUE → Node: Return Already Subscribed**

---

### Node 5: Create Subscriber (Postgres)

```sql
INSERT INTO subscribers (
  id,
  project_id,
  discord_user_id,
  discord_username,
  discord_guild_id,
  plan_id,
  status,
  stripe_customer_id,
  stripe_subscription_id,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'chess-bot',
  $1,
  $2,
  $3,
  $4,
  'active',
  NULL,
  NULL,
  NOW(),
  NOW()
)
RETURNING id;
```

**Parametres:**
- `$1`: `{{ $('Validate Input').first().json.discord_user_id }}`
- `$2`: `{{ $('Validate Input').first().json.discord_username }}`
- `$3`: `{{ $('Validate Input').first().json.discord_guild_id }}`
- `$4`: `{{ $('Validate Input').first().json.plan_id }}`

---

### Node 6: Create Credits Record (Postgres)

```sql
INSERT INTO credits (
  id,
  project_id,
  discord_user_id,
  amount,
  source,
  description,
  created_at
) VALUES (
  gen_random_uuid(),
  'chess-bot',
  $1,
  $2,
  'subscription',
  'Credits initiaux plan free',
  NOW()
)
RETURNING id, amount;
```

**Parametres:**
- `$1`: `{{ $('Validate Input').first().json.discord_user_id }}`
- `$2`: `{{ $('Validate Input').first().json.initial_credits }}`

---

### Node 7: Update Credits Balance (Postgres)

```sql
INSERT INTO credits_balance (
  project_id,
  discord_user_id,
  balance,
  updated_at
) VALUES (
  'chess-bot',
  $1,
  $2,
  NOW()
)
ON CONFLICT (project_id, discord_user_id)
DO UPDATE SET
  balance = credits_balance.balance + $2,
  updated_at = NOW()
RETURNING balance;
```

---

### Node 8: Return Success (Respond to Webhook)

```javascript
const subscriberId = $('Create Subscriber').first().json.id;
const credits = $('Validate Input').first().json.initial_credits;
const plan = $('Validate Input').first().json.plan_id;

return [{
  json: {
    success: true,
    subscriber_id: subscriberId,
    credits: credits,
    plan: plan,
    message: 'Abonnement cree avec succes'
  }
}];
```

---

### Node: Return Already Subscribed (Error Branch)

```javascript
return [{
  json: {
    success: false,
    error: 'already_subscribed',
    message: "L'utilisateur est deja abonne"
  }
}];
```

---

## Schema de base de donnees

### Table: subscribers

```sql
CREATE TABLE IF NOT EXISTS subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(50) NOT NULL,
  discord_user_id VARCHAR(50) NOT NULL,
  discord_username VARCHAR(100),
  discord_guild_id VARCHAR(50),
  plan_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  stripe_customer_id VARCHAR(100),
  stripe_subscription_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, discord_user_id)
);
```

### Table: credits

```sql
CREATE TABLE IF NOT EXISTS credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(50) NOT NULL,
  discord_user_id VARCHAR(50) NOT NULL,
  amount INTEGER NOT NULL,
  source VARCHAR(50),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Table: credits_balance

```sql
CREATE TABLE IF NOT EXISTS credits_balance (
  project_id VARCHAR(50) NOT NULL,
  discord_user_id VARCHAR(50) NOT NULL,
  balance INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (project_id, discord_user_id)
);
```

---

## Webhook get-subscriber (reference)

Le webhook `get-subscriber` est utilise par la commande `/lichess connect` pour verifier l'abonnement.

### Input

```json
{
  "discord_user_id": "636639897767378954"
}
```

### Output

```json
{
  "success": true,
  "subscriber": {
    "id": "sub_abc123",
    "plan_id": "free",
    "status": "active",
    "credits_balance": 1500,
    "created_at": "2026-03-13T10:00:00Z"
  }
}
```

---

## Test

```bash
# Tester le webhook
curl -X POST http://pi6.local:5678/webhook/create-free-subscriber \
  -H "Content-Type: application/json" \
  -d '{
    "discord_user_id": "123456789",
    "discord_username": "test_user",
    "discord_guild_id": "987654321",
    "plan_id": "free",
    "initial_credits": 1500
  }'

# Reponse attendue:
# {"success":true,"subscriber_id":"...","credits":1500,"plan":"free","message":"Abonnement cree avec succes"}
```

---

## Flux complet

```
1. User: /chess subscribe
         │
         ▼
2. Bot: Verifie si deja abonne (get-subscriber)
         │
         ├── Deja abonne → "Tu es deja abonne!"
         │
         ▼
3. Bot: Appelle create-free-subscriber
         │
         ▼
4. n8n: Cree subscriber + credits
         │
         ▼
5. Bot: Cree salon prive Discord
         │
         ▼
6. Bot: Envoie messages de bienvenue
         │
         ▼
7. User peut utiliser /lichess connect
```
