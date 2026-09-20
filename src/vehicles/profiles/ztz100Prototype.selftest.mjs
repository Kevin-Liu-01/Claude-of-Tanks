import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { TANK_SPECS } from '../specs.ts';
import { ensureInteriorFills, hasInteriorFills, interiorFillRecord } from '../interiorFills.ts';
import { createTankState } from '../../sim/movement.ts';
import { ZTZ100_PROTOTYPE_PROFILES, ZTZ100_PROTOTYPE_DATUMS as D,
  ZTZ100_PROTOTYPE_LAUNCHER as L } from './ztz100Prototype.ts';

const id = 'ztz100_prototype', spec = TANK_SPECS[id];
const digest = value => createHash('sha256').update(value).digest('hex');
const source = readFileSync(new URL('./ztz100Prototype.ts', import.meta.url), 'utf8');
const retainedHull = source.slice(source.indexOf('// ------------------------------------------------------------------------------------------------------- hull'),
  source.indexOf('// ----------------------------------------------------------------------------------------------------- turret'));
// Authenticated pre-redesign recipe. Only the former MBT turret is superseded.
assert.equal(digest(retainedHull), '7e627de62d85ba789826f346f1f2b72e2719221403fbce5451aa05c4912717f8');
assert.deepEqual(spec.armor.turretPivot, [0, 1.41, -.55]);
assert.deepEqual(spec.armor.gunPivot, [0, .64, .80]);
assert.deepEqual([spec.gunDepressionDeg, spec.gunElevationDeg], [6, 20]);
assert.equal(spec.gun.caliberMm, 35);
assert.deepEqual(spec.gun.shells.map(s => s.name), ['HJ-P9 Tandem', 'HJ-P9 Blast', '35 mm APFSDS-T']);
assert.deepEqual(spec.gun.shells.slice(0, 2).map(s => s.launcherTubes), [8, 8]);
assert.ok(!spec.gun.fixedLaunchCanisters, 'backup cannon retains its actual recoil mechanism');
assert.equal(D.wheelStations.length, 7);
const front = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
const double = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
let primitives = [];
const methods = ['add', 'addEquipment', 'addExternalArmor', 'addCupola', 'addHatch', 'addModuleVisual'];
registerProfiledBuilders({ [id]: port => ZTZ100_PROTOTYPE_PROFILES[id].build(new Proxy(port, {
  get(target, key) {
    const value = target[key];
    if (methods.includes(key)) return (...args) => {
      const index = args.findIndex(arg => arg?.isBufferGeometry), geometry = args[index];
      if (geometry?.userData.ztz100) {
        const [x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0] = args.slice(index + 1);
        const mesh = new THREE.Mesh(geometry.clone(), double);
        mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); mesh.updateMatrixWorld(true);
        primitives.push({ tag: geometry.userData.ztz100, bucket: args[index - 1], mesh });
      }
      return value.apply(target, args);
    };
    return typeof value === 'function' ? value.bind(target) : value;
  },
})) });
function near(actual, expected, tolerance, message) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} versus ${expected}`);
}
function geometryHash(g) {
  const buffers = Object.entries(g.attributes).sort().map(([key, a]) =>
    Buffer.concat([Buffer.from(key), Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength)]));
  if (g.index) buffers.push(Buffer.from(g.index.array.buffer));
  return digest(Buffer.concat(buffers));
}
function hullFingerprint(root) {
  const rows = [];
  root.traverseVisible(o => {
    if (!o.isMesh || o.userData.shadowOnly || o.userData.vehicleMarking || o.userData.interiorFill === true) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    if (ms.every(m => m.colorWrite === false || m.visible === false)) return;
    let p = o; while (p && p.name !== 'rig_hull') p = p.parent;
    if (!p) return;
    rows.push({ name: o.name, position: o.position.toArray(), matrix: o.matrix.toArray(),
      geometry: geometryHash(o.geometry), instance: o.isInstancedMesh ? digest(Buffer.from(o.instanceMatrix.array.buffer)) : null });
  });
  return digest(JSON.stringify(rows));
}
function selectNear(root) {
  root.traverse(o => { if (o.isLOD) {
    o.autoUpdate = false; o.levels.forEach((level, i) => level.object.visible = i === 0);
  } });
}
function visible(hit) {
  for (let node = hit.object; node; node = node.parent) if (!node.visible || node.userData.shadowOnly) return false;
  return true;
}
function cast(root, frame, origin, direction, far = 3) {
  const ray = new THREE.Raycaster(frame.localToWorld(new THREE.Vector3(...origin)),
    new THREE.Vector3(...direction).transformDirection(frame.matrixWorld), 0, far);
  return ray.intersectObject(root, true).find(visible);
}
function checkLaunchMouths(root, frame) {
  for (const x of L.columns) for (const y of L.rows) {
    const back = cast(root, frame, [x, y, 1.02], [0, 0, -1]);
    assert.ok(back, 'each open cell has a real rear plate');
    near(frame.worldToLocal(back.point.clone()).z, -1.075, .001, 'launcher air reaches its deep rear plate');
    for (let i = 0; i < 8; i++) {
      const a = (i + .173) * Math.PI / 4, cx = Math.cos(a), sy = Math.sin(a);
      const rim = cast(root, frame, [x + cx * .16, y + sy * .16, 1.02], [0, 0, -1], .05);
      assert.ok(rim, 'real terminal annulus must exist for all eight cells');
      near(frame.worldToLocal(rim.point.clone()).z, 1, .001, 'terminal annulus plane');
      const wall = cast(root, frame, [x, y, .35], [cx, sy, 0], .20);
      assert.ok(wall, 'real inward canister wall');
      const point = frame.worldToLocal(wall.point.clone());
      near(Math.hypot(point.x - x, point.y - y), .145, .004, 'full sized inner wall including LOW chord');
    }
  }
}
function checkBackup(root, frame) {
  for (let i = 0; i < 8; i++) {
    const a = (i + .173) * Math.PI / 4;
    const back = cast(root, frame, [Math.cos(a) * .015, Math.sin(a) * .015, 1.47], [0, 0, -1], .2);
    assert.ok(back); near(frame.worldToLocal(back.point.clone()).z, 1.36, .001, 'open 35 mm backup bore');
    const rim = cast(root, frame, [Math.cos(a) * .03, Math.sin(a) * .03, 1.47], [0, 0, -1], .04);
    assert.ok(rim); near(frame.worldToLocal(rim.point.clone()).z, 1.45, .001, 'backup seated annulus');
  }
}
function checkOptics(root, gun, turret) {
  const fixed = cast(root, turret, [.23, .76, .09], [0, 0, -1], .04);
  assert.equal(fixed?.object.name, 'turretGlass', 'fixed sensor window is the actual first-visible stock');
  const moving = cast(root, gun, [-.27, .285, .26], [0, 0, -1], .04);
  assert.equal(moving?.object.name, 'gunMountGlass', 'moving gunner window is the actual first-visible stock');
  assert.equal(cast(root, turret, [.23, .76, .074], [0, 0, 1], 4), undefined, 'fixed sensor has a clear frontal sightline');
  assert.equal(cast(root, gun, [-.27, .285, .244], [0, 0, 1], 4), undefined, 'offset moving gunner sight clears every legal pitch');
}
function inside(mesh, point) {
  const ray = new THREE.Raycaster(new THREE.Vector3(...point), new THREE.Vector3(.376, .619, .690).normalize(), 0, 10);
  const hits = ray.intersectObject(mesh, false).map(h => h.distance).filter((d, i, a) => !i || d - a[i - 1] > 1e-6);
  return hits.length % 2 === 1;
}
function stock(tag, x = null) {
  const matches = primitives.filter(p => p.tag === tag && (x === null || Math.abs(p.mesh.position.x - x) < 1e-5));
  assert.ok(matches.length, `actual ${tag} exists`); return matches;
}
function joint(a, b, point, label) {
  assert.ok(a.some(p => inside(p.mesh, point)) && b.some(p => inside(p.mesh, point)), `${label}: finite overlapping physical stock`);
}
function checkSeats() {
  joint(stock('concept-ring'), stock('concept-armored-platter'), [0, .0175, .10], 'ring into armored platter');
  for (const s of [-1, 1]) {
    joint(stock('pitch-pedestal', s * .515), stock('concept-central-spine'), [s * .46, .20, .65], 'pedestal to spine');
    joint(stock('pitch-bearing', s * .515), stock('pitch-pedestal', s * .515), [s * .515, .53, .80], 'bearing to pedestal');
    joint(stock('bank-inner-fork', s * .655), stock('bank-pitch-journal', s * .64), [s * .655, -.05, 0], 'journal to fork');
    joint(stock('bank-inner-fork', s * .655), stock('bank-lower-tray', s * 1.08), [s * .655, -.19, 0], 'fork to tray');
    joint(stock('bank-saddle-web', s * 1.08), stock('bank-lower-tray', s * 1.08), [s * 1.08, -.177, .54], 'tray to saddle web');
  }
  for (const x of L.columns) for (const y of L.rows) {
    const saddles = stock('canister-saddle', x).filter(p => p.mesh.position.y === y);
    joint(saddles, stock(y === .02 ? 'bank-saddle-web' : 'bank-between-row-web'), [x, y - .190, .54], 'web to saddle');
    joint(saddles, stock('missile-canister', x).filter(p => p.mesh.position.y === y), [x + .174, y, .54], 'saddle to canister wall');
  }
  joint(stock('sensor-bearing'), stock('concept-central-spine'), [.23, .485, -.10], 'sensor on actual roof');
  joint(stock('sensor-bearing'), stock('sensor-head'), [.23, .5775, -.10], 'sensor head on bearing');
  joint(stock('gunner-sight-foot'), stock('backup-mantlet'), [-.13, .11, .10], 'sight foot into mantlet');
  joint(stock('gunner-sight-stem'), stock('gunner-sight-foot'), [-.27, .13, .10], 'sight stem into foot');
  joint(stock('gunner-sight-stem'), stock('gunner-sight-body'), [-.27, .215, .10], 'sight body into stem');
}
function checkDeckClearance(gun, turret) {
  const point = new THREE.Vector3(); let minimum = Infinity;
  const stocks = primitives.filter(p => p.bucket === 'gunMount' && !p.tag.startsWith('backup')).map(p => p.mesh);
  const fill = gun.getObjectByName('gunInteriorFill');
  if (fill) { const local = new THREE.Mesh(fill.geometry, double); local.matrixWorld.copy(fill.matrix); stocks.push(local); }
  for (const mesh of stocks) {
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      gun.localToWorld(point); turret.worldToLocal(point);
      if (Math.abs(point.x) < .705) continue; // actual central journal joint owns this region
      minimum = Math.min(minimum, point.y - .08);
    }
  }
  assert.ok(minimum > .005, `complete lateral stock vertex/plane separation ${minimum}m`);
  return minimum;
}
function census(root) {
  let triangles = 0, objects = 0; const bounds = new THREE.Box3();
  root.traverseVisible(o => {
    if (!o.isMesh || o.userData.shadowOnly) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    if (ms.every(m => m.colorWrite === false || m.visible === false)) return;
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    objects++; bounds.expandByObject(o);
  });
  return { triangles, objects, bounds: [bounds.min.toArray(), bounds.max.toArray()] };
}
function primitiveScene(frame) {
  const group = new THREE.Group(); frame.add(group);
  for (const p of primitives.filter(p => p.bucket === 'gunMount' || p.bucket === 'gunMountDark')) {
    const mesh = p.mesh.clone(); mesh.material = front; mesh.userData.partTag = p.tag; group.add(mesh);
  }
  return group;
}
function negatives(tank, gun) {
  const group = primitiveScene(gun); tank.root.updateMatrixWorld(true);
  checkLaunchMouths(group, gun);
  const canister = group.children.find(m => m.userData.partTag === 'missile-canister');
  canister.visible = false;
  assert.throws(() => checkLaunchMouths(group, gun), assert.AssertionError, 'missing cell shell fails physical terminal rays');
  canister.visible = true; canister.position.x += .12; tank.root.updateMatrixWorld(true);
  assert.throws(() => checkLaunchMouths(group, gun), assert.AssertionError, 'shifted shell fails terminal alignment');
  canister.position.x -= .12; gun.remove(group);
  const fork = stock('bank-inner-fork')[0].mesh, oldY = fork.position.y;
  fork.position.y += .15; fork.updateMatrixWorld(true);
  assert.throws(checkSeats, assert.AssertionError, 'floating receiving fork fails finite joint');
  fork.position.y = oldY; fork.updateMatrixWorld(true);
  const cap = new THREE.Mesh(new THREE.CircleGeometry(.145, 24), front);
  cap.position.set(L.columns[0], L.rows[0], 1); gun.add(cap); tank.root.updateMatrixWorld(true);
  assert.throws(() => checkLaunchMouths(tank.root, gun), assert.AssertionError, 'painted missile mouth cap fails true air');
  gun.remove(cap); cap.geometry.dispose();
}
const expectedHull = { high: '7ef7ef615776e57833a4781b421e448a2d6fffda37826396e6dab7d56b05457a',
  low: 'fc3222771b933364690b6746853f390954319512442877751e1d51287ad6d028' };
await ensureInteriorFills([id]);
assert.ok(hasInteriorFills(id), 'actual generated prototype fill record is loaded');
const fillRecord = interiorFillRecord(id);
const fillBoxes = Object.fromEntries(['hull', 'turret', 'gun'].map(key =>
  [key, fillRecord[key] ? Buffer.from(fillRecord[key], 'base64').length / 12 : 0]));
function fillBounds(record) {
  const boxes = [];
  for (const owner of ['hull', 'turret', 'gun']) {
    const buffer = Buffer.from(record[owner] || '', 'base64');
    for (let i = 0; i < buffer.length; i += 12) {
      const span = Array.from({ length: 6 }, (_, k) => buffer.readUInt16LE(i + k * 2));
      boxes.push({ min: record.o.map((o, k) => o + span[k] * record.v),
        max: record.o.map((o, k) => o + (span[k + 3] + 1) * record.v) });
    }
  }
  return boxes;
}
function assertFillAir(boxes) {
  for (const box of boxes) for (const x of L.columns) for (const y of L.rows) {
    const [gx, gy, gz] = D.trunnion;
    if (box.max[2] <= gz - 1.075 || box.min[2] >= gz + L.mouth) continue;
    const dx = Math.max(box.min[0] - gx - x, 0, gx + x - box.max[0]);
    const dy = Math.max(box.min[1] - gy - y, 0, gy + y - box.max[1]);
    assert.ok(Math.hypot(dx, dy) >= L.innerRadius,
      'every generated box remains outside each complete open launch cylinder');
  }
}
assertFillAir(fillBounds(fillRecord));
assert.throws(() => assertFillAir([{ min: [-1.30, 2.04, .9], max: [-1.26, 2.10, 1.0] }]),
  assert.AssertionError, 'a hidden interior box in a real launch bore must fail');
const results = [];
try {
  for (const quality of ['high', 'low']) {
    primitives = [];
    const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true, quality,
      batchStatic: false, deferStaticBatch: true, camoSeed: 4242 });
    const materials = new Map();
    try {
      selectNear(tank.root); tank.root.updateMatrixWorld(true);
      assert.equal(hullFingerprint(tank.root), expectedHull[quality], 'complete native hull/gear buffers, order, transforms and instance matrices preserved');
      assert.equal(stock('missile-canister').length, 8); assert.equal(stock('missile-backplate').length, 8);
      const launchParts = tank.root.userData.combatGeometryParts.filter(p => p.module === 'missileRack');
      assert.equal(launchParts.length, 8, 'all physical cell shells publish the missile module');
      assert.ok(launchParts.every(p => p.parent === 'gunG'), 'missile module follows the pitching launcher');
      assert.ok(!tank.root.getObjectByName('ztz100RemoteMachineGun'), 'no extra roof MG');
      checkSeats(); const cost = census(tank.root);
      for (const [owner, count] of Object.entries(fillBoxes)) {
        const fill = tank.root.getObjectByName(`${owner}InteriorFill`);
        assert.equal(fill?.geometry.attributes.position.count / 3 || 0, count * 12,
          'runtime emits exactly the loaded generated fill boxes');
      }
      tank.root.traverse(o => { if (o.isMesh) {
        materials.set(o, o.material); o.material = front;
        for (const a of Object.values(o.geometry.attributes)) assert.ok(Array.from(a.array).every(Number.isFinite));
      } });
      const gun = tank.root.getObjectByName('rig_gun'), recoil = tank.root.getObjectByName('rig_recoil');
      const turret = tank.root.getObjectByName('rig_turret');
      const state = createTankState(spec, new THREE.Vector3(), 0); let poses = 0, gap = Infinity;
      for (const yaw of [-180, -90, 0, 90]) for (const pitch of [-6, 0, 20]) {
        state.turretYaw = yaw * Math.PI / 180; state.gunPitch = pitch * Math.PI / 180;
        tank.syncFromState(state, 1); tank.root.updateMatrixWorld(true);
        checkLaunchMouths(tank.root, gun); checkBackup(tank.root, recoil);
        for (const side of [-1, 1]) {
          const point = turret.worldToLocal(gun.localToWorld(new THREE.Vector3(side * .59, 0, 0)));
          assert.ok(stock('pitch-bearing', side * .515).some(p => inside(p.mesh, point.toArray())),
            'pitching journal remains inside fixed bearing at every legal pose');
        }
        checkOptics(tank.root, gun, turret);
        gap = Math.min(gap, checkDeckClearance(gun, turret));
        const mount = tank.root.getObjectByName('gunMount'), before = mount.matrix.clone();
        assert.equal(mount.parent, gun, 'launch stock belongs to the pitching, non-recoiling frame');
        for (let i = 0; i < spec.gun.launcherMuzzles.length; i++) {
          const expected = new THREE.Vector3(...Object.values(spec.gun.launcherMuzzles[i]));
          near(gun.worldToLocal(tank.gunMuzzleWorld(new THREE.Vector3(), i, true)).distanceTo(expected), 0, 1e-6, 'actual indexed missile firing anchor');
        }
        tank.recoilKick(0, 1); tank.syncFromState(state, .12); tank.root.updateMatrixWorld(true);
        assert.deepEqual(mount.matrix.elements, before.elements, 'pitching banks do not translate with backup recoil');
        assert.ok(recoil.position.z < -.005, 'short backup has real recoil');
        checkLaunchMouths(tank.root, gun); checkBackup(tank.root, recoil); poses += 2;
      }
      negatives(tank, gun);
      const glass = tank.root.getObjectByName('gunMountGlass'); glass.visible = false;
      assert.throws(() => checkOptics(tank.root, gun, turret), assert.AssertionError, 'missing physical optic fails first-hit proof');
      glass.visible = true;
      for (const parent of ['turretG', 'gunG']) assert.ok(tank.root.userData.combatGeometryParts.some(
        part => part.module === 'optics' && part.parent === parent), 'both true optical owners publish actual module stock');
      const mount = tank.root.getObjectByName('gunMount'); recoil.add(mount); tank.root.updateMatrixWorld(true);
      assert.throws(() => checkLaunchMouths(tank.root, gun), assert.AssertionError, 'wrong recoil parent displaces physical launch mouths');
      gun.add(mount); tank.root.updateMatrixWorld(true);
      tank.syncFromState(state, 1); tank.root.updateMatrixWorld(true);
      near(recoil.position.z, 0, 1e-6, 'backup returns to battery');
      for (let i = 0; i < 8; i++) {
        assert.equal(tank.recoilKick(0, 1, i, true), i); tank.syncFromState(state, .12); tank.root.updateMatrixWorld(true);
        near(recoil.position.z, 0, 1e-6, 'guided launch does not recoil the backup cannon');
        checkLaunchMouths(tank.root, gun);
      }
      assert.ok(cost.triangles < 100000 && cost.objects <= 65, 'unchanged MBT HIGH/object ceilings');
      results.push({ quality, ...cost, interiorFillRecordLoaded: true, fillBoxes, hullHash: expectedHull[quality], poses, minimumLateralDeckClearanceM: gap,
        physicalBore: tank.root.userData.physicalMuzzleBoreVerification, negatives: 7 });
    } finally {
      for (const [mesh, material] of materials) mesh.material = material;
      tank.dispose(); primitives.forEach(p => p.mesh.geometry.dispose());
    }
  }
} finally { registerProfiledBuilders({ [id]: ZTZ100_PROTOTYPE_PROFILES[id].build }); front.dispose(); double.dispose(); }
assert.ok(results[1].triangles < results[0].triangles, 'LOW reduces the new turret stock while retaining all hull/gear');
console.log('ztz100Prototype: native hull/gear parity, actual 8-cell concept, finite seats, HIGH/LOW articulation and physical negatives PASS', JSON.stringify(results));
