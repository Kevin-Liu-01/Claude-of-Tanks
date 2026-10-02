/**
 * Relay (TURN) credentials for one peer connection, minted inside the room for a seated player (2026-10-02, lane
 * mp/room-relay-credentials; docs/MULTIPLAYER-V2.md §13.14). The rooms Worker (`cloudflare/rooms`, from its secrets) and
 * the LAN helper (`server/rooms/main.ts`, from its environment) hand one issuer to the room actor's `relayCredentials`
 * port; the actor admits the request (a seat of the running match, the rate windows) and the issuer mints — once per
 * request, never cached, never logged. Until this lane the public `/api/ice` function minted the same credentials from
 * the same names for any page that passed its origin check.
 *
 * Configuration (names only, never values; the first configured source wins):
 *   COT_TURN_ICE_SERVERS_JSON                         a fixed JSON array of ICE servers (another provider, fixed credentials)
 *   COT_TURN_URLS + COT_TURN_SHARED_SECRET            self-hosted coturn (`use-auth-secret`): expiring HMAC credentials
 *     (+ COT_TURN_USERNAME, the label)                made here, no provider call
 *   COT_CLOUDFLARE_TURN_KEY_ID + COT_CLOUDFLARE_TURN_API_TOKEN   Cloudflare Realtime TURN (production): one
 *                                                     generate-ice-servers call per grant
 *   COT_TURN_TTL_SECONDS                              the lease: one hour by default; may shorten it to twenty minutes,
 *                                                     never lengthen it
 *   COT_STUN_URLS                                     the STUN servers a grant carries when no relay can be minted
 *                                                     (comma-separated `stun:` URLs; unset: none)
 *
 * With nothing configured, a configuration fault or a failed provider call, the grant is the STUN servers alone
 * (`relay: false`): the link degrades to direct paths and never fails on the credential. One structured warning per
 * provider failure (status, cause, latency) and one per configuration fault per issuer — never a token, key id or
 * credential.
 *
 * Runtime-neutral (Node 20+ and the Workers runtime): fetch, AbortSignal.timeout, WebCrypto HMAC-SHA1 and btoa — no Node
 * built-in, so the rooms Worker reaches it as it reaches the room actor.
 */
import { ROOM_RELAY_MAX_SERVERS, hasRoomRelayServer, readRoomIceServer } from '../src/mp/room/protocol.ts';
import type { RoomIceServer, RoomRelayPayload } from '../src/mp/room/protocol.ts';

/**
 * The credential lease (INFRA-P7, 2026-10-01; eight hours before). The client asks once per peer connection (reusing
 * one grant for a 30 s burst) and a connection lives at most one match: the longest clock is 900 s, plus the 5 s
 * countdown and the 8 s ending hold. Cloudflare disconnects a relay shortly after its credential expires and the
 * transport reconnects with a fresh one, so one hour covers every clocked match about four times over and costs an
 * Endless Horde run (no clock) one reconnect per hour on relayed links only.
 */
export const RELAY_CREDENTIAL_TTL_SECONDS = 60 * 60;
export const RELAY_CREDENTIAL_MIN_TTL_SECONDS = 20 * 60;
/** The provider call's budget: well inside the client's ROOM_RELAY_REQUEST_TIMEOUT_MS (6 s). */
export const RELAY_PROVIDER_TIMEOUT_MS = 4_000;
const CLOUDFLARE_TURN_KEYS = 'https://rtc.live.cloudflare.com/v1/turn/keys';

/** Every configuration name the issuer reads. */
const RELAY_ENV_NAMES = [
  'COT_TURN_ICE_SERVERS_JSON', 'COT_TURN_URLS', 'COT_TURN_SHARED_SECRET', 'COT_TURN_USERNAME', 'COT_TURN_TTL_SECONDS',
  'COT_CLOUDFLARE_TURN_KEY_ID', 'COT_CLOUDFLARE_TURN_API_TOKEN', 'COT_STUN_URLS',
] as const;
type RelayEnv = Readonly<Partial<Record<typeof RELAY_ENV_NAMES[number], string>>>;

/** The relay names of a wider environment (the Worker's bindings, process.env): string values only. */
export function pickRelayEnv(source: object): RelayEnv {
  const env: Partial<Record<typeof RELAY_ENV_NAMES[number], string>> = {};
  for (const name of RELAY_ENV_NAMES) {
    const value: unknown = (source as Record<string, unknown>)[name];
    if (typeof value === 'string') env[name] = value;
  }
  return env;
}

/** The lease a grant carries: COT_TURN_TTL_SECONDS clamped to [twenty minutes, one hour]; the default is the hour. */
export function relayCredentialTtl(env: RelayEnv): number {
  const requested = Number(env.COT_TURN_TTL_SECONDS || RELAY_CREDENTIAL_TTL_SECONDS);
  return Math.max(RELAY_CREDENTIAL_MIN_TTL_SECONDS, Math.min(RELAY_CREDENTIAL_TTL_SECONDS,
    Number.isFinite(requested) ? Math.round(requested) : RELAY_CREDENTIAL_TTL_SECONDS));
}

type RelayIssuerSource = 'static' | 'coturn' | 'cloudflare' | 'none';

export interface RelayIssuer {
  /** Where this issuer's relays come from (`none`: STUN only — nothing configured, or a configuration fault). */
  readonly source: RelayIssuerSource;
  /** One grant for one peer connection, minted now (never cached); never rejects — a failure is the STUN-only grant. */
  issue(): Promise<RoomRelayPayload>;
}

interface RelayIssuerOptions {
  env: RelayEnv;
  /** The provider call (resolved at call time by default, so a test can observe the global fetch). */
  fetchImpl?: (input: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
  /** One structured line per provider failure or configuration fault (never a token, key id or credential). */
  warn?: (line: string) => void;
}

function readServers(value: unknown): RoomIceServer[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > ROOM_RELAY_MAX_SERVERS) return null;
  const servers: RoomIceServer[] = [];
  for (const entry of value) {
    const server = readRoomIceServer(entry);
    if (!server) return null;
    servers.push(server);
  }
  return servers;
}

/** Base64 of bytes without Node's Buffer (btoa is global in Node 16+ and the Workers runtime). */
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** coturn's `use-auth-secret` credential: base64(HMAC-SHA1(secret, username)). */
async function hmacSha1Base64(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return base64(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message))));
}

type Plan =
  | { source: 'static'; servers: RoomIceServer[] }
  | { source: 'coturn'; urls: string[]; secret: string; label: string }
  | { source: 'cloudflare'; keyId: string; token: string }
  | { source: 'none'; fault: string | null };

/** Which source the configuration names (the first configured one), or the fault that leaves it STUN only. */
function planFrom(env: RelayEnv): Plan {
  const staticJson = String(env.COT_TURN_ICE_SERVERS_JSON || '').trim();
  if (staticJson) {
    let parsed: unknown = null;
    try { parsed = JSON.parse(staticJson); } catch { parsed = null; }
    const servers = readServers(parsed);
    return servers ? { source: 'static', servers } : { source: 'none', fault: 'turn_configuration_invalid' };
  }
  const rawUrls = String(env.COT_TURN_URLS || '').trim();
  const secret = String(env.COT_TURN_SHARED_SECRET || '').trim();
  if (rawUrls || secret) {
    const urls = rawUrls.split(',').map((url) => url.trim()).filter(Boolean);
    if (!secret || urls.length === 0 || urls.some((url) => !/^turns?:/i.test(url))) return { source: 'none', fault: 'turn_configuration_invalid' };
    const label = String(env.COT_TURN_USERNAME || 'cot').trim().replace(/[^a-z0-9_.-]/gi, '').slice(0, 48) || 'cot';
    return { source: 'coturn', urls, secret, label };
  }
  const keyId = String(env.COT_CLOUDFLARE_TURN_KEY_ID || '').trim();
  const token = String(env.COT_CLOUDFLARE_TURN_API_TOKEN || '').trim();
  if (keyId && token) return { source: 'cloudflare', keyId, token };
  if (keyId || token) return { source: 'none', fault: 'turn_configuration_invalid' };
  return { source: 'none', fault: null };
}

/** The STUN fallback: COT_STUN_URLS' `stun:` URLs as one server, or none. */
function stunServersFrom(env: RelayEnv): { servers: RoomIceServer[]; fault: string | null } {
  const entries = String(env.COT_STUN_URLS || '').split(',').map((url) => url.trim()).filter(Boolean);
  const urls = entries.filter((url) => /^stun:/i.test(url) && url.length <= 512);
  const servers = urls.length ? [{ urls: urls.length === 1 ? urls[0]! : urls }] : [];
  return { servers, fault: urls.length === entries.length ? null : 'stun_configuration_invalid' };
}

export function createRelayIssuer({
  env,
  fetchImpl = (input, init) => globalThis.fetch(input, init),
  now = Date.now,
  warn = (line) => console.warn(line),
}: RelayIssuerOptions): RelayIssuer {
  const plan = planFrom(env);
  const stun = stunServersFrom(env);
  const ttl = relayCredentialTtl(env);
  const warned = new Set<string>();
  const warnConfiguration = (error: string): void => {
    if (warned.has(error)) return;
    warned.add(error);
    warn(JSON.stringify({ tag: 'cot-relay', event: 'configuration', error }));
  };
  const directOnly = (): RoomRelayPayload => ({ iceServers: stun.servers.map((server) => ({ ...server })), relay: false });
  const grantOf = (servers: RoomIceServer[], expiresInSeconds?: number): RoomRelayPayload => ({
    iceServers: servers, relay: hasRoomRelayServer(servers), ...(expiresInSeconds !== undefined ? { expiresInSeconds } : {}),
  });

  async function cloudflare(keyId: string, token: string): Promise<RoomRelayPayload> {
    const startedAt = now();
    // One line per failed provider call: status, the cause and the latency — a TURN outage must leave a trace.
    const failure = (error: string, upstreamStatus: number | null, reason: string): RoomRelayPayload => {
      warn(JSON.stringify({ tag: 'cot-relay', event: 'upstream_failure', error, upstreamStatus, reason, latencyMs: Math.max(0, now() - startedAt) }));
      return directOnly();
    };
    let response: Response;
    try {
      response = await fetchImpl(`${CLOUDFLARE_TURN_KEYS}/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl }),
        signal: AbortSignal.timeout(RELAY_PROVIDER_TIMEOUT_MS),
      });
    } catch (error) {
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
      return failure('turn_service_unavailable', null, name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network');
    }
    if (!response.ok) return failure('turn_service_unavailable', response.status, 'http');
    let body: unknown;
    try { body = await response.json(); } catch { return failure('turn_service_unavailable', response.status, 'invalid_json'); }
    const servers = readServers(body && typeof body === 'object' ? (body as { iceServers?: unknown }).iceServers : null);
    if (!servers) return failure('turn_service_invalid', response.status, 'invalid_body');
    return grantOf(servers, ttl);
  }

  return {
    source: plan.source,
    async issue(): Promise<RoomRelayPayload> {
      if (stun.fault) warnConfiguration(stun.fault);
      try {
        switch (plan.source) {
          case 'static': return grantOf(plan.servers.map((server) => ({ ...server })));
          case 'coturn': {
            const username = `${Math.floor(now() / 1_000) + ttl}:${plan.label}`;
            const credential = await hmacSha1Base64(plan.secret, username);
            return grantOf([{ urls: plan.urls.length === 1 ? plan.urls[0]! : [...plan.urls], username, credential }], ttl);
          }
          case 'cloudflare': return await cloudflare(plan.keyId, plan.token);
          case 'none':
            if (plan.fault) warnConfiguration(plan.fault);
            return directOnly();
        }
      } catch (error) {
        // WebCrypto missing or a provider body that threw past the guards: the grant degrades, the cause by name only.
        warn(JSON.stringify({ tag: 'cot-relay', event: 'issue_failure', reason: error instanceof Error ? error.name : 'unknown' }));
        return directOnly();
      }
    },
  };
}
