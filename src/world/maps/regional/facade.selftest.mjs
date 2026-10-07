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
import { dressedQuoin, setFacadeCraft, withFacade } from './facade.ts';
import { paintDressedStoneBuffers, paintLimewash, paintRegionalSurfaceBuffers } from '../../regionalSurfaces.ts';

const BUDGET = 12000;
function counted(seed) {
  const inner = streamFrom(seed);
  const stream = () => { stream.draws++; return inner(); };
  stream.draws = 0;
  return stream;
}
function build(style, id, seed, wallBucket, tier) {
  const [w, d, h] = [7 + (seed % 5), 9 + (seed % 7), 6];
  const rng = counted(seed), variant = counted(seed * 7 + 3);
  const parts = buildRegionalParts(style, { structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
    wallBucket, rng, variant, mapId: 'facade', snowCap: false, tier }, streamFrom(seed * 3 + 5));
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
