// Exact part contact in every assembled kit (the buildings and landmarks lane, 2026-10-10; the owner on the relay
// station's roof mast: "look at this monstrosity" — legs splayed apart, rungs floating between them, the top pole
// hanging over the gap, all of it passing the bounds-based gates).
//
// Every kit build is split into its welded mesh components (one per authored member, even merged) and every member must
// reach the ground through members whose convex hulls come within 2 cm (partContact.ts: GJK on the vertex sets). A bar
// standing off the vertical (a rung, a brace, a strut) must meet something at both ends.
//
// The kits audited: the light (destructible) buildings, intact and wrecked; the regional kits' destructible variants;
// the heavyweight structure builders; every regional architecture kit's builders; every set-piece builder at its
// defaults. Kits that predate the receipt carry their counts in kitConnectivity.baseline.json: a count may only fall
// (fix it, then lower it with COT_KIT_CONNECTIVITY_WRITE=1), a kit missing from it must be clean, and the relay station
// the owner flagged is pinned clean. COT_KIT_CONNECTIVITY_REPORT=<path> writes the full report.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { auditPartContact, convexDistance, weldedComponents } from './partContact.ts';
import { DESTRUCTIBLE_BUILDING_TYPES, REGIONAL_DESTRUCTIBLE_TYPES, STRUCTURE_BUILDERS } from './maps/structureKit.ts';
import { ARCHITECTURE_STYLES, buildRegionalParts } from './maps/regional/index.ts';
import { streamFrom } from './maps/regional/geometry.ts';
import { LANDMARK_BUILDERS } from './landmarks/index.ts';
import { resolveLandmarkParams } from './landmarks/plan.ts';

const TOLERANCE = 0.02;
const BASELINE_URL = new URL('./kitConnectivity.baseline.json', import.meta.url);

// ------------------------------------------------------------------------------------------------- the GJK itself
{
  const cube = (cx, cy, cz, s) => {
    const p = [];
    for (const x of [-s, s]) for (const y of [-s, s]) for (const z of [-s, s]) p.push(cx + x, cy + y, cz + z);
    return Float64Array.from(p);
  };
  assert.ok(Math.abs(convexDistance(cube(0, 0, 0, 0.5), cube(2, 0, 0, 0.5)) - 1) < 1e-9, 'two unit cubes 1 m apart');
  assert.equal(convexDistance(cube(0, 0, 0, 0.5), cube(0.9, 0.3, 0, 0.5)), 0, 'overlapping cubes touch');
  assert.ok(Math.abs(convexDistance(cube(0, 0, 0, 0.5), cube(1.5, 1.5, 1.5, 0.5)) - Math.sqrt(3) * 0.5) < 1e-6, 'corner to corner');
  // the relay's old fault in miniature: a tilted leg's bounds reach a rung its steel never touches
  const leg = new THREE.BoxGeometry(0.14, 5.4, 0.14); leg.rotateZ(-0.075); leg.translate(0.36, 2.65, 0);
  const rung = new THREE.BoxGeometry(0.56, 0.12, 0.22); rung.translate(0, 4.35, 0);
  const base = new THREE.BoxGeometry(2, 0.1, 2); base.translate(0, -0.05, 0);
  const report = auditPartContact(weldedComponents([base, leg, rung]), { tolerance: TOLERANCE });
  assert.equal(report.floating.length, 1, 'the rung beside the splayed leg floats (its bounds overlap the leg\'s)');
  // a merged buffer keeps its members apart: two boxes in one geometry are two components
  const merged = new THREE.BufferGeometry();
  const a = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), b = new THREE.BoxGeometry(1, 1, 1).translate(3, 0, 0).toNonIndexed();
  merged.setAttribute('position', new THREE.Float32BufferAttribute([...a.getAttribute('position').array, ...b.getAttribute('position').array], 3));
  assert.equal(weldedComponents([merged]).length, 2, 'members merged into one buffer stay two components');
  // a brace that reaches one leg only has a free end
  const post0 = new THREE.BoxGeometry(0.1, 3, 0.1).translate(0, 1.5, 0), post1 = new THREE.BoxGeometry(0.1, 3, 0.1).translate(2, 1.5, 0);
  const brace = new THREE.BoxGeometry(0.05, 1.4, 0.05); brace.rotateZ(-Math.PI / 4); brace.translate(0.5, 1.5, 0);
  const dangling = auditPartContact(weldedComponents([post0, post1, brace]), { tolerance: TOLERANCE });
  assert.equal(dangling.floating.length, 0);
  assert.equal(dangling.dangling.length, 1, 'the brace touching one post has one free end');
}

// ------------------------------------------------------------------------------------------------- the kits
const seeded = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; };
const results = new Map();
/** A wreck's pieces lie as they fell: their free bar ends are reported, not ratcheted (they must still lie on something). */
function audit(id, geometries, { groundY = 0.05, wreck = false } = {}) {
  const components = weldedComponents(geometries);
  const report = auditPartContact(components, { tolerance: TOLERANCE, groundY });
  results.set(id, {
    components: report.components, floating: report.floating.length, dangling: wreck ? 0 : report.dangling.length,
    wreckEnds: wreck ? report.dangling.length : undefined,
    islands: report.islands.length,
    worst: report.islands.slice(0, 4).map((f) => ({ members: f.members,
      min: f.min.map((v) => +v.toFixed(2)), max: f.max.map((v) => +v.toFixed(2)), gap: +f.gap.toFixed(3) })),
    ends: report.dangling.slice(0, 4).map((d) => ({ end: d.end.map((v) => +v.toFixed(2)), gap: Number.isFinite(d.gap) ? +d.gap.toFixed(3) : null })),
  });
  for (const g of geometries) g.dispose?.();
}

for (const [id, meta] of Object.entries(DESTRUCTIBLE_BUILDING_TYPES)) {
  audit(`light:${id}/intact`, [meta.build(seeded(17))]);
  audit(`light:${id}/broken`, [meta.broken(seeded(0x71f00d))], { wreck: true });
}
for (const [region, types] of Object.entries(REGIONAL_DESTRUCTIBLE_TYPES)) {
  for (const [id, meta] of Object.entries(types)) {
    audit(`regional-light:${region}:${id}/intact`, [meta.build(seeded(23))]);
  }
}
const bucketSet = () => Object.fromEntries(['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain',
  'straw', 'baked', 'steel', 'structureMetal'].map((k) => [k, []]));
for (const [id, builder] of Object.entries(STRUCTURE_BUILDERS)) {
  const buckets = bucketSet();
  builder(seeded(5), buckets);
  audit(`heavy:${id}`, Object.values(buckets).flat());
}
/** Representative base footprints of the plan ids (regionalArchitecture.selftest.mjs INFO). */
const INFO = {
  alpine: [8.7, 10.5, 6.7], logcabin: [6.2, 7.0, 4.0], onionchurch: [7.5, 10.0, 12.2], yardshed: [3.6, 3.0, 3.2],
  cottage: [6.0, 8.4, 5.0], farmhouse: [13.4, 9.9, 6.0], tavern: [9.7, 14.9, 8.4], schoolhouse: [9.1, 16.1, 11],
  cornershop: [9.0, 9.0, 7.3], barn: [8.4, 12.3, 6.2], granary: [4.2, 6.4, 4.7], woodshed: [4.3, 5.4, 3.1],
  depot: [11, 20, 6], ruin: [6.8, 9.0, 3.0], church: [9.6, 23.1, 20.4], chapel: [5.8, 8.6, 8.0], mill: [6.6, 6.6, 9.9],
  boatshed: [9.0, 12.0, 5.0], tower: [3.8, 3.8, 9.4], foundryoffice: [13.5, 14.4, 9.8], warehouse: [16, 24, 7.5],
  rangerlodge: [12.8, 16.4, 10.7], marketRow: [12, 5.2, 3.2], fishery: [18, 20, 7], rowhouse: [9.6, 10.2, 11],
  adobe: [6.6, 7.6, 4.2], caravanserai: [21.4, 19.4, 7.4], compound: [23, 14.5, 5.6], compoundSouk: [22, 16, 6],
  minaret: [4, 4, 13], bathhouse: [11, 10, 7], factory: [16, 26, 15], watertower: [5.6, 5.6, 14],
  shed: [8, 14, 6], stack: [3.4, 3.4, 26], market: [6.6, 5.2, 3.0], containerRow: [15, 6.4, 3.4], gantry: [21, 5.4, 12],
  firestation: [11.8, 15.4, 14.1],
  megatower: [23.7, 24.7, 64.8], needletower: [19, 21, 64.9], arcology: [31, 23.2, 49.7], terracetower: [25.4, 22.4, 56.3],
  civichall: [33.2, 22.8, 14.7], parkingdeck: [27.4, 22.4, 13.7], broadcasttower: [24.2, 20.2, 60.1],
};
for (const style of ARCHITECTURE_STYLES) {
  for (const id of Object.keys(style.builders)) {
    const [w, d, h] = INFO[id] ?? [7, 9, 6];
    const parts = buildRegionalParts(style, {
      structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
      wallBucket: 'stone', rng: streamFrom(11), variant: streamFrom(80), mapId: 'selftest', snowCap: false, tier: 'desktop',
    }, streamFrom(38));
    audit(`kit:${style.id}:${id}`, Object.values(parts).flat());
  }
}
for (const [kind, builder] of Object.entries(LANDMARK_BUILDERS)) {
  const params = resolveLandmarkParams({ kind, x: 0, z: 0 });
  const build = builder({ kind, params, rng: streamFrom(101), variant: streamFrom(202), age: streamFrom(303), tier: 'desktop',
    groundFall: 0, brick: false, snowCap: false, mapId: 'selftest' });
  // a bridge's piers stand on its bed (y = 0 is the stream bed: plan.ts), a quay's foot in the water
  audit(`landmark:${kind}`, Object.values(build.parts).flat());
}

// ------------------------------------------------------------------------------------------------- the ratchet
const rows = [...results.entries()].sort(([a], [b]) => a.localeCompare(b));
const dirty = rows.filter(([, r]) => r.floating || r.dangling);
console.log(`kit connectivity: ${rows.length} builds, ${dirty.length} with floating members or free bar ends (tolerance ${TOLERANCE * 100} cm)`);
for (const [id, r] of dirty) {
  console.log(`  ${id}: ${r.floating} floating of ${r.components}, ${r.dangling} free ends${r.worst.length ? ` — worst ${JSON.stringify(r.worst[0])}` : ''}`);
}
if (process.env.COT_KIT_CONNECTIVITY_REPORT) {
  writeFileSync(process.env.COT_KIT_CONNECTIVITY_REPORT, JSON.stringify(Object.fromEntries(rows), null, 1));
}
if (process.env.COT_KIT_CONNECTIVITY_WRITE === '1') {
  writeFileSync(BASELINE_URL, `${JSON.stringify(Object.fromEntries(dirty.map(([id, r]) => [id, { floating: r.floating, dangling: r.dangling }])), null, 1)}\n`);
  console.log(`wrote ${BASELINE_URL.pathname} (${dirty.length} kits with debt)`);
}
const baseline = existsSync(BASELINE_URL) ? JSON.parse(readFileSync(BASELINE_URL, 'utf8')) : {};
// the owner's relay station: clean, intact and wrecked
for (const id of ['light:relaystation/intact', 'light:relaystation/broken']) {
  const r = results.get(id);
  assert.ok(r, `${id} audited`);
  assert.equal(r.floating, 0, `${id}: no floating member (${JSON.stringify(r.worst)})`);
}
assert.equal(results.get('light:relaystation/intact').dangling, 0, 'the relay mast: every brace meets a leg at both ends');
assert.ok(!baseline['light:relaystation/intact'], 'the relay station carries no debt');
const regressions = [];
for (const [id, r] of rows) {
  const allowed = baseline[id] ?? { floating: 0, dangling: 0 };
  if (r.floating > allowed.floating || r.dangling > allowed.dangling) {
    regressions.push(`${id}: ${r.floating} floating (baseline ${allowed.floating}), ${r.dangling} free ends (baseline ${allowed.dangling})`);
  }
}
for (const id of Object.keys(baseline)) if (!results.has(id)) regressions.push(`${id}: in the baseline but no longer built (drop it)`);
assert.deepEqual(regressions, [], `kits gained floating members or free bar ends:\n${regressions.join('\n')}`);
const improved = rows.filter(([id, r]) => baseline[id] && (r.floating < baseline[id].floating || r.dangling < baseline[id].dangling));
if (improved.length) console.log(`  ${improved.length} kits improved on their baseline: lower it (COT_KIT_CONNECTIVITY_WRITE=1)`);
console.log('kitConnectivity selftest passed');
