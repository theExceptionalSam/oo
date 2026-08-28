import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

/**
 * Storage abstraction. In production this would proxy S3 / MinIO SDK calls.
 * For local/dev/test we use an in-memory map so the build & tests run without external deps.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly store = new Map<string, { content: Buffer; mimeType: string }>();

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') ?? 'schoolsync';
    this.endpoint = config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000';
  }

  onModuleInit() {
    this.logger.log(`StorageService ready (bucket=${this.bucket}, endpoint=${this.endpoint})`);
  }

  async presignUpload(opts: { filename: string; mimeType: string; size: number }): Promise<PresignedUpload> {
    const key = `${randomUUID()}/${opts.filename}`;
    return {
      uploadUrl: `${this.endpoint}/${this.bucket}/${key}`,
      key,
      expiresAt: Date.now() + 15 * 60 * 1000,
    };
  }

  async put(key: string, content: Buffer, mimeType: string): Promise<StoredFile> {
    this.store.set(key, { content, mimeType });
    return {
      key,
      url: `${this.endpoint}/${this.bucket}/${key}`,
      size: content.byteLength,
      mimeType,
    };
  }

  async get(key: string): Promise<Buffer | null> {
    return this.store.get(key)?.content ?? null;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  checksum(content: Buffer): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
