# RFC-009: Scope Classification pour Mention Service

**Status:** Draft
**Date:** 2026-01-16
**Author:** Équipe n8n
**Version:** 1.2.0

---

## Résumé

Ajout d'un système de classification de scope pour déterminer si une question utilisateur est dans le domaine du bot (in_scope) ou hors domaine (out_of_scope). Cette fonctionnalité permet à chaque plugin de définir son périmètre de compétence.

**Important:** Le workflow `LLM - Web Search` dispose déjà d'un mécanisme de vérification de contexte (`allowed_context`). Cette RFC vise à l'exploiter et à standardiser les données de scope.

---

## Problème

Actuellement, quand un utilisateur pose une question à un bot via @mention :

1. Le bot ne sait pas si la question est dans son domaine
2. Il appelle systématiquement le LLM, même pour des questions hors sujet
3. La réponse peut être incohérente ("Je ne sais pas" vs "Je suis spécialisé en...")

**Exemple concret:**
- Bot Appetit (cuisine) reçoit "Quelle est la capitale de la France ?"
- Comportement actuel : Appelle le LLM → réponse aléatoire
- Comportement souhaité : Détecte hors-scope → "Je suis un assistant culinaire, je ne peux pas répondre à cette question"

---

## Mécanisme existant : LLM - Web Search

Le workflow `LLM - Web Search` implémente déjà un système de vérification de contexte via le paramètre `allowed_context`:

```json
{
  "query": "Quelle est la capitale de la France ?",
  "provider": "gemini",
  "google_api_key": "xxx",
  "allowed_context": {
    "description": "cuisine, recettes, ingrédients, ustensiles de cuisine, techniques culinaires",
    "suggestion": "Ce bot est dédié à la cuisine et aux recettes"
  }
}
```

**Flow interne de LLM - Web Search:**
1. Si `allowed_context` est fourni → appel LLM (Claude Haiku) pour classifier
2. Si `valid: true` → continue vers la recherche web
3. Si `valid: false` → retourne erreur 403 `CONTEXT_VIOLATION`

---

## Solution proposée

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                          MENTION---Process-Question                              │
│                                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ Detect       │    │ Get Branding │    │ Build LLM    │    │ Call LLM     │   │
│  │ Intent       │───►│ (avec scope) │───►│ Request      │───►│ Web Search   │   │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘   │
│                                                                      │           │
│                                                         ┌────────────┴──────┐   │
│                                                         ▼                   ▼   │
│                                                  ┌────────────┐     ┌──────────┐│
│                                                  │ Success    │     │ Context  ││
│                                                  │ → Response │     │ Violation││
│                                                  └────────────┘     │ → Message││
│                                                                     └──────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Flow détaillé

```
1. Utilisateur: "@Bot C'est quoi une spatule ?"

2. MENTION---Process-Question:
   ├─ Detect Intent → "question"
   │
   ├─ Get Branding (API) → récupère:
   │     - scope: "cuisine, recettes, ingrédients, ustensiles"
   │     - scope_description: "assistant culinaire"
   │     - llm_provider: "gemini"
   │     - llm_api_keys: { google_api_key: "xxx" }
   │
   ├─ Build LLM Request:
   │     {
   │       query: "C'est quoi une spatule ?",
   │       provider: "gemini",
   │       google_api_key: "xxx",
   │       allowed_context: {
   │         description: scope,
   │         suggestion: "Je suis un {scope_description}"
   │       }
   │     }
   │
   └─ Call LLM - Web Search:
        ├─ Si contexte valide → retourne réponse
        └─ Si hors-scope → retourne erreur 403 CONTEXT_VIOLATION
```

---

## Gestion des clés API LLM

**Décision : Les clés API sont passées par le plugin (chatbot-core)**

Le workflow `LLM - Web Search` attend les clés dans le body de la requête:

| Provider | Clé attendue |
|----------|--------------|
| OpenAI | `openai_api_key` |
| Claude | `anthropic_api_key` |
| Gemini | `google_api_key` |
| Mistral | `mistral_api_key` |

### Option A : Plugin passe les clés (recommandé)

Le plugin chatbot-core envoie ses clés API configurées dans le payload de mention.

**Avantages:**
- Multi-tenant (chaque plugin peut avoir ses propres clés)
- Les clés restent côté plugin (pas stockées dans l'API)
- Cohérent avec l'architecture actuelle de LLM - Web Search

**Payload chatbot-core → n8n:**
```json
{
  "guild_id": "123456789",
  "user_id": "987654321",
  "content": "C'est quoi une spatule ?",
  "llm_config": {
    "provider": "gemini",
    "google_api_key": "AIza..."
  }
}
```

### Option B : Clés stockées dans API (alternative v2)

Les clés sont stockées par projet dans l'API et récupérées via GET /api/branding.

**Inconvénient:** Sécurité des clés à gérer côté API.

---

## Données requises

### Nouveaux champs dans `guild_branding`

| Champ | Type | Obligatoire | Description | Exemple |
|-------|------|-------------|-------------|---------|
| `scope` | TEXT | Non | Description du domaine pour le LLM | "cuisine, recettes, ingrédients, ustensiles de cuisine, techniques culinaires" |
| `scope_description` | VARCHAR(100) | Non | Description humaine courte | "assistant culinaire" |

**Note:** Le champ `llm_provider` n'est pas nécessaire car le plugin passe le provider dans `llm_config`.

### Migration SQL

```sql
ALTER TABLE guild_branding
    ADD COLUMN IF NOT EXISTS scope TEXT,
    ADD COLUMN IF NOT EXISTS scope_description VARCHAR(100);

-- Valeurs par défaut pour bot-appetit
UPDATE guild_branding
SET scope = 'cuisine, recettes, ingrédients, ustensiles de cuisine, techniques culinaires, plats, menus, régimes alimentaires',
    scope_description = 'assistant culinaire'
WHERE project_id = 'bot-appetit';
```

---

## API : Endpoints impactés

### GET /api/branding/guild/{guild_id}

**Réponse attendue (ajout):**
```json
{
  "project_id": "bot-appetit",
  "name": "Bot Appetit",
  "primary_color": "#E67E22",
  "scope": "cuisine, recettes, ingrédients, ustensiles...",
  "scope_description": "assistant culinaire"
}
```

### PUT /api/config/branding (RFC-008)

Permettre la mise à jour des nouveaux champs via l'écran de configuration.

---

## Workflow n8n : Modifications

### MENTION---Process-Question (modifié)

**Nouveaux nodes:**

| Node | Type | Description |
|------|------|-------------|
| Build LLM Request | Code | Construit le payload pour LLM - Web Search |
| Call LLM Web Search | HTTP Request | POST /webhook/llm-web-search |
| Handle Context Violation | IF + Code | Route si erreur 403 CONTEXT_VIOLATION |

**Code "Build LLM Request":**
```javascript
const input = $input.first().json;
const branding = input.branding; // depuis Get Branding
const llmConfig = input.data.llm_config || {}; // depuis chatbot-core

// Déterminer le provider et la clé
const provider = llmConfig.provider || branding.llm_provider || 'gemini';
const apiKeys = {
  openai_api_key: llmConfig.openai_api_key,
  anthropic_api_key: llmConfig.anthropic_api_key,
  google_api_key: llmConfig.google_api_key,
  mistral_api_key: llmConfig.mistral_api_key
};

return {
  query: input.data.content,
  provider: provider,
  ...apiKeys,
  allowed_context: {
    description: branding.scope,
    suggestion: `Je suis un ${branding.scope_description}. Pose-moi des questions sur: ${branding.scope}`
  }
};
```

### LLM - Web Search (inchangé)

Le workflow utilise déjà le mécanisme `allowed_context`. Aucune modification nécessaire.

---

## Réponses type

### In Scope (succès)
```json
{
  "success": true,
  "response": "Une spatule est un ustensile de cuisine plat...",
  "intent": "question",
  "scope_status": "in_scope"
}
```

### Out of Scope (erreur de LLM - Web Search)
```json
{
  "success": false,
  "error": {
    "code": 403,
    "message": "Cette requête ne correspond pas au contexte autorisé",
    "status": "CONTEXT_VIOLATION",
    "details": {
      "query": "Quelle est la capitale de la France ?",
      "allowed_context": "cuisine, recettes, ingrédients...",
      "suggestion": "Je suis un assistant culinaire. Pose-moi des questions sur: cuisine, recettes..."
    }
  }
}
```

### Transformation en réponse utilisateur
```json
{
  "success": true,
  "response": "Je suis un assistant culinaire. Cette question est hors de mon domaine de compétence. Pose-moi des questions sur la cuisine, les recettes ou les ingrédients !",
  "intent": "out_of_scope",
  "scope_status": "out_of_scope"
}
```

---

## Coûts et performance

### Latence (avec mécanisme existant)

| Étape | Latence estimée |
|-------|-----------------|
| Get Branding (API) | ~50ms |
| LLM Context Check (intégré) | ~500-1000ms |
| LLM Web Search (si in_scope) | ~1000-3000ms |
| **Total in_scope** | ~1550-4050ms |
| **Total out_of_scope** | ~550-1050ms |

### Coût LLM (classification uniquement)

Le mécanisme existant utilise **Claude Haiku** pour la classification:
- Coût estimé: ~$0.0002/requête

---

## Plan de travail

### Équipe API

- [ ] Migration table `guild_branding` (ajout scope, scope_description, llm_provider)
- [ ] Modifier GET /api/branding/guild/{guild_id} pour retourner les nouveaux champs
- [ ] Modifier PUT /api/config/branding pour accepter les nouveaux champs
- [ ] Valeurs par défaut pour les projets existants

### Équipe n8n

- [ ] Modifier MENTION---Process-Question pour appeler LLM - Web Search
- [ ] Ajouter node "Build LLM Request" avec allowed_context
- [ ] Gérer le cas CONTEXT_VIOLATION (transformer en réponse user-friendly)
- [ ] Tests

### Équipe chatbot-core

- [ ] Passer les clés API LLM dans le payload mention (`llm_config`)
- [ ] Ajouter champs scope dans BrandingConfig (RFC-008)
- [ ] UI pour éditer scope dans /config branding (optionnel v2)

---

## Questions pour les équipes

### Pour API

1. ~~Les clés API LLM doivent-elles être stockées par projet ?~~
   → **Non, passées par le plugin** (décision)
2. Validation des nouveaux champs scope à l'enregistrement ?

### Pour chatbot-core

1. Le plugin peut-il passer ses clés API dans le payload mention ?
2. Format attendu pour `llm_config` ?
3. L'UI /config branding doit-elle permettre d'éditer le scope ?

### Pour n8n

1. ~~Quel provider LLM par défaut pour la classification ?~~
   → **Claude Haiku** (déjà implémenté dans LLM - Web Search)
2. Timeout pour l'appel LLM - Web Search ?

---

## Références

- [RFC-007: Mention Service](./RFC-007-MENTION-SERVICE.md)
- [RFC-008: Admin Config Screens](./RFC-008-ADMIN-CONFIG-SCREENS.md)
- [LLM - Web Search Workflow](../../workflows/LLM/LLM---Web-Search.json)

---

## Historique

| Date | Version | Auteur | Modification |
|------|---------|--------|--------------|
| 2026-01-16 | 1.0.0 | Équipe n8n | Création |
| 2026-01-16 | 1.1.0 | Équipe n8n | Mise à jour: intégration mécanisme allowed_context existant |
| 2026-01-16 | 1.2.0 | Équipe n8n | Retrait llm_provider (passé par plugin), champs scope optionnels |
