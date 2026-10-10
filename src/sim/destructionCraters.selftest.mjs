// Craters (P3, docs/DESTRUCTION.md §7): a round that bursts on the ground digs a crater when the ruleset allows craters
// and the crater law gives at least 1.6 m — never on hard ground, at most four a tick and `maxCraters` a match —
// stamped on the match's ground quantized as the wire carries it, logged and handed back as an event; a smaller burst
// is a mark. A restored log stamps the same ground; both simulations dig at the same moment; the authority's real HE
// round on open ground digs one, every peer stamps it once (event or log), and the run replays bit for bit. Craters are
// off in every mode's ruleset until the drawn terrain follows the overlay.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CRATERS_PER_TICK, craterSeed, createDestructionMatch, quantizeCrater } from './destructionMatch.ts';
import { CRATER_DEFORM_MIN_RADIUS_M, craterFor, munitionChargeKg } from './munitionBlast.ts';
import { createTerrainDeformation } from './terrainDeformation.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createDestructionMirror } from '../mp/presentation/destructionMirror.ts';
import { quantizeDestructionEntry } from '../mp/wire/destructionLog.ts';
import { getSpec } from '../vehicles/specs.ts';

const RULES = Object.freeze({ structures: true, craters: true, sections: false, structureDamageScale: 1, craterScale: 1, maxCraters: 6 });
const he125 = { type: 'HE', caliberMm: 125 };
const he105 = { type: 'HE', caliberMm: 105 };
const howitzer = { type: 'HE', caliberMm: 105, blastRadiusM: 22, tracer: 'GUNSHIP' };
const noWorld = { obstacles: [], colliders: [] };

// ---- the dig: quantized, logged, an event; marks, hard ground, the caps
{
  const ground = createTerrainDeformation();
  const hard = (x) => (x > 100 ? 'hard' : 'medium');
  const match = createDestructionMatch({ rules: RULES, ...noWorld, ground, groundTypeAt: (x) => hard(x) });
  const shape = craterFor(munitionChargeKg(he125), 'he', 1, { radiusM: 0, depthM: 0, rimM: 0 });
  assert.ok(shape.radiusM >= CRATER_DEFORM_MIN_RADIUS_M, '125 mm HE digs');
  match.shellWorldHit(he125, null, 10.12345, 0, -20.98765, 0, 1, true);
  match.step();
  const events = [];
  assert.equal(match.drainCraters(events), 1);
  const [event] = events;
  assert.deepEqual(event, { craterId: 0, x: 10.123, z: -20.988, radiusM: Math.round(shape.radiusM * 100) / 100,
    depthM: Math.round(shape.depthM * 1000) / 1000, rimM: Math.round(shape.rimM * 1000) / 1000, seed: craterSeed(10.123, -20.988),
    munition: 'he', deforms: true }, 'quantized as the wire carries it');
  assert.deepEqual(match.log.at(-1), quantizeDestructionEntry(match.log.at(-1)), 'the log entry is its own wire form');
  // the one quantization every digger shares (the Studio's strips dig with it too)
  const { craterId: _id, munition: _m, deforms: _d, ...dug } = event;
  assert.deepEqual(quantizeCrater(10.12345, -20.98765, shape, {}), dug, 'quantizeCrater is the dig\'s own');
  assert.ok(ground.offsetAt(10.123, -20.988) < -0.5 * shape.depthM, `the bowl (${ground.offsetAt(10.123, -20.988).toFixed(3)} m)`);
  assert.equal(match.craters, 1);
  // a 105 mm round is a mark; a burst off the ground digs nothing; hard ground keeps its face
  match.shellWorldHit(he105, null, 40, 0, 40, 0, 1, true);
  match.shellWorldHit(he125, null, 60, 0, 60, 0, 1, false);
  match.shellWorldHit(he125, null, 150, 0, 0, 0, 1, true);
  match.step();
  assert.equal(match.drainCraters([]), 0, 'marks, an air or water burst and a road dig nothing');
  // four a tick, the fifth a mark; then the match's cap
  for (let i = 0; i < 6; i++) match.shellWorldHit(howitzer, null, -200 + i * 30, 0, 200, 0, 1, true);
  match.step();
  assert.equal(match.drainCraters([]), CRATERS_PER_TICK, `${CRATERS_PER_TICK} a tick`);
  for (let i = 0; i < 4; i++) match.shellWorldHit(howitzer, null, -200 + i * 30, 0, -200, 0, 1, true);
  match.step();
  assert.equal(match.drainCraters([]), 1, 'the match cap (6) stops the rest');
  assert.equal(match.craters, 6);
  // a restored log stamps the same ground and continues the count
  const restoredGround = createTerrainDeformation();
  const restored = createDestructionMatch({ rules: RULES, ...noWorld, ground: restoredGround });
  assert.equal(restored.restore(match.log), 6);
  assert.equal(restored.craters, 6);
  for (const [x, z] of [[10.123, -20.988], [11, -20], [-200, 200], [-170, 201], [5, 5]]) {
    assert.equal(restoredGround.offsetAt(x, z), ground.offsetAt(x, z), `the restored ground at ${x}, ${z}`);
  }
  // off in every mode until the terrain follows; a mode's rules dig nothing
  const standard = createDestructionMatch({ rules: matchRulesetFor('standard').destruction, ...noWorld, ground: createTerrainDeformation() });
  standard.shellWorldHit(howitzer, null, 0, 0, 0, 0, 1, true);
  standard.step();
  assert.equal(standard.drainCraters([]), 0, 'the standard ruleset digs nothing yet');
}

// ---- both simulations dig at the same moment
{
  const solo = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
  const authority = readFileSync(new URL('./authoritativeMatch.ts', import.meta.url), 'utf8');
  assert.match(solo, /const craterId = game\._destruction\?\.shellWorldHit\(shell\.spec, hit\.record, hit\.point\.x, hit\.point\.y, hit\.point\.z, _seg\.x, _seg\.z,\s*hit\.kind === 'terrain' && !hit\.record && !shellHitsWater\(world, hit\)\) \?\? null;/,
    'solo: a burst on dry ground (the crater it dug rides its munition:blast)');
  assert.match(authority, /const craterId = destruction\.shellWorldHit\([\s\S]{0,160}groundBurst\);\s*emitWorldShellImpact\(shell, worldHit, craterId\);/,
    'authority: the crater it dug rides its shell_impact');
  assert.match(authority, /const groundBurst = worldHit\.kind === 'terrain' && !worldHit\.record\s*&& !shellHitsWater\(\{ heightField \}, \{ kind: 'terrain', point: shell\.pos \}\);/,
    'authority: the same test');
  assert.match(solo, /destruction\.drainCraters\(craters\);\s*for \(const crater of craters\) bus\.emit\(DESTRUCTION_BUS_EVENTS\.crater, crater\);/, 'solo: terrain:crater');
  assert.match(authority, /destruction\.drainCraters\(craterEvents\);\s*for \(const event of craterEvents\) emit\('terrain_crater', \{ \.\.\.event \}\);/, 'authority: terrain_crater');
  for (const text of [solo, authority]) assert.match(text, /groundTypeAt: \(x, z\) => /, 'no crater on hard ground, alike');
  // the drawn ground and the decals follow the battle's overlay: bound per battle, a round's mirror on a network seat
  assert.match(solo, /ground\.overlay\.reset\(\);\s*world\.bindGroundOverlay\?\.\(ground\.overlay\);/, 'solo binds its ground');
  const presentation = readFileSync(new URL('../mp/presentation/battlePresentation.ts', import.meta.url), 'utf8');
  assert.match(presentation, /bindGroundOverlay\?\.\(destruction\.ground\);/, 'a network seat binds its mirror\'s ground');
  assert.match(presentation, /function dispose\(\): void \{\s*disposed = true;\s*\(worldCollision[^\n]*bindGroundOverlay\?\.\(null\);/, 'and unbinds it');
}

// ---- the authority, run for real: an HE round on open ground digs, every peer stamps it once, the run replays
function run(seed) {
  const ruleset = { ...matchRulesetFor('standard'), destruction: RULES };
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed, countdownS: 0, ruleset,
    players: [
      { id: 'gun', specId: 'm1a2', team: 'alpha', spawn: { x: -150, z: -150, yaw: 0 } },
      { id: 'far', specId: 'm1a2', team: 'bravo', spawn: { x: 150, z: 200, yaw: Math.PI } },
    ] });
  match.onMatchReady();
  // the HE round (slot 2), the gun depressed into open ground ahead
  const fire = new Map([['gun', { throttle: 0, steer: 0, brake: true, fire: true, aimYaw: 0, aimPitch: -0.12, shellSlot: 2 }]]);
  const craters = [], impacts = [];
  for (let i = 0; i < 600 && craters.length < 2; i++) {
    match.step({ dt: 1 / 60, inputs: fire });
    // the crater is public (the far side sees it); the impact is the shooter's to see
    for (const event of match.eventsForViewer('far')) if (event.type === 'terrain_crater') craters.push(event);
    for (const event of match.eventsForViewer('gun')) {
      if (event.type === 'shell_impact' && typeof event.craterId === 'number') impacts.push(event);
    }
    match.afterEventBroadcast();
  }
  const meta = match.snapshot({ tick: 0, serverTimeMs: 0, viewerId: 'far', ackInputSeq: null }).meta;
  return { craters, impacts, log: meta.destructionLog, height: (x, z) => match.heightField.getHeightAt(x, z) };
}
{
  const a = run(9);
  assert.ok(a.craters.length >= 1, 'the HE round dug a crater in open ground');
  const c = a.craters[0];
  assert.equal(c.munition, 'he');
  assert.ok(Math.abs(c.radiusM - craterFor(munitionChargeKg(getSpec('m1a2').gun.shells[2]), 'he', 1, { radiusM: 0, depthM: 0, rimM: 0 }).radiusM) < 0.006);
  assert.deepEqual(a.log.filter((e) => e.kind === 'crater').map((e) => e.craterId), a.craters.map((e) => e.craterId), 'logged in order');
  assert.deepEqual(a.impacts.map((e) => e.craterId), a.craters.map((e) => e.craterId), 'each crater rides the impact that dug it');
  assert.ok(a.impacts.every((e, i) => Math.abs(e.x - a.craters[i].x) < 0.001 && Math.abs(e.z - a.craters[i].z) < 0.001));
  const b = run(9);
  assert.deepEqual(JSON.stringify(b.log), JSON.stringify(a.log), 'the run replays bit for bit, its craters included');
  assert.equal(b.height(c.x, c.z), a.height(c.x, c.z));
  // a peer: the live event stamps its prediction ground once; the log names the same crater and stamps nothing more
  const flat = { getHeightAt: () => 0, getHeightAtFast: () => 0, getContactHeightAt: () => 0, getNormalAt: () => null, maxY: 1 };
  const bus = [];
  const mirror = createDestructionMirror({ heightField: flat, getObstacles: () => [], getColliders: () => [] },
    { emit: (type, payload) => bus.push({ type, payload }) });
  assert.equal(mirror.applyCraterEvent({ ...c }), true);
  mirror.applyLog(a.log, null, null);
  assert.equal(mirror.applyCraterEvent({ ...c }), false, 'once');
  const live = bus.filter((e) => e.type === 'terrain:crater');
  assert.equal(live[0].payload.settled, undefined, 'the live crater animates');
  assert.equal(live.filter((e) => e.payload.craterId === c.craterId).length, 1, 'stamped once');
  assert.ok(mirror.groundField.getHeightAt(c.x, c.z) < -0.5 * c.depthM, 'the prediction rides the bowl');
  // a late joiner: the log lays every crater down settled, except one whose event is still owed
  const late = [];
  const joiner = createDestructionMirror({ heightField: flat, getObstacles: () => [], getColliders: () => [] },
    { emit: (type, payload) => late.push({ type, payload }) });
  joiner.applyLog(a.log, null, (id) => id === c.craterId);
  assert.equal(late.length, a.craters.length - 1, 'an owed crater waits for its event');
  joiner.applyCraterEvent({ ...c });
  joiner.applyLog(a.log, null, () => false);
  assert.equal(late.filter((e) => e.payload.craterId === c.craterId && !e.payload.settled).length, 1, 'and animates when it comes');
  // the drawn ground follows a crater dug mid-clip in the Studio's offline export too (wave 273: an export step and a
  // capture ran no world update, so the bowl and its cleared cover never reached the picture)
  {
    const { readFileSync } = await import('node:fs');
    const studio = readFileSync(new URL('../game/studio.ts', import.meta.url), 'utf8');
    const map = readFileSync(new URL('../world/map.ts', import.meta.url), 'utf8');
    // (fix/studio-world-step: every Studio step syncs, a capture through its stepFx(0); studioWorldStep.selftest runs it)
    assert.equal(studio.split('getWorld()?.syncGround?.()').length - 1, 1, 'one sync, in the Studio\'s step');
    assert.match(map, /function followGroundCover\(\): void \{\s*groundCoverCraters\.sync\(boundGroundOverlay\);/,
      'the cover follows the bound overlay');
    assert.match(map, /terrain\.userData\.followGroundOverlay = followGroundCover;/,
      'as the terrain\'s followGroundOverlay hook, which world.syncGround runs after the terrain\'s own');
  }
  console.log(`destructionCraters: dig law, marks, hard ground, ${CRATERS_PER_TICK} a tick and the match cap, quantized log `
    + `and restore; both sims alike; a real HE round dug crater ${c.craterId} (r ${c.radiusM} m, ${c.depthM} m deep) on Verdant, `
    + 'stamped once on a peer (event or log), replayed bit for bit; off in every mode until the terrain follows PASS');
}
