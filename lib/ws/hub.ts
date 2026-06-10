import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { childLogger } from '@/lib/logger';
import type { WsChannel, WsMessage } from '@/types';

const log = childLogger('ws-hub');

interface Client {
  socket: WebSocket;
  channels: Set<WsChannel>;
}

/**
 * In-process pub/sub hub for real-time module updates. Clients subscribe to
 * channels (whale, hyperliquid, alpha, …) and receive broadcasts. For a
 * multi-instance deployment this can be backed by the Redis publish() helper.
 */
export class WsHub {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, Client>();

  constructor(server: Server, path = '/ws') {
    this.wss = new WebSocketServer({ server, path });
    this.wss.on('connection', (socket) => this.onConnect(socket));
    log.info({ path }, 'websocket hub attached');
  }

  private onConnect(socket: WebSocket) {
    const client: Client = { socket, channels: new Set() };
    this.clients.set(socket, client);

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          action: 'subscribe' | 'unsubscribe';
          channel: WsChannel;
        };
        if (msg.action === 'subscribe') client.channels.add(msg.channel);
        if (msg.action === 'unsubscribe') client.channels.delete(msg.channel);
      } catch {
        log.warn('received malformed ws message');
      }
    });

    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', () => this.clients.delete(socket));

    socket.send(JSON.stringify({ channel: 'alerts', event: 'connected', data: { ok: true }, ts: Date.now() }));
  }

  /** Broadcast a message to every client subscribed to its channel. */
  broadcast<T>(message: WsMessage<T>) {
    const payload = JSON.stringify(message);
    for (const client of this.clients.values()) {
      if (client.channels.has(message.channel) && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(payload);
      }
    }
  }

  get clientCount() {
    return this.clients.size;
  }
}

/**
 * The minimal hub surface shared between this module and the plain-JS hub
 * attached in server.js (which publishes itself on globalThis so API routes —
 * running in the same process — can broadcast).
 */
export interface BroadcastHub {
  broadcast<T>(message: WsMessage<T>): void;
  readonly clientCount: number;
}

const HUB_GLOBAL_KEY = '__alphaflowWsHub';

let hub: WsHub | null = null;
export function initHub(server: Server): WsHub {
  if (!hub) {
    hub = new WsHub(server);
    (globalThis as Record<string, unknown>)[HUB_GLOBAL_KEY] = hub;
  }
  return hub;
}

/** Resolve the active hub: in-module instance first, then the server.js-attached one. */
export function getHub(): BroadcastHub | null {
  if (hub) return hub;
  const globalHub = (globalThis as Record<string, unknown>)[HUB_GLOBAL_KEY];
  return (globalHub as BroadcastHub | undefined) ?? null;
}

/**
 * Fire-and-forget broadcast helper for API routes. No-ops when the hub is not
 * attached (e.g. `next dev` without the custom server, or tests).
 */
export function publishWs<T>(channel: WsChannel, event: string, data: T): void {
  const h = getHub();
  if (!h) return;
  try {
    h.broadcast({ channel, event, data, ts: Date.now() });
  } catch (err) {
    log.warn({ err, channel }, 'ws broadcast failed');
  }
}
