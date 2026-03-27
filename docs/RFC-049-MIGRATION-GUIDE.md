# Guide de Migration RFC-049 : Entity Storage Architecture

**Date:** 2026-03-27
**Version:** 1.0
**Audiences:** Equipes chatbot-core, plugin, API Backend

---

## Résumé

RFC-049 introduit une nouvelle architecture de stockage des entités qui unifie:
- **MongoDB** pour les données structurées (recettes, documents, cours...)
- **PostgreSQL** pour les données relationnelles (ratings, comments)
- **Qdrant** pour la recherche vectorielle

Les nouveaux webhooks remplacent les anciens webhooks Qdrant-only.

---

## Tableau de correspondance

| Ancien webhook | Nouveau webhook | Changements |
|----------------|-----------------|-------------|
| `MCP Qdrant - Save` | **MCP - Entity - Save** | + Sauvegarde MongoDB via API<br>+ tenant_id obligatoire (header)<br>+ Même UUID pour entity_id et qdrant_point_id |
| `MCP Qdrant - Search` | **MCP - Entity - Search** | + Enrichissement depuis MongoDB<br>+ Filtrage tenant_id obligatoire<br>+ Endpoint batch pour performance |
| *(nouveau)* | **MCP - Entity - Rating** | Notes 1-5 stockées en PostgreSQL |
| *(nouveau)* | **MCP - Entity - Comment** | Commentaires stockés en PostgreSQL |
| *(nouveau)* | **MCP - Tenant - Resolve** | Résout Discord user_id → tenant_id |

---

## Nouveaux Endpoints

### MCP - Entity - Save

**URL:** `POST /webhook/entity-save`

**Headers requis:**
```
X-Tenant-ID: {tenant_id}
```

**Payload:**
```json
{
  "action": "save|update|delete",
  "entity_type": "recipe|document|course|quiz|flashcard",
  "entity_id": "uuid (requis pour update/delete)",
  "data": {
    "title": "Fraisier Vegan",
    "description": "...",
    "tags": ["vegan", "dessert"],
    "ingredients": [...],
    "steps": [...]
  },
  "user_id": "636639897767378954",
  "guild_id": "123456789",
  "qdrant_host": "host3.local",
  "qdrant_port": 20001,
  "qdrant_collection": "recipes",
  "api_key": "xxx",
  "openai_api_key": "sk-xxx"
}
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    "entity_id": "5606c365-b2c0-47d2-b8de-436c268e7895",
    "qdrant_point_id": "5606c365-b2c0-47d2-b8de-436c268e7895",
    "entity_type": "recipe",
    "saved_in_db": true,
    "saved_in_qdrant": true
  },
  "_trace": {
    "service_response": { "api": {...}, "qdrant": {...} },
    "provider": "api+qdrant",
    "latency_ms": 342
  }
}
```

---

### MCP - Entity - Search

**URL:** `POST /webhook/entity-search`

**Headers requis:**
```
X-Tenant-ID: {tenant_id}
```

**Payload:**
```json
{
  "action": "search|similar",
  "query": "recette vegan dessert",
  "entity_id": "uuid (pour action=similar)",
  "entity_type": "recipe",
  "limit": 10,
  "enrich": true,
  "fields": ["title", "ingredients", "tags"],
  "user_id": "636639897767378954",
  "guild_id": "123456789",
  "qdrant_host": "host3.local",
  "qdrant_port": 20001,
  "qdrant_collection": "recipes",
  "api_key": "xxx",
  "openai_api_key": "sk-xxx"
}
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "entity_id": "5606c365-...",
        "score": 0.89,
        "entity": {
          "title": "Fraisier Vegan",
          "ingredients": [...],
          "tags": ["vegan", "dessert"]
        }
      }
    ],
    "total": 5
  },
  "_trace": {...}
}
```

---

### MCP - Entity - Rating

**URL:** `POST /webhook/entity-rating`

**Payload:**
```json
{
  "action": "rate|get|delete",
  "entity_id": "5606c365-...",
  "entity_type": "recipe",
  "user_id": "636639897767378954",
  "guild_id": "123456789",
  "rating": 4
}
```

**Réponse (action=rate):**
```json
{
  "success": true,
  "data": {
    "entity_id": "5606c365-...",
    "rating": 4,
    "new_average": 4.2,
    "total_ratings": 15
  }
}
```

---

### MCP - Entity - Comment

**URL:** `POST /webhook/entity-comment`

**Payload:**
```json
{
  "action": "comment|list|edit|delete",
  "entity_id": "5606c365-...",
  "entity_type": "recipe",
  "user_id": "636639897767378954",
  "guild_id": "123456789",
  "content": "Excellente recette !",
  "comment_id": "uuid (pour edit/delete)",
  "parent_id": "uuid (pour réponses)"
}
```

---

### MCP - Tenant - Resolve

**URL:** `POST /webhook/tenant-resolve`

**Payload:**
```json
{
  "user_id": "636639897767378954",
  "guild_id": "123456789"
}
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    "tenant_id": "Z6F3GSWB",
    "user_id": "636639897767378954",
    "subscription_status": "active"
  }
}
```

---

## Changements clés

### 1. tenant_id obligatoire

Le `tenant_id` est maintenant **obligatoire** pour toutes les opérations. Il est passé via le header `X-Tenant-ID`.

**Workflow d'obtention du tenant_id:**
```
chatbot-core/plugin
    │
    ├── Connait le user_id Discord
    │
    ▼
MCP - Tenant - Resolve
    │
    ├── Résout user_id → tenant_id
    │
    ▼
MCP - Entity - Save/Search
    │
    └── Header X-Tenant-ID: {tenant_id}
```

### 2. Même UUID partout

L'`entity_id` (MongoDB) et le `qdrant_point_id` (Qdrant) sont **identiques**. Plus besoin de mapping.

```
MongoDB: { _id: "5606c365-..." }
                    ↕ même UUID
Qdrant:  { id: "5606c365-..." }
```

### 3. Isolation multi-tenant Qdrant

Qdrant est une instance partagée. Le filtrage par `tenant_id` est **automatique** dans les nouveaux webhooks:

```json
{
  "filter": {
    "must": [
      { "key": "tenant_id", "match": { "value": "Z6F3GSWB" } }
    ]
  }
}
```

### 4. Enrichissement batch

Pour éviter N appels séquentiels lors d'un Search, l'API Backend expose un endpoint batch:

```
POST /api/n8n/entities/{type}/batch
Body: { "ids": ["uuid1", "uuid2", ...], "fields": ["title", "ingredients"] }
```

---

## Migration depuis chatbot-core

### Avant (MCP Qdrant - Save)

```python
response = call_webhook("mcp-qdrant-save", {
    "content": "Fraisier Vegan...",
    "metadata": {"title": "Fraisier", "tags": ["vegan"]},
    "qdrant_host": "host3.local",
    "qdrant_port": 20001,
    "qdrant_collection": "recipes",
    "api_key": QDRANT_API_KEY
})
```

### Après (MCP - Entity - Save)

```python
# 1. Résoudre le tenant_id (une fois par session)
tenant = call_webhook("mcp-tenant-resolve", {
    "user_id": discord_user_id
})
tenant_id = tenant["data"]["tenant_id"]

# 2. Sauvegarder avec le nouveau webhook
response = call_webhook("mcp-entity-save", {
    "action": "save",
    "entity_type": "recipe",
    "data": {
        "title": "Fraisier Vegan",
        "description": "...",
        "tags": ["vegan", "dessert"],
        "ingredients": [...],
        "steps": [...]
    },
    "user_id": discord_user_id,
    "guild_id": guild_id,
    "qdrant_host": "host3.local",
    "qdrant_port": 20001,
    "qdrant_collection": "recipes",
    "api_key": QDRANT_API_KEY,
    "openai_api_key": OPENAI_API_KEY
}, headers={"X-Tenant-ID": tenant_id})
```

---

## Prérequis API Backend

Les nouveaux webhooks appellent l'API Backend. Ces endpoints doivent être disponibles:

| Endpoint | Status |
|----------|--------|
| `GET /api/n8n/tenants/resolve` | A implémenter |
| `POST /api/n8n/entities/{type}` | A implémenter |
| `GET /api/n8n/entities/{type}/{id}` | A implémenter |
| `PUT /api/n8n/entities/{type}/{id}` | A implémenter |
| `DELETE /api/n8n/entities/{type}/{id}` | A implémenter |
| `POST /api/n8n/entities/{type}/batch` | A implémenter |
| `POST /api/n8n/entities/{type}/{id}/rate` | A implémenter |
| `POST /api/n8n/entities/{type}/{id}/comment` | A implémenter |
| `GET /api/n8n/entities/{type}/{id}/comments` | A implémenter |

Voir [RFC-049](./rfc/RFC-049-ENTITY-STORAGE-ARCHITECTURE.md) pour les spécifications complètes.

---

## Cohabitation

Les anciens webhooks `MCP Qdrant - Save` et `MCP Qdrant - Search` restent fonctionnels pendant la période de transition. Ils seront dépréciés une fois la migration complète.

| Webhook | Status |
|---------|--------|
| MCP Qdrant - Save | **Deprecated** - utiliser MCP - Entity - Save |
| MCP Qdrant - Search | **Deprecated** - utiliser MCP - Entity - Search |
| MCP - Entity - Save | **Actif** |
| MCP - Entity - Search | **Actif** |
| MCP - Entity - Rating | **Actif** |
| MCP - Entity - Comment | **Actif** |
| MCP - Tenant - Resolve | **Actif** |

---

## Questions fréquentes

### Q: Dois-je migrer immédiatement ?

Non. Les anciens webhooks continuent de fonctionner. Migrez quand vous êtes prêts.

### Q: Que se passe-t-il si l'API Backend est down ?

Le webhook retourne `partial: true` avec les détails de ce qui a réussi/échoué:
```json
{
  "success": true,
  "partial": true,
  "saved_in_db": false,
  "saved_in_qdrant": true,
  "errors": ["API timeout"]
}
```

### Q: Comment obtenir le tenant_id ?

Appelez `MCP - Tenant - Resolve` avec le `user_id` Discord. Cachez le résultat par session utilisateur.

### Q: Les embeddings sont-ils recalculés ?

Par défaut oui. Vous pouvez passer un embedding pré-calculé via le champ `embedding` pour éviter l'appel OpenAI.

---

## Contact

- **RFC complète:** [RFC-049-ENTITY-STORAGE-ARCHITECTURE.md](./rfc/RFC-049-ENTITY-STORAGE-ARCHITECTURE.md)
- **Plan d'implémentation:** [ISSUE-014-RFC049-IMPLEMENTATION-PLAN.md](./issues/ISSUE-014-RFC049-IMPLEMENTATION-PLAN.md)
