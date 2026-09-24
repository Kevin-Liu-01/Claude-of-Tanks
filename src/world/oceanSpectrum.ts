/**
 * Round 66 (2026-09-24): the ocean's spectrum, its cascade bands, the inverse-FFT butterfly plan and the GLSL of the
 * fragment-shader passes — everything the FFT ocean needs that is not a render target. Node-runnable, no THREE: the
 * receipt runs the same butterfly in JavaScript against a direct DFT and pins the generated shader text.
 *
 * Model. Tessendorf, "Simulating Ocean Water" (SIGGRAPH course notes, 2001): the surface is a sum of Gerstner-like
 * plane waves whose complex amplitudes h̃(k, t) = h̃0(k) e^{iωt} + h̃0*(−k) e^{−iωt} evolve with the dispersion relation
 * ω² = g k tanh(k d), and an inverse 2-D FFT turns the k-grid into the height Dy, the horizontal ("choppy") offsets
 * Dx, Dz = iλ (k/|k|) h̃ and the derivatives the normal and the Jacobian need. The amplitudes come from an empirical
 * directional spectrum (Horvath, "Empirical directional wave spectra for computer graphics", DigiPro 2015): the JONSWAP
 * frequency spectrum of Hasselmann et al. (1973) with the TMA finite-depth factor (Bouws et al., 1985; Kitaigorodskii
 * form), a Hasselmann (1980) cos^{2s} directional spreading blended with a plain cos², and the change of variables
 * Ψ(k) dk² = S(ω) D(θ, ω) (dω/dk) / k. Foam follows the Jacobian rule of the same notes: where the choppy map folds the
 * surface (det J < 1) the crest is breaking, and the whitecap it leaves decays over a few seconds.
 *
 * Three cascades (patch sizes large to small) partition the wave-number plane by band so the long swell, the wind
 * chop and the capillary ripple each get a whole grid: a wave belongs to the smallest patch that still holds six of
 * its wavelengths. The cascade tiles are stacked in ONE texture (n × cascades·(n + 1) texels) so every pass touches
 * all of them at once; each tile carries one padded row that repeats its first row, so bilinear sampling wraps
 * inside the tile (the x axis wraps through the sampler, the y axis through the pad).
 */

export type OceanKind = 'coast' | 'lake' | 'river' | 'marsh';

/** A map's authored sea state (the `ocean` block of its config); every field is optional and defaults per water kind. */
export interface OceanConfig {
  /** 10 m wind speed of the local wind sea (m/s). */
  windSpeed?: number;
  /** Direction the wind blows TOWARD, degrees from +X toward +Z in world XZ. */
  windDirDeg?: number;
  /** Fetch of the local wind sea (km): how far the wind has worked the water. */
  fetchKm?: number;
  /** Swell share 0..1: a second, long-fetch, narrowly spread system; 0 = wind sea only. */
  swell?: number;
  /** Swell direction (degrees, as windDirDeg); defaults to the wind direction. */
  swellDirDeg?: number;
  /** Amplitude scale on the whole surface (1 = the spectrum's own energy). */
  amplitude?: number;
  /** Horizontal (choppy) displacement scale λ, 0..1.2 (Tessendorf's choppiness). */
  choppiness?: number;
  /** Cascade patch sizes in metres, large to small. */
  patches?: readonly [number, number, number];
  /** Whitecap foam 0..1 (0 = never). */
  foam?: number;
  /** Water depth the spectrum is generated for (m; TMA factor + dispersion) — the sea the waves came from, not the drivable bed. */
  depthM?: number;
  /** Shore break strength 0..1: shoaling, whitewater and run-up on the bank band. */
  breakers?: number;
  /** Caustic light on the shelf bed 0..1. */
  caustics?: number;
  /** Directional spreading blend 0..1 (0 = plain cos², 1 = the Hasselmann cos^{2s} form). */
  spread?: number;
}

export interface OceanState {
  readonly kind: OceanKind;
  readonly windSpeed: number;
  readonly windDirDeg: number;
  readonly fetchKm: number;
  readonly swell: number;
  readonly swellDirDeg: number;
  readonly amplitude: number;
  readonly choppiness: number;
  readonly patches: readonly [number, number, number];
  readonly foam: number;
  readonly depthM: number;
  readonly breakers: number;
  readonly caustics: number;
  readonly spread: number;
}

export const OCEAN_FFT_SIZE = 128;
export const OCEAN_CASCADES = 3;
export const OCEAN_GRAVITY = 9.81;
/** A wave belongs to the smallest patch that still holds this many of its wavelengths. */
export const OCEAN_BAND_WAVELENGTHS = 6;
const TWO_PI = Math.PI * 2;

/**
 * Per-kind defaults: the current look of each water body kind. A coast carries a short wind sea with a little swell,
 * a lake a light chop, a river and a marsh only the faintest ripple (their bodies keep the authored normal-map wave).
 */
const KIND_DEFAULTS: Readonly<Record<OceanKind, Omit<OceanState, 'kind'>>> = Object.freeze({
  coast: Object.freeze({
    windSpeed: 5.0, windDirDeg: 200, fetchKm: 24, swell: 0.3, swellDirDeg: 200, amplitude: 1, choppiness: 0.9,
    patches: [400, 96, 12] as const, foam: 0.5, depthM: 40, breakers: 0.8, caustics: 0.6, spread: 0.85,
  }),
  lake: Object.freeze({
    windSpeed: 3.4, windDirDeg: 160, fetchKm: 4, swell: 0, swellDirDeg: 160, amplitude: 1, choppiness: 0.6,
    patches: [200, 48, 8] as const, foam: 0.1, depthM: 20, breakers: 0.25, caustics: 0.5, spread: 0.8,
  }),
  river: Object.freeze({
    windSpeed: 2.6, windDirDeg: 120, fetchKm: 2, swell: 0, swellDirDeg: 120, amplitude: 1, choppiness: 0.4,
    patches: [120, 30, 6] as const, foam: 0, depthM: 6, breakers: 0.1, caustics: 0.35, spread: 0.7,
  }),
  marsh: Object.freeze({
    windSpeed: 2.8, windDirDeg: 140, fetchKm: 2.5, swell: 0, swellDirDeg: 140, amplitude: 1, choppiness: 0.4,
    patches: [140, 32, 6] as const, foam: 0, depthM: 5, breakers: 0.1, caustics: 0.3, spread: 0.7,
  }),
});

function finite(value: number | undefined, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value as number)) : fallback;
}

/** The complete sea state of a map: its authored `ocean` block over the defaults of its water kind. */
export function resolveOceanState(kind: OceanKind, authored: OceanConfig | null | undefined = null): OceanState {
  const d = KIND_DEFAULTS[kind] ?? KIND_DEFAULTS.lake;
  const a = authored ?? {};
  const windDirDeg = finite(a.windDirDeg, d.windDirDeg, -1e6, 1e6);
  const p = a.patches;
  const patches: readonly [number, number, number] = p && p.length === 3 && p.every((v) => Number.isFinite(v) && v > 0.5)
    && p[0] > p[1] && p[1] > p[2] ? [p[0], p[1], p[2]] : d.patches;
  return Object.freeze({
    kind,
    windSpeed: finite(a.windSpeed, d.windSpeed, 0.1, 30),
    windDirDeg,
    fetchKm: finite(a.fetchKm, d.fetchKm, 0.1, 2000),
    swell: finite(a.swell, d.swell, 0, 1),
    swellDirDeg: finite(a.swellDirDeg, Number.isFinite(a.windDirDeg) ? windDirDeg : d.swellDirDeg, -1e6, 1e6),
    amplitude: finite(a.amplitude, d.amplitude, 0, 4),
    choppiness: finite(a.choppiness, d.choppiness, 0, 1.2),
    patches,
    foam: finite(a.foam, d.foam, 0, 1),
    depthM: finite(a.depthM, d.depthM, 0.5, 5000),
    breakers: finite(a.breakers, d.breakers, 0, 1),
    caustics: finite(a.caustics, d.caustics, 0, 1),
    spread: finite(a.spread, d.spread, 0, 1),
  });
}

// ---------------------------------------------------------------------------------------------------- the spectrum

/** Lanczos log-gamma (g = 7, nine terms), enough for the cos^{2s} normalisation at any spreading exponent. */
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
function logGamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** ω(k) for depth d: ω² = g k tanh(k d). */
function dispersion(k: number, depthM: number): number {
  return Math.sqrt(OCEAN_GRAVITY * k * Math.tanh(Math.min(k * depthM, 20)));
}
/** dω/dk for the same relation (the change of variables from S(ω) to Ψ(k)). */
function dispersionDerivative(k: number, depthM: number): number {
  const kd = Math.min(k * depthM, 20);
  const th = Math.tanh(kd), ch = Math.cosh(kd);
  return OCEAN_GRAVITY * (th + kd / (ch * ch)) / (2 * dispersion(k, depthM));
}
/** TMA finite-depth factor (Kitaigorodskii form): waves that would not fit the depth lose their energy. */
function tmaFactor(omega: number, depthM: number): number {
  const wh = omega * Math.sqrt(depthM / OCEAN_GRAVITY);
  if (wh <= 1) return wh * wh * 0.5;
  if (wh < 2) return 1 - (2 - wh) * (2 - wh) * 0.5;
  return 1;
}

interface WaveSystem {
  readonly scale: number;
  readonly dirRad: number;
  readonly spread: number;
  readonly swell: number;
  readonly alpha: number;
  readonly peakOmega: number;
  readonly gamma: number;
  /** Tessendorf's short-wave suppression length (m). */
  readonly fadeM: number;
}

function waveSystem(windSpeed: number, fetchKm: number, dirDeg: number, scale: number, spread: number, swell: number,
  fadeM: number): WaveSystem {
  const U = Math.max(0.1, windSpeed), F = Math.max(100, fetchKm * 1000);
  return {
    scale, dirRad: dirDeg * Math.PI / 180, spread, swell,
    // JONSWAP fetch laws (Hasselmann et al. 1973): the Phillips constant and the peak frequency of a fetch-limited sea
    alpha: 0.076 * Math.pow(U * U / (F * OCEAN_GRAVITY), 0.22),
    peakOmega: 22 * Math.pow(OCEAN_GRAVITY * OCEAN_GRAVITY / (U * F), 1 / 3),
    gamma: 3.3,
    fadeM,
  };
}

/** ∫ S(ω) dω of a system (its variance m0, the directional factor integrating to one): log-spaced quadrature. */
function systemEnergy(s: WaveSystem, depthM: number): number {
  const lo = Math.log(s.peakOmega * 0.2), hi = Math.log(s.peakOmega * 16), steps = 400;
  let m0 = 0;
  for (let i = 0; i < steps; i++) {
    const a = lo + (hi - lo) * (i + 0.5) / steps, omega = Math.exp(a);
    m0 += jonswap(omega, s, depthM) * omega * (hi - lo) / steps; // dω = ω d(ln ω)
  }
  return m0;
}

/** JONSWAP S(ω) with the TMA factor. */
function jonswap(omega: number, s: WaveSystem, depthM: number): number {
  const sigma = omega <= s.peakOmega ? 0.07 : 0.09;
  const d = omega - s.peakOmega;
  const r = Math.exp(-d * d / (2 * sigma * sigma * s.peakOmega * s.peakOmega));
  const inv = 1 / omega, po = s.peakOmega * inv;
  return s.scale * tmaFactor(omega, depthM) * s.alpha * OCEAN_GRAVITY * OCEAN_GRAVITY * Math.pow(inv, 5)
    * Math.exp(-1.25 * po * po * po * po) * Math.pow(s.gamma, r);
}

/** Hasselmann (1980) cos^{2s} spreading, blended with a plain positive cos² (Horvath's construction); integrates to 1 over θ. */
function directionalSpread(theta: number, omega: number, s: WaveSystem): number {
  const ratio = omega / s.peakOmega;
  const power = omega > s.peakOmega ? 9.77 * Math.pow(ratio, -2.5) : 6.97 * Math.pow(ratio, 5);
  const sp = power + 16 * Math.tanh(Math.min(ratio, 20)) * s.swell * s.swell;
  const dTheta = theta - s.dirRad;
  const norm = Math.exp(logGamma(sp + 1) - logGamma(sp + 0.5)) / (2 * Math.sqrt(Math.PI));
  const cos2s = norm * Math.pow(Math.abs(Math.cos(dTheta * 0.5)), 2 * sp);
  const c = Math.cos(dTheta);
  const base = c > 0 ? c * c * (2 / Math.PI) : 0;
  return base + (cos2s - base) * s.spread;
}

/** lowbias32 integer mix (Wellons) → a uniform in (0, 1). */
function hashUnit(x: number): number {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return (x + 0.5) / 4294967296;
}

export interface OceanSpectrumTexels {
  /** Grid size per cascade. */
  readonly n: number;
  /** Rows per cascade tile (n + 1: the last row repeats the first so bilinear sampling wraps inside the tile). */
  readonly rows: number;
  readonly cascades: number;
  /** RGBA float texels, n × rows·cascades: (h̃0(k).re, .im, h̃0*(−k).re, .im). */
  readonly data: Float32Array;
  /** Per-cascade wave-number band [low, high). */
  readonly bands: readonly (readonly [number, number])[];
  /** Significant wave height 4·√m0 of the whole spectrum (m). */
  readonly hs: number;
  readonly hsPerCascade: readonly number[];
}

/** The wave-number bands of the cascades: a wave belongs to the smallest patch that still holds six wavelengths. */
export function oceanBands(patches: readonly number[]): (readonly [number, number])[] {
  return patches.map((_, c) => [
    c === 0 ? 1e-4 : TWO_PI * OCEAN_BAND_WAVELENGTHS / patches[c],
    c === patches.length - 1 ? Infinity : TWO_PI * OCEAN_BAND_WAVELENGTHS / patches[c + 1],
  ] as const);
}

/**
 * Build the time-zero spectrum texels of every cascade: h̃0(k) = (ξr + iξi)/√2 · √(Ψ(k) dk²) with Ψ the sum of the
 * wind sea and the swell, and beside it the conjugate of the opposite wave vector so the evolution pass reads one
 * texel per k. The Nyquist row/column and k = 0 carry nothing (they have no partner). Deterministic per seed.
 */
export function buildOceanSpectrum(state: OceanState, n = OCEAN_FFT_SIZE, seed = 1337): OceanSpectrumTexels {
  let result: OceanSpectrumTexels | null = null;
  for (const step of oceanSpectrumSteps(state, n, seed)) result = step;
  return result as OceanSpectrumTexels;
}

/** The same build sliced per cascade (the world builder yields between slices); the last value is the result. */
export function* oceanSpectrumSteps(state: OceanState, n = OCEAN_FFT_SIZE, seed = 1337): Generator<OceanSpectrumTexels | null, void, void> {
  const cascades = state.patches.length, rows = n + 1, half = n >> 1;
  const data = new Float32Array(n * rows * cascades * 4);
  const bands = oceanBands(state.patches);
  const local = waveSystem(state.windSpeed, state.fetchKm, state.windDirDeg, 1, state.spread, 0.05, 0.01);
  const systems: WaveSystem[] = [local];
  if (state.swell > 0) {
    // the swell: a distant, long-fetch sea arriving as a narrow band of long waves, carrying `swell` times the
    // wind sea's energy (its raw fetch-limited energy would be metres of sea on a 5 m/s coast)
    const raw = waveSystem(state.windSpeed * 1.4, 400, state.swellDirDeg, 1, 1, 0.9, 0.1);
    const share = state.swell * systemEnergy(local, state.depthM) / Math.max(1e-9, systemEnergy(raw, state.depthM));
    systems.push({ ...raw, scale: share });
  }
  const amp2 = state.amplitude * state.amplitude;
  const hsPerCascade: number[] = [];
  let m0 = 0;
  for (let c = 0; c < cascades; c++) {
    if (c > 0) yield null;
    const L = state.patches[c], dk = TWO_PI / L, [low, high] = bands[c];
    const h0 = new Float64Array(n * n * 2);
    let m0c = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (i === 0 || j === 0) continue; // the Nyquist line has no mirror texel
        const kx = (i - half) * dk, kz = (j - half) * dk, k = Math.hypot(kx, kz);
        if (k < low || k >= high || k < 1e-6) continue;
        const omega = dispersion(k, state.depthM), dOmega = dispersionDerivative(k, state.depthM);
        const theta = Math.atan2(kz, kx);
        let psi = 0;
        for (const s of systems) {
          const S = jonswap(omega, s, state.depthM) * directionalSpread(theta, omega, s)
            * Math.exp(-s.fadeM * s.fadeM * k * k);
          psi += S;
        }
        psi *= Math.abs(dOmega) / k * amp2;
        if (!(psi > 0)) continue;
        const variance = psi * dk * dk;
        m0c += variance;
        const amp = 0.5 * Math.sqrt(variance);
        const base = ((seed * 7919 + c * 1000003 + j * 4099 + i) * 2) >>> 0;
        const u1 = hashUnit(base), u2 = hashUnit(base + 1);
        const rad = Math.sqrt(-2 * Math.log(u1));
        const o = (j * n + i) * 2;
        h0[o] = rad * Math.cos(u2 * TWO_PI) * amp;
        h0[o + 1] = rad * Math.sin(u2 * TWO_PI) * amp;
      }
    }
    m0 += m0c;
    hsPerCascade.push(4 * Math.sqrt(m0c));
    for (let j = 0; j < rows; j++) {
      const jj = j === n ? 0 : j;
      for (let i = 0; i < n; i++) {
        const o = (jj * n + i) * 2;
        const mi = (n - i) % n, mj = (n - jj) % n, om = (mj * n + mi) * 2;
        const t = ((c * rows + j) * n + i) * 4;
        data[t] = h0[o];
        data[t + 1] = h0[o + 1];
        data[t + 2] = h0[om];
        data[t + 3] = -h0[om + 1];
      }
    }
  }
  yield { n, rows, cascades, data, bands, hs: 4 * Math.sqrt(m0), hsPerCascade };
}

// ---------------------------------------------------------------------------------------------- the butterfly plan

/** Radix plan of the Stockham passes for an n-point transform: sixteens first, then eights, fours, twos. */
export function oceanStagePlan(n: number): number[] {
  if (!Number.isInteger(n) || n < 2 || (n & (n - 1)) !== 0) throw new Error(`ocean FFT size must be a power of two, got ${n}`);
  const radices: number[] = [];
  let product = 1;
  while (product < n) {
    const left = n / product;
    const radix = left >= 16 ? 16 : left >= 8 ? 8 : left >= 4 ? 4 : 2;
    radices.push(radix);
    product *= radix;
  }
  return radices;
}

/**
 * One Stockham stage of an unnormalised INVERSE transform (e^{+2πi·io/n}), written per OUTPUT element exactly as the
 * fragment shader computes it: the output index o names its butterfly group (q), its slot in the radix-R DFT (r) and
 * the group's base input (j = q·ns + jm); the R inputs sit ns·R/ns… at stride n/R, each turned by the twiddle
 * e^{+2πi·rr·jm/(ns·R)} before the R-point DFT. `src`/`dst` are interleaved complex arrays of length 2n.
 */
export function stockhamStage(src: ArrayLike<number>, dst: Float64Array, n: number, ns: number, radix: number): void {
  const span = ns * radix, stride = n / radix;
  for (let o = 0; o < n; o++) {
    const q = Math.floor(o / span), rem = o - q * span, r = Math.floor(rem / ns), jm = rem - r * ns, j = q * ns + jm;
    const ang = TWO_PI * jm / span;
    let re = 0, im = 0;
    for (let rr = 0; rr < radix; rr++) {
      const idx = j + rr * stride;
      const ar = src[idx * 2], ai = src[idx * 2 + 1];
      const tw = rr * ang, wr = Math.cos(tw), wi = Math.sin(tw);
      const tr = ar * wr - ai * wi, ti = ar * wi + ai * wr;
      const da = TWO_PI * ((r * rr) % radix) / radix, dr = Math.cos(da), di = Math.sin(da);
      re += tr * dr - ti * di;
      im += tr * di + ti * dr;
    }
    dst[o * 2] = re;
    dst[o * 2 + 1] = im;
  }
}

/** The whole n-point inverse transform through the stage plan (the JavaScript twin of the pass sequence). */
export function stockhamInverse(input: ArrayLike<number>, n: number, plan = oceanStagePlan(n)): Float64Array {
  let src = Float64Array.from(input as ArrayLike<number>), dst = new Float64Array(n * 2);
  let ns = 1;
  for (const radix of plan) {
    stockhamStage(src, dst, n, ns, radix);
    ns *= radix;
    const swap = src; src = dst; dst = swap;
  }
  return src;
}

/** Direct O(n²) inverse DFT reference: X[o] = Σ x[i] e^{+2πi·io/n}. */
export function inverseDftReference(input: ArrayLike<number>, n: number): Float64Array {
  const out = new Float64Array(n * 2);
  for (let o = 0; o < n; o++) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) {
      const a = TWO_PI * ((i * o) % n) / n, c = Math.cos(a), s = Math.sin(a);
      re += input[i * 2] * c - input[i * 2 + 1] * s;
      im += input[i * 2] * s + input[i * 2 + 1] * c;
    }
    out[o * 2] = re;
    out[o * 2 + 1] = im;
  }
  return out;
}

/**
 * The spatial field of a centred spectrum on an n × n grid — rows then columns through the Stockham plan, then the
 * (−1)^{x+z} sign that moves the k origin from texel n/2 to texel 0 — and the direct double sum it must equal:
 * h(x, z) = Σ_k h̃(k) e^{i(kx·x + kz·z)} with k = (i − n/2, j − n/2)·dk and x = (u, v)·L/n. Used by the receipt.
 */
export function spatialFieldViaStockham(spectrum: ArrayLike<number>, n: number): Float64Array {
  const rows = new Float64Array(n * n * 2), line = new Float64Array(n * 2);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) { line[i * 2] = spectrum[(j * n + i) * 2]; line[i * 2 + 1] = spectrum[(j * n + i) * 2 + 1]; }
    const out = stockhamInverse(line, n);
    for (let i = 0; i < n; i++) { rows[(j * n + i) * 2] = out[i * 2]; rows[(j * n + i) * 2 + 1] = out[i * 2 + 1]; }
  }
  const field = new Float64Array(n * n * 2);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) { line[j * 2] = rows[(j * n + i) * 2]; line[j * 2 + 1] = rows[(j * n + i) * 2 + 1]; }
    const out = stockhamInverse(line, n);
    for (let j = 0; j < n; j++) {
      const sign = ((i + j) & 1) === 0 ? 1 : -1;
      field[(j * n + i) * 2] = out[j * 2] * sign;
      field[(j * n + i) * 2 + 1] = out[j * 2 + 1] * sign;
    }
  }
  return field;
}
export function spatialFieldReference(spectrum: ArrayLike<number>, n: number): Float64Array {
  const half = n >> 1, field = new Float64Array(n * n * 2);
  for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) {
    let re = 0, im = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = TWO_PI * ((i - half) * u + (j - half) * v) / n, c = Math.cos(a), s = Math.sin(a);
      const hr = spectrum[(j * n + i) * 2], hi = spectrum[(j * n + i) * 2 + 1];
      re += hr * c - hi * s;
      im += hr * s + hi * c;
    }
    field[(v * n + u) * 2] = re;
    field[(v * n + u) * 2 + 1] = im;
  }
  return field;
}

// ---------------------------------------------------------------------------------------------------- the shaders

export interface OceanStageShaderOptions {
  n: number;
  cascades: number;
  radix: number;
  /** Sub-transform length before this stage (1, then the product of the earlier radices). */
  ns: number;
  horizontal: boolean;
  /** The first pass reads the spectrum texture and evolves it to the current time. */
  first: boolean;
  /** The last pass applies the sign, the Jacobian foam and writes the displacement / derivative maps. */
  last: boolean;
}

export const OCEAN_QUAD_VERTEX = 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }';

/**
 * One fragment-shader pass of the inverse FFT over the stacked cascade tiles (GLSL ES 3.00, two colour outputs).
 * Packed complex fields, two per output: A = (Dx + i Dz, Dy + i dDx/dz), B = (dDy/dx + i dDy/dz, dDx/dx + i dDz/dz);
 * every field is real-valued in space because each spectrum is Hermitian, so the two halves of each complex transform
 * carry two real fields. A texel's transform index is its column (horizontal passes) or its row inside the tile
 * (vertical passes); a tile's padded row is computed as its first row.
 */
export function oceanStageShader(o: OceanStageShaderOptions): string {
  const { n, cascades, radix, ns, horizontal, first, last } = o;
  const rows = n + 1, half = n >> 1, stride = n / radix, span = ns * radix;
  const fetchTile = horizontal ? 'ivec2(idx, p.y)' : 'ivec2(p.x, tile * ROWS + idx)';
  return /* glsl */`
#define N ${n}
#define ROWS ${rows}
#define CASCADES ${cascades}
#define RADIX ${radix}
#define NS ${ns}
#define SPAN ${span}
#define STRIDE ${stride}
uniform sampler2D tA;
uniform sampler2D tB;
uniform sampler2D tH0;
uniform sampler2D tPrev;
uniform float uTime;
uniform float uDt;
uniform float uDepth;
uniform float uChop;
uniform vec4 uFoam;
uniform vec3 uPatch;
layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;
const float TAU = 6.283185307179586;
const float G = ${OCEAN_GRAVITY.toFixed(2)};
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec4 cmul2(vec4 v, vec2 w) { return vec4(cmul(v.xy, w), cmul(v.zw, w)); }
${first ? /* glsl */`
// Tessendorf: h̃(k, t) = h̃0(k) e^{iωt} + h̃0*(−k) e^{−iωt}, then the packed displacement / derivative spectra of one k.
void spectrumFields(ivec2 tc, int ix, int iz, float L, out vec4 a, out vec4 b) {
  vec4 h = texelFetch(tH0, tc, 0);
  float dk = TAU / L;
  float kx = float(ix - ${half}) * dk;
  float kz = float(iz - ${half}) * dk;
  float k = length(vec2(kx, kz));
  float ik = k > 1e-6 ? 1.0 / k : 0.0;
  float omega = sqrt(G * k * tanh(min(k * uDepth, 20.0)));
  float ph = omega * uTime;
  float cs = cos(ph), sn = sin(ph);
  float hr = h.x * cs - h.y * sn + h.z * cs + h.w * sn;
  float hi = h.x * sn + h.y * cs - h.z * sn + h.w * cs;
  float fx = kx * ik, fz = kz * ik;
  vec2 c0 = vec2(-(fx * hi + fz * hr), fx * hr - fz * hi);      // Dx + i Dz
  float q = -(kx * kz * ik);
  vec2 c1 = vec2(hr - q * hi, hi + q * hr);                      // Dy + i dDx/dz
  vec2 c2 = vec2(-(kx * hi + kz * hr), kx * hr - kz * hi);       // dDy/dx + i dDy/dz
  float ax = -(kx * kx * ik), bz = -(kz * kz * ik);
  vec2 c3 = vec2(ax * hr - bz * hi, ax * hi + bz * hr);          // dDx/dx + i dDz/dz
  a = vec4(c0, c1);
  b = vec4(c2, c3);
}` : ''}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int tile = p.y / ROWS;
  int yl = p.y - tile * ROWS;
  if (yl >= N) yl = 0;                       // the padded row repeats the tile's first row
  int o = ${horizontal ? 'p.x' : 'yl'};
  int q = o / SPAN;
  int rem = o - q * SPAN;
  int r = rem / NS;
  int jm = rem - r * NS;
  int j = q * NS + jm;
  float ang = TAU * float(jm) / float(SPAN);
  vec4 accA = vec4(0.0), accB = vec4(0.0);
  for (int rr = 0; rr < RADIX; rr++) {
    int idx = j + rr * STRIDE;
    ivec2 tc = ${fetchTile};
    vec4 a, b;
${first ? '    spectrumFields(tc, idx, yl, uPatch[tile], a, b);' : '    a = texelFetch(tA, tc, 0);\n    b = texelFetch(tB, tc, 0);'}
    float tw = float(rr) * ang;
    vec2 w = vec2(cos(tw), sin(tw));
    float da = TAU * float((r * rr) % RADIX) / float(RADIX);
    vec2 wd = vec2(cos(da), sin(da));
    accA += cmul2(cmul2(a, w), wd);
    accB += cmul2(cmul2(b, w), wd);
  }
${last ? /* glsl */`
  // the k origin sits at texel N/2: (−1)^{x+z} moves it to texel 0
  float sign = ((p.x + yl) & 1) == 0 ? 1.0 : -1.0;
  vec4 A = accA * sign, B = accB * sign;
  float Dx = A.x, Dz = A.y, Dy = A.z, Dxz = A.w;
  float Dyx = B.x, Dyz = B.y, Dxx = B.z, Dzz = B.w;
  float lam = uChop;
  // Jacobian of the choppy map: det < 1 is a folding crest (breaking); the foam it leaves decays and spreads in time
  float jxx = 1.0 + lam * Dxx, jzz = 1.0 + lam * Dzz, jxz = lam * Dxz;
  float J = jxx * jzz - jxz * jxz;
  float prev = texelFetch(tPrev, p, 0).a;
  float gen = clamp((uFoam.x - J) * uFoam.y, 0.0, 1.0);
  float foam = clamp(max(prev * exp(-uFoam.z * uDt) + gen * uFoam.w * uDt, gen * 0.5), 0.0, 1.0);
  oA = vec4(lam * Dx, Dy, lam * Dz, foam);
  oB = vec4(Dyx, Dyz, lam * Dxx, lam * Dzz);` : '  oA = accA;\n  oB = accB;'}
}`;
}

/** The pass sequence of one frame for an n-point grid: horizontal stages then vertical, the first evolving the spectrum. */
export function oceanPassPlan(n: number, cascades: number): OceanStageShaderOptions[] {
  const plan = oceanStagePlan(n);
  const passes: OceanStageShaderOptions[] = [];
  for (const horizontal of [true, false]) {
    let ns = 1;
    plan.forEach((radix, index) => {
      passes.push({
        n, cascades, radix, ns, horizontal,
        first: horizontal && index === 0,
        last: !horizontal && index === plan.length - 1,
      });
      ns *= radix;
    });
  }
  return passes;
}
