// Hull contact census (tools/hull-contact-census-lib.mjs): real contact, not bounding boxes, and the owner's
// 2026-10-19 Gallery markups stay fixed: the KF51-U belly closed between its tub and nose fill, the Leopard 2A5M
// rear flaps hung from the hull overhang, the KF51 EVO rear flaps hung from the fender plank.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bodyIslands, collectHullStock, hullBellyPits, partsTouch, stockPart } from './hull-contact-census-lib.mjs';

const at = (g, x, y, z, rx = 0) => g.rotateX(rx).translate(x, y, z);
const box = (w, h, d, x, y, z, rx = 0) => stockPart('hull', at(new THREE.BoxGeometry(w, h, d), x, y, z, rx));
// Contact law on closed boxes: resting, embedded and crossing touch; 5 mm of air does not; a large box's bounds
// swallowing a small one is not contact.
assert.ok(partsTouch(box(1, 1, 1, 0, 0, 0), box(.2, .2, .2, 0, .6, 0)), 'a block resting on a block touches');
assert.ok(partsTouch(box(1, 1, 1, 0, 0, 0), box(.2, .2, .2, 0, .55, 0)), 'an embedded block touches');
assert.ok(!partsTouch(box(1, 1, 1, 0, 0, 0), box(.2, .2, .2, 0, .605, 0)), '5 mm of air is not contact');
assert.ok(partsTouch(box(1, .02, .02, 0, 0, 0), box(.02, 1, .02, 0, 0, 0)), 'two bars crossing through each other touch');
const shell = stockPart('hull', at(new THREE.TorusGeometry(1, .05, 8, 24), 0, 0, 0, Math.PI / 2));
assert.ok(!partsTouch(shell, box(.1, .1, .1, 0, 0, 0)), 'a part inside another\'s bounds but clear of it does not touch');

// the rear flap and hanger envelope, both sides: |x| 1.0..1.75, y 0.35..1.62, z -3.76..-3.55
const inFlapEnvelope = (island) => Math.min(Math.abs(island.min[0]), Math.abs(island.max[0])) > 1.0
  && Math.max(Math.abs(island.min[0]), Math.abs(island.max[0])) < 1.75
  && island.min[1] > .35 && island.max[1] < 1.62 && island.min[2] > -3.76 && island.max[2] < -3.55;

// KF51-U: the belly between the tub (ends z 1.50) and the nose fill (starts z 2.34) is closed.
{
  const { parts, trackInnerX } = collectHullStock('kf51_u');
  const pits = hullBellyPits(parts, trackInnerX).filter((pit) => pit.z[1] > 1.5 && pit.z[0] < 2.34);
  assert.deepEqual(pits, [], 'kf51_u: no opening into the hull from below between the tub and the nose fill');
}
// Leopard 2A5M and KF51 EVO: no rear flap, hanger or mudguard plate floats.
for (const id of ['leo2a5m', 'kf51_evo']) {
  const { parts } = collectHullStock(id);
  const islands = bodyIslands(parts, 'hull');
  assert.deepEqual(islands.filter((island) => island.flap || inFlapEnvelope(island))
    .map((island) => island.parts.map((part) => part.bucket)), [],
    `${id}: every flap, hanger and mudguard plate reaches the hull`);
}
console.log('hull-contact-census.selftest: contact law, the kf51_u belly and the leo2a5m/kf51_evo rear flaps pass');
