import * as THREE from 'three';

import type { GarageVariant } from '../game/garageVariants.ts';

interface GarageEnvironmentEngineContext {
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface GarageEnvironmentStats {
  readonly enclosingSurfaces: number;
  readonly objects: number;
  readonly signature: string;
  readonly sourceBeat: string;
  readonly sourceLandmarkLocal: readonly [number, number, number];
  readonly sourceStructure: string;
  readonly terrainVertices: number;
  readonly treeSpecies: readonly string[];
  readonly trees: number;
  readonly triangles: number;
}

export interface GarageEnvironmentBuild {
  readonly root: THREE.Group;
  readonly stats: GarageEnvironmentStats;
  dispose(): void;
}

type Transform = readonly [
  x: number, y: number, z: number,
  sx: number, sy: number, sz: number,
  yaw?: number,
];

interface EnvironmentPalette {
  ground: number;
  groundHigh: number;
  structure: number;
  trim: number;
  vegetation: number;
  rock: number;
}

const ENVIRONMENT_PALETTES: Readonly<Record<string, EnvironmentPalette>> = Object.freeze({
  desert: { ground: 0x7d6245, groundHigh: 0xa8875e, structure: 0x6d5b48, trim: 0xb7813e, vegetation: 0x4c5532, rock: 0x70513d },
  winter: { ground: 0xbccbd2, groundHigh: 0xe1e8e9, structure: 0x4d5a62, trim: 0x7898a8, vegetation: 0x324640, rock: 0x56636b },
  urban: { ground: 0x55585a, groundHigh: 0x747778, structure: 0x514842, trim: 0x906b43, vegetation: 0x3f5140, rock: 0x4d4d4c },
  coastal: { ground: 0x55676c, groundHigh: 0x758a8b, structure: 0x40565e, trim: 0x4f98a0, vegetation: 0x496a58, rock: 0x53656a },
  railyard: { ground: 0x4d4843, groundHigh: 0x6a6258, structure: 0x4f4037, trim: 0x9a6638, vegetation: 0x46503c, rock: 0x544a42 },
  monsoon: { ground: 0x455a4e, groundHigh: 0x68806c, structure: 0x3d5148, trim: 0x568d68, vegetation: 0x2d593c, rock: 0x42564a },
  alpine: { ground: 0x657174, groundHigh: 0xc5d2d6, structure: 0x4b555a, trim: 0x819ba6, vegetation: 0x32483f, rock: 0x4d595e },
  badlands: { ground: 0x76503f, groundHigh: 0xa66b4a, structure: 0x60483e, trim: 0xa65e37, vegetation: 0x535035, rock: 0x714638 },
  foundry: { ground: 0x494642, groundHigh: 0x665c52, structure: 0x3d3938, trim: 0xa65c32, vegetation: 0x41483b, rock: 0x4d4541 },
});

const TERRAIN_SIZE_M = 88;
const TERRAIN_SEGMENTS = 24;
const SERVICE_TERRACE_RADIUS_M = 28;

function variantSeed(variant: GarageVariant): number {
  let hash = 0x811c9dc5;
  for (const character of variant.id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function terrainHeight(x: number, z: number, seed: number): number {
  const radius = Math.hypot(x, z);
  const exterior = THREE.MathUtils.smoothstep(
    radius,
    SERVICE_TERRACE_RADIUS_M,
    TERRAIN_SIZE_M * 0.7,
  );
  if (exterior <= 0) return 0;
  const phase = (seed & 0xffff) * 0.00017;
  const relief = Math.sin(x * 0.105 + phase) * 1.45
    + Math.cos(z * 0.082 - phase * 0.7) * 1.15
    + Math.sin((x + z) * 0.048 + phase * 1.3) * 1.6;
  return exterior * (1.0 + relief);
}

function freezeTransform(object: THREE.Object3D): void {
  object.updateMatrix();
  object.matrixAutoUpdate = false;
}

/**
 * Build the small, Garage-only expression of one battlefield. It deliberately
 * owns no battle terrain, collision, destructibles, vegetation simulation, or
 * world services. Static primitives and instances keep the visual identity of
 * the selected map without transferring the map runtime into the Garage.
 */
export function buildGarageEnvironment(
  engineCtx: GarageEnvironmentEngineContext,
  variant: GarageVariant,
): GarageEnvironmentBuild {
  const palette = ENVIRONMENT_PALETTES[variant.mapId] ?? ENVIRONMENT_PALETTES.urban;
  const seed = variantSeed(variant);
  const root = new THREE.Group();
  root.name = `garage_environment_${variant.architecture}`;
  root.userData.perfOwner = 'garage/environment';
  const resources: Array<{ dispose(): void }> = [];
  const track = <T extends { dispose(): void }>(value: T): T => {
    resources.push(value);
    return value;
  };
  const material = <T extends THREE.Material>(value: T): T => {
    engineCtx.setupShadowMaterial?.(value);
    return track(value);
  };

  const mats = {
    terrain: material(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.94, metalness: 0,
    })),
    hardstand: material(new THREE.MeshStandardMaterial({
      color: palette.ground, roughness: 0.9, metalness: 0.02,
    })),
    structure: material(new THREE.MeshStandardMaterial({
      color: palette.structure, roughness: 0.68, metalness: 0.34,
    })),
    trim: material(new THREE.MeshStandardMaterial({
      color: palette.trim, roughness: 0.55, metalness: 0.5,
    })),
    dark: material(new THREE.MeshStandardMaterial({
      color: 0x252a2c, roughness: 0.7, metalness: 0.48,
    })),
    vegetation: material(new THREE.MeshStandardMaterial({
      color: palette.vegetation, roughness: 0.92, metalness: 0,
    })),
    rock: material(new THREE.MeshStandardMaterial({
      color: palette.rock, roughness: 0.96, metalness: 0,
      flatShading: true,
    })),
  };
  const box = track(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = track(new THREE.CylinderGeometry(0.5, 0.5, 1, 12));

  const put = (
    name: string,
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    transform: Transform,
    parent: THREE.Object3D = root,
    castShadow = true,
  ): THREE.Mesh => {
    const [x, y, z, sx, sy, sz, yaw = 0] = transform;
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.y = yaw;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    freezeTransform(mesh);
    return mesh;
  };

  const putInstances = (
    name: string,
    geometry: THREE.BufferGeometry,
    mat: THREE.Material,
    transforms: readonly Transform[],
    castShadow = false,
  ): THREE.InstancedMesh => {
    const instances = new THREE.InstancedMesh(geometry, mat, transforms.length);
    instances.name = name;
    instances.castShadow = castShadow;
    instances.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    transforms.forEach(([x, y, z, sx, sy, sz, yaw = 0], index) => {
      position.set(x, y, z);
      quaternion.setFromAxisAngle(up, yaw);
      scale.set(sx, sy, sz);
      matrix.compose(position, quaternion, scale);
      instances.setMatrixAt(index, matrix);
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    root.add(instances);
    freezeTransform(instances);
    return instances;
  };

  const terrain = track(new THREE.PlaneGeometry(
    TERRAIN_SIZE_M,
    TERRAIN_SIZE_M,
    TERRAIN_SEGMENTS,
    TERRAIN_SEGMENTS,
  ));
  const positions = terrain.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const low = new THREE.Color(palette.ground);
  const high = new THREE.Color(palette.groundHigh);
  const sample = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getY(index);
    const height = terrainHeight(x, z, seed);
    positions.setZ(index, height);
    const shade = THREE.MathUtils.clamp(0.34 + height * 0.075
      + Math.sin(x * 0.19 + z * 0.13 + seed * 0.00001) * 0.08, 0, 1);
    sample.copy(low).lerp(high, shade);
    colors[index * 3] = sample.r;
    colors[index * 3 + 1] = sample.g;
    colors[index * 3 + 2] = sample.b;
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrain.computeVertexNormals();
  const terrainMesh = put('garage_environment_terrain', terrain, mats.terrain,
    [0, -0.08, 0, 1, 1, 1], root, false);
  terrainMesh.rotation.x = -Math.PI / 2;
  terrainMesh.updateMatrix();

  // A single low slab makes the four inherited maintenance bays read as one
  // connected service terrace while the outer vertices carry map-like relief.
  put('garage_environment_service_terrace', cylinder, mats.hardstand,
    [0, -0.15, 0, 58, 0.22, 58], root, false);

  const rockGeometry = track(new THREE.DodecahedronGeometry(1, 0));
  const rockTransforms: Transform[] = [];
  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * Math.PI * 2 + (seed % 31) * 0.01;
    const radius = 34 + ((index * 17 + seed) % 9);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = terrainHeight(x, z, seed) + 0.55;
    const size = 0.65 + ((index * 7 + seed) % 8) * 0.11;
    rockTransforms.push([x, y, z, size * 1.35, size, size, angle]);
  }
  putInstances('garage_environment_rocks', rockGeometry, mats.rock, rockTransforms);

  let trees = 0;
  const treeSpecies: string[] = [];
  if (!['desert', 'badlands', 'foundry', 'railyard'].includes(variant.mapId)) {
    const trunkGeometry = track(new THREE.CylinderGeometry(0.12, 0.18, 1, 7));
    const crownGeometry = track(new THREE.ConeGeometry(0.72, 2.4, 8));
    const trunkTransforms: Transform[] = [];
    const crownTransforms: Transform[] = [];
    trees = variant.mapId === 'urban' || variant.mapId === 'coastal' ? 7 : 12;
    for (let index = 0; index < trees; index += 1) {
      const angle = (index / trees) * Math.PI * 2 + 0.34;
      const radius = 35 + ((index * 11 + seed) % 7);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const groundY = terrainHeight(x, z, seed);
      const scaleY = 1.5 + ((index * 5 + seed) % 8) * 0.08;
      trunkTransforms.push([x, groundY + scaleY * 0.5, z, 1, scaleY, 1, angle]);
      crownTransforms.push([x, groundY + scaleY + 1.25, z, 1, 1, 1, angle]);
    }
    putInstances('garage_environment_tree_trunks', trunkGeometry, mats.dark, trunkTransforms);
    putInstances('garage_environment_tree_crowns', crownGeometry, mats.vegetation, crownTransforms);
    treeSpecies.push(variant.weather === 'snow' ? 'garage-spruce' : 'garage-field-tree');
  }

  const frame = (name: string, centerX: number, centerZ: number, width: number,
    height: number, depth: number, canopy = true): void => {
    for (const x of [centerX - width / 2, centerX + width / 2]) {
      for (const z of [centerZ - depth / 2, centerZ + depth / 2]) {
        put(`${name}_post`, box, mats.structure, [x, height / 2, z, 0.28, height, 0.28]);
      }
    }
    put(`${name}_front_header`, box, mats.trim,
      [centerX, height, centerZ + depth / 2, width + 0.5, 0.28, 0.32]);
    put(`${name}_rear_header`, box, mats.trim,
      [centerX, height, centerZ - depth / 2, width + 0.5, 0.28, 0.32]);
    if (canopy) {
      put(`${name}_canopy`, box, mats.structure,
        [centerX, height + 0.12, centerZ, width + 0.6, 0.18, depth + 0.6]);
    }
  };

  const rails = (name: string, centerX: number, centerZ: number, yaw = 0): void => {
    for (const x of [-0.72, 0.72]) {
      put(`${name}_rail`, box, mats.dark,
        [centerX + x, 0.08, centerZ, 0.10, 0.10, 20, yaw], root, false);
    }
    const sleepers: Transform[] = [];
    for (let z = -9; z <= 9; z += 1.2) {
      sleepers.push([centerX, 0.02, centerZ + z, 2.1, 0.08, 0.16, yaw]);
    }
    putInstances(`${name}_sleepers`, box, mats.structure, sleepers);
  };

  let sourceStructure: string = variant.architecture;
  let sourceBeat = 'garage-service-terrace';
  const landmark: [number, number, number] = [0, 0, -24];
  switch (variant.architecture) {
    case 'shade_depot':
      frame('desert_shade_depot', 0, -25, 24, 5.2, 7.2);
      put('desert_wind_wall', box, mats.structure, [-18, 2.2, -22, 0.5, 4.4, 18]);
      sourceBeat = 'wadi-forward-shade';
      break;
    case 'repair_bunker':
      put('winter_bunker_back', box, mats.structure, [0, 3.2, -29, 30, 6.4, 1.2]);
      put('winter_bunker_roof', box, mats.rock, [0, 6.2, -25, 32, 0.8, 9]);
      for (const x of [-13.5, 13.5]) {
        put('winter_bunker_return', box, mats.structure, [x, 3, -25, 1, 6, 8]);
      }
      sourceBeat = 'frosthollow-repair-bunker';
      break;
    case 'brick_arsenal':
      put('urban_arsenal_wall', box, mats.structure, [0, 3.8, -29, 34, 7.6, 1.1]);
      for (const x of [-12, -6, 0, 6, 12]) {
        put('urban_arsenal_pier', box, mats.trim, [x, 3.9, -28.35, 0.45, 7.8, 0.22]);
      }
      put('urban_loading_canopy', box, mats.dark, [0, 5.6, -24, 22, 0.26, 8]);
      sourceBeat = 'steinburg-brick-arsenal';
      break;
    case 'naval_drydock':
      rails('coastal_drydock', -13, -24);
      rails('coastal_drydock', 13, -24);
      frame('coastal_drydock_crane', 0, -29, 28, 7.5, 4.5, false);
      put('coastal_drydock_bridge', box, mats.trim, [0, 7.65, -29, 29, 0.45, 1.0]);
      sourceBeat = 'saltmere-drydock-apron';
      break;
    case 'rail_roundhouse':
      rails('railyard_service_track', 0, -24);
      frame('railyard_roundhouse', 0, -31, 30, 6.5, 8.5);
      put('railyard_roundhouse_back', box, mats.structure, [0, 3.2, -35.2, 30, 6.4, 0.8]);
      sourceBeat = 'cinder-roundhouse-road';
      break;
    case 'rain_canopy':
      frame('monsoon_rain_canopy', 0, -24, 28, 6.4, 9.5);
      for (const x of [-14.4, 14.4]) {
        put('monsoon_gutter', cylinder, mats.trim, [x, 3.1, -24, 0.22, 6.2, 0.22]);
      }
      sourceBeat = 'monsoon-drainage-bay';
      break;
    case 'rock_cavern':
      for (const x of [-16, -11, 11, 16]) {
        put('alpine_cavern_buttress', rockGeometry, mats.rock,
          [x, 3.4, -26, 5.4, 6.8, 4.2, x * 0.02]);
      }
      put('alpine_cavern_lintel', rockGeometry, mats.rock, [0, 7.2, -27, 15, 3.2, 4]);
      sourceBeat = 'glacier-service-cavern';
      break;
    case 'recovery_yard':
      frame('badlands_recovery_frame', 0, -27, 26, 7.4, 5, false);
      put('badlands_recovery_bridge', box, mats.trim, [0, 7.45, -27, 27, 0.48, 0.7]);
      put('badlands_recovery_hook', cylinder, mats.dark, [0, 5.5, -27, 0.2, 3.4, 0.2]);
      sourceBeat = 'redrock-heavy-recovery';
      break;
    case 'factory_line':
      put('foundry_service_wall', box, mats.structure, [0, 3.4, -31, 34, 6.8, 1.2]);
      for (const x of [-14, -8, 8, 14]) {
        put('foundry_stack', cylinder, mats.dark, [x, 6, -30, 1.2, 12, 1.2]);
      }
      for (const y of [2.5, 5.2]) {
        const pipe = put('foundry_pipe', cylinder, mats.trim,
          [0, y, -28.5, 0.34, 28, 0.34], root, true);
        pipe.rotation.z = Math.PI / 2;
        pipe.updateMatrix();
      }
      sourceBeat = 'ironworks-service-line';
      break;
    default:
      sourceStructure = 'garage-service-terrace';
      break;
  }

  root.updateMatrixWorld(true);
  let objects = 0;
  let triangles = 0;
  const names = new Set<string>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    objects += 1;
    names.add(mesh.name);
    const geometryTriangles = (mesh.geometry.index?.count
      ?? mesh.geometry.getAttribute('position')?.count ?? 0) / 3;
    triangles += geometryTriangles * (mesh instanceof THREE.InstancedMesh ? mesh.count : 1);
  });
  const stats: GarageEnvironmentStats = Object.freeze({
    enclosingSurfaces: 0,
    objects,
    signature: `${variant.architecture}:${objects}:${[...names].sort().join(',')}`,
    sourceBeat,
    sourceLandmarkLocal: Object.freeze(landmark),
    sourceStructure,
    terrainVertices: positions.count,
    treeSpecies: Object.freeze(treeSpecies),
    trees,
    triangles: Math.round(triangles),
  });
  Object.assign(root.userData, stats, {
    ready: true,
    source: 'custom-garage-environment',
    mode: 'garage-environment',
  });

  return {
    root,
    stats,
    dispose() {
      root.removeFromParent();
      for (const resource of resources) resource.dispose();
      resources.length = 0;
    },
  };
}
