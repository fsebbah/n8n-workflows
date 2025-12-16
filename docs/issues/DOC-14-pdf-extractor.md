# DOC-14: pdf_extractor_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | DOC-14 (Tool #14) |
| **Nom** | pdf_extractor_tool |
| **Priorité** | Haute |
| **Statut** | A implémenter |
| **Catégorie** | Documents |

## Description

Workflow n8n pour l'extraction de texte et contenu depuis des fichiers PDF. Utilise Mistral OCR comme solution principale pour les PDF scannés/images, avec pdf-parse pour les PDF textuels.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| PDF textuel | **pdf-parse** (Node.js) | Extraction rapide, texte natif |
| PDF scanné/image | **Mistral OCR** | Souverain 🇫🇷, haute précision |
| Fallback OCR | GPT-4o Vision | Vision généraliste |
| Détection type | Heuristique | Auto-détection texte vs image |

## Endpoint

```
POST /webhook/pdf-extractor
Content-Type: application/json

{
  "source": "url" | "base64",
  "data": "<url_ou_base64>",
  "options": {
    "mode": "auto" | "text" | "ocr",
    "pages": "all" | "1-5" | [1, 3, 5],
    "extract_images": false,
    "extract_tables": false,
    "language": "fr" | "en" | "auto",
    "output_format": "text" | "markdown" | "structured"
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "text": "Contenu extrait du PDF...",
    "pages": [
      {
        "page_number": 1,
        "text": "Contenu page 1...",
        "word_count": 450
      },
      {
        "page_number": 2,
        "text": "Contenu page 2...",
        "word_count": 380
      }
    ],
    "metadata": {
      "title": "Document Title",
      "author": "Author Name",
      "creation_date": "2024-01-15",
      "page_count": 10,
      "file_size_bytes": 245000
    },
    "extraction_method": "text" | "ocr",
    "tables": [],
    "images": []
  },
  "meta": {
    "provider": "pdf-parse" | "mistral-ocr",
    "model": "mistral-ocr-latest",
    "execution_mode": "online",
    "processing_time_ms": 850
  }
}
```

## Workflow Architecture

```
[Input PDF URL/Base64]
      │
      ▼
[Code Node] → Détecter type PDF (texte vs scanné)
      │
      ├── Texte natif → [pdf-parse] → Extraction directe
      │
      └── Scanné/Image → [Mistral OCR] → OCR
      │
      ▼
[IF] extract_tables ?
      │
      ├── OUI → [table_extractor_tool]
      │
      └── NON → [Continue]
      │
      ▼
[Format Output] → Structurer résultat
      │
      ▼
[Output]
```

## Détection automatique du type

```javascript
// Heuristique pour détecter PDF texte vs scanné
function detectPdfType(pdfBuffer) {
  const textContent = extractTextLayer(pdfBuffer);
  const textRatio = textContent.length / pdfBuffer.length;

  if (textRatio > 0.01) {
    return 'text';  // PDF avec couche texte
  } else {
    return 'ocr';   // PDF scanné, nécessite OCR
  }
}
```

## Definition of Done

- [ ] Endpoint `POST /webhook/pdf-extractor`
- [ ] Input: URL ou base64 PDF
- [ ] Détection auto texte vs scanné
- [ ] Extraction texte natif (pdf-parse)
- [ ] OCR pour PDF scannés (Mistral)
- [ ] Support sélection de pages
- [ ] Extraction métadonnées (titre, auteur, date)
- [ ] Option extraction tables (via table_extractor)
- [ ] Output: texte, markdown ou structuré
- [ ] Tests: PDF texte, PDF scanné, PDF mixte, gros PDF

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| PDF texte | Document Word converti | Extraction directe rapide |
| PDF scanné | Document numérisé | OCR Mistral |
| PDF mixte | Texte + images | Détection correcte par page |
| Gros PDF | > 50 pages | Pagination/streaming |
| Pages spécifiques | pages: [1, 3, 5] | Seulement ces pages |
| Métadonnées | PDF avec auteur/titre | Métadonnées extraites |
| PDF protégé | Mot de passe | Erreur gracieuse |

## Dépendances

- **pdf-parse** (npm) - Extraction texte natif
- **Mistral API** - OCR pour PDF scannés
- Variables d'environnement:
  - `MISTRAL_API_KEY`

## Notes d'implémentation

1. Détecter le type avant traitement pour optimiser
2. Limiter taille fichier (défaut 50MB)
3. Traiter les gros PDF page par page
4. Cache les résultats (TTL 24h, clé = hash PDF)
5. Gérer les PDF protégés par mot de passe
6. Option OCR forcé même pour PDF texte (qualité)

## Différence avec get_pdf_extractor_tool

| Tool | Usage |
|------|-------|
| `pdf_extractor_tool` | Extraction directe, usage simple |
| `get_pdf_extractor_tool` | Factory pattern, choix du provider |

## Références

- [TOOLS_MIGRATION_LIST.md](../mcp-server/TOOLS_MIGRATION_LIST.md)
- [Mistral OCR Documentation](https://docs.mistral.ai)
- [pdf-parse npm](https://www.npmjs.com/package/pdf-parse)
