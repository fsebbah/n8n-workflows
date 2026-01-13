# Guide d'intégration Plugin → n8n

> Documentation pour les développeurs de plugins Discord (Torah, Bot-Appetit, etc.)

## Changements récents (Janvier 2026)

### PR #225 - Migration Credits API
- Les workflows `discord-get-credits` et `discord-get-balance` n'utilisent plus de requêtes SQL directes
- Ils appellent maintenant l'API `/api/webhook/account`

### PR #226 - Entity Social Actions
- Nouveau workflow générique pour les actions sociales (commentaires, notes, favoris)
- Remplace les anciens workflows spécifiques (recipes-add-comment, etc.)

---

## 1. API Crédits

### Obtenir les crédits d'un utilisateur

**Endpoint n8n:**
```
GET http://pi6.local:5678/webhook/discord-get-credits
```

**Paramètres query:**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `project_id` | string | oui | `torah-fun`, `bot-appetit`, etc. |
| `discord_user_id` | string | oui | ID Discord de l'utilisateur |

**Exemple:**
```python
# Python
response = requests.get(
    "http://pi6.local:5678/webhook/discord-get-credits",
    params={
        "project_id": "torah-fun",  # ⚠️ PAS "torah-bot"
        "discord_user_id": "636639897767378954"
    }
)
```

```bash
# curl
curl "http://pi6.local:5678/webhook/discord-get-credits?project_id=torah-fun&discord_user_id=636639897767378954"
```

**Réponse succès (200):**
```json
{
  "success": true,
  "balance": {
    "credits_remaining": 1000,
    "credits_total": 1000,
    "credits_used": 0,
    "usage_percent": 0,
    "subscription_status": "free",
    "plan_id": "free",
    "renewal_date": null
  }
}
```

**Réponse erreur (404):**
```json
{
  "success": false,
  "error": {
    "code": 404,
    "message": "User not found",
    "status": "NOT_FOUND"
  }
}
```

### ⚠️ Point important : project_id

| Valeur correcte | Valeur incorrecte |
|-----------------|-------------------|
| `torah-fun` | `torah-bot` |
| `bot-appetit` | `botappetit` |

Si le plugin envoie un `project_id` incorrect, l'API retournera 0 crédits (user not found).

---

## 2. API Actions Sociales (Entités)

### Endpoint unique pour toutes les actions

**Endpoint n8n:**
```
POST http://pi6.local:5678/webhook/entity-social-actions
```

**Headers requis:**
```
Content-Type: application/json
X-Project-ID: bot-appetit  (ou torah-fun, etc.)
```

**Body commun:**
| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `entity_type` | string | oui | `recipes`, `translations`, `trainings`, `articles`, `posts` |
| `entity_id` | UUID | oui | ID de l'entité |
| `action` | string | oui | `comments`, `rating`, `favorite`, `favorites` |
| `method` | string | non | `GET`, `POST`, `DELETE` (défaut: `POST`) |
| `discord_user_id` | string | oui* | Requis sauf pour GET |

---

### 2.1 Commentaires

#### Ajouter un commentaire
```python
requests.post(
    "http://pi6.local:5678/webhook/entity-social-actions",
    headers={
        "Content-Type": "application/json",
        "X-Project-ID": "bot-appetit"
    },
    json={
        "entity_type": "recipes",
        "entity_id": "abc-123-uuid",
        "action": "comments",
        "method": "POST",
        "discord_user_id": "636639897767378954",
        "discord_username": "User#1234",
        "content": "Super recette !"
    }
)
```

#### Lister les commentaires
```python
requests.post(
    "http://pi6.local:5678/webhook/entity-social-actions",
    headers={"Content-Type": "application/json", "X-Project-ID": "bot-appetit"},
    json={
        "entity_type": "recipes",
        "entity_id": "abc-123-uuid",
        "action": "comments",
        "method": "GET"
    }
)
```

#### Supprimer un commentaire
```python
requests.post(
    "http://pi6.local:5678/webhook/entity-social-actions",
    headers={"Content-Type": "application/json", "X-Project-ID": "bot-appetit"},
    json={
        "entity_type": "recipes",
        "entity_id": "abc-123-uuid",
        "action": "comments",
        "method": "DELETE",
        "discord_user_id": "636639897767378954",
        "comment_id": "comment-uuid"
    }
)
```

---

### 2.2 Notes (Ratings)

#### Ajouter/modifier une note
```python
requests.post(
    "http://pi6.local:5678/webhook/entity-social-actions",
    headers={"Content-Type": "application/json", "X-Project-ID": "bot-appetit"},
    json={
        "entity_type": "recipes",
        "entity_id": "abc-123-uuid",
        "action": "rating",
        "method": "POST",
        "discord_user_id": "636639897767378954",
        "score": 5  # 1-5
    }
)
```

#### Obtenir les statistiques des notes
```python
requests.post(
    "http://pi6.local:5678/webhook/entity-social-actions",
    headers={"Content-Type": "application/json", "X-Project-ID": "bot-appetit"},
    json={
        "entity_type": "recipes",
        "entity_id": "abc-123-uuid",
        "action": "rating",
        "method": "GET"
    }
)
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    "average": 4.3,
    "count": 42,
    "ratings": []
  }
}
```

---

### 2.3 Favoris

#### Ajouter aux favoris
```python
requests.post(
    "http://pi6.local:5678/webhook/entity-social-actions",
    headers={"Content-Type": "application/json", "X-Project-ID": "bot-appetit"},
    json={
        "entity_type": "recipes",
        "entity_id": "abc-123-uuid",
        "action": "favorite",
        "method": "POST",
        "discord_user_id": "636639897767378954"
    }
)
```

#### Retirer des favoris
```python
requests.post(
    "http://pi6.local:5678/webhook/entity-social-actions",
    headers={"Content-Type": "application/json", "X-Project-ID": "bot-appetit"},
    json={
        "entity_type": "recipes",
        "entity_id": "abc-123-uuid",
        "action": "favorite",
        "method": "DELETE",
        "discord_user_id": "636639897767378954"
    }
)
```

#### Lister mes favoris
```python
requests.post(
    "http://pi6.local:5678/webhook/entity-social-actions",
    headers={"Content-Type": "application/json", "X-Project-ID": "bot-appetit"},
    json={
        "entity_type": "recipes",
        "entity_id": "placeholder",  # Non utilisé pour cette action
        "action": "favorites",
        "method": "GET",
        "discord_user_id": "636639897767378954"
    }
)
```

---

## 3. Mapping des entity_type

| entity_type | API appelée | Usage |
|-------------|-------------|-------|
| `recipes` | `/api/entities/recipes/...` | Bot-Appetit |
| `translations` | `/api/entities/translations/...` | Torah-Fun |
| `trainings` | `/api/entities/trainings/...` | Torah-Fun |
| `articles` | `/api/entities/articles/...` | Général |
| `posts` | `/api/entities/posts/...` | Général |

---

## 4. Codes d'erreur

| Code | Signification | Action |
|------|---------------|--------|
| 200 | Succès | - |
| 400 | Paramètres invalides | Vérifier les champs requis |
| 404 | Entité/User non trouvé | Vérifier entity_id ou project_id |
| 422 | Header X-Project-ID manquant | Ajouter le header |
| 500 | Erreur serveur | Réessayer ou contacter admin |

---

## 5. Migration depuis les anciens endpoints

| Ancien endpoint | Nouvel endpoint |
|-----------------|-----------------|
| `POST /webhook/recipes-add-comment` | `POST /webhook/entity-social-actions` avec `action: "comments"` |
| `GET /webhook/recipes-get-comments` | `POST /webhook/entity-social-actions` avec `action: "comments", method: "GET"` |
| `POST /webhook/recipes-add-rating` | `POST /webhook/entity-social-actions` avec `action: "rating"` |
| `GET /webhook/recipes-get-ratings` | `POST /webhook/entity-social-actions` avec `action: "rating", method: "GET"` |

---

## 6. Exemple complet Python

```python
import requests

class N8nClient:
    def __init__(self, base_url: str, project_id: str):
        self.base_url = base_url
        self.project_id = project_id

    def get_credits(self, discord_user_id: str) -> dict:
        """Obtenir les crédits d'un utilisateur."""
        response = requests.get(
            f"{self.base_url}/webhook/discord-get-credits",
            params={
                "project_id": self.project_id,
                "discord_user_id": discord_user_id
            }
        )
        return response.json()

    def add_comment(self, entity_type: str, entity_id: str,
                    discord_user_id: str, content: str) -> dict:
        """Ajouter un commentaire à une entité."""
        response = requests.post(
            f"{self.base_url}/webhook/entity-social-actions",
            headers={
                "Content-Type": "application/json",
                "X-Project-ID": self.project_id
            },
            json={
                "entity_type": entity_type,
                "entity_id": entity_id,
                "action": "comments",
                "method": "POST",
                "discord_user_id": discord_user_id,
                "content": content
            }
        )
        return response.json()

    def add_rating(self, entity_type: str, entity_id: str,
                   discord_user_id: str, score: int) -> dict:
        """Noter une entité (1-5)."""
        response = requests.post(
            f"{self.base_url}/webhook/entity-social-actions",
            headers={
                "Content-Type": "application/json",
                "X-Project-ID": self.project_id
            },
            json={
                "entity_type": entity_type,
                "entity_id": entity_id,
                "action": "rating",
                "method": "POST",
                "discord_user_id": discord_user_id,
                "score": score
            }
        )
        return response.json()

    def toggle_favorite(self, entity_type: str, entity_id: str,
                        discord_user_id: str, add: bool = True) -> dict:
        """Ajouter ou retirer des favoris."""
        response = requests.post(
            f"{self.base_url}/webhook/entity-social-actions",
            headers={
                "Content-Type": "application/json",
                "X-Project-ID": self.project_id
            },
            json={
                "entity_type": entity_type,
                "entity_id": entity_id,
                "action": "favorite",
                "method": "POST" if add else "DELETE",
                "discord_user_id": discord_user_id
            }
        )
        return response.json()


# Usage
client = N8nClient("http://pi6.local:5678", "torah-fun")

# Vérifier les crédits
credits = client.get_credits("636639897767378954")
print(f"Crédits: {credits['balance']['credits_remaining']}")

# Ajouter un commentaire
result = client.add_comment(
    entity_type="translations",
    entity_id="abc-123-uuid",
    discord_user_id="636639897767378954",
    content="Excellente traduction !"
)
```

---

## 7. Checklist d'intégration

- [ ] Vérifier que `project_id` est correct (`torah-fun` et non `torah-bot`)
- [ ] Ajouter le header `X-Project-ID` pour les actions sociales
- [ ] Utiliser `entity_type` approprié pour le projet
- [ ] Gérer les codes d'erreur (400, 404, 500)
- [ ] Tester avec un utilisateur de test avant mise en production
