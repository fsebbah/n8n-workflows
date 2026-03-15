# RFC-040: Training Dataset API

**Status**: Draft v2
**Author**: MCP Team + API Backend Team
**Date**: 2026-03-15
**Parent**: RFC-037-B (Test Dataset Format)
**Issue**: #635

---

## Résumé

Cette RFC définit l'API backend pour générer et gérer les datasets de test pour l'analyse d'intentions (RFC-037). L'architecture utilise Celery pour l'exécution asynchrone, n8n pour la génération LLM, PostgreSQL pour les métadonnées et Backblaze B2 pour le stockage des fichiers.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FLUX DE GÉNÉRATION                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Client    │────▶│   API Backend   │────▶│     Celery      │
│  (Expert)   │     │   (FastAPI)     │     │  (Redis Queue)  │
└─────────────┘     └────────┬────────┘     └────────┬────────┘
      ▲                      │                       │
      │                      ▼                       ▼
      │              ┌───────────────┐       ┌───────────────┐
      │              │  PostgreSQL   │       │     n8n       │
      │              │ (DatasetJob)  │       │  (Generator)  │
      │              └───────────────┘       └───────┬───────┘
      │                      ▲                       │
      │                      │              ┌────────▼────────┐
      │              ┌───────┴───────┐      │  Claude + GPT   │
      │              │  Callback     │◀─────│  (LLM Gen/Rev)  │
      │              │  /complete    │      └─────────────────┘
      │              └───────┬───────┘
      │                      │
      │              ┌───────▼───────┐
      │              │  Backblaze B2 │
      │              │  (CSV files)  │
      └──────────────┴───────────────┘
```

### Flux détaillé

1. **Client** → `POST /api/v1/training/dataset/generate`
2. **API** → Crée `DatasetJob` en DB (status=`pending`)
3. **API** → Enqueue Celery task `generate_dataset_task`
4. **Celery** → Appelle webhook n8n avec `callback_url`
5. **n8n** → Génère dataset (Qdrant → Claude → GPT → CSV)
6. **n8n** → `POST {callback_url}` avec résultat
7. **API Callback** → Upload CSV vers B2
8. **API Callback** → Update `DatasetJob` (status=`completed`, file_url)
9. **Client** → `GET /api/v1/training/dataset/job/{id}` → récupère statut
10. **Client** → `GET {presigned_url}` → télécharge depuis B2

---

## Endpoints

### Vue d'ensemble

| Méthode | Endpoint | Description | Auth |
|---------|----------|-------------|------|
| POST | `/api/v1/training/dataset/generate` | Démarre la génération | ✅ |
| GET | `/api/v1/training/dataset/job/{job_id}` | Statut d'un job | ✅ |
| GET | `/api/v1/training/dataset/list` | Liste les datasets | ✅ |
| GET | `/api/v1/training/dataset/{dataset_id}` | Détails d'un dataset | ✅ |
| GET | `/api/v1/training/dataset/{dataset_id}/download` | URL de téléchargement | ✅ |
| DELETE | `/api/v1/training/dataset/{dataset_id}` | Supprime un dataset | ✅ |
| POST | `/api/v1/training/dataset/job/{job_id}/complete` | Callback n8n (interne) | 🔑 |

---

## POST /api/v1/training/dataset/generate

Démarre la génération d'un dataset de test.

### Request

#### Headers

```
Authorization: Bearer {firebase_token}
Content-Type: application/json
```

#### Body

```json
{
  "domain": "shopping",
  "categories": ["simple", "ambigu", "multi-étape", "elliptique"],
  "count_per_category": 10,
  "tools_focus": ["cart-add", "cart-checkout", "orders-list"],
  "language": "fr",
  "name": "Dataset Shopping Q1 2026",
  "description": "Dataset de test pour le domaine e-commerce",
  "metadata": {
    "project": "rfc037-evaluation",
    "version": "1.0"
  }
}
```

#### Paramètres

| Champ | Type | Requis | Défaut | Contraintes | Description |
|-------|------|--------|--------|-------------|-------------|
| `domain` | string | ✅ | - | 1-100 chars | Domaine de formation |
| `categories` | string[] | ❌ | toutes | Enum | Catégories à générer |
| `count_per_category` | integer | ❌ | 10 | 1-100 | Cas par catégorie |
| `tools_focus` | string[] | ❌ | null | Outils Qdrant | Outils à privilégier |
| `language` | string | ❌ | "fr" | "fr", "en" | Langue des demandes |
| `name` | string | ❌ | auto | 1-255 chars | Nom du dataset |
| `description` | string | ❌ | null | 0-1000 chars | Description |
| `metadata` | object | ❌ | {} | - | Métadonnées libres |

#### Valeurs `categories`

```json
["simple", "ambigu", "multi-étape", "elliptique"]
```

### Response 202 Accepted

```json
{
  "success": true,
  "job": {
    "id": "dsjob_01HQXYZ123456789",
    "status": "pending",
    "created_at": "2026-03-15T14:30:00Z",
    "estimated_duration_seconds": 120,
    "poll_url": "/api/v1/training/dataset/job/dsjob_01HQXYZ123456789"
  },
  "message": "Dataset generation started"
}
```

### Response 400 Bad Request

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {"field": "domain", "message": "Field required"},
      {"field": "count_per_category", "message": "Value must be between 1 and 100"}
    ]
  }
}
```

### Response 422 Unprocessable Entity

```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOOLS",
    "message": "Some tools do not exist in Qdrant",
    "details": {
      "invalid_tools": ["mcp-outlook", "unknown-tool"],
      "suggestion": "Use GET /api/v1/tools/list to see available tools"
    }
  }
}
```

---

## GET /api/v1/training/dataset/job/{job_id}

Récupère le statut d'un job de génération.

### Request

#### Headers

```
Authorization: Bearer {firebase_token}
```

#### Path Parameters

| Paramètre | Type | Description |
|-----------|------|-------------|
| `job_id` | string | ID du job (format: `dsjob_*`) |

### Response 200 OK - Pending

```json
{
  "success": true,
  "job": {
    "id": "dsjob_01HQXYZ123456789",
    "status": "pending",
    "created_at": "2026-03-15T14:30:00Z",
    "updated_at": "2026-03-15T14:30:00Z",
    "progress": null
  }
}
```

### Response 200 OK - Running

```json
{
  "success": true,
  "job": {
    "id": "dsjob_01HQXYZ123456789",
    "status": "running",
    "created_at": "2026-03-15T14:30:00Z",
    "updated_at": "2026-03-15T14:30:15Z",
    "started_at": "2026-03-15T14:30:05Z",
    "progress": {
      "phase": "generating",
      "categories_completed": 2,
      "categories_total": 4,
      "current_category": "multi-étape"
    }
  }
}
```

### Response 200 OK - Completed

```json
{
  "success": true,
  "job": {
    "id": "dsjob_01HQXYZ123456789",
    "status": "completed",
    "created_at": "2026-03-15T14:30:00Z",
    "updated_at": "2026-03-15T14:32:30Z",
    "started_at": "2026-03-15T14:30:05Z",
    "completed_at": "2026-03-15T14:32:30Z",
    "duration_ms": 145000
  },
  "dataset": {
    "id": "ds_01HQABC987654321",
    "name": "Dataset Shopping Q1 2026",
    "filename": "rfc037_test_dataset_shopping_20260315.csv",
    "domain": "shopping",
    "total_cases": 40,
    "by_category": {
      "simple": 10,
      "ambigu": 10,
      "multi-étape": 10,
      "elliptique": 10
    },
    "file_size_bytes": 15234,
    "download_url": "/api/v1/training/dataset/ds_01HQABC987654321/download",
    "created_at": "2026-03-15T14:32:30Z"
  }
}
```

### Response 200 OK - Failed

```json
{
  "success": false,
  "job": {
    "id": "dsjob_01HQXYZ123456789",
    "status": "failed",
    "created_at": "2026-03-15T14:30:00Z",
    "updated_at": "2026-03-15T14:31:00Z",
    "started_at": "2026-03-15T14:30:05Z",
    "failed_at": "2026-03-15T14:31:00Z",
    "error": {
      "code": "N8N_GENERATION_ERROR",
      "message": "Claude API rate limit exceeded",
      "details": {
        "phase": "generating",
        "category": "multi-étape",
        "retry_after_seconds": 60
      }
    }
  }
}
```

### Response 404 Not Found

```json
{
  "success": false,
  "error": {
    "code": "JOB_NOT_FOUND",
    "message": "Job not found",
    "details": {
      "job_id": "dsjob_invalid",
      "note": "Jobs are retained for 30 days"
    }
  }
}
```

---

## GET /api/v1/training/dataset/list

Liste les datasets du tenant.

### Request

#### Headers

```
Authorization: Bearer {firebase_token}
```

#### Query Parameters

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `page` | integer | 1 | Numéro de page |
| `limit` | integer | 20 | Éléments par page (max 100) |
| `domain` | string | null | Filtrer par domaine |
| `status` | string | null | Filtrer par statut (`completed`, `failed`) |
| `created_after` | datetime | null | Créés après cette date |
| `created_before` | datetime | null | Créés avant cette date |
| `sort` | string | `-created_at` | Tri (préfixe `-` = desc) |

### Response 200 OK

```json
{
  "success": true,
  "data": [
    {
      "id": "ds_01HQABC987654321",
      "name": "Dataset Shopping Q1 2026",
      "filename": "rfc037_test_dataset_shopping_20260315.csv",
      "domain": "shopping",
      "total_cases": 40,
      "by_category": {
        "simple": 10,
        "ambigu": 10,
        "multi-étape": 10,
        "elliptique": 10
      },
      "file_size_bytes": 15234,
      "created_at": "2026-03-15T14:32:30Z"
    },
    {
      "id": "ds_01HQDEF456789012",
      "name": "Dataset Email Mars 2026",
      "filename": "rfc037_test_dataset_email_20260314.csv",
      "domain": "email",
      "total_cases": 100,
      "by_category": {
        "simple": 25,
        "ambigu": 25,
        "multi-étape": 25,
        "elliptique": 25
      },
      "file_size_bytes": 45678,
      "created_at": "2026-03-14T10:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_items": 45,
    "total_pages": 3,
    "has_next": true,
    "has_prev": false
  }
}
```

---

## GET /api/v1/training/dataset/{dataset_id}

Récupère les détails d'un dataset.

### Request

#### Headers

```
Authorization: Bearer {firebase_token}
```

### Response 200 OK

```json
{
  "success": true,
  "dataset": {
    "id": "ds_01HQABC987654321",
    "name": "Dataset Shopping Q1 2026",
    "description": "Dataset de test pour le domaine e-commerce",
    "filename": "rfc037_test_dataset_shopping_20260315.csv",
    "domain": "shopping",
    "language": "fr",
    "categories": ["simple", "ambigu", "multi-étape", "elliptique"],
    "tools_focus": ["cart-add", "cart-checkout", "orders-list"],
    "total_cases": 40,
    "by_category": {
      "simple": 10,
      "ambigu": 10,
      "multi-étape": 10,
      "elliptique": 10
    },
    "file_size_bytes": 15234,
    "file_url": "https://s3.eu-central-003.backblazeb2.com/...",
    "generation_stats": {
      "model_generator": "claude-haiku-4-5-20251001",
      "model_reviewer": "gpt-4o-mini",
      "generated": 42,
      "kept": 35,
      "fixed": 5,
      "rejected": 2,
      "regenerated": 2,
      "duration_ms": 145000
    },
    "metadata": {
      "project": "rfc037-evaluation",
      "version": "1.0"
    },
    "job_id": "dsjob_01HQXYZ123456789",
    "created_at": "2026-03-15T14:32:30Z",
    "created_by": "user_abc123"
  }
}
```

---

## GET /api/v1/training/dataset/{dataset_id}/download

Génère une URL de téléchargement pré-signée.

### Request

#### Headers

```
Authorization: Bearer {firebase_token}
```

#### Query Parameters

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `expires_in` | integer | 3600 | Durée de validité en secondes (max 86400) |

### Response 200 OK

```json
{
  "success": true,
  "download": {
    "url": "https://s3.eu-central-003.backblazeb2.com/bucket/tenant_123/datasets/rfc037_test_dataset_shopping_20260315.csv?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...&X-Amz-Signature=...",
    "filename": "rfc037_test_dataset_shopping_20260315.csv",
    "content_type": "text/csv",
    "file_size_bytes": 15234,
    "expires_at": "2026-03-15T15:32:30Z"
  }
}
```

---

## DELETE /api/v1/training/dataset/{dataset_id}

Supprime un dataset (fichier B2 + métadonnées DB).

### Request

#### Headers

```
Authorization: Bearer {firebase_token}
```

### Response 200 OK

```json
{
  "success": true,
  "message": "Dataset deleted successfully",
  "deleted": {
    "id": "ds_01HQABC987654321",
    "filename": "rfc037_test_dataset_shopping_20260315.csv"
  }
}
```

### Response 404 Not Found

```json
{
  "success": false,
  "error": {
    "code": "DATASET_NOT_FOUND",
    "message": "Dataset not found"
  }
}
```

---

## POST /api/v1/training/dataset/job/{job_id}/complete

**Endpoint interne** appelé par n8n quand la génération est terminée.

### Request

#### Headers

```
X-N8N-Signature: {hmac_signature}
Content-Type: application/json
```

#### Body - Succès

```json
{
  "success": true,
  "job_id": "dsjob_01HQXYZ123456789",
  "dataset": {
    "filename": "rfc037_test_dataset_shopping_20260315.csv",
    "domain": "shopping",
    "total_cases": 40,
    "by_category": {
      "simple": 10,
      "ambigu": 10,
      "multi-étape": 10,
      "elliptique": 10
    },
    "generation": {
      "model": "claude-haiku-4-5-20251001",
      "generated": 42,
      "duration_ms": 95000
    },
    "review": {
      "model": "gpt-4o-mini",
      "kept": 35,
      "fixed": 5,
      "rejected": 2,
      "regenerated": 2,
      "duration_ms": 50000
    }
  },
  "csv_content_base64": "aWQ7Y2F0ZWdvcmllO2RlbWFuZGVfdXRpbGlzYXRldXI7Li4u..."
}
```

#### Body - Échec

```json
{
  "success": false,
  "job_id": "dsjob_01HQXYZ123456789",
  "error": {
    "code": "GENERATION_FAILED",
    "message": "Claude API rate limit exceeded",
    "phase": "generating",
    "category": "multi-étape"
  }
}
```

### Response 200 OK

```json
{
  "success": true,
  "message": "Job completion received",
  "dataset_id": "ds_01HQABC987654321"
}
```

### Response 401 Unauthorized

```json
{
  "success": false,
  "error": {
    "code": "INVALID_SIGNATURE",
    "message": "Invalid or missing X-N8N-Signature"
  }
}
```

---

## Modèle de Données

### Table: `training_dataset_jobs`

```sql
CREATE TABLE training_dataset_jobs (
    id VARCHAR(32) PRIMARY KEY,           -- dsjob_01HQXYZ123456789
    tenant_id VARCHAR(64) NOT NULL,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, running, completed, failed

    -- Request
    domain VARCHAR(100) NOT NULL,
    categories JSONB NOT NULL,             -- ["simple", "ambigu", ...]
    count_per_category INTEGER NOT NULL,
    tools_focus JSONB,                     -- ["cart-add", ...]
    language VARCHAR(10) DEFAULT 'fr',
    name VARCHAR(255),
    description TEXT,
    metadata JSONB,

    -- Progress
    progress JSONB,                        -- {"phase": "generating", ...}

    -- Result
    dataset_id VARCHAR(32),                -- Référence vers training_datasets
    error JSONB,                           -- {"code": "...", "message": "..."}

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,

    -- Audit
    created_by VARCHAR(64) NOT NULL,       -- Firebase UID

    -- Indexes
    CONSTRAINT fk_dataset FOREIGN KEY (dataset_id)
        REFERENCES training_datasets(id) ON DELETE SET NULL
);

CREATE INDEX idx_dataset_jobs_tenant ON training_dataset_jobs(tenant_id);
CREATE INDEX idx_dataset_jobs_status ON training_dataset_jobs(status);
CREATE INDEX idx_dataset_jobs_created ON training_dataset_jobs(created_at DESC);
```

### Table: `training_datasets`

```sql
CREATE TABLE training_datasets (
    id VARCHAR(32) PRIMARY KEY,            -- ds_01HQABC987654321
    tenant_id VARCHAR(64) NOT NULL,

    -- Metadata
    name VARCHAR(255),
    description TEXT,
    filename VARCHAR(255) NOT NULL,
    domain VARCHAR(100) NOT NULL,
    language VARCHAR(10) DEFAULT 'fr',
    categories JSONB NOT NULL,
    tools_focus JSONB,

    -- Stats
    total_cases INTEGER NOT NULL,
    by_category JSONB NOT NULL,            -- {"simple": 10, ...}

    -- File
    file_key VARCHAR(512) NOT NULL,        -- B2 object key
    file_size_bytes BIGINT NOT NULL,
    file_checksum VARCHAR(64),             -- SHA256

    -- Generation stats
    generation_stats JSONB,                -- {"model_generator": "...", ...}

    -- Custom
    metadata JSONB,

    -- Audit
    job_id VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(64) NOT NULL,

    -- Soft delete
    deleted_at TIMESTAMP WITH TIME ZONE,

    CONSTRAINT fk_job FOREIGN KEY (job_id)
        REFERENCES training_dataset_jobs(id) ON DELETE CASCADE
);

CREATE INDEX idx_datasets_tenant ON training_datasets(tenant_id);
CREATE INDEX idx_datasets_domain ON training_datasets(domain);
CREATE INDEX idx_datasets_created ON training_datasets(created_at DESC);
CREATE INDEX idx_datasets_not_deleted ON training_datasets(deleted_at) WHERE deleted_at IS NULL;
```

---

## Celery Task

### Fichier: `app/tasks/training_dataset_tasks.py`

```python
import httpx
from app.celery_app import celery_app

@celery_app.task(
    name="training.generate_dataset",
    bind=True,
    queue="training_dataset",
    soft_time_limit=3600,   # 1 hour soft limit
    time_limit=3900,        # 1h05 hard limit
    acks_late=True,
    max_retries=2,
    default_retry_delay=60,
)
def generate_dataset_task(
    self,
    job_id: str,
    tenant_id: str,
    payload: dict,
    n8n_webhook_url: str,
    callback_url: str,
):
    """
    Celery task pour générer un dataset via n8n.

    NOTE: Celery exécute dans un process séparé (pas d'async).
    On utilise une session sync comme dans n8n_workflow_tasks.py.

    Args:
        job_id: ID du job
        tenant_id: ID du tenant
        payload: Payload pour n8n (domain, categories, etc.)
        n8n_webhook_url: URL du webhook n8n
        callback_url: URL de callback pour n8n
    """
    from sqlalchemy import create_engine, text
    from app.config.settings import get_database_settings

    settings = get_database_settings()
    database_url = (
        f"postgresql://{settings['user']}:{settings['password']}"
        f"@{settings['host']}:{settings['port']}/{settings['database']}"
    )
    engine = create_engine(database_url)

    try:
        # Update status to running
        with engine.connect() as conn:
            conn.execute(
                text(
                    "UPDATE training_dataset_jobs "
                    "SET status = 'running', started_at = NOW(), "
                    "updated_at = NOW() WHERE id = :job_id"
                ),
                {"job_id": job_id},
            )
            conn.commit()

        # Add callback URL to payload
        payload["callback_url"] = callback_url
        payload["job_id"] = job_id

        # Call n8n webhook (fire and forget - n8n will callback)
        with httpx.Client(timeout=30) as client:
            response = client.post(
                n8n_webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()

        # n8n will call back /complete endpoint when done
        # Job status will be updated in the callback handler

    except httpx.RequestError as e:
        # Connection error to n8n
        with engine.connect() as conn:
            conn.execute(
                text(
                    "UPDATE training_dataset_jobs "
                    "SET status = 'failed', "
                    "error = :error, updated_at = NOW(), "
                    "completed_at = NOW() WHERE id = :job_id"
                ),
                {
                    "job_id": job_id,
                    "error": '{"code":"N8N_CONNECTION_ERROR","message":"'
                    + str(e).replace('"', '\\"') + '"}',
                },
            )
            conn.commit()
        raise self.retry(exc=e)

    except Exception as e:
        with engine.connect() as conn:
            conn.execute(
                text(
                    "UPDATE training_dataset_jobs "
                    "SET status = 'failed', "
                    "error = :error, updated_at = NOW(), "
                    "completed_at = NOW() WHERE id = :job_id"
                ),
                {
                    "job_id": job_id,
                    "error": '{"code":"TASK_ERROR","message":"'
                    + str(e).replace('"', '\\"') + '"}',
                },
            )
            conn.commit()
        raise
    finally:
        engine.dispose()
```

### Configuration Celery

```python
# app/celery_app.py (ajout)

celery_app.conf.task_routes = {
    # ... existing routes ...
    "training.generate_dataset": {"queue": "training_dataset"},
}

celery_app.conf.task_queues = (
    # ... existing queues ...
    Queue("training_dataset", routing_key="training.#"),
)
```

---

## Service Layer

### Fichier: `app/services/training_dataset_service.py`

```python
import base64
import hashlib
from datetime import datetime
from typing import Optional
from ulid import ULID

from sqlalchemy.ext.asyncio import AsyncSession
from app.models.training_dataset import DatasetJob, Dataset, DatasetJobStatus
from app.services.storage_service import B2StorageService


class TrainingDatasetService:
    """Service pour la gestion des datasets de training."""

    def __init__(
        self,
        db: AsyncSession,
        storage: B2StorageService,
        tenant_id: str,
    ):
        self.db = db
        self.storage = storage
        self.tenant_id = tenant_id

    async def create_job(
        self,
        domain: str,
        categories: list[str],
        count_per_category: int,
        user_id: str,
        tools_focus: Optional[list[str]] = None,
        language: str = "fr",
        name: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> DatasetJob:
        """Crée un nouveau job de génération."""
        job_id = f"dsjob_{ULID()}"

        job = DatasetJob(
            id=job_id,
            tenant_id=self.tenant_id,
            status=DatasetJobStatus.PENDING,
            domain=domain,
            categories=categories,
            count_per_category=count_per_category,
            tools_focus=tools_focus,
            language=language,
            name=name or f"Dataset {domain} {datetime.now().strftime('%Y%m%d')}",
            description=description,
            metadata=metadata or {},
            created_by=user_id,
        )

        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)

        return job

    async def complete_job(
        self,
        job_id: str,
        result: dict,
        csv_content: bytes,
    ) -> Dataset:
        """
        Finalise un job avec succès.

        - Upload le CSV vers B2
        - Crée l'entrée Dataset
        - Met à jour le job
        """
        job = await self.get_job(job_id)
        if not job:
            raise ValueError(f"Job {job_id} not found")

        # Generate dataset ID and filename
        dataset_id = f"ds_{ULID()}"
        filename = result.get("filename") or f"rfc037_test_dataset_{job.domain}_{datetime.now().strftime('%Y%m%d')}.csv"

        # Calculate checksum
        checksum = hashlib.sha256(csv_content).hexdigest()

        # Upload to B2 (B2StorageService.upload prend tenant_id en 1er param)
        file_key = f"datasets/{filename}"
        await self.storage.upload(
            tenant_id=self.tenant_id,
            key=file_key,
            data=csv_content,
        )

        # Create dataset record
        dataset = Dataset(
            id=dataset_id,
            tenant_id=self.tenant_id,
            name=job.name,
            description=job.description,
            filename=filename,
            domain=job.domain,
            language=job.language,
            categories=job.categories,
            tools_focus=job.tools_focus,
            total_cases=result.get("total_cases", 0),
            by_category=result.get("by_category", {}),
            file_key=file_key,
            file_size_bytes=len(csv_content),
            file_checksum=checksum,
            generation_stats={
                "model_generator": result.get("generation", {}).get("model"),
                "model_reviewer": result.get("review", {}).get("model"),
                "generated": result.get("generation", {}).get("generated"),
                "kept": result.get("review", {}).get("kept"),
                "fixed": result.get("review", {}).get("fixed"),
                "rejected": result.get("review", {}).get("rejected"),
                "regenerated": result.get("review", {}).get("regenerated"),
                "duration_ms": (
                    result.get("generation", {}).get("duration_ms", 0) +
                    result.get("review", {}).get("duration_ms", 0)
                ),
            },
            metadata=job.metadata,
            job_id=job_id,
            created_by=job.created_by,
        )

        self.db.add(dataset)

        # Update job
        job.status = DatasetJobStatus.COMPLETED
        job.dataset_id = dataset_id
        job.completed_at = datetime.utcnow()
        job.duration_ms = int(
            (job.completed_at - job.started_at).total_seconds() * 1000
        ) if job.started_at else None

        await self.db.commit()
        await self.db.refresh(dataset)

        return dataset

    async def fail_job(
        self,
        job_id: str,
        error_code: str,
        error_message: str,
        error_details: Optional[dict] = None,
    ):
        """Marque un job comme échoué."""
        job = await self.get_job(job_id)
        if not job:
            return

        job.status = DatasetJobStatus.FAILED
        job.error = {
            "code": error_code,
            "message": error_message,
            "details": error_details,
        }
        job.completed_at = datetime.utcnow()

        await self.db.commit()

    async def get_download_url(
        self,
        dataset_id: str,
        expires_in: int = 3600,
    ) -> str:
        """Génère une URL pré-signée pour télécharger le dataset."""
        dataset = await self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError(f"Dataset {dataset_id} not found")

        return await self.storage.get_presigned_url(
            tenant_id=self.tenant_id,
            key=dataset.file_key,
            expires_in=expires_in,
        )

    async def delete_dataset(self, dataset_id: str):
        """Supprime un dataset (soft delete + suppression B2)."""
        dataset = await self.get_dataset(dataset_id)
        if not dataset:
            raise ValueError(f"Dataset {dataset_id} not found")

        # Delete from B2
        await self.storage.delete(
            tenant_id=self.tenant_id,
            key=dataset.file_key,
        )

        # Soft delete in DB
        dataset.deleted_at = datetime.utcnow()
        await self.db.commit()
```

---

## Payload n8n

### Request vers n8n

```json
{
  "job_id": "dsjob_01HQXYZ123456789",
  "callback_url": "https://api.chat-studio.io/api/v1/training/dataset/job/dsjob_01HQXYZ123456789/complete",
  "domain": "shopping",
  "categories": ["simple", "ambigu", "multi-étape", "elliptique"],
  "count_per_category": 10,
  "tools_focus": ["cart-add", "cart-checkout"],
  "language": "fr"
}
```

### Response callback de n8n

Voir [POST /complete](#post-apiv1trainingdatasetjobjob_idcomplete) pour le format.

---

## Sécurité

### Authentification

Tous les endpoints (sauf `/complete`) requièrent un token Firebase:

```python
from app.multi_tenant.auth.dependencies import get_current_user
from app.multi_tenant.auth.models import FirebaseUser
from app.multi_tenant.database import get_tenant_db

@router.post("/dataset/generate")
async def generate(
    request: GenerateRequest,
    user: FirebaseUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    # user.uid, user.tenant_id disponibles
    ...
```

### Signature n8n

Le endpoint `/complete` vérifie une signature HMAC:

```python
import hmac
import hashlib

def verify_n8n_signature(
    signature: str,
    body: bytes,
    secret: str,
) -> bool:
    expected = hmac.new(
        secret.encode(),
        body,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)
```

### Multi-tenant Isolation

- Chaque requête est scopée au `tenant_id` de l'utilisateur
- Les fichiers B2 sont préfixés par `{tenant_id}/`
- Les queries DB filtrent toujours par `tenant_id`

---

## Configuration

### Variables d'environnement

```bash
# N8n
N8N_BASE_URL=http://pi6.local:5678
N8N_WEBHOOK_SECRET=your-hmac-secret

# Celery
CELERY_BROKER_URL=redis://databases.local:6379/1
CELERY_RESULT_BACKEND=redis://databases.local:6379/1

# B2 Storage (noms réels dans .env.local)
B2_ENDPOINT_URL=https://s3.eu-central-003.backblazeb2.com
B2_APPLICATION_KEY_ID=your-key-id
B2_APPLICATION_KEY=your-app-key
B2_BUCKET_PREFIX=                    # préfixe tenant, peut être vide

# Database
DATABASE_URL=postgresql+asyncpg://user:pass@databases.local:5432/chat_studio
```

---

## Codes d'erreur

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Paramètres invalides |
| `UNAUTHORIZED` | 401 | Token Firebase invalide |
| `INVALID_SIGNATURE` | 401 | Signature n8n invalide |
| `FORBIDDEN` | 403 | Accès non autorisé (autre tenant) |
| `JOB_NOT_FOUND` | 404 | Job non trouvé |
| `DATASET_NOT_FOUND` | 404 | Dataset non trouvé |
| `INVALID_TOOLS` | 422 | Outils Qdrant invalides |
| `INVALID_CATEGORIES` | 422 | Catégories invalides |
| `N8N_CONNECTION_ERROR` | 502 | Erreur connexion n8n |
| `N8N_GENERATION_ERROR` | 502 | Erreur génération n8n |
| `STORAGE_ERROR` | 502 | Erreur upload B2 |
| `TIMEOUT` | 504 | Timeout génération |

---

## Instructions pour l'équipe n8n

### Workflow: MCP - Dataset Generator

Le workflow doit être modifié pour supporter le pattern callback.

### Input reçu du Backend

```json
{
  "job_id": "dsjob_01HQXYZ123456789",
  "callback_url": "https://api.chat-studio.io/api/v1/training/dataset/job/dsjob_01HQXYZ123456789/complete",
  "domain": "shopping",
  "categories": ["simple", "ambigu", "multi-étape", "elliptique"],
  "count_per_category": 10,
  "tools_focus": ["cart-add", "cart-checkout"],
  "language": "fr"
}
```

### Champs à extraire

| Champ | Usage |
|-------|-------|
| `job_id` | À renvoyer dans le callback |
| `callback_url` | URL à appeler quand terminé |
| `domain`, `categories`, etc. | Paramètres de génération (inchangés) |

### Callback à envoyer - Succès

À la fin du workflow, faire un **HTTP Request** vers `callback_url`:

```
POST {{ $json.callback_url }}
Headers:
  Content-Type: application/json
  X-N8N-Signature: {{ computeHmacSignature(body, $env.N8N_WEBHOOK_SECRET) }}
```

#### Body succès

```json
{
  "success": true,
  "job_id": "{{ $json.job_id }}",
  "dataset": {
    "filename": "rfc037_test_dataset_shopping_20260315.csv",
    "domain": "{{ $json.domain }}",
    "total_cases": 40,
    "by_category": {
      "simple": 10,
      "ambigu": 10,
      "multi-étape": 10,
      "elliptique": 10
    },
    "generation": {
      "model": "claude-haiku-4-5-20251001",
      "generated": 42,
      "duration_ms": 95000
    },
    "review": {
      "model": "gpt-4o-mini",
      "kept": 35,
      "fixed": 5,
      "rejected": 2,
      "regenerated": 2,
      "duration_ms": 50000
    }
  },
  "csv_content_base64": "{{ $binary.csv.data }}"
}
```

### Callback à envoyer - Échec

Si une erreur survient à n'importe quelle étape:

```json
{
  "success": false,
  "job_id": "{{ $json.job_id }}",
  "error": {
    "code": "GENERATION_FAILED",
    "message": "Claude API rate limit exceeded",
    "phase": "generating",
    "category": "multi-étape"
  }
}
```

### Codes d'erreur n8n

| Code | Quand |
|------|-------|
| `QDRANT_ERROR` | Erreur récupération outils Qdrant |
| `GENERATOR_ERROR` | Erreur appel Claude |
| `REVIEWER_ERROR` | Erreur appel GPT-4o |
| `VALIDATION_ERROR` | Erreur validation/parsing JSON |
| `CSV_ERROR` | Erreur génération CSV |

### Signature HMAC

Pour sécuriser le callback, ajouter une signature HMAC-SHA256:

```javascript
// Code Node (Function node)
const crypto = require('crypto');

const body = JSON.stringify($json.callbackPayload);
const secret = $env.N8N_WEBHOOK_SECRET;

const signature = crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');

return {
  ...items[0],
  json: {
    ...$json,
    signature: signature
  }
};
```

Puis dans le HTTP Request:
```
Headers:
  X-N8N-Signature: {{ $json.signature }}
```

### Workflow modifié

```
[Webhook Trigger]
       ↓
[Set: Extract job_id, callback_url]
       ↓
[Qdrant: Get tools]
       ↓
[Loop: Pour chaque catégorie]
       ↓
   [Claude: Generator]
   [GPT-4o: Reviewer]
       ↓
[Merge: Combiner résultats]
       ↓
[Code: Générer CSV + base64]
       ↓
[Code: Compute HMAC signature]
       ↓
[HTTP Request: POST callback_url]  ← NOUVEAU
       ↓
[Respond: Ack immédiat]            ← Réponse au webhook initial
```

### Réponse immédiate au webhook

Le workflow doit répondre immédiatement au webhook initial (avant la génération) pour éviter le timeout:

```json
{
  "success": true,
  "message": "Generation started",
  "job_id": "{{ $json.job_id }}"
}
```

Puis continuer la génération en arrière-plan et appeler le callback à la fin.

### Variable d'environnement requise

```
N8N_WEBHOOK_SECRET=your-shared-secret-with-backend
```

Cette clé doit être partagée avec l'équipe backend pour la vérification de signature.

### Test du callback

```bash
# Simuler un callback de succès
curl -X POST "https://api.chat-studio.io/api/v1/training/dataset/job/dsjob_test123/complete" \
  -H "Content-Type: application/json" \
  -H "X-N8N-Signature: $(echo -n '{"success":true,"job_id":"dsjob_test123"}' | openssl dgst -sha256 -hmac 'your-secret' | cut -d' ' -f2)" \
  -d '{"success":true,"job_id":"dsjob_test123","dataset":{...}}'
```

---

## Répartition des tâches

### Équipe API Backend

| Tâche | Priorité | Dépendances |
|-------|----------|-------------|
| Créer modèles `DatasetJob` et `Dataset` | P0 | - |
| Créer migration Alembic | P0 | Modèles |
| Implémenter `TrainingDatasetService` | P0 | Modèles |
| Créer endpoints FastAPI | P0 | Service |
| Créer Celery task `generate_dataset_task` | P0 | Service |
| Ajouter queue `training_dataset` | P0 | - |
| Implémenter vérification signature HMAC | P1 | - |
| Tests unitaires | P1 | Tous |
| Tests d'intégration | P2 | n8n prêt |

### Équipe n8n

| Tâche | Priorité | Dépendances |
|-------|----------|-------------|
| Modifier workflow pour accepter `job_id` et `callback_url` | P0 | - |
| Ajouter réponse immédiate au webhook | P0 | - |
| Ajouter nœud HTTP Request pour callback | P0 | - |
| Implémenter signature HMAC | P1 | Secret partagé |
| Ajouter gestion d'erreur avec callback échec | P1 | - |
| Tester avec backend | P2 | Backend prêt |

### Équipe MCP (coordination)

| Tâche | Priorité | Dépendances |
|-------|----------|-------------|
| Valider RFC avec les équipes | P0 | - |
| Définir le secret HMAC partagé | P0 | - |
| Mettre à jour le script de test Python | P1 | Endpoints prêts |
| Documenter dans CLAUDE.md | P2 | Tout prêt |

### Ordre d'implémentation suggéré

```
Semaine 1:
├── [API] Modèles + Migration + Service
├── [n8n] Modifier workflow (callback_url, job_id)
└── [MCP] Partager secret HMAC

Semaine 2:
├── [API] Endpoints + Celery task
├── [n8n] HTTP Request callback + signature
└── [MCP] Tests d'intégration

Semaine 3:
├── [API] Tests + corrections
├── [n8n] Tests + corrections
└── [MCP] Documentation finale
```

---

## Frontend — Intégration et UX

> **Auteur** : Équipe Frontend
> **Date** : 2026-03-15

### Contexte

Le WS actuel est **stateless** — pas de queue de messages persistante. Si l'utilisateur se déconnecte pendant un batch, les messages `mcp_progress` / `mcp_complete` sont perdus.

**Stratégie retenue : hybride WS + REST**
- WS pour le temps réel (progression si connecté)
- REST pour le rattrapage (`GET /list?status=pending,running,completed` au chargement)

---

### Flux UX complet

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FLUX UTILISATEUR                              │
└─────────────────────────────────────────────────────────────────────┘

1. LANCEMENT
   ├─ L'utilisateur est dans l'expert training (7e24eba1)
   ├─ Sélectionne la quick action "Générer un dataset"
   ├─ Remplit le formulaire (QuestionFlow : domaine, catégories, etc.)
   ├─ Attache un fichier CSV si nécessaire
   └─ Clique "Exécuter"
       │
       ▼
   Front appelle POST /api/v1/training/dataset/generate
       │
       ▼
   Reçoit { job_id, status: "pending" }
       │
       ▼
2. ÉCRAN CONFIRMATION
   ┌───────────────────────────────────────────────┐
   │  ✅ Génération lancée                         │
   │                                                │
   │  📊 Dataset Shopping Q1 2026                  │
   │  🏷️ 4 catégories × 10 cas = 40 cas attendus  │
   │                                                │
   │  ⏳ En attente de traitement...               │
   │  ░░░░░░░░░░░░░░░░░░░░ 0%                     │
   │                                                │
   │  [Voir mes datasets]  [Fermer]                │
   └───────────────────────────────────────────────┘
       │
       ▼
3. PROGRESSION (si WS connecté)
   ← mcp_progress { job_id, categories_completed: 2/4 }
   → Barre de progression se met à jour
       │
       ▼
4. NOTIFICATION RÉSULTAT
   ┌── Cas A : l'utilisateur est encore sur l'écran ──┐
   │  ← mcp_complete { job_id, status: "completed" }  │
   │  → Écran se met à jour avec bouton Télécharger   │
   └───────────────────────────────────────────────────┘

   ┌── Cas B : l'utilisateur a quitté ────────────────┐
   │  Au rechargement de l'app / reconnexion :         │
   │  → GET /api/v1/training/dataset/list              │
   │    ?status=completed,running                      │
   │  → Pour chaque job terminé non vu :               │
   │    - Toast "Dataset X terminé"                    │
   │    - Badge 🔴 sur la sidebar conversation         │
   └───────────────────────────────────────────────────┘

5. TÉLÉCHARGEMENT
   → GET /api/v1/training/dataset/{id}/download
   → Redirige vers URL pré-signée B2
   → Navigateur télécharge le CSV
```

---

### Notification au retour de l'utilisateur

Le WS est **opportuniste** : il notifie si l'utilisateur est connecté. Sinon, le front rattrape via REST.

```
App.vue / Layout principal
    │
    ├── onMounted()
    │   └── GET /api/v1/training/dataset/list?status=running,completed
    │       │
    │       ├── Jobs "completed" non vus
    │       │   ├── Toast : "📊 Dataset X terminé — 40 cas"
    │       │   │           [Télécharger] [Voir]
    │       │   └── Badge 🔴 sur la conversation associée
    │       │
    │       └── Jobs "running"
    │           └── Badge ⏳ sur la conversation + poll toutes les 30s
    │
    └── WS listener (si connecté)
        ├── mcp_progress → mise à jour progression
        └── mcp_complete → même logique que le toast ci-dessus
```

**Comment savoir si un job est "non vu" ?**
Option simple : stocker `lastSeenJobTimestamp` en localStorage par tenant. Tout job `completed_at > lastSeenJobTimestamp` est non vu. Pas besoin d'endpoint `PATCH /seen` côté back.

---

### Composants frontend à développer

| Composant | Type | Description |
|-----------|------|-------------|
| `useTrainingDatasetApi` | Service | Wrapper HTTP pour les 5 endpoints REST de la RFC |
| `useBatchJobTracker` | Composable | State réactif par job_id, polling des jobs en cours, écoute WS |
| `DatasetJobCard` | Component | Card affichant un job (statut, progression, actions) |
| `DatasetListPanel` | Component | Liste paginée des datasets avec filtres (domaine, statut) |
| `DatasetJobNotifier` | Composable | Au montage de l'app, check les jobs non vus et déclenche toasts |

#### État réactif du tracker (`useBatchJobTracker`)

```typescript
interface BatchJob {
  jobId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: {
    phase: string
    categoriesCompleted: number
    categoriesTotal: number
    currentCategory?: string
  } | null
  dataset?: {
    id: string
    name: string
    totalCases: number
    downloadUrl: string
    fileSizeBytes: number
  }
  error?: { code: string; message: string }
  createdAt: string
  completedAt?: string
}

// Map réactive : jobId → BatchJob
const jobs = ref<Map<string, BatchJob>>(new Map())
```

#### Polling strategy

```typescript
// Quand un job est "pending" ou "running" :
// - Poll GET /job/{id} toutes les 10s si WS connecté (backup)
// - Poll GET /job/{id} toutes les 5s si WS déconnecté (primary)
// - Arrêter le poll quand status = completed | failed
```

---

### Messages WS attendus

Les messages batch utilisent les types `mcp_*` existants pour éviter d'étendre le protocole :

| Message WS | Payload additionnel | Détection front |
|------------|---------------------|-----------------|
| `mcp_progress` | `{ batch_job_id, batch_progress: { phase, categories_completed, categories_total } }` | `msg.batch_job_id` existe |
| `mcp_complete` | `{ batch_job_id, batch_status: "completed", dataset_id, download_url }` | `msg.batch_job_id` existe |
| `mcp_error` | `{ batch_job_id, batch_status: "failed", error }` | `msg.batch_job_id` existe |

Le front détecte un message batch vs un message chat normal par la présence du champ `batch_job_id`.

---

### Intégration dans l'app existante

#### Lancement (dans QuestionFlow / mcp-chat)

Quand l'expert `7e24eba1` avec la quick action "dataset" est exécuté :
1. Le front appelle `POST /generate` (REST, pas WS) → reçoit `job_id`
2. Affiche `DatasetJobCard` en mode "pending"
3. Démarre le tracker pour ce `job_id`

#### Sidebar conversations

- Les conversations liées à un job batch ont un badge visuel
- Au clic, la conversation s'ouvre et affiche le `DatasetJobCard` inline

#### Page dédiée (optionnel, Phase 2)

- Route `/training/datasets` avec `DatasetListPanel`
- Liste paginée, filtrable, avec actions (télécharger, supprimer, relancer)
- Accessible via le menu "Actions" du header

---

### Gestion d'erreurs côté front

| Code API | Affichage |
|----------|-----------|
| `VALIDATION_ERROR` (400) | Formulaire : erreurs inline par champ |
| `INVALID_TOOLS` (422) | Alerte : "Certains outils ne sont pas disponibles" |
| `N8N_CONNECTION_ERROR` (502) | Toast : "Service de génération indisponible" + retry |
| `N8N_GENERATION_ERROR` (502) | DatasetJobCard : statut "failed" + détail erreur + bouton "Relancer" |
| `TIMEOUT` (504) | Toast : "La génération a pris trop de temps" + retry |
| Job `failed` via WS/polling | DatasetJobCard : message d'erreur + `retry_after_seconds` si disponible |

---

### Séquence d'implémentation recommandée

1. **`useTrainingDatasetApi`** — service HTTP (CRUD jobs/datasets)
2. **`useBatchJobTracker`** — state management + polling + WS listener
3. **`DatasetJobCard`** — composant visuel (pending → running → completed → failed)
4. **Intégration QuestionFlow** — lancement via le formulaire expert
5. **`DatasetJobNotifier`** — toasts au chargement pour jobs terminés
6. **`DatasetListPanel`** — page dédiée (Phase 2)

---

## Notification WebSocket (côté backend)

Le backend émet des messages WS quand le statut d'un job change. Ces messages sont **opportunistes** : si le WS n'est pas connecté, le message est perdu (le front rattrape via REST au rechargement).

### Émission des messages

Le callback handler (`/complete`) et la Celery task émettent via le WebSocket manager existant :

```python
from app.utils.websocket.manager import ws_manager

# Dans le callback handler (après update DB)
await ws_manager.send_to_user(
    tenant_id=job.tenant_id,
    user_id=job.created_by,
    message={
        "type": "mcp_complete",
        "batch_job_id": job.id,
        "batch_status": "completed",
        "dataset_id": dataset.id,
        "download_url": f"/api/v1/training/dataset/{dataset.id}/download",
    },
)
```

### Messages émis

| Événement | Type WS | Émetteur |
|-----------|---------|----------|
| Job démarre | `mcp_progress` | Celery task (après appel n8n OK) |
| Progression | `mcp_progress` | Callback handler (si n8n envoie des updates intermédiaires) |
| Job terminé | `mcp_complete` | Callback handler `/complete` |
| Job échoué | `mcp_error` | Callback handler `/complete` ou Celery task (erreur connexion) |

### Fallback si WS indisponible

Si `ws_manager.send_to_user()` échoue (utilisateur déconnecté), le message est silencieusement ignoré. Le job reste en DB avec le bon statut — le front le récupère via `GET /list` au prochain chargement.

---

## Rate Limiting

### Limites par tenant

| Paramètre | Valeur | Raison |
|-----------|--------|--------|
| Jobs simultanés (pending + running) | 3 max | Éviter la surcharge n8n/LLM |
| Jobs par heure | 10 max | Contrôle des coûts LLM |
| Jobs par jour | 50 max | Plafond de sécurité |

### Implémentation

Vérification au `POST /generate` avant de créer le job :

```python
# Compter les jobs actifs du tenant
active_count = await db.execute(
    select(func.count(DatasetJob.id)).where(
        DatasetJob.tenant_id == tenant_id,
        DatasetJob.status.in_(["pending", "running"]),
    )
)
if active_count.scalar() >= 3:
    raise HTTPException(
        status_code=429,
        detail={
            "error": "TOO_MANY_ACTIVE_JOBS",
            "message": "Maximum 3 jobs simultanés par tenant",
            "retry_after_seconds": 60,
        },
    )
```

### Code d'erreur additionnel

| Code | HTTP | Description |
|------|------|-------------|
| `TOO_MANY_ACTIVE_JOBS` | 429 | Trop de jobs actifs pour ce tenant |

---

## Cleanup / TTL des jobs

### Nettoyage automatique

Les jobs terminés (`completed` ou `failed`) de plus de 30 jours sont nettoyés automatiquement via une tâche Celery beat :

```python
# app/celery_app.py (ajout au beat_schedule)
celery_app.conf.beat_schedule["cleanup-old-dataset-jobs"] = {
    "task": "training.cleanup_old_jobs",
    "schedule": 86400,  # 1 fois par jour
}
```

```python
# app/tasks/training_dataset_tasks.py
@celery_app.task(name="training.cleanup_old_jobs", queue="training_dataset")
def cleanup_old_dataset_jobs():
    """Supprime les jobs de plus de 30 jours (pas les datasets)."""
    # Les datasets (fichiers B2 + entrées DB) sont conservés
    # Seuls les jobs (tracking d'exécution) sont nettoyés
    ...
```

### Règles de rétention

| Entité | TTL | Suppression |
|--------|-----|-------------|
| `training_dataset_jobs` (completed/failed) | 30 jours | Automatique (Celery beat) |
| `training_dataset_jobs` (pending/running > 24h) | 24h | Marqué `failed` + alerte |
| `training_datasets` | Illimité | Manuelle (`DELETE /dataset/{id}`) |
| Fichiers B2 | Illimité | Supprimé avec le dataset |

---

## Références

- RFC-037: Intelligent Intent Analysis
- RFC-037-B: Test Dataset Format
- `app/models/workflow_execution.py`: Modèle de référence
- `app/tasks/n8n_workflow_tasks.py`: Pattern Celery + callback
- `app/services/storage_service.py`: Service B2
- `docs/issues/2026-03-15-batch-dataset-generation.md`: Analyse front initiale
