#!/usr/bin/env python3
"""
Redis XADD Micro-Service for n8n
================================
Remplace le node Execute Command supprimé dans n8n 2.0
Permet à n8n d'utiliser Redis Streams (XADD) via HTTP Request

RFC-089/RFC-090: Skills API Async Architecture
"""

import os
import logging
from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import redis
import uvicorn

# Configuration logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration Redis depuis variables d'environnement
REDIS_HOST = os.getenv("REDIS_HOST", "host3.local")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6381"))
REDIS_DB = int(os.getenv("REDIS_DB_NOTIFICATION", "5"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

# Connexion Redis
redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    db=REDIS_DB,
    password=REDIS_PASSWORD if REDIS_PASSWORD else None,
    decode_responses=True
)

app = FastAPI(
    title="Redis XADD Service",
    description="Micro-service pour Redis Streams XADD - Remplace Execute Command dans n8n 2.0",
    version="1.0.0"
)


class XAddRequest(BaseModel):
    """Requête pour XADD"""
    stream: str = Field(..., description="Nom du stream Redis", example="tools:events:stream")
    fields: Dict[str, Any] = Field(..., description="Champs à ajouter au stream")
    max_len: Optional[int] = Field(None, description="Taille max du stream (MAXLEN ~)")


class XAddResponse(BaseModel):
    """Réponse XADD"""
    success: bool
    stream_id: str
    stream: str
    timestamp: str


class ToolsNotifyRequest(BaseModel):
    """Requête spécifique pour Tools Notify (RFC-089)"""
    action: str = Field(default="workflow_updated", description="Action effectuée")
    workflow_name: str = Field(default="unknown", description="Nom du workflow")
    extra_data: Optional[Dict[str, Any]] = Field(default=None, description="Données supplémentaires")


class HealthResponse(BaseModel):
    """Réponse health check"""
    status: str
    redis_connected: bool
    redis_host: str
    redis_port: int
    redis_db: int


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Vérifie la santé du service et la connexion Redis"""
    try:
        redis_client.ping()
        redis_connected = True
    except Exception as e:
        logger.error(f"Redis connection error: {e}")
        redis_connected = False

    return HealthResponse(
        status="healthy" if redis_connected else "degraded",
        redis_connected=redis_connected,
        redis_host=REDIS_HOST,
        redis_port=REDIS_PORT,
        redis_db=REDIS_DB
    )


@app.post("/xadd", response_model=XAddResponse)
async def xadd(request: XAddRequest):
    """
    Exécute XADD sur un stream Redis

    Équivalent de: redis-cli XADD {stream} * {field1} {value1} ...
    """
    try:
        # Convertir tous les champs en strings pour Redis
        fields = {str(k): str(v) for k, v in request.fields.items()}

        # XADD avec ou sans MAXLEN
        if request.max_len:
            stream_id = redis_client.xadd(
                request.stream,
                fields,
                maxlen=request.max_len,
                approximate=True
            )
        else:
            stream_id = redis_client.xadd(request.stream, fields)

        logger.info(f"XADD {request.stream} -> {stream_id}")

        return XAddResponse(
            success=True,
            stream_id=stream_id,
            stream=request.stream,
            timestamp=datetime.utcnow().isoformat()
        )

    except redis.RedisError as e:
        logger.error(f"Redis error: {e}")
        raise HTTPException(status_code=500, detail=f"Redis error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@app.post("/tools/notify", response_model=XAddResponse)
async def tools_notify(request: ToolsNotifyRequest):
    """
    Endpoint spécifique pour MCP Tools Notify (RFC-089/RFC-090)

    Publie un événement tools_updated dans le stream tools:events:stream
    """
    timestamp = datetime.utcnow().isoformat()

    fields = {
        "event": "tools_updated",
        "action": request.action,
        "workflow_name": request.workflow_name,
        "timestamp": timestamp
    }

    # Ajouter les données supplémentaires si présentes
    if request.extra_data:
        for k, v in request.extra_data.items():
            fields[f"extra_{k}"] = str(v)

    try:
        stream_id = redis_client.xadd(
            "tools:events:stream",
            fields,
            maxlen=1000,  # Garder les 1000 derniers événements
            approximate=True
        )

        logger.info(f"Tools notify: {request.action} for {request.workflow_name} -> {stream_id}")

        return XAddResponse(
            success=True,
            stream_id=stream_id,
            stream="tools:events:stream",
            timestamp=timestamp
        )

    except redis.RedisError as e:
        logger.error(f"Redis error in tools_notify: {e}")
        raise HTTPException(status_code=500, detail=f"Redis error: {str(e)}")


@app.post("/events/publish")
async def publish_event(
    stream: str = "tools:events:stream",
    event_type: str = "generic",
    data: Dict[str, Any] = None
):
    """
    Endpoint générique pour publier des événements (compatible RFC-090)

    Pattern: n8n → POST /api/events/publish → Backend → Redis Streams
    """
    timestamp = datetime.utcnow().isoformat()

    fields = {
        "event": event_type,
        "timestamp": timestamp,
        **(data or {})
    }

    # Convertir en strings
    fields = {str(k): str(v) for k, v in fields.items()}

    try:
        stream_id = redis_client.xadd(stream, fields, maxlen=1000, approximate=True)

        return {
            "success": True,
            "stream_id": stream_id,
            "stream": stream,
            "event_type": event_type,
            "timestamp": timestamp
        }

    except redis.RedisError as e:
        logger.error(f"Redis error in publish_event: {e}")
        raise HTTPException(status_code=500, detail=f"Redis error: {str(e)}")


class BatchPendingResponse(BaseModel):
    """Réponse pour les batches en attente"""
    success: bool
    batches: list
    count: int


@app.get("/batches/pending", response_model=BatchPendingResponse)
async def get_pending_batches(limit: int = 100):
    """
    Récupère les batches en attente de traitement depuis Redis.
    Utilisé par le workflow de polling pour vérifier les batches Anthropic.

    Stream: llm:batches:pending
    """
    try:
        # XRANGE pour lire tous les messages du stream
        messages = redis_client.xrange("llm:batches:pending", count=limit)

        batches = []
        for msg_id, fields in messages:
            batch_data = {
                "redis_id": msg_id,
                **fields
            }
            # Parse metadata if it's JSON
            if "metadata" in batch_data and batch_data["metadata"]:
                try:
                    batch_data["metadata"] = eval(batch_data["metadata"])
                except:
                    pass
            batches.append(batch_data)

        return BatchPendingResponse(
            success=True,
            batches=batches,
            count=len(batches)
        )

    except redis.RedisError as e:
        logger.error(f"Redis error in get_pending_batches: {e}")
        raise HTTPException(status_code=500, detail=f"Redis error: {str(e)}")


@app.delete("/batches/pending/{redis_id}")
async def delete_pending_batch(redis_id: str):
    """
    Supprime un batch du stream pending après traitement.
    Appelé quand un batch est terminé (succeeded, errored, expired).
    """
    try:
        deleted = redis_client.xdel("llm:batches:pending", redis_id)

        return {
            "success": deleted > 0,
            "deleted_count": deleted,
            "redis_id": redis_id
        }

    except redis.RedisError as e:
        logger.error(f"Redis error in delete_pending_batch: {e}")
        raise HTTPException(status_code=500, detail=f"Redis error: {str(e)}")


@app.post("/batches/completed")
async def store_completed_batch(
    batch_id: str,
    correlation_id: str,
    status: str,
    result: Dict[str, Any] = None
):
    """
    Stocke un batch terminé dans le stream completed pour historique.
    """
    timestamp = datetime.utcnow().isoformat()

    fields = {
        "batch_id": batch_id,
        "correlation_id": correlation_id,
        "status": status,
        "completed_at": timestamp,
        "result": str(result) if result else ""
    }

    try:
        stream_id = redis_client.xadd(
            "llm:batches:completed",
            fields,
            maxlen=5000,  # Garder les 5000 derniers
            approximate=True
        )

        return {
            "success": True,
            "stream_id": stream_id,
            "batch_id": batch_id
        }

    except redis.RedisError as e:
        logger.error(f"Redis error in store_completed_batch: {e}")
        raise HTTPException(status_code=500, detail=f"Redis error: {str(e)}")


if __name__ == "__main__":
    port = int(os.getenv("REDIS_XADD_SERVICE_PORT", "8765"))
    logger.info(f"Starting Redis XADD Service on port {port}")
    logger.info(f"Redis: {REDIS_HOST}:{REDIS_PORT} DB={REDIS_DB}")
    uvicorn.run(app, host="0.0.0.0", port=port)
