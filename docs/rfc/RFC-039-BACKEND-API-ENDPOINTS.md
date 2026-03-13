# RFC-039: Backend API Endpoints pour Progress Tracker & Chess Tools

| Metadata | |
|----------|---------|
| **Auteur** | Équipe n8n-workflows |
| **Révisé par** | Équipe Backend |
| **Date** | 2026-03-11 |
| **Révision** | 2026-03-12 — Intégration recommandations Backend |
| **Status** | Validé |
| **Dépendances** | RFC-038 (Feature Tools Missing), MongoDB |
| **Impacte** | API Backend, n8n workflows, Bot Échecs, Bot Cuisine |

---

## 1. Contexte

La RFC-038 identifie plusieurs outils à créer/compléter pour les bots Échecs et Cuisine. Ces outils nécessitent un stockage persistant en MongoDB, accessible via des endpoints REST.

**Principes clés:**
- n8n n'accède jamais directement à MongoDB. Toutes les opérations passent par l'API backend.
- L'API est **multi-tenant** : chaque requête est scopée par `tenant_id`.
- Les endpoints sont préfixés `/api/n8n/` pour isoler les routes service-to-service.
- Pas d'opérateurs MongoDB bruts exposés — chaque opération est un endpoint métier explicite.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  n8n Workflows                                                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │ MCP-Progress-Get│  │ MCP-Progress-   │  │ MCP-Lichess-    │      │
│  │                 │  │ Update          │  │ Auth            │      │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘      │
│           │                    │                    │                │
│           └────────────────────┼────────────────────┘                │
│                                │                                     │
│                    X-API-Key + X-Tenant-ID                           │
│                                │                                     │
│                                ▼                                     │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                    API Backend                                │   │
│  │                    /api/n8n/...                                │   │
│  │                                                               │   │
│  │  POST /api/n8n/progress            POST /api/n8n/games        │   │
│  │  POST /api/n8n/progress/sessions   POST /api/n8n/games/add    │   │
│  │  POST /api/n8n/progress/lessons    POST /api/n8n/games/analysis│  │
│  │  POST /api/n8n/progress/badges     POST /api/n8n/games/lichess│   │
│  │  POST /api/n8n/progress/preferences                           │   │
│  │  POST /api/n8n/progress/lichess    POST /api/n8n/oauth/store  │   │
│  │                                    POST /api/n8n/oauth         │   │
│  │                                    POST /api/n8n/oauth/delete  │   │
│  └───────────────────────────────┬───────────────────────────────┘   │
│                                  │                                    │
│                                  ▼                                    │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │                    MongoDB — Base: chess                       │   │
│  │  URI: mongodb://chatbot_user:***@host1.local:27017/chess      │   │
│  │       ?authSource=chatbot_analytics                           │   │
│  │                                                               │   │
│  │  Collections:                                                 │   │
│  │  - user_progress                                              │   │
│  │  - user_games                                                 │   │
│  │  - user_oauth_tokens                                          │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 3. MongoDB — Base `chess`

### 3.1 Connexion

Réutilise le client Motor existant (`app.config.mongodb._mongo_client`), même pattern que `mcp_activity`.

```python
# app/config/mongodb_chess.py
CHESS_DATABASE = get_env("CHESS_DATABASE", "chess")
_chess_db = _mongo_client[CHESS_DATABASE]
```

**Pré-requis** : accorder les droits à `chatbot_user` :

```js
use chatbot_analytics
db.grantRolesToUser("chatbot_user", [
  { role: "readWrite", db: "chess" }
])
```

### 3.2 Variables d'environnement (Backend)

| Variable | Description | Défaut |
|----------|-------------|--------|
| `CHESS_DATABASE` | Nom de la base MongoDB | `chess` |
| `N8N_API_KEY` | Clé d'auth pour les endpoints n8n | (requis) |
| `OAUTH_ENCRYPTION_KEY` | Clé AES-256 pour chiffrement tokens | (requis, 32 bytes base64) |

---

## 4. Authentification API

Tous les endpoints `/api/n8n/` requièrent :

```
X-API-Key: {N8N_API_KEY}
X-Tenant-ID: {tenant_id}
Content-Type: application/json
```

| Header | Description | Requis |
|--------|-------------|--------|
| `X-API-Key` | Clé statique service-to-service, vérifiée par un middleware dédié | Oui |
| `X-Tenant-ID` | Identifiant du tenant (isolation multi-tenant) | Oui |

> **Note** : ces endpoints ne sont PAS accessibles par le Frontend. Le Frontend utilise les endpoints JWT/RBAC classiques.

---

## 5. Collections MongoDB

### 5.1 Collection: `user_progress`

Stocke la progression utilisateur (leçons, badges, préférences).

**Schema:**
```javascript
{
  _id: ObjectId,
  tenant_id: String,            // Isolation multi-tenant
  user_id: String,              // "discord_636639897767378954"

  // Liens externes
  lichess_username: String,     // null si non connecté

  // Stats globales
  stats: {
    total_sessions: Number,
    last_active: ISODate
  },

  // Leçons complétées
  lessons: [{
    lesson_id: String,
    completed_at: ISODate,
    score: Number,              // 0-100
    domain: String,             // "chess" | "cooking"
    duration_minutes: Number
  }],

  // Badges gagnés
  badges: [{
    id: String,
    earned_at: ISODate,
    domain: String,
    metadata: Object            // Données additionnelles
  }],

  // Préférences utilisateur
  preferences: {
    difficulty_level: String,   // "beginner" | "intermediate" | "advanced"
    favorite_openings: [String],
    notifications: Boolean
  },

  // Données spécifiques Cuisine
  cooking: {
    recipes_completed: Number,
    techniques_learned: [String]
  },

  created_at: ISODate,
  updated_at: ISODate
}
```

**Index:**
```javascript
{ tenant_id: 1, user_id: 1 }           // Unique compound
{ tenant_id: 1, "lessons.domain": 1 }
{ tenant_id: 1, "badges.domain": 1 }
{ tenant_id: 1, lichess_username: 1 }
```

---

### 5.2 Collection: `user_games`

Stocke les parties non-Lichess (scoresheets, imports manuels).

**Schema:**
```javascript
{
  _id: ObjectId,
  tenant_id: String,
  user_id: String,

  // Source de la partie
  source: String,               // "scoresheet_photo" | "manual_input" | "pgn_import"

  // Métadonnées partie
  white_player: String,
  black_player: String,
  user_color: String,           // "white" | "black"
  date: String,                 // "2026-03-10"
  event: String,                // "Club Tournament Round 3"
  result: String,               // "1-0" | "0-1" | "1/2-1/2" | "*"

  // Contenu
  pgn: String,                  // "1. e4 e5 2. Nf3 Nc6..."

  // Analyse (null si pas encore analysée)
  analysis: {
    done: Boolean,
    done_at: ISODate,
    engine: String,             // "stockfish_16"
    depth: Number,
    accuracy: {
      white: Number,            // 0-100
      black: Number
    },
    mistakes: {
      white: Number,
      black: Number
    },
    blunders: {
      white: Number,
      black: Number
    },
    key_moments: [{
      move: Number,
      eval_before: Number,      // Centipawns / 100
      eval_after: Number,
      type: String,             // "blunder" | "mistake" | "brilliant"
      best_move: String         // "Nxe5"
    }]
  },

  // Synchro Lichess (si importée)
  lichess_imported: Boolean,
  lichess_game_id: String,
  lichess_url: String,

  created_at: ISODate,
  updated_at: ISODate
}
```

**Index:**
```javascript
{ tenant_id: 1, user_id: 1, created_at: -1 }
{ tenant_id: 1, user_id: 1, "analysis.done": 1 }
{ lichess_game_id: 1 }
```

---

### 5.3 Collection: `user_oauth_tokens`

Stocke les tokens OAuth (Lichess, etc.).

**Schema:**
```javascript
{
  _id: ObjectId,
  tenant_id: String,
  user_id: String,
  provider: String,             // "lichess"

  access_token: String,         // Chiffré AES-256-GCM
  refresh_token: String,        // Chiffré AES-256-GCM
  expires_at: ISODate,
  scope: String,                // "preference:read game:read game:write"

  // Données provider
  provider_user_id: String,     // "player123" (Lichess username)

  created_at: ISODate,
  updated_at: ISODate
}
```

**Index:**
```javascript
{ tenant_id: 1, user_id: 1, provider: 1 }  // Unique compound
```

**Chiffrement :**
- Algorithme : AES-256-GCM (authentifié)
- Clé : `OAUTH_ENCRYPTION_KEY` (variable d'env, 32 bytes base64)
- Champs chiffrés : `access_token`, `refresh_token`
- Le chiffrement/déchiffrement est effectué côté Backend. n8n envoie les tokens en clair, le Backend chiffre avant stockage et déchiffre avant réponse.

---

## 6. Endpoints API

### 6.1 Progress Endpoints

Préfixe : `/api/n8n/progress`

---

#### `POST /api/n8n/progress`

Récupère la progression d'un utilisateur.

**Request:**
```json
{
  "user_id": "discord_636639897767378954",
  "domain": "chess"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `user_id` | string | Oui | Identifiant utilisateur |
| `domain` | string | Non | Filtrer par domaine (`chess`, `cooking`, `null` = tous) |

> `tenant_id` est fourni via le header `X-Tenant-ID`, pas dans le body.

**Response 200 (trouvé):**
```json
{
  "success": true,
  "data": {
    "user_id": "discord_636639897767378954",
    "lichess_username": "player123",
    "stats": {
      "total_sessions": 142,
      "last_active": "2026-03-11T14:30:00Z"
    },
    "lessons": [
      {
        "lesson_id": "chess_opening_basics",
        "completed_at": "2026-03-10T10:00:00Z",
        "score": 85,
        "domain": "chess",
        "duration_minutes": 12
      }
    ],
    "badges": [
      {
        "id": "first_lesson",
        "earned_at": "2026-03-01T12:00:00Z",
        "domain": "chess",
        "metadata": {}
      }
    ],
    "preferences": {
      "difficulty_level": "intermediate",
      "favorite_openings": ["Sicilian Defense"],
      "notifications": true
    },
    "cooking": null,
    "created_at": "2026-01-15T08:00:00Z",
    "updated_at": "2026-03-11T14:30:00Z"
  }
}
```

**Response 200 (non trouvé):**
```json
{
  "success": true,
  "data": null
}
```

---

#### `POST /api/n8n/progress/sessions`

Incrémente le compteur de sessions et met à jour `last_active`.

**Request:**
```json
{
  "user_id": "discord_636639897767378954"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `user_id` | string | Oui | Identifiant utilisateur |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "total_sessions": 143,
    "last_active": "2026-03-12T10:00:00Z"
  }
}
```

**Comportement :** Upsert — crée le document `user_progress` s'il n'existe pas.

---

#### `POST /api/n8n/progress/lessons`

Ajoute ou met à jour une leçon complétée.

**Request:**
```json
{
  "user_id": "discord_636639897767378954",
  "lesson": {
    "lesson_id": "chess_endgame_101",
    "completed_at": "2026-03-11T16:00:00Z",
    "score": 92,
    "domain": "chess",
    "duration_minutes": 15
  }
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `user_id` | string | Oui | Identifiant utilisateur |
| `lesson.lesson_id` | string | Oui | ID unique de la leçon |
| `lesson.completed_at` | string | Oui | Date ISO 8601 |
| `lesson.score` | number | Oui | Score 0-100 |
| `lesson.domain` | string | Oui | `chess` ou `cooking` |
| `lesson.duration_minutes` | number | Non | Durée en minutes |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "added": true,
    "total_lessons": 12
  }
}
```

**Comportement :** Si `lesson_id` existe déjà pour cet utilisateur, met à jour (score, date). Upsert du document parent si inexistant.

---

#### `POST /api/n8n/progress/badges`

Attribue un badge à un utilisateur.

**Request:**
```json
{
  "user_id": "discord_636639897767378954",
  "badge": {
    "id": "streak_7",
    "domain": "chess",
    "earned_at": "2026-03-11T16:30:00Z",
    "metadata": {
      "streak_count": 7
    }
  }
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `user_id` | string | Oui | Identifiant utilisateur |
| `badge.id` | string | Oui | ID unique du badge |
| `badge.domain` | string | Oui | `chess` ou `cooking` |
| `badge.earned_at` | string | Oui | Date ISO 8601 |
| `badge.metadata` | object | Non | Données additionnelles |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "awarded": true,
    "already_had": false,
    "total_badges": 5
  }
}
```

**Comportement :** Si le badge existe déjà, retourne `already_had: true` sans erreur. Upsert du document parent si inexistant.

---

#### `POST /api/n8n/progress/preferences`

Met à jour les préférences utilisateur.

**Request:**
```json
{
  "user_id": "discord_636639897767378954",
  "preferences": {
    "difficulty_level": "advanced",
    "favorite_openings": ["Sicilian Defense", "King's Indian"],
    "notifications": true
  }
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `user_id` | string | Oui | Identifiant utilisateur |
| `preferences.difficulty_level` | string | Non | `beginner`, `intermediate`, `advanced` |
| `preferences.favorite_openings` | string[] | Non | Liste d'ouvertures |
| `preferences.notifications` | boolean | Non | Activer les notifications |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "updated": true
  }
}
```

**Comportement :** Merge partiel — seuls les champs fournis sont mis à jour. Upsert du document parent si inexistant.

---

#### `POST /api/n8n/progress/lichess`

Lie ou délie un compte Lichess à l'utilisateur.

**Request:**
```json
{
  "user_id": "discord_636639897767378954",
  "lichess_username": "player123"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `user_id` | string | Oui | Identifiant utilisateur |
| `lichess_username` | string\|null | Oui | Username Lichess (`null` pour délier) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "updated": true,
    "lichess_username": "player123"
  }
}
```

---

### 6.2 Games Endpoints

Préfixe : `/api/n8n/games`

---

#### `POST /api/n8n/games`

Récupère les parties d'un utilisateur.

**Request:**
```json
{
  "user_id": "discord_636639897767378954",
  "limit": 10,
  "offset": 0,
  "filters": {
    "result": "1-0",
    "has_analysis": true,
    "source": "scoresheet_photo"
  }
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `user_id` | string | Oui | Identifiant utilisateur |
| `limit` | number | Non | Nombre max (défaut: 20, max: 100) |
| `offset` | number | Non | Offset pagination (défaut: 0) |
| `filters.result` | string | Non | Filtrer par résultat |
| `filters.has_analysis` | boolean | Non | Seulement parties analysées |
| `filters.source` | string | Non | Filtrer par source |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "games": [
      {
        "game_id": "6412abc123def456",
        "source": "scoresheet_photo",
        "white_player": "John Doe",
        "black_player": "Opponent",
        "user_color": "white",
        "result": "1-0",
        "date": "2026-03-10",
        "event": "Club Tournament Round 3",
        "pgn": "1. e4 e5 2. Nf3...",
        "analysis": {
          "done": true,
          "accuracy": { "white": 87.5, "black": 72.3 }
        },
        "lichess_imported": false,
        "created_at": "2026-03-10T18:00:00Z"
      }
    ],
    "total": 15,
    "limit": 10,
    "offset": 0
  }
}
```

---

#### `POST /api/n8n/games/add`

Ajoute une partie (scoresheet, import manuel).

**Request:**
```json
{
  "user_id": "discord_636639897767378954",
  "game": {
    "source": "scoresheet_photo",
    "white_player": "John Doe",
    "black_player": "Opponent Name",
    "user_color": "white",
    "date": "2026-03-10",
    "event": "Club Tournament Round 3",
    "result": "1-0",
    "pgn": "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7"
  }
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `user_id` | string | Oui | Identifiant utilisateur |
| `game.source` | string | Oui | `scoresheet_photo`, `manual_input`, `pgn_import` |
| `game.white_player` | string | Oui | Nom joueur blancs |
| `game.black_player` | string | Oui | Nom joueur noirs |
| `game.user_color` | string | Oui | `white` ou `black` |
| `game.date` | string | Non | Date YYYY-MM-DD |
| `game.event` | string | Non | Nom de l'événement |
| `game.result` | string | Oui | `1-0`, `0-1`, `1/2-1/2`, `*` |
| `game.pgn` | string | Oui | Notation PGN |

**Response 201:**
```json
{
  "success": true,
  "data": {
    "game_id": "6412abc123def456",
    "created": true
  }
}
```

---

#### `POST /api/n8n/games/analysis`

Met à jour l'analyse d'une partie.

**Request:**
```json
{
  "game_id": "6412abc123def456",
  "user_id": "discord_636639897767378954",
  "analysis": {
    "done": true,
    "done_at": "2026-03-11T17:00:00Z",
    "engine": "stockfish_16",
    "depth": 20,
    "accuracy": {
      "white": 87.5,
      "black": 72.3
    },
    "mistakes": {
      "white": 2,
      "black": 5
    },
    "blunders": {
      "white": 0,
      "black": 2
    },
    "key_moments": [
      {
        "move": 15,
        "eval_before": 0.3,
        "eval_after": 2.1,
        "type": "blunder",
        "best_move": "Nxe5"
      }
    ]
  }
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `game_id` | string | Oui | ID de la partie (ObjectId) |
| `user_id` | string | Oui | ID utilisateur (vérifie que la partie lui appartient) |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "updated": true
  }
}
```

**Response 404:**
```json
{
  "success": false,
  "error": {
    "code": 404,
    "message": "Game not found"
  }
}
```

**Sécurité :** Le Backend vérifie que `game.user_id == user_id` ET `game.tenant_id == tenant_id` (header) avant d'autoriser la mise à jour.

---

#### `POST /api/n8n/games/lichess`

Marque une partie comme importée sur Lichess.

**Request:**
```json
{
  "game_id": "6412abc123def456",
  "user_id": "discord_636639897767378954",
  "lichess_game_id": "AbCdEfGh",
  "lichess_url": "https://lichess.org/AbCdEfGh"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "updated": true
  }
}
```

---

### 6.3 OAuth Endpoints

Préfixe : `/api/n8n/oauth`

---

#### `POST /api/n8n/oauth/store`

Stocke un token OAuth. Le Backend chiffre les tokens avant stockage.

**Request:**
```json
{
  "user_id": "discord_636639897767378954",
  "provider": "lichess",
  "access_token": "lip_xxxxxxxxxxxxx",
  "refresh_token": "lir_xxxxxxxxxxxxx",
  "expires_at": "2026-03-12T15:00:00Z",
  "scope": "preference:read game:read game:write",
  "provider_user_id": "player123"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `user_id` | string | Oui | Identifiant utilisateur |
| `provider` | string | Oui | `lichess` (extensible) |
| `access_token` | string | Oui | Token d'accès (envoyé en clair, chiffré au stockage) |
| `refresh_token` | string | Non | Token de refresh (envoyé en clair, chiffré au stockage) |
| `expires_at` | string | Oui | Date expiration ISO 8601 |
| `scope` | string | Oui | Scopes autorisés |
| `provider_user_id` | string | Oui | Username Lichess |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "stored": true
  }
}
```

**Comportement :** Si un token existe déjà pour ce `tenant_id + user_id + provider`, le remplacer.

---

#### `POST /api/n8n/oauth`

Récupère un token OAuth. Le Backend déchiffre les tokens avant réponse.

**Request:**
```json
{
  "user_id": "discord_636639897767378954",
  "provider": "lichess"
}
```

**Response 200 (trouvé):**
```json
{
  "success": true,
  "data": {
    "access_token": "lip_xxxxxxxxxxxxx",
    "refresh_token": "lir_xxxxxxxxxxxxx",
    "expires_at": "2026-03-12T15:00:00Z",
    "is_expired": false,
    "scope": "preference:read game:read game:write",
    "provider_user_id": "player123"
  }
}
```

**Response 200 (non trouvé):**
```json
{
  "success": true,
  "data": null
}
```

**Comportement :** `is_expired` est calculé côté Backend (`expires_at < now`).

---

#### `POST /api/n8n/oauth/delete`

Supprime un token OAuth (déconnexion).

**Request:**
```json
{
  "user_id": "discord_636639897767378954",
  "provider": "lichess"
}
```

**Response 200:**
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

---

## 7. Codes d'erreur

| Code | Status HTTP | Description |
|------|-------------|-------------|
| 400 | Bad Request | Paramètres manquants ou invalides |
| 401 | Unauthorized | X-API-Key manquant ou invalide |
| 403 | Forbidden | X-Tenant-ID manquant |
| 404 | Not Found | Ressource non trouvée |
| 429 | Too Many Requests | Rate limit dépassé |
| 500 | Internal Error | Erreur serveur |

**Format erreur:**
```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "user_id requis",
    "details": {}
  }
}
```

---

## 8. Rate Limiting

| Scope | Limite | Fenêtre |
|-------|--------|---------|
| Par API Key | 1000 requêtes | 1 minute |
| Par endpoint + user_id | 60 requêtes | 1 minute |

Implémenté via Redis (même instance que l'app).

---

## 9. Variables d'environnement

### Backend

| Variable | Description | Défaut |
|----------|-------------|--------|
| `CHESS_DATABASE` | Nom de la base MongoDB | `chess` |
| `N8N_API_KEY` | Clé d'auth service-to-service | (requis) |
| `OAUTH_ENCRYPTION_KEY` | Clé AES-256-GCM (32 bytes base64) | (requis) |

### n8n

| Variable | Description | Exemple |
|----------|-------------|---------|
| `BACKEND_API_URL` | URL base de l'API Backend | `https://api.azy.solutions` |
| `N8N_API_KEY` | Clé d'authentification | `sk-xxxxx` |
| `LICHESS_CLIENT_ID` | Client ID OAuth Lichess | `azy-chess-bot` |
| `LICHESS_CLIENT_SECRET` | Client Secret OAuth | `secret` |
| `LICHESS_REDIRECT_URI` | Callback OAuth | `https://api.azy.solutions/webhook/lichess/callback` |

---

## 10. Récapitulatif des endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/n8n/progress` | POST | Lire progression utilisateur |
| `/api/n8n/progress/sessions` | POST | Incrémenter sessions |
| `/api/n8n/progress/lessons` | POST | Ajouter/màj leçon |
| `/api/n8n/progress/badges` | POST | Attribuer badge |
| `/api/n8n/progress/preferences` | POST | Mettre à jour préférences |
| `/api/n8n/progress/lichess` | POST | Lier compte Lichess |
| `/api/n8n/games` | POST | Lister parties |
| `/api/n8n/games/add` | POST | Ajouter partie |
| `/api/n8n/games/analysis` | POST | Mettre à jour analyse |
| `/api/n8n/games/lichess` | POST | Marquer import Lichess |
| `/api/n8n/oauth/store` | POST | Stocker token OAuth |
| `/api/n8n/oauth` | POST | Récupérer token OAuth |
| `/api/n8n/oauth/delete` | POST | Supprimer token OAuth |

**Total : 13 endpoints** (tous POST pour compatibilité n8n HTTP Request node)

---

## 11. Décisions Backend (ex-questions ouvertes)

| # | Question originale | Décision |
|---|-------------------|----------|
| 1 | URL de base de l'API ? | `https://api.azy.solutions/api/n8n/` |
| 2 | Mécanisme d'auth ? | `X-API-Key` statique (service-to-service, n8n uniquement) |
| 3 | Chiffrement tokens OAuth ? | AES-256-GCM, clé dans `OAUTH_ENCRYPTION_KEY` |
| 4 | Rate limiting ? | Oui — 1000/min par clé, 60/min par user_id |
| 5 | Multi-tenancy ? | `X-Tenant-ID` header obligatoire, scopé dans toutes les queries |
| 6 | Opérateurs MongoDB bruts ? | **Non** — remplacés par des endpoints métier explicites |
| 7 | Préfixe URL ? | `/api/n8n/` pour isoler les routes service-to-service |
| 8 | MongoDB database ? | Nouvelle base `chess`, droits `chatbot_user` à accorder |

---

*Document généré le 11 mars 2026 — Équipe n8n-workflows / RFC-039*
*Révisé le 12 mars 2026 — Équipe Backend*
