import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createHearthSmoke, HEARTH_SMOKE_LIMITS, makeHearthSmokeTexture } from './hearthSmoke.ts';
import { addConnectedExterior, exteriorChimneyTops, carryExteriorChimneyTops } from './maps/exteriorDetailKit.ts';
import { makeFarmhouse, makeLogCabin } from './maps/villageKit.ts';

// settlement pass 2 (2026-09-12): authored chimneys are detected by the shared
// exterior pass and a seeded share of them smokes; one instanced draw.

// Detection on real builders: the farmhouse stack (0.6 m square, top above the
// wall) and the log cabin's ground-to-ridge stack both report one top; the cap
// slab collapses into it.
const buckets = () => Object.fromEntries(['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'].map((n) => [n, []]));
const seeded = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
for (const [name, build] of [['farmhouse', makeFarmhouse], ['logcabin', makeLogCabin]]) {
  const parts = buckets();
  const info = build(seeded(17), parts);
  const receipt = addConnectedExterior(parts, { id: name, w: info.w - 0.3, d: info.d - 0.3, wallH: 3.2, profile: name === 'farmhouse' ? 'rural' : 'timber', variant: 0 });
  assert.equal(receipt.chimneys.length, 1, `${name}: one chimney top (${JSON.stringify(receipt.chimneys)})`);
  const [x, y, z] = receipt.chimneys[0];
  assert.ok(y > 3.8, `${name}: the stack top clears the wall (${y.toFixed(2)})`);
  assert.ok(Math.abs(x) < info.w && Math.abs(z) < info.d, `${name}: the stack sits on the building`);
  assert.deepEqual(exteriorChimneyTops(parts), receipt.chimneys);
}
// A blank box has no chimney; a porch post or a cap slab never qualifies.
{
  const parts = buckets();
  parts.plaster.push(new THREE.BoxGeometry(8, 3.4, 10).translate(0, 1.7, 0));
  parts.wood.push(new THREE.BoxGeometry(0.16, 2.4, 0.16).translate(3, 1.2, 5.4));
  parts.stone.push(new THREE.BoxGeometry(0.8, 0.12, 0.8).translate(1, 5.2, 1));
  const receipt = addConnectedExterior(parts, { id: 'blank', w: 8, d: 10, wallH: 3.4, profile: 'rural', variant: 0 });
  assert.deepEqual(receipt.chimneys, [], 'posts and cap slabs are not chimneys');
}
// Carrying tops across a merge applies the sub-assembly matrix once.
{
  const inner = buckets(), outer = buckets();
  inner.stone.push(new THREE.BoxGeometry(0.6, 1.7, 0.6).translate(-1.2, 5.3, -2.4));
  inner.plaster.push(new THREE.BoxGeometry(6, 3.3, 8).translate(0, 1.65, 0));
  addConnectedExterior(inner, { id: 'wing', w: 6, d: 8, wallH: 3.3, profile: 'rural', variant: 1 });
  const matrix = new THREE.Matrix4().makeTranslation(100, 2, -50);
  carryExteriorChimneyTops(outer, inner, matrix);
  const carried = exteriorChimneyTops(outer);
  assert.equal(carried.length, 1);
  assert.deepEqual(carried[0].map((v) => Math.round(v * 100) / 100), [98.8, 8.15, -52.4]);
}

// The smoke system: seeded share, cap, instance layout, time uniform, disposal.
const anchors = Array.from({ length: 40 }, (_, i) => [i * 10, 6 + (i % 3), -i * 4]);
const smokeA = createHearthSmoke(anchors, { seed: 7, share: 0.55 });
const smokeB = createHearthSmoke(anchors, { seed: 7, share: 0.55 });
assert.equal(smokeA.count, smokeB.count, 'the seeded share is deterministic');
assert.ok(smokeA.count >= 12 && smokeA.count <= 30, `about half of forty chimneys smoke (${smokeA.count})`);
assert.equal(smokeA.mesh.count, smokeA.count);
assert.equal(smokeA.mesh.name, 'hearth-smoke');
assert.equal(smokeA.mesh.frustumCulled, false);
const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
for (let i = 0; i < smokeA.count; i++) {
  smokeA.mesh.getMatrixAt(i, m); m.decompose(p, q, s);
  assert.ok(s.y >= HEARTH_SMOKE_LIMITS.heightM[0] && s.y <= HEARTH_SMOKE_LIMITS.heightM[1], 'plume height inside its band');
  assert.ok(anchors.some(([x, y, z]) => Math.abs(x - p.x) < 1e-6 && Math.abs(z - p.z) < 1e-6 && Math.abs(y - 0.15 - p.y) < 1e-6), 'each plume sits on a chimney top');
}
const all = createHearthSmoke(anchors, { seed: 1, share: 1 });
assert.equal(all.count, 40, 'share 1 smokes every chimney');
const capped = createHearthSmoke(Array.from({ length: 300 }, (_, i) => [i, 5, i]), { seed: 1, share: 1 });
assert.equal(capped.count, HEARTH_SMOKE_LIMITS.cap, 'the instance cap holds');
const none = createHearthSmoke([], {});
assert.equal(none.count, 0); assert.equal(none.mesh.visible, false, 'no chimneys, nothing drawn');
smokeA.setTime(12.5);
assert.equal(smokeA.mesh.material.uniforms.uTime.value, 12.5, 'the world wind clock drives the scroll');
const tex = makeHearthSmokeTexture();
assert.equal(tex.image.width * tex.image.height * 4, tex.image.data.length);
const parent = new THREE.Group(); parent.add(smokeA.mesh);
smokeA.dispose();
assert.equal(parent.children.length, 0, 'dispose removes the mesh');
for (const sys of [smokeB, all, capped, none]) sys.dispose(); tex.dispose();

// Wiring: props carry chimney tops with each placed building, the world owns one smoke system.
const props = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
assert.match(props, /carryExteriorChimneyTops\(buckets, parts, transform\)/, 'bucket merges carry chimney tops through the placement matrix');
assert.match(props, /hearths: hearthAnchors/, 'the props runtime exposes world-space hearth anchors');
const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
assert.match(map, /createHearthSmoke\(props\.features\?\.hearths \?\? \[\]/, 'the world builds hearth smoke from the placed chimneys');
assert.match(map, /hearths\.setTime\(t\)/, 'hearth smoke scrolls on the world wind clock');
assert.match(map, /hearths\.advance\(dt\)/, 'live frames advance the hearth clock');
assert.match(map, /hearths\.dispose\(\)/, 'hearth smoke is released with the world');
console.log(`hearthSmoke.selftest: chimney detection on real builders, carry-through, seeded share (${smokeB.count}/40), cap, layout, clock, disposal and wiring PASS`);
