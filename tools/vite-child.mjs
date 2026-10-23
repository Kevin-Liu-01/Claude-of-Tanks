#!/usr/bin/env node
// A Vite server in its own process for capture tools (tools/capture-hold.mjs startViteChild, 2026-10-22): an
// in-process server's transforms block its owner's event loop, and with it the capture lock's heartbeats.
//   node tools/vite-child.mjs '{"mode":"dev"|"preview","config":{...inline Vite config...}}'
// Prints `cot-vite-child ready <url>` once it serves, and closes on SIGTERM or when its parent's stdin closes.
import { createServer, preview } from 'vite';

const { mode = 'dev', config = {} } = JSON.parse(process.argv[2] || '{}');
const server = mode === 'preview' ? await preview(config) : await createServer(config);
if (mode !== 'preview') await server.listen();
const { port } = server.httpServer.address();
console.log(`cot-vite-child ready http://127.0.0.1:${port}/`);
const close = async () => {
  try { await server.close(); } finally { process.exit(0); }
};
process.once('SIGTERM', close);
process.once('SIGINT', close);
process.stdin.on('end', close);
process.stdin.resume();
