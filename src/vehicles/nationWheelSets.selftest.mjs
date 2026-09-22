// Nation road-wheel sets (owner 2026-09-22: "standardize our wheels across NATIONS! then we can delete any
// wheels we dont use anymore"; correction: "sabra uses the m60a3 wheels"). Pure table/resolver/builder receipt:
// no tank is built here (the fleet build is wheelQuality.selftest and tools/wheel-review.mjs --all --gate).
import assert from 'node:assert/strict';
import './tankFactory.ts';
import { ALL_TANK_IDS, TANK_SPECS } from './specs.ts';
import {
  NATION_WHEEL_SETS, PERIOD_WHEEL_HULLS, WHEEL_DONORS, WHEEL_DONOR_IDS, WHEEL_STANDARD_EXCEPTIONS, resolveNationWheel,
} from './nationWheelSets.ts';
import { BUILDABLE_WHEEL_CONSTRUCTIONS, NATION_WHEEL_AXIAL_FIT, buildNationWheel } from './nationWheelConstructions.ts';
import { WHEEL_PATTERN_DEFINITIONS, wheelPatternFor } from './wheelPatterns.ts';

const playable = new Set(ALL_TANK_IDS);
const kinds = { keep: [], donor: [], standard: [] };
const consumersByConstruction = new Map();
for (const id of ALL_TANK_IDS) {
  const spec = TANK_SPECS[id];
  const resolution = resolveNationWheel(spec);
  kinds[resolution.kind].push(id);
  if (resolution.kind !== 'keep') {
    assert.ok(WHEEL_DONORS[resolution.donor], `${id}: resolves to a listed donor`);
    assert.equal(resolution.pattern, WHEEL_DONORS[resolution.donor].pattern, `${id}: pattern is the donor's`);
    assert.equal(resolution.construction, WHEEL_DONORS[resolution.donor].construction, `${id}: construction is the donor's`);
    assert.ok(WHEEL_PATTERN_DEFINITIONS[resolution.pattern], `${id}: donor pattern is authored`);
    assert.equal(wheelPatternFor(spec).id, resolution.pattern, `${id}: wheelPatternFor reads the nation table`);
  }
  if (resolution.kind === 'standard') {
    assert.ok(BUILDABLE_WHEEL_CONSTRUCTIONS.includes(resolution.construction),
      `${id}: standardized hull needs a buildable construction (${resolution.construction})`);
    consumersByConstruction.set(resolution.construction, (consumersByConstruction.get(resolution.construction) ?? 0) + 1);
  }
  assert.ok(resolution.reason.length > 8, `${id}: every resolution carries its reason`);
}
assert.equal(kinds.keep.length + kinds.donor.length + kinds.standard.length, ALL_TANK_IDS.length);

// Period hulls: exactly the pre-1950 (era 'ww2') roster, and every one keeps its own wheel code.
const ww2 = ALL_TANK_IDS.filter((id) => TANK_SPECS[id].era === 'ww2').sort();
assert.deepEqual([...PERIOD_WHEEL_HULLS].sort(), ww2, 'PERIOD_WHEEL_HULLS lists exactly the ww2-era roster');
assert.deepEqual(kinds.keep.sort(), ww2, 'only the period hulls keep their own wheels (community hulls are not playable)');

// Donors: every self id is playable, resolves as a donor of that record, and no id belongs to two donors.
const seenSelf = new Set();
for (const donor of WHEEL_DONOR_IDS) {
  const record = WHEEL_DONORS[donor];
  assert.equal(record.donor, donor);
  for (const id of record.self) {
    assert.ok(playable.has(id), `${donor}: self id ${id} is playable`);
    assert.ok(!seenSelf.has(id), `${id} listed under two donors`); seenSelf.add(id);
    const resolution = resolveNationWheel(TANK_SPECS[id]);
    assert.equal(resolution.kind, 'donor', `${id}: draws its donor construction natively`);
    assert.equal(resolution.donor, donor);
  }
  // A donor-only construction (no builder) must not be consumed by any other hull.
  if (!BUILDABLE_WHEEL_CONSTRUCTIONS.includes(record.construction)) {
    assert.equal(consumersByConstruction.get(record.construction) ?? 0, 0,
      `${record.construction} has no builder, so no non-donor hull may resolve to it`);
  }
}
// Every listed donor tank id itself is playable (the owner named real roster tanks).
for (const donor of WHEEL_DONOR_IDS) assert.ok(playable.has(donor), `donor ${donor} is a playable id`);
// Every nation set rule names a listed donor and ends with a catch-all rule.
for (const [nation, rules] of Object.entries(NATION_WHEEL_SETS)) {
  assert.ok(rules.length >= 1, `${nation}: has rules`);
  for (const rule of rules) assert.ok(WHEEL_DONORS[rule.donor], `${nation}: rule donor ${rule.donor} listed`);
  const last = rules[rules.length - 1];
  assert.ok(!last.roles && !last.eras && !last.ids, `${nation}: last rule matches every remaining hull`);
}
for (const [id, exception] of Object.entries(WHEEL_STANDARD_EXCEPTIONS)) {
  assert.ok(playable.has(id), `exception ${id} is playable`);
  assert.ok(WHEEL_DONORS[exception.donor], `exception ${id} names a listed donor`);
}

// The owner's rulings, one assertion each.
const expect = (id, donor, kind = 'standard') => {
  const r = resolveNationWheel(TANK_SPECS[id]);
  assert.equal(`${r.kind}:${r.donor}`, `${kind}:${donor}`, `${id} → ${kind}:${donor} (got ${r.kind}:${r.donor}; ${r.reason})`);
};
expect('sabra_mk2_x', 'm60a3');                 // owner 2026-09-22 correction
expect('m60a1', 'm60a3'); expect('m48', 'm60a3'); expect('m46_patton', 'm60a3');
expect('m1a3', 'm1a2'); expect('abramsx', 'm1a2'); expect('m1a2_legacy', 'm1a2');
expect('m1a2', 'm1a2', 'donor'); expect('ua_m1a1', 'm1a2', 'donor');
expect('m551_sheridan', 'm551a1_tts'); expect('griffin_viper', 'm551a1_tts'); expect('ua_m2a3_bradley', 'm551a1_tts');
expect('type59', 'ztz100_x'); expect('ztz100_prototype', 'ztz100_x'); expect('aft10_x', 'type100');
expect('merkava1b', 'merkava4b'); expect('merkava4_barak', 'merkava4b'); expect('namer_ifv', 'namer_ifv', 'donor');
expect('strv81', 'strv122'); expect('strv103', 'strv122'); expect('strv122', 'strv122'); expect('cv90', 'cv90_mkiv_x');
expect('k1a1', 'k1a1'); expect('k2b', 'k2'); expect('k21_x', 'k1a1'); expect('bmp3_rok', 'k1a1');
expect('pt91m', 'pl01'); expect('t72m1_jaguar', 'pl01'); expect('upior', 'bwp1');
expect('type10', 'type10'); expect('type89_light_tiger', 'type10'); expect('type74', 'type90'); expect('type89', 'type90');
expect('carro45t', 'ariete_c1'); expect('ariete', 'ariete_c1'); expect('ariete_c2_x', 'ariete_c1', 'donor');
expect('leclerc', 'leclerc_xlr'); expect('leclerc_xlr', 'leclerc_xlr'); expect('amx56', 'leclerc_xlr'); expect('leclerc_classic_x', 'leclerc_xlr');
expect('amx30', 'amx40'); expect('amx40', 'amx40'); expect('amx40_x', 'amx40', 'donor');
expect('chieftain5', 'challenger2e'); expect('challenger1_x', 'challenger2e'); expect('centurion3', 'challenger2e');
expect('challenger_3x', 'challenger_3', 'donor'); expect('ua_challenger2', 'challenger2e', 'donor');
expect('fv510', 'fv510_milan_x'); expect('ajax_x', 'fv510_milan_x'); expect('ares_apc_x', 'fv510_milan_x');
expect('t62mv1', 't90'); expect('t80u_x', 't90m'); expect('t72b3m', 't90m'); expect('t90', 't90m'); expect('t90_x', 't90m');
expect('t90m_x', 't90m', 'donor'); expect('t14_x', 't14', 'donor'); expect('t14', 't14', 'donor');
expect('bmpt_terminator2', 't90m'); expect('bmpt_t90', 't90m'); expect('tos1a_tagil', 't90m');
expect('bmp3', 'bmp3m_dragun125_x'); expect('bmp2', 'bmp3m_dragun125_x'); expect('kurganets25_x', 'bmp3m_dragun125_x'); expect('object695_x', 'bmp3m_dragun125_x');
expect('ua_t64bv', 't90'); expect('t84', 't90'); expect('ua_t80u_kursk', 't90');
expect('kf51b', 'kf51', 'donor'); expect('leo2a4', 'leo2a6'); expect('leo2a6', 'leo2a6'); expect('mbt70', 'leo2a6'); expect('leo2a6_ua', 'leo2a6');
expect('spz_puma', 'kf41_lynx_x'); expect('marder1a3', 'kf41_lynx_x'); expect('leo2a6_x', 'leo2a6', 'donor');
for (const id of ['tiger1', 'kv2', 't95', 'm26_pershing', 'jpz_e100_x']) {
  assert.equal(resolveNationWheel(TANK_SPECS[id]).kind, 'keep', `${id} keeps its period wheels`);
}

// wheelPatternFor: the table wins; a profile may only restate it.
assert.equal(wheelPatternFor(TANK_SPECS.leo2a4, 'rubber', 'plain-dish-twelve').id, 'plain-dish-twelve');
assert.throws(() => wheelPatternFor(TANK_SPECS.leo2a4, 'rubber', 'pressed-six'), /contradicts the nation standard/);
assert.equal(wheelPatternFor(TANK_SPECS.tiger1, 'dished').id, 'interleaved-dish', 'period rule');
assert.equal(wheelPatternFor(TANK_SPECS.tiger1, 'dished', 'christie-six').id, 'christie-six', 'period hulls may still override');
assert.equal(wheelPatternFor({ id: 'recon_tank', nation: 'Community', era: 'modern', role: 'light' }).id, 'split-rim-ten', 'community placeholder default');
assert.throws(() => wheelPatternFor(TANK_SPECS.leo2a4, 'rubber', 'no-such-pattern'), /Unknown wheel pattern/);

// Every buildable construction draws at a foreign size at both tiers: closed solids, a radius that matches the
// request, layers with paints and roles, and an axial fit inside the window.
const radialExtent = (g) => { const p = g.getAttribute('position'); let r = 0; for (let i = 0; i < p.count; i++) r = Math.max(r, Math.hypot(p.getY(i), p.getZ(i))); return r; };
const axialHalf = (g, outset = 0) => { g.computeBoundingBox(); const b = g.boundingBox; return Math.max(Math.abs(b.min.x), Math.abs(b.max.x)) + Math.abs(outset); };
for (const construction of BUILDABLE_WHEEL_CONSTRUCTIONS) {
  for (const high of [true, false]) {
    for (const [radiusM, axialWidthM] of [[.35, .34], [.42, .55], [.29, .27]]) {
      const built = buildNationWheel(construction, { radiusM, axialWidthM, high, segments: high ? 26 : 12 });
      assert.ok(built.disc.getAttribute('position').count >= 12, `${construction}: disc has geometry`);
      const r = radialExtent(built.tire ?? built.disc);
      assert.ok(Math.abs(r - radiusM) < 1e-3 * radiusM + 1e-9, `${construction}/${high ? 'high' : 'low'}: radius ${r} fits ${radiusM}`);
      assert.ok(built.axialScale >= NATION_WHEEL_AXIAL_FIT.min && built.axialScale <= NATION_WHEEL_AXIAL_FIT.max, `${construction}: axial fit in window`);
      for (const layer of built.layers) {
        assert.ok(['dish', 'dark', 'detail', 'rubber'].includes(layer.paint) && ['wheelDish', 'wheelInset', 'wheelTire'].includes(layer.role), `${construction}: layer ${layer.name} typed`);
        assert.ok(layer.geometry.getAttribute('position').count >= 3, `${construction}: layer ${layer.name} has geometry`);
      }
      // The built wheel fills the requested envelope unless the fit window clamped it.
      let half = 0;
      for (const g of [built.tire, built.disc, built.dark]) if (g) half = Math.max(half, axialHalf(g));
      for (const layer of built.layers) half = Math.max(half, axialHalf(layer.geometry, layer.outset));
      if (built.axialScale > NATION_WHEEL_AXIAL_FIT.min && built.axialScale < NATION_WHEEL_AXIAL_FIT.max) {
        assert.ok(Math.abs(2 * half - axialWidthM) < .012, `${construction}: envelope ${(2 * half).toFixed(4)} ≈ ${axialWidthM}`);
      }
      for (const g of [built.tire, built.disc, built.dark, ...built.layers.map((l) => l.geometry)]) g?.dispose();
    }
  }
}
// Offset-seated dressing keeps its protrusion proportional to the radius under an axial stretch (griffin50_x, 2026-09-22).
{
  const built = buildNationWheel('sheridan-pressed-rim', { radiusM: .3225, axialWidthM: .547, high: true, segments: 26 });
  assert.equal(built.axialScale, NATION_WHEEL_AXIAL_FIT.max, 'the Griffin envelope hits the fit ceiling');
  const rim = built.layers.find((l) => l.name === 'gearRoadWheelPressedRims');
  const proud = axialHalf(rim.geometry, rim.outset) - axialHalf(built.tire);
  assert.ok(proud < .025 && proud > .010, `rim protrusion ${proud.toFixed(4)} stays seated`);
}
assert.throws(() => buildNationWheel('namer-stepped-hub', { radiusM: .3, axialWidthM: .3, high: true, segments: 20 }), /donor-only/);
assert.throws(() => buildNationWheel('k2-flanged', { radiusM: 0, axialWidthM: .3, high: true, segments: 20 }), /Invalid nation wheel request/);

console.log(`nationWheelSets.selftest: ${ALL_TANK_IDS.length} hulls — ${kinds.donor.length} donor, ${kinds.standard.length} standardized, ${kinds.keep.length} period; ${BUILDABLE_WHEEL_CONSTRUCTIONS.length} constructions build at foreign sizes`);
