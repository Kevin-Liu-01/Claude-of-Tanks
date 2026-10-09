// Receipt of the sward's tussocks and stands (the ground lane, 2026-10-08, after gauntlet waves 285-287: "a carpet of
// identical, evenly spaced blade cards" on Reservoir's hay meadow, "evenly sprinkled identical tufts" at Hostomel, on the
// Finistere coast and at Steinburg). Certifies, without a GPU (the look is the wave's):
//   1. the field (groundRedux.ts swardClumpWeight) is deterministic, bounded, and structured: about a third of the
//      ground is gap and a third tussock at the ~1.6 m scale, and the stands vary over ~8 m;
//   2. the laws both grass tiers apply: a blade in a gap kept ~0.4, in a tussock 1, the mean keep 0.70-0.90 (the sward
//      thins by a fifth, not by half), the stand's height 0.62-1 (it only shortens);
//   3. the profiles: on for the temperate, coastal and still-water swards; off on Verdant (the owner's light touch) and
//      on the snow maps (the tundra's own clumps); the height field publishes the hook accordingly;
//   4. the tiers: makeTuft keeps by a hash of the tuft's own draws (the stream unchanged) on dense swards only, and the
//      tall grass's admit applies the same laws to its meadow, steppe, savanna, verge and dune blades only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveGroundReduxProfile, swardClumpKeep, swardClumpWeight, swardStandHeight } from './groundRedux.ts';

// 1. the field
const out = [0, 0];
let gap = 0, tuss = 0, n = 0, keepSum = 0, sMin = 1, sMax = 0;
for (let z = -300; z < 300; z += 0.37) for (let x = -300; x < 300; x += 5.13) {
  const [t, s] = swardClumpWeight(x, z, out);
  assert.ok(t >= 0 && t <= 1 && s >= 0 && s <= 1, 'the weights are 0..1');
  n++; if (t < 0.05) gap++; if (t > 0.95) tuss++;
  keepSum += swardClumpKeep(t); sMin = Math.min(sMin, s); sMax = Math.max(sMax, s);
}
const gapShare = gap / n, tussShare = tuss / n, meanKeep = keepSum / n;
assert.ok(gapShare > 0.18 && gapShare < 0.45, `gaps are ${(100 * gapShare).toFixed(0)} % of the ground (18-45 %)`);
assert.ok(tussShare > 0.12 && tussShare < 0.45, `tussocks are ${(100 * tussShare).toFixed(0)} % (12-45 %)`);
assert.ok(sMin < 0.05 && sMax > 0.95, 'the stands span short to tall');
{
  const a = swardClumpWeight(12.34, -56.78, [0, 0]), b = swardClumpWeight(12.34, -56.78, [0, 0]);
  assert.deepEqual(a, b, 'deterministic: the client, the host and the receipts read one field');
}
// not even: the tussock weight 0.8 m apart is far less alike than 0.1 m apart (a structure of about a metre)
{
  let near = 0, far = 0, m = 0;
  for (let i = 0; i < 4000; i++) {
    const x = (i * 7.31) % 400 - 200, z = (i * 3.17) % 400 - 200;
    const t0 = swardClumpWeight(x, z, out)[0];
    near += Math.abs(t0 - swardClumpWeight(x + 0.1, z, out)[0]);
    far += Math.abs(t0 - swardClumpWeight(x + 0.8, z, out)[0]);
    m++;
  }
  assert.ok(far / m > 3 * (near / m), `tussocks vary over about a metre (0.8 m apart ${(far / m).toFixed(3)} vs 0.1 m ${(near / m).toFixed(3)})`);
}

// 2. the laws
assert.equal(swardClumpKeep(0), 0.40);
assert.equal(swardClumpKeep(1), 1);
assert.ok(meanKeep > 0.70 && meanKeep < 0.90, `the mean keep ${meanKeep.toFixed(3)} (0.70-0.90: the sward thins by a fifth)`);
assert.equal(swardStandHeight(0), 0.62);
assert.equal(swardStandHeight(1), 1, 'the stand only shortens: every authored height cap still holds');

// 3. the profiles and the height field's hook
for (const id of ['frontier', 'reservoir', 'urban', 'airfield', 'coastal', 'saltwind', 'monsoon']) {
  assert.ok((resolveGroundReduxProfile(id).swardClump ?? 0) > 0, `${id}: the sward stands in tussocks`);
}
assert.equal(resolveGroundReduxProfile('verdant').swardClump, 0, 'Verdant: the old scatter (the owner\'s light touch)');
for (const id of ['winter', 'whiteout', 'alpine']) {
  const p = resolveGroundReduxProfile(id);
  if (p.climate === 'snow') assert.equal(p.swardClump ?? 0, 0, `${id}: the tundra keeps its own clumps`);
}
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.ok(terrain.includes("...((resolveGroundReduxProfile(cfg?.id).swardClump ?? 0) > 0 && !legacyGroundLanes ? { _swardClumpAt: swardClumpWeight } : {}),"),
  'the height field publishes the hook where the profile asks, never under ?ground=legacy');

// 4. the tiers
const veg = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
const tuft = veg.slice(veg.indexOf('  function makeTuft('), veg.indexOf('    const sxzMul = _tuftScaleScratch[0], syMul = _tuftScaleScratch[1];'));
assert.ok(tuft.includes('if (swardClumpAt !== null && veg.grassDensity >= 0.5) {'), 'dense swards only (the sparse biomes keep their clumps)');
assert.ok(tuft.includes('if (((hueJ * 3.71 + clJ * 9.13 + roll * 5.27) % 1) > swardClumpKeep(_clumpScratch[0])) return null;'),
  'the keep is a hash of the tuft\'s own draws');
assert.ok(tuft.includes('sy *= swardStandHeight(_clumpScratch[1]);'), 'the stand sets the tuft\'s height');
const draws = (tuft.slice(tuft.indexOf('swardClumpAt(x, z, _clumpScratch)')).match(/\bcrng\(\)/g) ?? []).length;
assert.equal(draws, 0, 'no new draw from the tuft\'s stream after the clump test');
const tall = readFileSync(new URL('./tallGrass.ts', import.meta.url), 'utf8');
assert.ok(tall.includes("if (field._swardClumpAt && (b.kind === 'meadow' || b.kind === 'steppe' || b.kind === 'savanna' || b.kind === 'verge' || b.kind === 'dune')) {"),
  'the tall grass: the sward kinds only (the reeds, the sedge and the crops keep their laws)');
assert.ok(tall.includes('keep *= swardClumpKeep(_clump[0]);') && tall.includes('heightScale *= swardStandHeight(_clump[1]);'),
  'the tall grass applies the same laws');
console.log(`swardClump: gaps ${(100 * gapShare).toFixed(0)} %, tussocks ${(100 * tussShare).toFixed(0)} %, mean keep ${meanKeep.toFixed(2)}, `
  + 'Verdant and the snow maps off, both tiers on one field PASS; no GPU/art claim');
