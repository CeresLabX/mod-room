// Startup diagnostic - runs before the main server
const http = require('http');

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

// Simple healthcheck that doesn't need DB
const server = http.createServer((req, res) => {
  if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', ts: Date.now() }));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Healthcheck server listening on ${HOST}:${PORT}`);
});

// Exit after 30 seconds if main server hasn't taken over
setTimeout(() => {
  console.log('Healthcheck server timeout - no main server started');
  process.exit(1);
}, 30000);
