# Guide : Utilisation du Redis XADD Service dans n8n

**Date:** 2026-05-20
**Version:** 1.1.0

---

## Introduction

Le **Redis XADD Service** est un micro-service HTTP qui permet à n8n d'interagir avec Redis sans utiliser le node `ExecuteCommand` (désactivé depuis n8n 2.0).

Ce guide explique comment utiliser ce service dans vos workflows n8n.

---

## Prérequis

1. Le service `redis-xadd-service` doit être démarré (Docker ou PM2)
2. La variable d'environnement `REDIS_XADD_SERVICE_URL` doit être configurée dans n8n
3. Le service doit pouvoir accéder à Redis

---

## Cas d'usage

### 1. Stocker des données temporaires (remplace les fichiers)

**Problème :** Vous utilisiez un fichier pour stocker des données entre exécutions.

**Solution :** Utiliser une clé Redis via HTTP Request.

#### Écrire des données

```
Node: HTTP Request
Method: PUT
URL: {{ $env.REDIS_XADD_SERVICE_URL }}/key/mon:namespace:ma_cle
Body (JSON):
{
  "value": "{{ $json.data }}",
  "ttl": 3600
}
```

#### Lire des données

```
Node: HTTP Request
Method: GET
URL: {{ $env.REDIS_XADD_SERVICE_URL }}/key/mon:namespace:ma_cle
```

Réponse :
```json
{
  "success": true,
  "key": "mon:namespace:ma_cle",
  "value": "mes données",
  "exists": true
}
```

#### Supprimer des données

```
Node: HTTP Request
Method: DELETE
URL: {{ $env.REDIS_XADD_SERVICE_URL }}/key/mon:namespace:ma_cle
```

---

### 2. Publier des événements (Redis Streams)

**Problème :** Vous voulez notifier d'autres services qu'une action s'est produite.

**Solution :** Utiliser XADD pour publier dans un stream Redis.

```
Node: HTTP Request
Method: POST
URL: {{ $env.REDIS_XADD_SERVICE_URL }}/xadd
Body (JSON):
{
  "stream": "mon:stream:events",
  "fields": {
    "event": "user_created",
    "user_id": "{{ $json.user_id }}",
    "timestamp": "{{ $now.toISO() }}"
  },
  "max_len": 1000
}
```

---

### 3. Notifier les outils MCP

**Problème :** Vous avez mis à jour un workflow et voulez notifier le système MCP.

**Solution :** Utiliser l'endpoint `/tools/notify`.

```
Node: HTTP Request
Method: POST
URL: {{ $env.REDIS_XADD_SERVICE_URL }}/tools/notify
Body (JSON):
{
  "action": "workflow_updated",
  "workflow_name": "Mon Workflow"
}
```

---

## Bonnes pratiques

### Nommage des clés

Utilisez des namespaces pour organiser vos clés :

```
n8n:workflow_name:purpose
```

Exemples :
- `n8n:channels:pending` - Channels en attente de traitement
- `n8n:cache:api_response` - Cache de réponse API
- `n8n:state:last_run` - État de la dernière exécution

### TTL (Time-To-Live)

Définissez toujours un TTL pour les données temporaires :

```json
{
  "value": "données",
  "ttl": 86400  // 24 heures
}
```

### Gestion des erreurs

Ajoutez `onError: "continueRegularOutput"` pour gérer les cas où le service est indisponible :

```json
{
  "onError": "continueRegularOutput"
}
```

Puis vérifiez dans le code suivant :

```javascript
const response = $input.first().json;

if (response.error || !response.success) {
  // Gérer l'erreur
  return { error: true, message: 'Redis service unavailable' };
}
```

---

## Exemples de workflows

### Workflow : Recovery avec Redis

Voir `workflows/CHANNELS---Private-Recovery.json` pour un exemple complet de migration depuis ExecuteCommand vers HTTP Request.

**Architecture :**
```
Schedule Trigger
      │
      ▼
GET /key/n8n:pending_channels  ──► Parse JSONL
      │
      ▼
Process entries...
      │
      ├─► All success? ──► DELETE /key/n8n:pending_channels
      │
      └─► Some failed? ──► PUT /key/n8n:pending_channels (failures only)
```

---

## Dépannage

### Le service ne répond pas

1. Vérifier que le container/process est en cours d'exécution :
   ```bash
   docker ps | grep redis-xadd
   # ou
   pm2 list | grep redis-xadd
   ```

2. Tester le health check :
   ```bash
   curl http://localhost:8765/health
   ```

### Variable d'environnement non définie

**Symptôme :** `Invalid URL: /key/...`

**Solution :** Vérifier que `REDIS_XADD_SERVICE_URL` est définie :
```bash
# Docker
docker exec n8n env | grep REDIS_XADD

# PM2
pm2 env <n8n_id> | grep REDIS_XADD
```

### Clé non trouvée

**Symptôme :** `"exists": false` dans la réponse

C'est un comportement normal si la clé n'a jamais été créée ou a expiré (TTL). Gérez ce cas dans votre code :

```javascript
if (!response.exists) {
  // Initialiser avec une valeur par défaut
  return { data: [] };
}
```

---

## Références

- [Documentation complète](../n8n/REDIS_XADD_SERVICE.md)
- [Limitations Redis dans n8n](../n8n/REDIS_LIMITATIONS.md)
- [Code source](../../services/redis_xadd_service.py)
