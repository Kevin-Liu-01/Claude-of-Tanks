import assert from 'node:assert/strict';
import * as THREE from 'three';
import '../../tools/tank-surface-collect.mjs';
import { createTank } from './tankFactory.ts';
import { ensureInteriorFills } from './interiorFills.ts';

// Owner Gallery selections, 2026-09-30. Positions are in each mesh's local
// authored frame, independent of presentation centering and random UUIDs.
const probes = {
  chieftain_mk10: [['hullShadow', .98, .3, 0], ['hullInteriorFill', .9555, .3, .5]],
  chieftain5: [['hullRunningGearDark', .89, .2, 1.68],
    ['hullRunningGearDark', .89, .2, -1.2], ['hullRunningGearDark', 1.095, .3, 0]],
  jpz_e100_x: [['hullShadow', .9768, .2, 0]],
  k2b: [['hullRunningGearDark', 1.09, .2, 0],
    ['hullRunningGearDark', .94, .3, 2.2], ['hullRunningGearDark', .94, .3, -1.6]],
  k2: [['hullRunningGearDark', 1.09, .2, 0],
    ['hullRunningGearDark', .94, .3, 2.2], ['hullRunningGearDark', .94, .3, -1.6]],
  strv103: [['hullRunningGearDark', 1.01, .3, 0]],
  strv103a: [['hullRunningGearDark', .99, .3, 0]],
  udes03: [['hullRunningGearDark', .7975, .4, 0]],
};
await ensureInteriorFills(Object.keys(probes));
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const point = new THREE.Vector3();
function blocksProbe(mesh, x, y, z) {
  const p = mesh.geometry.attributes.position, index = mesh.geometry.index;
  const count = index ? index.count : p.count;
  const ray = new THREE.Ray(new THREE.Vector3(0, y, z), new THREE.Vector3(Math.sign(x), 0, 0));
  for (let i = 0; i < count; i += 3) {
    a.fromBufferAttribute(p, index ? index.getX(i) : i);
    b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2);
    if (ray.intersectTriangle(a, b, c, false, point) && Math.abs(point.x - x) < .065) return true;
  }
  return false;
}

for (const [id, rows] of Object.entries(probes)) for (const quality of ['high', 'low']) {
  const tank = createTank(id, null, { quality, proceduralOnly: true, batchStatic: false });
  try {
    for (const [bucket, x, y, z] of rows) for (const side of [-1, 1]) {
      tank.root.traverse(mesh => {
        // Generated fill must not replace any of the removed running-gear walls.
        if (!mesh.isMesh || ![bucket, 'hullInteriorFill'].includes(mesh.name)) return;
        assert.ok(!blocksProbe(mesh, side * x, y, z),
          `${id}/${quality}: ${mesh.name} must leave the marked bay open at ${[side * x, y, z]}`);
      });
    }
    const bands = [];
    tank.root.traverse(mesh => { if (/^gearTrackBand[LR]$/.test(mesh.name)) bands.push(mesh); });
    assert.equal(bands.length, 2, `${id}/${quality}: both real track courses remain`);
    assert.ok(tank.root.getObjectByName('gearEndWheelBody'), `${id}: actual end wheels remain`);
    const hull = tank.root.getObjectByName('hull');
    assert.ok(hull?.geometry.attributes.position.count > 0, `${id}: authored hull remains`);
  } finally { tank.dispose(); }
}
console.log('underbodyBackdrops: eight actual IDs, HIGH/LOW, paired marked bays and generated fills clear; real hulls/tracks/wheels retained');
