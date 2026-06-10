/**
 * Telegram notification channel. Self-contained: reads `TELEGRAM_BOT_TOKEN` and
 * a target chat id (constructor param or `TELEGRAM_CHAT_ID`) and POSTs to the
 * Bot API via `fetch`. No coupling to the ingestion `TelegramService`.
 */
import { childLogger } from '@/lib/logger';
import type { NotificationChannel, NotificationPayload } from '@/lib/notify/types';

const log = childLogger('notify:telegram');
const API_BASE = 'https://api.telegram.org';

/** Format a payload into a Markdown Telegram message. */
function render(payload: NotificationPayload): string {
  const head = `*${payload.title}*`;
  const lines = [head, payload.body];
  if (payload.url) lines.push(payload.url);
  return lines.join('\n');
}

export class TelegramChannel implements NotificationChannel {
  readonly name = 'telegram';

  private readonly chatId?: string;

  /**
   * @param chatId Target chat id. Falls back to `TELEGRAM_CHAT_ID` at send time.
   * @param token  Bot token. Falls back to `TELEGRAM_BOT_TOKEN` at send time.
   */
  constructor(
    chatId?: string,
    private readonly token?: string,
  ) {
    this.chatId = chatId;
  }

  private resolvedToken(): string | undefined {
    return this.token ?? process.env.TELEGRAM_BOT_TOKEN;
  }

  private resolvedChatId(): string | undefined {
    return this.chatId ?? process.env.TELEGRAM_CHAT_ID;
  }

  isConfigured(): boolean {
    return Boolean(this.resolvedToken() && this.resolvedChatId());
  }

  async send(payload: NotificationPayload): Promise<boolean> {
    const token = this.resolvedToken();
    const chatId = this.resolvedChatId();
    if (!token || !chatId) {
      log.debug('telegram channel unconfigured — skipping');
      return false;
    }

    try {
      const res = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: render(payload),
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) {
        log.warn({ status: res.status }, 'telegram send failed');
        return false;
      }
      return true;
    } catch (err) {
      log.warn({ err }, 'telegram send threw');
      return false;
    }
  }
}
