/**
 * cloudWeatherLayers.ts — the sky's weather beyond the volumetric slab (2026-10-01, the clouds-and-skyboxes lane).
 *
 * The slab (volumetricClouds.ts) carries a map's low and convective cloud; a real sky has weather in it. This module
 * places and packs, for the same trace and lit by the same atmosphere:
 *   - contrails — fresh lines of two merging plumes at the head that spread into contrail cirrus toward the tail,
 *     their optical depth falling as they widen (the ice spreads), drifting with the upper wind;
 *   - rain shafts and virga under the slab's own precipitating cores (the columns leaning with the wind, streaked,
 *     evaporating partway down under a dry base);
 *   - a fog bank lying on the sea at the horizon.
 * Placement is deterministic per map (the weather offset hashes the trails), the GLSL reads only the slab's noise
 * volumes and weather fields, and every term is gated by its own uniform (a map without the layer pays a branch).
 * Written first-party from the meteorology; nothing is copied from any reference renderer. Their GLSL is written in
 * the trace program itself (volumetricClouds.ts, the section "the weather layers"), so the build's GLSL minifier strips
 * its comments with the rest of the program.
 *
 * 2026-10-02: the lane's mid-level layer (a 2.5D altocumulus / altostratus / cirrocumulus / lenticular sheet) and its
 * distant cumulonimbus cells were removed after two labs: the sheet read as pancakes, discs and specks, the cells as
 * mushroom clouds on the open horizons. Their first cut is in 31c46bfa8 for a rebuild.
 */
import * as THREE from 'three';
import type { CloudLayerPreset } from './cloudPresets.ts';

export const CLOUD_CONTRAIL_MAX = 6;
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
const CLOUD_RAIN_EXTINCTION = 0.0003;
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
      // 2026-10-03 (the skies lane; the gauntlet's wave 5: "a bright, perfectly straight diagonal streak spans almost
      // the entire sky, an unmistakable rendering artifact"): 14–44 km long instead of 28–80 (a trail crosses a sector of
      // the sky, not all of it) and a fresh trail's optical depth 0.2–0.38 instead of 0.32–0.62 (a thin veil, not a
      // glaring line); the GLSL breaks each trail where the air is too dry for it to persist
      halfLengthM: 7000 + 15000 * h(5),
      headAge: Math.min(tail, age * 0.25 * h(7)),
      tailAge: tail,
      depth: 0.2 + 0.18 * h(8),
    });
  }
  return out;
}

/** The trace's uniforms for the weather layers (merged into the trace material's uniforms). */
export function createCloudWeatherUniforms(): Record<string, THREE.IUniform> {
  return {
    uContrailA: { value: Array.from({ length: CLOUD_CONTRAIL_MAX }, () => new THREE.Vector4()) },
    uContrailB: { value: Array.from({ length: CLOUD_CONTRAIL_MAX }, () => new THREE.Vector4()) },
    uContrails: { value: 0 }, uUpperDrift: { value: new THREE.Vector2() },
    uRain: { value: new THREE.Vector4() }, uRainCore: { value: 0 }, uFogBank: { value: new THREE.Vector4() },
  };
}

/** Point the weather uniforms at a preset (once per preset: the placement is static, the drift moves per frame). */
export function applyCloudWeatherPreset(u: Record<string, THREE.IUniform>, preset: CloudLayerPreset): void {
  const trails = cloudContrails(preset);
  u.uContrails.value = trails.length;
  trails.forEach((t, i) => {
    (u.uContrailA.value as THREE.Vector4[])[i].set(t.dir[0], t.dir[1], t.offsetM, t.centreM);
    (u.uContrailB.value as THREE.Vector4[])[i].set(t.halfLengthM, t.headAge, t.tailAge, t.depth);
  });
  // the shafts lean a third of a metre downwind per metre of fall (a 10 m/s wind on rain falling at 4–6 m/s, half of it
  // already carried by the cloud's own drift)
  (u.uRain.value as THREE.Vector4).set(preset.rain, preset.virga, 0.35, CLOUD_RAIN_EXTINCTION);
  (u.uFogBank.value as THREE.Vector4).set(preset.fogBank, preset.fogBankTopM, CLOUD_FOGBANK_RANGE_M[0], CLOUD_FOGBANK_EXTINCTION);
}
