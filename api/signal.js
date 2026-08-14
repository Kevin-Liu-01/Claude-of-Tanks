import { createSignalingServer } from '../server/signalingServer.js';
import { DistributedSignalingRoomStore } from '../server/distributedRoomStore.js';

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

const redisUrl = process.env.COT_SIGNAL_REDIS_REDIS_URL ||
  process.env.COT_SIGNAL_REDIS_KV_URL || '';
const store = redisUrl ? new DistributedSignalingRoomStore({ redisUrl }) : undefined;

// WebSocket connections remain pinned to one Fluid-compute instance, while
// Redis owns room membership and pub/sub carries signaling across instances.
const signaling = createSignalingServer({
  allowedOrigins: [...new Set([...OFFICIAL_ORIGINS, ...configuredOrigins])],
  webSocketPaths: ['/api/signal'],
  healthPaths: ['/api/signal'],
  ...(store ? { store } : {}),
});

export default signaling.server;
