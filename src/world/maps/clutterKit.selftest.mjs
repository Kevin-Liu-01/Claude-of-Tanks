// src/world/maps/clutterKit.selftest.mjs — the clutter kinds' regional forms (props lane A, family #2, 2026-10-14):
// every map has its form of every clutter kind; each form spends exactly the draws its legacy builder spent (so every
// later pool keeps its geometry); its near form stays within 300 triangles and its far form within 60, the far form only
// on kinds that cast no dynamic shadow (the shadow pass runs no distance fold); each passes the bunker r2 standard
// (tools/r2-standard.mjs: no painted plates, real members, grounded, a destroyed state with volume); and each map's
// clutter stays within +45k triangles of the legacy at the runtime census's instance counts (the coordinator's guardrail,
// near and far both counted: the GPU is sent both).
import assert from 'node:assert/strict';
import { DESTRUCTIBLE_TYPES } from './inhabitKit.ts';
import { periodClutterTypes, MAP_SETTING_YEAR } from './periodClutterKit.ts';
import { CLUTTER_LEAN, CLUTTER_LOD_ATTRIBUTE, clutterFormOf, clutterLodHook, clutterTypes } from './clutterKit.ts';
import { destructibleCastsShadow } from '../destructibleRenderPolicy.ts';
import { YARD_FAMILY_RADIUS } from '../yardDressing.ts';
import { YARD_FAMILY_TRIANGLE_CAP, buildYardFamily } from './yardClutterKit.ts';
import { r2Check } from '../../../tools/r2-standard.mjs';
import * as THREE from 'three';

const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const tris = (g) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const MAPS = Object.keys(MAP_SETTING_YEAR).sort();
const KINDS = ['drum', 'barrel', 'crate', 'firewood', 'pallet', 'bucket', 'jerrycan', 'gasbottle', 'churn', 'loosewheel', 'pot', 'laundry', 'drumred', 'cablespool'];
/** Family #14's street furniture (streetKit.ts), through the same entry and the same rules; its own +40k a map. */
const STREET = ['bench', 'trashcan', 'cone', 'barrier', 'roadsign', 'lamp', 'rugframe'];
/** Family #18's farmyard (farmKit.ts): bales (the hay on the straw material, one form) and troughs; its own +30k a map. */
const FARM = ['bale', 'trough'];
const PHYSICS = new Set(['drum', 'bucket', 'jerrycan', 'gasbottle', 'churn', 'loosewheel', 'trashcan', 'cone']);
/** The kinds that topple whole (no broken form of their own). */
const TOPPLE = new Set(['roadsign', 'lamp']);
/** Where a kind is never placed (runtime census, origin/main 9a9ab2a7e): no form owed. */
const UNPLACED = { firewood: ['mars', 'moon'], churn: ['airfield', 'badlands', 'caldera', 'copper_mesa', 'desert', 'foundry', 'oasis', 'railyard', 'urban', 'whiteout'],
  pot: MAPS.filter((m) => !['desert', 'oasis', 'badlands', 'orchard', 'saltwind', 'titan_gorge', 'delta', 'mangrove', 'monsoon'].includes(m)),
  laundry: MAPS.filter((m) => !['verdant', 'autumn', 'frontier', 'reservoir', 'polders', 'orchard', 'saltwind', 'longleaf', 'desert', 'coastal', 'oasis', 'mangrove', 'delta', 'monsoon'].includes(m)),
  bench: ['blackglass', 'mars', 'moon', 'ruinspires', 'urban'].filter(() => false),
  bale: MAPS.filter((m) => !['verdant', 'winter', 'autumn', 'polders', 'reservoir', 'alpine', 'monsoon', 'delta', 'mangrove', 'longleaf', 'railyard', 'cliffbridge', 'steppe', 'frontier', 'desert', 'saltwind', 'coastal'].includes(m)),
  trough: ['blackglass', 'mars', 'moon', 'ruinspires', 'urban'] };
const owed = (kind) => MAPS.filter((m) => !(UNPLACED[kind] ?? []).includes(m));

/** The runtime census's instances of each kind (KINDS order) by map (streams/props-census/runtime-census.json, census-main
 *  origin/main 9a9ab2a7e, desktop, field 1337, vegetation 2001, props 2002). */
const CENSUS = {
  airfield: [40, 42, 40, 37, 13, 32, 1, 7, 0, 6, 0, 0, 2, 6], alpine: [17, 46, 40, 35, 3, 28, 9, 8, 9, 7, 0, 0, 2, 10],
  autumn: [16, 36, 33, 36, 6, 34, 7, 3, 18, 8, 0, 10, 1, 3], badlands: [68, 57, 50, 29, 24, 6, 10, 0, 0, 6, 32, 0, 2, 9],
  blackglass: [69, 9, 43, 5, 25, 11, 8, 7, 9, 4, 0, 0, 6, 9], caldera: [68, 75, 64, 48, 28, 41, 1, 5, 0, 3, 0, 0, 2, 4],
  cliffbridge: [13, 99, 60, 88, 5, 79, 3, 3, 72, 6, 0, 0, 1, 3], coastal: [15, 48, 37, 33, 6, 38, 8, 2, 3, 4, 0, 5, 1, 3],
  copper_mesa: [43, 68, 49, 41, 18, 45, 6, 11, 0, 3, 0, 0, 3, 2], delta: [22, 24, 35, 9, 6, 10, 6, 5, 6, 3, 17, 3, 5, 2],
  desert: [16, 57, 40, 37, 4, 6, 5, 6, 0, 8, 42, 5, 2, 4], fjord: [27, 54, 38, 30, 9, 33, 5, 7, 7, 5, 0, 0, 4, 5],
  foundry: [83, 80, 71, 54, 29, 50, 4, 6, 0, 7, 0, 0, 2, 5], frontier: [26, 39, 37, 29, 7, 22, 5, 9, 13, 7, 0, 10, 3, 2],
  longleaf: [18, 32, 31, 23, 6, 27, 7, 4, 9, 4, 0, 6, 3, 2], mangrove: [18, 40, 34, 25, 9, 13, 6, 6, 5, 4, 32, 4, 3, 4],
  mars: [23, 1, 4, 0, 7, 4, 6, 5, 5, 3, 0, 0, 3, 4], monsoon: [25, 52, 41, 31, 13, 7, 5, 6, 7, 3, 29, 2, 2, 3],
  moon: [32, 2, 11, 0, 6, 6, 4, 1, 5, 6, 0, 0, 5, 4], oasis: [23, 32, 33, 22, 7, 5, 7, 9, 0, 6, 29, 5, 0, 4],
  orchard: [11, 55, 32, 26, 5, 7, 7, 5, 9, 7, 28, 8, 2, 2], polders: [17, 32, 35, 26, 9, 26, 6, 3, 4, 6, 0, 8, 3, 2],
  railyard: [45, 66, 50, 60, 20, 51, 2, 11, 0, 4, 0, 0, 2, 7], reservoir: [18, 32, 37, 25, 7, 33, 5, 7, 8, 6, 0, 9, 4, 3],
  ruinspires: [68, 15, 37, 4, 30, 6, 6, 6, 10, 2, 0, 0, 5, 7], saltwind: [17, 45, 32, 23, 9, 7, 6, 5, 5, 3, 33, 7, 2, 3],
  skybridge: [66, 55, 62, 47, 21, 40, 4, 2, 14, 4, 0, 0, 1, 6], steppe: [13, 23, 37, 28, 3, 24, 6, 4, 20, 5, 0, 0, 2, 3],
  titan_gorge: [51, 58, 56, 38, 27, 3, 3, 5, 9, 6, 31, 0, 3, 5], urban: [37, 6, 16, 1, 17, 8, 5, 5, 0, 8, 0, 0, 1, 5],
  verdant: [15, 29, 32, 20, 3, 21, 5, 2, 16, 5, 0, 10, 3, 3], whiteout: [500, 58, 29, 23, 70, 15, 5, 9, 0, 8, 0, 0, 3, 1],
  winter: [17, 42, 30, 25, 2, 30, 10, 4, 5, 7, 0, 0, 1, 3],
};
/** The yard dressing's pieces by map (YARD order; the census counts both pallet stacks as palletStack) and the legacy
 *  kit's triangles a piece (census trisPer, the kit before #2). */
const YARD = ['palletStack', 'crates', 'drum', 'drumRank', 'cableDrum', 'tyres', 'fuelTank', 'skip'];
const YARD_LEGACY = { palletStack: 282, crates: 188, drum: 104, drumRank: 298, cableDrum: 188, tyres: 187, fuelTank: 176, skip: 110 };
const YARD_CENSUS = {
  airfield: [20, 18, 24, 9, 0, 2, 1, 8], alpine: [2, 5, 0, 1, 0, 0, 0, 1], badlands: [2, 1, 0, 0, 0, 0, 0, 0], blackglass: [0, 3, 0, 0, 0, 0, 0, 1],
  caldera: [23, 15, 25, 10, 16, 5, 2, 4], copper_mesa: [41, 5, 31, 14, 13, 17, 3, 2], fjord: [9, 13, 0, 1, 0, 0, 0, 3], foundry: [38, 12, 28, 16, 15, 8, 5, 13],
  frontier: [2, 1, 0, 0, 0, 0, 0, 0], longleaf: [2, 4, 1, 0, 0, 0, 0, 2], mangrove: [2, 1, 0, 0, 0, 0, 0, 0], mars: [0, 0, 4, 11, 0, 0, 0, 0],
  monsoon: [2, 1, 0, 0, 0, 0, 0, 0], polders: [3, 1, 2, 0, 0, 0, 0, 0], railyard: [49, 16, 25, 9, 11, 5, 2, 4], reservoir: [7, 5, 5, 0, 1, 0, 0, 3],
  ruinspires: [10, 8, 5, 2, 0, 0, 2, 7], saltwind: [1, 1, 0, 0, 0, 0, 0, 0], skybridge: [8, 4, 4, 4, 9, 4, 0, 6], steppe: [9, 6, 12, 3, 4, 3, 0, 3],
  titan_gorge: [8, 4, 9, 6, 3, 2, 0, 5], urban: [5, 0, 4, 0, 0, 0, 2, 3], whiteout: [13, 10, 3, 1, 2, 1, 0, 2], winter: [2, 4, 1, 0, 0, 0, 0, 1],
};
/** The street kinds' instances (STREET order) by map (the same census). */
const STREET_CENSUS = {
  airfield: [15, 7, 16, 8, 5, 0, 0], alpine: [17, 7, 0, 0, 8, 0, 0], autumn: [18, 5, 17, 7, 4, 0, 0], badlands: [17, 0, 22, 9, 4, 0, 3], blackglass: [0, 6, 31, 24, 4, 44, 0],
  caldera: [20, 3, 32, 11, 12, 0, 0], cliffbridge: [50, 5, 14, 12, 4, 0, 0], coastal: [22, 8, 18, 10, 5, 0, 0], copper_mesa: [24, 7, 0, 5, 1, 0, 0], delta: [10, 4, 22, 8, 3, 0, 3],
  desert: [19, 3, 25, 12, 4, 0, 5], fjord: [22, 5, 14, 9, 4, 0, 0], foundry: [34, 10, 43, 12, 13, 44, 0], frontier: [15, 7, 17, 14, 3, 0, 0], longleaf: [14, 6, 13, 19, 2, 0, 0],
  mangrove: [16, 4, 14, 7, 6, 0, 1], mars: [0, 2, 19, 10, 0, 0, 0], monsoon: [18, 6, 26, 15, 4, 0, 3], moon: [0, 5, 17, 14, 0, 0, 0], oasis: [12, 3, 24, 4, 4, 0, 5],
  orchard: [18, 4, 12, 7, 2, 0, 4], polders: [15, 4, 4, 15, 4, 0, 0], railyard: [28, 8, 33, 23, 7, 22, 0], reservoir: [18, 4, 10, 11, 2, 0, 0], ruinspires: [0, 9, 32, 29, 6, 122, 0],
  saltwind: [19, 5, 5, 11, 4, 0, 4], skybridge: [20, 3, 33, 19, 3, 0, 0], steppe: [13, 7, 25, 7, 5, 0, 0], titan_gorge: [15, 5, 29, 12, 7, 0, 3], urban: [0, 7, 29, 14, 7, 20, 0],
  verdant: [14, 6, 15, 7, 4, 0, 0], whiteout: [7, 5, 15, 14, 4, 0, 0], winter: [17, 4, 19, 9, 4, 0, 0],
};
const STREET_MAX_DELTA = 40000;
/** The farm kinds' instances (FARM order) by map (the same census). */
const FARM_CENSUS = {
  airfield: [0, 13], alpine: [5, 7], autumn: [45, 13], badlands: [0, 9], blackglass: [0, 0], caldera: [0, 22], cliffbridge: [54, 33], coastal: [24, 7], copper_mesa: [0, 14],
  delta: [26, 3], desert: [3, 11], fjord: [0, 14], foundry: [0, 17], frontier: [49, 15], longleaf: [21, 10], mangrove: [2, 9], mars: [0, 0], monsoon: [2, 7], moon: [0, 0],
  oasis: [0, 8], orchard: [0, 7], polders: [36, 6], railyard: [3, 17], reservoir: [24, 7], ruinspires: [0, 0], saltwind: [5, 6], skybridge: [0, 13], steppe: [50, 12],
  titan_gorge: [0, 11], urban: [0, 0], verdant: [34, 4], whiteout: [0, 7], winter: [26, 7],
};
const FARM_MAX_DELTA = 30000;
const MAX_DELTA = 45000;

/** A pool geometry's tagged forms: near (1), far (2), lean (3). */
function split(g) {
  const tag = g.getAttribute(CLUTTER_LOD_ATTRIBUTE);
  assert.ok(tag, 'every clutter form is tagged');
  const out = { 1: [], 2: [], 3: [] };
  for (let i = 0; i < tag.count; i += 3) out[tag.getX(i)].push(i);
  const sub = (list) => {
    if (!list.length) return null;
    const s = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'color']) {
      const a = g.getAttribute(name);
      if (!a) continue; // (the hay print's forms carry no vertex colour)
      const arr = new Float32Array(list.length * 3 * a.itemSize);
      list.forEach((v, k) => { for (let c = 0; c < 3 * a.itemSize; c++) arr[k * 3 * a.itemSize + c] = a.array[v * a.itemSize + c]; });
      s.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
    }
    return s;
  };
  return { near: sub(out[1]), far: sub(out[2]), lean: sub(out[3]) };
}

// 1. forms, draws, caps, the shadow rule
const legacyTris = {}, formTris = {};
for (const mapId of MAPS) {
  const types = clutterTypes(mapId, false), period = periodClutterTypes(mapId);
  for (const kind of [...KINDS, ...STREET, ...FARM]) {
    const t = types[kind];
    if (!owed(kind).includes(mapId)) continue;
    assert.ok(t, `${kind} has no form on ${mapId}`);
    assert.ok(clutterFormOf(kind, mapId), `${kind} on ${mapId} names its form`);
    const legacy = period[kind] ?? DESTRUCTIBLE_TYPES[kind];
    for (const [k, fn, lfn] of [['build', t.build, legacy.build], ['broken', t.broken, legacy.broken]]) {
      if (!lfn) { assert.equal(fn ?? null, null, `${kind} on ${mapId}: no broken form where the legacy kind has none`); continue; }
      const a = mulberry(9), b = mulberry(9);
      const lg = lfn(a), g = fn(b);
      assert.equal(b(), a(), `${kind} on ${mapId}: its ${k} form spends the legacy builder's draws`);
      if (k === 'build') { legacyTris[`${mapId}:${kind}`] = tris(lg); formTris[`${mapId}:${kind}`] = tris(g); }
      lg.dispose(); g.dispose();
    }
    const g = t.build(mulberry(3)), { near, far, lean } = split(g);
    const casts = destructibleCastsShadow(t);
    if (far) {
      assert.ok(near, `${kind} on ${mapId}: a far form beside its near`);
      assert.ok(tris(near) <= 300, `${kind} on ${mapId}: near ${tris(near)} triangles (cap 300)`);
      assert.ok(tris(far) <= 60, `${kind} on ${mapId}: far ${tris(far)} triangles (cap 60)`);
      assert.equal(casts, false, `${kind} folds by distance but casts a dynamic shadow (the depth pass runs no fold)`);
    } else {
      assert.ok(lean && !near, `${kind} on ${mapId}: one lean form`);
      const cap = CLUTTER_LEAN[mapId]?.includes(kind) ? 120 : kind === 'lamp' ? 600 : kind === 'bale' ? 800 : 300;
      assert.ok(tris(lean) <= cap, `${kind} on ${mapId}: ${tris(lean)} triangles (cap ${cap})`);
    }
    if (PHYSICS.has(kind) || TOPPLE.has(kind)) assert.equal(t.broken, null, `${kind} stays a ${PHYSICS.has(kind) ? 'physics body' : 'topple'}`);
    else assert.equal(t.ownBroken, true, `${kind} on ${mapId}: its broken form is its own (E1 contract)`);
    g.dispose();
  }
}

// 2. the bunker r2 standard, form by form
const specs = [...KINDS, ...STREET, ...FARM].map((kind) => ({
  kind: `clutter:${kind}`, maps: owed(kind), route: PHYSICS.has(kind) || TOPPLE.has(kind) ? 'crush' : undefined, noBroken: PHYSICS.has(kind) || TOPPLE.has(kind),
  caps: { near: kind === 'lamp' ? 600 : kind === 'bale' ? 800 : 300, far: kind === 'trashcan' || kind === 'cone' || kind === 'bench' ? 80 : 60 },
  // (a road sign's legend is in relief on its plate: an arrow's black head on a yellow plate is the legend, not a door)
  allowPlates: kind === 'roadsign' ? (p) => (p.centre[1] > 1.5 ? 'a road sign\'s legend in relief on its plate' : null) : undefined,
  resolve: (mapId) => {
    const t = clutterTypes(mapId, false)[kind];
    const f = split(t.build(mulberry(5)));
    return { form: clutterFormOf(kind, mapId), build: () => f.near ?? f.lean, far: f.far ? () => f.far : undefined,
      broken: t.broken ? () => t.broken(mulberry(5)) : undefined };
  },
}));
const problems = [];
let forms = 0;
for (const spec of specs) {
  const r = r2Check(spec);
  forms += r.forms.length;
  problems.push(...r.problems);
}
assert.deepEqual(problems, [], `r2Standard:\n  ${problems.join('\n  ')}`);

// 2b. the yard dressing in each map's forms: bounded, on the ground, within its caps, to the standard (no broken state:
// dressing, until #2b's crush route)
const yardTris = {};
for (const mapId of Object.keys(YARD_CENSUS)) {
  for (const family of Object.keys(YARD_FAMILY_RADIUS)) {
    const built = buildYardFamily(family, mapId), g = built.geometry;
    assert.ok(built.triangles <= YARD_FAMILY_TRIANGLE_CAP[family], `yard ${family} on ${mapId}: ${built.triangles} triangles (cap ${YARD_FAMILY_TRIANGLE_CAP[family]})`);
    g.computeBoundingBox();
    const b = g.boundingBox, reach = Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z);
    assert.ok(Math.abs(b.min.y) <= 0.05 && reach <= YARD_FAMILY_RADIUS[family] + 0.05, `yard ${family} on ${mapId}: on the ground within its reach`);
    yardTris[`${mapId}:${family}`] = built.triangles;
    g.dispose();
  }
}
for (const family of Object.keys(YARD_FAMILY_RADIUS)) {
  const pallets = family === 'pallets' || family === 'palletsTall';
  const r = r2Check({ kind: `yard:${family}`, maps: Object.keys(YARD_CENSUS), route: 'crush', noBroken: true, caps: { near: YARD_FAMILY_TRIANGLE_CAP[family] },
    limits: pallets ? { boxShareMax: 0.9, reason: 'a pallet stack is boards and blocks: below the top pallet, a deck and its blocks' } : undefined,
    resolve: (mapId) => ({ form: `${family}:${mapId}`, build: () => buildYardFamily(family, mapId).geometry }) });
  problems.push(...r.problems);
  forms += r.forms.length;
}
assert.deepEqual(problems, [], `r2Standard (yard):\n  ${problems.join('\n  ')}`);

// 3. each map within +45k triangles of the legacy clutter (near and far both sent)
const over = [];
let worst = { mapId: '', delta: -Infinity }, worstStreet = { mapId: '', delta: -Infinity }, worstFarm = { mapId: '', delta: -Infinity };
for (const mapId of MAPS) {
  let delta = 0;
  for (const [i, kind] of KINDS.entries()) {
    const n = CENSUS[mapId][i];
    if (!n) continue;
    const key = `${mapId}:${kind}`;
    assert.ok(key in formTris, `${kind} is placed on ${mapId} (${n}) but has no form`);
    delta += n * (formTris[key] - legacyTris[key]);
  }
  for (const [i, family] of YARD.entries()) {
    const n = YARD_CENSUS[mapId]?.[i] ?? 0;
    if (!n) continue;
    const now = family === 'palletStack' ? (yardTris[`${mapId}:pallets`] + yardTris[`${mapId}:palletsTall`]) / 2 : yardTris[`${mapId}:${family}`];
    delta += n * (now - YARD_LEGACY[family]);
  }
  if (delta > worst.delta) worst = { mapId, delta };
  if (delta > MAX_DELTA) over.push(`${mapId} +${delta}`);
  let street = 0;
  for (const [i, kind] of STREET.entries()) {
    const n = STREET_CENSUS[mapId][i];
    if (!n) continue;
    const key = `${mapId}:${kind}`;
    assert.ok(key in formTris, `${kind} is placed on ${mapId} (${n}) but has no form`);
    street += n * (formTris[key] - legacyTris[key]);
  }
  if (street > worstStreet.delta) worstStreet = { mapId, delta: street };
  if (street > STREET_MAX_DELTA) over.push(`${mapId} street +${street}`);
  let farm = 0;
  for (const [i, kind] of FARM.entries()) {
    const n = FARM_CENSUS[mapId][i];
    if (!n) continue;
    const key = `${mapId}:${kind}`;
    assert.ok(key in formTris, `${kind} is placed on ${mapId} (${n}) but has no form`);
    farm += n * (formTris[key] - legacyTris[key]);
  }
  if (farm > worstFarm.delta) worstFarm = { mapId, delta: farm };
  if (farm > FARM_MAX_DELTA) over.push(`${mapId} farm +${farm}`);
}
assert.deepEqual(over, [], 'maps over +45k clutter triangles');

// 4. the hook: one program's text, folding only the tagged forms, the lean form never
const shader = { vertexShader: '#include <common>\nvoid main() {\n#include <color_vertex>\n#include <begin_vertex>\n}' };
clutterLodHook(shader);
assert.match(shader.vertexShader, /attribute float aClutterLod;/);
assert.match(shader.vertexShader, /aClutterLod > 0\.5 && aClutterLod < 2\.5/);
assert.match(shader.vertexShader, /vColor\.rgb \*=/);
assert.throws(() => clutterLodHook({ vertexShader: '#include <common>\n#include <begin_vertex>' }), /color_vertex/);

console.log(`clutterKit selftest: ${KINDS.length} kinds x ${MAPS.length} maps and 9 yard families, ${forms} regional forms pass r2Standard; legacy draws spent; caps 300/60 (lean 120); worst map ${worst.mapId} +${worst.delta} triangles (cap +${MAX_DELTA}); street furniture worst ${worstStreet.mapId} +${worstStreet.delta} (cap +${STREET_MAX_DELTA}); farmyard worst ${worstFarm.mapId} +${worstFarm.delta} (cap +${FARM_MAX_DELTA}) PASS`);
