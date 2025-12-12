# Video Transcription MCP Server API

Documentation pour le serveur MCP Video Transcription accessible via webhook n8n.

## Endpoint

```
POST /webhook/video-transcription
```

## Vue d'ensemble

Ce workflow transcrit et analyse des vidéos (YouTube, URL directes) en utilisant Google Gemini multimodal. Il supporte la diarisation des locuteurs, l'extraction OCR et l'analyse complète de scènes.

## Paramètres de la requête

### Source vidéo (obligatoire)

| Paramètre | Type | Description |
|-----------|------|-------------|
| `videoUrl` | string | URL de la vidéo (YouTube ou lien direct) |

### Configuration de l'opération

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `operation` | string | `"transcribe"` | Opération à effectuer: `transcribe`, `identifySpeakers`, `extractOcr`, `analyzeScene`, `extractSlides`, `createCache`, `queryCache`, `deleteCache`, `listCaches` |
| `language` | string | `"auto"` | Langue de sortie: `"auto"`, `"en"`, `"fr"`, `"es"`, `"de"`, `"it"`, `"pt"` |

### Options de chunking (pour vidéos longues)

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `enableChunking` | boolean | `false` | Activer le découpage pour vidéos longues |
| `chunkDuration` | number | `10` | Durée de chaque segment en minutes |
| `videoDuration` | number | `0` | Durée totale de la vidéo en minutes (requis si chunking activé) |

### Plage temporelle (optionnel)

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `startTime` | string | `""` | Temps de début (format `MM:SS` ou `HH:MM:SS`, ex: `"1:30"` ou `"0:01:30"`) |
| `endTime` | string | `""` | Temps de fin (format `MM:SS` ou `HH:MM:SS`, ex: `"5:00"` ou `"0:05:00"`) |

### Options de cache (pour requêtes multiples)

Le caching permet de réduire les coûts de ~70% pour plusieurs requêtes sur la même vidéo.

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `cacheId` | string | `""` | ID du cache (retourné par `createCache`, requis pour `queryCache`/`deleteCache`) |
| `cacheName` | string | `""` | Nom convivial pour le cache (pour `createCache`) |
| `cacheTtl` | number | `60` | Durée de vie du cache en minutes (pour `createCache`) |
| `cachePrompt` | string | `""` | Prompt pour interroger le cache (pour `queryCache`) |

### Options avancées

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `model` | string | `"gemini-2.5-flash"` | Modèle Gemini à utiliser |
| `customInstructions` | string | `""` | Instructions personnalisées à ajouter au prompt |

## Opérations disponibles

### `transcribe`
Transcription basique avec timestamps.

**Sortie:**
```json
{
  "transcripts": [
    {"start": "00:00", "text": "Hello everyone..."},
    {"start": "00:15", "text": "Today we're going to..."}
  ],
  "language": "en",
  "duration": "05:30"
}
```

### `identifySpeakers`
Transcription avec diarisation des locuteurs.

**Sortie:**
```json
{
  "task1_transcripts": [
    {"start": "00:00", "text": "Welcome to our show", "voice": 1},
    {"start": "00:05", "text": "Thank you for having me", "voice": 2}
  ],
  "task2_speakers": [
    {
      "voice": 1,
      "name": "John Smith",
      "company": "ABC News",
      "position": "Anchor",
      "role_in_video": "host"
    },
    {
      "voice": 2,
      "name": "Jane Doe",
      "company": "Tech Corp",
      "position": "CEO",
      "role_in_video": "guest"
    }
  ],
  "language": "en",
  "duration": "15:00"
}
```

### `extractOcr`
Extraction du texte visible dans la vidéo.

**Sortie:**
```json
{
  "text_occurrences": [
    {
      "start": "00:00",
      "end": "00:30",
      "type": "title",
      "text": "Welcome to the Presentation",
      "position": "center"
    },
    {
      "start": "00:30",
      "end": "02:00",
      "type": "slide",
      "text": "Agenda:\n1. Introduction\n2. Main Topic\n3. Conclusion",
      "position": "full-screen"
    }
  ],
  "summary": {
    "total_text_elements": 15,
    "types_found": ["title", "slide", "caption"]
  }
}
```

### `analyzeScene`
Analyse complète : transcription, locuteurs, OCR et description des scènes.

**Sortie:**
```json
{
  "transcription": {
    "segments": [
      {"start": "00:00", "text": "transcribed text", "voice": 1}
    ],
    "speakers": [
      {
        "voice": 1,
        "name": "Speaker Name",
        "company": "Company",
        "position": "Title",
        "role_in_video": "presenter"
      }
    ]
  },
  "visual_text": [
    {
      "start": "00:00",
      "end": "00:30",
      "type": "slide",
      "text": "visible text",
      "position": "center"
    }
  ],
  "scenes": [
    {
      "start": "00:00",
      "end": "02:30",
      "description": "Introduction segment in studio",
      "setting": "studio",
      "key_elements": ["desk", "screens", "logo"]
    }
  ],
  "summary": {
    "overview": "A presentation about...",
    "topics": ["topic1", "topic2"],
    "key_takeaways": ["takeaway1", "takeaway2"],
    "duration": "15:00",
    "language": "en"
  }
}
```

### `extractSlides`
Détecte et extrait les métadonnées des slides/présentations avec timestamps précis.

**Sortie:**
```json
{
  "slides": [
    {
      "id": 1,
      "timestamp_ms": 15000,
      "timestamp": "00:00:15",
      "title": "Introduction",
      "key_points": ["Point 1", "Point 2"],
      "type": "slide",
      "description": "Title slide with company logo",
      "bounding_box": null
    },
    {
      "id": 2,
      "timestamp_ms": 145000,
      "timestamp": "00:02:25",
      "title": "Résultats Q4",
      "key_points": ["CA +15%", "Marge 12%"],
      "type": "chart",
      "description": "Bar chart showing quarterly results",
      "bounding_box": [100, 50, 900, 700]
    }
  ],
  "metadata": {
    "total_slides": 10,
    "video_duration": "45:00",
    "slide_types_found": ["slide", "chart", "diagram"],
    "presentation_title": "Rapport Annuel 2025",
    "presenter": "Jean Dupont"
  }
}
```

**Types de slides détectés:**
- `slide` - Slide de présentation classique
- `title_slide` - Slide de titre
- `chart` - Graphique
- `diagram` - Diagramme
- `table` - Tableau
- `demo` - Démonstration
- `code` - Code source
- `image` - Image plein écran
- `video` - Vidéo intégrée

**Note:** Les timestamps en millisecondes (`timestamp_ms`) peuvent être utilisés avec la Cloud Function `extract-slides` pour extraire les images des slides.

## Opérations de cache

Les opérations de cache permettent de stocker une vidéo côté serveur et de l'interroger plusieurs fois sans la renvoyer. Cela réduit les coûts de ~70%.

### `createCache`
Crée un cache pour une vidéo. La vidéo est uploadée et stockée pour des requêtes ultérieures.

**Paramètres requis:** `videoUrl` ou `videoBase64`
**Paramètres optionnels:** `cacheName`, `cacheTtl`, `model`

**Sortie:**
```json
{
  "cacheId": "projects/xxx/locations/us-central1/cachedContents/xxx",
  "displayName": "my-video-cache",
  "expireTime": "2025-12-12T10:00:00Z",
  "model": "projects/xxx/locations/us-central1/publishers/google/models/gemini-2.5-flash",
  "tokenCount": 150000,
  "metadata": {
    "operation": "createCache",
    "source": "url",
    "title": "Video Title",
    "model": "gemini-2.5-flash",
    "processedAt": "2025-12-12T09:00:00Z"
  }
}
```

### `queryCache`
Interroge une vidéo en cache avec un prompt personnalisé.

**Paramètres requis:** `cacheId`, `cachePrompt`
**Paramètres optionnels:** `model`, `maxOutputTokens`

**Sortie:** Dépend du prompt. Exemple avec prompt de résumé:
```json
{
  "summary": "This video discusses...",
  "key_points": ["point 1", "point 2"],
  "metadata": {
    "operation": "queryCache",
    "cacheId": "projects/xxx/locations/us-central1/cachedContents/xxx",
    "prompt": "Summarize this video in 3 bullet points",
    "model": "gemini-2.5-flash",
    "processedAt": "2025-12-12T09:05:00Z"
  }
}
```

### `deleteCache`
Supprime un cache pour arrêter la facturation.

**Paramètres requis:** `cacheId`

**Sortie:**
```json
{
  "success": true,
  "message": "Cache deleted successfully",
  "cacheId": "projects/xxx/locations/us-central1/cachedContents/xxx",
  "metadata": {
    "operation": "deleteCache",
    "processedAt": "2025-12-12T10:00:00Z"
  }
}
```

### `listCaches`
Liste tous les caches actifs.

**Paramètres:** Aucun requis

**Sortie:**
```json
{
  "caches": [
    {
      "name": "projects/xxx/locations/us-central1/cachedContents/xxx",
      "displayName": "my-video-cache",
      "model": "projects/xxx/locations/us-central1/publishers/google/models/gemini-2.5-flash",
      "createTime": "2025-12-12T09:00:00Z",
      "updateTime": "2025-12-12T09:00:00Z",
      "expireTime": "2025-12-12T10:00:00Z",
      "usageMetadata": {
        "totalTokenCount": 150000
      }
    }
  ],
  "count": 1,
  "metadata": {
    "operation": "listCaches",
    "processedAt": "2025-12-12T09:10:00Z"
  }
}
```

## Exemples de requêtes

### Transcription basique YouTube

```bash
curl -X POST http://localhost:5678/webhook/video-transcription \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "operation": "transcribe"
  }'
```

### Identification des locuteurs

```bash
curl -X POST http://localhost:5678/webhook/video-transcription \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/interview.mp4",
    "operation": "identifySpeakers",
    "language": "fr"
  }'
```

### Extraction OCR

```bash
curl -X POST http://localhost:5678/webhook/video-transcription \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/presentation.mp4",
    "operation": "extractOcr"
  }'
```

### Analyse complète avec chunking

```bash
curl -X POST http://localhost:5678/webhook/video-transcription \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/long-video.mp4",
    "operation": "analyzeScene",
    "enableChunking": true,
    "chunkDuration": 10,
    "videoDuration": 45,
    "language": "en"
  }'
```

### Avec instructions personnalisées

```bash
curl -X POST http://localhost:5678/webhook/video-transcription \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/technical-demo.mp4",
    "operation": "analyzeScene",
    "customInstructions": "Focus on technical terminology and code snippets shown on screen. Identify all programming languages mentioned.",
    "model": "gemini-2.5-pro"
  }'
```

### Transcrire une plage temporelle spécifique

```bash
curl -X POST http://localhost:5678/webhook/video-transcription \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
    "operation": "transcribe",
    "startTime": "1:30",
    "endTime": "5:00"
  }'
```

### Transcrire à partir d'un temps donné

```bash
curl -X POST http://localhost:5678/webhook/video-transcription \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://youtu.be/VIDEO_ID",
    "operation": "identifySpeakers",
    "startTime": "10:00",
    "language": "fr"
  }'
```

### Transcrire jusqu'à un temps donné

```bash
curl -X POST http://localhost:5678/webhook/video-transcription \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://youtu.be/VIDEO_ID",
    "operation": "transcribe",
    "endTime": "3:00"
  }'
```

### Extraire les slides d'une présentation

```bash
curl -X POST http://localhost:5678/webhook/video-transcription \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/presentation.mp4",
    "operation": "extractSlides"
  }'
```

### Extraire les slides puis les images (avec Cloud Function)

```bash
# Étape 1: Extraire les métadonnées des slides
SLIDES=$(curl -s -X POST http://localhost:5678/webhook/video-transcription \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/presentation.mp4",
    "operation": "extractSlides"
  }')

# Étape 2: Extraire les images via Cloud Function
curl -X POST https://REGION-PROJECT_ID.cloudfunctions.net/extract-slides \
  -H "Content-Type: application/json" \
  -d "{
    \"video_url\": \"https://example.com/presentation.mp4\",
    \"slides\": $(echo $SLIDES | jq '.slides'),
    \"output\": {\"type\": \"base64\"}
  }"
```

### Créer un cache pour une vidéo

```bash
curl -X POST http://localhost:5678/webhook/video-cache \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "createCache",
    "videoUrl": "https://example.com/long-video.mp4",
    "cacheName": "presentation-cache",
    "cacheTtl": 120
  }'
```

### Interroger un cache

```bash
curl -X POST http://localhost:5678/webhook/video-cache \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "queryCache",
    "cacheId": "projects/xxx/locations/us-central1/cachedContents/xxx",
    "prompt": "What are the 3 main topics discussed in this video?"
  }'
```

### Lister les caches actifs

```bash
curl -X POST http://localhost:5678/webhook/video-cache \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "listCaches"
  }'
```

### Supprimer un cache

```bash
curl -X POST http://localhost:5678/webhook/video-cache \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "deleteCache",
    "cacheId": "projects/xxx/locations/us-central1/cachedContents/xxx"
  }'
```

## Sources vidéo supportées

### YouTube
- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID`

### URL directes
- Formats supportés : MP4, WebM, AVI, MOV, MKV, FLV, WMV, M4V, 3GP
- La vidéo est téléchargée et encodée en base64 pour l'API Gemini
- Limite de taille : 2GB

## Modèles disponibles

| Modèle | Description | Recommandé pour |
|--------|-------------|-----------------|
| `gemini-2.5-flash` | Rapide et efficace | Usage général (défaut) |
| `gemini-2.5-pro` | Plus précis | Analyse détaillée |
| `gemini-2.0-flash` | Dernière génération rapide | Vidéos courtes |
| `gemini-1.5-pro` | Contexte long (jusqu'à 1M tokens) | Vidéos très longues |
| `gemini-1.5-flash` | Rapide, bon contexte | Équilibre performance/coût |

## Context Caching (économie de coûts)

Le Context Caching permet de stocker une vidéo sur les serveurs Gemini et de l'interroger plusieurs fois sans la renvoyer. Cela offre des économies significatives :

**Avantages:**
- **~70% d'économie** sur les coûts par requête après la première
- **Latence réduite** : pas besoin de re-transférer la vidéo
- **Requêtes multiples** : poser plusieurs questions sur la même vidéo

**Quand utiliser:**
- Analyse détaillée nécessitant plusieurs passes
- Questions interactives sur une vidéo
- Extraction de différentes informations (transcription + OCR + résumé)
- Vidéos longues avec plusieurs requêtes prévues

**Workflow recommandé:**
1. `createCache` : upload de la vidéo (coût initial)
2. `queryCache` : requêtes multiples (coût réduit de ~70%)
3. `deleteCache` : suppression pour arrêter la facturation

**Important:**
- Le cache est facturé tant qu'il existe (TTL)
- Minimum TTL : 1 minute
- Les caches expirent automatiquement après le TTL
- Toujours supprimer les caches inutilisés

## Chunking pour vidéos longues

Le chunking divise les vidéos longues en segments pour un traitement plus fiable.

**Quand utiliser:**
- Vidéos > 30 minutes
- Erreurs de timeout sur longues vidéos
- Analyse détaillée requise

**Fonctionnement:**
1. La vidéo est conceptuellement divisée en segments
2. Chaque segment est analysé avec le contexte temporel
3. Les résultats sont fusionnés automatiquement
4. Les timestamps sont ajustés pour refléter la position réelle

**Recommandations:**
- `chunkDuration: 10` pour la plupart des cas
- `chunkDuration: 5` pour analyse très détaillée
- `chunkDuration: 15` pour économiser les appels API

## Codes d'erreur

| Code | Description |
|------|-------------|
| 400 | URL vidéo non fournie |
| 400 | URL YouTube invalide |
| 400 | Durée vidéo requise pour chunking |
| 500 | Erreur de téléchargement vidéo |
| 500 | Erreur de l'API Gemini |
| 500 | Timeout du traitement |

## Notes d'implémentation

- Le workflow utilise Google Gemini 2.5 Flash par défaut
- Les vidéos YouTube nécessitent un téléchargement préalable via ytdl-core
- `maxOutputTokens` est configuré à 16384 par défaut
- Le timeout est de 10 minutes pour le traitement vidéo
- La valeur `NOT_FOUND` est utilisée quand une information ne peut être extraite

## Plage temporelle

Les paramètres `startTime` et `endTime` permettent de limiter la transcription à une portion spécifique de la vidéo.

**Formats acceptés:**
- `MM:SS` : ex. `"1:30"` pour 1 minute 30 secondes
- `HH:MM:SS` : ex. `"1:30:00"` pour 1 heure 30 minutes

**Comportement:**
- `startTime` seul : transcrit depuis ce temps jusqu'à la fin
- `endTime` seul : transcrit depuis le début jusqu'à ce temps
- Les deux : transcrit uniquement la plage spécifiée
- Les timestamps dans la sortie restent relatifs au début de la vidéo originale

**Cas d'usage:**
- Extraire un segment spécifique d'une longue vidéo
- Ignorer les introductions/conclusions
- Transcrire uniquement une intervention particulière

## Intégration avec MCP Server

### Outil de transcription vidéo

```typescript
{
  name: "transcribe_video",
  description: "Transcribe and analyze videos using Gemini multimodal AI",
  inputSchema: {
    type: "object",
    properties: {
      videoUrl: { type: "string", description: "YouTube URL or direct video URL" },
      operation: {
        type: "string",
        enum: ["transcribe", "identifySpeakers", "extractOcr", "analyzeScene"],
        default: "transcribe"
      },
      language: {
        type: "string",
        enum: ["auto", "en", "fr", "es", "de", "it", "pt"],
        default: "auto"
      },
      startTime: {
        type: "string",
        description: "Start time (MM:SS or HH:MM:SS format)"
      },
      endTime: {
        type: "string",
        description: "End time (MM:SS or HH:MM:SS format)"
      },
      enableChunking: { type: "boolean", default: false },
      chunkDuration: { type: "number", default: 10 },
      videoDuration: { type: "number", description: "Required if chunking enabled" },
      model: { type: "string", default: "gemini-2.5-flash" },
      customInstructions: { type: "string" }
    },
    required: ["videoUrl"]
  }
}
```

### Outil de gestion du cache vidéo

```typescript
{
  name: "manage_video_cache",
  description: "Create, query, list, and delete video caches for cost-effective repeated queries",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["createCache", "queryCache", "listCaches", "deleteCache"],
        description: "Cache operation to perform"
      },
      videoUrl: {
        type: "string",
        description: "Video URL (required for createCache)"
      },
      cacheId: {
        type: "string",
        description: "Cache ID (required for queryCache and deleteCache)"
      },
      cacheName: {
        type: "string",
        description: "Friendly name for the cache (optional for createCache)"
      },
      cacheTtl: {
        type: "number",
        default: 60,
        description: "Cache TTL in minutes (for createCache)"
      },
      prompt: {
        type: "string",
        description: "Prompt to query the cached video (required for queryCache)"
      },
      model: {
        type: "string",
        default: "gemini-2.5-flash"
      }
    },
    required: ["operation"]
  }
}
```

## Cloud Function: extract-slides

Une Cloud Function GCP est disponible pour extraire les images des slides à partir des timestamps retournés par `extractSlides`.

### Architecture

```
┌─────────────────┐      JSON        ┌─────────────────────┐      Images
│  n8n + Gemini   │  ─────────────►  │  GCP Cloud Function │  ─────────►  Base64 / GCS
│  (extractSlides)│   timestamps     │  (ffmpeg/OpenCV)    │
└─────────────────┘                  └─────────────────────┘
```

### Endpoint

```
POST https://REGION-PROJECT_ID.cloudfunctions.net/extract-slides
```

### Input

```json
{
  "video_url": "https://example.com/video.mp4",
  "slides": [
    {"id": 1, "timestamp_ms": 15000, "title": "Introduction"},
    {"id": 2, "timestamp_ms": 145000, "title": "Résultats"}
  ],
  "output": {
    "type": "base64",
    "bucket": "my-bucket",
    "prefix": "slides/"
  }
}
```

### Output

```json
{
  "success": true,
  "total_slides": 2,
  "extracted": 2,
  "failed": 0,
  "images": [
    {
      "slide_id": 1,
      "title": "Introduction",
      "timestamp_ms": 15000,
      "image_base64": "...",
      "status": "success"
    }
  ]
}
```

### Déploiement

```bash
cd cloud-functions/extract-slides
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=europe-west1
./deploy.sh
```

### Coût estimé

| Usage | Coût |
|-------|------|
| Cloud Function (512MB, 120s) | ~$0.000005/invocation |
| 100 vidéos/mois | < $1 |

## Limitations

- Les vidéos protégées par DRM ne sont pas supportées
- Certaines vidéos YouTube peuvent être bloquées au téléchargement
- La qualité de la transcription dépend de la qualité audio
- L'identification des locuteurs fonctionne mieux avec des voix distinctes
- L'OCR nécessite un texte suffisamment lisible à l'écran
- `extractSlides` fonctionne mieux avec des présentations claires (PowerPoint, Keynote, Google Slides)

## Voir aussi

- [Knowledge Graph MCP Server API](./knowledge-graph-mcp-server.md)
- [Guide de Test](./TESTING_GUIDE.md)
- [Cloud Function extract-slides](../../cloud-functions/extract-slides/)
