// The open frames' destroyed reading (props census #3, lane B 2026-10-14: lattice.ts latticeFrame / recordLattice,
// damage.ts describeLattice, latticeFall.ts collapseLattice; the judges: the trestles, windmills, elevated tanks and
// radar towers "fall as solid metal drums 4.8 m across over a solid stump, not as their members"):
//   1. each kit's open frame (the Queenstown tank trestle, the Navajo windmill, the Glen Canyon tank, the Kyushu fire
//      lookout) records its frame in the kit's plan: four legs, its girts, what stands on it; the frame describes as a
//      lattice in its kit, never as a shaft (shaft.ts takes it no more);
//   2. a blow passes through it (no hole, no spall) and the damaged stage cuts nothing;
//   3. the collapse folds it over: a bent stub at every leg's foot, the legs and members lying along the ground out to
//      most of the height it stood, the crown at the far end; the same bytes twice, every vertex finite and on the
//      ground's side of the frame's reach, every triangle facing its normal;
//   4. a house with a frame beside it (the Queenstown headframe and its winding house) keeps the frame as a body of
//      its own (E5).
import assert from 'node:assert/strict';
import { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } from './index.ts';
import { streamFrom } from './geometry.ts';
import { describeStructure, createStructureDamageSeam } from '../../structureDamageSeam.ts';
import '../../destructionDefaultKit.ts';
import { shaftOf } from './shaft.ts';
import { latticeOf } from './latticeFall.ts';

const finite = (v, label) => assert.ok(Number.isFinite(v), `${label}: finite (${v})`);

function writers(vertexCap, pieceCap) {
  const runs = [];
  let cur = null;
  const mesh = {
    capacity: vertexCap,
    get vertices() { return runs.reduce((a, r) => a + r.pos.length / 3, 0); },
    begin(bucket, role) { if (this.vertices >= this.capacity) return false; cur = { bucket, role, pos: [], nor: [], idx: [] }; runs.push(cur); return true; },
    vertex(px, py, pz, nx, ny, nz, u, v, r, g, b) {
      for (const x of [px, py, pz, nx, ny, nz, u, v, r, g, b]) finite(x, 'vertex');
      cur.pos.push(px, py, pz); cur.nor.push(nx, ny, nz);
      return cur.pos.length / 3 - 1;
    },
    triangle(a, b, c) { cur.idx.push(a, b, c); },
    end() {},
  };
  const list = [];
  const pieces = {
    capacity: pieceCap,
    get count() { return list.length; },
    push(...a) { if (list.length >= this.capacity) return false; for (const x of a.slice(3)) finite(x, 'piece'); list.push(a); return true; },
  };
  return { mesh, pieces, runs, list };
}

function assertFacing(runs, label) {
  for (const run of runs) for (let i = 0; i < run.idx.length; i += 3) {
    const [a, b, c] = [run.idx[i], run.idx[i + 1], run.idx[i + 2]];
    const P = (k) => [run.pos[k * 3], run.pos[k * 3 + 1], run.pos[k * 3 + 2]];
    const A = P(a), B = P(b), C = P(c);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const gl = Math.hypot(...g);
    if (gl < 1e-9) continue;
    const nv = [0, 1, 2].map((k) => run.nor[a * 3 + k] + run.nor[b * 3 + k] + run.nor[c * 3 + k]);
    const dot = (g[0] * nv[0] + g[1] * nv[1] + g[2] * nv[2]) / gl / (Math.hypot(...nv) || 1);
    assert.ok(dot > -0.05, `${label}: a ${run.bucket}/${run.role} triangle wound against its normal (${dot.toFixed(2)})`);
  }
}

const style = (id) => ARCHITECTURE_STYLES.find((s) => s.id === id);
function build(styleId, id, [w, d, h], seed) {
  const parts = buildRegionalParts(style(styleId), { structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
    wallBucket: 'plaster', rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId: 'lattice', snowCap: false, tier: 'desktop' }, streamFrom(seed * 3 + 5));
  let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity, mxy = 0;
  for (const list of Object.values(parts)) for (const g of list) {
    g.computeBoundingBox();
    const b = g.boundingBox;
    if (b.isEmpty()) continue;
    mnx = Math.min(mnx, b.min.x); mxx = Math.max(mxx, b.max.x); mnz = Math.min(mnz, b.min.z); mxz = Math.max(mxz, b.max.z); mxy = Math.max(mxy, b.max.y);
  }
  return { parts, plan: regionalKitPlanOf(parts), box: { w: mxx - mnx, d: mxz - mnz, h: mxy } };
}
function describe(styleId, id, built) {
  return describeStructure({ structureIdx: 3, mapId: 'lattice', builder: id, style: styleId, parts: built.parts, w: built.box.w, d: built.box.d, h: built.box.h,
    placement: { x: 0, y: 0, z: 0, yaw: 0 }, massClass: 'house' });
}

// ---- 1-3. the open frames
const FRAMES = [
  ['queenstown', 'watertower', [5.6, 5.6, 14]],
  ['navajo', 'watertower', [5.6, 5.6, 14]],
  ['glencanyon', 'watertower', [5.6, 5.6, 14]],
  ['kyushu', 'stack', [3.8, 3.8, 9.4]],
];
const CAPS = { breach: [3000, 96], damaged: [3000, 48], collapse: [16000, 240] };
for (const [styleId, id, dims] of FRAMES) {
  // (the kyushu stack plot is a chimney a third of the time: the first seed that lays the fire lookout)
  let seed = 11, built = build(styleId, id, dims, seed);
  while (!built.plan?.lattices?.length && seed < 40) built = build(styleId, id, dims, ++seed);
  const label = `${styleId}/${id} (seed ${seed})`;
  const lats = built.plan?.lattices ?? [];
  assert.ok(lats.length >= 1, `${label}: the frame recorded in the kit's plan`);
  const lat = lats[0];
  assert.equal(lat.legs.length, 4, `${label}: four legs`);
  assert.ok(lat.girts.length >= 2 && lat.girts.every((y, i) => i === 0 || y > lat.girts[i - 1]), `${label}: girts up the frame`);
  for (const l of lat.legs) for (const v of [...l.foot, ...l.head]) finite(v, `${label} leg`);
  const a = describe(styleId, id, built);
  assert.equal(a.kit, styleId, `${label}: its kit describes it`);
  assert.ok(latticeOf(a), `${label}: it reads as a lattice`);
  assert.equal(shaftOf(a), null, `${label}: the shaft reading does not take it`);
  const seam = createStructureDamageSeam(3, id, styleId, a, []);
  const f = a.storeys[0].faces[0];
  const hit = writers(...CAPS.breach);
  const res = seam.breach({ section: f.section, storey: 0, face: f.name, hole: 0, u: 0, y: 1.5, radiusM: 0.9, dirX: -f.out[0], dirZ: -f.out[2],
    munition: 'he', cause: 'blast', seed: 7 }, hit);
  assert.equal(res.cuts.length, 0, `${label}: a blow passes through the frame`);
  assert.equal(hit.runs.reduce((n, r) => n + r.idx.length, 0), 0, `${label}: and lays nothing`);
  const dmg = writers(...CAPS.damaged);
  assert.equal(seam.damaged(31, dmg).cuts.length, 0, `${label}: the damaged stage cuts nothing`);
  const one = writers(...CAPS.collapse), two = writers(...CAPS.collapse);
  seam.collapse(71, one); seam.collapse(71, two);
  assert.equal(JSON.stringify(two.runs), JSON.stringify(one.runs), `${label}: the same fall twice`);
  assertFacing(one.runs, `${label} collapse`);
  const height = Math.max(...lat.legs.map((l) => l.head[1] - l.foot[1]));
  const cx = lat.legs.reduce((s, l) => s + l.foot[0], 0) / 4, cz = lat.legs.reduce((s, l) => s + l.foot[2], 0) / 4;
  const rubble = one.runs.filter((r) => r.role === 'rubble');
  assert.ok(rubble.length && rubble.some((r) => r.idx.length), `${label}: the fall lays rubble`);
  let far = 0, top = -Infinity;
  for (const r of rubble) for (let i = 0; i < r.pos.length; i += 3) {
    far = Math.max(far, Math.hypot(r.pos[i] - cx, r.pos[i + 2] - cz));
    top = Math.max(top, r.pos[i + 1]);
    assert.ok(r.pos[i + 1] > -1.0, `${label}: nothing under the ground (${r.pos[i + 1].toFixed(2)})`);
  }
  assert.ok(far > height * 0.6, `${label}: the frame lies along the ground (${far.toFixed(1)} m out of ${height.toFixed(1)})`);
  assert.ok(top < Math.max(...lat.legs.map((l) => l.foot[1])) + Math.max(3, height * 0.35), `${label}: nothing left standing high (${top.toFixed(1)})`);
  // a stub at every leg's foot: some rubble within a metre of each foot, under a metre and a half
  for (const l of lat.legs) {
    let stub = false;
    for (const r of rubble) for (let i = 0; i < r.pos.length && !stub; i += 3) {
      if (Math.hypot(r.pos[i] - l.foot[0], r.pos[i + 2] - l.foot[2]) < 1.0 && r.pos[i + 1] < l.foot[1] + 1.5) stub = true;
    }
    assert.ok(stub, `${label}: a stub at the foot (${l.foot.map((v) => v.toFixed(1)).join(', ')})`);
  }
  console.log(`lattice damage: ${label} — ${lats.length} frame(s), ${lat.girts.length} girt levels, falls ${far.toFixed(1)} m of ${height.toFixed(1)}`);
}

// ---- 4. a house with its frame beside it
{
  const built = build('queenstown', 'gantry', [21, 5.4, 12], 11);
  assert.ok(built.plan?.houses?.length && built.plan?.lattices?.length, 'queenstown/gantry: the winding house and the headframe both recorded');
  const a = describe('queenstown', 'gantry', built);
  // (the main body is the anatomy itself; kitPlan.bodies are the others beside it)
  const bodies = a.kitPlan?.bodies ?? [], frames = bodies.filter((b) => latticeOf(b));
  assert.ok(frames.length >= 1, `queenstown/gantry: the headframe a body of its own beside the winding house (${bodies.length} bodies)`);
  console.log(`lattice damage: queenstown/gantry — the winding house and ${frames.length} frame bod${frames.length > 1 ? 'ies' : 'y'} beside it`);
}
console.log('lattice damage: every open frame recorded, read as a lattice, passed through by a blow and folded over in its members when it falls');
