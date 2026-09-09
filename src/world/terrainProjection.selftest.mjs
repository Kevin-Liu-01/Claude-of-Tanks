import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
// Exact executable UV statements from R12's rejected grazing chart (32f9a6907).
// Only comments/indentation are omitted. Keep this tiny negative fixture local:
// the test must work in exported/shallow source trees without any Git history.
const OLD_UV_BLOCK = `vec3 e1 = normalize(cross(wn, vDirN));
vec3 e2 = cross(e1, wn);
vec2 uvG = vec2(dot(wp, e1), dot(wp, e2) * 0.58);`;
assert.equal(createHash('sha256').update(OLD_UV_BLOCK).digest('hex'),
  'dff57ce0b7af970888fc555ef067e13f54956586e0ba76a19b554db2d71f5f13',
  'the exact retired camera-dependent UV fixture must not drift');

const vec2 = (x, y) => ({ x, y });
const dot = (a, b) => a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0);
const cross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const normalize = a => {
  const length = Math.hypot(a.x, a.y, a.z);
  return { x: a.x / length, y: a.y / length, z: a.z / length };
};
const uncomment = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function block(text, marker) {
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `missing source-owned block: ${marker}`);
  const opening = text.indexOf('{', start);
  let depth = 1, end = opening + 1;
  for (; depth && end < text.length; end++) {
    if (text[end] === '{') depth++;
    if (text[end] === '}') depth--;
  }
  assert.equal(depth, 0);
  return { start, end, text: text.slice(start, end), body: text.slice(opening + 1, end - 1) };
}

function compileChart(text) {
  const matrix = text.match(/const mat2 TILEROT = mat2\(([^)]+)\);/);
  assert.ok(matrix);
  const values = matrix[1].split(',').map(Number);
  const columns = [vec2(values[0], values[1]), vec2(values[2], values[3])];
  const compile = (name, argument) => {
    const body = block(text, `vec2 ${name}(vec2 ${argument})`).body;
    assert.doesNotMatch(body, /cameraPosition|vDirN|\bwn\b|texture2D|normalize|cross/,
      'the chart helpers have no camera, terrain-normal, sampling or singular frame dependency');
    // Execute the actual scalar GLSL bodies. Only declarations/vec2 constructors
    // need adapting; no coordinate or normal formula is copied into this runner.
    return new Function('TILEROT', 'vec2', `return (${argument}) => {
      ${body.replace(/\bfloat\b/g, 'const')}
    };`)(columns, vec2);
  };
  return { uv: compile('groundChartUv', 'xz'), normal: compile('groundChartNormalXZ', 'encoded') };
}

const chart = compileChart(source);
assert.match(source, /vec2 uvG = groundChartUv\(wp\.xz\);/);
assert.match(source, /vec2 uvFace = groundChartUv\(wp\.xz\);/);
assert.match(source, /nG\.xy = groundChartNormalXZ\(nG\.xy\) \* 0\.5 \+ 0\.5;/);
assert.match(source, /vec2 dnF = groundChartNormalXZ\(texture2D\(uNrmD, uvFace \* 1\.07\)\.xy\);/);
assert.match(source, /n\.xy \+= dnF \* 0\.22 \* faceW;/);

function assertGradientFrame(candidate) {
  // Independent chain-rule oracle: differentiate an analytic height function
  // through the actual UV helper. The normal helper must recover that same
  // world-XZ gradient, including each signed axis and mixed tangent vectors.
  const step = 1 / 1024;
  for (const [u, v] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [.3, -.7], [-.9, .2]]) {
    const h = (x, z) => {
      const at = candidate.uv(vec2(x, z));
      return at.x * u + at.y * v;
    };
    const expected = vec2((h(step, 0) - h(-step, 0)) / (2 * step),
      (h(0, step) - h(0, -step)) / (2 * step));
    const actual = candidate.normal(vec2((u + 1) * .5, (v + 1) * .5));
    assert.ok(Math.abs(actual.x - expected.x) < 2e-15);
    assert.ok(Math.abs(actual.y - expected.y) < 2e-15);
  }
}
assertGradientFrame(chart);
assert.deepEqual(chart.normal(vec2(.5, .5)), vec2(0, 0), 'neutral map adds no relief');
assert.ok(chart.normal(vec2(1, .5)).y < 0, 'positive chart U rotates toward negative world Z');
assert.ok(chart.normal(vec2(.5, 1)).x > 0, 'positive chart V rotates toward positive world X');

const points = [vec2(0, 0), vec2(200.5, -170.25), vec2(-511.9, 511.8)];
const cameras = [{ x: 0, y: 40, z: 180 }, { x: 180, y: 40, z: 0 },
  { x: -130, y: 8, z: 90 }, { x: 70, y: 160, z: -130 }];
const normals = [];
for (const x of [-1, -.2, 0, .2, 1]) {
  for (const z of [-1, -.2, 0, .2, 1]) normals.push(normalize({ x, y: 1, z }));
}
function pigment(uv) {
  return Math.sin(uv.x * .71) * .3 + Math.cos(uv.y * 1.17) * .2;
}
for (const point of points) {
  const expected = chart.uv(point);
  for (const camera of cameras) for (const normal of normals) {
    // The source call-site proofs above ensure only wp.xz reaches the helper.
    // View-dependent blend weights, mip selection, light and fog are NOT
    // asserted to be invariant; only the world-point pigment chart is.
    assert.deepEqual(chart.uv(point, camera, normal), expected);
    assert.equal(pigment(chart.uv(point, camera, normal)), pigment(expected));
    const d = chart.normal(vec2(.72, .31));
    const shaded = normalize({ x: normal.x + d.x * .9, y: normal.y, z: normal.z + d.y * .9 });
    assert.ok(Object.values(shaded).every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(shaded.x, shaded.y, shaded.z) - 1) < 3e-16);
  }
}
const small = 1e-6;
const alongX = chart.uv(vec2(small, 0)), alongZ = chart.uv(vec2(0, small));
assert.ok(Math.abs(alongX.x * alongZ.x + alongX.y * alongZ.y) < 1e-27,
  'fixed chart axes are orthogonal without a slope-dependent singularity');
assert.ok(Math.abs(Math.hypot(alongX.x, alongX.y) - Math.hypot(alongZ.x, alongZ.y)) < 1e-21,
  'neither axis retains the retired directional 0.58 stretch');

const oldChart = new Function('wp', 'wn', 'vDirN', 'vec2', 'normalize', 'cross', 'dot',
  `${OLD_UV_BLOCK.replace(/\bvec[23]\s+(\w+)\s*=/g, 'const $1 =')} return uvG;`);
const fixedPoint = { x: 71.5, y: 12, z: -113.75 };
const oldSamples = cameras.map(camera => oldChart(fixedPoint, normals[12],
  normalize({ x: camera.x - fixedPoint.x, y: camera.y - fixedPoint.y, z: camera.z - fixedPoint.z }),
  vec2, normalize, cross, dot));
assert.ok(Math.max(...oldSamples.map(pigment)) - Math.min(...oldSamples.map(pigment)) > .1,
  'the exact retired chart visibly moves an analytic pigment under camera motion');
const wrongFrame = compileChart(source.replace(
  'TILEROT[0].x * u + TILEROT[0].y * v', 'TILEROT[0].x * u + TILEROT[1].x * v'));
assert.throws(() => assertGradientFrame(wrongFrame), 'wrong rotation direction must fail');
const unrotated = compileChart(source.replace(
  'TILEROT[0].x * u + TILEROT[0].y * v', 'u'));
assert.throws(() => assertGradientFrame(unrotated), 'raw tangent normals cannot enter the world accumulator');

const compact = text => uncomment(text).replace(/\s+/g, '');
function assertProjectionContract(text) {
  const clean = compact(text);
  // These are the local activation/material contracts, not a frozen copy of
  // the whole terrain owner. Unrelated future terrain work must remain free.
  assert.ok(clean.includes(compact(`float grazeW = (1.0 - smoothstep(0.07, 0.22, dNV))
    * smoothstep(30.0, 70.0, camDist) * (1.0 - smoothstep(320.0, 480.0, camDist))
    * (1.0 - projW) * (1.0 - fD) * (1.0 - fM) * (1.0 - roadCore) * (1.0 - fR);`)),
  'grazing activation still excludes dirt, water, road and rock with the original LOD weights');
  assert.ok(clean.includes(compact(`float faceW = smoothstep(0.02, 0.085, slope) * (1.0 - steepW)
    * (1.0 - smoothstep(20.0, 60.0, camDist))
    * (1.0 - fD) * (1.0 - fM) * (1.0 - roadCore) * (1.0 - fR);`)),
  'near-slope relief retains the same exclusions and distance/slope weights');
  const graze = compact(block(text, 'if (grazeW > 0.004)').body);
  const face = compact(block(text, 'if (faceW > 0.004)').body);
  for (const expression of [
    'splatSamp(uAlbG, uvG * 0.240, df, 0.0)',
    'splatSamp(uNrmG, uvG * 0.240, df, 0.0)',
    'texture2D(uNoise, uvG * 0.0117).r',
    'texture2D(uNoise, uvG * 0.0031 + vec2(0.41, 0.13)).g',
    'aG.rgb *= (0.88 + n1G * 0.18) * (0.94 + n2G * 0.12);',
    'aG.rgb *= 0.92 + n1w * 0.16;',
    'float gMix = grazeW * 0.38;',
    'a = mix(a, aG, gMix);', 'n = mix(n, nG, gMix);',
  ]) assert.ok(graze.includes(compact(expression)), `retained projection contract: ${expression}`);
  assert.ok(face.includes(compact('texture2D(uNrmD, uvFace * 1.07).xy')));
  assert.ok(face.includes(compact('n.xy += dnF * 0.22 * faceW;')));
  // At most 8 grazing fetches (2 splat calls × 3 reads + 2 noise reads),
  // plus 1 near-face read. This scopes the budget to the changed paths.
  const calls = body => body.match(/\b(?:texture2D|\w*Samp|wallTex|groundNrm)\(/g) ?? [];
  assert.deepEqual(calls(graze), ['splatSamp(', 'splatSamp(', 'texture2D(', 'texture2D(']);
  assert.deepEqual(calls(face), ['texture2D(']);
  assert.ok((uncomment(block(text, 'vec4 splatSamp(').body).match(/texture2D\(/g) ?? []).length <= 3);
}
assertProjectionContract(source);
assert.throws(() => assertProjectionContract(source.replace('gMix = grazeW * 0.38', 'gMix = grazeW * 0.39')),
  'an unintended blend-gain change must fail');
assert.throws(() => assertProjectionContract(source.replace(
  '* (1.0 - fD) * (1.0 - fM) * (1.0 - roadCore) * (1.0 - fR);',
  '* (1.0 - fD) * (1.0 - roadCore) * (1.0 - fR);')),
  'dropping liquid isolation must fail');
assert.throws(() => assertProjectionContract(source.replace('float gMix = grazeW * 0.38;',
  'aG.rgb += texture2D(uAlbG, uvG).rgb; float gMix = grazeW * 0.38;')),
  'an extra active-branch sampler must fail');
console.log('terrainProjection.selftest: fixed world pigment, signed gradient frames, 300 camera/slope cases, retired-bug mutations and local mask/sample contracts passed');
