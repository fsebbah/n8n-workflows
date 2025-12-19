/**
 * Client pour l'API Veo 3 Video Generation
 * Gère les appels API et le polling des opérations longues
 */

import { GoogleAuth } from 'google-auth-library';

// Types
export interface VeoVideoConfig {
  projectId: string;
  location?: string;
  serviceAccountKey?: string;
}

export interface VeoVideoOptions {
  model?: 'veo-3.1-generate-001' | 'veo-3.1-fast-generate-001';
  aspectRatio?: '16:9' | '9:16';
  durationSeconds?: 4 | 6 | 8;
  resolution?: '1080p' | '720p';
  numberOfVideos?: 1 | 2;
  personGeneration?: 'allow_adult' | 'dont_allow';
  enhancePrompt?: boolean;
  generateAudio?: boolean;
}

export interface VeoVideoResult {
  videoData: Buffer;
  mimeType: string;
  model: string;
  durationSeconds: number;
  resolution: string;
  aspectRatio: string;
  hasAudio: boolean;
  generationTimeSeconds: number;
  enhancedPrompt?: string;
}

export interface VeoOperationStatus {
  name: string;
  done: boolean;
  error?: {
    code: number;
    message: string;
  };
  response?: {
    generatedVideos: Array<{
      video: {
        videoBytes?: string;
        uri?: string;
      };
    }>;
  };
}

const DEFAULT_OPTIONS: VeoVideoOptions = {
  model: 'veo-3.1-generate-001',
  aspectRatio: '16:9',
  durationSeconds: 6,
  resolution: '1080p',
  numberOfVideos: 1,
  personGeneration: 'allow_adult',
  enhancePrompt: true,
  generateAudio: true,
};

const POLLING_INTERVAL_MS = 15000; // 15 seconds
const MAX_POLLING_TIME_MS = 300000; // 5 minutes

export class VeoVideoClient {
  private auth: GoogleAuth;
  private projectId: string;
  private location: string;

  constructor(config: VeoVideoConfig) {
    this.projectId = config.projectId;
    this.location = config.location || 'us-central1';

    // Initialize auth
    if (config.serviceAccountKey) {
      const credentials = typeof config.serviceAccountKey === 'string'
        ? JSON.parse(config.serviceAccountKey)
        : config.serviceAccountKey;

      this.auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    } else {
      this.auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    }
  }

  /**
   * Génère une vidéo à partir d'un prompt texte
   */
  async generateFromText(
    prompt: string,
    options?: VeoVideoOptions
  ): Promise<VeoVideoResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    // Build request body
    const requestBody = {
      instances: [{ prompt }],
      parameters: {
        aspectRatio: opts.aspectRatio,
        sampleCount: opts.numberOfVideos,
        durationSeconds: opts.durationSeconds,
        resolution: opts.resolution,
        personGeneration: opts.personGeneration,
        enhancePrompt: opts.enhancePrompt,
        generateAudio: opts.generateAudio,
      },
    };

    // Start the generation operation
    const operation = await this.startOperation(opts.model!, requestBody);

    // Poll until completion
    const result = await this.pollOperation(operation.name);

    // Extract video data
    const videoData = await this.extractVideoData(result);
    const generationTimeSeconds = Math.round((Date.now() - startTime) / 1000);

    return {
      videoData,
      mimeType: 'video/mp4',
      model: opts.model!,
      durationSeconds: opts.durationSeconds!,
      resolution: opts.resolution!,
      aspectRatio: opts.aspectRatio!,
      hasAudio: opts.generateAudio!,
      generationTimeSeconds,
    };
  }

  /**
   * Génère une vidéo à partir d'une image (animation)
   */
  async generateFromImage(
    imageData: Buffer,
    imageMimeType: string,
    prompt: string,
    options?: VeoVideoOptions
  ): Promise<VeoVideoResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    // Build request body with image
    const imageBase64 = imageData.toString('base64');
    const requestBody = {
      instances: [
        {
          prompt,
          image: {
            bytesBase64Encoded: imageBase64,
            mimeType: imageMimeType,
          },
        },
      ],
      parameters: {
        aspectRatio: opts.aspectRatio,
        sampleCount: opts.numberOfVideos,
        durationSeconds: opts.durationSeconds,
        resolution: opts.resolution,
        personGeneration: opts.personGeneration,
        enhancePrompt: opts.enhancePrompt,
        generateAudio: opts.generateAudio,
      },
    };

    // Start the generation operation
    const operation = await this.startOperation(opts.model!, requestBody);

    // Poll until completion
    const result = await this.pollOperation(operation.name);

    // Extract video data
    const videoData = await this.extractVideoData(result);
    const generationTimeSeconds = Math.round((Date.now() - startTime) / 1000);

    return {
      videoData,
      mimeType: 'video/mp4',
      model: opts.model!,
      durationSeconds: opts.durationSeconds!,
      resolution: opts.resolution!,
      aspectRatio: opts.aspectRatio!,
      hasAudio: opts.generateAudio!,
      generationTimeSeconds,
    };
  }

  /**
   * Démarre une opération de génération vidéo
   */
  private async startOperation(
    model: string,
    requestBody: Record<string, unknown>
  ): Promise<{ name: string }> {
    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${model}:predictLongRunning`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Veo API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { name: string };
    return data;
  }

  /**
   * Poll l'opération jusqu'à completion
   */
  private async pollOperation(operationName: string): Promise<VeoOperationStatus> {
    const client = await this.auth.getClient();
    const startTime = Date.now();

    while (true) {
      // Check timeout
      if (Date.now() - startTime > MAX_POLLING_TIME_MS) {
        throw new Error(`Video generation timed out after ${MAX_POLLING_TIME_MS / 1000} seconds`);
      }

      const accessToken = await client.getAccessToken();
      const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/${operationName}`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Veo polling error: ${response.status} - ${errorText}`);
      }

      const status = await response.json() as VeoOperationStatus;

      if (status.done) {
        if (status.error) {
          throw new Error(`Veo generation failed: ${status.error.message}`);
        }
        return status;
      }

      // Wait before next poll
      await this.sleep(POLLING_INTERVAL_MS);
    }
  }

  /**
   * Extrait les données vidéo du résultat
   */
  private async extractVideoData(result: VeoOperationStatus): Promise<Buffer> {
    if (!result.response?.generatedVideos?.length) {
      throw new Error('No video generated in response');
    }

    const video = result.response.generatedVideos[0].video;

    if (video.videoBytes) {
      return Buffer.from(video.videoBytes, 'base64');
    }

    if (video.uri) {
      // Fetch from GCS URI
      return await this.fetchFromGcs(video.uri);
    }

    throw new Error('No video data or URI in response');
  }

  /**
   * Récupère une vidéo depuis GCS
   */
  private async fetchFromGcs(gcsUri: string): Promise<Buffer> {
    // gs://bucket/path -> https://storage.googleapis.com/bucket/path
    const httpUrl = gcsUri
      .replace('gs://', 'https://storage.googleapis.com/');

    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    const response = await fetch(httpUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch video from GCS: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
