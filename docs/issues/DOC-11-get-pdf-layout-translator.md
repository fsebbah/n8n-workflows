# DOC-11: get_pdf_layout_translator_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | DOC-11 (Tool #11) |
| **Nom** | get_pdf_layout_translator_tool |
| **Priorité** | Haute |
| **Statut** | A implémenter |
| **Catégorie** | Documents |

## Description

Workflow n8n pour la traduction de PDF en préservant la mise en page originale (layout). Utilise **Mistral OCR** pour l'extraction structurée, puis un LLM pour la traduction, et génère un nouveau PDF avec la même mise en page. Pour les documents avec formules mathématiques, **Mathpix** est combiné pour l'extraction LaTeX.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| Extraction PDF | **Mistral OCR** | Souverain 🇫🇷, extraction structurée |
| Formules maths (optionnel) | **Mathpix** | Spécialisé LaTeX, si formules détectées |
| Traduction | **DeepL** / OpenAI | Qualité traduction |
| Génération PDF | **Puppeteer** / WeasyPrint | HTML → PDF |
| Rendu formules | **KaTeX** / MathJax | Rendu LaTeX (si Mathpix utilisé) |

## Endpoint

```
POST /webhook/pdf-layout-translator
Content-Type: application/json

{
  "source": "url" | "base64",
  "data": "<url_ou_base64_pdf>",
  "options": {
    "source_language": "en" | "auto",
    "target_language": "fr",
    "has_math_formulas": false,
    "preserve_tables": true,
    "preserve_images": true,
    "output_format": "pdf" | "docx" | "html",
    "translation_provider": "deepl" | "openai" | "google"
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "translated_pdf_url": "https://storage.example.com/translated_abc123.pdf",
    "translated_pdf_base64": "JVBERi0xLjQK...",
    "preview_html": "<html>...",
    "statistics": {
      "pages_translated": 10,
      "words_translated": 5420,
      "formulas_preserved": 45,
      "tables_preserved": 8,
      "images_preserved": 12,
      "mathpix_used": false
    },
    "source_language_detected": "en",
    "target_language": "fr"
  },
  "meta": {
    "provider": "mistral-ocr+deepl",
    "mathpix_used": false,
    "execution_mode": "online",
    "cost_estimate_usd": 0.50,
    "processing_time_ms": 25000
  }
}
```

## Workflow Architecture

### Cas standard (sans formules mathématiques)

```
[Input PDF]
      │
      ▼
[Mistral OCR] → Extraction structurée
      │         (Markdown, positions, tableaux)
      ▼
[Parse Structure] → Identifier éléments:
      │            - Texte à traduire
      │            - Tableaux (traduire contenu)
      │            - Images (conserver)
      ▼
[Translation API] → Traduire texte uniquement
      │            (DeepL / OpenAI)
      ▼
[Reconstruct] → Réassembler avec layout
      │         - Replacer texte traduit
      │         - Reconstruire tableaux
      ▼
[Generate PDF] → Puppeteer/WeasyPrint
      │         HTML + CSS → PDF
      ▼
[Output] → PDF traduit + statistiques
```

### Cas avec formules mathématiques (has_math_formulas: true)

```
[Input PDF]
      │
      ▼
[Mistral OCR] → Extraction texte + layout
      │
      ▼
[Mathpix API] → Extraction formules LaTeX uniquement
      │         ($E=mc^2$, équations, etc.)
      ▼
[Merge] → Combiner résultats
      │   - Texte de Mistral
      │   - Formules de Mathpix
      ▼
[Parse Structure] → Identifier éléments:
      │            - Texte à traduire
      │            - Formules (NE PAS traduire)
      │            - Tableaux (traduire contenu)
      │            - Images (conserver)
      ▼
[Translation API] → Traduire texte uniquement
      │            (DeepL / OpenAI)
      ▼
[Reconstruct] → Réassembler avec layout
      │         - Replacer texte traduit
      │         - Conserver formules LaTeX intactes
      │         - Reconstruire tableaux
      ▼
[Generate PDF] → Puppeteer/WeasyPrint
      │         HTML + KaTeX (formules) → PDF
      ▼
[Output] → PDF traduit + statistiques
```

## Mistral OCR - Extraction principale

### Endpoint Mistral

```
POST https://api.mistral.ai/v1/ocr
Headers:
  Authorization: Bearer <MISTRAL_API_KEY>

Body:
{
  "model": "mistral-ocr-latest",
  "document": "<base64_ou_url>",
  "output_format": "markdown"
}
```

### Response Mistral

```json
{
  "id": "ocr-abc123",
  "content": "# Title\n\nThis is a paragraph about physics.\n\n| Col1 | Col2 |\n|------|------|\n| A | B |",
  "pages": [...],
  "confidence": 0.95
}
```

## Mathpix API - Formules uniquement (optionnel)

> **Utilisé seulement si** `has_math_formulas: true`

### Endpoint Mathpix

```
POST https://api.mathpix.com/v3/pdf
Headers:
  app_id: <MATHPIX_APP_ID>
  app_key: <MATHPIX_APP_KEY>

Body:
{
  "url": "https://example.com/document.pdf",
  "conversion_formats": {
    "md": true,
    "tex.zip": true
  },
  "math_inline_delimiters": ["$", "$"],
  "math_display_delimiters": ["$$", "$$"]
}
```

### Response Mathpix (formules extraites)

```json
{
  "pdf_id": "abc123",
  "status": "completed",
  "md": "# Title\n\nThis is a paragraph with $E=mc^2$ inline math.\n\n$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$",
  "formulas": [
    {"latex": "E=mc^2", "type": "inline", "page": 1},
    {"latex": "\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}", "type": "display", "page": 1}
  ]
}
```

## Stratégie de traduction

```javascript
function translateWithLayout(mathpixOutput, targetLang) {
  const segments = [];

  for (const element of mathpixOutput.elements) {
    if (element.type === 'math') {
      // Conserver les formules telles quelles
      segments.push({ type: 'math', content: element.latex, translate: false });
    } else if (element.type === 'table') {
      // Traduire le contenu des cellules
      const translatedCells = element.cells.map(cell =>
        cell.is_header ? translate(cell.text, targetLang) : translate(cell.text, targetLang)
      );
      segments.push({ type: 'table', cells: translatedCells, translate: false });
    } else if (element.type === 'text') {
      // Traduire le texte
      segments.push({ type: 'text', content: translate(element.text, targetLang), translate: true });
    } else if (element.type === 'image') {
      // Conserver les images
      segments.push({ type: 'image', src: element.src, translate: false });
    }
  }

  return segments;
}
```

## Definition of Done

- [ ] Endpoint `POST /webhook/pdf-layout-translator`
- [ ] Extraction via Mistral OCR (Markdown structuré)
- [ ] Option Mathpix si formules mathématiques (`has_math_formulas: true`)
- [ ] Préservation formules mathématiques (si présentes)
- [ ] Préservation tableaux (traduction contenu)
- [ ] Préservation images
- [ ] Traduction via DeepL ou OpenAI
- [ ] Génération PDF avec layout préservé
- [ ] Support langues: EN↔FR, EN↔DE, EN↔ES
- [ ] Tests: document standard, document avec formules

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| Document standard | PDF texte simple | Mistral OCR utilisé |
| Article scientifique | PDF avec formules (`has_math_formulas: true`) | Mathpix combiné, formules préservées |
| Tableau complexe | PDF avec tableaux | Tableaux traduits |
| Document technique | Manuel avec images | Images conservées |
| Multi-colonnes | PDF 2 colonnes | Layout préservé |
| Citations | Références biblio | Non traduit |
| EN→FR | Document anglais | Traduction FR |
| FR→EN | Document français | Traduction EN |
| Sans formules | PDF scientifique sans maths | Mistral seul, pas de Mathpix |

## Dépendances

### Requis
- **Mistral API** - Extraction OCR principale
  - `MISTRAL_API_KEY`
- **DeepL API** - Traduction
  - `DEEPL_API_KEY`
- **OpenAI API** (fallback) - Traduction
  - `OPENAI_API_KEY`
- **Puppeteer** (npm) - Génération PDF

### Optionnel (si formules mathématiques)
- **Mathpix API** - Extraction LaTeX uniquement
  - `MATHPIX_APP_ID`
  - `MATHPIX_APP_KEY`

## Tarification

### Mistral OCR (principal)
- Tarification selon tokens traités
- **Coût estimé**: ~$0.01-0.05 par page

### Mathpix (optionnel - formules maths)

| Plan | Prix | Limites |
|------|------|---------|
| Free | $0 | 100 pages/mois |
| Education | $10/mois | 5000 pages/mois |
| Pro | $99/mois | 50000 pages/mois |
| Enterprise | Custom | Illimité |

**Coût estimé par page**: ~$0.10 (uniquement si `has_math_formulas: true`)

## Notes d'implémentation

1. **Mistral OCR par défaut** pour tous les PDF
2. **Mathpix uniquement si** `has_math_formulas: true` (détection manuelle ou auto)
3. Traitement asynchrone pour gros PDF (> 20 pages)
4. Callback webhook pour notification fin de traitement
5. Stockage temporaire des PDF générés (TTL 24h)
6. Cache Mistral et Mathpix séparément (extraction coûteuse)
7. Fallback OpenAI si DeepL indisponible
8. Métriques: pages/jour, coût/document, mathpix_used

## Cas particuliers

| Cas | Solution |
|-----|----------|
| Formules numérotées | Conserver numéros |
| Légendes figures | Traduire |
| Table des matières | Régénérer avec pages |
| Index | Traduire termes |
| Headers/Footers | Traduire si texte |

## Références

- [TOOLS_MIGRATION_LIST.md](../mcp-server/TOOLS_MIGRATION_LIST.md)
- [Mathpix API Documentation](https://docs.mathpix.com/)
- [DeepL API](https://www.deepl.com/docs-api)
