/**
 * Client spécialisé pour Gemini 2.5 Flash Image ("Nano Banana")
 * Utilise responseModalities: ["IMAGE"] pour la génération d'images
 */

export interface GeminiImageConfig {
  projectId?: string;
  location?: string;
  apiKey?: string;
  serviceAccountKey?: string;
}

export interface GeminiImageOptions {
  model?: string;
  aspectRatio?: '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  outputFormat?: 'png' | 'webp' | 'jpeg';
  includeTextFeedback?: boolean;
}

export interface GeminiImageResult {
  imageData: Buffer;
  mimeType: string;
  width?: number;
  height?: number;
  textFeedback?: string;
  model: string;
}

export interface ReferenceImage {
  data: string; // base64
  mimeType: string;
  role?: string; // ex: "character", "background"
}

const DEFAULT_MODEL = 'gemini-2.5-flash-preview-native-audio-dialog';
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-preview-native-audio-dialog'; // Nano Banana

/**
 * Réponse de l'API Gemini avec image
 */
interface GeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: {
          mimeType: string;
          data: string;
        };
      }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

/**
 * Client pour Gemini Image (Nano Banana)
 */
export class GeminiImageClient {
  private config: GeminiImageConfig;
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: GeminiImageConfig) {
    this.config = config;

    if (config.apiKey) {
      // Mode AI Studio
      this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
      this.headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      };
    } else if (config.projectId) {
      // Mode Vertex AI
      const location = config.location || 'global';
      this.baseUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${location}`;
      this.headers = {
        'Content-Type': 'application/json',
      };
    } else {
      throw new Error('Configuration invalide: fournir apiKey (AI Studio) ou projectId (Vertex AI)');
    }
  }

  /**
   * Génère une image à partir d'un prompt
   */
  async generate(
    prompt: string,
    options?: GeminiImageOptions
  ): Promise<GeminiImageResult> {
    const opts = {
      model: DEFAULT_MODEL,
      aspectRatio: '16:9' as const,
      outputFormat: 'png' as const,
      includeTextFeedback: false,
      ...options,
    };

    const responseModalities = opts.includeTextFeedback ? ['IMAGE', 'TEXT'] : ['IMAGE'];

    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities,
        ...(opts.aspectRatio && {
          imageConfig: {
            aspectRatio: opts.aspectRatio,
          },
        }),
      },
    };

    const response = await this.request<GeminiImageResponse>(
      this.getEndpoint(opts.model),
      body
    );

    return this.parseImageResponse(response, opts.model);
  }

  /**
   * Génère une image à partir d'images de référence et d'un prompt
   */
  async generateWithReferences(
    referenceImages: ReferenceImage[],
    prompt: string,
    options?: GeminiImageOptions
  ): Promise<GeminiImageResult> {
    const opts = {
      model: DEFAULT_MODEL,
      aspectRatio: '16:9' as const,
      outputFormat: 'png' as const,
      includeTextFeedback: false,
      ...options,
    };

    const responseModalities = opts.includeTextFeedback ? ['IMAGE', 'TEXT'] : ['IMAGE'];

    // Construire les parts avec les images de référence
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    // Ajouter les images de référence
    referenceImages.forEach((img, index) => {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data,
        },
      });
    });

    // Ajouter le prompt
    parts.push({ text: prompt });

    const body = {
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
      generationConfig: {
        responseModalities,
        ...(opts.aspectRatio && {
          imageConfig: {
            aspectRatio: opts.aspectRatio,
          },
        }),
      },
    };

    const response = await this.request<GeminiImageResponse>(
      this.getEndpoint(opts.model),
      body
    );

    return this.parseImageResponse(response, opts.model);
  }

  /**
   * Extrait un personnage d'une image (fond transparent)
   * Basé sur le pattern du Colab: extraction propre avec fond blanc/transparent
   */
  async extractCharacter(
    sourceImage: ReferenceImage,
    characterDescription: string,
    options?: GeminiImageOptions & {
      backgroundType?: 'transparent' | 'white' | 'solid';
      backgroundColor?: string;
    }
  ): Promise<GeminiImageResult> {
    const bgType = options?.backgroundType || 'white';
    let bgInstruction = '- Background: Pure white.';
    if (bgType === 'transparent') {
      bgInstruction = '- Background: Transparent (PNG with alpha channel).';
    } else if (bgType === 'solid' && options?.backgroundColor) {
      bgInstruction = `- Background: Solid ${options.backgroundColor} fill.`;
    }

    const prompt = `
- Image 1: Source image containing the character.
- Scene: Character extraction.
- Extract ${characterDescription} from Image 1.
- The character should be cleanly extracted, centered, and properly cropped.
- Preserve all details, textures, and fine edges of the character.
${bgInstruction}
- Style: Keep the exact same visual style as the original.
`.trim();

    return this.generateWithReferences([sourceImage], prompt, {
      ...options,
      outputFormat: 'png', // PNG pour transparence
    });
  }

  /**
   * Crée un character sheet (vues multiples)
   * Basé sur le pattern du Colab avec layout structuré et labels
   */
  async createCharacterSheet(
    sourceImage: ReferenceImage,
    views: string[],
    options?: GeminiImageOptions & {
      characterName?: string;
      includeLabels?: boolean;
      additionalDetails?: string;
    }
  ): Promise<GeminiImageResult> {
    // Positions for different view counts
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
      return `- ${pos}: ${v.charAt(0).toUpperCase() + v.slice(1)} view of the character.`;
    }).join('\n');

    const characterTitle = options?.characterName
      ? `"${options.characterName.toUpperCase()} CHARACTER SHEET"`
      : '"CHARACTER SHEET"';

    const labels = views.map(v => `"${v.toUpperCase()} VIEW"`).join(', ');
    const labelInstruction = options?.includeLabels !== false
      ? `- Text: On the top, caption the image ${characterTitle} and, on the bottom, label each view (${labels}).`
      : '';

    const additionalDetails = options?.additionalDetails
      ? `- ${options.additionalDetails}`
      : '';

    const prompt = `
- Image 1: Source image of the character.
- Scene: Character sheet generation.
${viewsText}
- Background: Pure white.
- Maintain consistent style, proportions, colors, and details across all views.
- Each view should show the same character from different angles.
${labelInstruction}
${additionalDetails}
`.trim();

    return this.generateWithReferences([sourceImage], prompt, {
      ...options,
      aspectRatio: options?.aspectRatio || '16:9', // Landscape pour character sheet
    });
  }

  /**
   * Compose une scène avec images de référence
   * Basé sur le pattern du Colab avec annotations d'images et prompts structurés
   */
  async composeScene(
    referenceImages: ReferenceImage[],
    scenePrompt: string,
    options?: GeminiImageOptions & {
      promptStyle?: 'descriptive' | 'imperative';
      lighting?: string;
      cameraAngle?: string;
      preserveElements?: string[];
      removeElements?: string[];
    }
  ): Promise<GeminiImageResult> {
    // Construire les références d'images avec le format du Colab
    const imageRefs = referenceImages.map((img, i) =>
      `- Image ${i + 1}: ${img.role || 'Reference image'}.`
    ).join('\n');

    // Instructions de préservation/suppression (pattern du Colab)
    const preserveInstructions = options?.preserveElements?.length
      ? options.preserveElements.map(e => `- Keep ${e} from the reference images.`).join('\n')
      : '';

    const removeInstructions = options?.removeElements?.length
      ? options.removeElements.map(e => `- Remove ${e}.`).join('\n')
      : '';

    // Lighting instruction
    const lightingInstruction = options?.lighting
      ? `- Lighting: ${options.lighting}.`
      : '';

    // Camera angle instruction
    const cameraInstruction = options?.cameraAngle
      ? `- Camera angle: ${options.cameraAngle}.`
      : '';

    // Style du prompt (descriptif par défaut comme dans le Colab)
    const styleNote = options?.promptStyle === 'imperative'
      ? '- [Imperative mode: following action-based instructions]'
      : '';

    const prompt = `
${imageRefs}
${styleNote}
${removeInstructions}
- Scene: ${scenePrompt}
${preserveInstructions}
- Maintain visual consistency with the reference images.
- Use the same style, textures, and proportions as the references.
${lightingInstruction}
${cameraInstruction}
`.trim().replace(/\n{3,}/g, '\n\n');

    return this.generateWithReferences(referenceImages, prompt, options);
  }

  // =========================================================================
  // Méthodes privées
  // =========================================================================

  private getEndpoint(model: string): string {
    if (this.config.apiKey) {
      return `/models/${model}:generateContent`;
    } else {
      return `/publishers/google/models/${model}:generateContent`;
    }
  }

  private parseImageResponse(response: GeminiImageResponse, model: string): GeminiImageResult {
    const candidate = response.candidates?.[0];
    if (!candidate?.content?.parts) {
      throw new Error('No content in response');
    }

    let imageData: Buffer | null = null;
    let mimeType = 'image/png';
    let textFeedback: string | undefined;

    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        imageData = Buffer.from(part.inlineData.data, 'base64');
        mimeType = part.inlineData.mimeType;
      }
      if (part.text) {
        textFeedback = part.text;
      }
    }

    if (!imageData) {
      throw new Error('No image in response');
    }

    return {
      imageData,
      mimeType,
      textFeedback,
      model,
    };
  }

  private async request<T>(endpoint: string, body: unknown): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

    const headers = { ...this.headers };

    // Pour Vertex AI, ajouter le token d'accès
    if (!this.config.apiKey) {
      const accessToken = await this.getAccessToken();
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
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
 * Factory pour créer un client avec API Key (AI Studio)
 */
export function createGeminiImageClientAiStudio(apiKey: string): GeminiImageClient {
  return new GeminiImageClient({ apiKey });
}

/**
 * Factory pour créer un client avec Vertex AI
 */
export function createGeminiImageClientVertexAi(
  projectId: string,
  location: string = 'global',
  serviceAccountKey?: string
): GeminiImageClient {
  return new GeminiImageClient({
    projectId,
    location,
    serviceAccountKey,
  });
}
