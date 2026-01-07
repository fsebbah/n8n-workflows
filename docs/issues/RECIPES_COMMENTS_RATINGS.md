# Feature: Comments & Ratings pour Recipes

**Date:** 2026-01-07
**Statut:** En cours d'implementation
**Demandeur:** Equipe Plugin Recipe

---

## Decisions V1

| Point | Decision | Notes |
|-------|----------|-------|
| **Moderation** | Auteur seul peut supprimer | Pas de role admin en V1 |
| **Signalement** | Non | A considerer en V2 |
| **Limite commentaires** | Illimite | Par user par recette |
| **Longueur max commentaire** | 500 caracteres | Validation API |
| **Notifications** | Oui, DM Discord | Via Plugin (Option A) |
| **Anonymat** | Non | Pseudo Discord toujours visible |
| **Champ createur** | `recipes.discord_user_id` | A confirmer avec equipe API |

---

## Statut Implementation API (2026-01-07)

| Endpoint | Status | Notes |
|----------|--------|-------|
| **COMMENTS** | | |
| `POST /api/recipes/{id}/comments` | :white_check_mark: Existe | OK |
| `GET /api/recipes/{id}/comments` | :white_check_mark: Existe | Pagination `offset/limit` |
| `DELETE /api/recipes/{id}/comments/{id}` | :x: Manquant | A implementer |
| **RATINGS** | | |
| `POST /api/recipes/{id}/rating` | :white_check_mark: Existe | Upsert OK |
| `GET /api/recipes/{id}/ratings` | :x: Manquant | Stats + distribution |

### Reste a faire (Equipe API)

1. :x: Ajouter `DELETE /api/recipes/{id}/comments/{comment_id}`
2. :x: Ajouter `GET /api/recipes/{id}/ratings` avec distribution
3. :grey_question: Confirmer que `recipes.discord_user_id` existe et est retourne par GET
4. :grey_question: Optionnel: ajouter `discord_username` au schema comments

---

## Architecture Notifications

**Decision:** Option A - Le Plugin envoie les DM (bot deja connecte cote plugin)

```
┌─────────────┐  POST /webhook/recipes-add-comment   ┌─────────┐
│   Plugin    │ ─────────────────────────────────────▶│  n8n    │
│   Discord   │                                       │         │
│     Bot     │◀───────────────────────────────────── │         │
└─────────────┘  Response: {success, comment, notify} └─────────┘
      │                                                    │
      │  Si notify present:                                │
      │  Plugin envoie DM au createur                      ▼
      ▼                                               ┌─────────┐
  Discord DM                                          │   API   │
                                                      └─────────┘
```

### Response n8n enrichie

```json
{
  "success": true,
  "comment": {
    "id": 123,
    "recipe_id": 45,
    "discord_user_id": "636639897767378954",
    "content": "Super recette!",
    "created_at": "2026-01-07T14:30:00Z"
  },
  "notify": {
    "type": "new_comment",
    "to_discord_user_id": "999888777",
    "recipe_id": 45,
    "recipe_name": "Cookies au chocolat",
    "from_username": "fsebbah63",
    "preview": "Super recette!"
  }
}
```

### Logique Plugin (exemple)

```javascript
const response = await fetch('/webhook/recipes-add-comment', {...});
const data = await response.json();

// Envoyer DM si notify present et different de l'auteur
if (data.notify?.to_discord_user_id &&
    data.notify.to_discord_user_id !== currentUserId) {
  const user = await client.users.fetch(data.notify.to_discord_user_id);
  await user.send(
    `💬 **${data.notify.from_username}** a commenté votre recette ` +
    `"${data.notify.recipe_name}":\n> ${data.notify.preview}`
  );
}
```

**Note:** Pas de notification si on commente sa propre recette.

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
    content VARCHAR(500) NOT NULL,  -- Max 500 caracteres
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

### Verification table `recipes`

```sql
-- Confirmer que cette colonne existe (createur de la recette)
recipes.discord_user_id VARCHAR(50) NOT NULL
```

---

## 2. Endpoints API Backend

**Base URL:** `$env.TORAH_API_URL`

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
| `GET` | `/api/recipes/{recipe_id}/ratings` | :x: | Obtenir les statistiques |

---

## 3. Specifications API Detaillees

### POST /api/recipes/{recipe_id}/comments :white_check_mark:

**Request:**
```json
{
  "discord_user_id": "636639897767378954",
  "discord_username": "fsebbah63",
  "content": "Excellente recette!"
}
```

**Validation:**
- `content`: requis, max 500 caracteres

**Response (201):**
```json
{
  "id": 123,
  "recipe_id": 45,
  "discord_user_id": "636639897767378954",
  "content": "Excellente recette!",
  "created_at": "2026-01-07T14:30:00Z"
}
```

---

### GET /api/recipes/{recipe_id}/comments :white_check_mark:

**Query Parameters:**
- `offset` (default: 0)
- `limit` (default: 10, max: 50)

**Response (200):**
```json
[
  {
    "id": 123,
    "recipe_id": 45,
    "discord_user_id": "636639897767378954",
    "content": "Excellente recette!",
    "created_at": "2026-01-07T14:30:00Z"
  }
]
```

---

### DELETE /api/recipes/{recipe_id}/comments/{comment_id} :x: A IMPLEMENTER

**Headers:**
- `X-Discord-User-ID`: ID de l'utilisateur (verification ownership)

**Regles:**
- Seul l'auteur du commentaire peut le supprimer
- Retourner 403 si autre utilisateur

**Response (200):**
```json
{
  "success": true,
  "message": "Comment deleted"
}
```

**Errors:**
- `403` - Non autorise (pas l'auteur)
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

**Response (200):**
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

---

### GET /api/recipes/{recipe_id}/ratings :x: A IMPLEMENTER

**Query Parameters:**
- `discord_user_id` (optional) - Pour inclure la note de l'utilisateur

**Response (200):**
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

---

## 4. Workflows n8n

| Workflow | Webhook | API Backend | Status |
|----------|---------|-------------|--------|
| `recipes-add-comment.json` | `POST /webhook/recipes-add-comment` | :white_check_mark: | A creer |
| `recipes-get-comments.json` | `GET /webhook/recipes-get-comments` | :white_check_mark: | A creer |
| `recipes-delete-comment.json` | `DELETE /webhook/recipes-delete-comment` | :x: Attente | Bloque |
| `recipes-add-rating.json` | `POST /webhook/recipes-add-rating` | :white_check_mark: | A creer |
| `recipes-get-ratings.json` | `GET /webhook/recipes-get-ratings` | :x: Attente | Bloque |

### Workflow `recipes-add-comment` - Detail

Le workflow doit:
1. Valider les parametres (recipe_id, discord_user_id, content <= 500 chars)
2. Recuperer la recette via API pour obtenir `creator_discord_user_id` et `title`
3. Appeler `POST /api/recipes/{id}/comments`
4. Construire la reponse avec `notify` si createur != commentateur

---

## 5. Plan d'Implementation

### Phase 1 - Backend (Equipe API)
- [x] Tables `recipe_comments` et `recipe_ratings`
- [x] `POST /api/recipes/{id}/comments`
- [x] `GET /api/recipes/{id}/comments`
- [x] `POST /api/recipes/{id}/rating` (upsert)
- [ ] **`DELETE /api/recipes/{id}/comments/{id}`**
- [ ] **`GET /api/recipes/{id}/ratings`**
- [ ] Confirmer `recipes.discord_user_id` accessible via GET

### Phase 2 - Workflows (Equipe n8n)
- [ ] `recipes-add-comment.json` avec notify
- [ ] `recipes-get-comments.json`
- [ ] `recipes-add-rating.json` avec notify
- [ ] `recipes-delete-comment.json` (attente API)
- [ ] `recipes-get-ratings.json` (attente API)
- [ ] Import et activation n8n

### Phase 3 - Plugin (Equipe Plugin)
- [ ] UI Modal commentaires
- [ ] UI Systeme d'etoiles (1-5)
- [ ] Integration webhooks n8n
- [ ] Envoi DM sur notify

---

## 6. Contacts

| Equipe | Responsable |
|--------|-------------|
| API Backend | A definir |
| n8n Workflows | Claude Code |
| Plugin Discord | A definir |
