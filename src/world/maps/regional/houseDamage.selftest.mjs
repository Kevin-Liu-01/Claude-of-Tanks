// The regional house kits' damage through the destruction seam (the facades lane, 2026-10-07; docs/DESTRUCTION.md §16):
//   - every kit's every builder describes (a house plan gives an anatomy, a builder that built no house gives null:
//     the core's default reads it), with finite numbers, four faces a storey in house.ts's order, members and
//     openings inside their faces, a coursed wall's joints ascending;
//   - a breach on every face of every storey of a sample of houses writes the same bytes twice (damageRng only), stays
//     within the writers' caps (3,000 vertices, 96 pieces), draws its rim within 5/4 of its cut (the seam's blocky cut
//     edge runs between 0.8 and 1.2 of it) and within the wall's layers, its room behind the wall, and cuts one cylinder
//     on the face; every triangle a stage writes faces the way its normal says.
import assert from 'node:assert/strict';
import { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } from './index.ts';
import { streamFrom } from './geometry.ts';
import { structureDamageKitChain } from '../../destructionKit.ts';

function build(style, id, seed, wall) {
  const [w, d, h] = [7 + (seed % 5), 9 + (seed % 7), 6];
  const parts = buildRegionalParts(style, { structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
    wallBucket: wall, rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId: 'damage', snowCap: false, tier: 'desktop' }, streamFrom(seed * 3 + 5));
  return { parts, w, d, h };
}
function kitOf(id, styleId, member) {
  return structureDamageKitChain(id, styleId).find((k) => k[member])?.[member];
}
const finite = (v, label) => assert.ok(Number.isFinite(v), `${label}: finite (${v})`);

/** Array-backed writers with the seam's caps (the presentation's own writers are the core's). */
function writers(vertexCap = 3000, pieceCap = 96) {
  const runs = [];
  let cur = null;
  const mesh = {
    capacity: vertexCap,
    get vertices() { return runs.reduce((a, r) => a + r.pos.length / 3, 0); },
    begin(bucket, role) { if (this.vertices >= this.capacity) return false; cur = { bucket, role, pos: [], nor: [], uv: [], col: [], idx: [] }; runs.push(cur); return true; },
    vertex(px, py, pz, nx, ny, nz, u, v, r, g, b) {
      assert.ok(this.vertices < this.capacity, 'a builder never writes past the cap');
      for (const x of [px, py, pz, nx, ny, nz, u, v, r, g, b]) finite(x, 'vertex');
      cur.pos.push(px, py, pz); cur.nor.push(nx, ny, nz); cur.uv.push(u, v); cur.col.push(r, g, b);
      return cur.pos.length / 3 - 1;
    },
    triangle(a, b, c) { for (const i of [a, b, c]) assert.ok(i >= 0 && i < cur.pos.length / 3, 'indices inside their run'); cur.idx.push(a, b, c); },
    end() {},
  };
  const list = [];
  const pieces = {
    capacity: pieceCap,
    get count() { return list.length; },
    push(...a) {
      if (list.length >= this.capacity) return false;
      for (const x of a.slice(3)) finite(x, 'piece');
      list.push(a);
      return true;
    },
  };
  return { mesh, pieces, runs, list };
}

/** Every triangle faces the way its vertex normals say (the presentation's materials are single-sided). */
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
    assert.ok(dot > -0.05, `${label}: a ${run.bucket}/${run.role} triangle wound against its normal (${dot.toFixed(2)}; ${[A, B, C].map((p) => p.map((v) => v.toFixed(3)).join(',')).join(' | ')}; n ${nv.map((v) => (v / 3).toFixed(2)).join(',')}; run of ${run.idx.length / 3} triangles, #${i / 3})`);
  }
}

// 1. describe: every kit, every builder, two seeds and walls
let described = 0, houseless = 0;
for (const style of ARCHITECTURE_STYLES) {
  const describe = kitOf('cottage', style.id, 'describe');
  assert.ok(describe, `${style.id}: a damage kit registered under the style`);
  for (const id of Object.keys(style.builders)) {
    for (const [seed, wall] of [[11, 'stone'], [29, 'plaster']]) {
      const { parts, w, d, h } = build(style, id, seed, wall);
      const plan = regionalKitPlanOf(parts);
      assert.ok(plan && plan.style === style.id && plan.builder === id, `${style.id}/${id}: the build hands its plan back`);
      const a = describe({ structureIdx: 3, mapId: 'damage', builder: id, style: style.id, parts, w, d, h, placement: { x: 0, y: 0, z: 0, yaw: 0 },
        massClass: 'house', seed: 99, kitPlan: plan });
      if (!a) { assert.equal(plan.houses.length, 0, `${style.id}/${id}: a house plan always describes`); houseless++; continue; }
      described++;
      assert.equal(a.kit, style.id);
      for (const st of a.storeys) {
        assert.deepEqual(st.faces.map((f) => f.name), ['front', 'right', 'back', 'left'], `${style.id}/${id}: faces in house.ts order`);
        assert.ok(st.y1 > st.y0, `${style.id}/${id}: storey ${st.index} has height`);
        for (const f of st.faces) {
          for (const v of [...f.origin, ...f.u, ...f.out, f.width, f.height]) finite(v, `${style.id}/${id} face`);
          assert.ok(f.layers.length >= 1 && f.layers.every((l) => l.thicknessM > 0), `${style.id}/${id}: a face has its layers`);
          for (const o of f.openings) assert.ok(Math.abs(o.u) <= f.width / 2 + 0.05 && o.y0 >= -0.05, `${style.id}/${id}: an opening inside its face`);
          for (const m of f.members) {
            assert.ok(Math.max(Math.abs(m.u0), Math.abs(m.u1)) <= f.width / 2 + 0.3, `${style.id}/${id}: a member inside its face (u ${m.u0}, ${m.u1})`);
          }
          if (f.masonry) {
            const c = f.masonry.courses;
            assert.ok(c[0] === 0 && c.every((y, i) => i === 0 || y > c[i - 1]), `${style.id}/${id}: courses ascending from the floor`);
            for (let k = 0; k < Math.min(4, c.length); k++) {
              const j = f.masonry.joints(k);
              assert.ok(j.every((u, i) => i === 0 || u > j[i - 1]), `${style.id}/${id}: joints ascending`);
            }
          }
        }
      }
      assert.ok(a.rubble.length && Math.abs(a.rubble.reduce((s, r) => s + r.share, 0) - 1) < 1e-6, `${style.id}/${id}: the pile's shares sum to one`);
      assert.ok(!a.roof || a.roof.slabs.length >= 1, `${style.id}/${id}: a roof has its slabs`);
    }
  }
}
assert.ok(described > 200, `most builders describe from their plan (${described})`);
console.log(`house damage: ${described} anatomies from house plans, ${houseless} builds left to the default kit`);

// 2. breach: every face of every storey of a sample of houses, determinism, caps, rim and room bounds
const SAMPLE = [['hessian', 'cottage', 'stone'], ['hessian', 'tavern', 'plaster'], ['franconian', 'rowhouse', 'plaster'], ['kolkhoz', 'cottage', 'plaster'],
  ['breton', 'cottage', 'stone'], ['dalmatian', 'cottage', 'stone'], ['polder', 'cottage', 'stone'], ['savoyard', 'cottage', 'plaster'],
  ['glencanyon', 'megatower', 'plaster2']];
let holes = 0, verts = 0, pcs = 0, worst = 0, poured = 0, reinforced = 0;
for (const [styleId, id, wall] of SAMPLE) {
  const style = ARCHITECTURE_STYLES.find((s) => s.id === styleId);
  if (!style?.builders[id]) continue;
  const { parts, w, d, h } = build(style, id, 7, wall);
  const describe = kitOf(id, styleId, 'describe'), breach = kitOf(id, styleId, 'breach');
  const a = describe({ structureIdx: 1, mapId: 'damage', builder: id, style: styleId, parts, w, d, h, placement: { x: 0, y: 0, z: 0, yaw: 0 },
    massClass: 'house', seed: 5, kitPlan: regionalKitPlanOf(parts) });
  assert.ok(a && breach, `${styleId}/${id}: an anatomy and a breach builder`);
  for (const st of a.storeys) for (const f of st.faces) for (const [fu, fy, r] of [[0, 0.5, 0.9], [-0.3, 0.4, 0.5], [0.25, 0.6, 1.4]]) {
    const hole = { section: f.section, storey: st.index, face: f.name, hole: 0, u: f.width * fu, y: f.height * fy, radiusM: r,
      dirX: -f.out[0], dirZ: -f.out[2], munition: 'he', cause: 'blast', seed: 1000 + holes };
    const one = writers(), two = writers();
    const res = breach(a, hole, one), again = breach(a, hole, two);
    assert.deepEqual(JSON.stringify(two.runs), JSON.stringify(one.runs), `${styleId}/${id}: a breach writes the same bytes twice`);
    assert.deepEqual(JSON.stringify(two.list), JSON.stringify(one.list), `${styleId}/${id}: and throws the same pieces`);
    assert.deepEqual(again, res);
    assert.equal(res.cuts.length, 1, 'one cut a hole');
    assertFacing(one.runs, `${styleId}/${id} breach`);
    const cut = res.cuts[0];
    // (the seam's blocky cut edge runs between 0.8 and 1.2 of the cut: a rim's hole lies inside 3/4 of it, its redraw
    // reaches 5/4 of it)
    assert.ok(cut.radiusM > 0.1 && cut.radiusM <= r * 2.5 + 1e-9, `${styleId}/${id}: the cut takes the hole (${cut.radiusM} for ${r})`);
    const depth = cut.depthM;
    for (const run of one.runs) {
      for (let i = 0; i < run.pos.length; i += 3) {
        const dx = run.pos[i] - cut.x, dy = run.pos[i + 1] - cut.y, dz = run.pos[i + 2] - cut.z;
        const along = dx * cut.nx + dz * cut.nz, rx = dx - cut.nx * along, rz = dz - cut.nz * along, radial = Math.hypot(rx, dy, rz);
        if (run.role === 'rim') {
          assert.ok(radial <= cut.radiusM * 1.25 + 0.2, `${styleId}/${id} ${f.name}: a rim vertex within the redraw's reach (${radial.toFixed(3)} of ${cut.radiusM.toFixed(3)})`);
          assert.ok(along <= 0.2 && along >= -depth - 0.05, `${styleId}/${id} ${f.name}: a rim vertex within the wall's layers (${along.toFixed(3)})`);
        } else if (run.role === 'room') {
          assert.ok(along <= 0.02, `${styleId}/${id} ${f.name}: the room lies behind the wall (${along.toFixed(3)})`);
        }
      }
    }
    if (f.layers.some((l) => l.material === 'concrete')) {
      poured++;
      if (one.runs.some((run) => run.bucket === 'structureMetal' && run.role === 'rim' && run.idx.length)) reinforced++;
    }
    verts += one.mesh.vertices; pcs += one.pieces.count; worst = Math.max(worst, one.mesh.vertices); holes++;
  }
}
assert.ok(poured > 0 && reinforced >= poured * 0.8, `a poured wall's breaches show their bars (${reinforced} of ${poured})`);
console.log(`house damage: ${holes} breaches deterministic, within the caps (worst ${worst} vertices, mean ${(verts / holes).toFixed(0)} vertices and ${(pcs / holes).toFixed(1)} pieces), rims inside their cuts, rooms behind the walls, ${reinforced} of ${poured} concrete breaches with their bars`);

// 3. damaged: deterministic, within its caps (1,500 vertices, 48 pieces), its spalls shallow cuts on their faces, the
// glass hidden
let stages = 0, spalls = 0, dpcs = 0;
for (const [styleId, id, wall] of SAMPLE) {
  const style = ARCHITECTURE_STYLES.find((s) => s.id === styleId);
  if (!style?.builders[id]) continue;
  const { parts, w, d, h } = build(style, id, 13, wall);
  const describe = kitOf(id, styleId, 'describe'), damaged = kitOf(id, styleId, 'damaged');
  const a = describe({ structureIdx: 2, mapId: 'damage', builder: id, style: styleId, parts, w, d, h, placement: { x: 0, y: 0, z: 0, yaw: 0 },
    massClass: 'house', seed: 8, kitPlan: regionalKitPlanOf(parts) });
  assert.ok(a && damaged, `${styleId}/${id}: a damaged builder`);
  for (const seed of [3, 4, 5]) {
    const one = writers(1500, 48), two = writers(1500, 48);
    const res = damaged(a, seed, one), again = damaged(a, seed, two);
    assert.deepEqual(JSON.stringify(two.runs), JSON.stringify(one.runs), `${styleId}/${id}: damaged writes the same bytes twice`);
    assert.deepEqual(JSON.stringify(two.list), JSON.stringify(one.list));
    assert.deepEqual(again, res);
    assert.ok(res.hides.some((x) => x.partClass === 'glass' && x.section === null), `${styleId}/${id}: damaged hides the glass`);
    assertFacing(one.runs, `${styleId}/${id} damaged`);
    for (const c of res.cuts) {
      assert.ok(c.radiusM > 0 && c.radiusM < 1.0 && c.depthM <= 0.06, `${styleId}/${id}: a spall is a small, shallow cut (${c.radiusM}, ${c.depthM})`);
      const onFace = a.storeys.some((st) => st.faces.some((f) => Math.abs((c.x - f.origin[0]) * f.out[0] + (c.z - f.origin[2]) * f.out[2]) < 1e-3
        && c.nx === f.out[0] && c.nz === f.out[2]));
      assert.ok(onFace, `${styleId}/${id}: a spall cut lies on a face's plane`);
    }
    spalls += res.cuts.length; dpcs += one.pieces.count; stages++;
  }
}
console.log(`house damage: ${stages} damaged stages deterministic and within their caps (${spalls} spalls, ${(dpcs / stages).toFixed(1)} pieces a stage), the glass hidden`);

// 4. collapse: deterministic, within a house's caps (16,000 vertices, 240 pieces), the whole structure hidden, the
// remnant within the footprint and below the storey, the heap within the mound's footprint and seated on its surface
import { bodyCentre, domeMound } from './fracture.ts';
let falls = 0, fv = 0;
for (const [styleId, id, wall] of SAMPLE) {
  const style = ARCHITECTURE_STYLES.find((s) => s.id === styleId);
  if (!style?.builders[id]) continue;
  const { parts, w, d, h } = build(style, id, 17, wall);
  const describe = kitOf(id, styleId, 'describe'), collapse = kitOf(id, styleId, 'collapse');
  const a = describe({ structureIdx: 4, mapId: 'damage', builder: id, style: styleId, parts, w, d, h, placement: { x: 0, y: 0, z: 0, yaw: 0 },
    massClass: 'house', seed: 12, kitPlan: regionalKitPlanOf(parts) });
  assert.ok(a && collapse, `${styleId}/${id}: a collapse builder`);
  const mound = domeMound(a), rx = a.w / 2 + 1.05, rz = a.d / 2 + 1.05, [cx, cz] = bodyCentre(a);
  const one = writers(16000, 240), two = writers(16000, 240);
  const res = collapse(a, 77, one), again = collapse(a, 77, two);
  assert.deepEqual(JSON.stringify(two.runs), JSON.stringify(one.runs), `${styleId}/${id}: a collapse writes the same bytes twice`);
  assert.deepEqual(JSON.stringify(two.list), JSON.stringify(one.list));
  assert.deepEqual(again, res);
  assert.ok(res.hides.some((x) => x.section === null && x.partClass === null), `${styleId}/${id}: a collapse hides the structure`);
  assertFacing(one.runs, `${styleId}/${id} collapse`);
  for (const run of one.runs) for (let i = 0; i < run.pos.length; i += 3) {
    const x = run.pos[i] - cx, y = run.pos[i + 1], z = run.pos[i + 2] - cz;
    if (run.role === 'rubble') {
      // a chunk is kept only where the heap stands, and reaches at most 1.6 m past its centre (a long timber's half)
      assert.ok((x / (rx + 1.7)) ** 2 + (z / (rz + 1.7)) ** 2 <= 1.0001, `${styleId}/${id}: rubble on the mound's footprint (${x.toFixed(2)}, ${z.toFixed(2)})`);
      const m = mound(x + cx, z + cz);
      // (the pile stands a hand and more over the sim's mound, which raises the terrain itself; its timbers lean on it;
      // the s1c review: wall slabs lie at angles and timbers poke up out of it)
      assert.ok(y >= m - 1.2 && y <= m + 2.4, `${styleId}/${id}: rubble on the mound (${y.toFixed(2)} at ${m.toFixed(2)})`);
    } else if (run.role === 'remnant') {
      assert.ok(Math.abs(x) <= a.w / 2 + 1 && Math.abs(z) <= a.d / 2 + 1, `${styleId}/${id}: the remnant inside the footprint`);
      assert.ok(y <= Math.max(a.storeys[0].y1 + 0.5, ...a.chimneys.map((c) => c.y1)) + 0.05, `${styleId}/${id}: the remnant no taller than its storey or a stack`);
    }
  }
  // (wave 277: "a thin blue-black band with no brick-red, no wall stubs and no roof timbers") the pile is no band in the
  // ground: its skin stands over the mound where the mound is high, the walls' stubs rise over the heap banked against
  // them, and the roof's timbers lie in it
  const skin = one.runs.filter((r) => r.role === 'rubble')[0];
  let crownOver = Infinity;
  for (let i = 0; i < skin.pos.length; i += 3) {
    const m = mound(skin.pos[i], skin.pos[i + 2]);
    if (m >= 0.8) crownOver = Math.min(crownOver, skin.pos[i + 1] - m);
  }
  assert.ok(crownOver >= 0.15, `${styleId}/${id}: the pile's skin stands over the mound where it is high (${crownOver.toFixed(2)})`);
  let stubOver = 0;
  for (const run of one.runs) if (run.role === 'remnant') for (let i = 0; i < run.pos.length; i += 3) {
    stubOver = Math.max(stubOver, run.pos[i + 1] - mound(run.pos[i], run.pos[i + 2]));
  }
  assert.ok(stubOver >= 0.5, `${styleId}/${id}: wall stubs stand over the heap against them (${stubOver.toFixed(2)})`);
  // (s1c review, 2026-10-08: "about half the wave-277 bar") the corners stand as piers 2-2.5 m over the heap where the
  // ground storey is that tall
  if (a.remnant.corners && a.storeys[0].y1 - a.storeys[0].y0 >= 3.2) {
    assert.ok(stubOver >= 1.8, `${styleId}/${id}: corner piers stand over the heap (${stubOver.toFixed(2)})`);
  }
  if (a.roof && (a.roof.structure.material === 'timber' || a.roof.structure.material === 'metal')) {
    const beams = one.runs.filter((r) => r.role === 'rubble' && r.bucket === a.roof.structure.bucket);
    assert.ok(beams.some((r) => r.pos.length >= 48), `${styleId}/${id}: the roof's timbers in the pile`);
    let poke = 0;
    for (const r of beams) for (let i = 0; i < r.pos.length; i += 3) poke = Math.max(poke, r.pos[i + 1] - mound(r.pos[i], r.pos[i + 2]));
    assert.ok(poke >= 1.1, `${styleId}/${id}: a timber pokes up out of the heap (${poke.toFixed(2)})`);
  }
  // the roof's covering over the pile: its plates in the covering's own bucket
  if (a.roof && ['tile', 'slate', 'metal', 'plank'].includes(a.roof.covering.material)) {
    assert.ok(one.runs.some((r) => r.role === 'rubble' && r.bucket === a.roof.covering.bucket && r.pos.length >= 24 * 20),
      `${styleId}/${id}: the roof's covering lies over the pile (${a.roof.covering.material})`);
  }
  // a wall slab lying whole: a box in a wall's skin bucket more than 1.3 m across (a chunk's box spans under 1.1 m)
  const skinBuckets = new Set(a.storeys[0].faces.map((f) => (f.layers.find((l) => l.material !== 'timber') ?? f.layers[0])?.bucket));
  let slab = 0;
  for (const r of one.runs) {
    if (r.role !== 'rubble' || !skinBuckets.has(r.bucket) || (r.pos.length / 3) % 24) continue; // (boxes only: the skin is a fan)
    for (let i = 0; i + 23 * 3 < r.pos.length; i += 24 * 3) {
      let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < 24; k++) for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], r.pos[i + k * 3 + c]); hi[c] = Math.max(hi[c], r.pos[i + k * 3 + c]); }
      slab = Math.max(slab, Math.hypot(hi[0] - lo[0], hi[2] - lo[2]));
    }
  }
  assert.ok(slab >= 1.3, `${styleId}/${id}: a wall slab lies whole in the pile (${slab.toFixed(2)} m)`);
  falls++; fv += one.mesh.vertices;
}
console.log(`house damage: ${falls} collapses deterministic, within a house's caps (mean ${(fv / falls).toFixed(0)} vertices), the structure hidden, remnants in the footprint, heaps over the mound with stubs over them and the roof's timbers in them`);

// 5. the debris pieces: every shape and variant a small closed mesh inside the unit cube, the same twice
import { damageRng } from '../../destructionKit.ts';
const SHAPES = ['chunk', 'brick', 'block', 'stone', 'plate', 'splinter', 'beam', 'tile', 'slate', 'sheet', 'shard', 'clod', 'straw', 'rebar'];
const piece = kitOf('cottage', 'hessian', 'piece');
let meshes = 0;
for (const shape of SHAPES) for (let variant = 0; variant < 4; variant++) {
  const g = piece('regionalStone', shape, variant, damageRng(9 + variant)), g2 = piece('regionalStone', shape, variant, damageRng(9 + variant));
  const p = g.getAttribute('position');
  assert.ok(p && p.count >= 9 && p.count % 3 === 0, `${shape}/${variant}: a mesh of triangles`);
  assert.deepEqual(Array.from(p.array), Array.from(g2.getAttribute('position').array), `${shape}/${variant}: deterministic`);
  for (const v of p.array) assert.ok(Number.isFinite(v) && Math.abs(v) <= 0.85, `${shape}/${variant}: inside the unit cube (${v})`);
  assert.ok(g.getAttribute('normal') && g.getAttribute('uv') && g.getAttribute('color'), `${shape}/${variant}: normals, uvs and a colour`);
  g.dispose(); g2.dispose(); meshes++;
}
console.log(`house damage: ${meshes} debris pieces (${SHAPES.length} shapes x 4 variants), small meshes inside the unit cube, deterministic`);

// 6. the roof falls (sectionDown on the roof's section): deterministic, within its caps (6,000 vertices, 160 pieces),
// the roof's covering hidden, what is left inside the house's footprint and under its ridge
let roofs = 0, tall = 0;
for (const [styleId, id, wall] of SAMPLE) {
  const style = ARCHITECTURE_STYLES.find((s) => s.id === styleId);
  if (!style?.builders[id]) continue;
  const { parts, w, d, h } = build(style, id, 19, wall);
  const describe = kitOf(id, styleId, 'describe'), sectionDown = kitOf(id, styleId, 'sectionDown');
  const a = describe({ structureIdx: 5, mapId: 'damage', builder: id, style: styleId, parts, w, d, h, placement: { x: 0, y: 0, z: 0, yaw: 0 },
    massClass: 'house', seed: 14, kitPlan: regionalKitPlanOf(parts) });
  if (!a?.roof) continue;
  const [cx, cz] = bodyCentre(a);
  const one = writers(6000, 160), two = writers(6000, 160);
  const res = sectionDown(a, a.roof.section, 31, one), again = sectionDown(a, a.roof.section, 31, two);
  assert.deepEqual(JSON.stringify(two.runs), JSON.stringify(one.runs), `${styleId}/${id}: the roof falls the same way twice`);
  assert.deepEqual(again, res);
  assert.ok(res.hides.some((x) => x.section === null && x.partClass === 'roof'), `${styleId}/${id}: the fallen roof's covering hidden (by its class)`);
  assertFacing(one.runs, `${styleId}/${id} roof`);
  for (const run of one.runs) for (let i = 0; i < run.pos.length; i += 3) {
    const x = run.pos[i] - cx, y = run.pos[i + 1], z = run.pos[i + 2] - cz;
    assert.ok(Math.abs(x) <= a.w / 2 + 1.5 && Math.abs(z) <= a.d / 2 + 1.5, `${styleId}/${id}: the fallen roof inside the footprint (${x.toFixed(2)}, ${z.toFixed(2)})`);
    assert.ok(y <= a.roof.ridgeY + 0.3 && y >= -0.1, `${styleId}/${id}: under the ridge (${y.toFixed(2)} of ${a.roof.ridgeY.toFixed(2)})`);
    // a rafter hangs into the top storey and no further: the floors under it still stand
    assert.ok(y >= a.storeys[a.storeys.length - 1].y0 - 0.05, `${styleId}/${id}: the fallen roof over the top storey's floor (${y.toFixed(2)} under ${a.storeys[a.storeys.length - 1].y0.toFixed(2)})`);
  }
  if (a.storeys.length > 1) tall++;
  roofs++;
}
assert.ok(tall >= 2, `roofs fall on houses of more than one storey (${tall})`);
console.log(`house damage: ${roofs} roofs fall deterministically within their caps, their coverings hidden, what is left under the ridge and over the top storey's floor`);

// 6b. a wall falls (sectionDown on a wall's section): deterministic, within its caps, the section hidden, a stub, the open
// storey behind it and its heap outside, all inside the house's reach, every triangle facing its normal
let walls = 0, wv = 0;
for (const [styleId, id, wall] of SAMPLE) {
  const style = ARCHITECTURE_STYLES.find((s) => s.id === styleId);
  if (!style?.builders[id]) continue;
  const { parts, w, d, h } = build(style, id, 21, wall);
  const describe = kitOf(id, styleId, 'describe'), sectionDown = kitOf(id, styleId, 'sectionDown');
  const a = describe({ structureIdx: 6, mapId: 'damage', builder: id, style: styleId, parts, w, d, h, placement: { x: 0, y: 0, z: 0, yaw: 0 },
    massClass: 'house', seed: 15, kitPlan: regionalKitPlanOf(parts) });
  const [cx, cz] = bodyCentre(a);
  for (const st of a.storeys.slice(0, 2)) for (const f of st.faces) {
    const one = writers(6000, 160), two = writers(6000, 160);
    const res = sectionDown(a, f.section, 33 + walls, one), again = sectionDown(a, f.section, 33 + walls, two);
    assert.deepEqual(JSON.stringify(two.runs), JSON.stringify(one.runs), `${styleId}/${id} ${f.name}: a wall falls the same way twice`);
    assert.deepEqual(again, res);
    assert.ok(res.hides.some((x) => x.section === f.section && x.partClass === null), `${styleId}/${id}: the fallen wall's section hidden`);
    assert.ok(one.runs.some((r) => r.role === 'remnant') && one.runs.some((r) => r.role === 'room') && one.runs.some((r) => r.role === 'rubble'),
      `${styleId}/${id} ${f.name}: a stub, the open storey and a heap`);
    assertFacing(one.runs, `${styleId}/${id} ${f.name} wall`);
    // the stub stands on the presentation's clamp line (the ground storey's metre over the base, an upper storey's floor
    // line): its lowest course at most one course under it, its top at most a pier's height over it
    const clamp = st.index === 0 ? Math.max(st.y0, 1) : st.y0;
    for (const run of one.runs) if (run.role === 'remnant') for (let i = 1; i < run.pos.length; i += 3) {
      assert.ok(run.pos[i] >= clamp - 0.55 && run.pos[i] <= clamp + 1.35, `${styleId}/${id} ${f.name}: the stub on the clamp line (${run.pos[i].toFixed(2)} at ${clamp.toFixed(2)})`);
    }
    for (const run of one.runs) for (let i = 0; i < run.pos.length; i += 3) {
      const x = run.pos[i] - cx, y = run.pos[i + 1], z = run.pos[i + 2] - cz;
      assert.ok(Math.abs(x) <= a.w / 2 + 4.5 && Math.abs(z) <= a.d / 2 + 4.5, `${styleId}/${id}: the fallen wall within reach (${x.toFixed(2)}, ${z.toFixed(2)})`);
      assert.ok(y >= -0.6 && y <= (a.roof?.ridgeY ?? a.h) + 0.5, `${styleId}/${id}: the fallen wall between the ground and the ridge (${y.toFixed(2)})`);
    }
    wv = Math.max(wv, one.mesh.vertices); walls++;
  }
}
console.log(`house damage: ${walls} wall sections fall deterministically within their caps (worst ${wv} vertices), each hidden, a stub on the clamp line, the storey open behind it, a heap outside, every triangle facing its normal`);

// 6c. a storey drops (P2 storeyDown): deterministic, within the section caps, its faces' sections hidden, the storey
// heaped on its floor line (the storey below's top) inside the storey below's walls, every triangle facing its normal.
// Two builds each: a face's name says nothing of its axis (a Franconian row house fronts its street on +x in one of
// them, as Steinburg's strip house g54 does), and the heap must find the floor either way.
let drops = 0, offAxis = 0;
for (const [styleId, id, wall] of SAMPLE) for (const seed of [25, 7]) {
  const style = ARCHITECTURE_STYLES.find((s) => s.id === styleId);
  if (!style?.builders[id]) continue;
  const { parts, w, d, h } = build(style, id, seed, wall);
  const describe = kitOf(id, styleId, 'describe'), storeyDown = kitOf(id, styleId, 'storeyDown');
  const a = describe({ structureIdx: 7, mapId: 'damage', builder: id, style: styleId, parts, w, d, h, placement: { x: 0, y: 0, z: 0, yaw: 0 },
    massClass: 'house', seed: 16, kitPlan: regionalKitPlanOf(parts) });
  if (!a || a.storeys.length < 2) continue;
  assert.ok(storeyDown, `${styleId}/${id}: a storey drop builder`);
  const top = a.storeys[a.storeys.length - 1], below = a.storeys[a.storeys.length - 2];
  const one = writers(6000, 160), two = writers(6000, 160);
  const res = storeyDown(a, top.index, 51, one), again = storeyDown(a, top.index, 51, two);
  assert.deepEqual(JSON.stringify(two.runs), JSON.stringify(one.runs), `${styleId}/${id}: a storey drops the same way twice`);
  assert.deepEqual(again, res);
  assert.deepEqual(res.hides.map((x) => x.section).sort((p, q) => p - q), top.faces.map((f) => f.section).sort((p, q) => p - q), `${styleId}/${id}: the storey's faces hidden`);
  assert.ok(one.runs.filter((r) => r.role === 'rubble').length >= 2, `${styleId}/${id}: the heap and its timbers`);
  assertFacing(one.runs, `${styleId}/${id} storey`);
  const xs = below.faces.map((f) => f.origin[0]), zs = below.faces.map((f) => f.origin[2]);
  for (const run of one.runs) for (let i = 0; i < run.pos.length; i += 3) {
    const x = run.pos[i], y = run.pos[i + 1], z = run.pos[i + 2];
    assert.ok(x >= Math.min(...xs) - 0.3 && x <= Math.max(...xs) + 0.3 && z >= Math.min(...zs) - 0.3 && z <= Math.max(...zs) + 0.3,
      `${styleId}/${id}: the dropped storey on the storey below (${x.toFixed(2)}, ${z.toFixed(2)})`);
    assert.ok(y >= top.y0 - 0.12 && y <= top.y0 + 1.7, `${styleId}/${id}: the heap on the floor line (${y.toFixed(2)} over ${top.y0.toFixed(2)})`);
  }
  assert.equal(storeyDown(a, 0, 51, writers(6000, 160)).hides.length, 0, `${styleId}/${id}: the ground storey never drops`);
  // every storey above the ground drops onto its own floor, not just the top one
  for (const st of a.storeys.slice(1)) {
    const mid = writers(6000, 160);
    assert.ok(storeyDown(a, st.index, 52, mid).hides.length === st.faces.length && mid.runs.some((r) => r.role === 'rubble' && r.pos.length),
      `${styleId}/${id} (seed ${seed}): storey ${st.index} drops onto its floor`);
  }
  if (Math.abs(below.faces.find((f) => f.name === 'front')?.out[0] ?? 0) > 0.7) offAxis++;
  drops++;
}
assert.ok(drops >= 8, `storeys drop on the multi-storey sample (${drops})`);
assert.ok(offAxis >= 1, `a house fronting on x drops its storey too (${offAxis})`);
console.log(`house damage: ${drops} top storeys drop deterministically within their caps (${offAxis} of them fronting on x), their faces hidden, each heaped on its floor line inside the walls below, every storey above the ground onto its own floor, every triangle facing its normal`);

// 7. the seam (DESTRUCTION.md §16.3): the kits' plan reader is registered (the world's describe call sites read the plan
// through kitPlanFor, importing no kit); a collapse seats its heap on the sim's own mound (bodyMoundHeightAt) when the
// world gave one, its skin within a few centimetres of it, wherever and however the house was placed
import { bodyMoundHeightAt, kitPlanFor } from '../../destructionKit.ts';
{
  const style = ARCHITECTURE_STYLES.find((s) => s.id === 'hessian');
  const { parts, w, d, h } = build(style, 'cottage', 23, 'stone');
  assert.equal(kitPlanFor(parts, 'hessian'), regionalKitPlanOf(parts), 'kitPlanFor reads the regional plan');
  const placement = { x: 140, y: 3, z: -60, yaw: 0.7 };
  const a = kitOf('cottage', 'hessian', 'describe')({ structureIdx: 9, mapId: 'damage', builder: 'cottage', style: 'hessian', parts, w, d, h,
    placement, massClass: 'house', seed: 21, kitPlan: kitPlanFor(parts, 'hessian') });
  // the core's footprint: a rectangle round the contact band in its own frame (forward along the longer side)
  a.mound = { cx: placement.x + 0.4, cz: placement.z - 0.3, hw: Math.min(w, d) / 2 + 0.3, hd: Math.max(w, d) / 2 + 0.3, yaw: 0.7 + Math.PI / 2, heightM: 1.9 };
  const one = writers(16000, 240);
  kitOf('cottage', 'hessian', 'collapse')(a, 41, one);
  let skin = 0, worst = 0;
  for (const run of one.runs) {
    if (run.role !== 'rubble') continue;
    for (let i = 0; i < run.pos.length; i += 3) {
      const m = bodyMoundHeightAt(a, run.pos[i], run.pos[i + 2]);
      worst = Math.max(worst, Math.abs(run.pos[i + 1] - m));
      assert.ok(run.pos[i + 1] >= m - 1.2 && run.pos[i + 1] <= m + 2.4, `the heap on the sim's mound (${run.pos[i + 1].toFixed(2)} at ${m.toFixed(2)})`);
    }
    if (run.idx.length && run === one.runs.find((r) => r.role === 'rubble')) skin = run.pos.length / 3;
  }
  assert.ok(skin > 100, `the heap's skin first (${skin} vertices)`);
  console.log(`house damage: the plan reader registered; a collapse seats its heap on the sim's mound (skin ${skin} vertices, worst ${worst.toFixed(2)} m off the profile)`);
}

// 8. a default anatomy (the core's reading of a houseless builder's parts: no kit plan, no masonry layout): the house
// kits' stage builders still dress it — they are the chain's builders for every structure on a kit's map — from the
// faces' own frames, within their caps and deterministic
{
  const style = ARCHITECTURE_STYLES.find((s) => s.id === 'kolkhoz');
  const { parts, w, d, h } = build(style, 'cottage', 31, 'plaster');
  const full = kitOf('cottage', 'kolkhoz', 'describe')({ structureIdx: 11, mapId: 'damage', builder: 'cottage', style: 'kolkhoz', parts, w, d, h,
    placement: { x: 0, y: 0, z: 0, yaw: 0 }, massClass: 'house', seed: 3, kitPlan: regionalKitPlanOf(parts) });
  const bare = { ...full, kit: 'default', kitPlan: undefined,
    storeys: full.storeys.map((st) => ({ ...st, faces: st.faces.map((f) => ({ ...f, masonry: null, members: [] })) })) };
  let stages = 0;
  for (const [member, args, caps] of [['breach', (a) => [a, { section: a.storeys[0].faces[0].section, storey: 0, face: 'front', hole: 0, u: 0.4, y: 1.5,
    radiusM: 0.9, dirX: 0, dirZ: -1, munition: 'he', cause: 'blast', seed: 77 }], [3000, 96]], ['damaged', (a) => [a, 9], [1500, 48]],
  ['collapse', (a) => [a, 5], [16000, 240]], ['sectionDown', (a) => [a, a.roof.section, 6], [6000, 160]]]) {
    const fn = kitOf('cottage', 'kolkhoz', member);
    const one = writers(...caps), two = writers(...caps);
    const res = fn(...args(bare), one), again = fn(...args(bare), two);
    assert.deepEqual(JSON.stringify(two.runs), JSON.stringify(one.runs), `default anatomy: ${member} deterministic`);
    assert.deepEqual(again, res);
    assert.ok(one.mesh.vertices > 0, `default anatomy: ${member} draws something (${one.mesh.vertices} vertices)`);
    stages++;
  }
  console.log(`house damage: a default anatomy (no plan, no masonry layout) dressed by ${stages} stage builders, deterministic, within their caps`);
}
