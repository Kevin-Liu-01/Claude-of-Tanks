/**
 * Where the room host is: production
 * uses the rooms Worker named by `VITE_ROOMS_URL` (a wss:// origin); local and
 * RFC1918 hosts use the LAN helper (`npm run server:mp`) on port 8792. Pure.
 */
import { OFFICIAL_ROOMS_URL, isOfficialSiteHost } from '../../officialHost.ts';

export const LAN_ROOMS_PORT = 8792;

interface RoomsEndpointOptions {
  configured?: string | null | undefined;
  protocol?: string;
  hostname?: string;
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

/**
 * The ICE credential endpoint (api/ice.ts): TURN credentials stay on the frontend origin unless a deployment names
 * another http(s) endpoint; a plain http:// page (local development) contacts no credential provider implicitly.
 */
export function resolveIceConfigUrl({ configured = '', protocol = 'http:' }: { configured?: unknown; protocol?: string } = {}): string {
  const explicit = String(configured ?? '').trim();
  if (explicit) {
    const url = new URL(explicit, `${protocol}//same-origin.invalid/`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new TypeError('service URL must use http or https');
    if (url.username || url.password) throw new TypeError('service URL must not contain credentials');
    if (explicit.includes('#')) throw new TypeError('service URL must not contain a fragment');
    if (protocol === 'https:' && url.protocol === 'http:') throw new TypeError('HTTPS pages require secure HTTPS service URLs (mixed content)');
    return explicit;
  }
  return protocol === 'https:' ? '/api/ice' : '';
}

/** The ws:// or wss:// origin of the room host: the configured one, the official site's Worker, the LAN helper on a
 * local host, or null when this deployment has none. */
export function resolveRoomsUrl({ configured = '', protocol = 'http:', hostname = 'localhost' }: RoomsEndpointOptions = {}): string | null {
  const url = configuredRoomsUrl(configured);
  if (url) {
    if (url.username || url.password) throw new TypeError('rooms URL must not contain credentials');
    if (protocol === 'https:' && url.protocol === 'ws:') throw new TypeError('HTTPS pages require a WSS rooms URL (mixed content)');
    return `${url.protocol}//${url.host}`;
  }
  if (isOfficialSiteHost(hostname)) return OFFICIAL_ROOMS_URL;
  if (!isLocalNetworkHost(hostname)) return null;
  const scheme = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${urlHost(hostname)}:${LAN_ROOMS_PORT}`;
}
