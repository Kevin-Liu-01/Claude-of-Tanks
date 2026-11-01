/**
 * Where the phone controller pairs (docs/PHONE-CONTROLLER.md): the rooms Worker's `/pad/*` routes. The same policy as
 * the rooms' endpoint (src/mp/session/endpoint.ts, which this module must not import: pairing never reaches src/mp) —
 * a configured `VITE_ROOMS_URL`, the official site's Worker, the LAN helper on a local host, else none. Pure.
 */
import { OFFICIAL_ROOMS_URL, isOfficialSiteHost } from '../officialHost.ts';

/** The LAN helper's port (`npm run server:mp`, server/rooms/main.ts), which serves `/pad/*` beside the rooms. */
const LAN_PAD_PORT = 8792;

function isLocalNetworkHost(hostname: string): boolean {
  const host = String(hostname || '').trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(host) || /^10(?:\.\d{1,3}){3}$/.test(host) || /^192\.168(?:\.\d{1,3}){2}$/.test(host)) return true;
  const match = /^172\.(\d{1,2})(?:\.\d{1,3}){2}$/.exec(host);
  return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

/** The ws(s):// origin that serves `/pad/*` for a page, or null when this deployment has none. */
export function resolvePadServiceUrl(configured: unknown, protocol: string, hostname: string): string | null {
  const explicit = String(configured ?? '').trim();
  if (explicit) {
    try {
      const url = new URL(explicit);
      if ((url.protocol === 'ws:' || url.protocol === 'wss:') && !url.username && !url.password &&
        !(protocol === 'https:' && url.protocol === 'ws:')) return `${url.protocol}//${url.host}`;
    } catch { /* not configured */ }
  }
  if (isOfficialSiteHost(hostname)) return OFFICIAL_ROOMS_URL;
  if (!isLocalNetworkHost(hostname)) return null;
  const host = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
  return `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}:${LAN_PAD_PORT}`;
}

/** This page's pad service (a `?padService=ws://…` override serves local proofs only). */
export function padServiceUrl(): string | null {
  if (typeof location === 'undefined') return null;
  const override = isLocalNetworkHost(location.hostname) ? new URLSearchParams(location.search).get('padService') : null;
  return resolvePadServiceUrl(override || import.meta.env.VITE_ROOMS_URL, location.protocol, location.hostname);
}
