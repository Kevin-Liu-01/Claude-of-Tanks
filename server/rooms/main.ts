/**
 * The LAN / offline multiplayer helper: `npm run server:mp`.
 *
 * One process, one port: the v2 room service (`/rooms/<CODE>`) and the match
 * service (`/match`, `/healthz`, `/metrics`) from `server/rooms/serve.ts`.
 * Browsers on the local network open the game with `?mp=v2`, choose LAN, and
 * the client resolves the room endpoint to this port (src/mp/session/endpoint.ts).
 *
 * Environment (names only):
 *   COT_ROOMS_PORT              TCP port (default 8792)
 *   COT_ROOMS_HOST              bind address (default 0.0.0.0)
 *   COT_ROOMS_ALLOWED_ORIGINS   comma-separated exact origins; unset allows any (LAN)
 *   COT_MATCH_SEAT_SECRET       HMAC secret for seat tokens (generated per run when unset: LAN only)
 *   COT_MATCH_CONTROL_SECRET    bearer secret of the control routes (defaults to the seat secret)
 *   COT_MATCH_WORLD             'dedicated' (collision shards, default) | 'terrain'
 *   COT_MATCH_LOG_LEVEL         debug | info | warn | error
 */
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { installProcessShutdown } from '../processShutdown.ts';
import { createLogger, parseLogLevel } from '../match/log.ts';
import { createRoomsServer } from './serve.ts';

function integerEnv(name: string, fallback: number, low: number, high: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < low || value > high) throw new TypeError(`${name} must be an integer ${low}..${high}`);
  return value;
}

export async function startRoomsServerFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const log = createLogger({ level: parseLogLevel(env.COT_MATCH_LOG_LEVEL) });
  let seatSecret = env.COT_MATCH_SEAT_SECRET ?? '';
  if (seatSecret.length < 16) {
    seatSecret = randomBytes(24).toString('hex');
    log.info('COT_MATCH_SEAT_SECRET unset: generated a per-run secret (LAN helper only)');
  }
  const allowedOrigins = env.COT_ROOMS_ALLOWED_ORIGINS
    ? env.COT_ROOMS_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : null;
  const world = env.COT_MATCH_WORLD === 'terrain' ? 'terrain' : 'dedicated';
  return createRoomsServer({
    host: env.COT_ROOMS_HOST || '0.0.0.0',
    port: integerEnv('COT_ROOMS_PORT', 8792, 1, 65535),
    seatSecret,
    controlSecret: env.COT_MATCH_CONTROL_SECRET || seatSecret,
    allowedOrigins,
    world,
    log,
  });
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  startRoomsServerFromEnv().then((server) => {
    installProcessShutdown(() => server.close());
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
