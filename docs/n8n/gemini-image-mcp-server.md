# Gemini Image MCP Server API

Documentation pour le serveur MCP Gemini Image accessible via webhook n8n.

## Quick Start

```bash
# 1. Générer une image simple
curl -X POST http://localhost:5678/webhook/gemini-image \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A cute robot made of felt", "aspectRatio": "16:9"}'

# 2. Créer un character sheet
curl -X POST http://localhost:5678/webhook/gemini-image \
  -d '{"operation": "createCharacterSheet", "sourceImage": "'$(base64 -w0 robot.png)'", "views": ["front", "back"]}'

# 3. Composer une scène
curl -X POST http://localhost:5678/webhook/gemini-image \
  -d '{"operation": "composeScene", "referenceImages": [{"data": "'$(base64 -w0 sheet.png)'", "role": "character"}], "scenePrompt": "The robot in a forest"}'
```

## Installation

### Prérequis

1. **n8n** installé et fonctionnel
2. **Google Cloud Project** avec Vertex AI API activée
3. **Credentials Vertex AI** configurés dans n8n

### Installation du Custom Node

```bash
# 1. Copier le package dans le dossier nodes de n8n
cp -r custom-nodes/n8n-nodes-gemini-image ~/.n8n/nodes/

# 2. Installer les dépendances
cd ~/.n8n/nodes
npm install

# 3. Redémarrer n8n
```

### Import du Workflow

1. Dans n8n, aller dans **Workflows** → **Import**
2. Sélectionner `workflows/gemini-image-workflow.json`
3. Configurer les credentials Vertex AI dans le node "Gemini Image"
4. Activer le workflow

## Endpoint

```
POST /webhook/gemini-image
```

## Vue d'ensemble

Ce workflow génère et manipule des images en utilisant Gemini 2.5 Flash Image ("Nano Banana"). Il supporte la génération depuis un prompt, l'extraction de personnages, la création de character sheets et la composition de scènes.

## Opérations disponibles

### `generate`
Génère une image à partir d'un prompt texte.

### `extractCharacter`
Extrait un personnage d'une image avec fond transparent.

### `createCharacterSheet`
Génère plusieurs vues d'un personnage (front, back, side).

### `composeScene`
Compose une scène en utilisant des images de référence.

## Paramètres de la requête

### Paramètres communs

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `operation` | string | `"generate"` | Opération: `generate`, `extractCharacter`, `createCharacterSheet`, `composeScene` |
| `aspectRatio` | string | `"16:9"` | Ratio: `1:1`, `16:9`, `9:16`, `2:3`, `3:2`, `4:3`, `21:9` |
| `outputFormat` | string | `"png"` | Format: `png`, `webp`, `jpeg` |
| `model` | string | `"gemini-2.5-flash-preview-native-audio-dialog"` | Modèle Gemini |
| `includeTextFeedback` | boolean | `false` | Inclure le feedback textuel du modèle |

### Paramètres GCS (optionnels)

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `uploadToGcs` | boolean | `false` | Uploader l'image générée vers Google Cloud Storage |
| `gcsBucket` | string | - | **Requis si uploadToGcs=true.** Nom du bucket GCS |
| `gcsPathPrefix` | string | `"gemini-images"` | Préfixe du chemin dans le bucket |
| `signedUrlExpirationHours` | number | `24` | Durée de validité de l'URL signée (en heures) |
| `userId` | string | - | ID utilisateur pour organiser les fichiers |

### Paramètres pour `generate`

| Paramètre | Type | Description |
|-----------|------|-------------|
| `prompt` | string | **Requis.** Description de l'image à générer |

### Paramètres pour `extractCharacter`

| Paramètre | Type | Description |
|-----------|------|-------------|
| `sourceImage` | string | **Requis.** Image source en base64 |
| `sourceImageMimeType` | string | Type MIME (défaut: `image/png`) |
| `characterDescription` | string | Description du personnage à extraire (défaut: `"the main character"`) |
| `backgroundType` | string | Type de fond: `white`, `transparent`, `solid` (défaut: `white`) |
| `backgroundColor` | string | Couleur si `backgroundType=solid` (ex: `blue`, `#FF0000`) |

### Paramètres pour `createCharacterSheet`

| Paramètre | Type | Description |
|-----------|------|-------------|
| `sourceImage` | string | **Requis.** Image source en base64 |
| `sourceImageMimeType` | string | Type MIME (défaut: `image/png`) |
| `views` | string[] | Vues à générer (défaut: `["front", "back"]`) |
| `characterName` | string | Nom affiché dans le titre du sheet (optionnel) |
| `includeLabels` | boolean | Inclure les labels texte (défaut: `true`) |

**Vues disponibles:**
- `front` - Vue de face
- `back` - Vue de dos
- `left side` - Vue côté gauche
- `right side` - Vue côté droit
- `3/4` - Vue 3/4

### Paramètres pour `composeScene`

| Paramètre | Type | Description |
|-----------|------|-------------|
| `referenceImages` | array | **Requis.** Images de référence (voir format ci-dessous) |
| `scenePrompt` | string | **Requis.** Description de la scène à composer |
| `promptStyle` | string | Style: `descriptive` (état final) ou `imperative` (actions) |
| `lighting` | string | Style d'éclairage (ex: `"Golden hour"`, `"Studio lighting"`) |
| `cameraAngle` | string | Angle de caméra (ex: `"3/4 back angle"`, `"close-up"`) |

**Format referenceImages:**
```json
[
  {
    "data": "<base64>",
    "mimeType": "image/png",
    "role": "character sheet"
  },
  {
    "data": "<base64>",
    "mimeType": "image/png",
    "role": "previous scene"
  }
]
```

## Format de sortie

### Sans GCS (base64 uniquement)

```json
{
  "success": true,
  "operation": "generate",
  "image": {
    "base64": "<base64_encoded_image>",
    "mimeType": "image/png",
    "format": "png"
  },
  "model": "gemini-2.5-flash-preview-native-audio-dialog",
  "textFeedback": null,
  "metadata": {
    "processedAt": "2024-12-19T10:30:00Z"
  }
}
```

### Avec GCS (base64 + URL signée)

```json
{
  "success": true,
  "operation": "generate",
  "image": {
    "base64": "<base64_encoded_image>",
    "mimeType": "image/png",
    "format": "png"
  },
  "gcs": {
    "bucket": "my-bucket",
    "path": "gemini-images/user-123/1703001234567-generate-png.png",
    "gcsUrl": "gs://my-bucket/gemini-images/user-123/1703001234567-generate-png.png",
    "signedUrl": "https://storage.googleapis.com/my-bucket/gemini-images/...",
    "expiresAt": "2024-12-20T10:30:00Z"
  },
  "model": "gemini-2.5-flash-preview-native-audio-dialog",
  "textFeedback": null,
  "metadata": {
    "processedAt": "2024-12-19T10:30:00Z"
  }
}
```

## Exemples de requêtes

### Générer une image simple

```bash
curl -X POST http://localhost:5678/webhook/gemini-image \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "generate",
    "prompt": "A cute robot made of felt, standing on a mountain, studio lighting, soft textures",
    "aspectRatio": "16:9"
  }'
```

### Générer et uploader vers GCS

```bash
curl -X POST http://localhost:5678/webhook/gemini-image \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "generate",
    "prompt": "A cute robot made of felt, standing on a mountain",
    "aspectRatio": "16:9",
    "uploadToGcs": true,
    "gcsBucket": "my-images-bucket",
    "gcsPathPrefix": "generated",
    "userId": "user-123",
    "signedUrlExpirationHours": 48
  }'
```

### Extraire un personnage

```bash
curl -X POST http://localhost:5678/webhook/gemini-image \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "extractCharacter",
    "sourceImage": "'$(base64 -w0 image.png)'",
    "sourceImageMimeType": "image/png",
    "characterDescription": "the blue robot",
    "backgroundType": "white"
  }'
```

### Extraire avec fond transparent

```bash
curl -X POST http://localhost:5678/webhook/gemini-image \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "extractCharacter",
    "sourceImage": "'$(base64 -w0 image.png)'",
    "characterDescription": "the main character",
    "backgroundType": "transparent"
  }'
```

### Créer un character sheet

```bash
curl -X POST http://localhost:5678/webhook/gemini-image \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "createCharacterSheet",
    "sourceImage": "'$(base64 -w0 character.png)'",
    "views": ["front", "back", "left side"],
    "characterName": "Robot",
    "includeLabels": true
  }'
```

### Composer une scène (style descriptif)

```bash
curl -X POST http://localhost:5678/webhook/gemini-image \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "composeScene",
    "referenceImages": [
      {
        "data": "'$(base64 -w0 character-sheet.png)'",
        "mimeType": "image/png",
        "role": "Robot character sheet"
      },
      {
        "data": "'$(base64 -w0 previous-scene.png)'",
        "mimeType": "image/png",
        "role": "Previous scene"
      }
    ],
    "scenePrompt": "The robot walks through a dense felt forest",
    "promptStyle": "descriptive",
    "lighting": "Golden hour, soft and diffused",
    "cameraAngle": "3/4 back angle",
    "aspectRatio": "16:9"
  }'
```

### Composer une scène (style impératif)

```bash
curl -X POST http://localhost:5678/webhook/gemini-image \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "composeScene",
    "referenceImages": [
      {
        "data": "'$(base64 -w0 scene.png)'",
        "mimeType": "image/png",
        "role": "Current scene"
      }
    ],
    "scenePrompt": "Remove the ice axes. Move the mountain to the left. Add a wooden bridge between the peaks.",
    "promptStyle": "imperative",
    "aspectRatio": "16:9"
  }'
```

## Aspect Ratios

| Ratio | Dimensions | Usage |
|-------|------------|-------|
| `1:1` | 1024×1024 | Avatars, icônes |
| `2:3` | 768×1152 | Portraits |
| `3:2` | 1152×768 | Paysages |
| `9:16` | 768×1344 | Mobile, Stories |
| `16:9` | 1344×768 | Bannières, vidéos |
| `21:9` | ~1344×576 | Cinématique |

## Techniques pour la cohérence (du Colab)

### Character Sheet
Créez d'abord un character sheet avec vues front/back pour maintenir la cohérence dans les scènes suivantes.

### Prompts descriptifs vs impératifs

**Descriptif** (décrit l'état final):
```
The robot is sleeping peacefully in a hammock...
```

**Impératif** (décrit les actions):
```
Remove the ice axes. Move the mountain to the left. Add a bridge...
```

### Références dans le prompt
```
- Image 1: Robot character sheet.
- Image 2: Previous scene.
- Scene: The robot walks through the forest...
```

## Codes d'erreur

| Code | Description |
|------|-------------|
| 400 | Aucun input fourni (ni prompt, ni sourceImage, ni scenePrompt) |
| 500 | Erreur de l'API Gemini |
| 500 | Erreur d'authentification Vertex AI |

## APIs Google requises

| API | Console URL | Requis pour |
|-----|-------------|-------------|
| **Vertex AI API** | [Activer](https://console.cloud.google.com/flows/enableapi?apiid=aiplatform.googleapis.com) | Génération d'images |
| **Cloud Storage API** | [Activer](https://console.cloud.google.com/flows/enableapi?apiid=storage.googleapis.com) | Upload GCS (si `uploadToGcs=true`) |

## Notes d'implémentation

- Le workflow utilise le modèle `gemini-2.5-flash-preview-native-audio-dialog` (Nano Banana)
- Location: `global` pour les modèles preview
- Les credentials Vertex AI sont gérés par n8n (pas de clé en dur)
- Les images sont retournées en base64 dans la réponse JSON
- **GCS Upload**: Optionnel, permet de stocker l'image dans Cloud Storage et retourne une URL signée
- Les URLs signées expirent après la durée configurée (défaut: 24h)

## Intégration avec MCP Server

Exemple d'outil MCP:

```typescript
{
  name: "generate_image",
  description: "Generate an image using Gemini",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["generate", "extractCharacter", "createCharacterSheet", "composeScene"],
        default: "generate"
      },
      prompt: { type: "string", description: "Text prompt for image generation" },
      aspectRatio: {
        type: "string",
        enum: ["1:1", "16:9", "9:16", "2:3", "3:2"],
        default: "16:9"
      }
    },
    required: ["prompt"]
  }
}
```

## Voir aussi

- [Video Transcription MCP Server API](./video-transcription-mcp-server.md)
- [Knowledge Graph MCP Server API](./knowledge-graph-mcp-server.md)
- [Workflow Best Practices](./WORKFLOW_BEST_PRACTICES.md)
