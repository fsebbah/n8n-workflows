# RFC-032: MCP Tools Enricher - Indexation Sémantique des Tools

| Metadata | |
|----------|---------|
| **Auteur** | Claude Code |
| **Date** | 2026-03-06 |
| **Status** | Approved |
| **Dépendances** | Qdrant, Anthropic API, OpenAI API |
| **Révisé** | 2026-03-06 - Ajout operations READ/WRITE, structured output |

---

## 1. Contexte

### 1.1 Problème
- 165 workflows n8n actifs
- 93.3% sans description utile
- 100% sans tags
- 98.8% sans paramètres documentés
- Impossible de filtrer sémantiquement les tools avant de les passer au LLM
- **Pas de distinction READ vs WRITE** : "Quels sont mes emails?" déclenche l'envoi d'email au lieu de la lecture

### 1.2 Objectif
Enrichir automatiquement les métadonnées des tools et les indexer dans Qdrant pour permettre un pré-filtrage sémantique **avec détection du type d'opération (READ/WRITE)**.

---

## 2. Architecture Proposée

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MCP-Tools-Enricher                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────────────────────────────────────┐   │
│  │   Trigger    │    │           Batch Processor (5 en //)          │   │
│  │  (Manual /   │───▶│                                              │   │
│  │   Webhook)   │    │  ┌────────┐ ┌────────┐ ┌────────┐           │   │
│  └──────────────┘    │  │ WF #1  │ │ WF #2  │ │ WF #3  │ ...       │   │
│                      │  └───┬────┘ └───┬────┘ └───┬────┘           │   │
│                      └─────────────────────────────────────────────┘   │
│                                   │                                      │
│                                   ▼                                      │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Pour chaque workflow:                          │   │
│  │                                                                   │   │
│  │  1. Extract Info    2. Claude Analyze    3. GPT Validate          │   │
│  │  ┌─────────────┐    ┌─────────────────┐  ┌─────────────────┐     │   │
│  │  │ - nodes     │───▶│ Génère:         │─▶│ Valide/Corrige: │     │   │
│  │  │ - webhook   │    │ - description   │  │ - cohérence     │     │   │
│  │  │ - code      │    │ - category      │  │ - complétude    │     │   │
│  │  │ - HTTP URLs │    │ - keywords      │  │ - score 0-1     │     │   │
│  │  └─────────────┘    │ - use_cases     │  └────────┬────────┘     │   │
│  │                     └─────────────────┘           │              │   │
│  │                                                   ▼              │   │
│  │  4. Generate Embedding              5. Store in Qdrant           │   │
│  │  ┌─────────────────────┐           ┌─────────────────────┐      │   │
│  │  │ OpenAI text-embed-  │──────────▶│ Collection:         │      │   │
│  │  │ ding-3-small        │           │ tools_index         │      │   │
│  │  │                     │           │                     │      │   │
│  │  │ Input: description  │           │ Vector + Payload    │      │   │
│  │  │ + keywords + use_   │           └─────────────────────┘      │   │
│  │  │ cases concatenés    │                                        │   │
│  │  └─────────────────────┘                                        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Questions de Design

### 3.1 Traitement: Séquentiel vs Parallèle?

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| **Séquentiel (1 par 1)** | Simple, pas de rate limit | Lent (165 × ~5s = ~14 min) |
| **Parallèle (5 en //)** | Rapide (~3 min) | Gestion rate limits |
| **Parallèle (10 en //)** | Très rapide (~1.5 min) | Risque rate limit Anthropic |

**Recommandation:** `SplitInBatches` avec batch size = 5
- Anthropic: 60 req/min (Haiku) → 5 en // OK
- OpenAI: 3000 req/min → pas de souci

### 3.2 Double validation Claude + GPT?

**Pourquoi 2 LLMs:**
1. Claude génère (créatif, bon en analyse)
2. GPT valide (second avis, catch errors)

**Alternative plus simple:**
- Claude seul avec température basse (0.3)
- Self-check dans le même prompt

**✅ Décision: Claude seul avec Structured Output (tool_use)**

Utiliser l'API tool_use de Claude pour garantir un JSON valide:

```javascript
{
  "model": "claude-3-haiku-20240307",
  "tools": [{
    "name": "enrich_tool_metadata",
    "description": "Generate structured metadata for an n8n workflow tool",
    "input_schema": {
      "type": "object",
      "required": ["description", "category", "keywords", "use_cases", "operations"],
      "properties": {
        "description": { "type": "string", "maxLength": 100 },
        "category": { "type": "string", "enum": ["recherche", "traduction", "media", "documents", "email", "calendar", "database", "ai", "autre"] },
        "keywords": { "type": "array", "items": { "type": "string" }, "minItems": 5, "maxItems": 10 },
        "use_cases": { "type": "array", "items": { "type": "string" }, "minItems": 2, "maxItems": 4 },
        "operations": { "type": "array", "items": { "$ref": "#/$defs/operation" } }
      }
    }
  }]
}
```

Avantages:
- JSON garanti valide (pas de parsing errors)
- Schema validation côté API
- Plus rapide que double LLM

### 3.3 Structure Qdrant - Comment retrouver les tools?

#### Collection: `tools_index`

```javascript
{
  // Vecteur (1536 dims pour text-embedding-3-small)
  "id": "uuid-v4",
  "vector": [0.12, -0.34, ...],

  // Payload (filtrable + retournable)
  "payload": {
    // Identifiants (pour retrouver le tool)
    "workflow_id": "abc123",           // ID n8n
    "webhook_path": "news-searcher",   // Clé primaire pour matching
    "webhook_url": "http://pi6.local:5678/webhook/news-searcher",

    // Metadata générée par LLM
    "name": "MCP - News Searcher",
    "description": "Rechercher des actualités via l'API GNews",
    "category": "recherche",
    "keywords": ["news", "actualités", "articles", "presse", "GNews"],
    "use_cases": [
      "Trouver les dernières news sur un sujet",
      "Veille informationnelle",
      "Recherche d'articles récents"
    ],

    // ⭐ NOUVEAU: Operations avec type READ/WRITE
    "operations": [
      {
        "id": "search_news",
        "type": "READ",
        "verbs_fr": ["chercher", "rechercher", "trouver", "consulter"],
        "verbs_en": ["search", "find", "lookup", "query"]
      }
    ],

    // Pour filtrage
    "scope": "user",                   // user | admin | system
    "active": true,

    // Qualité & Cache
    "enrichment_score": 0.85,          // Score de confiance LLM
    "enriched_at": "2026-03-06T10:00:00Z",
    "enricher_version": "1.0",
    "workflow_hash": "sha256...",      // Pour détecter si workflow modifié
    "source_updated_at": "2026-03-05T..." // Date dernière modif workflow n8n
  }
}
```

#### Recherche

```javascript
// Requête: "je veux chercher des actualités sur la politique"
// 1. Embed la requête
// 2. Search dans Qdrant
{
  "vector": embed("je veux chercher des actualités sur la politique"),
  "limit": 10,
  "score_threshold": 0.6,
  "filter": {
    "must": [
      { "key": "active", "match": { "value": true } }
    ]
  },
  "with_payload": true
}

// Résultat: Top 10 tools pertinents avec scores
// → Passer ces tools à llm-intention au lieu des 165
```

---

## 4. Inputs/Outputs

### 4.1 Input (Webhook ou Manual Trigger)

```json
{
  "mode": "full" | "incremental",    // full = tous, incremental = nouveaux/modifiés
  "workflow_ids": ["abc", "def"],    // optionnel: liste spécifique
  "dry_run": false,                  // true = log sans écrire Qdrant
  "api_keys": {
    "anthropic": "sk-ant-...",
    "openai": "sk-..."
  }
}
```

### 4.2 Output

```json
{
  "success": true,
  "stats": {
    "total_workflows": 165,
    "processed": 165,
    "enriched": 160,
    "failed": 5,
    "skipped": 0
  },
  "errors": [
    { "workflow_id": "xyz", "error": "Rate limit exceeded" }
  ],
  "duration_ms": 180000
}
```

---

## 5. Prompts LLM

### 5.1 Claude - Génération Metadata (avec tool_use)

```
Tu es un expert en documentation d'APIs et workflows n8n.

Analyse ce workflow et génère des métadonnées structurées.

WORKFLOW:
- Nom: {{ workflow.name }}
- Webhook: {{ webhook.path }}
- Nodes: {{ nodes_summary }}
- Code samples: {{ code_snippets }}

Utilise l'outil `enrich_tool_metadata` pour générer les métadonnées.

RÈGLES:
- description: max 100 caractères, verbe à l'infinitif
- keywords: inclure synonymes FR et EN, termes connexes
- use_cases: phrases commençant par un verbe
- operations: identifier TOUTES les actions possibles du workflow
  - type READ: consulter, lire, chercher, lister, récupérer
  - type WRITE: créer, envoyer, modifier, supprimer
  - Inclure verbes FR et EN pour chaque opération
```

#### Schema de l'outil `enrich_tool_metadata`:

```json
{
  "name": "enrich_tool_metadata",
  "input_schema": {
    "type": "object",
    "required": ["description", "category", "keywords", "use_cases", "operations"],
    "properties": {
      "description": {
        "type": "string",
        "maxLength": 100,
        "description": "Description concise du workflow (verbe à l'infinitif)"
      },
      "category": {
        "type": "string",
        "enum": ["recherche", "traduction", "media", "documents", "email", "calendar", "database", "ai", "communication", "finance", "autre"]
      },
      "keywords": {
        "type": "array",
        "items": { "type": "string" },
        "minItems": 5,
        "maxItems": 15,
        "description": "Mots-clés FR et EN, synonymes inclus"
      },
      "use_cases": {
        "type": "array",
        "items": { "type": "string" },
        "minItems": 2,
        "maxItems": 5,
        "description": "Exemples concrets d'utilisation"
      },
      "operations": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["id", "type", "verbs_fr", "verbs_en"],
          "properties": {
            "id": { "type": "string", "description": "Identifiant unique (ex: list_emails, send_email)" },
            "type": { "type": "string", "enum": ["READ", "WRITE"] },
            "verbs_fr": { "type": "array", "items": { "type": "string" }, "minItems": 2 },
            "verbs_en": { "type": "array", "items": { "type": "string" }, "minItems": 2 }
          }
        },
        "minItems": 1,
        "description": "Liste des opérations supportées avec leurs verbes associés"
      }
    }
  }
}
```

#### Exemple de sortie pour mcp-gmail:

```json
{
  "description": "Gérer emails Gmail: lire, envoyer, rechercher, répondre",
  "category": "email",
  "keywords": ["email", "gmail", "google", "message", "courrier", "mail", "inbox", "boîte de réception", "envoyer", "lire"],
  "use_cases": [
    "Consulter les derniers emails reçus",
    "Envoyer un email professionnel",
    "Rechercher des emails par expéditeur ou sujet",
    "Répondre à un fil de discussion"
  ],
  "operations": [
    {
      "id": "list_emails",
      "type": "READ",
      "verbs_fr": ["lire", "consulter", "voir", "afficher", "récupérer", "obtenir"],
      "verbs_en": ["read", "list", "get", "fetch", "show", "display"]
    },
    {
      "id": "send_email",
      "type": "WRITE",
      "verbs_fr": ["envoyer", "expédier", "transmettre", "écrire"],
      "verbs_en": ["send", "mail", "deliver", "write"]
    },
    {
      "id": "search_emails",
      "type": "READ",
      "verbs_fr": ["chercher", "rechercher", "trouver", "retrouver"],
      "verbs_en": ["search", "find", "lookup", "query"]
    },
    {
      "id": "reply_email",
      "type": "WRITE",
      "verbs_fr": ["répondre", "répliquer"],
      "verbs_en": ["reply", "respond", "answer"]
    }
  ]
}
```

---

## 6. Workflow MCP-Tools-Filter (consommateur)

Une fois `tools_index` rempli, créer `MCP-Tools-Filter`:

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Requête   │────▶│  Embed Query    │────▶│  Qdrant Search  │
│ utilisateur │     │  (OpenAI)       │     │  tools_index    │
└─────────────┘     └─────────────────┘     └────────┬────────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │  Top 10 tools   │
                                            │  + scores       │
                                            └────────┬────────┘
                                                     │
                                                     ▼
                                            ┌─────────────────┐
                                            │  llm-intention  │
                                            │  (avec tools    │
                                            │   filtrés)      │
                                            └─────────────────┘
```

---

## 7. Plan d'implémentation

| Étape | Description | Estimation |
|-------|-------------|------------|
| 1 | Créer collection Qdrant `tools_index` | 5 min |
| 2 | Workflow `MCP-Tools-Enricher` | 1h |
| 3 | Test sur 10 workflows | 15 min |
| 4 | Run full (165 workflows) | 3 min |
| 5 | Workflow `MCP-Tools-Filter` | 30 min |
| 6 | Intégrer avec `llm-intention` | 15 min |

---

## 8. Questions ouvertes → Décisions

| Question | Décision |
|----------|----------|
| **Re-enrichissement** | Webhook on workflow save (n8n trigger) + cron hebdomadaire backup. Utiliser `workflow_hash` pour skip si inchangé. |
| **Versioning** | Oui, garder 3 dernières versions pour rollback facile. |
| **Fallback si Qdrant down** | Cache statique des 50 tools les plus utilisés. Max 15 tools passés au LLM. |
| **Score threshold** | **0.5** + toujours retourner TOP-10 minimum (même si score < 0.5) |

### 8.1 Logging pour optimisation

Logger toutes les requêtes pour tuning futur:

```json
{
  "timestamp": "2026-03-06T15:00:00Z",
  "query": "mes derniers emails",
  "results": [
    {"tool_id": "mcp-gmail", "score": 0.82},
    {"tool_id": "mcp-outlook", "score": 0.65}
  ],
  "user_selected": "mcp-gmail",
  "session_id": "abc123"
}
```

Après 100+ requêtes, analyser pour ajuster threshold.

---

## 9. Décisions validées

- [x] **Architecture approuvée** (avec ajout operations READ/WRITE)
- [x] **Claude seul** avec structured output (tool_use) - pas de double LLM
- [x] **Batch size 5** - bon compromis vitesse/rate limits
- [x] **Score threshold 0.5** + TOP-10 garanti + logging

---

## 10. Prochaines étapes (équipe n8n)

1. **Valider la faisabilité** d'extraire les infos des nodes n8n (Gmail node → actions disponibles)
2. **Créer le workflow** `MCP-Tools-Enricher` avec le schema tool_use
3. **Tester sur 10 workflows** avant run complet
4. **Créer le workflow** `MCP-Tools-Filter` pour le pré-filtrage Qdrant
5. **Intégrer** avec `llm-intention` existant
