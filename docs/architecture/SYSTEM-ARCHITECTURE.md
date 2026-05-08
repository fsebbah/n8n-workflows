# Architecture Système Globale

**Date** : 2026-05-08
**Statut** : Documentation interne
**Concerne** : Toutes les équipes

---

## 1. Vue d'ensemble

Le système est composé de deux flux principaux :

### Flux 1 : Frontend → chat.api → Azy-MCP → N8N

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Frontend   │─────▶│   chat.api   │─────▶│   Azy-MCP    │─────▶│     N8N      │
│   (Web UI)   │      │              │      │ (MCP Server) │      │  (Webhooks)  │
└──────────────┘      └──────────────┘      └──────────────┘      └──────┬───────┘
                                                                         │
                                                                         ▼
                                                              ┌─────────────────────┐
                                                              │  Services Externes  │
                                                              │  Google, LLM, etc.  │
                                                              └─────────────────────┘
```

### Flux 2 : Plugin Discord → Chatbot-Core → Azy-MCP → N8N

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Discord    │─────▶│              │      │              │      │              │
│  (Gateway)   │      │  Chatbot-    │─────▶│   Azy-MCP    │─────▶│     N8N      │
├──────────────┤      │    Core      │      │ (MCP Server) │      │  (Webhooks)  │
│   Plugin     │─────▶│  (Framework) │      │              │      │              │
│  (Métier)    │      │              │      │              │      │              │
└──────────────┘      └──────────────┘      └──────────────┘      └──────┬───────┘
                                                                         │
                                                                         ▼
                                                              ┌─────────────────────┐
                                                              │  Services Externes  │
                                                              │  Google, LLM, etc.  │
                                                              └─────────────────────┘
```

### Schéma global unifié

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              POINTS D'ENTRÉE                                     │
│                                                                                  │
│        ┌──────────────┐              ┌──────────────────────────────────┐       │
│        │   Frontend   │              │      Plugin Discord              │       │
│        │   (Web UI)   │              │  (plugin-recipes, plugin-chess)  │       │
│        └──────┬───────┘              └──────────────┬───────────────────┘       │
│               │                                     │                           │
└───────────────│─────────────────────────────────────│───────────────────────────┘
                │                                     │
                ▼                                     ▼
┌──────────────────────────┐           ┌──────────────────────────┐
│      chat.api            │           │      Chatbot-Core        │
│  (Backend API)           │           │  (Framework Discord)     │
└────────────┬─────────────┘           └────────────┬─────────────┘
             │                                      │
             │  REST API                            │  MCP Protocol
             │                                      │
             └───────────────┬──────────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │        Azy-MCP           │
              │     (MCP Server)         │
              │  Wrappers outils Google  │
              │                          │
              │  Accès via:              │
              │  - MCP Protocol (stdio)  │
              │  - MCP Protocol (WS)     │
              │  - REST API              │
              └────────────┬─────────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │          N8N             │
              │      (Webhooks)          │
              │  Workflows & Automations │
              └────────────┬─────────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │   Services Externes      │
              │                          │
              │  - Google APIs           │
              │  - OpenAI / Anthropic    │
              │  - Bases de données      │
              │  - Services tiers        │
              └──────────────────────────┘
```

**Points clés :**
- **Frontend** passe TOUJOURS par `chat.api` → `Azy-MCP` → `N8N`
- **Plugin Discord** = couche métier (recettes, échecs) au-dessus de Chatbot-Core
- **Chatbot-Core** = framework partagé (TenantResolver, Cogs, N8nClient)
- **N8N** est le SEUL à appeler les services externes (Google, LLM, etc.)
- **Azy-MCP** est le point de passage obligé pour tous les outils
- **Azy-MCP** supporte 3 transports : stdio, WebSocket, REST API

---

## 2. Description des composants

### 2.1 Frontend (Web UI)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Interface utilisateur web pour le chatbot et l'administration |
| **Technologies** | React, TypeScript, WebSocket |
| **Communication** | WebSocket vers chat.api pour le chat temps réel |
| **Fonctionnalités** | Chat, Settings, Admin, visualisation des données |

```
Frontend
├── Chatbot Widget      → Conversations temps réel
├── Settings UI         → Configuration utilisateur (Google OAuth, préférences)
└── Admin Dashboard     → Gestion des utilisateurs, analytics
```

### 2.2 Discord Bot (vue fonctionnelle)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Interface conversationnelle via Discord |
| **Implémentation** | Chatbot-Core (voir section 2.5) |
| **Communication** | Discord Gateway + Redis Streams (commandes backend) |
| **Fonctionnalités** | Chat, commandes slash, onboarding, voice realtime |

```
Discord Bot
├── Commandes slash     → /voice, /settings, /help
├── Conversations       → Messages dans channels avec @mention
├── Threads             → Discussions contextuelles
├── Onboarding          → DM multi-étapes (RFC-069)
├── Voice Realtime      → Conversations vocales IA (RFC-078)
└── Backend Commands    → Exécution commandes via Redis (RFC-062)
```

**Note :** Le bot Discord est implémenté par le projet Chatbot-Core (section 2.5).
Les commandes du backend (création channels, gestion rôles) passent par Redis Streams.

### 2.3 Plugins Discord (Couche Applicative)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Bots Discord spécialisés par domaine métier |
| **Technologies** | Python 3.11+, chatbot-core (framework), discord.py |
| **Communication** | Discord Gateway + n8n webhooks + Redis |
| **Fonctionnalités** | Conversations IA, commandes slash, tools métier, intégrations |

Les **Plugins** sont des applications Discord autonomes qui utilisent `chatbot-core` comme framework.
Chaque plugin apporte une logique métier spécifique (recettes, échecs, template générique).

#### Plugins existants

| Plugin | Domaine | Spécificités |
|--------|---------|--------------|
| **plugin-recipes** | Recettes de cuisine | DocumentService, RecipeImageHandler, ShoppingListService, CartIntegration |
| **plugin-chess** | Jeux d'échecs | ScoreSheetHandler (OCR), Learning module, GameService |
| **plugin-azy** | Template générique | Base minimale pour nouveaux plugins |

#### Architecture d'un plugin

```
plugin-{domain}/
├── main.py                      → Point d'entrée, initialisation bot
├── src/
│   ├── __init__.py              → Classe Plugin principale ({Domain}Plugin)
│   ├── config.py                → Configuration spécifique (PluginConfig)
│   ├── branding.py              → BOT_NAME, BOT_COLOR, BOT_EMOJI
│   ├── commands/                → Commandes slash Discord
│   │   ├── __init__.py          → setup_commands()
│   │   ├── search.py            → /search, /find
│   │   ├── document.py          → /extraire, /mes-documents
│   │   └── admin.py             → /reload-config
│   ├── services/                → Services métier locaux
│   │   ├── document_service.py  → Traitement documents (RFC-014)
│   │   ├── credits_service.py   → Gestion crédits utilisateur
│   │   ├── search_service.py    → Recherche Qdrant
│   │   └── redis_service.py     → Cache et sessions
│   ├── tools/                   → Tools MCP locaux
│   │   ├── adapters/            → WebhookAdapter pour n8n
│   │   ├── executor.py          → ActionExecutor
│   │   └── local.py             → LOCAL_DISCORD_TOOLS
│   ├── conversation.py          → ConversationService (RFC-030)
│   ├── mentions.py              → Handler @mentions
│   └── views/                   → UI Discord (embeds, buttons, modals)
├── config/
│   └── domains.yaml             → Domaines d'intention (RFC-031)
└── requirements.txt             → Dépendances (chatbot-core, azy-mcp)
```

#### Relation Plugin ↔ Chatbot-Core

Le plugin **hérite et utilise** les composants de chatbot-core :

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Plugin (ex: plugin-recipes)                  │
│                                                                      │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │
│  │ RecipesPlugin  │  │ ConversationSvc│  │ Services métier        │ │
│  │ (Plugin class) │  │ (local)        │  │ DocumentSvc, SearchSvc │ │
│  └───────┬────────┘  └───────┬────────┘  └───────────┬────────────┘ │
│          │                   │                       │              │
└──────────│───────────────────│───────────────────────│──────────────┘
           │                   │                       │
           ▼                   ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         Chatbot-Core (framework)                     │
│                                                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │
│  │ BotFactory │ │ N8nClient  │ │ TenantRes. │ │ DiscordCommand   │  │
│  │            │ │            │ │ (RFC-079)  │ │ Listener (062)   │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘  │
│                                                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐  │
│  │ Onboarding │ │ VoiceReal- │ │ DMVerific- │ │ ResyncSubscriber │  │
│  │ Cog (069)  │ │ timeCog 78 │ │ ationCog   │ │ (RFC-060)        │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

#### Initialisation (main.py)

```python
# 1. Charger la config
config = PluginConfig.from_env()

# 2. Créer N8nClient
n8n_client = N8nClient(base_url=config.n8n_base_url, ...)

# 3. Créer le bot via BotFactory (chatbot-core)
bot = BotFactory.create(config, intents=intents)

# 4. Créer et charger le plugin
plugin = RecipesPlugin(bot, config, n8n_client)
bot.load_plugin(plugin)

# 5. on_ready: RFC-079 TenantResolver
@bot.on_ready_callback
async def on_ready():
    tenant_resolver = TenantResolver(n8n_client)
    tenant_config = await tenant_resolver.resolve(bot_user_id, guild_id)
    n8n_client.set_tenant_id(tenant_config.tenant_id)
    n8n_client.resolved_models = tenant_config.models  # Accès global aux modèles LLM

    # RFC-062: DiscordCommandListener (commandes backend)
    command_listener = DiscordCommandListener(bot=bot, redis_url=config.redis_url)
    await command_listener.start()

    # Cogs chatbot-core: OnboardingCog, VoiceRealtimeCog, DMVerificationCog
    # ...
```

#### Flux de conversation (@mention)

```
User @mention "Trouve-moi une recette de pizza"
    ↓
Plugin.MentionHandler (mentions.py)
    ↓
ConversationService (conversation.py)
    ├── ToolSearcher (Qdrant tools_index) → pré-filtre tools pertinents
    ├── IntentDetector → détecte intention "search_recipe"
    └── DialogManager → gère le contexte multi-tours
    ↓
ActionExecutor (tools/executor.py)
    ↓
WebhookAdapter (tools/adapters/webhook.py)
    ↓
n8n webhooks (mcp-recipe-search, mcp-entity-*)
    ↓
Services externes (Qdrant, LLM, Google APIs)
    ↓
Réponse formatée → Discord embed
```

#### Configuration (PluginConfig)

| Variable | Description | Exemple |
|----------|-------------|---------|
| `BOT_NAME` | Nom affiché du bot | "Bot Appetit" |
| `ENTITY_TYPE` | Type d'entité métier | "recipe", "game" |
| `DISCORD_TOKEN` | Token du bot Discord | - |
| `DISCORD_GUILD_ID` | ID du serveur principal | 1234567890 |
| `N8N_BASE_URL` | URL base webhooks n8n | http://pi6.local:5678 |
| `N8N_PROJECT_ID` | ID projet n8n | "bot-appetit" |
| `REDIS_URL` | Redis pour sessions/cache | redis://localhost:6379/2 |
| `QDRANT_TOOLS_URL` | URL Qdrant pour ToolSearcher | http://localhost:6333 |
| `QDRANT_TOOLS_COLLECTION` | Collection des tools | "tools_index" |

#### RFCs implémentés côté Plugin

| RFC | Statut | Description |
|-----|--------|-------------|
| **RFC-014** | ✅ | Document Processing (DocumentService, OCR) |
| **RFC-030** | ✅ | ConversationService local (NLU/Dialog/NLG) |
| **RFC-031** | ✅ | Intent Domains (domains.yaml) |
| **RFC-042** | ✅ | User Intuitions (préférences via azy-mcp) |
| **RFC-045** | ✅ | Image Handler (RecipeImageHandler, ScoreSheetHandler) |
| **RFC-050** | ✅ | Qdrant Tools verification au démarrage |
| **RFC-057** | ✅ | Session Context Manager |
| **RFC-063** | ✅ | Architecture refactoring (services/, tools/, conversation/) |
| **RFC-079** | ✅ | TenantResolver + resolved_models sur n8n_client |

#### Dépendances (requirements.txt)

```
# Framework (staging branch)
git+https://github.com/fsebbah/chatbot-core.git@staging
git+https://github.com/fsebbah/azy-mcp.git@staging

# chatbot-core >= 0.8.79 requis pour:
# - RFC-062 DiscordCommandListener.get_roles
# - RFC-079 TenantResolver
```

### 2.4 API Backend (chat.api)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Point d'entrée unifié, orchestration |
| **Technologies** | Python (FastAPI) ou Node.js |
| **Port** | Variable selon environnement |
| **Fonctionnalités** | Auth, routing, sessions, orchestration |

```
chat.api
├── Authentication      → OAuth, JWT, sessions
├── WebSocket Manager   → Connexions temps réel
├── Request Router      → Dispatch vers les services
├── User Management     → Profils, préférences
└── Orchestration       → Coordination des services
```

**Relations :**
- Reçoit toutes les requêtes des points d'entrée
- Délègue à Chatbot-Core pour l'IA
- Délègue à Azy-MCP pour les outils (via API REST `/api/tools/{id}/execute`)
- ⚠️ Ne doit **JAMAIS** appeler n8n directement (toujours passer par Azy-MCP)

### 2.5 Chatbot-Core

| Aspect | Description |
|--------|-------------|
| **Rôle** | Moteur de conversation IA + Bot Discord multi-tenant |
| **Technologies** | Python 3.11+, discord.py, asyncio, Redis |
| **Port** | Pas d'API HTTP (communication via Redis Streams) |
| **Fonctionnalités** | Conversations, commandes Discord, onboarding, voice realtime |

#### Architecture interne

```
Chatbot-Core
├── Core (Framework)
│   ├── BotFactory           → Factory pour créer FrameworkBot
│   ├── FrameworkBot         → Bot Discord étendu avec support plugins
│   ├── BaseConfig           → Configuration de base partagée
│   └── Plugin Interface     → Interface pour plugins métier
│
├── Cogs (Discord Extensions)
│   ├── OnboardingCog        → Onboarding multi-étapes via DM (RFC-069)
│   ├── VoiceRealtimeCog     → Conversations vocales temps réel (RFC-078)
│   ├── ConfigCog            → Configuration utilisateur + /config sync
│   └── DMVerificationCog    → Vérification étudiants via DM
│
├── Services Layer
│   ├── TenantResolver       → Résolution tenant + package LLM (RFC-049, RFC-079)
│   ├── DiscordCommandListener → Commandes Discord via Redis Streams (RFC-062)
│   ├── OnboardingRedisService → Sessions onboarding avec TTL (RFC-069)
│   ├── VoiceRealtimeService → Bridge GCP → OpenAI Realtime (RFC-078)
│   ├── ServerSyncManager    → Sync infos guild vers backend (RFC-060)
│   ├── ResyncSubscriber     → Écoute bot:resync Pub/Sub (RFC-060)
│   ├── MCP Client           → Appels outils via protocole MCP
│   ├── N8nClient            → Appels webhooks n8n
│   └── PromptManager        → Gestion prompts système
│
├── Discord Services
│   ├── RoleManager          → Gestion des rôles Discord
│   ├── ChannelManager       → Gestion des channels
│   ├── ThreadManager        → Gestion des threads
│   └── VoiceSessionManager  → Sessions vocales actives
│
├── Mixins
│   └── GuildEventsMixin     → on_guild_join/update/remove (RFC-060)
│
├── Command Handlers (RFC-062)
│   ├── GuildHandler         → update_guild
│   ├── ChannelHandler       → create_category, create_channel, delete_channel
│   ├── InviteHandler        → create_invite
│   ├── PermissionHandler    → set_permissions
│   └── RoleHandler          → get_roles
│
├── Models
│   ├── TenantConfig         → Configuration tenant + package (RFC-079)
│   ├── PackageModels        → Modèles LLM par package
│   ├── OnboardingSession    → État session onboarding
│   └── PluginContext        → Contexte conversation
│
└── Gamification (RFC-067)
    ├── BadgeService         → Attribution de badges
    ├── LeaderboardService   → Classements
    └── EventBus             → Bus d'événements gamification
```

#### Communication Redis Streams (RFC-062)

Le bot Discord reçoit des commandes du backend via Redis Streams :

```
┌─────────────┐    POST /api/discord-commands     ┌─────────────┐
│   Backend   │ ───────────────────────────────▶  │    Redis    │
│  (chat.api) │                                   │   Streams   │
└─────────────┘                                   └──────┬──────┘
                                                         │
      Stream: discord:commands                           │
      ┌─────────────────────────────────────────────────┐│
      │ request_id: "req-123"                           ││
      │ guild_id: "1234567890"                          ││
      │ action: "get_roles" | "create_channel" | ...    ││
      │ payload: { ... }                                ││
      └─────────────────────────────────────────────────┘│
                                                         │
                                                         ▼
                                            ┌─────────────────────┐
                                            │  DiscordCommand     │
                                            │    Listener         │
                                            │  (Consumer Group)   │
                                            └──────────┬──────────┘
                                                       │
                                                       ▼
                                            ┌─────────────────────┐
                                            │  CommandExecutor    │
                                            │  (Strategy Pattern) │
                                            └──────────┬──────────┘
                                                       │
                                                       ▼
                                            ┌─────────────────────┐
                                            │   Discord API       │
                                            │   (avec bot token)  │
                                            └──────────┬──────────┘
                                                       │
      Stream: discord:results                          │
      ┌─────────────────────────────────────────────────┐
      │ request_id: "req-123"                           │
      │ success: true                                   │
      │ data: { roles: [...] }                          │
      └─────────────────────────────────────────────────┘
                                                         │
                                                         ▼
┌─────────────┐    XREAD discord:results      ┌─────────────┐
│   Backend   │ ◀─────────────────────────────│    Redis    │
│  (chat.api) │                               │   Streams   │
└─────────────┘                               └─────────────┘
```

**Actions supportées (RFC-062) :**

| Action | Payload | Description |
|--------|---------|-------------|
| `update_guild` | `{name?, icon_url?}` | Modifier nom/icône du serveur |
| `create_category` | `{name, position?}` | Créer une catégorie |
| `create_channel` | `{name, type, category_id?, topic?}` | Créer un channel |
| `delete_channel` | `{channel_id}` | Supprimer un channel |
| `create_invite` | `{channel_id, max_age?, max_uses?}` | Créer une invitation |
| `set_permissions` | `{channel_id, target_type, target_id, permissions}` | Modifier permissions |
| `get_roles` | `{}` | Lister les rôles (avec tags bot) |

#### TenantResolver (RFC-049 + RFC-079)

Résout Discord user_id → TenantConfig avec cache 1h :

```python
# Avant (RFC-049)
tenant_id = await resolver.resolve_tenant_id(user_id, guild_id)

# Après (RFC-079)
config = await resolver.resolve(user_id, guild_id)
# config.tenant_id      → "tenant-123"
# config.package_code   → "pro-complet"
# config.models.chat    → "gpt-4.1"
# config.models.chat_mini → "gpt-4.1-mini"
# config.is_fallback    → True si owner fallback
```

**Flux de résolution :**

```
┌──────────────┐     user_id + guild_id     ┌───────────────┐
│  Chatbot-    │ ─────────────────────────▶ │   n8n webhook │
│    Core      │                            │ mcp-tenant-   │
└──────────────┘                            │   resolve     │
       ▲                                    └───────┬───────┘
       │                                            │
       │              TenantConfig                  ▼
       │         ┌──────────────────────┐   ┌─────────────┐
       │         │ tenant_id: "t-123"   │   │  PostgreSQL │
       └─────────│ package: "pro"       │◀──│  (tenants)  │
                 │ models:              │   └─────────────┘
                 │   chat: "gpt-4.1"    │
                 │   chat_mini: "gpt-4.1-mini"
                 │   embedding: "..."   │
                 └──────────────────────┘
```

#### Voice Realtime (RFC-078)

Commandes vocales `/voice start|end|status` :

```
┌──────────────┐     Discord Audio      ┌──────────────┐
│   Discord    │ ─────────────────────▶ │  Chatbot-    │
│   Voice      │                        │    Core      │
│   Channel    │                        │ (Cog)        │
└──────────────┘                        └──────┬───────┘
                                               │
                                               │ WebSocket
                                               ▼
                                    ┌──────────────────────┐
                                    │    GCP Bridge        │
                                    │ (audio transcoding)  │
                                    └──────────┬───────────┘
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │  OpenAI Realtime API │
                                    │  (gpt-4o-realtime)   │
                                    └──────────────────────┘
```

#### RFCs implémentés

| RFC | Statut | Description |
|-----|--------|-------------|
| **RFC-049** | ✅ Complété | Multi-tenant isolation (TenantResolver) |
| **RFC-060** | ✅ Complété | Guild info sync (ServerSyncManager, ResyncSubscriber) |
| **RFC-062** | ✅ Complété | Discord commands via Redis Streams |
| **RFC-067** | 🔄 En cours | Gamification (badges, leaderboards) |
| **RFC-069** | ✅ Complété | Onboarding multi-étapes via DM |
| **RFC-078** | ✅ Complété | Voice realtime via GCP bridge |
| **RFC-079** | ✅ Complété | Tenant package configuration |

#### Configuration (variables d'environnement)

| Variable | Description | Défaut |
|----------|-------------|--------|
| `DISCORD_TOKEN` | Token du bot Discord | - |
| `REDIS_URL` | URL Redis pour streams/sessions | redis://localhost:6379 |
| `N8N_WEBHOOK_BASE_URL` | URL base webhooks n8n | http://localhost:5678 |
| `REALTIME_BRIDGE_URL` | URL bridge GCP voice | - |
| `LOG_LEVEL` | Niveau de log | INFO |

#### Relations

- **Discord** → Chatbot-Core : Événements Discord (messages, voice, joins)
- **chat.api** → Redis → Chatbot-Core : Commandes Discord (RFC-062)
- Chatbot-Core → **n8n** : Résolution tenant, appels services
- Chatbot-Core → **Azy-MCP** : Tool calling via MCP protocol
- Chatbot-Core → **GCP Bridge** : Audio voice realtime (RFC-078)

### 2.6 Azy-MCP (MCP Server)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Serveur d'outils MCP (Model Context Protocol) + API REST |
| **Technologies** | Python 3.11+, FastAPI, asyncio |
| **Port** | 8765 |
| **Fonctionnalités** | Wrappers outils, API REST, analyseurs, storage |

#### Architecture interne

```
Azy-MCP
├── API Layer (FastAPI)
│   ├── /api/tools                    → Liste des tools disponibles
│   ├── /api/tools/{tool_id}          → Info sur un tool
│   ├── /api/tools/{tool_id}/execute  → Exécution directe (RFC-083)
│   ├── /health                       → Health check
│   └── /metrics                      → Métriques Prometheus
│
├── MCP Protocol Layer
│   ├── Protocol Handler              → Gestion du protocole MCP
│   └── Workflow Manager              → Orchestration des workflows
│
├── Tools Layer (N8NTool pattern)
│   ├── N8NToolRegistry               → Registre dynamique des tools
│   ├── N8NToolBase                   → Classe de base abstraite
│   │
│   ├── Google Workspace Tools
│   │   ├── GmailTool                 → Emails (list, get, send, draft)
│   │   ├── CalendarTool              → Agenda (events, calendars)
│   │   ├── DriveTool                 → Fichiers (list, upload, download, share)
│   │   ├── ContactsTool              → Contacts (list, get, create, update)
│   │   └── ClassroomTool             → Classroom (courses, topics, coursework, expert_program.sync)
│   │
│   ├── Media Tools
│   │   ├── ImageGenerationTool       → Génération d'images (DALL-E, Midjourney)
│   │   ├── VideoAnalysisTool         → Analyse vidéo (transcription, OCR)
│   │   └── VideoGenerationTool       → Génération vidéo
│   │
│   ├── Knowledge Tools
│   │   └── KnowledgeGraphTool        → Graphe de connaissances (Qdrant)
│   │
│   └── [En développement]
│       ├── MapsTool                  → Google Maps (non enregistré)
│       ├── NotionTool                → Notion API (non enregistré)
│       ├── SlackTool                 → Slack (non enregistré)
│       └── TrelloTool                → Trello (non enregistré)
│
├── Analyzers (Phase 2)
│   ├── PromptAnalyzer                → Analyse des prompts entrants
│   ├── ContextAnalyzer               → Analyse du contexte utilisateur
│   └── ResponseAnalyzer              → Analyse des réponses
│
└── Storage (Phase 2)
    ├── VectorStore                   → Stockage vectoriel (embeddings)
    ├── CacheManager                  → Cache Redis/mémoire
    └── KnowledgeBase                 → Base de connaissances
```

#### Trois modes d'accès

| Mode | Client | Transport | Usage |
|------|--------|-----------|-------|
| **MCP stdio** | Chatbot-Core, Plugin | Processus stdio | Intégration locale, latence minimale |
| **MCP WebSocket** | Plugin, clients distants | `ws://host:8765/mcp` | Intégration réseau, streaming |
| **API REST** | chat.api | `POST /api/tools/{id}/execute` | Appels directs sans conversation |

#### Transports MCP supportés

```
┌─────────────────────────────────────────────────────────────────┐
│                      Azy-MCP Server                              │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  stdio Handler  │  │   WS Handler    │  │  REST Handler   │  │
│  │                 │  │                 │  │                 │  │
│  │  stdin/stdout   │  │  ws://:8765/mcp │  │  http://:8765/  │  │
│  │                 │  │                 │  │  api/tools/*    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                ▼                                │
│                    ┌─────────────────────┐                      │
│                    │   Protocol Router   │                      │
│                    │   (unifié)          │                      │
│                    └──────────┬──────────┘                      │
│                               ▼                                 │
│                    ┌─────────────────────┐                      │
│                    │   Tools Registry    │                      │
│                    └─────────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

**Détail des transports :**

| Transport | Cas d'usage | Authentification | Streaming |
|-----------|-------------|------------------|-----------|
| **stdio** | Plugin local, Chatbot-Core local | Implicite (même machine) | ✅ Natif |
| **WebSocket** | Plugin distant, clients web | Token dans handshake | ✅ Natif |
| **REST** | chat.api, intégrations HTTP | `X-Tenant-ID` + `X-User-ID` | ❌ (polling) |

**Configuration client MCP (stdio) :**

```json
{
  "mcpServers": {
    "azy-mcp": {
      "command": "python",
      "args": ["-m", "mcp_server"],
      "cwd": "/path/to/azy.mcp",
      "env": {
        "N8N_WEBHOOK_URL": "http://localhost:5678"
      }
    }
  }
}
```

**Configuration client MCP (WebSocket) :**

```json
{
  "mcpServers": {
    "azy-mcp": {
      "transport": "websocket",
      "url": "ws://mcp-server:8765/mcp",
      "headers": {
        "X-Tenant-ID": "tenant-123",
        "X-User-ID": "user-456"
      }
    }
  }
}
```

#### Pattern N8NTool

Tous les tools Google héritent de `N8NToolBase` :

```python
class ClassroomTool(N8NToolBase):
    tool_id = "classroom"
    domain = "classroom"
    webhook_path = "mcp-classroom"

    supported_operations = [
        "course.list", "course.get", "course.create",
        "topic.list", "topic.create",
        "coursework.list", "coursework.create",
        "expert_program.sync",  # Opération orchestration
    ]
```

#### Headers d'authentification (API REST)

| Header | Type | Description |
|--------|------|-------------|
| `X-Tenant-ID` | string | Identifiant du tenant |
| `X-User-ID` | string | Identifiant utilisateur (Firebase UID) |
| `X-Correlation-ID` | string | ID de traçabilité (optionnel) |

#### Exemple de requête API REST

```bash
curl -X POST http://mcp-server:8765/api/tools/classroom/execute \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: tenant-123" \
  -H "X-User-ID: user-456" \
  -d '{
    "operation": "course.list",
    "params": {"teacherId": "me"},
    "correlation_id": "req-789"
  }'
```

**Relations :**
- Appelé par **Chatbot-Core** via MCP protocol (conversations)
- Appelé par **chat.api** via API REST (opérations directes)
- Appelle **n8n webhooks** pour exécuter les opérations
- Ne communique JAMAIS directement avec les services externes

**Pattern BYOT (Bring Your Own Token) :**

```
┌─────────────┐    X-Tenant-ID     ┌─────────────┐
│  chat.api   │ ──────────────────▶│   Azy-MCP   │
│             │    X-User-ID       │             │
└─────────────┘                    └──────┬──────┘
                                          │
                                          │ Récupère OAuth token
                                          │ via tenant/user IDs
                                          ▼
                                   ┌─────────────┐
                                   │     n8n     │
                                   │ (avec token)│
                                   └──────┬──────┘
                                          │
                                          │ Utilise token
                                          ▼
                                   ┌─────────────┐
                                   │ Google APIs │
                                   └─────────────┘

→ Aucun token stocké dans n8n (multi-tenant)
→ Tokens récupérés à la volée via X-Tenant-ID + X-User-ID
```

#### Configuration (variables d'environnement)

| Variable | Description | Défaut |
|----------|-------------|--------|
| `MCP_SERVER_PORT` | Port du serveur | 8765 |
| `N8N_WEBHOOK_URL` | URL de base n8n | http://localhost:5678 |
| `N8N_WEBHOOK_SECRET` | Secret HMAC (optionnel) | - |
| `REDIS_URL` | URL Redis pour cache | - |
| `LOG_LEVEL` | Niveau de log | INFO |

#### Phases du projet

| Phase | Statut | Contenu |
|-------|--------|---------|
| **Phase 1** | ✅ Complété | Core MCP, Protocol Handler, Workflow Manager |
| **Phase 2** | ✅ Complété | Analyzers, Storage, Vector Store, Cache (97% coverage) |
| **Phase 3** | 🔄 À faire | MessagePack protocol, Compression avancée |

#### RFCs implémentés

| RFC | Statut | Description |
|-----|--------|-------------|
| **RFC-040** | ✅ Complété | Training Dataset API (webhooks, callbacks) |
| **RFC-072** | ✅ Complété | LLM Batch Manager (batch processing) |
| **RFC-083** | ✅ Complété | REST API pour exécution directe tools (`/api/tools/{id}/execute`) |

#### Liste des tools enregistrés

| Tool ID | Domain | Webhook n8n | Opérations principales |
|---------|--------|-------------|------------------------|
| `gmail` | Google | `mcp-gmail` | email.list, email.get, email.send, draft.create |
| `calendar` | Google | `mcp-calendar` | event.list, event.get, event.create, calendar.list |
| `drive` | Google | `mcp-drive` | file.list, file.get, file.upload, file.share |
| `contacts` | Google | `mcp-contacts` | contact.list, contact.get, contact.create |
| `classroom` | Google | `mcp-classroom` | course.*, topic.*, coursework.*, expert_program.sync |
| `image_generation` | Media | `mcp-image-gen` | generate, variations, edit |
| `video_analysis` | Media | `mcp-video-analysis` | transcribe, extract_frames, ocr |
| `video_generation` | Media | `mcp-video-gen` | generate, animate |
| `knowledge_graph` | Knowledge | `mcp-knowledge` | query, insert, update, search |

### 2.7 N8N (Workflows)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Moteur de workflows et automatisations |
| **Technologies** | Node.js, n8n |
| **Port** | 5678 |
| **Fonctionnalités** | Webhooks, workflows, intégrations |

```
N8N
├── Webhooks CRUD           → Opérations unitaires (mcp-gmail, mcp-classroom...)
├── Webhooks Orchestration  → Workflows métier (expert-program-sync...)
├── Workflows planifiés     → Tâches récurrentes (sync, cleanup...)
└── Custom Nodes            → Nodes spécialisés (CUSTOM.gmailToolDynamic...)
```

**Webhooks MCP disponibles :**

| Webhook | Service Google | Documentation |
|---------|----------------|---------------|
| `/webhook/mcp-gmail` | Gmail API | - |
| `/webhook/mcp-calendar` | Calendar API | - |
| `/webhook/mcp-drive` | Drive API | - |
| `/webhook/mcp-contacts` | People API | - |
| `/webhook/mcp-classroom` | Classroom API | [MCP_CLASSROOM_INTEGRATION.md](../mcp/MCP_CLASSROOM_INTEGRATION.md) |

**Types de webhooks :**

| Type | Exemple | Usage |
|------|---------|-------|
| **CRUD** | `/webhook/mcp-classroom` | Opérations unitaires (list, get, create...) |
| **Orchestration** | `/webhook/expert-program-classroom-sync` | Workflows métier complexes |

**Relations :**
- Reçoit les requêtes UNIQUEMENT de Azy-MCP
- Appelle les services externes (Google APIs, LLMs, bases de données, etc.)
- Est le SEUL composant à communiquer avec les services externes

---

## 3. Flux de données

### 3.1 Flux Frontend (Web UI) - Opération Google

```
User (Frontend): "Montre mes emails non lus"
    ↓
Frontend (WebSocket)
    ↓
chat.api
    ↓
Azy-MCP (GmailTool.list_emails)
    ↓
n8n (/webhook/mcp-gmail, operation: "email.list")
    ↓
Google Gmail API
    ↓
Réponse avec liste des emails
```

### 3.2 Flux Discord/Plugin - Conversation IA

```
User (Discord): "Bonjour, aide-moi avec mon code"
    ↓
Discord Bot
    ↓
Chatbot-Core (conversation IA)
    ↓
Azy-MCP (si outil nécessaire)
    ↓
n8n (appel LLM via webhook)
    ↓
OpenAI / Anthropic
    ↓
Réponse générée par l'IA
```

### 3.3 Flux Plugin Discord - Opération Google

```
User (Discord @mention): "Crée un événement dans mon calendrier"
    ↓
Plugin Discord (plugin-recipes, plugin-chess)
    ↓
Chatbot-Core (détecte intention = outil Calendar)
    ↓
Azy-MCP (CalendarTool.create_event)
    ↓
n8n (/webhook/mcp-calendar, operation: "event.create")
    ↓
Google Calendar API
    ↓
Confirmation de création
```

### 3.4 Workflow métier complexe (Frontend)

```
Admin (Frontend): "Synchronise le programme expert #123 vers Classroom"
    ↓
Frontend
    ↓
chat.api
    ↓
Azy-MCP (ClassroomTool.sync_program)
    ↓
n8n (/webhook/expert-program-classroom-sync)
    ↓
n8n crée Topics + CourseWorks (appelle mcp-classroom en interne)
    ↓
Google Classroom API
    ↓
Callback avec résultat
```

---

## 4. Responsabilités par équipe

| Équipe | Composants | Responsabilités |
|--------|------------|-----------------|
| **Frontend** | Frontend, Plugin | UI, UX, intégration WebSocket |
| **Backend API** | chat.api | Auth, routing, orchestration, sessions |
| **Chatbot-Core** | Chatbot-Core | Bot Discord, TenantResolver, onboarding, voice realtime, commandes Discord |
| **MCP** | Azy-MCP | Wrappers outils, protocole MCP, API REST |
| **Workflows** | N8N | Webhooks, workflows, custom nodes, résolution tenant |
| **DevOps** | Tous | Déploiement, monitoring, infra |

### 4.1 Détail des responsabilités Chatbot-Core

| Domaine | Services | Description |
|---------|----------|-------------|
| **Multi-tenant** | TenantResolver | Résolution user_id → tenant + package LLM |
| **Discord Commands** | DiscordCommandListener, CommandExecutor | Exécution commandes via Redis Streams |
| **Onboarding** | OnboardingCog, OnboardingRedisService | Parcours onboarding multi-étapes |
| **Voice** | VoiceRealtimeCog, VoiceRealtimeService | Sessions vocales temps réel |
| **Gamification** | BadgeService, LeaderboardService | Badges et classements |
| **Intégrations** | MCPClient, N8nClient | Communication avec services externes |

---

## 5. Ports et endpoints

| Service | Port | Endpoints principaux |
|---------|------|---------------------|
| **Frontend** | 3000 | `/` (SPA) |
| **chat.api** | 8000 | `/ws`, `/api/v1/*` |
| **Chatbot-Core** | - | Redis Streams (voir ci-dessous) |
| **Azy-MCP** | 8765 | Voir détail ci-dessous |
| **N8N** | 5678 | `/webhook/*`, `/healthz` |

### Communication Chatbot-Core (Redis Streams)

| Stream | Direction | Format |
|--------|-----------|--------|
| `discord:commands` | chat.api → Chatbot-Core | Commandes à exécuter |
| `discord:results` | Chatbot-Core → chat.api | Résultats d'exécution |
| `onboarding:session:*` | Chatbot-Core ↔ Redis | Sessions onboarding (TTL 2h) |

**Format discord:commands :**
```json
{
  "request_id": "req-uuid-123",
  "guild_id": "1234567890",
  "action": "get_roles",
  "payload": "{}",
  "timestamp": "2026-05-08T12:00:00Z"
}
```

**Format discord:results :**
```json
{
  "request_id": "req-uuid-123",
  "success": "true",
  "guild_id": "1234567890",
  "data": "{\"roles\": [...]}",
  "timestamp": "2026-05-08T12:00:01Z"
}
```

### Endpoints Azy-MCP (détail)

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/` | GET | Info service (version, phase, status) |
| `/health` | GET | Health check (liveness) + état orchestrator |
| `/stats` | GET | Statistiques d'utilisation |
| `/debug` | GET | Debug info (Phase 2 availability) |
| `/api/tools` | GET | Liste des tools disponibles |
| `/api/tools/{tool_id}` | GET | Informations sur un tool |
| `/api/tools/{tool_id}/execute` | POST | **Exécution directe** (RFC-083) |
| `/api/process` | POST | Traitement de requête avec LLM |
| `/api/batch/*` | - | Endpoints batch processing (RFC-072) |
| `/api/orchestrator/*` | - | Endpoints orchestration multi-étapes |
| MCP stdio/WebSocket | - | Protocole MCP natif (Chatbot-Core) |

**Exemple réponse `/health` :**

```json
{
  "status": "healthy",
  "components": {
    "orchestrator": "ready",
    "template_loader": "connected",
    "agent_manager": "ready"
  },
  "uptime_seconds": 3600
}
```

---

## 6. Environnements

| Environnement | Frontend | chat.api | Azy-MCP | N8N |
|---------------|----------|----------|---------|-----|
| **Local (pi6)** | localhost:3000 | localhost:8000 | localhost:8765 | pi6.local:5678 |
| **Docker (host2)** | - | - | - | host2.local:5678 |
| **Production** | TBD | TBD | TBD | TBD |

---

## 7. Contrats d'interface Azy-MCP

### Format de requête (API REST)

```json
{
  "operation": "resource.action",
  "params": {
    "param1": "value1",
    "param2": "value2"
  },
  "correlation_id": "optional-tracking-id"
}
```

### Format de réponse

```json
{
  "success": true,
  "data": { ... },
  "correlation_id": "req-12345",
  "metadata": {
    "tool_id": "classroom",
    "operation": "course.list",
    "duration_ms": 234
  }
}
```

### Format d'erreur

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Description de l'erreur",
    "details": { ... }
  },
  "correlation_id": "req-12345"
}
```

### Codes d'erreur standardisés

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Paramètres invalides |
| `AUTH_ERROR` | 401 | Token manquant ou invalide |
| `FORBIDDEN` | 403 | Accès non autorisé |
| `NOT_FOUND` | 404 | Ressource non trouvée |
| `TOOL_NOT_FOUND` | 404 | Tool non enregistré |
| `OPERATION_NOT_SUPPORTED` | 400 | Opération non supportée par le tool |
| `N8N_ERROR` | 502 | Erreur du webhook n8n |
| `TIMEOUT` | 504 | Timeout de l'opération |
| `INTERNAL_ERROR` | 500 | Erreur interne |

---

## 8. Références

### Documentation générale
- [Google Services Integration](./GOOGLE-SERVICES-INTEGRATION.md)
- [MCP Classroom Integration](../guides/MCP_CLASSROOM_INTEGRATION.md)
- [Docker Deployment](../../docker/README.md)

### RFCs Chatbot-Core
- [RFC-049 Multi-Tenant Isolation](../rfc/RFC-049-MULTI-TENANT-ISOLATION.md) - TenantResolver
- [RFC-060 Guild Info Sync](../rfc/RFC-060-GUILD-INFO-SYNC.md) - ServerSyncManager, ResyncSubscriber
- [RFC-062 Discord Commands via Redis](../rfc/RFC-062-DISCORD-COMMAND-LISTENER.md) - DiscordCommandListener
- [RFC-067 Gamification](../rfc/RFC-067-GAMIFICATION.md) - Badges & Leaderboards
- [RFC-069 Onboarding Multi-étapes](../rfc/RFC-069-ONBOARDING.md) - OnboardingRedisService
- [RFC-078 Voice Realtime](../rfc/RFC-078-REALTIME-AUDIO-MCP.md) - VoiceRealtimeCog
- [RFC-079 Tenant Package Configuration](../rfc/RFC-079-TENANT-PACKAGE-CONFIG.md) - TenantConfig, PackageModels

### RFCs Azy-MCP
- [RFC-040 Training Dataset API](../rfc/RFC-040-TRAINING-DATASET-API.md) - Génération datasets
- [RFC-072 LLM Batch Manager](../rfc/RFC-072-LLM-BATCH-MANAGER.md) - Batch processing
- [RFC-083 MCP REST API](../rfc/RFC-083-MCP-REST-API.md) - Exécution directe tools

### Guides
- [Guide TenantResolver (RFC-049)](../guides/GUIDE-RFC049-TENANT-RESOLVER.md)
