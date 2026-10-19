// Hung guards (mudguardHangers.ts, owner 2026-10-19 "the flaps often hang off many tanks"): a strap rises from inside a
// guard's top edge into the stock over it, an arm reaches the stock beside it when nothing is over it, a guard already
// touching gets nothing, and a strap that would cross the running gear is refused. Built tanks keep their flaps hung.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { hangAuthoredMudguards } from './mudguardHangers.ts';
import { bodyIslands, collectHullStock } from '../../tools/hull-contact-census-lib.mjs';

const hang = (guard, supports, gear = null) => {
  const hullG = new THREE.Group(), straps = [];
  if (gear) { const mesh = new THREE.Mesh(gear); mesh.userData.runningGear = true; hullG.add(mesh); }
  const receipts = hangAuthoredMudguards([{ label: 'flap', part: guard, strapBucket: 'hullDetail' }], supports, hullG,
    (_, strap) => straps.push(strap));
  return { stations: receipts[0].stations, straps };
};
const flap = () => new THREE.BoxGeometry(0.6, 0.4, 0.04).translate(1.4, 0.8, -3.6);

{ // an overhang 0.3 m over the flap: two straps, each from 30 mm inside the flap 20 mm into the overhang
  const { stations, straps } = hang(flap(), [new THREE.BoxGeometry(1, 0.2, 1).translate(1.4, 1.4, -3.4)]);
  assert.deepEqual(stations.map((s) => s.strap), [true, true], 'both stations strapped');
  for (const strap of straps) {
    strap.computeBoundingBox();
    assert.ok(Math.abs(strap.boundingBox.min.y - 0.97) < 1e-6, 'the strap starts 30 mm inside the flap top');
    assert.ok(Math.abs(strap.boundingBox.max.y - 1.32) < 1e-6, 'the strap ends 20 mm inside the overhang');
  }
}
{ // nothing over the flap, a wall 0.2 m ahead of it: horizontal arms into the wall
  const { stations, straps } = hang(flap(), [new THREE.BoxGeometry(1, 1, 0.1).translate(1.4, 0.9, -3.33)]);
  assert.deepEqual(stations.map((s) => s.arm === true), [true, true], 'both stations armed');
  straps[0].computeBoundingBox();
  assert.ok(straps[0].boundingBox.max.z > -3.38 && straps[0].boundingBox.min.z < -3.59, 'the arm spans flap to wall');
}
{ // a flap already standing in its fender: nothing added
  const { stations, straps } = hang(flap(), [new THREE.BoxGeometry(1, 0.2, 1).translate(1.4, 1.05, -3.6)]);
  assert.equal(straps.length, 0, 'a touching flap is left as authored');
  assert.deepEqual(stations.map((s) => s.reason), ['touching', 'touching']);
}
{ // a track run between the flap and the overhang: refused
  const { stations, straps } = hang(flap(), [new THREE.BoxGeometry(1, 0.2, 1).translate(1.4, 1.6, -3.4)],
    new THREE.BoxGeometry(1, 0.05, 1).translate(1.4, 1.2, -3.6));
  assert.equal(straps.length, 0, 'no strap crosses the running gear');
  assert.deepEqual(stations.map((s) => s.reason), ['running-gear', 'running-gear']);
}
// Built: the flaps the owner's sweep found floating are hung (the owner named the Merkavas; the KF51-U's are hand-hung
// on posts into its deck overhang).
for (const id of ['merkava4', 'merkava1b', 'merkava2b', 'merkava3c', 'merkava3_baz', 'merkava4b', 'amx10p', 'kf51_u']) {
  const { parts } = collectHullStock(id);
  assert.deepEqual(bodyIslands(parts, 'hull').filter((island) => island.flap).map((island) => island.parts.map((p) => p.bucket)), [],
    `${id}: every flap reaches the hull`);
}
console.log('mudguardHangers.selftest: straps, arms, touching guards, the running-gear refusal and the hung Merkava, AMX-10P and KF51-U flaps pass');
