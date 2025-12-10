/**
 * Helper pour le polling d'opérations long-running
 * Utilisé principalement pour Veo 3 (génération vidéo: 1-3 minutes)
 */

import { OperationStatus, PollingOptions } from './types';
import { createGenAiError, GenAiNodeError } from './ErrorHandler';

/**
 * Configuration par défaut du polling
 */
const DEFAULT_POLLING_OPTIONS: Required<PollingOptions> = {
  intervalMs: 5000,      // 5 secondes
  timeoutMs: 300000,     // 5 minutes
  onProgress: () => {},  // No-op
};

/**
 * Fonction de sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper pour le polling d'opérations long-running
 */
export class PollingHelper {
  private options: Required<PollingOptions>;

  constructor(options?: PollingOptions) {
    this.options = {
      ...DEFAULT_POLLING_OPTIONS,
      ...options,
    };
  }

  /**
   * Poll une opération jusqu'à completion ou timeout
   *
   * @param checkStatus Fonction qui retourne le statut actuel de l'opération
   * @returns Le statut final de l'opération
   * @throws GenAiNodeError si timeout ou erreur
   */
  async poll(
    checkStatus: () => Promise<OperationStatus>
  ): Promise<OperationStatus> {
    const startTime = Date.now();
    let lastStatus: OperationStatus | null = null;

    while (true) {
      // Vérifier le timeout
      const elapsed = Date.now() - startTime;
      if (elapsed >= this.options.timeoutMs) {
        throw new GenAiNodeError(createGenAiError(
          'TIMEOUT',
          `Polling timeout after ${elapsed}ms`,
          { lastStatus, elapsed, timeout: this.options.timeoutMs }
        ));
      }

      // Récupérer le statut
      try {
        lastStatus = await checkStatus();
      } catch (error) {
        throw new GenAiNodeError(createGenAiError(
          'OPERATION_FAILED',
          `Failed to check operation status: ${error}`,
          { error: String(error) }
        ));
      }

      // Notifier la progression
      this.options.onProgress(lastStatus);

      // Vérifier si terminé
      switch (lastStatus.state) {
        case 'DONE':
          return lastStatus;

        case 'FAILED':
          throw new GenAiNodeError(createGenAiError(
            'OPERATION_FAILED',
            lastStatus.error || 'Operation failed',
            { operationId: lastStatus.operationId, metadata: lastStatus.metadata }
          ));

        case 'CANCELLED':
          throw new GenAiNodeError(createGenAiError(
            'OPERATION_FAILED',
            'Operation was cancelled',
            { operationId: lastStatus.operationId }
          ));

        case 'PENDING':
        case 'RUNNING':
          // Continuer le polling
          break;

        default:
          // État inconnu, continuer le polling
          break;
      }

      // Attendre avant le prochain check
      await sleep(this.options.intervalMs);
    }
  }

  /**
   * Poll avec retry automatique en cas d'erreur transitoire
   */
  async pollWithRetry(
    checkStatus: () => Promise<OperationStatus>,
    maxRetries: number = 3
  ): Promise<OperationStatus> {
    let retries = 0;

    while (retries < maxRetries) {
      try {
        return await this.poll(checkStatus);
      } catch (error) {
        if (error instanceof GenAiNodeError && error.genAiError.isRecoverable) {
          retries++;
          if (retries < maxRetries) {
            // Attendre avant de réessayer (backoff exponentiel)
            await sleep(Math.pow(2, retries) * 1000);
            continue;
          }
        }
        throw error;
      }
    }

    throw new GenAiNodeError(createGenAiError(
      'OPERATION_FAILED',
      `Max retries (${maxRetries}) exceeded`,
      { maxRetries }
    ));
  }
}

/**
 * Fonction utilitaire pour créer un OperationStatus depuis une réponse API Google
 */
export function parseGoogleOperationStatus(response: {
  name?: string;
  done?: boolean;
  error?: { code?: number; message?: string };
  metadata?: Record<string, unknown>;
  response?: unknown;
}): OperationStatus {
  // Extraire l'ID de l'opération depuis le nom
  const operationId = response.name || 'unknown';

  // Déterminer l'état
  let state: OperationStatus['state'];
  if (response.error) {
    state = 'FAILED';
  } else if (response.done) {
    state = 'DONE';
  } else {
    // Vérifier les métadonnées pour plus de détails
    const metadata = response.metadata as Record<string, unknown> | undefined;
    if (metadata?.['@type']?.toString().includes('RunningOperation')) {
      state = 'RUNNING';
    } else {
      state = 'PENDING';
    }
  }

  // Extraire la progression si disponible
  const metadata = response.metadata as Record<string, unknown> | undefined;
  const progress = typeof metadata?.progress === 'number'
    ? metadata.progress
    : undefined;

  return {
    operationId,
    state,
    progress,
    error: response.error?.message,
    result: response.response,
    metadata: response.metadata,
  };
}

/**
 * Créer un PollingHelper avec les options par défaut pour Veo 3
 * (timeout plus long: 10 minutes)
 */
export function createVeoPollingHelper(
  onProgress?: (status: OperationStatus) => void
): PollingHelper {
  return new PollingHelper({
    intervalMs: 5000,      // 5 secondes
    timeoutMs: 600000,     // 10 minutes (Veo peut être long)
    onProgress,
  });
}

/**
 * Créer un PollingHelper avec les options par défaut pour les opérations rapides
 */
export function createFastPollingHelper(
  onProgress?: (status: OperationStatus) => void
): PollingHelper {
  return new PollingHelper({
    intervalMs: 2000,      // 2 secondes
    timeoutMs: 120000,     // 2 minutes
    onProgress,
  });
}
