# Demande: Observabilité des webhooks n8n

> Comment tracer les performances des 200+ workflows n8n sans modifier chaque workflow ?

**Statut:** 🟡 En discussion avec l'équipe n8n

## Contexte

Le plugin trace les appels aux webhooks n8n via Langfuse. Actuellement, on mesure :
- ✅ Latence totale du webhook (côté plugin)
- ✅ Input/Output du webhook
- ❌ Détail interne du workflow (étapes LLM, Qdrant, etc.)

## Problème

Pour tracer les étapes internes de n8n, deux options :

### Option A: n8n intègre Langfuse (❌ Rejetée)

```
Plugin → trace_id + credentials → n8n → Langfuse
```

**Problèmes:**
- Chaque plugin a ses propres credentials Langfuse
- Fuite de secrets vers n8n
- Charge de travail importante pour l'équipe n8n
- Couplage fort plugin ↔ n8n

### Option B: n8n retourne des métadonnées de timing (✅ Recommandée)

```
Plugin → webhook → n8n (mesure interne) → response + timing_metadata
```

**Avantages:**
- Pas de credentials à partager
- Simple à implémenter côté n8n
- Le plugin reconstruit les spans depuis les métadonnées

---

## Demande à l'équipe n8n

Ajouter un objet `_debug` ou `_timing` dans les réponses webhook :

```json
{
  "success": true,
  "query_analysis": { ... },
  "proposed_actions": [ ... ],

  "_timing": {
    "total_ms": 1250,
    "steps": [
      { "name": "llm_intention", "duration_ms": 800 },
      { "name": "qdrant_search", "duration_ms": 350 },
      { "name": "format_response", "duration_ms": 100 }
    ]
  }
}
```

### Champs demandés

| Champ | Type | Description |
|-------|------|-------------|
| `_timing.total_ms` | `number` | Durée totale du workflow |
| `_timing.steps` | `array` | Liste des étapes avec durée |
| `_timing.steps[].name` | `string` | Nom de l'étape (libre) |
| `_timing.steps[].duration_ms` | `number` | Durée de l'étape |

### Étapes suggérées à tracer

| Webhook | Étapes internes |
|---------|-----------------|
| `llm-request-validator` | `validation_llm` |
| `llm-intention` | `intention_llm`, `qdrant_search`, `format_analysis` |
| `llm-web-search` | `search_api`, `parse_results`, `format_llm` |

---

## Implémentation côté plugin

Le plugin créera les spans Langfuse depuis `_timing` :

```python
# conversation.py - après appel webhook
if "_timing" in response:
    for step in response["_timing"].get("steps", []):
        langfuse_client.span(
            name=step["name"],
            start_time=...,  # calculé depuis duration
            end_time=...,
        )
```

---

## Priorité

| Priorité | Action |
|----------|--------|
| P1 | Ajouter `_timing.total_ms` (1 ligne) |
| P2 | Ajouter `_timing.steps` pour les webhooks critiques |
| P3 | Étendre à tous les webhooks |

---

## Question clé : Comment appliquer à 200+ webhooks ?

Modifier chaque workflow manuellement n'est pas viable.

**Options possibles (à valider avec l'équipe n8n) :**

### Option 1: Middleware global n8n

n8n supporte-t-il un middleware/intercepteur qui wrappe TOUTES les réponses webhook ?

```
Webhook Request → Workflow → Response
                     ↓
              [Middleware global]
                     ↓
              Response + _timing headers
```

### Option 2: Node "Response Wrapper" réutilisable

Créer un node custom `timing-wrapper` à placer en fin de workflow :

```
[Workflow nodes...] → [Timing Wrapper] → Response
```

Ce node :
- Capture `workflow.startTime`
- Ajoute `_timing` au body ou headers
- Peut être ajouté via script à tous les workflows

### Option 3: Headers HTTP automatiques (le plus simple)

n8n peut-il configurer des headers de réponse globaux ?

```
X-N8N-Workflow-Id: workflow_123
X-N8N-Duration-Ms: 1250
X-N8N-Timestamp: 1710754200000
```

Avantages :
- Pas de modification du body JSON
- Compatible avec tous les workflows existants
- Le plugin lit simplement `response.headers`

### Option 4: Logs structurés côté n8n

Si n8n log déjà les exécutions, peut-on y accéder via API ?

```
GET /api/v1/executions/{id}
→ { duration_ms, steps: [...] }
```

Le plugin appellerait cette API après le webhook pour enrichir la trace.

---

## Questions pour l'équipe n8n

1. **Middleware global** : n8n supporte-t-il des intercepteurs de réponse ?

2. **Headers automatiques** : Peut-on configurer des headers ajoutés à TOUTES les réponses webhook ?

3. **API Executions** : L'API `/executions` expose-t-elle les durées par node ?

4. **Votre recommandation** : Quelle approche serait la plus simple à implémenter de votre côté ?

---

## Réponses de l'équipe n8n

### 1. Middleware global

**Réponse : ❌ Non supporté nativement**

n8n ne propose pas de middleware global pour intercepter toutes les réponses webhook. Alternatives possibles :
- Sub-workflow appelé en fin de chaîne
- Code partagé via environment variables

### 2. Headers automatiques

**Réponse : ❌ Pas de configuration globale**

Les headers sont définis par workflow dans le node `Respond to Webhook`. Pas de configuration centralisée.

**Alternative :** Un script de migration peut ajouter les headers à tous les nodes `respondToWebhook` existants.

### 3. API Executions

**Réponse : ✅ OUI - Meilleure option**

```bash
GET /api/v1/executions/{execution_id}
```

Retourne les durées par node :

```json
{
  "id": "12345",
  "finished": true,
  "stoppedAt": "2024-03-18T10:30:00.000Z",
  "startedAt": "2024-03-18T10:29:58.750Z",
  "data": {
    "executionData": {
      "nodeExecutionData": {
        "LLM Analyze Intent": [{ "startTime": 1710754198800, "executionTime": 850 }],
        "Qdrant Search": [{ "startTime": 1710754199650, "executionTime": 320 }]
      }
    }
  }
}
```

**Chaque node expose `executionTime` en millisecondes.**

### 4. Recommandation n8n

| Option | Effort n8n | Effort Plugin | Verdict |
|--------|------------|---------------|---------|
| Middleware global | ❌ Impossible | - | Non viable |
| Node wrapper | Moyen | Faible | Lourd à maintenir |
| Headers HTTP | Moyen | Faible | Bon compromis |
| **API Executions** | **Aucun** | **Moyen** | **✅ Recommandé** |

---

## Solution Retenue

### Option 4 : API Executions (zéro modification n8n)

L'API n8n expose déjà toutes les métriques nécessaires. **Aucune modification des 200+ workflows requise.**

**Implémentation côté plugin uniquement :**

```python
import time

# 1. Capturer le timestamp avant l'appel
start_ts = int(time.time() * 1000)

# 2. Appeler le webhook normalement
response = requests.post(f"{N8N_BASE}/webhook/llm-intention", json=payload)

# 3. Récupérer l'exécution correspondante via l'API
executions = n8n_api.get(
    "/executions",
    params={
        "workflowId": WORKFLOW_IDS["llm-intention"],
        "startedAfter": start_ts,
        "limit": 1,
        "status": "success"
    }
)

if executions["data"]:
    exec_id = executions["data"][0]["id"]
    exec_details = n8n_api.get(f"/executions/{exec_id}")

    # 4. Créer les spans Langfuse depuis les données n8n
    for node_name, node_data in exec_details["data"]["executionData"]["nodeExecutionData"].items():
        langfuse.span(
            name=f"n8n:{node_name}",
            duration_ms=node_data[0]["executionTime"]
        )
```

### Mapping workflow_id (côté plugin)

Le plugin maintient un mapping des webhooks vers leurs workflow IDs :

```python
WORKFLOW_IDS = {
    "llm-intention": "wf_abc123",
    "llm-web-search": "wf_def456",
    "llm-request-validator": "wf_ghi789",
    # ...
}
```

Ce mapping peut être :
- Hardcodé (simple)
- Chargé dynamiquement via `GET /api/v1/workflows`

### Effort estimé

| Équipe | Action | Effort |
|--------|--------|--------|
| **n8n** | **Aucune** | **0** |
| Plugin | Implémenter appel API `/executions` | ~3h |

---

## Prochaines étapes

- [ ] Plugin : Créer le mapping `webhook → workflow_id`
- [ ] Plugin : Implémenter `get_execution_metrics(workflow_id, start_ts)`
- [ ] Plugin : Intégrer avec Langfuse
- [ ] n8n : ~~Aucune action requise~~
