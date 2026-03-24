# Webhooks Analyzable + Trace Tracking

**Branch:** `feat/analyzable-trace-webhooks`
**Date:** 2026-03-24
**Status:** ✅ Complete

## Objectif

Ajouter à chaque webhook :
1. `**Analyzable:**` dans le sticky note
2. `_trace` dans la réponse (pour Langfuse)

## Structure Analyzable

```json
{
  "accepts_image": true,
  "accepts_media": false,
  "output_fields": ["field1", "field2"],
  "domain": "documents|nlp|media|extraction"
}
```

## P0 - Vision/OCR (7 webhooks)

| Webhook | _trace | analyzable | Status |
|---------|--------|------------|--------|
| MCP-PDF-OCR | ✅ | ✅ | ✅ Done |
| MCP-Image-OCR | ✅ | ✅ | ✅ Done |
| MCP-Mathpix | ✅ | ✅ | ✅ Done |
| MCP-Google-Drive-OCR | ✅ | ✅ | ✅ Done |
| MCP-Table-Extractor | ✅ | ✅ | ✅ Done |
| MCP-Image-Embedder | ✅ | ✅ | ✅ Done |
| MCP-PDF-Extractor | ✅ | ✅ | ✅ Done |

## P1 - NLP/Analysis (12 webhooks)

| Webhook | _trace | analyzable | Status |
|---------|--------|------------|--------|
| LLM-Request-Validator | ✅ | ✅ | ✅ Done |
| MCP-Analyze-Message | ✅ | ✅ | ✅ Done |
| MCP-Feedback-Analyzer | ✅ | ✅ | ✅ Done |
| MCP-Entity-Extractor | ✅ | ✅ | ✅ Done |
| MCP-Language-Detector | ✅ | ✅ | ✅ Done |
| MCP-Text-Classifier | ✅ | ✅ | ✅ Done |
| MCP-LLM-Summarizer | ✅ | ✅ | ✅ Done |
| MCP-Summarizer | ✅ | ✅ | ✅ Done |
| MCP-Text-Embedder | ✅ | ✅ | ✅ Done |
| MCP-DOCX-Extractor | ✅ | ✅ | ✅ Done |
| MCP-Documents-Process | ✅ | ✅ | ✅ Done |
| MCP-Documents-Validate | ✅ | ✅ | ✅ Done |
| MCP-Metadata-Extractor | ✅ | ✅ | ✅ Done |

## Skipped

- MCP-LLM-Intention (désactivé)
- MCP-Gemini-Image (génération, pas analyse)

## Workflows à importer

19 workflows modifiés prêts pour import dans n8n.

## Commandes

```bash
# Import et activation
./scripts/n8n/batch_import.sh --pattern "MCP-" --modified

# Ou individuellement
python3 scripts/n8n/n8n_api.py import workflows/MCP-PDF-OCR.json
python3 scripts/n8n/n8n_api.py activate <workflow_id>
```
