# P2-06: web_scraper_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | P2-06 |
| **Nom** | web_scraper_tool |
| **Priorité** | Haute (fondation) |
| **Statut** | Fonctionnel - A durcir |
| **Catégorie** | Scraping |

## Description

Workflow n8n fondation pour le scraping web. Récupère le HTML et extrait le contenu principal. Utilise Crawlee pour l'orchestration avec Playwright (sites JS) ou Cheerio (HTML statique).

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| Orchestration | **Crawlee** | Retry auto, pooling, proxy hooks, queue intégrée |
| Rendu JS | **Playwright** (via Crawlee) | Sites JavaScript-heavy |
| HTML statique | **Cheerio** (via Crawlee) | Ultra-rapide pour HTML simple |
| Extraction contenu | **Readability** (Mozilla) | Algo Firefox Reader View |
| Cache | **Redis** | TTL configurable |

## Endpoint

```
POST /webhook/web-scraper
Content-Type: application/json

{
  "url": "https://example.com/article",
  "options": {
    "render_js": "auto" | true | false,
    "extract_content": true,
    "include_html": true,
    "screenshot": false,
    "wait_for": "networkidle" | "domcontentloaded" | "selector:#main",
    "timeout_ms": 60000
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "url": "https://example.com/article",
    "final_url": "https://example.com/article?ref=redirect",
    "status_code": 200,
    "html": "<!DOCTYPE html>...",
    "extracted": {
      "title": "Article Title",
      "content": "Clean article text without ads...",
      "excerpt": "First 200 chars...",
      "byline": "John Doe",
      "length": 1500,
      "text_direction": "ltr"
    },
    "screenshot_base64": null
  },
  "meta": {
    "provider": "crawlee",
    "crawler_type": "playwright" | "cheerio",
    "execution_mode": "online",
    "cache_hit": false,
    "timings": {
      "fetch_ms": 1200,
      "render_ms": 800,
      "extract_ms": 50
    }
  }
}
```

## Configuration Rate-limiting

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

## Definition of Done

- [ ] Endpoint `POST /webhook/web-scraper`
- [ ] Support URL unique + liste URLs
- [ ] Extraction: raw HTML, texte nettoyé (Readability), titre
- [ ] Cache Redis (TTL 1h par défaut)
- [ ] Gestion erreurs: timeout, 4xx, 5xx
- [ ] User-Agent Chrome hardcodé
- [ ] Timeout 60s configuré
- [ ] Retry avec backoff sur 429/5xx
- [ ] Logs structurés actifs
- [ ] SSL valide (pas d'ignore par défaut)
- [ ] Tests: URL statique, site JS, URL invalide

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| HTML statique | Page simple sans JS | Cheerio crawler, rapide |
| Site JS | SPA React/Vue | Playwright, rendu complet |
| Redirection | URL avec 301/302 | final_url différent |
| 404 | Page inexistante | Erreur gracieuse |
| 429 | Rate limited | Retry avec backoff |
| Timeout | Site lent | Erreur après 60s |
| Cache | Même URL 2x | Deuxième depuis cache |

## Dépendances

- **Crawlee** (npm) - Orchestration
- **Playwright** (npm) - Rendu JS
- **@mozilla/readability** (npm) - Extraction contenu
- **Redis** - Cache et rate-limiting
- Variables d'environnement:
  - `REDIS_URL`

## Architecture micro-service

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
│  POST /scrape     ← Fetch + rendu JS                    │
│  POST /extract    ← Contenu principal                   │
│  POST /process    ← Endpoint unifié (recommandé)        │
├─────────────────────────────────────────────────────────┤
│  Infra interne :                                        │
│  • Redis (queue + cache URL + rate-limit/domaine)       │
│  • Logs structurés (url, domaine, durée, statut)        │
│  • Stockage fail samples (HTML + screenshot debug)      │
└─────────────────────────────────────────────────────────┘
```

## Notes d'implémentation

1. Détecter automatiquement si JS requis (heuristique ou config)
2. Respecter robots.txt (configurable)
3. Rotation User-Agent (optionnel)
4. Stocker les échecs pour debug (HTML + screenshot)
5. Métriques: taux succès/domaine, latence P95

## Fallback SaaS

En cas de blocage persistant après 3 retries:

| Outil | Usage | Coût |
|-------|-------|------|
| **ScrapingBee** | Sites anti-bot agressifs | ~$49/mois |

## Références

- [TOOLS_WORKFLOWS_MAPPING.md - Stack Scraping](../mcp-server/TOOLS_WORKFLOWS_MAPPING.md#stack-scraping-n8n--phase-2-v2)
- [tools-complementaire.md](../n8n/tools-complementaire.md)
- [Crawlee documentation](https://crawlee.dev/)
