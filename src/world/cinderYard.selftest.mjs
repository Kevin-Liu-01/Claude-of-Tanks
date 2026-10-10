// Ground lane (2026-10-08, the gauntlet's wave 260 on Cinder Junction's yard: "a dead-flat plane of dark mulch with
// evenly spaced identical grass blades", "seedlings in a ploughed field, not weeds in a cinder yard"): the cinder yard.
// The profile row (only Cinder Junction floors its village in cinder: every other map's ground is what it was), the weed
// clumps' law (deterministic, about a tenth of the floor, clustered, never squared to the axes), the height field's hook
// (on the yard's map only; `?ground=legacy` none), the tall grass in the clumps and along the walls and nowhere between
// them, the tufts'
// rule, and the material's cinder (the yard block gated on its uniform, bound from the profile, off under the legacy
// A/B; its oil a satin off the roads; the D layer's consumers unchanged) — no renderer, no GPU/art claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { cinderYardWeedsAt, groundReduxProfileIds, resolveGroundReduxProfile } from './groundRedux.ts';
import { TALL_GRASS, createTallGrass } from './tallGrass.ts';
import { createHeightField } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';

// 1. The profile: Cinder Junction's yard, and no other map's.
for (const id of groundReduxProfileIds()) {
  const v = resolveGroundReduxProfile(id).cinderYard ?? 0;
  assert.equal(v, id === 'railyard' ? 1 : 0, `${id}: ${id === 'railyard' ? 'the cinder yard' : 'no cinder yard (pixel-identical)'}`);
}
assert.equal(resolveGroundReduxProfile('no-such-map').cinderYard ?? 0, 0, 'an unknown map has none');

// 2. The clumps' law over the yard's rect (x ±270, z ±96): in [0, 1], deterministic, about a seventh of the floor at
//    their hearts, clustered (a heart's neighbour half a metre off is a heart far more often than the floor's share),
//    and as long across the axes as along them (no clump squared to the grid).
{
  let n = 0, any = 0, heart = 0, pairs = 0, both = 0;
  let runX = 0, runZ = 0;
  for (let x = -270; x < 270; x += 0.5) {
    for (let z = -96; z < 96; z += 0.5) {
      const w = cinderYardWeedsAt(x, z);
      assert.ok(w >= 0 && w <= 1, 'a weight in [0, 1]');
      n++;
      if (w > 0) any++;
      if (w > 0.5) {
        heart++;
        pairs++;
        if (cinderYardWeedsAt(x + 0.5, z) > 0.5) { both++; runX++; }
        if (cinderYardWeedsAt(x, z + 0.5) > 0.5) runZ++;
      }
    }
  }
  assert.equal(cinderYardWeedsAt(12.25, -40.5), cinderYardWeedsAt(12.25, -40.5), 'deterministic');
  const share = heart / n;
  assert.ok(share > 0.06 && share < 0.16, `the clumps' hearts a seventh of the floor (${(share * 100).toFixed(1)} %)`);
  assert.ok(any / n < 0.30, `most of the floor grows nothing (${(any / n * 100).toFixed(1)} % touched)`);
  assert.ok(both / pairs > 0.6, `clustered: a heart's neighbour is a heart ${(both / pairs * 100).toFixed(0)} % of the time`);
  assert.ok(Math.abs(runX - runZ) / Math.max(runX, runZ) < 0.15, `no axis carries the clumps (${runX} / ${runZ})`);
}

// 3. The height field's hook: on Cinder Junction's field the clumps' law itself, on another map's none.
{
  const yard = createHeightField(1337, getMapConfig('railyard'));
  assert.equal(yard._yardWeedsAt, cinderYardWeedsAt, 'Cinder Junction publishes the clumps');
  assert.ok(yard._villageMask(-105, -56) > 0.35, 'the yard is the village mask (the handcart view stands in it)');
  const other = createHeightField(1337, getMapConfig('verdant'));
  assert.equal(other._yardWeedsAt, undefined, 'Amberford publishes none');
}

// 4. The tall grass: on a yard's floor the sward stands in the clumps and nowhere between them, thicker at their hearts
//    than the old trodden village's scatter; without the hook the village keeps the old thinning.
{
  const flat = () => 0;
  const base = {
    getHeightAt: flat, getHeightAtFast: flat, _roadDist: () => 1e9, getGroundType: () => 'medium',
    getNormalAt: () => ({ x: 0, y: 1, z: 0 }), _noVeg: () => false, getWaterMaskAt: () => 0, _villageMask: () => 1,
  };
  const biome = resolveGroundReduxProfile('railyard').grass;
  const cam = new THREE.Vector3(0, 2, 0);
  const settle = (grass) => {
    for (let i = 0; i < 900; i++) {
      grass.update(1 / 60, cam, null, null);
      const s = grass.getState();
      if (s.near.publishes && s.far.publishes && !s.near.pending && !s.far.pending) break;
    }
  };
  const roots = (mesh) => {
    const a = mesh.instanceMatrix.array, out = [];
    for (let i = 0; i < mesh.count; i++) out.push([a[i * 16 + 12], a[i * 16 + 14]]);
    return out;
  };
  const yard = createTallGrass({ ...base, _yardWeedsAt: cinderYardWeedsAt }, { seed: 7, tier: 'desktop', biome, qualityScale: () => 1 });
  const old = createTallGrass(base, { seed: 7, tier: 'desktop', biome, qualityScale: () => 1 });
  settle(yard); settle(old);
  const yr = roots(yard.near), or = roots(old.near);
  assert.ok(yr.length > 200, `the yard's weeds stand (${yr.length} clumps)`);
  for (const [x, z] of yr) assert.ok(cinderYardWeedsAt(x, z) > 0.02, `a weed stands in a clump (${x.toFixed(2)}, ${z.toFixed(2)})`);
  for (const [x, z] of roots(yard.far)) assert.ok(cinderYardWeedsAt(x, z) > 0.02, 'the far ring keeps to the clumps too');
  const inHeart = (list) => list.filter(([x, z]) => cinderYardWeedsAt(x, z) > 0.5).length / list.length;
  assert.ok(inHeart(yr) > 0.6, `most of the weeds in the clumps' hearts (${(inHeart(yr) * 100).toFixed(0)} %)`);
  assert.ok(inHeart(or) < 0.25, `the old scatter fell anywhere (${(inHeart(or) * 100).toFixed(0)} %)`);
  // the hearts' density against the old village's, over the near ring's square
  const half = (TALL_GRASS.near.ring + 1) * TALL_GRASS.near.cellM;
  let heartArea = 0;
  for (let x = -half; x < half; x += 1) for (let z = -half; z < half; z += 1) if (cinderYardWeedsAt(x + 0.5, z + 0.5) > 0.5) heartArea++;
  const heartDensity = yr.filter(([x, z]) => cinderYardWeedsAt(x, z) > 0.5).length / heartArea;
  const oldDensity = or.length / (4 * half * half);
  assert.ok(heartDensity > oldDensity * 2.5, `a clump's heart is thick (${heartDensity.toFixed(2)} vs the old ${oldDensity.toFixed(2)} per m²)`);
  assert.ok(yr.length < or.length, `fewer weeds over the whole floor than the old scatter (${yr.length} vs ${or.length})`);
  yard.dispose(); old.dispose();
  // along the walls: a wall 30 m long and a metre thick across the yard (a sealed footprint) — a ragged fringe of weeds
  // in the metre beside it where no clump lies, none inside it, none farther out than the clumps allow
  const wall = (x, z, r) => Math.abs(z - 10) < 0.5 + r && Math.abs(x) < 15 + r;
  const blocked = (x, y, z, h, r) => wall(x, z, r);
  const walled = createTallGrass({ ...base, _yardWeedsAt: cinderYardWeedsAt }, { seed: 7, tier: 'desktop', biome, blocked, qualityScale: () => 1 });
  settle(walled);
  const wr = roots(walled.near);
  let fringe = 0;
  for (const [x, z] of wr) {
    assert.ok(!wall(x, z, 0.12), 'no weed inside the wall');
    if (cinderYardWeedsAt(x, z) > 0.02) continue;
    assert.ok(wall(x, z, 1.0 + 1e-6), `out of the clumps only the wall's metre grows (${x.toFixed(2)}, ${z.toFixed(2)})`);
    fringe++;
  }
  const fringeArea = 2 * 31 * 0.88;
  assert.ok(fringe / fringeArea > 0.15, `the wall's foot carries its fringe (${fringe} clumps, ${(fringe / fringeArea).toFixed(2)} per m²)`);
  walled.dispose();
}

// 5. The tufts: inside the village a yard's clumps decide (the vegetation section the grass harnesses compile reads the
//    hook from the height field, no module helper); every other village keeps its thinning.
{
  const veg = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
  assert.equal(veg.split('const yardWeedsAt = heightField._yardWeedsAt ?? null;').length, 2, 'the hook read once, from the field');
  assert.ok(veg.includes('if (yardWeedsAt !== null) { if (roll > yardWeedsAt(x, z) * (carpet ? 0.9 : 0.45)) return -1; }')
    && veg.includes('else if (roll > (carpet ? 0.35 : 0.15)) return -1;'), 'the clumps, else the old village thinning');
  const filter = veg.indexOf('  // shared placement filter/tint'), prep = veg.indexOf("  yield { stage: 'grassPrep' };");
  const at = veg.indexOf('const yardWeedsAt = heightField._yardWeedsAt ?? null;');
  assert.ok(filter > 0 && at > filter && at < prep, 'inside the section the grass harnesses compile');
}

// 6. The material: the cinder block gated on its uniform (0 on every other map: skipped), bound from the profile and off
//    under the legacy A/B; the D layer's consumers as they were; the oil a satin off the roads.
{
  const src = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('uniform float uYardCinder;'), 'the uniform (a scalar: no sampler)');
  assert.equal(src.split('float yardW = uYardCinder * smoothstep(0.10, 0.55, mk.a);').length, 2, 'the yard is the village mask');
  assert.ok(src.includes('if (yardW > 0.002) {\n      vec3 dM = uMeanD.rgb * uSoilTint;'), 'the cinder block runs only in a yard');
  assert.ok(src.includes('let yardCinder = Math.min(1, Math.max(0, groundProfile.cinderYard ?? 0));') && src.includes('    yardCinder = 0;\n  }')
    && src.includes('shader.uniforms.uYardCinder = { value: yardCinder };'), 'bound from the profile, off under ?ground=legacy');
  for (const consumer of ['vec4 aD = groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB);', '    a = mix(a, aD, fD);',
    '    if (nrmOn) n = mix(n, groundNrm(uNrmD, uv * 0.210, df, mipB), fD);']) {
    assert.equal(src.split(consumer).length, 2, `the D layer's consumer unchanged: ${consumer.trim()}`);
  }
  assert.ok(src.includes('if (nrmOn && yardW > 0.002) {'), 'the clinker relief behind the far-band switch');
  assert.ok(src.includes('gSplatRough = mix(gSplatRough, 0.58, gYardOil * 0.8 * (1.0 - fR) * (1.0 - fMs) * (1.0 - roadCore));'),
    'the oil a satin (never a mirror), off the roads and hardstands');
  assert.ok(src.includes("...((resolveGroundReduxProfile(cfg?.id).cinderYard ?? 0) > 0 && !legacyGroundLanes ? { _yardWeedsAt: cinderYardWeedsAt } : {}),"),
    'the field hook on the yard\'s map, none under the legacy A/B');
}

console.log('cinderYard: the profile (Cinder Junction only), the clumps\' law (a seventh of the floor, clustered, no axis), the field hook, '
  + 'the tall grass in the clumps and the walls\' fringe only, the tufts\' rule and the material\'s gated cinder block PASS; no GPU/art claim');
