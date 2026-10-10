// Civilian and utility vehicles for battlefield dressing (the map-vehicles lane's rebuild, 2026-10-05).
//
// props.ts places eight vehicle roles (destructibles: a sedan, a wagon, a van, a pickup, a jeep, a tilt truck, a box
// truck and a flatbed) and renders every copy of a role in one instanced draw. The roles, their placement boxes,
// their collision and their place in the destructible stream are the battlefield's and do not move; what a role IS
// comes from the map's fleet (vehicleFleets.ts: real types of the map's place and year, built by the coachbuilder in
// vehicleBodies.ts / vehicleCoachwork.ts), each copy wearing its own livery through the vehicle material's paint
// mask (vehicleSurface.ts). The burnt state is the same vehicle burnt out: char and oxide, the glass gone, the tyres
// burnt to the rims and the body settled on them.
//
// Collision follows the vehicle each map really parks (2026-10-05, approved with the coordinator): a role's footprint
// (hw, hl) is its model's visible half extents and its obstacle refits to the contact band the model's own solids bear
// on the ground, both taken from the coarse build fitted as every tier fits it, so desktop and mobile collide
// identically (roleFootprint). The legacy kit's one generous box per role left 0.2-1.1 m of collision outside most
// real vehicles. Each builder still spends exactly the draws the legacy builder spent from the destructible stream, so
// every later pool builds from the same stream and no vehicle moves. A model larger than its role's box is scaled down
// into it. Local +Z is the nose, the footprint is XZ-centred and the lowest tyre point is y = 0.

import * as THREE from 'three';
import { VehicleMesh, linearHex, vehicleWeathering } from './vehicleMesh.ts';
import { keepStreams } from '../geometryStreams.ts';
import { buildModel, modelWheels } from './vehicleBodies.ts';
import {
  DEFAULT_FLEET, FLEETS, climateForMap, fleetForMap, type CivilianRole, type Fleet, type FleetEntry, type VehicleClimate,
} from './vehicleFleets.ts';
import { LEGACY_DRAWS } from './civilianVehicleLegacy.ts';
import { deriveRuntimeStructureContactBand, type StructureCollisionRuntimeBand } from '../structureCollision.ts';

type Rng = () => number;
type Builder = (rng: Rng) => THREE.BufferGeometry;

type CivilianVehicleKind = CivilianRole;
type CivilianVehicleLane = 'heavy' | 'light';

interface RoleBox {
  lane: CivilianVehicleLane;
  halfWidth: number;
  halfLength: number;
  /** The collision record's height. */
  height: number;
  /** How far a body may rise over it (a canvas tilt, a box van, a forward-control cab): shells pass that part. */
  rise: number;
  /** Instanced triangles allowed for one copy (desktop). */
  triangleBudget: number;
}

/** The roles' largest boxes (the legacy kit's placement boxes): a model is scaled down into its role's; its own
 * footprint (roleFootprint) is what collides. */
const ROLE_BOXES: Readonly<Record<CivilianVehicleKind, RoleBox>> = {
  truck: { lane: 'heavy', halfWidth: 1.29, halfLength: 3.30, height: 2.30, rise: 1.05, triangleBudget: 9000 },
  jeep: { lane: 'light', halfWidth: 0.94, halfLength: 1.88, height: 1.73, rise: 0.35, triangleBudget: 7000 },
  sedan: { lane: 'light', halfWidth: 1.01, halfLength: 2.13, height: 1.61, rise: 0.2, triangleBudget: 8500 },
  wagon: { lane: 'light', halfWidth: 1.01, halfLength: 2.13, height: 1.69, rise: 0.2, triangleBudget: 8500 },
  pickup: { lane: 'light', halfWidth: 1.11, halfLength: 2.47, height: 1.77, rise: 0.3, triangleBudget: 8500 },
  van: { lane: 'light', halfWidth: 1.11, halfLength: 2.38, height: 2.08, rise: 0.25, triangleBudget: 8500 },
  truckbox: { lane: 'heavy', halfWidth: 1.29, halfLength: 3.30, height: 2.47, rise: 0.85, triangleBudget: 9000 },
  truckflatbed: { lane: 'heavy', halfWidth: 1.29, halfLength: 3.30, height: 1.96, rise: 1.1, triangleBudget: 9000 },
};

interface BuildContext {
  fleet: Fleet;
  climate: VehicleClimate;
  /** Mobile tier: the coarse sections, no voxel occlusion, no fine hardware. */
  coarse: boolean;
}

/** Scale a built body into its role's box (a uniform scale about the centre, never up) and seat its tyres on y = 0. */
/** Scale a model into its role's box, by its footprint only (the tiers differ in height, a roof rack or a load, never
 * in plan: their fits agree), and set its lowest tyre point on y = 0. */
function fitToRole(geometry: THREE.BufferGeometry, box: RoleBox): void {
  geometry.computeBoundingBox();
  const b = (geometry.userData.bodyBox as THREE.Box3 | undefined) ?? geometry.boundingBox!;
  const sx = box.halfWidth / Math.max(1e-6, Math.max(-b.min.x, b.max.x));
  const sz = box.halfLength / Math.max(1e-6, Math.max(-b.min.z, b.max.z));
  const s = Math.min(1, sx, sz), lift = -geometry.boundingBox!.min.y;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(i, position.getX(i) * s, (position.getY(i) + lift) * s, position.getZ(i) * s);
  }
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const body = geometry.userData.bodyBox as THREE.Box3 | undefined;
  if (body) { body.min.set(body.min.x * s, (body.min.y + lift) * s, body.min.z * s); body.max.set(body.max.x * s, (body.max.y + lift) * s, body.max.z * s); }
}

/** One role's geometry on a fleet: intact or burnt out. */
function buildRole(entry: FleetEntry, role: CivilianVehicleKind, ctx: BuildContext, burnt: boolean, seed: number): THREE.BufferGeometry {
  const mesh = new VehicleMesh();
  mesh.coarse = ctx.coarse;
  buildModel(mesh, entry.model, { coarse: ctx.coarse, burnt });
  const geometry = mesh.build(vehicleWeathering({
    dirtRgb: linearHex(ctx.climate.dirt), dirt: ctx.climate.dirtAmount,
    dustRgb: linearHex(ctx.climate.dust), dust: ctx.climate.dustAmount,
    rust: ctx.fleet.age, burnt, wheels: modelWheels(entry.model), seed, voxelAo: !ctx.coarse,
  }));
  fitToRole(geometry, ROLE_BOXES[role]);
  delete geometry.userData.outboard;
  return geometry;
}

/**
 * A role's canonical solid: the coarse build of its model, positions only, fitted into the role's box. Every tier
 * fits a model by the same rule and the tiers share the footprint (the coarse build keeps the body, the mirrors and the
 * wheels), so this is where the role's collision comes from on desktop and mobile alike, and it is the shadow passes'
 * stand-in for the full body on desktop: about two fifths of its triangles (props.ts: one shadow-only instanced mesh on
 * the pool's matrices).
 */
function canonicalSolid(entry: FleetEntry, role: CivilianVehicleKind): THREE.BufferGeometry {
  const mesh = new VehicleMesh();
  mesh.coarse = true;
  buildModel(mesh, entry.model, { coarse: true, burnt: false });
  // positions only, on a fresh geometry (keepStreams: never deleteAttribute on a geometry the renderer draws)
  const geometry = keepStreams(mesh.build(vehicleWeathering({ wheels: modelWheels(entry.model), seed: 1, voxelAo: false })), ['position']);
  // the mirrors and the surface dressing neither collide nor cast: their triangles leave the solid
  const skip = geometry.userData.noCollisionVertices as Uint8Array | undefined;
  if (skip) {
    const index = geometry.index!.array, kept: number[] = [];
    for (let t = 0; t < index.length; t += 3) {
      if (!(skip[index[t]] && skip[index[t + 1]] && skip[index[t + 2]])) kept.push(index[t], index[t + 1], index[t + 2]);
    }
    geometry.setIndex(kept);
  }
  delete geometry.userData.outboard;
  delete geometry.userData.noCollisionVertices;
  fitToRole(geometry, ROLE_BOXES[role]);
  return geometry;
}

/** A role's collision on a fleet: its visible half extents and the contact band of its solids. */
export interface VehicleFootprint { hw: number; hl: number; contactBand: StructureCollisionRuntimeBand }
const FOOTPRINTS = new Map<string, VehicleFootprint>();
const mm = (v: number) => Math.round(v * 1000) / 1000;

/** The footprint a fleet's role collides with (once per fleet and role in a session: maps share fleets). */
function roleFootprint(fleet: Fleet, role: CivilianVehicleKind): VehicleFootprint {
  const key = `${fleet.id}/${role}`;
  const known = FOOTPRINTS.get(key);
  if (known) return known;
  const solid = canonicalSolid(fleet.roles[role], role);
  const b = solid.userData.bodyBox as THREE.Box3;
  const footprint = {
    hw: mm(Math.max(-b.min.x, b.max.x)), hl: mm(Math.max(-b.min.z, b.max.z)),
    contactBand: deriveRuntimeStructureContactBand({ baked: [solid] }),
  };
  solid.dispose();
  FOOTPRINTS.set(key, footprint);
  return footprint;
}

/**
 * A builder that spends exactly `draws` values of the destructible stream (the legacy builder's count) and builds
 * from a seed taken from the first: the pools built after it read the stream where they always did.
 */
function spending(draws: number, make: (seed: number) => THREE.BufferGeometry): Builder {
  return (rng: Rng) => {
    let seed = 0x5eed;
    if (draws > 0) {
      seed = Math.floor(rng() * 0x7fffffff);
      for (let k = 1; k < draws; k++) rng();
    }
    return make(seed);
  };
}

function roleBuilders(role: CivilianVehicleKind, ctx: BuildContext): Pick<CivilianVehicleOverride, 'build' | 'broken' | 'shadowBuild'> {
  const entry = ctx.fleet.roles[role];
  return {
    build: spending(LEGACY_DRAWS[role].build, (seed) => buildRole(entry, role, ctx, false, seed)),
    broken: spending(LEGACY_DRAWS[role].broken, (seed) => buildRole(entry, role, ctx, true, seed)),
    // the mobile tier's body is already the coarse one: it casts itself
    ...(ctx.coarse ? {} : { shadowBuild: () => canonicalSolid(entry, role) }),
  };
}

function hash01(x: number, z: number, salt: number): number {
  let h = Math.imul(Math.round(x * 16) | 0, 0x9e3779b1) ^ Math.imul(Math.round(z * 16) | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Each copy's livery: one of the role's paints by its place on the map, a little faded or fresh. */
function paintPicker(entry: FleetEntry, salt: number): (out: THREE.Color, x: number, z: number, slot: number) => void {
  const colours = entry.paints.map((hex) => new THREE.Color(hex));
  return (out, x, z, slot) => {
    const pick = hash01(x, z, salt + slot * 7);
    out.copy(colours[Math.min(colours.length - 1, Math.floor(pick * colours.length))]);
    out.multiplyScalar(0.88 + 0.16 * hash01(z, x, salt + 13));
  };
}

const DEFAULT_CONTEXT: BuildContext = { fleet: FLEETS[DEFAULT_FLEET], climate: climateForMap(''), coarse: false };

function receipt(role: CivilianVehicleKind) {
  const box = ROLE_BOXES[role];
  const { build, broken } = roleBuilders(role, DEFAULT_CONTEXT);
  return { ...box, build, broken, footprint: () => roleFootprint(DEFAULT_CONTEXT.fleet, role) };
}

/** The roles with the default fleet's builders (the destructible table's own entries; each map overrides them). */
export const CIVILIAN_VEHICLE_RECEIPTS = {
  truck: receipt('truck'),
  jeep: receipt('jeep'),
  sedan: receipt('sedan'),
  wagon: receipt('wagon'),
  pickup: receipt('pickup'),
  van: receipt('van'),
  truckbox: receipt('truckbox'),
  truckflatbed: receipt('truckflatbed'),
} satisfies Record<CivilianVehicleKind, RoleBox & { build: Builder; broken: Builder; footprint: () => VehicleFootprint }>;

export interface CivilianVehicleOverride {
  build: Builder;
  broken: Builder;
  instancePaint: (out: THREE.Color, x: number, z: number, slot: number) => void;
  /** Desktop tiers: the shadow caster that stands in for the full body in the shadow passes (no stream draws). */
  shadowBuild?: () => THREE.BufferGeometry;
  /** The role's footprint and contact band on this map's fleet (the same on every tier). */
  hw: number;
  hl: number;
  contactBand: StructureCollisionRuntimeBand;
}

/**
 * One map's vehicles: each role's builders from the map's fleet and soil, its copies' liveries and its collision.
 * `mobile` builds the coarse tier (collision never depends on it: roleFootprint is the same on every tier).
 */
export function civilianVehicleOverrides(mapId: string, mobile: boolean): Record<CivilianVehicleKind, CivilianVehicleOverride> {
  const ctx: BuildContext = { fleet: fleetForMap(mapId), climate: climateForMap(mapId), coarse: mobile };
  let salt = 0;
  for (let i = 0; i < mapId.length; i++) salt = (Math.imul(salt, 31) + mapId.charCodeAt(i)) | 0;
  const out = {} as Record<CivilianVehicleKind, CivilianVehicleOverride>;
  for (const role of Object.keys(ROLE_BOXES) as CivilianVehicleKind[]) {
    out[role] = {
      ...roleBuilders(role, ctx), ...roleFootprint(ctx.fleet, role),
      instancePaint: paintPicker(ctx.fleet.roles[role], salt + role.length * 101),
    };
  }
  return out;
}

/** The ground patch a vehicle's contact shadow covers: its footprint, a little in from the corners and out round it. */
export function vehicleContactPatch(hw: number, hl: number): { hw: number; hl: number } {
  return { hw: hw * 0.92 + 0.15, hl: hl * 0.94 + 0.2 };
}

// ---------------------------------------------------------------------------------------------------- placement

const INDUSTRIAL_HEAVY: readonly CivilianVehicleKind[] = ['truckbox', 'truckflatbed', 'truck'];
const RURAL_HEAVY: readonly CivilianVehicleKind[] = ['truckflatbed', 'truck', 'truckbox'];
const DRY_HEAVY: readonly CivilianVehicleKind[] = ['truck', 'truckflatbed', 'truckbox'];
// Every battlefield receives the full light-vehicle vocabulary. The order is
// map-flavoured (not a reduced palette), so industrial maps lead with delivery
// traffic while rural/dry maps lead with wagons or utility vehicles.
const INDUSTRIAL_LIGHT: readonly CivilianVehicleKind[] = ['sedan', 'van', 'pickup', 'wagon', 'jeep'];
const RURAL_LIGHT: readonly CivilianVehicleKind[] = ['wagon', 'pickup', 'jeep', 'sedan', 'van'];
const DRY_LIGHT: readonly CivilianVehicleKind[] = ['pickup', 'jeep', 'van', 'wagon', 'sedan'];

const INDUSTRIAL_MAPS = new Set(['urban', 'railyard', 'foundry', 'caldera', 'blackglass', 'skybridge']);
const DRY_MAPS = new Set(['desert', 'badlands', 'frontier', 'titanGorge']);

const MIN_VISIBLE_VEHICLES_PER_LANE = Object.freeze({
  heavy: 6,
  light: 10,
} satisfies Record<CivilianVehicleLane, number>);

export const CIVILIAN_VEHICLE_CLUSTER_COUNT = 2;
export const CIVILIAN_VEHICLES_PER_CLUSTER = 4;

export function visibleCivilianVehicleCount(
  authoredCount: number | undefined,
  lane: CivilianVehicleLane,
): number {
  return Math.max(MIN_VISIBLE_VEHICLES_PER_LANE[lane], Math.max(0, Math.floor(authoredCount ?? 0)));
}

export function civilianVehiclePalette(
  mapId: string,
  lane: CivilianVehicleLane,
): readonly CivilianVehicleKind[] {
  const industrial = INDUSTRIAL_MAPS.has(mapId);
  const dry = DRY_MAPS.has(mapId);
  return lane === 'heavy'
    ? industrial ? INDUSTRIAL_HEAVY : dry ? DRY_HEAVY : RURAL_HEAVY
    : industrial ? INDUSTRIAL_LIGHT : dry ? DRY_LIGHT : RURAL_LIGHT;
}

/** Deterministic map-flavored selection across the lane's complete palette. */
export function pickCivilianVehicleKind(
  mapId: string,
  lane: CivilianVehicleLane,
  roll: number,
): CivilianVehicleKind {
  const choices = civilianVehiclePalette(mapId, lane);
  return choices[Math.min(choices.length - 1, Math.floor(Math.max(0, Math.min(0.999999, roll)) * choices.length))];
}

/**
 * Placement selector that guarantees the complete lane palette is visible
 * before seeded repeats begin. This keeps the newer vehicle families from
 * disappearing merely because the first few random rolls repeat one model.
 */
export function pickCivilianVehicleKindForPlacement(
  mapId: string,
  lane: CivilianVehicleLane,
  index: number,
  roll: number,
): CivilianVehicleKind {
  const choices = civilianVehiclePalette(mapId, lane);
  const visibleRoll = index >= 0 && index < choices.length
    ? (index + 0.5) / choices.length : roll;
  return pickCivilianVehicleKind(mapId, lane, visibleRoll);
}
