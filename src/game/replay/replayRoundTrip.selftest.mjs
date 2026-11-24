// A solo battle recorded and replayed (replay-system-275, docs/REPLAY.md §1-§4): the page's own setup and step, the
// recorder's taps as main.ts wires them (the seat stage before each step, the rules port, the bus), and the replayer
// stepping the recording alone on a fresh world. Must match: every checksum, the final digest, the step count and the
// kills. Exercises what the page does besides the controls: a footprint streamed in mid-battle (a bot's visual
// arriving), a shell selection, a consumable, a stored difficulty and loadout read through localStorage.
// Negative control: one seat control's throttle one unit off at step 500 is caught at the next checksum.
// Then a training battle the tutorial changes between steps (battleActions.ts): whenSeen Sentry 3 cued, a checkpoint, the
// chapter's end, replayed round for round; the recording without its cue parts from the battle (its control).
// A page import, a world and a fleet: MANUAL suite 'sims' (tools/selftest-tiers.mjs), beside twinMuzzleSolo.
//
// Bounded (2026-11-22: an unbounded run reached 14 GiB resident and pushed the Mac into 43 GB of swap): the body runs in
// a worker_threads Worker with an old-generation limit, the main thread samples the whole process's resident memory every
// 100 ms and stops the Worker past RSS_CAP (typed arrays and buffers live outside the heap limit), and the body checks
// its own array buffers and external memory at every phase. The receipt prints the peak.
import assert from 'node:assert/strict';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';

const RSS_CAP = 1 * 2 ** 30;
const BUFFER_CAP = 0.5 * 2 ** 30;
const HEAP_MB = 1024;
const gib = (bytes) => `${(bytes / 2 ** 30).toFixed(2)} GiB`;

if (isMainThread) {
  const worker = new Worker(new URL(import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: HEAP_MB } });
  let peak = process.memoryUsage.rss(), peakPhase = 'start', phase = 'start', summary = null, failure = null;
  const phases = [];
  const sampler = setInterval(() => {
    const rss = process.memoryUsage.rss();
    if (rss > peak) { peak = rss; peakPhase = phase; }
    if (rss > RSS_CAP && !failure) { failure = `resident memory ${gib(rss)} passed the cap ${gib(RSS_CAP)} during '${phase}'`; void worker.terminate(); }
  }, 100);
  worker.on('message', (message) => {
    if (message.phase) { phase = message.phase; phases.push(`${message.phase} rss ${gib(message.rss)} buffers ${gib(message.arrayBuffers + message.external)}`); }
    if (message.summary) summary = message.summary;
  });
  worker.on('error', (error) => { failure ??= error.stack ?? String(error); });
  await new Promise((resolve) => worker.on('exit', resolve));
  clearInterval(sampler);
  if (failure || !summary) {
    console.error(phases.join('\n'));
    throw new Error(`replayRoundTrip.selftest: ${failure ?? 'the body ended without a summary'}`);
  }
  console.log(`${summary}; peak resident memory ${gib(peak)} (during '${peakPhase}', cap ${gib(RSS_CAP)})`);
} else {
  const mark = (phase) => {
    const usage = process.memoryUsage();
    if (usage.arrayBuffers + usage.external > BUFFER_CAP) throw new Error(`array buffers and external memory ${gib(usage.arrayBuffers + usage.external)} passed ${gib(BUFFER_CAP)} at '${phase}'`);
    parentPort.postMessage({ phase, rss: usage.rss, arrayBuffers: usage.arrayBuffers, external: usage.external });
  };
  await body(mark);
}

async function body(mark) {
const { writeFileSync } = await import('node:fs');
const { gzipSync } = await import('node:zlib');
const { Group } = await import('three');
const { ensureAuthorityFleet } = await import('../../vehicles/authorityFleet.ts');
const { createBus, createCollider, createGameState, cueTrainingActor, finishTrainingBattle, setTrainingCheckpoint, setupBattle, simStep } = await import('../state.ts');
const { TRAINING_RULES, trainingActor } = await import('../../sim/trainingGround.ts');
const { planBattleParticipantIds, spawnTanks } = await import('../rosterState.ts');
const { soloRosterPlan } = await import('../soloRosterPlan.ts');
const { useSoloConsumable } = await import('../soloConsumables.ts');
const { selectShell } = await import('../../sim/damage.ts');
const { decodeReplay } = await import('../../sim/replayFormat.ts');
const { createReplayRecorder } = await import('./replayRecorder.ts');
const { createReplayRun, ReplayMismatch, withLayoutSpawnPoints } = await import('./replayRunner.ts');
const { replayStateDigest } = await import('./replayChecksum.ts');
const { createReplayTrace, diffDumps, traceRows, traceRounds, firstRoundDifference, TRACE_ROUND_FIELDS } = await import('./replayTrace.ts');
const { createReplayTrackBuilder } = await import('./replayTrack.ts');
const { indexReplay } = await import('./replayIndexer.ts');
const { runReplayIndexJob } = await import('./replayIndexerWorker.ts');
const { createCollisionManifestLoader } = await import('../../../server/collisionManifestLoader.ts');
const { createDedicatedWorldCollision } = await import('../../../server/dedicatedWorldCollision.ts');
mark('imports');

const MAP = 'verdant';
const SPEC = 'm1a1_abrams_hc';
const TICKS = 4800;

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

async function recordBattle() {
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
    // the roster's anatomy, planned as battle entry plans it before setup (main.ts planRoster), and only its: every saved
    // spec's was 0.41 GiB of this receipt's 1.05 GiB peak. (A replay that finalized only TANK_IDS, the three starters,
    // stepped every other hull on an unfinished spec and drifted from the page; the replayer refuses an unloaded roster.)
    const plan = soloRosterPlan(null, null, true);
    const planned = planBattleParticipantIds(game, SPEC, true, plan.nations, plan.slots, plan.formationLead, plan.national, plan.exact);
    await ensureAuthorityFleet([SPEC, ...planned]);
    mark('fleet');
    const options = { random: true, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false };
    recorder.trace = true; // the divergence trace (replayTrace.ts): the replay's must match it number for number, dump for dump
    recorder.beginSetup(game, SPEC, options);
    setupBattle(game, SPEC, world, options);
    recorder.endSetup();
    game.phase = 'battle'; // the page steps a battle in its battle phase (main.ts enters it after setup), as the replay does
    assert.ok(recorder.active, 'the recorder armed for the battle');
    assert.ok(game.tanks.every((hull) => planned.includes(hull.specId)), 'setup seated the planned roster');
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
      if (tick % 600 === 599) mark(`recording step ${tick + 1}`);
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
    while (run.step()) { trace.afterStep(run.game); if (run.tick % 1200 === 0) mark(`replay step ${run.tick}`); }
    return { mismatch: run.mismatch, digest: replayStateDigest(run.game), tick: run.tick, kills, trace: JSON.parse(JSON.stringify(trace.export())) };
  } finally {
    run.dispose();
    world.release?.();
  }
}

const live = await recordBattle();
mark('recorded');
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
mark('replayed');
assert.ok(again.mismatch === null, `the replay holds: ${again.mismatch?.message}`);
assert.equal(again.tick, live.tick, 'the replay runs every recorded step');
assert.equal(again.digest, live.digest, 'the replay ends where the battle ended');
assert.equal(again.kills, live.kills, 'the same kills');
// the trace: a page's arrives as JSON; the replay's, taken at the same points, matches it in every number and every dump
const pageTrace = JSON.parse(JSON.stringify(live.finished.trace));
// (big arrays compared here, a boolean asserted: a failing assert inspects its operands with no array-length limit and
// diffs them, which turned one failure on a whole track into 14 GiB resident)
const sameBytes = (a, b) => a.byteLength === b.byteLength && Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
assert.ok(sameBytes(traceRows(again.trace), traceRows(pageTrace)), 'the trace\'s numbers match step for step');
for (const key of Object.keys(pageTrace.snapshots)) {
  assert.deepEqual(diffDumps(pageTrace.snapshots[key], again.trace.snapshots[key], 5), [], `the trace's dump after step ${key} matches`);
}
// (276 sim-det-trig, Main's ruling (a)) every live round's numbers after every step match too, and a round that parts is
// named at the step it parts, by field: a velocity one ulp off and a round only one side has, planted
const pageRounds = traceRounds(pageTrace), replayRounds = traceRounds(again.trace);
const ROUND_WIDTH = TRACE_ROUND_FIELDS.length;
assert.ok(pageRounds.length >= ROUND_WIDTH * 100, `the trace keeps the live rounds (${pageRounds.length / ROUND_WIDTH} records)`);
assert.ok(sameBytes(replayRounds, pageRounds), `every live round's numbers match step for step (${firstRoundDifference(pageRounds, replayRounds)})`);
assert.equal(firstRoundDifference(pageRounds, replayRounds), null, 'no round parts');
const plantAt = Math.floor(pageRounds.length / ROUND_WIDTH / 2) * ROUND_WIDTH;
const nudged = pageRounds.slice();
const vx = TRACE_ROUND_FIELDS.indexOf('vx');
nudged[plantAt + vx] = nudged[plantAt + vx] + Math.abs(nudged[plantAt + vx]) * Number.EPSILON || Number.MIN_VALUE;
const plantedStep = pageRounds[plantAt], plantedId = pageRounds[plantAt + 1];
const named = firstRoundDifference(pageRounds, nudged) ?? '';
assert.ok(named.startsWith(`after step ${plantedStep}: round ${plantedId}: vx`), `control: a velocity one ulp off is named at its step (${named})`);
const dropped = new Float64Array([...pageRounds.subarray(0, plantAt), ...pageRounds.subarray(plantAt + ROUND_WIDTH)]);
const missing = firstRoundDifference(pageRounds, dropped) ?? '';
assert.ok(missing === `after step ${plantedStep}: round ${plantedId} is only on the page`, `control: a round only one side has is named (${missing})`);

// the viewer's index (replayIndexer.ts) through the Worker's own job (replayIndexerWorker.ts, minus the message port): the
// file gzipped as a page saves it, the battle's collision records packed as a page sends them (here the committed shard
// the battle stepped on), the fleet loaded for the roster; its track is the one sampled live, number for number
mark('indexing');
const loader = createCollisionManifestLoader();
const progress = [];
const job = await runReplayIndexJob({ file: new Uint8Array(gzipSync(live.finished.bytes)).buffer, manifest: loader.get(MAP), terrainSeed: loader.terrainSeed },
  (reply) => { progress.push(reply); mark(`index step ${reply.tick}`); });
assert.ok(job.index.problem === null, `the index runs to the end: ${job.index.problem?.message}`);
assert.equal(job.index.indexedSteps, TICKS);
assert.ok(progress.length >= TICKS / 600 && progress.every((reply) => reply.type === 'progress'), 'the job reports its progress');
assert.deepEqual(job.index.track.hulls, live.track.hulls, 'the same hulls');
assert.equal(job.index.track.samples, live.track.samples, 'the same samples');
assert.ok(sameBytes(job.index.track.data, live.track.data), 'every hull\'s sampled pose and state matches the battle\'s');
assert.ok(sameBytes(job.index.track.shellData, live.track.shellData) && sameBytes(job.index.track.shellOffsets, live.track.shellOffsets),
  'every shell in flight matches');
assert.equal(job.transfer.length, 3, 'the track\'s three buffers are handed over, not copied');
mark('indexed');
// a recording from another build: refused before it runs, the timeline kept (Kevin's choice)
const foreign = decodeReplay(live.finished.bytes);
foreign.header.replayDigest = 'f00dfeedbeef';
foreign.header.build = 'v0.9.0+other';
// (Node is a 'dev' build, which admits every recording: the indexer stands for a release here)
const refusedWorld = worldFor();
const refused = indexReplay(foreign, refusedWorld, { localDigest: '0123456789ab' });
refusedWorld.release?.();
assert.ok(refused.track === null, `another build's recording has no track (it indexed ${refused.indexedSteps} steps)`);
assert.equal(refused.problem?.code, 'refused');
assert.equal(refused.events.length, recording.events.length, 'and keeps its marks for the timeline');

// negative control: the throttle one unit (1/127) off at step 500 (an aim unit off while the turret slews at its rate
// limit changes nothing, rightly)
const bent = decodeReplay(live.finished.bytes);
bent.seatSteps[499][0].throttle -= 1;
const caught = replay(bent);
mark('negative control');
assert.ok(caught.mismatch instanceof ReplayMismatch && caught.mismatch.code === 'checksum' && caught.mismatch.tick <= 1200,
  `the throttle one unit off at step 500 is caught by the next checksum (${caught.mismatch?.message ?? 'not caught'})`);

// a training battle (docs/REPLAY.md §2, battleActions.ts): the tutorial's calls change it between steps. Sentry 3 is a
// whenSeen shooter: cued (through the recorder's wrapper, as main.ts's tutorial port cues it) it fires only once it has
// seen the player for its seenS, so the cue, the sight clock the step runs on the battle's ground, and its rounds must
// all replay. The player drives toward it until it fires, a ring reached is the checkpoint, and the chapter's end is the
// battle's quiet verdict. Without the cue in the recording the replay parts from the battle (the control).
const TRAINING_TICKS = 3000;
const SENTRY3 = trainingActor(TRAINING_RULES, 'sentry3');
async function recordTraining() {
  const world = worldFor();
  const recorder = createReplayRecorder({ storageProto: FakeStorage.prototype, storage: new FakeStorage({}), now: () => 0 });
  try {
    const game = createGameState({ rosterSeed: TRAINING_RULES.seed });
    game.mapId = TRAINING_RULES.mapId;
    game.gameMode = 'training';
    spawnTanks(game, { scene: { remove() {} } });
    for (const hull of game.allTanks) if (hull) hull.visual = { root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() {}, setDestroyed() {}, resetDestroyed() {} };
    const spec = TRAINING_RULES.loanerSpecId;
    const plan = soloRosterPlan('training', null, true);
    const planned = planBattleParticipantIds(game, spec, true, plan.nations, plan.slots, plan.formationLead, plan.national, plan.exact);
    await ensureAuthorityFleet([spec, ...planned]);
    mark('training fleet');
    const options = { gameMode: 'training', random: true, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false };
    recorder.beginSetup(game, spec, options);
    setupBattle(game, spec, world, options);
    recorder.endSetup();
    game.phase = 'battle';
    assert.ok(game.ruleset.training && recorder.active, 'a training battle, recorded');
    const bus = createBus((type, payload) => recorder.onEvent(type, payload));
    const collider = createCollider(game, world);
    const tutorial = recorder.wrapBattleRules({ cueTrainingActor, setTrainingCheckpoint, finishTrainingBattle });
    const player = game.player;
    const sentry = game.tanks.find((hull) => hull.specId === SENTRY3.specId);
    assert.ok(sentry, 'Sentry 3 is on the roster');
    const fired = [];
    bus.on('shell:fired', (event) => { if (event.shooterId === sentry.id) fired.push(game.tick); });
    let seenFrom = null, checkpointAt = null;
    for (let tick = 0; tick < TRAINING_TICKS; tick++) {
      if (tick === 60) assert.ok(tutorial.cueTrainingActor(game, 'sentry3', true), 'Sentry 3 takes its cue');
      const toSentry = Math.hypot(sentry.state.pos.x - player.state.pos.x, sentry.state.pos.z - player.state.pos.z);
      if (!player.combat.destroyed) {
        let error = Math.atan2(sentry.state.pos.x - player.state.pos.x, sentry.state.pos.z - player.state.pos.z) - player.state.yaw;
        error = Math.atan2(Math.sin(error), Math.cos(error));
        const closing = fired.length === 0 && toSentry > 45;
        player.input.throttle = tick > 90 && closing ? 1 : 0;
        player.input.brake = !closing;
        player.input.steer = closing ? Math.max(-1, Math.min(1, error * 1.7)) : 0;
        player.input.fire = false;
      }
      // a ring reached: the tutorial hands the battle its checkpoint (the ring's own point)
      if (checkpointAt === null && tick > 90 && toSentry < 90) {
        checkpointAt = tick;
        assert.ok(tutorial.setTrainingCheckpoint(game, Math.round(player.state.pos.x), Math.round(player.state.pos.z)), 'the checkpoint is set');
      }
      if (tick === TRAINING_TICKS - 30) assert.ok(tutorial.finishTrainingBattle(game), 'the chapter ends the battle');
      recorder.beforeStep();
      simStep(game, bus, world, null, collider);
      recorder.afterStep();
      if (seenFrom === null && game._trainingSeenSince?.has('sentry3')) seenFrom = tick;
      if (tick % 600 === 599) mark(`training step ${tick + 1}`);
    }
    const finished = recorder.finish();
    assert.ok(finished, 'the training battle produced a recording');
    return { finished, digest: replayStateDigest(game), tick: game.tick, fired, seenFrom, checkpointAt, result: game.result, sentryId: sentry.id };
  } finally {
    world.release?.();
  }
}
function replayTraining(recording, sentryId) {
  const world = worldFor();
  const run = createReplayRun(recording, world);
  const fired = [];
  run.bus.on('shell:fired', (event) => { if (event.shooterId === sentryId) fired.push(run.game.tick); });
  try {
    while (run.step()) { if (run.tick % 1200 === 0) mark(`training replay step ${run.tick}`); }
    return { mismatch: run.mismatch, digest: replayStateDigest(run.game), tick: run.tick, fired, result: run.game.result };
  } finally {
    run.dispose();
    world.release?.();
  }
}
const training = await recordTraining();
mark('training recorded');
const trainingRecording = decodeReplay(training.finished.bytes);
const battleActions = trainingRecording.actions.filter((action) => action.seat === -1 && action.kind !== 'footprint');
assert.deepEqual(battleActions.map((action) => action.kind), ['cueTrainingActor', 'setTrainingCheckpoint', 'finishTrainingBattle'],
  'the cue, the checkpoint and the end are kept as the battle\'s own actions');
assert.deepEqual([battleActions[0].key, battleActions[0].args, battleActions[0].tick], ['sentry3', [1], 61], 'the cue keeps its actor and its step');
// (the cue is made before the step of loop tick 60, so that step is the first that can see the player)
assert.ok(training.seenFrom !== null && training.seenFrom >= 60, `Sentry 3's sight clock ran once cued (from step ${training.seenFrom})`);
assert.ok(training.fired.length >= 1 && training.fired[0] - training.seenFrom >= SENTRY3.volley.seenS * 60 - 1,
  `and it fired only after ${SENTRY3.volley.seenS} s in sight (rounds at ${training.fired.join(', ')})`);
assert.equal(training.result, 'victory', 'the chapter\'s end is the battle\'s verdict');
const trainingAgain = replayTraining(trainingRecording, training.sentryId);
mark('training replayed');
assert.ok(trainingAgain.mismatch === null, `the training replay holds: ${trainingAgain.mismatch?.message}`);
assert.equal(trainingAgain.tick, training.tick, 'every recorded step');
assert.equal(trainingAgain.digest, training.digest, 'the training replay ends where the battle ended');
assert.deepEqual(trainingAgain.fired, training.fired, 'Sentry 3 fires the same rounds at the same steps');
assert.equal(trainingAgain.result, 'victory', 'and the replay reaches the same verdict');
// the control: the recording without its cue never wakes Sentry 3, and the replay parts from the battle
const uncued = decodeReplay(training.finished.bytes);
uncued.actions = uncued.actions.filter((action) => action.kind !== 'cueTrainingActor');
const uncuedRun = replayTraining(uncued, training.sentryId);
mark('training control');
assert.ok(uncuedRun.mismatch !== null || uncuedRun.digest !== training.digest, 'control: without its cue the replay parts from the battle');
assert.deepEqual(uncuedRun.fired, [], 'control: and Sentry 3 never fires');

const bytes = live.finished.bytes.length;
parentPort.postMessage({ summary: `replayRoundTrip.selftest: ${TICKS} steps on ${MAP} (${live.roster.length} hulls, ${live.kills} kills, ${recording.actions.length} actions, `
  + `${recording.events.length} marks) recorded in ${bytes} bytes (seats ${live.finished.seatBytes}); the replay matches every checksum and `
  + `ends on ${live.digest}; the indexer's Worker job tracks it identically (${live.track.samples} samples); another build's recording is refused with its marks kept; the throttle one unit off at step 500 is caught at step ${caught.mismatch.tick}; every live round matches step for step (${pageRounds.length / ROUND_WIDTH} records) and a round one ulp off or missing is named at its step; `
  + `a training battle (Sentry 3 cued, seen from step ${training.seenFrom}, ${training.fired.length} round(s), a checkpoint, the chapter's end) replays round for round, and without its cue parts (${uncuedRun.mismatch?.message ?? 'a different end'})` });
}
