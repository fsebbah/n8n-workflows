# n8n API - Gestion des Workflows

Ce document résume les découvertes et bonnes pratiques pour la création, suppression et activation de workflows n8n via l'API REST.

## Configuration requise

### Variables d'environnement (.env.local)

```bash
N8N_API_URL=http://pi6.local:5678/api/v1
N8N_API_KEY=votre-api-key-jwt
N8N_WEBHOOK_BASE_URL=http://pi6.local:5678/webhook
```

### Script d'aide

Le script `scripts/n8n_api.py` résout les problèmes d'encodage shell avec les tokens JWT et fournit une interface simple pour l'API n8n.

```bash
# Commandes disponibles
python3 scripts/n8n_api.py list                    # Lister tous les workflows
python3 scripts/n8n_api.py get <id>                # Détails d'un workflow
python3 scripts/n8n_api.py export <id> [file]      # Exporter en JSON
python3 scripts/n8n_api.py import <file>           # Importer depuis JSON
python3 scripts/n8n_api.py update <id> <file>      # Mettre à jour
python3 scripts/n8n_api.py delete <id>             # Supprimer
python3 scripts/n8n_api.py activate <id>           # Activer
python3 scripts/n8n_api.py deactivate <id>         # Désactiver
python3 scripts/n8n_api.py search <pattern>        # Rechercher par nom
python3 scripts/n8n_api.py test-webhook <path>     # Tester un webhook
```

## Structure d'un workflow JSON

### Exemple minimal fonctionnel (webhook)

```json
{
  "name": "MCP - Test - Echo",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "mcp-test-echo",
        "responseMode": "responseNode",
        "options": {}
      },
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300],
      "webhookId": "mcp-test-echo"
    },
    {
      "parameters": {
        "jsCode": "return [{ json: { success: true } }];"
      },
      "name": "Process",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [470, 300]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ $json }}",
        "options": { "responseCode": 200 }
      },
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1.1,
      "position": [690, 300]
    }
  ],
  "connections": {
    "Webhook Trigger": {
      "main": [[{"node": "Process", "type": "main", "index": 0}]]
    },
    "Process": {
      "main": [[{"node": "Respond", "type": "main", "index": 0}]]
    }
  },
  "settings": {"executionOrder": "v1"}
}
```

## Règles importantes découvertes

### 1. Champ `active` est READ-ONLY

**ERREUR** : Inclure `"active": false` dans le JSON lors de l'import
```
{"message":"request/body/active is read-only"}
```

**SOLUTION** : Ne jamais inclure le champ `active` dans le JSON d'import. Utiliser l'endpoint `/activate` après l'import.

### 2. webhookId obligatoire pour les webhooks

**PROBLÈME** : Sans `webhookId`, le webhook n'est pas enregistré même si le workflow est actif.
```
{"message":"The requested webhook \"POST test-echo\" is not registered."}
```

**SOLUTION** : Toujours inclure `webhookId` dans le node webhook, avec une valeur qui correspond au `path`.

```json
{
  "parameters": {
    "path": "mcp-test-echo"
  },
  "webhookId": "mcp-test-echo",
  "type": "n8n-nodes-base.webhook",
  "typeVersion": 1
}
```

### 3. typeVersion pour les webhooks

**RECOMMANDATION** : Utiliser `typeVersion: 1` pour les nodes webhook (plus stable pour l'enregistrement des webhooks).

### 4. Ne pas spécifier d'IDs personnalisés pour les nodes

**PROBLÈME** : Les IDs personnalisés (`"id": "webhook-trigger"`) peuvent causer des erreurs d'activation (400).

**SOLUTION** : Ne pas inclure le champ `id` dans les nodes - n8n génère automatiquement des UUIDs.

### 5. Tags avec IDs personnalisés

**PROBLÈME** : Les tags avec IDs personnalisés (`"id": "mcp-tag"`) peuvent causer des conflits.

**SOLUTION** : Ne pas inclure de tags lors de l'import, ou utiliser uniquement le nom sans ID.

## Workflow de déploiement

### 1. Créer le fichier JSON

```bash
# Structure recommandée
workflows/mcp/MCP_Service_Action.json
```

### 2. Importer le workflow

```bash
python3 scripts/n8n_api.py import workflows/mcp/MCP_Test_Echo.json
# Retourne l'ID du workflow créé
```

### 3. Activer le workflow

```bash
python3 scripts/n8n_api.py activate <workflow_id>
```

### 4. Tester le webhook

```bash
python3 scripts/n8n_api.py test-webhook mcp-test-echo
```

## Endpoints API utilisés

| Action | Méthode | Endpoint |
|--------|---------|----------|
| Lister | GET | `/workflows` |
| Détails | GET | `/workflows/{id}` |
| Créer | POST | `/workflows` |
| Mettre à jour | PUT | `/workflows/{id}` |
| Supprimer | DELETE | `/workflows/{id}` |
| Activer | POST | `/workflows/{id}/activate` |
| Désactiver | POST | `/workflows/{id}/deactivate` |

### Header requis

```
X-N8N-API-KEY: <votre-jwt-token>
Content-Type: application/json
```

### Activation - Body requis

L'endpoint `/activate` nécessite un body JSON (même vide) :
```bash
curl -X POST ".../workflows/{id}/activate" \
  -H "X-N8N-API-KEY: ..." \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Problèmes courants et solutions

| Erreur | Cause | Solution |
|--------|-------|----------|
| `active is read-only` | Champ `active` dans le JSON | Retirer le champ |
| `webhook not registered` | Pas de `webhookId` | Ajouter `webhookId` = `path` |
| `400` à l'activation | IDs personnalisés dans nodes | Retirer les `id` des nodes |
| Shell quoting errors | JWT avec caractères spéciaux | Utiliser le script Python |

## Convention de nommage

### Workflows MCP

- **Nom** : `MCP - Service - Action` (ex: `MCP - Gmail - Read Email`)
- **Fichier** : `MCP_Service_Action.json`
- **Webhook path** : `mcp-service-action` (ex: `mcp-gmail-read-email`)
- **webhookId** : Identique au path

### Exemples

| Service | Action | Webhook Path |
|---------|--------|--------------|
| Test | Echo | `mcp-test-echo` |
| Gmail | Read Email | `mcp-gmail-read-email` |
| Gmail | List Labels | `mcp-gmail-list-labels` |
| Drive | List Files | `mcp-drive-list-files` |

## Référence

- [n8n API Documentation](https://docs.n8n.io/api/)
- [n8n Webhook Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
