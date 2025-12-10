/**
 * Types partagés pour les nodes Google GenAI
 */

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration pour l'authentification Google GenAI
 */
export interface GenAiConfig {
  /** Vertex AI Project ID */
  projectId?: string;
  /** Vertex AI Location (default: us-central1) */
  location?: string;
  /** Google AI Studio API Key (alternative à Vertex AI) */
  apiKey?: string;
  /** Service Account Key JSON */
  serviceAccountKey?: string;
}

/**
 * Configuration pour GCS
 */
export interface GcsConfig {
  /** Nom du bucket GCS */
  bucketName: string;
  /** Préfixe de chemin (ex: "generated/") */
  pathPrefix?: string;
  /** Durée de validité des URLs signées en heures (default: 24) */
  signedUrlExpirationHours?: number;
}

// ============================================================================
// Résultats
// ============================================================================

/**
 * Résultat d'un upload GCS
 */
export interface GcsUploadResult {
  /** Nom du bucket */
  bucket: string;
  /** Chemin complet dans le bucket */
  path: string;
  /** URL GCS (gs://bucket/path) */
  gcsUrl: string;
  /** URL signée pour accès temporaire */
  signedUrl: string;
  /** Date d'expiration de l'URL signée */
  expiresAt: Date;
  /** Taille du fichier en bytes */
  sizeBytes: number;
  /** Type MIME du fichier */
  mimeType: string;
}

/**
 * Résultat d'une génération de texte
 */
export interface TextGenerationResult {
  /** Texte généré */
  text: string;
  /** Tokens utilisés en entrée */
  inputTokens?: number;
  /** Tokens utilisés en sortie */
  outputTokens?: number;
  /** Modèle utilisé */
  model: string;
  /** Raison de fin de génération */
  finishReason?: string;
}

/**
 * Résultat d'une génération d'image
 */
export interface ImageGenerationResult {
  /** Données binaires de l'image */
  imageData: Buffer;
  /** Type MIME (image/png, image/webp) */
  mimeType: string;
  /** Largeur en pixels */
  width?: number;
  /** Hauteur en pixels */
  height?: number;
  /** Modèle utilisé */
  model: string;
}

/**
 * Résultat d'une opération de génération vidéo
 */
export interface VideoGenerationResult {
  /** ID de l'opération long-running */
  operationId: string;
  /** URL de la vidéo générée (si terminé) */
  videoUrl?: string;
  /** Durée de la vidéo en secondes */
  durationSeconds?: number;
  /** Modèle utilisé */
  model: string;
}

// ============================================================================
// Polling
// ============================================================================

/**
 * Options pour le polling d'opérations long-running
 */
export interface PollingOptions {
  /** Intervalle entre les checks en ms (default: 5000) */
  intervalMs?: number;
  /** Timeout maximum en ms (default: 300000 = 5min) */
  timeoutMs?: number;
  /** Callback appelé à chaque check */
  onProgress?: (status: OperationStatus) => void;
}

/**
 * Statut d'une opération long-running
 */
export interface OperationStatus {
  /** ID de l'opération */
  operationId: string;
  /** État actuel */
  state: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
  /** Progression en pourcentage (0-100) */
  progress?: number;
  /** Message d'erreur si FAILED */
  error?: string;
  /** Résultat si DONE */
  result?: unknown;
  /** Métadonnées supplémentaires */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Erreurs
// ============================================================================

/**
 * Codes d'erreur standardisés
 */
export type GenAiErrorCode =
  | 'AUTH_FAILED'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'CONTENT_FILTERED'
  | 'INVALID_INPUT'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'GCS_ERROR'
  | 'OPERATION_FAILED'
  | 'UNKNOWN';

/**
 * Structure d'erreur standardisée
 */
export interface GenAiError {
  /** Code d'erreur */
  code: GenAiErrorCode;
  /** Message technique */
  message: string;
  /** Message user-friendly */
  userMessage: string;
  /** Erreur récupérable (retry possible) */
  isRecoverable: boolean;
  /** Détails supplémentaires */
  details?: Record<string, unknown>;
  /** Erreur originale */
  originalError?: Error;
}

// ============================================================================
// Modèles disponibles
// ============================================================================

/**
 * Modèles Gemini disponibles
 */
export type GeminiModel =
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-preview-05-20'
  | 'gemini-2.0-flash'
  | 'gemini-1.5-pro'
  | 'gemini-1.5-flash';

/**
 * Modèles Gemini Image disponibles
 */
export type GeminiImageModel =
  | 'gemini-2.5-flash-preview-native-audio-dialog'
  | 'imagen-3.0-generate-002';

/**
 * Modèles Veo disponibles
 */
export type VeoModel =
  | 'veo-3.1-generate-001'
  | 'veo-3.1-fast-generate-001'
  | 'veo-2.0-generate-001';

// ============================================================================
// Options de génération
// ============================================================================

/**
 * Options pour la génération de texte
 */
export interface TextGenerationOptions {
  /** Modèle à utiliser */
  model?: GeminiModel;
  /** Température (0.0 - 2.0) */
  temperature?: number;
  /** Top P (0.0 - 1.0) */
  topP?: number;
  /** Top K */
  topK?: number;
  /** Nombre max de tokens en sortie */
  maxOutputTokens?: number;
  /** Seed pour reproductibilité */
  seed?: number;
  /** System instruction */
  systemInstruction?: string;
}

/**
 * Options pour la génération d'image
 */
export interface ImageGenerationOptions {
  /** Modèle à utiliser */
  model?: GeminiImageModel;
  /** Ratio d'aspect */
  aspectRatio?: '1:1' | '16:9' | '9:16' | '2:3' | '3:2' | '4:3' | '21:9';
  /** Format de sortie */
  outputFormat?: 'png' | 'webp' | 'jpeg';
  /** Nombre d'images à générer */
  numberOfImages?: number;
}

/**
 * Options pour la génération de vidéo
 */
export interface VideoGenerationOptions {
  /** Modèle à utiliser */
  model?: VeoModel;
  /** Durée en secondes */
  durationSeconds?: 4 | 6 | 8;
  /** Ratio d'aspect */
  aspectRatio?: '16:9' | '9:16';
  /** Résolution */
  resolution?: '1080p' | '720p';
  /** Générer l'audio */
  generateAudio?: boolean;
  /** Génération de personnes */
  personGeneration?: 'dont_allow' | 'allow_adult';
}

// ============================================================================
// Types utilitaires
// ============================================================================

/**
 * Type pour les formats de médias supportés
 */
export type MediaMimeType =
  | 'image/png'
  | 'image/webp'
  | 'image/jpeg'
  | 'video/mp4'
  | 'video/webm'
  | 'audio/mp3'
  | 'audio/wav'
  | 'application/json';

/**
 * Résultat générique d'une opération
 */
export interface OperationResult<T> {
  success: boolean;
  data?: T;
  error?: GenAiError;
}
