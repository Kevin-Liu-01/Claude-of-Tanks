// The regional house kits' damage through the destruction seam (the facades lane, 2026-10-07; docs/DESTRUCTION.md §16):
//   - every kit's every builder describes (a house plan gives an anatomy, a builder that built no house gives null:
//     the core's default reads it), with finite numbers, four faces a storey in house.ts's order, members and
//     openings inside their faces, a coursed wall's joints ascending;
//   - a breach on every face of every storey of a sample of houses writes the same bytes twice (damageRng only), stays
//     within the writers' caps (3,000 vertices, 96 pieces), draws its rim inside the cut (plus the 0.3 m the seam allows)
//     and within the wall's layers, its room behind the wall, and cuts one cylinder on the face.
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
    const cut = res.cuts[0];
    assert.ok(cut.radiusM >= r - 1e-9 && cut.radiusM <= r * 1.8 + 1e-9, `${styleId}/${id}: the cut takes the hole (${cut.radiusM} for ${r})`);
    const depth = cut.depthM;
    for (const run of one.runs) {
      for (let i = 0; i < run.pos.length; i += 3) {
        const dx = run.pos[i] - cut.x, dy = run.pos[i + 1] - cut.y, dz = run.pos[i + 2] - cut.z;
        const along = dx * cut.nx + dz * cut.nz, rx = dx - cut.nx * along, rz = dz - cut.nz * along, radial = Math.hypot(rx, dy, rz);
        if (run.role === 'rim') {
          assert.ok(radial <= cut.radiusM + 0.3, `${styleId}/${id} ${f.name}: a rim vertex within 0.3 m of its cut (${radial.toFixed(3)} of ${cut.radiusM.toFixed(3)})`);
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
    for (const c of res.cuts) {
      assert.ok(c.radiusM > 0 && c.radiusM < 0.8 && c.depthM <= 0.06, `${styleId}/${id}: a spall is a small, shallow cut (${c.radiusM}, ${c.depthM})`);
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
  for (const run of one.runs) for (let i = 0; i < run.pos.length; i += 3) {
    const x = run.pos[i] - cx, y = run.pos[i + 1], z = run.pos[i + 2] - cz;
    if (run.role === 'rubble') {
      assert.ok((x / (rx + 0.6)) ** 2 + (z / (rz + 0.6)) ** 2 <= 1.0001, `${styleId}/${id}: rubble inside the mound's footprint (${x.toFixed(2)}, ${z.toFixed(2)})`);
      const m = mound(x + cx, z + cz);
      assert.ok(y >= m - 1.2 && y <= m + 1.6, `${styleId}/${id}: rubble on the mound (${y.toFixed(2)} at ${m.toFixed(2)})`);
    } else if (run.role === 'remnant') {
      assert.ok(Math.abs(x) <= a.w / 2 + 1 && Math.abs(z) <= a.d / 2 + 1, `${styleId}/${id}: the remnant inside the footprint`);
      assert.ok(y <= Math.max(a.storeys[0].y1 + 0.5, ...a.chimneys.map((c) => c.y1)) + 0.05, `${styleId}/${id}: the remnant no taller than its storey or a stack`);
    }
  }
  falls++; fv += one.mesh.vertices;
}
console.log(`house damage: ${falls} collapses deterministic, within a house's caps (mean ${(fv / falls).toFixed(0)} vertices), the structure hidden, remnants in the footprint, heaps on the mound`);

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
let roofs = 0;
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
  assert.ok(res.hides.some((x) => x.section === a.roof.section && x.partClass === 'roof'), `${styleId}/${id}: the fallen roof's covering hidden`);
  for (const run of one.runs) for (let i = 0; i < run.pos.length; i += 3) {
    const x = run.pos[i] - cx, y = run.pos[i + 1], z = run.pos[i + 2] - cz;
    assert.ok(Math.abs(x) <= a.w / 2 + 1.5 && Math.abs(z) <= a.d / 2 + 1.5, `${styleId}/${id}: the fallen roof inside the footprint (${x.toFixed(2)}, ${z.toFixed(2)})`);
    assert.ok(y <= a.roof.ridgeY + 0.3 && y >= -0.1, `${styleId}/${id}: under the ridge (${y.toFixed(2)} of ${a.roof.ridgeY.toFixed(2)})`);
  }
  roofs++;
}
console.log(`house damage: ${roofs} roofs fall deterministically within their caps, their coverings hidden, what is left under the ridge`);
