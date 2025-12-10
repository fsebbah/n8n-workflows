# n8n-nodes-google-genai-core

Core package for Google GenAI integration in n8n. Provides shared utilities for all Google GenAI nodes.

## Features

- **Credentials**: Google Vertex AI (Service Account) and Google AI Studio (API Key)
- **GenAiClient**: Wrapper for Gemini and Veo APIs
- **GcsUploader**: Upload files to Google Cloud Storage with signed URLs
- **PollingHelper**: Handle long-running operations (Veo video generation)
- **ErrorHandler**: User-friendly error messages

## Installation

This package is a dependency for other GenAI nodes. It's installed automatically.

```bash
cd custom-nodes/n8n-nodes-google-genai-core
npm install
npm run build
```

## Usage

### In other n8n nodes

```typescript
import {
  GenAiClient,
  createVertexAiClient,
  GcsUploader,
  PollingHelper,
  createVeoPollingHelper,
} from 'n8n-nodes-google-genai-core';

// Create a client
const client = createVertexAiClient(projectId, serviceAccountKey, 'us-central1');

// Generate text
const result = await client.generateText('Hello, how are you?');

// Upload to GCS
const uploader = new GcsUploader({ bucketName: 'my-bucket' }, serviceAccountKey);
const uploadResult = await uploader.upload(buffer, 'image.png', 'user123');

// Poll a long-running operation
const poller = createVeoPollingHelper((status) => {
  console.log(`Progress: ${status.progress}%`);
});
const finalStatus = await poller.poll(() => client.checkOperationStatus(operationId));
```

## Credentials

### Google Vertex AI API

For production use with full access to Vertex AI features.

| Field | Description |
|-------|-------------|
| Project ID | Google Cloud project ID |
| Location | Region (us-central1, europe-west1, etc.) |
| Service Account Key | JSON content of service account key |
| GCS Bucket Name | Optional bucket for media storage |

### Google AI Studio API

For development/testing with API key authentication.

| Field | Description |
|-------|-------------|
| API Key | API key from aistudio.google.com |

## API Reference

### GenAiClient

```typescript
// Text generation
generateText(prompt: string, options?: TextGenerationOptions): Promise<TextGenerationResult>
generateTextWithContext(messages: Array<{role, content}>, options?): Promise<TextGenerationResult>
generateJson<T>(prompt: string, options?): Promise<T>

// Image generation
generateImage(prompt: string, options?: ImageGenerationOptions): Promise<ImageGenerationResult>

// Video generation (Veo)
startVideoGeneration(prompt: string, options?: VideoGenerationOptions): Promise<VideoGenerationResult>
checkOperationStatus(operationId: string): Promise<OperationStatus>
cancelOperation(operationId: string): Promise<void>
```

### GcsUploader

```typescript
upload(data: Buffer, filename: string, userId: string, mimeType?): Promise<GcsUploadResult>
uploadFromUrl(sourceUrl: string, filename: string, userId: string): Promise<GcsUploadResult>
regenerateSignedUrl(path: string): Promise<string>
exists(path: string): Promise<boolean>
delete(path: string): Promise<void>
listUserFiles(userId: string, prefix?): Promise<string[]>
```

### PollingHelper

```typescript
poll(checkStatus: () => Promise<OperationStatus>): Promise<OperationStatus>
pollWithRetry(checkStatus, maxRetries?): Promise<OperationStatus>
```

## Error Handling

All errors are wrapped in `GenAiNodeError` with user-friendly messages:

| Code | User Message |
|------|-------------|
| AUTH_FAILED | Échec de l'authentification. Vérifiez vos credentials Google. |
| QUOTA_EXCEEDED | Limite de quota atteinte. Réessayez plus tard. |
| RATE_LIMITED | Trop de requêtes. Veuillez patienter. |
| CONTENT_FILTERED | Le contenu ne peut pas être généré (politique de sécurité). |
| TIMEOUT | L'opération a pris trop de temps. Réessayez. |

## Dependencies

- `@google-cloud/storage`: GCS operations
- `@google-cloud/aiplatform`: Vertex AI SDK
- `google-auth-library`: Authentication

## Related Packages

- `n8n-nodes-knowledge-graph`: Knowledge graph extraction
- `n8n-nodes-video-transcription`: Video transcription with Gemini
- `n8n-nodes-gemini-image`: Image generation with Gemini
- `n8n-nodes-veo-video`: Video generation with Veo 3
