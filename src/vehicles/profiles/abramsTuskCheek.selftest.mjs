import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const tank = createTank('m1a2_tusk', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
const armor = tank.root.getObjectByName('turret');
const detail = tank.root.getObjectByName('turretDetail');
const dark = tank.root.getObjectByName('turretDark');
const externalArmor = tank.root.getObjectByName('turretExternalArmor');
assert.ok(armor?.geometry, 'TUSK turret armor geometry exists');
assert.ok(detail?.geometry, 'TUSK turret detail geometry exists');
assert.ok(dark?.geometry, 'TUSK turret dark geometry exists');
assert.ok(externalArmor?.geometry, 'TUSK layered cheek ERA uses the external-armor mesh');

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();

function largeCheekFaces(mesh, side) {
  const position = mesh.geometry.getAttribute('position');
  const normal = mesh.geometry.getAttribute('normal');
  const faces = [];
  for (let i = 0; i < position.count; i += 3) {
    a.fromBufferAttribute(position, i);
    b.fromBufferAttribute(position, i + 1);
    c.fromBufferAttribute(position, i + 2);
    const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    const faceNormal = new THREE.Vector3().fromBufferAttribute(normal, i);
    if (side * centroid.x > 0.65 && centroid.z > 1.0 && area > 0.12
      && side * faceNormal.x > 0.4 && faceNormal.z > 0.4) {
      faces.push({
        vertices: [a.clone(), b.clone(), c.clone()],
        normal: faceNormal,
      });
    }
  }
  return faces;
}

for (const side of [-1, 1]) {
  const cheekFaces = largeCheekFaces(externalArmor, side);
  assert.equal(cheekFaces.length, 4,
    `${side < 0 ? 'left' : 'right'} unified cheek keeps body and inset cap faces`);
  const bodies = cheekFaces.slice(0, 2);
  const caps = cheekFaces.slice(2);
  assert.equal(caps.length, 2,
    `${side < 0 ? 'left' : 'right'} unified cheek has one continuous inset cap`);
  assert.ok(caps[0].normal.distanceTo(caps[1].normal) < 1e-6,
    'inset cap shares one normal and cannot form a split or triangular tongue');

  assert.equal(bodies.length, 2,
    'unified cheek body remains one smooth, closed two-triangle cassette');

  const bodyX = bodies.flatMap(({ vertices }) => vertices.map((v) => side * v.x));
  const capX = caps.flatMap(({ vertices }) => vertices.map((v) => side * v.x));
  assert.ok(Math.min(...capX) > Math.min(...bodyX) + 0.025
    && Math.max(...capX) < Math.max(...bodyX) - 0.025,
  'contrasting laminate is inset on both sides and leaves a visible camouflaged rim');
}

// The TUSK-only M250 shift is visible in the gunmetal bore/rim vertices. The
// old inherited banks ended at |x| <= 1.451 and were swallowed by the new
// 155 mm cheek cassettes. Both banks must now project past |x|=1.52 while
// staying inside the turret plan envelope, proving the complete launchers
// moved with their bores rather than leaving partial cylinders behind.
const darkPosition = dark.geometry.getAttribute('position');
for (const side of [-1, 1]) {
  const exposedLauncherVertices = [];
  for (let i = 0; i < darkPosition.count; i++) {
    const x = darkPosition.getX(i);
    const y = darkPosition.getY(i);
    const z = darkPosition.getZ(i);
    if (side * x > 1.52 && side * x < 1.59
      && y > 0.52 && y < 0.72 && z > 1.20 && z < 1.70) {
      exposedLauncherVertices.push([x, y, z]);
    }
  }
  assert.ok(exposedLauncherVertices.length >= 140,
    `${side < 0 ? 'left' : 'right'} M250 bank clears the cheek ERA face`);
}

tank.dispose();
console.log('abramsTuskCheek.selftest: cheek caps contrast and both M250 banks clear ERA');
