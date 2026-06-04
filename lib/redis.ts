import { createClient, type RedisClientType } from 'redis';
import { logger } from './logger';

let client: RedisClientType | null = null;
let connecting: Promise<RedisClientType> | null = null;

/**
 * Lazily-connected Redis singleton. Falls back gracefully: callers should
 * treat a thrown/absent client as a cache miss rather than a hard failure.
 */
export async function getRedis(): Promise<RedisClientType | null> {
  if (client?.isOpen) return client;
  if (connecting) return connecting;

  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn('REDIS_URL not set — caching disabled');
    return null;
  }

  connecting = (async () => {
    const c: RedisClientType = createClient({ url });
    c.on('error', (err) => logger.error({ err }, 'redis error'));
    await c.connect();
    client = c;
    connecting = null;
    return c;
  })();

  try {
    return await connecting;
  } catch (err) {
    logger.error({ err }, 'redis connect failed — running without cache');
    connecting = null;
    return null;
  }
}

/** Get a cached JSON value, or compute + cache it with a TTL (seconds). */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  const redis = await getRedis();
  if (redis) {
    const hit = await redis.get(key);
    if (hit) {
      try {
        return JSON.parse(hit) as T;
      } catch {
        /* fall through to recompute */
      }
    }
  }
  const value = await compute();
  if (redis) {
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  }
  return value;
}

export async function publish(channel: string, message: unknown): Promise<void> {
  const redis = await getRedis();
  if (redis) await redis.publish(channel, JSON.stringify(message));
}
