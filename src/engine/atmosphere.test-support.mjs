// CPU twin of src/engine/atmosphere.ts (round 65, 2026-09-24): the Hillaire 2020 medium, transmittance and
// multiple-scattering tables and the sky-view march, in JavaScript with the GLSL's step counts, LUT sizes and
// parameterizations, so a Node receipt can pin the model's numbers and the calibration without a GPU; and a
// port of the legacy dome (three's Preetham sky under sky.ts's radiance scale, horizon treatment, knee and sun
// glow) — the target the calibration was fitted against on the twelve good maps. Test support only: the shipped
// GLSL lives in atmosphere.ts and is checked against these constants by atmosphere.selftest.mjs.
import {
  ATMO_CALIBRATION, ATMO_GROUND_KM, ATMO_LUT_SIZES, ATMO_MEDIUM, ATMO_STEPS, ATMO_TOP_KM, skyPresetToAtmosphere,
  sunDirectionOf,
} from './atmosphere.ts';

const RG = ATMO_GROUND_KM, RT = ATMO_TOP_KM;
const [T_W, T_H] = ATMO_LUT_SIZES.transmittance;
const [MS_W, MS_H] = ATMO_LUT_SIZES.multiScatter;
const LUM = [0.2126, 0.7152, 0.0722];
export const luminance = (c) => c[0] * LUM[0] + c[1] * LUM[1] + c[2] * LUM[2];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mix = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const normalize = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function raySphere(ro, rd, radius) {
  const b = dot(ro, rd), c = dot(ro, ro) - radius * radius, disc = b * b - c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc), t0 = -b - sq, t1 = -b + sq;
  if (t0 > 0) return t0;
  if (t1 > 0) return t1;
  return -1;
}

export function medium(hKm, p) {
  const rayD = Math.exp(-hKm / ATMO_MEDIUM.rayleighScaleHeightKm);
  const mieD = Math.exp(-hKm / ATMO_MEDIUM.mieScaleHeightKm);
  const ozD = Math.max(0, 1 - Math.abs(hKm - ATMO_MEDIUM.ozoneCentreKm) / ATMO_MEDIUM.ozoneHalfWidthKm);
  const rayScat = ATMO_MEDIUM.rayleighScattering.map((v) => v * rayD * p.rayleighScale);
  const mieScat = p.mieTint.map((t) => ATMO_MEDIUM.mieScattering * t * mieD * p.mieScale);
  const mieExt = ATMO_MEDIUM.mieExtinction * mieD * p.mieScale;
  const ozAbs = ATMO_MEDIUM.ozoneAbsorption.map((v) => v * ozD * p.ozoneScale);
  const extinction = rayScat.map((r, i) => r + mieExt + ozAbs[i]);
  const scattering = rayScat.map((r, i) => r + mieScat[i]);
  return { rayScat, mieScat, extinction, scattering };
}

export const rayleighPhase = (cosTheta) => (3 / (16 * Math.PI)) * (1 + cosTheta * cosTheta);
export function miePhase(cosTheta, g) {
  const g2 = g * g;
  return (3 / (8 * Math.PI)) * ((1 - g2) * (1 + cosTheta * cosTheta))
    / ((2 + g2) * Math.pow(Math.max(1 + g2 - 2 * g * cosTheta, 1e-4), 1.5));
}

/** (r, mu) -> transmittance LUT uv, the GLSL's parameterization. */
export function transmittanceUV(r, mu) {
  const H = Math.sqrt(RT * RT - RG * RG);
  const rho = Math.sqrt(Math.max(r * r - RG * RG, 0));
  const disc = r * r * (mu * mu - 1) + RT * RT;
  const d = Math.max(0, -r * mu + Math.sqrt(Math.max(disc, 0)));
  const dMin = RT - r, dMax = rho + H;
  const xMu = (d - dMin) / (dMax - dMin), xR = rho / H;
  return [(xMu + 0.5 / T_W) * (T_W / (T_W + 1)), (xR + 0.5 / T_H) * (T_H / (T_H + 1))];
}

/** transmittance LUT texel (uv) -> (r, mu), the builder's inverse. */
export function transmittanceTexelToRMu(uvx, uvy) {
  const xMu = (uvx - 0.5 / T_W) * (T_W / (T_W - 1));
  const xR = (uvy - 0.5 / T_H) * (T_H / (T_H - 1));
  const H = Math.sqrt(RT * RT - RG * RG);
  const rho = xR * H;
  const r = Math.sqrt(rho * rho + RG * RG);
  const dMin = RT - r, dMax = rho + H;
  const d = dMin + xMu * (dMax - dMin);
  const mu = d === 0 ? 1 : clamp((H * H - rho * rho - d * d) / (2 * r * d), -1, 1);
  return [r, mu];
}

/** Direct optical-depth integration (the transmittance builder's march) for one (r, mu). */
export function transmittanceDirect(r, mu, p, steps = ATMO_STEPS.transmittance) {
  const ro = [0, r, 0], rd = [Math.sqrt(Math.max(1 - mu * mu, 0)), mu, 0];
  const tMax = Math.max(raySphere(ro, rd, RT), 0), dt = tMax / steps;
  const od = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    const h = Math.hypot(ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t) - RG;
    const m = medium(h, p);
    for (let c = 0; c < 3; c++) od[c] += m.extinction[c] * dt;
  }
  return od.map((v) => Math.exp(-v));
}

class Table {
  constructor(w, h) { this.w = w; this.h = h; this.data = new Float32Array(w * h * 3); }
  set(x, y, rgb) { const o = (y * this.w + x) * 3; this.data[o] = rgb[0]; this.data[o + 1] = rgb[1]; this.data[o + 2] = rgb[2]; }
  /** Bilinear, clamp-to-edge sampling at uv in [0,1]² (texel centres at (i + 0.5) / size), as the GPU samples the LUTs. */
  sample(u, v) {
    const fx = clamp(u * this.w - 0.5, 0, this.w - 1), fy = clamp(v * this.h - 0.5, 0, this.h - 1);
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(x0 + 1, this.w - 1), y1 = Math.min(y0 + 1, this.h - 1);
    const tx = fx - x0, ty = fy - y0;
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const a = this.data[(y0 * this.w + x0) * 3 + c], b = this.data[(y0 * this.w + x1) * 3 + c];
      const d = this.data[(y1 * this.w + x0) * 3 + c], e = this.data[(y1 * this.w + x1) * 3 + c];
      out[c] = mix(mix(a, b, tx), mix(d, e, tx), ty);
    }
    return out;
  }
}

/** The CPU atmosphere: builds the transmittance and multiple-scattering tables for a parameter set. */
export class CpuAtmosphere {
  /** `quality` (fitting only) coarsens the multiple-scattering table: { msDirs, msSteps } default to the GLSL's. */
  constructor(params, quality = {}) {
    this.p = params;
    this.msDirs = quality.msDirs ?? ATMO_STEPS.multiScatterDirs;
    this.msSteps = quality.msSteps ?? ATMO_STEPS.multiScatter;
    this.t = new Table(T_W, T_H);
    for (let y = 0; y < T_H; y++) for (let x = 0; x < T_W; x++) {
      const [r, mu] = transmittanceTexelToRMu((x + 0.5) / T_W, (y + 0.5) / T_H);
      this.t.set(x, y, transmittanceDirect(r, mu, params));
    }
    this.ms = new Table(MS_W, MS_H);
    for (let y = 0; y < MS_H; y++) for (let x = 0; x < MS_W; x++) this.ms.set(x, y, this.multiScatterTexel((x + 0.5) / MS_W, (y + 0.5) / MS_H));
  }

  transmittance(r, mu) { const [u, v] = transmittanceUV(r, mu); return this.t.sample(u, v); }

  multiScatter(r, cosSun) {
    const u = (cosSun * 0.5 + 0.5) * ((MS_W - 1) / MS_W) + 0.5 / MS_W;
    const v = ((r - RG) / (RT - RG)) * ((MS_H - 1) / MS_H) + 0.5 / MS_H;
    return this.ms.sample(u, v);
  }

  /** The multiple-scattering builder for one texel (the paper's section 5.2). */
  multiScatterTexel(uvx, uvy) {
    const p = this.p;
    const N = this.msDirs, STEPS = this.msSteps;
    const cosSun = ((uvx - 0.5 / MS_W) * (MS_W / (MS_W - 1))) * 2 - 1;
    const hv = clamp((uvy - 0.5 / MS_H) * (MS_H / (MS_H - 1)), 0.001, 0.999);
    const r = RG + hv * (RT - RG);
    const sunDir = normalize([0, cosSun, -Math.sqrt(Math.max(1 - cosSun * cosSun, 0))]);
    const ro = [0, r, 0];
    const isoPhase = 1 / (4 * Math.PI);
    const lSum = [0, 0, 0], fmsSum = [0, 0, 0];
    for (let i = 0; i < N * N; i++) {
      const ii = ((i % N) + 0.5) / N, jj = (Math.floor(i / N) + 0.5) / N;
      const theta = ii * 2 * Math.PI, phi = Math.acos(1 - jj * 2);
      const rd = [Math.cos(theta) * Math.sin(phi), Math.cos(phi), Math.sin(theta) * Math.sin(phi)];
      const tBottom = raySphere(ro, rd, RG), tTop = raySphere(ro, rd, RT);
      const hitGround = tBottom > 0;
      const tMax = hitGround ? tBottom : Math.max(tTop, 0);
      const dt = tMax / STEPS;
      const throughput = [1, 1, 1], L = [0, 0, 0], fms = [0, 0, 0];
      for (let s = 0; s < STEPS; s++) {
        const t = (s + 0.3) * dt;
        const pt = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
        const pr = Math.hypot(...pt);
        const m = medium(pr - RG, p);
        const up = pt.map((v) => v / pr);
        const cosSunP = dot(up, sunDir);
        const tSun = this.transmittance(pr, cosSunP);
        const earthShadow = raySphere(pt, sunDir, RG) > 0 ? 0 : 1;
        for (let c = 0; c < 3; c++) {
          const S = tSun[c] * earthShadow * m.scattering[c] * isoPhase;
          const tStep = Math.exp(-m.extinction[c] * dt);
          const ext = Math.max(m.extinction[c], 1e-6);
          L[c] += throughput[c] * (S - S * tStep) / ext;
          fms[c] += throughput[c] * (m.scattering[c] - m.scattering[c] * tStep) / ext;
          throughput[c] *= tStep;
        }
      }
      if (hitGround) {
        const pt = [ro[0] + rd[0] * tMax, ro[1] + rd[1] * tMax, ro[2] + rd[2] * tMax];
        const up = normalize(pt);
        const cosS = dot(up, sunDir);
        const tSun = this.transmittance(RG, cosS);
        for (let c = 0; c < 3; c++) L[c] += tSun[c] * throughput[c] * Math.max(cosS, 0) * p.groundAlbedo[c] / Math.PI;
      }
      for (let c = 0; c < 3; c++) { lSum[c] += L[c]; fmsSum[c] += fms[c]; }
    }
    const dirWeight = 4 * Math.PI / (N * N);
    return [0, 1, 2].map((c) => (lSum[c] * dirWeight * isoPhase) / (1 - fmsSum[c] * dirWeight * isoPhase));
  }

  /** Sky luminance (no sun disc) in a world direction from the fixed viewer height: the sky-view march. */
  sky(dir) {
    const p = this.p, STEPS = ATMO_STEPS.skyView;
    const viewH = RG + p.viewHeightKm;
    const sunDir = normalize(p.sunDir);
    const rd = normalize(dir), ro = [0, viewH, 0];
    // the sky-view LUT is built in a frame whose +x is the sun's azimuth; the march only needs the two vectors'
    // relative geometry, so use the world vectors directly
    const tBottom = raySphere(ro, rd, RG), tTop = raySphere(ro, rd, RT);
    const tMax = tBottom > 0 ? tBottom : Math.max(tTop, 0);
    const cosTheta = dot(rd, sunDir);
    const rPhase = rayleighPhase(cosTheta), mPhase = miePhase(cosTheta, p.mieG);
    const throughput = [1, 1, 1], L = [0, 0, 0];
    for (let i = 0; i < STEPS; i++) {
      const t0 = i / STEPS, t1 = (i + 1) / STEPS;
      const ta = t0 * t0 * tMax, tb = t1 * t1 * tMax;
      const t = mix(ta, tb, 0.3), dt = tb - ta;
      const pt = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
      const pr = Math.hypot(...pt);
      const m = medium(pr - RG, p);
      const up = pt.map((v) => v / pr);
      const cosSunP = dot(up, sunDir);
      const tSun = this.transmittance(pr, cosSunP);
      const earthShadow = raySphere(pt, sunDir, RG) > 0 ? 0 : 1;
      const ms = this.multiScatter(pr, cosSunP);
      for (let c = 0; c < 3; c++) {
        const phaseScat = m.rayScat[c] * rPhase + m.mieScat[c] * mPhase;
        const S = tSun[c] * earthShadow * phaseScat + ms[c] * m.scattering[c];
        const tStep = Math.exp(-m.extinction[c] * dt);
        const ext = Math.max(m.extinction[c], 1e-6);
        L[c] += throughput[c] * (S - S * tStep) / ext;
        throughput[c] *= tStep;
      }
    }
    return L.map((v) => v * p.sunIlluminance);
  }

  /** Transmittance from the viewer toward a direction (the sun disc's colour). */
  transmittanceToward(dir) { return this.transmittance(RG + this.p.viewHeightKm, normalize(dir)[1]); }
}

/** sky.ts's dome shoulder (SKY_KNEE 1.0, range 0.45, falloff 0.11). */
export const SKY_KNEE = Object.freeze([1.0, 0.45, 0.11]);
export function knee(c, [start, range, falloff] = SKY_KNEE) {
  const l = luminance(c);
  if (l <= start) return c.slice();
  const s = (start + range * (1 - Math.exp(-(l - start) * falloff))) / l;
  return c.map((v) => v * s);
}

/** The dome as the atmosphere path shows a sky direction: knee, then the preset's skyIntensity. */
export function skyVisible(atmosphere, dir, skyIntensity = 1) {
  return knee(atmosphere.sky(dir)).map((v) => v * skyIntensity);
}

/** The anti-solar / solar horizon bands and the elevation falloff the summary pass derives. */
export function cpuSummary(atmosphere, skyIntensity = 1) {
  const sun = normalize(atmosphere.p.sunDir);
  const band = (elevationDeg, towards) => {
    const el = elevationDeg * Math.PI / 180, base = Math.atan2(towards[2], towards[0]);
    const sum = [0, 0, 0];
    for (let i = 0; i < 9; i++) {
      const az = base + (i - 4) * (5 * Math.PI / 180);
      const s = skyVisible(atmosphere, [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)], skyIntensity);
      for (let c = 0; c < 3; c++) sum[c] += s[c] / 9;
    }
    return sum;
  };
  const anti = sun.map((v) => -v);
  const horizon = band(1.25, anti), horizonElevated = band(16.25, anti);
  const irradiance = [0, 0, 0];
  for (let i = 0; i < 256; i++) {
    const a = ((i % 16) + 0.5) / 16, b = (Math.floor(i / 16) + 0.5) / 16;
    const rr = Math.sqrt(b), phi = a * 2 * Math.PI;
    const s = skyVisible(atmosphere, [rr * Math.cos(phi), Math.sqrt(Math.max(1 - b, 0)), rr * Math.sin(phi)], skyIntensity);
    for (let c = 0; c < 3; c++) irradiance[c] += s[c] / 256;
  }
  const hl = luminance(horizon), el = luminance(horizonElevated);
  return {
    irradiance, sunTransmittance: atmosphere.transmittanceToward(sun), horizon, horizonElevated,
    zenith: skyVisible(atmosphere, [0, 1, 0], skyIntensity), sunHorizon: band(1.25, sun),
    elevationFalloff: hl > 1e-6 ? Math.min(1, Math.max(0.05, el / hl)) : 1,
  };
}

// ---------------------------------------------------------------------------------------------- the legacy dome

/** sky.ts's DEFAULT_PRESET fields the legacy dome reads (verdant's authored sky). */
export const LEGACY_DEFAULT_PRESET = Object.freeze({
  skyIntensity: 1, sunElevationDeg: 32, sunAzimuthDeg: 115, turbidity: 4, rayleigh: 1.2,
  mieCoefficient: 0.006, mieDirectionalG: 0.82,
});

/**
 * The legacy dome radiance in a direction: three's Preetham Sky shader (r185) followed by sky.ts's injected
 * fragment — radiance scale 0.38, the horizon band's luminance ceiling and directional hue floor, the knee
 * (sun disc exempt), the compact sun glow — and the preset's skyIntensity. No dither, no night sky.
 */
export function legacySky(preset, dir) {
  const P = { ...LEGACY_DEFAULT_PRESET, ...preset };
  const sun = sunDirectionOf(P.sunElevationDeg, P.sunAzimuthDeg);
  const d = normalize(dir);
  // vertex stage
  const EE = 1000, cutoffAngle = 1.6110731556870734, steepness = 1.5;
  const cosZ = clamp(sun[1], -1, 1);
  const sunE = EE * Math.max(0, 1 - Math.exp(-((cutoffAngle - Math.acos(cosZ)) / steepness)));
  const sunfade = 1 - clamp(1 - Math.exp(sun[1] / 450000), 0, 1);
  const rayleighCoefficient = P.rayleigh - (1 - sunfade);
  const totalRayleigh = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
  const MieConst = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
  const cMie = (0.2 * P.turbidity) * 10e-18;
  const betaR = totalRayleigh.map((v) => v * rayleighCoefficient);
  const betaM = MieConst.map((v) => 0.434 * cMie * v * P.mieCoefficient * ATMO_CALIBRATION.legacyMieGain);
  // fragment stage
  const zenithAngle = Math.acos(Math.max(0, d[1]));
  const inverse = 1 / (Math.cos(zenithAngle) + 0.15 * Math.pow(93.885 - (zenithAngle * 180) / Math.PI, -1.253));
  const sR = 8.4e3 * inverse, sM = 1.25e3 * inverse;
  const Fex = betaR.map((r, i) => Math.exp(-(r * sR + betaM[i] * sM)));
  const cosTheta = dot(d, sun);
  const rPhase = (3 / (16 * Math.PI)) * (1 + Math.pow(cosTheta * 0.5 + 0.5, 2));
  const g = P.mieDirectionalG, g2 = g * g;
  const mPhase = (1 / (4 * Math.PI)) * ((1 - g2) / Math.pow(1 - 2 * g * cosTheta + g2, 1.5));
  const ratio = betaR.map((r, i) => (r * rPhase + betaM[i] * mPhase) / (r + betaM[i]));
  const sunFactor = clamp(Math.pow(1 - sun[1], 5), 0, 1);
  const Lin = ratio.map((q, i) => {
    let v = Math.pow(sunE * q * (1 - Fex[i]), 1.5);
    v *= mix(1, Math.pow(sunE * q * Fex[i], 0.5), sunFactor);
    return v;
  });
  const L0 = Fex.map((v) => 0.1 * v);
  const texColor = Lin.map((v, i) => (v + L0[i]) * 0.04 + [0, 0.0003, 0.00075][i]);
  // sky.ts's injected fragment
  let skyCol = texColor.map((v) => v * 0.38);
  const hazeBand = 1 - smoothstep(0, 0.24, d[1]);
  const dh = normalize([d[0], 0, d[2]]), sh = normalize([sun[0], 0, sun[2]]);
  const warmAmt = Math.pow(Math.max(dot(dh, sh), 0), 2.9);
  const hazeL = luminance(skyCol);
  const hazeCeil = 0.5 * mix(0.9, 1.0, warmAmt);
  if (hazeL > hazeCeil && hazeBand > 0.001) {
    const hazeTarget = hazeCeil + (hazeL - hazeCeil) * 0.18;
    const s = mix(1, hazeTarget / hazeL, hazeBand);
    skyCol = skyCol.map((v) => v * s);
  }
  const cool = [0.74, 0.88, 1.13], warm = [1.24, 1.02, 0.70];
  const hazeTint = cool.map((c, i) => mix(c, warm[i], warmAmt));
  const sl = luminance(skyCol);
  skyCol = skyCol.map((v, i) => mix(v, sl * hazeTint[i], hazeBand * 0.63));
  const sunDisc = smoothstep(0.99988, 0.99996, cosTheta);
  const skyL = luminance(skyCol);
  if (skyL > 1.0) {
    const kneeScale = (1.0 + 0.45 * (1 - Math.exp(-(skyL - 1.0) * 0.11))) / skyL;
    const s = mix(kneeScale, 1, sunDisc);
    skyCol = skyCol.map((v) => v * s);
  }
  const sunGlow = Math.pow(Math.max(cosTheta, 0), 240);
  skyCol = skyCol.map((v, i) => v + [1.30, 1.02, 0.68][i] * sunGlow * 0.5);
  return skyCol.map((v) => Math.max(v, 0) * P.skyIntensity);
}

/** The calibration's sample directions: relative azimuths × elevations, the camera band weighted, the sun's neighbourhood skipped. */
export function calibrationDirections(sunDir) {
  const sun = normalize(sunDir);
  const base = Math.atan2(sun[2], sun[0]);
  const out = [];
  for (const el of [2, 5, 10, 20, 35, 60, 90]) {
    for (const rel of el === 90 ? [0] : [0, 45, 90, 135, 180]) {
      const e = el * Math.PI / 180, az = base + rel * Math.PI / 180;
      const dir = [Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az)];
      if (dot(dir, sun) > Math.cos(8 * Math.PI / 180)) continue;
      out.push({ dir, weight: el <= 20 ? 2 : 1, elevationDeg: el, relativeAzimuthDeg: rel });
    }
  }
  return out;
}

/** Mean absolute log-radiance difference (per channel, weighted) between the two domes for a preset. */
export function calibrationResidual(preset, cpuAtmosphere = new CpuAtmosphere(skyPresetToAtmosphere({ ...LEGACY_DEFAULT_PRESET, ...preset }))) {
  const P = { ...LEGACY_DEFAULT_PRESET, ...preset };
  let sum = 0, weight = 0, lumSum = 0;
  for (const { dir, weight: w } of calibrationDirections(cpuAtmosphere.p.sunDir)) {
    const a = skyVisible(cpuAtmosphere, dir, P.skyIntensity), b = legacySky(P, dir);
    for (let c = 0; c < 3; c++) sum += w * Math.abs(Math.log(a[c] + 0.01) - Math.log(b[c] + 0.01));
    lumSum += w * (Math.log(luminance(a) + 0.01) - Math.log(luminance(b) + 0.01));
    weight += w;
  }
  return { meanAbsLog: sum / (3 * weight), meanLumLog: lumSum / weight };
}
