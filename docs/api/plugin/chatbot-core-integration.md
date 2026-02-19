# API Integration — Documentation chatbot-core & n8n

**Version :** 1.0
**Date :** 2026-02-17
**Base URL :** `https://<api-host>`
**Remplace :** `POST /webhook/plugin-config-get` (workflow n8n obsolete)

---

## Table des matieres

1. [Authentification](#1-authentification)
2. [Plugin Config — Configuration complète](#2-plugin-config)
3. [Prompts API — PromptProvider (optionnel)](#3-prompts-api)
4. [Intégration au démarrage du plugin](#4-integration-au-demarrage)
5. [Cache et invalidation](#5-cache-et-invalidation)
6. [Provisioning via n8n](#6-provisioning-via-n8n)

---

## 1. Authentification

### Service Token (recommandé pour chatbot-core et n8n)

Deux headers requis :

```http
X-Tenant-ID: tenant_Z6F3GSWB
X-Service-Token: st_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

| Header | Description |
|--------|-------------|
| `X-Tenant-ID` | Identifiant du tenant (schema PostgreSQL) |
| `X-Service-Token` | Token de service créé via l'admin API |

**Ordre de priorité du middleware auth :**
1. `X-Service-Token` (service interne) — prioritaire
2. `Authorization: Bearer <jwt>` (utilisateur final) — fallback

### Obtenir un Service Token

Les tokens sont créés par un super-admin via :

```http
POST /api/admin/service-tokens
Authorization: Bearer <admin_jwt>
Content-Type: application/json

{
  "service_name": "chatbot-core",
  "description": "Plugin Discord chatbot-core",
  "scopes": ["plugin-config:read"]
}
```

Le token est retourné une seule fois à la creation. Le stocker dans les variables d'environnement du service.

---

## 2. Plugin Config

Source de vérité pour la configuration complète d'un guild.

### GET /api/guilds/{guild_id}/plugin-config

Récupère la configuration du plugin pour un serveur Discord.

```http
GET /api/guilds/1458159736775119115/plugin-config
X-Tenant-ID: tenant_Z6F3GSWB
X-Service-Token: st_xxxxxxxx
```

**Response 200 :**

```json
{
  "success": true,
  "data": {
    "guild_id": "1458159736775119115",

    "plugin": {
      "name": "recipes",
      "version": "1.0.0"
    },

    "entity": {
      "type": "recipes",
      "collection": "recipes"
    },

    "redis": {
      "prefix": "recipes"
    },

    "qdrant": {
      "collection": "recipes",
      "intent_collection": "intent_history",
      "min_score": 0.75,
      "max_results": 10
    },

    "n8n": {
      "webhook_prefix": "recipes"
    },

    "search": {
      "min_score": 0.75,
      "max_results": 10,
      "auto_fallback_web": true
    },

    "features": {
      "mentions": true,
      "session_continue": true,
      "memory": true,
      "document_processing": false,
      "shopping_cart": false
    },

    "rate_limit": {
      "enabled": true,
      "messages": 5,
      "window_seconds": 60,
      "cooldown_seconds": 30
    },

    "branding": {
      "bot": {
        "name": "Bot Appetit",
        "emoji": "👨‍🍳",
        "color": "#FF6B35",
        "description": "Assistant culinaire intelligent pour Discord"
      },
      "emojis": {
        "success": "✅",
        "error": "❌",
        "warning": "⚠️",
        "search": "🔍",
        "loading": "⏳",
        "recipe": "🍽️",
        "ingredient": "🥕",
        "timer": "⏱️",
        "favorite": "⭐",
        "shopping": "🛒",
        "credits": "💳"
      },
      "footer": {
        "text": "Bot Appetit - Ton assistant culinaire"
      }
    },

    "prompts": {
      "greetings": [
        "Salut ! Je suis **{bot_name}**, ton assistant culinaire.",
        "Bonjour ! Comment puis-je t'aider en cuisine aujourd'hui ?"
      ],
      "empty_mention": "Tu m'as mentionné mais tu n'as rien dit !",
      "out_of_scope": "Je suis **{bot_name}**, spécialisé en cuisine !",
      "errors": {
        "generic": "Oups, je n'ai pas pu traiter ta demande.",
        "rate_limit": "Doucement {user_name} ! Réessaie dans {cooldown}s.",
        "search_failed": "Erreur lors de la recherche.",
        "no_results": "Désolé, je n'ai pas trouvé de résultat pour **{query}**."
      },
      "web_search": {
        "searching": "🔍 Pas de recette pour **{query}** en base, je cherche sur le web...",
        "found": "✅ **{title}** trouvée sur le web !",
        "not_found": "Désolé, je n'ai pas trouvé de recette pour **{query}** sur le web."
      }
    },

    "scope": {
      "can": [
        "proposer des recettes selon les ingrédients ou envies",
        "suggérer des alternatives d'ingrédients",
        "expliquer des techniques culinaires"
      ],
      "cannot": [
        "donner des conseils médicaux ou nutritionnels thérapeutiques",
        "garantir l'absence d'allergènes"
      ],
      "guardrails": [
        "Conseils médicaux et nutritionnels thérapeutiques",
        "Sujets non liés à la cuisine"
      ]
    },

    "keywords": {
      "greetings": ["salut", "bonjour", "hello", "coucou"],
      "help": ["aide", "help", "comment", "commandes"],
      "search": ["recette", "cherche", "trouve", "propose"],
      "out_of_scope": ["politique", "actualité", "météo", "sport"]
    },

    "settings": {
      "default_language": "fr",
      "default_servings": 4
    },

    "created_at": "2026-02-17T10:00:00Z",
    "updated_at": "2026-02-17T10:00:00Z"
  }
}
```

**Response 404 (guild non configuré) :**

```json
{
  "success": false,
  "error": {
    "code": "PLUGIN_CONFIG_NOT_FOUND",
    "message": "Aucune configuration plugin pour le guild 1458159736775119115"
  }
}
```

### Mapping des sections vers chatbot-core

| Section | Usage dans chatbot-core |
|---------|------------------------|
| `entity.type` | Type d'entité métier |
| `entity.collection` | Collection Qdrant principale |
| `redis.prefix` | Préfixe pour isoler les clés Redis par guild |
| `qdrant.*` | Passé à `SearchService` |
| `n8n.webhook_prefix` | Préfixe des webhooks n8n : `{prefix}-youtube`, `{prefix}-generate` |
| `features.*` | Feature flags (mentions, mémoire, etc.) |
| `rate_limit.*` | Configuration du rate limiter |
| `branding.bot.*` | Identité du bot (nom, emoji, couleur) pour les embeds |
| `branding.emojis.*` | Emojis contextuels pour les messages du bot |
| `branding.footer.*` | Pied de page des embeds |
| `prompts.*` | Textes des messages (greetings, errors, etc.) |
| `scope.*` | Périmètre LLM (can/cannot/guardrails) |
| `keywords.*` | Mots-clés pour la détection d'intention locale |
| `settings.*` | Paramètres métier (langue, portions, etc.) |

---

## 3. Prompts API

**Optionnel.** Si chatbot-core utilise `PromptProvider` pour externaliser les prompts.

Les prompts stockés dans `plugin_configs.config.prompts` sont la source de vérité par défaut. L'API Prompts ci-dessous offre un systeme d'overrides plus granulaire avec defaults dans le code et overrides par guild/langue.

### GET /api/guilds/{guild_id}/prompts

```http
GET /api/guilds/1458159736775119115/prompts?category=messages&language=fr
X-Tenant-ID: tenant_Z6F3GSWB
X-Service-Token: st_xxxxxxxx
```

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `category` | string | — | Filtrer par catégorie (`messages`, `scope`, `learning`, `labels`) |
| `language` | string | `fr` | Langue des overrides |
| `layer` | string | — | Filtrer par couche (`core`, `plugin`) |

**Response 200 :**

```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "id": "messages",
        "label": "Messages plugin",
        "layer": "plugin",
        "fields": [
          {
            "key": "errors.rate_limit",
            "category": "messages",
            "label": "Message rate limit",
            "field_type": "text",
            "variables": ["{user_name}", "{cooldown}"],
            "required": false,
            "default_value": "Doucement {user_name} ! Réessaie dans {cooldown}s.",
            "current_value": null
          }
        ]
      }
    ]
  }
}
```

> `current_value: null` signifie que le guild utilise `default_value`.

### PUT /api/guilds/{guild_id}/prompts

```http
PUT /api/guilds/1458159736775119115/prompts
X-Tenant-ID: tenant_Z6F3GSWB
X-Service-Token: st_xxxxxxxx
Content-Type: application/json

{
  "category": "messages",
  "key": "errors.rate_limit",
  "value": "Patientez {cooldown}s, {user_name}.",
  "language": "fr"
}
```

**Response 200 :**
```json
{
  "success": true,
  "message": "Prompt mis à jour",
  "data": {
    "category": "messages",
    "key": "errors.rate_limit",
    "value": "Patientez {cooldown}s, {user_name}.",
    "language": "fr"
  }
}
```

---

## 4. Integration au demarrage du plugin

### Séquence de démarrage recommandée

```
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│  Plugin Discord   │        │       API         │        │    PostgreSQL     │
│  (chatbot-core)   │        │   (chat.api)      │        │  (tenant schema)  │
└────────┬─────────┘        └────────┬─────────┘        └────────┬─────────┘
         │                           │                           │
         │  GET /plugin-config       │                           │
         │  X-Tenant-ID + Token      │                           │
         │──────────────────────────►│                           │
         │                           │  SELECT config            │
         │                           │  FROM plugin_configs      │
         │                           │  WHERE guild_id = ?       │
         │                           │──────────────────────────►│
         │                           │◄──────────────────────────│
         │  200 { success, data }    │                           │
         │◄──────────────────────────│                           │
         │                           │                           │
         │  Initialiser services     │                           │
         │  avec la config reçue     │                           │
         └───────────────────────────┘                           │
```

### Exemple TypeScript (chatbot-core)

```typescript
interface PluginConfig {
  guild_id: string;
  plugin: { name: string; version: string };
  entity: { type: string; collection: string };
  redis: { prefix: string };
  qdrant: { collection: string; min_score: number; max_results: number };
  features: { mentions: boolean; memory: boolean; session_continue: boolean };
  branding: {
    bot: { name: string; emoji: string; color: string };
    emojis: Record<string, string>;
    footer: { text: string };
  };
  prompts: Record<string, any>;
  scope: { can: string[]; cannot: string[]; guardrails: string[] };
  keywords: Record<string, string[]>;
  settings: Record<string, any>;
}

async function loadGuildConfig(guildId: string): Promise<PluginConfig> {
  const response = await fetch(
    `${API_BASE_URL}/api/guilds/${guildId}/plugin-config`,
    {
      headers: {
        'X-Tenant-ID': process.env.TENANT_ID,
        'X-Service-Token': process.env.SERVICE_TOKEN,
      },
    }
  );

  const json = await response.json();

  if (!json.success) {
    throw new Error(`Config not found for guild ${guildId}: ${json.error?.message}`);
  }

  return json.data;
}
```

### Rechargement à chaud

Le plugin supporte `/reload-config` qui rappelle l'API :

```
Admin: /reload-config
Bot: ✅ Configuration rechargée avec succès !
     - entity_type: recipes
     - webhook_prefix: recipes
     - bot_name: Bot Appetit
```

---

## 5. Cache et invalidation

### Côté API

| Clé Redis | TTL | Invalidé par |
|-----------|-----|-------------|
| `branding:{guild_id}:default` | 1h | PUT/PATCH/DELETE branding |
| `branding:{guild_id}:resolve:{channel_id}` | 1h | Modification rooms/channels |
| `prompts:{guild_id}:all` | 1h | PUT/DELETE prompts |

### Côté chatbot-core

Recommandation : mettre en cache la config en mémoire avec un TTL configurable (ex: 5 min). Utiliser `/reload-config` pour forcer le rafraîchissement.

```typescript
// Cache local avec TTL
const configCache = new Map<string, { config: PluginConfig; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getConfig(guildId: string): Promise<PluginConfig> {
  const cached = configCache.get(guildId);
  if (cached && cached.expiry > Date.now()) {
    return cached.config;
  }

  const config = await loadGuildConfig(guildId);
  configCache.set(guildId, { config, expiry: Date.now() + CACHE_TTL_MS });
  return config;
}

// Appelé par /reload-config
function invalidateConfig(guildId: string): void {
  configCache.delete(guildId);
}
```

---

## 6. Provisioning via n8n

n8n peut créer/mettre à jour la config d'un guild lors du provisioning d'un nouveau serveur Discord.

### PUT /api/guilds/{guild_id}/plugin-config

```http
PUT /api/guilds/1458159736775119115/plugin-config
X-Tenant-ID: tenant_Z6F3GSWB
X-Service-Token: st_xxxxxxxx
Content-Type: application/json

{
  "entity": {
    "type": "recipes",
    "collection": "recipes"
  },
  "plugin": {
    "name": "recipes",
    "version": "1.0.0"
  },
  "redis": {
    "prefix": "recipes"
  },
  "qdrant": {
    "collection": "recipes",
    "intent_collection": "intent_history",
    "min_score": 0.75,
    "max_results": 10
  },
  "n8n": {
    "webhook_prefix": "recipes"
  },
  "features": {
    "mentions": true,
    "session_continue": true,
    "memory": true
  },
  "branding": {
    "bot": {
      "name": "Bot Appetit",
      "emoji": "👨‍🍳",
      "color": "#FF6B35"
    }
  }
}
```

> Le champ `entity` est obligatoire. Tous les autres sont optionnels — les valeurs `null` sont omises du JSONB.

**Response 200 :**

```json
{
  "success": true,
  "message": "Configuration plugin mise à jour",
  "data": {
    "guild_id": "1458159736775119115",
    "updated_at": "2026-02-17T10:05:00Z"
  }
}
```

### Workflow n8n suggéré

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Trigger         │     │  HTTP Request    │     │  Notification    │
│  (nouveau guild) │ ──► │  PUT /api/guilds │ ──► │  (Slack/Discord) │
│                  │     │  /{gid}/plugin-  │     │  "Config créée"  │
│                  │     │  config          │     │                  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

---

## Configuration de référence complète

Voir [`plugin-config-example.yaml`](./plugin-config-example.yaml) pour un exemple YAML commenté de toutes les sections disponibles.

### Sections obligatoires

| Section | Champs requis |
|---------|---------------|
| `entity` | `type`, `collection` |

### Sections optionnelles (avec defaults)

| Section | Description |
|---------|-------------|
| `plugin` | Identification (name, version) |
| `redis` | Préfixe des clés Redis |
| `qdrant` | Configuration recherche vectorielle |
| `n8n` | Préfixe webhooks |
| `search` | Paramètres de recherche |
| `features` | Feature flags |
| `rate_limit` | Rate limiting |
| `branding` | Identité visuelle du bot |
| `prompts` | Textes des messages |
| `scope` | Périmètre LLM |
| `keywords` | Mots-clés détection d'intention |
| `settings` | Paramètres métier |
