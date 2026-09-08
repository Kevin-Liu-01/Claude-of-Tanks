import assert from 'node:assert/strict';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { AuthoritativeMatchRuntime, MatchClientRuntime } from './matchRuntime.ts';
import { createLoopbackTransportPair } from './loopbackTransport.ts';
import { createNetworkFramePump } from './networkFramePump.ts';
import { beginPrivateHostMatch } from './privateMatchHandoff.ts';

function createSimulation() {
  return createAuthoritativeMatch({ mapId: 'verdant', seed: 123, countdownS: 5,
    players: [
      { id: 'host', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: 0, yaw: 0 } },
      { id: 'guest', specId: 't90m', team: 'bravo', spawn: { x: 100, z: 100, yaw: 0 } },
    ] });
}

function fixture() {
  let nowMs = 0;
  const simulation = createSimulation();
  const host = new AuthoritativeMatchRuntime({ simulation,
    maxCatchUpTicks: 6, maxBacklogTicks: 300, longStallCatchUpTicks: 2 });
  const clients = ['host', 'guest'].map(playerId => {
    const link = createLoopbackTransportPair({ direct: true });
    host.attachPeer({ peerId: playerId, transport: link.host });
    const client = new MatchClientRuntime({ playerId, transport: link.client, clock: () => nowMs });
    client.connect();
    return client;
  });
  const advance = (elapsedMs, countdownElapsedMs = elapsedMs) => {
    nowMs += countdownElapsedMs;
    return host.advance(elapsedMs, countdownElapsedMs);
  };
  const snapshot = () => simulation.snapshot({ tick: host.tick, serverTimeMs: host.timeMs,
    viewerId: 'host', ackInputSeq: null });
  return { simulation, host, clients, advance, snapshot,
    close() { for (const client of clients) client.close(); host.close(); } };
}

// The retained native baseline showed ~75 ms foreground frames and exactly
// 30 callbacks per displayed countdown second: its two-tick backlog drain
// stretched five seconds to 10.3 seconds. This exercises real authority.
const slow = fixture();
try {
  slow.clients[0].readyForMatch();
  slow.advance(100, 10_000);
  assert.equal(slow.simulation.phase, 'loading', 'every required peer must be ready');
  slow.clients[1].readyForMatch();
  slow.advance(100, 10_000);
  assert.equal(slow.snapshot().meta.countdownMs, 5000, 'pre-ready elapsed cannot spend countdown');
  for (let frame = 0; frame < 66; frame++) slow.advance(75);
  assert.equal(slow.simulation.phase, 'countdown');
  assert.equal(slow.snapshot().meta.countdownMs, 50, 'slow foreground cadence uses authority elapsed');
  slow.advance(50);
  assert.equal(slow.simulation.phase, 'playing', 'release on the first callback at five seconds');
  assert.equal(slow.simulation.timeS, 0, 'countdown release does not integrate missed combat');
  assert.equal(slow.host.accumulatorMs, 0, 'pregame backlog is discarded on release');
} finally { slow.close(); }

// Native baseline-r2 host observer gaps, retaining only advancing animation
// ticks, rounded to its 0.1 ms acquisition resolution. No capture is started.
const measuredCadence = [6.2, 205.8, 95.3, 91.8, 6, 71.8, 98.4, 68.9, 77.4, 91.5,
  90, 86, 85.5, 89, 68, 75.4, 96.7, 85.4, 76.4, 93.7, 81.1, 81.9, 79.8, 93.2,
  95.5, 82.9, 66.5, 99.8, 64.4, 79.8, 96.1, 87.2, 87.1, 88.7, 89.1, 86.6, 94.5,
  78.1, 87.9, 75.1, 95.9, 60.9, 78.6, 80.4, 84.1, 94.5, 77.8, 92, 86, 78.9,
  60.4, 89.4, 84.1, 88.2, 79.4, 96.1, 88.9, 53.1, 91.1, 85.4, 86.7, 93.6,
  53.1, 76.3, 65.9, 75.1, 80.2, 78.6, 59.5, 95.2, 75.2, 81.8, 84.9, 89.8,
  75.2, 50.5, 74.1, 57, 61.9, 78, 74.5, 105.2, 87.7, 73.7, 65, 72.8, 51.7,
  47, 61.9, 37, 60.7, 52.6, 73.7, 110.7, 88, 72.5, 103.7, 54.4, 79.7, 66.8,
  34.2, 51.6, 31.6, 55.7, 32.4, 66.4, 61.3, 92.8, 73.8, 95.5, 70.3, 64.7,
  52.1, 73.9, 56.1, 53.7, 68.3, 89.4, 74.7, 62.2, 46, 50.7, 38.9, 44.2,
  35.9, 46.5, 33.8, 57.2, 45.5, 60.2, 76.7, 78, 78, 72.1, 66.5, 51.2,
  51.4, 38.6, 53.5, 36, 43.9, 49.2];

for (const cadence of [measuredCadence, [250, 100, 180, 75]]) {
  const f = fixture();
  let nowMs = 0;
  const match = { role: 'host', client: f.clients[0],
    advance(dtMs, input, countdownElapsedMs) {
      if (input) f.clients[0].submitInput(input, f.host.tick);
      f.advance(dtMs, countdownElapsedMs);
      return f.clients[0].update(nowMs);
    } };
  const pump = createNetworkFramePump({ getMatch: () => match, getBridge: () => null,
    getStatus: () => null, getPlayer: () => null, isBattleActive: () => true,
    nextFrame: async () => {}, recovery: { update: () => false, snapshot: () => null },
    onHostError(error) { throw error; } });
  try {
    for (const client of f.clients) client.readyForMatch();
    pump.pump(1 / 60, nowMs);
    assert.equal(f.snapshot().meta.countdownMs, 5000);
    for (let index = 0; f.simulation.phase === 'countdown'; index++) {
      assert.ok(index < 300, 'countdown must not hang');
      const gap = cadence[index % cadence.length];
      const beforeMs = nowMs;
      nowMs += gap;
      pump.pump(Math.min(0.1, gap / 1000), nowMs);
      if (nowMs < 5000) assert.equal(f.simulation.phase, 'countdown', 'authority cannot release early');
      if (f.simulation.phase === 'playing') {
        assert.ok(beforeMs < 5000 && nowMs >= 5000, 'first pump reaching deadline releases authority');
        assert.equal(f.simulation.timeS, 0);
        assert.equal(f.host.accumulatorMs, 0);
      }
    }
    const tick = f.host.tick;
    pump.pump(0.1, nowMs);
    assert.equal(f.host.tick, tick, 'duplicate pump timestamp cannot spend time twice');
    nowMs += 1000 / 60;
    pump.pump(1 / 60, nowMs);
    assert.ok(Math.abs(f.simulation.timeS - 1 / 60) < 1e-9,
      'first combat frame advances exactly its own fixed time');
  } finally { pump.dispose(); f.close(); }
}

for (const initialTick of [0, 1, 2]) {
  const f = fixture();
  try {
    f.advance(initialTick * 1000 / 60);
    for (const client of f.clients) client.readyForMatch();
    f.advance(1000 / 60, 60_000);
    assert.equal(f.snapshot().meta.countdownMs, 5000);
    for (const client of f.clients) {
      assert.equal(client.lastSnapshotTick, f.host.tick,
        'initial countdown publishes immediately at every snapshot cadence residue');
      const received = client.buffer.snapshots.at(-1);
      assert.equal(received.meta.phase, 'countdown');
      assert.equal(received.meta.countdownMs, 5000, 'real decoded packet carries the complete countdown');
    }
    f.advance(0, 2000);
    f.advance(1, 1000);
    assert.equal(f.snapshot().meta.countdownMs, 5000, 'sub-tick advances do not fake simulation ticks');
    f.advance(16, 0);
    assert.equal(f.snapshot().meta.countdownMs, 2000, 'sub-tick clock budget is retained exactly once');
    f.advance(1000 / 60, 2000);
    assert.equal(f.simulation.phase, 'playing');
    assert.equal(f.simulation.timeS, 0);
    for (const client of f.clients) {
      assert.equal(client.lastSnapshotTick, f.host.tick,
        'release snapshot is not delayed by the ordinary three-tick cadence');
      const received = client.buffer.snapshots.at(-1);
      assert.equal(received.meta.phase, 'playing');
      assert.equal(received.meta.countdownMs, 0);
    }
    const endedTick = f.host.tick;
    f.advance(0, 0);
    assert.equal(f.host.tick, endedTick, 'release cannot duplicate tick/events on zero elapsed');
  } finally { f.close(); }
}

const hidden = fixture();
let hiddenNow = 0;
const hiddenMatch = { role: 'host', client: hidden.clients[0],
  advance: (dt, _input, clock) => { hidden.advance(dt, clock); return null; } };
const hiddenPump = createNetworkFramePump({ getMatch: () => hiddenMatch,
  getBridge: () => null, getStatus: () => null, getPlayer: () => null, isBattleActive: () => true,
  nextFrame: async () => {}, recovery: { update: () => false, snapshot: () => null },
  onHostError(error) { throw error; } });
try {
  for (const client of hidden.clients) client.readyForMatch();
  hiddenPump.pump(1 / 60, hiddenNow);
  hiddenNow = 60_000;
  hiddenPump.pumpBackground(hiddenNow);
  assert.equal(hidden.simulation.phase, 'playing', 'hidden wall time may finish an already-ready countdown');
  assert.equal(hidden.simulation.timeS, 0, 'hidden release never advances missed combat');
  hiddenPump.pump(0.1, hiddenNow);
  assert.equal(hidden.simulation.timeS, 0, 'same-time foreground handoff cannot replay hidden gap');
} finally { hiddenPump.dispose(); hidden.close(); }

const remote = createLoopbackTransportPair({ direct: true });
const privateMatch = beginPrivateHostMatch({
  session: { roomInfo: { peerId: 'host', mode: 'lan' },
    takeMatchChannels: () => [{ peerId: 'guest', transport: remote.host }] },
  lobbyState: { roomCode: 'ABC234', mode: 'lan', phase: 'starting', mapId: 'verdant', matchSeed: 123,
    teamSize: 1, players: [{ id: 'host', specId: 'm1a2', team: 'alpha' },
      { id: 'guest', specId: 't90m', team: 'bravo' }] },
});
const privateGuest = new MatchClientRuntime({ playerId: 'guest', transport: remote.client, clock: () => 0 });
try {
  privateGuest.connect(); privateGuest.readyForMatch(); privateMatch.ready();
  privateMatch.advance(100, null, 20_000);
  assert.equal(privateMatch.simulation.phase, 'countdown');
  for (let frame = 0; frame < 20; frame++) privateMatch.advance(100, null, 250);
  assert.equal(privateMatch.simulation.phase, 'playing', 'real private adapter forwards unclamped countdown clock');
  assert.equal(privateMatch.simulation.timeS, 0);
  assert.equal(privateMatch.host.accumulatorMs, 0);
} finally { privateGuest.close(); privateMatch.close(); }

const direct = fixture();
try {
  direct.simulation.onMatchReady();
  for (let tick = 0; tick < 60; tick++) direct.simulation.step({ dt: 1 / 60, inputs: new Map() });
  assert.equal(direct.snapshot().meta.countdownMs, 4000, 'direct deterministic callers retain fixed-dt countdown');
  for (const invalid of [-1, NaN, Infinity]) {
    const before = direct.snapshot().meta.countdownMs;
    assert.throws(() => direct.host.advance(100, invalid), /finite and non-negative/);
    assert.throws(() => direct.simulation.step({ dt: 1 / 60, countdownElapsedS: invalid, inputs: new Map() }),
      /finite and non-negative/);
    assert.equal(direct.snapshot().meta.countdownMs, before);
  }
} finally { direct.close(); }

const rematch = fixture();
try {
  for (const client of rematch.clients) client.readyForMatch();
  rematch.advance(1000 / 60);
  rematch.advance(0, 3000);
  const next = createSimulation();
  rematch.host.replaceSimulation(next, { round: 2 });
  rematch.advance(100, 20_000);
  assert.equal(next.phase, 'loading', 'replacement requires fresh all-peer readiness');
  for (const client of rematch.clients) client.readyForMatch();
  rematch.advance(1000 / 60, 20_000);
  rematch.advance(1000 / 60, 1000);
  const snapshot = next.snapshot({ tick: rematch.host.tick, serverTimeMs: rematch.host.timeMs,
    viewerId: 'host', ackInputSeq: null });
  assert.equal(snapshot.meta.countdownMs, 4000, 'replacement discards old pending countdown elapsed');
} finally { rematch.close(); }

console.log('authoritativeCountdown.selftest: all-peer barrier and slow-clock countdown passed');
