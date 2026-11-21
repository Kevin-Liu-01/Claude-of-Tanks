// The Strv 103 family's casemate (274, the Leclerc rebuild pattern: closed section solids, not stacked slabs): the
// chamfered tub between the tracks and the sponsoned upper body over them, both closed sectionSolid lofts of the
// measured stations (strv103Frame.ts); the fixed gun in its glacis housing; the front-engine cooling louvres.
// First-party: Kevin B. Liu (NOTICE.md).

import * as THREE from 'three';
import { KIT, muzzleBore, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { withSeatRole } from '../spareTrackSeat.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { FRAMES, GLACIS_PITCH, GUNS, SEAM, casemateFor, glacisY, type Strv103Mark } from './strv103Frame.ts';

/** A fixed hull gun's port, the glacis it leaves through and the housing over it (`addFixedGunPort`). */
export interface FixedGunPort {
  /** The bore axis height (the gun runs along z at x 0). */
  readonly axisY: number;
  /** The housing's level top. */
  readonly topY: number;
  /** The housing's half-widths at its foot and at its top. */
  readonly halfW: readonly [number, number];
  /** The glacis height under the housing's centreline, rear to front: [z, y]. The last station is the port face. */
  readonly stations: readonly (readonly [number, number])[];
  /** The port ring on the housing's face round the tube (armour: its bore stands clear of the tube by the keep), its
   * outer radius, its length and how far it stands proud of the face; its lower arc runs into the glacis. */
  readonly ring: { readonly rIn: number; readonly rOut: number; readonly length: number; readonly proud: number };
}
/**
 * 259 (owner on both Strv 103s: "dont allow the strv 103 bs gun to like glitch through the front of its gate"): the fixed
 * tube left the hull obliquely through the glacis plate, which cut it over a metre and a half, and the nose fittings
 * stood across it. It now leaves through an armoured housing that rides the glacis over it, by a ring on the housing's
 * front face, and ahead of that face it stands clear of every hull part (gunHullClearance.test-support.mjs
 * fixedGunHullProbe). The housing foot sinks 3 cm into the glacis at each station. Publishes the port as
 * hullG.userData.fixedGunPort: the housing's face (faceZ) and the ring's front (z).
 */
export function addFixedGunPort(
  P: { readonly hullG: THREE.Group; readonly q?: boolean; add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void },
  port: FixedGunPort,
): void {
  const SINK = 0.03;
  const [wb, wt] = port.halfW;
  for (let i = 0; i + 1 < port.stations.length; i++) {
    const [z0, g0] = port.stations[i], [z1, g1] = port.stations[i + 1];
    P.add('hull', orientedSlab(
      [-wb, g0 - SINK, z0], [wb, g0 - SINK, z0], [wb, g1 - SINK, z1], [-wb, g1 - SINK, z1],
      [-wt, port.topY, z0], [wt, port.topY, z0], [wt, port.topY, z1], [-wt, port.topY, z1]));
  }
  const faceZ = port.stations[port.stations.length - 1][0];
  const { rIn, rOut, length, proud } = port.ring;
  const ring = new THREE.LatheGeometry([[rIn, 0], [rOut, 0], [rOut, length], [rIn, length], [rIn, 0]]
    .map(([r, y]) => new THREE.Vector2(r, y)), P.q ? 28 : 16);
  ring.rotateX(Math.PI / 2);
  P.add('hull', ring, 0, port.axisY, faceZ + proud - length);
  P.hullG.userData.fixedGunPort = { faceZ, z: faceZ + proud, axisY: port.axisY, rIn };
}

/** The tub's section: a flat belly between the tracks, chamfered up into vertical walls to the seam. */
function tubRing(belly: number): SectionPoint[] {
  const c = Math.min(0.16, (SEAM - belly) * 0.4);
  return [[-0.70, belly], [0.70, belly], [0.94, belly + c], [0.94, SEAM], [-0.94, SEAM], [-0.94, belly + c]];
}

/** The upper body's section over the tracks: the sponson's bevelled lower edge, its side leaning in 4 cm, the chamfered
 * deck edge. The chamfers scale down where the beak thins the body. */
function bodyRing(deck: number, halfW: number): SectionPoint[] {
  const h = deck - SEAM, lo = Math.min(0.10, h * 0.35), hi = Math.min(0.08, h * 0.30);
  return [[-(halfW - 0.16), SEAM], [halfW - 0.16, SEAM], [halfW, SEAM + lo], [halfW - 0.04, deck - hi], [halfW - 0.12, deck],
    [-(halfW - 0.12), deck], [-(halfW - 0.04), deck - hi], [-halfW, SEAM + lo]];
}

/** The closed casemate: the tub and the upper body, two section solids over the same stations; the welded seams. */
export function casemate(P: TankBuilderPort, mark: Strv103Mark): void {
  const CASEMATE = casemateFor(mark);
  P.add('hull', sectionSolid(CASEMATE.map((s) => ({ z: s.z, ring: tubRing(s.belly) })), { sideQuadDiagonal: 'convex' }));
  P.add('hull', sectionSolid(CASEMATE.map((s) => ({ z: s.z, ring: bodyRing(s.deck, s.halfW) })), { sideQuadDiagonal: 'convex' }));
  P.add('hullDark', KIT.box(3.20, 0.012, 0.02), 0, 1.853, 0.62);                    // glacis-break weld
  P.add('hullDark', KIT.box(3.10, 0.012, 0.02), 0, 1.895, -2.40);                   // rear deck weld
}

export function fixedGun(P: TankBuilderPort, mark: Strv103Mark): void {
  const run = GUNS[mark], F = FRAMES[mark], AXIS_Y = F.axisY;
  const mouthR = run.tube[1].r - 0.008;
  muzzleBore(P, { z: run.muzzleZ, r: mouthR, y: AXIS_Y, parent: 'hullG' });
  for (const s of run.tube) {
    const len = s.z0 - s.z1;
    P.add(s.dark ? 'hullGunDark' : 'hullGun', KIT.cylZ(s.r, len, P.q ? 18 : 12, s.r2), 0, AXIS_Y, s.z1 + len / 2);
  }
  if (mark === 'e') {
    // the muzzle reference sensor on its strap over the collar
    P.add('hullGunDark', KIT.box(0.05, 0.035, 0.07), 0, AXIS_Y + 0.125, 5.52);
  }
  if (mark === 'x') {
    // the muzzle brake's five ports either side, the reference sensor behind it
    for (let k = 0; k < 5; k++) for (const sd of [-1, 1]) {
      P.add('hullGunDark', KIT.box(0.02, 0.10, 0.045), sd * 0.170, AXIS_Y, 5.98 + k * 0.064);
    }
    P.add('hullGunDark', KIT.box(0.05, 0.035, 0.07), 0, AXIS_Y + 0.140, 5.82);
  }
  // 259: the tube leaves through the armoured housing that rides the glacis, by a cast ring on its face
  const lift = AXIS_Y - 1.59;
  addFixedGunPort(P, { axisY: AXIS_Y, topY: F.housingTop, halfW: F.housingHalfW,
    stations: [[1.26, 1.747 + lift], [1.55, 1.70 + lift * 0.8], [2.36, 1.57 + lift * 0.5], [2.95, 1.475 + lift * 0.4]],
    ring: { rIn: F.tubeR + 0.03, rOut: F.tubeR + 0.07, length: 0.10, proud: 0.06 } });
  // the travel lock on the beak, open in battle: two posts outboard of the tube, a saddle under it, the hinged bar over it
  const tubeR = F.tubeR, postX = tubeR + 0.074, postH = 0.30 + lift;
  for (const s of [-1, 1]) {
    P.add('hullDetail', KIT.box(0.05, postH, 0.07), s * postX, 1.455 + postH / 2, 3.28);
    P.add('hullDark', KIT.cylX(0.022, 0.07, 10), s * postX, AXIS_Y + tubeR + 0.047, 3.28);
  }
  P.add('hullDetail', KIT.box(postX * 2 + 0.06, 0.045, 0.08), 0, AXIS_Y + tubeR + 0.047, 3.28);
  P.add('hullDetail', KIT.box(0.24, 0.025, 0.08), 0, AXIS_Y - tubeR - 0.013 - 0.0125, 3.28); // saddle 1.3 cm under the tube
  P.turretG.position.set(0, AXIS_Y, 0.40);
  P.gunG.position.set(0, 0, 0);
  P.muzzleZ = run.muzzleZ - 0.42;
}
/** A louvre bank lying on an armour plane: a painted frame round a dark floor, angled blades leaning over each other. */
function louvreBank(P0: TankBuilderPort, o: { x: number; y: number; z: number; pitch: number; width: number;
  length: number; blades: number }): void {
  withSeatRole(P0, 'grille', (P) => {
    const { box } = KIT;
    const c = Math.cos(o.pitch), sn = Math.sin(o.pitch);
    const at = (normal: number, along: number): [number, number] => [o.y - along * sn + normal * c, o.z + along * c + normal * sn];
    const FRAME_H = 0.05, FRAME_W = 0.04;
    for (const end of [-1, 1]) {
      const [y, z] = at(FRAME_H / 2, end * (o.length / 2 - FRAME_W / 2));
      P.add('hullPaintedDetail', box(o.width, FRAME_H, FRAME_W), o.x, y, z, o.pitch, 0, 0);
      const [ys, zs] = at(FRAME_H / 2, 0);
      P.add('hullPaintedDetail', box(FRAME_W, FRAME_H, o.length - 2 * FRAME_W), o.x + end * (o.width / 2 - FRAME_W / 2), ys, zs,
        o.pitch, 0, 0);
    }
    const [yf, zf] = at(0.005, 0);
    P.add('hullDark', box(o.width - 2 * FRAME_W, 0.010, o.length - 2 * FRAME_W), o.x, yf, zf, o.pitch, 0, 0);
    const open = o.length - 2 * FRAME_W, step = open / o.blades, LEAN = 0.5, DEPTH = step / Math.cos(LEAN) * 1.1;
    for (let i = 0; i < o.blades; i++) {
      const along = -open / 2 + step * (i + .5);
      const [y, z] = at(0.010 + DEPTH * Math.sin(LEAN) / 2, along);
      P.add('hullPaintedDetail', box(o.width - 2 * FRAME_W - 0.01, 0.008, DEPTH), o.x, y, z, o.pitch + LEAN, 0, 0);
    }
  });
}
/** The front-engine cooling: the two glacis banks flanking the gun housing, the deck field behind the glacis break and
 * the twin grilles over the rear bay. */
export function ventilation(P: TankBuilderPort, mark: Strv103Mark): void {
  const { box, cylY } = KIT;
  for (const s of [-1, 1]) louvreBank(P, { x: s * 0.57, z: 1.62, y: glacisY(1.62), pitch: GLACIS_PITCH,
    width: 0.72, length: 1.20, blades: 16 });
  for (const s of [-1, 1]) P.add('hullDetail', box(0.76, 0.05, 0.05), s * 0.55, glacisY(2.52) + 0.025, 2.52, GLACIS_PITCH, 0, 0);
  // the deck field behind the glacis break (the 152's breech hump stands there: its field splits either side)
  if (mark === 'x') for (const sd of [-1, 1]) louvreBank(P, { x: sd * 0.88, z: 0.30, y: 1.85 + (0.62 - 0.30) * 0.03 / 1.22,
    pitch: Math.atan(0.03 / 1.22), width: 0.92, length: 0.72, blades: 10 });
  else louvreBank(P, { x: 0, z: 0.30, y: 1.85 + (0.62 - 0.30) * 0.03 / 1.22, pitch: Math.atan(0.03 / 1.22),
    width: 2.40, length: 0.72, blades: 10 });
  // (critic r6: the deck read as many small plates) one wide grille over the rear bay, the fillers; no vent box
  louvreBank(P, { x: 0, z: -2.30, y: 1.892, pitch: -0.02, width: 2.20, length: 0.86, blades: 12 });
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.09, 0.09, 0.03, 10), s * 1.12, 1.895, -1.48);       // fuel fillers
  // the S-tank's ribbed glacis across its outer strips (the concept marks carry appliqué there)
  if (mark === 'a' || mark === 'b' || mark === 'p') for (const s of [-1, 1]) for (let k = 0; k < 10; k++) {
    const z = 0.82 + k * 0.205;
    P.add('hullPaintedDetail', box(0.58, 0.028, 0.05), s * 1.25, glacisY(z) + 0.012, z, GLACIS_PITCH, 0, 0);
  }
}
