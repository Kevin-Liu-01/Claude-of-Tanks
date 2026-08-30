import type { RtcIceLeaseConfiguration } from './rtcIceLease.ts';

export type IceServerConfig = RTCIceServer;

export interface IceConfiguration extends RtcIceLeaseConfiguration {
  relayAvailable: boolean;
  source: 'lan' | 'service' | 'stun-fallback';
  degradedReason?: string;
  expiresInSeconds?: number;
}

interface IceServiceBody {
  iceServers?: unknown;
  relayOnly?: unknown;
  expiresInSeconds?: unknown;
  error?: unknown;
}

interface IceConfigurationOptions {
  mode: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
  wait?: (delayMs: number) => Promise<void>;
}

export const PUBLIC_STUN_SERVERS: readonly IceServerConfig[] = Object.freeze([{
  urls: [
    'stun:stun.cloudflare.com:3478',
    'stun:stun.cloudflare.com:53',
    'stun:stun.l.google.com:19302',
  ],
}]);

function serverUrls(server: IceServerConfig): string[] {
  return typeof server.urls === 'string' ? [server.urls] : [...server.urls];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readServer(value: unknown): IceServerConfig | null {
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

function hasTurn(servers: IceServerConfig[]): boolean {
  return servers.some((server) => serverUrls(server).some((url) => /^turns?:/i.test(url)));
}

function stunFallback(reason: string): IceConfiguration {
  return {
    iceServers: PUBLIC_STUN_SERVERS.map((server) => ({
      ...server,
      urls: Array.isArray(server.urls) ? [...server.urls] : server.urls,
    })),
    relayOnly: false,
    relayAvailable: false,
    source: 'stun-fallback',
    degradedReason: reason,
  };
}

const RETRYABLE_ICE_STATUS = new Set([429, 500, 502, 504]);
const RETRYABLE_ICE_ERROR = new Set(['turn_service_unavailable']);

function waitFor(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function responseBody(response: Response): Promise<IceServiceBody> {
  try {
    const value: unknown = await response.json();
    if (!isRecord(value)) return {};
    return {
      iceServers: value.iceServers,
      relayOnly: value.relayOnly,
      expiresInSeconds: value.expiresInSeconds,
      error: value.error,
    };
  } catch {
    return {};
  }
}

function serviceError(body: IceServiceBody, status: number): string {
  return typeof body.error === 'string' && body.error
    ? body.error : `turn_service_http_${status}`;
}

function shouldRetryService(status: number, reason: string): boolean {
  return RETRYABLE_ICE_STATUS.has(status) || RETRYABLE_ICE_ERROR.has(reason);
}

/** Resolve deployment ICE without ever making private-room creation depend on
 * the optional credential service. STUN remains the bounded degraded path;
 * production TURN credentials are short-lived and never bundled in JS. */
export async function loadIceConfiguration({
  mode,
  endpoint = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 5_000,
  retryDelaysMs = [200, 600],
  wait = waitFor,
}: IceConfigurationOptions): Promise<IceConfiguration> {
  if (mode === 'lan') {
    return { iceServers: [], relayOnly: false, relayAvailable: false, source: 'lan' };
  }
  if (!endpoint || typeof fetchImpl !== 'function') return stunFallback('turn_service_unconfigured');

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 ||
      retryDelaysMs.some((delayMs) => !Number.isFinite(delayMs) || delayMs < 0) ||
      typeof wait !== 'function') {
    throw new TypeError('ICE acquisition options are invalid');
  }

  const deadline = Date.now() + timeoutMs;
  try {
    for (let attempt = 0; ; attempt++) {
      const remainingMs = Math.max(1, deadline - Date.now());
      const response = await fetchImpl(endpoint, {
        credentials: 'include',
        cache: 'no-store',
        signal: AbortSignal.timeout(remainingMs),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        const reason = serviceError(body, response.status);
        const retryDelayMs = retryDelaysMs[attempt];
        if (retryDelayMs === undefined || !shouldRetryService(response.status, reason) ||
            Date.now() + retryDelayMs >= deadline) {
          return stunFallback(reason);
        }
        await wait(retryDelayMs);
        continue;
      }
      if (!Array.isArray(body.iceServers)) {
        return stunFallback('turn_service_invalid');
      }
      const servers = body.iceServers.map(readServer);
      if (servers.some((server) => server === null)) {
        return stunFallback('turn_service_invalid');
      }
      const validServers = servers.filter((server): server is IceServerConfig => server !== null);
      const relayAvailable = hasTurn(validServers);
      const relayOnly = body.relayOnly === true;
      if (relayOnly && !relayAvailable) return stunFallback('turn_service_missing_relay');
      return {
        iceServers: validServers,
        relayOnly,
        relayAvailable,
        source: 'service',
        ...(Number.isFinite(body.expiresInSeconds)
          ? { expiresInSeconds: Number(body.expiresInSeconds) }
          : {}),
      };
    }
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError'
      ? 'turn_service_timeout'
      : 'turn_service_unavailable';
    return stunFallback(reason);
  }
}
