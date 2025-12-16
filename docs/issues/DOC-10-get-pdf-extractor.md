# DOC-10: get_pdf_extractor_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | DOC-10 (Tool #10) |
| **Nom** | get_pdf_extractor_tool |
| **Priorité** | Moyenne |
| **Statut** | A implémenter |
| **Catégorie** | Documents |

## Description

Workflow n8n "Factory" pour l'extraction PDF avec choix du provider. Permet de sélectionner le meilleur extracteur selon le type de document et les besoins (vitesse, précision, coût).

## Stack technique

| Provider | Usage | Caractéristiques |
|----------|-------|------------------|
| **pdf-parse** | PDF textuels, rapide | Gratuit, local, rapide |
| **Mistral OCR** | PDF scannés, haute qualité | Souverain 🇫🇷, précis |
| **AWS Textract** | Documents structurés | Formulaires, tableaux |
| **Google Vision** | OCR généraliste | Multilingue |
| **Adobe PDF Services** | PDF complexes | Haute fidélité |

## Endpoint

```
POST /webhook/get-pdf-extractor
Content-Type: application/json

{
  "source": "url" | "base64",
  "data": "<url_ou_base64>",
  "provider": "auto" | "pdf-parse" | "mistral" | "textract" | "vision" | "adobe",
  "options": {
    "priority": "speed" | "accuracy" | "cost",
    "extract_tables": true,
    "extract_forms": false,
    "ocr_language": "fra+eng",
    "output_format": "text" | "markdown" | "json"
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "text": "Contenu extrait...",
    "pages": [...],
    "tables": [...],
    "forms": [...],
    "metadata": {
      "page_count": 10,
      "extraction_method": "ocr",
      "provider_used": "mistral"
    }
  },
  "meta": {
    "provider": "mistral",
    "model": "mistral-ocr-latest",
    "fallback_used": false,
    "execution_mode": "online",
    "cost_estimate_usd": 0.02,
    "processing_time_ms": 1200
  }
}
```

## Logique de sélection automatique

```javascript
function selectProvider(pdf, options) {
  const { priority, extract_tables, extract_forms } = options;
  const pdfType = detectPdfType(pdf); // 'text' | 'scanned' | 'mixed'

  // Formulaires → Textract (spécialisé)
  if (extract_forms) {
    return 'textract';
  }

  // PDF textuel + priorité vitesse → pdf-parse
  if (pdfType === 'text' && priority === 'speed') {
    return 'pdf-parse';
  }

  // PDF scanné + priorité précision → Mistral OCR
  if (pdfType === 'scanned' && priority === 'accuracy') {
    return 'mistral';
  }

  // Priorité coût → pdf-parse puis Mistral fallback
  if (priority === 'cost') {
    return 'pdf-parse'; // avec fallback mistral si échec
  }

  // Défaut: Mistral (bon équilibre)
  return 'mistral';
}
```

## Comparatif Providers

| Provider | Vitesse | Précision | Coût | Tableaux | Formulaires |
|----------|---------|-----------|------|----------|-------------|
| pdf-parse | ⚡⚡⚡ | ⭐⭐ | Gratuit | ❌ | ❌ |
| Mistral OCR | ⚡⚡ | ⭐⭐⭐⭐ | $$ | ✅ | ⚠️ |
| AWS Textract | ⚡⚡ | ⭐⭐⭐⭐ | $$$ | ✅ | ✅ |
| Google Vision | ⚡⚡ | ⭐⭐⭐ | $$ | ⚠️ | ❌ |
| Adobe PDF | ⚡ | ⭐⭐⭐⭐⭐ | $$$$ | ✅ | ✅ |

## Workflow Architecture

```
[Input PDF]
      │
      ▼
[Detect PDF Type] → text | scanned | mixed
      │
      ▼
[Select Provider] → Selon type + options
      │
      ├── pdf-parse ──────┐
      ├── Mistral OCR ────┤
      ├── AWS Textract ───┼──► [Extract]
      ├── Google Vision ──┤
      └── Adobe PDF ──────┘
      │
      ▼
[IF] extraction_failed && fallback_enabled ?
      │
      ├── OUI → [Next Provider]
      │
      └── NON → [Error]
      │
      ▼
[Normalize Output] → Format unifié
      │
      ▼
[Output]
```

## Definition of Done

- [ ] Endpoint `POST /webhook/get-pdf-extractor`
- [ ] Support provider: auto, pdf-parse, mistral, textract
- [ ] Sélection automatique selon type PDF
- [ ] Sélection selon priorité (speed/accuracy/cost)
- [ ] Fallback automatique si provider échoue
- [ ] Output unifié quel que soit le provider
- [ ] Estimation coût retournée
- [ ] Tests: chaque provider, fallback, auto-select

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| Auto texte | PDF textuel, auto | pdf-parse utilisé |
| Auto scanné | PDF scanné, auto | Mistral utilisé |
| Force Mistral | provider: mistral | Mistral même si texte |
| Formulaire | extract_forms: true | Textract utilisé |
| Fallback | pdf-parse échoue | Mistral en fallback |
| Priorité coût | priority: cost | Provider moins cher |

## Dépendances

- **pdf-parse** (npm) - Gratuit, local
- **Mistral API** - `MISTRAL_API_KEY`
- **AWS Textract** - `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
- **Google Vision** - `GOOGLE_APPLICATION_CREDENTIALS`
- **Adobe PDF Services** - `ADOBE_CLIENT_ID`, `ADOBE_CLIENT_SECRET`

## Différence avec pdf_extractor_tool

| Tool | Usage |
|------|-------|
| `pdf_extractor_tool` | Extraction simple, Mistral par défaut |
| `get_pdf_extractor_tool` | Factory, choix du provider, fallbacks |

## Notes d'implémentation

1. Implémenter d'abord pdf-parse + Mistral
2. Ajouter Textract si besoin formulaires
3. Google Vision et Adobe en options futures
4. Logger le provider utilisé pour analytics
5. Cache par provider (clés différentes)

## Références

- [TOOLS_MIGRATION_LIST.md](../mcp-server/TOOLS_MIGRATION_LIST.md)
- [Mistral OCR](https://docs.mistral.ai)
- [AWS Textract](https://docs.aws.amazon.com/textract/)
