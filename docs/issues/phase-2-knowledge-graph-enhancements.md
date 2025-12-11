# Phase 2 - Knowledge Graph Enhancements

## Overview

Suite au développement du node `n8n-nodes-knowledge-graph`, plusieurs améliorations et nouveaux nodes sont nécessaires pour offrir une chaîne complète de traitement des knowledge graphs.

## Nouveaux Nodes à Créer

### 1. `n8n-nodes-graph-transformer`

**Objectif** : Transformer, simplifier et manipuler les knowledge graphs.

**Operations** :

| Operation | Description | Input | Output |
|-----------|-------------|-------|--------|
| `simplify` | Réduire le graph aux relations essentielles | Graph JSON | Graph JSON simplifié |
| `merge` | Fusionner plusieurs graphs | Multiple Graph JSON | Graph JSON unique |
| `filter` | Filtrer par type d'entité ou relation | Graph JSON + critères | Graph JSON filtré |
| `cluster` | Regrouper les nœuds par communauté | Graph JSON | Graph JSON avec clusters |
| `rank` | Calculer l'importance des nœuds (PageRank) | Graph JSON | Graph JSON avec scores |

**Paramètres pour `simplify`** :
- `maxNodes` : Nombre max de nœuds à conserver
- `minEdgeWeight` : Poids minimum des relations
- `keepTypes` : Types d'entités à conserver obligatoirement
- `centralityMethod` : Méthode de calcul (degree, betweenness, pagerank)

---

### 2. `n8n-nodes-graph-exporter`

**Objectif** : Exporter les knowledge graphs vers différents formats.

**Operations** :

| Operation | Description | Output Format |
|-----------|-------------|---------------|
| `toRDF` | Export en RDF/Turtle | `.ttl` ou `.rdf` |
| `toOWL` | Export en ontologie OWL | `.owl` |
| `toGraphQL` | Générer un schema GraphQL | `.graphql` |
| `toCypher` | Générer des requêtes Neo4j Cypher | `.cypher` |
| `toGEXF` | Export pour Gephi | `.gexf` |
| `toGraphML` | Export GraphML standard | `.graphml` |
| `toCSV` | Export nodes.csv + edges.csv | `.zip` |

**Paramètres communs** :
- `namespace` : Namespace pour RDF/OWL
- `baseUri` : URI de base pour les entités
- `includeMetadata` : Inclure les métadonnées

---

### 3. `n8n-nodes-graph-analyzer`

**Objectif** : Analyser et générer des insights à partir des knowledge graphs.

**Operations** :

| Operation | Description | Output |
|-----------|-------------|--------|
| `summarize` | Générer une synthèse textuelle du graph | Markdown/Text |
| `findPaths` | Trouver les chemins entre deux entités | Liste de chemins |
| `detectPatterns` | Détecter des patterns récurrents | Liste de patterns |
| `generateReport` | Produire un rapport d'analyse complet | Markdown/PDF |
| `askQuestion` | Répondre à une question sur le graph (RAG) | Text |

**Paramètres pour `generateReport`** :
- `format` : markdown, html, pdf
- `sections` : [summary, entities, relationships, insights, recommendations]
- `language` : fr, en, es, etc.
- `llmModel` : Modèle à utiliser pour la génération

---

## Améliorations du Workflow Existant

### Workflow `Knowledge Graph Extraction` (e7YS4pgDKrxmvurW)

Ajouter des options de sortie conditionnelles :

```
Webhook → ... → Knowledge Graph → Switch (outputFormat)
                                      ├── json → Respond JSON
                                      ├── neo4j → Neo4j Insert → Respond Success
                                      ├── rdf → Graph Exporter (RDF) → Respond File
                                      ├── html → Graph Visualizer → Respond HTML
                                      └── report → Graph Analyzer → Respond Report
```

**Nouveaux paramètres webhook** :
```json
{
  "documentPath": "/path/to/doc.pdf",
  "configMode": "preset",
  "preset": "business",
  "outputFormat": "json|neo4j|rdf|html|report",
  "outputOptions": {
    "simplify": true,
    "maxNodes": 50,
    "generateReport": true,
    "reportLanguage": "fr"
  }
}
```

---

## Priorités

### Phase 2.1 (Court terme)
- [ ] Améliorer le node Knowledge Graph existant
  - [ ] Ajouter operation `simplifyGraph`
  - [ ] Ajouter operation `analyzeGraph`
- [ ] Créer script Python `graph_exporter.py` pour export RDF/Cypher

### Phase 2.2 (Moyen terme)
- [ ] Créer `n8n-nodes-graph-exporter`
- [ ] Créer `n8n-nodes-graph-transformer`
- [ ] Intégration Neo4j dans le workflow

### Phase 2.3 (Long terme)
- [ ] Créer `n8n-nodes-graph-analyzer`
- [ ] Interface front-end Vue.js pour visualisation
- [ ] MCP Server pour interaction avec les graphs

---

## Dépendances Techniques

### Python (scripts)
```
networkx>=3.0
rdflib>=6.0
matplotlib>=3.0
pyvis>=0.3.0
```

### Node.js (custom nodes)
```
n8n-nodes-google-genai-core (existant)
neo4j-driver (pour Neo4j)
```

---

## Fichiers Concernés

| Fichier | Action |
|---------|--------|
| `custom-nodes/n8n-nodes-knowledge-graph/` | Modifier |
| `custom-nodes/n8n-nodes-graph-exporter/` | Créer |
| `custom-nodes/n8n-nodes-graph-transformer/` | Créer |
| `custom-nodes/n8n-nodes-graph-analyzer/` | Créer |
| `workflows/knowledge-graph-workflow.json` | Modifier |
| `scripts/graph_visualizer.py` | Existant |
| `scripts/graph_exporter.py` | Créer |

---

## Références

- [RDFLib Documentation](https://rdflib.readthedocs.io/)
- [Neo4j Cypher Manual](https://neo4j.com/docs/cypher-manual/)
- [OWL Web Ontology Language](https://www.w3.org/OWL/)
- [GraphQL Schema](https://graphql.org/learn/schema/)
- [vis.js Network](https://visjs.github.io/vis-network/docs/network/)
