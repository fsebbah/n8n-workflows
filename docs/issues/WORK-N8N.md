# Travail Équipe n8n

**Source:** RFC-016 + RFC-017
**Date:** 2026-01-22
**Priorité globale:** 🔴 Haute (Phase 1 - Fondations)

---

## Résumé

L'équipe n8n doit créer les webhooks de gestion des crédits et d'annulation, puis modifier les workers existants pour implémenter le pattern "check-before-process".

---

## Actions à réaliser

| # | Action | Priorité | Fichier | Dépendances |
|---|--------|----------|---------|-------------|
| 1 | Créer `/webhook/document-cancel` | 🔴 Haute | `Document-Cancel.json` | API: aucune |
| 2 | Créer `/webhook/credits-check` | 🔴 Haute | `Credits-Check.json` | API: endpoint existant |
| 3 | Créer `/webhook/credits-debit` | 🔴 Haute | `Credits-Debit.json` | API: Action 2 |
| 4 | Créer `/webhook/credits-refund` | 🔴 Haute | `Credits-Refund.json` | API: Action 3 |
| 5 | Modifier Torah-Translate-Worker | 🔴 Haute | `Torah-Translate-Worker.json` | Action 1 |
| 6 | Confirmer `auto_web_search` | 🔴 Haute | `MCP-LLM-Intention.json` | Aucune |
| 7 | Migrer format `response_type` | 🟡 Moyenne | `LLM-Intention.json` | Aucune |

---

## Action 1 : Créer webhook document-cancel

### Endpoint

```
POST /webhook/document-cancel
```

### Request

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "123456789",
  "reason": "user_requested"
}
```

### Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Document-Cancel Workflow                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│ Webhook Trigger │ POST /webhook/document-cancel
│ responseMode:   │
│ responseNode    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validate Input  │ job_id requis
│ Code Node       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GET Job Status  │ GET $env.API_URL/api/v2/jobs/{job_id}
│ HTTP Request    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Check Status    │ IF status in ['processing', 'pending']
│ IF Node         │
└────────┬────────┘
         │
    ┌────┴────────────────┐
    │                     │
    ▼                     ▼
 Can Cancel          Cannot Cancel
    │                     │
    ▼                     ▼
┌─────────────────┐  ┌─────────────────┐
│ PATCH Job       │  │ Return Error    │
│ status:cancelled│  │ "Cannot cancel" │
│ HTTP Request    │  │ Respond Node    │
└────────┬────────┘  └─────────────────┘
         │
         ▼
┌─────────────────┐
│ Build Response  │ credits_consumed, credits_saved
│ Code Node       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Respond         │ Return JSON
│ Respond Node    │
└─────────────────┘
```

### Nodes détaillés

#### Node: Validate Input

```javascript
const body = $input.first().json.body || $input.first().json;

if (!body.job_id) {
  throw new Error('job_id is required');
}

return [{
  json: {
    jobId: body.job_id,
    userId: body.user_id || null,
    reason: body.reason || 'user_requested'
  }
}];
```

#### Node: Check Status (IF)

```
Condition: {{ $json.status }} is equal to "processing"
OR
Condition: {{ $json.status }} is equal to "pending"
```

#### Node: Build Response

```javascript
const job = $('GET Job Status').first().json;
const input = $('Validate Input').first().json;

// Extraire les crédits du job
const credits = job.credits || job.output?.credits || {};
const consumed = credits.consumed || { total_tokens: 0, cost_usd: 0 };
const estimated = credits.estimated_total || consumed;

// Calculer les économies
const saved = {
  tokens_not_used: Math.max(0, (estimated.total_tokens || 0) - (consumed.total_tokens || 0)),
  cost_usd: Math.max(0, (estimated.cost_usd || 0) - (consumed.cost_usd || 0))
};

// Extraire la progression
const progress = job.progress || {};

return [{
  json: {
    success: true,
    job_id: input.jobId,
    previous_status: job.status,
    new_status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    credits_consumed: {
      total_tokens: consumed.total_tokens || 0,
      cost_usd: consumed.cost_usd || 0,
      segments_completed: progress.current || 0,
      segments_total: progress.total || 0
    },
    credits_saved: saved,
    message: `Job annulé. ${progress.current || 0}/${progress.total || '?'} segments traités. ${(consumed.cost_usd || 0).toFixed(3)}$ consommés, ${saved.cost_usd.toFixed(3)}$ économisés.`
  }
}];
```

### Response - Succès

```json
{
  "success": true,
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "previous_status": "processing",
  "new_status": "cancelled",
  "cancelled_at": "2026-01-22T10:02:15Z",
  "credits_consumed": {
    "total_tokens": 9000,
    "cost_usd": 0.015,
    "segments_completed": 5,
    "segments_total": 15
  },
  "credits_saved": {
    "tokens_not_used": 18000,
    "cost_usd": 0.030
  },
  "message": "Job annulé. 5/15 segments traités. 0.015$ consommés, 0.030$ économisés."
}
```

### Response - Erreur (job déjà terminé)

```json
{
  "success": false,
  "error": "cannot_cancel",
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "current_status": "completed",
  "message": "Cannot cancel job with status 'completed'"
}
```

---

## Action 2 : Créer webhook credits-check

### Endpoint

```
POST /webhook/credits-check
```

### Request

```json
{
  "discord_user_id": "123456789",
  "project_id": "torah"
}
```

### Workflow simplifié

```
Webhook Trigger
    │
    ▼
HTTP Request: GET $env.API_URL/api/subscription/credits/{discord_user_id}
    │
    ▼
Respond with result
```

### Response

```json
{
  "success": true,
  "discord_user_id": "123456789",
  "project_id": "torah",
  "credits_remaining": 100,
  "credits_total": 150
}
```

---

## Action 3 : Créer webhook credits-debit

### Endpoint

```
POST /webhook/credits-debit
```

### Request

```json
{
  "discord_user_id": "123456789",
  "project_id": "torah",
  "amount": 10,
  "reason": "document_translation",
  "job_id": "xxx"
}
```

### Workflow

```
Webhook Trigger
    │
    ▼
Validate Input (amount > 0, etc.)
    │
    ▼
HTTP Request: POST $env.API_URL/api/credits/{discord_user_id}/debit
    body: { project_id, amount, reason, job_id }
    │
    ▼
Respond with result (passthrough API response)
```

---

## Action 4 : Créer webhook credits-refund

### Endpoint

```
POST /webhook/credits-refund
```

### Request

```json
{
  "discord_user_id": "123456789",
  "project_id": "torah",
  "amount": 5,
  "reason": "job_cancelled",
  "job_id": "xxx"
}
```

### Workflow

Identique à credits-debit, mais appelle `POST /api/credits/{user_id}/refund`.

---

## Action 5 : Modifier Torah-Translate-Worker

### Pattern Check-Before-Process

Ajouter une vérification du status du job **avant chaque segment** dans la boucle.

### Modification du workflow

```
AVANT:
Loop Segments → Needs Pivot? → Claude → GPT → Save → Update Progress → Loop

APRÈS:
Loop Segments → [Check Job Status] → [IF cancelled?] → ...
                                           │
                                    ┌──────┴──────┐
                                    │             │
                                    ▼             ▼
                              Exit Early    Continue Normal
                              (cancelled)   (Needs Pivot? → ...)
```

### Nouveaux nodes à ajouter

#### Node: Check Job Status (Code)

**Position:** Après "Loop Segments", avant "Needs Pivot?"

```javascript
// Check if job has been cancelled
const jobId = $json.jobId;
const apiUrl = $env.API_URL;

try {
  const response = await fetch(`${apiUrl}/api/v2/jobs/${jobId}`);
  const job = await response.json();

  if (job.status === 'cancelled') {
    return [{
      json: {
        ...$json,
        shouldStop: true,
        stopReason: 'user_cancelled',
        cancelledAt: new Date().toISOString()
      }
    }];
  }

  if (job.status === 'failed') {
    return [{
      json: {
        ...$json,
        shouldStop: true,
        stopReason: 'job_failed'
      }
    }];
  }

  // Continue normally
  return [{
    json: {
      ...$json,
      shouldStop: false
    }
  }];
} catch (error) {
  // En cas d'erreur réseau, continuer (fail-open)
  console.error('Failed to check job status:', error);
  return [{
    json: {
      ...$json,
      shouldStop: false
    }
  }];
}
```

#### Node: Should Stop? (IF)

**Condition:** `{{ $json.shouldStop }}` equals `true`

- **True branch:** → Exit Early
- **False branch:** → Needs Pivot? (flux normal)

#### Node: Exit Early (Code)

```javascript
// Préparer le résumé pour sortie anticipée
const data = $json;

const consumed = data.accumulatedCredits || {
  total_tokens: 0,
  cost_usd: 0
};

const estimated = data.estimatedTotal || {
  total_tokens: consumed.total_tokens * (data.totalSegments / Math.max(1, data.segmentIndex + 1)),
  cost_usd: consumed.cost_usd * (data.totalSegments / Math.max(1, data.segmentIndex + 1))
};

const saved = {
  tokens_not_used: Math.max(0, estimated.total_tokens - consumed.total_tokens),
  cost_usd: Math.max(0, estimated.cost_usd - consumed.cost_usd)
};

return [{
  json: {
    jobId: data.jobId,
    status: 'cancelled',
    reason: data.stopReason,
    credits_consumed: {
      ...consumed,
      segments_completed: data.segmentIndex || 0,
      segments_total: data.totalSegments || 0
    },
    credits_saved: saved,
    partial_results: data.allTranslations || []
  }
}];
```

#### Node: PATCH Cancelled Status (HTTP Request)

```
Method: PATCH
URL: {{ $env.API_URL }}/api/v2/jobs/{{ $json.jobId }}
Body:
{
  "status": "cancelled",
  "output": {
    "credits": {
      "consumed": {{ $json.credits_consumed }},
      "saved": {{ $json.credits_saved }}
    },
    "partial_results": {{ $json.partial_results }}
  }
}
```

### Connexions à modifier

```
Loop Segments (output 1: done) → Prepare Final Result (inchangé)
Loop Segments (output 2: loop) → Check Job Status (NOUVEAU)

Check Job Status → Should Stop?

Should Stop? (true) → Exit Early → PATCH Cancelled → Done
Should Stop? (false) → Needs Pivot? (flux existant)
```

### Accumulation des crédits

Modifier le node "Prepare Update" pour accumuler les crédits :

```javascript
// Dans Prepare Update, ajouter l'accumulation
const prevAccumulated = $json.accumulatedCredits || {
  claude_tokens: { input: 0, output: 0, total: 0 },
  gpt_tokens: { input: 0, output: 0, total: 0 },
  total_tokens: 0,
  cost_usd: 0
};

const claudeUsage = prevData.claudeUsage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
const gptUsage = prevData.gptUsage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 };

const accumulatedCredits = {
  claude_tokens: {
    input: prevAccumulated.claude_tokens.input + claudeUsage.input_tokens,
    output: prevAccumulated.claude_tokens.output + claudeUsage.output_tokens,
    total: prevAccumulated.claude_tokens.total + claudeUsage.total_tokens
  },
  gpt_tokens: {
    input: prevAccumulated.gpt_tokens.input + gptUsage.input_tokens,
    output: prevAccumulated.gpt_tokens.output + gptUsage.output_tokens,
    total: prevAccumulated.gpt_tokens.total + gptUsage.total_tokens
  },
  total_tokens: prevAccumulated.total_tokens + claudeUsage.total_tokens + gptUsage.total_tokens
};

// Calculer le coût
const RATES = {
  claude: { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
  gpt: { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 }
};

accumulatedCredits.cost_usd = (
  accumulatedCredits.claude_tokens.input * RATES.claude.input +
  accumulatedCredits.claude_tokens.output * RATES.claude.output +
  accumulatedCredits.gpt_tokens.input * RATES.gpt.input +
  accumulatedCredits.gpt_tokens.output * RATES.gpt.output
);

// Ajouter à la sortie
return [{
  json: {
    ...prevData,
    accumulatedCredits: accumulatedCredits,
    // ... reste du code existant
  }
}];
```

---

## Action 6 : Confirmer auto_web_search

### Vérification

Le flag `auto_web_search` a été ajouté au workflow `MCP-LLM-Intention.json`.

### Comportement attendu

| `auto_web_search` | Comportement |
|-------------------|--------------|
| `true` (défaut) | Lance la recherche web automatiquement |
| `false` | Retourne `response_type: "action_proposal"` avec action `web_search` |

### Test à effectuer

```bash
# Test avec auto_web_search: false
curl -X POST http://localhost:5678/webhook/mcp-llm-intention \
  -H "Content-Type: application/json" \
  -d '{
    "query": "recette pizza",
    "context": {
      "type": "recipe",
      "auto_web_search": false
    }
  }'

# Doit retourner response_type: "action_proposal" avec proposed_actions
```

---

## Action 7 : Migrer format response_type

### Workflows concernés

- `LLM-Intention.json` (si distinct de mcp-llm-intention)

### Format de sortie standard

```json
{
  "success": true,
  "response_type": "message | action_proposal | error",
  "message": "...",
  "proposed_actions": [
    {
      "id": "translate",
      "label": "🌐 Traduire",
      "description": "Traduction complète du document",
      "webhook": "document-translate-worker",
      "params": { ... },
      "estimate": {
        "tokens_estimated": 45000,
        "cost_estimated_eur": 0.05,
        "time_estimated_seconds": 120
      }
    }
  ],
  "requires_confirmation": true
}
```

### Valeurs de `response_type`

| Valeur | Description |
|--------|-------------|
| `message` | Réponse textuelle simple |
| `action_proposal` | Proposition d'actions avec boutons |
| `error` | Erreur avec message |

---

## Checklist finale

### Phase 1 (Priorité haute)

- [ ] Créer `Document-Cancel.json`
- [ ] Créer `Credits-Check.json`
- [ ] Créer `Credits-Debit.json`
- [ ] Créer `Credits-Refund.json`
- [ ] Tester chaque webhook individuellement
- [ ] Confirmer `auto_web_search` fonctionne

### Phase 2 (Priorité haute)

- [ ] Modifier `Torah-Translate-Worker.json`
  - [ ] Ajouter node "Check Job Status"
  - [ ] Ajouter node "Should Stop?" (IF)
  - [ ] Ajouter node "Exit Early"
  - [ ] Ajouter node "PATCH Cancelled"
  - [ ] Modifier connexions
  - [ ] Accumuler les crédits

### Phase 3 (Priorité moyenne)

- [ ] Migrer format `response_type` dans LLM-Intention
- [ ] Modifier `Document-Translate-Worker.json` (même pattern)
- [ ] Documenter le pattern pour les futurs workers

### Tests d'intégration

- [ ] Scénario complet : lancer traduction → annuler mid-process → vérifier crédits
- [ ] Scénario crédits : check → debit → refund
- [ ] Scénario auto_web_search: false → vérifier action_proposal

---

## Variables d'environnement requises

```javascript
// ecosystem.config.js
{
  API_URL: 'http://pi6.local:3031',
  // ... autres variables existantes
}
```

---

## Contact

Pour questions sur ces spécifications :
- RFC-016 : Architecture globale
- RFC-017 : Détails job lifecycle et pattern check-before-process
