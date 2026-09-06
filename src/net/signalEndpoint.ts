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

function validateConfiguredEndpoint(
  explicit: string,
  pageProtocol: RuntimeValue,
  kind: 'signal' | 'http',
  allowRelative = false,
): void {
  const url = new URL(explicit, allowRelative ? `${pageProtocol}//same-origin.invalid/` : undefined);
  const validScheme = kind === 'signal'
    ? url.protocol === 'ws:' || url.protocol === 'wss:'
    : url.protocol === 'http:' || url.protocol === 'https:';
  if (!validScheme) {
    throw new TypeError(kind === 'signal'
      ? 'signaling URL must use ws or wss' : 'service URL must use http or https');
  }
  if (url.username || url.password) throw new TypeError('service URL must not contain credentials');
  if (explicit.includes('#')) throw new TypeError('service URL must not contain a fragment');
  if (pageProtocol === 'https:' && (url.protocol === 'http:' || url.protocol === 'ws:')) {
    throw new TypeError('HTTPS pages require secure HTTPS/WSS service URLs (mixed content)');
  }
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
  if (explicit) {
    validateConfiguredEndpoint(explicit, protocol, 'signal');
    return explicit;
  }
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
  if (explicit) {
    validateConfiguredEndpoint(explicit, protocol, 'http');
    return explicit;
  }
  const scheme = protocol === 'https:' ? 'https:' : 'http:';
  const host = urlHost(hostname);
  return isLocalNetworkHost(hostname)
    ? `${scheme}//${host}:8790`
    : `${scheme}//${host}`;
}

/** TURN credentials stay on the frontend origin unless explicitly moved.
 * Splitting signaling/ranked onto another backend must not silently relocate
 * provider secrets or stop the existing same-origin credential deployment. */
export function resolveIceConfigUrl({
  configured = '',
  protocol = 'http:',
}: SignalEndpointOptions = {}): string {
  const explicit = String(configured || '').trim();
  if (explicit) {
    validateConfiguredEndpoint(explicit, protocol, 'http', true);
    return explicit;
  }
  return protocol === 'https:' ? '/api/ice' : '';
}
