import assert from 'node:assert/strict';
import { buildFlyover, flyoversForMap } from './flyoverAircraft.ts';
import { MAP_IDS } from './maps/index.ts';

// The map-vehicles lane (P6, 2026-10-06): every flyover type builds a finite silhouette at its real length and span
// (positions and normals for the front's flat material), light enough for three in the sky; every map that flies a
// period type names built ones, and the war-period maps fly their own.

const REAL = {
  il2: [11.6, 14.6], ju87: [11.1, 13.8], bf109: [9.0, 9.9], p47: [11.0, 12.4], typhoon: [9.7, 12.7], hurricane: [9.8, 12.2],
  p40: [9.7, 11.4], b26: [17.8, 21.6], he111: [16.4, 22.6], g3m: [16.5, 25.0], a10: [16.3, 17.5], su25: [15.5, 14.4],
  f16: [15.0, 9.96], mig21: [14.5, 7.15], f104: [16.7, 6.7], f4: [19.2, 11.7], mirage3: [15.0, 8.22],
};
const seen = new Set();
for (const mapId of MAP_IDS) for (const type of flyoversForMap(mapId)) seen.add(type);
for (const type of Object.keys(REAL)) {
  const g = buildFlyover(type);
  try {
    assert.deepEqual(Object.keys(g.attributes).sort(), ['normal', 'position'], `${type}: positions and normals`);
    assert.ok(g.attributes.position.array.every(Number.isFinite), `${type}: finite`);
    g.computeBoundingBox();
    const b = g.boundingBox, [length, span] = REAL[type];
    // the nose is the fuselage's front (a radial's cowling and a pitot add a little)
    assert.ok(Math.abs(b.max.z - b.min.z - length) / length < 0.08, `${type}: ${(b.max.z - b.min.z).toFixed(2)} m long (${length})`);
    assert.ok(Math.abs(b.max.x - b.min.x - span) / span < 0.03, `${type}: ${(b.max.x - b.min.x).toFixed(2)} m span (${span})`);
    assert.ok(Math.abs(b.max.x + b.min.x) < 1e-3, `${type}: symmetric`);
    assert.ok(g.attributes.position.count / 3 <= 600, `${type}: a light silhouette`);
  } finally { g.dispose(); }
}
for (const type of seen) assert.ok(REAL[type], `${type}: a built type`);
assert.deepEqual([...flyoversForMap('verdant')], ['il2', 'ju87'], 'Prokhorovka, 1943: Sturmoviks and Stukas');
assert.deepEqual([...flyoversForMap('frontier')], ['a10'], 'the Fulda Gap: the Warthog');
assert.deepEqual([...flyoversForMap('airfield')], ['su25'], 'Hostomel, 2022: the Frogfoot');
assert.deepEqual([...flyoversForMap('moon')], [], 'no aircraft over the Moon');
console.log(`flyoverAircraft.selftest: ${Object.keys(REAL).length} silhouettes at their length and span; ${seen.size} flown over `
  + `${MAP_IDS.filter((id) => flyoversForMap(id).length).length} maps`);
