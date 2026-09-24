// Round 66 (2026-09-24): the FFT ocean. This receipt pins the contract without WebGL — the Stockham butterfly that
// the fragment passes compute (its JavaScript twin against a direct DFT, and the 2-D transform with the centred-k sign
// against the double sum on an 8×8 spectrum), the spectrum's symmetry and bands, the generated GLSL of every pass, the
// tier / renderer / float-buffer gates, the pass sequence and target hand-over on a recording renderer, the frame
// stride of the lower presets, the sheet's side of the handshake, the terrain wiring and the maps' authored sea states.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  OCEAN_BAND_WAVELENGTHS, OCEAN_CASCADES, OCEAN_FFT_SIZE, buildOceanSpectrum, inverseDftReference, oceanBands,
  oceanPassPlan, oceanSpectrumSteps, oceanStagePlan, oceanStageShader, resolveOceanState, spatialFieldReference,
  spatialFieldViaStockham, stockhamInverse,
} from './oceanSpectrum.ts';
import { createOceanField, oceanFieldSupported, oceanFrameStride, oceanGridSize } from './oceanFft.ts';
import { createShallowWaterSurface } from './shallowWater.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { waterContactProfile } from './waterContact.ts';

const TWO_PI = Math.PI * 2;
function pseudoRandom(count, seed) {
  const out = new Float64Array(count);
  let s = seed >>> 0;
  for (let i = 0; i < count; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; out[i] = s / 4294967296 - 0.5; }
  return out;
}

// 1. The butterfly. The plan factors every power of two into sixteens, eights, fours and twos; the per-output Stockham
//    stage sequence equals the direct inverse DFT; rows then columns with the (−1)^{x+z} sign equal the double sum.
assert.deepEqual(oceanStagePlan(128), [16, 8]);
assert.deepEqual(oceanStagePlan(64), [16, 4]);
assert.deepEqual(oceanStagePlan(256), [16, 16]);
assert.deepEqual(oceanStagePlan(8), [8]);
assert.throws(() => oceanStagePlan(96), /power of two/);
for (const n of [8, 32, 64, 128, 256]) {
  const input = pseudoRandom(n * 2, 17 + n);
  const fast = stockhamInverse(input, n), slow = inverseDftReference(input, n);
  let error = 0;
  for (let i = 0; i < fast.length; i++) error = Math.max(error, Math.abs(fast[i] - slow[i]));
  assert.ok(error < 1e-9, `n = ${n}: the Stockham stages equal the direct inverse DFT (max error ${error})`);
}
{
  const n = 8, spectrum = pseudoRandom(n * n * 2, 99);
  const fast = spatialFieldViaStockham(spectrum, n), slow = spatialFieldReference(spectrum, n);
  let error = 0, magnitude = 0;
  for (let i = 0; i < fast.length; i++) { error = Math.max(error, Math.abs(fast[i] - slow[i])); magnitude = Math.max(magnitude, Math.abs(slow[i])); }
  assert.ok(magnitude > 1 && error < 1e-9, `8×8: rows, columns and the sign equal Σ_k h̃(k) e^{ik·x} with k centred on texel n/2 (max error ${error})`);
}

// 2. The spectrum: kind defaults, merging, bands, symmetry, energy.
for (const kind of ['coast', 'lake', 'river', 'marsh']) {
  const state = resolveOceanState(kind);
  assert.equal(state.kind, kind);
  assert.ok(state.patches[0] > state.patches[1] && state.patches[1] > state.patches[2], `${kind}: patches large to small`);
  assert.ok(state.windSpeed > 0 && state.fetchKm > 0 && state.amplitude === 1);
}
{
  const merged = resolveOceanState('lake', { windSpeed: 40, amplitude: -3, patches: [10, 20, 30], windDirDeg: 33, foam: 2 });
  assert.equal(merged.windSpeed, 30, 'wind clamps to the 30 m/s ceiling');
  assert.equal(merged.amplitude, 0, 'amplitude clamps at zero');
  assert.deepEqual(merged.patches, resolveOceanState('lake').patches, 'ascending patches are rejected for the kind default');
  assert.equal(merged.swellDirDeg, 33, 'the swell follows an authored wind direction unless authored itself');
  assert.equal(merged.foam, 1);
  assert.equal(resolveOceanState('coast', null).windSpeed, resolveOceanState('coast').windSpeed);
}
{
  const bands = oceanBands([400, 96, 12]);
  assert.equal(bands.length, 3);
  assert.ok(bands[0][0] < 1e-3 && bands[2][1] === Infinity, 'the largest patch starts at k ≈ 0, the smallest runs to its Nyquist');
  assert.ok(Math.abs(bands[0][1] - TWO_PI * OCEAN_BAND_WAVELENGTHS / 96) < 1e-12 && bands[0][1] === bands[1][0] && bands[1][1] === bands[2][0],
    'the bands are contiguous: a wave belongs to the smallest patch that holds six wavelengths');
}
{
  const state = resolveOceanState('coast');
  const n = 16, spectrum = buildOceanSpectrum(state, n, 5);
  assert.equal(spectrum.n, n); assert.equal(spectrum.rows, n + 1); assert.equal(spectrum.cascades, OCEAN_CASCADES);
  assert.equal(spectrum.data.length, n * (n + 1) * OCEAN_CASCADES * 4);
  const { rows, data } = spectrum;
  let mirrors = 0, energyTexels = 0;
  for (let c = 0; c < OCEAN_CASCADES; c++) {
    for (let i = 0; i < n; i++) {
      const nyq = ((c * rows) * n + i) * 4, col0 = ((c * rows + i) * n) * 4;
      assert.ok(data[nyq] === 0 && data[nyq + 1] === 0 && data[col0] === 0 && data[col0 + 1] === 0, 'the Nyquist row and column carry nothing');
    }
    for (let j = 1; j < n; j++) for (let i = 1; i < n; i++) {
      const t = ((c * rows + j) * n + i) * 4, m = ((c * rows + ((n - j) % n)) * n + ((n - i) % n)) * 4;
      assert.equal(data[t + 2], data[m], 'zw hold h̃0(−k): its real part');
      assert.equal(data[t + 3], -data[m + 1], 'zw hold h̃0*(−k): the conjugate');
      if (data[t] !== 0 || data[t + 1] !== 0) energyTexels++;
      mirrors++;
    }
    for (let i = 0; i < n * 4; i++) assert.equal(data[(c * rows + n) * n * 4 + i], data[(c * rows) * n * 4 + i], 'the padded row repeats the tile\'s first row');
  }
  assert.ok(mirrors === OCEAN_CASCADES * (n - 1) * (n - 1) && energyTexels > 100, `${energyTexels} texels carry energy`);
  const centre = ((0 * rows + n / 2) * n + n / 2) * 4;
  assert.ok(data[centre] === 0 && data[centre + 1] === 0, 'k = 0 carries nothing');
  assert.ok(spectrum.hs > 0.2 && spectrum.hs < 1.2, `coast Hs ${spectrum.hs.toFixed(3)} m is a sea a tank can wade`);
  const calmer = buildOceanSpectrum(resolveOceanState('coast', { windSpeed: 3 }), n, 5);
  assert.ok(calmer.hs < spectrum.hs, 'less wind, lower seas');
  const scaled = buildOceanSpectrum(resolveOceanState('coast', { amplitude: 0.5 }), n, 5);
  assert.ok(Math.abs(scaled.hs - spectrum.hs * 0.5) < 1e-9, 'amplitude scales the significant height linearly');
  const noSwell = buildOceanSpectrum(resolveOceanState('coast', { swell: 0 }), n, 5);
  assert.ok(noSwell.hs < spectrum.hs && noSwell.hs > spectrum.hs * 0.6, 'the swell adds a bounded share of the wind sea\'s energy');
  assert.deepEqual(Array.from(buildOceanSpectrum(state, n, 5).data), Array.from(spectrum.data), 'deterministic per seed');
  assert.notDeepEqual(Array.from(buildOceanSpectrum(state, n, 6).data), Array.from(spectrum.data), 'another seed, other phases');
  const slices = [...oceanSpectrumSteps(state, n, 5)];
  assert.equal(slices.length, OCEAN_CASCADES, 'the sliced build yields once per cascade');
  assert.deepEqual(Array.from(slices[slices.length - 1].data), Array.from(spectrum.data), 'the last slice is the whole spectrum');
}

// 3. The shaders: the pass plan and the GLSL each pass carries.
{
  const plan = oceanPassPlan(OCEAN_FFT_SIZE, OCEAN_CASCADES);
  assert.deepEqual(plan.map((p) => [p.horizontal, p.radix, p.ns, p.first, p.last]),
    [[true, 16, 1, true, false], [true, 8, 16, false, false], [false, 16, 1, false, false], [false, 8, 16, false, true]],
    '128²: a radix-16 and a radix-8 stage per axis — four passes, the first evolving the spectrum, the last writing the maps');
  assert.equal(oceanPassPlan(64, 3).length, 4);
  assert.equal(oceanPassPlan(16, 3).length, 2, '16²: one stage per axis');
  const sources = plan.map((p) => oceanStageShader(p));
  for (const [index, glsl] of sources.entries()) {
    const p = plan[index];
    assert.ok(glsl.includes(`#define RADIX ${p.radix}`) && glsl.includes(`#define NS ${p.ns}`) && glsl.includes(`#define SPAN ${p.ns * p.radix}`)
      && glsl.includes(`#define STRIDE ${OCEAN_FFT_SIZE / p.radix}`) && glsl.includes(`#define ROWS ${OCEAN_FFT_SIZE + 1}`), `pass ${index}: stage constants`);
    for (const line of ['int q = o / SPAN;', 'int rem = o - q * SPAN;', 'int r = rem / NS;', 'int jm = rem - r * NS;', 'int j = q * NS + jm;',
      'float ang = TAU * float(jm) / float(SPAN);', 'int idx = j + rr * STRIDE;', 'float da = TAU * float((r * rr) % RADIX) / float(RADIX);',
      'accA += cmul2(cmul2(a, w), wd);', 'if (yl >= N) yl = 0;', 'layout(location = 0) out vec4 oA;', 'layout(location = 1) out vec4 oB;']) {
      assert.ok(glsl.includes(line), `pass ${index}: ${line}`);
    }
    assert.ok(glsl.includes(p.horizontal ? 'int o = p.x;' : 'int o = yl;'), `pass ${index}: the transform index is the column or the row inside the tile`);
    assert.ok(glsl.includes(p.horizontal ? 'ivec2 tc = ivec2(idx, p.y);' : 'ivec2 tc = ivec2(p.x, tile * ROWS + idx);'), `pass ${index}: inputs along the axis`);
    assert.equal(glsl.includes('void spectrumFields('), p.first, `pass ${index}: only the first pass evolves the spectrum`);
    assert.equal(glsl.includes('float sign = ((p.x + yl) & 1) == 0 ? 1.0 : -1.0;'), p.last, `pass ${index}: only the last pass applies the sign`);
  }
  const first = sources[0], last = sources[3];
  for (const line of ['float omega = sqrt(G * k * tanh(min(k * uDepth, 20.0)));',
    'float hr = h.x * cs - h.y * sn + h.z * cs + h.w * sn;', 'float hi = h.x * sn + h.y * cs - h.z * sn + h.w * cs;',
    'vec2 c0 = vec2(-(fx * hi + fz * hr), fx * hr - fz * hi);', 'vec2 c1 = vec2(hr - q * hi, hi + q * hr);',
    'vec2 c2 = vec2(-(kx * hi + kz * hr), kx * hr - kz * hi);', 'vec2 c3 = vec2(ax * hr - bz * hi, ax * hi + bz * hr);',
    'spectrumFields(tc, idx, yl, uPatch[tile], a, b);']) assert.ok(first.includes(line), `first pass: ${line}`);
  for (const line of ['float J = jxx * jzz - jxz * jxz;', 'float prev = texelFetch(tPrev, p, 0).a;',
    'float gen = clamp((uFoam.x - J) * uFoam.y, 0.0, 1.0);', 'oA = vec4(lam * Dx, Dy, lam * Dz, foam);', 'oB = vec4(Dyx, Dyz, lam * Dxx, lam * Dzz);'])
    assert.ok(last.includes(line), `last pass: ${line}`);
  assert.ok(!sources[1].includes('texelFetch(tH0') && sources[1].includes('a = texelFetch(tA, tc, 0);'), 'the middle passes read the ping-pong pair');
}

// 4. Gates and the preset policy.
function recordingRenderer(extensions = ['EXT_color_buffer_float']) {
  const log = [];
  let target = null;
  return {
    log, autoClear: true,
    extensions: { has: (name) => extensions.includes(name) },
    getRenderTarget() { return target; },
    setRenderTarget(value) { target = value; log.push(['target', value?.texture?.name ?? null]); },
    render(root) {
      const u = root.material.uniforms;
      log.push(['render', root.material.name, u?.tA?.value?.name ?? null, u?.tPrev?.value?.name ?? null, u?.uTime?.value ?? null, this.autoClear]);
    },
  };
}
const state = resolveOceanState('coast', { amplitude: 0.7 });
const smallSpectrum = buildOceanSpectrum(state, 16, 1);
assert.equal(oceanFieldSupported(null), false);
assert.equal(oceanFieldSupported({ setupShadowMaterial() {} }), false, 'an engine context is not a renderer');
assert.equal(oceanFieldSupported(recordingRenderer(), 'mobile'), false, 'the mobile tier keeps the sheet untouched');
assert.equal(oceanFieldSupported(recordingRenderer([]), 'desktop'), false, 'no float colour buffers, no field');
assert.equal(oceanFieldSupported(recordingRenderer(), 'desktop'), true);
assert.equal(createOceanField(recordingRenderer(), smallSpectrum, state, { tier: 'mobile' }), null);
assert.equal(createOceanField(recordingRenderer([]), smallSpectrum, state, { tier: 'desktop' }), null);
assert.equal(oceanGridSize('low'), OCEAN_FFT_SIZE / 2); assert.equal(oceanGridSize('medium'), OCEAN_FFT_SIZE); assert.equal(oceanGridSize('ultra'), OCEAN_FFT_SIZE);
assert.deepEqual(['low', 'medium', 'high', 'ultra'].map(oceanFrameStride), [2, 2, 1, 1], 'alternate frames below high');

// 5. The pass sequence on a recording renderer: priming, the target hand-over, the map sets alternating for the foam
//    feedback, the sheet-facing value objects, the stride, setTime and dispose.
{
  const renderer = recordingRenderer();
  const field = createOceanField(renderer, smallSpectrum, state, { tier: 'desktop', preset: 'high' });
  assert.ok(field);
  assert.equal(field.grid.w, 0, 'inactive until the first transform');
  assert.equal(field.displacement.value, null);
  assert.equal(field.hs, smallSpectrum.hs);
  field.update(1 / 60);
  const renders = renderer.log.filter((e) => e[0] === 'render');
  assert.deepEqual(renders.slice(0, 2).map((e) => e[1]), ['ocean:reset', 'ocean:reset'], 'the first transform primes both map sets to rest');
  const passes = renders.slice(2);
  assert.deepEqual(passes.map((e) => e[1]), ['ocean:h16:spectrum', 'ocean:v16:maps'], '16²: one stage per axis, the first from the spectrum, the last into the maps');
  const targets = renderer.log.filter((e) => e[0] === 'target').map((e) => e[1]);
  assert.deepEqual(targets, ['ocean.maps0.a', 'ocean.maps1.a', 'ocean.ping1.a', 'ocean.maps0.a', null],
    'primes maps0 / maps1, writes ping1 then maps0, restores the previous target');
  assert.equal(passes[0][2], 'ocean.ping0.a', 'the first pass\'s pair uniform points at ping0 (unused: it reads the spectrum)');
  assert.equal(passes[1][2], 'ocean.ping1.a', 'the last pass reads what the first wrote');
  assert.equal(passes[1][3], 'ocean.maps1.a', 'the foam feedback reads the other map set');
  assert.ok(Math.abs(passes[1][4] - 1 / 60) < 1e-12, 'the transform runs at the advanced clock');
  assert.ok(passes.every((e) => e[5] === false) && renderer.autoClear === true, 'autoClear off while rendering, restored after');
  assert.equal(field.displacement.value.name, 'ocean.maps0.a'); assert.equal(field.derivative.value.name, 'ocean.maps0.b');
  assert.equal(field.grid.w, 1); assert.equal(field.frames, 1);
  field.update(1 / 60);
  const second = renderer.log.filter((e) => e[0] === 'render').slice(4);
  assert.equal(second[1][3], 'ocean.maps0.a', 'the second frame reads maps0 …');
  assert.equal(field.displacement.value.name, 'ocean.maps1.a', '… and writes maps1');
  field.setTime(7.5); field.update(0.5);
  assert.ok(Math.abs(renderer.log.filter((e) => e[0] === 'render').at(-1)[4] - 7.6) < 1e-9, 'setTime pins the clock; a long frame advances at most 0.1 s');
  field.update(NaN); field.update(-1); field.update(0);
  assert.equal(field.frames, 3, 'bad input is ignored');
  field.dispose();
  field.update(1 / 60);
  assert.equal(field.frames, 3, 'a disposed field never renders');
  assert.equal(field.displacement.value, null); assert.equal(field.grid.w, 0);
  const low = createOceanField(recordingRenderer(), smallSpectrum, state, { tier: 'desktop', preset: 'low' });
  low.update(1 / 60); assert.equal(low.frames, 0, 'low: the first frame is skipped');
  low.update(1 / 60); assert.equal(low.frames, 1, 'low: alternate frames transform');
  low.dispose();
}

// 6. The sheet's side, the terrain wiring and the maps' sea states.
{
  const renderer = recordingRenderer();
  const field = createOceanField(renderer, smallSpectrum, state, { tier: 'desktop', preset: 'high' });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 0, 1], 3));
  geometry.setIndex([0, 2, 1]);
  const handed = [];
  const sheet = createShallowWaterSurface(geometry, new THREE.Texture(), new THREE.Texture(), 1024, 'saltwind', [0.4, 0.78],
    (material, hook) => handed.push(hook), null, null, field);
  assert.equal(sheet.ocean, field);
  assert.equal(sheet.mesh.userData.ocean, field, 'probes reach the field through the sheet');
  const probe = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  handed[0](probe);
  assert.equal(probe.uniforms.uOceanDisp, field.displacement, 'the displacement sampler IS the field\'s value object');
  assert.equal(probe.uniforms.uOceanDeriv, field.derivative);
  assert.equal(probe.uniforms.uOceanGrid.value, field.grid); assert.equal(probe.uniforms.uOceanPatch.value, field.patches);
  assert.deepEqual(probe.uniforms.uOceanLook.value.toArray().slice(0, 3), [state.foam, state.breakers, state.caustics]);
  assert.ok(Math.abs(probe.uniforms.uOceanLook.value.w - smallSpectrum.hs) < 1e-12, 'the sheet knows the significant height');
  assert.equal(probe.uniforms.uOceanDepth.value, waterContactProfile('saltwind').depthM, 'the bed law uses the map\'s wading depth');
  for (const line of ['transformed += oceanD * oceanLift;', 'float oceanLift = smoothstep(0.06, 0.55, oceanWet);', 'vOceanLag = oceanWorld.xz;'])
    assert.ok(probe.vertexShader.includes(line), `vertex: ${line}`);
  for (const line of ['oceanSlope += dv.xy * w;', 'float w = 1.0 - smoothstep(texel * 1.5, texel * 5.0, oceanFootprint);',
    'oceanBed = uOceanDepth * wet * wet * (3.0 - 2.0 * wet);', 'wakeFoam += oceanWhite;',
    'float causticFocus = clamp(1.0 / max(0.3, 1.0 + 0.25 * oceanBed * causticLap) - 1.0, -0.6, 1.6);',
    'return vec2(f.x + 0.5 / uOceanGrid.x, (f.y * uOceanGrid.x + 0.5 + c * uOceanGrid.y) / (uOceanGrid.y * uOceanGrid.z));'])
    assert.ok(probe.fragmentShader.includes(line), `fragment: ${line}`);
  assert.equal((probe.fragmentShader.match(/texture2D\(uWaterWave/g) ?? []).length, 3, 'the normal-map wave keeps its three fetches beside the cascades');
  assert.equal(sheet.mesh.material.customProgramCacheKey(), 'shallow-water-v13');
  sheet.update(1 / 60);
  assert.equal(field.frames, 1, 'the sheet\'s update runs the transform');
  sheet.setTime(2);
  sheet.update(1 / 60);
  assert.ok(Math.abs(renderer.log.filter((e) => e[0] === 'render').at(-1)[4] - (2 + 1 / 60)) < 1e-9, 'the sheet\'s clock pins the ocean\'s');
  // without a field the sheet declares an inactive grid and the same key
  const bare = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  const plain = createShallowWaterSurface(geometry, new THREE.Texture(), new THREE.Texture(), 1024, 'reservoir', [0.4, 0.78], (m, hook) => hook(bare));
  assert.equal(plain.ocean, null); assert.equal(bare.uniforms.uOceanGrid.value.w, 0); assert.equal(bare.uniforms.uOceanDisp.value, null);
  assert.ok(bare.fragmentShader.includes('if (uOceanGrid.w > 0.5) {'), 'every ocean term sits behind the active flag');
  sheet.mesh.material.dispose(); plain.mesh.material.dispose(); field.dispose();
}
{
  const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  for (const line of ['if (oceanFieldSupported(engineCtx.renderer)) {',
    "const oceanState = resolveOceanState(waterContactProfile(cfg.id || '').kind, cfg.ocean);",
    'for (const slice of oceanSpectrumSteps(oceanState, oceanGridSize(oceanPreset))) {',
    'if (oceanSpectrum) ocean = createOceanField(engineCtx.renderer, oceanSpectrum, oceanState, { preset: oceanPreset });',
    'ocean); // round 66: the FFT ocean the sheet displaces and shades with',
    'group.userData.disposeWater = ripples.dispose;',
    'group.userData.disposeWater = () => { disposeRipples?.(); disposeOcean(); };',
    'ocean?: OceanConfig;']) assert.ok(terrain.includes(line), `terrain: ${line}`);
  const seaMaps = MAP_IDS.filter((id) => { const c = getMapConfig(id); return c.splat?.seaLake && !c.terrain?.frozenMarshes; });
  assert.deepEqual(seaMaps.sort(), ['autumn', 'coastal', 'delta', 'fjord', 'mangrove', 'monsoon', 'oasis', 'polders', 'reservoir', 'saltwind', 'skybridge'],
    'the eleven maps with a water sheet');
  const rows = [];
  for (const id of seaMaps) {
    const cfg = getMapConfig(id);
    assert.ok(cfg.ocean && typeof cfg.ocean === 'object', `${id} authors an ocean block`);
    const kind = waterContactProfile(id).kind;
    const resolved = resolveOceanState(kind, cfg.ocean);
    for (const [key, value] of Object.entries(cfg.ocean)) assert.ok(key in resolved && Number.isFinite(value), `${id}.ocean.${key} is a known finite field`);
    assert.ok(resolved.amplitude > 0.3 && resolved.amplitude <= 1, `${id}: amplitude ${resolved.amplitude} within the authored range`);
    rows.push(`${id}:${kind}:${buildOceanSpectrum(resolved, 32, 1337).hs.toFixed(3)}`);
  }
  for (const [id, ceiling] of [['delta', 0.55], ['monsoon', 0.6], ['reservoir', 0.6], ['fjord', 0.45]]) {
    assert.ok(resolveOceanState(waterContactProfile(id).kind, getMapConfig(id).ocean).amplitude <= ceiling, `${id}: the owner's approved look keeps a low amplitude`);
  }
  for (const id of MAP_IDS) if (!seaMaps.includes(id)) assert.equal(getMapConfig(id).ocean, undefined, `${id}: no sheet, no ocean block`);
  console.log('oceanFft.selftest: Hs (32² spectra) ' + rows.join(' '));
}
console.log('oceanFft.selftest: Stockham butterfly against the DFT, 8×8 field against the double sum, spectrum symmetry and bands, '
  + 'pass GLSL, gates, pass sequence, presets, sheet handshake, terrain wiring and eleven authored sea states pinned');
