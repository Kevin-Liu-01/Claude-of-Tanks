// A solo battle recorded and replayed (replay-system-275, docs/REPLAY.md §1-§4): the page's own setup and step, the
// recorder's taps as main.ts wires them (the seat stage before each step, the rules port, the bus), and the replayer
// stepping the recording alone on a fresh world. Must match: every checksum, the final digest, the step count and the
// kills. Exercises what the page does besides the controls: a footprint streamed in mid-battle (a bot's visual
// arriving), a shell selection, a consumable, a stored difficulty and loadout read through localStorage.
// Negative control: one seat control's throttle one unit off at step 500 is caught at the next checksum.
// A page import, a world and a fleet: MANUAL suite 'sims' (tools/selftest-tiers.mjs), beside twinMuzzleSolo.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { Group, Vector3 } from 'three';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { createBus, createCollider, createGameState, setupBattle, simStep } from '../state.ts';
import { spawnTanks } from '../rosterState.ts';
import { useSoloConsumable } from '../soloConsumables.ts';
import { selectShell } from '../../sim/damage.ts';
import { decodeReplay } from '../../sim/replayFormat.ts';
import { createReplayRecorder } from './replayRecorder.ts';
import { createReplayRun, ReplayMismatch, withLayoutSpawnPoints } from './replayRunner.ts';
import { replayStateDigest } from './replayChecksum.ts';
import { createReplayTrace, diffDumps, traceRows } from './replayTrace.ts';
import { createReplayTrackBuilder } from './replayTrack.ts';
import { indexReplay } from './replayIndexer.ts';
import { runReplayIndexJob } from './replayIndexerWorker.ts';
import { createCollisionManifestLoader } from '../../../server/collisionManifestLoader.ts';
import { createDedicatedWorldCollision } from '../../../server/dedicatedWorldCollision.ts';

const MAP = 'verdant';
const SPEC = 'm1a1_abrams_hc';
const TICKS = 4800;
// every saved spec finalized, as a page's are once its fleet loads: the roster is drawn at setup (a replay that finalized
// only TANK_IDS, the three starters, stepped every other hull on an unfinished spec and drifted from the page)
await ensureAuthorityFleet();

const worldFor = () => withLayoutSpawnPoints(createDedicatedWorldCollision(MAP, { retain: true }));

// a page's localStorage: a stored difficulty and the player's loadout, read by setup through the recorder's tap
class FakeStorage {
  constructor(values) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
const storage = new FakeStorage({ 'cot.settings.v1': JSON.stringify({ aiDifficulty: 'hard' }) });

const FOOTPRINT = { halfLenM: 3.1, halfWidM: 1.6, zCenterM: 0.05, bottomYM: 0.42, panYM: null, endRise: { dzM: 0.4, frontM: 0.2, rearM: 0.15 } };

function recordBattle() {
  const world = worldFor();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
  const recorder = createReplayRecorder({ storageProto: FakeStorage.prototype, storage, now: () => 0 });
  try {
    const game = createGameState({ rosterSeed: 4242 });
    game.mapId = MAP;
    spawnTanks(game, { scene: { remove() {} } });
    for (const hull of game.allTanks) if (hull) hull.visual = { root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() {}, setDestroyed() {}, resetDestroyed() {} };
    game.battleCount = 3;
    // a page's second battle: the bot memory rosterState keeps as two Sets (arm 3 of the first browser check failed on it)
    game.previousBotSpecIds = new Set(['t72b3', 'leopard_2a6']);
    game.recentBotSpecIds = new Set(['t72b3']);
    const options = { random: true, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false };
    recorder.trace = true; // the divergence trace (replayTrace.ts): the replay's must match it number for number, dump for dump
    recorder.beginSetup(game, SPEC, options);
    setupBattle(game, SPEC, world, options);
    recorder.endSetup();
    assert.ok(recorder.active, 'the recorder armed for the battle');
    const bus = createBus((type, payload) => recorder.onEvent(type, payload));
    const collider = createCollider(game, world);
    const rules = recorder.wrapRules({ selectShell, useSoloConsumable });
    const player = game.player;
    const bot = game.tanks.find((hull) => !hull.isPlayer);
    let kills = 0;
    bus.on('tank:destroyed', () => { kills++; });
    const liveTrack = createReplayTrackBuilder(game); // the viewer's track as the battle itself ran
    for (let tick = 0; tick < TICKS; tick++) {
      // the frame's controls (playerFrameInput, the camera rig): floats, the aim a world point, as the page writes them
      const target = game.tanks.filter((hull) => hull.team !== player.team && !hull.combat?.destroyed)
        .sort((a, b) => a.state.pos.distanceTo(player.state.pos) - b.state.pos.distanceTo(player.state.pos))[0];
      if (!player.combat.destroyed && target) {
        let error = Math.atan2(target.state.pos.x - player.state.pos.x, target.state.pos.z - player.state.pos.z) - player.state.yaw;
        error = Math.atan2(Math.sin(error), Math.cos(error));
        player.input.throttle = tick > 90 ? 1 : 0;
        player.input.steer = Math.max(-1, Math.min(1, error * 1.7));
        player.input.fire = tick % 200 === 150;
        player.input.aimPoint.set(target.state.pos.x + Math.sin(tick / 7) * 0.37, target.state.pos.y + 1.5, target.state.pos.z + 0.113);
      }
      // the key handlers between steps: a shell selection and back, a consumable
      if (tick === 300) rules.selectShell(player.combat, 1, player.spec);
      if (tick === 640) rules.selectShell(player.combat, 0, player.spec);
      if (tick === 900) rules.useSoloConsumable(player, bus, 0, game.timeS);
      // a bot's visual streams in: its measured footprint published on its next step
      if (tick === 120 && bot.visual) bot.visual.contactGeom = FOOTPRINT;
      recorder.beforeStep();
      simStep(game, bus, world, null, collider);
      recorder.afterStep();
      liveTrack.afterStep(game);
    }
    const finished = recorder.finish();
    assert.ok(finished, 'the battle produced a recording');
    return { finished, digest: replayStateDigest(game), tick: game.tick, kills, roster: game.tanks.map((hull) => hull.specId), track: liveTrack.finish() };
  } finally {
    world.release?.();
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage;
  }
}

function replay(recording) {
  const world = worldFor();
  const trace = createReplayTrace();
  const run = createReplayRun(recording, world, { beforeSimStep: (game, tick) => { if (tick === 1) trace.begin(game); } });
  let kills = 0;
  run.bus.on('tank:destroyed', () => { kills++; });
  try {
    while (run.step()) trace.afterStep(run.game);
    return { mismatch: run.mismatch, digest: replayStateDigest(run.game), tick: run.tick, kills, trace: JSON.parse(JSON.stringify(trace.export())) };
  } finally {
    run.dispose();
    world.release?.();
  }
}

const live = recordBattle();
// REPLAY_OUT=<path> keeps the recording, gzipped as a page saves it (tools/replay-verify.mjs reads it)
if (process.env.REPLAY_OUT) writeFileSync(process.env.REPLAY_OUT, gzipSync(live.finished.bytes));
const recording = decodeReplay(live.finished.bytes);
assert.equal(recording.header.setup.storage['cot.settings.v1'], JSON.stringify({ aiDifficulty: 'hard' }), 'the stored difficulty setup read is kept');
assert.ok(recording.actions.some((a) => a.kind === 'selectShell') && recording.actions.some((a) => a.kind === 'useSoloConsumable'),
  'the shell selections and the consumable are kept as seat actions');
assert.ok(recording.actions.some((a) => a.kind === 'footprint' && a.tick > 100), 'the streamed footprint is kept at its step');
assert.equal(recording.seatSteps.length, TICKS, 'one seat row per step');
assert.equal(recording.checksums.length, TICKS / 600, 'a checksum every 600 steps');

const again = replay(recording);
assert.equal(again.mismatch, null, `the replay holds: ${again.mismatch?.message}`);
assert.equal(again.tick, live.tick, 'the replay runs every recorded step');
assert.equal(again.digest, live.digest, 'the replay ends where the battle ended');
assert.equal(again.kills, live.kills, 'the same kills');
// the trace: a page's arrives as JSON; the replay's, taken at the same points, matches it in every number and every dump
const pageTrace = JSON.parse(JSON.stringify(live.finished.trace));
assert.deepEqual(traceRows(again.trace), traceRows(pageTrace), 'the trace\'s numbers match step for step');
for (const key of Object.keys(pageTrace.snapshots)) {
  assert.deepEqual(diffDumps(pageTrace.snapshots[key], again.trace.snapshots[key], 5), [], `the trace's dump after step ${key} matches`);
}

// the viewer's index (replayIndexer.ts) through the Worker's own job (replayIndexerWorker.ts, minus the message port): the
// file gzipped as a page saves it, the battle's collision records packed as a page sends them (here the committed shard
// the battle stepped on), the fleet loaded for the roster; its track is the one sampled live, number for number
const loader = createCollisionManifestLoader();
const progress = [];
const job = await runReplayIndexJob({ file: new Uint8Array(gzipSync(live.finished.bytes)).buffer, manifest: loader.get(MAP), terrainSeed: loader.terrainSeed },
  (reply) => progress.push(reply));
assert.equal(job.index.problem, null, `the index runs to the end: ${job.index.problem?.message}`);
assert.equal(job.index.indexedSteps, TICKS);
assert.ok(progress.length >= TICKS / 600 && progress.every((reply) => reply.type === 'progress'), 'the job reports its progress');
assert.deepEqual(job.index.track.hulls, live.track.hulls, 'the same hulls');
assert.equal(job.index.track.samples, live.track.samples, 'the same samples');
assert.ok(Buffer.from(job.index.track.data.buffer).equals(Buffer.from(live.track.data.buffer)), 'every hull\'s sampled pose and state matches the battle\'s');
assert.ok(Buffer.from(job.index.track.shellData.buffer).equals(Buffer.from(live.track.shellData.buffer))
  && Buffer.from(job.index.track.shellOffsets.buffer).equals(Buffer.from(live.track.shellOffsets.buffer)), 'every shell in flight matches');
assert.equal(job.transfer.length, 3, 'the track\'s three buffers are handed over, not copied');
// a recording from another build: refused before it runs, the timeline kept (Kevin's choice)
const foreign = decodeReplay(live.finished.bytes);
foreign.header.replayDigest = 'f00dfeedbeef';
foreign.header.build = 'v0.9.0+other';
// (Node is a 'dev' build, which admits every recording: the indexer stands for a release here)
const refused = indexReplay(foreign, worldFor(), { localDigest: '0123456789ab' });
assert.equal(refused.track, null, 'another build\'s recording has no track');
assert.equal(refused.problem?.code, 'refused');
assert.equal(refused.events.length, recording.events.length, 'and keeps its marks for the timeline');

// negative control: the throttle one unit (1/127) off at step 500 (an aim unit off while the turret slews at its rate
// limit changes nothing, rightly)
const bent = decodeReplay(live.finished.bytes);
bent.seatSteps[499][0].throttle -= 1;
const caught = replay(bent);
assert.ok(caught.mismatch instanceof ReplayMismatch && caught.mismatch.code === 'checksum' && caught.mismatch.tick <= 1200,
  `the throttle one unit off at step 500 is caught by the next checksum (${caught.mismatch?.message ?? 'not caught'})`);

const bytes = live.finished.bytes.length;
console.log(`replayRoundTrip.selftest: ${TICKS} steps on ${MAP} (${live.roster.length} hulls, ${live.kills} kills, ${recording.actions.length} actions, `
  + `${recording.events.length} marks) recorded in ${bytes} bytes (seats ${live.finished.seatBytes}); the replay matches every checksum and `
  + `ends on ${live.digest}; the indexer's Worker job tracks it identically (${live.track.samples} samples); another build's recording is refused with its marks kept; the throttle one unit off at step 500 is caught at step ${caught.mismatch.tick}`);
