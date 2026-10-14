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
import { r2Check } from '../../../tools/r2-standard.mjs';
import * as THREE from 'three';

const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const tris = (g) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
const MAPS = Object.keys(MAP_SETTING_YEAR).sort();
const KINDS = ['drum', 'barrel', 'crate', 'firewood', 'pallet', 'bucket', 'jerrycan', 'gasbottle', 'churn', 'loosewheel', 'pot', 'laundry', 'drumred', 'cablespool'];
const PHYSICS = new Set(['drum', 'bucket', 'jerrycan', 'gasbottle', 'churn', 'loosewheel']);
/** Where a kind is never placed (runtime census, origin/main 9a9ab2a7e): no form owed. */
const UNPLACED = { firewood: ['mars', 'moon'], churn: ['airfield', 'badlands', 'caldera', 'copper_mesa', 'desert', 'foundry', 'oasis', 'railyard', 'urban', 'whiteout'],
  pot: MAPS.filter((m) => !['desert', 'oasis', 'badlands', 'orchard', 'saltwind', 'titan_gorge', 'delta', 'mangrove', 'monsoon'].includes(m)),
  laundry: MAPS.filter((m) => !['verdant', 'autumn', 'frontier', 'reservoir', 'polders', 'orchard', 'saltwind', 'longleaf', 'desert', 'coastal', 'oasis', 'mangrove', 'delta', 'monsoon'].includes(m)) };
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
  for (const kind of KINDS) {
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
      const cap = CLUTTER_LEAN[mapId]?.includes(kind) ? 120 : 300;
      assert.ok(tris(lean) <= cap, `${kind} on ${mapId}: ${tris(lean)} triangles (cap ${cap})`);
    }
    if (PHYSICS.has(kind)) assert.equal(t.broken, null, `${kind} stays a physics body`);
    else assert.equal(t.ownBroken, true, `${kind} on ${mapId}: its broken form is its own (E1 contract)`);
    g.dispose();
  }
}

// 2. the bunker r2 standard, form by form
const specs = KINDS.map((kind) => ({
  kind: `clutter:${kind}`, maps: owed(kind), route: PHYSICS.has(kind) ? 'crush' : undefined, noBroken: PHYSICS.has(kind),
  caps: { near: 300, far: 60 },
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

// 3. each map within +45k triangles of the legacy clutter (near and far both sent)
const over = [];
let worst = { mapId: '', delta: -Infinity };
for (const mapId of MAPS) {
  let delta = 0;
  for (const [i, kind] of KINDS.entries()) {
    const n = CENSUS[mapId][i];
    if (!n) continue;
    const key = `${mapId}:${kind}`;
    assert.ok(key in formTris, `${kind} is placed on ${mapId} (${n}) but has no form`);
    delta += n * (formTris[key] - legacyTris[key]);
  }
  if (delta > worst.delta) worst = { mapId, delta };
  if (delta > MAX_DELTA) over.push(`${mapId} +${delta}`);
}
assert.deepEqual(over, [], 'maps over +45k clutter triangles');

// 4. the hook: one program's text, folding only the tagged forms, the lean form never
const shader = { vertexShader: '#include <common>\nvoid main() {\n#include <color_vertex>\n#include <begin_vertex>\n}' };
clutterLodHook(shader);
assert.match(shader.vertexShader, /attribute float aClutterLod;/);
assert.match(shader.vertexShader, /aClutterLod > 0\.5 && aClutterLod < 2\.5/);
assert.match(shader.vertexShader, /vColor\.rgb \*=/);
assert.throws(() => clutterLodHook({ vertexShader: '#include <common>\n#include <begin_vertex>' }), /color_vertex/);

console.log(`clutterKit selftest: ${KINDS.length} kinds x ${MAPS.length} maps, ${forms} regional forms pass r2Standard; legacy draws spent; caps 300/60 (lean 120); worst map ${worst.mapId} +${worst.delta} triangles (cap +${MAX_DELTA}) PASS`);
