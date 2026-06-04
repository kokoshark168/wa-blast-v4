/**
 * E-mail notification channel backed by nodemailer over SMTP.
 *
 * Configuration (env, all optional except host+user which gate `isConfigured`):
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS,
 *   SMTP_SECURE ('true' for implicit TLS), SMTP_FROM (default SMTP_USER),
 *   SMTP_TO (default recipient; can be overridden per send via payload.metadata.to).
 *
 * The transport is created lazily on first send so importing this module never
 * touches the network and works in tests/offline. nodemailer has no bundled
 * `@types`, so a minimal local surface is declared here to keep strict TS happy.
 */
import { childLogger } from '@/lib/logger';
import type { NotificationChannel, NotificationPayload } from '@/lib/notify/types';

const log = childLogger('notify:email');

/** Minimal subset of the nodemailer API this module relies on. */
interface MailMessage {
  from?: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}
interface Transporter {
  sendMail(message: MailMessage): Promise<{ messageId?: string }>;
}
interface NodemailerLike {
  createTransport(opts: Record<string, unknown>): Transporter;
}

/** SMTP settings resolved from the environment. */
export interface SmtpConfig {
  host?: string;
  port: number;
  user?: string;
  pass?: string;
  secure: boolean;
  from?: string;
  to?: string;
}

function readConfig(): SmtpConfig {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    secure: process.env.SMTP_SECURE === 'true',
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: process.env.SMTP_TO,
  };
}

export class EmailChannel implements NotificationChannel {
  readonly name = 'email';

  private transporter?: Transporter;

  /**
   * @param config Optional config override (merged over env at resolve time).
   * @param transportFactory Optional injection point for tests; defaults to a
   *   lazy `require('nodemailer')`.
   */
  constructor(
    private readonly config?: Partial<SmtpConfig>,
    private readonly transportFactory?: (opts: Record<string, unknown>) => Transporter,
  ) {}

  private resolved(): SmtpConfig {
    return { ...readConfig(), ...this.config };
  }

  isConfigured(): boolean {
    const c = this.resolved();
    return Boolean(c.host && c.user);
  }

  /** Lazily build (and memoize) the SMTP transport. */
  private getTransport(): Transporter {
    if (this.transporter) return this.transporter;
    const c = this.resolved();
    const opts: Record<string, unknown> = {
      host: c.host,
      port: c.port,
      secure: c.secure,
      auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    };
    if (this.transportFactory) {
      this.transporter = this.transportFactory(opts);
    } else {
      // Lazy require keeps module import side-effect free and offline-safe.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodemailer = require('nodemailer') as NodemailerLike;
      this.transporter = nodemailer.createTransport(opts);
    }
    return this.transporter;
  }

  async send(payload: NotificationPayload): Promise<boolean> {
    if (!this.isConfigured()) {
      log.debug('email channel unconfigured — skipping');
      return false;
    }
    const c = this.resolved();
    const to =
      (typeof payload.metadata?.to === 'string' ? payload.metadata.to : undefined) ?? c.to;
    if (!to) {
      log.warn('email send skipped — no recipient (SMTP_TO or metadata.to)');
      return false;
    }

    const text = payload.url ? `${payload.body}\n\n${payload.url}` : payload.body;
    try {
      await this.getTransport().sendMail({
        from: c.from,
        to,
        subject: payload.title,
        text,
      });
      return true;
    } catch (err) {
      log.warn({ err }, 'email send threw');
      return false;
    }
  }
}
