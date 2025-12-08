# Google Drive MCP Server

## Objectif

Créer un serveur MCP pour Google Drive permettant de gérer les fichiers et dossiers via n8n avec OAuth dynamique.

## Leçons Apprises (Issue #19 - Calendar)

| Erreur rencontrée | Solution |
|-------------------|----------|
| Type `CUSTOM.xxx` dans le workflow JSON | Utiliser `n8n-nodes-drive-dynamic.driveToolDynamic` |
| Node non chargé après copie | Ajouter dépendance dans `~/.n8n/nodes/package.json` + `npm install` |
| Commit direct sur develop | Rester sur la branche feature jusqu'au merge de la PR |
| Node visible mais workflow non activable | Vérifier le type exact en exportant un workflow créé manuellement |

## Architecture

### Pattern Multi-tenant

Le token OAuth est passé dynamiquement dans chaque requête :
```
Client → Webhook (avec access_token) → Custom Node → Google Drive API
```

**Aucune configuration backend n'est nécessaire côté n8n** - le token est fourni par l'appelant.

## Tâches

### 1. Custom Node `n8n-nodes-drive-dynamic`

**Structure :**
```
custom-nodes/n8n-nodes-drive-dynamic/
├── nodes/
│   └── DriveToolDynamic/
│       ├── DriveToolDynamic.node.ts
│       └── drive.svg
├── package.json
├── tsconfig.json
└── dist/                    # Généré par npm run build
```

**package.json - Section n8n :**
```json
{
  "name": "n8n-nodes-drive-dynamic",
  "n8n": {
    "n8nNodesApiVersion": 1,
    "nodes": [
      "dist/nodes/DriveToolDynamic/DriveToolDynamic.node.js"
    ]
  }
}
```

### 2. Opérations à implémenter

| Resource | Operation | Description | Paramètres |
|----------|-----------|-------------|------------|
| `file` | `list` | Lister les fichiers | `folder_id`, `query`, `max_results` |
| `file` | `get` | Obtenir métadonnées | `file_id` |
| `file` | `download` | Télécharger contenu | `file_id` |
| `file` | `upload` | Uploader un fichier | `name`, `parent_id`, `content`, `mime_type` |
| `file` | `update` | Mettre à jour | `file_id`, `name`, `content` |
| `file` | `delete` | Supprimer | `file_id` |
| `file` | `copy` | Copier | `file_id`, `name`, `parent_id` |
| `file` | `move` | Déplacer | `file_id`, `parent_id` |
| `file` | `share` | Partager | `file_id`, `email`, `role` |
| `folder` | `create` | Créer dossier | `name`, `parent_id` |
| `folder` | `list` | Lister dossiers | `parent_id` |

### 3. Workflow MCP

**Fichier :** `workflows/mcp/MCP_Drive_Server.json`

**Webhook :** `/mcp-drive`

**IMPORTANT - Type des nodes :**
```json
"type": "n8n-nodes-drive-dynamic.driveToolDynamic"
```
**PAS** `"type": "CUSTOM.driveToolDynamic"`

**Structure :**
```
Webhook MCP Drive
    ↓
Route by Operation (Switch)
    ↓
├── file/list → DriveToolDynamic
├── file/get → DriveToolDynamic
├── file/download → DriveToolDynamic
├── file/upload → DriveToolDynamic
├── file/update → DriveToolDynamic
├── file/delete → DriveToolDynamic
├── file/copy → DriveToolDynamic
├── file/move → DriveToolDynamic
├── file/share → DriveToolDynamic
├── folder/create → DriveToolDynamic
└── folder/list → DriveToolDynamic
    ↓
Respond to Webhook
```

## Paramètres des opérations

### file/list
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "list",
  "folder_id": "root (optional, default: root)",
  "query": "string (optional, Google Drive query syntax)",
  "max_results": 100
}
```

### file/get
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "get",
  "file_id": "string"
}
```

### file/download
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "download",
  "file_id": "string"
}
```

### file/upload
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "upload",
  "name": "string",
  "parent_id": "string (optional, default: root)",
  "content": "base64 encoded content",
  "mime_type": "string (e.g., text/plain, application/pdf)"
}
```

### file/delete
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "delete",
  "file_id": "string"
}
```

### file/copy
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "copy",
  "file_id": "string",
  "name": "string (optional, new name)",
  "parent_id": "string (optional, destination folder)"
}
```

### file/move
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "move",
  "file_id": "string",
  "parent_id": "string (destination folder)"
}
```

### file/share
```json
{
  "access_token": "string",
  "resource": "file",
  "operation": "share",
  "file_id": "string",
  "email": "string",
  "role": "reader | writer | commenter | owner"
}
```

### folder/create
```json
{
  "access_token": "string",
  "resource": "folder",
  "operation": "create",
  "name": "string",
  "parent_id": "string (optional, default: root)"
}
```

### folder/list
```json
{
  "access_token": "string",
  "resource": "folder",
  "operation": "list",
  "parent_id": "string (optional, default: root)"
}
```

## Déploiement - Checklist

### Build
```bash
cd custom-nodes/n8n-nodes-drive-dynamic
npm install
npm run build
```

### Installation dans n8n
```bash
# 1. Copier le node
cp -r custom-nodes/n8n-nodes-drive-dynamic ~/.n8n/nodes/

# 2. Ajouter la dépendance dans ~/.n8n/nodes/package.json
# "n8n-nodes-drive-dynamic": "file:./n8n-nodes-drive-dynamic"

# 3. Installer
cd ~/.n8n/nodes && npm install

# 4. Redémarrer n8n
./scripts/n8n_debug.sh
```

### Vérification
- [ ] Log affiche : `Loaded all credentials and nodes from n8n-nodes-drive-dynamic`
- [ ] Node "Google Drive Tool Dynamic" visible dans l'UI
- [ ] Workflow importé sans erreur
- [ ] Workflow activable

## Tests

```bash
# Lister les fichiers à la racine
curl -X POST http://pi6.local:5678/webhook/mcp-drive \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "TOKEN",
    "resource": "file",
    "operation": "list"
  }'

# Lister les fichiers d'un dossier spécifique
curl -X POST http://pi6.local:5678/webhook/mcp-drive \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "TOKEN",
    "resource": "file",
    "operation": "list",
    "folder_id": "FOLDER_ID",
    "max_results": 50
  }'

# Créer un dossier
curl -X POST http://pi6.local:5678/webhook/mcp-drive \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "TOKEN",
    "resource": "folder",
    "operation": "create",
    "name": "Mon Nouveau Dossier"
  }'

# Obtenir les métadonnées d'un fichier
curl -X POST http://pi6.local:5678/webhook/mcp-drive \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "TOKEN",
    "resource": "file",
    "operation": "get",
    "file_id": "FILE_ID"
  }'

# Supprimer un fichier
curl -X POST http://pi6.local:5678/webhook/mcp-drive \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "TOKEN",
    "resource": "file",
    "operation": "delete",
    "file_id": "FILE_ID"
  }'
```

## Références

- [Google Drive API v3](https://developers.google.com/drive/api/v3/reference)
- [n8n Google Drive Node](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googledrive/)
- [Guide Custom Node Development](../n8n/CUSTOM_NODE_DEVELOPMENT.md)

## Notes techniques

### API Endpoints Google Drive

| Opération | Méthode | Endpoint |
|-----------|---------|----------|
| List files | GET | `/drive/v3/files` |
| Get file | GET | `/drive/v3/files/{fileId}` |
| Download | GET | `/drive/v3/files/{fileId}?alt=media` |
| Upload | POST | `/upload/drive/v3/files` |
| Update | PATCH | `/drive/v3/files/{fileId}` |
| Delete | DELETE | `/drive/v3/files/{fileId}` |
| Copy | POST | `/drive/v3/files/{fileId}/copy` |
| Create permission | POST | `/drive/v3/files/{fileId}/permissions` |

### Query syntax pour list
```
# Fichiers dans un dossier spécifique
'FOLDER_ID' in parents

# Fichiers par nom
name = 'filename.txt'

# Fichiers par type MIME
mimeType = 'application/pdf'

# Combinaison
'FOLDER_ID' in parents and name contains 'report'
```
