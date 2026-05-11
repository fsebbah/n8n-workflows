# Contrat I/O : Webhooks n8n LLM (BYOT Pattern)

> **Document technique** pour l'équipe azy.mcp
>
> Spécifications des webhooks LLM avec pattern BYOT (Bring Your Own Token).

| Métadonnée | Valeur |
|------------|--------|
| **Version** | 2.0.0 |
| **Date** | 2026-05-11 |
| **RFCs liées** | RFC-085 (Skills), RFC-086 (Streaming) |
| **Statut** | ✅ Implémenté |

---

## Vue d'ensemble

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌───────────────┐
│ chat.api │────▶│ Azy-MCP  │────▶│   n8n    │────▶│ LLM Provider  │
└──────────┘     └──────────┘     └──────────┘     │ • Anthropic   │
                                        │          │ • OpenAI      │
                                        ▼          │ • Mistral     │
                                 4 webhooks :      └───────────────┘
                                 • llm-call-messages (multi-provider)
                                 • llm-call-stream (multi-provider)
                                 • claude-call-with-skills (Anthropic)
                                 • claude-call-stream-with-skills (Anthropic)
```

### Pattern BYOT (Bring Your Own Token)

**Principe fondamental** : L'appelant fournit sa propre clé API. Aucun fallback sur les variables d'environnement.

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "api_key": "sk-ant-...",  // ⚠️ REQUIS - pas de fallback
  "messages": [...]
}
```

**Avantages :**
- Multi-tenant : chaque appelant gère ses propres quotas
- Sécurité : pas de clé partagée côté serveur
- Flexibilité : switch de provider sans redéploiement

---

## 1. Webhook `llm-call-messages`

**Objectif** : Appel LLM synchrone multi-provider.

### 1.1 Endpoint

```
POST /webhook/llm-call-messages
Content-Type: application/json
```

### 1.2 Input Schema

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "api_key": "sk-ant-api03-...",
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
| `provider` | string | ✅ | Provider LLM (`anthropic`, `openai`, `mistral`) |
| `model` | string | ✅ | Modèle du provider |
| `api_key` | string | ✅ | Clé API du provider (BYOT - aucun fallback) |
| `system` | string | ❌ | System prompt |
| `messages` | array | ✅ | Messages conversation |
| `max_tokens` | integer | ❌ | Défaut: 4096 |
| `temperature` | number | ❌ | Défaut: 0.7 (range 0-1) |
| `metadata` | object | ❌ | Passé tel quel dans la réponse (tracing) |

### 1.3 Providers supportés

| Provider | Modèles exemples | API Endpoint |
|----------|------------------|--------------|
| `anthropic` | `claude-sonnet-4-20250514`, `claude-opus-4-20250514` | `api.anthropic.com` |
| `openai` | `gpt-4o`, `gpt-4o-mini`, `o1` | `api.openai.com` |
| `mistral` | `mistral-large-latest`, `mistral-medium` | `api.mistral.ai` |

### 1.4 Output Schema

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
  "provider": "anthropic",
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

### 1.5 Erreurs

```json
{
  "success": false,
  "error": {
    "type": "validation_error",
    "code": "missing_required_field",
    "message": "api_key requis (BYOT pattern - aucun fallback sur env)"
  },
  "metadata": {
    "correlation_id": "skill-exec-abc123"
  }
}
```

| Code erreur | HTTP | Description |
|-------------|------|-------------|
| `missing_required_field` | 400 | Champ requis manquant (provider, model, api_key, messages) |
| `invalid_provider` | 400 | Provider non supporté |
| `authentication_error` | 401 | Clé API invalide |
| `rate_limit_exceeded` | 429 | Rate limit provider |
| `provider_overloaded` | 529 | Provider surchargé |
| `internal_error` | 500 | Erreur n8n interne |

---

## 2. Webhook `llm-call-stream`

**Objectif** : Streaming LLM multi-provider avec callbacks par paquets (RFC-086).

### 2.1 Endpoint

```
POST /webhook/llm-call-stream
Content-Type: application/json
```

### 2.2 Input Schema

```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "api_key": "sk-ant-api03-...",
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
| `provider` | string | ✅ | Provider LLM |
| `model` | string | ✅ | Modèle du provider |
| `api_key` | string | ✅ | Clé API (BYOT) |
| `callback_url` | string | ✅ | URL pour recevoir les paquets |
| `correlation_id` | string | ✅ | ID unique pour corréler les paquets |
| `stream_config` | object | ❌ | Config flush (défauts raisonnables) |

### 2.3 Output Schema (réponse immédiate 202)

```json
{
  "status": "accepted",
  "correlation_id": "stream-abc123",
  "message": "Stream démarré, les paquets seront envoyés à callback_url"
}
```

### 2.4 Format des callbacks (POST vers callback_url)

**Paquet intermédiaire :**

```json
{
  "correlation_id": "stream-abc123",
  "sequence": 3,
  "events": [
    { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "La photosynthèse est " } },
    { "type": "content_block_delta", "index": 0, "delta": { "type": "text_delta", "text": "un processus par lequel " } }
  ],
  "final": false,
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
  "provider": "anthropic",
  "stop_reason": "end_turn",
  "duration_ms": 8500,
  "timestamp": "2026-05-11T10:30:08.500Z"
}
```

---

## 3. Webhook `claude-call-with-skills`

**Objectif** : Appel LLM avec Anthropic Skills (génération `.docx`, `.xlsx`, etc.).

> ⚠️ **Anthropic uniquement** : Ce webhook utilise l'API Files spécifique à Anthropic.

### 3.1 Endpoint

```
POST /webhook/claude-call-with-skills
Content-Type: application/json
```

### 3.2 Input Schema

```json
{
  "model": "claude-sonnet-4-20250514",
  "api_key": "sk-ant-api03-...",
  "betas": ["files-api-2025-04-14"],
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
| `api_key` | string | ✅ | Clé API Anthropic (BYOT) |
| `betas` | array | ❌ | Features beta (défaut: `["files-api-2025-04-14"]`) |
| `system` | string | ❌ | System prompt |
| `messages` | array | ✅ | Messages conversation |
| `max_tokens` | integer | ❌ | Recommandé: 16000 pour skills |
| `container` | object | ✅ | Configuration skills |
| `container.skills` | array | ✅ | Skills à activer |
| `metadata` | object | ❌ | Tracing |

### 3.3 Skills Anthropic disponibles

| Skill ID | Type de fichier | MIME Type |
|----------|-----------------|-----------|
| `docx` | Word | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `xlsx` | Excel | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `pptx` | PowerPoint | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| `pdf` | PDF | `application/pdf` |

### 3.4 Output Schema

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
      "filename": "progression_mathematiques_6e.docx",
      "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "size_bytes": 45678,
      "download_url": "https://api.anthropic.com/v1/files/file-abc123/content"
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

### 3.5 Logique interne n8n

```
1. POST https://api.anthropic.com/v1/messages
   Headers:
     - anthropic-version: 2023-06-01
     - anthropic-beta: files-api-2025-04-14
     - x-api-key: <api_key from payload>  ← BYOT

2. Parser la réponse pour extraire les file_id

3. Construire les download_url pour chaque fichier :
   https://api.anthropic.com/v1/files/{file_id}/content

4. Retourner la réponse avec références fichiers
```

---

## 4. Webhook `claude-call-stream-with-skills`

**Objectif** : Streaming + Anthropic Skills.

> ⚠️ **Anthropic uniquement** : Ce webhook utilise l'API Files spécifique à Anthropic.

### 4.1 Endpoint

```
POST /webhook/claude-call-stream-with-skills
Content-Type: application/json
```

### 4.2 Input Schema

Combine les champs de `claude-call-with-skills` et `llm-call-stream` :

```json
{
  "model": "claude-sonnet-4-20250514",
  "api_key": "sk-ant-api03-...",
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
      "filename": "document.docx",
      "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "size_bytes": 45678,
      "download_url": "https://api.anthropic.com/v1/files/file-xyz789/content"
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

## 5. Récapitulatif des webhooks

| Webhook | Provider | Streaming | Skills | Pattern |
|---------|----------|-----------|--------|---------|
| `llm-call-messages` | Multi | ❌ | ❌ | BYOT |
| `llm-call-stream` | Multi | ✅ (callback) | ❌ | BYOT |
| `claude-call-with-skills` | Anthropic | ❌ | ✅ | BYOT |
| `claude-call-stream-with-skills` | Anthropic | ✅ (callback) | ✅ | BYOT |

---

## 6. Notes d'implémentation

### 6.1 Pourquoi BYOT ?

Le pattern BYOT (Bring Your Own Token) a été choisi pour :

1. **Multi-tenant** : Chaque appelant utilise sa propre clé API et gère ses propres quotas/coûts
2. **Sécurité** : Pas de clé partagée exposée côté serveur n8n
3. **Flexibilité** : L'appelant peut changer de provider/modèle sans modification côté n8n
4. **Isolation** : Un rate limit d'un tenant n'affecte pas les autres

### 6.2 Streaming via callback

n8n ne supporte pas nativement le streaming SSE dans les Code nodes. L'architecture utilise donc un pattern callback :

1. Le client POST avec `callback_url` et `correlation_id`
2. n8n répond immédiatement avec `202 Accepted`
3. n8n consomme le stream du provider et envoie des paquets à `callback_url`
4. Le paquet final contient `"final": true` avec les métriques

### 6.3 Skills Anthropic

Les webhooks `claude-call-*-skills` restent Anthropic-only car :
- L'API Files est spécifique à Anthropic
- Le format `container.skills` est propriétaire Anthropic
- Les autres providers n'ont pas d'équivalent direct

---

## 7. Timeouts recommandés

| Webhook | Timeout HTTP | Notes |
|---------|--------------|-------|
| `llm-call-messages` | 120s | Synchrone |
| `llm-call-stream` | 10s | Réponse 202 immédiate |
| `claude-call-with-skills` | 300s | Génération fichiers |
| `claude-call-stream-with-skills` | 10s | Réponse 202 immédiate |

---

## 8. Checklist de validation

### Pour chaque webhook :

- [x] Endpoint accessible via POST
- [x] Validation BYOT (provider, model, api_key requis)
- [x] Parsing correct du payload
- [x] Appel provider avec bons headers
- [x] Gestion des erreurs provider (4xx, 5xx)
- [x] Format de réponse conforme au schéma
- [x] `metadata` passé en entrée retourné en sortie
- [x] Timeout configuré

### Tests E2E :

- [ ] `llm-call-messages` : message simple → réponse texte (3 providers)
- [ ] `llm-call-stream` : message → callbacks reçus → paquet final
- [ ] `claude-call-with-skills` : demande docx → fichier référencé
- [ ] `claude-call-stream-with-skills` : demande docx → callbacks + fichier final

---

## 9. Workflows n8n déployés

| Webhook | Workflow ID | Status |
|---------|-------------|--------|
| `llm-call-messages` | `V9aXcWyCd4omNDmA` | ✅ Actif |
| `llm-call-stream` | `jJe59jAy85SStBzT` | ✅ Actif |
| `claude-call-with-skills` | `lC0x41BDaZjUuule` | ✅ Actif |
| `claude-call-stream-with-skills` | `szbTydjALpuq3oqj` | ✅ Actif |

---

## 10. Références

- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Anthropic Streaming](https://docs.anthropic.com/en/api/streaming)
- [Anthropic Files API (beta)](https://docs.anthropic.com/en/api/files)
- [OpenAI Chat Completions](https://platform.openai.com/docs/api-reference/chat)
- [Mistral Chat API](https://docs.mistral.ai/api/)
- [RFC-085 Skills Engine](../rfc/RFC-085-SKILLS-ENGINE.md)
- [RFC-086 LLM Streaming](../rfc/RFC-086-LLM-STREAMING-ARCHITECTURE.md)
