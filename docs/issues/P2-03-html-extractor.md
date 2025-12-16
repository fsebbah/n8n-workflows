# P2-03: html_extractor_tool

## Informations

| Champ | Valeur |
|-------|--------|
| **ID** | P2-03 |
| **Nom** | html_extractor_tool |
| **Priorité** | Moyenne |
| **Statut** | A durcir |
| **Catégorie** | Scraping |

## Description

Workflow n8n pour l'extraction sélective de données HTML via sélecteurs CSS ou XPath. Utilise Cheerio pour un parsing léger et performant.

## Stack technique

| Composant | Outil | Justification |
|-----------|-------|---------------|
| Parsing HTML | **Cheerio** | Ultra-léger, rapide, DOM-like |
| Sélecteurs | CSS (défaut), XPath (option) | Flexibilité |
| Fallback | n8n HTML Extract node | Simplicité |

## Endpoint

```
POST /webhook/html-extractor
Content-Type: application/json

{
  "source": "url" | "html",
  "data": "<url_ou_html_brut>",
  "selectors": [
    {
      "name": "title",
      "selector": "h1.main-title",
      "type": "css",
      "attribute": "text" | "href" | "src" | "data-*"
    },
    {
      "name": "links",
      "selector": "//a[@class='nav-link']",
      "type": "xpath",
      "multiple": true
    }
  ],
  "options": {
    "return_array": true,
    "clean_whitespace": true,
    "include_html": false
  },
  "execution_mode": "online" | "offline"
}
```

## Response

```json
{
  "success": true,
  "data": {
    "extractions": {
      "title": "Page Title",
      "links": [
        {"text": "Link 1", "href": "/page1"},
        {"text": "Link 2", "href": "/page2"}
      ]
    },
    "source_url": "https://example.com",
    "selectors_matched": 2,
    "selectors_failed": 0
  },
  "meta": {
    "provider": "cheerio",
    "execution_mode": "online",
    "processing_time_ms": 120
  }
}
```

## Definition of Done

- [ ] Endpoint `POST /webhook/html-extractor`
- [ ] Input: HTML brut ou URL
- [ ] Sélecteurs: CSS (défaut), XPath (option)
- [ ] Multi-select: tableau de sélecteurs
- [ ] Output: données extraites structurées
- [ ] Sélecteurs larges (attributs sémantiques)
- [ ] Option "Return Array" activée
- [ ] Nettoyage `\n`/`\t` post-extraction
- [ ] Fallback si sélecteur échoue
- [ ] Tests: page simple, nested elements, attributs

## Tests requis

| Test | Description | Attendu |
|------|-------------|---------|
| CSS simple | Sélecteur `h1` | Titre extrait |
| CSS multiple | Sélecteur `li.item` | Array d'items |
| XPath | Expression `//div[@id='main']` | Contenu div |
| Attribut | Extraire `href` des liens | URLs |
| Nested | Éléments imbriqués | Structure préservée |
| Fallback | Sélecteur invalide | Erreur gracieuse |

## Dépendances

- **Cheerio** (npm) - Parsing HTML
- Optionnel: web_scraper_tool pour fetch URL

## Notes d'implémentation

1. Valider les sélecteurs avant exécution
2. Gérer les encodages de caractères
3. Nettoyer automatiquement les espaces blancs
4. Supporter extraction d'attributs multiples
5. Logger les sélecteurs qui échouent

## Références

- [TOOLS_WORKFLOWS_MAPPING.md - Stack Scraping](../mcp-server/TOOLS_WORKFLOWS_MAPPING.md#stack-scraping-n8n--phase-2-v2)
- [tools-complementaire.md](../n8n/tools-complementaire.md)
