// (b42, the scenery lane; wave 260's "misplaced modern caravan" on Frosthollow) no anachronistic roadside clutter on any
// map with a period: every modern kind a map can place (its modernClutter, by kind or by count) resolves on a map set
// before the kind came into use to its period form; the period forms keep the modern records (footprint, class, cover,
// physics), spend exactly the modern builders' draws (every later pool keeps its geometry), and hold the cover's size.
// (the buildings lane, 2026-10-11; wave 406a) and no stock roadside kind a map's region never set by its tracks: the
// region's own forms (a Jamuna char's kolshi, paddy basket, jute bales and jute stook, ...) on the same law.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DESTRUCTIBLE_TYPES } from './inhabitKit.ts';
import { MAP_CLUTTER_REGION, MAP_SETTING_YEAR, MODERN_KIND_INTRODUCED, REGIONAL_CLUTTER_FORMS, periodClutterTypes } from './periodClutterKit.ts';
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
  const region = MAP_CLUTTER_REGION[mapId], regional = region ? REGIONAL_CLUTTER_FORMS[region] : {};
  for (const kind of MODERN) {
    if (kind in regional) { assert.equal(forms[kind], regional[kind], `${mapId}: its ${kind} is its region's (${region}) form`); continue; }
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
// 3. the region's own forms: no map of a region draws the moulded cone or the galvanised dustbin; every form keeps the
// stock record, spends the stock builder's draws, and holds the loose body or the cover
const bounds = (g) => { g.computeBoundingBox(); const b = g.boundingBox; return { x: b.max.x - b.min.x, y: b.max.y, z: b.max.z - b.min.z, minY: b.min.y, cx: (b.max.x + b.min.x) / 2, cz: (b.max.z + b.min.z) / 2 }; };
let regionalMaps = 0, regionalForms = 0;
for (const [mapId, region] of Object.entries(MAP_CLUTTER_REGION)) {
  assert.ok(MAP_IDS.includes(mapId) && REGIONAL_CLUTTER_FORMS[region], `${mapId}: a map, and its region (${region}) has forms`);
  const forms = periodClutterTypes(mapId);
  for (const kind of ['cone', 'trashcan']) {
    assert.ok(forms[kind] && forms[kind].build !== DESTRUCTIBLE_TYPES[kind].build, `${mapId} (${region}): no stock ${kind}`);
  }
  regionalMaps++;
}
for (const [region, forms] of Object.entries(REGIONAL_CLUTTER_FORMS)) {
  for (const [kind, form] of Object.entries(forms)) {
    const stock = DESTRUCTIBLE_TYPES[kind];
    for (const key of Object.keys(stock)) {
      if (key === 'build' || key === 'broken') continue;
      assert.deepEqual(form[key], stock[key], `${region} ${kind}: the region's form keeps the record's ${key}`);
    }
    assert.equal(form.broken === null, stock.broken === null, `${region} ${kind}: a broken state where the stock one has one`);
    assert.notEqual(form.build, stock.build, `${region} ${kind}: its own build`);
    for (const [label, a, b] of [['build', stock.build, form.build], ['broken', stock.broken, form.broken]]) {
      if (!a) continue;
      for (const seed of [1, 7, 2002]) {
        let na = 0, nb = 0;
        const ra = mulberry32(seed), rb = mulberry32(seed);
        const ga = a(() => { na++; return ra(); }), gb = b(() => { nb++; return rb(); });
        assert.equal(nb, na, `${region} ${kind} ${label}: spends exactly the stock builder's ${na} draws (seed ${seed})`);
        assert.equal(rb(), ra(), `${region} ${kind} ${label}: the stream after it unchanged`);
        assert.ok(gb.attributes.position && gb.attributes.normal && gb.attributes.color && gb.attributes.uv, `${region} ${kind} ${label}: the baked attributes`);
        ga.dispose(); gb.dispose();
      }
    }
    if (stock.cls === 'physics' && !Object.values(periodClutterTypes('winter')).includes(form)) {
      // a loose form of the region's own stands base on the ground and centred (its tumble turns about the body's
      // mid-height), about the body's height and within its reach (a region may keep a period form: the village's trestle)
      const e = bounds(form.build(mulberry32(5)));
      assert.ok(e.minY > -0.03 && Math.abs(e.cx) < 0.03 && Math.abs(e.cz) < 0.03, `${region} ${kind}: base on the ground, centred`);
      assert.ok(e.y >= stock.h * 0.75 && e.y <= stock.h * 1.15, `${region} ${kind}: about the body's height (${e.y.toFixed(2)} of ${stock.h} m)`);
      assert.ok(Math.max(e.x, e.z) / 2 <= stock.r * 1.15, `${region} ${kind}: within the body's reach (${(Math.max(e.x, e.z) / 2).toFixed(2)} of ${stock.r} m)`);
    }
    regionalForms++;
  }
}
// the cover: the jute bales hold the barrier's length and height, the jute stook stands on the cabinet's footprint as
// cover; both publish their blocks' contact (a frozen band), not a part per hoop or per stick
{
  const bales = REGIONAL_CLUTTER_FORMS.bengal.barrier, stook = REGIONAL_CLUTTER_FORMS.bengal.transformer;
  const m = extent(DESTRUCTIBLE_TYPES.barrier.build(mulberry32(3))), p = extent(bales.build(mulberry32(3)));
  assert.ok(Math.abs(p.z - m.z) / m.z < 0.1, `the bale stack's length (${p.z.toFixed(2)}) is the barrier's (${m.z.toFixed(2)})`);
  assert.ok(Math.abs(p.y - m.y) / m.y < 0.15, `the bale stack's top (${p.y.toFixed(2)} m) is the barrier's (${m.y.toFixed(2)} m)`);
  const meta = DESTRUCTIBLE_TYPES.transformer, q = extent(stook.build(mulberry32(3)));
  assert.ok(q.x <= meta.hw * 2 * 1.15 && q.z <= meta.hl * 2 * 1.15 + 0.05, `the stook on the cabinet's footprint (${q.x.toFixed(2)} x ${q.z.toFixed(2)})`);
  assert.ok(q.y >= 1.2, `the stook stands as cover (${q.y.toFixed(2)} m)`);
  assert.equal(bales.contactBand.parts.length, 4, 'the bale stack\'s contact: its four bales');
  assert.equal(stook.contactBand.parts.length, 1, 'the stook\'s contact: its cone of sticks');
}
assert.ok(regionalMaps >= 8 && regionalForms >= 11, `the regional maps (${regionalMaps}) and their forms (${regionalForms})`);
console.log(`periodClutter.selftest: ${periodMaps} maps dated, ${swapped} anachronistic kinds swapped for their period forms at the same seats; ${regionalMaps} maps draw ${regionalForms} regional forms in place of the stock kinds their regions never set; the stock records, draws and cover kept`);
