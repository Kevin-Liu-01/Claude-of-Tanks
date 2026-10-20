// Seated fittings (fittingSnap.ts, owner 2026-10-19 floating-parts sweep): a fitting floating within reach of its
// stock moves along the shortest gap until it sits 2 mm into the surface; one touching, embedded, beyond reach or
// headed into the running gear stays as authored; one beyond reach of the stock but beside a seated fitting seats on it
// in the second pass (snapFittingsSeated).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { snapFittings, snapFittingsSeated } from './fittingSnap.ts';

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
{ // a second case 30 mm beside a case that seats on the deck, itself 0.30 m up the first case's side: it seats on it
  const first = new THREE.BoxGeometry(0.2, 0.4, 0.2).translate(0, 1.27, 0);       // 20 mm over the deck
  const second = new THREE.BoxGeometry(0.1, 0.1, 0.2).translate(0.18, 1.40, 0);   // x 0.13..0.23: 30 mm beside it
  const [a, b] = snapFittingsSeated([{ label: 'case', parts: [first], reachM: 0.04 },
    { label: 'pack', parts: [second], reachM: 0.04 }], [deck()]);
  assert.equal(a.moved, true);
  assert.equal(b.moved, true, 'the pack seats on the seated case in the second pass');
  second.computeBoundingBox();
  assert.ok(Math.abs(second.boundingBox.min.x - 0.098) < 1e-6, 'the pack sits 2 mm into the case side');
  assert.equal(snapFittings([{ label: 'pack', parts: [new THREE.BoxGeometry(0.1, 0.1, 0.2).translate(0.18, 1.40, 0)],
    reachM: 0.04 }], [deck()])[0].reason, 'beyond-reach', 'one pass alone leaves it');
}
console.log('fittingSnap.selftest: seated, directed, touching, embedded, beyond-reach, running-gear and second-pass fittings pass');
