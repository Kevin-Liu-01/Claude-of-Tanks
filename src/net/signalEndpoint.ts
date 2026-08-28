export interface SignalEndpointOptions {
  configured?: unknown;
  protocol?: unknown;
  hostname?: unknown;
}

function isLocalNetworkHost(hostname: unknown): boolean {
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
  const hostnameText = String(hostname);
  const host = hostnameText.includes(':') && !hostnameText.startsWith('[')
    ? `[${hostnameText}]`
    : hostnameText;
  if (!isLocalNetworkHost(hostname)) return `${scheme}//${host}/api/signal`;
  return `${scheme}//${host}:7777/signal`;
}
