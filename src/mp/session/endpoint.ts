/**
 * Where the v2 room host is, mirroring src/net/signalEndpoint.ts: production
 * uses the rooms Worker named by `VITE_ROOMS_URL` (a wss:// origin); local and
 * RFC1918 hosts use the LAN helper (`npm run server:mp`) on port 8792. Pure.
 */
export const LAN_ROOMS_PORT = 8792;

interface RoomsEndpointOptions {
  configured?: string | null | undefined;
  protocol?: string;
  hostname?: string;
}

function urlHost(hostname: string): string {
  return hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
}

export function isLocalNetworkHost(hostname: string): boolean {
  const host = String(hostname || '').trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (/^10(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(host)) return true;
  const match = /^172\.(\d{1,2})(?:\.\d{1,3}){2}$/.exec(host);
  return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

/** The ws:// or wss:// origin of the room host, or null when this deployment has none. */
export function resolveRoomsUrl({ configured = '', protocol = 'http:', hostname = 'localhost' }: RoomsEndpointOptions = {}): string | null {
  const explicit = String(configured ?? '').trim();
  if (explicit) {
    const url = new URL(explicit);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') throw new TypeError('rooms URL must use ws or wss');
    if (url.username || url.password) throw new TypeError('rooms URL must not contain credentials');
    if (protocol === 'https:' && url.protocol === 'ws:') throw new TypeError('HTTPS pages require a WSS rooms URL (mixed content)');
    return `${url.protocol}//${url.host}`;
  }
  if (!isLocalNetworkHost(hostname)) return null;
  const scheme = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${urlHost(hostname)}:${LAN_ROOMS_PORT}`;
}
