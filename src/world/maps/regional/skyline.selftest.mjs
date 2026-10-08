// The skyline kit (facades & skyline lane, 2026-10-05): every tall- and big-building builder, at every damage state and on
// the plots a city kit gives it, builds sound geometry the way a regional kit's builder must (regionalArchitecture
// .selftest.mjs holds the same laws for the registered kits):
//   - deterministic for one seed, finite, one attribute set per bucket, vertex colours exactly in the coloured buckets,
//     the night mask exactly on curtain panes, regional tags, dressing flagged noCollision;
//   - every part reaches the ground through a chain of contacts; a derivable collision profile whose shell bands keep
//     within the 64-part cap; a phone's build (no fine joinery) derives the same collision as a desktop's;
//   - a triangle budget per building (coarse — the silhouette drawn at any range — and fine apart), the fine joinery
//     receive-only dressing; no inverted faces seen from outside (ray casts);
//   - the damage states change the building: a collapsed corner takes structure away above its floor, the plot is kept.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SKYLINE_BUILDERS, SKYLINE_CITY, decoTower, curtainTower, modernSlab, stalinistTower, industrialHall, gasHolder, stationHall, cathedral } from './skyline.ts';
import { buildRegionalParts } from './index.ts';
import { streamFrom } from './geometry.ts';
import { auditStructureAssembly } from '../structureAssemblyAudit.ts';
import { deriveRuntimeStructureCollisionProfile } from '../../structureCollision.ts';
import { NIGHT_EMISSION_ATTRIBUTE } from '../../../engine/nightEmissionMaterial.ts';
import { FRANCONIAN_STYLE } from './franconian.ts';

const COLOURED = new Set(['structureMetal', 'structureWood', 'regionalPlaster', 'regionalPlaster2', 'regionalPlaster3', 'regionalStone', 'regionalRoof']);
const WEATHERED_SOURCES = ['plaster', 'plaster2', 'plaster3', 'stone', 'roof'];
/** The plots a city kit gives these builders (w, d, h): the old megatower, arcology, factory, depot and church plots. */
const PLOTS = {
  decotower: [[30, 30, 70], [22, 26, 48]], curtaintower: [[24, 24, 80], [18, 30, 50]], slab: [[40, 14, 36], [16, 34, 30]],
  stalinist: [[60, 34, 90], [28, 28, 60]], hall: [[24, 40, 10], [18, 26, 9]], gasholder: [[34, 34, 30], [22, 22, 20]],
  station: [[44, 60, 20], [30, 40, 16]], cathedral: [[30, 60, 40], [22, 44, 30]],
};
const BUILDERS = { decotower: decoTower, curtaintower: curtainTower, slab: modernSlab, stalinist: stalinistTower, hall: industrialHall,
  gasholder: gasHolder, station: stationHall, cathedral };
/** Per building: the coarse triangles (drawn at any range) and the fine ones (near the camera only, desktop only). */
const COARSE_BUDGET = 14000, FINE_BUDGET = 10000;
const ray = new THREE.Raycaster();

function build(builder, id, plot, seed, tier = 'desktop') {
  const [w, d, h] = plot;
  const style = { ...FRANCONIAN_STYLE, id: 'skyline-test', builders: { [id]: builder }, wear: 0 };
  return buildRegionalParts(style, {
    structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
    wallBucket: 'stone', rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId: 'skyline', snowCap: false, tier,
  }, streamFrom(seed * 3 + 5));
}
const all = (parts) => Object.values(parts).flat();
const positions = (parts) => Object.entries(parts).map(([bucket, list]) => [bucket, list.map((g) => Array.from(g.getAttribute('position').array))]);

assert.deepEqual(Object.keys(SKYLINE_BUILDERS).sort(), Object.keys(BUILDERS).sort(), 'every builder is offered by name');
let builds = 0, worstCoarse = 0, worstFine = 0;
for (const [id, make] of Object.entries(BUILDERS)) {
  for (const plot of PLOTS[id]) {
    for (const damage of [0, 1, 2, 3]) {
      const builder = make({ damage });
      const seed = 17 + damage * 31 + plot[0];
      const parts = build(builder, id, plot, seed);
      assert.deepEqual(positions(build(builder, id, plot, seed)), positions(parts), `${id} ${plot} d${damage}: deterministic`);
      let coarse = 0, fine = 0, structural = 0, lit = 0;
      for (const [bucket, list] of Object.entries(parts)) {
        const sets = new Set();
        for (const g of list) {
          sets.add(Object.keys(g.attributes).sort().join(','));
          assert.equal(g.index, null, `${id}/${bucket}: non-indexed`);
          assert.ok(g.userData.regional && g.userData.uvJitter === 'none', `${id}/${bucket}: regional tags`);
          assert.equal(g.hasAttribute('color'), COLOURED.has(bucket), `${id}/${bucket}: vertex colour exactly in the coloured buckets`);
          assert.equal(g.hasAttribute(NIGHT_EMISSION_ATTRIBUTE), bucket === 'curtain', `${id}/${bucket}: night mask exactly on curtain panes`);
          for (const v of g.getAttribute('position').array) assert.ok(Number.isFinite(v), `${id}: finite`);
          const t = g.getAttribute('position').count / 3;
          if (g.userData.fine) {
            fine += t;
            assert.ok(g.userData.noCollision && !g.userData.castsShadow, `${id}: fine joinery is receive-only dressing`);
          } else coarse += t;
          if (!g.userData.noCollision) structural++;
          if (bucket === 'curtain') lit += Array.from(g.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array).filter((m) => m === 1).length;
        }
        assert.ok(sets.size <= 1, `${id}/${bucket}: one attribute set`);
        if (WEATHERED_SOURCES.includes(bucket)) assert.equal(list.length, 0, `${id}/${bucket}: weathered into its regional bucket`);
      }
      assert.ok(structural > 0, `${id}: structure for collision`);
      assert.ok(coarse <= COARSE_BUDGET, `${id} ${plot} d${damage}: ${coarse} coarse triangles within ${COARSE_BUDGET}`);
      assert.ok(fine <= FINE_BUDGET, `${id} ${plot} d${damage}: ${fine} fine triangles within ${FINE_BUDGET}`);
      worstCoarse = Math.max(worstCoarse, coarse); worstFine = Math.max(worstFine, fine);
      const audit = auditStructureAssembly(parts);
      assert.equal(audit.unsupportedParts, 0, `${id} ${plot} d${damage}: every part reaches the ground (${audit.unsupportedParts} floating)`);
      const profile = deriveRuntimeStructureCollisionProfile(parts);
      assert.ok(profile.contact.parts.length >= 1, `${id}: a ground-contact band`);
      for (const band of profile.shell) assert.ok(band.parts.length <= 64, `${id} ${plot} d${damage}: shell band within the 64-part cap (${band.parts.length})`);
      const mobile = build(builder, id, plot, seed, 'mobile');
      assert.deepEqual(JSON.stringify(deriveRuntimeStructureCollisionProfile(mobile)), JSON.stringify(profile), `${id} ${plot} d${damage}: mobile collision equals desktop`);
      assert.ok(all(mobile).every((g) => !g.userData.fine), `${id}: a phone builds no fine joinery`);
      // the plot: the structure stays within it (the base geometry it replaces stood there)
      const box = new THREE.Box3();
      for (const g of all(parts)) { if (g.userData.noCollision) continue; g.computeBoundingBox(); box.union(g.boundingBox); }
      assert.ok(box.min.x >= -plot[0] / 2 - 0.05 && box.max.x <= plot[0] / 2 + 0.05 && box.min.z >= -plot[1] / 2 - 0.05 && box.max.z <= plot[1] / 2 + 0.05,
        `${id} ${plot} d${damage}: the structure inside its plot (${box.min.x.toFixed(2)}..${box.max.x.toFixed(2)} x ${box.min.z.toFixed(2)}..${box.max.z.toFixed(2)})`);
      // inverted faces: rays from outside must first hit a face that looks back at them
      const meshes = all(parts).map((g) => new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })));
      const rng = streamFrom(seed * 5 + 1);
      let hits = 0, back = 0;
      for (let i = 0; i < 500; i++) {
        const az = rng() * Math.PI * 2, el = (rng() * 0.9 - 0.1) * Math.PI / 2;
        const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
        const target = new THREE.Vector3((rng() - 0.5) * plot[0], rng() * plot[2] * 1.2, (rng() - 0.5) * plot[1]);
        ray.set(target.clone().addScaledVector(dir, 300), dir.clone().negate());
        const hit = ray.intersectObjects(meshes, false)[0];
        if (!hit) continue;
        hits++;
        if (hit.face.normal.dot(dir) < -0.05) back++;
      }
      assert.ok(back <= Math.max(3, hits * 0.01), `${id} ${plot} d${damage}: ${back} of ${hits} first hits see an inverted face`);
      if (lit) assert.ok(parts.curtain.length > 0, `${id}: lit panes`);
      for (const g of [...all(parts), ...all(mobile)]) g.dispose();
      builds++;
    }
  }
}
// the city binding: each generic plan structure it replaces builds inside that structure's plot (Blackglass District's)
const CITY_PLOTS = { megatower: [37, 37, 31], arcology: [38, 37, 11], needletower: [22, 22, 16], terracetower: [35, 34, 13], parkingdeck: [33, 33, 6], civichall: [31, 31, 6] };
assert.deepEqual(Object.keys(SKYLINE_CITY).sort(), Object.keys(CITY_PLOTS).sort(), 'the city binding covers the generic tall structures');
for (const [id, builder] of Object.entries(SKYLINE_CITY)) {
  const plot = CITY_PLOTS[id];
  const parts = build(builder, id, plot, 101);
  const box = new THREE.Box3();
  for (const g of all(parts)) { if (g.userData.noCollision) continue; g.computeBoundingBox(); box.union(g.boundingBox); }
  assert.ok(box.max.x - box.min.x <= plot[0] + 0.1 && box.max.z - box.min.z <= plot[1] + 0.1, `${id}: the city binding builds inside its plot`);
  assert.equal(auditStructureAssembly(parts).unsupportedParts, 0, `${id}: the city binding is grounded`);
  for (const g of all(parts)) g.dispose();
}
console.log(`skyline: ${builds} builds sound (8 builders x 2 plots x 4 damage states), worst ${worstCoarse} coarse and ${worstFine} fine triangles; `
  + `the city binding (${Object.keys(SKYLINE_CITY).join(', ')}) inside its plots`);
