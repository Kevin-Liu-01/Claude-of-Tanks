/**
 * ICE for one peer connection (2026-10-02, docs/MULTIPLAYER-V2.md §13.14). A LAN room uses host candidates and asks
 * nothing. A private room's ICE comes from the room this seat holds: `room_relay`, the relay credentials the room mints
 * for its own seated players (the public `/api/ice` minted them for any page until this lane). One resolver per room
 * session: the transports resolve per connection — each connect attempt of a peer's link, every offer its host accepts —
 * resolutions in flight share one request, and a grant younger than RELAY_GRANT_REUSE_MS is reused, so a host answering
 * an election's 27 offers asks once (the room's per-seat window assumes it). A refusal, a timeout or a room that
 * predates the request falls back to the newest grant still valid, else to the official STUN servers (2026-10-13, below):
 * a credential never blocks a connection, and nothing contacts a TURN server the room did not name. Credentials stay in
 * memory, never logged. Every degradation (a fallback, or a room whose grant carries no relay) is reported once per
 * reason through `onDegraded` — the `ice_degraded` telemetry note, so real-world relay loss is countable.
 */
import { OFFICIAL_STUN_URLS } from '../../officialHost.ts';
import type { RuntimeValue } from '../../runtimeTypes.ts';
import type { RtcIceServerLike } from './webRtcTransport.ts';

/** A grant this young is handed to the next connection as is (a burst of connections shares one request). */
export const RELAY_GRANT_REUSE_MS = 30_000;
/**
 * Asks after a `room_relay` that timed out or met a closed socket (`internal`) while no grant is held (2026-10-11, the MP
 * lane): under load a seat's own starved thread or a busy room let the first request run out its budget, and the first
 * connection was built on host candidates alone — which cannot cross a NAT (mp-p2p-headless: the first attempts linked
 * with no servers, "internal"). One more request; the transport's next attempt shares it while it is in flight.
 */
export const RELAY_REQUEST_RETRIES = 1;
/** A grant this close to its expiry is no longer handed to a new connection, as a reuse or as a fallback. */
const GRANT_MIN_REMAINING_MS = 60_000;

export interface IceConfiguration {
  iceServers: RtcIceServerLike[];
  relayOnly: boolean;
  relayAvailable: boolean;
  /** `stun-fallback`: no grant could be had, so the official STUN servers alone (server-reflexive paths, no relay). */
  source: 'lan' | 'room' | 'stun-fallback';
  /** Why this configuration is not a fresh answer of the room (the room's refusal code, a timeout, a malformed answer). */
  degradedReason?: string;
  expiresInSeconds?: number;
}

/** The room this seat holds, as the resolver reads it (structural: `RoomClient.requestRelay`). */
interface RoomRelaySource {
  requestRelay(): Promise<RuntimeValue>;
}

interface RoomIceResolverOptions {
  mode: string;
  room: RoomRelaySource | null;
  reuseMs?: number;
  clock?: () => number;
  /**
   * Why a private room's seat links without a relay, once per distinct reason in this resolver's life (never per
   * connection, never with a credential): a fallback's reason (the room's refusal code, `internal` for a timeout,
   * `relay_invalid`, `relay_unconfigured`) or `no_relay` — the room answered, but its grant carries no TURN server (the
   * rooms Worker's TURN secrets unset, or its provider down).
   */
  onDegraded?: (reason: string) => void;
  /** The STUN servers a seat falls back to when no grant can be had (default: the official ones). */
  fallbackStunUrls?: readonly string[];
}

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serverUrls(server: RtcIceServerLike): string[] {
  return typeof server.urls === 'string' ? [server.urls] : [...server.urls];
}

function readServer(value: RuntimeValue): RtcIceServerLike | null {
  if (!isRecord(value)) return null;
  const urls = typeof value.urls === 'string' ? [value.urls]
    : Array.isArray(value.urls) && value.urls.every((url) => typeof url === 'string')
      ? value.urls : [];
  if (urls.length === 0 || urls.some((url) => !/^(?:stun|turns?):/i.test(url))) return null;
  return {
    urls: urls.length === 1 ? urls[0] : [...urls],
    ...(typeof value.username === 'string' ? { username: value.username } : {}),
    ...(typeof value.credential === 'string' ? { credential: value.credential } : {}),
  };
}

function hasTurn(servers: RtcIceServerLike[]): boolean {
  return servers.some((server) => serverUrls(server).some((url) => /^turns?:/i.test(url)));
}

/**
 * No grant to use (2026-10-13, MP-SINCE-0930 step 6a): the official STUN servers rather than none. Until this change a
 * failed or timed-out first `room_relay` built the connection on host candidates alone, which links on a LAN but never
 * across a NAT — 2 of 10 loaded connections linked with no servers (blackscreen ice-json-3). STUN is what every room
 * grant carries anyway (`COT_STUN_URLS` is pinned to `OFFICIAL_STUN_URLS`), so the seat keeps its server-reflexive paths.
 */
function stunFallback(reason: string, urls: readonly string[]): IceConfiguration {
  return {
    iceServers: urls.length > 0 ? [{ urls: urls.length === 1 ? urls[0] : [...urls] }] : [],
    relayOnly: false, relayAvailable: false, source: 'stun-fallback', degradedReason: reason,
  };
}

/** A room's answer as a configuration; null when it is malformed (the room validated it already: defence in depth). */
function roomConfiguration(body: RuntimeValue): IceConfiguration | null {
  if (!isRecord(body) || !Array.isArray(body.iceServers)) return null;
  const servers = body.iceServers.map(readServer);
  if (servers.some((server) => server === null)) return null;
  const iceServers = servers.filter((server): server is RtcIceServerLike => server !== null);
  const expires = body.expiresInSeconds;
  return {
    iceServers, relayOnly: false, relayAvailable: hasTurn(iceServers), source: 'room',
    ...(typeof expires === 'number' && Number.isFinite(expires) && expires > 0 ? { expiresInSeconds: expires } : {}),
  };
}

/** The room's refusal code (`relay_phase`, `rate_limit`, `unknown_message`, …) or the failure's kind. */
function refusalReason(error: unknown): string {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && /^[a-z_]{1,48}$/.test(code) ? code : 'relay_unavailable';
}

const copy = (config: IceConfiguration, extra: Partial<IceConfiguration> = {}): IceConfiguration => ({
  ...config, iceServers: config.iceServers.map((server) => ({ ...server, urls: typeof server.urls === 'string' ? server.urls : [...server.urls] })), ...extra,
});

/** The ICE resolver of one room session (see the module comment); it never rejects. */
export function createRoomIceResolver({
  mode, room, reuseMs = RELAY_GRANT_REUSE_MS, clock = () => Date.now(), onDegraded, fallbackStunUrls = OFFICIAL_STUN_URLS,
}: RoomIceResolverOptions): () => Promise<IceConfiguration> {
  if (!Number.isFinite(reuseMs) || reuseMs < 0 || typeof clock !== 'function') throw new TypeError('ICE resolver options are invalid');
  if (onDegraded !== undefined && typeof onDegraded !== 'function') throw new TypeError('ICE resolver options are invalid');
  const stunUrls = [...fallbackStunUrls].filter((url) => typeof url === 'string' && /^stun:/i.test(url));
  let latest: { config: IceConfiguration; receivedAt: number; expiresAt: number | null } | null = null;
  let inFlight: Promise<IceConfiguration> | null = null;
  const reported = new Set<string>();
  /** One report per reason: a reconnecting seat resolves again and again, the telemetry wants the fact, not the count. */
  const degraded = (config: IceConfiguration): IceConfiguration => {
    const reason = config.degradedReason ?? (config.source === 'room' && !config.relayAvailable ? 'no_relay' : null);
    if (reason && !reported.has(reason)) {
      reported.add(reason);
      try { onDegraded?.(reason); } catch { /* a reporter never breaks a connection */ }
    }
    return config;
  };
  /** The newest grant while it can still carry a connection (`fresh`: also inside the reuse window). */
  const usable = (nowMs: number, fresh: boolean): IceConfiguration | null => {
    if (!latest || (latest.expiresAt !== null && latest.expiresAt - nowMs < GRANT_MIN_REMAINING_MS)) return null;
    if (fresh && nowMs - latest.receivedAt >= reuseMs) return null;
    return latest.config;
  };
  const ask = async (source: RoomRelaySource): Promise<IceConfiguration> => {
    let reason = 'relay_unavailable';
    for (let attempt = 0; attempt <= RELAY_REQUEST_RETRIES; attempt++) {
      try {
        const answered = roomConfiguration(await source.requestRelay());
        if (answered) {
          const receivedAt = clock();
          latest = { config: answered, receivedAt, expiresAt: answered.expiresInSeconds !== undefined ? receivedAt + answered.expiresInSeconds * 1_000 : null };
          return copy(answered);
        }
        reason = 'relay_invalid';
      } catch (error) {
        reason = refusalReason(error);
      }
      // only a request that timed out or met a closed socket, with no grant to fall back on, is asked again: a refusal
      // (rate_limit, relay_phase, …) answers the same a moment later
      if (reason !== 'internal' || usable(clock(), false)) break;
    }
    const fallback = usable(clock(), false);
    return fallback ? copy(fallback, { degradedReason: reason }) : stunFallback(reason, stunUrls);
  };
  return async () => {
    if (mode === 'lan') return { iceServers: [], relayOnly: false, relayAvailable: false, source: 'lan' };
    if (!room || typeof room.requestRelay !== 'function') return degraded(stunFallback('relay_unconfigured', stunUrls));
    const reused = usable(clock(), true);
    if (reused) return copy(reused);
    inFlight ??= ask(room).finally(() => { inFlight = null; });
    return inFlight.then((config) => degraded(copy(config)));
  };
}
