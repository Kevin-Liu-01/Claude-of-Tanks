import { createHmac } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RuntimeValue } from '../src/runtimeTypes.ts';
import { allowedApiOrigins } from './_lib/policy.ts';

/**
 * TURN credential lifetime (INFRA-P7, 2026-10-01; eight hours before). The client fetches `/api/ice` once per peer
 * connection — every connect attempt of the player's link (`WebRtcTransport.connect`: each reconnect and each host
 * migration builds a new connection) and every offer the host accepts (`createRtcHostAcceptor`) — and a connection
 * lives at most one match: the longest clock is 900 s, plus the 5 s countdown and the 8 s ending hold. Cloudflare
 * disconnects a relay shortly after its credential expires and the transport reconnects with a fresh one, so one hour
 * covers every clocked match about four times over and costs an Endless Horde run (no clock) one reconnect per hour on
 * relayed links only. `COT_TURN_TTL_SECONDS` may shorten it to twenty minutes, never lengthen it.
 */
export const ICE_CREDENTIAL_TTL_SECONDS = 60 * 60;
export const ICE_CREDENTIAL_MIN_TTL_SECONDS = 20 * 60;

interface IceConfigHandlerOptions {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** One structured line per upstream failure or configuration fault (never a token, key id or credential). */
  warn?: (line: string) => void;
}

export type IceConfigHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return typeof value === 'object' && value !== null;
}

function send(response: ServerResponse, status: number, body: RuntimeValue): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'private, no-store, max-age=0');
  response.setHeader('vary', 'Origin');
  response.end(JSON.stringify(body));
}

function validIceServers(value: RuntimeValue): value is RTCIceServer[] {
  return Array.isArray(value) && value.length > 0 && value.every((server: RuntimeValue) => {
    if (!isRecord(server)) return false;
    const urls: RuntimeValue[] = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.length > 0 && urls.every(
      (url: RuntimeValue) => typeof url === 'string' && /^(?:stun|turns?):/i.test(url),
    );
  });
}

function credentialTtl(env: NodeJS.ProcessEnv): number {
  const requestedTtl = Number(env.COT_TURN_TTL_SECONDS || ICE_CREDENTIAL_TTL_SECONDS);
  return Math.max(ICE_CREDENTIAL_MIN_TTL_SECONDS, Math.min(ICE_CREDENTIAL_TTL_SECONDS,
    Number.isFinite(requestedTtl) ? Math.round(requestedTtl) : ICE_CREDENTIAL_TTL_SECONDS));
}

/**
 * Who may mint relay credentials (INFRA-P7): a page on this site — a same-origin GET carries
 * `Sec-Fetch-Site: same-origin` and no Origin — or an allow-listed cross-origin frontend, by its Origin. A request with
 * neither (curl, a script) is refused: every credential bills relay egress to the deployment, and the endpoint used to
 * answer an anonymous `curl` with eight hours of TURN access.
 */
function iceRequestAdmitted(request: IncomingMessage, env: NodeJS.ProcessEnv): boolean {
  const origin = String(request.headers?.origin || '');
  if (origin) return allowedApiOrigins(env).has(origin);
  return String(request.headers?.['sec-fetch-site'] || '').toLowerCase() === 'same-origin';
}

interface CoturnCredentialConfiguration {
  iceServers: RTCIceServer[];
  relayOnly: false;
  expiresInSeconds: number;
}

function coturnCredentials(
  env: NodeJS.ProcessEnv,
  now: () => number,
): CoturnCredentialConfiguration | 'invalid' | null {
  const rawUrls = String(env.COT_TURN_URLS || '').trim();
  const secret = String(env.COT_TURN_SHARED_SECRET || '').trim();
  if (!rawUrls && !secret) return null;
  const urls = rawUrls.split(',').map((url) => url.trim()).filter(Boolean);
  if (!secret || urls.length === 0 || urls.some((url) => !/^turns?:/i.test(url))) return 'invalid';
  const ttl = credentialTtl(env);
  const expiresAt = Math.floor(now() / 1_000) + ttl;
  const configuredLabel = String(env.COT_TURN_USERNAME || 'cot').trim();
  const label = configuredLabel.replace(/[^a-z0-9_.-]/gi, '').slice(0, 48) || 'cot';
  const username = `${expiresAt}:${label}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return {
    iceServers: [{ urls: urls.length === 1 ? urls[0] : urls, username, credential }],
    relayOnly: false,
    expiresInSeconds: ttl,
  };
}

export function createIceConfigHandler({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  warn = (line) => console.warn(line),
}: IceConfigHandlerOptions = {}): IceConfigHandler {
  const configurationWarned = new Set<string>();
  const warnConfiguration = (error: string): void => {
    if (configurationWarned.has(error)) return;
    configurationWarned.add(error);
    warn(JSON.stringify({ tag: 'cot-ice', event: 'configuration', error }));
  };
  return async function iceConfig(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'GET') {
      response.setHeader('allow', 'GET');
      send(response, 405, { error: 'method_not_allowed' });
      return;
    }
    if (!iceRequestAdmitted(request, env)) {
      send(response, 403, { error: 'origin_forbidden' });
      return;
    }
    const origin = String(request.headers?.origin || '');
    if (origin) {
      // Explicit external ICE configuration uses credentialed GET. Reflect
      // only an admitted origin; a wildcard would be both incorrect for
      // credentials and broader than this endpoint's deployment allowlist.
      response.setHeader('access-control-allow-origin', origin);
      response.setHeader('access-control-allow-credentials', 'true');
    }

    const staticJson = String(env.COT_TURN_ICE_SERVERS_JSON || '').trim();
    if (staticJson) {
      try {
        const iceServers: RuntimeValue = JSON.parse(staticJson);
        if (!validIceServers(iceServers)) throw new Error('invalid ICE server list');
        send(response, 200, { iceServers, relayOnly: false });
      } catch (_) {
        warnConfiguration('turn_configuration_invalid');
        send(response, 503, { error: 'turn_configuration_invalid' });
      }
      return;
    }

    const coturn = coturnCredentials(env, now);
    if (coturn === 'invalid') {
      warnConfiguration('turn_configuration_invalid');
      send(response, 503, { error: 'turn_configuration_invalid' });
      return;
    }
    if (coturn) {
      send(response, 200, coturn);
      return;
    }

    const keyId = String(env.COT_CLOUDFLARE_TURN_KEY_ID || '').trim();
    const token = String(env.COT_CLOUDFLARE_TURN_API_TOKEN || '').trim();
    if (!keyId || !token) {
      warnConfiguration('turn_service_unconfigured');
      send(response, 503, { error: 'turn_service_unconfigured' });
      return;
    }
    const ttl = credentialTtl(env);
    const startedAt = now();
    // One line per failed upstream call: status, the cause and the latency — a TURN outage used to leave no trace.
    const upstreamFailure = (error: string, upstreamStatus: number | null, reason: string): void => {
      warn(JSON.stringify({
        tag: 'cot-ice', event: 'upstream_failure', error, upstreamStatus, reason, latencyMs: Math.max(0, now() - startedAt),
      }));
    };
    try {
      const upstream = await fetchImpl(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}` +
          '/credentials/generate-ice-servers',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ttl }),
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!upstream.ok) {
        upstreamFailure('turn_service_unavailable', upstream.status, 'http');
        send(response, 503, { error: 'turn_service_unavailable' });
        return;
      }
      let body: RuntimeValue;
      try {
        body = await upstream.json();
      } catch (_) {
        // the client retries this code, as it did when the parse failure fell through to the catch below
        upstreamFailure('turn_service_unavailable', upstream.status, 'invalid_json');
        send(response, 503, { error: 'turn_service_unavailable' });
        return;
      }
      const iceServers = isRecord(body) ? body.iceServers : null;
      if (!validIceServers(iceServers)) {
        upstreamFailure('turn_service_invalid', upstream.status, 'invalid_body');
        send(response, 503, { error: 'turn_service_invalid' });
        return;
      }
      send(response, 200, {
        iceServers,
        relayOnly: false,
        expiresInSeconds: ttl,
      });
    } catch (error) {
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
      upstreamFailure('turn_service_unavailable', null, name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network');
      send(response, 503, { error: 'turn_service_unavailable' });
    }
  };
}

export default createIceConfigHandler();
