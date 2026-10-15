// The graded hardstand's shader program (2026-10-11, wave 408), apart from garageYardWear.ts so the Garage stage can
// compile it with its outdoor seeds without loading the hardstand painters.
import * as THREE from 'three';

/** The graded hardstand's shader program (one in every outdoor pack; garageStage.ts compiles it with the seeds). */
export const GARAGE_HARDSTAND_PROGRAM_KEY = 'garage-hardstand-graded-v2';

/** Metres per repeat of the hardstand's grain. */
export const GARAGE_HARDSTAND_GRAIN_TILE_M = 2;

let sharedGrain: THREE.DataTexture | null = null;

/**
 * The hardstand's grain (round 5d-2; waves 408 and 419: "a blurry, smeared texture", "stretched low-resolution
 * image"): the yard's own canvas holds its layout at 35 px/m, which blurs at a bay camera's distance, so the floor
 * multiplies in a shared tileable grain at 256 px/m: fine grit, sand and small stones turned every way, neutral grey on
 * average so its mips fade to nothing with distance. Shared by every pack and never disposed by one.
 *
 * Built straight into a typed array (garage round 7, 2026-10-14): the 2,600 canvas ellipses it drew, each up to nine
 * times across the tile's edges, were the first outdoor visit's largest new cost (the switch ABBA: Sirocco's first
 * cold visit presented 0.5 s later). The stones are stamped as antialiased ellipses with wrap-around addressing.
 */
export function garageHardstandGrainTexture(anisotropy = 4): THREE.DataTexture | null {
  if (sharedGrain) return sharedGrain;
  if (typeof document === 'undefined') return null;
  const S = 512;
  let seed = 0x6a7e;
  const rng = (): number => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const grey = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) grey[i] = 128 + (rng() - 0.5) * 22;
  // stones from grit to pebbles, far more small than large, wrapping across the tile's edges so it repeats seamlessly
  for (let i = 0; i < 2600; i++) {
    const x = rng() * S, y = rng() * S, t = rng();
    const r = 0.8 + t * t * t * 7;
    const dark = rng() < 0.55;
    const shade = dark ? 128 - 16 - rng() * 30 : 128 + 10 + rng() * 26;
    const alpha = 0.5 + rng() * 0.45;
    const squash = 0.5 + rng() * 0.45, angle = rng() * Math.PI;
    const c = Math.cos(angle), sn = Math.sin(angle);
    const reach = Math.ceil(r + 1);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const px = Math.floor(x) + dx, py = Math.floor(y) + dy;
        const ox = px + 0.5 - x, oy = py + 0.5 - y;
        const u = (ox * c + oy * sn) / r, v = (-ox * sn + oy * c) / (r * squash);
        const d = Math.sqrt(u * u + v * v);
        // a one-pixel antialiased rim, as the canvas fill had
        const cover = Math.min(1, Math.max(0, (1 - d) * r * squash + 0.5));
        if (cover <= 0) continue;
        const index = (((py % S) + S) % S) * S + (((px % S) + S) % S);
        const a = alpha * cover;
        grey[index] = grey[index] * (1 - a) + shade * a;
      }
    }
  }
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const v = Math.max(0, Math.min(255, Math.round(grey[i])));
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  sharedGrain = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  sharedGrain.wrapS = THREE.RepeatWrapping;
  sharedGrain.wrapT = THREE.RepeatWrapping;
  sharedGrain.magFilter = THREE.LinearFilter;
  sharedGrain.minFilter = THREE.LinearMipmapLinearFilter;
  sharedGrain.generateMipmaps = true;
  sharedGrain.needsUpdate = true;
  sharedGrain.anisotropy = anisotropy;
  sharedGrain.userData.sharedGarageHardstandGrain = true;
  return sharedGrain;
}

/**
 * The floor's detail layer (GA.03, 2026-10-14; the garage critic panel: "the foreground floor (~40% of every frame) is
 * low-frequency blotch ... a detail layer per ground type ... a detail normal map and 16x anisotropic filtering"): one
 * tileable relief per kind of ground, sampled in the ground plane at a real scale and folded into both the albedo and the
 * normal, so the floor holds its surface at the camera's grazing angle:
 *   - concrete: a broomed finish (fine streaks one way), exposed aggregate and pits, a crazing network of hairlines;
 *   - earth: compacted fines with embedded pebbles and grit, small desiccation cracks;
 *   - sand: wind ripples with sharp lee crests over loose grains;
 *   - snow: wind-cut sastrugi ridges and hollows, a fine glitter of crystals;
 *   - gravel: packed angular stones with dark voids between them (slag yards, the pass's gravel).
 * Encoded RGBA: R/G the relief's downhill slope along ground +x/+z (128 = level), B the albedo factor (128 = x1), A 255.
 * Its mips average to level and x1, so it fades out with distance instead of shimmering.
 */
export type GarageHardstandDetailKind = 'concrete' | 'earth' | 'sand' | 'snow' | 'gravel';

/** Metres per repeat, normal strength and albedo strength of each detail kind. */
export const GARAGE_HARDSTAND_DETAIL: Readonly<Record<GarageHardstandDetailKind,
  { readonly tileM: number; readonly normal: number; readonly albedo: number }>> = Object.freeze({
  concrete: Object.freeze({ tileM: 2.5, normal: 0.85, albedo: 0.9 }),
  earth: Object.freeze({ tileM: 3, normal: 0.7, albedo: 0.8 }),
  sand: Object.freeze({ tileM: 4, normal: 0.85, albedo: 0.55 }),
  snow: Object.freeze({ tileM: 5, normal: 0.6, albedo: 0.5 }),
  gravel: Object.freeze({ tileM: 2, normal: 0.9, albedo: 0.9 }),
});

const DETAIL_SIZE = 512;
const detailTextures = new Map<GarageHardstandDetailKind, THREE.DataTexture>();
const detailUniforms = new Map<GarageHardstandDetailKind, { value: THREE.Texture | null }>();
let neutralDetail: THREE.DataTexture | null = null;

/** A level, x1 detail texel: the stand-in until a kind's relief is generated (no new program, no pop of darkness). */
function garageHardstandNeutralDetail(): THREE.DataTexture {
  if (neutralDetail) return neutralDetail;
  neutralDetail = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat);
  neutralDetail.needsUpdate = true;
  neutralDetail.userData.sharedGarageHardstandDetail = 'neutral';
  return neutralDetail;
}

/** Periodic tools on an S x S tile: value-noise octaves (cells divide the tile), wrapped stamps, a periodic Voronoi. */
function detailTools(seed: number) {
  const S = DETAIL_SIZE;
  let state = seed >>> 0;
  const rng = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  /** Adds amplitude x value noise with gx x gy cells (each dividing S) to `field`; `warp` shifts sample rows. */
  const octave = (field: Float32Array, gx: number, gy: number, amplitude: number): void => {
    const grid = new Float32Array(gx * gy);
    for (let i = 0; i < grid.length; i++) grid[i] = rng() * 2 - 1;
    for (let y = 0; y < S; y++) {
      const fy = (y / S) * gy, iy = Math.floor(fy), ty0 = fy - iy, ty = ty0 * ty0 * (3 - 2 * ty0);
      const r0 = (iy % gy) * gx, r1 = ((iy + 1) % gy) * gx;
      for (let x = 0; x < S; x++) {
        const fx = (x / S) * gx, ix = Math.floor(fx), tx0 = fx - ix, tx = tx0 * tx0 * (3 - 2 * tx0);
        const c0 = ix % gx, c1 = (ix + 1) % gx;
        field[y * S + x] += amplitude * ((grid[r0 + c0] * (1 - tx) + grid[r0 + c1] * tx) * (1 - ty)
          + (grid[r1 + c0] * (1 - tx) + grid[r1 + c1] * tx) * ty);
      }
    }
  };
  /** Stamps an antialiased ellipse (radius r px, squash, angle) into `field` toward `value` (or adds `value` when additive). */
  const stamp = (field: Float32Array, cx: number, cy: number, r: number, squash: number, angle: number,
    value: number, alpha: number, additive = false, dome = false): void => {
    const c = Math.cos(angle), sn = Math.sin(angle);
    const reach = Math.ceil(r + 1);
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const px = Math.floor(cx) + dx, py = Math.floor(cy) + dy;
        const ox = px + 0.5 - cx, oy = py + 0.5 - cy;
        const u = (ox * c + oy * sn) / r, v = (-ox * sn + oy * c) / (r * squash);
        const d = Math.sqrt(u * u + v * v);
        const cover = Math.min(1, Math.max(0, (1 - d) * r * squash + 0.5));
        if (cover <= 0) continue;
        const index = (((py % S) + S) % S) * S + (((px % S) + S) % S);
        const shape = dome ? Math.sqrt(Math.max(0, 1 - Math.min(1, d) * Math.min(1, d))) : 1;
        const a = alpha * cover * shape;
        if (additive) field[index] += value * a;
        else field[index] = field[index] * (1 - a) + value * a;
      }
    }
  };
  /**
   * A periodic Voronoi edge field (0 on a cell border, rising inward): one jittered feature point per cell of a
   * `grid` x `grid` lattice (each dividing the tile), so each texel searches only its 3 x 3 neighbouring cells.
   */
  const crazing = (grid: number): Float32Array => {
    const cell = S / grid;
    const fx = new Float32Array(grid * grid), fy = new Float32Array(grid * grid);
    for (let j = 0; j < grid; j++) {
      for (let i = 0; i < grid; i++) {
        fx[j * grid + i] = (i + 0.12 + rng() * 0.76) * cell;
        fy[j * grid + i] = (j + 0.12 + rng() * 0.76) * cell;
      }
    }
    const edge = new Float32Array(S * S);
    for (let y = 0; y < S; y++) {
      const cy = Math.floor(y / cell);
      for (let x = 0; x < S; x++) {
        const cx = Math.floor(x / cell);
        let d1 = Infinity, d2 = Infinity;
        for (let oj = -1; oj <= 1; oj++) {
          const j = cy + oj, jj = (j + grid) % grid, shiftY = j < 0 ? -S : j >= grid ? S : 0;
          for (let oi = -1; oi <= 1; oi++) {
            const i = cx + oi, ii = (i + grid) % grid, shiftX = i < 0 ? -S : i >= grid ? S : 0;
            const k = jj * grid + ii;
            const ddx = x + 0.5 - (fx[k] + shiftX), ddy = y + 0.5 - (fy[k] + shiftY);
            const d = ddx * ddx + ddy * ddy;
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
        }
        edge[y * S + x] = Math.sqrt(d2) - Math.sqrt(d1);
      }
    }
    return edge;
  };
  return { S, rng, octave, stamp, crazing };
}

/** Builds one kind's relief and albedo factor (see GARAGE_HARDSTAND_DETAIL); about 20-60 ms in a browser. */
export function garageHardstandDetailData(kind: GarageHardstandDetailKind): Uint8Array {
  const seeds: Record<GarageHardstandDetailKind, number> = { concrete: 0x51ab, earth: 0x2e47, sand: 0x5a4d, snow: 0x5e0f, gravel: 0x67a1 };
  const { S, rng, octave, stamp, crazing } = detailTools(seeds[kind]);
  const height = new Float32Array(S * S);
  const albedo = new Float32Array(S * S); // 0 = x1, +/- = lighter/darker
  const pxPerM = S / GARAGE_HARDSTAND_DETAIL[kind].tileM;
  if (kind === 'concrete') {
    // the broomed finish: streaks along x (long, thin cells), then a faint trowel undulation
    // (only fine scales: the yard's own canvas carries the broad tone; a coarse octave here read as soft blotches)
    octave(height, 8, 128, 0.22);
    octave(height, 16, 256, 0.12);
    octave(height, 32, 32, 0.1);
    octave(albedo, 32, 32, 0.035);
    // exposed aggregate and pits: many small, few larger, light and dark stones flush with the surface
    for (let i = 0; i < 9000; i++) {
      const t = rng();
      const r = (0.002 + t * t * t * 0.007) * pxPerM;
      const light = rng() < 0.5;
      stamp(albedo, rng() * S, rng() * S, r, 0.55 + rng() * 0.4, rng() * Math.PI, light ? 0.16 : -0.18, 0.55 + rng() * 0.4);
      if (rng() < 0.18) stamp(height, rng() * S, rng() * S, r * 0.8, 0.8, 0, -0.9, 0.9, true, true); // a blowhole
    }
    // crazing: a network of hairlines about 0.3 m across, faintly darker and very slightly sunk
    const edge = crazing(8);
    for (let i = 0; i < S * S; i++) {
      const line = Math.max(0, 1 - edge[i] / 1.4);
      albedo[i] -= line * 0.12;
      height[i] -= line * 0.35;
    }
  } else if (kind === 'earth') {
    octave(height, 16, 16, 0.3);
    octave(height, 64, 64, 0.16);
    octave(albedo, 32, 32, 0.05);
    // embedded pebbles (domed, mostly small) and grit
    for (let i = 0; i < 2600; i++) {
      const t = rng();
      const r = (0.004 + t * t * t * 0.022) * pxPerM;
      const x = rng() * S, y = rng() * S, squash = 0.55 + rng() * 0.4, angle = rng() * Math.PI;
      stamp(height, x, y, r, squash, angle, 1.6, 1, true, true);
      stamp(albedo, x, y, r, squash, angle, (rng() - 0.45) * 0.4, 0.8);
    }
    for (let i = 0; i < 12000; i++) {
      stamp(albedo, rng() * S, rng() * S, (0.0015 + rng() * 0.002) * pxPerM, 0.7, rng() * Math.PI, (rng() - 0.5) * 0.3, 0.7);
    }
    // small desiccation cracks in patches of dried crust (a mask), not a net over the whole yard
    const edge = crazing(7);
    const crust = new Float32Array(S * S);
    octave(crust, 8, 8, 1);
    for (let i = 0; i < S * S; i++) {
      const patch = Math.min(1, Math.max(0, (crust[i] - 0.15) * 2.5));
      const line = Math.max(0, 1 - edge[i] / 1.3) * patch;
      albedo[i] -= line * 0.12;
      height[i] -= line * 0.45;
    }
  } else if (kind === 'sand') {
    // wind ripples (~11 cm) with a gentle stoss and a sharp lee crest, their lines wandering
    const warp = new Float32Array(S * S);
    octave(warp, 4, 4, 1);
    octave(warp, 16, 16, 0.25);
    const wavelength = 0.11 * pxPerM;
    const periods = Math.round(S / wavelength);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const phase = ((x / S) * periods + warp[y * S + x] * 2.2) % 1;
        const p = phase < 0 ? phase + 1 : phase;
        const profile = p < 0.78 ? p / 0.78 : (1 - p) / 0.22; // long windward rise, short lee fall
        height[y * S + x] += profile * 0.9;
        albedo[y * S + x] += (p > 0.78 ? -0.06 : 0.02 * profile);
      }
    }
    octave(height, 64, 64, 0.08);
    for (let i = 0; i < 16000; i++) {
      stamp(albedo, rng() * S, rng() * S, (0.001 + rng() * 0.0015) * pxPerM, 0.8, 0, (rng() - 0.5) * 0.35, 0.8);
    }
  } else if (kind === 'snow') {
    // sastrugi: wind-cut ridges stretched along x, sharpened, over soft swells; crystals glitter in the albedo
    const ridges = new Float32Array(S * S);
    octave(ridges, 4, 16, 1);
    octave(ridges, 8, 32, 0.5);
    for (let i = 0; i < S * S; i++) height[i] += 0.7 * (1 - Math.abs(ridges[i])) ** 3;
    octave(height, 4, 4, 0.4);
    octave(height, 32, 32, 0.06);
    for (let i = 0; i < 5000; i++) {
      stamp(albedo, rng() * S, rng() * S, 0.6 + rng() * 0.6, 1, 0, 0.35, 0.9);
    }
    octave(albedo, 8, 8, 0.04);
  } else {
    // gravel and slag: packed angular stones (squashed, turned) touching, the voids between them dark
    for (let i = 0; i < S * S; i++) { height[i] = -0.6; albedo[i] = -0.22; }
    for (let i = 0; i < 4200; i++) {
      const t = rng();
      const r = (0.006 + t * t * 0.016) * pxPerM;
      const x = rng() * S, y = rng() * S, squash = 0.5 + rng() * 0.45, angle = rng() * Math.PI;
      stamp(height, x, y, r, squash, angle, 0.2 + rng() * 0.8, 1, false, false);
      stamp(height, x, y, r * 0.8, squash, angle, 0.5, 1, true, true);
      stamp(albedo, x, y, r, squash, angle, (rng() - 0.5) * 0.3, 1);
    }
  }
  // slopes by central differences (wrapping), scaled to a normal tilt of about 0.5 at full strength
  const data = new Uint8Array(S * S * 4);
  let meanAlbedo = 0;
  for (let i = 0; i < S * S; i++) meanAlbedo += albedo[i];
  meanAlbedo /= S * S;
  const slopeScale = 0.9;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const h = (xx: number, yy: number): number => height[((yy + S) % S) * S + ((xx + S) % S)];
      const dx = (h(x + 1, y) - h(x - 1, y)) * slopeScale;
      const dz = (h(x, y + 1) - h(x, y - 1)) * slopeScale;
      const at = (y * S + x) * 4;
      // the downhill direction: a surface rising along +x tilts its normal toward -x
      data[at] = Math.max(0, Math.min(255, Math.round(128 - dx * 127)));
      data[at + 1] = Math.max(0, Math.min(255, Math.round(128 - dz * 127)));
      data[at + 2] = Math.max(0, Math.min(255, Math.round(128 + (albedo[y * S + x] - meanAlbedo) * 255)));
      data[at + 3] = 255;
    }
  }
  return data;
}

/**
 * The shared detail uniform for a kind: every pack's floor of that kind reads it, so it starts level (the neutral texel)
 * and every floor sharpens together when the relief is generated (at Garage idle, garageStage.ts; or on the first visit,
 * after its first frame). Never disposed by a pack.
 */
export function garageHardstandDetailUniform(kind: GarageHardstandDetailKind): { value: THREE.Texture | null } {
  let uniform = detailUniforms.get(kind);
  if (!uniform) {
    uniform = { value: detailTextures.get(kind) ?? (typeof document === 'undefined' ? null : garageHardstandNeutralDetail()) };
    detailUniforms.set(kind, uniform);
  }
  return uniform;
}

/** Generates (once) a kind's detail texture and points its shared uniform at it; null in plain Node. */
export function garageHardstandDetailTexture(kind: GarageHardstandDetailKind, anisotropy = 16): THREE.DataTexture | null {
  const cached = detailTextures.get(kind);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const texture = new THREE.DataTexture(garageHardstandDetailData(kind), DETAIL_SIZE, DETAIL_SIZE, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  texture.userData.sharedGarageHardstandDetail = kind;
  detailTextures.set(kind, texture);
  garageHardstandDetailUniform(kind).value = texture;
  return texture;
}

/** Metres over which the worked yard thins out into the terrain at the apron's edges. */
export const GARAGE_HARDSTAND_FEATHER_M = 2.4;

/**
 * The hardstand's graded edge (2026-10-11, wave 408: "a ruler-straight seam runs the full width of the frame where the
 * textured foreground snow meets a flat, pale, untextured snow plane", "cookie-cut pads", "no hard slab edge"): the
 * worked ground thins out into the terrain instead of stopping at a cut. Each vertex carries its share of worked ground
 * (the `hardstandBlend` attribute: 1 over the yard and the pads' cores, 0 at their rims and where the ground rises out of
 * the yard); the fragment breaks that ramp with three octaves of value noise in the pack's ground plane into an
 * irregular, grainy margin through which the terrain shows. Chained after the cascade hook (setupShadowMaterial's extra
 * hook) on a transparent material that writes no depth, drawn before the floor decals.
 */
export function garageHardstandGradedHook(
  grain: THREE.Texture | null,
  grainStrength: number,
  detail?: { readonly uniform: { value: THREE.Texture | null }; readonly kind: GarageHardstandDetailKind } | null,
  wet?: { readonly mask: THREE.Texture | null; readonly amount: number } | null,
): (shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> }) => void {
  return (shader) => {
  if (!shader.vertexShader.includes('#include <begin_vertex>') || !shader.fragmentShader.includes('#include <alphamap_fragment>')
    || !shader.fragmentShader.includes('#include <normal_fragment_maps>')) return;
  shader.uniforms.hardstandGrain = { value: grain };
  shader.uniforms.hardstandGrainStrength = { value: grain ? grainStrength : 0 };
  // the detail layer: the same code in every pack and the seed (one program); a seed or a plain material reads a level
  // x1 texel at zero strength
  const params = detail ? GARAGE_HARDSTAND_DETAIL[detail.kind] : null;
  shader.uniforms.hardstandDetail = detail?.uniform ?? { value: grain };
  shader.uniforms.hardstandDetailParams = {
    value: params ? new THREE.Vector3(1 / params.tileM, params.normal, params.albedo) : new THREE.Vector3(1, 0, 0),
  };
  // standing water (Monsoon's puddles, garage round 7): the yard's wet mask on the floor's own UVs polishes the puddles
  // flat and glossy, and the amount dampens the whole yard; every other floor reads it at zero (the same program)
  shader.uniforms.hardstandWetMask = { value: wet?.mask ?? grain };
  shader.uniforms.hardstandWet = { value: wet?.mask ? wet.amount : 0 };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
attribute float hardstandBlend;
varying float vHardstandBlend;
varying vec2 vHardstandGround;
varying vec3 vHardstandAxisX;
varying vec3 vHardstandAxisZ;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
vHardstandBlend = hardstandBlend;
vHardstandGround = position.xz;
vHardstandAxisX = normalize((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
vHardstandAxisZ = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
varying float vHardstandBlend;
varying vec2 vHardstandGround;
varying vec3 vHardstandAxisX;
varying vec3 vHardstandAxisZ;
uniform sampler2D hardstandGrain;
uniform float hardstandGrainStrength;
uniform sampler2D hardstandDetail;
uniform vec3 hardstandDetailParams;
uniform sampler2D hardstandWetMask;
uniform float hardstandWet;
float hardstandHash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float hardstandNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hardstandHash(i), hardstandHash(i + vec2(1.0, 0.0)), u.x),
    mix(hardstandHash(i + vec2(0.0, 1.0)), hardstandHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`)
    .replace('#include <map_fragment>', `#include <map_fragment>
diffuseColor.rgb *= mix(vec3(1.0), texture2D(hardstandGrain, vHardstandGround * ${(1 / GARAGE_HARDSTAND_GRAIN_TILE_M).toFixed(4)}).rgb * 2.0,
  hardstandGrainStrength);
vec4 hardstandDetailTexel = texture2D(hardstandDetail, vHardstandGround * hardstandDetailParams.x);
diffuseColor.rgb *= mix(1.0, hardstandDetailTexel.b * 2.0, hardstandDetailParams.z);
#ifdef USE_MAP
float hardstandWater = hardstandWet * texture2D(hardstandWetMask, vMapUv).r;
#else
float hardstandWater = 0.0;
#endif
diffuseColor.rgb *= 1.0 - 0.2 * hardstandWater;`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor * (1.0 - 0.28 * hardstandWet), 0.06, hardstandWater);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec2 hardstandSlope = (hardstandDetailTexel.rg * 2.0 - 1.0) * hardstandDetailParams.y;
  normal = normalize(normal + vHardstandAxisX * hardstandSlope.x + vHardstandAxisZ * hardstandSlope.y);
  normal = normalize(mix(normal, nonPerturbedNormal, hardstandWater * 0.92)); // standing water lies flat
}`)
    .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
{
  float hardstandBreak = hardstandNoise(vHardstandGround * 0.42) * 0.62 + hardstandNoise(vHardstandGround * 1.9 + 17.0) * 0.28
    + hardstandNoise(vHardstandGround * 7.3 + 41.0) * 0.1;
  diffuseColor.a *= smoothstep(0.36, 0.64, vHardstandBlend + (hardstandBreak - 0.5) * 0.72);
}`);
  };
}
