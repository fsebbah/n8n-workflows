# Contrat I/O : Webhooks n8n ↔ Anthropic

> **Document technique** pour l'équipe DevOps/n8n
>
> Définit les spécifications exactes des webhooks LLM à implémenter.

| Métadonnée | Valeur |
|------------|--------|
| **Version** | 1.0.0 |
| **Date** | 2026-05-11 |
| **RFCs liées** | RFC-085 (Skills), RFC-086 (Streaming) |
| **Statut** | 🟡 À implémenter |

---

## Vue d'ensemble

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ chat.api │────▶│ Azy-MCP  │────▶│   n8n    │────▶│Anthropic │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                        │
                                        ▼
                                 4 webhooks :
                                 • claude-call-messages
                                 • claude-call-with-skills
                                 • claude-call-stream
                                 • claude-call-stream-with-skills
```

---

## 1. Webhook `claude-call-messages`

**Objectif** : Appel LLM Anthropic simple (sans skills, sans streaming).

### 1.1 Endpoint

```
POST /webhook/claude-call-messages
Content-Type: application/json
X-Service-Token: <token>
```

### 1.2 Input Schema

```json
{
  "model": "claude-sonnet-4-20250514",
  "system": "Tu es un assistant pédagogique expert.",
  "messages": [
    {
      "role": "user",
      "content": "Génère une progression pédagogique pour les mathématiques 6e."
    }
  ],
  "max_tokens": 4096,
  "temperature": 0.7,
  "metadata": {
    "correlation_id": "skill-exec-abc123",
    "tenant_id": "tenant-123",
    "user_id": "user-456"
  }
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `model` | string | ✅ | Modèle Anthropic (`claude-sonnet-4-20250514`, `claude-opus-4-20250514`, etc.) |
| `system` | string | ❌ | System prompt |
| `messages` | array | ✅ | Messages conversation (format Anthropic) |
| `max_tokens` | integer | ❌ | Défaut: 4096 |
| `temperature` | number | ❌ | Défaut: 0.7 (range 0-1) |
| `metadata` | object | ❌ | Passé tel quel dans la réponse (tracing) |

### 1.3 Output Schema

```json
{
  "success": true,
  "content": [
    {
      "type": "text",
      "text": "## Progression Mathématiques 6e\n\n### Séquence 1 : Les nombres entiers\n..."
    }
  ],
  "model": "claude-sonnet-4-20250514",
  "usage": {
    "input_tokens": 245,
    "output_tokens": 1832
  },
  "stop_reason": "end_turn",
  "metadata": {
    "correlation_id": "skill-exec-abc123",
    "tenant_id": "tenant-123",
    "user_id": "user-456"
  }
}
```

### 1.4 Erreurs

```json
{
  "success": false,
  "error": {
    "type": "anthropic_error",
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Please retry after 60 seconds."
  },
  "metadata": {
    "correlation_id": "skill-exec-abc123"
  }
}
```

| Code erreur | HTTP | Description |
|-------------|------|-------------|
| `invalid_request` | 400 | Payload invalide |
| `authentication_error` | 401 | Clé API invalide |
| `rate_limit_exceeded` | 429 | Rate limit Anthropic |
| `anthropic_overloaded` | 529 | Anthropic surchargé |
| `internal_error` | 500 | Erreur n8n interne |

### 1.5 Implémentation n8n

```javascript
// Workflow: claude-call-messages

// 1. Webhook Trigger
const input = $input.all()[0].json;

// 2. HTTP Request vers Anthropic
const response = await $http.request({
  method: 'POST',
  url: 'https://api.anthropic.com/v1/messages',
  headers: {
    'anthropic-version': '2023-06-01',
    'x-api-key': $env.ANTHROPIC_API_KEY,
    'content-type': 'application/json',
  },
  body: {
    model: input.model,
    system: input.system,
    messages: input.messages,
    max_tokens: input.max_tokens || 4096,
    temperature: input.temperature || 0.7,
  },
});

// 3. Formater la réponse
return {
  success: true,
  content: response.content,
  model: response.model,
  usage: response.usage,
  stop_reason: response.stop_reason,
  metadata: input.metadata,
};
```

---

## 2. Webhook `claude-call-with-skills`

**Objectif** : Appel LLM avec Anthropic Skills (génération `.docx`, `.xlsx`, etc.).

### 2.1 Endpoint

```
POST /webhook/claude-call-with-skills
Content-Type: application/json
X-Service-Token: <token>
```

### 2.2 Input Schema

```json
{
  "model": "claude-sonnet-4-20250514",
  "betas": ["files-api-2025-04-14", "interleaved-thinking-2025-05-14"],
  "system": "Tu es un assistant qui génère des documents professionnels.",
  "messages": [
    {
      "role": "user",
      "content": "Génère un document Word avec la progression pédagogique suivante:\n\n## Séquence 1..."
    }
  ],
  "max_tokens": 16000,
  "container": {
    "skills": [
      {
        "type": "anthropic",
        "skill_id": "docx"
      }
    ]
  },
  "tools": [],
  "metadata": {
    "correlation_id": "skill-exec-abc123",
    "tenant_id": "tenant-123",
    "user_id": "user-456"
  }
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `model` | string | ✅ | Modèle Anthropic |
| `betas` | array | ✅ | Features beta à activer |
| `system` | string | ❌ | System prompt |
| `messages` | array | ✅ | Messages conversation |
| `max_tokens` | integer | ✅ | Recommandé: 16000 pour skills |
| `container` | object | ✅ | Configuration skills |
| `container.skills` | array | ✅ | Skills à activer |
| `tools` | array | ❌ | Tools additionnels |
| `metadata` | object | ❌ | Tracing |

### 2.3 Skills Anthropic disponibles

| Skill ID | Type de fichier | MIME Type |
|----------|-----------------|-----------|
| `docx` | Word | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `xlsx` | Excel | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `pptx` | PowerPoint | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| `pdf` | PDF | `application/pdf` |

### 2.4 Output Schema

```json
{
  "success": true,
  "content": [
    {
      "type": "text",
      "text": "J'ai généré le document Word avec la progression pédagogique."
    },
    {
      "type": "tool_use",
      "id": "toolu_abc123",
      "name": "create_document",
      "input": {
        "title": "Progression Mathématiques 6e"
      }
    }
  ],
  "files": [
    {
      "file_id": "file-abc123",
      "name": "progression_mathematiques_6e.docx",
      "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "size_bytes": 45678,
      "content_base64": "UEsDBBQAAAAIAMVYZ1kAAAAAAAAAAA..."
    }
  ],
  "model": "claude-sonnet-4-20250514",
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 5678
  },
  "stop_reason": "end_turn",
  "metadata": {
    "correlation_id": "skill-exec-abc123"
  }
}
```

### 2.5 Logique interne n8n

```
1. POST https://api.anthropic.com/v1/messages
   Headers:
     - anthropic-version: 2023-06-01
     - anthropic-beta: files-api-2025-04-14,interleaved-thinking-2025-05-14
     - x-api-key: $ANTHROPIC_API_KEY

2. Parser la réponse pour extraire les file_id

3. Pour chaque file_id trouvé:
   GET https://api.anthropic.com/v1/files/{file_id}/content
   Headers:
     - x-api-key: $ANTHROPIC_API_KEY

   → Récupérer le contenu binaire
   → Encoder en base64

4. Construire la réponse avec les fichiers encodés
```

### 2.6 Implémentation n8n

```javascript
// Workflow: claude-call-with-skills

const input = $input.all()[0].json;

// 1. Appel Anthropic avec betas
const response = await $http.request({
  method: 'POST',
  url: 'https://api.anthropic.com/v1/messages',
  headers: {
    'anthropic-version': '2023-06-01',
    'anthropic-beta': input.betas.join(','),
    'x-api-key': $env.ANTHROPIC_API_KEY,
    'content-type': 'application/json',
  },
  body: {
    model: input.model,
    system: input.system,
    messages: input.messages,
    max_tokens: input.max_tokens || 16000,
    container: input.container,
    tools: input.tools || [],
  },
});

// 2. Extraire les file_id de la réponse
const fileIds = [];
for (const block of response.content) {
  if (block.type === 'tool_result' && block.output?.file_id) {
    fileIds.push({
      file_id: block.output.file_id,
      name: block.output.name,
      mime_type: block.output.mime_type,
    });
  }
}

// 3. Télécharger chaque fichier et encoder en base64
const files = [];
for (const fileInfo of fileIds) {
  const fileResponse = await $http.request({
    method: 'GET',
    url: `https://api.anthropic.com/v1/files/${fileInfo.file_id}/content`,
    headers: {
      'x-api-key': $env.ANTHROPIC_API_KEY,
    },
    encoding: 'arraybuffer',
  });

  files.push({
    file_id: fileInfo.file_id,
    name: fileInfo.name,
    mime_type: fileInfo.mime_type,
    size_bytes: fileResponse.byteLength,
    content_base64: Buffer.from(fileResponse).toString('base64'),
  });
}

// 4. Retourner la réponse complète
return {
  success: true,
  content: response.content,
  files: files,
  model: response.model,
  usage: response.usage,
  stop_reason: response.stop_reason,
  metadata: input.metadata,
};
```

---

## 3. Webhook `claude-call-stream`

**Objectif** : Streaming LLM avec callbacks par paquets (RFC-086).

### 3.1 Endpoint

```
POST /webhook/claude-call-stream
Content-Type: application/json
X-Service-Token: <token>
```

### 3.2 Input Schema

```json
{
  "model": "claude-sonnet-4-20250514",
  "system": "Tu es un assistant pédagogique.",
  "messages": [
    { "role": "user", "content": "Explique la photosynthèse en détail." }
  ],
  "max_tokens": 4096,
  "callback_url": "https://mcp.azy.solutions/internal/llm/stream-callback",
  "correlation_id": "stream-abc123",
  "stream_config": {
    "flush_timeout_ms": 500,
    "flush_token_count": 20,
    "flush_size_bytes": 4096
  },
  "metadata": {
    "tenant_id": "tenant-123",
    "user_id": "user-456"
  }
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `callback_url` | string | ✅ | URL pour recevoir les paquets |
| `correlation_id` | string | ✅ | ID unique pour corréler les paquets |
| `stream_config` | object | ❌ | Config flush (défauts raisonnables) |

### 3.3 Output Schema (réponse immédiate)

```json
{
  "status": "streaming",
  "correlation_id": "stream-abc123",
  "message": "Stream started, callbacks will be sent to callback_url"
}
```

### 3.4 Format des callbacks (POST vers callback_url)

**Paquet intermédiaire :**

```json
{
  "correlation_id": "stream-abc123",
  "sequence": 3,
  "events": [
    { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "La photosynthèse est " } },
    { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "un processus par lequel " } },
    { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "les plantes convertissent " } }
  ],
  "cumulative_tokens": 156,
  "timestamp": "2026-05-11T10:30:00.500Z"
}
```

**Paquet final :**

```json
{
  "correlation_id": "stream-abc123",
  "sequence": 42,
  "events": [
    { "type": "message_stop" }
  ],
  "final": true,
  "usage": {
    "input_tokens": 45,
    "output_tokens": 1234
  },
  "model": "claude-sonnet-4-20250514",
  "stop_reason": "end_turn",
  "duration_ms": 8500,
  "timestamp": "2026-05-11T10:30:08.500Z"
}
```

---

## 4. Webhook `claude-call-stream-with-skills`

**Objectif** : Streaming + Anthropic Skills.

### 4.1 Endpoint

```
POST /webhook/claude-call-stream-with-skills
Content-Type: application/json
X-Service-Token: <token>
```

### 4.2 Input Schema

Combine les champs de `claude-call-with-skills` et `claude-call-stream` :

```json
{
  "model": "claude-sonnet-4-20250514",
  "betas": ["files-api-2025-04-14"],
  "system": "...",
  "messages": [...],
  "max_tokens": 16000,
  "container": {
    "skills": [{ "type": "anthropic", "skill_id": "docx" }]
  },
  "callback_url": "https://mcp.azy.solutions/internal/llm/stream-callback",
  "correlation_id": "stream-skill-abc123",
  "stream_config": {...},
  "metadata": {...}
}
```

### 4.3 Particularité : fichiers dans le paquet final

```json
{
  "correlation_id": "stream-skill-abc123",
  "sequence": 50,
  "final": true,
  "files": [
    {
      "file_id": "file-xyz789",
      "name": "document.docx",
      "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "size_bytes": 45678,
      "content_base64": "UEsDBBQAAAAI..."
    }
  ],
  "usage": {
    "input_tokens": 2000,
    "output_tokens": 8000
  },
  "model": "claude-sonnet-4-20250514",
  "stop_reason": "end_turn",
  "duration_ms": 45000
}
```

---

## 5. Variables d'environnement n8n

| Variable | Description | Exemple |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Clé API Anthropic | `sk-ant-api03-...` |
| `SERVICE_TOKEN` | Token pour callbacks authentifiés | `svc-token-...` |

**⚠️ Sécurité** : Ces variables ne doivent JAMAIS apparaître dans les logs ou les réponses.

---

## 6. Validation X-Service-Token

Tous les webhooks doivent valider le `X-Service-Token` entrant :

```javascript
// En début de workflow
const serviceToken = $request.headers['x-service-token'];
const expectedToken = $env.EXPECTED_SERVICE_TOKEN;

if (serviceToken !== expectedToken) {
  return {
    success: false,
    error: {
      type: 'authentication_error',
      code: 'invalid_service_token',
      message: 'Invalid or missing X-Service-Token'
    }
  };
}
```

---

## 7. Timeouts recommandés

| Webhook | Timeout HTTP | Timeout Anthropic |
|---------|--------------|-------------------|
| `claude-call-messages` | 120s | 60s |
| `claude-call-with-skills` | 300s | 180s |
| `claude-call-stream` | 30s (réponse initiale) | N/A (async) |
| `claude-call-stream-with-skills` | 30s (réponse initiale) | N/A (async) |

---

## 8. Checklist de validation

### Pour chaque webhook :

- [ ] Endpoint accessible via POST
- [ ] Validation `X-Service-Token`
- [ ] Parsing correct du payload
- [ ] Appel Anthropic avec bons headers
- [ ] Gestion des erreurs Anthropic (4xx, 5xx)
- [ ] Format de réponse conforme au schéma
- [ ] `metadata` passé en entrée retourné en sortie
- [ ] Logs structurés (sans secrets)
- [ ] Timeout configuré

### Tests E2E :

- [ ] `claude-call-messages` : message simple → réponse texte
- [ ] `claude-call-with-skills` : demande docx → fichier base64 retourné
- [ ] `claude-call-stream` : message → callbacks reçus → paquet final
- [ ] `claude-call-stream-with-skills` : demande docx → callbacks + fichier final

---

## 9. Références

- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Anthropic Streaming](https://docs.anthropic.com/en/api/streaming)
- [Anthropic Files API (beta)](https://docs.anthropic.com/en/api/files)
- [RFC-085 Skills Engine](../rfc/RFC-085-SKILLS-ENGINE.md)
- [RFC-086 LLM Streaming](../rfc/RFC-086-LLM-STREAMING-ARCHITECTURE.md)
