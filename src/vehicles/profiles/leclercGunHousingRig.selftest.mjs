import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const EPS = 1e-4;
const PIVOT = new THREE.Vector3(0, 0.27, 0.50);
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

const restoredMarkedTriangles = [
  {
    id: 'surface-2',
    points: [[-0.422, 0.260, 1.558], [-0.422, 0.260, 1.607], [0.422, 0.260, 1.558]],
  },
  {
    id: 'surface-3',
    points: [[-0.44, -0.10, 1.655], [-0.06, -0.10, 1.655], [-0.06, 0.26, 1.625]],
  },
  {
    id: 'surface-4',
    points: [[0.06, -0.10, 1.655], [0.44, -0.10, 1.655], [0.44, 0.26, 1.625]],
  },
  {
    id: 'surface-5',
    points: [[-0.44, 0.26, 1.54], [-0.06, 0.26, 1.54], [-0.06, 0.378, 0.88]],
  },
  {
    id: 'surface-6',
    points: [[0.06, 0.26, 1.54], [0.44, 0.378, 0.88], [0.06, 0.378, 0.88]],
  },
  {
    id: 'surface-8',
    points: [[-0.436, 0.38, 0.951], [0.436, 0.38, 0.951], [0.436, 0.38, 0.149]],
  },
  {
    id: 'surface-9',
    points: [[-0.46, -0.216, 0.149], [-0.46, -0.216, 0.951], [-0.46, 0.356, 0.951]],
  },
  {
    id: 'surface-15',
    points: [[0.5, -0.32, 1.675], [0.5, -0.10, -0.3], [0.5, -0.10, 1.66]],
  },
  {
    id: 'surface-19',
    points: [[-0.43, -0.076, 0.884], [-0.43, -0.076, 1.516], [-0.43, 0.234, 1.516]],
  },
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
      movingBrowBridgeBounds: { x: [-0.43, 0.43], y: [-0.10, 0.258], z: [0.86, 1.54] },
      movingSealingBackplateCenter: [0, 0.07, 0.55],
      movingHousingBucket: 'gunMount',
      movingDarkBucket: 'gunMountDark',
      restoredMarkedSurfacePatches: ['surface-2', 'surface-3', 'surface-4',
        'surface-5', 'surface-6', 'surface-8', 'surface-9', 'surface-15', 'surface-19'],
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
    const housingMesh = gun.getObjectByName('gunMount');
    assert.ok(housingMesh?.isMesh, `${id}: complete housing uses the gun-owned armor bucket`);
    for (const { id: surfaceId, points } of restoredMarkedTriangles) {
      const expected = points.map((point) => new THREE.Vector3(...point));
      const centroid = findTriangle(housingMesh, expected);
      assert.ok(centroid, `${id}: ${surfaceId} is restored intact below rig_gun`);
      const oldTurretLocal = expected.map((point) => point.clone().add(PIVOT));
      assert.equal(findTriangle(turretMesh, oldTurretLocal), null,
        `${id}: ${surfaceId} is no longer stranded in turret-fixed armor`);
      moving.push({ label: surfaceId, node: housingMesh, centroid });
    }

    const sample = (pitchDeg) => {
      gun.rotation.x = -THREE.MathUtils.degToRad(pitchDeg);
      root.updateMatrixWorld(true);
      return {
        moving: moving.map(({ node, centroid }) => node.localToWorld(centroid.clone())),
        bore: tank.gunDirWorld(new THREE.Vector3()),
      };
    };
    const neutral = sample(0);
    const elevated = sample(getSpec(id).gunElevationDeg);
    const depressed = sample(-getSpec(id).gunDepressionDeg);

    for (let index = 0; index < moving.length; index++) {
      assert.ok(elevated.moving[index].y > neutral.moving[index].y + 0.10,
        `${id}: ${moving[index].label} elevates with the gun`);
      assert.ok(depressed.moving[index].y < neutral.moving[index].y - 0.04,
        `${id}: ${moving[index].label} declines with the gun`);
    }
    assert.ok(elevated.bore.y > neutral.bore.y + 0.20
      && depressed.bore.y < neutral.bore.y - 0.10,
    `${id}: barrel follows the same legal elevation/depression sweep`);
  } finally {
    tank.dispose();
  }
}

console.log('leclercGunHousingRig.selftest: complete marked housing assemblies restore and pitch with all three gun rigs');
