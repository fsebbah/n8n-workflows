# RFC-083 — Webhooks n8n Google Classroom

**Date:** 2026-05-06
**Statut:** ✅ Implémenté
**PR:** #346
**RFC:** [RFC-083-MCP-GOOGLE-CLASSROOM-SERVER](../rfc/RFC-083-MCP-GOOGLE-CLASSROOM-SERVER.md)

---

## Vue d'ensemble

Cette RFC implémente deux webhooks n8n pour l'intégration Google Classroom :

| Webhook | Path | Description |
|---------|------|-------------|
| [MCP Google Classroom Server](#1-mcp-google-classroom-server) | `/webhook/mcp-classroom` | API MCP complète (34 opérations) |
| [Expert Program Classroom Sync](#2-expert-program-classroom-sync) | `/webhook/expert-program-classroom-sync` | Synchronisation programme → Classroom |

---

## 1. MCP Google Classroom Server

### Informations générales

| Champ | Valeur |
|-------|--------|
| **Fichier** | `workflows/MCP_-_Google_Classroom_Server.json` |
| **Endpoint** | `POST /webhook/mcp-classroom` |
| **Nodes** | 37 |
| **Pattern** | BYOT (Bring Your Own Token) |
| **Documentation API** | [GOOGLE_CLASSROOM_MCP_API.md](../mcp/GOOGLE_CLASSROOM_MCP_API.md) |

### Authentication

Chaque requête doit inclure un `access_token` OAuth2 Google avec les scopes Classroom appropriés.

```json
{
  "access_token": "ya29.xxx...",
  "resource": "course",
  "operation": "getAll"
}
```

### Réponse standard

**Succès :**
```json
{
  "success": true,
  "data": { /* réponse Google Classroom API */ }
}
```

**Erreur :**
```json
{
  "success": false,
  "error": {
    "code": "classroom_api_error",
    "message": "Course not found",
    "details": { /* erreur Google */ }
  }
}
```

---

### Endpoints par Resource

#### 1.1 Course (Cours)

| Operation | Méthode | Paramètres | Description |
|-----------|---------|------------|-------------|
| `create` | POST | `name`*, `section`, `description`, `room`, `owner_id` | Créer un cours |
| `get` | GET | `course_id`* | Récupérer un cours |
| `getAll` | GET | `student_id`, `teacher_id`, `course_states[]`, `return_all`, `limit` | Lister les cours |
| `update` | PATCH | `course_id`*, `name`, `section`, `description`, `room`, `course_state` | Modifier un cours |
| `delete` | DELETE | `course_id`* | Supprimer un cours |
| `archive` | POST | `course_id`* | Archiver un cours |

**Exemple - Créer un cours :**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "course",
  "operation": "create",
  "name": "Mathématiques 2nde",
  "section": "Classe A",
  "description": "Programme de mathématiques seconde générale",
  "room": "Salle 201"
}
```

---

#### 1.2 CourseWork (Devoirs/Travaux)

| Operation | Méthode | Paramètres | Description |
|-----------|---------|------------|-------------|
| `create` | POST | `course_id`*, `title`*, `work_type`*, `description`, `max_points`, `due_date`, `due_time`, `topic_id`, `state` | Créer un devoir |
| `get` | GET | `course_id`*, `coursework_id`* | Récupérer un devoir |
| `getAll` | GET | `course_id`*, `coursework_states[]`, `order_by`, `return_all`, `limit` | Lister les devoirs |
| `update` | PATCH | `course_id`*, `coursework_id`*, `title`, `description`, `due_date`, `max_points`, `state` | Modifier un devoir |
| `delete` | DELETE | `course_id`*, `coursework_id`* | Supprimer un devoir |

**work_type values :** `ASSIGNMENT`, `SHORT_ANSWER_QUESTION`, `MULTIPLE_CHOICE_QUESTION`

**Exemple - Créer un devoir :**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "courseWork",
  "operation": "create",
  "course_id": "123456789",
  "title": "Exercices Chapitre 1",
  "description": "Compléter les exercices 1 à 10 page 42",
  "work_type": "ASSIGNMENT",
  "max_points": 20,
  "due_date": "2026-05-15",
  "due_time": "23:59:00",
  "topic_id": "topic123",
  "state": "PUBLISHED"
}
```

---

#### 1.3 StudentSubmission (Rendus élèves)

| Operation | Méthode | Paramètres | Description |
|-----------|---------|------------|-------------|
| `get` | GET | `course_id`*, `coursework_id`*, `submission_id`* | Récupérer un rendu |
| `getAll` | GET | `course_id`*, `coursework_id`*, `user_id`, `states[]`, `return_all` | Lister les rendus |
| `return` | POST | `course_id`*, `coursework_id`*, `submission_id`* | Retourner à l'élève |
| `grade` | PATCH | `course_id`*, `coursework_id`*, `submission_id`*, `assigned_grade`*, `draft_grade` | Noter un rendu |
| `modifyAttachments` | POST | `course_id`*, `coursework_id`*, `submission_id`*, `add_attachments[]` | Ajouter des pièces jointes |

**Exemple - Noter un rendu :**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "studentSubmission",
  "operation": "grade",
  "course_id": "123456789",
  "coursework_id": "cw123",
  "submission_id": "sub456",
  "assigned_grade": 17,
  "draft_grade": 17
}
```

---

#### 1.4 Student (Élèves)

| Operation | Méthode | Paramètres | Description |
|-----------|---------|------------|-------------|
| `create` | POST | `course_id`*, `user_id`* | Ajouter un élève |
| `get` | GET | `course_id`*, `user_id`* | Récupérer un élève |
| `getAll` | GET | `course_id`*, `return_all`, `limit` | Lister les élèves |
| `delete` | DELETE | `course_id`*, `user_id`* | Retirer un élève |

**Exemple - Ajouter un élève :**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "student",
  "operation": "create",
  "course_id": "123456789",
  "user_id": "eleve@ecole.fr"
}
```

---

#### 1.5 Teacher (Enseignants)

| Operation | Méthode | Paramètres | Description |
|-----------|---------|------------|-------------|
| `create` | POST | `course_id`*, `user_id`* | Ajouter un enseignant |
| `get` | GET | `course_id`*, `user_id`* | Récupérer un enseignant |
| `getAll` | GET | `course_id`*, `return_all`, `limit` | Lister les enseignants |
| `delete` | DELETE | `course_id`*, `user_id`* | Retirer un enseignant |

---

#### 1.6 Announcement (Annonces)

| Operation | Méthode | Paramètres | Description |
|-----------|---------|------------|-------------|
| `create` | POST | `course_id`*, `text`*, `state`, `scheduled_time`, `assignee_mode` | Créer une annonce |
| `get` | GET | `course_id`*, `announcement_id`* | Récupérer une annonce |
| `getAll` | GET | `course_id`*, `announcement_states[]`, `order_by`, `return_all` | Lister les annonces |
| `update` | PATCH | `course_id`*, `announcement_id`*, `text`, `state`, `scheduled_time` | Modifier une annonce |
| `delete` | DELETE | `course_id`*, `announcement_id`* | Supprimer une annonce |

**Exemple - Créer une annonce :**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "announcement",
  "operation": "create",
  "course_id": "123456789",
  "text": "Bienvenue dans le cours ! N'oubliez pas de lire le syllabus.",
  "state": "PUBLISHED"
}
```

---

#### 1.7 Topic (Rubriques)

| Operation | Méthode | Paramètres | Description |
|-----------|---------|------------|-------------|
| `create` | POST | `course_id`*, `name`* | Créer une rubrique |
| `get` | GET | `course_id`*, `topic_id`* | Récupérer une rubrique |
| `getAll` | GET | `course_id`*, `return_all`, `limit` | Lister les rubriques |
| `update` | PATCH | `course_id`*, `topic_id`*, `name`* | Modifier une rubrique |
| `delete` | DELETE | `course_id`*, `topic_id`* | Supprimer une rubrique |

**Exemple - Créer une rubrique :**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "topic",
  "operation": "create",
  "course_id": "123456789",
  "name": "Séquence 1 - Introduction"
}
```

---

### Tableau récapitulatif des 34 opérations

| # | Resource | Operation | Params requis |
|---|----------|-----------|---------------|
| 1 | course | create | `name` |
| 2 | course | get | `course_id` |
| 3 | course | getAll | — |
| 4 | course | update | `course_id` |
| 5 | course | delete | `course_id` |
| 6 | course | archive | `course_id` |
| 7 | courseWork | create | `course_id`, `title`, `work_type` |
| 8 | courseWork | get | `course_id`, `coursework_id` |
| 9 | courseWork | getAll | `course_id` |
| 10 | courseWork | update | `course_id`, `coursework_id` |
| 11 | courseWork | delete | `course_id`, `coursework_id` |
| 12 | studentSubmission | get | `course_id`, `coursework_id`, `submission_id` |
| 13 | studentSubmission | getAll | `course_id`, `coursework_id` |
| 14 | studentSubmission | return | `course_id`, `coursework_id`, `submission_id` |
| 15 | studentSubmission | grade | `course_id`, `coursework_id`, `submission_id`, `assigned_grade` |
| 16 | studentSubmission | modifyAttachments | `course_id`, `coursework_id`, `submission_id` |
| 17 | student | create | `course_id`, `user_id` |
| 18 | student | get | `course_id`, `user_id` |
| 19 | student | getAll | `course_id` |
| 20 | student | delete | `course_id`, `user_id` |
| 21 | teacher | create | `course_id`, `user_id` |
| 22 | teacher | get | `course_id`, `user_id` |
| 23 | teacher | getAll | `course_id` |
| 24 | teacher | delete | `course_id`, `user_id` |
| 25 | announcement | create | `course_id`, `text` |
| 26 | announcement | get | `course_id`, `announcement_id` |
| 27 | announcement | getAll | `course_id` |
| 28 | announcement | update | `course_id`, `announcement_id` |
| 29 | announcement | delete | `course_id`, `announcement_id` |
| 30 | topic | create | `course_id`, `name` |
| 31 | topic | get | `course_id`, `topic_id` |
| 32 | topic | getAll | `course_id` |
| 33 | topic | update | `course_id`, `topic_id`, `name` |
| 34 | topic | delete | `course_id`, `topic_id` |

---

## 2. Expert Program Classroom Sync

### Informations générales

| Champ | Valeur |
|-------|--------|
| **Fichier** | `workflows/Expert_Program_Classroom_Sync.json` |
| **Endpoint** | `POST /webhook/expert-program-classroom-sync` |
| **Nodes** | 20 |
| **Appelant** | Backend (chat.api) via `ExpertProgramClassroomSyncService` |

### Description

Ce webhook orchestre la synchronisation d'un programme pédagogique (généré par l'expert) vers Google Classroom :

1. **Crée des Topics** pour chaque séquence (`programme.architecture[]`)
2. **Crée des CourseWork** pour chaque séance (`programme.progression[]`)
3. **Associe** chaque courseWork au topic correspondant via `sequence_id`
4. **Callback** optionnel vers le backend avec les IDs créés

### Input Schema

```json
{
  "expert_response_id": "550e8400-e29b-41d4-a716-446655440000",
  "course_id": "123456789",
  "access_token": "ya29.a0AfH6SMBx...",
  "callback_url": "https://api.example.com/api/expert-responses/{id}/classroom-sync-complete",
  "programme": {
    "architecture": [
      {
        "id": "seq-001",
        "titre": "Séquence 1 - Les fondamentaux",
        "description": "Introduction aux concepts de base"
      },
      {
        "id": "seq-002",
        "titre": "Séquence 2 - Approfondissement",
        "description": "Exploration des notions avancées"
      }
    ],
    "progression": [
      {
        "id": "sess-001",
        "sequence_id": "seq-001",
        "titre": "Séance 1.1 - Introduction",
        "description": "Présentation du programme",
        "objectifs": [
          "Comprendre les enjeux",
          "Identifier les concepts clés"
        ],
        "duree_minutes": 60,
        "work_type": "ASSIGNMENT"
      },
      {
        "id": "sess-002",
        "sequence_id": "seq-001",
        "titre": "Séance 1.2 - Exercices pratiques",
        "description": "Mise en application",
        "objectifs": [
          "Appliquer les concepts",
          "Résoudre des problèmes simples"
        ],
        "duree_minutes": 90
      }
    ]
  }
}
```

### Paramètres

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `expert_response_id` | UUID | ✅ | ID de la réponse expert (parcours) |
| `course_id` | string | ✅ | ID du cours Google Classroom cible |
| `access_token` | string | ✅ | Token OAuth2 Google de l'enseignant |
| `callback_url` | string | ❌ | URL de callback pour notifier le backend |
| `programme` | object | ✅ | Structure du programme à synchroniser |
| `programme.architecture` | array | ✅ | Liste des séquences |
| `programme.progression` | array | ✅ | Liste des séances |

### Output Schema

**Succès (HTTP 200) :**
```json
{
  "success": true,
  "data": {
    "expert_response_id": "550e8400-e29b-41d4-a716-446655440000",
    "course_id": "123456789",
    "topics_created": 2,
    "coursework_created": 5,
    "topic_ids": ["topic-abc", "topic-def"],
    "coursework_ids": ["cw-001", "cw-002", "cw-003", "cw-004", "cw-005"],
    "topic_mapping": {
      "seq-001": "topic-abc",
      "seq-002": "topic-def"
    },
    "detailed_coursework": [
      {
        "session_id": "sess-001",
        "coursework_id": "cw-001",
        "sequence_id": "seq-001",
        "topic_id": "topic-abc",
        "title": "Séance 1.1 - Introduction"
      }
    ],
    "callback_sent": true,
    "synced_at": "2026-05-06T15:30:00.000Z",
    "stats": {
      "total_sequences": 2,
      "total_sessions": 5,
      "started_at": "2026-05-06T15:29:45.000Z",
      "completed_at": "2026-05-06T15:30:00.000Z",
      "topics_requested": 2,
      "sessions_requested": 5,
      "errors_count": 0
    }
  }
}
```

**Succès partiel (HTTP 207) :**
```json
{
  "success": false,
  "partial_success": true,
  "data": { /* ... */ },
  "errors": [
    {
      "type": "coursework_creation_failed",
      "session_id": "sess-003",
      "session_title": "Séance 2.1",
      "error": { "code": 429, "message": "Quota exceeded" }
    }
  ]
}
```

**Erreur validation (HTTP 400) :**
```json
{
  "success": false,
  "error": {
    "code": "invalid_payload",
    "message": "Missing required fields: expert_response_id, course_id, access_token, programme"
  }
}
```

### Flux de traitement

```
POST /webhook/expert-program-classroom-sync
         │
         ▼
┌─────────────────────┐
│ 1. Validate Payload │ ──400──► Respond Error
└─────────┬───────────┘
          │ valid
          ▼
┌─────────────────────┐
│ 2. Initialize       │
│    Context          │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐     ┌──────────────────────┐
│ 3. Loop Sequences   │────►│ POST /mcp-classroom  │
│    (create topics)  │     │ resource=topic       │
└─────────┬───────────┘     │ operation=create     │
          │                 └──────────────────────┘
          ▼
┌─────────────────────┐     ┌──────────────────────┐
│ 4. Loop Sessions    │────►│ POST /mcp-classroom  │
│    (create works)   │     │ resource=courseWork  │
└─────────┬───────────┘     │ operation=create     │
          │                 └──────────────────────┘
          ▼
┌─────────────────────┐
│ 5. Callback Backend │ (si callback_url fourni)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 6. Respond Success  │ ──► 200 / 207 / 500
└─────────────────────┘
```

---

## Codes d'erreur

| Code | HTTP | Description |
|------|------|-------------|
| `invalid_payload` | 400 | Champs requis manquants |
| `auth_error` | 401 | Token OAuth invalide ou expiré |
| `permission_denied` | 403 | Permissions insuffisantes |
| `not_found` | 404 | Ressource non trouvée |
| `quota_exceeded` | 429 | Quota API Google dépassé |
| `classroom_api_error` | 4xx/5xx | Erreur générique Classroom |

---

## Fichiers associés

| Fichier | Description |
|---------|-------------|
| `workflows/MCP_-_Google_Classroom_Server.json` | Workflow MCP (37 nodes) |
| `workflows/Expert_Program_Classroom_Sync.json` | Workflow sync (20 nodes) |
| `custom-nodes/n8n-nodes-classroom-dynamic/` | Node TypeScript custom |
| `docs/mcp/GOOGLE_CLASSROOM_MCP_API.md` | Documentation API détaillée |
| `docs/issues/ISSUE-RFC083-084-N8N-WEBHOOKS-PLAN.md` | Plan d'implémentation |

---

## Changelog

- **2026-05-06** — Création initiale (PR #346)
