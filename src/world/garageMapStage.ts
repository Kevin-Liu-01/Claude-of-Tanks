// A bounded Garage presentation cut from the same authored data as a live
// battlefield. This module is demand-loaded by the staging-area selector: it
// samples the canonical height field at a real tactical-beat coordinate and
// reuses the battlefield horizon, far-tree geometry, palettes, and landmark
// structure without constructing map-wide streaming, grass, collision, or
// destructible runtimes.
import * as THREE from 'three';
import { getMapConfig, type BattlefieldMapConfig } from './maps/index.ts';
import { sampleHorizonSilhouette, type HorizonStyle } from './maps/horizon.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';
import { createHeightField, mulberry32, sampleSplatNoise, type HeightField } from './terrain.ts';
import { createGarageTreeKit, type GarageTreeKit } from './vegetation.ts';

interface EngineContext {
  setupShadowMaterial?(material: THREE.Material): void;
}

interface TacticalBeat {
  id?: string;
  x: number;
  z: number;
  yawDeg?: number;
  structure?: string;
}

interface MapStageConfig {
  id: string;
  name: string;
  splat?: {
    grassTone?: (h: number, s: number, l: number) => readonly [number, number, number];
    dirtTone?: (h: number, s: number, l: number) => readonly [number, number, number];
    rockTone?: (h: number, s: number, l: number) => readonly [number, number, number];
  };
  vegetation?: {
    species?: Array<'pine' | 'oak' | 'palm' | 'birch'>;
  };
  props?: { tacticalBeats?: TacticalBeat[] };
  sky?: { fogTintHex?: number; sunColorHex?: number };
}

interface GarageTreePlacement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

interface GarageTreePlacementSet {
  species: 'pine' | 'oak' | 'palm' | 'birch';
  placements: GarageTreePlacement[];
}

export interface GarageMapStageSample {
  mapId: string;
  anchor: { x: number; z: number; y: number; yaw: number };
  beat: TacticalBeat;
  structureId: string;
  landmarkLocal: readonly [number, number, number] | null;
  terrainPositions: Float32Array;
  terrainColors: Float32Array;
  terrainIndices: Uint16Array;
  trees: GarageTreePlacementSet[];
}

export interface GarageMapStageStats {
  ready: true;
  source: 'canonical-map-slice';
  mapId: string;
  sourceCoordinate: readonly [number, number];
  sourceBeat: string;
  sourceStructure: string;
  sourceLandmarkLocal: readonly [number, number, number] | null;
  terrainVertices: number;
  treeSpecies: readonly string[];
  trees: number;
}

export interface GarageMapStage {
  group: THREE.Group;
  stats: GarageMapStageStats;
  dispose(): void;
}

const PATCH_RADIUS = 72;
const PATCH_SEGMENTS = 36;

const nextPaint = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

function idHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tacticalBeat(config: MapStageConfig): TacticalBeat {
  const beats = config.props?.tacticalBeats || [];
  return beats.find((beat) => beat.structure && DESTRUCTIBLE_BUILDING_TYPES[beat.structure])
    || beats[0]
    || { id: `${config.id}-deployment`, x: 0, z: 0 };
}

function findStageAnchor(heightField: HeightField, beat: TacticalBeat): { x: number; z: number; yaw: number } {
  let best = { x: beat.x, z: beat.z - 32, yaw: 0, score: -Infinity };
  const beatY = heightField.getHeightAt(beat.x, beat.z);
  // The battlefield landmark remains at its authored map coordinate. We pick
  // a nearby flat service patch, rather than moving the landmark toward the
  // camera, so the resulting composition is an honest cut from that area.
  for (const radius of [26, 32, 38]) {
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      const x = beat.x - Math.sin(angle) * radius;
      const z = beat.z - Math.cos(angle) * radius;
      if (Math.max(Math.abs(x), Math.abs(z)) > 456) continue;
      const centerY = heightField.getHeightAt(x, z);
      let minNormal = 1;
      let maxSpread = 0;
      for (const [dx, dz] of [[0, 0], [-14, -14], [14, -14], [-14, 14], [14, 14]] as const) {
        minNormal = Math.min(minNormal, heightField.getNormalAt(x + dx, z + dz).y);
        maxSpread = Math.max(maxSpread, Math.abs(heightField.getHeightAt(x + dx, z + dz) - centerY));
      }
      const roadBonus = Math.max(0, 7 - heightField._roadDist(x, z)) * 0.18;
      const score = minNormal * 12 - maxSpread * 1.8
        - Math.abs(centerY - beatY) * 2.2 + roadBonus;
      if (score > best.score) best = { x, z, yaw: angle, score };
    }
  }
  // Rotate the service pad around its real anchor so the authored landmark is
  // in the open rear-right quarter. The previous positive offset projected it
  // under the right-side stats card and made an otherwise real map read as a
  // featureless backdrop.
  return {
    x: best.x,
    z: best.z,
    yaw: Math.atan2(beat.x - best.x, beat.z - best.z) - 0.38,
  };
}

function mapToLocal(
  x: number,
  z: number,
  anchor: { x: number; z: number; yaw: number },
): [number, number] {
  const dx = x - anchor.x;
  const dz = z - anchor.z;
  const c = Math.cos(anchor.yaw);
  const s = Math.sin(anchor.yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}

function localToMap(
  x: number,
  z: number,
  anchor: { x: number; z: number; yaw: number },
): [number, number] {
  const c = Math.cos(anchor.yaw);
  const s = Math.sin(anchor.yaw);
  return [anchor.x + x * c + z * s, anchor.z - x * s + z * c];
}

function terrainColor(
  config: MapStageConfig,
  heightField: HeightField,
  x: number,
  z: number,
  target: THREE.Color,
): THREE.Color {
  const sample = sampleSplatNoise(x, z, { n1: 0, n2: 0, mA: 0 });
  const normalY = heightField.getNormalAt(x, z).y;
  const road = heightField._roadDist(x, z);
  const splat = config.splat || {};
  const tone = normalY < 0.79 && splat.rockTone
    ? splat.rockTone
    : (road < 5.8 || sample.n2 > 0.67) && splat.dirtTone
      ? splat.dirtTone
      : splat.grassTone || splat.dirtTone || splat.rockTone;
  const baseHue = config.id === 'desert' || config.id === 'badlands' ? 0.09
    : config.id === 'winter' || config.id === 'alpine' ? 0.58
      : config.id === 'foundry' || config.id === 'railyard' ? 0.08 : 0.27;
  const [h, s, l] = tone?.(baseHue, 0.34, 0.42)
    || [baseHue, config.id === 'winter' ? 0.08 : 0.30, 0.40];
  target.setHSL(h, THREE.MathUtils.clamp(s, 0, 1), THREE.MathUtils.clamp(l, 0, 1), THREE.SRGBColorSpace);
  if (road < 5.8) target.multiplyScalar(0.78);
  return target;
}

function sampleTerrainPatch(
  config: MapStageConfig,
  heightField: HeightField,
  anchor: { x: number; z: number; yaw: number },
  anchorY: number,
): Pick<GarageMapStageSample, 'terrainPositions' | 'terrainColors' | 'terrainIndices'> {
  const count = (PATCH_SEGMENTS + 1) ** 2;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const indices = new Uint16Array(PATCH_SEGMENTS * PATCH_SEGMENTS * 6);
  const color = new THREE.Color();
  let offset = 0;
  for (let iz = 0; iz <= PATCH_SEGMENTS; iz++) {
    const lz = -PATCH_RADIUS + (iz / PATCH_SEGMENTS) * PATCH_RADIUS * 2;
    for (let ix = 0; ix <= PATCH_SEGMENTS; ix++) {
      const lx = -PATCH_RADIUS + (ix / PATCH_SEGMENTS) * PATCH_RADIUS * 2;
      const [wx, wz] = localToMap(lx, lz, anchor);
      const sampledY = heightField.getHeightAt(wx, wz) - anchorY;
      // A real field staging point is graded around its hardstand. Preserve
      // the selected battlefield elevation beyond the service apron, but ease
      // its immediate camera-side terrain to the pad datum. Without this
      // bounded cut, an authentic urban bank could rise through the podium and
      // hide half the selected tank even though the center candidate is flat.
      const radius = Math.hypot(lx, lz);
      const gradeT = THREE.MathUtils.smoothstep(radius, 23, 41);
      positions[offset * 3] = lx;
      positions[offset * 3 + 1] = sampledY * gradeT - 0.04;
      positions[offset * 3 + 2] = lz;
      terrainColor(config, heightField, wx, wz, color);
      colors[offset * 3] = color.r;
      colors[offset * 3 + 1] = color.g;
      colors[offset * 3 + 2] = color.b;
      offset++;
    }
  }
  let indexOffset = 0;
  for (let iz = 0; iz < PATCH_SEGMENTS; iz++) {
    for (let ix = 0; ix < PATCH_SEGMENTS; ix++) {
      const a = iz * (PATCH_SEGMENTS + 1) + ix;
      const b = a + 1;
      const c = a + PATCH_SEGMENTS + 1;
      indices[indexOffset++] = a;
      indices[indexOffset++] = c;
      indices[indexOffset++] = b;
      indices[indexOffset++] = b;
      indices[indexOffset++] = c;
      indices[indexOffset++] = c + 1;
    }
  }
  return { terrainPositions: positions, terrainColors: colors, terrainIndices: indices };
}

function createTerrainPatch(sample: GarageMapStageSample): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(sample.terrainPositions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(sample.terrainColors, 3));
  geometry.setIndex(new THREE.BufferAttribute(sample.terrainIndices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'canonical_map_terrain_slice';
  mesh.receiveShadow = true;
  return mesh;
}

function createMapHorizon(config: MapStageConfig): THREE.Mesh {
  const horizonConfig = (config as unknown as {
    horizon?: { style?: string; baseHex?: number; amp?: number };
  }).horizon || {};
  const count = 128;
  const heights = sampleHorizonSilhouette({
    style: (horizonConfig.style || 'rolling') as HorizonStyle,
    mapId: config.id,
    seed: 1337,
    count,
  });
  let min = Infinity;
  let max = -Infinity;
  for (const height of heights) {
    min = Math.min(min, height);
    max = Math.max(max, height);
  }
  const positions = new Float32Array((count + 1) * 2 * 3);
  const colors = new Float32Array((count + 1) * 2 * 3);
  const indices: number[] = [];
  const base = new THREE.Color(horizonConfig.baseHex ?? 0x526448).multiplyScalar(0.58);
  const haze = new THREE.Color(config.sky?.fogTintHex ?? 0x899aa6);
  for (let i = 0; i <= count; i++) {
    const sample = heights[i % count];
    const normalized = (sample - min) / Math.max(1e-6, max - min);
    const angle = (i / count) * Math.PI * 2;
    const radius = 84 + Math.sin(angle * 5 + idHash(config.id)) * 2.5;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const bottom = i * 2;
    const top = bottom + 1;
    positions[bottom * 3] = x;
    positions[bottom * 3 + 1] = -7;
    positions[bottom * 3 + 2] = z;
    positions[top * 3] = x;
    positions[top * 3 + 1] = 10 + normalized * 22 * (horizonConfig.amp ?? 1);
    positions[top * 3 + 2] = z;
    colors.set([base.r * 0.68, base.g * 0.68, base.b * 0.68], bottom * 3);
    const crest = base.clone().lerp(haze, 0.12 + normalized * 0.18);
    colors.set([crest.r, crest.g, crest.b], top * 3);
    if (i < count) indices.push(bottom, bottom + 2, top, top, bottom + 2, top + 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    // The ring winding changes sign at the seam on a few horizon styles.
    // It is only 256 triangles, so render both sides rather than allowing an
    // entire real skyline to disappear from an inside-the-ring camera.
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'canonical_map_horizon_silhouette';
  return mesh;
}

function sampleTreePlacements(
  config: MapStageConfig,
  heightField: HeightField,
  anchor: { x: number; z: number; yaw: number },
  anchorY: number,
): GarageTreePlacementSet[] {
  const species = (config.vegetation?.species || ['pine', 'oak']).slice(0, 2);
  const rng = mulberry32(idHash(config.id) ^ 0x47a93);
  const placements = new Map<string, GarageTreePlacement[]>();
  for (const name of species) placements.set(name, []);
  for (let attempt = 0; attempt < 220; attempt++) {
    // Sample actual map coordinates in the visible background arc. The tree
    // kit and filters match the battlefield; this composition constraint only
    // prevents most of the tiny bounded set from spawning behind the camera.
    const lx = -30 + rng() * 64;
    const lz = 23 + rng() * 35;
    if (lz < 34 && Math.abs(lx) < 10) continue;
    const [wx, wz] = localToMap(lx, lz, anchor);
    if (heightField._noVeg(wx, wz)
        || heightField.getGroundType(wx, wz) === 'soft'
        || heightField.getNormalAt(wx, wz).y < 0.80) continue;
    const name = species[(rng() * species.length) | 0];
    const list = placements.get(name)!;
    const target = config.id === 'desert' || config.id === 'badlands' ? 7 : 14;
    if ([...placements.values()].reduce((sum, entries) => sum + entries.length, 0) >= target) break;
    list.push({
      x: lx,
      y: heightField.getHeightAt(wx, wz) - anchorY - 0.03,
      z: lz,
      yaw: rng() * Math.PI * 2,
      scale: 0.88 + rng() * 0.62,
    });
  }
  return species.map((name) => ({
    species: name,
    placements: placements.get(name) || [],
  }));
}

async function createTreeInstances(
  engineCtx: EngineContext,
  config: MapStageConfig,
  placementSets: GarageTreePlacementSet[],
  root: THREE.Group,
): Promise<{ kits: GarageTreeKit[]; count: number; species: string[] }> {
  const kits: GarageTreeKit[] = [];
  let total = 0;
  for (let i = 0; i < placementSets.length; i++) {
    const { species: name, placements: instances } = placementSets[i];
    if (!instances.length) continue;
    await nextPaint();
    const kit = createGarageTreeKit(engineCtx, config, name, 2001 + idHash(config.id), i);
    kits.push(kit);
    const trunk = new THREE.InstancedMesh(kit.trunk, kit.trunkMaterial, instances.length);
    const foliage = new THREE.InstancedMesh(kit.foliage, kit.foliageMaterial, instances.length);
    trunk.name = `canonical_${name}_trunks`;
    foliage.name = `canonical_${name}_foliage`;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    for (let n = 0; n < instances.length; n++) {
      const instance = instances[n];
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), instance.yaw);
      position.set(instance.x, instance.y, instance.z);
      scale.setScalar(instance.scale);
      matrix.compose(position, quaternion, scale);
      trunk.setMatrixAt(n, matrix);
      foliage.setMatrixAt(n, matrix);
    }
    trunk.instanceMatrix.needsUpdate = true;
    foliage.instanceMatrix.needsUpdate = true;
    trunk.computeBoundingSphere();
    foliage.computeBoundingSphere();
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    foliage.castShadow = true;
    foliage.receiveShadow = true;
    trunk.frustumCulled = false;
    foliage.frustumCulled = false;
    root.add(trunk, foliage);
    total += instances.length;
  }
  return { kits, count: total, species: placementSets.map((set) => set.species) };
}

/**
 * CPU-only canonical-map sampler. The browser runs this exact work in a
 * module worker; Node and unsupported browsers retain a deterministic direct
 * fallback. Keeping the sampler exported also makes its provenance testable
 * without WebGL.
 */
export function sampleGarageMapStageData(mapId: string): GarageMapStageSample {
  const config = getMapConfig(mapId) as BattlefieldMapConfig & MapStageConfig;
  const heightField = createHeightField(
    1337,
    config as unknown as Parameters<typeof createHeightField>[1],
  );
  const beat = tacticalBeat(config);
  const anchor = findStageAnchor(heightField, beat);
  const anchorY = heightField.getHeightAt(anchor.x, anchor.z);
  const terrain = sampleTerrainPatch(config, heightField, anchor, anchorY);
  const structureId = beat.structure || '';
  const [landmarkX, landmarkZ] = mapToLocal(beat.x, beat.z, anchor);
  const landmarkLocal = DESTRUCTIBLE_BUILDING_TYPES[structureId]
    ? Object.freeze([
      +landmarkX.toFixed(2),
      +(heightField.getHeightAt(beat.x, beat.z) - anchorY + 0.04).toFixed(2),
      +landmarkZ.toFixed(2),
    ] as [number, number, number])
    : null;
  return {
    mapId,
    anchor: { x: anchor.x, z: anchor.z, y: anchorY, yaw: anchor.yaw },
    beat,
    structureId,
    landmarkLocal,
    ...terrain,
    trees: sampleTreePlacements(config, heightField, anchor, anchorY),
  };
}

function loadGarageMapStageData(mapId: string): Promise<GarageMapStageSample> {
  if (typeof Worker === 'undefined') return Promise.resolve(sampleGarageMapStageData(mapId));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./garageMapStage.worker.ts', import.meta.url), {
      type: 'module',
      name: `garage-map-${mapId}`,
    });
    const close = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<GarageMapStageSample>) => {
      close();
      resolve(event.data);
    };
    worker.onerror = (event) => {
      close();
      reject(new Error(event.message || `garage map worker failed for ${mapId}`));
    };
    worker.postMessage(mapId);
  });
}

export async function createGarageMapStage(
  engineCtx: EngineContext,
  mapId: string,
): Promise<GarageMapStage> {
  const config = getMapConfig(mapId) as BattlefieldMapConfig & MapStageConfig;
  const sample = await loadGarageMapStageData(mapId);
  const { beat, structureId } = sample;
  const group = new THREE.Group();
  group.name = `garage_canonical_map_slice_${mapId}`;
  group.userData.sourceMapId = mapId;

  const terrain = createTerrainPatch(sample);
  engineCtx.setupShadowMaterial?.(terrain.material as THREE.Material);
  group.add(terrain);
  await nextPaint();

  const horizon = createMapHorizon(config);
  group.add(horizon);

  const skyMaterial = new THREE.MeshBasicMaterial({
    color: config.sky?.fogTintHex ?? 0x8395a1,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skyGeometry = new THREE.SphereGeometry(92, 24, 10);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.name = 'canonical_map_sky';
  sky.position.y = -18;
  sky.renderOrder = -100;
  sky.frustumCulled = false;
  group.add(sky);
  await nextPaint();

  let structureGeometry: THREE.BufferGeometry | null = null;
  let structureMaterial: THREE.MeshStandardMaterial | null = null;
  let sourceLandmarkLocal: readonly [number, number, number] | null = null;
  const structureMeta = DESTRUCTIBLE_BUILDING_TYPES[structureId];
  if (structureMeta && sample.landmarkLocal) {
    structureGeometry = structureMeta.build(mulberry32(idHash(mapId) ^ 0x9183));
    structureMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: structureMeta.surfaceMaterial === 'structureMetal' ? 0.72 : 0.94,
      metalness: structureMeta.surfaceMaterial === 'structureMetal' ? 0.12 : 0,
    });
    engineCtx.setupShadowMaterial?.(structureMaterial);
    const landmark = new THREE.Mesh(structureGeometry, structureMaterial);
    const [lx, ly, lz] = sample.landmarkLocal;
    landmark.name = `canonical_map_landmark_${structureId}`;
    landmark.position.set(lx, ly, lz);
    landmark.rotation.y = THREE.MathUtils.degToRad(beat.yawDeg || 0) - sample.anchor.yaw;
    landmark.castShadow = true;
    landmark.receiveShadow = true;
    group.add(landmark);
    sourceLandmarkLocal = Object.freeze([
      +landmark.position.x.toFixed(2),
      +landmark.position.y.toFixed(2),
      +landmark.position.z.toFixed(2),
    ]);
  }

  const trees = await createTreeInstances(engineCtx, config, sample.trees, group);
  await nextPaint();

  let objects = 0;
  let triangles = 0;
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    objects++;
    const geometry = object.geometry;
    const one = (geometry.index ? geometry.index.count : geometry.attributes.position?.count || 0) / 3;
    triangles += one * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });
  group.userData.objects = objects;
  group.userData.triangles = Math.round(triangles);
  group.userData.mapSourceReceipt = 'canonical-map-slice';

  const stats: GarageMapStageStats = {
    ready: true,
    source: 'canonical-map-slice',
    mapId,
    sourceCoordinate: Object.freeze([+sample.anchor.x.toFixed(2), +sample.anchor.z.toFixed(2)]),
    sourceBeat: beat.id || `${mapId}-deployment`,
    sourceStructure: structureId,
    sourceLandmarkLocal,
    terrainVertices: (PATCH_SEGMENTS + 1) ** 2,
    treeSpecies: Object.freeze([...trees.species]),
    trees: trees.count,
  };
  Object.assign(group.userData, stats);

  return {
    group,
    stats,
    dispose() {
      group.removeFromParent();
      (terrain.geometry as THREE.BufferGeometry).dispose();
      (terrain.material as THREE.Material).dispose();
      const horizonMaterial = horizon.material;
      horizon.geometry.dispose();
      if (Array.isArray(horizonMaterial)) horizonMaterial.forEach((material) => material.dispose());
      else horizonMaterial.dispose();
      structureGeometry?.dispose();
      structureMaterial?.dispose();
      skyGeometry.dispose();
      skyMaterial.dispose();
      for (const kit of trees.kits) kit.dispose();
    },
  };
}
