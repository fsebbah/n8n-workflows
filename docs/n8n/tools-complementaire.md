# Stack n8n — Synthèse Consolidée
## Workflows Scraping & IA/Contenu

*Version finale — Décembre 2024*

---

## Vue d'ensemble

Ce document consolide l'architecture technique des workflows n8n pour le scraping web et la génération de contenu IA. Il intègre les retours des experts et les arbitrages finaux.

### Principes directeurs

- **Souveraineté** : Privilégier les solutions locales ou européennes
- **Résilience** : Fallbacks systématiques, pas de point de défaillance unique
- **Observabilité** : Logs structurés, métriques, alertes
- **Simplicité** : n8n orchestre, micro-services exécutent

---

## Partie 1 — Workflows Scraping (P2-02 à P2-07)

### Tableau de synthèse

| Workflow | Statut | Outils | Priorité |
|----------|--------|--------|----------|
| P2-02 `csv_processor` | 🟢 Fonctionnel | n8n natif + DuckDB | Basse |
| P2-03 `html_extractor` | 🟡 À durcir | Cheerio + Readability | Moyenne |
| P2-05 `metadata_extractor` | 🟡 À durcir | metascraper | Moyenne |
| P2-06 `web_scraper` | 🟢 Fonctionnel | Crawlee (Playwright) | Basse |
| P2-07 `bulk_url_processor` | 🟠 Fragile | Redis + BullMQ | **Haute** |

### Stack technique validée

#### Couche locale (prioritaire)

| Fonction | Outil principal | Alternative | Justification |
|----------|-----------------|-------------|---------------|
| Rendu JS + fetch | **Crawlee** (Node) | Playwright nu | Retry auto, pooling, proxy hooks, queue intégrée |
| Parsing HTML | **Cheerio** (Node) | BeautifulSoup (Py) | Ultra-léger, rapide |
| Extraction contenu | **Readability** (Mozilla) | Trafilatura (Py) | Algo Firefox Reader View |
| Métadonnées | **metascraper** (Node) | extruct (Py) | OG + Twitter + JSON-LD unifié |
| Queue/rate-limit | **Redis + BullMQ** | p-queue (petit vol.) | Production-ready, rate-limit/domaine |
| Traitement CSV | **DuckDB** | pandas | Performant sur gros fichiers |

#### Couche SaaS (backup)

| Outil | Usage | Déclencheur |
|-------|-------|-------------|
| ScrapingBee | Sites JS + anti-bot agressif | Blocage persistant après 3 retries |
| Microlink | Metadata rapide | Prototypage uniquement |

### Architecture micro-service

```
┌─────────────────────────────────────────────────────────┐
│                 n8n (orchestrateur)                     │
│         • Split in Batches • Error handling             │
│         • Wait (throttle) • Store results               │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTP Request
                      ▼
┌─────────────────────────────────────────────────────────┐
│        Micro-service Scraping (Node/Crawlee)            │
├─────────────────────────────────────────────────────────┤
│  Endpoints :                                            │
│                                                         │
│  POST /process    ← Endpoint unifié (recommandé)        │
│    {url, options: {extract?, metadata?, screenshot?}}   │
│    → {html, extracted, metadata, screenshots, timings}  │
│                                                         │
│  POST /scrape     ← Fetch + rendu JS                    │
│  POST /extract    ← Contenu principal                   │
│  POST /metadata   ← OG/Twitter/JSON-LD                  │
│  POST /bulk       ← Queue async (job ID)                │
│  GET  /bulk/:id   ← Résultats paginés                   │
├─────────────────────────────────────────────────────────┤
│  Infra interne :                                        │
│  • Redis (queue + cache URL + rate-limit/domaine)       │
│  • Logs structurés (url, domaine, durée, statut)        │
│  • Stockage fail samples (HTML + screenshot debug)      │
└─────────────────────────────────────────────────────────┘
```

### Configuration rate-limiting

```yaml
global:
  max_concurrent: 10
  
per_domain:
  max_concurrent: 2
  delay_between_requests_ms: 2000-5000  # randomisé
  
retry:
  on_429: wait 60s, max 3 attempts
  on_5xx: exponential backoff, max 5 attempts
```

### Definition of Done — Scraping

#### P2-06 `web_scraper`
- [ ] User-Agent Chrome hardcodé
- [ ] Timeout 60s configuré
- [ ] Retry avec backoff sur 429/5xx
- [ ] Logs structurés actifs
- [ ] SSL valide (pas d'ignore par défaut)

#### P2-03 `html_extractor`
- [ ] Sélecteurs larges (attributs sémantiques)
- [ ] Option "Return Array" activée
- [ ] Nettoyage `\n`/`\t` post-extraction
- [ ] Fallback si sélecteur échoue

#### P2-05 `metadata_extractor`
- [ ] Cascade OG → Twitter → Standard
- [ ] Nœud Code de consolidation
- [ ] Cache metadata (TTL 1h)

#### P2-07 `bulk_url_processor`
- [ ] Split in Batches (1-5 URLs)
- [ ] Rate-limit par domaine
- [ ] Continue On Fail activé
- [ ] Backoff 60s sur 429
- [ ] Résultats paginés/streamables

#### P2-02 `csv_processor`
- [ ] BOM UTF-8 (`\uFEFF`) activé
- [ ] Délimiteur `;` pour Excel FR
- [ ] Mode Append si gros volume

---

## Partie 2 — Workflows IA & Contenu (P2-04 à P2-13)

### Tableau de synthèse

| Workflow | Outil(s) | Statut | Notes |
|----------|----------|--------|-------|
| P2-04 `table_extractor` | **Mistral OCR** | 🟢 | Souverain 🇫🇷, spécialisé documents |
| P2-08 `quiz_generator` | OpenAI (GPT-4o) | 🟢 | JSON Mode strict |
| P2-09 `news_searcher` | **Multi-sources** | 🟢 | 4 outils (voir détail) |
| P2-10 `academic_searcher` | **Multi-sources** | 🟢 | 4 outils (voir détail) |
| P2-11 `notion` | Notion API | 🟢 | Standard |
| P2-12 `image_generator` | OpenAI (DALL-E 3) | 🟢 | Standard |
| P2-13 `syllabus_generator` | OpenAI (GPT-4o) | 🟢 | Standard |

---

### P2-04 `table_extractor` — Mistral OCR

#### Choix technique

| Critère | Mistral OCR | GPT-4o Vision |
|---------|-------------|---------------|
| Souveraineté | 🇫🇷 Europe | 🇺🇸 USA |
| Spécialisation | Document Understanding | Vision généraliste |
| Coût | Inférieur | Élevé (pricing Vision) |
| Sortie | Markdown structuré | JSON direct |
| Précision tableaux | Excellente | Bonne (risque hallucination) |

**Modèle** : `mistral-ocr-latest`

#### Endpoint n8n

```
POST /api/table/extract
Content-Type: application/json

{
  "source": "url" | "base64",
  "data": "<url_ou_base64>",
  "output_format": "json" | "markdown" | "csv",
  "options": {
    "detect_headers": true,
    "merge_cells": true
  }
}

Response:
{
  "tables": [
    {
      "id": 1,
      "headers": ["Col1", "Col2", "Col3"],
      "rows": [
        ["val1", "val2", "val3"],
        ...
      ],
      "confidence": 0.95
    }
  ],
  "raw_markdown": "| Col1 | Col2 |...",
  "timings": { "ocr_ms": 1200, "parse_ms": 50 }
}
```

#### Workflow n8n

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

#### Fallback GPT-4o (si Mistral échoue)

Prompt système :
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

---

### P2-09 `news_searcher` — Architecture multi-sources

#### Outils implémentés

| Outil | Type | Quota gratuit | Délai | Corps complet |
|-------|------|---------------|-------|---------------|
| **GNews API** | Principal | 100 req/jour | Temps réel | ✅ Oui |
| **Mediastack** | Secondaire | 500 req/mois | ~1h | ✅ Oui |
| **Google News RSS** | Fallback | Illimité | Temps réel | ❌ Titre + lien |
| **Newscatcher** | Premium | Payant | Temps réel | ✅ Oui |

#### Endpoints micro-service

##### 1. GNews API
```
POST /api/news/gnews
{
  "query": "intelligence artificielle",
  "lang": "fr",
  "country": "fr",
  "max_results": 10,
  "from_date": "2024-12-01"
}

Response:
{
  "source": "gnews",
  "articles": [
    {
      "title": "...",
      "description": "...",
      "content": "...",  // Corps complet
      "url": "...",
      "image": "...",
      "published_at": "2024-12-15T10:30:00Z",
      "source": { "name": "Le Monde", "url": "..." }
    }
  ],
  "total_results": 45
}
```

##### 2. Mediastack
```
POST /api/news/mediastack
{
  "keywords": "startup,fintech",
  "languages": "fr",
  "countries": "fr",
  "limit": 25,
  "sort": "published_desc"
}

Response:
{
  "source": "mediastack",
  "articles": [...],  // Même structure
  "pagination": { "limit": 25, "offset": 0, "total": 120 }
}
```

##### 3. Google News RSS
```
POST /api/news/google-rss
{
  "query": "climat",
  "lang": "fr",
  "geo": "FR"
}

Response:
{
  "source": "google-rss",
  "articles": [
    {
      "title": "...",
      "link": "...",
      "published_at": "...",
      "source_name": "..."
      // Pas de corps - nécessite scraping
    }
  ]
}
```

##### 4. Newscatcher (Premium)
```
POST /api/news/newscatcher
{
  "q": "cybersécurité",
  "lang": "fr",
  "from": "7 days ago",
  "page_size": 50
}

Response:
{
  "source": "newscatcher",
  "articles": [...],
  "total_hits": 234,
  "page": 1,
  "total_pages": 5
}
```

##### 5. Endpoint unifié (recommandé)
```
POST /api/news/search
{
  "query": "intelligence artificielle",
  "lang": "fr",
  "sources": ["gnews", "mediastack"],  // ou "all"
  "max_results": 20,
  "deduplicate": true,
  "enrich_content": true  // Scrape si corps manquant
}

Response:
{
  "articles": [...],  // Fusionnés et dédupliqués
  "sources_used": ["gnews", "mediastack"],
  "total_unique": 18,
  "enriched_count": 3
}
```

#### Workflow n8n — News

```
[Trigger/Input]
      │
      ▼
[HTTP Request] → /api/news/search (unifié)
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

---

### P2-10 `academic_searcher` — Architecture multi-sources

#### Outils implémentés

| Outil | Type | Couverture | Accès PDF | Rate limit |
|-------|------|------------|-----------|------------|
| **Semantic Scholar** | Principal | CS, Bio, Médecine | ❌ Métadonnées | 10 req/s (avec clé) |
| **OpenAlex** | Fallback | Très large (250M+ works) | ❌ Métadonnées | 10 req/s |
| **Unpaywall** | Enrichissement | DOI → Open Access | ✅ Lien PDF OA | 100k/jour |
| **CORE** | Complémentaire | Open Access | ✅ Texte intégral | 10 req/10s |

#### Endpoints micro-service

##### 1. Semantic Scholar
```
POST /api/academic/semantic-scholar
{
  "query": "transformer architecture attention",
  "fields": ["title", "abstract", "authors", "year", "citationCount", "url"],
  "limit": 20,
  "year_range": [2020, 2024],
  "min_citations": 10
}

Response:
{
  "source": "semantic_scholar",
  "papers": [
    {
      "paper_id": "...",
      "title": "Attention Is All You Need",
      "abstract": "...",
      "authors": [
        { "name": "Ashish Vaswani", "author_id": "..." }
      ],
      "year": 2017,
      "citation_count": 95000,
      "url": "https://www.semanticscholar.org/paper/...",
      "venue": "NeurIPS",
      "open_access_pdf": null  // Souvent absent
    }
  ],
  "total": 1250
}
```

##### 2. OpenAlex
```
POST /api/academic/openalex
{
  "query": "machine learning healthcare",
  "filter": {
    "from_year": 2022,
    "type": "article",
    "is_oa": true
  },
  "sort": "cited_by_count:desc",
  "per_page": 25
}

Response:
{
  "source": "openalex",
  "papers": [
    {
      "id": "W123456789",
      "doi": "10.1234/...",
      "title": "...",
      "abstract": "...",
      "authors": [...],
      "publication_date": "2023-06-15",
      "cited_by_count": 450,
      "concepts": [
        { "name": "Machine learning", "score": 0.92 }
      ],
      "open_access": {
        "is_oa": true,
        "oa_url": "https://..."
      }
    }
  ],
  "meta": { "count": 15420, "page": 1, "per_page": 25 }
}
```

##### 3. Unpaywall (enrichissement)
```
POST /api/academic/unpaywall
{
  "dois": [
    "10.1038/nature12373",
    "10.1126/science.1234567"
  ]
}

Response:
{
  "source": "unpaywall",
  "results": [
    {
      "doi": "10.1038/nature12373",
      "is_oa": true,
      "best_oa_location": {
        "url": "https://europepmc.org/...",
        "pdf_url": "https://europepmc.org/.../pdf",
        "version": "publishedVersion",
        "license": "cc-by"
      }
    },
    {
      "doi": "10.1126/science.1234567",
      "is_oa": false,
      "best_oa_location": null
    }
  ]
}
```

##### 4. CORE
```
POST /api/academic/core
{
  "query": "deep learning natural language",
  "limit": 20,
  "full_text": true
}

Response:
{
  "source": "core",
  "papers": [
    {
      "id": "...",
      "title": "...",
      "abstract": "...",
      "full_text": "...",  // Texte intégral si disponible
      "download_url": "https://core.ac.uk/download/pdf/...",
      "repositories": [
        { "name": "arXiv", "url": "..." }
      ]
    }
  ],
  "total_hits": 8540
}
```

##### 5. Endpoint unifié (recommandé)
```
POST /api/academic/search
{
  "query": "quantum computing algorithms",
  "sources": ["semantic_scholar", "openalex"],  // ou "all"
  "enrich_with_unpaywall": true,
  "include_core_fulltext": false,
  "filters": {
    "year_min": 2020,
    "min_citations": 5,
    "open_access_only": false
  },
  "limit": 30,
  "deduplicate": true
}

Response:
{
  "papers": [
    {
      "title": "...",
      "abstract": "...",
      "authors": [...],
      "year": 2023,
      "citations": 125,
      "doi": "10.1234/...",
      "sources_found_in": ["semantic_scholar", "openalex"],
      "open_access": {
        "is_oa": true,
        "pdf_url": "https://..."  // Via Unpaywall
      }
    }
  ],
  "meta": {
    "total_unique": 28,
    "sources_queried": ["semantic_scholar", "openalex"],
    "enriched_with_unpaywall": 28,
    "oa_found": 15
  }
}
```

#### Workflow n8n — Academic

```
[Trigger/Input]
      │
      ▼
[HTTP Request] → /api/academic/search (unifié)
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
[Code Node] → Scoring & ranking personnalisé
      │
      ▼
[Output / Notion / Vector DB]
```

---

## Partie 3 — Infrastructure transverse

### Abstraction LLM Provider

Pour éviter le vendor lock-in OpenAI :

```
┌─────────────────────────────────────────────────────────┐
│                 n8n workflow                            │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
              POST /api/llm/generate
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│              LLM Router (micro-service)                 │
├─────────────────────────────────────────────────────────┤
│  {                                                      │
│    "provider": "auto" | "openai" | "anthropic" | ...    │
│    "model": "gpt-4o" | "claude-sonnet-4-20250514" | ... │
│    "messages": [...],                                   │
│    "options": { "json_mode": true, "temperature": 0.7 } │
│  }                                                      │
├─────────────────────────────────────────────────────────┤
│  Providers supportés :                                  │
│  • OpenAI (défaut)                                      │
│  • Anthropic Claude                                     │
│  • Mistral                                              │
│  • Local (Ollama)                                       │
└─────────────────────────────────────────────────────────┘
```

### Observabilité

| Composant | Métriques | Alertes |
|-----------|-----------|---------|
| Scraping | Taux succès/domaine, latence P95 | Si taux échec > 20% |
| LLM | Tokens consommés, coût/jour | Si budget > seuil |
| News | Articles/jour, sources actives | Si source down > 1h |
| Academic | Papers trouvés, taux OA | - |

### Cache strategy

| Donnée | TTL | Stockage |
|--------|-----|----------|
| HTML scrappé | 24h | Redis |
| Métadonnées | 1h | Redis |
| News articles | 15min | Redis |
| Academic papers | 7 jours | PostgreSQL |
| PDF Open Access | 30 jours | S3/MinIO local |

---

## Partie 4 — Roadmap d'implémentation

### Phase 1 — Fondations (Semaine 1-2)

| Priorité | Tâche | Effort |
|----------|-------|--------|
| 🔴 | Durcir P2-07 `bulk_url_processor` (rate-limit, retry) | 2j |
| 🔴 | Micro-service Crawlee avec `/process` unifié | 3j |
| 🟡 | Setup Redis + BullMQ | 1j |

### Phase 2 — IA & Contenu (Semaine 3-4)

| Priorité | Tâche | Effort |
|----------|-------|--------|
| 🔴 | P2-04 Intégration Mistral OCR | 2j |
| 🔴 | P2-09 News multi-sources (GNews, Mediastack, RSS) | 3j |
| 🔴 | P2-10 Academic multi-sources (Semantic Scholar, OpenAlex, Unpaywall, CORE) | 3j |

### Phase 3 — Industrialisation (Semaine 5-6)

| Priorité | Tâche | Effort |
|----------|-------|--------|
| 🟡 | LLM Router (abstraction provider) | 2j |
| 🟡 | Observabilité (logs, métriques, alertes) | 2j |
| 🟡 | Cache strategy complète | 1j |
| 🟢 | Documentation & tests | 2j |

---

## Annexes

### A. Variables d'environnement requises

```bash
# LLM Providers
OPENAI_API_KEY=sk-...
MISTRAL_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...

# News APIs
GNEWS_API_KEY=...
MEDIASTACK_API_KEY=...
NEWSCATCHER_API_KEY=...  # Optionnel, premium

# Academic APIs
SEMANTIC_SCHOLAR_API_KEY=...  # Optionnel, augmente rate limit
UNPAYWALL_EMAIL=contact@votredomaine.fr  # Requis par leurs CGU
CORE_API_KEY=...

# Infrastructure
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://...

# Scraping
SCRAPINGBEE_API_KEY=...  # Fallback
```

### B. Conformité légale — Checklist

- [ ] Vérifier `robots.txt` avant scraping
- [ ] Ne pas contourner login/paywall
- [ ] Respecter les CGU des APIs (notamment NewsAPI = dev only)
- [ ] Déclarer email pour Unpaywall
- [ ] Documenter les exceptions d'usage

### C. Contacts & Documentation

| Service | Documentation | Support |
|---------|---------------|---------|
| Mistral OCR | docs.mistral.ai | Discord Mistral |
| GNews | gnews.io/docs | Email |
| Semantic Scholar | api.semanticscholar.org | GitHub Issues |
| OpenAlex | docs.openalex.org | GitHub Issues |
| Unpaywall | unpaywall.org/products/api | Email |
| CORE | core.ac.uk/services/api | Email |

---

*Document généré le 16 décembre 2024*
*Version : 2.0 — Consolidée*
