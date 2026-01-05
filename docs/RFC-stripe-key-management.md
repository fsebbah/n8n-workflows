# RFC: Gestion des cles Stripe en architecture multi-tenant

**Date:** 2025-01-05
**Mise a jour:** 2025-01-05
**Statut:** DECISION FINALE - Architecture hybride Redis + PostgreSQL + Stripe
**Equipes concernees:** Framework Bot Discord, Plugins, Backend n8n

---

## 0. Resume executif (TL;DR)

```
┌─────────────────────────────────────────────────────────────┐
│                   ARCHITECTURE FINALE                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  REDIS (secrets projet)                                     │
│  └── project:{id} → stripe_key, webhook_secret              │
│                                                              │
│  POSTGRESQL (credits utilisateurs uniquement)               │
│  └── user_credits → project_id, discord_user_id, credits    │
│                                                              │
│  STRIPE API (source de verite pour tout le reste)           │
│  └── Customers, Subscriptions, Prices, Invoices             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Principe :** Minimiser la duplication. Stripe est la source de verite.

### APIs a creer

| Endpoint | Methode | Description | Appelant |
|----------|---------|-------------|----------|
| `/webhook/stripe-register-project` | POST | Enregistre stripe_key et webhook_secret dans Redis | Plugin (demarrage) |
| `/webhook/stripe-events` | POST | Recoit les webhooks Stripe, valide signature | Stripe |
| `/webhook/credits-get` | GET | Recupere credits d'un utilisateur | Bot |
| `/webhook/credits-debit` | POST | Debite des credits | Bot/Workflow interne |
| `/webhook/credits-credit` | POST | Credite des credits (renouvellement) | Webhook Stripe |
| `/webhook/credits-set` | POST | Definit les credits (admin) | Admin/Webhook |

### Schema PostgreSQL

```sql
CREATE TABLE IF NOT EXISTS user_credits (
    project_id VARCHAR(50) NOT NULL,
    discord_user_id VARCHAR(50) NOT NULL,
    credits_remaining INTEGER DEFAULT 0,
    credits_total INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (project_id, discord_user_id)
);

CREATE INDEX idx_user_credits_project ON user_credits(project_id);
```

### Schema Redis

```redis
HSET project:torah stripe_key "sk_live_xxx" webhook_secret "whsec_xxx"
HSET project:mcp stripe_key "sk_live_yyy" webhook_secret "whsec_yyy"
```

### Qui fait quoi ?

#### Plugin (au demarrage)

```python
# 1. Plugin demarre et enregistre ses secrets dans Redis via n8n
await n8n_client.post("/webhook/stripe-register-project", {
    "project_id": "torah",
    "stripe_key": os.getenv("STRIPE_SECRET_KEY"),
    "webhook_secret": os.getenv("STRIPE_WEBHOOK_SECRET"),
    "display_name": "Torah App"
})
```

#### Bot (commandes Discord)

```python
# /plans - Recuperer les plans disponibles
response = await n8n_client.get("/webhook/discord-get-plans",
    headers={"X-Project-ID": "torah"})
# n8n lit stripe_key depuis Redis, appelle Stripe API

# /credits - Voir ses credits
response = await n8n_client.get("/webhook/credits-get",
    params={"project_id": "torah", "discord_user_id": "123456789"})
# n8n lit depuis PostgreSQL user_credits

# /translate (ou autre action qui consomme des credits)
# 1. Bot verifie credits disponibles
credits = await n8n_client.get("/webhook/credits-get", ...)
if credits["credits_remaining"] > 0:
    # 2. Bot effectue l'action
    result = await do_translation(...)
    # 3. Bot debite les credits
    await n8n_client.post("/webhook/credits-debit", {
        "project_id": "torah",
        "discord_user_id": "123456789",
        "amount": 1,
        "reason": "translation"
    })
```

#### Stripe (webhooks automatiques)

```
Stripe envoie webhook → n8n /webhook/stripe-events

Events geres:
- checkout.session.completed → Creer/crediter user dans user_credits
- invoice.paid → Renouveler credits mensuels
- customer.subscription.deleted → Mettre credits a 0
```

### Flux detailles

```
┌─────────────────────────────────────────────────────────────────────┐
│ FLUX 1: Enregistrement projet (plugin demarrage)                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Plugin                    n8n                         Redis         │
│    │                        │                            │           │
│    │ POST /stripe-register  │                            │           │
│    │ {project_id,           │                            │           │
│    │  stripe_key,           │                            │           │
│    │  webhook_secret}       │                            │           │
│    │───────────────────────►│                            │           │
│    │                        │ HSET project:torah ...     │           │
│    │                        │───────────────────────────►│           │
│    │                        │                            │           │
│    │◄───────────────────────│ {success: true}            │           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ FLUX 2: Commande Discord (ex: /plans)                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User    Bot              n8n                Redis       Stripe      │
│   │       │                │                   │           │         │
│   │/plans │                │                   │           │         │
│   │──────►│                │                   │           │         │
│   │       │ GET /discord-  │                   │           │         │
│   │       │ get-plans      │                   │           │         │
│   │       │ X-Project-ID:  │                   │           │         │
│   │       │ torah          │                   │           │         │
│   │       │───────────────►│                   │           │         │
│   │       │                │ HGET project:     │           │         │
│   │       │                │ torah stripe_key  │           │         │
│   │       │                │──────────────────►│           │         │
│   │       │                │◄──────────────────│           │         │
│   │       │                │ sk_live_xxx       │           │         │
│   │       │                │                   │           │         │
│   │       │                │ GET /v1/prices    │           │         │
│   │       │                │───────────────────────────────►         │
│   │       │                │◄───────────────────────────────         │
│   │       │                │ {plans: [...]}    │           │         │
│   │       │◄───────────────│                   │           │         │
│   │◄──────│ Affiche plans  │                   │           │         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ FLUX 3: Webhook Stripe (nouvel abonnement)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Stripe              n8n                   Redis       PostgreSQL    │
│    │                  │                      │              │        │
│    │ POST /stripe-    │                      │              │        │
│    │ events           │                      │              │        │
│    │ {type: checkout. │                      │              │        │
│    │  session.complete│                      │              │        │
│    │  metadata: {     │                      │              │        │
│    │   project_id,    │                      │              │        │
│    │   discord_user}} │                      │              │        │
│    │─────────────────►│                      │              │        │
│    │                  │ HGET project:torah   │              │        │
│    │                  │ webhook_secret       │              │        │
│    │                  │─────────────────────►│              │        │
│    │                  │◄─────────────────────│              │        │
│    │                  │ Valide signature     │              │        │
│    │                  │                      │              │        │
│    │                  │ INSERT user_credits  │              │        │
│    │                  │ (project, user,      │              │        │
│    │                  │  credits=1000)       │              │        │
│    │                  │─────────────────────────────────────►        │
│    │◄─────────────────│ 200 OK               │              │        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ FLUX 4: Consommation credits                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  User    Bot              n8n                         PostgreSQL     │
│   │       │                │                               │         │
│   │/use   │                │                               │         │
│   │──────►│                │                               │         │
│   │       │ GET /credits-  │                               │         │
│   │       │ get?user=123   │                               │         │
│   │       │───────────────►│                               │         │
│   │       │                │ SELECT credits_remaining      │         │
│   │       │                │ FROM user_credits             │         │
│   │       │                │ WHERE discord_user_id='123'   │         │
│   │       │                │──────────────────────────────►│         │
│   │       │                │◄──────────────────────────────│         │
│   │       │◄───────────────│ {credits: 850}                │         │
│   │       │                │                               │         │
│   │       │ [Bot fait action]                              │         │
│   │       │                │                               │         │
│   │       │ POST /credits- │                               │         │
│   │       │ debit          │                               │         │
│   │       │ {user, amt: 1} │                               │         │
│   │       │───────────────►│                               │         │
│   │       │                │ UPDATE user_credits           │         │
│   │       │                │ SET credits = credits - 1     │         │
│   │       │                │──────────────────────────────►│         │
│   │       │◄───────────────│ {credits: 849}                │         │
│   │◄──────│ Action OK      │                               │         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Donnees echangees par endpoint

| Endpoint | Input | Output |
|----------|-------|--------|
| `POST /stripe-register-project` | `{project_id, stripe_key, webhook_secret, display_name}` | `{success: true}` |
| `GET /discord-get-plans` | Header: `X-Project-ID` | `{plans: [{id, name, price, credits}]}` |
| `GET /credits-get` | `?project_id=torah&discord_user_id=123` | `{credits_remaining: 850, credits_total: 1000}` |
| `POST /credits-debit` | `{project_id, discord_user_id, amount, reason}` | `{credits_remaining: 849}` |
| `POST /credits-credit` | `{project_id, discord_user_id, amount, reason}` | `{credits_remaining: 1850}` |
| `POST /credits-set` | `{project_id, discord_user_id, credits_remaining, credits_total}` | `{success: true}` |
| `POST /stripe-events` | Stripe webhook payload | `200 OK` |

---

## 1. Architecture clarifiee

### 1.1 Modele de deploiement

Le framework bot-discord est une **dependance pip** installee par chaque plugin.
**1 plugin = 1 repo = 1 bot Discord = 1 cle Stripe = 1 deploiement independant**

```
┌─────────────────────────────┐   ┌─────────────────────────────┐
│     Plugin Torah (repo)     │   │     Plugin MCP (repo)       │
├─────────────────────────────┤   ├─────────────────────────────┤
│ requirements.txt:           │   │ requirements.txt:           │
│   discord-bot-framework     │   │   discord-bot-framework     │
│                             │   │                             │
│ .env:                       │   │ .env:                       │
│   PROJECT_ID=torah          │   │   PROJECT_ID=mcp            │
│   DISCORD_TOKEN=token_a     │   │   DISCORD_TOKEN=token_b     │
│   STRIPE_SECRET_KEY=sk_a    │   │   STRIPE_SECRET_KEY=sk_b    │
│   STRIPE_WEBHOOK_SECRET=... │   │   STRIPE_WEBHOOK_SECRET=... │
└──────────────┬──────────────┘   └──────────────┬──────────────┘
               │                                  │
               │         Meme serveur             │
               └──────────────┬───────────────────┘
                              ▼
                    ┌───────────────────┐
                    │   Redis (vault)   │◄──── Secrets centralises
                    │  host3.local:6381 │
                    └─────────┬─────────┘
                              │
                              ▼
                    ┌───────────────────┐
                    │        n8n        │
                    │   (workflows)     │
                    └───────────────────┘
```

### 1.2 Principe fondamental: Source unique de verite

**Redis comme vault de secrets:**

- Le plugin possede ses cles Stripe dans son `.env`
- Au demarrage, le plugin **pousse** ses secrets dans Redis
- n8n **lit** les secrets depuis Redis (jamais en transit HTTP)
- Redis = source unique partagee entre plugin et n8n

---

## 2. Les deux flux a considerer

### 2.1 Flux Bot → n8n (commandes Discord)

```
User ──► Bot ──► n8n ──► Redis (lookup) ──► Stripe API
              │
              └─► Bot passe UNIQUEMENT project_id
```

**Exemple:** `/plans`, `/subscribe`, `/account`

Le bot passe seulement `X-Project-ID`. n8n recupere la cle depuis Redis.

### 2.2 Flux Stripe → n8n (webhooks)

```
Stripe ──► n8n /webhook/stripe-events
               │
               └─► n8n extrait project_id des metadata
               └─► n8n recupere webhook_secret depuis Redis
               └─► n8n valide la signature
```

**Avec Redis, les deux flux sont resolus de la meme maniere.**

---

## 3. Options evaluees

### Option A: Un endpoint webhook par projet
_(Ne scale pas - rejetee)_

### Option B: project_id dans metadata Stripe
_(Bonne idee, integree dans Option F)_

### Option C: Stockage PostgreSQL
_(Remplacee par Redis - plus performant)_

### Option D: Credentials n8n manuelles
_(Rejetee par equipe n8n - erreurs humaines)_

### Option E: Stripe Connect
_(Overkill pour 5 projets - a reevaluer si >10)_

### Option F: Redis comme vault de secrets (RETENUE)

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPTION F - ARCHITECTURE REDIS                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  INITIALISATION (demarrage plugin):                             │
│  ──────────────────────────────────                             │
│  Plugin → Redis (host3.local:6381/2):                           │
│    HSET project:torah stripe_key "sk_live_xxx"                  │
│    HSET project:torah webhook_secret "whsec_xxx"                │
│    HSET project:torah display_name "Torah App"                  │
│    HSET project:torah active "true"                             │
│                                                                  │
│  FLUX 1: Bot → n8n                                              │
│  ─────────────────                                              │
│  Bot: POST /webhook/discord-get-plans                           │
│       Header: X-Project-ID: torah                               │
│       (PAS de cle dans le header!)                              │
│  n8n: HGET project:torah stripe_key                             │
│  n8n: appelle Stripe API avec la cle                            │
│                                                                  │
│  FLUX 2: Stripe → n8n                                           │
│  ─────────────────────                                          │
│  Stripe: POST /webhook/stripe-events                            │
│          Body contient metadata.project_id                      │
│  n8n: HGET project:torah webhook_secret                         │
│  n8n: valide la signature Stripe                                │
│  n8n: traite le webhook                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Matrice de decision

| Critere | Option B+C | Option D | Option E | **Option F (Redis)** |
|---------|------------|----------|----------|----------------------|
| **Securite** | Bonne | Excellente | Excellente | **Excellente** |
| **Cle en transit** | Oui (header) | Non | Non | **Non** |
| **Scalabilite** | Bonne | Faible | Excellente | **Excellente** |
| **Source unique** | Non (2 endroits) | Non | Oui | **Oui (Redis)** |
| **Performance lookup** | ~5-10ms | ~1ms | N/A | **~1ms** |
| **Effort n8n** | Moyen | Faible | Moyen | **Faible** |
| **Effort plugin** | Moyen | Faible | Eleve | **Faible** |
| **Infra existante** | Oui (PG) | Oui | Non | **Oui (Redis)** |

---

## 5. Responsabilites par composant

### 5.1 Framework Bot Discord (dependance pip)

| Responsabilite | Description |
|----------------|-------------|
| Fournir `N8nClient` | Client HTTP pour appeler n8n |
| Fournir `RedisSecretsClient` | Client pour pousser secrets dans Redis |
| Passer `X-Project-ID` | Seul header necessaire (plus de cle!) |
| Enregistrer secrets au demarrage | `HSET project:{id} ...` |
| Gerer les erreurs | Retry, timeout, fallback |

### 5.2 Plugin (utilisateur du framework)

| Responsabilite | Description |
|----------------|-------------|
| Configurer `.env` | `PROJECT_ID`, `STRIPE_SECRET_KEY`, etc. |
| Configurer Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_DB` |
| Appeler `register_secrets()` | Au demarrage du bot |
| Posseder les cles Stripe | Dans son `.env` local |

### 5.3 n8n (workflows)

| Responsabilite | Description |
|----------------|-------------|
| Lire secrets depuis Redis | `HGET project:{id} stripe_key` |
| Valider webhooks Stripe | Avec `webhook_secret` de Redis |
| Appeler l'API Stripe | Avec la cle lue depuis Redis |
| **Ne plus attendre de cle en header** | Juste `X-Project-ID` |

### 5.4 Redis (vault)

| Responsabilite | Description |
|----------------|-------------|
| Stocker les secrets | Hash par projet |
| Haute disponibilite | Deja en place sur host3.local |
| Acces rapide | ~1ms lookup |

---

## 6. Recommandation finale

### DECISION: Option F (Redis)

**Pourquoi Redis plutot que B+C (PostgreSQL)?**

| Critere | PostgreSQL (B+C) | Redis (F) |
|---------|------------------|-----------|
| Cle en transit | Oui (chaque requete) | **Non** |
| Latence | ~5-10ms | **~1ms** |
| Infrastructure | Deja la | **Deja la** |
| Complexite | 2 systemes (header + PG) | **1 systeme (Redis)** |

**Avantages decisifs de Redis:**

1. **Cle JAMAIS en transit** - Meme pas en header HTTPS
2. **Performance** - Redis est concu pour ca
3. **Simplicite** - Un seul systeme pour tous les secrets
4. **Infrastructure existante** - `host3.local:6381` deja disponible
5. **Source unique** - Redis devient le vault partage

---

## 7. Configuration Redis

### 7.1 Acces Redis existant

```env
REDIS_HOST=host3.local
REDIS_PORT=6381
REDIS_DB=2
REDIS_PASSWORD=
```

### 7.2 Schema Redis

```redis
# Hash par projet - toutes les infos regroupees
HSET project:torah stripe_key "sk_live_xxxxxxxxxxxx"
HSET project:torah webhook_secret "whsec_xxxxxxxxxxxx"
HSET project:torah display_name "Torah App"
HSET project:torah active "true"
HSET project:torah registered_at "2025-01-05T10:00:00Z"

# Commandes de lecture
HGET project:torah stripe_key          # → "sk_live_xxx"
HGET project:torah webhook_secret      # → "whsec_xxx"
HGETALL project:torah                  # → toutes les infos

# Liste des projets actifs
KEYS project:*                         # → ["project:torah", "project:mcp", ...]
```

### 7.3 TTL optionnel (rotation forcee)

```redis
# Forcer re-enregistrement toutes les 24h
EXPIRE project:torah 86400
```

---

## 8. Implementation cote Bot

### 8.1 Nouveau client Redis

```python
# framework/services/redis_secrets.py

import redis.asyncio as redis
from dataclasses import dataclass

@dataclass
class RedisConfig:
    host: str = "host3.local"
    port: int = 6381
    db: int = 2
    password: str | None = None

class RedisSecretsClient:
    """Client pour gerer les secrets Stripe dans Redis."""

    def __init__(self, config: RedisConfig):
        self.config = config
        self._client: redis.Redis | None = None

    async def connect(self):
        self._client = redis.Redis(
            host=self.config.host,
            port=self.config.port,
            db=self.config.db,
            password=self.config.password,
            decode_responses=True
        )

    async def register_project(
        self,
        project_id: str,
        stripe_key: str,
        webhook_secret: str,
        display_name: str | None = None
    ):
        """Enregistre les secrets d'un projet dans Redis."""
        key = f"project:{project_id}"
        await self._client.hset(key, mapping={
            "stripe_key": stripe_key,
            "webhook_secret": webhook_secret,
            "display_name": display_name or project_id,
            "active": "true",
            "registered_at": datetime.utcnow().isoformat()
        })

    async def unregister_project(self, project_id: str):
        """Supprime un projet de Redis."""
        await self._client.delete(f"project:{project_id}")
```

### 8.2 Utilisation au demarrage du plugin

```python
# Plugin main.py

from framework import N8nClient, RedisSecretsClient, RedisConfig

async def main():
    # Configuration
    config = load_config()

    # Enregistrer secrets dans Redis
    redis_client = RedisSecretsClient(RedisConfig(
        host=config.redis_host,
        port=config.redis_port,
        db=config.redis_db
    ))
    await redis_client.connect()
    await redis_client.register_project(
        project_id=config.project_id,
        stripe_key=config.stripe_secret_key,
        webhook_secret=config.stripe_webhook_secret,
        display_name="Torah App"
    )

    # Initialiser le bot (plus besoin de passer stripe_key!)
    n8n_client = N8nClient(
        base_url=config.n8n_base_url,
        project_id=config.project_id  # Plus de stripe_key ici
    )

    # Demarrer le bot...
```

### 8.3 N8nClient simplifie

```python
# Plus besoin de X-Stripe-Secret-Key!
headers = {
    "X-Project-ID": self.project_id,
    "Content-Type": "application/json"
}
# n8n lira la cle depuis Redis
```

---

## 9. Implementation cote n8n

### 9.1 Lecture Redis dans workflow

```javascript
// Node "Code" dans n8n
const Redis = require('ioredis');

const redis = new Redis({
  host: 'host3.local',
  port: 6381,
  db: 2
});

const projectId = $input.first().headers['x-project-id'];
const stripeKey = await redis.hget(`project:${projectId}`, 'stripe_key');

if (!stripeKey) {
  throw new Error(`Project ${projectId} not found in Redis`);
}

// Utiliser stripeKey pour appeler Stripe API
return { stripeKey, projectId };
```

### 9.2 Validation webhook Stripe

```javascript
const projectId = $input.first().json.data.object.metadata.project_id;
const webhookSecret = await redis.hget(`project:${projectId}`, 'webhook_secret');

// Valider la signature
const signature = $input.first().headers['stripe-signature'];
const isValid = stripe.webhooks.constructEvent(
  rawBody,
  signature,
  webhookSecret
);
```

---

## 10. Securite

### 10.1 Acces Redis

| Risque | Mitigation |
|--------|------------|
| Redis expose | Bind sur reseau prive uniquement |
| Pas d'auth | `REDIS_PASSWORD` si necessaire |
| Donnees en clair | Acceptable sur reseau interne |

### 10.2 Audit

| Element | Action |
|---------|--------|
| `stripe_key` | JAMAIS loggue |
| `webhook_secret` | JAMAIS loggue |
| `project_id` | Loggue pour audit |
| Acces Redis | Logger les connexions |

### 10.3 Rotation des cles

| Scenario | Procedure |
|----------|-----------|
| Rotation planifiee | 1. Mettre a jour `.env` du plugin 2. Redemarrer le plugin (re-enregistre dans Redis) |
| Cle compromise | 1. Revoquer dans Stripe 2. Generer nouvelle cle 3. Mettre a jour `.env` 4. Redemarrer plugin |

---

## 11. Historique des discussions

### 11.1 Reponse equipe n8n (initiale)

L'equipe n8n avait propose Option B+C (metadata + PostgreSQL).

**Points d'accord conserves:**
- Architecture 1 plugin = 1 bot = 1 cle
- Metadata `project_id` dans webhooks Stripe
- Header plutot que body pour identifiants

**Point ameliore avec Redis:**
- Plus besoin de passer `stripe_secret_key` en header
- Un seul systeme (Redis) au lieu de deux (header + PostgreSQL)

### 11.2 Decision finale

Apres analyse, **Option F (Redis)** retenue car:
1. Infrastructure Redis deja disponible
2. Cle jamais en transit (meilleure securite)
3. Plus simple (un seul systeme)
4. Plus performant (~1ms vs ~5-10ms)

---

## 12. Prochaines etapes

- [x] Review par equipe Bot
- [x] Review par equipe n8n
- [x] Decision architecture finale (Redis + PostgreSQL + Stripe)
- [ ] **Framework Bot:** Implementer `RedisSecretsClient`
- [ ] **n8n:** Creer workflow `stripe-register-project`
- [ ] **n8n:** Creer workflow `stripe-events` (webhooks)
- [ ] **n8n:** Creer workflows credits (`credits-get`, `credits-debit`, `credits-credit`, `credits-set`)
- [ ] **n8n:** Mettre a jour workflows Discord existants pour lire Redis
- [ ] **PostgreSQL:** Creer table `user_credits`
- [ ] **Tests:** Integration complete
- [ ] **Documentation:** Mise a jour guides plugin

---

## 13. Historique

| Date | Modification |
|------|--------------|
| 2025-01-05 | Version initiale |
| 2025-01-05 | Rewrite apres analyse equipe Bot |
| 2025-01-05 | Ajout reponse equipe n8n (Option B+C) |
| 2025-01-05 | **Decision finale: Option F (Redis)** |

---

## 14. Analyse n8n de l'Option F (Redis)

### 14.1 Points d'accord

| Point | Verdict |
|-------|---------|
| Cle jamais en transit HTTP | **Excellent** - meilleure securite |
| Performance ~1ms | **Bon** - Redis est fait pour ca |
| Infrastructure existante | **Bon** - pas de nouveau systeme a deployer |
| Simplification headers | **Bon** - juste X-Project-ID |

### 14.2 Points de challenge

| Concern | Question/Risque |
|---------|-----------------|
| **Integration n8n/Redis** | ioredis est-il disponible dans n8n? Faut-il installer un package npm? |
| **Single Point of Failure** | Si Redis down → TOUS les projets KO. Pas de fallback. |
| **Persistence Redis** | AOF/RDB active? Risque de perte au restart? |
| **Authentification Redis** | `REDIS_PASSWORD` vide dans l'exemple. Redis est-il protege? |
| **Audit/Logging** | PostgreSQL a meilleur outillage audit que Redis |
| **Code node limitations** | Le Code node n8n peut-il faire `require('ioredis')`? |

### 14.3 Questions techniques pour validation

**Q1. ioredis dans n8n?**

Le Code node n8n ne permet PAS `require()` de packages externes par defaut.
Options:
- a) Utiliser le node "Redis" natif de n8n (si disponible)
- b) HTTP Request vers une API Redis (comme Redis REST)
- c) Custom node n8n avec ioredis
- d) Executer un script externe via Bash node

**Quelle approche est prevue?**

**Q2. Fallback si Redis indisponible?**

Scenario: Redis down pendant 5 minutes.
- Webhooks Stripe arrives → echec validation → perte d'evenements?
- Commandes Discord → echec → mauvaise UX?

**Proposition:** Implementer un circuit breaker ou cache local temporaire.

**Q3. Persistence Redis?**

```bash
# Verifier la config Redis
redis-cli -h host3.local -p 6381 CONFIG GET appendonly
redis-cli -h host3.local -p 6381 CONFIG GET save
```

Si `appendonly=no` et `save=""` → donnees perdues au restart!

**Q4. Securite Redis?**

```env
REDIS_PASSWORD=       # Vide = pas d'auth!
```

Redis sur reseau prive uniquement? Firewall?

### 14.4 Proposition d'implementation n8n

**Option A: HTTP Request vers Redis (si Redis REST disponible)**

```javascript
// Pas besoin de ioredis
const response = await $http.request({
  method: 'GET',
  url: 'http://host3.local:6380/HGET/project:torah/stripe_key'
});
```

**Option B: Node Redis natif n8n**

Verifier si `n8n-nodes-base.redis` existe et supporte HGET.

**Option C: Script externe**

```javascript
// Dans Code node - appeler redis-cli via exec
const { execSync } = require('child_process');
const key = execSync('redis-cli -h host3.local -p 6381 HGET project:torah stripe_key').toString().trim();
```

### 14.5 Conditions d'acceptation

**J'accepte Option F (Redis) SI:**

- [ ] Confirmation que ioredis ou alternative fonctionne dans n8n
- [ ] Redis a persistence activee (AOF ou RDB)
- [ ] Redis est sur reseau prive OU a authentification
- [ ] Plan de fallback documente si Redis down
- [ ] Test d'integration valide le flux complet

### 14.6 Alternative de repli

Si l'integration Redis/n8n s'avere trop complexe:

**Revenir a Option B+C avec header chiffre:**

```http
X-Stripe-Key-Encrypted: base64(encrypt(sk_live_xxx, shared_secret))
```

n8n dechiffre avec une cle partagee. Cle en transit mais chiffree.

---

## Annexe: Format des requetes

### Avant (Option B+C)

```http
POST /webhook/discord-get-plans HTTP/1.1
Host: pi6.local:5678
X-Project-ID: torah
X-Stripe-Secret-Key: sk_live_xxxxxxxxxxxx  ← Cle en transit

{"discord_user_id": "123456789"}
```

### Apres (Option F - Redis)

```http
POST /webhook/discord-get-plans HTTP/1.1
Host: pi6.local:5678
X-Project-ID: torah
                                            ← Plus de cle!
{"discord_user_id": "123456789"}
```

n8n recupere la cle depuis Redis: `HGET project:torah stripe_key`
