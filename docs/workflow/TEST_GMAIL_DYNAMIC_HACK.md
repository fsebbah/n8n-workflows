# Test du Hack Gmail Dynamic Token

## Objectif

Tester le workflow Gmail hacké qui accepte un token OAuth dynamique au lieu d'un credential statique.

## Prérequis

1. **n8n** installé et custom node `n8n-nodes-gmail-dynamic` linké
2. **Token OAuth Gmail** valide pour un utilisateur
3. **Message ID** d'un email existant dans la boîte Gmail

---

## Étape 1 : Démarrer n8n

```bash
cd /home/fsebb/n8n-workflows
./scripts/n8n_debug.sh start
```

Attendre que n8n soit prêt (logs visibles dans le terminal).

---

## Étape 2 : Mettre à jour le workflow

Dans un **autre terminal** :

```bash
cd /home/fsebb/n8n-workflows

# Mettre à jour le workflow existant avec le hack
python3 scripts/n8n_api.py update qkujt1SvJA0czPFh workflows/mcp/Gmail_MCP_Server_3605.json

# Activer le workflow
python3 scripts/n8n_api.py activate qkujt1SvJA0czPFh
```

---

## Étape 3 : Tester le webhook

### Payload de test

```json
{
  "access_token": "VOTRE_TOKEN_OAUTH_GMAIL",
  "message_id": "ID_DUN_MESSAGE_EXISTANT"
}
```

### Commande curl

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-gmail \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "ya29.a0AfH6SMBx...",
    "message_id": "18abc123def456"
  }'
```

---

## Étape 4 : Vérifier la réponse

### Réponse attendue (succès)

```json
{
  "success": true,
  "operation": "get",
  "resource": "message",
  "data": {
    "id": "18abc123def456",
    "threadId": "...",
    "labelIds": ["INBOX", "UNREAD"],
    "snippet": "Contenu de l'email...",
    "payload": {
      "headers": [...],
      "body": {...}
    }
  },
  "error": null
}
```

### Réponse en cas d'erreur

```json
{
  "success": true,
  "operation": "get",
  "resource": "message",
  "data": {
    "error": "Request failed with status code 401",
    "errorDetails": {...}
  },
  "error": null
}
```

---

## Obtenir un token OAuth Gmail

### Option 1 : Via MCP Server (production)

Le MCP Server fournit le token depuis Redis pour l'utilisateur connecté.

### Option 2 : Via Google OAuth Playground (test)

1. Aller sur https://developers.google.com/oauthplayground/
2. Sélectionner `Gmail API v1` → `https://mail.google.com/`
3. Cliquer "Authorize APIs"
4. Se connecter avec le compte Gmail
5. Cliquer "Exchange authorization code for tokens"
6. Copier le `access_token`

**Note** : Le token expire après 1 heure.

---

## Obtenir un Message ID

### Via Gmail API

```bash
curl -X GET "https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=1" \
  -H "Authorization: Bearer VOTRE_TOKEN"
```

### Via le workflow search (après hack de tous les nodes)

```bash
curl -X POST http://pi6.local:5678/webhook/mcp-gmail \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "VOTRE_TOKEN",
    "operation": "search",
    "query": "is:unread"
  }'
```

---

## Troubleshooting

| Erreur | Cause | Solution |
|--------|-------|----------|
| `401 Unauthorized` | Token expiré ou invalide | Régénérer le token |
| `404 Not Found` | Message ID invalide | Vérifier l'ID du message |
| `webhook not registered` | Workflow non activé | `python3 scripts/n8n_api.py activate qkujt1SvJA0czPFh` |
| `Unknown node type` | Custom node non installé | `cd ~/.n8n && npm link n8n-nodes-gmail-dynamic` |

---

## Architecture du hack

```
┌──────────────────────────────────┐
│  POST /webhook/mcp-gmail         │
│  body: {                         │
│    access_token: "ya29...",      │
│    message_id: "18abc..."        │
│  }                               │
└───────────────┬──────────────────┘
                │
                ▼
┌──────────────────────────────────┐
│  get (gmailToolDynamic)          │
│  - accessToken: $json.body.token │
│  - messageId: $json.body.msg_id  │
└───────────────┬──────────────────┘
                │
                ▼
┌──────────────────────────────────┐
│  Respond to Webhook              │
│  { success, operation, data }    │
└──────────────────────────────────┘
```

---

## Prochaines étapes

Une fois le test `get` validé :
1. Hacker les 20 autres nodes `gmailTool` → `gmailToolDynamic`
2. Ajouter un Switch node pour router selon `operation`
3. Documenter l'API complète pour l'équipe MCP Server
