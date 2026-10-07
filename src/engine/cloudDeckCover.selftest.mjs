// Clouds 2.0 round 8 (2026-10-07): a deck covers the share of the sky its map authors. The R6 GPU pairs drew the broken
// decks at about half their coverage — Railyard's 0.92 industrial deck mostly open sky (the scene went sunny under it),
// the fjord's 0.62 empty in its sky-w view, Frosthollow's 0.86 "pillow masses around a large blue gap" (wave 221): the
// shell's core 0.5 under the full shape erosion kept about half of what the cover admitted. The deck's shell is now
// calibrated on the sky dome's cover — the share of the dome, by solid angle, whose optical depth passes 1 seen from the
// ground — through a twin of the medium (cloudShaders.ts cl2Weather / cl2Cell / cl2Shell / cl2Media without the detail and
// the turbulence) over the real local-weather bake and a port of the GPU shape bake (cloudVolumeNoise.ts) at 32³:
//   - a broken deck's dome cover is its coverage within 0.07;
//   - a closing deck's runs at most 0.08 over its coverage (never under it by more than 0.03);
//   - Whiteout's closed stratus covers the whole dome.
// The twin mirrors the GLSL line by line (asserted below): a change to the medium fails here until the twin follows it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cloudStackOf } from './cloudLayers.ts';
import { deriveCloudLayerPreset, loadCloudscapeLayers } from './cloudPresets.ts';
import { bakeCloudLocalWeather, CLOUD_LOCAL_SIZE } from './cloudNoise.ts';
import { CLOUD2_PERIODS } from './cloudShaders.ts';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { getMapConfig } from '../world/maps/index.ts';

const shaders = readFileSync(new URL('./cloudShaders.ts', import.meta.url), 'utf8');
const volume = readFileSync(new URL('./cloudVolumeNoise.ts', import.meta.url), 'utf8');
await loadCloudscapeLayers();

// ---- the GLSL the twin mirrors
for (const line of [
  // cl2Weather: the lanes' channels, the envelope, the exponent
  'vec4 w = uLayerChannels * lw;',
  'w *= mix( vec4( 1.0 ), vec4( smoothstep( 0.3, 0.7, lw.b ) ), uLayerEnvelope );',
  'return pow( clamp( w, 0.0, 1.0 ), uLayerExp );',
  // cl2Cell: the cells in the wind's frame, the second lattice and its selector, the lumps
  'q = vec2( dot( q, uWindDir2 ) / uCellStretch, dot( q, vec2( -uWindDir2.y, uWindDir2.x ) ) );',
  'float c = textureLod( tLocal, q / uCellPeriod + vec2( 0.37, 0.11 ), lod ).a;',
  'float c2 = textureLod( tLocal, q / ( uCellPeriod * 0.62 ) + vec2( 0.83, 0.29 ), lod ).a;',
  'float sel = sin( dot( xz, vec2( 0.00021, 0.00013 ) ) + 1.7 * sin( dot( xz, vec2( -0.00011, 0.00017 ) ) ) );',
  'c = mix( c, c2, smoothstep( -0.35, 0.35, sel ) );',
  'float l = textureLod( tLocal, q / ( uCellPeriod * 0.31 ) + vec2( 0.71, 0.53 ), lod ).a;',
  'return vec2( smoothstep( 0.15, 0.85, c ), smoothstep( 0.1, 0.9, l ) );',
  // cl2Shell
  'vec4 k = mix( vec4( 1.0 ), vec4( cell.x ) * mix( vec4( 1.0 ), vec4( 0.55 + 0.45 * cell.y ), uLayerLumps ), uLayerCells );',
  'vec4 base = uLayerBase - thick * uLayerHang * k;',
  'vec4 top = uLayerBase + thick * ( 0.1 + 0.9 * k );',
  'vec4 box = smoothstep( 0.0, 0.12, hf ) * ( 1.0 - smoothstep( 0.82, 1.0, hf ) );',
  'vec4 heightScale = mix( cl2Profile( hf, uLayerBias ), box, uLayerFlat );',
  'vec4 admitted = uLayerCover * heightScale;',
  'vec4 ramp = max( admitted * uLayerFilter, vec4( 0.02 ) );',
  'vec4 d = clamp( ( weather - ( 1.0 - admitted ) ) / ramp, 0.0, 1.0 );',
  'vec4 gapOn = uLayerCells * clamp( ( 1.0 - uLayerCover ) * 8.0, 0.0, 1.0 );',
  'vec4 gapW = clamp( ( 1.0 - uLayerCover ) / 0.45, 0.2, 1.0 );',
  'd *= mix( vec4( 1.0 ), smoothstep( 0.03 * gapW, 0.32 * gapW, k ), gapOn );',
  'return d * uLayerCore * inside;',
  // cl2Media: the shape's erosion and the profile
  'float shape = textureLod( tShape, sp / uShapePeriod, lod ).r;',
  'vec4 lo = vec4( 1.0 - shape ) * uLayerShape;',
  'vec4 d = clamp( ( shell - lo ) / max( 1.0 - lo, vec4( 1e-3 ) ), 0.0, 1.0 );',
  'vec4 profile = uProfA * exp( uProfB * hf ) + uProfC * hf + uProfD;',
  'return clamp( d * profile, 0.0, 1.0 ) * uLayerDensity;',
]) assert.ok(shaders.includes(line), `the medium twin mirrors: ${line}`);
assert.ok(shaders.includes('return smoothstep( 0.0, 0.06, hf ) * ( 1.0 - pow( hf, 1.0 / max( bias, vec4( 0.05 ) ) ) );'), 'the profile twin mirrors the GLSL');
for (const line of [
  'uint h = uint( c.x ) * 0x8da6b343u ^ uint( c.y ) * 0xd8163841u ^ uint( c.z ) * 0xcb1ab31fu ^ seed * 0x165667b1u;',
  'h ^= h >> 15u; h *= 0x2c1b3c6du; h ^= h >> 12u; h *= 0x297a2d39u; h ^= h >> 15u;',
  'float perlin = clamp( cotPerlinFbm( p, 8.0, 3, uSeed ) * 0.5 + 0.5, 0.0, 1.0 );',
  'float billow = dot( w, vec3( 0.625, 0.25, 0.125 ) );',
  'float perlinWorley = billow + perlin * ( 1.0 - billow );',
  'float shape = clamp( remapf( perlinWorley, fine - 1.0, 1.0 ), 0.0, 1.0 );',
]) assert.ok(volume.includes(line), `the shape twin mirrors: ${line}`);
assert.match(volume, /const CLOUD_VOLUME_SEED = 6406;/);
assert.equal(CLOUD2_PERIODS.local, 48000);

// ---- the shape bake (cloudVolumeNoise.ts) at N³ texel centres, sampled trilinearly with wrap
const SEED = 6406, N = 32;
const wrap = (c, n) => ((c % n) + n) % n;
function hash(cx, cy, cz, seed) {
  let h = (Math.imul(cx >>> 0, 0x8da6b343) ^ Math.imul(cy >>> 0, 0xd8163841) ^ Math.imul(cz >>> 0, 0xcb1ab31f) ^ Math.imul(seed >>> 0, 0x165667b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12; h = Math.imul(h, 0x297a2d39) >>> 0; h ^= h >>> 15;
  return h >>> 0;
}
const hash01 = (x, y, z, seed) => (hash(x, y, z, seed) >>> 8) * (1 / 16777216);
const fade = (f) => f * f * f * (f * (f * 6 - 15) + 10);
function perlin(px, py, pz, cells, seed) {
  const qx = px * cells, qy = py * cells, qz = pz * cells, n = cells | 0;
  const ix = Math.floor(qx), iy = Math.floor(qy), iz = Math.floor(qz), fx = qx - ix, fy = qy - iy, fz = qz - iz;
  const g = (ox, oy, oz) => {
    const x = wrap(ix + ox, n), y = wrap(iy + oy, n), z = wrap(iz + oz, n);
    const a = hash01(x, y, z, seed) * 6.283185307179586, b = hash01(x, y, z, seed + 7) * 2 - 1, r = Math.sqrt(Math.max(0, 1 - b * b));
    return r * Math.cos(a) * (fx - ox) + r * Math.sin(a) * (fy - oy) + b * (fz - oz);
  };
  const ux = fade(fx), uy = fade(fy), uz = fade(fz), m = (a, b, t) => a + (b - a) * t;
  return m(m(m(g(0, 0, 0), g(1, 0, 0), ux), m(g(0, 1, 0), g(1, 1, 0), ux), uy), m(m(g(0, 0, 1), g(1, 0, 1), ux), m(g(0, 1, 1), g(1, 1, 1), ux), uy), uz) * 1.4;
}
function worley(px, py, pz, cells, seed) {
  const qx = px * cells, qy = py * cells, qz = pz * cells, n = cells | 0;
  const ix = Math.floor(qx), iy = Math.floor(qy), iz = Math.floor(qz), fx = qx - ix, fy = qy - iy, fz = qz - iz;
  let d = 1;
  for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const wx = wrap(ix + x, n), wy = wrap(iy + y, n), wz = wrap(iz + z, n);
    const rx = x + hash01(wx, wy, wz, seed) - fx, ry = y + hash01(wx, wy, wz, seed + 3) - fy, rz = z + hash01(wx, wy, wz, seed + 5) - fz;
    d = Math.min(d, rx * rx + ry * ry + rz * rz);
  }
  return d;
}
function shapeAt(px, py, pz) {
  let fbm = 0, wt = 1, ws = 0, c = 8;
  for (let k = 0; k < 3; k++) { fbm += perlin(px, py, pz, c, SEED + k * 101) * wt; ws += wt; wt *= 0.5; c *= 2; }
  const per = Math.min(1, Math.max(0, (fbm / ws) * 0.5 + 0.5));
  const billow = (1 - worley(px, py, pz, 8, SEED + 11)) * 0.625 + (1 - worley(px, py, pz, 24, SEED + 12)) * 0.25 + (1 - worley(px, py, pz, 48, SEED + 13)) * 0.125;
  const pw = billow + per * (1 - billow);
  const v0 = 1 - worley(px, py, pz, 8, SEED + 21), v1 = 1 - worley(px, py, pz, 16, SEED + 22), v2 = 1 - worley(px, py, pz, 32, SEED + 23), v3 = 1 - worley(px, py, pz, 64, SEED + 24);
  const fine = (v0 * 0.625 + v1 * 0.25 + v2 * 0.125) * 0.625 + (v1 * 0.625 + v2 * 0.25 + v3 * 0.125) * 0.25 + (v2 * 0.75 + v3 * 0.25) * 0.125;
  return Math.min(1, Math.max(0, (pw - (fine - 1)) / Math.max(1 - (fine - 1), 1e-5)));
}
const SH = new Float32Array(N ** 3);
for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) SH[(z * N + y) * N + x] = shapeAt((x + 0.5) / N, (y + 0.5) / N, (z + 0.5) / N);
function shapeSample(u, v, w) {
  const fx = u * N - 0.5, fy = v * N - 0.5, fz = w * N - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
  const tx = fx - x0, ty = fy - y0, tz = fz - z0, at = (x, y, z) => SH[(wrap(z, N) * N + wrap(y, N)) * N + wrap(x, N)], m = (a, b, t) => a + (b - a) * t;
  return m(m(m(at(x0, y0, z0), at(x0 + 1, y0, z0), tx), m(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), tx), ty),
    m(m(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), tx), m(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), tx), ty), tz);
}

// ---- the local weather (the real bake), bilinear with wrap
const LW = bakeCloudLocalWeather(CLOUD_LOCAL_SIZE), LN = CLOUD_LOCAL_SIZE, LOCAL_M = CLOUD2_PERIODS.local;
function local(u, v, ch) {
  const fx = u * LN - 0.5, fy = v * LN - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  const at = (x, y) => LW[(wrap(y, LN) * LN + wrap(x, LN)) * 4 + ch] / 255;
  return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
}
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** A map's sky-dome cover: the share of the dome (3–87°, by solid angle) whose optical depth passes 1, from 9 cameras. */
function domeCover(id) {
  const config = getMapConfig(id);
  const p = deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...config.sky, cloudscape: config.clouds ?? null });
  const st = cloudStackOf(p);
  const wd = [Math.cos(p.windDirRad), Math.sin(p.windDirRad)];
  const prof = (hf, bias) => sm(0, 0.06, hf) * (1 - Math.pow(hf, 1 / Math.max(bias, 0.05)));
  const sigma = (x, h, z) => {
    if (h < st.lowM || h > st.highM) return 0;
    const lw = [local(x / LOCAL_M, z / LOCAL_M, 0), local(x / LOCAL_M, z / LOCAL_M, 1), local(x / LOCAL_M, z / LOCAL_M, 2), local(x / LOCAL_M, z / LOCAL_M, 3)];
    const ax = (x * wd[0] + z * wd[1]) / st.cellStretch, az = -x * wd[1] + z * wd[0];
    let cc = local(ax / st.cellPeriodM + 0.37, az / st.cellPeriodM + 0.11, 3);
    const c2 = local(ax / (st.cellPeriodM * 0.62) + 0.83, az / (st.cellPeriodM * 0.62) + 0.29, 3);
    cc += (c2 - cc) * sm(-0.35, 0.35, Math.sin(x * 0.00021 + z * 0.00013 + 1.7 * Math.sin(x * -0.00011 + z * 0.00017)));
    const cell = [sm(0.15, 0.85, cc), sm(0.1, 0.9, local(ax / (st.cellPeriodM * 0.31) + 0.71, az / (st.cellPeriodM * 0.31) + 0.53, 3))];
    let s = 0;
    for (const L of st.lanes) {
      const thick = L.topM - L.baseM;
      const k = 1 + (cell[0] * (1 + (0.55 + 0.45 * cell[1] - 1) * L.lumps) - 1) * L.cells;
      const base = L.baseM - thick * L.hang * k, top = L.baseM + thick * (0.1 + 0.9 * k);
      if (h < base || h > top) continue;
      let w = L.channels[0] * lw[0] + L.channels[1] * lw[1] + L.channels[2] * lw[2] + L.channels[3] * lw[3];
      w = Math.pow(clamp(w * (1 + (sm(0.3, 0.7, lw[2]) - 1) * L.envelope), 0, 1), L.exponent);
      const gapOn = L.cells * clamp((1 - L.cover) * 8, 0, 1), gapW = clamp((1 - L.cover) / 0.45, 0.2, 1);
      const hf = clamp((h - base) / Math.max(top - base, 1), 0, 1);
      const box = sm(0, 0.12, hf) * (1 - sm(0.82, 1, hf));
      const hs = Math.max(prof(hf, L.bias) + (box - prof(hf, L.bias)) * L.flat, L.anvil * sm(0.74, 0.9, hf) * (1 - sm(0.97, 1, hf)));
      const adm = L.cover * hs;
      const shell = clamp((w - (1 - adm)) / Math.max(adm * L.filter, 0.02), 0, 1) * (1 + (sm(0.03 * gapW, 0.32 * gapW, k) - 1) * gapOn) * L.core;
      if (shell <= 0) continue;
      const lo = (1 - shapeSample(x / st.shapePeriodM, h / st.shapePeriodM, z / st.shapePeriodM)) * L.shape;
      const d = clamp((shell - lo) / Math.max(1 - lo, 1e-3), 0, 1);
      s += clamp(d * (L.profile[0] * Math.exp(L.profile[1] * hf) + L.profile[2] * hf + L.profile[3]), 0, 1) * L.density;
    }
    return s;
  };
  let w = 0, c = 0;
  // nine cameras over the 48 km weather tile (a map's own patch of it varies; the law prices the deck, not the patch)
  const cams = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) cams.push([i * 16000 + 3100, j * 16000 - 2300]);
  for (const [cx, cz] of cams) {
    for (let e = 3; e < 90; e += 4) {
      const er = e * Math.PI / 180, ce = Math.cos(er), se = Math.sin(er);
      for (let a = 0; a < 360; a += 20) {
        const ar = a * Math.PI / 180, dx = ce * Math.cos(ar), dz = ce * Math.sin(ar);
        let od = 0;
        const tEnd = Math.min(36000, (st.highM + 10) / Math.max(se, 1e-3));
        for (let t = Math.max(0, (st.lowM - 300) / Math.max(se, 0.02)); t < tEnd && od < 1.5; t += 80) {
          od += sigma(cx + dx * t, 10 + se * t + ((dx * t) ** 2 + (dz * t) ** 2) * (0.5 / 6.36e6), cz + dz * t) * 80;
        }
        w += ce; if (od > 1) c += ce;
      }
    }
  }
  return { cover: c / w, coverage: p.coverage, closing: st.closing, lane: st.lanes[0] };
}

const rows = [];
for (const id of MAP_IDS) {
  const config = getMapConfig(id);
  if (!config || id === 'mars' || ((({ ...DEFAULT_SKY_PRESET, ...config.sky }).cloudOpacity ?? 0) <= 0.01)) continue;
  const p = deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...config.sky, cloudscape: config.clouds ?? null });
  const lane = cloudStackOf(p).lanes[0];
  // the decks: a flat lane's (a broken deck's flat is 0.45 and over) at a deck's coverage
  if (lane.flat < 0.45 || p.coverage < 0.6) continue;
  rows.push({ id, ...domeCover(id) });
}
assert.ok(rows.length >= 6, `the decks priced (${rows.map((r) => r.id).join(', ')})`);
if (process.env.COT_DECK_COVER_PRINT) for (const r of rows) console.log(r.id, r.cover.toFixed(3), r.coverage.toFixed(2), r.closing.toFixed(2));
for (const r of rows) {
  const tag = `${r.id}: dome cover ${r.cover.toFixed(2)} at coverage ${r.coverage.toFixed(2)} (closing ${r.closing.toFixed(2)})`;
  if (r.closing >= 1) assert.ok(r.cover >= 0.97, `${tag} — a closed deck covers the dome`);
  else if (r.closing >= 0.3) assert.ok(r.cover - r.coverage <= 0.08 && r.cover - r.coverage >= -0.03, `${tag} — a closing deck at its coverage`);
  else assert.ok(Math.abs(r.cover - r.coverage) <= 0.07, `${tag} — a broken deck covers its coverage`);
}
console.log(`cloudDeckCover.selftest: ${rows.map((r) => `${r.id} ${r.cover.toFixed(2)}/${r.coverage.toFixed(2)}`).join(', ')} — every deck's dome at its coverage PASS`);
