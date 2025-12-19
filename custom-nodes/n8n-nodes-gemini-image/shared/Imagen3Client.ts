/**
 * Client pour Imagen 3 (Vertex AI)
 * Remplace GeminiImageClient pour utiliser les modèles Imagen 3 stables
 *
 * Modèles disponibles:
 * - imagen-3.0-generate-002: Génération haute qualité (20/min)
 * - imagen-3.0-fast-generate-001: Génération rapide (200/min)
 * - imagen-3.0-capability-001: Édition d'images (inpainting, outpainting)
 */

export interface Imagen3Config {
  projectId: string;
  location?: string;
  serviceAccountKey?: string;
}

export interface Imagen3GenerateOptions {
  model?: 'imagen-3.0-generate-002' | 'imagen-3.0-fast-generate-001';
  aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
  outputFormat?: 'image/png' | 'image/jpeg' | 'image/webp';
  sampleCount?: number;
  negativePrompt?: string;
  seed?: number;
  safetySetting?: 'block_low_and_above' | 'block_medium_and_above' | 'block_only_high';
  personGeneration?: 'allow_adult' | 'dont_allow';
  enhancePrompt?: boolean;
  addWatermark?: boolean;
  storageUri?: string; // gs://bucket/path for direct GCS upload
  includeTextFeedback?: boolean;
}

export interface Imagen3EditOptions {
  model?: 'imagen-3.0-capability-001';
  editMode?: 'inpainting' | 'outpainting' | 'product-image';
  sampleCount?: number;
  negativePrompt?: string;
  seed?: number;
  safetySetting?: 'block_low_and_above' | 'block_medium_and_above' | 'block_only_high';
  outputFormat?: 'image/png' | 'image/jpeg' | 'image/webp';
}

export interface Imagen3Result {
  imageData: Buffer;
  mimeType: string;
  seed?: number;
  model: string;
  textFeedback?: string;
}

export interface ReferenceImage {
  data: string; // base64
  mimeType: string;
  role?: string;
}

export interface MaskImage {
  data: string; // base64
  mimeType: string;
}

// Models constants
const IMAGEN_GENERATE_MODEL = 'imagen-3.0-generate-002';
const IMAGEN_FAST_MODEL = 'imagen-3.0-fast-generate-001';
const IMAGEN_EDIT_MODEL = 'imagen-3.0-capability-001';

// Default values
const DEFAULT_OPTIONS: Partial<Imagen3GenerateOptions> = {
  model: IMAGEN_GENERATE_MODEL,
  aspectRatio: '16:9',
  outputFormat: 'image/png',
  sampleCount: 1,
  safetySetting: 'block_medium_and_above',
  personGeneration: 'allow_adult',
  enhancePrompt: false,
  addWatermark: false,
  includeTextFeedback: true,
};

/**
 * Response structure from Imagen 3 API
 */
interface Imagen3PredictResponse {
  predictions?: Array<{
    bytesBase64Encoded?: string;
    mimeType?: string;
    seed?: number;
  }>;
  metadata?: {
    requestId?: string;
  };
}

/**
 * Client pour Imagen 3
 */
export class Imagen3Client {
  private config: Imagen3Config;
  private baseUrl: string;

  constructor(config: Imagen3Config) {
    if (!config.projectId) {
      throw new Error('projectId is required for Imagen 3');
    }

    this.config = config;
    const location = config.location || 'us-central1';
    this.baseUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${location}`;
  }

  /**
   * Génère une image à partir d'un prompt (haute qualité)
   */
  async generate(
    prompt: string,
    options?: Imagen3GenerateOptions
  ): Promise<Imagen3Result> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const model = opts.model || IMAGEN_GENERATE_MODEL;

    const body = this.buildGenerateRequest(prompt, opts);
    const response = await this.predict<Imagen3PredictResponse>(model, body);

    return this.parseGenerateResponse(response, model);
  }

  /**
   * Génère une image rapidement (10x quota)
   */
  async generateFast(
    prompt: string,
    options?: Omit<Imagen3GenerateOptions, 'model'>
  ): Promise<Imagen3Result> {
    return this.generate(prompt, { ...options, model: IMAGEN_FAST_MODEL });
  }

  /**
   * Édite une image (inpainting, outpainting, etc.)
   */
  async edit(
    sourceImage: ReferenceImage,
    prompt: string,
    mask?: MaskImage,
    options?: Imagen3EditOptions
  ): Promise<Imagen3Result> {
    const model = options?.model || IMAGEN_EDIT_MODEL;
    const editMode = options?.editMode || 'inpainting';

    const body = this.buildEditRequest(sourceImage, prompt, mask, editMode, options);
    const response = await this.predict<Imagen3PredictResponse>(model, body);

    return this.parseGenerateResponse(response, model);
  }

  /**
   * Extrait un personnage d'une image (utilise l'édition avec inpainting)
   */
  async extractCharacter(
    sourceImage: ReferenceImage,
    characterDescription: string,
    options?: Imagen3EditOptions & {
      backgroundType?: 'transparent' | 'white' | 'solid';
      backgroundColor?: string;
    }
  ): Promise<Imagen3Result> {
    const bgType = options?.backgroundType || 'white';
    let bgInstruction = 'Background: Pure white.';
    if (bgType === 'transparent') {
      bgInstruction = 'Background: Transparent (PNG with alpha channel).';
    } else if (bgType === 'solid' && options?.backgroundColor) {
      bgInstruction = `Background: Solid ${options.backgroundColor} fill.`;
    }

    const prompt = `Extract ${characterDescription} from this image.
The character should be cleanly extracted, centered, and properly cropped.
Preserve all details, textures, and fine edges of the character.
${bgInstruction}
Keep the exact same visual style as the original.`;

    // Pour l'extraction, on utilise l'édition sans mask (le modèle comprend)
    return this.edit(sourceImage, prompt, undefined, {
      ...options,
      editMode: 'inpainting',
    });
  }

  /**
   * Crée un character sheet (vues multiples)
   */
  async createCharacterSheet(
    sourceImage: ReferenceImage,
    views: string[],
    options?: Imagen3GenerateOptions & {
      characterName?: string;
      includeLabels?: boolean;
      additionalDetails?: string;
    }
  ): Promise<Imagen3Result> {
    const getPositions = (count: number): string[] => {
      if (count === 1) return ['Center'];
      if (count === 2) return ['Left', 'Right'];
      if (count === 3) return ['Left', 'Center', 'Right'];
      if (count === 4) return ['Far left', 'Left', 'Right', 'Far right'];
      return views.map((_, i) => `Position ${i + 1}`);
    };

    const positions = getPositions(views.length);
    const viewsText = views.map((v, i) => {
      const pos = positions[i] || `Position ${i + 1}`;
      return `${pos}: ${v.charAt(0).toUpperCase() + v.slice(1)} view of the character.`;
    }).join('\n');

    const characterTitle = options?.characterName
      ? `"${options.characterName.toUpperCase()} CHARACTER SHEET"`
      : '"CHARACTER SHEET"';

    const labels = views.map(v => `"${v.toUpperCase()} VIEW"`).join(', ');
    const labelInstruction = options?.includeLabels !== false
      ? `Text: On the top, caption the image ${characterTitle} and, on the bottom, label each view (${labels}).`
      : '';

    const additionalDetails = options?.additionalDetails
      ? options.additionalDetails
      : '';

    // Pour le character sheet, on génère à partir du prompt avec l'image comme référence
    const prompt = `A professional character concept sheet of the character shown in the reference image.
Full body views arranged horizontally:
${viewsText}
Background: Pure white.
Maintain consistent style, proportions, colors, and details across all views.
Each view should show the same character from different angles.
${labelInstruction}
${additionalDetails}
Standing in a neutral T-pose, consistent clothing and colors across all views, clean white background, cinematic lighting, high resolution, 8k.`;

    // Utiliser le même seed pour la cohérence entre vues
    const seed = options?.seed || Math.floor(Math.random() * 2147483647);

    return this.generate(prompt, {
      ...options,
      aspectRatio: options?.aspectRatio || '16:9',
      seed,
    });
  }

  /**
   * Compose une scène avec images de référence
   */
  async composeScene(
    referenceImages: ReferenceImage[],
    scenePrompt: string,
    options?: Imagen3EditOptions & {
      lighting?: string;
      cameraAngle?: string;
      preserveElements?: string[];
      removeElements?: string[];
    }
  ): Promise<Imagen3Result> {
    if (referenceImages.length === 0) {
      throw new Error('At least one reference image is required');
    }

    // Construire les références d'images
    const imageRefs = referenceImages.map((img, i) =>
      `Image ${i + 1}: ${img.role || 'Reference image'}.`
    ).join('\n');

    const preserveInstructions = options?.preserveElements?.length
      ? options.preserveElements.map(e => `Keep ${e} from the reference images.`).join('\n')
      : '';

    const removeInstructions = options?.removeElements?.length
      ? options.removeElements.map(e => `Remove ${e}.`).join('\n')
      : '';

    const lightingInstruction = options?.lighting
      ? `Lighting: ${options.lighting}.`
      : '';

    const cameraInstruction = options?.cameraAngle
      ? `Camera angle: ${options.cameraAngle}.`
      : '';

    const prompt = `${imageRefs}
${removeInstructions}
Scene: ${scenePrompt}
${preserveInstructions}
Maintain visual consistency with the reference images.
Use the same style, textures, and proportions as the references.
${lightingInstruction}
${cameraInstruction}`.trim().replace(/\n{3,}/g, '\n\n');

    // Utiliser l'image principale comme base pour l'édition
    return this.edit(referenceImages[0], prompt, undefined, options);
  }

  // =========================================================================
  // Méthodes privées
  // =========================================================================

  private buildGenerateRequest(
    prompt: string,
    options: Imagen3GenerateOptions
  ): unknown {
    const parameters: Record<string, unknown> = {
      sampleCount: options.sampleCount || 1,
    };

    if (options.aspectRatio) {
      parameters.aspectRatio = options.aspectRatio;
    }

    if (options.negativePrompt) {
      parameters.negativePrompt = options.negativePrompt;
    }

    if (options.seed !== undefined) {
      parameters.seed = options.seed;
    }

    if (options.safetySetting) {
      parameters.safetySetting = options.safetySetting;
    }

    if (options.personGeneration) {
      parameters.personGeneration = options.personGeneration;
    }

    if (options.enhancePrompt !== undefined) {
      parameters.enhancePrompt = options.enhancePrompt;
    }

    if (options.addWatermark !== undefined) {
      parameters.addWatermark = options.addWatermark;
    }

    if (options.storageUri) {
      parameters.storageUri = options.storageUri;
    }

    if (options.outputFormat) {
      parameters.outputOptions = {
        mimeType: options.outputFormat,
      };
    }

    return {
      instances: [
        {
          prompt,
        },
      ],
      parameters,
    };
  }

  private buildEditRequest(
    sourceImage: ReferenceImage,
    prompt: string,
    mask: MaskImage | undefined,
    editMode: string,
    options?: Imagen3EditOptions
  ): unknown {
    const instance: Record<string, unknown> = {
      prompt,
      image: {
        bytesBase64Encoded: sourceImage.data,
      },
    };

    if (mask) {
      instance.mask = {
        bytesBase64Encoded: mask.data,
      };
    }

    const parameters: Record<string, unknown> = {
      editMode,
      sampleCount: options?.sampleCount || 1,
    };

    if (options?.negativePrompt) {
      parameters.negativePrompt = options.negativePrompt;
    }

    if (options?.seed !== undefined) {
      parameters.seed = options.seed;
    }

    if (options?.safetySetting) {
      parameters.safetySetting = options.safetySetting;
    }

    if (options?.outputFormat) {
      parameters.outputOptions = {
        mimeType: options.outputFormat,
      };
    }

    return {
      instances: [instance],
      parameters,
    };
  }

  private parseGenerateResponse(response: Imagen3PredictResponse, model: string): Imagen3Result {
    const prediction = response.predictions?.[0];
    if (!prediction?.bytesBase64Encoded) {
      throw new Error('No image in response');
    }

    return {
      imageData: Buffer.from(prediction.bytesBase64Encoded, 'base64'),
      mimeType: prediction.mimeType || 'image/png',
      seed: prediction.seed,
      model,
    };
  }

  private async predict<T>(model: string, body: unknown): Promise<T> {
    const endpoint = `${this.baseUrl}/publishers/google/models/${model}:predict`;

    const accessToken = await this.getAccessToken();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();

      // Parse safety filter errors
      if (response.status === 400) {
        const safetyMatch = errorText.match(/SAFETY_REASON_(\w+)/);
        if (safetyMatch) {
          throw new Error(`Image generation blocked by safety filter: ${safetyMatch[0]}. Please reformulate your prompt.`);
        }
      }

      throw new Error(`Imagen 3 API error: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  private async getAccessToken(): Promise<string> {
    const { GoogleAuth } = await import('google-auth-library');

    let auth: InstanceType<typeof GoogleAuth>;

    if (this.config.serviceAccountKey) {
      const credentials = typeof this.config.serviceAccountKey === 'string'
        ? JSON.parse(this.config.serviceAccountKey)
        : this.config.serviceAccountKey;

      auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    } else {
      auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        projectId: this.config.projectId,
      });
    }

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();

    if (!tokenResponse.token) {
      throw new Error('Failed to get access token');
    }

    return tokenResponse.token;
  }
}

/**
 * Factory pour créer un client Imagen 3
 */
export function createImagen3Client(
  projectId: string,
  location: string = 'us-central1',
  serviceAccountKey?: string
): Imagen3Client {
  return new Imagen3Client({
    projectId,
    location,
    serviceAccountKey,
  });
}

/**
 * Constants exportés pour utilisation externe
 */
export const IMAGEN3_MODELS = {
  GENERATE: IMAGEN_GENERATE_MODEL,
  FAST: IMAGEN_FAST_MODEL,
  EDIT: IMAGEN_EDIT_MODEL,
} as const;

export const IMAGEN3_ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'] as const;
export type Imagen3AspectRatio = typeof IMAGEN3_ASPECT_RATIOS[number];

export const IMAGEN3_SAFETY_SETTINGS = [
  'block_low_and_above',
  'block_medium_and_above',
  'block_only_high',
] as const;
export type Imagen3SafetySetting = typeof IMAGEN3_SAFETY_SETTINGS[number];
