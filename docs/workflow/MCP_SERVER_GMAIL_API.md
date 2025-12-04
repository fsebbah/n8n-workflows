# API Gmail pour MCP Server

Documentation pour l'équipe MCP Server sur l'intégration avec le service Gmail n8n.

## Endpoint

```
POST http://pi6.local:5678/webhook/mcp-gmail
Content-Type: application/json
```

## Payload de Requête

```json
{
  "access_token": "ya29.a0AfH6SMBx...",
  "resource": "message",
  "operation": "get",
  "message_id": "18abc123def456"
}
```

### Champs obligatoires

| Champ | Type | Description |
|-------|------|-------------|
| `access_token` | string | Token OAuth2 Gmail de l'utilisateur |
| `resource` | string | Type de ressource : `message`, `draft`, `label`, `thread` |
| `operation` | string | Opération à effectuer (voir liste ci-dessous) |

### Champs selon l'opération

Les champs supplémentaires dépendent de l'opération demandée.

## Opérations Disponibles

### Messages

#### `get` - Obtenir un message

```json
{
  "access_token": "...",
  "resource": "message",
  "operation": "get",
  "message_id": "18abc123def456"
}
```

#### `search` - Rechercher des messages

```json
{
  "access_token": "...",
  "resource": "message",
  "operation": "search",
  "query": "from:boss@company.com is:unread",
  "max_results": 10
}
```

#### `send` - Envoyer un email

```json
{
  "access_token": "...",
  "resource": "message",
  "operation": "send",
  "to": "recipient@example.com",
  "subject": "Sujet de l'email",
  "body": "Contenu de l'email",
  "cc": "cc@example.com",
  "bcc": "bcc@example.com"
}
```

#### `reply` - Répondre à un email

```json
{
  "access_token": "...",
  "resource": "message",
  "operation": "reply",
  "message_id": "18abc123def456",
  "to": "sender@example.com",
  "body": "Ma réponse..."
}
```

#### `delete` - Supprimer un message (corbeille)

```json
{
  "access_token": "...",
  "resource": "message",
  "operation": "delete",
  "message_id": "18abc123def456"
}
```

#### `markRead` / `markUnread` - Marquer lu/non lu

```json
{
  "access_token": "...",
  "resource": "message",
  "operation": "markRead",
  "message_id": "18abc123def456"
}
```

#### `addLabels` / `removeLabels` - Gérer les labels

```json
{
  "access_token": "...",
  "resource": "message",
  "operation": "addLabels",
  "message_id": "18abc123def456",
  "label_ids": "IMPORTANT,Label_123"
}
```

### Labels

#### `list` - Lister tous les labels

```json
{
  "access_token": "...",
  "resource": "label",
  "operation": "list"
}
```

#### `create` - Créer un label

```json
{
  "access_token": "...",
  "resource": "label",
  "operation": "create",
  "label_name": "Mon Nouveau Label"
}
```

#### `delete` - Supprimer un label

```json
{
  "access_token": "...",
  "resource": "label",
  "operation": "delete",
  "label_id": "Label_123"
}
```

### Drafts (Brouillons)

#### `create` - Créer un brouillon

```json
{
  "access_token": "...",
  "resource": "draft",
  "operation": "create",
  "to": "recipient@example.com",
  "subject": "Sujet",
  "body": "Contenu du brouillon"
}
```

#### `send` - Envoyer un brouillon

```json
{
  "access_token": "...",
  "resource": "draft",
  "operation": "send",
  "draft_id": "r123456789"
}
```

### Threads

#### `get` - Obtenir un thread complet

```json
{
  "access_token": "...",
  "resource": "thread",
  "operation": "get",
  "thread_id": "18abc123def456"
}
```

#### `getMany` - Lister les threads

```json
{
  "access_token": "...",
  "resource": "thread",
  "operation": "getMany",
  "max_results": 20
}
```

## Payload de Réponse

### Succès

```json
{
  "success": true,
  "operation": "get",
  "resource": "message",
  "data": {
    "id": "18abc123def456",
    "threadId": "18abc123def456",
    "labelIds": ["INBOX", "UNREAD"],
    "snippet": "Aperçu du contenu de l'email...",
    "payload": {
      "headers": [
        {"name": "From", "value": "sender@example.com"},
        {"name": "To", "value": "recipient@example.com"},
        {"name": "Subject", "value": "Sujet de l'email"},
        {"name": "Date", "value": "Wed, 4 Dec 2024 10:30:00 +0000"}
      ],
      "body": {
        "data": "base64_encoded_content..."
      }
    }
  },
  "error": null
}
```

### Erreur

```json
{
  "success": true,
  "operation": "get",
  "resource": "message",
  "data": {
    "error": "Request failed with status code 401",
    "errorDetails": {
      "code": 401,
      "message": "Invalid Credentials"
    }
  },
  "error": null
}
```

## Codes d'Erreur Gmail API

| Code | Signification | Action |
|------|---------------|--------|
| 401 | Token invalide ou expiré | Rafraîchir le token OAuth |
| 403 | Permissions insuffisantes | Vérifier les scopes OAuth |
| 404 | Ressource non trouvée | Vérifier l'ID (message, thread, etc.) |
| 429 | Rate limit atteint | Attendre et réessayer |
| 500 | Erreur serveur Gmail | Réessayer plus tard |

## Exemple d'Intégration (Node.js)

```javascript
const axios = require('axios');

async function getGmailMessage(accessToken, messageId) {
  const response = await axios.post('http://pi6.local:5678/webhook/mcp-gmail', {
    access_token: accessToken,
    resource: 'message',
    operation: 'get',
    message_id: messageId
  });

  if (response.data.success && !response.data.data.error) {
    return response.data.data;
  } else {
    throw new Error(response.data.data.error || 'Unknown error');
  }
}

async function searchEmails(accessToken, query, maxResults = 10) {
  const response = await axios.post('http://pi6.local:5678/webhook/mcp-gmail', {
    access_token: accessToken,
    resource: 'message',
    operation: 'search',
    query: query,
    max_results: maxResults
  });

  return response.data.data;
}

async function sendEmail(accessToken, to, subject, body) {
  const response = await axios.post('http://pi6.local:5678/webhook/mcp-gmail', {
    access_token: accessToken,
    resource: 'message',
    operation: 'send',
    to: to,
    subject: subject,
    body: body
  });

  return response.data.data;
}
```

## Exemple d'Intégration (Python)

```python
import requests

N8N_GMAIL_URL = "http://pi6.local:5678/webhook/mcp-gmail"

def get_gmail_message(access_token: str, message_id: str) -> dict:
    response = requests.post(N8N_GMAIL_URL, json={
        "access_token": access_token,
        "resource": "message",
        "operation": "get",
        "message_id": message_id
    })
    data = response.json()
    if data.get("success") and not data.get("data", {}).get("error"):
        return data["data"]
    raise Exception(data.get("data", {}).get("error", "Unknown error"))

def search_emails(access_token: str, query: str, max_results: int = 10) -> dict:
    response = requests.post(N8N_GMAIL_URL, json={
        "access_token": access_token,
        "resource": "message",
        "operation": "search",
        "query": query,
        "max_results": max_results
    })
    return response.json()["data"]

def send_email(access_token: str, to: str, subject: str, body: str) -> dict:
    response = requests.post(N8N_GMAIL_URL, json={
        "access_token": access_token,
        "resource": "message",
        "operation": "send",
        "to": to,
        "subject": subject,
        "body": body
    })
    return response.json()["data"]
```

## Notes Importantes

1. **Token OAuth** : Le token doit avoir les scopes Gmail appropriés (`https://mail.google.com/`)

2. **Expiration** : Les tokens expirent après ~1 heure. Prévoir un mécanisme de refresh.

3. **Rate Limiting** : Gmail API a des quotas. Prévoir des retries avec backoff.

4. **Format des IDs** : Les `message_id`, `thread_id`, `draft_id` sont des chaînes alphanumériques Gmail.

5. **Query Syntax** : Pour `search`, utiliser la [syntaxe de recherche Gmail](https://support.google.com/mail/answer/7190):
   - `from:user@example.com`
   - `to:user@example.com`
   - `subject:hello`
   - `is:unread`
   - `has:attachment`
   - `after:2024/01/01`
   - `before:2024/12/31`

## Contact

Pour tout problème avec l'API Gmail n8n, contacter l'équipe n8n-workflows.
