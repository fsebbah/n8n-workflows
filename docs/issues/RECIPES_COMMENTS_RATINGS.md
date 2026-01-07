# Feature: Comments & Ratings pour Recipes

**Date:** 2026-01-07
**Statut:** En cours d'implementation
**Demandeur:** Equipe Plugin Recipe

---

## Statut Implementation API (2026-01-07)

| Endpoint | Status | Notes |
|----------|--------|-------|
| **COMMENTS** | | |
| `POST /api/recipes/{id}/comments` | :white_check_mark: Existe | OK |
| `GET /api/recipes/{id}/comments` | :white_check_mark: Existe | Pagination `offset/limit` au lieu de `page/limit` |
| `DELETE /api/recipes/{id}/comments/{id}` | :x: Manquant | A implementer |
| **RATINGS** | | |
| `POST /api/recipes/{id}/rating` | :white_check_mark: Existe | Upsert OK |
| `GET /api/recipes/{id}/ratings` | :x: Manquant | Stats + distribution demandes |

### Differences de format

| Demande (spec) | Implemente |
|----------------|------------|
| `{"success": true, "comment": {...}}` | Retourne directement l'objet |
| `discord_username` dans comments | Non stocke (optionnel) |
| Colonnes cache `avg_rating`, `rating_count` | Calcule a la volee (OK) |

### Reste a faire (Equipe API)

1. :x: Ajouter `DELETE /api/recipes/{id}/comments/{comment_id}`
2. :x: Ajouter `GET /api/recipes/{id}/ratings` avec distribution
3. :grey_question: Optionnel: ajouter `discord_username` au schema comments

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
    discord_username VARCHAR(100),  -- Optionnel
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

### Modifications table `recipes` (Optionnel - cache)

```sql
-- Colonnes de cache pour eviter les calculs a chaque requete
-- Note: l'API calcule actuellement a la volee, ce qui est acceptable
ALTER TABLE recipes ADD COLUMN avg_rating DECIMAL(2,1) DEFAULT 0;
ALTER TABLE recipes ADD COLUMN rating_count INTEGER DEFAULT 0;
ALTER TABLE recipes ADD COLUMN comment_count INTEGER DEFAULT 0;
```

---

## 2. Endpoints API Backend

**Base URL:** `$env.TORAH_API_URL` (actuellement `http://pi6.local:3031`)

### Comments

| Methode | Endpoint | Status | Description |
|---------|----------|--------|-------------|
| `POST` | `/api/recipes/{recipe_id}/comments` | :white_check_mark: | Ajouter un commentaire |
| `GET` | `/api/recipes/{recipe_id}/comments` | :white_check_mark: | Lister les commentaires |
| `DELETE` | `/api/recipes/{recipe_id}/comments/{comment_id}` | :x: | Supprimer un commentaire |

### Ratings

| Methode | Endpoint | Status | Description |
|---------|----------|--------|-------------|
| `POST` | `/api/recipes/{recipe_id}/rating` | :white_check_mark: | Ajouter ou modifier sa note |
| `GET` | `/api/recipes/{recipe_id}/ratings` | :x: | Obtenir les statistiques de notation |

---

## 3. Specifications API Detaillees

### POST /api/recipes/{recipe_id}/comments :white_check_mark:

**Request:**
```json
{
  "discord_user_id": "636639897767378954",
  "content": "Excellente recette, je recommande!"
}
```

**Response actuelle (201):** *(retourne directement l'objet)*
```json
{
  "id": 123,
  "recipe_id": 45,
  "discord_user_id": "636639897767378954",
  "content": "Excellente recette, je recommande!",
  "created_at": "2026-01-07T14:30:00Z"
}
```

**Errors:**
- `400` - Contenu vide ou invalide
- `404` - Recette non trouvee

---

### GET /api/recipes/{recipe_id}/comments :white_check_mark:

**Query Parameters:**
- `offset` (optional, default: 0)
- `limit` (optional, default: 10, max: 50)

**Response actuelle (200):**
```json
[
  {
    "id": 123,
    "recipe_id": 45,
    "discord_user_id": "636639897767378954",
    "content": "Excellente recette!",
    "created_at": "2026-01-07T14:30:00Z"
  },
  {
    "id": 122,
    "recipe_id": 45,
    "discord_user_id": "123456789",
    "content": "J'ai ajoute un peu de citron, c'etait parfait.",
    "created_at": "2026-01-07T12:00:00Z"
  }
]
```

---

### DELETE /api/recipes/{recipe_id}/comments/{comment_id} :x: A IMPLEMENTER

**Headers:**
- `X-Discord-User-ID`: ID de l'utilisateur (pour verifier ownership)

**Response attendue (200):**
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

### POST /api/recipes/{recipe_id}/rating :white_check_mark:

**Request:**
```json
{
  "discord_user_id": "636639897767378954",
  "rating": 5
}
```

**Response actuelle (200):** *(retourne directement l'objet, upsert OK)*
```json
{
  "id": 456,
  "recipe_id": 45,
  "discord_user_id": "636639897767378954",
  "rating": 5,
  "created_at": "2026-01-07T14:35:00Z",
  "updated_at": "2026-01-07T14:35:00Z"
}
```

**Notes:**
- Si l'utilisateur a deja note, sa note est mise a jour (UPSERT) :white_check_mark:

**Errors:**
- `400` - Rating invalide (doit etre entre 1 et 5)
- `404` - Recette non trouvee

---

### GET /api/recipes/{recipe_id}/ratings :x: A IMPLEMENTER

**Query Parameters:**
- `discord_user_id` (optional) - Pour inclure la note de l'utilisateur

**Response attendue (200):**
```json
{
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

| Workflow | Webhook | API Backend | Status |
|----------|---------|-------------|--------|
| `recipes-add-comment.json` | `POST /webhook/recipes-add-comment` | :white_check_mark: Pret | A creer |
| `recipes-get-comments.json` | `GET /webhook/recipes-get-comments` | :white_check_mark: Pret | A creer |
| `recipes-delete-comment.json` | `DELETE /webhook/recipes-delete-comment` | :x: Attente API | Bloque |
| `recipes-add-rating.json` | `POST /webhook/recipes-add-rating` | :white_check_mark: Pret | A creer |
| `recipes-get-ratings.json` | `GET /webhook/recipes-get-ratings` | :x: Attente API | Bloque |

**Note:** Les workflows pour les endpoints existants peuvent etre crees maintenant.

---

## 5. Plan d'Implementation

### Phase 1 - Backend (Equipe API)
- [x] Creer les tables `recipe_comments` et `recipe_ratings`
- [x] Implementer `POST /api/recipes/{id}/comments`
- [x] Implementer `GET /api/recipes/{id}/comments`
- [x] Implementer `POST /api/recipes/{id}/rating` (upsert)
- [ ] **Implementer `DELETE /api/recipes/{id}/comments/{id}`**
- [ ] **Implementer `GET /api/recipes/{id}/ratings` avec distribution**
- [ ] Optionnel: ajouter `discord_username` au schema

### Phase 2 - Workflows (Equipe n8n)
- [ ] Creer `recipes-add-comment.json` (pret)
- [ ] Creer `recipes-get-comments.json` (pret)
- [ ] Creer `recipes-add-rating.json` (pret)
- [ ] Creer `recipes-delete-comment.json` (attente API)
- [ ] Creer `recipes-get-ratings.json` (attente API)
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
5. **discord_username** - Doit-on le stocker ou le recuperer a l'affichage?

---

## 7. Contacts

| Equipe | Responsable |
|--------|-------------|
| API Backend | A definir |
| n8n Workflows | Claude Code |
| Plugin Discord | A definir |
