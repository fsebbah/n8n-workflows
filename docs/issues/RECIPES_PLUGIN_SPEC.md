# Specification Plugin Discord - Recipes

## Vue d'ensemble

Cette spec definit l'integration entre le plugin Discord et les workflows n8n pour le systeme de recettes.

**Principe : Le plugin appelle UNIQUEMENT les webhooks n8n. Jamais l'API backend directement.**

```
┌────────────────────────────────────────────────────────────────────┐
│                        PLUGIN DISCORD                               │
│                                                                     │
│  /recette gateau ──────────────────────┐                           │
│  /timer 15 sortir gateau ──────────────┼───▶ n8n Webhooks          │
│  /liste add chocolat ──────────────────┘                           │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                          n8n WORKFLOWS                              │
│                                                                     │
│  recipes-generate ────▶ Anthropic/OpenAI                           │
│  recipes-search ──────▶ OpenAI Embeddings + Qdrant                 │
│  recipes-save ────────▶ Qdrant + API Backend                       │
│  recipes-timer ───────▶ API Backend (Celery)                       │
│  recipes-shopping ────▶ API Backend                                │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│                        API BACKEND                                  │
│            (PostgreSQL, Redis, Celery, Qdrant)                     │
│                   Jamais appele directement par le plugin          │
└────────────────────────────────────────────────────────────────────┘
```

---

## Authentification

**Aucune authentification n8n requise.** Les webhooks sont publics (reseau interne).

Les cles API LLM sont passees dans le body de chaque requete :

```python
import httpx

# Pattern standard - comme Torah
response = httpx.post(
    "http://pi6.local:5678/webhook/recipes-generate",
    json={
        "query": "gateau au chocolat",
        "user_id": str(interaction.user.id),
        "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY"),  # Pour LLM
        "openai_api_key": os.getenv("OPENAI_API_KEY")         # Pour LLM
    }
)
```

---

## Endpoints n8n disponibles

Base URL: `http://pi6.local:5678/webhook/`

| Endpoint | Description | Status |
|----------|-------------|--------|
| `/webhook/recipes-generate` | Generer une recette via LLM | ✅ Actif |
| `/webhook/recipes-search` | Recherche semantique Qdrant | ✅ Actif |
| `/webhook/recipes-similar` | Recettes similaires | ✅ Actif |
| `/webhook/recipes-save` | Sauvegarder une recette | ✅ Actif |
| `/webhook/recipes-youtube` | Extraire recette YouTube | ✅ Actif |
| `/webhook/recipes-web-search` | Recherche web multi-provider | ✅ Actif |
| `/webhook/recipes-timer-notify` | Notification timer via DM (Celery→n8n→Discord DM) | ✅ Actif |
| `/webhook/recipes-timer` | Creer/gerer timers | ✅ Actif |
| `/webhook/recipes-shopping` | Gerer shopping list | ✅ Actif |
| `/webhook/recipes-list` | Lister mes recettes | ✅ Actif |

---

## Format de reponse standard

Toutes les reponses suivent ce format :

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "provider": "anthropic|openai|qdrant",
    "model": "claude-sonnet-4-20250514",
    "tokens_used": 1250
  }
}
```

### Erreur

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Missing required parameter: query",
    "status": "BAD_REQUEST"
  }
}
```

---

## 1. Generer une recette

### Commande Discord (Slash Command)
```
/recette gateau au chocolat
/recette random
/recette avec poulet, tomates, basilic
```

### Implementation Python
```python
async def generate_recipe(query: str, user_id: str, preferences: dict = None):
    payload = {
        "query": query,
        "user_id": user_id,
        "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY"),
        "language": "fr",
        "preferences": preferences or {}
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-generate",
            json=payload,
            timeout=60.0  # LLM peut etre lent
        )

    return response.json()
```

### Requete
```json
POST /webhook/recipes-generate

{
  "query": "gateau au chocolat facile",
  "user_id": "123456789012345678",
  "anthropic_api_key": "sk-ant-...",
  "language": "fr",
  "preferences": {
    "vegan": false,
    "vegetarian": false,
    "allergies": ["gluten"],
    "max_time_minutes": 30,
    "difficulty": "facile",
    "servings": 4,
    "must_use_ingredients": ["chocolat"]
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
        {"name": "chocolat noir", "quantity": 200, "unit": "g"}
      ],
      "steps": [
        {"order": 1, "instruction": "Prechauffer le four a 180C"}
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

---

## 2. Recherche semantique

### Commande Discord (Slash Command)
```
/chercher tarte aux pommes grand-mere
```

### Implementation Python
```python
async def search_recipes(query: str, user_id: str, limit: int = 5):
    payload = {
        "query": query,
        "user_id": user_id,
        "openai_api_key": os.getenv("OPENAI_API_KEY"),  # Pour embeddings
        "limit": limit
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-search",
            json=payload,
            timeout=30.0
        )

    return response.json()
```

---

## 3. Sauvegarder une recette

### Commande Discord (Slash Command)
```
/sauvegarder
```

### Implementation Python
```python
async def save_recipe(recipe: dict, user_id: str):
    payload = {
        "recipe": recipe,  # L'objet recette complet
        "user_id": user_id,
        "openai_api_key": os.getenv("OPENAI_API_KEY"),  # Pour embedding Qdrant
        "source": "llm_generated"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-save",
            json=payload,
            timeout=30.0
        )

    return response.json()
```

---

## 4. Recette depuis YouTube

### Commande Discord (Slash Command)
```
/youtube recette carbonara
/youtube https://youtube.com/watch?v=xxx
```

### Implementation Python
```python
async def extract_from_youtube(query_or_url: str, user_id: str):
    payload = {
        "user_id": user_id,
        "google_api_key": os.getenv("GOOGLE_API_KEY"),
        "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY"),
        "language": "fr"
    }

    if query_or_url.startswith("http"):
        payload["video_url"] = query_or_url
    else:
        payload["query"] = query_or_url

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-youtube",
            json=payload,
            timeout=60.0
        )

    return response.json()
```

---

## 5. Recherche Web

### Commande Discord (Slash Command)
```
/web meilleur risotto milano
```

### Implementation Python
```python
async def web_search(query: str, user_id: str, provider: str = "gemini"):
    payload = {
        "query": query,
        "user_id": user_id,
        "provider": provider,
        "google_api_key": os.getenv("GOOGLE_API_KEY"),
        "options": {
            "max_results": 5,
            "language": "fr"
        }
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-web-search",
            json=payload,
            timeout=60.0
        )

    return response.json()
```

---

## 6. Timers de cuisson

### Flow complet (DM prive)

```
Plugin                n8n                 API/Celery              Discord
  │                    │                      │                      │
  │  /timer 15 gateau  │                      │                      │
  │───────────────────▶│  POST /api/timer     │                      │
  │                    │─────────────────────▶│                      │
  │                    │                      │  schedule(15min)     │
  │                    │  {timer_id, ok}      │                      │
  │◀───────────────────│◀─────────────────────│                      │
  │                    │                      │                      │
  │    ... 15 min ...  │                      │                      │
  │                    │                      │                      │
  │                    │  POST /webhook/      │                      │
  │                    │  recipes-timer-notify│                      │
  │                    │◀─────────────────────│                      │
  │                    │                      │                      │
  │                    │  Discord Bot API     │                      │
  │                    │  Create DM + Send    │                      │
  │                    │─────────────────────────────────────────────▶│
  │                    │                      │            DM prive  │
```

### Notification par DM prive (Option B)

**Choix de l'equipe : DM prive au lieu de channel public**

Avantages :
- Notification privee, pas de spam dans les channels
- Pas besoin de creer un channel #timers
- Pas besoin de webhook Discord

Configuration :
1. Le bot token est stocke dans n8n comme variable d'environnement `DISCORD_BOT_TOKEN`
2. Ou passe dans chaque requete via `discord_bot_token`

Flow n8n (recipes-timer-notify) :
1. Recevoir le webhook de Celery
2. Creer un channel DM : `POST https://discord.com/api/v10/users/@me/channels`
3. Envoyer le message dans le DM : `POST https://discord.com/api/v10/channels/{id}/messages`

### Implementation Python

```python
async def create_timer(user_id: str, label: str, duration_minutes: int,
                       discord_channel_id: str = None, recipe_id: str = None):
    """Creer un timer de cuisson"""
    payload = {
        "action": "create",
        "user_id": user_id,
        "discord_channel_id": discord_channel_id,  # Optionnel (tracking uniquement)
        "label": label,
        "duration_minutes": duration_minutes,  # 1-1440 (24h max)
        "recipe_id": recipe_id,
        "recipe_title": "Gateau au chocolat"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-timer",
            json=payload,
            timeout=30.0
        )

    return response.json()


async def list_timers(user_id: str, status: str = "active"):
    """Lister les timers (active, completed, cancelled, all)"""
    payload = {
        "action": "list",
        "user_id": user_id,
        "status": status
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-timer",
            json=payload,
            timeout=30.0
        )

    return response.json()


async def cancel_timer(user_id: str, timer_id: str):
    """Annuler un timer"""
    payload = {
        "action": "cancel",
        "user_id": user_id,
        "timer_id": timer_id
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-timer",
            json=payload,
            timeout=30.0
        )

    return response.json()
```

### Configuration n8n pour DM

Variable d'environnement a configurer dans n8n :

```env
DISCORD_BOT_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.xxxxx.yyyyy
```

Le workflow `recipes-timer-notify` utilise ce token pour envoyer les DM.

---

## 7. Shopping List

### Architecture

```
/liste (Discord)  →  recipes-shopping (n8n)  →  API Backend (PostgreSQL)
     ^                      ^                           ^
   Slash command        Webhook n8n              Persistance
```

**Note:** L'ancienne implementation Redis est remplacee par l'appel n8n pour une persistance long terme dans PostgreSQL.

### Implementation Python

```python
async def get_shopping_list(user_id: str):
    """Recuperer la liste de courses"""
    payload = {
        "action": "get",
        "user_id": user_id
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-shopping",
            json=payload,
            timeout=30.0
        )

    return response.json()


async def add_item(user_id: str, name: str, quantity: float = None,
                   unit: str = None, category: str = None):
    """Ajouter un item a la liste"""
    payload = {
        "action": "add",
        "user_id": user_id,
        "name": name,
        "quantity": quantity,
        "unit": unit,
        "category": category
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-shopping",
            json=payload,
            timeout=30.0
        )

    return response.json()


async def add_from_recipe(user_id: str, recipe_id: str):
    """Ajouter tous les ingredients d'une recette"""
    payload = {
        "action": "add_from_recipe",
        "user_id": user_id,
        "recipe_id": recipe_id
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-shopping",
            json=payload,
            timeout=30.0
        )

    return response.json()


async def check_item(user_id: str, item_id: str, is_checked: bool = True):
    """Cocher/decocher un item"""
    payload = {
        "action": "check",
        "user_id": user_id,
        "item_id": item_id,
        "is_checked": is_checked
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-shopping",
            json=payload,
            timeout=30.0
        )

    return response.json()


async def remove_item(user_id: str, item_id: str):
    """Supprimer un item"""
    payload = {
        "action": "remove",
        "user_id": user_id,
        "item_id": item_id
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-shopping",
            json=payload,
            timeout=30.0
        )

    return response.json()


async def clear_list(user_id: str, checked_only: bool = False):
    """Vider la liste (tout ou seulement les items coches)"""
    payload = {
        "action": "clear",
        "user_id": user_id,
        "checked_only": checked_only
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-shopping",
            json=payload,
            timeout=30.0
        )

    return response.json()
```

---

## 8. Mes Recettes

### Implementation Python

```python
async def list_my_recipes(user_id: str, limit: int = 20, offset: int = 0,
                          tags: str = None):
    """Lister mes recettes"""
    payload = {
        "action": "list",
        "user_id": user_id,
        "limit": limit,
        "offset": offset,
        "tags": tags  # comma-separated
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-list",
            json=payload,
            timeout=30.0
        )

    return response.json()


async def get_recipe(recipe_id: str):
    """Recuperer une recette par ID"""
    payload = {
        "action": "get",
        "recipe_id": recipe_id
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-list",
            json=payload,
            timeout=30.0
        )

    return response.json()


async def delete_recipe(recipe_id: str):
    """Supprimer une recette"""
    payload = {
        "action": "delete",
        "recipe_id": recipe_id
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{N8N_WEBHOOK_URL}/recipes-list",
            json=payload,
            timeout=30.0
        )

    return response.json()
```

---

## Variables d'environnement Plugin

```env
# n8n Webhooks (obligatoire)
N8N_WEBHOOK_URL=http://pi6.local:5678/webhook

# Cles API LLM (passees dans chaque requete)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=...

# Discord Bot Token (pour notifications timer via DM)
# Note: Ce token est configure dans n8n, pas dans le plugin
# DISCORD_BOT_TOKEN=...  # Configure dans n8n
```

### Variables d'environnement n8n

```env
# Discord Bot Token (pour envoyer les DM de notification timer)
DISCORD_BOT_TOKEN=MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.xxxxx.yyyyy

# API Backend
API_BASE_URL=http://api.torah.solutions/api

# Qdrant (pour recherche semantique)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=...
```

---

## Stockage cote Plugin (Redis)

```python
# Session utilisateur pour /sauvegarder et /similaire
REDIS_KEY = f"recipes:session:{user_id}"
TTL = 3600  # 1 heure

session = {
    "last_recipe": {...},        # Derniere recette generee
    "last_search_results": [...], # Derniers resultats de recherche
    "preferences": {...}          # Preferences utilisateur
}
```

---

## Commandes Discord

| Commande | Endpoint n8n | Status |
|----------|--------------|--------|
| `/recette <query>` | recipes-generate | ✅ |
| `/recette random` | recipes-generate | ✅ |
| `/recette avec <ingredients>` | recipes-generate | ✅ |
| `/chercher <query>` | recipes-search | ✅ |
| `/similaire [id]` | recipes-similar | ✅ |
| `/sauvegarder` | recipes-save | ✅ |
| `/youtube <query\|url>` | recipes-youtube | ✅ |
| `/web <query>` | recipes-web-search | ✅ |
| `/timer <min> <label>` | recipes-timer | ✅ |
| `/timers` | recipes-timer (action=list) | ✅ |
| `/timer-stop <id>` | recipes-timer (action=cancel) | ✅ |
| `/liste add <item>` | recipes-shopping (action=add) | ✅ |
| `/liste show` | recipes-shopping (action=get) | ✅ |
| `/liste check <id>` | recipes-shopping (action=check) | ✅ |
| `/liste clear` | recipes-shopping (action=clear) | ✅ |
| `/liste recette <id>` | recipes-shopping (action=add_from_recipe) | ✅ |
| `/mes-recettes` | recipes-list (action=list) | ✅ |
| `/recette-detail <id>` | recipes-list (action=get) | ✅ |
| `/supprimer-recette <id>` | recipes-list (action=delete) | ✅ |

---

## Codes d'erreur

| Code | Status | Description |
|------|--------|-------------|
| 400 | BAD_REQUEST | Parametres manquants ou invalides |
| 401 | UNAUTHORIZED | API key invalide |
| 404 | NOT_FOUND | Recette non trouvee |
| 429 | RATE_LIMITED | Trop de requetes |
| 500 | API_ERROR | Erreur du provider LLM |
| 500 | PARSE_ERROR | Echec du parsing de la reponse |

---

## Affichage Discord (Embed)

```python
def recipe_to_embed(recipe: dict, meta: dict) -> discord.Embed:
    embed = discord.Embed(
        title=recipe["title"],
        description=recipe["description"],
        color=discord.Color.green()
    )

    total_time = recipe.get("prep_time_minutes", 0) + recipe.get("cook_time_minutes", 0)
    embed.add_field(name="⏱️ Temps", value=f"{total_time} min", inline=True)
    embed.add_field(name="🍽️ Portions", value=str(recipe.get("servings", 4)), inline=True)
    embed.add_field(name="📊 Difficulte", value=recipe.get("difficulty", "moyen"), inline=True)

    ingredients = "\n".join([
        f"• {i['quantity']}{i['unit']} {i['name']}"
        for i in recipe.get("ingredients", [])[:10]
    ])
    embed.add_field(name="🥘 Ingredients", value=ingredients or "N/A", inline=False)

    steps = "\n".join([
        f"{s['order']}. {s['instruction'][:100]}"
        for s in recipe.get("steps", [])[:5]
    ])
    embed.add_field(name="📝 Etapes", value=steps[:1024] or "N/A", inline=False)

    embed.set_footer(text=f"Genere par {meta.get('provider', 'n8n')} | {meta.get('tokens_used', 0)} tokens")

    return embed
```

---

## Documents connexes

- [RECIPES_API_SPEC.md](./RECIPES_API_SPEC.md) - Specification API backend (pour equipe API)
- [RECIPES_TECHNICAL_OVERVIEW.md](./RECIPES_TECHNICAL_OVERVIEW.md) - Architecture technique
- [GUIDE_EQUIPE_BOT.md](../teams/GUIDE_EQUIPE_BOT.md) - Reference Torah pour pattern similaire
