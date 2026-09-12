import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { KIT, registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildStrv122X } from './strv122XPhotoDraft.ts';

// Historical photo contract only; actual supplied-ID tests are separate.
registerProfiledBuilders({ strv122_x: buildStrv122X });

// Independent FMV envelope values. Individual fittings below are explicit
// photo-led construction contracts, never assertions against the AI source.
const FMV = { width: 3.78, gunForwardLength: 9.97 };
const near = (actual, expected, tolerance, label) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  `${label}: ${actual} versus ${expected} ± ${tolerance}`);
const ray = (meshes, origin, direction, far = 20) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far,
).intersectObjects(meshes, false)[0];
function bounds(meshes) {
  const result = new THREE.Box3(), p = new THREE.Vector3(), matrix = new THREE.Matrix4();
  for (const mesh of meshes) {
    const position = mesh.geometry.attributes.position;
    for (let n = 0; n < (mesh.isInstancedMesh ? mesh.count : 1); n++) {
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(n, matrix);
        matrix.premultiply(mesh.matrixWorld);
      } else matrix.copy(mesh.matrixWorld);
      for (let i = 0; i < position.count; i++) result.expandByPoint(
        p.fromBufferAttribute(position, i).applyMatrix4(matrix));
    }
  }
  return result;
}

function galixFrame(side) {
  const n = new THREE.Vector3(side * .953, .28, .11).normalize();
  const u = new THREE.Vector3(0, 1, 0).cross(n).normalize();
  const v = n.clone().cross(u).normalize();
  return new THREE.Matrix4().makeBasis(u, v, n).setPosition(side * 1.56, 2.23, -1.18);
}

function checkGalix(meshes, turret) {
  const move = turret.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0, -1.61, -.61));
  for (const side of [-1, 1]) {
    const sourceFrame = galixFrame(side), posed = move.clone().multiply(sourceFrame);
    const inward = new THREE.Vector3(0, 0, -1).transformDirection(posed);
    const cast = (u, v, d, far = 1) => new THREE.Raycaster(
      new THREE.Vector3(u, v, d).applyMatrix4(posed), inward, 0, far,
    ).intersectObjects(meshes, false)[0];
    for (const u of [-.135, .135]) for (const v of [-.105, .105]) {
      for (let sample = 0; sample < 8; sample++) {
        const a = sample * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
        const stock = cast(u + c * .025, v + s * .025, .06);
        assert.equal(stock?.object.name, 'turretDark', 'each actual pierced mouth reaches its stock');
        near(stock?.distance, .150, 2e-6, 'recessed stock remains behind the inclined skin');
        assert.equal(cast(u + c * .025, v + s * .025, .06, .140), undefined,
          'all radial bore rays exclude skin, folds, armor and adjacent tubes');
        const rim = cast(u + c * .046, v + s * .046, .06);
        assert.equal(rim?.object.name, 'turretDetail', 'actual annular metal lip survives');
        near(rim?.distance, .052, 2e-6, 'lip is only 8 mm proud of the skin, not a long exposed pipe');
      }
    }
    for (const [u, v] of [[0, 0], [-.22, 0], [.22, 0], [0, -.20], [0, .20]]) {
      const skin = cast(u, v, .06);
      assert.equal(skin?.object.name, 'turretDetail', 'broad solid panel survives between the four holes');
      near(skin?.distance, .060, 2e-6, 'independent inclined front-skin plane');
    }
    assert.equal(cast(0, 0, -.015, .060), undefined,
      'folded carrier is hollow behind its center, not a filled bounding wedge');
    for (const [u, v] of [[0, -.229], [0, .229], [-.274, 0], [.274, 0]]) {
      const face = new THREE.Vector3(u, v, -.005).applyMatrix4(sourceFrame);
      const origin = new THREE.Vector3(side * 1.3, face.y, face.z).applyMatrix4(move);
      const outward = new THREE.Vector3(side, 0, 0).transformDirection(move);
      const root = new THREE.Raycaster(origin, outward, 0, .20).intersectObjects(meshes, false)[0];
      near(root?.distance, .035, 2e-6, 'each folded edge has an actual armor-overlapped root');
      assert.equal(root?.object.name, 'turretDetail', 'folded support, not a hidden armor proxy');
      const armor = meshes.filter(mesh => mesh.name === 'turret');
      // Armor is front-sided: approach its real outer surface from outside,
      // rather than turning material double-sided to see an interior exit.
      const outer = new THREE.Raycaster(origin.clone().addScaledVector(outward, .70),
        outward.clone().negate(), 0, 1).intersectObjects(armor, false)[0];
      assert.ok(outer && .70 - outer.distance > root.distance + .010,
        'permanent turret surface overlaps every folded root by at least 10 mm');
    }
  }
}

for (const quality of ['high', 'low']) {
  const original = KIT.buildRunningGear;
  let gear, tank;
  KIT.buildRunningGear = (...args) => { gear = original(...args); return gear; };
  try {
    tank = createTank('strv122_x', null, { quality, proceduralOnly: true,
      geometryReceipt: true, batchStatic: false });
  } finally { KIT.buildRunningGear = original; }
  try {
    tank.root.updateMatrixWorld(true);
    const meshes = [];
    tank.root.traverse(mesh => {
      if (mesh.isMesh && !mesh.name.startsWith('procShadow_') && !mesh.userData.vehicleMarking) meshes.push(mesh);
    });
    const get = name => {
      const result = tank.root.getObjectByName(name);
      assert.ok(result, `${quality}: actual ${name} exists`);
      return result;
    };
    const hull = get('hull'), turret = get('rig_turret'), gun = get('rig_gun');
    const recoil = get('rig_recoil'), muzzle = get('rig_muzzle');
    const box = bounds(meshes);
    near(box.max.x - box.min.x, FMV.width, .035, 'FMV width with separately proud pins');
    near(box.max.z - box.min.z, FMV.gunForwardLength, .005, 'FMV gun-forward envelope');
    assert.ok(box.min.y >= -1e-6, `all actual shoe vertices above ground: ${box.min.y}`);
    const shoes = meshes.filter(mesh => mesh.userData.trackRigidLinkChords);
    assert.equal(shoes.length, 2, 'both native belts use the same rounded band and rigid-link course');
    const wheelStations = structuredClone(gear.roadWheelLayout);
    const pitch = shoes[0].userData.trackShoePitchM;
    for (let phase = 0; phase < 48; phase++) {
      gear.update(pitch * phase / 48, -pitch * phase / 48, 0);
      near(bounds(shoes).min.y, 0, .0001, 'all opposing-scroll phases retain physical shoe contact');
      assert.deepEqual(gear.roadWheelLayout, wheelStations, 'contact seating never moves axle stations');
    }
    gear.update(0, 0, 0);
    near(ray([hull], [0, 0, -3.18], [0, 1, 0])?.point.y, .48, .002,
      'FMV rear clearance, not an AI underside');
    near(muzzle.getWorldPosition(new THREE.Vector3()).z, 6.12, 1e-6, 'physical muzzle marker');
    // Fleet mouth standard (2026-09-11): the lining seats 0.3 mm ahead of the
    // tube edge; the true 120 mm bore keeps its recessed backing behind it.
    const mouth = ray(meshes, [0, 2.055, 6.4], [0, 0, -1]);
    assert.equal(mouth?.object.name, 'muzzleBoreShadowFallbackDisc', 'visible mouth is the fleet lining');
    near(mouth?.point.z, 6.1203, .0005, 'lining seats on the tube edge');
    near(ray(meshes.filter(mesh => !/muzzleBoreShadowFallback/.test(mesh.name)), [0, 2.055, 6.4], [0, 0, -1])?.point.z, 5.8305, .002,
      'true 120 mm bore reaches its recessed inner backing');
    const sight = ray(meshes, [.77, 2.64, 1.4], [0, 0, -1]);
    assert.equal(sight?.object.name, 'turretGlass', 'gunner sight reaches glass inside real cavity');
    near(sight?.point.z, .8135, .0001, 'inferred concealed glass construction plane');
    assert.equal(ray(meshes, [.77, 2.64, 1.19], [0, 0, -1], .34), undefined,
      'sight approach volume is actual empty air');
    near(ray(meshes, [1.075, 2.64, 1.4], [0, 0, -1])?.point.z, 1.19, .0001,
      'solid outer jamb is retained next to sight air');
    for (const side of [-1, 1]) {
      assert.equal(ray(meshes, [side * 2.1, .80, -.56], [-side, 0, 0], .30), undefined,
        'lower skirt loop has an open center rather than a filled bracket');
    }
    assert.ok(get('gunMount').parent === gun, 'mantlet is owned by gun pitch');
    assert.ok(get('gun').parent === recoil, 'stock and muzzle belong to recoil');
    const equipment = meshes.filter(mesh => {
      let parent = mesh;
      while (parent && parent !== turret) parent = parent.parent;
      return parent === turret && mesh.name === 'turretDetail';
    });
    assert.ok(equipment.length, 'permanent roof and side fittings exist under the yaw rig');
    const counts = meshes.map(mesh => [mesh, mesh.geometry.attributes.position.count]);
    checkGalix(meshes, turret);
    for (const yaw of [-.8, .65]) for (const elevation of [-.12, .28]) {
      turret.rotation.y = yaw;
      gun.rotation.x = elevation;
      tank.root.updateMatrixWorld(true);
      checkGalix(meshes, turret);
      const before = muzzle.getWorldPosition(new THREE.Vector3());
      recoil.position.z = -.11;
      tank.root.updateMatrixWorld(true);
      near(before.distanceTo(muzzle.getWorldPosition(new THREE.Vector3())), .11, 1e-6,
        'complete barrel follows physical recoil after legal yaw and elevation');
      recoil.position.z = 0;
      for (const [mesh, count] of counts) assert.equal(mesh.geometry.attributes.position.count, count,
        'articulation preserves every fitted primitive');
    }
  } finally { tank.dispose(); }
}
console.log('strv122X.selftest: high/low FMV envelope, true sight and eight bores, ground and rig ownership passed');
