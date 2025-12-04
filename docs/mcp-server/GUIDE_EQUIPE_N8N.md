# Guide pour l'Équipe n8n

> **Version**: 1.0
> **Date**: 2025-12-04
> **Destinataire**: Équipe n8n-workflows
> **Objectif**: Comprendre l'architecture et développer les workflows nécessaires

---

## Documents à Lire (par ordre de priorité)

| # | Document | Description | Priorité |
|---|----------|-------------|----------|
| 1 | `EXEMPLE_FLUX_COMPLET_GMAIL.md` | **Flux complet pas à pas** avec tous les services (Frontend, Backend, Celery, MCP, n8n, Gmail) | 🔴 Critique |
| 2 | `REPONSE_OAUTH_MULTITENANT.md` | **Architecture OAuth** - Comment passer les tokens dynamiquement | 🔴 Critique |
| 3 | `TOOLS_MIGRATION_LIST.md` | **Liste des 85 tools** à migrer avec équivalents n8n | 🟡 Important |
| 4 | `AUDIT_TOOLS_MCP_VS_N8N.md` | **Audit complet** - Quoi garder dans MCP vs migrer vers n8n | 🟡 Important |
| 5 | `MIGRATION_PLAN.md` | **Plan de migration** par phases avec code examples | 🟢 Référence |
| 6 | `ARCHITECTURE_OAUTH_CORRIGEE.md` | **Architecture détaillée** avec diagrammes | 🟢 Référence |

---

## Résumé de l'Architecture

```
┌─────────┐    ┌─────────┐    ┌────────┐    ┌───────┐    ┌─────────────┐    ┌─────┐
│FRONTEND │───▶│ BACKEND │───▶│ CELERY │───▶│  MCP  │───▶│     n8n     │───▶│GMAIL│
│ Vue.js  │    │ FastAPI │    │ Worker │    │Server │    │  Workflows  │    │ API │
└─────────┘    └────┬────┘    └────────┘    └───┬───┘    └─────────────┘    └─────┘
                    │                           │
                    │                           │ GET token
                    ▼                           ▼
               ┌─────────┐                 ┌─────────┐
               │  Redis  │◀────────────────│  Redis  │
               │ (Queue) │                 │(Tokens) │
               └─────────┘                 └─────────┘
```

### Points Clés pour n8n

1. **n8n reçoit le token OAuth dans le body du webhook**
   - Pas besoin de credentials n8n pour Google
   - Utiliser HTTP Request avec `Authorization: Bearer {{ $json.access_token }}`

2. **n8n retourne le résultat via Respond to Webhook**
   - Format JSON standardisé
   - Inclure `success: true/false`

3. **Un workflow = Un tool MCP migré**
   - Exemple: `gmail_email_reader` → workflow `gmail/read-email`

---

## Format des Webhooks

### Requête (ce que n8n reçoit)

```json
POST /webhook/gmail/read-emails

{
  "user_id": "user_123",
  "access_token": "ya29.a0AfH6SMBx7_Kx...",
  "date_filter": "today",
  "max_results": 50,
  "timezone": "Europe/Paris"
}
```

### Réponse (ce que n8n doit retourner)

```json
{
  "success": true,
  "data": {
    "emails": [...],
    "count": 15
  },
  "execution_time_ms": 2345
}
```

### En cas d'erreur

```json
{
  "success": false,
  "error": {
    "code": "GMAIL_API_ERROR",
    "message": "Invalid token or token expired"
  }
}
```

---

## Premier Workflow de Test

### Objectif
Valider la communication MCP Server ↔ n8n

### Webhook Path
`POST /webhook/test/echo`

### Workflow n8n

```
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│   Webhook    │───▶│  Code Node   │───▶│ Respond Webhook  │
│   Trigger    │    │  (Validate)  │    │                  │
└──────────────┘    └──────────────┘    └──────────────────┘
```

### Code Node

```javascript
// Valider que le token est présent
const hasToken = !!$json.access_token;
const hasUserId = !!$json.user_id;

return [{
  json: {
    success: true,
    echo: $json.message || "No message provided",
    has_token: hasToken,
    has_user_id: hasUserId,
    received_at: new Date().toISOString()
  }
}];
```

---

## Workflow Gmail "Analyze Daily"

### Objectif
Lire les emails du jour et faire un résumé

### Webhook Path
`POST /webhook/gmail/analyze-daily`

### Input

```json
{
  "user_id": "user_123",
  "access_token": "ya29.xxx",
  "date_filter": "today",
  "timezone": "Europe/Paris"
}
```

### Workflow Complet

```
┌──────────────┐
│   Webhook    │
│   Trigger    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Code Node   │ ← Construire la query Gmail (after:2025/12/04)
│ Build Query  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ HTTP Request │ ← GET gmail.googleapis.com/messages?q=...
│ List Emails  │   Headers: Authorization: Bearer {{ $json.access_token }}
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ SplitInBatch │ ← Pour chaque message_id
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ HTTP Request │ ← GET gmail.googleapis.com/messages/{id}
│ Get Message  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Code Node   │ ← Extraire From, Subject, Snippet, Date
│ Parse Email  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Aggregate   │ ← Regrouper tous les emails
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   OpenAI     │ ← "Résume ces emails par catégorie..."
│   Node       │
└──────┬───────┘
       │
       ▼
┌──────────────────┐
│ Respond Webhook  │ ← { success: true, summary: "...", count: 15 }
└──────────────────┘
```

### HTTP Request - List Emails

```
URL: https://gmail.googleapis.com/gmail/v1/users/me/messages
Method: GET
Query Parameters:
  - q: after:{{ $json.query_date }}
  - maxResults: 50

Headers:
  - Authorization: Bearer {{ $json.access_token }}
```

### HTTP Request - Get Message

```
URL: https://gmail.googleapis.com/gmail/v1/users/me/messages/{{ $json.id }}
Method: GET
Query Parameters:
  - format: full

Headers:
  - Authorization: Bearer {{ $json.access_token }}
```

---

## Conventions de Nommage

### Webhook Paths

```
/{service}/{action}

Exemples:
- gmail/read-email
- gmail/send-email
- gmail/search
- gmail/analyze-daily
- drive/list-files
- drive/upload-file
- calendar/create-event
```

### Workflow Names

```
MCP - {Service} - {Action}

Exemples:
- MCP - Gmail - Read Email
- MCP - Gmail - Analyze Daily
- MCP - Drive - List Files
- MCP - Calendar - Create Event
```

---

## Liste des Workflows Prioritaires

### Phase 1 - Test (1 workflow)

| Workflow | Webhook Path | Description |
|----------|--------------|-------------|
| Test Echo | `test/echo` | Validation communication |

### Phase 2 - Gmail (5 workflows)

| Workflow | Webhook Path | Équivalent MCP Tool |
|----------|--------------|---------------------|
| Analyze Daily | `gmail/analyze-daily` | Nouveau (combo) |
| Read Email | `gmail/read-email` | `gmail_email_reader` |
| Send Email | `gmail/send-email` | `gmail_sender_tool` |
| Search | `gmail/search` | `gmail_message_searcher_tool` |
| List Labels | `gmail/list-labels` | `gmail_label_lister` |

### Phase 3 - Drive (5 workflows)

| Workflow | Webhook Path | Équivalent MCP Tool |
|----------|--------------|---------------------|
| List Files | `drive/list-files` | `drive_list_files` |
| Search Files | `drive/search-files` | `drive_search_files` |
| Upload File | `drive/upload-file` | `drive_upload_file` |
| Download File | `drive/download-file` | `drive_download_file` |
| Create Folder | `drive/create-folder` | `drive_create_folder` |

---

## Checklist de Développement

Pour chaque workflow :

- [ ] Créer le workflow dans n8n
- [ ] Configurer le webhook path selon la convention
- [ ] Ajouter le node HTTP Request avec token injection
- [ ] Ajouter le node Respond to Webhook
- [ ] Tester manuellement avec Postman/curl
- [ ] Documenter les inputs/outputs
- [ ] Notifier l'équipe MCP Server

---

## Contact & Questions

Pour toute question sur :
- **Architecture générale** : Voir `EXEMPLE_FLUX_COMPLET_GMAIL.md`
- **Format des tokens** : Voir `REPONSE_OAUTH_MULTITENANT.md`
- **Liste des tools** : Voir `TOOLS_MIGRATION_LIST.md`

---

## Annexe : Tester avec curl

```bash
# Test du workflow echo
curl -X POST http://pi6.local:5678/webhook/test/echo \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello from test",
    "access_token": "fake_token_for_test",
    "user_id": "user_123"
  }'

# Réponse attendue:
# {
#   "success": true,
#   "echo": "Hello from test",
#   "has_token": true,
#   "has_user_id": true,
#   "received_at": "2025-12-04T12:00:00.000Z"
# }
```
