import { createSignalingServer } from '../server/signalingServer.js';

const OFFICIAL_ORIGINS = [
  'https://cot.kevinliu.studio',
  'https://claudeoftanks.kevinliu.studio',
  'https://claude-of-tanks.vercel.app',
  'https://claude-of-tanks-kl01s-projects.vercel.app',
];

const configuredOrigins = String(process.env.COT_ALLOWED_ORIGINS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

// Vercel's WebSocket Function runtime accepts a standard Node HTTP server.
// The module is instantiated once per Fluid-compute instance, so every
// connection routed to that instance shares the same bounded room store.
const signaling = createSignalingServer({
  allowedOrigins: [...new Set([...OFFICIAL_ORIGINS, ...configuredOrigins])],
  webSocketPaths: ['/api/signal'],
  healthPaths: ['/api/signal'],
});

export default signaling.server;
