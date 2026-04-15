import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import { env } from '../../config/env';

/**
 * FileStorageService
 * Gestiona almacenamiento de archivos (evidencia fotográfica, PDFs) en S3
 * Uses AWS SDK v3
 */
export class FileStorageService {
  private static s3Client: S3Client;

  /**
   * Inicializar cliente S3 v3
   */
  static initialize() {
    if (!this.s3Client) {
      this.s3Client = new S3Client({
        region: env.aws.region,
        credentials:
          env.aws.accessKeyId && env.aws.secretAccessKey
            ? {
                accessKeyId: env.aws.accessKeyId,
                secretAccessKey: env.aws.secretAccessKey,
              }
            : undefined,
      });
    }
  }

  /**
   * Subir archivo de evidencia a S3
   * @param file - Buffer del archivo
   * @param workOrderId - ID de la OT
   * @param filename - Nombre original del archivo
   * @param organizationId - Contexto de org
   * @returns URL firmada del archivo y metadata
   */
  static async uploadEvidenceFile(
    file: Buffer,
    workOrderId: string,
    filename: string,
    organizationId: string
  ): Promise<{
    url: string;
    key: string;
    originalName: string;
    fileSize: number;
    uploadedAt: Date;
  }> {
    this.initialize();

    const bucket = env.aws.s3Bucket;
    if (!bucket) {
      throw new Error('S3 bucket name is not configured');
    }

    // Generar clave única en S3
    const timestamp = Date.now();
    const s3Key = `work-orders/${organizationId}/${workOrderId}/${timestamp}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: file,
      ContentType: this.getContentType(path.extname(filename)),
      ServerSideEncryption: 'AES256',
      Metadata: {
        'original-filename': filename,
        'work-order-id': workOrderId,
        'organization-id': organizationId,
        'upload-date': new Date().toISOString(),
      },
    });

    try {
      await this.s3Client.send(command);

      // Generar URL firmada (válida por 365 días)
      const getCommand = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
      const signedUrl = await getSignedUrl(this.s3Client, getCommand, {
        expiresIn: 365 * 24 * 60 * 60,
      });

      return {
        url: signedUrl,
        key: s3Key,
        originalName: filename,
        fileSize: file.length,
        uploadedAt: new Date(),
      };
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw new Error('Failed to upload file to storage');
    }
  }

  /**
   * Subir PDF de OT generado a S3
   */
  static async uploadWorkOrderPdf(
    pdfBuffer: Buffer,
    workOrderNumber: string,
    organizationId: string
  ): Promise<string> {
    this.initialize();

    const bucket = env.aws.s3Bucket;
    if (!bucket) {
      throw new Error('S3 bucket name is not configured');
    }

    const s3Key = `work-orders/${organizationId}/pdfs/${workOrderNumber}-${Date.now()}.pdf`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      ServerSideEncryption: 'AES256',
      Metadata: {
        'work-order-number': workOrderNumber,
        'organization-id': organizationId,
      },
    });

    try {
      await this.s3Client.send(command);

      const getCommand = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
      return await getSignedUrl(this.s3Client, getCommand, {
        expiresIn: 365 * 24 * 60 * 60,
      });
    } catch (error) {
      console.error('Error uploading PDF to S3:', error);
      throw new Error('Failed to upload PDF to storage');
    }
  }

  /**
   * Eliminar archivo de S3
   */
  static async deleteFile(s3Key: string): Promise<void> {
    this.initialize();

    const bucket = env.aws.s3Bucket;
    if (!bucket) {
      throw new Error('S3 bucket name is not configured');
    }

    try {
      const command = new DeleteObjectCommand({ Bucket: bucket, Key: s3Key });
      await this.s3Client.send(command);
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      throw new Error('Failed to delete file from storage');
    }
  }

  /**
   * Obtener URL firmada (temporal) de un archivo
   */
  static async getSignedFileUrl(s3Key: string, expiresIn: number = 3600): Promise<string> {
    this.initialize();

    const bucket = env.aws.s3Bucket;
    if (!bucket) {
      throw new Error('S3 bucket name is not configured');
    }

    const getCommand = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
    return await getSignedUrl(this.s3Client, getCommand, { expiresIn });
  }

  /**
   * Obtener metadatos de archivo
   */
  static async getFileMetadata(s3Key: string): Promise<{
    size: number;
    lastModified: Date;
    contentType: string;
    metadata: Record<string, string>;
  }> {
    this.initialize();

    const bucket = env.aws.s3Bucket;
    if (!bucket) {
      throw new Error('S3 bucket name is not configured');
    }

    try {
      const command = new HeadObjectCommand({ Bucket: bucket, Key: s3Key });
      const data = await this.s3Client.send(command);

      return {
        size: data.ContentLength || 0,
        lastModified: data.LastModified || new Date(),
        contentType: data.ContentType || 'application/octet-stream',
        metadata: (data.Metadata as Record<string, string>) || {},
      };
    } catch (error) {
      console.error('Error getting file metadata:', error);
      throw new Error('Failed to get file metadata');
    }
  }

  /**
   * Listar todos los archivos de una OT
   */
  static async listWorkOrderFiles(workOrderId: string, organizationId: string): Promise<
    Array<{
      key: string;
      size: number;
      lastModified: Date;
      url: string;
    }>
  > {
    this.initialize();

    const bucket = env.aws.s3Bucket;
    if (!bucket) {
      throw new Error('S3 bucket name is not configured');
    }

    try {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: `work-orders/${organizationId}/${workOrderId}/`,
      });

      const result = await this.s3Client.send(command);
      const files = result.Contents || [];

      const filesWithUrls = await Promise.all(
        files.map(async (file) => ({
          key: file.Key || '',
          size: file.Size || 0,
          lastModified: file.LastModified || new Date(),
          url: await this.getSignedFileUrl(file.Key || ''),
        }))
      );

      return filesWithUrls;
    } catch (error) {
      console.error('Error listing work order files:', error);
      throw new Error('Failed to list files');
    }
  }

  /**
   * Determinar MIME type basado en extensión
   */
  private static getContentType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  /**
   * Validar tamaño de archivo
   */
  static validateFileSize(fileSize: number, maxSizeMb: number = 10): boolean {
    const maxBytes = maxSizeMb * 1024 * 1024;
    return fileSize <= maxBytes;
  }

  /**
   * Validar tipo de archivo permitido
   */
  static validateFileType(
    filename: string,
    allowedExtensions: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.pdf']
  ): boolean {
    const extension = path.extname(filename).toLowerCase();
    return allowedExtensions.includes(extension);
  }
}

