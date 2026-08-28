import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

/**
 * Replaces the in-memory StorageService with real S3/R2 calls.
 *
 * The previous version returned fake URLs and stored bytes in a Map —
 * fine for tests, dangerous in prod (files lost on every deploy).
 *
 * This version uses the AWS SDK v3 S3 client, which is wire-compatible
 * with:
 *   - AWS S3 (default)
 *   - Cloudflare R2 (set S3_ENDPOINT + S3_FORCE_PATH_STYLE=false)
 *   - MinIO (set S3_ENDPOINT + S3_FORCE_PATH_STYLE=true)
 *   - Backblaze B2 (set S3_ENDPOINT)
 *   - Supabase Storage (set S3_ENDPOINT to project URL)
 *
 * Cloudflare R2 is the recommended prod target — zero egress fees.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomUUID } from 'crypto';

export interface PresignedUpload {
  uploadUrl: string;
  key: string;
  expiresAt: number;
}

export interface StoredFile {
  key: string;
  url: string;
  size: number;
  mimeType: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly client: S3Client;
  private readonly publicBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('S3_BUCKET') ?? 'schoolsync';

    const region = this.config.get<string>('S3_REGION') ?? 'auto';
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    const forcePathStyle = this.config.get<string>('S3_FORCE_PATH_STYLE') === 'true';

    this.client = new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials: {
        accessKeyId: this.config.get<string>('S3_ACCESS_KEY') ?? '',
        secretAccessKey: this.config.get<string>('S3_SECRET_KEY') ?? '',
      },
    });

    // Public URL prefix for objects — used to build the `url` field.
    // For R2: https://pub-<id>.r2.dev/<bucket>/<key>
    // For S3: https://<bucket>.s3.<region>.amazonaws.com/<key>
    // For MinIO (local dev): http://localhost:9000/<bucket>/<key>
    this.publicBaseUrl = this.config.get<string>('S3_PUBLIC_URL') ?? endpoint ?? '';

    this.logger.log(`StorageService ready (bucket=${this.bucket}, endpoint=${endpoint ?? 'AWS S3'})`);
  }

  /**
   * Generate a presigned PUT URL — the client uploads directly to S3/R2,
   * your API server never sees the bytes. Saves bandwidth + CPU.
   */
  async presignUpload(opts: {
    filename: string;
    mimeType: string;
    size: number;
    folder?: string;
  }): Promise<PresignedUpload> {
    const folder = opts.folder ?? 'uploads';
    const key = `${folder}/${new Date().getUTCFullYear()}/${randomUUID()}/${opts.filename}`;
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: opts.mimeType,
      ContentLength: opts.size,
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 900 });

    return { uploadUrl, key, expiresAt };
  }

  /**
   * Server-side upload (used when the API itself generates the file —
   * e.g., report card PDFs from a worker).
   */
  async put(key: string, content: Buffer, mimeType: string): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: mimeType,
      }),
    );

    return {
      key,
      url: `${this.publicBaseUrl}/${this.bucket}/${key}`,
      size: content.byteLength,
      mimeType,
    };
  }

  /**
   * Fetch an object. For large files, prefer presigning a GET URL
   * and letting the client download directly.
   */
  async get(key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const bytes = await response.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    } catch (err) {
      this.logger.warn(`Failed to fetch ${key}: ${(err as Error).message}`);
      return null;
    }
  }

  async presignDownload(key: string, expiresInSec = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSec });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  checksum(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
