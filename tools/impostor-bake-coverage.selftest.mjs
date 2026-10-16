// Trees Fix B (2026-10-15): the far-tier impostor bake keeps the near tier's crown coverage (treeImpostors.ts
// BAKE_FRAGMENT, measured by tools/impostor-bake-coverage.mjs). Before it the bake cut the leaf atlas at 0.38 with no
// mip give-back: the capture draws a whole tree into a 64–128 px tile, the cards sample the leaf atlas 3–5 mips
// down, and the needle and twig crowns baked at 0.30–0.65 of the near tier's fill, in up to 86 pieces. Pins, on the
// real seeded producers with a recording renderer:
//   - the bake fragment applies the give-back (the law's constants, on the leaf atlas's own texel derivatives) before
//     its cut, and the law stays at or under the near cards' own (the far impostor stacks its give-back on it);
//   - every ground row's baked crown fill is 0.9–1.1x the near tier's at the same screen size (the tile's), on the
//     maps of the four thin-needle atlases (pine, Aleppo pine, pinyon, red pine) and Ruin Spires (five species: the
//     64 px tile, its bare birches);
//   - the measure sees the defect: main's bake (no give-back) left every thin-needle row under the band;
//   - no baked crown breaks into more pieces than main's bake or the near tier's own crown.
// The far impostor's fill and spill at 450 / 900 m print for the record; the GPU's far-view pairs judge the look.
import assert from 'node:assert/strict';
import { measureImpostorBakeCoverage, readNearMipLaw, recordImpostorBake } from './impostor-bake-coverage.mjs';
import {
  TREE_IMPOSTOR_BAKE_ALPHA_TEST, TREE_IMPOSTOR_BAKE_MIP_BOOST, TREE_IMPOSTOR_BAKE_MIP_MAX,
} from '../src/world/treeImpostors.ts';

const MAPS = ['airfield', 'orchard', 'skybridge', 'caldera', 'ruinspires'];
const THIN_NEEDLES = new Set(['pine', 'aleppoPine', 'pinyon', 'redPine']);
const BAND = [0.9, 1.1];
const FAR = [450, 900];

const nearLaw = readNearMipLaw();
assert.ok(nearLaw.boost > 0 && nearLaw.max > 0, 'the near material\'s give-back reads from vegetation.ts');
assert.equal(TREE_IMPOSTOR_BAKE_ALPHA_TEST, 0.38, 'the bake cuts at the near material\'s own threshold');
assert.ok(TREE_IMPOSTOR_BAKE_MIP_BOOST > 0 && TREE_IMPOSTOR_BAKE_MIP_BOOST <= nearLaw.boost && TREE_IMPOSTOR_BAKE_MIP_MAX <= nearLaw.max,
  'the bake\'s give-back never exceeds the near cards\' own');
const mainLaw = { boost: 0, max: 0 };

const rows = [];
const seenForms = new Set();
let tile64 = false;
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
  if (recorded.library.tile === 64) tile64 = true;
  const now = measureImpostorBakeCoverage(id, { recorded, nearLaw, distances: FAR });
  const before = measureImpostorBakeCoverage(id, { recorded, nearLaw, distances: [], bakeLaw: mainLaw });
  assert.equal(now.rows.length, recorded.library.groundRows);
  now.rows.forEach((row, index) => {
    const old = before.rows[index];
    assert.ok(old.species === row.species && old.variant === row.variant && old.near === row.near);
    seenForms.add(row.form);
    const label = `${id} ${row.species}→${row.form}/${row.variant}`;
    assert.ok(row.ratio >= BAND[0] && row.ratio <= BAND[1],
      `${label}: baked crown fill ${row.bake} is ${row.ratio}x the near tier's ${row.near} (band ${BAND.join('–')})`);
    // (a palm's frond tips come back as pieces of their own: never more than the near tier's own crown shows)
    assert.ok(row.fragments.bake <= Math.max(old.fragments.bake, row.fragments.near),
      `${label}: the baked crown is no more broken than main's or the near tier's (${old.fragments.bake} → ${row.fragments.bake} pieces, near ${row.fragments.near})`);
    if (THIN_NEEDLES.has(row.form)) {
      assert.ok(old.ratio < BAND[0], `${label}: main's bake sat under the band (${old.ratio}x): the measure sees the defect`);
    }
    rows.push({ map: id, form: row.form, v: row.variant, tile: row.tile, before: old.bake, after: row.bake, near: row.near,
      ratio: `${old.ratio}→${row.ratio}`, pieces: `${old.fragments.bake}→${row.fragments.bake}`,
      far: Object.fromEntries(FAR.map(d => [d, `fill ${row.at[d].impostor}/${row.at[d].near} spill ${row.at[d].spill.impostor}/${row.at[d].spill.near}`])) });
  });
  recorded.world.dispose();
}
for (const form of THIN_NEEDLES) assert.ok(seenForms.has(form), `the thin-needle atlas ${form} is measured`);
assert.ok(tile64, 'a 64 px atlas (a five-species map) is measured');
for (const row of rows) console.log(JSON.stringify(row));
console.log(`impostor-bake-coverage.selftest: ${rows.length} ground rows on ${MAPS.length} maps (the four thin-needle atlases, a 64 px tile) bake their crowns at 0.9–1.1x the near tier's fill with the give-back (${TREE_IMPOSTOR_BAKE_MIP_BOOST}/mip to ${TREE_IMPOSTOR_BAKE_MIP_MAX}) before the cut, in no more pieces than main's bake or the near tier; main's bake sat under the band on every thin-needle row PASS`);
