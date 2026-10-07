// Clouds 2.0 (2026-10-06): the Beer shadow map's ground shade against the trace's own sun — the skies lane's acceptance
// case on Frosthollow (its sunward frame showed the sun's disc through a gap in the 700 m stratocumulus deck while the
// shade map, sampling the field once at the deck's base, kept the camera's own ground in cloud shadow; the trace sees the
// sun through the whole 420 m slab, a slant of about 0.9 km at 33°). Pinned without a GPU by twins of the GLSL that
// matters (cloudShaders.ts): the shell, the map's march by lanes and slices, the four-texel lookup blended as
// transmittances, the shade fragment, and the lit materials' read (cloudShadeMap.ts cloudSunShareAt) — over the real
// Frosthollow stack (cloudLayers.ts) and synthetic weather. The shape and detail volumes are taken at their peak (the
// shell uncarved): the receipt prices the map's path, not the noise.
//   1. A sun visible through a gap means that camera's ground is lit, its cast shadows with it.
//   2. Over 2 km the sunlit share stays within a few points of the share whose sun the trace sees.
// The contrast: the column straight over the camera crosses the closed deck — a shade that does not follow the sun's
// slant through the slab marks the ground shaded.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cloudBsmSlices, cloudStackOf, laneFloorM } from './cloudLayers.ts';
import { CLOUD_LAYER_RULES, deriveCloudLayerPreset, loadCloudscapeLayers } from './cloudPresets.ts';
import { cloudSunShareAt } from './cloudShadeMap.ts';
import { sunDirectionOf } from './atmosphere.ts';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { getMapConfig } from '../world/maps/index.ts';
import { CLOUD_BSM_CASCADES, CLOUD_FAR_SHADE_SIZE, CLOUD_FAR_SHADE_SPAN_M, CLOUD_SHADOW_CORE, CLOUD_SHADOW_TAU } from './volumetricClouds.ts';

const shaders = readFileSync(new URL('./cloudShaders.ts', import.meta.url), 'utf8');
await loadCloudscapeLayers();

// ---- the GLSL the twins mirror
const shellSrc = shaders.slice(shaders.indexOf('vec4 cl2Shell('), shaders.indexOf('vec4 cl2Media('));
for (const line of [
  'vec4 k = mix( vec4( 1.0 ), vec4( cell.x ) * mix( vec4( 1.0 ), vec4( 0.55 + 0.45 * cell.y ), uLayerLumps ), uLayerCells );',
  'vec4 base = uLayerBase - thick * uLayerHang * k;',
  'vec4 top = uLayerBase + thick * ( 0.1 + 0.9 * k );',
  'd *= mix( vec4( 1.0 ), smoothstep( 0.03, 0.32, k ), gapOn );',
  'vec4 box = smoothstep( 0.0, 0.12, hf ) * ( 1.0 - smoothstep( 0.82, 1.0, hf ) );',
  'vec4 heightScale = mix( cl2Profile( hf, uLayerBias ), box, uLayerFlat );',
  'vec4 admitted = uLayerCover * heightScale;',
  'vec4 ramp = max( admitted * uLayerFilter, vec4( 0.02 ) );',
  'vec4 d = clamp( ( weather - ( 1.0 - admitted ) ) / ramp, 0.0, 1.0 );',
  'return d * uLayerCore * inside;',
]) assert.ok(shellSrc.includes(line), `the shell twin mirrors: ${line}`);
assert.ok(shaders.includes('return smoothstep( 0.0, 0.06, hf ) * ( 1.0 - pow( hf, 1.0 / max( bias, vec4( 0.05 ) ) ) );'), 'the profile twin mirrors the GLSL');
const bsmSrc = shaders.slice(shaders.indexOf('export const CLOUD2_BSM_FRAGMENT'), shaders.indexOf('export const CLOUD2_SHADE_FRAGMENT'));
for (const line of [
  'for ( int i = 0; i < 4; i++ ) if ( uLayerDensity[ i ] > 0.0 ) total += ( uLayerTop[ i ] - uLayerBase[ i ] ) * ( 1.0 + uLayerHang[ i ] );',
  'float dy = max( total / uSlices, 10.0 );',
  'for ( int li = 3; li >= 0; li-- ) {',
  'float lt = uLayerTop[ li ], lb = uLayerBase[ li ] - ( uLayerTop[ li ] - uLayerBase[ li ] ) * uLayerHang[ li ];',
  'int n = max( 1, int( ceil( ( lt - lb ) / dy ) ) );',
  'float y = lt - ( float( k ) + 0.5 ) * ldy;',
  'float yHi = min( y + ldy, lt ), yLo = y;',
  'run = ds * clamp( ( ye - ( y - 0.5 * ldy ) ) / ldy, 0.05, 1.0 );',
  'vec3 p = vec3( xz, uPlane.x ).xzy + s * ( ( y - uPlane.x ) / sy );',
  'tail = min( 2.0 * ds * exp( float( 1 - samples ) ), ds * 0.5 );',
  'outBsm = vec4( wd / max( ws, 1e-5 ), extinctionSum / float( samples ), od, tail );',
]) assert.ok(bsmSrc.includes(line), `the map's march twin mirrors: ${line}`);
const shadeSrc = shaders.slice(shaders.indexOf('export const CLOUD2_SHADE_FRAGMENT'), shaders.indexOf('export const CLOUD2_CAMERA_GLSL'));
for (const line of [
  'float od = cl2BsmRead( tBsm0, uBsmWindow0, xz, 1e9, 0.0 );',
  'share = uShadeLaw.x * ( 1.0 - exp( -od / max( uShadeLaw.y, 1e-3 ) ) );',
  'outShade = vec4( share * uShadeLaw.z, beam, 0.0, 1.0 );',
]) assert.ok(shadeSrc.includes(line), `the shade twin mirrors: ${line}`);
assert.ok(shaders.includes('return m - log( max( dot( w, exp( m - od ) ), 1e-6 ) );'), 'the lookup blends the texels as transmittances');

// ---- Frosthollow's stack and sun
const config = getMapConfig('winter');
assert.equal(config.name, 'Frosthollow');
const preset = deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...config.sky, cloudscape: config.clouds ?? null });
const stack = cloudStackOf(preset);
const lane = stack.lanes[0];
// the layer's shade law (volumetricClouds.ts updateFarShade): a deck with gaps draws its pattern under the deck's core
assert.equal(preset.shadowPattern, 1, 'Frosthollow\'s deck casts its pattern');
const core = preset.shadow ? CLOUD_SHADOW_CORE : CLOUD_LAYER_RULES.deckShadowCore;
assert.equal(lane.baseM, 700);
assert.equal(lane.topM - lane.baseM, 420);
const [sx, sy, sz] = sunDirectionOf(config.sky.sunElevationDeg, config.sky.sunAzimuthDeg);
const sun = { x: sx, y: sy, z: sz };
const slices = cloudBsmSlices(stack);
const plane = stack.lowM, topAll = stack.highM;
assert.equal(plane, laneFloorM(lane), 'the map\'s plane under the hanging cores');

// ---- the twins
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const shapeAlter = (hf, bias) => smooth(0, 0.06, hf) * (1 - Math.pow(hf, 1 / Math.max(bias, 0.05)));
// the extinction at p of every lane under weather w (one value for the deck's channel) and a uniform cell (c = l = 1)
function extinction(p, weather) {
  const h = p.y + (p.x * p.x + p.z * p.z) * (0.5 / 6.36e6);
  if (h < stack.lowM || h > stack.highM) return 0;
  let sigma = 0;
  for (const L of stack.lanes) {
    const thick = L.topM - L.baseM;
    // k = mix(1, c · mix(1, 0.55 + 0.45 l, lumps), cells) at a uniform cell (c = l = 1): the full column
    const k = 1;
    const base = L.baseM - thick * L.hang * k, top = L.baseM + thick * (0.1 + 0.9 * k);
    if (!(h >= base && h <= top) || L.density <= 1e-6) continue;
    const hf = clamp((h - base) / Math.max(top - base, 1), 0, 1);
    const box = smooth(0, 0.12, hf) * (1 - smooth(0.82, 1, hf));
    let hs = shapeAlter(hf, L.bias) + (box - shapeAlter(hf, L.bias)) * L.flat;
    hs = Math.max(hs, L.anvil * smooth(0.74, 0.9, hf) * (1 - smooth(0.97, 1, hf)));
    const admitted = L.cover * hs;
    const ramp = Math.max(admitted * L.filter, 0.02);
    const d = clamp((weather(p.x, p.z) - (1 - admitted)) / ramp, 0, 1) * L.core;
    const profile = L.profile[0] * Math.exp(L.profile[1] * hf) + L.profile[2] * hf + L.profile[3];
    sigma += clamp(d * profile, 0, 1) * L.density;
  }
  return sigma;
}
// the trace's own sun: the transmittance up the sun's ray from a ground point, finely marched
function traceSun(g, weather) {
  let od = 0;
  const end = (topAll - g.y) / sun.y, ds = 2;
  for (let t = ds * 0.5; t < end; t += ds) od += extinction({ x: g.x + sun.x * t, y: g.y + sun.y * t, z: g.z + sun.z * t }, weather) * ds;
  return Math.exp(-od);
}
// one texel of the map: the GLSL's march by lanes from the highest down, fixed altitude slices
function bsmTexel(x, z, weather) {
  const s = Math.max(sun.y, 0.05);
  let total = 0;
  for (const L of stack.lanes) total += (L.topM - L.baseM) * (1 + L.hang);
  const dy = Math.max(total / slices, 10);
  let extSum = 0, od = 0, tail = 0, T = 1, wd = 0, ws = 0, samples = 0;
  for (let li = stack.lanes.length - 1; li >= 0; li--) {
    const L = stack.lanes[li];
    if (L.density <= 0 || T < 1e-3) continue;
    const lt = L.topM, lb = L.baseM - (L.topM - L.baseM) * L.hang;
    const n = Math.max(1, Math.ceil((lt - lb) / dy));
    const ldy = (lt - lb) / n, ds = ldy / s;
    for (let k = 0; k < n; k++) {
      const y = lt - (k + 0.5) * ldy;
      const p = { x: x + sun.x * ((y - plane) / s), y: plane + sun.y * ((y - plane) / s), z: z + sun.z * ((y - plane) / s) };
      const sigma = extinction(p, weather);
      if (sigma > 1e-5) {
        let dist = (topAll - y) / s, run = ds;
        if (samples === 0) {
          let yHi = Math.min(y + ldy, lt), yLo = y;
          for (let b = 0; b < 3; b++) {
            const ym = 0.5 * (yHi + yLo);
            const q = { x: x + sun.x * ((ym - plane) / s), y: plane + sun.y * ((ym - plane) / s), z: z + sun.z * ((ym - plane) / s) };
            if (extinction(q, weather) > 1e-5) yLo = ym; else yHi = ym;
          }
          const ye = 0.5 * (yHi + yLo);
          dist = (topAll - ye) / s;
          run = ds * clamp((ye - (y - 0.5 * ldy)) / ldy, 0.05, 1);
        }
        extSum += sigma; od += sigma * run; T *= Math.exp(-sigma * run); wd += dist * T; ws += T; samples++;
      }
      if (T < 1e-3) { tail = Math.min(2 * ds * Math.exp(1 - samples), ds * 0.5); break; }
    }
  }
  return samples === 0 ? [1e6, 0, 0, 0] : [wd / Math.max(ws, 1e-5), extSum / samples, od, tail];
}
// the shade fragment at a plane point: the near cascade's four texels' columns blended as transmittances, the shade law
const texelM = CLOUD_BSM_CASCADES[0].span / CLOUD_BSM_CASCADES[0].texels;
function shadeFragment(x, z, weather, cache) {
  const tx = x / texelM - 0.5, tz = z / texelM - 0.5;
  const ix = Math.floor(tx), iz = Math.floor(tz), fx = tx - ix, fz = tz - iz;
  const col = (i, j) => {
    const key = `${i},${j}`;
    let s = cache.get(key);
    if (!s) { s = bsmTexel((i + 0.5) * texelM, (j + 0.5) * texelM, weather); cache.set(key, s); }
    return Math.min(s[2] + s[3], s[1] * Math.max(0, 1e9 - s[0]));
  };
  const od = [col(ix, iz), col(ix + 1, iz), col(ix, iz + 1), col(ix + 1, iz + 1)];
  const w = [(1 - fx) * (1 - fz), fx * (1 - fz), (1 - fx) * fz, fx * fz];
  const m = Math.min(...od);
  const tau = m - Math.log(Math.max(od.reduce((a, o, i) => a + w[i] * Math.exp(m - o), 0), 1e-6));
  return { share: core * (1 - Math.exp(-tau / CLOUD_SHADOW_TAU)) * preset.shadowPattern, beam: Math.exp(-tau) };
}
// the lit materials' sun share at a world point (cloudSunShareAt over the shade map: 512 texels over 12 km about the
// camera, read bilinearly)
const rect = { x: 0, y: 0, z: CLOUD_FAR_SHADE_SPAN_M };
function materialSun(g, weather, cache) {
  const n = CLOUD_FAR_SHADE_SIZE;
  const texel = (i, j) => shadeFragment(rect.x + ((i + 0.5) / n - 0.5) * rect.z, rect.y + ((j + 0.5) / n - 0.5) * rect.z, weather, cache).share;
  const shadeAt = (u, v) => {
    const tu = u * n - 0.5, tv = v * n - 0.5, i = Math.floor(tu), j = Math.floor(tv), fu = tu - i, fv = tv - j;
    return (texel(i, j) * (1 - fu) + texel(i + 1, j) * fu) * (1 - fv) + (texel(i, j + 1) * (1 - fu) + texel(i + 1, j + 1) * fu) * fv;
  };
  return cloudSunShareAt(g, rect, plane, sun, shadeAt);
}
// the contrast: the optical depth straight up from a ground point (no slant)
function columnDepth(g, weather) {
  let od = 0;
  for (let y = g.y + 1; y < topAll; y += 2) od += extinction({ x: g.x, y, z: g.z }, weather) * 2;
  return od;
}

// ---- 1. the Frosthollow pose: the camera's ground at the origin, its sun ray clear through a gap in a closed deck
{
  const g = { x: 0, y: 4.1, z: 0 };
  const along = (h) => { const t = (h - g.y) / sun.y; return [g.x + sun.x * t, g.z + sun.z * t]; };
  const [ax, az] = along(laneFloorM(lane)), [bx, bz] = along(lane.topM);
  // the gap: a slot along the sun's azimuth over the ray's run through the slab (120 m about it), the deck closed
  // elsewhere (the column straight over the camera among it)
  const segDist = (x, z) => {
    const vx = bx - ax, vz = bz - az, wx = x - ax, wz = z - az;
    const t = clamp((wx * vx + wz * vz) / (vx * vx + vz * vz), 0, 1);
    return Math.hypot(wx - vx * t, wz - vz * t);
  };
  const weather = (x, z) => 0.02 + 0.6 * smooth(120, 220, segDist(x, z));
  const cache = new Map();
  const seen = traceSun(g, weather);
  assert.ok(seen > 0.95, `the trace sees the sun through the gap (${seen.toFixed(3)})`);
  const lit = materialSun(g, weather, cache);
  assert.ok(lit > 0.9, `the camera's ground is lit (the materials' sun ${lit.toFixed(3)})`);
  const column = columnDepth(g, weather);
  assert.ok(column > 3, `the column straight over it is in the deck (an optical depth of ${column.toFixed(1)}): only the slant finds the gap`);
  // a step out of the gap across the sun's azimuth: the ground under the deck is shaded
  const off = { x: g.x - sun.z * 600 / Math.hypot(sun.x, sun.z), y: 4.1, z: g.z + sun.x * 600 / Math.hypot(sun.x, sun.z) };
  assert.ok(traceSun(off, weather) < 0.05 && materialSun(off, weather, cache) < 0.35, 'the ground under the deck beside the gap is shaded');
}

// ---- 2. over 2 km: the sunlit share against the share whose sun the trace sees, over broken decks
{
  let seed = 20261006;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let field = 0; field < 3; field++) {
    // a broken deck: two long swells (1.5–4 km) and a shorter one, its breaks a quarter to a half of the sky
    const waves = [1500, 2500, 700].map((l, i) => ({ a: rnd() * Math.PI * 2, k: (Math.PI * 2) / (l * (0.8 + 0.6 * rnd())), ph: rnd() * 6.28, amp: i < 2 ? 0.4 : 0.2 }));
    const weather = (x, z) => 0.3 + waves.reduce((s, w) => s + w.amp * Math.sin((x * Math.cos(w.a) + z * Math.sin(w.a)) * w.k + w.ph), 0);
    const cache = new Map();
    let seenLit = 0, shadeLit = 0, err = 0, n = 0, missed = 0;
    const litAtHalf = 1 - core * (1 - Math.exp(-Math.LN2 / CLOUD_SHADOW_TAU)) * preset.shadowPattern;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
      const g = { x: -1000 + (i + rnd()) * (2000 / 12), y: 0, z: -1000 + (j + rnd()) * (2000 / 12) };
      const seen = traceSun(g, weather);
      const lit = materialSun(g, weather, cache);
      if (seen > 0.5) seenLit++;
      // like for like: the materials' sun where the column's beam is one half (an optical depth of ln 2 under the shade law)
      if (lit > litAtHalf) shadeLit++;
      if (seen > 0.95 && lit < 0.8) missed++;
      // the materials' sun on the trace's scale: a full shadow keeps 1 − core of the beam
      const floor = 1 - core * preset.shadowPattern;
      err += Math.abs(clamp((lit - floor) / (1 - floor), 0, 1) - seen);
      n++;
    }
    const a = seenLit / n, b = shadeLit / n;
    assert.ok(a > 0.12 && a < 0.85, `field ${field}: a broken deck (the trace sees the sun from ${(a * 100).toFixed(0)} % of the ground)`);
    assert.ok(Math.abs(a - b) <= 0.04, `field ${field}: the sunlit share ${b.toFixed(3)} beside the trace's ${a.toFixed(3)}`);
    assert.ok(missed <= 2, `field ${field}: a ground whose sun the trace sees is lit (${missed} of ${n} not)`);
    assert.ok(err / n < 0.05, `field ${field}: the materials' sun follows the trace's (mean gap ${(err / n).toFixed(3)})`);
  }
}

console.log('cloudBeerShadow.selftest: Frosthollow\'s sun through a deck gap lights the camera\'s ground (the column straight over it is in the deck); over 2 km the sunlit share follows the trace\'s — PASS');
