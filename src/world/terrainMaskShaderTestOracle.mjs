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
  unique(code, /vec2\s+mUV\s*=\s*wp\.xz\s*\/\s*uMaskSize\s*\+\s*0\.5\s*;/g, 'world mask coordinates include the extended coastal atlas');
  const size = unique(code, /shader\.uniforms\.uMaskSize\s*=\s*\{\s*value:\s*([^}]+)\}/g, 'mask atlas extent')[1];
  // ground lane (2026-10-03, the land-use bake): the mask is read through maskAt (half a texel inside the mask's rows of
  // the stack that carries the bake under it), and uMask binds the stack (stackLandUseBake: the ground mask itself on a
  // map without a field system)
  unique(code, /vec4\s+mk\s*=\s*maskAt\(mUV\)\s*;/g, 'RGBA mask sampler');
  unique(code, /return texture2D\(uMask, vec2\(clamp\(uv\.x, uMaskStack\.y, uMaskStack\.z\), clamp\(uv\.y, uMaskStack\.y, uMaskStack\.z\) \* uMaskStack\.x\)\);/g,
    'the mask read keeps half a texel inside the mask\'s rows of the stack');
  assert.equal((code.match(/texture2D\(uMask\b/g) ?? []).length, 1, 'every mask read goes through maskAt');
  const binding = unique(code, /shader\.uniforms\.uMask\s*=\s*\{\s*value:\s*([^}]+)\}/g, 'mask uniform')[1];
  const mask = {}, noiseTex = {};
  assert.equal(new Function('maskStack', 'noiseTex', `return ${binding};`)({ texture: mask }, noiseTex), mask);
  const atlasSize = new Function('groundMask','mask','MAP_SIZE','OUTLAND_WATER_MASK_SIZE_M',`return ${size};`);
  assert.equal(atlasSize(mask,mask,1024,3072),1024,'inland mask retains its extent');
  assert.equal(atlasSize({},mask,1024,3072),3072,'coastal mask includes the extended shore');
  const expression = unique(code, /float\s+fD\s*=\s*([^;]+);/g, 'worked-soil coverage')[1];
  // map pass 2026-09-12: the shoulder term carries an authored scale (uShoulderDirt, default 1).
  // (the ground lane, wave 71: the soil's coverage is the worn patch's trodden core — wornCore, the whole patch on the arid
  // and snow maps — terrain.ts; the grazed rim keeps its turf)
  // (2026-10-07, the ground lane's pads: the shoulder's dirt stands down over a hardstand pad's stamp — apronRim, 0 off a
  // pad; hardstandSurface pins the pad)
  const coverage = new Function('mk', 'uTownWear', 'n1', 'wornCore', 'shoulder', 'uWornDirtStrength', 'uShoulderDirt', 'apronRim', 'clamp', 'max', `return ${expression};`);
  // terrain v2 (2026-10-01, the cost pass): the soil sample is taken once inside its coverage branch (vec4 aD = …) and
  // the albedo consumer mixes it by the same coverage; the normal consumer is unchanged (behind the far-band switch)
  const sample = unique(code, /\bvec4\s+aD\s*=\s*(groundSamp\(uAlbD,[^;]+\));/g, 'D albedo sample')[1];
  const albedo = unique(code, /\ba\s*=\s*mix\(a,\s*aD,\s*fD\s*\);/g, 'D albedo consumer')[0];
  const normal = unique(code, /\bn\s*=\s*mix\(n,\s*groundNrm\(uNrmD,[^;]+,\s*fD\s*\);/g, 'D normal consumer')[0];
  const output = new Function('a', 'n', 'uv', 'df', 'mipB', 'uAlbD', 'uNrmD', 'uMeanD', 'fD', 'groundSamp', 'groundNrm', 'mix',
    `const aD = ${sample};\n${albedo}\n${normal}\nreturn [a,n];`);
  return {
    coverage: (mk, town, noise) => coverage(mk, town, noise, 0, 0, .84, 1, 0, clamp, Math.max),
    output: weight => output(.2, .4, 3, .5, 1, 'albedo-D', 'normal-D', 'mean-D', weight,
      (layer, mean) => { assert.equal(layer, 'albedo-D'); assert.equal(mean, 'mean-D'); return .8; },
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
    ['shader.uniforms.uMask = { value: maskStack.texture }', 'shader.uniforms.uMask = { value: noiseTex }'],
    ['groundMask === mask ? MAP_SIZE : OUTLAND_WATER_MASK_SIZE_M', 'MAP_SIZE'],
    ['vec4 mk = maskAt(mUV);', 'vec4 mk = texture2D(uNoise, mUV);'],
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
  // road pass 2026-09-12: +3 — the clamped zero-mean gravel grain (two rock
  // luminance taps) and the along-lane tyre streak (one noise tap).
  // round 43 (2026-09-23): +3 — the dune ripples' local wind field (two swing taps, one wavelength tap), all three
  // inside the sand-ripple branch, so only sand maps pay them.
  // round 49 (2026-09-23): +4 — the strata block's joint-block tone (two wall projections) and varnish streak (two),
  // all inside the uStrata branch, so only the bedded maps pay them.
  // round 55 (2026-09-24): +2 — the bedded sandstone maps' analytic wall crag takes one slow phase fetch per wall
  // plane inside the uBeddedR branch (the tile's two coarse wall taps stay in the other branch), so a fragment
  // never pays more than before; the photo-rock maps are unchanged.
  // round 73 (2026-09-25, the ground redux): +7 — the layers' tile means for the height transitions (three deep-mip
  // taps: G, D, R) and the D layer's own near tap (a cache hit on the consumer's texel), the mid-distance normal
  // octave (26–150 m band only), the snow drifts' wind swing (snow maps only) and the glint noise (inside 42 m, snow
  // maps only); no new sampler — the material stays at the 16-unit budget.
  // round 73b (2026-09-26, the second pass): +6 — the road verge's grit (two rock luminance taps inside the shoulder
  // band, inside 160 m), the mid albedo octave (two ground taps, the 26–150 m band only) and the strand's pebbles (two
  // rock taps on the wet band and the wrack line, inside 90 m); no new sampler.
  // terrain v2 (2026-10-01, the cost pass): −61 — 52 noise-texture reads moved to the explicit-LOD helper nz() /
  // textureLod (40 low-frequency field reads, the six mid-relief gradient taps, the two strata block tones, the two
  // varnish streaks and the two field-plot cells), ten deep-mip "tile mean" reads became the measured uMean* uniforms
  // (the far variant's, the base / soil / rock transition means, the soil sample the transition re-read, the five
  // zero-mean octaves' means), and the near tap is written in both of splatSamp's exits (+1); the four wall-normal
  // expressions above stay exactly once each. Lexical census only.
  // ground lane (2026-10-03): +2 — the far turf's second read of the grass normal and tone, turned 42° at an
  // incommensurate scale (the far band only), so the coarse turf no longer repeats on one 48 m / 73 m grid.
  // ground lane (2026-10-03, the land-use bake): −8 — the nine mask reads (the mask itself, the road distance's four
  // gradient taps, the ice ridges' four) become maskAt calls, whose body is the one read left (+1); the bake's own two
  // reads live in landUse.ts LAND_USE_GLSL (a texelFetch and one filtered read), outside this lexical census.
  assert.equal((source.match(/texture2D\(/g) ?? []).length, 78 + 4 + 3 + 3 + 4 + 2 + 7 + 6 - 61 + 2 - 8, // round 47: the outland bay contour is evaluated analytically — no new sampler (16-unit budget)
    'historical78 plus four inlined wall samples plus three road-pass taps plus three dune-wind taps plus four jointed-strata taps plus two crag phase taps plus seven ground-redux taps plus six round-73b taps, minus the terrain-v2 cost pass, plus the ground lane\'s two far-turf taps, minus the eight mask reads maskAt folds into one; lexical census only');
}
