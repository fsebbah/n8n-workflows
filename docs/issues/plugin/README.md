# Plugin Config API

## Vue d'ensemble

Configuration externalisée du plugin Discord, stockée en PostgreSQL (JSONB) et exposée via l'API REST.

> **Tout transit par n8n.** chatbot-core appelle les webhooks n8n, n8n appelle l'API backend.

## Documentation

| Audience | Document |
|----------|----------|
| **n8n** (webhooks → API) | [`chatbot-core-integration.md`](./chatbot-core-integration.md) |
| **Front-end** (accès direct API) | [`../fr/endpoints/branding-prompts-plugin.md`](../fr/endpoints/branding-prompts-plugin.md) |
| **Analyse & plan** | [`../../plans/2026-02-17-plugin-config-analysis.md`](../../plans/2026-02-17-plugin-config-analysis.md) |
| **Exemple YAML** | [`plugin-config-example.yaml`](./plugin-config-example.yaml) |

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Plugin Discord │ ──► │  n8n             │ ──► │  API REST        │ ──► │  PostgreSQL     │
│  (chatbot-core) │     │  Webhooks        │     │  /api/guilds/    │     │  plugin_configs  │
│                 │     │  plugin-config-* │     │  {gid}/plugin-   │     │  (JSONB)         │
│                 │     │                  │     │  config          │     │                  │
└─────────────────┘     └──────────────────┘     └──────────────────┘     └─────────────────┘
```

**Flux :**
1. **chatbot-core** appelle le webhook n8n (`POST /webhook/plugin-config-get`)
2. **n8n** appelle l'API backend (`GET /api/guilds/{guild_id}/plugin-config`) avec `X-Tenant-ID` + `X-Service-Token`
3. **n8n** retourne la réponse à chatbot-core

## Webhooks n8n

### Lecture : `POST /webhook/plugin-config-get`

chatbot-core envoie :
```json
{ "guild_id": "1458159736775119115" }
```

n8n appelle en interne :
```http
GET /api/guilds/1458159736775119115/plugin-config
X-Tenant-ID: tenant_Z6F3GSWB
X-Service-Token: st_xxxxxxxx
```

n8n retourne la réponse telle quelle à chatbot-core.

### Ecriture : `POST /webhook/plugin-config-update`

n8n appelle en interne :
```http
PUT /api/guilds/{guild_id}/plugin-config
X-Tenant-ID: tenant_Z6F3GSWB
X-Service-Token: st_xxxxxxxx
Content-Type: application/json

{ "entity": { ... }, "redis": { ... }, ... }
```

## Endpoints API backend (appelés par n8n)

| Méthode | Endpoint | Usage |
|---------|----------|-------|
| `GET` | `/api/guilds/{guild_id}/plugin-config` | Lecture config |
| `PUT` | `/api/guilds/{guild_id}/plugin-config` | Création / mise à jour |
| `DELETE` | `/api/guilds/{guild_id}/plugin-config` | Suppression |

## Réponse type

```json
{
  "success": true,
  "data": {
    "guild_id": "1458159736775119115",
    "plugin": { "name": "recipes", "version": "1.0.0" },
    "entity": { "type": "recipes", "collection": "recipes" },
    "redis": { "prefix": "recipes" },
    "qdrant": { "collection": "recipes", "min_score": 0.75, "max_results": 10 },
    "n8n": { "webhook_prefix": "recipes" },
    "features": { "mentions": true, "memory": true },
    "branding": { "bot": { "name": "Bot Appetit", "emoji": "👨‍🍳", "color": "#FF6B35" } },
    "prompts": { "greetings": ["Salut !"], "errors": { "generic": "Oups !" } },
    "scope": { "can": ["proposer des recettes"], "cannot": ["conseils médicaux"] },
    "keywords": { "greetings": ["salut", "bonjour"], "search": ["recette"] },
    "settings": { "default_language": "fr" },
    "created_at": "2026-02-17T10:00:00Z",
    "updated_at": "2026-02-17T10:00:00Z"
  }
}
```

## Exemple complet

Voir [`plugin-config-example.yaml`](./plugin-config-example.yaml) pour toutes les sections commentées.

## Rechargement à chaud

chatbot-core appelle le webhook n8n pour recharger la config sans redémarrer :

```
Admin: /reload-config
Bot: ✅ Configuration rechargée avec succès !
     - entity_type: recipes
     - webhook_prefix: recipes
     - bot_name: Bot Appetit
```
