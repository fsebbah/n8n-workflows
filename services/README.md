# Services n8n

Ce dossier contient les micro-services qui étendent les fonctionnalités de n8n.

## Services disponibles

### Redis XADD Service

**Fichier:** `redis_xadd_service.py`

Micro-service FastAPI qui permet à n8n d'utiliser Redis Streams (XADD) via HTTP Request.
Remplace le node Execute Command supprimé dans n8n 2.0.

#### Démarrage rapide (PM2)

```bash
# Depuis le répertoire racine n8n-workflows
source .venv/bin/activate
pm2 start services/redis_xadd_service.py --name redis-xadd --interpreter .venv/bin/python3
```

#### Démarrage rapide (Docker)

```bash
cd services
docker-compose -f docker-compose.redis-xadd.yml up -d
```

#### Endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Health check |
| `/xadd` | POST | XADD générique |
| `/tools/notify` | POST | Notification MCP |
| `/events/publish` | POST | Publication événement |

#### Configuration

| Variable | Description | Défaut |
|----------|-------------|--------|
| `REDIS_HOST` | Hôte Redis | `host3.local` |
| `REDIS_PORT` | Port Redis | `6381` |
| `REDIS_DB_NOTIFICATION` | Base Redis | `5` |
| `REDIS_XADD_SERVICE_PORT` | Port du service | `8765` |

## Documentation

Voir [docs/n8n/REDIS_XADD_SERVICE.md](../docs/n8n/REDIS_XADD_SERVICE.md) pour la documentation complète.

## Structure

```
services/
├── README.md                      # Ce fichier
├── redis_xadd_service.py          # Service principal
├── requirements-redis-xadd.txt    # Dépendances Python
├── Dockerfile.redis-xadd          # Image Docker
└── docker-compose.redis-xadd.yml  # Déploiement Docker
```
