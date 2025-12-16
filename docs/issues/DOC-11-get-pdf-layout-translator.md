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

Workflow n8n pour la traduction de PDF en préservant la mise en page originale (layout). Utilise Mathpix pour l'extraction LaTeX/Markdown structuré, puis un LLM pour la traduction, et génère un nouveau PDF avec la même mise en page.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| Extraction layout | **Mathpix** | Spécialisé documents scientifiques, LaTeX |
| Traduction | **DeepL** / OpenAI | Qualité traduction |
| Génération PDF | **Puppeteer** / WeasyPrint | HTML → PDF |
| Formules maths | **KaTeX** / MathJax | Rendu LaTeX |

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
    "preserve_math": true,
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
      "images_preserved": 12
    },
    "source_language_detected": "en",
    "target_language": "fr"
  },
  "meta": {
    "provider": "mathpix+deepl",
    "execution_mode": "online",
    "cost_estimate_usd": 1.50,
    "processing_time_ms": 45000
  }
}
```

## Workflow Architecture

```
[Input PDF]
      │
      ▼
[Mathpix API] → Extraction structurée
      │         (LaTeX, Markdown, positions)
      ▼
[Parse Structure] → Identifier éléments:
      │            - Texte à traduire
      │            - Formules (ne pas traduire)
      │            - Tableaux (traduire contenu)
      │            - Images (conserver)
      ▼
[Translation API] → Traduire texte uniquement
      │            (DeepL / OpenAI)
      ▼
[Reconstruct] → Réassembler avec layout
      │         - Replacer texte traduit
      │         - Conserver formules LaTeX
      │         - Reconstruire tableaux
      ▼
[Generate PDF] → Puppeteer/WeasyPrint
      │         HTML + CSS → PDF
      ▼
[Output] → PDF traduit + statistiques
```

## Mathpix API Integration

### Extraction

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
    "docx": true,
    "tex.zip": true
  },
  "math_inline_delimiters": ["$", "$"],
  "math_display_delimiters": ["$$", "$$"]
}
```

### Response Mathpix

```json
{
  "pdf_id": "abc123",
  "status": "completed",
  "md": "# Title\n\nThis is a paragraph with $E=mc^2$ inline math.\n\n$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$",
  "pages": [...],
  "line_data": [...]
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
- [ ] Extraction via Mathpix (LaTeX, Markdown)
- [ ] Préservation formules mathématiques
- [ ] Préservation tableaux (traduction contenu)
- [ ] Préservation images
- [ ] Traduction via DeepL ou OpenAI
- [ ] Génération PDF avec layout préservé
- [ ] Support langues: EN↔FR, EN↔DE, EN↔ES
- [ ] Tests: article scientifique, document technique

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| Article scientifique | PDF avec formules | Formules préservées |
| Tableau complexe | PDF avec tableaux | Tableaux traduits |
| Document technique | Manuel avec images | Images conservées |
| Multi-colonnes | PDF 2 colonnes | Layout préservé |
| Citations | Références biblio | Non traduit |
| EN→FR | Document anglais | Traduction FR |
| FR→EN | Document français | Traduction EN |

## Dépendances

- **Mathpix API** - Extraction structurée
  - `MATHPIX_APP_ID`
  - `MATHPIX_APP_KEY`
- **DeepL API** - Traduction
  - `DEEPL_API_KEY`
- **OpenAI API** (fallback) - Traduction
  - `OPENAI_API_KEY`
- **Puppeteer** (npm) - Génération PDF

## Tarification Mathpix

| Plan | Prix | Limites |
|------|------|---------|
| Free | $0 | 100 pages/mois |
| Education | $10/mois | 5000 pages/mois |
| Pro | $99/mois | 50000 pages/mois |
| Enterprise | Custom | Illimité |

**Coût estimé par page**: ~$0.10

## Notes d'implémentation

1. Traitement asynchrone pour gros PDF (> 20 pages)
2. Callback webhook pour notification fin de traitement
3. Stockage temporaire des PDF générés (TTL 24h)
4. Cache Mathpix (extraction coûteuse)
5. Fallback OpenAI si DeepL indisponible
6. Métriques: pages/jour, coût/document

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
