import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { JwtModuleOptions, JwtOptionsFactory } from '@nestjs/jwt';

/**
 * Hardened JWT config — RS256 ONLY in production.
 *
 * Changes from the previous version:
 *   1. HS256 dev fallback is REMOVED. Even in dev, you must provide
 *      an RSA keypair. This prevents "works in dev, breaks in prod"
 *      drift and means a misconfigured env var can never silently
 *      degrade auth to symmetric signing.
 *   2. Boot fails fast if NODE_ENV=production AND no private key.
 *   3. The key ID (`kid`) is derived from the public key fingerprint
 *      and included in the JWT header — enables key rotation without
 *      invalidating in-flight tokens.
 *
 * Local dev keypair generation:
 *   mkdir -p keys && openssl genrsa -out keys/private.pem 2048
 *   openssl rsa -in keys/private.pem -pubout -out keys/public.pem
 */
@Injectable()
export class JwtConfigService implements JwtOptionsFactory {
  private readonly logger = new Logger(JwtConfigService.name);

  constructor(private readonly config: ConfigService) {}

  private readKey(path?: string): string | undefined {
    if (!path) return undefined;
    try {
      return readFileSync(path, 'utf8');
    } catch (err) {
      this.logger.warn(`Failed to read key at ${path}: ${(err as Error).message}`);
      return undefined;
    }
  }

  private deriveKeyId(publicKeyPem: string): string | undefined {
    if (!publicKeyPem) return undefined;
    try {
      const { createHash } = require('crypto') as typeof import('crypto');
      const kid = createHash('sha256')
        .update(publicKeyPem)
        .digest('hex')
        .slice(0, 8);
      return `schoolsync-${kid}`;
    } catch {
      return undefined;
    }
  }

  createJwtOptions(): JwtModuleOptions {
    const secretFile = (name: string) => `/run/secrets/${name}`;

    const privateKeyPath = this.config.get<string>('JWT_PRIVATE_KEY_PATH');
    const publicKeyPath = this.config.get<string>('JWT_PUBLIC_KEY_PATH');
    const envPrivate = this.config.get<string>('JWT_PRIVATE_KEY');
    const envPublic = this.config.get<string>('JWT_PUBLIC_KEY');

    const privateKey =
      this.readKey(privateKeyPath) ??
      this.readKey(secretFile('jwt_private_key')) ??
      envPrivate;
    const publicKey =
      this.readKey(publicKeyPath) ??
      this.readKey(secretFile('jwt_public_key')) ??
      envPublic;

    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const isTest = this.config.get<string>('NODE_ENV') === 'test';

    if (isProduction && (!privateKey || !publicKey)) {
      throw new Error(
        '[JWT] RS256 keypair is REQUIRED in production. ' +
          'Set JWT_PRIVATE_KEY_PATH and JWT_PUBLIC_KEY_PATH to PEM files ' +
          'mounted via your secrets manager. HS256 dev fallback is disabled.',
      );
    }

    if (!isTest && (!privateKey || !publicKey)) {
      throw new Error(
        '[JWT] No RSA keypair found. Run:\n' +
          '  mkdir -p keys && openssl genrsa -out keys/private.pem 2048\n' +
          '  openssl rsa -in keys/private.pem -pubout -out keys/public.pem\n' +
          'Then set JWT_PRIVATE_KEY_PATH=./keys/private.pem and JWT_PUBLIC_KEY_PATH=./keys/public.pem in .env',
      );
    }

    const kid = this.deriveKeyId(publicKey!);
    this.logger.log(`JWT configured with algorithm=RS256, kid=${kid}`);

    return {
      privateKey: privateKey!,
      publicKey: publicKey!,
      signOptions: {
        algorithm: 'RS256',
        issuer: this.config.get<string>('JWT_ISSUER') ?? 'schoolsync',
        audience: this.config.get<string>('JWT_AUDIENCE') ?? 'schoolsync-users',
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
        keyid: kid,
      },
      verifyOptions: {
        algorithms: ['RS256'],
        issuer: this.config.get<string>('JWT_ISSUER') ?? 'schoolsync',
        audience: this.config.get<string>('JWT_AUDIENCE') ?? 'schoolsync-users',
      },
    };
  }
}
