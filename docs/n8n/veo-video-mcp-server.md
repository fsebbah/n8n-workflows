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
  "model": "veo-3.1-generate-001",
  "durationSeconds": 6,
  "aspectRatio": "16:9",
  "resolution": "1080p",
  "generateAudio": true,
  "enhancePrompt": true,
  "preset": "cinematic"
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
  "targetDuration": 30,
  "model": "veo-3.1-generate-001",
  "aspectRatio": "16:9",
  "resolution": "1080p"
}
```

**Note**: The API will automatically calculate the optimal clip sequence. For example:
- 30 seconds = 8s + 8s + 8s + 6s (4 API calls)
- 20 seconds = 8s + 8s + 4s (3 API calls)

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
    "hasAudio": true
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

### Long Video Response

Additional fields for `generateLongVideo`:

```json
{
  "video": {
    "format": "mp4",
    "durationSeconds": 30,
    "clipCount": 4,
    "clipDurations": [8, 8, 8, 6]
  },
  "metadata": {
    "targetDuration": 30,
    "actualDuration": 30
  }
}
```

## Error Handling

Errors are returned with a descriptive message:

```json
{
  "error": "Missing required input. Provide 'prompt' for most operations or 'sourceVideo' for extendVideo"
}
```

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
