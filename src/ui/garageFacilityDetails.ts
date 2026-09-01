import * as THREE from 'three';

import type { GarageVariant } from '../game/garageVariants.ts';
import {
  createWorkshopPartLibrary,
  type WorkshopPartKind,
} from '../game/workshopParts.ts';
import type { GeometryBuckets } from '../world/maps/exteriorDetailKit.ts';

export interface GarageFacilityDetailStats {
  readonly facilityProps: number;
  readonly facilityStations: number;
  readonly looseParts: number;
  readonly railSegments: number;
  readonly serviceVehicles: number;
}

export interface GarageFacilityDetailBuild extends GarageFacilityDetailStats {
  readonly meshes: readonly THREE.InstancedMesh[];
  readonly material: THREE.MeshStandardMaterial | null;
}

interface FacilityBuildOptions {
  readonly buckets: GeometryBuckets;
  readonly engineCtx: Readonly<{
    setupShadowMaterial?(material: THREE.Material): void;
  }>;
  readonly groundAtWorld: (x: number, z: number) => number;
  readonly variant: GarageVariant;
}

interface Point {
  readonly x: number;
  readonly z: number;
}

interface AssemblyPlacement {
  readonly kind: WorkshopPartKind;
  readonly side: number;
  readonly depth: number;
  readonly yaw?: number;
  readonly scale?: number;
}

interface PrimitiveInstance {
  readonly matrix: THREE.Matrix4;
  readonly color: THREE.Color;
}

const VIEW_YAW = Math.PI / 4;

function cameraPoint(side: number, depth: number): Point {
  return {
    x: (side - depth) * Math.SQRT1_2,
    z: (-side - depth) * Math.SQRT1_2,
  };
}

function materialColor(material: THREE.Material | THREE.Material[]): THREE.Color {
  const first = Array.isArray(material) ? material[0] : material;
  const value = first as THREE.Material & { color?: THREE.Color };
  return value.color?.clone() || new THREE.Color(0x666a66);
}

function paintGeometry(geometry: THREE.BufferGeometry, color: THREE.Color): void {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) color.toArray(colors, index * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Add the visible parts of a Garage-only workshop LOD to the environment's
 * baked material bucket. The source assembly is never attached to the scene:
 * it is flattened once, merged with every other facility prop, then disposed.
 */
function flattenAssembly(
  buckets: GeometryBuckets,
  assembly: THREE.Object3D,
  placement: AssemblyPlacement,
  groundAtWorld: (x: number, z: number) => number,
): number {
  const point = cameraPoint(placement.side, placement.depth);
  const scale = placement.scale ?? 0.72;
  assembly.position.set(point.x, groundAtWorld(point.x, point.z) + 0.02, point.z);
  assembly.rotation.y = VIEW_YAW + (placement.yaw || 0);
  assembly.scale.setScalar(scale);
  assembly.updateMatrixWorld(true);
  const baked = buckets.baked || (buckets.baked = []);
  let parts = 0;
  const instanceMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  assembly.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const color = materialColor(object.material);
    if (object instanceof THREE.InstancedMesh) {
      for (let index = 0; index < object.count; index += 1) {
        object.getMatrixAt(index, instanceMatrix);
        worldMatrix.multiplyMatrices(object.matrixWorld, instanceMatrix);
        const geometry = object.geometry.clone().applyMatrix4(worldMatrix);
        paintGeometry(geometry, color);
        baked.push(geometry);
        parts += 1;
      }
      return;
    }
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    paintGeometry(geometry, color);
    baked.push(geometry);
    parts += 1;
  });
  return parts;
}

/** Build dense static service-facility geometry without adding live scene nodes. */
export function addGarageFacilityDetails({
  buckets,
  engineCtx,
  groundAtWorld,
  variant,
}: FacilityBuildOptions): GarageFacilityDetailBuild {
  buckets.baked ||= [];
  let facilityProps = 0;
  let facilityStations = 0;
  let looseParts = 0;
  let railSegments = 0;
  let serviceVehicles = 0;
  const accent = new THREE.Color(variant.accent).lerp(new THREE.Color(0xd7b66a), 0.24);
  const steel = new THREE.Color(0x343a3d);
  const dark = new THREE.Color(0x171b1d);
  const safety = new THREE.Color(0xd19a2e);
  const timber = new THREE.Color(0x685035);
  const rubber = new THREE.Color(0x151719);
  const primer = new THREE.Color(0x70463a);
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitCylinders = new Map<number, THREE.CylinderGeometry>();
  const boxInstances: PrimitiveInstance[] = [];
  const cylinderInstances = new Map<number, PrimitiveInstance[]>();
  const unitCylinder = (segments: number): THREE.CylinderGeometry => {
    let geometry = unitCylinders.get(segments);
    if (!geometry) {
      geometry = new THREE.CylinderGeometry(1, 1, 1, segments, 1);
      unitCylinders.set(segments, geometry);
    }
    return geometry;
  };

  const transform = (
    side: number,
    depth: number,
    y: number,
    scale: readonly [number, number, number],
    yaw = VIEW_YAW,
    rotationX = 0,
    rotationZ = 0,
  ): THREE.Matrix4 => {
    const point = cameraPoint(side, depth);
    const groundY = groundAtWorld(point.x, point.z);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(point.x, groundY + y, point.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rotationX, yaw, rotationZ)),
      new THREE.Vector3(scale[0], scale[1], scale[2]),
    );
  };

  const box = (
    side: number,
    depth: number,
    y: number,
    width: number,
    height: number,
    length: number,
    color = steel,
    yaw = VIEW_YAW,
    rotationX = 0,
    rotationZ = 0,
  ): void => {
    boxInstances.push({
      matrix: transform(side, depth, y, [width, height, length], yaw, rotationX, rotationZ),
      color: color.clone(),
    });
    facilityProps += 1;
  };

  const cylinder = (
    side: number,
    depth: number,
    y: number,
    radius: number,
    height: number,
    color = steel,
    yaw = VIEW_YAW,
    rotationX = 0,
    rotationZ = 0,
    segments = 10,
  ): void => {
    unitCylinder(segments);
    const instances = cylinderInstances.get(segments) || [];
    instances.push({
      matrix: transform(side, depth, y, [radius, height, radius], yaw, rotationX, rotationZ),
      color: color.clone(),
    });
    cylinderInstances.set(segments, instances);
    facilityProps += 1;
  };

  const addFloodTower = (side: number, depth: number, height = 7.2): void => {
    box(side, depth, height / 2, 0.20, height, 0.20, steel);
    box(side, depth, height - 0.15, 2.6, 0.18, 0.22, steel);
    for (const offset of [-0.82, 0.82]) {
      box(side + offset, depth - 0.05, height - 0.18, 0.58, 0.32, 0.18, dark);
      box(side + offset, depth - 0.16, height - 0.18, 0.42, 0.20, 0.025, accent);
    }
  };

  const addServiceStation = (side: number, depth: number, width: number, tint: THREE.Color): void => {
    facilityStations += 1;
    for (const x of [-width / 2, width / 2]) {
      box(side + x, depth, 2.65, 0.24, 5.3, 0.24, steel);
      box(side + x, depth + 4.8, 2.2, 0.20, 4.4, 0.20, steel);
      box(side + x * 0.72, depth + 0.08, 4.0, 0.15, 3.1, 0.15, safety,
        VIEW_YAW, 0, x < 0 ? -0.62 : 0.62);
    }
    box(side, depth, 5.18, width + 0.5, 0.28, 0.32, tint);
    box(side, depth + 4.8, 4.32, width + 0.2, 0.22, 0.26, steel);
    box(side, depth + 2.4, 5.30, width + 0.9, 0.18, 5.1, dark);
    box(side, depth + 2.4, 5.20, width + 0.65, 0.055, 4.8, tint);
    box(side - width * 0.32, depth + 1.1, 0.55, 2.0, 1.1, 0.75, timber);
    box(side + width * 0.31, depth + 1.0, 0.62, 1.3, 1.24, 0.70, primer);
    for (const offset of [-1.8, 0, 1.8]) {
      box(side + offset, depth + 2.35, 5.08, 0.70, 0.10, 0.38, accent);
    }
  };

  const addCrates = (side: number, depth: number, rows = 2): void => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < 4 - row; column += 1) {
        const width = 0.88 + ((row + column) % 2) * 0.22;
        box(side + column * 1.05 - 1.5, depth + row * 0.18,
          0.44 + row * 0.82, width, 0.78, 0.82, timber);
        box(side + column * 1.05 - 1.5, depth + row * 0.18,
          0.44 + row * 0.82, 0.08, 0.82, 0.86, steel);
      }
    }
  };

  const addDrums = (side: number, depth: number, count = 6): void => {
    for (let index = 0; index < count; index += 1) {
      const x = side + (index % 3) * 0.74;
      const z = depth + Math.floor(index / 3) * 0.75;
      const tint = index % 3 === 0 ? primer : index % 3 === 1 ? dark : accent;
      cylinder(x, z, 0.46, 0.31, 0.90, tint, VIEW_YAW, 0, 0, 12);
      cylinder(x, z, 0.30, 0.318, 0.035, steel, VIEW_YAW, 0, 0, 12);
      cylinder(x, z, 0.64, 0.318, 0.035, steel, VIEW_YAW, 0, 0, 12);
    }
  };

  const addWheelRack = (side: number, depth: number): void => {
    looseParts += 12;
    for (const x of [-2.1, 2.1]) box(side + x, depth, 1.1, 0.18, 2.2, 0.18, steel);
    for (const y of [0.48, 1.42]) box(side, depth, y, 4.4, 0.16, 0.20, steel);
    for (let index = 0; index < 6; index += 1) {
      const x = side - 1.65 + index * 0.66;
      cylinder(x, depth - 0.05, index % 2 ? 1.50 : 0.56, 0.36, 0.19,
        rubber, VIEW_YAW, Math.PI / 2, 0, 12);
      cylinder(x, depth - 0.05, index % 2 ? 1.50 : 0.56, 0.18, 0.21,
        accent, VIEW_YAW, Math.PI / 2, 0, 10);
    }
  };

  const addTrackRack = (side: number, depth: number): void => {
    box(side, depth, 1.2, 4.8, 2.4, 0.24, steel);
    for (let index = 0; index < 30; index += 1) {
      const column = index % 10;
      const row = Math.floor(index / 10);
      box(side - 2.08 + column * 0.46, depth - 0.18, 0.38 + row * 0.64,
        0.38, 0.12, 0.54, dark);
      looseParts += 1;
    }
  };

  const addToolCart = (side: number, depth: number, tint = primer): void => {
    box(side, depth, 0.66, 1.05, 1.24, 0.56, tint);
    for (const z of [-0.23, 0.23]) for (const x of [-0.42, 0.42]) {
      cylinder(side + x, depth + z, 0.12, 0.10, 0.12, rubber,
        VIEW_YAW, Math.PI / 2, 0, 8);
    }
    for (const y of [0.42, 0.68, 0.94]) box(side, depth - 0.30, y, 0.86, 0.04, 0.03, dark);
  };

  const addTrack = (side: number, depth: number, length: number, yaw = VIEW_YAW): void => {
    const gauge = 1.52;
    for (const railSide of [-gauge / 2, gauge / 2]) {
      // Raise the permanent way above the sampled yard surface. The earlier
      // replacement pack put the rails at terrain height, so most of Cinder's
      // identity vanished beneath its cobbles on even a mild grade.
      box(side + railSide, depth, 0.28, 0.12, 0.18, length, steel, yaw);
      box(side + railSide, depth, 0.13, 0.28, 0.08, length, dark, yaw);
      railSegments += 2;
    }
    const sleepers = Math.max(12, Math.floor(length / 1.05));
    for (let index = 0; index < sleepers; index += 1) {
      const along = -length / 2 + (index + 0.5) * (length / sleepers);
      // Rails use the canonical camera axis. Fan-track yaw is only used for
      // the long beams; its sleepers remain visually legible and merged.
      box(side, depth - along, 0.10, 2.45, 0.13, 0.28, timber, yaw);
      railSegments += 1;
    }
  };

  const addRoundhouse = (): void => {
    const masonry = new THREE.Color(0x75513f);
    const platform = new THREE.Color(0x77726a);
    // A foreground-facing nine-bay locomotive hall. Keep the portal frames
    // open: parked armor and parts remain readable inside instead of being
    // hidden behind a single opaque warehouse slab.
    box(0, 35.0, 4.2, 43.5, 8.4, 1.1, masonry);
    box(0, 30.4, 8.15, 44.5, 0.52, 10.2, dark);
    box(0, 25.3, 0.38, 45.2, 0.72, 1.3, platform);
    for (let bay = -4; bay <= 4; bay += 1) {
      const side = bay * 4.7;
      box(side, 25.6, 4.0, 0.42, 8.0, 0.62, steel);
      box(side, 30.2, 7.8, 0.40, 0.30, 9.6, steel);
      if (bay < 4) {
        const center = side + 2.35;
        box(center, 35.6, 6.85, 4.15, 0.32, 0.20, safety);
        box(center, 35.72, 3.40, 3.90, 6.45, 0.16, dark);
        box(center, 35.60, 5.75, 2.35, 0.18, 0.05, accent);
      }
    }
    // Passenger/freight platforms and their attached canopies make the space
    // read as Cinder Junction from the full Garage frame, not only close up.
    for (const side of [-15.2, 15.2]) {
      box(side, 16.5, 0.34, 5.8, 0.62, 27.0, platform);
      box(side, 17.2, 5.05, 6.7, 0.28, 22.0, dark);
      for (const offset of [-9, -3, 3, 9]) {
        box(side, 17.2 + offset, 2.65, 0.28, 5.30, 0.28, steel);
        box(side, 17.2 + offset, 4.82, 4.4, 0.20, 0.24, safety);
      }
    }
    addTrack(-8.4, 17.0, 42);
    addTrack(0, 17.0, 42);
    addTrack(8.4, 17.0, 42);
  };

  const addShadeHall = (width: number, depth: number, roofColor: THREE.Color): void => {
    box(0, depth, 5.35, width, 0.24, 9.0, roofColor);
    for (const side of [-width / 2 + 0.4, width / 2 - 0.4]) {
      for (const offset of [-3.8, 0, 3.8]) box(side, depth + offset, 2.6, 0.24, 5.2, 0.24, steel);
    }
    for (const offset of [-3.8, 0, 3.8]) box(0, depth + offset, 5.15, width, 0.20, 0.25, steel);
  };

  // Every destination gets a complete service ring: two maintenance stations,
  // four flood towers, parts storage, tracked spares and tool carts. These are
  // deliberately distributed around both sides of the hero rather than
  // concentrated in the rear-right corner.
  addServiceStation(-14.2, 15.4, 8.5, accent);
  addServiceStation(14.2, 15.4, 8.5, accent.clone().multiplyScalar(0.76));
  addFloodTower(-20, 7.5);
  addFloodTower(20, 7.5);
  addFloodTower(-23, 30, 8.4);
  addFloodTower(23, 30, 8.4);
  addCrates(-20, 20);
  addDrums(18, 20);
  addWheelRack(-19, 26);
  addTrackRack(19, 27);
  addToolCart(-8.4, 10.5);
  addToolCart(8.4, 10.5, accent.clone().multiplyScalar(0.70));
  addCrates(-21, 8.5, 2);
  addDrums(18.5, 8.5, 6);

  let assemblies: readonly AssemblyPlacement[] = [];
  switch (variant.architecture) {
    case 'shade_depot':
      addShadeHall(23, 28, new THREE.Color(0x8e6a42));
      addDrums(-5, 25, 9);
      addCrates(6, 25, 3);
      assemblies = [
        { kind: 't90_assembly', side: -14.2, depth: 15.8, yaw: 0.10, scale: 0.78 },
        { kind: 'powerpack', side: 14.2, depth: 15.8, yaw: -0.28, scale: 0.88 },
        { kind: 'armor_rack', side: 6, depth: 27, yaw: 0.15, scale: 0.80 },
      ];
      break;
    case 'repair_bunker':
      addShadeHall(25, 29, new THREE.Color(0x77858c));
      for (const side of [-11, 11]) {
        cylinder(side, 31, 1.2, 0.52, 2.4, steel, VIEW_YAW, 0, Math.PI / 2, 14);
        box(side, 31.9, 1.2, 0.25, 2.5, 0.25, dark);
      }
      assemblies = [
        { kind: 'leclerc_assembly', side: -14.2, depth: 15.8, yaw: 0.12, scale: 0.78 },
        { kind: 'weapon_rack', side: 14.2, depth: 15.8, yaw: -0.12, scale: 0.90 },
        { kind: 'powerpack', side: 4.5, depth: 28, yaw: 0.18, scale: 0.80 },
      ];
      break;
    case 'brick_arsenal':
      box(0, 31, 1.0, 32, 2.0, 3.2, new THREE.Color(0x6b5850));
      for (let index = -6; index <= 6; index += 1) {
        box(index * 2.4, 29.3, 0.56, 1.9, 1.12, 0.7,
          index % 2 ? new THREE.Color(0x8a7e68) : new THREE.Color(0x756e5e));
      }
      assemblies = [
        { kind: 'abrams_assembly', side: -14.2, depth: 15.8, yaw: 0.12, scale: 0.78 },
        { kind: 'abrams_turret_cradle', side: -2.5, depth: 27, yaw: 0.25, scale: 0.72 },
        { kind: 'powerpack', side: 14.2, depth: 15.8, yaw: -0.18, scale: 0.88 },
        { kind: 'weapon_rack', side: 3.5, depth: 27, yaw: 0.10, scale: 0.84 },
      ];
      break;
    case 'naval_drydock':
      addTrack(-7.5, 24, 44);
      addTrack(7.5, 24, 44);
      for (const side of [-21, 21]) {
        cylinder(side, 18, 0.56, 0.46, 1.10, dark, VIEW_YAW, 0, 0, 12);
        cylinder(side, 18, 1.08, 0.16, 0.24, accent, VIEW_YAW, 0, 0, 10);
      }
      addShadeHall(27, 31, new THREE.Color(0x526b70));
      assemblies = [
        { kind: 'leclerc_assembly', side: -14.2, depth: 15.8, yaw: 0.08, scale: 0.78 },
        { kind: 'weapon_rack', side: 14.2, depth: 15.8, yaw: -0.16, scale: 0.90 },
        { kind: 'leclerc_turret_cradle', side: 2, depth: 29, yaw: 0.20, scale: 0.70 },
      ];
      break;
    case 'rail_roundhouse':
      addRoundhouse();
      addDrums(-5, 31, 9);
      addCrates(7, 31, 3);
      assemblies = [
        { kind: 't90_assembly', side: -14.2, depth: 16.5, yaw: 0, scale: 0.78 },
        { kind: 'abrams_assembly', side: 14.2, depth: 16.5, yaw: 0, scale: 0.76 },
        { kind: 'abrams_turret_cradle', side: 0, depth: 30, yaw: -0.18, scale: 0.72 },
      ];
      break;
    case 'rain_canopy':
      addShadeHall(29, 28, new THREE.Color(0x4d6a58));
      for (const side of [-18, 18]) {
        box(side, 24, 0.18, 2.4, 0.30, 14, new THREE.Color(0x435b51));
        box(side, 24, 0.36, 0.24, 0.34, 14, accent);
      }
      assemblies = [
        { kind: 'leclerc_assembly', side: -14.2, depth: 15.8, yaw: 0.08, scale: 0.78 },
        { kind: 'leclerc_turret_cradle', side: -2.5, depth: 27, yaw: 0.2, scale: 0.74 },
        { kind: 'powerpack', side: 14.2, depth: 15.8, yaw: -0.2, scale: 0.88 },
        { kind: 'armor_rack', side: 4, depth: 27, yaw: 0.10, scale: 0.82 },
      ];
      break;
    case 'rock_cavern':
      // A connected tunnel portal and retaining apron, not a floating arch.
      box(0, 35, 3.4, 27, 6.8, 4.0, new THREE.Color(0x55585a));
      box(0, 32.8, 2.9, 20, 5.8, 0.45, dark);
      for (const side of [-11.5, 11.5]) box(side, 32.7, 3.3, 2.1, 6.6, 1.2, steel);
      for (let index = -5; index <= 5; index += 1) {
        box(index * 3.0, 38, 1.2 + Math.abs(index) * 0.08, 2.8, 2.4, 1.8,
          new THREE.Color(0x6a6964));
      }
      assemblies = [
        { kind: 'abrams_assembly', side: -14.2, depth: 15.8, yaw: 0.08, scale: 0.78 },
        { kind: 'armor_rack', side: 14.2, depth: 15.8, yaw: -0.16, scale: 0.88 },
        { kind: 'powerpack', side: 2, depth: 28, yaw: 0.22, scale: 0.80 },
      ];
      break;
    case 'recovery_yard':
      addShadeHall(25, 31, new THREE.Color(0x81553d));
      for (const side of [-12, 12]) {
        box(side, 28, 4.6, 0.48, 9.2, 0.52, steel);
        box(side * 0.66, 28, 7.15, 0.32, 8.2, 0.32, safety,
          VIEW_YAW, 0, side < 0 ? -0.74 : 0.74);
      }
      box(0, 28, 8.6, 26, 0.45, 0.55, steel);
      addTrackRack(-6.5, 30);
      assemblies = [
        { kind: 't90_assembly', side: -14.2, depth: 15.8, yaw: 0.18, scale: 0.78 },
        { kind: 'abrams_turret_cradle', side: 14.2, depth: 15.8, yaw: -0.18, scale: 0.82 },
        { kind: 'powerpack', side: 2, depth: 28, yaw: 0.10, scale: 0.82 },
      ];
      break;
    case 'factory_line':
      addTrack(-8, 25, 48);
      addTrack(8, 25, 48);
      for (const side of [-14, 14]) {
        cylinder(side, 34, 3.1, 1.55, 6.2, primer, VIEW_YAW, 0, 0, 16);
        cylinder(side, 34, 6.3, 0.72, 0.24, dark, VIEW_YAW, 0, 0, 16);
        for (const y of [1.2, 3.0, 4.8]) cylinder(side, 33.1, y, 0.16, 6.0,
          safety, VIEW_YAW, 0, Math.PI / 2, 10);
      }
      addShadeHall(30, 30, new THREE.Color(0x5a4540));
      assemblies = [
        { kind: 'abrams_assembly', side: -14.2, depth: 15.8, yaw: 0, scale: 0.78 },
        { kind: 'leclerc_turret_cradle', side: 14.2, depth: 15.8, yaw: -0.18, scale: 0.82 },
        { kind: 'weapon_rack', side: 1.5, depth: 28, yaw: 0.18, scale: 0.84 },
      ];
      break;
    default:
      // Verdant owns the restored original workshop in garageStage.ts. This
      // detail pack is never attached there; keep the switch exhaustive.
      break;
  }

  if (assemblies.length) {
    const library = createWorkshopPartLibrary(engineCtx);
    for (const placement of assemblies) {
      const assembly = library.createAssembly(placement.kind, {
        name: `garage_${variant.architecture}_${placement.kind}`,
      });
      looseParts += flattenAssembly(buckets, assembly, placement, groundAtWorld);
      if (placement.kind.endsWith('_assembly')) serviceVehicles += 1;
      assembly.clear();
    }
    library.dispose();
  }
  const primitiveMaterial = boxInstances.length || cylinderInstances.size
    ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.06 })
    : null;
  if (primitiveMaterial) engineCtx.setupShadowMaterial?.(primitiveMaterial);
  const meshes: THREE.InstancedMesh[] = [];
  const makeInstances = (
    name: string,
    geometry: THREE.BufferGeometry,
    instances: readonly PrimitiveInstance[],
  ): void => {
    if (!primitiveMaterial || !instances.length) {
      geometry.dispose();
      return;
    }
    const mesh = new THREE.InstancedMesh(geometry, primitiveMaterial, instances.length);
    mesh.name = name;
    instances.forEach((instance, index) => {
      mesh.setMatrixAt(index, instance.matrix);
      mesh.setColorAt(index, instance.color);
    });
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    meshes.push(mesh);
  };
  makeInstances('garage_facility_boxes', unitBox, boxInstances);
  for (const [segments, geometry] of unitCylinders) {
    makeInstances(`garage_facility_cylinders_${segments}`, geometry,
      cylinderInstances.get(segments) || []);
  }

  // All primitive bases were transformed directly into owned geometries; no
  // live object, listener, animation, or per-frame updater survives this call.
  return Object.freeze({
    facilityProps,
    facilityStations,
    looseParts,
    railSegments,
    serviceVehicles,
    meshes: Object.freeze(meshes),
    material: primitiveMaterial,
  });
}
