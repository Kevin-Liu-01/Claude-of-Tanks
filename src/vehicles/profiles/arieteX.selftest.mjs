import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { buildArieteX } from './arieteXPhotoDraft.ts';

// Isolated historical PHOTO primitive regression. The actual supplied-file X
// is tested separately; this must never count as its visual acceptance.
registerProfiledBuilders({ ariete_c1_x: buildArieteX });

// Independent CIO envelope anchors. Interior station/optic-depth assertions
// below are construction contracts, NOT claimed measurements of the AI GLB.
const PUBLISHED = { roof: 2.50, hullRoof: 1.82, clearance: .48, width: 3.61, length: 9.87 };
const near = (got, expected, tolerance, label) => assert.ok(
  Number.isFinite(got) && Math.abs(got - expected) <= tolerance,
  `${label}: ${got}, expected ${expected} ± ${tolerance}`);
const ray = (meshes, from, direction, far = 20) => new THREE.Raycaster(
  new THREE.Vector3(...from), new THREE.Vector3(...direction), 0, far,
).intersectObjects(meshes, false)[0];
const worldBounds = meshes => {
  const box = new THREE.Box3(), vertex = new THREE.Vector3(), matrix = new THREE.Matrix4();
  for (const mesh of meshes) {
    const positions = mesh.geometry.attributes.position;
    for (let instance = 0; instance < (mesh.isInstancedMesh ? mesh.count : 1); instance++) {
      if (mesh.isInstancedMesh) {
        mesh.getMatrixAt(instance, matrix);
        matrix.premultiply(mesh.matrixWorld);
      } else matrix.copy(mesh.matrixWorld);
      for (let i = 0; i < positions.count; i++) box.expandByPoint(
        vertex.fromBufferAttribute(positions, i).applyMatrix4(matrix));
    }
  }
  return box;
};

function turretRay(meshes, yaw, point, direction, far = 20) {
  const origin = new THREE.Vector3(...point).sub(new THREE.Vector3(0, 1.60, .56))
    .applyMatrix4(yaw.matrixWorld);
  const axis = new THREE.Vector3(...direction).transformDirection(yaw.matrixWorld);
  return new THREE.Raycaster(origin, axis, 0, far).intersectObjects(meshes, false)[0];
}

function checkLaunchers(meshes, yaw) {
  // These independent construction contracts reject the previous physically
  // buried layout. They do not promote the AI file to a metric instrument.
  for (const side of [-1, 1]) for (const z of [.66, .48, .30, .12]) {
    const center = new THREE.Vector3(side * 1.61, 2.205, z);
    const axis = new THREE.Vector3(side * .76, .19, .62).normalize();
    const u = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
    const v = axis.clone().cross(u).normalize();
    const mouth = center.clone().addScaledVector(axis, .145);
    for (let k = 0; k < 8; k++) {
      const angle = k * Math.PI / 4;
      const radial = u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle));
      const boreOrigin = mouth.clone().addScaledVector(radial, .024);
      const bore = turretRay(meshes, yaw, boreOrigin.toArray(), axis.clone().negate().toArray());
      assert.equal(bore?.object.name, 'turretDark', 'each actual launcher mouth reaches its recessed stock');
      near(bore?.distance, .220, 2e-6, 'all eight radial bore rays retain the clear forward tube');
      assert.equal(turretRay(meshes, yaw, boreOrigin.toArray(), axis.clone().negate().toArray(), .210),
        undefined, 'no carrier, armor or adjacent launcher fills the actual bore');
      const rim = turretRay(meshes, yaw, mouth.clone().addScaledVector(radial, .040).toArray(),
        axis.clone().negate().toArray());
      assert.equal(rim?.object.name, 'turretDetail', 'closed metal annulus surrounds every mouth');
      near(rim?.distance, .050, 2e-6, 'actual forward annular face');
    }
    const lowerStock = turretRay(meshes, yaw, [side * 1.548, 2.12, z - .051], [0, 1, 0]);
    const carrier = turretRay(meshes, yaw, [side * 1.548, 2.17, z - .051], [0, -1, 0]);
    near(lowerStock?.distance, .0239812, 2e-6, 'actual lower stock surface at the carrier joint');
    near(carrier?.distance, .01474324, 2e-6, 'actual carrier upper surface at the same joint');
    assert.ok(2.17 - carrier.distance - (2.12 + lowerStock.distance) > .010,
      'every stock overlaps its carrier by over 10 mm at the real sampled surfaces');
  }
  for (const side of [-1, 1]) {
    // Independent flank and carrier rays pin positive support, not a floating
    // launcher plane. Its inner edge remains embedded in permanent armor.
    const root = turretRay(meshes, yaw, [side * 1.3, 2.13, .50], [side, 0, 0]);
    assert.equal(root?.object.name, 'turretDetail', 'carrier starts within the closed turret');
    near(Math.abs(root?.point.clone().applyMatrix4(yaw.matrixWorld.clone().invert()).x),
      1.425, 2e-6, 'carrier positive root inside permanent flank');
  }
}

function checkRearStowage(meshes, yaw) {
  for (const side of [-1, 1]) {
    const bin = turretRay(meshes, yaw, [side * .82, 2.25, -2.5], [0, 0, 1]);
    assert.equal(bin?.object.name, 'turretDetail', 'broad aft bin is visible outside the permanent bustle');
    near(bin?.distance, .320, 2e-6, 'separate aft bin face');
    assert.equal(turretRay(meshes, yaw, [side * .25, 2.33, -2.18], [0, 0, 1], .100),
      undefined, 'folded bracket retains its open center ahead of its stock');
    const backing = turretRay(meshes, yaw, [side * .25, 2.33, -2.18], [0, 0, 1]);
    near(backing?.distance, .112, 2e-6, 'real bracket backing behind the open recess');
    const stock = turretRay(meshes, yaw, [side * .82, 2.25, -1.9], [0, 0, -1]);
    near(stock?.distance, .120, 2e-6, 'bin root overlaps the unchanged rear armor by 10 mm');
  }
}

for (const quality of ['high', 'low']) {
  const tank = createTank('ariete_c1_x', null, { quality, proceduralOnly: true,
    geometryReceipt: true, batchStatic: false });
  try {
    tank.root.updateMatrixWorld(true);
    const get = name => {
      const object = tank.root.getObjectByName(name);
      assert.ok(object, `actual ${name} exists`);
      return object;
    };
    const all = [];
    tank.root.traverse(mesh => {
      if (mesh.isMesh && !mesh.name.startsWith('procShadow_') && !mesh.userData.vehicleMarking) all.push(mesh);
    });
    const hull = get('hull'), turret = get('turret'), yaw = get('rig_turret');
    const gun = get('rig_gun'), recoil = get('rig_recoil'), muzzle = get('rig_muzzle');
    assert.equal(get('gunMount').parent, gun, 'actual cradle pitches');
    assert.equal(get('gun').parent, recoil, 'authored stock/sleeve/muzzle recoil together');
    near(worldBounds([turret]).max.y, PUBLISHED.roof, 1e-6, 'published structural turret roof');
    near(worldBounds([hull]).max.y, PUBLISHED.hullRoof, 1e-6, 'published hull height');
    near(ray([hull], [0, 0, 0], [0, 1, 0])?.point.y, PUBLISHED.clearance, 1e-6,
      'published structural ground clearance');
    const bounds = worldBounds(all);
    near(bounds.max.x - bounds.min.x, PUBLISHED.width, .04,
      'manufacturer fender envelope, allowing separately proud pins');
    near(bounds.max.z - bounds.min.z, PUBLISHED.length, .015, 'gun-forward manufacturer length');
    assert.ok(bounds.min.y >= -1e-6, `actual shoe vertices stay above ground: ${bounds.min.y}`);
    near(muzzle.getWorldPosition(new THREE.Vector3()).z, 5.875, 1e-6,
      'physical muzzle marker is not shortened by generic gun fitting');
    const glass = ray(all, [.64, 2.785, 1.0], [0, 0, -1]);
    assert.equal(glass?.object.name, 'turretGlass', 'front approach reaches actual sight glass');
    near(glass?.point.z, .616, 1e-6, 'explicitly inferred recessed glass construction plane');
    assert.equal(ray(all, [.64, 2.785, .67], [0, 0, -1], .050), undefined,
      'panoramic sight mouth is real empty volume, not paint on a cylinder');
    near(ray(all, [.64, 2.83, 1], [0, 0, -1])?.point.z, .645, .001,
      'raised solid rim survives above the sight opening');
    const turretOnly = all.filter(mesh => {
      let parent = mesh;
      while (parent && parent !== yaw) parent = parent.parent;
      return parent === yaw;
    });
    assert.equal(ray(turretOnly, [1.42, 1.85, -3], [0, 0, 1], .70), undefined,
      'photo-supported rear bustle undercut remains open');
    near(ray(all, [0, 2.08, 6], [0, 0, -1])?.point.z, 5.5955, .002,
      'bored main muzzle reaches recessed inner backing, not a flush solid cap');
    const census = all.map(mesh => [mesh, mesh.geometry.attributes.position.count]);
    const detail = get('turretDetail');
    checkLaunchers(all, yaw);
    checkRearStowage(all, yaw);
    for (const angle of [-.9, .7]) for (const pitch of [-.12, .25]) {
      yaw.rotation.y = angle;
      gun.rotation.x = pitch;
      tank.root.updateMatrixWorld(true);
      checkLaunchers(all, yaw);
      checkRearStowage(all, yaw);
      assert.ok(turretOnly.includes(detail), 'permanent roof equipment remains turret-owned through its fitting group');
      const before = muzzle.getWorldPosition(new THREE.Vector3());
      recoil.position.z = -.10;
      tank.root.updateMatrixWorld(true);
      near(before.distanceTo(muzzle.getWorldPosition(new THREE.Vector3())), .10, 1e-6,
        'actual bore assembly follows recoil through yaw and pitch');
      recoil.position.z = 0;
      for (const [mesh, count] of census) assert.equal(mesh.geometry.attributes.position.count, count,
        'articulation does not rebuild or discard equipment');
    }
  } finally { tank.dispose(); }
}
console.log('arieteX.selftest: high/low primary envelope, real apertures, native ground and rig ownership passed');
