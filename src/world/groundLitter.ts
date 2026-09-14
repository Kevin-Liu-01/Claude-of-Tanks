import * as THREE from 'three';
import { getDeviceTier } from '../engine/quality.ts';

// environment density pass (2026-09-12): the ground litter tier. The maps read
// bare because nothing smaller than a bush ever sat on the ground — the pebble
// detail lived only in the dirt texture. This strews stones, clods and timber
// splinters under the camera: a camera-centred ring of deterministic 16 m
// cells (±40 m), three instanced pools, receiving shadow but casting none,
// scaled out in the vertex shader before the ring edge so nothing pops.
// Candidates keep off the carriageway (the road shader owns its grit), off
// water and soft ground, off steep faces and out of every sealed building
// footprint; road shoulders carry extra gravel spill.

export interface GroundLitterField {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getNormalAt?(x: number, z: number): { x: number; y: number; z: number };
  getGroundType?(x: number, z: number): 'hard' | 'medium' | 'soft';
  _roadDist?(x: number, z: number): number;
  _noVeg?(x: number, z: number): boolean;
  getWaterMaskAt?(x: number, z: number): number;
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
}

export type GroundLitterBlocked =
  (x: number, y: number, z: number, height: number, radius: number) => boolean;

export type GroundLitterMaterialHook = (shader: { uniforms: Record<string, { value: unknown }>; vertexShader: string; fragmentShader: string }) => void;

export interface GroundLitterOptions {
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
}

export interface GroundLitterState {
  cellX: number;
  cellZ: number;
  cells: number;
  pending: number;
  counts: readonly [number, number, number];
  cached: number;
  builds: number;
  publishes: number;
}

export interface GroundLitter {
  readonly group: THREE.Group;
  readonly meshes: readonly [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh];
  update(cameraPosition: { x: number; z: number }): void;
  getState(): GroundLitterState;
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
  fadeInM: 24,
  fadeOutM: 32, // == cellM * ring: the ring always covers the fade, wherever the camera sits in its cell
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
  stoneTint: [0.20, 0.19, 0.17],
  soilTint: [0.17, 0.13, 0.09],
};

/**
 * Per-map tuning: snow keeps a few dark stones, arid ground is all stone,
 * towns are swept grey grit, forests carry splinters, wet ground clods; the
 * rest run the defaults. A map's `vegetation.litter` overrides this table.
 */
const LITTER_PROFILES: Readonly<Record<string, GroundLitterConfig>> = Object.freeze({
  winter: { density: 0.3, clods: 0, splinters: 0.25, stoneTint: [0.09, 0.09, 0.10] },
  whiteout: { density: 0.25, clods: 0, splinters: 0.1, stoneTint: [0.09, 0.09, 0.10] },
  alpine: { density: 0.7, clods: 0.15, splinters: 0.35, stoneTint: [0.13, 0.13, 0.14] },
  desert: { density: 1.25, clods: 0.25, splinters: 0, stoneTint: [0.19, 0.16, 0.12] },
  oasis: { density: 1.1, clods: 0.2, splinters: 0.05, stoneTint: [0.19, 0.165, 0.125] },
  badlands: { density: 1.2, clods: 0.3, splinters: 0, stoneTint: [0.18, 0.13, 0.10] },
  copper_mesa: { density: 1.15, clods: 0.3, splinters: 0.05, stoneTint: [0.17, 0.13, 0.10] },
  titan_gorge: { density: 1.1, clods: 0.2, splinters: 0, stoneTint: [0.15, 0.145, 0.135] },
  caldera: { density: 1.0, clods: 0.2, splinters: 0, stoneTint: [0.09, 0.085, 0.085] },
  blackglass: { density: 0.9, clods: 0.1, splinters: 0.1, stoneTint: [0.10, 0.105, 0.11] },
  urban: { density: 0.85, clods: 0.15, splinters: 0.2, stoneTint: [0.15, 0.148, 0.14] },
  ruinspires: { density: 0.95, clods: 0.1, splinters: 0.15, stoneTint: [0.155, 0.15, 0.14] },
  foundry: { density: 0.9, clods: 0.2, splinters: 0.2, stoneTint: [0.12, 0.117, 0.115] },
  railyard: { density: 1.0, clods: 0.2, splinters: 0.3, stoneTint: [0.13, 0.127, 0.122] },
  skybridge: { density: 0.9, clods: 0.2, splinters: 0.1, stoneTint: [0.145, 0.14, 0.138] },
  airfield: { density: 0.8, clods: 0.3, splinters: 0.2 },
  monsoon: { density: 1.1, stones: 0.7, clods: 0.6, splinters: 0.9 },
  longleaf: { density: 1.1, stones: 0.7, splinters: 0.9 },
  autumn: { density: 1.1, stones: 0.7, splinters: 0.9 },
  orchard: { splinters: 0.7 },
  delta: { density: 0.9, stones: 0.6, clods: 0.7, splinters: 0.7 },
  mangrove: { density: 0.9, stones: 0.6, clods: 0.7, splinters: 0.7 },
  polders: { density: 0.8 },
  coastal: { stones: 1.1, splinters: 0.3, stoneTint: [0.17, 0.165, 0.155] },
  saltwind: { stones: 1.1, splinters: 0.3, stoneTint: [0.17, 0.165, 0.155] },
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

export function resolveGroundLitterConfig(config?: GroundLitterConfig | null): Required<GroundLitterConfig> {
  const merged = { ...DEFAULTS, ...(config ?? {}) };
  for (const key of ['density', 'stones', 'clods', 'splinters', 'shoulders'] as const) {
    merged[key] = Math.max(0, Number.isFinite(merged[key]) ? merged[key] : DEFAULTS[key]);
  }
  merged.shoulders = Math.min(1, merged.shoulders);
  return merged;
}

function makeGeometries(): [THREE.BufferGeometry, THREE.BufferGeometry, THREE.BufferGeometry] {
  const stone = new THREE.IcosahedronGeometry(0.075, 0);
  const clod = new THREE.DodecahedronGeometry(0.06, 0);
  const splinter = new THREE.CylinderGeometry(0.018, 0.026, 0.55, 5);
  splinter.rotateZ(Math.PI / 2);
  for (const geometry of [stone, clod, splinter]) geometry.computeVertexNormals();
  return [stone, clod, splinter];
}

function makeMaterial(setup?: GroundLitterOptions['setupMaterial']): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
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
  const group = new THREE.Group();
  group.name = 'ground-litter';
  const geometries = makeGeometries();
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
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _m = new THREE.Matrix4();
  const scratch: number[][] = [[], [], []];
  let builds = 0;
  let publishes = 0;

  function buildCell(ix: number, iz: number): [Float32Array, Float32Array, Float32Array] {
    const rng = mulberry32(cellSeed(seed, ix, iz));
    for (const list of scratch) list.length = 0;
    const perCell = getDeviceTier() === 'mobile' ? GROUND_LITTER.mobileCandidatesPerCell : GROUND_LITTER.candidatesPerCell;
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
      const worked = field._noVeg ? field._noVeg(x, z) : false;
      const shoulder = roadD < GROUND_LITTER.shoulderM
        ? cfg.shoulders * (1 - (roadD - GROUND_LITTER.roadCoreM) / (GROUND_LITTER.shoulderM - GROUND_LITTER.roadCoreM))
        : 0;
      // open ground keeps about a third of the candidates (grass hides most
      // small stones anyway); shoulders keep far more, worked yards keep a
      // few stones only so settlements stay swept
      const keep = worked ? 0.2 : 0.34 + shoulder * 0.5;
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
      const y = heightAt(x, z);
      let sx: number;
      let sy: number;
      let sz: number;
      let lift: number;
      if (kind === 0) {
        sx = 0.6 + jitterA * 1.3; sz = 0.65 + jitterB * 0.8; sy = 0.45 + jitterC * 0.35;
        lift = 0.075 * sy * 0.35;
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
      const tint = kind === 0 ? cfg.stoneTint : cfg.soilTint;
      const shade = kind === 2 ? 0.55 + jitterB * 0.25 : 0.68 + jitterA * 0.5;
      const warm = kind === 0 ? (jitterB - 0.5) * 0.08 : 0;
      const list = scratch[kind];
      list.push(x, y + lift, z, _q.x, _q.y, _q.z, _q.w, sx, sy, sz,
        Math.min(1, tint[0] * shade + warm), Math.min(1, tint[1] * shade), Math.min(1, tint[2] * shade - warm * 0.5));
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
            const index = totals[kind]++;
            _p.set(packed[at], packed[at + 1], packed[at + 2]);
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

  function update(cameraPosition: { x: number; z: number }): void {
    if (!enabled) return;
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
    while (pending.length && budget-- > 0) {
      const [cx, cz] = pending.shift()!;
      remember(cx, cz, buildCell(cx, cz));
    }
    if (!pending.length && !published) publish();
  }

  function getState(): GroundLitterState {
    return { cellX, cellZ, cells: CELLS, pending: pending.length, counts: [...counts] as [number, number, number],
      cached: cache.size, builds, publishes };
  }

  function dispose(): void {
    for (const geometry of geometries) geometry.dispose();
    options.releaseMaterial?.(material);
    material.dispose();
    for (const mesh of meshes) mesh.dispose();
    cache.clear();
    group.removeFromParent();
  }

  return { group, meshes, update, getState, dispose };
}
