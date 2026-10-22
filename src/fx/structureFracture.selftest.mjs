// A building's walls drawn as they break (fx/structureFracture.ts over fx/wallFracture.ts and the physics lane's debris
// pool; the owner, 2026-10-10: "the destruction of buildings needs to be a lot better too, rn its way to sporadic and
// ugly instead of behaving like it would with physics"), with a regional cottage's own triangles as the world's merged
// bucket holds them:
//   - the struck face leaves the bucket (its triangles flattened in place, the rest of the building untouched) and is
//     drawn again from its cells, with a hole where the round struck: less wall there, the reveal across the thickness;
//   - what the round knocks through flies as bodies along it, what loses its load path falls as bodies; they come to
//     rest on the ground and are baked where they lie (never faded); a dark room stands behind the holed storey;
//   - damage adds up across rounds; the reset stands the building up byte for byte; the same rounds break it the same;
//   - a front breached along its foot leans out off it: the storey over the breach leaves the wall's plane.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } from '../world/maps/regional/index.ts';
import { streamFrom } from '../world/maps/regional/geometry.ts';
import { structureDamageKitChain } from '../world/destructionKit.ts';
import { createDebrisPhysics } from './debrisPhysics.ts';
import { createStructureFracture } from './structureFracture.ts';
// every body's drawn corners inside its box parts (the fracture's own check, on here): a corner outside one would sink
// into the ground or float over it
globalThis.__fractureDebug = true;
const outside = [];
const log0 = console.log;
console.log = (...a) => { if (String(a[0]).startsWith('[fracture-debug]')) outside.push(a.join(' ')); else log0(...a); };

const material = new THREE.MeshStandardMaterial({ vertexColors: true });

function seamOf(styleId, id, [w, d, h], structureIdx) {
  const style = ARCHITECTURE_STYLES.find((s) => s.id === styleId);
  const seed = 7;
  const parts = buildRegionalParts(style, { structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
    wallBucket: 'stone', rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId: 'damage', snowCap: false, tier: 'desktop' }, streamFrom(seed * 3 + 5));
  const describe = structureDamageKitChain(id, styleId).find((k) => k.describe)?.describe;
  const anatomy = describe?.({ structureIdx, mapId: 'damage', builder: id, style: styleId, parts, w, d, h, placement: { x: 0, y: 0, z: 0, yaw: 0 },
    massClass: 'house', seed: 5, kitPlan: regionalKitPlanOf(parts) });
  assert.ok(anatomy?.storeys?.length, `${styleId}/${id}: an anatomy with storeys`);
  const pos = [], nrm = [], col = [];
  for (const geos of Object.values(parts)) {
    if (!Array.isArray(geos)) continue;
    for (const g0 of geos) {
      if (!g0?.attributes?.position) continue;
      const g = g0.index ? g0.toNonIndexed() : g0;
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0); col.push(0.8, 0.7, 0.6);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geometry, material);
  return { structureIdx, anatomy, spans: [{ mesh, position: geometry.attributes.position, bucket: 'stone', first: 0, count: pos.length / 3,
    partClass: 'wall', instanceId: null }], touchShadows() {} };
}
/** The area of a geometry's triangles (world space through a matrix), and how many have none. */
function area(geometry, matrix = null) {
  const p = geometry.getAttribute('position');
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let sum = 0, flat = 0;
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    if (matrix) { a.applyMatrix4(matrix); b.applyMatrix4(matrix); c.applyMatrix4(matrix); }
    const s = b.sub(a).cross(c.sub(a)).length() / 2;
    sum += s;
    if (s < 1e-9) flat++;
  }
  return { sum, flat };
}

function rig(seam, extra = {}) {
  const group = new THREE.Group();
  const pool = createDebrisPhysics({ capacity: 96 });
  pool.bind({ groundAt: () => 0 });
  const kept = new Map();
  let clock = 0;
  const landings = [];
  const fracture = createStructureFracture({
    pool, group, materialFor: () => material, now: () => clock,
    keepSpan: (span) => { if (!kept.has(span)) kept.set(span, Float32Array.from(span.position.array)); },
    onLanding: (x, y, z, speed, mass) => landings.push([speed, mass]),
    ...extra,
  });
  const step = (seconds) => {
    for (let t = 0; t < seconds; t += 1 / 30) { clock += 1 / 30; pool.advance(1 / 30); fracture.update(); }
  };
  return { group, pool, fracture, kept, step, landings, restore: () => { for (const [span, saved] of kept) span.position.array.set(saved); } };
}

const seam = seamOf('hessian', 'cottage', [8, 10, 6.5], 7);
const bucket = seam.spans[0].mesh.geometry;
const before = Float32Array.from(bucket.attributes.position.array);
const whole = area(bucket);
const front = seam.anatomy.storeys[0].faces.find((f) => f.name === 'front');
assert.ok(front, 'the cottage has a front face');
// a round flying into the front face, a metre and a half up, a little off its centre (and off its openings)
const at = (u, v) => [front.origin[0] + front.u[0] * u + front.out[0] * 0.05, front.origin[1] + v, front.origin[2] + front.u[2] * u + front.out[2] * 0.05];
const into = [-front.out[0], -front.out[2]];
let pick = null;
for (const u of [0.3, -0.6, 1.2, -1.5, 2.1, -2.4]) {
  const v = 1.4;
  if (!front.openings.some((o) => Math.abs(u - o.u) < o.w / 2 + 0.7 && v > o.y0 - 0.7 && v < o.y0 + o.h + 0.7)) { pick = u; break; }
}
assert.ok(pick !== null, 'a stretch of wall clear of the openings');

const r = rig(seam);
const [x, y, z] = at(pick, 1.4);
const took = r.fracture.strike(seam, x, y, z, into[0], into[1], 'he', 1.2, 125);
r.fracture.flush();
assert.ok(Array.isArray(took) && took.length >= 2 && took[0] === 0, `a round on a wall breaks it and names the face it took (${took})`);
const after = area(bucket);
assert.ok(after.flat > whole.flat + 20, `the face left the bucket (${after.flat - whole.flat} triangles flattened)`);
assert.ok(after.sum < whole.sum * 0.99 && after.sum > whole.sum * 0.6, `only the face: the rest of the building stands in the bucket (${(100 * (1 - after.sum / whole.sum)).toFixed(1)} % taken)`);
const faceMeshes = r.fracture.standing(7);
assert.ok(faceMeshes.length >= 1, 'the face is drawn again from its cells');
// (2026-10-11: the redrawn faces stood at the world's origin in the browser — a matrix set by hand under a static group
// is skipped by the world update unless flagged) every face drawn in the body frame is carried to the world
for (const m of faceMeshes) assert.ok(m.matrixAutoUpdate || m.matrixWorldNeedsUpdate, 'a face mesh with a hand-set matrix is flagged for the world update');
const drawn = faceMeshes.reduce((s, m) => s + area(m.geometry).sum, 0);
const taken = whole.sum - after.sum;
// the face drawn again carries less wall than it had (the hole), plus its reveals and recesses
assert.ok(drawn > taken * 0.6, `the face stands again (${drawn.toFixed(1)} of ${taken.toFixed(1)} m2 and its reveals)`);
const s0 = r.fracture.stats();
assert.ok(s0.bodies >= 1, `what the round knocked through flies (${s0.bodies} bodies)`);
// bodies leave the wall along the round and come down
const startY = [];
r.step(6);
const s1 = r.fracture.stats();
assert.ok(s1.baked >= 1 || s1.bodies === 0, `bodies come to rest and are baked where they lie (${JSON.stringify(s1)})`);
assert.ok(r.landings.length >= 1, 'their landings are heard and dusted');
void startY;
for (const m of r.group.children) {
  if (m.userData.structureFractureFace) continue;
  // the lowest corner as drawn (a turned body's box would reach below what it draws)
  const p = m.geometry.getAttribute('position');
  const v = new THREE.Vector3();
  let low = Infinity;
  for (let i = 0; i < p.count; i++) low = Math.min(low, v.fromBufferAttribute(p, i).applyMatrix4(m.matrix).y);
  assert.ok(low > -0.12, `nothing ends under the ground (${low.toFixed(3)} m)`);
}
// damage adds up: a second round beside the first widens the break
const [x2, y2, z2] = at(pick + 0.7, 1.6);
r.fracture.strike(seam, x2, y2, z2, into[0], into[1], 'he', 1.2, 125);
r.fracture.flush();
const drawn2 = r.fracture.standing(7).reduce((s, m) => s + area(m.geometry).sum, 0);
assert.ok(Math.abs(drawn2 - drawn) > 0.05, 'a second round changes the face again');
// the reset stands it up byte for byte
r.fracture.reset();
r.restore();
assert.deepEqual(Float32Array.from(bucket.attributes.position.array), before, 'the reset stands the building up exactly');
assert.equal(r.fracture.standing(7).length, 0);
// the same rounds, the same breaks
const log = () => {
  bucket.attributes.position.array.set(before);
  const q = rig(seam);
  q.fracture.strike(seam, x, y, z, into[0], into[1], 'he', 1.2, 125);
  q.fracture.flush();
  const out = q.fracture.standing(7).map((m) => area(m.geometry).sum.toFixed(5)).join(',');
  q.fracture.reset(); q.restore();
  return out;
};
assert.equal(log(), log(), 'deterministic');
// (wave 397: "the whole front hangs in its own plane as a staggered mosaic of loose rectangular panels" for a second) a
// front breached along its foot leans out off it: within a second and a half nothing of what fell stands in the wall's
// plane, and the pieces lie out from the face, the higher ones further
let leanOut = 0;
{
  bucket.attributes.position.array.set(before);
  const q = rig(seam);
  for (const u of [-2.4, -0.8, 0.8, 2.4]) { const [bx, by, bz] = at(u, 0.5); q.fracture.strike(seam, bx, by, bz, into[0], into[1], 'he', 2.5, 152); }
  q.fracture.flush();
  const v = new THREE.Vector3();
  const pieces = () => q.group.children.filter((m) => !m.userData.structureFractureFace && m.geometry?.getAttribute('position')?.count >= 6).map((m) => {
    const p = m.geometry.getAttribute('position'), c = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) c.add(v.fromBufferAttribute(p, i).applyMatrix4(m.matrix));
    c.divideScalar(p.count);
    return [(c.x - front.origin[0]) * front.out[0] + (c.z - front.origin[2]) * front.out[2], c.y];
  });
  const fell = pieces().length;
  assert.ok(fell >= 8, `the storey over the breach falls as bodies (${fell})`);
  q.step(1.5);
  const now = pieces();
  // (a chunk from the cluster's foot may slump onto the courses still standing beside the breach: a tenth at most, and
  // none of the storey over it, which has left the wall's plane)
  const standing = now.filter(([out, y]) => Math.abs(out) < 0.6 && y > 0.8);
  const high = standing.filter(([, y]) => y > 2.2).length;
  assert.ok(standing.length <= Math.max(1, Math.floor(now.length / 10)) && high === 0,
    `after 1.5 s at most a tenth of what fell stands in the wall's plane, none over 2.2 m (${standing.length} of ${now.length}, `
    + `${high} high: ${standing.map(([, y]) => y.toFixed(2)).join(' ')})`);
  const outs = now.map(([out]) => out).sort((a, b) => a - b);
  leanOut = outs[Math.floor(outs.length / 2)];
  assert.ok(leanOut > 1, `what fell lies out from the face (median ${leanOut.toFixed(2)} m)`);
  q.fracture.reset(); q.restore();
}
// (wave 422: the house's cracked clumps filled the debris pool its collapse shares, and the collapse stood frozen on a
// bare frame over the heap) the fracture holds its share of the pool at most: a barrage at the foot never puts more bodies
// in it than the share, what it throws past the share is counted, and the share frees as what fell comes to rest
let shareMost = 0, shareSkipped = 0;
{
  bucket.attributes.position.array.set(before);
  const share = 12;
  const q = rig(seam, { poolShare: share });
  const note = () => { shareMost = Math.max(shareMost, q.fracture.stats().bodies, q.pool.stats().bodies); };
  for (const u of [-2.4, -0.8, 0.8, 2.4]) {
    const [bx, by, bz] = at(u, 0.5);
    q.fracture.strike(seam, bx, by, bz, into[0], into[1], 'he', 2.5, 152);
    q.fracture.flush();
    note();
  }
  for (let k = 0; k < 90; k++) { q.step(1 / 30); note(); }
  shareSkipped = q.fracture.stats().skipped;
  assert.ok(shareMost <= share, `the fracture never holds more than its share of the pool (${shareMost} of ${share})`);
  assert.ok(shareSkipped > 0, `what a barrage throws past the share is counted (${shareSkipped})`);
  q.step(4);
  const rest = q.fracture.stats();
  assert.ok(rest.bodies < share && rest.baked > 0, `the share frees as what fell comes to rest (${JSON.stringify(rest)})`);
  q.fracture.reset(); q.restore();
}
// a point off every wall breaks nothing
assert.equal(r.fracture.strike(seam, 40, 1, 40, 1, 0, 'he', 1.2, 125), null, 'a burst off the building breaks no face');
console.log = log0;
// (destruction-slabs 227 round 4, lane B's penstock) a face whose slab draws no flat wall — a pipe lying along the
// cottage's front where its wall was — is not taken: nothing redrawn, no chunk thrown, the pipe's triangles left as they
// are drawn, and a later round on it lays nothing (an empty answer: the kit lays no rim for it either)
{
  const pipeSeam = seamOf('hessian', 'cottage', [8, 10, 6.5], 9);
  const f = pipeSeam.anatomy.storeys[0].faces.find((g) => g.name === 'front');
  const R = Math.max(0.6, Math.min(1.4, f.height / 2 - 0.1)), cy = f.origin[1] + R + 0.05;
  const pipe = new THREE.CylinderGeometry(R, R, f.width * 0.9, 24, 1, true).toNonIndexed();
  // along the face (its u), its front at the face's plane
  const yaw = Math.atan2(f.u[0], f.u[2]);
  pipe.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2)).applyMatrix4(new THREE.Matrix4().makeRotationY(yaw))
    .applyMatrix4(new THREE.Matrix4().makeTranslation(f.origin[0] - f.out[0] * R, cy, f.origin[2] - f.out[2] * R));
  const col = new Float32Array(pipe.attributes.position.count * 3).fill(0.7);
  pipe.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pipeMesh = new THREE.Mesh(pipe, material);
  pipeSeam.spans = [{ mesh: pipeMesh, position: pipe.attributes.position, bucket: 'stone', first: 0, count: pipe.attributes.position.count, partClass: 'wall', instanceId: null }];
  const pr = rig(pipeSeam);
  const p0 = Float32Array.from(pipe.attributes.position.array);
  const hitAt = [f.origin[0] + f.out[0] * 0.05, cy, f.origin[2] + f.out[2] * 0.05];
  const first = pr.fracture.strike(pipeSeam, ...hitAt, -f.out[0], -f.out[2], 'he', 1.2, 125);
  pr.fracture.flush();
  pr.step(1);
  const faces = []; pr.group.traverse((o) => { if (o.isMesh && /fx-fracture-face/.test(o.name)) faces.push(o); });
  assert.equal(faces.length, 0, 'a pipe\'s face is drawn as no wall');
  assert.equal(pr.fracture.stats().bodies, 0, 'and throws no chunk');
  assert.ok(p0.every((v, i) => v === pipe.attributes.position.array[i]), 'its triangles stay as they are drawn');
  const second = pr.fracture.strike(pipeSeam, hitAt[0] + 0.01, hitAt[1] + 1.2, hitAt[2], -f.out[0], -f.out[2], 'he', 1.2, 125);
  assert.ok(Array.isArray(first) && Array.isArray(second) && second.length === 0, 'a later round on it takes nothing and lays nothing');
}

assert.deepEqual(outside, [], 'every body draws inside its parts');
console.log(`structureFracture.selftest: a round on a cottage's front face took it out of the bucket (${after.flat - whole.flat} triangles), `
  + `drew it again with its hole (${drawn.toFixed(1)} m2), threw ${s0.bodies} bodies that came to rest (${s1.baked} baked, ${r.landings.length} landings), `
  + `a second round widened it, the reset stood it up byte for byte, a front breached along its foot leaned out (median ${leanOut.toFixed(1)} m out), the same twice, `
  + `a barrage held to its share of the pool (${shareMost} of 12, ${shareSkipped} past it), a pipe's face taken as no wall`);
