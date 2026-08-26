export interface IceServerConfig {
  urls: string | readonly string[];
  username?: string;
  credential?: string;
}

export interface IceConfiguration {
  iceServers: IceServerConfig[];
  relayOnly: boolean;
  relayAvailable: boolean;
  source: 'lan' | 'service' | 'stun-fallback';
  degradedReason?: string;
  expiresInSeconds?: number;
}

export const PUBLIC_STUN_SERVERS: readonly IceServerConfig[] = Object.freeze([{
  urls: Object.freeze([
    'stun:stun.cloudflare.com:3478',
    'stun:stun.cloudflare.com:53',
    'stun:stun.l.google.com:19302',
  ]),
}]);

function serverUrls(server: IceServerConfig): string[] {
  return Array.isArray(server.urls) ? [...server.urls] : [server.urls as string];
}

function validServer(value: unknown): value is IceServerConfig {
  if (!value || typeof value !== 'object') return false;
  const server = value as Partial<IceServerConfig>;
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  return urls.length > 0 && urls.every((url) => typeof url === 'string' && /^(?:stun|turns?):/i.test(url));
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

/** Resolve deployment ICE without ever making private-room creation depend on
 * the optional credential service. STUN remains the bounded degraded path;
 * production TURN credentials are short-lived and never bundled in JS. */
export async function loadIceConfiguration({
  mode,
  endpoint = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 5_000,
}: {
  mode: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<IceConfiguration> {
  if (mode === 'lan') {
    return { iceServers: [], relayOnly: false, relayAvailable: false, source: 'lan' };
  }
  if (!endpoint || typeof fetchImpl !== 'function') return stunFallback('turn_service_unconfigured');

  try {
    const response = await fetchImpl(endpoint, {
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return stunFallback(`turn_service_http_${response.status}`);
    const body = await response.json() as {
      iceServers?: unknown;
      relayOnly?: unknown;
      expiresInSeconds?: unknown;
    };
    if (!Array.isArray(body?.iceServers) || !body.iceServers.every(validServer)) {
      return stunFallback('turn_service_invalid');
    }
    const servers = body.iceServers.map((server) => ({ ...server })) as IceServerConfig[];
    const relayAvailable = hasTurn(servers);
    const relayOnly = body.relayOnly === true;
    if (relayOnly && !relayAvailable) return stunFallback('turn_service_missing_relay');
    return {
      iceServers: servers,
      relayOnly,
      relayAvailable,
      source: 'service',
      ...(Number.isFinite(body.expiresInSeconds)
        ? { expiresInSeconds: Number(body.expiresInSeconds) }
        : {}),
    };
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError'
      ? 'turn_service_timeout'
      : 'turn_service_unavailable';
    return stunFallback(reason);
  }
}
