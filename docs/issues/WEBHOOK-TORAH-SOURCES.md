# Webhook: torah-sources

Documentation pour l'équipe n8n - RFC-037 Dynamic Sources Registry

## Résumé

Le plugin Discord doit charger dynamiquement la liste des sources textuelles (Talmud, Kabbale, etc.) depuis n8n au lieu d'avoir une liste codée en dur.

## Endpoint

```
GET {N8N_BASE_URL}/webhook/torah-sources
```

## Comportement attendu

1. Lire la liste des sources depuis la base de données (Qdrant/PostgreSQL)
2. Retourner un JSON avec toutes les sources disponibles
3. Inclure les métadonnées (type, structure, endpoints)

## Format de réponse

```json
{
  "success": true,
  "sources": [
    {
      "name": "Sukkah",
      "aliases": ["souccah", "sukka", "soucca", "soukkah", "soukka"],
      "type": "talmud",
      "structure": "pages",
      "pages": 56,
      "fetch_endpoint": "torah-get-page-translations",
      "translate_endpoint": "torah-translate-page"
    },
    {
      "name": "Berakhot",
      "aliases": ["berachot", "brachot", "brakhot"],
      "type": "talmud",
      "structure": "pages",
      "pages": 64,
      "fetch_endpoint": "torah-get-page-translations",
      "translate_endpoint": "torah-translate-page"
    },
    {
      "name": "Sha'ar HaHakdamot",
      "aliases": ["shaar hahakdamot", "shaar hakdamot", "porte des introductions"],
      "type": "kabbale",
      "structure": "chapters",
      "chapters": 12,
      "fetch_endpoint": "torah-get-chapter",
      "translate_endpoint": "torah-translate-chapter"
    }
  ],
  "updated_at": "2026-02-16T10:30:00Z"
}
```

## Champs obligatoires

| Champ | Type | Description |
|-------|------|-------------|
| `name` | string | Nom canonique de la source (ex: "Sukkah") |
| `aliases` | string[] | Variantes du nom en lowercase (ex: ["souccah", "sukka"]) |
| `type` | string | Type de texte : "talmud", "kabbale", "midrash", "tanakh" |
| `structure` | string | **"pages"** ou **"chapters"** |

## Champs conditionnels (selon structure)

### Si `structure: "pages"` (Talmud)

| Champ | Type | Description |
|-------|------|-------------|
| `pages` | int | Nombre total de pages |
| `fetch_endpoint` | string | `"torah-get-page-translations"` |
| `translate_endpoint` | string | `"torah-translate-page"` |

### Si `structure: "chapters"` (Kabbale, etc.)

| Champ | Type | Description |
|-------|------|-------------|
| `chapters` | int | Nombre total de chapitres |
| `fetch_endpoint` | string | `"torah-get-chapter"` |
| `translate_endpoint` | string | `"torah-translate-chapter"` |

## Structures supportées

### Pages (Talmud)

```
Structure: pages
Référencement: {source} {numéro}{côté}
Exemple: Berakhot 2a, Sukkah 28b
Côtés: a (recto), b (verso)
```

### Chapters (Kabbale, autres)

```
Structure: chapters
Référencement: {source} chapitre {numéro}
Exemple: Sha'ar HaHakdamot chapitre 3
```

## Webhooks associés à créer

### Pour structure "chapters"

| Webhook | Méthode | Description |
|---------|---------|-------------|
| `torah-get-chapter` | POST | Récupère le contenu d'un chapitre |
| `torah-translate-chapter` | POST | Traduit un chapitre |

#### Payload `torah-get-chapter`

```json
{
  "source": "Sha'ar HaHakdamot",
  "chapter": 3
}
```

#### Réponse `torah-get-chapter`

```json
{
  "success": true,
  "source": "Sha'ar HaHakdamot",
  "chapter": 3,
  "title": "Hakdama Gimel",
  "segments": [
    {
      "index": 0,
      "text": "דע כי טרם שנאצלו הנאצלים...",
      "translation": null
    },
    {
      "index": 1,
      "text": "והנה בתחילה היה אור...",
      "translation": "Et voici, au commencement il y avait une lumière..."
    }
  ],
  "total_segments": 45
}
```

#### Payload `torah-translate-chapter`

```json
{
  "source": "Sha'ar HaHakdamot",
  "chapter": 3,
  "language": "fr",
  "force": false
}
```

## Fréquence d'appel

- Le plugin appelle ce webhook **toutes les heures** (configurable)
- Le premier appel est au **démarrage du bot**
- En cas d'échec : **3 tentatives** avec backoff exponentiel

## Gestion des erreurs

### Erreur standard

```json
{
  "success": false,
  "error": {
    "code": 500,
    "message": "Database connection failed",
    "status": "INTERNAL_ERROR"
  }
}
```

### Comportement du plugin en cas d'erreur

1. Retry 3 fois avec backoff (1s, 2s, 4s)
2. Si échec total : **conserver l'ancienne liste en cache**
3. Si premier appel échoue : utiliser une **liste de fallback minimale**

## Source des données

### Option A : Table PostgreSQL

```sql
CREATE TABLE torah_sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    aliases TEXT[], -- Array de variantes
    type VARCHAR(50) NOT NULL,
    structure VARCHAR(20) NOT NULL CHECK (structure IN ('pages', 'chapters')),
    pages INTEGER,
    chapters INTEGER,
    fetch_endpoint VARCHAR(255),
    translate_endpoint VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Exemple d'insertion
INSERT INTO torah_sources (name, aliases, type, structure, pages, fetch_endpoint, translate_endpoint)
VALUES (
    'Sukkah',
    ARRAY['souccah', 'sukka', 'soucca'],
    'talmud',
    'pages',
    56,
    'torah-get-page-translations',
    'torah-translate-page'
);
```

### Option B : Collection Qdrant metadata

Extraire les sources uniques depuis les métadonnées des documents vectorisés.

## Workflow n8n suggéré

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Webhook    │ ──► │  Query DB/Qdrant │ ──► │  Format JSON    │
│  Trigger    │     │  pour sources    │     │  Response       │
└─────────────┘     └──────────────────┘     └─────────────────┘
```

## Contact

Pour questions : équipe plugin-torah-bot

RFC associée : `docs/rfc/RFC-037-DYNAMIC-SOURCES-REGISTRY.md`
