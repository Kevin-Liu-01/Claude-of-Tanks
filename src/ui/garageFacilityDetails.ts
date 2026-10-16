import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import type { GarageVariant } from '../game/garageVariants.ts';
import type { GeometryBuckets } from '../world/maps/exteriorDetailKit.ts';
import {
  GARAGE_HERO_HEADING_RAD,
  garageViewPoint,
  garageWorldPointToView,
} from '../game/garagePresentationPose.ts';
import {
  GARAGE_SHELTER_FINISHES,
  getGarageWorkshopBayPoses,
  getGarageYardCrewFloors,
  leopardBayPointToWorkshop,
  LEOPARD_MOBILITY_FLOOR,
  type GarageWorkshopBayPose,
} from '../game/garageWorkshopLayout.ts';
import { garageContactShadowTexture } from './garageYardWear.ts';

interface GarageFacilityDetailStats {
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

interface GarageFacilityDetailBuild extends GarageFacilityDetailStats {
  readonly meshes: readonly THREE.Mesh[];
  readonly materials: readonly THREE.Material[];
}

/**
 * The building surfaces (the redesign, 2026-10-11: "halls, shelters, cranes and gantries built like real buildings"):
 * walls, roofs and slabs mapped at their real size, one merged mesh per surface, unlike the instanced members whose
 * texture spans each face. Sheeting is trapezoidal steel (walls: ribs vertical; roofs: ribs down the slope).
 */
type FacilitySurface = 'sheeting' | 'roofing' | 'brick' | 'render' | 'timber' | 'glazing';
type SurfaceMaps = Readonly<{ color: THREE.Texture | null; normal: THREE.Texture | null }>;

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
  /** Real-size building surface textures; a surface without maps falls back to its flat colour. */
  readonly surfaces?: Readonly<Partial<Record<'sheeting' | 'brick' | 'render' | 'timber', SurfaceMaps>>>;
  /** Metres per texture repeat for the shared building surfaces. */
  readonly sheetingTileM?: number;
}

interface GarageFacilityTerrace {
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
      // Keep the wheel inventory outside the nearby T-90M rebuild island.
      // The former -22/-16 placement overlapped both the service terrace and
      // its full-detail vehicle, which also let the two terrain pads fight.
      parts: [[-31, -17], [2, -36]], floods: [[-39, 1], [39, 1]],
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

/**
 * The fleet service pads and the crews' floors stand at the Garage datum (y = 0), the plane the shared exhibit and its
 * crews stand on. A facility terrace that reaches one of them shares that datum, so the two never fight over a floor
 * (2026-10-10: Ironworks' rail-fed line runs beside the yard track carry).
 */
export function garageTerraceAtDatum(
  terrace: GarageFacilityTerrace,
  terraces: readonly GarageFacilityTerrace[],
): boolean {
  const datumFloor = (candidate: GarageFacilityTerrace): boolean => candidate.label.startsWith('fleet-service-')
    || candidate.label.startsWith('crew-floor-');
  if (datumFloor(terrace)) return true;
  return terraces.some((other) => other !== terrace && datumFloor(other) && Math.hypot(
    (other.side - terrace.side) / (other.radiusSide + terrace.radiusSide),
    (other.depth - terrace.depth) / (other.radiusDepth + terrace.radiusDepth),
  ) < 1);
}

/** Flat, feathered service pads used before terrain geometry is emitted. */
export function getGarageFacilityTerraces(variant: GarageVariant): readonly GarageFacilityTerrace[] {
  const layout = facilityLayout(variant);
  const serviceBays: GarageFacilityTerrace[] = [];
  for (const bay of getGarageWorkshopBayPoses(variant)) {
    // Every fleet exhibit stands on a pad at the datum (2026-10-05). On raw terrain the Abrams welding bay sank up to
    // 3.2 m into Steinburg's cobbled bank and stood up to 1.5 m clear of Sirocco's sand, and the rolled K2's cradle
    // stood up to 2.8 m clear of Sirocco's and Saltmere's ground. The Abrams pad is wider than the others (the tank,
    // the stripped skirts, the dolly and the carts spread over about 11 m) and still clears the Burlak's and the K2's.
    const abrams = bay.id === 'abrams_welding';
    const view = garageWorldPointToView(bay.x, bay.z);
    serviceBays.push(Object.freeze({
      label: `fleet-service-${serviceBays.length + 1}`,
      side: view.side,
      depth: view.depth,
      radiusSide: abrams ? 7.6 : 6.4,
      radiusDepth: abrams ? 6.6 : 5.4,
    }));
  }
  // The Leopard mobility bay's floor is a datum pad too (2026-10-10, ground audit of the ten Garages: on raw terrain its
  // crew floated up to 1.44 m at Saltmere and stood buried to 0.79 m at Steinburg, the lift and the wheel rack with it).
  const leopardFloor = leopardBayPointToWorkshop(variant, LEOPARD_MOBILITY_FLOOR.x, LEOPARD_MOBILITY_FLOOR.z);
  const leopardView = garageWorldPointToView(leopardFloor.x, leopardFloor.z);
  serviceBays.push(Object.freeze({
    label: `fleet-service-${serviceBays.length + 1}`,
    side: leopardView.side,
    depth: leopardView.depth,
    radiusSide: LEOPARD_MOBILITY_FLOOR.radiusM,
    radiusDepth: LEOPARD_MOBILITY_FLOOR.radiusM,
  }));
  // the level yard floors beside the hero (the power pack's stand, the menu frame's open left band)
  const crewFloors = getGarageYardCrewFloors(variant).map((floor) => {
    const view = garageWorldPointToView(floor.x, floor.z);
    return Object.freeze({
      label: `crew-floor-${floor.id}`, side: view.side, depth: view.depth,
      radiusSide: floor.radiusM, radiusDepth: floor.radiusM,
    });
  });
  return Object.freeze([
    ...serviceBays,
    ...crewFloors,
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
  surfaces,
  sheetingTileM = 2,
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
  // Each Garage builds its service shelters its own way (2026-10-10, wave 357: "a tangle of flat navy, yellow and cyan
  // beams"): one regional frame paint and one roofing for every column, beam and roof sheet; safety yellow stays on
  // the braces and rails and the pack's accent on small fittings only.
  const shelter = GARAGE_SHELTER_FINISHES[variant.architecture] ?? GARAGE_SHELTER_FINISHES.field_shed;
  const steel = new THREE.Color(shelter.frame);
  const roofing = new THREE.Color(shelter.roof);
  const accent = new THREE.Color(variant.accent).lerp(steel, 0.45);
  const dark = new THREE.Color(0x171b1d);
  const safety = new THREE.Color(0xd19a2e);
  const timber = new THREE.Color(0x685035);
  const rubber = new THREE.Color(0x151719);
  const primer = new THREE.Color(0x8a3026); // tool-chest red enamel
  const unitCylinders = new Map<number, THREE.CylinderGeometry>();
  const boxInstances: PrimitiveInstance[] = [];
  const cylinderInstances = new Map<number, PrimitiveInstance[]>();
  // Two cylinder resolutions, one draw each (2026-10-11: the four or five segment counts each drew alone, and the
  // building surfaces needed those draws): pipes and posts at ten sides, drums, tanks and rollers at sixteen.
  const cylinderTier = (segments: number): number => (segments > 10 ? 16 : 10);
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
    const tier = cylinderTier(segments);
    unitCylinder(tier);
    const instances = cylinderInstances.get(tier) || [];
    instances.push({
      matrix: transform(side, depth, y, [radius, height, radius], yaw, rotationX, rotationZ),
      color: color.clone(),
      materialClass,
    });
    cylinderInstances.set(tier, instances);
    facilityProps += 1;
  };

  interface FacilityCluster {
    readonly x: number;
    readonly z: number;
    readonly baseY: number;
    /** The cluster's heading; the yard grid's axis unless the cluster belongs to a vehicle bay. */
    readonly yaw?: number;
  }

  // A bay's shelter stands square to the vehicle it houses, open toward the yard (the redesign, 2026-10-11, wave 393:
  // "the gantry's poles run through its walkway": the old grid-aligned frame crossed the turned exhibit's own kit).
  const bayCluster = (pose: GarageWorkshopBayPose): FacilityCluster => ({
    x: pose.x,
    z: pose.z,
    baseY: groundAtWorld(pose.x, pose.z),
    yaw: pose.yaw,
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
    // Facility facades stay parallel to the hero/rear wall unless the cluster is a vehicle bay's shelter, which turns
    // with its vehicle. Pitch and roll apply in the cluster's own frame, then its heading.
    const yaw = cluster.yaw ?? GARAGE_FACILITY_AXIS_YAW_RAD;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rotationX, 0, rotationZ)));
    return new THREE.Matrix4().compose(
      new THREE.Vector3(
        cluster.x + cos * lateral + sin * longitudinal,
        cluster.baseY + y,
        cluster.z - sin * lateral + cos * longitudinal,
      ),
      rotation,
      new THREE.Vector3(...scale),
    );
  };

  const clusterPoint = (
    cluster: FacilityCluster,
    lateral: number,
    longitudinal: number,
    y: number,
  ): THREE.Vector3 => {
    const yaw = cluster.yaw ?? GARAGE_FACILITY_AXIS_YAW_RAD;
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
    const tier = cylinderTier(segments);
    unitCylinder(tier);
    const instances = cylinderInstances.get(tier) || [];
    instances.push({
      matrix: clusterMatrix(
        cluster, lateral, longitudinal, y, [radius, height, radius], rotationX, rotationZ,
      ),
      color: color.clone(),
      materialClass: 'equipment',
    });
    cylinderInstances.set(tier, instances);
    facilityProps += 1;
  };

  // Building surfaces at their real size: each box's six faces take UVs from their own metres, so sheeting ribs, brick
  // courses and plank widths keep one scale on a 0.3 m fascia and on a 20 m wall.
  const surfaceGeometries = new Map<FacilitySurface, THREE.BufferGeometry[]>();
  const surfaceTile: Readonly<Record<FacilitySurface, number>> = Object.freeze({
    sheeting: sheetingTileM, roofing: sheetingTileM, brick: 2, render: 2.4, timber: 2, glazing: 1,
  });
  /**
   * A box of one building surface in a cluster's frame. `ribsAcross` turns the top and bottom faces' mapping so roof
   * sheeting ribs run down a slope that falls across the cluster (laterally) instead of along it.
   */
  const clusterSurface = (
    cluster: FacilityCluster,
    surface: FacilitySurface,
    lateral: number,
    longitudinal: number,
    y: number,
    width: number,
    height: number,
    length: number,
    options: Readonly<{ rotationX?: number; rotationZ?: number; ribsAcross?: boolean }> = {},
  ): void => {
    const geometry = new THREE.BoxGeometry(width, height, length);
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const tile = surfaceTile[surface];
    // BoxGeometry faces: +X, -X, +Y, -Y, +Z, -Z, four vertices each
    const spans: ReadonlyArray<readonly [number, number]> = [
      [length, height], [length, height], [width, length], [width, length], [width, height], [width, height],
    ];
    for (let face = 0; face < 6; face += 1) {
      const [su, sv] = spans[face];
      const across = options.ribsAcross && (face === 2 || face === 3);
      for (let vertex = 0; vertex < 4; vertex += 1) {
        const i = face * 4 + vertex;
        const u = uv.getX(i) * su / tile, v = uv.getY(i) * sv / tile;
        if (across) uv.setXY(i, v, u); else uv.setXY(i, u, v);
      }
    }
    geometry.applyMatrix4(clusterMatrix(cluster, lateral, longitudinal, y, [1, 1, 1],
      options.rotationX ?? 0, options.rotationZ ?? 0));
    facilityProps += 1;
    // render and planks ride the pack's own plaster and wood buckets (same albedos, no extra draw)
    if (surface === 'render' || surface === 'timber') {
      const bucket = surface === 'render' ? 'plaster2' : 'wood';
      (buckets[bucket] ||= []).push(geometry);
      return;
    }
    const list = surfaceGeometries.get(surface) || [];
    list.push(geometry);
    surfaceGeometries.set(surface, list);
  };

  // The outdoor service shelters (the redesign, 2026-10-11; waves 377 and 393: "the gantry is a jumble of columns with
  // yellow diagonals piercing the deck and ladder", "the camera looks down through a cage-like timber frame"): one
  // portal-frame building per bay. Four columns on footings carry a mono-pitch roof of trapezoidal sheeting that falls
  // to a gutter at the back; the back wall and the far side are clad, so the bay reads as a shelter with an open front;
  // short knee braces stiffen the front portal only; the bridge crane runs on brackets under the rafters.
  const BAY_HALF_W = 4.65;
  const BAY_HALF_L = 3.65;
  const FRONT_EAVE_Y = 6.0;
  const BACK_EAVE_Y = 5.45;
  const bayRoofY = (longitudinal: number): number => BACK_EAVE_Y
    + (FRONT_EAVE_Y - BACK_EAVE_Y) * ((longitudinal + BAY_HALF_L) / (2 * BAY_HALF_L));
  const addPurposeBuiltServiceBayFrame = (cluster: FacilityCluster, deckLateralSign = 0, cladLateralSign = -deckLateralSign): void => {
    // The bay's floor is the pack's own hardstand pad; only the service pit's steel grating marks it, flush with it.
    clusterBox(cluster, 0, 0.2, 0.035, 2.45, 0.03, 6.4, dark, 'equipment');
    for (const lateral of [-BAY_HALF_W, BAY_HALF_W]) {
      for (const longitudinal of [-BAY_HALF_L, BAY_HALF_L]) {
        const top = bayRoofY(longitudinal) - 0.18;
        clusterBox(cluster, lateral, longitudinal, 0.12, 0.92, 0.24, 0.92, dark, 'masonry');
        clusterBox(cluster, lateral, longitudinal, top / 2, 0.36, top, 0.36, steel, 'structure');
        // base plate and cap plate
        clusterBox(cluster, lateral, longitudinal, 0.27, 0.56, 0.06, 0.56, steel, 'structure');
        clusterBox(cluster, lateral, longitudinal, top, 0.5, 0.08, 0.5, steel, 'structure');
      }
      // the rafter on each column line follows the roof pitch from the back column to the front one
      clusterBeam(cluster,
        [lateral, -BAY_HALF_L - 0.45, bayRoofY(-BAY_HALF_L - 0.45) - 0.14],
        [lateral, BAY_HALF_L + 0.45, bayRoofY(BAY_HALF_L + 0.45) - 0.14],
        0.3, steel, 'structure');
    }
    // front and back portal beams, front knee braces short and square to the frame (no brace crosses the deck)
    for (const longitudinal of [-BAY_HALF_L, BAY_HALF_L]) {
      clusterBox(cluster, 0, longitudinal, bayRoofY(longitudinal) - 0.32,
        2 * BAY_HALF_W + 0.36, 0.42, 0.34, steel, 'structure');
    }
    for (const lateral of [-BAY_HALF_W, BAY_HALF_W]) {
      if (deckLateralSign !== 0 && Math.sign(lateral) === deckLateralSign) continue;
      const inward = lateral < 0 ? 1 : -1;
      clusterBeam(cluster,
        [lateral, BAY_HALF_L, FRONT_EAVE_Y - 1.45],
        [lateral + inward * 0.95, BAY_HALF_L, FRONT_EAVE_Y - 0.52],
        0.16, steel, 'structure');
    }
    // purlins across the rafters, then the roof sheeting with a 0.45 m overhang all round
    const pitch = Math.atan2(FRONT_EAVE_Y - BACK_EAVE_Y, 2 * BAY_HALF_L);
    for (let i = 0; i <= 5; i += 1) {
      const longitudinal = -BAY_HALF_L - 0.3 + i * ((2 * BAY_HALF_L + 0.6) / 5);
      clusterBox(cluster, 0, longitudinal, bayRoofY(longitudinal) + 0.05,
        2 * BAY_HALF_W + 0.9, 0.16, 0.12, steel, 'structure');
    }
    clusterSurface(cluster, 'roofing', 0, 0, bayRoofY(0) + 0.17,
      2 * BAY_HALF_W + 1.0, 0.05, (2 * BAY_HALF_L + 0.9) / Math.cos(pitch), { rotationX: -pitch });
    // fascia on the high front edge, gutter and two downpipes at the low back edge
    clusterBox(cluster, 0, BAY_HALF_L + 0.47, FRONT_EAVE_Y + 0.12, 2 * BAY_HALF_W + 1.0, 0.26, 0.05, roofing, 'painted');
    clusterBox(cluster, 0, -BAY_HALF_L - 0.5, BACK_EAVE_Y + 0.06, 2 * BAY_HALF_W + 1.0, 0.16, 0.18, dark, 'painted');
    for (const lateral of [-BAY_HALF_W + 0.3, BAY_HALF_W - 0.3]) {
      clusterBox(cluster, lateral, -BAY_HALF_L - 0.52, BACK_EAVE_Y / 2, 0.11, BACK_EAVE_Y, 0.11, dark, 'painted');
    }
    // the back wall clad from a concrete upstand to the rafters; the far side clad over its back half
    clusterSurface(cluster, 'render', 0, -BAY_HALF_L - 0.2, 0.3, 2 * BAY_HALF_W + 0.4, 0.6, 0.26);
    clusterSurface(cluster, 'sheeting', 0, -BAY_HALF_L - 0.24, 0.6 + (BACK_EAVE_Y - 0.75) / 2,
      2 * BAY_HALF_W + 0.36, BACK_EAVE_Y - 0.75, 0.05);
    for (const y of [1.9, 3.6]) {
      clusterBox(cluster, 0, -BAY_HALF_L - 0.17, y, 2 * BAY_HALF_W, 0.14, 0.08, steel, 'structure');
    }
    if (cladLateralSign !== 0) {
      const far = cladLateralSign * (BAY_HALF_W + 0.22);
      clusterSurface(cluster, 'render', far - cladLateralSign * 0.02, -BAY_HALF_L / 2, 0.3, 0.26, 0.6, BAY_HALF_L + 0.2);
      clusterSurface(cluster, 'sheeting', far, -BAY_HALF_L / 2, 0.6 + (bayRoofY(-BAY_HALF_L / 2) - 0.85) / 2,
        0.05, bayRoofY(-BAY_HALF_L / 2) - 0.85, BAY_HALF_L + 0.2);
      clusterBox(cluster, far - cladLateralSign * 0.05, -BAY_HALF_L / 2, 2.6, 0.08, 0.14, BAY_HALF_L + 0.2, steel, 'structure');
    }
  };

  const addPurposeBuiltServiceBay = (
    pose: GarageWorkshopBayPose,
    mirror: -1 | 1,
    withCrane = true,
    withDeck = true,
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

    addPurposeBuiltServiceBayFrame(cluster, withDeck ? -mirror : 0, mirror);

    // Bridge crane: runway beams on brackets inside the rafters, the bridge spanning them, a trolley with its hook
    // block, a spreader beam and two slings over the bay centre. The Burlak's own turret gantry does its lift, so its
    // shelter carries none.
    const runwayY = BACK_EAVE_Y - 0.55;
    if (withCrane) for (const lateral of [-4.3, 4.3]) {
      clusterBox(cluster, lateral, 0, runwayY, 0.24, 0.3, 2 * BAY_HALF_L - 0.2, safety, 'painted');
      for (const longitudinal of [-BAY_HALF_L + 0.25, BAY_HALF_L - 0.25]) {
        clusterBox(cluster, lateral + Math.sign(lateral) * 0.18, longitudinal, runwayY + 0.1, 0.34, 0.12, 0.3, steel, 'structure');
      }
    }
    if (withCrane) {
      clusterBox(cluster, 0, mirror * 0.55, runwayY - 0.12, 8.85, 0.34, 0.42, safety, 'painted');
      clusterBox(cluster, mirror * 0.8, mirror * 0.55, runwayY - 0.42, 0.72, 0.4, 0.68, dark, 'equipment');
      clusterCylinder(cluster, mirror * 0.8, mirror * 0.55, runwayY - 1.4, 0.04, 1.6, steel, 0, 8);
      clusterBox(cluster, mirror * 0.8, mirror * 0.55, runwayY - 2.28, 0.42, 0.24, 0.2, steel, 'equipment', 0.48);
      clusterBox(cluster, mirror * 0.8, mirror * 0.55, runwayY - 2.5, 2.8, 0.16, 0.2, safety, 'painted');
      for (const lateralOffset of [-1.22, 1.22]) {
        clusterBeam(cluster,
          [mirror * 0.8, mirror * 0.55, runwayY - 2.5],
          [mirror * 0.8 + lateralOffset, mirror * 0.55, runwayY - 3.2],
          0.05, steel, 'equipment');
      }
      structuralConnections += 6;
    }

    // Column-supported inspection deck on the open side, its rails and a steel ladder to it, all inside the frame. The
    // T-90M bay works its turret on the ground, so it has none (wave 398: the deck stood against the turret). It stands
    // 0.9 m clear of the Burlak's own turret gantry, whose legs read through it from the yard (wave 408: "braces that
    // pass through the deck without meeting any joint").
    const deckSide = -mirror * 4.0;
    if (withDeck) {
    clusterBox(cluster, deckSide, 1.55, 3.36, 1.35, 0.18, 3.2, steel, 'structure');
    for (const longitudinal of [0.25, 2.85]) {
      clusterBox(cluster, deckSide, longitudinal, 1.72, 0.16, 3.36, 0.16, steel, 'structure');
      clusterBox(cluster, deckSide, longitudinal, 4.02, 0.08, 1.18, 0.08, safety, 'painted');
    }
    for (const y of [3.85, 4.5]) {
      clusterBox(cluster, deckSide, 1.55, y, 0.08, 0.07, 3.28, safety, 'painted');
    }
    for (const rail of [-0.3, 0.3]) {
      clusterBox(cluster, deckSide - mirror * 0.72 + rail, 0.3, 1.8, 0.07, 3.6, 0.07, steel, 'structure');
    }
    for (let rung = 0; rung < 8; rung += 1) {
      clusterBox(cluster, deckSide - mirror * 0.72, 0.3, 0.38 + rung * 0.4, 0.62, 0.05, 0.06, steel, 'structure');
    }
    structuralConnections += 18;
    }

    // The tool wall hangs on the clad back wall: two rails per bay carry graded spanners, hammers, a pry bar and a coil
    // of air line; a timber bench and a red tool cabinet stand below it.
    const wall = -BAY_HALF_L - 0.12;
    const toolSteel = new THREE.Color(0x5a5e60);
    for (const lateral of [-3.05, 0, 3.05]) {
      clusterSurface(cluster, 'timber', lateral, wall + 0.02, 1.55, 2.5, 1.3, 0.04);
      for (const railY of [1.15, 1.98]) {
        clusterBox(cluster, lateral, wall + 0.06, railY, 2.38, 0.05, 0.06, steel, 'structure');
      }
      for (let spanner = 0; spanner < 7; spanner += 1) {
        clusterBox(cluster, lateral - 0.9 + spanner * 0.16, wall + 0.09, 1.92,
          0.035, 0.18 + spanner * 0.035, 0.03, toolSteel, 'equipment');
      }
      for (const offset of [-0.55, -0.32]) {
        clusterBox(cluster, lateral + offset, wall + 0.09, 1.18, 0.05, 0.42, 0.04, toolSteel, 'equipment');
        clusterBox(cluster, lateral + offset, wall + 0.09, 1.4, 0.16, 0.06, 0.06, dark, 'equipment');
      }
      clusterBox(cluster, lateral + 0.15, wall + 0.09, 1.12, 0.05, 0.9, 0.04, accent, 'painted');
      clusterCylinder(cluster, lateral + 0.7, wall + 0.12, 1.05, 0.2, 0.05, safety, Math.PI / 2, 12);
    }
    clusterBox(cluster, mirror * 2.25, -3.0, 0.82, 3.2, 0.1, 0.95, timber, 'equipment');
    for (const lateral of [mirror * 0.85, mirror * 3.65]) {
      clusterBox(cluster, lateral, -3.0, 0.4, 0.12, 0.8, 0.8, steel, 'structure');
    }
    clusterBox(cluster, -mirror * 3.3, -3.05, 0.92, 1.18, 1.72, 0.88, primer, 'painted');
    for (const y of [0.48, 0.82, 1.16]) {
      clusterBox(cluster, -mirror * 3.3, -2.59, y, 0.92, 0.04, 0.03, dark, 'equipment');
    }
    // the power run along the back wall: a cable tray, a junction cabinet on the wall, two drops to work lamps
    clusterBox(cluster, 0, wall + 0.12, 4.62, 8.8, 0.08, 0.2, dark, 'equipment');
    clusterBox(cluster, mirror * 3.85, wall + 0.2, 3.3, 0.72, 1.0, 0.28, new THREE.Color(0x56605a), 'painted');
    for (const lateral of [-2.15, 2.15]) {
      clusterBox(cluster, lateral, -1.0, runwayY + 0.25, 0.05, 0.05, 2 * BAY_HALF_L - 1.2, dark, 'equipment');
      clusterCylinder(cluster, lateral, -0.2, runwayY + 0.1, 0.24, 0.16, accent, 0, 10);
    }
    structuralConnections += 18;
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
    // the stack stands on dark pallets that spread its weight and show where it meets the ground (2026-10-10, wave 377:
    // "crates float on snow")
    for (let column = 0; column < 4; column += 1) {
      box(side + column * 1.05 - 1.5, depth, 0.07, 1.04, 0.14, 1.0, dark, GARAGE_FACILITY_AXIS_YAW_RAD, 0, 0, 'equipment');
    }
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < 4 - row; column += 1) {
        const width = 0.88 + ((row + column) % 2) * 0.22;
        box(side + column * 1.05 - 1.5, depth + row * 0.18,
          0.53 + row * 0.82, width, 0.78, 0.82, timber);
        box(side + column * 1.05 - 1.5, depth + row * 0.18,
          0.53 + row * 0.82, 0.08, 0.82, 0.86, steel);
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
    // Closed extraction wall is behind the workpiece; the positive side stays
    // open toward the Garage camera so the booth reads as an interior process,
    // never as a bare painted wall.
    clusterBox(cluster, lateral, longitudinal - 2.25, 2.48,
      width, 4.75, 0.18, boothTint, 'painted');
    clusterBox(cluster, lateral, longitudinal, 5.05,
      width + 0.6, 0.28, 5.0, dark, 'painted');
    clusterBox(cluster, lateral, longitudinal + 2.08, 4.55,
      width, 0.18, 0.18, safety, 'painted');
    for (const sideOffset of [-2.55, 0, 2.55]) {
      clusterCylinder(cluster, lateral + sideOffset, longitudinal - 1.95, 5.85,
        0.30, 1.60, steel, 0, 12);
      clusterCylinder(cluster, lateral + sideOffset, longitudinal - 1.95, 6.68,
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
    clusterBox(cluster, 0, -5.4, 0.58, 25.5, 1.16, 0.9, masonryDark, 'masonry');
    clusterBox(cluster, 0, -5.4, 7.22, 25.5, 1.56, 0.9, masonryDark, 'masonry');
    clusterBox(cluster, 0, 1.0, 7.75, 26.2, 0.45, 9.4, dark, 'painted');
    clusterBox(cluster, 0, 3.7, 0.32, 26.4, 0.60, 1.1, platform, 'masonry');
    for (let bay = -2; bay <= 2; bay += 1) {
      const side = bay * 4.7;
      // Rear facade: separated masonry bays with a recessed service door,
      // clerestory window and steel mullions instead of one featureless wall.
      clusterBox(cluster, side, -5.4, 3.88,
        4.22, 5.48, 0.74, masonry, 'masonry');
      clusterBox(cluster, side, -4.99, 2.16,
        2.72, 3.58, 0.08, dark, 'painted');
      clusterBox(cluster, side, -4.94, 5.52,
        3.22, 1.12, 0.06, bay % 2 ? accent : steel, 'painted');
      clusterBox(cluster, side, -4.88, 5.52,
        0.10, 1.08, 0.08, dark, 'structure');
      clusterBox(cluster, side, -4.88, 5.52,
        3.18, 0.10, 0.08, dark, 'structure');
      clusterBox(cluster, side, 3.4, 3.85,
        0.38, 7.7, 0.56, steel, 'structure');
      clusterBox(cluster, side, 1.0, 7.42,
        0.36, 0.28, 9.2, steel, 'structure');
      if (bay < 2) {
        const center = centerSide + side + 2.35;
        const localCenter = center - centerSide;
        clusterBox(cluster, localCenter, -5.9, 6.52,
          4.05, 0.28, 0.18, safety, 'painted');
        clusterBox(cluster, localCenter, -5.98, 3.25,
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
    // The roof is one run of trapezoidal sheeting over the purlins, falling gently to a gutter at the back (the redesign,
    // 2026-10-11: the old flat colour strips read as boards); the back wall is clad to the eaves above a concrete upstand.
    const hallPitch = 0.07;
    clusterSurface(cluster, 'roofing', 0, 0, 5.58, width + 0.7, 0.05, 9.4, { rotationX: -hallPitch });
    clusterBox(cluster, 0, 4.72, 5.9, width + 0.7, 0.24, 0.05, roofColor, 'painted');
    clusterBox(cluster, 0, -4.72, 5.28, width + 0.7, 0.16, 0.18, dark, 'painted');
    clusterBox(cluster, width / 2 - 0.20, 0, 5.22,
      0.22, 0.22, 8.7, steel, 'structure');
    clusterBox(cluster, width / 2 - 0.20, -4.75, 2.62,
      0.12, 5.2, 0.12, dark, 'painted');
    clusterSurface(cluster, 'render', 0, -4.22, 0.3, width - 0.4, 0.6, 0.26);
    clusterSurface(cluster, 'sheeting', 0, -4.26, 0.6 + 2.25, width - 0.5, 4.5, 0.05);
    for (const lateral of [-width * 0.30, -width * 0.10, width * 0.10, width * 0.30]) {
      clusterBox(cluster, lateral, -4.18, 1.16,
        0.08, 1.72, 0.06, lateral === width * 0.10 ? accent : steel, 'painted');
    }
    clusterBox(cluster, 0, -3.55, 0.76,
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
      width - 1.1, 0.34, 0.44, safety, 'painted');
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
      4.6, 0.34, 0.48, safety, 'painted');
    clusterBox(cluster, -1.2, 0, height - 0.72,
      0.82, 0.55, 0.78, dark, 'equipment');
    // the crane takes a real load (2026-10-10, wave 377: "two goalpost-like gantries behind the tank lift nothing"): a
    // hook block on twin falls carries a spreader and four chains down to a pulled tank power pack hanging clear of
    // the deck
    for (const offset of [-0.18, 0.18]) {
      clusterCylinder(cluster, -1.2 + offset, 0, height - 2.2, 0.045, 2.6, steel, 0, 8);
    }
    clusterBox(cluster, -1.2, 0, height - 3.6, 0.62, 0.42, 0.42, dark, 'equipment');
    clusterBox(cluster, -1.2, 0, height - 4.05, 2.4, 0.16, 0.22, safety, 'painted');
    for (const [lateral, longitudinal] of [[-1.05, -0.4], [-1.05, 0.4], [1.05, -0.4], [1.05, 0.4]] as const) {
      clusterBeam(cluster, [-1.2 + lateral, 0, height - 4.12], [-1.2 + lateral * 0.82, longitudinal, height - 5.0],
        0.03, steel, 'equipment');
    }
    clusterBox(cluster, -1.2, 0, height - 5.45, 1.9, 0.9, 1.0, new THREE.Color(0x4b5040), 'painted');
    clusterBox(cluster, -0.45, 0, height - 5.4, 0.62, 0.8, 1.06, dark, 'equipment');
    for (const offset of [-0.32, 0.32]) {
      clusterCylinder(cluster, -1.55, offset, height - 4.95, 0.22, 0.12, steel, 0, 12);
    }
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
  addPurposeBuiltServiceBay(burlakBay, 1, false);
  addPurposeBuiltServiceBay(t90Bay, -1, true, false);
  addFloodTower(layout.floods[0][0], layout.floods[0][1], 7.6);
  addFloodTower(layout.floods[1][0], layout.floods[1][1], 7.6);
  // Kit for the place (2026-10-11, waves 398 and 402: "one stock kit everywhere: the same crate, tool chest, wheel rack
  // and blank panels, recoloured per yard"): each Garage furnishes its four yard stations and the two shelter flanks
  // with what its own army keeps there.
  const sand = new THREE.Color(0xb59c72), olive = new THREE.Color(0x4f5638), snowCap = new THREE.Color(0xe8edf0);
  const kitBuilders = {
    // a jerrycan rack: a welded frame holding two rows of cans, the spout ends out, a locking bar chained across
    jerrycans: (c: FacilityCluster): void => {
      for (const x of [-1.25, 1.25]) clusterBox(c, x, 0, 0.62, 0.06, 1.24, 0.56, steel, 'structure');
      clusterBox(c, 0, 0.32, 0.9, 2.56, 0.05, 0.05, dark, 'equipment');
      secureStorageSystems += 1;
      for (const y of [0.1, 0.66]) clusterBox(c, 0, 0, y, 2.6, 0.05, 0.56, steel, 'structure');
      for (let row = 0; row < 2; row += 1) for (let k = 0; k < 7; k += 1) {
        const tint = (k + row) % 3 === 0 ? sand : olive;
        clusterBox(c, -1.05 + k * 0.35, 0, 0.36 + row * 0.56, 0.17, 0.46, 0.34, tint, 'painted');
        clusterBox(c, -1.05 + k * 0.35, 0.08, 0.62 + row * 0.56, 0.12, 0.05, 0.06, dark, 'equipment');
      }
      looseParts += 14;
    },
    // a sandbag wall in staggered courses round a fuel point
    sandbags: (c: FacilityCluster): void => {
      for (let course = 0; course < 4; course += 1) for (let k = 0; k < 7; k += 1) {
        clusterBox(c, -1.95 + k * 0.62 + (course % 2) * 0.31, 0, 0.09 + course * 0.17, 0.6, 0.17, 0.34,
          course % 2 ? sand.clone().multiplyScalar(0.94) : sand, 'masonry');
      }
      looseParts += 28;
    },
    // a water bowser on its trailer: chassis, drawbar, two wheels each side, the tank and its manway
    bowser: (c: FacilityCluster): void => {
      clusterBox(c, 0, 0, 0.62, 3.0, 0.14, 1.3, dark, 'structure');
      clusterBox(c, 1.9, 0, 0.55, 1.2, 0.08, 0.08, dark, 'structure');
      for (const x of [-0.9, 0.3]) for (const z of [-0.72, 0.72]) clusterCylinder(c, x, z, 0.42, 0.42, 0.26, rubber, Math.PI / 2, 16);
      clusterCylinder(c, -0.2, 0, 1.36, 0.66, 2.8, sand, 0, 16, Math.PI / 2);
      clusterCylinder(c, -0.2, 0, 2.05, 0.24, 0.14, dark, 0, 16);
      operationalMachines += 1;
    },
    // a diesel space heater on its skid with the warm-air duct running to the shelter
    heater: (c: FacilityCluster): void => {
      clusterBox(c, 0, 0, 0.08, 1.6, 0.16, 0.9, dark, 'structure');
      clusterBox(c, 0, 0, 0.66, 1.4, 0.96, 0.76, olive, 'painted');
      clusterCylinder(c, -0.45, 0, 1.4, 0.07, 0.6, steel, 0, 10);
      for (let k = 0; k < 6; k += 1) clusterCylinder(c, 0.95 + k * 0.42, 0, 0.6 - k * 0.07, 0.17, 0.42, dark, 0, 10, Math.PI / 2);
      operationalMachines += 1;
    },
    // split logs stacked between posts, a tarp over the top
    woodpile: (c: FacilityCluster): void => {
      for (const x of [-1.5, 1.5]) clusterBox(c, x, 0, 0.7, 0.1, 1.4, 0.1, timber, 'equipment');
      for (let row = 0; row < 6; row += 1) for (let k = 0; k < 9; k += 1) {
        clusterCylinder(c, -1.3 + k * 0.32 + (row % 2) * 0.16, 0, 0.13 + row * 0.22, 0.12, 0.9, timber.clone().multiplyScalar(0.9 + (k % 3) * 0.06), Math.PI / 2, 10);
      }
      clusterBox(c, 0, 0, 1.45, 3.3, 0.04, 1.1, olive, 'painted');
      looseParts += 54;
    },
    // oil drums on a pallet; in the snow Garages each wears a cap of snow
    drums: (c: FacilityCluster): void => {
      clusterBox(c, 0, 0, 0.07, 2.4, 0.14, 1.6, timber, 'equipment');
      for (let k = 0; k < 6; k += 1) {
        const x = -0.78 + (k % 3) * 0.78, z = k < 3 ? -0.38 : 0.38;
        const tint = k % 3 === 0 ? olive : k % 3 === 1 ? dark : new THREE.Color(0x6a3a2a);
        clusterCylinder(c, x, z, 0.6, 0.3, 0.88, tint, 0, 16);
        clusterCylinder(c, x, z, 0.44, 0.31, 0.03, steel, 0, 16);
        clusterCylinder(c, x, z, 0.78, 0.31, 0.03, steel, 0, 16);
        if (snowy) clusterCylinder(c, x, z, 1.06, 0.29, 0.06, snowCap, 0, 16);
      }
      looseParts += 6;
    },
    // a steel pallet cage of gas bottles, chained in, caps on
    gasCage: (c: FacilityCluster): void => {
      for (const x of [-0.95, 0.95]) for (const z of [-0.5, 0.5]) clusterBox(c, x, z, 0.85, 0.06, 1.7, 0.06, steel, 'structure');
      for (const y of [0.08, 0.9, 1.68]) {
        for (const z of [-0.5, 0.5]) clusterBox(c, 0, z, y, 1.96, 0.05, 0.05, steel, 'structure');
        for (const x of [-0.95, 0.95]) clusterBox(c, x, 0, y, 0.05, 0.05, 1.04, steel, 'structure');
      }
      for (let k = 0; k < 8; k += 1) {
        const x = -0.66 + (k % 4) * 0.44, z = k < 4 ? -0.2 : 0.2;
        const tint = k % 2 ? new THREE.Color(0x2d4f3e) : new THREE.Color(0x8a8c88);
        clusterCylinder(c, x, z, 0.72, 0.12, 1.3, tint, 0, 10);
        clusterCylinder(c, x, z, 1.42, 0.06, 0.12, steel, 0, 10);
      }
      secureStorageSystems += 1;
      looseParts += 8;
    },
    // pallets of boxed spares stacked two high, strapped
    pallets: (c: FacilityCluster): void => {
      for (const [x, z, high] of [[-0.7, 0, 2], [0.7, 0, 1], [0, 1.15, 1]] as const) {
        for (let level = 0; level < high; level += 1) {
          clusterBox(c, x, z, 0.07 + level * 0.92, 1.2, 0.14, 1.0, timber, 'equipment');
          clusterBox(c, x, z, 0.5 + level * 0.92, 1.1, 0.72, 0.92, level % 2 ? olive : sand.clone().multiplyScalar(0.8), 'painted');
          clusterBox(c, x, z, 0.5 + level * 0.92, 0.04, 0.74, 0.94, dark, 'equipment');
        }
      }
      looseParts += 8;
    },
    // rope coils and a chain heap on the quay, a life ring on its post
    ropes: (c: FacilityCluster): void => {
      for (const [x, z] of [[-0.8, 0], [0.4, 0.3]] as const) {
        for (let turn = 0; turn < 4; turn += 1) clusterCylinder(c, x, z, 0.05 + turn * 0.09, 0.42 - turn * 0.02, 0.08, new THREE.Color(0x8c7a52), 0, 16);
      }
      for (let k = 0; k < 6; k += 1) clusterCylinder(c, 1.3 + (k % 3) * 0.12, -0.3 + Math.floor(k / 3) * 0.2, 0.06 + (k % 2) * 0.08, 0.22, 0.12, dark, 0, 10);
      clusterBox(c, -1.7, 0.6, 0.75, 0.1, 1.5, 0.1, steel, 'structure');
      clusterCylinder(c, -1.7, 0.66, 1.15, 0.32, 0.1, new THREE.Color(0xd2522e), Math.PI / 2, 16);
      looseParts += 9;
    },
    // a rail trolley on a short spur with sleepers stacked beside it
    trolley: (c: FacilityCluster): void => {
      for (let k = 0; k < 6; k += 1) clusterBox(c, -1.5 + k * 0.6, 0, 0.06, 0.22, 0.12, 1.9, timber, 'equipment');
      for (const z of [-0.72, 0.72]) clusterBox(c, 0, z, 0.18, 3.6, 0.12, 0.08, steel, 'structure');
      clusterBox(c, 0, 0, 0.5, 1.6, 0.1, 1.5, dark, 'structure');
      for (const x of [-0.55, 0.55]) for (const z of [-0.72, 0.72]) clusterCylinder(c, x, z, 0.3, 0.16, 0.08, steel, Math.PI / 2, 16);
      for (let level = 0; level < 4; level += 1) for (let k = 0; k < 4; k += 1) {
        clusterBox(c, 2.6, -0.75 + k * 0.5, 0.08 + level * 0.16, level % 2 ? 2.2 : 0.24, 0.15, level % 2 ? 0.24 : 2.2, timber, 'equipment');
      }
      railSegments += 1;
    },
    // a tarp-covered pallet stack lashed down against the rain, duckboards across the mud to it
    tarped: (c: FacilityCluster): void => {
      clusterBox(c, 0, 0, 0.07, 2.4, 0.14, 1.6, timber, 'equipment');
      clusterBox(c, 0, 0, 0.75, 2.3, 1.2, 1.5, new THREE.Color(0x3c5a44), 'painted');
      for (const x of [-0.8, 0, 0.8]) clusterBox(c, x, 0, 0.75, 0.03, 1.24, 1.54, dark, 'equipment');
      for (let k = 0; k < 6; k += 1) clusterBox(c, -1.6 + k * 0.62, 1.5, 0.04, 0.5, 0.06, 1.4, timber, 'equipment');
      looseParts += 2;
    },
    // a portable pump on its skid, suction and discharge hoses laid out
    pump: (c: FacilityCluster): void => {
      clusterBox(c, 0, 0, 0.08, 1.4, 0.16, 0.8, dark, 'structure');
      clusterBox(c, -0.25, 0, 0.5, 0.7, 0.62, 0.6, new THREE.Color(0xa2482a), 'painted');
      clusterCylinder(c, 0.38, 0, 0.42, 0.2, 0.44, steel, 0, 16, Math.PI / 2);
      for (let k = 0; k < 7; k += 1) clusterCylinder(c, 0.9 + k * 0.4, 0.15 * Math.sin(k), 0.06, 0.06, 0.42, dark, 0, 10, Math.PI / 2);
      operationalMachines += 1;
    },
    // a winch drum on its frame and recovery chains coiled beside it
    winchDrum: (c: FacilityCluster): void => {
      for (const x of [-0.7, 0.7]) clusterBox(c, x, 0, 0.55, 0.14, 1.1, 0.8, steel, 'structure');
      clusterCylinder(c, 0, 0, 0.75, 0.42, 1.3, dark, 0, 16, Math.PI / 2);
      clusterCylinder(c, 0, 0, 0.75, 0.5, 0.06, steel, 0, 16, Math.PI / 2);
      for (let k = 0; k < 5; k += 1) clusterCylinder(c, 1.6, 0.2, 0.05 + k * 0.08, 0.36 - k * 0.03, 0.08, dark, 0, 16);
      heavyLiftSystems += 1;
    },
    // spare track sections stacked on bearers, grousers up
    trackStack: (c: FacilityCluster): void => {
      for (const x of [-1.2, 1.2]) clusterBox(c, x, 0, 0.08, 0.2, 0.16, 1.4, timber, 'equipment');
      for (let level = 0; level < 4; level += 1) {
        clusterBox(c, 0, 0, 0.22 + level * 0.12, 3.0, 0.1, 0.62, dark, 'equipment');
        for (let k = 0; k < 10; k += 1) clusterBox(c, -1.35 + k * 0.3, 0, 0.29 + level * 0.12, 0.06, 0.04, 0.62, steel, 'equipment');
      }
      looseParts += 4;
    },
    // steel billets in a crib, rust on the ends
    billets: (c: FacilityCluster): void => {
      for (let level = 0; level < 4; level += 1) for (let k = 0; k < 6; k += 1) {
        clusterBox(c, level % 2 ? -1.0 + k * 0.4 : 0, level % 2 ? 0 : -1.0 + k * 0.4, 0.12 + level * 0.24,
          level % 2 ? 0.22 : 2.4, 0.22, level % 2 ? 2.4 : 0.22, k % 2 ? new THREE.Color(0x6b4434) : dark, 'equipment');
      }
      looseParts += 24;
    },
    // a slag pot on its stand, crusted
    slagPot: (c: FacilityCluster): void => {
      for (const x of [-0.9, 0.9]) clusterBox(c, x, 0, 0.45, 0.2, 0.9, 1.4, steel, 'structure');
      clusterCylinder(c, 0, 0, 1.2, 0.95, 1.1, new THREE.Color(0x3e3533), 0, 16);
      clusterCylinder(c, 0, 0, 1.78, 0.98, 0.08, new THREE.Color(0x6b5a50), 0, 16);
      for (const x of [-1.02, 1.02]) clusterCylinder(c, x, 0, 1.3, 0.12, 0.2, steel, 0, 10, Math.PI / 2);
      operationalMachines += 1;
    },
    // probe and shovel racks against avalanches, a sled beside them
    avalancheKit: (c: FacilityCluster): void => {
      for (const x of [-1.0, 1.0]) clusterBox(c, x, 0, 0.8, 0.08, 1.6, 0.08, steel, 'structure');
      clusterBox(c, 0, 0, 1.5, 2.1, 0.06, 0.08, steel, 'structure');
      for (let k = 0; k < 9; k += 1) clusterBox(c, -0.85 + k * 0.21, 0.06, 0.85, 0.03, 1.5, 0.03, k % 3 ? steel : new THREE.Color(0xd2522e), 'equipment');
      clusterBox(c, 0, 0.9, 0.12, 2.0, 0.1, 0.7, new THREE.Color(0xd2522e), 'painted');
      for (const z of [0.6, 1.2]) clusterBox(c, 0, z, 0.04, 2.2, 0.06, 0.05, steel, 'structure');
      looseParts += 10;
    },
  } as const;
  type KitName = keyof typeof kitBuilders;
  const snowy = variant.architecture === 'repair_bunker' || variant.architecture === 'rock_cavern';
  // the four yard stations (two logistics, two parts) and the flanks of the Burlak and T-90M shelters
  const REGIONAL_KIT: Readonly<Partial<Record<GarageVariant['architecture'], readonly KitName[]>>> = Object.freeze({
    shade_depot: ['jerrycans', 'bowser', 'sandbags', 'pallets', 'drums', 'jerrycans'],
    repair_bunker: ['woodpile', 'heater', 'drums', 'gasCage', 'heater', 'woodpile'],
    brick_arsenal: ['gasCage', 'pallets', 'billets', 'gasCage', 'pallets', 'drums'],
    naval_drydock: ['ropes', 'pallets', 'drums', 'ropes', 'gasCage', 'pallets'],
    rail_roundhouse: ['trolley', 'drums', 'trackStack', 'pallets', 'gasCage', 'drums'],
    rain_canopy: ['tarped', 'pump', 'sandbags', 'gasCage', 'pump', 'drums'],
    rock_cavern: ['avalancheKit', 'heater', 'drums', 'gasCage', 'heater', 'avalancheKit'],
    recovery_yard: ['trackStack', 'winchDrum', 'drums', 'pallets', 'winchDrum', 'jerrycans'],
    factory_line: ['billets', 'gasCage', 'slagPot', 'billets', 'gasCage', 'drums'],
  });
  const kit = REGIONAL_KIT[variant.architecture] ?? ['pallets', 'drums', 'pallets', 'drums', 'pallets', 'drums'];
  const burlakView = garageWorldPointToView(burlakBay.x, burlakBay.z);
  const t90View = garageWorldPointToView(t90Bay.x, t90Bay.z);
  const stations: ReadonlyArray<readonly [number, number]> = [
    leftLogistics, rightLogistics, leftParts, rightParts,
    [burlakView.side - 5.8, burlakView.depth + 1.2], [t90View.side + 5.8, t90View.depth + 1.2],
  ];
  const KIT_PURPOSE: Readonly<Record<KitName, string>> = Object.freeze({
    jerrycans: 'fuel-and-water-point', sandbags: 'blast-protection', bowser: 'water-supply', heater: 'cold-start-heating',
    woodpile: 'stove-fuel-store', drums: 'lubricant-store', gasCage: 'compressed-gas-store', pallets: 'spares-staging',
    ropes: 'mooring-and-rigging', trolley: 'rail-transfer', tarped: 'weatherproof-stores', pump: 'drainage-pumping',
    winchDrum: 'recovery-winching', trackStack: 'track-spares', billets: 'plate-and-billet-stock', slagPot: 'slag-handling',
    avalancheKit: 'avalanche-rescue',
  });
  stations.forEach(([side, depth], index) => {
    kitBuilders[kit[index]](fixedCluster(side, depth));
    servicePurposeTags.add(KIT_PURPOSE[kit[index]]);
  });
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
      clusterBox(featureCluster, 0, -3.25, 1.15,
        22, 2.25, 0.34, new THREE.Color(0x6b5850), 'masonry');
      clusterBox(featureCluster, 0, -3.02, 2.36,
        22.8, 0.18, 0.70, new THREE.Color(0x4c5358), 'painted');
      for (let index = -4; index <= 4; index += 1) {
        clusterBox(featureCluster, index * 2.4, 0.4, 0.56,
          1.9, 1.12, 0.7,
          index % 2 ? new THREE.Color(0x8a7e68) : new THREE.Color(0x756e5e),
          'equipment');
        clusterBox(featureCluster, index * 2.4, -3.00, 1.22,
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
        clusterBox(featureCluster, offset, -3.0, 3.4,
          5.0, 6.8, 3.0, cavernRock, 'masonry');
        clusterBox(featureCluster, offset, 0.7, 3.3,
          1.1, 6.6, 1.0, steel, 'structure');
      }
      clusterBox(featureCluster, 0, -3.0, 6.30,
        10.2, 1.00, 3.0, cavernRock, 'masonry');
      clusterBox(featureCluster, 0, -5.10, 2.75,
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
        clusterBox(featureCluster, index * 3.0, -6,
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
  const meshes: THREE.Mesh[] = [];
  const materials: THREE.Material[] = [];
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
    // Shelter roofs, frames and painted kit cast the sun's shadow (2026-10-10: light no longer leaks under a roof);
    // machinery and masonry footings only receive.
    mesh.castShadow = name.includes('_structure_') || name.includes('_painted_');
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
      map: renderClass.name === 'equipment' ? null : surface?.color ?? null,
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
  // the building surfaces: one merged mesh each, tinted by the pack's shelter finish, casting the sun's shadow
  const surfaceLook: Readonly<Record<FacilitySurface, Readonly<{
    maps: SurfaceMaps | undefined; color: THREE.Color; roughness: number; metalness: number; normalScale: number;
  }>>> = Object.freeze({
    sheeting: { maps: surfaces?.sheeting, color: steel.clone().lerp(new THREE.Color(0xffffff), 0.18), roughness: 0.62, metalness: 0.42, normalScale: 0.9 },
    roofing: { maps: surfaces?.sheeting, color: roofing.clone(), roughness: 0.66, metalness: 0.38, normalScale: 0.9 },
    brick: { maps: surfaces?.brick, color: new THREE.Color(0xd8cfc6), roughness: 0.95, metalness: 0.0, normalScale: 0.7 },
    render: { maps: surfaces?.render, color: new THREE.Color(0xc9c4ba), roughness: 0.96, metalness: 0.0, normalScale: 0.55 },
    timber: { maps: surfaces?.timber, color: new THREE.Color(0xc2ab8c), roughness: 0.9, metalness: 0.0, normalScale: 0.6 },
    glazing: { maps: undefined, color: new THREE.Color(0x2a3338), roughness: 0.12, metalness: 0.55, normalScale: 0 },
  });
  // Contact shadows (2026-10-11, wave 394: "add contact shadow under every figure and prop"): every box that stands on
  // the ground with a footprint of a crate or larger gets a soft dark blot a little wider than itself, on one draw.
  {
    const texture = garageContactShadowTexture();
    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    const euler = new THREE.Euler();
    const blots: THREE.Matrix4[] = [];
    for (const instance of boxInstances) {
      instance.matrix.decompose(position, quaternion, scale);
      euler.setFromQuaternion(quaternion, 'YXZ');
      if (Math.abs(euler.x) > 0.2 || Math.abs(euler.z) > 0.2) continue; // braces and leaning parts cast their own
      const ground = groundAtWorld(position.x, position.z);
      const bottom = position.y - scale.y / 2;
      const area = scale.x * scale.z;
      if (Math.abs(bottom - ground) > 0.14 || area < 0.06 || area > 40 || scale.y < 0.12) continue;
      blots.push(new THREE.Matrix4().compose(
        new THREE.Vector3(position.x, ground + 0.03, position.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, euler.y, 'YXZ')),
        new THREE.Vector3(scale.x * 1.3 + 0.35, scale.z * 1.3 + 0.35, 1),
      ));
    }
    if (texture && blots.length) {
      // one merged, non-instanced decal mesh on the stock map + transparent program the bays' grime decals already use,
      // so it adds no shader program
      const material = new THREE.MeshBasicMaterial({
        map: texture, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      material.name = 'garage-facility:contact-shadow';
      materials.push(material);
      const quads = blots.map((matrix) => new THREE.PlaneGeometry(1, 1).applyMatrix4(matrix));
      const merged = mergeGeometries(quads, false);
      for (const quad of quads) quad.dispose();
      const mesh = new THREE.Mesh(merged ?? new THREE.PlaneGeometry(0, 0), material);
      mesh.name = 'garage_facility_contact_shadows';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = 1;
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      meshes.push(mesh);
    }
  }
  for (const [surface, geometries] of surfaceGeometries) {
    if (!geometries.length) continue;
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (!merged) continue;
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    const look = surfaceLook[surface];
    const material = new THREE.MeshStandardMaterial({
      color: look.color,
      roughness: look.roughness,
      metalness: look.metalness,
      map: look.maps?.color ?? null,
      normalMap: look.maps?.normal ?? null,
      normalScale: new THREE.Vector2(look.normalScale, look.normalScale),
    });
    material.name = `garage-facility-surface:${surface}`;
    engineCtx.setupShadowMaterial?.(material);
    materials.push(material);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `garage_facility_surface_${surface}`;
    mesh.castShadow = surface !== 'glazing';
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    meshes.push(mesh);
  }
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
      ...surfaceGeometries.keys(),
    ]).size,
    openingSightlineIntrusions,
    meshes: Object.freeze(meshes),
    materials: Object.freeze(materials),
  });
}
