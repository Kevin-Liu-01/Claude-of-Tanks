import assert from 'node:assert/strict';
import { MESSAGE_TYPES, createEnvelope } from './protocol.ts';
import { TransportClosedError } from './loopbackTransport.ts';
import { captureWorldSnapshot } from './snapshot.ts';
import { AuthoritativeMatchRuntime } from './matchRuntime.js';

function simulation() {
  const entities = new Map();
  return {
    entities,
    onPeerJoin({ peerId }) {
      entities.set(peerId, {
        id: peerId,
        specId: 'm1a2',
        team: 'alpha',
        spotted: true,
        state: {
          pos: { x: 0, y: 2, z: 3 }, yaw: 0, speed: 0,
          verticalSpeed: 0, grounded: true, visualPitch: 0, visualRoll: 0,
          turretYaw: 0, gunPitch: 0,
        },
        input: { fire: false },
        combat: {
          hp: 900, maxHp: 1000, destroyed: false,
          fire: { burning: false }, reload: { t: 0, totalS: 8 },
        },
      });
    },
    onPeerLeave({ peerId }) { entities.delete(peerId); },
    step() {},
    snapshot({ tick, serverTimeMs, viewerId, ackInputSeq }) {
      return captureWorldSnapshot({
        tick,
        serverTimeMs,
        entities: [...entities.values()],
        viewerId,
        ackInputSeq,
        canObserve: () => true,
      });
    },
  };
}

function transport(send) {
  const listeners = new Set();
  return {
    kind: 'channel',
    readyState: 'open',
    send,
    sendState: send,
    onMessage(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    onClose() { return () => {}; },
    deliver(message) { for (const listener of [...listeners]) listener(message); },
    close() { this.readyState = 'closed'; },
  };
}

function hello(peerId) {
  return createEnvelope(MESSAGE_TYPES.HELLO, { playerId: peerId }, { seq: 0, tick: 0 });
}

{
  const host = new AuthoritativeMatchRuntime({ simulation: simulation() });
  let snapshotLane = false;
  const peerTransport = transport((message) => {
    if (message.type === MESSAGE_TYPES.SNAPSHOT) {
      snapshotLane = true;
      throw new TransportClosedError();
    }
    return true;
  });
  host.attachPeer({ peerId: 'p1', transport: peerTransport });
  peerTransport.deliver(hello('p1'));
  for (let i = 0; i < 10; i++) host.advance(1000 / 60);
  assert.equal(snapshotLane, true, 'snapshot send reaches the closing transport');
  assert.equal(host.peers.has('p1'), false, 'closing snapshot transport is detached');
  assert.equal(host.stats.steps, 10, 'authority keeps every simulation tick');
  host.advance(1000 / 60);
  host.close();
}

{
  const host = new AuthoritativeMatchRuntime({ simulation: simulation() });
  const peerTransport = transport(() => { throw new TransportClosedError(); });
  host.attachPeer({ peerId: 'p2', transport: peerTransport });
  peerTransport.deliver(hello('p2'));
  assert.equal(host.peers.has('p2'), false, 'closing reliable transport is detached');
  host.advance(1000 / 60);
  host.close();
}

{
  const host = new AuthoritativeMatchRuntime({ simulation: simulation() });
  const peerTransport = transport(() => { throw new TypeError('bad codec'); });
  host.attachPeer({ peerId: 'p3', transport: peerTransport });
  assert.throws(() => peerTransport.deliver(hello('p3')), TypeError,
    'programming errors still escape');
  assert.equal(host.peers.has('p3'), true, 'unexpected errors do not silently detach peers');
  host.close();
}

console.log('matchRuntime.deadPeer.selftest: closing transports detach without stopping authority');
