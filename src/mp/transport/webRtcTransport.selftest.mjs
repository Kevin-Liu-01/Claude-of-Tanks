// The WebRTC transport over the scripted WebRTC world (rtcDouble.test-support.ts) and a relay applying the room's
// signaling rules: open → an offer to the signaler's host with the current generation, trickle candidates both ways
// (the host's candidates queue until its answer applied), the channel opening → `open`, frames both ways with the
// stats, the selected candidate pair's types from the stats (host/host, then relay → viaTurn), backpressure (a
// congested channel refuses frames and a sustained refusal closes with `backpressure`), a dropped channel → reconnect
// with the backoff and a fresh offer, `retarget()` after an election → an immediate offer to the NEW host with the new
// generation (stale-generation signals ignored), `reconnect()` → a fresh offer, a channel that never opens → `timeout`
// attempts until the window is exhausted, `close()` → `client`, an ICE credential failure → host candidates only,
// autoReconnect: false → one attempt.
import assert from 'node:assert/strict';
import { DEFAULT_RECONNECT, TRANSPORT_CLOSE, WebRtcTransport, selectedCandidateTypes } from './index.ts';
import { FakeSignalRelay, RtcWorld } from './rtcDouble.test-support.ts';

// ------------------------------------------------------------ virtual time
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
const settle = async (world, relay, rounds = 6) => {
  for (let index = 0; index < rounds; index++) { await Promise.resolve(); await Promise.resolve(); relay?.flush(); world.flush(); }
};

/** A host double: answers every offer through the relay, keeps the channels it received. */
function scriptedHost(world, relay, hostId) {
  const signaler = relay.signalerFor(hostId);
  const host = { pcs: [], channels: [], offers: [], candidates: [], signaler };
  signaler.onSignal((signal) => {
    if (signal.kind === 'offer') {
      host.offers.push(signal);
      const pc = world.createPeerConnection({ iceServers: [], relayOnly: false });
      pc.ondatachannel = ({ channel }) => { host.channels.push(channel); };
      host.pcs.push(pc);
      void pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp }).then(() => pc.createAnswer()).then(async (answer) => {
        await pc.setLocalDescription(answer);
        signaler.sendSignal({ to: signal.from, generation: signal.generation, kind: 'answer', sdp: answer.sdp });
        signaler.sendSignal({ to: signal.from, generation: signal.generation, kind: 'candidate', candidate: { candidate: 'candidate:host-1', sdpMid: '0', sdpMLineIndex: 0 } });
      });
    } else if (signal.kind === 'candidate') {
      host.candidates.push(signal.candidate);
      void host.pcs.at(-1)?.addIceCandidate(signal.candidate);
    }
  });
  return host;
}

function createTransport(time, relay, world, options = {}) {
  const changes = [];
  const frames = [];
  const transport = new WebRtcTransport({
    signaler: relay.signalerFor('peer'),
    createPeerConnection: world.createPeerConnection,
    clock: time.clock, setTimer: time.setTimer, clearTimer: time.clearTimer, random: () => 0.5,
    ...options,
  });
  transport.onState((change) => changes.push(change));
  transport.onFrame((frame) => frames.push(frame));
  return { transport, changes, frames };
}

// ------------------------------------------------------------ candidate pair types (pure)
{
  const report = (entries) => ({ forEach: (callback) => entries.forEach(callback) });
  assert.equal(selectedCandidateTypes(report([])), null, 'no pair before a selection');
  const types = selectedCandidateTypes(report([
    { type: 'local-candidate', id: 'a', candidateType: 'srflx' }, { type: 'remote-candidate', id: 'b', candidateType: 'relay' },
    { type: 'candidate-pair', id: 'p', state: 'succeeded', nominated: true, localCandidateId: 'a', remoteCandidateId: 'b', currentRoundTripTime: 0.05 },
    { type: 'transport', id: 't', selectedCandidatePairId: 'p' },
  ]));
  assert.deepEqual(types, { local: 'srflx', remote: 'relay', viaTurn: true, rttMs: 50 });
  const noTransport = selectedCandidateTypes(report([
    { type: 'local-candidate', id: 'a', candidateType: 'host' }, { type: 'remote-candidate', id: 'b', candidateType: 'host' },
    { type: 'candidate-pair', id: 'q', state: 'failed', localCandidateId: 'a', remoteCandidateId: 'b' },
    { type: 'candidate-pair', id: 'p', state: 'succeeded', nominated: true, localCandidateId: 'a', remoteCandidateId: 'b' },
  ]));
  assert.deepEqual(noTransport, { local: 'host', remote: 'host', viaTurn: false, rttMs: null }, 'the nominated succeeded pair stands in for the transport record');
}

// ------------------------------------------------------------ open, trickle, frames, stats
{
  const time = createVirtualTime();
  const world = new RtcWorld();
  const relay = new FakeSignalRelay('host', 3);
  const host = scriptedHost(world, relay, 'host');
  const { transport, changes, frames } = createTransport(time, relay, world);
  assert.equal(transport.state, 'idle');
  assert.equal(transport.send(new Uint8Array([1])), false, 'nothing is sent before open');
  transport.open();
  assert.equal(transport.state, 'connecting');
  transport.open();
  await settle(world, relay);
  assert.equal(host.offers.length, 1, 'open() is idempotent while connecting: one offer');
  assert.equal(host.offers[0].generation, 3, 'the offer carries the room generation');
  assert.equal(host.offers[0].to, 'host');
  assert.equal(transport.state, 'open');
  assert.deepEqual(changes.map((change) => change.state), ['connecting', 'open']);
  assert.equal(changes[1].resumed, false);
  assert.equal(time.pending, 0, 'the attempt timer is cleared once the channel opens');
  assert.equal(host.channels.length, 1);
  assert.equal(host.channels[0].label, 'match');
  const peerPc = world.connections.get(1);
  assert.equal(peerPc.channels[0].binaryType, 'arraybuffer', 'binary frames are requested as ArrayBuffers');
  assert.deepEqual(peerPc.addedCandidates, [{ candidate: 'candidate:host-1', sdpMid: '0', sdpMLineIndex: 0 }], "the host's candidate (sent right after its answer) was applied");
  peerPc.emitCandidate({ candidate: 'candidate:peer-1', sdpMid: '0', sdpMLineIndex: 0 });
  peerPc.emitCandidate(null);
  await settle(world, relay);
  assert.equal(host.candidates.length, 1, 'the peer trickles its candidates to the host; the end-of-candidates null is not relayed');
  assert.equal(transport.signalStats.candidatesSent, 1);
  assert.equal(transport.signalStats.candidatesReceived, 1);
  assert.equal(transport.candidateType, 'host');
  assert.equal(transport.viaTurn, false);
  assert.deepEqual(transport.target, { hostId: 'host', generation: 3 });

  const frame = new Uint8Array([1, 2, 3, 4]);
  assert.equal(transport.send(frame), true);
  await settle(world, relay);
  assert.equal(host.channels[0].sent.length, 0);
  const hostSeen = [];
  host.channels[0].onmessage = (event) => hostSeen.push(new Uint8Array(event.data));
  assert.equal(transport.send(new Uint8Array([9, 9])), true);
  await settle(world, relay);
  assert.deepEqual([...hostSeen[0]], [9, 9], 'frames reach the host end');
  host.channels[0].send(new Uint8Array([7, 7, 7]));
  await settle(world, relay);
  assert.equal(frames.length, 1);
  assert.deepEqual([...frames[0]], [7, 7, 7]);
  host.channels[0].send(new Uint8Array(70 * 1024));
  await settle(world, relay);
  assert.equal(frames.length, 1, 'an oversized frame is rejected');
  assert.equal(transport.stats.framesRejected, 1);
  assert.deepEqual([transport.stats.framesSent, transport.stats.bytesSent, transport.stats.framesReceived, transport.stats.bytesReceived, transport.stats.opens],
    [2, 6, 1, 3, 1]);

  // ---- backpressure: a congested channel refuses frames; sustained for 5 s it closes
  const channel = peerPc.channels[0];
  channel.congested = true;
  transport.send(new Uint8Array(40 * 1024));
  transport.send(new Uint8Array(20 * 1024));
  assert.equal(transport.bufferedBytes, 60 * 1024, 'bufferedBytes is the channel bufferedAmount');
  assert.equal(transport.send(new Uint8Array(8 * 1024)), false, 'a frame over the ceiling is refused');
  assert.equal(transport.stats.framesDropped, 1);
  channel.congested = false;
  channel.drain();
  assert.equal(transport.send(new Uint8Array(8 * 1024)), true, 'the refusal window resets once the buffer drains');
  world.flush();
  channel.congested = true;
  assert.equal(transport.send(new Uint8Array(60 * 1024)), true);
  assert.equal(transport.send(new Uint8Array(8 * 1024)), false);
  time.advance(4999);
  assert.equal(transport.send(new Uint8Array(8 * 1024)), false);
  assert.equal(transport.state, 'open');
  time.advance(2);
  assert.equal(transport.send(new Uint8Array(8 * 1024)), false);
  assert.equal(transport.state, 'closed');
  assert.equal(changes.at(-1).reason, TRANSPORT_CLOSE.BACKPRESSURE);
  assert.equal(peerPc.closed, true, 'the peer connection is closed with the transport');
  console.log('webRtcTransport.selftest: offer/answer/candidates, frames, stats, candidate pair and backpressure verified');
}

// ------------------------------------------------------------ a dropped channel → reconnect with backoff → a fresh offer; retarget after an election
{
  const time = createVirtualTime();
  const world = new RtcWorld({ pairTypes: { local: 'relay', remote: 'host' } });
  const relay = new FakeSignalRelay('host', 1);
  const host = scriptedHost(world, relay, 'host');
  const { transport, changes } = createTransport(time, relay, world);
  transport.open();
  await settle(world, relay);
  assert.equal(transport.state, 'open');
  assert.equal(transport.viaTurn, true, 'a relayed local candidate reads as TURN');
  const firstPc = world.connections.get(1);
  firstPc.channels[0].drop();
  assert.equal(transport.state, 'reconnecting');
  assert.equal(changes.at(-1).reason, TRANSPORT_CLOSE.NETWORK);
  assert.equal(changes.at(-1).attempt, 1);
  assert.equal(changes.at(-1).retryDelayMs, 250, 'the first retry waits 250 ms (jitter at the midpoint)');
  assert.equal(transport.candidateType, null, 'the pair is forgotten with the connection');
  time.advance(249);
  assert.equal(host.offers.length, 1);
  time.advance(1);
  await settle(world, relay);
  assert.equal(host.offers.length, 2, 'the retry is a fresh offer');
  assert.equal(transport.state, 'open');
  assert.equal(changes.at(-1).resumed, true, 'the owner re-runs its handshake');
  assert.equal(changes.at(-1).attempt, 1);
  assert.equal(transport.stats.reconnects, 1);

  // ---- the host's peer connection fails (ICE gave up): the same path
  world.connections.get(3).fail();
  assert.equal(transport.state, 'reconnecting');
  assert.equal(changes.at(-1).attempt, 1, 'a fresh outage counts from attempt 1');
  time.advance(250);
  await settle(world, relay);
  assert.equal(transport.state, 'open');

  // ---- an election while open: retarget → drop, offer to the new host with the new generation at once
  const newHost = scriptedHost(world, relay, 'host2');
  relay.elect('host2');
  assert.equal(relay.generation, 2);
  const openPc = world.connections.get(5);
  transport.retarget('host changed');
  assert.equal(openPc.closed, true, 'the link to the old host is dropped');
  assert.equal(changes.at(-2).state, 'reconnecting');
  assert.equal(changes.at(-2).retryDelayMs, 0, 'no backoff for an election');
  assert.equal(transport.state, 'connecting', 'the offer to the new host is already under way');
  await settle(world, relay);
  assert.equal(newHost.offers.length, 1, 'one offer to the new host');
  assert.equal(newHost.offers[0].generation, 2);
  assert.equal(host.offers.length, 3, 'the old host got nothing new');
  assert.equal(transport.state, 'open');
  assert.equal(changes.at(-1).resumed, true);
  assert.deepEqual(transport.target, { hostId: 'host2', generation: 2 });
  transport.retarget();
  assert.equal(transport.state, 'open', 'retarget to the same host is a no-op');
  assert.equal(newHost.offers.length, 1);

  // ---- a stale signal (the old generation) is ignored
  relay.signalerFor('host').sendSignal({ to: 'peer', generation: 1, kind: 'answer', sdp: 'v=0 stale' });
  assert.equal(relay.refused.at(-1).why, 'stale_generation', 'the relay drops it');
  host.signaler.sendSignal({ to: 'peer', generation: 2, kind: 'candidate', candidate: { candidate: 'c', sdpMid: null, sdpMLineIndex: null } });
  assert.equal(relay.refused.at(-1).why, 'no_host_endpoint', 'the old host is no endpoint of the relay any more');
  const stale = transport.staleSignals;
  relay.inject('host', { to: 'peer', generation: 2, kind: 'candidate', candidate: { candidate: 'c', sdpMid: null, sdpMLineIndex: null } });
  relay.inject('host2', { to: 'peer', generation: 1, kind: 'candidate', candidate: { candidate: 'c', sdpMid: null, sdpMLineIndex: null } });
  relay.inject('host2', { to: 'peer', generation: 2, kind: 'offer', sdp: 'v=0 not for a peer' });
  assert.equal(transport.staleSignals, stale + 3, 'a wrong sender, a stale generation and an offer are ignored by the transport itself');

  // ---- an election while reconnecting: the pending attempt fires now
  world.connections.get(7).channels[0].drop();
  assert.equal(transport.state, 'reconnecting');
  const thirdHost = scriptedHost(world, relay, 'host3');
  relay.elect('host3');
  transport.retarget();
  await settle(world, relay);
  assert.equal(thirdHost.offers.length, 1, 'the pending attempt fired at once, to the newest host');
  assert.equal(thirdHost.offers[0].generation, 3);
  assert.equal(transport.state, 'open');

  // ---- reconnect(): the owner asks for a fresh connection (a stalled authority)
  transport.reconnect(TRANSPORT_CLOSE.STALLED, 'no authority');
  assert.equal(transport.state, 'reconnecting');
  assert.equal(changes.at(-1).reason, TRANSPORT_CLOSE.STALLED);
  time.advance(250);
  await settle(world, relay);
  assert.equal(thirdHost.offers.length, 2);
  assert.equal(transport.state, 'open');
  transport.close();
  assert.equal(transport.state, 'closed');
  assert.equal(changes.at(-1).reason, TRANSPORT_CLOSE.CLIENT);
  assert.equal(time.pending, 0, 'no timer survives close');
  console.log('webRtcTransport.selftest: reconnect with backoff, retarget on election, stale signals, reconnect() verified');
}

// ------------------------------------------------------------ a channel that never opens: timeout attempts, then the window exhausts
{
  const time = createVirtualTime();
  const world = new RtcWorld();
  const relay = new FakeSignalRelay('host', 1);
  const { transport, changes } = createTransport(time, relay, world, { reconnect: { windowMs: 20_000 } });
  transport.open();
  await settle(world, relay);
  assert.equal(relay.refused.at(-1)?.why, 'unknown_seat', 'no host listens: the relay refuses the offer');
  assert.equal(transport.state, 'connecting');
  time.advance(DEFAULT_RECONNECT.attemptTimeoutMs);
  assert.equal(transport.state, 'reconnecting');
  assert.equal(changes.at(-1).reason, TRANSPORT_CLOSE.TIMEOUT);
  time.advance(250);
  time.advance(DEFAULT_RECONNECT.attemptTimeoutMs);
  assert.equal(changes.at(-1).attempt, 2);
  time.advance(60_000);
  assert.equal(transport.state, 'closed');
  assert.equal(changes.at(-1).reason, TRANSPORT_CLOSE.EXHAUSTED);
  assert.equal(transport.stats.reconnects >= 2, true);
  assert.equal(time.pending, 0);
}

// ------------------------------------------------------------ the room names no host yet; ICE failure → host candidates; autoReconnect false
{
  const time = createVirtualTime();
  const world = new RtcWorld();
  const relay = new FakeSignalRelay('', 1);
  const { transport, changes } = createTransport(time, relay, world, { autoReconnect: false });
  transport.open();
  assert.equal(transport.state, 'closed', 'without a host and without auto-reconnect the attempt ends the transport');
  assert.equal(changes.at(-1).reason, TRANSPORT_CLOSE.NETWORK);
  assert.match(changes.at(-1).detail, /no host/);
}
{
  const time = createVirtualTime();
  const world = new RtcWorld();
  const relay = new FakeSignalRelay('host', 1);
  scriptedHost(world, relay, 'host');
  let iceCalls = 0;
  const { transport } = createTransport(time, relay, world, { ice: async () => { iceCalls++; throw new Error('turn_service_unavailable'); } });
  transport.open();
  await settle(world, relay);
  assert.equal(iceCalls, 1);
  assert.equal(transport.state, 'open', 'a failed credential fetch still connects on host candidates');
  assert.deepEqual(world.connections.get(1).config, { iceServers: [], relayOnly: false });
  transport.close();
}
{
  const time = createVirtualTime();
  const world = new RtcWorld();
  const relay = new FakeSignalRelay('host', 1);
  scriptedHost(world, relay, 'host');
  const servers = [{ urls: 'turn:turn.example:3478', username: 'u', credential: 'c' }];
  const { transport } = createTransport(time, relay, world, { ice: { iceServers: servers, relayOnly: true } });
  transport.open();
  await settle(world, relay);
  assert.deepEqual(world.connections.get(1).config, { iceServers: servers, relayOnly: true }, 'the ICE configuration reaches the factory');
  transport.close();
}
console.log('webRtcTransport.selftest: timeouts, the exhausted window, no-host, ICE fallback and configuration verified');
