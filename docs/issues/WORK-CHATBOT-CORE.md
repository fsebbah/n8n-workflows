# Travail Équipe chatbot-core

**Source:** RFC-016 + RFC-017
**Date:** 2026-01-22
**Priorité globale:** 🔴 Haute (Phase 2 - Adaptation plugins)

---

## Résumé

L'équipe chatbot-core doit migrer le polling vers l'endpoint autoritaire, ajouter le support de l'annulation serveur via `cancel_url`, et supprimer le système Redis obsolète.

---

## Actions à réaliser

| # | Action | Priorité | Impact | Dépendances |
|---|--------|----------|--------|-------------|
| 1 | Migrer polling vers `/api/v2/jobs/{id}` | 🔴 Haute | `DocumentTranslationClient` | n8n: aucune |
| 2 | Supprimer `DocumentJobStore` (Redis) | 🔴 Haute | Nettoyage | Action 1 |
| 3 | Ajouter `cancel_url` au PollingService | 🔴 Haute | Voir RFC-017 | n8n: Action 1 |
| 4 | Adapter `CreditsClient` | 🟡 Moyenne | Via webhooks n8n | n8n: Actions 2-4 |
| 5 | Créer `DocumentWorkflowService` | 🟡 Moyenne | Nouveau service | Actions 1-3 |

---

## Action 1 : Migrer polling vers /api/v2/jobs/{id}

### Contexte

Deux endpoints de polling coexistent :
- `/api/v2/jobs/{job_id}` (API Torah - **AUTORITAIRE**)
- `/webhook/torah-job-status` (n8n - **DÉPRÉCIÉ**)

### Fichiers à modifier

```
services/n8n/document_translation.py
```

### Modification

```python
# AVANT
class DocumentTranslationClient:
    def __init__(self, n8n_client: N8NClient):
        self.status_endpoint = "/webhook/torah-job-status"

    async def get_job_status(self, job_id: str) -> TranslationJobStatus:
        response = await self.n8n_client.call_webhook(
            self.status_endpoint,
            params={"job_id": job_id}
        )
        # ...

# APRÈS
class DocumentTranslationClient:
    def __init__(self, n8n_client: N8NClient, api_url: str = None):
        self.api_url = api_url or os.getenv("API_URL", "http://localhost:3031")

    async def get_job_status(self, job_id: str) -> TranslationJobStatus:
        async with aiohttp.ClientSession() as session:
            url = f"{self.api_url}/api/v2/jobs/{job_id}"
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._parse_job_status(data)
                elif response.status == 404:
                    raise JobNotFoundError(job_id)
                else:
                    raise APIError(f"Failed to get job status: {response.status}")

    def _parse_job_status(self, data: dict) -> TranslationJobStatus:
        """Parse API response to TranslationJobStatus."""
        progress = data.get("progress", {})
        return TranslationJobStatus(
            job_id=data["id"],
            status=data["status"],
            progress=TranslationProgress(
                current=progress.get("current", 0),
                total=progress.get("total", 0),
                percentage=progress.get("percentage", 0),
                step=progress.get("step")
            ) if progress else None,
            output=data.get("output"),
            error=data.get("error"),
            created_at=data.get("created_at"),
            updated_at=data.get("updated_at")
        )
```

### Dataclass mise à jour

```python
@dataclass
class TranslationProgress:
    current: int
    total: int
    percentage: int
    step: str | None = None

@dataclass
class TranslationJobStatus:
    job_id: str
    status: str  # pending, processing, completed, cancelled, failed
    progress: TranslationProgress | None = None
    output: dict | None = None
    error: dict | None = None
    created_at: str | None = None
    updated_at: str | None = None
    completed_at: str | None = None
    cancelled_at: str | None = None

    @property
    def is_complete(self) -> bool:
        return self.status in ("completed", "cancelled", "failed")

    @property
    def is_success(self) -> bool:
        return self.status == "completed"

    @property
    def is_cancelled(self) -> bool:
        return self.status == "cancelled"
```

### Tests à mettre à jour

```python
# tests/services/test_document_translation.py

@pytest.mark.asyncio
async def test_get_job_status_from_api():
    """Test polling from /api/v2/jobs/{id}."""
    client = DocumentTranslationClient(n8n_client, api_url="http://test-api:3031")

    with aioresponses() as m:
        m.get(
            "http://test-api:3031/api/v2/jobs/test-job-123",
            payload={
                "id": "test-job-123",
                "status": "processing",
                "progress": {"current": 5, "total": 15, "percentage": 33},
                "output": None
            }
        )

        status = await client.get_job_status("test-job-123")

        assert status.status == "processing"
        assert status.progress.current == 5
        assert status.progress.percentage == 33
```

---

## Action 2 : Supprimer DocumentJobStore (Redis)

### Contexte

Le système Redis `document:job:*` est déprécié. MongoDB `/api/v2/jobs` est la source de vérité unique.

### Fichiers à supprimer ou modifier

```
services/jobs/document_job_store.py  → SUPPRIMER
tests/services/test_document_job_store.py → SUPPRIMER
```

### Références à nettoyer

Rechercher et supprimer toutes les références à :
- `DocumentJobStore`
- `document:job:`
- `redis.get("document:job:*")`

### Migration des données existantes

```python
# Script de migration one-shot (optionnel)
async def migrate_redis_jobs_to_mongodb():
    """Migrate existing Redis jobs to MongoDB."""
    redis_client = get_redis_client()
    api_client = get_api_client()

    # Récupérer tous les jobs Redis
    keys = await redis_client.keys("document:job:*")

    for key in keys:
        job_data = await redis_client.get(key)
        if job_data:
            job = json.loads(job_data)
            # Créer dans MongoDB si n'existe pas
            try:
                await api_client.post("/api/v2/jobs", json={
                    "id": job["id"],
                    "job_type": "document_translation",
                    "status": job["status"],
                    "output": job.get("result"),
                    "created_at": job.get("created_at")
                })
            except Exception as e:
                logger.warning(f"Job {job['id']} already exists or error: {e}")

    logger.info(f"Migrated {len(keys)} jobs from Redis to MongoDB")
```

---

## Action 3 : Ajouter cancel_url au PollingService

### Contexte

Actuellement, le bouton Stop arrête uniquement le polling côté client. Le job continue sur le serveur.

### Fichiers à modifier

```
services/polling/polling_service.py
```

### Modification PollingService

```python
# AVANT
class PollingService:
    def __init__(
        self,
        status_url: str,
        interval: float = 2.0,
        timeout: float = 600.0
    ):
        self.status_url = status_url
        self.interval = interval
        self.timeout = timeout
        self._cancelled = False

    async def cancel(self) -> PollingResult:
        self._cancelled = True
        return PollingResult(status=PollingStatus.CANCELLED)

# APRÈS
class PollingService:
    def __init__(
        self,
        status_url: str,
        cancel_url: str | None = None,
        cancel_params: dict | None = None,
        interval: float = 2.0,
        timeout: float = 600.0
    ):
        self.status_url = status_url
        self.cancel_url = cancel_url
        self.cancel_params = cancel_params or {}
        self.interval = interval
        self.timeout = timeout
        self._cancelled = False

    async def cancel(self) -> PollingResult:
        """Cancel polling and notify server."""
        self._cancelled = True

        # Notify server if cancel_url is provided
        if self.cancel_url:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        self.cancel_url,
                        json=self.cancel_params,
                        timeout=aiohttp.ClientTimeout(total=5)
                    ) as response:
                        if response.status == 200:
                            result = await response.json()
                            return PollingResult(
                                status=PollingStatus.CANCELLED,
                                data={
                                    "credits_consumed": result.get("credits_consumed"),
                                    "credits_saved": result.get("credits_saved"),
                                    "message": result.get("message"),
                                    "server_cancelled": True
                                }
                            )
                        else:
                            logger.warning(f"Cancel request failed: {response.status}")
            except asyncio.TimeoutError:
                logger.warning("Cancel request timed out")
            except Exception as e:
                logger.error(f"Failed to cancel job on server: {e}")

        return PollingResult(
            status=PollingStatus.CANCELLED,
            data={"server_cancelled": False}
        )
```

### Utilisation dans DocumentTranslationClient

```python
class DocumentTranslationClient:
    async def translate_document(
        self,
        document: Document,
        target_language: str,
        user_id: str,
        on_progress: Callable[[TranslationProgress], None] | None = None
    ) -> TranslationResult:
        # 1. Start translation
        job = await self._start_translation(document, target_language)

        # 2. Create polling service with cancel_url
        polling_service = PollingService(
            status_url=f"{self.api_url}/api/v2/jobs/{job.job_id}",
            cancel_url=f"{self.webhook_url}/webhook/document-cancel",
            cancel_params={
                "job_id": job.job_id,
                "user_id": user_id,
                "reason": "user_requested"
            },
            interval=2.0,
            timeout=600.0
        )

        # 3. Store reference for potential cancellation
        self._active_polling[job.job_id] = polling_service

        try:
            # 4. Poll until complete
            result = await polling_service.poll(on_progress=on_progress)
            return self._process_result(result)
        finally:
            del self._active_polling[job.job_id]

    async def cancel_translation(self, job_id: str) -> CancellationResult:
        """Cancel an active translation."""
        if job_id in self._active_polling:
            polling_service = self._active_polling[job_id]
            result = await polling_service.cancel()
            return CancellationResult(
                job_id=job_id,
                success=True,
                credits_consumed=result.data.get("credits_consumed"),
                credits_saved=result.data.get("credits_saved"),
                server_cancelled=result.data.get("server_cancelled", False)
            )
        else:
            raise JobNotFoundError(f"No active translation for job {job_id}")
```

### Dataclass pour résultat d'annulation

```python
@dataclass
class CancellationResult:
    job_id: str
    success: bool
    credits_consumed: dict | None = None
    credits_saved: dict | None = None
    server_cancelled: bool = False

    @property
    def message(self) -> str:
        if self.credits_consumed:
            consumed = self.credits_consumed.get("cost_usd", 0)
            saved = (self.credits_saved or {}).get("cost_usd", 0)
            segments = self.credits_consumed.get("segments_completed", 0)
            total = self.credits_consumed.get("segments_total", "?")
            return f"Annulé. {segments}/{total} segments. {consumed:.3f}$ consommés, {saved:.3f}$ économisés."
        return "Traitement annulé."
```

---

## Action 4 : Adapter CreditsClient

### Contexte

Les crédits passent maintenant par les webhooks n8n.

### Fichiers à modifier

```
services/credits/credits_client.py
```

### Modification

```python
class CreditsClient:
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url

    async def check_credits(self, discord_user_id: str, project_id: str) -> CreditsBalance:
        """Check user credits balance."""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.webhook_url}/webhook/credits-check",
                json={
                    "discord_user_id": discord_user_id,
                    "project_id": project_id
                }
            ) as response:
                data = await response.json()
                return CreditsBalance(
                    remaining=data.get("credits_remaining", 0),
                    total=data.get("credits_total", 0)
                )

    async def debit_credits(
        self,
        discord_user_id: str,
        project_id: str,
        amount: int,
        reason: str,
        job_id: str | None = None
    ) -> DebitResult:
        """Debit credits from user account."""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.webhook_url}/webhook/credits-debit",
                json={
                    "discord_user_id": discord_user_id,
                    "project_id": project_id,
                    "amount": amount,
                    "reason": reason,
                    "job_id": job_id
                }
            ) as response:
                if response.status == 402:
                    data = await response.json()
                    raise InsufficientCreditsError(
                        remaining=data.get("credits_remaining", 0),
                        requested=amount
                    )
                data = await response.json()
                return DebitResult(
                    success=data.get("success", False),
                    credits_remaining=data.get("credits_remaining", 0),
                    credits_debited=data.get("credits_debited", 0)
                )

    async def refund_credits(
        self,
        discord_user_id: str,
        project_id: str,
        amount: int,
        reason: str,
        job_id: str | None = None
    ) -> RefundResult:
        """Refund credits to user account."""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.webhook_url}/webhook/credits-refund",
                json={
                    "discord_user_id": discord_user_id,
                    "project_id": project_id,
                    "amount": amount,
                    "reason": reason,
                    "job_id": job_id
                }
            ) as response:
                data = await response.json()
                return RefundResult(
                    success=data.get("success", False),
                    credits_remaining=data.get("credits_remaining", 0),
                    credits_refunded=data.get("credits_refunded", 0)
                )
```

### Dataclasses

```python
@dataclass
class CreditsBalance:
    remaining: int
    total: int

    @property
    def used(self) -> int:
        return self.total - self.remaining

@dataclass
class DebitResult:
    success: bool
    credits_remaining: int
    credits_debited: int

@dataclass
class RefundResult:
    success: bool
    credits_remaining: int
    credits_refunded: int

class InsufficientCreditsError(Exception):
    def __init__(self, remaining: int, requested: int):
        self.remaining = remaining
        self.requested = requested
        super().__init__(f"Insufficient credits: {remaining} remaining, {requested} requested")
```

---

## Action 5 : Créer DocumentWorkflowService (Optionnel)

### Contexte

Service haut niveau RFC-016 compliant pour le flux conversationnel complet.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  DocumentWorkflowService (RFC-016 compliant)                     │
│  ─────────────────────────────────────────────────────────────   │
│  - Appelle mcp-llm-intention pour analyse                        │
│  - Gère proposed_actions et confirmation utilisateur             │
│  - Crée job via /api/v2/jobs                                     │
│  - Utilise DocumentTranslationClient pour l'exécution            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  DocumentTranslationClient (Low-level)                           │
│  ─────────────────────────────────────────────────────────────   │
│  - Appel direct au worker                                        │
│  - Polling                                                       │
│  - Annulation                                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Squelette

```python
class DocumentWorkflowService:
    """High-level service for conversational document processing (RFC-016)."""

    def __init__(
        self,
        n8n_client: N8NClient,
        api_client: APIClient,
        translation_client: DocumentTranslationClient,
        credits_client: CreditsClient
    ):
        self.n8n = n8n_client
        self.api = api_client
        self.translation = translation_client
        self.credits = credits_client

    async def analyze_intent(
        self,
        query: str,
        history: list[dict],
        context: dict,
        user: dict
    ) -> IntentResult:
        """Analyze user intent via MCP-LLM-Intention."""
        response = await self.n8n.call_webhook(
            "/webhook/mcp-llm-intention",
            json={
                "query": query,
                "history": history,
                "context": context,
                "user": user
            }
        )

        if response.get("response_type") == "action_proposal":
            return IntentResult(
                type="action_proposal",
                message=response.get("message"),
                proposed_actions=[
                    ProposedAction(**action)
                    for action in response.get("proposed_actions", [])
                ],
                requires_confirmation=response.get("requires_confirmation", True)
            )
        else:
            return IntentResult(
                type="message",
                message=response.get("message")
            )

    async def execute_action(
        self,
        action: ProposedAction,
        user_id: str,
        on_progress: Callable | None = None
    ) -> ActionResult:
        """Execute a proposed action after user confirmation."""
        # 1. Check credits
        estimate = action.estimate or {}
        estimated_cost = estimate.get("cost_estimated_credits", 0)

        if estimated_cost > 0:
            balance = await self.credits.check_credits(user_id, action.project_id)
            if balance.remaining < estimated_cost:
                raise InsufficientCreditsError(balance.remaining, estimated_cost)

        # 2. Create job
        job = await self.api.create_job(
            job_type=action.params.get("job_type", "document_processing"),
            input=action.params
        )

        try:
            # 3. Debit credits
            if estimated_cost > 0:
                await self.credits.debit_credits(
                    user_id,
                    action.project_id,
                    estimated_cost,
                    reason=action.id,
                    job_id=job.id
                )

            # 4. Execute via appropriate worker
            result = await self._execute_worker(
                action.webhook,
                job.id,
                action.params,
                on_progress
            )

            return ActionResult(
                success=True,
                job_id=job.id,
                result=result
            )

        except Exception as e:
            # Cleanup: delete job on failure
            await self.api.delete_job(job.id)
            raise

    async def _execute_worker(
        self,
        webhook: str,
        job_id: str,
        params: dict,
        on_progress: Callable | None
    ):
        """Execute the appropriate worker based on webhook."""
        if webhook == "document-translate-worker":
            return await self.translation.translate_document(
                job_id=job_id,
                params=params,
                on_progress=on_progress
            )
        # Add other workers as needed
        else:
            raise ValueError(f"Unknown webhook: {webhook}")
```

---

## Checklist finale

### Phase 1 (Priorité haute)

- [ ] Migrer `get_job_status()` vers `/api/v2/jobs/{id}`
- [ ] Mettre à jour `TranslationJobStatus` dataclass
- [ ] Ajouter `cancel_url` et `cancel_params` au `PollingService`
- [ ] Implémenter `cancel()` avec appel serveur
- [ ] Tester annulation avec crédits retournés

### Phase 2 (Priorité haute)

- [ ] Supprimer `DocumentJobStore` (Redis)
- [ ] Nettoyer toutes les références Redis
- [ ] Exécuter migration one-shot (si données existantes)

### Phase 3 (Priorité moyenne)

- [ ] Adapter `CreditsClient` pour webhooks n8n
- [ ] Créer `DocumentWorkflowService` (optionnel)
- [ ] Intégrer avec `DocumentMentionHandler`

### Tests

- [ ] Test polling depuis `/api/v2/jobs/{id}`
- [ ] Test annulation avec `cancel_url`
- [ ] Test crédits check/debit/refund via webhooks

---

## Variables d'environnement

```python
# .env ou config
API_URL=http://pi6.local:3031
WEBHOOK_URL=http://pi6.local:5678
```

---

## Contact

Pour questions sur ces spécifications :
- RFC-016 : Architecture globale
- RFC-017 : Détails job lifecycle
