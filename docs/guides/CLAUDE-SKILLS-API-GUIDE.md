# Guide d'utilisation des Workflows Claude Skills API

> Documentation pour l'équipe Plugin Torah
> Version: 2.0 | Date: 2026-05-15

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Endpoint principal](#endpoint-principal)
4. [Écoute des résultats (Redis)](#écoute-des-résultats-redis)
5. [Skills disponibles](#skills-disponibles)
6. [Exemples de code](#exemples-de-code)
7. [Gestion des erreurs](#gestion-des-erreurs)

---

## Vue d'ensemble

Les workflows Claude permettent d'exécuter des **Skills** (génération DOCX, PDF, code, etc.) via l'API Anthropic. La génération de documents peut prendre plusieurs minutes, c'est pourquoi nous utilisons un **pattern asynchrone** avec notification via **Redis Streams**.

### Pourquoi Redis au lieu de HTTP Callback ?

| Mode | Avantage | Cas d'usage |
|------|----------|-------------|
| ~~HTTP Callback~~ | Requiert un serveur HTTP | ❌ Pas adapté aux bots client-only |
| **Redis Streams** | **Client-only compatible** | ✅ Discord bots, Celery workers |

Votre bot Discord peut écouter Redis sans exposer de serveur HTTP.

---

## Architecture

```
┌─────────────────┐     POST /webhook/claude-call-with-skills
│   Plugin Torah  │ ─────────────────────────────────────────►┌──────────────┐
│  (Discord Bot)  │      { redis_channel: "llm:results:xxx" } │     n8n      │
└─────────────────┘ ◄──── 202 { batch_id, redis_channel }     │   Workflow   │
        │                                                     └──────┬───────┘
        │                                                            │
        │                                                            ▼
        │                                               ┌────────────────────┐
        │                                               │   Anthropic API    │
        │                                               │   (Batch Queue)    │
        │                                               └────────────────────┘
        │                                                            │
        │                                                   (traitement ~1-10min)
        │                                                            │
        │         XREAD redis_channel                                ▼
        │ ◄──────────────────────────────────────────────┌──────────────────┐
        ▼              (Redis Stream)                    │  Batch Poller    │
┌─────────────────┐                                      │  (Cron 30s)      │
│  Celery Worker  │ ─► Traite les résultats              └──────────────────┘
│  ou Bot Discord │                                               │
└─────────────────┘                                               │
                                                                  ▼ XADD
                                                         ┌──────────────────┐
                                                         │      Redis       │
                                                         │  (host3.local)   │
                                                         └──────────────────┘
```

---

## Endpoint principal

### `POST /webhook/claude-call-with-skills`

**URL complète:** `http://pi6.local:5678/webhook/claude-call-with-skills`

#### Paramètres requis

| Paramètre | Type | Description |
|-----------|------|-------------|
| `api_key` | string | Clé API Anthropic |
| `messages` | array | Messages conversation (format Claude) |
| `container` | object | Configuration des skills |

#### Paramètres optionnels

| Paramètre | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | `claude-sonnet-4-20250514` | Modèle Claude |
| `redis_channel` | string | `llm:results:{correlation_id}` | **Channel Redis pour les résultats** |
| `system` | string | null | System prompt |
| `max_tokens` | integer | 16000 | Tokens max |
| `correlation_id` | string | auto-généré | ID de suivi |
| `metadata` | object | {} | Données custom (transmises dans résultat) |

#### Exemple de requête

```json
{
  "api_key": "sk-ant-xxx",
  "model": "claude-sonnet-4-20250514",
  "system": "Tu es un assistant qui génère des documents Torah.",
  "messages": [
    {
      "role": "user",
      "content": "Génère un document DOCX contenant la traduction du chapitre Bereshit 1."
    }
  ],
  "container": {
    "skills": [
      {
        "type": "anthropic",
        "skill_id": "docx"
      }
    ]
  },
  "redis_channel": "torah:documents:results",
  "correlation_id": "torah-bereshit-001",
  "metadata": {
    "book": "Bereshit",
    "chapter": 1,
    "user_id": "user-123",
    "discord_channel_id": "123456789"
  }
}
```

#### Réponse immédiate (202 Accepted)

```json
{
  "status": "processing",
  "batch_id": "msgbatch_01abc123def456",
  "correlation_id": "torah-bereshit-001",
  "redis_channel": "torah:documents:results",
  "message": "Batch submitted. Results will be published to redis_channel when ready.",
  "submitted_at": "2026-05-15T18:30:00.000Z"
}
```

---

## Écoute des résultats (Redis)

### Format du message Redis (XADD)

Quand le batch est terminé, le **Batch Poller** publie sur votre `redis_channel` :

```json
{
  "event": "batch_completed",
  "success": "true",
  "correlation_id": "torah-bereshit-001",
  "batch_id": "msgbatch_01abc123def456",
  "content": "[{\"type\":\"text\",\"text\":\"Document généré...\"}]",
  "files": "[{\"filename\":\"bereshit_1.docx\",\"media_type\":\"application/vnd.openxmlformats-officedocument.wordprocessingml.document\",\"data\":\"UEsDB...\"}]",
  "model": "claude-sonnet-4-20250514",
  "metadata": "{\"book\":\"Bereshit\",\"chapter\":1,\"user_id\":\"user-123\",\"discord_channel_id\":\"123456789\"}"
}
```

**Note:** Les champs `content`, `files` et `metadata` sont des strings JSON (à parser).

### Format en cas d'erreur

```json
{
  "event": "batch_completed",
  "success": "false",
  "correlation_id": "torah-bereshit-001",
  "batch_id": "msgbatch_01abc123def456",
  "error_code": "BATCH_FAILED",
  "error_message": "Rate limit exceeded",
  "metadata": "{...}"
}
```

---

## Exemples de code

### Python avec Celery (Recommandé)

```python
# tasks/document_tasks.py
import json
import redis
from celery import Celery

app = Celery('torah_tasks')
redis_client = redis.Redis(host='host3.local', port=6380, db=0)

@app.task
def listen_for_document_results(channel: str, timeout: int = 600):
    """
    Écoute un channel Redis pour les résultats de génération.
    Appelé après soumission du batch.
    """
    last_id = '0'

    while True:
        # XREAD bloquant avec timeout
        results = redis_client.xread(
            {channel: last_id},
            block=timeout * 1000,  # ms
            count=1
        )

        if not results:
            # Timeout - pas de résultat
            return {"success": False, "error": "Timeout waiting for results"}

        stream, messages = results[0]
        for msg_id, data in messages:
            last_id = msg_id

            # Parser les données
            event = data.get(b'event', b'').decode()
            if event != 'batch_completed':
                continue

            success = data.get(b'success', b'false').decode() == 'true'
            correlation_id = data.get(b'correlation_id', b'').decode()
            metadata = json.loads(data.get(b'metadata', b'{}').decode())

            if success:
                files = json.loads(data.get(b'files', b'[]').decode())
                return {
                    "success": True,
                    "correlation_id": correlation_id,
                    "files": files,
                    "metadata": metadata
                }
            else:
                return {
                    "success": False,
                    "correlation_id": correlation_id,
                    "error": data.get(b'error_message', b'').decode(),
                    "metadata": metadata
                }
```

### Python - Soumission + écoute

```python
# services/document_generator.py
import httpx
import json
from tasks.document_tasks import listen_for_document_results

SKILLS_API_URL = "http://pi6.local:5678/webhook/claude-call-with-skills"

async def generate_torah_document(
    book: str,
    chapter: int,
    user_id: str,
    discord_channel_id: str
):
    """
    Génère un document Torah via Claude Skills API.
    """
    correlation_id = f"torah-{book}-{chapter}-{user_id}"
    redis_channel = f"torah:documents:{correlation_id}"

    # 1. Soumettre la requête
    payload = {
        "api_key": "sk-ant-xxx",  # ou depuis env
        "model": "claude-sonnet-4-20250514",
        "system": "Tu es un expert Torah qui génère des documents formatés.",
        "messages": [
            {
                "role": "user",
                "content": f"Génère un document DOCX avec la traduction et commentaire de {book} chapitre {chapter}."
            }
        ],
        "container": {
            "skills": [{"type": "anthropic", "skill_id": "docx"}]
        },
        "redis_channel": redis_channel,
        "correlation_id": correlation_id,
        "metadata": {
            "book": book,
            "chapter": chapter,
            "user_id": user_id,
            "discord_channel_id": discord_channel_id
        }
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(SKILLS_API_URL, json=payload)
        submit_result = response.json()

    if response.status_code != 202:
        return {"success": False, "error": submit_result}

    # 2. Lancer l'écoute via Celery (non-bloquant)
    task = listen_for_document_results.delay(redis_channel, timeout=600)

    return {
        "success": True,
        "batch_id": submit_result["batch_id"],
        "correlation_id": correlation_id,
        "redis_channel": redis_channel,
        "celery_task_id": task.id
    }
```

### Discord Bot - Handler de commande

```python
# cogs/documents.py
import discord
from discord.ext import commands
from services.document_generator import generate_torah_document

class DocumentsCog(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.command(name="generer")
    async def generate_document(self, ctx, book: str, chapter: int):
        """
        Commande: !generer Bereshit 1
        """
        await ctx.send(f"📝 Génération du document {book} chapitre {chapter} en cours...")

        result = await generate_torah_document(
            book=book,
            chapter=chapter,
            user_id=str(ctx.author.id),
            discord_channel_id=str(ctx.channel.id)
        )

        if not result["success"]:
            await ctx.send(f"❌ Erreur: {result.get('error')}")
            return

        await ctx.send(
            f"✅ Batch soumis!\n"
            f"- ID: `{result['batch_id']}`\n"
            f"- Channel Redis: `{result['redis_channel']}`\n"
            f"Le document sera prêt dans 1-5 minutes."
        )
```

### Celery Worker - Notification Discord

```python
# tasks/notification_tasks.py
import discord
import base64
import io
from celery import Celery

app = Celery('torah_tasks')

@app.task
def notify_document_ready(result: dict, bot_token: str):
    """
    Appelé quand le document est prêt.
    Envoie le fichier sur Discord.
    """
    if not result["success"]:
        # Notifier l'erreur
        return

    metadata = result["metadata"]
    files = result["files"]
    discord_channel_id = int(metadata["discord_channel_id"])

    # Créer le client Discord
    intents = discord.Intents.default()
    client = discord.Client(intents=intents)

    @client.event
    async def on_ready():
        channel = client.get_channel(discord_channel_id)

        for file_data in files:
            # Décoder le fichier base64
            file_bytes = base64.b64decode(file_data["data"])
            file_obj = io.BytesIO(file_bytes)

            discord_file = discord.File(
                file_obj,
                filename=file_data["filename"]
            )

            await channel.send(
                f"📄 Document généré: **{file_data['filename']}**",
                file=discord_file
            )

        await client.close()

    client.run(bot_token)
```

---

## Skills disponibles

### DOCX Generation

```json
{
  "container": {
    "skills": [
      {
        "type": "anthropic",
        "skill_id": "docx"
      }
    ]
  }
}
```

**Prompt conseillé:**
```
Génère un document DOCX avec le contenu suivant:
- Titre: [titre]
- Sections: [liste des sections]
- Formatage: [instructions de mise en forme]

Le document doit être prêt à l'impression.
```

### Autres skills (selon disponibilité Anthropic)

| Skill ID | Description |
|----------|-------------|
| `docx` | Génération Word |
| `pdf` | Génération PDF |
| `code` | Exécution de code |
| `image` | Analyse/génération image |

---

## Gestion des erreurs

### Codes d'erreur

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Paramètres manquants/invalides |
| `API_KEY_INVALID` | 401 | Clé Anthropic invalide |
| `BATCH_FAILED` | - | Erreur lors du traitement batch |
| `REDIS_ERROR` | - | Erreur publication Redis |

### Retry strategy

Le Batch Poller vérifie toutes les 30 secondes. Les batches non traités après 24h expirent.

### Configuration Redis

```bash
# Dans votre app
REDIS_HOST=host3.local
REDIS_PORT=6380
REDIS_DB=0
```

---

## Variables d'environnement n8n

```bash
# Dans .env.local de n8n (déjà configuré)
ANTHROPIC_API_KEY=sk-ant-xxx
REDIS_XADD_SERVICE_URL=http://redis-xadd:8765
REDIS_HOST=host3.local
REDIS_PORT=6380
```

---

## Support

- **Logs n8n:** `docker logs n8n`
- **Health check Redis XADD:** `curl http://host2.local:8765/health`
- **Test Redis:** `redis-cli -h host3.local -p 6380 PING`
- **Documentation Anthropic:** https://docs.anthropic.com/en/docs/build-with-claude/batch-processing

---

*Généré le 2026-05-15 | n8n-workflows RFC-089/RFC-090 - Mode Redis*
