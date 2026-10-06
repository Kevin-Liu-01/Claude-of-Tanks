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
import { streamFrom } from './geometry.ts';
import { setFacadeCraft } from './facade.ts';

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
