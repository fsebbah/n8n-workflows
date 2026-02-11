# RFC-031 : Option C - Appel Direct API Intent Events

**Date:** 2026-02-11
**Issue:** #285
**Statut:** Proposition technique

---

## 1. Contexte

### Problème actuel
L'architecture initiale (Option C Hybride) utilisait n8n comme intermédiaire :

```
chatbot-core → Redis Stream (intent:events) → n8n (polling) → API batch
```

**Blocage technique :** Le node Redis natif de n8n ne supporte pas les opérations Redis Streams (xRead, xAck, xAdd). L'utilisation de `ioredis` dans un Code node est bloquée par le Task Runner.

### Solution proposée
Appel direct de l'API par chatbot-core, sans intermédiaire :

```
chatbot-core → API batch (direct)
```

---

## 2. Architecture Cible

### Flux simplifié

```
┌─────────────────┐     POST /api/intent/events/batch     ┌─────────────┐
│  chatbot-core   │ ─────────────────────────────────────→│ api-backend │
│                 │                                        │             │
│  (après intent  │     { events: [...] }                 │  (insert    │
│   prediction)   │                                        │   Postgres) │
└─────────────────┘                                        └─────────────┘
```

### Avantages
- Suppression de la dépendance Redis Streams pour ce flux
- Latence réduite (pas de polling)
- Architecture simplifiée
- Pas de DLQ à gérer (retry natif HTTP)

### Inconvénients
- chatbot-core doit gérer les erreurs API
- Couplage direct chatbot-core ↔ api-backend

---

## 3. Spécification API (version initiale)

> **⚠️ OBSOLÈTE** — Voir **§9.2** pour la spécification réelle après implémentation api-backend.

### Endpoint

```
POST {API_URL}/api/intent/events/batch
```

### Headers

| Header | Valeur | Description |
|--------|--------|-------------|
| `Content-Type` | `application/json` | Format du body |
| `X-API-Key` | `{API_KEY}` | Authentification (optionnel selon config) |

### Request Body

```json
{
  "events": [
    {
      "message": "string",
      "tokens": ["string"],
      "domain": "string",
      "was_validated": boolean,
      "validation_type": "implicit" | "explicit",
      "confidence_at_prediction": number,
      "user_id": "string",
      "guild_id": "string",
      "tool_used": "string",
      "timestamp": "ISO8601 string"
    }
  ]
}
```

### Champs

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `message` | string | Oui | Message utilisateur original |
| `tokens` | string[] | Oui | Tokens extraits du message |
| `domain` | string | Oui | Domaine prédit (ex: "recettes", "shopping") |
| `was_validated` | boolean | Non | Si l'intent a été validé par l'utilisateur |
| `validation_type` | string | Non | "implicit" (usage) ou "explicit" (feedback) |
| `confidence_at_prediction` | number | Non | Score de confiance 0-1 |
| `user_id` | string | Oui | ID Discord de l'utilisateur |
| `guild_id` | string | Oui | ID du serveur Discord |
| `tool_used` | string | Non | Outil MCP utilisé si applicable |
| `timestamp` | string | Non | Timestamp ISO8601 (défaut: now) |

### Response Success (200)

```json
{
  "success": true,
  "data": {
    "inserted": 5,
    "duplicates": 0,
    "failed": 0
  }
}
```

### Response Error (4xx/5xx)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid event format",
    "details": [...]
  }
}
```

---

## 4. Implémentation chatbot-core

> **Note :** Ce code a été mis à jour selon les retours api-backend (§9).

### Python (httpx async)

```python
import httpx
import uuid
from typing import List, Dict, Any
from datetime import datetime
import os

API_URL = os.getenv("API_URL")
PROJECT_ID = os.getenv("PROJECT_ID")  # Tenant ID pour multi-tenant

async def send_intent_events(events: List[Dict[str, Any]]) -> bool:
    """
    Envoie les événements d'intent à l'API batch.

    Args:
        events: Liste des événements à envoyer (max 50)

    Returns:
        True si succès, False sinon
    """
    if not events:
        return True

    headers = {
        "Content-Type": "application/json",
        "X-Project-ID": PROJECT_ID  # Auth multi-tenant
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{API_URL}/api/intent/events/batch",
                headers=headers,
                json={"events": events}
            )

            # 201 Created = succès
            if response.status_code == 201:
                data = response.json()
                return data.get("success", False)
            else:
                # Log l'erreur mais ne bloque pas
                print(f"Intent events batch failed: {response.status_code} - {response.text}")
                return False

        except httpx.RequestError as e:
            print(f"Intent events batch error: {e}")
            return False
```

### Utilisation dans le flux de prédiction

```python
async def handle_intent_prediction(message: str, user_id: str, guild_id: str):
    """Handler principal de prédiction d'intent."""

    # 1. Prédiction (synchrone - critique)
    prediction = await predict_intent(message)

    # 2. Construire l'event avec stream_id unique (requis pour idempotence)
    event = {
        "stream_id": str(uuid.uuid4()),  # REQUIS - garantit l'idempotence
        "message": message,
        "tokens": prediction.tokens,
        "domain": prediction.domain,
        "was_validated": False,
        "validation_type": "implicit",  # ou "explicit", "clarification"
        "confidence_at_prediction": prediction.confidence,
        "user_id": user_id,  # Optionnel
        "guild_id": guild_id,  # Requis
        "tool_used": prediction.tool_used or "",
        "original_timestamp": datetime.utcnow().isoformat() + "Z"  # ISO8601 avec Z
    }

    # Fire-and-forget avec retry (safe grâce à l'idempotence sur stream_id)
    asyncio.create_task(send_intent_events_with_retry([event]))

    return prediction


async def send_intent_events_with_retry(events: List[Dict], max_retries: int = 3):
    """Envoie avec retry exponentiel."""
    for attempt in range(max_retries):
        if await send_intent_events(events):
            return True
        await asyncio.sleep(2 ** attempt)  # 1s, 2s, 4s

    # Après 3 échecs, log et abandonne (ou envoie vers une file locale)
    print(f"Failed to send {len(events)} intent events after {max_retries} retries")
    return False
```

### Batching pour haute fréquence

```python
from asyncio import Queue, create_task
from datetime import datetime, timedelta

class IntentEventsBatcher:
    """
    Buffer les événements et les envoie par batch.
    Utile si haute fréquence de messages.
    """

    def __init__(self, batch_size: int = 50, flush_interval: float = 5.0):
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self.queue: Queue = Queue()
        self.buffer: List[Dict] = []
        self.last_flush = datetime.utcnow()

    async def start(self):
        """Démarre le worker de flush."""
        create_task(self._flush_worker())

    async def add(self, event: Dict):
        """Ajoute un événement au buffer."""
        self.buffer.append(event)

        # Flush si batch_size atteint
        if len(self.buffer) >= self.batch_size:
            await self._flush()

    async def _flush_worker(self):
        """Worker qui flush périodiquement."""
        while True:
            await asyncio.sleep(self.flush_interval)
            if self.buffer:
                await self._flush()

    async def _flush(self):
        """Envoie le buffer actuel."""
        if not self.buffer:
            return

        events = self.buffer.copy()
        self.buffer.clear()
        self.last_flush = datetime.utcnow()

        await send_intent_events_with_retry(events)


# Usage
batcher = IntentEventsBatcher(batch_size=50, flush_interval=5.0)  # max 50 = limite API
await batcher.start()

# Dans le handler - IMPORTANT: générer stream_id AVANT d'ajouter au batcher
event = {
    "stream_id": str(uuid.uuid4()),  # Requis !
    "message": message,
    "tokens": tokens,
    "domain": domain,
    "guild_id": guild_id,
    # ... autres champs
}
await batcher.add(event)
```

---

## 5. Migration

### Étapes

1. ~~**api-backend** : Vérifier que l'endpoint `/api/intent/events/batch` existe et fonctionne~~ ✅ Fait (PR #2160, #2161)
2. **chatbot-core** : Implémenter `send_intent_events()` avec le code §4
3. **chatbot-core** : Intégrer l'appel après chaque prédiction d'intent
4. **n8n** : Désactiver le workflow `N8N - Intent Events Consumer`
5. **Redis** : Optionnel - supprimer le stream `intent:events` après période de transition

### Rollback

Si problème, réactiver le workflow n8n et revenir à l'écriture Redis Stream.

---

## 6. Monitoring

### Métriques à suivre

| Métrique | Description | Seuil alerte |
|----------|-------------|--------------|
| `intent_events_batch_success` | Requêtes réussies | < 95% |
| `intent_events_batch_latency_p99` | Latence P99 | > 500ms |
| `intent_events_batch_retry_count` | Nombre de retries | > 10/min |

### Logs

```python
# Exemple de log structuré
logger.info("intent_events_sent", extra={
    "count": len(events),
    "latency_ms": response_time,
    "success": True
})
```

---

## 7. Workflows n8n à désactiver

Une fois la migration terminée, désactiver ces workflows :

| Workflow | ID | Action |
|----------|----|----|
| `N8N - Intent Events Consumer` | p4DyIrOt9TwYbQTh | Désactiver |

Les workflows de monitoring DLQ peuvent être conservés pour d'autres usages Redis.

---

## 8. Checklist de déploiement

- [ ] Endpoint API `/api/intent/events/batch` fonctionnel
- [ ] Variables d'environnement `API_URL` configurées dans chatbot-core
- [ ] Code `send_intent_events()` implémenté et testé
- [ ] Tests d'intégration passent
- [ ] Workflow n8n désactivé
- [ ] Monitoring configuré
- [ ] Documentation mise à jour

---

## 9. Remarques api-backend (revue post-implémentation)

> Ajouté le 2026-02-11 après implémentation des endpoints (PR #2160, #2161).

### 9.1 Corrections par rapport au document initial

| # | Point du document | Réalité implémentée | Impact chatbot-core |
|---|-------------------|---------------------|---------------------|
| 1 | **Storage PostgreSQL** (diagramme §2) | **MongoDB** (`chatbot_analytics.intent_events`). Les events sont des documents analytiques à forte volumétrie — MongoDB est plus adapté que PostgreSQL pour ce cas. | Aucun — c'est transparent côté client HTTP |
| 2 | **`stream_id` absent** du payload (§3) | **`stream_id` requis** (string, 1-50 chars). Index unique MongoDB pour garantir l'idempotence. | chatbot-core **doit** générer un `stream_id` unique par event (UUID v4 recommandé) |
| 3 | **`timestamp`** (§3) | Renommé **`original_timestamp`** (ISO8601, optionnel). Le serveur ajoute `created_at` en UTC automatiquement. | Renommer le champ dans le payload |
| 4 | **`user_id` requis** (§3) | **`user_id` optionnel** (certains events système n'ont pas d'auteur) | Moins contraignant — peut rester vide |
| 5 | **Pas de `validation_type: "clarification"`** (§3) | Ajout de la valeur **`clarification`** en plus de `implicit` et `explicit` | Nouveau type utilisable si pertinent |
| 6 | **Auth `X-API-Key`** (§3) | Utiliser le middleware standard : header **`X-Project-ID`** = tenant_id | chatbot-core doit envoyer `X-Project-ID` |
| 7 | **Response `data` wrapper** (§3) | Réponse **plate** sans wrapper `data` | Adapter le parsing de la réponse |
| 8 | **Status code 200** (§3) | **201 Created** pour les insertions réussies | Accepter 201 comme succès |

### 9.2 Payload réel — POST `/api/intent/events/batch`

#### Request

```
POST {API_URL}/api/intent/events/batch
Content-Type: application/json
X-Project-ID: {TENANT_ID}
```

```json
{
  "events": [
    {
      "stream_id": "550e8400-e29b-41d4-a716-446655440000",
      "message": "Comment faire une quiche lorraine ?",
      "tokens": ["faire", "quiche", "lorraine"],
      "domain": "recettes",
      "was_validated": false,
      "validation_type": "implicit",
      "confidence_at_prediction": 0.87,
      "user_id": "123456789012345678",
      "guild_id": "987654321098765432",
      "tool_used": "recipe_search",
      "original_timestamp": "2026-02-11T14:30:00Z"
    }
  ]
}
```

#### Champs détaillés

| Champ | Type | Requis | Contraintes | Description |
|-------|------|--------|-------------|-------------|
| `stream_id` | string | **Oui** | 1-50 chars, **unique** | Identifiant unique de l'event (UUID v4). Permet l'idempotence : un 2e envoi avec le même `stream_id` sera comptabilisé comme doublon sans erreur. |
| `message` | string | **Oui** | min 1 char | Message utilisateur original |
| `tokens` | string[] | **Oui** | min 1 élément | Tokens extraits du message |
| `domain` | string | **Oui** | 1-50 chars | Domaine prédit (`recettes`, `courses`, `shopping`, `account`) |
| `was_validated` | boolean | Non | défaut: `false` | Si l'intent a été validé par l'utilisateur |
| `validation_type` | string | Non | `implicit` \| `explicit` \| `clarification` | Type de validation. `null` si non validé. |
| `confidence_at_prediction` | float | Non | 0.0 — 1.0 | Score de confiance du modèle |
| `user_id` | string | Non | max 50 chars | ID Discord de l'utilisateur |
| `guild_id` | string | **Oui** | 1-50 chars | ID du serveur Discord |
| `tool_used` | string | Non | max 100 chars | Outil MCP utilisé |
| `original_timestamp` | string | Non | ISO8601 | Timestamp de la prédiction côté chatbot-core. Le serveur ajoute `created_at` séparément. |

#### Response Success (201 Created)

```json
{
  "success": true,
  "inserted": 5,
  "duplicates": 0
}
```

#### Response Partielle (201 Created — duplicates ignorés)

```json
{
  "success": true,
  "inserted": 3,
  "duplicates": 2
}
```

#### Response Error — Validation (422)

```json
{
  "detail": [
    {
      "loc": ["body", "events", 0, "stream_id"],
      "msg": "Field required",
      "type": "missing"
    }
  ]
}
```

#### Response Error — Serveur (500)

```json
{
  "detail": "Internal server error"
}
```

### 9.3 Endpoint unitaire — POST `/api/intent/events`

Pour insérer un seul event (utile en mode fire-and-forget sans batching) :

```
POST {API_URL}/api/intent/events
Content-Type: application/json
X-Project-ID: {TENANT_ID}
```

```json
{
  "stream_id": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Comment faire une quiche lorraine ?",
  "tokens": ["faire", "quiche", "lorraine"],
  "domain": "recettes",
  "guild_id": "987654321098765432"
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "id": "65f1a2b3c4d5e6f7a8b9c0d1",
  "duplicate": false
}
```

### 9.4 Limites et contraintes

| Contrainte | Valeur | Notes |
|------------|--------|-------|
| Taille batch max | **50 events** | Au-delà → 422. Découper côté client. |
| Idempotence | Via `stream_id` unique | Les doublons sont silencieusement ignorés (pas d'erreur) |
| Rate limiting | Pas de limite spécifique | Dépend de la config globale du middleware |
| Timeout recommandé | **30s** | Conforme au code exemple httpx |

### 9.5 Recommandations pour chatbot-core

1. **Générer `stream_id`** : `str(uuid.uuid4())` à la création de chaque event
2. **Utiliser le batcher** : Le pattern `IntentEventsBatcher` du §4 est bon, adapter le payload
3. **Retry safe** : Grâce à l'idempotence sur `stream_id`, les retries ne créent pas de doublons
4. **Accepter 201** : Le code de succès est `201 Created`, pas `200 OK`
5. **Header `X-Project-ID`** : Obligatoire pour le routage multi-tenant

---

## 10. Contacts

| Équipe | Responsabilité |
|--------|---------------|
| **chatbot-core** | Implémentation client HTTP |
| **api-backend** | Endpoint batch |
| **infra** | Variables d'environnement, monitoring |
