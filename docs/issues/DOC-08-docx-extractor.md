# DOC-08: docx_extractor_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | DOC-08 (Tool #8) |
| **Nom** | docx_extractor_tool |
| **Priorité** | Moyenne |
| **Statut** | A implémenter |
| **Catégorie** | Documents |

## Description

Workflow n8n pour l'extraction de texte, tableaux et images depuis des fichiers Microsoft Word (.docx). Utilise mammoth.js pour l'extraction textuelle et docxtemplater pour les opérations avancées.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| Extraction texte | **mammoth.js** | Conversion DOCX → HTML/texte propre |
| Extraction avancée | **docxtemplater** | Accès structure XML, tableaux |
| Extraction images | **JSZip** | DOCX = ZIP, images dans /word/media |
| Fallback | n8n Extract from File | Node natif |

## Endpoint

```
POST /webhook/docx-extractor
Content-Type: application/json

{
  "source": "url" | "base64",
  "data": "<url_ou_base64>",
  "options": {
    "output_format": "text" | "html" | "markdown",
    "extract_images": false,
    "extract_tables": true,
    "extract_styles": false,
    "preserve_formatting": false
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "text": "Contenu extrait du document...",
    "html": "<p>Contenu extrait...</p>",
    "markdown": "# Titre\n\nContenu extrait...",
    "tables": [
      {
        "id": 1,
        "headers": ["Col1", "Col2"],
        "rows": [
          ["val1", "val2"],
          ["val3", "val4"]
        ]
      }
    ],
    "images": [
      {
        "id": "image1",
        "filename": "image1.png",
        "base64": "iVBORw0KGgo...",
        "mime_type": "image/png"
      }
    ],
    "metadata": {
      "title": "Document Title",
      "author": "Author Name",
      "created": "2024-01-15T10:00:00Z",
      "modified": "2024-06-20T14:30:00Z",
      "word_count": 1250,
      "page_count": 5
    }
  },
  "meta": {
    "provider": "mammoth",
    "execution_mode": "online",
    "processing_time_ms": 320
  }
}
```

## Workflow Architecture

```
[Input DOCX URL/Base64]
      │
      ▼
[Code Node] → Valider format DOCX
      │
      ▼
[mammoth.js] → Extraction texte/HTML
      │
      ▼
[IF] extract_tables ?
      │
      ├── OUI → [docxtemplater] → Parser tableaux
      │
      └── NON → [Continue]
      │
      ▼
[IF] extract_images ?
      │
      ├── OUI → [JSZip] → Extraire /word/media/*
      │
      └── NON → [Continue]
      │
      ▼
[Format Output]
      │
      ▼
[Output]
```

## Definition of Done

- [ ] Endpoint `POST /webhook/docx-extractor`
- [ ] Input: URL ou base64 DOCX
- [ ] Extraction texte brut
- [ ] Conversion HTML propre
- [ ] Conversion Markdown
- [ ] Extraction tableaux structurés
- [ ] Extraction images (optionnel)
- [ ] Métadonnées document
- [ ] Tests: DOCX simple, avec tableaux, avec images

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| DOCX simple | Texte paragraphes | Texte extrait |
| Avec tableaux | Document avec 2 tableaux | Tableaux JSON |
| Avec images | Document illustré | Images base64 |
| Formatage | Gras, italique, titres | HTML/Markdown correct |
| Gros document | > 100 pages | Performance OK |
| DOCX corrompu | Fichier invalide | Erreur gracieuse |

## Dépendances

- **mammoth** (npm) - Extraction texte/HTML
- **docxtemplater** (npm) - Parsing avancé
- **jszip** (npm) - Accès structure ZIP
- Aucune API externe requise

## Structure interne DOCX

```
document.docx (ZIP)
├── [Content_Types].xml
├── _rels/
│   └── .rels
├── word/
│   ├── document.xml      ← Contenu principal
│   ├── styles.xml        ← Styles
│   ├── media/            ← Images
│   │   ├── image1.png
│   │   └── image2.jpeg
│   └── _rels/
│       └── document.xml.rels
└── docProps/
    ├── core.xml          ← Métadonnées
    └── app.xml
```

## Notes d'implémentation

1. Valider le fichier est bien un DOCX (magic bytes)
2. Gérer les documents protégés (lecture seule OK)
3. Nettoyer le HTML généré (sanitize)
4. Convertir les styles Word vers classes CSS standard
5. Limiter taille images extraites (resize optionnel)

## Références

- [TOOLS_MIGRATION_LIST.md](../mcp-server/TOOLS_MIGRATION_LIST.md)
- [mammoth.js](https://github.com/mwilliamson/mammoth.js)
- [docxtemplater](https://docxtemplater.com/)
