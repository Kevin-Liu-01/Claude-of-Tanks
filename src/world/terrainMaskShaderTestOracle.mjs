import assert from 'node:assert/strict';

const clamp = (x, low, high) => Math.max(low, Math.min(high, x));
const mix = (a, b, weight) => a + (b - a) * weight;
const active = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function unique(source, pattern, label) {
  const matches = [...source.matchAll(pattern)];
  assert.equal(matches.length, 1, `${label}: require one active statement`);
  return matches[0];
}

function compileConsumer(source) {
  const code = active(source);
  unique(code, /vec2\s+mUV\s*=\s*\(wp\.xz\s*\+\s*512\.0\)\s*\*\s*\(1\.0\s*\/\s*1024\.0\)\s*;/g, 'canonical world mask coordinates');
  unique(code, /vec4\s+mk\s*=\s*texture2D\(uMask,\s*mUV\)\s*;/g, 'RGBA mask sampler');
  const binding = unique(code, /shader\.uniforms\.uMask\s*=\s*\{\s*value:\s*([^}]+)\}/g, 'mask uniform')[1];
  const mask = {}, noiseTex = {};
  assert.equal(new Function('mask', 'noiseTex', `return ${binding};`)(mask, noiseTex), mask);
  const expression = unique(code, /float\s+fD\s*=\s*([^;]+);/g, 'worked-soil coverage')[1];
  const coverage = new Function('mk', 'uTownWear', 'n1', 'worn', 'shoulder', 'uWornDirtStrength', 'clamp', 'max', `return ${expression};`);
  const albedo = unique(code, /\ba\s*=\s*mix\(a,\s*groundSamp\(uAlbD,[^;]+,\s*fD\s*\);/g, 'D albedo consumer')[0];
  const normal = unique(code, /\bn\s*=\s*mix\(n,\s*groundNrm\(uNrmD,[^;]+,\s*fD\s*\);/g, 'D normal consumer')[0];
  const output = new Function('a', 'n', 'uv', 'df', 'mipB', 'uAlbD', 'uNrmD', 'fD', 'groundSamp', 'groundNrm', 'mix',
    `${albedo}\n${normal}\nreturn [a,n];`);
  return {
    coverage: (mk, town, noise) => coverage(mk, town, noise, 0, 0, .84, clamp, Math.max),
    output: weight => output(.2, .4, 3, .5, 1, 'albedo-D', 'normal-D', weight,
      layer => { assert.equal(layer, 'albedo-D'); return .8; },
      layer => { assert.equal(layer, 'normal-D'); return .9; }, mix),
  };
}

function verifyConsumer(source) {
  const consumer = compileConsumer(source);
  // Isolate authored alpha from ambient wear/road shoulders. RGB sentinels
  // must not replace A; the full current blend is owned by terrainWornDirt.
  for (const alpha of [0, .1, .6, 1]) for (const town of [0, .4, 1]) {
    for (const noise of [0, .5, 1]) for (const rgb of [[0,0,0], [.8,0,0], [0,.8,0], [0,0,.8]]) {
      const actual = consumer.coverage({ r: rgb[0], g: rgb[1], b: rgb[2], a: alpha }, town, noise);
      assert.equal(actual, alpha * town * (.35 + .65 * noise), 'authored soil is read from A independently of RGB');
      assert.deepEqual(consumer.output(actual), [mix(.2,.8,actual), mix(.4,.9,actual)], 'same coverage drives soil albedo and normals');
    }
  }
}

/** Current mask consumer only; not a whole-shader, native or performance gate. */
export function assertTerrainMaskShaderContract(source) {
  verifyConsumer(source);
  for (const [from, to] of [
    ['mk.a * uTownWear', 'mk.g * uTownWear'],
    ['mk.a * uTownWear', '0.0 * uTownWear'],
    ['shader.uniforms.uMask = { value: mask }', 'shader.uniforms.uMask = { value: noiseTex }'],
    ['vec4 mk = texture2D(uMask, mUV);', 'vec4 mk = texture2D(uNoise, mUV);'],
    ['n = mix(n, groundNrm(uNrmD, uv * 0.210, df, mipB), fD);', 'n = mix(n, groundNrm(uNrmD, uv * 0.210, df, mipB), 0.0);'],
  ]) {
    assert.ok(source.includes(from), 'mutation must edit an actual source statement');
    const mutant = source.replace(from, to) + `\n// ${from}\n/* ${from} */`;
    assert.throws(() => verifyConsumer(mutant), `reject changed consumer even when old code survives in comments: ${from}`);
  }
}

// The wall-normal repair inlines two samples at each of two former wallTex
// callsites. Four more lexical expressions do not add executed texture reads.
export function assertTerrainFetchExpressionCensus(source) {
  for (const scale of ['0.041', '0.019']) for (const axis of ['x', 'z']) {
    const expression = `texture2D(uNrmR, gWallUV${axis} * ${scale})`;
    assert.equal(source.split(expression).length, 2, 'one exact projected wall-normal sample');
  }
  assert.equal((source.match(/texture2D\(/g) ?? []).length, 78 + 4,
    'historical78 plus four inlined wall samples; lexical census only');
}
