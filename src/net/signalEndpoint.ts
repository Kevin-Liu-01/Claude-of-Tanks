import type { RuntimeValue } from '../runtimeTypes.ts';
export interface SignalEndpointOptions {
  configured?: RuntimeValue;
  protocol?: RuntimeValue;
  hostname?: RuntimeValue;
}

function urlHost(hostname: RuntimeValue): string {
  const hostnameText = String(hostname);
  return hostnameText.includes(':') && !hostnameText.startsWith('[')
    ? `[${hostnameText}]`
    : hostnameText;
}

function isLocalNetworkHost(hostname: RuntimeValue): boolean {
  const host = String(hostname || '').trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (/^10(?:\.\d{1,3}){3}$/.test(host)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(host)) return true;
  const match = /^172\.(\d{1,2})(?:\.\d{1,3}){2}$/.exec(host);
  return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31;
}

/**
 * Resolve only endpoints the current deployment can plausibly reach.
 * Production private rooms use the same-origin TLS WebSocket Function; local
 * and RFC1918 hosts use the bundled port-7777 development server.
 */
export function resolveSignalUrl({
  configured = '',
  protocol = 'http:',
  hostname = 'localhost',
}: SignalEndpointOptions = {}): string {
  const explicit = String(configured || '').trim();
  if (explicit) return explicit;
  const scheme = protocol === 'https:' ? 'wss:' : 'ws:';
  const host = urlHost(hostname);
  if (!isLocalNetworkHost(hostname)) return `${scheme}//${host}/api/signal`;
  return `${scheme}//${host}:7777/signal`;
}

/** Resolve the authoritative match service without requiring a hosted
 * provider. Public deployments use the current origin through their reverse
 * proxy; development and physical-LAN hosts retain the bundled port 8790. */
export function resolveMatchServiceUrl({
  configured = '',
  protocol = 'http:',
  hostname = 'localhost',
}: SignalEndpointOptions = {}): string {
  const explicit = String(configured || '').trim();
  if (explicit) return explicit;
  const scheme = protocol === 'https:' ? 'https:' : 'http:';
  const host = urlHost(hostname);
  return isLocalNetworkHost(hostname)
    ? `${scheme}//${host}:8790`
    : `${scheme}//${host}`;
}
