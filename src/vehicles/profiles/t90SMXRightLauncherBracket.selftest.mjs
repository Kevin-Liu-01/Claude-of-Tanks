import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { addT90SMRightLauncherBracket } from './t90SMXRightLauncherBracket.ts';

const near = (a, b, epsilon, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < epsilon,
  `${label}: ${a} versus source ${b}`);
const FRONT = [
  [1.12, 2.21, -.377327106, [.373737651, .281486001, .883790586]],
  [1.16, 2.21, -.395112137, [.388041658, .305828207, .869420945]],
  [1.14, 2.255, -.400204829, [.378386254, .231728596, .896172807]],
  [1.16, 2.13, -.226918961, [.214309059, .331271944, .918874597]],
  [1.26, 2.13, -.254412922, [.284635494, .331181605, .899611794]],
  [1.36, 2.13, -.295013578, [.431520712, .325624974, .841283693]],
  [1.24, 2.03, -.158418033, [.247133864, .471397956, .846586570]],
  [1.34, 2.03, -.197219998, [.393471443, .467396716, .791656828]],
  [1.24, 2.076, -.256224800, [.280143451, .343728056, .896309472]],
];
const BACKS = [[1.122002, 2.206300, -.380737], [1.157010, 2.131652, -.229965],
  [1.258857, 2.132529, -.262177], [1.359721, 2.133898, -.301531],
  [1.238656, 2.027415, -.172246], [1.331444, 2.024894, -.215698]];
function hit(root, origin, direction, far = 12) {
  return new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far)
    .intersectObject(root, true).find(h => {
      for (let p = h.object; p; p = p.parent) if (!p.visible) return false;
      return !h.object.userData.geometryAuditIgnore && !/^procShadow/.test(h.object.name);
    });
}
function inside(mesh, xyz) {
  const h = new THREE.Raycaster(new THREE.Vector3(...xyz), new THREE.Vector3(.872, .271, .415).normalize())
    .intersectObject(mesh).map(row => row.distance);
  return h.filter((v, i) => i === 0 || v - h[i - 1] > 1e-6).length % 2 === 1;
}

// Test the exact geometry passed to the factory, including watertight volume
// and actual stock engagement rather than proximity to a dummy seating box.
const group = new THREE.Group(), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
addT90SMRightLauncherBracket({ addEquipment(bucket, g, x, y, z) {
  assert.equal(bucket, 'turretDetail', 'mounting hardware is not structural armor');
  assert.deepEqual([x, y, z], [-.008, -1.532, -.359], 'unchanged source yaw datum');
  assert.equal(g.attributes.uv.count, g.attributes.position.count);
  const p = g.attributes.position;
  let volume = 0;
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i), b = new THREE.Vector3().fromBufferAttribute(p, i + 1);
    volume += a.dot(b.cross(new THREE.Vector3().fromBufferAttribute(p, i + 2))) / 6;
  }
  assert.ok(volume > 1e-8, 'every face cell is an outward-wound closed positive volume');
  group.add(new THREE.Mesh(g, material));
} });
group.updateMatrixWorld(true);
for (const back of BACKS) assert.ok(group.children.some(m => inside(m, back)),
  `actual stock rear center ${back} engages the measured source carrier volume`);
assert.ok(!group.children.some(m => inside(m, [1.24, 2.14, -.35])),
  'real space beneath the folded upper shelf is not filled by a bounding box');
assert.equal(hit(group, [1.26, 2.22, -.1], [0, 0, -1], .34), undefined,
  'only the inboard single station rises above the broad middle course');
assert.equal(hit(group, [1.18, 2.25, -.1], [0, 0, -1], .34), undefined,
  'measured upper outboard bevel preserves adjacent source air');
const bounds = new THREE.Box3().setFromObject(group);
near(bounds.max.x, 1.410153254, .00001, 'source outer carrier span');
assert.ok(bounds.max.z < -.10 && bounds.min.z > -.421, 'carrier stays behind the source launcher mouths');
for (const mesh of group.children) mesh.geometry.dispose();
material.dispose();

for (const quality of ['high', 'low']) {
  const tank = createTank('t90sm_x', null, { quality, geometryReceipt: true, proceduralOnly: true });
  try {
    tank.root.updateMatrixWorld(true);
    for (const [x, y, z, n] of FRONT) {
      // The source-fixed 3 mm window isolates the carrier behind each stock;
      // a mouth-forward ray would correctly encounter the existing tube first.
      const h = hit(tank.root, [x, y, z + .001], [0, 0, -1], .003);
      near(h?.point.z, z, .00002, `${quality} actual source carrier face`);
      assert.equal(h.object.name, 'turretDetail');
      near(h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(new THREE.Vector3(...n)),
        1, .00002, 'source cast facet direction');
      let owner = h.object;
      while (owner && owner.name !== 'rig_turret') owner = owner.parent;
      assert.ok(owner, 'all bracket faces follow turret yaw, not main-gun pitch');
    }
    for (const [x, z, y] of [[1.24, -.35, 2.172869970], [1.36, -.35, 2.178445499]]) {
      near(hit(tank.root, [x, 3, z], [0, -1, 0])?.point.y, y, .00002,
        `${quality} actual source upper shelf, full-scene ray`);
    }
    near(hit(tank.root, [1.24, 2.076246675, -.21], [0, -1, 0], .003)?.point.y,
      2.075246675, .00002, `${quality} source lower shelf behind the actual stock`);
  } finally { tank.dispose(); }
}
console.log('t90SMXRightLauncherBracket: source cast faces/shelves, six engaged stocks, real air and high/low turret ownership pass');
