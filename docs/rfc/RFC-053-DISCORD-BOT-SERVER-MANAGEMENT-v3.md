# RFC-053: Gestion Serveur Discord via Bot — Commandes Admin + RAG


**Date:** 2026-03-30
**Status:** Draft v3
**Auteur:** API Backend Team
**Équipes concernées:** Bot Discord, API Backend, MCP/n8n
**Changelog v3:**
- `bot_id` : slug lisible remplacé par le Discord application ID numérique (stable, unique)
- FK `tenant_discord_server_bots.guild_id` : référence via contrainte UNIQUE sur `guild_id`
- `tenant_id` : harmonisé en `VARCHAR(64)` (cohérent avec le reste du schéma)
- Sécurité endpoint : vérification réécrite — token global, contrôle via `tenant_id` extrait du token

**Changelog v2:**
- Grain RAG corrigé : `(guild_id, bot_id)` au lieu de `guild_id` seul
- Nouvelle table `tenant_discord_server_bots`
- Filtre Qdrant étendu à `bot_id`
- Sécurité endpoint : vérification token/guild_id
- Commande `/config` refactorisée en subcommand groups natifs
- Ajout `sync_source` pour distinguer sync manuelle vs automatique
- Ajout `on_guild_remove` dans les événements auto-sync
- Ajout rate limiting sur `/config sync`
- Précision sur le backfill des colonnes NULL existantes

---

## Résumé

Permettre aux bots Azy installés sur un serveur Discord d'envoyer
les informations de ce serveur à l'API backend (nom, icône, membres,
bots installés), et de configurer l'accès RAG (recherche sémantique)
**par couple (serveur × bot)**.

---

## Problème actuel

### 1. Infos serveur manquantes

La table `tenant_discord_servers` a les colonnes `guild_name` et
`member_count` mais elles sont **toujours NULL**. L'API backend n'a
pas de bot token Discord et ne peut pas appeler l'API Discord
directement. Seul le bot Azy, installé sur le serveur, a accès à
ces informations.

### 2. Pas de commande admin

Il n'existe aucun moyen pour un administrateur de serveur Discord
de déclencher une synchronisation des infos ou de configurer le bot
via Discord. Tout passe par l'interface web.

### 3. RAG non scopé par (serveur × bot)

Le RAG (Qdrant) est configuré globalement. Un serveur peut héberger
**plusieurs bots spécialisés** (Bot Appétit, Bot Échecs, Bot
Pédagogique…) : le scope RAG doit être le couple `(guild_id, bot_id)`,
pas le serveur seul. Sans ce second niveau, le Bot Appétit pourrait
remonter des documents du Bot Échecs installé sur le même serveur.

---

## Proposition 1 : Commande Slash `/config`

### Concept

Une commande slash Discord `/config` accessible **uniquement aux
administrateurs** du serveur (`ADMINISTRATOR` permission),
implémentée en **subcommand groups natifs** discord.py pour bénéficier
de l'autocomplétion Discord et d'une description par sous-commande.

### Sous-commandes

```
/config sync        → Synchronise les infos serveur vers l'API backend
/config status      → Affiche le statut actuel (tenant lié, RAG activé, etc.)
/config rag enable  → Active le RAG pour ce bot sur ce serveur
/config rag disable → Désactive le RAG pour ce bot sur ce serveur
/config rag stats   → Affiche les stats RAG (nb documents, collections)
/config bots        → Liste les bots Azy installés sur le serveur
```

> **Note :** `/config rag enable/disable` s'applique au **bot qui
> exécute la commande** sur ce serveur, pas au serveur entier.
> Chaque bot gère son propre RAG indépendamment.

### Implémentation en subcommand groups

```python
# Côté bot (discord.py) — subcommand groups natifs
config_group = app_commands.Group(
    name="config",
    description="Configuration du bot Azy"
)

@config_group.command(name="sync", description="Synchronise les infos serveur")
@app_commands.checks.has_permissions(administrator=True)
@commands.cooldown(rate=1, per=300, type=commands.BucketType.guild)
async def config_sync(interaction: discord.Interaction):
    ...

rag_group = app_commands.Group(
    name="rag",
    description="Configuration RAG",
    parent=config_group
)

@rag_group.command(name="enable", description="Active le RAG pour ce bot")
@app_commands.checks.has_permissions(administrator=True)
async def rag_enable(interaction: discord.Interaction):
    ...
```

Seuls les membres avec la permission `ADMINISTRATOR` peuvent
exécuter ces commandes. Les autres reçoivent un message d'erreur.

Un **cooldown de 300 secondes par guild** est appliqué sur
`/config sync` pour éviter le spam vers l'API backend.

### Flux `/config sync`

```
Administrateur Discord
    │
    ├── /config sync
    │
    ▼
Bot Azy (discord.py)
    │
    ├── guild = bot.get_guild(guild_id)
    ├── Collecte: name, icon, member_count, bots, channels, roles
    │
    ▼
API Backend
    │
    POST /api/discord/webhook/server-sync
    X-Service-Token: {service_token}
    Body: {
      "guild_id": "1286607696153546774",
      "bot_id": "987654321",
      "guild_name": "Mon Serveur Cuisine",
      "guild_icon": "a1b2c3d4e5f6",
      "guild_description": "Serveur de partage de recettes",
      "member_count": 150,
      "bot_count": 3,
      "channel_count": 12,
      "bots": [
        {"id": "123456789", "name": "MEE6", "avatar": "..."},
        {"id": "987654321", "name": "Azy", "avatar": "..."},
        {"id": "555666777", "name": "Midjourney", "avatar": "..."}
      ],
      "channels": [
        {"id": "111", "name": "general", "type": "text"},
        {"id": "222", "name": "recettes", "type": "text"},
        {"id": "333", "name": "Vocal", "type": "voice"}
      ],
      "roles": [
        {"id": "444", "name": "Admin", "color": "#FF0000"},
        {"id": "555", "name": "Chef", "color": "#00FF00"}
      ],
      "synced_by": "636639897767378954",
      "sync_source": "manual"
    }
    │
    ▼
API Backend
    ① Vérifie que le guild_id appartient au tenant_id associé au token
    ② Stocke dans tenant_discord_servers (guild_name, member_count, etc.)
    ③ Upsert dans tenant_discord_server_bots (guild_id, bot_id)
    │
    ▼
Bot répond à l'administrateur
    "✅ Serveur synchronisé : Mon Serveur Cuisine
     - 150 membres, 3 bots, 12 channels
     - Tenant: Z6F3GSWB | Bot: 987654321"
```

---

## Proposition 2 : RAG par couple (serveur × bot)

### Problème avec le filtre `guild_id` seul

Un même serveur Discord peut héberger plusieurs bots spécialisés.
Le filtre `guild_id` seul ne suffit pas à isoler leurs espaces RAG :

```
Serveur "Mon Lycée" (guild_id: 1286...)
├── Bot Appétit   → recettes, techniques culinaires
├── Bot Échecs    → ouvertures, parties, règles
└── Bot Péda      → cours d'optique, exercices BTS
```

Sans `bot_id` dans le filtre, Bot Appétit peut remonter des
résultats du Bot Échecs. Le grain de scoping RAG est donc
**le couple `(guild_id, bot_id)`**.

### Architecture Qdrant — collection unique + filtre composé

On conserve **une collection unique par type d'entité** avec un
payload enrichi :

```
recipe_Z6F3GSWB
├── point #1  { guild_id: "1286...", bot_id: "987654321",  text: "Fraisier Vegan" }
├── point #2  { guild_id: "1286...", bot_id: "987654321",  text: "Pot-au-feu" }
├── point #3  { guild_id: "1286...", bot_id: "111222333",  text: "Défense sicilienne" }
└── point #4  { guild_id: "1286...", bot_id: "444555666",  text: "Cours optique ch.1" }

document_Z6F3GSWB
├── point #5  { guild_id: "1286...", bot_id: "987654321",  text: "Guide brigade" }
└── point #6  { guild_id: "1286...", bot_id: "444555666",  text: "TP réfraction" }
```

Convention de nommage des collections : `{entity_type}_{tenant_id}`
(inchangée — le `bot_id` est dans le payload, pas dans le nom).

### Filtre Qdrant

```json
{
  "vector": [0.12, 0.87, "..."],
  "filter": {
    "must": [
      {"key": "tenant_id", "match": {"value": "Z6F3GSWB"}},
      {"key": "guild_id",  "match": {"value": "1286607696153546774"}},
      {"key": "bot_id",    "match": {"value": "987654321"}}
    ]
  }
}
```

**Recommandation** : garder la collection unique avec filtre composé.
Collections séparées seulement si les volumes le justifient
(> 100K documents par couple guild × bot).

### Configuration RAG par (serveur × bot)

La `rag_config` ne peut plus vivre dans `tenant_discord_servers`
(grain serveur). Elle est portée par la nouvelle table
`tenant_discord_server_bots` :

```sql
CREATE TABLE tenant_discord_server_bots (
  id          SERIAL        PRIMARY KEY,
  guild_id    VARCHAR(20)   NOT NULL,
  bot_id      VARCHAR(20)   NOT NULL,   -- Discord application ID numérique (stable, unique)
  tenant_id   VARCHAR(64)   NOT NULL,   -- harmonisé avec le reste du schéma
  rag_config  JSONB         NOT NULL DEFAULT '{}',
  active      BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (guild_id, bot_id),
  -- FK via la contrainte UNIQUE sur guild_id (PK de tenant_discord_servers est un UUID)
  FOREIGN KEY (guild_id) REFERENCES tenant_discord_servers(guild_id)
);

-- rag_config contenu :
-- {
--   "enabled": true,
--   "entity_types": ["recipe", "document"],
--   "max_documents": 10000,
--   "embedding_model": "text-embedding-3-small"
-- }
```

### Flux `/config rag enable`

```
Admin: /config rag enable
    │
    ▼
Bot (bot_id: "987654321") → API Backend
    POST /api/discord/webhook/server-config
    Body: {
      "guild_id": "1286607696153546774",
      "bot_id": "987654321",
      "config_key": "rag_enabled",
      "config_value": true,
      "configured_by": "636639897767378954"
    }
    │
    ▼
API upsert rag_config dans tenant_discord_server_bots
    WHERE guild_id = '1286...' AND bot_id = '987654321'
    │
    ▼
Bot répond:
    "✅ RAG activé pour Bot Appétit (987654321) sur ce serveur.
     Les recettes et documents seront indexés
     et recherchables via ce bot."
```

### Accès RAG pour les bots tiers

Si un bot tiers (pas Azy) veut accéder au RAG d'un serveur :

1. L'admin du serveur autorise un bot via `/config rag grant @BotName`
2. L'API crée une entrée dans `tenant_discord_server_bots` avec
   `active: true` et un token d'accès limité à ce couple (guild, bot)
3. Le bot tiers utilise ce token pour appeler l'endpoint de recherche

**Hors scope pour le MVP** — à implémenter quand le besoin se
présente. Documenter le modèle de token dès maintenant pour éviter
un refactoring ultérieur.

---

## Proposition 3 : Endpoint server-sync côté API

### Sécurité

Le `X-Service-Token` est un token **global** (scope `*`) : il n'est
pas lié à un `guild_id` spécifique. La vérification ne peut donc pas
être "ce token appartient à ce guild", mais **"le `guild_id` du payload
appartient bien au `tenant_id` associé à ce token"**.

```python
# Vérification côté API (FastAPI)
async def verify_guild_belongs_to_tenant(token: str, guild_id: str):
    # 1. Extraire le tenant_id associé au token (table api_tokens ou équivalent)
    tenant_id = await get_tenant_id_for_token(token)
    if not tenant_id:
        raise HTTPException(401, "Token invalide")

    # 2. Vérifier que ce guild_id existe dans tenant_discord_servers
    #    avec le bon tenant_id
    guild = await db.fetch_one(
        "SELECT id FROM tenant_discord_servers "
        "WHERE guild_id = :guild_id AND tenant_id = :tenant_id",
        {"guild_id": guild_id, "tenant_id": tenant_id}
    )
    if not guild:
        raise HTTPException(403, "guild_id inconnu ou n'appartient pas à ce tenant")
```

Sans cette vérification, un token valide d'un tenant A pourrait
écraser les données d'un serveur appartenant au tenant B.

### Nouveau endpoint server-sync

```
POST /api/discord/webhook/server-sync
X-Service-Token: {service_token}
Content-Type: application/json
```

**Request body :**

```json
{
  "guild_id": "1286607696153546774",
  "bot_id": "987654321",
  "guild_name": "Mon Serveur",
  "guild_icon": "hash_icone",
  "guild_description": "Description du serveur",
  "member_count": 150,
  "bot_count": 3,
  "channel_count": 12,
  "bots": [
    {"id": "123", "name": "MEE6", "avatar": "hash"}
  ],
  "channels": [
    {"id": "456", "name": "general", "type": "text"}
  ],
  "roles": [
    {"id": "789", "name": "Admin", "color": "#FF0000", "position": 1}
  ],
  "synced_by": "636639897767378954",
  "sync_source": "manual"
}
```

> `sync_source` : `"manual"` | `"event"` | `"cron"`.
> Pour les syncs automatiques (`on_guild_join`, cron), `synced_by`
> est `null` et `sync_source` indique l'origine.

**Response 200 :**

```json
{
  "success": true,
  "data": {
    "guild_id": "1286607696153546774",
    "bot_id": "987654321",
    "tenant_id": "Z6F3GSWB",
    "synced_at": "2026-03-30T16:00:00Z",
    "sync_source": "manual",
    "changes": {
      "guild_name": "Mon Serveur",
      "member_count": 150,
      "bots_found": 3,
      "channels_found": 12
    }
  }
}
```

### Modifications DB

```sql
-- Extension de tenant_discord_servers (infos serveur brutes)
ALTER TABLE tenant_discord_servers
ADD COLUMN guild_icon        VARCHAR(255),
ADD COLUMN guild_description TEXT,
ADD COLUMN bot_count         INTEGER     DEFAULT 0,
ADD COLUMN channel_count     INTEGER     DEFAULT 0,
ADD COLUMN server_metadata   JSONB       DEFAULT '{}',
ADD COLUMN last_synced_at    TIMESTAMPTZ,
ADD COLUMN synced_by         VARCHAR(20),
ADD COLUMN sync_source       VARCHAR(10) DEFAULT 'manual';
-- server_metadata stocke bots, channels, roles en détail (JSONB)
-- rag_config est déplacée dans tenant_discord_server_bots

-- Nouvelle table : configuration par couple (guild × bot)
CREATE TABLE tenant_discord_server_bots (
  id          SERIAL        PRIMARY KEY,
  guild_id    VARCHAR(20)   NOT NULL,
  bot_id      VARCHAR(20)   NOT NULL,   -- Discord application ID numérique
  tenant_id   VARCHAR(64)   NOT NULL,   -- harmonisé avec le reste du schéma
  rag_config  JSONB         NOT NULL DEFAULT '{}',
  active      BOOLEAN       NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (guild_id, bot_id),
  -- guild_id a une contrainte UNIQUE dans tenant_discord_servers
  -- (la PK de cette table est un UUID, pas guild_id)
  FOREIGN KEY (guild_id) REFERENCES tenant_discord_servers(guild_id)
);

-- Backfill : s'assurer que guild_name et member_count ne restent
-- pas NULL après déploiement. Déclencher le job de sync au
-- démarrage pour tous les serveurs existants, ou maintenir la
-- nullabilité explicitement côté applicatif.
```

---

## Sync automatique

En plus de la commande `/config sync`, le bot synchronise
automatiquement :

| Événement Discord | Action | `sync_source` |
|-------------------|--------|---------------|
| `on_guild_join` | Sync complète + upsert `tenant_discord_server_bots` | `"event"` |
| `on_guild_update` | Mise à jour nom/icône/description | `"event"` |
| `on_member_join` / `on_member_remove` | Mise à jour `member_count` | `"event"` |
| `on_guild_remove` | Marquer `active = false` dans `tenant_discord_server_bots`, suspendre accès RAG | `"event"` |
| Cron quotidien | Sync complète de tous les serveurs actifs | `"cron"` |

> **`on_guild_remove` est obligatoire** : sans lui, les données et
> l'accès RAG restent actifs pour un serveur qui a désinstallé le bot.

---

## Décisions tranchées

| # | Question | Décision |
|---|----------|----------|
| 1 | Où stocker bots/channels/roles ? | **JSONB** dans `server_metadata` — tables séparées si besoin de requêtes JOIN |
| 2 | RAG : collection par (guild × bot) ou filtre ? | **Filtre composé** `(tenant_id, guild_id, bot_id)` — cohérent avec RFC-049 |
| 3 | Sync auto ou commande manuelle ? | **Les deux** — inclure `on_guild_remove` |
| 4 | Accès RAG pour bots tiers ? | Hors scope MVP — modèle de token à documenter maintenant |

---

## Analyse d'impact par équipe (API Backend Team)

> **Date** : 2026-03-30
> **Auteur** : API Backend Team

### Impact API Backend — 8 tâches (effort moyen)

| Tâche | Effort | Dépendance |
|-------|--------|------------|
| 2 endpoints (server-sync + server-config) | Moyen | Aucune |
| 2 migrations Alembic (colonnes + table) | Faible | Aucune |
| Vérification guild_id ∈ tenant du token | Faible | Endpoints |
| Service `DiscordServerSyncService` | Moyen | Migrations |
| Logique `on_guild_remove` (active = false) | Faible | Service |
| Job backfill guild_name/member_count NULL | Faible | Migrations |

**Pas de bloquant.** On peut démarrer dès validation de la RFC.
Les endpoints suivent le pattern `X-Service-Token` déjà en place.

---

### Impact Bot Discord — 6 tâches (effort élevé)

C'est la partie la plus lourde. Trois équipes candidates :
**plugin-azy**, **azy.mcp**, **chatbot-core**.

#### Tâches détaillées

| # | Tâche | Effort | Détail |
|---|-------|--------|--------|
| B1 | Commande `/config` en subcommand groups | **Élevé** | Nécessite `discord.py` >= 2.0 avec `app_commands`. Si le bot actuel utilise les commandes préfixées (`!config`), c'est une migration. |
| B2 | Permission check `ADMINISTRATOR` | Faible | Décorateur `@has_permissions(administrator=True)` — trivial. |
| B3 | Cooldown 300s par guild | Faible | `@commands.cooldown(rate=1, per=300, type=BucketType.guild)` |
| B4 | 4 événements auto-sync | **Élevé** | `on_guild_join`, `on_guild_update`, `on_member_join/remove`, `on_guild_remove`. Chacun doit : collecter les infos, construire le payload, appeler `POST /api/discord/webhook/server-sync` via httpx. |
| B5 | Collecte des infos serveur | Moyen | `guild.name`, `guild.icon`, `guild.member_count`, `[m for m in guild.members if m.bot]`, `guild.channels`, `guild.roles`. Attention : `guild.members` nécessite l'intent `GUILD_MEMBERS` (privileged intent à activer dans le Developer Portal). |
| B6 | `bot_id` + `sync_source` dans les payloads | Faible | `bot_id = str(bot.user.id)` (application ID Discord du bot). `sync_source` = `"manual"` pour `/config sync`, `"event"` pour les listeners, `"cron"` pour le job planifié. |

#### Prérequis bloquant : Intent `GUILD_MEMBERS`

Pour lister les membres (et identifier les bots installés), le bot
doit avoir l'**intent privilégié `GUILD_MEMBERS`** activé :

1. Discord Developer Portal → Application → Bot → Privileged Intents
2. Cocher **Server Members Intent**
3. Côté code : `intents = discord.Intents.default(); intents.members = True`

Sans cet intent, `guild.members` retourne une liste incomplète et
`guild.member_count` peut être approximatif.

#### Qui doit le faire ?

| Équipe | Pour | Contre |
|--------|------|--------|
| **plugin-azy** | C'est le bot Discord "client", le plus proche de l'utilisateur final. Il connaît déjà le serveur et l'utilisateur. | Peut-être trop focalisé sur les commandes métier (/ask, /ocr) pour ajouter de l'admin. |
| **azy.mcp** | C'est le cerveau — il orchestre déjà les appels vers l'API backend. | Le MCP Server ne tourne pas comme un bot Discord, il n'a pas accès aux événements Discord (`on_guild_join`, etc.). |
| **chatbot-core** | C'est la librairie bot partagée entre les plugins. Les événements Discord sont gérés ici. | Si chatbot-core gère la sync, tous les bots basés dessus synchroniseront automatiquement — c'est le bon niveau d'abstraction. |

**Recommandation : chatbot-core** est le meilleur candidat.

Raisons :
1. Les événements Discord (`on_guild_join`, `on_guild_remove`) sont
   gérés au niveau du framework bot, pas au niveau du plugin
2. Chaque bot basé sur chatbot-core hériterait automatiquement de
   la sync — pas besoin de dupliquer dans chaque plugin
3. La commande `/config` est transverse (pas spécifique à un domaine)
4. Le `bot_id` (`bot.user.id`) est disponible dans chatbot-core

#### Implémentation suggérée dans chatbot-core

```python
# chatbot-core/src/core/server_sync.py

class ServerSyncManager:
    """Gère la synchronisation serveur → API backend."""

    def __init__(self, bot: commands.Bot, api_url: str, service_token: str):
        self.bot = bot
        self.api_url = api_url
        self.service_token = service_token
        self.bot_id = str(bot.user.id)

    async def sync_guild(self, guild: discord.Guild, source: str = "manual", synced_by: str | None = None) -> dict:
        """Synchronise un guild vers l'API backend."""
        payload = {
            "guild_id": str(guild.id),
            "bot_id": self.bot_id,
            "guild_name": guild.name,
            "guild_icon": str(guild.icon) if guild.icon else None,
            "guild_description": guild.description,
            "member_count": guild.member_count,
            "bot_count": len([m for m in guild.members if m.bot]),
            "channel_count": len(guild.channels),
            "bots": [
                {"id": str(m.id), "name": m.name, "avatar": str(m.avatar) if m.avatar else None}
                for m in guild.members if m.bot
            ],
            "channels": [
                {"id": str(c.id), "name": c.name, "type": str(c.type)}
                for c in guild.channels
            ],
            "roles": [
                {"id": str(r.id), "name": r.name, "color": str(r.color), "position": r.position}
                for r in guild.roles if not r.is_default()
            ],
            "synced_by": synced_by,
            "sync_source": source,
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.api_url}/api/discord/webhook/server-sync",
                headers={
                    "X-Service-Token": self.service_token,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            return response.json()

    def register_events(self):
        """Enregistre les événements auto-sync."""

        @self.bot.event
        async def on_guild_join(guild):
            await self.sync_guild(guild, source="event")

        @self.bot.event
        async def on_guild_update(before, after):
            await self.sync_guild(after, source="event")

        @self.bot.event
        async def on_guild_remove(guild):
            # Marquer comme inactif côté API
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{self.api_url}/api/discord/webhook/server-config",
                    headers={"X-Service-Token": self.service_token},
                    json={
                        "guild_id": str(guild.id),
                        "bot_id": self.bot_id,
                        "config_key": "active",
                        "config_value": False,
                    },
                )
```

#### Variables d'environnement requises côté bot

```bash
# .env du bot (chatbot-core / plugin)
BACKEND_API_URL=https://apidev.azy.solutions
BACKEND_SERVICE_TOKEN=service_ztKyTjO5_...
```

---

### Impact n8n — 2 tâches (effort faible)

| Tâche | Détail |
|-------|--------|
| Filtre RAG étendu | Ajouter `{"key": "bot_id", "match": {"value": "..."}}` dans le filtre Qdrant des workflows de recherche. Le `bot_id` est passé dans le payload d'entrée par le bot/MCP. |
| Indexation enrichie | Ajouter `bot_id` dans le payload Qdrant lors du save (`MCP - Entity - Save`). Le `bot_id` vient du caller. |

**Pas de bloquant.** C'est un champ supplémentaire dans les payloads
existants. Les workflows RFC-049 `MCP - Entity - Save` et
`MCP - Entity - Search` doivent être mis à jour.

---

### Impact Frontend — 0 tâche (Phase 1)

Pas d'impact immédiat. La commande `/config` se fait dans Discord.

**Phase 2 (future)** : dashboard admin "Serveurs Discord" dans l'app
web affichant les infos synchronisées (nom, icône, membres, bots,
RAG activé/désactivé). Les données seront disponibles via
`GET /api/discord/tenants/{tenant_id}/servers` (endpoint existant,
enrichi avec les nouvelles colonnes).

---

## Checklist

### Équipe Bot Discord (chatbot-core recommandé)
- [ ] `ServerSyncManager` dans chatbot-core (voir code suggéré)
- [ ] Commande slash `/config` en **subcommand groups natifs**
- [ ] Permission check `ADMINISTRATOR` sur toutes les sous-commandes
- [ ] Cooldown 300s par guild sur `/config sync`
- [ ] Événements auto-sync : `on_guild_join`, `on_guild_update`, **`on_guild_remove`**
- [ ] Activer l'intent `GUILD_MEMBERS` dans le Developer Portal
- [ ] Collecte infos : name, icon, members, bots, channels, roles
- [ ] Inclure `bot_id` (`bot.user.id`) et `sync_source` dans tous les payloads
- [ ] Variables d'env : `BACKEND_API_URL`, `BACKEND_SERVICE_TOKEN`

### Équipe API Backend
- [ ] Endpoint `POST /api/discord/webhook/server-sync`
- [ ] Endpoint `POST /api/discord/webhook/server-config`
- [ ] **Vérification `guild_id` ∈ `tenant_discord_servers` pour le `tenant_id` du token**
- [ ] Migration Alembic : nouvelles colonnes `tenant_discord_servers`
- [ ] Migration Alembic : création `tenant_discord_server_bots`
- [ ] Job de backfill pour `guild_name` / `member_count` NULL existants
- [ ] Service `DiscordServerSyncService`
- [ ] Logique `on_guild_remove` : `active = false` + suspension RAG

### Équipe n8n
- [ ] `MCP - Entity - Save` : ajouter `bot_id` dans le payload Qdrant
- [ ] `MCP - Entity - Search` : ajouter filtres `guild_id` + `bot_id` dans la requête Qdrant
- [ ] Mettre à jour les InputSchema des deux workflows
- [ ] Documenter la rétrocompatibilité pour les documents existants

---

## Notes d'implémentation chatbot-core

> **Date** : 2026-03-31
> **Auteur** : Équipe chatbot-core

### Corrections sur le code suggéré

1. **Chemin des fichiers** : Le chemin suggéré `chatbot-core/src/core/server_sync.py`
   ne correspond pas à la structure actuelle. Utiliser :
   ```
   chatbot_core/services/server_sync.py      # ServerSyncManager
   chatbot_core/cogs/config_cog.py           # Commande /config (Cog optionnel)
   ```

2. **Client HTTP** : chatbot-core utilise déjà `aiohttp` via `BaseN8nClient`.
   Créer un `ServerSyncClient` héritant de `BaseN8nClient` plutôt que d'utiliser
   `httpx` directement.

3. **Variables d'environnement** : `BACKEND_API_URL` et `BACKEND_SERVICE_TOKEN`
   sont **distinctes** des configs n8n (`n8n_base_url`, `n8n_api_key`). Ce sont
   des services différents (API Backend ≠ n8n). Ajouter ces nouvelles variables
   dans `BotConfig` sans les fusionner avec les configs n8n existantes.

### Architecture proposée

```
chatbot_core/
├── services/
│   ├── n8n/
│   │   ├── server_sync.py      # ServerSyncClient (BaseN8nClient)
│   │   └── ...
│   └── server_sync_manager.py  # ServerSyncManager (orchestration)
├── cogs/
│   └── config_cog.py           # Cog /config (optionnel, activable par plugin)
└── events/
    └── guild_events.py         # Listeners on_guild_join/update/remove
```

### 1. ServerSyncClient (nouveau client n8n)

```python
# chatbot_core/services/n8n/server_sync.py

class ServerSyncClient(BaseN8nClient):
    """Client pour les endpoints de synchronisation serveur Discord."""

    async def sync_server(
        self,
        guild_id: str,
        bot_id: str,
        guild_name: str,
        guild_icon: str | None,
        guild_description: str | None,
        member_count: int,
        bot_count: int,
        channel_count: int,
        bots: list[dict],
        channels: list[dict],
        roles: list[dict],
        *,
        synced_by: str | None = None,
        sync_source: str = "manual",
    ) -> dict[str, Any]:
        """POST /webhook/server-sync"""
        data = {
            "guild_id": guild_id,
            "bot_id": bot_id,
            "guild_name": guild_name,
            "guild_icon": guild_icon,
            "guild_description": guild_description,
            "member_count": member_count,
            "bot_count": bot_count,
            "channel_count": channel_count,
            "bots": bots,
            "channels": channels,
            "roles": roles,
            "synced_by": synced_by,
            "sync_source": sync_source,
        }
        return await self._request("POST", "server-sync", json_data=data)

    async def update_config(
        self,
        guild_id: str,
        bot_id: str,
        config_key: str,
        config_value: Any,
        *,
        configured_by: str | None = None,
    ) -> dict[str, Any]:
        """POST /webhook/server-config"""
        data = {
            "guild_id": guild_id,
            "bot_id": bot_id,
            "config_key": config_key,
            "config_value": config_value,
            "configured_by": configured_by,
        }
        return await self._request("POST", "server-config", json_data=data)

    async def mark_inactive(self, guild_id: str, bot_id: str) -> dict[str, Any]:
        """Marque le bot comme inactif sur ce serveur (on_guild_remove)."""
        return await self.update_config(
            guild_id=guild_id,
            bot_id=bot_id,
            config_key="active",
            config_value=False,
        )
```

### 2. Intégration dans N8nClient

```python
# chatbot_core/services/n8n_client.py

class N8nClient(BaseN8nClient):
    # ... existing code ...

    @property
    def server_sync(self) -> ServerSyncClient:
        """Client pour la synchronisation serveur (RFC-053)."""
        if self._server_sync is None:
            self._server_sync = ServerSyncClient(**self._create_client_config())
            if self.tenant_id:
                self._server_sync.tenant_id = self.tenant_id
        return self._server_sync
```

### 3. ServerSyncManager (orchestration)

```python
# chatbot_core/services/server_sync_manager.py

class ServerSyncManager:
    """Orchestre la synchronisation serveur → API backend."""

    def __init__(self, bot: commands.Bot, n8n_client: N8nClient):
        self.bot = bot
        self.n8n = n8n_client
        self.bot_id = str(bot.user.id) if bot.user else None

    async def sync_guild(
        self,
        guild: discord.Guild,
        source: str = "manual",
        synced_by: str | None = None,
    ) -> dict[str, Any]:
        """Collecte les infos d'un guild et les envoie à l'API."""
        if not self.bot_id:
            raise RuntimeError("Bot non connecté, bot_id indisponible")

        return await self.n8n.server_sync.sync_server(
            guild_id=str(guild.id),
            bot_id=self.bot_id,
            guild_name=guild.name,
            guild_icon=str(guild.icon) if guild.icon else None,
            guild_description=guild.description,
            member_count=guild.member_count or 0,
            bot_count=len([m for m in guild.members if m.bot]),
            channel_count=len(guild.channels),
            bots=[
                {"id": str(m.id), "name": m.name, "avatar": str(m.avatar) if m.avatar else None}
                for m in guild.members if m.bot
            ],
            channels=[
                {"id": str(c.id), "name": c.name, "type": str(c.type)}
                for c in guild.channels
            ],
            roles=[
                {"id": str(r.id), "name": r.name, "color": str(r.color), "position": r.position}
                for r in guild.roles if not r.is_default()
            ],
            synced_by=synced_by,
            sync_source=source,
        )

    async def on_guild_remove(self, guild: discord.Guild) -> dict[str, Any]:
        """Marque le bot comme inactif sur ce serveur."""
        if not self.bot_id:
            raise RuntimeError("Bot non connecté, bot_id indisponible")

        return await self.n8n.server_sync.mark_inactive(
            guild_id=str(guild.id),
            bot_id=self.bot_id,
        )
```

### 4. ConfigCog (Cog optionnel)

```python
# chatbot_core/cogs/config_cog.py

class ConfigCog(commands.Cog):
    """Commande /config pour la gestion serveur (RFC-053)."""

    def __init__(self, bot: commands.Bot, sync_manager: ServerSyncManager):
        self.bot = bot
        self.sync_manager = sync_manager

    config_group = app_commands.Group(
        name="config",
        description="Configuration du bot",
        default_permissions=discord.Permissions(administrator=True),
    )

    @config_group.command(name="sync", description="Synchronise les infos serveur")
    @app_commands.checks.cooldown(rate=1, per=300, key=lambda i: i.guild_id)
    async def config_sync(self, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        result = await self.sync_manager.sync_guild(
            guild=interaction.guild,
            source="manual",
            synced_by=str(interaction.user.id),
        )
        # ... format response ...

    # Sous-groupe RAG
    rag_group = app_commands.Group(
        name="rag",
        description="Configuration RAG",
        parent=config_group,
    )

    @rag_group.command(name="enable", description="Active le RAG pour ce bot")
    async def rag_enable(self, interaction: discord.Interaction):
        # ... implementation ...
```

### 5. Activation par les plugins

Les plugins activent le Cog et les événements selon leurs besoins :

```python
# Dans un plugin (ex: plugin-azy)
from chatbot_core.cogs.config_cog import ConfigCog
from chatbot_core.services.server_sync_manager import ServerSyncManager

class MyPlugin:
    async def setup(self, bot: commands.Bot):
        sync_manager = ServerSyncManager(bot, self.n8n_client)

        # Activer la commande /config
        await bot.add_cog(ConfigCog(bot, sync_manager))

        # Enregistrer les événements auto-sync
        @bot.event
        async def on_guild_join(guild):
            await sync_manager.sync_guild(guild, source="event")

        @bot.event
        async def on_guild_remove(guild):
            await sync_manager.on_guild_remove(guild)
```

### Points d'attention

| Point | Remarque |
|-------|----------|
| **Intent GUILD_MEMBERS** | Doit être activé dans le Developer Portal par chaque plugin. chatbot-core ne peut pas le forcer. Documenter dans le README. |
| **bot_id disponibilité** | `bot.user.id` n'est disponible qu'après `on_ready`. Le `ServerSyncManager` doit être initialisé après connexion. |
| **Cooldown persistant** | Le cooldown `@app_commands.checks.cooldown` est en mémoire. Si le bot redémarre, le cooldown est perdu. Acceptable pour le MVP. |
| **Erreurs réseau** | Ajouter retry/backoff dans `ServerSyncClient` pour les appels API. |
| **Rate limiting Discord** | Les événements `on_member_join/remove` peuvent être fréquents. Batcher les updates `member_count` (ex: toutes les 5 min). |

### Dépendances

Aucune nouvelle dépendance requise. chatbot-core utilise déjà :
- `discord.py` >= 2.0 (app_commands)
- `aiohttp` (via BaseN8nClient)

### Fichiers à créer/modifier

| Fichier | Action |
|---------|--------|
| `chatbot_core/services/n8n/server_sync.py` | **Créer** - ServerSyncClient |
| `chatbot_core/services/n8n/__init__.py` | **Modifier** - Export ServerSyncClient |
| `chatbot_core/services/n8n_client.py` | **Modifier** - Ajouter property `server_sync` |
| `chatbot_core/services/server_sync_manager.py` | **Créer** - ServerSyncManager |
| `chatbot_core/cogs/config_cog.py` | **Créer** - ConfigCog |
| `chatbot_core/cogs/__init__.py` | **Créer** - Export ConfigCog |

---

## Notes d'implémentation n8n

> **Date** : 2026-03-31
> **Auteur** : Équipe n8n

### État actuel des workflows RFC-049

Les workflows `MCP - Entity - Save` et `MCP - Entity - Search` supportent déjà :
- `tenant_id` (isolation multi-tenant)
- `guild_id` (présent dans le payload Qdrant, mais pas utilisé dans le filtre Search)
- `entity_id` (UUID partagé MongoDB/Qdrant)

**Manquant pour RFC-053 :** `bot_id`

### 1. MCP - Entity - Save — Modifications

#### Payload Qdrant actuel

```json
{
  "entity_id": "dcc231f2-...",
  "tenant_id": "Z6F3GSWB",
  "guild_id": "1286607696153546774",
  "entity_type": "recipe",
  "title": "Fraisier Vegan",
  "tags": ["dessert", "vegan"]
}
```

#### Payload Qdrant RFC-053

```json
{
  "entity_id": "dcc231f2-...",
  "tenant_id": "Z6F3GSWB",
  "guild_id": "1286607696153546774",
  "bot_id": "987654321",
  "entity_type": "recipe",
  "title": "Fraisier Vegan",
  "tags": ["dessert", "vegan"]
}
```

#### InputSchema mis à jour

```json
{
  "properties": {
    "bot_id": {
      "type": "string",
      "description": "Discord bot application ID (requis pour isolation RAG par bot)"
    }
  }
}
```

#### Node "Qdrant Save" — Modification

```javascript
// Ajouter dans le payload JSON
"bot_id": {{ $json.bot_id ? '"' + $json.bot_id + '"' : 'null' }},
```

### 2. MCP - Entity - Search — Modifications

#### Filtre Qdrant actuel

```json
{
  "filter": {
    "must": [
      { "key": "tenant_id", "match": { "value": "Z6F3GSWB" } }
    ]
  }
}
```

#### Filtre Qdrant RFC-053

```json
{
  "filter": {
    "must": [
      { "key": "tenant_id", "match": { "value": "Z6F3GSWB" } },
      { "key": "guild_id", "match": { "value": "1286607696153546774" } },
      { "key": "bot_id", "match": { "value": "987654321" } }
    ]
  }
}
```

#### InputSchema mis à jour

```json
{
  "properties": {
    "guild_id": {
      "type": "string",
      "description": "Discord guild ID (requis pour isolation RAG)"
    },
    "bot_id": {
      "type": "string",
      "description": "Discord bot application ID (requis pour isolation RAG par bot)"
    }
  }
}
```

#### Node "Search Qdrant" — Modification du filtre

```javascript
"filter": {
  "must": [
    {
      "key": "tenant_id",
      "match": { "value": {{ JSON.stringify($('Validate Input').first().json.tenant_id) }} }
    },
    {
      "key": "guild_id",
      "match": { "value": {{ JSON.stringify($('Validate Input').first().json.guild_id) }} }
    },
    {
      "key": "bot_id",
      "match": { "value": {{ JSON.stringify($('Validate Input').first().json.bot_id) }} }
    }
  ]
}
```

### 3. Rétrocompatibilité

#### Problème

Les documents existants dans Qdrant n'ont pas le champ `bot_id`. Un filtre strict
`bot_id = "987654321"` ne retournera pas ces documents.

#### Solutions proposées

| Option | Description | Avantage | Inconvénient |
|--------|-------------|----------|--------------|
| **A. Migration Qdrant** | Script pour ajouter `bot_id` aux points existants | Données propres | Nécessite connaître le bot_id historique |
| **B. Filtre conditionnel** | Si `bot_id` fourni → filtrer, sinon → ignorer | Rétrocompatible | Isolation partielle pendant transition |
| **C. Fallback gracieux** | Filtrer par `bot_id` OU `bot_id` absent | Rétrocompatible | Requête Qdrant plus complexe |

#### Recommandation : Option B (filtre conditionnel)

```javascript
// Dans Validate Input
const botId = body.bot_id || ctx.bot_id || null;

// Dans Search Qdrant — construire le filtre dynamiquement
const mustFilters = [
  { "key": "tenant_id", "match": { "value": tenantId } }
];

if (guildId) {
  mustFilters.push({ "key": "guild_id", "match": { "value": guildId } });
}

if (botId) {
  mustFilters.push({ "key": "bot_id", "match": { "value": botId } });
}
```

**Avantage :** Les anciens documents restent accessibles. Les nouveaux documents
avec `bot_id` seront correctement isolés.

**Phase 2 :** Une fois tous les documents migrés avec `bot_id`, rendre le filtre
obligatoire.

### 4. Points d'attention

| Point | Remarque |
|-------|----------|
| **bot_id obligatoire ?** | Non pour le MVP (rétrocompatibilité). Oui à terme. |
| **guild_id obligatoire ?** | Recommandé mais pas bloquant. Avertissement dans les logs si absent. |
| **Validation format** | `bot_id` doit être un ID Discord numérique (snowflake). Regex : `^\d{17,20}$` |
| **Index Qdrant** | Créer un index sur `bot_id` pour optimiser les filtres : `PUT /collections/{name}/index` |

### 5. Fichiers à modifier

| Fichier | Action |
|---------|--------|
| `workflows/MCP_-_Entity_-_Save.json` | **Modifier** - Ajouter `bot_id` dans Validate Input + Qdrant Save/Update |
| `workflows/MCP_-_Entity_-_Search.json` | **Modifier** - Ajouter `bot_id` dans Validate Input + filtre Qdrant |
| `docs/rfc/RFC-049-*.md` | **Modifier** - Documenter `bot_id` dans les InputSchema |

### 6. Dépendances

| Dépendance | Statut |
|------------|--------|
| API Backend endpoints server-sync | Non bloquant (n8n ne les appelle pas) |
| chatbot-core ServerSyncManager | Non bloquant (le bot passe `bot_id` à n8n) |
| Plugin envoie `bot_id` dans les requêtes | **Bloquant** — sans `bot_id` côté caller, pas d'isolation |

### 7. Ordre d'implémentation suggéré

1. **MCP - Entity - Save** : Ajouter `bot_id` au payload Qdrant (non bloquant si absent)
2. **MCP - Entity - Search** : Ajouter filtre `bot_id` conditionnel
3. **Plugin/MCP** : Envoyer `bot_id` dans toutes les requêtes
4. **Migration** : Script pour enrichir les documents existants
5. **Validation stricte** : Rendre `bot_id` obligatoire

---

## Notes d'implémentation azy-mcp

> **Date** : 2026-03-31
> **Auteur** : Équipe azy-mcp

### Rôle de azy-mcp dans RFC-053

azy-mcp est le **point de passage obligé** entre les plugins (Discord) et les
workflows n8n. Il doit propager `guild_id` et `bot_id` aux appels RAG.

```
Plugin (chatbot-core)
    │
    │  SessionContext { guild_id, bot_id, ... }
    ▼
azy-mcp (orchestration)
    │
    │  Payload { guild_id, bot_id, ... }
    ▼
n8n (MCP - Entity - Save/Search)
    │
    ▼
Qdrant (filtre composé)
```

### État actuel du code azy-mcp

| Composant | `guild_id` | `bot_id` |
|-----------|------------|----------|
| `DiscordSession` | ✅ Présent | ❌ **Absent** |
| `StudentContext` | ✅ Présent | ❌ **Absent** |
| `SessionContext` (RFC-059) | ❌ **Absent** | ❌ **Absent** |
| `ResolutionContext` | ❌ (a `tenant_id`) | ❌ **Absent** |
| `ParamBuilder` (n8n) | ❌ **Absent** | ❌ **Absent** |

### Modifications requises

#### 1. SessionContext (RFC-059) — Ajouter `guild_id` et `bot_id`

```python
# azy_mcp/intent_models.py + src/.../intent_models.py

@dataclass
class SessionContext:
    active_content: dict[str, Any] | None = None
    active_context_details: dict[str, Any] = field(default_factory=dict)
    recent_entities: list[dict[str, Any]] = field(default_factory=list)
    # RFC-053: Scoping RAG par (guild_id, bot_id)
    guild_id: str | None = None
    bot_id: str | None = None
```

**Impact :** Breaking change pour les plugins qui utilisent déjà `SessionContext`.
Cependant, les nouveaux champs sont optionnels (`None` par défaut), donc
rétrocompatible.

#### 2. DiscordSession — Ajouter `bot_id`

```python
# src/mcp_server/discord/session_adapter.py

@dataclass
class DiscordSession:
    thread_id: str
    user_id: str
    guild_id: str
    bot_id: str | None = None  # RFC-053
    # ... rest unchanged
```

#### 3. ParamBuilder — Propager aux workflows n8n

```python
# src/mcp_server/n8n/param_builder.py

class ParamBuilder:
    def build(
        self,
        tool_id: str,
        user_params: dict[str, Any],
        tool_schema: dict[str, Any] | None = None,
        *,
        guild_id: str | None = None,  # RFC-053
        bot_id: str | None = None,    # RFC-053
    ) -> dict[str, Any]:
        params = self._build_base_params(tool_id, user_params, tool_schema)

        # RFC-053: Ajouter guild_id et bot_id si fournis
        if guild_id:
            params["guild_id"] = guild_id
        if bot_id:
            params["bot_id"] = bot_id

        return params
```

#### 4. Orchestration — Extraire et propager les IDs

Le flow d'orchestration doit extraire `guild_id` et `bot_id` du contexte de
session et les passer à tous les appels n8n :

```python
# Dans le node d'exécution d'outil

session_context = state.session_context
guild_id = getattr(session_context, "guild_id", None)
bot_id = getattr(session_context, "bot_id", None)

params = self.param_builder.build(
    tool_id=tool.id,
    user_params=resolved_params,
    guild_id=guild_id,
    bot_id=bot_id,
)
```

### Fichiers à modifier

| Fichier | Action |
|---------|--------|
| `azy_mcp/intent_models.py` | **Modifier** — Ajouter `guild_id`, `bot_id` à `SessionContext` |
| `src/.../intent_models.py` | **Modifier** — Idem (copie serveur) |
| `src/.../discord/session_adapter.py` | **Modifier** — Ajouter `bot_id` à `DiscordSession` |
| `src/.../n8n/param_builder.py` | **Modifier** — Accepter et propager `guild_id`, `bot_id` |
| `src/.../orchestration/nodes/execution/tool_executor.py` | **Modifier** — Extraire IDs du contexte |
| `docs/guides/GUIDE-DOMAIN-CONTEXT-INJECTION.md` | **Modifier** — Documenter les nouveaux champs |

### Dépendances

| Dépendance | Statut |
|------------|--------|
| chatbot-core envoie `bot_id` dans `SessionContext` | **Bloquant** — sans ça, azy-mcp n'a pas la valeur |
| n8n accepte `bot_id` dans les workflows | Non bloquant (filtre conditionnel) |
| API Backend endpoints | Non concerné (azy-mcp n'appelle pas server-sync) |

### Ordre d'implémentation suggéré

1. **SessionContext** : Ajouter `guild_id` + `bot_id` (rétrocompatible)
2. **DiscordSession** : Ajouter `bot_id`
3. **ParamBuilder** : Propager aux payloads n8n
4. **Tool Executor** : Extraire du contexte et passer au builder
5. **Guide RFC-059** : Documenter les nouveaux champs
6. **Tests** : Vérifier que les IDs arrivent bien dans les appels n8n

### Questions ouvertes

| # | Question | Proposition |
|---|----------|-------------|
| 1 | `guild_id` et `bot_id` obligatoires dans `SessionContext` ? | Non — optionnels pour rétrocompatibilité. Warning dans les logs si absents. |
| 2 | Validation format `bot_id` (snowflake) ? | Oui — regex `^\d{17,20}$` dans `SessionContext.__post_init__` |
| 3 | Fallback si `bot_id` absent ? | Continuer sans filtre bot (rétrocompatibilité n8n Option C) |

---

## Analyse et recommandations (Review technique)

> **Date** : 2026-03-31
> **Auteur** : Review technique

### Clarification: Qu'est-ce que le cooldown ?

Le **cooldown** est une protection anti-spam qui empêche l'exécution répétée
d'une commande dans un intervalle de temps donné.

```
Exemple: cooldown 300s (5 min) sur /config sync

19:00:00 - Admin: /config sync → ✅ Exécuté
19:02:00 - Admin: /config sync → ❌ "Attendez encore 3 minutes"
19:05:00 - Admin: /config sync → ✅ Exécuté
```

```python
# Implémentation discord.py
@commands.cooldown(rate=1, per=300, type=commands.BucketType.guild)
#                  ↑        ↑                              ↑
#            1 appel    toutes les 300s         par serveur (pas par user)
```

**Note**: Ce cooldown est en mémoire. Si le bot redémarre, il est perdu.
Acceptable pour le MVP. Pour une solution robuste (multi-instance), utiliser
Redis comme backend de cooldown.

---

### Clarification: Chaîne d'injection de `bot_id`

Le `bot_id` est l'**application ID Discord du bot** (`bot.user.id`).
Il est connu par le **plugin** après connexion — pas besoin d'appel API.

> **Important**: chatbot-core est une bibliothèque/framework. C'est le **plugin**
> qui instancie le bot et a accès à `bot.user.id`.

#### Direction de propagation

```
┌─────────────────────────────────────────────────────────────────┐
│  Plugin → azy-mcp → n8n → Qdrant                                │
└─────────────────────────────────────────────────────────────────┘

1. Plugin (main.py, après on_ready)
   │
   │  # Le plugin instancie le bot et connaît son ID
   │  bot = BotFactory.create(config, intents=intents)
   │
   │  @bot.on_ready_callback
   │  async def on_ready():
   │      bot_id = str(bot.user.id)  # "987654321" ← CONNU ICI
   │
   ▼
2. Plugin (lors d'une interaction Discord)
   │
   │  # Le plugin construit le contexte de session
   │  session_context = SessionContext(
   │      guild_id=str(interaction.guild_id),
   │      bot_id=str(bot.user.id),  # ← Injection par le plugin
   │      user_id=str(interaction.user.id),
   │  )
   │
   ▼
3. azy-mcp (orchestration MCP)
   │
   │  # Reçoit SessionContext avec bot_id
   │  # ParamBuilder l'ajoute au payload n8n
   │  params["bot_id"] = session_context.bot_id
   │
   ▼
4. n8n (workflows MCP - Entity - Save/Search)
   │
   │  # Reçoit bot_id dans le payload d'entrée
   │  # L'inclut dans le payload/filtre Qdrant
   │
   ▼
5. Qdrant
   │
   │  # Stockage: { ..., "bot_id": "987654321" }
   │  # Recherche: filter.must[].bot_id = "987654321"
```

#### Responsabilités par composant

| Composant | Responsabilité `bot_id` |
|-----------|------------------------|
| **Plugin** | **Source de vérité** (`bot.user.id`) + injection dans `SessionContext` |
| **chatbot-core** | Fournit `BotFactory` et outils, mais ne connaît pas `bot_id` |
| **azy-mcp** | Propagation vers n8n via `ParamBuilder` |
| **n8n** | Inclusion dans payload/filtre Qdrant |
| **Qdrant** | Stockage et filtrage |

---

### Décision: Pas de migration des documents legacy

Les documents existants dans Qdrant **n'ont pas de `bot_id`**. Plutôt que de
migrer (impossible de déterminer le bot historique), on adopte un **filtre
gracieux** qui gère les deux cas.

#### Stratégie retenue: Option C (filtre inclusif)

```json
{
  "filter": {
    "must": [
      { "key": "tenant_id", "match": { "value": "Z6F3GSWB" } },
      { "key": "guild_id", "match": { "value": "1286607696153546774" } }
    ],
    "should": [
      { "key": "bot_id", "match": { "value": "987654321" } },
      { "is_empty": { "key": "bot_id" } }
    ],
    "min_should": 1
  }
}
```

**Logique**: Retourner les documents qui:
- Appartiennent au bon tenant ET guild
- ET (ont le bon `bot_id` OU n'ont pas de `bot_id` du tout)

**Avantages**:
- Documents legacy accessibles (pas de régression)
- Nouveaux documents correctement isolés par bot
- Pas de migration nécessaire
- Transition transparente

**Inconvénient acceptable**:
- Documents legacy visibles par tous les bots du même guild (comportement actuel)

---

### Challenge des contributions équipes

#### Équipe chatbot-core ✅

| Point | Évaluation |
|-------|------------|
| Architecture `ServerSyncClient` + `ServerSyncManager` | ✅ Cohérent |
| Réutilisation `BaseN8nClient` | ✅ Bonne pratique |
| ConfigCog optionnel | ✅ Flexible |
| `bot_id` après `on_ready` | ✅ Bien identifié |

**Point d'attention**: Les variables `BACKEND_API_URL` et `BACKEND_SERVICE_TOKEN`
sont distinctes de `n8n_base_url` et `n8n_api_key`. Ce sont des services
différents (API Backend ≠ n8n). Ne pas fusionner.

#### Équipe n8n ✅

| Point | Évaluation |
|-------|------------|
| État actuel documenté | ✅ Clair |
| Options rétrocompatibilité | ✅ Complètes |
| Index Qdrant `bot_id` | ✅ Performance |

**Recommandation**: Adopter **Option C** (filtre inclusif) plutôt que Option B
(filtre conditionnel). Option B casse l'isolation si `bot_id` absent.

#### Équipe azy-mcp ✅

| Point | Évaluation |
|-------|------------|
| Audit des composants | ✅ Exhaustif |
| Chaîne de dépendance | ✅ Correcte |
| Questions ouvertes | ✅ Pertinentes |

**Clarification**: L'ajout de `guild_id` et `bot_id` à `SessionContext` n'est
**pas un breaking change** car les champs sont optionnels avec défaut `None`.

---

### Checklist consolidée

#### Phase 1: Infrastructure (parallélisable)

| Équipe | Tâche | Priorité |
|--------|-------|----------|
| **API Backend** | Endpoint `POST /webhook/server-sync` | P0 |
| **API Backend** | Endpoint `POST /webhook/server-config` | P0 |
| **API Backend** | Migration Alembic (colonnes + table) | P0 |
| **chatbot-core** | `ServerSyncClient` dans `services/n8n/` | P0 |
| **chatbot-core** | `ServerSyncManager` | P0 |
| **n8n** | Ajouter `bot_id` à `MCP - Entity - Save` | P0 |
| **n8n** | Filtre Option C dans `MCP - Entity - Search` | P0 |
| **azy-mcp** | `bot_id` dans `SessionContext` | P0 |
| **azy-mcp** | Propagation via `ParamBuilder` | P0 |

#### Phase 2: Commandes et événements

| Équipe | Tâche | Priorité |
|--------|-------|----------|
| **chatbot-core** | `ConfigCog` avec `/config sync` | P1 |
| **chatbot-core** | Événements `on_guild_join/remove` | P1 |
| **chatbot-core** | Debouncing `on_member_join/remove` | P2 |
| **Plugins** | Activer ConfigCog et événements | P1 |

#### Phase 3: Hardening

| Équipe | Tâche | Priorité |
|--------|-------|----------|
| **n8n** | Validation regex `bot_id` snowflake | P2 |
| **n8n** | Index Qdrant sur `bot_id` | P2 |
| **chatbot-core** | Retry/backoff sur erreurs réseau | P2 |
| **Toutes** | Tests d'intégration | P2 |

---

### Questions tranchées

| # | Question | Décision |
|---|----------|----------|
| 1 | Migration documents legacy ? | **Non** — Option C les gère |
| 2 | Option B ou C pour rétrocompat ? | **Option C** (filtre inclusif) |
| 3 | `bot_id` obligatoire ? | **Non** pour MVP — warning si absent |
| 4 | Cooldown mémoire ou Redis ? | **Mémoire** pour MVP — Redis si multi-instance |
| 5 | Qui injecte `bot_id` ? | **Plugin** via `bot.user.id` → SessionContext → azy-mcp → n8n |
