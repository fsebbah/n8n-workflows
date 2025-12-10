/**
 * Gestion des erreurs pour les nodes Google GenAI
 * Transforme les erreurs techniques en messages user-friendly
 */

import { GenAiError, GenAiErrorCode } from './types';

/**
 * Mapping des codes d'erreur vers des messages user-friendly
 */
const ERROR_MESSAGES: Record<GenAiErrorCode, string> = {
  AUTH_FAILED: 'Échec de l\'authentification. Vérifiez vos credentials Google.',
  QUOTA_EXCEEDED: 'Limite de quota atteinte. Réessayez plus tard ou augmentez votre quota.',
  RATE_LIMITED: 'Trop de requêtes. Veuillez patienter quelques instants.',
  CONTENT_FILTERED: 'Le contenu ne peut pas être généré (politique de sécurité).',
  INVALID_INPUT: 'Les données fournies sont invalides.',
  TIMEOUT: 'L\'opération a pris trop de temps. Réessayez.',
  NETWORK_ERROR: 'Erreur de connexion réseau. Vérifiez votre connexion.',
  GCS_ERROR: 'Erreur lors de l\'accès au stockage Google Cloud.',
  OPERATION_FAILED: 'L\'opération a échoué.',
  UNKNOWN: 'Une erreur inattendue s\'est produite.',
};

/**
 * Codes d'erreur récupérables (retry possible)
 */
const RECOVERABLE_ERRORS: GenAiErrorCode[] = [
  'RATE_LIMITED',
  'TIMEOUT',
  'NETWORK_ERROR',
];

/**
 * Crée une erreur GenAI standardisée
 */
export function createGenAiError(
  code: GenAiErrorCode,
  message: string,
  details?: Record<string, unknown>,
  originalError?: Error
): GenAiError {
  return {
    code,
    message,
    userMessage: ERROR_MESSAGES[code],
    isRecoverable: RECOVERABLE_ERRORS.includes(code),
    details,
    originalError,
  };
}

/**
 * Parse une erreur Google API et la convertit en GenAiError
 */
export function parseGoogleApiError(error: unknown): GenAiError {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Authentification
    if (message.includes('authentication') || message.includes('credentials') ||
        message.includes('unauthorized') || message.includes('403')) {
      return createGenAiError('AUTH_FAILED', error.message, undefined, error);
    }

    // Quota
    if (message.includes('quota') || message.includes('resource exhausted')) {
      return createGenAiError('QUOTA_EXCEEDED', error.message, undefined, error);
    }

    // Rate limiting
    if (message.includes('rate') || message.includes('too many requests') ||
        message.includes('429')) {
      return createGenAiError('RATE_LIMITED', error.message, undefined, error);
    }

    // Content filtering
    if (message.includes('safety') || message.includes('blocked') ||
        message.includes('filtered') || message.includes('harmful')) {
      return createGenAiError('CONTENT_FILTERED', error.message, undefined, error);
    }

    // Invalid input
    if (message.includes('invalid') || message.includes('bad request') ||
        message.includes('400')) {
      return createGenAiError('INVALID_INPUT', error.message, undefined, error);
    }

    // Timeout
    if (message.includes('timeout') || message.includes('deadline') ||
        message.includes('504')) {
      return createGenAiError('TIMEOUT', error.message, undefined, error);
    }

    // Network
    if (message.includes('network') || message.includes('connection') ||
        message.includes('econnrefused') || message.includes('enotfound')) {
      return createGenAiError('NETWORK_ERROR', error.message, undefined, error);
    }

    // GCS
    if (message.includes('storage') || message.includes('bucket') ||
        message.includes('gcs')) {
      return createGenAiError('GCS_ERROR', error.message, undefined, error);
    }

    // Opération échouée
    if (message.includes('failed') || message.includes('error')) {
      return createGenAiError('OPERATION_FAILED', error.message, undefined, error);
    }

    // Erreur inconnue
    return createGenAiError('UNKNOWN', error.message, undefined, error);
  }

  // Si ce n'est pas une Error
  return createGenAiError('UNKNOWN', String(error));
}

/**
 * Parse une erreur GCS et la convertit en GenAiError
 */
export function parseGcsError(error: unknown): GenAiError {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes('permission') || message.includes('access denied') ||
        message.includes('403')) {
      return createGenAiError(
        'AUTH_FAILED',
        'Accès GCS refusé. Vérifiez les permissions du Service Account.',
        undefined,
        error
      );
    }

    if (message.includes('not found') || message.includes('404')) {
      return createGenAiError(
        'GCS_ERROR',
        'Bucket ou fichier GCS non trouvé.',
        undefined,
        error
      );
    }

    return createGenAiError('GCS_ERROR', error.message, undefined, error);
  }

  return createGenAiError('GCS_ERROR', String(error));
}

/**
 * Classe d'erreur personnalisée pour les nodes GenAI
 */
export class GenAiNodeError extends Error {
  public readonly genAiError: GenAiError;

  constructor(error: GenAiError) {
    super(error.userMessage);
    this.name = 'GenAiNodeError';
    this.genAiError = error;
  }

  /**
   * Crée une GenAiNodeError depuis une erreur Google API
   */
  static fromGoogleApiError(error: unknown): GenAiNodeError {
    return new GenAiNodeError(parseGoogleApiError(error));
  }

  /**
   * Crée une GenAiNodeError depuis une erreur GCS
   */
  static fromGcsError(error: unknown): GenAiNodeError {
    return new GenAiNodeError(parseGcsError(error));
  }
}

/**
 * Wrapper pour exécuter une fonction avec gestion d'erreur
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorParser: (error: unknown) => GenAiError = parseGoogleApiError
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new GenAiNodeError(errorParser(error));
  }
}
