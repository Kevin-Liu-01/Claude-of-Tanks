import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { registerProfiledBuilders } from './tankFactoryCore.ts';
import { buildAbramsX } from './profiles/abramsSourceX.ts';
import { KIT } from './profiles/kit.ts';

// Independent held-out intersections of source18, selected OBJ SHA256
// 85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29.
// The source's curved sheets and small chamfers are approximated from sparse
// scalar sections. These checks are local physical witnesses, not raw-view QA.
const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
function xRay(meshes, side, rawY, rawZ, far = 1.3) {
  return new THREE.Raycaster(new THREE.Vector3(side * 3, rawY + .203945, .357965 - rawZ),
    new THREE.Vector3(-side, 0, 0), 0, far).intersectObjects(meshes, false);
}
function physicalMeshes(tank) {
  const result = [];
  tank.root.traverse(mesh => {
    if (mesh.isMesh && !mesh.userData.shadowOnly && !/shadow|marking/i.test(mesh.name)) result.push(mesh);
  });
  return result;
}
function volume(geometry) {
  const p = geometry.attributes.position, a = new THREE.Vector3(), b = new THREE.Vector3();
  const c = new THREE.Vector3(), cross = new THREE.Vector3();
  let total = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    total += a.dot(cross.crossVectors(b, c)) / 6;
  }
  return total;
}
function returnWitnesses(meshes, label) {
  for (const side of [-1, 1]) {
    for (const [rawZ, outerX] of [[-2.87, 1.83685994], [-2.75, 2.00228853],
      [-2.713, 2.08535254], [2.797, 2.04826144], [2.831, 1.97177705], [2.92, 1.83691001]]) {
      const hits = xRay(meshes, side, .7, rawZ);
      assert.ok(hits.length, `${label}: source curved stock ${side}/${rawZ}`);
      assert.ok(Math.abs(Math.abs(hits[0].point.x) - outerX) < .002,
        `${label}: held-out source sheet face ${rawZ}: ${hits[0].point.x}`);
    }
    for (const [y, z] of [[.426, -2.74], [1.02, -2.74], [.505, 2.808], [1.098, 2.808]]) {
      assert.equal(xRay(meshes, side, y, z, 1.13).length, 0,
        `${label}: source-proven opening, not a dark filled end cap ${side}/${y}/${z}`);
    }
    for (const [y, z] of [[.355, -2.74], [.72, -2.74], [1.092, -2.74],
      [.435, 2.808], [.8, 2.808], [1.17, 2.808]]) {
      assert.ok(xRay(meshes, side, y, z, 1.13).length,
        `${label}: real stock between/around the two apertures`);
    }
  }
}

for (const quality of ['high', 'low']) {
  const captured = [], bindings = [];
  registerProfiledBuilders({ m1a2_sepv2_x: port => buildAbramsX(new Proxy(port, {
    get(target, key) {
      if (key === 'addEquipment') return (bucket, geometry, ...args) => {
        if (geometry.userData.abramsSourceReturn) {
          assert.ok(['hullTrackGuardL','hullTrackGuardR'].includes(bucket), 'permanent receiving sheet has camouflaged hull guard ownership');
          const copy = KIT.xform(geometry.clone(), ...args);
          const mesh = new THREE.Mesh(copy, material); mesh.updateMatrixWorld(true);
          captured.push(mesh);
        }
        return target.addEquipment(bucket, geometry, ...args);
      };
      if (key === 'destructibleCluster') return (name, fill) => {
        bindings.push(name); return target.destructibleCluster(name, fill);
      };
      return Reflect.get(target, key);
    },
  })) });
  let tank;
  try {
    tank = createTank('m1a2_sepv2_x', null,
      { proceduralOnly: true, geometryReceipt: true, quality, batchStatic: false });
    tank.root.updateMatrixWorld(true);
    assert.equal(captured.length, 4, 'exactly four source curved returns');
    for (const mesh of captured) assert.ok(volume(mesh.geometry) > .001, 'closed outward-facing thin stock');
    returnWitnesses(captured, `${quality}/actual emitted sheets`);
    returnWitnesses(physicalMeshes(tank), `${quality}/complete native scene`);
    for (const side of [-1, 1]) {
      for (const rawZ of [3.0, 3.5, 3.7]) {
        const blocked=xRay(physicalMeshes(tank),side,.7,rawZ,1.23);
        assert.equal(blocked.length,0,
          `source20 aft receiving-panel joint and raised lower-edge air remain open ${quality}/${side}/${rawZ}: `+
          JSON.stringify(blocked.map(h=>({mesh:h.object.name,point:h.point.toArray(),face:h.faceIndex}))));
      }
      assert.ok(xRay(physicalMeshes(tank), side, .7, 3.1, 1.23).length,
        'real aft receiving stock remains in front of its rising lower edge');
    }
    const plates = getSpec('m1a2_sepv2_x').armor.hullPlates;
    for (const suffix of ['_skirt_era_L', '_skirt_era_R']) {
      const plate = plates.find(p => p.kind === 'era' && p.name.endsWith(suffix));
      assert.ok(plate && bindings.includes(plate.name), 'actual gameplay ERA name binds source cassettes');
      assert.equal(tank.stripEra(plate.name), true, 'source cassette family is actually removable');
    }
    returnWitnesses(physicalMeshes(tank), `${quality}/permanent returns after ERA removal`);
    // Root overlaps are real: the return occupies X1.82855..1.83686 while
    // its measured receiving skin occupies1.81927..1.82896. The complete
    // native scene must therefore have no air between those two stocks.
    for (const side of [-1, 1]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(side * 1.830, .903945, 3.227965),
        new THREE.Vector3(-side, 0, 0), 0, .020);
      assert.ok(ray.intersectObjects(physicalMeshes(tank), false).length,
        'receiving skin remains behind the seated return root');
    }
  } finally {
    tank?.dispose();
    for (const mesh of captured) mesh.geometry.dispose();
    registerProfiledBuilders({ m1a2_sepv2_x: buildAbramsX });
  }
}
material.dispose();
console.log('Abrams source-X returns: high/low four closed sheets, held-out faces, eight true holes, seated roots and actual ERA bindings PASS');
