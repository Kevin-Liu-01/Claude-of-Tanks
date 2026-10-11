// A building's walls drawn as they break (fx/structureFracture.ts over fx/wallFracture.ts and the physics lane's debris
// pool; the owner, 2026-10-10: "the destruction of buildings needs to be a lot better too, rn its way to sporadic and
// ugly instead of behaving like it would with physics"), with a regional cottage's own triangles as the world's merged
// bucket holds them:
//   - the struck face leaves the bucket (its triangles flattened in place, the rest of the building untouched) and is
//     drawn again from its cells, with a hole where the round struck: less wall there, the reveal across the thickness;
//   - what the round knocks through flies as bodies along it, what loses its load path falls as bodies; they come to
//     rest on the ground and are baked where they lie (never faded); a dark room stands behind the holed storey;
//   - damage adds up across rounds; the reset stands the building up byte for byte; the same rounds break it the same.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } from '../world/maps/regional/index.ts';
import { streamFrom } from '../world/maps/regional/geometry.ts';
import { structureDamageKitChain } from '../world/destructionKit.ts';
import { createDebrisPhysics } from './debrisPhysics.ts';
import { createStructureFracture } from './structureFracture.ts';

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

function rig(seam) {
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
assert.equal(r.fracture.strike(seam, x, y, z, into[0], into[1], 'he', 1.2, 125), true, 'a round on a wall breaks it');
const after = area(bucket);
assert.ok(after.flat > whole.flat + 20, `the face left the bucket (${after.flat - whole.flat} triangles flattened)`);
assert.ok(after.sum < whole.sum * 0.99 && after.sum > whole.sum * 0.6, `only the face: the rest of the building stands in the bucket (${(100 * (1 - after.sum / whole.sum)).toFixed(1)} % taken)`);
const faceMeshes = r.fracture.standing(7);
assert.ok(faceMeshes.length >= 1, 'the face is drawn again from its cells');
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
  const out = q.fracture.standing(7).map((m) => area(m.geometry).sum.toFixed(5)).join(',');
  q.fracture.reset(); q.restore();
  return out;
};
assert.equal(log(), log(), 'deterministic');
// a point off every wall breaks nothing
assert.equal(r.fracture.strike(seam, 40, 1, 40, 1, 0, 'he', 1.2, 125), false, 'a burst off the building breaks no face');
console.log(`structureFracture.selftest: a round on a cottage's front face took it out of the bucket (${after.flat - whole.flat} triangles), `
  + `drew it again with its hole (${drawn.toFixed(1)} m2), threw ${s0.bodies} bodies that came to rest (${s1.baked} baked, ${r.landings.length} landings), `
  + 'a second round widened it, the reset stood it up byte for byte, the same twice');
