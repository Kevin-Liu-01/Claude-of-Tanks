// Hydropneumatic suspension units (hydro lane 274; the owner, 2026-11-20: "make pneumatic suspension wheel attachments
// and hydraulics look much better for all penumatic suspension tanks including mbt 70, stb etc").
//
// The fleet arm (tankFactoryCore buildRunningGear) hangs every road wheel from a hull pivot. On the hydropneumatic
// pattern (suspensionPatterns.ts) each station also draws its spring, in the family's real form:
//   external-strut  a cylinder with a spherical accumulator head pinned to a hull bracket, and a polished rod whose eye
//                   is pinned to a lug on the arm (MBT-70, STB-1/Type 74, Strv 103/UDES, Leclerc, Osorio);
//   in-arm          an accumulator chamber and a housing cast along the arm, swinging with it (K1/K2, Type 90, Type 10,
//                   Redback, PL-01);
//   hydrogas        a large canister fixed to the hull at the arm pivot, the arm swinging out of it (every Challenger).
// Every part sits in the slot the arm already owns: outboard of nothing but the hull side, inboard of the road wheel's
// measured back face by the same clearance the arm keeps, and under the track's top run and the return rollers. Two
// instanced layers per running-gear unit at most (the unit bodies in the arm's shaded scheme paint, the rods in polished
// steel); placement is scalar per frame, with no allocation.
//
// Local frame of every unit part: +x outboard, +z along the part (toward the arm lug, along the arm, or forward), and
// the geometry symmetric under y -> -y, so the left side is the right side turned half a turn about z (a proper
// rotation; a negative instance scale would turn its faces inside out).

import * as THREE from 'three';
import { cylX, cylZ, mergeAll, xform } from './factoryGeometry.ts';
import { hypot2 } from './scalarHypot.ts';
import type { HydraulicUnitKind } from './suspensionPatterns.ts';

type Side = -1 | 1;

/** The arm a unit rides: its hull pivot and the road wheel whose axle it carries. */
export interface HydraulicArmLink {
  side: Side;
  x: number;
  anchorY: number;
  anchorZ: number;
  wheel: { y: number; z: number; off?: number };
}

interface HydraulicStation {
  link: HydraulicArmLink;
  /** Unit centre plane (hull frame x). */
  x: number;
  /** external-strut: the hull-bracket pin; hydrogas: the canister's rear datum; in-arm: unused. */
  mountY: number;
  mountZ: number;
  /** hydrogas: +1 the canister runs forward of the pivot, -1 aft (where the idler or sprocket takes the space ahead). */
  facing: 1 | -1;
}

/** A running-gear unit's hydraulic layers and the stations they serve (rides SuspensionLinkRig). */
export interface HydraulicUnitRig {
  kind: HydraulicUnitKind;
  stations: HydraulicStation[];
  /** Lug on the arm: its fraction from the pivot toward the axle and its lift off the arm axis (external-strut). */
  lugT: number;
  lugLift: number;
  /** +1: the strut stands up and aft from a lug on the arm's top; -1: it hangs down and forward from its underside
   * (a rollerless hull whose top run rests on the wheels leaves no room above them). */
  lugSide: 1 | -1;
  /** The rod's drawn length at scale 1 (external-strut): each frame scales it to end just inside the head. */
  rodNominal: number;
  headReach: number;
  bodyIM: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material>;
  rodIM: THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> | null;
}

/** What the builder knows about the slot every station's unit must stay inside. */
export interface HydraulicSlot {
  /** Outboard limit of anything behind the road wheel (wheel back face minus the arm's clearance), absolute x. */
  outboardAbsX: (side: Side) => number;
  /** The highest a part spanning [z0, z1] on a side may reach: the track's top run, the return rollers, their spindles. */
  ceilingY: (side: Side, z0: number, z1: number) => number;
  /** The lowest a part fixed to the hull may reach: the track's ground run raised by the hull's full compression. */
  floorY: (side: Side, z0: number, z1: number) => number;
  /** Whether a ball of radius r at (y, z) clears the sprocket and idler (their hubs reach inboard of the track). */
  clearOfEnds: (y: number, z: number, r: number) => boolean;
}

export interface HydraulicUnitBuild {
  kind: HydraulicUnitKind;
  links: readonly HydraulicArmLink[];
  wheelR: number;
  armWidth: number;
  armHeight: number;
  /** How far inboard the arm's pivot boss reaches (it meets the hull side): the strut's hull pin reaches as far. */
  bossHalfWidth: number;
  /** The hull's full compression (m of wheel rise): the strut's eye must clear the top run there. */
  compressionM: number;
  high: boolean;
  slot: HydraulicSlot;
  bodyMaterial: THREE.Material;
  rodMaterial: THREE.Material;
}

export interface HydraulicUnitReceipt {
  kind: HydraulicUnitKind;
  stations: number;
  skipped: number;
  bodyTriangles: number;
  rodTriangles: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _rodScale = new THREE.Vector3(1, 1, 1);
const _X = new THREE.Vector3(1, 0, 0);
/** Half a turn about z: the left side's copy of a right-side part (geometry is y-symmetric). */
const LEFT_TURN = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
const HALF_TURN_X = new THREE.Quaternion().setFromAxisAngle(_X, Math.PI);

/** The left side's turn for a part already placed by a rotation about x (the fleet arm and its bosses). */
export function turnForSide(side: Side, q: THREE.Quaternion): THREE.Quaternion {
  return side < 0 ? q.multiply(LEFT_TURN) : q;
}

function triangles(geometry: THREE.BufferGeometry): number {
  return (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
}

function sphere(radius: number, high: boolean): THREE.BufferGeometry {
  return new THREE.SphereGeometry(radius, high ? 14 : 8, high ? 8 : 6);
}

/** Proportions of a station's parts from the wheel it carries (metres). */
function unitProportions(wheelR: number) {
  const strutR = THREE.MathUtils.clamp(wheelR * 0.105, 0.028, 0.05);
  return {
    strutR,
    headR: strutR * 1.42,
    eyeR: strutR * 0.82,
    strutLength: wheelR * 0.92,
    inArmR: THREE.MathUtils.clamp(wheelR * 0.12, 0.03, 0.058),
    canisterR: THREE.MathUtils.clamp(wheelR * 0.2, 0.045, 0.085),
  };
}

const MIN_STRUT_FRACTION = 0.58;
/** Where the strut's eye sits along the arm, from the pivot (0) to the axle (1), farthest first. */
const LUG_TS = [0.58, 0.48, 0.38];
const STRUT_TILTS = [0, 20, -20, 40, -40, 60, -60].map((d) => (d * Math.PI) / 180);
/** The hydrogas canister's run along the hull from its pivot, in road-wheel radii (with its end cover and bolts). */
const HYDROGAS_REAR = -0.14;
const HYDROGAS_FRONT = 0.9;

/** Arm unit vector (pivot to axle) and the lug's perpendicular, which points up and aft on a leading-pivot arm. */
interface ArmFrame { axleY: number; length: number; uy: number; uz: number; ny: number; nz: number }
/** The per-frame arm frame updateHydraulicUnits reuses (gear-alloc-279: no record per station per frame). */
const _armFrame: ArmFrame = { axleY: 0, length: 0, uy: 0, uz: 0, ny: 0, nz: 0 };
function armFrame(link: HydraulicArmLink, out: ArmFrame = { axleY: 0, length: 0, uy: 0, uz: 0, ny: 0, nz: 0 }): ArmFrame {
  const axleY = link.wheel.y + (link.wheel.off || 0);
  const dy = axleY - link.anchorY;
  const dz = link.wheel.z - link.anchorZ;
  const length = Math.max(hypot2(dy, dz), 1e-6);
  const uy = dy / length, uz = dz / length;
  // (-uz, uy) is the perpendicular whose y component is positive whenever the pivot leads the axle
  const sign = -uz >= 0 ? 1 : -1;
  out.axleY = axleY; out.length = length; out.uy = uy; out.uz = uz; out.ny = -uz * sign; out.nz = uy * sign;
  return out;
}

function strutGeometries(p: ReturnType<typeof unitProportions>, bodyLength: number, rodLength: number,
  pinInboard: number, eyePinInboard: number, high: boolean) {
  const seg = high ? 14 : 8;
  const { strutR, headR, eyeR } = p;
  // body: the accumulator head on its hull pin, the cylinder down toward the arm, a gland nut where the rod leaves
  const barrel = bodyLength - headR * 0.35;
  const pinLength = pinInboard + headR * 0.92;
  const body = mergeAll([
    sphere(headR, high),
    xform(cylX(strutR * 0.42, pinLength, high ? 10 : 6), (headR * 0.92 - pinInboard) * 0.5, 0, 0),
    xform(cylZ(strutR * 1.12, headR * 0.28, seg), 0, 0, headR * 0.9),
    xform(cylZ(strutR, barrel, seg), 0, 0, headR * 0.35 + barrel * 0.5),
    xform(cylZ(strutR * 1.16, strutR * 0.34, seg), 0, 0, bodyLength - strutR * 0.17),
  ]);
  // rod: the eye on the arm lug with its pin into the lug, the polished rod up through the gland into the head
  const rodRun = rodLength - eyeR * 0.55;
  const rodPin = eyePinInboard + strutR * 0.7;
  const rod = mergeAll([
    cylX(eyeR, strutR * 1.3, high ? 12 : 8),
    xform(cylX(strutR * 0.36, rodPin, high ? 8 : 6), (strutR * 0.7 - eyePinInboard) * 0.5, 0, 0),
    xform(cylZ(strutR * 0.46, rodRun, high ? 10 : 6), 0, 0, eyeR * 0.55 + rodRun * 0.5),
  ]);
  return { body, rod };
}

function inArmGeometry(p: ReturnType<typeof unitProportions>, armLength: number, high: boolean): THREE.BufferGeometry {
  const seg = high ? 16 : 8;
  const r = p.inArmR, chamberR = r * 1.3;
  const chamber = armLength * 0.3;
  const housing = armLength * 0.26;
  return mergeAll([
    // accumulator chamber over the pivot, a flanged collar, the taper into the strut housing and its domed end
    xform(cylZ(chamberR, chamber, seg), 0, 0, chamber * 0.5 - chamberR * 0.35),
    xform(cylZ(chamberR * 1.08, chamberR * 0.22, seg), 0, 0, chamber - chamberR * 0.35),
    xform(cylZ(r, armLength * 0.08, seg, chamberR), 0, 0, chamber - chamberR * 0.35 + armLength * 0.04),
    xform(cylZ(r, housing, seg), 0, 0, chamber - chamberR * 0.35 + armLength * 0.08 + housing * 0.5),
    xform(cylZ(r * 0.55, r * 0.5, seg, r), 0, 0, chamber - chamberR * 0.35 + armLength * 0.08 + housing + r * 0.25),
  ]);
}

function hydrogasGeometry(p: ReturnType<typeof unitProportions>, wheelR: number, mountInboard: number,
  high: boolean): THREE.BufferGeometry {
  const seg = high ? 18 : 10;
  const r = p.canisterR;
  const rear = HYDROGAS_REAR * wheelR, front = HYDROGAS_FRONT * wheelR;
  const run = front - rear;
  const parts = [
    xform(cylZ(r, run, seg), 0, 0, (front + rear) * 0.5),
    // the arm-bearing collar at the rear, two clamp bands, the bolted front cover
    xform(cylZ(r * 1.1, wheelR * 0.12, seg), 0, 0, rear + wheelR * 0.06),
    xform(cylZ(r * 1.05, wheelR * 0.045, seg), 0, 0, rear + run * 0.45),
    xform(cylZ(r * 1.05, wheelR * 0.045, seg), 0, 0, rear + run * 0.72),
    xform(cylZ(r * 0.86, wheelR * 0.05, seg, r), 0, 0, front + wheelR * 0.025),
    // the mounting web the casting is bolted to the hull side by, reaching as far inboard as the pivot boss
    xform(new THREE.BoxGeometry(mountInboard, r * 1.3, run * 0.62), -mountInboard * 0.5, 0, rear + run * 0.42),
  ];
  if (high) {
    for (let i = 0; i < 6; i++) {
      const a = (i + 0.5) * Math.PI / 3;
      parts.push(xform(cylZ(r * 0.11, wheelR * 0.04, 6), Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62,
        front + wheelR * 0.06));
    }
  }
  return mergeAll(parts);
}

function unitMesh(geometry: THREE.BufferGeometry, material: THREE.Material, count: number, name: string,
  role: string, kind: HydraulicUnitKind) {
  const im = new THREE.InstancedMesh(geometry, material, count);
  im.name = name;
  im.userData.appearanceRole = role;
  im.userData.hydraulicUnit = kind;
  im.userData.suspensionPlacement = 'inboard-behind-road-wheel';
  im.castShadow = false;
  im.receiveShadow = true;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return im;
}

/**
 * Seat one unit per eligible arm and build its instanced layers. A station whose unit cannot fit under the track and
 * the rollers is skipped (and counted), never pushed through them.
 */
export function buildHydraulicUnits(build: HydraulicUnitBuild): { rig: HydraulicUnitRig | null; receipt: HydraulicUnitReceipt } {
  const { kind, links, wheelR, armHeight, high, slot } = build;
  const p = unitProportions(wheelR);
  const stations: HydraulicStation[] = [];
  let skipped = 0;
  const margin = 0.012;
  const lugLift = armHeight * 0.5 + p.eyeR * 0.35;
  let armLength = Infinity;
  for (const link of links) armLength = Math.min(armLength, armFrame(link).length);
  // External struts: the longest strut up to the nominal whose head clears the top run and the rollers, and whose hull
  // pin clears the ground run at full compression. One stance per hull (strutStances below): the first direction in
  // which every station fits, else each station that fits the upward stance (the rest skipped and counted).
  const seatStruts = (lugT: number, lugSide: 1 | -1, tilt: number, strict: boolean, keepPartial: boolean,
    underArm = false) => {
    const seated: HydraulicStation[] = [];
    let shortest = p.strutLength, missed = 0;
    const c = Math.cos(tilt), s = Math.sin(tilt);
    for (const link of links) {
      const frame = armFrame(link);
      // the lug rides the arm: at full compression its eye must stay under the top run and the rollers
      const bump = armFrame({ ...link, wheel: { ...link.wheel, off: build.compressionM } });
      const bumpY = link.anchorY + bump.uy * bump.length * lugT + bump.ny * lugSide * lugLift;
      const bumpZ = link.anchorZ + bump.uz * bump.length * lugT + bump.nz * lugSide * lugLift;
      // (an eye under the arm stays inside the arm's own section, so it reaches the top run only where the arm does)
      if (!underArm && bumpY + p.eyeR > slot.ceilingY(link.side, bumpZ - p.eyeR, bumpZ + p.eyeR) - margin) {
        missed++;
        if (!keepPartial) return null;
        continue;
      }
      const ny = frame.ny * lugSide, nz = frame.nz * lugSide;
      const lugY = link.anchorY + frame.uy * frame.length * lugT + ny * lugLift;
      const lugZ = link.anchorZ + frame.uz * frame.length * lugT + nz * lugLift;
      // the strut leaves the lug along the arm's normal on the lug's side, tilted in the arm's plane
      const dy = ny * c - nz * s, dz = ny * s + nz * c;
      let length = p.strutLength;
      for (; length >= p.strutLength * MIN_STRUT_FRACTION; length -= 0.01) {
        const y = lugY + dy * length, z = lugZ + dz * length;
        // The hull pin clears the ground run at full compression; where no stance can (a ground run that rises past
        // the arm pivots, as MBT-70's 0.65 m does), it is asked to clear no more than the arm's own pivot does.
        const groundRun = slot.floorY(link.side, z - p.headR, z + p.headR);
        const floor = strict ? groundRun : Math.min(groundRun, link.anchorY - armHeight);
        if (y + p.headR <= slot.ceilingY(link.side, z - p.headR, z + p.headR) - margin
          && y - p.headR >= floor + margin
          && slot.clearOfEnds(y, z, p.headR)) break;
      }
      if (length < p.strutLength * MIN_STRUT_FRACTION) {
        missed++;
        if (!keepPartial) return null;
        continue;
      }
      shortest = Math.min(shortest, length);
      seated.push({ link, x: link.side * (slot.outboardAbsX(link.side) - p.headR),
        mountY: lugY + dy * length, mountZ: lugZ + dz * length, facing: 1 });
    }
    return { seated, shortest, missed, lugSide, lugT };
  };
  // Clear of the ground run at full compression first, then only as clear as the pivots. Within each: the eye on top of
  // the arm and clear of the top run at full compression, else (where the arm itself reaches the top run there, as on
  // STB-1 and Type 74) the eye under the arm, asked no more than the arm is; the lug as far out the arm as it fits; up,
  // then hanging down, each tilted by up to 60 degrees either way. Failing all of those, the stations that fit upward.
  const strutStances = () => {
    for (const strict of [true, false]) for (const underArm of [false, true]) for (const lugT of LUG_TS) {
      for (const lugSide of underArm ? [-1] as const : [1, -1] as const) for (const tilt of STRUT_TILTS) {
        const all = seatStruts(lugT, lugSide, tilt, strict, false, underArm);
        if (all) return all;
      }
    }
    return seatStruts(LUG_TS[0], 1, 0, false, true);
  };
  const struts = kind === 'external-strut' ? strutStances() : null;
  const lugSide = struts?.lugSide ?? 1;
  const lugT = struts?.lugT ?? LUG_TS[0];
  const strutLength = struts?.shortest ?? p.strutLength;
  if (struts) {
    stations.push(...struts.seated);
    skipped += struts.missed;
  }
  if (kind !== 'external-strut') for (const link of links) {
    const outboard = slot.outboardAbsX(link.side);
    if (kind === 'in-arm') {
      const chamberR = p.inArmR * 1.3;
      if (link.anchorY + chamberR > slot.ceilingY(link.side, link.anchorZ - chamberR, link.anchorZ + chamberR) - margin
        || !slot.clearOfEnds(link.anchorY, link.anchorZ, chamberR)) {
        skipped++;
        continue;
      }
      stations.push({ link, x: link.side * (outboard - chamberR), mountY: link.anchorY, mountZ: link.anchorZ, facing: 1 });
    } else {
      const r = p.canisterR * 1.1;
      let seated = false;
      for (const facing of [1, -1] as const) {
        const z0 = link.anchorZ + facing * HYDROGAS_REAR * wheelR, z1 = link.anchorZ + facing * HYDROGAS_FRONT * wheelR;
        const ceiling = slot.ceilingY(link.side, Math.min(z0, z1), Math.max(z0, z1)) - margin;
        const y = Math.min(link.anchorY, ceiling - r);
        if (y < link.anchorY - wheelR * 0.3) continue;
        let clear = true;
        for (let k = 0; k <= 4 && clear; k++) clear = slot.clearOfEnds(y, z0 + (z1 - z0) * k / 4, r);
        if (!clear) continue;
        stations.push({ link, x: link.side * (outboard - r), mountY: y, mountZ: link.anchorZ, facing });
        seated = true;
        break;
      }
      if (!seated) skipped++;
    }
  }
  const receipt: HydraulicUnitReceipt = { kind, stations: stations.length, skipped, bodyTriangles: 0, rodTriangles: 0 };
  if (!stations.length) return { rig: null, receipt };

  let bodyGeometry: THREE.BufferGeometry;
  let rodGeometry: THREE.BufferGeometry | null = null;
  if (kind === 'external-strut') {
    // The fleet arm shortens by up to ~40 % at full compression, so no rigid pair of tubes spans its travel: the body
    // hangs from the hull pin at a fixed length, short enough that its gland never reaches the arm, and the rod runs
    // from the arm eye up through the gland to just inside the head, its length scaled to that each frame.
    const pinInboard = Math.max(...stations.map((s) => Math.abs(s.x) - Math.abs(s.link.x))) + build.bossHalfWidth;
    const eyePinInboard = Math.max(...stations.map((s) => Math.abs(s.x) - Math.abs(s.link.x))) + build.armWidth * 0.2;
    const geometries = strutGeometries(p, strutLength * 0.45, strutLength - p.headR * 0.6, pinInboard, eyePinInboard, high);
    bodyGeometry = geometries.body;
    rodGeometry = geometries.rod;
  } else if (kind === 'in-arm') {
    bodyGeometry = inArmGeometry(p, armLength, high);
  } else {
    const mountInboard = Math.max(...stations.map((s) => Math.abs(s.x) - Math.abs(s.link.x))) + build.bossHalfWidth;
    bodyGeometry = hydrogasGeometry(p, wheelR, mountInboard, high);
  }
  const bodyIM = unitMesh(bodyGeometry, build.bodyMaterial, stations.length, 'gearHydraulicUnits', 'suspensionLink', kind);
  const rodIM = rodGeometry
    ? unitMesh(rodGeometry, build.rodMaterial, stations.length, 'gearHydraulicRods', 'suspensionRod', kind)
    : null;
  receipt.bodyTriangles = triangles(bodyGeometry);
  receipt.rodTriangles = rodGeometry ? triangles(rodGeometry) : 0;
  bodyIM.userData.hydraulicUnitTriangles = receipt.bodyTriangles;
  const rig: HydraulicUnitRig = {
    kind, stations, lugT, lugLift, lugSide, rodNominal: strutLength - p.headR * 0.6, headReach: p.headR * 0.6, bodyIM, rodIM,
  };
  updateHydraulicUnits(rig);
  return { rig, receipt };
}

/** Re-seat every unit on its arm's current pose (the running gear's suspension update). */
export function updateHydraulicUnits(rig: HydraulicUnitRig): void {
  const { stations, bodyIM, rodIM, kind } = rig;
  for (let i = 0; i < stations.length; i++) {
    const station = stations[i];
    const { link } = station;
    const side = link.side;
    if (kind === 'hydrogas') {
      // aft-facing is a half turn about x, the left side a half turn about z (the canister is y-symmetric)
      if (station.facing > 0) _q.identity();
      else _q.copy(HALF_TURN_X);
      if (side < 0) _q.multiply(LEFT_TURN);
      _v.set(station.x, station.mountY, station.mountZ);
      _m.compose(_v, _q, _s);
      bodyIM.setMatrixAt(i, _m);
      continue;
    }
    const frame = armFrame(link, _armFrame);
    if (kind === 'in-arm') {
      // the quaternion that points a part's +z along (dy, dz) in the hull's y-z plane, outboard +x on its own side; written
      // out at each use, since a helper taking (dy, dz) boxed both numbers per call (gear-alloc-279)
      _q.setFromAxisAngle(_X, Math.atan2(-frame.uy, frame.uz));
      if (side < 0) _q.multiply(LEFT_TURN);
      _v.set(station.x, link.anchorY, link.anchorZ);
      _m.compose(_v, _q, _s);
      bodyIM.setMatrixAt(i, _m);
      continue;
    }
    const lift = rig.lugLift * rig.lugSide;
    const lugY = link.anchorY + frame.uy * frame.length * rig.lugT + frame.ny * lift;
    const lugZ = link.anchorZ + frame.uz * frame.length * rig.lugT + frame.nz * lift;
    const dy = lugY - station.mountY, dz = lugZ - station.mountZ;
    _q.setFromAxisAngle(_X, Math.atan2(-dy, dz));
    if (side < 0) _q.multiply(LEFT_TURN);
    _v.set(station.x, station.mountY, station.mountZ);
    _m.compose(_v, _q, _s);
    bodyIM.setMatrixAt(i, _m);
    _q.setFromAxisAngle(_X, Math.atan2(-(-dy), -dz));
    if (side < 0) _q.multiply(LEFT_TURN);
    _v.set(station.x, lugY, lugZ);
    _rodScale.z = Math.max(0.2, (hypot2(dy, dz) - rig.headReach) / rig.rodNominal);
    _m.compose(_v, _q, _rodScale);
    rodIM!.setMatrixAt(i, _m);
  }
  bodyIM.instanceMatrix.needsUpdate = true;
  if (rodIM) rodIM.instanceMatrix.needsUpdate = true;
}

/**
 * The cast arm of the hydropneumatic pattern, in the fleet arm's unit frame (z from -0.5 at the pivot to 0.5 at the
 * axle, scaled by the arm's length; x across, y up): the tapered beam with a raised outboard rib.
 */
export function hydraulicArmGeometry(width: number, height: number, taper: number, segments: number): THREE.BufferGeometry {
  return mergeAll([
    xform(cylZ(0.5 * taper, 1, segments, 0.5), 0, 0, 0, 0, 0, 0, [width, height, 1]),
    xform(cylZ(0.5, 0.86, 6, 0.5), width * 0.5, 0, 0, 0, 0, 0, [width * 0.16, height * 0.42, 1]),
  ]);
}

/** Bolt heads on a joint boss's outboard face (hydropneumatic pattern): a circle of `count` at `pitchR`. */
export function bossBoltCircle(faceX: number, pitchR: number, headR: number, headH: number, count: number): THREE.BufferGeometry[] {
  const bolts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i + 0.5) * Math.PI * 2 / count;
    bolts.push(xform(cylX(headR, headH, 6), faceX + headH * 0.5, Math.cos(a) * pitchR, Math.sin(a) * pitchR));
  }
  return bolts;
}
