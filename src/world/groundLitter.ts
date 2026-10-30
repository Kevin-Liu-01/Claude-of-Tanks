import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getDeviceTier, presetLightWorld } from '../engine/quality.ts';
import { createCraterFollower, followCraters, type GroundCoverCraters } from './groundCoverCraters.ts';

// environment density pass (2026-09-12): the ground litter tier. The maps read
// bare because nothing smaller than a bush ever sat on the ground — the pebble
// detail lived only in the dirt texture. This strews stones, clods and timber
// splinters under the camera: a camera-centred ring of deterministic 16 m
// cells (±40 m), three instanced pools, receiving shadow but casting none,
// scaled out in the vertex shader before the ring edge so nothing pops.
// Candidates keep off the carriageway (the road shader owns its grit), off
// water and soft ground, off steep faces and out of every sealed building
// footprint; road shoulders carry extra gravel spill.

interface GroundLitterField {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getNormalAt?(x: number, z: number): { x: number; y: number; z: number };
  getGroundType?(x: number, z: number): 'hard' | 'medium' | 'soft';
  _roadDist?(x: number, z: number): number;
  _noVeg?(x: number, z: number): boolean;
  _railBerth?(x: number, z: number): boolean; // the landmarks lane: a 'clearance' rail spur's berth (railSpurs.ts)
  getWaterMaskAt?(x: number, z: number): number;
  /** Ground lane (2026-10-03): the canopy's cover (0..1, terrain applyWoodsMask) — fallen wood lies under the stands. */
  _woodsAt?(x: number, z: number): number;
}

export interface GroundLitterConfig {
  /** Overall multiplier; 0 disables the tier. */
  density?: number;
  /** Relative pool mix. */
  stones?: number;
  clods?: number;
  splinters?: number;
  /** Gravel spill on road shoulders, 0..1. */
  shoulders?: number;
  /** Stone and soil tints (linear rgb). */
  stoneTint?: readonly [number, number, number];
  soilTint?: readonly [number, number, number];
  /**
   * (props lane A, #19, 2026-10-14) what lies under the stands: a fallen stick (the default), a pine cone under the
   * conifers, a fallen leaf under autumn's broadleaves; and its tint (linear rgb; default the soil's)
   */
  splinterForm?: 'branch' | 'cone' | 'leaf';
  splinterTint?: readonly [number, number, number] | null;
  /**
   * (#19) what the stones are: a field pebble (the default), a brick bat on the shelled towns, an angular clast on the
   * regolith; and a second tint a share of them take (a town's brick among its concrete and grit)
   */
  stoneForm?: 'pebble' | 'brick' | 'clast';
  stoneTintAlt?: readonly [number, number, number] | null;
  stoneAltShare?: number;
}

type GroundLitterBlocked =
  (x: number, y: number, z: number, height: number, radius: number) => boolean;

type GroundLitterMaterialHook = (shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string }) => void;

interface GroundLitterOptions {
  seed?: number;
  config?: GroundLitterConfig | null;
  blocked?: GroundLitterBlocked | null;
  /** Cells built per update call while a ring is incomplete. */
  cellsPerUpdate?: number;
  /**
   * Engine hook that folds the material into the cascaded-shadow setup. A
   * lit material outside it is struck by every cascade light at once (four
   * suns) and renders as white specks — the first litter pass did exactly that.
   */
  setupMaterial?: ((material: THREE.MeshStandardMaterial, hook: GroundLitterMaterialHook) => void) | null;
  releaseMaterial?: ((material: THREE.Material) => void) | null;
  /**
   * (rock round 2, 2026-10-11, the map-revival lane; gauntlet wave 415: "soil, tufts and rubble at its foot") the
   * boulders' feet (props.ts group.userData.rockFeet: centre and mean radius): each sheds a few chips of its own stone
   * round its foot, most on its downhill side, in the stone pool under `rockChipTint` (linear rgb, the boulders' mean).
   */
  rockFeet?: ReadonlyArray<{ x: number; z: number; r: number }> | null;
  rockChipTint?: readonly [number, number, number] | null;
}

interface GroundLitterState {
  cellX: number;
  cellZ: number;
  cells: number;
  pending: number;
  counts: readonly [number, number, number];
  cached: number;
  builds: number;
  publishes: number;
  /** (local-fps-265, diagnostics) The nearest cell still to build, metres from the last update's camera in plan (Infinity
   *  when none): a cell nearer than GROUND_LITTER.fadeOutM is a hole on screen. */
  nearestPendingM: number;
}

export interface GroundLitter {
  readonly group: THREE.Group;
  readonly meshes: readonly [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh];
  update(cameraPosition: { x: number; z: number }): void;
  getState(): GroundLitterState;
  /** Ground lane (crater-render-spec §C): a crater's cleared bowl takes no litter, the rest lies on base + offsetAt
   * (the ring republishes from its base cells when a stamp reaches it; map.ts calls this once a frame). */
  followCraters(law: GroundCoverCraters): void;
  dispose(): void;
}

export const GROUND_LITTER = Object.freeze({
  cellM: 16,
  ring: 2,
  // 2026-09-14 environment richness: desktop tiers seed 40 % more litter candidates per cell
  // (150 -> 210); the mobile tier keeps 150. The pool is sized for the desktop count; the tier
  // is read per cell build because it resolves after module evaluation.
  candidatesPerCell: 210,
  mobileCandidatesPerCell: 150,
  cacheCells: 121,
  // ground lane (2026-10-03, the gauntlet's wave 4: "evenly spaced pebble dots" on three maps): the stones are near
  // detail — they shrink away from 18 m and are gone by 26 m, inside the ring (cellM * ring = 32 m)
  fadeInM: 18,
  fadeOutM: 26,
  /**
   * (local-fps-265) A live update's wall-clock cap (ms): cells are built while it lasts, one at least. A step across a
   * cell boundary lists a new edge column of five cells 32-48 m out, past the 26 m fade, and built them all in one update
   * (~2.5-2.9 ms, about one frame a second while driving: the world's bursts, local-fps-265's world split). Only a cell
   * inside the ring's edge to build (the first fill, a camera that jumped) takes the cold budget (cellsPerUpdate) at once.
   */
  liveUpdateMs: 0.6,
  minSlopeY: 0.86,
  roadCoreM: 3.2,
  shoulderM: 7.5,
  programKey: 'world-ground-litter-v1',
  floats: 12, // x y z | qx qy qz qw | sx sy sz | r g b -> packed as 13 below
} as const);
const PACK = 13; // x y z qx qy qz qw sx sy sz r g b
const CELLS = (GROUND_LITTER.ring * 2 + 1) ** 2;
const CAP = CELLS * GROUND_LITTER.candidatesPerCell;

const DEFAULTS: Required<GroundLitterConfig> = {
  density: 1,
  stones: 1,
  clods: 0.55,
  splinters: 0.45,
  shoulders: 1,
  // field stone sits darker than sun-dried dirt. (The first passes rendered
  // white specks at any tint: the material was outside the cascaded-shadow
  // setup, so all four cascade lights struck it at once — see setupMaterial.)
  // ground lane (2026-10-03, the gauntlet: "evenly sprinkled blue pebbles"): a soil-coated field stone, warm and at the
  // dirt's own value (was a neutral 0.20/0.19/0.17 the sky's blue fill turned pale blue, a step brighter than the turf)
  stoneTint: [0.135, 0.122, 0.104],
  soilTint: [0.17, 0.13, 0.09],
  splinterForm: 'branch',
  splinterTint: null,
  stoneForm: 'pebble',
  stoneTintAlt: null,
  stoneAltShare: 0,
};

/**
 * Per-map tuning: snow keeps a few dark stones, arid ground is all stone,
 * towns are swept grey grit, forests carry splinters, wet ground clods; the
 * rest run the defaults. A map's `vegetation.litter` overrides this table.
 */
const LITTER_PROFILES: Readonly<Record<string, GroundLitterConfig>> = Object.freeze({
  // ground lane (2026-10-03, the gauntlet: "dark pebble dots" across the winter snow): snow buries the field stones —
  // a few on the snow maps, not a scatter of dark dots
  // (wave 4 on Winter: "evenly spaced black pebble dots" — fewer still, and a weathered grey, not black)
  winter: { density: 0.06, clods: 0, splinters: 0.25, stoneTint: [0.13, 0.13, 0.14], splinterForm: 'cone', splinterTint: [0.16, 0.1, 0.06] },
  whiteout: { density: 0.05, clods: 0, splinters: 0.1, stoneTint: [0.13, 0.13, 0.14] },
  alpine: { density: 0.4, clods: 0.15, splinters: 0.35, stoneTint: [0.13, 0.127, 0.123], splinterForm: 'cone', splinterTint: [0.16, 0.1, 0.06] },
  desert: { density: 1.25, clods: 0.25, splinters: 0, stoneTint: [0.20, 0.17, 0.13] },
  oasis: { density: 1.1, clods: 0.2, splinters: 0.05, stoneTint: [0.19, 0.165, 0.125] },
  // (wave 4 on Redrock: "grey pebbles on an orange plane" — its own red sandstone, read as the floor's grain)
  badlands: { density: 1.2, clods: 0.3, splinters: 0, stoneTint: [0.20, 0.115, 0.075] },
  copper_mesa: { density: 1.15, clods: 0.3, splinters: 0.05, stoneTint: [0.17, 0.13, 0.10] },
  titan_gorge: { density: 1.1, clods: 0.2, splinters: 0, stoneTint: [0.15, 0.145, 0.135] },
  caldera: { density: 1.0, clods: 0.2, splinters: 0, stoneTint: [0.09, 0.085, 0.085] },
  // (Shanghai's grey brick, a red one among them)
  blackglass: { density: 0.9, clods: 0.1, splinters: 0.1, stoneTint: [0.10, 0.105, 0.11], stoneForm: 'brick', stoneTintAlt: [0.17, 0.07, 0.05], stoneAltShare: 0.3 },
  // (#19) the regolith: angular clasts, no soil clods, no timber — Olympus Basin's rust, the lunar grey
  mars: { density: 1.0, clods: 0, splinters: 0, stoneForm: 'clast', stoneTint: [0.2, 0.095, 0.055] },
  // (the Earthrise 228 rebuild, round 2; the blind critics at tank height: "an empty rolling foreground", "a large flat,
  // featureless foreground") the regolith strewn as the Apollo crews photographed it: clasts of every size, the tier's full
  // budget (1.3, was 0.9), the gardened ones the regolith's grey and a third the paler grey of fresh-broken breccia
  moon: { density: 1.3, clods: 0, splinters: 0, stoneForm: 'clast', stoneTint: [0.12, 0.118, 0.114], stoneTintAlt: [0.2, 0.197, 0.19], stoneAltShare: 0.33 },
  // (#19) the shelled towns' rubble: brick bats among the grey grit and concrete — Steinburg's red brick, Sarajevo's,
  // the Ruhr's dark engineering brick among its slag
  urban: { density: 0.85, clods: 0.15, splinters: 0.2, stoneTint: [0.15, 0.148, 0.14], stoneForm: 'brick', stoneTintAlt: [0.2, 0.075, 0.05], stoneAltShare: 0.55 },
  ruinspires: { density: 0.95, clods: 0.1, splinters: 0.15, stoneTint: [0.155, 0.15, 0.14], stoneForm: 'brick', stoneTintAlt: [0.19, 0.08, 0.055], stoneAltShare: 0.5 },
  // (2026-10-07, Ironworks round 4, wave 223: "flat pebble decals" — grey field stones pale against the works' black slag)
  // a works' litter is clinker: fewer lumps, at the slag's own dark grey, no clods of soil (#19's engineering brick among it)
  foundry: { density: 0.6, clods: 0, splinters: 0.2, stoneTint: [0.072, 0.07, 0.068], stoneForm: 'brick', stoneTintAlt: [0.14, 0.055, 0.04], stoneAltShare: 0.45 },
  railyard: { density: 1.0, clods: 0.2, splinters: 0.3, stoneTint: [0.13, 0.127, 0.122] },
  skybridge: { density: 0.9, clods: 0.2, splinters: 0.1, stoneTint: [0.145, 0.14, 0.138] },
  airfield: { density: 0.8, clods: 0.3, splinters: 0.2 },
  monsoon: { density: 1.1, stones: 0.7, clods: 0.6, splinters: 0.9 },
  // (#19) the longleaf pine's cones under its stands; Normandy's fallen leaves in October
  longleaf: { density: 1.1, stones: 0.7, splinters: 0.9, splinterForm: 'cone', splinterTint: [0.2, 0.12, 0.07] },
  autumn: { density: 1.1, stones: 0.7, splinters: 0.9, splinterForm: 'leaf', splinterTint: [0.3, 0.13, 0.04] },
  orchard: { splinters: 0.7 },
  delta: { density: 0.9, stones: 0.6, clods: 0.7, splinters: 0.7 },
  mangrove: { density: 0.9, stones: 0.6, clods: 0.7, splinters: 0.7 },
  polders: { density: 0.8 },
  // (2026-10-07, the map-revival lane; gauntlet wave 184: "black pebble-dot decals") the Léon's granite clasts in the
  // turf: fewer, and the granite's grey as pale as the stone-dark law allows (the limestone's dark warm tint read black on
  // the sward)
  coastal: { stones: 0.7, splinters: 0.3, stoneTint: [0.24, 0.235, 0.22] },
  saltwind: { stones: 1.1, splinters: 0.3, stoneTint: [0.165, 0.152, 0.132] },
});

export function groundLitterProfile(mapId: string): GroundLitterConfig {
  return { ...(LITTER_PROFILES[mapId] ?? {}) };
}

export function groundLitterProfileIds(): string[] {
  return Object.keys(LITTER_PROFILES);
}

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
  let h = (seed ^ 0x9E3779B9) >>> 0;
  h = Math.imul(h ^ (ix * 0x85EBCA6B), 0xC2B2AE35) >>> 0;
  h = Math.imul(h ^ (iz * 0x27D4EB2F), 0x165667B1) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Ground lane (2026-10-03, the gauntlet: "pastel pebble dots", "grey pebble dots" strewn at uniform spacing): stones lie
 * in patches — a wash, a worn spot, the foot of a bank — with bare stretches between. A value noise on a 7 m lattice
 * (0..1, smooth) the candidates' admission follows.
 */
function litterPatch(x: number, z: number, seed: number): number {
  const fx = x / 9, fz = z / 9;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const h = (a: number, b: number): number => (cellSeed(seed ^ 0x5BD1E995, a, b) & 0xffff) / 65535;
  const a = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * sx;
  const b = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * sx;
  return a + (b - a) * sz;
}

export function resolveGroundLitterConfig(config?: GroundLitterConfig | null): Required<GroundLitterConfig> {
  const merged = { ...DEFAULTS, ...(config ?? {}) };
  for (const key of ['density', 'stones', 'clods', 'splinters', 'shoulders'] as const) {
    merged[key] = Math.max(0, Number.isFinite(merged[key]) ? merged[key] : DEFAULTS[key]);
  }
  merged.shoulders = Math.min(1, merged.shoulders);
  return merged;
}

/**
 * Ground lane (2026-10-03, the gauntlet: "a faceted low-poly boulder", "thin brown stick props"): a field stone is a
 * rounded, lopsided pebble — the twelve corners of the icosahedron welded, pushed in and out by a fixed hash and
 * smooth-shaded — and a fallen stick is a crooked branch: a butt, a bend and a side twig, not a straight dowel.
 */
function makeStone(): THREE.BufferGeometry {
  const raw = new THREE.IcosahedronGeometry(0.075, 0);
  raw.deleteAttribute('normal');
  raw.deleteAttribute('uv');
  const stone = mergeVertices(raw);
  raw.dispose();
  const position = stone.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    const h = Math.sin(i * 12.9898 + 4.1) * 43758.5453;
    const k = 0.80 + 0.36 * (h - Math.floor(h));
    position.setXYZ(i, position.getX(i) * k, position.getY(i) * k * 0.92, position.getZ(i) * k);
  }
  stone.computeVertexNormals();
  return stone;
}
function makeBranch(): THREE.BufferGeometry {
  // (a cylinder turned onto +X has its radiusTop at -X)
  const butt = new THREE.CylinderGeometry(0.026, 0.020, 0.30, 5);
  butt.rotateZ(Math.PI / 2); butt.translate(-0.13, 0, 0);
  const tip = new THREE.CylinderGeometry(0.020, 0.012, 0.27, 5);
  tip.rotateZ(Math.PI / 2); tip.translate(0.135, 0, 0); tip.rotateZ(0.05); tip.rotateY(0.30); tip.translate(0.02, 0, 0);
  const twig = new THREE.CylinderGeometry(0.009, 0.005, 0.15, 4);
  twig.rotateZ(Math.PI / 2); twig.translate(0.075, 0, 0); twig.rotateY(-0.75); twig.translate(-0.10, 0, 0);
  const branch = mergeGeometries([butt, tip, twig])!;
  for (const g of [butt, tip, twig]) g.dispose();
  branch.computeVertexNormals();
  return branch;
}
/** (#19) A pine cone: a spindle of scales, its bracts staggered round it, lying along +X. */
function makeCone(): THREE.BufferGeometry {
  const pts = [[0, -0.05], [0.012, -0.048], [0.026, -0.03], [0.03, -0.005], [0.027, 0.02], [0.016, 0.042], [0, 0.05]].map(([r, y]) => new THREE.Vector2(r, y));
  const cone = new THREE.LatheGeometry(pts, 7);
  // the scales: every other ring pushed out a little and turned half a step
  const p = cone.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const ring = Math.round((p.getY(i) + 0.05) / 0.0167), k = ring % 2 ? 1.18 : 0.92;
    p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
  }
  cone.rotateZ(Math.PI / 2);
  cone.translate(0, 0.02, 0);
  cone.deleteAttribute('uv');
  cone.computeVertexNormals();
  return cone;
}
/** (#19) A fallen leaf: a broad blade, its two halves folded a little along the midrib, curled at its tip. */
function makeLeaf(): THREE.BufferGeometry {
  const v = [[0, 0, -0.06], [0.035, 0.008, -0.025], [0.04, 0.01, 0.02], [0, 0.018, 0.065], [-0.04, 0.01, 0.02], [-0.035, 0.008, -0.025], [0, 0.004, 0]];
  const idx = [6, 1, 0, 6, 2, 1, 6, 3, 2, 6, 4, 3, 6, 5, 4, 6, 0, 5];
  const pos = new Float32Array(idx.length * 3);
  idx.forEach((i, k) => pos.set(v[i], k * 3));
  // both faces (a leaf turned over shows its underside)
  const back = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) for (const [a, b] of [[0, 0], [1, 2], [2, 1]]) back.set(pos.subarray((t + a) * 3, (t + a) * 3 + 3), (t + b) * 3);
  const g = new THREE.BufferGeometry();
  const all = new Float32Array(pos.length * 2); all.set(pos); all.set(back, pos.length);
  for (let i = pos.length; i < all.length; i += 3) all[i + 1] -= 0.002;
  g.setAttribute('position', new THREE.BufferAttribute(all, 3));
  g.computeVertexNormals();
  return g;
}
/** A fixed hash of a vertex index (the pieces are one geometry each: their variety is the instances'). */
function lump(i: number, salt: number): number {
  const h = Math.sin(i * 12.9898 + salt) * 43758.5453;
  return h - Math.floor(h);
}
/** (#19) A clod of soil: a lumpy, flattened body (was a raw dodecahedron's twelve flat pentagons), smooth-shaded. */
function makeClod(): THREE.BufferGeometry {
  const raw = new THREE.IcosahedronGeometry(0.06, 1);
  raw.deleteAttribute('normal'); raw.deleteAttribute('uv');
  const clod = mergeVertices(raw);
  raw.dispose();
  const p = clod.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 0.74 + 0.44 * lump(i, 7.3);
    p.setXYZ(i, p.getX(i) * k * 1.12, p.getY(i) * k * 0.68, p.getZ(i) * k);
  }
  clod.computeVertexNormals();
  return clod;
}
/** (#19) A brick bat: half a brick, its arrises knocked off unevenly, flat-faced. */
function makeBrick(): THREE.BufferGeometry {
  const raw = new THREE.BoxGeometry(0.105, 0.055, 0.08);
  raw.deleteAttribute('normal'); raw.deleteAttribute('uv');
  const brick = mergeVertices(raw);
  raw.dispose();
  const p = brick.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    // the broken end slants (its corners snapped off at different lengths), a top arris knocked down, every corner
    // chipped a little: half a brick, not a clean box
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const snapped = x > 0 ? 0.45 + 0.55 * lump(i, 3.1) : 1 - 0.12 * lump(i, 3.1);
    const knocked = y > 0 && z > 0 && x < 0 ? 0.35 : 0.88 + 0.12 * lump(i, 5.7);
    p.setXYZ(i, x * snapped, y * knocked, z * (1 - 0.18 * lump(i, 9.2)));
  }
  const flat = brick.toNonIndexed();
  brick.dispose();
  flat.computeVertexNormals();
  return flat;
}
/** (#19) An angular clast of the regolith: a broken stone, sharp-faced, longer one way than the others. */
function makeClast(): THREE.BufferGeometry {
  const raw = new THREE.IcosahedronGeometry(0.075, 0);
  raw.deleteAttribute('normal'); raw.deleteAttribute('uv');
  const clast = mergeVertices(raw);
  raw.dispose();
  const p = clast.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 0.62 + 0.6 * lump(i, 1.7);
    p.setXYZ(i, p.getX(i) * k * 1.25, p.getY(i) * k * 0.7, p.getZ(i) * k * 0.9);
  }
  const flat = clast.toNonIndexed();
  clast.dispose();
  flat.computeVertexNormals();
  return flat;
}
function makeGeometries(form: Required<GroundLitterConfig>['splinterForm'] = 'branch',
  stone: Required<GroundLitterConfig>['stoneForm'] = 'pebble'): [THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry] {
  return [stone === 'brick' ? makeBrick() : stone === 'clast' ? makeClast() : makeStone(), makeClod(),
    form === 'cone' ? makeCone() : form === 'leaf' ? makeLeaf() : makeBranch()];
}

function makeMaterial(setup?: GroundLitterOptions['setupMaterial']): THREE.MeshStandardMaterial {
  // ground lane: fully rough — a soil-coated stone has no sheen to mirror the sky's blue in
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const hook: GroundLitterMaterialHook = (shader) => {
    shader.uniforms.uLitterFade = { value: new THREE.Vector2(GROUND_LITTER.fadeInM, GROUND_LITTER.fadeOutM) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uLitterFade;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  vec3 litterAnchor = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float litterDist = distance(litterAnchor, cameraPosition);
  transformed *= 1.0 - smoothstep(uLitterFade.x, uLitterFade.y, litterDist);
}
#endif`);
  };
  if (setup) setup(material, hook);
  else material.onBeforeCompile = hook as unknown as THREE.MeshStandardMaterial['onBeforeCompile'];
  material.customProgramCacheKey = () => GROUND_LITTER.programKey;
  return material;
}

/** Vertex-shader fade source, pinned by the receipt so the ring edge never pops. */
export function groundLitterFadeSource(): string {
  const material = makeMaterial();
  const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '' };
  (material.onBeforeCompile as unknown as GroundLitterMaterialHook)(shader);
  material.dispose();
  return shader.vertexShader;
}

export function createGroundLitter(field: GroundLitterField, options: GroundLitterOptions = {}): GroundLitter {
  const cfg = resolveGroundLitterConfig(options.config);
  const seed = options.seed ?? 2005;
  const blocked = options.blocked ?? null;
  const cellsPerUpdate = Math.max(1, options.cellsPerUpdate ?? 6);
  // the phone tier's sparser scatter, and Ultra Low's light world build (2026-10-13), read once per battlefield
  const lightLitter = getDeviceTier() === 'mobile' || presetLightWorld();
  const group = new THREE.Group();
  group.name = 'ground-litter';
  const geometries = makeGeometries(cfg.splinterForm, cfg.stoneForm);
  const material = makeMaterial(options.setupMaterial ?? undefined);
  const meshes = geometries.map((geometry, index) => {
    const mesh = new THREE.InstancedMesh(geometry, material, CAP);
    mesh.name = ['ground-litter-stones', 'ground-litter-clods', 'ground-litter-splinters'][index];
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
    return mesh;
  }) as unknown as [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh];
  const enabled = cfg.density > 0 && (cfg.stones + cfg.clods + cfg.splinters) > 0;
  group.visible = enabled;

  const cache = new Map<string, [Float32Array, Float32Array, Float32Array]>();
  const heightAt = (x: number, z: number): number =>
    field.getHeightAtFast ? field.getHeightAtFast(x, z) : field.getHeightAt(x, z);
  const _n = new THREE.Vector3();
  const _q = new THREE.Quaternion();
  const _up = new THREE.Vector3(0, 1, 0);
  const _chipTurn = new THREE.Quaternion(); // (rock round 2) a chip's own turn about the up axis
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const scratch: number[][] = [[], [], []];
  let builds = 0;
  let publishes = 0;
  // (rock round 2) the feet by the cell their centre lies in: each foot is dressed once, by its own cell
  const feetByCell = new Map<string, Array<{ x: number; z: number; r: number }>>();
  for (const foot of options.rockFeet ?? []) {
    const key = `${Math.floor(foot.x / GROUND_LITTER.cellM)},${Math.floor(foot.z / GROUND_LITTER.cellM)}`;
    const list = feetByCell.get(key);
    if (list) list.push(foot); else feetByCell.set(key, [foot]);
  }
  const chipTint = options.rockChipTint ?? cfg.stoneTint;

  function buildCell(ix: number, iz: number): [Float32Array, Float32Array, Float32Array] {
    const rng = mulberry32(cellSeed(seed, ix, iz));
    for (const list of scratch) list.length = 0;
    const perCell = lightLitter ? GROUND_LITTER.mobileCandidatesPerCell : GROUND_LITTER.candidatesPerCell;
    const candidates = Math.round(perCell * Math.min(cfg.density, 2));
    const mixTotal = cfg.stones + cfg.clods + cfg.splinters;
    for (let i = 0; i < candidates; i++) {
      const x = (ix + rng()) * GROUND_LITTER.cellM;
      const z = (iz + rng()) * GROUND_LITTER.cellM;
      const roll = rng();
      const kindRoll = rng();
      const jitterA = rng();
      const jitterB = rng();
      const jitterC = rng();
      const roadD = field._roadDist ? field._roadDist(x, z) : 1e9;
      if (roadD < GROUND_LITTER.roadCoreM) continue;
      if (field.getGroundType && field.getGroundType(x, z) === 'soft') continue;
      if (field.getWaterMaskAt && field.getWaterMaskAt(x, z) > 0.2) continue;
      let ny = 1;
      if (field.getNormalAt) {
        const normal = field.getNormalAt(x, z);
        ny = normal.y;
        if (ny < GROUND_LITTER.minSlopeY) continue;
        _n.set(normal.x, normal.y, normal.z);
      } else {
        _n.set(0, 1, 0);
      }
      const worked = (field._noVeg ? field._noVeg(x, z) : false) || !!field._railBerth?.(x, z);
      const shoulder = roadD < GROUND_LITTER.shoulderM
        ? cfg.shoulders * (1 - (roadD - GROUND_LITTER.roadCoreM) / (GROUND_LITTER.shoulderM - GROUND_LITTER.roadCoreM))
        : 0;
      // open ground keeps about a third of the candidates (grass hides most
      // small stones anyway); shoulders keep far more, worked yards keep a
      // few stones only so settlements stay swept
      // ground lane: open ground keeps its stones in patches (litterPatch: thick in a patch, nearly none between)
      // (wave 4: still "evenly spaced" — the patches now hold every stone: none between them, fuller inside)
      const clump = Math.min(2.2, Math.max(0, (litterPatch(x, z, seed) - 0.45) * 4.4));
      const keep = worked ? 0.2 : (0.42 * clump) + shoulder * 0.5;
      if (roll > keep) continue;
      let kind: number;
      if (worked) kind = 0;
      else {
        const stoneW = cfg.stones * (1 + shoulder * 1.6);
        const total = stoneW + cfg.clods + cfg.splinters;
        const pick = kindRoll * total;
        kind = pick < stoneW ? 0 : pick < stoneW + cfg.clods ? 1 : 2;
      }
      if (mixTotal <= 0) continue;
      if (kind === 2) {
        // ground lane (2026-10-03, the gauntlet: "thin brown stick props sprinkled uniformly"): fallen wood lies under
        // the stands (the woods mask), with a stray stick in the open now and then — a quarter keep without the mask
        const woods = field._woodsAt ? field._woodsAt(x, z) : 0.25;
        const t = Math.min(1, Math.max(0, (woods - 0.1) / 0.5));
        const hash = (cellSeed(seed ^ 0x2F1A5, Math.floor(x * 4), Math.floor(z * 4)) & 0xffff) / 65535;
        if (hash > 0.06 + 0.94 * t * t * (3 - 2 * t)) continue;
      }
      const y = heightAt(x, z);
      let sx: number;
      let sy: number;
      let sz: number;
      let lift: number;
      if (kind === 0) {
        // a spread of sizes — many small stones, a few big ones (the square of a draw), each its own proportions
        const size = 0.55 + 1.5 * jitterA * jitterA;
        sx = size * (0.8 + jitterB * 0.5); sz = size * (0.85 + jitterC * 0.4); sy = 0.45 + jitterC * 0.35;
        lift = 0.075 * sy * 0.12; // ground lane: bedded in the soil, not set on it (0.35 of its height stood clear)
      } else if (kind === 1) {
        sx = 0.6 + jitterA * 0.9; sz = 0.6 + jitterB * 0.9; sy = 0.5 + jitterC * 0.4;
        lift = 0.06 * sy * 0.3;
      } else {
        sx = 0.5 + jitterA * 1.1; sz = 0.8 + jitterB * 0.5; sy = 0.8 + jitterC * 0.5;
        lift = 0.02 * sy;
      }
      const radius = kind === 2 ? 0.28 * sx : 0.075 * Math.max(sx, sz);
      if (blocked && blocked(x, y, z, 0.12, radius)) continue;
      const yaw = jitterC * Math.PI * 2 + jitterA;
      _q.setFromUnitVectors(_up, _n.normalize());
      _q.multiply(new THREE.Quaternion().setFromAxisAngle(_up, yaw));
      // (#19) a share of the stones take the second tint (a town's brick among its grit), by a draw already made
      const alt = kind === 0 && cfg.stoneTintAlt && (jitterA * 9973.1) % 1 < cfg.stoneAltShare;
      const tint = kind === 0 ? (alt ? cfg.stoneTintAlt! : cfg.stoneTint) : kind === 2 && cfg.splinterTint ? cfg.splinterTint : cfg.soilTint;
      const shade = kind === 2 ? 0.55 + jitterB * 0.25 : 0.68 + jitterA * 0.5;
      // ground lane: the warm / cool cast is relative to the tint — the absolute ±0.04 swung a 0.13 stone a third of
      // its value toward pink or blue (the gauntlet's "pastel" stones)
      const warm = kind === 0 ? (jitterB - 0.5) * 0.10 : 0;
      const list = scratch[kind];
      list.push(x, y + lift, z, _q.x, _q.y, _q.z, _q.w, sx, sy, sz,
        Math.min(1, tint[0] * shade * (1 + warm)), Math.min(1, tint[1] * shade), Math.min(1, tint[2] * shade * (1 - warm * 0.5)));
    }
    // (rock round 2) the chips each boulder whose centre lies in this cell has shed round its foot: three to eight, more
    // round a bigger stone, just past its foot, two in three on its downhill side; flat fragments of its own stone, a
    // hand to a foot across, bedded in the soil; their own stream (the foot's place), so no other litter moves
    if (cfg.density > 0) {
      for (const foot of feetByCell.get(`${ix},${iz}`) ?? []) {
        const frng = mulberry32(cellSeed(seed ^ 0x51ab7, Math.round(foot.x * 10), Math.round(foot.z * 10)));
        const n = 3 + Math.floor(frng() * Math.min(5, 2 + 3 * foot.r));
        let fallX = 0, fallZ = 0;
        if (field.getNormalAt) { const nf = field.getNormalAt(foot.x, foot.z); fallX = nf.x; fallZ = nf.z; }
        const fall = Math.hypot(fallX, fallZ), downhill = Math.atan2(fallZ, fallX);
        for (let k = 0; k < n; k++) {
          const a = fall > 0.04 && frng() < 0.66 ? downhill + (frng() - 0.5) * 1.7 : frng() * Math.PI * 2;
          const rr = foot.r * (1.02 + 0.5 * frng() * frng()) + 0.08;
          const x = foot.x + Math.cos(a) * rr, z = foot.z + Math.sin(a) * rr;
          const jitterA = frng(), jitterB = frng(), jitterC = frng();
          if (field.getWaterMaskAt && field.getWaterMaskAt(x, z) > 0.2) continue;
          const size = 1.3 + 2.4 * jitterA * jitterA;
          const sx = size * (0.8 + jitterB * 0.5), sz = size * (0.7 + jitterC * 0.5), sy = size * (0.32 + jitterB * 0.22);
          const radius = 0.075 * Math.max(sx, sz);
          const y = heightAt(x, z);
          if (blocked && blocked(x, y, z, 0.12, radius * 0.6)) continue;
          if (field.getNormalAt) { const normal = field.getNormalAt(x, z); _n.set(normal.x, normal.y, normal.z); } else _n.set(0, 1, 0);
          _q.setFromUnitVectors(_up, _n.normalize());
          _q.multiply(_chipTurn.setFromAxisAngle(_up, jitterC * Math.PI * 2 + jitterA));
          const shade = 0.78 + 0.34 * jitterB;
          scratch[0].push(x, y + 0.075 * sy * 0.1, z, _q.x, _q.y, _q.z, _q.w, sx, sy, sz,
            Math.min(1, chipTint[0] * shade), Math.min(1, chipTint[1] * shade), Math.min(1, chipTint[2] * shade));
        }
      }
    }
    builds++;
    return [Float32Array.from(scratch[0]), Float32Array.from(scratch[1]), Float32Array.from(scratch[2])];
  }

  function cellData(ix: number, iz: number): [Float32Array, Float32Array, Float32Array] | null {
    const key = `${ix},${iz}`;
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
    return null;
  }

  function remember(ix: number, iz: number, data: [Float32Array, Float32Array, Float32Array]): void {
    cache.set(`${ix},${iz}`, data);
    while (cache.size > GROUND_LITTER.cacheCells) {
      const oldest = cache.keys().next().value as string;
      cache.delete(oldest);
    }
  }

  let cellX = 0x7fffffff;
  let cellZ = 0x7fffffff;
  let pending: Array<[number, number]> = [];
  let published = false;
  const counts: [number, number, number] = [0, 0, 0];

  function publish(): void {
    const totals = [0, 0, 0];
    for (let dz = -GROUND_LITTER.ring; dz <= GROUND_LITTER.ring; dz++) {
      for (let dx = -GROUND_LITTER.ring; dx <= GROUND_LITTER.ring; dx++) {
        const data = cellData(cellX + dx, cellZ + dz);
        if (!data) continue;
        for (let kind = 0; kind < 3; kind++) {
          const packed = data[kind];
          const mesh = meshes[kind];
          const matrices = mesh.instanceMatrix.array as Float32Array;
          const colors = mesh.instanceColor!.array as Float32Array;
          for (let at = 0; at + PACK <= packed.length && totals[kind] < CAP; at += PACK) {
            // (crater-render-spec §C) a crater's cleared bowl takes no litter; the rest lies on base + offsetAt
            let lift = 0;
            if (craterLaw?.active) {
              if (craterLaw.holeAt(packed[at], packed[at + 2])) continue;
              lift = craterLaw.liftAt(packed[at], packed[at + 2]);
            }
            const index = totals[kind]++;
            _p.set(packed[at], packed[at + 1] + lift, packed[at + 2]);
            _q.set(packed[at + 3], packed[at + 4], packed[at + 5], packed[at + 6]);
            _s.set(packed[at + 7], packed[at + 8], packed[at + 9]);
            _m.compose(_p, _q, _s);
            _m.toArray(matrices, index * 16);
            colors[index * 3] = packed[at + 10];
            colors[index * 3 + 1] = packed[at + 11];
            colors[index * 3 + 2] = packed[at + 12];
          }
        }
      }
    }
    for (let kind = 0; kind < 3; kind++) {
      const mesh = meshes[kind];
      mesh.count = totals[kind];
      counts[kind] = totals[kind];
      mesh.instanceMatrix.addUpdateRange(0, totals[kind] * 16);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.addUpdateRange(0, totals[kind] * 3);
      mesh.instanceColor!.needsUpdate = true;
    }
    publishes++;
    published = true;
  }

  // ground lane (crater-render-spec §C): the battle's craters; a stamp the ring reaches republishes it from its base cells
  let craterLaw: GroundCoverCraters | null = null;
  const craterFollower = createCraterFollower();
  const RING_REACH_M = (GROUND_LITTER.ring + 1) * GROUND_LITTER.cellM;
  function followCraterLaw(law: GroundCoverCraters): void {
    craterLaw = law;
    if (!enabled) return;
    followCraters(law, craterFollower, () => { published = false; }, (x0, z0, x1, z1) => {
      const cx = (cellX + 0.5) * GROUND_LITTER.cellM, cz = (cellZ + 0.5) * GROUND_LITTER.cellM;
      if (x1 >= cx - RING_REACH_M && x0 <= cx + RING_REACH_M && z1 >= cz - RING_REACH_M && z0 <= cz + RING_REACH_M) published = false;
    });
  }

  let lastCamX = 0, lastCamZ = 0;
  function update(cameraPosition: { x: number; z: number }): void {
    if (!enabled) return;
    lastCamX = cameraPosition.x; lastCamZ = cameraPosition.z;
    const ix = Math.floor(cameraPosition.x / GROUND_LITTER.cellM);
    const iz = Math.floor(cameraPosition.z / GROUND_LITTER.cellM);
    if (ix !== cellX || iz !== cellZ) {
      cellX = ix; cellZ = iz;
      pending = [];
      // nearest cells first so a fresh ring fills under the camera outward
      for (let dz = -GROUND_LITTER.ring; dz <= GROUND_LITTER.ring; dz++) {
        for (let dx = -GROUND_LITTER.ring; dx <= GROUND_LITTER.ring; dx++) {
          if (!cellData(ix + dx, iz + dz)) pending.push([ix + dx, iz + dz]);
        }
      }
      pending.sort((a, b) => (Math.abs(a[0] - ix) + Math.abs(a[1] - iz)) - (Math.abs(b[0] - ix) + Math.abs(b[1] - iz)));
      published = false;
    }
    let budget = cellsPerUpdate;
    // (local-fps-265) live: the cells one wall-clock slice builds (liveUpdateMs, one at least); a caller's own
    // cellsPerUpdate and a cold ring (an interior cell to build) take their whole budget
    const deadline = options.cellsPerUpdate === undefined && !interiorPending() ? performance.now() + GROUND_LITTER.liveUpdateMs : Infinity;
    let first = true;
    while (pending.length && budget-- > 0 && (first || performance.now() < deadline)) {
      first = false;
      const [cx, cz] = pending.shift()!;
      remember(cx, cz, buildCell(cx, cz));
    }
    if (!pending.length && !published) publish();
  }

  /** A cell inside the ring's edge is still to build (the first fill, a camera that jumped or outran the live slices). */
  function interiorPending(): boolean {
    const inner = GROUND_LITTER.ring - 1;
    for (let i = 0; i < pending.length; i++) {
      const cell = pending[i];
      if (Math.abs(cell[0] - cellX) <= inner && Math.abs(cell[1] - cellZ) <= inner) return true;
    }
    return false;
  }

  function getState(): GroundLitterState {
    const m = GROUND_LITTER.cellM;
    let nearestPendingM = Infinity;
    for (const [ix, iz] of pending) {
      nearestPendingM = Math.min(nearestPendingM, Math.hypot(Math.max(ix * m - lastCamX, 0, lastCamX - (ix + 1) * m),
        Math.max(iz * m - lastCamZ, 0, lastCamZ - (iz + 1) * m)));
    }
    return { cellX, cellZ, cells: CELLS, pending: pending.length, counts: [...counts] as [number, number, number],
      cached: cache.size, builds, publishes, nearestPendingM };
  }

  function dispose(): void {
    for (const geometry of geometries) geometry.dispose();
    options.releaseMaterial?.(material);
    material.dispose();
    for (const mesh of meshes) mesh.dispose();
    cache.clear();
    group.removeFromParent();
  }

  return { group, meshes, update, getState, followCraters: followCraterLaw, dispose };
}
