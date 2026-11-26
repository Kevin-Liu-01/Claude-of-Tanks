// The set pieces' flora and dressing come from the codebase's own primitives (landmark-primitives-278; the owner,
// 2026-11-25, on Siwa's spring in Sunscar Oasis: "why is there randomly low poly textures??", then "for those new
// landmarks make sure any flora or stuff just reuses any better looking primitives we already have"). Three gates:
//
//   - the source: no builder module under src/world/landmarks declares a flora builder of its own (a function or an
//     arrow named for a palm, a tree, a shrub, a hedge, a frond, a crop, grass, a reed or a flower) — trees are planted
//     through plan.ts `flora` (the map's vegetation grows them), shrubs, hedges and beds come from the regional kits
//     (maps/regional/dressing.ts, yards.ts), walls, fences and street furniture from the props' modules (`destructibles`);
//   - what is drawn: every kind's default build and every authored piece on every map, its triangles drawn by hand (not
//     inside a registered primitive: PartSink.primitive) whose vertex colour reads as leaf (a green hue at a leaf's
//     saturation), holds its kind's row in landmarkFlora.baseline.json (the paints: green iron roofs, shutters, olive-drab
//     canvas, turf). A hand-built crown raises it and fails here (`--update-baseline` re-bases it, after a look at what
//     the new green is);
//   - the route: every tree a map's pieces plant is a slot the map grows (its pool exists: no new draw call), stands on
//     its own piece's footprint and on no other piece's ground.
//
// Negative fixtures (the gates catch the hand-built palm the 277 Siwa spring drew: a trunk bar and flat frond quads)
// run first, so a gate that stops seeing is a failure, not a pass.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { LANDMARK_BUILDERS } from './index.ts';
import { LANDMARK_KINDS, landmarkFloraStations, landmarkFootprint, resolveLandmarkParams } from './plan.ts';
import { landmarkFloraSites } from '../vegetationClearance.ts';
import { PartSink, REGIONAL_BUCKETS, rgb, streamFrom } from '../maps/regional/geometry.ts';
import { bar } from './kit.ts';
import { MAP_IDS, getMapConfig } from '../maps/index.ts';

const DIR = new URL('./', import.meta.url);
const BASELINE_URL = new URL('./landmarkFlora.baseline.json', import.meta.url);
const UPDATE = process.argv.includes('--update-baseline');

// ---- the source ------------------------------------------------------------------------------------------------------
/** The words a flora builder's name carries (camelCase or UPPER_SNAKE words; a plural is the word's). */
const FLORA_WORDS = new Set(['palm', 'palms', 'frond', 'fronds', 'olive', 'olives', 'tree', 'trees', 'shrub', 'shrubs', 'bush',
  'bushes', 'hedge', 'hedges', 'foliage', 'crop', 'crops', 'grass', 'tuft', 'tufts', 'reed', 'reeds', 'flower', 'flowers',
  'sapling', 'cactus', 'fern', 'vine', 'ivy',
  // the species (treeSpecies.ts, and the forms the biomes grow): a builder named for one draws a tree
  'pine', 'pines', 'spruce', 'spruces', 'fir', 'firs', 'cedar', 'cedars', 'cypress', 'oak', 'oaks', 'poplar', 'willow', 'acacia',
  'eucalyptus', 'birch', 'aspen', 'juniper', 'sugi', 'beech']);
const words = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);
/** The flora builders a module's text declares: `function x(`, `const x = (…) =>` / `function`, `const x: LandmarkBuilder`. */
export function floraBuildersIn(text) {
  const names = new Set();
  for (const m of text.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1]);
  for (const m of text.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*(?::\s*LandmarkBuilder\s*)?=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]+)?=>|[A-Za-z_$][\w$]*\s*=>)/g)) names.add(m[1]);
  return [...names].filter((name) => words(name).some((w) => FLORA_WORDS.has(w)));
}

// ---- what is drawn ---------------------------------------------------------------------------------------------------
const _c = new THREE.Color(), _hsl = { h: 0, s: 0, l: 0 };
/** A vertex colour that reads as leaf: a green hue (60°-170°) at a leaf's saturation and value. */
const leafy = (r, g, b) => {
  _c.setRGB(r, g, b); _c.getHSL(_hsl);
  const h = _hsl.h * 360;
  return h >= 60 && h <= 170 && _hsl.s >= 0.15 && _hsl.l > 0.05 && _hsl.l < 0.75;
};
/**
 * The kits' primitives a set piece may draw flora and dressing with (PartSink.primitive names their geometry): their
 * leaves are the kits' own (the houses' gardens, the souq's shade) and count for nothing here.
 */
const PRIMITIVES = new Set(['floweringShrub', 'ridge', 'mound', 'gardenParts', 'jeridFrame', 'bench']);
/** A build's triangles drawn by hand whose colour reads as leaf (each triangle by its first corner), and its kits' own. */
export function leafCount(parts) {
  let leaf = 0, kit = 0;
  const unknown = new Set();
  for (const bucket of REGIONAL_BUCKETS) for (const g of parts[bucket] ?? []) {
    const n = g.getAttribute('position').count, col = g.getAttribute('color'), by = g.userData.primitive;
    if (by && !PRIMITIVES.has(by)) unknown.add(by);
    if (!col) continue;
    let k = 0;
    for (let v = 0; v < n; v += 3) if (leafy(col.getX(v), col.getY(v), col.getZ(v))) k++;
    if (by && PRIMITIVES.has(by)) kit += k; else leaf += k;
  }
  return { leaf, kit, unknown: [...unknown] };
}
const dispose = (parts) => { for (const b of REGIONAL_BUCKETS) for (const g of parts[b] ?? []) g.dispose(); };
const build = (kind, params, mapId) => LANDMARK_BUILDERS[kind]({ kind, params: resolveLandmarkParams({ kind, x: 0, z: 0, params }),
  rng: streamFrom(11), variant: streamFrom(80), age: streamFrom(148), tier: 'desktop', groundFall: 0, brick: false, snowCap: false, mapId });
/** The kind's hand-drawn leaf triangles within its baseline row (a new kind has none: 0). */
const withinBaseline = (baseline, kind, leaf) => leaf <= (baseline[kind] ?? 0);

const failures = [];
const check = (label, fn) => { try { fn(); } catch (error) { failures.push(`${label}: ${error.message.split('\n')[0]}`); } };

// ---- the negative fixtures: the 277 Siwa palm, as source and as drawn ------------------------------------------------
check('control: the source gate', () => {
  const hand = 'function datePalm(sink, v, x, z, h) {}\nfunction olive(sink, v, x, z, r, foot) {}\nconst bushRow = (sink) => {};\nexport function doorLeaf() {}';
  assert.deepEqual(floraBuildersIn(hand).sort(), ['bushRow', 'datePalm', 'olive'], 'the gate names the hand-built flora builders (and no door leaf)');
});
check('control: the drawn gate', () => {
  // the 277 springPool's datePalm: a trunk bar and seven fronds of two flat quads each side, in its frond green
  const sink = new PartSink([0, 0]), FROND_GREEN = rgb(0x4e6a2c), top = [0, 9, 0];
  bar(sink, 'structureWood', [0, 0, 0], top, 0.38, { colour: rgb(0x5b4a37), decor: true });
  for (let f = 0; f < 7; f++) {
    const b = (f / 7) * Math.PI * 2, mid = [Math.cos(b) * 1.4, 9.5, Math.sin(b) * 1.4], tip = [Math.cos(b) * 2.8, 7.8, Math.sin(b) * 2.8];
    const sx = -Math.sin(b) * 0.5, sz = Math.cos(b) * 0.5;
    for (const [p, q] of [[top, mid], [mid, tip]]) {
      sink.quad('structureWood', [p[0] - sx, p[1], p[2] - sz], [p[0] + sx, p[1], p[2] + sz], [q[0] + sx, q[1], q[2] + sz], [q[0] - sx, q[1], q[2] - sz], { colour: FROND_GREEN, decor: true });
    }
  }
  const parts = sink.finish(), { leaf } = leafCount(parts);
  dispose(parts);
  const baseline = JSON.parse(readFileSync(BASELINE_URL, 'utf8')).kinds;
  assert.ok(leaf >= 28, `the hand-built palm's fronds read as leaf (${leaf})`);
  assert.ok(!withinBaseline(baseline, 'springPool', leaf), 'the hand-built palm fails the spring\'s baseline row');
  // and the same fronds drawn as a registered primitive's count for nothing
  const kitSink = new PartSink([0, 0]);
  kitSink.primitive('mound', () => kitSink.quad('structureWood', [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], { colour: FROND_GREEN, decor: true }));
  const kitParts = kitSink.finish(), counted = leafCount(kitParts);
  dispose(kitParts);
  assert.deepEqual([counted.leaf, counted.kit], [0, 2], 'a primitive\'s leaves are the kit\'s');
});

// ---- the source gate -------------------------------------------------------------------------------------------------
const modules = readdirSync(DIR).filter((name) => name.endsWith('.ts')).sort();
for (const name of modules) check(`source ${name}`, () => {
  const found = floraBuildersIn(readFileSync(new URL(name, DIR), 'utf8'));
  assert.deepEqual(found, [], `declares flora builders of its own (${found.join(', ')}): plant trees through plan.ts flora, take shrubs, hedges and beds from maps/regional (dressing.ts, yards.ts), walls and fences from the props' modules`);
});

// ---- the drawn gate --------------------------------------------------------------------------------------------------
const measured = {};
let builds = 0, kitLeaves = 0;
const note = (label, kind, parts) => {
  const { leaf, kit, unknown } = leafCount(parts);
  check(`drawn ${label}`, () => assert.deepEqual(unknown, [], 'draws with an unregistered primitive (PRIMITIVES)'));
  measured[kind] = Math.max(measured[kind] ?? 0, leaf);
  kitLeaves += kit;
  dispose(parts);
  builds++;
};
for (const kind of Object.keys(LANDMARK_KINDS).sort()) note(`${kind} (defaults)`, kind, build(kind, {}, 'selftest').parts);
for (const id of MAP_IDS) for (const placement of getMapConfig(id).props?.landmarks ?? []) {
  note(`${id}/${placement.name ?? placement.kind}`, placement.kind, build(placement.kind, placement.params ?? {}, id).parts);
}
if (UPDATE) {
  const kinds = Object.fromEntries(Object.entries(measured).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE_URL, `${JSON.stringify({ note: 'landmarkFlora.selftest.mjs: each kind\'s most leaf-coloured triangles drawn by hand in one build (paint, not flora)', kinds }, null, 2)}\n`);
  console.log(`landmarkFlora: baseline re-based (${Object.keys(kinds).length} kinds)`);
}
const baseline = JSON.parse(readFileSync(BASELINE_URL, 'utf8')).kinds;
for (const [kind, leaf] of Object.entries(measured)) check(`drawn ${kind}`, () => {
  assert.ok(withinBaseline(baseline, kind, leaf), `${leaf} leaf-coloured triangles drawn by hand, over its baseline ${baseline[kind] ?? 0}: a hand-built crown, bush or crop? (re-base with --update-baseline only for paint)`);
});
for (const kind of Object.keys(baseline)) check(`baseline ${kind}`, () => assert.ok(kind in measured, 'a baseline row for a kind no longer built'));

// ---- the route -------------------------------------------------------------------------------------------------------
let stations = 0;
for (const id of MAP_IDS) {
  const config = getMapConfig(id), landmarks = config.props?.landmarks ?? [];
  const grows = new Set(config.vegetation?.species ?? []);
  const sites = landmarkFloraSites(landmarks);
  for (const site of sites) check(`route ${id}/${landmarks[site.owner].name ?? site.kind} ${site.species} at (${site.x.toFixed(1)}, ${site.z.toFixed(1)})`, () => {
    assert.ok(grows.has(site.species), `a slot the map grows (${[...grows].join(', ')}): its pool exists`);
    assert.ok(!site.blocked, 'on no other piece\'s ground');
    const owner = landmarks[site.owner], [hw, hl] = landmarkFootprint(owner), yaw = (owner.yawDeg ?? 0) * Math.PI / 180;
    const dx = site.x - owner.x, dz = site.z - owner.z, lx = dx * Math.cos(yaw) - dz * Math.sin(yaw), lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    assert.ok(Math.abs(lx) <= hw && Math.abs(lz) <= hl, `on its own piece's footprint (${lx.toFixed(1)}, ${lz.toFixed(1)} of ${hw} x ${hl})`);
  });
  stations += sites.length;
}
check('route: Siwa\'s spring plants its palms', () => {
  const oasis = getMapConfig('oasis').props.landmarks;
  const spring = landmarkFloraStations(oasis).filter((s) => s.kind === 'springPool');
  assert.equal(spring.filter((s) => s.species === 'palm').length, 9, 'the nine date palms');
  assert.equal(spring.length, 11, 'and the café\'s two shade trees');
});

assert.deepEqual(failures, [], `${failures.length} failures:\n${failures.join('\n')}`);
console.log(`landmarkFlora selftest: ${modules.length} modules hold no flora builder, ${builds} builds within their leaf baseline (${kitLeaves} leaf triangles the kits' primitives drew), ${stations} planted trees on their maps' slots (controls caught the 277 palm)`);
