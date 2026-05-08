# RFC-085 : Skills Engine - Moteur de skills déclaratifs

| Métadonnée | Valeur |
|------------|--------|
| **Statut** | 🟡 Draft |
| **Auteur** | Équipe Azy-MCP |
| **Date** | 2026-05-08 |
| **Version** | 0.1.0 |
| **Dépendances** | RFC-040, RFC-072, RFC-083 |

---

## 1. Résumé

Cette RFC définit le **Skills Engine**, un moteur d'exécution de skills déclaratifs au format YAML frontmatter dans des fichiers Markdown. Un skill encapsule un pipeline multi-étapes (scripts, assets, appels LLM, stockage) qui peut être exécuté de manière unifiée via :

1. **API REST** (Azy-MCP serveur) pour chat.api et le frontend
2. **Protocole MCP** pour les plugins Discord et IDE
3. **Exécution locale** via Azy Local Agent pour les skills utilisateur

---

## 2. Motivation

### 2.1 Problèmes actuels

- Les workflows métier complexes (ex: génération de progression pédagogique) nécessitent une orchestration ad-hoc
- Pas de format standardisé pour définir des pipelines multi-étapes
- Les utilisateurs ne peuvent pas créer leurs propres automatisations
- Duplication de code entre les différents points d'entrée (REST, MCP, Discord)

### 2.2 Objectifs

1. **Standardisation** : Format déclaratif unique pour tous les skills
2. **Multi-runtime** : Exécution serveur (Azy-MCP) ou locale (Azy Local Agent)
3. **Extensibilité** : Les utilisateurs peuvent créer et partager des skills
4. **Traçabilité** : Chaque exécution est loggée et observable

---

## 3. Architecture

### 3.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SKILLS ENGINE                                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        SkillExecutor                                  │    │
│  │                                                                       │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │    │
│  │  │ SkillLoader │  │ SkillResolver│  │ StepHandlers│  │ TraceEmitter│  │    │
│  │  │ (YAML parse)│  │ ($refs)     │  │ (execute)   │  │ (observe)   │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  Step Handlers:                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  Script  │ │  Asset   │ │ LLM Call │ │ Storage  │ │ Anthropic│           │
│  │ (sandbox)│ │ (select) │ │ (webhook)│ │ (Drive)  │ │  Skills  │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │  REST API    │ │ MCP Protocol │ │ Local Agent  │
      │  /api/skills │ │ (stdio/WS)   │ │ (localhost)  │
      └──────────────┘ └──────────────┘ └──────────────┘
              │               │               │
              ▼               ▼               ▼
      ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
      │  chat.api    │ │  Plugins     │ │  Frontend    │
      │  Frontend    │ │  Discord/IDE │ │  (direct)    │
      └──────────────┘ └──────────────┘ └──────────────┘
```

### 3.2 Format de skill (YAML frontmatter)

```yaml
---
name: nom_du_skill
description: Description détaillée du skill
version: 0.1.0

parameters:
  param1:
    type: file | string | integer | enum | array | boolean
    required: true | false
    default: valeur_par_defaut
    values: [val1, val2]  # Pour enum
    pattern: "regex"      # Pour string
    description: Description du paramètre

pipeline:
  - id: step_id
    type: script | asset | llm_call | llm_call_with_anthropic_skill | storage
    # ... options spécifiques au type
    inputs:
      var: $params.param1
    outputs:
      result: json | text | file | url
    on_error: abort | skip | ask_user
    timeout_seconds: 60

returns:
  output_name: $steps.step_id.output_field
---

# Documentation Markdown du skill
...
```

### 3.3 Types de steps

| Type | Description | Options clés |
|------|-------------|--------------|
| `script` | Exécute un script Python sandboxé | `runtime`, `script`, `timeout_seconds` |
| `asset` | Charge un fichier statique avec sélection conditionnelle | `select.when/then/else` |
| `llm_call` | Appelle un LLM via webhook n8n (`text-generator`) | `model`, `system_prompt_file`, `user_prompt_file`, `context` — cf. §7.4.3 |
| `llm_call_with_anthropic_skill` | Appelle un LLM avec skills Anthropic (docx, etc.) | `anthropic_skills` |
| `storage` | Persiste un fichier sur Drive/MinIO | `target`, `file`, `metadata` |

### 3.4 Références supportées

| Préfixe | Description | Exemple |
|---------|-------------|---------|
| `$params` | Paramètres d'entrée du skill | `$params.zone` |
| `$steps` | Outputs des étapes précédentes | `$steps.parse.referentiel.niveau` |
| `$context` | Contexte d'exécution | `$context.tenant_id`, `$context.user_id` |
| `$tenant` | Données tenant | `$tenant.drive` |
| `$now` | Timestamp ISO courant | `$now` |

---

## 4. Endpoints REST (Azy-MCP)

### 4.1 Liste des skills

```http
GET /api/skills
```

**Response:**

```json
{
  "skills": [
    {
      "name": "progression_pedagogique",
      "description": "Construit une progression pédagogique annuelle...",
      "version": "0.1.0",
      "parameters": {
        "referentiel_pdf": { "type": "file", "required": true },
        "zone": { "type": "enum", "values": ["A", "B", "C"], "required": true }
      }
    }
  ]
}
```

### 4.2 Détail d'un skill

```http
GET /api/skills/{skill_name}
```

**Response:**

```json
{
  "name": "progression_pedagogique",
  "description": "...",
  "version": "0.1.0",
  "parameters": { ... },
  "pipeline": [
    { "id": "parse_referentiel", "type": "script" },
    { "id": "build_calendar", "type": "script" },
    { "id": "load_doctrine", "type": "asset" },
    { "id": "generate_progression", "type": "llm_call" },
    { "id": "render_docx", "type": "llm_call_with_anthropic_skill" },
    { "id": "persist_output", "type": "storage" }
  ],
  "returns": ["summary_md", "docx_url", "warnings"]
}
```

### 4.3 Exécution d'un skill

```http
POST /api/skills/{skill_name}/execute
Content-Type: application/json
X-Tenant-ID: tenant-123
X-User-ID: user-456
```

**Request:**

```json
{
  "params": {
    "referentiel_pdf": "base64://...",
    "zone": "A",
    "annee_scolaire": "2025-2026",
    "jour_de_cours": "lundi",
    "duree_seance_minutes": 60
  },
  "options": {
    "stream": false,
    "trace": true
  }
}
```

**Response (synchrone):**

```json
{
  "success": true,
  "returns": {
    "summary_md": "## Progression Mathématiques 6e\n\n...",
    "docx_url": "https://drive.google.com/...",
    "warnings": []
  },
  "metadata": {
    "skill_name": "progression_pedagogique",
    "duration_ms": 45230,
    "steps_completed": 6,
    "correlation_id": "skill-exec-abc123"
  }
}
```

### 4.4 Exécution streamée (WebSocket)

```http
WS /api/skills/{skill_name}/execute/stream
```

**Messages (Server → Client):**

```json
{ "type": "step_start", "step_id": "parse_referentiel", "timestamp": 1715180400 }
{ "type": "step_progress", "step_id": "parse_referentiel", "progress": 50 }
{ "type": "step_complete", "step_id": "parse_referentiel", "duration_ms": 1234 }
{ "type": "step_start", "step_id": "generate_progression", "timestamp": 1715180401 }
{ "type": "llm_token", "step_id": "generate_progression", "token": "La progression" }
{ "type": "skill_complete", "success": true, "returns": { ... } }
```

### 4.5 Statut d'exécution

```http
GET /api/skills/executions/{execution_id}
```

**Response:**

```json
{
  "execution_id": "skill-exec-abc123",
  "skill_name": "progression_pedagogique",
  "status": "running",
  "current_step": "generate_progression",
  "steps": [
    { "id": "parse_referentiel", "status": "completed", "duration_ms": 1234 },
    { "id": "build_calendar", "status": "completed", "duration_ms": 567 },
    { "id": "generate_progression", "status": "running", "progress": 30 }
  ],
  "started_at": "2025-05-08T10:00:00Z"
}
```

---

## 5. Intégration MCP Protocol (Plugins)

### 5.1 Tool MCP `skill_execute`

Les plugins (Discord, IDE) peuvent exécuter des skills via le protocole MCP standard.

**Tool Definition:**

```json
{
  "name": "skill_execute",
  "description": "Execute a declarative skill pipeline",
  "inputSchema": {
    "type": "object",
    "properties": {
      "skill_name": {
        "type": "string",
        "description": "Name of the skill to execute"
      },
      "params": {
        "type": "object",
        "description": "Skill parameters"
      }
    },
    "required": ["skill_name", "params"]
  }
}
```

**Exemple d'appel MCP:**

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "skill_execute",
    "arguments": {
      "skill_name": "progression_pedagogique",
      "params": {
        "referentiel_pdf": "file:///path/to/referentiel.pdf",
        "zone": "A",
        "annee_scolaire": "2025-2026",
        "jour_de_cours": "lundi"
      }
    }
  },
  "id": 1
}
```

### 5.2 Tool MCP `skill_list`

```json
{
  "name": "skill_list",
  "description": "List available skills",
  "inputSchema": {
    "type": "object",
    "properties": {
      "category": {
        "type": "string",
        "description": "Filter by category (optional)"
      }
    }
  }
}
```

### 5.3 Intégration Chatbot-Core

```python
# Dans chatbot-core/src/mcp_client.py

class MCPClient:
    async def execute_skill(
        self,
        skill_name: str,
        params: dict,
        user_id: str,
        tenant_id: str,
    ) -> dict:
        """Execute a skill via MCP protocol."""
        return await self.call_tool(
            "skill_execute",
            {
                "skill_name": skill_name,
                "params": params,
            },
            context={
                "user_id": user_id,
                "tenant_id": tenant_id,
            },
        )
```

---

## 6. Skills Utilisateur

### 6.1 Sources de skills

| Source | Emplacement | Exécution | Sécurité |
|--------|-------------|-----------|----------|
| **System** | `skills/` (repo Azy-MCP) | Azy-MCP serveur | Contrôlée (code review) |
| **Tenant** | Base de données (par tenant) | Azy-MCP serveur | Sandboxée |
| **User Local** | `~/azy-workspace/skills/` | Azy Local Agent | Locale (machine user) |

### 6.2 Upload de skills (via chat.api)

```http
POST /api/skills/upload
Content-Type: multipart/form-data
Authorization: Bearer <firebase_jwt>
```

**Form data:**

- `skill_archive`: Fichier ZIP contenant le skill
- `visibility`: `private` | `tenant` | `public` (défaut: `private`)

**Structure du ZIP:**

```
mon_skill.zip
├── skill.md           # Définition du skill (obligatoire)
├── scripts/
│   └── *.py           # Scripts Python
├── prompts/
│   └── *.md           # Prompts LLM
├── references/
│   └── *.md           # Assets texte
└── assets/
    └── *              # Autres assets
```

**Validation côté chat.api:**

1. Vérification structure ZIP
2. Parse et validation du frontmatter YAML
3. Scan sécurité des scripts Python (imports interdits, exec/eval, etc.)
4. Stockage en base (table `user_skills`)
5. Notification Azy-MCP pour rechargement

**Response:**

```json
{
  "success": true,
  "skill_id": "user-skill-abc123",
  "skill_name": "mon_skill",
  "validation": {
    "warnings": ["Script uses deprecated function 'foo'"],
    "security_score": 95
  }
}
```

### 6.3 Exécution locale (Azy Local Agent)

> **Cette section a été enrichie suite aux échanges entre l'équipe Azy Local Agent
> et l'équipe Azy-MCP (2026-05-08).** Voir aussi `docs/issues/016-FEATURE-azy-mcp-skills-integration.md`
> pour la trace de l'analyse.

Pour les skills utilisateur exécutés **localement** sur la machine de l'utilisateur :

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐
│ Frontend        │     │ Azy Local Agent  │     │ Ressources        │
│ app.azy.solutions│────▶│ localhost:11500  │────▶│ locales           │
└─────────────────┘     └──────────────────┘     │                   │
                                │                 │ - Ollama (LLM)    │
                                │                 │ - ~/azy-workspace │
                                │                 │ - Filesystem user │
                                ▼                 └───────────────────┘
                        ┌──────────────────┐
                        │ SkillExecutor    │
                        │ (azy_mcp.skills) │
                        └──────────────────┘
```

#### 6.3.1 Principes architecturaux (validés)

Cinq principes spécifiques à l'intégration locale, qui peuvent diverger du
design de référence côté Azy-MCP :

| # | Principe | Détail |
|---|----------|--------|
| 1 | **Le client décide tout** | Provider, modèle, path des skills → tout vient du payload de la requête. Pas de défaut hardcodé côté agent. |
| 2 | **Pas de variable d'env** pour le path | Le frontend passe `path` à chaque appel (ex. `~/azy-workspace/skills` choisi par le user dans son UI). Pas de `SKILLS_BASE_PATH`. |
| 3 | **Pas de mapping `model_tier → modèle`** | Le client choisit le modèle Ollama explicitement. Pas de fallback "intelligent" côté agent. |
| 4 | **Le local agent n'appelle PAS chat.api** | Conformément à `SYSTEM-ARCHITECTURE.md §2.8.11`. Pour les calls cloud, c'est le **frontend** qui orchestre vers `chat.api` (cf. §6.5 Exécution hybride). |
| 5 | **Pas d'exclusion PyInstaller** | Les deps transitives `langchain_openai`, `langchain_anthropic`, `redis`, `qdrant_client` sont embarquées (sinon `azy_mcp` ne s'importe pas) mais **ne sont pas appelées directement** par l'agent. |

#### 6.3.2 Capacités d'exécution côté local agent

L'agent local exécute en local **uniquement** les types de step dont les
ressources sont sur la machine du user :

| Type de step | Exécution locale ? | Mécanisme |
|--------------|-------------------|-----------|
| `script` (Python sandbox) | ✅ Oui | `azy_mcp.skills.steps.script.ScriptStepHandler` — subprocess isolé, JSON stdin/stdout, timeout |
| `asset` (fichier statique) | ✅ Oui | Lecture filesystem du skill |
| `llm_call` avec `target: local` | ✅ Oui (Ollama) | Wrapper Ollama via `langchain_ollama.ChatOllama` ou call REST direct |
| `llm_call` avec `target: cloud` | ❌ Non | Routé via le frontend → `chat.api` (cf. §6.5) |
| `storage` cible filesystem local | ✅ Oui | Écriture dans le workspace user (sandbox `~/azy-workspace`) |
| `storage` cible Drive/MinIO cloud | ❌ Non | Idem `llm_call cloud` : orchestré par le frontend |

**Justification du découplage** : Azy garde la maîtrise des appels cloud
(billing, audit, rate limit, observabilité). Si l'agent local appelait
directement les providers cloud avec des clés API embarquées, cette
visibilité serait perdue.

#### 6.3.3 Endpoints Azy Local Agent

**Auth** : Bearer token (token de pairing, identique aux autres endpoints
protégés de l'agent — cf. `SYSTEM-ARCHITECTURE.md §2.8.2`).
**Rate limit proposé** : `skills_execute = 10/min` (10 exécutions de skill par
minute par token). À valider.

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/skills` | GET | Liste les skills présents dans le path (query param `?path=...`) |
| `/api/skills/{name}` | GET | Détails d'un skill (frontmatter, pipeline, params) |
| `/api/skills/{name}/execute` | POST | Exécute le skill avec le provider/modèle fournis dans le body |

**Format de requête `POST /api/skills/{name}/execute`** :

```json
{
  "path": "/home/user/azy-workspace/skills",
  "provider": "ollama",
  "model": "llama3.2",
  "params": {
    "referentiel_pdf": "<base64>",
    "zone": "B"
  },
  "extra": {
    "ollama_host": "http://localhost:11434"
  }
}
```

- `path` (str, required) : répertoire des skills sur le poste user (le
  frontend l'a obtenu de l'UI ou d'un endpoint `GET /api/skills`).
- `provider` (str, required) : pour cette PR initiale, **uniquement
  `ollama`** est supporté ; les valeurs cloud renverront 400 avec un message
  invitant le frontend à orchestrer via chat.api.
- `model` (str, required) : nom du modèle (ex. `llama3.2`, `qwen3:4b`).
- `params` (dict, required) : paramètres métier passés au skill.
- `extra` (dict, optional) : provider-specific (ex. `ollama_host`).

**Format de réponse** : `SkillResult` sérialisé (`success`, `returns`,
`errors`, `warnings`, `duration_ms`, `metadata`).

#### 6.3.4 Streaming (à statuer)

Les skills peuvent durer plusieurs minutes. Trois options envisagées,
**décision à prendre** :

| Option | Description | Compatibilité cliente |
|--------|-------------|----------------------|
| **A.** SSE | `POST /api/skills/{name}/execute/stream` qui streame `step_start`, `step_progress`, `llm_token`, `step_complete`, `skill_complete` | Bonne (déjà utilisée par les autres endpoints SSE de l'agent) |
| **B.** Polling | `POST /api/skills/{name}/execute` retourne immédiatement un `task_id`, `GET /api/skills/tasks/{task_id}` interroge l'état | Plus simple, moins riche (pas de tokens LLM streamés) |
| **C.** WebSocket | `WS /api/skills/{name}/execute/stream` (cf. §4.4 Azy-MCP) | Cohérent avec Azy-MCP mais plus lourd côté local agent |

**Préférence locale** : Option A (SSE) pour cohérence avec
`/api/generate/stream` et `/api/vision/stream` qui sont déjà SSE dans
l'agent.

#### 6.3.5 Discoverability local → frontend

Le frontend doit pouvoir afficher les skills locaux du user dans l'UI web.
**Pas de nouvel endpoint nécessaire** : `GET /api/skills?path=...` couvre
le besoin. Le frontend appelle quand il veut rafraîchir, et c'est lui qui se
charge de remonter ces noms au cloud (marketplace future) si pertinent.

**Volume** : juste les noms (+ description / version), pas le contenu.

#### 6.3.6 Avantages de l'exécution locale

- Accès direct aux fichiers locaux (`~/azy-workspace`)
- LLM local via Ollama (gratuit, privé, latence faible pour petits modèles)
- Confidentialité : les documents sensibles ne quittent pas la machine
- Continuité de service : skills locaux exécutables même si chat.api est
  indisponible (offline)

### 6.4 Synchronisation Cloud ↔ Local

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SKILL SYNC FLOW                               │
│                                                                      │
│  ┌───────────────┐                        ┌───────────────────────┐ │
│  │ chat.api      │                        │ Azy Local Agent       │ │
│  │ (cloud)       │                        │ (machine user)        │ │
│  └───────┬───────┘                        └───────────┬───────────┘ │
│          │                                            │             │
│          │  1. User téléverse skill.zip               │             │
│          ▼                                            │             │
│  ┌───────────────┐                                    │             │
│  │ Validation +  │                                    │             │
│  │ Stockage DB   │                                    │             │
│  └───────┬───────┘                                    │             │
│          │                                            │             │
│          │  2. Frontend demande sync                  │             │
│          │     (bouton "Télécharger pour usage local")│             │
│          ▼                                            ▼             │
│  ┌───────────────┐     GET /api/skills/{id}/download  ┌─────────┐  │
│  │ chat.api      │ ◀─────────────────────────────────│ Frontend │  │
│  └───────┬───────┘                                   └────┬────┘  │
│          │                                                │        │
│          │  3. ZIP retourné                               │        │
│          ▼                                                ▼        │
│  ┌───────────────┐     POST localhost:11500/api/skills/install     │
│  │ Skill ZIP     │ ──────────────────────────────────────────────▶ │
│  └───────────────┘                                    ┌─────────┐  │
│                                                       │ Local   │  │
│                                                       │ Agent   │  │
│          4. Skill installé dans ~/azy-workspace/skills/           │
│                                                       └─────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.5 Exécution hybride

Un skill peut être configuré pour utiliser des ressources hybrides :

```yaml
---
name: analyse_document_privé
description: Analyse un document avec LLM local pour confidentialité

pipeline:
  - id: parse_document
    type: script
    runtime: python-sandbox
    script: scripts/parse_document.py

  - id: analyse_confidentielle
    type: llm_call
    target: local                    # ← Exécution via Ollama local
    model: llama3.2:latest           # Modèle Ollama
    user_prompt_file: prompts/analyse.md
    context:
      document: $steps.parse_document.content

  - id: enrichissement
    type: llm_call
    target: cloud                    # ← Exécution via n8n/Anthropic
    model_tier: sonnet
    user_prompt_file: prompts/enrichir.md
    context:
      analyse: $steps.analyse_confidentielle.result

returns:
  rapport: $steps.enrichissement.result
---
```

#### 6.5.1 Orchestration des skills hybrides — décision Azy Local Agent

> ⚠️ **Point d'architecture important — à valider avec les équipes Frontend
> et Backend API.**

Suite aux échanges entre les équipes (2026-05-08), la décision côté local
agent est : **les steps avec `target: cloud` ne sont PAS exécutés par
l'agent local**. C'est le **frontend** qui orchestre l'appel à `chat.api`
pour ces steps.

**Question ouverte** : comment le frontend orchestre-t-il un skill hybride
qui mêle steps locaux et steps cloud, alors que le `SkillExecutor` est
conçu pour exécuter un pipeline d'un bloc avec partage de variables
(`$steps.parse_document.content`) ?

Trois options à arbitrer :

| Option | Description | Avantages | Inconvénients |
|--------|-------------|-----------|---------------|
| **A. Pré-orchestration côté frontend** | Le frontend lit le skill, identifie les steps locaux/cloud, exécute step par step en alternant local agent ↔ chat.api, gère lui-même le passage de variables | Pas de modification de l'agent | Le frontend doit savoir interpréter le pipeline ; risque de divergence avec le `SkillExecutor` du package |
| **B. Pause/reprise côté local agent** | Le local agent exécute jusqu'à un step `target: cloud`, retourne `{state, cloud_step}` au frontend, qui appelle chat.api puis renvoie le résultat à un endpoint `POST /api/skills/{name}/resume` | Pipeline cohérent | Stateful côté agent ; complexité de sérialisation de l'état |
| **C. Skills mono-target uniquement** | On interdit les skills hybrides : un skill est entièrement local OU entièrement cloud | Simple à implémenter | Perd le cas d'usage "parse local + enrich cloud" |

**À cadrer avec les équipes Front + Backend API + MCP avant l'implémentation
des skills hybrides.** Pour la PR initiale d'intégration local agent, seuls
les skills entièrement locaux (`target: local` partout) seront supportés —
ce qui revient à l'option C en transitoire. Les skills hybrides seront
adressés dans une PR ultérieure.

---

## 7. Sécurité

### 7.1 Sandbox Python

Les scripts Python sont exécutés dans un environnement sandboxé :

| Contrôle | Implémentation |
|----------|----------------|
| **Imports interdits** | `os.system`, `subprocess`, `eval`, `exec`, `__import__`, `open` (hors sandbox) |
| **Timeout** | Configurable par step (défaut: 60s) |
| **Mémoire** | Limite 512 MB par exécution |
| **Filesystem** | Accès restreint au dossier du skill |
| **Réseau** | Désactivé (sauf whitelist explicite) |

### 7.2 Validation des skills utilisateur

Avant acceptation d'un skill uploadé :

1. **Analyse statique** : Parse AST Python, détection patterns dangereux
2. **Scan antivirus** : ClamAV sur les binaires
3. **Limite de taille** : Max 10 MB par skill
4. **Review automatique** : Score de confiance basé sur les patterns détectés

### 7.3 Isolation tenant

- Les skills tenant sont isolés par `tenant_id`
- Un tenant ne peut pas accéder aux skills d'un autre tenant
- Les skills `public` sont copiés (pas de référence partagée)

### 7.4 Contrôle des appels LLM (anti-bypass API key)

> **Préoccupation principale** : Comment garantir que les appels LLM passent par
> l'infrastructure Azy (billing, audit, rate limit) et empêcher l'utilisateur
> de bypass avec sa propre API key ?

#### 7.4.1 Principe fondamental

**Les skills ne peuvent JAMAIS spécifier directement des credentials LLM.**
Tous les appels LLM cloud sont routés via **n8n**, qui détient les credentials
et applique les contrôles.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Skill      │     │  Azy-MCP     │     │    n8n       │     │  Provider    │
│  (déclare    │────▶│  SkillExec   │────▶│  /webhook/   │────▶│  (Anthropic, │
│  model_tier) │     │              │     │  llm-request │     │   OpenAI)    │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                                                │
                                                ▼
                                         ┌──────────────┐
                                         │  Contrôles   │
                                         │  n8n :       │
                                         │  - Credentials│
                                         │  - Rate limit │
                                         │  - Billing    │
                                         │  - Audit log  │
                                         └──────────────┘
```

#### 7.4.2 Champs autorisés vs interdits dans les skills

| Champ | Statut | Exemple |
|-------|--------|---------|
| `model_tier` | ✅ Autorisé | `model_tier: sonnet` |
| `target` | ✅ Autorisé | `target: cloud` ou `target: local` |
| `webhook` | ✅ Autorisé | `webhook: llm-request` |
| `api_key` | ❌ **INTERDIT** | Rejeté au parsing |
| `anthropic_api_key` | ❌ **INTERDIT** | Rejeté au parsing |
| `openai_api_key` | ❌ **INTERDIT** | Rejeté au parsing |
| `provider_url` | ❌ **INTERDIT** | Rejeté au parsing |

**Validation côté SkillLoader :**

```python
FORBIDDEN_FIELDS = [
    "api_key", "apikey", "api-key",
    "anthropic_api_key", "openai_api_key",
    "provider_url", "base_url", "endpoint",
    "secret", "token", "credential",
]

def validate_step(step: dict) -> None:
    for field in FORBIDDEN_FIELDS:
        if field in step:
            raise SkillValidationError(
                f"Champ interdit '{field}' dans le step '{step['id']}'. "
                "Les credentials sont gérés par n8n."
            )
```

#### 7.4.3 Webhook n8n existant : `text-generator`

> **Le webhook existe déjà** : `POST /webhook/text-generator`
> Workflow : `MCP - Text Generator`

Ce webhook est le point d'entrée unifié pour les appels LLM depuis les skills.
Les credentials sont gérés côté n8n (credential store), jamais exposés au caller.

**Input Schema :**

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `prompt` | string | ✅ | Prompt utilisateur |
| `system_prompt` | string | ❌ | Instructions système pour le modèle |
| `model` | string | ❌ | `gpt-4o` (défaut), `gpt-4o-mini`, `gpt-4-turbo` |
| `temperature` | number | ❌ | 0-2 (défaut: 0.7) |
| `max_tokens` | integer | ❌ | Défaut: 2048 |
| `user_id` | string | ❌ | ID utilisateur pour tracing |
| `guild_id` | string | ❌ | ID guild pour tracing |

**Exemple de payload depuis un skill :**

```json
{
  "prompt": "Génère une progression pédagogique pour...",
  "system_prompt": "Tu es un assistant pédagogique expert en création de programmes.",
  "model": "gpt-4o",
  "max_tokens": 4096,
  "user_id": "user-456",
  "guild_id": "guild-789"
}
```

**Output :**

```json
{
  "text": "## Progression Mathématiques 6e\n\n...",
  "model": "gpt-4o",
  "finish_reason": "stop"
}
```

**Sécurité côté n8n :**
- Les credentials OpenAI/Anthropic sont stockés dans le **credential store n8n**
- Le workflow utilise ces credentials via des références (`{{ $credentials.openAiApi.apiKey }}`)
- Les credentials ne sont **jamais** retournés dans la réponse
- Le `user_id` et `guild_id` permettent l'audit et le rate limiting

#### 7.4.4 Sandbox réseau renforcé (scripts Python)

En complément de la section 7.1, les imports réseau et SDK LLM sont
**explicitement bloqués** pour empêcher tout appel direct depuis un script :

```python
BLOCKED_NETWORK_IMPORTS = [
    # Clients HTTP
    "requests", "httpx", "urllib", "urllib3", "aiohttp", "http.client",
    # Réseau bas niveau
    "socket", "ssl", "asyncio.open_connection",
    # SDK LLM (appel direct interdit)
    "openai", "anthropic", "langchain", "langchain_openai",
    "langchain_anthropic", "litellm", "cohere", "replicate",
    # Cloud providers
    "boto3", "google.cloud", "azure",
]
```

**Justification** : Un script malveillant ne peut pas contourner le système
en important directement le SDK Anthropic avec une API key hardcodée.

#### 7.4.5 Cas de l'exécution locale (Ollama)

Pour les skills avec `target: local`, l'appel LLM passe par **Ollama** sur la
machine de l'utilisateur :

- ✅ Gratuit (pas de billing)
- ✅ Privé (données locales)
- ✅ Pas de credentials cloud nécessaires

```yaml
- id: analyse_locale
  type: llm_call
  target: local           # Exécution via Ollama
  model: llama3.2         # Modèle local
```

Dans ce cas, l'utilisateur utilise ses propres ressources — pas de bypass
possible car il n'y a pas de service cloud à protéger.

---

## 8. Observabilité

### 8.1 Traces

Chaque exécution émet des traces structurées :

```json
{
  "trace_id": "skill-exec-abc123",
  "skill_name": "progression_pedagogique",
  "tenant_id": "tenant-123",
  "user_id": "user-456",
  "spans": [
    {
      "span_id": "span-1",
      "name": "parse_referentiel",
      "start_time": 1715180400000,
      "end_time": 1715180401234,
      "status": "ok",
      "attributes": {
        "input_size_bytes": 102400,
        "output_keys": ["referentiel"]
      }
    }
  ]
}
```

### 8.2 Métriques Prometheus

```
# Exécutions de skills
skill_executions_total{skill_name="...", status="success|error"} counter
skill_execution_duration_seconds{skill_name="..."} histogram

# Steps
skill_step_duration_seconds{skill_name="...", step_id="...", type="..."} histogram
skill_step_errors_total{skill_name="...", step_id="...", error_type="..."} counter

# LLM calls
skill_llm_tokens_total{skill_name="...", model="..."} counter
skill_llm_cost_dollars{skill_name="...", model="..."} counter
```

---

## 9. Migration et Rétrocompatibilité

### 9.1 Phase 1 : Skills système (semaine 1-2)

- Implémentation SkillExecutor dans Azy-MCP
- Endpoints REST `/api/skills/*`
- Skill `progression_pedagogique` comme POC

### 9.2 Phase 2 : Intégration MCP (semaine 3)

- Tools MCP `skill_execute`, `skill_list`
- Intégration chatbot-core
- Tests avec plugins Discord

### 9.3 Phase 3 : Skills utilisateur (semaine 4-5)

- Upload via chat.api
- Validation et sandbox
- UI frontend pour gestion des skills

### 9.4 Phase 4 : Exécution locale (semaine 6-8)

- Intégration Azy Local Agent
- Sync cloud ↔ local
- Exécution hybride (local + cloud)

---

## 10. Fichiers à créer/modifier

### 10.1 Nouveaux fichiers (Azy-MCP)

```
src/mcp_server/skills/
├── __init__.py
├── models.py           # Modèles Pydantic
├── loader.py           # Parse YAML frontmatter
├── resolver.py         # Résolution $refs
├── executor.py         # Orchestration pipeline
└── steps/
    ├── __init__.py
    ├── base.py         # StepHandler abstrait
    ├── script.py       # ScriptStepHandler
    ├── asset.py        # AssetStepHandler
    ├── llm_call.py     # LLMCallStepHandler
    └── storage.py      # StorageStepHandler
```

### 10.2 Nouveaux fichiers (API routes)

```
src/mcp_server/api/
└── skills_routes.py    # Endpoints REST /api/skills/*
```

### 10.3 Modifications (chat.api)

```
app/api_routes/
└── skills/
    ├── __init__.py
    ├── upload.py       # POST /api/skills/upload
    ├── manage.py       # CRUD skills utilisateur
    └── sync.py         # Sync avec Azy Local Agent

app/services/
└── skills/
    ├── validator.py    # Validation skills uploadés
    └── sandbox.py      # Analyse sécurité scripts
```

### 10.4 Modifications (Azy Local Agent)

> Mise à jour 2026-05-08 suite à l'analyse côté Local Agent. Voir aussi
> `docs/issues/016-FEATURE-azy-mcp-skills-integration.md`.

**Code à créer** :

```
app/skills/
├── __init__.py
├── executor.py         # Helper qui instancie SkillExecutor par requête
│                       # (pas de subclass forçant des défauts ; pas de cache global)
├── ollama_handler.py   # LLMCallStepHandler custom : route uniquement
│                       # provider=ollama. Cloud → 400 avec message clair.
└── routes.py           # 3 endpoints REST + auth Bearer + rate limit
```

**Configuration** : aucune (le path/provider/modèle sont passés dans le
payload — pas de var d'env, pas de constante dans `app/config.py`).

**Dépendances** (`requirements.txt`) :
```
azy-mcp @ git+https://github.com/fsebbah/azy.mcp.git@staging
```

> Convention de branche : `@staging` pour le runtime / la build .exe ;
> `@develop` pour les sessions de dev (override manuel via
> `pip install --upgrade --force-reinstall`).

**PyInstaller `azy-local-agent.spec`** :
- Hidden imports : `azy_mcp.*`, `langchain_core`, `langchain_ollama`,
  `langchain_openai`, `langchain_anthropic` (deps transitives requises pour
  l'import — voir §6.3.1 principe 5), `pydantic`, `yaml`, `httpx`.
- **Aucune exclusion**.
- Fix Windows asyncio : `WindowsSelectorEventLoopPolicy`.
- Impact taille `.exe` estimé : **180-220 MB** (vs ~80 MB actuel).

**Documentation à mettre à jour** :
- `docs/architecture/SYSTEM-ARCHITECTURE.md §2.8` — nouvelle sous-section
  pour le module skills.
- `docs/architecture/SYSTEM-ARCHITECTURE.md §5` — ajout des nouveaux
  endpoints dans le tableau récap.

**Hors périmètre PR initiale** :
- Skills hybrides (steps `target: cloud`) — voir §6.5.1.
- Sync cloud → local (futur marketplace) — voir §6.4.
- Endpoint `/api/skills/install` (installation depuis ZIP) — voir §6.4.

---

## 11. Questions ouvertes

### 11.1 Questions générales (RFC initiale)

1. **Monétisation** : Les skills publics peuvent-ils être payants (marketplace) ?
2. **Versioning** : Comment gérer les mises à jour de skills sans casser les exécutions en cours ?
3. **Dépendances** : Un skill peut-il appeler un autre skill (composition) ?
4. **Quota** : Limites d'exécution par user/tenant ?
5. **Cache** : Mise en cache des résultats de steps coûteux (LLM) ?

### 11.2 Questions Azy Local Agent (ajoutées 2026-05-08)

6. **Orchestration des skills hybrides** (cf. §6.5.1) : Pré-orchestration
   frontend, pause/reprise côté agent, ou interdire le mélange ? **Bloque
   l'implémentation des skills hybrides côté local agent.** À cadrer entre
   les équipes Front, Backend API et MCP.
7. **Streaming local** (cf. §6.3.4) : SSE / polling task_id / WebSocket pour
   les exécutions longues côté local agent ? Préférence locale = SSE.
8. **Sandbox sécurité scripts Python locaux** : le `ScriptStepHandler`
   d'azy_mcp utilise un subprocess Python — quelle isolation supplémentaire
   pour des skills tiers (marketplace) téléchargés sur la machine du user ?
   Containerisation ? `seccomp` ? Chroot ? À discuter — important pour la
   marketplace.
9. **Endpoint frontend → chat.api pour les steps `target: cloud`** :
   l'équipe Backend API doit-elle exposer un proxy LLM unifié
   (`POST /api/llm/proxy` ?) ou réutiliser des endpoints existants par
   provider ? Schéma I/O à définir.
10. **Format de pipeline transmis au frontend** : si l'option A (pré-
    orchestration) est retenue pour §6.5.1, le frontend a besoin du
    pipeline complet du skill. Faut-il étendre `GET /api/skills/{name}` pour
    le retourner, ou créer un endpoint `/api/skills/{name}/pipeline` dédié ?

---

## 12. Références

- [RFC-040 Training Dataset API](./RFC-040-TRAINING-DATASET-API.md)
- [RFC-072 LLM Batch Manager](./RFC-072-LLM-BATCH-MANAGER.md)
- [RFC-083 MCP REST API](./RFC-083-MCP-REST-API.md)
- [MCP Protocol Specification](https://modelcontextprotocol.io/specification)
- [Azy Local Agent (SYSTEM-ARCHITECTURE.md §2.8)](../architecture/SYSTEM-ARCHITECTURE.md#28-azy-local-agent)
