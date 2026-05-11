# Contrat I/O : Webhooks n8n LLM Multi-Provider

> **Document technique** pour l'équipe DevOps/n8n
>
> Définit les spécifications exactes des webhooks LLM à implémenter.
> **Pattern BYOT (Bring Your Own Token)** : le caller fournit toujours `provider`, `model` et `api_key`.

| Métadonnée | Valeur |
|------------|--------|
| **Version** | 2.0.0 |
| **Date** | 2026-05-11 |
| **RFCs liées** | RFC-085 (Skills), RFC-086 (Streaming) |
| **Statut** | 🟡 À implémenter |

---

## Vue d'ensemble

```
+------------+     +------------+     +------------+     +---------------------+
| chat.api   |---->| Azy-MCP    |---->|   n8n      |---->| Anthropic / OpenAI  |
+------------+     +------------+     +------------+     | / Mistral           |
                                           |            +---------------------+
                                           v
                                    4 webhooks :
                                    - llm-call-messages (multi-provider)
                                    - claude-call-with-skills (Anthropic only)
                                    - llm-call-stream (multi-provider)
                                    - claude-call-stream-with-skills (Anthropic only)
```

### Pattern BYOT (Bring Your Own Token)

> ⚠️ **IMPORTANT** : Tous les webhooks multi-provider exigent :
> - `provider` : `anthropic`, `openai`, ou `mistral` — **REQUIS**
> - `model` : Modèle du provider (ex: `claude-sonnet-4-20250514`, `gpt-4o`) — **REQUIS**
> - `api_key` : Clé API du provider — **REQUIS, pas de fallback sur $env**
> - `temperature` : Optionnel, défaut 0.7
>
> Si `api_key` n'est pas fourni, le webhook retourne une erreur 400.
> Il n'y a **aucun fallback** sur les variables d'environnement.

---

## 1. Webhook `llm-call-messages` (Multi-Provider)

**Objectif** : Appel LLM simple multi-provider (sans skills, sans streaming).

### 1.1 Endpoint

```
POST /webhook/llm-call-messages
Content-Type: application/json
X-Service-Token: <token>
```

### 1.2 Input Schema

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "api_key": "sk-ant-api03-...",
  "temperature": 0.7,
  "system": "Tu es un assistant pédagogique expert.",
  "messages": [
    {
      "role": "user",
      "content": "Génère une progression pédagogique pour les mathématiques 6e."
    }
  ],
  "max_tokens": 4096,
  "metadata": {
    "correlation_id": "skill-exec-abc123",
    "tenant_id": "tenant-123",
    "user_id": "user-456"
  }
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `provider` | string | ✅ | `anthropic`, `openai`, `mistral` |
| `model` | string | ✅ | Modèle du provider |
| `api_key` | string | ✅ | Clé API — **REQUIS, pas de fallback** |
| `temperature` | number | ❌ | Défaut: 0.7 (range 0-1 Anthropic, 0-2 OpenAI) |
| `system` | string | ❌ | System prompt |
| `messages` | array | ✅ | Messages conversation (format provider) |
| `max_tokens` | integer | ❌ | Défaut: 4096 |
| `metadata` | object | ❌ | Passé tel quel dans la réponse (tracing) |

### 1.3 Output Schema (unifié)

```json
{
  "success": true,
  "content": [
    {
      "type": "text",
      "text": "## Progression Mathématiques 6e\n\n### Séquence 1 : Les nombres entiers\n..."
    }
  ],
  "provider": "anthropic",
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
    "code": "MISSING_API_KEY",
    "message": "api_key is required. No fallback to environment variables.",
    "http_status": 400
  },
  "metadata": {
    "correlation_id": "skill-exec-abc123"
  }
}
```

| Code erreur | HTTP | Description |
|-------------|------|-------------|
| `MISSING_API_KEY` | 400 | api_key non fourni |
| `INVALID_PROVIDER` | 400 | Provider non supporté |
| `invalid_request` | 400 | Payload invalide |
| `authentication_error` | 401 | Clé API invalide |
| `rate_limit_exceeded` | 429 | Rate limit provider |
| `provider_overloaded` | 529 | Provider surchargé |
| `internal_error` | 500 | Erreur n8n interne |

### 1.5 Implémentation n8n

```javascript
// Workflow: llm-call-messages

// 1. Webhook Trigger
const input = $input.all()[0].json;
const { provider, model, api_key, temperature, system, messages, max_tokens, metadata } = input;

// 2. Validation - api_key REQUIS
if (!api_key) {
  return {
    success: false,
    error: {
      code: 'MISSING_API_KEY',
      message: 'api_key is required. No fallback to environment variables.',
      http_status: 400
    },
    metadata
  };
}

// 3. Configuration par provider
const PROVIDER_CONFIG = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'anthropic-version': '2023-06-01',
      'x-api-key': api_key,
      'content-type': 'application/json',
    },
    buildBody: () => ({
      model,
      system,
      messages,
      max_tokens: max_tokens || 4096,
      temperature: temperature || 0.7,
    }),
    formatResponse: (r) => ({
      content: r.content,
      usage: r.usage,
      stop_reason: r.stop_reason,
    }),
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${api_key}`,
      'content-type': 'application/json',
    },
    buildBody: () => ({
      model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages,
      ],
      max_tokens: max_tokens || 4096,
      temperature: temperature || 0.7,
    }),
    formatResponse: (r) => ({
      content: [{ type: 'text', text: r.choices[0].message.content }],
      usage: { input_tokens: r.usage.prompt_tokens, output_tokens: r.usage.completion_tokens },
      stop_reason: r.choices[0].finish_reason,
    }),
  },
  mistral: {
    url: 'https://api.mistral.ai/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${api_key}`,
      'content-type': 'application/json',
    },
    buildBody: () => ({
      model,
      messages: [
        ...(system ? [{ role: 'system', content: system }] : []),
        ...messages,
      ],
      max_tokens: max_tokens || 4096,
      temperature: temperature || 0.7,
    }),
    formatResponse: (r) => ({
      content: [{ type: 'text', text: r.choices[0].message.content }],
      usage: { input_tokens: r.usage.prompt_tokens, output_tokens: r.usage.completion_tokens },
      stop_reason: r.choices[0].finish_reason,
    }),
  },
};

const config = PROVIDER_CONFIG[provider];
if (!config) {
  return {
    success: false,
    error: {
      code: 'INVALID_PROVIDER',
      message: `Provider '${provider}' not supported. Use: anthropic, openai, mistral`,
      http_status: 400
    },
    metadata
  };
}

// 4. Appel API
const response = await $http.request({
  method: 'POST',
  url: config.url,
  headers: config.headers,
  body: config.buildBody(),
});

// 5. Formater la réponse
const formatted = config.formatResponse(response);
return {
  success: true,
  ...formatted,
  provider,
  model: response.model || model,
  metadata,
};
```

---

## 2. Webhook `claude-call-with-skills` (Anthropic uniquement)

**Objectif** : Appel LLM avec Anthropic Skills (génération `.docx`, `.xlsx`, etc.).

> ⚠️ Ce webhook reste **Anthropic-only** car les Skills sont une fonctionnalité spécifique à Anthropic.

### 2.1 Endpoint

```
POST /webhook/claude-call-with-skills
Content-Type: application/json
X-Service-Token: <token>
```

### 2.2 Input Schema

```json
{
  "api_key": "sk-ant-api03-...",
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
| `api_key` | string | ✅ | Clé API Anthropic — **REQUIS** |
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

### 2.5 Implémentation n8n

```javascript
// Workflow: claude-call-with-skills

const input = $input.all()[0].json;
const { api_key, model, betas, system, messages, max_tokens, container, tools, metadata } = input;

// Validation api_key
if (!api_key) {
  return {
    success: false,
    error: {
      code: 'MISSING_API_KEY',
      message: 'api_key is required.',
      http_status: 400
    },
    metadata
  };
}

// 1. Appel Anthropic avec betas
const response = await $http.request({
  method: 'POST',
  url: 'https://api.anthropic.com/v1/messages',
  headers: {
    'anthropic-version': '2023-06-01',
    'anthropic-beta': betas.join(','),
    'x-api-key': api_key,
    'content-type': 'application/json',
  },
  body: {
    model,
    system,
    messages,
    max_tokens: max_tokens || 16000,
    container,
    tools: tools || [],
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
    headers: { 'x-api-key': api_key },
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
  files,
  model: response.model,
  usage: response.usage,
  stop_reason: response.stop_reason,
  metadata,
};
```

---

## 3. Webhook `llm-call-stream` (Multi-Provider)

**Objectif** : Streaming LLM multi-provider avec callbacks par paquets (RFC-086).

### 3.1 Endpoint

```
POST /webhook/llm-call-stream
Content-Type: application/json
X-Service-Token: <token>
```

### 3.2 Input Schema

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "api_key": "sk-ant-api03-...",
  "temperature": 0.7,
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
| `provider` | string | ✅ | `anthropic`, `openai`, `mistral` |
| `model` | string | ✅ | Modèle du provider |
| `api_key` | string | ✅ | Clé API — **REQUIS** |
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

### 3.4 Format des callbacks

Voir RFC-086 pour le format détaillé des paquets.

---

## 4. Webhook `claude-call-stream-with-skills` (Anthropic uniquement)

**Objectif** : Streaming + Anthropic Skills.

> ⚠️ Ce webhook reste **Anthropic-only** car les Skills sont spécifiques à Anthropic.

### 4.1 Endpoint

```
POST /webhook/claude-call-stream-with-skills
Content-Type: application/json
X-Service-Token: <token>
```

### 4.2 Input Schema

Combine les champs de `claude-call-with-skills` et `llm-call-stream` :

```json
{
  "api_key": "sk-ant-api03-...",
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

Les fichiers générés sont inclus dans le paquet `final: true`.

---

## 5. Timeouts recommandés

| Webhook | Timeout HTTP | Timeout Provider |
|---------|--------------|------------------|
| `llm-call-messages` | 120s | 60s |
| `claude-call-with-skills` | 300s | 180s |
| `llm-call-stream` | 30s (réponse initiale) | N/A (async) |
| `claude-call-stream-with-skills` | 30s (réponse initiale) | N/A (async) |

---

## 6. Checklist de validation

### Pour chaque webhook :

- [ ] Endpoint accessible via POST
- [ ] Validation `X-Service-Token`
- [ ] **Validation `api_key` REQUIS** (pas de fallback $env)
- [ ] Parsing correct du payload
- [ ] Appel provider avec bons headers
- [ ] Gestion des erreurs provider (4xx, 5xx)
- [ ] Format de réponse conforme au schéma
- [ ] `metadata` passé en entrée retourné en sortie
- [ ] Logs structurés (sans secrets, sans api_key)
- [ ] Timeout configuré

### Tests E2E :

- [ ] `llm-call-messages` Anthropic : message simple → réponse texte
- [ ] `llm-call-messages` OpenAI : message simple → réponse texte
- [ ] `llm-call-messages` Mistral : message simple → réponse texte
- [ ] `llm-call-messages` sans api_key → erreur 400
- [ ] `claude-call-with-skills` : demande docx → fichier base64 retourné
- [ ] `llm-call-stream` : message → callbacks reçus → paquet final
- [ ] `claude-call-stream-with-skills` : demande docx → callbacks + fichier final

---

## 7. Références

- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat)
- [Mistral Chat API](https://docs.mistral.ai/api/)
- [Anthropic Streaming](https://docs.anthropic.com/en/api/streaming)
- [Anthropic Files API (beta)](https://docs.anthropic.com/en/api/files)
- [RFC-085 Skills Engine](../rfc/RFC-085-SKILLS-ENGINE.md)
- [RFC-086 LLM Streaming](../rfc/RFC-086-LLM-STREAMING-ARCHITECTURE.md)
