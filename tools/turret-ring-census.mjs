#!/usr/bin/env node
// Claude of Tanks — turret-ring census (tank-opt RING stream, 2026-10-16).
// Copyright © 2026 Kevin B. Liu. Created, designed and directed by Kevin B. Liu. Reserved Content
// (LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0; LICENSE-POLICY.md, NOTICE.md). Claude was a development tool for
// this file, not an author. provenance: urn:claude-of-tanks:tool:turret-ring-census
//
// For every turreted tank (or --ids), on the shipped builds:
//   receipt  the ring as the anatomy generator measures it (turretRingWell.ts measureTurretRing on the
//            geometryReceipt build), and where the anatomy's turretRing volume moves with it (alignTurretRing: onto the
//            built seat's axis, centred on the deck under it) — the ids the next tank:anatomy:update touches;
//   deck     an independent probe (three's Raycaster straight down, turret hidden): the deck under the race's annulus
//            never stands over the plate's top (a doubled or coplanar deck plate cannot fight or cover it) and the
//            plate's skirt reaches it;
//   live     the battle build with that receipt registered: intact it holds no ring plate; setDestroyed puts exactly
//            one plate (one mesh, the fleet's one material) on rig_hull, centred on the built seat and seated on the
//            receipt's deck, inside the turret base; resetDestroyed removes it, and the geometry fingerprint before the
//            kill and after the rematch are byte-identical (and equal to --base's, the same build on the base commit);
//   fallback the icons-page build without the receipt: the plate it measures for itself agrees with the receipt, and
//            its fingerprint holds as well.
//
//   node tools/turret-ring-census.mjs --ids=t72b3,m1a1_abrams_hc [--out=dir] [--base=fp.jsonl] [--gate]
//   node tools/turret-ring-census.mjs --all [--shard=k/n] [--out=dir] [--base=fp.jsonl] [--gate]
//   node tools/turret-ring-census.mjs --all --fingerprints-only --out=dir   # the base commit's fingerprints
//   node tools/turret-ring-census.mjs --ids=... --receipts-from=<dir>/src/vehicles/combatAnatomyGroups  # a generated tree's
// The receipt is --receipts-from's, else the published calibration's (after tank:anatomy:update), else measured here.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';

await import('./tank-surface-collect.mjs'); // the node canvas the builders paint through
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { FLEET_GROUP_BY_ID } = await import('../src/vehicles/fleetManifest.ts');
const { ensureInteriorFills } = await import('../src/vehicles/interiorFills.ts');
const { geometryFingerprint } = await import('../src/vehicles/tankAssets.ts');
const { combatAnatomyCalibration, registerCombatAnatomyCalibrations } = await import(
  '../src/vehicles/combatAnatomyCalibrationRegistry.ts');
const {
  measureTurretRing, turretRingRadius, TURRET_RING_LIFT_M, TURRET_RING_PLATE_NAME,
} = await import('../src/vehicles/turretRingWell.ts');

const args = process.argv.slice(2);
const opt = (name, fallback = '') => {
  const hit = args.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const OUT = resolve(opt('out', '.qa-dev/out/turret-ring'));
mkdirSync(OUT, { recursive: true });
const JSONL = `${OUT}/turret-ring-census.jsonl`;
const fingerprintsOnly = flag('fingerprints-only');
const PROVENANCE = {
  creator: 'Kevin B. Liu',
  creatorUrl: 'https://github.com/Kevin-Liu-01',
  copyright: 'Copyright © 2026 Kevin B. Liu',
  license: 'LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0',
  schema: 'cot-vehicle-provenance-v1',
  assetId: 'urn:claude-of-tanks:qa:turret-ring-census',
  policy: 'LICENSE-POLICY.md',
};

/** The builds the census fingerprints: the icons page's (its geometryHash) and a battle bot's. */
const BUILDS = {
  icons: { camoSeed: 4100, quality: 'high' },
  battle: {
    camoSeed: 77, quality: 'low', geometryQuality: 'high', batchStatic: true, battleDetailLod: true,
    eraVisualBindingReceipt: false,
  },
};
/** Tolerances (m). */
const CENTRE_TOL = 0.01;
const SEAT_TOL = 1e-4;
const DECK_TOL = 0.002;
const SKIRT_TOL = 0.012;
const PIERCE_MAX = 0.15;
const FALLBACK_TOL = { deckY: 0.006, rimR: 0.015 };

const allIds = Object.keys(FLEET_GROUP_BY_ID);
const requested = flag('all') ? allIds : opt('ids', 't72b3').split(',').map((id) => id.trim()).filter(Boolean);
const [shardK, shardN] = (opt('shard', '0/1')).split('/').map(Number);
const done = new Set(existsSync(JSONL)
  ? readFileSync(JSONL, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line).id) : []);
const ids = requested.filter((_, i) => i % shardN === shardK).filter((id) => !done.has(id));
// a generated calibration tree's receipts (tools/gen-combat-anatomy.mjs run into another directory)
const supplied = new Map();
if (opt('receipts-from')) {
  for (const name of readdirSync(resolve(opt('receipts-from')))) {
    if (!name.endsWith('.generated.ts')) continue;
    const text = readFileSync(resolve(opt('receipts-from'), name), 'utf8');
    const rows = JSON.parse(text.slice(text.indexOf('Object.freeze(') + 14, text.lastIndexOf(');')));
    for (const [id, calibration] of Object.entries(rows)) if (calibration.turretRing) supplied.set(id, calibration.turretRing);
  }
}
const base = new Map();
if (opt('base')) {
  for (const path of opt('base').split(',')) {
    for (const line of readFileSync(resolve(path), 'utf8').split('\n').filter(Boolean)) {
      const row = JSON.parse(line);
      base.set(row.id, row);
    }
  }
}

const r4 = (value) => Math.round(value * 1e4) / 1e4;
const rig = (root, name) => root.getObjectByName(name);
const plateOf = (root) => {
  const plates = [];
  root.traverse((object) => { if (object.name === TURRET_RING_PLATE_NAME || object.userData?.turretRingPlate) plates.push(object); });
  return plates;
};

/** Hull meshes a camera looking down draws (first LOD level, nothing hidden, no generated fills or markings). */
function hullSurfaces(hull) {
  const meshes = [];
  const stack = [hull];
  while (stack.length) {
    const object = stack.pop();
    if (object.visible === false) continue;
    if (object.isMesh && !object.isInstancedMesh && !object.isBatchedMesh && object.geometry?.getAttribute('position')
        && !object.userData.interiorFill && !object.userData.vehicleMarking && !object.userData.authoredShadowProxy
        && !object.userData.turretRingPlate) {
      // solid surfaces only: a cut-out net or leaf card over the deck draws over the plate through its holes
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      if (material && material.colorWrite !== false && !(material.transparent && (material.opacity ?? 1) < 0.98)
          && !(material.alphaTest > 0)) meshes.push(object);
    }
    if (object.isLOD && object.levels?.length) { stack.push(object.levels[0].object); continue; }
    for (const child of object.children) stack.push(child);
  }
  return meshes;
}

/** The deck under the race's annulus: three's Raycaster down at 48 bearings x 3 radii, the first up-facing hit. */
function probeDeck(root, receipt) {
  root.updateMatrixWorld(true);
  const hull = rig(root, 'rig_hull');
  const turret = rig(root, 'rig_turret');
  const turretVisible = turret.visible;
  turret.visible = false;
  const meshes = hullSurfaces(hull);
  const raycaster = new THREE.Raycaster();
  const toWorld = hull.matrixWorld;
  const fromWorld = toWorld.clone().invert();
  const normalWorld = new THREE.Vector3();
  const tops = [], rims = [];
  const openR = receipt.rimR - Math.min(0.085, Math.max(0.05, 0.075 * receipt.rimR));
  // the race's annulus (its inner edge, middle and outer edge) and the deck just outside the rim
  for (const [r, list] of [[openR + 0.004, tops], [0.5 * (openR + receipt.rimR), tops], [receipt.rimR - 0.004, tops],
    [receipt.rimR + 0.012, rims], [receipt.rimR + 0.035, rims]]) {
    for (let k = 0; k < 48; k++) {
      const a = ((k + 0.37) / 48) * Math.PI * 2;
      const origin = new THREE.Vector3(receipt.seat[0] + Math.sin(a) * r, receipt.seat[1] + 0.6, receipt.seat[2] + Math.cos(a) * r)
        .applyMatrix4(toWorld);
      const dir = new THREE.Vector3(0, -1, 0).transformDirection(toWorld);
      raycaster.set(origin, dir);
      raycaster.far = 1.6;
      const hits = raycaster.intersectObjects(meshes, false);
      let y = null;
      for (const hit of hits) {
        const material = Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material;
        normalWorld.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
        const facing = normalWorld.dot(dir) < 0 || material?.side === THREE.DoubleSide;
        if (!facing) continue;
        y = hit.point.clone().applyMatrix4(fromWorld).y;
        break;
      }
      if (y !== null) list.push(y);
    }
  }
  turret.visible = turretVisible;
  const sorted = (values) => values.slice().sort((p, q) => p - q);
  const q = (values, f) => (values.length ? sorted(values)[Math.min(values.length - 1, Math.floor(f * (values.length - 1) + 0.5))] : null);
  const plateTop = receipt.deckY + TURRET_RING_LIFT_M;
  return {
    samples: tops.length,
    deckTop90: q(tops, 0.9),
    deckTop95: q(tops, 0.95),
    deckMax: tops.length ? Math.max(...tops) : null,
    // the share of the race's annulus a hull surface stands over (a feature under part of the turret crossing the race)
    pierced: tops.length ? +(tops.filter((y) => y > plateTop - DECK_TOL).length / tops.length).toFixed(3) : null,
    deckLowRim: q(rims, 0.05),
  };
}

function buildFingerprint(id, config) {
  const visual = createTank(id, null, BUILDS[config]);
  try { return geometryFingerprint(visual.root); } finally { visual.dispose(); }
}

/** One live wreck: intact fingerprint, the plate at the kill, the rematch's fingerprint. */
function liveWreck(id, config, receipt) {
  const visual = createTank(id, null, BUILDS[config]);
  try {
    const root = visual.root;
    const hull = rig(root, 'rig_hull');
    const turret = rig(root, 'rig_turret');
    const intactPlates = plateOf(root).length;
    const fpIntact = geometryFingerprint(root);
    const seat = turret.position.clone().applyMatrix4(new THREE.Matrix4().compose(hull.position, hull.quaternion, hull.scale).invert());
    visual.setDestroyed({ pop: true, ageS: 0 });
    const plates = plateOf(root);
    const plate = plates[0] ?? null;
    const ring = plate?.userData.turretRingSeat ?? null;
    const row = {
      intactPlates,
      plates: plates.length,
      parentIsHull: !!plate && plate.parent === hull,
      visible: !!plate && plate.visible,
      singleMaterial: !!plate && !Array.isArray(plate.material),
      material: plate && !Array.isArray(plate.material) ? plate.material.uuid : null,
      source: ring?.source ?? null,
      centreErr: plate ? r4(Math.hypot(plate.position.x - seat.x, plate.position.z - seat.z)) : null,
      seatErr: plate && receipt ? r4(Math.abs(plate.position.y - (receipt.deckY + TURRET_RING_LIFT_M))) : null,
      ring: ring ? { deckY: r4(ring.deckY), openR: r4(ring.openR), rimR: r4(ring.rimR), skirt: r4(ring.skirt), depth: r4(ring.depth),
        carousel: ring.carousel ? ring.carousel.count : 0 } : null,
      tris: plate ? (plate.geometry.index ? plate.geometry.index.count : plate.geometry.attributes.position.count) / 3 : 0,
    };
    visual.resetDestroyed();
    row.platesAfterReset = plateOf(root).length;
    row.fpIntact = fpIntact;
    row.fpReset = geometryFingerprint(root);
    return row;
  } finally { visual.dispose(); }
}

const started = performance.now();
let failures = 0;
for (const id of ids) {
  const spec = TANK_SPECS[id];
  if (!spec) { console.log(`${id}: no spec`); continue; }
  const t0 = performance.now();
  await ensureInteriorFills([id]);
  const row = { id };
  if (fingerprintsOnly) {
    for (const config of Object.keys(BUILDS)) row[config] = buildFingerprint(id, config);
    appendFileSync(JSONL, JSON.stringify(row) + '\n');
    console.log(`${id}: ${row.icons} ${row.battle}`);
    continue;
  }
  if (spec.armor?.turretless) {
    row.turretless = true;
    for (const config of Object.keys(BUILDS)) row[`${config}Fp`] = buildFingerprint(id, config);
    row.checks = {};
    if (base.has(id)) for (const config of Object.keys(BUILDS)) row.checks[`${config}Base`] = row[`${config}Fp`] === base.get(id)[config];
    row.pass = Object.values(row.checks).every(Boolean);
    if (!row.pass) failures++;
    appendFileSync(JSONL, JSON.stringify(row) + '\n');
    console.log(`${id}: turretless ${row.pass ? 'PASS' : 'FAIL'}`);
    continue;
  }
  // the receipt: --receipts-from's (a generated calibration tree), else the published one (after tank:anatomy:update),
  // else measured here as the generator measures it
  const receiptVisual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  let receipt, deck;
  try {
    const hull = rig(receiptVisual.root, 'rig_hull'), turret = rig(receiptVisual.root, 'rig_turret');
    receipt = supplied.get(id) ?? combatAnatomyCalibration(id)?.turretRing ?? null;
    row.receiptSource = supplied.has(id) ? 'supplied' : receipt ? 'published' : 'census';
    receipt ??= measureTurretRing(hull, turret, turretRingRadius(spec.armor));
    deck = receipt ? probeDeck(receiptVisual.root, receipt) : null;
  } finally { receiptVisual.dispose(); }
  row.receipt = receipt;
  row.deck = deck;
  // the anatomy's turretRing volume today and once alignTurretRing reads the receipt (the volume translates onto the
  // seat's axis and the deck; its size and every later step are unchanged)
  const box = spec.armor.modules?.find((module) => module.module === 'turretRing');
  if (box && receipt) {
    const origin = box.turretLocal ? spec.armor.turretPivot : [0, 0, 0];
    const centre = [0, 1, 2].map((axis) => (box.min[axis] + box.max[axis]) * 0.5);
    const next = [receipt.seat[0] - origin[0], receipt.deckY - origin[1], receipt.seat[2] - origin[2]];
    row.anatomy = {
      turretLocal: !!box.turretLocal,
      before: centre.map(r4),
      after: next.map(r4),
      moved: r4(Math.hypot(next[0] - centre[0], next[1] - centre[1], next[2] - centre[2])),
      movedY: r4(next[1] - centre[1]),
      movedXZ: r4(Math.hypot(next[0] - centre[0], next[2] - centre[2])),
    };
  }
  // the live wreck on the receipt (registered as the next anatomy update will publish it)
  const calibration = combatAnatomyCalibration(id);
  if (receipt && calibration) registerCombatAnatomyCalibrations({ [id]: { ...calibration, turretRing: receipt } });
  row.live = receipt ? liveWreck(id, 'battle', receipt) : null;
  // the fallback: the icons build measuring its own ring
  if (calibration) registerCombatAnatomyCalibrations({ [id]: calibration });
  row.fallback = liveWreck(id, 'icons', receipt);
  const L = row.live, F = row.fallback;
  const checks = {
    receipt: !!receipt,
    // the race's annulus: the deck stands at least DECK_TOL under the plate's top there (a doubled, coplanar or raised
    // plate cannot fight it or draw over it) on all but PIERCE_MAX of it (a hull feature under part of the turret may
    // cross the race), and the skirt reaches the lowest deck under the rim
    deckUnderPlate: !!deck && deck.samples >= 130 && deck.pierced !== null && deck.pierced <= PIERCE_MAX,
    skirtReachesDeck: !!deck && deck.deckLowRim !== null && deck.deckLowRim >= receipt.deckY - receipt.skirt - SKIRT_TOL,
    insideTurretBase: !!receipt && receipt.rimR <= receipt.footR - 0.019,
    intactNoPlate: !!L && L.intactPlates === 0 && F.intactPlates === 0,
    onePlate: !!L && L.plates === 1 && L.parentIsHull && L.visible && L.singleMaterial,
    receiptPath: !!L && L.source === 'receipt',
    centred: !!L && L.centreErr !== null && L.centreErr <= CENTRE_TOL,
    seated: !!L && L.seatErr !== null && L.seatErr <= SEAT_TOL,
    removedAtReset: !!L && L.platesAfterReset === 0 && F.platesAfterReset === 0,
    fingerprintHolds: !!L && L.fpIntact === L.fpReset && F.fpIntact === F.fpReset,
    // the build's own measure (a stale or missing receipt's path) agrees with a receipt measured the same way; a
    // generator's receipt (its stock-capture and measurement-mode builds) may differ, and the row records by how much
    fallbackAgrees: !!F && F.plates === 1 && F.source === 'measured' && F.centreErr <= CENTRE_TOL && !!F.ring && !!L?.ring
      && (row.receiptSource !== 'census' || (Math.abs(F.ring.deckY - L.ring.deckY) <= FALLBACK_TOL.deckY
        && Math.abs(F.ring.rimR - L.ring.rimR) <= FALLBACK_TOL.rimR)),
  };
  if (base.has(id)) {
    checks.battleBase = !!L && L.fpIntact === base.get(id).battle;
    checks.iconsBase = !!F && F.fpIntact === base.get(id).icons;
  }
  row.checks = checks;
  row.pass = Object.values(checks).every(Boolean);
  if (!row.pass) failures++;
  row.s = +((performance.now() - t0) / 1000).toFixed(1);
  appendFileSync(JSONL, JSON.stringify(row) + '\n');
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  console.log(`${id}: ${row.pass ? 'PASS' : `FAIL ${failed.join(',')}`} | R ${receipt?.rimR} deck ${receipt?.deckY} foot ${receipt?.footR}`
    + ` | anatomy moved ${row.anatomy?.moved ?? '-'} | ${row.s}s`);
}

// the summary over every row the output holds (all shards)
if (!fingerprintsOnly && existsSync(JSONL)) {
  const rows = readFileSync(JSONL, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const turreted = rows.filter((row) => !row.turretless);
  const moved = (cm) => turreted.filter((row) => (row.anatomy?.moved ?? 0) > cm / 100).map((row) => row.id).sort();
  const summary = {
    generatedAt: new Date().toISOString(),
    provenance: PROVENANCE,
    rows: rows.length,
    turreted: turreted.length,
    pass: rows.filter((row) => row.pass).length,
    failed: rows.filter((row) => !row.pass).map((row) => ({ id: row.id, failed: Object.entries(row.checks || {}).filter(([, ok]) => !ok).map(([k]) => k) })),
    anatomyMoved: { over1cm: moved(1), over5cm: moved(5), over10cm: moved(10) },
    carousel: turreted.filter((row) => row.live?.ring?.carousel).map((row) => row.id).sort(),
  };
  writeFileSync(`${OUT}/turret-ring-census.summary.json`, JSON.stringify(summary, null, 1));
  console.log(`[turret-ring] ${summary.pass}/${summary.rows} pass; anatomy ring volumes moved >1 cm: ${summary.anatomyMoved.over1cm.length},`
    + ` >5 cm: ${summary.anatomyMoved.over5cm.length}, >10 cm: ${summary.anatomyMoved.over10cm.length}`
    + ` (${((performance.now() - started) / 1000).toFixed(0)} s)`);
}
if (flag('gate') && failures) {
  console.error(`[turret-ring] ${failures} tank(s) failed`);
  process.exit(1);
}
