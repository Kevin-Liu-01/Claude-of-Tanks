// src/world/maps/strandWrack.ts — round 56 (2026-09-24, owner decision 21 of 2026-09-23, "coastal apron debris
// specks"): the wrack line and debris of a sea strand, derived from the lake's authored contour.
//
// A sea lake that authors a shelf (LakeConfig.shelfM — Saltmere Bay, Nordhavn Fjord, Saltwind Narrows) has a strand
// between its waterline and the dry ground. This module reads that strand from the same laws the terrain uses — the
// water mask for the water's edge, the baked union wetness for the sand's end (the shader's seaSand term is
// smoothstep(0.02, seaRamp.x, wetness)) — and lays the high-water mark along it: a wavy band of weed and kelp mats
// with driftwood, pebble patches and shells, thinning and thickening along the shore, and a few larger pieces
// (timber, a broken crate, a rope coil) beside each landing. Every piece is soft dressing in the existing material
// buckets (vertex-coloured `baked`, textured `wood`): no new material, draw call, collision record or instance pool.
// Nothing is hand-placed; the pieces follow the contour, the marched band, the map's roads, spawn pads, boats, jetties
// and building footprints. Deterministic: one seeded draw sequence, no wall clock.
//
// Round 67 (2026-09-24): a per-station draw budget. Every station and every landing piece draws from its own stream,
// keyed by one salt the map's stream hands each lake and by the station's index, so a keep-out that moves (a jetty
// re-planned, a boat hauled up) changes only the stations it touches and every other station lays the bytes it laid
// — before, the pieces' draws followed admission on the shared stream and the whole line past a landing re-rolled.

import * as THREE from 'three';
import { box, jitterUV } from '../propGeometry.ts';
import { planGroundedObbPose, planGroundedSegment } from '../propPlacement.ts';
import { shorelinePhases, shorelineRadiusAt, shorelineWetness, type ShorelineDisc } from '../shoreline.ts';
import type { CollisionRecord } from '../collision.ts';

type Rng = () => number;

export interface StrandLake extends ShorelineDisc {
  level?: number;
}

export interface StrandHeightField {
  getHeightAt(x: number, z: number): number;
  getWaterMaskAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
  /** The baked union wetness (shore rings included) on a liquid field; the lake's own contour ramp otherwise. */
  _waterWetnessAt?(x: number, z: number): number;
}

export interface StrandBuckets {
  wood: THREE.BufferGeometry[];
  baked?: THREE.BufferGeometry[];
}

/** A round keep-out (a beached boat). */
export interface StrandKeepOut { x: number; z: number; r: number }
/** A segment keep-out (a jetty deck from its shore end to its tip). */
export interface StrandJetty { x0: number; z0: number; x1: number; z1: number; r: number }
/** A landing's shore end and its azimuth from the lake centre: the larger pieces gather beside it. */
export interface StrandLanding { x: number; z: number; angle: number }

export interface StrandGroundingReceipt {
  kind: string;
  x: number;
  y: number;
  z: number;
  relief?: number;
  baseClearance?: number;
}

export interface StrandContext {
  lakes: readonly StrandLake[];
  heightField: StrandHeightField;
  rng: Rng;
  buckets: StrandBuckets;
  /** Playable half-extent for dressing (the coastal kit's 470 m). */
  extent?: number;
  spawns?: readonly { x: number; z: number }[];
  keepOut?: readonly StrandKeepOut[];
  jetties?: readonly StrandJetty[];
  landings?: readonly StrandLanding[];
  obstacles?: readonly CollisionRecord[];
  groundingReceipts?: StrandGroundingReceipt[] | null;
}

export interface StrandWrackCensus {
  lakes: number;
  stations: number;
  mats: number;
  sticks: number;
  pebbles: number;
  shells: number;
  landingPieces: number;
}

/** The strand at one azimuth, in metres from the disc centre: the water's edge and where the sand ends. */
export interface StrandBand { edge: number; sandEnd: number }

const TAU = Math.PI * 2;
const EXTENT_M = 470;
const SPAWN_CLEARANCE_M = 26; // the terrain's own pad law (waterWetnessAt dries the 22–26 m ring)
const ROAD_CLEARANCE_M = 6; // the coastal kit's driftwood clearance
const OBSTACLE_MARGIN_M = 1.0;
const MAX_ABOVE_WATER_M = 0.6; // the high-water mark of a sea strand lies within a hull's height of the water
const MAX_SLOPE = 0.16; // ~9°: a wrack line lies on the flat of the beach, never on the graded bank
const STATION_M = 0.5; // one draw station per half metre of shore
const BAND_STATION_M = 4; // the band is marched every ~4 m of arc and interpolated between
// per-station chances before the along-shore density modulation
const KELP_CHANCE = 0.36;
const STICK_CHANCE = 0.05;
const PEBBLE_CHANCE = 0.06;
const SHELL_CHANCE = 0.11;

const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3(1, 0, 0);
const _normal = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _color = new THREE.Color();

/** Round 67: a station's own stream (terrain.ts's mulberry32) from the lake's salt and the station's index. */
export function stationStream(salt: number, index: number): Rng {
  let a = (Math.imul(salt | 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) | 0;
  return function () {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function hash32(value: number): number {
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

function tint(h: number, s: number, l: number): [number, number, number] {
  _color.setHSL(h, s, l, THREE.SRGBColorSpace);
  return [_color.r, _color.g, _color.b];
}

/** Vertex colours for the `baked` bucket: one tone per piece with a deterministic per-vertex grain, no draws. */
function paint<T extends THREE.BufferGeometry>(geometry: T, rgb: readonly [number, number, number], grain: number, salt: number): T {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const shade = 1 - grain * 0.5 + grain * (hash32(i * 7919 + salt) / 4294967296);
    colors[i * 3] = rgb[0] * shade;
    colors[i * 3 + 1] = rgb[1] * shade;
    colors[i * 3 + 2] = rgb[2] * shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** March the water's edge and the sand's end along one azimuth; null where no strand crosses it. */
export function strandBandAt(field: StrandHeightField, lake: StrandLake, angle: number): StrandBand | null {
  const radius = shorelineRadiusAt(lake, angle);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const mask = (r: number) => field.getWaterMaskAt(lake.x + cos * r, lake.z + sin * r);
  let r = radius * 0.80;
  if (mask(r) === 0) return null;
  const limit = radius * 1.02;
  let edge = NaN;
  for (r += 1; r <= limit; r += 1) if (mask(r) === 0) { edge = r; break; }
  if (Number.isNaN(edge)) return null;
  for (let fine = edge - 0.75; fine < edge; fine += 0.25) if (mask(fine) === 0) { edge = fine; break; }
  const wet = field._waterWetnessAt
    ? (x: number, z: number) => field._waterWetnessAt!(x, z)
    : (x: number, z: number) => shorelineWetness(lake, x, z, true);
  let sandEnd = edge + 40;
  for (let t = edge + 0.5; t < edge + 40; t += 0.5) {
    if (wet(lake.x + cos * t, lake.z + sin * t) < 0.02) { sandEnd = t; break; }
  }
  return { edge, sandEnd };
}

/** The wrack band in metres from the disc centre: from a metre above the water's edge to the sand's end, at most
 * 8.5 m up the beach and never narrower than 2.2 m (Saltwind's dry sand is three metres wide). */
export function wrackBand(band: StrandBand): [number, number] {
  const start = band.edge + 1.0;
  const end = Math.max(start + 2.2, Math.min(band.sandEnd - 0.3, band.edge + 8.5));
  return [start, end];
}

/** Along-shore density of the line (0..1): long swells of thick wrack, stretches of nearly clean sand. */
export function wrackDensity(s: number, phaseA: number, phaseB: number): number {
  const n = 0.55 + 0.30 * Math.sin(s * 0.047 + phaseA) + 0.17 * Math.sin(s * 0.131 + phaseB)
    + 0.09 * Math.sin(s * 0.37 + phaseA + phaseB);
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Where in the band the line itself wanders (0 = the water's edge side, 1 = the sand's end). */
function wrackLine(s: number, phaseA: number, phaseB: number): number {
  const w = 0.5 + 0.30 * Math.sin(s * 0.061 + phaseB) + 0.14 * Math.sin(s * 0.19 + phaseA);
  return w < 0 ? 0 : w > 1 ? 1 : w;
}

interface Placement {
  ctx: StrandContext;
  lake: StrandLake;
  level: number;
  extent: number;
  salt: number;
}

/** A piece's centre a metre inside the dressing square, so its fronds, planks and pebbles stay inside it too. */
function insideExtent(p: Placement, x: number, z: number): boolean {
  return Math.max(Math.abs(x), Math.abs(z)) <= p.extent - 1.0;
}

/** Roads, spawn pads, boats, jetties and building footprints. */
function clearAt(p: Placement, x: number, z: number): boolean {
  const { ctx } = p;
  if (ctx.heightField._roadDist(x, z) < ROAD_CLEARANCE_M) return false;
  if (ctx.spawns) for (const spawn of ctx.spawns) {
    const dx = x - spawn.x, dz = z - spawn.z;
    if (dx * dx + dz * dz < SPAWN_CLEARANCE_M * SPAWN_CLEARANCE_M) return false;
  }
  if (ctx.keepOut) for (const k of ctx.keepOut) {
    const dx = x - k.x, dz = z - k.z;
    if (dx * dx + dz * dz < k.r * k.r) return false;
  }
  if (ctx.jetties) for (const j of ctx.jetties) {
    const ax = j.x1 - j.x0, az = j.z1 - j.z0;
    const len2 = ax * ax + az * az;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - j.x0) * ax + (z - j.z0) * az) / len2)) : 0;
    const dx = x - (j.x0 + ax * t), dz = z - (j.z0 + az * t);
    if (dx * dx + dz * dz < j.r * j.r) return false;
  }
  if (ctx.obstacles) for (const o of ctx.obstacles) {
    if (x >= o.min[0] - OBSTACLE_MARGIN_M && x <= o.max[0] + OBSTACLE_MARGIN_M
      && z >= o.min[2] - OBSTACLE_MARGIN_M && z <= o.max[2] + OBSTACLE_MARGIN_M) return false;
  }
  return true;
}

/** Dry sand within the high-water mark's reach of the water: never in the water (the whole footprint, so a frond's
 * corner cannot cross a pond's edge or a cove the marched band interpolates across), never on the bank above the beach. */
function dryAt(p: Placement, x: number, z: number, half: number): boolean {
  const field = p.ctx.heightField;
  if (field.getWaterMaskAt(x, z) !== 0 || field.getHeightAt(x, z) - p.level > MAX_ABOVE_WATER_M) return false;
  return half <= 0 || (field.getWaterMaskAt(x + half, z) === 0 && field.getWaterMaskAt(x - half, z) === 0
    && field.getWaterMaskAt(x, z + half) === 0 && field.getWaterMaskAt(x, z - half) === 0);
}

function flatAt(p: Placement, x: number, z: number, half: number): boolean {
  const field = p.ctx.heightField;
  const reach = Math.max(0.3, half);
  const sx = (field.getHeightAt(x + reach, z) - field.getHeightAt(x - reach, z)) / (2 * reach);
  const sz = (field.getHeightAt(x, z + reach) - field.getHeightAt(x, z - reach)) / (2 * reach);
  return sx * sx + sz * sz <= MAX_SLOPE * MAX_SLOPE;
}

/** `half` is the piece's half-extent plus a margin: the footprint it must keep dry and flat. */
function admits(p: Placement, x: number, z: number, half: number): boolean {
  return insideExtent(p, x, z) && dryAt(p, x, z, half) && clearAt(p, x, z) && flatAt(p, x, z, half);
}

/** The same admission the wrack line uses, for a kit piece re-derived onto the strand (the coastal driftwood). */
export function strandAdmits(ctx: StrandContext, lake: StrandLake & { level: number }, x: number, z: number, half: number): boolean {
  return admits({ ctx, lake, level: lake.level, extent: ctx.extent ?? EXTENT_M, salt: 0 }, x, z, half);
}

type ObbPose = ReturnType<typeof planGroundedObbPose>;

/** Height of a fitted OBB plane at a world offset from its centre. */
function planeHeight(pose: ObbPose, yaw: number, dx: number, dz: number): number {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return pose.y + pose.slopeX * lx + pose.slopeZ * lz;
}

function alignToPlane(geometry: THREE.BufferGeometry, pose: ObbPose): void {
  _normal.set(pose.normalX, pose.normalY, pose.normalZ);
  _quat.setFromUnitVectors(_up, _normal);
  geometry.applyQuaternion(_quat);
}

// --- the pieces -------------------------------------------------------------------------------------------------

/** Three or four flat fronds of weed / kelp thrown over each other — a ragged clump, not a slab — dark olive, brown
 * bladder wrack or a fresher green, seated on the fitted plane. (The first cut's two or three 0.45–1.0 m fronds at one
 * yaw read as dark rectangles in the 2× crop of Saltmere's strand-e-low.) */
function kelpMat(p: Placement, x: number, z: number, yaw: number, rng: Rng): boolean {
  const baked = p.ctx.buckets.baked;
  if (!baked) return false;
  const fronds = rng() < 0.5 ? 4 : 3;
  const long = 0.32 + rng() * 0.42, wide = 0.16 + rng() * 0.16;
  const kind = rng();
  const rgb = kind < 0.3
    ? tint(0.075 + rng() * 0.02, 0.36 + rng() * 0.12, 0.12 + rng() * 0.05) // brown bladder wrack
    : kind < 0.5
      ? tint(0.20 + rng() * 0.06, 0.30 + rng() * 0.14, 0.15 + rng() * 0.07) // fresher green weed
      : tint(0.13 + rng() * 0.04, 0.28 + rng() * 0.16, 0.12 + rng() * 0.07); // dark olive kelp
  const pose = planGroundedObbPose(p.ctx.heightField, x, z, long * 0.55, wide * 0.55, yaw, 0.02);
  if (pose.spread > 0.22) return false;
  for (let k = 0; k < fronds; k++) {
    const h = 0.04 + rng() * 0.03;
    const frond = box(long * (0.55 + rng() * 0.6), h, wide * (0.55 + rng() * 0.6), 1);
    frond.rotateY(yaw + (rng() - 0.5) * 1.8);
    alignToPlane(frond, pose);
    const dx = (rng() - 0.5) * 0.4, dz = (rng() - 0.5) * 0.4;
    frond.translate(x + dx, planeHeight(pose, yaw, dx, dz) + h * 0.5 - 0.012, z + dz);
    baked.push(paint(frond, rgb, 0.14, p.salt + k));
  }
  return true;
}

/** A bleached bent stick: two or three short lengths, kinked in the ground plane. */
function driftStick(p: Placement, x: number, z: number, yaw: number, rng: Rng): boolean {
  const baked = p.ctx.buckets.baked;
  if (!baked) return false;
  const length = 0.7 + rng() * 1.6, thick = 0.05 + rng() * 0.08;
  const segments = rng() < 0.5 ? 3 : 2;
  const rgb = tint(0.085 + rng() * 0.02, 0.05 + rng() * 0.08, 0.42 + rng() * 0.18);
  const pose = planGroundedSegment(p.ctx.heightField, x, z, Math.cos(yaw), -Math.sin(yaw), length, thick * 0.5, 0.02);
  if (pose.relief > 0.30) return false;
  _normal.set(pose.axisX, pose.axisY, pose.axisZ);
  _quat.setFromUnitVectors(_right, _normal);
  const segment = length / segments;
  // a chain of kinked lengths in the stick's own ground plane: each starts where the last ended
  let px = -length * 0.5, pz = 0, bend = 0;
  for (let k = 0; k < segments; k++) {
    bend += (rng() - 0.5) * 0.5;
    const piece = box(segment * 1.03, thick * (0.8 + rng() * 0.4), thick * (0.8 + rng() * 0.4), 1);
    piece.rotateY(bend);
    piece.translate(px + Math.cos(bend) * segment * 0.5, 0, pz - Math.sin(bend) * segment * 0.5);
    px += Math.cos(bend) * segment;
    pz -= Math.sin(bend) * segment;
    piece.applyQuaternion(_quat);
    piece.translate(x, pose.y, z);
    baked.push(paint(piece, rgb, 0.10, p.salt + k));
  }
  return true;
}

/** A patch of three to seven half-buried pebbles. */
function pebblePatch(p: Placement, x: number, z: number, rng: Rng): number {
  const baked = p.ctx.buckets.baked;
  if (!baked) return 0;
  const count = 3 + Math.floor(rng() * 5);
  let placed = 0;
  for (let k = 0; k < count; k++) {
    const px = x + (rng() - 0.5) * 1.4, pz = z + (rng() - 0.5) * 1.4;
    const w = 0.10 + rng() * 0.18, h = 0.06 + rng() * 0.07, d = w * (0.6 + rng() * 0.6);
    const yaw = rng() * Math.PI, tilt = (rng() - 0.5) * 0.4;
    const warm = rng() < 0.2;
    const rgb = warm ? tint(0.09, 0.12, 0.36 + rng() * 0.10) : tint(0.58 + rng() * 0.05, 0.03 + rng() * 0.05, 0.30 + rng() * 0.20);
    if (!insideExtent(p, px, pz) || !dryAt(p, px, pz, 0.2) || !clearAt(p, px, pz)) continue;
    const pebble = box(w, h, d, 1);
    pebble.rotateZ(tilt);
    pebble.rotateY(yaw);
    pebble.translate(px, p.ctx.heightField.getHeightAt(px, pz) + h * 0.28, pz);
    baked.push(paint(pebble, rgb, 0.14, p.salt + k));
    placed++;
  }
  return placed;
}

/** One small pale shell lying flat. */
function shell(p: Placement, x: number, z: number, rng: Rng): boolean {
  const baked = p.ctx.buckets.baked;
  if (!baked) return false;
  const w = 0.08 + rng() * 0.06, d = 0.06 + rng() * 0.05, yaw = rng() * Math.PI;
  const ridged = rng() < 0.25;
  const rgb = ridged ? tint(0.08 + rng() * 0.03, 0.25, 0.55 + rng() * 0.10) : tint(0.08 + rng() * 0.04, 0.20 + rng() * 0.15, 0.76 + rng() * 0.12);
  const piece = box(w, 0.03, d, 1);
  piece.rotateY(yaw);
  piece.translate(x, p.ctx.heightField.getHeightAt(x, z) + 0.008, z);
  baked.push(paint(piece, rgb, 0.08, p.salt));
  return true;
}

/** A squared timber baulk, textured wood, seated as a log. */
function timberBaulk(p: Placement, x: number, z: number, yaw: number, rng: Rng): boolean {
  const length = 2.4 + rng() * 1.0, side = 0.20 + rng() * 0.06;
  const pose = planGroundedSegment(p.ctx.heightField, x, z, Math.cos(yaw), -Math.sin(yaw), length, side * 0.5, 0.03);
  const beam = box(length, side, side, 1.2);
  jitterUV(beam, rng);
  if (pose.relief > 0.35) { beam.dispose(); return false; }
  _normal.set(pose.axisX, pose.axisY, pose.axisZ);
  _quat.setFromUnitVectors(_right, _normal);
  beam.applyQuaternion(_quat);
  beam.translate(x, pose.y, z);
  p.ctx.buckets.wood.push(beam);
  p.ctx.groundingReceipts?.push({ kind: 'strand-timber', x, y: pose.y, z, relief: pose.relief, baseClearance: -0.03 });
  return true;
}

/** A crate broken open: four loose planks fanned on the sand and two end boards leaning together. */
function brokenCrate(p: Placement, x: number, z: number, yaw: number, rng: Rng): boolean {
  const field = p.ctx.heightField;
  const pose = planGroundedObbPose(field, x, z, 0.7, 0.7, yaw, 0.02);
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const plank = box(0.86, 0.045, 0.13, 1.2);
    plank.rotateY(yaw + (k - 1.5) * 0.22 + (rng() - 0.5) * 0.3);
    alignToPlane(plank, pose);
    const dx = (rng() - 0.5) * 0.5, dz = (rng() - 0.5) * 0.5;
    plank.translate(x + dx, planeHeight(pose, yaw, dx, dz) + 0.0225 + k * 0.04, z + dz);
    parts.push(jitterUV(plank, rng));
  }
  for (const side of [-1, 1]) {
    // two end boards 0.6 m apart along the crate's local Z, each leaning inward over the planks
    const board = box(0.55, 0.55, 0.04, 1.2);
    board.rotateX(-side * 1.15);
    board.rotateY(yaw + side * 0.35);
    alignToPlane(board, pose);
    const dx = Math.sin(yaw) * side * 0.30, dz = Math.cos(yaw) * side * 0.30;
    board.translate(x + dx, planeHeight(pose, yaw, dx, dz) + 0.11, z + dz);
    parts.push(jitterUV(board, rng));
  }
  if (pose.spread > 0.30) { for (const part of parts) part.dispose(); return false; }
  for (const part of parts) p.ctx.buckets.wood.push(part);
  p.ctx.groundingReceipts?.push({ kind: 'strand-crate', x, y: pose.y, z, relief: pose.spread, baseClearance: -0.02 });
  return true;
}

/** A coil of rope lying flat: one flattened torus, tan, vertex-coloured. */
function ropeCoil(p: Placement, x: number, z: number, rng: Rng): boolean {
  const baked = p.ctx.buckets.baked;
  if (!baked) return false;
  const radius = 0.36 + rng() * 0.12, tube = 0.07 + rng() * 0.03;
  const rgb = tint(0.09 + rng() * 0.02, 0.38 + rng() * 0.10, 0.34 + rng() * 0.08);
  const coil = new THREE.TorusGeometry(radius, tube, 5, 12);
  coil.rotateX(Math.PI / 2);
  coil.scale(1, 0.7, 1);
  coil.rotateY(rng() * Math.PI);
  const y = p.ctx.heightField.getHeightAt(x, z);
  coil.translate(x, y + tube * 0.7 - 0.015, z);
  baked.push(paint(coil, rgb, 0.10, p.salt));
  p.ctx.groundingReceipts?.push({ kind: 'strand-rope', x, y, z, relief: 0, baseClearance: -0.015 });
  return true;
}

// --- the pass ---------------------------------------------------------------------------------------------------

interface BandTable {
  step: number; // angular spacing of the marched stations
  edge: Float64Array; // NaN where no strand crosses the azimuth
  sandEnd: Float64Array;
}

function marchBands(field: StrandHeightField, lake: StrandLake, extent: number): BandTable {
  const count = Math.max(24, Math.ceil(TAU * lake.r / BAND_STATION_M));
  const step = TAU / count;
  const edge = new Float64Array(count + 1), sandEnd = new Float64Array(count + 1);
  for (let i = 0; i <= count; i++) {
    const angle = (i % count) * step;
    const radius = shorelineRadiusAt(lake, angle);
    const px = lake.x + Math.cos(angle) * radius, pz = lake.z + Math.sin(angle) * radius;
    // a station whose contour lies well outside the square never places anything: skip its march
    const band = Math.max(Math.abs(px), Math.abs(pz)) <= extent + 60 ? strandBandAt(field, lake, angle) : null;
    edge[i] = band ? band.edge : NaN;
    sandEnd[i] = band ? band.sandEnd : NaN;
  }
  return { step, edge, sandEnd };
}

/** The wrack band at any azimuth from the marched table; null where either neighbour station has no strand. */
function bandAt(table: BandTable, angle: number): [number, number] | null {
  const turns = angle / TAU;
  const u = (turns - Math.floor(turns)) * TAU / table.step;
  const i = Math.floor(u), f = u - i;
  const count = table.edge.length - 1;
  const a = i % count, b = (i + 1) % count;
  if (Number.isNaN(table.edge[a]) || Number.isNaN(table.edge[b])) return null;
  return wrackBand({
    edge: table.edge[a] + (table.edge[b] - table.edge[a]) * f,
    sandEnd: table.sandEnd[a] + (table.sandEnd[b] - table.sandEnd[a]) * f,
  });
}

function isStrandLake(lake: StrandLake): lake is StrandLake & { level: number; shelfM: number } {
  return lake.shelfM !== undefined && Number.isFinite(lake.level) && lake.r > 0;
}

/** Lay the wrack line and debris along every strand the map authors. */
export function dressStrandWrack(ctx: StrandContext): StrandWrackCensus {
  const census: StrandWrackCensus = { lakes: 0, stations: 0, mats: 0, sticks: 0, pebbles: 0, shells: 0, landingPieces: 0 };
  const extent = ctx.extent ?? EXTENT_M;
  const { heightField: field } = ctx;
  ctx.lakes.forEach((lake, lakeIndex) => {
    if (!isStrandLake(lake)) return;
    census.lakes++;
    const [phaseA, phaseB] = shorelinePhases(lake);
    const table = marchBands(field, lake, extent);
    const p: Placement = { ctx, lake, level: lake.level, extent, salt: hash32(lakeIndex * 2654435761 + 97) };
    // round 67: the map's stream hands this lake one salt; every station and landing piece draws from its own stream
    const lakeSalt = Math.floor(ctx.rng() * 4294967296);
    let angle = 0, s = 0, station = 0;
    while (angle < TAU) {
      const here = angle;
      const radius = shorelineRadiusAt(lake, here);
      const cos = Math.cos(here), sin = Math.sin(here);
      angle += STATION_M / radius;
      s += STATION_M;
      station++;
      if (Math.max(Math.abs(lake.x + cos * radius), Math.abs(lake.z + sin * radius)) > extent + 12) continue;
      const band = bandAt(table, here);
      if (!band) continue;
      census.stations++;
      const density = wrackDensity(s, phaseA, phaseB);
      const line = wrackLine(s, phaseA, phaseB);
      const width = band[1] - band[0];
      const tangent = here + Math.PI / 2;
      const rng = stationStream(lakeSalt, station);
      // one draw per kind per station, in a fixed order, from the station's own stream: what this station lays never
      // depends on what any other station admitted
      if (rng() < KELP_CHANCE * density * Math.sqrt(density)) {
        let t = line + (rng() - 0.5) * 0.35;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const r = band[0] + width * t, x = lake.x + cos * r, z = lake.z + sin * r;
        const yaw = tangent + (rng() - 0.5) * 1.0;
        if (admits(p, x, z, 0.7) && kelpMat(p, x, z, yaw, rng)) census.mats++;
      }
      if (rng() < STICK_CHANCE * density) {
        const r = band[0] + width * (0.3 + rng() * 0.7), x = lake.x + cos * r, z = lake.z + sin * r;
        const yaw = tangent + (rng() - 0.5) * 1.4;
        if (admits(p, x, z, 1.3) && driftStick(p, x, z, yaw, rng)) census.sticks++;
      }
      if (rng() < PEBBLE_CHANCE * (1 - density * 0.5)) {
        const r = band[0] + width * rng() * 0.45, x = lake.x + cos * r, z = lake.z + sin * r;
        if (admits(p, x, z, 1.0)) census.pebbles += pebblePatch(p, x, z, rng);
      }
      if (rng() < SHELL_CHANCE) {
        const r = band[0] + width * rng(), x = lake.x + cos * r, z = lake.z + sin * r;
        if (admits(p, x, z, 0.2) && shell(p, x, z, rng)) census.shells++;
      }
    }
    // the larger pieces beside each landing on this shore: a timber baulk, a broken crate, a rope coil, a second baulk
    // (round 67: each piece from its own stream, keyed by the landing's shore end and the piece's index)
    if (ctx.landings) for (const landing of ctx.landings) {
      const dx = landing.x - lake.x, dz = landing.z - lake.z;
      const at = Math.atan2(dz, dx);
      const here = shorelineRadiusAt(lake, at);
      if (Math.abs(Math.hypot(dx, dz) - here) > here * 0.25) continue; // another lake's landing
      for (let k = 0; k < 4; k++) {
        const rng = stationStream(lakeSalt ^ hash32(Math.round(landing.x * 8) * 73856093 ^ Math.round(landing.z * 8) * 19349663), 1000003 + k);
        const side = rng() < 0.5 ? -1 : 1;
        const along = (4 + rng() * 10) * side;
        const a = at + along / here;
        const band = bandAt(table, a);
        const t = 0.2 + rng() * 0.6;
        const yaw = a + Math.PI / 2 + (rng() - 0.5) * 0.8;
        if (!band) continue;
        const r = band[0] + (band[1] - band[0]) * t;
        const x = lake.x + Math.cos(a) * r, z = lake.z + Math.sin(a) * r;
        if (!admits(p, x, z, k === 1 ? 0.9 : k === 2 ? 0.6 : 1.8)) continue;
        const placed = k === 1 ? brokenCrate(p, x, z, yaw, rng) : k === 2 ? ropeCoil(p, x, z, rng) : timberBaulk(p, x, z, yaw, rng);
        if (placed) census.landingPieces++;
      }
    }
  });
  return census;
}
