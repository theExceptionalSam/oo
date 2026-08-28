import { createHash, randomBytes } from 'crypto';

export function hashPayload(payload: string, algorithm = 'sha256'): string {
  return createHash(algorithm).update(payload).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function paginate<T>(items: T[], page: number, limit: number) {
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    meta: { page, limit, total: items.length, totalPages: Math.ceil(items.length / limit) },
  };
}
