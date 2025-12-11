# Knowledge Graph MCP Server API

Documentation pour le serveur MCP Knowledge Graph accessible via webhook n8n.

## Endpoint

```
POST /webhook/knowledge-graph
```

## Vue d'ensemble

Ce workflow extrait des graphes de connaissances (entités et relations) à partir de documents ou textes en utilisant Google Gemini. Il supporte plusieurs presets, la simplification du graphe et l'analyse détaillée.

## Paramètres de la requête

### Source du document (l'un des trois est obligatoire)

| Paramètre | Type | Description |
|-----------|------|-------------|
| `documentPath` | string | Chemin local vers le fichier |
| `documentUrl` | string | URL du document à télécharger |
| `document` | object | Document en base64 (voir ci-dessous) |

#### Format document en base64

```json
{
  "document": {
    "data": "<base64_encoded_content>",
    "mimeType": "application/pdf"
  }
}
```

### Configuration de l'extraction

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `configMode` | string | `"preset"` | Mode de configuration: `"preset"`, `"custom"`, `"jsonConfig"` |
| `preset` | string | `"business"` | Preset à utiliser (si configMode = "preset") |
| `configJson` | object | `{}` | Configuration JSON personnalisée (si configMode = "jsonConfig") |

### Post-traitement

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `simplify` | boolean | `false` | Simplifier le graphe aux entités clés |
| `maxNodes` | number | `30` | Nombre max de nodes (si simplify = true) |
| `analyze` | boolean | `false` | Générer une analyse détaillée du graphe |
| `analysisLanguage` | string | `"en"` | Langue de l'analyse: `"en"`, `"fr"`, `"es"`, `"de"` |

## Presets disponibles

### `narrative`
Pour histoires, livres, récits.

| Types d'entités | Types de relations |
|-----------------|-------------------|
| character | allies_with |
| location | enemy_of |
| event | located_at |
| object | participates_in |
| | owns |

### `business`
Pour documents business, rapports d'entreprise, études de marché.

| Types d'entités | Types de relations |
|-----------------|-------------------|
| organization | competes_with |
| person | partners_with |
| metric | employs |
| concept | measures |
| strategy | impacts |
| risk | manages |

### `technical`
Pour documentation technique, architecture système.

| Types d'entités | Types de relations |
|-----------------|-------------------|
| service | depends_on |
| api | integrates_with |
| database | stores_in |
| component | exposes |
| protocol | implements |
| | communicates_via |

### `scientific`
Pour articles scientifiques, publications académiques.

| Types d'entités | Types de relations |
|-----------------|-------------------|
| researcher | authored_by |
| theory | cites |
| study | validates |
| finding | contradicts |
| method | builds_upon |
| | uses_method |

### `legal`
Pour documents juridiques, contrats, réglementations.

| Types d'entités | Types de relations |
|-----------------|-------------------|
| law | governs |
| regulation | complies_with |
| party | obligates |
| obligation | grants_right |
| right | references |
| | binds |

## Configuration JSON personnalisée

Pour le mode `jsonConfig`, format attendu:

```json
{
  "entityTypes": ["product", "feature", "user", "requirement"],
  "relationTypes": ["has_feature", "used_by", "requires", "depends_on"],
  "customInstructions": "Focus on user-facing features and their dependencies"
}
```

## Format de sortie

### Extraction basique (`buildGraph`)

```json
{
  "graph": {
    "nodes": [
      {"id": 1, "name": "Entity Name", "type": "organization"},
      {"id": 2, "name": "Another Entity", "type": "person"}
    ],
    "edges": [
      {"source": 1, "target": 2, "type": "employs"}
    ]
  },
  "metadata": {
    "node_count": 25,
    "edge_count": 40,
    "language_detected": "en"
  }
}
```

### Avec simplification (`simplify: true`)

```json
{
  "graph": { /* graphe original */ },
  "metadata": { /* métadonnées originales */ },
  "simplified": {
    "graph": {
      "nodes": [ /* nodes simplifiés */ ],
      "edges": [ /* edges simplifiés */ ]
    },
    "metadata": {
      "original_node_count": 50,
      "original_edge_count": 80,
      "simplified_node_count": 20,
      "simplified_edge_count": 35,
      "simplification_method": "importance"
    },
    "key_entities": [
      {"id": 1, "name": "Key Entity", "type": "organization", "importance": "high"}
    ]
  }
}
```

### Avec analyse (`analyze: true`)

```json
{
  "graph": { /* graphe */ },
  "metadata": { /* métadonnées */ },
  "analysis": {
    "summary": "Ce graphe représente un écosystème d'entreprises...",
    "key_findings": [
      "L'entité X est centrale dans le réseau",
      "Deux clusters principaux identifiés"
    ],
    "entity_statistics": {
      "total_entities": 25,
      "by_type": {"organization": 10, "person": 15},
      "most_connected": [
        {"name": "Company A", "connections": 12}
      ]
    },
    "relationship_statistics": {
      "total_relationships": 40,
      "by_type": {"employs": 15, "partners_with": 10}
    },
    "clusters": [
      {
        "name": "Tech Cluster",
        "description": "Groupe d'entreprises technologiques liées",
        "entities": ["Company A", "Company B", "Company C"]
      }
    ],
    "insights": [
      "Le réseau montre une forte centralisation autour de Company A",
      "Les relations de partenariat sont plus fréquentes que la concurrence"
    ],
    "recommendations": [
      "Explorer les connexions indirectes entre les clusters",
      "Analyser l'évolution temporelle des relations"
    ]
  }
}
```

## Exemples de requêtes

### Extraction basique depuis URL

```bash
curl -X POST http://localhost:5678/webhook/knowledge-graph \
  -H "Content-Type: application/json" \
  -d '{
    "documentUrl": "https://example.com/report.pdf",
    "configMode": "preset",
    "preset": "business"
  }'
```

### Depuis fichier local avec simplification

```bash
curl -X POST http://localhost:5678/webhook/knowledge-graph \
  -H "Content-Type: application/json" \
  -d '{
    "documentPath": "/path/to/document.pdf",
    "preset": "technical",
    "simplify": true,
    "maxNodes": 20
  }'
```

### Avec analyse complète en français

```bash
curl -X POST http://localhost:5678/webhook/knowledge-graph \
  -H "Content-Type: application/json" \
  -d '{
    "documentUrl": "https://example.com/article.pdf",
    "preset": "scientific",
    "simplify": true,
    "analyze": true,
    "analysisLanguage": "fr"
  }'
```

### Configuration personnalisée

```bash
curl -X POST http://localhost:5678/webhook/knowledge-graph \
  -H "Content-Type: application/json" \
  -d '{
    "documentUrl": "https://example.com/spec.pdf",
    "configMode": "jsonConfig",
    "configJson": {
      "entityTypes": ["feature", "component", "user_story"],
      "relationTypes": ["implements", "depends_on", "satisfies"],
      "customInstructions": "Focus on software requirements and their implementation"
    },
    "simplify": true,
    "maxNodes": 25
  }'
```

### Document en base64

```bash
curl -X POST http://localhost:5678/webhook/knowledge-graph \
  -H "Content-Type: application/json" \
  -d '{
    "document": {
      "data": "'$(base64 -w0 document.pdf)'",
      "mimeType": "application/pdf"
    },
    "preset": "business",
    "analyze": true
  }'
```

## Documents supportés

| Format | MIME Type | Description |
|--------|-----------|-------------|
| PDF | `application/pdf` | Documents PDF |
| TXT | `text/plain` | Fichiers texte |
| HTML | `text/html` | Pages web |
| CSV | `text/csv` | Données tabulaires |
| Markdown | `text/markdown` | Documentation |
| DOCX | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Documents Word |
| DOC | `application/msword` | Documents Word (ancien format) |

## Modèles disponibles

| Modèle | Description | Recommandé pour |
|--------|-------------|-----------------|
| `gemini-2.5-flash` | Rapide et efficace | Usage général (défaut) |
| `gemini-2.5-pro` | Plus précis | Documents complexes |

## Méthodes de simplification

| Méthode | Description |
|---------|-------------|
| `importance` | Garde les nodes avec le plus de connexions (défaut) |
| `centrality` | Garde les nodes centraux dans le graphe |
| `typePriority` | Priorise certains types d'entités |

## Codes d'erreur

| Code | Description |
|------|-------------|
| 400 | Aucun document fourni (ni path, ni URL, ni base64) |
| 400 | Type de document non supporté |
| 500 | Erreur de lecture du fichier local |
| 500 | Erreur de téléchargement de l'URL |
| 500 | Erreur de l'API Gemini |
| 500 | Timeout du traitement |

## Notes d'implémentation

- Le workflow utilise Google Gemini 2.5 Flash par défaut
- `maxOutputTokens` est configuré à 32768 par défaut
- Le timeout est de 10 minutes pour le traitement
- Les documents volumineux peuvent nécessiter le modèle `gemini-2.5-pro`
- La simplification utilise l'importance (nombre de connexions) par défaut

## Intégration avec MCP Server

Exemple d'outil MCP pour appeler ce workflow:

```typescript
{
  name: "extract_knowledge_graph",
  description: "Extract knowledge graph from a document",
  inputSchema: {
    type: "object",
    properties: {
      documentUrl: { type: "string", description: "URL of the document" },
      preset: {
        type: "string",
        enum: ["narrative", "business", "technical", "scientific", "legal"],
        default: "business"
      },
      simplify: { type: "boolean", default: false },
      maxNodes: { type: "number", default: 30 },
      analyze: { type: "boolean", default: false },
      analysisLanguage: {
        type: "string",
        enum: ["en", "fr", "es", "de"],
        default: "en"
      }
    },
    required: ["documentUrl"]
  }
}
```

## Voir aussi

- [Video Transcription MCP Server API](./video-transcription-mcp-server.md)
- [Guide de Test](./TESTING_GUIDE.md)
