/**
 * Match service entry point: `node server/match/main.ts`.
 *
 * Environment (names only; values live in the platform's secret store):
 *   COT_MATCH_PORT             TCP port (default 8791)
 *   COT_MATCH_HOST             bind address (default 0.0.0.0)
 *   COT_MATCH_ALLOWED_ORIGINS  comma-separated exact origins; unset allows any (LAN / development)
 *   COT_MATCH_SEAT_SECRET      HMAC secret shared with the room service (required, >= 16 chars)
 *   COT_MATCH_MAX_ACTORS       rooms this process may host at once (default 1 on Cloudflare, N on a VPS)
 *   COT_MATCH_LOG_LEVEL        debug | info | warn | error (default info)
 *
 * SIGTERM / SIGINT drain: no new admissions, every actor closes its clients
 * with SERVER_DRAIN, the listeners close, the process exits within 10 s.
 */
import { fileURLToPath } from 'node:url';
import { installProcessShutdown } from '../processShutdown.ts';
import { createLogger, parseLogLevel } from './log.ts';
import { createMatchService } from './service.ts';

function integerEnv(name: string, fallback: number, low: number, high: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < low || value > high) throw new TypeError(`${name} must be an integer ${low}..${high}`);
  return value;
}

export async function startMatchServiceFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const log = createLogger({ level: parseLogLevel(env.COT_MATCH_LOG_LEVEL) });
  const seatSecret = env.COT_MATCH_SEAT_SECRET ?? '';
  if (seatSecret.length < 16) throw new TypeError('COT_MATCH_SEAT_SECRET must be set (at least 16 characters)');
  const allowedOrigins = env.COT_MATCH_ALLOWED_ORIGINS
    ? env.COT_MATCH_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
    : null;
  return createMatchService({
    host: env.COT_MATCH_HOST || '0.0.0.0',
    port: integerEnv('COT_MATCH_PORT', 8791, 1, 65535),
    allowedOrigins,
    seatSecret,
    maxActors: integerEnv('COT_MATCH_MAX_ACTORS', 1, 1, 1024),
    log,
  });
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  startMatchServiceFromEnv().then((service) => {
    installProcessShutdown(() => service.close());
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
