# Plugin Config — Endpoint API

**Date :** 2026-02-17
**Ref :** `docs/api/plugin/README.md`

---

## Vue d'ensemble

Endpoints CRUD pour gerer la configuration des plugins Discord par guild.
La table `plugin_configs` est dans le **schema tenant** (pas public).

Le plugin Discord recupere sa config via un webhook n8n (`POST /webhook/plugin-config-get`)
qui query cette table. L'API backend fournit les endpoints pour le dashboard admin.

---

## Endpoints

### 1. GET /api/guilds/{guild_id}/plugin-config

Recupere la configuration plugin d'un guild.

**Auth :** Bearer token (Firebase) ou Service token scope `branding:read`

**Reponse succes (200) :**
```json
{
  "success": true,
  "data": {
    "guild_id": "1458159736775119115",
    "plugin": {
      "name": "recipes",
      "version": "1.0.0",
      "description": "Plugin de recettes de cuisine"
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
        "emoji": "\ud83d\udc68\u200d\ud83c\udf73",
        "color": "#FF6B35",
        "description": "Assistant culinaire intelligent pour Discord"
      },
      "emojis": {
        "success": "\u2705",
        "error": "\u274c",
        "warning": "\u26a0\ufe0f",
        "search": "\ud83d\udd0d",
        "loading": "\u23f3"
      },
      "footer": {
        "text": "Bot Appetit - Ton assistant culinaire"
      }
    },
    "keywords": {
      "greetings": ["salut", "bonjour", "hello", "coucou"],
      "help": ["aide", "help", "comment"],
      "search": ["recette", "cherche", "trouve"],
      "out_of_scope": ["politique", "actualite", "meteo"]
    },
    "prompts": {
      "greetings": [
        "Salut ! Je suis **{bot_name}**, ton assistant culinaire. Tape `/help` pour voir ce que je sais faire !"
      ],
      "empty_mention": "Tu m'as mentionne mais tu n'as rien dit !",
      "out_of_scope": "Je suis specialise en cuisine...",
      "errors": {
        "generic": "Oups, je n'ai pas pu traiter ta demande.",
        "rate_limit": "Doucement {user_name} ! Reessaie dans {cooldown}s.",
        "no_results": "Desole, je n'ai pas trouve de resultat pour **{query}**."
      }
    },
    "scope": {
      "can": [
        "proposer des recettes selon les ingredients ou envies",
        "suggerer des alternatives d'ingredients"
      ],
      "cannot": [
        "donner des conseils medicaux ou nutritionnels therapeutiques",
        "repondre a des questions sans rapport avec la cuisine"
      ],
      "guardrails": [
        "Conseils medicaux et nutritionnels therapeutiques",
        "Sujets non lies a la cuisine"
      ]
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

**Reponse erreur (404) :**
```json
{
  "success": false,
  "error": {
    "code": "PLUGIN_CONFIG_NOT_FOUND",
    "message": "Aucune configuration plugin pour le guild 1458159736775119115"
  }
}
```

---

### 2. PUT /api/guilds/{guild_id}/plugin-config

Cree ou remplace entierement la configuration plugin d'un guild.

**Auth :** Bearer token (Firebase) ou Service token scope `branding:write`

**Payload (body) :**
```json
{
  "plugin": {
    "name": "recipes",
    "version": "1.0.0",
    "description": "Plugin de recettes de cuisine"
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
      "emoji": "\ud83d\udc68\u200d\ud83c\udf73",
      "color": "#FF6B35"
    }
  },
  "keywords": {
    "greetings": ["salut", "bonjour"],
    "help": ["aide", "help"]
  },
  "prompts": {
    "greetings": ["Salut ! Je suis **{bot_name}**..."],
    "out_of_scope": "Je suis specialise en cuisine..."
  },
  "scope": {
    "can": ["proposer des recettes"],
    "cannot": ["donner des conseils medicaux"]
  },
  "settings": {
    "default_language": "fr"
  }
}
```

**Champs obligatoires :** `entity.type`, `entity.collection`

**Reponse (200) :**
```json
{
  "success": true,
  "message": "Configuration plugin mise a jour",
  "data": {
    "guild_id": "1458159736775119115",
    "updated_at": "2026-02-17T10:00:00Z"
  }
}
```

---

### 3. DELETE /api/guilds/{guild_id}/plugin-config

Supprime la configuration plugin d'un guild.

**Auth :** Bearer token (Firebase) ou Service token scope `branding:delete`

**Reponse (200) :**
```json
{
  "success": true,
  "message": "Configuration plugin supprimee"
}
```

**Reponse erreur (404) :**
```json
{
  "success": false,
  "error": {
    "code": "PLUGIN_CONFIG_NOT_FOUND",
    "message": "Aucune configuration plugin pour le guild 1458159736775119115"
  }
}
```

---

## Table PostgreSQL

**Schema :** tenant (ex: `"Z6F3GSWB"`)

```sql
CREATE TABLE "{schema}".plugin_configs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id    VARCHAR(30) NOT NULL,
    config      JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_plugin_configs_guild_id UNIQUE (guild_id)
);

CREATE INDEX ix_{schema}_plugin_configs_guild_id ON "{schema}".plugin_configs(guild_id);
```

---

## Recapitulatif webhooks n8n

| Webhook n8n | Methode | Endpoint API | Scope |
|---|---|---|---|
| plugin-config-get | GET | `/api/guilds/{guild_id}/plugin-config` | branding:read |
| plugin-config-update | PUT | `/api/guilds/{guild_id}/plugin-config` | branding:write |
