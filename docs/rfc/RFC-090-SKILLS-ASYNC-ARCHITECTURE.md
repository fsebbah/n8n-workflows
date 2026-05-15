# RFC-090 — Architecture Async pour Anthropic Skills API

**Date** : 2026-05-15
**Statut** : Draft
**Auteur** : Équipe n8n + Claude
**Équipes concernées** : MCP, chatbot-core, plugin (Discord)
**Priorité** : Haute — Skills API timeout à 5+ minutes

---

## 1. Contexte

L'API Anthropic Skills (génération de documents .docx, .xlsx, .pptx) peut prendre **plus de 5 minutes** pour générer un document complexe. Le timeout HTTP standard (30s-300s) ne suffit pas.

**Erreur actuelle :**
```json
{
  "error": {
    "code": "ANTHROPIC_ERROR",
    "message": "timeout of 300000ms exceeded"
  }
}
```

**Solution** : Mode asynchrone avec notification du résultat.

---

## 2. Architecture proposée

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           APPELANTS                                       │
├────────────────────┬─────────────────────┬───────────────────────────────┤
│      PLUGIN        │     CHATBOT-CORE    │           MCP                 │
│   (Discord Bot)    │    (Backend API)    │    (Claude Code/Desktop)      │
└─────────┬──────────┴──────────┬──────────┴────────────────┬──────────────┘
          │                     │                           │
          │ DM + Edit Message   │ Callback URL              │ Callback URL
          │                     │                           │
          ▼                     ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    n8n Webhook (claude-call-with-skills)                  │
│                                                                          │
│  1. Validation input                                                     │
│  2. Réponse immédiate 202 Accepted + job_id                             │
│  3. Appel Anthropic Skills API (async, peut durer > 5 min)              │
│  4. Notification du résultat selon le mode                               │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Modes de notification par équipe

### 3.1 Plugin Discord — Mode DM + Edit Message

**Pattern recommandé** (validé RFC batch-asynchronev2) : Le bot Discord **édite son propre message**.

```
┌─────────────┐                  ┌─────────────┐                  ┌─────────────┐
│   User      │                  │   Discord   │                  │    n8n      │
│  Discord    │                  │     Bot     │                  │   Webhook   │
└──────┬──────┘                  └──────┬──────┘                  └──────┬──────┘
       │                                │                                │
       │  "Génère un doc Word sur X"    │                                │
       │ ──────────────────────────────>│                                │
       │                                │                                │
       │  "⏳ Génération en cours..."   │   POST /claude-call-with-skills│
       │ <──────────────────────────────│ ──────────────────────────────>│
       │      (msg_id stocké)           │   { mode: "discord_dm",        │
       │                                │     discord_msg_id: "123...",  │
       │                                │     discord_channel_id: "456"} │
       │                                │                                │
       │                                │         202 + job_id           │
       │                                │ <──────────────────────────────│
       │                                │                                │
       │        [5-10 minutes]          │        [Processing...]         │
       │                                │                                │
       │                                │   POST /discord/edit-message   │
       │  Message édité:                │ <──────────────────────────────│
       │  "✅ Document généré!          │   { msg_id, channel_id,        │
       │   📄 [Télécharger DOCX]"       │     content, files }           │
       │ <──────────────────────────────│                                │
       │                                │                                │
```

**Avantages :**
- Zéro polling (pas de charge serveur)
- Notification instantanée dans le DM
- UX familière (le message se met à jour)

**Payload n8n → Plugin :**
```json
{
  "mode": "discord_dm",
  "discord_channel_id": "123456789",
  "discord_message_id": "987654321",
  "api_key": "sk-ant-...",
  "messages": [...],
  "container": { "skills": [{ "type": "anthropic", "skill_id": "docx" }] },
  "metadata": {
    "user_id": "discord_user_id",
    "tenant_id": "tenant_xyz"
  }
}
```

**Callback n8n → Discord Bot :**
```json
POST /webhook/discord/edit-message
{
  "channel_id": "123456789",
  "message_id": "987654321",
  "content": "✅ Document généré avec succès !",
  "embeds": [{
    "title": "📄 Rapport Q1 2026",
    "description": "Votre document Word est prêt",
    "color": 5763719
  }],
  "files": [{
    "filename": "rapport-q1-2026.docx",
    "download_url": "https://api.anthropic.com/v1/files/file_xxx/content",
    "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }]
}
```

---

### 3.2 chatbot-core (Backend API) — Mode Callback URL

**Pattern RFC-040** (production) : Callback HTTP avec signature HMAC.

```
┌─────────────┐                  ┌─────────────┐                  ┌─────────────┐
│  Frontend   │                  │  chat.api   │                  │    n8n      │
│   (React)   │                  │  (FastAPI)  │                  │   Webhook   │
└──────┬──────┘                  └──────┬──────┘                  └──────┬──────┘
       │                                │                                │
       │  "Génère un rapport"           │                                │
       │ ──────────────────────────────>│                                │
       │                                │                                │
       │      { job_id, status }        │   POST /claude-call-with-skills│
       │ <──────────────────────────────│ ──────────────────────────────>│
       │      (polling possible)        │   { mode: "callback",          │
       │                                │     callback_url: ".../complete",│
       │                                │     job_id: "job_abc123" }     │
       │                                │                                │
       │                                │         202 + job_id           │
       │                                │ <──────────────────────────────│
       │                                │                                │
       │        [5-10 minutes]          │        [Processing...]         │
       │                                │                                │
       │                                │   POST callback_url            │
       │                                │ <──────────────────────────────│
       │                                │   X-N8N-Signature: hmac...     │
       │                                │   { success, job_id, files }   │
       │      WebSocket/SSE push        │                                │
       │ <──────────────────────────────│                                │
       │  "Document prêt!"              │                                │
       │                                │                                │
```

**Payload n8n → chat.api :**
```json
{
  "mode": "callback",
  "callback_url": "https://api.azy.solutions/api/v1/skills/job/{job_id}/complete",
  "job_id": "job_abc123",
  "api_key": "sk-ant-...",
  "messages": [...],
  "container": { "skills": [{ "type": "anthropic", "skill_id": "docx" }] },
  "metadata": {
    "user_id": "user_xyz",
    "tenant_id": "tenant_xyz",
    "conversation_id": "conv_123"
  }
}
```

**Callback n8n → chat.api :**
```json
POST https://api.azy.solutions/api/v1/skills/job/job_abc123/complete
Headers:
  X-N8N-Signature: a1b2c3d4e5f6...  (HMAC-SHA256)
  Content-Type: application/json

Body:
{
  "success": true,
  "job_id": "job_abc123",
  "status": "completed",
  "data": {
    "content": [{ "type": "text", "text": "Document créé avec succès" }],
    "files": [{
      "file_id": "file_xxx",
      "filename": "rapport.docx",
      "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "size_bytes": 45678,
      "download_url": "https://api.anthropic.com/v1/files/file_xxx/content"
    }],
    "usage": { "input_tokens": 1500, "output_tokens": 2300 }
  },
  "meta": {
    "processing_time_ms": 320000,
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514"
  }
}
```

**Endpoint chat.api à implémenter :**
```python
@router.post("/api/v1/skills/job/{job_id}/complete")
async def skills_job_complete(
    job_id: str,
    request: Request,
    x_n8n_signature: str = Header(...)
):
    # 1. Vérifier signature HMAC
    body = await request.body()
    expected = hmac.new(N8N_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(x_n8n_signature, expected):
        raise HTTPException(401, "Invalid signature")

    # 2. Parser le body
    data = await request.json()

    # 3. Télécharger le fichier depuis Anthropic et uploader vers stockage
    for file in data["data"]["files"]:
        file_content = download_from_anthropic(file["download_url"], api_key)
        uploaded_url = upload_to_storage(file_content, file["filename"])
        # Mettre à jour l'URL dans la réponse

    # 4. Mettre à jour le job en DB
    await update_job_status(job_id, "completed", data)

    # 5. Notifier le frontend via WebSocket/SSE
    await notify_user(data["metadata"]["user_id"], data)

    return {"status": "ok"}
```

---

### 3.3 MCP (Claude Code/Desktop) — Mode Callback URL + Polling

**Pattern hybride** : Callback pour notification + Polling pour robustesse.

```
┌─────────────┐                  ┌─────────────┐                  ┌─────────────┐
│ Claude Code │                  │  MCP Server │                  │    n8n      │
│  (Desktop)  │                  │   (Local)   │                  │   Webhook   │
└──────┬──────┘                  └──────┬──────┘                  └──────┬──────┘
       │                                │                                │
       │  tool_call: create_document    │                                │
       │ ──────────────────────────────>│                                │
       │                                │                                │
       │  { status: "processing",       │   POST /claude-call-with-skills│
       │    job_id, poll_url }          │ ──────────────────────────────>│
       │ <──────────────────────────────│   { mode: "callback",          │
       │                                │     callback_url: "mcp/...",   │
       │                                │     job_id: "mcp_job_xyz" }    │
       │                                │                                │
       │                                │         202 + job_id           │
       │                                │ <──────────────────────────────│
       │                                │                                │
       │  [MCP peut poller]             │        [Processing...]         │
       │  GET /job/{id}/status          │                                │
       │ ──────────────────────────────>│                                │
       │  { status: "processing" }      │                                │
       │ <──────────────────────────────│                                │
       │                                │                                │
       │        [5-10 minutes]          │                                │
       │                                │                                │
       │                                │   POST callback (ou poll OK)   │
       │  tool_result: { files: [...] } │ <──────────────────────────────│
       │ <──────────────────────────────│                                │
       │                                │                                │
```

**Payload MCP → n8n :**
```json
{
  "mode": "callback",
  "callback_url": "http://localhost:3000/mcp/skills/complete",
  "job_id": "mcp_job_xyz",
  "api_key": "sk-ant-...",
  "messages": [
    { "role": "user", "content": "Crée un document Word professionnel..." }
  ],
  "container": {
    "skills": [{ "type": "anthropic", "skill_id": "docx", "version": "latest" }]
  }
}
```

**Réponse immédiate MCP (tool_result partiel) :**
```json
{
  "status": "processing",
  "job_id": "mcp_job_xyz",
  "message": "Document en cours de génération (peut prendre plusieurs minutes)...",
  "poll_url": "http://pi6.local:5678/webhook/skills-job-status?job_id=mcp_job_xyz",
  "estimated_time_seconds": 300
}
```

---

## 4. Résumé par équipe

| Équipe | Mode | Notification | Implémentation côté équipe |
|--------|------|--------------|---------------------------|
| **Plugin Discord** | `discord_dm` | Edit Message via webhook | Endpoint `/discord/edit-message` |
| **chatbot-core** | `callback` | POST callback + WebSocket | Endpoint `/skills/job/{id}/complete` |
| **MCP** | `callback` | POST callback (ou poll) | Handler callback local |

---

## 5. Workflow n8n à implémenter

### 5.1 Input Schema unifié

```json
{
  "required": ["api_key", "messages", "container"],
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["sync", "callback", "discord_dm"],
      "default": "callback",
      "description": "sync = attendre (timeout risk), callback = async"
    },
    "callback_url": {
      "type": "string",
      "description": "URL de callback (requis si mode=callback)"
    },
    "job_id": {
      "type": "string",
      "description": "ID unique du job (généré si absent)"
    },
    "discord_channel_id": {
      "type": "string",
      "description": "Requis si mode=discord_dm"
    },
    "discord_message_id": {
      "type": "string",
      "description": "Message à éditer (requis si mode=discord_dm)"
    },
    "api_key": { "type": "string" },
    "model": { "type": "string", "default": "claude-sonnet-4-20250514" },
    "messages": { "type": "array" },
    "container": {
      "skills": [{ "type": "anthropic", "skill_id": "docx|xlsx|pptx|pdf" }]
    },
    "metadata": { "type": "object" }
  }
}
```

### 5.2 Réponse immédiate (202 Accepted)

```json
{
  "status": "processing",
  "job_id": "job_abc123",
  "message": "Document generation started",
  "estimated_time_seconds": 300,
  "poll_url": "/webhook/skills-job-status?job_id=job_abc123"
}
```

### 5.3 Callback signature HMAC

```javascript
const crypto = require('crypto');
const secret = process.env.N8N_WEBHOOK_SECRET;
const body = JSON.stringify(callbackPayload);
const signature = crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');

// Header: X-N8N-Signature: {signature}
```

---

## 6. Endpoints à créer

### 6.1 n8n (équipe n8n)

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/webhook/claude-call-with-skills` | POST | Point d'entrée principal (existant, à modifier) |
| `/webhook/skills-job-status` | GET | Polling status du job |

### 6.2 Plugin Discord (équipe plugin)

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/webhook/discord/edit-message` | POST | Reçoit le callback n8n, édite le message Discord |

### 6.3 chatbot-core (équipe chatbot-core)

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/v1/skills/job/{job_id}/complete` | POST | Reçoit le callback n8n avec signature HMAC |
| `/api/v1/skills/job/{job_id}` | GET | (optionnel) Polling status |

---

## 7. Variables d'environnement

```bash
# n8n
N8N_WEBHOOK_SECRET=secret_256_bits_pour_hmac

# chatbot-core
N8N_WEBHOOK_SECRET=secret_256_bits_pour_hmac  # même secret

# Plugin Discord
DISCORD_EDIT_WEBHOOK_SECRET=secret_pour_auth_interne
```

---

## 8. Prochaines étapes

### Phase 1 - n8n (cette session)
- [ ] Modifier workflow `Claude - Call With Skills` pour mode async
- [ ] Créer endpoint polling `/skills-job-status`
- [ ] Ajouter signature HMAC aux callbacks

### Phase 2 - Plugin Discord
- [ ] Créer endpoint `/discord/edit-message`
- [ ] Modifier le handler de commande pour stocker `msg_id`
- [ ] Tester le flow complet

### Phase 3 - chatbot-core
- [ ] Créer endpoint `/api/v1/skills/job/{id}/complete`
- [ ] Implémenter vérification HMAC
- [ ] Télécharger fichiers Anthropic → stockage interne
- [ ] Notification WebSocket/SSE

### Phase 4 - MCP
- [ ] Adapter le tool `create_document` pour mode async
- [ ] Implémenter handler callback local
- [ ] Afficher progress à l'utilisateur

---

## 9. Questions ouvertes

| # | Question | Options | Décision |
|---|----------|---------|----------|
| 1 | Timeout max Anthropic Skills | 5min / 10min / 15min | ❓ À mesurer |
| 2 | Stockage fichiers générés | Anthropic (24h) / S3 / B2 | ❓ Selon équipe |
| 3 | Retry callback si échec | 3x avec backoff / abandon | ❓ |
| 4 | Rate limit génération | 3 jobs/user concurrent | ❓ |

---

_Créé : 2026-05-15_
_Équipes : n8n, MCP, chatbot-core, plugin_
