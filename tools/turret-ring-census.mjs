#!/usr/bin/env node
// Claude of Tanks — turret-ring census (tank-opt RING stream, 2026-10-16).
// Copyright © 2026 Kevin B. Liu. Created, designed and directed by Kevin B. Liu. Reserved Content
// (LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0; LICENSE-POLICY.md, NOTICE.md). Claude was a development tool for
// this file, not an author. provenance: urn:claude-of-tanks:tool:turret-ring-census
//
// For every turreted tank (or --ids), on the shipped builds:
//   receipt  the ring as the anatomy generator measures it (turretRingWell.ts measureTurretRing, with its exterior pass,
//            on the geometryReceipt build), and how far the anatomy's turretRing volume sits from it (informational: the
//            volume is a sim module and the 233 landing leaves it, and the generated anatomy, as they were);
//   live     the battle builds (the player's HIGH geometry, a bot's LOW) with that receipt registered: intact they hold
//            no ring plate and no cut copy; setDestroyed puts exactly one plate (one mesh, its own ring material) on
//            rig_hull, centred on the built seat and seated on the receipt's deck, inside the turret base, and swaps the
//            hull's meshes crossing the ring's prism for cut copies with nothing of the hull left inside the prism;
//            resetDestroyed removes the plate and puts every mesh back on the geometry it held, and the geometry
//            fingerprint before the kill and after the rematch are byte-identical (and equal to --base's, the same build
//            on the base commit);
//   fallback the icons-page build without the receipt: the plate it measures for itself agrees with the receipt, and
//            its fingerprint holds as well.
// The z-buffer coverage, dent and exterior-hole receipts are tools/turret-ring-probe.mjs's.
//
//   node tools/turret-ring-census.mjs --ids=t72b3,m1a1_abrams_hc [--out=dir] [--base=fp.jsonl] [--gate]
//   node tools/turret-ring-census.mjs --all [--shard=k/n] [--out=dir] [--base=fp.jsonl] [--gate]
//   node tools/turret-ring-census.mjs --all --fingerprints-only --out=dir   # the base commit's fingerprints
//   node tools/turret-ring-census.mjs --ids=... --receipts-from=<dir>/src/vehicles/combatAnatomyGroups  # a generated tree's
// The receipt is --receipts-from's, else a registered calibration's (none is published), else measured here.
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
// (--fingerprints-only runs on a base tree without the ring helper)
const {
  measureTurretRing, turretRingCut, turretRingRadius, turretRingSides, TURRET_RING_LIFT_M, TURRET_RING_PLATE_NAME,
} = process.argv.includes('--fingerprints-only') ? {} : await import('../src/vehicles/turretRingWell.ts');

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

/** The builds the census fingerprints: the icons page's (its geometryHash), the player's battle build (HIGH geometry)
 *  and a bot's (LOW: every bot and every mobile tank, rosterState battleGeometryQuality). */
const BUILDS = {
  icons: { camoSeed: 4100, quality: 'high' },
  battle: {
    camoSeed: 77, quality: 'low', geometryQuality: 'high', batchStatic: true, battleDetailLod: true,
    eraVisualBindingReceipt: false,
  },
  bot: {
    camoSeed: 4242, quality: 'low', geometryQuality: 'low', batchStatic: true, battleDetailLod: true,
    eraVisualBindingReceipt: false,
  },
};
/** Tolerances (m). */
const CENTRE_TOL = 0.01;
const SEAT_TOL = 1e-4;
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
  root.traverse((object) => { if ((TURRET_RING_PLATE_NAME && object.name === TURRET_RING_PLATE_NAME) || object.userData?.turretRingPlate) plates.push(object); });
  return plates;
};

function buildFingerprint(id, config) {
  const visual = createTank(id, null, BUILDS[config]);
  try { return geometryFingerprint(visual.root); } finally { visual.dispose(); }
}

/** Whether a hull-frame point lies more than `slack` inside every side of a cut's polygon. */
function insidePolygon(cut, x, z, slack = 1e-4) {
  const apothem = cut.r * Math.cos(Math.PI / cut.sides);
  for (let k = 0; k < cut.sides; k++) {
    const a = ((k + 0.5) / cut.sides) * Math.PI * 2;
    if ((x - cut.cx) * Math.sin(a) + (z - cut.cz) * Math.cos(a) > apothem - slack) return false;
  }
  return true;
}

/** One live wreck: intact fingerprint, the cut and the plate at the kill, the rematch's geometry and fingerprint. */
function liveWreck(id, config, receipt) {
  const visual = createTank(id, null, BUILDS[config]);
  try {
    const root = visual.root;
    const hull = rig(root, 'rig_hull');
    const turret = rig(root, 'rig_turret');
    const intactPlates = plateOf(root).length;
    const fpIntact = geometryFingerprint(root);
    const held = new Map();
    let intactCut = 0;
    root.traverse((object) => { if (object.isMesh) { held.set(object, object.geometry); if (object.geometry?.userData?.turretRingCut) intactCut++; } });
    const seat = turret.position.clone().applyMatrix4(new THREE.Matrix4().compose(hull.position, hull.quaternion, hull.scale).invert());
    visual.setDestroyed({ pop: true, ageS: 0 });
    const plates = plateOf(root);
    const plate = plates[0] ?? null;
    const ring = plate?.userData.turretRingSeat ?? null;
    // the hull's cut: every mesh that changed is the ring's copy (the gun's own bend aside), and nothing of the hull is
    // left inside the prism
    let swapped = 0, foreign = 0, inside = 0;
    if (ring) {
      root.updateMatrixWorld(true);
      const cut = turretRingCut(ring, turretRingSides(BUILDS[config].geometryQuality !== 'low'));
      const inv = hull.matrixWorld.clone().invert();
      const turretSide = (mesh) => { for (let o = mesh.parent; o; o = o.parent) if (o === turret) return true; return false; };
      const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), m = new THREE.Matrix4();
      for (const [mesh, geometry] of held) {
        if (mesh.geometry === geometry || turretSide(mesh)) continue;
        if (!mesh.geometry.userData?.turretRingCut) { foreign++; continue; }
        swapped++;
        const g = mesh.geometry, p = g.attributes.position, index = g.index;
        m.multiplyMatrices(inv, mesh.matrixWorld);
        for (let k = 0; k + 2 < index.count; k += 3) {
          a.fromBufferAttribute(p, index.getX(k)).applyMatrix4(m);
          b.fromBufferAttribute(p, index.getX(k + 1)).applyMatrix4(m);
          c.fromBufferAttribute(p, index.getX(k + 2)).applyMatrix4(m);
          const x = (a.x + b.x + c.x) / 3, y = (a.y + b.y + c.y) / 3, z = (a.z + b.z + c.z) / 3;
          if (y > cut.yLo + 1e-4 && y < cut.yHi - 1e-4 && insidePolygon(cut, x, z)) inside++;
        }
      }
    }
    const row = {
      intactPlates,
      intactCut,
      plates: plates.length,
      parentIsHull: !!plate && plate.parent === hull,
      visible: !!plate && plate.visible,
      singleMaterial: !!plate && !Array.isArray(plate.material) && plate.material.name === 'TurretRingWell',
      source: ring?.source ?? null,
      centreErr: plate ? r4(Math.hypot(plate.position.x - seat.x, plate.position.z - seat.z)) : null,
      seatErr: plate && receipt ? r4(Math.abs(plate.position.y - (receipt.deckY + TURRET_RING_LIFT_M))) : null,
      ring: ring ? { deckY: r4(ring.deckY), openR: r4(ring.openR), rimR: r4(ring.rimR), skirt: r4(ring.skirt), depth: r4(ring.depth),
        carousel: ring.carousel ? ring.carousel.count : 0 } : null,
      tris: plate ? (plate.geometry.index ? plate.geometry.index.count : plate.geometry.attributes.position.count) / 3 : 0,
      cut: { swapped, foreign, inside },
    };
    visual.resetDestroyed();
    row.platesAfterReset = plateOf(root).length;
    let restored = true;
    root.traverse((object) => { if (object.isMesh && held.has(object) && object.geometry !== held.get(object)) restored = false; });
    row.restored = restored;
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
  let receipt;
  try {
    const hull = rig(receiptVisual.root, 'rig_hull'), turret = rig(receiptVisual.root, 'rig_turret');
    receipt = supplied.get(id) ?? combatAnatomyCalibration(id)?.turretRing ?? null;
    row.receiptSource = supplied.has(id) ? 'supplied' : receipt ? 'published' : 'census';
    receipt ??= measureTurretRing(hull, turret, turretRingRadius(spec.armor), { exterior: true });
  } finally { receiptVisual.dispose(); }
  row.receipt = receipt;
  // the anatomy's turretRing volume today against the built ring (informational: were it re-centred on the seat's axis
  // and the deck, a sim change the 233 landing does not make)
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
  row.bot = receipt ? liveWreck(id, 'bot', receipt) : null;
  // the fallback: the icons build measuring its own ring
  if (calibration) registerCombatAnatomyCalibrations({ [id]: calibration });
  row.fallback = liveWreck(id, 'icons', receipt);
  const L = row.live, B = row.bot, F = row.fallback;
  const builds = [L, B].filter(Boolean);
  const checks = {
    receipt: !!receipt,
    insideTurretBase: !!receipt && receipt.rimR <= receipt.footR - 0.019,
    intactNoPlate: !!L && builds.every((w) => w.intactPlates === 0 && w.intactCut === 0) && F.intactPlates === 0,
    onePlate: builds.length === 2 && builds.every((w) => w.plates === 1 && w.parentIsHull && w.visible && w.singleMaterial),
    receiptPath: builds.length === 2 && builds.every((w) => w.source === 'receipt'),
    centred: builds.length === 2 && builds.every((w) => w.centreErr !== null && w.centreErr <= CENTRE_TOL),
    seated: builds.length === 2 && builds.every((w) => w.seatErr !== null && w.seatErr <= SEAT_TOL),
    // the kill cut the hull's meshes across the ring (the deck at least), and nothing of the hull is left inside it
    hullCut: builds.length === 2 && builds.every((w) => w.cut.swapped >= 1 && w.cut.foreign === 0 && w.cut.inside === 0),
    removedAtReset: builds.length === 2 && builds.every((w) => w.platesAfterReset === 0 && w.restored) && F.platesAfterReset === 0
      && F.restored,
    fingerprintHolds: builds.length === 2 && builds.every((w) => w.fpIntact === w.fpReset) && F.fpIntact === F.fpReset,
    // the build's own measure (a stale or missing receipt's path) agrees with a receipt measured the same way; a
    // generator's receipt (its stock-capture and measurement-mode builds) may differ, and the row records by how much
    fallbackAgrees: !!F && F.plates === 1 && F.source === 'measured' && F.centreErr <= CENTRE_TOL && !!F.ring && !!L?.ring
      && (row.receiptSource !== 'census' || (Math.abs(F.ring.deckY - L.ring.deckY) <= FALLBACK_TOL.deckY
        && Math.abs(F.ring.rimR - L.ring.rimR) <= FALLBACK_TOL.rimR)),
  };
  if (base.has(id)) {
    checks.battleBase = !!L && L.fpIntact === base.get(id).battle;
    checks.iconsBase = !!F && F.fpIntact === base.get(id).icons;
    if (base.get(id).bot) checks.botBase = !!B && B.fpIntact === base.get(id).bot;
  }
  row.checks = checks;
  row.pass = Object.values(checks).every(Boolean);
  if (!row.pass) failures++;
  row.s = +((performance.now() - t0) / 1000).toFixed(1);
  appendFileSync(JSONL, JSON.stringify(row) + '\n');
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  console.log(`${id}: ${row.pass ? 'PASS' : `FAIL ${failed.join(',')}`} | R ${receipt?.rimR} deck ${receipt?.deckY} foot ${receipt?.footR}`
    + ` well ${receipt?.wellR ?? '-'} floor ${receipt?.floorY} | cut ${L?.cut.swapped ?? '-'}/${B?.cut.swapped ?? '-'} meshes`
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
