# RFC-083 — MCP Google Classroom Server

**Date** : 2026-05-06
**Statut** : Draft
**Auteur** : Franck Sebbah + Claude
**Prerequis** : Architecture MCP existante (Gmail, Calendar, Drive, Contacts)
**Equipes** : n8n, Backend API
**Priorite** : À définir

---

## 1. Objectif

Créer un workflow n8n **MCP - Google Classroom Server** permettant d'interagir avec l'API Google Classroom via webhooks, suivant le pattern multi-tenant établi pour les autres services Google (Gmail, Calendar, Drive, Contacts).

---

## 2. Analyse de l'Existant — Services Google MCP

### 2.1 Architecture Commune

Tous les workflows MCP Google partagent la même architecture **"Bring Your Own Token" (BYOT)** :

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌────────────────────┐
│  Webhook POST   │ ──► │  Route by Op     │ ──► │  Action Node    │ ──► │ Respond to Webhook │
│  /mcp-{service} │     │  (Switch)        │     │  (Dynamic Tool) │     │ JSON standardisé   │
└─────────────────┘     └──────────────────┘     └─────────────────┘     └────────────────────┘
```

**Points clés :**
- **Pas de projet GCP côté n8n** : Le `access_token` OAuth2 est fourni par l'appelant (tenant)
- **Multi-tenant natif** : Chaque tenant utilise son propre compte Google
- **Nodes custom dynamiques** : Acceptent un `accessToken` au lieu de credentials n8n

### 2.2 Inventaire des Services Google MCP Existants

| Service | Webhook Path | Node Type | Statut |
|---------|--------------|-----------|--------|
| **Gmail** | `/mcp-gmail` | `CUSTOM.gmailToolDynamic` | Archivé |
| **Calendar** | `/mcp-calendar` | `n8n-nodes-calendar-dynamic.calendarToolDynamic` | ✅ Actif |
| **Drive** | `/mcp-drive` | `n8n-nodes-drive-dynamic.driveToolDynamic` | ✅ Actif |
| **Contacts** | `/mcp-contacts` | `n8n-nodes-contacts-dynamic.contactsToolDynamic` | ✅ Actif |
| **Classroom** | `/mcp-classroom` | À créer | ❌ Proposé |

### 2.3 Paramètres d'Entrée Communs

Tous les services partagent les mêmes paramètres de base :

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `access_token` | string | ✅ | Token OAuth2 Google du tenant |
| `resource` | string | ✅ | Type de ressource cible |
| `operation` | string | ✅ | Opération à effectuer |

### 2.4 Détail par Service Existant

#### 📅 MCP - Google Calendar Server

| Resource | Operations | Paramètres Spécifiques |
|----------|------------|------------------------|
| `event` | create, get, getAll, update, delete | `calendar_id`, `event_id`, `summary`, `start`, `end`, `description`, `location`, `attendees`, `all_day`, `timezone`, `time_min`, `time_max`, `max_results`, `query`, `single_events`, `order_by` |
| `calendar` | getAll | *(aucun)* |

#### 📁 MCP - Google Drive Server

| Resource | Operations | Paramètres Spécifiques |
|----------|------------|------------------------|
| `file` | list, get, download, upload, update, delete, copy, move, share | `file_id`, `folder_id`, `query`, `max_results`, `name`, `content`, `mime_type`, `parent_id`, `email`, `role` |
| `folder` | create, list, delete | `folder_id`, `name`, `parent_id`, `max_results` |

#### 👥 MCP - Google Contacts Server

| Resource | Operations | Paramètres Spécifiques |
|----------|------------|------------------------|
| `contact` | create, get, getAll, update, delete, search | `resource_name`, `person_fields`, `page_size`, `page_token`, `query`, `given_name`, `family_name`, `email`, `email_type`, `phone`, `phone_type`, `organization`, `job_title`, `notes` |
| `contactGroup` | create, get, getAll, update, delete, addMembers, removeMembers | `group_resource_name`, `group_name`, `resource_names` |

#### 📧 MCP - Gmail Server (archivé)

| Resource | Operations | Paramètres Spécifiques |
|----------|------------|------------------------|
| `message` | get, getAll, delete, reply, markAsRead, markAsUnread, addLabels, removeLabels | `message_id`, `query`, `sender`, `received_after`, `received_before`, `cc`, `bcc`, `label_ids` |
| `label` | getAll, get, create, delete | `label_id`, `label_name` |
| `draft` | create, get, getAll, delete | `draft_id`, `subject`, `message`, `cc`, `bcc` |
| `thread` | getAll, get, reply, addLabels, removeLabels | `thread_id`, `query`, `label_ids` |

---

## 3. Proposition — MCP Google Classroom Server

### 3.1 Vue d'ensemble

Google Classroom API permet de gérer :
- **Courses** : Classes/cours
- **CourseWork** : Devoirs, travaux assignés
- **StudentSubmissions** : Soumissions des élèves
- **Students / Teachers** : Gestion des inscriptions
- **Announcements** : Annonces de classe
- **Topics** : Organisation thématique du contenu

### 3.2 Webhook et Routage

```
POST /webhook/mcp-classroom
Content-Type: application/json

{
  "access_token": "ya29.xxx...",
  "resource": "course",
  "operation": "create",
  ...paramètres spécifiques
}
```

### 3.3 Resources et Operations Proposées

#### 📚 Resource: `course`

| Operation | Description | Paramètres |
|-----------|-------------|------------|
| `create` | Créer un cours | `name` (requis), `section`, `description_heading`, `description`, `room`, `owner_id` |
| `get` | Obtenir un cours | `course_id` (requis) |
| `getAll` | Lister les cours | `student_id`, `teacher_id`, `course_states` (ACTIVE, ARCHIVED, PROVISIONED, DECLINED) |
| `update` | Modifier un cours | `course_id` (requis), `name`, `section`, `description`, `room`, `course_state` |
| `delete` | Supprimer un cours | `course_id` (requis) |
| `archive` | Archiver un cours | `course_id` (requis) |

**Exemple payload :**
```json
{
  "access_token": "ya29.xxx",
  "resource": "course",
  "operation": "create",
  "name": "Cuisine Française - Promo 2026",
  "section": "Groupe A",
  "description": "Cours de cuisine professionnelle",
  "room": "Salle 101"
}
```

#### 📝 Resource: `courseWork`

| Operation | Description | Paramètres |
|-----------|-------------|------------|
| `create` | Créer un devoir/travail | `course_id` (requis), `title` (requis), `description`, `work_type` (ASSIGNMENT, SHORT_ANSWER_QUESTION, MULTIPLE_CHOICE_QUESTION), `due_date`, `due_time`, `max_points`, `state` (DRAFT, PUBLISHED), `materials` |
| `get` | Obtenir un travail | `course_id` (requis), `coursework_id` (requis) |
| `getAll` | Lister les travaux | `course_id` (requis), `course_work_states`, `order_by` |
| `update` | Modifier un travail | `course_id` (requis), `coursework_id` (requis), `title`, `description`, `due_date`, `max_points`, `state` |
| `delete` | Supprimer un travail | `course_id` (requis), `coursework_id` (requis) |

**Exemple payload :**
```json
{
  "access_token": "ya29.xxx",
  "resource": "courseWork",
  "operation": "create",
  "course_id": "123456789",
  "title": "TP - Sauce Béarnaise",
  "description": "Réaliser une sauce béarnaise selon la technique classique",
  "work_type": "ASSIGNMENT",
  "due_date": { "year": 2026, "month": 5, "day": 15 },
  "due_time": { "hours": 17, "minutes": 0 },
  "max_points": 20,
  "state": "PUBLISHED"
}
```

#### 📤 Resource: `studentSubmission`

| Operation | Description | Paramètres |
|-----------|-------------|------------|
| `get` | Obtenir une soumission | `course_id`, `coursework_id`, `submission_id` |
| `getAll` | Lister les soumissions | `course_id`, `coursework_id`, `user_id`, `states` (NEW, CREATED, TURNED_IN, RETURNED, RECLAIMED_BY_STUDENT) |
| `return` | Rendre une soumission notée | `course_id`, `coursework_id`, `submission_id` |
| `grade` | Noter une soumission | `course_id`, `coursework_id`, `submission_id`, `assigned_grade`, `draft_grade` |
| `modifyAttachments` | Modifier les pièces jointes | `course_id`, `coursework_id`, `submission_id`, `add_attachments` |

#### 👨‍🎓 Resource: `student`

| Operation | Description | Paramètres |
|-----------|-------------|------------|
| `create` | Inscrire un étudiant | `course_id` (requis), `user_id` (requis) |
| `get` | Obtenir un étudiant | `course_id`, `user_id` |
| `getAll` | Lister les étudiants | `course_id` (requis) |
| `delete` | Désinscrire un étudiant | `course_id`, `user_id` |

#### 👨‍🏫 Resource: `teacher`

| Operation | Description | Paramètres |
|-----------|-------------|------------|
| `create` | Ajouter un enseignant | `course_id` (requis), `user_id` (requis) |
| `get` | Obtenir un enseignant | `course_id`, `user_id` |
| `getAll` | Lister les enseignants | `course_id` (requis) |
| `delete` | Retirer un enseignant | `course_id`, `user_id` |

#### 📢 Resource: `announcement`

| Operation | Description | Paramètres |
|-----------|-------------|------------|
| `create` | Créer une annonce | `course_id` (requis), `text` (requis), `materials`, `state` (DRAFT, PUBLISHED), `scheduled_time` |
| `get` | Obtenir une annonce | `course_id`, `announcement_id` |
| `getAll` | Lister les annonces | `course_id` (requis), `announcement_states`, `order_by` |
| `update` | Modifier une annonce | `course_id`, `announcement_id`, `text`, `state`, `scheduled_time` |
| `delete` | Supprimer une annonce | `course_id`, `announcement_id` |

#### 📁 Resource: `topic`

| Operation | Description | Paramètres |
|-----------|-------------|------------|
| `create` | Créer un sujet | `course_id` (requis), `name` (requis) |
| `get` | Obtenir un sujet | `course_id`, `topic_id` |
| `getAll` | Lister les sujets | `course_id` (requis) |
| `update` | Modifier un sujet | `course_id`, `topic_id`, `name` |
| `delete` | Supprimer un sujet | `course_id`, `topic_id` |

---

## 4. Options d'Implémentation

### 4.1 Option A — Node Custom Dédié (Recommandé)

Créer un node n8n personnalisé `n8n-nodes-classroom-dynamic.classroomToolDynamic` suivant le pattern des autres services Google.

**Avantages :**
- Cohérence avec l'architecture existante
- Meilleure UX (auto-complétion, validation)
- Maintenabilité à long terme

**Inconvénients :**
- Temps de développement plus long
- Nécessite publication npm

**Effort estimé** : 3-5 jours

### 4.2 Option B — HTTP Request Nodes Direct

Utiliser des nodes `HTTP Request` avec l'API REST Google Classroom directement.

**Avantages :**
- Implémentation rapide
- Pas besoin de node custom

**Inconvénients :**
- Plus verbeux (configuration manuelle de chaque opération)
- Moins maintenable
- Pas de typage/validation native

**Effort estimé** : 1-2 jours

### 4.3 Recommandation

**Option A (Node Custom)** pour la cohérence long terme avec l'écosystème MCP Google.

Si besoin d'un MVP rapide, **Option B** peut servir de prototype pour valider les besoins fonctionnels avant d'investir dans le node custom.

---

## 5. Scopes OAuth2 Requis

Pour utiliser l'API Google Classroom, le token OAuth2 doit inclure les scopes appropriés :

| Scope | Description | Requis pour |
|-------|-------------|-------------|
| `https://www.googleapis.com/auth/classroom.courses` | Gérer les cours | course (CRUD) |
| `https://www.googleapis.com/auth/classroom.courses.readonly` | Lire les cours | course (get, getAll) |
| `https://www.googleapis.com/auth/classroom.coursework.students` | Gérer les travaux | courseWork, studentSubmission |
| `https://www.googleapis.com/auth/classroom.rosters` | Gérer les inscriptions | student, teacher |
| `https://www.googleapis.com/auth/classroom.rosters.readonly` | Lire les inscriptions | student (get), teacher (get) |
| `https://www.googleapis.com/auth/classroom.announcements` | Gérer les annonces | announcement (CRUD) |
| `https://www.googleapis.com/auth/classroom.topics` | Gérer les sujets | topic (CRUD) |

**Note** : Le tenant doit configurer ces scopes dans son application OAuth2 (projet GCP).

---

## 6. Format de Réponse Standardisé

Suivant le pattern établi :

**Succès :**
```json
{
  "success": true,
  "data": { /* résultat de l'opération */ },
  "error": null
}
```

**Erreur :**
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "invalid_course_id",
    "message": "Course not found: 123456789"
  }
}
```

---

## 7. Cas d'Usage Métier

### 7.1 Synchronisation avec Discord Groups (RFC-061)

Intégration potentielle avec le système de groups Discord existant :

```
Création groupe Discord (admin UI)
    ↓
Webhook n8n → Création cours Google Classroom
    ↓
Inscription étudiants (flux RFC-067)
    ↓
Sync automatique étudiants → Google Classroom
```

### 7.2 Workflow Type — Création de Cours depuis Discord

```
1. Admin crée un groupe Discord (UI web)
2. Backend déclenche webhook n8n
3. n8n appelle MCP-Classroom → create course
4. Pour chaque étudiant pré-inscrit :
   - n8n appelle MCP-Classroom → create student
5. Retour confirmation à l'admin
```

### 7.3 Workflow Type — Publication de Devoir

```
1. Formateur envoie commande Discord /devoir
2. Bot relaye vers n8n
3. n8n appelle MCP-Classroom → create courseWork
4. n8n appelle MCP-Classroom → create announcement
5. Retour confirmation au formateur
```

---

## 8. Estimation

| Tâche | Option A (Custom Node) | Option B (HTTP Direct) |
|-------|------------------------|------------------------|
| Analyse API Google Classroom | 0.5j | 0.5j |
| Développement node/workflow | 3j | 1j |
| Tests unitaires | 1j | 0.5j |
| Documentation | 0.5j | 0.5j |
| **Total** | **5j** | **2.5j** |

---

## 9. Prérequis

### 9.1 Côté Tenant (utilisateur)

- [ ] Projet GCP avec API Classroom activée
- [ ] Application OAuth2 avec scopes Classroom configurés
- [ ] Tokens OAuth2 avec refresh token pour accès prolongé

### 9.2 Côté n8n

- [ ] Décision sur l'option d'implémentation (A ou B)
- [ ] Si Option A : développement et déploiement du node custom
- [ ] Template workflow basé sur le pattern existant

---

## 10. Questions Ouvertes

1. **Priorité** : Quels cas d'usage sont prioritaires ? (cours, devoirs, annonces)
2. **Intégration Discord** : Faut-il synchroniser automatiquement les groups Discord avec Google Classroom ?
3. **Node custom vs HTTP** : Temps disponible pour l'implémentation ?
4. **Scopes OAuth** : Qui gère la configuration OAuth côté tenant ?

---

## 11. Références

- [Google Classroom API Documentation](https://developers.google.com/classroom/reference/rest)
- [API Explorer](https://developers.google.com/classroom/reference/rest/v1/courses)
- RFC-061 : Discord Groups / Students / Channels
- RFC-067 : Flow de vérification email par DM Discord
- Workflows existants : MCP-Gmail, MCP-Calendar, MCP-Drive, MCP-Contacts

---

## Annexe A — Structure JSON Complète du Workflow Proposé

```json
{
  "name": "MCP - Google Classroom Server",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "mcp-classroom",
        "responseMode": "responseNode",
        "options": {}
      },
      "name": "Webhook MCP Classroom",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [200, 300],
      "webhookId": "mcp-classroom"
    },
    {
      "parameters": {
        "rules": {
          "values": [
            {
              "conditions": {
                "conditions": [
                  { "leftValue": "={{ $json.body.resource }}", "rightValue": "course" },
                  { "leftValue": "={{ $json.body.operation }}", "rightValue": "create" }
                ],
                "combinator": "and"
              },
              "outputLabel": "course_create"
            }
            // ... autres routes
          ]
        }
      },
      "name": "Route by Operation",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [420, 300]
    }
    // ... nodes d'action et respond
  ],
  "connections": { /* ... */ },
  "settings": {
    "executionOrder": "v1",
    "callerPolicy": "workflowsFromSameOwner",
    "availableInMCP": false
  }
}
```

---

## Annexe B — Comparaison avec les Nodes Existants

| Aspect | Calendar | Drive | Contacts | Classroom (proposé) |
|--------|----------|-------|----------|---------------------|
| Node Type | `calendarToolDynamic` | `driveToolDynamic` | `contactsToolDynamic` | `classroomToolDynamic` |
| Resources | 2 | 2 | 2 | 6 |
| Operations | ~8 | ~12 | ~13 | ~25 |
| Complexité | Moyenne | Moyenne | Moyenne | Haute |
