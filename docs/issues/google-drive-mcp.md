# Google Drive MCP Server

## Objectif

Créer un serveur MCP pour Google Drive permettant de gérer les fichiers et dossiers via n8n avec OAuth dynamique.

## Prérequis

### Backend API (authent-service)

1. **Scopes à configurer** dans `google_services_routes.py` :

| Niveau | Scopes | Permissions |
|--------|--------|-------------|
| minimal | `drive.metadata.readonly` | Métadonnées lecture seule |
| standard | `drive.readonly` | Lecture fichiers |
| full | `drive` | Lecture + écriture complète |

2. **Endpoint d'authentification** :
```
/api/services/google/connect?services=drive&access_level=full
```

### Console Google Cloud

Ajouter le scope dans OAuth consent screen :
- `https://www.googleapis.com/auth/drive`

## Tâches n8n-workflows

### 1. Custom Node

Créer `n8n-nodes-drive-dynamic` basé sur `n8n-nodes-gmail-dynamic` :

```
custom-nodes/
└── n8n-nodes-drive-dynamic/
    ├── nodes/
    │   └── DriveToolDynamic/
    │       └── DriveToolDynamic.node.ts
    ├── package.json
    └── tsconfig.json
```

### 2. Workflow MCP

Créer `workflows/mcp/MCP_Drive_Server.json` avec :

**Opérations supportées :**

| Resource | Operations |
|----------|------------|
| file | copy, delete, download, get, list, move, share, update, upload |
| folder | create, delete, list, share |

**Structure du workflow :**
```
Webhook → Switch Router → [Operation Nodes] → Response
```

### 3. Paramètres des opérations

#### file/list
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "list",
  "folder_id": "root (optional)",
  "query": "string (optional)",
  "max_results": 100
}
```

#### file/get
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "get",
  "file_id": "string"
}
```

#### file/download
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "download",
  "file_id": "string"
}
```

#### file/upload
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "upload",
  "name": "string",
  "content": "base64 string",
  "mime_type": "string",
  "folder_id": "string (optional)"
}
```

#### file/delete
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "delete",
  "file_id": "string"
}
```

#### file/move
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "move",
  "file_id": "string",
  "folder_id": "string"
}
```

#### file/copy
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "copy",
  "file_id": "string",
  "name": "string (optional)"
}
```

#### file/share
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "share",
  "file_id": "string",
  "email": "string",
  "role": "reader|writer|commenter"
}
```

#### folder/create
```json
{
  "access_token": "string",
  "resource": "folder",
  "operation": "create",
  "name": "string",
  "parent_id": "string (optional)"
}
```

#### folder/list
```json
{
  "access_token": "string",
  "resource": "folder",
  "operation": "list",
  "folder_id": "root"
}
```

## Tests

```bash
# Lister les fichiers
curl -X POST http://pi6.local:5678/webhook/mcp-drive \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "TOKEN",
    "resource": "file",
    "operation": "list",
    "max_results": 10
  }'

# Créer un dossier
curl -X POST http://pi6.local:5678/webhook/mcp-drive \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "TOKEN",
    "resource": "folder",
    "operation": "create",
    "name": "Test Folder"
  }'
```

## Références

- [Google Drive API](https://developers.google.com/drive/api/v3/reference)
- [n8n Google Drive Node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/)
