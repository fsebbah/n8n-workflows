# RFC-014 : Plan d'implémentation n8n

**Date :** 2026-01-19
**Équipe :** n8n
**RFC :** [RFC-014-DOCUMENT-TRANSLATION-SYNTHESIS](../rfc/RFC-014-DOCUMENT-TRANSLATION-SYNTHESIS.md)
**Issue GitHub :** #255
**Branche :** `feat/rfc-014-document-processing`
**Status :** In Progress

---

## Contexte

Cette issue décrit le plan d'implémentation côté n8n pour la RFC-014 "Traduction et Synthèse de Documents". La RFC a été validée par toutes les équipes (n8n, API, chatbot-core, plugins).

---

## Objectif

Implémenter 4 webhooks permettant le traitement de documents (OCR, traduction, synthèse) avec :
- Validation des paramètres selon le contexte plugin
- Estimation du coût en crédits
- Traitement asynchrone avec callback
- Sauvegarde optionnelle Google Drive

---

## Workflows créés

| Workflow | Fichier | Webhook | Status |
|----------|---------|---------|--------|
| Documents Validate | `MCP---Documents-Validate.json` | `/webhook/documents/validate` | ✅ Créé |
| Documents Estimate | `MCP---Documents-Estimate.json` | `/webhook/documents/estimate` | ✅ Créé |
| Documents Process | `MCP---Documents-Process.json` | `/webhook/documents/process` | ✅ Créé |
| Documents Save | `MCP---Documents-Save.json` | `/webhook/documents/save` | ✅ Créé |

---

## Plan de travail

### Phase 1 : Core (P1) - ✅ COMPLÉTÉ

| # | Tâche | Effort | Status |
|---|-------|--------|--------|
| 1.1 | Créer workflow `documents/validate` | M | ✅ DONE |
| 1.2 | Créer workflow `documents/estimate` | M | ✅ DONE |
| 1.3 | Créer workflow `documents/process` (orchestrateur) | L | ✅ DONE |
| 1.4 | Intégrer workflows OCR existants (`image-ocr`, `pdf-layout-translator`) | M | ✅ DONE |
| 1.5 | Implémenter callback vers chatbot-core | M | ✅ DONE |
| 1.6 | Créer workflow `documents/save` (Google Drive) | S | ✅ DONE |
| 1.7 | Fix: Simplifier workflows Validate/Estimate (Code node) | S | ✅ DONE |
| 1.8 | Tests unitaires des workflows | M | TODO |

### Phase 2 : Avancé (P2) - Semaine 3

| # | Tâche | Effort | Status |
|---|-------|--------|--------|
| 2.1 | Routage `custom_actions` vers webhooks plugins | M | ✅ DONE |
| 2.2 | Support `ocr_thresholds` configurable | S | ✅ DONE |
| 2.3 | Tests OCR hébreu (Mistral) | M | 🔄 EN COURS |
| 2.4 | Tests OCR araméen (Mistral) | M | 🔄 EN COURS |
| 2.5 | Documentation des résultats OCR | S | ✅ DONE |

### Phase 3 : V2 (après retours terrain)

| # | Tâche | Effort | Status |
|---|-------|--------|--------|
| 3.1 | Mode `preview: true` (texte brut) | S | BACKLOG |
| 3.2 | Mode `hebrew_ancient: true` | S | BACKLOG |
| 3.3 | Workflow `extract_recipes` (plugin recipes) | M | BACKLOG |
| 3.4 | Workflow `vocalize_text` (plugin Torah) | M | BACKLOG |
| 3.5 | Workflow `extract_talmud_structure` (plugin Torah) | L | BACKLOG |

---

## Spécifications des webhooks

### 1. `/webhook/documents/validate`

**Entrée :**
```json
{
  "file_url": "https://...",
  "action": "translate",
  "params": { "target_language": "en" },
  "plugin_context": {
    "available_actions": ["translate", "summarize"],
    "required_params": { "translate": ["target_language"] }
  }
}
```

**Sortie (valide) :**
```json
{ "valid": true, "can_proceed": true }
```

**Sortie (manquant) :**
```json
{
  "valid": false,
  "missing": ["target_language"],
  "questions": [{ "param": "target_language", "question": "Dans quelle langue ?" }]
}
```

### 2. `/webhook/documents/estimate`

**Entrée :**
```json
{
  "file_url": "https://...",
  "action": "translate",
  "plugin_context": {
    "pricing": {
      "translate": { "base": 5, "per_1k_tokens": 1.0, "per_page": 2, "ocr_bonus": 3, "max": 50 }
    }
  }
}
```

**Sortie :**
```json
{
  "success": true,
  "estimation": { "tokens": 2500, "pages": 8, "ocr_required": true },
  "credits": { "estimated": 25, "breakdown": { "base": 5, "tokens": 2.5, "pages": 16, "ocr": 3 } }
}
```

### 3. `/webhook/documents/process`

**Entrée :**
```json
{
  "job_id": "uuid",
  "conversation_id": "abc123",
  "file_url": "https://...",
  "action": "translate",
  "params": { "target_language": "en" },
  "plugin_context": { "api_keys": { "mistral": "sk-..." } },
  "callback_url": "http://chatbot-core/internal/webhooks/document-result"
}
```

**Réponse immédiate :**
```json
{ "success": true, "message": "Processing started", "job_id": "uuid" }
```

**Callback (succès) :**
```json
{
  "job_id": "uuid",
  "conversation_id": "abc123",
  "success": true,
  "result": { "text": "...", "word_count": 1250 },
  "metrics": { "tokens_used": 2450, "processing_time_ms": 15000, "ocr_confidence": 0.95 }
}
```

**Callback (erreur) :**
```json
{
  "job_id": "uuid",
  "success": false,
  "error": {
    "code": "OCR_FAILED",
    "message": "...",
    "refund": { "recommended": true, "percentage": 100 }
  }
}
```

### 4. `/webhook/documents/save`

**Entrée :**
```json
{
  "content": "Translated text...",
  "filename": "document_translated.txt",
  "google_access_token": "ya29..."
}
```

**Sortie :**
```json
{
  "success": true,
  "drive_url": "https://drive.google.com/file/d/xxx/view",
  "file_id": "xxx"
}
```

---

## Codes d'erreur

| Code | Refund % | Description |
|------|----------|-------------|
| `SUCCESS` | 0% | OK |
| `PARTIAL_SUCCESS` | 50% | Traitement partiel |
| `OCR_FAILED` | 100% | Échec OCR |
| `LLM_ERROR` | 100% | Erreur API LLM |
| `TIMEOUT` | 100% | Dépassement délai |
| `INVALID_FORMAT` | 100% | Format non supporté |
| `FILE_CORRUPTED` | 100% | Fichier illisible |

---

## Dépendances

| Élément | Source | Status |
|---------|--------|--------|
| JSON Schema `plugin_context` | chatbot-core | ✅ Fourni |
| Formule calcul crédits | API | ✅ Fournie |
| Workflows OCR existants | n8n | ✅ Intégrés |
| Endpoint callback | chatbot-core | ⏳ En attente |

---

## Prochaines étapes

1. **Activer les workflows** dans n8n
2. **Tester** `/documents/validate` et `/documents/estimate`
3. **Coordonner** avec chatbot-core pour l'endpoint callback
4. **Tests E2E** avec un document réel

---

## Références

- [RFC-014](../rfc/RFC-014-DOCUMENT-TRANSLATION-SYNTHESIS.md)
- [Tests OCR Hébreu/Araméen](../tests/RFC-014-OCR-TESTS.md)
- [MCP - Image OCR](../../workflows/MCP/MCP---Image-OCR.json)
- [MCP - PDF Layout Translator](../../workflows/MCP/MCP---PDF-Layout-Translator.json)
