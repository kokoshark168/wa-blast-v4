// Custom Next.js server that attaches the WebSocket hub for real-time updates.
const { createServer } = require('http');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  const server = createServer((req, res) => handle(req, res));

  // Attach WebSocket hub (compiled from lib/ws/hub.ts at runtime via Next build).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { initHub } = require('./.next/server/ws-hub.js');
    if (initHub) initHub(server);
  } catch (err) {
    console.warn('[ws] hub not attached:', err.message);
  }

  server.listen(port, () => {
    console.log(`> AlphaFlow Terminal ready on http://localhost:${port}`);
  });
});
