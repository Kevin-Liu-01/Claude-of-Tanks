import assert from 'node:assert/strict';
import { createContext, runInContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  roomWebRtcEndpoints, installBrowserPeer, receiveBrowserSignal, createBrowserOffer,
  browserPeerReceipt, validatePeerPairReceipts, cleanupPeerProbe,
} from './production-room-webrtc-check.mjs';

const valid = { baseUrl: 'https://game.example.test', backendUrl: 'https://rooms.example.test' };
assert.deepEqual(roomWebRtcEndpoints(valid), {
  origin: valid.baseUrl, signaling: 'wss://rooms.example.test/rooms', timeoutMs: 45_000,
  page: 'https://game.example.test/robots.txt?cot-room-webrtc-probe=1',
  ice: 'https://game.example.test/api/ice',
});
assert.equal(roomWebRtcEndpoints({ baseUrl: 'http://127.0.0.1:8080',
  backendUrl: 'http://127.0.0.1:8787' }).signaling, 'ws://127.0.0.1:8787/rooms');
for (const args of [{}, { baseUrl: valid.baseUrl }, { backendUrl: valid.backendUrl },
  { ...valid, backendUrl: 'http://rooms.example.test' },
  { ...valid, baseUrl: 'https://game.example.test/path' },
  { ...valid, backendUrl: 'https://rooms.example.test/rooms' },
  { ...valid, backendUrl: 'https://secret:password@rooms.example.test' },
  { ...valid, backendUrl: 'https://rooms.example.test?secret=token' },
  { ...valid, baseUrl: 'https://game.example.test#secret' },
  { ...valid, baseUrl: 'file:///robots.txt' }]) {
  assert.throws(() => roomWebRtcEndpoints(args), TypeError);
}
for (const timeoutMs of [0, 999, 120_001, 1000.5, NaN, Infinity, '45000']) {
  assert.throws(() => roomWebRtcEndpoints({ ...valid, timeoutMs }), TypeError);
}

const pair = [];
const relayed = [];
const fetches = [];
function fakePage(role) {
  const page = { role, pendingRelay: Promise.resolve() };
  class Peer {
    constructor(config) {
      this.config = config;
      this.connectionState = 'new';
      this.acceptedIce = [];
      page.peer = this;
    }
    getConfiguration() { return this.config; }
    createDataChannel(name, options) {
      assert.equal(name, 'cot-production-room-probe');
      assert.equal(options.ordered, true);
      this.channel = { readyState: 'connecting', send(value) {
        pair[1].peer.channel.onmessage({ data: value });
      } };
      return this.channel;
    }
    createOffer() { return { type: 'offer', sdp: 'PRIVATE_OFFER_SDP' }; }
    createAnswer() { return { type: 'answer', sdp: 'PRIVATE_ANSWER_SDP' }; }
    setLocalDescription(description) {
      this.localDescription = { ...description, toJSON: () => ({ ...description }) };
      // Trickle before the description receipt: the receiver must queue ICE safely.
      this.onicecandidate({ candidate: { toJSON: () => ({ candidate: 'PRIVATE_ICE_ADDRESS' }) } });
      return Promise.resolve();
    }
    async setRemoteDescription(description) {
      this.remoteDescription = description;
      if (description.type === 'offer') {
        this.channel = { readyState: 'open', send(value) {
          pair[0].peer.channel.onmessage({ data: value });
        } };
        this.ondatachannel({ channel: this.channel });
      } else this.channel.readyState = 'open';
      this.connectionState = 'connected';
    }
    async addIceCandidate(candidate) {
      assert.ok(this.remoteDescription, 'early ICE must not be applied before its description');
      this.acceptedIce.push(candidate);
    }
    async getStats() {
      const entries = [
        ['pair', { id: 'pair', type: 'candidate-pair', state: 'succeeded', nominated: true,
          localCandidateId: 'local', remoteCandidateId: 'remote' }],
        ['local', { candidateType: 'relay', protocol: 'udp', address: 'PRIVATE_LOCAL_ADDRESS' }],
        ['remote', { candidateType: 'relay', protocol: 'udp', address: 'PRIVATE_REMOTE_ADDRESS' }],
      ];
      if (role === 'host') entries.push(['transport', { type: 'transport', selectedCandidatePairId: 'pair' }]);
      return new Map(entries);
    }
    close() { this.closed = true; }
  }
  page.context = createContext({ RTCPeerConnection: Peer, AbortSignal,
    fetch: async (url, options) => {
      fetches.push({ role, url, options });
      return { ok: true, json: async () => ({ iceServers: [{ urls: 'turn:PRIVATE_TURN_ADDRESS',
        username: 'PRIVATE_TURN_USERNAME', credential: 'PRIVATE_TURN_PASSWORD' }] }) };
    }, __cotRoomRelay: async (signal) => {
      relayed.push({ role, signal });
      page.pendingRelay = page.pendingRelay.then(() => pair[role === 'host' ? 1 : 0]
        .evaluate(receiveBrowserSignal, signal));
      await page.pendingRelay;
    } });
  page.evaluate = async (fn, value) => {
    page.context.__argument = value;
    return runInContext(`(${fn.toString()})(__argument)`, page.context);
  };
  return page;
}

pair.push(fakePage('host'), fakePage('guest'));
for (const page of pair) await page.evaluate(installBrowserPeer, {
  endpoint: 'https://game.example.test/api/ice', role: page.role, timeoutMs: 1000,
});
assert.equal(fetches.length, 2, 'each fresh context fetches its own short-lived TURN credentials');
assert.ok(fetches.every(({ options }) => options.credentials === 'include' && options.cache === 'no-store'));
assert.ok(pair.every(({ peer }) => peer.config.iceTransportPolicy === 'relay'),
  'both peers must be relay-only, not only the offerer');
const offer = await pair[0].evaluate(createBrowserOffer);
await pair[0].pendingRelay;
assert.equal(pair[1].peer.acceptedIce.length, 0, 'early trickle is queued until the remote offer');
const answer = await pair[1].evaluate(receiveBrowserSignal, offer);
await pair[1].pendingRelay;
await pair[0].evaluate(receiveBrowserSignal, answer);
assert.ok(pair.every(({ peer }) => peer.acceptedIce.length === 1));
pair[0].peer.channel.send('cot-probe-host-to-guest');
pair[1].peer.channel.send('cot-probe-guest-to-host');
const receipts = await Promise.all(pair.map((page) => page.evaluate(browserPeerReceipt)));
const safe = validatePeerPairReceipts(...receipts);
assert.deepEqual(safe.map(({ role, localCandidateType, remoteCandidateType }) =>
  ({ role, localCandidateType, remoteCandidateType })), [
  { role: 'host', localCandidateType: 'relay', remoteCandidateType: 'relay' },
  { role: 'guest', localCandidateType: 'relay', remoteCandidateType: 'relay' },
]);
assert.doesNotMatch(JSON.stringify({ receipts, safe }), /PRIVATE/,
  'TURN credentials, SDP, and candidate addresses never enter diagnostic receipts');
assert.equal(relayed.length, 2, 'both directions emitted trickled ICE');
for (const patch of [{ policy: 'all' }, { localCandidateType: 'host' },
  { remoteCandidateType: 'srflx' }, { connected: false }, { channelOpen: false },
  { failed: true }, { received: [] }, { relayedIce: 0 }, { answered: false }]) {
  assert.throws(() => validatePeerPairReceipts({ ...receipts[0], ...patch }, receipts[1]),
    (error) => error.code === 'room_webrtc_probe_failed');
}
assert.throws(() => validatePeerPairReceipts(receipts[0], { ...receipts[1], offered: false }));
assert.doesNotMatch(JSON.stringify(validatePeerPairReceipts({ ...receipts[0],
  protocol: 'PRIVATE_TOKEN', extra: 'PRIVATE_PASSWORD' }, receipts[1])), /PRIVATE/);

let clientCloses = 0;
let unsubscribeCalls = 0;
let browserCloses = 0;
const socket = new EventEmitter();
socket.readyState = 1;
socket.terminate = () => assert.fail('healthy socket should close naturally');
const cleanup = await cleanupPeerProbe({ pages: pair, sockets: [socket], contexts: [],
  unsubscribe: [() => { unsubscribeCalls++; }], clients: [
    { close() { clientCloses++; throw new Error('PRIVATE_EXCEPTION'); } },
    { close() { clientCloses++; setImmediate(() => { socket.readyState = 3; socket.emit('close'); }); } },
  ], browser: { async close() { browserCloses++; } } });
assert.deepEqual(cleanup, { signalingSocketsClosed: true, browserClosed: true });
assert.equal(clientCloses, 2, 'one failed client close cannot skip the other room owner');
assert.equal(unsubscribeCalls, 1);
assert.equal(browserCloses, 1);
assert.ok(pair.every(({ peer }) => peer.closed));
assert.equal(socket.listenerCount('close'), 0);

for (const args of [[], ['--url=https://PRIVATE:SECRET@game.example.test',
  '--backend-url=https://rooms.example.test']]) {
  const child = spawnSync(process.execPath, ['tools/production-room-webrtc-check.mjs', ...args],
    { encoding: 'utf8', timeout: 5000 });
  assert.equal(child.status, 1, 'missing/unsafe explicit endpoints fail before browser or network launch');
  const result = JSON.parse(child.stderr);
  assert.equal(result.stage, 'configuration');
  assert.doesNotMatch(child.stderr, /PRIVATE|SECRET/);
}
console.log('production room WebRTC probe selftest passed (local deterministic orchestration; not a production TURN receipt)');
