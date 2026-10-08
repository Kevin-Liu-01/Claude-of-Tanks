// nightKey.selftest — the skies lane (2026-10-07; the gauntlet's wave 250 on Highland Reservoir at night, both critics:
// "the night is a blue-tinted day: the cumulus across the top third is lit like daytime clouds, under an oversized
// starfield as dense as snow, and the foreground grass stays vivid lime"). Three night-only changes:
// 1. The night's key on the clouds: at full night the moon's share of the layer's light is nightKey of the sun's and
//    the sky's is nightAmbient. A day or sunset sky, a constant sky (Mars) and a forced galaxy night are untouched.
// 2. A terrestrial night ranks its stars by magnitude: a star in 4 % of the cells, most of them faint and a handful
//    bright. The galaxy domes keep round 22's field. The law is mirrored here in doubles; the GPU's float hash differs,
//    so the receipt pins the field's statistics, not its stars.
// 3. The grade's scotopic shift reaches the moonlit midtones and dims them a little, and a warm light keeps its colour.
//    The grade is mirrored from post.ts's own lines (nightEmissionMaterial.selftest runs the whole chain through it).
// No GPU or art claim: the lab's frames judge the look.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deriveCloudLayerPreset, loadCloudscapeLayers } from './cloudPresets.ts';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { MARS_SKY_PRESET } from './marsAtmosphere.ts';
import { createBattleAtmosphereRuntime } from './battleAtmosphereRuntime.ts';
import { getMapConfig } from '../world/maps/index.ts';
import { resolveLightModel } from './lightModelCore.ts';

await loadCloudscapeLayers();
const tune = (t) => { globalThis.__LIGHT_TUNE = t; };
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} against ${b}`);

// ---- 1. the clouds' night key, on the battle runtime's own night and sunset presets
{
  const config = getMapConfig('reservoir');
  const authored = { ...DEFAULT_SKY_PRESET, ...config.sky, cloudscape: config.clouds };
  const presets = {};
  for (const time of ['day', 'sunset', 'night']) {
    const runtime = createBattleAtmosphereRuntime({ getAuthoredPreset: () => authored, applyPreset: (p) => { presets[time] = p; } });
    runtime.prepare(7, 'reservoir', [time]);
    assert.equal(runtime.weather.timeOfDay, time, `the runtime selects the ${time}`);
  }
  tune(undefined);
  const day = deriveCloudLayerPreset(presets.day), dusk = deriveCloudLayerPreset(presets.sunset), night = deriveCloudLayerPreset(presets.night);
  assert.equal(night.timeOfDay, 'night');
  near(night.sunGain, day.sunGain * 0.3, 'at full night the moon lights the layer at 0.3 of the sun');
  near(night.ambientScale, day.ambientScale * 0.8, 'and the sky at 0.8');
  assert.deepEqual([dusk.sunGain, dusk.ambientScale], [day.sunGain, day.ambientScale], 'the sunset keeps the day\'s key');
  // the knobs (the lab's variants) and the night amount's ramp (sky.ts's law: full at 0.08, none from 0.30)
  tune({ NIGHT_CLOUD_KEY: 0.5, NIGHT_CLOUD_AMBIENT: 1 });
  const tuned = deriveCloudLayerPreset(presets.night);
  near(tuned.sunGain, day.sunGain * 0.5, 'NIGHT_CLOUD_KEY');
  near(tuned.ambientScale, day.ambientScale, 'NIGHT_CLOUD_AMBIENT');
  tune(undefined);
  const half = deriveCloudLayerPreset({ ...presets.night, skyIntensity: 0.19 });
  near(half.sunGain, deriveCloudLayerPreset({ ...presets.night, skyIntensity: 0.31 }).sunGain * 0.65, 'half way down the ramp, half the cut');
  // an authored layer override is keyed too (the night is light, not shape)
  const override = deriveCloudLayerPreset({ ...presets.night, cloudLayer: { sunGain: 2 } });
  near(override.sunGain, 0.6, 'an authored sunGain takes the night key');
  // a constant sky and a forced night sky keep their own light at any knob
  tune({ NIGHT_CLOUD_KEY: 0.01, NIGHT_CLOUD_AMBIENT: 0.01 });
  const mars = deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...MARS_SKY_PRESET });
  const marsRef = (tune(undefined), deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...MARS_SKY_PRESET }));
  assert.deepEqual([mars.sunGain, mars.ambientScale], [marsRef.sunGain, marsRef.ambientScale], 'Mars\' constant sky (diurnal false) is untouched');
  tune({ NIGHT_CLOUD_KEY: 0.01 });
  const galaxy = deriveCloudLayerPreset({ ...presets.night, nightSky: 1 });
  tune(undefined);
  assert.equal(galaxy.sunGain, day.sunGain, 'a forced night sky (a galaxy dome) is untouched');
  tune({ NIGHT_CLOUD_KEY: 0.01 });
  assert.equal(deriveCloudLayerPreset(presets.day).sunGain, day.sunGain, 'a day sky never reads the knob');
  tune(undefined);
}

// ---- 1b. Olympus Basin (the owner's decision in the PR body; wave 65's critics: "physically impossible daytime Mars"): the
// galaxy dome stays, the basin is lit by the planet in it — a dim, cool key — and takes the night's ground treatment
{
  const was = { sunIntensity: 3.2, sunColorHex: 0xe4ebff, hemiIntensity: 0.56, fillIntensity: 0.36 };
  const M = MARS_SKY_PRESET;
  assert.ok(M.nightSky === 1 && M.galaxy === 1.9 && M.skyIntensity === 0.06 && M.planetDeg === 3.4, 'the galaxy dome as the owner asked');
  assert.ok(M.sunIntensity <= was.sunIntensity * 0.4, `a dim key (${M.sunIntensity} against ${was.sunIntensity})`);
  assert.ok(M.hemiIntensity < was.hemiIntensity && M.fillIntensity < was.fillIntensity, 'the sky and the fill dimmed with it');
  const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const [r0, , b0] = rgb(was.sunColorHex), [r1, , b1] = rgb(M.sunColorHex);
  assert.ok(b1 / r1 > b0 / r0 * 1.05, `a cooler key (B/R ${(b0 / r0).toFixed(2)} -> ${(b1 / r1).toFixed(2)})`);
  const mars = resolveLightModel({ ...DEFAULT_SKY_PRESET, ...M }, null, null);
  assert.equal(mars.mode, 'legacy');
  assert.equal(mars.night, 1, 'the basin takes the night grade (the light model\'s night drives post.ts\'s scotopic shift)');
  assert.equal(mars.sunIntensity, M.sunIntensity);
  // Earthrise Basin's galaxy sky keeps its daylight key
  const moon = resolveLightModel({ ...DEFAULT_SKY_PRESET, ...getMapConfig('moon').sky }, null, null);
  assert.equal(moon.night, 0, 'Earthrise Basin keeps its daylight key');
}

// ---- 2. the starfield: the law in the shader, its wiring, and its statistics against round 22's
const sky = readFileSync(new URL('./sky.ts', import.meta.url), 'utf8');
for (const line of [
  'uniform vec4 uStarLaw;',
  'if ( uStarLaw.x > 0.5 ) {',
  'float share = uStarLaw.y * ( 1.0 + band * 2.5 );',
  'float rank = ( h.z - ( 1.0 - share ) ) / share;',
  'float flux = pow( max( rank, 0.002 ), -0.89 );',
  'float radius = uStarLaw.w * min( 2.0, 1.0 + 0.12 * log2( flux ) );',
  'stars += tint * ( uStarLaw.z * flux ) * exp( -dot( offs, offs ) / ( radius * radius ) );',
  // round 22's field, kept exactly for the galaxy domes
  'float presence = step( 1.0 - ( 0.11 + band * 0.42 ), h.z );',
  'float mag = pow( fract( h.z * 7.31 ), 8.0 );',
  'float radius = 0.075 + mag * 0.11;',
  'stars += tint * pointW * ( 0.09 + mag * 1.45 );',
  // the wiring: both domes share the uniform; the live dome takes the lab's knobs
  'u.uStarLaw.value.set(preset.nightSky == null ? 1 : 0, 0.04, 0.003, 0.06);',
  'shader.uniforms.uStarLaw = u.uStarLaw;',
  'uStarLaw: skyUniforms.uStarLaw,',
  "law.set(law.x, lightTune('STAR_DENSITY', law.y), lightTune('STAR_FLUX', law.z), lightTune('STAR_RADIUS', law.w));",
]) assert.ok(sky.includes(line), `sky.ts: ${line}`);
assert.equal(sky.split('applyStarLawTune(sky.material.uniforms);').length, 3, 'the live dome takes the knobs at creation and at each preset');
{
  // the hemisphere's cells (104 a radian, the shader's grid), weighted by their solid angle; the band's weight as the shader
  // has it (galaxy 1); the old field's and the new one's star counts and their integrated flux (peak × radius²: what a
  // sub-pixel star shows once the temporal AA has spread it)
  const fract = (x) => x - Math.floor(x);
  const hash = (cx, cy) => [fract(Math.sin(cx * 127.1 + cy * 311.7) * 43758.5453), fract(Math.sin(cx * 269.5 + cy * 183.3) * 43758.5453),
    fract(Math.sin(cx * 419.2 + cy * 371.9) * 43758.5453)];
  const bandN = (() => { const v = [0.47, 0.88, -0.10], l = Math.hypot(...v); return v.map((x) => x / l); })();
  const K = 104, old = { n: 0, flux: [] }, fresh = { n: 0, flux: [] };
  for (let iy = 0; iy < Math.floor(K * Math.PI / 2); iy++) {
    const lat = (iy + 0.5) / K;
    const w = Math.cos(lat);
    for (let ix = Math.floor(-K * Math.PI); ix < Math.ceil(K * Math.PI); ix++) {
      if (((ix * 7 + iy * 13) % 5 + 5) % 5) continue; // a fifth of the cells, evenly spread (the counts below are scaled)
      const lon = (ix + 0.5) / K;
      const d = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)];
      const bd = Math.abs(d[0] * bandN[0] + d[1] * bandN[1] + d[2] * bandN[2]);
      const band = Math.exp(-bd * bd * 34);
      const [hx, , hz] = hash(ix, iy);
      void hx;
      if (hz >= 1 - (0.11 + band * 0.42)) {
        const mag = fract(hz * 7.31) ** 8;
        old.n += w; old.flux.push([(0.09 + mag * 1.45) * (0.075 + mag * 0.11) ** 2, w]);
      }
      const share = 0.04 * (1 + band * 2.5), rank = (hz - (1 - share)) / share;
      if (rank > 0) {
        const flux = Math.max(rank, 0.002) ** -0.89, radius = 0.06 * Math.min(2, 1 + 0.12 * Math.log2(flux));
        fresh.n += w; fresh.flux.push([0.003 * flux * radius ** 2, w]);
      }
    }
  }
  // (stars over the hemisphere: each sampled cell stands for five, weighted by its solid angle against an equatorial cell's)
  const count = (field, min) => 5 * field.flux.reduce((s, [f, w]) => s + (f >= min ? w : 0), 0);
  const typicalOld = 0.09 * 0.075 ** 2; // round 22's common star (nine in ten of its field)
  const oldVisible = count(old, typicalOld * 0.999), freshVisible = count(fresh, typicalOld / 3);
  const freshBright = count(fresh, typicalOld);
  // (measured: 3,800 stars against 11,900; 410 at a third of round 22's common star or more against all of its 11,900; 160 as
  // bright; 44 three times as bright, 10 ten times; the brightest a fifth of round 22's)
  assert.ok(fresh.n / old.n > 0.25 && fresh.n / old.n < 0.45, `a star in fewer cells (${(fresh.n / old.n).toFixed(2)} of round 22's)`);
  assert.ok(freshVisible < oldVisible / 8, `an eighth or fewer show a third of round 22's common star (${freshVisible.toFixed(0)} against ${oldVisible.toFixed(0)} weighted cells)`);
  assert.ok(freshBright > 10 && freshBright < freshVisible / 2, `a few stars outshine it (${freshBright.toFixed(0)})`);
  const brightest = Math.max(...fresh.flux.map(([f]) => f)), faintest = Math.min(...fresh.flux.map(([f]) => f));
  assert.ok(brightest / faintest > 500, `magnitude falloff: the brightest ${(brightest / faintest).toFixed(0)} times the faintest`);
  assert.ok(brightest < 1.54 * 0.185 ** 2 / 3, 'and well under round 22\'s brightest');
}

// ---- 3. the grade's scotopic shift
{
  const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
  const constant = (name) => { const m = post.match(new RegExp(`const ${name} = ([0-9.]+);`)); assert.ok(m, name); return Number(m[1]); };
  const S = constant('GRADE_NIGHT_SCOTOPIC'), TOP = constant('GRADE_NIGHT_SCOTOPIC_TOP'), DIM = constant('GRADE_NIGHT_SCOTOPIC_DIM');
  const m = post.match(/float warm = smoothstep\( ([0-9.]+), ([0-9.]+), col\.r - col\.b \);\s*float scot = uNight \* uNightGrade\.x \* \( 1\.0 - smoothstep\( ([0-9.]+), uNightGrade\.y, luma \) \) \* \( 1\.0 - warm \);\s*col = mix\( col, luma \* vec3\( ([0-9.]+), ([0-9.]+), ([0-9.]+) \) \* \( 1\.0 - uNightGrade\.z \), scot \);/);
  assert.ok(m, 'post.ts: the night\'s shift as mirrored here');
  const [warmLo, warmHi, lo, ...blue] = m.slice(1).map(Number);
  assert.ok(post.includes("(u.uNightGrade.value as THREE.Vector3).set(lightTune('GRADE_NIGHT_SCOTOPIC', GRADE_NIGHT_SCOTOPIC),"), 'the knobs');
  assert.ok(post.includes('if (u.uNight.value > 0) {'), 'read only at night');
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const lumaOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const shift = (hex, night, s = S, top = TOP, dim = DIM, keepWarm = true) => {
    const c = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
    const luma = lumaOf(c), warm = keepWarm ? smooth(warmLo, warmHi, c[0] - c[2]) : 0;
    const scot = night * s * (1 - smooth(lo, top, luma)) * (1 - warm);
    return c.map((v, i) => v + (luma * blue[i] * (1 - dim) - v) * scot);
  };
  const chroma = (c) => Math.max(...c) - Math.min(...c);
  const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
  // the wave's lime blades (the greenest tenth of the foreground, 0x304a2a) and its mean ground (0x1c2619)
  // (the shift's target is a cool blue-grey, so what chroma stays is blue: the green over the other two is the lime)
  const greenOver = (c) => c[1] - Math.max(c[0], c[2]);
  const show = (c) => c.map((v) => Math.round(v * 255)).join(',');
  // (the dark ground was already mostly drained; the brighter blades were not)
  for (const [what, hex, wasGreen] of [['the lime blades', 0x304a2a, true], ['the moonlit ground', 0x1c2619, false]]) {
    const before = rgb(hex), oldShift = shift(hex, 1, 0.55, 0.55, 0, false), now = shift(hex, 1);
    if (wasGreen) assert.ok(greenOver(oldShift) > 0.02, `${what}: the 2026-10-01 shift left it green (${show(oldShift)})`);
    assert.ok(greenOver(now) <= 0.002 && now[2] >= now[0], `${what}: blue-grey, no green over it (${show(before)} -> ${show(now)})`);
    assert.ok(chroma(now) < chroma(before), `${what}: less colour (chroma ${chroma(before).toFixed(3)} -> ${chroma(now).toFixed(3)})`);
    assert.ok(lumaOf(now) < lumaOf(before) * 0.97, `${what}: a little darker (${lumaOf(before).toFixed(3)} -> ${lumaOf(now).toFixed(3)})`);
  }
  // warm lights keep their colour: a lit window, a sodium pool, a headlight's pool on the grass
  for (const [what, hex] of [['a lit window', 0xf0d2a0], ['a sodium pool', 0xc88c46], ['a headlight pool', 0x8c7a5a]]) {
    const before = rgb(hex), now = shift(hex, 1);
    assert.ok(now.every((v, i) => Math.abs(v - before[i]) < 2 / 255), `${what} keeps its colour within two levels (${show(before)} -> ${show(now)})`);
  }
  // the day never enters it
  assert.deepEqual(shift(0x304a2a, 0), rgb(0x304a2a), 'the day is untouched');
}
console.log('nightKey.selftest: the clouds\' night key (moon 0.3, sky 0.8, by the night amount; day, sunset, Mars and the galaxy domes untouched; the knobs), Olympus Basin planet-lit (the galaxy dome kept, a dim cool key, the night grade; Earthrise Basin unchanged), the starfield ranked by magnitude (a star in fewer cells, an eighth or fewer showing, a few bright, the galaxy domes on round 22\'s field) and the grade\'s scotopic shift through the moonlit midtones (blue-grey, a little darker, warm lights kept, the day untouched) PASS; no GPU/art claim');
