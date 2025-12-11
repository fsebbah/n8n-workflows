/**
 * n8n-nodes-google-genai-core
 *
 * Core package for Google GenAI integration in n8n.
 * Provides credentials, API client, GCS upload, and polling utilities.
 *
 * This package is a dependency for:
 * - n8n-nodes-knowledge-graph
 * - n8n-nodes-video-transcription
 * - n8n-nodes-gemini-image
 * - n8n-nodes-veo-video
 */

// Types
export * from './shared/types';

// Error handling
export {
	GenAiNodeError,
	createGenAiError,
	parseGoogleApiError,
	parseGcsError,
	withErrorHandling,
} from './shared/ErrorHandler';

// Polling helper
export {
	PollingHelper,
	parseGoogleOperationStatus,
	createVeoPollingHelper,
	createFastPollingHelper,
} from './shared/PollingHelper';

// GCS uploader
export {
	GcsUploader,
	createGcsUploader,
} from './shared/GcsUploader';

// GenAI client
export {
	GenAiClient,
	createAiStudioClient,
	createVertexAiClient,
	createVertexAiClientWithAdc,
} from './shared/GenAiClient';

// Credentials (exported for n8n to discover)
export { GoogleVertexAiApi } from './credentials/GoogleVertexAiApi.credentials';
export { GoogleAiStudioApi } from './credentials/GoogleAiStudioApi.credentials';
