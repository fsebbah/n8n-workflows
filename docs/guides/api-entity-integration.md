# Guide API - Integration Entites Generiques

**Date:** 2026-01-12
**Pour:** Equipe API
**De:** Equipe n8n

---

## 1. Vue d'ensemble

n8n appelle l'API pour les operations CRUD sur les entites. L'API expose un endpoint generique `/api/entities/{type}`.

```
Plugin ──► n8n ──► API /api/entities/{type}
                      │
                      ▼
                  PostgreSQL
```

---

## 2. Endpoints requis

### 2.1 CRUD de base (PR #210)

| Methode | Endpoint | Description | Status |
|---------|----------|-------------|--------|
| POST | `/api/entities/{type}` | Creer | ✅ |
| GET | `/api/entities/{type}/{id}` | Lire | ✅ |
| PUT | `/api/entities/{type}/{id}` | Modifier | ✅ |
| DELETE | `/api/entities/{type}/{id}` | Supprimer | ✅ |
| GET | `/api/entities/{type}/user/{user_id}` | Lister par user | ✅ |

### 2.2 Filtres SQL (a implementer)

```
GET /api/entities/{type}/user/{user_id}?limit=10&offset=0&tags=vegetarien&difficulty=easy
```

| Parametre | Type | Description |
|-----------|------|-------------|
| `limit` | int | Nombre max de resultats (defaut: 20) |
| `offset` | int | Pagination offset (defaut: 0) |
| `tags` | string | Filtrer par tags (comma-separated) |
| `difficulty` | string | Filtrer par difficulte |
| `is_public` | bool | Filtrer par visibilite |
| `source` | string | Filtrer par source |

---

## 3. Types d'entites supportes

| Type | Table | Description |
|------|-------|-------------|
| `recipes` | recipes | Recettes bot-appetit |
| `translations` | translations | Traductions Torah |

### Ajouter un nouveau type

1. Creer `api/routers/entities/handlers/{type}.py`
2. Implementer: `create`, `get`, `update`, `delete`, `list_by_user`
3. Enregistrer dans `handlers/__init__.py`:
   ```python
   ENTITY_HANDLERS["mon_type"] = mon_type_handler
   ```

---

## 4. Formats de requete/reponse

### 4.1 Creer une entite

**Requete n8n:**
```
POST /api/entities/recipes
Content-Type: application/json
```

```json
{
  "discord_user_id": "123456789",
  "data": {
    "title": "Fondant chocolat",
    "description": "Un delicieux fondant",
    "tags": ["dessert", "chocolat"],
    "ingredients": [
      {"name": "chocolat", "quantity": "200", "unit": "g"}
    ],
    "steps": ["Faire fondre le chocolat", "..."],
    "prep_time_minutes": 15,
    "cook_time_minutes": 12,
    "servings": 4,
    "difficulty": "facile",
    "is_public": true,
    "language": "fr"
  },
  "qdrant_point_id": "recipes_1234567890_abc123",
  "llm_metadata": {
    "provider": "openai",
    "model": "gpt-4"
  }
}
```

**Reponse attendue:**
```json
{
  "id": "uuid-xxx",
  "discord_user_id": "123456789",
  "title": "Fondant chocolat",
  "description": "Un delicieux fondant",
  "qdrant_point_id": "recipes_1234567890_abc123",
  "created_at": "2026-01-12T10:00:00Z"
}
```

### 4.2 Lire une entite

**Requete n8n:**
```
GET /api/entities/recipes/uuid-xxx
```

**Reponse attendue:**
```json
{
  "id": "uuid-xxx",
  "discord_user_id": "123456789",
  "title": "Fondant chocolat",
  "description": "Un delicieux fondant",
  "tags": ["dessert", "chocolat"],
  "ingredients": [...],
  "steps": [...],
  "prep_time_minutes": 15,
  "cook_time_minutes": 12,
  "servings": 4,
  "difficulty": "facile",
  "is_public": true,
  "language": "fr",
  "qdrant_point_id": "recipes_1234567890_abc123",
  "average_rating": 4.5,
  "rating_count": 10,
  "created_at": "2026-01-12T10:00:00Z",
  "updated_at": "2026-01-12T10:00:00Z"
}
```

### 4.3 Lister par utilisateur

**Requete n8n:**
```
GET /api/entities/recipes/user/123456789?limit=10&offset=0&tags=dessert
```

**Reponse attendue:**
```json
{
  "items": [
    {
      "id": "uuid-xxx",
      "title": "Fondant chocolat",
      "description": "Un delicieux fondant",
      "difficulty": "facile",
      "prep_time_minutes": 15,
      "cook_time_minutes": 12,
      "tags": ["dessert", "chocolat"],
      "average_rating": 4.5,
      "created_at": "2026-01-12T10:00:00Z"
    }
  ],
  "total": 25,
  "limit": 10,
  "offset": 0
}
```

### 4.4 Supprimer une entite

**Requete n8n:**
```
DELETE /api/entities/recipes/uuid-xxx
```

**Reponse attendue:**
```json
{
  "message": "Entity deleted",
  "id": "uuid-xxx"
}
```

---

## 5. Champ qdrant_point_id

n8n envoie `qdrant_point_id` lors de la creation. Ce champ permet de lier l'entite SQL a son vecteur Qdrant.

**Flux:**
```
1. n8n genere embedding (OpenAI)
2. n8n stocke dans Qdrant → recoit point_id
3. n8n appelle API avec qdrant_point_id
4. API stocke dans PostgreSQL avec reference Qdrant
```

**Usage futur:** Si on migre vers pg_vector, ce champ pourrait etre remplace par un vecteur stocke directement en base.

---

## 6. Gestion des erreurs

### Format d'erreur attendu

```json
{
  "detail": "Entity not found",
  "status_code": 404
}
```

### Codes HTTP

| Code | Signification |
|------|---------------|
| 200 | Succes |
| 201 | Cree |
| 400 | Requete invalide |
| 404 | Non trouve |
| 422 | Validation echouee |
| 500 | Erreur serveur |

---

## 7. Authentification

Actuellement: Aucune authentification entre n8n et API (reseau interne).

**Future:** Header `X-Project-ID` pour identifier le projet appelant.

---

## 8. Separation des responsabilites

| Composant | Responsabilite |
|-----------|----------------|
| **n8n** | Orchestration, embeddings, Qdrant |
| **API** | CRUD SQL, filtres, relations |
| **Qdrant** | Recherche semantique (vecteurs) |

### Ce que l'API NE fait PAS

- Generer des embeddings
- Appeler Qdrant
- Recherche semantique

### Ce que n8n NE fait PAS

- Requetes SQL complexes
- Gestion des relations
- Filtres SQL avances

---

## 9. Workflows n8n associes

| Workflow | Appelle API ? | Description |
|----------|---------------|-------------|
| `qdrant-save` | ✅ POST /api/entities/{type} | Sauvegarde apres embedding |
| `entity-list` | ✅ GET /api/entities/{type}/... | CRUD SQL |
| `qdrant-search` | ❌ | Recherche Qdrant directe |
| `qdrant-similar` | ❌ | Similarite Qdrant directe |

---

## 10. Checklist implementation

### PR #210 (CRUD de base)
- [x] POST /api/entities/{type}
- [x] GET /api/entities/{type}/{id}
- [x] PUT /api/entities/{type}/{id}
- [x] DELETE /api/entities/{type}/{id}
- [x] GET /api/entities/{type}/user/{user_id}

### Issue suivante (Filtres)
- [ ] Parametre `limit`
- [ ] Parametre `offset`
- [ ] Filtre `tags`
- [ ] Filtre `difficulty`
- [ ] Filtre `is_public`
- [ ] Filtre `source`

### Optionnel (pg_vector)
- [ ] Stocker embedding en base
- [ ] Endpoint recherche semantique SQL
