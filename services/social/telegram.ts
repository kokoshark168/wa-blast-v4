import { BaseDataSource } from '@/services/base';

const BASE = 'https://api.telegram.org';

/** Telegram Bot API response envelope. */
interface TelegramEnvelope<T> {
  ok: boolean;
  result: T;
  error_code?: number;
  description?: string;
}

/** A subset of the Telegram `Message` object we consume. */
export interface TelegramMessage {
  message_id: number;
  date: number;
  text?: string;
  chat: { id: number; type: string; title?: string; username?: string };
  from?: { id: number; is_bot: boolean; username?: string; first_name?: string };
}

/** A Telegram `Update` (only the fields relevant to ingestion). */
export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  channel_post?: TelegramMessage;
}

function token(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

/**
 * Telegram Bot API adapter, used both to ingest channel/chat messages
 * (`getUpdates`) and to send notifications (`sendMessage`). Requires
 * `TELEGRAM_BOT_TOKEN`; without it the service is unconfigured, `getUpdates`
 * returns `[]`, and `sendMessage` throws a clear error.
 */
export class TelegramService extends BaseDataSource {
  readonly name = 'telegram';

  constructor() {
    super(BASE);
  }

  /** True only when a bot token is present. */
  isConfigured(): boolean {
    return Boolean(token());
  }

  protected async ping(): Promise<void> {
    await this.call('getMe');
  }

  /** Build the bot-scoped path segment, throwing if no token is set. */
  private botPath(method: string): string {
    const t = token();
    if (!t) throw new Error('telegram: TELEGRAM_BOT_TOKEN not configured');
    return `/bot${t}/${method}`;
  }

  /** Generic typed call to a Bot API method, unwrapping the `ok`/`result` envelope. */
  private async call<T>(method: string, payload?: Record<string, unknown>): Promise<T> {
    const env = await this.request<TelegramEnvelope<T>>({
      url: this.botPath(method),
      method: 'POST',
      data: payload ?? {},
    });
    if (!env.ok) {
      throw new Error(`telegram ${method} error ${env.error_code}: ${env.description}`);
    }
    return env.result;
  }

  /**
   * Poll for new updates (messages/channel posts). Returns `[]` when the bot is
   * not configured.
   * @param offset Identifier of the first update to return (for acknowledging).
   * @param limit Maximum number of updates to retrieve (1..100).
   */
  async getUpdates(offset?: number, limit = 100): Promise<TelegramUpdate[]> {
    if (!this.isConfigured()) return [];
    return this.call<TelegramUpdate[]>('getUpdates', {
      offset,
      limit: Math.min(Math.max(limit, 1), 100),
      timeout: 0,
    });
  }

  /**
   * Send a text message to a chat or channel.
   * @param chatId Numeric chat id or `@channelusername`.
   * @param text Message body (Markdown formatting enabled).
   */
  async sendMessage(chatId: number | string, text: string): Promise<TelegramMessage> {
    return this.call<TelegramMessage>('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  }
}
