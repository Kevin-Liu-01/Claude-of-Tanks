// The far horizon panorama (the mountains lane, 2026-10-03; the owner: "i literally just see a treeline and then nothing
// transitioning and going into mountains or stuff beyond border. and the shapes need to be so much better, and
// textures"). The far ranges' (1.9-3.3 km) live mesh carried six rows and 431 columns — a column spans 15 screen
// pixels at 2.5 km, so no shading law could give it the ridgelines, cols, valleys, strata, scree and snowfields a range
// shows from the ground. The far country is BAKED instead, the way commercial tank games paint their backdrops:
//
//  1. a polar height grid over the annulus 1.5-9 km (log-spaced rows, so the grid's rows stand about as far apart on
//     screen as its columns): the character's far field — a warped ridged multifractal (the crest lines, the spurs off
//     them, the cols where they meet), Quilez's eroded octaves (smooth valleys, sharp spurs) and Clay John's gullies
//     across the local slope (the couloirs that stripe a face), under a distance envelope (foothills by the ring, the
//     ranges from about 3 km), valleys between the ranges, a slow envelope round the horizon, the tablelands' caprock
//     and beds, the sea sectors open; its first kilometre eases out of the ring's own outer heights;
//  2. the grid's light: the map's sun with its cast shadows (a soft march over the grid) and the sky's occlusion;
//  3. the strip: per texel of a cylindrical atlas (azimuth x elevation from the bake eye), the first grid row whose
//     elevation angle reaches the texel's, its surface law (rock strata on the faces, scree on the moderate slopes below
//     them, snow on the slopes that hold it above the snowline, stands and clearings of the map's forest on the lower
//     flanks, a slow colour variation) lit by the sun and the sky, graded toward the fog colour for the air past the
//     shell, transparent above the cloud deck, the sky and the open sea.
//
// The strip is drawn by ONE mesh: an apron from the ring's outer edge out to the shell (2.6 km) and the shell's wall,
// sampling the atlas by direction from the bake eye — 3.4k triangles (fewer than the round-72 far range's 4.3k it stands
// in for), no per-frame CPU, one atlas fetch per fragment.
// The bake runs where a renderer exists (the world's impostor warm-up under the loading cover; the first update
// otherwise), re-bakes after a GPU suspension disposes the atlas, and until it has baked the round-72 far range stays
// on (the receipts, a renderer without float targets). Desktop tier only: the mobile tier has no far range.
import * as THREE from 'three';
import type { SeaOpening } from './edgeWater.ts';
import type { HorizonReliefCharacter } from './horizonRelief.ts';

const DEG = Math.PI / 180;

/** The panorama's frame: the annulus it bakes, the shell it is shown on, the eye it is baked from, the strip. */
export const HORIZON_PANORAMA = Object.freeze({
  innerM: 1500, outerM: 9000, shellM: 2600, eyeY: 30,
  elevMin: -3 * DEG, elevMax: 22 * DEG,
  width: 8192, height: 512,
  gridA: 4096, gridR: 256,
  /** the apron's rows between the ring's outer edge and the shell (m out from the centre) and the wall's elevations:
   * its foot and its top only — a column's wall vertices stand on one vertical line and the fragment takes its own
   * direction from the eye, so rows between them drew triangles without changing a pixel */
  apronM: [1900, 2300] as readonly number[],
  wallElevDeg: [-4, 22] as readonly number[],
});

/** The far country's vocabulary per relief character (amplitudes in m; wavelengths in m). */
export interface HorizonPanoramaCharacter {
  ampM: number; foot: number; macroL: number; sharp: number; midL: number; gullyL: number; gullyM: number;
  warpM: number; valley: number; valleyL: number; snowline: number; treeline: number; rockSlope: number;
  bedM: number; strata: number; tables: boolean;
  /** the far ranges' extra rise past 4 km (the hill countries' low mountains behind their hills) */
  farRise: number;
  /** 0..1: how far the ranges past ~3.5 km rise to stand a margin above the ring's own skyline from the battlefield
   * (the layers behind the ring); 0 leaves the far field as it falls */
  layers: number;
  /** true: the layers rise as a broad upland plinth under the far country's own hills (the hill countries: their slopes
   * stay gentle, wooded and farmed); false: the ranges' relief is scaled (the mountain countries: steeper, rockier) */
  plinth: boolean;
  /** the far shore across a sea sector (a channel coast: the mainland or the islands across the water, as seen from the
   * Dalmatian islands): the share of the far country's own height it rises to; 0 keeps the sector open sea to the
   * horizon (the ocean coasts) */
  shore: number;
  /** the channel: the far shore's distance from the battlefield's centre (m; it wanders 1.1 km either way) */
  shoreM: number;
  /** the coastal range behind the far shore (the mainland's front ranges along the coast), as a share of the far
   * country's envelope; 0: the far shore is the far country's own relief only */
  shoreRange: number;
}

export const HORIZON_PANORAMA_CHARACTERS: Readonly<Record<HorizonReliefCharacter, HorizonPanoramaCharacter>> = Object.freeze({
  alpine: { ampM: 1700, foot: 0.16, macroL: 5200, sharp: 1.45, midL: 1500, gullyL: 520, gullyM: 55, warpM: 900, valley: 0.4, valleyL: 7500, snowline: 0.40, treeline: 0.22, rockSlope: 0.30, bedM: 70, strata: 0.10, tables: false, farRise: 0, layers: 1, plinth: false, shore: 0, shoreM: 5600, shoreRange: 0 },
  polar: { ampM: 1300, foot: 0.18, macroL: 5800, sharp: 1.3, midL: 1700, gullyL: 560, gullyM: 45, warpM: 1000, valley: 0.4, valleyL: 8000, snowline: 0.05, treeline: 0.10, rockSlope: 0.34, bedM: 80, strata: 0.08, tables: false, farRise: 0, layers: 1, plinth: false, shore: 0, shoreM: 5600, shoreRange: 0 },
  rolling: { ampM: 620, foot: 0.24, macroL: 5600, sharp: 1.15, midL: 2000, gullyL: 600, gullyM: 22, warpM: 1100, valley: 0.35, valleyL: 8500, snowline: 2, treeline: 0.85, rockSlope: 0.42, bedM: 60, strata: 0.05, tables: false, farRise: 1.1, layers: 1, plinth: true, shore: 0, shoreM: 5600, shoreRange: 0 },
  coastal: { ampM: 520, foot: 0.24, macroL: 5400, sharp: 1.15, midL: 1900, gullyL: 600, gullyM: 20, warpM: 1100, valley: 0.35, valleyL: 8500, snowline: 2, treeline: 0.80, rockSlope: 0.40, bedM: 50, strata: 0.06, tables: false, farRise: 0.9, layers: 1, plinth: true, shore: 0, shoreM: 5600, shoreRange: 0 },
  volcanic: { ampM: 1300, foot: 0.2, macroL: 5000, sharp: 1.3, midL: 1400, gullyL: 420, gullyM: 45, warpM: 800, valley: 0.4, valleyL: 7500, snowline: 2, treeline: 0.35, rockSlope: 0.32, bedM: 40, strata: 0.16, tables: false, farRise: 0, layers: 1, plinth: false, shore: 0, shoreM: 5600, shoreRange: 0 },
  karst: { ampM: 760, foot: 0.26, macroL: 2600, sharp: 2.2, midL: 900, gullyL: 300, gullyM: 30, warpM: 400, valley: 0.5, valleyL: 5500, snowline: 2, treeline: 0.95, rockSlope: 0.36, bedM: 30, strata: 0.12, tables: false, farRise: 0.3, layers: 1, plinth: false, shore: 0, shoreM: 5600, shoreRange: 0 },
  mesa: { ampM: 900, foot: 0.24, macroL: 6000, sharp: 1.0, midL: 2000, gullyL: 500, gullyM: 30, warpM: 900, valley: 0.3, valleyL: 7000, snowline: 2, treeline: 0, rockSlope: 0.30, bedM: 46, strata: 0.32, tables: true, farRise: 0, layers: 1, plinth: false, shore: 0, shoreM: 5600, shoreRange: 0 },
  martian: { ampM: 1300, foot: 0.24, macroL: 7000, sharp: 1.0, midL: 2400, gullyL: 600, gullyM: 35, warpM: 1100, valley: 0.5, valleyL: 8500, snowline: 2, treeline: 0, rockSlope: 0.30, bedM: 60, strata: 0.26, tables: true, farRise: 0, layers: 1, plinth: false, shore: 0, shoreM: 5600, shoreRange: 0 },
});

export interface HorizonPanoramaPalette { base: THREE.Color; rock: THREE.Color; snow: THREE.Color; forest: THREE.Color; fog: THREE.Color }

export interface HorizonPanoramaOptions {
  seed: number;
  character: HorizonReliefCharacter;
  /** per-map overrides of the character's knobs */
  overrides?: Partial<HorizonPanoramaCharacter>;
  palette: HorizonPanoramaPalette;
  /** the map's sun (unit vector), its gains (horizon.ts resolveHorizonLightingGains) */
  sun: readonly [number, number, number];
  gains: { ambient: number; sunGain: number };
  /** the lower of the map's cloud bases (m): the strip is open sky above it */
  deckBaseM: number;
  seaOpenings: readonly SeaOpening[];
  /** the sea weight per azimuth (0..1, the far range's law) and the sea level per azimuth (m) */
  seaWeightAt?: (angle: number) => { weight: number; level: number };
  /** the ring's outer edge: its last row's heights round the ring (431 columns), the panorama's first kilometre eases
   * out of them */
  ringEdge: { columns: number; positions: Float32Array; heights: Float32Array };
  /** the ring's own snowline and treeline as altitudes (m), so the far country's snow and forest meet the ring's; null
   * keeps the character's (fractions of its amplitude) */
  snowlineM?: number | null;
  treelineM?: number | null;
  /** the probes' smaller bake (a CPU renderer); production bakes at HORIZON_PANORAMA's sizes */
  resolution?: { width: number; height: number; gridA: number; gridR: number };
}

/**
 * Per ring column, the tangent of the ring's own skyline elevation from the bake eye: the highest of its rows seen from
 * (0, eyeY, 0). The far ranges stand a margin above it (HorizonPanoramaCharacter.layers).
 */
export function horizonRingSkylineTan(ringEdge: HorizonPanoramaOptions['ringEdge'], eyeY: number): Float32Array {
  const n = ringEdge.columns, rows = Math.floor(ringEdge.heights.length / n);
  const out = new Float32Array(n).fill(-1);
  for (let row = 0; row < rows; row++) {
    for (let k = 0; k < n; k++) {
      const i = row * n + k;
      const r = Math.hypot(ringEdge.positions[i * 3], ringEdge.positions[i * 3 + 2]);
      if (r < 520) continue; // the battlefield's own seam rows
      const t = (ringEdge.heights[i] - eyeY) / r;
      if (t > out[k]) out[k] = t;
    }
  }
  // the envelope the far country answers: a running max over about 3 degrees (a ring summit's own width), then two box
  // passes over about 8 degrees — the layers rise with the ring's massing, not with every column of its skyline (a
  // target that jumped column to column stood the uplands' plinth up as walls)
  const wrap = (k: number): number => ((k % n) + n) % n;
  const maxR = Math.max(1, Math.round(n * 3 / 360)), boxR = Math.max(1, Math.round(n * 8 / 360));
  const tmp = new Float32Array(n);
  for (let k = 0; k < n; k++) { let m = -1; for (let d = -maxR; d <= maxR; d++) m = Math.max(m, out[wrap(k + d)]); tmp[k] = m; }
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? tmp : out, dst = pass === 0 ? out : tmp;
    for (let k = 0; k < n; k++) { let sum = 0; for (let d = -boxR; d <= boxR; d++) sum += src[wrap(k + d)]; dst[k] = sum / (2 * boxR + 1); }
  }
  return tmp;
}

/** The atlas's v for a direction's elevation from the bake eye (clamped by the sampler). */
export function horizonPanoramaV(elevation: number): number {
  return (elevation - HORIZON_PANORAMA.elevMin) / (HORIZON_PANORAMA.elevMax - HORIZON_PANORAMA.elevMin);
}

/** The atlas coordinates of a world point as seen from the bake eye: u by azimuth (0 at +x, round toward +z), v by
 * elevation. */
export function horizonPanoramaUv(x: number, y: number, z: number): [number, number] {
  let a = Math.atan2(z, x); if (a < 0) a += Math.PI * 2;
  const e = Math.atan2(y - HORIZON_PANORAMA.eyeY, Math.hypot(x, z));
  return [a / (Math.PI * 2), horizonPanoramaV(e)];
}

/** The resolved knobs for a map. */
export function resolveHorizonPanoramaCharacter(character: HorizonReliefCharacter, overrides?: Partial<HorizonPanoramaCharacter>): HorizonPanoramaCharacter {
  return { ...HORIZON_PANORAMA_CHARACTERS[character] ?? HORIZON_PANORAMA_CHARACTERS.rolling, ...(overrides ?? {}) };
}

// --------------------------------------------------------------------------------------------------- the shell mesh

/**
 * The shell: row 0 on the ring's outer edge (its own positions and heights, so the apron leaves the ring without a
 * seam), the apron's rows easing down to the shell's foot, the wall at the shell radius up its elevations. Every
 * vertex carries its azimuth fraction (u, continuous across the seam: column n repeats column 0 at u = 1).
 */
export function buildHorizonPanoramaShellGeometry(ringEdge: HorizonPanoramaOptions['ringEdge']): THREE.BufferGeometry {
  const n = ringEdge.columns, stride = n + 1;
  const P = HORIZON_PANORAMA;
  const rows = 1 + P.apronM.length + P.wallElevDeg.length;
  const positions = new Float32Array(stride * rows * 3), uvs = new Float32Array(stride * rows * 2);
  const start = ringEdge.heights.length - n; // the ring's last row
  for (let k = 0; k <= n; k++) {
    const c = k % n, i = start + c;
    const ex = ringEdge.positions[i * 3], ez = ringEdge.positions[i * 3 + 2], eh = ringEdge.heights[i];
    const a = Math.atan2(ez, ex), ca = Math.cos(a), sa = Math.sin(a);
    const edgeR = Math.hypot(ex, ez);
    let row = 0;
    const put = (x: number, y: number, z: number): void => {
      const o = row * stride + k;
      positions[o * 3] = x; positions[o * 3 + 1] = y; positions[o * 3 + 2] = z;
      uvs[o * 2] = k / n; uvs[o * 2 + 1] = 0;
      row++;
    };
    put(ex, eh - 0.05, ez);
    // the apron: from the edge level down toward a low plain at the shell's foot — from the edge's level averaged over
    // nine columns (the outer row is jagged column to column, and the apron reads the atlas by its own elevation from
    // the eye: a jagged apron read a different atlas row per column, one streak each, where a low ring shows it)
    let ehs = 0;
    for (let d = -4; d <= 4; d++) ehs += ringEdge.heights[start + ((c + d) % n + n) % n];
    ehs /= 9;
    const foot = Math.min(ehs, 20) - 25;
    P.apronM.forEach((r, j) => {
      const rr = Math.max(r, edgeR + 40 * (j + 1));
      const t = (j + 1) / (P.apronM.length + 1);
      put(ca * rr, ehs + (foot - ehs) * t, sa * rr);
    });
    // the wall: at the shell radius, rows at the strip's elevations as seen from the eye
    const R = Math.max(P.shellM, edgeR + 160);
    for (const deg of P.wallElevDeg) put(ca * R, Math.max(foot, P.eyeY + Math.tan(deg * DEG) * R), sa * R);
  }
  const indices: number[] = [];
  for (let row = 0; row < rows - 1; row++) {
    for (let k = 0; k < n; k++) {
      const a = row * stride + k, b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** The shell's material: the atlas by direction from the bake eye (an unlit backdrop; the post pass hazes it by depth),
 * transparent texels discarded (the sky and the clouds behind). The scene fog is off, as it was on the round-72 far
 * range: the strip carries its own air past the shell (the bake's distance grading). */
function buildShellMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, side: THREE.DoubleSide });
  material.name = 'horizon-panorama';
  const P = HORIZON_PANORAMA;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPanoEye = { value: new THREE.Vector3(0, P.eyeY, 0) };
    shader.uniforms.uPanoElev = { value: new THREE.Vector2(P.elevMin, P.elevMax) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPanoWorld; varying float vPanoU;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPanoWorld = (modelMatrix * vec4(position, 1.0)).xyz; vPanoU = uv.x;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uPanoEye; uniform vec2 uPanoElev; varying vec3 vPanoWorld; varying float vPanoU;')
      .replace('#include <map_fragment>', /* glsl */`
      #ifndef USE_MAP
        discard;
      #else
      {
        vec3 d = vPanoWorld - uPanoEye;
        float e = atan(d.y, length(d.xz));
        vec4 pano = texture2D(map, vec2(vPanoU, clamp((e - uPanoElev.x) / (uPanoElev.y - uPanoElev.x), 0.002, 0.998)));
        if (pano.a < 0.5) discard;
        // the atlas holds display-encoded colour (more precision in the shadows): back to linear
        diffuseColor.rgb *= pow(pano.rgb, vec3(2.2));
      }
      #endif`);
  };
  material.customProgramCacheKey = () => 'horizon-panorama-v1';
  return material;
}

// --------------------------------------------------------------------------------------------------- the bake shaders

const NOISE_GLSL = /* glsl */`
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// value noise with its analytic derivatives (Quilez): x = value in [-1, 1], yz = d/dx, d/dy
vec3 noised(vec2 x) {
  vec2 p = floor(x), w = fract(x);
  vec2 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * w * w * (w * (w - 2.0) + 1.0);
  float a = hash12(p), b = hash12(p + vec2(1.0, 0.0)), c = hash12(p + vec2(0.0, 1.0)), d = hash12(p + vec2(1.0, 1.0));
  float k1 = b - a, k2 = c - a, k4 = a - b - c + d;
  return vec3(-1.0 + 2.0 * (a + k1 * u.x + k2 * u.y + k4 * u.x * u.y), 2.0 * du * vec2(k1 + k4 * u.y, k2 + k4 * u.x));
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
`;

const FIELD_GLSL = /* glsl */`
uniform vec4 uOff0, uOff1, uOff2, uOff3;  // the seed's offsets
uniform vec4 uChar0;   // ampM, foot, macroL, sharp
uniform vec4 uChar1;   // midL, gullyL, gullyM, warpM
uniform vec4 uChar2;   // valley, valleyL, tables, layers (negative: as a plinth)
uniform vec4 uChar3;   // snowline, treeline, rockSlope, bedM
uniform vec4 uChar4;   // strata, deckM, ampM, farRise
uniform vec4 uFrame;   // innerM, outerM, shellM, eyeY
uniform sampler2D uEdge; // per azimuth: r = the ring's outer height, g = sea weight, b = sea level, a = tan of the ring's skyline
uniform vec4 uShore;   // the far shore's height share (0: open sea), the channel's distance (m), its coastal range's share

float macroField(vec2 q) {
  float sum = 0.0, amp = 1.0, weight = 1.0, norm = 0.0;
  for (int o = 0; o < 7; o++) {
    float v = 1.0 - abs(noised(q).x);
    v = pow(v, uChar0.w) * weight;
    weight = clamp(v * 1.15, 0.0, 1.0);
    sum += v * amp; norm += amp; amp *= 0.47;
    q = ROT * q;
  }
  return sum / norm;
}
float midField(vec2 q) {
  float a = 0.0, b = 1.0, norm = 0.0; vec2 d = vec2(0.0);
  for (int o = 0; o < 6; o++) {
    vec3 n = noised(q); d += n.yz;
    a += b * n.x / (1.0 + dot(d, d)); norm += b; b *= 0.5;
    q = ROT * q;
  }
  return a / norm;
}
float baseField(vec2 p) {
  vec2 w = p + uChar1.w * vec2(noised(p / 3300.0 + uOff0.zw).x, noised(p / 3300.0 + uOff1.xy).x);
  float m = macroField(w / uChar0.z + uOff0.xy);
  return pow(m, 1.6) * 1.15 + 0.22 * midField(w / uChar1.x + uOff1.zw) * (0.35 + m);
}
// Clay John's erosion octave: waves across the slope (so their crests run down it), cosines in jittered cells
float gullyOctave(vec2 p, vec2 dir, float seed) {
  vec2 i = floor(p), f = fract(p);
  float va = 0.0, wt = 0.0;
  for (int j = -2; j <= 1; j++) for (int k = -2; k <= 1; k++) {
    vec2 c = i - vec2(float(k), float(j));
    vec2 h = vec2(hash12(c + vec2(seed, 0.0)), hash12(c + vec2(0.0, seed))) * 0.5;
    vec2 pp = f + vec2(float(k), float(j)) - h;
    float w = exp(-dot(pp, pp) * 2.0); wt += w;
    va += cos(dot(pp, dir) * 6.2831853) * w;
  }
  return va / wt;
}
float envelopeAt(vec2 p, float r) {
  float d = smoothstep(uFrame.x, uFrame.x + 1600.0, r);
  float rise = (uChar0.y + (1.0 - uChar0.y) * d) * (1.0 - 0.18 * smoothstep(5500.0, 9000.0, r));
  // the hill countries' far ranges: low mountains behind the hills (uChar4.w: their extra rise past 4 km)
  rise *= 1.0 + uChar4.w * smoothstep(3800.0, 7500.0, r);
  float az = noised(p / 11000.0 + uOff2.xy).x * 0.5 + 0.5;
  vec2 w = p + uChar1.w * vec2(noised(p / 3300.0 + uOff0.zw).x, noised(p / 3300.0 + uOff1.xy).x);
  float vf = abs(noised(w / uChar2.y + uOff2.zw).x);
  float valley = 1.0 - uChar2.x * (1.0 - smoothstep(0.0, 0.45, vf));
  // under a low cloud deck the far country stays mostly beneath it (the round-72 far range's law: its ranges scaled
  // under the deck), the summits that still reach it fading into the cloud (the strip's alpha)
  return min(uChar0.x, max(150.0, uChar4.y * 1.4)) * rise * (0.55 + 0.45 * smoothstep(0.15, 0.85, az)) * valley;
}
// a tableland: broad tables cut by canyons, buttes standing off them, a low plain between; each table's edge a cliff
// over a talus ramp, its top one of two caprock levels
float mesaField(vec2 p, float A) {
  vec2 w = p + uChar1.w * vec2(noised(p / 3300.0 + uOff0.zw).x, noised(p / 3300.0 + uOff1.xy).x);
  float big = noised(w / uChar0.z + uOff0.xy).x * 0.65 + noised(w / (uChar0.z * 0.37) + uOff1.zw).x * 0.35;
  float butte = noised(w / (uChar0.z * 0.16) + uOff2.zw).x;
  // (few tables in the first kilometre past the ring: the threshold falls with the distance, so a table's edge is
  // still a noise-shaped cliff — a mask ramp there drew a smooth sand slope in front of every far table)
  // (a third of the far country in tables, not half: at -0.12 they joined into one plateau whose rim ran round the
  // whole ring as a wall — Copper Mesa — instead of mesas and buttes standing over the plain)
  // (and none in the first one and a half kilometres past the ring: a near table mapped onto the shell stood over the
  // ring as a curved band from a camera off the square's centre)
  float th = mix(0.9, 0.16, smoothstep(uFrame.x + 1500.0, uFrame.x + 3000.0, length(p)));
  float t = smoothstep(th, th + 0.015, big);
  float tb = smoothstep(th + 0.5, th + 0.52, butte) * (1.0 - t);
  float edge = max(t, tb * 0.9);
  float profile = 0.22 * smoothstep(0.0, 0.45, edge) + 0.78 * smoothstep(0.3, 1.0, edge);
  float lv = noised(w / (uChar0.z * 1.3) + uOff3.xy).x;
  float level = 0.42 + 0.22 * step(-0.15, lv) + 0.2 * step(0.3, lv) + 0.04 * noised(w / 1300.0).x;
  level = mix(level, level + 0.22, tb); // the buttes stand above the tables round them
  float plain = A * (0.04 + 0.05 * (noised(w / 900.0 + uOff3.zw).x * 0.5 + 0.5));
  return mix(plain, A * level, profile);
}
float gPlinth = 0.0; // farField's plinth at its last point (the height pass writes it beside the height)
float farField(vec2 p) {
  gPlinth = 0.0;
  float r = length(p);
  float A = envelopeAt(p, r);
  float h = uChar2.z > 0.5 ? mesaField(p, A) : A * baseField(p);
  // the gullies: two erosion octaves across the local slope, deeper on the steeper ground
  float e = 30.0;
  vec2 g = A * vec2(baseField(p + vec2(e, 0.0)) - baseField(p - vec2(e, 0.0)), baseField(p + vec2(0.0, e)) - baseField(p - vec2(0.0, e))) / (2.0 * e);
  float s = length(g);
  if (uChar2.z < 0.5 && s > 0.02) {
    vec2 sd = g / s;
    float k = clamp(s * 2.2, 0.4, 2.2);
    vec2 dir = vec2(sd.y, -sd.x) * k;
    float gs = gullyOctave(p / uChar1.y + uOff3.xy, dir, 17.0) + 0.5 * gullyOctave(p / (uChar1.y * 0.5) + uOff3.zw, dir, 48.0);
    h += uChar1.z * smoothstep(0.05, 0.35, s) * gs * (0.4 + 0.6 * smoothstep(0.0, A * 0.5, h));
  }
  h = max(0.0, h);
  float a = atan(p.y, p.x) * 0.15915494309;
  vec4 edge = texture2D(uEdge, vec2(fract(a), 0.5));
  // the layers behind the ring (the mountains lane, 2026-10-03: from the battlefield the far country hid behind the
  // ring's own skyline on most bearings): past ~3.5 km the ranges rise until their crests stand a margin above the
  // ring's skyline seen from the eye — the margin wanders round the compass (-0.9 to +4.3 degrees), so some sectors
  // stay behind the ring and the rest show their layers — and never into the cloud deck. Ranges keep their shape (the
  // field is scaled); tables lift to the level (their cliffs keep their profile).
  // (not over a sea sector or beside one: a coast's uplands rose sheer from the water at the sector's edge)
  float behind = abs(uChar2.w) * smoothstep(uChar2.w < 0.0 ? 2800.0 : 3400.0, uChar2.w < 0.0 ? 4200.0 : 6500.0, r)
    * (1.0 - smoothstep(0.02, 0.4, edge.g));
  if (behind > 0.001 && h > 0.0) {
    vec2 du = p / max(r, 1.0);
    float m = noised(du * 6.0 + uOff1.zw).x * 0.6 + noised(du * 15.0 + uOff2.xy).x * 0.4;
    float margin = mix(-0.015, 0.075, smoothstep(-0.55, 0.55, m));
    float target = min(uFrame.w + r * (edge.a + margin), max(150.0, uChar4.y * 1.25));
    if (uChar2.z > 0.5) {
      // the tablelands scale too (their cliffs and talus keep their profile; lifting the tables to the target stood
      // them as boxes, and on Copper Mesa as one slab overhanging the frame), and by little
      h *= mix(1.0, clamp(target / max(1.0, 0.75 * A), 1.0, 1.6), behind);
    } else if (uChar2.w < 0.0) {
      // the hill countries: ridgelines in layers behind the ring — three, at about 4.6, 6.5 and 8.3 km (each wandering
      // 600 m in distance round the compass), each crest a little higher over the ring's skyline than the one before
      // (from the eye: bands of hills above the ring, each hazier), the country's own hills and valleys riding on them;
      // a single ramp to the target stood the uplands up as tepuis
      float cap = max(150.0, uChar4.y * 1.25), lift = 0.0;
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float rc = 4600.0 + fi * 1850.0 + 600.0 * noised(du * (3.0 + fi) + uOff3.xy + vec2(fi * 7.1, 1.3)).x;
        // broad (a hill country's far slopes are 10-25 degrees, a narrow ridge stood as a wall)
        float wr = 1500.0 + 420.0 * fi;
        float prof = exp(-((r - rc) * (r - rc)) / (wr * wr));
        float cm = mix(-0.012, 0.03 + 0.022 * fi, smoothstep(-0.6, 0.6, noised(du * (5.0 + 2.0 * fi) + uOff1.zw + vec2(fi * 3.3, -2.1)).x));
        // the crest line's own summits and saddles (a kilometre or two apart), so no ridge runs level; under the deck
        // the crest bows down instead of flattening on it
        float und = noised(du * (rc / 1400.0) + vec2(fi * 5.7, 9.1)).x * 0.6 + noised(du * (rc / 520.0) + vec2(-fi * 2.3, 4.4)).x * 0.4;
        float crest = (uFrame.w + rc * (edge.a + cm)) * (0.86 + 0.16 * und);
        crest = crest < cap * 0.8 ? crest : cap * (0.8 + 0.2 * (1.0 - exp(-(crest - cap * 0.8) / (cap * 0.2))));
        lift = max(lift, (crest - 0.6 * A) * prof);
      }
      gPlinth = max(0.0, lift) * behind;
      h += gPlinth;
    } else {
      // (at most 1.8 x: a range scaled three times stood as a monolith — Nordhavn Fjord's far block)
      h *= mix(1.0, clamp(target / max(1.0, 0.8 * A), 1.0, 1.8), behind);
    }
  }
  // the near band stays under the ring's own skyline from the eye: what stands in the first two kilometres past the ring
  // is mapped onto the shell 2.6 km out, and seen from anywhere but the bake eye a tall near form bends with the shell
  // (Copper Mesa's near tables arched across the frame as one slab, Nordhavn Fjord's beside its bay stood as a block);
  // its excess over a line 1.7 degrees under that skyline is compressed to a seventh, released between 3.2 and 4.8 km
  float nearCap = uFrame.w + r * (edge.a - 0.03);
  float nearW = 1.0 - smoothstep(3200.0, 4800.0, r);
  if (h > nearCap) h = mix(h, nearCap + (h - nearCap) * 0.15, nearW);
  // the first kilometre eases out of the ring's outer heights; the sea sectors sink under their level — to the horizon,
  // or on a channel coast (uShore.x > 0, per map) as far as the far shore: the mainland or the islands across the water
  // (Saltwind, gauntlet wave 4: "behind the end of the road the land collapses into a thin flat strip with a pale blue
  // band under the haze line, so the world seems to end"; from the Dalmatian islands the mainland's ranges stand across
  // the channel). The shore wanders 1.1 km round its distance and rises out of the water over 1.8 km to the far
  // country's own height times the share, with a coastal range along it (the mainland's front ranges: the envelope's
  // share 2.4 km behind the shore, its crest wandering in height), so the far shore stands as a range across the water
  // instead of a low strip where the far country's own relief is low; its low ground stays under the water as bays.
  h = mix(edge.r * 0.8, h, smoothstep(uFrame.x, uFrame.x + 500.0, r));
  float sink = edge.g * smoothstep(0.0, 0.35, edge.g), seaH = edge.b - 6.0;
  if (uShore.x > 0.0) {
    vec2 su = p / max(r, 1.0);
    float rs = uShore.y + 1100.0 * noised(su * 5.0 + uOff2.zw).x;
    float rc = rs + 2400.0, crest = 0.7 + 0.3 * noised(su * 23.0 + uOff3.xy).x;
    float range = uShore.z * A * crest * exp(-((r - rc) * (r - rc)) / (1600.0 * 1600.0));
    h = mix(h, seaH + max(0.0, h * uShore.x + range - seaH) * smoothstep(rs, rs + 1800.0, r), sink);
  } else {
    h = mix(h, seaH, sink);
  }
  return h;
}
`;

const QUAD_VERTEX = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** pass 1: the polar height grid (azimuth across, log radius up) */
const HEIGHT_FRAGMENT = /* glsl */`
precision highp float;
varying vec2 vUv;
${NOISE_GLSL}
${FIELD_GLSL}
void main() {
  float a = vUv.x * 6.2831853;
  float r = uFrame.x * pow(uFrame.y / uFrame.x, vUv.y);
  float h = farField(vec2(cos(a), sin(a)) * r);
  gl_FragColor = vec4(h, gPlinth, 0.0, 1.0);
}
`;

const GRID_LOOKUP_GLSL = /* glsl */`
uniform sampler2D uHeight;
uniform vec4 uFrame;
uniform vec2 uGrid; // gridA, gridR
// a world point's grid coordinates and its height (bilinear); -1e9 outside the annulus
vec2 gridUv(vec2 p) {
  float r = length(p);
  float a = atan(p.y, p.x) * 0.15915494309;
  return vec2(fract(a), log(r / uFrame.x) / log(uFrame.y / uFrame.x));
}
float heightAt(vec2 p) {
  vec2 g = gridUv(p);
  if (g.y < 0.0 || g.y > 1.0) return -1e9;
  return texture2D(uHeight, g).r;
}
float rowRadius(float v) { return uFrame.x * pow(uFrame.y / uFrame.x, v); }
// the world normal at grid coordinates (central differences across the column and the row)
vec3 gridNormal(vec2 g) {
  float da = 1.0 / uGrid.x, dv = 1.0 / uGrid.y;
  float hA0 = texture2D(uHeight, g - vec2(da, 0.0)).r, hA1 = texture2D(uHeight, g + vec2(da, 0.0)).r;
  float hR0 = texture2D(uHeight, g - vec2(0.0, dv)).r, hR1 = texture2D(uHeight, g + vec2(0.0, dv)).r;
  float r = rowRadius(g.y), a = g.x * 6.2831853;
  float dr = rowRadius(g.y + dv) - rowRadius(g.y - dv), arc = 6.2831853 * r * 2.0 / uGrid.x;
  float dhdr = (hR1 - hR0) / max(1.0, dr), dhdt = (hA1 - hA0) / max(1.0, arc);
  float ca = cos(a), sa = sin(a);
  vec2 grad = vec2(dhdr * ca - dhdt * sa, dhdr * sa + dhdt * ca);
  return normalize(vec3(-grad.x, 1.0, -grad.y));
}
`;

/** pass 2: the grid's light — the sun's visibility (soft cast shadows) and the sky's occlusion */
const LIGHT_FRAGMENT = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec3 uSun;
${GRID_LOOKUP_GLSL}
void main() {
  float a = vUv.x * 6.2831853, r = rowRadius(vUv.y);
  vec2 p = vec2(cos(a), sin(a)) * r;
  float h0 = texture2D(uHeight, vUv).r;
  vec2 sd = normalize(uSun.xz + vec2(1e-5));
  float tanSun = uSun.y / max(0.05, length(uSun.xz));
  float lit = 1.0, d = 30.0;
  for (int s = 0; s < 34; s++) {
    float hh = heightAt(p + sd * d);
    if (hh < -1e8) break;
    float over = hh - (h0 + 2.0 + d * tanSun);
    lit = min(lit, clamp(0.5 - over / (d * 0.06), 0.0, 1.0));
    if (lit <= 0.0) break;
    d *= 1.16;
  }
  lit = lit * lit * (3.0 - 2.0 * lit);
  float occ = 0.0;
  for (int q = 0; q < 6; q++) {
    float qa = float(q) * 1.0471976 + 0.3;
    vec2 qd = vec2(cos(qa), sin(qa));
    float maxT = 0.0;
    for (float dd = 60.0; dd <= 500.0; dd *= 1.6) {
      float hh = heightAt(p + qd * dd);
      if (hh < -1e8) break;
      maxT = max(maxT, (hh - h0) / dd);
    }
    occ += atan(maxT) / 1.5707963;
  }
  gl_FragColor = vec4(lit, 1.0 - occ / 6.0, 0.0, 1.0);
}
`;

/** pass 3: the strip — the first grid row reaching each texel's elevation, its surface law, its light and its air */
const STRIP_FRAGMENT = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uLight;
uniform vec3 uSun;
uniform vec2 uGains;
uniform vec3 uBase, uRock, uRock2, uScree, uSnow, uForest, uFog;
uniform vec4 uChar3;   // snowline, treeline, rockSlope, bedM
uniform vec4 uChar4;   // strata, deckM, ampM, farRise
uniform vec2 uElev;
uniform sampler2D uEdge;
${NOISE_GLSL}
${GRID_LOOKUP_GLSL}
vec3 surfaceColour(vec2 g, vec3 wp, vec3 n, float apron, vec4 light) {
  float slope = 1.0 - n.y;
  // the zones (forest, fields, snow, scree) by the height over the upland's plinth where it has one
  float hT = clamp((wp.y - texture2D(uHeight, g).g) / uChar4.z, 0.0, 1.0);
  float n1 = noised(wp.xz / 1900.0 + vec2(5.3, 1.7)).x * 0.7 + noised(wp.xz / 700.0 + vec2(-3.1, 8.2)).x * 0.3;
  // the lower flanks: stands of the map's forest (denser on the slopes, broken by clearings and fields on the gentle
  // lowland), the crowns' mottle; the meadows and fields a patchwork of their own tones
  float vegW = uChar3.y > 0.0 ? (1.0 - smoothstep(uChar3.y * 0.75, uChar3.y * 1.05, hT + 0.05 * n1)) * (1.0 - smoothstep(0.32, 0.55, slope)) : 0.0;
  float standN = noised(wp.xz / 170.0 + vec2(3.1, -7.7)).x + (1.0 - apron) * (0.45 * noised(wp.xz / 61.0 + vec2(-9.2, 4.4)).x + 0.25 * noised(wp.xz / 23.0).x);
  float stand = smoothstep(-0.15, 0.2, standN + 1.4 * smoothstep(0.03, 0.18, slope) - 0.55);
  float mottle = 0.72 + 0.4 * mix(noised(wp.xz / 29.0 + vec2(11.3, 5.1)).x * 0.5 + 0.5, 0.5, apron);
  // the lowland's fields: parcels on a slightly rotated grid (each its own crop: green, straw, tilled earth), on the
  // gentle ground only — distant farmland reads as bands of colour along the hills' feet
  vec2 fq = mat2(0.92, 0.39, -0.39, 0.92) * wp.xz / vec2(260.0, 170.0);
  vec2 fc = floor(fq + 0.3 * vec2(noised(fq * 0.21).x, noised(fq * 0.19 + 7.1).x));
  float crop = hash12(fc + 17.3);
  vec3 cropC = crop < 0.45 ? uBase * vec3(0.95, 1.08, 0.88) : crop < 0.75 ? uBase * vec3(1.32, 1.18, 0.78) : uBase * vec3(1.05, 0.88, 0.7);
  float fieldW = (1.0 - smoothstep(0.04, 0.1, slope)) * (1.0 - smoothstep(0.25, 0.45, hT)) * step(0.35, uChar3.y) * (1.0 - apron);
  float field = noised(floor(wp.xz / 210.0) * 1.7 + vec2(0.5)).x;
  field *= 1.0 - apron;
  vec3 meadow = uBase * (1.0 + 0.16 * field + 0.08 * (1.0 - apron) * noised(wp.xz / 90.0 + vec2(-2.2, 9.4)).x) * vec3(1.0 + 0.06 * field, 1.0, 1.0 - 0.05 * field);
  meadow = mix(meadow, cropC * (0.95 + 0.1 * noised(wp.xz / 37.0).x), fieldW * 0.85);
  vec3 ground = uBase * (0.92 + 0.16 * (noised(wp.xz / 120.0 + vec2(7.7, -1.3)).x * 0.5 + 0.5));
  vec3 col = mix(ground, mix(meadow, uForest * mottle, stand), vegW);
  // rock on the steep faces, its beds: a tone per bed, the bedding planes darker
  float bt = (wp.y + (wp.x * 0.6 + wp.z * 0.8) * 0.004) / uChar3.w;
  float bi = floor(bt), bf = bt - bi;
  float tone = hash12(vec2(bi * 7.13 + 1.7, 3.9));
  float bedTone = 1.0 + uChar4.x * (tone - 0.5) * 2.0;
  float plane = 1.0 - smoothstep(0.0, 0.08, bf) * smoothstep(0.0, 0.08, 1.0 - bf);
  vec3 rockC = mix(uRock, uRock2, tone > 0.55 ? 0.7 : 0.0) * bedTone * (1.0 - 0.54 * plane * uChar4.x);
  // the rock's own patches: warmer and cooler outcrops over a few hundred metres, weathered paler on the crests
  float rockN = noised(wp.xz / 420.0 + vec2(-6.1, 2.3)).x;
  rockC *= vec3(1.0 + 0.07 * rockN, 1.0 + 0.02 * rockN, 1.0 - 0.06 * rockN) * (1.0 + 0.12 * smoothstep(0.55, 0.95, hT));
  float rockW = smoothstep(uChar3.z, uChar3.z + 0.16, slope + 0.04 * n1);
  col = mix(col, rockC, rockW);
  // scree on the moderate slopes below the rock
  col = mix(col, uScree, smoothstep(0.12, 0.24, slope) * (1.0 - rockW) * (1.0 - vegW) * 0.7);
  // snow above the snowline on the slopes that hold it
  if (uChar3.x < 1.5) col = mix(col, uSnow, smoothstep(uChar3.x - 0.05, uChar3.x + 0.12, hT + 0.06 * n1) * (1.0 - smoothstep(0.3, 0.5, slope)));
  col *= 1.0 + 0.08 * n1;
  // the sun with its cast shadows, the sky with its occlusion
  float ndl = max(0.0, dot(n, uSun));
  float fogL = (uFog.r + uFog.g + uFog.b) / 3.0;
  vec3 skyTint = 0.55 + 0.45 * uFog / max(1e-3, fogL);
  // the sun warm, the shade lit by the sky (cooler), a little light bounced up from the valleys
  vec3 sunC = uGains.y * 1.05 * ndl * light.r * vec3(1.06, 0.98, 0.86);
  vec3 skyC = uGains.x * (0.62 + 0.38 * n.y) * light.g * skyTint;
  vec3 bounce = uGains.x * 0.12 * (1.0 - n.y) * vec3(0.9, 0.85, 0.75);
  col *= sunC + skyC + bounce;
  return col;
}
void main() {
  float u = vUv.x, a = u * 6.2831853;
  float e = mix(uElev.x, uElev.y, vUv.y);
  float tanE = tan(e);
  // the march: grid rows near to far, the first whose elevation angle reaches e (the rows before it all fell short)
  float prevE = -2.0, prevV = 0.0, hitV = -1.0;
  for (int j = 0; j < 512; j++) {
    if (float(j) >= uGrid.y) break;
    float v = (float(j) + 0.5) / uGrid.y;
    float r = rowRadius(v);
    float h = texture2D(uHeight, vec2(u, v)).r;
    float ej = atan(h - uFrame.w, r);
    if (ej >= e) {
      float t = j == 0 ? 1.0 : clamp((e - prevE) / max(1e-6, ej - prevE), 0.0, 1.0);
      hitV = j == 0 ? v : mix(prevV, v, t);
      break;
    }
    prevE = ej; prevV = v;
  }
  if (hitV < 0.0) { gl_FragColor = vec4(0.0); return; }
  vec2 g = vec2(u, hitV);
  float rr = rowRadius(hitV);
  vec3 wp = vec3(cos(a) * rr, uFrame.w + tanE * rr, sin(a) * rr);
  vec3 n = gridNormal(g);
  // below the first row's elevation: the ground between the ring and the annulus (the shell's apron reads it from
  // below) — the ray's own meeting with that row's level, so the apron carries ground texture, not one streak per column
  float h0 = texture2D(uHeight, vec2(u, 0.5 / uGrid.y)).r;
  float apron = 0.0;
  if (hitV <= 0.5 / uGrid.y + 1e-5 && tanE < -1e-4 && h0 < uFrame.w) {
    // the first row's height smoothed round the compass (it carries the ring's outer heights, column by column)
    float hs = 0.0;
    for (int t = -4; t <= 4; t++) hs += texture2D(uHeight, vec2(u + float(t) * 3.0 / uGrid.x, 0.5 / uGrid.y)).r;
    h0 = hs / 9.0;
    rr = clamp((uFrame.w - h0) / -tanE, 300.0, uFrame.x);
    wp = vec3(cos(a) * rr, h0, sin(a) * rr);
    n = vec3(0.0, 1.0, 0.0);
    // the apron is seen at a grazing angle: one texel row spans hundreds of metres there, so its parcels, stands and
    // fine tones would stand as one streak per column (where a low ring shows it) — it keeps the broad tones only
    apron = 1.0;
  }
  // the texel's footprint on the ground along the ray (one strip row is 25/512 degrees): at a grazing angle it spans
  // hundreds of metres, and the parcels and the fine tones would alias into one streak per column (Saltmere's coast
  // where the ring is low) — they fade out over a 40-160 m footprint, the broad tones stay
  vec3 rayD = vec3(cos(e) * cos(a), sin(e), cos(e) * sin(a));
  float footprint = rr * ((uElev.y - uElev.x) / 512.0) / max(0.01, abs(dot(rayD, n)));
  // (the apron: its first row's light is one value per column — the near ridges' shadows across it — so it would streak;
  // it takes the open sky's)
  apron = max(apron, smoothstep(40.0, 160.0, footprint));
  // (a grazing reach's light too: its shadows and occlusion land a column apart as streaks — it takes a mild open sky)
  vec4 light = mix(texture2D(uLight, g), vec4(0.94, 0.9, 0.0, 1.0), apron);
  vec3 col = surfaceColour(g, wp, n, apron, light);
  float n1 = noised(wp.xz / 1900.0 + vec2(5.3, 1.7)).x * 0.7 + noised(wp.xz / 700.0 + vec2(-3.1, 8.2)).x * 0.3;
  float fogL = (uFog.r + uFog.g + uFog.b) / 3.0;
  vec3 skyTint = 0.55 + 0.45 * uFog / max(1e-3, fogL);
  vec4 edge = texture2D(uEdge, vec2(u, 0.5));
  // below the ring's own skyline from the eye the strip is hidden behind the ring — but a camera above the eye or off
  // the square's centre sees a band of it over the ring's outer rows, and there the strip grazes the near country, one
  // ground point per column (a band of vertical streaks over Saltmere's coast): it keeps one lit ground tone instead
  float hiddenW = 1.0 - smoothstep(atan(edge.a) - 0.012, atan(edge.a) - 0.002, e);
  if (hiddenW > 0.001) {
    // (a re-march from a higher eye was tried — the country behind the shell point seen from 300 m — and banded column
    // by column on the ridges it grazed: the fill stays a lit ground tone, its woods and fields as broad patches round
    // the compass, receding into the air toward the skyline so it reads as land falling away, not a sheet)
    vec2 sp = vec2(cos(a), sin(a)) * uFrame.z;
    float patchN = noised(sp / 900.0 + vec2(2.3, -7.1)).x * 0.6 + noised(sp / 340.0 + vec2(-4.4, 1.9)).x * 0.4;
    vec3 flatC = uBase * (uGains.y * 1.05 * max(0.0, uSun.y) * vec3(1.06, 0.98, 0.86) + uGains.x * 0.82 * skyTint);
    vec3 fill = mix(flatC, flatC * uForest / max(vec3(1e-3), uBase) * 0.95, smoothstep(0.05, 0.45, patchN) * step(0.35, uChar3.y));
    float recede = smoothstep(atan(edge.a) - 0.06, atan(edge.a), e);
    fill = mix(fill, uFog * 1.05, 0.25 + 0.35 * recede);
    col = mix(col, fill, hiddenW * 0.95);
  }
  // the sea sectors: the open water under the sky
  float sea = edge.g * step(wp.y, edge.b + 0.5);
  col = mix(col, uFog * 0.82, sea);
  // the air past the shell
  col = mix(col, uFog * 1.05, 1.0 - exp(-max(0.0, rr - uFrame.z) / 9000.0));
  // into the cloud: a soft, broken fade over the deck's lowest 140 m
  float alpha = 1.0 - smoothstep(uChar4.y - 140.0, uChar4.y + 20.0, wp.y + 60.0 * noised(wp.xz / 260.0 + vec2(4.4, -2.9)).x);
  gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2)), alpha);
}
`;

// --------------------------------------------------------------------------------------------------- the baker

/** The renderer surface the bake needs (production: the WebGLRenderer). */
export interface HorizonPanoramaRenderer {
  capabilities: { isWebGL2: boolean; maxTextureSize: number };
  extensions: { has(name: string): boolean };
  getRenderTarget(): THREE.WebGLRenderTarget | null;
  setRenderTarget(target: THREE.WebGLRenderTarget | null): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  autoClear: boolean;
  getClearColor(target: THREE.Color): THREE.Color;
  getClearAlpha(): number;
  setClearColor(color: THREE.Color, alpha: number): void;
  clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
  xr?: { enabled: boolean };
}

export interface HorizonPanoramaHandle {
  /** the mesh drawn once the atlas is baked */
  readonly mesh: THREE.Mesh;
  readonly baked: boolean;
  /** bake when a capable renderer is present and the atlas is not baked; true when baked after the call */
  ensureBaked(renderer: HorizonPanoramaRenderer | null | undefined): boolean;
  dispose(): void;
  /** the last bake's duration (ms) and count, for the probes; `tone`: whether the battlefield's own ground and rock
   * means coloured the bake ('ground') or the authored palette did ('authored') */
  readonly stats: { bakes: number; ms: number; unsupported: string | null; tone: 'authored' | 'ground' };
  /**
   * The battlefield's own ground and rock albedo means (linear), so the far country continues the ring's terrain
   * material instead of the authored hill palette (Sirocco Wadi's far tables were saturated orange behind a pale
   * sand ring). Taken only before the bake (a later bake would hitch a frame); false when it came too late.
   */
  setGroundTone(ground: THREE.Color | null, rock: THREE.Color | null): boolean;
}

const _clear = new THREE.Color();

/**
 * The panorama for a ring: the shell mesh (hidden until baked) and its baker. `fallback` is the round-72 far range: it
 * stays visible until the bake succeeds and comes back when a GPU suspension disposes the atlas.
 */
export function createHorizonPanorama(options: HorizonPanoramaOptions, fallback: THREE.Object3D | null): HorizonPanoramaHandle {
  const P = HORIZON_PANORAMA;
  const ch = resolveHorizonPanoramaCharacter(options.character, options.overrides);
  const geometry = buildHorizonPanoramaShellGeometry(options.ringEdge);
  const material = buildShellMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  // the far range's name: the battle atmosphere dims every 'horizon-far-range' mesh's colour at night
  // (battleAtmosphereRuntime.ts), and the panorama is that range now; lookups by name still find the round-72 mesh, the
  // ring's first child of the name
  mesh.name = 'horizon-far-range';
  mesh.userData.horizonPanorama = true;
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.frustumCulled = false;
  mesh.userData.aoExclude = true;
  let atlas: THREE.WebGLRenderTarget | null = null;
  let baked = false;
  const stats = { bakes: 0, ms: 0, unsupported: null as string | null, tone: 'authored' as 'authored' | 'ground' };
  const palette = { ...options.palette };

  // the per-azimuth edge data: the ring's outer height, the sea weight and level, and the tangent of the ring's own
  // skyline elevation from the bake eye (half floats, filtered)
  const EDGE_W = 1024;
  const edgeData = new Uint16Array(EDGE_W * 4);
  const ringSkyline = horizonRingSkylineTan(options.ringEdge, P.eyeY);
  // the sea weight round the compass, softened over about 4 degrees each way: the far country beside a bay dropped to
  // the sea in a degree or two of azimuth — at 5 km a wall a few hundred metres wide (Nordhavn Fjord's far block)
  const seaW = new Float32Array(EDGE_W), seaL = new Float32Array(EDGE_W);
  for (let i = 0; i < EDGE_W; i++) {
    const sea = options.seaWeightAt ? options.seaWeightAt((i / EDGE_W) * Math.PI * 2) : { weight: 0, level: 0 };
    seaW[i] = sea.weight; seaL[i] = sea.level;
  }
  {
    const R = Math.round(EDGE_W * 4 / 360), tmp = new Float32Array(EDGE_W);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < EDGE_W; i++) { let sum = 0; for (let d = -R; d <= R; d++) sum += seaW[(i + d + EDGE_W) % EDGE_W]; tmp[i] = sum / (2 * R + 1); }
      seaW.set(tmp);
    }
  }
  {
    const n = options.ringEdge.columns, start = options.ringEdge.heights.length - n;
    for (let i = 0; i < EDGE_W; i++) {
      const angle = (i / EDGE_W) * Math.PI * 2;
      // the ring's last row by angle (its columns are not exactly even after the seam work: nearest by angle)
      const k = Math.round((angle / (Math.PI * 2)) * n) % n;
      // averaged over nine columns (about 7.5 degrees): the outer row is jagged column to column, and the far country's
      // first kilometre eases out of it, so a raw column stood in the strip as a streak
      let h = 0;
      for (let d = -4; d <= 4; d++) h += options.ringEdge.heights[start + ((k + d) % n + n) % n];
      h /= 9;
      edgeData[i * 4] = THREE.DataUtils.toHalfFloat(h);
      edgeData[i * 4 + 1] = THREE.DataUtils.toHalfFloat(seaW[i]);
      edgeData[i * 4 + 2] = THREE.DataUtils.toHalfFloat(seaL[i]);
      edgeData[i * 4 + 3] = THREE.DataUtils.toHalfFloat(ringSkyline[k]);
    }
  }

  const unsupported = (renderer: HorizonPanoramaRenderer): string | null => {
    if (!renderer.capabilities?.isWebGL2) return 'webgl1';
    if ((renderer.capabilities.maxTextureSize ?? 0) < (options.resolution ?? P).width) return 'max texture size';
    if (!renderer.extensions?.has('EXT_color_buffer_float') && !renderer.extensions?.has('EXT_color_buffer_half_float')) return 'no float render targets';
    return null;
  };

  function bake(renderer: HorizonPanoramaRenderer): void {
    const started = performance.now();
    const rng = mulberry32((options.seed ^ 0x9A70) >>> 0);
    const off = Array.from({ length: 16 }, () => rng() * 200 - 100);
    const linear = (c: THREE.Color): THREE.Vector3 => new THREE.Vector3(c.r, c.g, c.b);
    const rock = palette.rock;
    const tables = ch.tables;
    const rock2 = tables ? new THREE.Vector3(rock.r * 1.22, rock.g * 1.05, rock.b * 0.92) : new THREE.Vector3(rock.r * 0.86, rock.g * 0.9, rock.b * 0.98);
    const scree = new THREE.Vector3(rock.r * 1.12 + 0.02, rock.g * 1.1 + 0.02, rock.b * 1.08 + 0.02);
    const edgeTex = new THREE.DataTexture(edgeData, EDGE_W, 1, THREE.RGBAFormat, THREE.HalfFloatType);
    edgeTex.wrapS = THREE.RepeatWrapping; edgeTex.magFilter = THREE.LinearFilter; edgeTex.minFilter = THREE.LinearFilter;
    edgeTex.needsUpdate = true;
    const common = {
      uOff0: { value: new THREE.Vector4(off[0], off[1], off[2], off[3]) },
      uOff1: { value: new THREE.Vector4(off[4], off[5], off[6], off[7]) },
      uOff2: { value: new THREE.Vector4(off[8], off[9], off[10], off[11]) },
      uOff3: { value: new THREE.Vector4(off[12], off[13], off[14], off[15]) },
      uChar0: { value: new THREE.Vector4(ch.ampM, ch.foot, ch.macroL, ch.sharp) },
      uChar1: { value: new THREE.Vector4(ch.midL, ch.gullyL, ch.gullyM, ch.warpM) },
      // .w: the layers' strength, negative for the plinth (the hill countries)
      uChar2: { value: new THREE.Vector4(ch.valley, ch.valleyL, tables ? 1 : 0, ch.plinth ? -ch.layers : ch.layers) },
      // the snowline and the treeline as fractions of the amplitude the strip's law reads them by (the ring's own
      // altitudes where it has them)
      uChar3: { value: new THREE.Vector4(
        options.snowlineM != null ? options.snowlineM / ch.ampM : ch.snowline,
        options.treelineM != null ? options.treelineM / ch.ampM : ch.treeline, ch.rockSlope, ch.bedM) },
      uChar4: { value: new THREE.Vector4(ch.strata, options.deckBaseM, ch.ampM, ch.farRise) },
      uShore: { value: new THREE.Vector4(ch.shore, ch.shoreM, ch.shoreRange, 0) },
      uFrame: { value: new THREE.Vector4(P.innerM, P.outerM, P.shellM, P.eyeY) },
      uGrid: { value: new THREE.Vector2((options.resolution ?? P).gridA, (options.resolution ?? P).gridR) },
      uEdge: { value: edgeTex },
      uSun: { value: new THREE.Vector3(...options.sun).normalize() },
      uGains: { value: new THREE.Vector2(options.gains.ambient, options.gains.sunGain) },
      uElev: { value: new THREE.Vector2(P.elevMin, P.elevMax) },
      uBase: { value: linear(palette.base) }, uRock: { value: linear(rock) }, uRock2: { value: rock2 },
      uScree: { value: scree }, uSnow: { value: linear(palette.snow) }, uForest: { value: linear(palette.forest) },
      uFog: { value: linear(palette.fog) },
    };
    const target = (w: number, h: number, type: THREE.TextureDataType, mips: boolean): THREE.WebGLRenderTarget => new THREE.WebGLRenderTarget(w, h, {
      type, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false, generateMipmaps: mips,
      minFilter: mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
    const res = options.resolution ?? P;
    const heightRT = target(res.gridA, res.gridR, THREE.HalfFloatType, false);
    const lightRT = target(res.gridA, res.gridR, THREE.UnsignedByteType, false);
    const stripRT = target(res.width, res.height, THREE.UnsignedByteType, true);
    stripRT.texture.colorSpace = THREE.NoColorSpace;
    stripRT.texture.anisotropy = 4;
    stripRT.texture.name = 'horizon-panorama-atlas';
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    quad.frustumCulled = false;
    const scene = new THREE.Scene(); scene.add(quad);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const pass = (fragmentShader: string, extra: Record<string, THREE.IUniform>): THREE.ShaderMaterial => new THREE.ShaderMaterial({
      vertexShader: QUAD_VERTEX, fragmentShader, uniforms: { ...common, ...extra }, depthTest: false, depthWrite: false,
    });
    const heightMat = pass(HEIGHT_FRAGMENT, {});
    const lightMat = pass(LIGHT_FRAGMENT, { uHeight: { value: heightRT.texture } });
    const stripMat = pass(STRIP_FRAGMENT, { uHeight: { value: heightRT.texture }, uLight: { value: lightRT.texture } });
    const previousTarget = renderer.getRenderTarget();
    const previousColor = renderer.getClearColor(_clear).clone();
    const previousAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    const previousXr = renderer.xr?.enabled;
    try {
      renderer.autoClear = false;
      if (renderer.xr) renderer.xr.enabled = false;
      renderer.setClearColor(_clear.setRGB(0, 0, 0), 0);
      for (const [mat, rt] of [[heightMat, heightRT], [lightMat, lightRT], [stripMat, stripRT]] as const) {
        quad.material = mat;
        renderer.setRenderTarget(rt);
        renderer.clear(true, false, false);
        renderer.render(scene, camera);
      }
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousColor, previousAlpha);
      renderer.autoClear = previousAutoClear;
      if (renderer.xr && previousXr !== undefined) renderer.xr.enabled = previousXr;
      for (const m of [heightMat, lightMat, stripMat]) m.dispose();
      quad.geometry.dispose();
      heightRT.dispose(); lightRT.dispose(); edgeTex.dispose();
    }
    if (atlas) atlas.dispose();
    atlas = stripRT;
    // a GPU suspension (resourceLifetime) disposes the atlas texture: free its framebuffer, show the fallback again and
    // bake once more on the next request
    stripRT.texture.addEventListener('dispose', () => {
      if (atlas !== stripRT) return;
      baked = false; atlas = null; stripRT.dispose();
      mesh.visible = false;
      if (fallback) fallback.visible = true;
    });
    material.map = stripRT.texture;
    material.needsUpdate = true;
    mesh.visible = true;
    if (fallback) fallback.visible = false;
    baked = true;
    stats.bakes++;
    stats.ms = Math.round(performance.now() - started);
  }

  return {
    mesh,
    get baked() { return baked; },
    stats,
    setGroundTone(ground, rock) {
      if (baked || stats.bakes > 0) return false;
      if (ground) palette.base = ground.clone();
      if (rock) palette.rock = rock.clone();
      if (ground || rock) stats.tone = 'ground';
      return !!(ground || rock);
    },
    ensureBaked(renderer) {
      if (baked) return true;
      if (!renderer) return false;
      const why = unsupported(renderer);
      if (why) { stats.unsupported = why; return false; }
      bake(renderer);
      return baked;
    },
    dispose() {
      if (atlas) { const a = atlas; atlas = null; baked = false; a.dispose(); }
      geometry.dispose();
      material.dispose();
    },
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The bake's shader sources, for the receipts (a structural check: the passes compile against the same uniforms). */
export const HORIZON_PANORAMA_SHADERS = Object.freeze({ vertex: QUAD_VERTEX, height: HEIGHT_FRAGMENT, light: LIGHT_FRAGMENT, strip: STRIP_FRAGMENT });
