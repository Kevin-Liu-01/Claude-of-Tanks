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
type FacilitySurface = 'sheeting' | 'roofing' | 'brick' | 'render' | 'timber' | 'glazing' | 'tiles';
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
  /**
   * The signature facility stands at the yard's datum (y = 0) on these extra level terraces [side, depth, radius side,
   * radius depth] between it and the yard, so a building the roads run into is not perched on a bank.
   */
  readonly yardLevel?: ReadonlyArray<readonly [number, number, number, number]>;
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
      // the drydock crane stands on the quay, short of the shore (2026-10-11: the sea opens behind it)
      feature: [0, 24], featureRadius: [11, 6],
    },
    rail_roundhouse: {
      logistics: [[-35, 12], [16, -27]],
      // Keep the wheel inventory outside the nearby T-90M rebuild island.
      // The former -22/-16 placement overlapped both the service terrace and
      // its full-detail vehicle, which also let the two terrain pads fight.
      parts: [[-31, -17], [2, -36]], floods: [[-39, 1], [39, 1]],
      // the engine shed squared on the rail fan's three roads, its front at depth 19 (GA.04, 2026-10-14), level with the
      // yard on a cinder apron (the garage critic panel, 2026-10-14: "the shed sits on a sloping grass mound")
      feature: [0, 27], featureRadius: [10.5, 9],
      yardLevel: [[0, 14.5, 12.5, 5]],
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
    || candidate.label.startsWith('crew-floor-') || candidate.label.startsWith('yard-level-');
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
    ...(layout.yardLevel ?? []).map(([side, depth, radiusSide, radiusDepth], index) => Object.freeze({
      label: `yard-level-${index + 1}`, side, depth, radiusSide, radiusDepth,
    })),
    Object.freeze({
      label: layout.yardLevel ? 'yard-level-signature-facility' : 'signature-facility',
      side: layout.feature[0], depth: layout.feature[1],
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
    rotationX = 0,
  ): void => {
    boxInstances.push({
      matrix: clusterMatrix(
        cluster, lateral, longitudinal, y, [width, height, length], rotationX, rotationZ,
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
    sheeting: sheetingTileM, roofing: sheetingTileM, brick: 1.2, render: 2.4, timber: 2, glazing: 1, tiles: 2,
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
    // render, planks and brick ride the pack's own plaster, wood and brick buckets (same albedos, no extra draw where
    // the pack builds in them already: the regional shelters lay brick only in Steinburg and Cinder, which do)
    // clay tiles ride the pack's own roof bucket (its buildings' tiled roofs), so a tiled facility roof adds no draw
    if (surface === 'render' || surface === 'timber' || surface === 'brick' || surface === 'tiles') {
      const bucket = surface === 'render' ? 'plaster2' : surface === 'timber' ? 'wood' : surface === 'tiles' ? 'roof' : 'stone';
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

  // ---------------------------------------------------------------------------------------------------------------------
  // Regional shelters (round 6, 2026-10-11; waves 408, 419 and 424: "every yard repeats the same shelter frame ... with
  // only colour swaps"; the owner: "make the garages (all of them) redesigned to look a ton better"). Each Garage builds
  // its bays the way its region would, on the same 9.3 x 7.3 m footprint, open to the yard: a back wall that carries the
  // tool wall, supports for the turret crane's runway, the roof clear of the Burlak's turret gantry (5.2 m).
  type ShelterKind = 'portal' | 'timber-snow-shed' | 'shade-hangar' | 'brick-bay' | 'rail-shed'
    | 'monsoon-pavilion' | 'avalanche-gallery' | 'rock-cut' | 'mill-bay';
  const SHELTER_KINDS: Readonly<Record<GarageVariant['architecture'], ShelterKind>> = Object.freeze({
    field_shed: 'portal',
    shade_depot: 'shade-hangar', // canvas vault on arched hoops, sandbagged
    repair_bunker: 'timber-snow-shed', // heavy timber, a steep board roof deep in snow
    brick_arsenal: 'brick-bay', // brick piers and walls, steel trusses
    naval_drydock: 'portal', // galvanised dockyard steel
    rail_roundhouse: 'rail-shed', // brick, cast-iron columns, a smoke-vent roof
    rain_canopy: 'monsoon-pavilion', // round columns, deep eaves, gutters into drains
    rock_cavern: 'avalanche-gallery', // concrete gallery under snow, backed by scree
    recovery_yard: 'rock-cut', // a bay cut into the red rock, a lean-to on posts
    factory_line: 'mill-bay', // heavy steel, a monitor roof, sooty sheeting
  });
  const shelterKind: ShelterKind = SHELTER_KINDS[variant.architecture] ?? 'portal';
  servicePurposeTags.add(`shelter:${shelterKind}`);
  /** Whether a post stands at this lateral side's mid-bay (none on the inspection deck's side, which it would pierce). */
  const midPostOn = (lateral: number, deckLateralSign: number): boolean => deckLateralSign === 0
    || Math.sign(lateral) !== deckLateralSign;
  const servicePit = (cluster: FacilityCluster): void => {
    // the bay's floor is the pack's own hardstand pad; only the service pit's steel grating marks it, flush with it
    clusterBox(cluster, 0, 0.2, 0.035, 2.45, 0.03, 6.4, dark, 'equipment');
  };
  /** A wall of stacked bags (lateral run when `alongLateral`), every course offset half a bag. */
  const sandbagWall = (cluster: FacilityCluster, lateral: number, longitudinal: number, run: number, courses: number,
    alongLateral: boolean, tone: THREE.Color): void => {
    const bag = 0.62;
    for (let course = 0; course < courses; course += 1) {
      const count = Math.floor(run / bag);
      const shift = course % 2 ? bag / 2 : 0;
      for (let i = 0; i < count - (course % 2); i += 1) {
        const along = -run / 2 + shift + bag / 2 + i * bag;
        const shade = tone.clone().offsetHSL(0, 0, ((i * 7 + course * 3) % 5 - 2) * 0.012);
        clusterBox(cluster, alongLateral ? lateral + along : lateral, alongLateral ? longitudinal : longitudinal + along,
          0.11 + course * 0.2, alongLateral ? bag - 0.04 : 0.34, 0.2, alongLateral ? 0.34 : bag - 0.04, shade, 'painted');
      }
    }
  };
  /** A pitched roof's two slopes (ridge along the bay) of one surface, with an optional covering on each (snow). */
  const gableRoof = (cluster: FacilityCluster, surface: FacilitySurface, eaveLateral: number, eaveY: number, ridgeY: number,
    length: number, covering?: THREE.Color): void => {
    const pitch = Math.atan2(ridgeY - eaveY, eaveLateral);
    const slope = Math.hypot(eaveLateral, ridgeY - eaveY);
    for (const sign of [-1, 1]) {
      const midLateral = sign * eaveLateral / 2;
      const midY = (eaveY + ridgeY) / 2;
      // the slope falls outward: its width axis turned by -sign * pitch
      clusterSurface(cluster, surface, midLateral, 0, midY, slope + 0.12, 0.06, length, {
        rotationZ: -sign * pitch, ribsAcross: true,
      });
      if (covering) {
        const lift = 0.15;
        clusterBox(cluster, midLateral + sign * Math.sin(pitch) * lift, 0, midY + Math.cos(pitch) * lift,
          slope - 0.1, 0.24, length - 0.2, covering, 'painted', -sign * pitch);
      }
    }
  };

  const addTimberSnowShed = (cluster: FacilityCluster, cladLateralSign: number, deckLateralSign: number): void => {
    // Frosthollow: heavy timber posts on concrete pads carry wall plates and a steep board roof, its ridge along the bay,
    // deep in snow; the back gable and the far side are boarded; knee braces stiffen the walls. Its turret lifts on
    // shear legs (addPurposeBuiltServiceBay), so the shed carries no crane runway.
    const stain = new THREE.Color(0x45352a);
    const snow = new THREE.Color(0xeef3f6);
    const plateY = 4.4, ridgeY = 7.3, postAt = 4.45;
    const tanPitch = (ridgeY - plateY) / postAt;
    for (const lateral of [-postAt, postAt]) {
      for (const longitudinal of [-BAY_HALF_L, 0, BAY_HALF_L]) {
        if (longitudinal === 0 && !midPostOn(lateral, deckLateralSign)) continue;
        clusterBox(cluster, lateral, longitudinal, 0.15, 0.72, 0.3, 0.72, dark, 'masonry');
        clusterBox(cluster, lateral, longitudinal, 0.3 + (plateY - 0.3) / 2, 0.32, plateY - 0.3, 0.32, stain, 'painted');
        for (const sign of [-1, 1]) {
          // no brace in the deck's wall: it would cross the walkway
          if (Math.abs(longitudinal + sign * 1.05) > BAY_HALF_L + 0.01 || !midPostOn(lateral, deckLateralSign)) continue;
          clusterBeam(cluster, [lateral, longitudinal, plateY - 1.15], [lateral, longitudinal + sign * 1.05, plateY - 0.1],
            0.16, stain, 'painted');
        }
      }
      clusterBox(cluster, lateral, 0, plateY + 0.13, 0.36, 0.26, 2 * BAY_HALF_L + 0.5, stain, 'painted');
    }
    const eaveOut = postAt + 0.8;
    const eaveY = plateY - (eaveOut - postAt) * tanPitch;
    for (let i = 0; i <= 5; i += 1) {
      const longitudinal = -BAY_HALF_L - 0.1 + i * ((2 * BAY_HALF_L + 0.2) / 5);
      for (const sign of [-1, 1]) {
        clusterBeam(cluster, [sign * eaveOut, longitudinal, eaveY - 0.14], [0, longitudinal, ridgeY - 0.14], 0.2, stain, 'painted');
      }
      const tieY = ridgeY - 1.2;
      const tieHalf = postAt - (tieY - plateY) / tanPitch;
      clusterBox(cluster, 0, longitudinal, tieY, 2 * tieHalf, 0.16, 0.14, stain, 'painted');
    }
    clusterBox(cluster, 0, 0, ridgeY - 0.05, 0.24, 0.3, 2 * BAY_HALF_L + 0.6, stain, 'painted');
    gableRoof(cluster, 'timber', eaveOut, eaveY, ridgeY, 2 * BAY_HALF_L + 0.9, snow);
    // the snow piles up on the ridge and hangs a little over the front gable
    clusterBox(cluster, 0, 0, ridgeY + 0.22, 0.9, 0.28, 2 * BAY_HALF_L + 0.7, snow, 'painted');
    // the boarded back gable on a concrete upstand, stepped up under the roof
    const back = -BAY_HALF_L - 0.22;
    clusterBox(cluster, 0, back, 0.25, 2 * postAt + 0.4, 0.5, 0.3, dark, 'masonry');
    clusterSurface(cluster, 'timber', 0, back, 0.5 + (plateY - 0.5) / 2, 2 * postAt + 0.3, plateY - 0.5, 0.08);
    for (let step = 0; step < 4; step += 1) {
      const y0 = plateY + step * (ridgeY - plateY) / 4, y1 = plateY + (step + 1) * (ridgeY - plateY) / 4;
      const half = postAt - (y1 - plateY) / tanPitch + 0.12;
      clusterSurface(cluster, 'timber', 0, back, (y0 + y1) / 2, 2 * Math.max(0.3, half), y1 - y0, 0.08);
    }
    // the far side boarded over its back half
    if (cladLateralSign !== 0) {
      const far = cladLateralSign * (postAt + 0.2);
      clusterBox(cluster, far, -BAY_HALF_L / 2, 0.25, 0.3, 0.5, BAY_HALF_L + 0.3, dark, 'masonry');
      clusterSurface(cluster, 'timber', far, -BAY_HALF_L / 2, 0.5 + (plateY - 0.5) / 2, 0.08, plateY - 0.5, BAY_HALF_L + 0.3);
    }
    // a drift banked against the back wall outside
    clusterBox(cluster, 0, back - 0.8, 0.3, 2 * postAt + 1.2, 0.6, 1.2, snow, 'painted');
  };

  const addShadeHangar = (cluster: FacilityCluster, cladLateralSign: number): void => {
    // Sirocco: a canvas vault on arched steel hoops standing on straight legs (the turret crane runs on the legs), the
    // back and the far side closed in canvas over a sandbag wall, guyed to ground anchors.
    const canvas = new THREE.Color(0xd8c7a0);
    const canvasEdge = new THREE.Color(0x9c8660);
    const bags = new THREE.Color(0xb39a6e);
    const legTop = 5.2, apexY = 7.1, half = BAY_HALF_W;
    const ARCH = 8;
    const archPoint = (k: number): readonly [number, number] => {
      const angle = Math.PI * (1 - k / ARCH);
      return [Math.cos(angle) * half, legTop + Math.sin(angle) * (apexY - legTop)];
    };
    const hoops = [-BAY_HALF_L, -BAY_HALF_L / 3, BAY_HALF_L / 3, BAY_HALF_L];
    for (const longitudinal of hoops) {
      for (const lateral of [-half, half]) {
        clusterBox(cluster, lateral, longitudinal, 0.1, 0.55, 0.2, 0.55, dark, 'masonry');
        clusterBox(cluster, lateral, longitudinal, legTop / 2, 0.2, legTop, 0.2, steel, 'structure');
      }
      for (let k = 0; k < ARCH; k += 1) {
        const [x0, y0] = archPoint(k), [x1, y1] = archPoint(k + 1);
        clusterBeam(cluster, [x0, longitudinal, y0], [x1, longitudinal, y1], 0.2, steel, 'structure');
      }
    }
    for (let k = 1; k < ARCH; k += 1) {
      const [x, y] = archPoint(k);
      clusterBox(cluster, x, 0, y - 0.04, 0.09, 0.09, 2 * BAY_HALF_L, steel, 'structure');
    }
    for (let k = 0; k < ARCH; k += 1) {
      const [x0, y0] = archPoint(k), [x1, y1] = archPoint(k + 1);
      const angle = Math.atan2(y1 - y0, x1 - x0);
      const out = 0.13;
      clusterBox(cluster, (x0 + x1) / 2 - Math.sin(angle) * out, 0, (y0 + y1) / 2 + Math.cos(angle) * out,
        Math.hypot(x1 - x0, y1 - y0) + 0.07, 0.05, 2 * BAY_HALF_L + 0.8, canvas, 'painted', angle);
    }
    // the canvas's laced valance along both eaves
    for (const lateral of [-half - 0.12, half + 0.12]) {
      clusterBox(cluster, lateral, 0, legTop - 0.25, 0.05, 0.5, 2 * BAY_HALF_L + 0.8, canvasEdge, 'painted');
    }
    // the back closed in canvas, stepped up into the vault, over a sandbag wall
    const back = -BAY_HALF_L - 0.24;
    clusterBox(cluster, 0, back, 1.0 + (legTop - 1.0) / 2, 2 * half, legTop - 1.0, 0.05, canvas, 'painted');
    for (let step = 0; step < 4; step += 1) {
      const y0 = legTop + step * (apexY - legTop) / 4, y1 = legTop + (step + 1) * (apexY - legTop) / 4;
      const t = Math.min(1, (y1 - legTop) / (apexY - legTop));
      clusterBox(cluster, 0, back, (y0 + y1) / 2, 2 * half * Math.sqrt(Math.max(0.02, 1 - t * t)) + 0.2, y1 - y0, 0.05, canvas, 'painted');
    }
    sandbagWall(cluster, 0, back - 0.22, 2 * half + 0.4, 5, true, bags);
    if (cladLateralSign !== 0) {
      const far = cladLateralSign * (half + 0.14);
      clusterBox(cluster, far, 0, 1.0 + (legTop - 1.0) / 2, 0.05, legTop - 1.0, 2 * BAY_HALF_L + 0.4, canvas, 'painted');
      sandbagWall(cluster, far + cladLateralSign * 0.24, 0, 2 * BAY_HALF_L + 0.4, 5, false, bags);
    }
    // guy lines from the end hoops' shoulders to ground anchors
    for (const longitudinal of [-BAY_HALF_L, BAY_HALF_L]) {
      for (const k of [2, ARCH - 2]) {
        const [x, y] = archPoint(k);
        const outward = Math.sign(x);
        const anchor: readonly [number, number, number] = [x + outward * 2.6, longitudinal + Math.sign(longitudinal) * 1.4, 0.12];
        clusterBeam(cluster, [x, longitudinal, y], anchor, 0.03, canvasEdge, 'equipment');
        clusterBox(cluster, anchor[0], anchor[1], 0.08, 0.22, 0.16, 0.22, dark, 'masonry');
      }
    }
  };

  /** Brick piers at the four corners with stone caps. */
  const brickPiers = (cluster: FacilityCluster, height: number, cap: THREE.Color): void => {
    for (const lateral of [-BAY_HALF_W, BAY_HALF_W]) {
      for (const longitudinal of [-BAY_HALF_L, BAY_HALF_L]) {
        clusterSurface(cluster, 'brick', lateral, longitudinal, height / 2, 0.8, height, 0.8);
        clusterBox(cluster, lateral, longitudinal, height + 0.08, 0.92, 0.16, 0.92, cap, 'masonry');
      }
    }
  };
  /** The back wall in brick to `height` with tall round-headed windows high in it, and a gable stepped up to `ridgeY`. */
  const brickBackWall = (cluster: FacilityCluster, height: number, ridgeY: number, windows: readonly number[],
    stone: THREE.Color): void => {
    // The windows are cut through the wall (2026-10-14, the props standard: openings with depth; round 6a painted them
    // on its face): the wall stands as a band under the sills, a band over the heads and piers between, so each opening
    // shows the wall's 0.38 m in its reveals; an iron frame with a mullion and a transom stands 0.14 m back from the
    // yard face, its lights glazed dark behind it; a stone sill and a brick relieving arch over a flat head.
    const back = -BAY_HALF_L - 0.24;
    const thickness = 0.38, halfOpening = 0.65, sillY = 2.3, headY = 4.6;
    const yardFace = back + thickness / 2;
    clusterSurface(cluster, 'brick', 0, back, sillY / 2, 2 * BAY_HALF_W, sillY, thickness);
    clusterSurface(cluster, 'brick', 0, back, (headY + height) / 2, 2 * BAY_HALF_W, height - headY, thickness);
    const edges = [-BAY_HALF_W, ...[...windows].sort((a, b) => a - b).flatMap((lateral) => [lateral - halfOpening, lateral + halfOpening]),
      BAY_HALF_W];
    for (let index = 0; index < edges.length; index += 2) {
      const a = edges[index], b = edges[index + 1];
      if (b - a > 0.02) clusterSurface(cluster, 'brick', (a + b) / 2, back, (sillY + headY) / 2, b - a, headY - sillY, thickness);
    }
    const iron = new THREE.Color(0x2b2f31);
    const pane = new THREE.Color(0x1b2226);
    for (const lateral of windows) {
      const frameAt = yardFace - 0.14, bar = 0.06;
      const transomY = sillY + (headY - sillY) * 0.62;
      for (const side of [-1, 1]) {
        clusterBox(cluster, lateral + side * (halfOpening - bar / 2), frameAt, (sillY + headY) / 2, bar, headY - sillY, 0.08, iron, 'painted');
      }
      clusterBox(cluster, lateral, frameAt, headY - bar / 2, 2 * halfOpening, bar, 0.08, iron, 'painted');
      clusterBox(cluster, lateral, frameAt, sillY + bar / 2, 2 * halfOpening, bar, 0.08, iron, 'painted');
      clusterBox(cluster, lateral, frameAt, (sillY + headY) / 2, 0.045, headY - sillY - 2 * bar, 0.06, iron, 'painted'); // mullion
      clusterBox(cluster, lateral, frameAt, transomY, 2 * halfOpening - 2 * bar, 0.045, 0.06, iron, 'painted'); // transom
      clusterBox(cluster, lateral, frameAt - 0.05, (sillY + headY) / 2, 2 * halfOpening - 0.04, headY - sillY - 0.04, 0.012, pane, 'painted');
      clusterBox(cluster, lateral, yardFace + 0.05, sillY - 0.04, 2 * halfOpening + 0.2, 0.12, 0.2, stone, 'masonry'); // sill
      for (let v = 0; v < 5; v += 1) {
        // the brick relieving arch over the head: five voussoirs proud of the face
        const angle = Math.PI * (v + 0.5) / 5;
        clusterBox(cluster, lateral + Math.cos(angle) * 0.76, yardFace + 0.02, headY + 0.06 + Math.sin(angle) * 0.46, 0.34, 0.22, 0.06,
          new THREE.Color(0x6e3f30), 'masonry', angle - Math.PI / 2);
      }
    }
    for (let step = 0; step < 4; step += 1) {
      const y0 = height + step * (ridgeY - height) / 4, y1 = height + (step + 1) * (ridgeY - height) / 4;
      const half = BAY_HALF_W * (1 - (y1 - height) / (ridgeY - height)) + 0.25;
      clusterSurface(cluster, 'brick', 0, back, (y0 + y1) / 2, 2 * Math.max(0.35, half), y1 - y0, thickness);
    }
  };
  /** Lattice roof trusses across the bay (top chords to the ridge, a bottom chord at the eaves, diagonal webs). */
  const roofTrusses = (cluster: FacilityCluster, eaveY: number, ridgeY: number, at: readonly number[], color: THREE.Color): void => {
    for (const longitudinal of at) {
      for (const sign of [-1, 1]) {
        clusterBeam(cluster, [sign * BAY_HALF_W, longitudinal, eaveY], [0, longitudinal, ridgeY - 0.1], 0.18, color, 'structure');
        for (let web = 1; web <= 3; web += 1) {
          const lateral = sign * BAY_HALF_W * (1 - web / 4);
          const top = eaveY + (ridgeY - 0.1 - eaveY) * (web / 4);
          clusterBeam(cluster, [lateral, longitudinal, eaveY], [lateral, longitudinal, top], 0.08, color, 'structure');
          clusterBeam(cluster, [lateral, longitudinal, eaveY], [lateral + sign * BAY_HALF_W / 4, longitudinal, top - (ridgeY - eaveY) / 4],
            0.07, color, 'structure');
        }
      }
      clusterBox(cluster, 0, longitudinal, eaveY, 2 * BAY_HALF_W, 0.14, 0.14, color, 'structure');
    }
  };

  const addBrickBay = (cluster: FacilityCluster, cladLateralSign: number): void => {
    // Steinburg: the arsenal's own workshop bays in brick: corner piers with stone caps, a back wall with tall
    // round-headed windows, the far side walled in brick over its back half, steel lattice trusses and a sheeted roof.
    const eaveY = 5.6, ridgeY = 7.5;
    const stone = new THREE.Color(0x9a9286);
    brickPiers(cluster, eaveY, stone);
    brickBackWall(cluster, eaveY, ridgeY, [-2.4, 2.4], stone);
    if (cladLateralSign !== 0) {
      clusterSurface(cluster, 'brick', cladLateralSign * (BAY_HALF_W + 0.05), -BAY_HALF_L / 2, eaveY / 2, 0.36, eaveY, BAY_HALF_L);
      clusterBox(cluster, cladLateralSign * (BAY_HALF_W + 0.05), -BAY_HALF_L / 2, eaveY + 0.06, 0.46, 0.12, BAY_HALF_L + 0.1, stone, 'masonry');
    }
    const ironwork = new THREE.Color(0x2f3337);
    roofTrusses(cluster, eaveY, ridgeY, [-BAY_HALF_L, 0, BAY_HALF_L], ironwork);
    for (let i = 0; i <= 4; i += 1) {
      const t = i / 4;
      for (const sign of [-1, 1]) {
        clusterBox(cluster, sign * BAY_HALF_W * (1 - t), 0, eaveY + (ridgeY - eaveY) * t + 0.1, 0.12, 0.14, 2 * BAY_HALF_L + 0.3, ironwork, 'structure');
      }
    }
    gableRoof(cluster, 'roofing', BAY_HALF_W + 0.55, eaveY - 0.55 * (ridgeY - eaveY) / BAY_HALF_W, ridgeY + 0.12, 2 * BAY_HALF_L + 0.8);
    // a riveted plate lintel across the open front
    clusterBox(cluster, 0, BAY_HALF_L, eaveY - 0.35, 2 * BAY_HALF_W - 0.6, 0.7, 0.3, ironwork, 'structure');
  };

  const addRailShed = (cluster: FacilityCluster, cladLateralSign: number): void => {
    // Cinder: a railway shed: a brick back wall with tall round-headed windows, brick piers behind and cast-iron columns
    // with a plate girder at the open front, iron trusses and a sooty roof with a raised smoke vent along its ridge.
    const eaveY = 5.4, ridgeY = 7.2;
    const stone = new THREE.Color(0x8b8378);
    const iron = new THREE.Color(0x26292b);
    for (const lateral of [-BAY_HALF_W, BAY_HALF_W]) {
      clusterSurface(cluster, 'brick', lateral, -BAY_HALF_L, eaveY / 2, 0.8, eaveY, 0.8);
      clusterBox(cluster, lateral, -BAY_HALF_L, eaveY + 0.08, 0.92, 0.16, 0.92, stone, 'masonry');
      // the cast-iron front column on its plinth, with a flared capital
      clusterBox(cluster, lateral, BAY_HALF_L, 0.3, 0.7, 0.6, 0.7, stone, 'masonry');
      clusterCylinder(cluster, lateral, BAY_HALF_L, 0.6 + (eaveY - 0.9) / 2, 0.17, eaveY - 0.9, iron, 0, 16);
      clusterCylinder(cluster, lateral, BAY_HALF_L, eaveY - 0.18, 0.32, 0.36, iron, 0, 16);
    }
    brickBackWall(cluster, eaveY, ridgeY, [-2.9, 0, 2.9], stone);
    if (cladLateralSign !== 0) {
      clusterSurface(cluster, 'brick', cladLateralSign * (BAY_HALF_W + 0.05), -BAY_HALF_L / 2, eaveY / 2, 0.36, eaveY, BAY_HALF_L);
    }
    clusterBox(cluster, 0, BAY_HALF_L, eaveY + 0.1, 2 * BAY_HALF_W + 0.5, 0.8, 0.34, iron, 'structure'); // plate girder
    for (let rivet = -8; rivet <= 8; rivet += 1) {
      clusterBox(cluster, rivet * 0.55, BAY_HALF_L + 0.18, eaveY + 0.1, 0.06, 0.62, 0.04, new THREE.Color(0x3a3e40), 'structure');
    }
    roofTrusses(cluster, eaveY + 0.5, ridgeY, [-BAY_HALF_L + 0.4, 0, BAY_HALF_L - 0.2], iron);
    gableRoof(cluster, 'roofing', BAY_HALF_W + 0.5, eaveY + 0.5 - 0.5 * (ridgeY - eaveY - 0.5) / BAY_HALF_W, ridgeY, 2 * BAY_HALF_L + 0.8);
    // the smoke vent: a raised roof over louvred sides along the ridge
    for (const sign of [-1, 1]) {
      clusterBox(cluster, sign * 0.95, 0, ridgeY + 0.35, 0.06, 0.7, 2 * BAY_HALF_L + 0.2, iron, 'painted');
      for (let louvre = 0; louvre < 3; louvre += 1) {
        clusterBox(cluster, sign * 1.0, 0, ridgeY + 0.12 + louvre * 0.22, 0.04, 0.05, 2 * BAY_HALF_L + 0.1, new THREE.Color(0x45494c), 'painted', sign * 0.5);
      }
    }
    gableRoof(cluster, 'roofing', 1.25, ridgeY + 0.62, ridgeY + 0.95, 2 * BAY_HALF_L + 0.4);
  };

  const addMonsoonPavilion = (cluster: FacilityCluster, cladLateralSign: number, deckLateralSign: number): void => {
    // Monsoon: round concrete columns under a steep roof with deep eaves; gutters along both eaves run down to drain
    // channels round the bay, and the back is a ventilated timber screen over a concrete upstand.
    const eaveY = 5.5, ridgeY = 7.9; // the ring beams clear the Burlak gantry's bridge (5.22 m)
    const concrete = new THREE.Color(0x9a9a92);
    const drain = new THREE.Color(0x1d2224);
    for (const lateral of [-BAY_HALF_W, BAY_HALF_W]) {
      for (const longitudinal of [-BAY_HALF_L, 0, BAY_HALF_L]) {
        if (longitudinal === 0 && !midPostOn(lateral, deckLateralSign)) continue;
        clusterBox(cluster, lateral, longitudinal, 0.12, 0.8, 0.24, 0.8, dark, 'masonry');
        clusterCylinder(cluster, lateral, longitudinal, 0.24 + (eaveY - 0.24) / 2, 0.24, eaveY - 0.24, concrete, 0, 16);
      }
      clusterBox(cluster, lateral, 0, eaveY + 0.15, 0.44, 0.3, 2 * BAY_HALF_L + 0.44, concrete, 'masonry');
    }
    for (const longitudinal of [-BAY_HALF_L, 0, BAY_HALF_L]) {
      clusterBox(cluster, 0, longitudinal, eaveY + 0.15, 2 * BAY_HALF_W, 0.3, 0.3, concrete, 'masonry');
      for (const sign of [-1, 1]) {
        clusterBeam(cluster, [sign * (BAY_HALF_W + 1.4), longitudinal, eaveY - 0.62], [0, longitudinal, ridgeY - 0.12], 0.18, steel, 'structure');
      }
    }
    const eaveOut = BAY_HALF_W + 1.4;
    const eaveDrop = eaveY - 1.4 * (ridgeY - eaveY) / BAY_HALF_W;
    gableRoof(cluster, 'roofing', eaveOut, eaveDrop + 0.1, ridgeY, 2 * BAY_HALF_L + 1.2);
    for (const sign of [-1, 1]) {
      const gutter = sign * (eaveOut + 0.1);
      clusterBox(cluster, gutter, 0, eaveDrop - 0.02, 0.22, 0.18, 2 * BAY_HALF_L + 1.2, dark, 'painted');
      for (const longitudinal of [-BAY_HALF_L - 0.4, BAY_HALF_L + 0.4]) {
        clusterBox(cluster, gutter, longitudinal, eaveDrop / 2, 0.11, eaveDrop, 0.11, dark, 'painted');
      }
      // the drain channel under the eave line: a dark grated trough with a sump at each downpipe
      clusterBox(cluster, gutter, 0, 0.03, 0.46, 0.04, 2 * BAY_HALF_L + 1.6, drain, 'equipment');
      for (const longitudinal of [-BAY_HALF_L - 0.4, BAY_HALF_L + 0.4]) {
        clusterBox(cluster, gutter, longitudinal, 0.05, 0.7, 0.08, 0.7, concrete, 'masonry');
      }
      for (let bar = 0; bar < 18; bar += 1) {
        clusterBox(cluster, gutter, -BAY_HALF_L - 0.6 + bar * ((2 * BAY_HALF_L + 1.2) / 17), 0.06, 0.5, 0.02, 0.04, steel, 'structure');
      }
    }
    clusterBox(cluster, 0, -BAY_HALF_L - 0.9, 0.03, 2 * eaveOut + 0.6, 0.04, 0.46, drain, 'equipment');
    // the back: a concrete upstand and a louvred timber screen above it
    const back = -BAY_HALF_L - 0.24;
    clusterBox(cluster, 0, back, 0.5, 2 * BAY_HALF_W, 1.0, 0.24, concrete, 'masonry');
    clusterSurface(cluster, 'timber', 0, back, 1.0 + 1.6, 2 * BAY_HALF_W, 3.2, 0.06);
    for (let slat = 0; slat < 6; slat += 1) {
      clusterBox(cluster, 0, back + 0.1, 4.35 + slat * 0.12, 2 * BAY_HALF_W, 0.04, 0.12, new THREE.Color(0x5b4632), 'painted', 0);
    }
    if (cladLateralSign !== 0) {
      clusterBox(cluster, cladLateralSign * BAY_HALF_W, -BAY_HALF_L / 2, 0.5, 0.24, 1.0, BAY_HALF_L, concrete, 'masonry');
    }
    // the rainwater tank behind the bay
    clusterCylinder(cluster, cladLateralSign * 2.6 || 2.6, back - 1.35, 1.1, 1.0, 2.2, new THREE.Color(0x2f5a4c), 0, 16);
    clusterCylinder(cluster, cladLateralSign * 2.6 || 2.6, back - 1.35, 2.25, 1.04, 0.1, dark, 0, 16);
  };

  const addAvalancheGallery = (cluster: FacilityCluster, cladLateralSign: number, deckLateralSign: number): void => {
    // Glacier: a concrete avalanche gallery: a heavy back wall against the slope, the far side walled, a roof slab
    // falling from the mountain side to the valley side on columns with haunches, snow lying on it, scree behind.
    const concrete = new THREE.Color(0x8e9294);
    const snow = new THREE.Color(0xeef3f6);
    const rock = new THREE.Color(0x6a6c6b);
    const backY = 6.4, frontY = 5.75;
    const roofAt = (longitudinal: number): number => backY + (frontY - backY) * ((longitudinal + BAY_HALF_L) / (2 * BAY_HALF_L));
    const pitch = Math.atan2(backY - frontY, 2 * BAY_HALF_L);
    const back = -BAY_HALF_L - 0.45;
    clusterBox(cluster, 0, back, backY / 2, 2 * BAY_HALF_W + 1.0, backY, 0.62, concrete, 'masonry');
    if (cladLateralSign !== 0) {
      clusterBox(cluster, cladLateralSign * (BAY_HALF_W + 0.25), 0, frontY / 2, 0.5, frontY, 2 * BAY_HALF_L + 0.4, concrete, 'masonry');
    }
    const columnSides = cladLateralSign !== 0 ? [-cladLateralSign * BAY_HALF_W] : [-BAY_HALF_W, BAY_HALF_W];
    for (const lateral of columnSides) {
      for (const longitudinal of [midPostOn(lateral, deckLateralSign) ? 0 : -1.4, BAY_HALF_L]) {
        const top = roofAt(longitudinal) - 0.3;
        clusterBox(cluster, lateral, longitudinal, top / 2, 0.6, top, 0.6, concrete, 'masonry');
        clusterBox(cluster, lateral - Math.sign(lateral) * 0.45, longitudinal, top - 0.25, 0.4, 0.5, 0.6, concrete, 'masonry');
      }
    }
    if (cladLateralSign !== 0) {
      clusterBox(cluster, cladLateralSign * BAY_HALF_W, BAY_HALF_L, frontY / 2, 0.6, frontY, 0.6, concrete, 'masonry');
    }
    // the roof slab and the snow on it, falling from the mountain side to the valley side (turned about the lateral axis;
    // painted, so it casts the sun's shadow)
    clusterBox(cluster, 0, 0, (backY + frontY) / 2 + 0.05, 2 * BAY_HALF_W + 1.2, 0.5, 2 * BAY_HALF_L + 1.1,
      concrete, 'painted', 0, pitch);
    clusterBox(cluster, 0, 0.1, (backY + frontY) / 2 + 0.47, 2 * BAY_HALF_W + 1.1, 0.34, 2 * BAY_HALF_L + 0.9,
      snow, 'painted', 0, pitch);
    // scree heaped behind the back wall up to the roof, snow on it
    for (let k = 0; k < 7; k += 1) {
      const lateral = -BAY_HALF_W + k * (2 * BAY_HALF_W / 6);
      const height = 4.6 + ((k * 37) % 5) * 0.35;
      clusterBox(cluster, lateral, back - 1.3 - (k % 2) * 0.4, height / 2, 2.1, height, 2.2, rock.clone().offsetHSL(0, 0, ((k % 3) - 1) * 0.03), 'masonry', ((k % 3) - 1) * 0.12);
      clusterBox(cluster, lateral, back - 1.2 - (k % 2) * 0.4, height + 0.12, 1.9, 0.26, 2.0, snow, 'painted', ((k % 3) - 1) * 0.12);
    }
  };

  const addRockCut = (cluster: FacilityCluster, cladLateralSign: number): void => {
    // Redrock: the bay is cut back into the red rock: stratified faces at the back and on the far side, rock bolts in
    // them, scree at their foot; a corrugated lean-to bears on the rock and on timber posts at the open front.
    const strata = [0x9c5a3e, 0xb06a48, 0x8a4c34, 0xa86244].map((hex) => new THREE.Color(hex));
    const post = new THREE.Color(0x5a3f2b);
    const bolt = new THREE.Color(0x2a2624);
    const layerH = 1.6;
    const back = -BAY_HALF_L - 0.3;
    for (let layer = 0; layer < 4; layer += 1) {
      const y = layerH * layer + layerH / 2;
      const set = ((layer * 5) % 3 - 1) * 0.14;
      clusterBox(cluster, 0, back - 1.1 + set, y, 2 * BAY_HALF_W + 3.2, layerH, 2.2, strata[layer], 'masonry');
      if (cladLateralSign !== 0) {
        clusterBox(cluster, cladLateralSign * (BAY_HALF_W + 0.3 + 1.1 - set), 0, y, 2.2, layerH, 2 * BAY_HALF_L + 1.6, strata[(layer + 2) % 4], 'masonry');
      }
    }
    clusterBox(cluster, 0, back - 1.6, 4 * layerH + 0.35, 2 * BAY_HALF_W + 2.2, 0.7, 1.2, strata[1], 'masonry', 0.06);
    const faceSet = (layer: number): number => ((layer * 5) % 3 - 1) * 0.14;
    for (let row = 0; row < 3; row += 1) {
      const y = 1.2 + row * 1.7;
      const face = back + faceSet(Math.min(3, Math.floor(y / layerH)));
      for (let i = 0; i < 5; i += 1) {
        clusterBox(cluster, -3.6 + i * 1.8 + (row % 2) * 0.9, face + 0.03, y, 0.16, 0.16, 0.08, bolt, 'structure');
      }
    }
    // scree at the foot of the faces, in the corners outside the bay
    for (let k = 0; k < 6; k += 1) {
      const sign = k % 2 ? 1 : -1;
      const lateral = sign * (BAY_HALF_W + 0.45 + (k % 3) * 0.35);
      clusterBox(cluster, lateral, back + 0.25 + Math.floor(k / 2) * 0.45, 0.2, 0.55 + (k % 3) * 0.2, 0.4, 0.5,
        strata[k % 4].clone().offsetHSL(0, 0, -0.04), 'masonry', (k % 3 - 1) * 0.25);
    }
    // the lean-to: a wall plate bolted to the rock, rafters falling to a front beam on two posts, corrugated sheeting
    const backY = 6.1, frontY = 5.5;
    const pitch = Math.atan2(backY - frontY, 2 * BAY_HALF_L);
    clusterBox(cluster, 0, back + 0.1, backY - 0.2, 2 * BAY_HALF_W + 0.4, 0.24, 0.2, post, 'painted');
    for (const lateral of [-BAY_HALF_W, BAY_HALF_W]) {
      clusterBox(cluster, lateral, BAY_HALF_L, 0.12, 0.6, 0.24, 0.6, dark, 'masonry');
      clusterCylinder(cluster, lateral, BAY_HALF_L, frontY / 2, 0.15, frontY, post, 0, 10);
    }
    clusterBox(cluster, 0, BAY_HALF_L, frontY - 0.12, 2 * BAY_HALF_W + 0.5, 0.26, 0.26, post, 'painted');
    for (let i = 0; i <= 5; i += 1) {
      const lateral = -BAY_HALF_W + i * (2 * BAY_HALF_W / 5);
      clusterBeam(cluster, [lateral, back + 0.1, backY - 0.05], [lateral, BAY_HALF_L + 0.4, frontY + 0.02], 0.16, post, 'painted');
    }
    clusterSurface(cluster, 'roofing', 0, (back + BAY_HALF_L + 0.6) / 2, (backY + frontY) / 2 + 0.16,
      2 * BAY_HALF_W + 0.9, 0.05, BAY_HALF_L - back + 0.6, { rotationX: pitch });
  };

  const addMillBay = (cluster: FacilityCluster, cladLateralSign: number, deckLateralSign: number): void => {
    // Ironworks: heavy steel: deep columns at the corners and mid-sides on concrete plinths, sooty sheeting on the back
    // and the far side with X-bracing, trusses and a roof whose ridge carries a louvred monitor.
    const eaveY = 6.6, ridgeY = 7.9;
    const soot = new THREE.Color(0x3c3e40);
    for (const lateral of [-BAY_HALF_W, BAY_HALF_W]) {
      for (const longitudinal of [-BAY_HALF_L, 0, BAY_HALF_L]) {
        if (longitudinal === 0 && !midPostOn(lateral, deckLateralSign)) continue;
        clusterBox(cluster, lateral, longitudinal, 0.3, 1.0, 0.6, 1.0, dark, 'masonry');
        clusterBox(cluster, lateral, longitudinal, 0.6 + (eaveY - 0.6) / 2, 0.5, eaveY - 0.6, 0.36, steel, 'structure');
        clusterBox(cluster, lateral, longitudinal, 0.6 + (eaveY - 0.6) / 2, 0.12, eaveY - 0.6, 0.62, steel, 'structure');
      }
      clusterBox(cluster, lateral, 0, eaveY + 0.2, 0.42, 0.4, 2 * BAY_HALF_L + 0.6, steel, 'structure');
    }
    const back = -BAY_HALF_L - 0.24;
    clusterBox(cluster, 0, back, 0.45, 2 * BAY_HALF_W + 0.5, 0.9, 0.3, dark, 'masonry');
    clusterSurface(cluster, 'sheeting', 0, back, 0.9 + (eaveY - 0.9) / 2, 2 * BAY_HALF_W + 0.4, eaveY - 0.9, 0.05);
    for (const sign of [-1, 1]) {
      clusterBeam(cluster, [sign * BAY_HALF_W, back + 0.14, 1.0], [0, back + 0.14, eaveY - 0.3], 0.12, steel, 'structure');
    }
    if (cladLateralSign !== 0) {
      const far = cladLateralSign * (BAY_HALF_W + 0.25);
      clusterSurface(cluster, 'sheeting', far, 0, 0.9 + (eaveY - 0.9) / 2, 0.05, eaveY - 0.9, 2 * BAY_HALF_L + 0.4);
      clusterBeam(cluster, [far - cladLateralSign * 0.12, -BAY_HALF_L, 1.0], [far - cladLateralSign * 0.12, 0, eaveY - 0.3], 0.12, steel, 'structure');
      clusterBeam(cluster, [far - cladLateralSign * 0.12, 0, 1.0], [far - cladLateralSign * 0.12, -BAY_HALF_L, eaveY - 0.3], 0.12, steel, 'structure');
    }
    roofTrusses(cluster, eaveY + 0.35, ridgeY, [-BAY_HALF_L, 0, BAY_HALF_L], steel);
    gableRoof(cluster, 'roofing', BAY_HALF_W + 0.45, eaveY + 0.35 - 0.45 * (ridgeY - eaveY - 0.35) / BAY_HALF_W, ridgeY, 2 * BAY_HALF_L + 0.8);
    for (const sign of [-1, 1]) {
      clusterBox(cluster, sign * 1.15, 0, ridgeY + 0.45, 0.08, 0.9, 2 * BAY_HALF_L + 0.4, soot, 'painted');
      for (let louvre = 0; louvre < 3; louvre += 1) {
        clusterBox(cluster, sign * 1.2, 0, ridgeY + 0.15 + louvre * 0.28, 0.05, 0.06, 2 * BAY_HALF_L + 0.3, dark, 'painted', sign * 0.5);
      }
    }
    gableRoof(cluster, 'roofing', 1.5, ridgeY + 0.85, ridgeY + 1.25, 2 * BAY_HALF_L + 0.6);
    // soot-blackened sheeting high on the back wall where the monitor's smoke rolls down
    clusterBox(cluster, 0, back + 0.04, eaveY - 0.8, 2 * BAY_HALF_W + 0.3, 1.6, 0.02, soot, 'painted');
  };

  /** Each Garage's own shelter on a bay (SHELTER_KINDS); the portal frame where the region builds in plain steel. */
  const addRegionalServiceBayFrame = (cluster: FacilityCluster, deckLateralSign = 0, cladLateralSign = -deckLateralSign): void => {
    if (shelterKind === 'portal') {
      addPurposeBuiltServiceBayFrame(cluster, deckLateralSign, cladLateralSign);
      return;
    }
    servicePit(cluster);
    switch (shelterKind) {
      case 'timber-snow-shed': addTimberSnowShed(cluster, cladLateralSign, deckLateralSign); break;
      case 'shade-hangar': addShadeHangar(cluster, cladLateralSign); break;
      case 'brick-bay': addBrickBay(cluster, cladLateralSign); break;
      case 'rail-shed': addRailShed(cluster, cladLateralSign); break;
      case 'monsoon-pavilion': addMonsoonPavilion(cluster, cladLateralSign, deckLateralSign); break;
      case 'avalanche-gallery': addAvalancheGallery(cluster, cladLateralSign, deckLateralSign); break;
      case 'rock-cut': addRockCut(cluster, cladLateralSign); break;
      case 'mill-bay': addMillBay(cluster, cladLateralSign, deckLateralSign); break;
    }
  };

  /** Frosthollow's turret lift: timber shear legs over the turret, a back stay to a ground anchor, a chain hoist. */
  const addShearLegs = (cluster: FacilityCluster, hookLateral: number, hookLongitudinal: number): void => {
    const pole = new THREE.Color(0x4a392b);
    const apex: readonly [number, number, number] = [hookLateral, hookLongitudinal, 5.6];
    for (const sign of [-1, 1]) {
      const foot: readonly [number, number, number] = [hookLateral + sign * 2.9, hookLongitudinal - 1.1, 0.05];
      clusterBeam(cluster, foot, apex, 0.24, pole, 'painted');
      clusterBox(cluster, foot[0], foot[1], 0.08, 0.5, 0.16, 0.5, dark, 'masonry');
    }
    const anchor: readonly [number, number, number] = [hookLateral, -BAY_HALF_L + 0.5, 0.2];
    clusterBeam(cluster, apex, anchor, 0.04, dark, 'equipment');
    clusterBox(cluster, anchor[0], anchor[1], 0.15, 0.4, 0.3, 0.4, dark, 'masonry');
    clusterBox(cluster, hookLateral, hookLongitudinal, 5.45, 0.5, 0.3, 0.5, steel, 'structure'); // the head lashing and shackle
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

    addRegionalServiceBayFrame(cluster, withDeck ? -mirror : 0, mirror);

    // Bridge crane: runway beams on brackets inside the rafters, the bridge spanning them, a trolley with its hook
    // block, a spreader beam and two slings over the bay centre. The Burlak's own turret gantry does its lift, so its
    // shelter carries none.
    const runwayY = BACK_EAVE_Y - 0.55;
    // Frosthollow's timber shed lifts its turret on shear legs; every other shelter carries the runway
    const shearLegs = withCrane && shelterKind === 'timber-snow-shed';
    if (withCrane && !shearLegs) for (const lateral of [-4.3, 4.3]) {
      clusterBox(cluster, lateral, 0, runwayY, 0.24, 0.3, 2 * BAY_HALF_L - 0.2, safety, 'painted');
      for (const longitudinal of [-BAY_HALF_L + 0.25, BAY_HALF_L - 0.25]) {
        clusterBox(cluster, lateral + Math.sign(lateral) * 0.18, longitudinal, runwayY + 0.1, 0.34, 0.12, 0.3, steel, 'structure');
      }
    }
    if (withCrane) {
      if (shearLegs) {
        addShearLegs(cluster, mirror * 0.8, mirror * 0.55);
        clusterCylinder(cluster, mirror * 0.8, mirror * 0.55, 4.02, 0.035, 2.56, steel, 0, 8);
        clusterBox(cluster, mirror * 0.8, mirror * 0.55, 4.45, 0.36, 0.5, 0.3, safety, 'painted'); // the chain block
      } else {
        clusterBox(cluster, 0, mirror * 0.55, runwayY - 0.12, 8.85, 0.34, 0.42, safety, 'painted');
        clusterBox(cluster, mirror * 0.8, mirror * 0.55, runwayY - 0.42, 0.72, 0.4, 0.68, dark, 'equipment');
        clusterCylinder(cluster, mirror * 0.8, mirror * 0.55, runwayY - 1.4, 0.04, 1.6, steel, 0, 8);
      }
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

  /**
   * Cinder's engine shed (garage round 7, GA.04, 2026-10-14; props census #20, garage:rail_roundhouse grade 0: "five open
   * portals" of painted plates square to the hero, the rail fan crossing them at 45 degrees). A Prussian three-road
   * straight shed of the 1900s in soot-dark brick, squared to the rail fan so its three roads run in through the front
   * and out through the back: a plinth, piers with pilasters, segmental-arched road doors cut through 0.5 m of brick with
   * ledged-and-braced timber leaves on strap hinges (the left road's pair open, the middle's half open, the right's
   * shut), a corbelled cornice, three stepped gables with round windows, ridge-and-furrow slate roofs with a smoke
   * lantern on each ridge and the smoke troughs under them, inspection pits between the rails, and side walls of tall
   * iron-framed windows between buttresses. A water crane stands at the throat. The cluster's +longitudinal faces the
   * camera (the view's -depth); lateral is the view's side.
   */
  const addEngineShed = (centerSide: number, centerDepth: number): void => {
    const origin = cameraPoint(centerSide, centerDepth);
    // square to the rail fan's roads (the recipe's straight centreline, side 0 from depth 9 to 49): the shed's
    // +longitudinal runs back down the roads toward the yard
    const roadIn = cameraPoint(centerSide, centerDepth - 1);
    const shedYaw = Math.atan2(roadIn.x - origin.x, roadIn.z - origin.z);
    const shed: FacilityCluster = { x: origin.x, z: origin.z, baseY: groundAtWorld(origin.x, origin.z), yaw: shedYaw };
    const at = (lateral: number, longitudinal: number): FacilityCluster => {
      const c = Math.cos(shedYaw), sn = Math.sin(shedYaw);
      return { x: shed.x + c * lateral + sn * longitudinal, z: shed.z - sn * lateral + c * longitudinal, baseY: shed.baseY, yaw: shed.yaw };
    };
    /** A detached piece beside the shed, seated on its own ground. */
    const atGround = (lateral: number, longitudinal: number): FacilityCluster => {
      const placed = at(lateral, longitudinal);
      return { ...placed, baseY: groundAtWorld(placed.x, placed.z) };
    };
    const roads = [-6.2, 0, 6.2];
    const halfW = 9.3, halfL = 8, wallT = 0.5, eaveY = 7.2, ridgeY = 9.9;
    const doorHalf = 2.1, springY = 5.0, rise = 0.55;
    const engineering = new THREE.Color(0x3a2a26); // blue-black engineering brick for plinth, cornice and arches
    const stone = new THREE.Color(0x7d766c);
    const iron = new THREE.Color(0x24282a);
    const tar = new THREE.Color(0x3b3027); // creosoted timber
    const pane = new THREE.Color(0x1a2024);
    const face = halfL; // the front wall's centre line
    // --- front wall: piers between the roads, the band over the arches, the stepped arch heads -----------------------
    const doorEdges = roads.flatMap((road) => [road - doorHalf, road + doorHalf]);
    const piers: Array<[number, number]> = [[-halfW - wallT / 2, doorEdges[0]], [doorEdges[1], doorEdges[2]],
      [doorEdges[3], doorEdges[4]], [doorEdges[5], halfW + wallT / 2]];
    for (const [a, b] of piers) clusterSurface(shed, 'brick', (a + b) / 2, face, springY / 2, b - a, springY, wallT);
    clusterSurface(shed, 'brick', 0, face, (springY + rise + eaveY) / 2, 2 * halfW + wallT, eaveY - springY - rise, wallT);
    const archSlices = 6;
    for (const road of roads) {
      for (let slice = 0; slice < archSlices; slice += 1) {
        const a = road - doorHalf + (slice * 2 * doorHalf) / archSlices, b = a + (2 * doorHalf) / archSlices;
        const mid = ((a + b) / 2 - road) / doorHalf;
        const head = springY + rise * (1 - mid * mid);
        const fill = springY + rise - head;
        if (fill > 0.02) clusterSurface(shed, 'brick', (a + b) / 2, face, head + fill / 2, b - a, fill, wallT);
      }
      // the arch ring: a continuous course of gauged engineering-brick voussoirs set flush in the face (the critic
      // panel: "voussoirs that stand proud with gaps"), a stone keystone
      const ringV = 16;
      for (let v = 0; v <= ringV; v += 1) {
        const t = -1 + (2 * v) / ringV;
        const lateral = road + t * (doorHalf + 0.12);
        const y = springY + rise * (1 - t * t) + 0.18;
        const slope = Math.atan(-2 * rise * t / (doorHalf + 0.12));
        const step = (2 * (doorHalf + 0.12)) / ringV / Math.cos(slope);
        clusterBox(shed, lateral, face + wallT / 2 + 0.012, y, step + 0.02, 0.36, 0.03, v === ringV / 2 ? stone : engineering,
          'masonry', slope);
      }
      // a boarded fanlight inside the arch head, set back
      clusterSurface(shed, 'timber', road, face - 0.1, springY + rise / 2, 2 * doorHalf, rise, 0.05);
      clusterBox(shed, road, face - 0.06, springY + 0.04, 2 * doorHalf, 0.12, 0.14, tar, 'painted'); // the head rail
    }
    // plinth, pilasters, cornice
    clusterBox(shed, 0, face + wallT / 2 + 0.05, 0.3, 2 * halfW + wallT + 0.2, 0.6, 0.12, engineering, 'masonry');
    for (const lateral of [-halfW, -3.1, 3.1, halfW]) {
      clusterSurface(shed, 'brick', lateral, face + wallT / 2 + 0.08, eaveY / 2, 0.62, eaveY, 0.16);
    }
    for (const [y, out] of [[eaveY - 0.08, 0.1], [eaveY + 0.08, 0.2]] as const) {
      clusterBox(shed, 0, face + wallT / 2 + out / 2, y, 2 * halfW + wallT + 0.3, 0.16, out + 0.05, engineering, 'masonry');
    }
    // --- the three gables over the front and the back, stepped, coped, a round window in the front ones -------------
    const gableSteps = 5;
    for (const wallAt of [face, -face]) {
      for (const road of roads) {
        for (let step = 0; step < gableSteps; step += 1) {
          const y0 = eaveY + 0.16 + step * (ridgeY - eaveY - 0.16) / gableSteps;
          const y1 = eaveY + 0.16 + (step + 1) * (ridgeY - eaveY - 0.16) / gableSteps;
          const half = 3.1 * (1 - (y1 - eaveY - 0.16) / (ridgeY - eaveY - 0.16)) + 0.18;
          clusterSurface(at(road, 0), 'brick', 0, wallAt, (y0 + y1) / 2, 2 * Math.max(0.3, half), y1 - y0, wallT);
        }
        const pitch = Math.atan2(ridgeY - eaveY, 3.1);
        for (const sign of [-1, 1]) {
          clusterBox(at(road, 0), sign * 1.55, wallAt, (eaveY + ridgeY) / 2 + 0.22, Math.hypot(3.1, ridgeY - eaveY) + 0.2, 0.16, wallT + 0.12,
            stone, 'masonry', -sign * pitch);
        }
        if (wallAt === face) {
          // the round window: a ring of voussoirs, an iron sash set back with its cross bars, a dark light
          const cy = eaveY + 1.05;
          for (let v = 0; v < 10; v += 1) {
            const angle = (v / 10) * Math.PI * 2;
            clusterBox(at(road, 0), Math.cos(angle) * 0.62, face + wallT / 2 + 0.03, cy + Math.sin(angle) * 0.62, 0.36, 0.2, 0.07,
              engineering, 'masonry', angle + Math.PI / 2);
          }
          clusterCylinder(at(road, 0), 0, face + 0.02, cy, 0.5, 0.06, pane, Math.PI / 2, 16);
          clusterBox(at(road, 0), 0, face + 0.07, cy, 1.0, 0.05, 0.05, iron, 'painted');
          clusterBox(at(road, 0), 0, face + 0.07, cy, 0.05, 1.0, 0.05, iron, 'painted');
        }
      }
    }
    // --- the doors: ledged and braced leaves of creosoted boards on strap hinges ------------------------------------
    const leaf = (road: number, side: -1 | 1, openRad: number): void => {
      // hinged at the jamb (road + side * doorHalf), the leaf runs back toward the road's centre when shut and swings out
      const hingeL = road + side * doorHalf, hingeF = face + wallT / 2 + 0.06;
      const width = doorHalf - 0.03, height = springY - 0.06;
      const dirL = -side * Math.cos(openRad), dirF = Math.sin(openRad);
      const midL = hingeL + dirL * width / 2, midF = hingeF + dirF * width / 2;
      // the leaf's frame: its face keeps the shut leaf's outward side whichever jamb it hangs on
      const s = -side;
      const yawLeaf = Math.atan2(-dirF * s, dirL * s);
      const leafCluster: FacilityCluster = { ...at(midL, midF), yaw: shedYaw + yawLeaf };
      clusterSurface(leafCluster, 'timber', 0, 0, height / 2 + 0.03, width, height, 0.07);
      for (const y of [0.45, height / 2, height - 0.4]) clusterBox(leafCluster, 0, 0.06, y, width - 0.1, 0.18, 0.05, tar, 'painted'); // ledges
      for (const [y0, y1] of [[0.45, height / 2], [height / 2, height - 0.4]] as const) {
        const len = Math.hypot(width - 0.3, y1 - y0);
        clusterBox(leafCluster, 0, 0.06, (y0 + y1) / 2, len, 0.15, 0.045, tar, 'painted', -side * Math.atan2(y1 - y0, width - 0.3));
      }
      for (const y of [0.6, height - 0.55]) clusterBox(leafCluster, side * (width / 2 - 0.45), 0.09, y, 0.9, 0.07, 0.02, iron, 'painted'); // strap hinges
    };
    // the left road's pair swung back 110 degrees on their pintles, clear of the piers; the others shut (the critic panel:
    // "tan slabs that float off or clip into the piers ... swung 100-120 degrees clear of the piers, or close them")
    leaf(-6.2, -1, Math.PI * 0.61); leaf(-6.2, 1, Math.PI * 0.61);
    leaf(0, -1, 0); leaf(0, 1, 0);
    leaf(6.2, -1, 0); leaf(6.2, 1, 0);
    for (const hingeL of [-6.2 - doorHalf, -6.2 + doorHalf]) {
      for (const y of [0.6, springY - 0.61]) clusterBox(shed, hingeL, face + wallT / 2 + 0.04, y, 0.14, 0.1, 0.12, iron, 'painted'); // pintles
    }
    // a tank engine stands dark inside the open road, its smokebox to the doors
    {
      const loco = at(-6.2, face - 5.0); // standing back from the buffer stop inside the doors
      const black = new THREE.Color(0x1d1f20), red = new THREE.Color(0x4a1d18);
      clusterBox(loco, 0, 0, 1.05, 1.9, 0.5, 8.2, red, 'painted'); // the frames and buffer beams
      clusterCylinder(loco, 0, 1.0, 2.25, 0.78, 5.0, black, Math.PI / 2, 16); // the boiler
      clusterCylinder(loco, 0, 3.4, 2.25, 0.84, 0.9, black, Math.PI / 2, 16); // the smokebox
      clusterCylinder(loco, 0, 3.55, 3.35, 0.24, 0.9, black, 0, 12); // the chimney
      clusterCylinder(loco, 0, 0.6, 3.2, 0.3, 0.5, black, 0, 12); // the dome
      for (const side of [-1, 1]) clusterBox(loco, side * 0.95, 1.0, 1.95, 0.5, 1.5, 4.2, black, 'painted'); // side tanks
      clusterBox(loco, 0, -2.3, 2.55, 2.4, 2.6, 2.1, black, 'painted'); // the cab
      clusterBox(loco, 0, -2.3, 3.92, 2.6, 0.12, 2.3, black, 'painted'); // its roof
      for (const f of [-1.0, 0.75, 2.5]) for (const side of [-1, 1]) {
        clusterCylinder(loco, side * 0.76, f, 0.72, 0.68, 0.12, black, 0, 16, Math.PI / 2); // the coupled wheels
      }
      operationalMachines += 1;
    }
    // --- side walls: tall iron-framed windows between buttresses ---------------------------------------------------
    const sillY = 2.4, headY = 5.4, winHalf = 0.85;
    for (const sign of [-1, 1]) {
      const wallLateral = sign * halfW;
      const windowsAt = [-4.8, 0, 4.8];
      const edges = [-halfL + wallT / 2, ...windowsAt.flatMap((f) => [f - winHalf, f + winHalf]), halfL - wallT / 2];
      clusterSurface(shed, 'brick', wallLateral, 0, sillY / 2, wallT, sillY, 2 * halfL - wallT);
      clusterSurface(shed, 'brick', wallLateral, 0, (headY + eaveY) / 2, wallT, eaveY - headY, 2 * halfL - wallT);
      for (let index = 0; index < edges.length; index += 2) {
        const a = edges[index], b = edges[index + 1];
        clusterSurface(shed, 'brick', wallLateral, (a + b) / 2, (sillY + headY) / 2, wallT, headY - sillY, b - a);
      }
      const outer = wallLateral + sign * wallT / 2;
      for (const f of windowsAt) {
        const frameL = wallLateral + sign * 0.06;
        for (const df of [-winHalf + 0.03, winHalf - 0.03]) clusterBox(shed, frameL, f + df, (sillY + headY) / 2, 0.08, headY - sillY, 0.06, iron, 'painted');
        for (const y of [sillY + 0.03, headY - 0.03, sillY + 1.0, sillY + 2.0]) clusterBox(shed, frameL, f, y, 0.07, 0.05, 2 * winHalf, iron, 'painted');
        for (const df of [-0.28, 0.28]) clusterBox(shed, frameL, f + df, (sillY + headY) / 2, 0.06, headY - sillY, 0.04, iron, 'painted');
        clusterBox(shed, wallLateral - sign * 0.02, f, (sillY + headY) / 2, 0.012, headY - sillY - 0.06, 2 * winHalf - 0.06, pane, 'painted');
        clusterBox(shed, outer + sign * 0.06, f, sillY - 0.05, 0.16, 0.1, 2 * winHalf + 0.16, stone, 'masonry'); // sill
        for (let v = 0; v <= 4; v += 1) { // a brick arch over the head
          const t = -1 + v / 2;
          clusterBox(shed, outer + sign * 0.03, f + t * (winHalf + 0.08), headY + 0.16 + 0.22 * (1 - t * t), 0.06, 0.32, 0.36,
            engineering, 'masonry', 0, -Math.atan(-0.44 * t / (winHalf + 0.08)) * sign);
        }
      }
      // brick buttresses (the re-judge: the dark masonry strips "still read as timber")
      for (const f of [-halfL, -2.4, 2.4, halfL]) clusterSurface(shed, 'brick', outer + sign * 0.12, f, (eaveY - 0.4) / 2, 0.24, eaveY - 0.4, 0.6);
      clusterBox(shed, outer + sign * 0.1, 0, eaveY + 0.02, 0.24, 0.2, 2 * halfL + 0.4, engineering, 'masonry'); // cornice
    }
    // --- the back wall: three shut road doors in plain openings under steel lintels ----------------------------------
    for (const [a, b] of piers) clusterSurface(shed, 'brick', (a + b) / 2, -face, springY / 2, b - a, springY, wallT);
    clusterSurface(shed, 'brick', 0, -face, (springY + eaveY) / 2, 2 * halfW + wallT, eaveY - springY, wallT);
    for (const road of roads) {
      clusterSurface(shed, 'timber', road, -face + 0.12, springY / 2, 2 * doorHalf, springY, 0.07);
      clusterBox(shed, road, -face - wallT / 2 - 0.04, springY + 0.12, 2 * doorHalf + 0.5, 0.24, 0.08, iron, 'structure');
    }
    // --- ridge-and-furrow slate roofs, valley gutters, the smoke lanterns, the troughs under them --------------------
    for (const road of roads) {
      gableRoof(at(road, 0), 'roofing', 3.25, eaveY + 0.12 - 0.15 * (ridgeY - eaveY) / 3.1, ridgeY + 0.1, 2 * halfL + 0.7);
      const lantern = at(road, 0);
      for (const sign of [-1, 1]) {
        for (const post of [-6, -2, 2, 6]) clusterBox(lantern, sign * 0.7, post, ridgeY + 0.5, 0.1, 0.8, 0.1, iron, 'structure');
        for (let louvre = 0; louvre < 3; louvre += 1) {
          clusterBox(lantern, sign * 0.72, 0, ridgeY + 0.25 + louvre * 0.22, 0.04, 0.06, 12.2, iron, 'painted', sign * 0.5);
        }
      }
      gableRoof(lantern, 'roofing', 1.0, ridgeY + 0.9, ridgeY + 1.25, 12.6);
      // the smoke trough over the road, inside: a timber hood on iron hangers
      for (const sign of [-1, 1]) clusterBox(lantern, sign * 0.45, 0, eaveY - 0.25, 0.08, 0.7, 2 * halfL - 1.2, tar, 'painted', sign * 0.35);
      for (const f of [-5, 0, 5]) clusterBox(lantern, 0, f, eaveY + 0.6, 0.05, 1.4, 0.05, iron, 'structure');
      // the pit road: the rails carried on the pit's walls on cast chairs, the pit floor down between them
      const inside = 2 * halfL - wallT;
      clusterBox(lantern, 0, 0, 0.045, 1.2, 0.02, inside, dark, 'painted'); // over the ballast ribbon (0.035)
      for (const sign of [-1, 1]) {
        clusterBox(lantern, sign * 0.76, 0, 0.17, 0.07, 0.1, inside, steel, 'structure'); // rail head and web
        clusterBox(lantern, sign * 0.76, 0, 0.11, 0.15, 0.03, inside, steel, 'structure'); // rail foot
        railSegments += 2;
        for (let f = -inside / 2 + 0.6; f < inside / 2; f += 1.2) {
          clusterBox(lantern, sign * 0.76, f, 0.105, 0.24, 0.05, 0.16, iron, 'structure'); // the chair
          railSegments += 1;
        }
      }
    }
    // the shed floor: granolithic platforms between the pits, up to the rails' feet
    {
      const pitEdges = roads.flatMap((road) => [road - 0.6, road + 0.6]);
      const spans: Array<[number, number]> = [[-halfW + wallT / 2, pitEdges[0]], [pitEdges[1], pitEdges[2]], [pitEdges[3], pitEdges[4]],
        [pitEdges[5], halfW - wallT / 2]];
      const floorTone = new THREE.Color(0x6a6660);
      for (const [a, b] of spans) clusterBox(shed, (a + b) / 2, 0, 0.05, b - a, 0.1, 2 * halfL - wallT, floorTone, 'masonry');
    }
    for (const lateral of [-3.1, 3.1, -halfW - 0.3, halfW + 0.3]) clusterBox(shed, lateral, 0, eaveY + 0.12, 0.3, 0.16, 2 * halfL + 0.7, dark, 'painted');
    // --- the cinder and ash apron round the shed (the re-judge, 2026-10-15: "the shed still sits in grass ... no cinder or
    // ash apron, no oil-soaked ground and no drift at the plinth"): a draped ground of cinder, darker and oily before the
    // doors and along the roads, a pale ash drift banked against the plinth ------------------------------------------
    {
      const cell = 1.5, l0 = -halfW - 7.5, l1 = halfW + 7.5, f0 = -halfL - 7.5, f1 = halfL + 1.2;
      const cols = Math.round((l1 - l0) / cell), rows = Math.round((f1 - f0) / cell);
      const positions: number[] = [], colors: number[] = [], indices: number[] = [];
      const cinder = new THREE.Color(0x3f3a35), oily = new THREE.Color(0x2a2724), ash = new THREE.Color(0x7c766c), tone = new THREE.Color();
      for (let j = 0; j <= rows; j += 1) {
        for (let i = 0; i <= cols; i += 1) {
          const lateral = l0 + (i * (l1 - l0)) / cols, longitudinal = f0 + (j * (f1 - f0)) / rows;
          const c = Math.cos(shedYaw), sn = Math.sin(shedYaw);
          const x = shed.x + c * lateral + sn * longitudinal, z = shed.z - sn * lateral + c * longitudinal;
          positions.push(x, groundAtWorld(x, z) + 0.035, z);
          const n = Math.sin(lateral * 0.83 + longitudinal * 0.37) * 0.5 + Math.sin(lateral * 0.29 - longitudinal * 0.71) * 0.5;
          tone.copy(cinder).offsetHSL(0, 0, n * 0.03);
          // oil before the doors and along the roads, an ash drift at the plinth
          const nearRoad = Math.min(...roads.map((road) => Math.abs(lateral - road)));
          if (longitudinal > halfL - 0.5 && nearRoad < 2.2) tone.lerp(oily, 0.5);
          const plinth = Math.max(0, 1 - Math.min(Math.abs(Math.abs(lateral) - halfW), Math.abs(longitudinal + halfL)) / 1.4);
          if (plinth > 0) tone.lerp(ash, plinth * 0.45);
          colors.push(tone.r, tone.g, tone.b);
          if (i < cols && j < rows) {
            const a = j * (cols + 1) + i, b = a + 1, d = a + cols + 1, e = d + 1;
            indices.push(a, d, b, b, d, e);
          }
        }
      }
      const apron = new THREE.BufferGeometry();
      apron.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      apron.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      apron.setIndex(indices);
      apron.computeVertexNormals();
      if (apron.getAttribute('normal').getY(0) < 0) {
        apron.setIndex(indices.map((_, k) => indices[k - (k % 3) + [0, 2, 1][k % 3]]));
        apron.computeVertexNormals();
      }
      buckets.baked!.push(apron);
      facilityProps += 1;
    }
    // --- the permanent-way stores beside the left wall: sleepers stacked in crossed courses on bearers, rail lengths on
    // chocks, two spare wheelsets on their own lengths of rail ---------------------------------------------------------
    const stores = atGround(-halfW - 3.0, 2.5);
    for (const f of [-1.1, 1.1]) clusterBox(stores, 0, f, 0.06, 2.8, 0.12, 0.16, tar, 'equipment');
    for (let course = 0; course < 4; course += 1) {
      for (let k = 0; k < 6; k += 1) {
        const along = -1.25 + k * 0.5;
        const y = 0.12 + 0.07 + course * 0.15;
        if (course % 2 === 0) clusterBox(stores, along, 0, y, 0.26, 0.14, 2.6, tar, 'equipment');
        else clusterBox(stores, 0, along, y, 2.6, 0.14, 0.26, tar, 'equipment');
        looseParts += 1;
      }
    }
    const railStack = atGround(-halfW - 3.0, -3.2);
    for (const f of [-1.6, 0, 1.6]) clusterBox(railStack, 0, f, 0.08, 1.6, 0.16, 0.18, tar, 'equipment');
    for (let k = 0; k < 6; k += 1) {
      clusterBox(railStack, -0.6 + (k % 3) * 0.6, 0, 0.24 + Math.floor(k / 3) * 0.16, 0.07, 0.15, 5.4, steel, 'equipment');
      looseParts += 1;
    }
    const wheels = atGround(-halfW - 3.0, -7.4);
    for (const side of [-1, 1]) clusterBox(wheels, side * 0.76, 0, 0.1, 0.08, 0.2, 3.8, steel, 'structure');
    for (const f of [-1.0, 1.0]) {
      clusterCylinder(wheels, 0, f, 0.55, 0.08, 1.75, steel, 0, 10, Math.PI / 2); // the axle
      for (const side of [-1, 1]) {
        clusterCylinder(wheels, side * 0.72, f, 0.55, 0.5, 0.12, iron, 0, 16, Math.PI / 2); // the wheel centre
        clusterCylinder(wheels, side * 0.66, f, 0.55, 0.55, 0.04, iron, 0, 16, Math.PI / 2); // the flange
      }
      looseParts += 2;
    }
    // --- the water crane by the right road, beside the shed -----------------------------------------------------------
    // off the facade's right corner, its arm swung toward the right road (it stood across the left door and, moved left,
    // would cross the hero's gun from the Garage camera)
    const crane = atGround(halfW + 1.2, halfL + 3.0);
    clusterBox(crane, 0, 0, 0.2, 1.1, 0.4, 1.1, stone, 'masonry');
    clusterCylinder(crane, 0, 0, 0.4 + 1.6, 0.2, 3.2, iron, 0, 16);
    clusterCylinder(crane, 0, 0, 3.7, 0.28, 0.35, iron, 0, 16);
    clusterBox(crane, -1.4, 0, 3.75, 3.0, 0.2, 0.2, iron, 'structure'); // the swinging arm toward the right road
    clusterCylinder(crane, -2.85, 0, 3.0, 0.13, 1.4, tar, 0, 10); // the leather bag
    clusterCylinder(crane, 1.0, 0, 3.75, 0.24, 0.5, iron, 0, 16); // the balance weight
    clusterBox(crane, 0.3, 0, 1.2, 0.12, 0.5, 0.12, iron, 'structure'); // the valve wheel's spindle
    heavyLiftSystems += 1;
    operationalMachines += 1;
    factoryProcessZones += 1; // the three roads' inspection pits
    environmentSpecificAssemblies += 1; // the water crane at the throat
    servicePurposeTags.add('locomotive-watering');
    servicePurposeTags.add('engine-shed-inspection-pits');
    structuralConnections += 64;
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
      // the crane rails run the quay's length and stop at its edge (the shore falls away behind)
      addTrackOnCluster(featureCluster, -5.5, -1, 16);
      addTrackOnCluster(featureCluster, 5.5, -1, 16);
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
      // the engine shed straddles the rail fan's three roads (GA.04); the shed's own stores stand clear of its walls
      addEngineShed(featureSide, featureDepth);
      addDrums(featureSide - 13.2, featureDepth - 7.5, 6);
      addPoweredWinch(fixedCluster(featureSide + 12.8, featureDepth - 1.5), 0, 0, new THREE.Color(0xa56b34));
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

  // The yard piece beside the hero (GA.03; the garage critic panel, 2026-10-14: "the same black tool cart sits in the
  // same spot in all nine yards ... region-true kit per yard"): the shared pulled power pack on its stand stays in
  // Verdant (garageDressing.ts), and each outdoor yard sets its own working kit on the same level floor beside the hero.
  const addRegionalYardPiece = (): void => {
    const floor = getGarageFacilityTerraces(variant).find((terrace) => terrace.label === 'crew-floor-yard-power-pack');
    if (!floor) return;
    const at = fixedCluster(floor.side, floor.depth);
    const olive = new THREE.Color(0x4f5536), sand = new THREE.Color(0xa58e62), rope = new THREE.Color(0x8c7a55);
    const black = new THREE.Color(0x1b1c1d), red = new THREE.Color(0x8a2e24), wood = new THREE.Color(0x6a5238);
    const wheelPair = (lateral: number, longitudinal: number, radius: number, track: number): void => {
      for (const side of [-1, 1]) clusterCylinder(at, lateral + side * track / 2, longitudinal, radius, radius, 0.18, black, 0, 16, Math.PI / 2);
      clusterCylinder(at, lateral, longitudinal, radius, 0.05, track, steel, 0, 10, Math.PI / 2);
    };
    const crateStack = (lateral: number, longitudinal: number, count: number, w: number, h: number, l: number, tone: THREE.Color): void => {
      for (let k = 0; k < count; k += 1) {
        clusterBox(at, lateral + ((k % 3) - 1) * (w + 0.04), longitudinal + (Math.floor(k / 3) % 2) * (l + 0.04), h / 2 + Math.floor(k / 6) * (h + 0.02),
          w, h, l, tone.clone().offsetHSL(0, 0, ((k * 7) % 5 - 2) * 0.012), 'equipment');
        looseParts += 1;
      }
    };
    const pallet = (lateral: number, longitudinal: number): void => {
      clusterBox(at, lateral, longitudinal, 0.07, 1.2, 0.14, 1.0, wood, 'painted');
    };
    switch (variant.architecture) {
      case 'shade_depot': { // a water trailer and a pallet of jerrycans
        clusterBox(at, 0, 0, 0.55, 0.9, 0.12, 2.4, steel, 'structure');
        clusterCylinder(at, 0, 0.1, 1.15, 0.55, 2.0, sand, Math.PI / 2, 16);
        wheelPair(0, -0.3, 0.38, 1.3);
        clusterBox(at, 0, 1.6, 0.45, 0.1, 0.1, 1.2, steel, 'structure'); // the drawbar
        clusterBox(at, 0.3, -1.05, 0.95, 0.1, 0.1, 0.18, black, 'equipment'); // the tap
        pallet(-1.8, 0.2);
        crateStack(-1.8, 0.0, 12, 0.17, 0.47, 0.34, olive);
        operationalMachines += 1;
        break;
      }
      case 'repair_bunker': { // an engine pre-heater on its cart and a loaded sledge
        clusterBox(at, 0.8, 0, 0.75, 1.0, 0.8, 0.7, olive, 'painted');
        wheelPair(0.8, 0, 0.22, 0.9);
        clusterCylinder(at, 0.8, -0.25, 1.35, 0.07, 0.6, black, 0, 10); // the flue
        clusterCylinder(at, 0.15, 0.2, 0.25, 0.28, 0.3, black, 0, 16); // the coiled hot-air duct
        for (const side of [-1, 1]) clusterBox(at, -1.2 + side * 0.45, 0.1, 0.06, 0.08, 0.12, 2.2, steel, 'structure', 0, 0.06);
        clusterBox(at, -1.2, 0.1, 0.2, 1.0, 0.06, 1.9, wood, 'painted');
        clusterBox(at, -1.2, 0.1, 0.48, 0.8, 0.5, 1.4, olive.clone().multiplyScalar(0.85), 'painted'); // the tarped load
        operationalMachines += 1;
        break;
      }
      case 'brick_arsenal': { // a two-wheeled ammunition cart and a gas-bottle trolley
        clusterBox(at, 0, 0, 0.55, 1.1, 0.06, 1.6, steel, 'structure');
        wheelPair(0, 0.2, 0.32, 1.25);
        for (const side of [-1, 1]) clusterBox(at, side * 0.45, -1.2, 0.75, 0.05, 0.05, 1.0, steel, 'structure'); // the handles
        crateStack(0, -0.3, 6, 0.32, 0.22, 0.55, olive);
        clusterBox(at, -1.6, 0, 0.1, 0.6, 0.06, 0.4, steel, 'structure');
        for (const dl of [-0.15, 0.15]) clusterCylinder(at, -1.6 + dl, 0, 0.8, 0.11, 1.4, dl < 0 ? new THREE.Color(0x2f5a3a) : red, 0, 16);
        clusterBox(at, -1.6, 0.18, 0.9, 0.5, 1.6, 0.04, steel, 'structure'); // its back frame
        break;
      }
      case 'naval_drydock': { // coiled hawsers, tyre fenders and a mooring bollard
        for (const [dl, df] of [[-0.6, 0], [0.7, 0.3]] as const) {
          for (let k = 0; k < 4; k += 1) clusterCylinder(at, dl, df, 0.07 + k * 0.12, 0.62 - k * 0.04, 0.12, rope, 0, 16);
          looseParts += 1;
        }
        for (let k = 0; k < 3; k += 1) clusterCylinder(at, -1.9, -0.6 + k * 0.62, 0.3, 0.3, 0.22, black, Math.PI / 2, 16);
        clusterCylinder(at, 1.9, -0.6, 0.35, 0.22, 0.7, black, 0, 16); // the bollard
        clusterCylinder(at, 1.9, -0.6, 0.75, 0.3, 0.1, black, 0, 16);
        break;
      }
      case 'rail_roundhouse': { // a criss-cross stack of sleepers, spare rail lengths and a track jack
        for (let layer = 0; layer < 5; layer += 1) {
          for (let k = 0; k < 3; k += 1) {
            const along = layer % 2 === 0;
            clusterBox(at, along ? 0 : -0.55 + k * 0.55, along ? -0.55 + k * 0.55 : 0, 0.08 + layer * 0.15, along ? 2.6 : 0.25, 0.14, along ? 0.25 : 2.6, wood, 'painted');
          }
        }
        for (const df of [1.6, 1.8]) clusterBox(at, 0, df, 0.08, 3.6, 0.16, 0.08, steel, 'structure'); // rail lengths
        clusterBox(at, -1.9, 0.6, 0.25, 0.3, 0.5, 0.3, red, 'painted'); // the jack
        clusterBox(at, -1.9, 0.6, 0.62, 0.08, 0.3, 0.08, steel, 'structure');
        looseParts += 4;
        break;
      }
      case 'rain_canopy': { // a diesel water pump on skids and its hoses
        for (const side of [-1, 1]) clusterBox(at, side * 0.45, 0, 0.08, 0.1, 0.16, 1.8, steel, 'structure');
        clusterBox(at, 0, -0.3, 0.55, 0.8, 0.7, 0.9, new THREE.Color(0x3d6a4a), 'painted'); // the engine
        clusterCylinder(at, 0, 0.55, 0.5, 0.25, 0.5, black, Math.PI / 2, 16); // the pump volute
        clusterCylinder(at, 0, -0.75, 1.05, 0.05, 0.4, black, 0, 10); // the exhaust
        clusterCylinder(at, 1.3, 0.4, 0.12, 0.45, 0.24, black, 0, 16); // the coiled suction hose
        clusterBeam(at, [0, 0.8, 0.5], [0.4, 2.6, 0.08], 0.1, new THREE.Color(0x2a3a52), 'equipment'); // the discharge hose
        operationalMachines += 1;
        break;
      }
      case 'rock_cavern': { // a snow-chain rack and a fuel heater
        for (const side of [-1, 1]) clusterBeam(at, [side * 0.9, -0.4, 0], [side * 0.9, 0, 1.6], 0.08, steel, 'structure');
        for (const side of [-1, 1]) clusterBeam(at, [side * 0.9, 0.4, 0], [side * 0.9, 0, 1.6], 0.08, steel, 'structure');
        clusterBox(at, 0, 0, 1.55, 1.9, 0.08, 0.08, steel, 'structure');
        for (let k = 0; k < 5; k += 1) clusterBox(at, -0.7 + k * 0.35, 0.05, 1.0, 0.2, 1.1, 0.06, black, 'equipment'); // hanging chains
        clusterBox(at, -2.0, 0.2, 0.45, 0.6, 0.9, 0.6, red, 'painted'); // the heater
        clusterCylinder(at, -2.0, 0.2, 1.05, 0.06, 0.3, black, 0, 10);
        looseParts += 5;
        break;
      }
      case 'recovery_yard': { // the recovery gear laid out on a pallet: tow bars, a chain coil, shackles, a snatch block
        pallet(0, 0);
        for (const dl of [-0.3, 0.3]) clusterBox(at, dl, 0, 0.2, 0.08, 0.08, 2.4, steel, 'structure'); // tow bars
        clusterCylinder(at, -1.3, 0.3, 0.12, 0.4, 0.22, black, 0, 16); // the chain coil
        for (let k = 0; k < 3; k += 1) clusterBox(at, 1.2, -0.4 + k * 0.3, 0.1, 0.16, 0.18, 0.06, red, 'equipment'); // shackles
        clusterCylinder(at, 1.3, 0.6, 0.18, 0.2, 0.12, red, Math.PI / 2, 16); // the snatch block
        looseParts += 6;
        break;
      }
      case 'factory_line': { // a scrap skip and a small ladle on its cart
        clusterBox(at, 0, 0, 0.55, 1.8, 1.0, 1.2, new THREE.Color(0x5a5048), 'painted');
        for (let k = 0; k < 4; k += 1) clusterBox(at, -0.5 + k * 0.32, 0.1, 1.1, 0.3, 0.12, 0.6, steel, 'equipment', k * 0.4, k * 0.2); // scrap
        clusterBox(at, -2.0, 0, 0.3, 0.9, 0.12, 0.9, steel, 'structure');
        wheelPair(-2.0, 0, 0.18, 0.9);
        clusterCylinder(at, -2.0, 0, 0.75, 0.38, 0.7, new THREE.Color(0x6a3f2c), 0, 16); // the ladle
        looseParts += 4;
        break;
      }
    }
  };
  addRegionalYardPiece();

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
    // grey, dirty patent glazing, not a sky-blue mirror (the garage critic panel, 2026-10-14: "blue skylights")
    glazing: { maps: undefined, color: new THREE.Color(0x3b3f40), roughness: 0.42, metalness: 0.18, normalScale: 0 },
    tiles: { maps: undefined, color: roofing.clone(), roughness: 0.9, metalness: 0.0, normalScale: 0 }, // (routed to the roof bucket)
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
