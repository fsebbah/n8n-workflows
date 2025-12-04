# Installation et Utilisation du Custom Node Gmail Tool Dynamic

## Résumé

Le node `Gmail Tool Dynamic` permet d'utiliser l'API Gmail avec un **token OAuth dynamique** passé en paramètre, au lieu d'un credential statique configuré dans n8n. Cela permet une architecture **multi-tenant**.

## Prérequis

- n8n installé (npm global ou Docker)
- Node.js v22+
- Le projet `n8n-nodes-gmail-dynamic` buildé

## Installation

### Étape 1 : Builder le custom node

```bash
cd /home/fsebb/n8n-workflows/custom-nodes/n8n-nodes-gmail-dynamic
npm install
npm run build
```

### Étape 2 : Configurer N8N_CUSTOM_EXTENSIONS

Ajouter la variable d'environnement dans le script de démarrage n8n :

```bash
export N8N_CUSTOM_EXTENSIONS=/home/fsebb/n8n-workflows/custom-nodes/n8n-nodes-gmail-dynamic
```

Cette variable est déjà configurée dans `scripts/n8n_debug.sh`.

### Étape 3 : Redémarrer n8n

```bash
./scripts/n8n_debug.sh stop
./scripts/n8n_debug.sh start
```

### Étape 4 : Vérifier le chargement

Dans les logs de démarrage, vous devriez voir :

```
debug   No codex available for: gmailToolDynamic
```

Cela confirme que le node est chargé.

## Vérification dans l'UI

1. Ouvrir http://pi6.local:5678
2. Créer un nouveau workflow
3. Cliquer sur "+" pour ajouter un node
4. Rechercher "Gmail Dynamic" ou "dynamic"
5. Le node **"Gmail Tool Dynamic"** doit apparaître avec l'icône Gmail

## Format du Type dans les Workflows JSON

**Important** : Le type du node dans les fichiers JSON est :

```json
"type": "CUSTOM.gmailToolDynamic"
```

**Et non pas** :
- ❌ `n8n-nodes-gmail-dynamic.gmailToolDynamic`
- ❌ `gmailToolDynamic`

## Utilisation dans un Workflow

### Structure du node

```json
{
  "name": "Get message",
  "type": "CUSTOM.gmailToolDynamic",
  "typeVersion": 1,
  "position": [400, 600],
  "parameters": {
    "accessToken": "={{ $json.body.access_token }}",
    "resource": "message",
    "operation": "get",
    "messageId": "={{ $json.body.message_id }}"
  }
}
```

### Paramètres principaux

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `accessToken` | Token OAuth Gmail (expression) | `{{ $json.body.access_token }}` |
| `resource` | Type de ressource | `message`, `draft`, `label`, `thread` |
| `operation` | Opération à effectuer | `get`, `search`, `send`, etc. |

### Opérations disponibles

#### Messages (24 actions)
- `search` - Rechercher des messages
- `get` - Obtenir un message par ID
- `getMany` - Obtenir plusieurs messages
- `send` - Envoyer un email
- `reply` - Répondre à un email
- `delete` - Supprimer (mettre à la corbeille)
- `markRead` - Marquer comme lu
- `markUnread` - Marquer comme non lu
- `addLabels` - Ajouter des labels
- `removeLabels` - Retirer des labels

#### Drafts
- `create` - Créer un brouillon
- `get` - Obtenir un brouillon
- `getMany` - Lister les brouillons
- `delete` - Supprimer un brouillon
- `send` - Envoyer un brouillon

#### Labels
- `list` - Lister tous les labels
- `get` - Obtenir un label
- `create` - Créer un label
- `delete` - Supprimer un label
- `update` - Mettre à jour un label

#### Threads
- `get` - Obtenir un thread
- `getMany` - Lister les threads
- `delete` - Supprimer un thread
- `modify` - Modifier les labels d'un thread

## Exemple : Workflow MCP Gmail

### Architecture

```
POST /webhook/mcp-gmail
  │
  │  body: {
  │    access_token: "ya29...",
  │    message_id: "18abc..."
  │  }
  │
  ▼
┌─────────────────────────┐
│  Webhook MCP Gmail      │
│  POST /mcp-gmail        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Gmail Tool Dynamic     │
│  CUSTOM.gmailToolDynamic│
│                         │
│  accessToken: $json...  │
│  operation: get         │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Respond to Webhook     │
│  { success, data }      │
└─────────────────────────┘
```

### Payload d'entrée (MCP Server → n8n)

```json
{
  "access_token": "ya29.a0AfH6SMBx...",
  "message_id": "18abc123def456"
}
```

### Payload de sortie (n8n → MCP Server)

```json
{
  "success": true,
  "operation": "get",
  "resource": "message",
  "data": {
    "id": "18abc123def456",
    "threadId": "...",
    "labelIds": ["INBOX"],
    "snippet": "Contenu...",
    "payload": { ... }
  },
  "error": null
}
```

## Hacker un Workflow Existant

Pour convertir un node `gmailTool` natif vers `gmailToolDynamic` :

### Avant (node natif)

```json
{
  "name": "get",
  "type": "n8n-nodes-base.gmailTool",
  "parameters": {
    "messageId": "={{ $fromAI('Message_ID') }}",
    "operation": "get"
  },
  "credentials": {
    "gmailOAuth2": {}
  },
  "typeVersion": 2.1
}
```

### Après (node dynamique)

```json
{
  "name": "get",
  "type": "CUSTOM.gmailToolDynamic",
  "parameters": {
    "accessToken": "={{ $json.body.access_token }}",
    "resource": "message",
    "operation": "get",
    "messageId": "={{ $json.body.message_id }}"
  },
  "typeVersion": 1
}
```

### Changements clés

1. **type** : `n8n-nodes-base.gmailTool` → `CUSTOM.gmailToolDynamic`
2. **Supprimer** : `credentials: { gmailOAuth2: {} }`
3. **Ajouter** : `accessToken` avec expression dynamique
4. **Ajouter** : `resource` (message, draft, label, thread)
5. **typeVersion** : `2.1` → `1`

## Troubleshooting

### Le node n'apparaît pas dans l'UI

1. Vérifier que `N8N_CUSTOM_EXTENSIONS` est défini
2. Vérifier que le build existe : `ls custom-nodes/n8n-nodes-gmail-dynamic/dist/`
3. Redémarrer n8n

### "Unrecognized node type"

Vérifier le format du type :
- ✅ Correct : `CUSTOM.gmailToolDynamic`
- ❌ Incorrect : `n8n-nodes-gmail-dynamic.gmailToolDynamic`

### Erreur 401 Unauthorized

Le token OAuth est expiré ou invalide. Régénérer via :
- MCP Server (production)
- Google OAuth Playground (test)

### Erreur 404 Not Found

Le `message_id` ou `thread_id` est invalide.

## Scripts Utiles

### Démarrer n8n avec le custom node

```bash
./scripts/n8n_debug.sh start
```

### Mettre à jour un workflow

```bash
python3 scripts/n8n_api.py update <workflow_id> workflows/mcp/Gmail_MCP_Server_3605.json
```

### Activer un workflow

```bash
python3 scripts/n8n_api.py activate <workflow_id>
```

### Tester le webhook

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-gmail \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "VOTRE_TOKEN",
    "message_id": "ID_MESSAGE"
  }'
```

## Références

- [n8n Custom Node Development](https://docs.n8n.io/integrations/creating-nodes/overview/)
- [Gmail API Reference](https://developers.google.com/gmail/api/reference/rest)
- Code source : `custom-nodes/n8n-nodes-gmail-dynamic/`
