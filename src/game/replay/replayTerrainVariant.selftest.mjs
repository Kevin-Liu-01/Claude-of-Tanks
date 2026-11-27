// A replay of a battle on a mode's battlefield variant (replay-receipts-279; live 276-278: every Frontline Assault replay
// stopped at 0:10, "the battle played out differently here"). The indexer Worker built its height field from the map
// alone, while the battle stepped on its mode's variant (Frontline Assault's 'assault-trenches': trenches carved into the
// field), so the re-simulation left the battle before its first checksum.
//
// For EVERY battle mode with a terrain variant (sim/matchRuleset.ts terrainVariantFor), a solo battle on that variant's
// world is recorded for 1200 steps (two checksums) and must hold three ways: replayed headless on the variant's world,
// indexed through the Worker's own job (replayIndexerWorker.ts runReplayIndexJob, the variant's manifest as the page sends
// its world's) with its track equal to the battle's own, byte for byte, and recordedTerrainVariant naming the variant.
// Control: the Worker's world as it was built before the fix (the map's field without the variant, the same manifest)
// trips at step 600, the first checksum. A page import, a world and a roster's anatomy: MANUAL suite 'sims'.
//
// Bounded as replayRoundTrip is: the body runs in a worker_threads Worker under an old-generation limit, and the main
// thread stops it past RSS_CAP of resident memory.
import assert from 'node:assert/strict';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';

const RSS_CAP = 1.5 * 2 ** 30;
const gib = (bytes) => `${(bytes / 2 ** 30).toFixed(2)} GiB`;

if (isMainThread) {
  const worker = new Worker(new URL(import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: 1024 } });
  let peak = process.memoryUsage.rss(), failure = null;
  const lines = [];
  const sampler = setInterval(() => {
    const rss = process.memoryUsage.rss();
    peak = Math.max(peak, rss);
    if (rss > RSS_CAP && !failure) { failure = `resident memory ${gib(rss)} passed the cap ${gib(RSS_CAP)}`; void worker.terminate(); }
  }, 100);
  worker.on('message', (line) => lines.push(line));
  worker.on('error', (error) => { failure ??= error.stack ?? String(error); });
  await new Promise((resolve) => worker.on('exit', resolve));
  clearInterval(sampler);
  if (failure || !lines.some((line) => line.startsWith('PASS'))) throw new Error(`replayTerrainVariant.selftest: ${failure ?? lines.join('\n')}`);
  console.log(`${lines.join('\n')}; peak resident memory ${gib(peak)}`);
} else {
  await body((line) => parentPort.postMessage(line));
}

async function body(say) {
  const { gzipSync } = await import('node:zlib');
  const { Group } = await import('three');
  const { ensureAuthorityFleet } = await import('../../vehicles/authorityFleet.ts');
  const { createBus, createCollider, createGameState, setupBattle, simStep } = await import('../state.ts');
  const { planBattleParticipantIds, spawnTanks } = await import('../rosterState.ts');
  const { soloRosterPlan } = await import('../soloRosterPlan.ts');
  const { BATTLE_MODE_IDS } = await import('../../sim/gameModeCatalog.ts');
  const { terrainVariantFor } = await import('../../sim/matchRuleset.ts');
  const { decodeReplay } = await import('../../sim/replayFormat.ts');
  const { createReplayRecorder } = await import('./replayRecorder.ts');
  const { createReplayRun, withLayoutSpawnPoints } = await import('./replayRunner.ts');
  const { replayStateDigest } = await import('./replayChecksum.ts');
  const { recordedTerrainVariant } = await import('./replaySetup.ts');
  const { createReplayTrackBuilder } = await import('./replayTrack.ts');
  const { indexReplay } = await import('./replayIndexer.ts');
  const { runReplayIndexJob } = await import('./replayIndexerWorker.ts');
  const { createHeadlessCollisionWorld } = await import('../../world/headlessCollisionWorld.ts');
  const { createHeightField } = await import('../../world/terrain.ts');
  const { getMapConfig } = await import('../../world/maps/index.ts');
  const { createCollisionManifestLoader } = await import('../../../server/collisionManifestLoader.ts');
  const { createDedicatedWorldCollision } = await import('../../../server/dedicatedWorldCollision.ts');

  const MAP = 'monsoon'; // the live report's map (Reddit lane, 2026-11-26)
  const SPEC = 't90m';
  const TICKS = 1200;
  const variantModes = BATTLE_MODE_IDS.filter((mode) => terrainVariantFor(mode) !== null);
  assert.ok(variantModes.includes('frontline_assault'), `the variant modes include Frontline Assault (${variantModes})`);
  const loader = createCollisionManifestLoader();
  const stub = () => ({ root: new Group(), setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() {}, setDestroyed() {}, resetDestroyed() {} });
  const sameBytes = (a, b) => a.byteLength === b.byteLength && Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
  class FakeStorage { constructor() { this.v = new Map(); } getItem(k) { return this.v.get(k) ?? null; } setItem(k, x) { this.v.set(k, String(x)); } removeItem(k) { this.v.delete(k); } }

  for (const mode of variantModes) {
    const variant = terrainVariantFor(mode);
    const worldFor = () => withLayoutSpawnPoints(createDedicatedWorldCollision(MAP, { retain: true, variant }));
    // the battle: recorded on the variant's world, driven and firing, its track sampled live
    const storage = new FakeStorage();
    const world = worldFor();
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
    let finished, liveTrack, liveDigest;
    try {
      const recorder = createReplayRecorder({ storageProto: FakeStorage.prototype, storage, now: () => 0 });
      const game = createGameState({ rosterSeed: 777 });
      game.mapId = MAP;
      spawnTanks(game, { scene: { remove() {} } });
      for (const hull of game.allTanks) if (hull) hull.visual = stub();
      const plan = soloRosterPlan(mode, null, true);
      await ensureAuthorityFleet([SPEC, ...planBattleParticipantIds(game, SPEC, true, plan.nations, plan.slots, plan.formationLead, plan.national, plan.exact)]);
      const options = { random: true, gameMode: mode, deferVisuals: true, deferCamoRepaint: true, deferOpeningRoutes: false };
      recorder.beginSetup(game, SPEC, options);
      setupBattle(game, SPEC, world, options);
      recorder.endSetup();
      game.phase = 'battle';
      for (const hull of game.tanks) hull.visual ??= stub();
      assert.ok(world.heightField.assaultTrenchLines?.lines?.length > 0 || variant !== 'assault-trenches', `${mode}: the battle's world carries its trenches`);
      const bus = createBus((type, payload) => recorder.onEvent(type, payload));
      const collider = createCollider(game, world);
      const builder = createReplayTrackBuilder(game);
      const player = game.player;
      for (let tick = 0; tick < TICKS; tick++) {
        if (!player.combat.destroyed) { player.input.throttle = tick > 60 ? 1 : 0; player.input.steer = Math.sin(tick / 90) * 0.6; player.input.fire = tick % 120 === 100; }
        recorder.beforeStep(); simStep(game, bus, world, null, collider); recorder.afterStep();
        builder.afterStep(game);
      }
      finished = recorder.finish();
      liveTrack = builder.finish();
      liveDigest = replayStateDigest(game);
    } finally {
      world.release?.();
      delete globalThis.localStorage;
    }
    const recording = decodeReplay(finished.bytes);
    assert.equal(recording.checksums.length, TICKS / 600, `${mode}: a checksum every 600 steps`);
    assert.equal(recordedTerrainVariant(recording.header), variant, `${mode}: the recording names its battlefield's variant`);

    // 1. headless, on the variant's world
    const headlessWorld = worldFor();
    const run = createReplayRun(recording, headlessWorld);
    try { while (run.step()); } finally { run.dispose(); headlessWorld.release?.(); }
    assert.equal(run.mismatch, null, `${mode}: the headless replay holds (${run.mismatch?.message})`);
    assert.equal(run.tick, TICKS);
    assert.equal(replayStateDigest(run.game), liveDigest, `${mode}: the headless replay ends where the battle ended`);

    // 2. the Worker's own job, the variant's manifest as the page sends its world's
    const file = new Uint8Array(gzipSync(finished.bytes)).buffer;
    const manifest = loader.get(MAP, variant);
    const job = await runReplayIndexJob({ file, manifest, terrainSeed: loader.terrainSeed }, () => {});
    assert.equal(job.index.problem, null, `${mode}: the Worker's index holds every checksum (${job.index.problem?.message})`);
    assert.equal(job.index.indexedSteps, TICKS);
    assert.equal(job.index.track.samples, liveTrack.samples);
    assert.ok(sameBytes(job.index.track.data, liveTrack.data), `${mode}: every hull's sample matches the battle's`);
    assert.ok(sameBytes(job.index.track.shellOffsets, liveTrack.shellOffsets) && sameBytes(job.index.track.shellData, liveTrack.shellData),
      `${mode}: every shell in flight matches the battle's`);

    // control: the Worker's world as built before the fix (the map's field, no variant) leaves the battle at step 600
    const flat = withLayoutSpawnPoints(createHeadlessCollisionWorld({ mapId: MAP, heightField: createHeightField(loader.terrainSeed, getMapConfig(MAP)), manifest }));
    const control = indexReplay(recording, flat);
    assert.equal(control.problem?.code, 'checksum', `control: ${mode} indexed on the map's field without its variant must drift (${JSON.stringify(control.problem)})`);
    assert.equal(control.problem.tick, 600, `control: ${mode} drifts at its first checksum`);
    say(`${mode} on ${MAP} (${variant}): ${TICKS} steps, ${recording.header.roster.length} hulls; headless and Worker hold, track equal; control drifts at ${control.problem.tick}`);
  }
  say(`PASS replayTerrainVariant: ${variantModes.length} variant mode(s) (${variantModes.join(', ')}) replay on their battlefield`);
}
