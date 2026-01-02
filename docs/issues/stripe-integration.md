# Intégration Stripe - Paiements & Abonnements

**Date:** 2026-01-02
**Statut:** En analyse
**Priorité:** Haute

---

## 1. Analyse Générale

### 1.1 Objectif

Permettre aux utilisateurs de souscrire à des plans payants (Basic, Premium) directement depuis Discord, avec gestion automatique des crédits et des abonnements récurrents.

### 1.2 Solution Recommandée: Stripe Checkout

**Stripe Checkout** est la solution recommandée car:
- Redirection vers une page Stripe hébergée (sécurisée)
- Conformité PCI-DSS automatique (pas de données carte sur nos serveurs)
- Support natif des abonnements récurrents
- Interface optimisée (mobile, Apple Pay, Google Pay, etc.)
- Gestion automatique des relances de paiement

### 1.3 Architecture Cible

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FLUX UTILISATEUR                          │
└─────────────────────────────────────────────────────────────────────┘

  Discord                    n8n                      Stripe
  ───────                    ───                      ──────
     │                        │                         │
     │  1. /subscribe premium │                         │
     │───────────────────────▶│                         │
     │                        │  2. Create Checkout     │
     │                        │─────────────────────────▶
     │                        │                         │
     │                        │  3. Return session URL  │
     │                        │◀─────────────────────────
     │  4. Send payment link  │                         │
     │◀───────────────────────│                         │
     │                        │                         │
     │  5. User clicks link ──────────────────────────▶│
     │                        │                         │
     │                        │                         │  6. User pays
     │                        │                         │
     │                        │  7. Webhook: payment OK │
     │                        │◀─────────────────────────
     │                        │                         │
     │                        │  8. Update DB           │
     │                        │─────▶ PostgreSQL        │
     │                        │                         │
     │  9. Confirmation DM    │                         │
     │◀───────────────────────│                         │
     │                        │                         │
```

### 1.4 Plans & Tarification (à définir)

| Plan | Prix/mois | Crédits/mois | Fonctionnalités |
|------|-----------|--------------|-----------------|
| Free | 0€ | 100 | Traductions limitées |
| Basic | 4.99€ | 1,000 | Salle privée |
| Premium | 9.99€ | 5,000 | Salle privée + priorité |
| Unlimited | 19.99€ | ∞ | Tout illimité |

### 1.5 Données à Stocker

```sql
-- Table existante: subscribers (à enrichir)
ALTER TABLE subscribers ADD COLUMN stripe_customer_id VARCHAR(255);
ALTER TABLE subscribers ADD COLUMN stripe_subscription_id VARCHAR(255);
ALTER TABLE subscribers ADD COLUMN subscription_status VARCHAR(50); -- active, canceled, past_due
ALTER TABLE subscribers ADD COLUMN current_period_end TIMESTAMP;

-- Nouvelle table: payment_history
CREATE TABLE payment_history (
    id SERIAL PRIMARY KEY,
    discord_user_id VARCHAR(50) NOT NULL,
    stripe_payment_id VARCHAR(255),
    amount_cents INTEGER,
    currency VARCHAR(3) DEFAULT 'eur',
    status VARCHAR(50), -- succeeded, failed, refunded
    plan VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 2. Équipe n8n - Workflows à Créer

### 2.1 Workflow: `stripe-create-checkout`

**Trigger:** Webhook HTTP POST
**URL:** `POST /webhook/stripe-create-checkout`

**Input:**
```json
{
  "discord_user_id": "123456789",
  "discord_username": "user#1234",
  "email": "user@example.com",
  "plan": "premium",
  "success_url": "https://discord.com/channels/...",
  "cancel_url": "https://discord.com/channels/..."
}
```

**Étapes:**
1. **Vérifier si customer Stripe existe** (par discord_user_id dans metadata)
2. **Créer customer Stripe si nécessaire**
   ```javascript
   // Stripe API: POST /v1/customers
   {
     email: input.email,
     metadata: {
       discord_user_id: input.discord_user_id,
       discord_username: input.discord_username
     }
   }
   ```
3. **Créer session Checkout**
   ```javascript
   // Stripe API: POST /v1/checkout/sessions
   {
     customer: customer_id,
     mode: "subscription",
     line_items: [{
       price: PRICE_ID_MAP[input.plan], // price_xxx from Stripe dashboard
       quantity: 1
     }],
     success_url: input.success_url + "?session_id={CHECKOUT_SESSION_ID}",
     cancel_url: input.cancel_url,
     metadata: {
       discord_user_id: input.discord_user_id,
       plan: input.plan
     }
   }
   ```
4. **Retourner l'URL de checkout**

**Output:**
```json
{
  "success": true,
  "checkout_url": "https://checkout.stripe.com/c/pay/cs_xxx",
  "session_id": "cs_xxx"
}
```

---

### 2.2 Workflow: `stripe-webhook-handler`

**Trigger:** Webhook HTTP POST
**URL:** `POST /webhook/stripe-events`
**Sécurité:** Vérifier signature Stripe (`stripe-signature` header)

**Événements à gérer:**

#### `checkout.session.completed`
```javascript
// Nouveau paiement réussi
const session = event.data.object;
const discord_user_id = session.metadata.discord_user_id;
const plan = session.metadata.plan;

// 1. Mettre à jour PostgreSQL
UPDATE subscribers SET
  plan = plan,
  stripe_customer_id = session.customer,
  stripe_subscription_id = session.subscription,
  subscription_status = 'active',
  current_period_end = subscription.current_period_end,
  credits = credits + PLAN_CREDITS[plan]
WHERE discord_user_id = discord_user_id;

// 2. Logger le paiement
INSERT INTO payment_history (discord_user_id, stripe_payment_id, amount_cents, plan, status)
VALUES (discord_user_id, session.payment_intent, session.amount_total, plan, 'succeeded');

// 3. Notifier via Discord webhook (optionnel)
POST discord_webhook_url {
  content: `✅ Paiement confirmé pour <@${discord_user_id}>! Plan: ${plan}`
}
```

#### `invoice.payment_succeeded`
```javascript
// Renouvellement mensuel réussi
const invoice = event.data.object;
const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
const discord_user_id = subscription.metadata.discord_user_id;

// Recréditer le compte
UPDATE subscribers SET
  credits = credits + PLAN_CREDITS[plan],
  current_period_end = subscription.current_period_end
WHERE discord_user_id = discord_user_id;
```

#### `invoice.payment_failed`
```javascript
// Échec de paiement (carte expirée, etc.)
// Envoyer notification à l'utilisateur
```

#### `customer.subscription.deleted`
```javascript
// Abonnement annulé
UPDATE subscribers SET
  plan = 'free',
  subscription_status = 'canceled',
  stripe_subscription_id = NULL
WHERE stripe_customer_id = event.data.object.customer;
```

---

### 2.3 Workflow: `stripe-cancel-subscription`

**Trigger:** Webhook HTTP POST
**URL:** `POST /webhook/stripe-cancel`

**Input:**
```json
{
  "discord_user_id": "123456789"
}
```

**Étapes:**
1. Récupérer `stripe_subscription_id` depuis PostgreSQL
2. Annuler l'abonnement Stripe (fin de période)
   ```javascript
   // Stripe API: POST /v1/subscriptions/{id}
   { cancel_at_period_end: true }
   ```
3. Mettre à jour le statut en DB

---

### 2.4 Variables d'Environnement n8n

```env
STRIPE_SECRET_KEY=sk_test_xxx        # ou sk_live_xxx en production
STRIPE_WEBHOOK_SECRET=whsec_xxx      # Pour vérifier les signatures
STRIPE_PRICE_BASIC=price_xxx         # ID du prix Basic dans Stripe
STRIPE_PRICE_PREMIUM=price_xxx       # ID du prix Premium dans Stripe
STRIPE_PRICE_UNLIMITED=price_xxx     # ID du prix Unlimited dans Stripe
```

---

## 3. Équipe API (Torah API) - Endpoints

### 3.1 Pas de modifications requises

L'API Torah n'a pas besoin d'être modifiée pour Stripe. Toute la logique paiement passe par n8n.

### 3.2 Optionnel: Endpoint de vérification

Si besoin d'un endpoint pour vérifier le statut d'abonnement:

```
GET /api/subscription/:discord_user_id
```

**Response:**
```json
{
  "discord_user_id": "123456789",
  "plan": "premium",
  "subscription_status": "active",
  "credits": 4532,
  "current_period_end": "2026-02-02T00:00:00Z"
}
```

---

## 4. Équipe Discord Bot - Modifications

### 4.1 Commande `/subscribe` (modifier)

```python
@bot.tree.command(name="subscribe")
@app_commands.describe(plan="Le plan souhaité")
@app_commands.choices(plan=[
    Choice(name="Basic - 4.99€/mois", value="basic"),
    Choice(name="Premium - 9.99€/mois", value="premium"),
    Choice(name="Unlimited - 19.99€/mois", value="unlimited"),
])
async def subscribe(interaction: discord.Interaction, plan: str):
    # 1. Appeler n8n pour créer session Checkout
    response = await create_checkout_session(
        discord_user_id=str(interaction.user.id),
        discord_username=str(interaction.user),
        plan=plan
    )

    # 2. Envoyer le lien de paiement
    embed = discord.Embed(
        title=f"💳 Abonnement {plan.title()}",
        description="Cliquez sur le bouton ci-dessous pour procéder au paiement sécurisé.",
        color=Colors.PRIMARY
    )
    embed.add_field(name="Plan", value=plan.title(), inline=True)
    embed.add_field(name="Prix", value=PLAN_PRICES[plan], inline=True)

    view = PaymentLinkView(response['checkout_url'])
    await interaction.response.send_message(embed=embed, view=view, ephemeral=True)
```

### 4.2 Nouvelle View: `PaymentLinkView`

```python
class PaymentLinkView(ui.View):
    def __init__(self, checkout_url: str):
        super().__init__(timeout=900)  # 15 minutes
        self.add_item(ui.Button(
            label="Payer avec Stripe",
            url=checkout_url,
            style=discord.ButtonStyle.link,
            emoji="💳"
        ))
```

### 4.3 Commande `/cancel-subscription` (nouvelle)

```python
@bot.tree.command(name="cancel-subscription")
async def cancel_subscription(interaction: discord.Interaction):
    # Annuler l'abonnement à la fin de la période
    ...
```

---

## 5. Configuration Stripe Dashboard

### 5.1 Créer les Produits & Prix

1. Aller sur https://dashboard.stripe.com/products
2. Créer un produit "Torah Bot Subscription"
3. Ajouter les prix récurrents:
   - Basic: 4.99€/mois
   - Premium: 9.99€/mois
   - Unlimited: 19.99€/mois
4. Noter les `price_xxx` IDs

### 5.2 Configurer le Webhook

1. Aller sur https://dashboard.stripe.com/webhooks
2. Ajouter endpoint: `https://votre-domaine/webhook/stripe-events`
3. Sélectionner les événements:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
4. Noter le `whsec_xxx` (Webhook Secret)

### 5.3 Mode Test

Utiliser les cartes de test Stripe:
- `4242 4242 4242 4242` - Paiement réussi
- `4000 0000 0000 0002` - Carte refusée
- `4000 0000 0000 3220` - Authentification 3D Secure

---

## 6. Checklist d'Implémentation

### Phase 1: Configuration (Équipe DevOps/Admin)
- [ ] Créer compte Stripe (si pas déjà fait)
- [ ] Créer produits et prix dans Stripe Dashboard
- [ ] Configurer webhook Stripe
- [ ] Ajouter variables d'environnement

### Phase 2: Backend (Équipe n8n)
- [ ] Workflow `stripe-create-checkout`
- [ ] Workflow `stripe-webhook-handler`
- [ ] Workflow `stripe-cancel-subscription`
- [ ] Tests avec cartes de test

### Phase 3: Base de données
- [ ] Migration: ajouter colonnes Stripe à `subscribers`
- [ ] Créer table `payment_history`

### Phase 4: Discord Bot
- [ ] Modifier `/subscribe` pour intégrer Stripe
- [ ] Ajouter `PaymentLinkView`
- [ ] Ajouter `/cancel-subscription`
- [ ] Tests end-to-end

### Phase 5: Production
- [ ] Passer en mode live Stripe
- [ ] Vérifier webhooks en production
- [ ] Monitoring des paiements

---

## 7. Questions Ouvertes

1. **Tarification exacte des plans ?**
2. **Politique de remboursement ?**
3. **Que faire si l'utilisateur a déjà une salle privée gratuite ?**
4. **Notifications Discord lors des renouvellements ?**
5. **Gestion des échecs de paiement (grace period) ?**

---

## 8. Ressources

- [Stripe Checkout Documentation](https://stripe.com/docs/checkout)
- [Stripe Webhooks](https://stripe.com/docs/webhooks)
- [Stripe Subscriptions](https://stripe.com/docs/billing/subscriptions/overview)
- [Stripe Test Cards](https://stripe.com/docs/testing)

---

## 9. Contre-Proposition Équipe n8n

**Date:** 2026-01-02
**Auteur:** Équipe n8n
**Objectif:** Rendre l'intégration Stripe **générique et multi-registry** avec **isolation totale des données**

### 9.1 Problématique Identifiée

Le document initial est spécifique à **Torah Bot + Discord**. Or, l'intégration doit supporter :
- **Plusieurs registries** : Torah, MCP, futurs services
- **Plusieurs sources** : Discord, Web, API tierces
- **Isolation des données** : chaque registry garde ses propres utilisateurs

### 9.2 Principe Fondamental : Isolation Totale

**Le workflow n8n est un simple proxy Stripe.** Il ne connaît rien des registries et ne stocke aucune donnée utilisateur.

- **Pas de base de données centralisée**
- **Pas de table de configuration des registries**
- **Chaque service appelant fournit tout** (price_id, callbacks, metadata)
- **Chaque registry gère ses propres utilisateurs** dans sa propre DB

### 9.3 Architecture Proposée

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TORAH BOT                                    │
│                                                                      │
│  Connaît:                          Sa propre DB:                    │
│  - Ses price_id Stripe             - subscribers (discord_user_id)  │
│  - Ses callbacks                   - payment_history                │
│  - Sa logique métier               - credits, plans, etc.           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │  POST /subscription-checkout-create
                               │  {
                               │    price_id: "price_torah_premium",
                               │    callback_success: "http://.../torah-success",
                               │    customer_email: "user@example.com",
                               │    metadata: { discord_user_id: "123" }
                               │  }
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  WORKFLOWS N8N (Proxy Stripe)                        │
│                                                                      │
│  Ne connaît QUE:                                                    │
│  - STRIPE_SECRET_KEY (env var)                                      │
│  - STRIPE_WEBHOOK_SECRET (env var)                                  │
│                                                                      │
│  Ne stocke RIEN. Reçoit tout du service appelant.                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         STRIPE                                       │
│                                                                      │
│  - Crée la session Checkout                                         │
│  - Gère le paiement                                                 │
│  - Envoie les webhooks                                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │  Webhook Stripe → n8n
                               │  (avec metadata contenant callback_url)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              subscription-webhook-handler                            │
│                                                                      │
│  1. Vérifie signature Stripe                                        │
│  2. Extrait callback_url depuis metadata                            │
│  3. Appelle le callback du service (Torah, MCP, etc.)               │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│   Torah: gère sa DB      │      │   MCP: gère sa DB        │
│   - Update subscribers   │      │   - Update users         │
│   - Add credits          │      │   - Activate features    │
│   - Notify Discord       │      │   - Notify user          │
└──────────────────────────┘      └──────────────────────────┘
```

### 9.4 Responsabilités

#### 9.4.1 Service Appelant (Torah, MCP, etc.)

Le service appelant est responsable de :
- **Connaître ses price_id Stripe** (configurés dans son environnement)
- **Fournir ses URLs de callback** (success, cancel, renewal, failure)
- **Gérer ses propres utilisateurs** dans sa propre base de données
- **Implémenter la logique métier** (crédits, features, notifications)

#### 9.4.2 Workflows n8n (Proxy Stripe)

Les workflows n8n sont responsables de :
- **Créer les sessions Stripe Checkout**
- **Vérifier les signatures des webhooks Stripe**
- **Router les événements vers les callbacks** fournis par les services

### 9.5 Workflows à Créer

#### 9.5.1 `subscription-checkout-create`

**Trigger:** Webhook HTTP POST
**URL:** `POST /webhook/subscription-checkout-create`

**Input (fourni par le service appelant):**
```json
{
    "price_id": "price_torah_premium_eur",
    "customer_email": "user@example.com",
    "customer_name": "John Doe",
    "callbacks": {
        "success": "http://n8n.local:5678/webhook/torah-sub-success",
        "cancel": "http://n8n.local:5678/webhook/torah-sub-cancel",
        "renewal": "http://n8n.local:5678/webhook/torah-sub-renewal",
        "failure": "http://n8n.local:5678/webhook/torah-sub-failure"
    },
    "urls": {
        "success": "https://discord.com/channels/...",
        "cancel": "https://discord.com/channels/..."
    },
    "metadata": {
        "service": "torah",
        "discord_user_id": "123456789",
        "discord_username": "user#1234",
        "plan": "premium"
    },
    "options": {
        "trial_days": 7,
        "coupon_code": null,
        "allow_promotion_codes": false
    }
}
```

**Logique:**
```javascript
// Le workflow ne valide rien, il passe tout à Stripe
const checkoutParams = {
    mode: "subscription",
    customer_email: input.customer_email,
    line_items: [{
        price: input.price_id,
        quantity: 1
    }],
    success_url: input.urls.success + "?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: input.urls.cancel,
    metadata: {
        ...input.metadata,
        // Stocker les callbacks dans metadata pour le webhook handler
        callback_success: input.callbacks.success,
        callback_cancel: input.callbacks.cancel,
        callback_renewal: input.callbacks.renewal,
        callback_failure: input.callbacks.failure
    }
};

// Options conditionnelles
if (input.options.trial_days) {
    checkoutParams.subscription_data = {
        trial_period_days: input.options.trial_days
    };
}

if (input.options.coupon_code) {
    checkoutParams.discounts = [{ coupon: input.options.coupon_code }];
}

if (input.options.allow_promotion_codes) {
    checkoutParams.allow_promotion_codes = true;
}

// Créer la session Stripe
const session = await stripe.checkout.sessions.create(checkoutParams);

return {
    success: true,
    checkout_url: session.url,
    session_id: session.id
};
```

**Output:**
```json
{
    "success": true,
    "checkout_url": "https://checkout.stripe.com/c/pay/cs_xxx",
    "session_id": "cs_xxx"
}
```

#### 9.5.2 `subscription-webhook-handler`

**Trigger:** Webhook HTTP POST
**URL:** `POST /webhook/stripe-events`
**Sécurité:** Vérification signature Stripe obligatoire

**Logique:**
```javascript
// 1. Vérifier signature Stripe (OBLIGATOIRE)
const sig = headers['stripe-signature'];
const event = stripe.webhooks.constructEvent(
    rawBody,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET
);

// 2. Extraire les callbacks depuis metadata
const obj = event.data.object;
let metadata = obj.metadata;

// Pour invoice events, récupérer metadata depuis subscription
if (event.type.startsWith('invoice.')) {
    const subscription = await stripe.subscriptions.retrieve(obj.subscription);
    metadata = subscription.metadata;
}

// 3. Déterminer quel callback appeler
const callbackMap = {
    'checkout.session.completed': metadata.callback_success,
    'invoice.payment_succeeded': metadata.callback_renewal,
    'invoice.payment_failed': metadata.callback_failure,
    'customer.subscription.deleted': metadata.callback_cancel,
    'customer.subscription.updated': metadata.callback_success
};

const callbackUrl = callbackMap[event.type];

if (!callbackUrl) {
    return { status: 200, body: { message: 'Event ignored' } };
}

// 4. Appeler le callback du service
await fetch(callbackUrl, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'X-Stripe-Event': event.type,
        'X-Stripe-Signature': sig  // Transmettre pour vérification optionnelle
    },
    body: JSON.stringify({
        event_type: event.type,
        metadata: metadata,
        stripe_data: {
            customer_id: obj.customer,
            subscription_id: obj.subscription || obj.id,
            amount_total: obj.amount_total,
            currency: obj.currency,
            status: obj.status,
            current_period_end: obj.current_period_end
        }
    })
});

return { status: 200, body: { received: true } };
```

#### 9.5.3 `subscription-cancel`

**Trigger:** Webhook HTTP POST
**URL:** `POST /webhook/subscription-cancel`

**Input:**
```json
{
    "stripe_subscription_id": "sub_xxx",
    "cancel_immediately": false
}
```

**Logique:**
```javascript
if (input.cancel_immediately) {
    await stripe.subscriptions.cancel(input.stripe_subscription_id);
} else {
    await stripe.subscriptions.update(input.stripe_subscription_id, {
        cancel_at_period_end: true
    });
}

return { success: true };
```

#### 9.5.4 `subscription-change-plan`

**Trigger:** Webhook HTTP POST
**URL:** `POST /webhook/subscription-change-plan`

**Input:**
```json
{
    "stripe_subscription_id": "sub_xxx",
    "new_price_id": "price_torah_unlimited_eur",
    "proration_behavior": "create_prorations"
}
```

**Logique:**
```javascript
const subscription = await stripe.subscriptions.retrieve(input.stripe_subscription_id);
const itemId = subscription.items.data[0].id;

await stripe.subscriptions.update(input.stripe_subscription_id, {
    items: [{
        id: itemId,
        price: input.new_price_id
    }],
    proration_behavior: input.proration_behavior || 'create_prorations'
});

return { success: true };
```

### 9.6 Configuration Côté Service Appelant

Chaque service (Torah, MCP) stocke sa propre configuration :

#### Exemple: Torah Bot (variables d'environnement)

```env
# Stripe Price IDs
STRIPE_PRICE_BASIC_EUR=price_torah_basic_eur
STRIPE_PRICE_PREMIUM_EUR=price_torah_premium_eur
STRIPE_PRICE_UNLIMITED_EUR=price_torah_unlimited_eur

# Callbacks n8n
N8N_CALLBACK_SUCCESS=http://n8n.local:5678/webhook/torah-sub-success
N8N_CALLBACK_CANCEL=http://n8n.local:5678/webhook/torah-sub-cancel
N8N_CALLBACK_RENEWAL=http://n8n.local:5678/webhook/torah-sub-renewal
N8N_CALLBACK_FAILURE=http://n8n.local:5678/webhook/torah-sub-failure

# URL du proxy n8n
N8N_CHECKOUT_URL=http://n8n.local:5678/webhook/subscription-checkout-create

# Config business
TRIAL_DAYS=7
```

#### Exemple: MCP (variables d'environnement)

```env
# Stripe Price IDs
STRIPE_PRICE_PRO_EUR=price_mcp_pro_eur
STRIPE_PRICE_PRO_USD=price_mcp_pro_usd

# Callbacks n8n
N8N_CALLBACK_SUCCESS=http://n8n.local:5678/webhook/mcp-sub-success
N8N_CALLBACK_CANCEL=http://n8n.local:5678/webhook/mcp-sub-cancel

# Config business
TRIAL_DAYS=14
```

### 9.7 Base de Données par Service

Chaque service gère sa propre table `subscribers` :

#### Torah DB

```sql
-- Table subscribers (existante, à enrichir)
ALTER TABLE subscribers ADD COLUMN stripe_customer_id VARCHAR(255);
ALTER TABLE subscribers ADD COLUMN stripe_subscription_id VARCHAR(255);
ALTER TABLE subscribers ADD COLUMN subscription_status VARCHAR(50);
ALTER TABLE subscribers ADD COLUMN current_period_end TIMESTAMP;

-- Table payment_history
CREATE TABLE payment_history (
    id SERIAL PRIMARY KEY,
    discord_user_id VARCHAR(50) NOT NULL,
    stripe_payment_id VARCHAR(255),
    amount_cents INTEGER,
    currency VARCHAR(3) DEFAULT 'eur',
    status VARCHAR(50),
    plan VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
```

#### MCP DB

```sql
-- Table users (propre à MCP)
CREATE TABLE mcp_users (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    plan VARCHAR(50) DEFAULT 'free',
    features JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 9.8 Callbacks Spécifiques par Service

#### 9.8.1 Torah Callbacks

**`torah-sub-success`** (workflow n8n)
```javascript
// Reçoit les données du webhook handler
const { metadata, stripe_data } = input;

// 1. Mettre à jour la DB Torah
await db.query(`
    UPDATE subscribers SET
        stripe_customer_id = $1,
        stripe_subscription_id = $2,
        plan = $3,
        subscription_status = 'active',
        credits = credits + $4,
        current_period_end = $5
    WHERE discord_user_id = $6
`, [
    stripe_data.customer_id,
    stripe_data.subscription_id,
    metadata.plan,
    PLAN_CREDITS[metadata.plan],
    stripe_data.current_period_end,
    metadata.discord_user_id
]);

// 2. Notifier Discord
await discordWebhook.send({
    content: `✅ Abonnement ${metadata.plan} activé pour <@${metadata.discord_user_id}>!`
});
```

**`torah-sub-renewal`** (workflow n8n)
```javascript
// Recréditer le compte mensuel
await db.query(`
    UPDATE subscribers SET
        credits = credits + $1,
        current_period_end = $2
    WHERE stripe_subscription_id = $3
`, [PLAN_CREDITS[metadata.plan], stripe_data.current_period_end, stripe_data.subscription_id]);
```

#### 9.8.2 MCP Callbacks

**`mcp-sub-success`** (workflow n8n)
```javascript
// Activer les features pro
await db.query(`
    UPDATE mcp_users SET
        stripe_customer_id = $1,
        stripe_subscription_id = $2,
        plan = 'pro',
        features = '["advanced_tools", "priority_support"]'
    WHERE user_id = $3
`, [stripe_data.customer_id, stripe_data.subscription_id, metadata.user_id]);
```

### 9.9 Sécurité

#### 9.9.1 Variables d'Environnement n8n

```env
# Seules variables nécessaires côté n8n
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

#### 9.9.2 Vérification Signature Stripe

```javascript
// OBLIGATOIRE dans subscription-webhook-handler
const sig = headers['stripe-signature'];
try {
    const event = stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
    );
} catch (err) {
    return { status: 400, body: { error: 'Invalid signature' } };
}
```

#### 9.9.3 Sécurisation des Callbacks

**Option 1:** Les callbacks sont des workflows n8n internes (même instance)
- Pas besoin d'authentification supplémentaire
- Vérifier que les URLs sont bien internes

**Option 2:** Callbacks vers services externes
- Ajouter un token partagé dans metadata
- Le service vérifie ce token

```javascript
// Dans le callback du service
const expectedToken = process.env.CALLBACK_SECRET;
const receivedToken = input.metadata.callback_token;
if (receivedToken !== expectedToken) {
    return { status: 401, body: { error: 'Invalid token' } };
}
```

### 9.10 Gestion des Cas Particuliers

#### 9.10.1 Période d'Essai (Trial)
- Le service appelant décide s'il veut un trial (`options.trial_days`)
- Stripe gère automatiquement la période
- Événement `customer.subscription.updated` à la fin du trial

#### 9.10.2 Promotions/Coupons
- Le service appelant passe `options.coupon_code`
- Ou active `options.allow_promotion_codes` pour que l'utilisateur entre un code

#### 9.10.3 Upgrade/Downgrade
- Le service appelle `subscription-change-plan` avec le nouveau `price_id`
- Stripe calcule le prorata automatiquement

#### 9.10.4 Multi-Devise
- Le service appelant choisit le bon `price_id` selon la devise
- Exemple: `STRIPE_PRICE_PREMIUM_EUR` vs `STRIPE_PRICE_PREMIUM_USD`

#### 9.10.5 Grace Period
- Configurer dans Stripe Dashboard (Settings → Billing → Subscriptions)
- Le callback `failure` est appelé à chaque échec
- Le service décide de sa logique (notification, limitation, etc.)

### 9.11 Checklist d'Implémentation

#### Phase 1: Workflows n8n (Proxy Stripe)
- [ ] `subscription-checkout-create`
- [ ] `subscription-webhook-handler`
- [ ] `subscription-cancel`
- [ ] `subscription-change-plan`
- [ ] Configurer variables env (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)
- [ ] Tests avec cartes Stripe test

#### Phase 2: Torah Integration
- [ ] Migration DB : ajouter colonnes Stripe à `subscribers`
- [ ] Créer table `payment_history`
- [ ] Workflow `torah-sub-success`
- [ ] Workflow `torah-sub-renewal`
- [ ] Workflow `torah-sub-cancel`
- [ ] Workflow `torah-sub-failure`
- [ ] Modifier Discord Bot `/subscribe`
- [ ] Tests end-to-end

#### Phase 3: MCP Integration
- [ ] Créer table `mcp_users` (si pas existante)
- [ ] Workflow `mcp-sub-success`
- [ ] Workflow `mcp-sub-cancel`
- [ ] Intégrer appels subscription
- [ ] Tests end-to-end

#### Phase 4: Production
- [ ] Passer en mode live Stripe
- [ ] Configurer webhook Stripe vers URL production
- [ ] Vérifier webhooks en production
- [ ] Monitoring des paiements

### 9.12 Avantages de cette Architecture

| Aspect | Bénéfice |
|--------|----------|
| **Isolation** | Chaque service garde ses données, pas de risque de fuite croisée |
| **Simplicité** | Le proxy n8n ne stocke rien, pas de DB à maintenir |
| **Flexibilité** | Chaque service définit sa propre logique métier |
| **Scalabilité** | Ajouter un nouveau service = créer ses callbacks |
| **Sécurité** | Secrets Stripe uniquement dans n8n, données users isolées |

### 9.13 Gestion Multi-Plateforme (Côté Service)

#### 9.13.1 Problématique

Un utilisateur peut vouloir utiliser le même service depuis plusieurs plateformes :
- Discord + Telegram
- Mobile + Web
- Discord + Web

L'abonnement payé doit être **partagé** entre toutes les plateformes.

```
User "John" paie via Discord → stripe_customer_id = "cus_xxx"
                              → discord_user_id = "123456789"

Même user veut utiliser Telegram → telegram_user_id = "987654321"
                                  → Comment lier les deux ?
```

#### 9.13.2 Responsabilité

Cette gestion est **côté service** (Torah, MCP), pas côté proxy n8n.

| Aspect | Responsabilité |
|--------|----------------|
| Mapping multi-plateforme | **Service** |
| Liaison des comptes | **Service** |
| Crédits/features partagés | **Service** |
| Proxy Stripe | **n8n** - ne change pas |

#### 9.13.3 Modèle de Données Recommandé

```sql
-- Table principale (1 entrée par utilisateur unique)
CREATE TABLE torah_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255),
    plan VARCHAR(50) DEFAULT 'free',
    credits INTEGER DEFAULT 100,
    subscription_status VARCHAR(50),
    current_period_end TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Table de mapping des identités (N entrées par utilisateur)
CREATE TABLE torah_user_identities (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES torah_users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,      -- 'discord', 'telegram', 'web', 'mobile'
    platform_user_id VARCHAR(255) NOT NULL,
    platform_username VARCHAR(255),
    is_primary BOOLEAN DEFAULT false,   -- Plateforme principale pour notifications
    linked_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(platform, platform_user_id)
);

-- Index pour recherche rapide
CREATE INDEX idx_identities_platform ON torah_user_identities(platform, platform_user_id);
```

#### 9.13.4 Architecture Multi-Plateforme

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Discord Bot   │     │  Telegram Bot   │     │    Web App      │
│                 │     │                 │     │                 │
│ discord_id: 123 │     │ telegram_id: 456│     │ email login     │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                   ┌───────────────────────┐
                   │     torah_users       │
                   │     id: 1             │
                   │     email: user@x.com │
                   │     credits: 5000     │  ← Crédits PARTAGÉS
                   │     plan: premium     │
                   └───────────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │ identities      │ │ identities      │ │ identities      │
    │ platform:discord│ │ platform:telegram│ │ platform: web   │
    │ id: 123         │ │ id: 456         │ │ id: user@x.com  │
    │ is_primary: true│ │ is_primary:false│ │ is_primary:false│
    └─────────────────┘ └─────────────────┘ └─────────────────┘
```

#### 9.13.5 Liaison de Comptes

**Méthode 1 : Code de Liaison Temporaire**

```
1. User sur Discord : /link-telegram
2. Bot génère un code unique : "LINK-ABC123" (expire en 10 min)
3. User sur Telegram : /link LINK-ABC123
4. Service vérifie le code et lie les comptes
```

```sql
-- Table temporaire pour les codes de liaison
CREATE TABLE link_codes (
    code VARCHAR(50) PRIMARY KEY,
    user_id INTEGER REFERENCES torah_users(id),
    target_platform VARCHAR(50),
    expires_at TIMESTAMP,
    used BOOLEAN DEFAULT false
);
```

**Méthode 2 : Liaison par Email**

```
1. User sur Discord a un email vérifié
2. User sur Telegram : /start avec même email
3. Service envoie un email de confirmation
4. User clique → comptes liés
```

**Méthode 3 : OAuth (Web)**

```
1. User connecté sur Web
2. Clique "Lier mon compte Discord"
3. OAuth Discord → récupère discord_id
4. Insertion dans torah_user_identities
```

#### 9.13.6 Flux de Paiement Adapté

Le service doit identifier l'utilisateur **avant** d'appeler le proxy :

```javascript
// Dans le Discord Bot - commande /subscribe
async function handleSubscribe(interaction, plan) {
    const discordUserId = interaction.user.id;

    // 1. Chercher si l'utilisateur existe déjà (peut-être via autre plateforme)
    let user = await db.query(`
        SELECT u.* FROM torah_users u
        JOIN torah_user_identities i ON u.id = i.user_id
        WHERE i.platform = 'discord' AND i.platform_user_id = $1
    `, [discordUserId]);

    // 2. Si pas trouvé, créer l'utilisateur
    if (!user.rows.length) {
        const newUser = await db.query(`
            INSERT INTO torah_users (email) VALUES (NULL) RETURNING *
        `);
        user = newUser.rows[0];

        await db.query(`
            INSERT INTO torah_user_identities
            (user_id, platform, platform_user_id, platform_username, is_primary)
            VALUES ($1, 'discord', $2, $3, true)
        `, [user.id, discordUserId, interaction.user.tag]);
    } else {
        user = user.rows[0];
    }

    // 3. Vérifier si déjà abonné
    if (user.subscription_status === 'active') {
        return interaction.reply({
            content: `Vous avez déjà un abonnement ${user.plan} actif!`,
            ephemeral: true
        });
    }

    // 4. Appeler le proxy n8n avec l'ID interne (pas discord_id)
    const response = await fetch(process.env.N8N_CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            price_id: STRIPE_PRICES[plan],
            customer_email: user.email,  // peut être null
            callbacks: {
                success: process.env.N8N_CALLBACK_SUCCESS,
                cancel: process.env.N8N_CALLBACK_CANCEL,
                renewal: process.env.N8N_CALLBACK_RENEWAL,
                failure: process.env.N8N_CALLBACK_FAILURE
            },
            urls: {
                success: `https://discord.com/channels/${interaction.guildId}`,
                cancel: `https://discord.com/channels/${interaction.guildId}`
            },
            metadata: {
                service: 'torah',
                torah_user_id: user.id,      // ← ID interne unifié
                source_platform: 'discord',
                source_platform_id: discordUserId,
                plan: plan
            },
            options: {
                trial_days: parseInt(process.env.TRIAL_DAYS) || 0
            }
        })
    });

    const data = await response.json();
    // Envoyer le lien de paiement...
}
```

#### 9.13.7 Callback Success Adapté

```javascript
// torah-sub-success (workflow n8n)
const { metadata, stripe_data } = $input.first().json;

// Mettre à jour par torah_user_id (ID interne unifié)
await $db.query(`
    UPDATE torah_users SET
        stripe_customer_id = $1,
        stripe_subscription_id = $2,
        email = COALESCE(email, $3),  -- Garde l'email existant ou prend celui de Stripe
        plan = $4,
        credits = credits + $5,
        subscription_status = 'active',
        current_period_end = to_timestamp($6)
    WHERE id = $7
`, [
    stripe_data.customer_id,
    stripe_data.subscription_id,
    stripe_data.customer_email,
    metadata.plan,
    PLAN_CREDITS[metadata.plan],
    stripe_data.current_period_end,
    metadata.torah_user_id
]);

// Notifier sur la plateforme principale
const primaryIdentity = await $db.query(`
    SELECT platform, platform_user_id FROM torah_user_identities
    WHERE user_id = $1 AND is_primary = true
`, [metadata.torah_user_id]);

if (primaryIdentity.rows[0]?.platform === 'discord') {
    // Notifier via Discord webhook
    await $http.post(DISCORD_WEBHOOK_URL, {
        content: `✅ Abonnement ${metadata.plan} activé pour <@${primaryIdentity.rows[0].platform_user_id}>!`
    });
}
```

#### 9.13.8 Vérification des Crédits (Toutes Plateformes)

```javascript
// Fonction commune utilisée par Discord, Telegram, Web
async function checkCredits(platform, platformUserId) {
    const result = await db.query(`
        SELECT u.credits, u.plan, u.subscription_status
        FROM torah_users u
        JOIN torah_user_identities i ON u.id = i.user_id
        WHERE i.platform = $1 AND i.platform_user_id = $2
    `, [platform, platformUserId]);

    if (!result.rows.length) {
        return { credits: 0, plan: 'free', status: null };
    }

    return {
        credits: result.rows[0].credits,
        plan: result.rows[0].plan,
        status: result.rows[0].subscription_status
    };
}

// Usage Discord
const { credits } = await checkCredits('discord', interaction.user.id);

// Usage Telegram
const { credits } = await checkCredits('telegram', ctx.from.id);

// Usage Web
const { credits } = await checkCredits('web', userEmail);
```

#### 9.13.9 Commandes de Liaison

**Discord Bot:**
```python
@bot.tree.command(name="link")
@app_commands.describe(platform="Plateforme à lier")
@app_commands.choices(platform=[
    Choice(name="Telegram", value="telegram"),
    Choice(name="Web", value="web"),
])
async def link_platform(interaction: discord.Interaction, platform: str):
    # Générer code de liaison
    code = generate_link_code()
    expires_at = datetime.now() + timedelta(minutes=10)

    await db.execute("""
        INSERT INTO link_codes (code, user_id, target_platform, expires_at)
        SELECT $1, u.id, $2, $3
        FROM torah_users u
        JOIN torah_user_identities i ON u.id = i.user_id
        WHERE i.platform = 'discord' AND i.platform_user_id = $4
    """, code, platform, expires_at, str(interaction.user.id))

    if platform == "telegram":
        instructions = f"Sur Telegram, envoyez: `/link {code}`"
    else:
        instructions = f"Sur le site web, entrez le code: `{code}`"

    await interaction.response.send_message(
        f"🔗 Code de liaison: `{code}`\n\n{instructions}\n\n⏰ Expire dans 10 minutes.",
        ephemeral=True
    )
```

**Telegram Bot:**
```python
@bot.command("link")
async def link_account(ctx, code: str):
    # Vérifier le code
    result = await db.fetch_one("""
        SELECT user_id FROM link_codes
        WHERE code = $1 AND target_platform = 'telegram'
        AND expires_at > NOW() AND used = false
    """, code)

    if not result:
        return await ctx.reply("❌ Code invalide ou expiré.")

    # Lier le compte
    await db.execute("""
        INSERT INTO torah_user_identities (user_id, platform, platform_user_id, platform_username)
        VALUES ($1, 'telegram', $2, $3)
        ON CONFLICT (platform, platform_user_id) DO NOTHING
    """, result['user_id'], str(ctx.from_user.id), ctx.from_user.username)

    # Marquer le code comme utilisé
    await db.execute("UPDATE link_codes SET used = true WHERE code = $1", code)

    await ctx.reply("✅ Compte lié avec succès! Vos crédits sont maintenant partagés.")
```

#### 9.13.10 Résumé Multi-Plateforme

| Élément | Stockage | Partagé? |
|---------|----------|----------|
| `torah_user_id` | torah_users | Unique par personne |
| `stripe_customer_id` | torah_users | Oui |
| `credits` | torah_users | Oui |
| `plan` | torah_users | Oui |
| `discord_id` | torah_user_identities | Non (par plateforme) |
| `telegram_id` | torah_user_identities | Non (par plateforme) |

**Le proxy n8n ne change pas.** Seul le service gère cette logique.
