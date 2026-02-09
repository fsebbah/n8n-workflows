# RFC-028: Guild Subscriptions & Plan Visibility - Schema Public

**Status:** Draft
**Date:** 2026-02-06
**Authors:** API Team + Claude (Opus 4.6)
**Target Teams:** api-backend, chatbot.api, n8n-workflows
**Scope:** Table publique de suivi des abonnements guilds + quotas conversations

---

## Table des matieres

1. [Contexte](#contexte)
2. [Probleme](#probleme)
3. [Etat des lieux](#etat-des-lieux)
4. [Solution proposee](#solution-proposee)
5. [Schema de la table](#schema-de-la-table)
6. [Integration conversations](#integration-conversations)
7. [Flux de mise a jour](#flux-de-mise-a-jour)
8. [Impact sur la migration e-commerce](#impact-sur-la-migration-e-commerce)
9. [Questions ouvertes](#questions-ouvertes)

---

## Contexte

### Architecture actuelle

```
PUBLIC schema (partage)                  TENANT schema (isole)
┌────────────────────────┐               ┌────────────────────────┐
│ pricing_plans          │               │ user_subscriptions     │
│  - starter (19 EUR)    │               │  - user_id → plan_id   │
│  - business (35 EUR)   │               │  - stripe_subscription │
│  - pro (55 EUR)        │               │  - credits_allocated   │
│                        │               │                        │
│ stripe_products        │               │ user_credit_balance    │
│  - stripe_product_id   │               │  - total_credits       │
│  - plan_id (FK)        │               │  - subscription_credits│
│                        │               │                        │
│ credit_packs           │               │ user_credits (ecom)    │
│  - pack_5, pack_10...  │               │  - guild_id + user_id  │
│                        │               │  - plan_id, status     │
│ (rien sur QUI a quoi)  │               │  - credits_remaining   │
└────────────────────────┘               └────────────────────────┘
```

### Le manque

Cote **azy.solutions** (plateforme), il n'y a **aucune table publique** qui repond a :
- "Quelle formule a souscrit le owner de ce tenant ?"
- "Ce tenant a-t-il un plan actif ?"
- "Combien de tokens ce plan inclut-il ?"
- "Quels modeles LLM sont configures pour cette guild ?"

Pour le savoir aujourd'hui, il faudrait :
1. Connaitre le tenant
2. Entrer dans le schema tenant
3. Lire `user_credits` ou `user_subscriptions`

C'est un **cross-schema query** — pattern interdit dans l'architecture multi-tenant.

---

## Probleme

### 1. Pas de visibilite plateforme

L'owner azy.solutions ne peut pas voir d'un coup d'oeil quels guilds ont quel plan, sans parcourir chaque tenant.

### 2. Pas de feature gating au niveau routage

Quand une requete arrive avec `X-Project-ID` + `X-Guild-ID`, le middleware resout le tenant. Mais il ne peut pas verifier si la guild a un plan actif **avant** de router vers le tenant schema.

### 3. Conversations = un plan aussi

Les conversations (chatbot) sont egalement liees a un plan :
- Nombre max de conversations par mois
- Nombre max de messages par conversation
- Modeles LLM accessibles selon le plan
- Tokens max par requete

Aujourd'hui, ces quotas sont dans `public.pricing_plans.features` (JSONB) mais le **lien guild → plan** n'existe pas en public.

### 4. Double systeme de credits → convergence

| Systeme | Scope | Tables | Utilise par |
|---------|-------|--------|------------|
| **SaaS credits** | per user, per tenant | `user_subscriptions`, `user_credit_balance`, `credit_transactions` | chatbot.api (conversations, LLM) |
| **E-commerce credits** | per guild, per user, per tenant | `user_credits`, `user_credit_logs` | plugins (shopping, recettes) |

**Decision** : convergence progressive. Tout est gere par chat.api, un seul backend → unification naturelle a terme.

---

## Etat des lieux

### Tables existantes en PUBLIC (reference)

| Table | Contenu | Clee |
|-------|---------|------|
| `pricing_plans` | Definitions des formules (starter, business, pro) | id (string) |
| `stripe_products` | Mapping Stripe produits/prix | stripe_product_id |
| `credit_packs` | Packs credits PAYG | id (string) |
| `credit_conversion_rates` | Taux EUR/USD | from_currency + to_currency |

### Tables existantes en TENANT (etat abonnement)

| Table | Contenu | Scope |
|-------|---------|-------|
| `user_subscriptions` | Abonnement SaaS actif | per user |
| `user_credit_balance` | Solde credits SaaS | per user |
| `credit_purchases` | Historique achats (FIFO) | per user |
| `credit_transactions` | Audit usage credits | per user |
| `user_credits` (ecom) | Credits e-commerce | per guild + per user |
| `user_credit_logs` (ecom) | Audit credits e-commerce | per guild + per user |

### Ce qui manque

**En public** : une table qui lie `tenant_id` + `guild_id` → `plan` + `status` + `quotas`.

---

## Solution proposee

### Nouvelle table : `guild_subscriptions` (PUBLIC)

Le plan est **par tenant** (le owner gere un tenant, il peut avoir plusieurs guilds).
La table stocke l'abonnement au niveau tenant + la configuration LLM par guild.

```
PUBLIC                                      TENANT
┌─────────────────────────┐                 ┌─────────────────────────┐
│ guild_subscriptions     │                 │ user_credits (ecom)     │
│  ├─ tenant_id           │   meme service  │  ├─ guild_id            │
│  ├─ guild_id            │◄──────────────► │  ├─ discord_user_id     │
│  ├─ plan_id             │   meme tx       │  ├─ plan_id             │
│  ├─ subscription_status │                 │  ├─ subscription_status │
│  ├─ allowed_models []   │                 │  ├─ credits_remaining   │
│  └─ token_quotas (JSONB)│                 │  └─ credits_total       │
│                         │                 │                         │
│ pricing_plans           │                 │ user_subscriptions      │
│  ├─ id (FK plan_id)     │                 │  ├─ user_id             │
│  └─ credits_monthly     │                 │  └─ plan_id             │
└─────────────────────────┘                 └─────────────────────────┘
```

### Cas d'usage

| Cas | Comment |
|-----|---------|
| Feature gating avant routing | Middleware lit `guild_subscriptions` en public (cache Redis TTL 5-10min) |
| Dashboard admin azy.solutions | `SELECT * FROM guild_subscriptions WHERE subscription_status = 'active'` |
| Modeles LLM autorises | `guild_subscriptions.allowed_models` configurable par guild |
| Quotas tokens par user | Definis dans `guild_subscriptions.token_quotas`, appliques per user |
| Renouvellement Stripe | chat.api met a jour public + tenant dans la meme transaction |

---

## Schema de la table

### `guild_subscriptions` (PUBLIC schema)

Le plan est au niveau tenant. Chaque guild du tenant herite du plan mais peut avoir sa propre config LLM.

```sql
CREATE TABLE public.guild_subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               VARCHAR(100) NOT NULL,

    -- Identifiants guild
    guild_id                VARCHAR(50) NOT NULL,
    guild_name              VARCHAR(100),
    owner_discord_user_id   VARCHAR(50),

    -- Plan souscrit (au niveau tenant, herite par la guild)
    plan_id                 VARCHAR(100),          -- FK logique vers pricing_plans ou plan libre
    plan_name               VARCHAR(100),          -- Cache du nom (ex: "Premium", "Marmiton Pro")
    subscription_status     VARCHAR(50) NOT NULL DEFAULT 'free',
                            -- free, active, trialing, past_due, canceled, expired

    -- Stripe
    stripe_customer_id      VARCHAR(100),
    stripe_subscription_id  VARCHAR(100),

    -- Periode
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    canceled_at             TIMESTAMPTZ,

    -- Tokens inclus dans l'abonnement (quotas per user)
    token_quotas            JSONB NOT NULL DEFAULT '{}',
    -- Exemple :
    -- {
    --   "tokens_monthly_per_user": 100000,
    --   "max_tokens_per_request": 4096,
    --   "max_file_size_mb": 10
    -- }

    -- Modeles LLM configurables par guild (independant du plan)
    allowed_models          JSONB NOT NULL DEFAULT '[]',
    -- Exemple :
    -- ["gpt-4o-mini", "claude-haiku-3.5", "claude-sonnet-4"]

    -- Quotas e-commerce
    ecommerce_quotas        JSONB NOT NULL DEFAULT '{}',
    -- Exemple :
    -- {
    --   "credits_monthly": 5000,
    --   "max_products": 500,
    --   "max_orders_monthly": 1000,
    --   "features": ["checkout", "inventory", "discount_codes"]
    -- }

    -- Metadata
    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Contraintes
    UNIQUE(tenant_id, guild_id)
);

-- Index
CREATE INDEX ix_guild_subscriptions_tenant_id ON public.guild_subscriptions(tenant_id);
CREATE INDEX ix_guild_subscriptions_guild_id ON public.guild_subscriptions(guild_id);
CREATE INDEX ix_guild_subscriptions_status ON public.guild_subscriptions(subscription_status);
CREATE INDEX ix_guild_subscriptions_plan_id ON public.guild_subscriptions(plan_id);
```

---

## Integration conversations & tokens

### Modele de quotas

L'abonnement inclut un **quota de tokens** (pas un nombre de conversations). Chaque user a son propre quota.

```
Plan "Pro" (tenant-level)
    │
    ├── token_quotas: { "tokens_monthly_per_user": 100000 }
    │
    ├── Guild A
    │   ├── allowed_models: ["gpt-4o", "claude-sonnet-4"]  ← configurable
    │   ├── User 1: 100k tokens/mois (quota individuel)
    │   └── User 2: 100k tokens/mois (quota individuel)
    │
    └── Guild B
        ├── allowed_models: ["gpt-4o-mini"]                ← configurable
        ├── User 3: 100k tokens/mois
        └── User 4: 100k tokens/mois
```

### Separation des responsabilites

| Donnee | Stockage | Niveau |
|--------|----------|--------|
| Plan souscrit + status | `public.guild_subscriptions` | Per tenant (herite par guilds) |
| Modeles LLM autorises | `public.guild_subscriptions.allowed_models` | **Configurable par guild** |
| Quota tokens par user | `public.guild_subscriptions.token_quotas` | Per tenant (applique per user) |
| Consommation tokens | `tenant.credit_transactions` | Per user dans le tenant |
| Credits e-commerce | `tenant.user_credits` | Per guild + per user |

### Avantages du JSONB pour les quotas

- **Un seul lookup** : le middleware lit `guild_subscriptions` (cache Redis) et a tout
- **Pas de jointure** : quotas denormalises pour la performance
- **Flexible** : JSONB permet d'ajouter des quotas sans migration

---

## Flux de mise a jour

Tout est gere par **chat.api** (un seul service, pas de double POST n8n).

### Souscription initiale

```
Stripe webhook → chat.api
    │
    chat.api (meme transaction)
    │
    ├──► public.guild_subscriptions
    │    → upsert (tenant_id, guild_id)
    │    → set plan_id, status, token_quotas
    │
    └──► tenant.user_credits
         → upsert (guild_id, discord_user_id)
         → set plan_id, credits_remaining
```

### Renouvellement mensuel

```
Stripe webhook (invoice.payment_succeeded) → chat.api
    │
    chat.api (meme transaction)
    │
    ├──► public.guild_subscriptions
    │    → update current_period_end, status = 'active'
    │
    └──► tenant.user_credits
         → reset credits_remaining
```

### Feature gating (middleware + cache Redis)

```python
# Pseudo-code middleware
async def check_guild_plan(request):
    guild_id = request.headers.get("X-Guild-ID")
    tenant_id = request.headers.get("X-Tenant-ID")

    # 1. Verifier cache Redis (TTL 5-10min)
    cache_key = f"guild_sub:{tenant_id}:{guild_id}"
    cached = await redis.get(cache_key)
    if cached:
        sub = json.loads(cached)
    else:
        # 2. Fallback lecture PUBLIC
        sub = await db.execute(
            select(GuildSubscription)
            .where(GuildSubscription.tenant_id == tenant_id)
            .where(GuildSubscription.guild_id == guild_id)
        )
        await redis.setex(cache_key, 300, sub.json())

    if not sub or sub.subscription_status not in ("active", "trialing"):
        raise HTTPException(403, "Subscription inactive")

    # 3. Injecter dans la request
    request.state.plan_id = sub.plan_id
    request.state.token_quotas = sub.token_quotas
    request.state.allowed_models = sub.allowed_models
```

---

## Impact sur la migration e-commerce

### Changements PR 1 (en cours)

| Action | Detail |
|--------|--------|
| Nouvelle migration public | `guild_subscriptions` dans le schema public |
| Migration ecommerce inchangee | Les 16 tables tenant restent identiques |
| `user_credits` reste en tenant | Donnees operationnelles plugin (credits per user per guild) |
| `guild_subscriptions` en public | Visibilite plateforme (plan, status, quotas, modeles LLM) |
| Pas de double ecriture | chat.api gere les deux dans la meme transaction |

### Nouvelle migration a creer

```
alembic/versions/
  20260206_1400_XXXX_guild_subscriptions_public.py
  → CREATE TABLE public.guild_subscriptions (...)
  → PUBLIC-only (skip tenant schemas)
```

---

## Decisions validees

### Architecture

| # | Question | Reponse | Decide par |
|---|----------|---------|------------|
| 1 | Double ecriture guild_subscriptions ↔ user_credits ? | **Non**. Tout est dans chat.api, meme service, meme transaction. Pas de sync n8n. | api-backend |
| 2 | Convergence des deux systemes de credits ? | **Oui, naturellement**. Un seul backend gere les deux. Convergence progressive. | api-backend |
| 3 | Plan par guild ou par tenant ? | **Par tenant**. Le owner gere un tenant, il peut avoir plusieurs guilds sous ce tenant. | Owner azy |
| 8 | Source de verite en cas de desync ? | **Elimine**. Meme service ecrit dans public et tenant → pas de desync possible. | api-backend |

### Conversations & Quotas

| # | Question | Reponse | Decide par |
|---|----------|---------|------------|
| 4 | Comptage conversations mensuelles ? | **Via tokens**. L'abonnement inclut un quota de tokens, pas un nombre de conversations. | Owner azy |
| 5 | Quotas par user ou par guild ? | **Par user**. Chaque user aura son propre quota. Details non determines pour le moment. | Owner azy |
| 6 | Modeles LLM fixes par plan ou configurables ? | **Configurables par guild**. Les modeles disponibles ne sont pas lies au plan, ils sont configurables independamment. | Owner azy |

### Technique

| # | Question | Reponse | Decide par |
|---|----------|---------|------------|
| 7 | Cache Redis pour guild_subscriptions ? | **Oui**. Cache Redis avec TTL 5-10min. Evite de taper le public schema a chaque requete. | api-backend |
| 9 | Guilds existantes a initialiser ? | **Lazy init ou script de seed**. Tables creees from scratch, initialisation au premier acces ou via script admin. | api-backend |

---

## Voir aussi

- **RFC-017**: Job Lifecycle & Credits Management
- **RFC-020**: Unification Discord Multi-Tenant
- **RFC-005**: User Data Model / Member Join Credits
- `alembic/versions/20251228_1000_credits_public_tables.py` — Tables credits publiques existantes
- `alembic/versions/20260206_1200_daca1b5111c5_ecommerce_tables.py` — Migration e-commerce tenant
- `docs/plans/ecommerce-migration-plan.md` — Plan de migration e-commerce (4 PRs)
