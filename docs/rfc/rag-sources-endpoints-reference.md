# RAG Sources — Référence complète des 10 endpoints

> **Date** : 2026-03-31
> **Version** : 1.0
> **Base URL** : `https://apidev.azy.solutions`

---

## Auth

| Endpoints | Auth | Headers |
|-----------|------|---------|
| #1 à #8 (publics) | Firebase | `Authorization: Bearer {firebase_token}` |
| #9 et #10 (callbacks n8n) | Service Token | `X-Service-Token: {token}` + `X-Tenant-ID: {tid}` |

---

## 1. GET /api/discord/servers/{guild_id}/bots

Liste les bots Azy installés sur un serveur Discord.

**Request :**
```
GET /api/discord/servers/1286607696153546774/bots
Authorization: Bearer {firebase_token}
```

**Response 200 :**
```json
{
  "success": true,
  "bots": [
    {
      "bot_id": "987654321",
      "name": "987654321",
      "application_id": "987654321",
      "status": "active"
    }
  ]
}
```

> Note : `status` est `"active"` ou `"inactive"` (basé sur la DB),
> pas `"online"/"offline"` (non disponible en temps réel).

---

## 2. GET /api/discord/sources/{guild_id}/{bot_id}

Liste paginée des sources RAG.

**Request :**
```
GET /api/discord/sources/1286607696153546774/987654321?page=1&limit=20&type=pdf&status=indexed&search=menu
Authorization: Bearer {firebase_token}
```

| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `page` | int | 1 | Page (1-indexed) |
| `limit` | int | 20 | Max 100 |
| `type` | string | — | `pdf`, `txt`, `md`, `docx`, `xlsx`, `pptx`, `mp4`, `mp3`, `yt` |
| `status` | string | — | `indexed`, `pending`, `transcription`, `error` |
| `search` | string | — | Recherche sur filename et url |
| `all_bots` | bool | false | Voir les sources de tous les bots |

**Response 200 :**
```json
{
  "success": true,
  "sources": [
    {
      "id": "src_a1b2c3d4e5f6g7h8",
      "filename": "menu-printemps-2026.pdf",
      "url": null,
      "file_type": "pdf",
      "extraction_method": "pdfplumber",
      "chunk_count": 42,
      "status": "indexed",
      "progress_percent": 100,
      "file_size_bytes": 2048576,
      "duration_seconds": null,
      "created_at": "2026-03-28T14:32:00Z",
      "created_by": "firebase_uid_123",
      "error_message": null
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total_items": 87,
    "total_pages": 5
  }
}
```

---

## 3. GET /api/discord/sources/{guild_id}/{bot_id}/stats

Stats pour les 4 cartes du dashboard.

**Request :**
```
GET /api/discord/sources/1286607696153546774/987654321/stats
Authorization: Bearer {firebase_token}
```

**Response 200 :**
```json
{
  "success": true,
  "stats": {
    "indexed_count": 42,
    "chunk_count": 1837,
    "total_audio_duration_seconds": 14520,
    "pending_count": 3
  }
}
```

---

## 4. GET /api/discord/sources/{guild_id}/{bot_id}/status

Polling des sources actives. Doit être < 100ms.

**Request :**
```
GET /api/discord/sources/1286607696153546774/987654321/status
Authorization: Bearer {firebase_token}
```

**Response 200 :**
```json
{
  "success": true,
  "sources": [
    {
      "id": "src_e5f6g7h8i9j0k1l2",
      "status": "transcription",
      "progress_percent": 78,
      "chunk_count": 0,
      "error_message": null
    }
  ]
}
```

Retourne un array vide quand toutes les sources sont en état terminal.

---

## 5. POST /api/discord/sources/{guild_id}/{bot_id}/upload

Upload d'un fichier pour indexation RAG. Stocke dans B2 puis crée le record.

**Request :**
```
POST /api/discord/sources/1286607696153546774/987654321/upload
Authorization: Bearer {firebase_token}
Content-Type: multipart/form-data
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `file` | binary | oui | Fichier (max 500 MB) |
| `filename` | string | oui | Nom original avec extension |
| `file_type` | string | oui | `pdf`, `txt`, `md`, `docx`, `xlsx`, `pptx`, `mp4`, `mp3` |

**Response 201 :**
```json
{
  "success": true,
  "source_id": "src_q7r8s9t0u1v2w3x4",
  "status": "pending"
}
```

**Erreurs :**

| Code | Body | Condition |
|------|------|-----------|
| 400 | `{"error": {"code": "INVALID_FILE_TYPE", ...}}` | Type non supporté |
| 413 | `{"error": {"code": "FILE_TOO_LARGE", ...}}` | > 500 MB |

**Path B2 :** `{tenant_id}/rag/{guild_id}/{bot_id}/{source_id}/{filename}`

---

## 6. POST /api/discord/sources/{guild_id}/{bot_id}/link

Soumettre un lien vidéo pour indexation RAG.

**Request :**
```json
POST /api/discord/sources/1286607696153546774/987654321/link
Authorization: Bearer {firebase_token}
Content-Type: application/json

{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "extraction_mode": "subtitles"
}
```

| Champ | Type | Requis | Valeurs |
|-------|------|--------|---------|
| `url` | string | oui | URL YouTube, Vimeo, Loom, Dailymotion, .mp4/.mp3 |
| `extraction_mode` | string | oui | `"subtitles"`, `"whisper"`, `"metadata"` |

**Response 201 :**
```json
{
  "success": true,
  "source_id": "src_u1v2w3x4y5z6a7b8",
  "status": "pending",
  "video_title": null,
  "duration_seconds": null
}
```

> `video_title` et `duration_seconds` seront remplis quand `yt-dlp`
> sera intégré. Pour l'instant ils sont `null`.

---

## 7. POST /api/discord/sources/{guild_id}/{bot_id}/{source_id}/retry

Relance une source en erreur.

**Request :**
```json
POST /api/discord/sources/.../src_i9j0k1l2m3n4o5p6/retry
Authorization: Bearer {firebase_token}
Content-Type: application/json

{
  "extraction_mode": "whisper"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `extraction_mode` | string | non | Override du mode (ex: `"subtitles"` → `"whisper"`) |

Body optionnel — si vide, retry avec la méthode originale.

**Response 200 :**
```json
{
  "success": true,
  "source_id": "src_i9j0k1l2m3n4o5p6",
  "status": "pending"
}
```

**Erreurs :**

| Code | Condition |
|------|-----------|
| 404 | Source introuvable ou pas en état `error` |

---

## 8. DELETE /api/discord/sources/{guild_id}/{bot_id}/{source_id}

Supprime une source (record DB + fichier B2).

**Request :**
```
DELETE /api/discord/sources/.../src_i9j0k1l2m3n4o5p6
Authorization: Bearer {firebase_token}
```

**Response 200 :**
```json
{
  "success": true,
  "deleted": {
    "source_id": "src_i9j0k1l2m3n4o5p6",
    "b2_file_key": "rag/1286.../987.../src_.../menu.pdf"
  }
}
```

**Erreurs :**

| Code | Condition |
|------|-----------|
| 404 | Source introuvable |
| 409 | Source en cours de traitement (`pending` ou `transcription`) |

---

## 9. POST /api/discord/n8n/sources/{source_id}/progress

**Appelé par n8n uniquement.** Met à jour la progression.

**Request :**
```json
POST /api/discord/n8n/sources/src_e5f6g7h8/progress
X-Service-Token: {service_token}
X-Tenant-ID: Z6F3GSWB
Content-Type: application/json

{
  "status": "transcription",
  "progress_percent": 45,
  "chunk_count": 0
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `status` | string | oui | `"pending"` ou `"transcription"` |
| `progress_percent` | int | non | 0-100 (défaut: 0) |
| `chunk_count` | int | non | Chunks indexés jusqu'ici (défaut: 0) |

**Response 200 :**
```json
{
  "success": true
}
```

---

## 10. POST /api/discord/n8n/sources/{source_id}/complete

**Appelé par n8n uniquement.** Marque la source comme terminée ou en erreur.

**Request (succès) :**
```json
POST /api/discord/n8n/sources/src_e5f6g7h8/complete
X-Service-Token: {service_token}
X-Tenant-ID: Z6F3GSWB
Content-Type: application/json

{
  "success": true,
  "chunk_count": 42
}
```

**Request (erreur) :**
```json
{
  "success": false,
  "error_message": "Whisper transcription failed: audio codec not supported"
}
```

| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `success` | bool | oui | `true` → indexed, `false` → error |
| `chunk_count` | int | non | Nombre total de chunks (si succès) |
| `error_message` | string | non | Message d'erreur (si échec) |

**Response 200 :**
```json
{
  "success": true
}
```

---

## Lifecycle des statuts

```
pending → transcription → indexed
pending → error
transcription → error
error → pending (via retry)
```

Terminal : `indexed`, `error`
Non-terminal : `pending`, `transcription`

---

## n8n webhook payloads (envoyés par l'API)

L'API déclenche les webhooks n8n après les endpoints 5-8.
**Actuellement logués seulement (TODO).**

| Événement | Payload n8n |
|-----------|-------------|
| Upload (#5) | `{ action: "process", source_id, guild_id, bot_id, b2_file_key, file_type }` |
| Link (#6) | `{ action: "process", source_id, guild_id, bot_id, url, extraction_mode, file_type: "yt" }` |
| Retry (#7) | `{ action: "retry", source_id, guild_id, bot_id, extraction_method }` |
| Delete (#8) | `{ action: "delete", source_id, guild_id, bot_id, b2_file_key }` |

---

## File type mapping

| Extension | `file_type` | `extraction_method` |
|-----------|-------------|---------------------|
| `.pdf` | `pdf` | `pdfplumber` |
| `.txt` | `txt` | `raw_text` |
| `.md` | `md` | `raw_text` |
| `.docx` | `docx` | `docx_text` |
| `.xlsx` | `xlsx` | `xlsx_tabular` |
| `.pptx` | `pptx` | `pptx_slides` |
| `.mp4`, `.mkv`, `.mov` | `mp4` | `whisper` |
| `.mp3`, `.wav`, `.m4a` | `mp3` | `whisper` |
| YouTube/Vimeo/Loom URL | `yt` | `subtitles` / `whisper` / `metadata` |
