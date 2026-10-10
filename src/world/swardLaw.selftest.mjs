// The treescn lane (2026-10-09, S2): the sward of the owner's maps to raise (vegetation.ts SWARD_LAW). The arid maps'
// tufts gather into tussocks — the critics on Redrock: "evenly sprinkled grass blades" where "Wadi Rum's sparse plants
// are ... widely spaced clumps"; on Copper Mesa and Titan "sparse, isolated grass tufts", "sprite tufts" — and the
// temperate maps' meadow card paints no flower accents (the critics' "yellow confetti dots"). A construction receipt:
// 1. the table never names one of the owner's light-touch maps, and names only maps that exist;
// 2. the tussock law (resolveTuftScale, sliced from vegetation.ts and run on the real splat field): one stray in a
//    hundred out on the bare ground, the clumps' hearts kept, their tufts broad and low; every map without the law keeps
//    the old admission and scale exactly;
// 3. the law only admits, scales and paints: no draw of a tuft's stream is added, and the forbs reach the meadow card.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { MAP_IDS } from './maps/index.ts';
import { SWARD_LAW } from './vegetation.ts';
import { sampleSplatNoise } from './terrain.ts';

// 1. the table
const LIGHT_TOUCH = ['winter', 'saltwind', 'reservoir', 'railyard', 'verdant', 'coastal', 'desert', 'frontier', 'fjord'];
for (const id of Object.keys(SWARD_LAW)) {
  assert.ok(MAP_IDS.includes(id), `${id}: a map`);
  assert.ok(!LIGHT_TOUCH.includes(id), `${id}: never one of the owner's light-touch maps`);
}
for (const id of ['badlands', 'copper_mesa', 'titan_gorge', 'skybridge']) assert.equal(SWARD_LAW[id]?.tussocks, true, `${id}: tussocks`);
for (const id of ['autumn', 'steppe', 'monsoon', 'polders']) assert.equal(SWARD_LAW[id]?.forbs, 0, `${id}: no confetti`);

// 2. the tussock law, on the real splat field
const source = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
const at = source.indexOf('  function resolveTuftScale(');
const end = source.indexOf('\n  }\n', at) + 4;
assert.ok(at > 0 && end > at, 'resolveTuftScale');
const smoothstepJs = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const make = (veg) => {
  const scratch = new Float32Array(2);
  const fn = new Function('veg', 'smoothstepJs', '_tuftScaleScratch', `${stripTypeScriptTypes(source.slice(at, end))}\nreturn resolveTuftScale;`)(veg, smoothstepJs, scratch);
  return { fn, scratch };
};
const hash = (i, k) => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
const census = (veg) => {
  const { fn, scratch } = make(veg);
  let tried = 0, kept = 0, strays = 0, bare = 0, heart = 0, heartKept = 0, heartW = 0, strayW = 0;
  const splat = { n1: 0, n2: 0, mA: 0 };
  for (let i = 0; i < 40000; i++) {
    const x = (hash(i, 1) - 0.5) * 900, z = (hash(i, 2) - 0.5) * 900;
    sampleSplatNoise(x, z, splat);
    const clump = smoothstepJs(0.42, 0.70, splat.n2) * (0.12 + 0.88 * smoothstepJs(0.44, 0.78, splat.n1));
    const ok = fn(splat, hash(i, 3), hash(i, 4), hash(i, 5));
    tried++;
    if (clump < 0.05) { bare++; if (ok) { strays++; strayW += scratch[0]; } }
    if (clump > 0.8) { heart++; if (ok) { heartKept++; heartW += scratch[0]; } }
    if (ok) kept++;
  }
  return { tried, kept, strayRate: strays / Math.max(1, bare), heartRate: heartKept / Math.max(1, heart),
    heartW: heartW / Math.max(1, heartKept), strayW: strayW / Math.max(1, strays) };
};
const legacy = census({ grassDensity: 0.1 }), tussock = census({ grassDensity: 0.1, tussocks: true });
assert.ok(tussock.strayRate <= 0.013 && legacy.strayRate > 0.025, `one stray in a hundred out on the bare ground (${tussock.strayRate.toFixed(4)}, was ${legacy.strayRate.toFixed(4)})`);
assert.ok(tussock.heartRate > 0.7, `the clumps' hearts kept (${tussock.heartRate.toFixed(3)})`);
assert.ok(tussock.heartW > legacy.heartW && tussock.heartW > 1.6 * tussock.strayW, `the hearts' tufts broad (${tussock.heartW.toFixed(2)} against ${legacy.heartW.toFixed(2)}; strays ${tussock.strayW.toFixed(2)})`);
assert.ok(tussock.kept < legacy.kept, `fewer tufts in all (${tussock.kept} against ${legacy.kept} of ${legacy.tried})`);
// a dense map is untouched by the law (its tufts never take the clump test)
{
  const dense = make({ grassDensity: 1, tussocks: true });
  assert.equal(dense.fn({ n1: 0.1, n2: 0.1, mA: 0 }, 0.9, 0.5, 0.5), true, 'a dense map admits as before');
  assert.deepEqual([...dense.scratch], [1, 1], 'and scales as before');
}
// every map without the law: the old admission and scale exactly
{
  const a = make({ grassDensity: 0.1 }), splat = { n1: 0, n2: 0, mA: 0 };
  for (let i = 0; i < 500; i++) {
    sampleSplatNoise((hash(i, 7) - 0.5) * 900, (hash(i, 8) - 0.5) * 900, splat);
    const clump = smoothstepJs(0.42, 0.70, splat.n2) * (0.12 + 0.88 * smoothstepJs(0.44, 0.78, splat.n1));
    const r = [hash(i, 9), hash(i, 10), hash(i, 11)];
    const ok = a.fn(splat, ...r);
    assert.equal(ok, !(r[0] > clump * 0.97 + 0.03), 'the old admission');
    if (ok) assert.ok(Math.abs(a.scratch[0] - (0.5 + clump * 0.85 + r[1] * 0.7)) < 1e-5, 'the old scale');
  }
}
console.log(JSON.stringify({ legacy, tussock }));

// 3. no new draw; the forbs reach the card
const tuft = source.slice(source.indexOf('  function makeTuft('), source.indexOf('  // write a tuft stored'));
assert.equal((tuft.match(/crng\(\)/g) || []).length, 8, 'a tuft still takes its eight draws');
assert.match(source, /function applySwardLaw\(veg: VegetationConfig, mapId: string \| null\): void \{/, 'the law applied to the map\'s vegetation');
assert.match(source, /applySnowGrassLaw\(veg, cfg\?\.id \?\? null\);\n[^\n]*\n\s*applySwardLaw\(veg, cfg\?\.id \?\? null\);/, 'after the snow law, before the densities');
assert.match(source, /makeGrassCardTexture\(mulberry32\(seed \+ 41\), 0, veg\.grassTexTone, veg\.forbs \?\? 3\)/, 'the meadow card takes the map\'s forbs');
assert.match(source, /for \(let f = 0; f < forbs; f\+\+\) \{/, 'its accents by the forbs');
console.log('swardLaw.selftest: the arid maps\' tufts gather into tussocks (one stray in a hundred), the temperate maps\' cards paint no confetti; never a light-touch map; no draw moves PASS');
