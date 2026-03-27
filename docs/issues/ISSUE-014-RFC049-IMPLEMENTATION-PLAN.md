# ISSUE-014: Plan d'Implémentation RFC-049

**Date:** 2026-03-27
**Status:** IN_PROGRESS
**Priority:** P0
**RFC:** [RFC-049-ENTITY-STORAGE-ARCHITECTURE](../rfc/RFC-049-ENTITY-STORAGE-ARCHITECTURE.md)
**Supersedes:** [ISSUE-013](./ISSUE-013-ITEMS-RATING-COMMENT-WEBHOOKS.md)

---

## Vue d'ensemble

Ce plan décrit l'implémentation des webhooks définis dans RFC-049 pour l'architecture de stockage des entités. L'implémentation est conçue pour être exécutée en parallèle via des subagents.

---

## Phases d'Implémentation

### Phase 0: Prérequis (Séquentiel)

| Task | Description | Équipe | Dépendances |
|------|-------------|--------|-------------|
| 0.1 | Créer collections MongoDB (entities) | API Backend | - |
| 0.2 | Créer tables PostgreSQL (ratings, comments, tenants) | API Backend | - |
| 0.3 | Configurer Qdrant collection avec tenant_id filtering | API Backend | - |
| 0.4 | Exposer endpoints API Backend (RFC-049 §4) | API Backend | 0.1, 0.2, 0.3 |

### Phase 1: Webhooks Core (Parallélisable)

Ces webhooks peuvent être implémentés en parallèle par des subagents.

```
┌─────────────────────────────────────────────────────────────────┐
│                    PARALLEL EXECUTION GROUP 1                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ Subagent A       │  │ Subagent B       │  │ Subagent C     │ │
│  │ ──────────────── │  │ ──────────────── │  │ ────────────── │ │
│  │ MCP - Tenant     │  │ MCP - Entity     │  │ MCP - Entity   │ │
│  │ Resolve          │  │ Save             │  │ Search         │ │
│  │                  │  │                  │  │                │ │
│  │ Dépendances: -   │  │ Dépendances: -   │  │ Dépendances: - │ │
│  └──────────────────┘  └──────────────────┘  └────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────┐
│                    PARALLEL EXECUTION GROUP 2                    │
│              (Après Phase 1 - dépend de Tenant Resolve)          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ Subagent D       │  │ Subagent E       │                     │
│  │ ──────────────── │  │ ──────────────── │                     │
│  │ MCP - Entity     │  │ MCP - Entity     │                     │
│  │ Rating           │  │ Comment          │                     │
│  │                  │  │                  │                     │
│  │ Dép: 1.1         │  │ Dép: 1.1         │                     │
│  └──────────────────┘  └──────────────────┘                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Spécifications des Webhooks

### 1.1 MCP - Tenant - Resolve

**Priorité:** P0 (bloque 1.4, 1.5)
**Endpoint:** `POST /webhook/tenant-resolve`
**Fichier:** `workflows/MCP_-_Tenant_-_Resolve.json`

**InputSchema:**
```json
{
  "type": "object",
  "required": ["action", "user_id"],
  "properties": {
    "action": {
      "type": "string",
      "enum": ["resolve"],
      "description": "Action à effectuer"
    },
    "user_id": {
      "type": "string",
      "description": "Discord user ID"
    },
    "guild_id": {
      "type": "string",
      "description": "Discord guild ID (optionnel)"
    }
  }
}
```

**Workflow Flow:**
```
Webhook → Validate Input → Call API Backend /tenants/resolve
                         → Return tenant_id + metadata
```

**API Backend Call:**
```
GET /api/n8n/tenants/resolve?user_id={user_id}&guild_id={guild_id}
```

---

### 1.2 MCP - Entity - Save

**Priorité:** P0
**Endpoint:** `POST /webhook/entity-save`
**Fichier:** `workflows/MCP_-_Entity_-_Save.json`
**Remplace:** `MCP Qdrant - Save`

**InputSchema:**
```json
{
  "type": "object",
  "required": ["action", "entity_type", "content"],
  "properties": {
    "action": {
      "type": "string",
      "enum": ["save", "update", "delete"],
      "description": "Action CRUD"
    },
    "entity_type": {
      "type": "string",
      "enum": ["recipe", "document", "course", "quiz", "flashcard"],
      "description": "Type d'entité"
    },
    "entity_id": {
      "type": "string",
      "description": "UUID existant (requis pour update/delete)"
    },
    "content": {
      "type": "object",
      "description": "Données de l'entité (structure selon entity_type)"
    },
    "embedding": {
      "type": "array",
      "items": { "type": "number" },
      "description": "Vecteur d'embedding (optionnel, calculé si absent)"
    },
    "user_id": {
      "type": "string",
      "description": "Discord user ID (optionnel, tracing)"
    },
    "guild_id": {
      "type": "string",
      "description": "Discord guild ID (optionnel, tracing)"
    }
  }
}
```

**Workflow Flow:**
```
Webhook → Validate Input → Get tenant_id (header X-Tenant-ID)
                         → Switch action
                           ├── save → Generate UUID → Save MongoDB → Save Qdrant → Response
                           ├── update → Update MongoDB → Update Qdrant → Response
                           └── delete → Delete MongoDB → Delete Qdrant → Response
```

**Points clés:**
- Même UUID pour `entity_id` et `qdrant_point_id`
- `tenant_id` extrait du header `X-Tenant-ID`
- Fallback `api_key` pour compatibilité legacy

---

### 1.3 MCP - Entity - Search

**Priorité:** P0
**Endpoint:** `POST /webhook/entity-search`
**Fichier:** `workflows/MCP_-_Entity_-_Search.json`
**Remplace:** `MCP Qdrant - Search`

**InputSchema:**
```json
{
  "type": "object",
  "required": ["action", "query"],
  "properties": {
    "action": {
      "type": "string",
      "enum": ["search", "similar"],
      "description": "search=par query, similar=par entity_id"
    },
    "query": {
      "type": "string",
      "description": "Texte de recherche (pour action=search)"
    },
    "entity_id": {
      "type": "string",
      "description": "UUID pour recherche similaire (pour action=similar)"
    },
    "entity_type": {
      "type": "string",
      "description": "Filtrer par type d'entité"
    },
    "limit": {
      "type": "integer",
      "default": 10,
      "description": "Nombre de résultats max"
    },
    "filters": {
      "type": "object",
      "description": "Filtres additionnels Qdrant"
    },
    "user_id": {
      "type": "string",
      "description": "Discord user ID (optionnel, tracing)"
    },
    "guild_id": {
      "type": "string",
      "description": "Discord guild ID (optionnel, tracing)"
    }
  }
}
```

**Workflow Flow:**
```
Webhook → Validate Input → Get tenant_id (header)
                         → Switch action
                           ├── search → Embed query → Search Qdrant (+ tenant_id filter)
                           │          → Fetch entities from MongoDB → Response
                           └── similar → Get entity vector → Search Qdrant
                                       → Fetch entities from MongoDB → Response
```

---

### 1.4 MCP - Entity - Rating

**Priorité:** P1
**Endpoint:** `POST /webhook/entity-rating`
**Fichier:** `workflows/MCP_-_Entity_-_Rating.json`
**Dépend de:** Tenant Resolve (pour validation user)

**InputSchema:**
```json
{
  "type": "object",
  "required": ["action", "entity_id", "user_id"],
  "properties": {
    "action": {
      "type": "string",
      "enum": ["rate", "get", "delete"],
      "description": "rate=noter, get=obtenir stats, delete=supprimer note"
    },
    "entity_id": {
      "type": "string",
      "description": "UUID de l'entité"
    },
    "user_id": {
      "type": "string",
      "description": "Discord user ID"
    },
    "rating": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5,
      "description": "Note 1-5 (requis pour action=rate)"
    },
    "guild_id": {
      "type": "string",
      "description": "Discord guild ID (optionnel)"
    }
  }
}
```

**Workflow Flow:**
```
Webhook → Validate Input → Resolve tenant_id
                         → Switch action
                           ├── rate → Upsert PostgreSQL → Calculate avg → Response
                           ├── get → Query PostgreSQL → Response
                           └── delete → Delete PostgreSQL → Recalculate avg → Response
```

---

### 1.5 MCP - Entity - Comment

**Priorité:** P1
**Endpoint:** `POST /webhook/entity-comment`
**Fichier:** `workflows/MCP_-_Entity_-_Comment.json`
**Dépend de:** Tenant Resolve (pour validation user)

**InputSchema:**
```json
{
  "type": "object",
  "required": ["action", "entity_id", "user_id"],
  "properties": {
    "action": {
      "type": "string",
      "enum": ["comment", "list", "edit", "delete"],
      "description": "Action CRUD"
    },
    "entity_id": {
      "type": "string",
      "description": "UUID de l'entité"
    },
    "user_id": {
      "type": "string",
      "description": "Discord user ID"
    },
    "content": {
      "type": "string",
      "description": "Contenu du commentaire (requis pour comment/edit)"
    },
    "comment_id": {
      "type": "string",
      "description": "UUID du commentaire (requis pour edit/delete)"
    },
    "parent_id": {
      "type": "string",
      "description": "UUID du commentaire parent (pour réponses)"
    },
    "guild_id": {
      "type": "string",
      "description": "Discord guild ID (optionnel)"
    }
  }
}
```

**Workflow Flow:**
```
Webhook → Validate Input → Resolve tenant_id
                         → Switch action
                           ├── comment → Insert PostgreSQL → Response
                           ├── list → Query PostgreSQL (with pagination) → Response
                           ├── edit → Verify owner → Update PostgreSQL → Response
                           └── delete → Verify owner → Soft delete → Response
```

---

## Phase 2: Intégration (Séquentiel)

| Task | Description | Dépendances |
|------|-------------|-------------|
| 2.1 | Mettre à jour chatbot-core plugin | Phase 1 complète |
| 2.2 | Migrer appels legacy Qdrant → Entity | 2.1 |
| 2.3 | Tests end-to-end | 2.2 |
| 2.4 | Supprimer workflows legacy | 2.3 |

---

## Commandes Subagent

### Lancer Phase 1 Group 1 (Parallèle)

```bash
# Subagent A: Tenant Resolve
claude-code task --prompt "Créer workflow MCP - Tenant - Resolve selon ISSUE-014 spec 1.1" &

# Subagent B: Entity Save
claude-code task --prompt "Créer workflow MCP - Entity - Save selon ISSUE-014 spec 1.2" &

# Subagent C: Entity Search
claude-code task --prompt "Créer workflow MCP - Entity - Search selon ISSUE-014 spec 1.3" &

wait
```

### Lancer Phase 1 Group 2 (Après Group 1)

```bash
# Subagent D: Entity Rating
claude-code task --prompt "Créer workflow MCP - Entity - Rating selon ISSUE-014 spec 1.4" &

# Subagent E: Entity Comment
claude-code task --prompt "Créer workflow MCP - Entity - Comment selon ISSUE-014 spec 1.5" &

wait
```

---

## Structure Standard des Workflows

Chaque workflow doit suivre ce pattern:

```
Webhook (POST)
  ├── InputSchema (RFC-014 standard)
  └── Response Webhook

Validate Input (Code node)
  ├── Extraire body/query
  ├── Valider required fields
  ├── Extraire tenant_id de X-Tenant-ID header
  └── Fallback api_key pour compatibilité

Switch Action
  └── [Branches selon action]

Build Response (Code node)
  ├── success: true/false
  ├── data: { ... }
  └── _trace: {
        service_response: { ... },
        provider: "api",
        latency_ms: number,
        user_id: optional,
        guild_id: optional
      }

Respond (Respond to Webhook)
```

---

## Checklist

### Phase 0
- [ ] Collections MongoDB créées
- [ ] Tables PostgreSQL créées
- [ ] Qdrant configuré avec tenant_id
- [ ] Endpoints API Backend exposés

### Phase 1 - Group 1
- [ ] MCP - Tenant - Resolve
- [ ] MCP - Entity - Save
- [ ] MCP - Entity - Search

### Phase 1 - Group 2
- [ ] MCP - Entity - Rating
- [ ] MCP - Entity - Comment

### Phase 2
- [ ] chatbot-core mis à jour
- [ ] Migration legacy complète
- [ ] Tests E2E passent
- [ ] Cleanup legacy workflows

---

## Notes

- Tous les webhooks utilisent `_trace` standard (issue #323/#325)
- `user_id`, `guild_id` sont OPTIONNELS (tracing only)
- `tenant_id` est REQUIS (via header X-Tenant-ID ou résolution)
- Même UUID partagé entre MongoDB entity_id et Qdrant point_id
- Qdrant est multi-tenant, filtrage par tenant_id obligatoire
