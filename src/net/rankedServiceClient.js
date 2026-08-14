const IDENTITY_KEY = 'cot.ranked.identity.v1';

function endpoint(value) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('ranked service URL must use http or https');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  url.search = '';
  url.hash = '';
  return url;
}

async function responseJson(response) {
  let body = null;
  try { body = await response.json(); } catch (_) { /* response may be empty */ }
  if (!response.ok) throw Object.assign(new Error(body?.message || body?.error ||
    `ranked service returned ${response.status}`), {
    status: response.status,
    code: body?.error || 'ranked_service_error',
  });
  return body;
}

function storageRead(storage, key) {
  try {
    const value = JSON.parse(storage?.getItem(key) || 'null');
    return value && typeof value.playerId === 'string' && typeof value.token === 'string'
      ? value : null;
  } catch (_) { return null; }
}

function storageWrite(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch (_) { /* session-only */ }
}

function storageRemove(storage, key) {
  try { storage?.removeItem(key); } catch (_) { /* session-only */ }
}

export function rankedMatchWebSocketUrl(serviceUrl) {
  const url = endpoint(serviceUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = `${url.pathname}/match`.replace(/\/+/g, '/');
  return url.toString();
}

/** Browser client for anonymous ranked identity, queue, and leaderboard APIs. */
export function createRankedServiceClient({
  url,
  fetchImpl = globalThis.fetch,
  storage = globalThis.localStorage,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const base = endpoint(url);
  const baseHref = `${base.origin}${base.pathname.replace(/\/+$/, '')}/`;
  const identityKey = `${IDENTITY_KEY}:${base.origin}${base.pathname}`;
  const call = (path, options = {}) => fetchImpl(new URL(path, baseHref), options)
    .then(responseJson);
  let identity = storageRead(storage, identityKey);

  async function ensureIdentity(name) {
    if (identity) return { ...identity };
    identity = await call('ranked/identity', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    storageWrite(storage, identityKey, identity);
    return { ...identity };
  }

  async function join({ name, specId, equipment = [], teamSize = 1 } = {}) {
    const player = await ensureIdentity(name);
    const ticket = await call('ranked/queue', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${player.token}`,
      },
      body: JSON.stringify({ playerId: player.playerId, specId, equipment, teamSize }),
    });
    const ticketId = ticket.ticketId;
    const ticketToken = ticket.ticketToken;
    return {
      ...ticket,
      async poll() {
        return call(`ranked/queue/${encodeURIComponent(ticketId)}`, {
          headers: { authorization: `Bearer ${ticketToken}` },
        });
      },
      async cancel() {
        return call(`ranked/queue/${encodeURIComponent(ticketId)}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${ticketToken}` },
        });
      },
      async wait({ signal = null, onUpdate = null, intervalMs = 800 } = {}) {
        while (!signal?.aborted) {
          const state = await this.poll();
          if (onUpdate) onUpdate(state);
          if (state.status === 'matched' || state.status === 'finished') return state;
          if (state.status !== 'queued') throw new Error(`ranked queue ${state.status}`);
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, Math.max(250, intervalMs));
            if (signal) signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(Object.assign(new Error('ranked queue cancelled'), { name: 'AbortError' }));
            }, { once: true });
          });
        }
        throw Object.assign(new Error('ranked queue cancelled'), { name: 'AbortError' });
      },
    };
  }

  return {
    serviceUrl: base.toString(),
    webSocketUrl: rankedMatchWebSocketUrl(base),
    ensureIdentity,
    identity: () => identity ? { ...identity } : null,
    clearIdentity() {
      identity = null;
      storageRemove(storage, identityKey);
    },
    profile: (playerId = identity?.playerId) =>
      call(`ranked/profile/${encodeURIComponent(playerId || '')}`),
    leaderboard: (limit = 50) => call(`ranked/leaderboard?limit=${Math.max(1, Math.min(100, limit))}`),
    join,
  };
}
