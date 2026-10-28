import assert from 'node:assert/strict';
import '../../src/vehicles/tankFactory.ts';
import { PRODUCTION_TANK_IDS, TANK_SPECS } from '../../src/vehicles/specs.ts';
import { isBuiltInCamoId, signatureCamoPatternId, stockCamoPatternIdFor } from '../../src/vehicles/camoPolicy.ts';
import { CAST } from './cast.mjs';
import { COMBAT, DUELS, FLEET, OWNER_NINE, SHOTS, siteScene } from './site50.mjs';
import { takeBars } from './take-bars.mjs';
import { resolveTankId } from '../../src/vehicles/tankIdAliases.ts';
import { sceneInCurrentTankIds } from '../../src/game/tankIdBoundaries.ts';

// The fleet takes (owner 2026-10-12: "make a special video for all tanks since it shouldnt be too hard on a wider variety
// of maps and use that everywhere"): every production vehicle leads a take, the fleet's after the fifty and the nine,
// numbered on from 60, spread over the battlefields, each in its own tank's paint, each held to every per-take bar the
// site takes are (take-bars.mjs).
assert.ok(FLEET.length > 0, 'a fleet roster (fleet-plan.mjs writes fleet-roster.json)');
// the roster's plan (s60-s224) numbered on from 60 in order; a vehicle added since (fleet-plan.mjs --append) numbered on
// after it, never on a number another take holds (s225-s252 are the combat round's and the duels')
const numbers = FLEET.map((s) => s[0]), PLANNED = 165, later = numbers.slice(PLANNED);
assert.deepEqual(numbers.slice(0, PLANNED), Array.from({ length: Math.min(PLANNED, FLEET.length) }, (_, i) => i + 60), 'numbered on from 60 in order');
assert.ok(later.every((n, i) => n > (i ? later[i - 1] : 60 + PLANNED - 1)), 'a later take numbered on in order');
const held = new Set([...SHOTS, ...OWNER_NINE, ...COMBAT, ...DUELS].map((s) => s[0]));
assert.deepEqual(later.filter((n) => held.has(n)), [], 'no later take on a number another take holds');
const all = [...SHOTS, ...OWNER_NINE, ...FLEET];
assert.equal(new Set(all.map((s) => s[1])).size, all.length, 'unique ids across every take');
// The media scenes keep the ids they were written in (schema 1, unstamped) and the Studio resolves them at load (SSOT
// 2.19, tankIdBoundaries.ts): read them the same way, so a renamed vehicle still leads its take.
const staged = (shot) => sceneInCurrentTankIds(siteScene(shot));
const scenes = new Map(FLEET.map((shot) => [shot[0], staged(shot)]));
const heroOf = (shot) => scenes.get(shot[0])?.actors[0].id ?? staged(shot).actors[0].id;
const sitesHeroes = new Set([...SHOTS, ...OWNER_NINE].map(heroOf)), fleetHeroes = FLEET.map(heroOf);
assert.equal(new Set(fleetHeroes).size, fleetHeroes.length, 'one fleet take a tank');
assert.deepEqual(fleetHeroes.filter((h) => sitesHeroes.has(h)), [], 'a tank leading one of the site takes keeps that take');
const covered = new Set([...sitesHeroes, ...fleetHeroes]);
assert.deepEqual(PRODUCTION_TANK_IDS.filter((id) => !covered.has(id)), [], 'every production vehicle leads a take');

// the battlefields: a wide spread, none crowded
const perMap = {};
for (const sc of scenes.values()) perMap[sc.map] = (perMap[sc.map] ?? 0) + 1;
assert.ok(Object.keys(perMap).length >= 25, `the fleet spreads over 25 battlefields at least (${Object.keys(perMap).length})`);
for (const [map, count] of Object.entries(perMap)) assert.ok(count <= 7, `${map} holds ${count} fleet takes, 7 at most`);

// paint: the hero's side in the hero's own scheme (its signature, else its nation's stock coat), the foes in another,
// one scheme a model (the Studio paints per model), catalog paint only
const cast = new Set([...Object.values(CAST).map((id) => resolveTankId(id)), ...PRODUCTION_TANK_IDS]); // CAST is schema 1
for (const shot of FLEET) {
  const sc = scenes.get(shot[0]), hero = sc.actors[0].id, spec = TANK_SPECS[hero];
  const own = signatureCamoPatternId(hero) ?? stockCamoPatternIdFor(hero, spec.nation, spec.era);
  assert.equal(sc.meta.paint.unit, own, `${sc.meta.id}: the hero's own scheme (${own})`);
  assert.ok(isBuiltInCamoId(sc.meta.paint.unit), `${sc.meta.id}: catalog paint`);
  if (sc.meta.paint.enemy) assert.ok(isBuiltInCamoId(sc.meta.paint.enemy) && sc.meta.paint.enemy !== sc.meta.paint.unit, `${sc.meta.id}: the enemy in another scheme`);
  const bySpec = new Map();
  for (const a of sc.actors) {
    assert.ok(!bySpec.has(a.id) || bySpec.get(a.id) === a.camo, `${sc.meta.id}: ${a.id} carries two schemes`);
    bySpec.set(a.id, a.camo);
  }
}

// every per-take bar
const problems = FLEET.flatMap((shot) => takeBars(shot, { cast, scene: scenes.get(shot[0]) }));
assert.deepEqual(problems, [], `the fleet takes clear every bar (${problems.length} problems)`);
console.log(`fleet.selftest: ${FLEET.length} fleet takes, ${covered.size} of ${PRODUCTION_TANK_IDS.length} production vehicles leading a take, on ${Object.keys(perMap).length} battlefields`);
