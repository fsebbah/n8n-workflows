# ISSUE-013: Webhooks Items Rating & Comment

**Date:** 2026-03-27
**Status:** SUPERSEDED
**Priority:** P1
**Assignee:** Equipe n8n

> ⚠️ **SUPERSEDED BY [RFC-049](../rfc/RFC-049-ENTITY-STORAGE-ARCHITECTURE.md)**
>
> Cette issue a été intégrée dans l'architecture complète RFC-049 qui définit:
> - MCP - Entity - Save (MongoDB + Qdrant)
> - MCP - Entity - Search (Qdrant + MongoDB)
> - MCP - Entity - Rating (PostgreSQL)
> - MCP - Entity - Comment (PostgreSQL)
> - MCP - Tenant - Resolve (Discord user_id → tenant_id)
>
> Voir RFC-049 pour les spécifications complètes et le plan d'implémentation.

---

## Contexte (Archive)

Les composants frontend utilisent deux webhooks pour la notation et les avis qui **n'existent pas encore**.

## Webhooks à créer

### 1. `items-rating` - Noter un item

**Endpoint:** `POST /webhook/items-rating`

**InputSchema:**
```json
{
  "required": ["action", "entity_id", "user_id", "rating"],
  "properties": {
    "action": {
      "type": "string",
      "enum": ["rate"],
      "description": "Action à effectuer"
    },
    "entity_id": {
      "type": "string",
      "description": "ID de l'entité à noter (recette, document, etc.)"
    },
    "entity_type": {
      "type": "string",
      "description": "Type d'entité: recipe, document, course, etc."
    },
    "user_id": {
      "type": "string",
      "description": "ID de l'utilisateur"
    },
    "guild_id": {
      "type": "string",
      "description": "ID du serveur Discord (optionnel)"
    },
    "rating": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5,
      "description": "Note de 1 à 5 étoiles"
    }
  }
}
```

**Exemple de payload:**
```json
{
  "action": "rate",
  "entity_id": "recipe-123",
  "entity_type": "recipe",
  "user_id": "user-456",
  "guild_id": "guild-789",
  "rating": 4
}
```

**Réponse attendue:**
```json
{
  "success": true,
  "data": {
    "entity_id": "recipe-123",
    "new_average": 4.2,
    "total_ratings": 15
  },
  "_trace": {
    "service_response": { ... },
    "provider": "api",
    "latency_ms": 45,
    "user_id": "user-456",
    "guild_id": "guild-789"
  }
}
```

---

### 2. `items-comment` - Commenter un item

**Endpoint:** `POST /webhook/items-comment`

**InputSchema:**
```json
{
  "required": ["action", "entity_id", "user_id", "content"],
  "properties": {
    "action": {
      "type": "string",
      "enum": ["comment", "edit", "delete"],
      "description": "Action: comment (créer), edit (modifier), delete (supprimer)"
    },
    "entity_id": {
      "type": "string",
      "description": "ID de l'entité à commenter"
    },
    "entity_type": {
      "type": "string",
      "description": "Type d'entité: recipe, document, course, etc."
    },
    "user_id": {
      "type": "string",
      "description": "ID de l'utilisateur"
    },
    "guild_id": {
      "type": "string",
      "description": "ID du serveur Discord (optionnel)"
    },
    "content": {
      "type": "string",
      "description": "Contenu du commentaire (requis pour action=comment/edit)"
    },
    "comment_id": {
      "type": "string",
      "description": "ID du commentaire (requis pour action=edit/delete)"
    },
    "parent_id": {
      "type": "string",
      "description": "ID du commentaire parent (pour réponses)"
    }
  }
}
```

**Exemple de payload (création):**
```json
{
  "action": "comment",
  "entity_id": "recipe-123",
  "entity_type": "recipe",
  "user_id": "user-456",
  "guild_id": "guild-789",
  "content": "Excellente recette ! J'ai ajouté un peu de cannelle."
}
```

**Réponse attendue:**
```json
{
  "success": true,
  "data": {
    "comment_id": "comment-abc",
    "entity_id": "recipe-123",
    "content": "Excellente recette ! J'ai ajouté un peu de cannelle.",
    "created_at": "2026-03-27T10:30:00Z",
    "user_id": "user-456"
  },
  "_trace": {
    "service_response": { ... },
    "provider": "api",
    "latency_ms": 52,
    "user_id": "user-456",
    "guild_id": "guild-789"
  }
}
```

---

## Architecture suggérée

### Base de données

```sql
-- Table ratings
CREATE TABLE ratings (
  id UUID PRIMARY KEY,
  entity_id VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  guild_id VARCHAR(255),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(entity_id, user_id)  -- Un user = une note par entité
);

-- Table comments
CREATE TABLE comments (
  id UUID PRIMARY KEY,
  entity_id VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  guild_id VARCHAR(255),
  content TEXT NOT NULL,
  parent_id UUID REFERENCES comments(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP  -- Soft delete
);

-- Index pour recherche rapide
CREATE INDEX idx_ratings_entity ON ratings(entity_id, entity_type);
CREATE INDEX idx_comments_entity ON comments(entity_id, entity_type);
```

### Workflow n8n suggéré

```
Webhook → Validate Input → Valid?
                            ├── (true) → Switch Action → [rate/comment/edit/delete]
                            │                               ├── Rate → Upsert Rating → Calculate Average → Respond
                            │                               ├── Comment → Insert Comment → Respond
                            │                               ├── Edit → Update Comment → Respond
                            │                               └── Delete → Soft Delete → Respond
                            └── (false) → Build Error → Respond Error
```

---

## Checklist

- [ ] Créer tables PostgreSQL (ratings, comments)
- [ ] Créer workflow `MCP - Items Rating`
- [ ] Créer workflow `MCP - Items Comment`
- [ ] Ajouter InputSchema standardisé (issue #323)
- [ ] Ajouter `_trace` aux réponses
- [ ] Tester avec frontend
- [ ] Documenter dans le registry MCP

---

## Notes

- Les champs `user_id`, `guild_id` suivent le pattern RFC-014
- Le `_trace` suit le standard établi dans l'issue #323/#325
- Considérer l'ajout de modération de contenu pour les commentaires (MCP - Content Analyzer)
