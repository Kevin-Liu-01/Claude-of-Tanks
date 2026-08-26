import { pathToFileURL } from 'node:url';

function turnUrls(servers) {
  const urls = [];
  for (const server of servers || []) {
    const values = Array.isArray(server?.urls) ? server.urls : [server?.urls];
    for (const value of values) {
      if (typeof value === 'string' && /^turns?:/i.test(value)) urls.push(value);
    }
  }
  return urls;
}

async function fetchJson(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, options);
  let body = null;
  try { body = await response.json(); } catch (_) { /* diagnosed below */ }
  if (!response.ok) {
    const error = new Error(`${label} returned HTTP ${response.status}`);
    error.code = `${label}_http_${response.status}`;
    error.detail = body?.error || null;
    throw error;
  }
  if (!body || typeof body !== 'object') {
    const error = new Error(`${label} returned invalid JSON`);
    error.code = `${label}_invalid_json`;
    throw error;
  }
  return body;
}

/** Prove the two production dependencies required by a first-time friend join. */
export async function checkProductionMultiplayer({
  baseUrl = 'https://cot.kevinliu.studio',
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const base = new URL(baseUrl);
  const origin = base.origin;
  const signalUrl = new URL('/api/signal', base);
  const iceUrl = new URL('/api/ice', base);
  const request = (url) => fetchJson(fetchImpl, url, {
    headers: { origin },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  }, url.pathname === '/api/signal' ? 'signal' : 'ice');
  const [signal, ice] = await Promise.all([request(signalUrl), request(iceUrl)]);
  if (signal.ok !== true || signal.distributed !== true || signal.redis?.ok !== true ||
      signal.redis?.command !== 'ready' || signal.redis?.subscriber !== 'ready') {
    const error = new Error('distributed signaling is not fully ready');
    error.code = 'signal_not_ready';
    throw error;
  }
  const relays = turnUrls(ice.iceServers);
  if (!relays.length) {
    const error = new Error('ICE response has no TURN relay');
    error.code = 'turn_relay_missing';
    throw error;
  }
  return {
    ok: true,
    origin,
    signaling: 'distributed-ready',
    relayCount: relays.length,
    secureRelayCount: relays.filter((url) => /^turns:/i.test(url)).length,
    expiresInSeconds: Number.isFinite(ice.expiresInSeconds)
      ? Number(ice.expiresInSeconds) : null,
  };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const baseUrl = process.argv.find((arg) => arg.startsWith('--url='))?.slice(6)
    || 'https://cot.kevinliu.studio';
  try {
    console.log(JSON.stringify(await checkProductionMultiplayer({ baseUrl }), null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error?.code || 'production_multiplayer_check_failed',
      message: error?.message || String(error),
      detail: error?.detail || null,
    }, null, 2));
    process.exitCode = 1;
  }
}
