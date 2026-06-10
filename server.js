// Custom Next.js server that attaches the WebSocket hub for real-time updates.
const { createServer } = require('http');
const next = require('next');
const { WebSocketServer, WebSocket } = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev });
const handle = app.getRequestHandler();

const VALID_CHANNELS = new Set([
  'whale',
  'smart-money',
  'hyperliquid',
  'open-interest',
  'liquidations',
  'sentiment',
  'alpha',
  'alerts',
]);

/**
 * In-process pub/sub hub. Mirrors the contract of lib/ws/hub.ts (subscribe /
 * unsubscribe actions, broadcast(message)). The instance is published on
 * globalThis so API route code (which runs in this same process) can reach it
 * via lib/ws/hub.ts getHub().
 */
function attachHub(server, path = '/ws') {
  const wss = new WebSocketServer({ server, path });
  const clients = new Map(); // socket -> Set<channel>

  wss.on('connection', (socket) => {
    const channels = new Set();
    clients.set(socket, channels);
    socket.isAlive = true;

    socket.on('pong', () => {
      socket.isAlive = true;
    });

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (!VALID_CHANNELS.has(msg.channel)) return;
        if (msg.action === 'subscribe') channels.add(msg.channel);
        if (msg.action === 'unsubscribe') channels.delete(msg.channel);
      } catch {
        /* ignore malformed frames */
      }
    });

    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));

    socket.send(
      JSON.stringify({ channel: 'alerts', event: 'connected', data: { ok: true }, ts: Date.now() })
    );
  });

  // Keepalive: terminate dead connections, ping the rest (also keeps idle
  // connections alive through proxies like nginx with 65s timeouts).
  const heartbeat = setInterval(() => {
    for (const socket of clients.keys()) {
      if (socket.isAlive === false) {
        clients.delete(socket);
        socket.terminate();
        continue;
      }
      socket.isAlive = false;
      socket.ping();
    }
  }, 30_000);
  wss.on('close', () => clearInterval(heartbeat));

  const hub = {
    broadcast(message) {
      const payload = JSON.stringify(message);
      for (const [socket, channels] of clients.entries()) {
        if (channels.has(message.channel) && socket.readyState === WebSocket.OPEN) {
          socket.send(payload);
        }
      }
    },
    get clientCount() {
      return clients.size;
    },
  };

  // Expose to API routes (same process) — consumed by lib/ws/hub.ts getHub().
  globalThis.__alphaflowWsHub = hub;
  console.log(`[ws] hub attached at ${path}`);
  return hub;
}

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));
  attachHub(server);

  server.listen(port, () => {
    console.log(`> AlphaFlow Terminal ready on http://localhost:${port}`);
  });
});
