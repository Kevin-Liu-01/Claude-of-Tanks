// The facade craft's three laws (facades lane, 2026-10-05; maps/regional/facade.ts), for every registered kit's every
// builder on a few seeds and wall families, a desktop build with the craft against the same build without it:
//   - DRESSING ONLY: the structural geometry (every part that is not noCollision: the collision's input,
//     structureCollision.ts) is byte for byte the same — the craft adds no structure and moves none — and so is the
//     phone's;
//   - DESKTOP ONLY: a phone's build is byte for byte the craftless build's of a phone;
//   - OWN STREAMS: the building's build and look streams draw exactly as often with the craft as without it, so no
//     choice of the kit (a window's shutters, the dormer's place, a panel's wash) moves under the craft; every part the
//     kit built without the craft is there with it (the craft only adds);
// and the craft itself: the paint channel never reaches the merge (the weathering pass consumes it), a straw roof gets
// its courses, a carved khata its nalichniki, a Franconian render front its trims, the desktop triangles stay in budget.
import assert from 'node:assert/strict';
import { ARCHITECTURE_STYLES, buildRegionalParts } from './index.ts';
import { PartSink, streamFrom } from './geometry.ts';
import { dressedQuoin, setFacadeCraft, thatchCourses, withFacade } from './facade.ts';
import { paintDressedStoneBuffers, paintLimewash, paintNipaThatch, paintRegionalSurfaceBuffers } from '../../regionalSurfaces.ts';
import { withGroundCoverHoles } from '../../sceneryPlan.ts';

const BUDGET = 12000;
function counted(seed) {
  const inner = streamFrom(seed);
  const stream = () => { stream.draws++; return inner(); };
  stream.draws = 0;
  return stream;
}
function build(style, id, seed, wallBucket, tier, ground) {
  const [w, d, h] = [7 + (seed % 5), 9 + (seed % 7), 6];
  const rng = counted(seed), variant = counted(seed * 7 + 3);
  const parts = buildRegionalParts(style, { structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
    wallBucket, rng, variant, mapId: 'facade', snowCap: false, tier, ...(ground ? { ground } : {}) }, streamFrom(seed * 3 + 5));
  return { parts, draws: rng.draws, looks: variant.draws };
}
function structure(parts) {
  const out = [];
  for (const [bucket, list] of Object.entries(parts)) for (const g of list) {
    if (g.userData.noCollision) continue;
    out.push([bucket, Buffer.from(g.getAttribute('position').array.buffer).toString('base64')]);
  }
  return out;
}

function everything(parts) {
  const out = [];
  for (const [bucket, list] of Object.entries(parts)) for (const g of list) {
    for (const name of Object.keys(g.attributes).sort()) out.push([bucket, name, Buffer.from(g.getAttribute(name).array.buffer).toString('base64')]);
  }
  return out;
}
function roles(parts) {
  const out = {};
  for (const [bucket, list] of Object.entries(parts)) for (const g of list) {
    const key = `${bucket}|${g.userData.noCollision ? (g.userData.fine ? 'f' : 'd') : 's'}`;
    out[key] = (out[key] ?? 0) + g.getAttribute('position').count;
  }
  return out;
}

let builds = 0, crafted = 0, worst = 0;
const seen = { straw: 0, carved: 0, trims: 0 };
for (const style of ARCHITECTURE_STYLES) {
  for (const id of Object.keys(style.builders)) {
    for (const [seed, wall] of [[11, 'stone'], [29, 'plaster2'], [47, 'plaster'], [83, 'plaster3']]) {
      const desk = build(style, id, seed, wall, 'desktop'), mob = build(style, id, seed, wall, 'mobile');
      setFacadeCraft(false);
      const plain = build(style, id, seed, wall, 'desktop'), plainMob = build(style, id, seed, wall, 'mobile');
      setFacadeCraft(true);
      assert.deepEqual(structure(desk.parts), structure(plain.parts), `${style.id}/${id} seed ${seed}: the craft adds and moves no structure`);
      assert.deepEqual(structure(desk.parts), structure(mob.parts), `${style.id}/${id} seed ${seed}: the phone's structure is the desktop's`);
      assert.deepEqual(everything(mob.parts), everything(plainMob.parts), `${style.id}/${id} seed ${seed}: a phone builds no craft`);
      assert.equal(desk.draws, plain.draws, `${style.id}/${id} seed ${seed}: the build stream draws as often under the craft (${desk.draws} vs ${plain.draws})`);
      assert.equal(desk.looks, plain.looks, `${style.id}/${id} seed ${seed}: the look stream draws as often under the craft`);
      // every vertex the kit built without the craft is there with it, in its bucket and role (the craft only adds)
      for (const [key, count] of Object.entries(roles(plain.parts))) {
        assert.ok((roles(desk.parts)[key] ?? 0) >= count, `${style.id}/${id} seed ${seed}: ${key} keeps its ${count} vertices under the craft`);
      }
      let tris = 0, mtris = 0;
      for (const list of Object.values(desk.parts)) for (const g of list) {
        assert.ok(!g.getAttribute('tint') && !g.getAttribute('shade'), `${style.id}/${id}: the paint and occlusion records never reach the merge`);
        tris += g.getAttribute('position').count / 3;
      }
      for (const list of Object.values(mob.parts)) for (const g of list) mtris += g.getAttribute('position').count / 3;
      assert.ok(tris <= BUDGET, `${style.id}/${id} seed ${seed}: ${tris} desktop triangles within ${BUDGET}`);
      if (tris > mtris) crafted++;
      worst = Math.max(worst, tris);
      if (desk.parts.straw.some((g) => g.userData.noCollision)) seen.straw++;
      if (style.id === 'kolkhoz' && id === 'cottage' && desk.parts.structureWood.reduce((n, g) => n + g.getAttribute('position').count, 0)
        > mob.parts.structureWood.reduce((n, g) => n + g.getAttribute('position').count, 0) + 300) seen.carved++;
      if (style.id === 'franconian' && id === 'rowhouse' && desk.parts.regionalStone.length > mob.parts.regionalStone.length) seen.trims++;
      for (const g of [desk, mob, plain, plainMob].flatMap((b) => Object.values(b.parts).flat())) g.dispose();
      builds++;
    }
  }
}
assert.ok(seen.straw > 0, 'the straw roofs carry their courses on a desktop build');
assert.ok(seen.carved > 0, 'the khatas carry their carved surrounds on a desktop build');
assert.ok(seen.trims > 0, 'the Franconian town fronts carry their trims on a desktop build');
assert.ok(crafted > builds / 2, `most builds carry the craft on a desktop build (${crafted} of ${builds})`);
console.log(`facade craft: ${builds} builds — structure byte for byte without the craft and on a phone, a phone's build craftless, the build and look streams unmoved, `
  + `${crafted} crafted, worst ${worst} desktop triangles`);

// The wave-116 surfaces (2026-10-05): the khatas' lime-wash and a town's dressed stone — deterministic, in range and
// seamless (the wrap from the last column or row into the first no harsher than the harshest interior neighbours), as
// regionalArchitecture.selftest holds the kits' roof and stone prints
const seamless = (label, size, px) => {
  const lum = (x, y) => { const j = (y * size + x) * 4; return px[j] + px[j + 1] + px[j + 2]; };
  const col = (x0, x1) => { let d = 0; for (let y = 0; y < size; y++) d += Math.abs(lum(x0, y) - lum(x1, y)); return d; };
  const row = (y0, y1) => { let d = 0; for (let x = 0; x < size; x++) d += Math.abs(lum(x, y0) - lum(x, y1)); return d; };
  let colMax = 0, rowMax = 0;
  for (let k = 0; k + 1 < size; k++) { colMax = Math.max(colMax, col(k, k + 1)); rowMax = Math.max(rowMax, row(k, k + 1)); }
  assert.ok(col(size - 1, 0) <= colMax * 1.15, `${label}: the tile wraps across u without a seam`);
  assert.ok(row(size - 1, 0) <= rowMax * 1.15, `${label}: the tile wraps across v without a seam`);
};
for (const seed of [0x11a1, 0x11a2]) {
  const a = paintLimewash(256, seed), b = paintLimewash(256, seed);
  assert.deepEqual(Buffer.from(a.px.buffer), Buffer.from(b.px.buffer), 'lime-wash: deterministic pixels');
  assert.ok(a.hgt.every((v) => v >= 0 && v <= 1), 'lime-wash: height in range');
  // soft: no pixel far from the coat's mean (a render with no pebbles, no joints)
  let sum = 0, max = 0;
  for (let i = 0; i < a.px.length; i += 4) sum += a.px[i];
  const mean = sum / (a.px.length / 4);
  for (let i = 0; i < a.px.length; i += 4) max = Math.max(max, Math.abs(a.px[i] - mean));
  assert.ok(max < 48, `lime-wash: a soft coat (largest departure ${max.toFixed(1)} levels)`);
  seamless(`lime-wash ${seed.toString(16)}`, 256, a.px);
}
{
  const run = (g) => { let s = g.next(); while (!s.done) s = g.next(); return s.value; };
  const a = run(paintDressedStoneBuffers('sandstone', [0.64, 0.52, 0.42], 0x51a7));
  const b = run(paintDressedStoneBuffers('sandstone', [0.64, 0.52, 0.42], 0x51a7));
  assert.deepEqual(Buffer.from(a.px.buffer), Buffer.from(b.px.buffer), 'dressed stone: deterministic pixels');
  seamless('dressed stone', a.size, a.px);
}
console.log('facade surfaces: the lime-wash and the dressed stone deterministic, soft and seamless');

// The nipa atap (facades lane, 2026-10-08; gauntlet wave 260 on Mangrove Reach: the Ca Mau hamlet's roofs read as "brown
// shingle gable roofs"): the print is deterministic, in range and seamless, and its rows are a hand's width of leaf, not
// shingle courses: down the slope (the tile's u) the mean light of a column swings sixteen times a tile, the strongest
// period by far (the straw print's six 37 cm courses would put it at six)
{
  const a = paintNipaThatch(512, 0x7a7c4), b = paintNipaThatch(512, 0x7a7c4);
  assert.deepEqual(Buffer.from(a.px.buffer), Buffer.from(b.px.buffer), 'nipa: deterministic pixels');
  assert.ok(a.hgt.every((v) => v >= 0 && v <= 1), 'nipa: height in range');
  seamless('nipa', 512, a.px);
  const profile = new Float64Array(512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) { const j = (y * 512 + x) * 4; profile[x] += a.px[j] + a.px[j + 1] + a.px[j + 2]; }
  const power = (k) => {
    let re = 0, im = 0;
    for (let x = 0; x < 512; x++) { re += profile[x] * Math.cos(2 * Math.PI * k * x / 512); im += profile[x] * Math.sin(2 * Math.PI * k * x / 512); }
    return re * re + im * im;
  };
  const rows = power(16);
  for (let k = 1; k <= 12; k++) assert.ok(rows > power(k) * 4, `nipa: the leaf rows (16 a tile) outweigh a ${k}-a-tile period fourfold`);
  // a weathered leaf: a grey-tan of middling light, half the straw print's chroma (its ochre measures (r - b) / (r + b) 0.4)
  let r = 0, g = 0, bl = 0;
  for (let i = 0; i < a.px.length; i += 4) { r += a.px[i]; g += a.px[i + 1]; bl += a.px[i + 2]; }
  const n = a.px.length / 4;
  r /= n; g /= n; bl /= n;
  assert.ok(r > 70 && r < 130 && (r - bl) / (r + bl) < 0.2, `nipa: a weathered grey-tan (mean ${r.toFixed(0)}, ${g.toFixed(0)}, ${bl.toFixed(0)})`);
}
// a nipa slope's thatch craft is its one frayed eave course: on a 4 m slope at 35 degrees the courses stay within its
// lowest 0.45 m of rise (a 'rows' slope puts its lips up to two thirds of the way to the ridge)
{
  const courses = (opts) => {
    const sink = new PartSink([0.3, 0.7]);
    const n = [Math.sin(35 * Math.PI / 180), Math.cos(35 * Math.PI / 180), 0];
    thatchCourses(sink, 'straw', [0, 0, 0], [0, 0, 6], [-3.277, 2.294, 0], [-3.277, 2.294, 6], n, opts);
    let top = -Infinity, verts = 0;
    for (const g of sink.finish().straw ?? []) {
      const p = g.getAttribute('position');
      for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
      verts += p.count;
    }
    return { top, verts };
  };
  const nipa = courses({ verges: true, nipa: true }), rows = courses({ verges: true, stepped: false });
  assert.ok(nipa.verts > 0 && nipa.top < 0.45, `nipa: the eave course alone (its top ${nipa.top.toFixed(2)} m over the eave)`);
  assert.ok(rows.top > 1.2, `rows: course lips up the slope (${rows.top.toFixed(2)} m)`);
  const mekong = ARCHITECTURE_STYLES.find((st) => st.id === 'mekong');
  assert.equal(mekong.surfaces.thatch?.kind, 'nipa', 'the Mekong kit prints its thatch as nipa');
}
console.log('facade surfaces: the nipa atap deterministic, seamless, sixteen leaf rows a tile; a nipa slope keeps one eave course');

// (facades lane, 2026-10-06; wave 172: "corner stones built from brick strips instead of dressed sandstone") a dressed
// quoin's two outer faces wrap one whole stone of the style's tile: every texel they map is inside one block of the
// painted tile, clear of its joints (the painter's height field: joints sit near 0.1, a stone's face above 0.15), at a
// scale between the tile's own and ~2.3x; a phone, and a bucket other than the stone, keep the plain quoin's mapping
{
  const run = (g) => { let st = g.next(); while (!st.done) st = g.next(); return st.value; };
  const cases = [['sandstone', true, [0.64, 0.52, 0.42]], ['sandstone', false, [0.58, 0.36, 0.30]], ['limestone', false, [0.83, 0.79, 0.70]],
    ['granite', false, [0.58, 0.55, 0.5]]];
  let quoins = 0;
  for (const [kind, dressed, tint] of cases) {
    const tile = dressed ? run(paintDressedStoneBuffers(kind, tint, 0x51a7)) : run(paintRegionalSurfaceBuffers('stone', kind, tint, 0x51a7));
    const S = tile.size;
    for (let k = 0; k < 24; k++) {
      const sx = k & 1 ? 1 : -1, sz = k & 2 ? 1 : -1, long = (k >> 2) & 1;
      const lx = long ? 0.56 : 0.32, lz = long ? 0.32 : 0.56, x = 3.1 * sx, z = 4.4 * sz, y = 0.4 + 0.42 * k;
      const sink = new PartSink([k * 0.37 + 0.11, k * 0.53 + 0.29]);
      const box = [sx > 0 ? x - lx : x - 0.035, y, sz > 0 ? z - lz : z - 0.035, sx > 0 ? x + 0.035 : x + lx, y + 0.4, sz > 0 ? z + 0.035 : z + lz];
      withFacade({ tier: 'desktop', rng: streamFrom(k + 1), stone: { kind, dressed } }, () => dressedQuoin(sink, 'stone', ...box, sx, sz, { decor: true }));
      const geo = sink.finish().stone.find((g) => !g.userData.fine);
      assert.ok(geo, `${kind}: the quoin's outer faces stay coarse`);
      const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), uv = geo.getAttribute('uv');
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, outer = 0;
      for (let i = 0; i < pos.count; i++) {
        // the two outer faces (normal along +-x toward sx, or +-z toward sz)
        if (!(nor.getX(i) * sx > 0.9 || nor.getZ(i) * sz > 0.9)) continue;
        outer++;
        u0 = Math.min(u0, uv.getX(i)); u1 = Math.max(u1, uv.getX(i)); v0 = Math.min(v0, uv.getY(i)); v1 = Math.max(v1, uv.getY(i));
      }
      assert.ok(outer >= 12, `${kind}: both outer faces found (${outer} corners)`);
      const scale = (v1 - v0) / 0.4;
      assert.ok(scale >= 0.22 - 1e-6 && scale <= 0.5 + 1e-6, `${kind}: the stone at 0.22-0.5 tiles a metre (${scale.toFixed(3)})`);
      assert.ok(Math.abs((u1 - u0) - scale * (lx + lz + 0.07)) < 1e-3, `${kind}: the faces wrap the corner unstretched`);
      // every texel of the window on the painted tile: inside one stone
      const fx = (u) => ((u % 1) + 1) % 1;
      let minH = Infinity;
      for (let a = 0; a <= 16; a++) for (let b = 0; b <= 8; b++) {
        const u = u0 + (u1 - u0) * a / 16, v = v0 + (v1 - v0) * b / 8;
        const px = Math.min(S - 1, Math.floor(fx(u) * S)), py = Math.min(S - 1, Math.floor((1 - fx(v)) * S));
        minH = Math.min(minH, tile.hgt[py * S + px]);
      }
      assert.ok(minH > 0.15, `${kind}${dressed ? ' dressed' : ''} quoin ${k}: its window holds no joint (lowest height ${minH.toFixed(3)})`);
      quoins++;
    }
  }
  // a phone's quoin and a render quoin keep the world mapping
  const plain = (tier, bucket) => {
    const sink = new PartSink([0.3, 0.7]);
    withFacade({ tier, rng: streamFrom(5), stone: { kind: 'sandstone', dressed: true } }, () => dressedQuoin(sink, bucket, 2.5, 0.4, 3.6, 3.1, 0.8, 4.0, 1, 1, { decor: true }));
    const ref = new PartSink([0.3, 0.7]);
    ref.quoin(bucket, 2.5, 0.4, 3.6, 3.1, 0.8, 4.0, 1, 1, { decor: true });
    const a = sink.finish()[bucket].map((g) => Buffer.from(g.getAttribute('uv').array.buffer).toString('base64'));
    const b = ref.finish()[bucket].map((g) => Buffer.from(g.getAttribute('uv').array.buffer).toString('base64'));
    assert.deepEqual(a, b, `a ${tier} ${bucket} quoin keeps the plain mapping`);
  };
  plain('mobile', 'stone');
  plain('desktop', 'plaster');
  console.log(`facade dressed quoins: ${quoins} quoins on four tiles each wrap one whole stone, clear of its joints`);
}

// (facades lane, 2026-10-07; wave 199: "buildings rise straight out of untouched lawn or bare dirt, with no plinth, path
// or splash zone") a placed building's wall-foot strip lies on its ground. Built on a sloping, rolling ground: the
// structure is byte for byte the bare build's and the build and look streams draw as often; every vertex the strip lays
// sits 3 cm over the ground under it (a door's path 4 cm), in runs no longer than 1.5 m; every vertex the bare build's
// level strip had is gone (its 4 cm top, its path and its lips); the discs it keeps the ground cover off hold every vertex
// it laid; a phone builds the same with a ground as without and asks for no holes; and the world's admission
// (sceneryPlan withGroundCoverHoles, gridded past 64 holes) answers every point as a scan of the holes does.
{
  const groundAt = (x, z) => 0.35 + 0.06 * x - 0.04 * z + 0.12 * Math.sin(x * 0.7) * Math.cos(z * 0.5);
  const verts = (parts) => {
    const out = new Map();
    for (const [bucket, list] of Object.entries(parts)) for (const g of list) {
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const key = `${bucket}|${pos.getX(i).toFixed(4)}|${pos.getY(i).toFixed(4)}|${pos.getZ(i).toFixed(4)}`;
        out.set(key, [pos.getX(i), pos.getY(i), pos.getZ(i)]);
      }
    }
    return out;
  };
  let skirted = 0, laid = 0, allHoles = [], longest = 0;
  const kinds = new Set();
  for (const style of ARCHITECTURE_STYLES) {
    for (const id of Object.keys(style.builders)) {
      const seed = 61, wall = 'plaster';
      const holes = [];
      const ground = { at: groundAt, hole: (x, z, r) => holes.push({ x, z, r }) };
      const flat = build(style, id, seed, wall, 'desktop'), laidOn = build(style, id, seed, wall, 'desktop', ground);
      assert.deepEqual(structure(laidOn.parts), structure(flat.parts), `${style.id}/${id}: the ground moves no structure`);
      assert.equal(laidOn.draws, flat.draws, `${style.id}/${id}: the build stream draws as often on the ground`);
      assert.equal(laidOn.looks, flat.looks, `${style.id}/${id}: the look stream draws as often on the ground`);
      const a = verts(flat.parts), b = verts(laidOn.parts);
      const added = [...b].filter(([k]) => !a.has(k)).map(([k, p]) => [k.split('|')[0], p]);
      const removed = [...a].filter(([k]) => !b.has(k)).map(([, p]) => p);
      for (const p of removed) {
        assert.ok([0.04, 0.05, -0.3, -0.5].some((y) => Math.abs(p[1] - y) < 1e-4), `${style.id}/${id}: only the level strip leaves (a vertex at ${p[1].toFixed(4)})`);
      }
      if (!added.length) {
        assert.equal(holes.length, 0, `${style.id}/${id}: no strip, no holes`);
        assert.equal(removed.length, 0, `${style.id}/${id}: no strip either way`);
        for (const g of [flat, laidOn].flatMap((x) => Object.values(x.parts).flat())) g.dispose();
        continue;
      }
      skirted++; kinds.add(`${style.id}/${id}`);
      assert.ok(removed.length > 0, `${style.id}/${id}: the level strip gives way to the laid one`);
      for (const [bucket, p] of added) {
        const lift = p[1] - groundAt(p[0], p[2]);
        assert.ok(Math.abs(lift - 0.03) < 2e-4 || Math.abs(lift - 0.04) < 2e-4, `${style.id}/${id}: a ${bucket} strip vertex ${lift.toFixed(4)} m over the ground`);
        const clear = Math.min(...holes.map((h) => Math.hypot(p[0] - h.x, p[2] - h.z) - h.r));
        assert.ok(clear <= 1e-3, `${style.id}/${id}: the ground cover keeps off the strip at (${p[0].toFixed(2)}, ${p[2].toFixed(2)}) (${clear.toFixed(3)} m out)`);
      }
      laid += added.length;
      // the runs: no two adjacent outer-edge vertices of one side further apart than 1.5 m (the strip follows the ground)
      for (const g of Object.values(laidOn.parts).flat()) {
        if (!g.userData.fine) continue;
        const pos = g.getAttribute('position');
        for (let i = 0; i + 2 < pos.count; i += 3) {
          const lifted = [0, 1, 2].every((k) => Math.abs(pos.getY(i + k) - groundAt(pos.getX(i + k), pos.getZ(i + k)) - 0.03) < 2e-4);
          if (!lifted) continue;
          for (let k = 0; k < 3; k++) {
            const j = i + (k + 1) % 3;
            longest = Math.max(longest, Math.hypot(pos.getX(i + k) - pos.getX(j), pos.getZ(i + k) - pos.getZ(j)));
          }
        }
      }
      // a phone: the same build with the ground as without, and no holes asked
      const before = holes.length;
      const mobFlat = build(style, id, seed, wall, 'mobile'), mobOn = build(style, id, seed, wall, 'mobile', ground);
      assert.deepEqual(everything(mobOn.parts), everything(mobFlat.parts), `${style.id}/${id}: a phone lays no strip`);
      assert.equal(holes.length, before, `${style.id}/${id}: a phone asks for no holes`);
      // the holes in a common world: each building's moved along x so the list spreads (and passes the grid's 64)
      for (const h of holes) allHoles.push({ x: h.x + skirted * 40, z: h.z, r: h.r });
      for (const g of [flat, laidOn, mobFlat, mobOn].flatMap((x) => Object.values(x.parts).flat())) g.dispose();
    }
  }
  assert.ok(skirted >= 8, `the kits' plinthed houses lay their strips on the ground (${skirted})`);
  for (const must of ['kolkhoz/cottage', 'franconian/rowhouse']) assert.ok(kinds.has(must), `${must} lays its strip on the ground`);
  // the runs follow the ground in pieces no longer than 1.5 m along the wall (a corner's mitre and a piece's diagonal
  // are longer: the strip is 0.45 m across, round ten's apron 0.8 m on a style with the ground craft)
  assert.ok(longest <= Math.hypot(1.5, 0.8) + 0.8 + 1e-3, `the strip's pieces stay short (${longest.toFixed(3)} m)`);
  // the admission: gridded (past 64 holes) and scanned answer alike, on and around every hole, at a blade's radii
  const scan = (x, z, radius) => allHoles.some((h) => (x - h.x) ** 2 + (z - h.z) ** 2 < (h.r + radius) ** 2);
  const holed = withGroundCoverHoles(() => false, allHoles), few = withGroundCoverHoles(() => false, allHoles.slice(0, 20));
  let probes = 0, inside = 0;
  for (let k = 0; k < allHoles.length; k += 3) {
    const h = allHoles[k];
    for (const [dx, dz] of [[0, 0], [h.r * 0.99, 0], [0, -h.r * 1.01], [0.37, 0.41], [-0.9, 0.2], [1.6, -1.1]]) {
      for (const radius of [0, 0.04, 0.25]) {
        const x = h.x + dx, z = h.z + dz, want = scan(x, z, radius);
        assert.equal(holed(x, 0, z, 1, radius), want, `the gridded admission answers as the scan at (${x.toFixed(2)}, ${z.toFixed(2)}) r ${radius}`);
        probes++; if (want) inside++;
      }
    }
  }
  for (const [x, z] of [[-500, 0], [10000, 3], [allHoles[0].x, allHoles[0].z]]) {
    const near = allHoles.slice(0, 20).some((h) => (x - h.x) ** 2 + (z - h.z) ** 2 < (h.r + 0.1) ** 2);
    assert.equal(few(x, 0, z, 1, 0.1), near, 'a short list keeps the scan');
  }
  assert.ok(inside > 0 && inside < probes, 'the probes find ground both in the holes and out of them');
  console.log(`facade wall-foot strip: ${skirted} kit houses lay it on a rolling ground (${laid} vertices 3-4 cm over it, pieces <= ${longest.toFixed(2)} m), `
    + `${allHoles.length} ground-cover holes hold it, the gridded admission answers ${probes} probes as the scan`);
}
