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

### 7.4 Workflow Type — Sync Programme expert → Google Classroom (NEW v2)

Cas d'usage canonique débloqué par RFC-080 (parcours expert) + RFC-084 (extraction multi-matière). Une fois qu'un enseignant finalise un programme annuel via la Quick-Action « Programme à partir d'un référentiel », il peut le pousser dans sa Classroom :

```
1. Enseignant termine la phase 3 du Program Builder
2. Picker post-finalize : choix « Lié à une classe Google Classroom »
3. Sélection : Course Classroom cible (depuis getAll côté MCP)
4. Front appelle l'endpoint binding (cf. §7.6 / RFC-082 pattern)
5. n8n / back :
   a. Pour chaque séquence du programme.architecture[] :
      - MCP-Classroom create topic (1 topic par séquence)
   b. Pour chaque séance de programme.progression[] :
      - MCP-Classroom create courseWork (rattaché au topic de sa séquence)
   c. MCP-Classroom create announcement (« Programme annuel publié »)
6. Réponse stockée : list des courseWork_ids créés dans
   expert_question_responses.response_metadata.classroom_binding
7. UI front : badge « Classe Histoire-Géo Seconde A » dans Mes programmes
```

**Idempotence** : si l'enseignant édite son programme et re-finalize, le sync doit UPDATE les courseWork existants (lookup par `classroom_binding.coursework_ids[]`) plutôt que créer en doublon. Cf. Q5 §10.

### 7.5 UI front — Cards Google Classroom (analog Discord)

Aujourd'hui le `ModernChatView` affiche une **« Discord Servers Grid »** (cf. `vue-app/src/views/ModernChatView.vue:264-279` + `DiscordServerCard.vue`). Le pattern symétrique pour Classroom :

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚙ Serveurs Discord            🎓 Classes Google Classroom       │
│  ┌──────────────────┐          ┌──────────────────┐              │
│  │ 🟢 Cosmétique    │          │ 📘 Histoire-Géo  │              │
│  │    B2C           │          │    Seconde A     │              │
│  │    Plugin: Pro   │          │    24 élèves     │              │
│  │    [Configurer]  │          │    [Configurer]  │              │
│  └──────────────────┘          └──────────────────┘              │
│  ┌──────────────────┐          ┌──────────────────┐              │
│  │ ➕ Ajouter un    │          │ ➕ Lier une      │              │
│  │    serveur       │          │    Classroom     │              │
│  └──────────────────┘          └──────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

Chaque `GoogleClassroomCard.vue` (à créer) affiche : icône + nom + section + nb d'élèves + nb de courseWork actifs + bouton « Configurer » qui ouvre la fiche Classroom (analog `DiscordServerCard.vue`).

Composants front à créer/refondre, anticipés ici (détaillés dans Annexe C) :
- `GoogleClassroomCard.vue` — card affichage (analog `DiscordServerCard.vue`)
- `GoogleClassroomDashboardView.vue` — fiche détaillée d'une classe (analog `GuildDashboardView.vue`)
- `ExpertProgramTargetPicker.vue` — picker générique multi-cibles (Discord + Classroom + futur), refonte de `ExpertProgramDiscordPicker.vue` actuel

### 7.6 Stockage du binding Classroom (analog RFC-082)

Convention symétrique au `discord_binding` de RFC-082 :

```jsonc
{
  "response_metadata": {
    "session_status": "completed",
    "discord_binding": { ... },             // optionnel (RFC-082)
    "classroom_binding": {                   // optionnel (NEW RFC-083)
      "course_id": "789012345",              // Google Classroom course id
      "topic_ids": ["topic-1", "topic-2"],   // créés en sync §7.4
      "coursework_ids": [                    // pour idempotence sur re-finalize
        "cw-1234", "cw-1235", "cw-1236"
      ],
      "synced_at": "2026-05-06T15:30:00Z"
    },
    "classroom_binding_labels": {            // snapshot pour éviter N+1 fetches
      "course_name": "Histoire-Géographie",
      "section": "Seconde A 2026-2027"
    }
  }
}
```

→ Lecture inverse : `GET /api/google-classroom/courses/{course_id}/expert-programs` (pattern RFC-082 §6.2).

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

### 10.1. Scope MCP n8n (initial)

1. **Priorité** : Quels cas d'usage sont prioritaires ? (cours, devoirs, annonces)
2. **Intégration Discord** : Faut-il synchroniser automatiquement les groups Discord avec Google Classroom ?
3. **Node custom vs HTTP** : Temps disponible pour l'implémentation ?
4. **Scopes OAuth** : Qui gère la configuration OAuth côté tenant ?

### 10.2. Scope intégration Program Builder + UI front (ajouts v2)

5. **Idempotence sync** (cf. §7.4) : si l'enseignant re-finalize un programme édité, on UPDATE les courseWork existants (lookup par `classroom_binding.coursework_ids[]`) ou on archive + recrée ? Pattern à figer pour éviter les doublons côté Classroom.
6. **Mapping séquence/séance → Classroom** (cf. §7.4) : 1 séquence du programme = 1 `topic` Classroom + N `courseWork`. Faut-il aussi créer 1 `announcement` global par programme ? À arbitrer côté produit (pollue ou utile).
7. **Persona expert × Classroom** (RFC-081) : un expert peut-il avoir une persona spécifique « bot Classroom » différente de « bot Discord » et « web direct » ? → ajouter `channel_kind = 'google_classroom'` dans `expert_persona_bindings` ? Si oui, le binding nécessite un `classroom_id` (analog `discord_guild_id`).
8. **Cards Classroom dans le dashboard user** (cf. §7.5) : dans `ModernChatView`, à côté de la grille « Serveurs Discord », ajouter une grille « Classes Google Classroom ». Visibilité conditionnée par OAuth scope `classroom.courses.readonly` accordé.
9. **Picker générique multi-cibles** (cf. §7.5) : refondre `ExpertProgramDiscordPicker.vue` (livré PR #2028) en `ExpertProgramTargetPicker.vue` qui gère N cibles (Discord, Classroom, futur Slack/email) plutôt que créer un nouveau composant par canal.
10. **Stockage `classroom_binding`** (cf. §7.6) : ajout dans `response_metadata` parallèle à `discord_binding`. Confirmer côté back que le PATCH `/api/expert-responses/{id}` accepte ce nouveau champ JSONB (validation Pydantic à étendre).
11. **Batch creation quotas** : si un programme contient 30 séances × 4 matières = 120 courseWork, l'API Classroom limite à ~50 ops/seconde par utilisateur. Faut-il batcher côté n8n (rate-limit) ou côté back (queue async + worker) ?
12. **OAuth flow tenant** : l'enseignant doit accorder le scope `classroom.courses` (sensitive scope Google → review possible nécessaire pour publication app non-internal). Comment on gère le consent UX dans l'app ? Réutiliser le flow Calendar/Drive existant ou ajouter un nouveau flow dédié ?
13. **Suppression côté Classroom** : si l'enseignant supprime le cours côté Google directement, `classroom_binding.course_id` devient orphelin. Faut-il un job de nettoyage côté back (analog RFC-082 §4.3 « binding orphelin tolerable ») ou un retour explicite à l'user ?

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

---

## Annexe C — Analyse équipe front (2026-05-06)

> Note front : la RFC initiale (v1) couvre proprement l'infra MCP n8n + scopes OAuth + structure du workflow. Mais elle ne mentionne pas les hooks d'intégration avec l'écosystème Experts (RFC-080/081/082/084) que l'équipe front livre actuellement. Or l'enseignant qu'on cible avec « Programme à partir d'un référentiel » (Expert High School Teacher) **utilise probablement Google Classroom** pour ses classes — l'intégration est canonique, pas optionnelle. Cette annexe pose les jalons pour anticiper les hooks et éviter une RFC-085 « Lier programme à Classroom » 2 mois plus tard qui dupliquerait RFC-082.

### C.1. Vue d'ensemble — Classroom comme nouveau « canal d'invocation »

RFC-081 v3 a établi la philosophie multi-canal :

```
Expert (entité tenant-wide)
   ↓ invoqué via
Canal d'invocation : discord_guild | web_default | mcp | (futur slack / google_classroom)
   ↓ enrichi par
Persona (role + audience) + RAG sources additionnels
```

→ Google Classroom serait le **3e canal d'invocation V1 actif** (après `discord_guild` et `web_default` — cf. RFC-081 §3.2 ; le `mcp` listé en RFC-081 est un placeholder « post-V1 », pas implémenté aujourd'hui). Cohérent avec le pattern existant. Le `channel_kind = 'google_classroom'` doit être ajouté dans `expert_persona_bindings` (RFC-081 §3.2) avec un `classroom_id` qualifiant (analog `discord_guild_id`).

**Conséquence** : un expert « Marketing » peut avoir 4 personas distinctes selon le canal :
- `web_default` → ton expert pédagogique générique
- `discord_guild_id=cosmetique-b2c` → ton enthousiaste storytelling B2C
- `google_classroom_id=mkt-pro-2026` → ton structuré académique pour étudiants
- `mcp_workflow_id=newsletter-gen` → ton synthétique pour la génération automatisée

→ **Pas de modèle de données à créer** côté Classroom — juste élargir le polymorphisme RFC-081 existant. Migration d'1 colonne (`classroom_id VARCHAR(64) NULL`).

### C.2. Architecture front en 2 niveaux (cohérence RFC-081 §7)

RFC-081 a posé le pattern « entités vivent dans Page Experts, mappings vivent dans Settings ». Application à Classroom :

| Niveau | Page | Action | Backend |
|---|---|---|---|
| **Création** | Page Experts → fiche expert → onglet Personas | Créer une persona « Marketing Académique » (role + audience) | RFC-081 (existant) |
| **Mapping classroom** | Settings → Classroom → fiche classe → onglet Experts | Binder l'expert Marketing à la persona « Marketing Académique » sur cette classe | RFC-081 channel_kind extension |
| **Sync programme** | Program Builder phase 3 | Picker post-finalize : « Lié à la classe Histoire-Géo Seconde A » | RFC-082 pattern + §7.4 ci-dessus |
| **OAuth tenant** | Settings → Intégrations Google → activer Classroom | Consent screen + scopes `classroom.*` | Flow existant Calendar/Drive |

### C.3. UI proposée — Cards Classroom dans le dashboard

Le `ModernChatView` actuel (lignes 264-279) affiche une **« Discord Servers Grid »** avec :
- 1 carte par guild Discord configuré (`DiscordServerCard.vue`)
- 1 carte « ➕ Ajouter un serveur »

Pattern symétrique à ajouter pour Classroom :

#### C.3.1. `ModernChatView` — section « Classes Google Classroom »

```vue
<!-- À ajouter sous la grille Discord (lignes 264+) -->
<div class="classroom-section ma-4 mt-6">
  <div class="section-header d-flex align-center mb-4">
    <v-icon class="me-2" color="green">mdi-google-classroom</v-icon>
    <h2>Classes Google Classroom</h2>
    <v-chip class="ms-2" size="small" variant="tonal" color="green">
      {{ classroomStore.classes.length }}
    </v-chip>
  </div>
  <div class="classroom-grid">
    <GoogleClassroomCard
      v-for="course in classroomStore.classes"
      :key="course.id"
      :course="course"
      @click="openClassroomDashboard(course.id)"
    />
    <div class="add-classroom-card" @click="addClassroomDialogOpen = true">
      <v-icon icon="mdi-plus" size="32" color="green" />
      <span>Lier une Classroom</span>
    </div>
  </div>
</div>
```

#### C.3.2. `GoogleClassroomCard.vue` (NEW)

Analog de `DiscordServerCard.vue`. Affiche :
- Icône matière (extraite de `course.descriptionHeading` ou via heuristique sur le nom)
- Nom + section (ex: « Histoire-Géographie · Seconde A 2026-2027 »)
- Nb élèves actifs (depuis MCP-Classroom getAll students)
- Nb courseWork actifs / nb avec submissions en attente
- Last sync timestamp
- Badge « Auto-sync » si lié à un programme expert via `classroom_binding`
- Bouton « Configurer » → ouvre `GoogleClassroomDashboardView`

#### C.3.3. `GoogleClassroomDashboardView.vue` (NEW)

Analog de `GuildDashboardView.vue`. Page détaillée d'une classe avec :
- Onglet **Identité** : nom, section, description, room (édition via MCP-Classroom update course)
- Onglet **Élèves** : liste students + invite link (via MCP-Classroom getAll/create student)
- Onglet **Travaux** : liste courseWork + filtre par état (DRAFT/PUBLISHED) + corrections en attente
- Onglet **Annonces** : liste announcements + composer
- Onglet **Experts contextualisés** : analog `GuildExpertsBindingsTab.vue` (RFC-081 §7.2) — bindings expert × persona pour cette classe
- Onglet **Programmes liés** : list `expert_question_responses` avec `classroom_binding.course_id == this.course_id`

### C.4. Picker générique post-finalize — refonte `ExpertProgramDiscordPicker`

Le composant livré en PR #2028 (`ExpertProgramDiscordPicker.vue`) est mono-cible Discord. Avec RFC-083, il faut **multi-cibles** (Discord + Classroom + futur Slack/email). Refonte proposée :

#### C.4.1. `ExpertProgramTargetPicker.vue` (refonte)

```vue
<template>
  <div>
    <v-radio-group v-model="mode">
      <v-radio value="personnel" label="Personnel — non rattaché" />
      <v-radio value="discord" label="Lié à un sujet Discord" />
      <v-radio value="classroom" label="Lié à une classe Google Classroom" />
      <!-- Futur : <v-radio value="slack" label="Lié à un canal Slack" /> -->
    </v-radio-group>

    <div v-if="mode === 'discord'">
      <!-- Cascade Server → Promotion → Subject (logique RFC-082 actuelle) -->
    </div>

    <div v-else-if="mode === 'classroom'">
      <!-- Sélection Course depuis MCP-Classroom course.getAll -->
      <v-select v-model="selectedCourseId" :items="classroomCoursesOptions" label="Classe Google Classroom" />
      <!-- Optionnel : choix granularité (1 courseWork par séance vs 1 par séquence) -->
      <v-select v-model="granularity" :items="granularityOptions" label="Granularité du sync" />
    </div>
  </div>
</template>
```

Émission : `update:modelValue` avec `{ kind: 'discord' | 'classroom' | 'personnel', binding: DiscordBinding | ClassroomBinding | null }`. Le parent (`ExpertProgramBuilderView`) consomme et appelle le PATCH approprié.

#### C.4.2. Couplage avec `useExpertProgramBuilder.finalize()`

```ts
// Pseudo-code
async function finalize() {
  await editProgram(programDraft.value)
  await commitProgressBuilder()  // existant

  if (target.kind === 'discord') {
    await commitDiscordBinding(target.binding)  // existant
  } else if (target.kind === 'classroom') {
    await commitClassroomBinding(target.binding)  // NEW
    // Le back déclenche le sync n8n MCP-Classroom (cf. §7.4)
  }
  // (kind === 'personnel') → rien à faire
}
```

### C.5. Stockage côté `expert_question_responses`

Cf. §7.6 ci-dessus. Validation Pydantic côté back à étendre :

```python
# Schemas Pydantic
class ClassroomBinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    course_id: str = Field(..., max_length=64)
    topic_ids: list[str] = Field(default_factory=list)
    coursework_ids: list[str] = Field(default_factory=list)
    synced_at: datetime | None = None

class ExpertResponseMetadata(BaseModel):
    session_status: str | None = None
    discord_binding: DiscordBinding | None = None  # RFC-082
    discord_binding_labels: DiscordBindingLabels | None = None
    classroom_binding: ClassroomBinding | None = None  # NEW
    classroom_binding_labels: ClassroomBindingLabels | None = None  # NEW
```

### C.6. OAuth scopes Classroom — flow tenant

L'app a déjà un flow OAuth Google pour Calendar/Drive/Contacts (cf. `Settings → Intégrations Google` + `requiresGoogleDrive` / `requiresGoogleCalendar` guards). Pour Classroom :

1. **Settings → Intégrations Google** : ajouter une 4e tuile « Google Classroom »
2. Toggle « Activer » → consent screen Google avec scopes :
   - `classroom.courses.readonly` (lecture liste classes)
   - `classroom.coursework.students` (CRUD courseWork côté enseignant)
   - `classroom.rosters.readonly` (lecture students)
   - `classroom.announcements` (CRUD annonces)
3. Storage du token + refresh côté back (table existante `tenant_google_credentials` ?)
4. Guard `requiresGoogleClassroom` dans `router/guards.ts` analog des autres

**Risque** : les scopes `classroom.coursework.students` et `classroom.rosters` sont **sensitive scopes** Google. Pour publier une app en mode externe (= acceptant des comptes hors Workspace organisation), Google Verification Required (~3-6 semaines de review). À anticiper côté produit.

### C.7. Cas dégradés / robustesse

| Scénario | Comportement attendu |
|---|---|
| Quotas Classroom dépassés (50 ops/sec) | n8n / back : queue + retry exponentiel. Front : status `pending` sur le binding, badge « Sync en cours » |
| Token OAuth expiré pendant le sync | n8n détecte 401 → demande refresh → retry. Si refresh échoue → marqueur `classroom_binding.sync_error` côté back |
| Enseignant supprime le cours côté Google | `classroom_binding.course_id` devient orphelin. Pattern RFC-082 §4.3 : binding tolerable mais badge « Cours introuvable » côté UI |
| Re-finalize après édition programme | Lookup `coursework_ids[]` → MCP-Classroom update (idempotence) plutôt que create. Q5 §10. |
| User RGPD-purgé | Les courseWork créés côté Google survivent (propriété de l'enseignant Google, pas du tenant). Le `classroom_binding` côté DB est purgé avec la response. |

### C.8. Plan PR côté front

**Effort front estimé** : 5 PRs front, **~7-10j total**, à séquencer après livraison RFC-083 MCP n8n côté back.

| # | PR | Effort front | Dépend de |
|---|---|---|---|
| 1 | Refonte `ExpertProgramDiscordPicker` → `ExpertProgramTargetPicker` (mode Discord seul, prépare l'extension) | ~1j | RFC-082 (livré) |
| 2 | Onboarding OAuth Classroom + guard `requiresGoogleClassroom` | ~1j | Back : endpoint storage token |
| 3 | `GoogleClassroomCard.vue` + grille dans `ModernChatView` | ~1j | PR 2 + MCP getAll courses |
| 4 | `GoogleClassroomDashboardView.vue` + onglets (Identité, Élèves, Travaux, Annonces, Experts, Programmes) | ~3j | PR 3 + tous les MCP ops |
| 5 | Branchement `ExpertProgramTargetPicker` mode Classroom + commitClassroomBinding | ~1.5j | Back : endpoint binding + sync trigger |

**PRs back nécessaires en parallèle** (estimations côté back, cf. Annexe D) :
- Storage tokens OAuth Classroom (table existante ou nouvelle ?)
- Schemas Pydantic `ClassroomBinding` + extension `PATCH /api/expert-responses/{id}`
- Service `ExpertProgramClassroomSyncService` (orchestre les appels MCP via n8n)
- Endpoint `POST /api/expert-responses/{id}/classroom-sync` (déclenche sync n8n)
- Lecture inverse `GET /api/google-classroom/courses/{id}/expert-programs`
- Extension `expert_persona_bindings.channel_kind` + `classroom_id` (RFC-081)

### C.9. Questions ouvertes côté front

| # | Question | Impact |
|---|---|---|
| Q-F1 | Refondre `ExpertProgramDiscordPicker` en `ExpertProgramTargetPicker` générique **dès maintenant** (avant RFC-083 livrée) ou seulement quand RFC-083 arrive ? | Anticipation vs YAGNI |
| Q-F2 | Le picker affiche-t-il les 2 cibles (Discord + Classroom) **simultanément** (radio), ou par tabs ? La logique métier permet-elle de **lier un programme aux 2 en même temps** (Discord ET Classroom) ? | UX + modèle data |
| Q-F3 | OAuth Classroom : extension du flow Google existant (Calendar/Drive) ou flow dédié ? Faut-il un onboarding « assistant » pour l'enseignant lambda qui ne sait pas ce que sont les scopes ? | UX onboarding |
| Q-F4 | Faut-il afficher dans la card Classroom un **résumé du programme rattaché** (« Programme Histoire-Géo annuel — 24 séances, 18 publiées ») ou juste un badge ? | Quantité d'info à fetcher |
| Q-F5 | Mes programmes (ExpertProgramSessionsView) : grouper par référentiel (RFC-084) **et** par classe Classroom (RFC-083) ? Ou choix utilisateur du regroupement ? | Refonte vue |
| Q-F6 | Filtre dans Mes programmes : « Mes programmes liés à mes Classrooms » (vue prof rapide) | Q-A2 RFC-082 (analog) |

### C.10. Action attendue

1. **Équipe back / produit** : valider le pattern d'intégration §C.1-C.7 avant que l'équipe livre la RFC-083 v1 (l'extension a un coût marginal côté back, mais évite la dette technique)
2. **Équipe back** : si OK §C.5 (Pydantic `ClassroomBinding`), inclure dans le scope RFC-083 v2 (ou en sous-RFC RFC-083-bis dédié à l'intégration)
3. **Équipe back** : trancher §C.6 (sensitive scopes Google + verification) — la décision impacte le timing produit
4. **Équipe front** : prête à attaquer la PR 1 (refonte picker) **dès maintenant** si Q-F1 validée — anticipation peu coûteuse, débloque ensuite tous les PRs 2-5 quand le back arrive
5. **Équipe produit** : valider que l'enseignant qui finalize un programme veut effectivement le pousser dans Classroom (peut-être qu'il préfère un export PDF + import manuel ?)

---

## Changelog

- **2026-05-06 (v1)** — version initiale, proposition MCP Google Classroom Server (workflow n8n, 6 resources, 25 ops, 2 options d'impl).
- **2026-05-06 (v2-front)** — Annexe C ajoutée par l'équipe front : analyse intégration avec écosystème Experts (RFC-080/081/082/084), pattern Cards Classroom analog Discord, refonte picker post-finalize en multi-cibles, sync programme expert → Classroom courseWork, 13 questions ouvertes (10.1 + 10.2). Sections §7.4-7.6 ajoutées au corps avec workflows sync + UI cards + stockage `classroom_binding`.
- **2026-05-06 (v2-back)** — Annexe D ajoutée par l'équipe back : (1) restaure l'analyse chat.api écrasée par v2-front (cartographie existant, décisions Q-C1..Q-C5) ; (2) arbitre les 9 nouvelles questions Q5-Q13 + les 6 questions front Q-F1..Q-F6 ; (3) tranche Q-F2 multi-binding parallèle (révision de la décision « single target » de RFC-082 §B) ; (4) acte la migration RFC-081 (`channel_kind = 'google_classroom'` + colonne `classroom_id`) ; (5) impose l'idempotence du sync via lookup `coursework_ids[]` (pas de delete+recreate) ; (6) défère la queue async batch quotas en V2 ; (7) chiffre **back V1 ~7-8.5j** (token resolver + intégration Experts), **V2 ~4j** (idempotence + lecture inverse + monitoring), **V3** différé (cohabitation RFC-084).

---

## Annexe D — Réponse équipe back v2 (intégration Experts) (2026-05-06)

> Note back : la v2-front a réécrit l'Annexe C en remplaçant la précédente analyse chat.api. Cette Annexe D restaure et complète. **Ordre de lecture recommandé** : §1-§11 corps → Annexe C (front) → Annexe D (back).

### D.1. Cartographie chat.api ↔ Google (restaurée de v1-back)

Le pattern back actuel n'a pas changé. Pour rappel :

| Composant | Existant aujourd'hui | Localisation | Réutilisable Classroom ? |
|---|---|---|---|
| Enum `GoogleService` | `GMAIL, CALENDAR, CONTACTS, DRIVE, USER_INFO` | `app/services/google_scope_manager.py:16` | **Oui — étendre** avec `CLASSROOM = "classroom"` |
| Scopes par service | `GoogleScopeManager.SERVICE_SCOPES` (minimal/standard/full) | même fichier | **Oui — ajouter** entrée `CLASSROOM` (cf. §5) |
| Token cache + refresh | `GmailTokenManager` (Redis + auto-refresh) | `app/services/google/gmail_token_manager.py` | **Oui — généraliser** ou dupliquer le pattern |
| OAuth flow | `/api/google-auth/{connect,callback,refresh,disconnect,scopes}` | `app/api_routes/google_auth_routes.py` | **Oui** — service-agnostic, juste passer les scopes Classroom |
| Config tenant | `google_workspace_configs` + `tenant_quota_configs` | tenant schema | **Oui — étendre** `custom_settings.classroom_enabled` |
| Audit | `service_token_usage_logs` (public) | — | **Oui — réutiliser** pour Classroom |
| Résolveur token n8n | **Inexistant** | — | **À créer** (cf. D.2) |

→ Le seul vrai manque structurel reste le **résolveur de token côté n8n**. Tout le reste est extension de pattern existant.

### D.2. Décisions Q-C1..Q-C5 (restaurées de v1-back, confirmées)

| # | Décision | Tranchée |
|---|---|---|
| **Q-C1** | BYOT pur ou résolveur centralisé ? | **Résolveur** — `GET /api/n8n/google/token?service=classroom&user_id=<uid>` avec `X-Service-Token`. Évite duplication refresh côté n8n + audit centralisé. |
| **Q-C2** | RBAC : nouvelle `classroom:*` ou réutiliser `gmail:*` ? | **Nouvelle** — `classroom:read` + `classroom:write`. Granularité fine, scopes EDU distincts. |
| **Q-C3** | Quota dédié `classroom_ops_per_day` en V1 ou V2 ? | **V1** révisé (initialement V2). Q11 du v2-front (batch 30 séances × 4 matières = 120 ops) confirme la pression sur l'API. Compteur dans `quota_usage` tenant + 429 typé sur dépassement. |
| **Q-C4** | Endpoint sync centralisé chat.api ou orchestration n8n ? | **Hybride** — chat.api expose `POST /api/expert-responses/{id}/classroom-sync` qui (a) valide les permissions, (b) crée la ligne `classroom_binding` en `pending`, (c) déclenche le workflow n8n via webhook. n8n exécute les ops puis appelle chat.api en retour pour persister `coursework_ids[]`. |
| **Q-C5** | Validation EDU domain | **Automatique** (heuristique `.edu`, `.ac.<cc>`) + override admin via `is_edu_domain` dans `google_workspace_configs.custom_settings`. Refus 400 typé `classroom_requires_edu_domain` au lieu de 403 opaque Google. |

### D.3. Arbitrage des 9 nouvelles questions §10.2 (Q5-Q13)

| # | Question front | Décision back |
|---|---|---|
| **Q5** | Idempotence sync : UPDATE existing courseWork ou archive + recrée ? | **UPDATE via lookup `coursework_ids[]`**. Pas de delete+recreate (perte d'historique submissions élèves). Si l'enseignant ajoute des séances après finalize, append-only. Si il en supprime, archive côté Google (state=DELETED) au lieu de DELETE physique. |
| **Q6** | Mapping séquence → topic + courseWork + announcement global ? | **1 séquence = 1 topic + N courseWork**. Pas d'announcement automatique (pollue le flux Classroom de l'enseignant). L'enseignant peut publier une announcement manuellement après le sync s'il le souhaite. |
| **Q7** | Persona expert × Classroom (extension RFC-081 §3.2) ? | **Oui — extension RFC-081** : ajouter `'google_classroom'` à `channel_kind` + colonne `classroom_id VARCHAR(64) NULL` sur `expert_persona_bindings`. Contrainte unique étendue : `UNIQUE (tenant_id, expert_id, channel_kind, discord_guild_id, classroom_id)`. Cf. D.5. |
| **Q8** | Cards Classroom dans dashboard, conditionné OAuth ? | **Oui** — affichage conditionnel à `classroom.courses.readonly` accordé. Endpoint `GET /api/google-classroom/courses` avec fallback `[]` si scope manquant (pas 403). |
| **Q9** | Picker générique multi-cibles | **Oui front** — relève des choix front. Côté back : un seul endpoint `PATCH /api/expert-responses/{id}` accepte `classroom_binding` ET `discord_binding` simultanément (cf. Q-F2 / D.4). |
| **Q10** | Stockage `classroom_binding` parallèle à `discord_binding` | **Oui** — extension Pydantic `ExpertResponseMetadata` avec `classroom_binding: ClassroomBinding | None`. Validation hiérarchique côté service `ExpertResponseService.update_response_metadata`. |
| **Q11** | Batch creation quotas (>50 ops/sec) | **V2 : queue Celery côté back**. V1 : sync synchrone simple, l'enseignant attend pendant le push. Si dépassement quotas Google → erreur claire `classroom_rate_limit_hit` + suggestion de réessayer. Worker async = 1.5j + observabilité, à reporter. |
| **Q12** | OAuth flow tenant : extension ou dédié ? | **Extension** du flow Google existant (`/api/google-auth/scopes` accepte déjà des scopes additionnels). Pas de nouveau flow. Question UX d'onboarding = front. |
| **Q13** | Suppression côté Google (cours orphelin) | **Tolerable** — pattern RFC-082 §4.3. Ajout d'un champ `classroom_binding.sync_status` ∈ `{synced, pending, error, orphan}` mis à jour à chaque sync attempt. Front affiche un badge si `orphan`. Pas de job de nettoyage automatique. |

### D.4. Q-F2 — Multi-binding parallèle (révision RFC-082 §B)

**Question** : un programme peut-il être lié à Discord ET Classroom simultanément ?

**Décision back : OUI**, multi-binding parallèle — révision de la position « single target » de RFC-082 §B.

**Raisonnement de la révision** :

| Aspect | RFC-082 §B (single target) | Réalité Classroom révélée |
|---|---|---|
| **Cible Q2 RFC-082** | Une seule **cible Discord** (guild OU promotion OU subject) | Toujours valide — la hiérarchie Discord reste exclusive |
| **Implicite** | Un programme = un canal de diffusion | Un enseignant utilise **2 canaux de diffusion** : Discord (élèves dans la conversation hors-cours) + Classroom (canal officiel pédagogique) |
| **Modèle data** | `discord_binding` JSONB unique | `discord_binding` reste exclusif Discord + `classroom_binding` reste exclusif Classroom + ils **coexistent** dans `response_metadata` |

→ La règle « single target » s'applique **par canal**, pas globalement. Un programme peut avoir au max :
- 1 binding Discord (guild OU promotion OU subject — règle RFC-082 §B inchangée)
- 1 binding Classroom (un seul `course_id`)
- 1 binding `<futur>` (Slack, etc.)

→ Validation Pydantic : structures parallèles indépendantes dans `response_metadata`. Aucun conflit logique.

→ Mise à jour à intégrer dans le RFC-082 §B (changelog v3 à prévoir) : « Décision révisée v3 : single target *par canal*, pas global. Cohabitation Discord + Classroom + futurs canaux acceptée. »

### D.5. Migration RFC-081 (channel_kind = 'google_classroom')

Extension du polymorphisme existant RFC-081 §3.2.

**Migration alembic** (public schema, idempotente) :

```sql
-- Ajout du qualifier classroom_id
ALTER TABLE public.expert_persona_bindings
  ADD COLUMN classroom_id VARCHAR(64) NULL;

CREATE INDEX idx_persona_bindings_classroom
  ON public.expert_persona_bindings(classroom_id)
  WHERE classroom_id IS NOT NULL;

-- Drop ancien unique constraint, recréation étendue
ALTER TABLE public.expert_persona_bindings
  DROP CONSTRAINT IF EXISTS uq_persona_bindings_canal;

ALTER TABLE public.expert_persona_bindings
  ADD CONSTRAINT uq_persona_bindings_canal
  UNIQUE (tenant_id, expert_id, channel_kind, discord_guild_id, classroom_id);

-- Pas de CHECK SQL : la cohérence channel_kind ↔ qualifier est vérifiée
-- côté service Pydantic (validators) car PostgreSQL ne sait pas
-- exprimer un OR exclusif sur 2 colonnes nullables proprement.
```

**Validation côté service** (`ExpertPersonaBindingService.create_or_update`) :

```python
# Cohérence channel_kind ↔ qualifier
if binding.channel_kind == "discord_guild" and not binding.discord_guild_id:
    raise ValueError("discord_guild_id required when channel_kind=discord_guild")
if binding.channel_kind == "google_classroom" and not binding.classroom_id:
    raise ValueError("classroom_id required when channel_kind=google_classroom")
if binding.channel_kind == "web_default" and (binding.discord_guild_id or binding.classroom_id):
    raise ValueError("web_default channel must not have qualifier")
```

**Resolver `ExpertContextResolverService.resolve_expert_effective`** (RFC-081 §4) : ajout du paramètre `classroom_id` optionnel dans la signature, branche supplémentaire dans la résolution du binding.

### D.6. Arbitrage des 6 questions front §C.9 (Q-F1..Q-F6)

| # | Question | Décision back (impact côté nous uniquement) |
|---|---|---|
| **Q-F1** | Refondre picker générique maintenant ou plus tard ? | Front-side, pas d'impact back direct. Recommandation : maintenant (anticipation peu coûteuse). |
| **Q-F2** | Multi-binding Discord + Classroom simultané ? | **Oui** (cf. D.4). Pas d'impact back data — les 2 bindings vivent en parallèle dans `response_metadata`. |
| **Q-F3** | OAuth flow Classroom : étendre ou dédié ? | **Étendre** (cf. Q12 / D.3). Aucun nouvel endpoint OAuth back. |
| **Q-F4** | Card Classroom : résumé programme ou badge simple ? | Préférence : **badge simple** + endpoint léger `GET /api/google-classroom/courses/{id}/summary` qui renvoie `{coursework_count, last_synced_at, programs_count}` à la demande (lazy load au hover). Évite N+1 fetch + payload lourd au listing. |
| **Q-F5** | Mes programmes : grouper par référentiel (RFC-084) **ET** par classe (RFC-083) ? | **Choix utilisateur** front via toggle. Côté back : endpoint existant `GET /api/users/me/expert-programs` retourne déjà tout ; le groupement est UI-only. Aucun changement back. |
| **Q-F6** | Filtre « Mes programmes liés à mes Classrooms » | **Oui** — extension du listing existant avec `?bound_to=classroom`. Analog Q-A2 RFC-082. ~30 min côté back. |

### D.7. Implications cross-RFC

| RFC | Impact | Type |
|---|---|---|
| **RFC-080** | Extension `ExpertResponseMetadata` Pydantic avec `classroom_binding: ClassroomBinding | None`. Validation au PATCH. | Code, ~30 min |
| **RFC-081** v3 | Ajout `channel_kind='google_classroom'` + colonne `classroom_id`. Migration + service + resolver. Pas de breaking change. | Migration + code, ~1j (cf. D.5) |
| **RFC-082** v3 | **Révision** de la règle « single target » : devient « single target *par canal* ». Mise à jour annexe §B nécessaire (changelog v3). Pas de breaking côté code car les structures sont parallèles. | Doc only |
| **RFC-084** | Cohabitation `classroom_binding` × multi-matière : si un `reference_analysis` génère N programmes (1 par matière), chacun peut avoir son propre `classroom_binding` (vers la classe Classroom de la matière correspondante). Pas de conflit, juste une recommandation UX (1 classe par matière). | Aucun (RFC-084 §B couvre déjà la coexistence des bindings) |
| **RFC-083 §10.2 Q11** | Queue async batch ops : reporté V2 (cf. D.3 Q11). Une fois activée, partage potentiellement un worker Celery existant ou nouveau. | V2 |

### D.8. Scope V1 / V2 / V3 révisé (back uniquement)

> **Estimations back uniquement, ignorant les chiffres front.**

#### V1 — minimal viable, cohérent avec écosystème Experts

| Composant | Effort |
|---|---|
| Étendre `GoogleService` enum + scopes Classroom (`SERVICE_SCOPES`) | <1h |
| Endpoint résolveur `GET /api/n8n/google/token?service=classroom&user_id=<uid>` (Service Token, cf. Q-C1) | 0.5j |
| Pydantic schemas (`N8nTokenRequest`, `N8nTokenResponse`, `ClassroomBinding`, `ClassroomBindingLabels`) avec `extra="forbid"` | 0.5j |
| Permissions RBAC `classroom:read` + `classroom:write` (seed + assignation par défaut role `member`) | ~30 min |
| Validation EDU domain (heuristique + override `is_edu_domain`) | 0.5j |
| Compteur quota `classroom_ops_per_day` dans `quota_usage` (Q-C3 promu V1) | 0.5j |
| Audit logging `service_token_usage_logs` action `classroom.*` | 0.5j |
| Migration RFC-081 (`channel_kind='google_classroom'` + colonne `classroom_id` + unique constraint étendue) | 1j |
| Extension `ExpertPersonaBindingService` + `ExpertContextResolverService` pour `classroom_id` | 1j |
| Extension `ExpertResponseService.update_response_metadata` pour `classroom_binding` (validation cohérence + audit) | 0.5j |
| Endpoint `POST /api/expert-responses/{id}/classroom-sync` (validation + déclenchement webhook n8n + persistance `pending`) | 1j |
| Endpoint `GET /api/google-classroom/courses` (proxy MCP-Classroom getAll, cache court côté back) | 0.5j |
| Endpoint `GET /api/google-classroom/courses/{id}/summary` (lazy fetch pour cards, Q-F4) | 0.5j |
| Endpoint listing inverse `GET /api/google-classroom/courses/{id}/expert-programs` (pattern RFC-082 §6.2) | 0.5j |
| Filtre `?bound_to=classroom` sur listing programmes existant (Q-F6) | ~30 min |
| Tests unitaires + intégration (resolver, sync, isolation tenant, EDU validation, multi-binding) | 1.5j |
| Doc compagnon n8n (`docs/guides/n8n-google-token-resolve.md` + section Classroom) | 0.5j |
| Doc compagnon front (`docs/guides/frontend-classroom-binding.md`) | ~2h |

**Total V1 back** : **~10 jours** (incluant les ~1j d'extension RFC-081 et ~3j d'endpoints d'intégration Experts).

#### V2 — robustesse + idempotence

| Composant | Effort |
|---|---|
| Idempotence sync via lookup `coursework_ids[]` (Q5) | 1j |
| Worker Celery async pour batch ops (Q11, >50 séances) | 1.5j |
| Endpoint `POST /api/expert-responses/{id}/classroom-sync/retry` (pour cas d'échec) | 0.5j |
| Champ `classroom_binding.sync_status` + détection orphan (Q13) | 0.5j |
| Monitoring quota dédié + dashboard owner | 0.5j |

**Total V2 back** : **~4 jours**

#### V3 — déféré

- Multi-cibles Slack (channel_kind extension)
- Sync inverse (Classroom → expert programs : import des notes back vers expert_question_responses)
- Cohabitation full RFC-084 (analyse partagée → N classrooms)

### D.9. Points d'attention non résolus

1. **Google verification process** (cf. §C.6 v2-front) — les scopes `classroom.coursework.students` et `classroom.rosters` sont sensibles. Si l'app est publiée hors Workspace organisation, **3 à 6 semaines de Google review** avant prod. À remonter Produit pour anticiper le calendrier — c'est le **plus gros risque planning** de cette RFC, pas le code back.

2. **Coût LLM × Classroom sync** : un programme avec 30 séances × 4 matières = 120 courseWork à créer × ~500 tokens d'un payload textuel chacun = ~60k tokens par sync. Si 50 enseignants synchronisent leur programme dans la même journée = 3M tokens. À surveiller côté `service_token_usage_logs`.

3. **Audit log dette** (RFC-075 CHECK constraint) — connue, déjà flaggée RFC-079/081/082/084. Toujours non résolue, on logue dans `service_token_usage_logs` en V1, on harmonisera dans une PR cosmétique séparée.

4. **Conflit sémantique avec RFC-082 multi-target** — RFC-082 §B aujourd'hui dit explicitement « single target ». La révision proposée en D.4 doit être actée par mise à jour de l'annexe §B de RFC-082 (changelog v3). Sinon dette doc.

### D.10. Action attendue

1. **Produit** : trancher Q-F2 (multi-binding parallèle) — recommandation back **oui** (cf. D.4). Cette décision est bloquante pour le scope V1.
2. **Produit** : anticiper Google verification (3-6 sem) avant timeline prod.
3. **Back** : valider la migration RFC-081 (D.5) avant d'attaquer — petite mais touche une table partagée par d'autres futurs canaux.
4. **Back** : si OK sur D.8 V1 (~10j), planifier en parallèle de la PR n8n MCP-Classroom (~5j Option A) → cumul **~15j** sur 2 sprints distincts.
5. **Back** : ouvrir une mise à jour RFC-082 §B (changelog v3) actant la révision « single target par canal » (D.4).
6. **Front** : attendre greenlight sur D.4 + D.5 avant d'attaquer la refonte du picker, pour éviter de coder contre une décision non actée.
