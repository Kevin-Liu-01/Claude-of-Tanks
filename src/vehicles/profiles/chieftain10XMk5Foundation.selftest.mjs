import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { CHIEFTAIN5_X_DATUMS } from './chieftain5X.ts';
import { buildChieftainMk10X, CHIEFTAIN10_X_DATUMS } from './chieftain10X.ts';

const hash = x => createHash('sha256').update(x).digest('hex');
const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
const semantic = v => hash(JSON.stringify(stable(v)));
const point = xyz => new THREE.Vector3(...xyz);
const near = (a, b, e, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= e,
  `${label}: ${a} vs ${b} ±${e}`);

// Actual factory snapshots captured BEFORE the shared foundation edit. Full
// scene attributes, indices, instances, hierarchy and local/world transforms;
// no marking, batch, gear, material-bucket or spatial-envelope exclusion.
const MK5_BEFORE = {
  high: ['d54625af36a1ef0aa0dcc1f6a417899f1ecf9cf9ab2d1e031c06b40a8bc6fd95', 74, 42],
  low: ['655202167ceeb85a560e33b348f89c045c85114d775504a8a95ef772167ea02b', 72, 40],
};
const MK5_SPEC = '3ba476c4946bb886b64575719c3b9102748c93301a11154b86545db9ee41d949';
const MK5_DATUMS = '0faf866441b38be84cc3b9fa9065a11cce13ac3999c71445b840d5179d471a30';
// Separate pre-edit actual Mk10 evidence pins EVERY emission except the exact
// hull/cast/horn/Stillbrew foundation scope. Thus copying the Mk5 projector,
// 16 launcher mouths, other equipment, gun or gear cannot silently pass.
const MK10_EMISSIONS = '9718ffa9e0b4fab65b7f9cd9ccfa3e95a153e86f481965a175662d4f3f6c52c8';
// 2026-09-11: the detail buckets now carry camouflage, so one more merged
// mesh per quality is a paint-transformed bucket (36/34 -> 37/35).
const MK10_OTHER = {
  high: ['4d980c7d16701140c04038cbc4524402871320bc051cd46183d6611fd2923022', 37],
  low: ['c31e65acfded79ab7a042830a4289d0b91227d2f5b7209d58d79e63bdadeb113', 35],
};
// Immutable pre-edit paint matrices from the same capture as MK10_OTHER.
// A live marking solve follows the new casting. Reconstruct only authenticated
// paint contributions for the old hash; never restore these seats in the scene.
const PAINT_QUAD = 'edfd6b3948ad3ad7a4572aca934c934ab1d67b2e91ce0c7150de6e6ee512782b';
const PAINT_BATCH = '31d7bac70e605ca08ddd9e646fa5b14972dbc36cf6b5e8bb381cf4b9787451af';
const PAINT_BEFORE = [
  { name: 'vehicleMarking_insignia', matrix: [
    -.1343674196995562, .0016374193547829452, -.1988535023104695, 0,
    .0029244549764982372, .23998218176166836, 0, 0,
    .1988387388975643, -.0024230754767748178, -.1343773962348583, 0,
    1.1769229527521756, .16487706324145637, -.689108177724704, 1],
  positionWorld: [1.1769229527521756, 1.6778330632414564, -.09386717772470399] },
  { name: 'vehicleMarking_designation', matrix: [
    -.025919530880102373, 0, -.23859626551762164, 0, 0, .24, 0, 0,
    .23859626551762164, 0, -.025919530880102373, 0,
    1.3516680104637502, .238242814240905, -.27524027819662417, 1],
  positionWorld: [1.3516680104637502, 1.751198814240905, .32000072180337585] },
];

function attribute(a) {
  if (!a) return null;
  const b = a.array ?? a.data.array;
  return { type: b.constructor.name, itemSize: a.itemSize, count: a.count,
    normalized: a.normalized, stride: a.data?.stride, offset: a.offset,
    sha256: hash(Buffer.from(b.buffer, b.byteOffset, b.byteLength)) };
}

function legacyAttributeNames(g) {
  // Keep all immutable pre-foundation fingerprints. Only the independently
  // validated, later-added lighting channel is separate from physical shape.
  const a = g.getAttribute('nightEmissionMask');
  if (a) {
    assert.ok(a.array instanceof Uint8Array, 'night mask is byte-sized');
    assert.equal(a.itemSize, 1); assert.equal(a.normalized, false);
    assert.equal(a.count, g.getAttribute('position').count, 'one mask value per original vertex');
    assert.ok(a.array.every(v => v === 0 || v === 1 || v === 2), 'only supported semantic lens values');
  }
  return Object.keys(g.attributes).filter(k => k !== 'nightEmissionMask');
}

function sceneRows(root) {
  const rows = []; root.updateMatrixWorld(true);
  function visit(o, path) {
    const row = { path, name: o.name, type: o.type, visible: o.visible,
      matrix: o.matrix.toArray(), matrixWorld: o.matrixWorld.toArray() };
    if (o.geometry) {
      const g = o.geometry;
      row.geometry = { index: attribute(g.index), attributes: Object.fromEntries(
        legacyAttributeNames(g).sort().map(k => [k, attribute(g.attributes[k])])),
      groups: g.groups, drawRange: g.drawRange };
      row.instanceMatrix = attribute(o.instanceMatrix);
      row.instanceColor = attribute(o.instanceColor); row.count = o.count;
    }
    rows.push(row); o.children.forEach((n, i) => visit(n, `${path}/${i}`));
  }
  visit(root, 'root'); return rows;
}

function geometryHash(g) {
  const h = createHash('sha256');
  for (const key of legacyAttributeNames(g).sort()) {
    const a = g.attributes[key].array;
    h.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  if (g.index) {
    const a = g.index.array; h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  return h.digest('hex');
}

{
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,1,0,0,1], 2)); g.setIndex([0,1,2]);
  const m = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial(), 1), root = new THREE.Group(); root.add(m);
  const measure = () => [hash(JSON.stringify(sceneRows(root))), geometryHash(g)], legacy = measure();
  g.setAttribute('nightEmissionMask', new THREE.Uint8BufferAttribute([0,1,2], 1));
  assert.deepEqual(measure(), legacy, 'valid lighting metadata preserves both original fingerprint boundaries');
  for (const invalid of [new THREE.Float32BufferAttribute([0,1,2], 1), new THREE.Uint8BufferAttribute([0,1,2], 3),
    new THREE.Uint8BufferAttribute([0,1], 1), new THREE.Uint8BufferAttribute([0,1,2], 1, true), new THREE.Uint8BufferAttribute([0,1,3], 1)]) {
    g.setAttribute('nightEmissionMask', invalid);
    assert.throws(() => sceneRows(root)); assert.throws(() => geometryHash(g));
  }
  g.setAttribute('nightEmissionMask', new THREE.Uint8BufferAttribute([0,1,2], 1));
  g.setAttribute('unrecognizedSemanticChannel', new THREE.Uint8BufferAttribute([0,1,2], 1));
  assert.ok(measure().every((v, i) => v !== legacy[i]), 'neither boundary excludes unknown attributes');
  g.deleteAttribute('unrecognizedSemanticChannel');
  for (const a of [g.attributes.position, g.attributes.normal, g.attributes.uv, g.index]) {
    const old = a.array[0]; a.array[0] = old + 1;
    assert.ok(measure().every((v, i) => v !== legacy[i]), 'original geometry and index bytes remain guarded'); a.array[0] = old;
  }
  const old = m.instanceMatrix.array[0]; m.instanceMatrix.array[0] = old + 1;
  assert.notEqual(measure()[0], legacy[0], 'instance buffers remain guarded'); m.instanceMatrix.array[0] = old;
  root.name = 'changed'; assert.notEqual(measure()[0], legacy[0], 'owner hierarchy remains guarded'); root.name = '';
  m.position.x = 1; assert.notEqual(measure()[0], legacy[0], 'local/world transforms remain guarded'); m.position.x = 0;
  m.visible = false; assert.notEqual(measure()[0], legacy[0], 'visibility remains guarded'); m.visible = true;
  assert.deepEqual(measure(), legacy); g.dispose(); m.material.dispose();
}

// Published deaf6bf11 (parent 7b91b838b) stopped boxUV/bakeDirt in
// geometry-only consumers. The immutable old scene includes both channels;
// keep measuring it through the unchanged full-attribute path below, then
// separately prove that the optimized consumer differs ONLY in those paints.
// This is the exact published CAMO_BUCKETS set, not a spatial/mesh exclusion.
// 2026-09-11 fleet paint standard: painted fittings, lattices, fixed bodywork
// and the detail buckets carry camouflage too, so they omit the same bakes.
const PAINT_BAKED_BUCKETS = new Set([
  'hull', 'hullCupola', 'hullHatch', 'hullExternalArmor', 'hullEquipment',
  'hullTrackGuardL', 'hullTrackGuardR', 'turret', 'turretCupola', 'turretHatch',
  'turretExternalArmor', 'turretEquipment', 'gun', 'gunMount',
  'hullDetail', 'turretDetail', 'hullTrackDetailL', 'hullTrackDetailR',
  'hullPaintedDetail', 'turretPaintedDetail', 'hullOpenLattice', 'turretOpenLattice',
  'hullFixedPaintedBodywork',
]);
function geometryOnlyParity(renderedRows, optimizedRows) {
  const rows = structuredClone(optimizedRows), changed = [];
  assert.equal(rows.length, renderedRows.length, 'material mode cannot remove scene nodes');
  for (const [i, row] of rows.entries()) {
    const expected = renderedRows[i];
    if (!row.geometry || !PAINT_BAKED_BUCKETS.has(row.name)) continue;
    assert.equal(row.path, expected.path); assert.equal(row.name, expected.name);
    const attrs = row.geometry.attributes, full = expected.geometry.attributes;
    assert.equal(attrs.color, undefined, 'optimized merged camouflage stock omits only the dirt bake');
    assert.ok(full.color, 'the full consumer still carries the original dirt colors');
    assert.deepEqual({ ...attrs.uv, sha256: full.uv.sha256 }, full.uv,
      'UV omission preserves its complete attribute shape and type');
    // Normalize only the separately authenticated paint contributions. Every
    // original physical attribute, index, instance, owner and transform stays
    // in this full-scene comparison; neither live geometry is modified.
    attrs.uv = full.uv; attrs.color = full.color;
    row.geometry.attributes = Object.fromEntries(Object.entries(attrs).sort(([a], [b]) => a.localeCompare(b)));
    changed.push(row.name);
  }
  assert.ok(changed.length > 0, 'actual optimized paint omission was exercised');
  assert.deepEqual(rows, renderedRows, 'geometry-only retains all non-paint scene bytes');
  return changed;
}

function paintOmissionControls(renderedRows, optimizedRows) {
  const index = optimizedRows.findIndex(row => row.name === 'hull');
  assert.ok(index >= 0, 'negative controls mutate actual merged hull stock');
  for (const mutate of [
    row => { row.geometry.attributes.position.sha256 = 'changed'; },
    row => { row.geometry.attributes.normal.sha256 = 'changed'; },
    row => { row.geometry.index = { unexpected: true }; },
    row => { row.geometry.attributes.extraPhysicalChannel = { unexpected: true }; },
    row => { row.geometry.attributes.uv.itemSize = 3; },
    row => { row.geometry.attributes.color = renderedRows[index].geometry.attributes.color; },
    row => { row.instanceMatrix = { unexpected: true }; },
    row => { row.matrix[12] += .001; },
    row => { row.matrixWorld[12] += .001; },
    row => { row.path += '/extra'; },
    row => { row.visible = !row.visible; },
  ]) {
    const bad = structuredClone(optimizedRows); mutate(bad[index]);
    assert.throws(() => geometryOnlyParity(renderedRows, bad), assert.AssertionError,
      'paint omission cannot excuse physical, attribute-shape or scene drift');
  }
  const other = optimizedRows.findIndex(row => row.geometry && !PAINT_BAKED_BUCKETS.has(row.name)
    && row.geometry.attributes.uv);
  assert.ok(other >= 0, 'an actual non-camouflage UV channel remains guarded');
  for (const channel of ['uv', 'color']) {
    const bad = structuredClone(optimizedRows), attrs = bad[other].geometry.attributes;
    // This Mk5 stock has UVs but no baked vertex colors: exercise both real
    // UV removal and unauthorized color insertion, without inventing stock.
    if (attrs[channel]) delete attrs[channel]; else attrs[channel] = { unexpected: true };
    assert.throws(() => geometryOnlyParity(renderedRows, bad), assert.AssertionError,
      `the authorized camouflage omission cannot alter non-camouflage ${channel}`);
  }
}

function checkMk5(quality, coldSpec) {
  assert.equal(semantic(CHIEFTAIN5_X_DATUMS.chieftain5_x), MK5_DATUMS, 'Mk5 physical datum record is unchanged');
  const tank = createTank('chieftain5_x', null, { quality, proceduralOnly: true,
    camoSeed: 4242, materialMode: 'rendered', geometryReceipt: true });
  try {
    const rows = sceneRows(tank.root);
    assert.deepEqual([hash(JSON.stringify(rows)), rows.length, rows.filter(r => r.geometry).length],
      MK5_BEFORE[quality], `Mk5/${quality}: immutable complete pre-foundation scene`);
    const optimized = createTank('chieftain5_x', null, { quality, proceduralOnly: true,
      camoSeed: 4242, materialMode: 'geometry-only', geometryReceipt: true });
    try {
      const optimizedRows = sceneRows(optimized.root);
      const painted = geometryOnlyParity(rows, optimizedRows);
      paintOmissionControls(rows, optimizedRows);
      console.log(`Mk5/${quality}: exact geometry-only paint omission [${painted.join(', ')}], 13 rejecting controls PASS`);
    } finally { optimized.dispose(); }
    // The original capture pinned cold metadata once, before either build.
    // Its own native gear then attaches the longstanding derived trackShapes.
    // Admit exactly that lifecycle addition, and pin the complete warmed
    // record so the following Mk10 build cannot mutate ANY Mk5 metadata.
    const warmed = stable(getSpec('chieftain5_x'));
    assert.deepEqual(warmed.armor.trackShapes.map(s => s.module), ['trackL', 'trackR']);
    assert.deepEqual(warmed, { ...coldSpec, armor: { ...coldSpec.armor,
      trackShapes: warmed.armor.trackShapes } }, 'only its own derived trackShapes enrich the cold Mk5 record');
    return semantic(warmed);
  } finally { tank.dispose(); }
}

function paintGeometryShape(mesh, vertices) {
  assert.ok(!mesh.isInstancedMesh, 'no physical instances can be treated as paint');
  const g = mesh.geometry;
  assert.deepEqual(Object.keys(g.attributes).sort(), ['normal', 'position', 'uv']);
  for (const [key, size] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    assert.equal(g.attributes[key].count, vertices); assert.equal(g.attributes[key].itemSize, size);
  }
  assert.equal(g.index?.count, vertices / 4 * 6);
  const indices = [], uvs = [];
  for (let start = 0; start < vertices; start += 4) {
    indices.push(...[0, 2, 1, 2, 3, 1].map(i => i + start));
    uvs.push(0, 1, 1, 1, 0, 0, 1, 0);
  }
  assert.deepEqual(Array.from(g.index.array), indices);
  assert.deepEqual(Array.from(g.attributes.uv.array), uvs);
}

function paintBatchHash(matrices) {
  const pieces = matrices.map(matrix => new THREE.PlaneGeometry(1, 1)
    .applyMatrix4(new THREE.Matrix4().fromArray(matrix)));
  let merged;
  try { merged = mergeGeometries(pieces, false); return geometryHash(merged); }
  finally { merged?.dispose(); pieces.forEach(g => g.dispose()); }
}

function verifiedPaint(root, quality, currentHighMatrices) {
  const paint = [];
  root.traverse(m => { if (m.isMesh && m.userData.vehicleMarking) paint.push(m); });
  const normalized = new Map();
  assert.equal(paint.length, quality === 'high' ? 2 : 1, 'exactly the existing paint pair, with no extra mesh');
  for (const m of paint) assert.equal(m.parent.name, 'rig_turret', 'same actual owning rig');
  if (quality === 'high') {
    for (const [i, m] of paint.entries()) {
      paintGeometryShape(m, 4); assert.equal(m.name, PAINT_BEFORE[i].name);
      assert.equal(geometryHash(m.geometry), PAINT_QUAD, 'unchanged complete unit marking quad');
      for (const scale of m.scale.toArray()) near(scale, .24, 1e-12, 'unchanged full-size paint footprint');
      assert.equal(m.userData.surfaceSupported, true, 'live solve seats the actual paint on physical stock');
      currentHighMatrices.push(m.matrix.toArray());
      const before = PAINT_BEFORE[i], world = [...before.matrix];
      world.splice(12, 3, ...before.positionWorld);
      normalized.set(m, { matrix: before.matrix, world });
    }
  } else {
    const m = paint[0]; paintGeometryShape(m, 8);
    assert.equal(m.name, 'mobileStaticBatch_0'); assert.equal(m.userData.mobileStaticBatch, true);
    assert.equal(currentHighMatrices.length, 2);
    assert.equal(geometryHash(m.geometry), paintBatchHash(currentHighMatrices),
      'every low batch byte is exactly the two actual high-detail paint contributions, with no physical stock');
    const reconstructed = paintBatchHash(PAINT_BEFORE.map(p => p.matrix));
    assert.equal(reconstructed, PAINT_BATCH, 'old merged paint hash is authenticated, not refreshed');
    normalized.set(m, { geometry: reconstructed });
  }
  return normalized;
}

function unaffectedMeshes(root, paint) {
  const rows = [];
  root.traverse(m => {
    if (!m.geometry || m.userData.shadowOnly || m.name.startsWith('procShadow_')
      || ['hull', 'turret', 'turretExternalArmor'].includes(m.name)) return;
    const row = { name: m.name, matrix: m.matrix.toArray(), world: m.matrixWorld.toArray(),
      geometry: geometryHash(m.geometry) };
    for (const key of ['instanceMatrix', 'instanceColor']) if (m[key]) {
      const a = m[key].array; row[key] = hash(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    Object.assign(row, paint.get(m));
    rows.push(row);
  });
  return [hash(JSON.stringify(rows)), rows.length];
}

function preservationNegativeControls(root, paint) {
  const physical = [];
  root.traverse(m => { if (m.isMesh && m.name === 'mobileStaticBatch_0' && !paint.has(m)) physical.push(m); });
  assert.ok(physical.length, 'the actual physical batch is still compared, despite its identical name');
  for (const m of physical) {
    assert.throws(() => paintGeometryShape(m, 8), assert.AssertionError,
      'an actual physical batch cannot pass the two-quad paint authentication');
    const g = m.geometry.clone();
    try {
      const p = g.attributes.position; p.setX(0, p.getX(0) + .001);
      assert.notEqual(geometryHash(g), geometryHash(m.geometry), 'a 1 mm physical change still breaks preservation');
    } finally { g.dispose(); }
  }
}

function collectEmission(emissions, stillbrew, casting, key, args) {
  const index = args.findIndex(a => a?.isBufferGeometry);
  if (index < 0) return;
  const g = args[index], tag = g.userData.chieftain10Stillbrew;
  if (tag) {
    assert.equal(key, 'add'); assert.equal(args[0], 'turret', 'permanent Stillbrew is structural, not render-only armor');
    stillbrew.push({ tag, geometry: g.clone(), args: args.slice(2) });
  }
  if (g.userData.chieftain10Foundation === 'casting') {
    assert.equal(key, 'add'); assert.equal(args[0], 'turret');
    assert.equal(args.length, 2, 'shared casting is already in the measured turret-local frame');
    casting.push(g.clone());
  }
  if ((key === 'add' && ['hull', 'turret'].includes(args[0]))
    || (key === 'addExternalArmor' && args[0] === 'turret')) return;
  emissions.push({ key, args: args.map((a, i) => i === index ? { geometry: geometryHash(a) } : a) });
}

function measuredMk10(quality) {
  const emissions = [], stillbrew = [], casting = [];
  registerProfiledBuilders({ chieftain_mk10_x: p => buildChieftainMk10X(new Proxy(p, {
    get(target, key) {
      if (typeof target[key] !== 'function') return Reflect.get(target, key);
      return (...args) => { collectEmission(emissions, stillbrew, casting, key, args); return target[key](...args); };
    },
  })) });
  try {
    const tank = createTank('chieftain_mk10_x', null, { quality, proceduralOnly: true,
      geometryReceipt: true, batchStatic: false, camoSeed: 4242 });
    tank.root.updateMatrixWorld(true); return { tank, emissions, stillbrew, casting };
  } catch (error) {
    stillbrew.forEach(s => s.geometry.dispose()); casting.forEach(g => g.dispose()); throw error;
  } finally { registerProfiledBuilders({ chieftain_mk10_x: buildChieftainMk10X }); }
}

function sourceCasting(root, geometries) {
  assert.equal(geometries.length, 1, 'one actual shared-foundation casting submission');
  const material = new THREE.MeshBasicMaterial(), core = new THREE.Mesh(geometries[0], material);
  core.matrixWorld.copy(root.getObjectByName('rig_turret').matrixWorld);
  const actual = root.getObjectByName('turret');
  try {
    // Independent original bone_turret_39.004 source rays. The rounded
    // first-party grammar is a <=15 mm approximation, not a copied contour.
    // Structural Stillbrew can legitimately be the first complete-scene hit;
    // we require this underlying core hit in the actual merged buffer too.
    for (const [x, z, y] of [[.8, .6, 2.4012839545], [1, .6, 2.2787707742],
      [1.2, .6, 1.9667066744], [.8, .9, 2.3300022748], [1, .9, 2.1433487944],
      [1.2, .9, 1.8650889749], [.5, 1.2, 2.3472151465], [.8, 1.2, 2.2109503889],
      [1.1, 1.2, 1.8315400546], [-1.25055, .673825, 1.93414431145]]) {
      const ray = new THREE.Raycaster(point([x, 4, z]), point([0, -1, 0]), 0, 5);
      const hit = ray.intersectObject(core, false)[0];
      near(hit?.point.y, y, .015, 'independent source rounded shoulder / steep cast cheek');
      assert.ok(ray.intersectObject(actual, false).some(h => h.point.distanceTo(hit.point) < .000001),
        'measured shared core is really present in the assembled structural turret');
    }
    const bearing = new THREE.Raycaster(point([-1.25055, 4, .673825]), point([0, -1, 0]), 0, 5)
      .intersectObject(core, false)[0];
    assert.ok(bearing.point.y > 1.88254547679 + .02,
      'unchanged source antenna root still has positive contact with the reshaped casting');
  } finally { material.dispose(); }
}

function sharedWiring() {
  const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
  const mk10 = read('./chieftain10X.ts'), hull = read('./chieftain5XSourceHull.ts');
  const turret = read('./chieftain5XSourceTurret.ts');
  for (const [source, calls] of [[mk10, ['chieftainHullSection', 'chieftainCastSection', 'chieftainCheekHorn']],
    [hull, ['chieftainHullSection', 'chieftainDeckSolid']], [turret, ['chieftainCastSection', 'chieftainCheekHorn']]]) {
    assert.match(source, /from ['"]\.\/chieftainXFoundation\.ts['"]/);
    for (const name of calls) assert.match(source, new RegExp(`\\b${name}\\s*\\(`), `${name} is actually invoked, not a dead import`);
  }
  assert.doesNotMatch(mk10, /buildChieftain5X|addChieftain5XSource|PhotoDraft/,
    'Mk10 never copies the assembled Mk5 or its variant equipment');
}

function checkDatums(root) {
  const d = CHIEFTAIN10_X_DATUMS.chieftain_mk10_x;
  assert.deepEqual(d.dims, { hullLengthM: 7.38869, overallLengthM: 10.803698,
    widthM: 3.678103, heightM: 2.453337 }, 'source-specific dimensions, not Mk5 scale targets');
  for (const [name, xyz] of [['rig_turret', [0, 1.512956, .595241]],
    ['rig_gun', [.000026, 1.912199, 1.550505]], ['rig_muzzle', [.000026, 1.912199, 7.093385]]]) {
    const rig = root.getObjectByName(name); assert.ok(rig, `${name} exists`);
    near(rig.getWorldPosition(new THREE.Vector3()).distanceTo(point(xyz)), 0, .000001, `${name} source datum`);
  }
  assert.deepEqual(root.scale.toArray(), [1, 1, 1]);
  for (const name of ['rig_hull', 'rig_turret', 'rig_gun', 'rig_recoil']) {
    const rig = root.getObjectByName(name);
    if (rig) assert.deepEqual(rig.scale.toArray(), [1, 1, 1], 'no assembled anisotropic or uniform fit');
  }
}

function sourceFurniture(all, frame) {
  const cast = (origin, direction, far = 8) => new THREE.Raycaster(point(origin).applyMatrix4(frame),
    point(direction).transformDirection(frame), 0, far).intersectObjects(all, false)[0];
  const inverse = frame.clone().invert();
  // Immutable independent complete-source witnesses already held by the Mk10
  // source tests. The starboard housing is not relabelled an unmeasured TOGS aperture.
  for (const [x, z, y, tolerance] of [[1.5, 0, 2.43372635, .0001],
    [1.8, 0, 2.37359240, .0001], [-1.3, -1.3, 1.942620, .0006],
    [-.35805, .70, 2.80820, .0002], [-1.25055, .673825, 4.102651, .0001],
    [1.01390, .747445, 4.249091, .0001]]) {
    const hit = cast([x, 5, z], [0, -1, 0]);
    near(hit?.point.clone().applyMatrix4(inverse).y, y, tolerance, 'source-owned variant fixture crown');
  }
  for (const [origin, direction, length] of [[[-1.3, 2.30, -1.3], [0, -1, 0], .33],
    [[.4, .81, .3], [0, -1, 0], .12], [[0, 2.1, 3], [0, 0, -1], 1.18],
    [[-.114809429, 2.70, -.049434754], [0, -1, 0], .03]]) {
    assert.equal(cast(origin, direction, length), undefined,
      'source open carrier, pierced basket, mantlet mouth and cupola channel retain actual air');
  }
  near(cast([0, 2.1, 3], [0, 0, -1])?.point.clone().applyMatrix4(inverse).z,
    1.796146, .00001, 'source rear wall of the open mantlet mouth');
}

function posedEquipment(root) {
  const all = []; root.traverse(m => {
    if (m.isMesh && !m.userData.shadowOnly && !m.name.startsWith('procShadow_') && !m.userData.vehicleMarking) all.push(m);
  });
  const yaw = root.getObjectByName('rig_turret'), pitch = root.getObjectByName('rig_gun');
  const inverse = yaw.matrixWorld.clone().invert();
  const buffers = all.map(m => m.geometry);
  for (const angle of [0, -.71, .83]) {
    yaw.rotation.y = angle; pitch.rotation.x = 0; root.updateMatrixWorld(true);
    sourceFurniture(all, yaw.matrixWorld.clone().multiply(inverse));
    assert.ok(all.every((m, i) => m.geometry === buffers[i]), 'posing does not rebuild geometry');
    const equipment = root.getObjectByName('turretDetail'), before = equipment.matrixWorld.clone();
    pitch.rotation.x = -.12; root.updateMatrixWorld(true);
    assert.ok(equipment.matrixWorld.equals(before), 'gun elevation cannot drag stationary variant fixtures');
  }
}

sharedWiring();
const coldMk5Spec = stable(getSpec('chieftain5_x'));
assert.equal(semantic(coldMk5Spec), MK5_SPEC, 'complete immutable cold Mk5 metadata, before any factory runs');
const currentPaintMatrices = [];
let warmedMk5Hash;
for (const quality of ['high', 'low']) {
  const afterOwnBuild = checkMk5(quality, coldMk5Spec);
  if (warmedMk5Hash) assert.equal(afterOwnBuild, warmedMk5Hash, 'complete warmed Mk5 metadata is quality-independent');
  warmedMk5Hash = afterOwnBuild;
  const { tank, emissions, stillbrew, casting } = measuredMk10(quality);
  try {
    assert.equal(emissions.length, 668);
    assert.equal(hash(JSON.stringify(emissions)), MK10_EMISSIONS, 'every non-foundation emission preserved exactly');
    const paint = verifiedPaint(tank.root, quality, currentPaintMatrices);
    assert.deepEqual(unaffectedMeshes(tank.root, paint), MK10_OTHER[quality],
      'all unaffected complete meshes exact after authenticating only the changed paint transforms');
    if (quality === 'low') preservationNegativeControls(tank.root, paint);
    assert.deepEqual(stillbrew.map(s => s.tag).sort(), ['port', 'spine', 'starboard']);
    checkDatums(tank.root); sourceCasting(tank.root, casting); posedEquipment(tank.root);
    assert.equal(semantic(getSpec('chieftain5_x')), warmedMk5Hash,
      'Mk10 construction and articulation cannot mutate any complete warmed Mk5 metadata');
    console.log(`chieftain10XMk5Foundation ${quality}: immutable Mk5, 668 unchanged Mk10 emissions, source datums/variant air/ownership PASS`);
  } finally { tank.dispose(); stillbrew.forEach(s => s.geometry.dispose()); casting.forEach(g => g.dispose()); }
}
