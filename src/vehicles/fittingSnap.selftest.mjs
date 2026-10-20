// Seated fittings (fittingSnap.ts, owner 2026-10-19 floating-parts sweep): a fitting floating within reach of its
// stock moves along the shortest gap until it sits 2 mm into the surface; one touching, embedded, beyond reach or
// headed into the running gear stays as authored.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { snapFittings } from './fittingSnap.ts';

const deck = () => new THREE.BoxGeometry(2, 0.1, 2).translate(0, 1.0, 0); // top face at y 1.05
const snap = (parts, stock = [deck()], gear) => snapFittings([{ label: 'fitting', parts, reachM: 0.04 }], stock, gear)[0];

{ // a periscope block and its glass, 20 mm over the deck: both drop 22 mm together
  const block = new THREE.BoxGeometry(0.14, 0.07, 0.10).translate(0.3, 1.105, 0.2);
  const glass = new THREE.BoxGeometry(0.11, 0.028, 0.102).translate(0.3, 1.117, 0.2);
  const receipt = snap([block, glass]);
  assert.equal(receipt.moved, true);
  assert.ok(Math.abs(receipt.gapM - 0.02) < 1e-6, 'the clearance was 20 mm');
  block.computeBoundingBox(); glass.computeBoundingBox();
  assert.ok(Math.abs(block.boundingBox.min.y - 1.048) < 1e-6, 'the block sits 2 mm into the deck');
  assert.ok(Math.abs(glass.boundingBox.min.y - (1.103 - 0.022)) < 1e-6, 'the glass rides the block');
}
{ // touching and embedded fittings stay
  assert.equal(snap([new THREE.BoxGeometry(0.1, 0.1, 0.1).translate(0, 1.10, 0)]).reason, 'touching');
  assert.equal(snap([new THREE.BoxGeometry(0.1, 0.1, 0.1).translate(0, 1.0, 0)]).reason, 'touching', 'inside the deck');
}
{ // beyond reach: 60 mm over the deck
  const far = new THREE.BoxGeometry(0.1, 0.1, 0.1).translate(0, 1.16, 0);
  assert.equal(snap([far]).reason, 'beyond-reach');
  far.computeBoundingBox();
  assert.ok(Math.abs(far.boundingBox.min.y - 1.11) < 1e-6, 'left as authored');
}
{ // along a direction: a door plate 0.12 m behind its recessed face moves forward onto it
  const wall = new THREE.BoxGeometry(1, 1, 0.1).translate(0, 1, -3.0);          // rear face at z -3.05
  const door = new THREE.BoxGeometry(0.5, 0.3, 0.04).translate(0, 1, -3.19);      // front face at z -3.17
  const receipt = snapFittings([{ label: 'door', parts: [door], reachM: 0.2, direction: [0, 0, 1] }], [wall])[0];
  assert.equal(receipt.moved, true);
  door.computeBoundingBox();
  assert.ok(Math.abs(door.boundingBox.max.z - (-3.048)) < 1e-6, 'the door sits 2 mm into the face');
}
{ // a move into the running gear is refused
  const plate = new THREE.BoxGeometry(0.1, 0.02, 0.1).translate(0, 1.08, 0);
  assert.equal(snap([plate], [deck()], () => true).reason, 'running-gear');
}
console.log('fittingSnap.selftest: seated, directed, touching, embedded, beyond-reach and running-gear fittings pass');
