# Guide d'integration - Chess Plugin Discord

## Authentification

Chaque requete doit inclure ces headers:

```
Content-Type: application/json
```

Dans le body JSON, inclure systematiquement:
- `tenant_id`: identifiant du plugin (valeur fixe: `"chess_plugin"`)
- `user_id`: identifiant Discord de l'utilisateur (ex: `"user_987654321"`)

### Flux du tenant_id

```
Plugin Chess                    n8n Workflow                     Backend API
     |                               |                               |
     |  POST /webhook/progress-get   |                               |
     |  Body: {                      |                               |
     |    "tenant_id": "chess_plugin"|                               |
     |    "user_id": "discord_123"   |                               |
     |  }                            |                               |
     |------------------------------>|                               |
     |                               |                               |
     |                    Valide tenant_id                           |
     |                    (erreur 400 si absent)                     |
     |                               |                               |
     |                               |  POST /api/n8n/progress       |
     |                               |  Headers:                     |
     |                               |    X-Tenant-ID: chess_plugin  |
     |                               |    X-API-Key: $env.N8N_API_KEY|
     |                               |  Body: { "user_id": "..." }   |
     |                               |------------------------------>|
```

**Resume:**
1. Le plugin envoie `tenant_id` dans le body JSON
2. n8n valide sa presence (erreur 400 si manquant)
3. n8n le transmet au backend comme header `X-Tenant-ID`

---

## Base URL

```
POST https://pi6.local:5678/webhook/<endpoint>
```

---

## Workflows disponibles

### 1. Progress

#### GET Progress - Lire la progression
```
POST /webhook/progress-get
```

**Input:**
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
  "domain": "chess",
  "include": ["stats", "lessons", "badges", "lichess_elo"]
}
```

**Output:**
```json
{
  "success": true,
  "user_id": "user_987654321",
  "stats": { "total_sessions": 5, "last_active": "..." },
  "lessons": [...],
  "badges": [...],
  "lichess": {
    "connected": true,
    "username": "DrNykterstein",
    "profile": {...},
    "elo_history": [...]
  }
}
```

---

#### UPDATE Progress - Mises a jour
```
POST /webhook/progress-update
```

**Operations disponibles:**

##### session - Incrementer sessions
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
  "operation": "session",
  "data": {}
}
```

##### add_lesson - Ajouter une lecon
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
  "operation": "add_lesson",
  "data": {
    "lesson_id": "opening-sicilian-01",
    "domain": "openings",
    "score": 85,
    "duration_minutes": 12
  }
}
```

##### award_badge - Attribuer un badge
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
  "operation": "award_badge",
  "data": {
    "badge_id": "first-win",
    "domain": "games",
    "metadata": { "opponent": "bot_easy" }
  }
}
```

##### preferences - Mettre a jour preferences
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
  "operation": "preferences",
  "data": {
    "difficulty": "intermediate",
    "daily_goal": 3,
    "language": "fr"
  }
}
```

##### link_lichess - Lier compte Lichess
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
  "operation": "link_lichess",
  "data": {
    "lichess_username": "DrNykterstein"
  }
}
```

---

#### DELETE Progress - Suppression GDPR
```
POST /webhook/progress-delete
```

**Input:**
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
  "confirm": true
}
```

**Output:**
```json
{
  "success": true,
  "message": "Toutes les donnees utilisateur ont ete supprimees",
  "deleted": {
    "user_progress": { "deleted": true },
    "user_games": 5,
    "user_oauth_tokens": 1
  }
}
```

---

### 2. Games

#### LIST Games - Lister les parties
```
POST /webhook/games-list
```

**Input:**
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
  "limit": 20,
  "offset": 0,
  "filters": {
    "result": "win",
    "source": "lichess",
    "has_analysis": true
  }
}
```

**Output:**
```json
{
  "success": true,
  "games": [
    {
      "game_id": "665f1a2b3c4d5e6f7a8b9c0d",
      "white": "user",
      "black": "opponent",
      "result": "win",
      "pgn": "1. e4 e5..."
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

---

#### ADD Game - Ajouter une partie
```
POST /webhook/games-add
```

**Input:**
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
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

**Output:**
```json
{
  "success": true,
  "game_id": "665f1a2b3c4d5e6f7a8b9c0d",
  "created": true
}
```

---

#### UPDATE Analysis - Mettre a jour l'analyse
```
POST /webhook/games-analysis
```

**Input:**
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
  "game_id": "665f1a2b3c4d5e6f7a8b9c0d",
  "analysis": {
    "done": true,
    "accuracy": { "white": 85.5, "black": 72.3 },
    "mistakes": { "blunders": 2, "mistakes": 3, "inaccuracies": 5 },
    "key_moments": [
      {
        "move_number": 15,
        "description": "Blunder - perte de la dame",
        "evaluation_before": 1.5,
        "evaluation_after": -3.2
      }
    ],
    "summary": "Bonne ouverture mais erreurs en milieu de partie"
  }
}
```

---

#### LINK Lichess - Marquer import Lichess
```
POST /webhook/games-lichess
```

**Input:**
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
  "game_id": "665f1a2b3c4d5e6f7a8b9c0d",
  "lichess_game_id": "AbCdEfGh",
  "lichess_url": "https://lichess.org/AbCdEfGh"
}
```

---

### 3. OAuth (Lichess)

#### START Auth - Demarrer OAuth Lichess
```
POST /webhook/lichess-auth-start
```

**Input:**
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
  "redirect_uri": "https://your-app.com/callback"
}
```

**Output:**
```json
{
  "success": true,
  "auth_url": "https://lichess.org/oauth?...",
  "state": "base64_encoded_state",
  "code_verifier": "pkce_verifier_to_store",
  "message": "Redirigez l'utilisateur vers auth_url"
}
```

**Important:** Stocker `code_verifier` cote client pour le callback.

---

#### CALLBACK Auth - Finaliser OAuth Lichess
```
POST /webhook/lichess-auth-callback
```

**Input:**
```json
{
  "code": "authorization_code_from_lichess",
  "state": "base64_encoded_state",
  "code_verifier": "stored_pkce_verifier"
}
```

**Output:**
```json
{
  "success": true,
  "message": "Compte Lichess 'DrNykterstein' connecte",
  "lichess_username": "DrNykterstein",
  "scope": "challenge:read challenge:write board:play"
}
```

---

#### GET OAuth Token - Recuperer token
```
POST /webhook/oauth-get
```

**Input:**
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
  "provider": "lichess"
}
```

**Output (token existe):**
```json
{
  "success": true,
  "has_token": true,
  "provider": "lichess",
  "access_token": "lip_xxxx",
  "expires_at": "2026-04-12T14:00:00+00:00",
  "is_expired": false,
  "provider_user_id": "DrNykterstein"
}
```

**Output (pas de token):**
```json
{
  "success": true,
  "has_token": false,
  "provider": "lichess"
}
```

---

#### DELETE OAuth Token - Supprimer token
```
POST /webhook/oauth-delete
```

**Input:**
```json
{
  "tenant_id": "guild_123456789",
  "user_id": "user_987654321",
  "provider": "lichess"
}
```

---

## Resume des endpoints

| Endpoint | Description |
|----------|-------------|
| `/webhook/progress-get` | Lire progression utilisateur |
| `/webhook/progress-update` | Mises a jour (session, lesson, badge, prefs, lichess) |
| `/webhook/progress-delete` | Suppression GDPR |
| `/webhook/games-list` | Lister parties avec filtres |
| `/webhook/games-add` | Ajouter une partie |
| `/webhook/games-analysis` | Mettre a jour analyse |
| `/webhook/games-lichess` | Marquer import Lichess |
| `/webhook/lichess-auth-start` | Demarrer OAuth Lichess |
| `/webhook/lichess-auth-callback` | Finaliser OAuth Lichess |
| `/webhook/oauth-get` | Recuperer token OAuth |
| `/webhook/oauth-delete` | Supprimer token OAuth |

---

## Codes d'erreur

| Code | Description |
|------|-------------|
| 200 | Succes |
| 400 | Requete invalide (champs manquants) |
| 404 | Ressource non trouvee (game_id invalide) |
| 500 | Erreur serveur |

**Format erreur:**
```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "tenant_id requis, user_id requis",
    "status": "BAD_REQUEST"
  }
}
```

---

## Exemple d'implementation (Python)

```python
import requests

BASE_URL = "https://pi6.local:5678/webhook"
TENANT_ID = "guild_123456789"

def get_progress(user_id: str) -> dict:
    response = requests.post(
        f"{BASE_URL}/progress-get",
        json={
            "tenant_id": TENANT_ID,
            "user_id": user_id,
            "include": ["stats", "lessons", "badges"]
        }
    )
    return response.json()

def add_lesson(user_id: str, lesson_id: str, score: int) -> dict:
    response = requests.post(
        f"{BASE_URL}/progress-update",
        json={
            "tenant_id": TENANT_ID,
            "user_id": user_id,
            "operation": "add_lesson",
            "data": {
                "lesson_id": lesson_id,
                "domain": "chess",
                "score": score
            }
        }
    )
    return response.json()
```

---

## Questions en attente de reponse

### Questions pour l'equipe chatbot-core

> **[CHATBOT-CORE-001]** Client MCP pour n8n
>
> Existe-t-il deja un client MCP dans chatbot-core pour appeler les webhooks n8n ?
> Ou doit-on utiliser `N8nClient` directement ?
>
> **Contexte:** Le plugin-chess doit appeler les endpoints n8n (`progress-*`, `games-*`, `oauth-*`).
> On veut savoir si on doit creer un wrapper ou utiliser un composant existant.
>
> **Statut:** [ ] En attente [ ] Repondu
>
> **Reponse:**
> ```
> (a completer par l'equipe chatbot-core)
> ```

---

> **[CHATBOT-CORE-002]** OAuth Flow dans Discord
>
> Comment gerer le redirect OAuth Lichess dans Discord ?
>
> **Options envisagees:**
> 1. Bouton avec lien externe → callback sur une API web
> 2. Modal avec code a copier-coller
> 3. Bot DM avec lien personnalise
>
> **Contexte:** L'utilisateur doit autoriser le bot a acceder a son compte Lichess.
> Discord ne permet pas de rediriger directement vers une URL depuis un bouton.
>
> **Statut:** [ ] En attente [ ] Repondu
>
> **Reponse:**
> ```
> (a completer par l'equipe chatbot-core)
> ```

---

> **[CHATBOT-CORE-003]** Service OAuth generique
>
> Faut-il creer un service OAuth reutilisable dans chatbot-core ?
>
> **Besoins identifies:**
> - Support PKCE (requis par Lichess)
> - Stockage tokens dans Redis
> - Refresh automatique des tokens expires
> - Multi-provider (Lichess, chess.com futur)
>
> **Statut:** [ ] En attente [ ] Repondu
>
> **Reponse:**
> ```
> (a completer par l'equipe chatbot-core)
> ```

---

### Questions pour l'equipe n8n

> **[N8N-001]** Callback OAuth - Destination
>
> Le `redirect_uri` dans `lichess-auth-start` doit pointer vers quoi ?
>
> **Options:**
> 1. Un endpoint n8n (`/webhook/lichess-auth-callback-redirect`)
> 2. Une API FastAPI externe
> 3. Une page web statique qui appelle le callback
>
> **Contexte:** Apres autorisation sur Lichess, l'utilisateur est redirige vers `redirect_uri`.
> On doit capturer le `code` et appeler `lichess-auth-callback`.
>
> **Statut:** [x] Repondu
>
> **Reponse:**
> ```
> Option recommandee: Page web statique (option 3)
>
> Flow complet:
> 1. Plugin appelle /webhook/lichess-auth-start
>    - Recoit: auth_url, state, code_verifier
>    - Plugin stocke code_verifier en memoire/Redis (cle: state)
>
> 2. Plugin envoie auth_url a l'utilisateur (bouton Discord)
>    - redirect_uri = https://votre-domaine.com/oauth/lichess/callback
>
> 3. Utilisateur autorise sur Lichess
>    - Lichess redirige vers: redirect_uri?code=XXX&state=YYY
>
> 4. Page web statique:
>    - Affiche "Autorisation reussie!"
>    - Affiche le code a copier OU
>    - Envoie message au plugin via webhook/websocket
>
> 5. Plugin appelle /webhook/lichess-auth-callback
>    - Envoie: code, state, code_verifier (recupere via state)
>
> Alternative Discord-friendly:
> - La page web peut afficher: "Retournez sur Discord et tapez: /lichess verify CODE"
> - Le plugin recoit le code via commande et finalise le flow
>
> Note: Un endpoint n8n GET pourrait aussi fonctionner mais necessite
> de stocker le code_verifier cote serveur (voir N8N-002).
> ```

---

> **[N8N-002]** Stockage code_verifier PKCE
>
> Ou stocker le `code_verifier` entre `auth-start` et `callback` ?
>
> **Le flow PKCE necessite:**
> 1. `auth-start` genere `code_verifier` + `code_challenge`
> 2. L'utilisateur autorise sur Lichess (peut prendre plusieurs minutes)
> 3. `callback` a besoin du `code_verifier` original
>
> **Options:**
> - Redis avec TTL (5-10 min)
> - Base de donnees
> - Encode dans le `state` (risque securite)
>
> **Statut:** [x] Repondu
>
> **Reponse:**
> ```
> Design actuel: Le plugin stocke le code_verifier (recommande)
>
> C'est le design PKCE standard - le CLIENT qui initie le flow
> est responsable de conserver le code_verifier.
>
> Implementation plugin-chess:
> 1. Appeler /webhook/lichess-auth-start
> 2. Recevoir { auth_url, state, code_verifier }
> 3. Stocker en Redis: oauth:lichess:{state} -> { code_verifier, user_id, timestamp }
>    TTL: 10 minutes (l'utilisateur a 10 min pour autoriser)
> 4. Quand callback recoit le code:
>    - Recuperer code_verifier via state
>    - Appeler /webhook/lichess-auth-callback avec les 3 valeurs
>    - Supprimer la cle Redis
>
> Code exemple (plugin):
> ```python
> # auth-start
> response = await n8n_client.lichess_auth_start(user_id, redirect_uri)
> await redis.setex(
>     f"oauth:lichess:{response['state']}",
>     600,  # 10 minutes TTL
>     json.dumps({
>         "code_verifier": response["code_verifier"],
>         "user_id": user_id
>     })
> )
>
> # callback (apres redirect)
> data = json.loads(await redis.get(f"oauth:lichess:{state}"))
> await n8n_client.lichess_auth_callback(code, state, data["code_verifier"])
> await redis.delete(f"oauth:lichess:{state}")
> ```
>
> Pourquoi pas cote n8n/backend ?
> - PKCE est concu pour que le client garde le secret
> - Evite de stocker des secrets temporaires cote serveur
> - Le state permet de retrouver le bon code_verifier
> ```

---

> **[N8N-003]** Sync automatique Lichess
>
> Y a-t-il un workflow pour importer automatiquement les parties recentes depuis Lichess ?
>
> **Scenario souhaite:**
> 1. L'utilisateur connecte son compte Lichess
> 2. Periodiquement (ou on-demand), on importe ses nouvelles parties
> 3. Option: lancer l'analyse Stockfish automatiquement
>
> **Questions:**
> - Workflow existant ou a creer ?
> - Frequence de sync recommandee ?
> - Limites API Lichess a respecter ?
>
> **Statut:** [x] Repondu
>
> **Reponse:**
> ```
> Workflow existant: NON - A creer si besoin
>
> Proposition de workflow: MCP-Lichess-Sync
>
> Option A - Sync on-demand (recommande pour commencer):
> POST /webhook/lichess-sync
> Input:
> {
>   "tenant_id": "chess_plugin",
>   "user_id": "discord_123",
>   "since": "2024-01-01T00:00:00Z",  // optionnel
>   "max_games": 50,                   // optionnel, defaut 20
>   "with_analysis": false             // lancer analyse auto?
> }
>
> Flow interne:
> 1. Recuperer token OAuth via /api/n8n/oauth/get
> 2. Appeler Lichess API: GET /api/games/user/{username}
> 3. Filtrer parties deja importees (via lichess_game_id)
> 4. Pour chaque nouvelle partie:
>    - Appeler /api/n8n/games/add
>    - Marquer liaison via /api/n8n/games/lichess
> 5. Optionnel: Declencher analyse Stockfish
>
> Option B - Sync periodique (cron):
> - Workflow cron toutes les heures
> - Parcourt tous les utilisateurs avec token Lichess valide
> - Importe les parties des dernieres 24h
> - Attention aux rate limits!
>
> Limites API Lichess:
> - Authentifie: ~20 req/sec (avec token OAuth)
> - Non-authentifie: ~1 req/sec
> - Endpoint games: max 300 parties par requete
> - Recommandation: espacer les requetes de 100ms minimum
>
> Frequence recommandee:
> - On-demand: A chaque /lichess import (utilisateur decide)
> - Periodique: 1x par heure max, batch de 10 users max par run
>
> Estimation effort: 1-2 jours pour creer le workflow
> Dependance: Token OAuth stocke (workflow existant OK)
>
> Voulez-vous qu'on cree ce workflow? Ouvrir une RFC?
> ```

---

## Plan de developpement

### Phase 1 : Integration n8n de base
**Priorite: Haute | Effort: 2-3 jours | Equipe: plugin-chess**

- [ ] Creer `src/services/n8n_chess_client.py` (wrapper webhooks)
- [ ] Migrer stockage analyses vers `games-add` + `games-analysis`
- [ ] `/analyses` utilise `games-list` au lieu de Redis
- [ ] Tracking sessions via `progress-update(operation="session")`

### Phase 2 : Commandes de progression
**Priorite: Moyenne | Effort: 2 jours | Equipe: plugin-chess**

- [ ] `/progress` - Voir ma progression (stats, badges, ELO)
- [ ] `/leaderboard` - Classement serveur
- [ ] `/badges` - Liste des badges

### Phase 3 : Integration Lichess
**Priorite: Moyenne | Effort: 3-4 jours | Equipe: chatbot-core + plugin-chess**
**Bloquee par:** [CHATBOT-CORE-002], [CHATBOT-CORE-003] ~~[N8N-001]~~, ~~[N8N-002]~~

- [ ] [chatbot-core] Service OAuth generique avec PKCE
- [ ] [plugin-chess] `/lichess connect` - Lier compte
- [ ] [plugin-chess] `/lichess import` - Importer parties
- [ ] [plugin-chess] `/lichess profile` - Afficher profil

### Phase 4 : Systeme de lecons
**Priorite: Basse | Effort: 3-5 jours | Equipe: plugin-chess**

- [ ] `/learn <topic>` - Ouvertures, tactiques, finales
- [ ] Quiz interactifs avec tracking progression

### Phase 5 : GDPR & Admin
**Priorite: Basse | Effort: 1 jour | Equipe: plugin-chess**

- [ ] `/chess-delete-data` - Suppression donnees utilisateur
