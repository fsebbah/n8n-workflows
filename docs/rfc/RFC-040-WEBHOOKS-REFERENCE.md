# RFC-040 Webhooks Reference - Guide MCP Teams

**Date**: 2026-03-16
**Version**: 1.0
**Statut**: Production

---

## 1. Vue d'ensemble

Ce document liste tous les webhooks n8n qui supportent le pattern **async callback RFC-040**. Ce pattern permet d'éviter les timeouts sur les opérations longues.

### Comment ça marche ?

```
┌─────────┐     POST + callback_url     ┌─────────┐
│  Client │ ──────────────────────────► │   n8n   │
│  (MCP)  │ ◄────────── 202 Accepted ── │ Webhook │
└─────────┘                             └────┬────┘
     ▲                                       │
     │         POST callback (résultat)      │
     └───────────────────────────────────────┘
```

---

## 2. Webhooks supportant RFC-040

| Workflow | Endpoint | Temps estimé | Batch |
|----------|----------|--------------|-------|
| MCP-Speaker-Identifier | `/webhook/speaker-identifier` | ~11 min | 1 |
| MCP-Veo-Video | `/webhook/veo-video` | ~2 min | 1 |
| MCP-Transcriber | `/webhook/transcriber` | ~1.5 min | 1 |
| Recipes-YouTube | `/webhook/recipes-youtube` | ~1.5 min | 1 |
| Document-Translate-Worker | `/webhook/document-translate-worker` | ~1.5 min | 1 |
| MCP-PDF-Layout-Translator | `/webhook/pdf-layout-translator` | ~40s | 1 |
| Books-Translation-Worker | `/webhook/books-translation-worker` | ~3.5 min | 2 |
| Books-Commentary-Worker | `/webhook/books-commentary-worker` | ~3.5 min | 2 |
| MCP-Tools-Enricher | `/webhook/tools-enricher` | ~3 min | 2 |
| MCP-Documents-Process | `/webhook/documents/process` | ~17s | 2 |
| MCP-Image-OCR | `/webhook/image-ocr` | ~16s | 2 |
| MCP-Table-Extractor | `/webhook/table-extractor` | ~16s | 2 |
| MCP-Image-Generator | `/webhook/image-generator` | ~15s | 2 |
| MCP-Google-Drive-OCR | `/webhook/google-drive-ocr` | ~12s | 2 |
| MCP-Text-Generator | `/webhook/text-generator` | ~10s | 3 |
| MCP-Quiz-Generator | `/webhook/quiz-generator` | ~20s | 3 |
| MCP-Syllabus-Generator | `/webhook/syllabus-generator` | ~30s | 3 |
| MCP-DOCX-Extractor | `/webhook/docx-extractor` | ~10s | 3 |

---

## 3. Paramètres RFC-040

### 3.1 Paramètres communs (tous les webhooks)

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `callback_url` | string (URL) | **Non** | URL où envoyer le résultat. Si absent → mode sync |
| `job_id` | string | Non | Identifiant de corrélation (auto-généré si absent) |
| `conversation_id` | string | Non | ID conversation Discord (retourné dans callback) |
| `user_id` | string | Non | ID utilisateur (retourné dans callback) |
| `guild_id` | string | Non | ID serveur Discord (retourné dans callback) |
| `channel_id` | string | Non | ID channel Discord (retourné dans callback) |

### 3.2 Comportement

| Condition | Comportement |
|-----------|--------------|
| **Sans `callback_url`** | Mode **synchrone** - Réponse complète (200 OK) |
| **Avec `callback_url`** | Mode **asynchrone** - Réponse immédiate (202) + callback POST |

---

## 4. Exemples par webhook

### 4.1 MCP-Text-Generator

**Requête sync (classique):**
```bash
curl -X POST https://n8n.example.com/webhook/text-generator \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Écris un résumé de 100 mots sur l'\''IA",
    "openai_api_key": "sk-xxx",
    "model": "gpt-4o",
    "temperature": 0.7
  }'
```

**Requête async (RFC-040):**
```bash
curl -X POST https://n8n.example.com/webhook/text-generator \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Écris un résumé de 100 mots sur l'\''IA",
    "openai_api_key": "sk-xxx",
    "model": "gpt-4o",
    "callback_url": "https://api.myapp.com/callbacks/text",
    "job_id": "job_abc123",
    "conversation_id": "conv_456",
    "user_id": "user_789"
  }'
```

**Réponse immédiate (202):**
```json
{
  "success": true,
  "status": "accepted",
  "job_id": "job_abc123",
  "message": "Text generation started, callback will be sent on completion"
}
```

### 4.2 MCP-Quiz-Generator

**Requête async:**
```bash
curl -X POST https://n8n.example.com/webhook/quiz-generator \
  -H "Content-Type: application/json" \
  -d '{
    "data": "Le système solaire comprend 8 planètes...",
    "source": "text",
    "openai_api_key": "sk-xxx",
    "options": {
      "num_questions": 10,
      "difficulty": "medium",
      "language": "fr"
    },
    "callback_url": "https://api.myapp.com/callbacks/quiz",
    "job_id": "quiz_001"
  }'
```

### 4.3 MCP-Image-Generator

**Requête async:**
```bash
curl -X POST https://n8n.example.com/webhook/image-generator \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cat wearing a space helmet",
    "openai_api_key": "sk-xxx",
    "size": "1024x1024",
    "callback_url": "https://api.myapp.com/callbacks/image",
    "job_id": "img_001"
  }'
```

---

## 5. Format du callback

### 5.1 Headers

```
Content-Type: application/json
X-N8N-Signature: <hex_hmac_sha256>
```

⚠️ **IMPORTANT**: Pas de préfixe `sha256=`, juste la valeur hex.

### 5.2 Body - Succès

```json
{
  "job_id": "job_abc123",
  "conversation_id": "conv_456",
  "user_id": "user_789",
  "guild_id": "",
  "channel_id": "",
  "success": true,
  "result": {
    "text": "Voici le résumé généré...",
    "output_type": "text",
    "model": "gpt-4o"
  },
  "metrics": {
    "tokens_used": 150,
    "prompt_tokens": 50,
    "completion_tokens": 100,
    "processing_time_ms": 2500
  },
  "error": null
}
```

### 5.3 Body - Erreur

```json
{
  "job_id": "job_abc123",
  "conversation_id": "conv_456",
  "user_id": "user_789",
  "success": false,
  "result": null,
  "metrics": {
    "tokens_used": 0,
    "processing_time_ms": 500
  },
  "error": {
    "code": "rate_limit_exceeded",
    "message": "OpenAI rate limit exceeded",
    "retriable": true
  }
}
```

---

## 6. Vérification HMAC côté client

### 6.1 Python

```python
import hmac
import hashlib

def verify_n8n_callback(request, secret: str) -> bool:
    """Vérifie la signature HMAC d'un callback n8n."""
    signature = request.headers.get('X-N8N-Signature', '')
    body = request.get_data()  # bytes

    expected = hmac.new(
        secret.encode('utf-8'),
        body,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(signature, expected)

# Usage dans Flask
@app.route('/callbacks/text', methods=['POST'])
def handle_callback():
    if not verify_n8n_callback(request, os.environ['N8N_WEBHOOK_SECRET']):
        return {'error': 'Invalid signature'}, 401

    data = request.json
    job_id = data['job_id']

    if data['success']:
        result = data['result']['text']
        # Traiter le résultat...
    else:
        error = data['error']
        # Gérer l'erreur...

    return {'received': True}, 200
```

### 6.2 Node.js

```javascript
const crypto = require('crypto');

function verifyN8NCallback(req, secret) {
  const signature = req.headers['x-n8n-signature'] || '';
  const body = JSON.stringify(req.body);

  const expected = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// Usage dans Express
app.post('/callbacks/text', (req, res) => {
  if (!verifyN8NCallback(req, process.env.N8N_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { job_id, success, result, error } = req.body;

  if (success) {
    console.log(`Job ${job_id} completed:`, result.text);
  } else {
    console.error(`Job ${job_id} failed:`, error);
  }

  res.json({ received: true });
});
```

### 6.3 Go

```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "io"
    "net/http"
)

func verifyN8NCallback(r *http.Request, secret string) bool {
    signature := r.Header.Get("X-N8N-Signature")
    body, _ := io.ReadAll(r.Body)

    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(body)
    expected := hex.EncodeToString(mac.Sum(nil))

    return hmac.Equal([]byte(signature), []byte(expected))
}
```

---

## 7. Configuration requise

### 7.1 Variable d'environnement

```bash
# Secret partagé pour la signature HMAC
# Doit être identique côté n8n et côté client
N8N_WEBHOOK_SECRET=<your-256-bit-secret>
```

**Générer un secret sécurisé:**
```bash
openssl rand -hex 32
```

### 7.2 Endpoint callback

Votre endpoint callback doit:
1. Accepter `POST` avec `Content-Type: application/json`
2. Vérifier la signature HMAC
3. Répondre avec un code 2xx (sinon n8n considère l'échec)
4. Timeout max recommandé: 30 secondes

---

## 8. FAQ

### Q: Que se passe-t-il si mon callback échoue ?

R: Actuellement, pas de retry automatique. Le job est exécuté mais le résultat est perdu si le callback échoue. Prévoir un fallback (polling ou logs).

### Q: Puis-je utiliser le mode sync sur un webhook long ?

R: Oui, mais risque de timeout (30-120s selon la config). Le mode async est recommandé pour les opérations >10s.

### Q: Comment tracer un job ?

R: Utilisez le `job_id` que vous fournissez ou celui auto-généré (retourné dans la réponse 202). Ce même `job_id` sera dans le callback.

### Q: Faut-il un endpoint par webhook ?

R: Non, vous pouvez utiliser le même endpoint et différencier par `job_id` ou ajouter un préfixe personnalisé dans le `job_id`.

---

## 9. Différences avec le mode sync

| Aspect | Mode Sync | Mode Async (RFC-040) |
|--------|-----------|---------------------|
| Réponse initiale | 200 OK avec résultat | 202 Accepted |
| Où est le résultat ? | Corps de la réponse | Callback POST |
| Timeout risque | Élevé (>30s) | Aucun |
| Signature HMAC | Non | Oui (X-N8N-Signature) |
| Paramètre requis | Aucun supplémentaire | `callback_url` |

---

## 10. Changelog

| Date | Version | Changements |
|------|---------|-------------|
| 2026-03-16 | 1.0 | Version initiale - 18 webhooks supportés |
