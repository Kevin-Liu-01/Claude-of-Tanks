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
  /** Armour groups: inner face 8 mm into the K2 plate (outer face 1.74). r269s2 (both blind critics: "reads flush, like a
   *  panelled hull skin"): the faces stand out to 1.90, 17 cm proud of the plate, within the K2B's 3.834 m width. The
   *  lower tier is the outer face; the upper tier steps back 15 mm (a lit ledge and a shadow line at the tier joint). */
  moduleIn: 1.732, lowerOut: 1.900, upperOut: 1.885,
  /** Edge chamfers: the hem's outer edge, the tier ledge's, and the joints' (wide on each group's front end, so the
   *  armour's depth shows as a lit end face in the three-quarter views; narrow on its rear). */
  hemEdge: 0.015, ledgeEdge: 0.004, frontBevel: 0.045, rearBevel: 0.015,
  /** The top cap on each group: 5 mm into the course, 15 mm over the upper tier, 25 mm thick (5 mm into the tier). */
  capIn: 1.805, capOut: 1.900, capH: 0.025, capEdge: 0.010, capInset: 0.015,
  /** The upper course: inner face 5 mm into the deck sides (x 1.66), outer face, height, top and bottom outer chamfers. */
  courseIn: 1.655, courseOut: 1.81, courseH: 0.20, courseEdge: 0.02, courseFoot: 0.008,
  /** The top mounting rail on the course: x span, height (4 mm into the course top). */
  railIn: 1.655, railOut: 1.78, railH: 0.022,
  /** Hem: level. r269s2 (Opus critic): 11.5 cm lower than round 1's 0.565, over the road wheels' top third (wheels r
   *  0.3225 on 0.35 axles; research/k2b photos 2, 9, 13); the rubber fringe below it. */
  hemY: 0.45, fringeY: 0.395, fringeIn: 1.842, fringeOut: 1.858,
  /** The tail: from the plate's tail start the hem rises 0.74 per metre to the rear plate line (z -3.74, hem 1.27). */
  tailZ: -2.62, tailRise: 0.74, rearZ: -3.74,
  /** The tail group's inner face stays on the plate's line, outside the belt's lane (the strict clip run); behind the
   *  belt's reach (it rounds the sprocket by z -3.49) a closure block joins it to the stern's side (x 1.66). */
  closeZ: -3.53, closeIn: 1.655,
  /** The bow module's front: raked 45 degrees down and back from the corner box's lower rear corner (z 2.97, y 1.15) to
   *  a knee, below which its lower front edge rakes back at 30 degrees to the hem (r269s2, Opus critic). */
  rakeZ: 2.97, rakeY: 1.15, kneeY: 0.77, chinSlope: Math.tan(30 * Math.PI / 180),
  /** Group joints (front to rear; the bow module runs forward to the rake). */
  joints: Object.freeze([1.29, -0.23, -1.75, -2.89]),
  /** Tile width (from each group's rear joint forward) and the tier joint (mid-height of the groups aft). */
  tile: 0.38, rowY: 0.905,
  /** Bolt heads: 45 mm across corners, 15 mm proud of the face (5 mm into it); a 2x2 cluster's half-spacing; their inset
   *  from a group's hem, top and ends. */
  boltR: 0.0225, boltLen: 0.020, boltSet: 0.005, cluster: 0.035, edgeInset: 0.05,
  /** The end bolts' inset from a group's front joint (past its wide bevel) and its rear joint (past the narrow one). */
  frontInset: 0.075, rearInset: 0.04,
  /** The upper course's joints (front to rear), split at the top line's break. */
  course: Object.freeze([2.975, TOP_BREAK_Z, 0.72, -0.40, -1.52, -2.64, -3.74]),
  /** Lifting eyes on the groups' top caps (z). */
  eyes: Object.freeze([1.55, 0.53, -0.99, -2.32]),
});

const skirtTop = (z: number): number => k2SkirtTopAt(z);
/** The armour groups' top: the course's foot. */
const groupTop = (z: number): number => skirtTop(z) - K2B_SKIRT.courseH;
const skirtHem = (z: number): number => {
  const S = K2B_SKIRT;
  return z < S.tailZ ? S.hemY + (S.tailZ - z) * S.tailRise : S.hemY;
};
/** The bow module's front: its z at height y (the 45-degree rake above the knee, the 30-degree chin below it). */
const kneeZ = K2B_SKIRT.rakeZ - (K2B_SKIRT.rakeY - K2B_SKIRT.kneeY);
const bowFrontZ = (y: number): number => {
  const S = K2B_SKIRT;
  return y >= S.kneeY ? S.rakeZ - (S.rakeY - y) : kneeZ - (S.kneeY - y) / S.chinSlope;
};
/** The bow module's front edge's height at station z (the rake above the knee, the chin below it). */
const bowFrontYAt = (z: number): number => {
  const S = K2B_SKIRT;
  return z >= kneeZ ? S.rakeY - (S.rakeZ - z) : S.kneeY - (kneeZ - z) * S.chinSlope;
};
/** Where the tail's rising hem meets a height. */
const tailZAt = (y: number): number => K2B_SKIRT.tailZ - (y - K2B_SKIRT.hemY) / K2B_SKIRT.tailRise;

/** A section ring (x, y) with chamfered outer bottom and top edges; `pull` sets the outer face in (an end bevel). */
function sectionRing(xi: number, xo: number, h: number, t: number, bottomEdge: number, topEdge: number, pull: number):
  [number, number][] {
  const o = xo - pull;
  return [[xi, h], [o - bottomEdge, h], [o, h + bottomEdge], [o, t - topEdge], [o - topEdge, t], [xi, t]];
}

interface SkirtTier {
  /** outer face x */
  readonly xo: number;
  readonly bottom: (z: number) => number;
  readonly top: (z: number) => number;
  readonly bottomEdge: number;
  readonly topEdge: number;
}

/**
 * One tier of an armour group from `front` to `rear` (z, front > rear): a closed convex stock whose rings follow its
 * bottom and top lines, its outer vertical edges bevelled at both ends (wide at the front). `bow` follows the bow
 * module's raked front (bowFrontZ) instead of a station.
 */
function tierStock(side: number, tier: SkirtTier, front: number, rear: number, bow: boolean): THREE.BufferGeometry {
  const S = K2B_SKIRT, xi = S.moduleIn;
  const pts: Vec3Tuple[] = [];
  const ring = (z: number, pull: number): void => {
    const h = tier.bottom(z), t = tier.top(z), span = t - h;
    const be = Math.min(tier.bottomEdge, span / 3), te = Math.min(tier.topEdge, span / 3);
    for (const [x, y] of sectionRing(xi, tier.xo, h, t, be, te, pull)) pts.push([side * x, y, z]);
  };
  ring(rear, S.rearBevel);
  ring(rear + S.rearBevel, 0);
  for (const z of [TOP_BREAK_Z, S.tailZ, tailZAt(S.rowY)]) {
    if (z < front - S.frontBevel - 0.01 && z > rear + S.rearBevel + 0.01) ring(z, 0);
  }
  if (!bow) {
    ring(front, S.frontBevel);
    ring(front - S.frontBevel, 0);
  } else {
    // the raked front: every vertex on the front planes (its outer ones bevelled in) and a bevel's depth behind; the top
    // meets the rake where the tier's top line crosses it; the knee is a vertex of its own
    let t: number = S.rakeY;
    for (let k = 0; k < 6; k++) t = tier.top(bowFrontZ(t));
    const h = tier.bottom(bowFrontZ(tier.bottom(front)));
    for (const [back, pull] of [[0, S.frontBevel], [S.frontBevel, 0]] as const) {
      const ringPts = sectionRing(xi, tier.xo, h, t, tier.bottomEdge, tier.topEdge, pull);
      if (S.kneeY > h && S.kneeY < t) ringPts.push([xi, S.kneeY], [tier.xo - pull, S.kneeY]);
      for (const [x, y] of ringPts) pts.push([side * x, y, bowFrontZ(y) - back]);
    }
  }
  return convexStock(pts);
}

/** A hex bolt head on a side face at (y, z): 45 mm across, 15 mm proud, 5 mm into the face. */
function sideBolt(P: K2BPort, side: number, faceX: number, y: number, z: number): void {
  const S = K2B_SKIRT;
  P.add('hullDark', KIT.cylX(S.boltR, S.boltLen, P.q ? 6 : 4), side * (faceX - S.boltSet + S.boltLen / 2), y, z);
}

/** A dark joint line 1 mm off the outer face: vertical (dy > dz) or level. */
function seamLine(P: K2BPort, side: number, faceX: number, y0: number, y1: number, z0: number, z1: number): void {
  const vertical = Math.abs(y1 - y0) > Math.abs(z1 - z0);
  const plane = vertical ? new THREE.PlaneGeometry(0.008, Math.abs(y1 - y0)) : new THREE.PlaneGeometry(Math.abs(z1 - z0), 0.008);
  plane.rotateY(side * Math.PI / 2);
  P.add('hullDark', plane, side * (faceX + 0.001), (y0 + y1) / 2, (z0 + z1) / 2);
}

/**
 * One armour group: the bow module (raked front, one tier, tall panels) or a two-tier group (the lower tier the outer
 * face, the upper set back 15 mm on a lit ledge with a shadow line over it), a top cap on it, its tile joints, and a
 * 2x2 bolt cluster at every tile corner (photos 5, 9, 10): four bolts round each crossing of joints, two along the hem,
 * the top and the group's ends, one in each outer corner.
 */
function armourGroup(P: K2BPort, side: number, front: number, rear: number, bow: boolean): void {
  const S = K2B_SKIRT;
  const lowerTop = (): number => S.rowY + 0.004;
  if (bow) {
    P.add('hull', tierStock(side, { xo: S.lowerOut, bottom: skirtHem, top: groupTop, bottomEdge: S.hemEdge, topEdge: 0.004 },
      front, rear, true));
  } else {
    P.add('hull', tierStock(side, { xo: S.lowerOut, bottom: skirtHem, top: lowerTop, bottomEdge: S.hemEdge,
      topEdge: S.ledgeEdge }, front, Math.max(rear, tailZAt(S.rowY - 0.03)), false));
    P.add('hull', tierStock(side, { xo: S.upperOut, bottom: (z) => Math.max(S.rowY, skirtHem(z)), top: groupTop,
      bottomEdge: 0.003, topEdge: 0.004 }, front, rear, false));
  }
  // the top cap, 5 mm into the tier and the course, overhanging the upper tier; split where the top line breaks
  const capFront = (bow ? bowFrontZ(groupTop(front)) : front) - S.capInset, capRear = rear + S.capInset;
  const capStops = [capFront, ...(TOP_BREAK_Z < capFront && TOP_BREAK_Z > capRear ? [TOP_BREAK_Z] : []), capRear];
  for (let k = 0; k < capStops.length - 1; k++) {
    const pts: Vec3Tuple[] = [];
    for (const [z, pull] of [[capStops[k], k === 0 ? S.capEdge : 0], [capStops[k + 1], k === capStops.length - 2 ? S.capEdge : 0]] as const) {
      const y0 = groupTop(z) - 0.005, y1 = y0 + S.capH, o = S.capOut - pull;
      for (const [x, y] of [[S.capIn, y0], [o, y0], [o, y1 - S.capEdge], [o - S.capEdge, y1], [S.capIn, y1]]) pts.push([side * x, y, z]);
    }
    P.add('hull', convexStock(pts));
  }
  // the tier joint: a shadow line on the upper tier just over the lower tier's ledge
  const frontAtY = (y: number): number => (bow ? bowFrontZ(y) : front);
  if (!bow) {
    const rowRear = Math.max(rear, tailZAt(S.rowY - 0.02)) + S.rearBevel, rowFront = front - S.frontBevel;
    const shadow = new THREE.PlaneGeometry(rowFront - rowRear, 0.014);
    shadow.rotateY(side * Math.PI / 2);
    P.add('hullDark', shadow, side * (S.upperOut + 0.001), S.rowY + 0.009, (rowFront + rowRear) / 2);
  }
  // tile joints and bolts
  const faceAt = (y: number): number => (bow || y < S.rowY ? S.lowerOut : S.upperOut);
  const onFace = (y: number, z: number): boolean => y > skirtHem(z) + 0.035 && y < groupTop(z) - 0.035
    && z > rear + 0.03 && z < frontAtY(y) - 0.04;
  const columns: number[] = [];
  for (let z = rear + S.tile; z < frontAtY(groupTop(front)) - 0.10; z += S.tile) {
    // the joint line on each tier's face, clipped to the group's outline (the bow module's raked front and chin)
    const lo = bow ? Math.max(skirtHem(z), bowFrontYAt(z)) : skirtHem(z), hi = groupTop(z);
    if (hi - lo < 0.12) continue;
    columns.push(z);
    if (bow) {
      seamLine(P, side, S.lowerOut, lo + 0.01, hi - 0.01, z, z);
    } else {
      if (S.rowY - lo > 0.06) seamLine(P, side, S.lowerOut, lo + 0.01, S.rowY - 0.004, z, z);
      seamLine(P, side, S.upperOut, Math.max(S.rowY, lo) + 0.012, hi - 0.01, z, z);
    }
  }
  const rows = (z: number): [number, number, number][] => [        // [y, the up quadrant's y, the down quadrant's y]
    [skirtHem(z), skirtHem(z) + S.edgeInset, NaN],
    [S.rowY, S.rowY + S.cluster, S.rowY - S.cluster],
    [groupTop(z), NaN, groupTop(z) - S.edgeInset],
  ];
  const nodes: [number, number, number][] = [                       // [z, the rear quadrant's z, the front quadrant's z]
    [rear, NaN, rear + S.rearInset],
    ...columns.map((z): [number, number, number] => [z, z - S.cluster, z + S.cluster]),
  ];
  for (const [, zr, zf] of nodes) {
    for (const bz of [zr, zf]) {
      if (Number.isNaN(bz)) continue;
      for (const [, yu, yd] of rows(bz)) {
        for (const by of [yu, yd]) if (!Number.isNaN(by) && onFace(by, bz)) sideBolt(P, side, faceAt(by), by, bz);
      }
    }
  }
  // the front end's bolts, a cluster's width behind the joint (the bow module's along its raked front)
  for (const [, yu, yd] of rows(front)) {
    for (const by of [yu, yd]) {
      if (Number.isNaN(by)) continue;
      const bz = frontAtY(by) - S.frontInset;
      if (onFace(by, bz)) sideBolt(P, side, faceAt(by), by, bz);
    }
  }
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

export function addK2BSkirtRun(P: K2BPort): void {
  const S = K2B_SKIRT;
  const groups: [number, number, boolean][] = [];
  const ends = [S.rakeZ, ...S.joints, S.rearZ];
  for (let k = 0; k < ends.length - 1; k++) groups.push([ends[k], ends[k + 1], k === 0]);
  for (const side of [-1, 1]) {
    for (const [front, rear, bow] of groups) armourGroup(P, side, front, rear, bow);
    // the stern closure: from the tail group's inner face in to the stern's side, under the course, behind the belt
    const close: Vec3Tuple[] = [];
    for (const z of [S.closeZ, S.rearZ]) {
      for (const x of [S.closeIn, S.moduleIn]) close.push([side * x, skirtHem(z) + 0.01, z], [side * x, groupTop(z), z]);
    }
    P.add('hull', convexStock(close));
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
    // lifting eyes on the groups' top caps, their rings turned to the side
    for (const z of S.eyes) KIT.liftEye(P, 'hullDetail', side * 1.855, groupTop(z) - 0.005 + S.capH + 0.015, z, Math.PI / 2);
    // the rubber hem: level under the groups from the bow module's chin, then up the tail to the plate's end
    const fx = side * (S.fringeIn + S.fringeOut) / 2, fw = S.fringeOut - S.fringeIn, fh = S.hemY + 0.005 - S.fringeY;
    const levelFront = bowFrontZ(S.hemY) - 0.03;
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
