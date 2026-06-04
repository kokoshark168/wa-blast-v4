/**
 * Discord notification channel. Posts a rich embed to a webhook URL
 * (`DISCORD_WEBHOOK_URL` or a constructor override) via `fetch`.
 */
import { childLogger } from '@/lib/logger';
import { clamp } from '@/lib/quant';
import type { NotificationChannel, NotificationPayload } from '@/lib/notify/types';

const log = childLogger('notify:discord');

/** Map severity 0..100 to a Discord embed colour (green → amber → red). */
function colorFor(severity: number): number {
  const s = clamp(severity, 0, 100);
  if (s >= 75) return 0xed4245; // red
  if (s >= 50) return 0xfaa61a; // amber
  if (s >= 25) return 0xfee75c; // yellow
  return 0x57f287; // green
}

export class DiscordChannel implements NotificationChannel {
  readonly name = 'discord';

  constructor(private readonly webhookUrl?: string) {}

  private resolvedUrl(): string | undefined {
    return this.webhookUrl ?? process.env.DISCORD_WEBHOOK_URL;
  }

  isConfigured(): boolean {
    return Boolean(this.resolvedUrl());
  }

  async send(payload: NotificationPayload): Promise<boolean> {
    const url = this.resolvedUrl();
    if (!url) {
      log.debug('discord channel unconfigured — skipping');
      return false;
    }

    const embed = {
      title: payload.title,
      description: payload.body,
      url: payload.url,
      color: colorFor(payload.severity),
      timestamp: new Date().toISOString(),
    };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      });
      if (!res.ok) {
        log.warn({ status: res.status }, 'discord send failed');
        return false;
      }
      return true;
    } catch (err) {
      log.warn({ err }, 'discord send threw');
      return false;
    }
  }
}
