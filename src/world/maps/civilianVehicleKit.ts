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
// Collision, exactly as before: a role's obstacle is refitted to the contact band its LEGACY geometry produced
// (civilianVehicleLegacy.ts, carried on the destructible meta as `contactBand`), and each builder spends exactly the
// draws the legacy builder spent from the destructible stream, so every later pool builds from the same stream; every
// map's dedicated shard stays byte-identical. A model larger than its role's box is scaled down into it; a canvas tilt
// or box rises over the record's height (the record keeps it). Local +Z is the nose, the footprint is XZ-centred and
// the lowest tyre point is y = 0.

import * as THREE from 'three';
import { VehicleMesh, linearHex, vehicleWeathering } from './vehicleMesh.ts';
import { buildModel, modelWheels } from './vehicleBodies.ts';
import {
  DEFAULT_FLEET, FLEETS, climateForMap, fleetForMap, type CivilianRole, type Fleet, type FleetEntry, type VehicleClimate,
} from './vehicleFleets.ts';
import { LEGACY_CONTACT_BANDS, LEGACY_DRAWS } from './civilianVehicleLegacy.ts';
import type { StructureCollisionRuntimeBand } from '../structureCollision.ts';

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

/** The roles' placement boxes (props / inhabitKit DESTRUCTIBLE_TYPES hw, hl, h), unchanged since the legacy kit. */
const ROLE_BOXES: Readonly<Record<CivilianVehicleKind, RoleBox>> = {
  truck: { lane: 'heavy', halfWidth: 1.29, halfLength: 3.30, height: 2.30, rise: 1.05, triangleBudget: 9000 },
  jeep: { lane: 'light', halfWidth: 0.94, halfLength: 1.88, height: 1.73, rise: 0.35, triangleBudget: 7000 },
  sedan: { lane: 'light', halfWidth: 1.01, halfLength: 2.13, height: 1.61, rise: 0.2, triangleBudget: 8500 },
  wagon: { lane: 'light', halfWidth: 1.01, halfLength: 2.13, height: 1.69, rise: 0.2, triangleBudget: 8500 },
  pickup: { lane: 'light', halfWidth: 1.11, halfLength: 2.47, height: 1.77, rise: 0.2, triangleBudget: 8500 },
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
function fitToRole(geometry: THREE.BufferGeometry, box: RoleBox): void {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox!;
  const sx = box.halfWidth / Math.max(1e-6, Math.max(-b.min.x, b.max.x));
  const sz = box.halfLength / Math.max(1e-6, Math.max(-b.min.z, b.max.z));
  const sy = (box.height + box.rise) / Math.max(1e-6, b.max.y - b.min.y);
  const s = Math.min(1, sx, sz, sy);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const lift = -b.min.y;
  for (let i = 0; i < position.count; i++) {
    position.setXYZ(i, position.getX(i) * s, (position.getY(i) + lift) * s, position.getZ(i) * s);
  }
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
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
  return geometry;
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

function roleBuilders(role: CivilianVehicleKind, ctx: BuildContext): { build: Builder; broken: Builder } {
  const entry = ctx.fleet.roles[role];
  return {
    build: spending(LEGACY_DRAWS[role].build, (seed) => buildRole(entry, role, ctx, false, seed)),
    broken: spending(LEGACY_DRAWS[role].broken, (seed) => buildRole(entry, role, ctx, true, seed)),
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
  return { ...box, build, broken, contactBand: LEGACY_CONTACT_BANDS[role] as StructureCollisionRuntimeBand };
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
} satisfies Record<CivilianVehicleKind, RoleBox & { build: Builder; broken: Builder; contactBand: StructureCollisionRuntimeBand }>;

export interface CivilianVehicleOverride {
  build: Builder;
  broken: Builder;
  instancePaint: (out: THREE.Color, x: number, z: number, slot: number) => void;
}

/**
 * One map's vehicles: each role's builders from the map's fleet and soil, and its copies' liveries. `mobile` builds
 * the coarse tier (collision never depends on it: the contact band is the legacy one on every tier).
 */
export function civilianVehicleOverrides(mapId: string, mobile: boolean): Record<CivilianVehicleKind, CivilianVehicleOverride> {
  const ctx: BuildContext = { fleet: fleetForMap(mapId), climate: climateForMap(mapId), coarse: mobile };
  let salt = 0;
  for (let i = 0; i < mapId.length; i++) salt = (Math.imul(salt, 31) + mapId.charCodeAt(i)) | 0;
  const out = {} as Record<CivilianVehicleKind, CivilianVehicleOverride>;
  for (const role of Object.keys(ROLE_BOXES) as CivilianVehicleKind[]) {
    out[role] = { ...roleBuilders(role, ctx), instancePaint: paintPicker(ctx.fleet.roles[role], salt + role.length * 101) };
  }
  return out;
}

/** The ground patch a role's contact shadow covers (its box, a little in from the corners). */
export function vehicleContactFootprint(kind: string): { hw: number; hl: number } | null {
  const box = (ROLE_BOXES as Record<string, RoleBox | undefined>)[kind];
  return box ? { hw: box.halfWidth * 0.92 + 0.15, hl: box.halfLength * 0.94 + 0.2 } : null;
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
