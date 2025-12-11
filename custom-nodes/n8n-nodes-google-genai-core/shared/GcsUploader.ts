/**
 * Helper pour l'upload de fichiers vers Google Cloud Storage
 * et la génération d'URLs signées
 */

import { Storage, Bucket, File } from '@google-cloud/storage';
import { GcsConfig, GcsUploadResult, MediaMimeType } from './types';
import { parseGcsError, GenAiNodeError } from './ErrorHandler';

/**
 * Configuration par défaut
 */
const DEFAULT_CONFIG: Partial<GcsConfig> = {
  pathPrefix: '',
  signedUrlExpirationHours: 24,
};

/**
 * Mapping des extensions vers les types MIME
 */
const EXTENSION_TO_MIME: Record<string, MediaMimeType> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mp3',
  '.wav': 'audio/wav',
  '.json': 'application/json',
};

/**
 * Classe pour gérer les uploads vers GCS
 */
export class GcsUploader {
  private storage: Storage;
  private bucket: Bucket;
  private config: Required<GcsConfig>;
  private impersonateServiceAccount?: string;

  constructor(
    config: GcsConfig,
    serviceAccountKey?: string,
    impersonateServiceAccount?: string
  ) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as Required<GcsConfig>;
    this.impersonateServiceAccount = impersonateServiceAccount;

    // Initialiser le client Storage
    if (serviceAccountKey) {
      // Credentials fournis explicitement
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
   * Upload un fichier binaire vers GCS
   *
   * @param data Données binaires du fichier
   * @param filename Nom du fichier (avec extension)
   * @param userId ID utilisateur pour l'organisation des fichiers
   * @param mimeType Type MIME (optionnel, déduit de l'extension si non fourni)
   * @returns Résultat de l'upload avec URL signée
   */
  async upload(
    data: Buffer,
    filename: string,
    userId: string,
    mimeType?: MediaMimeType
  ): Promise<GcsUploadResult> {
    try {
      // Construire le chemin complet
      const path = this.buildPath(filename, userId);

      // Déduire le type MIME si non fourni
      const contentType = mimeType || this.getMimeType(filename);

      // Référence au fichier
      const file = this.bucket.file(path);

      // Upload
      await file.save(data, {
        contentType,
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
        sizeBytes: data.length,
        mimeType: contentType,
      };
    } catch (error) {
      throw GenAiNodeError.fromGcsError(error);
    }
  }

  /**
   * Upload un fichier depuis une URL
   *
   * @param sourceUrl URL source du fichier
   * @param filename Nom du fichier destination
   * @param userId ID utilisateur
   * @returns Résultat de l'upload
   */
  async uploadFromUrl(
    sourceUrl: string,
    filename: string,
    userId: string
  ): Promise<GcsUploadResult> {
    try {
      // Télécharger le fichier
      const response = await fetch(sourceUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${sourceUrl}: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const data = Buffer.from(arrayBuffer);

      // Déduire le type MIME depuis le Content-Type ou l'extension
      const contentType = response.headers.get('content-type') as MediaMimeType
        || this.getMimeType(filename);

      return this.upload(data, filename, userId, contentType);
    } catch (error) {
      throw GenAiNodeError.fromGcsError(error);
    }
  }

  /**
   * Génère une nouvelle URL signée pour un fichier existant
   *
   * @param path Chemin du fichier dans le bucket
   * @returns URL signée
   */
  async regenerateSignedUrl(path: string): Promise<string> {
    try {
      const file = this.bucket.file(path);
      return this.generateSignedUrl(file);
    } catch (error) {
      throw GenAiNodeError.fromGcsError(error);
    }
  }

  /**
   * Vérifie si un fichier existe
   *
   * @param path Chemin du fichier
   * @returns true si le fichier existe
   */
  async exists(path: string): Promise<boolean> {
    try {
      const [exists] = await this.bucket.file(path).exists();
      return exists;
    } catch (error) {
      throw GenAiNodeError.fromGcsError(error);
    }
  }

  /**
   * Supprime un fichier
   *
   * @param path Chemin du fichier
   */
  async delete(path: string): Promise<void> {
    try {
      await this.bucket.file(path).delete();
    } catch (error) {
      // Ignorer l'erreur si le fichier n'existe pas
      const errorMessage = (error as Error).message?.toLowerCase() || '';
      if (!errorMessage.includes('not found')) {
        throw GenAiNodeError.fromGcsError(error);
      }
    }
  }

  /**
   * Liste les fichiers d'un utilisateur
   *
   * @param userId ID utilisateur
   * @param prefix Préfixe supplémentaire (optionnel)
   * @returns Liste des chemins de fichiers
   */
  async listUserFiles(userId: string, prefix?: string): Promise<string[]> {
    try {
      const fullPrefix = this.buildPath(prefix || '', userId);
      const [files] = await this.bucket.getFiles({ prefix: fullPrefix });
      return files.map(file => file.name);
    } catch (error) {
      throw GenAiNodeError.fromGcsError(error);
    }
  }

  // =========================================================================
  // Méthodes privées
  // =========================================================================

  /**
   * Construit le chemin complet d'un fichier
   */
  private buildPath(filename: string, userId: string): string {
    const parts = [
      this.config.pathPrefix,
      userId,
      filename,
    ].filter(Boolean);

    return parts.join('/').replace(/\/+/g, '/');
  }

  /**
   * Déduit le type MIME depuis l'extension du fichier
   */
  private getMimeType(filename: string): MediaMimeType {
    const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
    return EXTENSION_TO_MIME[ext] || 'application/octet-stream' as MediaMimeType;
  }

  /**
   * Génère une URL signée pour un fichier
   * Si impersonateServiceAccount est défini, utilise l'impersonation via IAM Credentials API
   */
  private async generateSignedUrl(file: File): Promise<string> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.config.signedUrlExpirationHours);

    // Si on a un service account à impersonner, utiliser l'impersonation
    if (this.impersonateServiceAccount) {
      return this.generateSignedUrlWithImpersonation(file, expiresAt);
    }

    // Sans impersonation, utiliser la méthode standard
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: expiresAt,
    });
    return signedUrl;
  }

  /**
   * Génère une URL signée en utilisant l'impersonation de service account
   */
  private async generateSignedUrlWithImpersonation(file: File, expiresAt: Date): Promise<string> {
    const { IAMCredentialsClient } = await import('@google-cloud/iam-credentials');
    const iamClient = new IAMCredentialsClient();

    // Construire les composants de l'URL signée V4
    const expiration = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    const signedHeaders = 'host';
    const bucketName = this.config.bucketName;
    const objectName = file.name;
    const host = `${bucketName}.storage.googleapis.com`;

    const now = new Date();
    const datestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dateOnly = datestamp.substring(0, 8);

    const credentialScope = `${dateOnly}/auto/storage/goog4_request`;
    const credential = `${this.impersonateServiceAccount}/${credentialScope}`;

    // Paramètres de requête canoniques
    const queryParams = new URLSearchParams({
      'X-Goog-Algorithm': 'GOOG4-RSA-SHA256',
      'X-Goog-Credential': credential,
      'X-Goog-Date': datestamp,
      'X-Goog-Expires': expiration.toString(),
      'X-Goog-SignedHeaders': signedHeaders,
    });

    // Requête canonique
    const canonicalRequest = [
      'GET',
      `/${objectName}`,
      queryParams.toString(),
      `host:${host}`,
      '',
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    // String à signer
    const stringToSign = [
      'GOOG4-RSA-SHA256',
      datestamp,
      credentialScope,
      require('crypto').createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    // Signer via IAM Credentials API (impersonation)
    const [signResponse] = await iamClient.signBlob({
      name: `projects/-/serviceAccounts/${this.impersonateServiceAccount}`,
      payload: Buffer.from(stringToSign).toString('base64'),
    });

    const signature = Buffer.from(signResponse.signedBlob as string, 'base64').toString('hex');

    // Construire l'URL finale
    queryParams.append('X-Goog-Signature', signature);
    return `https://${host}/${objectName}?${queryParams.toString()}`;
  }
}

/**
 * Factory pour créer un GcsUploader avec les paramètres par défaut du projet
 */
export function createGcsUploader(
  bucketName: string,
  serviceAccountKey?: string,
  pathPrefix: string = 'generated',
  impersonateServiceAccount?: string
): GcsUploader {
  return new GcsUploader(
    {
      bucketName,
      pathPrefix,
      signedUrlExpirationHours: 24,
    },
    serviceAccountKey,
    impersonateServiceAccount
  );
}
