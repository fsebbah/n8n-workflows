/**
 * Helper pour l'upload d'images vers Google Cloud Storage
 * et la génération d'URLs signées
 */

import { Storage, Bucket, File } from '@google-cloud/storage';

export interface GcsConfig {
  bucketName: string;
  pathPrefix?: string;
  signedUrlExpirationHours?: number;
}

export interface GcsUploadResult {
  bucket: string;
  path: string;
  gcsUrl: string;
  signedUrl: string;
  expiresAt: Date;
  sizeBytes: number;
  mimeType: string;
}

const DEFAULT_CONFIG = {
  pathPrefix: 'gemini-images',
  signedUrlExpirationHours: 24,
};

export class GcsUploader {
  private storage: Storage;
  private bucket: Bucket;
  private config: Required<GcsConfig>;

  constructor(
    config: GcsConfig,
    serviceAccountKey?: string
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<GcsConfig>;

    // Initialiser le client Storage
    if (serviceAccountKey) {
      const credentials = typeof serviceAccountKey === 'string'
        ? JSON.parse(serviceAccountKey)
        : serviceAccountKey;

      this.storage = new Storage({
        projectId: credentials.project_id,
        credentials,
      });
    } else {
      // Utiliser les credentials par défaut (ADC)
      this.storage = new Storage();
    }

    this.bucket = this.storage.bucket(this.config.bucketName);
  }

  /**
   * Upload une image vers GCS
   */
  async upload(
    imageData: Buffer,
    filename: string,
    mimeType: string,
    userId?: string
  ): Promise<GcsUploadResult> {
    // Construire le chemin complet
    const timestamp = Date.now();
    const parts = [
      this.config.pathPrefix,
      userId,
      `${timestamp}-${filename}`,
    ].filter(Boolean);
    const path = parts.join('/');

    // Référence au fichier
    const file = this.bucket.file(path);

    // Upload
    await file.save(imageData, {
      contentType: mimeType,
      metadata: {
        cacheControl: 'public, max-age=3600',
      },
    });

    // Générer l'URL signée
    const signedUrl = await this.generateSignedUrl(file);

    // Calculer la date d'expiration
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.config.signedUrlExpirationHours);

    return {
      bucket: this.config.bucketName,
      path,
      gcsUrl: `gs://${this.config.bucketName}/${path}`,
      signedUrl,
      expiresAt,
      sizeBytes: imageData.length,
      mimeType,
    };
  }

  /**
   * Génère une URL signée pour un fichier
   */
  private async generateSignedUrl(file: File): Promise<string> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.config.signedUrlExpirationHours);

    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expiresAt,
    });

    return signedUrl;
  }
}

/**
 * Factory pour créer un GcsUploader
 */
export function createGcsUploader(
  bucketName: string,
  serviceAccountKey?: string,
  pathPrefix: string = 'gemini-images',
  signedUrlExpirationHours: number = 24
): GcsUploader {
  return new GcsUploader(
    {
      bucketName,
      pathPrefix,
      signedUrlExpirationHours,
    },
    serviceAccountKey
  );
}
