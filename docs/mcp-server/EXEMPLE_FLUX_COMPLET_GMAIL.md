# Exemple Complet : "Lis mes emails Gmail de la journée et fais un résumé"

> **Version**: 1.0
> **Date**: 2025-12-04
> **Objectif**: Décomposer pas à pas TOUS les services impliqués

---

## Vue d'ensemble des Services

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SERVICES IMPLIQUÉS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. FRONTEND (Vue.js 3)          - Interface utilisateur                    │
│  2. BACKEND API (FastAPI)        - Gateway, Auth, Routing                   │
│  3. CELERY WORKER (Python)       - Traitement asynchrone des tâches longues │
│  4. REDIS                        - Broker Celery, Tokens OAuth, Sessions    │
│  5. MCP SERVER (Python)          - Intelligence LLM, Orchestration          │
│  6. n8n                          - Exécution workflow                        │
│  7. GMAIL API (Google)           - Données emails                           │
│  8. LLM (Claude/OpenAI)          - Résumé intelligent                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Diagramme de Séquence Complet

```
┌────────┐ ┌──────────┐ ┌───────────┐ ┌────────┐ ┌───────┐ ┌────────────┐ ┌─────┐ ┌───────────┐ ┌─────┐
│  USER  │ │ FRONTEND │ │ BACKEND   │ │ CELERY │ │ REDIS │ │ MCP SERVER │ │ n8n │ │ GMAIL API │ │ LLM │
└───┬────┘ └────┬─────┘ └─────┬─────┘ └───┬────┘ └───┬───┘ └──────┬─────┘ └──┬──┘ └─────┬─────┘ └──┬──┘
    │          │             │           │         │            │          │          │          │
    │ ÉTAPE 1  │             │           │         │            │          │          │          │
    │──────────▶             │           │         │            │          │          │          │
    │ "Lis mes │             │           │         │            │          │          │          │
    │ emails"  │             │           │         │            │          │          │          │
    │          │             │           │         │            │          │          │          │
    │          │ ÉTAPE 2     │           │         │            │          │          │          │
    │          │────────────▶│           │         │            │          │          │          │
    │          │ POST /chat  │           │         │            │          │          │          │
    │          │             │           │         │            │          │          │          │
    │          │             │ ÉTAPE 3   │         │            │          │          │          │
    │          │             │──────────────────────▶            │          │          │          │
    │          │             │ GET session         │            │          │          │          │
    │          │             │◀────────────────────│            │          │          │          │
    │          │             │           │         │            │          │          │          │
    │          │             │ ÉTAPE 4   │         │            │          │          │          │
    │          │             │──────────────────────▶            │          │          │          │
    │          │             │ LPUSH task to queue │            │          │          │          │
    │          │             │           │         │            │          │          │          │
    │          │◀────────────│           │         │            │          │          │          │
    │          │ 202 Accepted│           │         │            │          │          │          │
    │          │ + task_id   │           │         │            │          │          │          │
    │          │             │           │         │            │          │          │          │
    │          │ WebSocket   │           │         │            │          │          │          │
    │          │═══════════════════════════════════│            │          │          │          │
    │          │ (connexion pour streaming)        │            │          │          │          │
    │          │             │           │         │            │          │          │          │
    │          │             │ ÉTAPE 4bis│         │            │          │          │          │
    │          │             │           │◀────────│            │          │          │          │
    │          │             │           │ BRPOP   │            │          │          │          │
    │          │             │           │ (Worker)│            │          │          │          │
    │          │             │           │         │            │          │          │          │
    │          │             │           │────────────────────▶│          │          │          │
    │          │             │           │ POST /orchestrator  │          │          │          │
    │          │             │           │         │            │          │          │          │
    │          │             │           │         │  ÉTAPE 5   │          │          │          │
    │          │             │           │         │◀───────────│          │          │          │
    │          │             │           │         │ GET token  │          │          │          │
    │          │             │           │         │───────────▶│          │          │          │
    │          │             │           │         │            │          │          │          │
    │          │             │           │         │            │ ÉTAPE 6  │          │          │
    │          │             │           │         │            │─────────▶│          │          │
    │          │             │           │         │            │ webhook  │          │          │
    │          │             │           │         │            │ + token  │          │          │
    │          │             │           │         │            │          │          │          │
    │          │             │           │         │            │          │ ÉTAPE 7  │          │
    │          │             │           │         │            │          │─────────▶│          │
    │          │             │           │         │            │          │ GET msgs │          │
    │          │             │           │         │            │          │◀─────────│          │
    │          │             │           │         │            │          │          │          │
    │          │             │           │         │            │          │ ÉTAPE 8  │          │
    │          │             │           │         │            │          │─────────────────────▶
    │          │             │           │         │            │          │ Résume   │          │
    │          │             │           │         │            │          │◀─────────────────────
    │          │             │           │         │            │          │          │          │
    │          │             │           │         │            │◀─────────│          │          │
    │          │             │           │         │            │ ÉTAPE 9  │          │          │
    │          │             │           │◀────────────────────│          │          │          │
    │          │             │           │         │ ÉTAPE 10  │          │          │          │
    │          │             │           │         │            │          │          │          │
    │          │◀═══════════════════════════════════════════════│          │          │          │
    │          │ WebSocket: execution_complete     │            │          │          │          │
    │          │             │           │         │            │          │          │          │
    │◀─────────│ ÉTAPE 11    │           │         │            │          │          │          │
    │ Affiche  │             │           │         │            │          │          │          │
    │ résumé   │             │           │         │            │          │          │          │
```

---

## Décomposition Pas à Pas

### ÉTAPE 1 : Utilisateur → Frontend

**Action**: L'utilisateur tape sa demande dans l'interface.

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Vue.js 3)                         │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  💬 Chat Interface                                       │    │
│  │                                                          │    │
│  │  User: "Lis mes emails Gmail de la journée et fais      │    │
│  │         un résumé"                                       │    │
│  │                                                          │    │
│  │  [Envoyer]                                               │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  État local:                                                     │
│  • user_id: "user_123"                                          │
│  • session_id: "sess_abc"                                       │
│  • jwt_token: "eyJhbG..."                                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Données collectées**:
- Message texte de l'utilisateur
- ID utilisateur (depuis JWT)
- ID de session (conversation en cours)

---

### ÉTAPE 2 : Frontend → Backend API

**Action**: Le frontend envoie une requête HTTP au backend.

```
┌─────────────────────────────────────────────────────────────────┐
│                     REQUÊTE HTTP                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  POST https://api.azy.com/api/v1/chat/message                   │
│                                                                  │
│  Headers:                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Authorization: Bearer eyJhbGciOiJIUzI1NiIs...          │    │
│  │  Content-Type: application/json                          │    │
│  │  X-Session-ID: sess_abc                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Body:                                                           │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  {                                                       │    │
│  │    "message": "Lis mes emails Gmail de la journée et    │    │
│  │               fais un résumé",                           │    │
│  │    "session_id": "sess_abc",                             │    │
│  │    "context": {                                          │    │
│  │      "expert_id": "chat_studio",                         │    │
│  │      "timezone": "Europe/Paris"                          │    │
│  │    }                                                     │    │
│  │  }                                                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### ÉTAPE 3 : Backend API - Validation & Session

**Action**: Le backend valide le JWT, récupère la session depuis Redis.

```
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API (FastAPI)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  # routes/chat.py                                                │
│                                                                  │
│  @router.post("/chat/message")                                   │
│  async def process_message(                                      │
│      request: ChatRequest,                                       │
│      user: User = Depends(get_current_user)  # JWT validation   │
│  ):                                                              │
│                                                                  │
│      # 1. Valider le JWT ✓                                       │
│      #    user_id = "user_123"                                   │
│      #    email = "john@example.com"                             │
│                                                                  │
│      # 2. Récupérer la session depuis Redis                      │
│      session = await redis.get(f"session:{request.session_id}") │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                           REDIS                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GET session:sess_abc                                            │
│                                                                  │
│  Retourne:                                                       │
│  {                                                               │
│    "user_id": "user_123",                                        │
│    "expert_id": "chat_studio",                                   │
│    "history": [                                                  │
│      {"role": "user", "content": "Bonjour"},                     │
│      {"role": "assistant", "content": "Bonjour! Comment..."}     │
│    ],                                                            │
│    "created_at": "2025-12-04T10:00:00Z"                          │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### ÉTAPE 4 : Backend API → Celery (Traitement Asynchrone)

**Action**: Le backend crée une tâche Celery pour traitement asynchrone et retourne immédiatement.

```
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API (suite)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  # routes/chat.py (suite)                                        │
│                                                                  │
│  # 3. Créer une tâche Celery pour traitement asynchrone          │
│  from app.celery_app import celery_app                           │
│  from app.tasks.orchestrator_tasks import execute_orchestrator   │
│                                                                  │
│  # Créer l'exécution en DB avec statut "pending"                 │
│  execution = OrchestratorExecution(                              │
│      id=str(uuid.uuid4()),                                       │
│      tenant_id=tenant_id,                                        │
│      user_id=user.id,                                            │
│      status="pending",                                           │
│      inputs={"message": request.message}                         │
│  )                                                               │
│  await db.add(execution)                                         │
│  await db.commit()                                               │
│                                                                  │
│  # Envoyer la tâche à Celery (NON BLOQUANT)                      │
│  task = execute_orchestrator_task.delay(                         │
│      execution_id=execution.id,                                  │
│      orchestrator_id=orchestrator.id,                            │
│      graph=orchestrator.graph,                                   │
│      inputs={"message": request.message},                        │
│      tenant_id=tenant_id,                                        │
│      user_id=user.id                                             │
│  )                                                               │
│                                                                  │
│  # 4. Retourner IMMÉDIATEMENT au frontend avec task_id           │
│  return JSONResponse({                                           │
│      "status": "accepted",                                       │
│      "execution_id": execution.id,                               │
│      "task_id": task.id,                                         │
│      "message": "Traitement en cours..."                         │
│  })                                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Réponse immédiate (< 100ms)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Réponse reçue:                                                  │
│  {                                                               │
│    "status": "accepted",                                         │
│    "execution_id": "exec_abc123",                                │
│    "task_id": "celery-task-xyz789",                              │
│    "message": "Traitement en cours..."                           │
│  }                                                               │
│                                                                  │
│  → Afficher loader "Analyse de vos emails..."                    │
│  → Ouvrir connexion WebSocket pour recevoir le résultat          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### ÉTAPE 4bis : Celery Worker → MCP Server

**Action**: Le worker Celery (processus séparé) traite la tâche et appelle le MCP Server.

```
┌─────────────────────────────────────────────────────────────────┐
│                    REDIS (Broker Celery)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Queue: orchestrator_executions                                  │
│                                                                  │
│  Message en attente:                                             │
│  {                                                               │
│    "task": "app.tasks.orchestrator_tasks.execute_orchestrator", │
│    "id": "celery-task-xyz789",                                  │
│    "args": [                                                     │
│      "exec_abc123",      // execution_id                        │
│      "orch_gmail_001",   // orchestrator_id                     │
│      {...},              // graph                                │
│      {"message": "..."},  // inputs                              │
│      "tenant_123",       // tenant_id                            │
│      "user_123"          // user_id                              │
│    ]                                                             │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Worker récupère la tâche
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CELERY WORKER                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  # app/tasks/orchestrator_tasks.py                               │
│                                                                  │
│  @celery_app.task(bind=True, max_retries=3)                      │
│  def execute_orchestrator_task(self, execution_id, ...):         │
│      """                                                         │
│      Exécuté dans un PROCESSUS SÉPARÉ du Backend API.            │
│      Permet de ne pas bloquer les requêtes HTTP.                 │
│      """                                                         │
│                                                                  │
│      # 1. Mettre à jour statut en DB → "running"                 │
│      execution.status = "running"                                │
│      execution.started_at = datetime.utcnow()                    │
│      await db.commit()                                           │
│                                                                  │
│      # 2. Appeler le MCP Server (appel LONG ~5s)                 │
│      async with httpx.AsyncClient(timeout=600.0) as client:     │
│          mcp_response = await client.post(                       │
│              f"{MCP_SERVER_URL}/orchestrator/execute",          │
│              json={                                              │
│                  "execution_id": execution_id,                   │
│                  "graph": graph,                                 │
│                  "inputs": inputs,                               │
│                  "tenant_id": tenant_id,                         │
│                  "user_id": user_id,                             │
│                  "callback_url": f"{BACKEND_URL}/api/mcp/callback"│
│              }                                                   │
│          )                                                       │
│                                                                  │
│      # 3. Mettre à jour execution avec résultat                  │
│      execution.status = "completed"                              │
│      execution.outputs = mcp_response.json()                     │
│      execution.completed_at = datetime.utcnow()                  │
│      await db.commit()                                           │
│                                                                  │
│      # 4. Notifier le frontend via WebSocket                     │
│      await websocket_manager.broadcast_to_user(                  │
│          user_id=user_id,                                        │
│          event="execution_complete",                             │
│          data={"execution_id": execution_id, "outputs": ...}    │
│      )                                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP POST (appel long ~5s)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MCP SERVER                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Requête reçue:                                                  │
│  {                                                               │
│    "user_id": "user_123",                                        │
│    "message": "Lis mes emails Gmail de la journée et fais       │
│               un résumé",                                        │
│    "session": { ... historique ... },                            │
│    "context": {                                                  │
│      "expert_id": "chat_studio",                                 │
│      "timezone": "Europe/Paris"                                  │
│    }                                                             │
│  }                                                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   INTELLIGENCE LLM                       │    │
│  │                                                          │    │
│  │  Analyse de la demande:                                  │    │
│  │  • Intent: "read_emails" + "summarize"                   │    │
│  │  • Service: Gmail                                        │    │
│  │  • Filtre: aujourd'hui                                   │    │
│  │  • Action requise: workflow n8n "gmail/analyze-daily"    │    │
│  │                                                          │    │
│  │  Décision:                                               │    │
│  │  → Appeler workflow n8n avec token OAuth Gmail           │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### ÉTAPE 5 : MCP Server → Redis (Token OAuth)

**Action**: Le MCP Server récupère le token OAuth Gmail de l'utilisateur.

```
┌─────────────────────────────────────────────────────────────────┐
│                   MCP SERVER - OAuth Manager                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  # services/oauth_manager.py                                     │
│                                                                  │
│  async def get_oauth_token(user_id: str, service: str):         │
│      key = f"oauth:{user_id}:{service}"                         │
│      token_data = await redis.get(key)                          │
│                                                                  │
│      if not token_data:                                          │
│          raise OAuthNotConnectedError(                           │
│              "Gmail non connecté. Veuillez autoriser l'accès."  │
│          )                                                       │
│                                                                  │
│      token = json.loads(token_data)                              │
│                                                                  │
│      # Vérifier expiration                                       │
│      if is_expired(token["expires_at"]):                        │
│          token = await refresh_token(user_id, service, token)   │
│                                                                  │
│      return token["access_token"]                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                           REDIS                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GET oauth:user_123:gmail                                        │
│                                                                  │
│  Retourne:                                                       │
│  {                                                               │
│    "access_token": "ya29.a0AfH6SMBx7_Kx...",                    │
│    "refresh_token": "1//0eVz7Xk...",                            │
│    "expires_at": "2025-12-04T15:30:00Z",                        │
│    "scope": "https://www.googleapis.com/auth/gmail.readonly",   │
│    "token_type": "Bearer"                                       │
│  }                                                               │
│                                                                  │
│  ✓ Token valide (expire dans 45 min)                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Si le token était expiré**:
```
┌─────────────────────────────────────────────────────────────────┐
│                   REFRESH TOKEN (si nécessaire)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  POST https://oauth2.googleapis.com/token                        │
│                                                                  │
│  Body:                                                           │
│  {                                                               │
│    "client_id": "xxx.apps.googleusercontent.com",               │
│    "client_secret": "GOCSPX-xxx",                               │
│    "refresh_token": "1//0eVz7Xk...",                            │
│    "grant_type": "refresh_token"                                │
│  }                                                               │
│                                                                  │
│  Réponse:                                                        │
│  {                                                               │
│    "access_token": "ya29.NEW_TOKEN...",                         │
│    "expires_in": 3600                                           │
│  }                                                               │
│                                                                  │
│  → Mise à jour dans Redis                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### ÉTAPE 6 : MCP Server → n8n (Webhook)

**Action**: Le MCP Server appelle le workflow n8n avec le token OAuth injecté.

```
┌─────────────────────────────────────────────────────────────────┐
│                   MCP SERVER - n8n Executor                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  # services/n8n_executor.py                                      │
│                                                                  │
│  async def execute_gmail_analysis(                               │
│      user_id: str,                                               │
│      access_token: str,                                          │
│      date_filter: str                                            │
│  ):                                                              │
│      response = await http_client.post(                          │
│          url="http://n8n:5678/webhook/gmail/analyze-daily",     │
│          json={                                                  │
│              "user_id": user_id,                                 │
│              "access_token": access_token,    # ← TOKEN INJECTÉ │
│              "date_filter": date_filter,                        │
│              "timezone": "Europe/Paris",                         │
│              "max_emails": 50                                    │
│          },                                                      │
│          headers={                                               │
│              "X-MCP-Request-ID": "req_xyz789"                   │
│          }                                                       │
│      )                                                           │
│      return response.json()                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP POST
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                            n8n                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Webhook reçu:                                                   │
│                                                                  │
│  POST /webhook/gmail/analyze-daily                               │
│                                                                  │
│  Body:                                                           │
│  {                                                               │
│    "user_id": "user_123",                                        │
│    "access_token": "ya29.a0AfH6SMBx7_Kx...",                    │
│    "date_filter": "today",                                       │
│    "timezone": "Europe/Paris",                                   │
│    "max_emails": 50                                              │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### ÉTAPE 7 : n8n → Gmail API

**Action**: n8n exécute le workflow et appelle l'API Gmail avec le token.

```
┌─────────────────────────────────────────────────────────────────┐
│                    n8n WORKFLOW EXECUTION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Workflow: "Gmail - Analyze Daily Emails"                        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  NODE 1: Webhook Trigger                                  │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │  Input: { user_id, access_token, date_filter, ... }      │   │
│  │  Output: même données                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  NODE 2: Build Query                                      │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │  Type: Code Node                                          │   │
│  │                                                           │   │
│  │  // Construire la query Gmail                             │   │
│  │  const today = new Date().toISOString().split('T')[0];   │   │
│  │  const query = `after:${today}`;                         │   │
│  │                                                           │   │
│  │  Output: { query: "after:2025/12/04" }                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  NODE 3: List Messages                                    │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │  Type: HTTP Request                                       │   │
│  │                                                           │   │
│  │  URL: https://gmail.googleapis.com/gmail/v1/users/me/    │   │
│  │       messages?q=after:2025/12/04&maxResults=50          │   │
│  │                                                           │   │
│  │  Headers:                                                 │   │
│  │    Authorization: Bearer ya29.a0AfH6SMBx7_Kx...          │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         GMAIL API                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  GET /gmail/v1/users/me/messages?q=after:2025/12/04&maxResults=50
│                                                                  │
│  Response (200 OK):                                              │
│  {                                                               │
│    "messages": [                                                 │
│      { "id": "msg_001", "threadId": "thread_a" },               │
│      { "id": "msg_002", "threadId": "thread_b" },               │
│      { "id": "msg_003", "threadId": "thread_a" },               │
│      ... (15 messages au total)                                  │
│    ],                                                            │
│    "resultSizeEstimate": 15                                      │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    n8n WORKFLOW (suite)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  NODE 4: Loop - Get Each Email Content                    │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │  Type: SplitInBatches                                     │   │
│  │                                                           │   │
│  │  Pour chaque message_id, faire:                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  NODE 5: Get Message Details                              │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │  Type: HTTP Request                                       │   │
│  │                                                           │   │
│  │  URL: https://gmail.googleapis.com/gmail/v1/users/me/    │   │
│  │       messages/{{ $json.id }}?format=full                │   │
│  │                                                           │   │
│  │  Headers:                                                 │   │
│  │    Authorization: Bearer ya29.a0AfH6SMBx7_Kx...          │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  NODE 6: Parse & Format Emails                            │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │  Type: Code Node                                          │   │
│  │                                                           │   │
│  │  // Extraire: From, Subject, Snippet, Date                │   │
│  │  const emails = items.map(item => ({                      │   │
│  │    from: getHeader(item, 'From'),                        │   │
│  │    subject: getHeader(item, 'Subject'),                  │   │
│  │    snippet: item.json.snippet,                           │   │
│  │    date: getHeader(item, 'Date')                         │   │
│  │  }));                                                     │   │
│  │                                                           │   │
│  │  Output:                                                  │   │
│  │  [                                                        │   │
│  │    {                                                      │   │
│  │      "from": "boss@company.com",                         │   │
│  │      "subject": "Réunion projet X - Urgent",             │   │
│  │      "snippet": "Bonjour, suite à notre discussion...",  │   │
│  │      "date": "2025-12-04T09:15:00Z"                      │   │
│  │    },                                                     │   │
│  │    {                                                      │   │
│  │      "from": "rh@company.com",                           │   │
│  │      "subject": "Rappel: Congés fin d'année",            │   │
│  │      "snippet": "N'oubliez pas de poser vos...",         │   │
│  │      "date": "2025-12-04T08:30:00Z"                      │   │
│  │    },                                                     │   │
│  │    ... (15 emails)                                        │   │
│  │  ]                                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### ÉTAPE 8 : n8n → LLM (Résumé)

**Action**: n8n envoie les emails au LLM pour générer un résumé.

```
┌─────────────────────────────────────────────────────────────────┐
│                    n8n WORKFLOW (suite)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  NODE 7: Prepare Prompt                                   │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │  Type: Code Node                                          │   │
│  │                                                           │   │
│  │  const emailsText = emails.map((e, i) =>                 │   │
│  │    `${i+1}. De: ${e.from}\n` +                           │   │
│  │    `   Sujet: ${e.subject}\n` +                          │   │
│  │    `   Aperçu: ${e.snippet}\n`                           │   │
│  │  ).join('\n');                                            │   │
│  │                                                           │   │
│  │  const prompt = `Tu es un assistant qui résume les       │   │
│  │  emails. Voici les ${emails.length} emails reçus         │   │
│  │  aujourd'hui. Fais un résumé structuré par thème/        │   │
│  │  priorité.\n\n${emailsText}`;                            │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  NODE 8: Call LLM (OpenAI/Claude)                         │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │  Type: OpenAI Node (ou HTTP Request vers Anthropic)      │   │
│  │                                                           │   │
│  │  Model: gpt-4 (ou claude-3-sonnet)                       │   │
│  │  Prompt: [prompt généré ci-dessus]                       │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       LLM API (OpenAI)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  POST https://api.openai.com/v1/chat/completions                │
│                                                                  │
│  Request:                                                        │
│  {                                                               │
│    "model": "gpt-4",                                            │
│    "messages": [                                                 │
│      {                                                           │
│        "role": "user",                                          │
│        "content": "Tu es un assistant qui résume les emails..." │
│      }                                                           │
│    ],                                                            │
│    "temperature": 0.7                                           │
│  }                                                               │
│                                                                  │
│  Response (200 OK):                                              │
│  {                                                               │
│    "choices": [                                                  │
│      {                                                           │
│        "message": {                                              │
│          "role": "assistant",                                   │
│          "content": "📧 **Résumé de vos 15 emails du 4        │
│                      décembre 2025**\n\n                        │
│                      🔴 **URGENT (2 emails)**\n                 │
│                      - Réunion projet X demain 14h avec le     │
│                        client ABC (boss@company.com)\n          │
│                      - Deadline budget Q1 repoussée au 10/12   │
│                        (finance@company.com)\n\n                │
│                      📋 **RH & Admin (3 emails)**\n            │
│                      - Rappel congés à poser avant 20/12\n     │
│                      - Nouveaux horaires cantine\n             │
│                      - Mise à jour politique télétravail\n\n   │
│                      📬 **Newsletters & Infos (10 emails)**\n  │
│                      - 5 newsletters tech\n                     │
│                      - 3 notifications LinkedIn\n              │
│                      - 2 confirmations de commande"             │
│        }                                                         │
│      }                                                           │
│    ]                                                             │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### ÉTAPE 9 : n8n → MCP Server (Réponse)

**Action**: n8n retourne le résultat au MCP Server via le webhook response.

```
┌─────────────────────────────────────────────────────────────────┐
│                    n8n WORKFLOW (fin)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  NODE 9: Respond to Webhook                               │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │  Type: Respond to Webhook                                 │   │
│  │                                                           │   │
│  │  Response Body:                                           │   │
│  │  {                                                        │   │
│  │    "success": true,                                       │   │
│  │    "email_count": 15,                                     │   │
│  │    "summary": "📧 **Résumé de vos 15 emails...",        │   │
│  │    "categories": {                                        │   │
│  │      "urgent": 2,                                         │   │
│  │      "rh_admin": 3,                                       │   │
│  │      "newsletters": 10                                    │   │
│  │    },                                                     │   │
│  │    "execution_time_ms": 4523                             │   │
│  │  }                                                        │   │
│  │                                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP Response
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MCP SERVER                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Réponse n8n reçue:                                              │
│  {                                                               │
│    "success": true,                                              │
│    "email_count": 15,                                            │
│    "summary": "📧 **Résumé de vos 15 emails..."                │
│  }                                                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   INTELLIGENCE LLM                       │    │
│  │                                                          │    │
│  │  Formater la réponse finale pour l'utilisateur:         │    │
│  │  • Ajouter contexte conversationnel                      │    │
│  │  • Proposer actions suivantes                            │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Réponse formatée:                                               │
│  {                                                               │
│    "response": "Voici le résumé de vos 15 emails reçus        │
│                 aujourd'hui :\n\n📧 **Résumé...**\n\n          │
│                 Voulez-vous que je vous lise l'email urgent    │
│                 de votre boss en détail ?",                     │
│    "suggested_actions": [                                        │
│      { "label": "Lire email urgent", "action": "read_email",   │
│        "params": { "id": "msg_001" } },                         │
│      { "label": "Archiver newsletters", "action": "archive",   │
│        "params": { "label": "newsletters" } }                   │
│    ]                                                             │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### ÉTAPE 10 : MCP Server → Backend API

**Action**: Le MCP Server retourne la réponse au Backend.

```
┌─────────────────────────────────────────────────────────────────┐
│                   MCP SERVER → BACKEND                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Response:                                                       │
│  {                                                               │
│    "status": "success",                                          │
│    "response": {                                                 │
│      "message": "Voici le résumé de vos 15 emails...",         │
│      "suggested_actions": [...],                                 │
│      "metadata": {                                               │
│        "workflow_used": "gmail/analyze-daily",                  │
│        "tokens_used": 1250,                                      │
│        "execution_time_ms": 5234                                │
│      }                                                           │
│    }                                                             │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  # Mise à jour session dans Redis                                │
│  session["history"].append({                                     │
│      "role": "user",                                            │
│      "content": "Lis mes emails Gmail..."                       │
│  })                                                              │
│  session["history"].append({                                     │
│      "role": "assistant",                                       │
│      "content": "Voici le résumé..."                            │
│  })                                                              │
│  await redis.set(f"session:{session_id}", json.dumps(session)) │
│                                                                  │
│  # Retourner au frontend                                         │
│  return JSONResponse({                                           │
│      "message": "Voici le résumé de vos 15 emails...",          │
│      "suggested_actions": [...],                                 │
│      "session_id": "sess_abc"                                   │
│  })                                                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### ÉTAPE 11 : WebSocket → Frontend → User

**Action**: Le frontend reçoit la notification WebSocket et affiche la réponse à l'utilisateur.

```
┌─────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Vue.js 3)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  💬 Chat Interface                                       │    │
│  │                                                          │    │
│  │  User: "Lis mes emails Gmail de la journée et fais      │    │
│  │         un résumé"                                       │    │
│  │                                                          │    │
│  │  Assistant:                                              │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │ Voici le résumé de vos 15 emails reçus          │    │    │
│  │  │ aujourd'hui :                                    │    │    │
│  │  │                                                  │    │    │
│  │  │ 📧 **Résumé de vos 15 emails du 4 décembre**    │    │    │
│  │  │                                                  │    │    │
│  │  │ 🔴 **URGENT (2 emails)**                        │    │    │
│  │  │ - Réunion projet X demain 14h avec client ABC  │    │    │
│  │  │ - Deadline budget Q1 repoussée au 10/12        │    │    │
│  │  │                                                  │    │    │
│  │  │ 📋 **RH & Admin (3 emails)**                   │    │    │
│  │  │ - Rappel congés à poser avant 20/12            │    │    │
│  │  │ - Nouveaux horaires cantine                     │    │    │
│  │  │ - Mise à jour politique télétravail            │    │    │
│  │  │                                                  │    │    │
│  │  │ 📬 **Newsletters & Infos (10 emails)**         │    │    │
│  │  │ - 5 newsletters tech                            │    │    │
│  │  │ - 3 notifications LinkedIn                      │    │    │
│  │  │ - 2 confirmations de commande                   │    │    │
│  │  │                                                  │    │    │
│  │  │ Voulez-vous que je vous lise l'email urgent    │    │    │
│  │  │ de votre boss en détail ?                       │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                                                          │    │
│  │  Actions suggérées:                                      │    │
│  │  ┌────────────────┐  ┌────────────────────┐             │    │
│  │  │ 📖 Lire urgent │  │ 📥 Archiver news  │             │    │
│  │  └────────────────┘  └────────────────────┘             │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Résumé du Flux Complet

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           TIMELINE COMPLÈTE                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  T+0ms      USER tape "Lis mes emails..."                                  │
│  T+50ms     FRONTEND envoie POST /api/chat                                 │
│  T+100ms    BACKEND valide JWT, récupère session Redis                     │
│  T+120ms    BACKEND crée execution en DB (status=pending)                  │
│  T+150ms    BACKEND envoie tâche à CELERY via Redis (non bloquant)         │
│  T+180ms    BACKEND retourne 202 Accepted + execution_id au FRONTEND       │
│  T+200ms    FRONTEND ouvre WebSocket pour recevoir le résultat             │
│                                                                             │
│  ─── TRAITEMENT ASYNCHRONE (CELERY WORKER) ───────────────────────────────│
│                                                                             │
│  T+250ms    CELERY WORKER récupère la tâche depuis Redis (BRPOP)           │
│  T+300ms    CELERY WORKER met à jour status → "running" en DB              │
│  T+350ms    CELERY WORKER appelle MCP SERVER                               │
│  T+400ms    MCP SERVER: LLM analyse → besoin workflow gmail                │
│  T+450ms    MCP SERVER récupère token OAuth depuis Redis                   │
│  T+500ms    MCP SERVER appelle n8n webhook avec token                      │
│  T+550ms    n8n reçoit webhook                                             │
│  T+700ms    n8n appelle Gmail API (list messages)                          │
│  T+1000ms   n8n reçoit liste 15 messages                                   │
│  T+2200ms   n8n récupère contenu de chaque email (loop)                    │
│  T+2700ms   n8n envoie au LLM pour résumé                                  │
│  T+4700ms   LLM retourne le résumé                                         │
│  T+4800ms   n8n retourne résultat au webhook                               │
│  T+4900ms   MCP SERVER reçoit résultat, formate réponse                    │
│  T+4950ms   CELERY WORKER reçoit résultat MCP                              │
│  T+5000ms   CELERY WORKER met à jour status → "completed" en DB            │
│  T+5050ms   CELERY WORKER notifie FRONTEND via WebSocket                   │
│  T+5100ms   USER voit le résumé affiché                                    │
│                                                                             │
│  ═══════════════════════════════════════════════════════════════════════   │
│  TEMPS PERÇU PAR USER: ~180ms (réponse immédiate "En cours...")            │
│  TEMPS TOTAL RÉEL: ~5 secondes (traitement en arrière-plan)                │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Avantages de l'Architecture Celery

```
┌────────────────────────────────────────────────────────────────────────────┐
│                    POURQUOI CELERY EST ESSENTIEL                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. NON-BLOCKING                                                            │
│     ─────────────                                                           │
│     • Le Backend API ne reste pas bloqué pendant 5 secondes                │
│     • Peut traiter d'autres requêtes HTTP simultanément                    │
│     • Évite les timeouts de connexion HTTP                                  │
│                                                                             │
│  2. SCALABILITÉ                                                             │
│     ───────────                                                             │
│     • Plusieurs workers Celery peuvent traiter en parallèle                │
│     • Scaling horizontal facile (ajouter des workers)                      │
│     • Queues séparées par priorité (high, normal, low)                     │
│                                                                             │
│  3. RETRY & FAULT TOLERANCE                                                 │
│     ─────────────────────────                                               │
│     • Retry automatique en cas d'échec (max_retries=3)                     │
│     • Dead Letter Queue pour les tâches échouées                           │
│     • Exponential backoff entre les retries                                │
│                                                                             │
│  4. MONITORING                                                              │
│     ──────────                                                              │
│     • Flower pour visualiser les tâches en cours                           │
│     • Métriques: temps d'exécution, taux d'échec, throughput               │
│     • Alertes en cas de queue qui grandit trop                             │
│                                                                             │
│  5. PERSISTANCE                                                             │
│     ───────────                                                             │
│     • Tâches persistées dans Redis (broker)                                │
│     • Résultats stockés (result backend)                                   │
│     • Reprise après crash du worker                                        │
│                                                                             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Configuration Celery Backend API

```python
# app/celery_app.py

from celery import Celery
from kombu import Queue

CELERY_BROKER_URL = "redis://databases.local:6379/1"
CELERY_RESULT_BACKEND = "redis://databases.local:6379/1"

celery_app = Celery(
    "orchestrator",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["app.tasks.orchestrator_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",

    # Worker settings
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,

    # Task settings
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,

    # Timeouts
    task_soft_time_limit=3600,  # 1 heure
    task_time_limit=3900,       # 1h05 (hard limit)

    # Queues
    task_routes={
        "app.tasks.orchestrator_tasks.execute_orchestrator": {
            "queue": "orchestrator_executions",
        },
    },

    task_queues=(
        Queue("orchestrator_executions", routing_key="orchestrator.execute"),
        Queue("orchestrator_management", routing_key="orchestrator.cancel"),
    ),
)
```

---

## Démarrage du Worker Celery

```bash
# Terminal 1: Démarrer le worker
cd /storage5/chat.api
source .venv/bin/activate
celery -A app.celery_app worker --loglevel=info -Q orchestrator_executions

# Terminal 2 (optionnel): Monitoring Flower
celery -A app.celery_app flower --port=5555
```

---

## Services et Leur Rôle

| Service | Rôle | Données |
|---------|------|---------|
| **Frontend (Vue.js 3)** | Interface utilisateur | Message, JWT, Session ID |
| **Backend API** | Gateway, Auth, Routing, Task Creation | Validation JWT, Session, Execution |
| **Celery Worker** | Traitement asynchrone des tâches longues | Tasks, Status updates, DB writes |
| **Redis** | Broker Celery, Cache, Sessions, Tokens | Task queue, OAuth tokens, Session history |
| **MCP Server** | Intelligence, Orchestration | Choix workflow, Token injection |
| **n8n** | Exécution workflows | HTTP calls, Data processing |
| **Gmail API** | Source données emails | Liste messages, Contenu |
| **LLM (OpenAI)** | Génération résumé | Prompt → Résumé structuré |
