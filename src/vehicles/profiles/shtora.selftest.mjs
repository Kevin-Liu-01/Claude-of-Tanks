import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ruShtora } from './russia.ts';
import { vehicleNightLightEmittersFor } from '../vehicleNightLighting.ts';

// Authenticated before extraction, in scale/round/kit order. Includes every
// primitive attribute/index, position, bucket and direct lens pigment.
const originalHashes = [
  'e64c27d5ae0caeb5279c4d88f04ff6776258ba08e924060881f2b6f08eafe3c1',
  'a1443a31f96c677db8c7195da05ab161b80feb49aacd7659e1267c11ebd1495f',
  'e777437e694d6a101161bc6323b576fe670c056f76c7892522af4ff42a96b620',
  'be601af2fbb43ae972ee6fdb4998c875e5393b07fba41c02cb61d398964a82ce',
  '3ae5079d8e816e64bad74a0d2ff8727e797e593da0dc487b7499a09f72e7ccdf',
  '2548793ed5a715a253425dddf9096ac501328a6c6da20bba41ba7bddc571fe48',
  'abfb005d7a53aa683d52b0a40d7c879d04048ccf64106863bd3ad4e32552bce9',
  '931b9da936269e929904767a87736461fbcbe9e436daaa1e287163237a135823',
  'ea14e3b2e2035b6f22d58ab07469f2f0fc460dede53f9b67a012467af62c0ee7',
  'cf8b4004be14aa4608c0c7a8469003ef432f2c75827c174470fb811d77fc25eb',
  'a82c6389b31c54719d73378bf2c42bd2b7474980f450080095c2ec098971d96d',
  '92b8c20dafe0a03925df28a906c697ba790e5d28728108aab5e3a71518dc4a70',
];
function geometryHash(hash, geometry) {
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    hash.update(name);
    hash.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
  }
  if (geometry.index) hash.update(Buffer.from(geometry.index.array.buffer, geometry.index.array.byteOffset, geometry.index.array.byteLength));
}
let fixtureIndex = 0;
for (const scale of [1, 1.32, 1.5]) for (const round of [false, true]) for (const kit of [false, true]) {
  const parts = [], port = { turretG: new THREE.Group(), mats: { dark: new THREE.MeshStandardMaterial() },
    add: (slot, geometry, ...pose) => parts.push([slot, geometry, pose]) };
  ruShtora(port, { rings: [[0, .9], [1, .7]], sz: 1, eyeX: .7, eyeZ: 1.8,
    eyeScale: scale, eyeRound: round, eyeKit: kit }, .4);
  const hash = createHash('sha256');
  for (const [slot, geometry, pose] of parts) {
    hash.update(JSON.stringify([slot, pose])); geometryHash(hash, geometry); geometry.dispose();
  }
  for (const lens of port.turretG.children) {
    hash.update(JSON.stringify([lens.position.toArray(), lens.material.color.getHex(), lens.material.emissive.getHex()]));
    geometryHash(hash, lens.geometry); lens.geometry.dispose();
    assert.equal(lens.material.customProgramCacheKey(), 'veh-ambient-floor-v2|night-emission-mask-v1:');
  }
  assert.equal(hash.digest('hex'), originalHashes[fixtureIndex++], `legacy geometry/material parity ${scale}/${round}/${kit}`);
  port._shtoraRed?.dispose(); port.mats.dark.dispose();
}

// T-90 X's canonical eyes/complete roof-weapon checkpoint is preserved but
// not in this publication: its strict turret-curve release gate failed.
for (const id of ['t90a_x', 't90a_vladimir_x', 't90a', 't90a_vladimir']) for (const quality of ['high', 'low']) {
  const tank = createTank(id, null, { proceduralOnly: true, quality, geometryReceipt: true, batchStatic: false });
  try {
    tank.root.updateMatrixWorld(true);
    const turret = tank.root.getObjectByName('rig_turret'), lenses = [];
    if (id === 't90a_x' || id === 't90a_vladimir_x') {
      const sight = tank.root.getObjectByName('turretGlass');
      assert.ok(sight?.geometry.getAttribute('position').count > 0,
        `${id}/${quality} retains a real viewing optic separate from red dazzlers`);
      assert.equal(vehicleNightLightEmittersFor(sight).filter(lamp => lamp.kind === 'shtora').length, 0,
        'viewing glass is not relabeled Shtora geometry');
      const station = id === 't90a_x' ? [-.01,.61,1.0149] : [0,.809,.784];
      const aperture = turret.localToWorld(new THREE.Vector3(...station));
      const forward = new THREE.Vector3(0,0,1).transformDirection(turret.matrixWorld);
      const ray = new THREE.Raycaster(aperture.clone().addScaledVector(forward,.1),forward.clone().negate(),0,.11);
      const hits = ray.intersectObject(sight,false);
      assert.ok(hits.length > 0, `${id}/${quality} actual forward glass occupies its retained bezel`);
      const bezelBack = new THREE.Raycaster(aperture.clone(),forward.clone().negate(),0,.02);
      const bezel = tank.root.getObjectByName('turretDark');
      assert.ok(bezelBack.intersectObject(bezel,false).length > 0,
        `${id}/${quality} glass is seated against the actual existing sight backing`);
    }
    turret.traverse(mesh => {
      if (mesh.isMesh) for (const lamp of vehicleNightLightEmittersFor(mesh)) {
        if (lamp.kind === 'shtora') lenses.push({ mesh, lamp });
      }
    });
    assert.equal(lenses.length, 2, `${id}/${quality} has two real emitters`);
    for (const { mesh: lens, lamp } of lenses) {
      assert.equal(lens.parent, turret, 'eyes belong to the moving turret, not the gun or hull');
      assert.equal(lens.material.color.getHex(), 0x54180e, 'round emitter uses canonical deep red, not blue glass or camouflage');
      assert.equal(lens.material.emissive.getHex(), 0x7c2410);
      // Low detail legitimately batches the pair into one mesh. Inspect each
      // actual aperture's vertices, not the pair's combined bounding box.
      const bounds = new THREE.Box3(), vertex = new THREE.Vector3();
      const positions = lens.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);
        if (Math.abs(vertex.x - lamp.position[0]) < .25) bounds.expandByPoint(vertex);
      }
      const size = bounds.getSize(new THREE.Vector3());
      assert.ok(size.x > .1, 'nonempty physical round emitter');
      assert.ok(Math.abs(size.x - size.y) < 1e-6 && size.z < size.x / 4, 'lens is a forward-facing round disc');
      const local = new THREE.Vector3().fromArray(lamp.position);
      const before = lens.localToWorld(local.clone());
      turret.rotation.y = .61; tank.root.updateMatrixWorld(true);
      const expected = turret.localToWorld(local.clone().applyMatrix4(lens.matrix));
      assert.ok(lens.localToWorld(local.clone()).distanceTo(expected) < 1e-8);
      assert.ok(lens.localToWorld(local.clone()).distanceTo(before) > .05, 'lens actually follows turret yaw');
      turret.rotation.y = 0; tank.root.updateMatrixWorld(true);
      const point = new THREE.Vector3().fromArray(lamp.position).applyMatrix4(lens.matrixWorld);
      const direction = new THREE.Vector3().fromArray(lamp.direction).transformDirection(lens.matrixWorld);
      const stock = ['turret', 'turretExternalArmor', 'turretDetail', 'turretDark'].map(name => tank.root.getObjectByName(name)).filter(Boolean);
      const ray = new THREE.Raycaster(point.clone().addScaledVector(direction, .30), direction.clone().negate(), .001, .295);
      assert.equal(ray.intersectObjects(stock, false).length, 0, `${id}/${quality} red aperture is not buried in casting/ERA`);
    }
  } finally { tank.dispose(); }
}
console.log('shtora: 12 frozen legacy primitive recipes and high/low canonical red round eyes, turret ownership/yaw and exposed apertures pass');
