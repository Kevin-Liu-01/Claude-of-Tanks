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
// Re-pinned 2026-10-26 (main-reds-259, Main's lane R): three selections moved by their labels alone, the owner's renames
// (240: "T-64BV Donbas" -> "T-64BV mod. 2017", 96c258ae35; 253: "Type 90 Kyū-maru" / "Type 90A" -> "STC-1" / "STC-2",
// af3d1db803). Recomputed with the old labels each equals production's digest; preset and visuals are unchanged.
// sig_type90 bcd696cc3ccade87 -> fb2d08c9f545951b, sig_type90a f2858eadd71f7c88 -> a2635ecb60ebf9d2, sig_ua_t64bv
// 09903e47298549e7 -> f2e5b458815e4d65. The same 253 rename paints the prototypes' designations ("STC-1", "STC-2" for
// "73", "90-A") on schema-1 type90 / type90a's Factory coats; with the old numbers each equals production's digest
// (type90 49f13f4a7611302c -> cc5999a15cec54d1, type90a 4b4a154b8dbb9e0d -> ee30ce99e88984dd).
// Re-pinned 2026-10-27 (owner: the T-90 names, display only): one selection moved by its label alone, the tier X
// chevron's Signature "T-90M Proryv Digital" -> "T-90AM II Digital" (t90m_proryv is the T-90AM II). With the old label
// it equals production's digest; preset, visuals and every tank row are unchanged. sig_t90m_proryv 01bb4984381e11db ->
// b46847ff7755abb9.
const RELEASE_233_SIGNATURES = ['sig_m1a1_abrams_hc', 'sig_m1a1_abrams_fep', 'sig_m60a3'];
const baseline = JSON.parse(readFileSync(new URL('./camoProductionBaseline.json', import.meta.url), 'utf8'));
const now = camoBaselineRows({ specs, policy, materials });

// Saved selections and serialized catalog indices: production's 170 ids keep their exact positions. Only paints that
// joined after GT may follow them (camoPolicy.ts AUTHORED_PAINT_IDS_AFTER_GT).
assert.equal(baseline.ids.length, 170, 'production (deploy 206) lists 170 pattern ids');
assert.deepEqual(now.ids.slice(0, baseline.ids.length), baseline.ids, 'every production index holds the same id');
assert.deepEqual(now.ids.slice(baseline.ids.length), ['paint_m6_linebacker', ...RELEASE_233_SIGNATURES, 'paint_type10_dozer'],
  'only the M6 Linebacker paint, the release-233 Signatures and the Type 10 Kaitaku paint append, after GT');
assert.deepEqual(now.catalog.slice(0, baseline.catalog.length), baseline.catalog, 'the garage picker lists production\'s schemes in order');
assert.deepEqual(now.catalog.slice(baseline.catalog.length), ['paint_m6_linebacker', ...RELEASE_233_SIGNATURES, 'paint_type10_dozer']);

// Every production id, as a saved selection, paints the same scheme (label, preset recipe and the resolved visual on
// ten reference hulls: US, Russian, German, British, Chinese, Korean, IDF, X-series and brand).
const movedSelections = baseline.ids.filter((id) => now.selections[id] !== baseline.selections[id]);
assert.deepEqual(movedSelections, [], 'production selections resolve to production\'s schemes');

// Every tank: the default selection, the Factory/stock scheme, the Factory visual and AUTO on twelve maps.
// The baseline names tanks by their tank id schema 1 spelling (2026-10-13, SSOT 2.19): each row is read through the
// alias layer, so a renamed tank is held to its own production row.
// Tanks added since production have no production row: each is named here and wears its own stock paint (2026-10-21,
// 2facf33e95: the Type 10 (Dozer), its stock coat the Type 10 Kaitaku paint appended after GT).
const ADDED_SINCE_PRODUCTION = ['type10_dozer'];
// Added since production in an existing coat, each named with the stock it wears (release 266: the M48A3 the A5's
// summer, the Magach 3 the IDF service coat, the German M48s the Bundeswehr's).
const ADDED_IN_EXISTING_COAT = { m48a3_patton: 'summer', magach3: 'service_merkava2d', m48a2ga2: 'service_leo2a6m',
  m48_super: 'service_leo2a6m' };
assert.equal(Object.keys(now.tanks).length, Object.keys(baseline.tanks).length + ADDED_SINCE_PRODUCTION.length
  + Object.keys(ADDED_IN_EXISTING_COAT).length, 'the same fleet, plus the tanks added since');
for (const id of ADDED_SINCE_PRODUCTION) assert.equal(now.tanks[id]?.stock, `paint_${id}`, `${id} wears its own stock paint`);
for (const [id, stock] of Object.entries(ADDED_IN_EXISTING_COAT)) assert.equal(now.tanks[id]?.stock, stock, `${id} wears ${stock}`);
const nowTank = (id) => now.tanks[resolveTankId(id, baseline.tankIdSchema)];
const movedTanks = Object.keys(baseline.tanks).filter((id) => JSON.stringify(nowTank(id)) !== JSON.stringify(baseline.tanks[id]));
assert.deepEqual(movedTanks, [], 'every tank\'s default camouflage is production\'s');

console.log(`camoCatalogProductionIndices.selftest: ${baseline.ids.length}/${baseline.ids.length} production ids at their `
  + `indices with the same schemes; ${Object.keys(baseline.tanks).length}/${Object.keys(baseline.tanks).length} tanks' `
  + 'selection, stock, Factory visual and AUTO equal production (afc5018e9)');
