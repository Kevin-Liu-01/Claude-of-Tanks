// Sections in the authority, run for real (destruction P2, docs/DESTRUCTION.md §3.4, §6). A 24 × 6 m house in a headless
// collision world (the dedicated hosts' facade: shells and sight trace its colliders) on verdant's ground, an M1A2 30 m
// short of its south wall:
//   - shell through a hole: with sections on, its HE round opens a hole where it strikes; its APFSDS round, fired along
//     the same line, passes that hole, crosses the room and strikes the north wall from inside (opening a penetrator's
//     hole there); with sections off the second round stops on the south wall like the first. The run replays bit for bit.
//   - sight through holes: the spotting system the authority runs, over the same world, does not see a hull 30 m behind
//     the house, nor through one hole; with holes on both walls on its line of sight it does.
//   - both sims: the solo world's raycast and the headless one run the same narrow phase, and both steps publish breaches.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { createDestructionMatch } from './destructionMatch.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { createSpottingSystem } from './spotting.ts';
import { penetratorHoleRadiusM } from './munitionBlast.ts';
import { blastHoleRadiusM } from './structureSections.ts';
import { setCompoundShape, setObbShape } from '../world/collision.ts';
import { createHeadlessCollisionWorld } from '../world/headlessCollisionWorld.ts';
import { packCollisionRecord } from '../../tools/headlessWorldCollision.mjs';
import { getSpec } from '../vehicles/specs.ts';

const standard = matchRulesetFor('standard');
const sectionsOn = { ...standard, destruction: { ...standard.destruction, sections: true } };
const SOUTH_Z = -38, NORTH_Z = -32;

// verdant's ground where the parity receipt stands its house; the house seated on its lowest point
const probe = createAuthoritativeMatch({ mapId: 'verdant', seed: 1, countdownS: 0,
  players: [{ id: 'probe', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -140, yaw: 0 } }] });
const field = probe.heightField;
let base = Infinity;
for (let x = -12; x <= 12; x += 2) for (let z = SOUTH_Z; z <= NORTH_Z; z += 1) base = Math.min(base, field.getHeightAt(x, z));
base -= 0.2;
const contact = setObbShape({ min: [0, base, 0], max: [0, base + 1.8, 0], kind: 'structure', structureIdx: 0 }, 0, -35, 12, 3, 0);
const band = setCompoundShape({ min: [0, base, 0], max: [0, base + 6, 0], kind: 'structure', structureIdx: 0 },
  [{ kind: 'obb', cx: 0, cz: -35, hw: 12, hl: 3, yaw: 0 }]);
const houseWorld = () => createHeadlessCollisionWorld({ mapId: 'verdant', heightField: field,
  manifest: { obstacles: [packCollisionRecord(contact)], colliders: [packCollisionRecord(band)], concealers: [] } });

const m1 = getSpec('m1a2');
const heSlot = m1.gun.shells.findIndex((round) => round.type === 'HE');
const apSlot = m1.gun.shells.findIndex((round) => round.type === 'APFSDS');
assert.ok(heSlot >= 0 && apSlot >= 0, 'the M1A2 carries HE and APFSDS');

/** The M1A2 fires its HE round at the south wall, then its APFSDS round along the same line. */
function volley(ruleset) {
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 3, countdownS: 0, worldCollision: houseWorld(), ruleset,
    players: [
      { id: 'gun', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -68, yaw: 0 } },
      { id: 'far', specId: 'm1a2', team: 'bravo', spawn: { x: 60, z: 120, yaw: Math.PI } },
    ] });
  match.onMatchReady();
  const fired = [], impacts = [], breaches = [];
  const inputs = new Map();
  for (let tick = 1; tick <= 2400 && impacts.length < 2; tick++) {
    // hold the trigger on the HE round until it goes, then on the APFSDS round (the swap reloads the gun)
    const slot = fired.length === 0 ? heSlot : apSlot;
    inputs.set('gun', { throttle: 0, steer: 0, brake: true, fire: fired.length < 2 && tick > 60, fireIntentSeq: fired.length + 1,
      aimLocked: false, shellSlot: slot, actionBits: 0, aimYaw: 0, aimPitch: 0 });
    match.step({ dt: 1 / 60, inputs });
    for (const event of match.eventsForViewer('gun')) {
      if (event.type === 'shell_fired' && event.shooterId === 'gun') fired.push(event);
      if (event.type === 'shell_impact') impacts.push(event);
      if (event.type === 'structure_breach') breaches.push(event);
    }
    match.afterEventBroadcast();
  }
  return { fired, impacts, breaches };
}

const on = volley(sectionsOn);
assert.equal(on.fired.length, 2, 'both rounds fired');
assert.deepEqual(on.fired.map((event) => event.shellType), ['HE', 'APFSDS']);
assert.equal(on.impacts.length, 2, 'both met the house');
const [heImpact, apImpact] = on.impacts;
assert.ok(Math.abs(heImpact.z - SOUTH_Z) < 0.05, `the HE round burst on the south wall (z ${heImpact.z.toFixed(3)})`);
const heHole = on.breaches.find((event) => !event.sectionDown && Math.abs(event.z - SOUTH_Z) < 0.05);
assert.ok(heHole, `it opened a hole there (${JSON.stringify(on.breaches.map((e) => [e.section, e.z, e.radiusM]))})`);
assert.ok(heHole.radiusM > 0.5 && heHole.nz === -1, `a blast's hole, facing out of the south wall (r ${heHole.radiusM} m)`);
assert.ok(Math.abs(apImpact.z - NORTH_Z) < 0.05,
  `the APFSDS round passed the hole and struck the north wall from inside (z ${apImpact.z.toFixed(3)})`);
assert.equal(apImpact.structureId, 0, 'the house\'s own wall');
const apHole = on.breaches.find((event) => !event.sectionDown && Math.abs(event.z - NORTH_Z) < 0.05);
// both holes in the same walls (the map's material scales them alike): a penetrator's 0.0035 · calibre to a blast's
// 0.45 · W^⅓
assert.ok(apHole && Math.abs(apHole.radiusM / heHole.radiusM
  - penetratorHoleRadiusM(m1.gun.shells[apSlot]) / blastHoleRadiusM(heImpact.chargeKg, 'he')) < 0.02,
  `it punched its own hole there, a penetrator's (${apHole?.radiusM} m to the HE round's ${heHole.radiusM} m)`);
assert.equal(on.breaches.filter((event) => Math.abs(event.z - SOUTH_Z) < 0.05).length, 1, 'and none in the south wall');

const off = volley(standard);
assert.equal(off.breaches.length, 0, 'sections off: no breach events');
assert.ok(off.impacts.length === 2 && off.impacts.every((event) => Math.abs(event.z - SOUTH_Z) < 0.05),
  'and the second round stops on the south wall like the first');

const digest = (run) => JSON.stringify([run.fired.map((e) => [e.dx, e.dy, e.dz]), run.impacts.map((e) => [e.x, e.y, e.z]),
  run.breaches.map((e) => [e.section, e.hole, e.x, e.y, e.z, e.radiusM, e.sectionDown])]);
assert.equal(digest(volley(sectionsOn)), digest(on), 'the run replays bit for bit');

// ---- sight through holes: the authority's spotting system over the same world
{
  const world = houseWorld();
  const destruction = createDestructionMatch({ rules: sectionsOn.destruction, obstacles: world.getObstacles(),
    colliders: world.getColliders() });
  const tank = (id, team, x, z) => ({ id, team, spec: m1, state: { pos: { x, y: field.getHeightAt(x, z), z }, speed: 0 },
    combat: { destroyed: false } });
  const spotter = tank('s', 'alpha', 0, -68), target = tank('t', 'bravo', 0, -2);
  const spotting = createSpottingSystem({ getTanks: () => [spotter, target], teams: ['alpha', 'bravo'], rng: () => 0.5,
    raycast: (origin, direction, maxDistance) => world.raycast(origin, direction, maxDistance) });
  assert.ok(Math.hypot(target.state.pos.x - spotter.state.pos.x, target.state.pos.z - spotter.state.pos.z) > 50,
    'beyond the proximity rule (sight decides)');
  assert.equal(spotting.testSpot(spotter, target, 100), false, 'the house hides the hull behind it');
  // the line of sight to the target's lower sample (0.45 of its height) where it meets each wall
  const eyeY = spotter.state.pos.y + m1.dims.heightM * 0.9, aimY = target.state.pos.y + m1.dims.heightM * 0.45;
  const at = (z) => eyeY + (aimY - eyeY) * (z - spotter.state.pos.z) / (target.state.pos.z - spotter.state.pos.z);
  const record = world.getColliders()[0];
  destruction.shellWorldHit(m1.gun.shells[heSlot], record, 0, at(SOUTH_Z), SOUTH_Z, 0, 1);
  destruction.step();
  assert.equal(spotting.testSpot(spotter, target, 100), false, 'one hole: the north wall still hides it');
  destruction.shellWorldHit(m1.gun.shells[apSlot], record, 0, at(NORTH_Z), NORTH_Z, 0, 1);
  destruction.step();
  assert.equal(spotting.testSpot(spotter, target, 100), true, 'holes in both walls on the line: it is seen');
  const breaches = [];
  destruction.drainBreaches(breaches);
  assert.equal(breaches.length, 2, 'two holes');
}

// ---- both sims: one narrow phase, breaches published by both steps
const mapSource = readFileSync(new URL('../world/map.ts', import.meta.url), 'utf8');
const headlessSource = readFileSync(new URL('../world/headlessCollisionWorld.ts', import.meta.url), 'utf8');
const solo = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
const authority = readFileSync(new URL('./authoritativeMatch.ts', import.meta.url), 'utf8');
assert.match(mapSource, /nearestColliderHit\(rayCandidates, origin, dir, maxDist, _bestNrm, _nearestHit\)/, 'the solo world\'s raycast');
assert.match(headlessSource, /nearestRecordHit\(candidates, origin, direction, maxDistance, bestNormal, nearestHit\)/,
  'the headless world\'s');
for (const source of [mapSource, headlessSource]) assert.doesNotMatch(source, /rayCollisionRecord\(/, 'no narrow phase of its own');
assert.match(solo, /destruction\.drainBreaches\(breaches\);\s*for \(const breach of breaches\) bus\.emit\(DESTRUCTION_BUS_EVENTS\.breach, breach\);/,
  'the solo step raises structure:breach');
assert.match(authority, /destruction\.drainBreaches\(breachEvents\);\s*for \(const event of breachEvents\) emit\('structure_breach', \{ \.\.\.event \}\);/,
  'the authority sends structure_breach');

console.log(`destructionSections: an M1A2's HE round holed the south wall (r ${heHole.radiusM} m), its APFSDS round passed the `
  + `hole and struck the north wall from inside (z ${apImpact.z.toFixed(2)}, its own ${apHole.radiusM} m hole); sections off it `
  + 'stopped on the south wall; bit-for-bit replay; spotting sees through holes in both walls (not one); one narrow phase '
  + 'in both worlds PASS');
