// 2026-10-01 (the clouds-and-skyboxes lane): the sky's weather beyond the volumetric slab, pinned without a GPU — the
// deterministic placement of the contrails and the storm cells, the uniform packing, the gating of every layer in the
// trace's GLSL, the time of day of cloudPresets.ts (the diurnal law of convective cloud, the per-time knobs, the
// moonlit albedo, the key light's hue, the ground's glow), and the composite's single dimming of the sky light.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  CLOUD_CONTRAIL_MAX, CLOUD_STORM_MAX, applyCloudWeatherPreset, cloudContrails, cloudStormCells, cloudWeatherGlsl, createCloudWeatherUniforms,
} from './cloudWeatherLayers.ts';
import {
  CLOUD_DIURNAL, CLOUD_MID_DEFAULTS, CLOUD_WEATHER_RULES, cloudLayerKey, cloudNightAmount, cloudTimeOfDay, deriveCloudLayerPreset,
} from './cloudPresets.ts';
import { CLOUDSCAPE_REGIMES, CLOUD_MID_KINDS } from './cloudscapes.ts';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { getMapConfig } from '../world/maps/index.ts';
import { MAP_IDS } from '../world/maps/catalog.ts';

const here = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

// ---- placement: deterministic per map, bounded, sane
{
  const base = { contrails: 6, contrailAge: 0.6, offset: [0.37, 0.71] };
  const a = cloudContrails(base), b = cloudContrails({ ...base });
  assert.deepEqual(a, b, 'the trails are a pure function of the preset');
  assert.equal(a.length, CLOUD_CONTRAIL_MAX);
  assert.notDeepEqual(cloudContrails({ ...base, offset: [0.12, 0.9] }), a, 'another map flies other trails');
  for (const t of a) {
    assert.ok(Math.abs(Math.hypot(...t.dir) - 1) < 1e-9, 'unit headings');
    assert.ok(t.headAge <= t.tailAge && t.tailAge <= 1 && t.headAge >= 0, 'a trail is younger at its head');
    assert.ok(Math.abs(t.offsetM) <= 13000 && Math.abs(t.centreM) <= 9000 && t.halfLengthM >= 14000 && t.halfLengthM <= 40000);
    assert.ok(t.depth > 0.3 && t.depth < 0.65);
  }
  assert.equal(cloudContrails({ ...base, contrails: 0 }).length, 0);
  assert.equal(cloudContrails({ ...base, contrails: 9 }).length, CLOUD_CONTRAIL_MAX, 'never past the uniform arrays');
}
{
  const p = { storms: 3, stormAzRad: 1.2, stormDistM: 26000, stormTopM: 11000, baseM: 1000, rain: 0.8, offset: [0.21, 0.55] };
  const cells = cloudStormCells(p);
  assert.deepEqual(cells, cloudStormCells({ ...p }));
  assert.equal(cells.length, CLOUD_STORM_MAX);
  for (const c of cells) {
    const d = Math.hypot(c.x, c.z);
    assert.ok(d >= 26000 * 0.82 - 1 && d <= 26000 * 1.22 + 1, `a cell stands at its distance (${d.toFixed(0)})`);
    let da = Math.atan2(c.z, c.x) - p.stormAzRad;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    assert.ok(Math.abs(da) <= 0.55 + 0.12 + 1e-9, 'inside its sector');
    assert.ok(c.anvilM > c.radiusM * 2 && c.topM > c.baseM + 5000 && c.baseM <= 1600 && c.rain >= 0.55 * 0.75);
  }
  assert.equal(cloudStormCells({ ...p, storms: 0 }).length, 0);
}

// ---- uniform packing: a layer the preset turns off is zero in the trace
{
  const u = createCloudWeatherUniforms();
  const verdant = deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...getMapConfig('verdant').sky, cloudscape: { regime: 'fair-weather-cumulus' } });
  applyCloudWeatherPreset(u, verdant);
  assert.equal(u.uMid.value.x, 0, 'no mid layer: zero coverage in the trace');
  assert.equal(u.uContrails.value, 0);
  assert.equal(u.uStorms.value, 0);
  assert.equal(u.uRain.value.x, 0);
  assert.equal(u.uFogBank.value.x, 0);
  const rich = { ...verdant, midKind: 1, midCoverage: 0.4, contrails: 3, storms: 2, stormAzRad: 0.5, rain: 0.6, fogBank: 0.3 };
  applyCloudWeatherPreset(u, rich);
  assert.deepEqual([u.uMid.value.x, u.uMidShape.value.z, u.uContrails.value, u.uStorms.value, u.uRain.value.x, u.uFogBank.value.x], [0.4, 1, 3, 2, 0.6, 0.3]);
  assert.ok(u.uStormA.value[1].length() > 0 && u.uStormA.value[2].x === 0 && u.uStormA.value[2].y === 0, 'two cells packed, the third left empty');
  assert.ok(u.uContrailA.value.length === CLOUD_CONTRAIL_MAX && u.uStormA.value.length === CLOUD_STORM_MAX);
  assert.ok(u.uMid.value instanceof THREE.Vector4);
}

// ---- the GLSL: every layer gated by its own uniform, no pow on a signed base, the mipmapped fields at level zero in loops
{
  const glsl = cloudWeatherGlsl(12000, 1500);
  for (const name of ['midLayer', 'midThickness', 'contrailDepth', 'stormCells', 'stormDensity', 'slabRain', 'cloudPrecip', 'seaFogBank', 'cloudOver', 'cloudCylinderSpan', 'cloudCylinderExit']) {
    assert.ok(new RegExp(`\\b${name}\\(`).test(glsl), `the weather GLSL defines ${name}`);
  }
  assert.match(glsl, /if \( uMid\.x <= 0\.0/, 'the mid layer is gated by its coverage');
  assert.match(glsl, /float\( i \) >= uContrails/, 'the trails by their count');
  assert.match(glsl, /if \( uStorms <= 0\.0/, 'the storm cells by their count');
  assert.match(glsl, /if \( uRain\.x <= 0\.0/, 'the rain by its amount');
  assert.match(glsl, /if \( uFogBank\.x <= 0\.0/, 'the fog bank by its amount');
  assert.doesNotMatch(glsl, /pow\( \(/, 'no pow of a signed difference (undefined in GLSL for a negative base)');
  assert.doesNotMatch(glsl, /texture\( tWeather|texture\( tStreets|texture2D\( tWeather/, 'the mipmapped weather fields are read at level zero (divergent loops pick unrelated mips)');
  for (const u of ['uMid', 'uMidShape', 'uMidShift', 'uMidDir', 'uContrailA', 'uContrailB', 'uContrails', 'uUpperDrift', 'uStormA', 'uStormB', 'uStorms', 'uRain', 'uFogBank']) {
    assert.match(glsl, new RegExp(`uniform [a-z0-9]+ ${u}\\b`), `${u} is declared`);
    assert.ok(u in createCloudWeatherUniforms(), `${u} has a uniform object`);
  }
}

// ---- the trace: the layered composite, the halo without pow, placement once per preset, the sky light dimmed once
{
  const layer = here('./volumetricClouds.ts');
  assert.ok(layer.includes('${cloudWeatherGlsl(CLOUD_WEATHER_TILE_M, CLOUD_AERIAL.cirrusHazeScaleM)}'), 'the trace includes the weather GLSL');
  assert.ok(layer.includes('acc = cloudOver( cloudOver( fogL, rainL ), acc );'), 'the fog bank and the rain stand in front of the slab');
  assert.ok(layer.includes('acc = cloudOver( cloudOver( cloudOver( acc, a ), b ), c );'), 'storms, far band and mid layer composite behind it, sorted');
  assert.ok(layer.includes('acc = cloudOver( acc, cirrusLayer( dir, cosT, rayDx, rayDy ) );'), 'the cirrus (with the trails) last');
  assert.ok(layer.includes('float halo = exp( -hx * hx ) * 0.10;'), 'the 22° halo squares its argument');
  assert.ok(layer.includes('if (preset) applyCloudWeatherPreset(this.traceMaterial.uniforms, preset);'), 'the storm cells and trails are placed once per preset');
  assert.equal(layer.match(/applyCloudWeatherPreset\(/g)?.length, 1, 'never per frame');
  assert.ok(layer.includes('const undim = 1 / Math.max(1e-3, a.skyIntensity);'), 'the summary\'s sky intensity is undone before the composite applies it once');
  assert.ok(layer.includes('...createCloudWeatherUniforms(),'));
}

// ---- lightning (night storms only, deterministic, drawn in the composite), the gobos' clear radius, the slab's new laws
{
  const { VolumetricCloudLayer } = await import('./volumetricClouds.ts');
  const layer = new VolumetricCloudLayer({}, new THREE.Scene(), {}, new THREE.Vector3(1, 1, 1));
  const night = deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...getMapConfig('monsoon').sky, skyIntensity: 0.08, sunColorHex: 0xafc3ec, cloudscape: getMapConfig('monsoon').clouds });
  const day = { ...night, timeOfDay: 'day' };
  applyCloudWeatherPreset(layer.traceMaterial.uniforms, night);
  const run = (preset, seconds) => {
    const flash = layer.domeMaterial.uniforms.uFlash.value;
    let lit = 0, peak = 0;
    for (let t = 0; t < seconds; t += 1 / 60) { layer.updateLightning(preset, 1 / 60); if (flash.w > 0) { lit++; peak = Math.max(peak, flash.w); } }
    return { lit, peak, dir: flash.clone() };
  };
  const a = run(night, 60);
  assert.ok(a.lit > 10 && a.lit < 60 * 60 * 0.1, `strikes light the night storm a few times a minute (${a.lit} lit frames)`);
  assert.ok(a.peak > 0.3 && a.peak <= 1.0, 'a stroke peaks under the composite\'s ceiling');
  assert.ok(Math.abs(Math.hypot(a.dir.x, a.dir.y, a.dir.z) - 1) < 1e-6 && a.dir.y > -0.2, 'a unit direction toward a cell, over the horizon');
  assert.equal(run(day, 60).lit, 0, 'no lightning by day');
  assert.equal(run({ ...night, storms: 0, anvil: 0 }, 60).lit, 0, 'no lightning without a storm');
  layer.dispose();
  const layerSrc = here('./volumetricClouds.ts');
  assert.ok(layerSrc.includes('uniform vec4 uFlash;') && layerSrc.includes('this.updateLightning(preset, step);'), 'the flash is drawn in the composite at the frame rate');
  assert.ok(!/TRACE_FRAGMENT[\s\S]*uFlash[\s\S]*const RESOLVE_FRAGMENT/.test(layerSrc), 'never in the trace (the history would smear it)');
  assert.ok(layerSrc.includes('if ( uClear.z > 0.0 ) shade *= smoothstep( uClear.z * 0.6, uClear.z * 1.4, length( vXZ - uClear.xy ) );'), 'a front\'s clear radius holds the cloud shadows off the camera like its towers');
  assert.ok(layerSrc.includes('(g.uClear.value as THREE.Vector3).set(C.pos.x, C.pos.z, preset.clearRadiusM);'), 'the clear centre follows the camera');
  assert.ok(layerSrc.includes('float wispy = clamp( mix( 0.55 - hN * 0.9, 1.0, uWispiness ), 0.0, 1.0 );') && layerSrc.includes('wispy = max( wispy, anv );'), 'cauliflower tops, rags at the base, wisps where the map or the anvil asks');
  assert.ok(layerSrc.includes('float patchC = 0.35 + 1.3 * cw.b;'), 'the cirrus comes in patches (the same mean coverage)');
  assert.ok(layerSrc.includes('tauAbove *= mix( 1.0, 0.2 + 1.6 * ( mo.b * 0.6 + mo.a * 0.4 ), 0.75 * uCells );'), 'a deck\'s underside mottles with its rolls');
  assert.ok(layerSrc.includes('ns.y = ((ns.y - CLOUD_BOIL_M_PER_S'), 'the billows boil');
}

// ---- every path that shows a map's sky carries its cloudscape (the battle's getAuthoredPreset, and the world activation's
// restore for the shots, the Studio staging and the census — which showed the legacy layer of the sky block alone)
{
  const activation = here('../world/worldActivationRuntime.ts');
  assert.match(activation, /world\.config\.clouds\s*\?\s*\{ \.\.\.\(world\.config\.sky \?\? \{\}\), cloudscape: world\.config\.clouds \}/, 'restoreAtmosphere carries config.clouds');
  assert.match(here('../main.ts'), /return config\.clouds \? \{ \.\.\.sky, cloudscape: config\.clouds \} : sky;/, 'the battle path carries it');
}

// ---- the time of day
assert.equal(cloudTimeOfDay({ skyIntensity: 1, sunElevationDeg: 32 }), 'day');
assert.equal(cloudTimeOfDay({ skyIntensity: 0.72, sunElevationDeg: 7 }), 'sunset', 'the battle runtime\'s sunset preset');
assert.equal(cloudTimeOfDay({ skyIntensity: 0.08, sunElevationDeg: 24 }), 'night', 'the battle runtime\'s night preset');
assert.equal(cloudTimeOfDay({ skyIntensity: 1, sunElevationDeg: 13 }), 'day', 'whiteout\'s authored low polar sun is a day sky');
assert.deepEqual([cloudNightAmount(0.08), cloudNightAmount(0.3), cloudNightAmount(1)], [1, 0, 0], 'sky.ts\'s night law');
const skyOf = (id, time = 'day') => {
  const config = getMapConfig(id);
  const sky = { ...DEFAULT_SKY_PRESET, ...(config.sky ?? {}), cloudscape: config.clouds ?? null };
  if (time === 'sunset') Object.assign(sky, { sunElevationDeg: 7, skyIntensity: 0.72, cloudTintHex: 0xeab492, sunColorHex: 0xffbf80 });
  if (time === 'night') Object.assign(sky, { skyIntensity: 0.08, sunElevationDeg: 24, sunColorHex: 0xafc3ec, cloudTintHex: 0x3a4d68 });
  return sky;
};
{
  // a cumuliform sky follows the surface heating: thinner and flatter at sunset, mostly gone by night
  const scape = { regime: 'fair-weather-cumulus', coverage: 0.36 };
  const at = (time) => deriveCloudLayerPreset({ ...skyOf('verdant', time), cloudscape: scape });
  const day = at('day'), dusk = at('sunset'), night = at('night');
  assert.equal(+(dusk.coverage / day.coverage).toFixed(4), CLOUD_DIURNAL.sunset.coverage);
  assert.equal(+(night.coverage / day.coverage).toFixed(4), CLOUD_DIURNAL.night.coverage);
  assert.ok(dusk.thicknessM < day.thicknessM && night.thicknessM < dusk.thicknessM && night.towers < day.towers);
  assert.deepEqual([day.timeOfDay, dusk.timeOfDay, night.timeOfDay], ['day', 'sunset', 'night']);
  // decks, sheets and fronts keep their cloud through the evening (a front's towers live through the night)
  for (const regime of ['stratocumulus-deck', 'industrial-stratocumulus', 'cumulonimbus-front', 'low-stratus']) {
    const d = deriveCloudLayerPreset({ ...skyOf('verdant'), cloudscape: { regime } });
    const n = deriveCloudLayerPreset({ ...skyOf('verdant', 'night'), cloudscape: { regime } });
    assert.deepEqual([n.coverage, n.thicknessM, n.towers], [d.coverage, d.thicknessM, d.towers], `${regime} is not diurnal`);
  }
  // a map's own knobs for its time win over the law; an authored constant sky opts out
  const own = deriveCloudLayerPreset({ ...skyOf('verdant', 'sunset'), cloudscape: { ...scape, sunset: { mid: 'altocumulus', midCoverage: 0.5, coverage: 0.2 } } });
  assert.deepEqual([own.midKind, own.midCoverage, own.coverage], [CLOUD_MID_KINDS.indexOf('altocumulus'), 0.5, 0.2]);
  const constant = deriveCloudLayerPreset({ ...skyOf('verdant', 'night'), cloudscape: { ...scape, diurnal: false } });
  assert.equal(constant.coverage, day.coverage, 'diurnal: false keeps the day\'s cloud');
  // the moonlit albedo: grey-white, not the night preset's dark blue deck colour; an authored tint is kept
  assert.ok(night.tint.every((c) => c > 0.85), `a moonlit cloud is a grey-white diffuser (${night.tint.map((c) => c.toFixed(2))})`);
  const tinted = deriveCloudLayerPreset({ ...skyOf('verdant', 'night'), cloudscape: { ...scape, tintHex: 0x808080 } });
  assert.ok(tinted.tint[0] < 0.6, 'an authored tint survives the night');
  // the key light: white by day, the moonlight's hue at luminance one by night
  assert.deepEqual(day.keyTint, [1, 1, 1]);
  const lum = 0.2126 * night.keyTint[0] + 0.7152 * night.keyTint[1] + 0.0722 * night.keyTint[2];
  assert.ok(Math.abs(lum - 1) < 1e-6 && night.keyTint[2] > night.keyTint[0], 'a cool moonlight of the same luminance');
  // the ground's glow: none by day, the town's colour by night
  const glowScape = { ...scape, nightGlow: 0.8 };
  assert.deepEqual(deriveCloudLayerPreset({ ...skyOf('verdant'), cloudscape: glowScape }).groundGlow, [0, 0, 0]);
  const glow = deriveCloudLayerPreset({ ...skyOf('verdant', 'night'), cloudscape: glowScape }).groundGlow;
  assert.ok(glow[0] > glow[1] && glow[1] > glow[2] && glow[0] <= 0.8 + 1e-9, 'sodium: red over green over blue');
  assert.notEqual(cloudLayerKey(day), cloudLayerKey(dusk), 'the time re-keys the history');
}
{
  // the mid layer's kinds and the regime rows' weather defaults
  assert.deepEqual([...CLOUD_MID_KINDS], ['none', 'altocumulus', 'altostratus', 'cirrocumulus', 'lenticular']);
  for (const kind of CLOUD_MID_KINDS) assert.ok(CLOUD_MID_DEFAULTS[kind], kind);
  assert.ok(CLOUD_MID_DEFAULTS.cirrocumulus.altM > CLOUD_MID_DEFAULTS.altocumulus.altM && CLOUD_MID_DEFAULTS.cirrocumulus.cellM < CLOUD_MID_DEFAULTS.altocumulus.cellM, 'cirrocumulus: finer and higher');
  for (const [name, row] of Object.entries(CLOUDSCAPE_REGIMES)) {
    assert.ok(CLOUD_MID_KINDS.includes(row.mid) && row.storms >= 0 && row.storms <= CLOUD_STORM_MAX && row.rain >= 0 && row.rain <= 1 && row.virga >= 0 && row.virga <= 1, name);
  }
  assert.ok(CLOUDSCAPE_REGIMES['cumulonimbus-front'].storms > 0 && CLOUDSCAPE_REGIMES['cumulonimbus-front'].rain > 0.5, 'a front brings storm cells and rain');
  assert.ok(CLOUDSCAPE_REGIMES['cumulus-humilis'].virga > 0.5, 'dry-air cumulus hangs virga');
  const mid = deriveCloudLayerPreset({ ...skyOf('verdant'), cloudscape: { regime: 'fair-weather-cumulus', mid: 'altocumulus' } });
  assert.ok(mid.midAltM >= mid.baseM + mid.thicknessM + 300, 'the mid layer stands clear over the slab');
  // a sky block alone (the Garage) has no weather beyond its slab
  const legacy = deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...getMapConfig('verdant').sky });
  assert.deepEqual([legacy.midKind, legacy.contrails, legacy.storms, legacy.rain, legacy.fogBank, ...legacy.groundGlow], [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(CLOUD_WEATHER_RULES.contrailMax, CLOUD_CONTRAIL_MAX);
  assert.equal(CLOUD_WEATHER_RULES.stormMax, CLOUD_STORM_MAX);
}
{
  // every shipped map resolves at all three times with finite numbers
  for (const id of MAP_IDS) {
    if (id === 'moon') continue;
    for (const time of ['day', 'sunset', 'night']) {
      const p = deriveCloudLayerPreset(skyOf(id, time));
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === 'number') assert.ok(Number.isFinite(v), `${id} ${time} ${k}`);
        else if (Array.isArray(v)) assert.ok(v.every(Number.isFinite), `${id} ${time} ${k}`);
      }
    }
  }
}
console.log('cloudWeatherLayers.selftest: contrail and storm placement, uniform packing, the gated GLSL, the layered composite, the time of day (diurnal law, per-time knobs, moonlit albedo, key hue, ground glow) pinned');
