# API Jobs & Credits pour n8n (RFC-016/RFC-017)

Documentation des endpoints pour l'intégration n8n avec le système de jobs et crédits.

---

## 1. Mise à jour d'un Job

### `PATCH /api/v2/jobs/{job_id}`

Met à jour le statut, la progression et les crédits d'un job.

#### Transitions d'état valides

```
pending → processing, cancelled
processing → completed, cancelled, failed
completed/cancelled/failed → (aucune transition permise)
```

#### Request

```json
{
  "status": "processing",
  "progress": {
    "current": 5,
    "total": 15,
    "percentage": 33,
    "step": "translating"
  },
  "credits": {
    "consumed": {
      "claude_tokens": {
        "input": 5000,
        "output": 2500,
        "total": 7500
      },
      "gpt_tokens": null,
      "total_tokens": 7500,
      "cost_usd": 0.015
    },
    "estimated_total": {
      "total_tokens": 22500,
      "cost_usd": 0.045
    }
  },
  "output": {
    "translated_url": "https://cdn.example.com/result.pdf",
    "page_count": 15
  },
  "error": null
}
```

#### Champs

| Champ | Type | Description |
|-------|------|-------------|
| `status` | string | `pending`, `processing`, `completed`, `cancelled`, `failed` |
| `progress.current` | int | Nombre d'éléments traités |
| `progress.total` | int | Nombre total d'éléments |
| `progress.percentage` | int | 0-100 |
| `progress.step` | string | Étape actuelle (ex: `ocr`, `translating`, `formatting`) |
| `credits.consumed` | object | Tokens consommés jusqu'à présent |
| `credits.estimated_total` | object | Estimation totale pour le job |
| `output` | object | Résultat du traitement (quand completed) |
| `error` | object | Erreur (quand failed) |

#### Response (200 OK)

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "project_id": "bot-appetit",
  "job_type": "pdf_translation",
  "status": "processing",
  "priority": 1,
  "context": {
    "guild_id": "123456789",
    "user_id": "987654321",
    "channel_id": "111222333"
  },
  "input": {
    "file_url": "https://cdn.discord.com/...",
    "filename": "menu.pdf",
    "source_lang": "en",
    "target_lang": "fr"
  },
  "progress": {
    "current": 5,
    "total": 15,
    "percentage": 33,
    "step": "translating"
  },
  "credits": {
    "consumed": {
      "total_tokens": 7500,
      "cost_usd": 0.015
    }
  },
  "output": null,
  "error": null,
  "created_at": "2026-01-22T10:00:00+00:00",
  "updated_at": "2026-01-22T10:05:00+00:00",
  "completed_at": null,
  "cancelled_at": null,
  "failed_at": null
}
```

#### Erreurs

**400 - Transition invalide**
```json
{
  "detail": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Cannot transition from 'completed' to 'cancelled'",
    "current_status": "completed",
    "requested_status": "cancelled",
    "allowed_transitions": []
  }
}
```

**404 - Job non trouvé**
```json
{
  "detail": "Job 550e8400-... not found"
}
```

---

## 2. Exemples de Workflows n8n

### 2.1 Démarrer le traitement

```json
PATCH /api/v2/jobs/{job_id}
{
  "status": "processing"
}
```

### 2.2 Mise à jour de progression (pendant le traitement)

```json
PATCH /api/v2/jobs/{job_id}
{
  "progress": {
    "current": 10,
    "total": 15,
    "percentage": 67,
    "step": "translating"
  },
  "credits": {
    "consumed": {
      "total_tokens": 15000,
      "cost_usd": 0.03
    }
  }
}
```

### 2.3 Marquer comme terminé

```json
PATCH /api/v2/jobs/{job_id}
{
  "status": "completed",
  "progress": {
    "current": 15,
    "total": 15,
    "percentage": 100,
    "step": "done"
  },
  "credits": {
    "consumed": {
      "total_tokens": 22500,
      "cost_usd": 0.045
    }
  },
  "output": {
    "translated_url": "https://cdn.example.com/result.pdf",
    "page_count": 15,
    "words_translated": 5000
  }
}
```

### 2.4 Marquer comme échoué

```json
PATCH /api/v2/jobs/{job_id}
{
  "status": "failed",
  "error": {
    "code": "OCR_FAILED",
    "message": "Unable to extract text from image",
    "details": "Page 3 is blank or corrupted"
  }
}
```

### 2.5 Annuler un job

```json
PATCH /api/v2/jobs/{job_id}
{
  "status": "cancelled"
}
```

---

## 3. Gestion des Crédits

### 3.1 Débiter des crédits

#### `POST /api/subscription/credits/{discord_user_id}/debit`

Débite des crédits d'un utilisateur avant ou après traitement.

#### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `project_id` | string | `torah` | ID du projet |

#### Request

```json
{
  "amount": 100,
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "pdf_translation"
}
```

| Champ | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | int | ✅ | Nombre de crédits à débiter (> 0) |
| `job_id` | string | ❌ | ID du job associé (traçabilité) |
| `reason` | string | ❌ | Raison du débit |

#### Response (200 OK)

```json
{
  "success": true,
  "project_id": "torah",
  "discord_user_id": "987654321",
  "operation": "debit",
  "amount": 100,
  "credits_before": 500,
  "credits_after": 400,
  "job_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Erreurs

**400 - Crédits insuffisants**
```json
{
  "detail": {
    "error": "INSUFFICIENT_CREDITS",
    "message": "User has 50 credits, needs 100",
    "credits_available": 50,
    "credits_requested": 100
  }
}
```

**404 - Utilisateur non trouvé**
```json
{
  "detail": {
    "found": false,
    "project_id": "torah",
    "discord_user_id": "987654321",
    "message": "User not found"
  }
}
```

---

### 3.2 Rembourser des crédits

#### `POST /api/subscription/credits/{discord_user_id}/refund`

Rembourse des crédits à un utilisateur (annulation, erreur, remboursement partiel).

#### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `project_id` | string | `torah` | ID du projet |

#### Request

```json
{
  "amount": 50,
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "reason": "job_cancelled"
}
```

| Champ | Type | Required | Description |
|-------|------|----------|-------------|
| `amount` | int | ✅ | Nombre de crédits à rembourser (> 0) |
| `job_id` | string | ❌ | ID du job associé (traçabilité) |
| `reason` | string | ❌ | Raison du remboursement |

#### Response (200 OK)

```json
{
  "success": true,
  "project_id": "torah",
  "discord_user_id": "987654321",
  "operation": "refund",
  "amount": 50,
  "credits_before": 400,
  "credits_after": 450,
  "job_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 4. Consulter les crédits

### `GET /api/subscription/credits/{discord_user_id}`

#### Query Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `project_id` | string | `torah` | ID du projet |

#### Response (200 OK)

```json
{
  "project_id": "torah",
  "discord_user_id": "987654321",
  "credits": 450,
  "has_credits": true
}
```

---

## 5. Flow complet recommandé

```
1. Job créé (status: pending)
         ↓
2. PATCH status: processing
         ↓
3. Vérifier crédits: GET /api/subscription/credits/{user_id}
         ↓
4. Si crédits insuffisants → PATCH status: failed + error
         ↓
5. Traitement avec mises à jour de progress
         ↓
6. Si succès:
   - PATCH status: completed + output
   - POST /credits/{user_id}/debit (crédits réels consommés)
         ↓
7. Si échec:
   - PATCH status: failed + error
   - (pas de débit)
         ↓
8. Si annulation:
   - PATCH status: cancelled
   - POST /credits/{user_id}/refund (si déjà débité)
```

---

## 6. Base URL

| Environnement | URL |
|---------------|-----|
| Développement | `http://localhost:3031` |
| Production | `https://api.torah-solutions.com` |
