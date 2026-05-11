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
| `llm_call` | Appelle un LLM via webhook n8n (`llm-call-messages` multi-provider) | `provider`, `model`, `system_prompt_file`, `user_prompt_file`, `context` — cf. §7.4.3 |
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

### 5.4 Médiation chat.api pour le chat web (équipe Front, 2026-05-08)

> ⚠️ **Mise à jour 2026-05-08 — section déclassée Flow 1 / V2 différé**.
> Cette sous-section décrit le flow **chat conversationnel → tool-call
> LLM → skill** (Flow 1). Suite à la livraison de l'annexe externe v0.3 +
> Annexe C par les équipes Azy-MCP / chat.api, **le V1 du MVP cible
> uniquement le Flow 2** (skill user local orchestré par le frontend, cf.
> §5 Annexe externe v0.3 et §C.3 Annexe Backend). Le Flow 1 décrit
> ci-dessous reste pertinent mais **différé V2**. Voir aussi l'**Annexe D
> — Réponse équipe Front** pour les composants livrés en V1 côté Flow 2.
>
> Annotation équipe Front initiale. §5 documente l'intégration MCP côté
> **plugins** (Discord/IDE) qui parlent MCP direct via stdio/WS. Pour le
> **frontend web** (`chat.vue`), le flow est différent : le front ne parle
> JAMAIS MCP. Cette sous-section comble ce trou de documentation.

#### 5.4.1 Flow LLM tool-calling depuis le chat web

```
1. User pose une question dans le chat (ModernChatView)
   ↓ WebSocket
2. chat.api /ws/mcp (Bearer JWT validé au handshake)
   ↓
3. chat.api transmet au LLM avec tools augmentés :
     tools = [...tools_existants, skill_list, skill_execute]
   ↓
4. LLM produit un tool_call :
     { "name": "skill_execute",
       "arguments": { "skill_name": "progression_pedagogique",
                      "params": { ... } } }
   ↓
5. chat.api INTERCEPTE le tool_call (ne le forward PAS au front en l'état)
   ↓
6. chat.api applique les contrôles (cf. §7.4.6 — gate avant exécution) :
     - Vérification RBAC : user a accès au skill (visibility = public/tenant/private)
     - Vérification quota : skill_executions_per_day_per_user, skill_tokens_per_day_per_tenant
     - Résolution model_tier → modèle effectif via le package du tenant (RFC-077/079)
   ↓
7. chat.api → POST {AZY_MCP}/api/skills/{skill_name}/execute
     Headers: X-Service-Token, X-Tenant-ID, X-User-ID
     Body: params + context résolu (tenant, user, package)
   ↓
8. Azy-MCP exécute le pipeline (cf. §3, §4.3)
   ↓
9. tool_result réinjecté au LLM, le LLM continue le stream user
```

**Contrats clés** :
- Le **frontend ne parle JAMAIS MCP** ni Azy-MCP direct (CORS interdirait + question billing/audit). Toujours via chat.api.
- Le **LLM ne voit JAMAIS d'API key**, juste un schéma JSON de tool. C'est l'inversion classique du contrôle MCP.
- chat.api est le **gate** : auth + tenant + quota + résolution package.
- Azy-MCP/n8n exécutent, mais c'est chat.api qui décide *si* on exécute.

#### 5.4.2 Cas du déclenchement explicite (UI bouton, non LLM)

Pour les skills déclenchés via une UI dédiée (bouton « Lancer le skill X » dans `Settings → Mes skills`), le front bypasse le LLM :

```
Bouton UI → POST /api/skills/{name}/execute (chat.api, Bearer JWT)
   → mêmes gates §5.4.1 étape 6
   → Azy-MCP
   → résultat retourné directement à l'UI (pas de chat involved)
```

C'est le même endpoint que celui que le LLM tool-call déclenche en interne — un seul point de sortie, mêmes contrôles. Cohérence : un skill exécuté depuis le chat ou depuis un bouton produit le même audit log + même comptage quota.

#### 5.4.3 Codes erreur attendus côté front

À ajouter au catalogue `apiErrors.ts` (front) — ils dépendent du chemin retenu en §7.4.6, mais quel que soit le chemin :

| Code | HTTP | Quand |
|---|---|---|
| `skill_not_found` | 404 | `skill_name` inconnu |
| `skill_visibility_forbidden` | 403 | User n'a pas accès (private d'un autre, tenant d'un autre) |
| `skill_executions_quota_exceeded` | 429 | Compteur exécutions/jour dépassé |
| `skill_llm_quota_exceeded` | 429 | Compteur tokens LLM/jour dépassé |
| `skill_model_tier_unsupported` | 400 | `model_tier` du skill n'est pas dans le package du tenant |
| `skill_validation_failed` | 422 | Skill rejeté au parsing (cf. §7.4.2 forbidden fields) |
| `skill_execution_failed` | 500/502 | Échec d'un step (avec détail step_id côté `details`) |

---

## 6. Skills Utilisateur

### 6.1 Sources de skills (V1)

> **Mise à jour 2026-05-11** : la matrice initiale (System / Tenant / User Local) a été
> consolidée en **2 catégories V1** + 1 catégorie différée. La nouvelle distinction
> structure les tables BDD (publique vs tenant) et les flows de registration.

| Catégorie | Catalogue (métadonnées) | Fichiers physiques | Exécution | Statut V1 |
|---|---|---|---|---|
| **Skills publics** | Table publique chat.api `public.skills` (gérée par superadmin) | Filesystem **azy.mcp** | Pipeline 100% serveur (Azy-MCP) — appels LLM cloud passent par chat.api `/api/llm/skills/invoke` | ✅ V1 |
| **Skills privés** | Table tenant chat.api `user_skills` (1 ligne par skill par user) | Filesystem **agent local** user (`~/azy-workspace/skills/`) | Pipeline orchestré par l'agent local — appels LLM cloud passent par chat.api `/api/llm/skills/invoke` | ✅ V1 |
| ~~Skills tenant (server-side)~~ | ~~table tenant chat.api~~ | ~~filesystem azy.mcp~~ | ~~serveur~~ | 🔮 V2+ différé |

→ Le concept "tenant server-side" (skills uploadés par un admin tenant pour un usage server-side) est différé V2+. En V1, un skill est **soit public** (visible par tous selon `required_package_code`), **soit privé** (visible uniquement par son `owner_user_id` dans son tenant).

### 6.2 Registration des skills (V1)

> **Refonte 2026-05-11** : l'ancien modèle « POST /api/skills/upload avec ZIP » a été
> abandonné car il contredisait le principe §6.3.1.1 « le client décide tout » (point
> #5 de la revue expert). Le nouveau modèle V1 sépare strictement la registration des
> **publics** (admin chat.api) et celle des **privés** (front orchestrateur).

#### 6.2.1 Registration des skills publics (admin chat.api)

**Acteurs** : superadmin via UI admin → chat.api.

**Fichiers** : déposés en amont sur le filesystem azy.mcp (déploiement git du repo `azy.mcp`). chat.api ne **stocke pas** les fichiers — il référence le `mcp_path` (chemin sur azy.mcp) dans la table.

**Endpoints** :

| Méthode | Path | Auth | Rôle |
|---|---|---|---|
| `POST /api/admin/skills/` | JWT superadmin | Créer une entrée publique (métadonnées + `mcp_path`) |
| `PUT /api/admin/skills/{id}` | JWT superadmin | Mettre à jour |
| `DELETE /api/admin/skills/{id}` | JWT superadmin | Désactiver (`enabled=false`, soft) |
| `GET /api/skills/public` | JWT user | Lister les skills publics filtrés par package du tenant |

**Schéma de la table** : cf. Annexe C §C.12.

#### 6.2.2 Registration des skills privés (front orchestrateur)

**Acteurs** : user via frontend (qui interroge l'agent local pour le scan filesystem, puis POST chat.api avec les métadonnées).

**Fichiers** : restent dans `~/azy-workspace/skills/<nom_dossier>/` sur la machine du user. chat.api ne **reçoit aucun fichier** — il reçoit uniquement les métadonnées parsées (frontmatter YAML).

**Flow détaillé** :

```
1. User ajoute un nouveau dossier dans ~/azy-workspace/skills/mon_skill/
2. User clique « Recharger les skills » dans la SkillsView du front
3. Front → GET http://localhost:11500/api/skills (agent local scan filesystem)
4. Front itère sur la réponse :
   - Pour chaque skill non encore enregistré (clé naturelle = directory_name) :
     POST chat.api /api/skills/register { directory_name, local_path, name, ... }
     → chat.api stocke en table tenant `user_skills` avec UUID interne `id`
   - Pour chaque skill modifié localement (version + last_synced_at change) :
     PATCH chat.api /api/skills/{id} { description, version, pipeline_summary, ... }
5. Front affiche la liste mise à jour (publics + privés)
```

**Endpoints chat.api** :

| Méthode | Path | Auth | Rôle |
|---|---|---|---|
| `POST /api/skills/register` | JWT user | Crée une entrée tenant `user_skills` (clé naturelle `directory_name` + uniqueness `(owner_user_id, directory_name)`) |
| `GET /api/skills/` | JWT user | Liste **union** publics filtrés + privés du user |
| `GET /api/skills/{id}` | JWT user | Détail (public OU privé selon le scope auquel `id` appartient) |
| `PATCH /api/skills/{id}` | JWT user (owner uniquement) | Met à jour les métadonnées d'un privé après modif locale |
| `DELETE /api/skills/{id}` | JWT user (owner uniquement) | Supprime un privé (la table ; les fichiers restent côté agent local) |

**Schéma de la table tenant** : cf. Annexe C §C.12.

**Note importante** : la **version** des skills (publics ou privés) est un `VARCHAR(32) NULL` libre — pas de contrainte semver imposée par chat.api. Le user (ou le superadmin pour les publics) renseigne ce qu'il veut (ex. `1.0.0`, `2025-05`, `draft`, ou `NULL`).

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

#### 6.5.1 Orchestration des skills hybrides — décision actée (2026-05-11)

> ✅ **Décision arbitrée à 4 équipes (Front + Back + Azy-MCP + Local Agent)
> le 2026-05-11.** Cette section remplace la rédaction initiale qui
> proposait 3 options ouvertes (A/B/C).

**Décision finale : Option B — Pause/reprise côté local agent**.

Le local agent exécute le pipeline step par step jusqu'à rencontrer un
step `target: cloud`, suspend le run (`status: needs_llm`), et attend que
le frontend lui pousse le résultat du step cloud via `POST /api/skills/runs/{run_id}/continue`. Le frontend pendant ce temps appelle
`chat.api/api/llm/skills/invoke` pour obtenir la réponse LLM.

**Conséquences immédiates** :

- ✅ **Les skills hybrides (`target: local` + `target: cloud` dans le même pipeline) sont supportés en V1** — y compris le cas pilote `progression_pedagogique`.
- ✅ Le `SkillExecutor` côté local agent gère un `RunRegistry` stateful (un run = un état avec ses variables `$steps.*` portées d'un step à l'autre).
- ✅ Le frontend reste un **orchestrateur "bête"** : il fait la navette `agent ↔ chat.api` sans réinterpréter le pipeline.
- ✅ chat.api expose un endpoint **stateless par step LLM** (`POST /api/llm/skills/invoke`) — pas de notion de `run_id` côté back, juste passé en `metadata` pour audit.

**Options A et C écartées** :

- **A. Pré-orchestration frontend** : écartée car dupliquerait la logique d'interprétation du pipeline (`SkillExecutor`) côté front, risquant de diverger à chaque évolution du format YAML.
- **C. Skills mono-target uniquement** : écartée car le cas pilote (`progression_pedagogique`) est par essence hybride (`parse_referentiel.py` local + `generate_progression` cloud + `render_docx` cloud avec Anthropic Files API). Limiter à mono-target reviendrait à priver la V1 de son skill emblématique.

**Endpoint clé agent local** : `POST /api/skills/runs/{run_id}/continue` (cf. §6.3.3). Permet au frontend de reprendre l'exécution après avoir obtenu un résultat LLM cloud depuis chat.api.

**Périmètre V1 local agent** *(mise à jour)* :

- ✅ Skills 100% locaux (`target: local` partout) — simple
- ✅ Skills hybrides (mix `target: local` + `target: cloud`) — via pause/reprise option B
- ❌ Skills 100% cloud invoqués par tool-call LLM dans le chat conversationnel — différé V2 (cf. Annexe C §C.11 cas #5)

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

#### 7.4.3 Webhooks n8n multi-provider : Pattern BYOT (Bring Your Own Token)

> **Pattern unifié pour tous les webhooks LLM** : Le caller fournit le provider,
> le modèle et la clé API. Pas de fallback sur les variables d'environnement.
> Cette approche permet le multi-tenant avec facturation séparée.

##### Webhooks disponibles

| Webhook | Endpoint | Description |
|---------|----------|-------------|
| `text-generator` | `POST /webhook/text-generator` | Génération de texte (prompt simple) |
| `llm-call-messages` | `POST /webhook/llm-call-messages` | Appel LLM format messages natif |
| `llm-summarizer` | `POST /webhook/llm-summarizer` | Résumé de texte |
| `claude-call-with-skills` | `POST /webhook/claude-call-with-skills` | Anthropic Skills (docx, xlsx) — Anthropic uniquement |

##### Input Schema unifié (multi-provider)

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `provider` | string | ✅ | `anthropic`, `openai`, `mistral` |
| `model` | string | ✅ | Modèle du provider (ex: `claude-sonnet-4-20250514`, `gpt-4o`) |
| `api_key` | string | ✅ | Clé API du provider — **REQUIS, pas de fallback** |
| `temperature` | number | ❌ | 0-1 (Anthropic) ou 0-2 (OpenAI) — défaut: 0.7 |
| `max_tokens` | integer | ❌ | Défaut: 4096 |
| `messages` | array | ✅* | Format messages natif du provider (*pour `llm-call-messages`) |
| `system` | string | ❌ | System prompt (format Anthropic) |
| `prompt` | string | ✅* | Prompt simple (*pour `text-generator`) |
| `metadata` | object | ❌ | Passé tel quel dans la réponse (tracing) |

> ⚠️ **IMPORTANT** : Si `api_key` n'est pas fourni, le webhook retourne une erreur 400.
> Il n'y a **aucun fallback** sur `$env.ANTHROPIC_API_KEY` ou `$env.OPENAI_API_KEY`.

**Exemple de payload multi-provider :**

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "api_key": "sk-ant-api03-...",
  "temperature": 0.7,
  "system": "Tu es un assistant pédagogique expert.",
  "messages": [
    { "role": "user", "content": "Génère une progression pédagogique pour..." }
  ],
  "max_tokens": 4096,
  "metadata": {
    "correlation_id": "skill-exec-abc123",
    "user_id": "user-456",
    "tenant_id": "tenant-789"
  }
}
```

**Output unifié :**

```json
{
  "success": true,
  "content": [{ "type": "text", "text": "## Progression Mathématiques 6e\n\n..." }],
  "model": "claude-sonnet-4-20250514",
  "usage": { "input_tokens": 245, "output_tokens": 1832 },
  "stop_reason": "end_turn",
  "metadata": { "correlation_id": "skill-exec-abc123", "user_id": "user-456" }
}
```

**Erreur si `api_key` manquant :**

```json
{
  "success": false,
  "error": {
    "code": "MISSING_API_KEY",
    "message": "api_key is required. No fallback to environment variables.",
    "http_status": 400
  }
}
```

**Architecture de routage n8n :**

```
Input → Validate (api_key requis) → Switch(provider) → HTTP Request → Format → Response
                                         │
                                         ├─ anthropic → api.anthropic.com/v1/messages
                                         ├─ openai    → api.openai.com/v1/chat/completions
                                         └─ mistral   → api.mistral.ai/v1/chat/completions
```

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

#### 7.4.6 Gap §7.4.1 (intent) vs §7.4.3 (text-generator existant) — annotation Front (2026-05-08)

> Annotation équipe Front. §7.4.1 promet quatre contrôles côté n8n
> (Credentials, Rate limit, Billing, Audit log). §7.4.3 décrit le webhook
> `text-generator` *existant* qui n'applique en pratique qu'un seul de ces
> quatre (Credentials). Le RFC ne devrait pas afficher §7.4.3 comme s'il
> satisfaisait §7.4.1 — il faut ou bien upgrader `text-generator`, ou bien
> placer le gate ailleurs.

##### Gap concret

| Contrôle promis §7.4.1 | État réel `text-generator` §7.4.3 |
|---|---|
| **Credentials** | ✅ Stockés dans le credential store n8n |
| **Rate limit** | ❌ Non décrit dans le workflow. Aucune protection mentionnée. |
| **Billing** | ❌ Pas de tagging `skill_name`/`step_id` dans les metadata provider (OpenAI metadata, Anthropic metadata) → pas de cost-center par skill. |
| **Audit log** | ❌ Pas de table `service_token_usage_logs` mentionnée pour ces appels. |

Côté input schema §7.4.3 :
- `user_id`, `guild_id` sont **optional** → un skill peut omettre, n8n n'a aucun moyen d'enforcer le tenant.
- `model` accepte `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo` **bruts** → pas de mapping `model_tier → modèle effectif via le package` du tenant (RFC-076/077/079). Un skill peut forcer le modèle le plus cher en ignorant le tier du tenant.
- `temperature`, `max_tokens` sont libres → un skill peut demander 4096 tokens même sur un tier `eco` qui plafonne à 1024.

##### Deux chemins possibles à arbitrer

**Chemin A — n8n upgrade `text-generator`** :
- `user_id` + `tenant_id` deviennent **required** dans l'input schema.
- Remplacer `model` brut par `model_tier` + node de résolution via TenantResolver.
- Ajouter un node de pré-check quota (Redis counter) + un node audit log à la fin.
- Tagger les metadata provider (`metadata.skill_name`, `metadata.step_id`) pour billing.
- Coût : moyen, mais tout est centralisé en un endroit (n8n).
- Avantage : les autres consommateurs de `text-generator` (s'il y en a) bénéficient des contrôles automatiquement.

**Chemin B — chat.api gate avant n8n** :
- chat.api intercepte le tool_call `skill_execute` du LLM (cf. §5.4.1 étape 6).
- chat.api fait : auth + tenant + quota check + résolution `model_tier → modèle` via package + audit log → **puis** appelle Azy-MCP qui appelle `text-generator`.
- `text-generator` reste « dumb pipe » avec credentials providers.
- Coût : faible, ne touche pas n8n.
- Avantage : chat.api a déjà TenantResolver + catalogue packages + compteurs quota + `service_token_usage_logs`. Tout est en place.
- Inconvénient : double gate apparent (chat.api + n8n credentials) — mais c'est en fait défense en profondeur, pas duplication.

##### Vote équipe Front : Chemin B

Raisons :
- chat.api a déjà tous les composants nécessaires (TenantResolver, catalogue, compteurs, audit).
- n8n reste cantonné à son rôle naturel (custodian credentials).
- Pas besoin de réécrire `text-generator` — workflow stable préservé.
- Pour le front, **aucun changement de contrat** : on continue d'appeler `/api/skills/{name}/execute` ou WS `/ws/mcp` avec Bearer JWT, le tool-call est transparent.

À trancher avec les équipes Backend API et Azy-MCP avant l'implémentation §11.1 phase 2 (intégration MCP). Voir Q11 §11.3.

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

### 10.3 Modifications (chat.api) — V1 réel

> **Mise à jour 2026-05-11** : la liste initiale (upload.py, manage.py, sync.py,
> validator.py, sandbox.py) correspondait au modèle ZIP-upload abandonné. Le scope
> V1 réel est réparti sur 2 PR parallèles (cf. Annexe C §C.5 + §C.13).

**PR-A — `feat/rfc-085-skills-llm-invoke`** (~5.6j) — endpoint LLM cloud step :

```
app/schemas/
└── skills_llm.py                       # Pydantic discriminated union (mode messages/with_skills)

app/services/
├── skills_llm_service.py               # SkillsLLMService.invoke + dispatch sync/batch
└── skills_quota_service.py             # Garde-fous Redis (concurrent + cooldown) + quotas journaliers

app/api_routes/
└── skills_llm_routes.py                # POST /invoke + GET /tasks/{id} + DELETE /tasks/{id}

app/errors.py                            # +9 codes erreur skills
```

**PR-B — `feat/rfc-085-skills-catalogs`** (~4.4j) — catalogues publics + privés :

```
alembic/versions/
├── 20260512_1000_<hash>_public_skills_table.py        # public.skills (publique)
└── 20260512_1100_<hash>_user_skills_tenant_table.py   # tenant.user_skills (par tenant)

app/models/skills/
├── __init__.py
├── public_skill.py                     # Modèle SQLAlchemy publique
└── user_skill.py                       # Modèle SQLAlchemy tenant

app/schemas/
└── skills_catalog.py                   # Pydantic create/update/read + union response

app/services/skills_catalog/
├── __init__.py
├── public_skills_service.py            # CRUD publics (superadmin write, user read)
├── user_skills_service.py              # CRUD tenant (user write, scoping owner)
└── discovery_service.py                # Union publics filtered + privés du user

app/api_routes/
└── skills_catalog_routes.py            # 8 endpoints (4 user + 3 superadmin + 1 discovery)
```

**Aucun stockage de fichiers côté chat.api** : les fichiers physiques restent sur azy.mcp (publics) ou l'agent local (privés). chat.api ne gère que les métadonnées (catalogue).

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

**Hors périmètre PR initiale** *(mise à jour 2026-05-11)* :
- ~~Skills hybrides (steps `target: cloud`)~~ → **inclus en V1** via option B pause/reprise (cf. §6.5.1 mis à jour).
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

### 11.3 Questions équipe Front (ajoutées 2026-05-08)

> **Statut résolution mis à jour 2026-05-08 après livraison annexe externe
> v0.3 + Annexe C par chat.api.**

11. **Chemin A vs Chemin B pour combler §7.4.6** : ✅ **RÉSOLU — chemin B
    retenu** (cf. §C.4 #1 Annexe Backend). Gate côté chat.api dans
    `SkillsLLMService` ; n8n reste custodian credentials sans logique
    quota/audit/billing. Concrètement : 2 webhooks distincts
    `llm-call-messages` + `claude-call-with-skills` consommés via
    Azy-MCP `/api/tools/anthropic/execute`. Toute la logique
    quota/audit/billing/résolution model_tier vit dans
    `SkillsLLMService` côté chat.api.

12. **Médiation chat.api dans le tool-calling LLM** (cf. §5.4.1) : 🟡
    **PARTIELLEMENT RÉSOLU — Flow 1 différé V2** (§C.3 Annexe Backend).
    Le V1 du MVP cible le Flow 2 (skill user local orchestré par le
    frontend, pause/reprise — option B). Mon §5.4 décrit le Flow 1 qui
    sera réimplémenté en V2 quand un skill cloud devra être appelé depuis
    une conversation chat (≠ Modal Quick-Action dédié). Voir Annexe D pour
    le scope front V1 réel.

13. **Catalogue d'erreurs typées pour les skills** (cf. §5.4.3) : ✅
    **RÉSOLU + ÉTENDU — 9 codes** (§C.2.7 + §C.6 + §C.7). Mes 7 codes
    initiaux (front) sont validés ; 2 nouveaux ajoutés par §C.6 garde-fous
    (`skill_concurrent_limit_reached`, `skill_cooldown_active`) et 2 par
    §C.7 batch (`skill_anthropic_provider_error`,
    `skill_request_timeout`). Total 9 codes à ajouter au catalogue front
    `apiErrors.ts:BACKEND_ERROR_MESSAGES`. Voir Annexe D §D.4.

14. **Quota par skill × tenant × LLM tier** (extension de Q4 §11.1) : ✅
    **RÉSOLU + ÉTENDU — 4 mécanismes** (§C.6.3 Annexe Backend). Mes 2
    compteurs initiaux (`skill_executions_per_day_per_user`,
    `skill_tokens_per_day_per_tenant`) sont actés, **plus 2 garde-fous
    décidés par produit 2026-05-08** : concurrent max 3 skills / user
    (Redis lock atomique) + cooldown 30s anti-spam entre 2 relances du
    même skill. Le front affiche un loader avec compte à rebours / message
    explicite pour chaque cas (cf. Annexe D §D.5).

---

## 12. Références

- [RFC-040 Training Dataset API](./RFC-040-TRAINING-DATASET-API.md)
- [RFC-072 LLM Batch Manager](./RFC-072-LLM-BATCH-MANAGER.md)
- [RFC-083 MCP REST API](./RFC-083-MCP-REST-API.md)
- [MCP Protocol Specification](https://modelcontextprotocol.io/specification)
- [Azy Local Agent (SYSTEM-ARCHITECTURE.md §2.8)](../architecture/SYSTEM-ARCHITECTURE.md#28-azy-local-agent)


## Annexe Autre Analyse

# RFC-085 v0.3 — Intégration des Claude Skills dans l'écosystème Azy

| Champ | Valeur |
|---|---|
| **Statut** | Synthèse de design — à valider avec les équipes dev |
| **Version** | 0.3 (consolidation des décisions architecturales) |
| **Date** | 2026-05-08 |
| **Surfaces concernées** | Frontend `chat.vue`, Azy Local Agent, chat.api, N8N |
| **MVP cible** | Skill `progression_pedagogique` |

> **Document de travail** issu de la discussion d'architecture sur l'intégration des skills (Claude / Anthropic) dans Azy. Il consolide les décisions et explicite le point central : **les deux modes d'appel LLM** que le système doit gérer.

---

## 1. Résumé exécutif

### Décisions actées

1. **Les skills vivent sur la machine de l'utilisateur**, dans un répertoire qu'il choisit lui-même (`AZY_SKILLS_DIR`). Pas d'embarquement dans le `.exe` distribué.
2. **L'Azy Local Agent** (§2.8 de l'archi globale) est le runtime des skills. Il scanne le répertoire au boot, parse les `SKILL.md`, exécute les pipelines.
3. **Les clés API Anthropic ne sont JAMAIS embarquées** dans l'agent ni distribuées aux clients. Elles restent côté Azy (chat.api → N8N → Anthropic).
4. **Le frontend orchestre** les allers-retours entre l'agent local et chat.api. C'est le seul point qui parle aux deux.
5. **Les appels LLM se font dans deux modes**, selon ce que l'étape du skill demande :
   - **Mode `messages`** — appel `/v1/messages` standard, raisonnement pur.
   - **Mode `with_skills`** — appel `/v1/messages` avec `container.skills` activé, pour utiliser les skills pré-construits d'Anthropic (`docx`, `xlsx`, `pptx`, `pdf`).

Cette dernière décision est le cœur de cette RFC.

---

## 2. Architecture globale — qui fait quoi

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  MACHINE DE L'UTILISATEUR                                │
│                                                                          │
│   ┌──────────────┐                                                       │
│   │   Browser    │                                                       │
│   │ (frontend)   │                                                       │
│   └──┬────────┬──┘                                                       │
│      │        │                                                          │
│      │        │ HTTP localhost:11500                                     │
│      │        │ Authorization: Bearer <token>                            │
│      │        ▼                                                          │
│      │     ┌──────────────────┐                                          │
│      │     │  Azy Local Agent │  ── parse_referentiel.py                 │
│      │     │   (§2.8 archi)   │  ── build_calendar.py                    │
│      │     │                  │  ── load_doctrine                        │
│      │     │  SkillExecutor   │  ── prépare payload LLM                  │
│      │     │                  │  ── écrit fichiers dans                  │
│      │     │                  │     ~/azy-workspace/                     │
│      │     └──────────────────┘                                          │
│      │                                                                   │
└──────│───────────────────────────────────────────────────────────────────┘
       │
       │ HTTPS (Bearer JWT user)
       ▼
┌─────────────┐                              ┌─────────────┐
│  chat.api   │ ───── service token ──────▶  │   Azy-MCP   │
│             │ ◀────────────────────────────│             │
└─────────────┘                              └──────┬──────┘
                                                    │
                                                    │ webhook
                                                    ▼
                                             ┌─────────────┐
                                             │     N8N     │
                                             │             │
                                             │ Workflow    │
                                             │ Anthropic   │
                                             └──────┬──────┘
                                                    │
                                                    │ Bearer <clé Anthropic Azy>
                                                    ▼
                                             ┌─────────────┐
                                             │  Anthropic  │
                                             │    API      │
                                             └─────────────┘
```

**Doctrine** :
- L'agent **ne parle qu'au browser**. Aucun appel sortant vers chat.api ou Anthropic.
- Le frontend **fait le pont** entre l'agent local et chat.api.
- chat.api **est le seul à connaître les clés Anthropic**. Il les délègue à N8N qui fait l'appel.
- Les fichiers source de l'utilisateur (PDF du référentiel, paramètres) **restent sur sa machine**.
- Les artefacts dérivés (texte parsé, calendrier, prompt enrichi) **traversent l'infra** pour atteindre Anthropic.
- Le fichier final (`.docx`) **revient et reste local** sur la machine de l'utilisateur.

---

## 3. Anatomie d'un skill Azy

Un skill est un **dossier** dans le répertoire pointé par `AZY_SKILLS_DIR` :

```
<AZY_SKILLS_DIR>/<skill_id>/
├── SKILL.md               ← frontmatter YAML (machine) + doctrine markdown (humaine)
├── scripts/               ← exécutés en sandbox Python locale
│   └── *.py
├── prompts/               ← injectés dans les appels LLM
│   └── *.md
├── assets/                ← données statiques (calendriers, gabarits, données)
│   └── ...
└── references/            ← documents de doctrine injectés en contexte LLM
    └── *.md
```

### 3.1 Frontmatter du `SKILL.md`

Lu par le `SkillExecutor` de l'agent local. Il décrit :
- les **paramètres** attendus (`parameters`),
- le **pipeline** d'étapes typées (`pipeline`),
- la **réponse** finale renvoyée au frontend (`returns`).

### 3.2 Types d'étapes du pipeline

| Type | Décrit | Exécuté où |
|---|---|---|
| `script` | Exécution Python d'un fichier sous `scripts/` | Agent local (sandbox) |
| `asset` | Lecture d'un fichier statique sous `assets/` ou `references/` | Agent local |
| **`llm_call`** | **Appel LLM via chat.api → N8N → Anthropic** | **Cloud (clé Azy)** |
| `storage` | Persistance d'un livrable | Agent local (sandbox `~/azy-workspace`) |

Le type `llm_call` se décline en **deux modes**, qui sont l'objet de cette RFC.

---

## 4. ⭐ Les deux modes d'appel LLM

C'est la section centrale. **Tout skill qui invoque le LLM le fait dans l'un de ces deux modes, jamais dans un autre.**

### 4.1 Mode `messages` — appel LLM standard

**Quand l'utiliser** : pour tout raisonnement pur (analyse, synthèse, génération de texte ou de JSON structuré). C'est le cas par défaut.

**Sémantique** : un appel `POST /v1/messages` classique d'Anthropic. Pas de container, pas de beta flags, pas d'exécution de code côté Anthropic. Claude reçoit un contexte, raisonne, renvoie une réponse texte ou JSON.

**Exemple — étape `generate_progression`** :

```yaml
- id: generate_progression
  type: llm_call
  mode: messages                                  # ← clé
  model_tier: opus
  system_prompt_file: prompts/persona_professeur.md
  user_prompt_file: prompts/build_progression.md
  context:
    referentiel: $steps.parse_referentiel.referentiel
    calendrier: $steps.build_calendar.calendrier
    doctrine: $steps.load_doctrine.doctrine
    params: $params
  response_format: json
  outputs: { progression: json }
```

**Payload effectivement envoyé à Anthropic** (par N8N) :

```json
{
  "model": "claude-opus-4-7",
  "max_tokens": 16000,
  "system": "<persona + doctrine markdown concaténés>",
  "messages": [
    {
      "role": "user",
      "content": "<prompt build_progression rempli avec referentiel/calendrier/params>"
    }
  ]
}
```

**Retour Anthropic** : objet JSON standard avec `content[].text`. Le SkillExecutor parse le `text` comme JSON (la progression structurée) et la transmet à l'étape suivante.

---

### 4.2 Mode `with_skills` — appel LLM avec skills Anthropic activés

**Quand l'utiliser** : pour générer un fichier Office (`.docx`, `.xlsx`, `.pptx`, `.pdf`) ou pour confier à Claude une tâche que ses skills pré-construits gèrent mieux que du code maison.

**Sémantique** : un appel `POST /v1/messages` avec **les beta flags `skills-2025-10-02` + `code-execution-2025-08-25`**, et le paramètre `container.skills` qui charge un ou plusieurs skills d'Anthropic dans le container Claude. Claude exécute du code dans son container, génère des fichiers, les expose via la **Files API**.

**Exemple — étape `render_docx`** :

```yaml
- id: render_docx
  type: llm_call
  mode: with_skills                               # ← clé
  model_tier: sonnet
  anthropic_skills: [docx]                        # ← liste des skills à activer
  user_prompt_file: prompts/render_docx.md
  context:
    progression: $steps.generate_progression.progression
  outputs: { docx_file: file }
```

**Payload effectivement envoyé à Anthropic** (par N8N) :

```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 16000,
  "betas": ["skills-2025-10-02", "code-execution-2025-08-25"],
  "container": {
    "skills": [
      { "type": "anthropic", "skill_id": "docx" }
    ]
  },
  "tools": [
    { "type": "code_execution_20250825", "name": "code_execution" }
  ],
  "messages": [
    {
      "role": "user",
      "content": "<prompt render_docx avec la progression JSON injectée>"
    }
  ]
}
```

**Retour Anthropic** : objet JSON avec :
- du texte explicatif
- des blocs `tool_use` `code_execution` qui ont produit des fichiers
- des `file_id` qu'il faut télécharger via la **Files API** (`GET /v1/files/{file_id}/content`)

C'est **N8N qui télécharge les fichiers** et les retourne à chat.api en base64.

---

### 4.3 Comparaison synthétique des deux modes

| Aspect | Mode `messages` | Mode `with_skills` |
|---|---|---|
| **Beta flags** | Aucun | `skills-2025-10-02` + `code-execution-2025-08-25` |
| **`container.skills`** | Absent | Présent — liste de skills Anthropic |
| **`tools`** | Absent (sauf besoin spécifique) | `code_execution_20250825` obligatoire |
| **Skills Azy custom** | Non utilisés | Possibles via `{type: "custom", skill_id, version}` — non utilisé en V1 |
| **Skills Anthropic disponibles** | — | `docx`, `xlsx`, `pptx`, `pdf` (gérés par Anthropic) |
| **Exécution de code Python** | Non | Oui, dans le container Anthropic |
| **Type de retour** | Texte / JSON dans `content[].text` | Texte + `file_id` à télécharger via Files API |
| **Coût en tokens** | Variable, ~5–15 K tokens typique | Plus élevé (overhead container + skill) |
| **Latence** | 5–30 secondes | 15–60 secondes (génération fichier) |
| **Use case typique** | Raisonnement, synthèse, génération JSON, classification, extraction | Rendu Office, manipulation de tableaux complexes, génération de PDF stylés |
| **Modèle recommandé** | Sonnet ou Opus selon la complexité | Sonnet (suffisant pour la mise en forme) |

### 4.4 Règle de décision

En pratique, le choix du mode est **trivialement dicté par la nature de la sortie attendue** :

- **La sortie est du texte ou du JSON** → mode `messages`.
- **La sortie est un fichier Office** → mode `with_skills` avec le bon skill Anthropic activé.

Pas besoin d'arbitrage subtil. Le flou n'existe pas.

---

## 5. Flux complet — cas `progression_pedagogique`

Ce skill utilise **les deux modes successivement**, ce qui en fait l'exemple canonique.

```
┌────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│Browser │  │ Azy Local    │  │ chat.api │  │ Azy-MCP  │  │   N8N    │  │Anthropic │
│        │  │   Agent      │  │          │  │          │  │          │  │   API    │
└───┬────┘  └──────┬───────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
    │              │                │             │             │             │
    │ ① POST /api/skills/progression_pedagogique/runs            │             │
    │ ── { params, referentiel.pdf } ──▶                         │             │
    │              │                                                           │
    │              │ parse_referentiel.py                                      │
    │              │ build_calendar.py                                         │
    │              │ load_doctrine                                             │
    │              │                                                           │
    │ ◀── { status: "needs_llm",                                               │
    │       step_id: "generate_progression",                                   │
    │       run_id: "abc",                                                     │
    │       llm_payload: { mode: "messages", system, messages } } ──           │
    │                                                                          │
    │ ② POST /api/llm/skills/invoke                                            │
    │ ── { ...llm_payload } ───────────▶                                       │
    │                                  │                                       │
    │                                  │ auth user, quotas, routage           │
    │                                  ───▶ tool execute ───▶                  │
    │                                                       │                  │
    │                                                       │ webhook         │
    │                                                       │ "claude-call"   │
    │                                                       ───▶              │
    │                                                                  │      │
    │                                                                  │POST  │
    │                                                                  │/v1/  │
    │                                                                  │msgs  │
    │                                                                  ──────▶│
    │                                                                         │
    │                                                                  ◀── JSON
    │                                                       ◀───── { response: "<JSON progression>" }
    │                                  ◀───────────────                       │
    │ ◀── { response, tokens, credits } ◀──                                    │
    │                                                                          │
    │ ③ POST /api/skills/runs/abc/continue                                     │
    │ ── { llm_response: "<JSON progression>" } ▶                              │
    │              │                                                           │
    │              │ stocke résultat,                                          │
    │              │ continue le pipeline jusqu'au 2e LLM                      │
    │              │                                                           │
    │ ◀── { status: "needs_llm",                                               │
    │       step_id: "render_docx",                                            │
    │       llm_payload: { mode: "with_skills",                                │
    │                      betas: [...], container: {...},                     │
    │                      tools: [...], messages: [...] } } ──                │
    │                                                                          │
    │ ④ POST /api/llm/skills/invoke                                            │
    │ ── { ...llm_payload mode with_skills } ─▶                                │
    │                                  │                                       │
    │                                  ───▶ tool execute ───▶                  │
    │                                                       ───▶              │
    │                                                                  ──────▶│
    │                                                                         │
    │                                                                  ◀── { content,
    │                                                                       file_ids }
    │                                                       │                  │
    │                                                       │ pour chaque     │
    │                                                       │ file_id :       │
    │                                                       │ GET /v1/files/  │
    │                                                       │ {id}/content    │
    │                                                       ──────────────────▶│
    │                                                                  ◀── binaire
    │                                                       ◀──────────       │
    │                                  ◀──── { response, files: [             │
    │                                          { name, content_base64 } ] }   │
    │ ◀── { response, files: [...], tokens, credits } ◀──                      │
    │                                                                          │
    │ ⑤ POST /api/skills/runs/abc/continue                                     │
    │ ── { llm_response: { ..., files: [...] } } ▶                             │
    │              │                                                           │
    │              │ écrit le fichier dans                                     │
    │              │ ~/azy-workspace/skills/abc/progression.docx               │
    │              │                                                           │
    │ ◀── { status: "done",                                                    │
    │       outputs: { summary_md, files: [{ name, url }] } } ──               │
    │                                                                          │
    │ ⑥ GET /api/files/read?path=…                                             │
    │              │                                                           │
    │ ◀── progression.docx (binaire) ─                                         │
    │                                                                          │
    ▼              ▼                ▼             ▼             ▼             ▼
```

**Six interactions visibles côté frontend** :
1. Démarrer le run.
2. Premier appel LLM (mode `messages`, génère le JSON de progression).
3. Continuer le run avec la réponse.
4. Second appel LLM (mode `with_skills`, génère le `.docx`).
5. Continuer le run avec la réponse.
6. Télécharger le fichier final.

**Ce qui transite par l'infra Azy** :
- Texte parsé du référentiel + calendrier + paramètres + doctrine (étape ②)
- JSON de progression structurée (étape ④)
- Le `.docx` final généré par Anthropic (étape ④)

**Ce qui ne quitte jamais la machine de l'utilisateur** :
- Le PDF original du référentiel
- Le fichier `.docx` final, après l'écriture locale

---

## 6. Endpoints à spécifier

### 6.1 Côté Azy Local Agent

```
POST /api/skills/{skill_id}/runs
  Headers: Authorization: Bearer <agent_token>
  Body:    { params: {...}, files?: { [name]: base64 } }
  
  Réponse :
    { run_id, status: "needs_llm" | "done" | "failed",
      step_id?, llm_payload?, outputs?, error? }
```

```
POST /api/skills/runs/{run_id}/continue
  Headers: Authorization: Bearer <agent_token>
  Body:    { llm_response: <ce que chat.api a retourné> }
  
  Réponse : même schéma que ci-dessus (status, llm_payload | outputs)
```

```
GET /api/skills/runs/{run_id}
  → état + historique (debug, observabilité)
```

```
GET /api/skills (existe à concevoir)
  → liste des skills détectés dans AZY_SKILLS_DIR
```

```
POST /api/skills/refresh
  → relance le scan du répertoire de skills
```

### 6.2 Côté chat.api

```
POST /api/llm/skills/invoke
  Headers: Authorization: Bearer <JWT user Firebase>
           X-Tenant-ID: <tenant>
  Body :
    {
      "skill_id": "progression_pedagogique",
      "step_id": "generate_progression" | "render_docx",
      "run_id": "abc",
      "model_tier_hint": "opus" | "sonnet" | "haiku",
      "max_tokens": 16000,
      "mode": "messages" | "with_skills",         ← LE DISCRIMINANT
      
      // si mode = "messages" :
      "system": "...",
      "messages": [{...}],
      "response_format": "json" | "text",
      
      // si mode = "with_skills" :
      "betas": ["skills-2025-10-02", "code-execution-2025-08-25"],
      "container": { "skills": [{ "type": "anthropic", "skill_id": "docx" }] },
      "tools": [{ "type": "code_execution_20250825", "name": "code_execution" }],
      "messages": [{...}]
    }
  
  Réponse :
    {
      "response": "<text ou JSON>",
      "files": [                                  ← présent uniquement si mode = "with_skills"
        { "name": "progression.docx",
          "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content_base64": "..." }
      ],
      "metadata": {
        "model_used": "claude-sonnet-4-6",
        "tokens_in": 12450,
        "tokens_out": 3820,
        "credits_consumed": 47,
        "duration_ms": 18234
      }
    }
```

### 6.3 Côté N8N

**Deux workflows distincts** (recommandé pour ne pas mélanger les responsabilités) :

```
POST /webhook/llm-call-messages (MULTI-PROVIDER)
  → reçoit { provider, model, api_key, temperature, system, messages, max_tokens, metadata }
  → Switch(provider):
      - anthropic → POST https://api.anthropic.com/v1/messages
      - openai    → POST https://api.openai.com/v1/chat/completions
      - mistral   → POST https://api.mistral.ai/v1/chat/completions
  → retourne le JSON de réponse unifié

POST /webhook/claude-call-with-skills (ANTHROPIC UNIQUEMENT)
  → reçoit { api_key, model, betas, container, tools, messages, max_tokens, metadata }
  → POST https://api.anthropic.com/v1/messages (avec betas + headers)
  → pour chaque file_id retourné : GET /v1/files/{file_id}/content
  → retourne { success, content, files: [{ name, mime_type, content_base64 }], metadata }
```

> ⚠️ **Pattern BYOT (Bring Your Own Token)** : Le caller fournit toujours `api_key`.
> Pas de fallback sur les variables d'environnement n8n.
> Ceci permet le multi-tenant avec facturation séparée par clé API.

**Pourquoi `claude-call-with-skills` reste Anthropic-only ?**
Les Anthropic Skills (génération `.docx`, `.xlsx`, `.pptx`) sont une fonctionnalité
spécifique à l'API Anthropic. Il n'existe pas d'équivalent chez OpenAI ou Mistral.

---

## 7. Arbitrages business validés

| Sujet | Décision |
|---|---|
| **Clé Anthropic** | Reste exclusivement côté Azy (chat.api + N8N). Jamais distribuée, jamais embarquée dans l'agent. |
| **Système de crédits** | Conservé. chat.api applique le décompte sur la base de `tokens_in + tokens_out × multiplier_tier` à chaque appel. |
| **Routage modèle** | Décidé côté chat.api en fonction du `model_tier_hint` du SKILL.md et du package du tenant (RFC-077). |
| **Stockage des skills** | Sur la machine du user, dans `AZY_SKILLS_DIR` qu'il configure lui-même. Aucun skill n'est embarqué dans le `.exe`. |
| **Skills Anthropic** | Utilisés via `container.skills` avec `type: "anthropic"`. Communs à tous les tenants Azy via la même clé API. |
| **Skills custom Azy uploadés** | **Pas en V1**. Pas de `POST /v1/skills` vers le workspace API. Tout vit en local côté user. |
| **Souveraineté du fichier source** | Le PDF original du référentiel ne quitte jamais la machine du user. Seul son texte parsé traverse l'infra. |
| **Souveraineté du livrable** | Le `.docx` final est écrit dans `~/azy-workspace/...` sur la machine du user. Le frontend le télécharge via `/api/files/read`. |

---

## 8. Composants à développer

| Composant | Effort estimé | Owner |
|---|---|---|
| Module `app/skills/` côté Azy Local Agent (executor, scanner, sandbox, endpoints) | 3-5 jours | Local Agent |
| Endpoint `/api/llm/skills/invoke` côté chat.api (gestion mode `messages` + `with_skills`, décompte crédits) | 2-3 jours | Backend |
| Workflow N8N `llm-call-messages` (multi-provider : Anthropic, OpenAI, Mistral) | 1 jour | DevOps / N8N |
| Workflow N8N `claude-call-with-skills` (nouveau, gère betas + Files API) | 1-2 jours | DevOps / N8N |
| Composant Modal Quick-Action côté frontend qui orchestre les 3 endpoints | 1-2 jours | Frontend |
| Skill `progression_pedagogique` (déjà drafté, à ajuster pipeline) | 0.5 jour (ajustements) | déjà fait |

**Total estimé : 8-13 jours-homme pour le MVP complet.**

---

## 9. Plan de déploiement

1. **Phase 1** (semaine 1) — Workflows N8N + endpoint chat.api `/api/llm/skills/invoke`. Test unitaire avec curl en mode `messages` puis en mode `with_skills`.
2. **Phase 2** (semaine 2) — Module `app/skills/` côté agent. Tests unitaires sur l'exécution du pipeline avec un mock du frontend.
3. **Phase 3** (semaine 3) — Composant frontend Modal Quick-Action + intégration end-to-end avec un skill réel.
4. **Phase 4** (semaine 4) — Validation utilisateur (enseignant pilote) avec `progression_pedagogique` sur un référentiel réel. Itération sur la doctrine et les prompts.
5. **Phase 5** (V1.1+) — Observabilité (logs structurés, métriques, dashboard skills), gestion fine des erreurs, multi-skill par run.

---

## 10. Questions ouvertes

1. **Format du token agent** au pairing : on conserve le pattern Bearer existant côté agent (§2.8.2). Le frontend pousse simplement le JWT user Firebase pour les appels chat.api. Pas de token spécifique agent ↔ chat.api en V1.
2. **Limite de taille** des fichiers retournés par le mode `with_skills`. À 5 MB en base64 dans une réponse JSON, on dépasse les limites raisonnables HTTP. Pour les skills futurs qui produiraient de gros PDF/PPTX, prévoir un mode "URL signée temporaire" plutôt qu'un base64 inline.
3. **Reprise sur erreur** : si le frontend crashe entre l'étape ② et l'étape ③, le `run_id` côté agent reste en état `needs_llm`. Faut-il un GC qui purge les runs zombies après TTL, ou un endpoint de reprise explicite ?
4. **Versioning des skills** : un skill peut évoluer entre deux runs. Stocker le hash sha256 du `SKILL.md` dans la trace d'exécution permet de retrouver "quelle version a produit ce livrable". À ajouter dans la spec finale.
5. **Skills custom uploadés sur le workspace API Anthropic** : décision V1 = non. Mais à reconsidérer si on veut un jour partager des skills entre les agents de tous les users d'un même tenant (pattern marketplace privée). La question reviendra dans une RFC ultérieure.

---

## Annexe A — Le SKILL.md `progression_pedagogique` mis à jour

(Section à régénérer suite à cette RFC pour aligner le pipeline sur les modes `messages` / `with_skills`. Les changements par rapport à la v0.1 sont :
- type `llm_call_with_anthropic_skill` remplacé par `llm_call` avec sous-champ `mode`,
- réintroduction de l'étape `render_docx` comme `llm_call mode: with_skills`,
- suppression de `scripts/export_docx.py` du repo,
- ajout du dossier `prompts/` avec `persona_professeur.md`, `build_progression.md`, `render_docx.md`.)

---

## Annexe B — Glossaire

- **`SKILL.md`** : fichier markdown unique d'un skill, contenant le frontmatter YAML (machine) et la doctrine (humaine, injectée comme contexte LLM).
- **Frontmatter** : zone YAML entre deux `---` en tête du `SKILL.md`. Décrit `parameters`, `pipeline`, `returns`.
- **Pipeline** : suite d'étapes typées exécutées séquentiellement par le `SkillExecutor`.
- **`SkillExecutor`** : composant de l'Azy Local Agent qui parse les `SKILL.md`, exécute leur pipeline, gère l'état des runs, retourne les artefacts.
- **Mode `messages`** : appel LLM standard, sans skill Anthropic activé, retour texte/JSON.
- **Mode `with_skills`** : appel LLM avec `container.skills` activé, retour texte + fichiers.
- **Skills Anthropic** : skills pré-construits hébergés par Anthropic (`docx`, `xlsx`, `pptx`, `pdf`). Activés via `{type: "anthropic", skill_id: "..."}`.
- **Skills custom** : skills uploadés sur un workspace API. **Non utilisés en V1 chez Azy**. Activés via `{type: "custom", skill_id: "...", version: "..."}`.
- **BYOT (Bring Your Own Token)** : pattern où le token OAuth tiers (Google) appartient au user, par opposition au pattern où la clé API (Anthropic) reste à Azy.
- **`AZY_SKILLS_DIR`** : variable d'environnement de l'agent local pointant vers le répertoire de skills choisi par l'utilisateur.

---

## Annexe C — Réponse équipe Backend (chat.api) (2026-05-08)

> Cette annexe consolide la position de l'équipe chat.api après lecture
> de l'annexe externe v0.3 (« Intégration des Claude Skills dans
> l'écosystème Azy ») et des annotations Front §5.4 / §7.4.6 / §11.3.
> Elle acte les composants chat.api à livrer, les arbitrages, et le
> différé du Flow 1 (interception WS MCP).

### C.1. Position back sur l'annexe externe

**Aligné** avec l'annexe externe sur les points clés :

| Point annexe externe | Position back |
|---|---|
| Clés Anthropic restent côté Azy (chat.api → N8N) | ✅ Confirmé. C'était la préoccupation initiale, traitée. |
| 2 modes LLM distincts (`messages` vs `with_skills`) | ✅ Le mode `with_skills` est nouveau côté chat.api (besoins Files API Anthropic + base64 download via N8N). |
| Endpoint chat.api unique `POST /api/llm/skills/invoke` avec discriminator `mode` | ✅ Naming retenu (vs ma proposition initiale `/api/skills/llm-step`). |
| Pattern d'orchestration option B (pause/reprise côté agent local) | ✅ chat.api ne connaît pas le skill — reçoit juste un step LLM tagué pour audit. Pas de `SkillExecutor` côté back. |
| 2 workflows N8N distincts (`llm-call-messages`, `claude-call-with-skills`) | ✅ chat.api dispatch via Azy-MCP `/api/tools/anthropic/execute` qui choisit le webhook. |
| Décompte crédits côté chat.api (pas N8N) | ✅ Cohérent avec `LLMBillingService` existant + `llm_call_audit` (RFC-PC-1). |

**Précisions back complémentaires** :

- **Le mode `with_skills` ne change pas l'archi chat.api** — l'endpoint reçoit le payload Anthropic complet (avec `betas`, `container`, `tools`) tel quel et le forward. La logique `betas` + Files API download est entièrement côté N8N. chat.api décode juste les `files[]` base64 dans la réponse pour le retourner au front.
- **Le `model_tier_hint`** dans le request body est **un hint** : chat.api peut l'override si le tier n'est pas dans le package du tenant (RFC-077). Réponse 403 typée si aucun fallback acceptable.
- **Le `skill_id`/`step_id`/`run_id`** sont **purement traçabilité** : chat.api les écrit dans `llm_call_audit.metadata` JSONB pour analytics + correlation. Pas de validation cross-table (chat.api n'a pas de table skills).

### C.2. Composants chat.api à livrer V1

**Cible V1** : permettre à `POST /api/llm/skills/invoke` de servir **tous les steps LLM cloud** (modes `messages` ET `with_skills`) appelés par l'Azy Local Agent durant l'exécution d'un skill, **y compris les skills hybrides** dont le pipeline mêle scripts locaux et appels LLM cloud (cas `progression_pedagogique`).

**Hors scope V1** : interception du tool-call `skill_execute` dans le WebSocket MCP du chat conversationnel — différé V2 (cf. §C.3 + §C.11). Cela ne concerne **pas** les skills hybrides locaux+cloud, qui restent V1.

#### C.2.1. Migration alembic

Aucune nouvelle table. **Extension uniquement** :

```sql
-- Migration : extension métadata audit pour les skills
-- (le champ metadata est déjà JSONB nullable sur llm_call_audit, pas de DDL nécessaire ;
-- on documente juste les nouvelles clés conventionnelles)

-- Compteurs quota — colonnes virtuelles ou simples clés JSONB dans quota_usage
-- (la table quota_usage existante a déjà un champ metadata JSONB pour les compteurs custom).
-- Pas de migration DDL.
```

→ **0h migration**, schemas existants suffisent.

#### C.2.2. Pydantic schemas (nouveaux)

`app/schemas/skills_llm.py` (nouveau fichier) :

```python
class LLMSkillInvokeMode(str, Enum):
    MESSAGES = "messages"
    WITH_SKILLS = "with_skills"

class LLMSkillInvokeRequestBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Traçabilité (audit + corrélation)
    skill_id: str = Field(..., max_length=128)
    step_id: str = Field(..., max_length=128)
    run_id: str = Field(..., max_length=64)

    # LLM hint
    model_tier_hint: Literal["haiku", "sonnet", "opus"] = "sonnet"
    max_tokens: int = Field(2048, ge=1, le=200_000)

    # Discriminator
    mode: LLMSkillInvokeMode

class LLMSkillInvokeMessagesRequest(LLMSkillInvokeRequestBase):
    mode: Literal[LLMSkillInvokeMode.MESSAGES] = LLMSkillInvokeMode.MESSAGES
    system: str | None = Field(None, max_length=200_000)
    messages: list[dict]                              # validé en interne (rôle, content)
    response_format: Literal["json", "text"] = "text"

class LLMSkillInvokeWithSkillsRequest(LLMSkillInvokeRequestBase):
    mode: Literal[LLMSkillInvokeMode.WITH_SKILLS] = LLMSkillInvokeMode.WITH_SKILLS
    betas: list[Literal["skills-2025-10-02", "code-execution-2025-08-25"]]
    container: dict                                   # { "skills": [{"type": "anthropic", "skill_id": "docx"}] }
    tools: list[dict]                                 # [{"type": "code_execution_20250825", "name": "code_execution"}]
    messages: list[dict]

# Discriminated union
LLMSkillInvokeRequest = Annotated[
    Union[LLMSkillInvokeMessagesRequest, LLMSkillInvokeWithSkillsRequest],
    Field(discriminator="mode"),
]

class LLMSkillFile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., max_length=255)
    mime_type: str
    content_base64: str

class LLMSkillInvokeMetadata(BaseModel):
    model_used: str                                   # ex "anthropic/claude-sonnet-4-5"
    tokens_in: int
    tokens_out: int
    credits_consumed: int                              # int = millicrédits Azy
    duration_ms: int

class LLMSkillInvokeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    response: str | dict                               # str si text, dict si JSON parsed
    files: list[LLMSkillFile] = Field(default_factory=list)   # uniquement avec_skills
    metadata: LLMSkillInvokeMetadata
```

#### C.2.3. Service `SkillsLLMService`

`app/services/skills_llm_service.py` (nouveau fichier) :

```python
class SkillsLLMService:
    def __init__(
        self,
        db: AsyncSession,
        llm_billing: LLMBillingService,
        whitelist: OwnerLlmWhitelistService,
        preference_resolver: EffectivePreferenceResolver,
        mcp_client: MCPClient,
    ): ...

    async def invoke(
        self,
        tenant_id: str,
        user_id: UUID,
        request: LLMSkillInvokeRequest,
    ) -> LLMSkillInvokeResponse:
        # 1. Résoudre model_tier_hint → modèle effectif via package du tenant (RFC-077)
        model_concrete = await self._resolve_model(tenant_id, user_id, request.model_tier_hint)
        if model_concrete is None:
            raise HTTPException(403, detail={"error_code": "skill_model_tier_unsupported", ...})

        # 2. Vérifier whitelist tenant
        if not await self.whitelist.is_model_in_whitelist(tenant_id, model_concrete):
            raise HTTPException(403, detail={"error_code": "skill_model_not_in_whitelist", ...})

        # 3. Vérifier quotas (compteurs spécifiques skills)
        await self._check_skill_quotas(tenant_id, user_id, request)
        # → 429 skill_executions_quota_exceeded ou skill_llm_quota_exceeded

        # 4. Dispatch vers Azy-MCP /api/tools/anthropic/execute
        #    Body construit selon le mode (messages vs with_skills)
        mcp_response = await self.mcp_client.execute(
            tool_id="anthropic",
            operation=request.mode.value,                    # "messages" ou "with_skills"
            params=self._build_anthropic_params(request, model_concrete),
            tenant_id=tenant_id,
            user_id=str(user_id),
        )

        # 5. Calculer crédits + audit
        credits = await self.llm_billing.compute_credits(
            model=model_concrete,
            tokens_in=mcp_response["usage"]["input_tokens"],
            tokens_out=mcp_response["usage"]["output_tokens"],
        )
        await self._audit_call(tenant_id, user_id, request, mcp_response, credits)
        await self._increment_quotas(tenant_id, user_id, credits)

        # 6. Construire la réponse
        return LLMSkillInvokeResponse(
            response=mcp_response["content"],
            files=[
                LLMSkillFile(name=f["name"], mime_type=f["mime_type"], content_base64=f["content_base64"])
                for f in mcp_response.get("files", [])
            ],
            metadata=LLMSkillInvokeMetadata(
                model_used=model_concrete,
                tokens_in=mcp_response["usage"]["input_tokens"],
                tokens_out=mcp_response["usage"]["output_tokens"],
                credits_consumed=credits,
                duration_ms=mcp_response["duration_ms"],
            ),
        )
```

#### C.2.4. Route `POST /api/llm/skills/invoke`

`app/api_routes/skills_llm_routes.py` (nouveau fichier) :

```python
router = APIRouter(prefix="/api/llm/skills", tags=["LLM Skills"])

@router.post("/invoke", response_model=LLMSkillInvokeResponse, status_code=200)
async def invoke_llm_skill(
    request: LLMSkillInvokeRequest,
    auth_context: AuthContext = Depends(get_auth_context),
    service: SkillsLLMService = Depends(get_skills_llm_service),
):
    return await service.invoke(
        tenant_id=auth_context.tenant_id,
        user_id=auth_context.user_id,
        request=request,
    )
```

Auth : Firebase JWT obligatoire (pas Service Token — c'est le browser user qui appelle).

#### C.2.5. Audit metadata enrichi

Pas de migration. Conventions JSONB sur `llm_call_audit.metadata` :

```jsonc
{
  "skill_id": "progression_pedagogique",
  "step_id": "render_docx",
  "run_id": "abc123",
  "mode": "with_skills",                // discriminator
  "with_skills_betas": ["skills-2025-10-02", "code-execution-2025-08-25"],
  "anthropic_skills_used": ["docx"],     // extrait de container.skills[].skill_id
  "files_returned": 1,                   // nombre de fichiers générés (mode with_skills)
  "files_total_size_bytes": 45230,       // somme tailles base64-decoded
  "credits_consumed": 47,                // duplicate du llm_call_audit.cost_eur si présent
  "request_max_tokens": 16000
}
```

→ Permet analytics futurs (« quels skills consomment le plus de crédits », « quels modes sont privilégiés », « taille moyenne des fichiers Office générés »).

#### C.2.6. Quotas dédiés skills

2 nouvelles clés dans `quota_usage` (table tenant existante, pas de DDL) :

| Clé | Reset | Limite par défaut | Erreur typée |
|---|---|---|---|
| `skill_executions_per_day_per_user` | minuit UTC | 50 / user / jour | 429 `skill_executions_quota_exceeded` |
| `skill_tokens_per_day_per_tenant` | minuit UTC | 2 000 000 tokens / tenant / jour | 429 `skill_llm_quota_exceeded` |

Configurable via `tenant_quota_configs.custom_limits` (override admin tenant).

#### C.2.7. Codes erreur typés

| Code | HTTP | Quand |
|---|---|---|
| `skill_model_tier_unsupported` | 403 | `model_tier_hint` n'est pas dans le package du tenant et pas de fallback |
| `skill_model_not_in_whitelist` | 403 | Tenant a désactivé ce modèle via whitelist owner |
| `skill_executions_quota_exceeded` | 429 | Compteur user dépassé |
| `skill_llm_quota_exceeded` | 429 | Compteur tokens tenant dépassé |
| `skill_invalid_payload` | 422 | Pydantic validation (mode mismatch, betas inconnus, …) |
| `skill_anthropic_provider_error` | 502 | N8N retourne échec côté Anthropic |
| `skill_request_timeout` | 504 | N8N timeout (>5min) |

Conventions alignées avec RFC-083 V2 (`_CLASSROOM_SYNC_ERROR_HTTP_STATUS` pattern existant).

#### C.2.8. Tests

| Couverture | Effort |
|---|---|
| Unit Pydantic discriminator (mode messages vs with_skills) + champs interdits | 0.25j |
| Unit `SkillsLLMService.invoke` avec mock MCPClient + branches d'erreur | 0.5j |
| Intégration route avec mock httpx vers MCP Server | 0.25j |

#### C.2.9. Doc

| Doc | Effort |
|---|---|
| `docs/guides/skills-llm-invoke-contract.md` (compagnon front + agent) | 0.25j |
| Ajout dans `INDEX-EXPERTS-PROGRAM-FLOW.md` (l'INDEX devient celui des skills aussi) | 0.1j |

#### C.2.10. Récap effort V1 chat.api

| Composant | Effort |
|---|---|
| Pydantic schemas (`skills_llm.py`) | 0.5j |
| Service `SkillsLLMService` (dispatch + résolution + crédits + audit) | 1j |
| Route `POST /api/llm/skills/invoke` | 0.25j |
| Compteurs quota (2 clés `quota_usage`) | 0.25j |
| Codes erreur typés + mapping HTTP | 0.25j |
| Tests | 1j |
| Doc compagnon | 0.35j |

**Total V1 chat.api : ~3.6j** — aligné avec l'estimation 2-3j de l'annexe externe (un peu plus large car j'inclus quotas + audit metadata + tests).

### C.3. Différé V2 — Skill 100% cloud invoqué par tool-call LLM (chat conversationnel)

> **⚠️ Lecture précise** : ce qui est différé V2 est **uniquement** le déclenchement d'un skill *cloud* depuis le **chat conversationnel** (le LLM produit `tool_call: skill_execute` que chat.api intercepte). **Cela exclut les skills hybrides locaux+cloud** (cas `progression_pedagogique`) qui restent **dans le scope V1** via Flow 2 (orchestration agent local + appels `/api/llm/skills/invoke` pour chaque step LLM cloud). Cf. §C.11 pour la matrice complète.

Le scénario V2 différé concerne uniquement le déclenchement *implicite* via le LLM dans le chat (use case : utilisateur tape "génère-moi une progression" dans le chat → LLM produit `tool_call: skill_progression_pedagogique` → chat.api intercepte sur `/ws/mcp/execute/{conv_id}` et exécute le skill côté Azy-MCP).

**Composants V2 à livrer plus tard** (estimation indicative) :

| Composant V2 | Effort |
|---|---|
| Interception JSON-RPC dans `app/api_routes/mcp_websocket_routes.py:/ws/mcp/execute/{conv_id}` | 1.5j |
| `SkillGateService` (gate complet — RBAC visibility, ownership, résolution package skill) | 1j |
| Endpoint REST direct `POST /api/skills/{name}/execute` (bouton UI Quick-Action serveur, §5.4.2 front) | 0.5j |
| Permission RBAC `skill:read` / `skill:execute` / `skill:upload` + seed | 0.5j |
| Endpoint pipeline metadata (Q10 §11.2 — `GET /api/skills/{name}` étendu) | 0.5j |
| Sémantique `skill_execute` côté tool-call LLM (1 tool générique vs 1 tool par skill — cf. expert point 6) | 0.5j |
| Tests V2 | 1j |

**Total V2 chat.api** : **~5.5j** (à attaquer quand le besoin chat conversationnel des skills cloud arrive).

→ Ce différé V2 réutilise **intégralement** le service `SkillsLLMService` livré en V1 — pas de duplication. V2 ajoute uniquement la couche d'interception WS + gate skill (RBAC + ownership + résolution package) **par-dessus** le gate LLM déjà fait par V1.

### C.4. Décisions clés actées (synthèse)

| # | Décision | Statut |
|---|---|---|
| 1 | Endpoint chat.api `POST /api/llm/skills/invoke` (Pydantic discriminator `mode`) | ✅ Acté |
| 2 | Ne **pas** dupliquer `SkillExecutor` côté chat.api — c'est l'agent local qui pilote (option B pause/reprise) | ✅ Acté |
| 3 | 2 workflows N8N distincts (`llm-call-messages`, `claude-call-with-skills`) consommés via Azy-MCP `/api/tools/anthropic/execute` | ✅ Acté côté back |
| 4 | Décompte crédits côté chat.api dans `LLMBillingService`, audit dans `llm_call_audit.metadata` JSONB | ✅ Réutilise existant |
| 5 | 2 quotas spécifiques skills (`skill_executions_per_day_per_user`, `skill_tokens_per_day_per_tenant`) | ✅ Pattern `quota_usage` étendu |
| 6 | Flow 1 (interception WS MCP) **différé V2** | ✅ Acté |
| 7 | Pas de table skills côté chat.api (catalogue côté Azy-MCP / agent local) | ✅ Acté |

### C.5. Prochaines étapes (mise à jour 2026-05-11)

1. **Greenlight produit** sur l'effort V1 révisé (~10j chat.api : ~5.6j invoke + ~4.4j catalogues, cf. §C.13/§C.14).
2. **🚧 Gate de déploiement V1 — webhook N8N `claude-call-with-skills`** *(bloquant 1 expert §C.10.1)* : workflow N8N qui pilote l'API Anthropic en mode `with_skills` (avec `betas` + `container.skills` + Files API base64 download) **doit être livré et validé end-to-end** avant la mise en prod du back V1. Estimation 1-2j DevOps/N8N. Spec contrat dans `docs/guides/skills-n8n-anthropic-contract.md` (à créer DevOps + back).
3. **Coordination Azy-MCP** : exposer `/api/tools/anthropic/execute` avec opérations `messages` et `with_skills`. Réutiliser le pattern `MCPBatchClient` RFC-072 pour le mode batch.
4. ~~Clarification §6.5.1 par l'équipe Local Agent~~ → **✅ Tranchée 2026-05-11 — option B actée** (cf. §6.5.1 mis à jour). Plus de bloquant.
5. **🚧 Coordination Local Agent** : implémenter le pattern pause/reprise (`POST /api/skills/runs/{run_id}/continue`) côté agent local. Estimation hors scope chat.api.
6. **PR back en 2 PR parallèles** *(cf. §C.13)* :
   - **PR-A** `feat/rfc-085-skills-llm-invoke` (~5.6j) — peut démarrer **immédiatement**, autonome, testable avec mocks
   - **PR-B** `feat/rfc-085-skills-catalogs` (~4.4j) — peut démarrer en parallèle, dépend de PR-A pour le type `pipeline_summary` (résolu par merge order)
7. **🚧 Réunion archi à 4** *(recommandation expert)* : Front + Backend + Azy-MCP + Local Agent pour officialiser (a) option B (cf. §6.5.1), (b) Chemin B (cf. §C.9 ligne 13), (c) 2 catégories skills V1 (publics/privés) avec front orchestrateur pour la registration des privés.

### C.6. Garde-fous anti-abus (extension Q14)

**Décision produit** (validée 2026-05-08) : il ne suffit pas de plafonner les exécutions / tokens / jour. Il faut empêcher concrètement qu'un user :
- relance le même skill en boucle (anti-spam fin)
- sature en lançant N skills en parallèle (anti-saturation infra)

#### C.6.1. Limite de concurrence — max 3 skills en cours par user

**Compteur** : `skill_concurrent_per_user` dans `quota_usage` tenant, **incrémenté au démarrage** d'un run (mode batch ou sync) et **décrémenté à la complétion** (succès, échec, timeout).

```
Limite : 3 skills running simultanés / user (tenant override possible).
Dépassement → HTTP 429 skill_concurrent_limit_reached avec details:
  { "running_skills": [{ "skill_id", "run_id", "started_at" }], "limit": 3 }
```

**Implémentation** :
- Lock atomique Redis `skill:concurrent:<tenant>:<user>` (incrément + check < limit dans une transaction Lua ou WATCH/MULTI)
- TTL 1h par défaut (au cas où un run crash sans décrémenter — auto-libération)
- Décrément déclenché par : succès, échec, timeout, callback batch (mode async)

#### C.6.2. Cooldown anti-relance (anti-spam)

**Compteur** : Redis key `skill:cooldown:<tenant>:<user>:<skill_id>` avec TTL configurable, écrit au démarrage d'un run.

```
Si la key existe → HTTP 429 skill_cooldown_active avec details:
  { "skill_id", "retry_after_seconds": 27 }
```

**Défauts** :
- 30 secondes par défaut entre 2 relances du **même** `skill_id` par le **même** user
- Configurable par skill via metadata frontmatter `min_seconds_between_runs: 60` (le SkillExecutor remonte cette info à chat.api en contexte du run)
- Configurable par tenant via `tenant_quota_configs.skill_cooldowns` JSONB

→ Empêche les boucles de retries (timer côté front, click multiple, agent qui retry sans backoff, etc.).

#### C.6.3. Quotas globaux (rappel Q14 actée + extension)

| Compteur | Reset | Défaut | Code erreur |
|---|---|---|---|
| `skill_executions_per_day_per_user` | minuit UTC | 50 / user / jour | 429 `skill_executions_quota_exceeded` |
| `skill_tokens_per_day_per_tenant` | minuit UTC | 2 000 000 tokens / tenant / jour | 429 `skill_llm_quota_exceeded` |
| **`skill_concurrent_per_user`** *(nouveau)* | runtime | 3 | 429 `skill_concurrent_limit_reached` |
| **`skill:cooldown:<skill_id>` Redis** *(nouveau)* | TTL custom | 30s | 429 `skill_cooldown_active` |

→ **4 garde-fous complémentaires** : journalier (volume), tokens (budget), concurrent (saturation infra), cooldown (anti-spam fin).

### C.7. Routage batch — réutilisation RFC-072

**Décision** (validée 2026-05-08) : les appels LLM skills sont **batchés par défaut**, pas envoyés en direct à N8N. Le batch tire 2 bénéfices :

1. **Coût** : Anthropic Message Batches API = **~50% moins cher** que l'API live. Pour des skills qui produisent de gros artefacts (.docx 16k tokens out + grand contexte), c'est substantiel.
2. **Robustesse** : pas de timeout HTTP de 5min côté chat.api → N8N → Anthropic. Le batch traite en asynchrone (latence 1-30 min typique, max 24h).

**Plomberie déjà livrée par RFC-072** :

| Composant | Localisation | Réutilisable ? |
|---|---|---|
| `MCPBatchClient` | `app/clients/mcp_batch_client.py` | ✅ — méthodes `submit/get_status/stream_results/cancel` |
| Schémas batch | `app/schemas/batch/batch_schemas.py` | ✅ — `BatchSubmitRequest`, `BatchResultItem` |
| Réconciliation | `app/services/batch_reconcile.py` | ✅ — Celery worker batch_reconcile |
| Audit batch | `llm_call_audit` avec `cached_tokens_in`, `mode='batch'` (RFC-PC-2) | ✅ |
| Endpoint MCP batch | `MCP_SERVER_URL/batch/*` (Azy-MCP) | ✅ |

**Endpoint chat.api adapté** : `POST /api/llm/skills/invoke` accepte un nouveau paramètre `execution_mode`.

```jsonc
{
  "skill_id": "progression_pedagogique",
  "step_id": "render_docx",
  "run_id": "abc",
  "execution_mode": "batch" | "sync",      // ← NOUVEAU — défaut "batch"
  "max_wait_seconds": 600,                   // ← NOUVEAU — pour mode batch, plafond polling avant 504

  "mode": "with_skills",                     // mode discriminator Anthropic (inchangé)
  // ... le reste inchangé
}
```

**Comportement par mode `execution_mode`** :

| `execution_mode` | Comportement | Use case |
|---|---|---|
| `"batch"` (défaut) | chat.api soumet via `MCPBatchClient.submit`, **bloque côté serveur** en attendant la complétion (long-polling Azy-MCP) jusqu'à `max_wait_seconds`. Si timeout dépassé → 202 + `task_id` retourné, l'agent local poll via `GET /api/llm/skills/tasks/{task_id}`. | Génération `.docx`, raisonnement long, livrables non urgents |
| `"sync"` | Appel direct (mode actuel proposé v0.3 annexe externe) — non batché. | Steps rapides où la latence batch (1-30 min) est inacceptable |

**Choix par défaut côté agent local** : `execution_mode: "batch"` automatique. Override `sync` uniquement si le skill déclare `latency_sensitive: true` dans son frontmatter (signal explicite).

#### C.7.1. Pattern long-polling vs full async

**Pattern retenu V1** : **long-polling côté chat.api** avec timeout configurable.

- Le browser fait `POST /api/llm/skills/invoke` (sync HTTP du POV browser)
- chat.api soumet le batch et **attend** la complétion (jusqu'à `max_wait_seconds`, défaut 600s = 10min)
- Si batch fini avant timeout : réponse 200 standard avec `response`/`files`/`metadata`
- Si timeout : réponse 202 `{ task_id, estimated_completion }`. Le browser passe alors en polling `GET /api/llm/skills/tasks/{task_id}` (intervalle 10s).

**Avantage** : la majorité des skills se complètent dans la fenêtre 10min → flow simple côté agent (pas besoin d'implémenter un état "waiting_batch" côté `SkillExecutor`). Seuls les rares cas long-running basculent en polling.

**Inconvénient** : connexions HTTP ouvertes plus longtemps côté chat.api (10min × N skills concurrents = pression sur le pool uvicorn). Atténué par la limite `skill_concurrent_per_user = 3`.

#### C.7.2. Endpoints additionnels pour le mode batch

**Ajout au scope V1** :

| Méthode + Path | Auth | Description |
|---|---|---|
| `POST /api/llm/skills/invoke` (déjà prévu) | JWT user | Submit + long-poll. Si timeout → 202 + `task_id`. |
| **`GET /api/llm/skills/tasks/{task_id}`** *(nouveau)* | JWT user (créateur du run) | Poll status. Retourne `pending` / `running` / `completed` / `failed` / `expired`. Si `completed` : retourne le payload final identique à la 200 sync. |
| **`DELETE /api/llm/skills/tasks/{task_id}`** *(nouveau)* | JWT user (créateur) | Annule un batch en cours (via `MCPBatchClient.cancel`). Crédit non reversé (déjà engagé Anthropic). |

#### C.7.3. Audit + crédits en mode batch

- Crédits **engagés** au moment du `submit` (estimation pessimiste sur `max_tokens`).
- Crédits **réconciliés** à la complétion (delta tokens estimés vs réels) — pattern RFC-PC-2 livré.
- Audit dans `llm_call_audit` avec `metadata.execution_mode = "batch"`, `metadata.task_id`, `metadata.batch_provider_id`.
- En cas d'annulation : crédits engagés perdus (audit `metadata.cancelled = true`).

### C.8. Récap effort V1 chat.api révisé (avec batch + garde-fous)

| Composant | Effort | Source |
|---|---|---|
| Pydantic schemas (`skills_llm.py`) — incl. `execution_mode`, `task_id` | 0.5j | §C.2.2 |
| Service `SkillsLLMService` (résolution + crédits + audit + dispatch sync **OU** batch via `MCPBatchClient`) | 1.25j | §C.2.3 |
| Route `POST /api/llm/skills/invoke` avec long-polling | 0.5j | §C.2.4 |
| Routes `GET/DELETE /api/llm/skills/tasks/{task_id}` | 0.5j | §C.7.2 |
| Compteurs quota (4 mécanismes — journalier, tokens, **concurrent**, **cooldown**) | 0.75j | §C.6 |
| Garde-fou Redis lock (atomique concurrent + cooldown TTL) | 0.5j | §C.6.1 + §C.6.2 |
| Codes erreur typés (9 codes — incl. `skill_concurrent_limit_reached`, `skill_cooldown_active`) | 0.25j | §C.2.7 |
| Tests unit + intégration (path sync + path batch + 4 garde-fous) | 1j | §C.2.8 |
| Doc compagnon front + agent (incl. `execution_mode` + polling) | 0.35j | §C.2.9 |

**Total V1 chat.api révisé : ~5.6j** (vs ~3.6j initial — +2j pour batch + garde-fous).

→ Justifié : le batch fait **gagner ~50% de coût LLM** sur tous les skills production, et les garde-fous protègent l'infra contre des patterns d'abus connus (boucles retry, click rage, lancement en parallèle non contrôlé).

### C.9. Décisions clés actées (synthèse mise à jour)

| # | Décision | Statut |
|---|---|---|
| 1 | Endpoint chat.api `POST /api/llm/skills/invoke` (Pydantic discriminator `mode`) | ✅ Acté |
| 2 | Pas de `SkillExecutor` côté chat.api — agent local pilote (option B) | ✅ Acté |
| 3 | 2 workflows N8N distincts (`llm-call-messages`, `claude-call-with-skills`) consommés via Azy-MCP | ✅ Acté côté back |
| 4 | Décompte crédits côté chat.api dans `LLMBillingService`, audit dans `llm_call_audit.metadata` JSONB | ✅ Réutilise existant |
| 5 | Quotas journaliers + tokens (Q14 v1) | ✅ Acté |
| 6 | **Garde-fou concurrence max 3 skills / user** *(nouveau Q14 v2)* | ✅ Acté |
| 7 | **Cooldown anti-spam 30s entre 2 relances du même skill / user** *(nouveau Q14 v2)* | ✅ Acté |
| 8 | **Batch par défaut** pour les appels LLM skills (Anthropic Message Batches via `MCPBatchClient` RFC-072), opt-out `sync` pour latency-sensitive | ✅ Acté |
| 9 | Long-polling côté chat.api (10min) avec fallback `task_id` polling | ✅ Acté |
| 10 | 2 endpoints additionnels `GET /api/llm/skills/tasks/{task_id}` + `DELETE` | ✅ Acté |
| 11 | **Skills hybrides locaux+cloud (cas `progression_pedagogique`) supportés en V1** *(clarification post-revue expert)* | ✅ Acté |
| 12 | Skill 100% cloud déclenché par tool-call LLM dans le chat conversationnel **différé V2** *(seul scénario réellement différé)* | ✅ Acté |
| 13 | **§7.4.6 Chemin B confirmé back** : chat.api est l'unique gate LLM (whitelist + package + quota + audit + crédits) — N8N reste « dumb pipe » | ✅ Acté |
| 14 | ~~Pas de table skills côté chat.api~~ → **2 tables ajoutées V1** : `public.skills` (publics) + tenant `user_skills` (privés) *(décision produit 2026-05-11)* | ✅ Refondu |
| 15 | **Skills publics** : catalogue table publique chat.api, fichiers azy.mcp, registration superadmin via `POST /api/admin/skills/` | ✅ Acté |
| 16 | **Skills privés** : catalogue table tenant chat.api, fichiers agent local user, registration front orchestrateur via `POST /api/skills/register` (métadonnées seulement, pas de fichiers) | ✅ Acté |
| 17 | **Version VARCHAR(32) NULL libre** sur les 2 tables — pas de semver imposé, pas de table `skill_versions` séparée V1 | ✅ Acté |
| 18 | **PR back en 2 PR parallèles** : PR-A invoke (5.6j) + PR-B catalogues (4.4j) = **10j total V1 chat.api** | ✅ Acté |
| 19 | **Option B (pause/reprise côté agent local) actée par les 4 équipes** — §6.5.1 mis à jour, plus de divergence avec Annexe C | ✅ Acté 2026-05-11 |

### C.10. Réponse aux recommandations de l'expert (revue 2026-05-08)

> Adresse point par point les 3 bloquants + 8 points d'attention soulevés
> par l'expert dans la section « Analyse expert » du présent RFC.

#### C.10.1. Bloquant 1 — Mode `with_skills` non spécifié côté N8N

**Position back** : le scope back V1 est prêt. `POST /api/llm/skills/invoke` accepte le mode `with_skills` avec `betas` + `container.skills` + `tools` validés Pydantic et forwardés tels quels via `MCPClient.execute(operation="with_skills", ...)`. La logique Anthropic Files API + base64 download est **côté N8N** (workflow `claude-call-with-skills` à livrer DevOps).

**Action** : ce point est une **dépendance bloquante DevOps/N8N**, pas un blocage back. Promu en §C.5 prochaines étapes comme **gate de déploiement V1** : le webhook `claude-call-with-skills` doit être livré et validé end-to-end avant la mise en prod du back V1. Spec input/output back ↔ N8N ↔ Anthropic à formaliser dans `docs/guides/skills-n8n-anthropic-contract.md` (à créer DevOps + back).

#### C.10.2. Bloquant 2 — Skills hybrides reportés V2 ⚠️ **LEVÉ**

**Position back** : la lecture initiale de §6.5.1 par l'expert est juste, mais le scope back V1 est **déjà aligné avec le besoin** `progression_pedagogique`. Décomposition explicite du pipeline `progression_pedagogique` mappé au scope V1 :

| Step pipeline | Type step | Cible | Supporté par V1 chat.api ? |
|---|---|---|---|
| `parse_referentiel.py` | `script` | Local (agent) | n/a (chat.api pas concerné) |
| `build_calendar.py` | `script` | Local (agent) | n/a (chat.api pas concerné) |
| `generate_progression` | `llm_call mode=messages` | Cloud (Anthropic via N8N) | ✅ V1 — `/api/llm/skills/invoke` mode `messages` |
| `render_docx` | `llm_call mode=with_skills` | Cloud (Anthropic Files API) | ✅ V1 — `/api/llm/skills/invoke` mode `with_skills` |

→ **`progression_pedagogique` est livrable V1**. L'agent local pilote le pipeline (option B pause/reprise), exécute les 2 steps locaux lui-même, et appelle 2 fois `/api/llm/skills/invoke` pour les 2 steps cloud. Aucun composant chat.api manquant.

**Action** : §C.3 réécrite (cf. ci-dessus) pour lever définitivement l'ambiguïté terminologique « hybride ». Le mot « hybride » dans la RFC signifie **uniquement** « pipeline mêlant `target: local` (scripts) et `target: cloud` (LLM steps) » — supporté V1. Ne **pas** confondre avec « skill 100% cloud déclenché par tool-call LLM dans le chat » (V2).

→ **§6.5.1 (côté agent local) reste à clarifier** par l'équipe Local Agent : le wording « seuls les skills entièrement locaux supportés en PR initiale » est **incohérent** avec le scope back V1. Recommandation : remplacer par « les skills hybrides sont supportés via orchestration multi-step de l'agent appelant `chat.api/api/llm/skills/invoke` pour chaque step cloud ».

#### C.10.3. Bloquant 3 — Pas de pattern résumable

**Position back** : **levé sans action additionnelle**. `POST /api/llm/skills/invoke` est **stateless par step** par construction. Chaque appel = 1 step LLM indépendant, le state du run (résultats des steps précédents, variables `$steps.X.Y`, etc.) est porté par l'**agent local** dans son `RunRegistry` (cf. §6.3.3 `POST /api/skills/runs/{run_id}/continue`). Pattern option B implémenté de bout en bout.

→ **Aucune duplication de logique frontend** : le frontend orchestre la navette `agent ↔ chat.api` via le composable `useSkillRunner` (cf. Annexe D §D.2), mais ne **réinterprète pas** le pipeline. C'est l'agent qui détient la logique pipeline.

#### C.10.4. Point 4 — Confusion `target` vs `mode`

**Position back** : axe `target` (local/cloud) **absent côté chat.api par construction** — chat.api ne reçoit **jamais** de step `target: local` (l'agent local exécute lui-même les steps locaux et n'appelle pas chat.api pour ça). Donc côté Pydantic chat.api :

- Champ `target` : **non présent** dans `LLMSkillInvokeRequestBase`
- Champ `mode` : **présent** comme discriminator (`messages` | `with_skills`)
- La combinaison invalide `target: local + mode: with_skills` ne peut pas atteindre chat.api → pas de validation cross-axe nécessaire côté back

**Action** : §C.2.2 inchangé. À documenter dans le guide compagnon : *« chat.api ne traite que les steps `target: cloud`. Les steps `target: local` sont gérés par l'agent. »* Côté agent local + frontmatter SKILL.md, l'expert recommande d'**unifier** `type: llm_call` + sous-champs `target` + `mode` — recommandation transmise à l'équipe Local Agent (hors scope back).

#### C.10.5. Point 5 — Upload skills BDD vs filesystem ⚠️ **REFONDU 2026-05-11**

**Position back révisée (post-décision produit 2026-05-11)** : la distinction est désormais cleanement actée en V1 via **2 catégories disjointes** côté chat.api (cf. §6.1 mis à jour + §C.12 ci-dessous) :

| Type | Catalogue chat.api | Fichiers physiques | Acteur registration |
|---|---|---|---|
| **Skills publics** | Table publique `public.skills` | Filesystem azy.mcp | Superadmin via UI admin (chat.api) |
| **Skills privés** | Table tenant `user_skills` | Filesystem agent local (`~/azy-workspace/skills/`) | Frontend orchestrateur (POST métadonnées seulement, pas de fichiers) |

→ L'ancien endpoint `POST /api/skills/upload` (avec ZIP) **est abandonné**. Aucun fichier ne transite par chat.api — uniquement les métadonnées (frontmatter parsé + chemins de référence).

→ Le principe §6.3.1.1 « le client décide tout » **est respecté** : pour les privés, le user manipule librement son filesystem local, le front re-scan via l'agent local quand le user clique « Recharger », et seules les métadonnées remontent à chat.api pour le catalogue tenant.

→ **Scope upload skills réintégré V1** côté back via PR-B (catalogues). Cf. §C.13 stratégie de PR et §C.12 schémas DB.

#### C.10.6. Point 6 — Sémantique du tool `skill_execute` côté LLM

**Position back** : différé V2 (composant Flow 1 — chat conversationnel). **Pas dans le scope V1 chat.api**. Quand V2 arrivera, recommandation back = **option « tool générique avec descriptions de skills disponibles dans le system prompt »** (l'expert pencherait dans ce sens), pour éviter l'explosion de tokens à chaque conversation. À trancher en revue archi V2.

#### C.10.7. Point 7 — §7.4.6 Chemin A vs B (gate text-generator)

**Position back** : **Chemin B confirmé**. chat.api est l'unique gate LLM en V1 (whitelist + package + quota + audit + crédits). N8N reste un « dumb pipe » qui transporte les credentials vers Anthropic mais n'effectue **aucun** contrôle métier.

→ Cette décision était implicite dans §C.1 (« décompte crédits côté chat.api ») mais l'expert a raison de demander qu'elle soit **explicitée**. Maintenant actée dans §C.9 ligne 13.

→ Conséquence opérationnelle : le webhook `text-generator` doit, à terme, **rejeter tout appel qui ne provient pas de chat.api** (Service Token attestant l'origine chat.api → Azy-MCP → N8N). Cf. §7.4.3 + §C.5 prochaines étapes — coordination DevOps/N8N + Azy-MCP.

#### C.10.8. Point 8 — §6.3.5 Discoverability minimaliste

**Position back** : ce sujet concerne l'**agent local** (`GET /api/skills?path=...`), **pas chat.api**. Recommandation expert (exposer `parameters` schema, statut validation, modèles compatibles) à transmettre à l'équipe Local Agent. Hors scope back.

#### C.10.9. Point 9 — Auth agent local & perte tenant_id

**Position back** : sujet agent local. Côté chat.api, le `tenant_id` est résolu **côté chat.api** depuis le Firebase JWT du user (mécanisme RFC-079 et autres). Quand le frontend orchestre la navette agent ↔ chat.api, l'appel `/api/llm/skills/invoke` est authentifié via Firebase JWT (qui contient les claims tenant) — donc **chat.api connaît toujours le tenant**, indépendamment du fait que l'agent local le connaisse ou non.

→ Pour l'agent local : recommandation back = passer `tenant_id` explicitement dans le payload `/api/skills/{name}/execute` côté agent (sera juste utilisé pour audit local + corrélation), comme suggéré par l'expert. Hors scope back.

#### C.10.10. Point 10 — Streaming SSE côté agent

Sujet agent local. Pas d'impact chat.api (côté chat.api, le mode batch + long-polling rend le streaming pas pertinent à ce niveau).

#### C.10.11. Point 11 — Quotas Q14 « probablement V1.1 »

**Position back** : **maintenu V1**. Décision produit prise (cf. §C.6 garde-fous). Le risque d'un user faisant exploser le budget est **réel dès le pilote** (Anthropic Opus avec contexte 200k = ~10€/run en mode `with_skills` Files API). Ne pas attendre V1.1.

→ 4 garde-fous cumulés (journalier user + tokens tenant + concurrent user + cooldown skill_id) acté V1 conformément à §C.6.

### C.11. Matrice V1/V2 — Périmètre chat.api après revue expert

Pour lever toute ambiguïté future, voici la matrice complète des cas d'usage skills, avec leur statut côté chat.api :

| # | Cas d'usage | Déclencheur | Pipeline | Mode LLM | Statut V1 chat.api |
|---|---|---|---|---|---|
| 1 | Skill 100% local sans LLM | Bouton UI, Quick-Action front, ou agent local | `script` only | n/a | ✅ V1 *(chat.api pas impliqué — agent autonome)* |
| 2 | Skill 100% local avec LLM Ollama | idem | `script` + `llm_call target: local` | `messages` | ✅ V1 *(chat.api pas impliqué — Ollama est local)* |
| 3 | **Skill hybride local+cloud (= `progression_pedagogique`)** | Bouton UI ou Quick-Action front → agent local | `script` (local) + `llm_call target: cloud mode: messages` (chat.api) + `llm_call target: cloud mode: with_skills` (chat.api Files API) | mix `messages` + `with_skills` | ✅ **V1** *(scope cible — `/api/llm/skills/invoke`)* |
| 4 | Skill 100% cloud lancé par bouton UI front | Bouton UI dédié | `llm_call target: cloud` only | `messages` ou `with_skills` | ✅ **V1** *(cas particulier de #3 sans steps locaux)* |
| 5 | Skill 100% cloud invoqué par tool-call LLM dans le chat conversationnel | LLM produit `tool_call: skill_execute` durant chat | `llm_call target: cloud` only | `messages` ou `with_skills` | 🔮 **V2 différé** *(interception WS MCP + gate skill `SkillGateService`)* |
| 6 | Skill hybride invoqué par tool-call LLM dans le chat | LLM produit `tool_call: skill_execute` mais le pipeline contient des steps locaux | mix | mix | 🔮 **V2 différé** *(suppose qu'au moment du tool-call dans le chat, on bascule sur l'agent local pour exécution complète — V2 Flow 1 + délégation)* |

**Conclusion** : V1 chat.api couvre **les cas 3 et 4** — soit l'intégralité des skills déclenchés par le frontend ou un bouton UI, **incluant les skills hybrides** comme `progression_pedagogique`. V2 ajoute uniquement le déclenchement implicite via tool-call dans le chat conversationnel (cas 5 et 6).

→ **Le bloquant 2 expert est levé**. `progression_pedagogique` est en V1.

### C.12. Schémas DB des catalogues skills (V1 — ajouté 2026-05-11)

> Décision produit 2026-05-11 : les skills sont gérés par 2 catalogues
> disjoints côté chat.api — publics (table publique) et privés (table
> tenant). Cf. §6.1 mis à jour pour le mapping fonctionnel.

#### C.12.1. Table publique `public.skills`

| Colonne | Type | Nullable | Contrainte / défaut | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | PK, `gen_random_uuid()` | Identifiant interne |
| `slug` | VARCHAR(128) | NOT NULL | UNIQUE | Clé naturelle URL-safe (ex. `progression-pedagogique`) |
| `name` | VARCHAR(128) | NOT NULL | | Nom d'affichage |
| `description` | TEXT | NULL | | Issue du frontmatter |
| `version` | VARCHAR(32) | NULL | aucune (format libre) | Optionnelle — pas de semver imposé |
| `mcp_path` | TEXT | NOT NULL | | Chemin filesystem azy.mcp |
| `pipeline_summary` | JSONB | NOT NULL | défaut `'[]'::jsonb` | Steps `(id, type, target, mode)` |
| `parameters_schema` | JSONB | NOT NULL | défaut `'{}'::jsonb` | Pour formulaire Modal front |
| `required_package_code` | VARCHAR(64) | NULL | | Package requis (RFC-077). NULL = accessible à tous |
| `tier_required` | VARCHAR(16) | NULL | CHECK IN (`haiku`, `sonnet`, `opus`) | Tier LLM min requis |
| `enabled` | BOOLEAN | NOT NULL | défaut `true` | Publication on/off (soft-delete) |
| `created_by_user_id` | UUID | NOT NULL | FK `public.users.id` | Superadmin créateur |
| `created_at` | TIMESTAMPTZ | NOT NULL | défaut `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | défaut `now()` + trigger | |

**Index** : `(slug)` unique, `(enabled, required_package_code) WHERE enabled = true` partiel.

#### C.12.2. Table tenant `user_skills`

| Colonne | Type | Nullable | Contrainte / défaut | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | PK, `gen_random_uuid()` | Identifiant interne (utilisé comme `skill_id` côté `/invoke`) |
| `owner_user_id` | UUID | NOT NULL | FK tenant `users.id` | User propriétaire (scoping read/write) |
| `directory_name` | VARCHAR(255) | NOT NULL | UNIQUE avec `owner_user_id` | Nom du dossier local — clé naturelle pour ré-import idempotent |
| `name` | VARCHAR(128) | NOT NULL | | Nom d'affichage (depuis frontmatter) |
| `description` | TEXT | NULL | | Depuis frontmatter |
| `version` | VARCHAR(32) | NULL | aucune (format libre) | Optionnelle |
| `local_path` | TEXT | NOT NULL | | Chemin absolu côté agent local |
| `pipeline_summary` | JSONB | NOT NULL | défaut `'[]'::jsonb` | Steps pour UI |
| `parameters_schema` | JSONB | NOT NULL | défaut `'{}'::jsonb` | Pour formulaire Modal |
| `frontmatter_raw` | TEXT | NULL | | Copie brute (debug + reparse si schéma évolue) |
| `enabled` | BOOLEAN | NOT NULL | défaut `true` | User peut désactiver sans supprimer |
| `last_synced_at` | TIMESTAMPTZ | NOT NULL | défaut `now()` | Mis à jour à chaque PATCH (rechargement front) |
| `created_at` | TIMESTAMPTZ | NOT NULL | défaut `now()` | |
| `updated_at` | TIMESTAMPTZ | NOT NULL | défaut `now()` + trigger | |

**Index** : `(owner_user_id, directory_name)` unique, `(owner_user_id, enabled) WHERE enabled = true` partiel.

#### C.12.3. Note sur le versioning

- **`VARCHAR(32) NULL`** sur les 2 tables — **pas de contrainte semver**.
- Format libre : `1.0.0`, `2025-05`, `draft`, `v2-beta`, ou `NULL` acceptés.
- Pour les publics, l'UI superadmin **encourage** semver mais ne **bloque** pas.
- **Pas de table `skill_versions` séparée V1** — si un user veut versionner un privé, il duplique le dossier (ex. `mon_skill_v2/`) → nouveau `directory_name` → nouvelle ligne `user_skills`.

#### C.12.4. Endpoints catalogues V1 (récap)

| Méthode | Path | Auth | Description |
|---|---|---|---|
| `GET /api/skills/` | JWT user | Liste **union** publics filtrés (par `required_package_code` + `tier_required`) + privés de l'`owner_user_id` |
| `GET /api/skills/{id}` | JWT user | Détail. `id` peut être un `public.skills.id` ou un `tenant.user_skills.id` — le service détermine le scope par lookup |
| `POST /api/skills/register` | JWT user | Crée une entrée `user_skills` tenant. Body : `{ directory_name, name, local_path, description?, version?, pipeline_summary, parameters_schema, frontmatter_raw? }`. Erreur 409 si `(owner_user_id, directory_name)` déjà pris. |
| `PATCH /api/skills/{id}` | JWT user (owner) | Met à jour les métadonnées d'un privé. Body : sous-set des champs (PATCH partiel). `last_synced_at` auto. 403 si l'`id` est public ou si l'user n'est pas owner. |
| `DELETE /api/skills/{id}` | JWT user (owner) | Supprime une ligne `user_skills`. Les fichiers locaux ne sont **pas** touchés. 403 si public ou non-owner. |
| `POST /api/admin/skills/` | JWT superadmin | Crée une entrée `public.skills`. Body : tous les champs publique. |
| `PUT /api/admin/skills/{id}` | JWT superadmin | Update complet (PUT) d'un public. |
| `DELETE /api/admin/skills/{id}` | JWT superadmin | Soft-delete (`enabled=false`) — pas de DROP. |

### C.13. Stratégie de PR — 2 PR parallèles (V1 chat.api ~10j total)

| PR | Branche | Scope | Effort |
|---|---|---|---|
| **PR-A** | `feat/rfc-085-skills-llm-invoke` | LLM cloud step endpoint (`/api/llm/skills/invoke`) + garde-fous + quotas + erreurs + tests + doc | **~5.6j** |
| **PR-B** | `feat/rfc-085-skills-catalogs` | Tables `public.skills` + tenant `user_skills` + modèles + services CRUD + 8 endpoints (5 user + 3 superadmin) + discovery union + tests + doc | **~4.4j** |

**Parallélisation** :
- Pas de fichier commun en conflit. PR-A touche `app/services/skills_llm_service.py`, PR-B touche `app/services/skills_catalog/`.
- Seul point de coordination : enregistrement des routers dans `app/api.py` (résolu trivialement par merge order).
- Wall-clock : ~5-6 jours si 2 devs / 2 sessions parallèles.

**Ordre de merge recommandé** : PR-A en premier (autonome, testable avec mocks) → PR-B ensuite (peut référencer le schéma `skills_llm.py` de PR-A pour le typage du `pipeline_summary`).

### C.14. Récap effort V1 chat.api révisé final

| Bloc | Effort |
|---|---|
| **PR-A — LLM invoke** | |
| Pydantic schemas (`skills_llm.py`) | 0.5j |
| Service `SkillsLLMService` (résolution + crédits + audit + dispatch sync/batch) | 1.25j |
| Routes `POST /invoke` + `GET/DELETE /tasks/{id}` | 1j |
| Garde-fous Redis + compteurs quota (4 mécanismes) | 1.25j |
| 9 codes erreur typés | 0.25j |
| Tests unit + intégration (sync + batch + 4 garde-fous) | 1j |
| Doc compagnon `skills-llm-invoke-contract.md` | 0.35j |
| **Sous-total PR-A** | **5.6j** |
| **PR-B — Catalogues** | |
| Migration `public.skills` (publique) | 0.25j |
| Migration `user_skills` (tenant) | 0.25j |
| Modèles SQLAlchemy + schémas Pydantic | 0.5j |
| `PublicSkillsService` (CRUD + filtrage package/tier) | 0.5j |
| `UserSkillsService` (CRUD tenant + scoping owner) | 0.5j |
| `DiscoveryService` (union publics filtrés + privés du user) | 0.25j |
| Routes (5 user + 3 superadmin) | 1j |
| Tests catalogues | 0.75j |
| Doc compagnon `skills-catalog-contract.md` | 0.4j |
| **Sous-total PR-B** | **4.4j** |
| **Total V1 chat.api** | **~10j** |

→ Doublé vs estimation initiale (5.6j) suite à l'intégration des catalogues. Permet de livrer un V1 cohérent end-to-end : un user peut **enregistrer** un skill privé, **lister** les skills (publics + privés), **invoquer** un step LLM cloud.

---

*Fin de la RFC-085 v0.4 (révision 2026-05-11). Prochaine étape : régénération du package `progression_pedagogique` aligné sur cette RFC, puis spec détaillée des workflows N8N.*

---

## Annexe D — Réponse équipe Front (2026-05-08, post Annexe C)

> Cette annexe consolide la position front après lecture de l'annexe externe
> v0.3 et de l'Annexe C (chat.api). Elle acte les composants front à livrer
> pour le V1 (Flow 2 — skill user local orchestré par le frontend, option
> B pause/reprise) et signale les points d'attention restants.

### D.1. Position front sur l'annexe externe v0.3 + Annexe C

**Aligné** :

| Décision | Position front |
|---|---|
| Flow V1 = Flow 2 (skill local + orchestration front) | ✅ Cohérent avec ce que le front peut livrer rapidement (estimation §8 annexe externe = 1-2j). |
| Option B pause/reprise (agent local pilote, front orchestre) | ✅ Le front fait la navette `localhost:11500` ↔ `chat.api`. Pattern simple. |
| Flow 1 (interception WS MCP) différé V2 | ✅ §5.4 que j'avais rédigé reste pertinent comme spec V2. Pas de code front à écrire dessus en V1. |
| Endpoint chat.api `POST /api/llm/skills/invoke` (discriminator `mode`) | ✅ Aligné §5.4.3 / Annexe C §C.2. |
| 9 codes erreur typés | ✅ À ajouter au catalogue front `apiErrors.ts`. |
| Long-polling chat.api 10min + fallback 202 + `task_id` | 🟡 Acté mais nécessite gestion côté front (cf. §D.3 ci-dessous). |
| Batch par défaut (50% gain coût) | ✅ Transparent côté front (juste passer `execution_mode: "batch"` ou laisser le défaut). |
| 4 garde-fous (journalier, tokens, concurrent, cooldown) | ✅ Front affiche les 4 codes erreur correspondants avec UX adaptée (cf. §D.5). |

### D.2. Composants front à livrer (V1 Flow 2)

| Composant | Effort | Description |
|---|---|---|
| `services/azyLocalAgentApi.ts` | 0.5j | Wrappers REST des 4 endpoints `localhost:11500` (`POST /api/skills/{name}/runs`, `POST /api/skills/runs/{id}/continue`, `GET /api/skills/runs/{id}`, `GET /api/skills`, `POST /api/skills/refresh`, `GET /api/files/read`). Auth Bearer agent_token (≠ Firebase JWT). |
| `services/skillsLlmApi.ts` | 0.25j | Wrappers REST `chat.api` (`POST /api/llm/skills/invoke`, `GET /api/llm/skills/tasks/{task_id}`, `DELETE /api/llm/skills/tasks/{task_id}`). Auth Firebase JWT via `apiService` existant. |
| `composables/useSkillRunner.ts` | 1j | Orchestration boucle pause/reprise : `start(skill_name, params)` → loop `while status === 'needs_llm'` → call chat.api → call agent `/continue` → loop. Gestion long-polling 202 + polling `task_id` (intervalle 10s). Gestion cancellation. |
| `components/skills/SkillRunnerDialog.vue` | 1j | Modal Quick-Action (cf. §8 annexe externe). Affiche progression du pipeline (steps), loader pendant LLM call, bouton Cancel, download du fichier final via `azyLocalAgentApi.readFile()`. |
| `utils/apiErrors.ts` extension | 0.1j | Ajout des 9 codes skills au catalogue + messages FR. |
| `views/SkillsView.vue` (optionnel V1) | 0.5j | Liste des skills disponibles localement (`GET /api/skills`) avec bouton "Lancer" → ouvre `SkillRunnerDialog`. Sinon le déclenchement passe par un Quick-Action existant côté Settings. |
| Tests Vitest (unit composable + service) | 0.5j | Mock axios pour les endpoints + mock fetch agent local. |

**Total V1 front : ~3.85j** (plus large que les 1-2j de l'annexe externe §8 — couvre le composable + tests + gestion long-polling/cancellation).

### D.3. Gestion long-polling 10 minutes — point d'attention front

L'Annexe C §C.7.1 documente un pattern long-polling : `POST /api/llm/skills/invoke` peut bloquer **jusqu'à 10 minutes** côté chat.api. Implications front :

| Aspect | Impact / Mitigation |
|---|---|
| Timeout axios par défaut | Notre `apiService` a un timeout par défaut court (~30s — à vérifier). **Devra être override à 600s** spécifiquement pour cet endpoint (option `timeout: 600_000` côté axios call). |
| Refresh JWT pendant 10min | Si Firebase JWT expire pendant le long-poll (~1h validité par défaut), pas d'impact dans la fenêtre 10min. **Mais si le user enchaîne des skills**, le `getIdToken()` de l'interceptor va auto-refresh à chaque appel — OK natif. |
| Connexion HTTP perdue (réseau coupé, fermeture onglet) | **Le run reste en état `needs_llm` côté agent** (cf. Q3 §10 annexe externe — TTL/GC à définir). Le front doit gérer : si l'utilisateur revient et qu'un `run_id` existe en localStorage, proposer de reprendre. |
| UX pendant 10min | Loader avec : (a) step en cours côté pipeline, (b) message « Cela peut prendre jusqu'à 10 minutes pour les rendus complexes », (c) bouton Cancel actif → `DELETE /api/llm/skills/tasks/{task_id}`. |
| Détection 202 fallback | Si chat.api répond 202 + `task_id`, basculer en polling `GET /api/llm/skills/tasks/{task_id}` toutes les 10s, garder le loader. Continuer jusqu'à `status: completed` ou `failed`. |

**Décision front** : implémenter le pattern complet dans `useSkillRunner.ts` (long-poll → fallback 202 → polling). Pas de réutilisation possible du pattern WebSocket MCP existant (sémantique différente).

### D.4. Codes erreur à ajouter à `apiErrors.ts`

```ts
// utils/apiErrors.ts — extension RFC-085
export const BACKEND_ERROR_MESSAGES: Record<string, string> = {
  // ... codes existants RFC-079/080/082/083/084 ...

  // ─── RFC-085 — Skills ──────────────────────────────────────────────
  skill_model_tier_unsupported:
    'Le tier de modèle demandé par ce skill n\'est pas dans ton package. Demande à ton owner d\'upgrader le package ou utilise un skill avec un tier inférieur.',
  skill_model_not_in_whitelist:
    'Le modèle requis par ce skill a été désactivé par ton tenant. Contacte ton owner.',
  skill_executions_quota_exceeded:
    'Tu as atteint ta limite quotidienne d\'exécutions de skills. Réessaie demain.',
  skill_llm_quota_exceeded:
    'Le quota de tokens LLM pour les skills est dépassé pour ton tenant aujourd\'hui. Réessaie demain ou contacte ton owner.',
  skill_concurrent_limit_reached:
    'Tu as déjà 3 skills en cours d\'exécution. Attends qu\'un se termine ou annule-le avant d\'en lancer un autre.',
  skill_cooldown_active:
    'Tu viens de lancer ce skill. Patiente quelques secondes avant de le relancer.',
  skill_invalid_payload:
    'Le skill a renvoyé un payload invalide. Réessaie ou contacte le support.',
  skill_anthropic_provider_error:
    'Le service Anthropic a renvoyé une erreur — réessaie dans quelques instants.',
  skill_request_timeout:
    'Le skill a dépassé le temps limite (10 minutes). Réessaie ou simplifie le skill.',
}
```

Plus enrichissement `details` pour `skill_concurrent_limit_reached` (afficher la liste des `running_skills` avec leur `started_at`) et `skill_cooldown_active` (afficher `retry_after_seconds`).

### D.5. UX par garde-fou (§C.6 + §C.7)

| Code | UX front |
|---|---|
| `skill_executions_quota_exceeded` (429) | Toast + désactiver le bouton Run de tous les skills jusqu'à minuit UTC. Afficher `Reset dans HH:MM`. |
| `skill_llm_quota_exceeded` (429) | Toast + message « Quota tenant dépassé — contacte ton owner ». Pas de désactivation par user (c'est tenant-wide). |
| `skill_concurrent_limit_reached` (429) | Modal explicite avec liste des 3 skills running (nom + heure de démarrage) + bouton « Annuler » par run (DELETE `/api/llm/skills/tasks/{id}`). |
| `skill_cooldown_active` (429) | Désactiver le bouton Run **du skill concerné** avec compte à rebours basé sur `retry_after_seconds`. Réactiver à 0. |
| `skill_request_timeout` (504) | Toast « Skill trop long, simplifie ou réessaie » + offer un bouton Retry. |
| `skill_anthropic_provider_error` (502) | Toast « Service IA indisponible » + bouton Retry. |

### D.6. Auth — 2 tokens distincts à manipuler côté front

Conséquence de l'archi Flow 2 (option B) : le front parle à **deux backends** distincts avec **deux tokens différents**.

| Backend | URL | Token | Source |
|---|---|---|---|
| **chat.api** | `https://apidev.azy.solutions` (ou env) | Firebase JWT Bearer | Refresh auto via `firebaseAuth.currentUser.getIdToken()` (cf. SYSTEM-ARCHITECTURE.md §2.1.4) |
| **Azy Local Agent** | `http://localhost:11500` | Bearer `<agent_token>` | Pairing manuel à l'install (cf. §10 annexe externe Q1 + §2.8.2 SYSTEM-ARCHITECTURE.md) |

**Impact code** : `services/azyLocalAgentApi.ts` aura sa propre instance axios avec son propre interceptor (Bearer agent_token au lieu de Firebase JWT). Le token agent est stocké côté front en localStorage `azy_agent_token` (à clarifier dans une nouvelle vue Settings → Agent local pour le pairing).

**Sécurité** : aucun risque de leak — les 2 tokens sont scopés différemment. Mais nécessite que l'utilisateur fasse le pairing initial avant de pouvoir utiliser les skills locaux. Une UX d'onboarding du local agent doit être prévue (hors scope V1 ?).

### D.7. Découverte des skills disponibles côté UI

Le front a besoin d'un point d'entrée UI pour lister les skills locaux du user. Deux options :

**Option 1 — `SkillsView.vue` dédiée** : nouvelle route `/skills` avec liste + bouton Run + lien vers le repo git du skill (si dispo). Plus structuré mais nouvelle vue à créer (~0.5j).

**Option 2 — Quick-Actions existantes** : enrichir `ExpertConversationModal` ou similaire pour afficher les skills comme actions déclenchables. Plus rapide mais mélange skills et Quick-Actions experts dans la même UI.

**Décision V1 front** : **Option 1** pour V1 — éviter la confusion avec les Quick-Actions experts (qui sont une autre RFC, RFC-080). Skills = vue dédiée, navigation explicite. Si l'usage croît on pourra les surfacer dans la sidebar Modern Chat plus tard.

### D.8. Récap effort V1 front

| Composant | Effort |
|---|---|
| `services/azyLocalAgentApi.ts` (avec auth Bearer agent_token) | 0.5j |
| `services/skillsLlmApi.ts` (chat.api wrappers) | 0.25j |
| `composables/useSkillRunner.ts` (orchestration + long-polling + cancellation) | 1j |
| `components/skills/SkillRunnerDialog.vue` (Modal Quick-Action) | 1j |
| `views/SkillsView.vue` (liste + déclenchement) | 0.5j |
| Extension `apiErrors.ts` (9 codes) + UX par garde-fou | 0.25j |
| Pairing UI agent local (Settings → Agent) | 0.5j |
| Tests Vitest (composable + services) | 0.5j |

**Total V1 front : ~4.5j** (vs 1-2j estimé §8 annexe externe — l'estimation initiale ne couvrait pas l'auth agent, le pairing UI, la gestion long-polling, ni les tests).

### D.9. Points encore à trancher

1. **Pairing UI agent local** : où ? Nouvelle route `Settings → Agent local` ou intégré dans onboarding initial ? Bloque l'usage des skills tant que pas pairé.
2. **Token agent storage** : localStorage cleartext ou IndexedDB chiffré ? Le token agent donne accès au filesystem user via `~/azy-workspace`, mérite un peu de hardening même si scopé local.
3. **Reprise de run zombie** (Q3 §10 annexe externe) : si le browser crash entre étape ② et ③, comment reprendre ? Endpoint `GET /api/skills/runs/{run_id}` existe — proposer un toast « Run en cours détecté, reprendre ? » au mount de la `SkillsView`.
4. **Limite taille fichier returns** (Q2 §10 annexe externe) : le `.docx` final transite en base64 dans la réponse JSON chat.api. Pour des skills futurs qui produiraient des fichiers > 5MB, prévoir un mode URL signée — mais pas en V1 MVP.

### D.10. Décisions clés actées (front)

| # | Décision | Statut |
|---|---|---|
| 1 | V1 front cible Flow 2 (orchestration option B) ; Flow 1 différé V2 | ✅ Acté |
| 2 | `useSkillRunner` composable centralise la boucle pause/reprise + long-polling + cancellation | ✅ Acté |
| 3 | 2 services axios distincts (`chat.api` Firebase JWT, `localhost:11500` Bearer agent_token) | ✅ Acté |
| 4 | Vue dédiée `SkillsView.vue` (pas mixé avec Quick-Actions experts) | ✅ Acté |
| 5 | UX par garde-fou : 6 codes erreur avec comportements UI distincts | ✅ Acté |
| 6 | Catalogue `apiErrors.ts` enrichi de 9 codes RFC-085 | ✅ Acté |
| 7 | Effort V1 front estimé ~4.5j | ✅ À valider produit |

### D.11. Mise à jour 2026-05-08 (post Analyse expert + §C.10 + §C.11)

> Annexe D mise à jour suite à la revue expert (`## Analyse expert`),
> aux réponses back §C.10 et à la matrice V1/V2 §C.11. Synthèse front.

#### D.11.1. Bonnes nouvelles pour le scope front V1

| §C nouvelle | Conséquence front |
|---|---|
| **§C.11 cas 3** : skill hybride local+cloud = ✅ V1 | `progression_pedagogique` (le skill emblématique) est livrable V1 sans dégradation. Mon plan d'actions PLAN-RFC-085-FRONT-V1.md reste valide. |
| **§C.10.2 LEVÉ** : skills hybrides V1 | `useSkillRunner.ts` orchestre la navette agent ↔ chat.api **comme prévu** (boucle pause/reprise). Pas de réécriture nécessaire. |
| **§C.10.7** : Chemin B confirmé officiellement | Mon vote front (§7.4.6 + §11.3 Q11) acté. Aucun changement de contrat front ↔ chat.api — les 9 codes erreur typés sont garantis. |
| **§C.10.11** : Quotas Q14 maintenus V1 (pas V1.1) | Mon UX par garde-fou (§D.5) reste pertinente dès V1. Les 4 codes 429 (`skill_executions_quota_exceeded`, `skill_llm_quota_exceeded`, `skill_concurrent_limit_reached`, `skill_cooldown_active`) sont à implémenter dès le début. |

#### D.11.2. Ajustement contrat — `skillsLlmApi.ts` simplifié (§C.10.4)

§C.10.4 confirme que **chat.api ne reçoit JAMAIS de step `target: local`** par construction (l'agent local exécute les steps locaux lui-même et n'appelle chat.api que pour les steps cloud). Donc le payload TypeScript de `skillsLlmApi.ts` est plus simple que prévu :

```ts
// types/skills.ts — SIMPLIFIÉ post §C.10.4
// PAS de champ `target` (cloud implicit côté chat.api)
export interface LLMSkillInvokeRequestBase {
  skill_id: string
  step_id: string
  run_id: string
  model_tier_hint: 'haiku' | 'sonnet' | 'opus'
  max_tokens: number
  mode: 'messages' | 'with_skills'      // ← UNIQUE discriminator
  execution_mode?: 'batch' | 'sync'      // §C.7
  max_wait_seconds?: number              // §C.7
  // PAS de target — chat.api ne le verra jamais
}
```

→ Si le frontmatter `SKILL.md` exposé par l'agent local contient `target: local`, l'agent **n'appelle pas chat.api du tout** pour ce step. Le front n'a même pas à filtrer — c'est l'agent qui le fait avant le `status: needs_llm`.

#### D.11.3. Nouveau gate de déploiement V1 — webhook N8N `claude-call-with-skills` (§C.10.1)

L'expert a souligné que le mode `with_skills` (Anthropic Files API + base64 download) **n'a pas de webhook livré côté N8N**. §C.10.1 promu en gate déploiement V1 :

| Gate | Effet sur front |
|---|---|
| Webhook `llm-call-messages` livré | Permet la recette des skills `mode: messages` (raisonnement pur, génération JSON) |
| Webhook `claude-call-with-skills` livré | Permet la recette du `.docx` final dans `progression_pedagogique`. **Sans ça, pas de recette E2E V1 du skill emblématique.** |

→ **Action front** : adapter les **tests Vitest unit** pour ne pas dépendre du webhook (mocks complets côté front). Garder la recette E2E (J5 §5.3 du plan) pour quand DevOps a livré les 2 webhooks.

#### D.11.4. Wording §6.5.1 incohérent à clarifier (§C.10.2 finale)

§C.10.2 signale que **le wording §6.5.1** (« seuls les skills entièrement locaux supportés en PR initiale ») est incohérent avec le scope V1 acté (les skills hybrides sont V1 — cas 3 §C.11). Recommandation back = remplacer par :

> *« Les skills hybrides sont supportés via orchestration multi-step de l'agent appelant `chat.api/api/llm/skills/invoke` pour chaque step cloud. »*

→ **Action front** : aucune (ce wording vit côté équipe Local Agent). Mais à signaler à l'équipe Local Agent pour cohérence — sinon malentendu déjà identifié par l'expert (point 2 « Bloquant 2 expert §C.10.2 »).

→ **Plus largement** : le PLAN-RFC-085-FRONT-V1.md §5.2 (« Endpoints à valider avec back avant J1 ») mentionnait une divergence entre §6.3.3 ancien (`POST /api/skills/{name}/execute` synchrone) et l'annexe externe v0.3 (`POST /api/skills/{id}/runs` + `/continue`). **Cette divergence est définitivement résolue côté agent local par §6.5.1 + §C.10.2 + §C.10.3** : V1 = pattern asynchrone option B (start → needs_llm → continue → done).

#### D.11.5. Récap impact sur le plan d'actions

PLAN-RFC-085-FRONT-V1.md :

| Section | Mise à jour suite à §C.10 + §C.11 |
|---|---|
| §1 Pré-requis | ✅ Toujours valide. Préciser que les 2 webhooks N8N (`llm-call-messages` + `claude-call-with-skills`) sont des **gates de déploiement V1**. |
| §2 Plan jour-par-jour | ✅ Inchangé. J1-J5 OK. |
| §3 Découpage 4 PRs | ✅ Inchangé. |
| §4 Risques | Ajouter risque : webhook `claude-call-with-skills` non livré → recette E2E `progression_pedagogique` impossible. Mitigation = recette en 2 phases : phase A `mode: messages` only (livrable plus tôt), phase B avec `.docx` quand webhook prêt. |
| §5 Coordination | §5.2 Endpoints agent local — divergence résolue par §C.10. À retirer du plan. Ajouter coordination DevOps/N8N sur les 2 webhooks. |
| §9 Décisions | ✅ Inchangé. |
| §10 Arbre fichiers | ✅ Inchangé — `target` champ retiré dans `types/skills.ts` (§D.11.2). |

**Effort V1 front** : ✅ **inchangé ~4.5j**. Les clarifications back ne changent pas le scope front, juste simplifient le contrat (§D.11.2).

#### D.11.6. Décisions front actées par §C.10/§C.11

| # | Décision | Source §C |
|---|---|---|
| 1 | `progression_pedagogique` est V1 — pas de dégradation du MVP | §C.11 cas 3 |
| 2 | Pas de champ `target` dans `skillsLlmApi.ts` | §C.10.4 |
| 3 | Pattern long-polling + 4 garde-fous (cooldown + concurrent + journalier + tokens) confirmés V1 | §C.10.11 + §C.6 |
| 4 | Flow 1 (interception WS MCP pour skills cloud déclenchés en chat) confirmé V2 | §C.10.6 + §C.11 cas 5/6 |
| 5 | 2 gates de déploiement V1 côté DevOps/N8N (webhooks) | §C.10.1 |

### D.12. Mise à jour 2026-05-11 (post refonte §6.1/§6.2 + §C.12/§C.13/§C.14)

> Annexe D mise à jour suite à la révision majeure 2026-05-11 (RFC v0.4)
> portée par l'équipe Azy Local Agent + chat.api : nouvelle matrice de
> sources skills (publics/privés), front orchestrateur pour la
> registration des skills privés, 2 catalogues DB, effort back doublé à
> ~10j (PR-A invoke + PR-B catalogues). **Le scope front est élargi.**

#### D.12.1. Nouveau périmètre front V1 — catalogues + registration

Suite à §6.2.2 (front orchestrateur) et §C.12.4 (8 endpoints chat.api), le front V1 doit livrer **en plus** de ce qui était prévu dans Annexe D §D.2 + §D.11.2 :

| Nouveau livrable front | Description | Effort |
|---|---|---|
| `services/skillsCatalogApi.ts` | Wrappers chat.api : `GET /api/skills/`, `GET /api/skills/{id}`, `POST /api/skills/register`, `PATCH /api/skills/{id}`, `DELETE /api/skills/{id}` | 0.5j |
| `composables/useSkillsCatalog.ts` | Orchestre la sync agent local ↔ chat.api : (a) `GET localhost:11500/api/skills` scan filesystem, (b) diff vs catalogue chat.api, (c) `POST /api/skills/register` pour nouveaux, (d) `PATCH /api/skills/{id}` pour modifiés, (e) liste union retournée à la View | 1j |
| Refacto `views/SkillsView.vue` | Bouton « Recharger les skills » qui déclenche la sync. Afficher la liste union (publics filtrés + privés). Distinguer visuellement les 2 origines (badge). Bouton « Supprimer » sur les privés. | 0.5j |
| `types/skillsCatalog.ts` | Types TS calqués sur §C.12.1/§C.12.2 (PublicSkill, UserSkill, union DiscoverySkill). `pipeline_summary` et `parameters_schema` typés. | 0.25j |
| Tests Vitest (composable + service catalogue) | Mock des 2 backends + scénarios de sync (nouveau / modifié / supprimé localement) | 0.5j |

**Sous-total nouveau scope : ~2.75j**

#### D.12.2. Effort V1 front révisé

| Bloc | Effort |
|---|---|
| Scope initial (cf. §D.2) — services LLM + composable + SkillRunnerDialog + apiErrors + pairing + tests | ~4.5j |
| **Nouveau scope catalogues (§D.12.1)** | **~2.75j** |
| **Total V1 front révisé** | **~7.25j** |

→ **+61% vs estimation initiale 4.5j**. Aligné avec le doublement back (5.6j → 10j) — c'est le scope catalogues réintégré en V1 qui pèse.

#### D.12.3. Décisions front actées suite à §6.1/§6.2/§C.12

- ✅ **2 services chat.api distincts** côté front : `skillsLlmApi.ts` (invoke + tasks) + `skillsCatalogApi.ts` (catalogues + register). Séparation cohérente avec les 2 PR back parallèles (§C.13).
- ✅ **Front orchestrateur** validé : le front fait la navette (a) `GET localhost:11500/api/skills` scan agent → (b) `POST/PATCH chat.api` pour sync métadonnées. **Pas de fichiers transitant par chat.api.**
- ✅ **Catalogue union** côté UI : la `SkillsView` affiche publics filtrés + privés du user dans la même liste avec **un badge visuel pour distinguer** (icône globe pour publics, icône user pour privés).
- ✅ **Bouton « Recharger »** explicite (pas de polling auto) — l'user déclenche la sync quand il a modifié un dossier local. Évite des appels intempestifs à l'agent local.
- ✅ **Idempotence via `directory_name`** (clé naturelle §C.12.2) — un re-scan ne crée pas de doublons, juste un PATCH si métadonnées changent.

#### D.12.4. Mise à jour PLAN-RFC-085-FRONT-V1.md v3 nécessaire

Le plan d'actions front (`docs/issues/PLAN-RFC-085-FRONT-V1.md` v2) doit être révisé v3 pour :

- **§2 Plan jour-par-jour** : ajouter J6 (catalogues services + composable sync) + J7 (refacto SkillsView + tests catalogues).
- **§3 Découpage PRs** : ajouter **PR #5 — Catalogues + sync flow** après PR #3 (UI) et avant PR #4 (doc + recette).
- **§5 Coordination** : pointer §C.13 (PR back parallèles A + B) — front peut attaquer la partie catalogue dès que PR-B back est mergeable, en parallèle de PR-A.
- **§7 Calendaires** : optimiste J+7, réaliste J+10, pessimiste J+14 (vs J+5/+7/+10 initial).

#### D.12.5. Récap décisions front post 2026-05-11

| # | Décision | Source |
|---|---|---|
| 8 | Scope catalogues réintégré V1 front — 5 wrappers chat.api + composable sync + refacto SkillsView | §6.2.2 + §C.12.4 |
| 9 | 2 services axios distincts côté front (`skillsLlmApi` + `skillsCatalogApi`) | §C.13 |
| 10 | Front est l'orchestrateur registration privés (pas l'agent local, pas chat.api solo) | §6.2.2 |
| 11 | Bouton « Recharger » explicite (pas de polling) — UX claire | front |
| 12 | Catalogue union affiché avec badge origine publique/privée | front |
| 13 | Effort V1 front révisé ~7.25j (vs 4.5j initial) | §D.12.2 |

### D.13. Exigences UX additionnelles 2026-05-11 — invocation chat + cards

> Demandes user 2026-05-11 : (1) invocation des skills via `/` dans la
> conversation chat (pattern « slash command »), (2) invocation des experts
> via `@` (pattern déjà existant pour les experts — à préserver), (3) cards
> skills avec badge visible distinguant **publics** et **locaux/privés**.
> Pattern aligné avec les Quick-Actions experts et les cards serveurs
> Discord existants côté front.

#### D.13.1. Pattern d'invocation conversationnelle

**Distinction sémantique** :

| Préfixe dans le chat | Cible | Comportement |
|---|---|---|
| `@<expert_name>` | **Expert** (système RFC-080+, déjà existant) | Affiche un menu/cards des experts disponibles, l'user sélectionne → la conversation passe en mode expert (system_prompt + RAG) |
| `/<skill_slug>` | **Skill** (RFC-085, nouveau) | Affiche un menu/cards des skills disponibles filtrés par tenant/package, l'user sélectionne → ouvre le `SkillRunnerDialog` avec les paramètres pré-remplis si possible |

**Implémentation `/` skills** :

- Détection du `/` en début de message dans `ModernChatView` (ou composant input)
- Ouverture d'un **autocomplete dropdown** style commande (à la Discord/Slack) listant les skills disponibles
- Filtrage à la saisie : `/prog` → suggère `progression_pedagogique`, `progression_bts_sio`, etc.
- Sélection → fermeture du dropdown + ouverture du `SkillRunnerDialog`
- Si le skill prend des paramètres → formulaire dans le Dialog ; sinon → lancement direct
- Le résultat du skill est **inséré dans la conversation** comme un message (markdown rendu + lien vers les fichiers générés)

**Architecture composant** :

```
ModernChatInput (existant)
  ↓ détecte « / » en début de message
SkillCommandAutocomplete (NOUVEAU)
  ↓ consomme useSkillsCatalog() pour la liste union publics+privés
  ↓ filtre par saisie utilisateur (fuzzy match sur slug + name)
  ↓ émet 'skill-selected' → composant parent ouvre SkillRunnerDialog
```

**Réutilisation @ experts** : le pattern `@expert` existe déjà côté front (probablement dans `ModernChatView` / `ExpertConversationModal`). À ne **pas toucher** côté code, juste à préserver la cohérence UX entre les deux mécanismes (placement dropdown, animations, navigation clavier).

#### D.13.2. Cards skills avec badge origine

**Pattern UI** aligné sur ce qui existe pour :
- **Cards experts** (cf. `views/ExpertsDemo.vue` / `components/experts/*`)
- **Cards serveurs Discord** (cf. `components/discord/*` / `views/DiscordSettingsView.vue`)

**Structure d'une card skill** :

```
┌─────────────────────────────────────────┐
│  [🌐 / 👤]   progression_pedagogique     │ ← badge origine + slug en titre
│              v1.0.0                      │ ← version (si présente)
│                                          │
│  Construit une progression pédagogique   │
│  annuelle à partir d'un référentiel...   │ ← description (frontmatter)
│                                          │
│  Tier requis : Sonnet                    │ ← tier_required si présent (publics)
│  Package : pro-complet                   │ ← required_package_code si présent
│                                          │
│  ┌────────────┐  ┌────────────┐         │
│  │  Lancer  ▶ │  │ Supprimer  │         │ ← Supprimer uniquement sur privés
│  └────────────┘  └────────────┘         │
└─────────────────────────────────────────┘
```

**Badge origine** :

| Badge | Icône | Couleur | Tooltip |
|---|---|---|---|
| **Public** | `mdi-earth` (🌐) | `primary` (bleu Vuetify) | « Skill public — fourni par Azy » |
| **Local / privé** | `mdi-account` (👤) | `success` (vert) ou `info` | « Skill privé — fichiers locaux sur ta machine » |

Badge placé en haut-gauche de la card, taille `small`, variant `tonal`, à côté du nom du skill.

#### D.13.3. Composants front à créer (extension §D.12.1)

| Nouveau livrable | Description | Effort |
|---|---|---|
| `components/skills/SkillCard.vue` | Card d'un skill (public ou privé) avec badge origine + bouton Lancer + bouton Supprimer (privés uniquement). Props : `skill: DiscoverySkill`. Émits : `launch`, `delete`. | 0.5j |
| `components/skills/SkillCommandAutocomplete.vue` | Dropdown autocomplete style slash command, déclenché par `/` en début de message. Liste les skills filtrés à la saisie, navigation clavier (↑↓ Enter Esc), affiche le badge origine sur chaque item. | 1j |
| Hook dans `ModernChatInput` (ou composant équivalent) | Détecter `/` en début de message + ouvrir l'autocomplete + intercepter la sélection pour ouvrir le `SkillRunnerDialog`. | 0.5j |
| Refacto `views/SkillsView.vue` (v3 §D.12 + v3.1 cards) | Remplacer la liste compacte par une grille de `SkillCard` (réutilise le composant). Bouton « Recharger » + filtrage par origine (toggle « Publics / Privés / Tous »). | 0.25j (delta vs §D.12.1) |
| Tests Vitest cards + autocomplete | Mock catalogue + scénarios sélection clavier + intégration trigger `/` | 0.5j |

**Sous-total nouveau scope D.13 : ~2.75j additionnels**

#### D.13.4. Effort V1 front re-révisé

| Bloc | Effort |
|---|---|
| Scope initial (cf. §D.2) — services LLM + composable + SkillRunnerDialog + apiErrors + pairing + tests | ~4.5j |
| Scope catalogues (§D.12.1) | ~2.75j |
| **Scope UX chat + cards (§D.13.3)** | **~2.75j** |
| **Total V1 front re-révisé** | **~10j** |

→ **+122% vs estimation initiale 4.5j**. Aligné avec le scope back V1 chat.api (~10j). C'est cohérent — un V1 utilisable end-to-end côté user demande un investissement front équivalent au back.

#### D.13.5. Décisions front actées (D.13)

| # | Décision | Source |
|---|---|---|
| 14 | `/` invoque les skills, `@` invoque les experts (séparation sémantique stricte) | user 2026-05-11 |
| 15 | Cards skills avec badge origine (🌐 public / 👤 privé) — pattern aligné cards experts + Discord | user 2026-05-11 |
| 16 | `SkillCommandAutocomplete` réutilisable (déclenchable depuis n'importe quel input chat) | front |
| 17 | `SkillCard` composant unique avec props `skill: DiscoverySkill` (le badge origine est dérivé du discriminateur `origin`) | front |
| 18 | Filtrage par origine sur SkillsView (toggle Publics/Privés/Tous) | front |
| 19 | Effort V1 front re-révisé ~10j (vs 7.25j post-§D.12) | §D.13.4 |

#### D.13.6. Impact sur PLAN-RFC-085-FRONT-V1.md v4 nécessaire

- Ajouter **J8 (cards SkillCard + filtrage SkillsView)** et **J9 (SkillCommandAutocomplete + intégration ModernChatInput)** au plan jour-par-jour.
- Ajouter **PR #6 — Cards + slash command** après PR #4 (catalogues) et avant PR #5 (doc + recette).
- §7 Calendaires : optimiste **J+10**, réaliste **J+13**, pessimiste **J+18**.


## Analyse expert
Je lis la RFC mise à jour avant de te donner un avis.Voici mon avis. La RFC est solide sur beaucoup d'aspects mais il y a quelques **vrais trous** qui méritent qu'on les pointe avant que ça parte en dev — sinon le MVP `progression_pedagogique` qu'on a discuté ne fonctionnera pas comme prévu.

---

## ✅ Ce qui est bien fait

- **Le format `SKILL.md` est cohérent** avec ce qu'on a discuté : frontmatter YAML + doctrine markdown, types de steps clairs, références `$params`/`$steps`/`$context`.
- **§5.4 Médiation chat.api dans le tool-calling LLM** : excellente annotation de l'équipe Front. Le pattern "le LLM produit un `tool_call skill_execute`, chat.api l'intercepte, applique RBAC + quota + résolution package, exécute" est élégant et évite que le LLM voie une API key.
- **§7.4 Anti-bypass API key** : la liste `FORBIDDEN_FIELDS` au parsing + `BLOCKED_NETWORK_IMPORTS` dans la sandbox + obligation de passer par n8n est défense en profondeur correcte.
- **§6.3.1 Principes architecturaux** : les 5 principes de l'agent local sont cleans (notamment "le local agent n'appelle PAS chat.api"). Cohérent avec §2.8 de l'archi globale.
- **§7.4.6 Annotation Front sur le gap `text-generator`** : honnêteté technique salutaire, l'équipe identifie qu'aujourd'hui le webhook ne fait que la couche credentials.

---

## 🔴 Bloquants pour le MVP `progression_pedagogique`

### 1. Le mode `with_skills` (Anthropic `container.skills`) est mentionné mais **jamais spécifié**

Le type `llm_call_with_anthropic_skill` apparaît dans la table §3.3 et dans la liste des steps de `progression_pedagogique` (§4.2). Mais :

- **Aucun webhook n8n** n'est défini pour ce mode. §7.4.3 ne décrit que `text-generator` qui ne sait faire que des appels OpenAI standards (`model: "gpt-4o"`, pas de beta flags, pas de `container.skills`, pas de Files API).
- **Aucun mécanisme** n'est décrit pour récupérer les `file_id` retournés par Anthropic et les transformer en binaires pour le caller.
- §3.3 mentionne `anthropic_skills` comme "option clé" mais n'explique pas comment ces skills sont activés côté n8n.

C'était **le cœur de notre discussion** : générer le `.docx` via le skill `docx` d'Anthropic plutôt qu'avec `python-docx` local. Le skill ne tournera pas tant que ce point n'est pas spécifié.

→ **Action** : ajouter une section `§7.4.3-bis` qui spécifie soit un nouveau workflow n8n `claude-with-skills`, soit l'extension de `text-generator` pour gérer les beta flags + `container.skills` + Files API.

### 2. Les skills hybrides (local + cloud) sont **reportés en V2** alors que `progression_pedagogique` est hybride par essence

§6.5.1 conclut : *"Pour la PR initiale, seuls les skills entièrement locaux (`target: local` partout) seront supportés"*.

Or `progression_pedagogique` a besoin de :
- `parse_referentiel.py` → script local
- `build_calendar.py` → script local
- `generate_progression` → LLM cloud (raisonnement, on a validé Claude Opus)
- `render_docx` → LLM cloud avec skill docx Anthropic

Donc **soit on rend le skill emblématique 100% cloud** (et on perd la souveraineté du PDF source), **soit on attend la V2**, **soit on tranche §6.5.1 maintenant**.

→ **Action** : trancher §6.5.1 avant l'implémentation. L'option B (pause/reprise côté agent) que j'avais proposée dans la v0.3 reste à mon avis la plus propre. Cf. point suivant.

### 3. Pas de pattern résumable pour orchestrer plusieurs appels LLM dans le même skill

La RFC propose `POST /api/skills/{name}/execute` qui exécute "le pipeline d'un bloc". Ça marche pour des skills full-local ou full-cloud mais **pas pour un skill hybride avec N appels LLM** comme `progression_pedagogique` (2 appels LLM avec passage de variables `$steps.generate_progression.progression`).

L'option A (pré-orchestration frontend) qui semble préférée demande au frontend d'**interpréter le pipeline**, ce qui :
- Duplique la logique du `SkillExecutor` côté frontend
- Crée un risque de divergence entre les deux implémentations
- Complique l'évolution (chaque évolution du format pipeline doit être propagée au frontend)

→ **Action** : préférer l'option B (pause/reprise) avec un endpoint `POST /api/skills/runs/{run_id}/continue`. C'est un peu plus de travail côté agent mais le frontend reste un orchestrateur "bête" qui pousse des `llm_response` à l'agent.

---

## 🟠 Points importants à clarifier

### 4. Confusion entre `target` et `mode`

La RFC introduit `target: local | cloud` mais oublie l'axe `mode: messages | with_skills` qu'on avait identifié. Ce sont **deux dimensions orthogonales** :

| target / mode | `messages` | `with_skills` |
|---|---|---|
| `local` (Ollama) | ✅ supporté | ❌ pas possible (Ollama ne fait pas les skills Anthropic) |
| `cloud` | ✅ via `text-generator` | ✅ via webhook à créer |

Aujourd'hui le YAML a `target: local`/`target: cloud` ET (séparément) `type: llm_call_with_anthropic_skill`. C'est confus : si je mets `target: local` + `type: llm_call_with_anthropic_skill`, qu'est-ce qui se passe ?

→ **Action** : unifier en `type: llm_call` avec sous-champs `target` ET `mode` cleanement séparés, et invalider la combinaison `target: local + mode: with_skills` au parsing.

### 5. §6.2 Upload skills via chat.api contredit le principe §6.3.1.1 "Le client décide tout"

§6.2 introduit `POST /api/skills/upload` avec stockage en BDD `user_skills` côté chat.api. Or §6.3.1.1 dit que pour les skills locaux, c'est l'utilisateur qui choisit le path et tout vient du payload — pas de centralisation cloud.

Les deux mécanismes peuvent coexister, mais ce sont **deux modes différents** :
- Skills "Tenant" stockés en BDD chat.api → exécution Azy-MCP serveur
- Skills "User Local" stockés sur la machine du user → exécution agent local

§6.4 essaie de relier les deux avec un flow "sync cloud→local" mais la sémantique reste floue. Un skill uploadé via §6.2 *doit-il* obligatoirement passer par cette sync ? Le user *peut-il* déposer directement un skill dans son `~/azy-workspace/skills/` sans passer par chat.api ?

→ **Action** : clarifier que les deux flows sont indépendants. Skills locaux = *opt-out total* du cloud, le user manipule le filesystem librement.

### 6. §5.4.1 — comment le LLM sait-il quels skills sont disponibles ?

L'étape 3 dit : *"chat.api transmet au LLM avec tools augmentés : tools = [...tools_existants, skill_list, skill_execute]"*.

Mais en pratique :
- Si `skill_execute` est un tool générique qui prend un `skill_name` quelconque, comment le LLM sait quels skills il peut invoquer ? Il a juste un nom de paramètre arbitraire — l'expérience UX sera mauvaise.
- Si chaque skill devient un tool spécifique (ex. `tool: skill_progression_pedagogique`, `tool: skill_fiche_seance`...), le contexte explose en tokens à chaque conversation, et c'est le tenant qui paie.

→ **Action** : trancher entre "tool générique avec descriptions de skills disponibles dans le system prompt" vs "1 tool par skill avec injection au runtime selon RBAC". Probablement la première option, mais à expliciter.

### 7. §7.4.6 voté "Chemin B" par l'équipe Front mais pas tranché

Le vote front est cohérent (chat.api a déjà tous les composants, n8n reste dumb pipe). Mais §11.3 Q11 dit "À trancher avec Backend API + Azy-MCP avant l'intégration MCP (§9.2)". Ça **bloque l'application réelle des contrôles décrits en §7.4.1** quel que soit le chemin retenu.

→ **Action** : organiser la réunion d'arbitrage A vs B explicitement avant le démarrage du dev §9.2 (semaine 3 du plan).

---

## 🟡 Points mineurs / à noter

### 8. §6.3.5 Discoverability trop minimaliste

`GET /api/skills?path=...` retourne juste noms + description + version. Mais le frontend aura besoin de :
- Statut de validation du skill (parsé OK ou erreur de syntaxe)
- Liste des modèles Ollama compatibles (si target local)
- Schéma des `parameters` pour générer le formulaire Modal

→ Au minimum, exposer `parameters` dans la réponse.

### 9. §6.3.3 Auth agent local — perte de la notion de tenant

Le pattern "Bearer token de pairing" identifie l'agent mais pas le tenant côté agent local. Si un user appartient à plusieurs tenants (cas rare mais possible), comment le local agent sait quel tenant attribuer à un run ?

→ Soit le frontend passe `tenant_id` explicitement dans le payload de `/api/skills/{name}/execute`, soit on accepte que les skills locaux soient "tenant-less" (pas d'audit tenant côté agent).

### 10. Streaming §6.3.4 préférence SSE — OK mais à confirmer

L'option A (SSE) est cohérente avec l'existant côté agent. Pas de souci, juste à acter.

### 11. §11.3 Q14 quotas — important mais probablement V1.1

`skill_executions_per_day_per_user` + `skill_tokens_per_day_per_tenant` sont nécessaires pour éviter qu'un user fasse exploser le budget. À implémenter, mais peut-être pas en V1 si le pilote est limité.

---

## Synthèse

La RFC est **80% prête** mais a **3 trous critiques** pour le MVP `progression_pedagogique` :

1. **Mode `with_skills` non spécifié** → impossible de générer le `.docx` via Anthropic
2. **Skills hybrides reportés en V2** → impossible de faire un skill mêlant scripts locaux + LLM cloud
3. **Pas de pattern résumable** → impossible d'orchestrer plusieurs appels LLM avec passage de variables

Si on veut livrer `progression_pedagogique` dans le scope V1, **ces trois points doivent être tranchés avant le démarrage du dev**. Sinon, soit on dégrade le MVP (skill 100% local OU 100% cloud, sans skill `docx` Anthropic), soit on accepte de le livrer en V2.

Mes recommandations concrètes pour débloquer :

1. **Convoquer une réunion archi à 4** (Front, Backend, Azy-MCP, Local Agent) pour trancher §6.5.1 (pause/reprise vs pré-orch frontend) et §7.4.6 (chemin A vs B).
2. **Spécifier le webhook `claude-with-skills`** dans une §7.4.3-bis, indépendamment du débat A/B.
3. **Unifier `target` + `mode`** dans le format YAML pour clarifier la matrice 2×2.
4. **Préciser la sémantique du tool `skill_execute` côté LLM** (générique avec liste injectée, ou un tool par skill).

Tu veux que je rédige une note de synthèse à 1 page que tu pourrais envoyer aux quatre équipes pour cadrer la réunion ?
