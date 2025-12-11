# Knowledge Graph MCP Server API

Documentation pour le serveur MCP Knowledge Graph accessible via webhook n8n.

## Endpoint

```
POST /webhook/knowledge-graph
```

## Vue d'ensemble

Ce workflow extrait un graphe de connaissances à partir de documents (PDF, TXT, DOCX, etc.) en utilisant Google Gemini. Il supporte optionnellement la simplification et l'analyse du graphe généré.

## Paramètres de la requête

### Source du document (obligatoire - un seul)

| Paramètre | Type | Description |
|-----------|------|-------------|
| `documentPath` | string | Chemin local vers le fichier à analyser |
| `documentUrl` | string | URL du document à télécharger et analyser |
| `document.data` | string | Contenu du document encodé en base64 |
| `document.mimeType` | string | Type MIME du document (si base64) |

### Configuration de l'extraction

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `configMode` | string | `"preset"` | Mode de configuration: `"preset"`, `"custom"`, `"jsonConfig"` |
| `preset` | string | `"business"` | Preset à utiliser (voir liste ci-dessous) |
| `configJson` | object | `{}` | Configuration JSON personnalisée |

### Options de traitement

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `simplify` | boolean | `false` | Simplifier le graphe aux entités clés |
| `analyze` | boolean | `false` | Générer une analyse détaillée du graphe |
| `maxNodes` | number | `30` | Nombre max de nodes pour la simplification |
| `analysisLanguage` | string | `"en"` | Langue de l'analyse: `"en"`, `"fr"`, `"es"`, `"de"` |

## Presets disponibles

### `narrative`
Pour les histoires, livres, récits.
- **Entity types**: character, location, event, object
- **Relation types**: friend_of, enemy_of, family_of, lives_in, works_at, travels_to, owns, participates_in

### `business`
Pour les documents business, études de marché, rapports financiers.
- **Entity types**: organization, person, metric, concept, risk, event, region, industry
- **Relation types**: works_at, manages, owns, influences, measures, concerns, operates_in, competes_with, partners_with, invests_in, authored_by, conducted_in

### `technical`
Pour la documentation technique, architecture logicielle.
- **Entity types**: service, api, database, component, protocol, technology, pattern, configuration
- **Relation types**: depends_on, calls, implements, extends, contains, configures, stores_in, communicates_with, inherits_from, uses

### `scientific`
Pour les articles scientifiques, publications académiques.
- **Entity types**: researcher, theory, study, finding, method, dataset, institution, publication
- **Relation types**: authored_by, cites, supports, contradicts, uses_method, affiliated_with, published_in, discovers, proposes, validates

### `legal`
Pour les documents juridiques, contrats, réglementations.
- **Entity types**: law, regulation, party, obligation, right, court, contract, clause
- **Relation types**: governs, obligates, grants_right, party_to, references, amends, enforces, violates, complies_with, interprets

## Exemples de requêtes

### Extraction basique avec fichier local

```bash
curl -X POST http://localhost:5678/webhook/knowledge-graph \
  -H "Content-Type: application/json" \
  -d '{
    "documentPath": "/home/user/documents/report.pdf",
    "preset": "business"
  }'
```

### Extraction depuis URL avec simplification

```bash
curl -X POST http://localhost:5678/webhook/knowledge-graph \
  -H "Content-Type: application/json" \
  -d '{
    "documentUrl": "https://example.com/whitepaper.pdf",
    "preset": "technical",
    "simplify": true,
    "maxNodes": 20
  }'
```

### Extraction complète avec analyse en français

```bash
curl -X POST http://localhost:5678/webhook/knowledge-graph \
  -H "Content-Type: application/json" \
  -d '{
    "documentPath": "/path/to/document.pdf",
    "preset": "business",
    "simplify": true,
    "analyze": true,
    "maxNodes": 25,
    "analysisLanguage": "fr"
  }'
```

### Extraction avec document base64

```bash
curl -X POST http://localhost:5678/webhook/knowledge-graph \
  -H "Content-Type: application/json" \
  -d '{
    "document": {
      "data": "JVBERi0xLjQKJ...",
      "mimeType": "application/pdf"
    },
    "configMode": "preset",
    "preset": "scientific"
  }'
```

### Configuration personnalisée

```bash
curl -X POST http://localhost:5678/webhook/knowledge-graph \
  -H "Content-Type: application/json" \
  -d '{
    "documentPath": "/path/to/document.pdf",
    "configMode": "jsonConfig",
    "configJson": {
      "entityTypes": ["product", "feature", "user", "problem"],
      "relationTypes": ["solves", "has_feature", "used_by", "depends_on"],
      "customInstructions": "Focus on product features and user problems"
    }
  }'
```

## Structure de la réponse

### Réponse basique (sans simplify ni analyze)

```json
{
  "graph": {
    "nodes": [
      {"id": 0, "name": "Entity Name", "type": "organization"},
      {"id": 1, "name": "Another Entity", "type": "person"}
    ],
    "edges": [
      {"source": 0, "target": 1, "type": "employs"}
    ]
  },
  "metadata": {
    "node_count": 2,
    "edge_count": 1,
    "language_detected": "en"
  }
}
```

### Réponse avec simplification

```json
{
  "graph": { ... },
  "metadata": { ... },
  "simplified": {
    "graph": {
      "nodes": [...],
      "edges": [...]
    },
    "metadata": {
      "original_node_count": 150,
      "original_edge_count": 200,
      "simplified_node_count": 30,
      "simplified_edge_count": 45,
      "simplification_method": "importance"
    },
    "key_entities": [
      {
        "id": 0,
        "name": "Key Entity",
        "type": "organization",
        "importance": "Central hub connecting 15 other entities"
      }
    ]
  }
}
```

### Réponse avec analyse

```json
{
  "graph": { ... },
  "metadata": { ... },
  "analysis": {
    "summary": "Ce graphe représente...",
    "key_findings": [
      "Finding 1...",
      "Finding 2..."
    ],
    "entity_statistics": {
      "total_entities": 150,
      "by_type": {
        "organization": 45,
        "person": 80,
        "metric": 25
      },
      "most_connected": [
        {"name": "Entity A", "connections": 15}
      ]
    },
    "relationship_statistics": {
      "total_relationships": 200,
      "by_type": {
        "works_at": 50,
        "manages": 30
      }
    },
    "clusters": [
      {
        "name": "Cluster Name",
        "description": "Description du cluster",
        "entities": ["Entity1", "Entity2"]
      }
    ],
    "insights": [
      "Insight 1...",
      "Insight 2..."
    ],
    "recommendations": [
      "Recommendation 1...",
      "Recommendation 2..."
    ]
  }
}
```

## Codes d'erreur

| Code | Description |
|------|-------------|
| 400 | Document non fourni ou format invalide |
| 500 | Erreur lors de l'extraction ou du traitement |

## Formats de documents supportés

- PDF (`application/pdf`)
- Texte brut (`text/plain`)
- HTML (`text/html`)
- CSV (`text/csv`)
- Markdown (`text/markdown`)
- Word DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
- Word DOC (`application/msword`)

## Visualisation du graphe

Le résultat JSON peut être visualisé avec le script Python inclus :

```bash
# HTML interactif
python scripts/graph_visualizer.py output.json --format html

# PDF statique
python scripts/graph_visualizer.py output.json --format pdf
```

## Export vers d'autres formats

Utilisez le script d'export pour convertir le graphe :

```bash
# RDF (Turtle)
python scripts/graph_exporter.py output.json --format rdf

# Cypher (Neo4j)
python scripts/graph_exporter.py output.json --format cypher

# GraphML (Gephi)
python scripts/graph_exporter.py output.json --format graphml

# GEXF (Gephi natif)
python scripts/graph_exporter.py output.json --format gexf

# JSON-LD
python scripts/graph_exporter.py output.json --format jsonld
```

## Notes d'implémentation

- Le workflow utilise Google Gemini 2.5 Flash par défaut
- `maxOutputTokens` est configuré à 32768 pour les documents volumineux
- La simplification utilise la méthode "importance" (basée sur les connexions)
- L'analyse est générée dans la langue spécifiée par `analysisLanguage`
