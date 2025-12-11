# Phase 2 : n8n-nodes-knowledge-graph

## Informations

| Champ | Valeur |
|-------|--------|
| **Priorité** | 2 |
| **Complexité** | ⭐⭐ Moyen |
| **Durée estimée** | 4-5 jours |
| **Dépendances** | Phase 1 (google-genai-core) |
| **Bloque** | Aucune (parallélisable avec Phase 3) |

---

## Objectif

Créer un node n8n pour l'extraction de graphes de connaissances depuis du texte :
- Extraction d'entités (personnages, lieux, organisations)
- Extraction de relations entre entités
- Construction de graphes structurés

**Source Colab** : `docs/colab/knowledge_graph_generation.ipynb`

---

## Documentation Obligatoire

> **AVANT DE COMMENCER** : Lire attentivement ces documents.

| Document | Chemin | Pourquoi |
|----------|--------|----------|
| Guide Custom Nodes | [`docs/n8n/CUSTOM_NODE_DEVELOPMENT.md`](../../n8n/CUSTOM_NODE_DEVELOPMENT.md) | Structure, installation, erreurs courantes |
| Colab Knowledge Graph | [`docs/colab/knowledge_graph_generation.ipynb`](../../colab/knowledge_graph_generation.ipynb) | Logique métier, prompts, schémas |
| Phase 1 | [PHASE-1-CORE.md](./PHASE-1-CORE.md) | Dépendance, comment utiliser le core |

---

## Livrables

### 1. Structure du package

```
custom-nodes/n8n-nodes-knowledge-graph/
├── package.json
├── tsconfig.json
├── nodes/
│   └── KnowledgeGraph/
│       ├── KnowledgeGraph.node.ts
│       ├── KnowledgeGraph.node.json    # UI metadata (optionnel)
│       ├── knowledge-graph.svg         # Icône
│       └── operations/
│           ├── extractEntities.ts
│           ├── extractRelationships.ts
│           └── buildGraph.ts
├── prompts/
│   ├── entity-extraction.txt
│   └── relationship-extraction.txt
└── README.md
```

### 2. Opérations du Node

#### Operation 1: Extract Entities

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `text` | Texte source (document, article, etc.) |
| **Input** | `entityTypes` | Types à extraire: `characters`, `locations`, `organizations`, `all` |
| **Input** | `language` | Langue du texte: `auto`, `fr`, `en`, etc. |
| **Output** | JSON | Liste d'entités avec ID, nom, type |

**Format de sortie :**
```json
{
  "entities": [
    {"id": 0, "name": "Jean Valjean", "type": "character"},
    {"id": 1, "name": "Paris", "type": "location"},
    {"id": 2, "name": "Police", "type": "organization"}
  ],
  "metadata": {
    "source_length": 5000,
    "language_detected": "fr",
    "entity_count": 3
  }
}
```

#### Operation 2: Extract Relationships

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `text` | Texte source |
| **Input** | `entities` | Liste d'entités (optionnel, sinon extraction auto) |
| **Output** | JSON | Liste de relations source → target avec type |

**Format de sortie :**
```json
{
  "relationships": [
    {"source": 0, "target": 1, "links": ["father_of", "protector_of"]},
    {"source": 0, "target": 2, "links": ["lives_in"]}
  ],
  "metadata": {
    "relationship_count": 2
  }
}
```

#### Operation 3: Build Graph

| Champ | Type | Description |
|-------|------|-------------|
| **Input** | `text` | Texte source |
| **Input** | `entityTypes` | Types à extraire |
| **Input** | `includeVisualization` | Générer une image du graphe |
| **Output** | JSON | Graphe complet (entités + relations) |

**Format de sortie :**
```json
{
  "graph": {
    "nodes": [
      {"id": 0, "name": "Jean Valjean", "type": "character"}
    ],
    "edges": [
      {"source": 0, "target": 1, "type": "father_of"}
    ]
  },
  "visualization": {
    "format": "png",
    "url": "gs://bucket/graphs/xxx.png"
  },
  "metadata": {
    "node_count": 5,
    "edge_count": 8
  }
}
```

---

## Interface n8n (UI)

### Paramètres du Node

```typescript
properties: [
  {
    displayName: 'Operation',
    name: 'operation',
    type: 'options',
    options: [
      { name: 'Extract Entities', value: 'extractEntities' },
      { name: 'Extract Relationships', value: 'extractRelationships' },
      { name: 'Build Graph', value: 'buildGraph' },
    ],
    default: 'buildGraph',
  },
  {
    displayName: 'Text',
    name: 'text',
    type: 'string',
    typeOptions: { rows: 10 },
    required: true,
    description: 'The text to analyze',
  },
  {
    displayName: 'Entity Types',
    name: 'entityTypes',
    type: 'multiOptions',
    options: [
      { name: 'Characters/People', value: 'characters' },
      { name: 'Locations', value: 'locations' },
      { name: 'Organizations', value: 'organizations' },
      { name: 'Concepts', value: 'concepts' },
    ],
    default: ['characters'],
    displayOptions: { show: { operation: ['extractEntities', 'buildGraph'] } },
  },
  {
    displayName: 'Language',
    name: 'language',
    type: 'options',
    options: [
      { name: 'Auto-detect', value: 'auto' },
      { name: 'French', value: 'fr' },
      { name: 'English', value: 'en' },
    ],
    default: 'auto',
  },
  {
    displayName: 'Include Visualization',
    name: 'includeVisualization',
    type: 'boolean',
    default: false,
    displayOptions: { show: { operation: ['buildGraph'] } },
    description: 'Generate a PNG visualization of the graph',
  },
]
```

---

## Critères d'Acceptation

### Fonctionnels

- [ ] Extract Entities retourne une liste d'entités JSON valide
- [ ] Extract Relationships retourne les relations entre entités
- [ ] Build Graph combine les deux opérations
- [ ] La visualisation génère une image PNG (optionnel)
- [ ] Support multilingue (au moins FR, EN)
- [ ] Gestion des textes longs (chunking si >100K tokens)

### Techniques

- [ ] Le node compile sans erreur
- [ ] Le node apparaît dans l'UI n8n
- [ ] Le type JSON est `n8n-nodes-knowledge-graph.knowledgeGraph`
- [ ] Dépendance `google-genai-core` fonctionne
- [ ] Tests unitaires (>80% coverage)

### Documentation

- [ ] README.md avec exemples
- [ ] Mise à jour de `docs/n8n/CUSTOM_NODE_DEVELOPMENT.md` si nouveaux problèmes

---

## Tests à Effectuer

### Tests Unitaires

```typescript
describe('KnowledgeGraph', () => {
  describe('extractEntities', () => {
    it('should extract characters from French text');
    it('should extract locations from English text');
    it('should handle empty text');
    it('should handle text with no entities');
  });

  describe('extractRelationships', () => {
    it('should find relationships between characters');
    it('should handle entities with no relationships');
  });

  describe('buildGraph', () => {
    it('should return complete graph structure');
    it('should generate visualization when requested');
  });
});
```

### Texte de Test (Les Misérables)

```
Jean Valjean, ancien forçat, est libéré du bagne de Toulon après dix-neuf ans
de détention. Rejeté par la société, il est accueilli par Monseigneur Myriel,
évêque de Digne. Valjean vole l'argenterie de l'évêque mais celui-ci le couvre
et lui offre en plus deux chandeliers. Ce geste de miséricorde transforme Valjean.
Des années plus tard, sous le nom de Monsieur Madeleine, il devient maire de
Montreuil-sur-Mer et industriel prospère. Il recueille Cosette, fille de Fantine,
une ouvrière morte de misère.
```

**Résultat attendu :**
- Entités : Jean Valjean, Monseigneur Myriel, Cosette, Fantine, Toulon, Digne, Montreuil-sur-Mer
- Relations : Valjean → Cosette (adopts), Fantine → Cosette (mother_of), etc.

---

## Risques et Mitigation

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Texte trop long (>context) | Bloquant | Chunking + fusion des résultats |
| Hallucinations Gemini | Moyen | Prompts précis, validation JSON |
| Visualisation complexe | Faible | Feature optionnelle, peut être reportée |

---

## Notes de Développement

### Configuration Gemini

```typescript
const config = {
  model: 'gemini-2.5-flash',
  temperature: 0.0,      // Déterministe
  topP: 0.0,
  seed: 42,              // Reproductibilité
  responseMimeType: 'application/json',
};
```

### Pourquoi ce node en Phase 2 ?

1. **Le plus simple** : Text in → JSON out, pas de binaires
2. **Pas de polling** : Réponse quasi-instantanée
3. **Valide l'architecture** : Teste la dépendance au core
4. **Valeur immédiate** : Utile pour l'analyse de documents

---

## Validation Finale

Avant de passer à la Phase 3, vérifier :

- [ ] Les 3 opérations fonctionnent
- [ ] Le node est visible dans n8n
- [ ] Un workflow peut utiliser ce node
- [ ] La documentation est à jour

---

## Liens

- **Issue précédente** : [Phase 1 - Core](./PHASE-1-CORE.md)
- **Issue suivante** : [Phase 3 - Video Transcription](./PHASE-3-VIDEO-TRANSCRIPTION.md)
- **Synthèse projet** : [`docs/gemini/SYNTHESE_MULTIMODALE_GEMINIV3.md`](../../gemini/SYNTHESE_MULTIMODALE_GEMINIV3.md)
