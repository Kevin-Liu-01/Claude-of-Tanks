#!/usr/bin/env node
/**
 * Local Jev proxy for development (docs/JEV-COMMANDER.md "Dev path").
 *
 * The Vite dev server has no function runtime, so this wraps api/jev.ts in a
 * plain HTTP server. It reads TYPESAFE_API_KEY from the environment (never from
 * a file in the repository), accepts `http://localhost:*` origins, and serves
 * the same `/api/jev` route the production function does:
 *
 *   set -a; source /path/to/typesafe.env; set +a   # TYPESAFE_API_KEY=...
 *   npm run jev:dev                                 # http://127.0.0.1:8794/api/jev
 *
 * The game reaches it through the Vite dev proxy (vite.config.ts forwards
 * /api/jev here) or through VITE_JEV_URL=http://127.0.0.1:8794/api/jev.
 */
import { createServer } from 'node:http';
import { createJevHandler } from '../../api/jev.ts';

const port = Number(process.env.COT_JEV_PORT || 8794);
const host = process.env.COT_JEV_HOST || '127.0.0.1';
if (!String(process.env.TYPESAFE_API_KEY || '').trim()) {
  console.warn('[jev-dev] TYPESAFE_API_KEY is not set: every request answers 503 not_configured');
}
const handler = createJevHandler({ allowLocalOrigins: true });
const server = createServer((request, response) => {
  const path = String(request.url || '').split('?')[0];
  if (path !== '/api/jev') {
    response.statusCode = 404;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({ error: 'not_found' }));
    return;
  }
  handler(request, response).catch((error) => {
    console.error(`[jev-dev] handler failed: ${error instanceof Error ? error.message : String(error)}`);
    if (!response.headersSent) response.statusCode = 500;
    response.end();
  });
});
server.listen(port, host, () => {
  console.log(`[jev-dev] Jev proxy listening on http://${host}:${port}/api/jev`);
});
const shutdown = (): void => { server.close(() => process.exit(0)); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
