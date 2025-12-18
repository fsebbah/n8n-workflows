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

Workflow n8n pour la traduction de PDF en préservant la mise en page originale (layout). Utilise **Mistral OCR** pour l'extraction structurée (y compris les formules mathématiques), puis un LLM pour la traduction, et génère un nouveau PDF avec la même mise en page.

> **Note**: Mistral OCR gère nativement l'extraction des formules mathématiques en LaTeX. Pour un outil dédié à l'extraction math/LaTeX, voir `mathpix_tool`.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| Extraction PDF + OCR | **Mistral OCR** | Souverain 🇫🇷, extraction structurée, formules LaTeX natives |
| Traduction | **DeepL** / OpenAI | Qualité traduction |
| Génération PDF | **Puppeteer** / WeasyPrint | HTML → PDF |
| Rendu formules | **KaTeX** / MathJax | Rendu LaTeX dans le PDF généré |

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
    "preserve_tables": true,
    "preserve_images": true,
    "preserve_math": true,
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
      "images_preserved": 12
    },
    "source_language_detected": "en",
    "target_language": "fr"
  },
  "meta": {
    "provider": "mistral-ocr+deepl",
    "execution_mode": "online",
    "cost_estimate_usd": 0.15,
    "processing_time_ms": 25000
  }
}
```

## Workflow Architecture

```
[Input PDF]
      │
      ▼
[Mistral OCR] → Extraction structurée
      │         (Markdown, positions, tableaux, formules LaTeX)
      ▼
[Parse Structure] → Identifier éléments:
      │            - Texte à traduire
      │            - Formules LaTeX (NE PAS traduire)
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

## Stratégie de traduction

```javascript
function translateWithLayout(mistralOutput, targetLang) {
  const segments = [];

  for (const element of mistralOutput.elements) {
    if (element.type === 'math') {
      // Conserver les formules LaTeX telles quelles
      segments.push({ type: 'math', content: element.latex, translate: false });
    } else if (element.type === 'table') {
      // Traduire le contenu des cellules
      const translatedCells = element.cells.map(cell =>
        translate(cell.text, targetLang)
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
- [ ] Extraction via Mistral OCR (Markdown structuré + formules LaTeX)
- [ ] Préservation formules mathématiques LaTeX (via Mistral OCR)
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
| Article scientifique | PDF avec formules | Formules LaTeX préservées |
| Tableau complexe | PDF avec tableaux | Tableaux traduits |
| Document technique | Manuel avec images | Images conservées |
| Multi-colonnes | PDF 2 colonnes | Layout préservé |
| Citations | Références biblio | Non traduit |
| EN→FR | Document anglais | Traduction FR |
| FR→EN | Document français | Traduction EN |

## Dépendances

### Requis
- **Mistral API** - Extraction OCR + formules LaTeX
  - `MISTRAL_API_KEY`
- **DeepL API** - Traduction
  - `DEEPL_API_KEY`
- **OpenAI API** (fallback) - Traduction
  - `OPENAI_API_KEY`
- **Puppeteer** (npm) - Génération PDF

## Tarification

### Mistral OCR
- Tarification selon tokens traités
- **Coût estimé**: ~$0.01-0.05 par page (incluant extraction des formules LaTeX)

## Notes d'implémentation

1. **Mistral OCR** pour tous les PDF (extraction structurée + formules LaTeX)
2. Traitement asynchrone pour gros PDF (> 20 pages)
3. Callback webhook pour notification fin de traitement
4. Stockage temporaire des PDF générés (TTL 24h)
5. Cache Mistral (extraction coûteuse)
6. Fallback OpenAI si DeepL indisponible
7. Métriques: pages/jour, coût/document

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
- [Mistral OCR API](https://docs.mistral.ai/)
- [DeepL API](https://www.deepl.com/docs-api)

> **Note**: Pour l'extraction spécialisée math/LaTeX (équations complexes, documents scientifiques), voir `mathpix_tool` qui utilise l'API Mathpix dédiée.
