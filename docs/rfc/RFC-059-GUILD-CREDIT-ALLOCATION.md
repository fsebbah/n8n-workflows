# RFC-059 : Allocation de credits par Guild (Admin)

**Date** : 2026-04-09
**Auteur** : Plugin Recipes Team
**Statut** : Draft v2
**Priorite** : Haute

---

## 1. Resume

Permettre a l'administrateur d'une guild d'allouer un quota de credits
mensuel a chaque utilisateur. Ces credits sont independants de Stripe.

Deux modeles coexistent mais ne se cumulent pas :

| Modele | Source | Paiement | Renouvellement |
|--------|--------|----------|----------------|
| **Guild allocation** | Admin definit le quota | Gratuit pour l'user | Automatique (mensuel) |
| **Stripe subscription** | User s'abonne | User paie chaque mois | Lie au paiement |

Un utilisateur est dans l'un OU l'autre modele selon la guild.

---

## 2. Motivation

### Probleme actuel

Les credits ne proviennent que de Stripe (paiement utilisateur). Cela pose probleme pour :
- Les guilds en periode d'essai
- Les partenariats B2B (entreprises qui paient pour leurs employes)
- Les evenements promotionnels
- Les guilds educatives (ecoles, formations)

### Solution

L'administrateur definit un quota mensuel par guild. Chaque membre
recoit ce quota individuellement. Les credits non utilises s'accumulent
mais expirent au bout d'1 an (gestion FIFO).

---

## 3. Architecture

### 3.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DEUX MODELES INDEPENDANTS                         │
├──────────────────────────────┬──────────────────────────────────────┤
│   Stripe (existant)          │   Guild Allocation (nouveau)         │
│   ─────────────────────      │   ────────────────────────────       │
│   • User paie chaque mois   │   • Admin definit le quota           │
│   • credits_remaining dans   │   • Chaque user recoit le quota     │
│     user_credits             │   • Stocke dans user_credit_batches │
│   • Pas d'expiration         │   • FIFO avec expiration 1 an       │
│   • Gere par webhooks Stripe │   • Renouvellement auto mensuel     │
└──────────────────────────────┴──────────────────────────────────────┘
                    │                              │
                    ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Backend API                                    │
│   credits-balance : retourne le solde selon le modele de la guild   │
│   credits-deduct  : deduit selon le modele (FIFO si guild alloc)    │
└─────────────────────────────────────────────────────────────────────┘
                    ▲
                    │ credits-balance / credits-deduct
┌───────────────────┴─────────────────────────────────────────────────┐
│                      Plugin Discord                                  │
│   Aucune modification requise                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Quel modele pour quelle guild ?

La guild a un champ `credit_model` :
- `stripe` (defaut) : les users paient via Stripe, modele actuel
- `guild_allocation` : l'admin alloue les credits, pas de Stripe

```
Guild "Torah Recipes"  → credit_model = stripe
Guild "Ecole Formation" → credit_model = guild_allocation (100 credits/mois/user)
```

---

## 4. Modele de donnees

### 4.1 Nouvelle table : `guild_credit_allocations`

Configuration du quota par guild (dans le tenant schema).

```sql
CREATE TABLE guild_credit_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identifiant
    guild_id VARCHAR(32) NOT NULL UNIQUE,

    -- Configuration
    credit_model VARCHAR(20) NOT NULL DEFAULT 'stripe',
        -- 'stripe' : modele paiement user (existant)
        -- 'guild_allocation' : quota admin
    monthly_quota_per_user INT CHECK (monthly_quota_per_user > 0),
        -- Credits attribues a chaque user chaque mois

    -- Renouvellement
    renewal_day INT DEFAULT 1 CHECK (renewal_day BETWEEN 1 AND 28),
        -- Jour du mois pour le renouvellement

    -- Pot commun (credits recuperes des membres partis)
    pool_balance INT NOT NULL DEFAULT 0,
        -- Redistribuable manuellement par l'admin

    -- Etat
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Audit
    created_by VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4.2 Nouvelle table : `user_credit_batches`

Lots de credits par user avec gestion FIFO et expiration.

```sql
CREATE TABLE user_credit_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identifiants
    guild_id VARCHAR(32) NOT NULL,
    discord_user_id VARCHAR(50) NOT NULL,

    -- Lot de credits
    source VARCHAR(20) NOT NULL DEFAULT 'guild_allocation',
        -- 'guild_allocation', 'admin_manual', 'bonus'
    credits_initial INT NOT NULL,
    credits_remaining INT NOT NULL,

    -- FIFO : date d'attribution et expiration
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
        -- guild_allocation : granted_at + 1 an
        -- admin_manual : configurable ou NULL (pas d'expiration)

    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT positive_credits CHECK (credits_remaining >= 0)
);

CREATE INDEX idx_credit_batches_user
    ON user_credit_batches(guild_id, discord_user_id);
CREATE INDEX idx_credit_batches_fifo
    ON user_credit_batches(granted_at ASC)
    WHERE credits_remaining > 0;
CREATE INDEX idx_credit_batches_expiry
    ON user_credit_batches(expires_at)
    WHERE credits_remaining > 0 AND expires_at IS NOT NULL;
```

### 4.3 Tables existantes (pas de modification)

- `user_credits` : inchange, continue de gerer les credits Stripe
- `user_credit_logs` : inchange, continue de logger les operations Stripe

---

## 5. Logique metier

### 5.1 Consulter le solde

```python
async def get_balance(guild_id, user_id):
    # Determiner le modele de la guild
    alloc = await get_guild_allocation(guild_id)

    if not alloc or alloc.credit_model == 'stripe':
        # Modele Stripe classique (existant)
        return await get_stripe_balance(guild_id, user_id)

    # Modele guild allocation — somme des lots non expires
    result = await db.fetchone("""
        SELECT COALESCE(SUM(credits_remaining), 0) as total
        FROM user_credit_batches
        WHERE guild_id = $1 AND discord_user_id = $2
          AND credits_remaining > 0
          AND (expires_at IS NULL OR expires_at > NOW())
    """, guild_id, user_id)

    return {
        "credits_remaining": result['total'],
        "credit_model": "guild_allocation",
        "monthly_quota": alloc.monthly_quota_per_user,
    }
```

### 5.2 Deduire des credits (FIFO)

Quand le modele est `guild_allocation`, on deduit en FIFO :
les lots les plus anciens sont consommes en premier.

```python
async def deduct_credits(guild_id, user_id, amount, reason):
    alloc = await get_guild_allocation(guild_id)

    if not alloc or alloc.credit_model == 'stripe':
        # Modele Stripe classique (existant, inchange)
        return await deduct_stripe_credits(guild_id, user_id, amount, reason)

    # Modele guild allocation — FIFO
    batches = await db.fetch("""
        SELECT id, credits_remaining, granted_at, expires_at
        FROM user_credit_batches
        WHERE guild_id = $1 AND discord_user_id = $2
          AND credits_remaining > 0
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY granted_at ASC
    """, guild_id, user_id)

    total_available = sum(b['credits_remaining'] for b in batches)
    if total_available < amount:
        return {"success": False, "error": "insufficient_credits",
                "credits_available": total_available}

    remaining = amount
    for batch in batches:
        if remaining <= 0:
            break
        take = min(remaining, batch['credits_remaining'])
        await db.execute("""
            UPDATE user_credit_batches
            SET credits_remaining = credits_remaining - $1
            WHERE id = $2
        """, take, batch['id'])
        remaining -= take

    # Logger dans user_credit_logs
    await create_log(guild_id, user_id, 'debit', amount, reason,
                     credits_before=total_available,
                     credits_after=total_available - amount)

    return {"success": True, "deducted": amount,
            "credits_remaining": total_available - amount}
```

### 5.3 Renouvellement mensuel (cron)

Chaque mois, un nouveau lot de credits est cree pour chaque membre
de la guild.

```python
async def renew_guild_allocations():
    """Execute le 1er de chaque mois (ou selon renewal_day)."""
    allocations = await db.fetch("""
        SELECT * FROM guild_credit_allocations
        WHERE is_active = true
          AND credit_model = 'guild_allocation'
    """)

    for alloc in allocations:
        # Recuperer les membres de la guild
        members = await get_guild_members(alloc.guild_id)

        for member in members:
            # Creer un nouveau lot de credits (expire dans 1 an)
            await db.execute("""
                INSERT INTO user_credit_batches
                (guild_id, discord_user_id, source,
                 credits_initial, credits_remaining, expires_at)
                VALUES ($1, $2, 'guild_allocation', $3, $3,
                        NOW() + INTERVAL '1 year')
            """, alloc.guild_id, member.user_id,
                 alloc.monthly_quota_per_user)

        logger.info(f"Renewed {len(members)} users for guild "
                    f"{alloc.guild_id} ({alloc.monthly_quota_per_user} credits)")
```

### 5.4 Expiration des vieux lots (cron)

```python
async def expire_old_credit_batches():
    """Execute toutes les heures."""
    expired = await db.fetch("""
        UPDATE user_credit_batches
        SET credits_remaining = 0
        WHERE expires_at < NOW()
          AND credits_remaining > 0
        RETURNING guild_id, discord_user_id, credits_remaining as lost
    """)

    for row in expired:
        logger.info(f"Expired {row['lost']} credits for user "
                    f"{row['discord_user_id']} in guild {row['guild_id']}")
        # Logger dans user_credit_logs
        await create_log(row['guild_id'], row['discord_user_id'],
                         'expire', row['lost'], 'credit_batch_expired')
```

---

## 6. API Endpoints

### 6.1 Webhooks n8n (pour plugins — inchanges)

#### `credits-balance` (enrichi)

**Response (modele guild_allocation):**
```json
{
  "success": true,
  "credits_remaining": 250,
  "credit_model": "guild_allocation",
  "monthly_quota": 100,
  "batches": [
    {"granted_at": "2026-03-01", "remaining": 50, "expires_at": "2027-03-01"},
    {"granted_at": "2026-04-01", "remaining": 100, "expires_at": "2027-04-01"},
    {"granted_at": "2026-04-09", "remaining": 100, "expires_at": "2027-04-09"}
  ]
}
```

**Response (modele stripe — inchange):**
```json
{
  "success": true,
  "credits_remaining": 335,
  "credit_model": "stripe",
  "subscription_status": "free",
  "plan_id": "free"
}
```

#### `credits-deduct` (logique modifiee)

Le webhook detecte automatiquement le modele de la guild et applique
la bonne logique (FIFO pour guild_allocation, classique pour stripe).

### 6.2 API REST Backend (pour admin dashboard)

#### `POST /api/ecommerce/admin/guilds/{guild_id}/credit-quota`

Definir le quota d'une guild.

```json
{
  "credit_model": "guild_allocation",
  "monthly_quota_per_user": 100,
  "renewal_day": 1
}
```

#### `GET /api/ecommerce/admin/guilds/{guild_id}/credit-quota`

Recuperer la configuration + stats d'utilisation.

```json
{
  "guild_id": "123456789",
  "credit_model": "guild_allocation",
  "monthly_quota_per_user": 100,
  "renewal_day": 1,
  "is_active": true,
  "stats": {
    "total_members": 25,
    "total_credits_granted_this_month": 2500,
    "total_credits_used_this_month": 1200,
    "utilization_rate": 0.48
  }
}
```

#### `DELETE /api/ecommerce/admin/guilds/{guild_id}/credit-quota`

Desactiver l'allocation (is_active = false).
Les credits deja attribues restent valides jusqu'a expiration.

#### `POST /api/ecommerce/admin/guilds/{guild_id}/credit-quota/renew`

Forcer un renouvellement manuel (hors cycle).

#### `POST /api/ecommerce/admin/guilds/{guild_id}/credit-quota/grant`

Attribution manuelle ponctuelle (bonus, compensation).

```json
{
  "discord_user_id": "636639897767378954",
  "amount": 50,
  "reason": "compensation support",
  "expires_in_days": 365
}
```

#### `POST /api/ecommerce/admin/guilds/{guild_id}/credit-quota/distribute-pool`

Redistribuer les credits du pot commun (credits recuperes des membres partis).

**Request:**
```json
{
  "discord_user_id": "636639897767378954",
  "amount": 50,
  "reason": "redistribution depart membre"
}
```

Ou pour redistribuer a tous les membres :
```json
{
  "discord_user_id": "all",
  "amount": "equal",
  "reason": "redistribution mensuelle"
}
```

**Response:**
```json
{
  "success": true,
  "distributed": 150,
  "pool_balance_before": 150,
  "pool_balance_after": 0,
  "recipients": 3
}
```

#### `GET /api/ecommerce/admin/guilds/{guild_id}/credit-quota/pool`

Voir le solde du pot commun et son historique.

```json
{
  "pool_balance": 250,
  "history": [
    {"date": "2026-04-05", "type": "return", "amount": 100, "user": "123456", "reason": "member_left"},
    {"date": "2026-04-08", "type": "return", "amount": 150, "user": "789012", "reason": "member_left"}
  ]
}
```

---

## 7. Notifications

### Seuils

| Seuil | Notification | Destinataire |
|-------|-------------|--------------|
| 20% du quota mensuel restant | Warning | Admin guild (channel Discord) |
| 0% (quota epuise) | Alerte | Admin guild + user concerne (DM) |
| Lot de credits expire | Info | User concerne (DM) |

### Implementation

```python
async def check_notification_thresholds(guild_id, user_id, credits_after):
    alloc = await get_guild_allocation(guild_id)
    if not alloc:
        return

    quota = alloc.monthly_quota_per_user
    pct = credits_after / quota if quota > 0 else 0

    if credits_after == 0:
        await publish_event('guild:credits:exhausted', {
            'guild_id': guild_id, 'user_id': user_id
        })
    elif pct <= 0.20:
        await publish_event('guild:credits:low', {
            'guild_id': guild_id, 'user_id': user_id,
            'remaining': credits_after, 'quota': quota
        })
```

Redis pub/sub → n8n ecoute → webhook Discord.

---

## 8. Detection du modele de credit

La detection se fait par la presence d'un record actif dans
`guild_credit_allocations` (table tenant schema) :

```python
async def _get_credit_model(self, guild_id):
    alloc = await self.db.execute(
        select(GuildCreditAllocation).where(
            GuildCreditAllocation.guild_id == guild_id,
            GuildCreditAllocation.is_active == True,
        )
    )
    alloc = alloc.scalars().first()
    return alloc  # None = Stripe (defaut), present = guild_allocation
```

- Record actif existe → mode `guild_allocation`
- Pas de record → mode `stripe` (comportement actuel inchange)
- L'admin cree le record via l'endpoint admin
- Tant qu'il ne le fait pas, tout fonctionne comme avant

---

## 9. Analyse d'impact detaillee

### 9.1 Fichiers backend a modifier

| Fichier | Action | Detail |
|---------|--------|--------|
| `app/models/ecommerce/guild_credit_allocation.py` | **Creer** | Modele SQLAlchemy, tenant schema (inclut `pool_balance`) |
| `app/models/ecommerce/user_credit_batch.py` | **Creer** | Modele SQLAlchemy, tenant schema |
| `app/models/ecommerce/__init__.py` | **Modifier** | Ajouter imports des 2 nouveaux modeles |
| `app/services/ecommerce/credit_service.py` | **Modifier** | `get_balance()`, `debit()`, `init_member()` detectent le modele |
| `app/services/ecommerce/guild_allocation_service.py` | **Creer** | CRUD quota, renouvellement, expiration, FIFO, gestion pot commun |
| `app/api_routes/ecommerce/guild_allocation_routes.py` | **Creer** | 7 endpoints admin (5 base + 2 pot commun) |
| `app/api_routes/ecommerce/__init__.py` | **Modifier** | include_router(guild_allocation_router) |
| `alembic/versions/xxx_guild_credit_batches.py` | **Creer** | Migration 2 tables (tenant schema) |
| `app/services/ecommerce/member_service.py` | **Modifier** | Ajouter `on_member_leave()` pour retour credits au pot |

| Fichier | Action |
|---------|--------|
| `app/models/ecommerce/user_credit.py` | **Pas de modification** |
| `app/models/ecommerce/user_credit_log.py` | **Pas de modification** |
| `app/api_routes/ecommerce/credit_routes.py` | **Pas de modification** (14 endpoints inchanges) |
| `app/services/ecommerce/credit_service.py` (methodes existantes) | Logique ajoutee, signatures inchangees |

### 9.2 Modifications dans CreditService

#### `get_balance()` — ajouter detection modele

```python
# AVANT (inchange pour Stripe)
async def get_balance(self, guild_id, discord_user_id):
    credit = await self._get_credit(guild_id, discord_user_id)
    return CreditResult(credits_remaining=credit.credits_remaining)

# APRES
async def get_balance(self, guild_id, discord_user_id):
    alloc = await self._get_credit_model(guild_id)

    if alloc:
        # Mode guild_allocation — somme FIFO des lots non expires
        total = await self._get_batch_balance(guild_id, discord_user_id)
        return CreditResult(
            success=True,
            credits_remaining=total,
            credit_model="guild_allocation",
        )

    # Mode Stripe (inchange)
    credit = await self._get_credit(guild_id, discord_user_id)
    return CreditResult(
        success=True,
        credits_remaining=credit.credits_remaining,
        credit_model="stripe",
    )
```

#### `debit()` — ajouter logique FIFO

```python
# AVANT (inchange pour Stripe)
async def debit(self, guild_id, discord_user_id, amount, reason):
    credit = await self._get_credit(guild_id, discord_user_id)
    credit.credits_remaining -= amount

# APRES
async def debit(self, guild_id, discord_user_id, amount, reason):
    alloc = await self._get_credit_model(guild_id)

    if alloc:
        # Mode guild_allocation — deduction FIFO
        return await self._debit_fifo(guild_id, discord_user_id, amount, reason)

    # Mode Stripe (code existant inchange)
    credit = await self._get_credit(guild_id, discord_user_id)
    credit.credits_remaining -= amount
    ...
```

#### `init_member()` — creer un lot au lieu d'un record

```python
# APRES
async def init_member(self, guild_id, discord_user_id, ...):
    alloc = await self._get_credit_model(guild_id)

    if alloc:
        # Mode guild_allocation — creer un premier lot
        batch = UserCreditBatch(
            guild_id=guild_id,
            discord_user_id=discord_user_id,
            source="guild_allocation",
            credits_initial=alloc.monthly_quota_per_user,
            credits_remaining=alloc.monthly_quota_per_user,
            expires_at=now() + timedelta(days=365),
        )
        self.db.add(batch)
        await self.db.commit()
        return CreditResult(success=True, credits_remaining=alloc.monthly_quota_per_user)

    # Mode Stripe (code existant inchange)
    ...
```

### 9.3 Impact n8n (workflows)

| Workflow existant | Impact | Detail |
|-------------------|--------|--------|
| `credits-balance` (plugin-recipes) | **Aucun** | Appelle `GET /webhook/account` → CreditService.get_balance() detecte le modele en interne |
| `credits-deduct` (plugin-recipes) | **Aucun** | Appelle `POST /webhook/credits/debit` → CreditService.debit() detecte le modele en interne |
| `credits-init` (member-join) | **Aucun** | Appelle `POST /webhook/credits/init` → CreditService.init_member() detecte le modele |
| `checkout-completed` (Stripe) | **Aucun** | Ne concerne que les guilds en mode Stripe |

| Nouveau workflow | Trigger | Action |
|------------------|---------|--------|
| `guild-credits-renew` | Cron `0 0 * * *` (minuit chaque jour) | Appelle `POST /admin/guilds/renew-all` pour les guilds dont c'est le jour de renouvellement |
| `guild-credits-expire` | Cron `0 * * * *` (toutes les heures) | Appelle `POST /admin/guilds/expire-batches` pour supprimer les lots expires |
| `guild-credits-low` | Redis event `guild:credits:low` | Envoie webhook Discord au channel admin |
| `guild-credits-exhausted` | Redis event `guild:credits:exhausted` | Envoie DM Discord a l'utilisateur |
| `guild-member-leave` | Discord event `guildMemberRemove` | Appelle le backend pour retourner les credits au pot commun |

### 9.4 Impact front-end (admin dashboard)

#### Ecrans existants a modifier

| Ecran | Modification |
|-------|-------------|
| **Page guild settings** | Ajouter section "Modele de credits" : radio `Stripe` / `Allocation admin` |
| **Liste users d'une guild** | Ajouter colonne "Source credits" (Stripe ou Guild) + afficher solde lots si guild_allocation |
| **Page detail user** | Si guild_allocation : afficher les lots avec `granted_at`, `credits_remaining`, `expires_at` |

#### Nouveaux ecrans

| Ecran | Description |
|-------|-------------|
| **Config allocation guild** | Formulaire : quota/mois/user, jour renouvellement, actif/inactif |
| **Stats utilisation guild** | Taux utilisation, nb users, credits distribues vs consommes, lots expirant bientot |
| **Historique renouvellements** | Liste des renouvellements passes avec nb users et credits distribues |

#### Endpoints a appeler depuis le front

| Action front | Endpoint backend |
|-------------|-----------------|
| Lire config quota | `GET /api/ecommerce/admin/guilds/{guild_id}/credit-quota` |
| Definir quota | `POST /api/ecommerce/admin/guilds/{guild_id}/credit-quota` |
| Desactiver | `DELETE /api/ecommerce/admin/guilds/{guild_id}/credit-quota` |
| Forcer renouvellement | `POST /api/ecommerce/admin/guilds/{guild_id}/credit-quota/renew` |
| Attribution manuelle | `POST /api/ecommerce/admin/guilds/{guild_id}/credit-quota/grant` |
| Voir lots d'un user | `GET /api/ecommerce/admin/guilds/{guild_id}/users/{user_id}/batches` |

### 9.5 Impact plugins Discord

**Zero modification.** Les plugins appellent les memes webhooks n8n
(`credits-balance`, `credits-deduct`). Le backend gere la logique
en interne. Le plugin ne sait pas et n'a pas besoin de savoir
si la guild est en mode Stripe ou allocation.

---

## 10. Securite

- Seuls les admins tenant peuvent definir des quotas (verification role RBAC)
- Rate limiting sur les endpoints admin
- Audit log de toutes les modifications de quota (dans `user_credit_logs`)
- Validation des montants (positifs, max 10000/mois)
- Le cron de renouvellement est interne (pas d'endpoint public)
- Les tables sont dans les tenant schemas (isolation multi-tenant)

---

## 11. Exemples concrets

### Exemple 1 : Guild educative

```
Admin configure : 100 credits/mois/user, renouvellement le 1er

Janvier : User A recoit 100 credits (expire jan 2027)
Fevrier : User A recoit 100 credits (expire fev 2027)
          User A a utilise 60 en janvier → reste 40 + 100 = 140

Mars : User A recoit 100 credits (expire mars 2027)
       Solde : 40 (jan) + 100 (fev) + 100 (mars) = 240

User A consomme 150 :
  FIFO → 40 de jan (epuise) + 100 de fev (epuise) + 10 de mars
  Reste : 90 credits (lot mars)

Janvier 2027 : lot janvier expire → rien (deja epuise)
Fevrier 2027 : lot fevrier expire → rien (deja epuise)
Mars 2027    : lot mars expire → 90 credits perdus si non utilises
```

### Exemple 2 : Guild Stripe classique

```
Rien ne change. User paie via Stripe.
credits_remaining dans user_credits comme avant.
Pas de lots, pas de FIFO, pas d'expiration.
Pas de record dans guild_credit_allocations.
```

### Exemple 3 : Nouveau membre rejoint une guild allocation

```
Guild "Ecole" : 100 credits/mois, renouvellement le 15

User D rejoint le 20 avril :
  → init_member detecte mode guild_allocation
  → Cree un lot de 100 credits (expire 20 avril 2027)
  → Le prochain renouvellement (15 mai) lui donnera 100 de plus

User D a : 100 credits
Le 15 mai : User D recoit 100 credits supplementaires
User D a : 100 (avril, expire avril 2027) + 100 (mai, expire mai 2027) = 200
```

### Exemple 4 : Membre quitte la guild (retour au pot commun)

```
Guild "Entreprise" : 50 credits/mois
User E a : 30 credits (lot mars) + 50 credits (lot avril) = 80 credits

User E quitte la guild le 10 avril :
  → on_member_leave() detecte mode guild_allocation
  → Ses 80 credits sont marques comme consommes (credits_remaining = 0)
  → pool_balance de la guild augmente de 80
  → Log : "return_to_pool", 80 credits, "member_left_guild"

L'admin peut ensuite :
  a) Redistribuer a un user specifique : POST /distribute-pool {user: "123", amount: 80}
  b) Redistribuer equitablement : POST /distribute-pool {user: "all", amount: "equal"}
  c) Laisser dans le pot pour plus tard
```

---

## 12. Questions resolues

| Question | Decision |
|----------|----------|
| Rollover ? | Oui, les credits s'accumulent. Expiration FIFO a 1 an. |
| Notification ? | Oui, a 20% et 0%. Via Redis → n8n → Discord. |
| Priorite deduction ? | FIFO — lots les plus anciens d'abord. |
| Cumul Stripe + Guild ? | Non. Une guild est en mode Stripe OU Guild allocation. |
| Detection du modele ? | Presence d'un record actif dans guild_credit_allocations. |
| Schema des tables ? | Tenant schemas (comme user_credits). |
| Membre qui quitte ? | Les credits non utilises retournent au pot commun (voir section 12.1). |

### 12.1 Gestion du depart d'un membre

Quand un membre quitte une guild en mode `guild_allocation`, ses credits
non utilises doivent retourner au pot commun de la guild.

#### Implementation

```python
async def on_member_leave(guild_id, discord_user_id):
    """Appelee quand un membre quitte la guild."""
    alloc = await get_guild_allocation(guild_id)

    if not alloc or alloc.credit_model != 'guild_allocation':
        return  # Mode Stripe : rien a faire

    # Recuperer les credits restants
    remaining = await db.fetchone("""
        SELECT COALESCE(SUM(credits_remaining), 0) as total
        FROM user_credit_batches
        WHERE guild_id = $1 AND discord_user_id = $2
          AND credits_remaining > 0
          AND (expires_at IS NULL OR expires_at > NOW())
    """, guild_id, discord_user_id)

    if remaining['total'] > 0:
        # Marquer les lots comme recuperes
        await db.execute("""
            UPDATE user_credit_batches
            SET credits_remaining = 0
            WHERE guild_id = $1 AND discord_user_id = $2
              AND credits_remaining > 0
        """, guild_id, discord_user_id)

        # Crediter le pot commun de la guild
        await db.execute("""
            UPDATE guild_credit_allocations
            SET pool_balance = pool_balance + $1
            WHERE guild_id = $2
        """, remaining['total'], guild_id)

        # Logger
        await create_log(guild_id, discord_user_id, 'return_to_pool',
                         remaining['total'], 'member_left_guild')
```

#### Nouveau champ dans `guild_credit_allocations`

```sql
ALTER TABLE guild_credit_allocations
ADD COLUMN pool_balance INT NOT NULL DEFAULT 0;
-- Credits recuperes des membres partis, redistribuables manuellement
```

#### Utilisation du pot commun

L'admin peut redistribuer le pot commun via l'endpoint :

```
POST /api/ecommerce/admin/guilds/{guild_id}/credit-quota/distribute-pool
{
  "discord_user_id": "123456789",  // ou "all" pour tous les membres
  "amount": 50,                     // ou "equal" pour repartir equitablement
  "reason": "redistribution depart membre"
}
```

---

## 12.2 Questions differees (v2)

Ces cas ne seront pas geres dans la v1 :

| Question | Decision v1 | Note pour v2 |
|----------|-------------|--------------|
| Migration Stripe → Guild allocation | Non geree | Les credits Stripe restent dans `user_credits`, les nouveaux lots sont crees separement. L'admin doit choisir manuellement. |
| Migration Guild allocation → Stripe | Non geree | Les lots existants restent valides jusqu'a expiration. Le mode Stripe s'active pour les nouveaux achats. |
| Prorata nouveau membre | Quota complet | En v2 : calculer le prorata selon le jour du mois (ex: rejoint le 20, recoit 33% du quota). |

---

## 13. Estimation

| Tache | Effort |
|-------|--------|
| Migration (2 tables tenant schema) | 0.5 jour |
| Modeles SQLAlchemy (2 fichiers) | 0.5 jour |
| Modifier CreditService (get_balance, debit, init_member) | 1 jour |
| GuildAllocationService (CRUD, FIFO, renouvellement, expiration) | 1.5 jours |
| Gestion pot commun (retour credits, redistribution) | 0.5 jour |
| Endpoints admin (7 routes) | 0.5 jour |
| Crons n8n (renouvellement + expiration) | 0.5 jour |
| Workflow member-leave (retour credits) | 0.25 jour |
| Notifications Redis → n8n → Discord | 0.5 jour |
| Tests | 1.25 jours |
| **Total backend** | **7 jours** |
| Front-end : ecrans admin + modification users + gestion pot | 3.5 jours |
| **Total projet** | **10.5 jours** |

---

## 14. Frontend — Plan d'implementation detaille

> **Auteur** : Equipe Frontend
> **Date** : 2026-04-09
> **Estimation** : 3 jours

### 14.1 Integration dans l'existant

Le systeme de credits guild s'integre dans le dashboard guild :

```
GuildDashboardView (existant)
├── Branding
├── Prompts
├── Rooms
├── Plugin Config
├── Formations (RFC-048)
├── Sources RAG (RFC-053)
├── NotebookLM
└── Credits (NOUVEAU)  ← RFC-059
        │
        ▼
    GuildCreditsView (nouvelle page)
    ├── Config allocation (formulaire)
    ├── Stats utilisation (4 cards metriques)
    ├── Liste des membres + solde
    └── Attribution manuelle (dialog)
```

### 14.2 Composants a creer

| Composant | Type | Description |
|-----------|------|-------------|
| `guildCreditsApi.ts` | Service HTTP | 6 endpoints (config, renew, grant, batches) |
| `GuildCreditsView.vue` | Page | Config allocation + stats + membres + attribution |
| `CreditQuotaForm.vue` | Composant | Radio Stripe/Allocation, quota/mois, jour renouvellement |
| `CreditBatchesTable.vue` | Composant | Lots FIFO d'un user (granted_at, remaining, expires_at) |
| `ManualGrantDialog.vue` | Dialog | Attribution manuelle (user, montant, raison, expiration) |

### 14.3 Composants existants a modifier

| Composant | Modification |
|-----------|-------------|
| `GuildDashboardView.vue` | Ajouter card "Credits" (mdi-credit-card, amber) |
| `CreditsBatteryMock.vue` (mcp-chat) | Adapter pour afficher le mode guild_allocation : quota mensuel, lots, expiration |

### 14.4 Routes

```
Nouveau :
  /dashboard/guild/:guildId/credits → GuildCreditsView
```

### 14.5 Service API (`guildCreditsApi.ts`)

```typescript
// Types
interface GuildCreditConfig {
  guild_id: string
  credit_model: 'stripe' | 'guild_allocation'
  monthly_quota_per_user: number
  renewal_day: number
  is_active: boolean
  stats?: {
    total_members: number
    total_credits_granted_this_month: number
    total_credits_used_this_month: number
    utilization_rate: number
  }
}

interface CreditBatch {
  id: string
  guild_id: string
  discord_user_id: string
  source: 'guild_allocation' | 'admin_manual' | 'bonus'
  credits_initial: number
  credits_remaining: number
  granted_at: string
  expires_at: string | null
}

// Endpoints
GET  /api/ecommerce/admin/guilds/{gid}/credit-quota     → getConfig(guildId)
POST /api/ecommerce/admin/guilds/{gid}/credit-quota     → setConfig(guildId, config)
DELETE /api/ecommerce/admin/guilds/{gid}/credit-quota   → deactivate(guildId)
POST .../credit-quota/renew                              → forceRenew(guildId)
POST .../credit-quota/grant                              → manualGrant(guildId, userId, amount, reason)
GET  .../users/{uid}/batches                             → getUserBatches(guildId, userId)
```

### 14.6 Ecrans detailles

#### Config allocation

```
┌─ Configuration des credits ──────────────────────────┐
│                                                        │
│  Modele de credits :                                   │
│  (●) Stripe (paiement utilisateur)                    │
│  ( ) Allocation admin (quota mensuel)                  │
│                                                        │
│  ── Si Allocation admin ──────────────────────────    │
│                                                        │
│  Quota mensuel par utilisateur : [100    ] credits     │
│  Jour de renouvellement :       [1      ] du mois     │
│                                                        │
│  [Enregistrer]  [Desactiver l'allocation]              │
│                                                        │
│  Info : Les credits non utilises s'accumulent et       │
│  expirent au bout d'1 an (consommation FIFO).          │
└────────────────────────────────────────────────────────┘
```

#### Stats utilisation

```
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ 25         │ │ 2 500      │ │ 1 200      │ │ 48%        │
│ Membres    │ │ Distribues │ │ Consommes  │ │ Taux       │
│            │ │ ce mois    │ │ ce mois    │ │ utilisation│
└────────────┘ └────────────┘ └────────────┘ └────────────┘
```

#### Liste membres avec solde

```
┌───────────────────┬────────────┬────────────┬──────────┐
│ Membre            │ Source     │ Solde      │ Actions  │
├───────────────────┼────────────┼────────────┼──────────┤
│ @Dupont           │ Allocation │ 140 credits│ [Voir]   │
│ dupont#1234       │ 3 lots     │            │ [+]      │
├───────────────────┼────────────┼────────────┼──────────┤
│ @Martin           │ Allocation │ 0 credits  │ [Voir]   │
│ martin#5678       │ epuise     │            │ [+]      │
└───────────────────┴────────────┴────────────┴──────────┘
```

Clic [Voir] → lots FIFO :

```
┌─ Lots de credits — @Dupont ──────────────────────────┐
│                                                        │
│  ┌──────────┬──────────┬──────────┬─────────────────┐ │
│  │ Date     │ Initial  │ Restant  │ Expire          │ │
│  ├──────────┼──────────┼──────────┼─────────────────┤ │
│  │ 01/01/26 │ 100      │ 40       │ 01/01/27 (9m)  │ │
│  │ 01/02/26 │ 100      │ 100      │ 01/02/27       │ │
│  │ 09/04/26 │ 50       │ 50       │ 09/04/27       │ │
│  │          │          │          │ (bonus manuel)  │ │
│  └──────────┴──────────┴──────────┴─────────────────┘ │
│                                                        │
│  Total : 190 credits (3 lots actifs)                   │
└────────────────────────────────────────────────────────┘
```

Clic [+] → dialog attribution manuelle :

```
┌─ Attribution manuelle ─────────────────────────── X ┐
│                                                       │
│  Membre : @Dupont                                     │
│  Montant : [50        ] credits                       │
│  Raison :  [compensation support        ]             │
│  Expiration : [365    ] jours                         │
│                                                       │
│                          [Annuler] [Attribuer]        │
└───────────────────────────────────────────────────────┘
```

### 14.7 Adaptation CreditsBatteryMock

Le composant batterie dans mcp-chat recoit deja `credits-remaining`
et `credits-total`. Pour le mode guild_allocation, il faut afficher :

- Le mode (Stripe vs Allocation) comme badge
- Le quota mensuel (ex: "100/mois")
- Le nombre de lots actifs
- La date d'expiration du plus ancien lot

```
Mode Stripe :           Mode Allocation :
┌──────────────┐        ┌──────────────────────────┐
│ 335          │        │ 190  (quota: 100/mois)   │
│ credits      │        │ 3 lots actifs             │
│ Plan: Free   │        │ Expire: jan 2027          │
└──────────────┘        └──────────────────────────┘
```

L'endpoint `credits-balance` retourne deja `credit_model` dans la
reponse — le composant conditionne l'affichage.

### 14.8 Sequence d'implementation

| Jour | Taches |
|------|--------|
| **Jour 1** | `guildCreditsApi.ts` + card dans GuildDashboard + route + `GuildCreditsView.vue` avec config form |
| **Jour 2** | Stats utilisation (4 cards) + liste membres avec solde + `CreditBatchesTable.vue` (lots FIFO) |
| **Jour 3** | `ManualGrantDialog.vue` + adaptation `CreditsBatteryMock.vue` + tests |

### 14.9 Dependances

- **Backend** : les 6 endpoints admin doivent etre deployes
- **Aucune dependance** sur les autres features en cours (RAG, NotebookLM, Promotions)
- Le composant `CreditsBatteryMock` est dans mcp-chat — modification isolee

---

## 15. References

- Credits existants : `app/services/ecommerce/credit_service.py`
- Tables existantes : `user_credits`, `user_credit_logs` (tenant schemas)
- Endpoints existants : `/api/ecommerce/subscription/*`, `/api/ecommerce/webhook/*`
- Modeles : `app/models/ecommerce/user_credit.py`, `user_credit_log.py`
- Routes : `app/api_routes/ecommerce/credit_routes.py` (14 endpoints, inchanges)
