export interface RtcIceLeaseConfiguration {
  iceServers: RTCIceServer[];
  relayOnly: boolean;
  relayAvailable?: boolean;
  expiresInSeconds?: number;
}

export interface RtcIceLeaseOptions {
  refresh?: (() => Promise<RtcIceLeaseConfiguration>) | null;
  now?: () => number;
  retryDelayMs?: number;
  maxRefreshLeadMs?: number;
}

function cloneServer(server: RTCIceServer): RTCIceServer {
  return {
    ...server,
    urls: Array.isArray(server.urls) ? [...server.urls] : server.urls,
  };
}

function cloneConfiguration(config: RtcIceLeaseConfiguration): RtcIceLeaseConfiguration {
  if (!Array.isArray(config?.iceServers)) throw new TypeError('ICE servers must be an array');
  return {
    iceServers: config.iceServers.map(cloneServer),
    relayOnly: config.relayOnly === true,
    relayAvailable: config.relayAvailable === true || hasTurnServer(config.iceServers),
    ...(Number.isFinite(config.expiresInSeconds) && Number(config.expiresInSeconds) > 0
      ? { expiresInSeconds: Number(config.expiresInSeconds) }
      : {}),
  };
}

export function hasTurnServer(servers: RTCIceServer[]): boolean {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => typeof url === 'string' && /^turns?:/i.test(url));
  });
}

/**
 * Cache one short-lived ICE credential generation and refresh it only before
 * a replacement peer is built. A temporary credential-service failure never
 * discards a still-valid TURN route.
 */
export class RtcIceLease {
  private config: RtcIceLeaseConfiguration;
  private readonly refresh: (() => Promise<RtcIceLeaseConfiguration>) | null;
  private readonly now: () => number;
  private readonly retryDelayMs: number;
  private readonly maxRefreshLeadMs: number;
  private expiresAtMs = Number.POSITIVE_INFINITY;
  private refreshAtMs = Number.POSITIVE_INFINITY;
  private pending: Promise<RtcIceLeaseConfiguration> | null = null;

  constructor(initial: RtcIceLeaseConfiguration, {
    refresh = null,
    now = Date.now,
    retryDelayMs = 30_000,
    maxRefreshLeadMs = 5 * 60_000,
  }: RtcIceLeaseOptions = {}) {
    if (typeof now !== 'function' || !Number.isFinite(retryDelayMs) || retryDelayMs < 0 ||
        !Number.isFinite(maxRefreshLeadMs) || maxRefreshLeadMs < 0) {
      throw new TypeError('invalid ICE lease scheduler');
    }
    this.config = cloneConfiguration(initial);
    this.refresh = typeof refresh === 'function' ? refresh : null;
    this.now = now;
    this.retryDelayMs = retryDelayMs;
    this.maxRefreshLeadMs = maxRefreshLeadMs;
    this.#schedule(this.config);
  }

  current(): RtcIceLeaseConfiguration {
    return this.config;
  }

  needsRefresh(): boolean {
    return this.refresh !== null && this.now() >= this.refreshAtMs;
  }

  #schedule(config: RtcIceLeaseConfiguration): void {
    const nowMs = this.now();
    const ttlMs = Number(config.expiresInSeconds) * 1_000;
    if (Number.isFinite(ttlMs) && ttlMs > 0) {
      this.expiresAtMs = nowMs + ttlMs;
      const leadMs = Math.min(this.maxRefreshLeadMs, ttlMs * 0.1);
      this.refreshAtMs = this.expiresAtMs - leadMs;
      return;
    }
    this.expiresAtMs = Number.POSITIVE_INFINITY;
    this.refreshAtMs = hasTurnServer(config.iceServers)
      ? Number.POSITIVE_INFINITY : nowMs;
  }

  refreshIfNeeded(): Promise<RtcIceLeaseConfiguration> {
    if (!this.needsRefresh() || !this.refresh) return Promise.resolve(this.config);
    if (this.pending) return this.pending;
    const previous = this.config;
    const previousExpiresAtMs = this.expiresAtMs;
    const request = this.refresh().then((raw) => {
      const next = cloneConfiguration(raw);
      // Preserve a still-valid relay if a transient endpoint failure degrades
      // to direct host candidates. The next replacement will retry after a short
      // cooldown rather than throwing away the working credential generation.
      if (!hasTurnServer(next.iceServers) && hasTurnServer(previous.iceServers) &&
          this.now() < previousExpiresAtMs) {
        this.refreshAtMs = this.now() + this.retryDelayMs;
        return previous;
      }
      this.config = next;
      this.#schedule(next);
      if (!hasTurnServer(next.iceServers)) this.refreshAtMs = this.now() + this.retryDelayMs;
      return this.config;
    }).catch(() => {
      this.refreshAtMs = this.now() + this.retryDelayMs;
      return previous;
    }).finally(() => {
      if (this.pending === request) this.pending = null;
    });
    this.pending = request;
    return request;
  }
}
