/**
 * The room service's daily limit (security audit 2026-10-22, NV-5/NV-9; owner ruling 2026-10-23: the rooms Worker
 * stays on Cloudflare Workers Free, 100,000 requests a day). Past the cap Cloudflare refuses every request with error
 * 1027 until 00:00 UTC, and a browser cannot see why its WebSocket upgrade failed. So after a failed admission or an
 * interrupted room connection the Play menu asks `/api/rooms-status` once (cached at the edge; api/rooms-status.ts).
 * When that says `limited` the menu shows one limit state, remembers it until the next 00:00 UTC, and does not open
 * another room socket in that window: an explicit retry asks the status again instead. Practice, bots and LAN never
 * touch the rooms Worker. Node-runnable: the fetch and the storage are injected.
 */
import type { StorageLike } from '../room/roomClient.ts';

export type RoomServiceState = 'ok' | 'limited' | 'unavailable';

export const ROOM_SERVICE_STATUS_PATH = '/api/rooms-status';
export const ROOM_SERVICE_LIMIT_KEY = 'cot.mp.roomServiceLimitedUntil';

/** A room attempt refused because the room service is at its daily limit (no socket was opened). */
export class RoomServiceLimitError extends Error {
  readonly code = 'room_service_limited' as const;
  /** When the remembered limit ends (ms; the next 00:00 UTC). */
  readonly until: number;
  constructor(until: number) {
    super('room service at its daily limit');
    this.name = 'RoomServiceLimitError';
    this.until = until;
  }
}

/** The next 00:00 UTC after `nowMs`: when Cloudflare's daily request count starts again. */
export function nextUtcMidnight(nowMs: number): number {
  const day = new Date(nowMs);
  return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1);
}

/** Room hosts on Cloudflare's daily-capped Workers (the official rooms Worker, any workers.dev deployment). */
export function isDailyCappedRoomsUrl(roomsUrl: string): boolean {
  try {
    const url = new URL(roomsUrl);
    return url.protocol === 'wss:' && url.hostname.endsWith('.workers.dev');
  } catch {
    return false;
  }
}

export interface RoomServiceLimit {
  /** Whether this rooms URL can hit the daily cap (LAN helpers and local hosts cannot). */
  appliesTo(roomsUrl: string): boolean;
  /** The remembered limit's end (ms), while it lasts; null otherwise. */
  until(): number | null;
  /** Ask the status once: `limited` is remembered until the next 00:00 UTC, `ok` forgets it. */
  check(): Promise<RoomServiceState>;
}

interface RoomServiceLimitOptions {
  fetchImpl?: typeof fetch;
  storage?: StorageLike | null;
  now?: () => number;
  statusPath?: string;
}

export function createRoomServiceLimit({
  fetchImpl = globalThis.fetch,
  storage = null,
  now = Date.now,
  statusPath = ROOM_SERVICE_STATUS_PATH,
}: RoomServiceLimitOptions = {}): RoomServiceLimit {
  let memory: number | null = null;
  const read = (): number | null => {
    let value = memory;
    try {
      const stored = Number(storage?.getItem(ROOM_SERVICE_LIMIT_KEY));
      if (Number.isFinite(stored) && stored > 0) value = stored;
    } catch { /* storage refused: the memory copy stands */ }
    return value !== null && value > now() ? value : null;
  };
  const write = (value: number | null): void => {
    memory = value;
    try {
      if (value === null) storage?.removeItem(ROOM_SERVICE_LIMIT_KEY);
      else storage?.setItem(ROOM_SERVICE_LIMIT_KEY, String(value));
    } catch { /* storage refused: the memory copy stands */ }
  };
  let inFlight: Promise<RoomServiceState> | null = null;
  return {
    appliesTo: isDailyCappedRoomsUrl,
    until: read,
    check() {
      if (inFlight) return inFlight;
      const ask = async (): Promise<RoomServiceState> => {
        try {
          const response = await fetchImpl(statusPath, { credentials: 'omit', signal: AbortSignal.timeout(5_000) });
          const body = response.ok ? await response.json() as { state?: unknown } : null;
          const state: RoomServiceState = body?.state === 'limited' || body?.state === 'ok' ? body.state : 'unavailable';
          if (state === 'limited') write(nextUtcMidnight(now()));
          else if (state === 'ok') write(null);
          return state;
        } catch {
          return 'unavailable';
        }
      };
      inFlight = ask().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}
