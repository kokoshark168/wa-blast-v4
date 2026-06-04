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

let hub: WsHub | null = null;
export function initHub(server: Server): WsHub {
  if (!hub) hub = new WsHub(server);
  return hub;
}
export function getHub(): WsHub | null {
  return hub;
}
