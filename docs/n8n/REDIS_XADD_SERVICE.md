# Redis XADD Micro-Service pour n8n

**Date:** 2026-05-15
**Dernière mise à jour:** 2026-05-20
**Version:** 1.1.0
**Référence:** RFC-089, RFC-090
**Fichier:** `services/redis_xadd_service.py`

---

## 1. Contexte et Problème

### 1.1 Le problème n8n 2.0

Depuis **n8n 2.0** (release "hardening"), le node **Execute Command** est **désactivé par défaut** pour des raisons de sécurité. Cela impacte les workflows qui utilisaient `redis-cli` pour exécuter des commandes Redis avancées comme `XADD`.

### 1.2 Limitations du node Redis natif

Le node Redis de n8n ne supporte **pas** les opérations Redis Streams :

| Opération | Supportée |
|-----------|-----------|
| `XADD` | ❌ Non |
| `XREAD` | ❌ Non |
| `XACK` | ❌ Non |

> Voir [REDIS_LIMITATIONS.md](./REDIS_LIMITATIONS.md) pour la liste complète des limitations.

### 1.3 La solution : Micro-service HTTP

Pour contourner ces limitations, nous avons créé un **micro-service FastAPI** qui expose les opérations Redis Streams via HTTP. n8n peut ainsi utiliser le node **HTTP Request** (toujours disponible) pour exécuter `XADD`.

```
┌─────────────────┐      HTTP POST       ┌─────────────────────┐
│      n8n        │ ──────────────────▶ │ Redis XADD Service  │
│  HTTP Request   │                      │    (FastAPI)        │
│                 │ ◀────────────────── │                     │
│                 │    JSON response     │         │           │
└─────────────────┘                      └─────────┼───────────┘
                                                   │
                                                   ▼
                                         ┌─────────────────────┐
                                         │       Redis         │
                                         │  (Stream XADD)      │
                                         │  DB 5               │
                                         └─────────────────────┘
```

---

## 2. Le Micro-Service

### 2.1 Fichier source

```
services/redis_xadd_service.py
```

### 2.2 Endpoints disponibles

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Health check + état Redis |
| `/xadd` | POST | XADD générique sur n'importe quel stream |
| `/tools/notify` | POST | Endpoint spécifique pour MCP Tools Notify |
| `/events/publish` | POST | Endpoint générique pour publier des événements |
| `/key/{key}` | GET | Lire une clé Redis (remplace `cat file`) |
| `/key/{key}` | PUT | Écrire une clé Redis (remplace `echo > file`) |
| `/key/{key}` | DELETE | Supprimer une clé Redis (remplace `rm file`) |

### 2.3 Configuration

Le service utilise ces variables d'environnement :

| Variable | Description | Valeur par défaut |
|----------|-------------|-------------------|
| `REDIS_HOST` | Hôte Redis | `host3.local` |
| `REDIS_PORT` | Port Redis | `6381` |
| `REDIS_DB_NOTIFICATION` | Base Redis | `5` |
| `REDIS_PASSWORD` | Mot de passe (optionnel) | `None` |
| `REDIS_XADD_SERVICE_PORT` | Port du service | `8765` |

### 2.4 Exemples d'appels

#### Health Check
```bash
curl http://localhost:8765/health
```

Réponse :
```json
{
  "status": "healthy",
  "redis_connected": true,
  "redis_host": "host3.local",
  "redis_port": 6381,
  "redis_db": 5
}
```

#### XADD générique
```bash
curl -X POST http://localhost:8765/xadd \
  -H "Content-Type: application/json" \
  -d '{
    "stream": "my:custom:stream",
    "fields": {"action": "test", "data": "hello"},
    "max_len": 1000
  }'
```

#### Tools Notify (pour MCP)
```bash
curl -X POST http://localhost:8765/tools/notify \
  -H "Content-Type: application/json" \
  -d '{
    "action": "workflow_updated",
    "workflow_name": "My Workflow"
  }'
```

#### Lire une clé (GET /key/{key})
```bash
curl http://localhost:8765/key/n8n:pending_channels
```

Réponse (clé existe) :
```json
{
  "success": true,
  "key": "n8n:pending_channels",
  "value": "{\"channel_id\":\"123\"}\n{\"channel_id\":\"456\"}",
  "exists": true
}
```

Réponse (clé n'existe pas) :
```json
{
  "success": true,
  "key": "n8n:pending_channels",
  "value": null,
  "exists": false
}
```

#### Écrire une clé (PUT /key/{key})
```bash
curl -X PUT http://localhost:8765/key/n8n:pending_channels \
  -H "Content-Type: application/json" \
  -d '{
    "value": "{\"channel_id\":\"123\"}\n{\"channel_id\":\"456\"}",
    "ttl": 86400
  }'
```

Réponse :
```json
{
  "success": true,
  "key": "n8n:pending_channels",
  "value": "{\"channel_id\":\"123\"}\n{\"channel_id\":\"456\"}"
}
```

> **Note:** Le paramètre `ttl` est optionnel (en secondes). Sans TTL, la clé n'expire jamais.

#### Supprimer une clé (DELETE /key/{key})
```bash
curl -X DELETE http://localhost:8765/key/n8n:pending_channels
```

Réponse :
```json
{
  "success": true,
  "key": "n8n:pending_channels",
  "exists": true
}
```

---

## 3. Déploiement avec PM2 (Production actuelle)

### 3.1 Méthode recommandée : Script deploy.sh

```bash
cd /storage6/pi6/n8n-workflows

# Restart n8n + déployer le service Redis XADD
./deploy.sh --services

# Build complet avec services
./deploy.sh --build --services
```

### 3.2 Démarrage manuel (alternative)

```bash
cd /storage6/pi6/n8n-workflows

# Activer l'environnement virtuel
source .venv/bin/activate

# Démarrer avec PM2
pm2 start services/redis_xadd_service.py \
  --name redis-xadd \
  --interpreter .venv/bin/python3
```

### 3.2 Configuration PM2 recommandée

Ajouter à `ecosystem.config.js` :

```javascript
module.exports = {
  apps: [
    {
      name: 'n8n',
      script: 'n8n',
      args: 'start',
      cwd: '/storage6/pi6/n8n-workflows',
      env: {
        NODES_EXCLUDE: '[]',
        N8N_COMMUNITY_PACKAGES_ENABLED: 'true',
        N8N_REINSTALL_MISSING_PACKAGES: 'true',
        N8N_BLOCK_ENV_ACCESS_IN_NODE: 'false',
        N8N_SECURE_COOKIE: 'false',
        REDIS_XADD_SERVICE_URL: 'http://pi6.local:8765'
      }
    },
    {
      name: 'redis-xadd',
      script: 'services/redis_xadd_service.py',
      interpreter: '/storage6/pi6/n8n-workflows/.venv/bin/python3',
      cwd: '/storage6/pi6/n8n-workflows',
      env: {
        REDIS_HOST: 'host3.local',
        REDIS_PORT: '6381',
        REDIS_DB_NOTIFICATION: '5',
        REDIS_XADD_SERVICE_PORT: '8765'
      }
    }
  ]
};
```

### 3.3 Démarrage avec ecosystem.config.js

```bash
# Supprimer les anciennes instances
pm2 delete n8n redis-xadd 2>/dev/null

# Démarrer tout
pm2 start ecosystem.config.js

# Sauvegarder pour redémarrage auto
pm2 save
```

### 3.4 Vérification

```bash
# Voir les logs
pm2 logs redis-xadd --lines 20

# Tester le service
curl http://localhost:8765/health
```

---

## 4. Déploiement avec Docker

### 4.1 Dockerfile

Créer `services/Dockerfile.redis-xadd` :

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Installer les dépendances
COPY requirements-redis-xadd.txt .
RUN pip install --no-cache-dir -r requirements-redis-xadd.txt

# Copier le service
COPY redis_xadd_service.py .

# Port par défaut
EXPOSE 8765

# Variables d'environnement par défaut
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379
ENV REDIS_DB_NOTIFICATION=5
ENV REDIS_XADD_SERVICE_PORT=8765

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8765/health || exit 1

# Démarrage
CMD ["python", "redis_xadd_service.py"]
```

### 4.2 Requirements

Créer `services/requirements-redis-xadd.txt` :

```
fastapi>=0.104.0
uvicorn>=0.24.0
redis>=5.0.0
pydantic>=2.0.0
```

### 4.3 Docker Compose

Ajouter au `docker-compose.yml` existant ou créer `docker-compose.redis-xadd.yml` :

```yaml
version: '3.8'

services:
  redis-xadd-service:
    build:
      context: ./services
      dockerfile: Dockerfile.redis-xadd
    container_name: redis-xadd-service
    restart: unless-stopped
    ports:
      - "8765:8765"
    environment:
      - REDIS_HOST=${REDIS_HOST:-redis}
      - REDIS_PORT=${REDIS_PORT:-6379}
      - REDIS_DB_NOTIFICATION=${REDIS_DB_NOTIFICATION:-5}
      - REDIS_PASSWORD=${REDIS_PASSWORD:-}
      - REDIS_XADD_SERVICE_PORT=8765
    networks:
      - n8n-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8765/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 5s
    depends_on:
      - redis

  # Si Redis n'est pas déjà défini
  redis:
    image: redis:7-alpine
    container_name: n8n-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    networks:
      - n8n-network

  n8n:
    image: n8nio/n8n:latest
    container_name: n8n
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      - N8N_BLOCK_ENV_ACCESS_IN_NODE=false
      - N8N_SECURE_COOKIE=false
      # URL du service Redis XADD (nom du container Docker)
      - REDIS_XADD_SERVICE_URL=http://redis-xadd-service:8765
    networks:
      - n8n-network
    depends_on:
      - redis-xadd-service

networks:
  n8n-network:
    driver: bridge

volumes:
  redis-data:
```

### 4.4 Build et démarrage

**Méthode recommandée : Script deploy.sh**

```bash
cd /storage6/pi6/n8n-workflows

# Déployer n8n + services en mode Docker
./deploy.sh --docker --services

# Build complet avec services en Docker
./deploy.sh --docker --services --build
```

**Méthode manuelle (alternative)**

```bash
cd services

# Build l'image
docker compose -f docker-compose.redis-xadd.yml build

# Démarrer les services
docker compose -f docker-compose.redis-xadd.yml up -d --build

# Vérifier les logs
docker compose -f docker-compose.redis-xadd.yml logs -f redis-xadd-service
```

### 4.5 Configuration n8n dans Docker

**Important :** Dans Docker, l'URL du service est le nom du container, pas `localhost` :

```
REDIS_XADD_SERVICE_URL=http://redis-xadd-service:8765
```

Cette variable doit être définie dans l'environnement du container n8n.

---

## 5. Workflow MCP - Tools Notify

### 5.1 Description

Le workflow `MCP - Tools Notify` permet de notifier les autres services quand un workflow est mis à jour. Il publie un événement dans le stream Redis `tools:events:stream`.

### 5.2 Fichier

```
workflows/MCP_-_Tools_Notify.json
```

### 5.3 Architecture du workflow

```
┌─────────────┐    ┌─────────────────────┐    ┌─────────────┐
│   Webhook   │───▶│ Redis XADD Service  │───▶│  Response   │
│  POST /...  │    │   HTTP Request      │    │   JSON      │
└─────────────┘    └─────────────────────┘    └─────────────┘
```

### 5.4 Configuration

Le workflow utilise la variable d'environnement :

```
$env.REDIS_XADD_SERVICE_URL
```

Exemple d'URL construite :
```
{{ $env.REDIS_XADD_SERVICE_URL }}/tools/notify
→ http://pi6.local:8765/tools/notify
```

### 5.5 Endpoint

**URL:** `POST /webhook/mcp/tools/notify`

**Payload:**
```json
{
  "action": "workflow_updated",
  "workflow_name": "Mon Workflow"
}
```

**Réponse:**
```json
{
  "success": true,
  "stream_id": "1778862554199-0",
  "action": "workflow_updated"
}
```

### 5.6 Test

```bash
curl -X POST http://pi6.local:5678/webhook/mcp/tools/notify \
  -H "Content-Type: application/json" \
  -d '{"action": "test", "workflow_name": "TEST_WORKFLOW"}'
```

---

## 6. Troubleshooting

### 6.1 Erreur "Invalid URL"

**Symptôme:**
```
Invalid URL: /tools/notify. URL must start with "http" or "https".
```

**Cause:** La variable `$env.REDIS_XADD_SERVICE_URL` est vide ou non définie.

**Solution (PM2):**
```bash
# Vérifier que la variable est dans ecosystem.config.js
grep REDIS_XADD ecosystem.config.js

# Redémarrer avec le fichier config
pm2 delete n8n && pm2 start ecosystem.config.js

# Vérifier l'environnement
pm2 env <id_n8n> | grep REDIS
```

**Solution (Docker):**
```bash
# Vérifier la variable d'environnement
docker exec n8n env | grep REDIS

# Recréer le container si nécessaire
docker-compose up -d --force-recreate n8n
```

### 6.2 Erreur de connexion Redis

**Symptôme:**
```
Redis error: Error 111 connecting to host3.local:6381
```

**Solution:**
- Vérifier que Redis est accessible
- Vérifier les variables REDIS_HOST, REDIS_PORT
- Dans Docker, utiliser le nom du service/container

### 6.3 Workflow en erreur mais pas de logs

**Solution:** Vérifier les exécutions dans n8n :
```bash
# Via API
curl -s http://pi6.local:5678/api/v1/executions?workflowId=<ID>&limit=5 \
  -H "X-N8N-API-KEY: <API_KEY>" | jq '.data[].status'
```

### 6.4 PM2 ne charge pas les nouvelles variables

**Symptôme:** Après modification de `ecosystem.config.js`, les variables ne sont pas mises à jour.

**Solution:**
```bash
# Ne pas utiliser --update-env, mais supprimer et recréer
pm2 delete n8n
pm2 start ecosystem.config.js
```

---

## 7. Sécurité

### 7.1 Recommandations

1. **Réseau interne uniquement** : Ne pas exposer le port 8765 sur Internet
2. **Authentification** : Ajouter un token si le service est exposé
3. **Rate limiting** : Configurer un rate limit si nécessaire
4. **Logs** : Surveiller les logs pour détecter les abus

### 7.2 Exemple avec authentification (futur)

```python
# À ajouter dans redis_xadd_service.py
from fastapi import Depends, HTTPException, Header

API_TOKEN = os.getenv("REDIS_XADD_API_TOKEN")

async def verify_token(x_api_token: str = Header(...)):
    if API_TOKEN and x_api_token != API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.post("/xadd", dependencies=[Depends(verify_token)])
async def xadd(request: XAddRequest):
    ...
```

---

## 8. Migration ExecuteCommand → HTTP Request

### 8.1 Contexte

Depuis n8n 2.0, le node `ExecuteCommand` est désactivé par défaut. Les workflows qui utilisaient des commandes shell pour lire/écrire des fichiers doivent être migrés vers des appels HTTP au service Redis XADD.

### 8.2 Exemple : CHANNELS---Private-Recovery

Ce workflow a été migré de fichiers locaux vers Redis :

| Ancien (ExecuteCommand) | Nouveau (HTTP Request) |
|-------------------------|------------------------|
| `cat /var/log/n8n/pending_channels.log` | `GET /key/n8n:pending_channels` |
| `rm /var/log/n8n/pending_channels.log` | `DELETE /key/n8n:pending_channels` |
| `echo '...' > /var/log/n8n/pending_channels.log` | `PUT /key/n8n:pending_channels` |

### 8.3 Avantages de la migration

1. **Compatibilité n8n 2.0+** : Pas besoin de réactiver ExecuteCommand
2. **Persistance** : Redis est plus robuste qu'un fichier local
3. **Scalabilité** : Fonctionne en environnement distribué (Docker, Kubernetes)
4. **Observabilité** : Les clés Redis sont inspectables avec redis-cli

### 8.4 Configuration n8n dans le workflow

Utiliser la variable d'environnement dans les URLs :

```
{{ $env.REDIS_XADD_SERVICE_URL }}/key/n8n:pending_channels
```

### 8.5 Adaptation du code JavaScript

**Avant (lecture fichier):**
```javascript
const output = $input.first().json.stdout || '';
if (!output.trim()) {
  return { has_entries: false };
}
```

**Après (lecture Redis):**
```javascript
const response = $input.first().json;
if (!response.exists || !response.value) {
  return { has_entries: false };
}
const content = response.value;
```

---

## 9. Références

- [REDIS_LIMITATIONS.md](./REDIS_LIMITATIONS.md) - Limitations Redis dans n8n
- [RFC-089](../rfc/) - Skills API Architecture
- [RFC-090](../rfc/) - Skills API Async Architecture
- [n8n 2.0 Release Notes](https://docs.n8n.io/) - Changements de sécurité
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
