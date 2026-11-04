// The K2B's hull-side armour run and its raised fuel cans (r269, the owner 2026-11-04: "updae the sideskits for the k2b
// a lot to make them properly match with side profile of hull and align with it and also just be more modernized. and
// add 2 fuel cans to back that are elevated to be visible from front.").
//
// The skirt (addK2BSkirtRun): the eight tall identical cassettes that hung 10 cm outboard of the K2's skirt on a rail
// (round 267) are replaced by the export K2's bolted module run (research/k2b photos 5, r269-photos 9-11: Polish K2 at
// Radom 2023, K2GF at MSPO 2025, Hyundai Rotem's K2PL): flat-faced armour groups butting at chamfered joints, each faced
// with a grid of tiles and four-bolt clusters at the tile corners, a narrow upper course along the fender line above them
// with a top mounting rail, lifting eyes on the groups' top ledge and a rubber hem. Its outline is the hull's own flank:
// - top: the K2 plate's top line (xk2Hull.ts k2SkirtTopAt: the glacis edge +5 mm forward of z 1.83, 1.565 aft of it);
// - front: raked 45 degrees, parallel to the corner fender box's face (korea.ts addK2BCornerHousings), from the box's
//   lower rear corner (z 2.97, y 1.15) down and back to the hem; the K2 plate shows ahead of it under the box;
// - hem: level at 0.565, on the plate's own hem over the road wheels' top quarter;
// - rear: the plate's tail line (rising over the sprocket) carried on to the rear plate line, z -3.74, where the course
//   and the rail end flush with the stern.
// Hull frame (buildK2: deck 1.66 aft, 1.56 mid, glacis 1.66 at z 1.30 to 1.24 at its lip; the K2 plate x 1.70-1.74).
//
// The cans (addK2BFuelCans): two NATO 20 L cans (accessoryKits.ts jerrycanParts) upright side by side in a welded frame
// on the turret bustle's armoured core roof, their stamped faces fore and aft, so both stand clear above the turret roof
// in the front view. Turret frame.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { KIT } from './kit.ts';
import { k2SkirtTopAt, TOP_BREAK_Z } from './xk2Hull.ts';
import { jerrycanParts } from '../accessoryKits.ts';
import type { Modern3BuilderPort } from '../modern3.ts';
import type { ProceduralBuilderPort, Vec3Tuple } from '../proceduralBuilderContracts.ts';

type K2BPort = ProceduralBuilderPort & Modern3BuilderPort;

/** A closed convex armour stock round any set of corners (kit.ts convexSlab takes exactly eight). */
export function convexStock(points: readonly Vec3Tuple[]): THREE.BufferGeometry {
  const geometry = new ConvexGeometry(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const position = geometry.getAttribute('position');
  const uv: number[] = [];
  for (let i = 0; i < position.count; i++) uv.push(position.getX(i), position.getZ(i));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

/** Skirt-run datums (m, hull frame, the left side; the right mirrors). */
const K2B_SKIRT = Object.freeze({
  /** Armour groups: inner face 8 mm into the K2 plate (outer face 1.74), outer face, edge chamfers (ends and hem; top). */
  moduleIn: 1.732, moduleOut: 1.865, edge: 0.015, topEdge: 0.012,
  /** The upper course: inner face 5 mm into the deck sides (x 1.66), outer face, height, top and bottom outer chamfers. */
  courseIn: 1.655, courseOut: 1.81, courseH: 0.20, courseEdge: 0.02, courseFoot: 0.008,
  /** The top mounting rail on the course: x span, height (4 mm into the course top). */
  railIn: 1.655, railOut: 1.78, railH: 0.022,
  /** Hem: level, 5 mm under the plate's 0.56 hem; the rubber fringe below it. */
  hemY: 0.565, fringeY: 0.495, fringeIn: 1.822, fringeOut: 1.838,
  /** The tail: from the plate's tail start the hem rises 0.63 per metre to the rear plate line (z -3.74). */
  tailZ: -2.62, tailRise: 0.63, rearZ: -3.74,
  /** Behind the track's reach (z -3.49) the tail group closes in to the stern's side (x 1.66). */
  closeZ: -3.52, closeIn: 1.655,
  /** The front edge: raked 45 degrees down and back from the corner box's lower rear corner. */
  rakeZ: 2.97, rakeY: 1.15,
  /** Group joints (front to rear; the first group runs forward to the rake). */
  joints: Object.freeze([1.29, -0.23, -1.75, -2.89]),
  /** Tile width (from each group's rear joint forward) and the level row seam. */
  tile: 0.38, rowY: 0.985,
  /** The upper course's joints (front to rear), split at the top line's break. */
  course: Object.freeze([2.97, TOP_BREAK_Z, 0.72, -0.40, -1.52, -2.64, -3.74]),
  /** Lifting eyes on the groups' top ledge (z). */
  eyes: Object.freeze([1.55, 0.53, -0.99, -2.32]),
});

const skirtTop = (z: number): number => k2SkirtTopAt(z);
/** The armour groups' top: the course's foot. */
const groupTop = (z: number): number => skirtTop(z) - K2B_SKIRT.courseH;
const skirtHem = (z: number): number => {
  const S = K2B_SKIRT;
  return z < S.tailZ ? S.hemY + (S.tailZ - z) * S.tailRise : S.hemY;
};
/** The raked front edge: its z at height y, and its height at station z. */
const rakeZAt = (y: number): number => K2B_SKIRT.rakeZ - (K2B_SKIRT.rakeY - y);
const rakeYAt = (z: number): number => K2B_SKIRT.rakeY - (K2B_SKIRT.rakeZ - z);

/** A section ring (x, y) with chamfered outer bottom (`edge`) and top (`topEdge`) edges; `pull` sets the outer face in. */
function sectionRing(xi: number, xo: number, h: number, t: number, edge: number, topEdge: number, pull: number):
  [number, number][] {
  const o = xo - pull;
  return [[xi, h], [o - edge, h], [o, h + edge], [o, t - topEdge], [o - topEdge, t], [xi, t]];
}

/**
 * One armour group from `front` to `rear` (z, front > rear): a closed convex stock whose rings follow the hem and the
 * groups' top line, its outer vertical edges chamfered at both ends (the joints between groups read as V grooves). A
 * `raked` front follows the 45-degree front edge instead of a station.
 */
function armourGroup(P: K2BPort, side: number, front: number, rear: number, raked: boolean): void {
  const S = K2B_SKIRT, e = S.edge;
  const pts: Vec3Tuple[] = [];
  const ring = (z: number, pull: number, xi = S.moduleIn): void => {
    for (const [x, y] of sectionRing(xi, S.moduleOut, skirtHem(z), groupTop(z), e, S.topEdge, pull)) pts.push([side * x, y, z]);
  };
  // the rear end and its chamfer; the stern closure behind the track's reach
  ring(rear, e, rear < S.closeZ ? S.closeIn : S.moduleIn);
  ring(rear + e, 0, rear < S.closeZ ? S.closeIn : S.moduleIn);
  if (rear < S.closeZ) {
    ring(S.closeZ, 0, S.closeIn);
    ring(-3.30, 0);                                                           // the plate's own end: the slant starts here
  }
  for (const z of [TOP_BREAK_Z, S.tailZ]) if (z < front - e && z > rear + e) ring(z, 0);
  if (!raked) {
    ring(front, e);
    ring(front - e, 0);
  } else {
    // raked front: each ring vertex on the 45-degree plane (pulled in) and a chamfer's depth behind it; the top meets
    // the plane where the groups' top line crosses it
    let t = S.rakeY;
    for (let k = 0; k < 6; k++) t = groupTop(rakeZAt(t));
    for (const [back, pull] of [[0, e], [e, 0]] as const) {
      for (const [x, y] of sectionRing(S.moduleIn, S.moduleOut, S.hemY, t, e, S.topEdge, pull)) {
        pts.push([side * x, y, rakeZAt(y) - back]);
      }
    }
  }
  P.add('hull', convexStock(pts));
}

/** One upper-course segment (front > rear): chamfered outer top and foot, chamfered vertical ends. */
function courseSegment(P: K2BPort, side: number, front: number, rear: number): void {
  const S = K2B_SKIRT, e = 0.01;
  const pts: Vec3Tuple[] = [];
  const ring = (z: number, pull: number): void => {
    const top = skirtTop(z), foot = groupTop(z) - 0.005;
    for (const [x, y] of sectionRing(S.courseIn, S.courseOut, foot, top, S.courseFoot, S.courseEdge, pull)) {
      pts.push([side * x, y, z]);
    }
  };
  for (const [z, pull] of [[front, e], [front - e, 0], [rear + e, 0], [rear, e]] as const) ring(z, pull);
  P.add('hull', convexStock(pts));
}

/** A hex bolt head on the side face at (y, z), 5 mm into it. */
function sideBolt(P: K2BPort, side: number, faceX: number, y: number, z: number): void {
  P.add('hullDark', KIT.cylX(0.0145, 0.016, P.q ? 6 : 4), side * (faceX + 0.003), y, z);
}

/** A dark joint line 1 mm off the outer face: vertical (dy > dz) or level. */
function seamLine(P: K2BPort, side: number, faceX: number, y0: number, y1: number, z0: number, z1: number): void {
  const vertical = Math.abs(y1 - y0) > Math.abs(z1 - z0);
  const plane = vertical ? new THREE.PlaneGeometry(0.008, Math.abs(y1 - y0)) : new THREE.PlaneGeometry(Math.abs(z1 - z0), 0.008);
  plane.rotateY(side * Math.PI / 2);
  P.add('hullDark', plane, side * (faceX + 0.001), (y0 + y1) / 2, (z0 + z1) / 2);
}

export function addK2BSkirtRun(P: K2BPort): void {
  const S = K2B_SKIRT;
  const groups: [number, number, boolean][] = [];
  const ends = [S.rakeZ, ...S.joints, S.rearZ];
  for (let k = 0; k < ends.length - 1; k++) groups.push([ends[k], ends[k + 1], k === 0]);
  for (const side of [-1, 1]) {
    for (const [front, rear, raked] of groups) {
      armourGroup(P, side, front, rear, raked);
      // the tile grid: joints every S.tile from the group's rear joint forward, clipped to the group's outline; a level row
      // joint; four-bolt clusters where they cross, bolt pairs at the joints' top and foot
      const frontAt = (y: number): number => (raked ? rakeZAt(y) : front);
      for (let z = rear + S.tile; z < frontAt(groupTop(front)) - 0.10; z += S.tile) {
        const lo = Math.max(skirtHem(z), raked ? rakeYAt(z) : -Infinity), hi = groupTop(z);
        if (hi - lo < 0.12) continue;
        seamLine(P, side, S.moduleOut, lo + 0.01, hi - 0.01, z, z);
        if (lo < S.rowY - 0.07) {
          for (const [dy, dz] of [[0.04, 0], [-0.04, 0], [0, 0.04], [0, -0.04]]) sideBolt(P, side, S.moduleOut, S.rowY + dy, z + dz);
        }
        for (const dz of [-0.035, 0.035]) {
          sideBolt(P, side, S.moduleOut, hi - 0.05, z + dz);
          if (lo === skirtHem(z)) sideBolt(P, side, S.moduleOut, lo + 0.05, z + dz);
        }
      }
      // the row joint, from where it clears the hem (the tail) to where it meets the front
      const rowRear = Math.max(rear, S.tailZ - (S.rowY - 0.03 - S.hemY) / S.tailRise) + 0.02;
      const rowFront = (raked ? rakeZAt(S.rowY) : front) - 0.02;
      if (rowFront - rowRear > 0.2) seamLine(P, side, S.moduleOut, S.rowY, S.rowY, rowFront, rowRear);
    }
    // the upper course, its bolt pairs at the segments' ends, and the top mounting rail along it
    for (let k = 0; k < S.course.length - 1; k++) {
      const front = S.course[k], rear = S.course[k + 1];
      courseSegment(P, side, front, rear);
      for (const z of [front - 0.07, rear + 0.07]) {
        const mid = (groupTop(z) + skirtTop(z)) / 2;
        for (const dy of [-0.045, 0.045]) sideBolt(P, side, S.courseOut, mid + dy, z);
      }
    }
    const rail = (z0: number, z1: number): void => {
      const y0 = skirtTop(z0), y1 = skirtTop(z1), len = Math.hypot(z0 - z1, y0 - y1);
      P.add('hullDetail', KIT.box(S.railOut - S.railIn, S.railH, len), side * (S.railIn + S.railOut) / 2,
        (y0 + y1) / 2 + S.railH / 2 - 0.004, (z0 + z1) / 2, Math.atan2(y1 - y0, z0 - z1), 0, 0);
    };
    rail(S.rakeZ + 0.005, TOP_BREAK_Z);                                        // 5 mm into the corner box's back
    rail(TOP_BREAK_Z, S.rearZ);
    // lifting eyes on the groups' top ledge, their rings turned to the side
    for (const z of S.eyes) KIT.liftEye(P, 'hullDetail', side * 1.832, groupTop(z) + 0.02, z, Math.PI / 2);
    // the rubber hem: level under the groups, then up the tail to the plate's end
    const fx = side * (S.fringeIn + S.fringeOut) / 2, fw = S.fringeOut - S.fringeIn, fh = S.hemY + 0.005 - S.fringeY;
    const levelFront = rakeZAt(S.hemY) - 0.03;
    P.add('hullRubber', KIT.box(fw, fh, levelFront - S.tailZ), fx, S.fringeY + fh / 2, (levelFront + S.tailZ) / 2);
    const tailEnd = -3.30, tailLen = Math.hypot(S.tailZ - tailEnd, skirtHem(tailEnd) - S.hemY);
    P.add('hullRubber', KIT.box(fw, fh, tailLen), fx, (S.hemY + skirtHem(tailEnd)) / 2 + 0.005 - fh / 2,
      (S.tailZ + tailEnd) / 2, Math.atan(S.tailRise), 0, 0);
  }
}

/** The fuel-can frame on the bustle's armoured core roof (turret frame: top 0.64, z -1.93..-2.17). */
const K2B_CANS = Object.freeze({
  x: -0.24, z: -2.06, roofY: 0.64,
  /** The frame: post half-spacing across (x) and fore-aft (z), foot and tray heights, the top bars' height. */
  halfW: 0.415, halfD: 0.09, footH: 0.035, trayH: 0.012, topY: 1.19,
  /** The two cans' centres either side of the frame's (x). */
  canDx: 0.19,
});

export function addK2BFuelCans(P: K2BPort): void {
  const { box, cylY } = KIT;
  const C = K2B_CANS, paint = 'turretFittingPaint';
  const footTop = C.roofY - 0.005 + C.footH, trayTop = footTop - 0.005 + C.trayH;
  // two transverse feet bolted to the core roof (5 mm into it), the floor tray on them
  for (const sz of [-1, 1]) {
    P.add(paint, box(2 * C.halfW + 0.03, C.footH, 0.04), C.x, C.roofY - 0.005 + C.footH / 2, C.z + sz * C.halfD);
    for (const sx of [-1, 1]) P.add('turretDark', cylY(0.012, 0.012, 0.012, 6), C.x + sx * (C.halfW - 0.05), footTop + 0.004, C.z + sz * C.halfD);
  }
  P.add(paint, box(2 * C.halfW - 0.02, C.trayH, 2 * C.halfD + 0.03), C.x, trayTop - C.trayH / 2, C.z);
  // corner posts up from the feet, joined fore-aft at mid-height and at the top
  for (const sx of [-1, 1]) {
    const x = C.x + sx * C.halfW;
    for (const sz of [-1, 1]) P.add(paint, box(0.028, C.topY - footTop + 0.005, 0.028), x, (footTop - 0.005 + C.topY) / 2, C.z + sz * C.halfD);
    P.add(paint, box(0.028, 0.028, 2 * C.halfD + 0.028), x, C.topY - 0.014, C.z);
    P.add(paint, box(0.026, 0.024, 2 * C.halfD), x, 0.92, C.z);
  }
  // the cans, upright on the tray (3 mm into it), stamped faces fore and aft, spouts outboard
  const full = P.q !== false;
  for (const s of [-1, 1]) {
    const can = jerrycanParts(1, [-1, 1], full);
    const parts = [can.body, ...can.stamps, can.spine, ...can.grips];
    for (const part of parts) {
      part.userData.designFamily = 'cot-field-jerry-can-v3';
      part.userData.issueDrab = true;
      P.add(paint, part, C.x + s * C.canDx, trayTop - 0.003, C.z, 0, s * Math.PI / 2, 0);
    }
    if (can.spout) P.add('turretDark', can.spout, C.x + s * C.canDx, trayTop - 0.003, C.z, 0, s * Math.PI / 2, 0);
  }
  // one webbing strap round the pair at two thirds of their height, over the stamped ridges, its buckle on the front run;
  // the latch bar across the handles between the frame's top bars
  const strapY = trayTop + 0.30, runZ = 0.0935 + 0.003, runW = 2 * (C.canDx + 0.1795);
  for (const sz of [-1, 1]) P.add('turretDark', box(runW, 0.035, 0.006), C.x, strapY, C.z + sz * runZ);
  for (const sx of [-1, 1]) P.add('turretDark', box(0.006, 0.035, 2 * runZ), C.x + sx * (runW / 2 - 0.003), strapY, C.z);
  P.add(paint, box(0.05, 0.045, 0.012), C.x, strapY, C.z + runZ + 0.006);
  P.add(paint, box(2 * C.halfW, 0.024, 0.04), C.x, C.topY - 0.017, C.z);
}
