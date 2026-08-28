const IDENTITY_KEY = 'cot.ranked.identity.v1';

type JsonObject = Record<string, unknown>;
type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
  removeItem(key: string): unknown;
}

export interface RankedIdentity extends JsonObject {
  playerId: string;
  token: string;
}

export interface RankedJoinOptions {
  name?: string;
  specId?: string;
  equipment?: string[];
  camo?: string;
  teamSize?: number;
}

export interface RankedRosterPlayer extends JsonObject {
  id: string;
  name: string;
  specId: string;
  camo: string;
  team: 'alpha' | 'bravo';
  rating: number;
}

export interface RankedMatchAssignment extends JsonObject {
  matchId: string;
  playerId: string;
  token: string;
  mapId: string;
  roster: RankedRosterPlayer[];
}

export interface RankedQueueState extends JsonObject {
  status: string;
  match?: RankedMatchAssignment | null;
}

export interface RankedWaitOptions {
  signal?: AbortSignal | null;
  onUpdate?: ((state: RankedQueueState) => void) | null;
  intervalMs?: number;
}

export interface RankedQueueTicket extends JsonObject {
  ticketId: string;
  ticketToken: string;
  poll(): Promise<RankedQueueState>;
  cancel(): Promise<JsonObject>;
  wait(options?: RankedWaitOptions): Promise<RankedQueueState>;
}

export interface RankedServiceClient {
  readonly serviceUrl: string;
  readonly webSocketUrl: string;
  ensureIdentity(name?: string): Promise<RankedIdentity>;
  identity(): RankedIdentity | null;
  clearIdentity(): void;
  profile(playerId?: string): Promise<JsonObject>;
  leaderboard(limit?: number): Promise<JsonObject>;
  join(options?: RankedJoinOptions): Promise<RankedQueueTicket>;
}

export interface RankedServiceClientOptions {
  url?: unknown;
  fetchImpl?: FetchLike;
  storage?: StorageLike;
}

function isRecord(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringField(value: JsonObject, key: string): string | null {
  const field = value[key];
  return typeof field === 'string' && field ? field : null;
}

function endpoint(value: unknown): URL {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('ranked service URL must use http or https');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url;
}

async function responseJson(response: Response): Promise<JsonObject> {
  let body: unknown = null;
  try { body = await response.json() as unknown; } catch { /* response may be empty */ }
  const object = isRecord(body) ? body : null;
  if (!response.ok) {
    const message = object && (stringField(object, 'message') || stringField(object, 'error'));
    const error = Object.assign(new Error(message ||
      `ranked service returned ${response.status}`), {
      status: response.status,
      code: object && stringField(object, 'error') || 'ranked_service_error',
    });
    throw error;
  }
  if (!object) throw Object.assign(new Error('ranked service returned an invalid response'), {
    status: response.status,
    code: 'ranked_service_invalid_response',
  });
  return object;
}

function readIdentity(value: unknown): RankedIdentity | null {
  if (!isRecord(value)) return null;
  const playerId = stringField(value, 'playerId');
  const token = stringField(value, 'token');
  return playerId && token ? { ...value, playerId, token } : null;
}

function storageRead(storage: StorageLike | undefined, key: string): RankedIdentity | null {
  try {
    return readIdentity(JSON.parse(storage?.getItem(key) || 'null') as unknown);
  } catch { return null; }
}

function storageWrite(storage: StorageLike | undefined, key: string, value: RankedIdentity): void {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* session-only */ }
}

function storageRemove(storage: StorageLike | undefined, key: string): void {
  try { storage?.removeItem(key); } catch { /* session-only */ }
}

function abortError(): Error {
  return Object.assign(new Error('ranked queue cancelled'), { name: 'AbortError' });
}

function waitForPollInterval(intervalMs: number, signal: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener('abort', cancelWait);
      resolve();
    };
    const cancelWait = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancelWait);
      reject(abortError());
    };
    const timer = setTimeout(finish, Math.max(250, intervalMs));
    signal?.addEventListener('abort', cancelWait, { once: true });
  });
}

function queueState(value: JsonObject): RankedQueueState {
  const status = stringField(value, 'status');
  if (!status) throw Object.assign(new Error('ranked queue response has no status'), {
    code: 'ranked_queue_invalid_response',
  });
  return { ...value, status };
}

export function rankedMatchWebSocketUrl(serviceUrl: unknown): string {
  const url = endpoint(serviceUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname}/match`.replace(/\/+/g, '/');
  return url.toString();
}

/** Browser client for anonymous ranked identity, queue, and leaderboard APIs. */
export function createRankedServiceClient({
  url,
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
}: RankedServiceClientOptions = {}): RankedServiceClient {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const base = endpoint(url);
  const baseHref = `${base.origin}${base.pathname.replace(/\/+$/, '')}/`;
  const identityKey = `${IDENTITY_KEY}:${base.origin}${base.pathname}`;
  const call = (path: string, options: RequestInit = {}) =>
    fetchImpl(new URL(path, baseHref), options).then(responseJson);
  let identity = storageRead(storage, identityKey);

  async function ensureIdentity(name?: string): Promise<RankedIdentity> {
    if (identity) return { ...identity };
    const response = await call('ranked/identity', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    identity = readIdentity(response);
    if (!identity) throw Object.assign(new Error('ranked identity response is incomplete'), {
      code: 'ranked_identity_invalid_response',
    });
    storageWrite(storage, identityKey, identity);
    return { ...identity };
  }

  async function join({
    name,
    specId,
    equipment = [],
    camo = 'factory',
    teamSize = 1,
  }: RankedJoinOptions = {}): Promise<RankedQueueTicket> {
    const player = await ensureIdentity(name);
    const response = queueState(await call('ranked/queue', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${player.token}`,
      },
      body: JSON.stringify({ playerId: player.playerId, specId, equipment, camo, teamSize }),
    }));
    const ticketId = stringField(response, 'ticketId');
    const ticketToken = stringField(response, 'ticketToken');
    if (!ticketId || !ticketToken) {
      throw Object.assign(new Error('ranked queue ticket is incomplete'), {
        code: 'ranked_ticket_invalid_response',
      });
    }

    const poll = async (): Promise<RankedQueueState> => queueState(await call(
      `ranked/queue/${encodeURIComponent(ticketId)}`,
      { headers: { authorization: `Bearer ${ticketToken}` } },
    ));
    const cancel = async (): Promise<JsonObject> => await call(
      `ranked/queue/${encodeURIComponent(ticketId)}`,
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${ticketToken}` },
      },
    );
    const wait = async ({
      signal = null,
      onUpdate = null,
      intervalMs = 800,
    }: RankedWaitOptions = {}): Promise<RankedQueueState> => {
      while (!signal?.aborted) {
        const state = await poll();
        onUpdate?.(state);
        if (state.status === 'matched' || state.status === 'finished') return state;
        if (state.status !== 'queued') throw new Error(`ranked queue ${state.status}`);
        await waitForPollInterval(intervalMs, signal);
      }
      throw abortError();
    };

    return { ...response, ticketId, ticketToken, poll, cancel, wait };
  }

  return {
    serviceUrl: base.toString(),
    webSocketUrl: rankedMatchWebSocketUrl(base),
    ensureIdentity,
    identity: () => identity ? { ...identity } : null,
    clearIdentity(): void {
      identity = null;
      storageRemove(storage, identityKey);
    },
    profile: (playerId = identity?.playerId) =>
      call(`ranked/profile/${encodeURIComponent(playerId || '')}`),
    leaderboard: (limit = 50) =>
      call(`ranked/leaderboard?limit=${Math.max(1, Math.min(100, limit))}`),
    join,
  };
}
