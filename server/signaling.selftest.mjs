import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { DistributedSignalingRoomStore } from './distributedRoomStore.ts';
import { SignalingRoomStore } from './roomStore.ts';
import { createRoomCode } from './roomCode.ts';
import { createSignalingServer } from './signalingServer.ts';
import { createIceConfigHandler } from '../api/ice.ts';
import { RoomSignalingClient } from '../src/net/signalingClient.ts';
import { SignalingResumeCredentials } from '../src/net/signalingResumeCredentials.ts';

assert.throws(() => createSignalingServer({ allowedOrigins: [] }), /at least one exact origin/,
  'an explicit empty allowlist must not become an unrestricted server');
for (const origins of ['', '   ', ' , ']) {
  const cli = spawnSync(process.execPath, ['server/signalingServer.ts', '--port', '0'], {
    env: { ...process.env, COT_SIGNAL_HOST: '127.0.0.1', COT_ALLOWED_ORIGINS: origins },
    encoding: 'utf8', timeout: 5000,
  });
  assert.equal(cli.status, 1, 'malformed explicit CLI origins fail before listen, not at timeout');
  assert.match(cli.stderr, /COT_ALLOWED_ORIGINS must contain at least one exact origin/);
  assert.doesNotMatch(cli.stdout, /signaling ready/);
}

assert.equal(createRoomCode(() => 0), 'AAAAAA');
assert.equal(createRoomCode(() => 0.999999), '999999');
assert.throws(() => createRoomCode(() => Number.NaN), (error) => error.code === 'invalid_rng');
const productionStoreSources = await Promise.all([
  readFile(new URL('./roomStore.ts', import.meta.url), 'utf8'),
  readFile(new URL('./distributedRoomStore.ts', import.meta.url), 'utf8'),
]);
for (const source of productionStoreSources) {
  assert.doesNotMatch(source, /from\s+['"][^'"]+\.js['"]/,
    'the typed Vercel signaling closure must not fall back into uncompiled JavaScript leaves');
}

class FlakySubscriber extends EventEmitter {
  static failuresRemaining = 0;

  constructor() {
    super();
    this.status = 'wait';
  }

  connect() {
    this.status = 'connecting';
    if (FlakySubscriber.failuresRemaining-- > 0) {
      const error = new Error('simulated cold Redis timeout');
      this.status = 'end';
      queueMicrotask(() => this.emit('end'));
      return Promise.reject(error);
    }
    this.status = 'ready';
    queueMicrotask(() => this.emit('ready'));
    return Promise.resolve();
  }

  subscribe() { return Promise.resolve(1); }
  unsubscribe() { return Promise.resolve(0); }
  disconnect() { this.status = 'end'; this.emit('end'); }
}

class OfflineSubscriber extends EventEmitter {
  constructor() { super(); this.status = 'wait'; }
  connect() {
    this.status = 'end';
    queueMicrotask(() => this.emit('end'));
    return Promise.reject(Object.assign(new Error('subscriber offline'), {
      code: 'subscriber_offline',
    }));
  }
  subscribe() { return Promise.reject(new Error('subscriber offline')); }
  unsubscribe() { return Promise.resolve(0); }
  disconnect() { this.status = 'end'; }
}

class FakeRestRedis {
  ping() { return Promise.resolve('PONG'); }
  set() { return Promise.resolve('OK'); }
}

FlakySubscriber.failuresRemaining = 1;
const retryStore = new DistributedSignalingRoomStore({
  redisUrl: 'rediss://test.invalid',
  commandClient: new FakeRestRedis(),
  SubscriberImpl: FlakySubscriber,
});
retryStore.setDeliveryHandler(() => {});
assert.equal(retryStore.subscriber.status, 'wait',
  'registering delivery must not open Redis during an unrelated HTTP cold start');
const recoveredRoom = await retryStore.create({}, {
  player: { id: 'cold-host', name: 'Cold Host' },
  sessionId: 'cold-host-session',
  maxPlayers: 4,
});
assert.equal(recoveredRoom.roomCode.length, 6,
  'room creation must succeed through REST while the optional subscriber is cold');
assert.equal(retryStore.subscriber.status, 'end',
  'room creation does not wait for a failed pub/sub connection');
assert.deepEqual(await retryStore.health(), {
  ok: true, command: 'ready', subscriber: 'ready',
}, 'the same warm store retries and restores its pub/sub accelerator');
await retryStore.close();

const pollingFallbackStore = new DistributedSignalingRoomStore({
  redisUrl: 'rediss://test.invalid',
  commandClient: new FakeRestRedis(),
  SubscriberImpl: OfflineSubscriber,
});
const fallbackRoom = await pollingFallbackStore.create({}, {
  player: { id: 'fallback-host', name: 'Fallback Host' },
  maxPlayers: 4,
});
assert.equal(fallbackRoom.sessionId, 'legacy_fallback-host',
  'cached pre-session clients retain compatibility across the server deploy');
const fallbackHealth = await pollingFallbackStore.health(25);
assert.equal(fallbackHealth.ok, true,
  'durable REST commands keep signaling healthy while pub/sub is offline');
assert.equal(fallbackHealth.subscriber, 'polling_fallback');
assert.equal(fallbackHealth.degraded, true);
await pollingFallbackStore.close();

let commandHealthNow = 0;
const failedCommandStore = new DistributedSignalingRoomStore({
  redisUrl: 'rediss://test.invalid',
  commandClient: {
    set() { return Promise.reject(Object.assign(new Error('REST command timeout'), {
      code: 'command_timeout',
    })); },
  },
  SubscriberImpl: OfflineSubscriber,
  now: () => commandHealthNow,
});
const failedCommandHealth = await failedCommandStore.health(25);
assert.equal(failedCommandHealth.ok, false);
assert.equal(failedCommandHealth.code, 'command_timeout',
  'an unavailable REST command is not masked by optional subscriber failure');
failedCommandStore.command.set = () => Promise.resolve('OK');
commandHealthNow = 5_000;
const recoveredCommandHealth = await failedCommandStore.health(25);
assert.equal(recoveredCommandHealth.ok, true,
  'a cold REST failure can recover on the same store without latching a failed health');
assert.equal(recoveredCommandHealth.subscriber, 'polling_fallback');
await failedCommandStore.close();

let quotaProbeCount = 0;
let quotaNow = 0;
const quotaStore = new DistributedSignalingRoomStore({
  redisUrl: 'rediss://test.invalid',
  now: () => quotaNow,
  commandClient: {
    ping() { return Promise.resolve('PONG'); },
    set(_key, _value, options) {
      quotaProbeCount++;
      assert.equal(options.px, 10_000, 'write-readiness key expires without cleanup traffic');
      return Promise.reject(new Error('ERR max requests limit exceeded. Limit: 500000, Usage: 500002'));
    },
  },
  SubscriberImpl: FlakySubscriber,
});
const quotaHealth = await Promise.all(Array.from({ length: 50 }, () => quotaStore.health()));
assert.ok(quotaHealth.every((health) => !health.ok && health.code === 'redis_request_limit_exceeded'),
  'PING success cannot conceal an exhausted real command allowance');
assert.equal(quotaProbeCount, 1, 'fifty concurrent health checks share one bounded write probe');
quotaNow = 5_000;
await quotaStore.health();
assert.equal(quotaProbeCount, 2, 'health can recover after the short probe cache expires');
quotaStore.command.set = () => Promise.reject(new Error(
  'ERR max requests limit exceeded. Limit: 500000, Usage: 500002',
));
await assert.rejects(quotaStore.create({}, { player: { id: 'quota-host', name: 'Quota Host' } }),
  (error) => error.code === 'signaling_capacity_exhausted' &&
    error.message.includes('capacity is exhausted') && !error.message.includes('500002'),
  'real room writes expose a safe capacity failure rather than retryable generic unavailability');
await quotaStore.close();

let refreshNow = 0;
let refreshes = 0;
let drains = 0;
const refreshStore = new DistributedSignalingRoomStore({
  redisUrl: 'rediss://test.invalid',
  now: () => refreshNow,
  commandClient: {
    set() { return Promise.resolve('OK'); },
    pexpire() { refreshes++; return Promise.resolve(1); },
    eval(script) {
      drains++;
      assert.doesNotMatch(script, /LLEN|DEL/,
        'LPOP already removes empty list keys; no redundant read/delete inside drain');
      return Promise.resolve([]);
    },
  },
  SubscriberImpl: FlakySubscriber,
});
const refreshConnection = {};
await refreshStore.create(refreshConnection, { player: { id: 'refresh-host', name: 'Refresh Host' } });
for (let index = 1; index <= 120; index++) {
  refreshNow = index * 500;
  await refreshStore.poll(refreshConnection);
}
assert.equal(drains, 120, 'durable fallback polling keeps its original delivery cadence');
assert.equal(refreshes, 1, '120 lobby polls refresh the 24-hour lease once, not120 times');
for (let index = 1; index <= 30; index++) {
  refreshNow = 60_000 + index * 2_000;
  await refreshStore.poll(refreshConnection);
}
assert.equal(drains - 120, 30, 'battle handoff retains its existing two-second fallback cadence');
assert.equal(refreshes - 1, 1, '30 battle polls renew the lease once, not30 times');
let finishRenewal;
refreshStore.command.pexpire = () => {
  refreshes++;
  return new Promise((resolve) => { finishRenewal = resolve; });
};
refreshNow = 180_000;
const simultaneousPolls = Promise.all(Array.from({ length: 50 }, () => refreshStore.poll(refreshConnection)));
// Membership is fenced by the mailbox operation before a lease can renew.
while (!finishRenewal) await new Promise((resolve) => setImmediate(resolve));
assert.equal(refreshes, 3, 'concurrent poll/relay arrivals share the one in-flight lease renewal');
finishRenewal(1);
await simultaneousPolls;
assert.equal(drains, 200, 'renewal coalescing does not suppress any requested mailbox drain');
refreshStore.detach(refreshConnection);
await refreshStore.close();

const healthStore = {
  setDeliveryHandler() {},
  sweepExpired() { return []; },
  async health() {
    return { ok: false, command: 'unavailable', subscriber: 'unavailable', code: 'probe_down' };
  },
};
const unhealthy = createSignalingServer({ host: '127.0.0.1', port: 0, store: healthStore });
const unhealthyAddress = await unhealthy.listen();
const unhealthyResponse = await fetch(`http://127.0.0.1:${unhealthyAddress.port}/healthz`);
assert.equal(unhealthyResponse.status, 503, 'health returns unavailable when Redis is unavailable');
assert.equal((await unhealthyResponse.json()).ok, false);
await unhealthy.close();

function connect(url, origin = null) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, origin ? { origin } : undefined);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function inbox(socket) {
  const queued = [];
  const waiters = [];
  socket.on('message', (data) => {
    const message = JSON.parse(data.toString());
    const index = waiters.findIndex((waiter) => waiter.match(message));
    if (index >= 0) {
      const waiter = waiters.splice(index, 1)[0];
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else queued.push(message);
  });
  return {
    next(match, timeoutMs = 1000) {
      const index = queued.findIndex(match);
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { match, resolve, reject, timer: null };
        waiter.timer = setTimeout(() => {
          const at = waiters.indexOf(waiter);
          if (at >= 0) waiters.splice(at, 1);
          reject(new Error('signaling test message timeout'));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
  };
}

function send(socket, message) {
  socket.send(JSON.stringify(message));
}

const productionOrigin = 'https://cot.kevinliu.studio';
const signaling = createSignalingServer({
  host: '127.0.0.1',
  port: 0,
  allowedOrigins: [productionOrigin],
  webSocketPaths: ['/api/signal'],
  healthPaths: ['/api/signal'],
  iceConfigHandler: createIceConfigHandler({
    env: {
      COT_ALLOWED_ORIGINS: productionOrigin,
      COT_TURN_URLS: 'turn:turn.self-host.test:3478',
      COT_TURN_SHARED_SECRET: 'self-host-secret',
    },
    now: () => 100_000_000,
  }),
});
const address = await signaling.listen();
const url = `ws://127.0.0.1:${address.port}/api/signal`;
const iceResponse = await fetch(`http://127.0.0.1:${address.port}/api/ice`, {
  headers: { origin: productionOrigin },
});
assert.equal(iceResponse.status, 200, 'standalone signaling also serves local TURN credentials');
const iceBody = await iceResponse.json();
assert.equal(iceBody.iceServers[0].urls, 'turn:turn.self-host.test:3478');
assert.match(iceBody.iceServers[0].username, /^\d+:cot$/);
await assert.rejects(connect(url, 'https://attacker.example'), /Unexpected server response: 403/);
const host = await connect(url, productionOrigin);
const guest = await connect(url, productionOrigin);
const hostInbox = inbox(host);
const guestInbox = inbox(guest);

send(host, {
  type: 'room_create',
  requestId: 'create-1',
  payload: {
    player: { id: 'host-player', name: 'Host' },
    sessionId: 'host-session-one',
    maxPlayers: 4,
  },
});
const created = await hostInbox.next((message) => message.requestId === 'create-1');
assert.equal(created.type, 'room_created');
assert.equal(created.payload.roomCode.length, 6);
assert.equal(created.payload.hostId, created.payload.peerId);
assert.equal(created.payload.hostName, 'Host');
assert.equal(created.payload.peerId, 'host-player',
  'signaling preserves stable browser identity for room recovery');
assert.equal(created.payload.sessionId, 'host-session-one');

send(guest, {
  type: 'room_join',
  requestId: 'join-1',
  payload: {
    roomCode: created.payload.roomCode,
    player: { id: 'guest-player', name: 'Guest' },
    sessionId: 'guest-session-one',
  },
});
const joined = await guestInbox.next((message) => message.requestId === 'join-1');
const peerJoined = await hostInbox.next((message) => message.type === 'peer_joined');
assert.equal(joined.type, 'room_joined');
assert.equal(joined.payload.peerId, 'guest-player');
assert.equal(joined.payload.hostId, created.payload.hostId);
assert.equal(joined.payload.hostName, 'Host',
  'join responses identify the room host for invitation presentation');
assert.equal(joined.payload.peers.length, 1);
assert.equal(peerJoined.payload.peerId, joined.payload.peerId);
assert.equal(peerJoined.payload.sessionId, 'guest-session-one');
assert.equal(joined.payload.peers[0].sessionId, 'host-session-one');
assert.equal(JSON.stringify(joined.payload.peers).includes('resumeToken'), false);
assert.equal(JSON.stringify(peerJoined.payload).includes('resumeToken'), false);
const imposter = await connect(url, productionOrigin);
const imposterInbox = inbox(imposter);
send(imposter, { type: 'room_join', requestId: 'forged-host', payload: {
  roomCode: created.payload.roomCode, player: { id: 'host-player', name: 'Imposter' },
  sessionId: 'forged-host-session', nextResumeToken: 'f'.repeat(64),
} });
const deniedHost = await imposterInbox.next((message) => message.requestId === 'forged-host');
assert.equal(deniedHost.type, 'error');
assert.equal(deniedHost.payload.code, 'resume_denied');
send(imposter, { type: 'room_leave', payload: { roomCode: created.payload.roomCode } });
send(imposter, { type: 'room_poll', requestId: 'forged-poll', payload: { roomCode: created.payload.roomCode } });
assert.equal((await imposterInbox.next((message) => message.requestId === 'forged-poll')).payload.code,
  'resume_denied', 'a nonmember cannot keep an authenticated room poll alive');
imposter.close();

send(guest, {
  type: 'room_signal',
  payload: {
    roomCode: created.payload.roomCode,
    toPeerId: created.payload.peerId,
    toSessionId: 'host-session-one',
    signal: { kind: 'ice', candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host' } },
  },
});
const relayed = await hostInbox.next((message) => message.type === 'room_signal');
assert.equal(relayed.payload.fromPeerId, joined.payload.peerId);
assert.equal(relayed.payload.fromSessionId, 'guest-session-one');
assert.equal(relayed.payload.toSessionId, 'host-session-one');
assert.equal(relayed.payload.signal.kind, 'ice');
send(guest, {
  type: 'room_signal',
  requestId: 'stale-signal-1',
  payload: {
    roomCode: created.payload.roomCode,
    toPeerId: created.payload.peerId,
    toSessionId: 'obsolete-host-session',
    signal: { kind: 'restart' },
  },
});
const staleRelay = await guestInbox.next((message) => message.requestId === 'stale-signal-1');
assert.equal(staleRelay.type, 'error');
assert.equal(staleRelay.payload.code, 'stale_target_session',
  'a sender cannot negotiate against a replacement page session by peer id alone');

const health = await fetch(`http://127.0.0.1:${address.port}/api/signal`).then((response) => response.json());
assert.deepEqual(health, { ok: true, rooms: 1 });

const hostDisconnected = new Promise((resolve) => host.once('close', resolve));
host.close();
await hostDisconnected;
const resumedHost = await connect(url, productionOrigin);
const resumedHostInbox = inbox(resumedHost);
send(resumedHost, {
  type: 'room_join',
  requestId: 'resume-host-1',
  payload: {
    roomCode: created.payload.roomCode,
    player: { id: 'host-player', name: 'Host' },
    sessionId: 'host-session-one',
    resumeToken: created.payload.resumeToken,
  },
});
const resumed = await resumedHostInbox.next((message) => message.requestId === 'resume-host-1');
const hostResumed = await guestInbox.next((message) => message.type === 'peer_joined');
assert.equal(resumed.type, 'room_joined');
assert.equal(resumed.payload.hostId, 'host-player');
assert.equal(hostResumed.payload.peerId, 'host-player',
  'an unclean signaling close keeps the room resumable by stable identity');
assert.equal(hostResumed.payload.sessionId, 'host-session-one',
  'transport reconnect preserves the runtime epoch used to retain healthy RTC');
send(resumedHost, {
  type: 'room_leave',
  payload: { roomCode: created.payload.roomCode },
});
const closed = await guestInbox.next((message) => message.type === 'room_closed');
assert.equal(closed.payload.reason, 'host_left');
resumedHost.close();
guest.close();
await new Promise((resolve) => guest.once('close', resolve));
await signaling.close();

function clientEvent(client, match, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    let off = () => {};
    const timer = setTimeout(() => {
      off();
      reject(new Error('signaling client event timeout'));
    }, timeoutMs);
    off = client.onEvent((message) => {
      if (!match(message)) return;
      clearTimeout(timer);
      off();
      resolve(message);
    });
  });
}

const resumeServer = createSignalingServer({ host: '127.0.0.1', port: 0 });
const resumeAddress = await resumeServer.listen();
const resumeUrl = `ws://127.0.0.1:${resumeAddress.port}/signal`;
const tabValues = new Map();
const resumeStorage = { getItem: (key) => tabValues.get(key) ?? null,
  setItem: (key, value) => tabValues.set(key, value) };
const resumeHost = new RoomSignalingClient({
  url: resumeUrl,
  WebSocketImpl: WebSocket,
  eventPollIntervalMs: 20,
  reconnectDelaysMs: [10, 20, 40],
  resumeStorage,
});
const resumeGuest = new RoomSignalingClient({
  url: resumeUrl,
  WebSocketImpl: WebSocket,
  eventPollIntervalMs: 20,
  reconnectDelaysMs: [10, 20, 40],
});
const resumeRoom = await resumeHost.createRoom({
  player: { id: 'resume-host', name: 'Resume Host' },
  maxPlayers: 4,
});
assert.equal('resumeToken' in resumeRoom, false, 'own API receipt keeps the capability inside its private owner');
const resumeGuestInfo = await resumeGuest.joinRoom({
  roomCode: resumeRoom.roomCode,
  player: { id: 'resume-guest', name: 'Resume Guest' },
});
const reconnecting = clientEvent(resumeHost,
  (message) => message.type === 'signaling_state' && message.payload?.state === 'reconnecting');
const signalingResumed = clientEvent(resumeHost, (message) => message.type === 'signaling_resumed');
const hostRejoined = clientEvent(resumeGuest,
  (message) => message.type === 'peer_joined' && message.payload?.peerId === 'resume-host');
const queuedSignal = clientEvent(resumeGuest,
  (message) => message.type === 'room_signal' && message.payload?.fromPeerId === 'resume-host');
resumeHost.socket.terminate();
await reconnecting;
assert.equal(resumeHost.sendSignal(resumeGuestInfo.peerId, {
  kind: 'ice',
  candidate: { candidate: 'candidate:2 1 udp 1 127.0.0.1 9 typ host' },
}, resumeGuest.sessionId), false, 'RTC rendezvous is queued while signaling reconnects');
const resumedEvent = await signalingResumed;
assert.equal(resumedEvent.payload.peerId, 'resume-host');
assert.equal('resumeToken' in resumedEvent.payload, false, 'resume events never expose the private credential');
await hostRejoined;
const deliveredQueuedSignal = await queuedSignal;
assert.equal(deliveredQueuedSignal.payload.signal.kind, 'ice',
  'queued RTC rendezvous flushes after the durable membership resumes');
assert.equal(deliveredQueuedSignal.payload.fromSessionId, resumeHost.sessionId);
assert.equal(deliveredQueuedSignal.payload.toSessionId, resumeGuest.sessionId);
assert.equal(resumeHost.state, 'open');
const previousSessionId = resumeHost.sessionId;
const rebuiltMembership = clientEvent(resumeGuest,
  (message) => message.type === 'peer_joined' && message.payload?.peerId === 'resume-host' &&
    message.payload?.sessionId !== previousSessionId);
assert.equal(await resumeHost.restartRoomSession('test_rtc_rebuild'), true,
  'terminal RTC recovery re-announces the same room membership');
const rebuiltPeer = await rebuiltMembership;
assert.notEqual(resumeHost.sessionId, previousSessionId,
  'terminal RTC recovery rotates the runtime epoch');
assert.equal(rebuiltPeer.payload.sessionId, resumeHost.sessionId,
  'other peers receive the replacement epoch and can rebuild their RTC connection');
const reloadedHost = new RoomSignalingClient({ url: resumeUrl, WebSocketImpl: WebSocket,
  resumeStorage, eventPollIntervalMs: 20 });
const oldHostRetired = clientEvent(resumeHost, (message) => message.type === 'room_closed'
  && message.payload?.reason === 'resume_denied');
await reloadedHost.joinRoom({ roomCode: resumeRoom.roomCode,
  player: { id: 'resume-host', name: 'Reloaded Host' } });
assert.notEqual(reloadedHost.sessionId, resumeHost.sessionId);
await oldHostRetired;
await assert.rejects(resumeHost.restartRoomSession('stale_owner_resume'),
  (error) => error.code === 'room_resume_unavailable',
  'immediately retired ownership cannot restart or overwrite the successor capability');
assert.equal(resumeHost.roomCode, null, 'superseded credentials fail once without reconnecting forever');
resumeHost.close('resume_test_complete');
const secondReload = new RoomSignalingClient({ url: resumeUrl, WebSocketImpl: WebSocket,
  resumeStorage, eventPollIntervalMs: 20 });
await secondReload.joinRoom({ roomCode: resumeRoom.roomCode,
  player: { id: 'resume-host', name: 'Reloaded Again' } });
assert.equal(secondReload.hostId, 'resume-host',
  'reload preserves authenticated host membership even after retired client cleanup');
reloadedHost.close('retired_reload');
secondReload.close('resume_test_complete');
resumeGuest.close('resume_test_complete');

// Two tabs can recover the same persisted pending capability after a lost
// reply. Both joins are idempotently authorized, but only the final socket
// generation owns the seat; its predecessor must not automatically fight it.
const raceValues = new Map();
const raceStorage = { getItem: (key) => raceValues.get(key) ?? null,
  setItem: (key, value) => raceValues.set(key, value) };
const original = new RoomSignalingClient({ url: resumeUrl, WebSocketImpl: WebSocket,
  resumeStorage: raceStorage, eventPollIntervalMs: 20 });
const raceRoom = await original.createRoom({ player: { id: 'race-host', name: 'Race Host' } });
new SignalingResumeCredentials(raceStorage).prepare(JSON.stringify([resumeUrl, raceRoom.roomCode, 'race-host']));
const tabEvents = [[], []];
const tabs = tabEvents.map((events) => {
  const client = new RoomSignalingClient({ url: resumeUrl, WebSocketImpl: WebSocket,
    resumeStorage: raceStorage, eventPollIntervalMs: 20, reconnectDelaysMs: [10] });
  client.onEvent((event) => events.push(event));
  return client;
});
await Promise.all(tabs.map((client) => client.joinRoom({ roomCode: raceRoom.roomCode,
  player: { id: 'race-host', name: 'Race Host' } })));
await new Promise((resolve) => setTimeout(resolve, 100));
const finalSession = resumeServer.store.rooms.get(raceRoom.roomCode).peers.get('race-host').sessionId;
const winner = tabs.findIndex((client) => client.sessionId === finalSession);
const loser = 1 - winner;
assert.ok(winner >= 0);
assert.equal(tabs[loser].roomCode, null);
assert.equal(tabEvents[loser].some((event) => event.type === 'room_closed'
  && event.payload.reason === 'resume_denied'), true);
assert.equal(tabEvents[loser].some((event) => event.type === 'signaling_resumed'), false);
await new Promise((resolve) => setTimeout(resolve, 100));
assert.equal(resumeServer.store.rooms.get(raceRoom.roomCode).peers.get('race-host').sessionId,
  finalSession, 'retired tab never takes the authenticated successor seat back');
const reopening = new RoomSignalingClient({ url: resumeUrl, WebSocketImpl: WebSocket,
  resumeStorage: raceStorage });
await reopening.joinRoom({ roomCode: raceRoom.roomCode, player: { id: 'race-host', name: 'Reopened' } });
assert.equal(reopening.hostId, 'race-host', 'terminal predecessor does not erase shared recovery credential');
original.close('test_done');
for (const client of tabs) client.close('test_done');
reopening.close('test_done');
await resumeServer.close();

// Pub/sub delivery is intentionally modeled as fully unavailable here. A
// room_poll must recover the durable notification so an RTC offer is never
// contingent on a transient subscriber wake-up.
class PollOnlyRoomStore extends SignalingRoomStore {
  constructor() {
    super();
    this.deliveryHandler = null;
    this.mailboxes = new Map();
    this.pollCount = 0;
  }

  setDeliveryHandler(handler) { this.deliveryHandler = handler; }

  deliver({ connection, message, fromPoll = false }) {
    if (fromPoll) return this.deliveryHandler(connection, message);
    const queued = this.mailboxes.get(connection) || [];
    queued.push(message);
    this.mailboxes.set(connection, queued);
    return true;
  }

  poll(connection) {
    this.pollCount++;
    const queued = this.mailboxes.get(connection) || [];
    this.mailboxes.delete(connection);
    return queued.map((message) => ({ connection, message, fromPoll: true }));
  }
}

const pollStore = new PollOnlyRoomStore();
const pollServer = createSignalingServer({ host: '127.0.0.1', port: 0, store: pollStore });
const pollAddress = await pollServer.listen();
const pollUrl = `ws://127.0.0.1:${pollAddress.port}/signal`;
const pollHost = new RoomSignalingClient({
  url: pollUrl,
  WebSocketImpl: WebSocket,
  eventPollIntervalMs: 20,
});
const pollGuest = new RoomSignalingClient({
  url: pollUrl,
  WebSocketImpl: WebSocket,
  eventPollIntervalMs: 20,
});
const pollRoom = await pollHost.createRoom({
  player: { id: 'poll-host', name: 'Poll Host' },
  maxPlayers: 4,
});
const recoveredJoin = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('durable signaling poll timed out')), 1_000);
  pollHost.onEvent((message) => {
    if (message.type !== 'peer_joined') return;
    clearTimeout(timer);
    resolve(message);
  });
});
await pollGuest.joinRoom({
  roomCode: pollRoom.roomCode,
  player: { id: 'poll-guest', name: 'Poll Guest' },
});
assert.equal((await recoveredJoin).payload.peerId, 'poll-guest');
assert.ok(pollStore.pollCount > 0, 'room clients poll when pub/sub delivery is missed');
pollHost.close('poll_test_complete');
pollGuest.close('poll_test_complete');
await pollServer.close();

console.log('signaling.selftest: room codes, join, relay, health, transport resume, and explicit host closure passed');
