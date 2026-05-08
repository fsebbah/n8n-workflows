# Architecture Système Globale

**Date** : 2026-05-08
**Statut** : Documentation interne
**Concerne** : Toutes les équipes

---

## 1. Vue d'ensemble

Le système est composé de plusieurs couches qui communiquent entre elles :

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              POINTS D'ENTRÉE                                     │
│                                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│   │   Frontend   │    │   Discord    │    │   Plugin     │    │  API Direct  │  │
│   │   (Web UI)   │    │    Bot       │    │  (VS Code,   │    │  (webhooks)  │  │
│   │              │    │              │    │   IDE...)    │    │              │  │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│          │                   │                   │                   │          │
└──────────│───────────────────│───────────────────│───────────────────│──────────┘
           │                   │                   │                   │
           │ WebSocket         │ WebSocket         │ HTTP/WS           │ HTTP
           │                   │                   │                   │
           ▼                   ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           API BACKEND (chat.api)                                 │
│                                                                                  │
│   - Point d'entrée unifié pour toutes les requêtes                              │
│   - Gestion des sessions et authentification                                     │
│   - Routage vers les services appropriés                                         │
│   - Orchestration des appels                                                     │
│                                                                                  │
└─────────────────────────────────────┬───────────────────────────────────────────┘
                                      │
           ┌──────────────────────────┼──────────────────────────┐
           │                          │                          │
           ▼                          ▼                          ▼
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Chatbot-Core   │      │    Azy-MCP       │      │     N8N          │
│                  │      │   (MCP Server)   │      │   (Webhooks)     │
│  Logique IA      │      │                  │      │                  │
│  Conversations   │◀────▶│  Outils Google   │─────▶│  Workflows       │
│  Mémoire         │      │  Outils métier   │      │  Automatisations │
│                  │      │                  │      │                  │
└──────────────────┘      └────────┬─────────┘      └────────┬─────────┘
                                   │                         │
                                   └────────────┬────────────┘
                                                │
                                                ▼
                                   ┌─────────────────────────┐
                                   │   Services Externes     │
                                   │                         │
                                   │  - Google APIs          │
                                   │  - OpenAI / Anthropic   │
                                   │  - Bases de données     │
                                   │  - Services tiers       │
                                   └─────────────────────────┘
```

---

## 2. Description des composants

### 2.1 Frontend (Web UI)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Interface utilisateur web pour le chatbot et l'administration |
| **Technologies** | React, TypeScript, WebSocket |
| **Communication** | WebSocket vers chat.api pour le chat temps réel |
| **Fonctionnalités** | Chat, Settings, Admin, visualisation des données |

```
Frontend
├── Chatbot Widget      → Conversations temps réel
├── Settings UI         → Configuration utilisateur (Google OAuth, préférences)
└── Admin Dashboard     → Gestion des utilisateurs, analytics
```

### 2.2 Discord Bot

| Aspect | Description |
|--------|-------------|
| **Rôle** | Interface conversationnelle via Discord |
| **Technologies** | discord.py ou discord.js |
| **Communication** | WebSocket vers chat.api |
| **Fonctionnalités** | Chat, commandes slash, interactions éducatives |

```
Discord Bot
├── Commandes slash     → /ask, /help, /settings
├── Conversations       → Messages naturels dans les channels
└── Threads             → Discussions contextuelles
```

### 2.3 Plugin (IDE, VS Code...)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Extension pour les environnements de développement |
| **Technologies** | Dépend de l'IDE (TypeScript pour VS Code) |
| **Communication** | HTTP/WebSocket vers chat.api |
| **Fonctionnalités** | Assistance au code, génération, refactoring |

```
Plugin
├── Code completion     → Suggestions de code
├── Code generation     → Génération à partir de prompts
├── Code review         → Analyse et suggestions
└── Documentation       → Génération de docs
```

### 2.4 API Backend (chat.api)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Point d'entrée unifié, orchestration |
| **Technologies** | Python (FastAPI) ou Node.js |
| **Port** | Variable selon environnement |
| **Fonctionnalités** | Auth, routing, sessions, orchestration |

```
chat.api
├── Authentication      → OAuth, JWT, sessions
├── WebSocket Manager   → Connexions temps réel
├── Request Router      → Dispatch vers les services
├── User Management     → Profils, préférences
└── Orchestration       → Coordination des services
```

**Relations :**
- Reçoit toutes les requêtes des points d'entrée
- Délègue à Chatbot-Core pour l'IA
- Délègue à Azy-MCP pour les outils
- Peut appeler n8n directement pour certains workflows

### 2.5 Chatbot-Core

| Aspect | Description |
|--------|-------------|
| **Rôle** | Moteur de conversation IA |
| **Technologies** | Python, LangChain/LlamaIndex |
| **Fonctionnalités** | NLU, génération, mémoire, contexte |

```
Chatbot-Core
├── Intent Recognition  → Comprendre l'intention utilisateur
├── Response Generation → Générer des réponses (LLM)
├── Memory Management   → Historique, contexte long terme
├── Tool Calling        → Appeler les outils via MCP
└── RAG Pipeline        → Recherche et augmentation
```

**Relations :**
- Appelé par chat.api pour les conversations
- Appelle Azy-MCP quand un outil est nécessaire
- Utilise les LLMs (OpenAI, Anthropic) pour la génération

### 2.6 Azy-MCP (MCP Server)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Serveur d'outils MCP (Model Context Protocol) |
| **Technologies** | Python |
| **Port** | 8765 |
| **Fonctionnalités** | Wrappers vers services externes |

```
Azy-MCP
├── GmailTool           → Emails via n8n
├── CalendarTool        → Agenda via n8n
├── DriveTool           → Fichiers via n8n
├── ContactsTool        → Contacts via n8n
├── ClassroomTool       → Google Classroom via n8n
└── [Autres outils]     → Extensions métier
```

**Relations :**
- Appelé par Chatbot-Core (via MCP protocol)
- Appelle n8n webhooks pour exécuter les opérations
- Peut être appelé directement par chat.api

**Pattern BYOT (Bring Your Own Token) :**
```
Azy-MCP reçoit le token OAuth de l'utilisateur
    ↓
Le passe à n8n dans chaque requête
    ↓
n8n utilise ce token pour appeler Google APIs
    ↓
Aucun token n'est stocké dans n8n (multi-tenant)
```

### 2.7 N8N (Workflows)

| Aspect | Description |
|--------|-------------|
| **Rôle** | Moteur de workflows et automatisations |
| **Technologies** | Node.js, n8n |
| **Port** | 5678 |
| **Fonctionnalités** | Webhooks, workflows, intégrations |

```
N8N
├── Webhooks CRUD           → Opérations unitaires (mcp-gmail, mcp-classroom...)
├── Webhooks Orchestration  → Workflows métier (expert-program-sync...)
├── Workflows planifiés     → Tâches récurrentes (sync, cleanup...)
└── Custom Nodes            → Nodes spécialisés (CUSTOM.gmailToolDynamic...)
```

**Types de webhooks :**

| Type | Exemple | Usage |
|------|---------|-------|
| **CRUD** | `/webhook/mcp-classroom` | Opérations unitaires (list, get, create...) |
| **Orchestration** | `/webhook/expert-program-classroom-sync` | Workflows métier complexes |
| **Interne** | `/webhook/internal-*` | Communication entre workflows |

**Relations :**
- Reçoit les requêtes de Azy-MCP
- Peut être appelé directement par chat.api
- Appelle les APIs externes (Google, etc.)

---

## 3. Flux de données

### 3.1 Conversation utilisateur simple

```
User: "Bonjour"
    ↓
Frontend (WebSocket)
    ↓
chat.api (routing)
    ↓
Chatbot-Core (génération)
    ↓
LLM (OpenAI/Anthropic)
    ↓
Réponse: "Bonjour ! Comment puis-je vous aider ?"
```

### 3.2 Utilisation d'un outil Google

```
User: "Montre mes emails non lus"
    ↓
Frontend (WebSocket)
    ↓
chat.api (routing)
    ↓
Chatbot-Core (détecte intention = outil Gmail)
    ↓
Azy-MCP (GmailTool.list_emails)
    ↓
n8n (/webhook/mcp-gmail, operation: "email.list")
    ↓
Google Gmail API
    ↓
Réponse avec liste des emails
```

### 3.3 Workflow métier complexe

```
Admin: "Synchronise le programme expert #123 vers Classroom"
    ↓
Frontend / API
    ↓
chat.api
    ↓
Azy-MCP (ClassroomTool.sync_program)
    ↓
n8n (/webhook/expert-program-classroom-sync)
    ↓
n8n crée Topics, CourseWorks (appelle mcp-classroom en interne)
    ↓
Google Classroom API
    ↓
Callback vers chat.api avec résultat
```

---

## 4. Responsabilités par équipe

| Équipe | Composants | Responsabilités |
|--------|------------|-----------------|
| **Frontend** | Frontend, Discord Bot, Plugin | UI, UX, intégration WebSocket |
| **Backend API** | chat.api | Auth, routing, orchestration, sessions |
| **IA/ML** | Chatbot-Core | Conversations, RAG, mémoire, prompts |
| **MCP** | Azy-MCP | Wrappers outils, protocole MCP |
| **Workflows** | N8N | Webhooks, workflows, custom nodes |
| **DevOps** | Tous | Déploiement, monitoring, infra |

---

## 5. Ports et endpoints

| Service | Port | Endpoints principaux |
|---------|------|---------------------|
| **Frontend** | 3000 | `/` (SPA) |
| **chat.api** | 8000 | `/ws`, `/api/v1/*` |
| **Azy-MCP** | 8765 | MCP protocol |
| **N8N** | 5678 | `/webhook/*`, `/healthz` |

---

## 6. Environnements

| Environnement | Frontend | chat.api | Azy-MCP | N8N |
|---------------|----------|----------|---------|-----|
| **Local (pi6)** | localhost:3000 | localhost:8000 | localhost:8765 | pi6.local:5678 |
| **Docker (host2)** | - | - | - | host2.local:5678 |
| **Production** | TBD | TBD | TBD | TBD |

---

## 7. Références

- [Google Services Integration](./GOOGLE-SERVICES-INTEGRATION.md)
- [MCP Classroom Integration](../mcp/MCP_CLASSROOM_INTEGRATION.md)
- [Docker Deployment](../../docker/README.md)
