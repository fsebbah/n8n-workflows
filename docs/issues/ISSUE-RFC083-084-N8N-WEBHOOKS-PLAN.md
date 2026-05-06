# ISSUE: Plan d'Implémentation n8n — RFC-083 & RFC-084

**Date:** 2026-05-06
**Status:** PLANNING
**Priority:** P1
**RFCs:**
- [RFC-083-MCP-GOOGLE-CLASSROOM-SERVER](../rfc/RFC-083-MCP-GOOGLE-CLASSROOM-SERVER.md)
- [RFC-084-PROGRAM-BUILDER-MULTI-MATIERE-EXTRACTION](../rfc/RFC-084-PROGRAM-BUILDER-MULTI-MATIERE-EXTRACTION.md)
**Équipe:** n8n

---

## Vue d'ensemble

Ce document décrit les webhooks et workflows n8n à créer pour supporter les RFC-083 (Google Classroom) et RFC-084 (extraction multi-matière). L'implémentation est conçue pour être parallélisable via subagents.

### Dépendances cross-équipes

| Composant | Équipe | Statut | Bloque |
|-----------|--------|--------|--------|
| Node custom `classroomToolDynamic` | n8n (option A) | ❌ À créer | Workflow MCP Classroom |
| Endpoint résolveur token `/api/n8n/google/token` | Back | ❌ À créer | Tous les workflows Google |
| Endpoint sync trigger `/api/expert-responses/{id}/classroom-sync` | Back | ❌ À créer | Workflow Sync Programme |
| OAuth flow Classroom (scopes) | Back | ❌ À créer | Tous les workflows Classroom |

---

## Inventaire des Webhooks à Créer

### 1. MCP - Google Classroom Server (RFC-083)

**Priorité:** P0
**Effort estimé:** 5j (Option A — node custom) / 2.5j (Option B — HTTP direct)
**Dépendances:** Node custom OU décision Option B

```
┌────────────────────────────────────────────────────────────────────────┐
│  MCP - Google Classroom Server                                          │
│  Webhook: POST /webhook/mcp-classroom                                   │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────┐     ┌──────────────────┐     ┌───────────────────┐    │
│  │  Webhook    │ ──► │  Route by        │ ──► │  Action Nodes     │    │
│  │  Receiver   │     │  resource +      │     │  (1 par opération)│    │
│  │             │     │  operation       │     │                   │    │
│  └─────────────┘     └──────────────────┘     └───────────────────┘    │
│                                                        │                │
│                                                        ▼                │
│                                              ┌───────────────────┐      │
│                                              │ Respond to        │      │
│                                              │ Webhook           │      │
│                                              │ {success, data}   │      │
│                                              └───────────────────┘      │
└────────────────────────────────────────────────────────────────────────┘
```

### 2. Sync Programme Expert → Classroom (RFC-083 §7.4)

**Priorité:** P1
**Effort estimé:** 1.5j
**Dépendances:** Workflow MCP Classroom + Endpoint back sync trigger

```
┌────────────────────────────────────────────────────────────────────────┐
│  Expert Program Classroom Sync                                          │
│  Trigger: Webhook from back (POST /webhook/expert-program-classroom-sync)│
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Input:                                                                 │
│    - expert_response_id                                                 │
│    - course_id (Classroom)                                              │
│    - programme.architecture[] (séquences)                               │
│    - programme.progression[] (séances)                                  │
│    - access_token                                                       │
│                                                                         │
│  Flow:                                                                  │
│    1. Pour chaque séquence → MCP-Classroom create topic                 │
│    2. Pour chaque séance → MCP-Classroom create courseWork              │
│    3. Callback back avec topic_ids[] + coursework_ids[]                 │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

### 3. Google Token Resolver (support — RFC-083 §D.2)

**Priorité:** P0 (bloque tous les workflows Google)
**Effort estimé:** 0.5j
**Note:** Principalement côté back, workflow n8n = simple proxy si nécessaire

```
┌────────────────────────────────────────────────────────────────────────┐
│  Google Token Resolver (optionnel côté n8n)                             │
│  Si le back expose directement l'endpoint, ce workflow n'est pas requis │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  GET /webhook/google-token-resolve?service=classroom&user_id=xxx        │
│    → Proxy vers back /api/n8n/google/token                              │
│    → Retourne { access_token, expires_at }                              │
│                                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Phases d'Implémentation

### Phase 0: Prérequis (Séquentiel — Équipe Back)

| # | Task | Description | Équipe | Effort | Statut |
|---|------|-------------|--------|--------|--------|
| 0.1 | OAuth Classroom | Étendre flow Google avec scopes `classroom.*` | Back | 0.5j | ❌ |
| 0.2 | Token Resolver | Endpoint `GET /api/n8n/google/token?service=classroom` | Back | 0.5j | ❌ |
| 0.3 | Sync Trigger | Endpoint `POST /api/expert-responses/{id}/classroom-sync` | Back | 1j | ❌ |
| 0.4 | Migration RFC-081 | `channel_kind='google_classroom'` + `classroom_id` | Back | 1j | ❌ |

### Phase 1: MCP Classroom Server (Parallélisable)

Décision préalable requise : **Option A (node custom) ou Option B (HTTP direct)**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PARALLEL EXECUTION GROUP 1                            │
│                    (Si Option B — HTTP Request)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐ │
│  │ Subagent A       │  │ Subagent B       │  │ Subagent C             │ │
│  │ ──────────────── │  │ ──────────────── │  │ ────────────────────── │ │
│  │ course           │  │ courseWork       │  │ studentSubmission      │ │
│  │ (6 ops)          │  │ (5 ops)          │  │ (5 ops)                │ │
│  │                  │  │                  │  │                        │ │
│  │ Effort: 0.5j     │  │ Effort: 0.5j     │  │ Effort: 0.5j           │ │
│  └──────────────────┘  └──────────────────┘  └────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    PARALLEL EXECUTION GROUP 2                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐ │
│  │ Subagent D       │  │ Subagent E       │  │ Subagent F             │ │
│  │ ──────────────── │  │ ──────────────── │  │ ────────────────────── │ │
│  │ student          │  │ teacher          │  │ announcement + topic   │ │
│  │ (4 ops)          │  │ (4 ops)          │  │ (10 ops)               │ │
│  │                  │  │                  │  │                        │ │
│  │ Effort: 0.3j     │  │ Effort: 0.3j     │  │ Effort: 0.5j           │ │
│  └──────────────────┘  └──────────────────┘  └────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Phase 2: Workflow Sync Programme (Séquentiel)

| # | Task | Description | Dépendance | Effort |
|---|------|-------------|------------|--------|
| 2.1 | Workflow base | Webhook receiver + validation payload | Phase 1 | 0.5j |
| 2.2 | Loop séquences | Créer topics via MCP-Classroom | 2.1 | 0.3j |
| 2.3 | Loop séances | Créer courseWork via MCP-Classroom | 2.2 | 0.5j |
| 2.4 | Callback back | POST résultat avec IDs créés | 2.3 | 0.2j |

### Phase 3: Tests & Documentation

| # | Task | Description | Effort |
|---|------|-------------|--------|
| 3.1 | Tests manuels | Tester chaque opération MCP Classroom | 1j |
| 3.2 | Tests sync | Tester workflow sync end-to-end | 0.5j |
| 3.3 | Doc MCP API | `docs/mcp/GOOGLE_CLASSROOM_MCP_API.md` | 0.5j |

---

## Spécifications Détaillées des Webhooks

### 1. MCP - Google Classroom Server

**Fichier:** `workflows/MCP_-_Google_Classroom_Server.json`
**Webhook Path:** `/mcp-classroom`
**Méthode:** POST

#### InputSchema Global

```json
{
  "type": "object",
  "required": ["access_token", "resource", "operation"],
  "properties": {
    "access_token": {
      "type": "string",
      "description": "OAuth2 token Google (fourni par le tenant)"
    },
    "resource": {
      "type": "string",
      "enum": ["course", "courseWork", "studentSubmission", "student", "teacher", "announcement", "topic"],
      "description": "Type de ressource Classroom"
    },
    "operation": {
      "type": "string",
      "description": "Opération à effectuer (varie selon resource)"
    }
  }
}
```

#### Operations par Resource

| Resource | Operations | Paramètres Clés |
|----------|------------|-----------------|
| **course** | create, get, getAll, update, delete, archive | `course_id`, `name`, `section`, `description`, `room`, `course_state` |
| **courseWork** | create, get, getAll, update, delete | `course_id`, `coursework_id`, `title`, `description`, `work_type`, `due_date`, `max_points`, `state` |
| **studentSubmission** | get, getAll, return, grade, modifyAttachments | `course_id`, `coursework_id`, `submission_id`, `assigned_grade` |
| **student** | create, get, getAll, delete | `course_id`, `user_id` |
| **teacher** | create, get, getAll, delete | `course_id`, `user_id` |
| **announcement** | create, get, getAll, update, delete | `course_id`, `announcement_id`, `text`, `state` |
| **topic** | create, get, getAll, update, delete | `course_id`, `topic_id`, `name` |

#### OutputSchema

```json
{
  "success": true,
  "data": { /* résultat Google Classroom API */ },
  "error": null
}
```

#### Erreurs

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "classroom_api_error",
    "message": "Course not found: 123456789",
    "details": { /* réponse Google brute */ }
  }
}
```

---

### 2. Expert Program Classroom Sync

**Fichier:** `workflows/Expert_Program_Classroom_Sync.json`
**Webhook Path:** `/expert-program-classroom-sync`
**Méthode:** POST
**Appelant:** Back (chat.api) via `ExpertProgramClassroomSyncService`

#### InputSchema

```json
{
  "type": "object",
  "required": ["expert_response_id", "course_id", "access_token", "programme"],
  "properties": {
    "expert_response_id": {
      "type": "string",
      "format": "uuid",
      "description": "ID de la réponse expert (parcours)"
    },
    "course_id": {
      "type": "string",
      "description": "ID du cours Google Classroom cible"
    },
    "access_token": {
      "type": "string",
      "description": "Token OAuth2 Google de l'enseignant"
    },
    "programme": {
      "type": "object",
      "properties": {
        "architecture": {
          "type": "array",
          "description": "Séquences du programme",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "titre": { "type": "string" },
              "description": { "type": "string" }
            }
          }
        },
        "progression": {
          "type": "array",
          "description": "Séances du programme",
          "items": {
            "type": "object",
            "properties": {
              "id": { "type": "string" },
              "sequence_id": { "type": "string" },
              "titre": { "type": "string" },
              "objectifs": { "type": "array" },
              "duree_minutes": { "type": "integer" }
            }
          }
        }
      }
    }
  }
}
```

#### Workflow Flow

```
1. Validate payload
   │
2. Pour chaque séquence dans programme.architecture[]
   │   └── POST /mcp-classroom { resource: "topic", operation: "create", ... }
   │       └── Stocker topic_id dans mapping[sequence_id]
   │
3. Pour chaque séance dans programme.progression[]
   │   └── POST /mcp-classroom { resource: "courseWork", operation: "create", ... }
   │       └── Associer au topic via mapping[sequence_id]
   │
4. Callback vers back
   │   └── POST /api/expert-responses/{id}/classroom-sync-complete
   │       Body: { topic_ids: [...], coursework_ids: [...], synced_at: ISO }
   │
5. Respond success
```

#### OutputSchema

```json
{
  "success": true,
  "data": {
    "expert_response_id": "uuid",
    "course_id": "123456789",
    "topics_created": 5,
    "coursework_created": 24,
    "topic_ids": ["topic-1", "topic-2", ...],
    "coursework_ids": ["cw-1", "cw-2", ...],
    "synced_at": "2026-05-06T15:30:00Z"
  }
}
```

---

## Estimation Consolidée (Équipe n8n)

### Option A — Node Custom (Recommandé)

| Phase | Composant | Effort |
|-------|-----------|--------|
| Pré-requis | Développement node `classroomToolDynamic` | 3j |
| 1 | Workflow MCP Classroom (avec node custom) | 1j |
| 2 | Workflow Sync Programme | 1.5j |
| 3 | Tests + Documentation | 1.5j |
| **Total** | | **7j** |

### Option B — HTTP Request Direct

| Phase | Composant | Effort |
|-------|-----------|--------|
| 1 | Workflow MCP Classroom (~34 HTTP Request nodes) | 2j |
| 2 | Workflow Sync Programme | 1.5j |
| 3 | Tests + Documentation | 1j |
| **Total** | | **4.5j** |

---

## Priorisation

```
                     ┌─────────────────────────────┐
                     │ SEMAINE 1                   │
                     │ ─────────────────────────── │
                     │ [Back] OAuth + Token        │
                     │ Resolver (P0)               │
                     │                             │
                     │ [n8n] Décision Option A/B   │
                     └─────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────┴─────────────────────────────────┐
│ SEMAINE 2-3 (Parallèle)                                           │
│ ──────────────────────────────────────────────────────────────── │
│                                                                   │
│ [Back]                          [n8n]                             │
│ Migration RFC-081               Workflow MCP Classroom            │
│ Endpoint sync trigger           (Option A ou B)                   │
│ Schemas Pydantic                                                  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                     ┌─────────────────────────────┐
                     │ SEMAINE 4                   │
                     │ ─────────────────────────── │
                     │ [n8n] Workflow Sync         │
                     │ Programme                   │
                     │                             │
                     │ [n8n + Back] Tests E2E     │
                     └─────────────────────────────┘
                                  │
                                  ▼
                     ┌─────────────────────────────┐
                     │ SEMAINE 5                   │
                     │ ─────────────────────────── │
                     │ [Front] Intégration UI      │
                     │ Cards + Picker              │
                     │                             │
                     │ [All] Tests utilisateurs    │
                     └─────────────────────────────┘
```

---

## Risques Identifiés

| Risque | Impact | Mitigation |
|--------|--------|------------|
| **Google verification (3-6 sem)** | Bloque déploiement prod | Anticiper dès maintenant, demande en parallèle du dev |
| **Quotas API Classroom** | Échecs sync gros programmes | V1 : erreur claire + retry manuel. V2 : queue async |
| **Node custom pas prêt** | Retarde Phase 1 | Démarrer avec Option B, migrer vers A plus tard |
| **Token OAuth expiré pendant sync** | Sync partiel | Vérifier expiration avant chaque batch, refresh si < 5min |

---

## Questions pour Arbitrage

| # | Question | Options | Recommandation |
|---|----------|---------|----------------|
| Q1 | Option A (node custom) ou B (HTTP) ? | A: plus propre, B: plus rapide | **B pour V1** si node pas disponible |
| Q2 | Batch size pour les loops ? | 10 / 50 / 100 séances par batch | **50** (balance latence/quotas) |
| Q3 | Retry automatique sur 429 ? | Oui / Non | **Oui** avec backoff exponentiel (1s, 2s, 4s) |
| Q4 | Créer announcement global après sync ? | Oui / Non | **Non** (RFC-083 §D.3 Q6 — pollue) |

---

## Changelog

- **2026-05-06** — Création du plan d'implémentation n8n pour RFC-083 et RFC-084
