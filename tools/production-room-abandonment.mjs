import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { SIGNALING_DETACHED_GRACE_MS, SIGNALING_PEER_IDLE_TTL_MS } from '../server/roomStore.ts';

export function abandonmentOptions({ url, origin, timeoutMs = 225_000 } = {}) {
  const endpoint = new URL(url);
  const frontend = new URL(origin);
  if (!['ws:', 'wss:'].includes(endpoint.protocol) || endpoint.username || endpoint.password ||
      !/^\/rooms\/?$/.test(endpoint.pathname) || endpoint.search || endpoint.hash ||
      !['http:', 'https:'].includes(frontend.protocol) ||
      frontend.username || frontend.password || frontend.pathname !== '/' || frontend.search || frontend.hash ||
      (frontend.protocol === 'https:' && endpoint.protocol !== 'wss:')) {
    throw new TypeError('explicit credential-free signaling URL and frontend origin required');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10_000 || timeoutMs > 300_000) {
    throw new TypeError('timeout must be 10000 through 300000 milliseconds');
  }
  return { url: endpoint.href.replace(/\/$/, ''), origin: frontend.origin, timeoutMs };
}

function failure(code) { return Object.assign(new Error(code), { code }); }

export class ProbePeer {
  pending = new Set();
  messages = [];
  sequence = 0;
  closed = false;
  constructor(socket, code, requestTimeoutMs = 8000) {
    this.socket = socket;
    this.code = code;
    this.requestTimeoutMs = requestTimeoutMs;
    socket.on('error', () => {});
    socket.on('close', () => {
      this.closed = true;
      for (const waiter of this.pending) waiter.reject(failure('abandonment_socket_closed'));
    });
    socket.on('message', (data) => {
      let message;
      try { message = JSON.parse(String(data)); } catch { return; }
      this.messages.push(message);
      if (this.messages.length > 128) this.messages.shift();
      for (const waiter of this.pending) if (waiter.predicate(message)) waiter.resolve(message);
    });
  }
  wait(predicate, timeoutMs) {
    const previous = this.messages.find(predicate);
    if (previous) return Promise.resolve(previous);
    if (this.closed) return Promise.reject(failure('abandonment_socket_closed'));
    let timer;
    let waiter;
    return new Promise((resolve, reject) => {
      waiter = { predicate, resolve, reject };
      this.pending.add(waiter);
      timer = setTimeout(() => reject(failure('abandonment_notification_timeout')), timeoutMs);
    }).finally(() => { clearTimeout(timer); this.pending.delete(waiter); });
  }
  request(type, payload = {}) {
    if (this.socket.readyState !== WebSocket.OPEN) return Promise.reject(failure('abandonment_socket_closed'));
    const requestId = String(++this.sequence);
    const receipt = this.wait((message) => message.requestId === requestId, this.requestTimeoutMs);
    try { this.socket.send(JSON.stringify({ type, requestId, payload: { roomCode: this.code, ...payload } })); }
    catch { for (const waiter of this.pending) waiter.reject(failure('abandonment_send_failed')); }
    return receipt;
  }
  async leave() {
    // The Worker intentionally has no room_leave request response. Its close
    // handshake follows the durable deletion; only then verify absence.
    if (this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'room_leave', payload: { roomCode: this.code } }));
    }
    return this.waitClosed(this.requestTimeoutMs);
  }
  waitClosed(timeoutMs) {
    if (this.closed || this.socket.readyState === WebSocket.CLOSED) return Promise.resolve(true);
    return new Promise((resolve) => {
      const closed = () => { clearTimeout(timer); resolve(true); };
      const timer = setTimeout(() => { this.socket.off('close', closed); resolve(false); }, timeoutMs);
      this.socket.once('close', closed);
    });
  }
  async dispose() {
    const closed = this.waitClosed(1000);
    this.socket.terminate();
    return closed;
  }
}

async function connect(scope, code) {
  const peer = new ProbePeer(new scope.Socket(`${scope.options.url}/${code}`, {
    origin: scope.options.origin, handshakeTimeout: scope.requestTimeoutMs, maxPayload: 128 * 1024,
  }), code, scope.requestTimeoutMs);
  scope.peers.push(peer);
  await new Promise((resolve, reject) => {
    peer.socket.once('open', resolve);
    peer.socket.once('error', () => reject(failure('abandonment_connect_failed')));
  });
  return peer;
}

function identity(id, resumeToken) {
  return { player: { id, name: 'Room cleanup verification' },
    sessionId: randomBytes(12).toString('hex'), nextResumeToken: randomBytes(32).toString('hex'),
    ...(resumeToken ? { resumeToken } : {}) };
}

async function room(scope) {
  // Private random test identity; never include codes or capabilities in output.
  const code = scope.codeFactory();
  if (!/^[A-Z0-9]{6}$/.test(code)) throw failure('abandonment_invalid_candidate');
  const host = await connect(scope, code);
  const proof = identity('cleanup_host');
  // Record the private proof before dispatch: a lost creation receipt must not orphan a room.
  const owned = { code, host, resumeToken: proof.nextResumeToken, removed: false, admitted: false };
  scope.rooms.push(owned);
  const created = await host.request('room_create', { ...proof, maxPlayers: 2 });
  if (created.type !== 'room_created') {
    // Only an explicit occupied-code rejection proves the candidate was never
    // ours. A failure after a durable write still requires capability cleanup.
    owned.removed = created.type === 'error' && created.payload?.code === 'room_code_exhausted';
    throw failure('abandonment_create_failed');
  }
  owned.admitted = true;
  owned.resumeToken = created.payload.resumeToken;
  const guest = await connect(scope, code);
  const joined = await guest.request('room_join', identity('cleanup_guest'));
  if (joined.type !== 'room_joined') throw failure('abandonment_join_failed');
  owned.guest = guest;
  return owned;
}

function keepAlive(scope, peer) {
  // No per-frame polling; actual player signaling uses a 15-second heartbeat.
  const timer = setInterval(() => {
    if (!peer.closed && peer.socket.readyState === WebSocket.OPEN) {
      peer.request('room_poll').catch(() => {});
    }
  }, scope.heartbeatMs);
  scope.timers.push(timer);
}

async function verifyAbsent(scope, owned) {
  const stranger = await connect(scope, owned.code);
  const result = await stranger.request('room_join', identity('cleanup_absence_witness'));
  if (result.type !== 'error' || result.payload.code !== 'room_not_found') {
    throw failure('abandoned_room_still_joinable');
  }
  owned.removed = true;
}

async function hostExpiry(scope, abrupt, minimumMs) {
  const owned = await room(scope);
  keepAlive(scope, owned.guest);
  const start = scope.now();
  if (abrupt) owned.host.socket.terminate();
  const receipt = await owned.guest.wait((message) => message.type === 'room_closed', scope.notificationTimeoutMs);
  const elapsedMs = Math.round(scope.now() - start);
  if (receipt.payload.reason !== 'expired' || elapsedMs < minimumMs - 2000) {
    throw failure('abandonment_wrong_expiry_policy');
  }
  await verifyAbsent(scope, owned);
  return { reason: 'expired', elapsedMs, guestTrafficDidNotRenewHost: true, roomNotFound: true };
}

async function recoverOwnedHost(scope, owned) {
  // Persist the proposed successor before dispatch. The same proof can retry
  // a lost reply without making a second, unknowable token rotation.
  const proof = owned.cleanupProof ??= identity('cleanup_host', owned.resumeToken);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const host = await connect(scope, owned.code);
      const joined = await host.request('room_join', proof);
      if (joined.type === 'error' && joined.payload?.code === 'room_not_found') {
        owned.removed = true;
        return null;
      }
      if (joined.type !== 'room_joined') return null;
      owned.host = host;
      owned.admitted = true;
      owned.resumeToken = proof.nextResumeToken;
      return host;
    } catch { /* one exact-proof retry after an uncertain reply */ }
  }
  return null;
}

async function retireOwnedRoom(scope, owned) {
  if (owned.removed) return true;
  let host = owned.host;
  if (!owned.admitted || host.socket.readyState !== WebSocket.OPEN) {
    host = await recoverOwnedHost(scope, owned);
    if (!host) return owned.removed;
  }
  if (!await host.leave()) return false;
  await verifyAbsent(scope, owned);
  return true;
}

/** Only temporary owned rooms. No administrator endpoint, time override, or Redis access. */
export async function verifyProductionAbandonment(options, dependencies = {}) {
  const validated = abandonmentOptions(options);
  const scope = { options: validated, peers: [], rooms: [], timers: [],
    Socket: dependencies.Socket ?? WebSocket,
    now: dependencies.now ?? (() => performance.now()),
    heartbeatMs: dependencies.heartbeatMs ?? 10_000,
    requestTimeoutMs: dependencies.requestTimeoutMs ?? 8000,
    notificationTimeoutMs: dependencies.notificationTimeoutMs ?? validated.timeoutMs,
    codeFactory: dependencies.codeFactory ?? (() => randomBytes(4).toString('hex').slice(0, 6).toUpperCase()) };
  let result;
  let error;
  try {
    // All scenarios settle before cleanup, so a failure cannot race creation of a later orphan.
    const results = await Promise.allSettled([
      hostExpiry(scope, true, SIGNALING_DETACHED_GRACE_MS),
      hostExpiry(scope, false, SIGNALING_PEER_IDLE_TTL_MS),
    ]);
    if (results.some((entry) => entry.status !== 'fulfilled')) throw failure('abandonment_policy_failed');
    result = { ok: true, abruptHost: results[0].value, silentOpenHost: results[1].value };
  } catch { error = failure('production_abandonment_failed'); }
  for (const timer of scope.timers) clearInterval(timer);
  const retired = await Promise.all(scope.rooms.map((owned) => retireOwnedRoom(scope, owned).catch(() => false)));
  const closed = await Promise.all(scope.peers.map((peer) => peer.dispose()));
  const cleanup = { ownedRoomsRemoved: retired.every(Boolean), socketsTerminated: closed.every(Boolean) };
  if (!cleanup.ownedRoomsRemoved || !cleanup.socketsTerminated) error = failure('production_abandonment_cleanup_failed');
  if (error) throw Object.assign(error, { cleanup });
  return { ...result, cleanup };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
      const [name, ...value] = arg.replace(/^--/, '').split('=');
      return [name, value.join('=')];
    }));
    console.log(JSON.stringify(await verifyProductionAbandonment({
      url: args.url, origin: args.origin, ...(args['timeout-ms'] ? { timeoutMs: Number(args['timeout-ms']) } : {}),
    }), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: error?.code || 'abandonment_configuration_failed',
      ...(error?.cleanup ? { cleanup: error.cleanup } : {}) }));
    process.exitCode = 1;
  }
}
