# P2-10: academic_searcher_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | P2-10 |
| **Nom** | academic_searcher_tool |
| **Priorité** | Haute |
| **Statut** | A implémenter |
| **Catégorie** | Research / Academic |

## Description

Workflow n8n pour la recherche d'articles académiques multi-sources avec enrichissement Open Access. Utilise 4 sources complémentaires avec déduplication et scoring.

## Stack technique

| Source | Couverture | Accès PDF | Rate limit |
|--------|------------|-----------|------------|
| **Semantic Scholar** | CS, Bio, Médecine | ❌ Métadonnées | 10 req/s (avec clé) |
| **OpenAlex** | 250M+ works | ❌ Métadonnées | 10 req/s |
| **Unpaywall** | DOI → Open Access | ✅ Lien PDF OA | 100k/jour |
| **CORE** | Open Access | ✅ Texte intégral | 10 req/10s |

## Endpoints

### Endpoint unifié (recommandé)

```
POST /webhook/academic-searcher
Content-Type: application/json

{
  "query": "transformer architecture attention",
  "sources": ["semantic_scholar", "openalex"] | "all",
  "options": {
    "enrich_with_unpaywall": true,
    "include_core_fulltext": false,
    "filters": {
      "year_min": 2020,
      "year_max": 2024,
      "min_citations": 10,
      "open_access_only": false,
      "type": "article" | "preprint" | "review"
    },
    "limit": 30,
    "deduplicate": true,
    "sort_by": "citations" | "date" | "relevance"
  },
  "execution_mode": "online" | "offline"
}
```

### Endpoints par source

```
POST /webhook/academic-searcher/semantic-scholar
POST /webhook/academic-searcher/openalex
POST /webhook/academic-searcher/unpaywall
POST /webhook/academic-searcher/core
```

## Response

```json
{
  "success": true,
  "data": {
    "papers": [
      {
        "id": "paper-hash-123",
        "title": "Attention Is All You Need",
        "abstract": "The dominant sequence transduction models...",
        "authors": [
          {"name": "Ashish Vaswani", "affiliation": "Google Brain"}
        ],
        "year": 2017,
        "venue": "NeurIPS",
        "doi": "10.48550/arXiv.1706.03762",
        "citations": 95000,
        "concepts": ["Transformer", "Attention", "NLP"],
        "open_access": {
          "is_oa": true,
          "pdf_url": "https://arxiv.org/pdf/1706.03762.pdf",
          "source": "arxiv",
          "license": "cc-by"
        },
        "urls": {
          "semantic_scholar": "https://www.semanticscholar.org/paper/...",
          "openalex": "https://openalex.org/W..."
        },
        "found_in": ["semantic_scholar", "openalex"]
      }
    ],
    "meta": {
      "query": "transformer architecture attention",
      "total_unique": 28,
      "sources_queried": ["semantic_scholar", "openalex"],
      "enriched_with_unpaywall": 28,
      "oa_found": 15,
      "fulltext_available": 8
    }
  },
  "meta": {
    "provider": "multi-source",
    "execution_mode": "online",
    "processing_time_ms": 2500
  }
}
```

## Workflow Architecture

```
[Trigger/Input]
      │
      ▼
[HTTP Request] → /webhook/academic-searcher (unifié)
      │
      ├── sources: ["semantic_scholar", "openalex"]
      ├── enrich_with_unpaywall: true
      │
      ▼
[IF] need_full_text ?
      │
      ├── OUI → [HTTP Request] → CORE (texte intégral)
      │
      └── NON → [Continue]
      │
      ▼
[Code Node] → Déduplication par DOI/titre
      │
      ▼
[Code Node] → Scoring & ranking personnalisé
      │
      ▼
[Output / Notion / Vector DB]
```

## Definition of Done

- [ ] Endpoint `POST /webhook/academic-searcher`
- [ ] Endpoint unifié avec déduplication
- [ ] Enrichissement Unpaywall pour PDF OA
- [ ] Option texte intégral via CORE
- [ ] Déduplication par DOI puis titre similaire
- [ ] Filtres: année, citations, type, OA only
- [ ] Scoring personnalisé (citations + recency)
- [ ] Cache papers (TTL 7 jours)
- [ ] Tests: recherche multi-sources, filtres année/citations

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| Semantic Scholar | Source unique | Résultats S2 |
| Multi-sources | S2 + OpenAlex | Fusion dédupliquée |
| Unpaywall | DOI connus | PDF URLs trouvées |
| CORE fulltext | Texte intégral | Full text retourné |
| Filtre année | year_min=2020 | Papiers récents |
| Filtre citations | min_citations=100 | Papers influents |
| OA only | open_access_only=true | Que Open Access |

## Dépendances

- **Semantic Scholar API** - Clé optionnelle (augmente rate limit)
- **OpenAlex API** - Gratuit, pas de clé
- **Unpaywall API** - Email requis (CGU)
- **CORE API** - Clé requise
- Variables d'environnement:
  - `SEMANTIC_SCHOLAR_API_KEY` (optionnel)
  - `UNPAYWALL_EMAIL` (requis)
  - `CORE_API_KEY`

## Scoring algorithm

```javascript
score = (
  log(citations + 1) * 0.4 +          // Influence
  (2024 - year) * -0.1 +               // Recency (penalty pour vieux)
  (is_oa ? 0.2 : 0) +                  // Bonus Open Access
  (has_fulltext ? 0.1 : 0) +           // Bonus texte intégral
  relevance_score * 0.3                 // Score API source
)
```

## Notes d'implémentation

1. Déduplication priorité: DOI > titre fuzzy (Levenshtein > 0.9)
2. Enrichir Unpaywall en batch (max 25 DOIs/requête)
3. Cache par requête normalisée (lowercase, trim)
4. CORE uniquement si fulltext explicitement demandé
5. Respecter rate limits avec backoff exponentiel

## Références

- [TOOLS_WORKFLOWS_MAPPING.md - Stack IA & Contenu](../mcp-server/TOOLS_WORKFLOWS_MAPPING.md#stack-ia--contenu--phase-2-p2-04-à-p2-13)
- [tools-complementaire.md - P2-10](../n8n/tools-complementaire.md)
- [Semantic Scholar API](https://api.semanticscholar.org/)
- [OpenAlex API](https://docs.openalex.org/)
- [Unpaywall API](https://unpaywall.org/products/api)
- [CORE API](https://core.ac.uk/services/api)
