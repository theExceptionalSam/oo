import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

export interface SearchHit {
  id: string;
  score: number;
  source: Record<string, unknown>;
}

/**
 * Search abstraction. In production this would wrap the Elasticsearch JS client.
 * For local/dev/test we fall back to a simple in-memory substring search.
 */
@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly index = new Map<string, Record<string, unknown>>();

  onModuleInit() {
    this.logger.log('SearchService ready (in-memory fallback)');
  }

  async indexDocument(index: string, id: string, body: Record<string, unknown>): Promise<void> {
    this.index.set(`${index}:${id}`, body);
  }

  async search(index: string, query: string, fields: string[] = []): Promise<SearchHit[]> {
    const q = query.toLowerCase();
    const hits: SearchHit[] = [];
    for (const [key, body] of this.index.entries()) {
      if (!key.startsWith(`${index}:`)) continue;
      const haystack = fields.length
        ? fields.map((f) => String(body[f] ?? '')).join(' ').toLowerCase()
        : JSON.stringify(body).toLowerCase();
      if (haystack.includes(q)) {
        hits.push({ id: key.split(':')[1], score: 1, source: body });
      }
    }
    return hits;
  }

  async remove(index: string, id: string): Promise<void> {
    this.index.delete(`${index}:${id}`);
  }
}
