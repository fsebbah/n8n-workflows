# N8N Chess API — Guide d'intégration

## Authentification

Chaque requête doit inclure deux headers :

```
X-API-Key: <clé partagée, fournie par l'équipe backend>
X-Tenant-ID: <identifiant du tenant, envoyé par le plugin bot Discord>
```

- **`X-API-Key`** : secret partagé entre n8n et l'API backend. Identique pour tous les tenants.
- **`X-Tenant-ID`** : identifiant du tenant (organisation/serveur Discord). Fourni dynamiquement par le plugin bot à chaque appel.

### Erreurs d'authentification

| Code | Cause |
|------|-------|
| 401 | `X-API-Key` manquant ou invalide |
| 403 | `X-Tenant-ID` manquant |
| 503 | Base de données Chess indisponible |

---

## Base URL

```
POST https://<api-host>/api/n8n/<endpoint>
```

Tous les endpoints sont en **POST** (compatibilité HTTP Request node n8n).

La documentation Swagger interactive est disponible sur `https://<api-host>/docs` (filtrer par tag **n8n-chess**).

---

## Format de réponse

**Succès :**
```json
{
  "success": true,
  "data": { ... }
}
```

**Erreur :**
```json
{
  "success": false,
  "error": {
    "code": 404,
    "message": "Game not found"
  }
}
```

---

## Identité des joueurs

- `user_id` = identifiant Discord du joueur (ex: `"123456789012345678"`)
- **Pas de création de compte nécessaire** : les documents utilisateur sont auto-créés au premier appel (upsert)
- Toutes les données sont isolées par `tenant_id` : un même `user_id` sur deux tenants différents = deux joueurs distincts

---

## Endpoints

### Progress (7 endpoints)

#### `POST /api/n8n/progress` — Lire la progression

```json
{
  "user_id": "123456789",
  "domain": "openings"       // optionnel — filtre par domaine
}
```

Réponse : le document complet de progression (lessons, badges, stats, preferences).

---

#### `POST /api/n8n/progress/sessions` — Incrémenter le compteur de sessions

```json
{
  "user_id": "123456789"
}
```

Réponse :
```json
{
  "total_sessions": 5,
  "last_active": "2026-03-12T14:30:00+00:00"
}
```

---

#### `POST /api/n8n/progress/lessons` — Ajouter ou MAJ une leçon

```json
{
  "user_id": "123456789",
  "lesson": {
    "lesson_id": "opening-sicilian-01",
    "domain": "openings",
    "title": "La défense sicilienne",
    "score": 85,
    "completed_at": "2026-03-12T14:00:00Z"
  }
}
```

Réponse :
```json
{
  "added": true,
  "total_lessons": 12
}
```

---

#### `POST /api/n8n/progress/badges` — Attribuer un badge (idempotent)

```json
{
  "user_id": "123456789",
  "badge": {
    "id": "first-win",
    "domain": "games",
    "name": "Première victoire",
    "earned_at": "2026-03-12T14:00:00Z"
  }
}
```

Réponse :
```json
{
  "awarded": true,
  "already_had": false,
  "total_badges": 3
}
```

Si le badge existe déjà : `awarded: false, already_had: true`.

---

#### `POST /api/n8n/progress/preferences` — MAJ des préférences

```json
{
  "user_id": "123456789",
  "preferences": {
    "difficulty": "intermediate",
    "daily_goal": 3,
    "preferred_color": "white",
    "language": "fr",
    "notifications_enabled": true
  }
}
```

Tous les champs de `preferences` sont optionnels (merge partiel).

---

#### `POST /api/n8n/progress/lichess` — Lier/délier un compte Lichess

```json
{
  "user_id": "123456789",
  "lichess_username": "DrNykterstein"    // null pour délier
}
```

---

#### `POST /api/n8n/progress/delete` — Supprimer toutes les données (GDPR)

```json
{
  "user_id": "123456789"
}
```

Réponse :
```json
{
  "deleted": {
    "user_progress": { "deleted": true },
    "user_games": 5,
    "user_oauth_tokens": 1
  }
}
```

Suppression en cascade dans les 3 collections (progress, games, oauth tokens).

---

### Games (4 endpoints)

#### `POST /api/n8n/games` — Lister les parties

```json
{
  "user_id": "123456789",
  "limit": 20,               // optionnel, défaut 20, max 100
  "offset": 0,               // optionnel, défaut 0
  "filters": {                // optionnel
    "result": "win",          // "win", "loss", "draw"
    "source": "lichess",      // "manual", "lichess", "pgn_import"
    "has_analysis": true      // true/false
  }
}
```

Réponse :
```json
{
  "games": [ { "game_id": "...", "user_id": "...", ... } ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

---

#### `POST /api/n8n/games/add` — Ajouter une partie

```json
{
  "user_id": "123456789",
  "game": {
    "white": "user",
    "black": "opponent_name",
    "result": "win",
    "pgn": "1. e4 e5 2. Nf3 ...",
    "source": "manual",
    "time_control": "10+0",
    "opening": "Sicilian Defense"
  }
}
```

Réponse :
```json
{
  "game_id": "665f1a2b3c4d5e6f7a8b9c0d",
  "created": true
}
```

---

#### `POST /api/n8n/games/analysis` — MAJ de l'analyse d'une partie

```json
{
  "user_id": "123456789",
  "game_id": "665f1a2b3c4d5e6f7a8b9c0d",
  "analysis": {
    "done": true,
    "accuracy": {
      "white": 85.5,
      "black": 72.3
    },
    "mistakes": {
      "blunders": 2,
      "mistakes": 3,
      "inaccuracies": 5
    },
    "key_moments": [
      {
        "move_number": 15,
        "description": "Blunder — perte de la dame",
        "evaluation_before": 1.5,
        "evaluation_after": -3.2
      }
    ],
    "summary": "Bonne ouverture mais erreurs en milieu de partie"
  }
}
```

Retourne `404` si `game_id` introuvable.

---

#### `POST /api/n8n/games/lichess` — Marquer une partie comme importée sur Lichess

```json
{
  "user_id": "123456789",
  "game_id": "665f1a2b3c4d5e6f7a8b9c0d",
  "lichess_game_id": "AbCdEfGh",
  "lichess_url": "https://lichess.org/AbCdEfGh"
}
```

---

### OAuth (3 endpoints)

#### `POST /api/n8n/oauth/store` — Stocker un token OAuth

```json
{
  "user_id": "123456789",
  "provider": "lichess",
  "access_token": "lip_xxxxxxxxxxxx",
  "refresh_token": "lrt_xxxxxxxxxxxx",
  "expires_at": "2026-04-12T14:00:00Z",
  "scope": "challenge:read challenge:write",
  "provider_user_id": "DrNykterstein"
}
```

Les tokens sont **chiffrés (AES-256-GCM)** avant stockage en base. Le `refresh_token` est optionnel.

---

#### `POST /api/n8n/oauth` — Récupérer un token

```json
{
  "user_id": "123456789",
  "provider": "lichess"
}
```

Réponse :
```json
{
  "access_token": "lip_xxxxxxxxxxxx",
  "refresh_token": "lrt_xxxxxxxxxxxx",
  "expires_at": "2026-04-12T14:00:00+00:00",
  "is_expired": false,
  "scope": "challenge:read challenge:write",
  "provider_user_id": "DrNykterstein"
}
```

Les tokens sont déchiffrés à la volée. Si `data` est `null`, aucun token n'existe pour ce couple user/provider.

---

#### `POST /api/n8n/oauth/delete` — Supprimer un token

```json
{
  "user_id": "123456789",
  "provider": "lichess"
}
```

---

## Exemple n8n — HTTP Request node

Configuration type pour un node HTTP Request :

- **Method** : POST
- **URL** : `https://<api-host>/api/n8n/progress/sessions`
- **Authentication** : None (géré par headers)
- **Headers** :
  - `X-API-Key` : `{{ $credentials.n8nChessApiKey }}`
  - `X-Tenant-ID` : `{{ $json.tenant_id }}`
  - `Content-Type` : `application/json`
- **Body (JSON)** :
  ```json
  {
    "user_id": "{{ $json.discord_user_id }}"
  }
  ```

---

## Collections MongoDB

Pour référence, les 3 collections dans la base `chess` :

| Collection | Clé unique | Description |
|---|---|---|
| `user_progress` | `(tenant_id, user_id)` | Progression, leçons, badges, préférences |
| `user_games` | `_id` (ObjectId) | Parties jouées, analyses |
| `user_oauth_tokens` | `(tenant_id, user_id, provider)` | Tokens OAuth chiffrés |
