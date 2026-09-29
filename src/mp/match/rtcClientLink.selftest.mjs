// The host side of the peer-to-peer link on the scripted WebRTC world: real WebRtcTransport peers offer through the
// relay double, the acceptor answers, trickles candidates (the peer's candidates queue until the offer is applied),
// and hands each opened `match` channel to the owner as a ClientLink (peer ordinals, never identities); frames flow
// both ways with the counters; `link.close(reason)` sends the wire CLOSE first and the peer's transport reads it; a
// peer's re-offer replaces its connection (the old link closes as REPLACED); a stale-generation offer and an offer
// past maxPeers are refused; a channel that never opens is dropped after the connect timeout; a lost peer connection
// retires the link; `close()` ends every link; the uplink counter survives a link's closure.
import assert from 'node:assert/strict';
import { CLOSE_REASON, MESSAGE_TYPE, decodeMessage, encodeMessage } from '../wire/index.ts';
import { TRANSPORT_CLOSE, WebRtcTransport } from '../transport/index.ts';
import { FakeSignalRelay, RtcWorld } from '../transport/rtcDouble.test-support.ts';
import { createRtcClientLink, createRtcHostAcceptor } from './rtcClientLink.ts';

function createVirtualTime() {
  let nowMs = 1000;
  let serial = 0;
  const timers = new Map();
  return {
    clock: () => nowMs,
    setTimer(callback, delayMs) { const handle = ++serial; timers.set(handle, { dueMs: nowMs + delayMs, callback, handle }); return handle; },
    clearTimer(handle) { timers.delete(handle); },
    advance(ms) {
      const target = nowMs + ms;
      for (;;) {
        const due = [...timers.values()].filter((timer) => timer.dueMs <= target).sort((a, b) => a.dueMs - b.dueMs || a.handle - b.handle)[0];
        if (!due) break;
        timers.delete(due.handle);
        nowMs = Math.max(nowMs, due.dueMs);
        due.callback();
      }
      nowMs = target;
    },
    get pending() { return timers.size; },
  };
}
const settle = async (world, relay, rounds = 8) => {
  for (let index = 0; index < rounds; index++) { await Promise.resolve(); await Promise.resolve(); relay.flush(); world.flush(); }
};

const time = createVirtualTime();
const world = new RtcWorld();
const relay = new FakeSignalRelay('host', 1);
const links = [];
const states = [];
const acceptor = createRtcHostAcceptor({
  signaler: relay.signalerFor('host'), hostId: 'host', generation: () => relay.generation,
  createPeerConnection: world.createPeerConnection, maxPeers: 2,
  onLink: (link, peer) => links.push({ link, playerId: peer.playerId, label: peer.label }),
  onPeerState: (peer) => states.push(`${peer.playerId}:${peer.state}`),
  clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer,
});
const peerTransport = (playerId) => {
  const changes = [];
  const frames = [];
  const transport = new WebRtcTransport({
    signaler: relay.signalerFor(playerId), createPeerConnection: world.createPeerConnection,
    clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer, random: () => 0.5,
  });
  transport.onState((change) => changes.push(change));
  transport.onFrame((frame) => frames.push(frame));
  return { transport, changes, frames };
};

// ---- one peer: offer → answer → link
const alice = peerTransport('alice');
alice.transport.open();
await settle(world, relay);
assert.equal(alice.transport.state, 'open');
assert.equal(links.length, 1, 'the acceptor handed one link to the owner');
assert.equal(links[0].playerId, 'alice');
assert.equal(links[0].label, 'peer1', 'labels are ordinals');
assert.equal(links[0].link.label, 'peer1');
assert.equal(acceptor.connected, 1);
assert.deepEqual(states, ['alice:connecting', 'alice:open']);
assert.equal(acceptor.stats().answers, 1);
assert.equal(acceptor.peers.get('alice').candidatePair.local, 'host');

// ---- frames both ways, counters
const received = [];
links[0].link.onMessage((bytes) => received.push([...bytes]));
alice.transport.send(new Uint8Array([1, 2, 3]));
await settle(world, relay);
assert.deepEqual(received, [[1, 2, 3]]);
links[0].link.send(new Uint8Array([4, 5]));
await settle(world, relay);
assert.deepEqual([...alice.frames[0]], [4, 5]);
assert.equal(links[0].link.bytesSent, 2);
assert.equal(links[0].link.bytesReceived, 3);
assert.equal(links[0].link.framesSent, 1);
assert.equal(acceptor.bytesSent, 2);
assert.equal(links[0].link.bufferedAmount, 0, 'bufferedAmount mirrors the channel (drained)');
world.connections.get(2).channels[0].congested = true;
links[0].link.send(new Uint8Array(1000));
assert.equal(links[0].link.bufferedAmount, 1000, 'bufferedAmount mirrors the channel (congested)');
world.connections.get(2).channels[0].congested = false;
world.connections.get(2).channels[0].drain();
assert.equal(links[0].link.bufferedAmount, 0);

// ---- trickle: the peer's candidate before and after the answer, the host's candidate to the peer
const peerPc = world.connections.get(1);
const hostPc = world.connections.get(2);
peerPc.emitCandidate({ candidate: 'candidate:alice-1', sdpMid: '0', sdpMLineIndex: 0 });
hostPc.emitCandidate({ candidate: 'candidate:host-1', sdpMid: '0', sdpMLineIndex: 0 });
await settle(world, relay);
assert.deepEqual(hostPc.addedCandidates.map((candidate) => candidate.candidate), ['candidate:alice-1']);
assert.deepEqual(peerPc.addedCandidates.map((candidate) => candidate.candidate), ['candidate:host-1']);
assert.equal(acceptor.stats().candidatesSent, 1);
assert.equal(acceptor.stats().candidatesReceived, 1);

// ---- a second peer; a third is refused (maxPeers 2)
const bob = peerTransport('bob');
bob.transport.open();
await settle(world, relay);
assert.equal(links.length, 2);
assert.equal(links[1].label, 'peer2');
assert.equal(acceptor.connected, 2);
const carol = peerTransport('carol');
carol.transport.open();
await settle(world, relay);
assert.equal(links.length, 2, 'the third peer is refused');
assert.equal(acceptor.stats().refusedOffers, 1);
assert.equal(carol.transport.state, 'connecting', 'the refused peer waits for its attempt timeout');
carol.transport.close();

// ---- the host closes a link with a wire reason: the peer decodes the CLOSE and its transport reads `server`
const decoded = [];
alice.transport.onFrame((bytes) => { const message = decodeMessage(bytes); if (message.ok) decoded.push(message.message); });
links[0].link.close(CLOSE_REASON.IDLE_TIMEOUT, 'idle');
assert.equal(links[0].link.closed, true);
assert.equal(links[0].link.closeReason, CLOSE_REASON.IDLE_TIMEOUT);
assert.equal(acceptor.connected, 1, 'the closed link left the roster');
assert.equal(acceptor.peers.has('alice'), false);
await settle(world, relay);
const close = decoded.find((message) => message.type === MESSAGE_TYPE.CLOSE);
assert.ok(close, 'the wire CLOSE reached the peer before the channel closed');
assert.equal(close.reason, CLOSE_REASON.IDLE_TIMEOUT);
assert.equal(close.detail, 'idle');
assert.equal(alice.transport.state, 'reconnecting', 'the channel closed under the peer (its owner ends a deliberate close itself)');
assert.equal(acceptor.bytesSent, 1002, 'the uplink counter keeps the closed link\'s bytes');

// ---- the peer re-offers (its reconnect): a fresh link; a re-offer while open replaces the connection as REPLACED
time.advance(250);
await settle(world, relay);
assert.equal(alice.transport.state, 'open');
assert.equal(links.length, 3);
assert.equal(links[2].playerId, 'alice');
assert.equal(links[2].label, 'peer3', 'a new ordinal (a refused peer takes none)');
let reconnectClose = 'unset';
links[2].link.onClose(() => { reconnectClose = links[2].link.closeReason; });
alice.transport.reconnect(TRANSPORT_CLOSE.STALLED, 'owner asked');
time.advance(250);
await settle(world, relay);
assert.equal(links.length, 4, 'the re-offer produced a fresh link');
assert.equal(reconnectClose, null, 'the previous link closed by its channel (the peer dropped it), not by a wire reason');
assert.equal(acceptor.connected, 2);
// a second tab: an offer from alice while her link is open replaces the connection, the old link closes as REPLACED
let replacedClose = 'unset';
links[3].link.onClose(() => { replacedClose = links[3].link.closeReason; });
const secondTab = world.createPeerConnection({ iceServers: [], relayOnly: false });
relay.inject('alice', { to: 'host', generation: relay.generation, kind: 'offer', sdp: `v=0 offer pc${secondTab.id}` });
await settle(world, relay);
assert.equal(replacedClose, CLOSE_REASON.REPLACED, 'the previous link closed as REPLACED');
assert.equal(acceptor.peers.get('alice').state, 'connecting', 'the second tab is being answered');
assert.equal(acceptor.connected, 1);
acceptor.drop('alice');
assert.equal(acceptor.peers.has('alice'), false);
alice.transport.close();

// ---- a stale-generation offer is ignored; the acceptor's generation follows the room
relay.generation = 2;
const dave = peerTransport('dave');
relay.generation = 1;
dave.transport.open();
await settle(world, relay);
relay.inject('dave', { to: 'host', generation: 3, kind: 'offer', sdp: 'v=0 offer pc99' });
await settle(world, relay);
assert.equal(acceptor.stats().staleOffers, 1);
dave.transport.close();

// ---- a peer whose channel never opens is dropped after the timeout: the relay holds the host's answer
const erin = peerTransport('erin');
relay.hold = true;
erin.transport.open();
for (let index = 0; index < 8; index++) { await Promise.resolve(); world.flush(); }
relay.flush(); // the offer alone reaches the host
for (let index = 0; index < 12; index++) { await Promise.resolve(); world.flush(); }
const erinPeer = acceptor.peers.get('erin');
assert.ok(erinPeer, 'the host took erin\'s offer');
assert.equal(erinPeer.state, 'connecting', 'the host answered (the answer is held by the relay)');
assert.equal(erin.transport.state, 'connecting');
time.advance(15_000);
assert.equal(acceptor.peers.has('erin'), false, 'a channel that never opened is dropped');
assert.equal(acceptor.stats().timeouts, 1);
relay.hold = false;
relay.flush();
await settle(world, relay);
erin.transport.close();

// ---- a lost peer connection retires the link; close() ends the rest
const bobPc = acceptor.peers.get('bob').pc;
let bobLinkClosed = false;
links[1].link.onClose(() => { bobLinkClosed = true; });
bobPc.fail();
assert.equal(bobLinkClosed, true, 'the host retires the link when its peer connection fails');
assert.equal(acceptor.connected, 1);
acceptor.close(CLOSE_REASON.ROOM_CLOSED, 'match over');
assert.equal(acceptor.connected, 0);
assert.equal(acceptor.peers.size, 0);
await settle(world, relay);
const bobClose = bob.frames.map((bytes) => decodeMessage(bytes)).filter((message) => message.ok && message.message.type === MESSAGE_TYPE.CLOSE).at(-1);
assert.equal(bobClose, undefined, 'a failed peer connection carries no CLOSE (the channel was already gone)');
bob.transport.close();

// ---- the link alone: an oversized frame is rejected, close is idempotent, send after close throws
{
  const local = new RtcWorld();
  const pc = local.createPeerConnection({ iceServers: [], relayOnly: false });
  const channel = pc.createDataChannel('match');
  channel.open();
  const link = createRtcClientLink(channel, 'peer9', { maxFrameBytes: 16 });
  const seen = [];
  link.onMessage((bytes) => seen.push(bytes.byteLength));
  channel.onmessage({ data: new Uint8Array(8).buffer });
  channel.onmessage({ data: new Uint8Array(32).buffer });
  channel.onmessage({ data: 'text' });
  assert.deepEqual(seen, [8]);
  assert.equal(link.framesRejected, 2);
  link.send(encodeMessage({ type: MESSAGE_TYPE.PONG, clientTimeMs: 1, serverTimeMs: 2, serverTick: 3 }));
  assert.equal(link.framesSent, 1);
  link.close(CLOSE_REASON.CLIENT_LEAVE);
  link.close(CLOSE_REASON.CLIENT_LEAVE);
  assert.equal(channel.readyState, 'closed');
  assert.equal(channel.sent.length, 2, 'the CLOSE frame followed the pong');
  assert.throws(() => link.send(new Uint8Array(1)), /link closed/);
}
// ---- the acceptor resolves ICE per offer: a renewed credential reaches the next peer connection (P3, 2026-09-28)
{
  const renewTime = createVirtualTime();
  const renewWorld = new RtcWorld();
  const renewRelay = new FakeSignalRelay('host', 1);
  let generation = 0;
  let iceCalls = 0;
  const renewLinks = [];
  const renewAcceptor = createRtcHostAcceptor({
    signaler: renewRelay.signalerFor('host'), hostId: 'host', generation: () => renewRelay.generation,
    ice: async () => { iceCalls++; return { iceServers: [{ urls: 'turn:turn.example:3478', username: 'u', credential: `secret-${generation}` }], relayOnly: true }; },
    createPeerConnection: renewWorld.createPeerConnection, onLink: (link) => renewLinks.push(link),
    clock: renewTime.clock, setTimer: renewTime.setTimer, clearTimer: renewTime.clearTimer,
  });
  const offerer = (playerId) => {
    const transport = new WebRtcTransport({ signaler: renewRelay.signalerFor(playerId), createPeerConnection: renewWorld.createPeerConnection, clock: renewTime.clock, setTimer: renewTime.setTimer, clearTimer: renewTime.clearTimer, random: () => 0.5 });
    transport.open();
    return transport;
  };
  const first = offerer('alice');
  await settle(renewWorld, renewRelay);
  assert.equal(first.state, 'open');
  assert.equal(iceCalls, 1);
  const configs = [...renewWorld.connections.values()].filter((pc) => pc.config.relayOnly).map((pc) => pc.config.iceServers[0].credential);
  assert.deepEqual(configs, ['secret-0'], "the host's first answer used the first credential");
  generation = 1;
  const second = offerer('bob');
  await settle(renewWorld, renewRelay);
  assert.equal(second.state, 'open');
  assert.equal(iceCalls, 2, 'the second offer resolved ICE again');
  assert.deepEqual([...renewWorld.connections.values()].filter((pc) => pc.config.relayOnly).map((pc) => pc.config.iceServers[0].credential), ['secret-0', 'secret-1'], 'the renewed credential reached the next answer');
  assert.equal(renewLinks.length, 2);
  first.close();
  second.close();
  renewAcceptor.close();
}
// ---- P3b: an offer that reached the seat before its acceptor existed (the election raced) is answered by the acceptor at construction
{
  const time2 = createVirtualTime();
  const world2 = new RtcWorld();
  const relay2 = new FakeSignalRelay('newhost', 2);
  const hostSignaler = relay2.signalerFor('newhost');
  const early = new WebRtcTransport({ signaler: relay2.signalerFor('early'), createPeerConnection: world2.createPeerConnection, clock: time2.clock, setTimer: time2.setTimer, clearTimer: time2.clearTimer, random: () => 0.5 });
  early.open();
  await settle(world2, relay2);
  assert.equal(early.state, 'connecting');
  assert.equal(relay2.delivered.filter((entry) => entry.kind === 'offer').length, 1, 'the offer was relayed to the seat (no acceptor listening yet)');
  const recovered = [];
  const acceptor2 = createRtcHostAcceptor({
    signaler: hostSignaler, hostId: 'newhost', generation: () => relay2.generation, createPeerConnection: world2.createPeerConnection,
    onLink: (link, peer) => recovered.push(peer.playerId), clock: time2.clock, setTimer: time2.setTimer, clearTimer: time2.clearTimer,
  });
  await settle(world2, relay2);
  assert.equal(early.state, 'open', 'the early offer was answered from the recent buffer');
  assert.deepEqual(recovered, ['early']);
  assert.equal(acceptor2.stats().recoveredOffers, 1);
  assert.equal(early.signalStats.sent, 1, 'the peer never had to re-offer');
  assert.deepEqual(hostSignaler.recentOffers(), [], 'the buffer drained');
  acceptor2.close();
  early.close();
  console.log('rtcClientLink.selftest: an offer that raced the election is answered by the acceptor at construction');
}

console.log('rtcClientLink.selftest: acceptor offers/answers/candidates, links, CLOSE-before-close, replacement, stale offers, timeouts, closure and per-offer ICE renewal verified');
