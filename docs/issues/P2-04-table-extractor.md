# P2-04: table_extractor_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | P2-04 |
| **Nom** | table_extractor_tool |
| **Priorité** | Haute |
| **Statut** | A implémenter |
| **Catégorie** | Documents / OCR |

## Description

Workflow n8n pour l'extraction de tableaux depuis des PDF et images. Utilise Mistral OCR comme solution principale (souveraineté européenne) avec fallback GPT-4o Vision.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| OCR principal | **Mistral OCR** | Souverain 🇫🇷, spécialisé documents |
| Fallback | GPT-4o Vision | Vision généraliste, robuste |
| Post-traitement | Code node | Parse Markdown → JSON |

### Comparatif Mistral vs GPT-4o

| Critère | Mistral OCR | GPT-4o Vision |
|---------|-------------|---------------|
| Souveraineté | 🇫🇷 Europe | 🇺🇸 USA |
| Spécialisation | Document Understanding | Vision généraliste |
| Coût | Inférieur | Élevé (pricing Vision) |
| Sortie | Markdown structuré | JSON direct |
| Précision tableaux | Excellente | Bonne (risque hallucination) |

**Modèle recommandé** : `mistral-ocr-latest`

## Endpoint

```
POST /webhook/table-extractor
Content-Type: application/json

{
  "source": "url" | "base64",
  "data": "<url_ou_base64>",
  "output_format": "json" | "markdown" | "csv",
  "options": {
    "detect_headers": true,
    "merge_cells": true,
    "confidence_threshold": 0.8
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "tables": [
      {
        "id": 1,
        "headers": ["Col1", "Col2", "Col3"],
        "rows": [
          ["val1", "val2", "val3"],
          ["val4", "val5", "val6"]
        ],
        "confidence": 0.95
      }
    ],
    "raw_markdown": "| Col1 | Col2 | Col3 |\n|------|------|------|\n| val1 | val2 | val3 |",
    "table_count": 1
  },
  "meta": {
    "provider": "mistral-ocr",
    "model": "mistral-ocr-latest",
    "execution_mode": "online",
    "timings": {
      "ocr_ms": 1200,
      "parse_ms": 50
    }
  }
}
```

## Workflow Architecture

```
[Input PDF/Image]
      │
      ▼
[HTTP Request] → Mistral OCR API
      │
      ▼
[Code Node] → Parse Markdown → JSON structuré
      │
      ▼
[IF] confidence < 0.8 ?
      │
      ├── OUI → [Fallback GPT-4o Vision]
      │
      └── NON → [Output]
```

## Definition of Done

- [ ] Endpoint `POST /webhook/table-extractor`
- [ ] Input: URL ou base64 (PDF/image)
- [ ] Output: JSON structuré avec headers, rows, confidence
- [ ] Fallback GPT-4o si confidence < 0.8
- [ ] Support multi-tableaux dans un document
- [ ] Détection automatique des headers
- [ ] Tests: PDF tableau simple, image complexe, multi-tableaux

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| PDF simple | Tableau 3x3 | Extraction correcte |
| Image complexe | Tableau avec cellules fusionnées | Gestion merge |
| Multi-tableaux | PDF avec 3 tableaux | 3 objets table |
| Sans tableau | Image sans tableau | Array vide |
| Faible qualité | Image floue | Fallback GPT-4o |

## Dépendances

- **Mistral API** - API Key requise
- **OpenAI API** - Pour fallback GPT-4o Vision
- Variables d'environnement:
  - `MISTRAL_API_KEY`
  - `OPENAI_API_KEY`

## Prompt Fallback GPT-4o

```
Tu es un expert en extraction de tableaux. Analyse cette image et extrais
TOUS les tableaux présents. Renvoie UNIQUEMENT un JSON valide avec cette structure :
{
  "tables": [
    {
      "headers": [...],
      "rows": [[...], [...]]
    }
  ]
}
Ne fais aucun commentaire. JSON uniquement.
```

## Notes d'implémentation

1. Vérifier le type de fichier avant traitement
2. Limiter la taille (défaut 10MB)
3. Gérer les PDF multi-pages
4. Cache les résultats (TTL 1h)
5. Logger les cas de fallback pour monitoring

## Références

- [TOOLS_WORKFLOWS_MAPPING.md - Stack IA & Contenu](../mcp-server/TOOLS_WORKFLOWS_MAPPING.md#stack-ia--contenu--phase-2-p2-04-à-p2-13)
- [tools-complementaire.md - P2-04](../n8n/tools-complementaire.md)
- [Mistral OCR Documentation](https://docs.mistral.ai)
