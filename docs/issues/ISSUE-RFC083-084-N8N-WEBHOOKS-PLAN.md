# ISSUE: Plan d'Implémentation n8n — RFC-083 & RFC-084

**Date:** 2026-05-06
**Status:** IN PROGRESS
**Priority:** P1
**RFCs:**
- [RFC-083-MCP-GOOGLE-CLASSROOM-SERVER](../rfc/RFC-083-MCP-GOOGLE-CLASSROOM-SERVER.md)
- [RFC-084-PROGRAM-BUILDER-MULTI-MATIERE-EXTRACTION](../rfc/RFC-084-PROGRAM-BUILDER-MULTI-MATIERE-EXTRACTION.md)
**Équipe:** n8n

---

## Décision Architecturale

> **✅ DÉCIDÉ (2026-05-06) : Option A — Node Custom `classroomToolDynamic`**
>
> Justification :
> - Cohérence avec les nodes existants (`calendarToolDynamic`, `driveToolDynamic`, `contactsToolDynamic`)
> - Maintenance centralisée (1 node vs 34 HTTP Request nodes)
> - Réutilisabilité dans d'autres workflows
> - Meilleure gestion des erreurs et pagination

---

## Vue d'ensemble

Ce document décrit les webhooks et workflows n8n à créer pour supporter les RFC-083 (Google Classroom) et RFC-084 (extraction multi-matière). L'implémentation est conçue pour être parallélisable via subagents.

### Dépendances cross-équipes

| Composant | Équipe | Statut | Bloque |
|-----------|--------|--------|--------|
| **Node custom `classroomToolDynamic`** | **n8n** | 🔴 À créer | Workflow MCP Classroom |
| Endpoint résolveur token `/api/n8n/google/token` | Back | ❌ À créer | Tous les workflows Google |
| Endpoint sync trigger `/api/expert-responses/{id}/classroom-sync` | Back | ❌ À créer | Workflow Sync Programme |
| OAuth flow Classroom (scopes) | Back | ❌ À créer | Tous les workflows Classroom |

---

## 🔧 Spécification du Node Custom `classroomToolDynamic`

### Informations Générales

| Champ | Valeur |
|-------|--------|
| **Package name** | `n8n-nodes-classroom-dynamic` |
| **Node type** | `n8n-nodes-classroom-dynamic.classroomToolDynamic` |
| **Catégorie** | Google / Education |
| **Icône** | Google Classroom logo |
| **Effort estimé** | 3 jours |

### Pattern de Référence

Basé sur le node existant `calendarToolDynamic` :

```typescript
// Structure du node
{
  "type": "n8n-nodes-classroom-dynamic.classroomToolDynamic",
  "parameters": {
    "accessToken": "={{ $json.body.access_token }}",
    "resource": "course",           // course | courseWork | studentSubmission | student | teacher | announcement | topic
    "operation": "create",          // varie selon resource
    // ... paramètres spécifiques à l'opération
  }
}
```

### Paramètres Communs (tous resources)

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `accessToken` | string | ✅ | Token OAuth2 Google (BYOT pattern) |
| `resource` | enum | ✅ | Type de ressource Classroom |
| `operation` | enum | ✅ | Opération à effectuer |

### Resources et Opérations

#### 1. `course` (Cours)

| Operation | Paramètres | Endpoint Google |
|-----------|------------|-----------------|
| `create` | `name`, `section?`, `description?`, `room?`, `ownerId?` | `POST /v1/courses` |
| `get` | `courseId` | `GET /v1/courses/{id}` |
| `getAll` | `studentId?`, `teacherId?`, `courseStates[]?` | `GET /v1/courses` |
| `update` | `courseId`, `name?`, `section?`, `description?`, `room?`, `courseState?` | `PATCH /v1/courses/{id}` |
| `delete` | `courseId` | `DELETE /v1/courses/{id}` |
| `archive` | `courseId` | `POST /v1/courses/{id}:archive` (= update courseState=ARCHIVED) |

#### 2. `courseWork` (Devoirs/Travaux)

| Operation | Paramètres | Endpoint Google |
|-----------|------------|-----------------|
| `create` | `courseId`, `title`, `description?`, `workType`, `dueDate?`, `dueTime?`, `maxPoints?`, `topicId?`, `state?` | `POST /v1/courses/{courseId}/courseWork` |
| `get` | `courseId`, `courseWorkId` | `GET /v1/courses/{courseId}/courseWork/{id}` |
| `getAll` | `courseId`, `courseWorkStates[]?`, `orderBy?` | `GET /v1/courses/{courseId}/courseWork` |
| `update` | `courseId`, `courseWorkId`, `title?`, `description?`, `dueDate?`, `maxPoints?`, `state?` | `PATCH /v1/courses/{courseId}/courseWork/{id}` |
| `delete` | `courseId`, `courseWorkId` | `DELETE /v1/courses/{courseId}/courseWork/{id}` |

**workType values:** `ASSIGNMENT`, `SHORT_ANSWER_QUESTION`, `MULTIPLE_CHOICE_QUESTION`

#### 3. `studentSubmission` (Rendus élèves)

| Operation | Paramètres | Endpoint Google |
|-----------|------------|-----------------|
| `get` | `courseId`, `courseWorkId`, `submissionId` | `GET .../studentSubmissions/{id}` |
| `getAll` | `courseId`, `courseWorkId`, `userId?`, `states[]?` | `GET .../studentSubmissions` |
| `return` | `courseId`, `courseWorkId`, `submissionId` | `POST .../studentSubmissions/{id}:return` |
| `grade` | `courseId`, `courseWorkId`, `submissionId`, `assignedGrade`, `draftGrade?` | `PATCH .../studentSubmissions/{id}` |
| `modifyAttachments` | `courseId`, `courseWorkId`, `submissionId`, `addAttachments[]?` | `POST .../studentSubmissions/{id}:modifyAttachments` |

#### 4. `student` (Élèves)

| Operation | Paramètres | Endpoint Google |
|-----------|------------|-----------------|
| `create` | `courseId`, `userId` (email ou ID) | `POST /v1/courses/{courseId}/students` |
| `get` | `courseId`, `userId` | `GET /v1/courses/{courseId}/students/{userId}` |
| `getAll` | `courseId` | `GET /v1/courses/{courseId}/students` |
| `delete` | `courseId`, `userId` | `DELETE /v1/courses/{courseId}/students/{userId}` |

#### 5. `teacher` (Enseignants)

| Operation | Paramètres | Endpoint Google |
|-----------|------------|-----------------|
| `create` | `courseId`, `userId` | `POST /v1/courses/{courseId}/teachers` |
| `get` | `courseId`, `userId` | `GET /v1/courses/{courseId}/teachers/{userId}` |
| `getAll` | `courseId` | `GET /v1/courses/{courseId}/teachers` |
| `delete` | `courseId`, `userId` | `DELETE /v1/courses/{courseId}/teachers/{userId}` |

#### 6. `announcement` (Annonces)

| Operation | Paramètres | Endpoint Google |
|-----------|------------|-----------------|
| `create` | `courseId`, `text`, `state?`, `scheduledTime?`, `assigneeMode?` | `POST /v1/courses/{courseId}/announcements` |
| `get` | `courseId`, `announcementId` | `GET /v1/courses/{courseId}/announcements/{id}` |
| `getAll` | `courseId`, `announcementStates[]?`, `orderBy?` | `GET /v1/courses/{courseId}/announcements` |
| `update` | `courseId`, `announcementId`, `text?`, `state?`, `scheduledTime?` | `PATCH /v1/courses/{courseId}/announcements/{id}` |
| `delete` | `courseId`, `announcementId` | `DELETE /v1/courses/{courseId}/announcements/{id}` |

#### 7. `topic` (Rubriques/Thèmes)

| Operation | Paramètres | Endpoint Google |
|-----------|------------|-----------------|
| `create` | `courseId`, `name` | `POST /v1/courses/{courseId}/topics` |
| `get` | `courseId`, `topicId` | `GET /v1/courses/{courseId}/topics/{id}` |
| `getAll` | `courseId` | `GET /v1/courses/{courseId}/topics` |
| `update` | `courseId`, `topicId`, `name` | `PATCH /v1/courses/{courseId}/topics/{id}` |
| `delete` | `courseId`, `topicId` | `DELETE /v1/courses/{courseId}/topics/{id}` |

### Gestion des Erreurs

Le node doit wrapper les erreurs Google avec un format standardisé :

```typescript
interface ClassroomError {
  code: string;           // "classroom_api_error" | "auth_error" | "quota_exceeded" | "not_found"
  message: string;        // Message lisible
  httpStatus: number;     // 400, 401, 403, 404, 429, 500
  googleError?: {         // Détail brut Google (optionnel)
    code: number;
    message: string;
    status: string;
  };
}
```

### Pagination (getAll operations)

Pour les opérations `getAll`, le node doit supporter :
- `returnAll: boolean` — si true, fetch toutes les pages automatiquement
- `limit: number` — si returnAll=false, nombre max d'items à retourner
- Gestion interne du `pageToken` Google

### Scopes OAuth2 Requis

```
https://www.googleapis.com/auth/classroom.courses
https://www.googleapis.com/auth/classroom.coursework.students
https://www.googleapis.com/auth/classroom.coursework.me
https://www.googleapis.com/auth/classroom.rosters
https://www.googleapis.com/auth/classroom.announcements
https://www.googleapis.com/auth/classroom.topics
https://www.googleapis.com/auth/classroom.profile.emails
https://www.googleapis.com/auth/classroom.profile.photos
```

### Tests Unitaires Requis

- [ ] Test création course avec params minimaux
- [ ] Test création course avec tous les params
- [ ] Test getAll avec pagination (mock 100+ items)
- [ ] Test gestion erreur 401 (token expiré)
- [ ] Test gestion erreur 429 (quota)
- [ ] Test gestion erreur 404 (course not found)
- [ ] Test workType enum validation
- [ ] Test dueDate format ISO-8601

---

## Inventaire des Webhooks à Créer

### 1. MCP - Google Classroom Server (RFC-083)

**Priorité:** P0
**Effort estimé:** 4j (3j node custom + 1j workflow)
**Dépendances:** Node custom `classroomToolDynamic` (voir spécification ci-dessus)

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

### Phase 1: Node Custom + MCP Classroom Server

> **✅ Décision actée : Option A — Node Custom**

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Phase 1.1 — Node Custom (3j)                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ Développement n8n-nodes-classroom-dynamic                         │   │
│  │ ────────────────────────────────────────────────────────────────  │   │
│  │                                                                   │   │
│  │  • Scaffold TypeScript (basé sur calendarToolDynamic)   0.5j     │   │
│  │  • Implémentation 7 resources × ~5 ops chacune          1.5j     │   │
│  │  • Gestion erreurs + pagination                         0.5j     │   │
│  │  • Tests unitaires                                      0.5j     │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Phase 1.2 — Workflow MCP Server (1j)                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ MCP_-_Google_Classroom_Server.json                                │   │
│  │ ────────────────────────────────────────────────────────────────  │   │
│  │                                                                   │   │
│  │  • Webhook /mcp-classroom                               0.2j     │   │
│  │  • Switch router (resource + operation)                 0.3j     │   │
│  │  • 34 classroomToolDynamic nodes                        0.3j     │   │
│  │  • Error handler + Respond to Webhook                   0.2j     │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

| # | Task | Description | Effort | Statut |
|---|------|-------------|--------|--------|
| 1.1 | Scaffold node | Créer structure `n8n-nodes-classroom-dynamic` basée sur calendarToolDynamic | 0.5j | ✅ |
| 1.2 | Resource course | 6 opérations (create, get, getAll, update, delete, archive) | 0.3j | ✅ |
| 1.3 | Resource courseWork | 5 opérations + workType enum | 0.3j | ✅ |
| 1.4 | Resource studentSubmission | 5 opérations (get, getAll, return, grade, modifyAttachments) | 0.3j | ✅ |
| 1.5 | Resources student/teacher | 8 opérations (4 chacune) | 0.3j | ✅ |
| 1.6 | Resources announcement/topic | 10 opérations (5 chacune) | 0.3j | ✅ |
| 1.7 | Pagination + Erreurs | Gestion pageToken, returnAll, error wrapper | 0.5j | ✅ |
| 1.8 | Tests unitaires | Coverage des 7 resources + edge cases | 0.5j | ⏳ (à faire) |
| 1.9 | Workflow MCP Server | `MCP_-_Google_Classroom_Server.json` | 1j | ✅ |

### Phase 2: Workflow Sync Programme (Séquentiel)

| # | Task | Description | Dépendance | Effort | Statut |
|---|------|-------------|------------|--------|--------|
| 2.1 | Workflow base | Webhook receiver + validation payload | Phase 1 | 0.5j | ✅ |
| 2.2 | Loop séquences | Créer topics via MCP-Classroom | 2.1 | 0.3j | ✅ |
| 2.3 | Loop séances | Créer courseWork via MCP-Classroom | 2.2 | 0.5j | ✅ |
| 2.4 | Callback back | POST résultat avec IDs créés | 2.3 | 0.2j | ✅ |

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

> **✅ Option A retenue — Node Custom**

| Phase | Composant | Effort | Statut |
|-------|-----------|--------|--------|
| 1.1 | Développement node `classroomToolDynamic` | 3j | ✅ Terminé |
| 1.2 | Workflow MCP Classroom Server | 1j | ✅ Terminé |
| 2 | Workflow Sync Programme | 1.5j | ✅ Terminé |
| 3 | Tests + Documentation | 1.5j | ⏳ En attente |
| **Total** | | **7j** | **~4.5j réalisés** |

### Répartition détaillée Phase 1 (Node Custom)

```
┌────────────────────────────────────────────────────────────────┐
│  Node classroomToolDynamic — 3j                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Scaffold + config         ████░░░░░░░░░░░░░░░░  0.5j          │
│  7 resources (34 ops)      ████████████░░░░░░░░  1.5j          │
│  Pagination + erreurs      ████░░░░░░░░░░░░░░░░  0.5j          │
│  Tests unitaires           ████░░░░░░░░░░░░░░░░  0.5j          │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Priorisation (Option A — Node Custom)

```
                     ┌─────────────────────────────┐
                     │ SEMAINE 1                   │
                     │ ─────────────────────────── │
                     │ [Back] OAuth + Token        │
                     │ Resolver (P0)               │
                     │                             │
                     │ [n8n] Scaffold node         │
                     │ classroomToolDynamic        │
                     └─────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────┴─────────────────────────────────┐
│ SEMAINE 2 (Parallèle)                                             │
│ ──────────────────────────────────────────────────────────────── │
│                                                                   │
│ [Back]                          [n8n]                             │
│ Migration RFC-081               Node: 7 resources                 │
│ Endpoint sync trigger           (course, courseWork, etc.)        │
│ Schemas Pydantic                                                  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                     ┌─────────────────────────────┐
                     │ SEMAINE 3                   │
                     │ ─────────────────────────── │
                     │ [n8n] Node: pagination,     │
                     │ erreurs, tests unitaires    │
                     │                             │
                     │ [n8n] Workflow MCP Server   │
                     └─────────────────────────────┘
                                  │
                                  ▼
                     ┌─────────────────────────────┐
                     │ SEMAINE 4                   │
                     │ ─────────────────────────── │
                     │ [n8n] Workflow Sync         │
                     │ Programme Expert            │
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
| **Complexité node TypeScript** | Retarde Phase 1 | Utiliser calendarToolDynamic comme template exact |
| **Token OAuth expiré pendant sync** | Sync partiel | Vérifier expiration avant chaque batch, refresh si < 5min |
| **API Classroom breaking changes** | Node à patcher | Wrapper les erreurs proprement pour diagnostic rapide |

---

## Questions pour Arbitrage

| # | Question | Options | Décision |
|---|----------|---------|----------|
| Q1 | Option A (node custom) ou B (HTTP) ? | A: plus propre, B: plus rapide | **✅ Option A** (2026-05-06) |
| Q2 | Batch size pour les loops ? | 10 / 50 / 100 séances par batch | **50** (recommandé — balance latence/quotas) |
| Q3 | Retry automatique sur 429 ? | Oui / Non | **Oui** avec backoff exponentiel (1s, 2s, 4s) |
| Q4 | Créer announcement global après sync ? | Oui / Non | **Non** (RFC-083 §D.3 Q6 — pollue) |

---

## Changelog

- **2026-05-06** — Création du plan d'implémentation n8n pour RFC-083 et RFC-084
- **2026-05-06** — Décision Option A (node custom) actée + ajout spécification complète `classroomToolDynamic`
- **2026-05-06** — ✅ Phase 1.1 terminée : Node `classroomToolDynamic` créé (7 resources, 34 opérations)
- **2026-05-06** — ✅ Phase 1.2 terminée : Workflow `MCP_-_Google_Classroom_Server.json` (37 nodes)
- **2026-05-06** — ✅ Phase 2 terminée : Workflow `Expert_Program_Classroom_Sync.json` (20 nodes)
