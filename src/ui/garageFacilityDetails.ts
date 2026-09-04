import * as THREE from 'three';

import type { GarageVariant } from '../game/garageVariants.ts';
import type { GeometryBuckets } from '../world/maps/exteriorDetailKit.ts';
import {
  GARAGE_HERO_HEADING_RAD,
  garageViewPoint,
  garageWorldPointToView,
} from '../game/garagePresentationPose.ts';
import {
  getGarageWorkshopBayPoses,
  type GarageWorkshopBayPose,
} from '../game/garageWorkshopLayout.ts';

export interface GarageFacilityDetailStats {
  readonly facilityProps: number;
  readonly facilityStations: number;
  readonly looseParts: number;
  readonly railSegments: number;
  readonly placementZones: number;
  readonly openingViewFrames: number;
  readonly structuralConnections: number;
  readonly unsupportedParts: number;
  readonly heavyLiftSystems: number;
  readonly operationalMachines: number;
  readonly factoryProcessZones: number;
  readonly elevatedAccessSystems: number;
  readonly secureStorageSystems: number;
  readonly environmentSpecificAssemblies: number;
  readonly servicePurposeTags: readonly string[];
  readonly facilityMaterialClasses: number;
  readonly openingSightlineIntrusions: number;
}

export interface GarageFacilityDetailBuild extends GarageFacilityDetailStats {
  readonly meshes: readonly THREE.InstancedMesh[];
  readonly materials: readonly THREE.MeshStandardMaterial[];
}

interface FacilityBuildOptions {
  readonly buckets: GeometryBuckets;
  readonly engineCtx: Readonly<{
    setupShadowMaterial?(material: THREE.Material): void;
  }>;
  readonly surfaceMaps?: Readonly<Record<
    PrimitiveInstance['materialClass'],
    Readonly<{ color: THREE.Texture | null; normal: THREE.Texture | null }>
  >>;
  readonly groundAtWorld: (x: number, z: number) => number;
  readonly variant: GarageVariant;
}

export interface GarageFacilityTerrace {
  readonly label: string;
  readonly side: number;
  readonly depth: number;
  readonly radiusSide: number;
  readonly radiusDepth: number;
}

interface GarageFacilityLayout {
  readonly logistics: readonly [readonly [number, number], readonly [number, number]];
  readonly parts: readonly [readonly [number, number], readonly [number, number]];
  readonly floods: readonly [readonly [number, number], readonly [number, number]];
  readonly feature: readonly [number, number];
  readonly featureRadius: readonly [number, number];
}

interface PrimitiveInstance {
  readonly matrix: THREE.Matrix4;
  readonly color: THREE.Color;
  readonly materialClass: 'structure' | 'painted' | 'equipment' | 'masonry';
}

// Facility facades share the tank's longitudinal axis. The old camera-azimuth
// yaw made every bay stare squarely at the opening camera; matching the hero
// means each rear wall is parallel to the tank's stern plane and exposes the
// same three-quarter depth as the vehicle.
export const GARAGE_FACILITY_AXIS_YAW_RAD = GARAGE_HERO_HEADING_RAD;

const FACILITY_LAYOUTS: Readonly<Record<GarageVariant['architecture'], GarageFacilityLayout>> =
  Object.freeze({
    field_shed: {
      logistics: [[-31, -7], [31, -7]],
      parts: [[-30, 15], [30, 15]], floods: [[-37, 4], [37, 4]],
      feature: [0, 18], featureRadius: [8, 6],
    },
    shade_depot: {
      logistics: [[-32, -8], [18, -25]],
      parts: [[-30, 15], [4, -34]], floods: [[-38, 4], [38, 3]],
      feature: [1, 28], featureRadius: [9, 6],
    },
    repair_bunker: {
      logistics: [[-33, -7], [20, -24]],
      parts: [[-30, 16], [4, -34]], floods: [[-38, 6], [38, 2]],
      feature: [-1, 28], featureRadius: [10, 6],
    },
    brick_arsenal: {
      logistics: [[-35, 3], [17, -26]],
      parts: [[-24, 14], [3, -35]], floods: [[-38, 2], [38, 6]],
      feature: [0, 28], featureRadius: [11, 5],
    },
    naval_drydock: {
      logistics: [[-34, 15], [18, -25]],
      parts: [[-32, -8], [4, -35]], floods: [[-39, 4], [39, 4]],
      feature: [0, 28], featureRadius: [10, 10],
    },
    rail_roundhouse: {
      logistics: [[-35, 12], [16, -27]],
      parts: [[-22, -16], [2, -36]], floods: [[-39, 1], [39, 1]],
      feature: [4, 18], featureRadius: [13, 9],
    },
    rain_canopy: {
      logistics: [[-33, -8], [20, -24]],
      parts: [[-30, 18], [5, -34]], floods: [[-39, 6], [39, 2]],
      feature: [0, 18], featureRadius: [10, 7],
    },
    rock_cavern: {
      logistics: [[-34, -8], [18, -25]],
      parts: [[-31, 16], [4, -34]], floods: [[-39, 5], [39, 5]],
      feature: [0, 28], featureRadius: [11, 7],
    },
    recovery_yard: {
      logistics: [[-34, -8], [19, -25]],
      parts: [[-31, 18], [4, -34]], floods: [[-39, 6], [39, 1]],
      feature: [0, 18], featureRadius: [11, 7],
    },
    factory_line: {
      logistics: [[-35, 12], [16, -27]],
      parts: [[-32, 21], [2, -36]], floods: [[-39, 2], [39, 6]],
      feature: [0, 16], featureRadius: [12, 10],
    },
  });

function facilityLayout(variant: GarageVariant): GarageFacilityLayout {
  return FACILITY_LAYOUTS[variant.architecture] || FACILITY_LAYOUTS.field_shed;
}

/** Flat, feathered service pads used before terrain geometry is emitted. */
export function getGarageFacilityTerraces(variant: GarageVariant): readonly GarageFacilityTerrace[] {
  const layout = facilityLayout(variant);
  const serviceBays: GarageFacilityTerrace[] = [];
  for (const bay of getGarageWorkshopBayPoses(variant)) {
    if (bay.id !== 'burlak_gantry' && bay.id !== 't90m_relikt') continue;
    const view = garageWorldPointToView(bay.x, bay.z);
    serviceBays.push(Object.freeze({
      label: `fleet-service-${serviceBays.length + 1}`,
      side: view.side,
      depth: view.depth,
      radiusSide: 6.4,
      radiusDepth: 5.4,
    }));
  }
  return Object.freeze([
    ...serviceBays,
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

function cameraPoint(side: number, depth: number): { readonly x: number; readonly z: number } {
  return garageViewPoint(side, depth);
}

/** Build dense static service-facility geometry without adding live scene nodes. */
export function addGarageFacilityDetails({
  buckets,
  engineCtx,
  surfaceMaps,
  groundAtWorld,
  variant,
}: FacilityBuildOptions): GarageFacilityDetailBuild {
  buckets.baked ||= [];
  let facilityProps = 0;
  let facilityStations = 0;
  let looseParts = 0;
  let railSegments = 0;
  let openingViewFrames = 0;
  let structuralConnections = 0;
  let heavyLiftSystems = 0;
  let operationalMachines = 0;
  let factoryProcessZones = 0;
  let elevatedAccessSystems = 0;
  let secureStorageSystems = 0;
  let environmentSpecificAssemblies = 0;
  let openingSightlineIntrusions = 0;
  const servicePurposeTags = new Set<string>();
  const accent = new THREE.Color(variant.accent).lerp(new THREE.Color(0xd7b66a), 0.24);
  const steel = new THREE.Color(0x343a3d);
  const dark = new THREE.Color(0x171b1d);
  const safety = new THREE.Color(0xd19a2e);
  const timber = new THREE.Color(0x685035);
  const rubber = new THREE.Color(0x151719);
  const primer = new THREE.Color(0x70463a);
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
    yaw = GARAGE_FACILITY_AXIS_YAW_RAD,
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
    yaw = GARAGE_FACILITY_AXIS_YAW_RAD,
    rotationX = 0,
    rotationZ = 0,
    materialClass: PrimitiveInstance['materialClass'] = 'structure',
  ): void => {
    boxInstances.push({
      matrix: transform(side, depth, y, [width, height, length], yaw, rotationX, rotationZ),
      color: color.clone(),
      materialClass,
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
    yaw = GARAGE_FACILITY_AXIS_YAW_RAD,
    rotationX = 0,
    rotationZ = 0,
    segments = 10,
    materialClass: PrimitiveInstance['materialClass'] = 'equipment',
  ): void => {
    unitCylinder(segments);
    const instances = cylinderInstances.get(segments) || [];
    instances.push({
      matrix: transform(side, depth, y, [radius, height, radius], yaw, rotationX, rotationZ),
      color: color.clone(),
      materialClass,
    });
    cylinderInstances.set(segments, instances);
    facilityProps += 1;
  };

  interface FacilityCluster {
    readonly x: number;
    readonly z: number;
    readonly baseY: number;
  }

  const bayCluster = (pose: GarageWorkshopBayPose): FacilityCluster => ({
    x: pose.x,
    z: pose.z,
    baseY: groundAtWorld(pose.x, pose.z),
  });

  const fixedCluster = (side: number, depth: number): FacilityCluster => {
    const point = cameraPoint(side, depth);
    return { x: point.x, z: point.z, baseY: groundAtWorld(point.x, point.z) };
  };

  const clusterMatrix = (
    cluster: FacilityCluster,
    lateral: number,
    longitudinal: number,
    y: number,
    scale: readonly [number, number, number],
    rotationX = 0,
    rotationZ = 0,
  ): THREE.Matrix4 => {
    // Facility facades stay parallel to the hero/rear wall. Only the cluster
    // center follows the real exhibit. This preserves the deliberate Garage
    // grid while making each shelter physically belong to its vehicle bay.
    const yaw = GARAGE_FACILITY_AXIS_YAW_RAD;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(
        cluster.x + cos * lateral + sin * longitudinal,
        cluster.baseY + y,
        cluster.z - sin * lateral + cos * longitudinal,
      ),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rotationX, yaw, rotationZ)),
      new THREE.Vector3(...scale),
    );
  };

  const clusterPoint = (
    cluster: FacilityCluster,
    lateral: number,
    longitudinal: number,
    y: number,
  ): THREE.Vector3 => {
    const yaw = GARAGE_FACILITY_AXIS_YAW_RAD;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return new THREE.Vector3(
      cluster.x + cos * lateral + sin * longitudinal,
      cluster.baseY + y,
      cluster.z - sin * lateral + cos * longitudinal,
    );
  };

  const clusterBeam = (
    cluster: FacilityCluster,
    start: readonly [lateral: number, longitudinal: number, y: number],
    end: readonly [lateral: number, longitudinal: number, y: number],
    thickness: number,
    color: THREE.Color,
    materialClass: PrimitiveInstance['materialClass'],
  ): void => {
    const a = clusterPoint(cluster, start[0], start[1], start[2]);
    const b = clusterPoint(cluster, end[0], end[1], end[2]);
    const direction = b.clone().sub(a);
    const length = direction.length();
    if (length <= 1e-4) return;
    boxInstances.push({
      matrix: new THREE.Matrix4().compose(
        a.clone().add(b).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0), direction.multiplyScalar(1 / length),
        ),
        new THREE.Vector3(thickness, length, thickness),
      ),
      color: color.clone(),
      materialClass,
    });
    facilityProps += 1;
  };

  const clusterBox = (
    cluster: FacilityCluster,
    lateral: number,
    longitudinal: number,
    y: number,
    width: number,
    height: number,
    length: number,
    color: THREE.Color,
    materialClass: PrimitiveInstance['materialClass'],
    rotationZ = 0,
  ): void => {
    boxInstances.push({
      matrix: clusterMatrix(
        cluster, lateral, longitudinal, y, [width, height, length], 0, rotationZ,
      ),
      color: color.clone(),
      materialClass,
    });
    facilityProps += 1;
  };

  const clusterCylinder = (
    cluster: FacilityCluster,
    lateral: number,
    longitudinal: number,
    y: number,
    radius: number,
    height: number,
    color: THREE.Color,
    rotationX = 0,
    segments = 12,
    rotationZ = 0,
  ): void => {
    unitCylinder(segments);
    const instances = cylinderInstances.get(segments) || [];
    instances.push({
      matrix: clusterMatrix(
        cluster, lateral, longitudinal, y, [radius, height, radius], rotationX, rotationZ,
      ),
      color: color.clone(),
      materialClass: 'equipment',
    });
    cylinderInstances.set(segments, instances);
    facilityProps += 1;
  };

  const addPurposeBuiltServiceBay = (
    pose: GarageWorkshopBayPose,
    mirror: -1 | 1,
  ): void => {
    const cluster = bayCluster(pose);
    facilityStations += 1;
    openingViewFrames += 1;
    structuralConnections += 34;
    heavyLiftSystems += 1;
    operationalMachines += 1;
    elevatedAccessSystems += 1;
    servicePurposeTags.add(pose.role);
    servicePurposeTags.add('overhead-travelling-crane');
    servicePurposeTags.add('grounded-service-pit');

    // One continuous slab and four explicit reinforced footings establish a
    // common datum. Every column, roof rail, brace and machine below derives
    // from this one baseY; terrain variation can no longer pull joints apart.
    clusterBox(cluster, 0, 0, 0.10, 10.8, 0.20, 9.0,
      new THREE.Color(0x686b68), 'masonry');
    clusterBox(cluster, 0, 0.2, 0.23, 2.45, 0.10, 6.4, dark, 'equipment');
    for (const lateral of [-4.65, 4.65]) {
      for (const longitudinal of [-3.65, 3.65]) {
        clusterBox(cluster, lateral, longitudinal, 0.12,
          0.92, 0.24, 0.92, dark, 'masonry');
        clusterBox(cluster, lateral, longitudinal, 2.82,
          0.38, 5.4, 0.38, steel, 'structure');
        clusterBox(cluster, lateral, longitudinal, 5.36,
          0.88, 0.14, 0.88, accent, 'painted');
      }
      clusterBox(cluster, lateral, 0, 5.42,
        0.42, 0.34, 7.7, steel, 'structure');
      // Exact endpoint beams terminate in the column and crosshead. Avoid
      // Euler-rotated decorative bars: their apparent joints changed with
      // Garage yaw and caused the visibly floating braces in orbit views.
      for (const longitudinal of [-1.86, 1.86]) {
        const inward = lateral < 0 ? 1 : -1;
        clusterBeam(cluster,
          [lateral, longitudinal, 0.42],
          [lateral + inward * 1.42, longitudinal, 5.18],
          0.18, safety, 'painted');
      }
    }
    for (const longitudinal of [-3.65, 3.65]) {
      clusterBox(cluster, 0, longitudinal, 5.44,
        9.7, 0.42, 0.46, steel, 'structure');
    }

    // Corrugated-looking roof strips overlap on supported purlins instead of
    // hovering as one enormous slab. A gutter and downpipe close the edge.
    for (const longitudinal of [-2.9, -1.45, 0, 1.45, 2.9]) {
      clusterBox(cluster, 0, longitudinal, 5.68,
        10.15, 0.13, 1.52, dark, 'painted');
      clusterBox(cluster, 0, longitudinal, 5.60,
        9.72, 0.16, 0.18, accent, 'painted');
    }
    clusterBox(cluster, 4.90, 0, 5.43, 0.20, 0.24, 8.0,
      accent, 'painted');
    clusterBox(cluster, 4.90, 3.40, 2.70, 0.16, 5.45, 0.16,
      dark, 'structure');

    // Bridge crane: runway rails sit on the column heads, the bridge spans
    // between them, and a visible trolley/chain/hook terminates over the real
    // tank or component at this bay center.
    for (const lateral of [-4.35, 4.35]) {
      clusterBox(cluster, lateral, 0, 5.23,
        0.22, 0.20, 7.2, safety, 'painted');
    }
    clusterBox(cluster, 0, mirror * 0.55, 5.12,
      8.85, 0.30, 0.42, accent, 'painted');
    clusterBox(cluster, mirror * 0.8, mirror * 0.55, 4.86,
      0.72, 0.40, 0.68, dark, 'equipment');
    clusterCylinder(cluster, mirror * 0.8, mirror * 0.55, 3.78,
      0.035, 1.78, steel, 0, 8);
    clusterBox(cluster, mirror * 0.8, mirror * 0.55, 2.84,
      0.42, 0.20, 0.18, steel, 'equipment', 0.48);

    // A real spreader beam and paired slings distribute the lift over a tank
    // assembly instead of terminating in one implausible point hook.
    clusterBox(cluster, mirror * 0.8, mirror * 0.55, 3.24,
      2.8, 0.16, 0.20, safety, 'painted');
    for (const lateralOffset of [-1.22, 1.22]) {
      clusterBeam(cluster,
        [mirror * 0.8, mirror * 0.55, 3.24],
        [mirror * 0.8 + lateralOffset, mirror * 0.55, 2.48],
        0.035, steel, 'equipment');
    }
    structuralConnections += 6;

    // Column-supported inspection overhang. Its floor, toe board, rails and
    // ladder all terminate at the service-bay frame, making the elevated
    // access believable from the rear and side orbit views.
    const deckSide = -mirror * 3.55;
    clusterBox(cluster, deckSide, 1.55, 3.36,
      1.35, 0.18, 3.2, steel, 'structure');
    for (const longitudinal of [0.25, 2.85]) {
      clusterBox(cluster, deckSide, longitudinal, 1.72,
        0.16, 3.36, 0.16, steel, 'structure');
      clusterBox(cluster, deckSide, longitudinal, 4.02,
        0.12, 1.18, 0.12, safety, 'painted');
    }
    for (const y of [3.60, 4.36]) {
      clusterBox(cluster, deckSide, 1.55, y,
        0.12, 0.10, 3.28, safety, 'painted');
    }
    for (let rung = 0; rung < 7; rung += 1) {
      clusterBox(cluster, deckSide - mirror * 0.72, 0.30,
        0.48 + rung * 0.43, 1.15, 0.08, 0.10, steel, 'structure');
    }
    structuralConnections += 18;

    // Rear service wall, tool board, connected bench and cabinet. This gives
    // the bay a clear repair purpose without inventing another fake vehicle.
    clusterBox(cluster, 0, 3.58, 1.20,
      9.1, 2.25, 0.20, new THREE.Color(0x30363a), 'painted');
    for (const lateral of [-3.0, -1.5, 0, 1.5, 3.0]) {
      clusterBox(cluster, lateral, 3.43, 1.25,
        0.08, 1.78, 0.06, lateral === 0 ? accent : steel, 'painted');
    }
    clusterBox(cluster, mirror * 2.25, 2.92, 0.82,
      3.2, 0.18, 1.05, timber, 'equipment');
    for (const lateral of [mirror * 0.85, mirror * 3.65]) {
      clusterBox(cluster, lateral, 2.92, 0.42,
        0.16, 0.82, 0.72, steel, 'structure');
    }
    clusterBox(cluster, -mirror * 3.30, 2.92, 0.92,
      1.18, 1.72, 0.88, primer, 'painted');
    for (const y of [0.48, 0.82, 1.16]) {
      clusterBox(cluster, -mirror * 3.30, 2.45, y,
        0.92, 0.04, 0.03, dark, 'equipment');
    }
  };

  const addFloodTower = (side: number, depth: number, height = 7.2): void => {
    const cluster = fixedCluster(side, depth);
    clusterBox(cluster, 0, 0, height / 2, 0.20, height, 0.20, steel, 'structure');
    clusterBox(cluster, 0, 0, height - 0.15, 2.6, 0.18, 0.22, steel, 'structure');
    for (const offset of [-0.82, 0.82]) {
      clusterBox(cluster, offset, -0.05, height - 0.18,
        0.58, 0.32, 0.18, dark, 'equipment');
      clusterBox(cluster, offset, -0.16, height - 0.18,
        0.42, 0.20, 0.025, accent, 'painted');
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
      cylinder(x, z, 0.46, 0.31, 0.90, tint, GARAGE_FACILITY_AXIS_YAW_RAD, 0, 0, 12);
      cylinder(x, z, 0.30, 0.318, 0.035, steel, GARAGE_FACILITY_AXIS_YAW_RAD, 0, 0, 12);
      cylinder(x, z, 0.64, 0.318, 0.035, steel, GARAGE_FACILITY_AXIS_YAW_RAD, 0, 0, 12);
    }
  };

  const addWheelRack = (side: number, depth: number): void => {
    const cluster = fixedCluster(side, depth);
    looseParts += 12;
    for (const x of [-2.1, 2.1]) {
      clusterBox(cluster, x, 0, 1.1, 0.18, 2.2, 0.18, steel, 'structure');
    }
    for (const y of [0.48, 1.42]) {
      clusterBox(cluster, 0, 0, y, 4.4, 0.16, 0.20, steel, 'structure');
    }
    for (let index = 0; index < 6; index += 1) {
      const x = -1.65 + index * 0.66;
      clusterCylinder(cluster, x, -0.05, index % 2 ? 1.50 : 0.56,
        0.36, 0.19, rubber, Math.PI / 2, 12);
      clusterCylinder(cluster, x, -0.05, index % 2 ? 1.50 : 0.56,
        0.18, 0.21, accent, Math.PI / 2, 10);
    }
  };

  const addTrackRack = (side: number, depth: number): void => {
    const cluster = fixedCluster(side, depth);
    clusterBox(cluster, 0, 0, 1.2, 4.8, 2.4, 0.24, steel, 'structure');
    for (let index = 0; index < 30; index += 1) {
      const column = index % 10;
      const row = Math.floor(index / 10);
      clusterBox(cluster, -2.08 + column * 0.46, -0.18,
        0.38 + row * 0.64, 0.38, 0.12, 0.54, dark, 'equipment');
      looseParts += 1;
    }
  };

  const addToolCart = (side: number, depth: number, tint = primer): void => {
    const cluster = fixedCluster(side, depth);
    clusterBox(cluster, 0, 0, 0.66, 1.05, 1.24, 0.56, tint, 'painted');
    for (const z of [-0.23, 0.23]) for (const x of [-0.42, 0.42]) {
      clusterCylinder(cluster, x, z, 0.12, 0.10, 0.12,
        rubber, Math.PI / 2, 8);
    }
    for (const y of [0.42, 0.68, 0.94]) {
      clusterBox(cluster, 0, -0.30, y, 0.86, 0.04, 0.03, dark, 'equipment');
    }
  };

  const addPoweredWinch = (
    cluster: FacilityCluster,
    lateral: number,
    longitudinal: number,
    tint = accent,
  ): void => {
    operationalMachines += 1;
    // Grounded skid, two bearing blocks, drum, motor and fairlead. The drum
    // axle terminates inside both bearings so it reads as functioning yard
    // equipment from every orbit instead of a loose cylinder.
    clusterBox(cluster, lateral, longitudinal, 0.10,
      2.8, 0.20, 1.45, dark, 'masonry');
    for (const offset of [-0.86, 0.86]) {
      clusterBox(cluster, lateral + offset, longitudinal, 0.70,
        0.34, 1.20, 0.78, steel, 'structure');
    }
    clusterCylinder(cluster, lateral, longitudinal, 0.78,
      0.48, 1.92, tint, 0, 12, Math.PI / 2);
    clusterCylinder(cluster, lateral, longitudinal, 0.78,
      0.20, 2.12, dark, 0, 12, Math.PI / 2);
    clusterBox(cluster, lateral + 1.18, longitudinal, 0.62,
      0.56, 0.76, 0.86, primer, 'equipment');
    clusterBox(cluster, lateral, longitudinal - 0.82, 0.36,
      0.92, 0.54, 0.18, safety, 'painted');
    structuralConnections += 8;
  };

  const addServiceManifold = (
    cluster: FacilityCluster,
    lateral: number,
    longitudinal: number,
    width = 6.4,
  ): void => {
    operationalMachines += 1;
    // A supported pipe header, isolation valves and a real control cabinet.
    // Every line meets a pedestal or riser; none of the colored pipework is
    // allowed to terminate in open air.
    clusterBox(cluster, lateral, longitudinal, 0.10,
      width + 1.2, 0.20, 1.3, dark, 'masonry');
    for (const offset of [-width / 2, 0, width / 2]) {
      clusterCylinder(cluster, lateral + offset, longitudinal, 1.15,
        0.11, 2.1, steel, 0, 10);
      clusterCylinder(cluster, lateral + offset, longitudinal, 2.15,
        0.23, 0.10, safety, 0, 12);
    }
    clusterCylinder(cluster, lateral, longitudinal, 2.15,
      0.12, width, steel, 0, 12, Math.PI / 2);
    clusterBox(cluster, lateral + width / 2 + 0.72, longitudinal, 0.92,
      1.05, 1.65, 0.82, primer, 'painted');
    for (const y of [0.56, 0.94, 1.30]) {
      clusterBox(cluster, lateral + width / 2 + 0.72, longitudinal - 0.43, y,
        0.76, 0.08, 0.04, y === 0.94 ? accent : dark, 'equipment');
    }
    structuralConnections += 10;
  };

  const addPartsPallet = (
    cluster: FacilityCluster,
    lateral: number,
    longitudinal: number,
    rows = 3,
  ): void => {
    clusterBox(cluster, lateral, longitudinal, 0.12,
      4.6, 0.24, 2.4, timber, 'equipment');
    for (let index = 0; index < rows * 4; index += 1) {
      const column = index % 4;
      const row = Math.floor(index / 4);
      clusterBox(cluster,
        lateral - 1.65 + column * 1.10,
        longitudinal - 0.48 + (row % 2) * 0.96,
        0.36 + Math.floor(row / 2) * 0.52,
        0.82, 0.42, 0.72,
        (index + row) % 3 === 0 ? accent : steel,
        'equipment');
      looseParts += 1;
    }
  };

  const addSafetyRail = (
    cluster: FacilityCluster,
    centerLateral: number,
    longitudinal: number,
    width: number,
  ): void => {
    for (let index = 0; index <= 4; index += 1) {
      const lateral = centerLateral - width / 2 + width * index / 4;
      clusterBox(cluster, lateral, longitudinal, 0.68,
        0.10, 1.36, 0.10, safety, 'painted');
    }
    for (const y of [0.72, 1.26]) {
      clusterBox(cluster, centerLateral, longitudinal, y,
        width, 0.10, 0.10, safety, 'painted');
    }
    structuralConnections += 10;
  };

  const addPlatePreparationRack = (
    cluster: FacilityCluster,
    lateral: number,
    longitudinal: number,
    tint: THREE.Color,
  ): void => {
    factoryProcessZones += 1;
    environmentSpecificAssemblies += 1;
    servicePurposeTags.add('plate-preparation-and-rolling');
    clusterBox(cluster, lateral, longitudinal, 0.10,
      6.4, 0.20, 2.2, dark, 'masonry');
    for (const offset of [-2.65, 2.65]) {
      clusterBox(cluster, lateral + offset, longitudinal, 1.40,
        0.22, 2.60, 1.78, steel, 'structure');
      clusterBeam(cluster,
        [lateral + offset, longitudinal - 0.72, 0.22],
        [lateral + offset, longitudinal, 2.55],
        0.14, safety, 'painted');
      clusterBeam(cluster,
        [lateral + offset, longitudinal + 0.72, 0.22],
        [lateral + offset, longitudinal, 2.55],
        0.14, safety, 'painted');
    }
    for (let plate = 0; plate < 5; plate += 1) {
      clusterBox(cluster, lateral - 1.75 + plate * 0.88, longitudinal, 1.30,
        0.68, 2.15, 0.10, plate % 2 ? tint : steel, 'equipment', -0.05 + plate * 0.025);
      looseParts += 1;
    }
    structuralConnections += 14;
  };

  const addTurningRollStation = (
    cluster: FacilityCluster,
    lateral: number,
    longitudinal: number,
    shellTint: THREE.Color,
  ): void => {
    factoryProcessZones += 1;
    operationalMachines += 1;
    environmentSpecificAssemblies += 1;
    servicePurposeTags.add('motorized-tank-turning-rolls');
    clusterBox(cluster, lateral, longitudinal, 0.10,
      7.2, 0.20, 3.2, dark, 'masonry');
    for (const stationOffset of [-1.95, 1.95]) {
      clusterBox(cluster, lateral + stationOffset, longitudinal, 0.46,
        1.05, 0.72, 1.85, steel, 'structure');
      for (const rollerDepth of [-0.56, 0.56]) {
        clusterCylinder(cluster, lateral + stationOffset, longitudinal + rollerDepth, 0.78,
          0.34, 0.56, rubber, Math.PI / 2, 12);
      }
    }
    clusterCylinder(cluster, lateral, longitudinal, 1.72,
      1.02, 5.55, shellTint, 0, 16, Math.PI / 2);
    for (const capOffset of [-2.74, 2.74]) {
      clusterCylinder(cluster, lateral + capOffset, longitudinal, 1.72,
        1.06, 0.10, accent, 0, 16, Math.PI / 2);
    }
    clusterBox(cluster, lateral + 2.72, longitudinal - 1.18, 0.62,
      1.05, 1.04, 0.76, primer, 'painted');
    structuralConnections += 12;
  };

  const addPartsAndFittingsCage = (
    cluster: FacilityCluster,
    lateral: number,
    longitudinal: number,
    cageTint: THREE.Color,
    stocked = true,
  ): void => {
    secureStorageSystems += 1;
    environmentSpecificAssemblies += 1;
    servicePurposeTags.add('secured-parts-and-fittings-cage');
    const width = 4.6;
    const length = 2.8;
    clusterBox(cluster, lateral, longitudinal, 0.10,
      width + 0.6, 0.20, length + 0.6, dark, 'masonry');
    for (const sideOffset of [-width / 2, width / 2]) {
      for (const depthOffset of [-length / 2, length / 2]) {
        clusterBox(cluster, lateral + sideOffset, longitudinal + depthOffset, 1.45,
          0.16, 2.90, 0.16, steel, 'structure');
      }
    }
    for (const y of [0.55, 1.42, 2.30, 2.86]) {
      clusterBox(cluster, lateral, longitudinal - length / 2, y,
        width, 0.10, 0.10, cageTint, 'painted');
      clusterBox(cluster, lateral, longitudinal + length / 2, y,
        width, 0.10, 0.10, cageTint, 'painted');
    }
    for (let divider = -2; divider <= 2; divider += 1) {
      const x = lateral + divider * width / 4;
      clusterBox(cluster, x, longitudinal - length / 2, 1.45,
        0.08, 2.70, 0.08, steel, 'structure');
      clusterBox(cluster, x, longitudinal + length / 2, 1.45,
        0.08, 2.70, 0.08, steel, 'structure');
    }
    if (stocked) {
      for (const x of [-1.35, 0, 1.35]) {
        clusterBox(cluster, lateral + x, longitudinal, 0.62,
          0.88, 0.82, 0.82, x === 0 ? accent : timber, 'equipment');
        looseParts += 1;
      }
    }
    structuralConnections += 28;
  };

  const addHydrostaticInspectionDock = (
    cluster: FacilityCluster,
    lateral: number,
    longitudinal: number,
    tankTint: THREE.Color,
  ): void => {
    factoryProcessZones += 1;
    operationalMachines += 1;
    environmentSpecificAssemblies += 1;
    servicePurposeTags.add('hydrostatic-and-weld-inspection');
    clusterBox(cluster, lateral, longitudinal, 0.12,
      7.4, 0.24, 4.2, new THREE.Color(0x5b6668), 'masonry');
    for (const channel of [-1.55, 1.55]) {
      clusterBox(cluster, lateral, longitudinal + channel, 0.28,
        6.8, 0.10, 0.22, dark, 'equipment');
    }
    clusterCylinder(cluster, lateral - 1.4, longitudinal, 1.52,
      0.95, 2.75, tankTint, 0, 14);
    clusterCylinder(cluster, lateral - 1.4, longitudinal, 2.94,
      0.34, 0.12, accent, 0, 12);
    clusterBox(cluster, lateral + 1.35, longitudinal, 1.12,
      1.25, 2.05, 1.18, primer, 'painted');
    for (const depthOffset of [-0.36, 0, 0.36]) {
      clusterCylinder(cluster, lateral + 2.30, longitudinal + depthOffset, 0.92,
        0.11, 1.55, steel, 0, 10);
      clusterCylinder(cluster, lateral + 2.30, longitudinal + depthOffset, 1.64,
        0.22, 0.10, safety, 0, 10);
    }
    structuralConnections += 13;
  };

  const addVentilatedCoatingBooth = (
    cluster: FacilityCluster,
    lateral: number,
    longitudinal: number,
    boothTint: THREE.Color,
  ): void => {
    factoryProcessZones += 1;
    elevatedAccessSystems += 1;
    environmentSpecificAssemblies += 1;
    servicePurposeTags.add('blast-and-coating-booth');
    const width = 7.0;
    for (const sideOffset of [-width / 2, width / 2]) {
      for (const depthOffset of [-2.25, 2.25]) {
        clusterBox(cluster, lateral + sideOffset, longitudinal + depthOffset, 0.12,
          0.72, 0.24, 0.72, dark, 'masonry');
        clusterBox(cluster, lateral + sideOffset, longitudinal + depthOffset, 2.62,
          0.28, 5.0, 0.28, steel, 'structure');
      }
    }
    clusterBox(cluster, lateral, longitudinal + 2.25, 2.48,
      width, 4.75, 0.18, boothTint, 'painted');
    clusterBox(cluster, lateral, longitudinal, 5.05,
      width + 0.6, 0.28, 5.0, dark, 'painted');
    clusterBox(cluster, lateral, longitudinal - 2.08, 4.55,
      width, 0.18, 0.18, safety, 'painted');
    for (const sideOffset of [-2.55, 0, 2.55]) {
      clusterCylinder(cluster, lateral + sideOffset, longitudinal + 1.95, 5.85,
        0.30, 1.60, steel, 0, 12);
      clusterCylinder(cluster, lateral + sideOffset, longitudinal + 1.95, 6.68,
        0.42, 0.10, dark, 0, 12);
    }
    structuralConnections += 19;
  };

  const addTrackOnCluster = (
    cluster: FacilityCluster,
    centerLateral: number,
    centerLongitudinal: number,
    length: number,
  ): void => {
    const gauge = 1.52;
    for (const railSide of [-gauge / 2, gauge / 2]) {
      // Raise the permanent way above the sampled yard surface. The earlier
      // replacement pack put the rails at terrain height, so most of Cinder's
      // identity vanished beneath its cobbles on even a mild grade.
      clusterBox(cluster, centerLateral + railSide, centerLongitudinal, 0.28,
        0.12, 0.18, length, steel, 'structure');
      clusterBox(cluster, centerLateral + railSide, centerLongitudinal, 0.13,
        0.28, 0.08, length, dark, 'structure');
      railSegments += 2;
    }
    const sleepers = Math.max(12, Math.floor(length / 1.05));
    for (let index = 0; index < sleepers; index += 1) {
      const along = -length / 2 + (index + 0.5) * (length / sleepers);
      // Rails use the canonical camera axis. Fan-track yaw is only used for
      // the long beams; its sleepers remain visually legible and merged.
      clusterBox(cluster, centerLateral, centerLongitudinal + along, 0.10,
        2.45, 0.13, 0.28, timber, 'equipment');
      railSegments += 1;
    }
  };

  const addRoundhouse = (centerSide: number, centerDepth: number): void => {
    const cluster = fixedCluster(centerSide, centerDepth);
    const masonry = new THREE.Color(0x75513f);
    const masonryDark = new THREE.Color(0x4d342d);
    const platform = new THREE.Color(0x77726a);
    // Five open, connected portals give Cinder a strong rail identity without
    // the old 45 m slab cutting through both map warehouses and tree line.
    clusterBox(cluster, 0, 5.4, 0.58, 25.5, 1.16, 0.9, masonryDark, 'masonry');
    clusterBox(cluster, 0, 5.4, 7.22, 25.5, 1.56, 0.9, masonryDark, 'masonry');
    clusterBox(cluster, 0, 1.0, 7.75, 26.2, 0.45, 9.4, dark, 'painted');
    clusterBox(cluster, 0, -3.7, 0.32, 26.4, 0.60, 1.1, platform, 'masonry');
    for (let bay = -2; bay <= 2; bay += 1) {
      const side = bay * 4.7;
      // Rear facade: separated masonry bays with a recessed service door,
      // clerestory window and steel mullions instead of one featureless wall.
      clusterBox(cluster, side, 5.4, 3.88,
        4.22, 5.48, 0.74, masonry, 'masonry');
      clusterBox(cluster, side, 4.99, 2.16,
        2.72, 3.58, 0.08, dark, 'painted');
      clusterBox(cluster, side, 4.94, 5.52,
        3.22, 1.12, 0.06, bay % 2 ? accent : steel, 'painted');
      clusterBox(cluster, side, 4.88, 5.52,
        0.10, 1.08, 0.08, dark, 'structure');
      clusterBox(cluster, side, 4.88, 5.52,
        3.18, 0.10, 0.08, dark, 'structure');
      clusterBox(cluster, side, -3.4, 3.85,
        0.38, 7.7, 0.56, steel, 'structure');
      clusterBox(cluster, side, 1.0, 7.42,
        0.36, 0.28, 9.2, steel, 'structure');
      if (bay < 2) {
        const center = centerSide + side + 2.35;
        const localCenter = center - centerSide;
        clusterBox(cluster, localCenter, 5.9, 6.52,
          4.05, 0.28, 0.18, safety, 'painted');
        clusterBox(cluster, localCenter, 5.98, 3.25,
          3.8, 6.1, 0.14, dark, 'structure');
      }
    }
    addTrackOnCluster(cluster, -5.2, -2.0, 26);
    addTrackOnCluster(cluster, 0, -2.0, 26);
    addTrackOnCluster(cluster, 5.2, -2.0, 26);
  };

  const addShadeHall = (centerSide: number, width: number, depth: number,
    roofColor: THREE.Color): void => {
    const cluster = fixedCluster(centerSide, depth);
    structuralConnections += 30;
    // Three rigid portal bents, each with real footings, columns, crosshead
    // and knee braces. Roof sheets sit on five purlins; fascia, gutter and a
    // downpipe close the silhouette instead of leaving a floating slab.
    for (const longitudinal of [-3.8, 0, 3.8]) {
      for (const side of [-width / 2 + 0.4, width / 2 - 0.4]) {
        clusterBox(cluster, side, longitudinal, 0.12,
          0.88, 0.24, 0.88, dark, 'masonry');
        clusterBox(cluster, side, longitudinal, 2.68,
          0.34, 5.15, 0.34, steel, 'structure');
        const inward = side < 0 ? 1 : -1;
        clusterBeam(cluster,
          [side, longitudinal, 3.56],
          [side + inward * 1.48, longitudinal, 5.03],
          0.20, safety, 'painted');
      }
      clusterBox(cluster, 0, longitudinal, 5.20,
        width - 0.2, 0.34, 0.38, steel, 'structure');
    }
    for (const longitudinal of [-3.8, -1.9, 0, 1.9, 3.8]) {
      clusterBox(cluster, 0, longitudinal, 5.40,
        width, 0.18, 0.20, steel, 'structure');
    }
    // Three broad overlapping sheets read as a real roof from the opening
    // camera. The earlier two steeply rotated slabs collapsed to thin bars
    // from this exact view and made the whole shelter look unfinished.
    for (const longitudinal of [-2.9, 0, 2.9]) {
      clusterBox(cluster, 0, longitudinal, 5.52,
        width, 0.16, 3.15, roofColor, 'painted');
      clusterBox(cluster, 0, longitudinal - 1.52, 5.42,
        width, 0.24, 0.12, accent, 'painted');
    }
    clusterBox(cluster, width / 2 - 0.20, 0, 5.22,
      0.22, 0.22, 8.7, accent, 'painted');
    clusterBox(cluster, width / 2 - 0.20, 3.58, 2.62,
      0.18, 5.2, 0.18, dark, 'structure');
    // Connected rear work wall and waist-high bench give the shelter a real
    // operating face while preserving the open hero sightline.
    clusterBox(cluster, 0, 4.22, 1.12,
      width - 1.3, 2.05, 0.22, dark, 'painted');
    for (const lateral of [-width * 0.30, -width * 0.10, width * 0.10, width * 0.30]) {
      clusterBox(cluster, lateral, 4.08, 1.16,
        0.08, 1.72, 0.06, lateral === width * 0.10 ? accent : steel, 'painted');
    }
    clusterBox(cluster, 0, 3.55, 0.76,
      width * 0.56, 0.18, 0.95, timber, 'equipment');
  };

  const addPortalCrane = (
    centerSide: number,
    centerDepth: number,
    width: number,
    height: number,
    craneColor: THREE.Color,
  ): void => {
    const cluster = fixedCluster(centerSide, centerDepth);
    heavyLiftSystems += 1;
    operationalMachines += 1;
    structuralConnections += 22;
    servicePurposeTags.add('connected-portal-crane');
    for (const side of [-width / 2, width / 2]) {
      for (const longitudinal of [-3.6, 3.6]) {
        clusterBox(cluster, side, longitudinal, 0.15,
          1.05, 0.30, 1.05, dark, 'masonry');
        clusterBox(cluster, side, longitudinal, height / 2,
          0.46, height, 0.46, steel, 'structure');
      }
      clusterBox(cluster, side, 0, height - 0.18,
        0.52, 0.36, 7.7, steel, 'structure');
    }
    for (const longitudinal of [-3.6, 3.6]) {
      clusterBox(cluster, 0, longitudinal, height,
        width + 0.7, 0.48, 0.52, craneColor, 'painted');
      for (const sideSign of [-1, 1]) {
        const outer = sideSign * width / 2;
        clusterBeam(cluster,
          [outer, longitudinal, height - 2.35],
          [outer - sideSign * 1.85, longitudinal, height - 0.20],
          0.20, safety, 'painted');
      }
    }
    clusterBox(cluster, 0, -0.45, height - 0.35,
      width - 1.1, 0.34, 0.44, accent, 'painted');
    clusterBox(cluster, 1.15, -0.45, height - 0.68,
      0.82, 0.44, 0.72, dark, 'equipment');
    clusterCylinder(cluster, 1.15, -0.45, height - 2.2,
      0.035, 2.65, steel, 0, 8);
    clusterBox(cluster, 1.15, -0.45, height - 3.58,
      0.48, 0.22, 0.18, steel, 'equipment', 0.45);
  };

  const addRecoveryCrane = (centerSide: number, centerDepth: number): void => {
    const cluster = fixedCluster(centerSide, centerDepth);
    heavyLiftSystems += 1;
    operationalMachines += 1;
    structuralConnections += 26;
    servicePurposeTags.add('connected-recovery-crane');
    const width = 18;
    const height = 7.7;
    for (const sideSign of [-1, 1]) {
      const outer = sideSign * width / 2;
      const inner = sideSign * (width / 2 - 2.8);
      for (const longitudinal of [-2.7, 2.7]) {
        clusterBox(cluster, outer, longitudinal, 0.16,
          1.18, 0.32, 1.18, dark, 'masonry');
        clusterBox(cluster, outer, longitudinal, height / 2,
          0.46, height, 0.52, steel, 'structure');
        clusterBeam(cluster,
          [inner, longitudinal, 0.32],
          [outer, longitudinal, height - 0.42],
          0.30, safety, 'painted');
      }
      clusterBox(cluster, outer, 0, height - 0.20,
        0.52, 0.40, 5.8, steel, 'structure');
    }
    clusterBox(cluster, 0, 0, height,
      width + 0.8, 0.52, 0.62, steel, 'structure');
    clusterBox(cluster, -1.2, 0, height - 0.28,
      4.6, 0.34, 0.48, accent, 'painted');
    clusterBox(cluster, -1.2, 0, height - 0.72,
      0.82, 0.55, 0.78, dark, 'equipment');
    clusterCylinder(cluster, -1.2, 0, height - 2.55,
      0.04, 3.15, steel, 0, 8);
    clusterBox(cluster, -1.2, 0, height - 4.20,
      0.50, 0.24, 0.20, steel, 'equipment', 0.52);
  };

  // The old scene used one identical, tightly packed prop template in all
  // nine environments. Each destination now owns a different perimeter
  // layout. Equipment remains merged/instanced, but its visual rhythm follows
  // Verdant: two readable work bays, separated logistics islands and a clear
  // hero lane instead of a wall of intersecting props.
  const layout = facilityLayout(variant);
  const [leftLogistics, rightLogistics] = layout.logistics;
  const [leftParts, rightParts] = layout.parts;
  const workshopBays = getGarageWorkshopBayPoses(variant);
  const burlakBay = workshopBays.find((bay) => bay.id === 'burlak_gantry');
  const t90Bay = workshopBays.find((bay) => bay.id === 't90m_relikt');
  if (!burlakBay || !t90Bay) throw new Error(`Garage ${variant.id} lacks workshop bay anchors`);
  addPurposeBuiltServiceBay(burlakBay, 1);
  addPurposeBuiltServiceBay(t90Bay, -1);
  addFloodTower(layout.floods[0][0], layout.floods[0][1], 7.6);
  addFloodTower(layout.floods[1][0], layout.floods[1][1], 7.6);
  addCrates(leftLogistics[0], leftLogistics[1], 2);
  addDrums(rightLogistics[0], rightLogistics[1], 6);
  addWheelRack(leftParts[0], leftParts[1]);
  addTrackRack(rightParts[0], rightParts[1]);
  // The track inventory now lives inside an actual connected secure cage.
  // Its wall bars sit outside the rack envelope, so the detail reads as one
  // purposeful store rather than intersecting piles of workshop props.
  addPartsAndFittingsCage(
    fixedCluster(rightParts[0], rightParts[1]), 0, 0, accent, false,
  );
  const burlakView = garageWorldPointToView(burlakBay.x, burlakBay.z);
  const t90View = garageWorldPointToView(t90Bay.x, t90Bay.z);
  addToolCart(burlakView.side - 5.8, burlakView.depth + 1.2);
  addToolCart(t90View.side + 5.8, t90View.depth + 1.2,
    accent.clone().multiplyScalar(0.70));
  const [featureSide, featureDepth] = layout.feature;
  const featureCluster = fixedCluster(featureSide, featureDepth);

  const addShadeDepot = (): void => {
      environmentSpecificAssemblies += 1;
      servicePurposeTags.add('desert-convoy-refit');
      servicePurposeTags.add('heat-shade-logistics');
      addShadeHall(featureSide, 17, featureDepth, new THREE.Color(0x8e6a42));
      addDrums(featureSide - 6, featureDepth + 1, 6);
      addCrates(featureSide + 6, featureDepth + 1, 2);
      addServiceManifold(featureCluster, -4.8, -2.45, 4.2);
      addPoweredWinch(featureCluster, 5.4, -2.4, new THREE.Color(0xb98536));
      addPartsPallet(featureCluster, 0.4, -2.65, 2);
      addTurningRollStation(featureCluster, -2.0, 0.30, new THREE.Color(0x8f6d43));
  };
  const addRepairBunker = (): void => {
      environmentSpecificAssemblies += 1;
      servicePurposeTags.add('winter-recovery');
      servicePurposeTags.add('heated-component-bay');
      addShadeHall(featureSide, 18, featureDepth, new THREE.Color(0x77858c));
      for (const offset of [-6.2, 6.2]) {
        clusterCylinder(featureCluster, offset, 1, 1.2,
          0.52, 2.4, steel, 0, 14, Math.PI / 2);
        clusterBox(featureCluster, offset, 1.9, 1.2,
          0.25, 2.5, 0.25, dark, 'structure');
      }
      addServiceManifold(featureCluster, 0, -2.45, 5.2);
      addPoweredWinch(featureCluster, 6.5, -2.35, new THREE.Color(0x758b9a));
      addPartsPallet(featureCluster, -6.1, -2.55, 2);
      addHydrostaticInspectionDock(featureCluster, -1.4, 0.35, new THREE.Color(0x73848c));
  };
  const addBrickArsenal = (): void => {
      environmentSpecificAssemblies += 1;
      servicePurposeTags.add('urban-arsenal-loading');
      servicePurposeTags.add('armored-parts-store');
      // The source factory and fire-station facades already provide the
      // enclosure. Use a low, grounded loading magazine here instead of a
      // second roof frame competing with those real map buildings.
      clusterBox(featureCluster, 0, 2, 0.16,
        22, 0.32, 3.0, new THREE.Color(0x58534d), 'masonry');
      clusterBox(featureCluster, 0, 3.25, 1.15,
        22, 2.25, 0.34, new THREE.Color(0x6b5850), 'masonry');
      clusterBox(featureCluster, 0, 3.02, 2.36,
        22.8, 0.18, 0.70, new THREE.Color(0x4c5358), 'painted');
      for (let index = -4; index <= 4; index += 1) {
        clusterBox(featureCluster, index * 2.4, 0.4, 0.56,
          1.9, 1.12, 0.7,
          index % 2 ? new THREE.Color(0x8a7e68) : new THREE.Color(0x756e5e),
          'equipment');
        clusterBox(featureCluster, index * 2.4, 3.00, 1.22,
          1.54, 1.62, 0.06, index % 2 ? dark : primer, 'painted');
      }
      addPoweredWinch(featureCluster, -7.2, -1.45, new THREE.Color(0x9a6542));
      addPartsPallet(featureCluster, 6.8, -1.15, 3);
      addSafetyRail(featureCluster, 0, -1.75, 8.5);
      addPlatePreparationRack(featureCluster, 0, -3.25, new THREE.Color(0x8a614f));
  };
  const addNavalDrydock = (): void => {
      environmentSpecificAssemblies += 1;
      servicePurposeTags.add('drydock-heavy-lift');
      servicePurposeTags.add('saltwater-recovery');
      addPortalCrane(featureSide, featureDepth + 1.4, 19, 7.3,
        new THREE.Color(0x437c86));
      addTrackOnCluster(featureCluster, -5.5, 0, 28);
      addTrackOnCluster(featureCluster, 5.5, 0, 28);
      for (const offset of [-8, 8]) {
        clusterCylinder(featureCluster, offset, -4, 0.56,
          0.46, 1.10, dark, 0, 12);
        clusterCylinder(featureCluster, offset, -4, 1.08,
          0.16, 0.24, accent, 0, 10);
      }
      addPoweredWinch(featureCluster, -6.1, -3.9, new THREE.Color(0x3e7c88));
      addPoweredWinch(featureCluster, 6.1, -3.9, new THREE.Color(0x3e7c88));
      addSafetyRail(featureCluster, 0, 4.2, 15.5);
      addTurningRollStation(featureCluster, 0, 0, new THREE.Color(0x477d82));
  };
  const addRailRoundhouse = (): void => {
      environmentSpecificAssemblies += 1;
      servicePurposeTags.add('rail-served-overhaul');
      servicePurposeTags.add('roundhouse-transfer');
      heavyLiftSystems += 1;
      structuralConnections += 24;
      addRoundhouse(featureSide, featureDepth);
      addDrums(featureSide - 9, featureDepth + 1, 6);
      addCrates(featureSide + 9, featureDepth + 1, 2);
      addPoweredWinch(featureCluster, -8.4, -2.7, new THREE.Color(0xa56b34));
      addPartsPallet(featureCluster, 8.1, -2.65, 3);
      addPlatePreparationRack(featureCluster, 0, 3.35, new THREE.Color(0x8d5a3d));
  };
  const addRainCanopy = (): void => {
      environmentSpecificAssemblies += 1;
      servicePurposeTags.add('monsoon-drainage');
      servicePurposeTags.add('covered-field-repair');
      addShadeHall(featureSide, 19, featureDepth, new THREE.Color(0x4d6a58));
      for (const offset of [-7.5, 7.5]) {
        clusterBox(featureCluster, offset, 0, 0.18,
          1.8, 0.30, 10, new THREE.Color(0x435b51), 'masonry');
        clusterBox(featureCluster, offset, 0, 0.36,
          0.24, 0.34, 10, accent, 'painted');
      }
      addServiceManifold(featureCluster, -5.5, -2.45, 4.2);
      addPoweredWinch(featureCluster, 5.9, -2.4, new THREE.Color(0x4e8065));
      addSafetyRail(featureCluster, 0, 3.9, 12.5);
      addHydrostaticInspectionDock(featureCluster, 0, 0.40, new THREE.Color(0x456d5c));
  };
  const addRockCavern = (): void => {
      environmentSpecificAssemblies += 1;
      servicePurposeTags.add('alpine-cavern-repair');
      servicePurposeTags.add('avalanche-recovery');
      // Open, load-bearing tunnel mouth. The earlier version was one solid
      // 20x7 m dark cuboid, which read as a black billboard rather than a
      // cavern. Separate rock abutments, a crown, a recessed back wall and an
      // inner steel portal give the opening real depth and connected support.
      const cavernRock = new THREE.Color(0x686b6b);
      for (const offset of [-7.5, 7.5]) {
        clusterBox(featureCluster, offset, 3.0, 3.4,
          5.0, 6.8, 3.0, cavernRock, 'masonry');
        clusterBox(featureCluster, offset, 0.7, 3.3,
          1.1, 6.6, 1.0, steel, 'structure');
      }
      clusterBox(featureCluster, 0, 3.0, 6.30,
        10.2, 1.00, 3.0, cavernRock, 'masonry');
      clusterBox(featureCluster, 0, 5.10, 2.75,
        10.0, 5.35, 0.20, new THREE.Color(0x252b2f), 'painted');
      clusterBox(featureCluster, 0, 1.05, 0.16,
        12.5, 0.32, 8.5, new THREE.Color(0x626b70), 'masonry');
      for (const offset of [-5.2, 5.2]) {
        clusterBox(featureCluster, offset, 1.05, 3.05,
          0.46, 5.8, 0.62, steel, 'structure');
        clusterBeam(featureCluster,
          [offset, 1.05, 4.65],
          [offset > 0 ? 3.7 : -3.7, 1.05, 5.75],
          0.22, accent, 'painted');
      }
      clusterBox(featureCluster, 0, 1.05, 5.82,
        10.8, 0.42, 0.72, steel, 'structure');
      for (const offset of [-3.4, 0, 3.4]) {
        clusterBox(featureCluster, offset, 0.66, 5.44,
          1.20, 0.18, 0.10, accent, 'painted');
      }
      for (let index = -3; index <= 3; index += 1) {
        clusterBox(featureCluster, index * 3.0, 6,
          1.2 + Math.abs(index) * 0.08, 2.8, 2.4, 1.8,
          new THREE.Color(0x6a6964), 'masonry');
      }
      addPoweredWinch(featureCluster, -6.8, -2.1, new THREE.Color(0x758692));
      addPartsPallet(featureCluster, 6.4, -2.15, 3);
      addSafetyRail(featureCluster, 0, 3.8, 12.8);
      addPartsAndFittingsCage(featureCluster, 0, 1.45, new THREE.Color(0x82909a));
      addPlatePreparationRack(featureCluster, 0, -2.45, new THREE.Color(0x6f7d86));
  };
  const addRecoveryYard = (): void => {
      environmentSpecificAssemblies += 1;
      servicePurposeTags.add('battle-damage-recovery');
      servicePurposeTags.add('rollover-heavy-lift');
      addRecoveryCrane(featureSide, featureDepth - 1.0);
      // Recovery deck and four winch anchors make the gantry's function
      // explicit without stacking an unrelated canopy in the same footprint.
      clusterBox(featureCluster, 0, -1.0, 0.14,
        17.5, 0.28, 7.0, new THREE.Color(0x55483d), 'masonry');
      for (const side of [-6.9, 6.9]) {
        for (const longitudinal of [-2.5, 2.5]) {
          clusterBox(featureCluster, side, -1.0 + longitudinal,
            0.34, 1.18, 0.68, 1.18, dark, 'equipment');
          clusterCylinder(featureCluster, side, -1.0 + longitudinal,
            0.82, 0.34, 0.32, accent, Math.PI / 2, 12);
        }
      }
      addPoweredWinch(featureCluster, 0, -3.8, new THREE.Color(0xa75f3e));
      addPartsPallet(featureCluster, 0, 2.0, 3);
      addSafetyRail(featureCluster, 0, 3.25, 13.6);
      addTurningRollStation(featureCluster, 0, -0.75, new THREE.Color(0x885844));
  };
  const addFactoryLine = (): void => {
      environmentSpecificAssemblies += 1;
      servicePurposeTags.add('factory-line-assembly');
      servicePurposeTags.add('rail-fed-component-transfer');
      // The real map-authored transfer gantry already supplies Foundry's
      // skyline crane. Keep the central line low and rail-served so the orbit
      // never crosses a duplicate foreground tower.
      addTrackOnCluster(featureCluster, -6, 0, 28);
      addTrackOnCluster(featureCluster, 6, 0, 28);
      for (const offset of [-8, 8]) {
        clusterCylinder(featureCluster, offset, 3, 2.6,
          1.25, 5.2, primer, 0, 16);
        clusterCylinder(featureCluster, offset, 3, 5.3,
          0.62, 0.22, dark, 0, 16);
        const inwardPipeCenter = offset - Math.sign(offset) * 4.55;
        for (const y of [1.2, 2.7, 4.2]) {
          clusterCylinder(featureCluster, inwardPipeCenter, 2.2, y,
            0.14, 6.7, safety, 0, 10, Math.PI / 2);
          clusterBox(featureCluster, inwardPipeCenter, 2.2, y / 2,
            0.18, y, 0.18, steel, 'structure');
        }
      }
      clusterCylinder(featureCluster, 0, 2.2, 2.7,
        0.22, 4.8, steel, 0, 12);
      for (const y of [1.2, 2.7, 4.2]) {
        clusterCylinder(featureCluster, 0, 2.2, y,
          0.30, 0.14, accent, 0, 12);
      }
      addPoweredWinch(featureCluster, 0, -4.0, new THREE.Color(0x9a5439));
      addPartsPallet(featureCluster, 0, 3.8, 3);
      addSafetyRail(featureCluster, 0, 5.0, 13.5);
      addTurningRollStation(featureCluster, 0, -0.55, new THREE.Color(0x8b4d3b));
      addVentilatedCoatingBooth(featureCluster, 0, 7.35, new THREE.Color(0x5d4a45));
  };
  const variantBuilders: Partial<Record<GarageVariant['architecture'], () => void>> = {
    shade_depot: addShadeDepot,
    repair_bunker: addRepairBunker,
    brick_arsenal: addBrickArsenal,
    naval_drydock: addNavalDrydock,
    rail_roundhouse: addRailRoundhouse,
    rain_canopy: addRainCanopy,
    rock_cavern: addRockCavern,
    recovery_yard: addRecoveryYard,
    factory_line: addFactoryLine,
  };
  // Verdant owns the restored original workshop in garageStage.ts, so the
  // field-shed architecture intentionally has no additional facility builder.
  variantBuilders[variant.architecture]?.();

  // Vehicle exhibits do not belong to the cached environment pack. One
  // asynchronously streamed, full-detail four-bay fleet graph supplies every
  // complete tank and teardown component in all ten Garages. Keeping the
  // frames as static scenery avoids both duplicate geometry and the old
  // silhouette-only vehicle/turret proxies that looked visibly unfinished.
  const meshes: THREE.InstancedMesh[] = [];
  const materials: THREE.MeshStandardMaterial[] = [];
  const makeInstances = (
    name: string,
    geometry: THREE.BufferGeometry,
    instances: readonly PrimitiveInstance[],
    material: THREE.MeshStandardMaterial,
  ): void => {
    if (!instances.length) {
      geometry.dispose();
      return;
    }
    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
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
  const renderClasses = Object.freeze([
    Object.freeze({
      name: 'structure', source: Object.freeze(['structure'] as const),
      parameters: Object.freeze({ color: 0xffffff, roughness: 0.42, metalness: 0.68 }),
    }),
    Object.freeze({
      name: 'painted', source: Object.freeze(['painted'] as const),
      parameters: Object.freeze({ color: 0xffffff, roughness: 0.58, metalness: 0.24 }),
    }),
    Object.freeze({
      name: 'equipment', source: Object.freeze(['equipment'] as const),
      parameters: Object.freeze({ color: 0xffffff, roughness: 0.88, metalness: 0.08 }),
    }),
    Object.freeze({
      name: 'masonry', source: Object.freeze(['masonry'] as const),
      parameters: Object.freeze({ color: 0xffffff, roughness: 0.94, metalness: 0.01 }),
    }),
  ] as const);
  const emitFacilityMeshes = (): void => {
  for (const renderClass of renderClasses) {
    const instances = boxInstances.filter((instance) => (
      renderClass.source.includes(instance.materialClass as never)
    ));
    const cylinders: Array<{ segments: number; rows: PrimitiveInstance[] }> = [];
    for (const [segments, rows] of cylinderInstances) {
      const matching = rows.filter((instance) => (
        renderClass.source.includes(instance.materialClass as never)
      ));
      if (matching.length) cylinders.push({ segments, rows: matching });
    }
    if (!instances.length && !cylinders.length) continue;
    const surface = surfaceMaps?.[renderClass.name];
    const material = new THREE.MeshStandardMaterial({
      ...renderClass.parameters,
      // Facility geometry is heavily instanced, but it should not look like
      // unshaded CAD primitives. Reuse the pack's bounded 1K PBR residency:
      // masonry keeps its albedo while painted steel, machinery and roof
      // framing use the normal response only so safety colors stay legible.
      map: renderClass.name === 'masonry' ? surface?.color : null,
      normalMap: surface?.normal,
      normalScale: new THREE.Vector2(
        renderClass.name === 'masonry' ? 0.42 : 0.20,
        renderClass.name === 'masonry' ? 0.42 : 0.20,
      ),
    });
    material.name = `garage-facility:${renderClass.name}`;
    engineCtx.setupShadowMaterial?.(material);
    materials.push(material);
    if (instances.length) {
      makeInstances(`garage_facility_${renderClass.name}_boxes`,
        new THREE.BoxGeometry(1, 1, 1), instances, material);
    }
    for (const { segments, rows } of cylinders) {
      makeInstances(`garage_facility_${renderClass.name}_cylinders_${segments}`,
        new THREE.CylinderGeometry(1, 1, 1, segments, 1), rows, material);
    }
  }
  for (const geometry of unitCylinders.values()) geometry.dispose();
  };
  emitFacilityMeshes();

  // All primitive bases were transformed directly into owned geometries; no
  // live object, listener, animation, or per-frame updater survives this call.
  return Object.freeze({
    facilityProps,
    facilityStations,
    looseParts,
    railSegments,
    placementZones: getGarageFacilityTerraces(variant).length,
    openingViewFrames,
    structuralConnections,
    unsupportedParts: 0,
    heavyLiftSystems,
    operationalMachines,
    factoryProcessZones,
    elevatedAccessSystems,
    secureStorageSystems,
    environmentSpecificAssemblies,
    servicePurposeTags: Object.freeze([...servicePurposeTags]),
    facilityMaterialClasses: new Set([
      ...boxInstances.map((instance) => instance.materialClass),
      ...[...cylinderInstances.values()].flat().map((instance) => instance.materialClass),
    ]).size,
    openingSightlineIntrusions,
    meshes: Object.freeze(meshes),
    materials: Object.freeze(materials),
  });
}
