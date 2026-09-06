import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

function httpEndpoint(value, label) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash) throw new TypeError(`${label} must be a credential-free HTTP(S) URL`);
  return url;
}

function deploymentEndpoints({ baseUrl, backendUrl, iceUrl, matchUrl, signalMode }) {
  if (!['distributed', 'standalone', 'cloudflare'].includes(signalMode)) {
    throw new TypeError('signal mode must be distributed, standalone, or cloudflare');
  }
  const base = httpEndpoint(baseUrl, 'frontend');
  if (signalMode === 'cloudflare' && !backendUrl) {
    throw new TypeError('cloudflare signaling requires an explicit backend origin');
  }
  const backend = backendUrl ? httpEndpoint(backendUrl, 'backend') : base;
  if (signalMode === 'cloudflare' && backend.pathname !== '/') {
    throw new TypeError('cloudflare backend URL must be an origin without a path');
  }
  const signalPath = signalMode === 'cloudflare' ? '/healthz'
    : backendUrl ? '/healthz/signaling' : '/api/signal';
  const signal = new URL(signalPath, backend);
  const websocket = new URL(signalMode === 'cloudflare' ? '/rooms' : '/api/signal', backend);
  websocket.protocol = backend.protocol === 'https:' ? 'wss:' : 'ws:';
  const endpoints = {
    origin: base.origin, signal, websocket,
    ice: iceUrl ? httpEndpoint(iceUrl, 'ICE endpoint') : new URL('/api/ice', base),
    // Private/LAN hosting has no dedicated service. Legacy health is opt-in.
    match: matchUrl ? httpEndpoint(matchUrl, 'match health endpoint') : null,
  };
  for (const endpoint of [endpoints.signal, endpoints.ice, endpoints.match]) {
    if (base.protocol === 'https:' && endpoint?.protocol === 'http:') {
      throw new TypeError('HTTPS frontends require HTTPS backend, ICE, and match endpoints');
    }
  }
  return endpoints;
}

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

function diagnosticCode(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value) ? value : null;
}

function signalingHealthReceipt(body) {
  if (!body || typeof body !== 'object' || !body.redis) return null;
  return {
    ok: body.ok === true,
    distributed: body.distributed === true,
    redis: {
      ok: body.redis.ok === true,
      command: diagnosticCode(body.redis.command),
      subscriber: diagnosticCode(body.redis.subscriber),
      code: diagnosticCode(body.redis.code),
    },
  };
}

async function fetchJson(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, options);
  let body = null;
  try { body = await response.json(); } catch (_) { /* diagnosed below */ }
  if (!response.ok) {
    const error = new Error(`${label} returned HTTP ${response.status}`);
    error.code = `${label}_http_${response.status}`;
    // Failed signaling health contains the dependency cause under redis, not
    // error. Retain only named non-secret diagnostics; never print raw ICE
    // responses or arbitrary provider JSON with TURN credentials/tokens.
    error.detail = diagnosticCode(body?.error) ||
      (label === 'signal' ? signalingHealthReceipt(body) : null);
    error.http = {
      status: response.status,
      requestId: diagnosticCode(response.headers?.get?.('x-vercel-id')),
      cache: diagnosticCode(response.headers?.get?.('x-vercel-cache')),
    };
    throw error;
  }
  if (!body || typeof body !== 'object') {
    const error = new Error(`${label} returned invalid JSON`);
    error.code = `${label}_invalid_json`;
    throw error;
  }
  return body;
}

function validateSignaling(signal) {
  if (signal.ok !== true || signal.distributed !== true || signal.redis?.ok !== true ||
      signal.redis?.command !== 'ready' || signal.redis?.subscriber !== 'ready') {
    const error = new Error('distributed signaling is not fully ready');
    error.code = 'signal_not_ready';
    error.detail = signalingHealthReceipt(signal);
    throw error;
  }
  return signal;
}

function validateStandaloneSignaling(signal) {
  // Explicit topology selection, never a fallback from degraded Redis.
  if (signal.ok !== true ||
      (signal.distributed !== undefined && signal.distributed !== false) || 'redis' in signal ||
      !Number.isSafeInteger(signal.rooms) || signal.rooms < 0) {
    throw Object.assign(new Error('standalone signaling is not fully ready'), {
      code: 'standalone_signal_not_ready', detail: signalingHealthReceipt(signal),
    });
  }
  return signal;
}

export function validateCloudflareSignaling(signal) {
  if (!signal || typeof signal !== 'object' || Array.isArray(signal) ||
      signal.ok !== true || signal.service !== 'cot-signaling' || signal.backend !== 'durable-object' ||
      'redis' in signal || 'distributed' in signal || 'rooms' in signal) {
    throw Object.assign(new Error('Cloudflare Durable Object signaling is not fully ready'), {
      code: 'cloudflare_signal_not_ready',
    });
  }
  return { ok: true, service: 'cot-signaling', backend: 'durable-object' };
}

function validateMatchHealth(match) {
  if (match.ok !== true || match.service !== 'cot-match') {
    throw Object.assign(new Error('dedicated match service is not ready'), { code: 'match_not_ready' });
  }
  return { ok: true, service: 'cot-match' };
}

function waitForSignalEvent(client, type, predicate, timeoutMs, action = null) {
  let unsubscribe;
  let timer;
  const result = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('room lifecycle notification timed out'),
      { code: 'room_lifecycle_timeout' })), timeoutMs);
    unsubscribe = client.onEvent((event) => {
      if (event.type === type && predicate(event.payload)) resolve(undefined);
    });
    if (action) Promise.resolve().then(action).catch(reject);
  });
  return result.finally(() => { clearTimeout(timer); unsubscribe?.(); });
}

function waitForSocketClose(socket, timeoutMs) {
  if (socket.readyState === 3) return Promise.resolve();
  let timer;
  let onClose;
  const result = new Promise((resolve, reject) => {
    onClose = () => resolve(undefined);
    socket.once('close', onClose);
    timer = setTimeout(() => reject(Object.assign(new Error('test socket did not close'),
      { code: 'room_close_timeout' })), timeoutMs);
  });
  return result.finally(() => { clearTimeout(timer); socket.off('close', onClose); });
}

function closeProbeClient(client, reason) {
  try { client.close(reason); } catch (_) { /* Native close is independently verified. */ }
}

async function verifySignalRelay(sender, receiver, timeoutMs) {
  await waitForSignalEvent(receiver, 'room_signal', (payload) =>
    payload.fromPeerId === sender.peerId && payload.fromSessionId === sender.sessionId &&
      payload.toSessionId === receiver.sessionId && payload.signal?.kind === 'restart',
  timeoutMs, () => {
    if (!sender.sendSignal(receiver.peerId, { kind: 'restart' }, receiver.sessionId)) {
      throw Object.assign(new Error('probe signal was not admitted to its room socket'),
        { code: 'room_relay_not_sent' });
    }
  });
}

async function verifyRoomResume(client, timeoutMs) {
  const { peerId, hostId, roomCode, sessionId, socket } = client;
  await waitForSignalEvent(client, 'signaling_resumed', (payload) =>
    payload.peerId === peerId && payload.hostId === hostId && payload.roomCode === roomCode,
  timeoutMs, async () => {
    if (!await client.restartRoomSession('readiness_resume')) {
      throw Object.assign(new Error('authenticated room resume was rejected'), { code: 'room_resume_failed' });
    }
  });
  if (client.sessionId === sessionId || client.socket === socket) {
    throw Object.assign(new Error('room resume did not replace the signaling generation'),
      { code: 'room_resume_generation_unchanged' });
  }
  await waitForSocketClose(socket, timeoutMs);
}

/** Scoped write probe: never print room codes, session tokens, or credentials. */
export async function verifySignalingRoomLifecycle({ url, origin, timeoutMs = 10_000 } = {}) {
  const [{ WebSocket }, { RoomSignalingClient }] = await Promise.all([
    import('ws'), import('../src/net/signalingClient.ts'),
  ]);
  const sockets = [];
  const clients = [];
  class OriginSocket extends WebSocket {
    constructor(endpoint) {
      super(endpoint, { origin, handshakeTimeout: timeoutMs });
      this.on('error', () => {}); // The client reports errors; retain cleanup safety.
      sockets.push(this);
    }
  }
  const makeClient = () => {
    const client = new RoomSignalingClient({ url: String(url), WebSocketImpl: OriginSocket,
      connectTimeoutMs: timeoutMs, requestTimeoutMs: timeoutMs, resumeStorage: null });
    clients.push(client);
    return client;
  };
  try {
    const nonce = randomBytes(8).toString('hex');
    const host = makeClient();
    const guest = makeClient();
    const room = await host.createRoom({ maxPlayers: 2, mode: 'private',
      player: { id: `probe_h_${nonce}`, name: 'Readiness Host' } });
    const joined = await guest.joinRoom({ roomCode: room.roomCode,
      player: { id: `probe_g_${nonce}`, name: 'Readiness Guest' } });
    if (joined.hostId !== room.hostId || joined.peerId === room.peerId) {
      throw Object.assign(new Error('room join returned inconsistent membership'),
        { code: 'room_membership_mismatch' });
    }
    await verifySignalRelay(host, guest, timeoutMs);
    await verifySignalRelay(guest, host, timeoutMs);
    // Keep the host authenticated so failure during guest resume still has
    // an owner able to delete this exact synthetic room in finally.
    await verifyRoomResume(guest, timeoutMs);
    await verifySignalRelay(guest, host, timeoutMs);
    await verifySignalRelay(host, guest, timeoutMs);
    await waitForSignalEvent(host, 'peer_left',
      (payload) => payload.peerId === joined.peerId, timeoutMs,
      () => closeProbeClient(guest, 'readiness_guest_complete'));
    const witness = makeClient();
    await witness.joinRoom({ roomCode: room.roomCode,
      player: { id: `probe_w_${nonce}`, name: 'Readiness Closure Check' } });
    await Promise.all([
      waitForSocketClose(host.socket, timeoutMs),
      waitForSignalEvent(witness, 'room_closed',
        (payload) => payload.roomCode === room.roomCode && payload.reason === 'host_left',
        timeoutMs, () => closeProbeClient(host, 'readiness_host_complete')),
    ]);
    const absent = makeClient();
    let removed = false;
    try {
      await absent.joinRoom({ roomCode: room.roomCode,
        player: { id: `probe_a_${nonce}`, name: 'Readiness Removal Check' } });
    } catch (error) {
      if (error?.code !== 'room_not_found') throw error;
      removed = true;
    }
    if (!removed) throw Object.assign(new Error('test room survived explicit host departure'),
      { code: 'room_cleanup_failed' });
    return { ok: true, created: true, joined: true, relayed: true, resumed: true,
      relayedAfterResume: true, guestLeft: true, hostClosed: true, roomRemoved: true };
  } catch (error) {
    throw Object.assign(new Error('signaling room lifecycle check failed'), {
      code: diagnosticCode(error?.code) || 'room_lifecycle_failed',
    });
  } finally {
    for (const client of clients) closeProbeClient(client, 'readiness_complete');
    await Promise.all(sockets.map((socket) =>
      waitForSocketClose(socket, Math.min(1000, timeoutMs)).catch(() => socket.terminate())));
  }
}

function validateIce(ice) {
  const relays = turnUrls(ice.iceServers);
  if (!relays.length) {
    const error = new Error('ICE response has no TURN relay');
    error.code = 'turn_relay_missing';
    throw error;
  }
  return { ice, relays };
}

function failureRecord(reason) {
  return {
    code: reason?.code || 'dependency_check_failed',
    message: reason?.message || String(reason),
    detail: reason?.detail || null,
    ...(reason?.http ? { http: reason.http } : {}),
  };
}

/** Check the selected deployment without treating a Redis outage as standalone mode. */
export async function checkProductionMultiplayer({
  baseUrl = 'https://cot.kevinliu.studio',
  backendUrl = '',
  signalMode = 'distributed',
  iceUrl = '',
  matchUrl = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60_000) {
    throw new TypeError('dependency timeout must be an integer from 1 through 60000 ms');
  }
  const endpoints = deploymentEndpoints({ baseUrl, backendUrl, signalMode, iceUrl, matchUrl });
  const { origin } = endpoints;
  const request = (url, label) => fetchJson(fetchImpl, url, {
    headers: { origin },
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  }, label);
  const [signalResult, iceResult, matchResult] = await Promise.allSettled([
    request(endpoints.signal, 'signal').then(async (signal) => {
      if (signalMode === 'distributed') return validateSignaling(signal);
      if (signalMode === 'cloudflare') validateCloudflareSignaling(signal);
      else validateStandaloneSignaling(signal);
      return verifySignalingRoomLifecycle({ url: endpoints.websocket, origin, timeoutMs });
    }),
    request(endpoints.ice, 'ice').then(validateIce),
    endpoints.match ? request(endpoints.match, 'match').then(validateMatchHealth) : null,
  ]);
  const dependencies = {
    signal: signalResult.status === 'fulfilled'
      ? { ok: true }
      : { ok: false, ...failureRecord(signalResult.reason) },
    ice: iceResult.status === 'fulfilled'
      ? { ok: true }
      : { ok: false, ...failureRecord(iceResult.reason) },
  };
  if (endpoints.match) dependencies.match = matchResult.status === 'fulfilled'
    ? { ok: true } : { ok: false, ...failureRecord(matchResult.reason) };
  const failures = [signalResult, iceResult, matchResult].filter((result) => result.status === 'rejected');
  if (failures.length === 1) {
    const error = failures[0].reason;
    error.dependencies = dependencies;
    throw error;
  }
  if (failures.length > 1) {
    const error = new Error('multiple multiplayer dependency checks failed');
    error.code = 'production_dependencies_failed';
    error.detail = dependencies;
    error.dependencies = dependencies;
    throw error;
  }
  const { ice, relays } = iceResult.value;
  return {
    ok: true,
    origin,
    signaling: `${signalMode}-ready`,
    ...(signalMode !== 'distributed' ? { roomLifecycle: signalResult.value } : {}),
    ...(endpoints.match ? { match: matchResult.value } : {}),
    relayCount: relays.length,
    secureRelayCount: relays.filter((url) => /^turns:/i.test(url)).length,
    expiresInSeconds: Number.isFinite(ice.expiresInSeconds)
      ? Number(ice.expiresInSeconds) : null,
  };
}

/**
 * Prove that a pristine browser can turn the issued credentials into an
 * actual relay candidate. URL validation alone cannot detect expired,
 * revoked, unreachable, or provider-rejected TURN credentials.
 */
export async function verifyProductionTurnAllocation({
  baseUrl = 'https://cot.kevinliu.studio',
  iceUrl = '',
  timeoutMs = 15_000,
  launchBrowser = null,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('TURN allocation timeout must be positive');
  }
  const endpoint = iceUrl ? httpEndpoint(iceUrl, 'ICE endpoint').href
    : new URL('/api/ice', httpEndpoint(baseUrl, 'frontend')).href;
  if (new URL(baseUrl).protocol === 'https:' && new URL(endpoint).protocol !== 'https:') {
    throw new TypeError('HTTPS frontends require an HTTPS ICE endpoint');
  }
  const launch = launchBrowser || (async () => {
    const { default: puppeteer } = await import('puppeteer');
    return puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });
  const browser = await launch();
  let context = null;
  try {
    context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setCacheEnabled?.(false);
    const probeUrl = new URL('/robots.txt?cot-turn-allocation-probe=1', baseUrl).href;
    await page.goto(probeUrl, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    const receipt = await page.evaluate(async ({ allocationTimeoutMs, endpoint }) => {
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'include' });
      if (!response.ok) throw new Error(`ICE endpoint returned HTTP ${response.status}`);
      const config = await response.json();
      if (!Array.isArray(config?.iceServers)) {
        throw new Error('ICE endpoint returned no server list');
      }

      const peer = new RTCPeerConnection({
        iceServers: config.iceServers,
        iceTransportPolicy: 'relay',
      });
      const protocols = new Set();
      let relayCandidateCount = 0;
      let gatheringTimer = 0;
      try {
        const gathering = new Promise((resolve, reject) => {
          gatheringTimer = setTimeout(() => reject(new Error('TURN allocation timed out')),
            allocationTimeoutMs);
          peer.addEventListener('icecandidate', (event) => {
            const candidate = event.candidate;
            if (!candidate) {
              clearTimeout(gatheringTimer);
              resolve(undefined);
              return;
            }
            if (candidate.type !== 'relay') return;
            relayCandidateCount++;
            if (candidate.protocol) protocols.add(candidate.protocol);
          });
        });
        peer.createDataChannel('cot-turn-allocation-probe');
        await peer.setLocalDescription(await peer.createOffer());
        await gathering;
      } finally {
        clearTimeout(gatheringTimer);
        peer.close();
      }
      if (relayCandidateCount < 1) throw new Error('TURN returned no relay candidate');
      return {
        relayCandidateCount,
        protocols: [...protocols].sort(),
      };
    }, { allocationTimeoutMs: timeoutMs, endpoint });
    if (!receipt || !Number.isInteger(receipt.relayCandidateCount) ||
        receipt.relayCandidateCount < 1 || !Array.isArray(receipt.protocols)) {
      throw new Error('browser returned an invalid TURN allocation receipt');
    }
    return {
      ok: true,
      relayCandidateCount: receipt.relayCandidateCount,
      protocols: receipt.protocols.map(String),
      pristineBrowserContext: true,
    };
  } catch (error) {
    const wrapped = new Error(`production TURN allocation failed: ${error?.message || error}`);
    wrapped.code = 'turn_allocation_failed';
    throw wrapped;
  } finally {
    await context?.close?.().catch(() => {});
    await browser?.close?.().catch(() => {});
  }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const baseUrl = process.argv.find((arg) => arg.startsWith('--url='))?.slice(6)
    || 'https://cot.kevinliu.studio';
  const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))
    ?.slice(name.length + 3) || '';
  const iceUrl = option('ice-url');
  const options = { baseUrl, backendUrl: option('backend-url'), iceUrl,
    matchUrl: option('match-url'), signalMode: option('signal-mode') || 'distributed' };
  let dependencyReceipt = null;
  try {
    dependencyReceipt = await checkProductionMultiplayer(options);
    const allocation = process.argv.includes('--dependency-only')
      ? null
      : await verifyProductionTurnAllocation({ baseUrl, iceUrl });
    console.log(JSON.stringify({
      ...dependencyReceipt,
      ...(allocation ? { allocation } : {}),
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      code: error?.code || 'production_multiplayer_check_failed',
      message: error?.message || String(error),
      detail: error?.detail || null,
      ...(error?.http ? { http: error.http } : {}),
      dependencies: error?.dependencies || (dependencyReceipt ? {
        signal: { ok: true },
        ice: { ok: true },
        ...(dependencyReceipt.match ? { match: { ok: true } } : {}),
      } : null),
    }, null, 2));
    process.exitCode = 1;
  }
}
