# Gemini Image MCP Server API (Imagen 3)

Documentation pour le serveur MCP Gemini Image accessible via webhook n8n.

**Mise jour v2**: Migration de Gemini 2.5 Flash Image vers **Imagen 3** pour une meilleure qualite et des fonctionnalites professionnelles.

## Quick Start

```bash
# 1. Generer une image simple
curl -X POST http://localhost:5678/webhook/gemini-image \
  -H "Content-Type: application/json" \
  -d '{"prompt": "A cute robot made of felt", "aspectRatio": "16:9"}'

# 2. Generer avec negative prompt et seed
curl -X POST http://localhost:5678/webhook/gemini-image \
  -d '{"prompt": "A robot in a forest", "negativePrompt": "blurry, text, watermark", "seed": 42}'

# 3. Creer un character sheet
curl -X POST http://localhost:5678/webhook/gemini-image \
  -d '{"operation": "createCharacterSheet", "sourceImage": "'$(base64 -w0 robot.png)'", "views": ["front", "back"]}'
```

## Modeles Imagen 3 disponibles

| Modele | Usage | Quota/min | Description |
|--------|-------|-----------|-------------|
| `imagen-3.0-generate-002` | Generation haute qualite | 20 | Modele standard recommande |
| `imagen-3.0-fast-generate-001` | Generation rapide | 200 | 10x plus rapide, ideal pour prototypage |
| `imagen-3.0-capability-001` | Edition d'images | 20 | Inpainting, outpainting, extraction |

## Installation

### Prerequis

1. **n8n** installe et fonctionnel
2. **Google Cloud Project** avec Vertex AI API activee
3. **Credentials Vertex AI** configures dans n8n (obligatoire - Imagen 3 n'est disponible que via Vertex AI)

### Installation du Custom Node

```bash
# 1. Copier le package dans le dossier nodes de n8n
cp -r custom-nodes/n8n-nodes-gemini-image ~/.n8n/nodes/

# 2. Installer les dependances
cd ~/.n8n/nodes/n8n-nodes-gemini-image
npm install

# 3. Redemarrer n8n
```

### Import du Workflow

1. Dans n8n, aller dans **Workflows** -> **Import**
2. Selectionner `workflows/gemini-image-workflow.json`
3. Configurer les credentials Vertex AI dans le node "Gemini Image"
4. Activer le workflow

## Endpoint

```
POST /webhook/gemini-image
```

## Vue d'ensemble

Ce workflow genere et manipule des images en utilisant **Imagen 3** (Vertex AI). Il supporte la generation depuis un prompt, l'extraction de personnages, la creation de character sheets et la composition de scenes.

## Operations disponibles

### `generate`
Genere une image a partir d'un prompt texte avec support du negative prompt et du seed.

### `extractCharacter`
Extrait un personnage d'une image avec fond transparent (utilise imagen-3.0-capability-001).

### `createCharacterSheet`
Genere plusieurs vues d'un personnage (front, back, side) avec le meme seed pour la coherence.

### `composeScene`
Compose une scene en utilisant des images de reference.

## Parametres de la requete

### Parametres communs

| Parametre | Type | Defaut | Description |
|-----------|------|--------|-------------|
| `operation` | string | `"generate"` | Operation: `generate`, `extractCharacter`, `createCharacterSheet`, `composeScene` |
| `imageModel` | string | `"imagen-3.0-generate-002"` | Modele: `imagen-3.0-generate-002` (qualite) ou `imagen-3.0-fast-generate-001` (rapide) |
| `aspectRatio` | string | `"16:9"` | Ratio: `1:1`, `16:9`, `9:16`, `4:3`, `3:4` |
| `outputFormat` | string | `"png"` | Format: `png`, `webp`, `jpeg` |
| `safetySetting` | string | `"block_medium_and_above"` | Filtre: `block_low_and_above`, `block_medium_and_above`, `block_only_high` |

### Nouveaux parametres Imagen 3

| Parametre | Type | Defaut | Description |
|-----------|------|--------|-------------|
| `negativePrompt` | string | - | Elements a exclure de l'image (ex: "blurry, text, watermark") |
| `seed` | integer | random | Graine pour reproductibilite (1-2147483647). Meme seed = meme resultat |
| `enhancePrompt` | boolean | `false` | Laisse Imagen ameliorer automatiquement le prompt |
| `addWatermark` | boolean | `false` | Ajoute un filigrane numerique |
| `personGeneration` | string | `"allow_adult"` | `allow_adult` ou `dont_allow` |

### Parametres GCS (optionnels)

| Parametre | Type | Defaut | Description |
|-----------|------|--------|-------------|
| `uploadToGcs` | boolean | `false` | Uploader l'image generee vers Google Cloud Storage |
| `gcsBucket` | string | - | **Requis si uploadToGcs=true.** Nom du bucket GCS |
| `gcsPathPrefix` | string | `"imagen3-images"` | Prefixe du chemin dans le bucket |
| `signedUrlExpirationHours` | number | `24` | Duree de validite de l'URL signee (en heures) |
| `userId` | string | - | ID utilisateur pour organiser les fichiers |

### Parametres pour `generate`

| Parametre | Type | Description |
|-----------|------|-------------|
| `prompt` | string | **Requis.** Description de l'image a generer |
| `negativePrompt` | string | Elements a exclure (ex: "blurry, low quality") |
| `seed` | integer | Seed pour reproductibilite |

### Parametres pour `extractCharacter`

| Parametre | Type | Description |
|-----------|------|-------------|
| `sourceImage` | string | **Requis.** Image source en base64 |
| `sourceImageMimeType` | string | Type MIME (defaut: `image/png`) |
| `characterDescription` | string | Description du personnage a extraire (defaut: `"the main character"`) |
| `backgroundType` | string | Type de fond: `white`, `transparent`, `solid` (defaut: `white`) |
| `backgroundColor` | string | Couleur si `backgroundType=solid` (ex: `blue`, `#FF0000`) |
| `negativePrompt` | string | Elements a exclure |

### Parametres pour `createCharacterSheet`

| Parametre | Type | Description |
|-----------|------|-------------|
| `sourceImage` | string | **Requis.** Image source en base64 |
| `sourceImageMimeType` | string | Type MIME (defaut: `image/png`) |
| `views` | string[] | Vues a generer (defaut: `["front", "back"]`) |
| `characterName` | string | Nom affiche dans le titre du sheet (optionnel) |
| `includeLabels` | boolean | Inclure les labels texte (defaut: `true`) |
| `seed` | integer | **Recommande.** Utiliser le meme seed pour coherence entre vues |

**Vues disponibles:**
- `front` - Vue de face
- `back` - Vue de dos
- `left side` - Vue cote gauche
- `right side` - Vue cote droit
- `3/4` - Vue 3/4

### Parametres pour `composeScene`

| Parametre | Type | Description |
|-----------|------|-------------|
| `referenceImages` | array | **Requis.** Images de reference (voir format ci-dessous) |
| `scenePrompt` | string | **Requis.** Description de la scene a composer |
| `lighting` | string | Style d'eclairage (ex: `"Golden hour"`, `"Studio lighting"`) |
| `cameraAngle` | string | Angle de camera (ex: `"3/4 back angle"`, `"close-up"`) |
| `negativePrompt` | string | Elements a exclure |
| `seed` | integer | Seed pour reproductibilite |

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

### Reponse standard

```json
{
  "success": true,
  "operation": "generate",
  "image": {
    "base64": "<base64_encoded_image>",
    "mimeType": "image/png",
    "format": "png"
  },
  "model": "imagen-3.0-generate-002",
  "seed": 42,
  "textFeedback": "Generated a cute felt robot standing in a forest clearing...",
  "metadata": {
    "processedAt": "2024-12-19T10:30:00Z",
    "apiVersion": "imagen-3"
  }
}
```

### Avec GCS (base64 + URL signee)

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
    "path": "imagen3-images/user-123/1703001234567-generate-png.png",
    "gcsUrl": "gs://my-bucket/imagen3-images/user-123/1703001234567-generate-png.png",
    "signedUrl": "https://storage.googleapis.com/my-bucket/imagen3-images/...",
    "expiresAt": "2024-12-20T10:30:00Z"
  },
  "model": "imagen-3.0-generate-002",
  "seed": 42,
  "metadata": {
    "processedAt": "2024-12-19T10:30:00Z",
    "apiVersion": "imagen-3"
  }
}
```

## Exemples de requetes

### Generer une image simple

```bash
curl -X POST http://localhost:5678/webhook/gemini-image \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "generate",
    "prompt": "A cute robot made of felt, standing on a mountain, studio lighting, soft textures",
    "aspectRatio": "16:9"
  }'
```

### Generer avec negative prompt et seed (reproductibilite)

```bash
curl -X POST http://localhost:5678/webhook/gemini-image \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "generate",
    "prompt": "A professional portrait of a business executive",
    "negativePrompt": "blurry, low quality, text, watermark, distorted",
    "seed": 42,
    "safetySetting": "block_medium_and_above"
  }'
```

### Generer avec le modele rapide (10x quota)

```bash
curl -X POST http://localhost:5678/webhook/gemini-image \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "generate",
    "prompt": "A quick concept sketch of a futuristic car",
    "imageModel": "imagen-3.0-fast-generate-001",
    "aspectRatio": "16:9"
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
    "backgroundType": "white",
    "negativePrompt": "artifacts, noise"
  }'
```

### Creer un character sheet coherent

```bash
curl -X POST http://localhost:5678/webhook/gemini-image \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "createCharacterSheet",
    "sourceImage": "'$(base64 -w0 character.png)'",
    "views": ["front", "back", "left side"],
    "characterName": "Robot",
    "includeLabels": true,
    "seed": 123456
  }'
```

### Composer une scene

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
      }
    ],
    "scenePrompt": "The robot walks through a dense felt forest",
    "lighting": "Golden hour, soft and diffused",
    "cameraAngle": "3/4 back angle",
    "aspectRatio": "16:9",
    "negativePrompt": "blurry, distorted"
  }'
```

## Aspect Ratios supportes (Imagen 3)

| Ratio | Resolution | Usage |
|-------|------------|-------|
| `1:1` | 1024x1024 | Avatars, icones |
| `3:4` | 896x1280 | Portraits |
| `4:3` | 1280x896 | Paysages |
| `9:16` | 768x1408 | Mobile, Stories |
| `16:9` | 1408x768 | Bannieres, videos |

**Note**: Les ratios `2:3`, `3:2`, `21:9` ne sont **pas supportes** par Imagen 3.

## Safety Filters (Filtres de securite)

| Niveau | Description |
|--------|-------------|
| `block_low_and_above` | Le plus strict - bloque la plupart du contenu potentiellement sensible |
| `block_medium_and_above` | Equilibre (defaut) - filtrage modere |
| `block_only_high` | Le plus permissif - bloque uniquement le contenu clairement inapproprie |

## Pipeline creatif Image -> Video

Pour transformer une image Imagen 3 en video Veo:

```
1. createCharacterSheet (imagen-3.0-generate-002)
   -> Personnage coherent sous tous angles

2. composeScene (imagen-3.0-capability-001)
   -> Personnage place dans decor

3. veo-video:generateFromImage
   -> Image s'anime naturellement
```

**Conseil**: Utilisez le **meme aspect ratio** sur Image et Video pour eviter les deformations.

## Codes d'erreur

| Code | Description |
|------|-------------|
| 400 | Aucun input fourni (ni prompt, ni sourceImage, ni scenePrompt) |
| 400 | `SAFETY_BLOCKED` - Prompt bloque par les filtres de securite |
| 500 | Erreur de l'API Imagen 3 |
| 500 | Erreur d'authentification Vertex AI |

### Erreurs de securite

Si le prompt est bloque:

```json
{
  "success": false,
  "error": {
    "code": "SAFETY_BLOCKED",
    "reason": "SAFETY_REASON_VIOLENCE",
    "message": "Image generation blocked by safety filter",
    "suggestion": "Please reformulate your prompt to avoid sensitive content"
  }
}
```

## APIs Google requises

| API | Console URL | Requis pour |
|-----|-------------|-------------|
| **Vertex AI API** | [Activer](https://console.cloud.google.com/flows/enableapi?apiid=aiplatform.googleapis.com) | Generation d'images |
| **Cloud Storage API** | [Activer](https://console.cloud.google.com/flows/enableapi?apiid=storage.googleapis.com) | Upload GCS (si `uploadToGcs=true`) |

## Notes d'implementation

- Le workflow utilise **Imagen 3** via Vertex AI (modeles stables, non-preview)
- Location recommandee: `us-central1` pour Imagen 3
- Les credentials Vertex AI sont geres par n8n (pas de cle en dur)
- Les images sont retournees en base64 dans la reponse JSON
- Le seed est retourne dans la reponse pour reproduction ulterieure
- **GCS Upload**: Optionnel, permet de stocker l'image dans Cloud Storage et retourne une URL signee

## Migration depuis v1 (Gemini 2.5 Flash)

### Changements de parametres

| Ancien | Nouveau | Notes |
|--------|---------|-------|
| `model: "gemini-2.5-flash-preview-native-audio-dialog"` | `imageModel: "imagen-3.0-generate-002"` | Nouveau nom de parametre |
| `aspectRatio: "2:3"` | `aspectRatio: "3:4"` | Ratio proche |
| `aspectRatio: "3:2"` | `aspectRatio: "4:3"` | Ratio proche |
| `aspectRatio: "21:9"` | `aspectRatio: "16:9"` | Non supporte, utiliser 16:9 |
| - | `negativePrompt` | Nouveau parametre |
| - | `seed` | Nouveau parametre |
| - | `safetySetting` | Nouveau parametre |

### Nouveautes v2

- Support du **negative prompt** pour exclure des elements
- Support du **seed** pour la reproductibilite
- **Safety filters** configurables
- Modele **Fast** pour 10x plus de quota
- Retour du seed utilise dans la reponse

## Integration avec MCP Server

Exemple d'outil MCP:

```typescript
{
  name: "generate_image",
  description: "Generate an image using Imagen 3",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["generate", "extractCharacter", "createCharacterSheet", "composeScene"],
        default: "generate"
      },
      prompt: { type: "string", description: "Text prompt for image generation" },
      negativePrompt: { type: "string", description: "Elements to exclude" },
      seed: { type: "integer", description: "Seed for reproducibility" },
      imageModel: {
        type: "string",
        enum: ["imagen-3.0-generate-002", "imagen-3.0-fast-generate-001"],
        default: "imagen-3.0-generate-002"
      },
      aspectRatio: {
        type: "string",
        enum: ["1:1", "16:9", "9:16", "4:3", "3:4"],
        default: "16:9"
      }
    },
    required: ["prompt"]
  }
}
```

## Voir aussi

- [Veo Video MCP Server API](./veo-video-mcp-server.md) - Pour l'animation des images
- [Video Transcription MCP Server API](./video-transcription-mcp-server.md)
- [Knowledge Graph MCP Server API](./knowledge-graph-mcp-server.md)
- [Workflow Best Practices](./WORKFLOW_BEST_PRACTICES.md)
