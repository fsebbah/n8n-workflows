# Architecture d'Intégration des Services Google

**Date** : 2026-05-07
**Auteur** : Claude (analyse du code MCP Server)
**Statut** : Documentation interne
**Concerne** : Équipes API Backend, Frontend, n8n

---

## 1. Vue d'ensemble

**Toutes les interactions avec les services Google passent par MCP Server**, que ce soit depuis le chatbot ou depuis l'UI Settings/Admin. MCP Server est le **point d'entrée unique** vers n8n pour les services Google.

### 1.1 Principe

```
Frontend (Chatbot OU Settings/Admin)
    ↓
chat.api
    ↓
MCP Server (wrappers Python)    ← TOUJOURS impliqué
    ↓
n8n webhooks
    ↓
Google APIs
```

### 1.2 Schéma global

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                         │
│  ┌────────────────────┐                       ┌────────────────────┐          │
│  │  Chatbot Widget    │                       │  Settings / Admin  │          │
│  │  (conversations)   │                       │  (UI métier)       │          │
│  └─────────┬──────────┘                       └─────────┬──────────┘          │
└────────────│────────────────────────────────────────────│─────────────────────┘
             │                                            │
             │ WebSocket                                  │ REST API
             ▼                                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            chat.api                                          │
│                                                                              │
│  - Reçoit les requêtes frontend (WebSocket ou REST)                         │
│  - Délègue TOUTES les opérations Google à MCP Server                        │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     │ Appel MCP Server
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         MCP Server (port 8765)                               │
│                                                                              │
│  Wrappers Python (N8NTool):                                                  │
│  ├── GmailTool        → webhook: mcp-gmail                                   │
│  ├── CalendarTool     → webhook: mcp-calendar                                │
│  ├── DriveTool        → webhook: mcp-drive                                   │
│  ├── ContactsTool     → webhook: mcp-contacts                                │
│  └── ClassroomTool    → webhook: mcp-classroom (RFC-083)                     │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
                                     │ HTTP POST /webhook/mcp-{service}
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            n8n (port 5678)                                   │
│                                                                              │
│  Webhooks CRUD:                     Webhooks métier (optionnel):             │
│  ├── /webhook/mcp-gmail             ├── /webhook/expert-program-             │
│  ├── /webhook/mcp-calendar          │      classroom-sync                    │
│  ├── /webhook/mcp-drive             └── (logique métier complexe)            │
│  ├── /webhook/mcp-contacts                                                   │
│  └── /webhook/mcp-classroom                                                  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       │ OAuth token (BYOT)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Google APIs                                          │
│  Gmail API | Calendar API | Drive API | People API | Classroom API          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Flow unifié via MCP Server

### 2.1 Cas 1 : Chatbot (langage naturel)

```
User (chat): "Montre mes fichiers Drive"
    ↓
Frontend (WebSocket)
    ↓
chat.api (interprète l'intention)
    ↓
MCP Server (DriveTool.list_files)
    ↓
n8n /webhook/mcp-drive (operation: "list")
    ↓
Google Drive API
    ↓
Réponse remonte → MCP Server → chat.api → Frontend
```

### 2.2 Cas 2 : Settings UI (action directe)

```
User (Settings → Drive): Clique "Voir mes fichiers"
    ↓
Frontend (REST API)
    ↓
chat.api GET /api/users/me/drive/files
    ↓
MCP Server (DriveTool.list_files)    ← MCP Server EST impliqué
    ↓
n8n /webhook/mcp-drive (operation: "list")
    ↓
Google Drive API
    ↓
Réponse remonte → MCP Server → chat.api → Frontend
```

### 2.3 Point clé

**MCP Server est TOUJOURS le point d'entrée vers n8n pour les services Google**, quel que soit le contexte (chatbot ou UI).

### 2.3 Structure du code MCP Server

```
src/mcp_server/tools/n8n/
├── base.py           # Classe abstraite N8NTool
├── gmail.py          # GmailTool (webhook: mcp-gmail)
├── calendar.py       # CalendarTool (webhook: mcp-calendar)
├── drive.py          # DriveTool (webhook: mcp-drive)
├── contacts.py       # ContactsTool (webhook: mcp-contacts)
└── classroom.py      # ClassroomTool (RFC-083, à créer)
```

### 2.4 Classe de base N8NTool

```python
class N8NTool(ABC):
    """Classe de base pour tous les tools n8n."""

    @property
    @abstractmethod
    def webhook_path(self) -> str:
        """Chemin du webhook (ex: 'mcp-drive')."""
        pass

    @property
    @abstractmethod
    def domain(self) -> str:
        """Domaine pour logging (ex: 'drive')."""
        pass

    async def call(
        self,
        operation: str,           # ex: "list", "create", "delete"
        params: dict[str, Any],   # paramètres spécifiques
        access_token: str,        # OAuth token (BYOT)
        correlation_id: str,      # tracing
        user_id: str | None = None,
        tenant_id: str | None = None,
    ) -> N8NToolResult:
        """Appelle le webhook n8n avec injection OAuth."""
        ...
```

### 2.5 Exemple : DriveTool

```python
class DriveTool(N8NTool):
    @property
    def webhook_path(self) -> str:
        return "mcp-drive"  # → POST /webhook/mcp-drive

    @property
    def domain(self) -> str:
        return "drive"

    @property
    def supported_operations(self) -> list[str]:
        return ["list", "search", "get", "upload", "download",
                "copy", "move", "delete", "share", "create_folder"]

    async def list_files(self, access_token, correlation_id,
                         folder_id=None, page_size=10, ...):
        return await self.call(
            operation="list",
            params={"folder_id": folder_id, "page_size": page_size},
            access_token=access_token,
            correlation_id=correlation_id,
        )
```

---

## 3. Webhooks n8n

### 3.1 Types de webhooks

| Type | Webhook | Appelé via | Responsabilité |
|------|---------|------------|----------------|
| **CRUD générique** | `/webhook/mcp-{service}` | MCP Server wrappers | Opérations atomiques (list, create, delete) |
| **Métier spécifique** | `/webhook/expert-program-classroom-sync` | MCP Server | Logique métier complexe (multi-étapes) |

### 3.2 Webhooks CRUD (via MCP Server)

Ces webhooks sont appelés par les wrappers Python du MCP Server :

- `/webhook/mcp-gmail` → `GmailTool`
- `/webhook/mcp-calendar` → `CalendarTool`
- `/webhook/mcp-drive` → `DriveTool`
- `/webhook/mcp-contacts` → `ContactsTool`
- `/webhook/mcp-classroom` → `ClassroomTool` (RFC-083)

### 3.3 Webhooks métier (logique complexe)

Pour des opérations métier multi-étapes (ex: synchroniser un programme expert avec Classroom), un webhook dédié peut encapsuler la logique :

```
/webhook/expert-program-classroom-sync
    ├── Récupère le programme expert
    ├── Crée/update le cours Classroom
    ├── Inscrit les étudiants
    └── Publie les devoirs
```

---

## 4. FAQ Équipe API Backend

### Question 1 — Lecture data Google (Settings → Drive)

> Quand le user va dans Settings → Drive et voit la liste de ses fichiers, le chemin réel est :
> - (a) Frontend → chat.api → MCP Server → n8n (mcp-drive) → Google REST
> - (b) Frontend → chat.api → cache DB local
> - (c) Frontend → chat.api → API client direct Google

**Réponse : (a) est correct** ✅

```
Frontend (Settings → Drive)
    ↓
chat.api GET /api/users/me/drive/files
    ↓
MCP Server (DriveTool.list_files)    ← MCP Server EST impliqué
    ↓
n8n /webhook/mcp-drive (operation: "list")
    ↓
Google Drive API (avec OAuth token BYOT)
    ↓
Réponse remonte → MCP Server → chat.api → Frontend
```

**Points clés :**
- **MCP Server EST impliqué** — il est le point d'entrée unique vers n8n
- chat.api délègue à MCP Server, qui appelle n8n
- Token OAuth géré via architecture BYOT
- Pas de cache DB local — données live Google

### Question 3 — Flow RFC-083 V2 (Classroom Sync)

> Pour Classroom V2, le flow serait :
> ```
> Frontend (push programme)
>   → chat.api POST /api/users/me/expert-responses/{id}/classroom-sync
>   → chat.api appelle MCP Server
>   → MCP Server appelle n8n /webhook/expert-program-classroom-sync
>   → n8n appelle Google Classroom API
>   → réponse remonte MCP Server → chat.api → Frontend
> ```

**Réponse : CORRECT** ✅

**Détails :**
- MCP Server est impliqué (comme pour tous les services Google)
- `/webhook/expert-program-classroom-sync` est un webhook **métier** (logique complexe)
- Il encapsule :
  1. Récupérer le programme expert
  2. Créer/mettre à jour le cours Classroom
  3. Inscrire les étudiants
  4. Publier les devoirs
- Ce webhook peut utiliser en interne les opérations CRUD de `mcp-classroom`

---

## 5. Tableau récapitulatif des services Google

**Tous les services Google passent par MCP Server → n8n → Google API**

| Service | Wrapper MCP | Webhook n8n | Opérations |
|---------|-------------|-------------|------------|
| **Gmail** | `GmailTool` | `mcp-gmail` | send, get, list, search, reply, forward, delete, archive, labels |
| **Calendar** | `CalendarTool` | `mcp-calendar` | free_busy, create, get, update, delete, list, search |
| **Drive** | `DriveTool` | `mcp-drive` | list, search, get, upload, download, copy, move, delete, share |
| **Contacts** | `ContactsTool` | `mcp-contacts` | search, get, create, update, delete |
| **Classroom** | `ClassroomTool` (RFC-083) | `mcp-classroom` | courses, coursework, students, teachers, announcements |

### Flow unifié pour TOUS les services

```
Frontend (Chatbot OU Settings OU Admin)
    ↓
chat.api
    ↓
MCP Server ({Service}Tool)    ← TOUJOURS via MCP Server
    ↓
n8n /webhook/mcp-{service}
    ↓
Google {Service} API
```

---

## 6. Architecture BYOT (Bring Your Own Token)

### 6.1 Principe

Le token OAuth Google est **fourni par l'appelant** (chat.api ou MCP Server), pas stocké dans n8n.

### 6.2 Avantages

- **Multi-tenant natif** : Chaque utilisateur utilise son propre compte Google
- **Pas de credentials n8n** : Pas de projet GCP côté n8n
- **Isolation** : Un token compromis n'affecte qu'un utilisateur

### 6.3 Flow du token

```
┌───────────┐   ┌──────────┐   ┌────────────┐   ┌─────────┐   ┌────────────┐
│ Frontend  │──►│ chat.api │──►│ MCP Server │──►│  n8n    │──►│ Google API │
│           │   │          │   │            │   │         │   │            │
│           │   │ Token    │   │ Passe le   │   │ Injecte │   │ Valide le  │
│           │   │ stocké   │   │ token      │   │ dans    │   │ token      │
│           │   │ en DB    │   │            │   │ l'appel │   │            │
└───────────┘   └──────────┘   └────────────┘   └─────────┘   └────────────┘
```

---

## 7. Création d'un nouveau service Google (RFC-083 Classroom)

### 7.1 Côté MCP Server

Créer `src/mcp_server/tools/n8n/classroom.py` :

```python
class ClassroomTool(N8NTool):
    @property
    def webhook_path(self) -> str:
        return "mcp-classroom"

    @property
    def domain(self) -> str:
        return "classroom"

    @property
    def supported_operations(self) -> list[str]:
        return ["create_course", "get_course", "list_courses",
                "create_coursework", "enroll_student", ...]

    async def create_course(self, name, access_token, correlation_id, ...):
        return await self.call(
            operation="create",
            params={"resource": "course", "name": name, ...},
            access_token=access_token,
            correlation_id=correlation_id,
        )
```

### 7.2 Côté n8n

1. Créer le workflow `MCP - Google Classroom Server`
2. Webhook : `/webhook/mcp-classroom`
3. Node custom ou HTTP Request (voir RFC-083 section 4)

### 7.3 Côté chat.api

1. Endpoint REST : `POST /api/users/me/expert-responses/{id}/classroom-sync`
2. Appeler MCP Server (ClassroomTool ou webhook métier dédié)
3. MCP Server appelle n8n avec le token OAuth (BYOT)

---

## 8. Références

- RFC-083 : MCP Google Classroom Server
- `src/mcp_server/tools/n8n/base.py` : Classe N8NTool
- `src/mcp_server/tools/n8n/drive.py` : Exemple DriveTool
- `scripts/qdrant/sync_tools.sh` : Script de sync tools Qdrant
