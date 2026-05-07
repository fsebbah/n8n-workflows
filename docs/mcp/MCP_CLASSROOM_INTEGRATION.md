# MCP Server - Intégration Google Classroom

Documentation technique pour l'équipe MCP Server sur l'intégration des webhooks n8n Google Classroom.

## Architecture

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Frontend   │─────▶│     API      │─────▶│  MCP Server  │
│              │      │  (chat.api)  │      │              │
└──────────────┘      └──────────────┘      └──────┬───────┘
                                                   │
                      ┌────────────────────────────┴────────────────────────────┐
                      │                                                         │
                      ▼                                                         ▼
        ┌─────────────────────────────┐              ┌─────────────────────────────────────┐
        │  /webhook/mcp-classroom     │              │  /webhook/expert-program-classroom- │
        │  (Opérations CRUD unitaires)│              │  sync (Orchestration batch)         │
        │  35 opérations disponibles  │◀─────────────│  Crée Topics + CourseWorks          │
        └──────────────┬──────────────┘   appelle    └─────────────────────────────────────┘
                       │                  en interne
                       ▼
              ┌─────────────────┐
              │  Google         │
              │  Classroom API  │
              └─────────────────┘
```

## Webhooks disponibles

| Webhook | URL | Usage | Quand l'utiliser |
|---------|-----|-------|------------------|
| **MCP Classroom** | `POST /webhook/mcp-classroom` | Opérations CRUD unitaires | Lister, créer, modifier, supprimer UNE ressource |
| **Expert Program Sync** | `POST /webhook/expert-program-classroom-sync` | Orchestration batch | Synchroniser un programme expert COMPLET (cours + topics + devoirs) |

### Choix du webhook

```
┌─────────────────────────────────────────────────────────────────────┐
│  Besoin de l'équipe MCP                    │  Webhook à appeler     │
├────────────────────────────────────────────┼────────────────────────┤
│  Lister les cours d'un utilisateur         │  mcp-classroom         │
│  Créer UN cours                            │  mcp-classroom         │
│  Créer UN devoir                           │  mcp-classroom         │
│  Noter une soumission                      │  mcp-classroom         │
│  Lister les étudiants                      │  mcp-classroom         │
│  ─────────────────────────────────────────────────────────────────  │
│  Synchroniser un programme expert complet  │  expert-program-sync   │
│  (crée cours + N topics + M devoirs)       │  (1 appel = tout)      │
└────────────────────────────────────────────┴────────────────────────┘
```

---

## Webhook MCP Classroom

### Endpoint

```
POST http://pi6.local:5678/webhook/mcp-classroom
Content-Type: application/json
```

### Payload de requête

```json
{
  "access_token": "ya29.a0AfH6SMBx...",
  "operation": "course.list",
  "params": {
    "teacherId": "me",
    "courseStates": ["ACTIVE"]
  },
  "correlation_id": "req-12345"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `access_token` | string | ✅ | Token OAuth2 Google de l'utilisateur |
| `operation` | string | ✅ | Opération au format `resource.action` |
| `params` | object | ❌ | Paramètres spécifiques à l'opération |
| `correlation_id` | string | ❌ | ID de traçabilité (retourné dans la réponse) |

### Payload de réponse

**Succès :**
```json
{
  "success": true,
  "operation": "course.list",
  "resource": "course",
  "data": {
    "courses": [
      {
        "id": "123456789",
        "name": "Introduction à Python",
        "courseState": "ACTIVE"
      }
    ]
  },
  "correlation_id": "req-12345",
  "error": null
}
```

**Erreur :**
```json
{
  "success": false,
  "operation": "course.list",
  "resource": "course",
  "data": null,
  "correlation_id": "req-12345",
  "error": {
    "code": 401,
    "message": "Invalid credentials",
    "details": "Token expired or revoked"
  }
}
```

---

## Opérations disponibles

### Course (Cours)

| Opération | Description | Paramètres requis |
|-----------|-------------|-------------------|
| `course.list` | Lister les cours | `teacherId` ou `studentId` |
| `course.get` | Obtenir un cours | `courseId` |
| `course.create` | Créer un cours | `name`, `ownerId` |
| `course.update` | Modifier un cours | `courseId`, champs à modifier |
| `course.delete` | Supprimer un cours | `courseId` |
| `course.archive` | Archiver un cours | `courseId` |

#### Exemple : Lister les cours

```json
{
  "access_token": "ya29...",
  "operation": "course.list",
  "params": {
    "teacherId": "me",
    "courseStates": ["ACTIVE", "PROVISIONED"]
  }
}
```

#### Exemple : Créer un cours

```json
{
  "access_token": "ya29...",
  "operation": "course.create",
  "params": {
    "name": "Python Avancé",
    "section": "Section A",
    "descriptionHeading": "Formation Python",
    "description": "Cours avancé de programmation Python",
    "room": "Salle 101",
    "ownerId": "me"
  }
}
```

---

### CourseWork (Devoirs)

| Opération | Description | Paramètres requis |
|-----------|-------------|-------------------|
| `courseWork.list` | Lister les devoirs | `courseId` |
| `courseWork.get` | Obtenir un devoir | `courseId`, `courseWorkId` |
| `courseWork.create` | Créer un devoir | `courseId`, `title`, `workType` |
| `courseWork.update` | Modifier un devoir | `courseId`, `courseWorkId` |
| `courseWork.delete` | Supprimer un devoir | `courseId`, `courseWorkId` |

#### Exemple : Créer un devoir

```json
{
  "access_token": "ya29...",
  "operation": "courseWork.create",
  "params": {
    "courseId": "123456789",
    "title": "Exercice Python #1",
    "description": "Implémenter une fonction de tri",
    "workType": "ASSIGNMENT",
    "state": "PUBLISHED",
    "maxPoints": 100,
    "dueDate": {
      "year": 2024,
      "month": 12,
      "day": 31
    },
    "dueTime": {
      "hours": 23,
      "minutes": 59
    }
  }
}
```

---

### StudentSubmission (Soumissions)

| Opération | Description | Paramètres requis |
|-----------|-------------|-------------------|
| `studentSubmission.list` | Lister les soumissions | `courseId`, `courseWorkId` |
| `studentSubmission.get` | Obtenir une soumission | `courseId`, `courseWorkId`, `submissionId` |
| `studentSubmission.patch` | Modifier une soumission | `courseId`, `courseWorkId`, `submissionId` |
| `studentSubmission.turnIn` | Rendre un devoir | `courseId`, `courseWorkId`, `submissionId` |
| `studentSubmission.return` | Retourner un devoir | `courseId`, `courseWorkId`, `submissionId` |
| `studentSubmission.reclaim` | Récupérer un devoir | `courseId`, `courseWorkId`, `submissionId` |

#### Exemple : Noter une soumission

```json
{
  "access_token": "ya29...",
  "operation": "studentSubmission.patch",
  "params": {
    "courseId": "123456789",
    "courseWorkId": "987654321",
    "submissionId": "CgwI...",
    "assignedGrade": 85,
    "draftGrade": 85
  }
}
```

---

### Student (Étudiants)

| Opération | Description | Paramètres requis |
|-----------|-------------|-------------------|
| `student.list` | Lister les étudiants | `courseId` |
| `student.get` | Obtenir un étudiant | `courseId`, `userId` |
| `student.create` | Inscrire un étudiant | `courseId`, `enrollmentCode` ou `userId` |
| `student.delete` | Désinscrire un étudiant | `courseId`, `userId` |

#### Exemple : Lister les étudiants

```json
{
  "access_token": "ya29...",
  "operation": "student.list",
  "params": {
    "courseId": "123456789"
  }
}
```

---

### Teacher (Enseignants)

| Opération | Description | Paramètres requis |
|-----------|-------------|-------------------|
| `teacher.list` | Lister les enseignants | `courseId` |
| `teacher.get` | Obtenir un enseignant | `courseId`, `userId` |
| `teacher.create` | Ajouter un enseignant | `courseId`, `userId` |
| `teacher.delete` | Retirer un enseignant | `courseId`, `userId` |

---

### Announcement (Annonces)

| Opération | Description | Paramètres requis |
|-----------|-------------|-------------------|
| `announcement.list` | Lister les annonces | `courseId` |
| `announcement.get` | Obtenir une annonce | `courseId`, `announcementId` |
| `announcement.create` | Créer une annonce | `courseId`, `text` |
| `announcement.update` | Modifier une annonce | `courseId`, `announcementId` |
| `announcement.delete` | Supprimer une annonce | `courseId`, `announcementId` |

#### Exemple : Publier une annonce

```json
{
  "access_token": "ya29...",
  "operation": "announcement.create",
  "params": {
    "courseId": "123456789",
    "text": "Rappel : devoir à rendre pour vendredi !",
    "state": "PUBLISHED"
  }
}
```

---

### Topic (Thèmes)

| Opération | Description | Paramètres requis |
|-----------|-------------|-------------------|
| `topic.list` | Lister les thèmes | `courseId` |
| `topic.get` | Obtenir un thème | `courseId`, `topicId` |
| `topic.create` | Créer un thème | `courseId`, `name` |
| `topic.update` | Modifier un thème | `courseId`, `topicId` |
| `topic.delete` | Supprimer un thème | `courseId`, `topicId` |

---

## Webhook Expert Program Sync

### Endpoint

```
POST http://pi6.local:5678/webhook/expert-program-classroom-sync
Content-Type: application/json
```

### Payload de requête

```json
{
  "access_token": "ya29...",
  "expert_program": {
    "id": "prog-123",
    "title": "Formation Python Expert",
    "description": "Programme de formation avancée",
    "modules": [
      {
        "id": "mod-1",
        "title": "Module 1 : Bases avancées",
        "assignments": [
          {
            "id": "assign-1",
            "title": "Exercice 1",
            "maxPoints": 100
          }
        ]
      }
    ]
  },
  "sync_options": {
    "create_course": true,
    "create_coursework": true,
    "sync_students": false
  }
}
```

### Payload de réponse

```json
{
  "success": true,
  "course_id": "123456789",
  "created": {
    "course": true,
    "coursework_count": 5,
    "topics_count": 3
  },
  "errors": []
}
```

---

## Implémentation côté MCP Server (Python)

### Classe ClassroomTool

```python
import httpx
from typing import Any, Optional

class ClassroomTool:
    """Wrapper pour les opérations Google Classroom via n8n."""

    N8N_WEBHOOK_URL = "http://pi6.local:5678/webhook/mcp-classroom"

    async def execute(
        self,
        access_token: str,
        operation: str,
        params: Optional[dict] = None,
        correlation_id: Optional[str] = None
    ) -> dict[str, Any]:
        """
        Exécute une opération Classroom.

        Args:
            access_token: Token OAuth2 Google de l'utilisateur
            operation: Opération au format "resource.action"
            params: Paramètres spécifiques à l'opération
            correlation_id: ID de traçabilité (optionnel)

        Returns:
            Réponse du webhook n8n
        """
        payload = {
            "access_token": access_token,
            "operation": operation,
            "params": params or {},
        }

        if correlation_id:
            payload["correlation_id"] = correlation_id

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                self.N8N_WEBHOOK_URL,
                json=payload
            )
            response.raise_for_status()
            return response.json()

    # === Méthodes de commodité ===

    async def list_courses(
        self,
        access_token: str,
        teacher_id: str = "me",
        course_states: list[str] = None
    ) -> dict:
        """Liste les cours d'un enseignant."""
        return await self.execute(
            access_token=access_token,
            operation="course.list",
            params={
                "teacherId": teacher_id,
                "courseStates": course_states or ["ACTIVE"]
            }
        )

    async def create_course(
        self,
        access_token: str,
        name: str,
        description: str = None,
        section: str = None
    ) -> dict:
        """Crée un nouveau cours."""
        params = {"name": name, "ownerId": "me"}
        if description:
            params["description"] = description
        if section:
            params["section"] = section

        return await self.execute(
            access_token=access_token,
            operation="course.create",
            params=params
        )

    async def create_assignment(
        self,
        access_token: str,
        course_id: str,
        title: str,
        description: str = None,
        max_points: int = 100,
        due_date: dict = None
    ) -> dict:
        """Crée un devoir dans un cours."""
        params = {
            "courseId": course_id,
            "title": title,
            "workType": "ASSIGNMENT",
            "state": "PUBLISHED",
            "maxPoints": max_points
        }
        if description:
            params["description"] = description
        if due_date:
            params["dueDate"] = due_date

        return await self.execute(
            access_token=access_token,
            operation="courseWork.create",
            params=params
        )
```

### Exemple d'utilisation

```python
import asyncio

async def main():
    tool = ClassroomTool()

    # Token OAuth de l'utilisateur (récupéré via le flow OAuth)
    access_token = "ya29.a0AfH6SMBx..."

    # Lister les cours
    result = await tool.list_courses(access_token)
    if result["success"]:
        for course in result["data"]["courses"]:
            print(f"Cours: {course['name']} (ID: {course['id']})")

    # Créer un cours
    result = await tool.create_course(
        access_token=access_token,
        name="Python Avancé",
        description="Formation Python niveau expert"
    )
    if result["success"]:
        course_id = result["data"]["id"]
        print(f"Cours créé: {course_id}")

        # Créer un devoir
        result = await tool.create_assignment(
            access_token=access_token,
            course_id=course_id,
            title="Exercice 1",
            description="Premier exercice pratique",
            max_points=100
        )
        print(f"Devoir créé: {result['data']['id']}")

asyncio.run(main())
```

---

## Gestion des erreurs

### Codes d'erreur courants

| Code | Signification | Action recommandée |
|------|---------------|-------------------|
| 401 | Token invalide/expiré | Rafraîchir le token OAuth |
| 403 | Permissions insuffisantes | Vérifier les scopes OAuth |
| 404 | Ressource non trouvée | Vérifier les IDs |
| 429 | Rate limit atteint | Implémenter un backoff exponentiel |
| 500 | Erreur serveur n8n | Retry avec backoff |

### Pattern de retry

```python
import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential

class ClassroomTool:
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10)
    )
    async def execute_with_retry(self, *args, **kwargs):
        return await self.execute(*args, **kwargs)
```

---

## Scopes OAuth requis

Pour que les opérations fonctionnent, l'utilisateur doit avoir autorisé les scopes suivants :

```python
CLASSROOM_SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses",
    "https://www.googleapis.com/auth/classroom.coursework.students",
    "https://www.googleapis.com/auth/classroom.coursework.me",
    "https://www.googleapis.com/auth/classroom.rosters",
    "https://www.googleapis.com/auth/classroom.announcements",
    "https://www.googleapis.com/auth/classroom.topics",
]
```

---

## Environnements

| Environnement | URL Webhook |
|---------------|-------------|
| **Local (pi6)** | `http://pi6.local:5678/webhook/mcp-classroom` |
| **Docker (host2)** | `http://host2.local:5678/webhook/mcp-classroom` |
| **Production** | À définir |

---

## Références

- [Google Classroom API Reference](https://developers.google.com/classroom/reference/rest)
- [Documentation interne n8n](/docs/mcp/GOOGLE_CLASSROOM_MCP_API.md)
- [RFC-083 - MCP Google Classroom Server](/docs/rfc/RFC-083-MCP-CLASSROOM.md)
