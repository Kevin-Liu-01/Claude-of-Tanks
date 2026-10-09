import * as THREE from 'three';
import { sampleHorizonFace } from './horizonSurface.ts';

/**
 * Round 32 (owner 2026-09-21, "redrock still has the noticeable texture/shadow/quality loss beyond the map
 * borders"): the rim bands of the rock and sand maps carried no objects at all — the battlefield's boulders,
 * outcrops and pebbles stop dead at the playable edge, and the ring forest (horizonVista.ts) only serves the wooded
 * maps — so Redrock's outland read as a bare, shadowless sheet beside a battlefield full of silhouettes. This strews
 * instanced boulders over the near ring faces: dense on the terrain-material rim band, sparse on the first ranges,
 * clustered into outcrops, the near class casting (and receiving) real shadows like the battlefield's own rocks.
 * Deterministic per map seed; three shared geometries, at most nine instanced meshes, no per-frame work.
 */
interface HorizonRockfieldOptions {
  columns: number;
  rows: readonly { r: number; aer: number; skirt?: boolean; interpolated?: boolean }[];
  positions: Float32Array;
  heights: Float32Array;
  seed: number;
  /** Linear colours: the map's rock tint (the boulders) and its fog (aerial perspective). */
  rock: THREE.Color;
  fog: THREE.Color;
  haze?: number;
  /** 0..1 — the map's outland rock density; 0 builds nothing. */
  density: number;
  maxInstances: number;
  /** Faces whose outer edge passes this distance from the map centre (square metric, metres) carry no rocks. */
  maxRadius?: number;
  /** Rim-band rocks closer than this (metres past the playable square) form the shadow-casting near class. */
  nearDepth?: number;
  /** First authored ridge row; rows below it are the terrain-material rim bands. */
  ridgeRow?: number;
  /** Round 72: the range class (rows past the first ridge) stays inside this radius and under this share of the ring's
   * peak height (0 = no range boulders): past that the aerial pass washes a boosted face toward the sky while a dark
   * boulder keeps its tone, so the boulders read as specks in the sky (Frosthollow's ranges). Default 900 / 1. */
  rangeRadius?: number;
  rangeHeightShare?: number;
  maxHeight?: number;
  /** The ring's detail noise (0..1) — patches the field so no sector is a uniform gravel carpet. */
  detailNoise?: (u: number, v: number) => number;
  retainedGeometries?: THREE.BufferGeometry[];
}

interface RockPlacement {
  x: number; y: number; z: number;
  scale: number; squash: number; yaw: number; tilt: number; roll: number;
  variant: number; tone: number; band: boolean; beyond: number; key: number; detail: number;
}

export const HORIZON_ROCK_VARIANTS = 3;
export const HORIZON_ROCK_MAX_SLOPE = 0.95; // rise/run — boulders rest below ~43°, the walls above keep their strata
const HORIZON_ROCK_NEAR_DEPTH_M = 300;

function tileRng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Deterministic 0..1 hash of a quantised position — duplicated polyhedron corners displace identically. */
function hash3(x: number, y: number, z: number, seed: number): number {
  let h = (Math.imul(Math.round(x * 1000) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(y * 1000) | 0, 0x165667b1)
    ^ Math.imul(Math.round(z * 1000) | 0, 0x9e3779b1) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A faceted boulder: a displaced icosahedron with a flattened seat, vertex-coloured from the map's rock tint. */
export function buildHorizonBoulder(variant: number, seed: number, rock: THREE.Color): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, variant === 2 ? 2 : 1);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const stretch = variant === 0 ? [1.35, 0.74, 1.0] : variant === 1 ? [1.0, 0.92, 1.28] : [1.62, 0.62, 1.12];
  const colours = new Float32Array(position.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const k = hash3(v.x, v.y, v.z, seed);
    const k2 = hash3(v.z, v.x, v.y, (seed ^ 0x5bd1e995) >>> 0);
    v.multiplyScalar(0.78 + k * 0.42 + (k2 - 0.5) * 0.16);
    v.x *= stretch[0]; v.y *= stretch[1]; v.z *= stretch[2];
    // seat: a flattened underside so the boulder rests on the ground rather than balancing on a point
    if (v.y < -0.35) v.y = -0.35 - (v.y + 0.35) * 0.35;
    position.setXYZ(i, v.x, v.y, v.z);
    const lift = 0.80 + 0.32 * THREE.MathUtils.clamp((v.y + 0.4) / 1.2, 0, 1) + (k2 - 0.5) * 0.10;
    colours[i * 3] = rock.r * lift; colours[i * 3 + 1] = rock.g * lift; colours[i * 3 + 2] = rock.b * lift;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function buildHorizonRockfield(options: HorizonRockfieldOptions): THREE.Group | null {
  const { columns: n, rows, positions, heights, seed } = options;
  const density = Math.min(1, Math.max(0, options.density));
  if (density <= 0 || options.maxInstances <= 0) return null;
  const rng = tileRng((seed ^ 0x2C0C) >>> 0);
  const maxRadius = options.maxRadius ?? 900;
  const nearDepth = options.nearDepth ?? HORIZON_ROCK_NEAR_DEPTH_M;
  const ridgeRow = options.ridgeRow ?? Math.max(1, rows.findIndex((row) => !row.skirt && !row.interpolated));
  const rangeRadius = options.rangeRadius ?? 900;
  const rangeHeightCap = (options.maxHeight ?? Infinity) * (options.rangeHeightShare ?? 1);
  const noise = options.detailNoise;
  const beyondRim = (x: number, z: number): number => {
    const square = Math.max(Math.abs(x), Math.abs(z));
    return (square - 511.5) * (Math.hypot(x, z) / Math.max(1, square));
  };
  const candidates: RockPlacement[] = [];
  const push = (x: number, y: number, z: number, scale: number, band: boolean): void => {
    // the seam row follows the playable square, but a face chord cuts inside it near the corners: nothing sits
    // within 3 m of the edge, where it would straddle the terrain chunks
    const beyond = beyondRim(x, z);
    if (beyond < 3) return;
    const squash = 0.72 + rng() * 0.5;
    candidates.push({
      x, y: y - 0.22 * scale * squash, z, scale, squash, yaw: rng() * Math.PI * 2,
      tilt: (rng() - 0.5) * 0.24, roll: (rng() - 0.5) * 0.24,
      variant: Math.floor(rng() * HORIZON_ROCK_VARIANTS), tone: 0.82 + rng() * 0.30, band, beyond, key: rng(), detail: 1,
    });
  };
  const surface = { x: 0, y: 0, z: 0, slope: 0 };
  for (let row = 1; row < rows.length - 1; row++) {
    if (rows[row].skirt && rows[row + 1].skirt) continue;
    const band = row < ridgeRow;
    for (let column = 0; column < n; column++) {
      const k1 = (column + 1) % n;
      const i00 = row * n + column, i01 = row * n + k1, i10 = (row + 1) * n + column, i11 = (row + 1) * n + k1;
      // the near rows follow the playable square (a corner column stands √2 farther out than a side column), so the
      // reach is measured per face in the square metric: a face whose outer edge passes the rock radius stays bare
      // and the far ranges keep their baked flatness
      if (Math.max(Math.abs(positions[i10 * 3]), Math.abs(positions[i10 * 3 + 2]), Math.abs(positions[i11 * 3]), Math.abs(positions[i11 * 3 + 2])) > maxRadius) continue;
      const rise = (heights[i10] + heights[i11]) * 0.5 - (heights[i00] + heights[i01]) * 0.5;
      const dx = positions[i10 * 3] - positions[i00 * 3], dz = positions[i10 * 3 + 2] - positions[i00 * 3 + 2];
      const radialSpan = Math.hypot(dx, dz);
      const arc = Math.hypot(positions[i01 * 3] - positions[i00 * 3], positions[i01 * 3 + 2] - positions[i00 * 3 + 2]);
      const slope = Math.abs(rise) / Math.max(1, radialSpan);
      // back slopes hide behind their crest; the walls keep their strata
      if (rise < -0.5 || slope > HORIZON_ROCK_MAX_SLOPE) continue;
      const faceBeyond = beyondRim(positions[i00 * 3], positions[i00 * 3 + 2]);
      // one candidate per ~150 m² of rim band and ~520 m² of range face, thinning with depth past the edge
      const falloff = 1 - 0.6 * smoothstep(60, 420, faceBeyond);
      let count = (radialSpan * arc) / (band ? 150 : 520) * density * falloff;
      count = Math.floor(count) + (rng() < count - Math.floor(count) ? 1 : 0);
      for (let t = 0; t < count; t++) {
        const u = rng(), w = rng();
        sampleHorizonFace(positions, heights, i00, i01, i10, i11, u, w, surface);
        const { x, y, z } = surface;
        if (surface.slope > HORIZON_ROCK_MAX_SLOPE) continue;
        if (y < 1.0) continue; // the sea aperture
        if (!band && (Math.hypot(x, z) > rangeRadius || y > rangeHeightCap)) continue; // round 72: no specks in the sky
        // patchy field: gravel fans and bare pans instead of one even carpet
        const field = noise ? noise(x * 0.0035 + 0.17, z * 0.0035 + 0.61) : 0.6;
        if (rng() > smoothstep(0.28, 0.72, field) * 1.4) continue;
        const r = rng();
        const scale = r < 0.02 ? 3.2 + rng() * 2.4 : r < 0.24 ? 1.3 + rng() * 1.4 : 0.45 + rng() * 0.9;
        push(x, y, z, scale, band);
        // outcrops: a parent boulder with a few satellites at its feet
        if (scale > 1.2 && rng() < 0.45) {
          const satellites = 2 + Math.floor(rng() * 3);
          for (let s = 0; s < satellites; s++) {
            const a = rng() * Math.PI * 2, d = scale * (0.9 + rng() * 1.6);
            // Keep the cluster on this quad and sample each satellite's own
            // triangle. Reusing the parent's height floats downhill stones.
            const su = Math.max(.01, Math.min(.99, u + Math.cos(a) * d / Math.max(1, arc)));
            const sw = Math.max(.01, Math.min(.99, w + Math.sin(a) * d / Math.max(1, radialSpan)));
            sampleHorizonFace(positions, heights, i00, i01, i10, i11, su, sw, surface);
            const smallScale = scale * (0.3 + rng() * 0.45);
            if (surface.y >= 1 && surface.slope <= HORIZON_ROCK_MAX_SLOPE)
              push(surface.x, surface.y, surface.z, smallScale, band);
          }
        }
      }
    }
  }
  if (candidates.length === 0) return null;
  // budget: the rim band keeps up to three quarters, thinned uniformly by key so the whole perimeter stays covered
  const thin = (list: RockPlacement[], budget: number): RockPlacement[] =>
    (list.length <= budget ? list : list.slice().sort((a, b) => a.key - b.key).slice(0, budget));
  const bandKept = thin(candidates.filter((c) => c.band), Math.floor(options.maxInstances * 0.75));
  const rangeKept = thin(candidates.filter((c) => !c.band), Math.max(0, options.maxInstances - bandKept.length));
  const maxNear = Math.min(1200, Math.floor(options.maxInstances * 0.4));
  const byDepth = bandKept.slice().sort((a, b) => a.beyond - b.beyond);
  for (let i = 0; i < byDepth.length; i++) byDepth[i].detail = i < maxNear && byDepth[i].beyond < nearDepth ? 2 : 1;
  for (const placement of rangeKept) placement.detail = 0;
  const placements = bandKept.concat(rangeKept);

  const group = new THREE.Group();
  group.name = 'horizon-rocks';
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  // (2026-10-08: the full sky, as the battlefield's rocks take it; the 0.9 it authored never applied, materialEnvIntensity.ts)
  // Standard scene fog measures distance from the camera. Additional haze
  // by map radius made nearby outland rocks abruptly pale at the boundary.
  material.customProgramCacheKey = () => 'horizon-rockfield-v2';

  const geometries: THREE.BufferGeometry[] = [];
  for (let variant = 0; variant < HORIZON_ROCK_VARIANTS; variant++) {
    const geometry = buildHorizonBoulder(variant, (seed ^ (0x51ab + variant * 977)) >>> 0, options.rock);
    geometries.push(geometry);
    options.retainedGeometries?.push(geometry);
  }
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scaleV = new THREE.Vector3(), positionV = new THREE.Vector3();
  const euler = new THREE.Euler();
  const color = new THREE.Color();
  let nearCount = 0;
  for (const [detail, className] of [[2, 'near'], [1, 'band'], [0, 'range']] as const) {
    for (let variant = 0; variant < HORIZON_ROCK_VARIANTS; variant++) {
      const own = placements.filter((p) => p.detail === detail && p.variant === variant);
      if (own.length === 0) continue;
      const mesh = new THREE.InstancedMesh(geometries[variant], material, own.length);
      mesh.name = `horizon-rocks-${className}-${variant}`;
      // the near class casts real shadows onto the rim like the battlefield's boulders and takes them too
      mesh.castShadow = detail === 2;
      mesh.receiveShadow = detail === 2;
      mesh.matrixAutoUpdate = false;
      mesh.frustumCulled = false;
      mesh.userData.aoExclude = true;
      for (let i = 0; i < own.length; i++) {
        const placement = own[i];
        euler.set(placement.tilt, placement.yaw, placement.roll, 'YXZ');
        quaternion.setFromEuler(euler);
        scaleV.set(placement.scale, placement.scale * placement.squash, placement.scale);
        positionV.set(placement.x, placement.y, placement.z);
        matrix.compose(positionV, quaternion, scaleV);
        mesh.setMatrixAt(i, matrix);
        color.setScalar(placement.tone);
        mesh.setColorAt(i, color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      if (detail === 2) nearCount += own.length;
      group.add(mesh);
    }
  }
  group.userData.horizonRockfield = {
    instances: placements.length, near: nearCount, band: bandKept.length, range: rangeKept.length, candidates: candidates.length,
  };
  return group;
}
