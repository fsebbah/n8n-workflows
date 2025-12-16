# P2-09: news_searcher_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | P2-09 |
| **Nom** | news_searcher_tool |
| **Priorité** | Haute |
| **Statut** | A implémenter |
| **Catégorie** | Research / News |

## Description

Workflow n8n pour la recherche d'actualités multi-sources avec agrégation et déduplication. Utilise 4 sources complémentaires pour maximiser la couverture.

## Stack technique

| Source | Type | Quota gratuit | Corps complet | Délai |
|--------|------|---------------|---------------|-------|
| **GNews API** | Principal | 100 req/jour | ✅ Oui | Temps réel |
| **Mediastack** | Secondaire | 500 req/mois | ✅ Oui | ~1h |
| **Google News RSS** | Fallback | Illimité | ❌ Titre + lien | Temps réel |
| **Newscatcher** | Premium | Payant | ✅ Oui | Temps réel |

## Endpoints

### Endpoint unifié (recommandé)

```
POST /webhook/news-searcher
Content-Type: application/json

{
  "query": "intelligence artificielle",
  "sources": ["gnews", "mediastack"] | "all",
  "options": {
    "language": "fr",
    "country": "fr",
    "max_results": 20,
    "from_date": "2024-12-01",
    "to_date": "2024-12-15",
    "deduplicate": true,
    "enrich_content": true,
    "sort_by": "published_date" | "relevance"
  },
  "execution_mode": "online" | "offline"
}
```

### Endpoints par source

```
POST /webhook/news-searcher/gnews
POST /webhook/news-searcher/mediastack
POST /webhook/news-searcher/google-rss
POST /webhook/news-searcher/newscatcher
```

## Response

```json
{
  "success": true,
  "data": {
    "articles": [
      {
        "id": "article-hash-123",
        "title": "L'IA transforme l'industrie française",
        "description": "Les entreprises françaises adoptent...",
        "content": "Corps complet de l'article...",
        "url": "https://lemonde.fr/article/...",
        "image": "https://lemonde.fr/images/...",
        "published_at": "2024-12-15T10:30:00Z",
        "source": {
          "name": "Le Monde",
          "url": "https://lemonde.fr"
        },
        "found_in": ["gnews", "mediastack"]
      }
    ],
    "meta": {
      "query": "intelligence artificielle",
      "total_unique": 18,
      "sources_queried": ["gnews", "mediastack"],
      "enriched_count": 3,
      "deduplicated_count": 5
    }
  },
  "meta": {
    "provider": "multi-source",
    "execution_mode": "online",
    "processing_time_ms": 1500
  }
}
```

## Workflow Architecture

```
[Trigger/Input]
      │
      ▼
[HTTP Request] → /webhook/news-searcher (unifié)
      │
      ├── sources: ["gnews", "mediastack"]
      │
      ▼
[IF] articles.length < 5 ?
      │
      ├── OUI → [HTTP Request] → Google RSS + Scraping
      │
      └── NON → [Continue]
      │
      ▼
[Code Node] → Déduplication par titre/URL
      │
      ▼
[Output / Store]
```

## Definition of Done

- [ ] Endpoint `POST /webhook/news-searcher`
- [ ] Endpoint unifié avec déduplication
- [ ] Support multi-sources configurable
- [ ] Enrichissement contenu si corps manquant (via scraping)
- [ ] Déduplication par titre similaire + URL
- [ ] Filtres: langue, pays, dates
- [ ] Tri par date ou pertinence
- [ ] Cache articles (TTL 15min)
- [ ] Tests: recherche FR, multi-sources, fallback RSS

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| GNews seul | Source unique | Résultats GNews |
| Multi-sources | GNews + Mediastack | Fusion dédupliquée |
| Fallback RSS | Aucun résultat API | Google RSS utilisé |
| Enrichissement | RSS sans corps | Scraping déclenché |
| Dates | Filtre from/to | Articles dans période |
| Langue | lang=en | Articles anglais |
| Cache | Même requête 2x | Cache hit |

## Dépendances

- **GNews API** - API Key requise
- **Mediastack API** - API Key requise
- **Newscatcher API** - API Key (optionnel, premium)
- **web_scraper_tool** - Pour enrichissement RSS
- Variables d'environnement:
  - `GNEWS_API_KEY`
  - `MEDIASTACK_API_KEY`
  - `NEWSCATCHER_API_KEY` (optionnel)

## Quotas et limites

| Source | Limite gratuite | Limite payante |
|--------|-----------------|----------------|
| GNews | 100 req/jour | Illimité |
| Mediastack | 500 req/mois | Illimité |
| Google RSS | Illimité | - |
| Newscatcher | - | Selon plan |

## Notes d'implémentation

1. Fallback automatique si quota atteint
2. Déduplication fuzzy sur titre (Levenshtein > 0.8)
3. Normaliser les dates en ISO 8601
4. Enrichir seulement si corps < 100 chars
5. Métriques: articles/requête, taux enrichissement

## Références

- [TOOLS_WORKFLOWS_MAPPING.md - Stack IA & Contenu](../mcp-server/TOOLS_WORKFLOWS_MAPPING.md#stack-ia--contenu--phase-2-p2-04-à-p2-13)
- [tools-complementaire.md - P2-09](../n8n/tools-complementaire.md)
- [GNews Documentation](https://gnews.io/docs)
- [Mediastack Documentation](https://mediastack.com/documentation)
