/**
 * ICE for one peer connection (2026-10-02, docs/MULTIPLAYER-V2.md §13.14). A LAN room uses host candidates and asks
 * nothing. A private room's ICE comes from the room this seat holds: `room_relay`, the relay credentials the room mints
 * for its own seated players (the public `/api/ice` minted them for any page until this lane). One resolver per room
 * session: the transports resolve per connection — each connect attempt of a peer's link, every offer its host accepts —
 * resolutions in flight share one request, and a grant younger than RELAY_GRANT_REUSE_MS is reused, so a host answering
 * an election's 27 offers asks once (the room's per-seat window assumes it). A refusal, a timeout or a room that
 * predates the request falls back to the newest grant still valid, else to host candidates: a credential never blocks a
 * connection, and nothing contacts a STUN or TURN server the room did not name. Credentials stay in memory, never logged.
 */
import type { RuntimeValue } from '../../runtimeTypes.ts';
import type { RtcIceServerLike } from './webRtcTransport.ts';

/** A grant this young is handed to the next connection as is (a burst of connections shares one request). */
export const RELAY_GRANT_REUSE_MS = 30_000;
/** A grant this close to its expiry is no longer handed to a new connection, as a reuse or as a fallback. */
const GRANT_MIN_REMAINING_MS = 60_000;

export interface IceConfiguration {
  iceServers: RtcIceServerLike[];
  relayOnly: boolean;
  relayAvailable: boolean;
  source: 'lan' | 'room' | 'host-fallback';
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

function hostFallback(reason: string): IceConfiguration {
  return { iceServers: [], relayOnly: false, relayAvailable: false, source: 'host-fallback', degradedReason: reason };
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
export function createRoomIceResolver({ mode, room, reuseMs = RELAY_GRANT_REUSE_MS, clock = () => Date.now() }: RoomIceResolverOptions): () => Promise<IceConfiguration> {
  if (!Number.isFinite(reuseMs) || reuseMs < 0 || typeof clock !== 'function') throw new TypeError('ICE resolver options are invalid');
  let latest: { config: IceConfiguration; receivedAt: number; expiresAt: number | null } | null = null;
  let inFlight: Promise<IceConfiguration> | null = null;
  /** The newest grant while it can still carry a connection (`fresh`: also inside the reuse window). */
  const usable = (nowMs: number, fresh: boolean): IceConfiguration | null => {
    if (!latest || (latest.expiresAt !== null && latest.expiresAt - nowMs < GRANT_MIN_REMAINING_MS)) return null;
    if (fresh && nowMs - latest.receivedAt >= reuseMs) return null;
    return latest.config;
  };
  const ask = async (source: RoomRelaySource): Promise<IceConfiguration> => {
    let reason: string;
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
    const fallback = usable(clock(), false);
    return fallback ? copy(fallback, { degradedReason: reason }) : hostFallback(reason);
  };
  return async () => {
    if (mode === 'lan') return { iceServers: [], relayOnly: false, relayAvailable: false, source: 'lan' };
    if (!room || typeof room.requestRelay !== 'function') return hostFallback('relay_unconfigured');
    const reused = usable(clock(), true);
    if (reused) return copy(reused);
    inFlight ??= ask(room).finally(() => { inFlight = null; });
    return inFlight.then((config) => copy(config));
  };
}
