import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { ALL_TANK_IDS, SAVED_TANK_IDS, getSpec } from '../specs.ts';
import { LEO1_TURRET, LEO1_TURRET_FAMILY } from './leopard1Turret.ts';

// Release 275 (owner 2026-11-21: "make all leopard 1a... tanks' turrets be same height and properly shaped based on
// those turrets because all the other countries leopard 1a... variants have weirdly tall turrets"): every Leopard 1 in
// the fleet, whichever family turret it carries, seats it on the one ring and stands its roof at the published 2.39 m.
// The roof is the median of downward hits on the turret shell over a 0.6 x 0.6 m patch round the ring's rear, where no
// Leopard 1 carries a hatch, sight or bin.

const LEOPARD1_NAME = /^Leopard (1|AS1|C[12])(?![0-9])/;
const fleet = [...new Set([...ALL_TANK_IDS, ...SAVED_TANK_IDS])].filter((id) => LEOPARD1_NAME.test(getSpec(id)?.name ?? ''));
assert.deepEqual(fleet.sort(), Object.keys(LEO1_TURRET_FAMILY).sort(),
  'every Leopard 1 in the fleet takes its turret from the family (profiles/leopard1Turret.ts LEO1_TURRET_FAMILY)');

// The one exception, by name: the Leopard 1A2A1 keeps the pre-262 "old hull" the owner asked for on 2026-10-28, its deck
// 1.69 m at the ring, so its ring stands 0.11 m over the family's and its roof at 2.50 m; its turret still stands the
// family's 0.79 m over that ring (owner 2026-11-21, asked in leo1-turrets-275: "Keep the old hull").
const OLD_HULL_RING_Y = Object.freeze({ leo1a2a1: 1.71 });
const TOL = 0.012;
const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) <= TOL, `${label} (${actual.toFixed(3)} vs ${expected} ±${TOL})`);
const down = (object, x, z) => new THREE.Raycaster(new THREE.Vector3(x, 8, z), new THREE.Vector3(0, -1, 0), 0, 9)
  .intersectObject(object, false)[0]?.point.y;

for (const id of fleet) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  tank.root.updateMatrixWorld(true);
  const ring = new THREE.Vector3();
  tank.root.getObjectByName('rig_turret').getWorldPosition(ring);
  const shell = tank.root.getObjectByName('turret');
  assert.ok(shell?.isMesh, `${id}: a merged turret shell`);
  const hits = [];
  for (let dx = -0.3; dx <= 0.301; dx += 0.15) {
    for (let dz = -0.6; dz <= 0.001; dz += 0.15) {
      const y = down(shell, ring.x + dx, ring.z + dz);
      if (y != null) hits.push(y);
    }
  }
  assert.ok(hits.length >= 20, `${id}: the roof patch lies on the turret shell`);
  hits.sort((a, b) => a - b);
  const roof = hits[Math.floor(hits.length / 2)];
  near(ring.z, LEO1_TURRET.ringZ, `${id} (${LEO1_TURRET_FAMILY[id]}): the ring station`);
  near(roof - ring.y, LEO1_TURRET.roofOverRingM, `${id} (${LEO1_TURRET_FAMILY[id]}): the roof over the ring`);
  const hullRing = OLD_HULL_RING_Y[id] ?? LEO1_TURRET.ringY;
  near(ring.y, hullRing, `${id} (${LEO1_TURRET_FAMILY[id]}): the ring height`);
  near(roof, hullRing + LEO1_TURRET.roofOverRingM, `${id} (${LEO1_TURRET_FAMILY[id]}): the turret roof`);
}

console.log(`leopard1Turret.selftest: ${fleet.length} Leopard 1s, each roof ${LEO1_TURRET.roofOverRingM} m over its ring, `
  + `${fleet.length - Object.keys(OLD_HULL_RING_Y).length} at the published ${LEO1_TURRET.roofY} m, pass`);
