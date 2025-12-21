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
  // Phase 5C: New parameters
  seed?: number;
  negativePrompt?: string;
  fps?: 24 | 30;
  safetySetting?: 'block_low_and_above' | 'block_medium_and_above' | 'block_only_high';
  // Output options
  outputMode?: 'base64' | 'url';
  gcsBucket?: string;
  gcsPathPrefix?: string;
  signedUrlExpirationHours?: number;
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
  // Phase 5C: New fields
  seedUsed?: number;
  fps?: number;
  videoUrl?: string;  // GCS signed URL if outputMode='url'
  expiresAt?: string;  // URL expiration timestamp
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

export interface VeoSafetyError {
  code: 'SAFETY_BLOCKED';
  reason: string;
  message: string;
  suggestion: string;
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
  // Phase 5C defaults
  fps: 24,
  safetySetting: 'block_medium_and_above',
  outputMode: 'base64',
  gcsPathPrefix: 'veo-videos',
  signedUrlExpirationHours: 24,
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

    // Build request body with Phase 5C parameters
    const parameters: Record<string, unknown> = {
      aspectRatio: opts.aspectRatio,
      sampleCount: opts.numberOfVideos,
      durationSeconds: opts.durationSeconds,
      resolution: opts.resolution,
      personGeneration: opts.personGeneration,
      enhancePrompt: opts.enhancePrompt,
      generateAudio: opts.generateAudio,
    };

    // Add Phase 5C parameters
    if (opts.seed !== undefined && opts.seed > 0) {
      parameters.seed = opts.seed;
    }
    if (opts.negativePrompt) {
      parameters.negativePrompt = opts.negativePrompt;
    }
    if (opts.fps) {
      parameters.fps = opts.fps;
    }
    if (opts.safetySetting) {
      parameters.safetySetting = opts.safetySetting;
    }

    const requestBody = {
      instances: [{ prompt }],
      parameters,
    };

    // Start the generation operation
    const operation = await this.startOperation(opts.model!, requestBody);

    // Poll until completion
    const result = await this.pollOperation(operation.name);

    // Extract video data
    const videoData = await this.extractVideoData(result);
    const generationTimeSeconds = Math.round((Date.now() - startTime) / 1000);

    // Handle output mode (base64 vs GCS URL)
    const outputResult = await this.handleOutput(videoData, opts);

    return {
      videoData: outputResult.videoData,
      mimeType: 'video/mp4',
      model: opts.model!,
      durationSeconds: opts.durationSeconds!,
      resolution: opts.resolution!,
      aspectRatio: opts.aspectRatio!,
      hasAudio: opts.generateAudio!,
      generationTimeSeconds,
      seedUsed: opts.seed,
      fps: opts.fps,
      videoUrl: outputResult.videoUrl,
      expiresAt: outputResult.expiresAt,
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

    // Build parameters with Phase 5C additions
    const parameters: Record<string, unknown> = {
      aspectRatio: opts.aspectRatio,
      sampleCount: opts.numberOfVideos,
      durationSeconds: opts.durationSeconds,
      resolution: opts.resolution,
      personGeneration: opts.personGeneration,
      enhancePrompt: opts.enhancePrompt,
      generateAudio: opts.generateAudio,
    };

    // Add Phase 5C parameters
    if (opts.seed !== undefined && opts.seed > 0) {
      parameters.seed = opts.seed;
    }
    if (opts.negativePrompt) {
      parameters.negativePrompt = opts.negativePrompt;
    }
    if (opts.fps) {
      parameters.fps = opts.fps;
    }
    if (opts.safetySetting) {
      parameters.safetySetting = opts.safetySetting;
    }

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
      parameters,
    };

    // Start the generation operation
    const operation = await this.startOperation(opts.model!, requestBody);

    // Poll until completion
    const result = await this.pollOperation(operation.name);

    // Extract video data
    const videoData = await this.extractVideoData(result);
    const generationTimeSeconds = Math.round((Date.now() - startTime) / 1000);

    // Handle output mode
    const outputResult = await this.handleOutput(videoData, opts);

    return {
      videoData: outputResult.videoData,
      mimeType: 'video/mp4',
      model: opts.model!,
      durationSeconds: opts.durationSeconds!,
      resolution: opts.resolution!,
      aspectRatio: opts.aspectRatio!,
      hasAudio: opts.generateAudio!,
      generationTimeSeconds,
      seedUsed: opts.seed,
      fps: opts.fps,
      videoUrl: outputResult.videoUrl,
      expiresAt: outputResult.expiresAt,
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

    const parameters: Record<string, unknown> = {
      aspectRatio: opts.aspectRatio,
      sampleCount: 1,
      durationSeconds: extensionDuration,
      resolution: opts.resolution,
      personGeneration: opts.personGeneration,
      enhancePrompt: false,  // Don't enhance for extensions
      generateAudio: opts.generateAudio,
    };

    // Add Phase 5C parameters (seed is critical for coherence)
    if (opts.seed !== undefined && opts.seed > 0) {
      parameters.seed = opts.seed;
    }
    if (opts.negativePrompt) {
      parameters.negativePrompt = opts.negativePrompt;
    }
    if (opts.fps) {
      parameters.fps = opts.fps;
    }
    if (opts.safetySetting) {
      parameters.safetySetting = opts.safetySetting;
    }

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
      parameters,
    };

    const operation = await this.startOperation(opts.model!, requestBody);
    const result = await this.pollOperation(operation.name);
    const extendedVideoData = await this.extractVideoData(result);
    const generationTimeSeconds = Math.round((Date.now() - startTime) / 1000);

    // Handle output mode
    const outputResult = await this.handleOutput(extendedVideoData, opts);

    return {
      videoData: outputResult.videoData,
      mimeType: 'video/mp4',
      model: opts.model!,
      durationSeconds: extensionDuration,
      resolution: opts.resolution!,
      aspectRatio: opts.aspectRatio!,
      hasAudio: opts.generateAudio!,
      generationTimeSeconds,
      seedUsed: opts.seed,
      fps: opts.fps,
      videoUrl: outputResult.videoUrl,
      expiresAt: outputResult.expiresAt,
    };
  }

  /**
   * Génère une vidéo longue en chaînant plusieurs clips
   * Ex: targetDuration=30 -> génère 8s + 8s + 8s + 6s = 30s
   * Phase 5C: Uses same seed for all clips to maintain visual coherence
   */
  async generateLongVideo(
    prompt: string,
    options: VeoLongVideoOptions
  ): Promise<VeoVideoResult> {
    const { targetDuration, onClipComplete, ...baseOptions } = options;
    const startTime = Date.now();

    // Phase 5C: Generate or use provided seed for coherence
    const coherenceSeed = baseOptions.seed && baseOptions.seed > 0
      ? baseOptions.seed
      : Math.floor(Math.random() * 2147483647);

    // Calculer les durées des clips nécessaires
    const clipDurations = this.calculateClipDurations(targetDuration);
    const totalClips = clipDurations.length;

    // Générer le premier clip with seed
    const firstClipDuration = clipDurations[0] as 4 | 6 | 8;
    let currentVideo = await this.generateFromText(prompt, {
      ...baseOptions,
      durationSeconds: firstClipDuration,
      seed: coherenceSeed,
      outputMode: 'base64', // Keep intermediate clips as base64
    });

    let totalDuration = firstClipDuration;
    const allClipDurations: number[] = [firstClipDuration];

    if (onClipComplete) {
      onClipComplete(1, totalClips, totalDuration);
    }

    // Étendre avec les clips suivants using same seed
    for (let i = 1; i < clipDurations.length; i++) {
      const extensionDuration = clipDurations[i] as 4 | 6 | 8;

      const extendedResult = await this.extendVideo(
        currentVideo.videoData,
        extensionDuration,
        {
          ...baseOptions,
          extensionPrompt: `Continue the scene: ${prompt}`,
          seed: coherenceSeed,  // Same seed for coherence
          outputMode: 'base64', // Keep intermediate clips as base64
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

    // Handle final output mode (only upload final concatenated video)
    const outputResult = await this.handleOutput(currentVideo.videoData, baseOptions);

    return {
      videoData: outputResult.videoData,
      mimeType: 'video/mp4',
      model: baseOptions.model || DEFAULT_OPTIONS.model!,
      durationSeconds: totalDuration,
      resolution: baseOptions.resolution || DEFAULT_OPTIONS.resolution!,
      aspectRatio: baseOptions.aspectRatio || DEFAULT_OPTIONS.aspectRatio!,
      hasAudio: baseOptions.generateAudio ?? DEFAULT_OPTIONS.generateAudio!,
      generationTimeSeconds,
      clipCount: totalClips,
      clipDurations: allClipDurations,
      seedUsed: coherenceSeed,
      fps: baseOptions.fps,
      videoUrl: outputResult.videoUrl,
      expiresAt: outputResult.expiresAt,
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
   * Phase 5C: Enhanced error handling with safety filter detection
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

      // Phase 5C: Check for safety filter errors
      const safetyError = this.parseSafetyError(errorText);
      if (safetyError) {
        const error = new Error(
          `${safetyError.message}. ${safetyError.suggestion}`
        ) as Error & { safetyError: VeoSafetyError };
        error.safetyError = safetyError;
        throw error;
      }

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

  /**
   * Phase 5C: Handle output mode (base64 vs GCS URL)
   */
  private async handleOutput(
    videoData: Buffer,
    options: VeoVideoOptions
  ): Promise<{ videoData: Buffer; videoUrl?: string; expiresAt?: string }> {
    if (options.outputMode !== 'url' || !options.gcsBucket) {
      return { videoData };
    }

    // Upload to GCS and return signed URL
    const { signedUrl, expiresAt } = await this.uploadToGcs(
      videoData,
      options.gcsBucket,
      options.gcsPathPrefix || 'veo-videos',
      options.signedUrlExpirationHours || 24
    );

    return {
      videoData,
      videoUrl: signedUrl,
      expiresAt,
    };
  }

  /**
   * Phase 5C: Upload video to GCS and return signed URL
   */
  private async uploadToGcs(
    videoData: Buffer,
    bucketName: string,
    pathPrefix: string,
    expirationHours: number
  ): Promise<{ signedUrl: string; expiresAt: string; gcsPath: string }> {
    const { Storage } = await import('@google-cloud/storage');

    // Use the same auth as the main client
    const storage = new Storage({
      projectId: this.projectId,
      authClient: this.auth,
    });

    const bucket = storage.bucket(bucketName);
    const timestamp = Date.now();
    const filename = `${pathPrefix}/${timestamp}-video.mp4`;
    const file = bucket.file(filename);

    // Upload the video
    await file.save(videoData, {
      contentType: 'video/mp4',
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });

    // Generate signed URL
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expiresAt,
    });

    return {
      signedUrl,
      expiresAt: expiresAt.toISOString(),
      gcsPath: `gs://${bucketName}/${filename}`,
    };
  }

  /**
   * Phase 5C: Parse safety filter errors from API response
   */
  private parseSafetyError(errorText: string): VeoSafetyError | null {
    const safetyReasons: Record<string, { message: string; suggestion: string }> = {
      'SAFETY_REASON_VULGARITY': {
        message: 'Le prompt contient du contenu vulgaire',
        suggestion: 'Reformulez le prompt pour éviter le langage grossier',
      },
      'SAFETY_REASON_VIOLENCE': {
        message: 'Le prompt contient du contenu violent',
        suggestion: 'Reformulez le prompt pour éviter les éléments violents',
      },
      'SAFETY_REASON_SEXUAL': {
        message: 'Le prompt contient du contenu sexuel',
        suggestion: 'Reformulez le prompt pour éviter le contenu sexuel explicite',
      },
      'SAFETY_REASON_DANGEROUS': {
        message: 'Le prompt contient du contenu dangereux',
        suggestion: 'Reformulez le prompt pour éviter les activités dangereuses',
      },
      'SAFETY_REASON_HARASSMENT': {
        message: 'Le prompt contient du harcèlement',
        suggestion: 'Reformulez le prompt pour éviter le contenu offensant',
      },
      'SAFETY_REASON_HATE': {
        message: 'Le prompt contient du contenu haineux',
        suggestion: 'Reformulez le prompt pour éviter le discours de haine',
      },
    };

    for (const [reason, details] of Object.entries(safetyReasons)) {
      if (errorText.includes(reason)) {
        return {
          code: 'SAFETY_BLOCKED',
          reason,
          message: details.message,
          suggestion: details.suggestion,
        };
      }
    }

    // Generic safety error
    if (errorText.toLowerCase().includes('safety') || errorText.toLowerCase().includes('blocked')) {
      return {
        code: 'SAFETY_BLOCKED',
        reason: 'SAFETY_REASON_UNKNOWN',
        message: 'Le prompt a été bloqué par les filtres de sécurité',
        suggestion: 'Reformulez le prompt pour éviter le contenu sensible',
      };
    }

    return null;
  }
}
