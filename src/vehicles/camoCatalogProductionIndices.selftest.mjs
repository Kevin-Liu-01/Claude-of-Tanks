import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './tankFactory.ts';
import * as specs from './specs.ts';
import * as policy from './camoPolicy.ts';
import * as materials from './materials.ts';
import { camoBaselineRows } from './camoProductionBaseline.test-support.mjs';
import { resolveTankId } from './tankIdAliases.ts';

// fix/camo-defaults (2026-10-09). PR #9 moved 69 tanks' Factory coat, AUTO to national theatre coats, bots off their
// own paint, and the field schemes onto a shared patch-field painter. The owner on launch day: "why did you break camos?
// they only show generic camos now instead of the cool camos we had before", then "yeah our entire camo system before
// was better" (R113, 2026-09-21: "i want the default camos of our tanks to be what they were before, but just organized
// a lot better"). Production's camouflage system is restored. This receipt holds it to production row for row.
// Re-pinned 2026-10-21 (art fixes 230, coordinator-approved against R113): the hero-card critic read the Merkava Mk 3
// Baz's Caunter slate band as "a light-blue sawtooth band ... like a texture glitch". sig_merkava3d's slate patch moved
// from #68757d (blue-grey) to the same-luminance Sinai olive-grey #76735f; the preset, scheme and every default
// selection are unchanged. Exactly two rows moved: selection sig_merkava3d (2bf6987790749ba5 -> 87f9b1b959d01a99) and
// tank merkava3d's Factory visual (f2284f4ef30bcf9c -> 34f578016ea95c79).
// Re-pinned 2026-10-21 (release 233; owner: "make the m1a1 HA, AIM, FEP, HC, and SA look a lot more different
// noticeably than each other ... same with m60a3 and m60a1"): seven tanks wear their own service paint as a new
// Signature (camoPolicy.ts RELEASE_233_SIGNATURE_IDS, appended after the M6 Linebacker paint, so no index moves).
// Exactly those seven tanks' stock and Factory rows moved (m1a1ha, m1a2, m1a2_tusk, m1a2_sepv2, m1a2_sepv3, m60a1,
// m60a3 in schema-1 spelling), plus the Factory and Signature selections, which the baseline resolves on the
// m1a1_abrams_hc reference hull (factory 130188c39662f598 -> cdeb9d9dad770dc5, signature 0d9b13b723f61536 ->
// 8e14071f076cca31).
// Re-pinned 2026-10-22 (owner: "i dont like the monnocolor flat camos, just use the default americann desert for those
// kinds of cases"): the four flat coats (HA, AIM, SA, M60A1) are gone; m1a1ha, m1a2_tusk, m1a2_sepv2 and m60a1 are back
// on their production rows byte for byte, and the three patterned Signatures (HC, FEP, M60A3) stay.
const RELEASE_233_SIGNATURES = ['sig_m1a1_abrams_hc', 'sig_m1a1_abrams_fep', 'sig_m60a3'];
const baseline = JSON.parse(readFileSync(new URL('./camoProductionBaseline.json', import.meta.url), 'utf8'));
const now = camoBaselineRows({ specs, policy, materials });

// Saved selections and serialized catalog indices: production's 170 ids keep their exact positions. Only paints that
// joined after GT may follow them (camoPolicy.ts AUTHORED_PAINT_IDS_AFTER_GT).
assert.equal(baseline.ids.length, 170, 'production (deploy 206) lists 170 pattern ids');
assert.deepEqual(now.ids.slice(0, baseline.ids.length), baseline.ids, 'every production index holds the same id');
assert.deepEqual(now.ids.slice(baseline.ids.length), ['paint_m6_linebacker', ...RELEASE_233_SIGNATURES, 'paint_type10_dozer'],
  'only the M6 Linebacker paint, the release-233 Signatures and the Type 10 (Dozer) paint append, after GT');
assert.deepEqual(now.catalog.slice(0, baseline.catalog.length), baseline.catalog, 'the garage picker lists production\'s schemes in order');
assert.deepEqual(now.catalog.slice(baseline.catalog.length), ['paint_m6_linebacker', ...RELEASE_233_SIGNATURES, 'paint_type10_dozer']);

// Every production id, as a saved selection, paints the same scheme (label, preset recipe and the resolved visual on
// ten reference hulls: US, Russian, German, British, Chinese, Korean, IDF, X-series and brand).
const movedSelections = baseline.ids.filter((id) => now.selections[id] !== baseline.selections[id]);
assert.deepEqual(movedSelections, [], 'production selections resolve to production\'s schemes');

// Every tank: the default selection, the Factory/stock scheme, the Factory visual and AUTO on twelve maps.
// The baseline names tanks by their tank id schema 1 spelling (2026-10-13, SSOT 2.19): each row is read through the
// alias layer, so a renamed tank is held to its own production row.
assert.equal(Object.keys(now.tanks).length, Object.keys(baseline.tanks).length, 'the same fleet');
const nowTank = (id) => now.tanks[resolveTankId(id, baseline.tankIdSchema)];
const movedTanks = Object.keys(baseline.tanks).filter((id) => JSON.stringify(nowTank(id)) !== JSON.stringify(baseline.tanks[id]));
assert.deepEqual(movedTanks, [], 'every tank\'s default camouflage is production\'s');

console.log(`camoCatalogProductionIndices.selftest: ${baseline.ids.length}/${baseline.ids.length} production ids at their `
  + `indices with the same schemes; ${Object.keys(baseline.tanks).length}/${Object.keys(baseline.tanks).length} tanks' `
  + 'selection, stock, Factory visual and AUTO equal production (afc5018e9)');
