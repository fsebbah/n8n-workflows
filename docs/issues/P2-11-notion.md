# P2-11: notion_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | P2-11 |
| **Nom** | notion_tool |
| **Priorité** | Moyenne |
| **Statut** | A implémenter |
| **Catégorie** | Productivity |

## Description

Workflow n8n pour l'intégration avec Notion. Permet les opérations CRUD sur les pages et databases, la recherche et la synchronisation de contenu.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| API | **Notion API v2** | API officielle, stable |
| Node n8n | Notion node natif | Intégration native |
| Auth | OAuth 2.0 / Integration Token | Selon use case |

## Endpoint

```
POST /webhook/notion
Content-Type: application/json

{
  "operation": "create_page" | "update_page" | "get_page" | "search" |
               "create_database" | "query_database" | "append_block",
  "params": {
    // Selon opération - voir détails ci-dessous
  },
  "execution_mode": "online" | "offline"
}
```

## Opérations

### create_page

```json
{
  "operation": "create_page",
  "params": {
    "parent": {
      "type": "database_id" | "page_id",
      "id": "abc123..."
    },
    "properties": {
      "Name": {"title": [{"text": {"content": "Ma page"}}]},
      "Status": {"select": {"name": "En cours"}},
      "Tags": {"multi_select": [{"name": "Tag1"}, {"name": "Tag2"}]}
    },
    "children": [
      {
        "type": "paragraph",
        "paragraph": {
          "rich_text": [{"text": {"content": "Contenu..."}}]
        }
      }
    ]
  }
}
```

### query_database

```json
{
  "operation": "query_database",
  "params": {
    "database_id": "abc123...",
    "filter": {
      "property": "Status",
      "select": {"equals": "En cours"}
    },
    "sorts": [
      {"property": "Created", "direction": "descending"}
    ],
    "page_size": 100
  }
}
```

### search

```json
{
  "operation": "search",
  "params": {
    "query": "recherche",
    "filter": {
      "property": "object",
      "value": "page" | "database"
    },
    "sort": {
      "direction": "descending",
      "timestamp": "last_edited_time"
    }
  }
}
```

### append_block

```json
{
  "operation": "append_block",
  "params": {
    "block_id": "abc123...",
    "children": [
      {
        "type": "heading_2",
        "heading_2": {
          "rich_text": [{"text": {"content": "Nouveau titre"}}]
        }
      },
      {
        "type": "bulleted_list_item",
        "bulleted_list_item": {
          "rich_text": [{"text": {"content": "Item 1"}}]
        }
      }
    ]
  }
}
```

## Response

```json
{
  "success": true,
  "data": {
    "object": "page",
    "id": "page-id-123",
    "created_time": "2024-12-15T10:00:00.000Z",
    "last_edited_time": "2024-12-15T10:00:00.000Z",
    "url": "https://www.notion.so/...",
    "properties": {...}
  },
  "meta": {
    "provider": "notion",
    "api_version": "2022-06-28",
    "execution_mode": "online"
  }
}
```

## Definition of Done

- [ ] Endpoint `POST /webhook/notion`
- [ ] Opérations: create_page, update_page, get_page, search
- [ ] Opérations database: create, query
- [ ] Opération blocks: append_block
- [ ] Support des propriétés: title, rich_text, select, multi_select, date, number, checkbox
- [ ] Pagination pour query_database
- [ ] Gestion des erreurs API Notion
- [ ] Tests: CRUD page, query database, search

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| Create page | Nouvelle page dans database | Page créée |
| Update page | Modifier propriétés | Page mise à jour |
| Query database | Filtrer par status | Résultats filtrés |
| Search | Recherche texte | Pages trouvées |
| Append block | Ajouter contenu | Blocks ajoutés |
| Pagination | Database > 100 items | Pagination OK |
| Erreur 404 | Page inexistante | Erreur gracieuse |

## Dépendances

- **Notion API** - Integration Token ou OAuth
- **Node n8n** - Notion node (optionnel, pour simplifier)
- Variables d'environnement:
  - `NOTION_API_KEY` (Integration Token)

## Types de blocs supportés

| Type | Support |
|------|---------|
| paragraph | ✅ |
| heading_1, heading_2, heading_3 | ✅ |
| bulleted_list_item | ✅ |
| numbered_list_item | ✅ |
| to_do | ✅ |
| toggle | ✅ |
| code | ✅ |
| quote | ✅ |
| divider | ✅ |
| table | ⚠️ Complexe |
| image | ✅ |

## Notes d'implémentation

1. Utiliser le node Notion natif n8n si disponible
2. Gérer la pagination automatiquement (cursor)
3. Retry sur rate limit (429) avec backoff
4. Valider les IDs avant appel API
5. Convertir Markdown en blocks Notion si besoin

## Références

- [TOOLS_WORKFLOWS_MAPPING.md - Stack IA & Contenu](../mcp-server/TOOLS_WORKFLOWS_MAPPING.md#stack-ia--contenu--phase-2-p2-04-à-p2-13)
- [tools-complementaire.md](../n8n/tools-complementaire.md)
- [Notion API Documentation](https://developers.notion.com/)
