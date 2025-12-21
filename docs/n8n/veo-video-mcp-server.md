# Veo Video - MCP Server Documentation

Documentation for the MCP Server team to integrate with the Veo Video n8n workflow.

## Overview

The Veo Video workflow provides AI video generation capabilities using Google's Veo 3.1 model via Vertex AI. It supports:

- **Text-to-Video**: Generate videos from text prompts
- **Image-to-Video**: Animate images into videos
- **Long Video Generation**: Create videos longer than 8 seconds by automatically chaining clips
- **Video Extension**: Extend existing videos with additional footage
- **Prompt Optimization**: Enhance prompts using Gemini for better video results
- **Presets**: Pre-configured styles for different use cases

## Endpoint

```
POST /webhook/veo-video
Content-Type: application/json
```

## Operations

### 1. Generate from Text (default)

Generate a video from a text prompt.

```json
{
  "operation": "generateFromText",
  "prompt": "A robot walking through a futuristic city at sunset",
  "negativePrompt": "blurry, low quality, text, watermark",
  "model": "veo-3.1-generate-001",
  "durationSeconds": 6,
  "aspectRatio": "16:9",
  "resolution": "1080p",
  "fps": 24,
  "seed": 42,
  "generateAudio": true,
  "enhancePrompt": true,
  "preset": "cinematic",
  "safetySetting": "block_medium_and_above",
  "outputMode": "base64"
}
```

### 2. Generate from Image

Animate an image into a video.

```json
{
  "operation": "generateFromImage",
  "prompt": "The character slowly turns their head and smiles",
  "sourceImage": "<base64-encoded-image>",
  "sourceImageMimeType": "image/png",
  "durationSeconds": 6,
  "aspectRatio": "16:9"
}
```

### 3. Generate Long Video

Generate videos longer than 8 seconds by automatically chaining clips.

```json
{
  "operation": "generateLongVideo",
  "prompt": "A drone flying over a mountain landscape",
  "negativePrompt": "low resolution, text, watermark, blurry",
  "targetDuration": 30,
  "model": "veo-3.1-generate-001",
  "aspectRatio": "16:9",
  "resolution": "1080p",
  "fps": 24,
  "seed": 42,
  "outputMode": "url",
  "gcsBucket": "my-videos-bucket",
  "gcsPathPrefix": "veo-videos",
  "signedUrlExpirationHours": 24
}
```

**Note**: The API will automatically calculate the optimal clip sequence. For example:
- 30 seconds = 8s + 8s + 8s + 6s (4 API calls)
- 20 seconds = 8s + 8s + 4s (3 API calls)

**Temporal Coherence**: When `seed` is provided (or auto-generated), the same seed is used across all clips to maintain visual consistency. This prevents characters from changing appearance or scenes from drifting between clips.

### 4. Extend Video

Extend an existing video with additional footage.

```json
{
  "operation": "extendVideo",
  "sourceVideo": "<base64-encoded-video>",
  "extensionPrompt": "The camera continues to pan right",
  "durationSeconds": 8,
  "aspectRatio": "16:9"
}
```

### 5. Optimize Prompt

Enhance a prompt using Gemini AI for better video generation results.

```json
{
  "operation": "optimizePrompt",
  "prompt": "A cat sitting on a sofa",
  "preset": "cinematic"
}
```

**Response**:
```json
{
  "success": true,
  "operation": "optimizePrompt",
  "originalPrompt": "A cat sitting on a sofa",
  "optimizedPrompt": "Cinematic film scene: A fluffy orange tabby cat lounges gracefully on a vintage velvet sofa, dramatic lighting, film-like color grading, 24fps cinematic look, anamorphic lens feel",
  "keywordsAdded": ["cinematic", "dramatic", "gracefully", "vintage"],
  "preset": "cinematic"
}
```

## Parameters

### Common Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `operation` | string | `generateFromText` | Operation to perform |
| `prompt` | string | required | Text description of the video |
| `model` | string | `veo-3.1-generate-001` | Model to use |
| `aspectRatio` | string | `16:9` | `16:9` or `9:16` |
| `resolution` | string | `1080p` | `1080p` or `720p` |
| `generateAudio` | boolean | `true` | Generate audio/sound effects |
| `enhancePrompt` | boolean | `true` | AI-enhance the prompt |
| `preset` | string | `none` | Preset style to apply |
| `personGeneration` | string | `allow_adult` | `allow_adult` or `dont_allow` |

### Phase 5C: Advanced Control Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `seed` | integer | `0` (random) | Seed for reproducibility. Same seed = same visual base. Critical for long videos. |
| `negativePrompt` | string | `null` | Elements to exclude from generation (e.g., "blurry, text, watermark, distorted limbs") |
| `fps` | integer | `24` | Frames per second: `24` (cinematic) or `30` (TV/corporate) |
| `safetySetting` | string | `block_medium_and_above` | Safety filter level: `block_low_and_above`, `block_medium_and_above`, `block_only_high` |

### Phase 5C: Output Mode Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `outputMode` | string | `base64` | `base64` (inline) or `url` (GCS signed URL). Recommended: `url` for videos > 10s |
| `gcsBucket` | string | - | Google Cloud Storage bucket name (required if outputMode=url) |
| `gcsPathPrefix` | string | `veo-videos` | Path prefix in the GCS bucket |
| `signedUrlExpirationHours` | number | `24` | Signed URL validity duration in hours |

### Duration Parameters

| Parameter | Operation | Values | Description |
|-----------|-----------|--------|-------------|
| `durationSeconds` | generateFromText, generateFromImage, extendVideo | `4`, `6`, `8` | Clip duration in seconds |
| `targetDuration` | generateLongVideo | `4-120` | Total target duration |

### Models

| Model ID | Description |
|----------|-------------|
| `veo-3.1-generate-001` | Higher quality, slower generation |
| `veo-3.1-fast-generate-001` | Faster generation, slightly lower quality |

## Presets

Available presets that automatically configure prompt styling and defaults:

| Preset | Description | Default Aspect Ratio |
|--------|-------------|---------------------|
| `none` | Custom settings, no preset applied | - |
| `corporate` | Clean, professional videos for business | 16:9 |
| `social_short` | Dynamic vertical videos for TikTok/Reels | 9:16 |
| `product_demo` | Product showcase with studio lighting | 16:9 |
| `cinematic` | Film-quality with dramatic cinematography | 16:9 |
| `explainer` | Educational content with clear visuals | 16:9 |
| `artistic` | Abstract and creative artistic videos | 16:9 |

## Response Format

### Video Operations Response

```json
{
  "success": true,
  "operation": "generateFromText",
  "video": {
    "format": "mp4",
    "durationSeconds": 6,
    "resolution": "1080p",
    "aspectRatio": "16:9",
    "hasAudio": true,
    "fps": 24,
    "seedUsed": 42
  },
  "videoBase64": "<base64-encoded-video>",
  "model": "veo-3.1-generate-001",
  "generationTimeSeconds": 45,
  "preset": "cinematic",
  "metadata": {
    "processedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

### Response with GCS URL (outputMode: "url")

When using `outputMode: "url"`, the response includes a signed URL instead of base64:

```json
{
  "success": true,
  "operation": "generateFromText",
  "video": {
    "format": "mp4",
    "durationSeconds": 24,
    "fps": 24,
    "seedUsed": 42
  },
  "videoUrl": "https://storage.googleapis.com/my-bucket/veo-videos/1702815600-video.mp4?X-Goog-Signature=...",
  "expiresAt": "2024-01-16T10:30:00.000Z",
  "videoBase64": "<base64-encoded-video>",
  "model": "veo-3.1-generate-001",
  "generationTimeSeconds": 180
}
```

### Long Video Response

Additional fields for `generateLongVideo`:

```json
{
  "video": {
    "format": "mp4",
    "durationSeconds": 30,
    "clipCount": 4,
    "clipDurations": [8, 8, 8, 6],
    "fps": 24,
    "seedUsed": 42
  },
  "videoUrl": "https://storage.googleapis.com/my-bucket/veo-videos/final.mp4",
  "expiresAt": "2024-01-16T10:30:00.000Z",
  "metadata": {
    "targetDuration": 30,
    "actualDuration": 30
  }
}
```

**Note**: For long videos, the same `seed` is used across all clips to maintain visual coherence.

## Error Handling

Errors are returned with a descriptive message:

```json
{
  "error": "Missing required input. Provide 'prompt' for most operations or 'sourceVideo' for extendVideo"
}
```

### Safety Filter Errors (Phase 5C)

When content is blocked by Google's safety filters, a detailed error is returned:

```json
{
  "success": false,
  "error": {
    "code": "SAFETY_BLOCKED",
    "reason": "SAFETY_REASON_VIOLENCE",
    "message": "Le prompt contient du contenu violent",
    "suggestion": "Reformulez le prompt pour éviter les éléments violents"
  }
}
```

**Safety Reasons**:
| Reason | Description |
|--------|-------------|
| `SAFETY_REASON_VULGARITY` | Vulgar or profane content |
| `SAFETY_REASON_VIOLENCE` | Violent content |
| `SAFETY_REASON_SEXUAL` | Sexual content |
| `SAFETY_REASON_DANGEROUS` | Dangerous activities |
| `SAFETY_REASON_HARASSMENT` | Harassment or offensive content |
| `SAFETY_REASON_HATE` | Hate speech |

## Timing Considerations

- **Single clip (4-8s)**: ~30-90 seconds generation time
- **Long video (30s)**: ~2-4 minutes (4 clips)
- **Polling interval**: 15 seconds
- **Maximum timeout**: 5 minutes per clip

## Best Practices

1. **Use Presets**: Apply presets for consistent styling
2. **Optimize Prompts First**: Use `optimizePrompt` before `generateFromText` for better results
3. **Choose Appropriate Duration**: Longer clips use more resources
4. **Use Fast Model for Drafts**: `veo-3.1-fast-generate-001` for quick iterations
5. **Portrait for Social**: Use `9:16` aspect ratio for social media content
6. **Use GCS for Long Videos**: Set `outputMode: "url"` for videos > 10 seconds to avoid base64 memory issues
7. **Set Seed for Reproducibility**: Use a fixed `seed` when iterating on prompts to compare variations
8. **Use Negative Prompt**: Exclude common artifacts with `negativePrompt: "blurry, text, watermark, distorted"`
9. **Choose FPS Wisely**: 24fps for cinematic feel, 30fps for corporate/TV content

## Example: Full Workflow

```javascript
// Step 1: Optimize the prompt
const optimizeResponse = await fetch('/webhook/veo-video', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    operation: 'optimizePrompt',
    prompt: 'A startup team celebrating',
    preset: 'corporate'
  })
});

const { optimizedPrompt } = await optimizeResponse.json();

// Step 2: Generate the video with optimized prompt
const videoResponse = await fetch('/webhook/veo-video', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    operation: 'generateLongVideo',
    prompt: optimizedPrompt,
    targetDuration: 15,
    preset: 'corporate',
    model: 'veo-3.1-generate-001'
  })
});

const { videoBase64, video } = await videoResponse.json();
console.log(`Generated ${video.durationSeconds}s video with ${video.clipCount} clips`);
```

## Credentials Required

The workflow requires `googleVertexAiApi` credentials configured in n8n with:
- `projectId`: GCP Project ID
- `location`: Region (default: `us-central1`)
- `serviceAccountKey`: Service account JSON key (optional if using default credentials)

### GCS Upload (for outputMode: "url")

If using `outputMode: "url"`, the service account must have these additional permissions:
- `storage.objects.create` on the target bucket
- `storage.objects.get` for signed URL generation
- `iam.serviceAccounts.signBlob` for signing URLs

Example IAM roles: `Storage Object Creator` + `Storage Object Viewer`
