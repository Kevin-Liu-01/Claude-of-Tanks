// src/world/maps/sceneryR2.selftest.mjs — the r2 sweep's scenery and field-stack kinds (props lane A, 2026-10-16; the
// LOOKS sweep's BELOW2 section A: the windmotor, the windpump, the lumber stack and the pylon all plain boxes, the
// windmotor's head, tail and wheel and the windpump's head hung clear of their towers; the stog, plast, meule, Diemen,
// stook, straw rick and straw stack wrecked to rafts). Pinned:
//   1. each kind passes the bunker r2 standard (tools/r2-standard.mjs) on every map that places it, its form built on
//      that map's own seed: no painted plates, at most 60 % of its surface plain primitives, every member grounded, a
//      wreck standing at least a quarter of the intact height over at least 60 % of its plan, within its caps;
//   2. the draws: each kind's intact and broken builds spend exactly the draws their legacy builders spent from the
//      pool's stream (the counts of the legacy at b1f058836), so every later pool and placement keeps its own;
//   3. the collision: a rebuilt kind's pool collision is its legacy's contact band (onLegacyCollision: frozen from the
//      legacy build on the same stream), its placement footprint the legacy's fixed-seed build.
import assert from 'node:assert/strict';
import { assertR2 } from '../../../tools/r2-standard.mjs';
import { SCENERY_DESTRUCTIBLE_TYPES, buildPylon } from './sceneryKit.ts';
import { HAYSTACK_DESTRUCTIBLE_TYPES } from './haystackKit.ts';
import { DESTRUCTIBLE_TYPES } from './inhabitKit.ts';
import { deriveRuntimeStructureContactBand } from '../structureCollision.ts';

const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const seedOf = (m) => [...m].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193), 0x811c9dc5) >>> 0;
const REG = { ...DESTRUCTIBLE_TYPES, ...SCENERY_DESTRUCTIBLE_TYPES, ...HAYSTACK_DESTRUCTIBLE_TYPES };

// ---------------------------------------------------------------------------------------------- 1. the standard
/** Each kind, the maps that place it (the LOOKS sweep's census), its near cap, its route. */
const KINDS = {
  windmotor: { maps: ['polders'], near: 4200, topple: true },
  windpump: { maps: ['steppe'], near: 2600, topple: true },
  lumberstack: { maps: ['longleaf'], near: 2000 },
  diemen: { maps: ['frontier', 'reservoir'], near: 640 },
  meule: { maps: ['autumn', 'coastal'], near: 760 },
  plast: { maps: ['saltwind'], near: 520 },
  stog: { maps: ['verdant', 'winter'], near: 600 },
  stook: { maps: ['autumn', 'cliffbridge', 'delta', 'frontier', 'polders', 'verdant'], near: 420 },
  strawrick: { maps: ['steppe'], near: 360 },
  strawstack: { maps: ['cliffbridge', 'delta', 'mangrove'], near: 260 },
};
const rows = [];
for (const [kind, { maps, near, topple }] of Object.entries(KINDS)) {
  const t = REG[kind];
  const r = assertR2({
    kind: `destructible:${kind}`, maps, caps: { near }, ...(topple ? { route: 'crush', noBroken: true } : {}),
    resolve: (mapId) => ({ form: `${kind}:${mapId}`, build: () => t.build(mulberry(seedOf(mapId))),
      broken: t.broken ? () => t.broken(mulberry(seedOf(mapId))) : undefined }),
  });
  for (const f of r.forms) rows.push(`${f.form} ${f.metrics.tris}t box ${f.metrics.boxShare}${f.metrics.wreckHeight !== undefined ? ` wreck ${f.metrics.wreckHeight}` : ''}`);
}
{
  // the pylon lines (sceneryKit buildPylon): each map's authored tower, the tall towers over the woods, the phone build
  const LINES = { steppe: [30, 30], verdant: [30, 30], polders: [32, 50], railyard: [34, 56], frontier: [36, 48], tallest: [34, 70], phone: [30, 30] };
  const r = assertR2({
    kind: 'site:pylon', maps: Object.keys(LINES), route: 'landmark', caps: { near: 4600 },
    resolve: (m) => ({ form: `pylon:${m}`, build: () => buildPylon(mulberry(5), LINES[m][1], m === 'phone', LINES[m][0]).geometry }),
  });
  for (const f of r.forms) rows.push(`${f.form} ${f.metrics.tris}t box ${f.metrics.boxShare}`);
}

// ---------------------------------------------------------------------------------------------- 2. the draws
/** [intact, broken] draws a build spends from the pool's stream, at seeds 5 and 17 (the legacy builders at b1f058836). */
const DRAWS = {
  windpump: [[2984, 0], [2984, 0]], windmotor: [[5032, 0], [5032, 0]], lumberstack: [[2124, 492], [1751, 492]],
  strawstack: [[5, 156], [5, 156]], strawrick: [[4, 236], [4, 236]], stog: [[1287, 1921], [1287, 1921]],
  plast: [[1287, 1921], [1287, 1921]], meule: [[1923, 1920], [1923, 1920]], diemen: [[1220, 3840], [1220, 3840]], stook: [[4495, 5], [4495, 5]],
};
for (const [kind, want] of Object.entries(DRAWS)) {
  [5, 17].forEach((seed, i) => {
    const r = mulberry(seed);
    let n = 0;
    const counted = () => { n++; return r(); };
    REG[kind].build(counted).dispose();
    const intact = n;
    REG[kind].broken?.(counted).dispose();
    assert.deepEqual([intact, n - intact], want[i], `${kind} at seed ${seed}: the legacy's draws from the pool's stream`);
  });
}

// ---------------------------------------------------------------------------------------------- 3. the collision
for (const kind of ['windpump', 'windmotor', 'lumberstack']) {
  const t = REG[kind];
  assert.equal(typeof t.footprintBuild, 'function', `${kind}: its placement footprint the legacy's build`);
  // the pool's band is the legacy's on the same stream: built at the footprint's fixed seed, the two agree
  t.build(mulberry(0x0f0f7)).dispose();
  const legacy = t.footprintBuild();
  assert.deepEqual(t.contactBand, deriveRuntimeStructureContactBand({ baked: [legacy] }), `${kind}: the pool's collision its legacy's contact band`);
  legacy.dispose();
}

console.log(`sceneryR2.selftest: ${rows.length} forms to the r2 standard on their legacy's draws and collision\n  ${rows.join('\n  ')}`);
