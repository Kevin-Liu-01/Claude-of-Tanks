#!/usr/bin/env node
// A Vite server in its own process for capture tools (tools/capture-hold.mjs startViteChild, 2026-10-22): an
// in-process server's transforms block its owner's event loop, and with it the capture lock's heartbeats.
//   node tools/vite-child.mjs '{"mode":"dev"|"preview","config":{...inline Vite config...},"ports":[4400,...]}'
// `ports` (capture-ports.mjs: the capture slot's block) are tried in order with strictPort, then port 0 (OS-assigned):
// the server never drifts into another slot's ports. Without `ports` the config's own port stands.
// Prints `cot-vite-child ready <url>` once it serves, and closes on SIGTERM or when its parent's stdin closes.
import { createServer, preview } from 'vite';
import { bindFirstFree } from './capture-ports.mjs';

const { mode = 'dev', config = {}, ports = null } = JSON.parse(process.argv[2] || '{}');
const key = mode === 'preview' ? 'preview' : 'server';
const start = async (port) => {
  const options = port === null ? config : { ...config, [key]: { ...config[key], port, strictPort: true } };
  const started = mode === 'preview' ? await preview(options) : await createServer(options);
  if (mode !== 'preview') {
    try { await started.listen(); } catch (error) { await started.close().catch(() => {}); throw error; }
  }
  return started;
};
const server = Array.isArray(ports) ? (await bindFirstFree(start, { ports })).server : await start(null);
const { port } = server.httpServer.address();
console.log(`cot-vite-child ready http://127.0.0.1:${port}/`);
const close = async () => {
  try { await server.close(); } finally { process.exit(0); }
};
process.once('SIGTERM', close);
process.once('SIGINT', close);
process.stdin.on('end', close);
process.stdin.resume();
