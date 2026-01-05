# Migration API - Plugin Torah vers Workflows n8n

## Contexte

Le plugin Torah actuel fait des appels HTTP directs vers `localhost:3031` avec des endpoints incorrects ou obsolètes. Ce document décrit les modifications à apporter au plugin pour utiliser les workflows n8n existants.

---

## Tableau de migration

| Fonction Plugin | Appel Actuel (erroné) | Nouvel Appel (workflow n8n) |
|-----------------|----------------------|----------------------------|
| `fetch_page_segments()` | `GET localhost:3031/api/talmud/segments/{traite}/{page}` | `GET pi6.local:5678/webhook/torah-get-page-translations?traite={traite}&page={page}` |
| `fetch_talmud_text()` | `GET localhost:3031/api/talmud/text/{traite}/{page}` | `POST pi6.local:5678/webhook/torah-translate-page` |
| `get_traites()` | `GET localhost:3031/api/talmud/traites` | `GET pi6.local:5678/webhook/torah-list` |
| `get_pages()` | `GET localhost:3031/api/talmud/pages/{traite}` | **Non disponible via n8n** |
| `health_check()` | `GET localhost:3031/health` | **Non disponible via n8n** |

---

## Détail des modifications

### 1. `fetch_page_segments(traite, page)`

**Avant (erreur 404):**
```
GET http://localhost:3031/api/talmud/segments/Sukkah/48a
```

**Après (via workflow n8n):**
```
GET http://pi6.local:5678/webhook/torah-get-page-translations?traite=Sukkah&page=48a
```

**Paramètres optionnels:**
- `include_translations=true` : Inclure les traductions existantes
- `target_language=fr` : Langue cible (défaut: fr)

**Réponse:**
```json
{
  "success": true,
  "traite": "Sukkah",
  "page": "48a",
  "reference": "Sukkah 48a",
  "segments_count": 14,
  "segments": [
    {
      "index": 0,
      "hebrew_text": "...",
      "translation": { "text": "...", "provider": "claude+openai" },
      "has_translation": true
    }
  ]
}
```

---

### 2. `fetch_talmud_text(traite, page)`

**Avant:**
```
GET http://localhost:3031/api/talmud/text/Sukkah/48a
```

**Après (via workflow n8n):**
```
POST http://pi6.local:5678/webhook/torah-translate-page
Content-Type: application/json

{
  "traite": "Sukkah",
  "page": "48a",
  "mode": "premium",
  "target_language": "fr",
  "api_key": "<ANTHROPIC_API_KEY>",
  "openai_api_key": "<OPENAI_API_KEY>"
}
```

**Réponse:**
```json
{
  "success": true,
  "job_id": "job_abc123",
  "status": "started",
  "traite": "Sukkah",
  "page": "48a",
  "segments_count": 14,
  "estimated_seconds": 100
}
```

> **Note:** Ce workflow lance une traduction asynchrone. Utilisez `job_id` pour suivre le statut.

---

### 3. `get_traites()`

**Avant:**
```
GET http://localhost:3031/api/talmud/traites
```

**Après (via workflow n8n):**
```
GET http://pi6.local:5678/webhook/torah-list
```

**Réponse:**
```json
{
  "success": true,
  "items": [
    {
      "type": "talmud",
      "items": ["Berakhot", "Shabbat", "Eruvin", "Pesachim", "Sukkah", ...],
      "total": 10
    },
    {
      "type": "text",
      "items": ["Project1", "Project2"],
      "total": 2
    }
  ],
  "total": 12
}
```

---

### 4. `get_pages(traite)` - NON DISPONIBLE

**Statut:** Pas de workflow n8n existant.

**Options:**
1. Conserver l'appel direct vers l'API (si l'endpoint existe)
2. Demander la création d'un nouveau workflow n8n

---

### 5. `health_check()` - NON DISPONIBLE

**Statut:** Pas de workflow n8n existant.

**Options:**
1. Conserver l'appel direct: `GET http://pi6.local:3031/health`
2. Utiliser le registry n8n: `GET http://pi6.local:5678/webhook/torah-registry`

---

## Résumé des URLs

| Base URL | Usage |
|----------|-------|
| `http://pi6.local:5678/webhook/` | Workflows n8n (recommandé) |
| `http://pi6.local:3031/api/` | API directe (fallback) |

---

## Workflows n8n disponibles

| Webhook | Méthode | Description |
|---------|---------|-------------|
| `/webhook/torah-list` | GET | Liste des traités et projets |
| `/webhook/torah-get-page-translations` | GET | Segments d'une page avec traductions |
| `/webhook/torah-translate-page` | POST | Lancer une traduction de page |
| `/webhook/torah-job-status` | GET | Statut d'un job de traduction |
| `/webhook/torah-registry` | GET | Registry de tous les workflows Torah |

---

## Contact

Pour toute question sur les workflows n8n, consulter le repository `n8n-workflows/workflows/Torah/`.
