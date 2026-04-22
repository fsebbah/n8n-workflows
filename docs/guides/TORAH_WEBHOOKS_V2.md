# Torah Webhooks API v2 - Documentation Plugin

**Date:** 2026-04-22
**Version:** 2.0
**Breaking Change:** `segment_id` remplace `source_text_id` + `segment_index`

---

## Changements API v2

| Avant (v1) | Apres (v2) |
|------------|------------|
| `source_text_id` + `segment_index` | `segment_id` (UUID) |
| `/api/texts/projects` | `/api/projects` |
| Pas de disambiguation | `?corpus=` parameter |
| Erreur generique | `AmbiguousReferenceError` |

---

## 1. GET /webhook/torah-list

Liste les traites et textes disponibles.

### Request

```
GET /webhook/torah-list
```

Pas de parametres.

### Response

```json
{
  "success": true,
  "items": [
    {
      "id": "uuid-project-1",
      "name": "Berakhot",
      "corpus": "bavli",
      "seder": "zeraim",
      "type": "talmud"
    },
    {
      "id": "uuid-project-2",
      "name": "Berakhot",
      "corpus": "yerushalmi",
      "seder": "zeraim",
      "type": "talmud"
    }
  ],
  "total": 63
}
```

**Nouveaux champs v2:** `corpus`, `seder`

---

## 2. GET /webhook/torah-get-page-translations

Recupere une page avec segments et traductions.

### Request

```
GET /webhook/torah-get-page-translations?traite=Berakhot&page=2a&include_translations=true&target_language=fr&corpus=bavli
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `traite` | string | Oui | Nom du traite |
| `page` | string | Oui | Numero de page |
| `include_translations` | bool | Non | Inclure traductions (default: false) |
| `target_language` | string | Non | Langue cible (default: "fr") |
| `corpus` | string | **Nouveau v2** | Corpus pour disambiguation (bavli, yerushalmi, etc.) |

### Response (succes)

```json
{
  "success": true,
  "traite": "Berakhot",
  "page": "2a",
  "corpus": "bavli",
  "reference": "Berakhot 2a",
  "segments_count": 14,
  "translated_count": 10,
  "segments": [
    {
      "segment_id": "uuid-segment-1",
      "index": 0,
      "hebrew_text": "...",
      "translation": {
        "text": "A partir de quand...",
        "target_language": "fr",
        "provider": "anthropic",
        "model": "claude-3-5-sonnet",
        "status": "approved"
      },
      "has_translation": true
    },
    {
      "segment_id": "uuid-segment-2",
      "index": 1,
      "hebrew_text": "...",
      "translation": null,
      "has_translation": false
    }
  ]
}
```

**Nouveaux champs v2:** `segment_id` dans chaque segment, `corpus` au niveau page

### Response (AmbiguousReferenceError)

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Reference ambigue - veuillez specifier le corpus",
    "status": "AMBIGUOUS_REFERENCE",
    "error_type": "AmbiguousReferenceError",
    "options": ["bavli", "yerushalmi"]
  }
}
```

**Action plugin:** Afficher les options a l'utilisateur et renvoyer avec `?corpus=<choix>`

---

## 3. POST /webhook/torah-translate-page

Lance un job de traduction de page complete.

### Request

```json
POST /webhook/torah-translate-page
Content-Type: application/json

{
  "traite": "Berakhot",
  "page": "2a",
  "corpus": "bavli",
  "mode": "premium",
  "target_language": "fr",
  "api_key": "sk-ant-...",
  "openai_api_key": "sk-...",
  "force": false
}
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `traite` | string | Oui | Nom du traite |
| `page` | string | Oui | Numero de page |
| `corpus` | string | **Nouveau v2** | Corpus pour disambiguation |
| `mode` | string | Non | "standard" ou "premium" (default: "standard") |
| `target_language` | string | Non | Langue cible (default: "fr") |
| `api_key` | string | Oui | Cle API Anthropic |
| `openai_api_key` | string | Non | Cle API OpenAI (mode premium) |
| `force` | bool | Non | Forcer retraduction (default: false) |

### Response (succes)

```json
{
  "success": true,
  "job_id": "job_abc123",
  "status": "started",
  "segments_count": 14,
  "estimated_seconds": 100
}
```

### Response (AmbiguousReferenceError)

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Reference ambigue - veuillez specifier le corpus",
    "error_type": "AmbiguousReferenceError",
    "options": ["bavli", "yerushalmi"]
  }
}
```

---

## 4. GET /webhook/torah-job-status

Statut d'un job de traduction (polling).

### Request

```
GET /webhook/torah-job-status?job_id=job_abc123
```

### Response (en cours)

```json
{
  "job_id": "job_abc123",
  "status": "in_progress",
  "progress": {
    "current": 5,
    "total": 14
  }
}
```

### Response (termine)

```json
{
  "job_id": "job_abc123",
  "status": "completed",
  "segments": [
    {
      "segment_id": "uuid-segment-1",
      "index": 0,
      "translation": "A partir de quand..."
    }
  ],
  "tokens": {
    "claude": { "input": 1500, "output": 2000 },
    "gpt": { "input": 500, "output": 800 }
  }
}
```

**Nouveau v2:** `segment_id` dans chaque segment du resultat

---

## 5. POST /webhook/torah-router

Traduction unitaire d'un segment.

### Request

```json
POST /webhook/torah-router
Content-Type: application/json

{
  "segment_id": "uuid-segment-1",
  "text": "...",
  "job_type": "unit_translation",
  "job_id": "job_xxx",
  "api_key": "sk-ant-...",
  "target_language": "fr",
  "context": {
    "traite": "Berakhot",
    "page": "2a",
    "corpus": "bavli"
  }
}
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `segment_id` | string | **Nouveau v2** | UUID du segment |
| `text` | string | Oui | Texte a traduire |
| `job_type` | string | Oui | Type de job |
| `job_id` | string | Oui | ID du job parent |
| `api_key` | string | Oui | Cle API Anthropic |
| `target_language` | string | Non | Langue cible |
| `context` | object | Non | Contexte (traite, page, corpus) |

**Note v2:** `segment_id` remplace `source_text_id` + `segment_index`

### Response

```json
{
  "success": true,
  "job_id": "job_xxx",
  "segment_id": "uuid-segment-1",
  "translation": "A partir de quand lit-on le Shema..."
}
```

---

## 6. POST /webhook/torah-vocalization

Ajoute les voyelles (nekudot) a un texte hebreu.

### Request

```json
POST /webhook/torah-vocalization
Content-Type: application/json

{
  "text": "מאימתי קורין את שמע בערבין",
  "segment_id": "uuid-segment-1",
  "commentary_id": null,
  "openai_api_key": "sk-...",
  "context": {
    "traite": "Berakhot",
    "page": "2a",
    "corpus": "bavli"
  }
}
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `text` | string | Oui | Texte hebreu sans voyelles |
| `segment_id` | string | **Nouveau v2** | UUID du segment (si texte principal) |
| `commentary_id` | string | Non | UUID du commentaire (si commentaire) |
| `openai_api_key` | string | Oui | Cle API OpenAI |
| `context` | object | Non | Contexte additionnel |

**Note v2:** Utiliser `segment_id` OU `commentary_id` (mutuellement exclusifs)

### Response

```json
{
  "success": true,
  "vocalization": {
    "original": "מאימתי קורין את שמע בערבין",
    "vocalized": "מֵאֵימָתַי קוֹרִין אֶת שְׁמַע בְּעַרְבִין"
  },
  "segment_id": "uuid-segment-1",
  "cached": false
}
```

---

## 7. GET /webhook/torah-sources

Liste des sources Torah disponibles pour autocomplete.

### Request

```
GET /webhook/torah-sources
```

### Response

```json
{
  "success": true,
  "sources": [
    {
      "name": "Berakhot",
      "corpus": "bavli",
      "seder": "zeraim",
      "type": "talmud",
      "pages": ["2a", "2b", "3a", "..."]
    },
    {
      "name": "Berakhot",
      "corpus": "yerushalmi",
      "seder": "zeraim",
      "type": "talmud",
      "pages": ["1a", "1b", "..."]
    }
  ],
  "count": 120
}
```

**Nouveaux champs v2:** `corpus`, `seder`

---

## 8. GET /webhook/torah-corpus (NOUVEAU v2)

Liste des corpus du catalogue (9 corpus seedes).

### Request

```
GET /webhook/torah-corpus
```

Pas de parametres.

### Response

```json
{
  "success": true,
  "corpus": [
    {
      "id": "uuid",
      "name": "Bavli",
      "hebrew_name": "בבלי",
      "aliases": {
        "sefaria": ["Talmud/Bavli", "Babylonian Talmud"],
        "french": ["Talmud de Babylone", "Talmud Bavli"],
        "variants": ["Talmud Babli", "Gemara"]
      }
    },
    {
      "id": "uuid",
      "name": "Yerushalmi",
      "hebrew_name": "ירושלמי",
      "aliases": {
        "sefaria": ["Talmud/Yerushalmi", "Jerusalem Talmud"],
        "french": ["Talmud de Jerusalem"],
        "variants": []
      }
    }
  ],
  "count": 9
}
```

**Usage:** Alimenter un menu deroulant pour selection du corpus.

---

## 9. GET /webhook/torah-corpus-sedarim (NOUVEAU v2)

Liste des sedarim d'un corpus.

### Request

```
GET /webhook/torah-corpus-sedarim?corpus=Bavli
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `corpus` | string | Oui | Nom canonique ou alias du corpus |

### Response (succes)

```json
{
  "success": true,
  "corpus": "Bavli",
  "sedarim": [
    {
      "id": "uuid",
      "name": "Zeraim",
      "hebrew_name": "זרעים",
      "aliases": {}
    },
    {
      "id": "uuid",
      "name": "Moed",
      "hebrew_name": "מועד",
      "aliases": {}
    }
  ],
  "count": 6
}
```

### Response (erreur 404)

```json
{
  "success": false,
  "error": {
    "code": 404,
    "message": "Corpus not found: 'XYZ'",
    "status": "NOT_FOUND"
  }
}
```

---

## 10. GET /webhook/torah-corpus-traites (NOUVEAU v2)

Liste des traites et pages d'un seder.

### Request

```
GET /webhook/torah-corpus-traites?corpus=Bavli&seder=Zeraim
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `corpus` | string | Oui | Nom canonique ou alias du corpus |
| `seder` | string | Oui | Nom canonique ou alias du seder |

### Response (succes)

```json
{
  "success": true,
  "corpus": "Bavli",
  "seder": "Zeraim",
  "traites": [
    {
      "id": "uuid-project",
      "name": "Berakhot",
      "pages": ["2a", "2b", "3a", "3b", "..."],
      "pages_count": 127
    }
  ],
  "count": 1
}
```

### Response (erreur 404)

```json
{
  "success": false,
  "error": {
    "code": 404,
    "message": "Seder not found: 'XYZ' in corpus 'Bavli'",
    "status": "NOT_FOUND"
  }
}
```

**Usage:** Construire un picker hierarchique `Corpus → Seder → Traite → Page`

---

## Gestion des erreurs

### AmbiguousReferenceError (HTTP 400)

Retourne quand une reference est ambigue (ex: "Berakhot" existe dans bavli ET yerushalmi).

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Reference ambigue - veuillez specifier le corpus",
    "status": "AMBIGUOUS_REFERENCE",
    "error_type": "AmbiguousReferenceError",
    "options": ["bavli", "yerushalmi", "tosefta"]
  }
}
```

**Action plugin:**
1. Detecter `error_type === "AmbiguousReferenceError"`
2. Afficher les options a l'utilisateur
3. Renvoyer la requete avec `?corpus=<choix>` ou `"corpus": "<choix>"`

### Autres erreurs

| Code | Status | Description |
|------|--------|-------------|
| 400 | BAD_REQUEST | Parametres manquants ou invalides |
| 404 | NOT_FOUND | Traite ou page non trouve |
| 500 | INTERNAL_ERROR | Erreur serveur |

---

## Migration v1 → v2

### Avant (v1)

```json
{
  "source_text_id": "uuid-source",
  "segment_index": 0,
  "translated_text": "..."
}
```

### Apres (v2)

```json
{
  "segment_id": "uuid-segment",
  "translated_text": "..."
}
```

### Retrocompatibilite

Les workflows acceptent temporairement les deux formats:
- Si `segment_id` present → utilise v2
- Sinon fallback sur `source_text_id` + `segment_index`

**Recommandation:** Migrer vers `segment_id` des que possible.

---

## 11. POST /webhook/torah-list-sections

Liste les sections d'une source complexe (Sha'ar HaHakdamot, etc.).

### Request

```json
POST /webhook/torah-list-sections
Content-Type: application/json

{
  "source": "Sha'ar HaHakdamot",
  "corpus": "Kabbalah"
}
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `source` | string | Oui | Nom de la source |
| `corpus` | string | Non | Corpus pour disambiguation |

### Response

```json
{
  "success": true,
  "source": "Sha'ar HaHakdamot",
  "corpus": "Kabbalah",
  "seder": null,
  "sections": [
    {"name": "Introduction", "count": 5},
    {"name": "Chapter 1", "count": 12}
  ]
}
```

---

## 12. POST /webhook/torah-get-section

Recupere le contenu d'une section specifique.

### Request

```json
POST /webhook/torah-get-section
Content-Type: application/json

{
  "source": "Sha'ar HaHakdamot",
  "section": "Introduction",
  "number": 3,
  "corpus": "Kabbalah"
}
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `source` | string | Oui | Nom de la source |
| `section` | string | Oui | Nom de la section |
| `number` | int | Non | Numero dans la section |
| `corpus` | string | Non | Corpus pour disambiguation |

### Response

```json
{
  "success": true,
  "source": "Sha'ar HaHakdamot",
  "corpus": "Kabbalah",
  "section": {
    "title": "Introduction 3",
    "content": "..."
  }
}
```

---

## 13. POST /webhook/torah-validate-text

Valide et normalise les noms de textes (autocomplete/fuzzy search).

### Request

```json
POST /webhook/torah-validate-text
Content-Type: application/json

{
  "query": "soukkah",
  "category": "bavli"
}
```

| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| `query` | string | Oui | Terme de recherche |
| `category` | string | Non | Filtre categorie |

### Response

```json
{
  "success": true,
  "found": true,
  "query": "soukkah",
  "canonical": "Sukkah",
  "heTitle": "סוכה",
  "corpus": "Bavli",
  "confidence": 0.91
}
```

---

## Endpoints API-only (pas de webhook)

Ces endpoints sont appeles directement par l'API backend, pas via webhook n8n:

| Endpoint API | Description | Usage |
|--------------|-------------|-------|
| `GET /api/talmud/text/{traite}/{page}` | Texte brut segmente | Appel interne workflow |
| `POST /api/commentaries/nekudot` | Batch check nekudot | Appel direct API |
| `POST /api/translations/save` | Sauvegarde traduction | Appel interne workflow |

---

## Endpoints n8n actifs

| Webhook | Workflow ID | Endpoint API | Status |
|---------|-------------|--------------|--------|
| torah-list | KMdbJCxi4iONooEm | `GET /api/talmud/traites` | Active |
| torah-get-page-translations | kzNgywLbS3VqwHpq | `GET /api/talmud/page/.../segments` | Active |
| torah-translate-page | NfTKTDMDSb543Qik | Orchestrateur (jobs + LLM) | Active |
| torah-job-status | 0wrnsac6uL4uWZwD | `GET /api/v2/jobs/{id}` | Active |
| torah-router | qPhg64qfExkYEMsI | Orchestrateur interne | Active |
| torah-vocalization | 8SzNofDdhn4J16Zq | `GET/POST /api/vocalization/*` | Active |
| torah-sources | (a verifier) | `GET /api/torah/sources` | Active |
| torah-corpus | AfTOoUOzRD2fF5cG | `GET /api/corpus` | Active |
| torah-corpus-sedarim | p3I65tQo5eoYndum | `GET /api/corpus/{c}/sedarim` | Active |
| torah-corpus-traites | ILoUSDjcNOZBxmYs | `GET /api/corpus/{c}/sedarim/{s}` | Active |
| torah-list-sections | (a creer) | `GET /api/torah/sections/{source}` | **TODO** |
| torah-get-section | (a creer) | `GET /api/torah/sections/{s}/{s}` | **TODO** |
| torah-validate-text | (a creer) | `GET /api/sefaria/texts/search` | **TODO** |

---

## Recap

| Categorie | Nombre | Status |
|-----------|--------|--------|
| Webhooks actifs | 10 | OK |
| Webhooks a creer | 3 | TODO |
| API-only (pas de webhook) | 3 | Appel direct |

**Total: 13 webhooks (10 actifs + 3 TODO) + 3 endpoints API-only**

---

## Contact

Questions sur cette API: equipe n8n
