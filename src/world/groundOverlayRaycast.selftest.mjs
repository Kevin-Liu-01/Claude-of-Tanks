// The world's ray march reads the battle's dug ground (DST-04, 2026-10-15; docs/DESTRUCTION.md §6, §7): a round, a sight
// line, a bot's look and the aim meet the ground the eye sees and the hulls drive on — a crater's bowl (no phantom
// ground over it: a gun in the bowl fires out of it, a hull in it can be seen and hit over the rim) and a collapsed
// building's heap (it stops what passes into it). The headless world (the authority's) and the rendered world (solo, a
// network seat, the Studio) march the same law: the base's fast height plus the overlay's drawn offsets
// (contactOffsetAt, the lattice the terrain mesh follows); the authority binds its match's ground on its own world.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { createHeadlessCollisionWorld } from './headlessCollisionWorld.ts';
import { createTerrainDeformation } from '../sim/terrainDeformation.ts';
import { mapCratersOn } from './mapCraters.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';

// ---- the law, on a flat field
const flat = {
  maxY: 0,
  getHeightAt: () => 0,
  getHeightAtFast: () => 0,
  getNormalAt: () => new Vector3(0, 1, 0),
};
const world = createHeadlessCollisionWorld({ mapId: 'flat', heightField: flat, manifest: { obstacles: [], colliders: [] } });
const ground = createTerrainDeformation();
// the gunship howitzer's crater (R 3.4 m, 1.19 m deep) and a two-storey house's heap (2.6 m)
assert.ok(ground.addCrater(0, 0, 3.4, 1.19, 0.408, 4242));
ground.addRubble(40, 0, 5, 6, 0, 2.6);
const down = new Vector3(0, -1, 0);
const east = new Vector3(1, 0, 0);
const at = (x, y, z) => new Vector3(x, y, z);

{
  const hit = world.raycast(at(0, 5, 0), down, 20);
  assert.ok(hit && Math.abs(hit.point.y) < 0.03, 'unbound: the base ground (the march bisects to a few mm)');
  assert.equal(world.raycast(at(0, -0.6, 0), east, 10)?.dist, 0, 'unbound: a muzzle in the bowl is under the old ground');
  assert.equal(world.raycast(at(20, 1, 0), east, 40), null, 'unbound: a sight line passes through the heap');
}

world.bindGroundOverlay(ground);
{
  const hit = world.raycast(at(0, 5, 0), down, 20);
  const floor = ground.contactOffsetAt(0, 0);
  assert.ok(floor < -1, `the bowl's floor as drawn (${floor.toFixed(3)} m)`);
  assert.ok(hit && Math.abs(hit.point.y - floor) < 0.03, `a round falls into the bowl (${hit?.point.y.toFixed(3)} vs ${floor.toFixed(3)})`);
  assert.ok(hit.normal.y > 0.999, 'flat at the bowl floor');
  // the bowl's wall tilts the hit normal (a ricochet, a decal's seat)
  const wall = world.raycast(at(2.2, 5, 0), down, 20);
  assert.ok(wall && wall.normal.y < 0.99 && wall.normal.x < 0, `the wall's normal leans into the bowl (${wall?.normal.toArray().map((v) => v.toFixed(3))})`);
  // a gun in the bowl fires out of it: the round meets the bowl's own wall, not phantom ground at its muzzle
  const out = world.raycast(at(0, -0.6, 0), east, 10);
  assert.ok(out && out.dist > 1 && out.dist < 3.4 * 1.3, `a muzzle 0.6 m under the old ground fires to the bowl's wall (${out?.dist.toFixed(2)} m)`);
  const over = world.raycast(at(0, 0.6, 0), east, 10);
  assert.ok(!over || over.dist > 3, `a muzzle over the rim clears it (${over?.dist.toFixed(2) ?? 'clear'})`);
  // the heap stops a sight line at a metre that crosses it, on its skirt
  const heap = world.raycast(at(20, 1, 0), east, 40);
  assert.ok(heap && heap.kind === 'terrain' && heap.point.x > 25 && heap.point.x < 40, `the heap stops the line (${heap?.point.x.toFixed(2)})`);
  assert.ok(Math.abs(heap.point.y - 1) < 0.05 && Math.abs(ground.contactOffsetAt(heap.point.x, 0) - 1) < 0.05, 'where the drawn heap stands a metre high');
  // an upward ray's ceiling counts the overlay's raise: a ray climbing out of the heap's lee still meets its crown
  let crest = { x: 40, z: 0, y: -Infinity };
  for (let x = 34; x <= 46; x += 0.25) for (let z = -5; z <= 5; z += 0.25) {
    const y = ground.contactOffsetAt(x, z);
    if (y > crest.y) crest = { x, z, y };
  }
  assert.ok(crest.y > 2.1, `the heap's crown stands over the base field's ceiling (${crest.y.toFixed(2)} m)`);
  const climb = world.raycast(at(crest.x - 12, 2.02, crest.z), new Vector3(1, 0.001, 0).normalize(), 30);
  assert.ok(climb && climb.kind === 'terrain' && climb.point.x < crest.x + 0.5, 'a rising ray over the base ceiling still meets the heap');
  // far from every stamp: the base ground, bit for bit
  const far = world.raycast(at(-200, 5, 120), down, 20);
  assert.ok(Math.abs(far.point.y) < 0.03 && far.normal.y === 1, 'far from every stamp: the base ground and its normal');
}
world.bindGroundOverlay(null);
assert.equal(world.raycast(at(0, -0.6, 0), east, 10)?.dist, 0, 'unbound again: the base ground');

// ---- both worlds march one law (the rendered world is built in the browser; its march is read from source)
{
  const law = /const rayHeightAt = \(x: number, z: number\): number => \(\s*rayOverlay \? (\w+)\(x, z\) \+ rayOverlay\.contactOffsetAt\(x, z\) : \1\(x, z\)\s*\);/;
  const mapSource = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
  const headlessSource = readFileSync(new URL('./headlessCollisionWorld.ts', import.meta.url), 'utf8');
  for (const [name, text] of [['map.ts', mapSource], ['headlessCollisionWorld.ts', headlessSource]]) {
    assert.match(text, law, `${name}: the march reads base + the overlay as drawn`);
    const march = text.slice(text.indexOf('function terrainHitDistance('), text.indexOf('function raycast('));
    assert.ok(march.length > 200 && !/hAtF\(|fastHeightAt\(/.test(march), `${name}: every sample of the march reads rayHeightAt`);
    assert.match(march, /maxY \+ \(rayOverlay \? rayOverlay\.maxRaiseM : 0\) \+ 2/, `${name}: the ceiling counts the overlay's raise`);
    assert.match(text, /rayNormalField\.getNormalAt\(/, `${name}: the hit normal is the dug ground's`);
  }
  assert.match(mapSource, /bindGroundOverlay: \(overlay\) => \{[^}]*rayOverlay = overlay;/, 'map.ts: the battle\'s overlay binds the march');
  const authority = readFileSync(new URL('../sim/authoritativeMatch.ts', import.meta.url), 'utf8');
  assert.match(authority, /const heightField = [^\n]*createDeformedHeightField\(baseHeightField, ground\);[^\n]*\n[^\n]*\n\s*worldCollision\?\.bindGroundOverlay\?\.\(ground\);/,
    'the authority binds its match\'s ground on its world');
  // the solo smoke reads the match's ground, as the authority's does
  const solo = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
  assert.ok(!/smokeBlocks\([^)]*world\.heightField\.getHeightAt\)/.test(solo), 'solo smoke sight reads the dug ground');
  assert.ok(!/requestAuxiliary\(entity,'smoke',game\.timeS,world\.heightField\.getHeightAt/.test(solo), 'solo smoke canisters land on the dug ground');
}

// ---- the authority, for real: its world marches the crater its HE round dug
{
  const real = createDedicatedWorldCollision('verdant', { retain: true });
  const bound = [];
  const worldCollision = Object.assign(Object.create(real), {
    bindGroundOverlay(overlay) { bound.push(overlay); real.bindGroundOverlay(overlay); },
  });
  const ruleset = { ...matchRulesetFor('standard') };
  assert.equal(ruleset.destruction.craters, true, 'craters are on (DST-04)');
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 9, countdownS: 0, ruleset, worldCollision,
    players: [
      { id: 'gun', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: -150, z: -150, yaw: 0 } },
      { id: 'far', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 150, z: 200, yaw: Math.PI } },
    ] });
  assert.equal(bound.length, 1, 'the authority binds its ground once');
  const overlay = bound[0];
  match.onMatchReady();
  const fire = new Map([['gun', { throttle: 0, steer: 0, brake: true, fire: true, aimYaw: 0, aimPitch: -0.12, shellSlot: 2 }]]);
  const craters = [];
  for (let i = 0; i < 600 && !craters.length; i++) {
    match.step({ dt: 1 / 60, inputs: fire });
    for (const event of match.eventsForViewer('gun')) if (event.type === 'terrain_crater') craters.push(event);
    match.afterEventBroadcast();
  }
  assert.ok(craters.length >= 1, 'the HE round dug a crater');
  const c = craters[0];
  // (the map's pre-placed craters lie first on every match's ground: world/mapCraters.ts)
  const mapBowls = mapCratersOn(overlay)?.dug.reduce((n, d) => n + d, 0) ?? 0;
  assert.equal(overlay.stamps.slice(mapBowls).filter((stamp) => stamp.kind === 'crater').length, craters.length, 'on the bound ground');
  const base = real.heightField.getHeightAtFast(c.x, c.z);
  const floor = base + overlay.contactOffsetAt(c.x, c.z);
  // (a 125 mm crater, R 1.65 m, spans little more than a lattice cell: its drawn bowl is shallower than its law's)
  assert.ok(floor < base - 0.1, `the bowl is dug (${(floor - base).toFixed(3)} m)`);
  const hit = real.raycast(at(c.x, base + 5, c.z), down, 20);
  assert.ok(hit && Math.abs(hit.point.y - floor) < 0.05, `the authority's world meets the bowl (${hit?.point.y.toFixed(3)} vs ${floor.toFixed(3)})`);
  real.release();
}

console.log('groundOverlayRaycast selftest: PASS — both worlds march the dug ground (the bowl, the heap, the normal, the ceiling); the authority binds its own');
