/**
 * Notification delivery contracts. A `NotificationChannel` is a self-contained
 * transport (Telegram, Discord, e-mail, …) that reports whether it is configured
 * and attempts a single best-effort delivery. Pure interfaces — no I/O here.
 */

/** A transport-agnostic notification to deliver. */
export interface NotificationPayload {
  /** Short headline (used as the message bold line / e-mail subject). */
  title: string;
  /** Human-readable body. */
  body: string;
  /** Severity 0..100 (drives colour/emoji; higher = more urgent). */
  severity: number;
  /** Optional deep link surfaced with the notification. */
  url?: string;
  /** Optional structured context attached to the message. */
  metadata?: Record<string, unknown>;
}

/** A single delivery transport. */
export interface NotificationChannel {
  /** Stable channel identifier (e.g. `'telegram'`). */
  name: string;
  /** True when the required env/config is present so `send` can run. */
  isConfigured(): boolean;
  /**
   * Attempt to deliver `payload`. Resolves `true` on success, `false` on any
   * failure (unconfigured, network error, non-2xx). Never throws.
   */
  send(payload: NotificationPayload): Promise<boolean>;
}
