import assert from 'node:assert/strict';
import '../src/vehicles/tankFactory.ts';
import {DUEL_SCENARIOS,stageForMap} from './studio-example-scenarios.mjs';
import {MAP_IDS,getMapConfig} from '../src/world/maps/index.ts';
import {getSpec} from '../src/vehicles/specs.ts';
assert.deepEqual(DUEL_SCENARIOS.map(s=>s.map),MAP_IDS,'every current map has one scene');
assert.equal(new Set(DUEL_SCENARIOS.map(s=>s.index)).size,MAP_IDS.length);
assert.equal(new Set(DUEL_SCENARIOS.map(s=>s.variant)).size,4);
for(const scene of DUEL_SCENARIOS){
  const points=getMapConfig(scene.map).spawns.enemies;
  for(const id of [scene.alpha,scene.bravo])assert.equal(getSpec(id).id,id,`${id}: registered playable cinematic tank`);
  for(const p of Object.values(scene.stage))assert.ok(points.some(s=>s.x===p[0]&&s.z===p[1]),'stages retain actual authored spawn points');
  assert.deepEqual(stageForMap(scene.map),scene.stage,'repeatable stage');
  assert.ok(Math.hypot(scene.stage.alpha[0]-scene.stage.bravo[0],scene.stage.alpha[1]-scene.stage.bravo[1])>=20);
}
for(const id of ['winter','alpine','whiteout'])assert.equal(DUEL_SCENARIOS.find(s=>s.map===id).camo,'winter');
console.log(`studio-example-scenarios: ${MAP_IDS.length} maps, four styles, registered fleet PASS; native staging/recording still required`);
