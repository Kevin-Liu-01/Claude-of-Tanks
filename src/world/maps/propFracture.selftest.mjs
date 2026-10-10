// A destructible prop's broken state made from its own intact build (propFracture.ts; the owner, 2026-10-09:
// "destructible objects/props: not looking good"). Held to: the intact build's attributes and paint, deterministic,
// every part present (snapped, never lost), nothing above the debris height but a post's low stub (the broken state has
// no collider), the pieces round where it stood, unit normals; and the pool spends the legacy builder's draws first.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { DESTRUCTIBLE_TYPES } from './inhabitKit.ts';
import { PROP_FRACTURE, fractureProp, fractureSeed } from './propFracture.ts';

const rng = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const report = [];
for (const [kind, plan] of Object.entries(PROP_FRACTURE)) {
  const meta = DESTRUCTIBLE_TYPES[kind];
  assert.ok(meta?.build && meta.broken, `${kind}: a destructible with a broken state`);
  const intact = meta.build(rng(7));
  const seed = fractureSeed(4242, kind);
  const broken = fractureProp(intact, plan, seed);
  const again = fractureProp(intact, plan, seed);
  assert.deepEqual(Object.keys(broken.attributes).sort(), Object.keys(intact.attributes).sort(), `${kind}: the intact build's attributes`);
  assert.deepEqual(Array.from(broken.attributes.position.array), Array.from(again.attributes.position.array), `${kind}: deterministic`);
  if (intact.attributes.color) {
    // its own paint: every colour it shows is one the intact build carries
    const palette = new Set();
    const ic = intact.attributes.color;
    for (let i = 0; i < ic.count; i++) palette.add(`${ic.getX(i).toFixed(5)},${ic.getY(i).toFixed(5)},${ic.getZ(i).toFixed(5)}`);
    const bc = broken.attributes.color;
    for (let i = 0; i < bc.count; i++) assert.ok(palette.has(`${bc.getX(i).toFixed(5)},${bc.getY(i).toFixed(5)},${bc.getZ(i).toFixed(5)}`), `${kind}: its own paint`);
  }
  const { parts, pieces } = broken.userData.fractured;
  assert.ok(pieces >= parts && parts >= 2, `${kind}: its parts (${parts}) broken into pieces (${pieces})`);
  broken.computeBoundingBox();
  intact.computeBoundingBox();
  const b = broken.boundingBox, i0 = intact.boundingBox;
  // (a post the build sinks into the ground keeps its foot there)
  assert.ok(b.min.y > Math.min(0, i0.min.y) - 0.04, `${kind}: nothing pushed under the ground (${b.min.y.toFixed(3)})`);
  assert.ok(b.max.y <= Math.max(plan.debrisMax, plan.stubMax) + 0.25, `${kind}: low debris, no standing cover (${b.max.y.toFixed(2)} m)`);
  const reach = Math.max(-i0.min.x, i0.max.x, -i0.min.z, i0.max.z) + plan.scatter * 2.6 + 0.8;
  assert.ok(Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z) <= reach, `${kind}: round where it stood`);
  const n = broken.attributes.normal;
  for (let k = 0; k < n.count; k++) {
    const l = Math.hypot(n.getX(k), n.getY(k), n.getZ(k));
    assert.ok(l > 0.99 && l < 1.01, `${kind}: unit normals`);
  }
  report.push(`${kind} ${parts}->${pieces} ${b.max.y.toFixed(2)}m`);
}
// the pool: the legacy builder spends its draws first, then the intact build is broken
const props = readFileSync(new URL('../props.ts', import.meta.url), 'utf8');
assert.match(props, /const legacyB = meta\.broken\(drng\);\s*const fracture = PROP_FRACTURE\[kind\];\s*const geoB = fracture \? fractureProp\(geoI, fracture, fractureSeed\(seed, kind\)\) : legacyB;/,
  'the legacy builder runs first (the destructible stream unchanged), the intact build breaks');
console.log(`propFracture selftest: ok — ${report.join(', ')}`);
