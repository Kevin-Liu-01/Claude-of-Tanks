import assert from 'node:assert/strict';
import { Object3D, PerspectiveCamera, Scene } from 'three';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { createBattlePresentationRuntime } from '../game/battlePresentationRuntime.ts';
import { createBrowserBattleBridge } from './browserBattleBridge.ts';
import { createEnvelope, MESSAGE_TYPES } from './protocol.ts';
import {
  createSnapshotDelta,
  decodeEntitySnapshot,
  SnapshotAssembler,
  SnapshotBuffer,
} from './snapshot.ts';
import { snapshotWireCodec } from './snapshotWireCodec.ts';

// Exercise the real countdown: zero-countdown combat fixtures never transfer
// controls back from the deployment hold and cannot catch a retained aim lock.
const match = createAuthoritativeMatch({
  mapId: 'verdant', seed: 123, countdownS: 5,
  players: [
    { id: 'bot', specId: 'm1a2', team: 'alpha', bot: true,
      spawn: { x: 0, z: 0, yaw: 1 } },
    { id: 'target', specId: 't90m', team: 'bravo',
      spawn: { x: 50, z: 90, yaw: Math.PI } },
  ],
});
const scene = new Scene();
const camera = new PerspectiveCamera(60, 16 / 9, 0.5, 4000);
const game = {
  phase: 'battle', tanks: [], tankById: new Map(), player: null,
  shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0,
  result: null, resultReason: null, mapId: 'verdant',
};

// Spy on the actual per-frame visual port, not just the bridge's initial
// hidden reveal. No WebGL or authored geometry is needed to prove that the
// changing remote articulation reaches the renderer's state contract.
const bridge = createBrowserBattleBridge({
  engineCtx: { scene }, game, bus: { emit() {} },
  viewerId: 'observer', spectator: true,
  createTankVisual() {
    return {
      root: new Object3D(), lastPose: null, syncs: 0,
      setVisible(visible) { this.root.visible = visible; },
      syncFromState(state, _dt, _distance, presented = state) {
        this.syncs++;
        this.root.position.copy(presented.pos);
        this.lastPose = {
          turretYaw: presented.turretYaw,
          gunPitch: presented.gunPitch,
        };
      },
      dispose() {},
    };
  },
});
const presentation = createBattlePresentationRuntime({
  game, camera, scene,
  battleClient: {
    createTankPresentationPose() { assert.fail('network bots must not use solo pose buffers'); },
    isPostwarVehicleEra() { return true; },
  },
  getFx: () => null, getWorld: () => null,
  isNetworkMatchActive: () => true,
  getPedestalVisual: () => null, isCinematicActive: () => false,
});
const assembler = new SnapshotAssembler();
const buffer = new SnapshotBuffer({ interpolationDelayMs: 0 });
const inputs = new Map();
const presentedPoses = [];
let baseline = null;
let interpolatedSamples = 0;
let deltaPackets = 0;
let sawCountdown = false;
const angularMidpoint = (a, b) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) / 2;

match.onMatchReady();
for (let tick = 0; tick <= 900; tick++) {
  if (tick > 0) match.step({ dt: 1 / 60, inputs });
  if (tick % 3 !== 0) continue;
  const authority = match.snapshot({
    tick, serverTimeMs: tick * 1000 / 60, viewerId: 'observer', ackInputSeq: null,
  });
  // MatchRuntime sends one-shot events on the reliable lane, independently
  // from replaceable pose packets. This test concerns only that pose lane.
  authority.events = [];
  const packet = createSnapshotDelta(authority, baseline);
  if (baseline) deltaPackets++;
  const envelope = createEnvelope(MESSAGE_TYPES.SNAPSHOT, packet, { seq: tick, tick });
  const decoded = snapshotWireCodec.decode(snapshotWireCodec.encode(envelope));
  const full = assembler.accept(decoded.payload);
  assert.ok(full, 'acknowledged compact deltas reconstruct the bot pose');
  buffer.push(full);
  const sampled = buffer.sample(authority.serverTimeMs - (baseline ? 25 : 0));
  const sampledBot = sampled.entities.find((entity) => entity.id === 'bot');
  assert.ok(sampledBot, 'spectator receives the real authoritative bot');
  const currentBot = decodeEntitySnapshot(authority.entities.find((entity) => entity.id === 'bot'));
  const serverBot = match.entityById.get('bot');
  for (const key of ['turretYaw', 'gunPitch']) {
    assert.ok(Math.abs(currentBot[key] - serverBot.state[key]) < 0.0001,
      `${key}: compact snapshot retains authority within angle quantization`);
  }
  if (baseline) {
    const previousBot = decodeEntitySnapshot(baseline.entities.find((entity) => entity.id === 'bot'));
    for (const key of ['turretYaw', 'gunPitch']) {
      assert.ok(Math.abs(sampledBot[key] - angularMidpoint(previousBot[key], currentBot[key])) < 0.0001,
        `${key}: remote interpolation retains both authority endpoints`);
    }
    interpolatedSamples++;
  }
  bridge.apply(sampled);
  const remote = game.tankById.get('bot');
  assert.equal(remote.isPlayer, false, 'bot uses remote presentation, never local prediction');
  camera.position.copy(remote.state.pos).add({ x: 0, y: 4, z: -20 });
  camera.lookAt(remote.state.pos);
  camera.updateMatrixWorld(true);
  const priorSyncs = remote.visual.syncs;
  presentation.update(1 / 20, 0.5);
  assert.equal(remote.visual.syncs, priorSyncs + 1,
    'visible network bot reaches the real per-frame visual synchronization port');
  for (const key of ['turretYaw', 'gunPitch']) {
    assert.equal(remote.state[key], sampledBot[key], `${key}: bridge applies remote authority`);
    assert.equal(remote.visual.lastPose[key], sampledBot[key], `${key}: visual receives sampled articulation`);
  }
  if (authority.meta.phase === 'countdown') sawCountdown = true;
  if (authority.meta.phase === 'playing') presentedPoses.push(remote.visual.lastPose);
  baseline = authority;
  match.afterSnapshotBroadcast();
}

const range = (key) => Math.max(...presentedPoses.map((pose) => pose[key]))
  - Math.min(...presentedPoses.map((pose) => pose[key]));
assert.ok(sawCountdown && presentedPoses.length > 100,
  'fixture covers deployment hold and sustained post-countdown combat');
assert.ok(deltaPackets > 100 && interpolatedSamples > 100,
  'changing articulation traverses compact deltas and remote interpolation');
assert.ok(range('turretYaw') > 0.2,
  `multiplayer bot must visibly traverse after countdown (${range('turretYaw')} rad)`);
assert.ok(range('gunPitch') > 0.02,
  `multiplayer bot must visibly elevate/depress after countdown (${range('gunPitch')} rad)`);
bridge.dispose();
console.log('multiplayerBotPresentation.selftest: countdown → authority → wire → interpolation → remote visual passed '
  + `(turret ${range('turretYaw').toFixed(3)} rad, gun ${range('gunPitch').toFixed(3)} rad)`);
