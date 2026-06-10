/**
 * Notification dispatch facade. Maintains a registry of delivery channels and
 * fans a payload out to a requested subset, attempting each configured channel
 * and collecting per-channel results. Unconfigured channels resolve `ok:false`.
 */
import { childLogger } from '@/lib/logger';
import { DiscordChannel } from '@/lib/notify/discord';
import { EmailChannel } from '@/lib/notify/email';
import { TelegramChannel } from '@/lib/notify/telegram';
import type { NotificationChannel, NotificationPayload } from '@/lib/notify/types';

export type { NotificationChannel, NotificationPayload } from '@/lib/notify/types';
export { TelegramChannel } from '@/lib/notify/telegram';
export { DiscordChannel } from '@/lib/notify/discord';
export { EmailChannel } from '@/lib/notify/email';

const log = childLogger('notify:dispatch');

/** Result of attempting a single channel. */
export interface DispatchResult {
  channel: string;
  ok: boolean;
}

/**
 * Build the default channel registry (one instance per transport). Channels read
 * their own config from the environment at send time, so this is cheap and safe
 * to construct eagerly.
 */
export function allChannels(): NotificationChannel[] {
  return [new TelegramChannel(), new DiscordChannel(), new EmailChannel()];
}

/**
 * Dispatch `payload` to the named `channels`.
 *
 * - Unknown channel names yield `{ channel, ok: false }`.
 * - Configured channels are attempted; their boolean result is reported.
 * - Unconfigured channels short-circuit to `ok:false` without I/O.
 * All sends run in parallel; this never throws.
 *
 * @param payload   The notification to deliver.
 * @param channels  Channel names to target (e.g. `['telegram','discord']`).
 * @param registry  Optional channel registry override (for tests/custom config).
 */
export async function dispatch(
  payload: NotificationPayload,
  channels: string[],
  registry: NotificationChannel[] = allChannels(),
): Promise<DispatchResult[]> {
  const byName = new Map(registry.map((c) => [c.name, c]));

  const results = await Promise.all(
    channels.map(async (name): Promise<DispatchResult> => {
      const channel = byName.get(name);
      if (!channel) {
        log.warn({ channel: name }, 'unknown notification channel');
        return { channel: name, ok: false };
      }
      if (!channel.isConfigured()) {
        return { channel: name, ok: false };
      }
      const ok = await channel.send(payload);
      return { channel: name, ok };
    }),
  );

  log.debug({ requested: channels.length, sent: results.filter((r) => r.ok).length }, 'dispatched');
  return results;
}
