# Torah Workflows - Documentation API

## Vue d'ensemble

Cette documentation decrit tous les workflows n8n pour le projet Torah.

Base URL: `http://pi6.local:5678/webhook/`

---

## Workflows principaux

### 1. torah-get-page-translations

**Endpoint:** `GET /webhook/torah-get-page-translations`

**Description:** Recupere le contenu traduit d'une page du Talmud avec tous les segments et commentaires.

**Parametres (Query):**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| traite | string | oui | Nom du traite (ex: "Berakhot") |
| page | string | oui | Numero de page (ex: "2a") |
| lang | string | non | Langue cible (defaut: "fr") |
| include_translations | boolean | non | Inclure les traductions |

**Reponse:**
```json
{
  "success": true,
  "traite": "Berakhot",
  "page": "2a",
  "reference": "Berakhot 2a",
  "source_text_id": "uuid",
  "segments_count": 14,
  "translated_count": 14,
  "commentaries_total": 112,
  "segments": [
    {
      "index": 0,
      "hebrew_text": "מֵאֵימָתַי קוֹרִין...",
      "translation": {
        "text": "A partir de quand lit-on...",
        "provider": "claude+openai",
        "model": "claude-sonnet-4+gpt-4o",
        "job_id": "job_xxx"
      },
      "has_translation": true,
      "commentaries": [
        {
          "id": "uuid",
          "commentator": "Rashi",
          "segment": 1,
          "text": "...",
          "reference": "Rashi on Berakhot 2a:1",
          "has_translation": false
        }
      ]
    }
  ]
}
```

---

### 2. torah-job-status

**Endpoint:** `GET /webhook/torah-job-status`

**Description:** Verifie le statut d'un job de traduction asynchrone.

**Parametres (Query):**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| job_id | string | oui | Identifiant du job |

**Reponse (En cours):**
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

**Reponse (Termine):**
```json
{
  "job_id": "job_abc123",
  "status": "completed",
  "traite": "Berakhot",
  "page": "2a",
  "progress": {
    "current": 14,
    "total": 14,
    "percentage": 100
  },
  "duration_seconds": 120,
  "translation": {
    "original": "...",
    "final": "...",
    "intermediate_en": "...",
    "source_language": "he",
    "target_language": "fr",
    "pivot_used": false,
    "claude_translation": "...",
    "gpt_suggestion": "..."
  },
  "verification": {
    "approved": true,
    "confidence": 0.95,
    "requires_vote": false
  },
  "tokens": {
    "claude": { "input_tokens": 100, "output_tokens": 50 },
    "gpt": { "input_tokens": 80, "output_tokens": 40 },
    "total": { "total_tokens": 270 }
  }
}
```

---

### 3. torah-list

**Endpoint:** `GET /webhook/torah-list`

**Description:** Liste tous les textes Torah disponibles.

**Parametres:** Aucun

**Reponse:**
```json
{
  "success": true,
  "items": [
    {
      "type": "talmud",
      "items": ["Berakhot", "Pesachim", "Sukkah"],
      "total": 10
    },
    {
      "type": "text",
      "items": ["Genesis", "Exodus"],
      "total": 2
    }
  ],
  "total": 12
}
```

---

### 4. torah-translation-status

**Endpoint:** `GET /webhook/torah-translation-status`

**Description:** Statistiques de progression des traductions.

**Parametres (Query):**
| Param | Type | Requis | Description |
|-------|------|--------|-------------|
| traite | string | non | Filtre par traite |
| target_language | string | non | Langue (defaut: "fr") |
| discord_webhook | string | non | URL webhook Discord |

**Reponse (Global):**
```json
{
  "success": true,
  "statistics": {
    "total_traites": 10,
    "total_pages": 150,
    "translated": 45,
    "pending": 105,
    "percentage": 30
  },
  "traites": [
    { "name": "Berakhot", "pages": 15 }
  ],
  "traites_not_started": ["Sukkah", "Shabbat"]
}
```

---

### 5. torah-translate-page

**Endpoint:** `POST /webhook/torah-translate-page`

**Description:** Demarre une traduction de page asynchrone.

**Body:**
```json
{
  "traite": "Berakhot",
  "page": "2a",
  "mode": "premium",
  "target_language": "fr",
  "api_key": "sk-...",
  "openai_api_key": "sk-..."
}
```

**Reponse:**
```json
{
  "success": true,
  "job_id": "job_abc123",
  "status": "started",
  "traite": "Berakhot",
  "page": "2a",
  "segments_count": 14,
  "estimated_seconds": 98
}
```

---

### 6. torah-discord-translate (v2)

**Endpoint:** `POST /webhook/torah-discord-translate`

**Description:** Traduction unifiee avec cache pour Discord.

**Body:**
```json
{
  "text": "הטקסט העברי",
  "job_type": "unit_translation",
  "api_key": "sk-...",
  "openai_api_key": "sk-...",
  "target_language": "fr",
  "context": {
    "traite": "Sukkah",
    "page": "28b",
    "commentator": "Rashi"
  }
}
```

**Reponse (Cache hit):**
```json
{
  "success": true,
  "cached": true,
  "translation": {
    "original": "הטקסט העברי",
    "final": "Le texte hebreu",
    "source_language": "he",
    "target_language": "fr"
  }
}
```

**Reponse (Nouveau job):**
```json
{
  "success": true,
  "cached": false,
  "job_id": "job_xyz789"
}
```

---

### 7. torah-vocalization

**Endpoint:** `POST /webhook/torah-vocalization`

**Description:** Ajoute les voyelles hebraiques (nekudot) au texte.

**Body:**
```json
{
  "text": "הטקסט ללא ניקוד",
  "openai_api_key": "sk-...",
  "context": {
    "traite": "Sukkah",
    "page": "2a",
    "commentator": "Rashi"
  }
}
```

**Reponse:**
```json
{
  "success": true,
  "cached": false,
  "vocalization": {
    "original": "הטקסט ללא ניקוד",
    "vocalized": "הַטֶּקְסְט לְלוֹ נִיקּוּד"
  },
  "metadata": {
    "vocalized_by": "llm:gpt-4o",
    "processing_time_ms": 5200
  }
}
```

---

### 8. torah-validate-text

**Endpoint:** `POST /webhook/torah-validate-text`

**Description:** Valide et normalise les noms de textes.

**Body:**
```json
{
  "query": "soukkah",
  "category": "bavli"
}
```

**Reponse (Trouve):**
```json
{
  "found": true,
  "query": "soukkah",
  "canonical": "Sukkah",
  "heTitle": "סוכה",
  "category": "bavli",
  "sefaria_ref": "Sukkah",
  "match_type": "exact"
}
```

**Reponse (Non trouve):**
```json
{
  "found": false,
  "query": "soukkah",
  "suggestions": ["Sukkah", "Sukkot"],
  "message": "Aucun texte correspondant trouve"
}
```

---

### 9. torah-batch-translation

**Endpoint:** `POST /webhook/torah-batch-translate`

**Description:** Traduction en lot de plusieurs textes.

**Body:**
```json
{
  "book": "Sukkah",
  "chapter_start": "2a",
  "chapter_end": "10b",
  "config": {
    "target_language": "fr",
    "include_commentaries": true,
    "max_commentaries_per_text": 10
  }
}
```

**Reponse:**
```json
{
  "success": true,
  "stats": {
    "batch_id": "batch_xxx",
    "total_texts": 45,
    "successful": 43,
    "failed": 2,
    "success_rate": 95,
    "total_comments_translated": 342
  }
}
```

---

### 10. torah-registry

**Endpoint:** `GET /webhook/torah-registry`

**Description:** Registre dynamique de tous les workflows Torah actifs.

**Reponse:**
```json
{
  "version": "1.0",
  "updated_at": "2026-01-05T00:00:00Z",
  "n8n": {
    "host": "pi6.local",
    "port": 5678,
    "webhook_base": "http://pi6.local:5678/webhook"
  },
  "total_tools": 6,
  "tools": {
    "torah-discord-message": {
      "name": "Torah Discord Translation",
      "endpoint": "/webhook/torah-discord-translate",
      "method": "POST",
      "active": true
    }
  }
}
```

---

## Workflows de subscription

### torah-sub-success
**Endpoint:** `POST /webhook/torah-sub-success`
Gere les nouvelles souscriptions reussies.

### torah-sub-renewal
**Endpoint:** `POST /webhook/torah-sub-renewal`
Gere les renouvellements de souscription.

### torah-sub-cancel
**Endpoint:** `POST /webhook/torah-sub-cancel`
Gere les annulations de souscription.

### torah-sub-failure
**Endpoint:** `POST /webhook/torah-sub-failure`
Gere les echecs de paiement.

---

## Workflows internes (workers)

Ces workflows sont appeles en interne par d'autres workflows:

| Workflow | Endpoint | Description |
|----------|----------|-------------|
| torah-translate-worker | `/torah-translate-worker` | Worker de traduction individuelle |
| torah-translate-page-worker | `/torah-translate-page-worker` | Worker de traduction de page |
| torah-result-store | `/torah-result-store` | Stockage des resultats |

---

## Tableau recapitulatif

| Workflow | Method | Path | Deploye |
|----------|--------|------|---------|
| torah-get-page-translations | GET | `/torah-get-page-translations` | Oui |
| torah-job-status | GET | `/torah-job-status` | Oui |
| torah-list | GET | `/torah-list` | A verifier |
| torah-translation-status | GET | `/torah-translation-status` | A verifier |
| torah-translate-page | POST | `/torah-translate-page` | A verifier |
| torah-discord-translate | POST | `/torah-discord-translate` | A verifier |
| torah-vocalization | POST | `/torah-vocalization` | A verifier |
| torah-validate-text | POST | `/torah-validate-text` | A verifier |
| torah-batch-translation | POST | `/torah-batch-translate` | A verifier |
| torah-registry | GET | `/torah-registry` | Non |

---

*Document genere le 2026-01-06*
