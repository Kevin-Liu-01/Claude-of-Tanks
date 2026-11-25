/**
 * Where the room host is: production
 * uses the rooms Worker named by `VITE_ROOMS_URL` (a wss:// origin); local and
 * RFC1918 hosts use the LAN helper (`npm run server:mp`) on port 8792. Pure.
 * A page on a loopback host alone may name another LAN helper port with `?roomsPort=` (capture-slot-ports-277): a
 * tool serving a built site runs its own rooms service on its capture slot's port (tools/capture-ports.mjs), so two
 * tools never share 8792. A LAN or public host ignores it, and a configured or official room host always wins.
 */
import { OFFICIAL_ROOMS_URL, isOfficialSiteHost } from '../../officialHost.ts';

export const LAN_ROOMS_PORT = 8792;

interface RoomsEndpointOptions {
  configured?: string | null | undefined;
  protocol?: string;
  hostname?: string;
  /** The page's `?roomsPort=` value (roomsPortOverride): honoured on a loopback host only. */
  roomsPort?: string | number | null | undefined;
}

/** A loopback host: the page and the helper on this machine (a LAN address is another machine's page). */
function isLoopbackHost(hostname: string): boolean {
  const host = String(hostname || '').trim().replace(/^\[|\]$/g, '').toLowerCase();
  return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

/** The LAN helper port a page names with `?roomsPort=`: a whole number 1024-65535 on a loopback host, else null. */
export function roomsPortOverride(roomsPort: unknown, hostname: string): number | null {
  if (!isLoopbackHost(hostname) || !/^\d{4,5}$/.test(String(roomsPort ?? '').trim())) return null;
  const port = Number(String(roomsPort).trim());
  return port >= 1024 && port <= 65535 ? port : null;
}

function urlHost(hostname: string): string {
  return hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
}

function isLocalNetworkHost(hostname: string): boolean {
  const host = String(hostname || '').trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (/^10(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(host)) return true;
  const match = /^172\.(\d{1,2})(?:\.\d{1,3}){2}$/.exec(host);
  return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

/** A configured value a build can use: a parseable ws:// or wss:// URL. Vercel's sensitive variables reach a CLI build as
 * the literal `[SENSITIVE]` (deploy 114, 2026-09-28) and an unset one as undefined — both mean "not configured". */
export function configuredRoomsUrl(configured: unknown): URL | null {
  const explicit = String(configured ?? '').trim();
  if (!explicit) return null;
  let url: URL;
  try { url = new URL(explicit); } catch { return null; }
  return url.protocol === 'ws:' || url.protocol === 'wss:' ? url : null;
}

/** The ws:// or wss:// origin of the room host: the configured one, the official site's Worker, the LAN helper on a
 * local host, or null when this deployment has none. */
export function resolveRoomsUrl({ configured = '', protocol = 'http:', hostname = 'localhost', roomsPort = null }: RoomsEndpointOptions = {}): string | null {
  const url = configuredRoomsUrl(configured);
  if (url) {
    if (url.username || url.password) throw new TypeError('rooms URL must not contain credentials');
    if (protocol === 'https:' && url.protocol === 'ws:') throw new TypeError('HTTPS pages require a WSS rooms URL (mixed content)');
    return `${url.protocol}//${url.host}`;
  }
  if (isOfficialSiteHost(hostname)) return OFFICIAL_ROOMS_URL;
  if (!isLocalNetworkHost(hostname)) return null;
  const scheme = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${urlHost(hostname)}:${roomsPortOverride(roomsPort, hostname) ?? LAN_ROOMS_PORT}`;
}
