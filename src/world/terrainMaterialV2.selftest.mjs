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
//   4. slope exposure and the non-periodic bedding, driven by one per-map table (groundRedux.ts) and packed into an
//      existing-sized uniform (no sampler);
//   5. terrain v3 (2026-10-02): the horizon ring IS this material past the square (d20f64198's continuous horizons bind
//      every ring and far-range face to the live terrain program), so the mountains' look is pinned here: dune bedforms
//      on gentle sand only, the slip-face sines faded by the true camera distance, the ring atlas gradient's wall band
//      (uRingReliefWall) and the probes' handle on the program uniforms.
// Source and scalar checks; the GPU cost and the look are measured by the lane's ABBA probe and capture sheets.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groundReduxProfileIds, groundReduxUniformValues, resolveGroundReduxProfile } from './groundRedux.ts';
import { MAP_IDS } from './maps/catalog.ts';
import { RING_RELIEF_WALL_BAND } from './horizonAutumnGround.ts';
import { terrainBedWobbleAt, terrainFormationBoundaryY } from './terrain.ts';

const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
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
    ['fR > 0.002 && keepS > 0.002', 'aR = groundSamp(uAlbR, uMeanR, uv * 0.155, df, mipB);', 'the rock'],
    // the map-borders lane (2026-10-03): a paved map's steep faces take the bare ground (D), inside the same branch
    ['fR > 0.002 && keepS > 0.002', 'aR = groundSamp(uAlbD, uMeanD, uv * 0.210, df, mipB);', 'the rock on a paved map'],
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
  // ground lane (2026-10-03, the gauntlet's "softly repeating blotches"): the patchwork is the non-periodic field — two
  // explicit-LOD reads of the noise, turned 42° apart at incommensurate scales (nzq), so its 17.5 m tile never repeats
  assert.ok(blockAfter(frag, 'patchW > 0.003', 'patchwork').includes('nzq(uvW, 0.057'), 'the cover patchwork is the non-periodic explicit-LOD field');
  const nzq = unique(frag, /vec2 nzq\(vec2 p, float s, vec2 o\) \{([\s\S]*?)\n\}/g, 'the non-periodic field')[1];
  assert.equal((nzq.match(/\bnz\(/g) ?? []).length, 2, 'nzq: two explicit-LOD reads');
  assert.ok(/0\.7431 \* p\.x - 0\.6691 \* p\.y/.test(nzq) && nzq.includes('s * 0.7243'), 'nzq: the second read is turned and rescaled');
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
assert.equal(resolveGroundReduxProfile('moon').windRipple, 0, 'and no wind ripples on it');
// 2026-10-03 the ground lane: a volcanic basin (Caldera, groundRedux VOLCANIC) takes no wind's ripples either
// (2026-10-05, the map-revival lane's Caldera round 2: Aso's grassland — still no sand ripples, and the land's own
// patchwork of greens)
assert.equal(resolveGroundReduxProfile('caldera').windRipple, 0, 'no wind ripples on the caldera');
assert.equal(resolveGroundReduxProfile('caldera').patchwork, 1, 'Aso\'s grassland keeps the land\'s patchwork');
// 2026-10-05 the map-revival lane's Copper Mesa round 2: Queenstown's conglomerate gravel, no sand to ripple
assert.equal(resolveGroundReduxProfile('copper_mesa').windRipple, 0, 'no wind ripples on the bare hills');
for (const id of MAP_IDS) if (id !== 'moon' && id !== 'caldera' && id !== 'copper_mesa') assert.equal(resolveGroundReduxProfile(id).windRipple, 1, `${id}: its authored ripples at full`);
// the sand trains: no global phase over a per-position wind (the round-43 marble), the cell function in its place
assert.ok(!/float rphase = dot\(uv, wind\)/.test(active(terrain)), 'the global ripple phase over a turned wind is gone');
assert.ok(/vec2 sandWaves\(vec2 p, vec2 w0, float cellM, float swing, float warp, vec2 k, vec2 amp, out float tone\) \{/.test(terrain), 'the cell-blended wave trains');
assert.ok(/float d = dot\(p - \(c \+ 0\.5\) \* cellM, w\);/.test(terrain), 'each train measures its phase from its own cell centre');
assert.equal(resolveGroundReduxProfile('whiteout').climate, 'snow');
assert.equal(resolveGroundReduxProfile('desert').climate, 'arid');
assert.equal(resolveGroundReduxProfile('verdant').climate, 'vegetated');

// terrain v3: the ring is this material — every face of the bound ring and its far range draws with the terrain program
const ground = readFileSync(new URL('./horizonAutumnGround.ts', import.meta.url), 'utf8');
assert.ok(/bindAutumnHorizonGround\(horizonMesh, mat, splatTextures, \{[\s\S]{0,200}continuousGround: true/.test(terrain), 'the ring binds as continuous ground');
assert.ok(ground.includes('if (continuousGround || i < nearCount) terrainFaces.push(a, c, b);'), 'so every ring face takes the terrain group');
assert.ok(ground.includes('far.material = [far.material, terrain];') && ground.includes('geometry.addGroup(0, index.count, 1);'), 'and the far range too');
const sandLaws = (source) => {
  const frag = shaderOf(source);
  const bed = /float bedW = ([^;]+);/.exec(frag);
  assert.ok(bed, 'the bedform weight exists');
  assert.ok(bed[1].includes('(1.0 - smoothstep(0.035, 0.09, slope))'), 'dune bedforms stay on gentle sand (gone by 24 degrees)');
  assert.ok(/\* sandCoverage\s*$/.test(bed[1]), 'the shore gate stays the last factor');
  assert.ok(/float wRipW = [^;]*\(1\.0 - smoothstep\(150\.0, 450\.0, camDist\)\)[^;]*;/.test(frag), 'the slip-face contour wave fades by the true camera distance');
  const flowAt = frag.indexOf('flow *= 1.0 - smoothstep(250.0, 600.0, camDist);');
  assert.ok(flowAt > 0 && flowAt < frag.indexOf('a.rgb *= (1.0 + flow * 0.05 * sandFaceW)'), 'the flow sine fades before it is applied');
  assert.ok(frag.includes('uniform vec2 uRingReliefWall;'), 'the ring atlas gradient\'s wall band is declared');
  assert.ok(/gRingGrad = \(ringRel\.xy \* 2\.0 - 1\.0\) \* uRingReliefGrad \* ringW\s*\* \(1\.0 - smoothstep\(uRingReliefWall\.x, uRingReliefWall\.y, 1\.0 - clamp\(wn\.y, 0\.0, 1\.0\)\)\);/.test(frag),
    'it fades the gradient alone, by the ring face\'s own geometric slope');
  assert.ok(/gRingAo = 1\.0 - \(1\.0 - pow\(ringRel\.z, 1\.4\)\) \* 0\.8 \* ringW;/.test(frag), 'the occlusion keeps its full weight');
};
sandLaws(terrain);
for (const [from, to, label] of [
  [' * (1.0 - smoothstep(0.035, 0.09, slope))', '', 'bedforms on every slope'],
  [' * (1.0 - smoothstep(150.0, 450.0, camDist))', '', 'contour wave by footprint alone'],
  ['flow *= 1.0 - smoothstep(250.0, 600.0, camDist);', '', 'unfaded flow sine'],
]) {
  assert.equal(terrain.split(from).length, 2, `v3 mutation seam exists: ${label}`);
  assert.throws(() => sandLaws(terrain.replace(from, to)), `v3 mutant refused: ${label}`);
}
// the slope gate on scalar ports: full below 15 degrees, none above 24.5 degrees
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const bedGate = (deg) => 1 - smooth(0.035, 0.09, 1 - Math.cos(deg * Math.PI / 180));
assert.ok(bedGate(10) > 0.99 && bedGate(15) > 0.98 && bedGate(25) < 0.01 && bedGate(40) === 0, 'bedform gate: dunes yes, flanks no');
assert.ok(terrain.includes('shader.uniforms.uRingReliefWall = ringReliefUniforms.uRingReliefWall;') && terrain.includes('uRingReliefWall: { value: new THREE.Vector2(2, 3) },'),
  'the wall band rides with the ring relief uniforms, off until the ring binds');
assert.ok(terrain.includes('mat.userData.splatUniforms = shader.uniforms;'), 'the probes can reach every program uniform');
// the policy: the tablelands and the martian scarps fade the gradient on their flanks and walls; every other range keeps it
assert.deepEqual(Object.keys(RING_RELIEF_WALL_BAND).sort(), ['martian', 'mesa'], 'the wall band applies to the mesa and martian characters only');
for (const [character, [lo, hi]] of Object.entries(RING_RELIEF_WALL_BAND)) {
  assert.ok(lo > 0 && hi > lo && hi < 0.5, `${character}: a band inside the face slope range (caps keep their relief)`);
}
assert.ok(ground.includes("const wallBand = character ? RING_RELIEF_WALL_BAND[character] : undefined;") && ground.includes('wall.set(...(wallBand ?? RING_RELIEF_WALL_NONE));'),
  'the ring bind sets the band per relief character (none elsewhere)');

// 2026-10-03 the ground lane: the bed law's CPU twins (terrainBedWobbleAt, terrainFormationBoundaryY) carry the shader's
// constants (gBedWob, the uFormation step), stay inside their amplitudes and wander — the scenery lane's bedrock skin
// stripes by them, so its beds and the terrain's strata are one rock
{
  const shader = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  assert.ok(shader.includes('gBedWob = (nz(wp.xz, 0.0208, vec2(0.37, 0.83)).g - 0.5) * 3.2 + (nz(wp.xz, 0.0588, vec2(0.71, 0.19)).r - 0.5) * 1.1;'),
    'the shader\'s bed wander is the twin\'s law');
  assert.ok(shader.includes('(nz(wp.xz, 0.0071, vec2(0.83, 0.41)).r - 0.5) * 2.0 * uFormation.y'), 'the formation boundary\'s wander is the twin\'s law');
  let lo = Infinity, hi = -Infinity, sum = 0, sq = 0, n = 0;
  for (let z = -500; z <= 500; z += 7.3) for (let x = -500; x <= 500; x += 7.3) {
    const w = terrainBedWobbleAt(x, z);
    lo = Math.min(lo, w); hi = Math.max(hi, w); sum += w; sq += w * w; n++;
    const y = terrainFormationBoundaryY(x, z, 10, 110, { atFrac: 0.3, wobbleM: 3 });
    assert.ok(y >= 40 - 3 - 1e-9 && y <= 40 + 3 + 1e-9, 'the formation boundary wanders within its ±m');
  }
  const sd = Math.sqrt(sq / n - (sum / n) ** 2);
  assert.ok(lo >= -2.15 - 1e-9 && hi <= 2.15 + 1e-9, `the bed wander stays inside ±2.15 m (${lo.toFixed(2)}..${hi.toFixed(2)})`);
  assert.ok(sd > 0.2, `the beds wander (sd ${sd.toFixed(2)} m)`);
}
console.log(`terrainMaterialV2: coverage-gated layers (7 gates, 512 executed coverage cases), far band without detail normals, one-fetch far variant on measured means, explicit-LOD noise, exposure and non-periodic beds on ${MAP_IDS.length} maps, the ring as this material (bedforms on gentle sand, distance-faded slip-face sines, the atlas gradient's wall band), ${mutants.length + 3} mutation controls PASS; no GPU/art claim`);
