# RFC-017: Job Lifecycle & Credits Management

**Status:** Draft
**Date:** 2026-01-22
**Authors:** Équipe n8n + Plugin Torah + API Torah
**Target Teams:** chatbot-core, n8n-workflows, torah-api
**Scope:** Pattern GÉNÉRIQUE applicable à TOUS les workers

---

## Table des matières

1. [Résumé](#résumé)
2. [Problème actuel](#problème-actuel)
3. [Solution : Job Lifecycle Standard](#solution--job-lifecycle-standard)
4. [Grille tarifaire](#grille-tarifaire)
5. [ÉQUIPE API TORAH](#-équipe-api-torah)
6. [ÉQUIPE CHATBOT-CORE / PLUGIN](#-équipe-chatbot-core--plugin)
7. [ÉQUIPE N8N](#-équipe-n8n)
8. [Séquence complète](#séquence-complète-avec-annulation)
9. [Questions ouvertes](#questions-ouvertes)

---

## Résumé

Spécification du cycle de vie des jobs et du tracking des crédits/tokens applicable à **tous les workflows n8n**. Définit :

1. **États des jobs** et transitions valides
2. **Pattern d'annulation** avec check de status dans les boucles
3. **Tracking des crédits** consommés (tokens LLM, coûts)
4. **Remboursement** sur annulation/erreur

---

## Problème actuel

### Bouton Stop = Illusion d'annulation

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPORTEMENT ACTUEL                          │
└─────────────────────────────────────────────────────────────────┘

User clique "Stop"
       │
       ▼
┌──────────────────┐
│ Plugin: Stop     │
│ - _stop = True   │
│ - cancel polling │
└──────────────────┘
       │
       ▼
┌──────────────────┐     ┌──────────────────┐
│  Côté Client     │     │  Côté Serveur    │
│  ✅ "Annulé"     │     │  ❌ Continue !   │
│  ✅ UI fermée    │     │  ❌ Tokens burn  │
│  ✅ User content │     │  ❌ Pas de stop  │
└──────────────────┘     └──────────────────┘

Résultat:
- User pense avoir annulé → ❌ Faux
- Job continue en arrière-plan → ❌ Gaspillage
- Tokens consommés non trackés → ❌ Facturation incorrecte
- Pas de refund possible → ❌ Mauvaise UX
```

### Problèmes identifiés

| Problème | Impact |
|----------|--------|
| **Pas d'annulation serveur** | Jobs continuent, tokens gaspillés |
| **Pas de tracking temps réel** | Impossible de savoir les crédits consommés |
| **Pas de partial refund** | User paie même si annulé |
| **État incohérent** | Plugin dit "annulé", API dit "completed" |

---

## Solution : Job Lifecycle Standard

### États des jobs

```
┌─────────────────────────────────────────────────────────────────┐
│                      MACHINE À ÉTATS                             │
└─────────────────────────────────────────────────────────────────┘

                    ┌──────────┐
                    │ PENDING  │ ← Création initiale
                    └────┬─────┘
                         │
                    ┌────▼─────┐
                    │PROCESSING│ ← Worker démarre
                    └────┬─────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼─────┐   ┌────▼─────┐   ┌─────▼────┐
    │COMPLETED │   │CANCELLED │   │  FAILED  │
    │  ✅ OK   │   │  🛑 User │   │  ❌ Error│
    └──────────┘   └──────────┘   └──────────┘
```

### Transitions valides

| De | Vers | Trigger | Qui |
|----|------|---------|-----|
| `pending` | `processing` | Worker démarre | n8n |
| `pending` | `cancelled` | User annule avant démarrage | Plugin |
| `processing` | `completed` | Traitement terminé OK | n8n |
| `processing` | `cancelled` | User demande annulation | Plugin → n8n |
| `processing` | `failed` | Erreur technique | n8n |

### Structure Job complète

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "job_type": "torah_translation",
  "status": "processing",
  "created_at": "2026-01-22T10:00:00Z",
  "updated_at": "2026-01-22T10:01:30Z",
  "cancelled_at": null,
  "completed_at": null,

  "progress": {
    "current": 5,
    "total": 15,
    "percentage": 33,
    "step": "translating"
  },

  "credits": {
    "consumed": {
      "claude_tokens": { "input": 5000, "output": 2500, "total": 7500 },
      "gpt_tokens": { "input": 1000, "output": 500, "total": 1500 },
      "total_tokens": 9000,
      "cost_usd": 0.015
    },
    "estimated_total": {
      "total_tokens": 27000,
      "cost_usd": 0.045
    }
  },

  "input": { ... },
  "output": { ... },
  "error": null
}
```

---

## Grille tarifaire

### Tarifs LLM (janvier 2026)

| Provider | Model | Input ($/1M) | Output ($/1M) |
|----------|-------|--------------|---------------|
| Anthropic | claude-sonnet-4 | $3.00 | $15.00 |
| Anthropic | claude-haiku-3.5 | $0.25 | $1.25 |
| OpenAI | gpt-4o | $2.50 | $10.00 |
| OpenAI | gpt-4o-mini | $0.15 | $0.60 |
| Mistral | mistral-large | $2.00 | $6.00 |

### Fonction de calcul (référence)

```javascript
function calculateCost(credits) {
  const RATES = {
    claude_sonnet: { input: 3.00, output: 15.00 },
    gpt_4o: { input: 2.50, output: 10.00 }
  };

  const claudeCost = (
    credits.claude_tokens.input * RATES.claude_sonnet.input / 1_000_000 +
    credits.claude_tokens.output * RATES.claude_sonnet.output / 1_000_000
  );

  const gptCost = (
    credits.gpt_tokens.input * RATES.gpt_4o.input / 1_000_000 +
    credits.gpt_tokens.output * RATES.gpt_4o.output / 1_000_000
  );

  return {
    claude_usd: claudeCost,
    gpt_usd: gptCost,
    total_usd: claudeCost + gptCost,
    total_eur: (claudeCost + gptCost) * 0.92
  };
}
```

---

# 🔵 ÉQUIPE API TORAH

## Objectif

Supporter le tracking de progression et crédits dans les jobs, avec validation des transitions d'état.

## Endpoints existants (rappel)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `POST` | `/api/v2/jobs` | Créer un job |
| `GET` | `/api/v2/jobs/{job_id}` | Récupérer un job |
| `GET` | `/api/v2/jobs` | Lister les jobs (avec filtres) |
| `PATCH` | `/api/v2/jobs/{job_id}` | Mettre à jour status/progress/credits |
| `DELETE` | `/api/v2/jobs/{job_id}` | Supprimer (jobs pending uniquement) |

## Modifications requises

### 1. Supporter `progress` dans PATCH

```bash
PATCH /api/v2/jobs/{job_id}
Content-Type: application/json

{
  "status": "processing",
  "progress": {
    "current": 5,
    "total": 15,
    "percentage": 33,
    "step": "translating"
  }
}
```

**Question:** Le champ `progress` existe-t-il déjà dans le modèle Job ?

### 2. Supporter `credits` dans PATCH

```bash
PATCH /api/v2/jobs/{job_id}
Content-Type: application/json

{
  "status": "processing",
  "credits": {
    "consumed": {
      "claude_tokens": { "input": 5000, "output": 2500, "total": 7500 },
      "gpt_tokens": { "input": 1000, "output": 500, "total": 1500 },
      "total_tokens": 9000,
      "cost_usd": 0.015
    }
  }
}
```

**Question:** Le champ `credits` est-il déjà supporté ? Sinon, doit-il être dans `output.credits` ou au niveau racine ?

### 3. Valider les transitions d'état

L'API doit rejeter les transitions invalides :

| Transition | Valide | Erreur si invalide |
|------------|--------|-------------------|
| `pending` → `processing` | ✅ | - |
| `pending` → `cancelled` | ✅ | - |
| `processing` → `completed` | ✅ | - |
| `processing` → `cancelled` | ✅ | - |
| `processing` → `failed` | ✅ | - |
| `completed` → `cancelled` | ❌ | `400 Invalid state transition` |
| `cancelled` → `processing` | ❌ | `400 Invalid state transition` |
| `failed` → `completed` | ❌ | `400 Invalid state transition` |

### 4. Ajouter timestamps automatiques

```json
{
  "status": "cancelled",
  "cancelled_at": "2026-01-22T10:02:15Z"  // ← Auto-set par l'API
}
```

| Status | Timestamp auto |
|--------|---------------|
| `completed` | `completed_at` |
| `cancelled` | `cancelled_at` |
| `failed` | `failed_at` |

## Checklist API Torah

- [ ] Supporter `progress` dans PATCH /api/v2/jobs
- [ ] Supporter `credits` dans PATCH (définir emplacement)
- [ ] Valider les transitions d'état (rejeter invalides)
- [ ] Auto-set timestamps (cancelled_at, completed_at, failed_at)
- [ ] Documenter les changements dans l'API

## Questions pour l'équipe API

1. **Champ `progress`** : Existe-t-il déjà ? Si non, quel format préféré ?
2. **Champ `credits`** : Au niveau racine ou dans `output.credits` ?
3. **Validation transitions** : Déjà implémentée ou à ajouter ?
4. **Timestamps** : Gérés automatiquement ou envoyés par le client ?

---

# 🟢 ÉQUIPE CHATBOT-CORE / PLUGIN

## Objectif

Permettre une vraie annulation serveur quand l'utilisateur clique "Stop", et afficher les crédits consommés/économisés.

## Situation actuelle

```python
# Actuellement dans PollingService
async def cancel(self):
    self._cancelled = True
    # ❌ Pas d'appel serveur !
    return PollingResult(status=PollingStatus.CANCELLED)
```

**Problème:** Le serveur n'est jamais notifié, le job continue.

## Modifications requises

### 1. Ajouter `cancel_url` au PollingService

```python
# polling_service.py
class PollingService:
    def __init__(
        self,
        status_url: str,
        cancel_url: str | None = None,      # ← NOUVEAU
        cancel_params: dict | None = None,   # ← NOUVEAU
        ...
    ):
        self.status_url = status_url
        self.cancel_url = cancel_url
        self.cancel_params = cancel_params or {}
```

### 2. Appeler `cancel_url` dans cancel()

```python
# polling_service.py
async def cancel(self) -> PollingResult:
    """Annuler le polling ET notifier le serveur."""
    self._cancelled = True

    # ← NOUVEAU: Appeler le serveur pour vraiment annuler
    if self.cancel_url:
        try:
            async with aiohttp.ClientSession() as session:
                response = await session.post(
                    self.cancel_url,
                    json=self.cancel_params,
                    timeout=aiohttp.ClientTimeout(total=5)
                )

                if response.status == 200:
                    result = await response.json()
                    return PollingResult(
                        status=PollingStatus.CANCELLED,
                        data={
                            "credits_consumed": result.get("credits_consumed"),
                            "credits_saved": result.get("credits_saved"),
                            "message": result.get("message")
                        }
                    )
        except Exception as e:
            logger.error(f"Failed to cancel job on server: {e}")
            # Continue quand même avec l'annulation locale

    return PollingResult(status=PollingStatus.CANCELLED)
```

### 3. Passer `cancel_url` lors du démarrage

```python
# translate_views.py (ou équivalent)
class TranslateView:
    async def start_translation(self, interaction, document, ...):
        # 1. Créer le job
        job = await self.api.create_job(
            job_type="document_translation",
            input={...}
        )

        # 2. Lancer le worker n8n
        await self.n8n.call_webhook(
            "document-translate-worker",
            params={"job_id": job.id, ...}
        )

        # 3. Démarrer le polling AVEC cancel_url ← NOUVEAU
        polling_result = await self.polling_service.poll(
            status_url=f"{API_URL}/api/v2/jobs/{job.id}",
            cancel_url=f"{WEBHOOK_URL}/webhook/document-cancel",
            cancel_params={
                "job_id": job.id,
                "user_id": str(interaction.user.id),
                "reason": "user_requested"
            }
        )
```

### 4. Afficher les crédits à l'annulation

```python
# Callback du bouton Stop
async def on_stop_button(self, interaction: discord.Interaction):
    result = await self.polling_service.cancel()

    # Construire l'embed avec les infos de crédits
    if result.data and result.data.get("credits_consumed"):
        credits = result.data["credits_consumed"]
        saved = result.data.get("credits_saved", {})

        embed = discord.Embed(
            title="🛑 Traitement annulé",
            color=0xE74C3C
        )
        embed.add_field(
            name="Progression",
            value=f"{credits.get('segments_completed', '?')}/{credits.get('segments_total', '?')} segments",
            inline=True
        )
        embed.add_field(
            name="Consommé",
            value=f"{credits.get('cost_usd', 0):.3f} $",
            inline=True
        )
        embed.add_field(
            name="Économisé",
            value=f"{saved.get('cost_usd', 0):.3f} $",
            inline=True
        )

        await interaction.response.edit_message(embed=embed, view=None)
    else:
        # Fallback si pas d'infos crédits
        embed = discord.Embed(
            title="🛑 Traitement annulé",
            description="Le traitement a été interrompu.",
            color=0xE74C3C
        )
        await interaction.response.edit_message(embed=embed, view=None)
```

## Checklist chatbot-core

- [ ] Ajouter paramètres `cancel_url` et `cancel_params` au PollingService
- [ ] Modifier `cancel()` pour appeler le serveur
- [ ] Mettre à jour tous les appels à `poll()` pour passer `cancel_url`
- [ ] Afficher les crédits consommés/économisés à l'annulation
- [ ] Gérer le cas où l'appel cancel échoue (timeout, erreur réseau)

## Questions pour l'équipe Plugin

1. **PollingService** : Est-ce une classe existante ? Où est-elle définie ?
2. **Multiples workers** : Y a-t-il plusieurs endroits où on démarre un polling ?
3. **Crédits utilisateur** : Faut-il mettre à jour un solde de crédits côté plugin ?
4. **Historique** : Faut-il logger les annulations quelque part ?

---

# 🟠 ÉQUIPE N8N

## Objectif

1. Créer le webhook `/webhook/document-cancel`
2. Modifier tous les workers pour vérifier le status avant chaque opération
3. Tracker les crédits consommés à chaque étape

## 1. Webhook document-cancel

**Endpoint:** `POST /webhook/document-cancel`

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
┌─────────────────┐
│ Webhook Trigger │
│ document-cancel │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validate Input  │
│ - job_id requis │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ GET Job Status  │
│ /api/v2/jobs/   │
└────────┬────────┘
         │
    ┌────┴────┐
    │ status? │
    └────┬────┘
         │
    ┌────┴────────────────┐
    │                     │
    ▼                     ▼
processing/pending    completed/cancelled/failed
    │                     │
    ▼                     ▼
┌─────────────────┐  ┌─────────────────┐
│ PATCH job       │  │ Return error    │
│ status:cancelled│  │ "Cannot cancel" │
└────────┬────────┘  └─────────────────┘
         │
         ▼
┌─────────────────┐
│ Return credits  │
│ summary         │
└─────────────────┘
```

### Response

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

## 2. Pattern Check-Before-Process

**Chaque worker DOIT vérifier le status du job AVANT chaque opération coûteuse.**

### Flowchart

```
                    ┌─────────────────┐
                    │  Loop Segments  │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Check Job Status│ ◀── NOUVEAU NODE
                    │ GET /api/v2/job │
                    └────────┬────────┘
                             │
                   ┌─────────┴─────────┐
                   │                   │
              ┌────▼────┐         ┌────▼────┐
              │ IF      │         │ IF      │
              │cancelled│         │processing│
              └────┬────┘         └────┬────┘
                   │                   │
          ┌────────▼────────┐   ┌──────▼──────┐
          │ Exit Early      │   │ Process     │
          │ Return credits  │   │ Segment     │
          └─────────────────┘   └──────┬──────┘
                                       │
                                       ▼
                                ┌──────────────┐
                                │ PATCH job    │
                                │ progress++   │
                                │ credits++    │
                                └──────────────┘
```

### Code Node "Check Job Status"

```javascript
// Node: "Check Job Status"
// À ajouter dans chaque worker, après le loop et avant le traitement

const jobId = $json.jobId;
const apiUrl = $env.API_URL;

// Récupérer le status actuel du job
const response = await fetch(`${apiUrl}/api/v2/jobs/${jobId}`);
const job = await response.json();

// Vérifier si annulé ou en erreur
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

// Continuer normalement
return [{
  json: {
    ...$json,
    shouldStop: false
  }
}];
```

### Code Node "Exit if Cancelled"

```javascript
// Node: "Exit if Cancelled"
// Prépare le résumé des crédits si on doit s'arrêter

const data = $json;

if (!data.shouldStop) {
  // Ne devrait pas arriver si le workflow est bien configuré
  return [{ json: data }];
}

// Calculer les crédits économisés
const consumed = data.accumulatedCredits || { total_tokens: 0, cost_usd: 0 };
const estimated = data.estimatedTotal || { total_tokens: 0, cost_usd: 0 };

const saved = {
  tokens_not_used: estimated.total_tokens - consumed.total_tokens,
  cost_usd: estimated.cost_usd - consumed.cost_usd
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
    credits_saved: saved
  }
}];
```

## 3. Tracking des crédits à chaque segment

### Structure crédits accumulés

```javascript
// À maintenir tout au long du workflow
const accumulatedCredits = {
  claude_tokens: { input: 0, output: 0, total: 0 },
  gpt_tokens: { input: 0, output: 0, total: 0 },
  total_tokens: 0,
  cost_usd: 0
};
```

### Mise à jour après chaque segment

```javascript
// Node: "Accumulate Credits"
const prevCredits = $json.accumulatedCredits || {
  claude_tokens: { input: 0, output: 0, total: 0 },
  gpt_tokens: { input: 0, output: 0, total: 0 },
  total_tokens: 0,
  cost_usd: 0
};

const segmentUsage = {
  claude: $json.claudeUsage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  gpt: $json.gptUsage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
};

const newCredits = {
  claude_tokens: {
    input: prevCredits.claude_tokens.input + segmentUsage.claude.input_tokens,
    output: prevCredits.claude_tokens.output + segmentUsage.claude.output_tokens,
    total: prevCredits.claude_tokens.total + segmentUsage.claude.total_tokens
  },
  gpt_tokens: {
    input: prevCredits.gpt_tokens.input + segmentUsage.gpt.input_tokens,
    output: prevCredits.gpt_tokens.output + segmentUsage.gpt.output_tokens,
    total: prevCredits.gpt_tokens.total + segmentUsage.gpt.total_tokens
  },
  total_tokens: prevCredits.total_tokens + segmentUsage.claude.total_tokens + segmentUsage.gpt.total_tokens
};

// Calculer le coût
const RATES = {
  claude: { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
  gpt: { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 }
};

newCredits.cost_usd = (
  newCredits.claude_tokens.input * RATES.claude.input +
  newCredits.claude_tokens.output * RATES.claude.output +
  newCredits.gpt_tokens.input * RATES.gpt.input +
  newCredits.gpt_tokens.output * RATES.gpt.output
);

return [{
  json: {
    ...$json,
    accumulatedCredits: newCredits
  }
}];
```

## Workers à modifier

| Worker | Fichier | Priorité |
|--------|---------|----------|
| Torah-Translate-Worker | `Torah-Translate-Worker.json` | 🔴 Haute |
| Document-Translate-Worker | `Document-Translate-Worker.json` | 🔴 Haute |
| MCP-PDF-Extractor | `MCP-PDF-Extractor.json` | 🟡 Moyenne |
| MCP-Image-OCR | `MCP-Image-OCR.json` | 🟡 Moyenne |
| Autres workers avec boucles | À identifier | 🟢 Basse |

## Checklist n8n

- [ ] Créer workflow `Document-Cancel.json`
- [ ] Modifier `Torah-Translate-Worker.json` :
  - [ ] Ajouter node "Check Job Status" dans la boucle
  - [ ] Ajouter branche IF pour sortie anticipée
  - [ ] Accumuler les crédits à chaque segment
  - [ ] PATCH le job avec progress + credits
- [ ] Modifier `Document-Translate-Worker.json` (même pattern)
- [ ] Documenter le pattern pour les futurs workers

## Questions pour l'équipe n8n

1. **Overhead** : Un GET supplémentaire par segment est-il acceptable ?
2. **Timeout** : Quelle durée de timeout pour le check status ?
3. **Erreur check** : Que faire si le GET status échoue (réseau) ?
4. **Autres workers** : Quels autres workers ont des boucles à modifier ?

---

## Séquence complète avec annulation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SÉQUENCE: ANNULATION EN COURS DE TRAITEMENT              │
└─────────────────────────────────────────────────────────────────────────────┘

    User              Plugin              n8n Worker           API Torah
     │                  │                     │                    │
     │  Click "Start"   │                     │                    │
     ├─────────────────▶│                     │                    │
     │                  │  POST /api/v2/jobs  │                    │
     │                  ├────────────────────────────────────────▶│
     │                  │                     │     job created    │
     │                  │◀────────────────────────────────────────┤
     │                  │                     │                    │
     │                  │  POST /webhook/worker                   │
     │                  ├────────────────────▶│                    │
     │                  │     "received"      │                    │
     │                  │◀────────────────────┤                    │
     │                  │                     │                    │
     │                  │   [Start polling]   │   PATCH status:    │
     │                  │                     │   processing       │
     │                  │                     ├───────────────────▶│
     │                  │                     │                    │
     │                  │                     │ ┌────────────────┐ │
     │                  │                     │ │ Segment 1      │ │
     │                  │                     │ │ - Check status │ │
     │                  │                     │ │ - Translate    │ │
     │                  │                     │ │ - PATCH prog   │ │
     │                  │                     │ └────────────────┘ │
     │                  │   GET job (poll)    │                    │
     │                  ├────────────────────────────────────────▶│
     │                  │   progress: 1/15    │                    │
     │                  │◀────────────────────────────────────────┤
     │                  │                     │                    │
     │  Click "STOP"    │                     │                    │
     ├─────────────────▶│                     │                    │
     │                  │                     │                    │
     │                  │  POST /webhook/document-cancel          │
     │                  ├────────────────────▶│                    │
     │                  │                     │  PATCH status:     │
     │                  │                     │  cancelled         │
     │                  │                     ├───────────────────▶│
     │                  │                     │                    │
     │                  │   { cancelled,      │                    │
     │                  │     credits: {...}} │                    │
     │                  │◀────────────────────┤                    │
     │                  │                     │                    │
     │                  │                     │ ┌────────────────┐ │
     │                  │                     │ │ Segment 2      │ │
     │                  │                     │ │ - Check status │ │
     │                  │                     │ │ → CANCELLED!   │ │
     │                  │                     │ │ - EXIT loop    │ │
     │                  │                     │ └────────────────┘ │
     │                  │                     │                    │
     │  "Annulé,        │                     │                    │
     │   0.01$ utilisé" │                     │                    │
     │◀─────────────────┤                     │                    │
     │                  │                     │                    │
```

---

## Questions ouvertes

### Toutes équipes

1. **Granularité du check** : Vérifier avant chaque segment ou toutes les N secondes ?
2. **Race condition** : Que se passe-t-il si le cancel arrive pendant un appel LLM ?
3. **Retry policy** : Faut-il réessayer les segments échoués avant de marquer failed ?

### Prochaines étapes

1. Chaque équipe répond aux questions de sa section
2. Synchronisation inter-équipes pour valider les contrats
3. Implémentation par priorité (API → Plugin → n8n)

---

## Voir aussi

- **RFC-016**: Document Processing Architecture
- **RFC-010**: Loading View (Progress Indicator)
- **API Torah**: Documentation Jobs v2
