# Specification API Backend - Recipes

## Vue d'ensemble

Cette spec definit les endpoints API, schemas de base de donnees, et integrations requises pour le systeme de recettes.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Discord   │────▶│   Plugin    │────▶│     n8n     │
│    Bot      │     │  (Python)   │     │  Workflows  │
└─────────────┘     └──────┬──────┘     └──────┬──────┘
                          │                    │
                          ▼                    ▼
                   ┌─────────────┐     ┌─────────────┐
                   │  API Flask  │◀───▶│   Qdrant    │
                   │  /FastAPI   │     │  (Vectors)  │
                   └──────┬──────┘     └─────────────┘
                          │
         ┌────────────────┼────────────────┐
         ▼                ▼                ▼
  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
  │ PostgreSQL  │  │    Redis    │  │   Celery    │
  │  (Storage)  │  │   (Cache)   │  │  (Timers)   │
  └─────────────┘  └─────────────┘  └──────┬──────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │     n8n     │
                                   │ timer-notify│
                                   └─────────────┘
```

---

## Endpoints API a implementer

### Base URL
```
http://api.example.com/api/v1
```

---

## 1. Recipes CRUD

### POST /api/recipes
Creer/sauvegarder une recette.

**Appele par:** n8n workflow `recipes-save`

**Request:**
```json
{
  "title": "Gateau au chocolat",
  "description": "Un delicieux gateau moelleux",
  "discord_user_id": "123456789",
  "servings": 8,
  "prep_time": 15,
  "cook_time": 25,
  "difficulty": "facile",
  "ingredients": [
    {"name": "chocolat noir", "quantity": 200, "unit": "g"},
    {"name": "beurre", "quantity": 100, "unit": "g"}
  ],
  "instructions": [
    {"order": 1, "instruction": "Prechauffer le four a 180C"}
  ],
  "tags": ["dessert", "chocolat"],
  "nutrition": {
    "calories_per_serving": 350,
    "protein_g": 5,
    "carbs_g": 40,
    "fat_g": 18
  },
  "source": "llm_generated",
  "qdrant_point_id": "qdrant_vector_id"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "recipe_123",
    "created_at": "2026-01-06T19:00:00Z"
  }
}
```

### GET /api/recipes/{id}
Recuperer une recette par ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "recipe_123",
    "title": "Gateau au chocolat",
    ...
  }
}
```

### GET /api/recipes/user/{discord_user_id}
Lister les recettes d'un utilisateur.

**Path params:**
- `discord_user_id` (required)

**Query params:**
- `limit` (default: 20)
- `offset` (default: 0)
- `tags` (optional, comma-separated)

### DELETE /api/recipes/{id}
Supprimer une recette.

---

## 2. Shopping List

### GET /api/shopping-list/{discord_user_id}
Recuperer la liste de courses.

**Path params:**
- `discord_user_id` (required)

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "item_1",
        "name": "chocolat noir",
        "quantity": 200,
        "unit": "g",
        "checked": false,
        "recipe_id": "recipe_123",
        "added_at": "2026-01-06T19:00:00Z"
      }
    ],
    "total_items": 5,
    "checked_items": 2
  }
}
```

### POST /api/shopping-list/{discord_user_id}/items
Ajouter des items a la liste.

**Path params:**
- `discord_user_id` (required)

**Request:**
```json
{
  "items": [
    {"name": "chocolat noir", "quantity": 200, "unit": "g"},
    {"name": "beurre", "quantity": 100, "unit": "g"}
  ],
  "recipe_id": "recipe_123"
}
```

### POST /api/shopping-list/{discord_user_id}/from-recipe/{recipe_id}
Ajouter tous les ingredients d'une recette.

**Path params:**
- `discord_user_id` (required)
- `recipe_id` (required)

### PUT /api/shopping-list/item/{item_id}
Modifier un item (cocher/decocher).

**Request:**
```json
{
  "checked": true
}
```

### DELETE /api/shopping-list/item/{item_id}
Supprimer un item.

### DELETE /api/shopping-list/{discord_user_id}/clear
Vider la liste.

**Path params:**
- `discord_user_id` (required)

**Query params:**
- `checked_only` (optional, default: false)

---

## 3. Timers

### POST /api/recipes/timer
Creer un timer de cuisson.

**Request:**
```json
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

**Response:**
```json
{
  "success": true,
  "data": {
    "timer_id": "timer_abc",
    "expires_at": "2026-01-06T19:15:00Z",
    "created_at": "2026-01-06T19:00:00Z"
  }
}
```

**Backend action:**
1. Stocker en PostgreSQL
2. Scheduler une tache Celery avec le delai

### GET /api/recipes/timers/{discord_user_id}
Lister les timers actifs.

**Path params:**
- `discord_user_id` (required)

**Response:**
```json
{
  "success": true,
  "data": {
    "timers": [
      {
        "timer_id": "timer_abc",
        "label": "Sortir le gateau du four",
        "duration_minutes": 15,
        "expires_at": "2026-01-06T19:15:00Z",
        "remaining_seconds": 542,
        "recipe_title": "Gateau au chocolat"
      }
    ]
  }
}
```

### DELETE /api/recipes/timer/{timer_id}
Annuler un timer.

**Backend action:**
1. Revoquer la tache Celery
2. Supprimer de PostgreSQL

---

## 4. User Preferences

### GET /api/users/{user_id}/preferences
Recuperer les preferences.

**Response:**
```json
{
  "success": true,
  "data": {
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
}
```

### PUT /api/users/{user_id}/preferences
Mettre a jour les preferences.

---

## Schemas PostgreSQL

### Table: recipes
```sql
CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    servings INTEGER,
    prep_time INTEGER,
    cook_time INTEGER,
    difficulty VARCHAR(20),
    ingredients JSONB NOT NULL,
    instructions JSONB NOT NULL,
    tags VARCHAR(50)[],
    nutrition JSONB,
    source VARCHAR(50),
    qdrant_point_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_recipes_discord_user_id ON recipes(discord_user_id);
CREATE INDEX idx_recipes_tags ON recipes USING GIN(tags);
```

> **Note:** Le champ `tips` n'est pas implemente dans l'API actuelle.

### Table: shopping_list_items
```sql
CREATE TABLE shopping_list_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    quantity DECIMAL,
    unit VARCHAR(20),
    checked BOOLEAN DEFAULT FALSE,
    recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_shopping_list_discord_user_id ON shopping_list_items(discord_user_id);
```

### Table: timers
```sql
CREATE TABLE timers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id VARCHAR(100) NOT NULL,
    discord_channel_id VARCHAR(100),
    discord_webhook_url TEXT,
    label VARCHAR(255) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
    recipe_title VARCHAR(255),
    celery_task_id VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending',
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_timers_discord_user_id ON timers(discord_user_id);
CREATE INDEX idx_timers_status ON timers(status);
CREATE INDEX idx_timers_expires_at ON timers(expires_at);
```

### Table: user_preferences
```sql
CREATE TABLE user_preferences (
    user_id VARCHAR(100) PRIMARY KEY,
    language VARCHAR(10) DEFAULT 'fr',
    default_servings INTEGER DEFAULT 4,
    dietary JSONB DEFAULT '{}',
    preferred_difficulty VARCHAR(20),
    max_time_minutes INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Redis Cache

### Convention des cles
```
recipes:{type}:{identifier}
```

### Cles utilisees

| Cle | TTL | Description |
|-----|-----|-------------|
| `recipes:user:{user_id}:list` | 5 min | Liste des recettes user |
| `recipes:recipe:{recipe_id}` | 5 min | Detail d'une recette |
| `recipes:search:{hash}` | 5 min | Resultats de recherche |
| `recipes:session:{user_id}` | 1 heure | Session utilisateur (plugin) |

### Invalidation
Invalider le cache lors de:
- Creation/modification/suppression de recette
- Modification de la shopping list

---

## Celery Tasks

### Task: send_timer_notification

```python
from celery import shared_task
import requests

@shared_task(bind=True)
def send_timer_notification(self, timer_id: str):
    """
    Appele quand un timer expire.
    Envoie une notification via n8n.
    """
    # 1. Recuperer le timer depuis PostgreSQL
    timer = get_timer(timer_id)

    if timer.status != 'pending':
        return  # Timer deja traite ou annule

    # 2. Appeler le webhook n8n
    response = requests.post(
        "http://pi6.local:5678/webhook/recipes-timer-notify",
        json={
            "timer_id": str(timer.id),
            "discord_user_id": timer.discord_user_id,
            "discord_webhook_url": timer.discord_webhook_url,
            "discord_channel_id": timer.discord_channel_id,
            "label": timer.label,
            "duration_minutes": timer.duration_minutes,
            "recipe_id": str(timer.recipe_id) if timer.recipe_id else None,
            "recipe_title": timer.recipe_title,
            "created_at": timer.created_at.isoformat(),
        },
        timeout=10
    )

    # 3. Mettre a jour le status
    if response.status_code == 200:
        update_timer_status(timer_id, 'completed')
    else:
        update_timer_status(timer_id, 'failed')
        raise self.retry(countdown=60, max_retries=3)
```

### Scheduling un timer

```python
from celery import current_app
from datetime import timedelta

def create_timer(discord_user_id, label, duration_minutes, ...):
    # 1. Creer en base
    timer = Timer(
        discord_user_id=discord_user_id,
        label=label,
        duration_minutes=duration_minutes,
        expires_at=datetime.utcnow() + timedelta(minutes=duration_minutes),
        ...
    )
    db.session.add(timer)
    db.session.commit()

    # 2. Scheduler la tache Celery
    task = send_timer_notification.apply_async(
        args=[str(timer.id)],
        countdown=duration_minutes * 60  # en secondes
    )

    # 3. Sauvegarder le task_id pour pouvoir annuler
    timer.celery_task_id = task.id
    db.session.commit()

    return timer
```

### Annuler un timer

```python
def cancel_timer(timer_id):
    timer = Timer.query.get(timer_id)

    if timer.celery_task_id:
        current_app.control.revoke(timer.celery_task_id, terminate=True)

    timer.status = 'cancelled'
    db.session.commit()
```

---

## Integration Qdrant

n8n gere directement l'integration Qdrant via le workflow `recipes-save`:
1. Genere l'embedding avec OpenAI
2. Stocke le vecteur dans Qdrant
3. Appelle `POST /api/recipes` avec le `qdrant_id`

### Collection Qdrant
```
Collection: recipes
Vector size: 1536 (OpenAI ada-002)
Distance: Cosine
```

### Payload stocke
```json
{
  "recipe_id": "recipe_123",
  "user_id": "discord_user_id",
  "title": "Gateau au chocolat",
  "tags": ["dessert", "chocolat"],
  "difficulty": "facile",
  "total_time_minutes": 40
}
```

---

## Variables d'environnement

```env
# PostgreSQL
DATABASE_URL=postgresql://user:pass@localhost:5432/recipes

# Redis
REDIS_URL=redis://localhost:6379/0

# Celery
CELERY_BROKER_URL=redis://localhost:6379/1
CELERY_RESULT_BACKEND=redis://localhost:6379/1

# n8n
N8N_WEBHOOK_URL=http://pi6.local:5678/webhook

# Qdrant (si acces direct necessaire)
QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=recipes
```

---

## Format de reponse standard

Toutes les reponses API doivent suivre ce format:

### Succes
```json
{
  "success": true,
  "data": { ... }
}
```

### Erreur
```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Description de l'erreur",
    "status": "BAD_REQUEST"
  }
}
```

### Codes HTTP
| Code | Usage |
|------|-------|
| 200 | Succes |
| 201 | Creation reussie |
| 400 | Requete invalide |
| 401 | Non authentifie |
| 403 | Non autorise |
| 404 | Ressource non trouvee |
| 429 | Rate limit |
| 500 | Erreur serveur |

---

## Securite

### Authentification
- Utiliser le `user_id` Discord comme identifiant
- Valider que l'utilisateur a acces aux ressources demandees
- Rate limiting par user_id

### Validation
- Valider tous les inputs
- Sanitizer les strings
- Limiter la taille des payloads (ex: 1MB max)

---

## Tests

### Endpoints a tester
```bash
# Creer une recette
curl -X POST http://api.example.com/api/recipes \
  -H "Content-Type: application/json" \
  -d '{"title": "Test", "user_id": "test_user", ...}'

# Lister les recettes d'un utilisateur
curl http://api.example.com/api/recipes/user/discord_user_123

# Creer un timer
curl -X POST http://api.example.com/api/recipes/timer \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test", "label": "Test timer", "duration_minutes": 1, ...}'

# Lister les timers
curl http://api.example.com/api/recipes/timers/discord_user_123

# Ajouter a la shopping list
curl -X POST http://api.example.com/api/shopping-list/discord_user_123/items \
  -H "Content-Type: application/json" \
  -d '{"items": [{"name": "chocolat", "quantity": 200, "unit": "g"}]}'

# Verifier que le timer expire et appelle n8n
# (attendre 1 minute, verifier les logs n8n)
```
