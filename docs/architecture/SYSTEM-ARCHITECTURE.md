# Architecture Système Globale

**Date** : 2026-05-08
**Statut** : Documentation interne
**Concerne** : Toutes les équipes

---

## 1. Vue d'ensemble

Le système est composé de deux flux principaux :

### Flux 1 : Frontend → chat.api → Azy-MCP → N8N

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Frontend   │─────▶│   chat.api   │─────▶│   Azy-MCP    │─────▶│     N8N      │
│   (Web UI)   │      │              │      │ (MCP Server) │      │  (Webhooks)  │
└──────────────┘      └──────────────┘      └──────────────┘      └──────┬───────┘
                                                                         │
                                                                         ▼
                                                              ┌─────────────────────┐
                                                              │  Services Externes  │
                                                              │  Google, LLM, etc.  │
                                                              └─────────────────────┘
```

### Flux 2 : Plugin / Discord → Chatbot-Core → Azy-MCP → N8N

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Discord    │─────▶│              │      │              │      │              │
│    Bot       │      │  Chatbot-    │─────▶│   Azy-MCP    │─────▶│     N8N      │
├──────────────┤      │    Core      │      │ (MCP Server) │      │  (Webhooks)  │
│   Plugin     │─────▶│              │      │              │      │              │
│  (VS Code)   │      │              │      │              │      │              │
└──────────────┘      └──────────────┘      └──────────────┘      └──────┬───────┘
                                                                         │
                                                                         ▼
                                                              ┌─────────────────────┐
                                                              │  Services Externes  │
                                                              │  Google, LLM, etc.  │
                                                              └─────────────────────┘
```

### Schéma global unifié

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              POINTS D'ENTRÉE                                     │
│                                                                                  │
│        ┌──────────────┐              ┌──────────────┐    ┌──────────────┐       │
│        │   Frontend   │              │   Discord    │    │   Plugin     │       │
│        │   (Web UI)   │              │    Bot       │    │  (VS Code)   │       │
│        └──────┬───────┘              └──────┬───────┘    └──────┬───────┘       │
│               │                             │                   │               │
└───────────────│─────────────────────────────│───────────────────│───────────────┘
                │                             │                   │
                ▼                             └─────────┬─────────┘
┌──────────────────────────┐                           │
│      chat.api            │                           │
│  (Backend API)           │                           │
└────────────┬─────────────┘                           │
             │                                         │
             │                                         ▼
             │                          ┌──────────────────────────┐
             │                          │      Chatbot-Core        │
             │                          │  (Moteur IA / Conversations)
             │                          └────────────┬─────────────┘
             │                                       │
             └───────────────┬───────────────────────┘
                             │
                             ▼
              ┌──────────────────────────┐
              │        Azy-MCP           │
              │     (MCP Server)         │
              │  Wrappers outils Google  │
              └────────────┬─────────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │          N8N             │
              │      (Webhooks)          │
              │  Workflows & Automations │
              └────────────┬─────────────┘
                           │
                           ▼
              ┌──────────────────────────┐
              │   Services Externes      │
              │                          │
              │  - Google APIs           │
              │  - OpenAI / Anthropic    │
              │  - Bases de données      │
              │  - Services tiers        │
              └──────────────────────────┘
```

**Points clés :**
- **Frontend** passe TOUJOURS par `chat.api` → `Azy-MCP` → `N8N`
- **Discord/Plugin** passent par `Chatbot-Core` → `Azy-MCP` → `N8N`
- **N8N** est le SEUL à appeler les services externes (Google, LLM, etc.)
- **Azy-MCP** est le point de passage obligé pour tous les outils

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
- Reçoit les requêtes UNIQUEMENT de Azy-MCP
- Appelle les services externes (Google APIs, LLMs, bases de données, etc.)
- Est le SEUL composant à communiquer avec les services externes

---

## 3. Flux de données

### 3.1 Flux Frontend (Web UI) - Opération Google

```
User (Frontend): "Montre mes emails non lus"
    ↓
Frontend (WebSocket)
    ↓
chat.api
    ↓
Azy-MCP (GmailTool.list_emails)
    ↓
n8n (/webhook/mcp-gmail, operation: "email.list")
    ↓
Google Gmail API
    ↓
Réponse avec liste des emails
```

### 3.2 Flux Discord/Plugin - Conversation IA

```
User (Discord): "Bonjour, aide-moi avec mon code"
    ↓
Discord Bot
    ↓
Chatbot-Core (conversation IA)
    ↓
Azy-MCP (si outil nécessaire)
    ↓
n8n (appel LLM via webhook)
    ↓
OpenAI / Anthropic
    ↓
Réponse générée par l'IA
```

### 3.3 Flux Discord/Plugin - Opération Google

```
User (Plugin VS Code): "Crée un événement dans mon calendrier"
    ↓
Plugin
    ↓
Chatbot-Core (détecte intention = outil Calendar)
    ↓
Azy-MCP (CalendarTool.create_event)
    ↓
n8n (/webhook/mcp-calendar, operation: "event.create")
    ↓
Google Calendar API
    ↓
Confirmation de création
```

### 3.4 Workflow métier complexe (Frontend)

```
Admin (Frontend): "Synchronise le programme expert #123 vers Classroom"
    ↓
Frontend
    ↓
chat.api
    ↓
Azy-MCP (ClassroomTool.sync_program)
    ↓
n8n (/webhook/expert-program-classroom-sync)
    ↓
n8n crée Topics + CourseWorks (appelle mcp-classroom en interne)
    ↓
Google Classroom API
    ↓
Callback avec résultat
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
