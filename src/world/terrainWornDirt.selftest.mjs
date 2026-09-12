import { assertTerrainFetchExpressionCensus } from './terrainMaskShaderTestOracle.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { historicalPaletteConfig } from './shorelineHistoryTestOracle.mjs';

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const vegetation = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
const compact = text => text.replace(/\s+/g, '');
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const stringify = value => JSON.stringify(value, (_key, item) => typeof item === 'function' ? String(item) : item);
const before = MAP_IDS.map(id => stringify(getMapConfig(id)));

function scalar(text, name) {
  const match = text.match(new RegExp(`float ${name} = ([^;]+);`));
  assert.ok(match, `actual shader owns ${name}`);
  return match[1];
}
function compileCoverage(text) {
  // Execute the actual uploaded scalar expressions, not a handwritten copy
  // of the new policy. GLSL clamp/max have identical scalar JS definitions.
  const uniform = text.match(/shader\.uniforms\.uWornDirtStrength = \{ value: ([^}]+) \};/);
  assert.ok(uniform, 'authored setting must reach the shader uniform');
  const strength = new Function('S', 'clamp', `return ${uniform[1]};`);
  // map pass 2026-09-12: the bare road shoulder carries its own authored
  // scale (uShoulderDirt, default 1) so snow passes keep white verges; every
  // legacy case below still executes with that scale at its default.
  const shoulderUniform = text.match(/shader\.uniforms\.uShoulderDirt = \{ value: ([^}]+) \};/);
  assert.ok(shoulderUniform, 'authored shoulder scale must reach the shader uniform');
  const shoulderScale = new Function('S', 'clamp', `return ${shoulderUniform[1]};`);
  const blend = new Function('worn', 'shoulder', 'mk', 'uTownWear', 'n1', 'uWornDirtStrength', 'uShoulderDirt', 'clamp', 'max',
    `return ${scalar(text, 'fD')};`);
  return {
    strength: settings => strength(settings, clamp),
    shoulderScale: settings => shoulderScale(settings, clamp),
    blend: (settings, worn, shoulder, town, wear, noise) =>
      blend(worn, shoulder, { a: town }, wear, noise, strength(settings, clamp), shoulderScale(settings, clamp), clamp, Math.max),
  };
}

// Frozen d6cc60fe3 fD policy. Only the worn coefficient is intentionally
// changed; full road/town coverage and its competition with wear stay valid.
const legacy = (worn, shoulder, town, wear, noise) =>
  clamp(Math.max(worn * .84, Math.max(shoulder, town * wear * (.35 + .65 * noise))), 0, 1);

function checkCoverageCase(actual, worn, shoulder, town, wear, noise) {
  const previous = legacy(worn, shoulder, town, wear, noise);
  assert.equal(actual.blend({}, worn, shoulder, town, wear, noise), previous);
  const current = actual.blend({ wornDirtStrength: .22 }, worn, shoulder, town, wear, noise);
  const protectedWear = Math.max(shoulder, town * wear * (.35 + .65 * noise));
  assert.ok(current >= protectedWear, 'road/town weight is never scaled with ambient wear');
  assert.ok(current <= previous && current >= 0 && current <= 1);
  if (protectedWear >= worn * .84) assert.equal(current, previous, 'authored dominant coverage remains exact');
  // Snow-pass shoulders: only the shoulder term scales; ambient wear and town wear are untouched.
  const snowy = actual.blend({ shoulderDirt: .3 }, worn, shoulder, town, wear, noise);
  assert.equal(snowy, clamp(Math.max(worn * .84, Math.max(shoulder * .3, town * wear * (.35 + .65 * noise))), 0, 1),
    'the shoulder scale multiplies the shoulder term alone');
  assert.equal(actual.blend({ shoulderDirt: 1 }, worn, shoulder, town, wear, noise), previous, 'a full shoulder is the legacy policy');
}
function checkCoverage(text) {
  const actual = compileCoverage(text);
  assert.equal(actual.strength({}), .84, 'all unauthored maps retain the exact legacy default');
  assert.equal(actual.shoulderScale({}), 1, 'all unauthored maps keep their full bare shoulder');
  assert.equal(actual.shoulderScale({ shoulderDirt: 1.7 }), 1, 'the shoulder scale is clamped to a full shoulder');
  assert.equal(actual.strength({ wornDirtStrength: 0 }), 0, 'explicit zero is not a missing setting');
  assert.equal(actual.strength({ wornDirtStrength: -1 }), 0);
  assert.equal(actual.strength({ wornDirtStrength: 2 }), 1);
  assert.equal(actual.blend({ wornDirtStrength: .22 }, 1, 0, 0, 1, .5), .22,
    'unrelated inland wear cannot become almost pure pale beach sand');
  for (const worn of [0, .1, .5, .8, 1]) for (const shoulder of [0, .1, .22, .4, .84, 1]) {
    for (const town of [0, .3, 1]) for (const wear of [0, .8, 1]) for (const noise of [0, .5, 1]) {
      checkCoverageCase(actual, worn, shoulder, town, wear, noise);
    }
  }
  return actual;
}
const actual = checkCoverage(source);
assert.throws(() => checkCoverage(source.replace('S.wornDirtStrength ?? 0.84', '0.84')),
  'discarding the authored setting must fail');
assert.throws(() => checkCoverage(source.replace('S.wornDirtStrength ?? 0.84', 'S.wornDirtStrength ?? 0.22')),
  'a global reduction on dry biomes must fail');
assert.throws(() => checkCoverage(source.replace(scalar(source, 'fD'),
  scalar(source, 'fD') + ' * uWornDirtStrength')), 'scaling road/town coverage after max must fail');

function checkMapScope(resolve) {
  assert.deepEqual(MAP_IDS.filter(id => resolve(id).splat?.wornDirtStrength !== undefined), ['coastal', 'saltwind']);
  assert.deepEqual(MAP_IDS.filter(id => resolve(id).splat?.shoulderDirt !== undefined), ['alpine'],
    'map pass 2026-09-12: only Glacier Pass authors a snowy road shoulder');
  assert.equal(resolve('alpine').splat.shoulderDirt, .3);
  for (const id of MAP_IDS) {
    assert.equal(actual.strength(resolve(id).splat ?? {}), id === 'coastal' || id === 'saltwind' ? .22 : .84);
  }
}
checkMapScope(getMapConfig);
assert.throws(() => checkMapScope(id => id === 'desert'
  ? { ...getMapConfig(id), splat: { ...getMapConfig(id).splat, wornDirtStrength: .22 } } : getMapConfig(id)),
  'desert/oasis-style dry palettes cannot inherit the coastal setting');

// A historical palette view deliberately hides this later visual setting;
// the actual current map-scope gate above must independently reject its drift.
const coastal = getMapConfig('coastal');
const changed = { ...coastal, splat: { ...coastal.splat, wornDirtStrength: .84 } };
assert.equal(stringify(historicalPaletteConfig(changed)), stringify(historicalPaletteConfig(coastal)));
assert.throws(() => checkMapScope(id => id === 'coastal' ? changed : getMapConfig(id)));

assert.equal(compact(scalar(source, 'worn')), 'smoothstep(0.55,0.80,n2w+(n1w-0.5)*0.45)',
  'raw worn field retains its existing grass-scatter correlation');
assert.ok(compact(vegetation).includes('constdirtPatch=smoothstepJs(0.55,0.80,sn.n2+(sn.n1-0.5)*0.45);'));
assert.doesNotMatch(vegetation, /wornDirtStrength/, 'no change to CPU scatter admission, RNG or resources');
for (const statement of [
  'a = mix(a, groundSamp(uAlbD, uv * 0.210, df, mipB), seaSand);',
  'n = mix(n, groundNrm(uNrmD, uv * 0.210, df, mipB), seaSand);',
  'a = mix(a, groundSamp(uAlbD, uv * 0.210, df, mipB), driftW * 0.85);',
  'vec3 packedRoad = groundSamp(uAlbD, uv * 0.210, df, mipB + 7.0).rgb;',
]) assert.ok(compact(source).includes(compact(statement)), 'beach, shoal and road detail paths remain unchanged');
assertTerrainFetchExpressionCensus(source);
assert.deepEqual(source.match(/texSize\(\d+\)/g), [...Array(6).fill('texSize(256)'), 'texSize(512)']);
assert.match(source, /uniform float [^;]*\buWornDirtStrength\b[^;]*;/, 'exactly one new scalar uniform, not a sampler');
assert.equal((source.match(/shader\.uniforms\.uWornDirtStrength\s*=/g) ?? []).length, 1);
assert.match(source, /world-terrain-splat-v29/, 'material-owned detail advances the fragment program key');
assert.deepEqual(MAP_IDS.map(id => stringify(getMapConfig(id))), before, 'projections and controls never mutate live authoring');
console.log('terrainWornDirt: coastal-only authored blend, 810 scalar combinations, legacy dry response, protected coverage and mutation/resource gates PASS');
