# Contrat API - Webhooks Anthropic Skills

> **Version:** 1.0.0
> **Date:** 2026-05-12
> **Base URL:** `http://pi6.local:5678/webhook`
> **Pattern:** BYOT (Bring Your Own Token)

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Webhook: anthropic-list-skills](#2-webhook-anthropic-list-skills)
3. [Webhook: claude-call-with-skills](#3-webhook-claude-call-with-skills)
4. [Webhook: claude-call-stream-with-skills](#4-webhook-claude-call-stream-with-skills)
5. [Schémas communs](#5-schémas-communs)
6. [Codes d'erreur](#6-codes-derreur)

---

## 1. Vue d'ensemble

### 1.1 Architecture

Ces webhooks exposent les fonctionnalités **Anthropic Skills** (Files API) via n8n. Ils permettent de :

- **Lister** les skills disponibles (pré-construits et custom)
- **Générer** des documents (.docx, .xlsx, .pptx, .pdf) via Claude
- **Streamer** les réponses avec génération de fichiers

### 1.2 Pattern BYOT

Tous les webhooks utilisent le pattern **Bring Your Own Token** :

```
┌─────────────┐    api_key dans payload    ┌─────────────┐
│   Caller    │ ─────────────────────────► │   n8n       │
│ (chat.api)  │                            │  Webhook    │
└─────────────┘                            └──────┬──────┘
                                                  │
                                                  │ x-api-key header
                                                  ▼
                                           ┌─────────────┐
                                           │  Anthropic  │
                                           │     API     │
                                           └─────────────┘
```

**Important :** Aucun fallback sur variables d'environnement. L'`api_key` est **obligatoire** dans chaque requête.

### 1.3 Skills Anthropic disponibles

| Skill ID | Description | MIME Types |
|----------|-------------|------------|
| `docx` | Document Word | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `xlsx` | Feuille Excel | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `pptx` | Présentation PowerPoint | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| `pdf` | Document PDF | `application/pdf` |

### 1.4 Workflows n8n

| Webhook | Workflow ID | Status |
|---------|-------------|--------|
| anthropic-list-skills | `mK7qc0TZ4aBVwPSo` | ✅ Actif |
| claude-call-with-skills | `rk3zsg0cnzxQnGAm` | ✅ Actif |
| claude-call-stream-with-skills | `Q7DgbM7n5ybQB0UX` | ✅ Actif |

---

## 2. Webhook: anthropic-list-skills

### 2.1 Endpoint

```
POST /webhook/anthropic-list-skills
Content-Type: application/json
```

### 2.2 Description

Liste les skills Anthropic disponibles (pré-construits et custom). Utilise l'endpoint `GET /v1/skills` de l'API Anthropic avec le beta header `skills-2025-10-02`.

### 2.3 Request Payload

```json
{
  "api_key": "sk-ant-...",
  "source": "all",
  "betas": ["skills-2025-10-02"],
  "metadata": {}
}
```

#### Paramètres

| Champ | Type | Requis | Default | Description |
|-------|------|--------|---------|-------------|
| `api_key` | string | ✅ **OUI** | - | Clé API Anthropic |
| `source` | string | non | `"all"` | Filtre: `"all"`, `"anthropic"`, `"custom"` |
| `betas` | array | non | `["skills-2025-10-02"]` | Beta headers Anthropic |
| `metadata` | object | non | `{}` | Métadonnées passthrough |

### 2.4 Response (Success)

```json
{
  "success": true,
  "skills": [
    {
      "id": "docx",
      "display_title": "Word Document",
      "description": "Generate Microsoft Word documents",
      "source": "anthropic",
      "version": "latest",
      "mime_types": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      "max_file_size_bytes": 10485760
    },
    {
      "id": "xlsx",
      "display_title": "Excel Spreadsheet",
      "description": "Generate Microsoft Excel spreadsheets",
      "source": "anthropic",
      "version": "latest",
      "mime_types": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
      "max_file_size_bytes": 10485760
    }
  ],
  "summary": {
    "total": 4,
    "anthropic_count": 4,
    "custom_count": 0
  },
  "filter": "all",
  "metadata": {},
  "_trace": {
    "latency_ms": 234,
    "api_version": "2023-06-01",
    "beta": "skills-2025-10-02"
  }
}
```

### 2.5 Response (Error)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "api_key requis (BYOT pattern - aucun fallback sur env)",
    "http_status": 400
  },
  "metadata": {}
}
```

### 2.6 Exemple cURL

```bash
curl -X POST http://pi6.local:5678/webhook/anthropic-list-skills \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "sk-ant-api03-xxxxx",
    "source": "anthropic"
  }'
```

---

## 3. Webhook: claude-call-with-skills

### 3.1 Endpoint

```
POST /webhook/claude-call-with-skills
Content-Type: application/json
```

### 3.2 Description

Appel synchrone à Claude avec génération de fichiers via Anthropic Files API. Attend la réponse complète avant de retourner les fichiers générés.

### 3.3 Request Payload

```json
{
  "api_key": "sk-ant-...",
  "model": "claude-sonnet-4-20250514",
  "betas": ["files-api-2025-04-14"],
  "system": "You are a document generation assistant.",
  "messages": [
    {
      "role": "user",
      "content": "Crée un document Word avec un rapport trimestriel."
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
    "request_id": "req-123"
  }
}
```

#### Paramètres

| Champ | Type | Requis | Default | Description |
|-------|------|--------|---------|-------------|
| `api_key` | string | ✅ **OUI** | - | Clé API Anthropic |
| `model` | string | non | `"claude-sonnet-4-20250514"` | Modèle Claude |
| `betas` | array | non | `["files-api-2025-04-14"]` | Beta headers |
| `system` | string | non | `null` | System prompt |
| `messages` | array | ✅ **OUI** | - | Messages conversation |
| `max_tokens` | integer | non | `16000` | Tokens max |
| `container` | object | ✅ **OUI** | - | Configuration skills |
| `container.skills` | array | ✅ **OUI** | - | Liste des skills à utiliser |
| `tools` | array | non | `[]` | Tools additionnels |
| `metadata` | object | non | `{}` | Métadonnées passthrough |

#### Format container.skills

```json
{
  "skills": [
    {
      "type": "anthropic",
      "skill_id": "docx"
    }
  ]
}
```

### 3.4 Response (Success avec fichiers)

```json
{
  "success": true,
  "content": [
    {
      "type": "text",
      "text": "J'ai créé votre rapport trimestriel. Voici le document Word..."
    }
  ],
  "files": [
    {
      "file_id": "file_abc123xyz",
      "filename": "rapport_q1_2026.docx",
      "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "size_bytes": 45678,
      "download_url": "https://api.anthropic.com/v1/files/file_abc123xyz/content"
    }
  ],
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "usage": {
    "input_tokens": 156,
    "output_tokens": 1234
  },
  "stop_reason": "end_turn",
  "metadata": {
    "request_id": "req-123"
  },
  "_trace": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "latency_ms": 4567,
    "files_count": 1
  }
}
```

### 3.5 Response (Success sans fichiers)

```json
{
  "success": true,
  "content": [
    {
      "type": "text",
      "text": "Voici les informations demandées..."
    }
  ],
  "files": [],
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "usage": {
    "input_tokens": 100,
    "output_tokens": 500
  },
  "stop_reason": "end_turn",
  "metadata": {},
  "_trace": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "latency_ms": 2345,
    "files_count": 0
  }
}
```

### 3.6 Response (Error)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "container.skills requis (ex: [{ type: \"anthropic\", skill_id: \"docx\" }])",
    "http_status": 400
  },
  "metadata": {}
}
```

### 3.7 Exemple cURL

```bash
curl -X POST http://pi6.local:5678/webhook/claude-call-with-skills \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "sk-ant-api03-xxxxx",
    "model": "claude-sonnet-4-20250514",
    "messages": [
      {
        "role": "user",
        "content": "Génère un fichier Excel avec les ventes Q1 2026"
      }
    ],
    "container": {
      "skills": [{ "type": "anthropic", "skill_id": "xlsx" }]
    }
  }'
```

---

## 4. Webhook: claude-call-stream-with-skills

### 4.1 Endpoint

```
POST /webhook/claude-call-stream-with-skills
Content-Type: application/json
```

### 4.2 Description

Appel asynchrone avec streaming via callback HTTP. Retourne immédiatement un accusé de réception (202), puis envoie les paquets de streaming au `callback_url`. Le paquet final inclut les fichiers générés.

### 4.3 Flow

```
┌────────┐  1. POST request    ┌────────┐
│ Caller │ ──────────────────► │  n8n   │
│        │ ◄────────────────── │        │
└────────┘  2. 202 Accepted    └───┬────┘
     ▲                             │
     │  4. Callback packets        │ 3. Anthropic API
     │     (with files)            ▼
     │                        ┌────────────┐
     └─────────────────────── │ Anthropic  │
                              └────────────┘
```

### 4.4 Request Payload

```json
{
  "api_key": "sk-ant-...",
  "model": "claude-sonnet-4-20250514",
  "betas": ["files-api-2025-04-14"],
  "system": "You are a document generation assistant.",
  "messages": [
    {
      "role": "user",
      "content": "Crée une présentation PowerPoint."
    }
  ],
  "max_tokens": 16000,
  "container": {
    "skills": [
      {
        "type": "anthropic",
        "skill_id": "pptx"
      }
    ]
  },
  "callback_url": "https://my-service.com/webhook/stream-callback",
  "correlation_id": "corr-uuid-12345",
  "stream_config": {
    "flush_timeout_ms": 500,
    "flush_token_count": 20,
    "flush_size_bytes": 4096
  },
  "tools": [],
  "metadata": {
    "session_id": "sess-789"
  }
}
```

#### Paramètres

| Champ | Type | Requis | Default | Description |
|-------|------|--------|---------|-------------|
| `api_key` | string | ✅ **OUI** | - | Clé API Anthropic |
| `model` | string | non | `"claude-sonnet-4-20250514"` | Modèle Claude |
| `betas` | array | non | `["files-api-2025-04-14"]` | Beta headers |
| `system` | string | non | `null` | System prompt |
| `messages` | array | ✅ **OUI** | - | Messages conversation |
| `max_tokens` | integer | non | `16000` | Tokens max |
| `container` | object | ✅ **OUI** | - | Configuration skills |
| `callback_url` | string | ✅ **OUI** | - | URL de callback pour les paquets |
| `correlation_id` | string | ✅ **OUI** | - | ID de corrélation unique |
| `stream_config` | object | non | voir ci-dessous | Config streaming |
| `tools` | array | non | `[]` | Tools additionnels |
| `metadata` | object | non | `{}` | Métadonnées passthrough |

#### stream_config defaults

```json
{
  "flush_timeout_ms": 500,
  "flush_token_count": 20,
  "flush_size_bytes": 4096
}
```

### 4.5 Response immédiate (202 Accepted)

```json
{
  "success": true,
  "status": "streaming",
  "correlation_id": "corr-uuid-12345",
  "message": "Stream with skills initiated. Packets will be sent to callback_url."
}
```

### 4.6 Callback Packet (final avec fichiers)

Le webhook envoie ce paquet au `callback_url` :

```http
POST https://my-service.com/webhook/stream-callback
Content-Type: application/json
X-Correlation-ID: corr-uuid-12345
```

```json
{
  "correlation_id": "corr-uuid-12345",
  "sequence": 1,
  "events": [
    {
      "type": "content_block_delta",
      "delta": {
        "text": "Voici votre présentation PowerPoint..."
      }
    },
    {
      "type": "message_stop"
    }
  ],
  "final": true,
  "cumulative_tokens": 1500,
  "usage": {
    "input_tokens": 200,
    "output_tokens": 1300
  },
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "duration_ms": 5678,
  "timestamp": "2026-05-12T13:30:00.000Z",
  "metadata": {
    "session_id": "sess-789"
  },
  "files": [
    {
      "file_id": "file_xyz789",
      "filename": "presentation.pptx",
      "mime_type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "size_bytes": 123456,
      "download_url": "https://api.anthropic.com/v1/files/file_xyz789/content"
    }
  ]
}
```

### 4.7 Response (Error - validation)

```json
{
  "success": false,
  "status": "error",
  "correlation_id": "corr-uuid-12345",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "callback_url requis",
    "http_status": 400
  },
  "metadata": {}
}
```

### 4.8 Exemple cURL

```bash
curl -X POST http://pi6.local:5678/webhook/claude-call-stream-with-skills \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "sk-ant-api03-xxxxx",
    "model": "claude-sonnet-4-20250514",
    "messages": [
      {
        "role": "user",
        "content": "Génère un PDF avec un contrat de travail"
      }
    ],
    "container": {
      "skills": [{ "type": "anthropic", "skill_id": "pdf" }]
    },
    "callback_url": "https://my-service.com/callback",
    "correlation_id": "request-001"
  }'
```

---

## 5. Schémas communs

### 5.1 File Object (§3.4 compliant)

```typescript
interface FileObject {
  file_id: string;           // ID Anthropic du fichier
  filename: string;          // Nom du fichier (ex: "report.docx")
  mime_type: string;         // Type MIME
  size_bytes: number;        // Taille en bytes
  download_url: string;      // URL de téléchargement Anthropic
}
```

### 5.2 Error Object

```typescript
interface ErrorObject {
  code: string;              // Code erreur (ex: "VALIDATION_ERROR")
  message: string;           // Message descriptif
  http_status: number;       // Code HTTP associé
}
```

### 5.3 Usage Object

```typescript
interface UsageObject {
  input_tokens: number;      // Tokens en entrée
  output_tokens: number;     // Tokens en sortie
}
```

### 5.4 Trace Object

```typescript
interface TraceObject {
  provider: "anthropic";     // Provider utilisé
  model: string;             // Modèle utilisé
  latency_ms: number;        // Latence en ms
  files_count?: number;      // Nombre de fichiers générés
  api_version?: string;      // Version API
  beta?: string;             // Beta header utilisé
}
```

---

## 6. Codes d'erreur

### 6.1 Erreurs de validation (HTTP 400)

| Code | Message | Cause |
|------|---------|-------|
| `VALIDATION_ERROR` | `api_key requis` | api_key manquant ou invalide |
| `VALIDATION_ERROR` | `messages requis` | messages absent ou tableau vide |
| `VALIDATION_ERROR` | `container.skills requis` | container ou skills manquant |
| `VALIDATION_ERROR` | `callback_url requis` | callback_url absent (streaming) |
| `VALIDATION_ERROR` | `correlation_id requis` | correlation_id absent (streaming) |

### 6.2 Erreurs Anthropic (HTTP 500)

| Code | Message | Cause |
|------|---------|-------|
| `ANTHROPIC_ERROR` | Variable | Erreur retournée par l'API Anthropic |
| `authentication_error` | `Invalid API key` | Clé API invalide |
| `rate_limit_error` | `Rate limit exceeded` | Quota dépassé |
| `overloaded_error` | `API overloaded` | API surchargée |

### 6.3 Téléchargement fichiers

Pour télécharger un fichier généré, utilisez l'URL fournie avec la clé API :

```bash
curl -X GET "https://api.anthropic.com/v1/files/file_abc123xyz/content" \
  -H "x-api-key: sk-ant-api03-xxxxx" \
  -H "anthropic-version: 2023-06-01" \
  -o document.docx
```

---

## Changelog

| Version | Date | Changements |
|---------|------|-------------|
| 1.0.0 | 2026-05-12 | Version initiale avec 3 webhooks |
