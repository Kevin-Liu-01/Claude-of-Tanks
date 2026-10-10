// (b42, the scenery lane; wave 260's "misplaced modern caravan" on Frosthollow) no anachronistic roadside clutter on any
// map with a period: every modern kind a map can place (its modernClutter, by kind or by count) resolves on a map set
// before the kind came into use to its period form; the period forms keep the modern records (footprint, class, cover,
// physics), spend exactly the modern builders' draws (every later pool keeps its geometry), and hold the cover's size.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DESTRUCTIBLE_TYPES } from './inhabitKit.ts';
import { MAP_SETTING_YEAR, MODERN_KIND_INTRODUCED, periodClutterTypes } from './periodClutterKit.ts';
import { MAP_IDS, getMapConfig } from './index.ts';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const MODERN = Object.keys(MODERN_KIND_INTRODUCED);
assert.deepEqual(MODERN.sort(), ['barrier', 'cablespool', 'cone', 'roadsign', 'transformer'], 'the props\' modern roadside vocabulary');

// 0. one setting year for every map (the table the map-vehicles lane's fleets key off too)
assert.deepEqual(Object.keys(MAP_SETTING_YEAR).sort(), [...MAP_IDS].sort(), 'every map has its setting year, and only the maps');
assert.ok(Object.values(MAP_SETTING_YEAR).every((y) => Number.isInteger(y) && y >= 1900 && y <= 2200), 'every year a year');

// 1. every map: the kinds it can place, and the forms they resolve to
let periodMaps = 0, swapped = 0;
for (const mapId of MAP_IDS) {
  const cfg = getMapConfig(mapId).props?.inhabit?.modernClutter ?? 0;
  const placed = typeof cfg === 'object' ? Object.entries(cfg).filter(([, n]) => n > 0).map(([k]) => k) : cfg > 0 ? MODERN : [];
  const year = MAP_SETTING_YEAR[mapId], forms = periodClutterTypes(mapId);
  if (year === undefined) { assert.deepEqual(forms, {}, `${mapId}: no period, no period forms`); continue; }
  periodMaps++;
  for (const kind of MODERN) {
    const anachronism = year < MODERN_KIND_INTRODUCED[kind];
    assert.equal(kind in forms, anachronism, `${mapId} (${year}): ${kind} (from ${MODERN_KIND_INTRODUCED[kind]}) ${anachronism ? 'resolves to its period form' : 'stays modern'}`);
  }
  for (const kind of placed) {
    if (year >= MODERN_KIND_INTRODUCED[kind]) continue;
    assert.ok(forms[kind] && forms[kind].build !== DESTRUCTIBLE_TYPES[kind].build, `${mapId} (${year}): its ${kind}s are no anachronism`);
    swapped++;
  }
}
assert.ok(periodMaps === MAP_IDS.length && swapped >= 20, `the dated maps (${periodMaps}) and their swapped kinds (${swapped})`);

// 2. the period forms: the modern records, the modern draws, the cover held
const forms = periodClutterTypes('winter');
// (its footprint across and along, and its top above the ground: a trestle's legs are sunk a little into it)
const extent = (g) => { g.computeBoundingBox(); const b = g.boundingBox; return { x: b.max.x - b.min.x, y: b.max.y, z: b.max.z - b.min.z }; };
for (const kind of MODERN) {
  const modern = DESTRUCTIBLE_TYPES[kind], period = forms[kind];
  for (const key of Object.keys(modern)) {
    if (key === 'build' || key === 'broken') continue;
    assert.deepEqual(period[key], modern[key], `${kind}: the period form keeps the record's ${key}`);
  }
  assert.equal(period.broken === null, modern.broken === null, `${kind}: a broken state where the modern one has one`);
  for (const [label, a, b] of [['build', modern.build, period.build], ['broken', modern.broken, period.broken]]) {
    if (!a) continue;
    for (const seed of [1, 7, 2002]) {
      let na = 0, nb = 0;
      const ra = mulberry32(seed), rb = mulberry32(seed);
      const ga = a(() => { na++; return ra(); }), gb = b(() => { nb++; return rb(); });
      assert.equal(nb, na, `${kind} ${label}: spends exactly the modern builder's ${na} draws (seed ${seed})`);
      assert.equal(rb(), ra(), `${kind} ${label}: the stream after it unchanged`);
      for (const g of [ga, gb]) assert.ok(g.attributes.position && g.attributes.normal && g.attributes.color && g.attributes.uv, `${kind} ${label}: the baked attributes`);
      ga.dispose(); gb.dispose();
    }
  }
}
// cover: the barricade holds the barrier's length and height; the crate stack the cabinet's footprint and height
{
  const m = extent(DESTRUCTIBLE_TYPES.barrier.build(mulberry32(3))), p = extent(forms.barrier.build(mulberry32(3)));
  assert.ok(Math.abs(p.z - m.z) / m.z < 0.1, `the barricade's length (${p.z.toFixed(2)}) is the barrier's (${m.z.toFixed(2)})`);
  assert.ok(Math.abs(p.y - m.y) / m.y < 0.15, `the barricade's top (${p.y.toFixed(2)} m) is the barrier's (${m.y.toFixed(2)} m)`);
}
{
  const meta = DESTRUCTIBLE_TYPES.transformer, p = extent(forms.transformer.build(mulberry32(3)));
  assert.ok(p.x <= meta.hw * 2 * 1.15 && p.z <= meta.hl * 2 * 1.15 + 0.05, `the crate stack on the cabinet's footprint (${p.x.toFixed(2)} x ${p.z.toFixed(2)})`);
  assert.ok(p.y >= 1.2, `the crate stack stands as cover (${p.y.toFixed(2)} m)`);
}
console.log(`periodClutter.selftest: ${periodMaps} maps dated, ${swapped} anachronistic kinds swapped for their period forms at the same seats; the modern records, draws and cover kept`);
