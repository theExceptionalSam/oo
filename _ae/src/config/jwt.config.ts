import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { JwtModuleOptions, JwtOptionsFactory } from '@nestjs/jwt';

@Injectable()
export class JwtConfigService implements JwtOptionsFactory {
  constructor(private readonly config: ConfigService) {}

  private readKey(path?: string): string | undefined {
    if (!path) return undefined;
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return undefined;
    }
  }

  createJwtOptions(): JwtModuleOptions {
    // Docker secrets land here when mounted (fall back to env-provided PEM).
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

    if (isProduction && !privateKey) {
      throw new Error(
        '[JWT] RS256 private key is REQUIRED in production. ' +
          'Mount it via JWT_PRIVATE_KEY_PATH (or the jwt_private_key Docker secret) ' +
          '— the shared HS256 dev fallback is disabled outside development.',
      );
    }

    return {
      privateKey: privateKey ?? 'schoolsync-dev-secret-key-not-for-production',
      publicKey: publicKey ?? 'schoolsync-dev-secret-key-not-for-production',
      signOptions: {
        algorithm: privateKey ? 'RS256' : 'HS256',
        issuer: this.config.get<string>('JWT_ISSUER') ?? 'schoolsync',
        audience: this.config.get<string>('JWT_AUDIENCE') ?? 'schoolsync-users',
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
      },
      verifyOptions: {
        algorithms: privateKey ? ['RS256'] : ['HS256'],
      },
    };
  }
}
