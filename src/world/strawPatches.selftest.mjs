// Ground lane (2026-10-08, the gauntlet's wave 260 — the railyard's drays, Saltmere's handcart, Hostomel: "evenly spaced
// identical dry sprigs", "bright-yellow grass clumps dotted evenly"): last season's straw in the sward's dry patches.
// The profile (every vegetated map but Verdant, the owner's light touch; no row = off), the law (5–15 m patches by two
// value noises on turned grids: deterministic, a fifth of the ground at their hearts, clustered, no axis), the height
// field's hook (absent on Verdant and under `?ground=legacy`), the tall
// grass's cured blades gathered there (the same pasture straw on the whole, more of it in the patches; Verdant's
// blades byte for byte the old ones), and the tufts' rule — no renderer, no GPU/art claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { groundReduxProfileIds, resolveGroundReduxProfile, strawPatchWeight } from './groundRedux.ts';
import { createTallGrass } from './tallGrass.ts';
import { createHeightField, sampleSplatNoise } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';

// 1. The profile: on for every map with a row but Amberford (Verdant), off for a map without one.
for (const id of groundReduxProfileIds()) {
  const v = resolveGroundReduxProfile(id).strawPatches ?? 0;
  assert.equal(v, id === 'verdant' ? 0 : 1, `${id}: ${id === 'verdant' ? 'the old scatter (byte-identical)' : 'straw patches'}`);
}
assert.equal(resolveGroundReduxProfile('no-such-map').strawPatches ?? 0, 0, 'a map without a row keeps the old scatter');

// 2. The law over the playable square: in [0, 1], deterministic, the patches' hearts about a fifth of the ground,
//    clustered (5–15 m patches, not a speckle), with no axis carrying them.
{
  let n = 0, hearts = 0, pairs = 0, both = 0, runX = 0, runZ = 0;
  for (let x = -460; x < 460; x += 1.9) {
    for (let z = -460; z < 460; z += 1.9) {
      const w = strawPatchWeight(x, z);
      assert.ok(w >= 0 && w <= 1, 'a weight in [0, 1]');
      n++;
      if (w > 0.5) {
        hearts++; pairs++;
        if (strawPatchWeight(x + 1, z) > 0.5) { both++; runX++; }
        if (strawPatchWeight(x, z + 1) > 0.5) runZ++;
      }
    }
  }
  assert.equal(strawPatchWeight(12.5, -3.25), strawPatchWeight(12.5, -3.25), 'deterministic');
  const share = hearts / n;
  assert.ok(share > 0.12 && share < 0.28, `the hearts a fifth of the ground (${(share * 100).toFixed(1)} %)`);
  assert.ok(both / pairs > 0.75, `patches, not speckle: a heart's neighbour a metre off is a heart ${(both / pairs * 100).toFixed(0)} % of the time`);
  assert.ok(Math.abs(runX - runZ) / Math.max(runX, runZ) < 0.1, `no axis carries the patches (${runX} / ${runZ})`);
}

// 3. The height field's hook: the law itself on Saltmere and Cinder Junction, none on Amberford.
for (const id of ['coastal', 'railyard']) assert.equal(createHeightField(1337, getMapConfig(id))._strawPatchAt, strawPatchWeight, `${id} publishes the patches`);
assert.equal(createHeightField(1337, getMapConfig('verdant'))._strawPatchAt, undefined, 'Amberford publishes none');

// 4. The tall grass: a pasture's cured blades gather in the patches (the tint's warm share far higher there than off
//    them), its straw on the whole about the same; without the hook every blade is byte for byte the old one.
{
  const flat = () => 0;
  const pasture = (x, z, out) => {
    out.active = 1; out.crop = 0; out.track = 0; out.boundary = 0; out.edgeM = 50; out.marginM = 1.5; out.sward = 1;
    out.cropKeep = -1; out.cropHeight = 1; out.jitter = 0.53; out.weed = 0; out.urban = 0;
    return out;
  };
  const base = {
    getHeightAt: flat, getHeightAtFast: flat, _roadDist: () => 1e9, getGroundType: () => 'medium',
    getNormalAt: () => ({ x: 0, y: 1, z: 0 }), _noVeg: () => false, getWaterMaskAt: () => 0, _villageMask: () => 0,
    _landUseAt: pasture,
  };
  const biome = resolveGroundReduxProfile('coastal').grass;
  const cam = new THREE.Vector3(140, 2, -60);
  const settle = (grass) => {
    for (let i = 0; i < 900; i++) {
      grass.update(1 / 60, cam, null, null);
      const st = grass.getState();
      if (st.near.publishes && st.far.publishes && !st.near.pending && !st.far.pending) break;
    }
  };
  const read = (grass) => {
    const m = grass.near.instanceMatrix.array, c = grass.near.instanceColor.array, out = [];
    for (let i = 0; i < grass.near.count; i++) out.push([m[i * 16 + 12], m[i * 16 + 14], c[i * 3], c[i * 3 + 1], c[i * 3 + 2]]);
    return out;
  };
  const opts = { seed: 9, tier: 'desktop', biome, qualityScale: () => 1, splatNoise: sampleSplatNoise };
  const withHook = createTallGrass({ ...base, _strawPatchAt: strawPatchWeight }, opts);
  const without = createTallGrass(base, opts);
  const twin = createTallGrass({ ...base, _strawPatchAt: undefined }, opts);
  settle(withHook); settle(without); settle(twin);
  const a = read(withHook), b = read(without), t = read(twin);
  assert.deepEqual(t, b, 'without the hook every blade is the old one, byte for byte');
  assert.equal(a.length, b.length, 'the patches move no blade: the same blades, their tint only');
  const warm = ([, , r, g]) => r / g;
  const inPatch = (x, z) => strawPatchWeight(x, z);
  const mean = (list) => list.reduce((acc, v) => acc + v, 0) / Math.max(1, list.length);
  const patchW = mean(a.filter(([x, z]) => inPatch(x, z) > 0.5).map(warm)), offW = mean(a.filter(([x, z]) => inPatch(x, z) === 0).map(warm));
  const oldPatch = mean(b.filter(([x, z]) => inPatch(x, z) > 0.5).map(warm)), oldOff = mean(b.filter(([x, z]) => inPatch(x, z) === 0).map(warm));
  assert.ok(patchW - offW > (oldPatch - oldOff) + 0.08, `the cured blades gather in the patches (warmth ${patchW.toFixed(3)} vs ${offW.toFixed(3)}; the old ${oldPatch.toFixed(3)} vs ${oldOff.toFixed(3)})`);
  assert.ok(Math.abs(mean(a.map(warm)) - mean(b.map(warm))) < 0.06, `the pasture's straw about the same on the whole (${mean(a.map(warm)).toFixed(3)} vs ${mean(b.map(warm)).toFixed(3)})`);
  withHook.dispose(); without.dispose(); twin.dispose();
}

// 5. The tufts (the vegetation section the grass harnesses compile reads the hook from the height field, no module
//    helper): the one-in-six straw draw against the patches, a pasture's straw gathered the same way; Verdant's line
//    multiplies by exactly 1.
{
  const veg = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
  assert.equal(veg.split('const strawPatchAt = heightField._strawPatchAt ?? null;').length, 2, 'the hook read once, from the field');
  assert.ok(veg.includes('if (((hueJ * 13.7 + varJ * 5.3) % 1) < 0.17 * (straw >= 0 ? 0.2 + 4.2 * straw : 1)) dry = Math.max(dry, 0.6);'),
    'the straw draw against the patches (the old one in six without them)');
  assert.ok(veg.includes('if (straw >= 0 && pastureDry >= 0) pastureDry = Math.min(0.85, pastureDry * (0.45 + 2.9 * straw));'),
    'a pasture\'s straw gathered as its blades\' is');
  const filter = veg.indexOf('  // shared placement filter/tint'), prep = veg.indexOf("  yield { stage: 'grassPrep' };");
  const at = veg.indexOf('const strawPatchAt = heightField._strawPatchAt ?? null;');
  assert.ok(filter > 0 && at > filter && at < prep, 'inside the section the grass harnesses compile');
  const src = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  assert.ok(src.includes("...((resolveGroundReduxProfile(cfg?.id).strawPatches ?? 0) > 0 && !legacyGroundLanes ? { _strawPatchAt: strawPatchWeight } : {}),"),
    'the field hook on the patches\' maps, none under the legacy A/B');
}

console.log('strawPatches: the profile (every vegetated map but Verdant), the law (a fifth of the ground in 5–15 m patches, no axis), '
  + 'the field hook, the tall grass\'s straw gathered (byte-identical without the hook) and the tufts\' rule PASS; no GPU/art claim');
