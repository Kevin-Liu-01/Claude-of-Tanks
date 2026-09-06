import { createSignalingServer } from '../server/signalingServer.ts';
import { DistributedSignalingRoomStore } from '../server/distributedRoomStore.ts';
import { createRetiredSignalingServer } from '../server/signalingCutover.ts';

// Cached clients must refresh after cutover; they must not keep spending Redis
// commands by reconnecting to the retired endpoint. Keep the old resource intact.
const retired = process.env.COT_SIGNAL_BACKEND === 'cloudflare';

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
const restUrl = process.env.COT_SIGNAL_REDIS_KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
const restToken = process.env.COT_SIGNAL_REDIS_KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
const redisConfigured = Boolean(redisUrl || restUrl || restToken);
if (!retired && process.env.VERCEL && !redisConfigured) {
  throw new Error('Production signaling requires the distributed Redis room store');
}
if (!retired && redisConfigured && (!redisUrl || !restUrl || !restToken)) {
  throw new Error('Production signaling requires Redis TCP and REST credentials');
}
const store = !retired && redisUrl
  ? new DistributedSignalingRoomStore({ redisUrl, restUrl, restToken })
  : undefined;

// WebSocket connections remain pinned to one Fluid-compute instance. Redis
// owns room membership and durable signaling mailboxes; pub/sub is an
// optional low-latency wake-up while client polling is the recovery path.
const signaling = retired ? { server: createRetiredSignalingServer() } : createSignalingServer({
  allowedOrigins: [...new Set([...OFFICIAL_ORIGINS, ...configuredOrigins])],
  webSocketPaths: ['/api/signal'],
  healthPaths: ['/api/signal'],
  ...(store ? { store } : {}),
});

export default signaling.server;
