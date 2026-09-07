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
  high: ['03e1d603add977c5ad36503bf1bda6684cf6d4216517d140e538ecb6a4305992', 74, 42],
  low: ['9494b8fda2c7d22ca0dcb011a8e334b5b9f9f58af456afe70fc77446ef9cc858', 72, 40],
};
const MK5_SPEC = '3ba476c4946bb886b64575719c3b9102748c93301a11154b86545db9ee41d949';
const MK5_DATUMS = '0faf866441b38be84cc3b9fa9065a11cce13ac3999c71445b840d5179d471a30';
// Separate pre-edit actual Mk10 evidence pins EVERY emission except the exact
// hull/cast/horn/Stillbrew foundation scope. Thus copying the Mk5 projector,
// 16 launcher mouths, other equipment, gun or gear cannot silently pass.
const MK10_EMISSIONS = '4f4676f78403825782a79192f5a57f3f11b6dd1dfad3f0ade1a15f7ad3997712';
const MK10_OTHER = {
  high: ['8dd2af5b7756918a81ad4e61d411953885d036e2b66e1347a1839461d1b7454f', 36],
  low: ['1c39adb7a7afa8f220d59b173af90c00a69ccba9db3b456733c951144fdf07d5', 34],
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

function sceneRows(root) {
  const rows = []; root.updateMatrixWorld(true);
  function visit(o, path) {
    const row = { path, name: o.name, type: o.type, visible: o.visible,
      matrix: o.matrix.toArray(), matrixWorld: o.matrixWorld.toArray() };
    if (o.geometry) {
      const g = o.geometry;
      row.geometry = { index: attribute(g.index), attributes: Object.fromEntries(
        Object.keys(g.attributes).sort().map(k => [k, attribute(g.attributes[k])])),
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
  for (const key of Object.keys(g.attributes).sort()) {
    const a = g.attributes[key].array;
    h.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  if (g.index) {
    const a = g.index.array; h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  }
  return h.digest('hex');
}

function checkMk5(quality, coldSpec) {
  assert.equal(semantic(CHIEFTAIN5_X_DATUMS.chieftain5_x), MK5_DATUMS, 'Mk5 physical datum record is unchanged');
  const tank = createTank('chieftain5_x', null, { quality, proceduralOnly: true,
    camoSeed: 4242, materialMode: 'geometry-only', geometryReceipt: true });
  try {
    const rows = sceneRows(tank.root);
    assert.deepEqual([hash(JSON.stringify(rows)), rows.length, rows.filter(r => r.geometry).length],
      MK5_BEFORE[quality], `Mk5/${quality}: immutable complete pre-foundation scene`);
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
