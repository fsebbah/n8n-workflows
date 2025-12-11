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
| `operation` | string | `"transcribe"` | Opération à effectuer (voir ci-dessous) |
| `language` | string | `"auto"` | Langue de sortie: `"auto"`, `"en"`, `"fr"`, `"es"`, `"de"`, `"it"`, `"pt"` |

### Options de chunking (pour vidéos longues)

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `enableChunking` | boolean | `false` | Activer le découpage pour vidéos longues |
| `chunkDuration` | number | `10` | Durée de chaque segment en minutes |
| `videoDuration` | number | `0` | Durée totale de la vidéo en minutes (requis si chunking activé) |

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

## Limitations

- Les vidéos protégées par DRM ne sont pas supportées
- Certaines vidéos YouTube peuvent être bloquées au téléchargement
- La qualité de la transcription dépend de la qualité audio
- L'identification des locuteurs fonctionne mieux avec des voix distinctes
- L'OCR nécessite un texte suffisamment lisible à l'écran
