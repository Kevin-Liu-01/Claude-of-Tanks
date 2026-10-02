// Terrain v2 (2026-10-01, the Opus 5.5 visual redesign — the terrain-and-horizon lane). The terrain material was the
// single largest GPU cost on several maps (about 60 % of Whiteout's frame in the architecture audit): it sampled all
// four layers, albedo and normal, through a three-fetch far variant at every fragment and multiplied most of them by
// zero, and read its shared noise texture through a x16 anisotropic sampler at every grazing far fragment. This
// receipt pins the cost pass and the grounded-realism terms against the ACTUAL shader text:
//   1. coverage-gated sampling — each layer is fetched only inside the branch of its own coverage, the base tile only
//      where the layers above leave any of it (the coverage declarations are executed here on scalar ports);
//   2. the far band fetches no layer detail normal and the far variant takes one fetch, its tile mean a measured
//      uniform (uMeanG/D/R/M, refreshed when the sourced sets replace the procedural layers);
//   3. the noise texture's low-frequency reads go through the explicit isotropic level of detail (nz), never the
//      implicit anisotropic path;
//   4. slope exposure and the non-periodic bedding exist on the battlefield AND the horizon ring, driven by one
//      per-map table (groundRedux.ts) and packed into an existing-sized uniform (no sampler).
// Source and scalar checks; the GPU cost and the look are measured by the lane's ABBA probe and capture sheets.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groundReduxProfileIds, groundReduxUniformValues, resolveGroundReduxProfile } from './groundRedux.ts';
import { MAP_IDS } from './maps/catalog.ts';

const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const vista = readFileSync(new URL('./horizonVista.ts', import.meta.url), 'utf8');
const horizon = readFileSync(new URL('./maps/horizon.ts', import.meta.url), 'utf8');
const active = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
function shaderOf(text) {
  const start = text.indexOf('const SPLAT_COMMON_FRAG');
  const end = text.indexOf('const SPLAT_NORMAL_FRAG');
  assert.ok(start > 0 && end > start, 'the splat fragment exists');
  return active(text.slice(start, end));
}
function unique(text, pattern, label) {
  const m = [...text.matchAll(pattern)];
  assert.equal(m.length, 1, `one active ${label}`);
  return m[0];
}
/** The body of the first `if (<cond>) {` block whose condition matches, braces balanced. */
function blockAfter(text, condition, label) {
  const at = text.indexOf(`if (${condition}) {`);
  assert.ok(at >= 0, `${label}: the gate "if (${condition})" exists`);
  let depth = 0;
  for (let i = text.indexOf('{', at); i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(at, i + 1);
  }
  throw new Error(`${label}: unbalanced block`);
}

function checkTerrain(source) {
  const frag = shaderOf(source);
  // 1. coverage gates: each layer's fetches inside its own branch, none outside
  const gates = [
    ['covG > 0.002', 'a = groundSamp(uAlbG, uMeanG, uv * 0.240, df, mipB);', 'the base tile'],
    ['fD > 0.002 && keepM * (1.0 - seaSand) > 0.002', 'vec4 aD = groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB);', 'the worn soil'],
    ['seaSand > 0.003', 'a = mix(a, groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB), seaSand);', 'the beach apron'],
    ['fMs > 0.002 && keepR > 0.002', 'a = mix(a, groundSamp(uAlbM, uMeanM, uv * 0.190, df, mipB), fMs);', 'the wet layer'],
    ['fR > 0.002 && keepS > 0.002', 'vec4 aR = groundSamp(uAlbR, uMeanR, uv * 0.155, df, mipB);', 'the rock'],
    ['dW > 0.002', 'vec3 packedRoad = groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB + 4.0).rgb;', 'the packed road'],
    ['rockRelW > 0.002', 'texture2D(uNrmR, uv * 0.041)', 'the rock relief'],
  ];
  for (const [cond, fetch, label] of gates) {
    assert.ok(blockAfter(frag, cond, label).includes(fetch), `${label}: fetched inside its coverage branch`);
    assert.equal(frag.split(fetch).length, 2, `${label}: fetched nowhere else`);
  }
  // the coverage declarations, executed: what each layer leaves of the ones under it
  const decl = (name) => unique(frag, new RegExp(`float ${name} = ([^;]+);`, 'g'), name)[1];
  const cov = new Function('steepW', 'fR', 'fMs', 'seaSand', 'fD', `
    const keepS = ${decl('keepS')}; const keepR = ${decl('keepR')}; const keepM = ${decl('keepM')};
    const covG = ${decl('covG')}; return { keepS, keepR, keepM, covG };`);
  const pure = cov(0, 0, 0, 0, 0);
  assert.deepEqual(pure, { keepS: 1, keepR: 1, keepM: 1, covG: 1 }, 'open ground: the base tile owns the fragment');
  for (const [name, args] of [['wall', [1, 0, 0, 0, 0]], ['rock', [0, 1, 0, 0, 0]], ['water', [0, 0, 1, 0, 0]],
    ['beach', [0, 0, 0, 1, 0]], ['road shoulder', [0, 0, 0, 0, 1]]]) {
    assert.equal(cov(...args).covG, 0, `${name}: the base tile is not fetched under full cover`);
  }
  assert.equal(cov(1, 0, 0, 0, 0).keepS, 0, 'a full wall leaves nothing of the rock, water and soil under it');
  for (let i = 0; i < 512; i++) {
    const w = [0, 1, 2, 3, 4].map((j) => ((i * (j * 37 + 11) + j * 7) % 101) / 100);
    const c = cov(...w);
    const expected = (1 - w[0]) * (1 - w[1]) * (1 - w[2]) * (1 - w[3]) * (1 - w[4]);
    assert.ok(Math.abs(c.covG - expected) < 1e-12, 'the base tile share is the product of what every layer above leaves');
  }
  // 2. the far band: no detail normals, one far fetch with the measured mean
  unique(frag, /bool nrmOn = farM < 0\.98;/g, 'far-band normal switch');
  for (const nrm of ['groundNrm(uNrmG, uv * 0.240', 'groundNrm(uNrmD, uv * 0.210, df, mipB), fD', 'groundNrm(uNrmR, uv * 0.155']) {
    const at = frag.indexOf(nrm);
    assert.ok(at > 0 && /if \(nrmOn[^)]*\)[^;]*$/.test(frag.slice(Math.max(0, at - 90), at)), `${nrm}: behind the far-band switch`);
  }
  const samp = unique(frag, /vec4 splatSamp\(sampler2D t, vec2 uv, float df, float mb, vec4 mean\) \{([\s\S]*?)\n\}/g, 'splatSamp')[1];
  assert.ok(samp.includes('if (df > 0.996) return farS;'), 'the near tap is skipped once the far variant owns the fragment');
  assert.ok(samp.includes('farS = mix(farS, mean,'), 'the far variant eases to the measured tile mean');
  assert.ok(!/texture2D\(t, [^)]*, 6\.0\)/.test(samp), 'no deep-mip tile-mean fetch remains in the far variant');
  assert.equal((frag.match(/texture2D\(uAlb[GDRM], [^)]*, [67]\.0\)/g) ?? []).length, 0, 'every deep-mip layer mean is the measured uniform');
  for (const layer of ['G', 'D', 'R', 'M']) {
    assert.ok(frag.includes(`uniform vec4 uMeanG, uMeanD, uMeanR, uMeanM;`), 'the four means are declared');
    assert.ok(source.includes(`shader.uniforms.uMean${layer} = { value: layerMeans.${layer} };`), `uMean${layer} is bound`);
  }
  assert.ok(source.includes('sourcedTexturesReady.then(measureLayerMeans, measureLayerMeans);'), 'the means follow the sourced swap');
  // 3. the noise texture: low-frequency reads through the explicit isotropic level
  unique(frag, /vec4 nz\(vec2 p, float s, vec2 o\) \{ return textureLod\(uNoise, p \* s \+ o, max\(0\.0, gNoiseLog \+ log2\(s\)\)\); \}/g, 'the nz helper');
  unique(frag, /gNoiseLog = log2\(max\(max\(length\(dFdx\(wp\)\), length\(dFdy\(wp\)\)\) \* 256\.0, 1e-6\)\);/g, 'the footprint level');
  for (const m of frag.matchAll(/texture2D\(uNoise, ([^;]*?)\)\.[rgba]/g)) {
    const scale = /\* ([0-9.]+)/.exec(m[1]);
    const ok = (scale && Number(scale[1]) >= 0.1) || m[1].includes('dot(uv, along)');
    assert.ok(ok, `an implicit (anisotropic) noise read is only a near, high-frequency one: ${m[0].slice(0, 60)}`);
  }
  // 4. exposure and bedding
  assert.ok(frag.includes('uniform vec4 uReduxD;'), 'the exposure / bedding vector is declared');
  assert.ok(blockAfter(frag, 'uReduxD.x > 0.001', 'exposure').includes('normalize(uSunDirW.xz'), 'exposure reads the map sun');
  unique(frag, /float bedSignal\(float y, float scale, float ph\) \{/g, 'the bed signal');
  assert.ok(blockAfter(frag, 'patchW > 0.003', 'patchwork').includes('nz(uvW, 0.057'), 'the cover patchwork is one explicit-LOD field');
  assert.ok(/float bedA = mix\(sin\([^;]*bedSignal\([^;]*uReduxD\.z\);/.test(frag), 'the marker beds take the non-periodic signal');
  assert.ok(/float ledge = mix\(sin\(ledgePhase\), bedSignal\([^;]*uReduxD\.z\);/.test(frag), 'the far ledges take it too');
  // the sampler budget is unchanged: ten declared samplers
  const samplers = [...frag.matchAll(/uniform sampler2D ([^;]+);/g)].flatMap((m) => m[1].split(',').map((n) => n.trim()));
  assert.equal(samplers.length, 10, 'still ten sampler2D declarations (the program sits at 16 units)');
}

checkTerrain(terrain);

// mutation controls: each removed gate or reverted read must be refused
const mutants = [
  ['if (covG > 0.002) {', 'if (true) {', 'base tile ungated'],
  ['if (fR > 0.002 && keepS > 0.002) {', 'if (keepS > -1.0) {', 'rock ungated'],
  ['bool nrmOn = farM < 0.98;', 'bool nrmOn = true;', 'far normals back'],
  ['if (df > 0.996) return farS;', '', 'near tap always'],
  ['float n2 = nz(uv, 0.0031, vec2(0.41, 0.13)).g;', 'float n2 = texture2D(uNoise, uv * 0.0031 + vec2(0.41, 0.13)).g;', 'anisotropic low-frequency read'],
  ["shader.uniforms.uMeanR = { value: layerMeans.R };", "shader.uniforms.uMeanR = { value: null };", 'rock mean unbound'],
];
for (const [from, to, label] of mutants) {
  assert.equal(terrain.split(from).length, 2, `mutation seam exists: ${label}`);
  assert.throws(() => checkTerrain(terrain.replace(from, to)), `mutant refused: ${label}`);
}

// the table: every map has an exposure, a climate and a bed irregularity in band; the packing carries them
const ids = groundReduxProfileIds();
for (const id of MAP_IDS) assert.ok(ids.includes(id), `${id} has a ground profile`);
for (const id of MAP_IDS) {
  const p = resolveGroundReduxProfile(id);
  assert.ok(p.exposure >= 0 && p.exposure <= 1.3, `${id}: exposure in band`);
  assert.ok(['vegetated', 'arid', 'snow'].includes(p.climate), `${id}: a climate`);
  assert.ok(p.bedIrregularity >= 0 && p.bedIrregularity <= 1, `${id}: bed irregularity in band`);
  const d = groundReduxUniformValues(p).reduxD;
  assert.equal(d[0], p.exposure, `${id}: exposure packed`);
  assert.equal(d[1], p.climate === 'snow' ? 2 : p.climate === 'arid' ? 1 : 0, `${id}: climate class packed`);
  assert.equal(d[2], p.bedIrregularity, `${id}: bed irregularity packed`);
  assert.ok(p.patchwork >= 0 && p.patchwork <= 1, `${id}: patchwork in band`);
  assert.equal(d[3], p.patchwork, `${id}: patchwork packed`);
}
assert.equal(resolveGroundReduxProfile('moon').exposure, 0, 'airless regolith: nothing follows the sun');
assert.equal(resolveGroundReduxProfile('whiteout').climate, 'snow');
assert.equal(resolveGroundReduxProfile('desert').climate, 'arid');
assert.equal(resolveGroundReduxProfile('verdant').climate, 'vegetated');

// the horizon ring answers the same law
const vfrag = active(vista);
assert.ok(vfrag.includes('uniform vec2 uVExposure; uniform float uVBedIrregular;'), 'the vista declares the exposure law');
assert.ok(blockAfter(vfrag, 'uVExposure.x > 0.001', 'vista exposure').includes('normalize(uSunDirW.xz'), 'the ranges read the map sun');
assert.ok(blockAfter(vfrag, 'uVBedIrregular > 0.001', 'vista beds').includes('texture2D(uDetail2, vec2(P.y'), 'the ranges\' beds read the height line');
assert.ok(/uVExposure: \{ value: new THREE\.Vector2\(\s*Math\.min\(1\.3, Math\.max\(0, resolveGroundReduxProfile\(mapId\)\.exposure/.test(horizon),
  'the ring binds the battlefield profile\'s exposure');
assert.ok(horizon.includes('uVBedIrregular: { value: Math.min(1, Math.max(0, resolveGroundReduxProfile(mapId).bedIrregularity ?? 0)) },'),
  'the ring binds the profile\'s bed irregularity');

// the lit ring (terrain v2): the desktop vista and the far range are lit standard materials registered with the cascades
// when the engine offers its registration, so the ranges take the battlefield's own light under any light model; the
// atmosphere runtime's night dim (unlit horizons only) then leaves them to the night light
const far = readFileSync(new URL('./horizonFarRange.ts', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../engine/battleAtmosphereRuntime.ts', import.meta.url), 'utf8');
assert.ok(horizon.includes('const litRing = vista && !!lit;'), 'the vista is lit only on the desktop vista tier with an engine');
assert.ok(/litRing\s*\?\s*new THREE\.MeshStandardMaterial\(\{ vertexColors: true, side: THREE\.DoubleSide, map: detailTex, roughness: 1, metalness: 0 \}\)/.test(horizon),
  'a rough dielectric standard material');
assert.ok(horizon.includes("if (litRing) mat.defines = { ...(mat.defines ?? {}), HORIZON_VISTA_LIT: '' };"), 'the lit branch is a define');
assert.ok(horizon.includes('if (litRing) lit!(mat, vistaHook);'), 'registered through the cascades (its hook rides as the second argument)');
assert.ok(horizon.includes("(litRing ? 'horizon-ring-vista-lit-r5-' : 'horizon-ring-vista-r4-') + style"), 'its own program identity');
assert.equal((horizon.match(/lit: litSetupOf\(_engineCtx\)/g) ?? []).length, 2, 'the ring and its far range take the engine registration');
for (const stage of ['HORIZON_VISTA_LIT_NORMAL_FRAGMENT', 'HORIZON_VISTA_LIT_LIGHT_FRAGMENT', 'HORIZON_VISTA_LIT_AO_FRAGMENT',
  'HORIZON_VISTA_LIT_EMISSIVE_FRAGMENT', 'HORIZON_VISTA_LIT_HAZE_FRAGMENT']) {
  assert.ok(vista.includes(`export const ${stage} =`) && horizon.includes(stage), `${stage} exists and is wired`);
}
assert.ok(vfrag.includes('gVistaN = n; gVistaSun = sunVis; gVistaAo = ao * cavity * (1.0 - forestW * 0.10);'), 'the lit branch hands three its normal, sun and occlusion');
assert.ok(/#ifdef HORIZON_VISTA_LIT\s*diffuseColor\.rgb = lit \/ max\(vColor\.rgb, vec3\(0\.02\)\);/.test(vfrag), 'and an albedo (no altitude shade, no night dim)');
assert.ok(vfrag.includes('gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, vistaHaze);'), 'the haze mixes the radiance toward the live fog colour');
assert.ok(far.includes('const litFar = !!options.lit;') && far.includes("FAR_RANGE_LIT: ''") && far.includes("geo.setAttribute('normal', geo.getAttribute('aFarNormal'));"),
  'the far range is lit with its own normal attribute');
assert.ok(far.includes("(litFar ? 'horizon-far-range-lit-v2' : 'horizon-far-range-r72c')"), 'the lit far range has its own identity');
assert.ok(runtime.includes('if (basic.isMeshBasicMaterial) (selected ? eligible : blocked).add(basic);'), 'the night dim reaches unlit horizons only');

console.log(`terrainMaterialV2: coverage-gated layers (7 gates, 512 executed coverage cases), far band without detail normals, one-fetch far variant on measured means, explicit-LOD noise, exposure and non-periodic beds on ${MAP_IDS.length} maps and the ring, the lit ring and far range, ${mutants.length} mutation controls PASS; no GPU/art claim`);
