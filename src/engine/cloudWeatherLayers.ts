/**
 * cloudWeatherLayers.ts — the sky's weather beyond the volumetric slab (2026-10-01, the clouds-and-skyboxes lane).
 *
 * The slab (volumetricClouds.ts) carries a map's low and convective cloud; a real sky is layered and has weather in
 * it. This module adds, to the same trace and lit by the same atmosphere:
 *   - a mid-level layer — altocumulus elements ranked in rows across the wind (a mackerel sky), an altostratus veil,
 *     cirrocumulus ripples high up — as a 2.5D sheet: an element's thickness from the shape volume's billow octaves,
 *     the light reaching it through its own upper half and the elements toward the sun (so a low sun lights one flank
 *     and leaves the other in shade), the multiple-scattering octaves and the dual-lobe phase of the slab;
 *   - contrails — fresh lines of two merging plumes at the head that spread into contrail cirrus toward the tail,
 *     their optical depth falling as they widen (the ice spreads), drifting with the upper wind;
 *   - distant cumulonimbus cells on the horizon — a tower with a billowed outline, an anvil spread downwind under the
 *     tropopause, the sun's path through the cell found analytically (lit flanks and tops, a dark base), the
 *     boundary layer's haze on the base and not on the top — with the rain shaft under each;
 *   - rain shafts and virga under the slab's own precipitating cores (the columns leaning with the wind, streaked,
 *     evaporating partway down under a dry base);
 *   - a fog bank lying on the sea at the horizon.
 * Placement is deterministic per map (the weather offset hashes the storm cells and the trails), the GLSL reads
 * only the slab's noise volumes and weather fields, and every term is gated by its own uniform (a map without the
 * layer pays a branch). Written first-party from the meteorology; nothing is copied from any reference renderer.
 *
 * This module places the trails and the cells and packs the layers' uniforms; their GLSL is written in the trace
 * program itself (volumetricClouds.ts, the section "the weather layers"), so the build's GLSL minifier strips its
 * comments with the rest of the program (a fragment spliced in at run time ships exactly as written; 2026-10-02).
 */
import * as THREE from 'three';
import type { CloudLayerPreset } from './cloudPresets.ts';

export const CLOUD_CONTRAIL_MAX = 6;
export const CLOUD_STORM_MAX = 3;
/** The storm cells' billows sample the shape volume at this world period (m): kilometre lumps on a tower. */
export const CLOUD_STORM_SHAPE_TILE_M = 7000;
/**
 * Rain shafts under the slab: the ray's run under the base is sampled from here to there (m) at this many points. The
 * run starts near the composite's 3.4 km dome: the terrain inside it hides the dome, so nearer rain could only be
 * mis-occluded by a hill behind it.
 */
export const CLOUD_RAIN_RANGE_M = Object.freeze([3000, 24000] as const);
export const CLOUD_RAIN_SAMPLES = 8;
/** The sea fog bank begins past the terrain (all of it stands inside the cloud dome's 3.4 km) and ends here (m). */
export const CLOUD_FOGBANK_RANGE_M = Object.freeze([3600, 30000] as const);
/** Rain's extinction (1/m) at a full core: a five-kilometre curtain reads as a grey veil (τ ≈ 1.5). */
export const CLOUD_RAIN_EXTINCTION = 0.0003;
/** A storm cell's extinction (1/m): opaque within a few hundred metres. */
const CLOUD_STORM_EXTINCTION = 0.004;
/** The fog bank's extinction (1/m): a ten-kilometre run through it is a white wall. */
const CLOUD_FOGBANK_EXTINCTION = 0.0007;

/** Integer hash → [0, 1) (first-party; the same family as cloudNoise.ts). */
function hash01(a: number, b: number): number {
  let h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ 0x2f6b) | 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  h = Math.imul(h ^ (h >>> 7), 0x27d4eb2d);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** One contrail: its direction (unit, world XZ), its line's offset from the origin (m), its centre along the line, half length, the head's and tail's age (0..1) and a fresh trail's optical depth. */
interface CloudContrail {
  dir: [number, number];
  offsetM: number;
  centreM: number;
  halfLengthM: number;
  headAge: number;
  tailAge: number;
  depth: number;
}

/** The map's trails: deterministic from its weather offset (each map opens under its own traffic). */
export function cloudContrails(preset: Pick<CloudLayerPreset, 'contrails' | 'contrailAge' | 'offset'>): CloudContrail[] {
  const out: CloudContrail[] = [];
  const seed = Math.floor(preset.offset[0] * 9973) ^ Math.floor(preset.offset[1] * 7919);
  for (let i = 0; i < Math.min(CLOUD_CONTRAIL_MAX, preset.contrails); i++) {
    const h = (k: number): number => hash01(seed + i * 31, k);
    // the airways cross the sky in a few headings: two trails often share one (a corridor), the rest cross it
    const corridor = h(1) < 0.45 && i > 0 ? out[0] : null;
    const angle = corridor ? Math.atan2(corridor.dir[1], corridor.dir[0]) + (h(2) - 0.5) * 0.12 : h(2) * Math.PI;
    const age = preset.contrailAge;
    const tail = Math.min(1, age * (0.55 + 0.9 * h(6)));
    out.push({
      dir: [Math.cos(angle), Math.sin(angle)],
      offsetM: (h(3) - 0.5) * 26000,
      centreM: (h(4) - 0.5) * 18000,
      halfLengthM: 14000 + 26000 * h(5),
      headAge: Math.min(tail, age * 0.25 * h(7)),
      tailAge: tail,
      depth: 0.32 + 0.3 * h(8),
    });
  }
  return out;
}

/** One distant storm cell: its centre (world XZ, m), core radius, base, top, anvil radius (m), rain 0..1. */
interface CloudStormCell {
  x: number;
  z: number;
  radiusM: number;
  baseM: number;
  topM: number;
  anvilM: number;
  rain: number;
}

/** The map's storm cells: spread over a sector around its azimuth at its distance, deterministic per map. */
export function cloudStormCells(preset: Pick<CloudLayerPreset, 'storms' | 'stormAzRad' | 'stormDistM' | 'stormTopM' | 'baseM' | 'rain' | 'offset'>): CloudStormCell[] {
  const out: CloudStormCell[] = [];
  const n = Math.min(CLOUD_STORM_MAX, preset.storms);
  const seed = Math.floor(preset.offset[0] * 6007) ^ Math.floor(preset.offset[1] * 4001);
  for (let i = 0; i < n; i++) {
    const h = (k: number): number => hash01(seed + i * 17, k);
    const az = preset.stormAzRad + (i - (n - 1) / 2) * 0.55 + (h(1) - 0.5) * 0.24;
    const dist = preset.stormDistM * (0.82 + 0.4 * h(2));
    const radius = 2400 + 1600 * h(3);
    out.push({
      x: Math.cos(az) * dist, z: Math.sin(az) * dist,
      radiusM: radius,
      baseM: Math.max(600, Math.min(preset.baseM, 1600)),
      topM: preset.stormTopM * (0.84 + 0.22 * h(4)),
      anvilM: radius * (2.1 + 0.9 * h(5)),
      rain: Math.max(0.55, preset.rain) * (0.75 + 0.25 * h(6)),
    });
  }
  return out;
}

/** The trace's uniforms for the weather layers (merged into the trace material's uniforms). */
export function createCloudWeatherUniforms(): Record<string, THREE.IUniform> {
  return {
    uMid: { value: new THREE.Vector4() }, uMidShape: { value: new THREE.Vector4(280, 0, 0, 0) },
    uMidShift: { value: new THREE.Vector2() }, uMidDir: { value: new THREE.Vector2(1, 0) },
    uContrailA: { value: Array.from({ length: CLOUD_CONTRAIL_MAX }, () => new THREE.Vector4()) },
    uContrailB: { value: Array.from({ length: CLOUD_CONTRAIL_MAX }, () => new THREE.Vector4()) },
    uContrails: { value: 0 }, uUpperDrift: { value: new THREE.Vector2() },
    uStormA: { value: Array.from({ length: CLOUD_STORM_MAX }, () => new THREE.Vector4()) },
    uStormB: { value: Array.from({ length: CLOUD_STORM_MAX }, () => new THREE.Vector4()) },
    uStorms: { value: 0 },
    uRain: { value: new THREE.Vector4() }, uFogBank: { value: new THREE.Vector4() },
  };
}

/** Point the weather uniforms at a preset (once per preset: the placement is static, the drifts move per frame). */
export function applyCloudWeatherPreset(u: Record<string, THREE.IUniform>, preset: CloudLayerPreset): void {
  (u.uMid.value as THREE.Vector4).set(preset.midKind ? preset.midCoverage : 0, preset.midAltM, preset.midThicknessM, preset.midDensity);
  (u.uMidShape.value as THREE.Vector4).set(preset.midCellM, preset.midBands, preset.midKind, (u.uMidShape.value as THREE.Vector4).w);
  (u.uMidDir.value as THREE.Vector2).set(Math.cos(preset.cirrusAngleRad), Math.sin(preset.cirrusAngleRad));
  const trails = cloudContrails(preset);
  u.uContrails.value = trails.length;
  trails.forEach((t, i) => {
    (u.uContrailA.value as THREE.Vector4[])[i].set(t.dir[0], t.dir[1], t.offsetM, t.centreM);
    (u.uContrailB.value as THREE.Vector4[])[i].set(t.halfLengthM, t.headAge, t.tailAge, t.depth);
  });
  const cells = cloudStormCells(preset);
  u.uStorms.value = cells.length;
  cells.forEach((c, i) => {
    (u.uStormA.value as THREE.Vector4[])[i].set(c.x, c.z, c.radiusM, c.baseM);
    (u.uStormB.value as THREE.Vector4[])[i].set(c.topM, c.anvilM, c.rain, CLOUD_STORM_EXTINCTION);
  });
  // the shafts lean a third of a metre downwind per metre of fall (a 10 m/s wind on rain falling at 4–6 m/s, half of it
  // already carried by the cloud's own drift)
  (u.uRain.value as THREE.Vector4).set(preset.rain, preset.virga, 0.35, CLOUD_RAIN_EXTINCTION);
  (u.uFogBank.value as THREE.Vector4).set(preset.fogBank, preset.fogBankTopM, CLOUD_FOGBANK_RANGE_M[0], CLOUD_FOGBANK_EXTINCTION);
}
