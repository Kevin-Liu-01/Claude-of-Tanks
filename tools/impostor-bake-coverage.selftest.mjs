// Trees Fix B (2026-10-15): the far-tier impostor bake keeps the near tier's crown coverage (treeImpostors.ts
// BAKE_FRAGMENT, measured by tools/impostor-bake-coverage.mjs). Before it the bake cut the leaf atlas at 0.38 with no
// mip give-back: the capture draws a whole tree into a 64–128 px tile, the cards sample the leaf atlas 3–5 mips
// down, and the thin-needle crowns baked at 0.40–0.65 of the near tier's fill, in 11–21 pieces. Pins, on the real
// seeded producers with a recording renderer:
//   - the bake fragment applies the give-back (the law's constants) before its cut, in both passes' one program;
//   - every ground row's baked crown fill is 0.9–1.1x the near tier's at the same screen size (the tile's), on the
//     maps of the four thin-needle atlases (pine, Aleppo pine, pinyon, red pine) and the longleaf;
//   - the measure sees the defect: main's law (no give-back) leaves the thin-needle rows under the band;
//   - the far impostor gains no more than FAR_GAIN_CAP of its crown at 450–900 m over main's bake (the runtime
//     give-back stacks on the bake's: far pines must not turn solid).
// CPU only; the GPU's far-view pairs judge the look.
import assert from 'node:assert/strict';
import { measureImpostorBakeCoverage, readNearMipLaw, recordImpostorBake } from './impostor-bake-coverage.mjs';
import {
  TREE_IMPOSTOR_BAKE_ALPHA_TEST, TREE_IMPOSTOR_BAKE_MIP_BOOST, TREE_IMPOSTOR_BAKE_MIP_MAX,
} from '../src/world/treeImpostors.ts';

const MAPS = ['airfield', 'orchard', 'skybridge', 'caldera', 'longleaf'];
const THIN_NEEDLES = new Set(['pine', 'aleppoPine', 'pinyon', 'redPine']);
const BAND = [0.9, 1.1];
const FAR = [450, 600, 900];
const FAR_GAIN_CAP = 0.2;

const nearLaw = readNearMipLaw();
assert.ok(nearLaw.boost > 0 && nearLaw.max > 0, 'the near material\'s give-back reads from vegetation.ts');
assert.equal(TREE_IMPOSTOR_BAKE_ALPHA_TEST, 0.38, 'the bake cuts at the near material\'s own threshold');
assert.ok(TREE_IMPOSTOR_BAKE_MIP_BOOST > 0 && TREE_IMPOSTOR_BAKE_MIP_BOOST <= nearLaw.boost && TREE_IMPOSTOR_BAKE_MIP_MAX <= nearLaw.max,
  'the bake\'s give-back never exceeds the near cards\' own');

const rows = [];
const seenForms = new Set();
for (const id of MAPS) {
  const recorded = recordImpostorBake(id);
  // the bake program: the give-back, then the cut (the foliage bake materials; the bark's cut is 0)
  const foliage = recorded.ground.meshes.filter(m => m.alphaTest > 0);
  assert.ok(foliage.length > 0, `${id}: the foliage bake meshes were recorded`);
  for (const m of foliage) {
    const src = m.fragmentShader;
    const giveBack = src.indexOf(`tex.a *= 1.0 + min( bakeMip, ${TREE_IMPOSTOR_BAKE_MIP_MAX.toFixed(2)} ) * ${TREE_IMPOSTOR_BAKE_MIP_BOOST.toFixed(3)};`);
    const cut = src.indexOf('if ( tex.a < uAlphaTest ) discard;');
    assert.ok(giveBack > 0 && cut > giveBack, `${id}: the bake fragment applies the give-back before the cut`);
    assert.match(src, /dFdx\( vBakeUv \* bakeTs \)/, `${id}: the give-back reads the leaf atlas's own texel derivatives`);
    assert.equal(m.alphaTest, TREE_IMPOSTOR_BAKE_ALPHA_TEST);
  }
  const now = measureImpostorBakeCoverage(id, { recorded, nearLaw, distances: FAR });
  const before = measureImpostorBakeCoverage(id, { recorded, nearLaw, distances: FAR, bakeLaw: { boost: 0, max: 0 } });
  now.rows.forEach((row, index) => {
    const old = before.rows[index];
    assert.equal(old.form, row.form); assert.equal(old.variant, row.variant);
    seenForms.add(row.form);
    const label = `${id} ${row.form}/${row.variant}`;
    assert.ok(row.ratio >= BAND[0] && row.ratio <= BAND[1], `${label}: baked crown fill ${row.bake} is ${row.ratio}x the near tier's ${row.near} (band ${BAND.join('–')})`);
    assert.ok(row.fragments.bake <= Math.max(old.fragments.bake, row.fragments.near + 2), `${label}: the baked crown is no more broken than before (${old.fragments.bake} → ${row.fragments.bake} pieces)`);
    for (const d of FAR) {
      const gain = row.at[d].impostor - old.at[d].impostor;
      assert.ok(gain <= FAR_GAIN_CAP, `${label}: at ${d} m the far impostor gains ${gain.toFixed(3)} of its crown (${old.at[d].impostor} → ${row.at[d].impostor}; cap ${FAR_GAIN_CAP})`);
    }
    if (THIN_NEEDLES.has(row.form)) assert.ok(old.ratio < BAND[0], `${label}: main's bake (no give-back) sat under the band (${old.ratio}x): the measure sees the defect`);
    rows.push({ map: id, form: row.form, v: row.variant, before: old.bake, after: row.bake, near: row.near, ratio: row.ratio,
      far: Object.fromEntries(FAR.map(d => [d, `${old.at[d].impostor}→${row.at[d].impostor}/${row.at[d].near}`])) });
  });
  recorded.world.dispose();
}
for (const form of THIN_NEEDLES) assert.ok(seenForms.has(form), `the thin-needle atlas ${form} is measured`);
console.log(JSON.stringify(rows));
console.log(`impostor-bake-coverage.selftest: ${rows.length} ground rows on ${MAPS.length} maps (the four thin-needle atlases and the longleaf) bake their crowns at 0.9–1.1x the near tier's fill with the give-back before the cut; main's law sat under the band on the thin needles; the far impostor gains ≤ ${FAR_GAIN_CAP} of its crown at 450–900 m PASS`);
