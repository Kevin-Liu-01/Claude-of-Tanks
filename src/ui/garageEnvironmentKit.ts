import * as THREE from 'three';

import type { GarageVariant } from '../game/garageVariants.ts';

interface GarageEnvironmentEngineContext {
  setupShadowMaterial?(material: THREE.Material): void;
}

export interface GarageEnvironmentStats {
  readonly distinctiveElements: readonly string[];
  readonly enclosingSurfaces: number;
  readonly landmarkHeightM: number;
  readonly objects: number;
  readonly serviceFrame: string;
  readonly signature: string;
  readonly sourceBeat: string;
  readonly sourceLandmarkLocal: readonly [number, number, number];
  readonly sourceStructure: string;
  readonly terrainProfile: string;
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
  rx?: number, ry?: number, rz?: number,
];

interface EnvironmentPalette {
  ground: number;
  groundHigh: number;
  structure: number;
  trim: number;
  vegetation: number;
  rock: number;
  concrete: number;
  glow: number;
}

const ENVIRONMENT_PALETTES: Readonly<Record<string, EnvironmentPalette>> = Object.freeze({
  desert: { ground: 0x76593e, groundHigh: 0xc19a66, structure: 0x625744, trim: 0xc59545, vegetation: 0x4c5935, rock: 0x79553c, concrete: 0x777065, glow: 0xffc15b },
  winter: { ground: 0xaab9c0, groundHigh: 0xf0f4f2, structure: 0x45535c, trim: 0x82abc0, vegetation: 0x274239, rock: 0x5d696d, concrete: 0x68757a, glow: 0xffcc83 },
  urban: { ground: 0x484b4b, groundHigh: 0x767a79, structure: 0x55443b, trim: 0xa66b42, vegetation: 0x36503b, rock: 0x515150, concrete: 0x666a69, glow: 0xffb361 },
  coastal: { ground: 0x4d6267, groundHigh: 0x829494, structure: 0x38525b, trim: 0x55a9b3, vegetation: 0x416c5b, rock: 0x53696d, concrete: 0x708083, glow: 0xffc46b },
  railyard: { ground: 0x403d39, groundHigh: 0x71675a, structure: 0x514238, trim: 0xb36e35, vegetation: 0x3f4e39, rock: 0x544a42, concrete: 0x625e58, glow: 0xffa852 },
  monsoon: { ground: 0x394f46, groundHigh: 0x708a73, structure: 0x354d46, trim: 0x5fa977, vegetation: 0x20583a, rock: 0x40584d, concrete: 0x66746c, glow: 0xffd074 },
  alpine: { ground: 0x596669, groundHigh: 0xd6e0e1, structure: 0x465359, trim: 0x89a9b6, vegetation: 0x29473c, rock: 0x4e5c61, concrete: 0x6a7375, glow: 0xffc575 },
  badlands: { ground: 0x724937, groundHigh: 0xb6754d, structure: 0x5b443a, trim: 0xc16334, vegetation: 0x4e5134, rock: 0x744637, concrete: 0x73645b, glow: 0xffa450 },
  foundry: { ground: 0x3d3b38, groundHigh: 0x6f6254, structure: 0x343638, trim: 0xb35c2c, vegetation: 0x3d493c, rock: 0x4d4541, concrete: 0x555453, glow: 0xff6a20 },
});

const TERRAIN_SIZE_M = 92;
const TERRAIN_SEGMENTS = 24;

function variantSeed(variant: GarageVariant): number {
  let hash = 0x811c9dc5;
  for (const character of variant.id) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function terrainHeight(mapId: string, x: number, z: number, seed: number): number {
  const exterior = THREE.MathUtils.smoothstep(Math.hypot(x, z), 24, 42);
  const phase = (seed & 0xffff) * 0.00017;
  let height = 0;
  switch (mapId) {
    case 'desert': height = 1.1 + Math.sin(x * 0.075 + phase) * 1.6 + Math.cos(z * 0.105 - phase) * 0.8; break;
    case 'winter': height = 1.5 + Math.sin((x + z) * 0.055) * 1.05 + Math.max(0, Math.cos(x * 0.095 + phase)) * 1.5; break;
    case 'urban':
    case 'coastal':
    case 'railyard':
    case 'foundry': height = 0.4 + Math.sin(x * 0.11 + phase) * 0.32 + Math.cos(z * 0.12) * 0.24; break;
    case 'monsoon': height = 0.8 + Math.sin(x * 0.08 + phase) * 1.1 + Math.sin(z * 0.095 - phase) * 0.85; break;
    case 'alpine': height = 1 + Math.max(0, (-z - 14) * 0.13) + Math.sin(x * 0.09 + phase) * 1.2; break;
    case 'badlands': {
      const raw = 1.2 + Math.sin(x * 0.07 + phase) * 1.6 + Math.cos(z * 0.075) * 1.25;
      height = Math.round(raw * 0.75) / 0.75;
      break;
    }
    default: height = Math.sin(x * 0.09 + phase) + Math.cos(z * 0.08 - phase);
  }
  return exterior * height;
}

function freezeTransform(object: THREE.Object3D): void {
  object.updateMatrix();
  object.matrixAutoUpdate = false;
}

/** Build a lightweight Garage vignette with no battle-map runtime imports. */
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
    terrain: material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 })),
    hardstand: material(new THREE.MeshStandardMaterial({ color: palette.concrete, roughness: 0.91, metalness: 0.03 })),
    structure: material(new THREE.MeshStandardMaterial({ color: palette.structure, roughness: 0.69, metalness: 0.34 })),
    trim: material(new THREE.MeshStandardMaterial({ color: palette.trim, roughness: 0.53, metalness: 0.44 })),
    dark: material(new THREE.MeshStandardMaterial({ color: 0x202629, roughness: 0.72, metalness: 0.5 })),
    vegetation: material(new THREE.MeshStandardMaterial({ color: palette.vegetation, roughness: 0.94 })),
    rock: material(new THREE.MeshStandardMaterial({ color: palette.rock, roughness: 0.98, flatShading: true })),
    window: material(new THREE.MeshPhysicalMaterial({ color: 0x172a31, roughness: 0.2, metalness: 0.15, clearcoat: 0.45 })),
    glow: material(new THREE.MeshStandardMaterial({ color: palette.glow, emissive: palette.glow, emissiveIntensity: variant.mapId === 'foundry' ? 3.2 : 1.25, roughness: 0.45 })),
  };
  const box = track(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = track(new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
  const rockGeometry = track(new THREE.DodecahedronGeometry(1, 0));

  const put = (name: string, geometry: THREE.BufferGeometry, mat: THREE.Material,
    transform: Transform, parent: THREE.Object3D = root, castShadow = true): THREE.Mesh => {
    const [x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0] = transform;
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    freezeTransform(mesh);
    return mesh;
  };

  const putInstances = (name: string, geometry: THREE.BufferGeometry, mat: THREE.Material,
    transforms: readonly Transform[], castShadow = false): THREE.InstancedMesh => {
    const instances = new THREE.InstancedMesh(geometry, mat, transforms.length);
    instances.name = name;
    instances.castShadow = castShadow;
    instances.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    transforms.forEach(([x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0], index) => {
      position.set(x, y, z); euler.set(rx, ry, rz); quaternion.setFromEuler(euler); scale.set(sx, sy, sz);
      instances.setMatrixAt(index, matrix.compose(position, quaternion, scale));
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    instances.computeBoundingBox();
    instances.computeBoundingSphere();
    root.add(instances);
    freezeTransform(instances);
    return instances;
  };

  const beam = (name: string, start: readonly [number, number, number], end: readonly [number, number, number],
    thickness: number, mat: THREE.Material = mats.structure): THREE.Mesh => {
    const a = new THREE.Vector3(...start);
    const b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a);
    const mesh = new THREE.Mesh(box, mat);
    mesh.name = name;
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    mesh.scale.set(thickness, direction.length(), thickness);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    freezeTransform(mesh);
    return mesh;
  };

  const terrain = track(new THREE.PlaneGeometry(TERRAIN_SIZE_M, TERRAIN_SIZE_M, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS));
  const positions = terrain.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const low = new THREE.Color(palette.ground);
  const high = new THREE.Color(palette.groundHigh);
  const sample = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getY(index);
    const height = terrainHeight(variant.mapId, x, z, seed);
    positions.setZ(index, height);
    const shade = THREE.MathUtils.clamp(0.28 + height * 0.08 + Math.sin(x * 0.17 + z * 0.11 + seed * 0.00001) * 0.09, 0, 1);
    sample.copy(low).lerp(high, shade);
    colors[index * 3] = sample.r; colors[index * 3 + 1] = sample.g; colors[index * 3 + 2] = sample.b;
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrain.computeVertexNormals();
  const terrainMesh = put('terrain_profile', terrain, mats.terrain, [0, -0.12, 0, 1, 1, 1], root, false);
  terrainMesh.rotation.x = -Math.PI / 2;
  terrainMesh.updateMatrix();

  // A broad rectangular apron gives the hero tank breathing room and removes
  // the repeated toy-like circular slab from the former environments.
  put('service_hardstand', box, mats.hardstand, [0, -0.12, 0, 50, 0.22, 42], root, false);
  putInstances('hardstand_edge_blocks', box, mats.trim, [
    [-23, 0.05, -20.4, 3.5, 0.12, 0.2], [-15, 0.05, -20.4, 3.5, 0.12, 0.2],
    [15, 0.05, -20.4, 3.5, 0.12, 0.2], [23, 0.05, -20.4, 3.5, 0.12, 0.2],
  ]);

  const trees: Transform[] = [];
  const rocks: Transform[] = [];
  const treeSpecies: string[] = [];
  const addTreeLine = (species: string, count: number, radius: number, height = 1): void => {
    treeSpecies.push(species);
    for (let index = 0; index < count; index += 1) {
      const angle = -2.8 + (index / Math.max(1, count - 1)) * 2.1;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius - 4;
      const groundY = terrainHeight(variant.mapId, x, z, seed);
      trees.push([x, groundY + 2.4 * height, z, 1.2 * height, 4.8 * height, 1.2 * height, 0, angle]);
    }
  };
  const addRockLine = (count: number, backZ = -30, scale = 1): void => {
    for (let index = 0; index < count; index += 1) {
      const x = -31 + index * (62 / Math.max(1, count - 1));
      const z = backZ - ((index * 11 + seed) % 5);
      const size = scale * (1.2 + ((index * 7 + seed) % 5) * 0.23);
      rocks.push([x, terrainHeight(variant.mapId, x, z, seed) + size * 0.45, z, size * 1.5, size, size, 0, index * 0.41]);
    }
  };
  const flushLandscape = (): void => {
    if (rocks.length) putInstances('landscape_rocks', rockGeometry, mats.rock, rocks);
    if (!trees.length) return;
    const trunks: Transform[] = [];
    const crowns: Transform[] = [];
    for (const [x, y, z, sx, sy, sz, rx, ry] of trees) {
      trunks.push([x, y - sy * 0.22, z, 0.22 * sx, sy * 0.55, 0.22 * sz, rx, ry]);
      crowns.push([x, y + sy * 0.25, z, sx, sy * 0.72, sz, rx, ry]);
    }
    putInstances('tree_trunks', track(new THREE.CylinderGeometry(0.5, 0.65, 1, 6)), mats.dark, trunks);
    putInstances('tree_crowns', track(new THREE.ConeGeometry(0.8, 1, 7)), mats.vegetation, crowns);
  };

  const connectedPortal = (name: string, centerX: number, centerZ: number, width: number,
    height: number, depth: number, roof: boolean): void => {
    const left = centerX - width / 2;
    const right = centerX + width / 2;
    for (const x of [left, right]) {
      beam(`${name}_post`, [x, 0, centerZ - depth / 2], [x, height, centerZ - depth / 2], 0.34);
      beam(`${name}_post`, [x, 0, centerZ + depth / 2], [x, height, centerZ + depth / 2], 0.34);
    }
    beam(`${name}_front_header`, [left, height, centerZ + depth / 2], [right, height, centerZ + depth / 2], 0.36, mats.trim);
    beam(`${name}_rear_header`, [left, height, centerZ - depth / 2], [right, height, centerZ - depth / 2], 0.36, mats.trim);
    beam(`${name}_left_rail`, [left, height, centerZ - depth / 2], [left, height, centerZ + depth / 2], 0.28);
    beam(`${name}_right_rail`, [right, height, centerZ - depth / 2], [right, height, centerZ + depth / 2], 0.28);
    if (roof) put(`${name}_roof`, box, mats.structure, [centerX, height + 0.08, centerZ, width + 0.8, 0.18, depth + 0.8]);
    beam(`${name}_left_brace`, [left, height * 0.55, centerZ + depth / 2], [left + 2.8, height, centerZ + depth / 2], 0.16, mats.trim);
    beam(`${name}_right_brace`, [right, height * 0.55, centerZ + depth / 2], [right - 2.8, height, centerZ + depth / 2], 0.16, mats.trim);
  };

  const rails = (name: string, centerX: number, centerZ: number, length = 40): void => {
    putInstances(`${name}_rails`, box, mats.dark, [
      [centerX - 0.78, 0.08, centerZ, 0.11, 0.11, length], [centerX + 0.78, 0.08, centerZ, 0.11, 0.11, length],
    ]);
    const sleepers: Transform[] = [];
    for (let z = -length / 2; z <= length / 2; z += 1.35) sleepers.push([centerX, 0.01, centerZ + z, 2.25, 0.08, 0.18]);
    putInstances(`${name}_sleepers`, box, mats.structure, sleepers);
  };
  const windows = (name: string, xs: readonly number[], y: number, z: number): void => {
    putInstances(name, box, mats.window, xs.map((x) => [x, y, z, 2.8, 1.25, 0.12] as Transform));
  };
  const serviceLights = (name: string, xs: readonly number[], y: number, z: number): void => {
    putInstances(name, box, mats.glow, xs.map((x) => [x, y, z, 1, 0.1, 0.18] as Transform));
  };

  let sourceStructure: string = variant.architecture;
  let sourceBeat = '';
  let serviceFrame = '';
  let terrainProfile = '';
  let landmarkHeightM = 0;
  let landmark: [number, number, number] = [0, 0, -20];
  let distinctiveElements: string[] = [];

  switch (variant.architecture) {
    case 'shade_depot': {
      connectedPortal('desert_shade', -3, -18, 30, 6.7, 13, true);
      put('desert_wind_wall', box, mats.structure, [-20, 2.6, -18, 0.7, 5.2, 24]);
      putInstances('hesco_barriers', box, mats.rock, [
        [15, 0.9, -27, 3.8, 1.8, 1.4], [19, 0.9, -27, 3.8, 1.8, 1.4],
        [23, 0.9, -27, 3.8, 1.8, 1.4], [23, 0.9, -23.8, 3.8, 1.8, 1.4, 0, Math.PI / 2],
      ], true);
      beam('desert_radio_mast', [19, 0, -14], [19, 11.5, -14], 0.14, mats.dark);
      beam('desert_radio_stay', [19, 8.5, -14], [16, 0, -17], 0.055, mats.dark);
      serviceLights('desert_service_lights', [-11, -3, 5], 6.55, -11.5);
      addRockLine(8, -34, 0.75);
      sourceBeat = 'wadi-forward-shade'; serviceFrame = 'wide shade depot';
      terrainProfile = 'low wind-cut dunes and wadi shoulder'; landmarkHeightM = 11.5;
      landmark = [19, 11.5, -14];
      distinctiveElements = ['connected shade canopy', 'HESCO wind wall', 'stayed radio mast', 'dune horizon'];
      break;
    }
    case 'repair_bunker': {
      put('winter_bunker_back', box, mats.structure, [0, 3.7, -25, 35, 7.4, 1.2]);
      put('winter_bunker_roof', box, mats.rock, [0, 7.25, -20.5, 37, 1, 10]);
      put('winter_bunker_left', box, mats.structure, [-16.8, 3.4, -20.5, 1.1, 6.8, 10]);
      put('winter_bunker_right', box, mats.structure, [16.8, 3.4, -20.5, 1.1, 6.8, 10]);
      beam('winter_portal_header', [-16.8, 6.7, -15.5], [16.8, 6.7, -15.5], 0.45, mats.trim);
      windows('winter_bunker_windows', [-11, -5.5, 5.5, 11], 4.3, -24.35);
      serviceLights('winter_bunker_lights', [-8, 0, 8], 6.45, -15.2);
      putInstances('winter_snow_banks', rockGeometry, mats.terrain, [
        [-19, 1.3, -22, 5, 1.5, 7], [20, 1.5, -23, 6, 1.8, 8], [-12, 1, -31, 8, 1.4, 4], [12, 1, -31, 8, 1.4, 4],
      ]);
      addTreeLine('frosthollow-spruce', 10, 42, 1.05);
      sourceBeat = 'frosthollow-repair-bunker'; serviceFrame = 'bermed concrete repair bunker';
      terrainProfile = 'snow berms over a frozen rolling shelf'; landmarkHeightM = 7.75;
      landmark = [0, 7.75, -20.5];
      distinctiveElements = ['buried bunker portal', 'snow-loaded roof', 'warm service lamps', 'spruce horizon'];
      break;
    }
    case 'brick_arsenal': {
      put('urban_arsenal_wall', box, mats.structure, [0, 5.1, -25, 38, 10.2, 1.2]);
      putInstances('urban_arsenal_piers', box, mats.trim, [-17, -11, -5, 1, 7, 13, 17].map((x) => [x, 5.2, -24.25, 0.45, 10.4, 0.28] as Transform));
      windows('urban_upper_windows', [-14, -8, -2, 4, 10, 16], 7.2, -24.28);
      putInstances('urban_loading_doors', box, mats.dark, [
        [-10, 2.6, -24.25, 5.4, 5.2, 0.25], [0, 2.6, -24.25, 5.4, 5.2, 0.25], [10, 2.6, -24.25, 5.4, 5.2, 0.25],
      ]);
      put('urban_loading_canopy', box, mats.structure, [0, 5.6, -18.5, 28, 0.28, 11]);
      beam('urban_canopy_left_stay', [-13.8, 5.6, -13], [-13.8, 0, -13], 0.25);
      beam('urban_canopy_right_stay', [13.8, 5.6, -13], [13.8, 0, -13], 0.25);
      serviceLights('urban_door_lights', [-10, 0, 10], 5.35, -18.15);
      sourceBeat = 'steinburg-brick-arsenal'; serviceFrame = 'two-story arsenal loading court';
      terrainProfile = 'level city hardstand with broken masonry verge'; landmarkHeightM = 10.2;
      landmark = [0, 10.2, -25];
      distinctiveElements = ['brick pier rhythm', 'three loading doors', 'upper clerestory', 'deep loading canopy'];
      break;
    }
    case 'naval_drydock': {
      rails('coastal_drydock_left', -11, -7, 46); rails('coastal_drydock_right', 11, -7, 46);
      put('coastal_dock_trench', box, mats.dark, [0, -0.04, -15, 11, 0.10, 36], root, false);
      connectedPortal('coastal_gantry', 0, -19, 34, 10.5, 7, false);
      beam('coastal_crane_bridge', [-17, 10.5, -19], [17, 10.5, -19], 0.65, mats.trim);
      beam('coastal_crane_trolley', [4, 10.5, -19], [4, 7, -19], 0.17, mats.dark);
      put('coastal_crane_hook', cylinder, mats.dark, [4, 6.5, -19, 0.42, 1, 0.42]);
      putInstances('coastal_bollards', cylinder, mats.trim, [
        [-20, 0.55, -8, 0.7, 1.1, 0.7], [-20, 0.55, -17, 0.7, 1.1, 0.7], [20, 0.55, -8, 0.7, 1.1, 0.7], [20, 0.55, -17, 0.7, 1.1, 0.7],
      ]);
      put('coastal_warehouse', box, mats.structure, [-25, 4.2, -27, 14, 8.4, 9]);
      windows('coastal_warehouse_windows', [-29, -25, -21], 5.4, -22.44);
      sourceBeat = 'saltmere-drydock-apron'; serviceFrame = 'rail-mounted drydock gantry';
      terrainProfile = 'flat salt-weathered apron and recessed dock trench'; landmarkHeightM = 11.15;
      landmark = [0, 11.15, -19];
      distinctiveElements = ['twin dock rails', 'connected crane gantry', 'recessed service trench', 'waterside warehouse'];
      break;
    }
    case 'rail_roundhouse': {
      for (const x of [-8, 0, 8]) rails(`railyard_track_${x}`, x, -8, 45);
      put('railyard_roundhouse_back', box, mats.structure, [0, 4.4, -27, 40, 8.8, 1.2]);
      putInstances('railyard_roundhouse_bays', box, mats.dark, [
        [-12, 3.4, -26.25, 7.2, 6.8, 0.3], [0, 3.4, -26.25, 7.2, 6.8, 0.3], [12, 3.4, -26.25, 7.2, 6.8, 0.3],
      ]);
      for (const x of [-16, -8, 0, 8, 16]) beam('railyard_roundhouse_pier', [x, 0, -25.8], [x, 8.8, -25.8], 0.34, mats.trim);
      beam('railyard_roundhouse_roof_left', [-20, 8.8, -27], [0, 11.3, -27], 0.44);
      beam('railyard_roundhouse_roof_right', [0, 11.3, -27], [20, 8.8, -27], 0.44);
      beam('railyard_signal_mast', [20, 0, -8], [20, 8.8, -8], 0.18, mats.dark);
      putInstances('railyard_signal_lamps', cylinder, mats.glow, [
        [20, 7.6, -8, 0.7, 0.35, 0.7, Math.PI / 2], [20, 6.3, -8, 0.7, 0.35, 0.7, Math.PI / 2],
      ]);
      sourceBeat = 'cinder-roundhouse-road'; serviceFrame = 'three-road roundhouse apron';
      terrainProfile = 'flat cinder ballast crossed by service tracks'; landmarkHeightM = 11.3;
      landmark = [0, 11.3, -27];
      distinctiveElements = ['three service roads', 'gabled roundhouse', 'rail signal mast', 'ballast apron'];
      break;
    }
    case 'rain_canopy': {
      connectedPortal('monsoon_canopy', -2, -18, 32, 7.2, 15, true);
      put('monsoon_roof_ridge', box, mats.trim, [-2, 7.48, -18, 33, 0.25, 0.32]);
      putInstances('monsoon_downpipes', cylinder, mats.trim, [
        [-18.2, 3.4, -10.5, 0.25, 6.8, 0.25], [14.2, 3.4, -10.5, 0.25, 6.8, 0.25],
        [-18.2, 3.4, -25.5, 0.25, 6.8, 0.25], [14.2, 3.4, -25.5, 0.25, 6.8, 0.25],
      ]);
      put('monsoon_drainage_channel', box, mats.dark, [19, -0.01, 0, 2.1, 0.08, 40], root, false);
      putInstances('monsoon_channel_grates', box, mats.trim, Array.from({ length: 14 }, (_, index) => [19, 0.05, -18 + index * 2.8, 2, 0.07, 0.16] as Transform));
      serviceLights('monsoon_service_lights', [-10, -2, 6], 7.05, -10.3);
      addTreeLine('monsoon-broadleaf', 14, 40, 1.1);
      sourceBeat = 'monsoon-drainage-bay'; serviceFrame = 'deep monsoon rain canopy';
      terrainProfile = 'wet rolling terrace with a grated runoff channel'; landmarkHeightM = 7.6;
      landmark = [-2, 7.6, -18];
      distinctiveElements = ['connected rain canopy', 'four downpipes', 'grated runoff channel', 'dense broadleaf edge'];
      break;
    }
    case 'rock_cavern': {
      putInstances('alpine_cavern_mass', rockGeometry, mats.rock, [
        [-18, 4, -23, 7.5, 8, 6.5, 0, 0.22], [-12, 7, -27, 8, 10, 7, 0, -0.18],
        [18, 4.2, -23, 7.5, 8.4, 6.5, 0, -0.25], [12, 7.2, -27, 8, 10.5, 7, 0, 0.17], [0, 11.4, -28, 16, 5.4, 7],
      ]);
      connectedPortal('alpine_service_portal', 0, -18, 27, 7.2, 4.5, false);
      put('alpine_blast_door_left', box, mats.dark, [-10.4, 3.5, -20.4, 6, 7, 0.4, 0, 0.17]);
      put('alpine_blast_door_right', box, mats.dark, [10.4, 3.5, -20.4, 6, 7, 0.4, 0, -0.17]);
      serviceLights('alpine_portal_lights', [-9, 0, 9], 6.9, -15.7);
      addTreeLine('alpine-spruce', 9, 43, 0.95);
      sourceBeat = 'glacier-service-cavern'; serviceFrame = 'reinforced cavern service portal';
      terrainProfile = 'rising rock-and-snow shelf into a cavern wall'; landmarkHeightM = 16.8;
      landmark = [0, 16.8, -28];
      distinctiveElements = ['massive rock arch', 'reinforced steel portal', 'split blast doors', 'alpine spruce edge'];
      break;
    }
    case 'recovery_yard': {
      beam('recovery_left_leg', [-15, 0, -19], [-7, 11, -19], 0.55);
      beam('recovery_right_leg', [15, 0, -19], [7, 11, -19], 0.55);
      beam('recovery_bridge', [-7, 11, -19], [7, 11, -19], 0.68, mats.trim);
      beam('recovery_ground_tie', [-15, 0, -19], [15, 0, -19], 0.25, mats.dark);
      beam('recovery_cable', [0, 11, -19], [0, 5.2, -19], 0.12, mats.dark);
      put('recovery_hook', cylinder, mats.dark, [0, 4.7, -19, 0.55, 1, 0.55]);
      putInstances('recovery_ground_feet', box, mats.dark, [[-15, 0.2, -19, 3.8, 0.4, 3.2], [15, 0.2, -19, 3.8, 0.4, 3.2]]);
      putInstances('recovery_spares', cylinder, mats.dark, [
        [-20, 1, -9, 2, 0.7, 2, Math.PI / 2], [-20, 2.6, -9, 2, 0.7, 2, Math.PI / 2], [20, 1, -12, 2, 0.7, 2, Math.PI / 2],
      ]);
      put('recovery_service_container', box, mats.structure, [22, 2.2, -25, 9, 4.4, 5]);
      addRockLine(10, -33, 1.35);
      sourceBeat = 'redrock-heavy-recovery'; serviceFrame = 'braced heavy recovery A-frame';
      terrainProfile = 'terraced red-rock yard below a mesa rim'; landmarkHeightM = 11.7;
      landmark = [0, 11.7, -19];
      distinctiveElements = ['connected A-frame crane', 'hanging recovery hook', 'spare road wheels', 'mesa skyline'];
      break;
    }
    case 'factory_line': {
      put('foundry_hall_back', box, mats.structure, [0, 5, -27, 40, 10, 1.2]);
      connectedPortal('foundry_service_gantry', 0, -16, 32, 8.8, 12, false);
      putInstances('foundry_stacks', cylinder, mats.dark, [
        [-17, 8, -28, 2, 16, 2], [-11, 6.5, -29, 1.5, 13, 1.5], [12, 7.5, -29, 1.8, 15, 1.8], [18, 9, -28, 2.2, 18, 2.2],
      ], true);
      beam('foundry_pipe_low', [-20, 4.1, -24.5], [20, 4.1, -24.5], 0.38, mats.trim);
      beam('foundry_pipe_high', [-20, 7, -24.5], [20, 7, -24.5], 0.32, mats.trim);
      put('foundry_furnace', box, mats.dark, [-22, 3.4, -19, 8, 6.8, 8]);
      put('foundry_furnace_mouth', box, mats.glow, [-17.9, 2.3, -19, 0.2, 3.8, 4.2]);
      put('foundry_slag_channel', box, mats.glow, [-10, 0.02, -19, 15, 0.09, 1.6], root, false);
      windows('foundry_clerestory', [-13, -6.5, 0, 6.5, 13], 7.8, -26.3);
      sourceBeat = 'ironworks-service-line'; serviceFrame = 'overhead steelworks service gantry';
      terrainProfile = 'flat cinder apron with slag-lined industrial edge'; landmarkHeightM = 18;
      landmark = [18, 18, -28];
      distinctiveElements = ['four furnace stacks', 'connected overhead gantry', 'glowing furnace mouth', 'slag channel'];
      break;
    }
    default:
      sourceStructure = 'garage-service-hardstand'; sourceBeat = 'purpose-built-service-hardstand';
      serviceFrame = 'open service hardstand'; terrainProfile = 'graded field workshop apron'; landmarkHeightM = 1;
      distinctiveElements = ['rectangular hardstand', 'painted service edge', 'open hero framing'];
      addTreeLine('garage-field-tree', 8, 42);
  }

  flushLandscape();
  root.updateMatrixWorld(true);
  let objects = 0;
  let triangles = 0;
  const names = new Set<string>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    objects += 1;
    names.add(mesh.name);
    const one = (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position')?.count ?? 0) / 3;
    triangles += one * (mesh instanceof THREE.InstancedMesh ? mesh.count : 1);
  });
  const stats: GarageEnvironmentStats = Object.freeze({
    distinctiveElements: Object.freeze(distinctiveElements), enclosingSurfaces: 0, landmarkHeightM, objects,
    serviceFrame, signature: `${variant.architecture}:${terrainProfile}:${serviceFrame}:${objects}:${[...names].sort().join(',')}`,
    sourceBeat, sourceLandmarkLocal: Object.freeze(landmark), sourceStructure, terrainProfile,
    terrainVertices: positions.count, treeSpecies: Object.freeze(treeSpecies), trees: trees.length, triangles: Math.round(triangles),
  });
  Object.assign(root.userData, stats, { ready: true, source: 'custom-garage-environment', mode: 'garage-environment' });
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
