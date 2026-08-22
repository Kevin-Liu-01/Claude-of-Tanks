import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';

const EPS = 1e-4;
const nearPoint = (a, b, eps = EPS) => a.distanceToSquared(b) <= eps * eps;

function findTriangle(mesh, points) {
  const a = mesh.geometry.attributes.position.array;
  for (let i = 0; i < a.length; i += 9) {
    const actual = [
      new THREE.Vector3(a[i], a[i + 1], a[i + 2]),
      new THREE.Vector3(a[i + 3], a[i + 4], a[i + 5]),
      new THREE.Vector3(a[i + 6], a[i + 7], a[i + 8]),
    ];
    const used = new Set();
    let matches = true;
    for (const expected of points) {
      const index = actual.findIndex((point, candidate) => !used.has(candidate)
        && nearPoint(point, expected));
      if (index < 0) { matches = false; break; }
      used.add(index);
    }
    if (matches) return actual.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / 3);
  }
  return null;
}

const movingTriangles = [
  {
    mesh: 'gunMount',
    label: 'marked boot-cap top',
    points: [[-0.127, 0.260, 1.708], [-0.127, 0.260, 2.202], [0.127, 0.260, 1.708]],
  },
  {
    mesh: 'gunMount',
    label: 'marked boot left wall',
    points: [[-0.21, 0.161, 1.714], [-0.21, -0.119, 1.714], [-0.21, 0.161, 2.196]],
  },
  {
    mesh: 'gunMount',
    label: 'marked rotor face',
    points: [[-0.186, 0.349, 1.790], [-0.186, 0.282, 1.790], [0.186, 0.349, 1.790]],
  },
  {
    mesh: 'gunMountDark',
    label: 'marked thermal-clamp face',
    points: [[-0.13649, -0.05115, 2.545], [-0.10946, -0.10729, 2.545], [0, -0.020, 2.545]],
  },
];

const fixedTriangle = [
  [-0.436, 0.626, 1.475], [-0.436, 0.054, 1.475], [0.436, 0.626, 1.475],
];

for (const id of ['leclerc', 'leclerc_xlr', 'amx56']) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
  try {
    const root = tank.root;
    const turret = root.getObjectByName('rig_turret');
    const gun = root.getObjectByName('rig_gun');
    const turretMesh = turret?.getObjectByName('turret');
    assert.ok(turret && gun && turretMesh, `${id}: canonical turret and gun rigs exist`);
    assert.deepEqual(turret.userData.leclercGunHousingRig, {
      gunPivotLocal: [0, 0.27, 0.50],
      fixedSealingBackplateCenter: [0, 0.34, 1.05],
      movingHousingBucket: 'gunMount',
      movingDarkBucket: 'gunMountDark',
      neutralHousingSurfaceAnchors: [
        [0.127, 0.53, 2.455],
        [-0.21, 0.291, 2.455],
        [0, 0.5855, 2.29],
        [0, 0.25, 3.045],
      ],
    }, `${id}: explicit housing ownership receipt`);

    const moving = movingTriangles.map(({ mesh, label, points }) => {
      const node = gun.getObjectByName(mesh);
      assert.ok(node && node.isMesh, `${id}: ${label} is below rig_gun in ${mesh}`);
      const centroid = findTriangle(node, points.map((p) => new THREE.Vector3(...p)));
      assert.ok(centroid, `${id}: ${label} marked triangle is physically present in ${mesh}`);
      return { label, node, centroid };
    });
    const fixedCentroid = findTriangle(turretMesh,
      fixedTriangle.map((p) => new THREE.Vector3(...p)));
    assert.ok(fixedCentroid, `${id}: marked sealing backplate is physically present in turret armor`);

    const sample = (pitchDeg) => {
      gun.rotation.x = -THREE.MathUtils.degToRad(pitchDeg);
      root.updateMatrixWorld(true);
      return {
        moving: moving.map(({ node, centroid }) => node.localToWorld(centroid.clone())),
        fixed: turretMesh.localToWorld(fixedCentroid.clone()),
        bore: tank.gunDirWorld(new THREE.Vector3()),
      };
    };
    const neutral = sample(0);
    const elevated = sample(getSpec(id).gunElevationDeg);
    const depressed = sample(-getSpec(id).gunDepressionDeg);

    for (let index = 0; index < moving.length; index++) {
      assert.ok(elevated.moving[index].y > neutral.moving[index].y + 0.25,
        `${id}: ${moving[index].label} elevates with the gun`);
      assert.ok(depressed.moving[index].y < neutral.moving[index].y - 0.10,
        `${id}: ${moving[index].label} declines with the gun`);
    }
    assert.ok(nearPoint(neutral.fixed, elevated.fixed, 1e-7)
      && nearPoint(neutral.fixed, depressed.fixed, 1e-7),
    `${id}: turret-side sealing backplate stays fixed through gun pitch`);
    assert.ok(elevated.bore.y > neutral.bore.y + 0.20
      && depressed.bore.y < neutral.bore.y - 0.10,
    `${id}: barrel follows the same legal elevation/depression sweep`);
  } finally {
    tank.dispose();
  }
}

console.log('leclercGunHousingRig.selftest: all four marked housing surfaces pitch and the marked backplate stays turret-fixed');
