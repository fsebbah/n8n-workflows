# Feature: Comments & Ratings pour Recipes

**Date:** 2026-01-07
**Statut:** En attente validation
**Demandeur:** Equipe Plugin Recipe

---

## Contexte

L'equipe plugin demande l'ajout de deux fonctionnalites pour les recettes:
- **Commentaires**: Permettre aux utilisateurs de commenter une recette
- **Ratings**: Permettre aux utilisateurs de noter une recette (1-5 etoiles)

---

## 1. Schema Base de Donnees

### Table `recipe_comments`

```sql
CREATE TABLE recipe_comments (
    id SERIAL PRIMARY KEY,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    discord_user_id VARCHAR(50) NOT NULL,
    discord_username VARCHAR(100),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_comments_recipe ON recipe_comments(recipe_id);
CREATE INDEX idx_comments_user ON recipe_comments(discord_user_id);
```

### Table `recipe_ratings`

```sql
CREATE TABLE recipe_ratings (
    id SERIAL PRIMARY KEY,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    discord_user_id VARCHAR(50) NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(recipe_id, discord_user_id)  -- Une seule note par utilisateur par recette
);

CREATE INDEX idx_ratings_recipe ON recipe_ratings(recipe_id);
```

### Modifications table `recipes`

```sql
-- Colonnes de cache pour eviter les calculs a chaque requete
ALTER TABLE recipes ADD COLUMN avg_rating DECIMAL(2,1) DEFAULT 0;
ALTER TABLE recipes ADD COLUMN rating_count INTEGER DEFAULT 0;
ALTER TABLE recipes ADD COLUMN comment_count INTEGER DEFAULT 0;
```

---

## 2. Endpoints API Backend

**Base URL:** `$env.TORAH_API_URL` (actuellement `http://pi6.local:3031`)

### Comments

| Methode | Endpoint | Description |
|---------|----------|-------------|
| `POST` | `/api/recipes/{recipe_id}/comments` | Ajouter un commentaire |
| `GET` | `/api/recipes/{recipe_id}/comments` | Lister les commentaires |
| `DELETE` | `/api/recipes/{recipe_id}/comments/{comment_id}` | Supprimer un commentaire |

### Ratings

| Methode | Endpoint | Description |
|---------|----------|-------------|
| `POST` | `/api/recipes/{recipe_id}/rating` | Ajouter ou modifier sa note |
| `GET` | `/api/recipes/{recipe_id}/ratings` | Obtenir les statistiques de notation |

---

## 3. Specifications API Detaillees

### POST /api/recipes/{recipe_id}/comments

**Request:**
```json
{
  "discord_user_id": "636639897767378954",
  "discord_username": "fsebbah63",
  "content": "Excellente recette, je recommande!"
}
```

**Response (201):**
```json
{
  "success": true,
  "comment": {
    "id": 123,
    "recipe_id": 45,
    "discord_user_id": "636639897767378954",
    "discord_username": "fsebbah63",
    "content": "Excellente recette, je recommande!",
    "created_at": "2026-01-07T14:30:00Z"
  }
}
```

**Errors:**
- `400` - Contenu vide ou invalide
- `404` - Recette non trouvee

---

### GET /api/recipes/{recipe_id}/comments

**Query Parameters:**
- `page` (optional, default: 1)
- `limit` (optional, default: 10, max: 50)

**Response (200):**
```json
{
  "success": true,
  "recipe_id": 45,
  "comments": [
    {
      "id": 123,
      "discord_user_id": "636639897767378954",
      "discord_username": "fsebbah63",
      "content": "Excellente recette!",
      "created_at": "2026-01-07T14:30:00Z"
    },
    {
      "id": 122,
      "discord_user_id": "123456789",
      "discord_username": "chef_michel",
      "content": "J'ai ajoute un peu de citron, c'etait parfait.",
      "created_at": "2026-01-07T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "total_pages": 3
  }
}
```

---

### DELETE /api/recipes/{recipe_id}/comments/{comment_id}

**Headers:**
- `X-Discord-User-ID`: ID de l'utilisateur (pour verifier ownership)

**Response (200):**
```json
{
  "success": true,
  "message": "Comment deleted"
}
```

**Errors:**
- `403` - Non autorise (pas le proprietaire du commentaire)
- `404` - Commentaire non trouve

---

### POST /api/recipes/{recipe_id}/rating

**Request:**
```json
{
  "discord_user_id": "636639897767378954",
  "rating": 5
}
```

**Response (200):**
```json
{
  "success": true,
  "rating": {
    "id": 456,
    "recipe_id": 45,
    "discord_user_id": "636639897767378954",
    "rating": 5,
    "created_at": "2026-01-07T14:35:00Z",
    "updated_at": "2026-01-07T14:35:00Z"
  },
  "recipe_stats": {
    "avg_rating": 4.3,
    "rating_count": 16
  }
}
```

**Notes:**
- Si l'utilisateur a deja note, sa note est mise a jour (UPSERT)
- Les stats de la recette sont recalculees et mises en cache

**Errors:**
- `400` - Rating invalide (doit etre entre 1 et 5)
- `404` - Recette non trouvee

---

### GET /api/recipes/{recipe_id}/ratings

**Query Parameters:**
- `discord_user_id` (optional) - Pour inclure la note de l'utilisateur

**Response (200):**
```json
{
  "success": true,
  "recipe_id": 45,
  "avg_rating": 4.3,
  "rating_count": 16,
  "distribution": {
    "1": 0,
    "2": 1,
    "3": 2,
    "4": 5,
    "5": 8
  },
  "user_rating": 5
}
```

**Notes:**
- `user_rating` n'est inclus que si `discord_user_id` est fourni
- `user_rating` est `null` si l'utilisateur n'a pas encore note

---

## 4. Workflows n8n

| Workflow | Webhook | Description |
|----------|---------|-------------|
| `recipes-add-comment.json` | `POST /webhook/recipes-add-comment` | Proxy vers API comments |
| `recipes-get-comments.json` | `GET /webhook/recipes-get-comments` | Liste commentaires |
| `recipes-delete-comment.json` | `DELETE /webhook/recipes-delete-comment` | Supprime commentaire |
| `recipes-add-rating.json` | `POST /webhook/recipes-add-rating` | Ajoute/modifie note |
| `recipes-get-ratings.json` | `GET /webhook/recipes-get-ratings` | Stats des notes |

---

## 5. Plan d'Implementation

### Phase 1 - Backend (Equipe API)
- [ ] Creer les tables `recipe_comments` et `recipe_ratings`
- [ ] Ajouter colonnes cache sur `recipes`
- [ ] Implementer les 5 endpoints API
- [ ] Ajouter tests unitaires

### Phase 2 - Workflows (Equipe n8n)
- [ ] Creer les 5 workflows
- [ ] Importer et activer dans n8n
- [ ] Tests d'integration

### Phase 3 - Plugin (Equipe Plugin)
- [ ] UI Modal commentaires
- [ ] UI Systeme d'etoiles
- [ ] Integration avec webhooks n8n

---

## 6. Questions Ouvertes

1. **Moderation des commentaires** - Faut-il un systeme de signalement/moderation?
2. **Limites** - Nombre max de commentaires par user par recette?
3. **Notifications** - Notifier le createur quand sa recette recoit un commentaire/note?
4. **Anonymat** - Peut-on commenter/noter anonymement?

---

## 7. Contacts

| Equipe | Responsable |
|--------|-------------|
| API Backend | A definir |
| n8n Workflows | Claude Code |
| Plugin Discord | A definir |
