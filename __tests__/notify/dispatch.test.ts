import { DiscordChannel } from '@/lib/notify/discord';
import { EmailChannel } from '@/lib/notify/email';
import { TelegramChannel } from '@/lib/notify/telegram';
import { allChannels, dispatch } from '@/lib/notify';
import type { NotificationPayload } from '@/lib/notify/types';

const payload: NotificationPayload = {
  title: 'Test alert',
  body: 'Body text',
  severity: 80,
  url: 'https://app.example/alert/1',
};

/** Snapshot & restore the relevant env vars around each test. */
const ENV_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'DISCORD_WEBHOOK_URL',
  'SMTP_HOST',
  'SMTP_USER',
];

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  jest.restoreAllMocks();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('TelegramChannel', () => {
  it('is unconfigured and returns false without a token+chat id', async () => {
    const ch = new TelegramChannel();
    expect(ch.isConfigured()).toBe(false);
    const fetchSpy = jest.spyOn(global, 'fetch' as never);
    expect(await ch.send(payload)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts to the Bot API when configured', async () => {
    const ch = new TelegramChannel('123456', 'BOT_TOKEN');
    expect(ch.isConfigured()).toBe(true);
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue({ ok: true } as Response);
    expect(await ch.send(payload)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/botBOT_TOKEN/sendMessage');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('returns false on a non-2xx response', async () => {
    const ch = new TelegramChannel('123456', 'BOT_TOKEN');
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 429 } as Response);
    expect(await ch.send(payload)).toBe(false);
  });

  it('returns false (never throws) when fetch rejects', async () => {
    const ch = new TelegramChannel('123456', 'BOT_TOKEN');
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    expect(await ch.send(payload)).toBe(false);
  });

  it('reads env when no constructor args are given', async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'ENV_TOKEN';
    process.env.TELEGRAM_CHAT_ID = '999';
    const ch = new TelegramChannel();
    expect(ch.isConfigured()).toBe(true);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    expect(await ch.send(payload)).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/botENV_TOKEN/');
  });
});

describe('DiscordChannel', () => {
  it('is unconfigured without a webhook url', async () => {
    const ch = new DiscordChannel();
    expect(ch.isConfigured()).toBe(false);
    expect(await ch.send(payload)).toBe(false);
  });

  it('posts an embed when configured', async () => {
    const ch = new DiscordChannel('https://discord.test/webhook');
    expect(ch.isConfigured()).toBe(true);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    expect(await ch.send(payload)).toBe(true);
    const [, init] = fetchMock.mock.calls[0];
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.embeds[0].title).toBe('Test alert');
  });
});

describe('EmailChannel', () => {
  it('is unconfigured without SMTP_HOST + SMTP_USER', async () => {
    const ch = new EmailChannel();
    expect(ch.isConfigured()).toBe(false);
    expect(await ch.send(payload)).toBe(false);
  });

  it('sends via an injected transport when configured', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'abc' });
    const ch = new EmailChannel(
      { host: 'smtp.test', user: 'u', to: 'to@test' },
      () => ({ sendMail }),
    );
    expect(ch.isConfigured()).toBe(true);
    expect(await ch.send(payload)).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: 'to@test', subject: 'Test alert' });
  });

  it('returns false when no recipient is resolvable', async () => {
    const sendMail = jest.fn();
    const ch = new EmailChannel({ host: 'smtp.test', user: 'u' }, () => ({ sendMail }));
    expect(await ch.send(payload)).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe('allChannels', () => {
  it('registers telegram, discord and email', () => {
    const names = allChannels().map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['telegram', 'discord', 'email']));
  });
});

describe('dispatch', () => {
  it('returns ok:false for unconfigured channels without I/O', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never);
    const results = await dispatch(payload, ['telegram', 'discord', 'email']);
    expect(results).toEqual([
      { channel: 'telegram', ok: false },
      { channel: 'discord', ok: false },
      { channel: 'email', ok: false },
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns ok:false for unknown channel names', async () => {
    const results = await dispatch(payload, ['carrier-pigeon']);
    expect(results).toEqual([{ channel: 'carrier-pigeon', ok: false }]);
  });

  it('attempts configured channels via an injected registry', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    const registry = [new TelegramChannel('chat', 'tok'), new DiscordChannel('https://x/y')];
    const results = await dispatch(payload, ['telegram', 'discord'], registry);
    expect(results).toEqual([
      { channel: 'telegram', ok: true },
      { channel: 'discord', ok: true },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
