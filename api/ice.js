const OFFICIAL_ORIGINS = new Set([
  'https://cot.kevinliu.studio',
  'https://claudeoftanks.kevinliu.studio',
  'https://claude-of-tanks.vercel.app',
  'https://claude-of-tanks-kl01s-projects.vercel.app',
]);
const DEFAULT_TTL_SECONDS = 8 * 60 * 60;

function configuredOrigins(env) {
  const extra = String(env.COT_ALLOWED_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  return new Set([...OFFICIAL_ORIGINS, ...extra]);
}

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'private, no-store, max-age=0');
  response.setHeader('vary', 'Origin');
  response.end(JSON.stringify(body));
}

function validIceServers(value) {
  return Array.isArray(value) && value.length > 0 && value.every((server) => {
    const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
    return urls.length > 0 && urls.every(
      (url) => typeof url === 'string' && /^(?:stun|turns?):/i.test(url),
    );
  });
}

export function createIceConfigHandler({
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  return async function iceConfig(request, response) {
    if (request.method !== 'GET') {
      response.setHeader('allow', 'GET');
      send(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const origin = String(request.headers?.origin || '');
    if (origin && !configuredOrigins(env).has(origin)) {
      send(response, 403, { error: 'origin_forbidden' });
      return;
    }

    const staticJson = String(env.COT_TURN_ICE_SERVERS_JSON || '').trim();
    if (staticJson) {
      try {
        const iceServers = JSON.parse(staticJson);
        if (!validIceServers(iceServers)) throw new Error('invalid ICE server list');
        send(response, 200, { iceServers, relayOnly: false });
      } catch (_) {
        send(response, 503, { error: 'turn_configuration_invalid' });
      }
      return;
    }

    const keyId = String(env.COT_CLOUDFLARE_TURN_KEY_ID || '').trim();
    const token = String(env.COT_CLOUDFLARE_TURN_API_TOKEN || '').trim();
    if (!keyId || !token) {
      send(response, 503, { error: 'turn_service_unconfigured' });
      return;
    }
    const requestedTtl = Number(env.COT_TURN_TTL_SECONDS || DEFAULT_TTL_SECONDS);
    const ttl = Math.max(3_600, Math.min(86_400,
      Number.isFinite(requestedTtl) ? Math.round(requestedTtl) : DEFAULT_TTL_SECONDS));
    try {
      const upstream = await fetchImpl(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}` +
          '/credentials/generate-ice-servers',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ ttl }),
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!upstream.ok) {
        send(response, 503, { error: 'turn_service_unavailable' });
        return;
      }
      const body = await upstream.json();
      if (!validIceServers(body?.iceServers)) {
        send(response, 503, { error: 'turn_service_invalid' });
        return;
      }
      send(response, 200, {
        iceServers: body.iceServers,
        relayOnly: false,
        expiresInSeconds: ttl,
      });
    } catch (_) {
      send(response, 503, { error: 'turn_service_unavailable' });
    }
  };
}

export default createIceConfigHandler();
