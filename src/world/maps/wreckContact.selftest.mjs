// wreckContact.selftest.mjs — (the destructible-kits lane, 2026-10-11) a wreck's members resting on something
// (wreckContact.ts against partContact.ts's rule, the kit-connectivity receipt's): an island of members resting on
// nothing comes straight down onto the first face under it, an island over another lands on it once that one has
// landed, a member already touching keeps its place, a sloped face and a raised ground are met where they are, and the
// result is grounded by partContact's own audit.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { seatFloatingParts } from './wreckContact.ts';
import { auditPartContact, weldedComponents } from '../partContact.ts';

const box = (w, h, d, x, y, z, rot = 0) => {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  if (rot) g.rotateZ(rot);
  g.translate(x, y, z);
  return g;
};
const merged = (...parts) => {
  const p = [];
  for (const g of parts) p.push(...g.getAttribute('position').array);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return g;
};
const lowest = (g, x0, x1) => {
  const p = g.getAttribute('position');
  let y = Infinity;
  for (let i = 0; i < p.count; i++) if (p.getX(i) >= x0 - 1e-4 && p.getX(i) <= x1 + 1e-4) y = Math.min(y, p.getY(i));
  return y;
};
const grounded = (g, groundY = 0.05) => auditPartContact(weldedComponents([g]), { tolerance: 0.02, groundY }).floating.length === 0;

{
  // a slab on the ground; a plank 6 cm over it (floating); a block 1 cm over the plank (touching it: one island); a
  // post on the ground the plank does not reach; a crate already on the slab
  const g = merged(
    box(4, 0.2, 2, 0, 0.1, 0),          // slab: top 0.2
    box(1.2, 0.05, 0.3, -1, 0.285, 0),  // plank: bottom 0.26, 6 cm over the slab
    box(0.3, 0.3, 0.3, -1, 0.47, 0),    // block: bottom 0.32, 1 cm over the plank's top 0.31
    box(0.2, 1, 0.2, 3, 0.5, 0),        // post on the ground, clear of the slab
    box(0.4, 0.4, 0.4, 1, 0.4, 0),      // crate on the slab's top
  );
  assert.ok(!grounded(g), 'the plank and its block rest on nothing');
  const moved = seatFloatingParts(g);
  assert.equal(moved, 1, 'one island moved (the plank and the block on it together)');
  assert.ok(Math.abs(lowest(g, -1.6, -0.4) - (0.2 - 0.004)) < 1e-4, 'the plank comes down onto the slab, a few millimetres into it');
  assert.ok(Math.abs(lowest(g, 0.8, 1.2) - 0.2) < 1e-5, 'the crate already touching keeps its place');
  assert.ok(grounded(g), 'every member reaches the ground (partContact)');
}
{
  // two floating islands stacked over a gap: the lower lands on the ground, the upper on it
  const g = merged(
    box(0.5, 0.1, 0.5, 0, 0.6, 0),      // low plate, bottom 0.55
    box(0.3, 0.1, 0.3, 0, 1.2, 0),      // high plate, bottom 1.15 (far over the low one)
  );
  assert.equal(seatFloatingParts(g), 2, 'two islands moved');
  assert.ok(Math.abs(lowest(g, -0.3, 0.3) + 0.004) < 1e-4, 'the low plate on the ground');
  assert.ok(grounded(g), 'the high plate lands on the low one');
}
{
  // a cube over a sloped board: it comes down to the slope's height under its lowest corner
  const g = merged(box(3, 0.05, 1, 0, 0.75, 0, 0.3), box(0.2, 0.2, 0.2, 0.4, 2, 0));
  seatFloatingParts(g);
  assert.ok(grounded(g), 'met on the slope');
}
{
  // a raised ground (a bank at 1 m): a member over it lands on it, and one already on it stays
  const g = merged(box(0.4, 0.2, 0.4, 0, 1.5, 0), box(0.4, 0.2, 0.4, 2, 1.1, 0));
  const ground = () => 1;
  assert.equal(seatFloatingParts(g, { ground }), 1, 'only the member over the bank moves');
  assert.ok(Math.abs(lowest(g, -0.3, 0.3) - (1 - 0.004)) < 1e-4, 'down onto the bank');
  assert.ok(Math.abs(lowest(g, 1.7, 2.3) - 1.0) < 1e-5, 'the one on the bank stays');
}
{
  // an indexed geometry is refused (a wreck is non-indexed)
  assert.throws(() => seatFloatingParts(new THREE.BoxGeometry(1, 1, 1)), /non-indexed/);
}
console.log('wreckContact.selftest: floating islands land on the first face under them (stacked islands in turn, slopes and a raised ground met), touching members stay, partContact grounds them all');
