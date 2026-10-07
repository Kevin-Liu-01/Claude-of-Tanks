// karstRelief.selftest — the limestone in relief over a karst map's flush pavement (the scenery lane, b23). On a
// synthetic ground (a plane with the karst hook's patch weight, a land use of 40 m fields, a road, a village, a steep
// bank and a wet hollow), pinned:
//   1. nothing without the hook;
//   2. the bosses: only where the pavement is whole (cover over 0.5), (b27) 0.12 to 0.38 m proud, their feet sunk under
//      the ground and their sides sloping down to it (the foot ring wider than the shoulder: no edge standing up out of
//      the turf), long along a joint set, within their budget;
//   3. the loose blocks at the patch's edge (cover 0.15 to 0.5), sunk a third;
//   3b. (b27; gauntlet wave 177: "long tan slabs ... warmer than the pavement") both families one geometry of the
//      formations' stone (position, normal, colour, aRockGround, uv: the scenery rock material) in the pavement's pale
//      grey, its runs the parts in order;
//   4. the keep-outs (the road and its shoulder, the village, the water's wetness, the steep bank) and whatever stands
//      there already;
//   5. deterministic for a seed; the placement blind to the fold (the node world bakes none); a phone the same stones
//      and no bosses;
//   6. the wiring: props.ts places it last, one mesh on the rock material that casts, no collision, nothing in the
//      field-stone bucket; map.ts binds nothing of it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { KARST_BOSS_PROUD, KARST_BOSS_SINK_M, KARST_COVER, KARST_KEEP, KARST_STONE_TONE, buildKarstRelief } from './karstRelief.ts';

const drain = (it) => { let s = it.next(); while (!s.done) s = it.next(); return s.value; };
const HEADING = 0.4, UX = Math.cos(HEADING), UZ = Math.sin(HEADING), VX = -UZ, VZ = UX;
// the synthetic ground: a slope of 2 % so heights matter; the cover a field of discs (whole in their middles, thin at
// their rims); a road along x = 120; a village box; a steep bank; a wet hollow
const coverOf = (x, z) => {
  const cx = Math.round(x / 70) * 70, cz = Math.round(z / 70) * 70, d = Math.hypot(x - cx, z - cz);
  return d < 14 ? 0.92 : d < 20 ? 0.32 : d < 24 ? 0.2 : 0;
};
const inVillage = (x, z) => x > -200 && x < -120 && z > 100 && z < 180;
const steep = (x, z) => x > 200 && x < 260 && z > -300 && z < -200;
const wet = (x, z) => Math.hypot(x + 300, z + 300) < 40;
function makeGround({ hook = true, fold = false } = {}) {
  const g = {
    getHeightAt: (x, z) => 3 + 0.02 * x - 0.01 * z,
    getNormalAt: (x, z) => ({ y: steep(x, z) ? 0.7 : 0.9997 }),
    getWaterMaskAt: () => 0,
    _roadDist: (x) => Math.abs(x - 120),
    _villageMask: (x, z) => (inVillage(x, z) ? 0.85 : 0),
    _waterWetnessAt: (x, z) => (wet(x, z) ? 0.6 : 0),
    _landUseAt: (x, z, out) => {
      const u = x * UX + z * UZ, v = x * VX + z * VZ;
      const qu = ((u % 40) + 40) % 40, qv = ((v % 40) + 40) % 40;
      out.active = 1; out.track = 0; out.crop = 0;
      out.sU = qu < 20 ? qu : qu - 40; out.sV = qv < 20 ? qv : qv - 40;
      out.edgeM = Math.min(Math.abs(out.sU), Math.abs(out.sV));
      return out;
    },
  };
  if (hook) g._karstCoverAt = (x, z, normalY, f) => Math.min(1, coverOf(x, z) + 0.3 * Math.max(0, -f));
  if (fold) g._foldAt = () => -1; // a crest everywhere: the hook's cover rises by 0.3 wherever the fold is read
  return g;
}
const noise = new SimplexNoise({ random: (() => { let a = 77; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })() });
const build = (ground, o = {}) => drain(buildKarstRelief(ground, { seed: 2002, noise, heading: HEADING, blocked: () => false, ...o }));

// ---------------------------------------------------------------------------------------------- 1. no hook
assert.equal(build(makeGround({ hook: false })), null, 'nothing without the ground lane\'s hook');

const ground = makeGround(), relief = build(ground);
const { stone, parts, counts } = relief;
assert.ok(counts.bosses > 40 && counts.blocks > 40, `both families placed (${JSON.stringify(counts)})`);
assert.equal(parts.length, counts.bosses + counts.blocks, 'a part for every boss and every block');
// each part's run of the stone's corners, in order
const runs = [];
{
  let at = 0;
  for (const part of parts) { runs.push([at, at + part.triangles * 3]); at += part.triangles * 3; }
  assert.equal(at, stone.attributes.position.count, 'the parts are the stone, in order');
}
const pos = stone.attributes.position;

// ---------------------------------------------------------------------------------------------- 2. the bosses
let longOnes = 0;
parts.forEach((part, i) => {
  if (part.kind !== 'boss') return;
  const [a, b] = runs[i];
  assert.equal(part.triangles, 112, 'within its budget: 112 triangles a boss');
  assert.ok(coverOf(part.x, part.z) > KARST_COVER.boss, `a boss where the pavement is whole (${coverOf(part.x, part.z)} at ${part.x.toFixed(1)}, ${part.z.toFixed(1)})`);
  assert.ok(part.proud >= KARST_BOSS_PROUD[0] - 1e-6 && part.proud <= KARST_BOSS_PROUD[1] + 1e-6, `0.12 to 0.38 m proud (${part.proud.toFixed(3)})`);
  let top = -Infinity, low = Infinity;
  const shoulder = [], footR = new Array(16).fill(0), shoulderR = new Array(16).fill(0);
  for (let v = a; v < b; v++) {
    const x = pos.getX(v), z = pos.getZ(v), above = pos.getY(v) - ground.getHeightAt(x, z), r = Math.hypot(x - part.x, z - part.z);
    const bin = Math.floor(((Math.atan2(z - part.z, x - part.x) / (Math.PI * 2)) + 1) * 16) % 16;
    top = Math.max(top, above); low = Math.min(low, above);
    if (above < -0.1) footR[bin] = Math.max(footR[bin], r);
    if (above > part.proud * 0.3) { shoulderR[bin] = Math.max(shoulderR[bin], r); if (above < part.proud * 0.95) shoulder.push([x - part.x, z - part.z]); }
  }
  // (its top tipped along its short axis: a third of its height more on its high side at the most)
  assert.ok(top <= part.proud * 1.4 + 1e-3, `its top within its height and its tip (${top.toFixed(3)} of ${part.proud.toFixed(3)})`);
  assert.ok(Math.abs(low + KARST_BOSS_SINK_M) < 0.002, `its foot sunk under the ground (${low.toFixed(3)})`);
  // (b27) the side slopes down into the ground: the sunk foot ring wider than the shoulder all round
  for (let k = 0; k < 16; k++) {
    if (!footR[k] || !shoulderR[k]) continue;
    assert.ok(footR[k] > shoulderR[k] * 1.05, `its edges buried: the foot ring (${footR[k].toFixed(2)} m) wider than the shoulder (${shoulderR[k].toFixed(2)} m) all round`);
  }
  // long along the master joints (or square to them: the cross joints): the shoulder's principal axis
  let sxx = 0, sxz = 0, szz = 0;
  for (const [dx, dz] of shoulder) { sxx += dx * dx; sxz += dx * dz; szz += dz * dz; }
  const angle = 0.5 * Math.atan2(2 * sxz, sxx - szz), lx = Math.cos(angle), lz = Math.sin(angle);
  const mean = (sxx + szz) / 2, dev = Math.hypot((sxx - szz) / 2, sxz), elongation = (mean + dev) / Math.max(1e-9, mean - dev);
  const along = Math.abs(lx * UX + lz * UZ), across = Math.abs(lx * VX + lz * VZ);
  if (elongation > 1.5) { longOnes++; assert.ok(Math.max(along, across) > 0.93, `long along a joint set (${along.toFixed(3)}, ${across.toFixed(3)}; elongation ${elongation.toFixed(2)})`); }
});
assert.ok(longOnes > counts.bosses * 0.25, `most of them long (${longOnes} of ${counts.bosses})`);

// ---------------------------------------------------------------------------------------------- 3. the loose blocks
parts.forEach((part) => {
  if (part.kind !== 'block') return;
  // (a cluster spreads 1.2 m round its seat: its seat in the band, the stones within reach of it)
  let near = false;
  for (let a = 0; a < 12 && !near; a++) for (const rr of [0, 0.6, 1.2]) {
    const cv = coverOf(part.x + Math.cos(a * 0.52) * rr, part.z + Math.sin(a * 0.52) * rr);
    if (cv > KARST_COVER.blocks[0] && cv <= KARST_COVER.blocks[1]) near = true;
  }
  assert.ok(near, `a loose block at the patch's edge (${part.x.toFixed(1)}, ${part.z.toFixed(1)})`);
  assert.equal(part.triangles, 10, 'a block its five faces (its bottom lies in the ground)');
});

// ---------------------------------------------------------------------------------------------- 3b. one stone, the pavement's grey
{
  for (const name of ['position', 'normal', 'color', 'aRockGround', 'uv']) assert.ok(stone.attributes[name], `the formations' stone carries ${name}`);
  assert.equal(stone.index, null, 'non-indexed (the formations\' per-corner normals)');
  const c = stone.attributes.color.array;
  let l = 0, sat = 0;
  for (let i = 0; i < c.length; i += 3) {
    const mx = Math.max(c[i], c[i + 1], c[i + 2]), mn = Math.min(c[i], c[i + 1], c[i + 2]);
    l += (mx + mn) / 2; sat += mx - mn;
  }
  const n = c.length / 3;
  // (the colours are linear; the tone's sRGB lightness 0.6 is about 0.32 linear, its mottle, its tops and its contact)
  assert.ok(l / n > 0.18 && l / n < 0.5, `a pale stone (mean linear lightness ${(l / n).toFixed(3)})`);
  assert.ok(sat / n < 0.06, `a grey, not a tan (mean chroma ${(sat / n).toFixed(3)})`);
  assert.ok(KARST_STONE_TONE[1] < 0.06, 'the pavement\'s grey: its tone near neutral');
}

// ---------------------------------------------------------------------------------------------- 4. the keep-outs
{
  for (const part of parts) {
    assert.ok(Math.abs(part.x - 120) >= KARST_KEEP.roadM - 1.6, `${part.kind} off the road and its shoulder (${part.x.toFixed(1)})`);
    assert.ok(!inVillage(part.x, part.z) && !steep(part.x, part.z) && !wet(part.x, part.z), `${part.kind} out of the village, the steep bank and the wet hollow`);
  }
  const blockedRelief = build(ground, { blocked: (x, z, r) => Math.hypot(x - 70, z - 70) < 30 + r });
  for (const part of blockedRelief.parts) {
    assert.ok(Math.hypot(part.x - 70, part.z - 70) >= (part.kind === 'boss' ? 30 : 28.5), `no ${part.kind} where something stands`);
  }
}

// ---------------------------------------------------------------------------------------------- 5. determinism
{
  const again = build(makeGround());
  assert.deepEqual(Array.from(again.stone.attributes.position.array), Array.from(stone.attributes.position.array), 'deterministic for a seed');
  // blind to the fold: a crest everywhere would lift the hook's cover by 0.3 if it were read
  const folded = build(makeGround({ fold: true }));
  assert.deepEqual(folded.counts, counts, 'the placement blind to the fold (the node world bakes none)');
  const phone = build(makeGround(), { mobile: true });
  assert.equal(phone.counts.bosses, 0, 'a phone builds no bosses');
  assert.equal(phone.counts.blocks, counts.blocks, 'a phone the same stones');
}

// ---------------------------------------------------------------------------------------------- 6. the wiring
{
  const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
  const at = props.indexOf('yield* placeKarstRelief();');
  assert.ok(at > props.indexOf('composeAutumnHeadlandDressing(destructibleContext') && at < props.indexOf('vegetation = null;', at)
    && at < props.indexOf('// --- merge buckets into one mesh per material ---'), 'the last of the placements, before the buckets merge');
  const place = props.slice(props.indexOf('function* placeKarstRelief('), props.indexOf('yield* placeKarstRelief();'));
  assert.ok(!/obstacles\.push|colliders\.push|CrushableClutter/.test(place), 'no collision');
  assert.ok(!/buckets\./.test(place), 'nothing in the field-stone bucket');
  assert.match(place, /new THREE\.Mesh\(relief\.stone, mats\.rock\);[\s\S]{0,80}mesh\.name = 'props-karst-stone';\n\s*mesh\.castShadow = true;/, 'one mesh on the rock material, casting');
  assert.match(place, /setShadowCasterProfile\(mesh, \{ heightM: KARST_BOSS_PROUD\[1\] \}\);/, 'into the cascades their height can reach');
  assert.match(props, /blocked: \(x, z, r\) => near\(x - r, z - r, x \+ r, z \+ r, hits\)\.length > 0,/, 'clear of everything placed before it');
  assert.ok(!/karstBosses|bindKarstBosses/.test(map), 'map.ts binds nothing of it');
}
console.log(`karstRelief.selftest: ${counts.bosses} bosses where the pavement is whole (proud, sunk, buried edges, along the joints), ${counts.blocks} loose blocks at its edge, one stone in the pavement's grey; the keep-outs; deterministic, blind to the fold, a phone's stones the same; placed last, no collision, on the rock material`);
