# Specification Plugin Discord - Recipes

## Vue d'ensemble

Cette spec definit l'integration entre le plugin Discord et les workflows n8n pour le systeme de recettes.

## Endpoints n8n disponibles

Base URL n8n: `http://pi6.local:5678/webhook/`

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `/webhook/recipes-generate` | POST | Generer une recette via LLM |
| `/webhook/recipes-search` | POST | Recherche semantique dans Qdrant |
| `/webhook/recipes-similar` | POST | Trouver des recettes similaires |
| `/webhook/recipes-save` | POST | Sauvegarder une recette |
| `/webhook/recipes-youtube` | POST | Extraire recette depuis YouTube |
| `/webhook/recipes-web-search` | POST | Recherche web multi-provider |
| `/webhook/recipes-timer-notify` | POST | Notification timer (appele par Celery) |

## Endpoints API directs

Base URL API: `http://api.example.com/api/`

| Endpoint | Methode | Description |
|----------|---------|-------------|
| `/api/recipes` | POST | Creer une recette |
| `/api/recipes/{id}` | GET | Recuperer une recette |
| `/api/recipes/user/{discord_user_id}` | GET | Lister recettes utilisateur |
| `/api/recipes/{id}` | DELETE | Supprimer une recette |
| `/api/shopping-list/{discord_user_id}` | GET | Recuperer liste de courses |
| `/api/shopping-list/{discord_user_id}/items` | POST | Ajouter items |
| `/api/shopping-list/{discord_user_id}/from-recipe/{recipe_id}` | POST | Ajouter depuis recette |
| `/api/shopping-list/item/{item_id}` | PUT | Modifier item |
| `/api/shopping-list/item/{item_id}` | DELETE | Supprimer item |
| `/api/shopping-list/{discord_user_id}/clear` | DELETE | Vider liste |
| `/api/recipes/timer` | POST | Creer timer |
| `/api/recipes/timers/{discord_user_id}` | GET | Lister timers |
| `/api/recipes/timer/{timer_id}` | DELETE | Annuler timer |

---

## Mapping des champs (n8n -> API)

Les workflows n8n transforment automatiquement les champs avant d'appeler l'API:

| Champ n8n (entree) | Champ API (sortie) |
|--------------------|-------------------|
| `user_id` | `discord_user_id` |
| `prep_time_minutes` | `prep_time` |
| `cook_time_minutes` | `cook_time` |
| `steps` | `instructions` |
| `qdrant_id` | `qdrant_point_id` |

> **Note:** Le champ `tips` n'est pas supporte par l'API actuelle.

---

## Format de reponse standard

Toutes les reponses suivent ce format:

```json
{
  "success": true|false,
  "data": { ... },
  "meta": {
    "provider": "string",
    "model": "string",
    "tokens_used": number
  },
  "error": {
    "code": number,
    "message": "string",
    "status": "ERROR_TYPE"
  }
}
```

---

## 1. Generer une recette

### Commande Discord
```
!recette <query>
!recette random
!recette avec poulet, tomates, basilic
```

### Requete n8n
```bash
POST /webhook/recipes-generate
Content-Type: application/json

{
  "query": "gateau au chocolat facile",
  "user_id": "discord_user_id",
  "anthropic_api_key": "sk-ant-...",   # OU
  "openai_api_key": "sk-...",
  "language": "fr",
  "preferences": {
    "vegan": false,
    "vegetarian": false,
    "allergies": ["gluten", "lactose"],
    "max_time_minutes": 30,
    "difficulty": "facile",
    "servings": 4,
    "must_use_ingredients": ["poulet", "tomates"]
  }
}
```

### Reponse
```json
{
  "success": true,
  "data": {
    "recipe": {
      "title": "Gateau au chocolat",
      "description": "Un delicieux gateau moelleux",
      "servings": 8,
      "prep_time_minutes": 15,
      "cook_time_minutes": 25,
      "difficulty": "facile",
      "ingredients": [
        {"name": "chocolat noir", "quantity": 200, "unit": "g"},
        {"name": "beurre", "quantity": 100, "unit": "g"}
      ],
      "steps": [
        {"order": 1, "instruction": "Prechauffer le four a 180C"},
        {"order": 2, "instruction": "Faire fondre le chocolat..."}
      ],
      "tips": ["Utiliser du chocolat de qualite"],
      "tags": ["dessert", "chocolat", "facile"],
      "nutrition": {
        "calories_per_serving": 350,
        "protein_g": 5,
        "carbs_g": 40,
        "fat_g": 18
      }
    },
    "source": "llm_generated"
  },
  "meta": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "tokens_used": 1250
  }
}
```

### Affichage Discord (Embed)
```javascript
{
  title: recipe.title,
  description: recipe.description,
  color: 0x00FF00, // vert
  fields: [
    { name: "Temps", value: `${recipe.prep_time_minutes + recipe.cook_time_minutes} min`, inline: true },
    { name: "Portions", value: `${recipe.servings}`, inline: true },
    { name: "Difficulte", value: recipe.difficulty, inline: true },
    { name: "Ingredients", value: recipe.ingredients.map(i => `- ${i.quantity}${i.unit} ${i.name}`).join('\n') },
    { name: "Etapes", value: recipe.steps.map(s => `${s.order}. ${s.instruction}`).join('\n').substring(0, 1024) }
  ],
  footer: { text: `Genere par ${meta.provider}` }
}
```

---

## 2. Recherche semantique

### Commande Discord
```
!chercher-recette tarte aux pommes grand-mere
```

### Requete n8n
```bash
POST /webhook/recipes-search
Content-Type: application/json

{
  "query": "tarte aux pommes grand-mere",
  "user_id": "discord_user_id",
  "openai_api_key": "sk-...",
  "limit": 5,
  "filters": {
    "difficulty": "facile",
    "max_time_minutes": 60,
    "tags": ["dessert"]
  }
}
```

### Reponse
```json
{
  "success": true,
  "data": {
    "recipes": [
      {
        "id": "recipe_123",
        "title": "Tarte aux pommes de mamie",
        "description": "...",
        "score": 0.92,
        "tags": ["dessert", "traditionnel"]
      }
    ],
    "total_found": 3
  }
}
```

---

## 3. Recettes similaires

### Commande Discord
```
!similaire <recipe_id>
```

### Requete n8n
```bash
POST /webhook/recipes-similar
Content-Type: application/json

{
  "recipe_id": "recipe_123",
  "user_id": "discord_user_id",
  "openai_api_key": "sk-...",
  "limit": 5
}
```

---

## 4. Sauvegarder une recette

### Commande Discord
```
!sauvegarder
(apres affichage d'une recette generee)
```

### Requete n8n
```bash
POST /webhook/recipes-save
Content-Type: application/json

{
  "recipe": { ... },  // L'objet recette complet
  "user_id": "discord_user_id",
  "openai_api_key": "sk-...",
  "source": "llm_generated"
}
```

### Reponse
```json
{
  "success": true,
  "data": {
    "recipe_id": "recipe_456",
    "qdrant_id": "qdrant_789",
    "saved_at": "2026-01-06T19:00:00Z"
  }
}
```

---

## 5. Recette depuis YouTube

### Commande Discord
```
!youtube recette carbonara
!youtube https://youtube.com/watch?v=...
```

### Requete n8n
```bash
POST /webhook/recipes-youtube
Content-Type: application/json

{
  "query": "recette carbonara authentique",  # OU
  "video_url": "https://youtube.com/watch?v=...",
  "user_id": "discord_user_id",
  "google_api_key": "...",
  "anthropic_api_key": "sk-ant-...",
  "language": "fr"
}
```

### Reponse
```json
{
  "success": true,
  "data": {
    "video": {
      "id": "abc123",
      "title": "La vraie carbonara italienne",
      "channel": "Chef Italien",
      "url": "https://youtube.com/watch?v=abc123"
    },
    "recipe": {
      "title": "Carbonara authentique",
      "description": "Extraite de la video...",
      "ingredients": [...],
      "steps": [...]
    },
    "source": "youtube_extracted"
  }
}
```

---

## 6. Recherche Web

### Commande Discord
```
!web-recette meilleur risotto milano
```

### Requete n8n
```bash
POST /webhook/recipes-web-search
Content-Type: application/json

{
  "query": "meilleur risotto milano recette",
  "user_id": "discord_user_id",
  "provider": "gemini",  # gemini (defaut), openai, claude, mistral
  "google_api_key": "...",
  "options": {
    "max_results": 5,
    "language": "fr"
  }
}
```

### Providers disponibles
| Provider | Search Engine | API Key requise |
|----------|---------------|-----------------|
| `gemini` (recommande) | Google | `google_api_key` |
| `openai` | Bing | `openai_api_key` |
| `claude` | Brave | `anthropic_api_key` |
| `mistral` | Brave | `mistral_api_key` |

> **Note**: Mistral ne garantit pas la recherche web (l'agent decide).

---

## 7. Timers de cuisson

### Commande Discord
```
!timer 15 sortir le gateau du four
!timer 30 verifier la cuisson
```

### Flow
1. Plugin -> API backend: `POST /api/recipes/timer`
2. API stocke en PostgreSQL + schedule Celery
3. Celery attend le delai
4. Celery -> n8n: `POST /webhook/recipes-timer-notify`
5. n8n -> Discord webhook

### Creer un timer (API directe)
```bash
POST /api/recipes/timer
Content-Type: application/json

{
  "discord_user_id": "123456789",
  "discord_channel_id": "channel_123",
  "discord_webhook_url": "https://discord.com/api/webhooks/...",
  "label": "Sortir le gateau du four",
  "duration_minutes": 15,
  "recipe_id": "recipe_123",
  "recipe_title": "Gateau au chocolat"
}
```

### Lister les timers actifs
```bash
GET /api/recipes/timers/{discord_user_id}
```

### Annuler un timer
```bash
DELETE /api/recipes/timer/{timer_id}
```

### Notification recue par n8n
```bash
POST /webhook/recipes-timer-notify
Content-Type: application/json

{
  "discord_user_id": "123456789",
  "discord_webhook_url": "https://discord.com/api/webhooks/...",
  "timer_id": "timer_abc",
  "recipe_id": "recipe_123",
  "recipe_title": "Gateau au chocolat",
  "label": "Sortir le gateau du four",
  "duration_minutes": 15
}
```

---

## Gestion des erreurs

### Codes d'erreur
| Code | Status | Description |
|------|--------|-------------|
| 400 | BAD_REQUEST | Parametres manquants ou invalides |
| 401 | UNAUTHORIZED | API key invalide |
| 404 | NOT_FOUND | Recette non trouvee |
| 429 | RATE_LIMITED | Trop de requetes |
| 500 | API_ERROR | Erreur du provider LLM |
| 500 | PARSE_ERROR | Echec du parsing de la reponse |

### Exemple d'erreur
```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Missing required parameter: query",
    "status": "BAD_REQUEST"
  },
  "meta": {
    "provider": "none"
  }
}
```

### Affichage Discord
```javascript
{
  title: "Erreur",
  description: error.message,
  color: 0xFF0000, // rouge
  footer: { text: `Code: ${error.code}` }
}
```

---

## Stockage cote Plugin

### Session utilisateur (Redis recommande)
```
recipes:session:{discord_user_id}
TTL: 1 heure
```

Contenu:
```json
{
  "last_recipe": { ... },
  "last_search_results": [...],
  "preferences": { ... }
}
```

Cela permet:
- `!sauvegarder` sans re-specifier la recette
- `!similaire` sur la derniere recette affichee
- Memoriser les preferences utilisateur

---

## Commandes Discord suggerees

| Commande | Description | Endpoint |
|----------|-------------|----------|
| `!recette <query>` | Generer une recette | n8n: recipes-generate |
| `!recette random` | Recette aleatoire | n8n: recipes-generate |
| `!recette avec <ingredients>` | Par ingredients | n8n: recipes-generate |
| `!chercher <query>` | Recherche semantique | n8n: recipes-search |
| `!similaire [id]` | Recettes similaires | n8n: recipes-similar |
| `!sauvegarder` | Sauvegarder la recette | n8n: recipes-save |
| `!youtube <query\|url>` | Depuis YouTube | n8n: recipes-youtube |
| `!web <query>` | Recherche web | n8n: recipes-web-search |
| `!timer <min> <label>` | Timer cuisson | API: POST /api/recipes/timer |
| `!timers` | Lister timers | API: GET /api/recipes/timers/{user} |
| `!timer-stop <id>` | Annuler timer | API: DELETE /api/recipes/timer/{id} |
| `!liste add <item>` | Ajouter a la liste | API: POST /api/shopping-list/{user}/items |
| `!liste show` | Afficher la liste | API: GET /api/shopping-list/{user} |
| `!liste check <id>` | Cocher item | API: PUT /api/shopping-list/item/{id} |
| `!liste remove <id>` | Supprimer item | API: DELETE /api/shopping-list/item/{id} |
| `!liste clear` | Vider la liste | API: DELETE /api/shopping-list/{user}/clear |
| `!mes-recettes` | Mes recettes | API: GET /api/recipes/user/{user} |

---

## Variables d'environnement requises

```env
# n8n
N8N_WEBHOOK_URL=http://pi6.local:5678/webhook

# API Keys (a recuperer depuis le backend ou config)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Discord
DISCORD_RECIPES_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Backend API
RECIPES_API_URL=http://api.example.com
```
