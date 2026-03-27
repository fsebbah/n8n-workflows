# RFC-049: Architecture de stockage des entités (DB + Vector)

**Date:** 2026-03-27
**Status:** Draft
**Auteur:** Équipe n8n
**Équipes concernées:** API, chatbot-core, plugin, n8n

---

## Résumé

Actuellement, les webhooks `MCP Qdrant - Save` et `MCP Qdrant - Search` ne gèrent que la partie vectorielle (Qdrant). Les données structurées (recettes, documents, etc.) doivent aussi être persistées en base relationnelle (PostgreSQL).

Cette RFC propose de fusionner les responsabilités dans des webhooks unifiés.

---

## Problème actuel

### Flux actuel (incomplet)

```
Caller (chatbot-core/plugin)
    │
    ├── MCP Qdrant - Save
    │   └── Sauvegarde UNIQUEMENT dans Qdrant
    │   └── ❌ Pas de sauvegarde en PostgreSQL
    │
    └── MCP Qdrant - Search
        └── Recherche UNIQUEMENT dans Qdrant
        └── ❌ Pas d'enrichissement depuis PostgreSQL
```

### Conséquences

1. **Données perdues** : Les entités ne sont pas persistées en DB
2. **Pas de CRUD complet** : Impossible de lister, modifier, supprimer via API
3. **Incohérence** : `qdrant_point_id` existe mais pas de lien avec `entity_id` en DB

---

## Solution proposée

### Nouveaux webhooks unifiés

| Ancien nom | Nouveau nom | Responsabilités |
|------------|-------------|-----------------|
| MCP Qdrant - Save | **MCP - Entity - Save** | DB + Qdrant |
| MCP Qdrant - Search | **MCP - Entity - Search** | Qdrant + enrichissement DB |

### Flux proposé : MCP - Entity - Save

```
Caller
    │
    ▼
MCP - Entity - Save
    │
    ├── 1. Validate Input
    │
    ├── 2. Save to API (PostgreSQL)  ─────────────────┐
    │   POST /api/entities/{entity_type}              │
    │   Body: { data, user_id, guild_id, ... }        │  Parallèle
    │   Response: { id: entity_id, ... }              │
    │                                                  │
    ├── 3. Generate Embedding (OpenAI)  ──────────────┤
    │   POST /v1/embeddings                           │
    │   Response: { embedding: [...] }                │
    │                                                  │
    └── 4. Store in Qdrant  ──────────────────────────┘
        PUT /collections/{collection}/points
        Body: {
          id: entity_id,  // ← Même ID que PostgreSQL
          vector: embedding,
          payload: { title, tags, ... }
        }
    │
    ▼
Response unifiée
{
  "success": true,
  "data": {
    "entity_id": "uuid",       // ID PostgreSQL
    "qdrant_point_id": "uuid", // = entity_id (même ID)
    "saved_in_db": true,
    "saved_in_qdrant": true
  }
}
```

### Flux proposé : MCP - Entity - Search

```
Caller
    │
    ▼
MCP - Entity - Search
    │
    ├── 1. Validate Input
    │
    ├── 2. Generate Query Embedding (OpenAI)
    │
    ├── 3. Search in Qdrant
    │   Response: [{ id, score, payload }, ...]
    │
    ├── 4. Enrich from API (optionnel)
    │   GET /api/entities/{entity_type}/{id}
    │   Response: { full entity data }
    │
    └── 5. Merge & Format
    │
    ▼
Response
{
  "success": true,
  "data": {
    "results": [
      {
        "entity_id": "uuid",
        "score": 0.89,
        "entity": { /* données complètes depuis DB */ }
      }
    ]
  }
}
```

---

## Décisions à prendre

### 1. Identifiants

**Option 1A : Même ID partout (recommandé)**
```
entity_id = qdrant_point_id = UUID généré par l'API
```
- Avantage : Cohérence, pas de mapping à maintenir
- Inconvénient : Nécessite que l'API génère l'ID en premier

**Option 1B : IDs séparés avec mapping**
```
entity_id = UUID API
qdrant_point_id = UUID Qdrant
Mapping stocké en DB: entities.qdrant_point_id
```
- Avantage : Indépendance des systèmes
- Inconvénient : Complexité, risque de désynchronisation

**Question pour l'équipe API :** L'API peut-elle générer l'UUID avant insertion et le retourner immédiatement ?

---

### 2. Gestion des échecs partiels

**Scénario : API OK, Qdrant KO**
```json
{
  "success": true,
  "partial": true,
  "saved_in_db": true,
  "saved_in_qdrant": false,
  "errors": ["Qdrant timeout"],
  "retry_token": "xxx"  // Pour retry Qdrant plus tard
}
```

**Scénario : API KO, Qdrant OK**
```json
{
  "success": false,
  "saved_in_db": false,
  "saved_in_qdrant": true,
  "errors": ["API unavailable"],
  "orphan_qdrant_id": "uuid"  // À nettoyer
}
```

**Question pour les équipes :** Comment gérer les orphelins Qdrant ? Job de nettoyage ?

---

### 3. Enrichissement au Search

**Option 3A : Toujours enrichir depuis DB**
- Avantage : Données toujours à jour
- Inconvénient : Latence supplémentaire, N appels API

**Option 3B : Payload Qdrant suffisant**
- Stocker les champs essentiels dans le payload Qdrant
- Enrichir uniquement si `enrich: true` dans la requête
- Avantage : Performance
- Inconvénient : Données potentiellement stale

**Option 3C : Hybride (recommandé)**
- Payload Qdrant contient : `title`, `description`, `tags`, `difficulty`, `prep_time`
- Enrichissement DB pour : `ingredients`, `steps`, `full_content`
- Paramètre `fields: ["ingredients", "steps"]` pour demander l'enrichissement

**Question pour chatbot-core/plugin :** Quels champs sont nécessaires à l'affichage immédiat vs au détail ?

---

### 4. Impact sur les callers

#### chatbot-core

```python
# Avant
response = call_webhook("mcp-qdrant-save", payload)

# Après
response = call_webhook("mcp-entity-save", payload)
# Payload identique, response enrichie
```

#### plugin

```python
# Avant
results = call_webhook("mcp-qdrant-search", {"query": "..."})

# Après
results = call_webhook("mcp-entity-search", {
    "query": "...",
    "enrich": True,  # Nouveau paramètre
    "fields": ["ingredients", "steps"]  # Optionnel
})
```

---

## InputSchema proposé

### MCP - Entity - Save

```json
{
  "required": ["entity_type", "data"],
  "properties": {
    "entity_type": {
      "type": "string",
      "enum": ["recipes", "documents", "courses"],
      "description": "Type d'entité"
    },
    "data": {
      "type": "object",
      "description": "Données de l'entité"
    },
    "user_id": {
      "type": "string",
      "description": "ID utilisateur (propriétaire)"
    },
    "guild_id": {
      "type": "string",
      "description": "ID serveur Discord"
    },
    "store_embedding": {
      "type": "boolean",
      "default": true,
      "description": "Stocker dans Qdrant"
    },
    "qdrant_host": { "type": "string" },
    "qdrant_port": { "type": "integer" },
    "qdrant_collection": { "type": "string" },
    "api_key": { "type": "string", "description": "Clé API Qdrant" },
    "openai_api_key": { "type": "string" }
  }
}
```

### MCP - Entity - Search

```json
{
  "required": ["query", "entity_type"],
  "properties": {
    "query": {
      "type": "string",
      "description": "Requête de recherche"
    },
    "entity_type": {
      "type": "string",
      "description": "Type d'entité à rechercher"
    },
    "limit": {
      "type": "integer",
      "default": 10
    },
    "filters": {
      "type": "object",
      "description": "Filtres (tags, difficulty, etc.)"
    },
    "enrich": {
      "type": "boolean",
      "default": false,
      "description": "Enrichir depuis DB"
    },
    "fields": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Champs à récupérer depuis DB"
    },
    "user_id": { "type": "string" },
    "guild_id": { "type": "string" },
    "qdrant_host": { "type": "string" },
    "qdrant_port": { "type": "integer" },
    "qdrant_collection": { "type": "string" },
    "api_key": { "type": "string" },
    "openai_api_key": { "type": "string" }
  }
}
```

---

## Plan de migration

### Phase 1 : Création (sans breaking change)

1. Créer `MCP - Entity - Save` (nouveau webhook)
2. Créer `MCP - Entity - Search` (nouveau webhook)
3. Les anciens webhooks restent fonctionnels
4. Tests avec chatbot-core/plugin en mode opt-in

### Phase 2 : Migration progressive

1. chatbot-core migre vers les nouveaux webhooks
2. plugin migre vers les nouveaux webhooks
3. Période de double-run pour validation

### Phase 3 : Décommissionnement

1. Désactiver `MCP Qdrant - Save` (deprecated)
2. Désactiver `MCP Qdrant - Search` (deprecated)
3. Supprimer après 30 jours

---

## Questions ouvertes

| # | Question | Équipe | Réponse |
|---|----------|--------|---------|
| 1 | L'API peut-elle générer l'UUID avant insertion ? | API | **Oui.** `uuid4()` côté API, retourné immédiatement. |
| 2 | Comment gérer les orphelins Qdrant ? | n8n + API | **Celery beat job** côté API (voir section Review Backend). |
| 3 | Quels champs pour l'affichage immédiat ? | chatbot-core | **Payload Qdrant :** `title`, `description` (tronquée), `tags`, `difficulty`, `prep_time`, `thumbnail_url` |
| 4 | Quels champs pour le détail ? | chatbot-core | **Enrichissement DB :** `ingredients`, `steps`, `cook_time`, `servings`, `nutrition`, `images` |
| 5 | Faut-il un job de sync DB ↔ Qdrant ? | API + n8n | **Oui**, job de nettoyage quotidien (voir section Review Backend). |
| 6 | Timeout acceptable pour enrichissement ? | chatbot-core | **500ms** par défaut, configurable. |

---

## Review de l'équipe API Backend (v2)

> **Date** : 2026-03-27
> **Auteur** : API Backend Team

### Décisions architecturales

**Option 1A (même ID partout) : validée.** L'API génère le UUID,
le retourne, n8n l'utilise comme `qdrant_point_id`.

**Option 3C (hybride enrichissement) : validée.**

**Option C (MongoDB multi-tenant) : validée.** Une seule DB `entities`,
une collection par type (`recipes`, `documents`, `courses`). Chaque
document contient `tenant_id` + `guild_id` pour l'isolation. Index
compound pour la performance. Pas de création dynamique de
collections/DBs par guild.

### Architecture de stockage

```
MongoDB (DB: entities)                PostgreSQL (tenant schemas)
┌──────────────────────────┐          ┌──────────────────────────┐
│ Col: recipes             │          │ Schema: tenant_Z6F3GSWB  │
│ Col: documents           │          │                          │
│ Col: courses             │          │ Table: ratings           │
│ Col: chess_progress      │          │   entity_id → Mongo _id  │
│ Col: chess_games         │          │   user_id (discord)      │
│ ...                      │          │   rating (1-5)           │
│                          │          │                          │
│ Chaque document :        │          │ Table: comments          │
│   _id (UUID)             │◄─────────│   entity_id → Mongo _id  │
│   tenant_id              │          │   content, parent_id     │
│   guild_id               │          │                          │
│   user_id (discord)      │          │ Table: saved_entities    │
│   entity_type            │          │   entity_id → Mongo _id  │
│   data (flexible)        │          │   entity_type            │
│   created_at             │          └──────────────────────────┘
│   updated_at             │
└──────────────────────────┘                  │
         │                                    │ même UUID
         │ même UUID                          ▼
         ▼                           Qdrant (vecteurs)
Qdrant                               ┌──────────────────────────┐
┌──────────────────────────┐         │ point_id = entity _id    │
│ point_id = entity _id    │         │ payload: {tenant_id,     │
│ payload (léger)          │         │   guild_id, title, tags} │
└──────────────────────────┘         └──────────────────────────┘
```

### Authentification n8n ↔ API

L'authentification est déjà définie dans RFC-039 et implémentée
dans `app/middleware/n8n_auth.py`. **Tous les endpoints entités
appelés par n8n utilisent ce mécanisme :**

```
Headers requis :
  X-API-Key: {N8N_API_KEY}       ← clé partagée, déjà en .env.local
  X-Tenant-ID: {tenant_id}      ← identifie le tenant
  Content-Type: application/json
```

Le middleware `verify_n8n_auth()` vérifie les deux headers et
retourne `(tenant_id, api_key)`. Codes d'erreur :
- `401` — X-API-Key manquante ou invalide
- `403` — X-Tenant-ID manquant
- `503` — N8N_API_KEY pas configurée côté API

---

### Endpoints API — Référence pour l'équipe n8n

Prefix : `/api/n8n/entities`

Auth : `X-API-Key` + `X-Tenant-ID` (RFC-039)

---

#### 1. POST /api/n8n/entities/{entity_type} — Créer une entité

Crée un document dans MongoDB et retourne l'UUID pré-généré.

```
POST /api/n8n/entities/recipes
Headers:
  X-API-Key: {N8N_API_KEY}
  X-Tenant-ID: Z6F3GSWB
  Content-Type: application/json
```

**Request body :**

```json
{
  "guild_id": "123456789",
  "user_id": "636639897767378954",
  "data": {
    "title": "Fraisier Vegan",
    "description": "Un délicieux fraisier sans produits laitiers",
    "ingredients": ["farine", "lait végétal", "fraises"],
    "steps": ["Préchauffer le four", "Mélanger", "Cuire"],
    "tags": ["vegan", "dessert"],
    "difficulty": "Moyen",
    "prep_time": 60,
    "cook_time": 25
  }
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `guild_id` | string | oui | ID serveur Discord |
| `user_id` | string | oui | ID Discord de l'utilisateur |
| `data` | object | oui | Contenu de l'entité (structure libre) |

**Response 201 :**

```json
{
  "success": true,
  "entity": {
    "id": "5606c365-b2c0-47d2-b8de-436c268e7895",
    "entity_type": "recipes",
    "tenant_id": "Z6F3GSWB",
    "guild_id": "123456789",
    "user_id": "636639897767378954",
    "created_at": "2026-03-27T10:30:00Z"
  }
}
```

Le `entity.id` est le UUID à utiliser comme `qdrant_point_id`.

---

#### 2. GET /api/n8n/entities/{entity_type}/{entity_id} — Récupérer

Pour l'enrichissement lors du Search.

```
GET /api/n8n/entities/recipes/5606c365-b2c0-47d2-b8de-436c268e7895
Headers:
  X-API-Key: {N8N_API_KEY}
  X-Tenant-ID: Z6F3GSWB
```

**Query params optionnels :**

| Param | Type | Description |
|-------|------|-------------|
| `fields` | string | Champs à retourner (comma-separated). Si absent → tout. |

```
GET /api/n8n/entities/recipes/5606c365...?fields=title,ingredients,steps
```

**Response 200 :**

```json
{
  "success": true,
  "entity": {
    "id": "5606c365-b2c0-47d2-b8de-436c268e7895",
    "entity_type": "recipes",
    "tenant_id": "Z6F3GSWB",
    "guild_id": "123456789",
    "user_id": "636639897767378954",
    "data": {
      "title": "Fraisier Vegan",
      "ingredients": ["farine", "lait végétal", "fraises"],
      "steps": ["Préchauffer le four", "Mélanger", "Cuire"]
    },
    "created_at": "2026-03-27T10:30:00Z",
    "updated_at": "2026-03-27T10:30:00Z"
  }
}
```

**Response 404 :**

```json
{
  "success": false,
  "error": { "code": "ENTITY_NOT_FOUND", "message": "Entity not found" }
}
```

---

#### 3. GET /api/n8n/entities/{entity_type} — Lister

```
GET /api/n8n/entities/recipes?guild_id=123456789&limit=20&offset=0
Headers:
  X-API-Key: {N8N_API_KEY}
  X-Tenant-ID: Z6F3GSWB
```

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `guild_id` | string | null | Filtrer par guild |
| `user_id` | string | null | Filtrer par utilisateur |
| `tags` | string | null | Filtrer par tags (comma-separated) |
| `limit` | int | 20 | Max 100 |
| `offset` | int | 0 | Pagination |
| `sort` | string | `-created_at` | Tri |

**Response 200 :**

```json
{
  "success": true,
  "data": [
    {
      "id": "5606c365-...",
      "data": { "title": "Fraisier Vegan", "tags": ["vegan"] },
      "user_id": "636639897767378954",
      "created_at": "2026-03-27T10:30:00Z"
    }
  ],
  "pagination": { "total": 42, "limit": 20, "offset": 0 }
}
```

---

#### 3b. POST /api/n8n/entities/{entity_type}/batch — Batch enrichissement

> Suite à la question de l'équipe n8n : lors d'un Search Qdrant qui
> retourne 10 résultats, faire 10 GET séquentiels est coûteux.
> Cet endpoint retourne plusieurs entités en un seul appel.

```
POST /api/n8n/entities/recipes/batch
Headers:
  X-API-Key: {N8N_API_KEY}
  X-Tenant-ID: Z6F3GSWB
```

**Request body :**

```json
{
  "ids": [
    "5606c365-b2c0-47d2-b8de-436c268e7895",
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "99887766-5544-3322-1100-aabbccddeeff"
  ],
  "fields": ["title", "ingredients", "tags", "difficulty"]
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `ids` | string[] | oui | UUIDs des entités (max 50) |
| `fields` | string[] | non | Champs à retourner. Si absent → tout. |

**Response 200 :**

```json
{
  "success": true,
  "data": [
    {
      "id": "5606c365-...",
      "data": { "title": "Fraisier Vegan", "ingredients": [...], "tags": [...], "difficulty": "Moyen" }
    },
    {
      "id": "a1b2c3d4-...",
      "data": { "title": "Tiramisu", "ingredients": [...], "tags": [...], "difficulty": "Facile" }
    }
  ],
  "found": 2,
  "not_found": ["99887766-..."]
}
```

Les entités sont retournées dans l'ordre des `ids`. Les IDs
introuvables sont listés dans `not_found` (pas d'erreur 404).

---

#### 4. PUT /api/n8n/entities/{entity_type}/{entity_id} — Modifier

```
PUT /api/n8n/entities/recipes/5606c365-...
Headers:
  X-API-Key: {N8N_API_KEY}
  X-Tenant-ID: Z6F3GSWB
```

**Request body :**

```json
{
  "data": {
    "title": "Fraisier Vegan (amélioré)",
    "tags": ["vegan", "dessert", "amélioré"]
  }
}
```

Merge partiel : seuls les champs dans `data` sont mis à jour.

**Response 200 :**

```json
{
  "success": true,
  "entity": {
    "id": "5606c365-...",
    "updated_at": "2026-03-27T11:00:00Z"
  }
}
```

---

#### 5. DELETE /api/n8n/entities/{entity_type}/{entity_id} — Supprimer

```
DELETE /api/n8n/entities/recipes/5606c365-...
Headers:
  X-API-Key: {N8N_API_KEY}
  X-Tenant-ID: Z6F3GSWB
```

**Response 200 :**

```json
{
  "success": true,
  "deleted": { "id": "5606c365-...", "entity_type": "recipes" }
}
```

Soft delete (champ `deleted_at`). Le job de nettoyage Qdrant
supprimera le vecteur correspondant après 24h.

Pour la suppression définitive (RGPD), un endpoint dédié sera
ajouté en Phase 2 :

```
DELETE /api/n8n/entities/{type}/{id}/purge
```

Ce purge supprimera immédiatement : le document MongoDB + le point
Qdrant + les ratings/comments/saves associés en PostgreSQL.

---

#### 6. POST /api/n8n/entities/{entity_type}/{entity_id}/rate — Noter

> Ref: ISSUE-013

L'ajout de notes passe par n8n qui appelle l'API. La note est
stockée en PostgreSQL (schema tenant).

```
POST /api/n8n/entities/recipes/5606c365-.../rate
Headers:
  X-API-Key: {N8N_API_KEY}
  X-Tenant-ID: Z6F3GSWB
```

**Request body :**

```json
{
  "user_id": "636639897767378954",
  "guild_id": "123456789",
  "rating": 4
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `user_id` | string | oui | ID Discord |
| `guild_id` | string | oui | ID guild |
| `rating` | int | oui | 1 à 5 |

**Response 200 :**

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

Un user ne peut noter qu'une fois par entité (UPSERT). La
moyenne est recalculée à chaque notation.

---

#### 7. POST /api/n8n/entities/{entity_type}/{entity_id}/comment — Commenter

> Ref: ISSUE-013

```
POST /api/n8n/entities/recipes/5606c365-.../comment
Headers:
  X-API-Key: {N8N_API_KEY}
  X-Tenant-ID: Z6F3GSWB
```

**Request body :**

```json
{
  "action": "comment",
  "user_id": "636639897767378954",
  "guild_id": "123456789",
  "content": "Excellente recette ! J'ai ajouté de la cannelle."
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `action` | string | oui | `comment`, `edit`, `delete` |
| `user_id` | string | oui | ID Discord |
| `guild_id` | string | oui | ID guild |
| `content` | string | oui* | Texte (* requis pour comment/edit) |
| `comment_id` | string | non | Requis pour edit/delete |
| `parent_id` | string | non | Pour les réponses (thread) |

**Response 200 (action=comment) :**

```json
{
  "success": true,
  "data": {
    "comment_id": "a1b2c3d4-...",
    "entity_id": "5606c365-...",
    "content": "Excellente recette ! J'ai ajouté de la cannelle.",
    "user_id": "636639897767378954",
    "created_at": "2026-03-27T10:30:00Z"
  }
}
```

**Response 200 (action=edit) :**

```json
{
  "success": true,
  "data": {
    "comment_id": "a1b2c3d4-...",
    "content": "Contenu modifié",
    "updated_at": "2026-03-27T11:00:00Z"
  }
}
```

**Response 200 (action=delete) :**

```json
{
  "success": true,
  "data": {
    "comment_id": "a1b2c3d4-...",
    "deleted": true
  }
}
```

---

#### 8. GET /api/n8n/entities/{entity_type}/{entity_id}/comments — Lister

```
GET /api/n8n/entities/recipes/5606c365-.../comments?limit=20&offset=0
Headers:
  X-API-Key: {N8N_API_KEY}
  X-Tenant-ID: Z6F3GSWB
```

**Response 200 :**

```json
{
  "success": true,
  "data": [
    {
      "comment_id": "a1b2c3d4-...",
      "user_id": "636639897767378954",
      "content": "Excellente recette !",
      "parent_id": null,
      "created_at": "2026-03-27T10:30:00Z",
      "replies": [
        {
          "comment_id": "e5f6g7h8-...",
          "user_id": "111222333444555666",
          "content": "Merci !",
          "parent_id": "a1b2c3d4-...",
          "created_at": "2026-03-27T10:35:00Z"
        }
      ]
    }
  ],
  "total": 12
}
```

---

#### 9. POST /api/n8n/entities/{entity_type}/{entity_id}/save — Sauvegarder

L'utilisateur sauvegarde un document dans ses favoris.

```
POST /api/n8n/entities/recipes/5606c365-.../save
Headers:
  X-API-Key: {N8N_API_KEY}
  X-Tenant-ID: Z6F3GSWB
```

**Request body :**

```json
{
  "user_id": "636639897767378954",
  "guild_id": "123456789"
}
```

**Response 200 (sauvegardé) :**

```json
{
  "success": true,
  "data": {
    "entity_id": "5606c365-...",
    "saved": true,
    "saved_at": "2026-03-27T10:30:00Z"
  }
}
```

**Response 200 (déjà sauvegardé) :**

```json
{
  "success": true,
  "data": {
    "entity_id": "5606c365-...",
    "saved": true,
    "already_saved": true
  }
}
```

#### 10. DELETE /api/n8n/entities/{entity_type}/{entity_id}/save — Retirer

> Note : pas de body dans DELETE (certains clients HTTP l'ignorent).
> Les identifiants sont passés en query params.

```
DELETE /api/n8n/entities/recipes/5606c365-.../save?user_id=636639897767378954&guild_id=123456789
Headers:
  X-API-Key: {N8N_API_KEY}
  X-Tenant-ID: Z6F3GSWB
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `user_id` | string | oui | ID Discord |
| `guild_id` | string | oui | ID guild |

**Response 200 :**

```json
{
  "success": true,
  "data": { "entity_id": "5606c365-...", "saved": false }
}
```

---

### Codes d'erreur

| Code | HTTP | Description |
|------|------|-------------|
| `ENTITY_NOT_FOUND` | 404 | Entité introuvable |
| `COMMENT_NOT_FOUND` | 404 | Commentaire introuvable |
| `INVALID_RATING` | 400 | Note hors 1-5 |
| `INVALID_ACTION` | 400 | Action comment invalide |
| `ALREADY_SAVED` | 200 | Entité déjà sauvegardée (pas une erreur) |
| `INVALID_ENTITY_TYPE` | 400 | Type non supporté |

---

### Tables PostgreSQL (schemas tenant)

```sql
-- Table ratings (schema tenant)
CREATE TABLE ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_id, user_id)
);
CREATE INDEX idx_ratings_entity ON ratings(entity_id, entity_type);

-- Table comments (schema tenant)
CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    parent_id UUID REFERENCES comments(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX idx_comments_entity ON comments(entity_id, entity_type);
CREATE INDEX idx_comments_parent ON comments(parent_id);

-- Table saved_entities (schema tenant)
CREATE TABLE saved_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    guild_id VARCHAR(20) NOT NULL,
    saved_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_id, user_id)
);
CREATE INDEX idx_saved_entity ON saved_entities(entity_id, entity_type);
CREATE INDEX idx_saved_user ON saved_entities(user_id, guild_id);
```

---

### Qdrant multi-tenant — tenant_id dans le payload

**Qdrant est une instance unique partagée** entre tous les tenants
(`host3.local:200001`, DB `azychat_qdrant_dev`). Il n'y a pas
d'instance Qdrant par tenant.

Le `tenant_id` est donc **obligatoire** dans le payload Qdrant
pour isoler les données entre tenants lors du Search :

```json
{
  "id": "5606c365-...",
  "vector": [0.123, -0.456, ...],
  "payload": {
    "tenant_id": "Z6F3GSWB",
    "guild_id": "123456789",
    "title": "Fraisier Vegan",
    "tags": ["vegan", "dessert"],
    "difficulty": "Moyen",
    "entity_type": "recipes"
  }
}
```

Lors du Search, le workflow n8n **doit** filtrer par `tenant_id` :

```json
{
  "vector": [0.123, -0.456, ...],
  "filter": {
    "must": [
      { "key": "tenant_id", "match": { "value": "Z6F3GSWB" } }
    ]
  },
  "limit": 10
}
```

Sans ce filtre, un tenant pourrait voir les entités d'un autre
tenant dans les résultats de recherche sémantique.

---

### Gestion des orphelins Qdrant

Job Celery beat quotidien :
1. Lister les `point_id` dans Qdrant par collection
2. Vérifier l'existence en MongoDB (DB `entities`)
3. Supprimer les points orphelins (> 24h sans document MongoDB)
4. Supprimer les points des entités soft-deleted (> 24h)

### Gestion des échecs partiels

Si API OK mais Qdrant KO → `partial: true` + `retry_token`
Si Qdrant OK mais API KO → orphelin nettoyé par le job quotidien

---

### Réponses aux questions de l'équipe n8n (2026-03-27)

| # | Question n8n | Réponse API |
|---|-------------|-------------|
| 1 | **DELETE /save — body ignoré par certains clients HTTP** | Corrigé : `user_id` et `guild_id` passent en **query params** (endpoint 10). |
| 2 | **Batch enrichissement pour Search (10 GET séquentiels = lent)** | Ajouté : **endpoint 3b** `POST .../batch` — retourne N entités en un appel (max 50 IDs). |
| 3 | **tenant_id dans le payload Qdrant — est-ce nécessaire ?** | **Oui, obligatoire.** Qdrant est une instance unique partagée entre tous les tenants. Le filtre `tenant_id` dans la query Qdrant est nécessaire pour l'isolation (voir section "Qdrant multi-tenant"). |
| 4 | **Soft delete vs Hard delete (RGPD)** | Le DELETE fait un soft delete. Le job Qdrant supprime les points des entités soft-deleted après 24h. Un endpoint `/purge` pour le hard delete RGPD sera ajouté en Phase 2 (voir endpoint 5). |
| 5 | **Contradiction tenant_id : header vs payload ?** | **Header seul (`X-Tenant-ID`).** Voir section "Résolution du tenant_id" ci-dessous. |

### Résolution du tenant_id — Header seul, pas de payload

Le `tenant_id` est transmis **uniquement via le header
`X-Tenant-ID`**, jamais dans le body de la requête. C'est le
pattern RFC-039 déjà en place (`app/middleware/n8n_auth.py`).

**Flux complet :**

```
chatbot-core / plugin → webhook n8n
  Body: {
    entity_type: "recipes",
    data: { title: "Fraisier Vegan", ... },
    user_id: "636639897767378954",
    guild_id: "123456789"
  }
  ⚠ Pas de tenant_id dans le body

n8n (workflow MCP - Entity - Save) :
  1. Appelle MCP - Tenant - Resolve pour obtenir le tenant_id
     depuis le user_id Discord
  2. Forward vers l'API backend avec le tenant_id résolu :

n8n → API backend
  Headers:
    X-API-Key: {N8N_API_KEY}
    X-Tenant-ID: Z6F3GSWB          ← résolu par MCP - Tenant - Resolve
  Body: {
    guild_id: "123456789",
    user_id: "636639897767378954",
    data: { title: "Fraisier Vegan", ... }
  }
```

**Pourquoi pas dans le body ?**

1. **Séparation des responsabilités** — le tenant_id est une
   donnée d'authentification/routage, pas une donnée métier
2. **Pas de contradiction possible** — un seul endroit pour le
   tenant_id, pas de risque de mismatch header ≠ body
3. **Cohérence** — tous les endpoints `/api/n8n/*` utilisent déjà
   ce pattern (RFC-039, RFC-040, RFC-042)
4. **chatbot-core n'a pas besoin de connaître le tenant_id** — c'est
   n8n qui le résout

---

### Webhook MCP - Tenant - Resolve (nouveau)

Ce webhook résout le `tenant_id` à partir du `user_id` Discord.
Il est appelé en interne par les autres webhooks MCP qui ont
besoin du tenant_id pour appeler l'API backend.

**Endpoint :** `POST /webhook/tenant-resolve`

**InputSchema :**

```json
{
  "required": ["user_id"],
  "properties": {
    "user_id": {
      "type": "string",
      "description": "ID Discord de l'utilisateur"
    },
    "guild_id": {
      "type": "string",
      "description": "ID serveur Discord (optionnel, pour validation)"
    }
  }
}
```

**Response 200 :**

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

**Response 404 (user non trouvé) :**

```json
{
  "success": false,
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "No tenant found for user_id 636639897767378954"
  }
}
```

**Implémentation :**

Le webhook appelle l'API backend :
```
GET /api/n8n/tenants/resolve?user_id=636639897767378954
Headers:
  X-API-Key: {N8N_API_KEY}
```

L'API backend cherche dans sa base le tenant associé à cet
utilisateur Discord (table `tenant_users` ou équivalent).

---

### Lien avec ISSUE-013

L'ISSUE-013 proposait des **webhooks n8n** (`items-rating`,
`items-comment`) avec leurs propres tables. Cette RFC les remplace
par des **endpoints API REST** (endpoints 6, 7, 8 ci-dessus) que
n8n appelle via `X-API-Key` + `X-Tenant-ID`.

L'équipe n8n n'a pas besoin de créer de workflow pour les ratings
et comments — c'est un simple proxy HTTP vers ces endpoints.

---

### Checklist API Backend

- [ ] Config MongoDB `entities` (connexion Motor, init au startup)
- [ ] Service `EntityService` (CRUD MongoDB + UUID pré-généré)
- [ ] Routes `/api/n8n/entities/{type}` (5 endpoints CRUD + batch)
- [ ] Routes `/api/n8n/entities/{type}/{id}/rate` (ISSUE-013)
- [ ] Routes `/api/n8n/entities/{type}/{id}/comment` (ISSUE-013)
- [ ] Routes `/api/n8n/entities/{type}/{id}/save`
- [ ] Migration Alembic : tables `ratings` + `comments` + `saved_entities`
- [ ] Job Celery beat : nettoyage orphelins Qdrant + soft-deleted
- [ ] Phase 2 : endpoint `/purge` (hard delete RGPD)
- [ ] Tests unitaires

---

## Checklist d'implémentation (toutes équipes)

- [ ] Équipe API : Endpoints CRUD entités (MongoDB) — voir section Review
- [ ] Équipe API : Endpoints rate + comment + save (PostgreSQL)
- [ ] Équipe API : Job nettoyage orphelins Qdrant
- [ ] Équipe n8n : Créer MCP - Entity - Save (appelle POST /api/n8n/entities/{type} + Qdrant)
- [ ] Équipe n8n : Créer MCP - Entity - Search (Qdrant + GET /api/n8n/entities/{type}/{id})
- [ ] Équipe n8n : Appeler /rate, /comment, /save depuis les workflows
- [ ] Équipe chatbot-core : Migrer vers nouveaux webhooks
- [ ] Équipe plugin : Migrer vers nouveaux webhooks
- [ ] Tests E2E : Save + Search + Rate + Comment
- [ ] Documentation : Mettre à jour le registry MCP

---

## Annexes

### A. Exemple de payload Save

```json
{
  "entity_type": "recipes",
  "data": {
    "title": "Fraisier Vegan",
    "description": "Un délicieux fraisier sans produits laitiers",
    "ingredients": ["farine", "lait végétal", "fraises"],
    "steps": ["Préchauffer le four", "Mélanger", "Cuire"],
    "tags": ["vegan", "dessert"],
    "difficulty": "Moyen",
    "prep_time": 60,
    "cook_time": 25
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

### B. Exemple de response Save

```json
{
  "success": true,
  "data": {
    "entity_id": "5606c365-b2c0-47d2-b8de-436c268e7895",
    "qdrant_point_id": "5606c365-b2c0-47d2-b8de-436c268e7895",
    "entity_type": "recipes",
    "saved_in_db": true,
    "saved_in_qdrant": true
  },
  "_trace": {
    "service_response": {
      "api": { "id": "5606c365-..." },
      "qdrant": { "status": "ok" }
    },
    "provider": "api+qdrant",
    "latency_ms": 342,
    "user_id": "636639897767378954"
  }
}
```
