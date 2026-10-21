// heavyColumn.selftest.mjs — (lane ac130-fx-228 r3, the r5 blind critic 4 at a matched 300 m: the gunship's 152 mm "too
// short, no column" — its smoke lived for seconds but read too thin through the steep lens) the gunship class's heavy
// rounds stand a denser column: on the ground the starburst rounds (the gunship's howitzer and missile, plunging or 8 kg
// and up) raise HEAVY_COLUMN_N smoke puffs at a fuller density, born darker; on a hull a charge of 8 kg and up raises
// HEAVY_HULL_COLUMN_N. Every other burst's smoke keeps its count, density and colour. Read through a recording blast
// context: the smoke puffs (heat 0.3, cooling 4.5) each burst hands the media.
import assert from 'node:assert/strict';
import { groundBurst, plateBurst } from './blastRecipes.ts';

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** the smoke column's puffs one burst hands the media: their count, density and mean birth luminance */
function smokeOf(run) {
  const puffs = [];
  const scratch = () => new Proxy({}, { get(t, key) { if (typeof key === 'symbol' || key === 'toJSON' || key === 'then') return t[key];
    if (!(key in t)) t[key] = [0, 0, 0, 0]; return t[key]; } });
  const C = { tier: 1, m: scratch(), k: scratch(), lp: scratch(), ls: scratch(), lj: scratch(), rand: mulberry(9), groundY: () => 0,
    distBoost: () => 1, chunk() {}, flash() {}, fire() {}, sparks() {}, jet() {}, shockRing() {}, lightPulse() {}, glow() {},
    media: (p) => { if (p.heat === 0.3 && p.cool === 4.5) puffs.push({ density: p.density, lum: 0.2126 * p.r0 + 0.7152 * p.g0 + 0.0722 * p.b0 }); } };
  run(C);
  const density = [...new Set(puffs.map((p) => p.density))];
  return { n: puffs.length, density, lum: puffs.reduce((s, p) => s + p.lum, 0) / Math.max(1, puffs.length) };
}
const ground = (munition, chargeKg, plunge) => smokeOf((C) => groundBurst(C, { x: 0, y: 0, z: 0, munition, chargeKg, surface: 'soil',
  birthOffset: 0, ...(plunge ? { dx: 0, dy: -0.8, dz: 0.6 } : {}) }));
const hull = (munition, chargeKg) => smokeOf((C) => plateBurst(C, { x: 0, y: 1.8, z: 0, nx: 0, ny: 1, nz: 0, munition, chargeKg, ground: null, birthOffset: 0 }));

const gunship = ground('howitzer', 20, true), gunshipMissile = ground('missile', 11, true);
const fieldHowitzer = ground('howitzer', 6.8, false), he = ground('he', 20, false);
assert.deepEqual([gunship.n, gunship.density], [24, [0.92]], `the gunship's 152 mm stands the dense column (${gunship.n} at ${gunship.density})`);
assert.deepEqual([gunshipMissile.n, gunshipMissile.density], [24, [0.92]], 'so does its missile');
assert.deepEqual([fieldHowitzer.n, fieldHowitzer.density], [16, [0.78]], 'a field howitzer\'s shell (no plunge, under 8 kg) keeps its smoke');
assert.deepEqual([he.n, he.density], [14, [0.78]], 'a plain HE round keeps its smoke');
assert.ok(gunship.lum < fieldHowitzer.lum * 0.9, `the column is born darker with its soot (${gunship.lum.toFixed(3)} vs ${fieldHowitzer.lum.toFixed(3)})`);
const heavyHull = hull('howitzer', 20), lightHull = hull('howitzer', 6.8);
assert.deepEqual([heavyHull.n, heavyHull.density], [18, [0.92]], `a heavy charge on a hull stands the dense column (${heavyHull.n})`);
assert.deepEqual([lightHull.n, lightHull.density], [12, [0.78]], 'a lighter one keeps its smoke');
assert.ok(heavyHull.lum < lightHull.lum * 0.9, 'born darker');
console.log(`heavyColumn: the gunship's heavy rounds stand a denser, darker column (${gunship.n} puffs at ${gunship.density[0]} on the ground, ${heavyHull.n} on a hull); every other burst's smoke unchanged`);
