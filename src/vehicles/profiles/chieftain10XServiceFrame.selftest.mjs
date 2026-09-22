import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import { createTank } from '../tankFactory.ts';
import { addChieftain10XServiceFrame } from './chieftain10XServiceFrame.ts';
import {assertPublishedChieftainFoundationSources, PRE_FOUNDATION_HISTORY, publishedChieftainNonTrackMultiset}
  from './chieftain10XPublishedFoundation.test-support.mjs';

const ray = (meshes, p, d, far = 8) => new THREE.Raycaster(new THREE.Vector3(...p),
  new THREE.Vector3(...d), 0, far).intersectObjects(meshes, false)[0];
const near = (a, b, tolerance, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance,
  `${label}: ${a} versus independent source ${b}`);

function fixtures() {
  const group = new THREE.Group(), material = new THREE.MeshBasicMaterial();
  const add = (bucket, geometry) => {
    const m = new THREE.Mesh(geometry, material); m.name = bucket; group.add(m);
  };
  addChieftain10XServiceFrame({ add, addEquipment: add }); group.updateMatrixWorld(true);
  return { group, parts: group.children, dispose() {
    group.children.forEach(m => m.geometry.dispose()); material.dispose();
  } };
}

function sourceSurfaces(all) {
  // First-hit values measured against ALL canonical source owners, not a
  // viewport mask. End-rail planes are shared across three manufactured
  // segments; the source center segment differs by about 0.14 mm in Z.
  for (const side of [-1, 1]) {
    for (const [x, z, y, tolerance] of [[1.2, -2.28, 1.791223953417, .00001],
      [1.2, -2.31, 1.762718099745, .00001], [1.2, -2.25, 1.765252102617, .00001],
      [1.32, -2.284, 1.789520785037, .00002], [1.44, -1.8, 1.775724703858, .00003],
      [1.44, -1.2, 1.764794509672, .00003], [1.44, -.75, 1.756596864032, .00003]]) {
      near(ray(all, [side * x, 1.82, z], [0, -1, 0])?.point.y, y, tolerance,
        'raised transverse/longitudinal source rail crown');
    }
    const h = ray(all, [side * 1.2, 1.82, -2.28], [0, -1, 0]);
    assert.ok(h.face.normal.distanceTo(new THREE.Vector3(0, .920068365537, -.391757836855)) < .00002,
      'rail is a crowned section, not a tall flat box');
    near(ray(all, [side * 1.2, 1.65, -2.284], [0, 1, 0])?.point.y,
      1.661321999351, .00001, 'diagonal web underside retains source lower air');
    assert.equal(ray(all, [side * .908, 1.82, -2.28], [0, -1, 0], .10), undefined,
      '61 mm inter-segment opening remains real air above the lower cover');
    assert.equal(ray(all, [side * 1.2, 1.715, -2.26], [0, -1, 0], .04), undefined,
      'air ahead of the thin transverse receiving web');
    assert.equal(ray(all, [side * 1.44, 1.7, -1.8], [0, -1, 0], .08), undefined,
      'long rail has no filled vertical pedestal beneath its open span');
    assert.equal(ray(all, [side * 1.2, 1.655, -2.284], [0, 1, 0], .005), undefined,
      'source small airway beneath diagonal web is not consumed by support continuation');
  }
  near(ray(all, [.8, 1.82, -2.2], [0, -1, 0])?.point.y, 1.733622020968, .000002,
    'central service-cover source plane');
  near(ray(all, [.8, 1.72, -2.2], [0, -1, 0])?.point.y, 1.691300034523, .000002,
    'actual permanent engine-pad crown under the thin cover');
}

function contacts(parts, all) {
  const named = name => parts.filter(m => m.geometry.userData.chieftain10ServiceFrame === name);
  const join = (upper, lower, x, z, maxLap = .004) => {
    const low = ray(named(upper), [x, 1.4, z], [0, 1, 0])?.point.y;
    const high = ray(named(lower), [x, 1.84, z], [0, -1, 0])?.point.y;
    assert.ok(high >= low && high - low <= maxLap, `${upper} attaches to ${lower}: ${low}/${high}`);
  };
  assert.equal(named('transverseRail').length, 3); assert.equal(named('longitudinalRail').length, 2);
  join('transverseRail', 'serviceCover', .5, -2.28);
  join('coverEndReturn', 'enginePad', .6, -2.394);
  for (const side of [-1, 1]) {
    join('transverseRail', 'crossReceivingFlange', side * 1.2, -2.28);
    join('longitudinalRail', 'longReceivingFlange', side * 1.44, -1.8);
    join('longReceivingFlange', 'aftReceivingWall', side * 1.44, -2.285);
    join('foldedOutboardFoot', 'foldedFootRoot', side * 1.313, -2.285, .004);
    const root = ray(named('foldedFootRoot'), [side * 1.325, 1.4, -2.285], [0, 1, 0])?.point.y;
    const shoulder = ray(all.filter(m => m.name === 'hull'), [side * 1.325, 1.8, -2.285], [0, -1, 0])?.point.y;
    assert.ok(shoulder - root > .0009 && shoulder - root < .0011, 'concealed foot continuation overlaps permanent shoulder by 1 mm');
    const wall = ray(named('aftReceivingWall'), [side * 1.44, 1.4, -2.285], [0, 1, 0])?.point.y;
    const hull = ray(all.filter(m => m.name === 'hull'), [side * 1.44, 1.8, -2.285], [0, -1, 0])?.point.y;
    assert.ok(hull > wall && hull - wall < .02, 'long rail aft wall is actually seated on permanent hull');
  }
  assert.equal(ray(parts, [1.86, 3, -.20], [0, -1, 0]), undefined,
    'separate source-real continuity channel is outside all added stock');
}

function counts(root) {
  root.updateMatrixWorld(true);
  const map = new Map(), v = new THREE.Vector3(), instance = new THREE.Matrix4(), world = new THREE.Matrix4();
  root.traverse(m => {
    if (!m.isMesh || m.userData.vehicleMarking || m.name.startsWith('procShadow_')) return;
    const p = m.geometry.attributes.position, index = m.geometry.index;
    for (let j = 0; j < (m.isInstancedMesh ? m.count : 1); j++) {
      if (m.isInstancedMesh) { m.getMatrixAt(j, instance); world.multiplyMatrices(m.matrixWorld, instance); }
      else world.copy(m.matrixWorld);
      for (let i = 0; i < (index?.count ?? p.count); i++) {
        v.fromBufferAttribute(p, index ? index.getX(i) : i).applyMatrix4(world);
        const key = v.toArray().map(n => Math.round(n * 1e5)).join(',');
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
  }); return map;
}

function successorRows(tank, fixture) {
  const actual = counts(tank.root), added = counts(fixture.group);
  for (const [key, n] of added) {
    assert.ok(actual.get(key) >= n, `every added draw vertex exists with exact multiplicity: ${key}`);
    actual.set(key, actual.get(key) - n);
  }
  return [...actual].filter(([, n]) => n).sort(([a], [b]) => a.localeCompare(b));
}
const multisetOf = rows => ({ count: rows.reduce((sum, [, n]) => sum + n, 0),
  sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex') });

function preservation(tank, fixture, expectedCount, expectedHash) {
  const rows = successorRows(tank, fixture);
  assert.equal(rows.reduce((sum, [, n]) => sum + n, 0), expectedCount);
  assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'), expectedHash,
    'subtracting only the service helper preserves the published099 post-foundation physical vertices, including all gear and turret');
}

// The 2026-09-14 tangent track wrap (tankFactoryCore roadWheelWrap) is the only later change to
// this successor: every draw vertex outside the track band and shoe meshes must still be the
// muzzle-seat successor's, re-derived here rather than trusted from the ledger text.
function nonTrackRows(tank) {
  const track = [];
  tank.root.traverse(m => { if (m.isMesh && /^gearTrack/.test(m.name)) track.push(m); });
  const parents = track.map(m => [m, m.parent]);
  for (const [m] of parents) m.removeFromParent();
  try { return [...counts(tank.root)].sort(([a], [b]) => a.localeCompare(b)); }
  finally { for (const [m, parent] of parents) parent.add(m); }
}

function negativeControls(tank, fixture, count, hash) {
  const p = tank.root.getObjectByName('turret').geometry.attributes.position;
  const oldX = p.getX(0);
  try {
    p.setX(0, oldX + .001);
    assert.throws(() => preservation(tank, fixture, count, hash),
      /published099 post-foundation physical vertices/, 'A 1 mm actual unrelated turret change must fail');
  } finally { p.setX(0, oldX); }
  let wheel;
  tank.root.traverse(m => { if (!wheel && m.isInstancedMesh && m.userData.runningGear) wheel = m; });
  assert.ok(wheel, 'A native moving-gear instance participates in the control');
  const original = new THREE.Matrix4(); wheel.getMatrixAt(0, original);
  try {
    const changed = original.clone(); changed.elements[12] += .001; wheel.setMatrixAt(0, changed);
    assert.throws(() => preservation(tank, fixture, count, hash),
      /published099 post-foundation physical vertices/, 'A moved actual gear instance must fail');
  } finally { wheel.setMatrixAt(0, original); }
  const part = fixture.parts[0].geometry.attributes.position, x = part.getX(0);
  try {
    part.setX(0, x + .001);
    assert.throws(() => preservation(tank, fixture, count, hash),
      /every added draw vertex exists/, 'An invented service-frame subtraction must fail');
  } finally { part.setX(0, x); }
  preservation(tank, fixture, count, hash);
}

// The old pre-foundation receipt remains explicit history, not an active claim
// that the later owner-requested casting never changed. The successor values
// were captured independently from immutable published099, not this candidate.
const UPDATE_LEDGER = process.env.COT_UPDATE_LEDGER === '1';
const ledgerUrl = new URL('../../../docs/references/tanks/chieftain_mk10_x.published-foundation-preservation.json', import.meta.url);
// In update mode the ledger is about to be rewritten, so its successor is read raw and the source
// contract is authenticated on the normal run that must follow.
const published = UPDATE_LEDGER ? JSON.parse(readFileSync(ledgerUrl, 'utf8')).successor
  : assertPublishedChieftainFoundationSources();
if (!UPDATE_LEDGER) for (const mutated of ['src/vehicles/profiles/chieftain10X.ts',
  'src/vehicles/profiles/chieftain10XBowLights.ts']) {
  assert.throws(() => assertPublishedChieftainFoundationSources(file => {
    const source = readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');
    return file === mutated ? source + '\n// unauthorized source mutation' : source;
  }), /source contract|annotation source/, 'Family source mutations cannot silently replace the published contract');
}
const ledgerUpdate = UPDATE_LEDGER ? { successor: {}, nonTrack: {} } : null;
for (const [quality] of PRE_FOUNDATION_HISTORY) {
  const {count, sha256:hash} = published[quality];
  const tank = createTank('chieftain_mk10_x', null, { quality, proceduralOnly: true,
    geometryReceipt: true, batchStatic: false }), fixture = fixtures();
  try {
    tank.root.updateMatrixWorld(true);
    const all = []; tank.root.traverse(m => { if (m.isMesh && !m.userData.vehicleMarking
      && !m.name.startsWith('procShadow_')) all.push(m); });
    sourceSurfaces(all); contacts(fixture.parts, all);
    if (ledgerUpdate) {
      // COT_UPDATE_LEDGER=1: record the current build as the active successor (2026-09-14 wrap).
      ledgerUpdate.successor[quality] = multisetOf(successorRows(tank, fixture));
      ledgerUpdate.nonTrack[quality] = multisetOf(nonTrackRows(tank));
      continue;
    }
    preservation(tank, fixture, count, hash);
    assert.deepEqual(multisetOf(nonTrackRows(tank)), publishedChieftainNonTrackMultiset(quality),
      `${quality}: every draw vertex outside the track meshes is the muzzle-seat successor's (only the tangent wrap changed the tracks)`);
    negativeControls(tank, fixture, count, hash);
    const hull = all.filter(m => m.name === 'hull' || m.name.startsWith('hull'));
    const matrices = hull.map(m => m.matrixWorld.clone()), buffers = hull.map(m => m.geometry);
    for (const yaw of [-.71, .63, 0]) {
      tank.root.getObjectByName('rig_turret').rotation.y = yaw; tank.root.updateMatrixWorld(true);
      assert.ok(hull.every((m, i) => m.matrixWorld.equals(matrices[i]) && m.geometry === buffers[i]),
        'all service fittings remain permanently hull-owned through yaw');
    }
  } finally { tank.dispose(); fixture.dispose(); }
}
if (ledgerUpdate) {
  const ledger = JSON.parse(readFileSync(ledgerUrl, 'utf8'));
  // 2026-09-22 (owner: holes are added, not carved, to save triangles): the muzzle-cap record
  // supersedes the ground-datum successor and is cumulative — a later re-run on the same day (the
  // fleet fallback lip became a flat 2N ring) keeps the ground-datum successor as its base, so the
  // chain history[1] + trackWrap + groundDatum + drawVertexDelta === successor stays authenticated.
  // successorHistory and the earlier dated records are history and stay untouched.
  const base = ledger.laterMuzzleBoreCap?.supersededSuccessor ?? ledger.successor;
  const delta = ledgerUpdate.successor.high.count - base.high.count;
  ledger.successor = ledgerUpdate.successor;
  ledger.laterMuzzleBoreCap = {
    branch: 'r38-bores', capturedAt: '2026-09-22',
    scope: 'Owner 2026-09-22: "the point of adding holes instead of carving them into the barrel is that we save on triangles". (1) chieftain10XGun.ts closes the open loft with one 48-segment CircleGeometry cap at the source mouth instead of the carved 32 cm recess (inner wall, ring, capped floor cylinder) that sat behind the factory fallback disc with no physical-bore contract. (2) The fleet fallback hole became the minimal construction: a flat dark ring (lip and annular face in one 2N mesh) plus the shadow disc, with a throat sleeve only when the tube stops short, instead of the 10N torus lip plus a separate annulus (tankFactoryCore, terminal-surface-fit-r3). Only the gun bucket and the muzzleBoreShadowFallback meshes changed (drawVertexDelta is cumulative from the ground-datum successor); every other draw vertex is re-derived by the receipt and must match exactly.',
    drawVertexDelta: delta, nonTrack: ledgerUpdate.nonTrack, supersededSuccessor: base,
  };
  const { writeFileSync } = await import('node:fs');
  writeFileSync(ledgerUrl, JSON.stringify(ledger, null, 2) + '\n');
  console.log(`chieftain10XServiceFrame: ledger rewritten — successor high ${ledgerUpdate.successor.high.count} low ${ledgerUpdate.successor.low.count}, muzzle-cap draw-vertex delta ${delta}`);
  process.exit(0);
}
console.log('chieftain10XServiceFrame: high/low source crowns/web underside, five real rail gaps, supported folded feet, published099 successor preservation, rejection controls and hull ownership pass; pre-foundation receipt retained as history');
