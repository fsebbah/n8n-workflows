# RFC-089 : Mise a jour workflow n8n MCP-Classroom

| Metadata | Value |
|----------|-------|
| **Date** | 2026-05-15 |
| **Auteur** | Equipe MCP |
| **RFC** | RFC-089 (Multi-Account Google OAuth) |
| **Priorite** | Haute |
| **Equipe** | n8n |
| **Type** | Bug / Evolution |

---

## 1. Contexte

RFC-089 introduit le support multi-compte Google OAuth. Les utilisateurs peuvent connecter plusieurs comptes Google (perso + pro/ecole) et doivent specifier quel compte utiliser pour chaque operation.

**Impact sur les workflows Classroom** : le workflow `MCP - Google Classroom Server` doit etre mis a jour pour supporter RFC-089.

---

## 2. Problemes identifies

### 2.1 Token dans le body (DEPRECE)

**Etat actuel** : Le workflow attend `access_token` dans le body de la requete.

```json
{
  "access_token": "ya29.xxx...",  // <-- DEPRECE
  "resource": "course",
  "operation": "getAll"
}
```

**RFC-089 §5.5** : Le token doit etre passe dans le header `X-Google-Access-Token`.

```http
POST /webhook/mcp-classroom
X-Google-Access-Token: ya29.xxx...
Content-Type: application/json

{
  "resource": "course",
  "operation": "getAll"
}
```

### 2.2 Parametre `google_account_id` manquant

**RFC-089** : Pour les services Phase 2+ (dont Classroom), le parametre `google_account_id` est **obligatoire** pour identifier quel compte Google utiliser.

```json
{
  "resource": "course",
  "operation": "getAll",
  "google_account_id": "123456789012345678901"  // <-- NOUVEAU, obligatoire
}
```

### 2.3 Erreurs typees RFC-089 §3.5

Le workflow doit retourner des erreurs typees selon RFC-089 :

| Code | HTTP | Description |
|------|------|-------------|
| `google_account_id_required` | 400 | `google_account_id` manquant |
| `google_account_not_found` | 404 | Compte non connecte |
| `google_missing_scopes` | 403 | Scopes insuffisants |
| `google_refresh_failed` | 401 | Token expire, re-auth necessaire |

**Format erreur RFC-089** :
```json
{
  "success": false,
  "error": {
    "code": "google_account_id_required",
    "message": "google_account_id requis pour service=classroom",
    "available_accounts": [
      {
        "google_sub": "123456789012345678901",
        "email": "teacher@school.edu",
        "name": "John Teacher"
      }
    ]
  }
}
```

---

## 3. Actions requises

### 3.1 Workflow n8n `MCP - Google Classroom Server`

| # | Action | Priorite |
|---|--------|----------|
| 1 | Extraire le token depuis header `X-Google-Access-Token` | Haute |
| 2 | Fallback body `access_token` (backward compat, log warning) | Moyenne |
| 3 | Ajouter parametre `google_account_id` dans le schema | Haute |
| 4 | Valider `google_account_id` present (sinon 400) | Haute |
| 5 | Retourner erreurs typees RFC-089 §3.5 | Moyenne |

### 3.2 Documentation a mettre a jour

| Document | Modifications |
|----------|---------------|
| `docs/guides/GOOGLE_CLASSROOM_MCP_API.md` | Section Auth : header au lieu de body, ajouter `google_account_id` |
| `docs/guides/MCP_CLASSROOM_INTEGRATION.md` | Tous les exemples : header + `google_account_id` |
| `docs/rfc/GOOGLE_CLASSROOM_MCP_API.md` | Idem (doublon a supprimer ?) |

---

## 4. Exemples mis a jour

### Avant (DEPRECE)

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-classroom \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "ya29.xxx...",
    "resource": "course",
    "operation": "getAll"
  }'
```

### Apres (RFC-089)

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-classroom \
  -H "Content-Type: application/json" \
  -H "X-Google-Access-Token: ya29.xxx..." \
  -d '{
    "resource": "course",
    "operation": "getAll",
    "google_account_id": "123456789012345678901"
  }'
```

---

## 5. Plan de migration

### Phase 1 : Backward compatibility (immediate)

1. Workflow accepte token depuis header OU body
2. Si body : log warning "access_token in body is DEPRECATED"
3. `google_account_id` optionnel (fallback sur compte unique si un seul)

### Phase 2 : Strict mode (apres migration chat.api)

1. Token uniquement via header (body rejete)
2. `google_account_id` obligatoire (400 si absent)

---

## 6. Tests de validation

```bash
# Test 1 : Header token + google_account_id (OK)
curl -X POST http://pi6.local:5678/webhook/mcp-classroom \
  -H "X-Google-Access-Token: ya29.xxx..." \
  -H "Content-Type: application/json" \
  -d '{"resource": "course", "operation": "getAll", "google_account_id": "123"}'
# Expected: 200 OK

# Test 2 : Header token sans google_account_id (400)
curl -X POST http://pi6.local:5678/webhook/mcp-classroom \
  -H "X-Google-Access-Token: ya29.xxx..." \
  -H "Content-Type: application/json" \
  -d '{"resource": "course", "operation": "getAll"}'
# Expected: 400 {"error": {"code": "google_account_id_required", ...}}

# Test 3 : Body token (backward compat, warning)
curl -X POST http://pi6.local:5678/webhook/mcp-classroom \
  -H "Content-Type: application/json" \
  -d '{"access_token": "ya29.xxx...", "resource": "course", "operation": "getAll", "google_account_id": "123"}'
# Expected: 200 OK + warning log
```

---

## 7. References

- RFC-089 : `docs/rfc/RFC-089-MULTI-ACCOUNT-GOOGLE-OAUTH.md`
- RFC-083 : `docs/rfc/RFC-083-MCP-GOOGLE-CLASSROOM-SERVER.md`
- MCP implementation : PR #722
