# Architecture Generique des Entites

**Date:** 2026-01-12
**Status:** En cours d'implementation
**PRs:** API #210

---

## Vue d'ensemble

Architecture unifiee pour gerer differents types d'entites (recipes, translations, etc.) via des endpoints et workflows generiques.

```
Plugin                    n8n                         API
   |                       |                           |
   |  POST /qdrant-save    |                           |
   |  {entity_type, data}  |                           |
   |---------------------->|                           |
   |                       |  POST /api/entities/xxx   |
   |                       |-------------------------->|
   |                       |                           |
   |                       |  Store in Qdrant          |
   |                       |-------------------------->| Qdrant
```

---

## 1. API - Endpoint Generique

### PR #210

**Endpoint:**
```
/api/entities/{entity_type}
```

**Operations:**
| Methode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/entities/{type}` | Creer |
| GET | `/api/entities/{type}/{id}` | Lire |
| PUT | `/api/entities/{type}/{id}` | Modifier |
| DELETE | `/api/entities/{type}/{id}` | Supprimer |
| GET | `/api/entities/{type}/user/{user_id}` | Lister par user |

**Types supportes:**
| Type | Description |
|------|-------------|
| `recipes` | Recettes bot-appetit |
| `translations` | Traductions Torah |

**Extensibilite:**
```python
# api/routers/entities/handlers/mon_type.py
# Implementer: create, get, update, delete, list
# Enregistrer dans handlers/__init__.py
ENTITY_HANDLERS["mon_type"] = mon_type_handler
```

---

## 2. n8n - Workflows Generiques

### Webhooks

| Webhook | Description |
|---------|-------------|
| `POST /webhook/qdrant-save` | Sauvegarder entite + embedding |
| `POST /webhook/qdrant-search` | Recherche semantique |
| `POST /webhook/qdrant-similar` | Entites similaires |

### Parametres communs (tous les webhooks)

| Parametre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `entity_type` | string | ✅ | Type d'entite (`recipes`, `translations`) |
| `qdrant_host` | string | ✅ | Hostname Qdrant |
| `qdrant_port` | number | ✅ | Port Qdrant |
| `qdrant_collection` | string | ✅ | Nom de la collection |
| `openai_api_key` | string | ✅ | Cle API OpenAI |

### qdrant-save - Parametres specifiques

| Parametre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `data` | object | ✅ | Donnees de l'entite |
| `user_id` | string | ✅ | ID utilisateur Discord |
| `store_embedding` | boolean | ❌ | Stocker dans Qdrant (defaut: true) |
| `llm_metadata` | object | ❌ | Metadonnees LLM |

### qdrant-search - Parametres specifiques

| Parametre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `query` | string | ✅ | Texte de recherche |
| `limit` | number | ❌ | Max resultats (defaut: 10) |
| `filters` | object | ❌ | Filtres additionnels |
| `user_id` | string | ❌ | ID utilisateur |

### qdrant-similar - Parametres specifiques

| Parametre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `entity_id` | string | ✅* | ID de l'entite dans Qdrant |
| `entity` | object | ✅* | Objet entite complet |
| `limit` | number | ❌ | Max resultats (defaut: 5) |
| `exclude_self` | boolean | ❌ | Exclure source (defaut: true) |

*`entity_id` OU `entity` requis

---

## 3. Plugin/Framework - Implementation

### Variables .env.local

```env
# n8n
N8N_BASE_URL=http://pi6.local:5678

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_COLLECTION=bot-appetit-recipes

# OpenAI
OPENAI_API_KEY=sk-xxx

# Entity type (selon le plugin)
ENTITY_TYPE=recipes
```

### Classe Python

```python
import os
import aiohttp

class N8nEntityClient:
    """Client generique pour les operations sur entites via n8n"""

    def __init__(self, n8n_base_url: str = None):
        self.n8n_base_url = n8n_base_url or os.getenv("N8N_BASE_URL")
        self.qdrant_config = {
            "qdrant_host": os.getenv("QDRANT_HOST", "localhost"),
            "qdrant_port": int(os.getenv("QDRANT_PORT", 6333)),
            "qdrant_collection": os.getenv("QDRANT_COLLECTION"),
            "openai_api_key": os.getenv("OPENAI_API_KEY"),
        }
        self.entity_type = os.getenv("ENTITY_TYPE", "recipes")

    async def save(self, data: dict, user_id: str,
                   store_embedding: bool = True,
                   llm_metadata: dict = None) -> dict:
        """Sauvegarder une entite avec embedding"""
        payload = {
            "entity_type": self.entity_type,
            "data": data,
            "user_id": user_id,
            "store_embedding": store_embedding,
            "llm_metadata": llm_metadata or {},
            **self.qdrant_config
        }
        return await self._post("/webhook/qdrant-save", payload)

    async def search(self, query: str, limit: int = 10,
                     filters: dict = None,
                     user_id: str = None) -> dict:
        """Recherche semantique"""
        payload = {
            "query": query,
            "entity_type": self.entity_type,
            "limit": limit,
            "filters": filters or {},
            "user_id": user_id,
            **self.qdrant_config
        }
        return await self._post("/webhook/qdrant-search", payload)

    async def similar(self, entity_id: str = None,
                      entity: dict = None,
                      limit: int = 5,
                      exclude_self: bool = True) -> dict:
        """Trouver des entites similaires"""
        payload = {
            "entity_id": entity_id,
            "entity": entity,
            "entity_type": self.entity_type,
            "limit": limit,
            "exclude_self": exclude_self,
            **self.qdrant_config
        }
        return await self._post("/webhook/qdrant-similar", payload)

    async def _post(self, endpoint: str, payload: dict) -> dict:
        """Appel HTTP POST vers n8n"""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.n8n_base_url}{endpoint}",
                json=payload,
                headers={"Content-Type": "application/json"}
            ) as response:
                return await response.json()
```

### Exemples d'utilisation

```python
# Bot Appetit (recipes)
client = N8nEntityClient()
client.entity_type = "recipes"
client.qdrant_config["qdrant_collection"] = "bot-appetit-recipes"

await client.save(
    data={"title": "Fondant chocolat", "description": "..."},
    user_id="123456789"
)

results = await client.search("gateau chocolat", limit=5)

# Torah Bot (translations)
client.entity_type = "translations"
client.qdrant_config["qdrant_collection"] = "torah-translations"

await client.save(
    data={"source_text_id": "uuid", "translated_text": "..."},
    user_id="987654321"
)
```

---

## 4. Migration

### Changements de nommage

| Avant | Apres |
|-------|-------|
| `recipe` | `data` |
| `recipe_id` | `entity_id` |
| `/api/recipes` | `/api/entities/recipes` |
| `recipes-save` | `qdrant-save` |
| `recipes-search` | `qdrant-search` |
| `recipes-similar` | `qdrant-similar` |

### Checklist

**API:**
- [x] PR #210 - Endpoint generique `/api/entities/{type}`

**n8n:**
- [ ] Modifier `qdrant-save` (Validate Input, URLs, Format Output)
- [ ] Modifier `qdrant-search` (Validate Input, Format Output)
- [ ] Modifier `qdrant-similar` (Validate Input, Format Output)
- [ ] Renommer les webhooks

**Plugins:**
- [ ] Ajouter variables env (QDRANT_*, ENTITY_TYPE)
- [ ] Implementer `N8nEntityClient`
- [ ] Migrer les appels existants

---

## 5. Variables d'environnement n8n

Les workflows utilisent `$env.TORAH_API_URL` pour l'URL de l'API backend.

Cette variable doit etre configuree dans l'environnement n8n (pas dans les plugins).

**Note:** `$env.VARIABLE` fonctionne dans les champs Expression des HTTP Request nodes, mais PAS dans les Code nodes (sandbox).

Voir: [n8n-environment-variables.md](./n8n-environment-variables.md)
