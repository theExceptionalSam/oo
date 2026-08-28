import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OutboundEmail {
  to: string;
  subject: string;
  body: string; // plain text; rendered from the template registry
}

/**
 * Email delivery via the SendGrid v3 REST API (fetch — no SDK dependency).
 *
 * - SENDGRID_API_KEY set  → real delivery
 * - unset                 → logged to stdout (dev/demo mode) so flows stay
 *                           testable without an account
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string | undefined;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('SENDGRID_API_KEY') || undefined;
    this.from = this.config.get<string>('SENDGRID_FROM_EMAIL') || 'no-reply@schoolsync.example';
  }

  get enabled(): boolean {
    return !!this.apiKey;
  }

  async send(email: OutboundEmail): Promise<{ delivered: boolean; mode: 'sendgrid' | 'log' }> {
    if (!this.apiKey) {
      this.logger.log(`[mail:log-mode] to=${email.to} subject="${email.subject}"`);
      return { delivered: false, mode: 'log' };
    }

    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: email.to }] }],
          from: { email: this.from },
          subject: email.subject,
          content: [{ type: 'text/plain', value: email.body }],
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        this.logger.error(`SendGrid ${res.status}: ${detail.slice(0, 200)}`);
        return { delivered: false, mode: 'sendgrid' };
      }
      return { delivered: true, mode: 'sendgrid' };
    } catch (err) {
      this.logger.error(`SendGrid request failed: ${(err as Error).message}`);
      return { delivered: false, mode: 'sendgrid' };
    }
  }
}
