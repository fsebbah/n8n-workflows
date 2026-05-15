# Guide d'utilisation des Workflows Claude Skills API

> Documentation pour l'équipe Plugin Torah
> Version: 1.0 | Date: 2026-05-15

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Endpoint principal](#endpoint-principal)
4. [Pattern Batch (Asynchrone)](#pattern-batch-asynchrone)
5. [Implémentation du Callback](#implémentation-du-callback)
6. [Skills disponibles](#skills-disponibles)
7. [Exemples de code](#exemples-de-code)
8. [Gestion des erreurs](#gestion-des-erreurs)

---

## Vue d'ensemble

Les workflows Claude permettent d'exécuter des **Skills** (génération DOCX, PDF, code, etc.) via l'API Anthropic. La génération de documents peut prendre plusieurs minutes, c'est pourquoi nous utilisons un **pattern asynchrone** (Batch API).

### Pourquoi le Batch API ?

| Mode | Timeout | Coût | Cas d'usage |
|------|---------|------|-------------|
| Synchrone (Messages API) | ~5 min | 100% | Requêtes rapides |
| **Asynchrone (Batch API)** | **24h** | **50%** | Génération de documents |

---

## Architecture

```
┌─────────────────┐     POST /webhook/claude-call-with-skills
│   Votre App     │ ─────────────────────────────────────────►┌──────────────┐
│  (Plugin Torah) │                                           │     n8n      │
└─────────────────┘ ◄──── 202 { batch_id, correlation_id }    │   Workflow   │
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
        │         POST callback_url { results, files }               ▼
        │ ◄────────────────────────────────────────────── ┌──────────────────┐
        │                                                 │  Batch Poller    │
        ▼                                                 │  (Cron 30s)      │
┌─────────────────┐                                       └──────────────────┘
│  Traitement     │
│  des résultats  │
└─────────────────┘
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
| `callback_url` | string | URL pour recevoir les résultats |

#### Paramètres optionnels

| Paramètre | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | `claude-sonnet-4-20250514` | Modèle Claude |
| `system` | string | null | System prompt |
| `max_tokens` | integer | 16000 | Tokens max |
| `correlation_id` | string | auto-généré | ID de suivi |
| `metadata` | object | {} | Données custom (transmises au callback) |

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
  "callback_url": "http://your-server.com/api/documents/callback",
  "correlation_id": "torah-bereshit-001",
  "metadata": {
    "book": "Bereshit",
    "chapter": 1,
    "user_id": "user-123"
  }
}
```

#### Réponse immédiate (202 Accepted)

```json
{
  "status": "processing",
  "batch_id": "msgbatch_01abc123def456",
  "correlation_id": "torah-bereshit-001",
  "message": "Batch submitted. Results will be sent to callback_url.",
  "submitted_at": "2026-05-15T18:30:00.000Z"
}
```

---

## Pattern Batch (Asynchrone)

### Flux complet

1. **Soumission** → Votre app envoie la requête au workflow
2. **Réponse immédiate** → Vous recevez un `batch_id` et `correlation_id`
3. **Traitement** → Anthropic traite la requête (1-10 min pour génération doc)
4. **Polling** → Le workflow `Claude - Batch Poller` vérifie toutes les 30s
5. **Callback** → Quand terminé, les résultats sont envoyés à votre `callback_url`

### Suivi du batch

Le `correlation_id` permet de :
- Identifier la requête dans vos logs
- Associer le callback à la requête originale
- Gérer les retries si nécessaire

---

## Implémentation du Callback

Votre endpoint `callback_url` recevra un POST avec les résultats.

### Format du callback (succès)

```json
{
  "success": true,
  "status": "completed",
  "batch_id": "msgbatch_01abc123def456",
  "correlation_id": "torah-bereshit-001",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "J'ai généré le document DOCX demandé."
      },
      {
        "type": "tool_result",
        "tool_use_id": "toolu_xxx",
        "content": [
          {
            "type": "file",
            "file": {
              "filename": "bereshit_chapter_1.docx",
              "media_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              "data": "UEsDBBQAAAAI..." // Base64
            }
          }
        ]
      }
    ],
    "model": "claude-sonnet-4-20250514",
    "usage": {
      "input_tokens": 1234,
      "output_tokens": 5678
    }
  },
  "metadata": {
    "book": "Bereshit",
    "chapter": 1,
    "user_id": "user-123"
  },
  "completed_at": "2026-05-15T18:35:42.000Z"
}
```

### Format du callback (erreur)

```json
{
  "success": false,
  "status": "error",
  "batch_id": "msgbatch_01abc123def456",
  "correlation_id": "torah-bereshit-001",
  "error": {
    "code": "BATCH_FAILED",
    "message": "Rate limit exceeded",
    "details": { ... }
  },
  "metadata": { ... }
}
```

### Exemple de handler callback (Node.js)

```javascript
// routes/documents/callback.js

app.post('/api/documents/callback', async (req, res) => {
  const { success, correlation_id, result, metadata, error } = req.body;

  console.log(`Callback reçu pour ${correlation_id}`);

  if (!success) {
    // Gérer l'erreur
    await notifyError(correlation_id, error);
    return res.json({ received: true });
  }

  // Extraire les fichiers générés
  const files = [];
  for (const content of result.content) {
    if (content.type === 'tool_result') {
      for (const item of content.content) {
        if (item.type === 'file') {
          const buffer = Buffer.from(item.file.data, 'base64');
          files.push({
            filename: item.file.filename,
            media_type: item.file.media_type,
            buffer: buffer
          });
        }
      }
    }
  }

  // Sauvegarder les fichiers
  for (const file of files) {
    await saveDocument(file, metadata);
  }

  // Notifier l'utilisateur
  await notifyUser(metadata.user_id, {
    message: `Document généré: ${files[0]?.filename}`,
    correlation_id
  });

  res.json({ received: true, files_count: files.length });
});
```

### Exemple de handler callback (Python/FastAPI)

```python
# routes/documents.py

from fastapi import APIRouter, Request
import base64

router = APIRouter()

@router.post("/api/documents/callback")
async def document_callback(request: Request):
    data = await request.json()

    correlation_id = data.get("correlation_id")
    success = data.get("success", False)
    metadata = data.get("metadata", {})

    print(f"Callback reçu pour {correlation_id}")

    if not success:
        error = data.get("error", {})
        await notify_error(correlation_id, error)
        return {"received": True}

    # Extraire les fichiers
    result = data.get("result", {})
    files = []

    for content in result.get("content", []):
        if content.get("type") == "tool_result":
            for item in content.get("content", []):
                if item.get("type") == "file":
                    file_data = item["file"]
                    files.append({
                        "filename": file_data["filename"],
                        "media_type": file_data["media_type"],
                        "data": base64.b64decode(file_data["data"])
                    })

    # Sauvegarder
    for file in files:
        await save_document(file, metadata)

    return {"received": True, "files_count": len(files)}
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
| `BATCH_FAILED` | 500 | Erreur lors du traitement batch |
| `CALLBACK_FAILED` | - | Erreur lors de l'envoi du callback |

### Retry strategy

Si le callback échoue, le système ré-essaie 3 fois avec backoff exponentiel.

### Monitoring

Les batches en cours sont stockés dans Redis (`llm:batches:pending`).
Pour voir l'état :

```bash
curl http://host2.local:8765/batches/pending
```

---

## Variables d'environnement requises

Pour que les workflows fonctionnent, ces variables doivent être définies dans n8n :

```bash
# Dans .env.local de n8n
ANTHROPIC_API_KEY=sk-ant-xxx        # Clé par défaut (override possible par requête)
REDIS_XADD_SERVICE_URL=http://localhost:8765  # Service Redis XADD
```

---

## Support

- **Logs n8n:** `pm2 logs n8n` ou `docker logs n8n`
- **Health check service:** `curl http://host2.local:8765/health`
- **Documentation Anthropic:** https://docs.anthropic.com/en/docs/build-with-claude/batch-processing

---

*Généré le 2026-05-15 | n8n-workflows RFC-089/RFC-090*
