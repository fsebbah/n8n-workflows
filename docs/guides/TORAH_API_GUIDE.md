# Guide des Endpoints Torah - n8n Workflows

Ce document liste les endpoints n8n utilises par les plugins Torah.

**Base URL n8n:** `http://pi6.local:5678/webhook/`
**Base URL API:** `$env.API_URL` (backend Torah)

**Dernière mise à jour:** 2026-04-23 (alignement plugin-torah)

---

## Webhooks ACTIFS (9 total)

| Webhook | Méthode | Description | Statut |
|---------|---------|-------------|--------|
| `torah-get-page-translations` | GET | Page avec segments et traductions | v2 |
| `torah-translate-page` | POST | Lancer traduction de page | v2 |
| `torah-job-status` | GET | Statut job (polling) | v2 |
| `torah-router` | POST | Orchestrateur traductions | v2 |
| `torah-vocalization` | POST | Ajout des nekudot | v2 |
| `torah-discord-message` | POST | Messages Discord | v2 |
| `torah-corpus` | GET | Liste des corpus | **NOUVEAU v2** |
| `torah-corpus-sedarim` | GET | Sedarim d'un corpus | **NOUVEAU v2** |
| `torah-corpus-traites` | GET | Traités d'un seder | **NOUVEAU v2** |

---

## Webhooks OBSOLÈTES (6 total - ne PAS créer)

| Webhook obsolète | Remplacé par | Statut |
|------------------|--------------|--------|
| `torah-sources` | `torah-corpus` + `torah-corpus-sedarim` + `torah-corpus-traites` | Supprimé (aucun appel dans src/) |
| `torah-list` | `torah-corpus-traites` | Supprimé PR #137 |
| `torah-list-sections` | `torah-corpus-traites` | Obsolète |
| `torah-get-section` | `torah-get-page-translations` + param `?corpus=` | Obsolète |
| `torah-validate-text` | Filtrage côté client (SourcesRegistry) | Obsolète |
| `torah-traite-pages` | Inclus dans `torah-corpus-traites` (champ `pages`) | Obsolète |

**Workflows à supprimer :**
- `workflows/TORAH_-_Sources.json`
- `workflows/Torah_List.json`

---

## Détail des webhooks actifs

---

### GET /webhook/torah-get-page-translations

Récupère une page avec segments et traductions.

**Input (Query):**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `traite` | string | Oui | Nom du traité (ex: "Berakhot") |
| `page` | string | Oui | Numéro de page (ex: "2a") |
| `target_language` | string | Non | Langue cible (défaut: "fr") |
| `corpus` | string | Conditionnel | Requis si traité ambigu (ex: "Bavli") |

**Endpoint Backend:**
```
GET /api/talmud/page/{traite}/{page}/segments?target_language={lang}&corpus={corpus}
```

**Response:**
```json
{
  "success": true,
  "traite": "Berakhot",
  "page": "2a",
  "corpus": "Bavli",
  "segments": [
    {
      "segment_id": "uuid",
      "hebrew_text": "...",
      "translation": { "text": "...", "version": 3 },
      "translations": [...],
      "commentaries": [...]
    }
  ]
}
```

**Erreur 400 - Référence ambiguë:**
```json
{
  "detail": {
    "error": "ambiguous_reference",
    "message": "Reference 'Berakhot 2a' matches multiple corpus",
    "matches": [
      {"corpus": "Bavli", "project_id": "..."},
      {"corpus": "Yerushalmi", "project_id": "..."}
    ],
    "hint": "Add ?corpus=<Bavli|Yerushalmi> to disambiguate"
  }
}
```

---

### POST /webhook/torah-translate-page

Lance un job de traduction de page complète.

**Input (Body):**
```json
{
  "traite": "Berakhot",
  "page": "2a",
  "corpus": "Bavli",
  "mode": "premium",
  "target_language": "fr",
  "api_key": "sk-ant-...",
  "force": false
}
```

**Endpoint Backend:**
```
GET  /api/talmud/page/{traite}/{page}/segments?corpus={corpus}
POST /api/v2/jobs
```

**Response:**
```json
{
  "success": true,
  "job_id": "uuid",
  "status": "started",
  "segments_count": 14
}
```

---

### GET /webhook/torah-job-status

Statut d'un job de traduction (polling).

**Input (Query):**
| Param | Type | Description |
|-------|------|-------------|
| `job_id` | string | ID du job |

**Endpoint Backend:**
```
GET /api/v2/jobs/{jobId}
```

**Response (en cours):**
```json
{
  "job_id": "uuid",
  "status": "in_progress",
  "progress": { "current": 5, "total": 14, "percentage": 35 }
}
```

**Response (terminé):**
```json
{
  "status": "completed",
  "progress": { "current": 14, "total": 14, "percentage": 100 }
}
```

---

### POST /webhook/torah-router

Orchestrateur principal des traductions.

**Input (Body):**
```json
{
  "text": "...",
  "segments": [
    { "segment_id": "uuid", "text": "..." }
  ],
  "job_id": "uuid",
  "target_language": "fr",
  "api_key": "sk-ant-...",
  "context": { "traite": "...", "page": "...", "corpus": "..." }
}
```

**Webhooks internes appelés:**
```
POST /webhook/torah-translate
POST /webhook/torah-save
POST /webhook/torah-error
```

**Response:**
```json
{
  "received": true,
  "job_id": "uuid",
  "pipeline": "batch",
  "segments_count": 14
}
```

---

### POST /webhook/torah-vocalization

Ajoute les voyelles (nekudot) à un texte hébreu.

**Input (Body):**
```json
{
  "text": "Texte hébreu sans voyelles",
  "openai_api_key": "sk-...",
  "commentary_id": "uuid",
  "context": { "traite": "...", "page": "...", "commentator": "..." }
}
```

**Endpoints Backend:**
```
GET  /api/vocalization/search
POST /api/vocalization/save
POST /api/commentaries/nekudot
```

**Response:**
```json
{
  "success": true,
  "vocalization": {
    "original": "...",
    "vocalized": "..."
  }
}
```

---

### POST /webhook/torah-discord-message

Envoie des messages au bot Discord Torah.

**Input (Body):**
```json
{
  "channel_id": "...",
  "message": "...",
  "embed": { ... }
}
```

---

### GET /webhook/torah-corpus

Liste des corpus disponibles.

**Endpoint Backend:**
```
GET /api/corpus
```

**Response:**
```json
{
  "success": true,
  "corpus": [
    { "id": "uuid", "name": "Bavli", "hebrew_name": "בבלי" },
    { "id": "uuid", "name": "Yerushalmi", "hebrew_name": "ירושלמי" }
  ],
  "count": 4
}
```

---

### GET /webhook/torah-corpus-sedarim

Sedarim d'un corpus.

**Input (Query):**
| Param | Type | Description |
|-------|------|-------------|
| `corpus` | string | Nom du corpus (ex: "Bavli") |

**Endpoint Backend:**
```
GET /api/corpus/{corpus}/sedarim
```

**Response:**
```json
{
  "success": true,
  "corpus": "Bavli",
  "sedarim": [
    { "id": "uuid", "name": "Zeraim", "hebrew_name": "זרעים" }
  ],
  "count": 6
}
```

---

### GET /webhook/torah-corpus-traites

Traités d'un seder avec leurs pages.

**Input (Query):**
| Param | Type | Description |
|-------|------|-------------|
| `corpus` | string | Nom du corpus (ex: "Bavli") |
| `seder` | string | Nom du seder (ex: "Zeraim") |

**Endpoint Backend:**
```
GET /api/corpus/{corpus}/sedarim/{seder}
```

**Response:**
```json
{
  "success": true,
  "corpus": "Bavli",
  "seder": "Zeraim",
  "traites": [
    {
      "id": "uuid",
      "name": "Berakhot",
      "pages": ["2a", "2b", "3a", ...],
      "pages_count": 127
    }
  ],
  "count": 11
}
```

---

## Webhooks INTERNES (appelés par torah-router)

Ces webhooks ne sont pas appelés directement par les plugins mais sont utilisés en interne. **Ils doivent rester actifs.**

| Webhook | Workflow ID | Rôle |
|---------|-------------|------|
| `torah-translate` | 1DCxCFLegp97V6l3 | Appel LLM traduction |
| `torah-save` | yH6mS2rVeMwJm6Nj | Sauvegarde PostgreSQL |
| `torah-error` | LsHigLBCd6GvqRHg | Gestion erreurs (Redis) |
| `torah-chunk` | 2FxQ4IsPqcjCG5LX | Découpage texte long |

---

## Endpoints Backend utilisés

| Endpoint Backend | Méthode | Webhook(s) |
|------------------|---------|------------|
| `/api/corpus` | GET | torah-corpus |
| `/api/corpus/{corpus}/sedarim` | GET | torah-corpus-sedarim |
| `/api/corpus/{corpus}/sedarim/{seder}` | GET | torah-corpus-traites |
| `/api/talmud/page/{traite}/{page}/segments` | GET | torah-get-page-translations, torah-translate-page |
| `/api/v2/jobs` | POST | torah-translate-page, torah-router |
| `/api/v2/jobs/{id}` | GET | torah-job-status |
| `/api/v2/jobs/{id}` | PATCH | torah-router |
| `/api/translations/save` | POST | torah-save (interne) |
| `/api/vocalization/search` | GET | torah-vocalization |
| `/api/vocalization/save` | POST | torah-vocalization |
| `/api/commentaries/nekudot` | POST | torah-vocalization |

---

## Endpoints Backend SUPPRIMABLES

Ces endpoints n'ont plus de webhook associé :

| Endpoint | Webhook obsolète | Raison |
|----------|------------------|--------|
| `GET /api/torah/sources` | `torah-sources` | Remplacé par corpus hierarchy |
| `GET /api/talmud/traites` | `torah-list` | Remplacé par `torah-corpus-traites` |
| `GET /api/torah/sections/{source}` | `torah-list-sections` | Remplacé par corpus hierarchy |
| `GET /api/torah/sections/{source}/{section}` | `torah-get-section` | Remplacé par segments |
| `GET /api/sefaria/texts/search` | `torah-validate-text` | Filtrage côté client |

---

*Mis à jour le 2026-04-23 — alignement équipe plugin-torah*
