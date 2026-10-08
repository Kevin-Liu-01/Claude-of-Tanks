// A building's shell read off its parts (shell.ts) and the anatomy the regional kits make of it (damage.ts
// describeShell; the facades lane, 2026-10-08; the coordinator's ruling: houseless buildings get kit-drawn damage, the
// core's default kit a fallback only):
//   1. a box of known walls, plinth, gable roof, window and chimney reads back exactly; a courtyard's corner room, an
//      open frame and a lone wall read as no shell;
//   2. the base set's buildings on a regional map (the works hall, the fire station, the chapel …) and every regional
//      builder that lays no house: the ones the reading takes describe in their kit's materials, with four faces a
//      storey in house.ts's order inside the box, openings inside their faces, roof slabs over the eave; sheet-clad
//      and baked light structures, shafts and open frames stay with the default;
//   3. every stage on every shell (a breach on each face, the damaged stage, each ground face's fall, the roof's fall,
//      each upper storey's drop, the collapse) writes the same bytes twice, within the seam's caps, its vertices finite
//      and inside the body's reach, every triangle facing its normal.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readShell } from './shell.ts';
import { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } from './index.ts';
import { streamFrom } from './geometry.ts';
import { describeStructure, createStructureDamageSeam } from '../../structureDamageSeam.ts';
import '../../destructionDefaultKit.ts';
import { isSheetBody, isSheetFace } from './sheet.ts';
import { shaftOf } from './shaft.ts';
import { URBAN_BUILDERS } from '../urbanKit.ts';
import { VILLAGE_BUILDERS } from '../villageKit.ts';
import { STRUCTURE_BUILDERS } from '../structureKit.ts';

const finite = (v, label) => assert.ok(Number.isFinite(v), `${label}: finite (${v})`);

function writers(vertexCap, pieceCap) {
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

// ---- 1. a known box
{
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const slope = (side) => {
    // a gable pitch over x from the eave (y 6 at x = ±5.3) to the ridge (y 8.5 at x = 0), 15 m along z, 14 cm thick
    const run = Math.hypot(5.3, 2.5), g = new THREE.BoxGeometry(run, 0.14, 15);
    g.rotateZ(side * -Math.atan2(2.5, 5.3));
    return g.translate(side * 2.65, 7.25 + 0.07, 0);
  };
  const parts = {
    regionalStone: [box(10, 6, 14, 0, 3, 0), box(10.4, 0.8, 14.4, 0, 0.4, 0), box(0.8, 3, 0.8, 2, 8, 3)],
    regionalRoof: [slope(1), slope(-1)],
    glass: [box(0.06, 1.4, 1.2, 5.03, 3, -2)],
  };
  // the gable ends: triangles on the ±z planes over the eave
  for (const z of [7, -7]) {
    const g = new THREE.BufferGeometry();
    const s = Math.sign(z);
    const p = s > 0 ? [-5, 6, z, 5, 6, z, 0, 8.4, z] : [5, 6, z, -5, 6, z, 0, 8.4, z];
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.computeVertexNormals();
    parts.regionalStone.push(g);
  }
  const r = readShell(parts);
  assert.ok(r, 'a walled box reads as a shell');
  const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b}`);
  near(r.x0, -5, 0.05, 'x0'); near(r.x1, 5, 0.05, 'x1'); near(r.z0, -7, 0.05, 'z0'); near(r.z1, 7, 0.05, 'z1');
  near(r.eave, 6, 0.05, 'the eave is the side walls\' top (the gable ends run to the ridge)');
  near(r.base, 0, 0.05, 'the walls\' foot');
  assert.deepEqual(r.faces.map((f) => f.name), ['front', 'right', 'back', 'left'], 'faces in house.ts order');
  assert.ok(r.faces.every((f) => f.bucket === 'regionalStone' && f.coverage > 0.8), 'every wall built in its bucket');
  assert.ok(r.plinth && r.plinth.h > 0.6 && r.plinth.h < 0.9 && r.plinth.out > 0.15 && r.plinth.out < 0.25, `the plinth (${JSON.stringify(r.plinth)})`);
  assert.equal(r.roof?.kind, 'gable', 'a gable roof');
  assert.equal(r.roof.slabs.length, 2, 'two pitches');
  for (const s of r.roof.slabs) for (const c of s) assert.ok(c[1] >= 5.9, 'every slab corner over the eave');
  near(r.roof.ridgeY, 8.5 + 0.07, 0.2, 'the ridge');
  const right = r.faces[1];
  assert.equal(right.openings.length, 1, 'the window on the right wall');
  near(right.openings[0].u, 2, 0.05, 'the window along the right wall (u runs to −z)');
  near(right.openings[0].y0, 2.3, 0.05, 'the window over the floor');
  assert.equal(r.chimneys.length, 1, 'the chimney over the roof');
  near(r.chimneys[0].x, 2, 0.05, 'the chimney x'); near(r.chimneys[0].y1, 9.5, 0.05, 'the chimney top');
  // not shells: a courtyard building's corner room beside long open walls, an open frame, a lone wall
  assert.equal(readShell({ regionalStone: [box(4, 6, 4, -8, 3, -8), box(20, 3, 0.3, 0, 1.5, 9), box(0.3, 3, 20, 9, 1.5, 0)] }), null, 'a corner room of a larger body');
  assert.equal(readShell({ structureMetal: [box(0.3, 8, 0.3, -4, 4, -4), box(0.3, 8, 0.3, 4, 4, -4), box(0.3, 8, 0.3, -4, 4, 4), box(0.3, 8, 0.3, 4, 4, 4), box(8.3, 0.4, 8.3, 0, 8, 0)] }), null, 'an open frame');
  assert.equal(readShell({ regionalStone: [box(12, 3, 0.4, 0, 1.5, 0)] }), null, 'a lone wall');
  console.log('shell damage: a known box reads back its walls, eave, plinth, gable, window and chimney; a corner room, an open frame and a lone wall read as no shell');
}

// ---- 2 and 3. the base set on a regional map, and every regional builder that lays no house
const CAPS = { breach: [3000, 96], damaged: [3000, 48], sectionDown: [6000, 160], storeyDown: [6000, 160], collapse: [16000, 240] };
let shells = 0, defaults = 0, stages = 0, sheetShells = 0, shaftShells = 0;
const shellIds = new Set(), defaultIds = new Set(), shaftIds = new Set();
function exercise(label, a, seam) {
  // (the body's own middle: a shell's walls need not centre on its parts' origin)
  const fo = a.storeys[0].faces.map((f) => f.origin);
  const mx = fo.reduce((s, o) => s + o[0], 0) / fo.length, mz = fo.reduce((s, o) => s + o[2], 0) / fo.length;
  // (a shaft topples: its drums lie along the ground as far as it stood tall)
  const shaftH = shaftOf(a) ? a.storeys[a.storeys.length - 1].y1 - a.storeys[0].y0 : 0;
  const reach = Math.max(a.w, a.d) / 2 + 6 + shaftH * 1.15;
  const check = (name, run, cap) => {
    const one = writers(...cap), two = writers(...cap);
    const res = run(one), again = run(two);
    assert.deepEqual(JSON.stringify(two.runs), JSON.stringify(one.runs), `${label} ${name}: the same twice`);
    assert.deepEqual(again, res, `${label} ${name}: the same result twice`);
    assertFacing(one.runs, `${label} ${name}`);
    for (const r of one.runs) for (let i = 0; i < r.pos.length; i += 3) {
      assert.ok(Math.abs(r.pos[i] - mx) <= reach && Math.abs(r.pos[i + 2] - mz) <= reach && r.pos[i + 1] >= -2 && r.pos[i + 1] <= a.h + 3,
        `${label} ${name}: a vertex within the body's reach (${r.pos[i].toFixed(2)}, ${r.pos[i + 1].toFixed(2)}, ${r.pos[i + 2].toFixed(2)})`);
    }
    stages++;
  };
  for (const st of a.storeys) for (const f of st.faces) {
    const hole = { section: f.section, storey: st.index, face: f.name, hole: 0, u: f.width * 0.18, y: Math.min(f.height - 0.6, 1.5), radiusM: 0.9,
      dirX: -f.out[0], dirZ: -f.out[2], munition: 'he', cause: 'blast', seed: 7 + f.section };
    check(`breach ${f.name}/${st.index}`, (o) => seam.breach(hole, o), CAPS.breach);
  }
  check('damaged', (o) => seam.damaged(31, o), CAPS.damaged);
  for (const f of a.storeys[0].faces) check(`fall ${f.name}`, (o) => seam.sectionDown(f.section, 41 + f.section, o), CAPS.sectionDown);
  if (a.roof) check('roof falls', (o) => seam.sectionDown(a.roof.section, 51, o), CAPS.sectionDown);
  for (const st of a.storeys.slice(1)) check(`storey ${st.index} drops`, (o) => seam.storeyDown(st.index, 61 + st.index, o), CAPS.storeyDown);
  check('collapse', (o) => seam.collapse(71, o), CAPS.collapse);
}
function validate(label, a, styleId) {
  assert.equal(a.kit, styleId, `${label}: the regional kit describes it`);
  for (const st of a.storeys) {
    assert.deepEqual(st.faces.map((f) => f.name), ['front', 'right', 'back', 'left'], `${label}: faces in house.ts order`);
    assert.ok(st.y1 > st.y0, `${label}: storey ${st.index} has height`);
    assert.deepEqual(st.faces.map((f) => f.section), [0, 1, 2, 3].map((k) => st.index * 4 + k), `${label}: sections by storey and face`);
    for (const f of st.faces) {
      for (const v of [...f.origin, ...f.u, ...f.out, f.width, f.height]) finite(v, `${label} face`);
      assert.ok(Math.abs(Math.abs(f.origin[0]) - (Math.abs(f.out[0]) > 0.5 ? a.w / 2 : 0)) < a.w + 1, `${label}: a face on the box`);
      assert.ok(f.layers.length >= 1 && f.layers.every((l) => l.thicknessM > 0), `${label}: a face's layers`);
      for (const o of f.openings) assert.ok(Math.abs(o.u) <= f.width / 2 + 0.05 && o.y0 >= -0.05 && o.y0 + o.h <= f.height + 0.05, `${label}: an opening inside its face`);
      if (f.masonry) {
        const c = f.masonry.courses;
        assert.ok(c[0] === 0 && c.every((y, i) => i === 0 || y > c[i - 1]), `${label}: courses ascending from the floor`);
        for (let k = 0; k < Math.min(4, c.length); k++) {
          const j = f.masonry.joints(k);
          assert.ok(j.every((u, i) => i === 0 || u > j[i - 1]) && j.every((u) => Math.abs(u) < f.width / 2), `${label}: joints ascending inside the face`);
        }
      }
    }
  }
  if (a.roof) {
    assert.equal(a.roof.section, a.storeys.length * 4, `${label}: the roof's section follows the walls'`);
    // (an eave's overhang hangs below the wall top by its run times the pitch)
    for (const s of a.roof.slabs) for (const c of s.corners) assert.ok(c[1] >= a.roof.eaveY - 1.2, `${label}: a roof slab over the eave (${c[1].toFixed(2)} vs ${a.roof.eaveY.toFixed(2)})`);
  }
  assert.ok(a.rubble.length && Math.abs(a.rubble.reduce((s, r) => s + r.share, 0) - 1) < 1e-6, `${label}: the pile's shares sum to one`);
}
function describeAndRun(label, builder, styleId, parts) {
  let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity, mxy = 0;
  for (const list of Object.values(parts)) for (const g of list) {
    g.computeBoundingBox();
    const b = g.boundingBox;
    if (b.isEmpty()) continue;
    mnx = Math.min(mnx, b.min.x); mxx = Math.max(mxx, b.max.x); mnz = Math.min(mnz, b.min.z); mxz = Math.max(mxz, b.max.z); mxy = Math.max(mxy, b.max.y);
  }
  const a = describeStructure({ structureIdx: 2, mapId: 'shell', builder, style: styleId, parts, w: mxx - mnx, d: mxz - mnz, h: mxy,
    placement: { x: 0, y: 0, z: 0, yaw: 0 }, massClass: 'house' });
  if (a.kit === 'default') { defaults++; defaultIds.add(label.split(' ')[0]); return; }
  shells++; shellIds.add(label.split(' ')[0]);
  validate(label, a, styleId);
  const seam = createStructureDamageSeam(2, builder, styleId, a, []);
  exercise(label, a, seam);
  if (shaftOf(a)) {
    shaftShells++; shaftIds.add(label.split(' ')[0]);
    const shaftH = a.storeys[a.storeys.length - 1].y1 - a.storeys[0].y0;
    // the topple: a stump over the heap at the foot, drums along the ground beyond it
    const out = writers(...CAPS.collapse);
    seam.collapse(9, out);
    const far = out.runs.filter((r) => r.role === 'rubble').reduce((m, r) => {
      for (let i = 0; i < r.pos.length; i += 3) m = Math.max(m, Math.hypot(r.pos[i] - a.storeys[0].faces[0].origin[0], r.pos[i + 2] - a.storeys[0].faces[1].origin[2]));
      return m;
    }, 0);
    assert.ok(far > shaftH * 0.6, `${label}: the shaft lies along the ground (${far.toFixed(1)} m out of ${shaftH.toFixed(1)})`);
    assert.ok(out.runs.some((r) => r.role === 'remnant' && r.pos.length), `${label}: a stump stands`);
  }
  if (isSheetBody(a)) {
    sheetShells++;
    // a blast through a sheet wall: torn sheet round it (both sides), the frame's members across the gap, no masonry
    // (a point of plain sheet: clear of every opening by the hole and a half metre)
    let spot = null;
    for (const x of a.storeys[0].faces) {
      if (!isSheetFace(x) || x.width < 4 || x.height < 3) continue;
      for (let u = -x.width / 2 + 1.6; u <= x.width / 2 - 1.6 && !spot; u += 0.5) {
        for (let y = 1.6; y <= x.height - 1.2 && !spot; y += 0.5) {
          if (!x.openings.some((o) => Math.abs(u - o.u) < o.w / 2 + 1.6 && y > o.y0 - 1.6 && y < o.y0 + o.h + 1.6)) spot = { f: x, u, y };
        }
      }
      if (spot) break;
    }
    if (spot) {
      const { f } = spot;
      const out = writers(...CAPS.breach);
      seam.breach({ section: f.section, storey: 0, face: f.name, hole: 0, u: spot.u, y: spot.y, radiusM: 1.1,
        dirX: -f.out[0], dirZ: -f.out[2], munition: 'he', cause: 'blast', seed: 5 }, out);
      assert.ok(out.runs.some((r) => r.role === 'rim' && r.bucket === f.layers[0].bucket && r.pos.length >= 60), `${label}: the sheet torn round the hole`);
      assert.ok(out.runs.filter((r) => r.role === 'rim').reduce((n, r) => n + r.pos.length / 3, 0) >= 120, `${label}: the sheet and the frame behind it`);
      assert.ok(out.runs.some((r) => r.role === 'room'), `${label}: the dark hall behind the hole`);
    }
  }
}
function seeded(initial) {
  let state = initial >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
const BASE_BUCKETS = ['plaster', 'plaster2', 'plaster3', 'stone', 'roof', 'wood', 'dark', 'glass', 'curtain', 'straw', 'baked'];
for (const seed of [0x51a7c7, 0xa1139e]) {
  for (const [id, build] of Object.entries({ ...VILLAGE_BUILDERS, ...URBAN_BUILDERS, ...STRUCTURE_BUILDERS })) {
    const buckets = Object.fromEntries(BASE_BUCKETS.map((name) => [name, []]));
    build(seeded(seed), buckets, 'plaster');
    describeAndRun(`base:${id} (seed ${seed.toString(16)})`, id, 'franconian', buckets);
  }
}
const baseShells = [...shellIds].filter((x) => x.startsWith('base:'));
for (const id of ['base:factory', 'base:firestation']) assert.ok(shellIds.has(id), `${id}: the works hall and the fire station read as shells`);
for (const style of ARCHITECTURE_STYLES) {
  for (const id of Object.keys(style.builders)) {
    for (const [w, d, h, seed] of [[10, 12, 7, 7], [14, 22, 9, 25]]) {
      const parts = buildRegionalParts(style, { structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
        wallBucket: 'plaster', rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId: 'shell', snowCap: false, tier: 'desktop' }, streamFrom(seed * 3 + 5));
      // a build with a house plan is the house kits' (houseDamage.selftest.mjs)
      if (regionalKitPlanOf(parts)?.houses?.length) continue;
      describeAndRun(`${style.id}/${id} (${w}x${d})`, id, style.id, parts);
    }
  }
}
for (const id of ['polder/barn', 'siwa/adobe', 'shanghai/rowhouse']) assert.ok(shellIds.has(id), `${id}: reads as a shell`);
// the sheet-clad halls read as shells and break by the sheet kit (sheet.ts: their sheet torn, their frame standing)
for (const id of ['kyushu/warehouse', 'wadirum/warehouse', 'glencanyon/warehouse']) assert.ok(shellIds.has(id), `${id}: a sheet-clad hall reads as a shell`);
assert.ok(sheetShells >= 8, `sheet-clad shells broken by the sheet kit (${sheetShells})`);
// the shafts read as shafts and topple (shaft.ts)
for (const id of ['saar/stack', 'ruhr/stack', 'saar/watertower']) assert.ok(shaftIds.has(id), `${id}: a shaft the kit reads (${[...shaftIds].join(', ')})`);
assert.ok(shaftShells >= 6, `shafts the kit topples (${shaftShells})`);
for (const id of ['saar/gantry', 'ksar/caravanserai']) {
  assert.ok(!shellIds.has(id), `${id}: left to the default (an open frame, a courtyard)`);
}
assert.ok(shells >= 50, `the shells the kits now draw (${shells})`);
console.log(`shell damage: ${shells} builds read as shells in their kit's materials, ${sheetShells} of them sheet-clad halls the sheet kit breaks, ${shaftShells} shafts it topples (${[...shaftIds].join(', ')}; ${baseShells.length} of the base set's buildings: ${baseShells.map((x) => x.slice(5)).join(', ')}), ${defaults} left to the default; ${stages} stages deterministic, within the caps, inside the body's reach, every triangle facing its normal`);
