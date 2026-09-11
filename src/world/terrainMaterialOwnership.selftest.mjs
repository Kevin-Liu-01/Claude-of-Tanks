import { assertTerrainFetchExpressionCensus } from './terrainMaskShaderTestOracle.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const compact = text => text.replace(/\s+/g, '');
function unique(text, pattern, label) {
  const matches = [...text.matchAll(pattern)];
  assert.equal(matches.length, 1, `one actual ${label}`);
  return matches[0][1];
}
const scalar = (text, name) => unique(text, new RegExp(`float ${name} = ([^;]+);`, 'g'), name);
const normalTerm = (text, name) => unique(text,
  new RegExp(`n\\.xy \\+= ([^;]*\\b${name}\\.xy\\b[^;]*);`, 'g'), `${name} normal consumer`);
const nearAlbedo = text => unique(text, /a\.rgb \*= ([^;]*\(gl2 - glM\)[^;]*);/g, 'near albedo consumer');
const farAlbedo = text => unique(text, /a\.rgb \*= ([^;]*\bgLum\b[^;]*);/g, 'far albedo consumer');

async function compile(text) {
  // Only local production scalar declarations and the four actual consumer
  // expressions are imported. Texture reads have explicit scalar test ports;
  // this is not a GLSL interpreter, compiled GPU shader or rendered-pixel proof.
  const declarations = ['meadowG', 'openNear2', 'nearG', 'farG']
    .map(name => `const ${name} = ${scalar(text, name)};`).join('\n');
  const body = `const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
    const mix = (a,b,w) => a*(1-w)+b*w;
    export function sample({fD,fR,fMs,projW,roadCore,dNear2,farM,dn2,gnF,gl2,glM,gLum}) {
      ${declarations}
      return {nearG,farG,nearN:${normalTerm(text, 'dn2')},nearA:${nearAlbedo(text)},
        farN:${normalTerm(text, 'gnF')},farA:${farAlbedo(text)}};
    }`;
  return (await import(`data:text/javascript;base64,${Buffer.from(body).toString('base64')}`)).sample;
}
const fields = ['fD', 'fR', 'fMs', 'projW', 'roadCore'];
const ports = overrides => ({ fD: 0, fR: 0, fMs: 0, projW: 0, roadCore: 0,
  dNear2: .73, farM: .61, dn2: { xy: -.7 }, gnF: { xy: .4 },
  gl2: .8, glM: .2, gLum: .7, ...overrides });
function close(a, b, label) {
  assert.ok(Number.isFinite(a) && Math.abs(a - b) <= 2e-14, `${label}: ${a} != ${b}`);
}
function noReinjection(row, label) {
  for (const key of ['nearG', 'farG', 'nearN', 'farN']) assert.ok(row[key] === 0, `${label}/${key}`);
  assert.equal(row.nearA, 1, `${label}/near albedo unchanged`);
  assert.equal(row.farA, 1, `${label}/far albedo unchanged`);
}
function checkEndpoints(sample) {
  for (const field of fields) noReinjection(sample(ports({ [field]: 1 })), field);
  for (const distance of [0, .001, .25, .73, 1]) {
    for (const signal of [-1, -.2, 0, .4, 1]) {
      const p = ports({ dNear2: distance, farM: distance,
        dn2: { xy: signal }, gnF: { xy: signal }, gl2: signal });
      const actual = sample(p);
      // Frozen f84 predecessor response on pure G, where every material/road
      // exclusion is zero. Original gains, clipping and texture ports remain.
      assert.equal(actual.nearG, distance);
      assert.equal(actual.farG, distance);
      assert.equal(actual.nearN, signal * .18 * distance);
      assert.equal(actual.farN, signal * distance * .24);
      assert.equal(actual.nearA, 1 + Math.max(-.22, Math.min(.26, (signal - p.glM) * 1.5)) * distance);
      assert.equal(actual.farA, (1 - distance * .55) + (.86 + p.gLum * .30) * (distance * .55));
    }
  }
}
function checkFractional(sample) {
  for (let i = 0; i < 2048; i++) {
    const p = ports({ dNear2: (i % 17) / 16, farM: (i % 23) / 22 });
    fields.forEach((name, j) => { p[name] = ((i * (j * 18 + 7) + j * 31) % 257) / 256; });
    const row = sample(p), remaining = fields.reduce((w, name) => w * (1 - p[name]), 1);
    close(row.nearG, p.dNear2 * remaining, 'independent residual near coverage');
    close(row.farG, p.farM * remaining, 'independent residual far coverage');
    assert.ok(row.nearG >= 0 && row.nearG <= p.dNear2);
    assert.ok(row.farG >= 0 && row.farG <= p.farM);
  }
  // Each ownership axis attenuates continuously, including fractional roads.
  for (const field of fields) {
    const full = sample(ports()), half = sample(ports({ [field]: .5 }));
    for (const key of ['nearG', 'farG', 'nearN', 'farN']) close(half[key], full[key] * .5, `${field}/${key}`);
    for (const key of ['nearA', 'farA']) close(half[key] - 1, (full[key] - 1) * .5, `${field}/${key}`);
    for (const v of [1e-7, .125, .5, .875, 1 - 1e-7]) {
      const low = sample(ports({ [field]: v - 1e-8 })), high = sample(ports({ [field]: v + 1e-8 }));
      assert.ok(high.nearG <= low.nearG && high.farG <= low.farG);
      assert.ok(low.nearG - high.nearG < 2e-8 && low.farG - high.farG < 2e-8);
    }
  }
}
function checkSourceContract(text) {
  assert.equal(compact(scalar(text, 'meadowG')), '(1.0-fD)*(1.0-projW)*(1.0-fMs)', 'existing meadow ownership unchanged');
  assert.equal(compact(scalar(text, 'fD')),
    'clamp(max(worn*uWornDirtStrength,max(shoulder,mk.a*uTownWear*(0.35+0.65*n1))),0.0,1.0)',
    'authored dirt/road/town blend policy unchanged');
  assertTerrainFetchExpressionCensus(text);
  assert.deepEqual(text.match(/texSize\(\d+\)/g), [...Array(6).fill('texSize(256)'), 'texSize(512)']);
  const declarations = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const uniforms = [...declarations.matchAll(/\buniform\s+\w+\s+([^;]+);/g)]
    .flatMap(match => match[1].split(',').map(name => name.trim())).sort();
  const expected = ['uAlbG','uAlbD','uAlbR','uAlbM','uNrmG','uNrmD','uNrmR','uNrmM','uMask','uNoise',
    'uTintA','uTintB','uTintC','uRoadTint','uMarshGloss','uMicroAmp','uStrata','uRoadTex','uTownWear',
    'uWornDirtStrength','uIceDrift','uMidRelief','uFieldPatch','uRipple','uSandMacro','uIceSky',
    'uMidFar','uRockGate','uSea','uSeaFoam','uSeaRamp'].sort();
  assert.deepEqual(uniforms, expected, 'no new shader uniform or sampler');
  assert.deepEqual([...text.matchAll(/shader\.uniforms\.(\w+)\s*=/g)].map(m => m[1]).sort(), expected);
  assert.ok(compact(text).includes(compact(`textures: [
    grass.albedo, grass.normal, dirt.albedo, dirt.normal,
    rock.albedo, rock.normal, wet.albedo, wet.normal, mask, noiseTex,
  ]`)), 'the same ten shader-only texture owners remain registered');
  assert.match(text, /mat\.customProgramCacheKey = \(\) => 'world-terrain-splat-v28';/);
}
function replaceOnce(text, from, to) {
  assert.equal(text.split(from).length, 2, `unique mutation seam: ${from}`);
  return text.replace(from, to);
}
async function rejects(text, label) {
  const sample = await compile(text);
  assert.throws(() => { checkEndpoints(sample); checkFractional(sample); }, label);
}

checkSourceContract(source);
checkSourceContract(source + '\n// uniform float commentaryIsNotADeclaration;\n');
const sample = await compile(source);
checkEndpoints(sample);
checkFractional(sample);
await rejects(replaceOnce(source, scalar(source, 'nearG'), 'openNear2 * (1.0 - fMs)'), 'old near reinjection');
await rejects(replaceOnce(source, scalar(source, 'farG'), 'farM * (1.0 - fR) * (1.0 - fMs) * (1.0 - projW)'), 'old far reinjection');
await rejects(replaceOnce(source, scalar(source, 'meadowG'), '(1.0 - projW) * (1.0 - fMs)'), 'missing dirt ownership');
await rejects(replaceOnce(source, normalTerm(source, 'dn2'), 'dn2.xy * 0.18 * openNear2 * (1.0 - fMs)'), 'near normal bypass');
await rejects(replaceOnce(source, nearAlbedo(source), nearAlbedo(source).replace('* nearG', '* openNear2')), 'near albedo bypass');
await rejects(replaceOnce(source, normalTerm(source, 'gnF'), 'gnF.xy * farM * 0.24'), 'far normal bypass');
await rejects(replaceOnce(source, farAlbedo(source), farAlbedo(source).replace('farG *', 'farM *')), 'far albedo bypass');
assert.throws(() => checkSourceContract(source.replace('uniform float uSea;', 'uniform float uNewDetail; uniform float uSea;')));
assert.throws(() => checkSourceContract(source.replace('world-terrain-splat-v28', 'world-terrain-splat-v27')));
console.log('terrainMaterialOwnership: actual scalar/consumer endpoints, pure-G legacy response, 2048 fractional cases, continuity and nine mutation controls PASS; no GPU/art/performance claim');
