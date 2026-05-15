# RFC-089 — Multi-Account Google OAuth

| Métadonnée | Valeur |
|---|---|
| **Statut** | 🟡 Draft — corps stable (§1-8). En attente : Annexe A (front), B.1 (MCP/DevOps/Légal), §6.2.1 (produit) |
| **Date** | 2026-05-14 |
| **Auteur** | Franck Sebbah + Claude |
| **Équipes** | Backend API (chat.api), Front (vue-app), n8n / MCP |
| **Dépendances** | RFC-083 (Google Classroom MCP), pipeline OAuth Google existant |
| **Trigger** | RFC-083 a fait apparaître le besoin de connecter plusieurs comptes Google par user. Le constat se généralise à tous les services Google. |

---

## 0. Récap des décisions structurantes

| Axe | Décision | Motivation |
|---|---|---|
| Use case principal | Multi-comptes par user personnel | Un même user a son compte perso + son compte d'école/pro et veut accéder aux ressources des deux. Clé `(tenant_id, user_id, google_sub)`. |
| Sélection du compte au moment de l'appel | `google_account_id` explicite, obligatoire (Phase 2+) | L'utilisateur sait quel compte il veut interroger ; le front et le MCP relaient ce choix. Pas de magie d'agrégation côté back. |
| Phasage | Phase 1 couche storage + re-prompt ; Phase 2 Classroom ; Phases 3+ Gmail/Calendar/Drive | Limite le rayon d'explosion. Permet de livrer Classroom (qui est le déclencheur) sans tout refactor d'un coup. |
| Migration users existants | Re-prompt OAuth obligatoire au déploiement Phase 1 | Plus propre que backfill — pas d'état hybride à maintenir. Coût UX accepté. |
| Stockage tokens | Refresh chiffré en DB tenant ; Access en Redis (TTL court) | Audit clair, persistance > TTL Redis, chiffrement au repos pour le refresh (qui vaut 90 jours). |

---

## 1. Architecture & flux

### 1.1 Composants nouveaux (chat.api)

- `app/models/entities/multi_tenant/user_google_account.py` — modèle SQLAlchemy `UserGoogleAccount`
- `app/services/google/user_google_accounts_service.py` — CRUD + sélection : `list_for_user(user_id)`, `get(user_id, google_sub)`, `create_from_oauth_callback(...)`, `delete(user_id, google_sub)`
- `app/services/google/token_cipher.py` — chiffrement Fernet du refresh_token (clé `GOOGLE_TOKEN_ENCRYPTION_KEY` en env, rotation prévue via versionnement de clé)
- `app/services/google/multi_account_token_resolver.py` — remplace `N8nGoogleTokenResolverService`. Signature : `.resolve(tenant_id, user_id, google_account_id, service)` → access_token frais (refresh à la volée si expiré)
- `app/api_routes/user_google_accounts_routes.py` — endpoints CRUD comptes (cf. §3)

### 1.2 Composants modifiés

- `app/api_routes/google_auth_routes.py` — le callback OAuth **insère** une row dans `user_google_accounts` au lieu d'écraser un token Redis. Le `state` OAuth porte un flag `intent ∈ {first_connect, add_account, refresh_scopes}`.
- `app/api_routes/google_classroom_routes.py` — Phase 2 : accepte `?google_account_id=...` obligatoire ; sans, 400.
- `app/api_routes/n8n_google_token_routes.py` — contrat étendu pour exiger `google_account_id`.
- `GmailTokenManager` (qui sert encore Gmail/Calendar/Drive en Phase 1) — lit la nouvelle table en mode "single account fallback" : prend le compte le plus récent du user si aucun `google_account_id` n'est passé. Cohabitation transitoire.

### 1.3 Flux OAuth — ajout d'un Nème compte

```
Front → GET /api/google/accounts/connect  (body: { return_url, scopes? })
  → 302 vers Google consent (prompt=select_account pour forcer le picker)
  → User autorise dans un autre compte Google
  → 302 vers /api/auth/google/callback?state=...&code=...
  → Échange code → tokens (refresh + access)
  → Fetch userinfo (sub, email, hd, name, picture)
  → UPSERT user_google_accounts (refresh_token chiffré)
  → 302 vers le front : ${return_url}?account_added={google_sub}
```

**Cas annulation côté Google** (B8) : si l'user clique « Annuler » sur le consent screen, Google redirige vers `/api/auth/google/callback?state=...&error=access_denied&error_description=...`. Le back relaie sur `${return_url}?error=oauth_cancelled`. Le front peut afficher un toast neutre (pas d'erreur, juste "Connexion abandonnée").

### 1.4 Flux résolution token par appel API

```
Front/MCP → GET /api/.../something?google_account_id=<sub>
  → Route récupère (tenant_id, user_id) du contexte auth
  → MultiAccountTokenResolver.resolve(tenant, user, sub, service)
    → SELECT refresh_token_enc, scopes FROM user_google_accounts
       WHERE user_id=? AND google_sub=? AND revoked_at IS NULL
    → Décrypte refresh_token via TokenCipher
    → Vérifie cache Redis access_token (clé oauth:access:{tenant}:{user}:{sub})
    → Si miss/expiré :
        - Acquire lock distribué (clé oauth:lock:...) — évite refresh concurrents
        - POST oauth2.googleapis.com/token (refresh_token grant)
        - SET Redis access_token avec TTL = expires_in - 60s
        - Release lock
    → Valide scopes minimaux pour `service` (cf. GoogleScopeManager existant)
    → UPDATE last_used_at (sampling 5 min — cf. §8.4.1, évite write amplification)
    → Retourne access_token
  → Appel Google API avec Authorization: Bearer <access_token>
```

### 1.5 Erreurs typées propagées

`404 google_account_not_found`, `403 google_missing_scopes`, `401 google_refresh_failed` (le front doit prompt re-OAuth), `400 google_account_id_required`, `401 google_account_not_connected`, `410 google_account_revoked`, `500 google_token_decrypt_failed`.

### 1.6 Résilience du refresh (B13)

Trois couches de mitigation pour éviter les `invalid_grant` en cas de refresh concurrents (3 onglets ouverts, retry intempestif, etc.) :

1. **Lock Redis distribué** sur `oauth:lock:{tenant}:{user}:{sub}` (TTL 30s, SET NX). Première couche, déjà décrite en §1.4.
2. **Fallback pg advisory lock** sur `pg_advisory_xact_lock(hashtext('{tenant}:{user}:{sub}'))` si Redis est down ou si l'acquisition Redis échoue (timeout). Locks au scope transaction, libérés au commit.
3. **Retry sur `invalid_grant`** : si l'appel `oauth2.googleapis.com/token` retourne `invalid_grant`, le worker re-lit le `refresh_token_enc` depuis la DB (un autre worker peut l'avoir mis à jour suite à un refresh parallèle réussi qui a rotated le token), puis retry **une seule fois**. Si encore `invalid_grant` → surface `401 google_refresh_failed` au caller.

Cette résilience ajoute ~50 lignes au `MultiAccountTokenResolver` mais évite les invalidations cascade en cas de pic de trafic.

#### 1.6.1 Circuit breaker — limite des retries cumulés

Le retry "une seule fois" du point 3 est local à un appel. Si N onglets/tabs/MCP workers attaquent simultanément un compte dont le refresh_token a été révoqué externe (password reset Google), chaque caller retry une fois → potentiellement 2×N appels à `oauth2.googleapis.com/token` avec un grant invalide → grey-listing IP côté Google.

**Mitigation** : circuit breaker au niveau `(tenant, user, sub)`. Après 3 échecs `invalid_grant` consécutifs en moins de 60s, le `MultiAccountTokenResolver` court-circuite et renvoie `401 google_refresh_failed` sans appel Google. Reset du breaker à la prochaine connexion réussie (callback OAuth UPSERT). Implémenté via une clé Redis `oauth:cb:{tenant}:{user}:{sub}` (compteur + TTL 60s).

---

## 2. Modèle data

### 2.1 Table `user_google_accounts` (schéma tenant)

```sql
CREATE TABLE user_google_accounts (
    google_sub                  VARCHAR(255) NOT NULL,
    user_id                     VARCHAR(255) NOT NULL,
    email                       VARCHAR(320) NOT NULL,
    name                        VARCHAR(255),
    picture                     TEXT,
    hd                          VARCHAR(255),       -- domaine Workspace si pro
    refresh_token_enc           BYTEA NOT NULL,     -- Fernet ciphertext
    refresh_token_key_version   SMALLINT NOT NULL DEFAULT 1,
    scopes                      TEXT[] NOT NULL,
    connected_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_refreshed_at           TIMESTAMPTZ,
    last_used_at                TIMESTAMPTZ,
    revoked_at                  TIMESTAMPTZ,
    PRIMARY KEY (user_id, google_sub)
);

CREATE INDEX ix_user_google_accounts_user_id
  ON user_google_accounts (user_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_user_google_accounts_email
  ON user_google_accounts (email);
```

### 2.2 Décisions

- **PK composite** `(user_id, google_sub)` — un même `google_sub` peut être connecté par deux users différents du même tenant. Pas d'unicité globale.
- **Soft delete** via `revoked_at`. Filtre standard `WHERE revoked_at IS NULL`. Préserve l'audit.
- **Pas de colonne `is_primary`** : la sélection est explicite côté consommateur. Si le front veut un compte "préféré" cross-session, il le persiste dans les préférences user, pas ici.
- **Pas d'access_token en DB** : Redis-only, TTL court.
- **Pas de FK vers `classroom_binding` ni autre ressource** (cf. B.0) : l'auth est par caller, pas par ressource. Une ressource liée à une classe Google n'enregistre pas le `google_sub` du créateur — chaque user qui interagit avec la ressource utilise son propre compte Google (qui doit avoir accès à la classe sous-jacente côté Google). Supprimer un compte ne casse pas les ressources : les autres users du tenant qui ont un compte avec accès à la même classe continuent.

### 2.3 Clés Redis

```
oauth:access:{tenant_id}:{user_id}:{google_sub}   HASH   TTL = expires_in - 60s
  access_token: <opaque>
  expires_at:   <epoch>
  scope:        <space-separated>

oauth:lock:{tenant_id}:{user_id}:{google_sub}     STRING TTL = 30s
  → lock distribué pendant le refresh_token grant
```

### 2.4 Chiffrement

- `cryptography.fernet.Fernet` (AES-128-CBC + HMAC-SHA256). Clé 32 bytes (base64) en env `GOOGLE_TOKEN_ENCRYPTION_KEY`.
- `refresh_token_key_version` : permet une rotation. Nouvelle clé chiffre les nouveaux ; rows anciennes ré-encodées à chaque refresh réussi (lazy rotation).
- Perte de clé → tous les refresh_tokens irrécupérables → re-prompt OAuth global. Fail-safe : pas de leak.

#### 2.4.1 Procédure de rotation de clé (B12)

Quand rotation V1 → V2 :

1. Générer V2 (`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`).
2. Set `GOOGLE_TOKEN_ENCRYPTION_KEY_V2` en env (V1 et V2 connus simultanément du back). Le `TokenCipher` détecte la présence de V2 et bascule.
3. Bascule `refresh_token_key_version` par défaut → 2 dans le code (nouvelles connexions chiffrent V2).
4. **Lazy rotation** automatique : à chaque refresh sur une row marquée `key_version=1`, le back déchiffre avec V1 puis ré-encode avec V2, met à jour `key_version=2` en DB. Aucune intervention.
5. **Monitoring** : alerte si `count(*) FROM user_google_accounts WHERE refresh_token_key_version=1 AND revoked_at IS NULL` reste > 0 plus de **7 jours** après début rotation. Indique des rows inactives (users qui ne refresh pas).
6. **Job batch** (J+7 ou plus) : forcer un refresh sur les rows V1 résiduelles via un script qui itère + appelle `MultiAccountTokenResolver.resolve` (qui déclenche le refresh).
7. **Purge V1** : une fois count V1 = 0, retirer `GOOGLE_TOKEN_ENCRYPTION_KEY` de l'env (garder seulement V2, qui peut être renommée → V1 si on standardise sur le nom non-suffixé).

**Risque** : purger V1 avant que toutes les rows V1 soient ré-encodées → `500 google_token_decrypt_failed` non récupérable pour les rows orphelines → re-prompt forcé pour ces users. Procédure doit être documentée en runbook et le monitoring respecté.

### 2.5 Quotas

- Pas de limite hard en Phase 1 (YAGNI). À revisiter si abus.

---

## 3. Contrat API back

### 3.1 Endpoints de gestion des comptes (nouveau routeur)

`app/api_routes/user_google_accounts_routes.py` — prefix `/api/google/accounts`, auth Firebase.

| Méthode | Path | Body / Query | Réponse | Description |
|---|---|---|---|---|
| `GET` | `/api/google/accounts` | — | `{ accounts: [{google_sub, email, name, picture, hd, scopes, connected_at, last_used_at}] }` | Liste les comptes du user courant (filtré `revoked_at IS NULL`). Ordre `ORDER BY last_used_at DESC NULLS LAST, connected_at DESC` (most-recently-used d'abord), pour offrir un picker stable au front (B9). |
| `GET` | `/api/google/accounts/{google_sub}` | — | 1 compte ou 404 | Détail. |
| `POST` | `/api/google/accounts/connect` | `{ return_url, scopes? }` | `{ redirect_url }` | Initie un flow OAuth d'**ajout** (prompt=select_account). Le front redirige. |
| `DELETE` | `/api/google/accounts/{google_sub}` | — | `{ revoked: true }` | Soft-delete + best-effort revoke côté Google (`POST oauth2.googleapis.com/revoke`) + purge des caches Redis qui dépendent de ce compte (cf. §8.2 — inventaire des caches en Phase 1). |
| `POST` | `/api/google/accounts/{google_sub}/refresh-scopes` | `{ added_scopes: [...] }` | `{ redirect_url }` | Étend les scopes d'un compte existant. |

### 3.2 Callback OAuth — évolution

- `GET /api/auth/google/callback` : échange code, fetch userinfo, **UPSERT** dans `user_google_accounts`. Réactive (`revoked_at=NULL`) si row préexistante. Le `state` porte `intent`.
- `POST /api/auth/google/refresh` : body `{ google_account_id }` obligatoire, force un refresh ; renvoie nouvelles métadonnées.
- `POST /api/auth/google/revoke` : **supprimé** (remplacé par `DELETE /api/google/accounts/{sub}`).
- `GET /api/auth/google/connections` : **renommé** `GET /api/google/accounts`. 301 temporaire pendant transition.

### 3.3 Endpoints consommateurs — convention `google_account_id`

À partir de la Phase 2 :
- Query param obligatoire : `?google_account_id={sub}` pour les GET.
- Body field obligatoire : `"google_account_id": "..."` pour les POST/PUT.
- Sans → `400 google_account_id_required` avec `available_accounts: [{google_sub, email}]` dans le body (le front peut afficher un picker direct).

**Phase 2 — Classroom** :
- `GET /courses?google_account_id=...`
- `GET /courses/{course_id}/summary?google_account_id=...`
- `GET /courses/{course_id}/expert-programs?google_account_id=...`

**Phase 1 transitoire — Gmail/Calendar/Drive** :
- `google_account_id` **optionnel**. Si absent, fallback sur le compte unique (Phase 1 : chaque user n'en a qu'un suite au re-prompt). Si user a +1 compte mais service pas encore Phase 3+, on renvoie 400.

#### 3.3.1 Visibilité partagée des listings (B4)

Endpoints qui retournent **une liste de ressources liées à des bindings** (ex : `GET /courses/{course_id}/expert-programs` qui liste les expert_responses bindées à un course Classroom donné) :

- **Filtre `tenant_id` seul**, pas `(tenant_id, user_id)`.
- Justification : cohérent avec §B.0 — un binding représente un pointeur tenant-scopé vers une ressource Google partagée. Si user1 (compte A) a bindé `expert_response_X` au course Z, et user2 (compte B, prof Google de Z) consulte la liste, il voit `expert_response_X` — c'est le cas d'usage "dashboard Classroom partagé".
- **Mutation reste gated par RBAC** : `classroom:write` sur l'expert_response (cf. §3.3.2 ci-dessous + RFC-083 §D.3). Le listing est lecture seule, donc filtré tenant-scope sans restriction par user.

L'`google_account_id` du caller ne change PAS le périmètre listé — il n'est utilisé que pour le call Google côté `summary` etc. Le listing est agnostique du compte caller.

#### 3.3.2 Mutation par non-créateur — admin override (B5 — partiel)

RFC-083 §D.3 décrit le code `not_creator` 403 qui restreint la mutation au créateur. Le pan multi-compte de cette question :

- **Si admin tenant override `not_creator` pour modifier un binding qui n'est pas le sien** : l'auth Google utilisée est celle du **caller** (l'admin), pas celle du créateur — cohérent avec §B.0 (auth par caller).
- Si le compte Google du caller n'a pas accès à la classe sous-jacente côté Google → `403 google_missing_scopes` propre. Le caller peut soit étendre les scopes de son compte (`refresh-scopes`), soit demander au créateur (qui a l'accès) de faire l'opération lui-même.
- La décision **"l'admin tenant peut-il override `not_creator` ?"** est dans le scope **RFC-083 §D.3** (RBAC produit), pas RFC-089. RFC-089 garantit juste que le contrat multi-compte n'introduit pas de cas particulier ici.

### 3.4 Contrat n8n / MCP — routes `/api/n8n/google/...`

- `GET /api/n8n/google/token` (étendu) : query `tenant_id`, `user_id`, `service`, **`google_account_id`** (obligatoire). Réponse `{ access_token, expires_at, scopes_granted, google_account_id, google_email }`.
- `GET /api/n8n/google/accounts` (nouveau) : query `tenant_id`, `user_id` → liste comptes (sans refresh_token). Auth via shared secret n8n.

### 3.5 Codes d'erreur typés

| Code | HTTP | Quand | Action front recommandée |
|---|---|---|---|
| `google_account_id_required` | 400 | param absent quand requis (Phase 2+) | afficher picker à partir de `available_accounts` |
| `google_account_not_connected` | 401 | aucun compte connecté pour ce `(tenant, user)` — jamais OAuth | pousser `POST /api/google/accounts/connect` |
| `google_account_not_found` | 404 | `google_sub` inconnu pour ce `(tenant, user)` | invalider cache locale + re-fetch liste |
| `google_account_revoked` | 410 | compte trouvé mais `revoked_at IS NOT NULL` | idem |
| `google_missing_scopes` | 403 | compte ne couvre pas les scopes du service | pousser `POST /api/google/accounts/{sub}/refresh-scopes` |
| `google_refresh_failed` | 401 | refresh_token rejeté par Google (révoqué externe, password reset) | re-OAuth sur ce compte précis |
| `google_token_decrypt_failed` | 500 | clé chiffrement absente/rotée sans migration | incident infra, alerter ops |

**Body** :

```json
{
  "code": "<typed_code>",
  "message": "<human-readable>",
  "available_accounts": [                 // optionnel — présent sur 400 et 409
    {
      "google_sub": "...",
      "email": "...",
      "name": "...",                       // B7 : inclus pour éviter un 2e fetch
      "picture": "..."                     // B7
    }
  ]
}
```

Alignement des trois conventions existantes (B10) :
- `frontend-classroom-binding §2.2` (401 `classroom_oauth_required`) → renommer en 401 `google_account_not_connected`
- `n8n-classroom-sync-contract §2.5` (412 `classroom_token_missing`) → renommer en 401 `google_refresh_failed` ou `google_account_not_connected` selon le cas réel
- RFC-089 §3.5 (ce tableau) reste source de vérité

---

## 4. Impact front

Cette section recense **les contraintes que le contrat back impose au front** et **les choix UX que le front doit trancher** (la conception détaillée de l'UI revient à l'équipe front). Les réponses du front seront ajoutées en annexe à cette RFC.

### 4.1 Contraintes back → front (non négociables)

| # | Contrainte | Origine |
|---|---|---|
| C1 | Le front doit pouvoir appeler `GET /api/google/accounts` pour récupérer la liste des comptes connectés du user courant. | §3.1 |
| C2 | Pour **ajouter** un nouveau compte, le front appelle `POST /api/google/accounts/connect` avec `{return_url, scopes?}`, reçoit `{redirect_url}` et navigue vers cette URL (consent Google). Au retour, query param `?account_added={google_sub}`. | §3.1, §1.3 |
| C3 | Pour **supprimer**, `DELETE /api/google/accounts/{google_sub}`. Comportement : soft-delete back + best-effort revoke côté Google. | §3.1 |
| C4 | **À partir de la Phase 2** (Classroom et services suivants), le front doit passer `google_account_id` dans **chaque** appel qui touche une API Google : query param sur GET, body field sur POST/PUT. | §3.3 |
| C5 | Sur erreur `400 google_account_id_required`, le body inclut `available_accounts: [{google_sub, email}]`. Le front peut afficher un picker à partir de cette liste sans pré-fetch séparé. | §3.5 |
| C6 | Sur erreur `401 google_refresh_failed`, le front doit afficher un prompt de re-connexion pour ce compte (re-OAuth via `POST /api/google/accounts/{sub}/refresh-scopes` ou un nouveau `connect`). Le compte reste en base mais n'est plus utilisable tant que pas re-authentifié. | §3.5 |
| C7 | Sur erreur `403 google_missing_scopes`, le body indique les scopes manquants. Le front peut proposer un `POST /api/google/accounts/{sub}/refresh-scopes` pour étendre les permissions du compte sans en créer un nouveau. | §3.5 |
| C8 | Sur erreur `404 google_account_not_found` ou `410 google_account_revoked`, le compte référencé n'est plus valide. Le front doit invalider sa cache locale et re-fetch la liste. | §3.5 |
| C9 | Au déploiement Phase 1, **tous les tokens Google actifs sont invalidés** (re-prompt OAuth obligatoire). Le front doit gérer un état "aucun compte connecté" pour 100% des users actifs Google le jour J. | §0, §6 |

### 4.2 Choix UX laissés au front

Le back ne préjuge **pas** de ces décisions. Ce sont des questions ouvertes à arbitrer par l'équipe front, idéalement en consultation avec produit.

**Q-F1 — Où l'utilisateur gère-t-il ses comptes Google connectés ?**

Pistes :
- (a) Une seule page settings globale `/settings/google-accounts` listant tous les comptes avec actions add/remove/refresh-scopes.
- (b) Une section par service (Gmail settings, Calendar settings, Classroom settings) avec les comptes pertinents pour ce service.
- (c) Combinaison : page globale + raccourcis contextuels par service.

Impact technique : la page globale suffit pour couvrir tous les besoins du back. (b)/(c) sont du sucre UX.

**Q-F2 — Comment l'utilisateur choisit-il le compte cible pour une action donnée ?**

Le back exige `google_account_id` sur chaque appel Phase 2+ (cf. C4). Le front peut implémenter :
- (a) Picker per-call : à chaque action, un dropdown demande quel compte utiliser. Verbose mais explicite.
- (b) Selector sticky : un compte actif est sélectionné dans la topbar/sidebar et utilisé par défaut pour toutes les actions Google jusqu'à changement. Comme un picker d'organisation/workspace.
- (c) Compte par défaut persisté par-page : la liste de classrooms se rappelle quel compte a été utilisé la dernière fois.
- (d) Réactif au context : pour les ressources déjà liées (ex: un `classroom_binding` créé avec un sub précis), le compte est imposé ; pour les autres, fallback sur une heuristique (single account → auto, sinon picker).

Le back permet n'importe laquelle de ces options. Recommandation à valider : (d) si réaliste, sinon (b).

**Q-F3 — Faut-il un concept de "compte préféré/primary" côté front ?**

Le back **n'a pas** de colonne `is_primary` (§2.2). Si le front veut un compte par défaut cross-session, il le persiste lui-même :
- (a) localStorage (simple, par device).
- (b) Endpoint préférences user (`user_preferences.google_default_account_sub`) — propre, multi-device, mais demande un petit aller-retour back si pas déjà exposé.
- (c) Pas de notion de primary : toujours demander explicitement (pénible UX).

Si le front choisit (b), back ajoute le champ dans `user_preferences` au passage — petite extension, faisable dans la Phase 1.

**Q-F4 — Signal visuel du compte actif ?**

Quand un compte est "sélectionné" (per Q-F2), comment l'utilisateur le voit ?
- Avatar + email dans la topbar.
- Badge sur les cards ressources (chaque classroom affiche son `google_email` d'origine).
- Indication implicite (titre de section, breadcrumb).

Cette question est purement front, sans impact back.

**Q-F5 — Flow de re-connexion (refresh_failed)** ?

Sur erreur C6, le front a plusieurs options :
- (a) Toast + bouton "Reconnecter" qui ouvre le flow OAuth dans un nouvel onglet/popup. L'utilisateur revient sur la page en cours.
- (b) Redirect full-page vers le flow OAuth, retour sur la page après. Plus simple à implémenter mais casse le contexte.
- (c) Modal bloquant à la première erreur, jusqu'à reconnexion.

Cette question est purement front (UX d'erreur).

**Q-F6 — Suppression d'un compte référencé par une ressource ?**

Cas : l'utilisateur a un `expert_program` lié à un classroom du compte X (cf. PR #2355), et il supprime ce compte X via le front.

Le back actuel (§3.1, `DELETE`) fait un soft-delete sans cascade. La ressource liée garde la référence `google_sub` mais devient inutilisable.

Pistes front :
- (a) Avant le DELETE, le front fetch les ressources liées (besoin d'un endpoint back `GET /api/google/accounts/{sub}/dependents` — à ajouter si retenu) et avertit l'utilisateur.
- (b) Le front lance le DELETE direct, gère a posteriori les 404 sur les ressources liées (UX dégradée).
- (c) Le back refuse le DELETE si des ressources liées existent (409 Conflict avec liste). Le front affiche la liste pour traitement manuel.

À trancher conjointement avec back si retenu (a) ou (c) — sinon (b) est gratuit.

### 4.3 Touchpoints front identifiés (non-exhaustif)

Pour aider l'estimation front, les endroits de l'app où le multi-compte sera visible :

- Page settings (nouvelle ou existante) — gestion CRUD comptes.
- Pages Classroom (Phase 2) — picker + tag visuel par classroom.
- Pages Expert programs liées à classroom (post PR #2355) — affichage du `google_email` d'origine.
- Page Gmail/Calendar/Drive (Phases 3+) — picker à ajouter quand chaque service migre.
- Topbar / sidebar — éventuel selector global (cf. Q-F2).

### 4.4 Questions pour l'équipe front (à intégrer en réponse dans cette RFC)

Synthèse, pour rédaction par le front :

1. Q-F1 — Localisation de la gestion des comptes Google
2. Q-F2 — Mécanisme de sélection du compte cible
3. Q-F3 — Concept de compte préféré
4. Q-F4 — Signal visuel
5. Q-F5 — Flow re-connexion
6. Q-F6 — Suppression d'un compte avec dépendances

Le front est invité à ajouter ses réponses (et des questions complémentaires si besoin) en **Annexe A — Réponse équipe front**.

## 5. Impact MCP / n8n

Cette section couvre les contraintes que RFC-089 impose à la pile MCP/n8n et les incohérences existantes qu'il faut résoudre **avant** d'introduire `google_account_id`.

### 5.1 Alignement préalable du contrat MCP (B1) — ✓ résolu

Deux conventions étaient documentées en parallèle :

- `MCP_CLASSROOM_INTEGRATION.md` : `{operation:"course.list", params:{…}}` + camelCase
- `RFC-083 §3.2` : `{resource:"course", operation:"create", …flat}` + snake_case

**Confirmation MCP team (2026-05-15)** : le serveur accepte **snake_case + flat** (RFC-083 §3.2). Convention canonique actée. `MCP_CLASSROOM_INTEGRATION.md` doit être patché pour aligner.

**Exemple de payload canonique fourni par MCP team** :

```json
{
  "resource": "course",
  "operation": "list",
  "google_account_id": "123456789",
  "tenant_id": "tenant-abc",
  "user_id": "user-xyz"
}
```

**Commentaires chat.api** :

1. **Cohérence avec `n8n_google_token_routes`** (§5.2) : les trois clés `tenant_id`, `user_id`, `google_account_id` à plat dans le payload sont identiques aux query params que `GET /api/n8n/google/token` exige. Pas de friction d'intégration.
2. **Note sur `google_account_id`** : l'exemple MCP utilise `"123456789"` (placeholder court). En vrai, le `sub` d'un ID Token Google fait ~21 chiffres (cf. §2.1 colonne `google_sub VARCHAR(255)`). Aligner les exemples des guides MCP/n8n sur un sub réaliste pour éviter les confusions d'implémentation.
3. **Champs implicites côté chat.api** : dans nos routes REST, `tenant_id` vient typiquement de l'URL path et `user_id` du contexte auth. Côté MCP, c'est l'inverse — tout est explicite dans le payload car le serveur MCP n'a pas de session caller. Ce contraste est volontaire et acceptable.
4. **Pas d'`Annexe C` à créer** : la confirmation est intégrée ici directement, on évite l'inflation d'annexes.

### 5.2 Extension du contrat `n8n_google_token_routes`

Rappel §1.2 + §3.4. Sur Phase 2+ :

- `GET /api/n8n/google/token?tenant_id=&user_id=&service=&google_account_id=` — `google_account_id` obligatoire pour `service ∈ {classroom, ...}`. Réponse augmentée avec `google_account_id` + `google_email` pour audit côté MCP.
- `GET /api/n8n/google/accounts?tenant_id=&user_id=` — nouveau. Auth shared secret n8n (env `N8N_SHARED_SECRET`). Réponse : liste comptes sans `refresh_token`. Permet à n8n de pré-fetch la liste pour construire un picker côté workflow.

### 5.3 Idempotence du webhook sync (B14)

`POST /webhook/expert-program-classroom-sync` (chat.api → n8n) doit devenir idempotent. Aujourd'hui un retry chat.api après timeout peut provoquer une double création de courseWork côté Google Classroom.

**chat.api ajoute** dans le body : `idempotency_key: <uuid4>`. Même clé pour les retries d'une même opération logique (`expert_response_id` donné, opération donnée).

**n8n stocke** un cache `idempotency_key → result` avec TTL **30 min** (révision du 15 du mois : 15 min initialement, étendu à 30 min après analyse). Sur clé connue : renvoie le résultat de la 1ère tentative sans rejouer.

**Calibration du TTL** : un sync de 120 courseWork à 50 ops/s = ~3 min côté nominal. Avec retries Google sur 429 + rate-limit n8n + slow path = jusqu'à 8-10 min réalistes. Le client (chat.api) peut retry après 30-60s sur timeout HTTP, ce qui ouvre une fenêtre de **plusieurs tentatives séquentielles** sur la même clé pendant que la 1ère est encore en cours. TTL = `max(op_max_duration × 3, retry_window × N_retries_max)` ⇒ 30 min couvre les ops longues + 3-4 retries successifs.

**Action n8n** : implémenter le cache idempotence (TTL 30 min). **Action chat.api** : ajouter le champ dans le body, garder la même clé sur retries.

### 5.4 Sécurité du webhook — token Google hors body (B15)

**Risque actuel** : `google_access_token` figure dans le body du webhook. n8n peut logger les bodies (default sur beaucoup d'instances) → fuite tokens dans les logs disque.

**Mitigations cumulatives** :

1. Déplacer `google_access_token` du body au header `X-Google-Access-Token`.
2. Ajouter shared secret `X-Webhook-Secret` (env `MCP_WEBHOOK_SECRET`, partagé chat.api ↔ n8n).
3. Demander à n8n de **désactiver le body logging** sur cet endpoint (config n8n).

**Migration en lockstep** : chat.api émet les nouveaux headers ; n8n les lit. Faire dans la même fenêtre que B14 — la PR Phase 2 cumule.

### 5.5 Rate-limit interne n8n (B16)

Quota Google Classroom ≈ 50 ops/sec. Un programme à 120 courseWork (sync initial d'un cours dense) doit être throttled côté n8n, sinon échec sur les ops post-50.

**Action n8n** : token bucket par endpoint Google + backpressure. Quand quota atteint : attendre (préféré) ou renvoyer `429 Too Many Requests` avec `Retry-After` à chat.api. chat.api propage au front avec le même status + `Retry-After`.

#### 5.5.1 Limite de l'attente synchrone — bascule async pour ops longues

L'« attente préférée » côté n8n est bornée par le timeout HTTP chat.api ↔ n8n (souvent 60-120s par défaut). Sur un programme de 120 courseWork, on dépasse mécaniquement ce timeout dès qu'on entre dans le slow path Google.

**Recommandation** : pour toute opération > **20 courseWork** (seuil indicatif, à calibrer), basculer en mode **async par défaut** :

1. Le webhook initial retourne immédiatement `{ task_id, status: 'processing' }` (HTTP 202 Accepted).
2. n8n exécute la sync en arrière-plan (worker dédié).
3. chat.api expose `GET /api/classroom-sync/{task_id}/status` → `{ status, progress, result?, error? }`.
4. Le front poll cet endpoint avec un intervalle doublé exponentiellement (1s → 2s → 4s → 8s, cap 30s) jusqu'à terminal state.

Ce pattern est déjà mentionné comme **V2.1** dans `n8n-classroom-sync-contract.md`. RFC-089 ne le réinvente pas mais l'**ancre comme prérequis Phase 2** pour les ops dépassant un seuil simple. Sans ça, les syncs gros volumes échouent silencieusement par timeout côté UI.

Le mode sync court reste valide pour les opérations < 20 courseWork (~3-5s typiquement), où l'UX d'un spinner court vaut mieux qu'un polling.

Hors scope strict chat.api mais block Phase 2.

### 5.6 Format erreur unifié (B17)

Toutes les réponses d'erreur back/n8n/MCP s'alignent sur le format RFC-089 §3.5 :

```json
{
  "code": "<typed_code>",
  "message": "<human-readable>",
  "available_accounts": [...]   // optionnel selon le code
}
```

**À patcher** :
- `MCP_CLASSROOM_INTEGRATION.md` (deux formats incohérents dans le même doc)
- `n8n-classroom-sync-contract.md`
- `frontend-classroom-binding.md` (cf. B10)

Pure doc, pas de code.

### 5.7 Stratégie de bascule progressive (B18)

**Le front et le MCP envoient `google_account_id` dès Phase 1**, sur tous les services Google, même non encore migrés multi-compte.

Back :
- Services Phase 1 transitoires (Gmail/Calendar/Drive/Contacts) : `google_account_id` accepté mais **optionnel**. Si présent → utilise ce compte ; si absent et user a 1 compte → fallback ; si absent et user a +1 compte → `400 google_account_id_required`.
- Services Phase 2+ (Classroom, puis suivants) : `google_account_id` **obligatoire**. 400 si absent.

**Avantage** : pas de feature flag, pas de coordination front↔back à la migration de chaque service. Le passage d'un service en "obligatoire" est transparent pour les clients qui envoient déjà le champ.

---

## 6. Migration & déploiement

### 6.1 Phase 1 — Couche storage + re-prompt OAuth

**Étapes au déploiement** (ordre strict) :

1. Préparer la clé Fernet (env staging puis prod, hors-repo, backup KMS-grade).
2. Préparer `MCP_WEBHOOK_SECRET` (idem).
3. Migration alembic : créer la table `user_google_accounts` dans chaque schéma tenant (cf. §2.1).
4. Déploiement code chat.api : nouveau callback OAuth + nouveau resolver + GmailTokenManager en mode "single account fallback".
5. **Script purge Redis** : supprimer toutes les clés `oauth_token:{tenant_id}:{user_id}` existantes. À exécuter **après** le déploiement code, **séparé** de la migration alembic (responsabilités distinctes : migration = schema, script = data).
6. Activation côté front : page settings, gestion du flow re-OAuth, codes erreur.

**Côté user** : à la prochaine action Google, le front voit "compte non connecté" et propose "Connecter Google". L'user clique, fait le flow OAuth Google standard, son token est stocké dans la nouvelle table avec 1 row. Continue.

**Pas de backfill** des tokens — décision §0 (re-prompt obligatoire).

### 6.2 Comportement Phase 2 sur les `classroom_binding` (B6)

Les bindings créés avant Phase 2 (PR #2355 et antérieures) n'ont jamais porté de `google_account_id`. La décision §B.0 acte que c'est volontaire et **doit le rester** : le binding est tenant-scopé, l'auth est par caller. Phase 2 introduit l'exigence de passer `google_account_id` côté caller, pas côté binding.

**Stratégie côté back — résolution à chaque appel Phase 2** :

1. **Le caller envoie son `google_account_id`** (cas standard Phase 2+) → back valide qu'il appartient bien au caller (`SELECT ... WHERE user_id = current_user AND google_sub = ? AND revoked_at IS NULL`), valide les scopes, utilise pour l'appel Google API. Erreurs : codes §3.5.
2. **Le caller n'envoie pas `google_account_id`** (rétrocompat soft Phase 2, ou client mal câblé) — le back regarde les comptes du **caller** lui-même, pas du créateur du binding :
   - Si le caller n'a **aucun** compte connecté → `401 google_account_not_connected`.
   - Si le caller n'a qu'**un seul** compte connecté → l'utiliser (transparent, équivalent single-account avant Phase 2).
   - Si le caller a **plusieurs** comptes connectés → `400 google_account_id_required` avec `available_accounts` = comptes du caller. Le front affiche un picker.

**Pas de backfill data** : aucune migration n'écrit dans `classroom_binding`. La résolution est paresseuse à chaque appel.

**Cas où le caller n'a pas accès à la classe Google sous-jacente** (le binding a été créé par user1 sur une classe que user2 ne voit pas côté Google) :
- L'appel Google API retourne `PERMISSION_DENIED` (équivalent 403 côté Google).
- Le back propage `403 google_missing_scopes` (ou un code dédié `google_class_access_denied` à arbitrer en implémentation).
- UX front : "Tu n'as pas accès à cette classe Google. Demande à l'enseignant qui a créé ce binding."

Cette stratégie élimine la nécessité d'un code `binding_owner_not_connected` : sous §B.0, le binding n'a pas d'"owner Google" à reconnecter. Si le caller ne peut pas accéder à la classe, c'est un défaut d'accès Google côté caller, pas un problème côté créateur.

#### 6.2.1 Tension UX — friction du choix à chaque appel

Conséquence directe de §B.0 (binding sans `google_account_id`) + §6.2 cas 2c : à chaque appel sur un binding par un caller qui a plusieurs comptes connectés, l'user **doit re-choisir un compte**. Aucune mémoire côté back. Sur un dashboard Classroom qui liste 20 bindings, cliquer chaque binding pour le consulter = 20 pickers à valider.

C'est cohérent avec le principe « auth par caller, pas par ressource » (§B.0) — mais friction UX permanente.

**3 options à arbitrer (à acter avec produit + front)** :

| Option | Description | Coût | Cohérence §B.0 |
|--------|-------------|------|-----------------|
| (a) | Accepter la friction — picker à chaque appel. UI rend ça léger (last-used pre-selected, raccourci clavier). | 0 (déjà spec) | ✅ pure |
| (b) | Persister le choix dans `user_preferences.google_default_account_per_binding[binding_id] = google_sub`. Cross-session, per-user, per-binding. Cache invalidé sur DELETE compte. | +0.5j back (schema preferences) + 0.5j front | ✅ — le binding reste agnostique, c'est l'user qui mémorise sa préférence |
| (c) | Réintroduire `google_account_id` sur le binding **comme hint** (pas comme contrainte). Le caller peut overrider. Si null, picker. Si set, utilisé sans re-prompt. | +1j back (migration + writes) + 0.5j front | ⚠️ tension — viole « binding par ressource » sauf si on cadre « hint non-contraignant » explicitement |

**Reco** : (b) — bonne UX sans casser le modèle. (a) acceptable si on accepte la friction. (c) à éviter sauf si produit insiste sur le « un compte par binding par défaut ».

**Question ouverte** : à trancher avec produit avant Phase 2.

### 6.3 Suppression d'un compte référencé (B21)

`DELETE /api/google/accounts/{sub}` ne déclenche **aucune cascade** sur les ressources qui pointent vers ce compte. Cohérent avec B.0 (auth par caller, pas par ressource).

**Conséquences post-DELETE pour les `classroom_binding`** :
- Si le compte supprimé était le seul lien du caller : binding inaccessible pour lui jusqu'à reconnexion d'un compte avec scope adéquat.
- Si plusieurs users du tenant partagent l'accès à la classe Google sous-jacente : ils continuent à voir et utiliser le binding (cf. B.0).

**UX front** : sur les ressources qui dépendaient d'un compte révoqué, afficher "compte déconnecté — reconnecter pour accéder". Pas d'erreur silencieuse, pas de 404 brutal côté UI.

### 6.4 Rollback Phase 1

Si le code Phase 1 doit être reverté en urgence après le déploiement :
- Garder la table `user_google_accounts` (peu importe son contenu).
- Le code legacy revient à lire Redis, qui est vide post-purge → users re-OAuth de toute façon.
- **Aucun scénario sans dégât utilisateur** en rollback rapide : la purge Redis est irréversible. C'est le prix de la décision §0 (re-prompt obligatoire).

→ Décision : déploiement Phase 1 hors heures de pointe (early morning lundi par ex), avec rollback préparé mais accepté comme coûteux.

### 6.5 Pré-requis avant Phase 1

- ✅ Décisions techniques RFC-089 §1-6 validées (cf. §0).
- ⬜ Réponse front (Annexe A) — choix UX Q-F1 à Q-F6.
- ✅ Réponse MCP team — B1 (canonique payload), B14 (idempotency), B15 (sécu webhook), B16 (rate-limit), B17 (format erreur). Cf. Annexe C.
- ✅ Réponse n8n team — M3 (cache idempotence), M5 (body logging), M6 (rate-limit), M7 (async mode). Cf. Annexe D.
- ⬜ Verification OAuth Google project en mode Production (B19) — DevOps.
- ⬜ Consent screen Azy validé légal (B20) — légal + produit.
- ⬜ Clé `GOOGLE_TOKEN_ENCRYPTION_KEY` générée + stockée hors-repo (32 bytes base64).
- ⬜ Secret `MCP_WEBHOOK_SECRET` généré + partagé chat.api ↔ n8n.
- ⬜ RFC-083 §7.6 acte explicitement la sémantique multi-user du binding (B.0, B4, B5).

---

## 7. Plan de livraison phasé

### 7.1 Phase 1 — Infra multi-compte (chat.api)

| # | Tâche | Effort | Bloqueurs |
|---|---|---|---|
| P1.1 | Migration alembic `user_google_accounts` (tous tenants) | 0.5j | — |
| P1.2 | Modèle `UserGoogleAccount` + service CRUD | 0.5j | P1.1 |
| P1.3 | `TokenCipher` (Fernet + rotation versionnée) | 0.5j | — |
| P1.4 | `MultiAccountTokenResolver` (lecture DB + cache Redis + lock distribué + fallback pg advisory) | 1j | P1.2, P1.3 |
| P1.5 | Adapter `GmailTokenManager` au mode "single account fallback" | 0.5j | P1.4 |
| P1.6 | Adapter callback OAuth `google_auth_routes` (UPSERT row au lieu d'écriture Redis) | 0.5j | P1.2 |
| P1.7 | Nouveau router `user_google_accounts_routes` (5 endpoints §3.1) | 1j | P1.4 |
| P1.8 | Patch `n8n_google_token_routes` (accepter `google_account_id` optionnel Phase 1) | 0.5j | P1.4 |
| P1.9 | Script purge Redis tokens (post-deploy, séparé alembic) | 0.2j | — |
| P1.10 | Tests intégration (CRUD + flow OAuth + fallback) | 1j | P1.1-P1.8 |
| P1.11 | Doc compagnon front + n8n (clés API, codes erreur, exemples) | 0.3j | P1.7 |

**Total Phase 1 chat.api : ~6.5j.** Front en parallèle (effort à estimer par l'équipe front cf. Annexe A).

### 7.2 Phase 2 — Classroom multi-compte

| # | Tâche | Effort | Bloqueurs |
|---|---|---|---|
| P2.1 | Endpoints classroom acceptent `google_account_id` obligatoire | 0.5j | Phase 1 livrée |
| P2.2 | Backfill paresseux `classroom_binding` (§6.2) | 1j | Phase 1 + RFC-083 §7.6 acte B.0 |
| P2.3 | Patch `n8n_google_token_routes` → `google_account_id` obligatoire pour service=CLASSROOM | 0.2j | P2.1 |
| P2.4 | Webhook sync : `idempotency_key` (B14) + token en header + shared secret (B15) | 1j | Coordination n8n team |
| P2.5 | Patcher guides MCP/n8n pour format erreur unifié (B17) | 0.3j | — |
| P2.6 | Tests intégration | 1j | P2.1-P2.5 |

**Total Phase 2 chat.api : ~4j + coord MCP/n8n** (rate-limit B16, cache idempotence n8n, désactivation body logging).

### 7.3 Phases 3+ — Gmail / Calendar / Drive / Contacts

Mêmes patterns que Phase 2, un service à la fois selon priorité produit. Effort par service ≈ 1-2j chat.api + UI front correspondante.

Pas de coordination supplémentaire MCP/n8n : les changements ont été faits en Phase 2.

### 7.4 Jalons critiques

- **Phase 1 ne peut pas démarrer** tant que les pré-requis §6.5 ne sont pas verts.
- **Phase 2 ne peut pas démarrer** tant que Phase 1 n'est pas livrée + verification Google project (B19) en Production.
- **Phases 3+** : décorrelées, peuvent démarrer dès Phase 2 livrée.

---

## 8. Conformité & sécurité données

### 8.1 Chiffrement au repos (rappel §2.4 + B11)

Le `refresh_token` est chiffré Fernet (AES-128-CBC + HMAC-SHA256). Clé symétrique 32 bytes (base64) en env `GOOGLE_TOKEN_ENCRYPTION_KEY`.

**Tradeoff env vs KMS** :
- Env : simplicité ops, zéro latence/coût par appel. Threat model accepté : un attaquant qui obtient la DB sans l'env (DB dump leak, sauvegarde mal protégée) ne peut pas décrypter. Un attaquant qui obtient l'env (compromission machine) accède de toute façon à toutes les autres credentials → game over indépendamment du choix.
- KMS : audit log accès clé + rotation managée, mais latence/coût/IAM à gérer.

Décision : env aujourd'hui. L'interface `TokenCipher` (cf. §1.1) permet de swap vers KMS sans toucher le reste si la politique sécu évolue.

### 8.2 Conformité RGPD / COPPA / FERPA (B20)

**Scope sensible** : `classroom.rosters.readonly` retourne des PII de mineurs (élèves de la classe).

**Engagements à câbler** :

1. **Consent screen Azy** — avant le redirect Google, écran explicite affichant les scopes demandés en français + finalité métier ("Synchroniser les programmes experts avec ta classe Google Classroom"). En complément du consent natif Google, pas en substitution.
2. **Purge sur suppression** — `DELETE /api/google/accounts/{sub}` doit purger les caches Redis qui contiennent des données issues de ce compte (inventaire des caches à vérifier en Phase 1).
3. **Logs** — ne JAMAIS logger les rosters complets, juste des counts. Le `email` du compte Google reste OK (info publique du user lui-même).
4. **Retention** — `revoked_at IS NOT NULL` permet l'audit, mais le `refresh_token_enc` peut être nullifié J+30 après révocation pour minimiser la surface (job nightly).

**Action légale** : revue par avocat data du consent screen + politique de retention avant Phase 1 prod.

### 8.3 Sécurité du webhook MCP (rappel §5.4 + B15)

Le token Google ne transite **jamais** dans le body d'un webhook dont on ne contrôle pas le logging. Toujours header + shared secret + body logging désactivé côté n8n.

### 8.4 Audit trail

Les colonnes `connected_at`, `last_refreshed_at`, `last_used_at`, `revoked_at` permettent un audit minimal. Pas de table d'audit append-only séparée en Phase 1 (YAGNI). Si compliance demande plus tard une trace immuable de chaque utilisation : ajouter `user_google_accounts_audit` en RFC ultérieure.

#### 8.4.1 Write amplification sur `last_used_at`

Toucher `last_used_at` à chaque `resolve()` génère un UPDATE par appel API Google. Un user actif fait 50-200 calls/heure → 50-200 UPDATEs sur la même row. Surcharge évitable sur Postgres (chaque UPDATE = row version + WAL + bloat).

**Mitigation** : échantillonner — `UPDATE user_google_accounts SET last_used_at = now() WHERE user_id = ? AND google_sub = ? AND (last_used_at IS NULL OR last_used_at < now() - interval '5 minutes')`. Au pire 12 writes/heure par compte (sur l'heure pleine d'usage). Le champ reste représentatif pour audit (granularité 5 min suffit).

Recommandation : implémenter cette optimisation **dès Phase 1** (1 ligne de SQL), pas une dette future.

---

## Annexe A — Réponse équipe front (à remplir)

À compléter par l'équipe front pour répondre aux questions Q-F1 à Q-F6 (§4.4).

---

## Annexe B — Questions front résiduelles (pour chat.api)

Cette annexe rassemble les points qui restent à trancher après lecture de RFC-089 par le front, à confronter à RFC-083 (Classroom) et aux guides associés (`MCP_CLASSROOM_INTEGRATION.md`, `n8n-classroom-sync-contract.md`, `frontend-classroom-binding.md`). Les questions sont groupées par équipe destinataire et listées dans l'ordre du besoin front (ce qui bloque vs ce qui peut attendre).

### B.0 Décision confirmée — sémantique du binding multi-user

**Cas validé** : 2 users `user1@gmail.com` et `user2@gmail.com` peuvent travailler sur la même Google Classroom s'ils sont tous deux profs de la classe côté Google. Chacun a sa propre connexion OAuth dans Azy ; si user1 se déconnecte (DELETE de son compte), user2 conserve son accès sans impact.

**Conséquence sur le modèle** :

- Le `classroom_binding` (porté par `expert_response.classroom_binding`) est **par ressource** : il stocke `course_id`, `topic_ids`, `coursework_ids` — pas de référence au `google_account_id` qui l'a créé.
- L'authentification est **par user** : chaque user qui interagit avec ce binding utilise son propre `google_account_id` (donc son propre token, ses propres scopes).
- Aucune cascade entre `DELETE /api/google/accounts/{sub}` et les bindings existants : les bindings restent intacts. Seul l'auteur de la suppression perd son accès, les autres users avec un compte Google valide qui couvre la même classe continuent.

**Implication contrat back** : `POST /classroom-sync` accepte `google_account_id` du **caller**, pas de la ressource. Le binding ne porte pas ce champ.

À acter explicitement dans RFC-089 §2 et RFC-083 §7.6. Demande : confirmer ce modèle ou proposer un autre.

### B.1 Questions encore bloquantes — en attente d'autres équipes

| # | Sujet | En attente de | Pourquoi pas réglé dans RFC-089 |
|---|-------|---------------|----------------------------------|
| B19 | Statut Google verification project (Testing 100 users vs Production). | **DevOps / Produit** | §6.5 — pré-requis dur de Phase 1 production. Sans Production, on plafonne à 100 users. |
| B20 (partiel) | Consent screen Azy + revue légal. | **Légal + Produit** | §8.2 spec le contenu attendu ; validation légal pending avant Phase 1 prod. |

### B.2 Questions résolues dans le corps de la RFC ✓

Ces questions ont été traitées en rédaction RFC-089 (révisions 2026-05-14 → 2026-05-15). Elles restent listées pour traçabilité.

| # | Sujet | Résolution |
|---|-------|------------|
| B1 | Convention payload MCP (camelCase vs snake_case) | ✓ §5.1 — MCP team confirme snake_case + flat (RFC-083 §3.2) comme canonique. Exemple payload inscrit. `MCP_CLASSROOM_INTEGRATION.md` à patcher pour aligner. |
| B4 | Listing inverse `/courses/{id}/expert-programs` — visibilité partagée | ✓ §3.3.1 — filtre `tenant_id` seul, mutation gated par RBAC |
| B5 (partiel) | `classroom:write` non-créateur — pan multi-compte | ✓ §3.3.2 — admin override utilise son propre compte ; décision RBAC produit reste RFC-083 §D.3 |
| B6 | Backfill Phase 2 des `classroom_binding` | ✓ §6.2 — pas de backfill data. Résolution paresseuse au call : caller fournit son `google_account_id` ; back regarde les comptes du **caller** (pas du créateur, cohérent §B.0), avec fallback auto si 1 compte ou 400 si N |
| B7 | Body `available_accounts` (name, picture inclus ?) | ✓ §3.5 — body inclut `name` et `picture` |
| B8 | Annulation côté Google sur consent screen | ✓ §1.3 — `${return_url}?error=oauth_cancelled` |
| B9 | Ordre stable du `GET /api/google/accounts` | ✓ §3.1 — `ORDER BY last_used_at DESC NULLS LAST, connected_at DESC` |
| B10 | Mapping HTTP « token manquant » (3 conventions divergentes) | ✓ §3.5 — alignement 401 `google_account_not_connected` / `google_refresh_failed`, anciens noms renommés |
| B11 | Clé Fernet en env vs KMS | ✓ §8.1 — tradeoff explicité, interface `TokenCipher` swap-ready |
| B12 | Procédure rotation `refresh_token_key_version` lazy | ✓ §2.4.1 — runbook 7 étapes + monitoring count V1 + risque purge prématurée |
| B13 | Lock Redis tombé pendant refresh | ✓ §1.6 — 3 couches (Redis + pg advisory + retry on invalid_grant) + §1.6.1 circuit breaker |
| B14 | Idempotence webhook sync | ✓ §5.3 — `idempotency_key` + cache n8n TTL **30 min** (calibration justifiée) |
| B15 | Sécurité webhook (token en clair body) | ✓ §5.4 — token déplacé header `X-Google-Access-Token` + `X-Webhook-Secret` + désactivation body logging n8n |
| B16 | Rate-limit interne avant 429 | ✓ §5.5 — token bucket + backpressure ; §5.5.1 bascule async pour ops > 20 courseWork |
| B17 | Format erreur unifié (3 shapes divergentes) | ✓ §5.6 — RFC-089 §3.5 source de vérité ; autres docs à patcher en cohérence |
| B20 (technique) | RGPD / COPPA / FERPA — exigences techniques | ✓ §8.2 — consent screen, purge sur DELETE, retention `refresh_token_enc` nullifié J+30 |
| B21 | Suppression compte référencé | ✓ §6.3 — pas de cascade, UX front "compte déconnecté — reconnecter" |

Note opérationnelle : ces sections sont les **références opposables** quand une équipe consulte la RFC.

### B.2.1 Questions renvoyées hors scope RFC-089

| # | Sujet | Où traiter |
|---|-------|------------|
| B2 | URL serveur MCP (`mcp-server:8765` vs `pi6.local:8002`) | Config DevOps par environnement, hors scope archi logicielle. Géré par settings + env vars, pas par la RFC. |
| B3 | Shape JSON de `GET /api/google-classroom/courses/{id}/summary` | RFC-083 + `MCP_CLASSROOM_INTEGRATION.md`. Demande d'exemple JSON à inscrire dans le guide Classroom. Pas une décision multi-compte. |
| B5 (RBAC produit) | "Admin tenant peut-il override `not_creator` ?" | RFC-083 §D.3 (RBAC produit). RFC-089 a couvert le pan multi-compte (§3.3.2) ; il reste à trancher produit. |
| B22 | `topic_strategy` (`by_sequence \| single`) — param mort ? | RFC-083 §D.3 Q6 + `frontend-classroom-binding.md`. Recommandation : retirer le param (YAGNI). |

### B.3 Questions encore ouvertes (non bloquantes côté chat.api)

| # | Sujet | Pourquoi pas bloquant |
|---|-------|------------------------|
| B18 | Phase 1 transitoire Gmail/Calendar/Drive — comment l'UI bascule en obligatoire ? | §5.7 propose la bascule transparente (back accepte optionnel puis bascule en obligatoire). Plus de feature flag UI nécessaire. **À confirmer côté produit** : OK avec un changement silencieux ou prévoir release notes ? |
| §6.2.1 | Friction picker per-call quand le caller a N comptes | 3 options proposées par front (a/b/c). Reco (b) — préférence persistée per-binding dans `user_preferences`. **À arbitrer avec produit** avant Phase 2. |

### B.4 Format réponse souhaité

Pour chaque question encore ouverte (B.1 et B.3) :
- **B-numéro** + une décision tranchée (ou « WONTFIX, voir <RFC/doc> »)
- 1-3 lignes max de motivation
- Lien vers la PR/commit qui implémente si déjà fait

Idéalement intégré directement dans RFC-089 § correspondant pour devenir source de vérité. Cette annexe B peut être supprimée une fois toutes les questions adressées.

---

## Annexe C — Réponse équipe MCP

> **Date** : 2026-05-15
> **De** : équipe Azy-MCP

### C.1 Réponses aux questions B.1

| # | Question | Réponse | Statut |
|---|----------|---------|--------|
| B1 | Convention payload MCP | **snake_case + flat** (RFC-083 §3.2) confirmé comme canonique | ✅ Résolu |
| B2 | URL serveur MCP | Retiré — géré par `settings.py` + env vars | ✅ Hors scope |

### C.2 Plan d'action MCP — Phase 2

| # | Action | Effort | Dépendances |
|---|--------|--------|-------------|
| M1 | Étendre `n8n_google_token_routes` : accepter `google_account_id` obligatoire pour `service=classroom` | 0.5j | Phase 1 livrée |
| M2 | Nouveau endpoint `GET /api/n8n/google/accounts` (liste comptes sans refresh_token) | 0.3j | Phase 1 livrée |
| M4 | Sécuriser webhook côté MCP : accepter `X-Google-Access-Token` header + valider `X-Webhook-Secret` | 0.5j | Lockstep n8n |
| M8 | Aligner format erreur sur §3.5 | 0.2j | — |

**Total MCP : ~1.5j**

### C.3 Actions n8n identifiées (à estimer par l'équipe n8n)

| # | Action | Dépendances |
|---|--------|-------------|
| M3 | Cache idempotence webhook `idempotency_key` (TTL 30 min) | — |
| M5 | Désactiver body logging sur endpoint sync | M4 |
| M6 | Rate-limit interne (token bucket ~50 ops/s Google Classroom) | — |
| M7 | Bascule async pour ops > 20 courseWork (§5.6.1) | M6 |

### C.4 Prérequis MCP avant Phase 2

- ✅ B1 résolu (convention payload)
- ✅ B2 retiré
- ⬜ `MCP_WEBHOOK_SECRET` généré et partagé avec chat.api (action DevOps)
- ⬜ Coordination lockstep M4 avec n8n (même fenêtre de déploiement)

### C.5 Engagement

L'équipe MCP s'engage à livrer M1, M2, M4 (partie MCP), M8 dans la **PR Phase 2 MCP**, synchronisée avec la PR Phase 2 chat.api.

Les actions n8n (M3, M5, M6, M7) sont à coordonner avec l'équipe n8n séparément.

---

## Historique de la session

- 2026-05-14 — Brainstorming initial. 5 décisions structurantes prises (cf. §0). Sections 1-3 rédigées et validées.
- 2026-05-15 (matin) — Front a confronté RFC-089 à RFC-083 + 3 guides Classroom. Sémantique du binding multi-user clarifiée (§B.0). 22 questions résiduelles ajoutées en Annexe B pour transmission à chat.api.
- 2026-05-15 (après-midi) — chat.api rédige §5-8 (MCP/n8n, migration, plan livraison, conformité) + patche §1-3 pour intégrer B7-B13. 13 questions B.2 résolues, 3 questions B.2.1 renvoyées hors scope.
- 2026-05-15 (soir) — Front ajoute §1.6.1 (circuit breaker), §5.5.1 (bascule async > 20 courseWork), §6.2.1 (tension UX picker — question ouverte produit), §8.4.1 (write amplification last_used_at). Réorganise Annexe B en B.1 (4 ouvertes externes) / B.2 (15 résolues) / B.2.1 (3 hors scope) / B.3 (2 non-bloquantes).
- 2026-05-15 (soir, 2e passe) — chat.api acte B4 (§3.3.1) et B5 partiel (§3.3.2), cross-ref §8.4.1 dans §1.4. RFC prête pour validation finale.
- 2026-05-15 (auto-review) — corrections : §6.2 réécrite (caller's accounts au lieu de creator's, cohérence §B.0), code mort `binding_owner_not_connected` retiré de §3.5, §6.2.1 reformulée pour parler du caller, §3.1 DELETE cross-réfère §8.2 (purge RGPD), duplicate Annexe B.2 + B.3 supprimée.
- 2026-05-15 (post-review) — §5.2 URL serveur MCP retirée (hors scope archi logicielle, géré par settings + env vars). B2 déplacé vers B.2.1. §5 renuméroté (§5.3 → §5.2, etc.).
- 2026-05-15 (réponse MCP team) — B1 résolu : confirmation snake_case + flat (RFC-083 §3.2) comme canonique, exemple payload inscrit en §5.1 avec commentaires chat.api (cohérence avec n8n routes, longueur réelle du `sub`, contraste champs explicites/implicites).
- 2026-05-15 (après-midi) — Rédaction sections 4-8 + Annexes. 13 questions de l'Annexe B résolues dans le corps (B7-B17, B20, B21) ; B19 explicité en pré-requis Phase 1. Annexe B refondue en 3 buckets : encore bloquantes (B1-B6), résolues (B7-B17 + B19-B21), encore ouvertes non bloquantes (B18, B22).
- 2026-05-15 (soir) — Retour front après confrontation aux prototypes (`/prototypes/google-univers` côté vue-app). Ajout de 4 réflexions techniques : §1.6.1 circuit breaker `invalid_grant` cumulés, §5.3 calibration TTL idempotence à 30 min, §5.5.1 bascule async pour ops > 20 courseWork (V2.1 ancrée comme prérequis Phase 2), §6.2.1 tension UX du choix de compte à chaque appel (contradiction §B.0 vs §6.2 — 3 options arbitrables), §8.4.1 mitigation write amplification sur `last_used_at`.
- 2026-05-15 (réponse MCP) — Ajout Annexe C : plan d'action MCP Phase 2 (4 tâches MCP ~1.5j + 4 tâches n8n à estimer). B1 confirmé (snake_case + flat), B2 retiré. Engagement livraison M1/M2/M4/M8 synchronisé avec PR Phase 2 chat.api.
- 2026-05-15 (réponse n8n) — Ajout Annexe D : plan d'action n8n Phase 2 (4 tâches ~2.6j). Confirmation implémentation M3/M5/M6/M7 avec détails techniques. Engagement livraison synchronisé avec PR Phase 2.

---

## Annexe D — Réponse équipe n8n

> **Date** : 2026-05-15
> **De** : équipe n8n

### D.1 Confirmation des actions identifiées

L'équipe n8n confirme la prise en charge des 4 actions identifiées en Annexe C.3.

### D.2 Plan d'action n8n — Phase 2

| # | Action | Effort | Dépendances | Détails implémentation |
|---|--------|--------|-------------|------------------------|
| M3 | Cache idempotence webhook `idempotency_key` (TTL 30 min) | 0.5j | — | Redis `SET NX` avec clé `idempotency:{key}` → valeur = résultat JSON. Sur hit : return cached result (HTTP 200). Workflow n8n : node "Check Idempotency" en entrée + "Store Result" en sortie. |
| M5 | Désactiver body logging sur endpoint sync | 0.1j | M4 (MCP) | Config n8n `N8N_LOG_LEVEL=info` + exclusion explicite du body sur route `/webhook/expert-program-classroom-sync`. Ajout header `X-No-Log: true` côté workflow pour audit. |
| M6 | Rate-limit interne (token bucket ~50 ops/s Google Classroom) | 1j | — | Implémentation via node Code avec Redis `INCR` + `EXPIRE`. Clé `ratelimit:google:classroom:{tenant}` avec fenêtre glissante 1s. Si > 50 → attente (sleep) ou 429 si timeout dépassé. |
| M7 | Bascule async pour ops > 20 courseWork (§5.5.1) | 1j | M6 | Workflow split : (1) webhook initial retourne 202 + `task_id`, (2) workflow async exécute en background, (3) stocke status dans Redis `task:{id}:status`. Endpoint polling côté chat.api (`GET /api/classroom-sync/{task_id}/status`). |

**Total n8n : ~2.6j**

### D.3 Détails techniques

#### M3 — Cache idempotence

```
Clé Redis : idempotency:classroom-sync:{idempotency_key}
TTL : 30 min (1800s)
Valeur : { "status": "processing|completed|error", "result": {...}, "timestamp": "..." }

Flow :
1. Webhook reçoit request avec idempotency_key
2. SETNX idempotency:classroom-sync:{key} → '{"status":"processing"}'
3. Si SETNX échoue (clé existe) :
   - GET valeur
   - Si status=completed → return cached result
   - Si status=processing → return 409 Conflict "Operation in progress"
4. Exécuter sync
5. SET idempotency:classroom-sync:{key} → '{"status":"completed","result":{...}}'
```

#### M6 — Rate-limit token bucket

```
Clé Redis : ratelimit:google:classroom:{tenant_id}:{window}
Window : epoch_seconds (fenêtre 1s)
Limite : 50 ops/s

Flow :
1. INCR clé
2. Si count == 1 → EXPIRE clé 2s
3. Si count > 50 → attendre (delay = count - 50) * 20ms, max 5s
4. Si attente > 5s → return 429 avec Retry-After: ceil(count/50)
```

#### M7 — Mode async

```
Seuil : > 20 courseWork dans le payload

Flow sync (≤ 20) :
  Webhook → Process → Response 200

Flow async (> 20) :
  Webhook → Generate task_id → Response 202 {"task_id": "...", "status": "processing"}
          → Trigger async workflow (Execute Workflow node)
          → Async: Process → Store result in Redis task:{id}:status
          → chat.api polls GET /api/classroom-sync/{task_id}/status

Status values : pending | processing | completed | error
Redis TTL task : 1h (cleanup automatique)
```

### D.4 Prérequis n8n avant Phase 2

- ⬜ Redis accessible depuis n8n (déjà OK en prod : `host3.local:6379`)
- ⬜ Coordination lockstep M5 avec MCP (désactivation body logging après migration headers)
- ⬜ Variable env `MCP_WEBHOOK_SECRET` configurée côté n8n
- ⬜ Tests intégration avec chat.api sur environnement staging

### D.5 Workflows n8n impactés

| Workflow | Modification |
|----------|--------------|
| `Expert_Program_Classroom_Sync.json` | + idempotence (M3) + rate-limit (M6) + async mode (M7) |
| Nouveau : `Classroom_Sync_Async_Worker.json` | Worker async pour ops > 20 courseWork |
| Config n8n | Body logging désactivé (M5) |

### D.6 Engagement

L'équipe n8n s'engage à livrer M3, M5, M6, M7 dans la **PR Phase 2 n8n**, synchronisée avec :
- PR Phase 2 chat.api (ajout `idempotency_key` dans body, headers sécurisés)
- PR Phase 2 MCP (M4 — validation `X-Webhook-Secret`)

**Fenêtre de déploiement** : lockstep avec chat.api + MCP, même créneau de déploiement pour éviter les incompatibilités transitoires.
