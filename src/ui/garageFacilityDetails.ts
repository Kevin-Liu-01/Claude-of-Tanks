import * as THREE from 'three';

import type { GarageVariant } from '../game/garageVariants.ts';
import {
  createWorkshopPartLibrary,
  type WorkshopPartKind,
} from '../game/workshopParts.ts';
import type { GeometryBuckets } from '../world/maps/exteriorDetailKit.ts';
import {
  GARAGE_CAMERA_AZIMUTH_RAD,
  garageViewPoint,
} from '../game/garagePresentationPose.ts';

export interface GarageFacilityDetailStats {
  readonly facilityProps: number;
  readonly facilityStations: number;
  readonly looseParts: number;
  readonly railSegments: number;
  readonly serviceVehicles: number;
  readonly placementZones: number;
  readonly openingViewFrames: number;
  readonly openingViewTankParts: number;
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

export interface GarageFacilityTerrace {
  readonly label: string;
  readonly side: number;
  readonly depth: number;
  readonly radiusSide: number;
  readonly radiusDepth: number;
}

interface GarageFacilityLayout {
  readonly stations: readonly [readonly [number, number], readonly [number, number]];
  readonly logistics: readonly [readonly [number, number], readonly [number, number]];
  readonly parts: readonly [readonly [number, number], readonly [number, number]];
  readonly floods: readonly [readonly [number, number], readonly [number, number]];
  readonly feature: readonly [number, number];
  readonly featureRadius: readonly [number, number];
}

interface PrimitiveInstance {
  readonly matrix: THREE.Matrix4;
  readonly color: THREE.Color;
}

const VIEW_YAW = GARAGE_CAMERA_AZIMUTH_RAD;

const FACILITY_LAYOUTS: Readonly<Record<GarageVariant['architecture'], GarageFacilityLayout>> =
  Object.freeze({
    field_shed: {
      stations: [[-18, 2], [18, 2]], logistics: [[-31, -7], [31, -7]],
      parts: [[-30, 15], [30, 15]], floods: [[-37, 4], [37, 4]],
      feature: [0, 18], featureRadius: [8, 6],
    },
    shade_depot: {
      stations: [[-20, 2], [17, 4]], logistics: [[-32, -8], [18, -25]],
      parts: [[-30, 15], [4, -34]], floods: [[-38, 4], [38, 3]],
      feature: [1, 18], featureRadius: [9, 6],
    },
    repair_bunker: {
      stations: [[-21, 3], [19, 0]], logistics: [[-33, -7], [20, -24]],
      parts: [[-30, 16], [4, -34]], floods: [[-38, 6], [38, 2]],
      feature: [-1, 18], featureRadius: [10, 6],
    },
    brick_arsenal: {
      stations: [[-19, 0], [21, 4]], logistics: [[-35, 3], [17, -26]],
      parts: [[-24, 14], [3, -35]], floods: [[-38, 2], [38, 6]],
      feature: [0, 18], featureRadius: [11, 5],
    },
    naval_drydock: {
      stations: [[-22, 1], [21, 1]], logistics: [[-34, 15], [18, -25]],
      parts: [[-32, -8], [4, -35]], floods: [[-39, 4], [39, 4]],
      feature: [0, 16], featureRadius: [10, 16],
    },
    rail_roundhouse: {
      stations: [[-22, -1], [26, -5]], logistics: [[-35, 12], [16, -27]],
      parts: [[-22, -16], [2, -36]], floods: [[-39, 1], [39, 1]],
      feature: [5, 10], featureRadius: [14, 16],
    },
    rain_canopy: {
      stations: [[-20, 3], [18, -1]], logistics: [[-33, -8], [20, -24]],
      parts: [[-30, 18], [5, -34]], floods: [[-39, 6], [39, 2]],
      feature: [0, 18], featureRadius: [10, 7],
    },
    rock_cavern: {
      stations: [[-21, 0], [21, 3]], logistics: [[-34, -8], [18, -25]],
      parts: [[-31, 16], [4, -34]], floods: [[-39, 5], [39, 5]],
      feature: [0, 18], featureRadius: [11, 7],
    },
    recovery_yard: {
      stations: [[-22, 3], [19, -1]], logistics: [[-34, -8], [19, -25]],
      parts: [[-31, 18], [4, -34]], floods: [[-39, 6], [39, 1]],
      feature: [0, 18], featureRadius: [11, 7],
    },
    factory_line: {
      stations: [[-21, -1], [21, 3]], logistics: [[-35, 12], [16, -27]],
      parts: [[-32, 21], [2, -36]], floods: [[-39, 2], [39, 6]],
      feature: [0, 16], featureRadius: [12, 16],
    },
  });

function facilityLayout(variant: GarageVariant): GarageFacilityLayout {
  return FACILITY_LAYOUTS[variant.architecture] || FACILITY_LAYOUTS.field_shed;
}

/** Flat, feathered service pads used before terrain geometry is emitted. */
export function getGarageFacilityTerraces(variant: GarageVariant): readonly GarageFacilityTerrace[] {
  const layout = facilityLayout(variant);
  return Object.freeze([
    ...layout.stations.map(([side, depth], index) => Object.freeze({
      label: `service-${index + 1}`, side, depth: depth + 2.4, radiusSide: 7.2, radiusDepth: 5.2,
    })),
    ...layout.logistics.map(([side, depth], index) => Object.freeze({
      label: `logistics-${index + 1}`, side, depth, radiusSide: 4.3, radiusDepth: 3.5,
    })),
    ...layout.parts.map(([side, depth], index) => Object.freeze({
      label: `parts-${index + 1}`, side, depth, radiusSide: 4.2, radiusDepth: 3.2,
    })),
    Object.freeze({
      label: 'signature-facility', side: layout.feature[0], depth: layout.feature[1],
      radiusSide: layout.featureRadius[0], radiusDepth: layout.featureRadius[1],
    }),
  ]);
}

function cameraPoint(side: number, depth: number): Point {
  return garageViewPoint(side, depth);
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
  let openingViewFrames = 0;
  let openingViewTankParts = 0;
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

  const apronTransform = (
    side: number,
    depth: number,
    y: number,
    scale: readonly [number, number, number],
    yaw = VIEW_YAW,
    rotationX = 0,
    rotationZ = 0,
  ): THREE.Matrix4 => {
    const point = garageViewPoint(side, depth);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(point.x, y, point.z),
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

  const apronBox = (
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
      matrix: apronTransform(
        side, depth, y, [width, height, length], yaw, rotationX, rotationZ,
      ),
      color: color.clone(),
    });
    facilityProps += 1;
  };

  const apronCylinder = (
    side: number,
    depth: number,
    y: number,
    radius: number,
    height: number,
    color = steel,
    rotationX = 0,
    rotationZ = 0,
    segments = 10,
  ): void => {
    unitCylinder(segments);
    const instances = cylinderInstances.get(segments) || [];
    instances.push({
      matrix: apronTransform(
        side, depth, y, [radius, height, radius], VIEW_YAW, rotationX, rotationZ,
      ),
      color: color.clone(),
    });
    cylinderInstances.set(segments, instances);
    facilityProps += 1;
  };

  const addOpeningViewFrame = (centerSide: number, mirror: number): void => {
    openingViewFrames += 1;
    const depth = 5.2;
    const halfWidth = 2.75;
    const rearDepth = depth + 4.2;

    // Connected four-post maintenance portal. Every upright lands on a
    // visible footing, all roof members meet a column/crossmember, and the
    // rear crash wall closes the silhouette. This replaces the universal
    // collection of thin floating sticks seen in the old outdoor Garages.
    apronBox(centerSide, depth + 2.1, 0.06, 6.4, 0.12, 5.1, dark);
    for (const sideOffset of [-halfWidth, halfWidth]) {
      for (const columnDepth of [depth, rearDepth]) {
        apronBox(centerSide + sideOffset, columnDepth, 0.10, 0.82, 0.20, 0.82, dark);
        apronBox(centerSide + sideOffset, columnDepth, 2.78, 0.34, 5.55, 0.34, steel);
      }
      apronBox(centerSide + sideOffset, depth + 2.1, 5.35, 0.38, 0.34, 4.62, steel);
      apronBox(centerSide + sideOffset, depth + 0.48, 4.58,
        0.20, 1.65, 0.22, safety, VIEW_YAW, 0, sideOffset < 0 ? -0.58 : 0.58);
    }
    for (const columnDepth of [depth, rearDepth]) {
      apronBox(centerSide, columnDepth, 5.42, 6.0, 0.38, 0.42,
        columnDepth === depth ? accent : steel);
    }
    apronBox(centerSide, depth + 2.1, 5.60, 6.45, 0.16, 4.72, dark);
    apronBox(centerSide, depth + 2.1, 5.72, 5.92, 0.08, 4.32, accent);
    for (const roofDepth of [depth + 0.75, depth + 2.1, depth + 3.45]) {
      apronBox(centerSide, roofDepth, 5.47, 6.12, 0.16, 0.22, steel);
    }
    apronBox(centerSide, rearDepth - 0.16, 1.12, 5.45, 2.05, 0.20, dark);
    apronBox(centerSide, rearDepth - 0.28, 2.22, 5.05, 0.16, 0.08, accent);
    for (const sideOffset of [-1.65, 0, 1.65]) {
      apronBox(centerSide + sideOffset, rearDepth - 0.30, 1.18,
        0.08, 1.76, 0.06, sideOffset === 0 ? safety : steel);
    }

    // A proper service bench, cabinet, overhead trolley and spare road-wheel
    // stand make the portal read as a working tank bay even before the baked
    // first-party turret assembly is added below.
    apronBox(centerSide + mirror * 1.12, rearDepth - 0.65, 0.78, 2.25, 0.20, 0.92, timber);
    apronBox(centerSide + mirror * 1.12, rearDepth - 0.20, 1.63, 2.15, 1.34, 0.10, steel);
    apronBox(centerSide - mirror * 2.02, rearDepth - 0.62, 0.82, 0.94, 1.64, 0.72, primer);
    apronBox(centerSide, depth + 2.1, 5.18, 2.0, 0.18, 0.30, safety);
    apronBox(centerSide, depth + 2.1, 4.30, 0.12, 1.68, 0.12, dark);
    apronBox(centerSide, depth + 2.1, 3.42, 0.82, 0.18, 0.24, accent);
    const cabinetSide = centerSide - mirror * 2.02;
    for (const y of [0.42, 0.72, 1.02]) {
      apronBox(cabinetSide, rearDepth - 1.0, y, 0.68, 0.035, 0.025, dark);
    }
    const wheelSide = centerSide + mirror * 2.02;
    for (let index = 0; index < 2; index += 1) {
      const wheelY = 0.43 + index * 0.68;
      apronCylinder(wheelSide, rearDepth - 0.98, wheelY, 0.38, 0.20,
        rubber, Math.PI / 2, 0, 12);
      apronCylinder(wheelSide, rearDepth - 0.98, wheelY, 0.19, 0.22,
        accent, Math.PI / 2, 0, 10);
      looseParts += 2;
    }
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

  const addRoundhouse = (centerSide: number, centerDepth: number): void => {
    const masonry = new THREE.Color(0x75513f);
    const masonryDark = new THREE.Color(0x4d342d);
    const platform = new THREE.Color(0x77726a);
    // Five open, connected portals give Cinder a strong rail identity without
    // the old 45 m slab cutting through both map warehouses and tree line.
    box(centerSide, centerDepth + 5.4, 0.58, 25.5, 1.16, 0.9, masonryDark);
    box(centerSide, centerDepth + 5.4, 7.22, 25.5, 1.56, 0.9, masonryDark);
    box(centerSide, centerDepth + 1.0, 7.75, 26.2, 0.45, 9.4, dark);
    box(centerSide, centerDepth - 3.7, 0.32, 26.4, 0.60, 1.1, platform);
    for (let bay = -2; bay <= 2; bay += 1) {
      const side = bay * 4.7;
      // Rear facade: separated masonry bays with a recessed service door,
      // clerestory window and steel mullions instead of one featureless wall.
      box(centerSide + side, centerDepth + 5.4, 3.88, 4.22, 5.48, 0.74, masonry);
      box(centerSide + side, centerDepth + 4.99, 2.16, 2.72, 3.58, 0.08, dark);
      box(centerSide + side, centerDepth + 4.94, 5.52, 3.22, 1.12, 0.06,
        bay % 2 ? accent : steel);
      box(centerSide + side, centerDepth + 4.88, 5.52, 0.10, 1.08, 0.08, dark);
      box(centerSide + side, centerDepth + 4.88, 5.52, 3.18, 0.10, 0.08, dark);
      box(centerSide + side, centerDepth - 3.4, 3.85, 0.38, 7.7, 0.56, steel);
      box(centerSide + side, centerDepth + 1.0, 7.42, 0.36, 0.28, 9.2, steel);
      if (bay < 2) {
        const center = centerSide + side + 2.35;
        box(center, centerDepth + 5.9, 6.52, 4.05, 0.28, 0.18, safety);
        box(center, centerDepth + 5.98, 3.25, 3.8, 6.1, 0.14, dark);
      }
    }
    addTrack(centerSide - 5.2, centerDepth - 2.0, 26);
    addTrack(centerSide, centerDepth - 2.0, 26);
    addTrack(centerSide + 5.2, centerDepth - 2.0, 26);
  };

  const addShadeHall = (centerSide: number, width: number, depth: number,
    roofColor: THREE.Color): void => {
    box(centerSide, depth, 5.35, width, 0.24, 9.0, roofColor);
    for (const side of [centerSide - width / 2 + 0.4, centerSide + width / 2 - 0.4]) {
      for (const offset of [-3.8, 0, 3.8]) box(side, depth + offset, 2.6, 0.24, 5.2, 0.24, steel);
    }
    for (const offset of [-3.8, 0, 3.8]) {
      box(centerSide, depth + offset, 5.15, width, 0.20, 0.25, steel);
    }
  };

  // The old scene used one identical, tightly packed prop template in all
  // nine environments. Each destination now owns a different perimeter
  // layout. Equipment remains merged/instanced, but its visual rhythm follows
  // Verdant: two readable work bays, separated logistics islands and a clear
  // hero lane instead of a wall of intersecting props.
  const layout = facilityLayout(variant);
  const [leftStation, rightStation] = layout.stations;
  const [leftLogistics, rightLogistics] = layout.logistics;
  const [leftParts, rightParts] = layout.parts;
  addServiceStation(leftStation[0], leftStation[1], 8.5, accent);
  addServiceStation(rightStation[0], rightStation[1], 8.5,
    accent.clone().multiplyScalar(0.76));
  addFloodTower(layout.floods[0][0], layout.floods[0][1], 7.6);
  addFloodTower(layout.floods[1][0], layout.floods[1][1], 7.6);
  addCrates(leftLogistics[0], leftLogistics[1], 2);
  addDrums(rightLogistics[0], rightLogistics[1], 6);
  addWheelRack(leftParts[0], leftParts[1]);
  addTrackRack(rightParts[0], rightParts[1]);
  addToolCart(leftStation[0] + 6.0, leftStation[1] + 1.2);
  addToolCart(rightStation[0] - 6.0, rightStation[1] + 1.2,
    accent.clone().multiplyScalar(0.70));
  // Two compact connected frames sit on the common hardstand immediately
  // outside the podium keep-clear ring. The broader map-specific facility
  // still wraps 360 degrees, but these authored headers, braces and work
  // lights are guaranteed to read in the first untouched Garage view.
  addOpeningViewFrame(-9.2, -1);
  addOpeningViewFrame(9.2, 1);
  const [featureSide, featureDepth] = layout.feature;

  let assemblies: readonly AssemblyPlacement[] = [];
  switch (variant.architecture) {
    case 'shade_depot':
      addShadeHall(featureSide, 17, featureDepth, new THREE.Color(0x8e6a42));
      addDrums(featureSide - 6, featureDepth + 1, 6);
      addCrates(featureSide + 6, featureDepth + 1, 2);
      assemblies = [
        { kind: 't90_assembly', side: leftStation[0], depth: leftStation[1] + 0.4, yaw: 0.10, scale: 0.78 },
        { kind: 'powerpack', side: rightStation[0], depth: rightStation[1] + 0.4, yaw: -0.28, scale: 0.88 },
        { kind: 'armor_rack', side: featureSide + 4, depth: featureDepth, yaw: 0.15, scale: 0.80 },
      ];
      break;
    case 'repair_bunker':
      addShadeHall(featureSide, 18, featureDepth, new THREE.Color(0x77858c));
      for (const offset of [-6.2, 6.2]) {
        cylinder(featureSide + offset, featureDepth + 1, 1.2, 0.52, 2.4,
          steel, VIEW_YAW, 0, Math.PI / 2, 14);
        box(featureSide + offset, featureDepth + 1.9, 1.2, 0.25, 2.5, 0.25, dark);
      }
      assemblies = [
        { kind: 'leclerc_assembly', side: leftStation[0], depth: leftStation[1] + 0.4, yaw: 0.12, scale: 0.78 },
        { kind: 'weapon_rack', side: rightStation[0], depth: rightStation[1] + 0.4, yaw: -0.12, scale: 0.90 },
        { kind: 'powerpack', side: featureSide + 3.5, depth: featureDepth, yaw: 0.18, scale: 0.80 },
      ];
      break;
    case 'brick_arsenal':
      box(featureSide, featureDepth + 2, 1.0, 22, 2.0, 2.4, new THREE.Color(0x6b5850));
      for (let index = -4; index <= 4; index += 1) {
        box(featureSide + index * 2.4, featureDepth + 0.4, 0.56, 1.9, 1.12, 0.7,
          index % 2 ? new THREE.Color(0x8a7e68) : new THREE.Color(0x756e5e));
      }
      assemblies = [
        { kind: 'abrams_assembly', side: leftStation[0], depth: leftStation[1] + 0.4, yaw: 0.12, scale: 0.78 },
        { kind: 'abrams_turret_cradle', side: featureSide - 4, depth: featureDepth, yaw: 0.25, scale: 0.72 },
        { kind: 'powerpack', side: rightStation[0], depth: rightStation[1] + 0.4, yaw: -0.18, scale: 0.88 },
        { kind: 'weapon_rack', side: featureSide + 4, depth: featureDepth, yaw: 0.10, scale: 0.84 },
      ];
      break;
    case 'naval_drydock':
      addTrack(featureSide - 5.5, featureDepth, 28);
      addTrack(featureSide + 5.5, featureDepth, 28);
      for (const offset of [-8, 8]) {
        cylinder(featureSide + offset, featureDepth - 4, 0.56, 0.46, 1.10,
          dark, VIEW_YAW, 0, 0, 12);
        cylinder(featureSide + offset, featureDepth - 4, 1.08, 0.16, 0.24,
          accent, VIEW_YAW, 0, 0, 10);
      }
      assemblies = [
        { kind: 'leclerc_assembly', side: leftStation[0], depth: leftStation[1] + 0.4, yaw: 0.08, scale: 0.78 },
        { kind: 'weapon_rack', side: rightStation[0], depth: rightStation[1] + 0.4, yaw: -0.16, scale: 0.90 },
        { kind: 'leclerc_turret_cradle', side: featureSide, depth: featureDepth + 2, yaw: 0.20, scale: 0.70 },
      ];
      break;
    case 'rail_roundhouse':
      addRoundhouse(featureSide, featureDepth);
      addDrums(featureSide - 9, featureDepth + 1, 6);
      addCrates(featureSide + 9, featureDepth + 1, 2);
      assemblies = [
        { kind: 't90_assembly', side: leftStation[0], depth: leftStation[1] + 0.4, yaw: 0, scale: 0.78 },
        { kind: 'abrams_assembly', side: rightStation[0], depth: rightStation[1] + 0.4, yaw: 0, scale: 0.76 },
        { kind: 'abrams_turret_cradle', side: featureSide, depth: featureDepth, yaw: -0.18, scale: 0.72 },
      ];
      break;
    case 'rain_canopy':
      addShadeHall(featureSide, 19, featureDepth, new THREE.Color(0x4d6a58));
      for (const offset of [-7.5, 7.5]) {
        box(featureSide + offset, featureDepth, 0.18, 1.8, 0.30, 10,
          new THREE.Color(0x435b51));
        box(featureSide + offset, featureDepth, 0.36, 0.24, 0.34, 10, accent);
      }
      assemblies = [
        { kind: 'leclerc_assembly', side: leftStation[0], depth: leftStation[1] + 0.4, yaw: 0.08, scale: 0.78 },
        { kind: 'leclerc_turret_cradle', side: featureSide - 4, depth: featureDepth, yaw: 0.2, scale: 0.74 },
        { kind: 'powerpack', side: rightStation[0], depth: rightStation[1] + 0.4, yaw: -0.2, scale: 0.88 },
        { kind: 'armor_rack', side: featureSide + 4, depth: featureDepth, yaw: 0.10, scale: 0.82 },
      ];
      break;
    case 'rock_cavern':
      // A connected tunnel portal and retaining apron, not a floating arch.
      box(featureSide, featureDepth + 3, 3.4, 20, 6.8, 3.0, new THREE.Color(0x55585a));
      box(featureSide, featureDepth + 0.8, 2.55, 12.8, 5.1, 0.45, dark);
      for (const offset of [-8.5, 8.5]) {
        box(featureSide + offset, featureDepth + 0.7, 3.3, 1.6, 6.6, 1.0, steel);
      }
      for (const offset of [-6.7, -3.35, 0, 3.35, 6.7]) {
        box(featureSide + offset, featureDepth + 0.48, 5.65, 0.30, 1.65, 0.52,
          offset === 0 ? accent : steel, VIEW_YAW, 0, offset * 0.012);
      }
      box(featureSide, featureDepth + 0.35, 5.72, 14.2, 0.34, 0.72, steel);
      box(featureSide, featureDepth + 0.21, 5.46, 10.4, 0.13, 0.06, accent);
      for (let index = -3; index <= 3; index += 1) {
        box(featureSide + index * 3.0, featureDepth + 6, 1.2 + Math.abs(index) * 0.08,
          2.8, 2.4, 1.8,
          new THREE.Color(0x6a6964));
      }
      assemblies = [
        { kind: 'abrams_assembly', side: leftStation[0], depth: leftStation[1] + 0.4, yaw: 0.08, scale: 0.78 },
        { kind: 'armor_rack', side: rightStation[0], depth: rightStation[1] + 0.4, yaw: -0.16, scale: 0.88 },
        { kind: 'powerpack', side: featureSide + 2, depth: featureDepth, yaw: 0.22, scale: 0.80 },
      ];
      break;
    case 'recovery_yard':
      addShadeHall(featureSide, 18, featureDepth + 2, new THREE.Color(0x81553d));
      for (const offset of [-8.5, 8.5]) {
        box(featureSide + offset, featureDepth, 4.2, 0.42, 8.4, 0.48, steel);
        box(featureSide + offset * 0.66, featureDepth, 6.55, 0.28, 7.3, 0.28, safety,
          VIEW_YAW, 0, offset < 0 ? -0.74 : 0.74);
      }
      box(featureSide, featureDepth, 7.9, 18, 0.40, 0.50, steel);
      assemblies = [
        { kind: 't90_assembly', side: leftStation[0], depth: leftStation[1] + 0.4, yaw: 0.18, scale: 0.78 },
        { kind: 'abrams_turret_cradle', side: rightStation[0], depth: rightStation[1] + 0.4, yaw: -0.18, scale: 0.82 },
        { kind: 'powerpack', side: featureSide + 2, depth: featureDepth, yaw: 0.10, scale: 0.82 },
      ];
      break;
    case 'factory_line':
      addTrack(featureSide - 6, featureDepth, 28);
      addTrack(featureSide + 6, featureDepth, 28);
      for (const offset of [-8, 8]) {
        cylinder(featureSide + offset, featureDepth + 3, 2.6, 1.25, 5.2,
          primer, VIEW_YAW, 0, 0, 16);
        cylinder(featureSide + offset, featureDepth + 3, 5.3, 0.62, 0.22,
          dark, VIEW_YAW, 0, 0, 16);
        for (const y of [1.2, 2.7, 4.2]) {
          cylinder(featureSide + offset, featureDepth + 2.2, y, 0.14, 5.0,
          safety, VIEW_YAW, 0, Math.PI / 2, 10);
        }
      }
      assemblies = [
        { kind: 'abrams_assembly', side: leftStation[0], depth: leftStation[1] + 0.4, yaw: 0, scale: 0.78 },
        { kind: 'leclerc_turret_cradle', side: rightStation[0], depth: rightStation[1] + 0.4, yaw: -0.18, scale: 0.82 },
        { kind: 'weapon_rack', side: featureSide + 1.5, depth: featureDepth, yaw: 0.18, scale: 0.84 },
      ];
      break;
    default:
      // Verdant owns the restored original workshop in garageStage.ts. This
      // detail pack is never attached there; keep the switch exhaustive.
      break;
  }

  // The opening composition now holds recognisable first-party tank hardware,
  // not generic rods. These turret-and-gun service cradles are authored by the
  // Garage-only workshop library and flattened into the static baked bucket.
  assemblies = [
    ...assemblies,
    { kind: 't90_turret_cradle', side: -9.2, depth: 7.2, yaw: 0.08, scale: 0.48 },
    { kind: 'leclerc_turret_cradle', side: 9.2, depth: 7.2, yaw: -0.10, scale: 0.48 },
  ];
  openingViewTankParts = 2;

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
    placementZones: getGarageFacilityTerraces(variant).length,
    openingViewFrames,
    openingViewTankParts,
    meshes: Object.freeze(meshes),
    material: primitiveMaterial,
  });
}
