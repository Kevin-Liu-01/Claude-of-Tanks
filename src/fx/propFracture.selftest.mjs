// A fracture-ready destructible kind comes apart physically (fx/propFracture.ts; the owner, 2026-10-10: "the
// destruction of buildings needs to be a lot better too, rn its way to sporadic and ugly instead of behaving like it
// would with physics"), with the redesign lane's lean-to (world/maps/shedKit.ts, its fracture anatomy):
//   - every piece of the kind is drawn and bodied at once, in its own place (nothing swapped, nothing missing);
//   - a burst at one end breaks what it reaches and throws it off its point; the anchors and what they still hold
//     stand asleep; what lost every path to an anchor falls;
//   - the fallen come to rest and are baked where they lie (never faded), above the ground; the reset clears it all;
//   - a kind without an anatomy is left to its broken pool slot; the same break twice lays the same pieces.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildShedLeanTo, shedStyleFor } from '../world/maps/shedKit.ts';
import { createDebrisPhysics } from './debrisPhysics.ts';
import { createPropFracture } from './propFracture.ts';

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const build = buildShedLeanTo(shedStyleFor('verdant'), rng(7));
const geometry = build.geometry;
geometry.userData.fracture = build.anatomy;
const material = new THREE.MeshStandardMaterial({ vertexColors: true });
const pieces = build.anatomy.pieces;
geometry.computeBoundingBox();
const box = geometry.boundingBox;

function rig() {
  const group = new THREE.Group();
  const pool = createDebrisPhysics({ capacity: 96 });
  pool.bind({ groundAt: () => 0 });
  let clock = 0;
  const landings = [];
  const fracture = createPropFracture({ pool, group, now: () => clock, onLanding: (x, y, z, speed, mass) => landings.push([speed, mass]) });
  const step = (seconds) => { for (let t = 0; t < seconds; t += 1 / 30) { clock += 1 / 30; pool.advance(1 / 30); fracture.update(); } };
  return { group, pool, fracture, step, landings };
}
// the record stands at (20, 0, -8), turned a quarter; a burst at its +x end, half way up
const matrix = new THREE.Matrix4().compose(new THREE.Vector3(20, 0, -8), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), new THREE.Vector3(1, 1, 1));
const endLocal = new THREE.Vector3(box.max.x + 0.3, (box.max.y + box.min.y) * 0.45, 0);
const point = endLocal.clone().applyMatrix4(matrix);
const dir = new THREE.Vector3(-1, 0, 0).transformDirection(matrix);
const request = { index: 3, kind: 'leanto', geometry, material, matrix, color: new THREE.Color(0.9, 0.85, 0.8), point, dirX: dir.x, dirZ: dir.z,
  cause: 'blast', speedMps: 0, seed: 77 };

const r = rig();
assert.equal(r.fracture.take(request), true, 'a fracture-ready kind is taken');
const s0 = r.fracture.stats();
assert.equal(s0.bodies, pieces.length, `every piece is a body at once (${s0.bodies} of ${pieces.length})`);
assert.ok(s0.standing >= pieces.filter((p) => p.anchor).length, `the anchors and what they hold stand (${s0.standing})`);
assert.ok(s0.standing < pieces.length, 'the burst takes something down');
// drawn exactly where it stood: every piece's mesh through its pose carries the record's own triangles
const drawnTris = r.group.children.reduce((n, m) => n + m.geometry.getAttribute('position').count / 3, 0);
assert.equal(drawnTris, geometry.getAttribute('position').count / 3, 'the pieces draw every triangle of the kind');
const centroid = (group) => {
  const v = new THREE.Vector3(), sum = new THREE.Vector3(), m = new THREE.Matrix4();
  let n = 0;
  for (const mesh of group.children) { mesh.getMatrixAt(0, m); const p = mesh.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i += 7) { sum.add(v.fromBufferAttribute(p, i).applyMatrix4(m)); n++; } }
  return sum.divideScalar(n);
};
const before = centroid(r.group);
// at the break every piece's corners are the kind's own, where the record stood (to float precision)
{
  const src = geometry.getAttribute('position'), mi = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3();
  let worst = 0;
  r.group.children.forEach((mesh, k) => {
    mesh.getMatrixAt(0, mi);
    const p = mesh.geometry.getAttribute('position'), first = pieces[k].tri0 * 3;
    for (let i = 0; i < p.count; i++) worst = Math.max(worst, a.fromBufferAttribute(p, i).applyMatrix4(mi).distanceTo(b.fromBufferAttribute(src, first + i).applyMatrix4(matrix)));
  });
  assert.ok(worst < 2e-3, `at the break the pieces stand exactly where the kind stood (${worst.toFixed(4)} m)`);
}
r.step(8);
const s1 = r.fracture.stats();
assert.ok(s1.baked >= 3, `the fallen come to rest and are baked where they lie (${JSON.stringify(s1)})`);
assert.ok(r.landings.length >= 3, 'their landings are dusted and heard');
const m = new THREE.Matrix4(), v = new THREE.Vector3();
let low = Infinity;
for (const mesh of r.group.children) { mesh.getMatrixAt(0, m); const p = mesh.geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) low = Math.min(low, v.fromBufferAttribute(p, i).applyMatrix4(m).y); }
assert.ok(low > -0.15, `nothing ends under the ground (${low.toFixed(3)} m)`);
const after = centroid(r.group);
assert.ok(after.y < before.y - 0.1, `it came down (centre ${before.y.toFixed(2)} -> ${after.y.toFixed(2)} m)`);
assert.equal(r.group.children.length, pieces.length, 'nothing faded: every piece still drawn');
r.fracture.reset();
assert.equal(r.group.children.length, 0, 'the reset clears every piece');
assert.equal(r.pool.stats().bodies, 0, 'and its bodies');
// no anatomy: left to the broken pool slot
const plain = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
assert.equal(r.fracture.take({ ...request, geometry: plain }), false, 'a kind without an anatomy is declined');
// the same break twice, the same pieces
const lay = () => { const q = rig(); q.fracture.take(request); q.step(1); const c = centroid(q.group); q.fracture.reset(); return c.toArray().map((x) => x.toFixed(4)).join(','); };
assert.equal(lay(), lay(), 'deterministic');
console.log(`propFracture.selftest: the lean-to's ${pieces.length} pieces taken at once (${s0.standing} standing, ${pieces.length - s0.standing} thrown or falling), `
  + `${s1.baked} baked where they came to rest after 8 s, ${r.landings.length} landings, nothing under the ground, nothing faded, the same twice`);
