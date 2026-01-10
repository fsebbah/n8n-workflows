# Analyse: NotificationListener et Creation de Salles Privees

**Date:** 2026-01-09
**Status:** En cours - Actions n8n et API en parallele
**Plugins concernes:** Bot Appetit, Torah Bot

---

## 1. Contexte

Apres un paiement Stripe reussi, le bot doit:
1. Envoyer un DM a l'utilisateur
2. Envoyer un message dans le canal d'origine
3. Creer une salle privee dans la categorie correspondant au plan

Le flux actuel:
```
Stripe -> Webhook -> n8n -> Redis -> NotificationListener -> Actions Discord
```

---

## 2. Donnees recues de n8n (actuel)

```json
{
  "user_id": "1455174904323379215",
  "username": "",
  "guild_id": "",
  "channel_id": "",
  "event": "subscription_active",
  "plan_id": "price_1SnRv7ASFmxXUAAwbT8A4Uzt",
  "credits": "1500",
  "embed": "{\"title\": \"Abonnement active !\", ...}",
  "actions": "{\"send_dm\": true, \"send_channel_message\": false, \"create_private_channel\": false}",
  "timestamp": "1767970462"
}
```

---

## 3. Problemes identifies

### 3.1 Donnees manquantes

| Donnee | Statut | Impact |
|--------|--------|--------|
| `user_id` | OK | DM fonctionne |
| `username` | Vide | Affichage incomplet |
| `guild_id` | Vide | Impossible de creer la salle |
| `channel_id` | Vide | Impossible d'envoyer dans le canal |
| `create_private_channel` | `false` | Creation desactivee |

### 3.2 Event type mismatch

**Recu:** `subscription_active`

**Handlers configures (Bot Appetit):**
- `checkout_completed`
- `subscription_renewed`
- `subscription_cancelled`
- `payment_failed`

→ Aucun handler pour `subscription_active`

### 3.3 Plan ID format

**Recu:** `price_1SnRv7ASFmxXUAAwbT8A4Uzt` (Stripe price ID)

**Attendu:** `starter`, `chef`, `premium` (nom interne)

**Mapping plugin:**
```python
_category_mapping = {
    "starter": CATEGORY_STARTER,
    "chef": CATEGORY_CHEF,
    "premium": CATEGORY_PREMIUM,
}
```

→ `price_xxx` ne matchera jamais `starter/chef/premium`

### 3.4 Categories Discord non configurees

```env
CATEGORY_STARTER=0
CATEGORY_CHEF=0
CATEGORY_PREMIUM=0
```

→ IDs Discord a configurer

### 3.5 Handler fallback recommande (Framework)

Pour eviter le blocage sur l'event type, le plugin peut enregistrer plusieurs events:

```python
# Enregistrer le meme handler pour plusieurs events
for event in ["checkout_completed", "subscription_active"]:
    listener.register_handler(event, handle_checkout)
```

---

## 4. Sources des donnees manquantes

| Donnee | Source possible | Responsable |
|--------|-----------------|-------------|
| `username` | Stripe metadata (via /subscribe) ou Discord API | n8n ou Plugin |
| `guild_id` | Stripe metadata (via /subscribe) ou config plugin | n8n ou Plugin |
| `channel_id` | Stripe metadata (via /subscribe) | n8n |
| `plan_id` interne | Mapping Stripe price → nom interne | n8n ou Plugin |
| `create_private_channel` | Logique n8n | n8n |

---

## 5. Solutions proposees

### Option C: Hybride (RECOMMANDEE par Framework)

**Repartition des responsabilites:**

| Responsable | Donnee/Action | Status |
|-------------|---------------|--------|
| Framework | Envoyer `guild_id`, `channel_id`, `username` a n8n | **FAIT** (PR #93) |
| n8n | Stocker ces metadata lors du checkout | A faire |
| n8n | Retransmettre dans Redis apres paiement | A faire |
| n8n | `create_private_channel: true` | A faire |
| n8n | Event `checkout_completed` | A faire |
| Plugin | Mapping `price_id` → `plan_name` | A faire |

**Pourquoi le mapping cote plugin ?**
- Chaque plugin a ses propres plans (Torah: DafYomi/Premium, Appetit: Starter/Chef/Premium)
- n8n ne devrait pas connaitre la logique metier de chaque plugin
- Plus flexible : ajout de plans sans modifier n8n

### Option D: Fallback plugin (solution de secours)

Si donnees manquantes:
```python
# username - recuperable via Discord API
user = await bot.fetch_user(int(user_id))
username = user.name

# guild_id - fallback sur config
guild_id = msg.guild_id or os.getenv("DISCORD_GUILD_ID")
```

**Limite:** Fonctionne seulement si le bot n'est que sur un serveur

---

## 6. Actions requises

### 6.1 Cote Framework

| Action | Priorite | Status |
|--------|----------|--------|
| Passer `discord_username`, `guild_id`, `channel_id` dans `/subscribe` | Haute | **FAIT** (PR #93) |

### 6.2 Cote n8n

| Action | Priorite | Status |
|--------|----------|--------|
| Stocker metadata Discord lors du checkout Stripe | Haute | **EN COURS** |
| Extraire `discord_username`, `guild_id`, `channel_id` dans discord-subscribe | Haute | A faire |
| Recuperer credits depuis Price metadata Stripe | Haute | **FAIT** |
| Envoyer `discord_username`, `guild_id`, `channel_id` a l'API | Haute | A faire |
| Envoyer `reason: checkout_completed` a l'API | Haute | **FAIT** |

**Note:** n8n envoie les donnees a l'API. C'est l'API qui publie dans Redis et determine `create_private_channel`.

### 6.3 Cote API (torah-api)

| Action | Priorite | Status |
|--------|----------|--------|
| Recevoir `discord_username`, `guild_id`, `channel_id` de n8n | Haute | A verifier |
| Publier ces champs dans Redis Stream | Haute | A faire |
| Envoyer `event: checkout_completed` (pas `subscription_active`) | Haute | A faire |
| Definir `create_private_channel: true` pour checkout | Haute | A faire |
| Definir `send_channel_message: true` si `channel_id` present | Haute | A faire |

### 6.4 Cote Plugin

| Action | Priorite | Status |
|--------|----------|--------|
| Ajouter handler pour `subscription_active` (temporaire) | Haute | A faire |
| Configurer `CATEGORY_*` dans .env.local | Haute | A faire |
| Ajouter mapping `STRIPE_PLAN_*` → `plan_name` | Moyenne | A faire |

---

## 7. Reponses aux questions

| # | Question | Reponse |
|---|----------|---------|
| 1 | Qui cree physiquement la salle privee? | **Framework** (`NotificationListener._create_private_channel`). Le handler plugin retourne seulement l'embed. |
| 2 | n8n peut-il envoyer `checkout_completed`? | En attente reponse n8n |
| 3 | Le framework peut-il passer les metadata? | **OUI - FAIT** dans PR #93 |
| 4 | Le `plan_id` est-il configurable? | En attente reponse n8n |
| 5 | Event different nouveau vs renouvellement? | En attente decision Product |

---

## 8. Flux cible

```
1. Utilisateur tape /subscribe
         |
2. Framework passe metadata Discord a n8n:
   - discord_user_id
   - discord_username      <- FAIT (PR #93)
   - guild_id              <- FAIT (PR #93)
   - channel_id            <- FAIT (PR #93)
   - plan_id
   - customer_email
         |
3. n8n cree session Stripe avec metadata
         |
4. Stripe checkout -> paiement reussi
         |
5. Stripe webhook -> n8n
         |
6. n8n envoie a Redis:
   {
     user_id: "123",
     username: "John",        <- A FAIRE n8n
     guild_id: "456",         <- A FAIRE n8n
     channel_id: "789",       <- A FAIRE n8n
     event: "checkout_completed",  <- A FAIRE n8n
     plan_id: "price_xxx",
     create_private_channel: true  <- A FAIRE n8n
   }
         |
7. NotificationListener recoit le message
         |
8. Handler plugin:
   - Convertit price_id -> plan_name
   - Genere les embeds personnalises
         |
9. Framework execute les actions:
   - Envoie DM
   - Envoie message dans channel_id
   - Cree salle privee dans CATEGORY_*
```

---

## 9. Configuration cible

### 9.1 Stripe Price Metadata (Dashboard Stripe)

| Price | credits_per_month | create_private_channel |
|-------|-------------------|------------------------|
| Starter (price_xxx) | 500 | false |
| Chef (price_yyy) | 1500 | true |
| Premium (price_zzz) | 5000 | true |

### 9.2 Plugin (.env.local)

```env
# Categories Discord pour salles privees
CATEGORY_STARTER=1234567890123456789
CATEGORY_CHEF=1234567890123456790
CATEGORY_PREMIUM=1234567890123456791

# Mapping Stripe price -> plan (cote plugin)
STRIPE_PLAN_STARTER=price_xxx
STRIPE_PLAN_CHEF=price_yyy
STRIPE_PLAN_PREMIUM=price_zzz
```

---

## 10. RESUME ACTIONS n8n

### 10.1 Donnees recues du framework (PR #93)

```json
POST /webhook/discord-subscribe
{
  "project_id": "bot-appetit",
  "discord_user_id": "123456789",
  "plan_id": "price_xxx",
  "customer_email": "user@example.com",
  "discord_username": "JohnDoe",
  "discord_guild_id": "815368074995040286",
  "discord_channel_id": "123456789012345678"
}
```

### 10.2 Actions detaillees n8n

#### Workflow: discord-subscribe

| # | Node | Action | Status |
|---|------|--------|--------|
| 1 | **Validate Input** | Extraire `discord_username` du body | A faire |
| 2 | **Validate Input** | Extraire `discord_guild_id` du body | A faire |
| 3 | **Validate Input** | Extraire `discord_channel_id` du body | A faire |
| 4 | **Check Project** | Passer `discord_username` dans l'output | A faire |
| 5 | **Check Project** | Passer `discord_guild_id` dans l'output | A faire |
| 6 | **Check Project** | Passer `discord_channel_id` dans l'output | A faire |
| 7 | **Create Stripe Checkout** | Metadata deja configure (avec fix `=`) | **FAIT** |

#### Workflow: stripe-webhook-handler

| # | Node | Action | Status |
|---|------|--------|--------|
| 1 | **Extract & Validate** | Extraire `discord_username` des metadata Stripe | **FAIT** |
| 2 | **Extract & Validate** | Extraire `discord_guild_id` des metadata Stripe | **FAIT** |
| 3 | **Extract & Validate** | Extraire `discord_channel_id` des metadata Stripe | **FAIT** |
| 4 | **Extract & Validate** | Extraire `customer_email` de l'event Stripe | A faire |
| 5 | **Process Event** | Inclure ces champs dans l'output | **FAIT** |
| 6 | **Process Event** | Inclure `customer_email` dans l'output | A faire |
| 7 | **Get Price Info** | Recuperer `credits_per_month` du Price Stripe | **FAIT** |
| 8 | **Get Price Info** | Recuperer `create_private_channel` du Price Stripe | A faire |
| 9 | **Call Credits API** | Envoyer `discord_username` a l'API | A faire |
| 10 | **Call Credits API** | Envoyer `discord_guild_id` a l'API | A faire |
| 11 | **Call Credits API** | Envoyer `discord_channel_id` a l'API | A faire |
| 12 | **Call Credits API** | Envoyer `customer_email` a l'API | A faire |
| 13 | **Call Credits API** | Envoyer `create_private_channel` a l'API | A faire |
| 14 | **Call Credits API** | Envoyer `reason` a l'API | A faire |

### 10.3 Code cible - Call Credits API body

```javascript
{{ JSON.stringify({
  discord_user_id: $('Process Event').item.json.discord_user_id,
  credits_remaining: parseInt($json.items.data[0].price.metadata.credits_per_month || '1000'),
  credits_total: parseInt($json.items.data[0].price.metadata.credits_per_month || '1000'),
  create_private_channel: $json.items.data[0].price.metadata.create_private_channel === 'true',
  subscription_status: $('Process Event').item.json.subscription_status,
  plan_id: $('Process Event').item.json.plan_id,
  current_period_end: $('Process Event').item.json.current_period_end,
  reason: $('Process Event').item.json.reason,
  metadata: $('Process Event').item.json.metadata,
  discord_username: $('Process Event').item.json.discord_username,
  discord_guild_id: $('Process Event').item.json.discord_guild_id,
  discord_channel_id: $('Process Event').item.json.discord_channel_id,
  customer_email: $('Process Event').item.json.customer_email
}) }}
```

### 10.4 Stripe Price Metadata requis

Dans Stripe Dashboard, chaque Price doit avoir:

| Metadata Key | Type | Exemple |
|--------------|------|---------|
| `credits_per_month` | string | `"1500"` |
| `create_private_channel` | string | `"true"` ou `"false"` |

---

## 11. RESUME ACTIONS API (torah-api)

### 11.1 Flux n8n → API → Redis

```
n8n (stripe-webhook-handler)
         |
         | POST /api/webhook/account/set
         | Body: {
         |   discord_user_id,
         |   credits_remaining,
         |   credits_total,
         |   subscription_status,
         |   plan_id,
         |   current_period_end,
         |   metadata: {
         |     stripe_session_id,
         |     stripe_customer_id,
         |     stripe_subscription_id
         |   },
         |   discord_username,      <- NOUVEAU
         |   discord_guild_id,      <- NOUVEAU
         |   discord_channel_id     <- NOUVEAU
         | }
         |
         v
API (torah-api)
         |
         | XADD discord:dm:{project_id}
         | Message: {
         |   user_id,
         |   username,              <- A AJOUTER
         |   guild_id,              <- A AJOUTER
         |   channel_id,            <- A AJOUTER
         |   event,                 <- CHANGER: checkout_completed
         |   plan_id,
         |   credits,
         |   embed,
         |   actions: {
         |     send_dm: true,
         |     send_channel_message: true,   <- A ACTIVER
         |     create_private_channel: true  <- A ACTIVER
         |   }
         | }
         |
         v
NotificationListener (plugin)
```

### 11.2 Donnees recues de n8n (actuel)

```json
POST /api/webhook/account/set
{
  "discord_user_id": "1455174904323379215",
  "credits_remaining": 1500,
  "credits_total": 1500,
  "subscription_status": "active",
  "plan_id": "price_1SnRv7ASFmxXUAAwbT8A4Uzt",
  "current_period_end": "2026-02-09T15:31:14.000Z",
  "metadata": {
    "stripe_session_id": "cs_test_xxx",
    "stripe_customer_id": "cus_xxx",
    "stripe_subscription_id": "sub_xxx"
  }
}
```

### 11.3 Donnees recues de n8n (cible)

```json
POST /api/webhook/account/set
{
  "discord_user_id": "1455174904323379215",
  "credits_remaining": 1500,
  "credits_total": 1500,
  "subscription_status": "active",
  "plan_id": "price_1SnRv7ASFmxXUAAwbT8A4Uzt",
  "current_period_end": "2026-02-09T15:31:14.000Z",
  "reason": "checkout_completed",
  "create_private_channel": true,
  "metadata": {
    "stripe_session_id": "cs_test_xxx",
    "stripe_customer_id": "cus_xxx",
    "stripe_subscription_id": "sub_xxx"
  },
  "discord_username": "JohnDoe",
  "discord_guild_id": "815368074995040286",
  "discord_channel_id": "123456789012345678",
  "customer_email": "john.doe@example.com"
}
```

**Notes:**
- `create_private_channel` provient du metadata du Price Stripe
- `customer_email` provient de `customer_details.email` (checkout) ou `customer_email` (invoice)

### 11.4 Actions requises API

| # | Action | Endpoint | Detail |
|---|--------|----------|--------|
| 1 | **Accepter nouveaux champs** | POST /webhook/account/set | Ajouter au schema: `discord_username`, `discord_guild_id`, `discord_channel_id`, `customer_email`, `create_private_channel`, `reason` |
| 2 | **Mapper reason → event** | Interne | `checkout_completed` → event `checkout_completed`, `renewal` → `subscription_renewed` |
| 3 | **Publier username dans Redis** | XADD | Inclure `username` dans le message |
| 4 | **Publier guild_id dans Redis** | XADD | Inclure `guild_id` dans le message |
| 5 | **Publier channel_id dans Redis** | XADD | Inclure `channel_id` dans le message |
| 6 | **Publier email dans Redis** | XADD | Inclure `email` dans le message |
| 7 | **Activer send_channel_message** | XADD | `true` si `channel_id` present et non vide |
| 8 | **Utiliser create_private_channel** | XADD | Utiliser la valeur recue de n8n (provient du Price Stripe) |

**Source de `create_private_channel`:**
```
Stripe Price metadata → n8n Get Price Info → n8n Call Credits API → API → Redis
```

### 11.5 Message Redis actuel vs cible

**Actuel:**
```json
{
  "user_id": "1455174904323379215",
  "username": "",
  "guild_id": "",
  "channel_id": "",
  "event": "subscription_active",
  "plan_id": "price_xxx",
  "credits": "1500",
  "embed": "{...}",
  "actions": "{\"send_dm\": true, \"send_channel_message\": false, \"create_private_channel\": false}"
}
```

**Cible:**
```json
{
  "user_id": "1455174904323379215",
  "username": "JohnDoe",
  "email": "john.doe@example.com",
  "guild_id": "815368074995040286",
  "channel_id": "123456789012345678",
  "event": "checkout_completed",
  "plan_id": "price_xxx",
  "credits": "1500",
  "embed": "{...}",
  "actions": "{\"send_dm\": true, \"send_channel_message\": true, \"create_private_channel\": true}"
}
```

**Note:** `create_private_channel` dans `actions` provient de:
1. Stripe Price metadata (`create_private_channel: true/false`)
2. → n8n lit cette valeur via Get Price Info
3. → n8n envoie à l'API
4. → API inclut dans `actions` du message Redis

### 11.6 Logique event type

| reason (n8n) | event (Redis) | Actions |
|--------------|---------------|---------|
| `checkout_completed` | `checkout_completed` | DM + Channel + Private Room |
| `renewal` | `subscription_renewed` | DM only |
| `subscription_deleted` | `subscription_cancelled` | DM + Channel |

---

## 12. Changelog

| Date | Modification |
|------|--------------|
| 2026-01-09 | Creation du document |
| 2026-01-09 | Ajout reponses Framework (Questions 1, 3) |
| 2026-01-09 | Ajout section 10: Resume actions n8n |
| 2026-01-09 | Recommandation Option C (Hybride) |
| 2026-01-09 | PR #93 reference (metadata fix) |
| 2026-01-09 | Ajout section 11: Resume actions API |
| 2026-01-09 | Detail flux n8n → API → Redis |
| 2026-01-09 | Specification donnees cibles pour API |
| 2026-01-09 | Ajout `create_private_channel` dans Stripe Price metadata |
| 2026-01-09 | Source: Stripe Price → n8n → API → Redis |
| 2026-01-09 | Ajout `customer_email` dans le flux |
