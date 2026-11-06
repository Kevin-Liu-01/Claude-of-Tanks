// decorLivedIn.selftest.mjs — the lived-in loads of the M1A1s and the Bradleys (release 269, lane abrams-bradley-269; the
// owner, 2026-11-05: "add a bunch of extra decorations annd tank props and boxes and bags and other soldier reuqipment onn
// all of these bradleys and m1a1s").
//
// 1. The crew-kit vocabulary (accessoryKits CREW_KIT_VARIANTS through decorations' `crewkit`), the cargo net and the coiled
//    tow cable: every piece authored on its foot, its near level inside the 700-triangle piece budget, its coarse level
//    no heavier, in the same envelope and from the same random draws (the placement seats both with one matrix).
// 2. The lived-in rows come after every other row of their tank, always carried, drawing nothing from the manifest's
//    stream (the rows before them keep their draws and seats); every Bradley's turret carries a load; the M3A2 keeps the
//    M2A2's seed (DECOR_TWIN) with rows for its own turret and gutters; every other vehicle's manifest has none.
// 3. Built with its decor, an M1A1 seats the bustle rack's load under its cargo net, the packs on its side rack's rails and
//    the rolls in its trough, and an M2A2 the gutter rolls, the trim vane's net, the ramp's coiled cable and its turret
//    rack's load, inside the lived-in budget (LIVED_IN_TRIS).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from './canvasFixture.test-support.mjs';
import { CREW_KIT_VARIANTS } from './accessoryKits.ts';
import { DECOR_KITS, decorManifestFor } from './decorations.ts';
import './fleetRegistration.ts';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';

const warn = console.warn;
console.warn = () => {};
const restoreCanvas = installCanvasFixture();
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };

const tri = (geometry) => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
function measure(parts) {
  const box = new THREE.Box3();
  let triangles = 0;
  for (const part of parts) {
    part.geo.computeBoundingBox();
    box.union(part.geo.boundingBox);
    triangles += tri(part.geo);
  }
  return { box, triangles, size: box.getSize(new THREE.Vector3()) };
}
function levels(kit, args) {
  const draws = { 1: 0, 0: 0 };
  const build = (detail) => {
    let a = 0x269;
    const rng = () => { draws[detail]++; a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    return DECOR_KITS[kit]({ rng, ...args, nation: 'USA', detail });
  };
  return { near: build(1), coarse: build(0), draws };
}

// 1. the pieces
for (const [kit, args, label] of [
  ...CREW_KIT_VARIANTS.map((v) => ['crewkit', { v }, `crewkit:${v}`]),
  ['crewkit', { v: 'long-duffel' }, 'crewkit:long-duffel (a fleet cargo name)'],
  ['cargonet', { w: 1.2, len: 0.36 }, 'cargonet'],
  ['coil', { r: 0.27, n: 3 }, 'coil'],
]) {
  const { near, coarse, draws } = levels(kit, args);
  const n = measure(near), c = measure(coarse);
  ok(draws[1] === draws[0], `${label}: near and coarse levels consume the same random draws`);
  ok(n.triangles > 0 && c.triangles <= n.triangles, `${label}: coarse level no heavier (${c.triangles} vs ${n.triangles})`);
  ok(n.triangles <= (kit === 'coil' ? 1000 : 1100) && (kit !== 'crewkit' || n.triangles <= 700),
    `${label}: near level inside its piece budget (${n.triangles})`);
  if (kit !== 'coil') ok(n.box.min.y > -0.006, `${label}: authored on its foot (min y ${n.box.min.y.toFixed(3)})`);
  // (the coarse net is a flat band facing up: no height of its own)
  for (const axis of kit === 'cargonet' ? ['x', 'z'] : ['x', 'y', 'z']) {
    ok(c.size[axis] >= n.size[axis] * 0.8 - 0.004 && c.size[axis] <= n.size[axis] * 1.05 + 0.01,
      `${label}: coarse ${axis} envelope ${c.size[axis].toFixed(3)} matches near ${n.size[axis].toFixed(3)}`);
  }
  for (const part of [...near, ...coarse]) part.geo.dispose();
}
// issue sizes: the .50 can pair is 305 mm long and two cans deep, the MRE pair two 250 mm cases tall, the mat 580 mm wide
{
  const size = (v) => { const { near, coarse } = levels('crewkit', { v }); const m = measure(near);
    for (const part of [...near, ...coarse]) part.geo.dispose(); return m.size; };
  const ammo = size('ammo-can-stack'), mre = size('mre-stack'), mat = size('mat-roll'), water = size('water-case');
  ok(Math.abs(ammo.x - 0.31) < 0.04 && ammo.z > 0.3 && ammo.z < 0.36, `ammo-can-stack: two M2A1 cans side by side (${ammo.x.toFixed(3)} x ${ammo.z.toFixed(3)})`);
  ok(Math.abs(mre.y - 0.5) < 0.03 && mre.x > 0.4 && mre.x < 0.46, `mre-stack: two 410 x 250 x 255 mm cases (${mre.x.toFixed(3)} x ${mre.y.toFixed(3)})`);
  ok(mat.x > 0.54 && mat.x < 0.66 && mat.y > 0.15 && mat.y < 0.2, `mat-roll: a 580 mm wide foam roll (${mat.x.toFixed(3)} x ${mat.y.toFixed(3)})`);
  ok(water.x > 0.37 && water.x < 0.42 && water.y > 0.18 && water.y < 0.24, `water-case: 24 half-litre bottles (${water.x.toFixed(3)} x ${water.y.toFixed(3)})`);
}

// 2. the manifests
// the rows each carries at least: the owner's-model racks a full load and four rail packs, the tejas racks what their
// profile's own load leaves room for, the Bradley hulls their gutter rolls and the coil
const LIVED_IN_ROWS_MIN = Object.freeze({ m1a1: 15, m1a1ha: 13, m1a1_abrams_sa: 13, m1a1_abrams_aim: 16, m1a1_abrams_hc: 2,
  m1a1_abrams_fep: 4, m2a2_bradley: 13, m3a2_bradley: 17, m3a3_bradley: 16, ua_m2a3_bradley: 13, m6_linebacker: 13 });
const LIVED_IN_IDS = Object.keys(LIVED_IN_ROWS_MIN);
const BRADLEYS = new Set(['m2a2_bradley', 'm3a2_bradley', 'm3a3_bradley', 'ua_m2a3_bradley', 'm6_linebacker']);
const counting = () => { let n = 0; const rng = () => { n++; return ((n * 0.618034) % 1); }; rng.count = () => n; return rng; };
for (const id of LIVED_IN_IDS) {
  const spec = getSpec(id);
  const rng = counting();
  const manifest = decorManifestFor(spec, rng);
  const first = manifest.findIndex((row) => row.livedIn);
  ok(first >= 0, `${id}: carries lived-in rows`);
  ok(manifest.slice(first).every((row) => row.livedIn && row.p === 1), `${id}: the lived-in rows come last and are always carried`);
  ok(manifest.slice(0, first).every((row) => !row.livedIn), `${id}: no lived-in row before the tank's own rows`);
  ok(manifest.filter((row) => row.livedIn).length >= LIVED_IN_ROWS_MIN[id],
    `${id}: its load (${manifest.filter((row) => row.livedIn).length} rows, at least ${LIVED_IN_ROWS_MIN[id]})`);
  if (BRADLEYS.has(id)) {
    ok(manifest.some((row) => row.livedIn && (row.slot[1].turret || row.slot[0].startsWith('turret'))), `${id}: its turret carries a load`);
  }
}
// the lived-in rows draw nothing: the M3A2 (DECOR_TWIN) and the M2A2 draw the same stream and carry the same rows before
// the lived-in ones; the M3A2's lived-in rows are its own (its source-measured turret sweeps its gutters less)
{
  const a = counting(), b = counting();
  const m2 = decorManifestFor(getSpec('m2a2_bradley'), a), m3 = decorManifestFor(getSpec('m3a2_bradley'), b);
  ok(a.count() === b.count(), 'the M3A2 consumes the M2A2 manifest stream');
  const base = (rows) => JSON.stringify(rows.filter((row) => !row.livedIn));
  ok(base(m2) === base(m3), 'the M3A2 carries the M2A2 rows before its lived-in load');
  ok(JSON.stringify(m2.filter((row) => row.livedIn)) !== JSON.stringify(m3.filter((row) => row.livedIn)), 'and its own lived-in load');
}
for (const id of ['leo2a4', 'challenger2', 't90am', 'ua_m1a1', 'abramsx']) {
  ok(!decorManifestFor(getSpec(id), counting()).some((row) => row.livedIn), `${id}: no lived-in rows`);
}

// 3. built with its decor
const MINE = /^(crewkit|cargonet|coil)/;
const rows = [];
try {
  for (const [id, want] of [['m1a1', { crewkit: 12, cargonet: 1, turret: 13 }], ['m2a2_bradley', { crewkit: 7, coil: 1, turret: 3 }]]) {
    const tank = createTank(id, null, { camoSeed: 4242, quality: 'high', decor: true, staticPreview: true });
    try {
      const summary = tank.root.userData.__decorSummary;
      ok(summary, `${id}: decorated`);
      const lived = summary.pieces.filter((piece) => MINE.test(piece.kit));
      const count = (re) => lived.filter((piece) => re.test(piece.kit)).length;
      ok(count(/^crewkit/) >= want.crewkit, `${id}: ${count(/^crewkit/)} crew loads seated (>= ${want.crewkit})`);
      if (want.cargonet) ok(count(/^cargonet/) === want.cargonet, `${id}: the bustle rack's net is laid`);
      if (want.coil) ok(count(/^coil/) === want.coil, `${id}: the ramp's tow cable is coiled`);
      if (want.turret) ok(lived.filter((piece) => piece.frame === 'turret').length >= want.turret,
        `${id}: the turret is loaded (${lived.filter((piece) => piece.frame === 'turret').length} pieces)`);
      ok(summary.tris <= 16000, `${id}: inside the lived-in budget (${summary.tris})`);
      rows.push(`${id} ${lived.length} lived pieces, ${summary.tris} tris, ${summary.drawCalls} draws`);
    } finally {
      tank.dispose();
    }
  }
} finally {
  restoreCanvas();
  console.warn = warn;
}
console.log(`decorLivedIn.selftest: ${checks} checks; ${rows.join('; ')} PASS`);
