# P2-05: metadata_extractor_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | P2-05 |
| **Nom** | metadata_extractor_tool |
| **Priorité** | Moyenne |
| **Statut** | A durcir |
| **Catégorie** | Scraping |

## Description

Workflow n8n pour l'extraction de métadonnées structurées depuis des pages web (OpenGraph, Twitter Cards, JSON-LD, meta tags standard). Utilise metascraper pour une extraction unifiée.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| Extraction | **metascraper** | OG + Twitter + JSON-LD unifié |
| Fallback | Code node (cheerio) | Extraction manuelle |
| Cache | Redis | TTL 1h |

## Endpoint

```
POST /webhook/metadata-extractor
Content-Type: application/json

{
  "source": "url" | "html",
  "data": "<url_ou_html>",
  "options": {
    "include_json_ld": true,
    "include_twitter": true,
    "include_opengraph": true,
    "include_standard": true,
    "fetch_favicon": true
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "title": "Article Title",
    "description": "Article description...",
    "image": "https://example.com/og-image.jpg",
    "url": "https://example.com/article",
    "site_name": "Example Site",
    "type": "article",
    "author": "John Doe",
    "published_time": "2024-12-15T10:00:00Z",
    "favicon": "https://example.com/favicon.ico",
    "sources": {
      "opengraph": {
        "og:title": "Article Title",
        "og:description": "...",
        "og:image": "..."
      },
      "twitter": {
        "twitter:card": "summary_large_image",
        "twitter:title": "..."
      },
      "json_ld": {
        "@type": "Article",
        "headline": "...",
        "author": {...}
      },
      "standard": {
        "title": "...",
        "description": "..."
      }
    }
  },
  "meta": {
    "provider": "metascraper",
    "execution_mode": "online",
    "cache_hit": false,
    "processing_time_ms": 250
  }
}
```

## Cascade d'extraction

L'ordre de priorité pour chaque champ:

1. **OpenGraph** (og:*) - Standard Facebook
2. **Twitter Cards** (twitter:*) - Standard Twitter
3. **JSON-LD** - Données structurées Schema.org
4. **Meta standard** - title, description, author

## Definition of Done

- [ ] Endpoint `POST /webhook/metadata-extractor`
- [ ] Input: URL ou HTML
- [ ] Extraction: OpenGraph, Twitter Cards, JSON-LD, meta tags
- [ ] Output: objet métadonnées normalisé
- [ ] Cascade OG → Twitter → Standard
- [ ] Noeud Code de consolidation
- [ ] Cache metadata (TTL 1h)
- [ ] Tests: article blog, page produit, page sans méta

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| Article blog | Page avec OG complet | Métadonnées complètes |
| Page produit | E-commerce avec JSON-LD | Données produit |
| Page sans méta | HTML basique | Fallback title/description |
| Twitter only | Page Twitter-first | Twitter cards extraites |
| Cache hit | Même URL 2x | Deuxième appel depuis cache |

## Dépendances

- **metascraper** (npm) - Extraction unifiée
- **Redis** - Cache (optionnel mais recommandé)
- web_scraper_tool - Pour fetch URL si non fourni en HTML

## Notes d'implémentation

1. Normaliser les URLs relatives en absolues
2. Valider les URLs d'images (HEAD request optionnel)
3. Parser JSON-LD même s'il est malformé
4. Extraire favicon depuis /favicon.ico ou link[rel="icon"]
5. Gérer les encodages de caractères

## Références

- [TOOLS_WORKFLOWS_MAPPING.md - Stack Scraping](../mcp-server/TOOLS_WORKFLOWS_MAPPING.md#stack-scraping-n8n--phase-2-v2)
- [tools-complementaire.md](../n8n/tools-complementaire.md)
- [metascraper documentation](https://metascraper.js.org/)
