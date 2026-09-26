import * as THREE from 'three';
import { getDeviceTier, getPreset } from '../engine/quality.ts';
import { createGroundPressureField, type GroundDisturbance, type GroundPressureField } from './groundPressure.ts';
import { resolveGroundReduxProfile, tallGrassQualityScale, type TallGrassBiome } from './groundRedux.ts';

// Round 73 (2026-09-25, the ground redux; owner: "add tall grass that interacts with tanks"): the tall-grass tier.
// The meadows carried a knee-high tuft carpet of alpha cards that nothing in the battle ever touched; this tier
// grows blades of grass — opaque, textureless, vertex-shaded strips in clumps of three — on a camera-centred ring of
// deterministic cells, with a second ring of single wide blades out to 120 m, and bends every blade by the
// world-anchored pressure field the hulls stamp (groundPressure.ts): a tank pushes the sward flat under its belly
// and tracks, leaves two rolled lanes behind it that stand up again over twenty seconds, and sits hull-deep in the
// grass while it does. Nothing here touches the simulation — spotting is authoritative and unchanged; the
// concealment is what the blades occlude on screen.
//
// Per-map biomes come from groundRedux.ts (density, height, colour, wind, reeds on the water margins, none on the
// arid maps); the quality preset's `tallGrass` knob scales the density live (Low a quarter, Medium half, the mobile
// presets none — the mobile tier keeps today's ground). Candidates keep off the carriageway and its shoulders, off
// water (reeds excepted, in the shallows), off the trodden village ground, off steep faces, off worked ground and
// out of every sealed footprint (buildings, fortifications, props); dirt patches and crests thin the sward, hollows
// thicken and lift it. Blades cast no shadow and sample the cascades at their root (the round-13 rule), so a swaying
// tip never flickers across a shadow edge.

interface TallGrassField {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getNormalAt?(x: number, z: number): { x: number; y: number; z: number };
  getGroundType?(x: number, z: number): 'hard' | 'medium' | 'soft';
  getWaterMaskAt?(x: number, z: number): number;
  _roadDist?(x: number, z: number): number;
  _villageMask?(x: number, z: number): number;
  _noVeg?(x: number, z: number): boolean;
  /** The raw shore wetness ramp (the mask's B channel): a strand is 0.02..0.4 above the waterline. */
  _waterWetnessAt?(x: number, z: number): number;
  /** Round 73: the baked fold term (−1 crest .. +1 hollow) the terrain vertices carry. */
  _foldAt?(x: number, z: number): number;
}

type TallGrassBlocked = (x: number, y: number, z: number, height: number, radius: number) => boolean;

type TallGrassShader = { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string };
type TallGrassMaterialHook = (shader: TallGrassShader) => void;

interface SplatNoiseSample { n1: number; n2: number; mA: number }

interface TallGrassOptions {
  seed?: number;
  mapId?: string;
  /** Overrides the map's biome (receipts, studio). */
  biome?: TallGrassBiome | null;
  blocked?: TallGrassBlocked | null;
  /** The renderer the pressure field steps on; null (receipts, mobile) leaves the sward standing. */
  renderer?: THREE.WebGLRenderer | null;
  tier?: 'mobile' | 'desktop';
  /** The terrain's CPU twin of its dirt / straw fields (terrain.ts sampleSplatNoise); null skips the thinning. */
  splatNoise?: ((x: number, z: number, out: SplatNoiseSample) => SplatNoiseSample) | null;
  /** The quality preset's density scale; defaults to the live preset's `tallGrass` (read per cell build). */
  qualityScale?: (() => number) | null;
  /** Engine hook that folds the materials into the cascaded-shadow setup (four suns otherwise). */
  setupMaterial?: ((material: THREE.MeshLambertMaterial, hook: TallGrassMaterialHook) => void) | null;
  releaseMaterial?: ((material: THREE.Material) => void) | null;
  /** Candidate admissions per update while a ring is incomplete (cold rings take TALL_GRASS.coldCandidatesPerUpdate). */
  candidatesPerUpdate?: number;
}

export interface TallGrassRingState {
  cellX: number;
  cellZ: number;
  cells: number;
  pending: number;
  count: number;
  cached: number;
  builds: number;
  publishes: number;
  truncated: number;
}

export interface TallGrassState {
  enabled: boolean;
  quality: number;
  near: TallGrassRingState;
  far: TallGrassRingState;
  pressure: boolean;
  pressureSteps: number;
}

export interface TallGrass {
  readonly group: THREE.Group;
  readonly near: THREE.InstancedMesh;
  readonly far: THREE.InstancedMesh;
  readonly pressure: GroundPressureField | null;
  update(dt: number, cameraPosition: THREE.Vector3, focus?: { x: number; z: number } | null, cameraForward?: THREE.Vector3 | null): void;
  setDisturbances(sources: readonly GroundDisturbance[]): void;
  setWindTime(seconds: number): void;
  /** Sniper scope: fade the blades inside the corridor (0 = arcade, 1 = scoped). */
  setSniperFade(fraction: number, immediate?: boolean): void;
  getState(): TallGrassState;
  dispose(): void;
}

export const TALL_GRASS = Object.freeze({
  near: Object.freeze({
    cellM: 12,
    ring: 5,          // 11 × 11 cells: the ring always covers 48 m from the camera wherever it sits in its cell
    perM2: 2.6,       // clumps per square metre at density 1 (three blades each; 3.0 on the first sheets — the vertex work
                      // of Tarkhan's 44 k clumps sat over the tier's 1 ms budget on the toggle bench)
    fade: Object.freeze([-1, 0, 38, 46] as const), // (in0, in1, out0, out1) m — a strict in-ramp (smoothstep needs edge0 < edge1)
    cap: 56000,       // Tarkhan's 1.2 × steppe filled 40 000 and dropped its ring's far cells (the first sheets)
    programKey: 'world-tall-grass-near-v1',
  }),
  far: Object.freeze({
    cellM: 24,
    ring: 6,          // 13 × 13 cells: covers 120 m
    perM2: 0.20,      // single wide blades per square metre (0.30 on the first sheet massed into a dark carpet at 30–120 m)
    fade: Object.freeze([34, 46, 104, 120] as const),
    cap: 28000,
    programKey: 'world-tall-grass-far-v2',
  }),
  /** Blade width multiplier of the far ring (one strip carries the read), the root-to-tip gradient exponents and the
   * far ring's lift: the near clump keeps a dark root; the far blade — seen from above, mostly root in screen space,
   * averaged with the ground between blades — takes its tip colour early and a third more light, so the 30–120 m
   * sward stays as light as the meadow it stands in (Monsoon's hillside massed dark on the first two sheets). */
  farWidth: 1.7,
  bladeGamma: Object.freeze({ near: 0.75, far: 0.35 } as const),
  bladeLift: Object.freeze({ near: 1.0, far: 1.3 } as const),
  /** How much darker a crushed blade stays while the bruise lasts (the lane behind the tracks). */
  crushDarken: 0.28,
  cacheCells: 480,
  // a 12 m column of near cells (~4.7 k candidates at density 1) refills in ~40 frames at this budget — ahead of a
  // hull at road speed — for a fraction of the frame's CPU; a cold ring (the first frames) takes the larger one
  candidatesPerUpdate: 120,
  coldCandidatesPerUpdate: 2400,
  progressiveCells: 12,
  /** Quads up a blade before the tip triangle: two (five vertices, three triangles) — a third segment cost 40 % more
   * triangles for a bend no 1–4 px strip can show. */
  bladeSegments: 2,
  bladesPerClump: 3,
  /** Full press bends a blade this far from vertical (rad). */
  bendRad: 1.35,
  /** Blades within this distance of the lens scale away (a blade across the camera is a green wall). */
  lensClearM: Object.freeze([0.8, 2.2] as const),
  minSlopeY: 0.80,
  roadKeepOutM: 4.6,
  roadShoulderM: 9.0,
  floats: 10, // x y z | yaw height width rnd | r g b
} as const);
const PACK = TALL_GRASS.floats;

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cellSeed(seed: number, ix: number, iz: number): number {
  let h = (seed ^ 0x7F4A7C15) >>> 0;
  h = Math.imul(h ^ (ix * 0x85EBCA6B), 0xC2B2AE35) >>> 0;
  h = Math.imul(h ^ (iz * 0x27D4EB2F), 0x165667B1) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * A clump of `blades` strips fanned around the root, each `segments` quads tall plus a tip triangle: position.x is
 * the across coordinate (−0.5..0.5 of the root width), position.y the height fraction t (the shader builds the
 * blade in world units from the instance's yaw / height / width), z the blade's own fan angle. Unit-sized; the
 * geometry never changes, the instance attribute carries every dimension.
 */
export function buildTallGrassClumpGeometry(blades: number = TALL_GRASS.bladesPerClump, segments: number = TALL_GRASS.bladeSegments): THREE.BufferGeometry {
  const perBlade = segments * 2 + 1;
  const positions = new Float32Array(blades * perBlade * 3);
  const normals = new Float32Array(blades * perBlade * 3);
  const indices: number[] = [];
  for (let b = 0; b < blades; b++) {
    const fan = (b / blades) * Math.PI * 2;
    const base = b * perBlade;
    for (let s = 0; s < segments; s++) {
      const t = s / segments;
      for (let side = 0; side < 2; side++) {
        const v = base + s * 2 + side;
        positions[v * 3] = side === 0 ? -0.5 : 0.5;
        positions[v * 3 + 1] = t;
        positions[v * 3 + 2] = fan;
        normals[v * 3] = 0; normals[v * 3 + 1] = 1; normals[v * 3 + 2] = 0;
      }
    }
    const tip = base + segments * 2;
    positions[tip * 3] = 0; positions[tip * 3 + 1] = 1; positions[tip * 3 + 2] = fan;
    normals[tip * 3] = 0; normals[tip * 3 + 1] = 1; normals[tip * 3 + 2] = 0;
    for (let s = 0; s < segments - 1; s++) {
      const a = base + s * 2, c = a + 2;
      indices.push(a, a + 1, c + 1, a, c + 1, c);
    }
    const last = base + (segments - 1) * 2;
    indices.push(last, last + 1, tip);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** The far ring's blade: one quad, two triangles, the same conventions. */
export function buildTallGrassFarGeometry(): THREE.BufferGeometry {
  return buildTallGrassClumpGeometry(1, 1);
}

function mustReplace(src: string, anchor: string, replacement: string): string {
  const out = src.replace(anchor, replacement);
  if (out === src) throw new Error(`world/tallGrass: shader anchor missing: ${anchor}`);
  return out;
}

interface SharedUniforms {
  uWindTime: { value: number };
  uCamPos: { value: THREE.Vector3 };
  uCamFwd: { value: THREE.Vector3 };
  uSniperFade: { value: number };
  uWindDir: { value: THREE.Vector2 };
  uPress: { value: THREE.Texture | null };
  uPressParams: { value: THREE.Vector4 };
  uGrassBase: { value: THREE.Vector3 };
  uGrassTip: { value: THREE.Vector3 };
}

/** The blade shader: every dimension from the instance attribute, the press from the field, the shadow at the root. */
function tallGrassHook(shared: SharedUniforms, fade: readonly [number, number, number, number], bendRad: number,
  bladeGamma: number = TALL_GRASS.bladeGamma.near, bladeLift: number = TALL_GRASS.bladeLift.near): TallGrassMaterialHook {
  return (shader) => {
    shader.uniforms.uWindTime = shared.uWindTime;
    shader.uniforms.uCamPos = shared.uCamPos;
    shader.uniforms.uCamFwd = shared.uCamFwd;
    shader.uniforms.uSniperFade = shared.uSniperFade;
    shader.uniforms.uWindDir = shared.uWindDir;
    shader.uniforms.uPress = shared.uPress;
    shader.uniforms.uPressParams = shared.uPressParams;
    shader.uniforms.uGrassBase = shared.uGrassBase;
    shader.uniforms.uGrassTip = shared.uGrassTip;
    shader.uniforms.uGrassFade = { value: new THREE.Vector4(fade[0], fade[1], fade[2], fade[3]) };
    shader.uniforms.uBend = { value: bendRad };
    shader.uniforms.uBladeGamma = { value: bladeGamma };
    shader.uniforms.uBladeLift = { value: bladeLift };
    shader.vertexShader = mustReplace(shader.vertexShader, '#include <common>', /* glsl */`#include <common>
uniform float uWindTime; uniform vec3 uCamPos; uniform vec3 uCamFwd; uniform float uSniperFade;
uniform vec2 uWindDir; uniform sampler2D uPress; uniform vec4 uPressParams; uniform vec4 uGrassFade; uniform float uBend;
attribute vec4 aBlade;
varying float vBladeT; varying float vBladeCrush;`);
    // the blade's own normal: its face turned by the yaw, leaning toward the sky so the strip never lights as a wall
    shader.vertexShader = mustReplace(shader.vertexShader, '#include <beginnormal_vertex>', /* glsl */`
      float cotYaw = aBlade.x + position.z;
      vec3 objectNormal = normalize(vec3(sin(cotYaw) * 0.55, 1.0, cos(cotYaw) * 0.55));`);
    shader.vertexShader = mustReplace(shader.vertexShader, '#include <begin_vertex>', /* glsl */`
      vec3 transformed;
      vec3 cotGrassRoot = vec3(0.0);
      {
        vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float dCam = distance(root, uCamPos);
        float fade = smoothstep(uGrassFade.x, uGrassFade.y, dCam) * (1.0 - smoothstep(uGrassFade.z, uGrassFade.w, dCam));
        fade *= smoothstep(${TALL_GRASS.lensClearM[0].toFixed(2)}, ${TALL_GRASS.lensClearM[1].toFixed(2)}, dCam);
        // sniper scope (the tuft rule): the near band and the centre cone clear so the sight picture stays clean
        float nearBand = smoothstep(12.0, 30.0, dCam);
        float dRay = length(cross(root - uCamPos, uCamFwd));
        float rayBand = 1.0 - (1.0 - smoothstep(2.6, 6.0, dRay)) * (1.0 - smoothstep(90.0, 130.0, dCam));
        fade *= mix(1.0, nearBand * rayBand, uSniperFade);
        float t = position.y;
        float yaw = cotYaw;
        float hgt = aBlade.y * fade;
        float wid = aBlade.z;
        // the press at the root: how flat, which way, how bruised
        float press = 0.0; vec2 pdir = vec2(0.0, 1.0); float crush = 0.0;
        if (uPressParams.w > 0.5) {
          vec2 off = abs(root.xz - uPressParams.yz) / uPressParams.x;
          float win = 1.0 - smoothstep(0.40, 0.47, max(off.x, off.y));
          vec4 p = texture2D(uPress, fract(root.xz / uPressParams.x));
          press = clamp(p.r * win, 0.0, 1.0);
          pdir = normalize(p.gb + vec2(1e-4, 0.0));
          crush = clamp(p.a * win, 0.0, 1.0);
        }
        // wind: a gust front travelling down the wind over the meadow, and a per-blade flutter
        float phase = root.x * 0.31 + root.z * 0.27 + aBlade.w * 6.2832;
        float gust = 0.5 + 0.5 * sin(dot(root.xz, uWindDir) * 0.06 - uWindTime * 1.4 + sin(root.z * 0.11 + uWindTime * 0.37) * 1.5);
        vec2 wind = uWindDir * ((0.05 + 0.17 * gust) * (1.0 - press * 0.85))
                  + vec2(sin(uWindTime * 2.3 + phase), cos(uWindTime * 1.9 + phase * 1.3)) * 0.025;
        // the strip across the root, narrowing to the tip; the height along an up axis the press tilts over
        vec2 across = vec2(cos(yaw), -sin(yaw));
        float taper = 1.0 - 0.72 * t;
        vec3 pos = vec3(position.x * wid * taper * across.x, 0.0, position.x * wid * taper * across.y);
        float ang = press * uBend;
        vec3 up = vec3(pdir.x * sin(ang), cos(ang), pdir.y * sin(ang));
        vec2 lean = vec2(cos(aBlade.w * 6.2832), sin(aBlade.w * 6.2832)) * 0.12;
        pos += up * (t * hgt);
        pos.xz += (lean * (1.0 - press) + wind + pdir * press * 0.35) * t * t * hgt;
        transformed = pos;
        vBladeT = t;
        vBladeCrush = crush;
      }`);
    // the round-13 rule: the cascade shadow is read at the blade's root, so a swaying tip keeps one shadow state
    shader.vertexShader = mustReplace(shader.vertexShader, '#include <shadowmap_vertex>', /* glsl */`
      #if defined( USE_SHADOWMAP )
      {
        vec4 cotGrassShadowWorld = vec4(cotGrassRoot, 1.0);
        #ifdef USE_INSTANCING
          cotGrassShadowWorld = instanceMatrix * cotGrassShadowWorld;
        #endif
        worldPosition = modelMatrix * cotGrassShadowWorld;
      }
      #endif
      #include <shadowmap_vertex>`);
    shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <common>',
      '#include <common>\nuniform vec3 uGrassBase; uniform vec3 uGrassTip; uniform float uBladeGamma; uniform float uBladeLift; varying float vBladeT; varying float vBladeCrush;');
    // both faces of a strip light the same way (no back-face flip) and the root is dark under the sward
    shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\nnormal = normalize( vNormal );\nnonPerturbedNormal = normal;');
    shader.fragmentShader = mustReplace(shader.fragmentShader, '#include <color_fragment>',
      `#include <color_fragment>\ndiffuseColor.rgb *= mix(uGrassBase, uGrassTip, pow(vBladeT, uBladeGamma)) * uBladeLift * (1.0 - ${TALL_GRASS.crushDarken.toFixed(2)} * vBladeCrush);`);
  };
}

/** The vertex-shader source the receipt pins (the press, the root-anchored shadow, the corridor). */
export function tallGrassShaderSource(): { vertexShader: string; fragmentShader: string } {
  const shared = makeSharedUniforms();
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <shadowmap_vertex>',
    fragmentShader: '#include <common>\n#include <normal_fragment_begin>\n#include <color_fragment>',
  };
  tallGrassHook(shared, TALL_GRASS.near.fade, TALL_GRASS.bendRad)(shader);
  return { vertexShader: shader.vertexShader, fragmentShader: shader.fragmentShader };
}

function makeSharedUniforms(): SharedUniforms {
  return {
    uWindTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uCamFwd: { value: new THREE.Vector3(0, 0, 1) },
    uSniperFade: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
    uPress: { value: null },
    uPressParams: { value: new THREE.Vector4(GROUND_PRESSURE_WINDOW_FALLBACK, 0, 0, 0) },
    uGrassBase: { value: new THREE.Vector3(0.08, 0.11, 0.03) },
    uGrassTip: { value: new THREE.Vector3(0.3, 0.4, 0.12) },
  };
}
const GROUND_PRESSURE_WINDOW_FALLBACK = 96;

interface Ring {
  readonly cellM: number;
  readonly ring: number;
  readonly perM2: number;
  readonly cap: number;
  readonly mesh: THREE.InstancedMesh;
  readonly blade: THREE.InstancedBufferAttribute;
  readonly cache: Map<string, Float32Array>;
  cellX: number;
  cellZ: number;
  pending: Array<[number, number]>;
  building: { ix: number; iz: number; rng: () => number; done: number; total: number; list: number[] } | null;
  published: boolean;
  completedSincePublish: number;
  count: number;
  builds: number;
  publishes: number;
  truncated: number;
  readonly salt: number;
  readonly far: boolean;
}

export function createTallGrass(field: TallGrassField, options: TallGrassOptions = {}): TallGrass {
  const seed = options.seed ?? 2006;
  const biome = options.biome === undefined ? resolveGroundReduxProfile(options.mapId).grass : options.biome;
  const blocked = options.blocked ?? null;
  const tier = options.tier ?? getDeviceTier();
  // `?tallgrass=off` and `?ground=legacy` (the same-build A/B the round's captures compare against) keep the tier off
  const queryOff = typeof location !== 'undefined' && /[?&](tallgrass=off|ground=legacy)(&|$)/.test(location.search ?? '');
  const qualityScale = options.qualityScale ?? ((): number => (queryOff ? 0 : tallGrassQualityScale(getPreset())));
  const splatNoise = options.splatNoise ?? null;
  const group = new THREE.Group();
  group.name = 'tall-grass';
  const shared = makeSharedUniforms();
  if (biome) {
    shared.uWindDir.value.set(biome.windDir[0], biome.windDir[1]).normalize();
    shared.uGrassBase.value.set(biome.base[0], biome.base[1], biome.base[2]);
    shared.uGrassTip.value.set(biome.tip[0], biome.tip[1], biome.tip[2]);
  }
  const pressure = biome && tier !== 'mobile' ? createGroundPressureField(options.renderer, { tier }) : null;
  if (pressure) { shared.uPress = pressure.stateUniform; shared.uPressParams.value = pressure.params; }
  const materials: THREE.MeshLambertMaterial[] = [];
  function makeMaterial(fade: readonly [number, number, number, number], programKey: string, far: boolean): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const hook = tallGrassHook(shared, fade, TALL_GRASS.bendRad,
      far ? TALL_GRASS.bladeGamma.far : TALL_GRASS.bladeGamma.near, far ? TALL_GRASS.bladeLift.far : TALL_GRASS.bladeLift.near);
    if (options.setupMaterial) options.setupMaterial(material, hook);
    else material.onBeforeCompile = hook as unknown as THREE.MeshLambertMaterial['onBeforeCompile'];
    material.customProgramCacheKey = () => programKey;
    materials.push(material);
    return material;
  }
  const geometries = [buildTallGrassClumpGeometry(), buildTallGrassFarGeometry()];
  function makeRing(spec: typeof TALL_GRASS.near | typeof TALL_GRASS.far, geometry: THREE.BufferGeometry, far: boolean, salt: number): Ring {
    const material = makeMaterial(spec.fade, spec.programKey, far);
    const mesh = new THREE.InstancedMesh(geometry, material, spec.cap);
    mesh.name = far ? 'tall-grass-far' : 'tall-grass-near';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // translation-only matrices: every other cell of the identity is written once
    const matrices = mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < spec.cap; i++) { matrices[i * 16] = 1; matrices[i * 16 + 5] = 1; matrices[i * 16 + 10] = 1; matrices[i * 16 + 15] = 1; }
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    const blade = new THREE.InstancedBufferAttribute(new Float32Array(spec.cap * 4), 4);
    blade.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aBlade', blade);
    group.add(mesh);
    return {
      cellM: spec.cellM, ring: spec.ring, perM2: spec.perM2, cap: spec.cap, mesh, blade, cache: new Map(),
      cellX: 0x7fffffff, cellZ: 0x7fffffff, pending: [], building: null, published: false, completedSincePublish: 0,
      count: 0, builds: 0, publishes: 0, truncated: 0, salt, far,
    };
  }
  const near = makeRing(TALL_GRASS.near, geometries[0], false, 0x1a2b);
  const far = makeRing(TALL_GRASS.far, geometries[1], true, 0x3c4d);
  const enabled = !!biome && tier !== 'mobile';
  group.visible = enabled;

  const heightAt = (x: number, z: number): number =>
    field.getHeightAtFast ? field.getHeightAtFast(x, z) : field.getHeightAt(x, z);
  const _splat: SplatNoiseSample = { n1: 0, n2: 0, mA: 0 };
  let quality = -1;
  let generation = 0;
  let disposed = false;
  let sniperTarget = 0;

  function cellKey(ix: number, iz: number): string { return `${generation}:${ix},${iz}`; }

  /** One candidate; appends 10 floats to the list when the sward grows here. The biome density and the quality
   * knob size the candidate count (beginCell); the admission only thins. */
  function admit(ring: Ring, list: number[], x: number, z: number, rng: () => number): void {
    const b = biome!;
    const roll = rng(), yawR = rng(), hR = rng(), wR = rng(), tintR = rng(), rnd = rng();
    if (Math.max(Math.abs(x), Math.abs(z)) > 474) return;
    let keep = 1;
    const roadD = field._roadDist ? field._roadDist(x, z) : 1e9;
    if (roadD < TALL_GRASS.roadKeepOutM) return;
    if (roadD < TALL_GRASS.roadShoulderM) keep *= (roadD - TALL_GRASS.roadKeepOutM) / (TALL_GRASS.roadShoulderM - TALL_GRASS.roadKeepOutM);
    if (field._noVeg && field._noVeg(x, z)) return;
    const ground = field.getGroundType ? field.getGroundType(x, z) : 'medium';
    if (ground === 'hard') return;
    const water = field.getWaterMaskAt ? field.getWaterMaskAt(x, z) : 0;
    let heightScale = 1;
    if (b.kind === 'reed') {
      if (water > 0.6) return;
      if (water > 0.04) { keep *= b.waterBand; heightScale = 1.15; }
      else if (ground === 'soft') { keep *= 0.5; }
    } else {
      if (water > 0.03) return;
      if (ground === 'soft') keep *= 0.35;
      // marram: dense on the backshore (the strand's own wetness ramp, above the waterline), sparse inland
      if (b.kind === 'dune' && field._waterWetnessAt) keep *= 0.4 + 1.6 * smoothstep(0.03, 0.30, field._waterWetnessAt(x, z));
    }
    if (field._villageMask && field._villageMask(x, z) > 0.35) keep *= b.kind === 'verge' ? 0.4 : 0.12;
    if (splatNoise) {
      const sn = splatNoise(x, z, _splat);
      const dirtPatch = smoothstep(0.55, 0.80, sn.n2 + (sn.n1 - 0.5) * 0.45);
      keep *= 1 - dirtPatch * 0.85;
      keep *= 0.55 + 0.9 * smoothstep(0.30, 0.75, sn.n1);
    }
    let hollow = 0, crest = 0;
    if (field._foldAt) {
      const f = field._foldAt(x, z);
      hollow = smoothstep(0.1, 0.6, f); crest = smoothstep(0.1, 0.6, -f);
      keep *= (1 + 0.3 * hollow) * (1 - 0.3 * crest);
      heightScale *= (1 + 0.25 * hollow) * (1 - 0.15 * crest);
    }
    if (roll > keep) return;
    if (field.getNormalAt) {
      const n = field.getNormalAt(x, z);
      if (n.y < TALL_GRASS.minSlopeY) return;
    }
    const y = heightAt(x, z);
    const heightM = Math.min(1.9, b.heightM * heightScale * (1 + b.heightVar * (2 * hR - 1)));
    if (blocked && blocked(x, y, z, heightM, 0.12)) return;
    const widthM = b.widthM * (ring.far ? TALL_GRASS.farWidth : 1) * (0.8 + 0.4 * wR);
    // the tint: a per-clump luminance jitter, straw on the terrain's dry patches, deeper green in the hollows
    const dry = splatNoise ? smoothstep(0.55, 0.85, _splat.mA) : 0;
    const lum = 0.82 + 0.36 * tintR;
    const r = (b.tip[0] * (1 - dry) + b.dry[0] * dry) / b.tip[0];
    const g = (b.tip[1] * (1 - dry) + b.dry[1] * dry) / b.tip[1];
    const bl = (b.tip[2] * (1 - dry) + b.dry[2] * dry) / b.tip[2];
    const moist = 1 - 0.12 * hollow;
    list.push(x, y, z, yawR * Math.PI * 2, heightM, widthM, rnd,
      Math.min(1.6, r * lum * moist), Math.min(1.6, g * lum), Math.min(1.6, bl * lum * moist));
  }

  function beginCell(ring: Ring, ix: number, iz: number, density: number): void {
    const candidates = Math.round(ring.perM2 * ring.cellM * ring.cellM * Math.min(density, 1.3));
    ring.building = { ix, iz, rng: mulberry32(cellSeed(seed ^ ring.salt, ix, iz)), done: 0, total: candidates, list: [] };
  }

  /** Advances the cell under construction by up to `budget` candidates; returns the candidates consumed. */
  function advanceCell(ring: Ring, budget: number): number {
    const job = ring.building!;
    const n = Math.min(budget, job.total - job.done);
    const x0 = job.ix * ring.cellM, z0 = job.iz * ring.cellM;
    for (let i = 0; i < n; i++) {
      admit(ring, job.list, x0 + job.rng() * ring.cellM, z0 + job.rng() * ring.cellM, job.rng);
    }
    job.done += n;
    if (job.done >= job.total) {
      remember(ring, job.ix, job.iz, Float32Array.from(job.list));
      ring.building = null;
      ring.builds++;
      ring.completedSincePublish++;
    }
    return n;
  }

  function cellData(ring: Ring, ix: number, iz: number): Float32Array | null {
    const key = cellKey(ix, iz);
    const hit = ring.cache.get(key);
    if (hit) { ring.cache.delete(key); ring.cache.set(key, hit); return hit; }
    return null;
  }

  function remember(ring: Ring, ix: number, iz: number, data: Float32Array): void {
    ring.cache.set(cellKey(ix, iz), data);
    while (ring.cache.size > TALL_GRASS.cacheCells) {
      const oldest = ring.cache.keys().next().value as string;
      ring.cache.delete(oldest);
    }
  }

  function publish(ring: Ring): void {
    const matrices = ring.mesh.instanceMatrix.array as Float32Array;
    const colors = ring.mesh.instanceColor!.array as Float32Array;
    const blades = ring.blade.array as Float32Array;
    let total = 0, truncated = 0;
    // nearest cells first so a full buffer drops the far edge, never the ground under the camera
    const cells: Array<[number, number, number]> = [];
    for (let dz = -ring.ring; dz <= ring.ring; dz++) for (let dx = -ring.ring; dx <= ring.ring; dx++) cells.push([dx, dz, dx * dx + dz * dz]);
    cells.sort((a, b) => a[2] - b[2]);
    for (const [dx, dz] of cells) {
      const data = cellData(ring, ring.cellX + dx, ring.cellZ + dz);
      if (!data) continue;
      for (let at = 0; at + PACK <= data.length; at += PACK) {
        if (total >= ring.cap) { truncated++; continue; }
        const i = total++;
        matrices[i * 16 + 12] = data[at]; matrices[i * 16 + 13] = data[at + 1]; matrices[i * 16 + 14] = data[at + 2];
        blades[i * 4] = data[at + 3]; blades[i * 4 + 1] = data[at + 4]; blades[i * 4 + 2] = data[at + 5]; blades[i * 4 + 3] = data[at + 6];
        colors[i * 3] = data[at + 7]; colors[i * 3 + 1] = data[at + 8]; colors[i * 3 + 2] = data[at + 9];
      }
    }
    ring.mesh.count = total;
    ring.count = total;
    ring.truncated = truncated;
    ring.mesh.instanceMatrix.clearUpdateRanges();
    ring.mesh.instanceMatrix.addUpdateRange(0, total * 16);
    ring.mesh.instanceMatrix.needsUpdate = true;
    ring.mesh.instanceColor!.clearUpdateRanges();
    ring.mesh.instanceColor!.addUpdateRange(0, total * 3);
    ring.mesh.instanceColor!.needsUpdate = true;
    ring.blade.clearUpdateRanges();
    ring.blade.addUpdateRange(0, total * 4);
    ring.blade.needsUpdate = true;
    ring.publishes++;
    ring.published = true;
    ring.completedSincePublish = 0;
  }

  function recentre(ring: Ring, ix: number, iz: number): void {
    ring.cellX = ix; ring.cellZ = iz;
    ring.pending = [];
    for (let dz = -ring.ring; dz <= ring.ring; dz++) {
      for (let dx = -ring.ring; dx <= ring.ring; dx++) {
        if (!cellData(ring, ix + dx, iz + dz)) ring.pending.push([ix + dx, iz + dz]);
      }
    }
    ring.pending.sort((a, b) => (Math.abs(a[0] - ix) + Math.abs(a[1] - iz)) - (Math.abs(b[0] - ix) + Math.abs(b[1] - iz)));
    ring.published = false;
  }

  function updateRing(ring: Ring, cameraPosition: { x: number; z: number }, density: number, budget: number): void {
    const ix = Math.floor(cameraPosition.x / ring.cellM);
    const iz = Math.floor(cameraPosition.z / ring.cellM);
    if (ix !== ring.cellX || iz !== ring.cellZ) recentre(ring, ix, iz);
    let left = budget;
    while (left > 0) {
      if (!ring.building) {
        // a cell finished while the ring moved is still cached; drop the pending entries the cache now serves
        while (ring.pending.length && cellData(ring, ring.pending[0][0], ring.pending[0][1])) ring.pending.shift();
        if (!ring.pending.length) break;
        const [cx, cz] = ring.pending.shift()!;
        beginCell(ring, cx, cz, density);
      }
      left -= advanceCell(ring, left);
    }
    const complete = !ring.pending.length && !ring.building;
    if ((complete && !ring.published) || (!ring.published && ring.completedSincePublish >= TALL_GRASS.progressiveCells)) {
      publish(ring);
      if (!complete) ring.published = false;
    }
  }

  function update(dt: number, cameraPosition: THREE.Vector3, focus: { x: number; z: number } | null = null, cameraForward: THREE.Vector3 | null = null): void {
    if (disposed || !enabled) return;
    shared.uWindTime.value += dt;
    shared.uCamPos.value.copy(cameraPosition);
    if (cameraForward) shared.uCamFwd.value.copy(cameraForward);
    shared.uSniperFade.value += (sniperTarget - shared.uSniperFade.value) * (1 - Math.exp(-(dt || 0) / 0.08));
    const q = qualityScale();
    if (q !== quality) {
      // a new density invalidates every cached cell (the generation is part of the key) and re-seeds the rings
      quality = q; generation++;
      for (const ring of [near, far]) { ring.cache.clear(); ring.building = null; ring.cellX = 0x7fffffff; ring.cellZ = 0x7fffffff; }
    }
    if (quality <= 0) {
      if (near.count || far.count) { near.mesh.count = 0; far.mesh.count = 0; near.count = 0; far.count = 0; }
      return;
    }
    const density = biome!.density * quality;
    const cold = !near.published || !far.published;
    const budget = options.candidatesPerUpdate ?? (cold ? TALL_GRASS.coldCandidatesPerUpdate : TALL_GRASS.candidatesPerUpdate);
    updateRing(near, cameraPosition, density, budget);
    updateRing(far, cameraPosition, density, Math.max(1, Math.round(budget * 0.5)));
    if (pressure) {
      const anchor = focus ?? cameraPosition;
      pressure.step(dt, anchor.x, anchor.z);
    }
  }

  function getState(): TallGrassState {
    const ringState = (ring: Ring): TallGrassRingState => ({
      cellX: ring.cellX, cellZ: ring.cellZ, cells: (ring.ring * 2 + 1) ** 2, pending: ring.pending.length + (ring.building ? 1 : 0),
      count: ring.count, cached: ring.cache.size, builds: ring.builds, publishes: ring.publishes, truncated: ring.truncated,
    });
    return { enabled, quality, near: ringState(near), far: ringState(far), pressure: !!pressure, pressureSteps: pressure?.steps ?? 0 };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    pressure?.dispose();
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) { options.releaseMaterial?.(material); material.dispose(); }
    near.mesh.dispose(); far.mesh.dispose();
    near.cache.clear(); far.cache.clear();
    group.removeFromParent();
  }

  return {
    group,
    near: near.mesh,
    far: far.mesh,
    pressure,
    update,
    setDisturbances(sources) { pressure?.setDisturbances(sources); },
    setWindTime(seconds) { shared.uWindTime.value = seconds; },
    setSniperFade(fraction, immediate = false) {
      sniperTarget = Math.min(1, Math.max(0, fraction));
      if (immediate) shared.uSniperFade.value = sniperTarget;
    },
    getState,
    dispose,
  };
}
