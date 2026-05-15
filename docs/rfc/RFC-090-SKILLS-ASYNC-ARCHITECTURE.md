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

### 3.4 Plugin Discord — Alternative Redis Pub/Sub (recommandée)

**Problème avec le mode `discord_dm`** : Le bot Discord est un **client** (connecté au gateway Discord), pas un serveur HTTP. Il ne peut pas recevoir de callback `POST` entrant sans exposer un endpoint.

**Solution alternative** : Utiliser **Redis Pub/Sub** comme canal de notification.

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Discord   │       │    Redis    │       │     n8n     │
│     Bot     │       │  (Pub/Sub)  │       │   Workflow  │
└──────┬──────┘       └──────┬──────┘       └──────┬──────┘
       │                     │                     │
       │ 1. POST /webhook/claude-call-with-skills │
       │ ─────────────────────────────────────────>│
       │   { mode: "redis",                        │
       │     job_id: "job_abc",                    │
       │     redis_channel: "export:job_abc",      │
       │     channel_id, message_id }              │
       │                     │                     │
       │ 2. 202 Accepted + job_id                  │
       │ <─────────────────────────────────────────│
       │                     │                     │
       │ "⏳ En cours..."    │    [Anthropic       │
       │                     │     5-10 min]       │
       │                     │                     │
       │ 3. Subscribe        │                     │
       │ ───────────────────>│                     │
       │  "export:job_abc"   │                     │
       │                     │                     │
       │                     │  4. PUBLISH         │
       │                     │ <───────────────────│
       │                     │   "export:job_abc"  │
       │                     │   { success, files }│
       │                     │                     │
       │ 5. Receive message  │                     │
       │ <───────────────────│                     │
       │                     │                     │
       │ 6. Edit Discord msg │                     │
       │ "✅ Document prêt!" │                     │
```

**Avantages :**
- **Pas d'endpoint HTTP** sur le bot Discord (reste client-only)
- **Notification push** instantanée (pas de polling)
- **Découplage** : n8n et le bot communiquent via Redis
- **Scalable** : Plusieurs instances du bot peuvent écouter
- **Redis souvent déjà en place** pour cache/sessions

**Payload Plugin → n8n :**
```json
{
  "mode": "redis",
  "job_id": "job_abc123",
  "redis_channel": "export:job_abc123",
  "api_key": "sk-ant-...",
  "messages": [...],
  "container": { "skills": [{ "type": "anthropic", "skill_id": "pdf" }] },
  "metadata": {
    "discord_channel_id": "123456789",
    "discord_message_id": "987654321",
    "user_id": "discord_user_id",
    "tenant_id": "tenant_xyz"
  }
}
```

**Message Redis publié par n8n (succès) :**
```json
{
  "success": true,
  "job_id": "job_abc123",
  "channel_id": "123456789",
  "message_id": "987654321",
  "files": [{
    "filename": "Berakhot_2a.pdf",
    "download_url": "https://api.anthropic.com/v1/files/file_xxx/content",
    "mime_type": "application/pdf",
    "size_bytes": 45678
  }],
  "processing_time_ms": 320000
}
```

**Message Redis publié par n8n (erreur) :**
```json
{
  "success": false,
  "job_id": "job_abc123",
  "channel_id": "123456789",
  "message_id": "987654321",
  "error": "Anthropic Skills API timeout after 600s"
}
```

**Implémentation côté Plugin Discord :**

```python
# src/services/export_listener.py
import asyncio
import json
import redis.asyncio as aioredis
from discord.ext import commands

class ExportResultListener:
    """Écoute Redis pour les résultats d'export async."""

    def __init__(self, bot: commands.Bot, redis_url: str = "redis://localhost:6379"):
        self.bot = bot
        self.redis_url = redis_url
        self.redis = None
        self.pubsub = None
        self._task = None

    async def start(self):
        """Démarre l'écoute Redis pub/sub."""
        self.redis = aioredis.from_url(self.redis_url)
        self.pubsub = self.redis.pubsub()
        # S'abonner à tous les channels export:*
        await self.pubsub.psubscribe("export:*")
        self._task = asyncio.create_task(self._listen())

    async def stop(self):
        """Arrête l'écoute."""
        if self._task:
            self._task.cancel()
        if self.pubsub:
            await self.pubsub.unsubscribe()
        if self.redis:
            await self.redis.close()

    async def _listen(self):
        """Boucle d'écoute des messages Redis."""
        async for message in self.pubsub.listen():
            if message["type"] == "pmessage":
                try:
                    data = json.loads(message["data"])
                    await self._handle_export_result(data)
                except Exception as e:
                    logger.error(f"[ExportListener] Erreur traitement: {e}")

    async def _handle_export_result(self, data: dict):
        """Traite un résultat d'export reçu via Redis."""
        channel_id = int(data["channel_id"])
        message_id = int(data["message_id"])

        channel = self.bot.get_channel(channel_id)
        if not channel:
            logger.warning(f"Channel {channel_id} non trouvé")
            return

        try:
            message = await channel.fetch_message(message_id)
        except discord.NotFound:
            logger.warning(f"Message {message_id} non trouvé")
            return

        if data["success"]:
            # Télécharger le fichier et l'attacher
            file_info = data["files"][0]
            async with httpx.AsyncClient() as client:
                resp = await client.get(file_info["download_url"])
                file_bytes = resp.content

            discord_file = discord.File(
                io.BytesIO(file_bytes),
                filename=file_info["filename"]
            )

            await message.edit(
                content="✅ Document généré avec succès !",
                attachments=[discord_file]
            )
        else:
            await message.edit(
                content=f"❌ Erreur lors de la génération : {data.get('error', 'Erreur inconnue')}"
            )
```

**Intégration dans le bot (main.py ou setup) :**

```python
from src.services.export_listener import ExportResultListener

# Au démarrage du bot
@bot.event
async def on_ready():
    export_listener = ExportResultListener(bot, redis_url=config.redis_url)
    await export_listener.start()
    bot.export_listener = export_listener  # Garder une référence

# À l'arrêt
@bot.event
async def on_close():
    if hasattr(bot, 'export_listener'):
        await bot.export_listener.stop()
```

**Modification ExportView (soumet en mode async) :**

```python
# Dans ExportView.generate()
async def generate(self, interaction: discord.Interaction, format_type: str):
    # 1. Envoyer message "en cours"
    await interaction.response.defer(thinking=True)
    msg = await interaction.followup.send("⏳ Génération du document en cours...")

    job_id = f"export_{uuid.uuid4().hex[:12]}"

    # 2. Appeler n8n en mode async (retour immédiat)
    payload = {
        "mode": "redis",
        "job_id": job_id,
        "redis_channel": f"export:{job_id}",
        "api_key": self.api_key,
        "messages": [{"role": "user", "content": self._build_prompt()}],
        "container": {"skills": [{"type": "anthropic", "skill_id": format_type}]},
        "metadata": {
            "discord_channel_id": str(interaction.channel_id),
            "discord_message_id": str(msg.id),
            "user_id": str(interaction.user.id)
        }
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{self.n8n_base_url}/webhook/claude-call-with-skills",
            json=payload
        )

        if response.status_code != 202:
            await msg.edit(content="❌ Erreur lors de la soumission")
            return

    # 3. Le bot continue, Redis notifiera quand c'est prêt
    # (Le message sera édité par ExportResultListener)
```

**Workflow n8n à modifier :**

```
[Webhook Trigger]
       │
       ▼
[Switch: mode]
   ├── sync → [Appel Anthropic] → [Return response]
   ├── callback → [Appel Anthropic] → [HTTP POST callback_url]
   └── redis → [Return 202] → [Appel Anthropic async] → [Redis PUBLISH]
```

Le node **Redis** de n8n permet de faire `PUBLISH` sur un channel.

---

## 4. Résumé par équipe

| Équipe | Mode | Notification | Implémentation côté équipe |
|--------|------|--------------|---------------------------|
| **Plugin Discord** | `redis` (recommandé) | Redis Pub/Sub | Listener Redis + edit message |
| **Plugin Discord** | `discord_dm` (alt.) | Edit Message via webhook | Endpoint `/discord/edit-message` |
| **chatbot-core** | `callback` | POST callback + WebSocket | Endpoint `/skills/job/{id}/complete` |
| **MCP** | `callback` | POST callback (ou poll) | Handler callback local |

### Comparaison des modes pour Plugin Discord

| Critère | Mode `redis` | Mode `discord_dm` |
|---------|--------------|-------------------|
| Endpoint HTTP requis | ❌ Non | ✅ Oui |
| Dépendance | Redis | Aucune (mais bot doit être accessible) |
| Complexité plugin | Listener async | Serveur HTTP à ajouter |
| Découplage | ✅ Fort | ⚠️ Couplage direct n8n→bot |
| Scalabilité | ✅ Multi-instances | ⚠️ Single endpoint |
| **Recommandation** | ✅ **Préféré** | Alternative si pas de Redis |

---

## 5. Workflow n8n à implémenter

### 5.1 Input Schema unifié

```json
{
  "required": ["api_key", "messages", "container"],
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["sync", "callback", "discord_dm", "redis"],
      "default": "callback",
      "description": "sync = attendre (timeout risk), callback/discord_dm/redis = async"
    },
    "callback_url": {
      "type": "string",
      "description": "URL de callback (requis si mode=callback)"
    },
    "job_id": {
      "type": "string",
      "description": "ID unique du job (généré si absent)"
    },
    "redis_channel": {
      "type": "string",
      "description": "Channel Redis pour publier le résultat (requis si mode=redis)"
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
    "metadata": { "type": "object", "description": "Données passées au callback/redis (channel_id, message_id, etc.)" }
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

**Mode `redis` (recommandé) :**

| Composant | Description |
|-----------|-------------|
| `ExportResultListener` | Service async qui écoute Redis pub/sub `export:*` |
| `ExportView` | Modifié pour soumettre en mode async et stocker msg_id |

**Mode `discord_dm` (alternative) :**

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
REDIS_URL=redis://redis:6379/0  # Pour mode redis

# chatbot-core
N8N_WEBHOOK_SECRET=secret_256_bits_pour_hmac  # même secret

# Plugin Discord (mode redis - recommandé)
REDIS_URL=redis://redis:6379/0

# Plugin Discord (mode discord_dm - alternative)
DISCORD_EDIT_WEBHOOK_SECRET=secret_pour_auth_interne
```

---

## 8. Prochaines étapes

### Phase 1 - n8n (cette session)
- [ ] Modifier workflow `Claude - Call With Skills` pour mode async
- [ ] Ajouter branche `mode=redis` avec node Redis PUBLISH
- [ ] Créer endpoint polling `/skills-job-status`
- [ ] Ajouter signature HMAC aux callbacks (mode callback)

### Phase 2 - Plugin Discord (mode Redis recommandé)
- [ ] Créer `ExportResultListener` (écoute Redis pub/sub)
- [ ] Intégrer listener au démarrage du bot
- [ ] Modifier `ExportView` pour mode async (envoyer msg "⏳", appeler n8n, stocker msg_id dans metadata)
- [ ] Gérer le téléchargement du fichier depuis Anthropic URL
- [ ] Tester le flow complet

### Phase 2 bis - Plugin Discord (mode discord_dm - alternative)
- [ ] Créer endpoint `/discord/edit-message` (nécessite serveur HTTP)
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

## 10. Réponse équipe n8n (2026-05-15)

### Points validés ✅

1. **Mode `redis` comme option recommandée pour le plugin Discord** — Approuvé
2. **Pattern `psubscribe("export:*")`** — Standard, déjà utilisé dans MCP-Tools-Notify
3. **Payload avec `metadata`** — Flexible et extensible
4. **Implémentation `ExportResultListener`** — Code propre et bien structuré

### Points à clarifier ⚠️

#### 1. Authentification pour télécharger les fichiers Anthropic

L'URL `download_url` de l'API Anthropic nécessite un header `x-api-key` pour télécharger le fichier.

**Options :**

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. Inclure `api_key` dans le message Redis | Simple | Clé API circule dans Redis |
| B. n8n télécharge le fichier et publie le contenu (base64) | Sécurisé | Limite ~8MB, charge n8n |
| C. n8n télécharge et uploade vers S3/B2, publie l'URL | Sécurisé, pas de limite | Dépendance stockage externe |

**Recommandation n8n** : **Option C** (stockage permanent) pour les fichiers > 1MB, **Option B** (base64) pour les petits fichiers.

```json
// Message Redis avec fichier base64 (< 1MB)
{
  "success": true,
  "job_id": "job_abc123",
  "files": [{
    "filename": "rapport.docx",
    "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "size_bytes": 45678,
    "content_base64": "UEsDBBQAAAAIAA..."
  }]
}

// Message Redis avec URL permanente (> 1MB)
{
  "success": true,
  "job_id": "job_abc123",
  "files": [{
    "filename": "presentation.pptx",
    "mime_type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "size_bytes": 5234567,
    "permanent_url": "https://storage.azy.solutions/exports/job_abc123/presentation.pptx",
    "expires_at": "2026-05-22T12:00:00Z"
  }]
}
```

#### 2. Expiration des fichiers Anthropic (24h)

Les fichiers générés par Anthropic expirent après 24h. Si le bot est temporairement down ou si le message Redis est perdu, le fichier devient inaccessible.

**Solution n8n** : Toujours télécharger le fichier côté n8n avant de publier sur Redis. Cela garantit que le plugin reçoit soit :
- Le contenu directement (base64)
- Une URL permanente (stockage interne)

### Implémentation n8n à faire

```
[Webhook Trigger]
       │
       ▼
[Validate Input + Generate job_id]
       │
       ▼
[Switch: mode]
   ├── sync → [Appel Anthropic] → [Return response direct]
   │
   ├── callback → [Return 202]
   │              → [Appel Anthropic]
   │              → [HTTP POST callback_url avec HMAC]
   │
   └── redis → [Return 202]
               → [Appel Anthropic]
               → [Download file from Anthropic]
               → [If > 1MB: Upload to storage]
               → [Redis PUBLISH export:{job_id}]
```

### Variables d'environnement à ajouter

```bash
# n8n - pour mode redis
REDIS_HOST=redis.local
REDIS_PORT=6379
REDIS_DB=0

# n8n - pour stockage des fichiers volumineux (optionnel)
STORAGE_PROVIDER=b2  # ou s3
B2_BUCKET_NAME=azy-exports
B2_APPLICATION_KEY_ID=...
B2_APPLICATION_KEY=...
```

### Tâches n8n - Phase 1

- [ ] Modifier workflow `Claude - Call With Skills` pour supporter `mode: "redis"`
- [ ] Ajouter node Redis PUBLISH dans le workflow
- [ ] Implémenter téléchargement fichier Anthropic avant publication
- [ ] Gérer les fichiers > 1MB (upload vers stockage externe)
- [ ] Créer endpoint `/webhook/skills-job-status` pour polling (fallback)

---

## 11. Patterns existants à réutiliser (2026-05-15)

L'analyse des workflows existants révèle **3 patterns réutilisables** qui couvrent 100% des besoins de cette RFC :

### 11.1 Pattern Job Queue Async — `LEARNING_-_Generate_Dispatcher.json`

**Exactement ce dont nous avons besoin pour la réponse immédiate.**

```javascript
// Génération du job_id (workflows/LEARNING_-_Generate_Dispatcher.json:37)
const job_id = `${jobType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Stockage Redis avec TTL
{
  "operation": "set",
  "key": "=job:learning:{{ $json.job_id }}",
  "value": "={{ JSON.stringify({ job_id, type, status: 'pending', ... }) }}",
  "expire": true,
  "ttl": 3600  // 1 heure
}

// Push vers queue
{
  "operation": "push",
  "list": "queue:learning",
  "messageData": "={{ job_id }}",
  "tail": true
}
```

**Réutilisation** : Copier la structure de validation + génération job_id + stockage Redis.

### 11.2 Pattern Redis Streams (XADD) — `MCP_-_Tools_Notify.json`

**Alternative au Pub/Sub pour la notification plugin.**

```javascript
// Node Redis XADD (workflows/MCP_-_Tools_Notify.json:56-99)
{
  "operation": "xAdd",
  "key": "tools:events:stream",
  "credentials": {
    "redis": {
      "id": "notifications-redis",
      "name": "Redis Notifications (DB 5)"
    }
  },
  "fieldsUi": {
    "fieldValues": [
      { "fieldName": "event", "fieldValue": "={{ $json.event }}" },
      { "fieldName": "action", "fieldValue": "={{ $json.action }}" },
      { "fieldName": "timestamp", "fieldValue": "={{ $json.timestamp }}" }
    ]
  }
}
```

**Credentials déjà configurées** : `notifications-redis` (Redis DB 5)

### 11.3 Pattern HTTP Callback + Discord — `MCP-Document-Callback.json`

**Pour le mode callback avec notification Discord directe.**

```javascript
// Envoi notification Discord (workflows/MCP-Document-Callback.json:165-186)
{
  "method": "POST",
  "url": "=https://discord.com/api/v10/channels/{{ $json.channel_id }}/messages",
  "headerParameters": {
    "parameters": [
      { "name": "Authorization", "value": "=Bot {{ $env.DISCORD_TOKEN }}" }
    ]
  }
}
```

### 11.4 Tableau de mapping patterns → besoins RFC-090

| Besoin RFC-090 | Pattern existant | Workflow source | Réutilisation |
|----------------|------------------|-----------------|---------------|
| Réponse immédiate 202 + job_id | Job Queue Async | `LEARNING_-_Generate_Dispatcher` | 100% |
| Stockage job Redis + TTL | Redis SET + expire | `LEARNING_-_Generate_Dispatcher` | 100% |
| Mode `redis` (Plugin) | Redis XADD Stream | `MCP_-_Tools_Notify` | 90% |
| Mode `callback` (chatbot-core) | HTTP Callback | `MCP-Document-Callback` | 80% |
| Notification Discord | Discord API REST | `MCP-Document-Callback` | 100% |
| Credentials Redis | `notifications-redis` (DB 5) | `MCP_-_Tools_Notify` | 100% |

---

## 12. Impact équipe plugin Torah (2026-05-15)

### 12.1 Clarification : Redis Streams vs Redis Pub/Sub

L'analyse des workflows existants révèle que **n8n utilise Redis Streams (XADD)** et non Redis Pub/Sub (PUBLISH).

**⚠️ Point d'architecture important :**

```
n8n = PRODUCTEUR (XADD)    →    Redis Streams    ←    Plugin = CONSOMMATEUR (XREAD)
```

- **n8n** ne fait que **XADD** (écriture) — c'est supporté nativement par le node Redis
- **Le plugin** fait **XREAD** (lecture bloquante) dans un **service background permanent**
- n8n n'a pas de capacité de listener permanent (c'est un système basé sur triggers)

| Critère | Redis Pub/Sub (section 3.4) | Redis Streams (pattern existant) |
|---------|----------------------------|----------------------------------|
| Persistance | ❌ Non (fire & forget) | ✅ Oui (messages stockés) |
| Consumer groups | ❌ Non | ✅ Oui (multi-consumers) |
| Replay possible | ❌ Non | ✅ Oui (XREAD depuis un ID) |
| Accusé de réception | ❌ Non | ✅ Oui (XACK) |
| **Commande côté n8n** | PUBLISH | **XADD** ✅ supporté |
| **Commande côté plugin** | SUBSCRIBE/PSUBSCRIBE | **XREAD** (service background) |

**Recommandation révisée** : Utiliser **Redis Streams (XADD)** au lieu de Pub/Sub pour la fiabilité.

**Preuve que n8n supporte XADD** — workflow existant `MCP_-_Tools_Notify.json` :
```javascript
{
  "operation": "xAdd",
  "key": "tools:events:stream",
  "credentials": { "redis": { "id": "notifications-redis", "name": "Redis Notifications (DB 5)" } }
}
```

### 12.2 Impact pour le plugin Torah

#### ✅ Pas de changement architectural majeur

La RFC-090 section 3.4 reste valide, mais avec une modification technique :

| Avant (Pub/Sub proposé) | Après (Streams recommandé) |
|-------------------------|----------------------------|
| `SUBSCRIBE export:*` | `XREAD STREAMS skills:results:stream` |
| Pattern matching | Consumer groups |
| Messages perdus si offline | Messages persistés, replay possible |

#### 📝 Modifications mineures côté plugin

```python
# AVANT (Pub/Sub) — Section 3.4 originale
await self.pubsub.psubscribe("export:*")
async for message in self.pubsub.listen():
    # ...

# APRÈS (Streams) — Pattern aligné sur MCP-Tools-Notify
last_id = "0"
while True:
    messages = await self.redis.xread(
        {"skills:results:stream": last_id},
        block=5000  # Block 5 secondes
    )
    for stream, entries in messages:
        for msg_id, fields in entries:
            await self._handle_export_result(fields)
            last_id = msg_id
```

#### 🔄 Avantages pour le plugin

1. **Fiabilité** : Si le bot redémarre, il peut reprendre là où il s'était arrêté
2. **Multi-instances** : Consumer groups permettent plusieurs bots sans duplication
3. **Debug** : Messages visibles dans Redis (XRANGE) pour diagnostiquer

### 12.3 Stream name proposé

```
skills:results:stream
```

Format du message (champs Redis Stream) :

| Field | Type | Description |
|-------|------|-------------|
| `job_id` | string | ID unique du job |
| `success` | string | "true" ou "false" |
| `channel_id` | string | Discord channel ID |
| `message_id` | string | Discord message ID |
| `files` | string (JSON) | `[{filename, mime_type, content_base64 ou permanent_url}]` |
| `error` | string | Message d'erreur si échec |
| `timestamp` | string | ISO 8601 |

### 12.4 Résumé de l'impact plugin Torah

| Aspect | Impact | Action requise |
|--------|--------|----------------|
| Architecture | ✅ Aucun | - |
| Listener Redis | ⚠️ Mineur | Remplacer Pub/Sub par XREAD |
| Code ExportView | ✅ Aucun | Déjà prévu section 3.4 |
| Consumer groups | 🆕 Bonus | Optionnel, permet multi-instances |
| Tests | ⚠️ Mineur | Adapter les mocks Redis |

**Conclusion** : L'équipe plugin n'a qu'une **modification mineure** (listener Redis Stream au lieu de Pub/Sub). Le reste de l'implémentation décrite en section 3.4 reste valide.

---

## 13. Problème XADD non supporté par n8n natif (2026-05-15)

### 13.1 Constat

Le node Redis natif de n8n **ne supporte PAS** l'opération `XADD` (Redis Streams).

**Opérations supportées nativement :**
| Opération | Supportée | Usage |
|-----------|-----------|-------|
| `set` / `get` / `delete` | ✅ | Key-value |
| `push` / `pop` | ✅ | Lists (queues) |
| `publish` | ✅ | Pub/Sub |
| `keys` / `incr` / `info` | ✅ | Utilitaires |
| **`xAdd` (Streams)** | ❌ | **Non supporté** |

**Source** : [n8n Redis node documentation](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.redis/)

### 13.2 Comparaison des alternatives

| Critère | Redis LIST (RPUSH) | Redis Streams (XADD) |
|---------|-------------------|----------------------|
| Persistance | ✅ Oui | ✅ Oui |
| Multi-consumers | ❌ Non (1 seul) | ✅ Oui (consumer groups) |
| Replay si crash | ❌ Non (message poppé) | ✅ Oui (reprendre depuis last_id) |
| Audit/debug | ❌ Messages disparus | ✅ XRANGE pour historique |
| **Supporté n8n natif** | ✅ Oui | ❌ Non |

**Décision** : Redis Streams est requis pour un système robuste (multi-instances plugin, audit, replay).

### 13.3 Solutions de contournement

#### Option A : Node communautaire Redis Enhanced ⭐ RECOMMANDÉE

Installer [`@vicenterusso/n8n-nodes-redis-enhanced`](https://www.npmjs.com/package/@vicenterusso/n8n-nodes-redis-enhanced).

| Avantage | Détail |
|----------|--------|
| ✅ Intégration native | Apparaît dans l'UI n8n |
| ✅ 35+ opérations | XADD, XREAD, XRANGE, XLEN, etc. |
| ✅ Maintenance active | Package npm mis à jour |

| Inconvénient | Détail |
|--------------|--------|
| ⚠️ Dépendance externe | À maintenir avec n8n |

#### Option B : Execute Command (redis-cli)

Utiliser le node **Execute Command** pour appeler `redis-cli XADD ...`.

| Avantage | Inconvénient |
|----------|--------------|
| ✅ Pas de dépendance npm | ⚠️ redis-cli requis sur serveur |
| ✅ Simple | ⚠️ Escaping JSON complexe |

#### Option C : Micro-service intermédiaire

Service Python/FastAPI qui reçoit HTTP et fait XADD.

| Avantage | Inconvénient |
|----------|--------------|
| ✅ Contrôle total | ⚠️ Service supplémentaire à déployer |

**Décision finale** : **Option A** (node communautaire).

---

## 14. Installation du node Redis Enhanced

### 14.1 Architecture actuelle n8n (Docker)

```
docker/
├── docker-compose.yml
└── .env.local

custom-nodes/
├── package.json           ← Dépendances des nodes custom
├── n8n-nodes-*            ← Nodes développés en interne
└── node_modules/          ← Dépendances installées
```

Le docker-compose monte `custom-nodes/` vers `/home/node/.n8n/nodes` dans le container.

### 14.2 Étape 1 : Ajouter la dépendance

Modifier `custom-nodes/package.json` :

```json
{
  "name": "installed-nodes",
  "private": true,
  "dependencies": {
    "n8n-nodes-calendar-dynamic": "file:./n8n-nodes-calendar-dynamic",
    "n8n-nodes-classroom-dynamic": "file:./n8n-nodes-classroom-dynamic",
    "n8n-nodes-contacts-dynamic": "file:./n8n-nodes-contacts-dynamic",
    "n8n-nodes-drive-dynamic": "file:./n8n-nodes-drive-dynamic",
    "n8n-nodes-gemini-image": "file:./n8n-nodes-gemini-image",
    "n8n-nodes-gmail-dynamic": "file:./n8n-nodes-gmail-dynamic",
    "n8n-nodes-google-genai-core": "file:./n8n-nodes-google-genai-core",
    "n8n-nodes-graph-exporter": "file:./n8n-nodes-graph-exporter",
    "n8n-nodes-graph-transformer": "file:./n8n-nodes-graph-transformer",
    "n8n-nodes-knowledge-graph": "file:./n8n-nodes-knowledge-graph",
    "n8n-nodes-veo-video": "file:./n8n-nodes-veo-video",
    "n8n-nodes-video-transcription": "file:./n8n-nodes-video-transcription",
    "@vicenterusso/n8n-nodes-redis-enhanced": "^1.0.0"
  }
}
```

### 14.3 Étape 2 : Installer les dépendances

```bash
cd /storage6/pi6/n8n-workflows/custom-nodes
npm install
```

### 14.4 Étape 3 : Redémarrer n8n (Docker)

```bash
cd /storage6/pi6/n8n-workflows/docker
docker compose restart n8n
```

**Note** : Si n8n tourne via **pm2** (autre installation), utiliser :
```bash
pm2 restart n8n
```

### 14.5 Étape 4 : Vérifier l'installation

Dans l'UI n8n, rechercher "Redis Enhanced" dans les nodes disponibles. Les opérations XADD, XREAD, etc. doivent être disponibles.

---

## 15. Prochaines étapes révisées

### Phase 1 - n8n (immédiat)

- [ ] **Installer node Redis Enhanced** (section 14)
- [ ] Créer workflow `Claude - Call With Skills Async` basé sur patterns existants
- [ ] Réutiliser structure de `LEARNING_-_Generate_Dispatcher` pour job queue
- [ ] Utiliser credentials `notifications-redis` (DB 5) existantes
- [ ] Implémenter Redis XADD vers `skills:results:stream`
- [ ] Télécharger fichiers Anthropic avant publication (éviter expiration 24h)

### Phase 2 - Plugin Torah (après n8n)

- [ ] Implémenter listener Redis Streams (XREAD/XREADGROUP)
- [ ] Optionnel : Implémenter consumer groups pour multi-instances
- [ ] Reste de l'implémentation section 3.4 inchangé

### Phase 3 - chatbot-core et MCP

- [ ] Inchangé (mode callback HTTP)

---

_Créé : 2026-05-15_
_Màj : 2026-05-15 (patterns existants + impact plugin)_
_Équipes : n8n, MCP, chatbot-core, plugin_
