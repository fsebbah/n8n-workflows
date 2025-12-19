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
  clipCount?: number;  // For long videos: number of clips generated
  clipDurations?: number[];  // Duration of each clip
}

export interface VeoExtendOptions extends VeoVideoOptions {
  extensionPrompt?: string;  // Optional prompt for the extension
}

export interface VeoLongVideoOptions extends VeoVideoOptions {
  targetDuration: number;  // Total desired duration in seconds
  onClipComplete?: (clipNumber: number, totalClips: number, currentDuration: number) => void;
}

export interface PromptOptimizationResult {
  originalPrompt: string;
  optimizedPrompt: string;
  keywordsAdded: string[];
  preset?: string;
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
   * Étend une vidéo existante
   * Permet de créer des vidéos plus longues en chaînant les clips
   */
  async extendVideo(
    videoData: Buffer,
    extensionDuration: 4 | 6 | 8,
    options?: VeoExtendOptions
  ): Promise<VeoVideoResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = Date.now();

    const videoBase64 = videoData.toString('base64');
    const requestBody = {
      instances: [
        {
          prompt: options?.extensionPrompt || 'Continue the video seamlessly',
          video: {
            bytesBase64Encoded: videoBase64,
            mimeType: 'video/mp4',
          },
        },
      ],
      parameters: {
        aspectRatio: opts.aspectRatio,
        sampleCount: 1,
        durationSeconds: extensionDuration,
        resolution: opts.resolution,
        personGeneration: opts.personGeneration,
        enhancePrompt: false,  // Don't enhance for extensions
        generateAudio: opts.generateAudio,
      },
    };

    const operation = await this.startOperation(opts.model!, requestBody);
    const result = await this.pollOperation(operation.name);
    const extendedVideoData = await this.extractVideoData(result);
    const generationTimeSeconds = Math.round((Date.now() - startTime) / 1000);

    return {
      videoData: extendedVideoData,
      mimeType: 'video/mp4',
      model: opts.model!,
      durationSeconds: extensionDuration,
      resolution: opts.resolution!,
      aspectRatio: opts.aspectRatio!,
      hasAudio: opts.generateAudio!,
      generationTimeSeconds,
    };
  }

  /**
   * Génère une vidéo longue en chaînant plusieurs clips
   * Ex: targetDuration=30 -> génère 8s + 8s + 8s + 6s = 30s
   */
  async generateLongVideo(
    prompt: string,
    options: VeoLongVideoOptions
  ): Promise<VeoVideoResult> {
    const { targetDuration, onClipComplete, ...baseOptions } = options;
    const startTime = Date.now();

    // Calculer les durées des clips nécessaires
    const clipDurations = this.calculateClipDurations(targetDuration);
    const totalClips = clipDurations.length;

    // Générer le premier clip
    const firstClipDuration = clipDurations[0] as 4 | 6 | 8;
    let currentVideo = await this.generateFromText(prompt, {
      ...baseOptions,
      durationSeconds: firstClipDuration,
    });

    let totalDuration = firstClipDuration;
    const allClipDurations: number[] = [firstClipDuration];

    if (onClipComplete) {
      onClipComplete(1, totalClips, totalDuration);
    }

    // Étendre avec les clips suivants
    for (let i = 1; i < clipDurations.length; i++) {
      const extensionDuration = clipDurations[i] as 4 | 6 | 8;

      const extendedResult = await this.extendVideo(
        currentVideo.videoData,
        extensionDuration,
        {
          ...baseOptions,
          extensionPrompt: `Continue the scene: ${prompt}`,
        }
      );

      currentVideo = extendedResult;
      totalDuration += extensionDuration;
      allClipDurations.push(extensionDuration);

      if (onClipComplete) {
        onClipComplete(i + 1, totalClips, totalDuration);
      }
    }

    const generationTimeSeconds = Math.round((Date.now() - startTime) / 1000);

    return {
      videoData: currentVideo.videoData,
      mimeType: 'video/mp4',
      model: baseOptions.model || DEFAULT_OPTIONS.model!,
      durationSeconds: totalDuration,
      resolution: baseOptions.resolution || DEFAULT_OPTIONS.resolution!,
      aspectRatio: baseOptions.aspectRatio || DEFAULT_OPTIONS.aspectRatio!,
      hasAudio: baseOptions.generateAudio ?? DEFAULT_OPTIONS.generateAudio!,
      generationTimeSeconds,
      clipCount: totalClips,
      clipDurations: allClipDurations,
    };
  }

  /**
   * Calcule les durées optimales des clips pour atteindre la durée cible
   * Privilégie les clips de 8s pour minimiser le nombre d'appels API
   */
  private calculateClipDurations(targetDuration: number): number[] {
    if (targetDuration <= 8) {
      // Durée simple
      if (targetDuration <= 4) return [4];
      if (targetDuration <= 6) return [6];
      return [8];
    }

    const durations: number[] = [];
    let remaining = targetDuration;

    // Utiliser des clips de 8s autant que possible
    while (remaining > 0) {
      if (remaining >= 8) {
        durations.push(8);
        remaining -= 8;
      } else if (remaining >= 6) {
        durations.push(6);
        remaining -= 6;
      } else if (remaining >= 4) {
        durations.push(4);
        remaining -= 4;
      } else {
        // Ajuster le dernier clip pour atteindre exactement la durée
        // Si on a un reste < 4, on ajoute au dernier clip ou on ajuste
        if (durations.length > 0) {
          // On ne peut pas faire moins de 4s, donc on arrondit
          break;
        } else {
          durations.push(4);
          break;
        }
      }
    }

    return durations;
  }

  /**
   * Optimise un prompt pour la génération vidéo avec Gemini
   */
  async optimizePrompt(
    prompt: string,
    preset?: string,
    presetConfig?: Record<string, unknown>
  ): Promise<PromptOptimizationResult> {
    const client = await this.auth.getClient();
    const accessToken = await client.getAccessToken();

    // Construire le prompt système pour Gemini
    const systemPrompt = `You are an expert video prompt engineer for Google's Veo 3 model.
Your task is to enhance the given prompt to create a more detailed, cinematic video description.
Include specific details about:
- Camera angles and movements (dolly, pan, tilt, crane)
- Lighting conditions
- Visual style and atmosphere
- Temporal elements and pacing
- Audio cues if applicable

Keep the output concise (2-3 sentences max).
Output ONLY the enhanced prompt, no explanations.`;

    let userPrompt = `Enhance this video prompt: "${prompt}"`;

    if (preset && presetConfig) {
      userPrompt += `\n\nApply this style: ${preset}`;
      if (presetConfig.style) userPrompt += `\nStyle: ${presetConfig.style}`;
      if (presetConfig.camera_movement) userPrompt += `\nCamera: ${presetConfig.camera_movement}`;
      if (presetConfig.prompt_prefix) userPrompt += `\nPrefix: ${presetConfig.prompt_prefix}`;
      if (presetConfig.prompt_suffix) userPrompt += `\nSuffix: ${presetConfig.prompt_suffix}`;
    }

    const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/gemini-2.0-flash:generateContent`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      candidates: Array<{
        content: {
          parts: Array<{ text: string }>;
        };
      }>;
    };

    const optimizedPrompt = data.candidates?.[0]?.content?.parts?.[0]?.text || prompt;

    // Extraire les mots-clés ajoutés (simplification)
    const originalWords = new Set(prompt.toLowerCase().split(/\s+/));
    const newWords = optimizedPrompt.toLowerCase().split(/\s+/);
    const keywordsAdded = newWords
      .filter(word => !originalWords.has(word) && word.length > 4)
      .slice(0, 10);

    return {
      originalPrompt: prompt,
      optimizedPrompt,
      keywordsAdded,
      preset,
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
