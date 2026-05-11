# RFC-086 : Architecture Streaming LLM

| Métadonnée | Valeur |
|------------|--------|
| **Statut** | 🟡 Draft |
| **Auteur** | Équipe n8n |
| **Date** | 2026-05-11 |
| **Version** | 0.1.0 |
| **Dépendances** | RFC-072 (Batch), RFC-085 (Skills) |

---

## 1. Résumé

Cette RFC définit l'architecture de streaming pour les appels LLM à travers l'infrastructure Azy. Le problème est transversal : il concerne les skills (RFC-085), le chat conversationnel, et tout futur use case impliquant des appels LLM longs.

**Objectif** : Permettre le streaming temps réel des réponses LLM tout en garantissant que chat.api puisse auditer, facturer et logger chaque appel.

---

## 2. Problème

### 2.1 Contraintes actuelles

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Frontend │────▶│ chat.api │────▶│ Azy-MCP  │────▶│   n8n    │────▶│Anthropic │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │
                      ▼
               Doit intercepter :
               • Audit log
               • Token count
               • Billing
               • Rate limit
```

### 2.2 Problèmes identifiés

| Problème | Impact |
|----------|--------|
| **Timeout HTTP** | Appels LLM > 30-60s → timeout classique |
| **Pas de feedback UX** | L'utilisateur ne voit pas que "ça travaille" |
| **Billing à l'aveugle** | Si on ne voit pas le stream, on facture comment ? |
| **1 HTTP call par chunk** | Latence inacceptable, overhead réseau |

### 2.3 Cas d'usage concernés

- **Skills** (RFC-085) : `progression_pedagogique` peut durer 3-5 min
- **Chat conversationnel** : Réponses longues avec streaming tokens
- **Génération de documents** : `.docx`, `.pdf` via Anthropic Skills
- **Analyse de fichiers** : OCR + LLM sur documents volumineux

---

## 3. Solution proposée

### 3.1 Architecture cible

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Frontend │◀═══▶│ chat.api │◀═══▶│ Azy-MCP  │◀═══▶│   n8n    │────▶│Anthropic │
│          │     │          │     │          │     │          │     │  stream  │
│   SSE    │     │    WS    │     │    WS    │     │ SSE/WS   │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
                      │
                      ▼
               ┌─────────────┐
               │ Intercepte  │
               │ par PAQUETS │
               │ (pas chunk) │
               │             │
               │ • Audit log │
               │ • Token Σ   │
               │ • Billing   │
               └─────────────┘
```

### 3.2 Principe : Paquets de chunks (pas 1 HTTP par chunk)

Au lieu d'envoyer chaque token individuellement, n8n accumule et envoie par **paquets** :

```
Anthropic stream:
  token1 → token2 → token3 → token4 → token5 → ... → tokenN → [FIN]

n8n accumule:
  [token1, token2, token3] → PAQUET 1 (flush après 500ms ou 10 tokens)
  [token4, token5, ...]    → PAQUET 2
  ...
  [usage, stop_reason]     → PAQUET FINAL
```

### 3.3 Critères de flush d'un paquet

| Critère | Valeur suggérée | Justification |
|---------|-----------------|---------------|
| **Timeout** | 500ms | UX fluide, pas de latence perçue |
| **Nombre de tokens** | 20 tokens | Évite les micro-paquets |
| **Taille en bytes** | 4 KB | Limite overhead HTTP |
| **Event spécial** | `message_stop`, `error` | Toujours flush immédiat |

### 3.4 Format d'un paquet

```json
{
  "correlation_id": "skill-exec-abc123",
  "sequence": 3,
  "events": [
    { "type": "content_block_delta", "delta": { "text": "## Séquence 1" } },
    { "type": "content_block_delta", "delta": { "text": " : Les nombres" } },
    { "type": "content_block_delta", "delta": { "text": " entiers" } }
  ],
  "cumulative_tokens": 156,
  "timestamp": "2026-05-11T10:30:00.500Z"
}
```

### 3.5 Paquet final (obligatoire)

```json
{
  "correlation_id": "skill-exec-abc123",
  "sequence": 42,
  "events": [
    { "type": "message_stop" }
  ],
  "final": true,
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 5678
  },
  "model": "claude-sonnet-4-20250514",
  "duration_ms": 45230,
  "timestamp": "2026-05-11T10:30:45.230Z"
}
```

---

## 4. Flux détaillé

### 4.1 Initialisation

```
1. Frontend      → chat.api    : POST /api/llm/stream/init
                                 { model_tier, messages, context }

2. chat.api                    : Vérifie auth, quota, crédits
                                 Génère correlation_id
                                 Crée entrée audit (status: pending)

3. chat.api      → Azy-MCP     : WS message { type: "llm_start", ... }

4. Azy-MCP       → n8n         : POST /webhook/llm-call-stream
                                 { provider, model, api_key, ..., callback_url, correlation_id }

5. chat.api      → Frontend    : SSE connection ouverte
                                 { type: "stream_ready", correlation_id }
```

### 4.2 Streaming

```
6. n8n           → Anthropic   : POST /v1/messages (stream: true)

7. Anthropic     → n8n         : SSE events (token par token)

8. n8n accumule jusqu'à critère de flush :

9. n8n           → Azy-MCP     : POST callback_url
                                 { correlation_id, sequence, events[], cumulative_tokens }

10. Azy-MCP      → chat.api    : WS message { type: "llm_chunk", ... }

11. chat.api                   : Log audit, update token count

12. chat.api     → Frontend    : SSE event
                                 { type: "tokens", text: "## Séquence 1 : Les nombres" }
```

### 4.3 Finalisation

```
13. n8n          → Azy-MCP     : POST callback_url
                                 { correlation_id, final: true, usage: {...} }

14. Azy-MCP      → chat.api    : WS message { type: "llm_complete", ... }

15. chat.api                   : Finalise audit (status: success)
                                 Décompte crédits (usage.input + usage.output)

16. chat.api     → Frontend    : SSE event
                                 { type: "complete", usage: {...} }
```

---

## 5. Implémentation n8n

### 5.1 Nouveau webhook : `llm-call-stream` (Multi-Provider)

> ⚠️ **Pattern BYOT (Bring Your Own Token)** : Le caller fournit `provider`, `model`
> et `api_key`. Pas de fallback sur les variables d'environnement.

```
POST /webhook/llm-call-stream

Input:
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "api_key": "sk-ant-api03-...",
  "temperature": 0.7,
  "system": "...",
  "messages": [...],
  "max_tokens": 4096,
  "callback_url": "https://mcp.azy.solutions/api/llm/callback",
  "correlation_id": "skill-exec-abc123",
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

Output (immédiat):
{
  "status": "streaming",
  "correlation_id": "skill-exec-abc123"
}

Callbacks (asynchrones):
→ POST callback_url avec paquets de chunks
→ POST callback_url avec paquet final
```

**Providers supportés :**

| Provider | Endpoint streaming | Notes |
|----------|-------------------|-------|
| `anthropic` | `api.anthropic.com/v1/messages` | SSE natif |
| `openai` | `api.openai.com/v1/chat/completions` | SSE natif |
| `mistral` | `api.mistral.ai/v1/chat/completions` | SSE natif |

**Erreur si `api_key` manquant :**

```json
{
  "success": false,
  "error": {
    "code": "MISSING_API_KEY",
    "message": "api_key is required. No fallback to environment variables.",
    "http_status": 400
  }
}
```

### 5.2 Pseudo-code du workflow n8n (Multi-Provider)

```javascript
// Node 1: Webhook Trigger (llm-call-stream)
const input = $input.all()[0].json;
const { provider, model, api_key, temperature, callback_url, correlation_id, stream_config, metadata } = input;

// Node 2: Validation - api_key REQUIS (pas de fallback)
if (!api_key) {
  return {
    success: false,
    error: {
      code: 'MISSING_API_KEY',
      message: 'api_key is required. No fallback to environment variables.',
      http_status: 400
    }
  };
}

// Node 3: Configuration par provider
const PROVIDER_CONFIG = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'anthropic-version': '2023-06-01',
      'x-api-key': api_key,
      'content-type': 'application/json',
    },
    buildBody: (data) => ({
      model: data.model,
      system: data.system,
      messages: data.messages,
      max_tokens: data.max_tokens,
      temperature: data.temperature || 0.7,
      stream: true,
    }),
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${api_key}`,
      'content-type': 'application/json',
    },
    buildBody: (data) => ({
      model: data.model,
      messages: [
        ...(data.system ? [{ role: 'system', content: data.system }] : []),
        ...data.messages,
      ],
      max_tokens: data.max_tokens,
      temperature: data.temperature || 0.7,
      stream: true,
    }),
  },
  mistral: {
    url: 'https://api.mistral.ai/v1/chat/completions',
    headers: {
      'Authorization': `Bearer ${api_key}`,
      'content-type': 'application/json',
    },
    buildBody: (data) => ({
      model: data.model,
      messages: [
        ...(data.system ? [{ role: 'system', content: data.system }] : []),
        ...data.messages,
      ],
      max_tokens: data.max_tokens,
      temperature: data.temperature || 0.7,
      stream: true,
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
    }
  };
}

// Node 4: Code - Stream avec accumulation
const FLUSH_TIMEOUT = stream_config?.flush_timeout_ms || 500;
const FLUSH_TOKENS = stream_config?.flush_token_count || 20;
const FLUSH_BYTES = stream_config?.flush_size_bytes || 4096;

let buffer = [];
let bufferBytes = 0;
let sequence = 0;
let cumulativeTokens = 0;
let lastFlush = Date.now();

async function flush(isFinal = false, usage = null) {
  if (buffer.length === 0 && !isFinal) return;

  const packet = {
    correlation_id,
    sequence: ++sequence,
    events: buffer,
    cumulative_tokens: cumulativeTokens,
    timestamp: new Date().toISOString(),
    metadata, // Passthrough
  };

  if (isFinal) {
    packet.final = true;
    packet.usage = usage;
    packet.provider = provider;
    packet.model = model;
  }

  await $http.post(callback_url, packet, {
    headers: { 'X-Service-Token': $env.SERVICE_TOKEN }
  });

  buffer = [];
  bufferBytes = 0;
  lastFlush = Date.now();
}

// Stream depuis le provider
const response = await fetch(config.url, {
  method: 'POST',
  headers: config.headers,
  body: JSON.stringify(config.buildBody(input)),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const events = parseSSEEvents(chunk, provider); // Adapter parsing selon provider

  for (const event of events) {
    // Normaliser les events selon le provider
    if (isContentDelta(event, provider)) {
      buffer.push(normalizeEvent(event, provider));
      bufferBytes += JSON.stringify(event).length;
      cumulativeTokens++;
    }

    if (isUsageUpdate(event, provider)) {
      cumulativeTokens = extractOutputTokens(event, provider);
    }

    if (isStreamEnd(event, provider)) {
      await flush(true, extractUsage(event, provider));
      break;
    }

    // Critères de flush
    const shouldFlush =
      buffer.length >= FLUSH_TOKENS ||
      bufferBytes >= FLUSH_BYTES ||
      (Date.now() - lastFlush) >= FLUSH_TIMEOUT;

    if (shouldFlush) {
      await flush();
    }
  }
}

return { status: 'completed', correlation_id, provider, model };
```

---

## 6. Gestion des erreurs

### 6.1 Timeout Anthropic

```json
{
  "correlation_id": "skill-exec-abc123",
  "sequence": 5,
  "final": true,
  "error": {
    "type": "anthropic_timeout",
    "message": "Stream timeout after 120s"
  },
  "partial_usage": {
    "input_tokens": 1234,
    "output_tokens": 2000
  }
}
```

**Action chat.api** : Facturer les tokens partiels, logger l'erreur, notifier le frontend.

### 6.2 Erreur réseau callback

Si le POST vers `callback_url` échoue :

1. **Retry** : 3 tentatives avec backoff (100ms, 500ms, 2s)
2. **Fallback** : Stocker dans Redis avec TTL 5 min
3. **Dead letter** : Log l'échec, le stream est perdu

### 6.3 Déconnexion frontend

Le frontend peut se déconnecter pendant le stream. chat.api doit :

1. Continuer à recevoir les callbacks (pour billing)
2. Buffer les events dans Redis (TTL 5 min)
3. Permettre une reconnexion avec `GET /api/llm/stream/{correlation_id}/resume`

---

## 7. Considérations billing

### 7.1 Quand facturer ?

| Option | Avantage | Inconvénient |
|--------|----------|--------------|
| **À chaque paquet** | Facturation progressive | Complexe, micro-transactions |
| **Au paquet final** | Simple, atomique | Si crash avant final → pas facturé |
| **Réservation + ajustement** | Garanti | Surcharge initiale possible |

**Recommandation** : Réservation pessimiste au démarrage (basée sur `max_tokens`), ajustement au paquet final.

### 7.2 Tokens estimés vs réels

Les `cumulative_tokens` dans les paquets intermédiaires sont des **estimations**. Seul le paquet `final` contient le compte exact via `usage`.

---

## 8. Différence avec Batch éco (RFC-072)

| Aspect | Streaming (cette RFC) | Batch éco (RFC-072) |
|--------|----------------------|---------------------|
| **Décision** | Système (action longue) | Utilisateur (économie) |
| **Latence** | Temps réel | 1-24h |
| **Feedback** | Tokens streamés | Notification à la fin |
| **Coût** | Tarif standard | Tarif réduit (~50%) |
| **Use case** | Chat, skills interactifs | Génération en masse |

Les deux modes peuvent coexister. Le frontend peut proposer :
- "Générer maintenant" → Streaming
- "Générer en éco (moins cher)" → Batch RFC-072

---

## 9. Webhooks n8n à créer

| Webhook | Description | Multi-Provider | Priorité |
|---------|-------------|----------------|----------|
| `llm-call-stream` | Streaming avec callbacks par paquets | ✅ Oui (Anthropic, OpenAI, Mistral) | 🔴 Haute |
| `claude-call-stream-with-skills` | Streaming + Anthropic Skills (Files API) | ❌ Anthropic uniquement | 🔴 Haute |

> **Pourquoi `claude-call-stream-with-skills` reste Anthropic-only ?**
> Les Anthropic Skills (génération `.docx`, `.xlsx`) sont une fonctionnalité spécifique
> à l'API Anthropic. Il n'existe pas d'équivalent chez OpenAI ou Mistral.

---

## 10. Questions ouvertes

1. **Taille optimale des paquets** : 500ms / 20 tokens / 4KB sont des suggestions. À valider avec des tests de charge.

2. **Reconnexion mid-stream** : Le buffer Redis de 5 min suffit-il ? Faut-il un mécanisme de checkpoint plus robuste ?

3. **Métriques** : Quels métriques Prometheus exposer ?
   - `llm_stream_packets_total{correlation_id, status}`
   - `llm_stream_duration_seconds{model}`
   - `llm_stream_tokens_total{model, direction}`

4. **Compression** : Faut-il compresser les paquets (gzip) pour réduire la bande passante ?

---

## 11. Plan de déploiement

| Phase | Contenu | Durée |
|-------|---------|-------|
| **Phase 1** | Webhook `llm-call-stream` multi-provider + tests unitaires | 2-3j |
| **Phase 2** | Intégration Azy-MCP (réception callbacks) | 1j |
| **Phase 3** | Intégration chat.api (audit, billing, forward SSE) | 1-2j |
| **Phase 4** | Tests E2E avec frontend | 1j |
| **Phase 5** | Webhook `claude-call-stream-with-skills` (Anthropic only) | 1j |

**Total estimé : 6-8 jours**

---

## 12. Références

- [RFC-072 LLM Batch Manager](./RFC-072-LLM-BATCH-MANAGER.md)
- [RFC-085 Skills Engine](./RFC-085-SKILLS-ENGINE.md)
- [Anthropic Streaming API](https://docs.anthropic.com/en/api/streaming)
- [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
