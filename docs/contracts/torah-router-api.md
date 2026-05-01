# Torah Router API Contract

**Version:** 2.0
**Date:** 2026-04-28
**Status:** Active

## Endpoint

```
POST /webhook/torah-router
Content-Type: application/json
```

## Request Schema

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `"segment"` \| `"commentary"` | **REQUIRED.** Type de contenu à traduire. Détermine la table cible. |
| `text` | `string` | Texte hébreu source à traduire |
| `target_language` | `string` | Code langue cible (`fr`, `en`, `es`, etc.) |
| `api_key` | `string` | Clé API Anthropic (dans le body, pas en header) |

### Conditional Fields (selon `kind`)

#### Si `kind: "segment"`

| Field | Type | Description |
|-------|------|-------------|
| `segment_id` | `UUID` | **REQUIRED.** ID du segment dans `source_text_segments` |

#### Si `kind: "commentary"`

| Field | Type | Description |
|-------|------|-------------|
| `commentary_detail_id` | `UUID` | **REQUIRED.** ID du commentaire dans `commentary_details` |

### Optional Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `job_id` | `string` | Auto-generated | ID du job pour tracking |
| `source_language` | `string` | `"he"` | Code langue source |
| `reference_translation` | `string` | `null` | Traduction EN existante (pour EN-pivot) |
| `context.traite` | `string` | `null` | Nom du traité |
| `context.page` | `string` | `null` | Référence de page (ex: `"2a"`) |
| `context.commentator` | `string` | `null` | Nom du commentateur |

## Validation Rules

### Strict Mode (v2.0+)

1. **`kind` est obligatoire** - Rejet 400 si absent
2. **`kind` doit être valide** - Seuls `"segment"` et `"commentary"` sont acceptés
3. **ID conditionnel requis** - Si `kind: "segment"`, `segment_id` doit être un UUID valide
4. **Pas de fallback silencieux** - Tout payload ambigu retourne HTTP 400

### UUID Validation

Les champs `segment_id` et `commentary_detail_id` doivent être des UUID v4 valides:
```
^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
```

## Responses

### Success (202 Accepted)

```json
{
  "success": true,
  "job_id": "job_abc123xyz",
  "kind": "segment",
  "pipeline": "translate_single",
  "segments_count": 1
}
```

### Validation Error (400 Bad Request)

```json
{
  "success": false,
  "error": {
    "code": "MISSING_KIND",
    "message": "Field 'kind' is required. Must be 'segment' or 'commentary'."
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "INVALID_KIND",
    "message": "Invalid kind 'foo'. Must be 'segment' or 'commentary'."
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "MISSING_SEGMENT_ID",
    "message": "Field 'segment_id' is required when kind='segment'."
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "INVALID_UUID",
    "message": "Field 'segment_id' must be a valid UUID."
  }
}
```

## Routing Logic

```
                    ┌─────────────────┐
                    │  Torah Router   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Validate kind  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
         kind=segment   kind=commentary   invalid/missing
              │              │              │
              ▼              ▼              ▼
      translations_v2  commentary_     HTTP 400
                       translations    (NO fallback)
```

## Migration from v1

### Breaking Changes

| v1 Behavior | v2 Behavior |
|-------------|-------------|
| `kind` optional, fallback to `pending_translations` | `kind` required, no fallback |
| Silent routing based on presence of IDs | Explicit validation with clear errors |
| `source_text` as identifier mode | `source_text` removed as routing field |

### Migration Checklist

- [ ] Add `kind` field to all payloads
- [ ] Ensure `segment_id` or `commentary_detail_id` is present
- [ ] Remove reliance on `pending_translations` fallback
- [ ] Update error handling for new 400 responses

## Examples

### Translate a Segment

```bash
curl -X POST http://pi6.local:5678/webhook/torah-router \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "segment",
    "segment_id": "47347193-b942-4c0d-9cf7-07f9e18fa39b",
    "text": "מֵיתִיבִי מָר זוּטְרָא:",
    "target_language": "fr",
    "api_key": "sk-ant-api03-...",
    "context": {
      "traite": "Pesachim",
      "page": "5b"
    }
  }'
```

### Translate a Commentary

```bash
curl -X POST http://pi6.local:5678/webhook/torah-router \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "commentary",
    "commentary_detail_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "text": "רש״י: פירוש הדבר...",
    "target_language": "fr",
    "api_key": "sk-ant-api03-...",
    "context": {
      "traite": "Pesachim",
      "page": "5b",
      "commentator": "Rashi"
    }
  }'
```

### Batch Commentaries

```bash
curl -X POST http://pi6.local:5678/webhook/torah-router \
  -H "Content-Type: application/json" \
  -d '{
    "kind": "commentary",
    "segments": [
      {
        "commentary_detail_id": "uuid-1",
        "text": "רש״י: ...",
        "reference_translation": "Rashi: ..."
      },
      {
        "commentary_detail_id": "uuid-2",
        "text": "תוספות: ...",
        "reference_translation": "Tosafot: ..."
      }
    ],
    "target_language": "fr",
    "api_key": "sk-ant-api03-...",
    "context": {
      "traite": "Pesachim",
      "page": "5b"
    }
  }'
```

## Changelog

### v2.0 (2026-04-28)
- **BREAKING:** `kind` field now required
- **BREAKING:** Removed silent fallback to `pending_translations`
- Added strict UUID validation
- Added explicit error codes for all validation failures
- Added logging for rejected payloads

### v1.0 (Legacy)
- Optional `kind` with fallback routing
- Silent insertion into `pending_translations` for ambiguous payloads
