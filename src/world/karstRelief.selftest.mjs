// karstRelief.selftest — the limestone in relief over a karst map's flush pavement (the scenery lane, b23). On a
// synthetic ground (a plane with the karst hook's patch weight, a land use of 40 m fields, a road, a village, a steep
// bank and a wet hollow), pinned:
//   1. nothing without the hook;
//   2. the bosses: only where the pavement is whole (cover over 0.5), 0.2 to 0.6 m proud, their feet sunk under the
//      ground, long along a joint set, within their budget; drawn for the terrain's material (position, normal, the
//      fold byte) in one geometry;
//   3. the loose blocks at the patch's edge (cover 0.15 to 0.5), of the field-stone print;
//   4. the keep-outs (the road and its shoulder, the village, the water's wetness, the steep bank) and whatever stands
//      there already;
//   5. deterministic for a seed; the placement blind to the fold (the node world bakes none); a phone the same stones
//      and no bosses;
//   6. the wiring: props.ts places it last, into the field-stone bucket, no collision; map.ts draws the bosses with the
//      ground's material and lets them cast.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIELD_STONE_FACE_V } from './fieldStoneSurface.ts';
import { KARST_BOSS_PROUD, KARST_BOSS_SINK_M, KARST_COVER, KARST_KEEP, buildKarstRelief } from './karstRelief.ts';

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
const build = (ground, o = {}) => drain(buildKarstRelief(ground, { seed: 2002, heading: HEADING, blocked: () => false, ...o }));

// ---------------------------------------------------------------------------------------------- 1. no hook
assert.equal(build(makeGround({ hook: false })), null, 'nothing without the ground lane\'s hook');

const ground = makeGround(), relief = build(ground);
const { bosses, stones, counts } = relief;
assert.ok(counts.bosses > 40 && counts.blocks > 40, `both families placed (${JSON.stringify(counts)})`);

// ---------------------------------------------------------------------------------------------- 2. the bosses
const PER = 16 * 4 + 1; // four rings of sixteen and the apex
assert.ok(bosses && bosses.attributes.position && bosses.attributes.normal && bosses.attributes.fold, 'position, normal and the fold byte');
assert.equal(bosses.attributes.fold.itemSize, 1); assert.ok(bosses.attributes.fold.normalized, 'the fold a normalised byte, as the beds carry it');
assert.equal(bosses.attributes.position.count, counts.bosses * PER, 'one block of vertices a boss');
assert.equal(bosses.index.count / 3, counts.bosses * 112, 'within its budget: 112 triangles a boss');
let longOnes = 0;
{
  const p = bosses.attributes.position;
  for (let b = 0; b < counts.bosses; b++) {
    const apex = b * PER + PER - 1, ax = p.getX(apex), az = p.getZ(apex), g = ground.getHeightAt(ax, az);
    assert.ok(coverOf(ax, az) > KARST_COVER.boss, `a boss where the pavement is whole (${coverOf(ax, az)} at ${ax.toFixed(1)}, ${az.toFixed(1)})`);
    const proud = p.getY(apex) - g;
    assert.ok(proud >= KARST_BOSS_PROUD[0] - 1e-3 && proud <= KARST_BOSS_PROUD[1] * 1.06 + 1e-3, `0.2 to 0.6 m proud (${proud.toFixed(3)})`);
    // its foot sunk under the ground all round
    for (let k = 0; k < 16; k++) {
      const v = b * PER + k;
      assert.ok(Math.abs(p.getY(v) - (ground.getHeightAt(p.getX(v), p.getZ(v)) - KARST_BOSS_SINK_M)) < 1e-3, 'its foot sunk under the ground');
    }
    // long along the master joints (or square to them: the cross joints): the side ring's principal axis
    let sxx = 0, sxz = 0, szz = 0;
    for (let k = 0; k < 16; k++) {
      const v = b * PER + 16 + k, dx = p.getX(v) - ax, dz = p.getZ(v) - az;
      sxx += dx * dx; sxz += dx * dz; szz += dz * dz;
    }
    const angle = 0.5 * Math.atan2(2 * sxz, sxx - szz), lx = Math.cos(angle), lz = Math.sin(angle);
    const mean = (sxx + szz) / 2, dev = Math.hypot((sxx - szz) / 2, sxz), elongation = (mean + dev) / Math.max(1e-9, mean - dev);
    const along = Math.abs(lx * UX + lz * UZ), across = Math.abs(lx * VX + lz * VZ);
    // (a clearly long one: a near-round boss has no long side to align)
    if (elongation > 1.5) { longOnes++; assert.ok(Math.max(along, across) > 0.93, `long along a joint set (${along.toFixed(3)}, ${across.toFixed(3)}; elongation ${elongation.toFixed(2)})`); }
  }
}

assert.ok(longOnes > counts.bosses * 0.25, `most of them long (${longOnes} of ${counts.bosses})`);

// ---------------------------------------------------------------------------------------------- 3. the loose blocks
for (const s of stones) {
  s.computeBoundingBox();
  const c = s.boundingBox.getCenter(new (s.boundingBox.min.constructor)());
  // (a cluster spreads 1.2 m round its seat: its seat in the band, the stones within reach of it)
  let near = false;
  for (let a = 0; a < 12 && !near; a++) for (const rr of [0, 0.6, 1.2]) {
    const cv = coverOf(c.x + Math.cos(a * 0.52) * rr, c.z + Math.sin(a * 0.52) * rr);
    if (cv > KARST_COVER.blocks[0] && cv <= KARST_COVER.blocks[1]) near = true;
  }
  assert.ok(near, `a loose block at the patch's edge (${c.x.toFixed(1)}, ${c.z.toFixed(1)})`);
  const uv = s.attributes.uv;
  for (let i = 0; i < uv.count; i++) assert.ok(uv.getY(i) >= FIELD_STONE_FACE_V[0] - 0.3 && uv.getY(i) <= FIELD_STONE_FACE_V[1] + 0.3, 'the field-stone print');
}
// ---------------------------------------------------------------------------------------------- 4. the keep-outs
{
  const spots = [];
  const p = bosses.attributes.position;
  for (let b = 0; b < counts.bosses; b++) spots.push([p.getX(b * PER + PER - 1), p.getZ(b * PER + PER - 1), 'boss']);
  for (const s of stones) { s.computeBoundingBox(); spots.push([(s.boundingBox.min.x + s.boundingBox.max.x) / 2, (s.boundingBox.min.z + s.boundingBox.max.z) / 2, 'stone']); }
  for (const [x, z, what] of spots) {
    assert.ok(Math.abs(x - 120) >= KARST_KEEP.roadM - 1.6, `${what} off the road and its shoulder (${x.toFixed(1)})`);
    assert.ok(!inVillage(x, z) && !steep(x, z) && !wet(x, z), `${what} out of the village, the steep bank and the wet hollow`);
  }
  const blockedRelief = build(ground, { blocked: (x, z, r) => Math.hypot(x - 70, z - 70) < 30 + r });
  for (const st of blockedRelief.stones) {
    st.computeBoundingBox();
    assert.ok(Math.hypot((st.boundingBox.min.x + st.boundingBox.max.x) / 2 - 70, (st.boundingBox.min.z + st.boundingBox.max.z) / 2 - 70) >= 28.5, 'no stone where something stands');
  }
  const bp = blockedRelief.bosses.attributes.position;
  for (let b = 0; b < blockedRelief.counts.bosses; b++) assert.ok(Math.hypot(bp.getX(b * PER + PER - 1) - 70, bp.getZ(b * PER + PER - 1) - 70) >= 30, 'no boss where something stands');
}

// ---------------------------------------------------------------------------------------------- 5. determinism
{
  const again = build(makeGround());
  assert.deepEqual(Array.from(again.bosses.attributes.position.array), Array.from(bosses.attributes.position.array), 'deterministic for a seed');
  assert.equal(again.stones.length, stones.length, 'its stones too');
  // blind to the fold: a crest everywhere would lift the hook's cover by 0.3 if it were read
  const folded = build(makeGround({ fold: true }));
  assert.deepEqual(folded.counts, counts, 'the placement blind to the fold (the node world bakes none)');
  const phone = build(makeGround(), { mobile: true });
  assert.equal(phone.bosses, null, 'a phone builds no bosses');
  assert.equal(phone.counts.blocks, counts.blocks, 'a phone the same stones');
}

// ---------------------------------------------------------------------------------------------- 6. the wiring
{
  const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
  const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
  const at = props.indexOf('yield* placeKarstRelief();');
  assert.ok(at > props.indexOf('composeAutumnHeadlandDressing(destructibleContext') && at < props.indexOf('vegetation = null;', at)
    && at < props.indexOf('// --- merge buckets into one mesh per material ---'), 'the last of the placements, before the buckets merge');
  assert.match(props, /\(fieldWallBucket === 'fieldStone' \? buckets\.fieldStone : buckets\.stone\)\.push\(\.\.\.relief\.stones\);/, 'the field walls\' stone');
  const place = props.slice(props.indexOf('function* placeKarstRelief('), props.indexOf('yield* placeKarstRelief();'));
  assert.ok(!/obstacles\.push|colliders\.push|CrushableClutter/.test(place), 'no collision');
  assert.match(props, /blocked: \(x, z, r\) => near\(x - r, z - r, x \+ r, z \+ r, hits\)\.length > 0,/, 'clear of everything placed before it');
  assert.match(map, /mesh\.name = 'karst-bosses';\n\s*mesh\.castShadow = true;/, 'the bosses cast');
  assert.match(map, /setShadowCasterProfile\(mesh, \{ heightM: KARST_BOSS_PROUD\[1\] \}\);/, 'into the cascades their height can reach');
  assert.match(map, /bindRockBeds\(terrain, props\.group\);\n\s*bindKarstBosses\(terrain, props\.group\);/, 'bound beside the beds, with the ground\'s material');
}
console.log(`karstRelief.selftest: ${counts.bosses} bosses where the pavement is whole (proud, sunk, along the joints), ${counts.blocks} loose blocks at its edge; the keep-outs; deterministic, blind to the fold, a phone's stones the same; placed last, no collision, drawn with the ground's material`);
