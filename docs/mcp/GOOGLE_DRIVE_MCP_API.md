# Google Drive MCP Server - API Documentation

## Overview

The Google Drive MCP Server provides a webhook-based API to interact with Google Drive via the Drive API v3. It supports multi-tenant authentication via dynamic OAuth tokens.

**Endpoint:** `POST /webhook/mcp-drive`

## Authentication

All requests must include `access_token` in the request body.

```json
{
  "access_token": "ya29.xxx...",
  "resource": "file",
  "operation": "list"
}
```

**Required Scope:** `https://www.googleapis.com/auth/drive`

## Resources

### File Resource

Operations on files.

---

#### `list` - List Files

List files in a folder.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "file",
  "operation": "list",
  "folder_id": "root",
  "query": "name contains 'report'",
  "max_results": 100
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `folder_id` | string | No | Folder ID to list (default: root) |
| `query` | string | No | Google Drive query syntax |
| `max_results` | number | No | Maximum results (default: 100) |

**Response:**
```json
[
  {
    "id": "1abc123...",
    "name": "report.pdf",
    "mimeType": "application/pdf",
    "size": "1048576",
    "createdTime": "2025-01-15T10:30:00.000Z",
    "modifiedTime": "2025-01-15T14:20:00.000Z",
    "webViewLink": "https://drive.google.com/file/d/1abc123.../view"
  }
]
```

---

#### `get` - Get File Metadata

Get metadata for a specific file.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "file",
  "operation": "get",
  "file_id": "1abc123..."
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_id` | string | Yes | The file ID |

---

#### `download` - Download File

Download file content (returned as base64).

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "file",
  "operation": "download",
  "file_id": "1abc123..."
}
```

**Response:**
```json
{
  "fileId": "1abc123...",
  "content": "SGVsbG8gV29ybGQh..."
}
```

---

#### `upload` - Upload File

Upload a new file.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "file",
  "operation": "upload",
  "name": "document.txt",
  "content": "SGVsbG8gV29ybGQh",
  "mime_type": "text/plain",
  "parent_id": "folder123..."
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | File name |
| `content` | string | Yes | Base64 encoded content |
| `mime_type` | string | No | MIME type (default: application/octet-stream) |
| `parent_id` | string | No | Parent folder ID (default: root) |

---

#### `update` - Update File

Update file metadata.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "file",
  "operation": "update",
  "file_id": "1abc123...",
  "name": "new-name.txt"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_id` | string | Yes | The file ID |
| `name` | string | No | New file name |

---

#### `delete` - Delete File

Delete a file.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "file",
  "operation": "delete",
  "file_id": "1abc123..."
}
```

**Response:**
```json
{
  "success": true,
  "fileId": "1abc123..."
}
```

---

#### `copy` - Copy File

Copy a file.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "file",
  "operation": "copy",
  "file_id": "1abc123...",
  "name": "copy-of-document.txt",
  "parent_id": "folder456..."
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_id` | string | Yes | The file ID to copy |
| `name` | string | No | Name for the copy |
| `parent_id` | string | No | Destination folder ID |

---

#### `move` - Move File

Move a file to another folder.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "file",
  "operation": "move",
  "file_id": "1abc123...",
  "parent_id": "folder789..."
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_id` | string | Yes | The file ID to move |
| `parent_id` | string | Yes | Destination folder ID |

---

#### `share` - Share File

Share a file with a user.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "file",
  "operation": "share",
  "file_id": "1abc123...",
  "email": "user@example.com",
  "role": "writer"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `file_id` | string | Yes | The file ID to share |
| `email` | string | Yes | Email address to share with |
| `role` | string | No | reader, commenter, writer, owner (default: reader) |

---

### Folder Resource

Operations on folders.

---

#### `create` - Create Folder

Create a new folder.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "folder",
  "operation": "create",
  "name": "My New Folder",
  "parent_id": "root"
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Folder name |
| `parent_id` | string | No | Parent folder ID (default: root) |

---

#### `list` - List Folders

List folders in a parent folder.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "folder",
  "operation": "list",
  "folder_id": "root",
  "max_results": 100
}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `folder_id` | string | No | Parent folder ID (default: root) |
| `max_results` | number | No | Maximum results (default: 100) |

---

#### `delete` - Delete Folder

Delete a folder.

**Request:**
```json
{
  "access_token": "ya29.xxx...",
  "resource": "folder",
  "operation": "delete",
  "folder_id": "folder123..."
}
```

**Response:**
```json
{
  "success": true,
  "folderId": "folder123..."
}
```

---

## Query Syntax

Google Drive supports a powerful query syntax for filtering files:

| Query | Description |
|-------|-------------|
| `name = 'filename.txt'` | Exact name match |
| `name contains 'report'` | Name contains substring |
| `mimeType = 'application/pdf'` | Filter by MIME type |
| `'folderId' in parents` | Files in specific folder |
| `trashed = false` | Non-trashed files only |
| `modifiedTime > '2025-01-01'` | Modified after date |

**Combined queries:**
```
name contains 'report' and mimeType = 'application/pdf' and modifiedTime > '2025-01-01'
```

---

## Common MIME Types

| Type | MIME Type |
|------|-----------|
| Folder | `application/vnd.google-apps.folder` |
| Google Doc | `application/vnd.google-apps.document` |
| Google Sheet | `application/vnd.google-apps.spreadsheet` |
| Google Slides | `application/vnd.google-apps.presentation` |
| PDF | `application/pdf` |
| Plain Text | `text/plain` |
| JSON | `application/json` |
| Image (PNG) | `image/png` |
| Image (JPEG) | `image/jpeg` |

---

## Usage Examples

### List all PDF files

```json
{
  "access_token": "ya29.xxx...",
  "resource": "file",
  "operation": "list",
  "query": "mimeType = 'application/pdf'"
}
```

### Create a folder structure

```json
{
  "access_token": "ya29.xxx...",
  "resource": "folder",
  "operation": "create",
  "name": "Projects",
  "parent_id": "root"
}
```

### Upload a text file

```json
{
  "access_token": "ya29.xxx...",
  "resource": "file",
  "operation": "upload",
  "name": "notes.txt",
  "content": "SGVsbG8gV29ybGQhIFRoaXMgaXMgYSB0ZXN0IGZpbGUu",
  "mime_type": "text/plain"
}
```

### Share a file with write access

```json
{
  "access_token": "ya29.xxx...",
  "resource": "file",
  "operation": "share",
  "file_id": "1abc123...",
  "email": "collaborator@example.com",
  "role": "writer"
}
```

---

## Error Handling

All errors follow this structure:

```json
{
  "error": {
    "code": 404,
    "message": "File not found: 1abc123...",
    "status": "NOT_FOUND"
  }
}
```

Common error codes:
| Code | Description |
|------|-------------|
| 401 | Invalid or expired access token |
| 403 | Insufficient permissions |
| 404 | File or folder not found |
| 429 | Rate limit exceeded |
