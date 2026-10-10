// A Studio burst fells the light props in its reach as a battle's does (studioDestruction.ts; 2026-10-09, the owner:
// "destructible props must break properly"): the solo step's fellBlastProps rule (game/state.ts) over the Studio world —
// crushable props within 1.2 · W^⅓ of a burst of 2 kg or more, nearest first, at most PROP_FELL_PER_BLAST a burst, by the
// world's own crush, before the match steps — and a strike round that meets the ground bursts there (studio.ts
// strikeGround: the sim's strike with the Studio's own crater, the blast naming it), where it used to expire as a plain
// impact that broke nothing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { createStudioDestruction } from './studioDestruction.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';
import { PROP_FELL_PER_BLAST, munitionChargeKg, propFellRadiusM } from '../sim/munitionBlast.ts';
import { setCompoundShape, setObbShape } from '../world/collision.ts';
import { createHeadlessCollisionWorld } from '../world/headlessCollisionWorld.ts';
import { createTerrainDeformation } from '../sim/terrainDeformation.ts';
import { packCollisionRecord } from '../../tools/headlessWorldCollision.mjs';

const field = { getHeightAt: () => 0, getHeightAtFast: () => 0, getNormalAt: () => new Vector3(0, 1, 0), maxY: 0 };
const he125 = { type: 'HE', caliberMm: 125 };
const reach = propFellRadiusM(munitionChargeKg(he125));
assert.ok(reach > 1.7 && reach < 1.9, `a 125 mm HE burst fells light props within ${reach.toFixed(2)} m`);
// light props round a burst at the origin: fence posts at 0.5..1.6 m (in reach), one at 2.4 m (out), a non-crushable
// stone at 0.8 m, and a crate standing on a 3 m roof over it (above the burst's reach)
const prop = (i, x, z, kind, extra = {}) => setObbShape({ min: [0, 0, 0], max: [0, 1.1, 0], kind, crushable: true, propIdx: i, ...extra }, x, z, 0.1, 0.6, 0);
const records = [
  prop(0, 1.6, 0, 'fenceplank'), prop(1, 0.5, 0, 'fenceplank'), prop(2, -1.0, 0.4, 'crate'), prop(3, 2.4, 0, 'fenceplank'),
  setObbShape({ min: [0, 0, 0], max: [0, 1.2, 0], kind: 'boulder' }, 0, 0.8, 0.3, 0.3, 0),
  setObbShape({ min: [0, 3.0, 0], max: [0, 4.1, 0], kind: 'crate', crushable: true, propIdx: 5 }, 0.2, -0.3, 0.4, 0.4, 0),
];
// a house 40 m off: a map's structures are what switch its destruction match on (sim/destructionMatch.ts), as every map has
const houseContact = setObbShape({ min: [0, 0, 0], max: [0, 1.8, 0], kind: 'structure', structureIdx: 0 }, 0, -40, 6, 4, 0);
const houseBand = setCompoundShape({ min: [0, 0, 0], max: [0, 6, 0], kind: 'structure', structureIdx: 0 }, [{ kind: 'obb', cx: 0, cz: -40, hw: 6, hl: 4, yaw: 0 }]);
function studioOver(list) {
  const world = createHeadlessCollisionWorld({ mapId: 'verdant', heightField: field,
    manifest: { obstacles: [...list, houseContact].map(packCollisionRecord), colliders: [packCollisionRecord(houseBand)], concealers: [] } });
  const crushed = [];
  const studioWorld = {
    getObstacles: () => world.getObstacles(), getColliders: () => world.getColliders(), queryObstacles: world.queryObstacles,
    crushObstacle(record, dirX, dirZ, speedMps, cause) { crushed.push({ record, dirX, dirZ, speedMps, cause }); return true; },
  };
  // craters on (whatever the battle switch says today): the dig switch is what is held here
  const rules = { ...matchRulesetFor('standard').destruction, craters: true, maxCraters: Math.max(8, matchRulesetFor('standard').destruction.maxCraters ?? 0) };
  const studio = createStudioDestruction(studioWorld, { emit() {} }, { rules, ground: createTerrainDeformation() });
  return { world, studio, crushed };
}
{
  const { world, studio, crushed } = studioOver(records);
  studio.strike(he125, null, 0, 0, 0, 0, 1, false);
  assert.equal(crushed.length, 0, 'the props fall when the step runs, not inside the strike');
  studio.step();
  const kinds = crushed.map(({ record }) => `${record.kind}#${record.propIdx}`);
  assert.deepEqual(kinds, ['fenceplank#1', 'crate#2', 'fenceplank#0'], `the light props in reach fall, nearest first (${kinds})`);
  assert.ok(crushed.every(({ speedMps, cause }) => speedMps === 6 && cause === 'shell'), 'as the battle crushes them: 6 m/s, a shell\'s');
  assert.ok(crushed[0].dirX > 0.99 && crushed[1].dirX < -0.9, 'each thrown away from the burst');
  assert.ok(world.getObstacles().find((r) => r.propIdx === 3).crushed !== true, 'a post 2.4 m off stands');
  assert.equal(studio.match.craters, 0, 'the Studio digs its own crater: the sim digs none (dig false)');
  studio.step();
  assert.equal(crushed.length, 3, 'a burst fells once');
}
{
  // the budget: eight posts in reach, six fall; a round with no charge fells nothing; a burst on the ground digs the
  // sim's crater when the caller leaves it to the sim (the default)
  const ring = Array.from({ length: 8 }, (_, i) => prop(i, Math.cos(i * Math.PI / 4) * 1.2, Math.sin(i * Math.PI / 4) * 1.2, 'fenceplank'));
  const { studio, crushed } = studioOver(ring);
  studio.strike({ type: 'APFSDS', caliberMm: 120, pen100Mm: 700 }, null, 0, 0, 0, 0, 1, false);
  studio.step();
  assert.equal(crushed.length, 0, 'a kinetic round carries no charge: nothing falls');
  studio.strike(he125, null, 0, 0, 0, 0, 1);
  studio.step();
  assert.equal(crushed.length, PROP_FELL_PER_BLAST, `at most ${PROP_FELL_PER_BLAST} props a burst`);
  assert.equal(studio.match.craters, 1, 'left to the sim, a ground burst digs its crater');
}
// one rule with the battle's (game/state.ts fellBlastProps)
const solo = readFileSync(new URL('./state.ts', import.meta.url), 'utf8');
const studioSim = readFileSync(new URL('./studioDestruction.ts', import.meta.url), 'utf8');
for (const [name, text] of [['solo', solo], ['studio', studioSim]]) {
  assert.match(text, /let budget = PROP_FELL_PER_TICK;/, `${name}: a step's budget`);
  assert.match(text, /radius = propFellRadiusM\(blasts\[b \+ 3\]\);/, `${name}: the reach of the burst's charge`);
  assert.match(text, /if \(!obstacle\.crushable \|\| obstacle\.crushed \|\| obstacle\.min\[1\] > y \+ radius\) continue;/, `${name}: crushable, standing, within reach of the burst's height`);
  assert.match(text, /const fell = Math\.min\((_blastFelled|felled)\.length, PROP_FELL_PER_BLAST, budget\);/, `${name}: at most a burst's share`);
  assert.match(text, /obstacle\.crushed = true;\s*world\.crushObstacle\(obstacle, dx \/ length, dz \/ length, 6, 'shell'\);/, `${name}: the world's crush`);
}
assert.match(studioSim, /step\(\) \{\s*\/\/[^\n]*\n\s*fellBlastProps\(\);\s*match\.step\(\);/, 'studio: felled before the match steps, as the solo step');
// the Studio's strike round on the ground
const studio = readFileSync(new URL('./studio.ts', import.meta.url), 'utf8');
assert.match(studio, /const groundCrater = sh\._studioWorld \? strikeGround\(sh\) : null;/, 'a strike round on the ground bursts there');
assert.match(studio, /studioDestructionNow\(\)\?\.strike\(spec, null, sh\.pos\.x, sh\.pos\.y, sh\.pos\.z, dx \/ length, dz \/ length, false\);/,
  'the sim\'s strike at the burst, its crater left to the Studio');
assert.match(studio, /const crater = studioDig\(munition, chargeKg, sh\.pos\.x, sh\.pos\.z\);\s*fxBus\.emit\(DESTRUCTION_BUS_EVENTS\.blast, \{\s*munition, chargeKg, x: sh\.pos\.x, y: sh\.pos\.y, z: sh\.pos\.z, nx: 0, ny: 1, nz: 0, surface: 'ground',/,
  'the Studio\'s crater and the blast naming it');
console.log(`studioBlastFell: a Studio burst fells the light props within ${reach.toFixed(2)} m (125 mm HE) nearest first, at most `
  + `${PROP_FELL_PER_BLAST} a burst, by the world's crush before the match steps (the battle's rule); a strike round on the ground bursts there PASS`);
