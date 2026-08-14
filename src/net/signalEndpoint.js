function isLocalNetworkHost(hostname) {
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
  lan = false,
  protocol = 'http:',
  hostname = 'localhost',
} = {}) {
  const explicit = String(configured || '').trim();
  if (!lan && explicit) return explicit;
  const scheme = protocol === 'https:' ? 'wss:' : 'ws:';
  const host = String(hostname).includes(':') && !String(hostname).startsWith('[')
    ? `[${hostname}]`
    : hostname;
  if (!lan && !isLocalNetworkHost(hostname)) return `${scheme}//${host}/api/signal`;
  if (!isLocalNetworkHost(hostname)) return '';
  return `${scheme}//${host}:7777/signal`;
}
