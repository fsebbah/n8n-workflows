# Guide d'Integration n8n - Plugin Recipes

> Document a destination de l'equipe n8n pour l'integration avec l'API Recipes.

**Version API:** 1.0
**Date:** 2026-01-07
**Base URL:** `http://api.torah.solutions/api`

---

## Table des matieres

1. [Mapping des champs](#1-mapping-des-champs)
2. [Recipes - CRUD](#2-recipes---crud)
3. [Shopping List](#3-shopping-list)
4. [Timers](#4-timers)
5. [User Preferences](#5-user-preferences)
6. [Social Features](#6-social-features)
7. [Webhook Timer Notification](#7-webhook-timer-notification)
8. [Codes d'erreur](#8-codes-derreur)

---

## 1. Mapping des champs

> **Important:** Les noms de champs entre la spec initiale et l'API implementee different legerement.

| Votre spec | Champ API | Notes |
|------------|-----------|-------|
| `user_id` | `discord_user_id` | Identifiant Discord |
| `prep_time_minutes` | `prep_time` | Valeur en minutes (sans suffixe) |
| `cook_time_minutes` | `cook_time` | Valeur en minutes (sans suffixe) |
| `steps` | `instructions` | Liste des etapes |
| `qdrant_id` | `qdrant_point_id` | ID du vecteur Qdrant |
| `checked` | `is_checked` | Boolean pour items shopping |

---

## 2. Recipes - CRUD

### 2.1 Creer une recette

```
POST /api/recipes
```

**Request Body:**
```json
{
  "discord_user_id": "123456789012345678",
  "title": "Gateau au chocolat",
  "description": "Un delicieux gateau moelleux au chocolat noir",
  "servings": 8,
  "prep_time": 15,
  "cook_time": 25,
  "difficulty": "facile",
  "ingredients": [
    {"name": "chocolat noir", "quantity": 200, "unit": "g"},
    {"name": "beurre", "quantity": 100, "unit": "g"},
    {"name": "sucre", "quantity": 150, "unit": "g"},
    {"name": "oeufs", "quantity": 3, "unit": "pieces"},
    {"name": "farine", "quantity": 50, "unit": "g"}
  ],
  "instructions": [
    {"order": 1, "instruction": "Prechauffer le four a 180°C"},
    {"order": 2, "instruction": "Faire fondre le chocolat avec le beurre au bain-marie"},
    {"order": 3, "instruction": "Melanger les oeufs avec le sucre"},
    {"order": 4, "instruction": "Incorporer le chocolat fondu"},
    {"order": 5, "instruction": "Ajouter la farine"},
    {"order": 6, "instruction": "Enfourner 25 minutes"}
  ],
  "tags": ["dessert", "chocolat", "facile"],
  "nutrition": {
    "calories_per_serving": 350,
    "protein_g": 5,
    "carbs_g": 40,
    "fat_g": 18
  },
  "source": "llm_generated",
  "qdrant_point_id": "abc123-def456",
  "is_public": true,
  "language": "fr",
  "llm_metadata": {
    "provider": "anthropic",
    "model": "claude-3-5-sonnet",
    "tokens_used": 1500,
    "processing_time_ms": 2300
  }
}
```

**Champs obligatoires:** `discord_user_id`, `title`

**Valeurs pour `source`:** `llm_generated`, `user_created`, `web_import`, `youtube_import`

**Valeurs pour `difficulty`:** `facile`, `moyen`, `difficile`

**Response (201):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "discord_user_id": "123456789012345678",
  "title": "Gateau au chocolat",
  "description": "Un delicieux gateau moelleux au chocolat noir",
  "ingredients": [...],
  "instructions": [...],
  "prep_time": 15,
  "cook_time": 25,
  "servings": 8,
  "difficulty": "facile",
  "tags": ["dessert", "chocolat", "facile"],
  "nutrition": {...},
  "source": "llm_generated",
  "llm_metadata": {...},
  "qdrant_point_id": "abc123-def456",
  "is_public": true,
  "language": "fr",
  "average_rating": null,
  "rating_count": 0,
  "created_at": "2026-01-07T10:00:00Z",
  "updated_at": "2026-01-07T10:00:00Z"
}
```

---

### 2.2 Recuperer une recette

```
GET /api/recipes/{recipe_id}
```

**Exemple:** `GET /api/recipes/550e8400-e29b-41d4-a716-446655440000`

**Response (200):** Meme format que la creation

---

### 2.3 Lister les recettes d'un utilisateur

```
GET /api/recipes/user/{discord_user_id}?limit=20&offset=0
```

**Parametres query:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `limit` | int | 20 | Nombre max de recettes (1-100) |
| `offset` | int | 0 | Pour pagination |

**Exemple:** `GET /api/recipes/user/123456789012345678?limit=10&offset=0`

**Response (200):**
```json
{
  "recipes": [
    {
      "id": "...",
      "title": "Gateau au chocolat",
      "average_rating": 4.5,
      "rating_count": 12,
      ...
    }
  ],
  "total": 42,
  "limit": 10,
  "offset": 0
}
```

---

### 2.4 Modifier une recette

```
PUT /api/recipes/{recipe_id}
```

Seuls les champs fournis sont modifies.

**Request Body:**
```json
{
  "title": "Gateau au chocolat fondant",
  "servings": 6,
  "tags": ["dessert", "chocolat", "fondant"]
}
```

---

### 2.5 Supprimer une recette

```
DELETE /api/recipes/{recipe_id}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Recipe deleted"
}
```

---

## 3. Shopping List

### 3.1 Recuperer la liste de courses

```
GET /api/shopping-list/{discord_user_id}
```

**Response (200):**
```json
{
  "id": "list-uuid",
  "discord_user_id": "123456789012345678",
  "name": "Ma liste de courses",
  "items": [
    {
      "id": "item-uuid-1",
      "name": "chocolat noir",
      "quantity": 200,
      "unit": "g",
      "is_checked": false,
      "recipe_id": "recipe-uuid",
      "category": "epicerie",
      "created_at": "2026-01-07T10:00:00Z"
    },
    {
      "id": "item-uuid-2",
      "name": "beurre",
      "quantity": 100,
      "unit": "g",
      "is_checked": true,
      "recipe_id": "recipe-uuid",
      "category": "frais",
      "created_at": "2026-01-07T10:00:00Z"
    }
  ],
  "created_at": "2026-01-07T10:00:00Z",
  "updated_at": "2026-01-07T10:30:00Z"
}
```

---

### 3.2 Ajouter un item

```
POST /api/shopping-list/{discord_user_id}/items
```

**Request Body:**
```json
{
  "name": "chocolat noir",
  "quantity": 200,
  "unit": "g",
  "category": "epicerie",
  "recipe_id": "recipe-uuid"
}
```

**Champs obligatoires:** `name`

---

### 3.3 Ajouter tous les ingredients d'une recette

```
POST /api/shopping-list/{discord_user_id}/from-recipe/{recipe_id}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Added 5 ingredients to shopping list",
  "items_added": 5
}
```

---

### 3.4 Modifier un item (cocher/decocher)

```
PUT /api/shopping-list/item/{item_id}
```

**Request Body:**
```json
{
  "is_checked": true
}
```

Ou modifier d'autres champs:
```json
{
  "quantity": 300,
  "unit": "g"
}
```

---

### 3.5 Supprimer un item

```
DELETE /api/shopping-list/item/{item_id}
```

---

### 3.6 Vider la liste

```
DELETE /api/shopping-list/{discord_user_id}/clear?checked_only=false
```

**Parametres query:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `checked_only` | bool | false | Si true, supprime uniquement les items coches |

**Response (200):**
```json
{
  "success": true,
  "message": "Removed 8 items",
  "items_removed": 8
}
```

---

## 4. Timers

### 4.1 Creer un timer

```
POST /api/recipes/timer
```

**Request Body:**
```json
{
  "discord_user_id": "123456789012345678",
  "discord_channel_id": "987654321098765432",
  "discord_webhook_url": "https://discord.com/api/webhooks/xxx/yyy",
  "recipe_id": "recipe-uuid",
  "recipe_title": "Gateau au chocolat",
  "label": "Sortir le gateau du four",
  "duration_minutes": 25
}
```

**Champs obligatoires:** `discord_user_id`, `discord_channel_id`, `label`, `duration_minutes`

**Limites:** `duration_minutes` entre 1 et 1440 (24h max)

**Response (200):**
```json
{
  "id": "timer-uuid",
  "discord_user_id": "123456789012345678",
  "discord_channel_id": "987654321098765432",
  "discord_webhook_url": "https://discord.com/api/webhooks/xxx/yyy",
  "recipe_id": "recipe-uuid",
  "recipe_title": "Gateau au chocolat",
  "label": "Sortir le gateau du four",
  "duration_minutes": 25,
  "celery_task_id": "celery-task-xxx",
  "expires_at": "2026-01-07T10:25:00Z",
  "remaining_seconds": null,
  "status": "active",
  "created_at": "2026-01-07T10:00:00Z"
}
```

---

### 4.2 Lister les timers d'un utilisateur

```
GET /api/recipes/timers/{discord_user_id}?status=active
```

**Parametres query:**
| Param | Type | Default | Valeurs |
|-------|------|---------|---------|
| `status` | string | active | `active`, `completed`, `cancelled`, `all` |

**Response (200):**
```json
{
  "timers": [
    {
      "id": "timer-uuid",
      "discord_user_id": "123456789012345678",
      "discord_channel_id": "987654321098765432",
      "discord_webhook_url": "https://discord.com/api/webhooks/xxx/yyy",
      "recipe_id": "recipe-uuid",
      "recipe_title": "Gateau au chocolat",
      "label": "Sortir le gateau du four",
      "duration_minutes": 25,
      "expires_at": "2026-01-07T10:25:00Z",
      "remaining_seconds": 542,
      "status": "active",
      "created_at": "2026-01-07T10:00:00Z"
    }
  ],
  "total": 1
}
```

> **Note:** `remaining_seconds` est calcule dynamiquement pour les timers actifs.

---

### 4.3 Annuler un timer

```
DELETE /api/recipes/timer/{timer_id}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Timer cancelled"
}
```

---

## 5. User Preferences

### 5.1 Recuperer les preferences

```
GET /api/users/{discord_user_id}/preferences
```

> Cree automatiquement des preferences par defaut si l'utilisateur n'en a pas.

**Response (200):**
```json
{
  "discord_user_id": "123456789012345678",
  "language": "fr",
  "default_servings": 4,
  "dietary": {
    "vegan": false,
    "vegetarian": true,
    "allergies": ["gluten", "lactose"]
  },
  "preferred_difficulty": "facile",
  "max_time_minutes": 60,
  "created_at": "2026-01-07T10:00:00Z",
  "updated_at": "2026-01-07T10:00:00Z"
}
```

---

### 5.2 Modifier les preferences

```
PUT /api/users/{discord_user_id}/preferences
```

**Request Body:**
```json
{
  "language": "fr",
  "default_servings": 4,
  "dietary": {
    "vegan": false,
    "vegetarian": true,
    "allergies": ["gluten"]
  },
  "preferred_difficulty": "facile",
  "max_time_minutes": 60
}
```

**Valeurs pour `preferred_difficulty`:** `facile`, `moyen`, `difficile`

**Limites:**
- `default_servings`: 1-20
- `max_time_minutes`: 5-480

---

## 6. Social Features

### 6.1 Favoris

**Ajouter aux favoris:**
```
POST /api/recipes/{recipe_id}/favorite
Content-Type: application/json

{"discord_user_id": "123456789012345678"}
```

**Retirer des favoris:**
```
DELETE /api/recipes/{recipe_id}/favorite/{discord_user_id}
```

**Lister les favoris:**
```
GET /api/recipes/favorites/{discord_user_id}
```

---

### 6.2 Commentaires

**Ajouter un commentaire:**
```
POST /api/recipes/{recipe_id}/comments
Content-Type: application/json

{
  "discord_user_id": "123456789012345678",
  "content": "Excellente recette, tres facile a realiser !"
}
```

**Lister les commentaires:**
```
GET /api/recipes/{recipe_id}/comments
```

---

### 6.3 Notes

**Ajouter/modifier une note (upsert):**
```
POST /api/recipes/{recipe_id}/rating
Content-Type: application/json

{
  "discord_user_id": "123456789012345678",
  "score": 5
}
```

> `score` doit etre entre 1 et 5.

---

## 7. Webhook Timer Notification

Quand un timer expire, l'API appelle votre webhook n8n.

**Webhook URL:** Configure dans `N8N_TIMER_WEBHOOK_URL`
**Default:** `http://pi6.local:5678/webhook/recipes-timer-notify`

**Payload envoye par l'API:**
```json
{
  "timer_id": "timer-uuid",
  "discord_user_id": "123456789012345678",
  "discord_channel_id": "987654321098765432",
  "discord_webhook_url": "https://discord.com/api/webhooks/xxx/yyy",
  "recipe_id": "recipe-uuid",
  "recipe_title": "Gateau au chocolat",
  "label": "Sortir le gateau du four"
}
```

**Workflow n8n suggere:**
1. Recevoir le webhook
2. Utiliser `discord_webhook_url` si fourni pour envoyer directement
3. Sinon, utiliser `discord_channel_id` pour poster via bot

---

## 8. Codes d'erreur

| Code | Signification |
|------|---------------|
| 200 | Succes |
| 201 | Creation reussie |
| 400 | Requete invalide (champ manquant, format incorrect) |
| 404 | Ressource non trouvee |
| 500 | Erreur serveur |

**Format erreur:**
```json
{
  "detail": "Recipe not found"
}
```

---

## Exemples de workflows n8n

### Workflow: Sauvegarder une recette generee

```
1. [Webhook] Recevoir demande Discord
2. [OpenAI/Claude] Generer la recette
3. [Qdrant] Stocker le vecteur
4. [HTTP Request] POST /api/recipes avec qdrant_point_id
5. [Discord] Confirmer la sauvegarde
```

### Workflow: Timer notification

```
1. [Webhook] recipes-timer-notify
2. [IF] discord_webhook_url existe ?
   - Oui: [HTTP Request] POST vers webhook Discord
   - Non: [Discord Bot] Envoyer message dans channel
```

### Workflow: Ajouter ingredients au panier

```
1. [Webhook] Recevoir recipe_id
2. [HTTP Request] POST /api/shopping-list/{user}/from-recipe/{recipe_id}
3. [Discord] Confirmer "X ingredients ajoutes"
```

---

## Contact

Pour toute question sur l'API, contacter l'equipe API.
