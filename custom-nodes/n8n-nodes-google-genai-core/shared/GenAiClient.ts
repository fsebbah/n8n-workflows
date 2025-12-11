/**
 * Client wrapper pour les APIs Google GenAI (Vertex AI et AI Studio)
 * Supporte Gemini (texte/image) et Veo (vidéo)
 */

import {
  GenAiConfig,
  TextGenerationResult,
  ImageGenerationResult,
  VideoGenerationResult,
  TextGenerationOptions,
  ImageGenerationOptions,
  VideoGenerationOptions,
  GeminiModel,
  OperationStatus,
} from './types';
import { parseGoogleApiError, GenAiNodeError, withErrorHandling } from './ErrorHandler';
import { parseGoogleOperationStatus } from './PollingHelper';

/**
 * Interfaces pour les réponses API Google
 */
interface GeminiTextResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

interface ImagenResponse {
  predictions?: Array<{
    bytesBase64Encoded?: string;
  }>;
}

interface LongRunningOperationResponse {
  name?: string;
  operationId?: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  metadata?: Record<string, unknown>;
  response?: unknown;
}

/**
 * Options par défaut pour la génération de texte
 */
const DEFAULT_TEXT_OPTIONS: TextGenerationOptions = {
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  maxOutputTokens: 8192,
};

/**
 * Options par défaut pour la génération d'image
 */
const DEFAULT_IMAGE_OPTIONS: ImageGenerationOptions = {
  aspectRatio: '1:1',
  outputFormat: 'png',
  numberOfImages: 1,
};

/**
 * Options par défaut pour la génération de vidéo
 */
const DEFAULT_VIDEO_OPTIONS: VideoGenerationOptions = {
  model: 'veo-3.1-generate-001',
  durationSeconds: 6,
  aspectRatio: '16:9',
  resolution: '1080p',
  generateAudio: true,
  personGeneration: 'allow_adult',
};

/**
 * Client pour les APIs Google GenAI
 */
export class GenAiClient {
  private config: GenAiConfig;
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: GenAiConfig) {
    this.config = config;

    // Déterminer le mode (Vertex AI ou AI Studio)
    if (config.apiKey) {
      // Mode AI Studio (API Key)
      this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
      this.headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      };
    } else if (config.projectId) {
      // Mode Vertex AI (Service Account ou ADC)
      const location = config.location || 'us-central1';
      this.baseUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${config.projectId}/locations/${location}`;
      this.headers = {
        'Content-Type': 'application/json',
      };
    } else {
      throw new GenAiNodeError(parseGoogleApiError(
        new Error('Configuration invalide: fournir apiKey (AI Studio) ou projectId (Vertex AI)')
      ));
    }
  }

  /**
   * Génère du texte avec Gemini
   */
  async generateText(
    prompt: string,
    options?: TextGenerationOptions
  ): Promise<TextGenerationResult> {
    const opts = { ...DEFAULT_TEXT_OPTIONS, ...options };

    return withErrorHandling(async () => {
      const endpoint = this.getTextEndpoint(opts.model!);

      const body = {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: opts.temperature,
          topP: opts.topP,
          topK: opts.topK,
          maxOutputTokens: opts.maxOutputTokens,
          ...(opts.seed !== undefined && { seed: opts.seed }),
        },
        ...(opts.systemInstruction && {
          systemInstruction: {
            parts: [{ text: opts.systemInstruction }],
          },
        }),
      };

      const response = await this.request<GeminiTextResponse>(endpoint, body);

      // Parser la réponse
      const candidate = response.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || '';

      return {
        text,
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
        model: opts.model!,
        finishReason: candidate?.finishReason,
      };
    });
  }

  /**
   * Génère du texte avec contexte (chat multi-turn)
   */
  async generateTextWithContext(
    messages: Array<{ role: 'user' | 'model'; content: string }>,
    options?: TextGenerationOptions
  ): Promise<TextGenerationResult> {
    const opts = { ...DEFAULT_TEXT_OPTIONS, ...options };

    return withErrorHandling(async () => {
      const endpoint = this.getTextEndpoint(opts.model!);

      const body = {
        contents: messages.map(msg => ({
          role: msg.role,
          parts: [{ text: msg.content }],
        })),
        generationConfig: {
          temperature: opts.temperature,
          topP: opts.topP,
          topK: opts.topK,
          maxOutputTokens: opts.maxOutputTokens,
        },
        ...(opts.systemInstruction && {
          systemInstruction: {
            parts: [{ text: opts.systemInstruction }],
          },
        }),
      };

      const response = await this.request<GeminiTextResponse>(endpoint, body);

      const candidate = response.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || '';

      return {
        text,
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
        model: opts.model!,
        finishReason: candidate?.finishReason,
      };
    });
  }

  /**
   * Génère du texte au format JSON (structured output)
   */
  async generateJson<T>(
    prompt: string,
    options?: TextGenerationOptions
  ): Promise<T> {
    const opts = {
      ...DEFAULT_TEXT_OPTIONS,
      ...options,
      temperature: 0, // Déterministe pour JSON
    };

    const result = await this.generateText(prompt, opts);

    return this.parseJsonResponse<T>(result.text);
  }

  /**
   * Génère du texte au format JSON à partir d'un document (multimodal)
   */
  async generateJsonFromDocument<T>(
    prompt: string,
    document: { mimeType: string; data: string },
    options?: TextGenerationOptions
  ): Promise<T> {
    const opts = {
      ...DEFAULT_TEXT_OPTIONS,
      ...options,
      temperature: 0, // Déterministe pour JSON
    };

    return withErrorHandling(async () => {
      const endpoint = this.getTextEndpoint(opts.model!);

      const body = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: document.mimeType,
                  data: document.data,
                },
              },
              { text: prompt },
            ],
          },
        ],
        generationConfig: {
          temperature: opts.temperature,
          topP: opts.topP,
          topK: opts.topK,
          maxOutputTokens: opts.maxOutputTokens,
          ...(opts.seed !== undefined && { seed: opts.seed }),
        },
        ...(opts.systemInstruction && {
          systemInstruction: {
            parts: [{ text: opts.systemInstruction }],
          },
        }),
      };

      const response = await this.request<GeminiTextResponse>(endpoint, body);

      const candidate = response.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text || '';

      return this.parseJsonResponse<T>(text);
    });
  }

  /**
   * Parse une réponse JSON depuis du texte
   */
  private parseJsonResponse<T>(text: string): T {
    try {
      // Nettoyer les markdown code blocks si présents
      let jsonText = text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.slice(7);
      }
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.slice(3);
      }
      if (jsonText.endsWith('```')) {
        jsonText = jsonText.slice(0, -3);
      }

      return JSON.parse(jsonText.trim()) as T;
    } catch (error) {
      throw new GenAiNodeError(parseGoogleApiError(
        new Error(`Failed to parse JSON response: ${text}`)
      ));
    }
  }

  /**
   * Génère une image avec Gemini
   * Note: Utilise l'API Imagen ou Gemini Image selon la configuration
   */
  async generateImage(
    prompt: string,
    options?: ImageGenerationOptions
  ): Promise<ImageGenerationResult> {
    const opts = { ...DEFAULT_IMAGE_OPTIONS, ...options };

    return withErrorHandling(async () => {
      // L'API exacte dépend du modèle et de la configuration
      // Pour l'instant, utiliser Imagen 3
      const endpoint = this.config.apiKey
        ? `/models/imagen-3.0-generate-002:predict`
        : `/publishers/google/models/imagen-3.0-generate-002:predict`;

      const body = {
        instances: [
          {
            prompt,
          },
        ],
        parameters: {
          aspectRatio: opts.aspectRatio,
          outputFormat: opts.outputFormat,
          sampleCount: opts.numberOfImages,
        },
      };

      const response = await this.request<ImagenResponse>(endpoint, body);

      // Parser la réponse
      const prediction = response.predictions?.[0];
      if (!prediction?.bytesBase64Encoded) {
        throw new Error('No image generated');
      }

      const imageData = Buffer.from(prediction.bytesBase64Encoded, 'base64');

      return {
        imageData,
        mimeType: `image/${opts.outputFormat}`,
        model: 'imagen-3.0-generate-002',
      };
    });
  }

  /**
   * Démarre une génération de vidéo avec Veo
   * Retourne l'ID de l'opération pour le polling
   */
  async startVideoGeneration(
    prompt: string,
    options?: VideoGenerationOptions
  ): Promise<VideoGenerationResult> {
    const opts = { ...DEFAULT_VIDEO_OPTIONS, ...options };

    return withErrorHandling(async () => {
      const endpoint = this.config.apiKey
        ? `/models/${opts.model}:predictLongRunning`
        : `/publishers/google/models/${opts.model}:predictLongRunning`;

      const body = {
        instances: [
          {
            prompt,
          },
        ],
        parameters: {
          aspectRatio: opts.aspectRatio,
          durationSeconds: opts.durationSeconds,
          resolution: opts.resolution,
          generateAudio: opts.generateAudio,
          personGeneration: opts.personGeneration,
        },
      };

      const response = await this.request<LongRunningOperationResponse>(endpoint, body);

      // Extraire l'ID de l'opération
      const operationId = response.name || response.operationId;
      if (!operationId) {
        throw new Error('No operation ID returned');
      }

      return {
        operationId,
        model: opts.model!,
      };
    });
  }

  /**
   * Vérifie le statut d'une opération long-running
   */
  async checkOperationStatus(operationId: string): Promise<OperationStatus> {
    return withErrorHandling(async () => {
      const endpoint = this.config.apiKey
        ? `/operations/${operationId}`
        : `/${operationId}`; // Le chemin complet est dans operationId pour Vertex AI

      const response = await this.request<LongRunningOperationResponse>(endpoint, null, 'GET');
      return parseGoogleOperationStatus(response);
    });
  }

  /**
   * Annule une opération long-running
   */
  async cancelOperation(operationId: string): Promise<void> {
    return withErrorHandling(async () => {
      const endpoint = this.config.apiKey
        ? `/operations/${operationId}:cancel`
        : `/${operationId}:cancel`;

      await this.request(endpoint, {}, 'POST');
    });
  }

  // =========================================================================
  // Méthodes privées
  // =========================================================================

  /**
   * Effectue une requête HTTP vers l'API
   */
  private async request<T = Record<string, unknown>>(
    endpoint: string,
    body: unknown,
    method: 'GET' | 'POST' = 'POST'
  ): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

    const headers = { ...this.headers };

    // Pour Vertex AI, ajouter le token d'accès (Service Account ou ADC)
    if (!this.config.apiKey) {
      const accessToken = await this.getAccessToken();
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} - ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Obtient un token d'accès (Service Account ou ADC)
   */
  private async getAccessToken(): Promise<string> {
    const { GoogleAuth } = await import('google-auth-library');

    let auth: InstanceType<typeof GoogleAuth>;

    if (this.config.serviceAccountKey) {
      // Mode Service Account Key (JSON explicite)
      const credentials = typeof this.config.serviceAccountKey === 'string'
        ? JSON.parse(this.config.serviceAccountKey)
        : this.config.serviceAccountKey;

      auth = new GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    } else {
      // Mode ADC (Application Default Credentials)
      // Utilise automatiquement :
      // - GOOGLE_APPLICATION_CREDENTIALS env var
      // - gcloud auth application-default login
      // - Metadata server (sur GCP)
      auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        projectId: this.config.projectId,
      });
    }

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();

    if (!tokenResponse.token) {
      throw new Error('Failed to get access token. Ensure ADC is configured (gcloud auth application-default login) or provide a Service Account Key.');
    }

    return tokenResponse.token;
  }

  /**
   * Construit l'endpoint pour la génération de texte
   */
  private getTextEndpoint(model: GeminiModel): string {
    if (this.config.apiKey) {
      return `/models/${model}:generateContent`;
    } else {
      return `/publishers/google/models/${model}:generateContent`;
    }
  }
}

/**
 * Factory pour créer un GenAiClient avec API Key (AI Studio)
 */
export function createAiStudioClient(apiKey: string): GenAiClient {
  return new GenAiClient({ apiKey });
}

/**
 * Factory pour créer un GenAiClient avec Service Account (Vertex AI)
 */
export function createVertexAiClient(
  projectId: string,
  serviceAccountKey: string | null | undefined,
  location: string = 'us-central1'
): GenAiClient {
  return new GenAiClient({
    projectId,
    location,
    serviceAccountKey: serviceAccountKey || undefined,
  });
}

/**
 * Factory pour créer un GenAiClient avec ADC (Vertex AI)
 * Utilise Application Default Credentials (gcloud auth application-default login)
 */
export function createVertexAiClientWithAdc(
  projectId: string,
  location: string = 'us-central1'
): GenAiClient {
  return new GenAiClient({
    projectId,
    location,
  });
}
