// Italian tracked-vehicle family — §5.248 GROUND-UP REBUILDS (italy wave).
//
// All geometry in this module is first-party procedural, authored §K-style
// (measure -> loft to measured lines -> close with real geometry -> prove in
// pixels) from the two LOCAL-ONLY §5.248 batch-B prints:
//   ariete_c1_arrafi.glb  (CC-BY-4.0 M. M. Arrafi; semantic material split
//     Hull/Turret/Cannon/SideSkirts/Applique/Glass/Gear) — governs c1_ariete_proto_serie1
//     and serves as the c2_ariete_proto influence print.
//   carro45t_hlebov.glb   (CC-BY-4.0 D. Hlebov; paper vehicle — the print IS
//     the primary source; orientation heuristic misfire adjudicated: gun end
//     carries the glacis+casemate, sprocket at the stern).
// Measured via tools/vertex-extract.mjs + the gate's own traced curves
// (tools/tmp-italy-curves.mjs -> scratchpad gatecurves; the gate curves are
// the authoritative hull/turret split — the extract's follower regex missed
// Object_2/6, so raw-extract splits are cited only where the gate agrees).
// No source object, topology, texture, or converted vertex payload ships.
//
// FRAME LAW (packet-documented): every c1_ariete_proto_serie1/_c2 coordinate below is the
// arrafi print's measured line with z normalized x1.08803 (published hull
// 7.59 / print hull-mask 6.976 — the print is uniformly z-compressed; y/x
// carried at width-anchored print scale, which reads height/width right).
// The gate measures the UNWARPED print, so length-coupled curve rows carry a
// structural residual until the §E z-warp lands (recipe banked in the
// packet); dims/stations/floaters and all y/x-driven reads are exact.
// Carro's chassis retains its source dimensions (6.98/10.60/3.43 m).
// Its turret is the owner-approved continuous-roof redesign of 2026-09-29;
// the dated concept packet governs that shape, not the historical print gate.
// The base `c1_ariete_preserie` (Preserie) stays its own graduated tank in misc.ts —
// UNTOUCHED donor, byte-held.

import * as THREE from 'three';
import { antennaPart } from './antennaPart.ts';
import { KIT, FITTINGS, MUDGUARDS, muzzleBore, orientedSlab } from './kit.ts';
import { withSeatRole } from '../spareTrackSeat.ts';
import { buildAriete } from './misc.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { mount as addFitting } from './fittingMount.ts';
import { arieteLampCluster, arieteSideLouvre, attilaSightHead, boltHeads, wedge } from './arieteMkParts.ts';
import { sampleArmorFace } from './armorFaceSampling.ts';
import { fitsInSkirt, profileSkirtGeometry, skirtBand, skirtBottomAt, skirtSegment, skirtTopAt, type ProfileSkirt } from './profileSkirt.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import { ARIETE_PROTO_TURRET_LIFT_M } from '../modern3Specs.ts';
import { drainTankBuild, steppedBuilder, withBuildSteps, type TankProfileBuild } from '../tankBuildCooperation.ts';

type Vec3Tuple = [number, number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';
type Quad = [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple];
type ArieteMark = 'c1' | 'c2';

type ItalyBuilderPort = Omit<TankBuilderPort, 'addGunExtra' | 'addGunExtraDark'> & {
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
};

interface ArmorFaceSample {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  du?: THREE.Vector3;
  dv?: THREE.Vector3;
}

interface ArieteC2EraReceipt {
  carrierDerivedTransforms: boolean;
  contactEmbedM: number;
  maxSupportGapM: number;
  faceNormalAlignmentDeg: number;
  turretCheekCarrier: 'forward-face';
  turretCheekSides: number;
  turretCheekRows: number;
  turretCheekColumnsPerSide: number;
  turretCheekForwardNormalDotMin: number;
  turretCheekCassettes: number;
  turretSideCassettes: number;
  turretBustleCassettes: number;
  sideSkirtCassettes: number;
  totalTurretCassettes?: number;
  totalCassettes?: number;
}

// Sample the actual carrier quad so add-on modules inherit its compound
// pitch/sweep instead of approximating the surface with hand-tuned Eulers.
// Local +Y is the carrier normal and local +Z follows the selected course.
// Extending the normal dimension inward by `embed` guarantees physical
// overlap while keeping the visible outer face at the requested datum.
function faceSeatedArmorCassette(
  P: ItalyBuilderPort,
  owner: VehicleAssemblyOwner,
  face: ArmorFaceSample,
  courseAxis: THREE.Vector3,
  w: number,
  h: number,
  d: number,
  embed: number,
  // 267 (lane italy-korea-bmp-267): 'plate' is the Ariete C2's bolted add-on armour (C2 photographs: plain flat blocks
  // with chamfered edges, no dark lid), `bevel` its edge chamfer and `bolts` its corner bolt heads; 'era' (default) is the
  // C1 prototype's trials cassette with its lid.
  style: { kind: 'era' } | { kind: 'plate'; bevel: number; bolts: boolean } = { kind: 'era' },
): void {
  const normal = face.normal.clone().normalize();
  const zAxis = courseAxis.clone().addScaledVector(normal,
    -courseAxis.dot(normal)).normalize();
  const xAxis = new THREE.Vector3().crossVectors(normal, zAxis).normalize();
  const basis = new THREE.Matrix4().makeBasis(xAxis, normal, zAxis);
  const rotation = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromRotationMatrix(basis), 'XYZ');
  const center = face.point.clone().addScaledVector(normal, h / 2 - embed / 2);
  const armorBucket = owner === 'hull' ? 'hull' : 'turret';
  const detailBucket = owner === 'hull' ? 'hullDark' : 'turretDark';
  if (style.kind === 'plate') {
    const b = style.bevel, hw = w / 2, hd = d / 2;
    P.visualEraCluster(`italy-layered-${owner}`, owner, () => {
      P.add(armorBucket, wedge([-hw, -embed, hd], [hw, -embed, hd], [hw, -embed, -hd], [-hw, -embed, -hd],
        [-hw + b, h, hd - b], [hw - b, h, hd - b], [hw - b, h, -hd + b], [-hw + b, h, -hd + b]),
      face.point.x, face.point.y, face.point.z, rotation.x, rotation.y, rotation.z);
    });
    if (style.bolts && P.q) {
      const at = (u: number, v: number): THREE.Vector3 => face.point.clone().addScaledVector(xAxis, u)
        .addScaledVector(normal, h).addScaledVector(zAxis, v);
      const iu = hw - b - 0.03, iv = hd - b - 0.03;
      boltHeads(P, owner === 'hull' ? 'hullDetail' : 'turretDetail',
        [at(-iu, iv), at(iu, iv), at(iu, -iv), at(-iu, -iv)], normal);
    }
    return;
  }
  P.visualEraCluster(`italy-layered-${owner}`, owner, () => {
    P.add(armorBucket, KIT.box(w, h + embed, d), center.x, center.y, center.z,
      rotation.x, rotation.y, rotation.z);
    const lidCenter = face.point.clone().addScaledVector(normal, h + 0.006);
    P.add(detailBucket, KIT.box(w * 0.86, 0.012, d * 0.84),
      lidCenter.x, lidCenter.y, lidCenter.z,
      rotation.x, rotation.y, rotation.z);
  });
}

// flush hatch ring + coaming (shared by the italy builders)
function cupolaRing(
  P: ItalyBuilderPort,
  x: number,
  yLocal: number,
  zLocal: number,
  r: number,
): void {
  const { box, cylY, torus } = KIT;
  P.add('turret', cylY(r, r + 0.015, 0.055, P.q ? 18 : 10), x, yLocal + 0.028, zLocal);
  P.add('turretDark', torus(r * 0.96, 0.013, 16), x, yLocal + 0.062, zLocal);
  P.add('turret', box(0.07, 0.04, 0.09), x + r * 0.9, yLocal + 0.03, zLocal);
  P.add('turret', box(0.07, 0.04, 0.09), x - r * 0.9, yLocal + 0.03, zLocal);
}

// ---------------------------------------------------------------------------
// C1 Ariete (production) + C2 Ariete (AMV upgrade package over the C1 base).
// All lines cited from the gate-true decode (gatecurves, world frame):
//   hull: deck 1.50 (zW -2.44..-1.08) -> dip band 1.34-1.45 (-1.07..-0.55) ->
//     amidships cage/bin plateau 1.95-2.16 (-0.45..+1.05) -> fore fairing
//     sloping 2.0 -> 1.36 (+0.4..+1.8) -> glacis 1.32@1.9 -> 1.25@3.4 ->
//     nose 1.16-1.20@3.6-3.79; stern ramp liftoff -2.44, 0.30@-2.92,
//     0.66@-3.29, 0.87@-3.67, tail lip 1.47-1.51.
//   turret: arrow cheeks (±0.2,2.19)->(±1.08,1.73), walls ±1.24-1.28, wing
//     GALIX zone ±1.31-1.40 (-0.44..-0.86), full-run side racks ±1.52
//     (+1.0..-2.95), roof 2.00 front -> 2.16 mid, sight cluster 2.4-2.54,
//     bustle roof 2.16 to -1.69 then baskets 2.03-1.98 / bottoms 1.43 to
//     -2.44 (center) and -3.0 (side rails); ring skirt dips 1.21-1.26
//     (+0.30..+0.72); mantlet band 1.55-1.86 (+1.7..+2.12).
// The C2 package regions (cheek armor, glacis add-on, full-run skirts, new
// sight housings, APU) are photo-class per the round brief.
// 2026-10-25 (the owner: "update the sideskirts of tanks like the m551a1 tts and challenger 3 ... to not be just
// rectangles, and instead match the geometries of their upperglacis and hull side profile ... same applies for c2 and c1
// prototype"): the heavy run is one profile (profileSkirt.ts) its panels are cut from, on the C2's carrier plane. Its
// top is the fender seat's, 1.42 aft and falling with the forward shelf's glacis line (1.42 at the side wall's front,
// z 1.67, to 1.26 at 3.09), so no panel stands over the shelf; its bottom is the accepted 0.60 hem, raked up over the
// idler's approach to the bow (from 2.55) and, on the C2's full run, over the sprocket's departure (aft of -2.60).
const ARIETE_SKIRT: ProfileSkirt = { inner: 1.725, outer: 1.76, stations: [
  [-2.92, 0.78, 1.42], [-2.60, 0.60, 1.42], [1.67, 0.60, 1.42], [2.55, 0.60, 1.3208], [3.09, 0.95, 1.26],
] };
// ---------------------------------------------------------------------------
function* buildArieteMkSteps(P: ItalyBuilderPort, mark: ArieteMark): TankProfileBuild {
  const { box, cylY, cylZ, openRackGrid, torus, buildGun, buildRunningGear,
    liftEye, periscope, towCable, stowage } = KIT;
  const slab = orientedSlab;
  const { rng } = P;
  const c2 = mark === 'c2';
  const C2_ERA_EMBED_M = 0.012;
  const c2EraReceipt: ArieteC2EraReceipt | null = c2 ? {
    carrierDerivedTransforms: true,
    contactEmbedM: C2_ERA_EMBED_M,
    maxSupportGapM: 0,
    faceNormalAlignmentDeg: 0,
    turretCheekCarrier: 'forward-face',
    turretCheekSides: 2,
    turretCheekRows: 2,
    turretCheekColumnsPerSide: 5,
    turretCheekForwardNormalDotMin: 1,
    turretCheekCassettes: 0,
    turretSideCassettes: 0,
    turretBustleCassettes: 0,
    sideSkirtCassettes: 0,
  } : null;
  // Release 240 (the owner, 2026-10-25: the C1 prototype "should also get the tts and challenger 3 and mbt 70 era
  // reapplications"): the C1's own visual ERA, its skirt run's cassettes and a field on each raked upper cheek (its glacis
  // carries none: the main gun's front depression lays the gun 8-13 cm over it).
  const c1EraReceipt = { sideSkirtCassettes: 0, turretCheekCassettes: 0 };
  // The supplied Arrafi reference carries a 1.06 m running-gear envelope
  // and ~0.60 m shoes. Keep that mechanical course rooted at the terrain,
  // then raise the armored body on its suspension before applying the final
  // uniform owner scale; this preserves the corrected body/course relation.
  const BODY_RIDE_LIFT = 0.10;
  // Convert the source's assembly-space fittings into the turret frame before
  // the body lift and family scale. Both prototypes share this ownership;
  // merging them into the hull leaves equipment behind during turret yaw.
  const buildArieteMkAssemblyStage1 = (): void => {
    // release 231 (owner: "lifted a lil so its not fused with hull"): the turret and gun ride ARIETE_PROTO_TURRET_LIFT_M
    // over the print seat, so the turret's underside stands clear of the hull's slab with a dark ring in the seam
    P.turretG.position.set(0, 1.30 + BODY_RIDE_LIFT + ARIETE_PROTO_TURRET_LIFT_M, -0.10);
  };
  buildArieteMkAssemblyStage1();
  yield 'buildArieteMkAssemblyStage1';
  const L = (zWorld: number): number => zWorld + 0.10;                         // world z -> turret local
  const localY = (yWorldBeforeLift: number): number => yWorldBeforeLift - 1.30;

  // ---- hull tub + sponsons -------------------------------------------------
  // Narrow buried belly core: the former ±0.95 m face occupied the linked
  // shoe guide-horn sweep (68 strict voxels before the owner scale, 80
  // after). The visible sponsons/skirts and armor frame retain their exact
  // reviewed widths; only this hidden inner tub clears the animated course.
  const buildArieteMkHullStage1 = (): void => {
    P.add('hull', box(1.60, 0.90, 6.30), 0, 0.85, 0.05);                         // tub x ±0.80, belly 0.40
    P.add('hull', box(3.07, 0.15, 4.87), 0, 1.435, -1.135);                      // hull side walls ±1.535 (stations st0-5 w 3.04-3.07), y 1.36..1.51 —
    // §5.299: walls END at the driver line +1.67 (release 231: at the turret's front plate +1.30; the old +2.87 overshoot
    // painted a flat 1.51 shelf over the whole glacis; the print's own side
    // silhouette rakes 1.51@1.62 -> 1.17@3.7 — rear extreme -3.57 byte-held)
    // ---- decks (gate ref side_hull) -------------------------------------------
    P.add('hull', box(3.05, 0.05, 1.31), 0, 1.475, -2.445);                      // rear deck 1.50 (z -3.10..-1.79)
    P.add('hull', box(3.05, 0.05, 0.72), 0, 1.465, -1.43);                       // mid deck 1.49 (z -1.79..-1.07)
    P.add('hull', box(3.05, 0.045, 0.24), 0, 1.4275, -0.95);                     // dip step 1.45 (z -1.07..-0.83)
    P.add('hull', box(3.05, 0.045, 0.30), 0, 1.3375, -0.68);                     // dip low 1.36 (z -0.83..-0.53)
    P.add('hull', box(3.05, 0.05, 1.10), 0, 1.415, 0.02);                        // ring deck 1.44 (z -0.53..+0.57, under the cage)
    P.add('hull', box(3.05, 0.05, 0.73), 0, 1.42, 0.935);                        // fore deck 1.445 (z +0.57..+1.30, under the turret)
    // release 231: ahead of the turret's front plate the roof is the print's lower fore line (cheek undersides 1.35@+0.8 ->
    // 1.53@+1.8, fore fairing falling to 1.36): the strip to the glacis at 1.40, under the cheeks' overhang, so the gun
    // depresses over the front arc instead of standing on a 1.51 roof. The slab above stops at the front plate.
    P.add('hull', box(3.05, 0.05, 0.37), 0, 1.375, 1.485);                       // fore strip 1.40 (z +1.30..+1.67)
    // ---- glacis: §5.299 SLOPED RE-LOFT (owner order). The certified flat-step
    // frustums (horizontal tops 1.375/1.32) read as a table; the print's own
    // line is a raked plane through the SAME measured points (gate ref:
    // 1.375@1.66 -> 1.315@2.60 -> 1.21@3.685; nose band 1.16-1.20 to +3.79).
    // Top faces now truly slope through them; every extent (±1.525 plan, nose
    // +3.79 chin/bump anchors) byte-held so dims/registration cannot move. ------
    P.add('hull', slab(                                                          // upper glacis A: 1.375@1.66 -> 1.315@2.60 (rear underside meets tub 1.30)
      [-1.525, 1.30, 1.66], [1.525, 1.30, 1.66], [1.525, 1.24, 2.60], [-1.525, 1.24, 2.60],
      [-1.525, 1.375, 1.66], [1.525, 1.375, 1.66], [1.525, 1.315, 2.60], [-1.525, 1.315, 2.60]));
    P.add('hull', slab(                                                          // upper glacis B: 1.315@2.60 -> 1.205@3.685 (underside buries into the chin)
      [-1.525, 1.23, 2.60], [1.525, 1.23, 2.60], [1.50, 1.12, 3.685], [-1.50, 1.12, 3.685],
      [-1.525, 1.315, 2.60], [1.525, 1.315, 2.60], [1.50, 1.205, 3.685], [-1.50, 1.205, 3.685]));
    P.add('hull', slab(                                                          // nose band 1.205@3.62 -> 1.115@3.785 (plan 3.803 center via the bumps)
      [-1.50, 1.08, 3.62], [1.50, 1.08, 3.62], [1.475, 1.08, 3.785], [-1.475, 1.08, 3.785],
      [-1.50, 1.21, 3.62], [1.50, 1.21, 3.62], [1.475, 1.115, 3.785], [-1.475, 1.115, 3.785]));
    P.add('hull', slab(                                                          // under-nose chin: belly 0.42@+3.00 -> 0.97@+3.79 (12%-band bow anchor;
      [-0.95, 0.42, 3.00], [0.95, 0.42, 3.00], [0.90, 0.97, 3.79], [-0.90, 0.97, 3.79],   // x ±0.95 clear of the native track lane)
      // 267 round 2: its crown falls to 1.10 at the nose (was 1.19): it stood 2-8 cm through glacis B and the nose band
      // ahead of z 3.45 as a raised 1.8 m plate on the nose, the "transverse slat bar" no photograph shows
      [-0.95, 1.24, 3.00], [0.95, 1.24, 3.00], [0.90, 1.10, 3.79], [-0.90, 1.10, 3.79]));
    for (const s of [-1, 1]) {
      P.add('hull', slab(                                                        // bow shoulder closures tub->nose (idler pocket, §5.18 no-air;
        [s * 0.88, 0.42, 3.00], [s * 0.95, 0.42, 3.00], [s * 0.95, 0.70, 3.55], [s * 0.88, 0.70, 3.55],  // outer face ±0.95 clear of the lane)
        [s * 0.88, 1.26, 3.00], [s * 0.95, 1.26, 3.00], [s * 0.95, 1.15, 3.55], [s * 0.88, 1.15, 3.55])); // tops tucked under the §5.299 raked B plane
      // 267 (lane italy-korea-bmp-267, from the series C1 and C2 photographs): the lamps are not on two bumps at the nose
      // centre but in a low boxed cluster set into each front corner of the glacis edge, over the track, with a flat mud
      // flap hanging from the glacis edge behind it (arieteMkParts.ts). The centre bumps and their brush guards are gone.
      // Round 2 (both blind critics: "low, boxed headlight clusters at the front hull corners, on the upper glacis edge";
      // the C1's under-lip lamp and its long flap read "added on" and "reaching low toward the track line"): the cluster
      // sits on the nose band's front edge, its face 15 mm ahead of the nose, and the flap's hem is at the lower nose line
      // (0.97). Gun clearance (nationalGunClearance, measured): the C1 prototype's -6.5/-6.7 stops at yaw 16-21 graze the
      // nose, so its crown is 1.18 (1 cm under the barrel's 25 mm keep at its inner corner); the C2's -3.8/-3.9 stops let
      // it stand to 1.22.
      arieteLampCluster(P, s * 1.31, 1.06, 3.80, s, { w: 0.32, h: c2 ? 0.16 : 0.12, d: 0.16 });
      P.add(c2 ? 'hullDetail' : 'hullRubber', box(0.40, 0.18, 0.02), s * 1.30, 1.06, 3.49);        // mud flap, its head 1 cm into the glacis underside
      P.add('hullDark', box(0.40, 0.025, 0.045), s * 1.30, 1.128, 3.49);                            // flap clamp bar under the glacis edge
      P.add('hullDetail', torus(0.075, 0.015, 10), s * 0.50, 0.819, 3.694, Math.PI / 2, 0, 0); // bow tow eyes; 2026-10-19 (owner float sweep): hung 0.19 m under the chin, now from it (r2: last 8 mm closed)
      // s5322-C5 bow tow SHACKLES stowed FLAT on the nose-band plate above
      // their eyes (crew stowage read: D-bow half-buried on the raked plate +
      // clamp block; the first leaned-off-the-chin seat FLOATED clear of both
      // eye and plate in pixels — caught in the after-shots, re-stowed).
      P.add('hullDetail', torus(0.050, 0.013, 10), s * 0.50, 1.168, 3.70, 0.52, 0, 0);
      P.add('hullDark', box(0.05, 0.016, 0.03), s * 0.50, 1.196, 3.652);
    }
    // s5322-C3 woven glacis GRILLE band (§5.283 debt): dark intake field +
    // crossing weave strips riding the §5.299 raked plane A (pitch 0.0638;
    // tops <= surface+0.020 — the read is tone relief, budgeted inside the
    // side_hull headroom; clear of the c2 add-on rows which start z 2.04).
    // 267: the woven band at the driver's station is gone. Round 2 (both blind critics: "the photos show a plain glacis";
    // "thin dark rods cross in an X on the glacis below the mantlet, like loose stray cables"): the glacis carries no intake
    // grille, no V splash rail and no draped tow cable (the rear plate keeps its stowed cable); it is the plain raked plate
    // of the photographs.
    // The source groups mix fixed and rotating parts. Shoulder bins, roof
    // furniture and the left cheek fairing belong to the turret on BOTH marks.
    // Their source-space seats are preserved through localY/L; only the roof
    // cover gains a shallow, seated lid above the crown that formerly hid it.
    for (const side of [-1, 1]) {
      P.addEquipment('turret', box(0.42, 0.49, 0.66), side * 1.25, localY(1.745), L(-0.06));
      P.addEquipment('turret', box(0.42, 0.40, 0.62), side * 1.25, localY(1.70), L(0.62));
      P.addEquipment('turretDark', box(0.38, 0.02, 0.58), side * 1.25, localY(1.99), L(-0.06));
      P.addEquipment('turretDark', box(0.38, 0.02, 0.54), side * 1.25, localY(1.90), L(0.62));
      P.addEquipment('turretDetail', box(0.43, 0.03, 0.03), side * 1.25, localY(1.80), L(-0.06));
      P.addEquipment('turretDetail', box(0.43, 0.03, 0.03), side * 1.25, localY(1.78), L(0.62));
    }
    P.add('hull', cylY(0.84, 0.86, 0.08, P.q ? 26 : 14), 0, 1.48, 0.02); // fixed bearing race
    // release 231: the ring's outer race in the seam under the lifted turret (1 cm into the slab, 5 mm short of the
    // turret's underside), set 18 cm inside its narrowest reach so it reads as the ring in shadow
    P.add('hullDark', cylY(1.06, 1.06, ARIETE_PROTO_TURRET_LIFT_M - 0.005, P.q ? 40 : 24), 0,
      1.50 + (ARIETE_PROTO_TURRET_LIFT_M - 0.005) / 2, -0.10);
    P.addEquipment('turret', box(0.57, 0.76, 0.80), -0.565, localY(1.82), L(0.02));
    P.addEquipment('turret', box(0.08, 0.86, 0.22), -0.815, localY(1.90), L(0.06));
    P.addEquipment('turretDark', box(0.06, 0.03, 0.18), -0.815, localY(2.33), L(0.06));
    // Structural fairing remains part of the cheek armor, not hull furniture.
    // release 231: its underside at 1.50 (1 cm into the hull's slab), its nose lip at 1.56: it dipped to 1.34 over the
    // glacis and swung through the track guards and the glacis grille as the turret traversed
    P.add('turret', slab(
      [-0.85, 1.50, 0.42], [-0.48, 1.50, 0.42], [-0.48, 1.50, 1.05], [-0.85, 1.50, 1.05],
      [-0.85, 2.02, 0.42], [-0.48, 2.02, 0.42], [-0.48, 1.95, 1.05], [-0.85, 1.95, 1.05]),
    0, localY(0), L(0));
    P.add('turret', slab(
      [-0.85, 1.50, 1.05], [-0.48, 1.50, 1.05], [-0.48, 1.50, 1.78], [-0.85, 1.50, 1.78],
      [-0.85, 1.95, 1.05], [-0.48, 1.95, 1.05], [-0.48, 1.56, 1.66], [-0.85, 1.56, 1.66]),
    0, localY(0), L(0));
    P.addEquipment('turret', box(0.58, 0.24, 0.72), 0.55, localY(1.57), L(-0.04));
    for (const [px, top] of [[0.30, 2.11], [0.51, 2.10], [0.77, 2.09]]) {
      P.addEquipment('turret', box(0.10, top - 1.49, 0.14), px, localY((top + 1.49) / 2), L(0.10));
    }
    P.addEquipment('turretDark', box(0.50, 0.02, 0.50), -0.565, localY(2.205), L(0.02));
    // CENTER driver valley (gate front: 1.51-1.79 between the groups): plate,
    // flush hatch, episcope row, small center pod
    P.add('hull', box(0.76, 0.045, 1.61), -0.11, 1.485, 0.495);                   // driver plate 1.51 (x -0.49..+0.27)
    P.add('hullDark', box(0.40, 0.012, 0.44), -0.11, 1.514, 0.62);
  };
  buildArieteMkHullStage1();               // hatch seam
  yield 'buildArieteMkHullStage1';
  const buildArieteMkHullStage2 = (): void => {
    // release 231: no episcopes on the driver plate: it lies under the turret, and they stood through its side walls
    // as it traversed
    P.add('hull', box(0.12, 0.27, 0.30), 0.0, 1.65, 0.02);                       // center pod to 1.79 (gate front 1.79 @ x -0.02..+0.06)
    // ---- stern (plan_hull rear + side_hull tail) ------------------------------
    P.add('hull', slab(                                                          // stern rake: bottoms 0.72@-3.30 -> 0.90@-3.66 (x ±0.85)
      [-0.85, 0.40, -2.62], [0.85, 0.40, -2.62], [0.85, 0.90, -3.66], [-0.85, 0.90, -3.66],
      [-0.85, 1.30, -2.62], [0.85, 1.30, -2.62], [0.85, 1.30, -3.66], [-0.85, 1.30, -3.66]));
    P.add('hull', box(1.70, 0.78, 0.07), 0, 1.10, -3.415);                       // rear plate x ±0.85 (corners -3.39..-3.43)
    for (const s of [-1, 1]) {
      P.add('hull', box(0.36, 0.50, 0.07), s * 1.345, 1.26, -3.415);             // outer rear courses to ±1.525 (bottoms above the sprocket wrap)
      P.add('hull', box(0.28, 0.50, 0.33), s * 1.025, 1.21, -3.595);             // exhaust pods x ±(0.885..1.165) to -3.76 (bottoms above the shoe faces)
      P.add('hullDark', box(0.24, 0.42, 0.03), s * 1.025, 1.19, -3.735);
      // s5322-C7 exhaust grille DEPTH: louvre ribs proud of the recessed dark
      // throat, inside the pod envelope (owner MBT order).
      for (let k = 0; k < 4; k++) {
        P.add('hullDetail', box(0.20, 0.016, 0.012), s * 1.025, 1.065 + k * 0.09, -3.745);
      }
      P.add('hullDark', box(0.14, 0.07, 0.04), s * 1.32, 1.40, -3.46);           // taillights
      P.add('hullDetail', box(0.15, 0.075, 0.012), s * 1.32, 1.40, -3.468);      // s5322-C8 taillight guard frames
      P.add('hullRubber', box(0.38, 0.18, 0.03), s * 1.30, 1.14, -3.44);         // rear flaps (hems above the sprocket shoe band)
      P.add('hullDark', box(0.36, 0.02, 0.012), s * 1.30, 1.24, -3.4465);        // s5322-C8 flap hinge strips
    }
    // s5322-C8 rear plate FURNITURE (owner MBT order): convoy plate + center
    // tow hitch — all inside the certified -3.47/-3.79 rear extremes.
    P.add('hullDetail', box(0.16, 0.12, 0.012), -0.45, 1.02, -3.4615);           // convoy plate (pale)
    P.add('hull', box(0.09, 0.10, 0.08), 0, 1.01, -3.68);                        // tow hitch body under the tail block
    P.add('hullDark', cylY(0.016, 0.016, 0.07, 6), 0, 1.01, -3.705);             // hitch pin
    P.add('hull', box(0.25, 0.42, 0.34), 0, 1.28, -3.62);                        // center tail block to -3.79, band 1.07..1.49 (12%-band tail anchor)
    P.add('hull', box(0.40, 0.055, 0.24), 0, 1.50, -3.62);                       // tail lip 1.476..1.524
    P.add('hullDark', box(1.64, 0.24, 0.045), 0, 1.12, -3.44);                   // rear grille shadow
    for (let k = 0; k < 3; k++) P.add('hullDetail', box(1.60, 0.03, 0.05), 0, 1.02 + k * 0.09, -3.445);
    towCable(P, [[-0.70, 1.30, -3.47], [0, 1.18, -3.52], [0.70, 1.30, -3.47]]);
    // rear deck dressing (flat per the gate ref: grilles + kit, tops <= 1.60)
    P.add('hullDark', box(1.86, 0.012, 0.72), 0, 1.502, -2.62);                  // rear-deck grille field
    for (let k = 0; k < 5; k++) P.add('hullDetail', box(1.80, 0.014, 0.05), 0, 1.508, -2.36 - k * 0.14);
    P.add('hullDark', box(1.90, 0.012, 0.50), 0, 1.492, -1.44);                  // mid-deck radiator panel
    // s5322-C2 rear-sponson LOUVRE BANDS both sides (§5.283 debt): recessed
    // dark intake field flush with the wall face + rib cadence (0.004 proud —
    // plan_hull stays byte-clean, tone carries the read).
    for (const s of [-1, 1]) {
      P.add('hullDark', box(0.011, 0.10, 1.05), s * 1.5295, 1.43, -2.62);
      for (let k = 0; k < 6; k++) {
        P.add('hullDetail', box(0.006, 0.085, 0.028), s * 1.536, 1.43, -2.24 - k * 0.15);
      }
      P.add('hullDark', box(0.018, 0.02, 1.75), s * 1.527, 1.50, 0.425);         // s5322-C6 fender shadow line under the sponson crest (outer face flush w/ the 1.536 wall — the 1.5535 seat nicked the front-view corner, measured + pulled in)
    }
    stowage(P, 'hullCloth', rng, [[-0.80, 1.53, -3.30, 0.80, 0.10, 0.36]]); // release 231: across the tail, past the side racks' 2.9 m sweep (was at -2.62 under it)
    {
      // VEH-13 (2026-10-16): the rear deck station sits under the bustle's traverse, so the seat solver racked the course
      // 14 cm proud of the rear plate, which left an enclosed slot between the two (B2 contiguity, 17 cells). The
      // course now hangs flush on the rear plate's flat field (z -4.026, x 0.15-0.95, y 1.10-1.50), clear of the
      // centre box and the right lamp housing, with its length across the plate. Builder frame: the finished vehicle is
      // this frame times 1.10, so the world plate at z -4.026 is -3.66 here.
      // three links, centred in the field, so neither end leaves a pocket under 12 cm against the centre box or the
      // lamp housing (B2 reads such a pocket as enclosed sky in some grid phases)
      const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.44, seed: 7, rotation: [-Math.PI / 2, -Math.PI / 2, 0] });
      links.position.set(0.4773, 1.191, -3.7005);
      P.hullG.add(links);
    }
  };
  buildArieteMkHullStage2();
  yield 'buildArieteMkHullStage2';
  // ---- skirts (plan: heavy applique run z -0.41..+3.09 ONLY; stations rear
  // 3.04-3.07 = no wide rear skirt. WIDTH GUARD: max |x| = 1.80) -------------
  // The old skirt faces stopped below the hull-side sill and were connected
  // only by a narrow outboard rail. That left the C1 rear apron visibly
  // floating and made both marks read as if their guards were suspended off
  // the tracks. Preserve the accepted lower edges, but carry the inboard
  // apron and outer carriers upward into two real fender shelves: a level
  // aft course overlapping the side wall and a forward course raked with the
  // glacis. Both shelves overlap the hull inboard and the skirts outboard.
  const skirtRear = c2 ? -2.92 : -0.41;                                        // C2 package: full-run heavy skirts (photo-class)
  const skirtSeatRear = -2.92;
  const sideWallFront = 1.67;
  const baseSkirtBottomY = 0.54;
  const baseSkirtTopY = 1.38;
  const heavySkirtBottomY = 0.60;
  const heavySkirtTopY = 1.42;
  // 267: the C2's front skirt blocks (bays 1-6, z -0.15..2.63) end in a 0.20 m chamfer rising to a fender narrowed to
  // |x| 1.69 over them
  const C2_SKIRT_CHAMFER_H = 0.20;
  const C2_FENDER_EDGE_X = 1.69;
  const C2_BLOCK_RUN: readonly [number, number] = [3.09 - (3.09 - skirtRear) / 13 * 7, 3.09 - (3.09 - skirtRear) / 13];
  const buildArieteMkHullStage3 = (): void => {
    for (const s of [-1, 1] as const) {
      const buildArieteMkHullCourse1 = (): void => {
        const skirtBucket = s < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR';
        const skirtDarkBucket = s < 0 ? 'hullTrackTrimL' : 'hullTrackTrimR';
        // full-height inboard apron: lower edge held, upper edge buried in the fender seat (release 240: on the heavy run's
        // profile, 6 cm under its hem and 4 cm under its top, so it rakes with it at both ends)
        P.add(skirtBucket, profileSkirtGeometry({ inner: 1.65, outer: 1.68, stations: skirtSegment(ARIETE_SKIRT, -2.92, 2.90).stations
          .map(([z, bottom, top]) => [z, bottom - (heavySkirtBottomY - baseSkirtBottomY), top - (heavySkirtTopY - baseSkirtTopY)]) }, s));
        if (!c2) {
          // 267: aft of the heavy package the C1 prototype's light skirt reads as panels too (series photographs: ~0.85-1 m
          // panels with hem handles), not one blank 2.5 m wall: two panel joints and three hem handles on the apron face
          for (const z of [-1.25, -2.09]) {
            const lo = skirtBottomAt(ARIETE_SKIRT, z) - (heavySkirtBottomY - baseSkirtBottomY) + 0.03;
            const hi = skirtTopAt(ARIETE_SKIRT, z) - (heavySkirtTopY - baseSkirtTopY) - 0.03;
            P.add(skirtDarkBucket, box(0.012, hi - lo, 0.022), s * 1.682, (lo + hi) / 2, z);
          }
          for (const z of [-0.83, -1.67, -2.50]) {
            P.add(skirtBucket, box(0.018, 0.05, 0.10), s * 1.686, skirtBottomAt(ARIETE_SKIRT, z) - 0.02, z);
          }
        }
        // s5322-C1 real C1 SEVEN-section front-half skirt run (owner MBT order;
        // c2 keeps its 13-panel AMV run) + per-panel hinge/bolt hardware both
        // marks. 0.50 pitch < the 0.54 station slab (edge-on prism law holds);
        // every new read stays inside the ±1.80 WIDTH GUARD (max 1.799).
        const panels = c2 ? 13 : 7;
        const z0 = 3.09, panelD = (3.09 - skirtRear) / panels;
        // The visual ERA owns the outer 40 mm of the 1.80 m half-width. Pull
        // the carrier plates inboard so the cassettes finish exactly on the
        // published width plane instead of floating beyond the side armor
        // (release 240: both marks, the C1's run now carrying them too).
        const panelCenterX = 1.7425;
        const panelCarrierX = 1.760;
        for (let k = 0; k < panels; k++) {
          const zc = z0 - panelD * (k + 0.5);
          // 267 (C2 acceptance photographs 1-3, the skirt crop in ariete/crop_c2_skirt02.png): the C2's front run is five
          // THICK armour blocks behind the raked corner bay, each a tall vertical face under a steep chamfered top that
          // climbs inboard to a narrowed fender; aft of them thin plain plates end in the long rear louvre; no dark ERA
          // lids. Same 13 bays, two courses a bay (one on the raked end bays): the block's face and its chamfer.
          // Round 2 (critics: the C2's blocks should cover the front 55-60 % of the run, the rest one flat panel with its
          // grille; the C1 prototype's panels read half the photographs' width): the C2 has six blocks behind the corner
          // bay (bays 1-6, 54 % of the run with the corner), its rear six bays one flush panel; the C1 prototype's seven
          // carriers read as four panels (~1.0 m, joints at bays 2, 4 and 6), its ERA courses unchanged on them.
          const c2Block = c2 && k >= 1 && k < 7;
          const c2Flat = c2 && k >= 7;
          // (the C2's flat rear section in three two-bay panels, joints at bays 7, 9 and 11)
          const joint = c2 ? !c2Flat || k % 2 === 1 : k % 2 === 0;                     // a panel joint at the bay's front edge
          const jointAft = c2 ? !c2Flat || (k % 2 === 0 && k < panels - 1) : k % 2 === 1 && k < panels - 1; // ... at its rear
          const bayTop = Math.min(skirtTopAt(ARIETE_SKIRT, zc - panelD / 2), skirtTopAt(ARIETE_SKIRT, zc + panelD / 2));
          const chamferBottom = bayTop - C2_SKIRT_CHAMFER_H;
          // outer carrier reaches through the fender shelf without lowering its hem: a panel of the profile run (a C2
          // block's carrier stops under its chamfer); carriers run on unbroken across a panel, 25 mm apart at its joints
          const carrier = skirtSegment(ARIETE_SKIRT, zc - panelD / 2 + (jointAft ? 0.0125 : 0), zc + panelD / 2 - (joint ? 0.0125 : 0));
          P.add(skirtBucket, profileSkirtGeometry(c2Block ? { ...carrier, stations: carrier.stations
            .map(([z, bottom]) => [z, bottom, chamferBottom + 0.02]) } : carrier, s));
          if (!c2Block && joint) {
            // panel seams span the carrier face between its lines, bolts where they fall on it
            const seamZ = zc - panelD / 2 + 0.012, seamLo = skirtBottomAt(ARIETE_SKIRT, seamZ) + 0.04;
            const seamHi = skirtTopAt(ARIETE_SKIRT, seamZ) - 0.04;
            P.add(skirtDarkBucket, box(0.012, seamHi - seamLo, 0.02), s * (panelCarrierX - 0.008), (seamLo + seamHi) / 2, seamZ);
            for (const [y, dz] of [[1.09, -0.22], [0.79, 0.22]] as const) {
              const z = zc + panelD * dz;
              if (y > skirtBottomAt(ARIETE_SKIRT, z) + 0.03 && y < skirtTopAt(ARIETE_SKIRT, z) - 0.03)
                P.add(skirtDarkBucket, box(0.004, 0.026, 0.026), s * (panelCarrierX - 0.001), y, z);
            }
            const hingeZ = zc + panelD / 2 - 0.0125;
            if (k > 0) P.add(skirtBucket, box(0.03, 0.14, 0.07),
              s * (panelCenterX + 0.004), skirtTopAt(ARIETE_SKIRT, hingeZ) - 0.07, hingeZ); // hinge straps bridge the panel crown into the fender seat
          }
          if (c2Block) {
            const blockD = panelD - 0.03, plate = { kind: 'plate', bevel: 0.016, bolts: false } as const;
            // the vertical face: 52 mm proud of the carrier (outer plane 1.812, the receipt's lid plane), backed 90 mm into it
            const faceBottom = 0.635, faceTop = chamferBottom - 0.004;
            const face = { point: new THREE.Vector3(s * panelCarrierX, (faceBottom + faceTop) / 2, zc),
              normal: new THREE.Vector3(s, 0, 0), dv: new THREE.Vector3(0, 0, 1) };
            faceSeatedArmorCassette(P, 'hull', face, face.dv, faceTop - faceBottom, 0.052, blockD, 0.09, plate);
            // the chamfer: from the face's top edge (1.812) up and inboard to the narrowed fender's edge
            const p0 = new THREE.Vector3(s * 1.812, chamferBottom, zc), p1 = new THREE.Vector3(s * C2_FENDER_EDGE_X, bayTop, zc);
            const along = p1.clone().sub(p0), len = along.length();
            const n = new THREE.Vector3(along.y * s, -along.x * s, 0).normalize();
            if (n.x * s < 0) n.negate();
            const seat = p0.clone().add(p1).multiplyScalar(0.5).addScaledVector(n, -0.03);
            faceSeatedArmorCassette(P, 'hull', { point: seat, normal: n, dv: new THREE.Vector3(0, 0, 1) },
              new THREE.Vector3(0, 0, 1), len, 0.03, blockD, 0.06, plate);
            if (c2EraReceipt) c2EraReceipt.sideSkirtCassettes += 2;
            continue;
          }
          // (the C2's flat rear panel: its two courses meet at 0.94 and run bay into bay, a flush 12 mm skin)
          const rows: readonly (readonly [number, number])[] = c2Flat ? [[0.79, 0.30], [1.09, 0.30]] : [[0.79, 0.275], [1.09, 0.275]];
          for (const [y, rowW] of rows) {
            // (release 240: the 0.275 m cassette only where it lies on the profile panel)
            if (!fitsInSkirt(ARIETE_SKIRT, zc - (panelD - 0.055) / 2, zc + (panelD - 0.055) / 2, y - rowW / 2, y + rowW / 2)) continue;
            const face = {
              point: new THREE.Vector3(s * panelCarrierX, y, zc),
              normal: new THREE.Vector3(s, 0, 0),
              dv: new THREE.Vector3(0, 0, 1),
            };
            if (c2Flat) {
              const lead = joint ? 0.0125 : 0, trail = jointAft ? 0.0125 : 0;      // the panel's joints
              face.point.z += (trail - lead) / 2;
              faceSeatedArmorCassette(P, 'hull', face, face.dv, rowW, 0.012, panelD - lead - trail,
                C2_ERA_EMBED_M, { kind: 'plate', bevel: 0.002, bolts: false });
            } else if (c2) {
              // the raked corner bay carries a thick block too (photographs: the corner module under the lamp cluster)
              faceSeatedArmorCassette(P, 'hull', face, face.dv, rowW, 0.052,
                panelD - 0.03, 0.09, { kind: 'plate', bevel: 0.016, bolts: false });
            } else {
              faceSeatedArmorCassette(P, 'hull', face, face.dv,
                0.275, 0.040, panelD - 0.055, C2_ERA_EMBED_M);
            }
            if (c2EraReceipt) c2EraReceipt.sideSkirtCassettes += 1;
            else c1EraReceipt.sideSkirtCassettes += 1;
          }
        }
        // the C2's rear grille (photographs 1 and 3: one long slatted field in the flat rear panel, over its last three bays)
        if (c2) arieteSideLouvre(P, { dark: skirtDarkBucket, detail: skirtBucket }, s, panelCarrierX + 0.012,
          0.84, 1.22, -2.84, -1.56, 6);
        // widthM edge strip, outer face EXACTLY ±1.80 (WIDTH GUARD): the front panel's profile under its top line
        P.add(skirtBucket, profileSkirtGeometry(skirtBand(skirtSegment(ARIETE_SKIRT, 2.65, 3.07, 1.755, 1.80), 0.06, 9), s));
        // aft fender shelf: 20 mm hull overlap, 30+ mm skirt overlap (267: on the C2 narrowed to the chamfers' 1.69 edge
        // over the block run)
        const aftShelf = (zA: number, zB: number, outer: number): void => P.add(skirtBucket,
          box(outer - 1.515, 0.06, zB - zA), s * (1.515 + outer) / 2, 1.39, (zA + zB) / 2);
        const fwdShelf = (zA: number, zB: number, outer: number): void => {
          const y = (z: number): number => 1.42 - (z - sideWallFront) * (0.16 / (3.09 - sideWallFront));
          P.add(skirtBucket, slab(                                                 // forward shelf follows the glacis instead of hovering over it
            [s * 1.48, y(zA) - 0.06, zA], [s * outer, y(zA) - 0.06, zA], [s * outer, y(zB) - 0.06, zB], [s * 1.48, y(zB) - 0.06, zB],
            [s * 1.48, y(zA), zA], [s * outer, y(zA), zA], [s * outer, y(zB), zB], [s * 1.48, y(zB), zB]));
        };
        if (c2) {
          aftShelf(skirtSeatRear, C2_BLOCK_RUN[0], 1.79);
          aftShelf(C2_BLOCK_RUN[0], sideWallFront, C2_FENDER_EDGE_X + 0.004);
          fwdShelf(sideWallFront, C2_BLOCK_RUN[1], C2_FENDER_EDGE_X + 0.004);
          fwdShelf(C2_BLOCK_RUN[1], 3.09, 1.79);
        } else {
          aftShelf(skirtSeatRear, sideWallFront, 1.79);
          fwdShelf(sideWallFront, 3.09, 1.79);
        }
        // front mudguards (plan ±1.545..1.795 -> z 3.005..3.093; front-view
        // crest 1.33, outer droop 1.22)
        P.add(skirtBucket, box(0.14, 0.10, 0.46), s * 1.72, 1.275, 2.86);
        P.add(skirtBucket, box(0.055, 0.26, 0.46), s * 1.7725, 1.19, 2.86);
        P.add(skirtBucket, box(0.14, 0.05, 0.10), s * 1.72, 1.10, 3.10);
      };
      buildArieteMkHullCourse1();
    }
  };
  buildArieteMkHullStage3();
  yield 'buildArieteMkHullStage3';
  // ---- running gear: SEVEN wheels, gate-ref stations (contact [-2.44,
  // +2.52]; ramp 0.30@-2.92 / 0.66@-3.29 / 0.87@-3.67; front wrap crest
  // 0.81-0.89 @ +3.49..+3.63) -------------------------------------------------
  const buildArieteMkRunningGearStage1 = (): void => {
    // owner 2026-09-23 (round 46 wheel follow-up, same defect as the round-40 hulls): r 0.38 on the
    // 0.71 gate-ref pitch put 2R/pitch at 1.07 — the seven tires overlapped by 5 cm. The Ariete's
    // wheels are the ~650-710 mm Leopard-1 class (c1_ariete source r 0.29 x 1.232 rig), so the
    // seven wheels shrink to r 0.325 (2R/pitch 0.92, a 6 cm gap); stations, end wheels and the three
    // return rollers the real Ariete carries are unchanged.
    buildRunningGear(P, {
      style: 'rubber', wheelR: 0.325, wheelW: 0.31, wheelY: 0.475, xc: 1.30,
      wheelZs: [2.17, 1.46, 0.75, 0.04, -0.67, -1.38, -2.09],
      idler: { z: 3.10, y: 0.76, r: 0.32 },
      sprocket: { z: -3.00, y: 0.84, r: 0.25 },
      rollers: [1.50, 0.10, -1.30].map((z) => ({ z, y: 1.03, r: 0.09 })),
      trackW: 0.60, topY: 1.09, botY: 0.055, contactZF: 2.52, contactZR: -2.50,
      paintedEnds: true, coveredTop: true, arms: true,
      armBucket: 'hullRunningGearDetail',
      // s5322-D §B6/§B9 gear read (§5.262 gearFloor/tireHex law): lifted olive
      // dish + dark tire ring so the hub/bolt contrast set reads in skirt
      // shade (both cfg clones re-attach the family ambient-floor hook in the
      // factory; the shoe-pad hook is unconditional at tankFactory ~1456).
      // dishR 0.82 opens a real rubber rim — radius/stations byte-held.
      dishR: 0.82,
    });
    P.hullG.userData.arieteRunningGearReceipt = Object.freeze({
      roadWheelRadiusM: 0.325,
      roadWheelStations: 7,
      rearSprocketRadiusM: 0.25,
      rearSprocketOriginalRadiusM: 0.37,
      rearSprocketRadiusRatio: 0.25 / 0.37,
      rearSprocketCenterYM: 0.84,
      rearTrackContactZM: -2.50,
      linkedCourseAdjusted: true,
    });
    liftEye(P, 'hullDetail', -1.40, 1.52, -2.90);                               // release 231: aft of the side racks' sweep (were at -1.60, under it)
    liftEye(P, 'hullDetail', 1.40, 1.52, -2.90);
    P.decal('hull', 'number', c2 ? 'EI 135' : 'EI 121', 0.24,
      [-0.80, 1.29 + BODY_RIDE_LIFT, 2.72], 0, -0.16);
  };
  buildArieteMkRunningGearStage1();
  yield 'buildArieteMkRunningGearStage1';

  // ---- turret ---------------------------------------------------------------
  // main shell loft: front plate behind the mantlet at +1.30, cheek corner
  // (±1.17,+1.28), walls ±1.24..1.28, to the bustle break at -1.12
  const ARIETE_SHELL = [
    [-0.42, L(1.30)], [0.42, L(1.30)], [1.17, L(1.28)],
    [1.24, L(0.04)], [1.28, L(-0.42)], [1.28, L(-0.92)], [1.14, L(-1.12)],
    [-1.14, L(-1.12)], [-1.28, L(-0.92)], [-1.28, L(-0.42)], [-1.24, L(0.04)],
    [-1.17, L(1.28)],
  ];
  const buildArieteMkTurretStage1 = (): void => {
    // Release 231 (the gun-hull fleet lane; the owner: "the older c1 arietes clip through hull"): the hull's top is one
    // full-width slab at 1.51 (0.21 in this frame), and every lower edge of the turret below it was buried there at
    // rest and swung out through the hull's sides, its lift eyes and its rear stowage as the turret traversed. The
    // shell, bustle, cheeks, chin, cavity wall, rear basket, side rails and panels now stop 1 cm into the slab (0.20):
    // nothing shows at rest that did not before, and nothing below 0.20 swings out at any bearing.
    P.add('turret', KIT.polyMultiLoft(ARIETE_SHELL, [
      { height: 0.20, inset: 1.0 },
      { height: [0.62, 0.62, 0.63, 0.70, 0.72, 0.72, 0.70, 0.70, 0.72, 0.72, 0.70, 0.63], inset: 0.99 },
      { height: [0.73, 0.73, 0.74, 0.85, 0.86, 0.86, 0.84, 0.84, 0.86, 0.86, 0.85, 0.74],
        inset: [0.87, 0.87, 0.88, 0.90, 0.91, 0.91, 0.90, 0.90, 0.91, 0.91, 0.90, 0.88] },
    ]));
    // arrow nose: cheek slabs with RAKED undersides (gate ref bottoms rise
    // 1.35@+0.8 -> 1.53@+1.8) meeting at the mantlet cavity; §K real closure.
    // §5.299 SLOPED FRONT: the cheek FACES now rake back from the mantlet line
    // to the roof — ridge top pulled +1.98 -> +1.62 and dropped to 1.965 (40°
    // from vertical), mid +1.62 -> +1.42 (34°) — matching the print's own
    // rising wedge silhouette (K-frame side_turret ref tops 1.82@+1.74 ->
    // 1.96@+1.61 -> 2.02@+1.12: the roof-front is itself a rising plane, so
    // the cheek top face now climbs 1.965@+1.62 -> 2.02@+1.16; bottom edge +
    // plan front extreme byte-held so plan rows and the mantlet band cannot
    // move).
    for (const s of [-1, 1]) {
      const upperCheekBottom: Quad = [[s * 0.20, 0.20, L(2.06)], [s * 1.08, 0.20, L(1.70)], [s * 1.17, 0.20, L(1.26)], [s * 0.20, 0.20, L(1.28)]];
      const upperCheekTop: Quad = [[s * 0.20, 0.64, L(1.62)], [s * 1.08, 0.62, L(1.42)], [s * 1.17, 0.70, L(1.24)], [s * 0.20, 0.72, L(1.26)]];
      P.add('turret', slab(...upperCheekBottom, ...upperCheekTop));              // upper cheek: ridge sweeping (±0.20,+2.10) -> wall corner (±1.17,+1.28)
      if (!c2) {
        // Release 240 (C1 ERA, see c1EraReceipt): four columns by two rows of the C2's cheek cassettes seated on the raked
        // face, clear of the gun slot's side cheeks (x 0.375-0.42) and under the lifting lugs; the C2 lays its field on
        // its own add-on carrier over this face
        const face0: Quad = [upperCheekBottom[0], upperCheekBottom[1], upperCheekTop[1], upperCheekTop[0]];
        for (const u of [0.28, 0.48, 0.68, 0.88]) for (const v of [0.25, 0.66]) {
          const face = sampleArmorFace(...face0, u, v, [s, 1, 1]);
          faceSeatedArmorCassette(P, 'turret', face, face.dv, 0.13, 0.055, 0.20, C2_ERA_EMBED_M);
          c1EraReceipt.turretCheekCassettes++;
        }
      }
      P.add('turret', slab(                                                      // lower cheek chin: raked underside 1.44@+1.30 -> 1.56@+2.02
        [s * 0.20, 0.20, L(2.02)], [s * 0.96, 0.20, L(1.66)], [s * 1.10, 0.20, L(1.30)], [s * 0.20, 0.20, L(1.30)],
        [s * 0.20, 0.30, L(2.04)], [s * 0.98, 0.32, L(1.68)], [s * 1.14, 0.30, L(1.31)], [s * 0.20, 0.30, L(1.31)]));
      // s5322-B3 cheek LIFTING LUGS on the §5.299 raked faces (owner MBT
      // order; leaned D-rings + seat plates, tops flush with the certified
      // climbing face line 1.99-2.005 — zero silhouette).
      P.add('turret', box(0.06, 0.016, 0.05), s * 0.55, 0.648, L(1.50), -0.22, 0, 0);
      P.add('turretDetail', torus(0.034, 0.010, 10), s * 0.55, 0.652, L(1.50), 1.05, 0, s * 0.35);
      P.add('turret', box(0.06, 0.016, 0.05), s * 0.85, 0.652, L(1.38), -0.22, 0, 0);
      P.add('turretDetail', torus(0.034, 0.010, 10), s * 0.85, 0.657, L(1.38), 1.05, 0, s * 0.35);
    }
    P.add('turret', box(0.84, 0.44, 0.30), 0, 0.42, L(1.42));                    // mantlet cavity back wall (closes the nose between cheeks)
    for (const s2 of [-1, 1]) P.add('turret', slab(                              // cavity side cheeks to the mantlet flanks (no see-through at yaw)
      [s2 * 0.375, 0.20, L(1.56)], [s2 * 0.42, 0.20, L(1.56)], [s2 * 0.42, 0.20, L(1.30)], [s2 * 0.375, 0.20, L(1.30)],
      [s2 * 0.375, 0.62, L(1.52)], [s2 * 0.42, 0.62, L(1.52)], [s2 * 0.42, 0.64, L(1.28)], [s2 * 0.375, 0.64, L(1.28)]));
    // ring skirt chin: gate ref bottoms dip 1.21-1.26 @ +0.30..+0.72
    P.add('turret', box(1.60, 0.14, 0.46), 0, -0.025, L(0.51));
  };
  buildArieteMkTurretStage1();
  yield 'buildArieteMkTurretStage1';
  // bustle: roof continues the 2.16 line to -1.69, underside 1.40
  const ARIETE_BUSTLE = [
    [-1.13, L(-1.02)], [1.13, L(-1.02)], [1.13, L(-1.69)], [-1.13, L(-1.69)],
  ];
  const buildArieteMkTurretStage2 = (): void => {
    P.add('turret', KIT.polyMultiLoft(ARIETE_BUSTLE, [
      { height: 0.10, inset: 1.0 },
      { height: 0.70, inset: 0.995 },
      { height: 0.76, inset: 0.93 },
    ]), 0, 0.10, 0);
    // rear baskets: tops 2.03 -> 1.98, bottoms 1.43, center bay to -2.44
    // (§K.4 real rack: frames + mesh floor + fill, no marker-only census)
    P.add('turret', box(2.10, 0.055, 0.68), 0, 0.70, L(-2.03));                  // basket top frame 2.00 (z -1.69..-2.37: the ref's -2.44 end pairs here
    P.add('turret', box(2.10, 0.05, 0.66), 0, 0.23, L(-2.03));                  // under the measured compression registration — packet-documented)
    for (const bx of [-1.02, -0.35, 0.35, 1.02]) {
      P.add('turret', box(0.05, 0.525, 0.52), bx, 0.4675, L(-1.99));             // basket dividers
    }
    // 2026-10-19 (owner float sweep): the mesh face stood 22 mm over the floor frame, the bottles 35 mm over it, the left
    // bundle 25 mm off its divider and the right strap 13 mm behind its bundle; the face now spans floor to top frame,
    // the bottles rest on the floor, the bundle meets the divider and the strap sits on the bundle face.
    P.add('turretDark', openRackGrid(2.04, 0.42, 0.020, 5, 10),
      0, 0.4625, L(-2.36), Math.PI / 2, 0, 0);                                    // open rear mesh face in the registered frame
    for (const [bx2, blen] of [[-0.70, 0.52], [0.02, 0.44], [0.72, 0.48]]) {
      P.add('turretDetail', KIT.xform(KIT.cylX(0.085, blen, 12), 0, 0, 0), bx2, 0.34, L(-1.99)); // strapped stores bottles in the bays (owner c425f495)
      P.add('turretDark', box(0.03, 0.18, 0.14), bx2 - blen * 0.28, 0.34, L(-1.99));
      P.add('turretDark', box(0.03, 0.18, 0.14), bx2 + blen * 0.28, 0.34, L(-1.99));
    }
    stowage(P, 'turretDetail', rng, [[-0.63, 0.50, L(-1.98), 0.52, 0.20, 0.42], [0.42, 0.48, L(-1.98), 0.62, 0.16, 0.40],
      [-0.05, 0.52, L(-2.02), 0.55, 0.18, 0.40], [0.80, 0.46, L(-1.98), 0.32, 0.14, 0.34]]);  // s5322-B2 bustle bays read as CARGO (owner MBT order; tops <= 1.91 world; right item CLAMPED inside the ±1.13 bustle plan — the 1.17 overflow cost plan_turret, measured + pulled in)
    for (const sx of [-0.63, -0.05, 0.42, 0.80]) {
      P.add('turretDark', box(0.022, 0.30, 0.014), sx, 0.45, L(sx === 0.80 ? -2.155 : -2.17));          // s5322-B2 cargo lash straps ON the bundle faces (inside the -2.37 plan boundary; the mesh-face seats poked it, measured + re-seated)
    }
    // full-run side racks (gate plan_turret: rails ±1.52 from +1.0 to -2.95;
    // gate front_whole wing tops 1.91-1.96)
    for (const s of [-1, 1]) {
      // s5322-B1 rack-end caps — MEASURED EXCHANGE RECEIPT (§5.290): the
      // §5.283 debt's "-3.0" is the REF frame's rail end; in this build's
      // certified frame extending the run to world -3.0 walked past the
      // z-compressed print's own rail-end column (plan_turret 63.4->48.7,
      // st1 topPct 11.2 — both reverted). Caps are authored as end PLATES
      // flush INSIDE the certified -2.58 rail envelope: capped-rail read,
      // zero new extreme, st1 slab untouched.
      P.add('turret', box(0.05, 0.07, 3.55), s * 1.50, 0.24, L(-0.805));         // side rack rail at 1.44..1.51 (gate front cols ±1.5 read 1.44-1.50;
      for (const rz of [0.90, 0.30, -0.44, -1.10, -1.76, -2.42]) {               // end caps stay out of the st1 slab — prism law)
        P.add('turret', box(0.045, 0.115, 0.06), s * 1.50, 0.2625, L(rz));      // stanchions tying the rail to the bay lip
      }
      P.add('turret', box(0.05, 0.11, 0.04), s * 1.50, 0.26, L(-2.556));         // s5322-B1 rack-end cap plates (inside the certified envelope)
      P.add('turretDark', box(0.056, 0.05, 0.014), s * 1.50, 0.26, L(-2.572));   // cap end faces (dark hardware read)
      for (const az of [-0.50, -1.44, -2.10]) {
        P.add('turret', box(0.29, 0.06, 0.05), s * 1.355, 0.27, L(az));          // rack arms overlap the shell/panel and the outer rail
      }
      // Owner-marked panel re-seat. Its old inner face sat at |x|=1.40 while
      // the turret/bustle carrier is |x|≈1.13, leaving 27 cm of daylight. The
      // new 115 mm cassette overlaps that carrier by 15 mm and remains wholly
      // turret-local. An aft bridge returns the cantilever into the rear basket
      // frame, while the three rack arms tie its outer face to the rail.
      P.add('turret', slab(
        [s * 1.115, 0.205, L(-1.20)], [s * 1.235, 0.205, L(-1.20)], [s * 1.235, 0.205, L(-2.55)], [s * 1.115, 0.205, L(-2.55)],
        [s * 1.115, 0.58, L(-1.20)], [s * 1.235, 0.58, L(-1.20)], [s * 1.235, 0.58, L(-2.55)], [s * 1.115, 0.58, L(-2.55)]));
      P.add('turret', box(0.22, 0.16, 0.06), s * 1.14, 0.62, L(-2.03));         // rear basket-to-panel bridge; overlaps both structures
      // GALIX 80mm banks on their platform (identity cue; ±1.24-1.40, z -0.30..-0.95)
      P.add('turret', box(0.17, 0.05, 0.66), s * 1.315, 0.475, L(-0.62));        // GALIX platform (ties bank to wall)
      P.add('turretDark', box(0.025, 0.19, 0.64), s * 1.352, 0.585, L(-0.62), 0, 0, s * 0.12); // s5322-B7 GALIX backing plate — tubes read against dark at yaw (ref plan band ±1.31-1.40 owns it)
      addFitting(P, 'turret', FITTINGS.smokeBank({ mats: P.mats, count: 4, splay: s * 1.05,
        pitch: -0.40, slot: 'detail', seed: 30 + (s > 0 ? 1 : 0) }), s * 1.31, 0.56, L(-0.62));
      // s5322-B4 cable conduit run bustle -> cheek riding the wall-top
      // shoulder (turret-owned; INBOARD of the lower wall band's own plan
      // outline — the first wall-face seats poked the tapering walls by up to
      // 0.045 and cost plan_turret, measured + re-seated per §5.290).
      P.add('turretDetail', cylZ(0.013, 0.95, 6), s * 1.225, 0.66, L(-0.47));    // aft segment along the wall shoulder
      P.add('turretDetail', cylZ(0.012, 0.85, 6), s * 1.16, 0.60, L(0.45));      // forward segment onto the cheek shoulder
      P.add('turretDark', box(0.05, 0.06, 0.08), s * 1.21, 0.64, L(0.02));       // junction box at the segment lap
      P.add('turretDark', box(0.045, 0.055, 0.07), s * 1.19, 0.55, L(-0.96));    // feed box at the bustle corner
    }
    // roof furniture (gate ref: TURMS 2.53@zW+0.24 / x ~+0.78; pano head
    // 2.41-2.54 @ x -0.67..-0.87; hatch bumps 2.31-2.43; broad cluster carries
    // the p95 height datum 2.45)
    P.add('turret', box(0.40, 0.15, 0.38), 0.76, 0.915, L(0.22));                // TURMS plinth; 2026-10-19 (owner float sweep): 20 mm deeper, the head stood 19 mm over the roof
    P.add('turret', box(0.34, 0.17, 0.32), 0.76, 1.075, L(0.22));               // TURMS armored box to 2.46 (p95 datum 2.45)
    P.add('turretDark', box(0.345, 0.02, 0.28), 0.76, 1.10, L(0.22));            // split-door seam
    P.add('turretDark', box(0.26, 0.13, 0.025), 0.76, 1.09, L(0.385));           // TURMS recessed face (owner cadence: backed, not a bare square)
    P.add('turretGlass', box(0.20, 0.09, 0.02), 0.76, 1.09, L(0.395));           // TURMS window
    // s5322-B6 TURMS head REALIZED (owner MBT order): hood side cheeks + sill
    // framing the lens bay — every top <= 1.155 local, under the 2.46 p95
    // datum the armored box already owns (§5.290 dims-100 seat).
    P.add('turret', box(0.03, 0.125, 0.03), 0.615, 1.0875, L(0.382));            // hood cheek L (flush w/ the certified face-plate z extent)
    P.add('turret', box(0.03, 0.125, 0.03), 0.905, 1.0875, L(0.382));            // hood cheek R
    P.add('turret', box(0.26, 0.022, 0.032), 0.76, 1.036, L(0.381));             // lens sill
    P.add('turretDark', box(0.012, 0.075, 0.010), 0.715, 1.088, L(0.394), 0, 0, 0.35); // wiper blade on the pane
    P.addEquipment('turret', cylY(0.13, 0.15, 0.16, 12), -0.76, 0.94, L(-0.16));          // pano pedestal
    P.addEquipment('turret', cylY(0.16, 0.16, 0.15, 12), -0.76, 1.095, L(-0.16));         // pano head to 2.47 (p95 datum)
    P.add('turretGlass', box(0.17, 0.08, 0.02), -0.76, 1.095, L(-0.005));
    // s5322-B6 pano head REALIZED: brow hood over the lens + face frame +
    // wiper — all under the head's own 1.17 crown (2.47 datum untouched).
    P.add('turret', box(0.19, 0.022, 0.055), -0.76, 1.152, L(-0.035));           // brow hood lip (inside the head's own -0.32..0.00 side coverage)
    P.add('turret', box(0.02, 0.09, 0.03), -0.855, 1.095, L(-0.032));            // face frame L
    P.add('turret', box(0.02, 0.09, 0.03), -0.665, 1.095, L(-0.032));            // face frame R
    P.add('turretDark', box(0.011, 0.07, 0.011), -0.80, 1.09, L(-0.024), 0, 0, -0.30); // wiper blade
    // 2026-10-19 (owner float sweep): ring, lid and the three periscopes ahead stood 19 mm over the roof; lowered 22 mm.
    cupolaRing(P, 0.45, 0.838, L(-0.42), 0.24);                                  // commander hatch ring
    P.add('turret', box(0.36, 0.022, 0.32), 0.45, 0.903, L(-0.42), 0, -0.08, 0); // split lid (owner c425f495 crew-station cadence)
    // s5322-A2 commander's MG 42/59 at the TURMS-station cupola (owner MBT
    // order; real C1 carries one) — CENSUS pintleMG on the ring's FRONT-right
    // rim, stowed forward alongside the TURMS housing so the entire mass nests
    // UNDER the certified side silhouette (pano 2.47 covers z −0.32..0.00,
    // TURMS 2.46 covers +0.06..+0.38; MG top 2.395 world). Two aft/hatch-band
    // sweeps measured −0.2 whole each under the documented dAlong 0.739
    // registration residual — receipts banked, this seat is the measured
    // dims-100 + curve-neutral exchange (§5.265/§5.290).
    // VH.14 (coordinator ruling 2026-10-14: roof weapons match the real vehicle and every drawn gun works): the Ariete's
    // AA MG 42/59 is the loader's, worked from his hatch; the commander's cupola gun is gone.
    cupolaRing(P, -0.42, 0.86, L(-0.62), 0.23);                                  // loader hatch ring
    P.add('turret', box(0.34, 0.022, 0.30), -0.42, 0.925, L(-0.62), 0, 0.10, 0);
    for (let k = 0; k < 3; k++) periscope(P, 'turretDetail', 0.30 + k * 0.16, 0.878, L(-0.10), 0.1);
    for (const [px, pz, yw] of [[-0.60, -0.28, 0.14], [-0.22, -0.30, -0.06], [0.14, -0.62, 0.08]]) {
      periscope(P, 'turretDetail', px, 0.895, L(pz), yw);                        // commander/loader periscope arcs (owner cadence)
    }
  };
  buildArieteMkTurretStage2();
  yield 'buildArieteMkTurretStage2';
  // welded roof panel cadence (owner c425f495: flat dark fields + fastener
  // strips — zero silhouette)
  const buildArieteMkTurretStage3 = (): void => {
    for (const [px, pz, w, dd] of [[-0.68, -1.30, 0.46, 0.40], [0.02, -1.34, 0.58, 0.42],
      [0.70, -1.28, 0.44, 0.40], [-0.55, -1.90, 0.54, 0.34], [0.14, -1.94, 0.60, 0.32]]) {
      // 2026-10-19 (owner float sweep): the two aft fields lay 14 cm over the basket lid, past the bustle roof; each
      // field drops onto what is under it.
      P.snapGroup(`ariete-roof-field-${px}`, () => {
        P.add('turretDark', box(w, 0.02, dd), px, 0.875, L(pz));
        P.add('turretDetail', box(w * 0.8, 0.016, 0.026), px, 0.888, L(pz + dd * 0.38));
      }, { reachM: 0.16, mode: 'down' });
    }
    P.addEquipment('turret', box(0.30, 0.145, 0.26), 0.10, 0.876, L(0.30));               // gunner's aux sight hood (front_whole 2.31 @ x +0.14); 2026-10-19 (owner float sweep): was 53 mm up
    // crosswind mast folded low on the rear roof (xk2_black_panther height-law: no p95 spike)
    P.addEquipment('turret', box(0.05, 0.09, 0.05), -0.30, 0.885, L(-1.12));              // mast pedestal
    P.add('turretDetail', cylZ(0.02, 0.55, 8), -0.30, 0.915, L(-1.38), 0.10, 0, 0);
    // s5322-B5 wind-sensor head at the folded mast tip — T-crossbar + vane
    // stub FLUSH with the rod's own certified line (whip-rough law: no height).
    P.add('turretDark', box(0.085, 0.017, 0.017), -0.30, 0.938, L(-1.60));       // crossbar T
    P.add('turretDark', box(0.017, 0.017, 0.055), -0.30, 0.938, L(-1.635));      // vane stub aft
    P.add('turretDark', cylY(0.016, 0.016, 0.03, 6), -0.30, 0.925, L(-1.60));    // sensor drum under the bar
    // antennas: print carries ONE right whip (x +0.87, z -0.95, base 2.29,
    // tip 3.55); left base authored folded (print-true absence of the rod)
    addFitting(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 1.27, r: 0.02, rake: 0, seed: 48 }),
      0.87, 0.86, L(-0.885));                                                    // vertical rod (leaning tips read partial columns in the front trace)
    P.add('turretDark', cylY(0.035, 0.04, 0.09, 8), -0.87, 0.883, L(-0.885));    // left whip base drum, rod stowed; 2026-10-19 (owner float sweep): was 22 mm up
    // s5322-B8 antenna BASES realized: AB-armored feed boxes + cable loops at
    // both whip stations (tops nest under the certified 2.25 base-drum column).
    for (const s of [-1, 1]) {
      P.add('turretDark', box(0.05, 0.05, 0.07), s * 0.795, 0.864, L(-0.90));    // tuner feed box inboard of the pot; 2026-10-19 (owner float sweep): was 32 mm up
      P.add('turretDark', torus(0.030, 0.008, 8), s * 0.76, 0.856, L(-0.90));    // coiled cable service loop (dark, FSP-06) nested under the base-drum column
    }
    // mantlet (release 231; owner: "make the way the gun fits into turret more like the actual c2 and c1 ariete, instead
    // of a huge block mantlet"): the gun enters a narrow slot between the converging cheeks. Its own mantlet is a
    // 0.44 m plate set 9 cm inside the cheek ridge, its face raked back 37 degrees with them, its sides inside the cheeks'
    // inner faces and its foot on the turret's underside line; a collar where the tube leaves it. The old 0.75 m block
    // stood 6 cm proud of the ridge with a deeper shroud behind it.
    P.addGunExtra(slab(
      [-0.22, -0.15, 0.50], [0.22, -0.15, 0.50], [0.22, -0.15, 1.02], [-0.22, -0.15, 1.02],
      [-0.22, 0.22, 0.50], [0.22, 0.22, 0.50], [0.22, 0.22, 0.74], [-0.22, 0.22, 0.74]), 0, 0, 0);
    P.addGunExtra(cylZ(0.13, 0.26, 16), 0, 0, 0.93);                             // tube collar emerging from the raked face
    // s5322-A1 coax MG 42/59 — REAL aperture (owner MBT order): armored collar
    // ring at the block face + recessed dark throat + 5cm stub barrel w/
    // booster cap. Protrusion budget measured twice (0.30-proud rod −0.67
    // plan_turret, 0.16-proud −0.38 — both pulled back per §5.290): the port
    // now reads via the collar/tone with ≤0.06 proud of the face, sub-column
    // beside the bare ref tube. Gun-bucketed so the coax ELEVATES with the
    // 120mm (§B5/§B3.1).
    P.addGunExtra(cylZ(0.050, 0.055, 10), 0.165, 0.10, 0.85);                    // aperture collar on the mantlet face, right of the tube
    P.addGunExtraDark(cylZ(0.034, 0.09, 8), 0.165, 0.10, 0.835);                 // port throat (recessed dark)
    P.addGunExtraDark(cylZ(0.014, 0.04, 8), 0.165, 0.10, 0.89);                  // MG 42/59 stub muzzle
    P.addGunExtraDark(cylZ(0.019, 0.025, 8), 0.165, 0.10, 0.92);                 // booster cap
    for (const s of [-1, 1]) {
      P.add('turret', slab(                                                      // raked wedge lips lining the mantlet slot (turret-fixed; release 231: moved in
        [s * 0.20, 0.26, L(2.00)], [s * 0.375, 0.26, L(1.76)], [s * 0.375, 0.26, L(1.58)], [s * 0.20, 0.26, L(1.70)],  // from x 0.375-0.55 with the narrow
        [s * 0.20, 0.57, L(1.80)], [s * 0.375, 0.54, L(1.58)], [s * 0.375, 0.54, L(1.54)], [s * 0.20, 0.58, L(1.64)]));  // mantlet; §5.299 33° cheek rake)
    }
    liftEye(P, 'turretDetail', -1.05, 0.82, L(0.60), 0.3);                      // 2026-10-19 (owner float sweep): eyes were 78 mm up
    liftEye(P, 'turretDetail', 1.05, 0.82, L(0.60), -0.3);
  };
  buildArieteMkTurretStage3();
  yield 'buildArieteMkTurretStage3';

  const buildArieteMkMarkingsStage1 = (): void => {
    if (c2) {
      // ---- C2/AMV upgrade package (photo-class; print is C1-only here) -------
      const buildArieteMkMarkingsCourse1 = (): void => {
        for (const s of [-1, 1]) {
          const buildArieteMkTurretCourse1 = (): void => {
            const cheekBottom: Quad = [                                              // release 231: no lower than the C1 arrow's 0.20 floor
              [s * 0.40, 0.20, L(2.04)], [s * 1.10, 0.24, L(1.72)],
              [s * 1.18, 0.22, L(1.30)], [s * 0.42, 0.20, L(1.58)],
            ];
            const cheekTop: Quad = [
              [s * 0.40, 0.62, L(1.70)], [s * 1.04, 0.56, L(1.48)],
              [s * 1.12, 0.53, L(1.26)], [s * 0.42, 0.62, L(1.52)],
            ];
            P.add('turret', slab(...cheekBottom, ...cheekTop));                     // add-on cheek carrier intersects the C1 arrow
            P.add('turretDark', box(0.02, 0.34, 0.34), s * 1.135, 0.38, L(1.44), 0, 0, s * 0.10); // module edge seams
            // The marked carrier is the compound-raked FORWARD cheek, not the roof
            // or the narrow outer wall. Sample its exact slab vertices as one
            // continuous five-by-two field per side so every cassette inherits the
            // cheek sweep, pitch and taper. Each back penetrates the carrier by
            // 12 mm; there is no cosmetic mounting plate or daylight behind it.
            const cheekFrontFace: Quad = [
              cheekBottom[0], cheekBottom[1], cheekTop[1], cheekTop[0],
            ];
            // 267 (C2 photographs 2-5): the field is the C2's bolted add-on plating, flush chamfered plates with corner
            // bolts that close into one panelled front, not ERA bricks with dark lids
            for (const u of [0.10, 0.30, 0.50, 0.70, 0.90]) for (const v of [0.27, 0.73]) {
              const face = sampleArmorFace(...cheekFrontFace, u, v, [s, 1, 1]);
              faceSeatedArmorCassette(P, 'turret', face, face.dv,
                0.150, 0.045, 0.255, C2_ERA_EMBED_M, { kind: 'plate', bevel: 0.006, bolts: true });
              if (c2EraReceipt) {
                c2EraReceipt.turretCheekCassettes += 1;
                c2EraReceipt.turretCheekForwardNormalDotMin = Math.min(
                  c2EraReceipt.turretCheekForwardNormalDotMin, face.normal.z);
              }
            }

            // The C2 shoulder boxes are already turret-owned armor carriers. Seat
            // the side field on their real outer planes, not on a hidden second
            // plate behind them: four modules per box, two boxes per side.
            for (const carrier of [
              { y: localY(1.70), z: L(0.62), h: 0.40, d: 0.62 },
              { y: localY(1.745), z: L(-0.06), h: 0.49, d: 0.66 },
            ]) {
              const buildArieteMkTurretCourse2 = (): void => {
                for (const yOffset of [-0.22, 0.22]) for (const zOffset of [-0.24, 0.24]) {
                  const face = {
                    point: new THREE.Vector3(s * 1.46,
                      carrier.y + carrier.h * yOffset,
                      carrier.z + carrier.d * zOffset),
                    normal: new THREE.Vector3(s, 0, 0),
                    dv: new THREE.Vector3(0, 0, 1),
                  };
                  faceSeatedArmorCassette(P, 'turret', face, face.dv,
                    carrier.h * 0.43, 0.045, carrier.d * 0.47, C2_ERA_EMBED_M, { kind: 'plate', bevel: 0.012, bolts: true });
                  if (c2EraReceipt) c2EraReceipt.turretSideCassettes += 1;
                }
              };
              buildArieteMkTurretCourse2();
            }

            // Aft courses sit directly on the newly re-seated bustle panel. They
            // begin behind the left APU envelope, avoiding a cosmetic overlap while
            // still protecting both rear quarters symmetrically.
            for (const y of [0.28, 0.48]) for (const zWorld of [-1.74, -2.08, -2.42]) {
              const face = {
                point: new THREE.Vector3(s * 1.235, y, L(zWorld)),
                normal: new THREE.Vector3(s, 0, 0),
                dv: new THREE.Vector3(0, 0, 1),
              };
              faceSeatedArmorCassette(P, 'turret', face, face.dv,
                0.16, 0.050, 0.26, C2_ERA_EMBED_M);
              if (c2EraReceipt) c2EraReceipt.turretBustleCassettes += 1;
            }
            // (267: the glacis add-on rows are gone: no C2 photograph shows plates on the upper glacis, which carries the
            // intake grille between the lamp clusters)
          };
          buildArieteMkTurretCourse1();
        }
        // 267 (C2 photographs 1-5): the commander's new panoramic sight is an armoured drum with a domed cap and a meshed
        // forward window, standing on the C1 pano's pedestal (it replaces the plain box housing; arieteMkParts.ts)
        attilaSightHead(P, 'turret', -0.76, 1.165, L(-0.16));
        // (release 240, the owner: "make sure all tank turrets are clear of hulls": the pod stood 0.22-0.32 m over the fore
        // deck inside the turret's front volume, since release 231 removed its fairing; it seats on the upper glacis ahead of
        // the driver, its top under the bustle's 1.80 m (world) sweep line)
        // (release 240: 8 cm tall, not 10, its base still on the glacis: at its 10 cm the main gun's -4.6 deg stop ahead
        // passed 13 mm over it, inside the gun's 25 mm hull keep)
        P.add('hull', box(0.26, 0.08, 0.16), 0.0, 1.399, 1.75);                    // driver thermal camera pod on the glacis
        P.add('hullGlass', box(0.16, 0.04, 0.02), 0.0, 1.404, 1.835);
        P.add('turret', box(0.44, 0.34, 0.60), -1.14, localY(1.70), L(-1.35));     // yawing APU/shoulder box, zero-yaw world seat retained
        P.add('turretDark', box(0.38, 0.26, 0.02), -1.14, localY(1.68), L(-1.04));
        stowage(P, 'turretDetail', rng, [[0.62, 0.76, L(-2.06), 0.48, 0.18, 0.24]]);
        addFitting(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 1.05, r: 0.02, rake: 0, seed: 52 }),
          -0.87, 0.86, L(-0.885));                                                 // second whip rigged on the C2 fit
        // 267 (C2 photographs 2-5): the C2's roof gun is the loader's 12.7 mm heavy MG on a pintle at his hatch, behind a
        // two-leaf gun shield, not an automated tower: the race, yoke box, canted cheeks and sensor head are gone. It keeps
        // the station's name, side and working rig (userData.remoteControlled marks a working station, as on the C1).
        // (Round 2: at the old station's seat, aft-outboard of the hatch ring; on the ring's centre the field net's right
        // flank re-cut and the turret's ring-overhang pockets grew 2020 -> 2216 cm2, roof-pocket census.)
        const rwsX = 0.54, rwsZ = L(-0.57);
        const remoteRws = FITTINGS.pintleMG({ working: true, ridingCradle: true, mats: P.mats, cls: 'm2', tone: 'two-tone',
          elev: -0.02, ammo: true, shield: 'armored', scale: 0.86, seed: 46 });
        remoteRws.name = 'arieteC2RemoteRws';
        remoteRws.userData.remoteControlled = true;
        addFitting(P, 'turret', remoteRws, rwsX, 0.895, rwsZ, [0, 0, 0]);
        P.decal('turret', 'number', 'C2 01', 0.24, [-1.29, 0.40, L(-0.55)], -Math.PI / 2, 0, -0.02);
      };
      buildArieteMkMarkingsCourse1();
    } else {
      const buildArieteMkMarkingsCourse2 = (): void => {
        // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): a working station (the loader's AA MG 42/59)
        const loaderMg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mg3', tone: 'two-tone',
          elev: 0, shield: false, scale: 0.62, seed: 45, working: true, ridingCradle: true });
        loaderMg.name = 'arieteC1LoaderMg';
        addFitting(P, 'turret', loaderMg, -0.42, 0.87, L(-0.60), [0, 2.9, 0]);
        P.decal('turret', 'number', 'C1 32', 0.24, [-1.29, 0.40, L(-0.55)], -Math.PI / 2, 0, -0.02);
      };
      buildArieteMkMarkingsCourse2();
    }
  };
  buildArieteMkMarkingsStage1();
  yield 'buildArieteMkMarkingsStage1';
  const buildArieteMkHullStage4 = (): void => {
    P.turretG.userData.arieteSidePanelReceipt = Object.freeze({
      owner: 'turret',
      panels: 2,
      formerInnerFaceXM: 1.40,
      carrierFaceXM: 1.13,
      innerFaceXM: 1.115,
      outerFaceXM: 1.235,
      carrierOverlapM: 0.015,
      rackSupportArmsPerSide: 3,
      rearBasketBridgesPerSide: 1,
      maxSupportGapM: 0,
      followsTurretYaw: true,
    });
    if (!c2) P.hullG.userData.arieteC1EraReceipt = Object.freeze({ ...c1EraReceipt });
    if (c2 && c2EraReceipt) {
      c2EraReceipt.totalTurretCassettes = c2EraReceipt.turretCheekCassettes
        + c2EraReceipt.turretSideCassettes + c2EraReceipt.turretBustleCassettes;
      c2EraReceipt.totalCassettes = c2EraReceipt.totalTurretCassettes
        + c2EraReceipt.sideSkirtCassettes;
      P.turretG.userData.arieteC2EraReceipt = Object.freeze(c2EraReceipt);
    }
    P.turretG.userData.arieteEquipmentReceipt = Object.freeze(c2 ? {
      // 267: one working station, the loader's shielded 12.7 mm pintle gun at his hatch (the C2 photographs)
      roofWeaponStations: 1,
      remoteWeapon: 'm2',
      remoteControlled: true,
      remoteWeaponSide: 'right',
      armoredTower: false,
      gunShield: true,
      rotatingShoulderModules: 4,
      rotatingApuAssembly: true,
    } : {
      // VH.14: the C1's one roof gun is the loader's AA MG 42/59 (the commander's cupola gun is gone)
      roofWeaponStations: 1,
      manualPintles: 1,
      remoteControlled: false,
      rotatingShoulderModules: 4,
      rotatingApuAssembly: false,
    });

    // gun: OTO Breda 120/44; muzzle at the published overall (+5.875; the
    // print tube ends +5.46 — certified short-tube class, wholeCurves cover
    // only). Thermal sleeve + MRS hand-authored at r <= 0.115 so no ring pokes
    // the ±0.117 plan-column boundary (buildGun's 1.31x clamps did).
    buildGun(P, { len: 4.93, r: 0.10, baseR: 0.165 });
    for (const [f0, f1] of [[0.17, 0.46], [0.53, 0.82]]) {
      P.addGunExtra(cylZ(0.113, (f1 - f0) * 4.93, 14), 0, 0, (f0 + f1) / 2 * 4.93); // thermal sleeve segments (print steps @ zW 2.2-2.9 / 3.5-4.6)
      P.addGunExtraDark(cylZ(0.115, 0.05, 14), 0, 0, f0 * 4.93 + 0.02);          // seam rings
      P.addGunExtraDark(cylZ(0.115, 0.05, 14), 0, 0, f1 * 4.93 + 0.02);
    }
    P.addGunExtra(box(0.10, 0.09, 0.14), 0, 0.13, 4.38);                         // MRS head ON TOP of the tube (print 1.796 bump @ zW 5.29-5.39)
    muzzleBore(P, { len: 4.93, r: 0.10 });
    // Lift only body-owned geometry. The smart wheels, end drums, animated
    // band, shoes and torsion arms remain one terrain-seated running-gear rig.
    // This is intentionally not a root scale/offset: skirt thickness, gun run,
    // turret articulation and track contact retain their authored units.
    P.offsetBuckets([
      'hull', 'hullCupola', 'hullEquipment', 'hullDetail', 'hullDark',
      'hullRubber', 'hullWood', 'hullCloth', 'hullGlass', 'hullTrack',
      'hullTrackGuardL', 'hullTrackGuardR', 'hullTrackTrimL', 'hullTrackTrimR',
      'hullTrackDetailL', 'hullTrackDetailR',
    ], 0, BODY_RIDE_LIFT, 0);
  };
  buildArieteMkHullStage4();
  yield 'buildArieteMkHullStage4';

  // Owner scale pass: bake the full C1/C2 family into a genuinely 10%
  // larger authored frame. Geometry buckets, direct smart-running-gear and
  // fitting children, decals, pivots, muzzle/top anchors, and collision
  // metadata all move together; the articulation rigs themselves stay at
  // identity scale so downstream anatomy and metrology see actual metres.
  const scale = 1.10;
  const buildArieteMkAssemblyStage2 = (): void => {
    P.scaleAllBuckets(scale);
    P.scaleDecals(scale);
    for (const child of [...P.hullG.children]) {
      child.position.multiplyScalar(scale);
      child.scale.multiplyScalar(scale);
    }
  };
  buildArieteMkAssemblyStage2();
  yield 'buildArieteMkAssemblyStage2';
  for (const child of [...P.turretG.children]) {
    if (child === P.gunG) continue;
    child.position.multiplyScalar(scale);
    child.scale.multiplyScalar(scale);
  }
  const buildArieteMkAssemblyStage3 = (): void => {
    P.turretG.position.multiplyScalar(scale);
    if (P.gear?.contactGeom) {
      for (const key of ['halfLenM', 'zCenterM', 'halfWidM', 'bottomYM'] as const) {
        P.gear.contactGeom[key] *= scale;
      }
      if (P.gear.contactGeom.endRise) {
        for (const key of ['dzM', 'frontM', 'rearM'] as const) {
          P.gear.contactGeom.endRise[key] *= scale;
        }
      }
    }
    for (const lane of P.gear?.trackHitbox || []) {
      lane.x0 *= scale;
      lane.x1 *= scale;
      lane.poly = lane.poly.map(([z, y]) => [z * scale, y * scale]);
    }
    P.muzzleZ *= scale;
    P.topY = (2.55 + BODY_RIDE_LIFT + ARIETE_PROTO_TURRET_LIFT_M) * scale;
  };
  buildArieteMkAssemblyStage3();
  yield 'buildArieteMkAssemblyStage3';
  const scaleReceipt = Object.freeze({
    uniformScale: scale,
    bakedGeometry: true,
    armorFrameScaled: true,
    turretPivotScaled: true,
    trackContactMetadataScaled: true,
    trackHitGeometryScaled: true,
  });
  const buildArieteMkReceiptStage1 = (): void => {
    P.hullG.userData.arieteFamilyScaleReceipt = scaleReceipt;
    P.turretG.userData.arieteFamilyScaleReceipt = scaleReceipt;
    P.hullG.userData.arieteSideSkirtFenderSeatReceipt = Object.freeze({
      revision: 'full-height-fender-seat-r1',
      sides: 2,
      fenderBridgeCoursesPerSide: 2,
      skirtPanelsPerSide: c2 ? 13 : 7,
      lowerEdgesPreserved: true,
      skirtSeatRearM: skirtSeatRear * scale,
      skirtSeatFrontM: 3.09 * scale,
      baseSkirtBottomYM: (baseSkirtBottomY + BODY_RIDE_LIFT) * scale,
      baseSkirtTopYM: (baseSkirtTopY + BODY_RIDE_LIFT) * scale,
      heavySkirtBottomYM: (heavySkirtBottomY + BODY_RIDE_LIFT) * scale,
      heavySkirtTopYM: (heavySkirtTopY + BODY_RIDE_LIFT) * scale,
      sideWallBottomYM: (1.36 + BODY_RIDE_LIFT) * scale,
      verticalSeatOverlapM: (heavySkirtTopY - 1.36) * scale,
      inboardHullOverlapM: (1.535 - 1.48) * scale,
      maxSupportGapM: 0,
    });
  };
  buildArieteMkReceiptStage1();
}

const buildArieteC1 = steppedBuilder((P: ItalyBuilderPort) => buildArieteMkSteps(P, 'c1'));
const buildArieteC2 = steppedBuilder(function* (P: ItalyBuilderPort): TankProfileBuild {
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  addVehicleGhillieSuit(P);
  yield* buildArieteMkSteps(P, 'c2');
});

// ---------------------------------------------------------------------------
// 267: the Carro's own parts live in carro45tParts.ts (imported here, beside its builder, so the shared header stays
// the Ariete builder's).
import { CARRO_TURRET, addCarroBowKit, addCarroBustleBins, addCarroDeckLouvres, addCarroEngineDeck, addCarroHatches,
  addCarroRearHatch, addCarroRoofOptics, carroGlacisGeometry,
  addCarroSkirts, addCarroSternKit, carroCheekGeometry, carroCrownGeometry, carroMantletGeometry, seatOnCarroUpperPlate,
} from './carro45tParts.ts';
// Carro 45t — OTO 45-tonne paper project, print-true ground-up build.
// Gate-true lines (gatecurves decode, K=1): hull deck 1.496 (-2.25..+1.24),
// rear deck 1.55 (-3.32..-2.96), stern tail 1.42-1.45 with raked plate;
// driver casemate crest x ±0.39 (2.17-2.23 @ +1.25..+1.73, step 2.02 to
// +2.19); glacis to nose 1.03@+3.43; turret: ring skirt 1.51, roof plateau
// 2.35 (-1.40..+1.0), rear slope 2.35->2.16 (-1.40..-2.24), cupola 2.42,
// asymmetric right shelf 2.19; mantlet housing 1.59..2.02 to zW +2.11; long
// 105mm with mid-tube evacuator (2.03@+5.55), muzzle +7.11; exposed
// six-wheel gear with raised idler (ramp to +3.5) and rear sprocket.
// ---------------------------------------------------------------------------
function* buildCarro45TSteps(P: ItalyBuilderPort): TankProfileBuild {
  const { box, cylY, cylZ, buildGun, buildRunningGear, liftEye } = KIT;
  const slab = orientedSlab;

  // ---- hull tub + decks -----------------------------------------------------
  const buildCarro45TMarkingsStage1 = (): void => {
    // 267: the tub, its inner walls and the sponson floors end under the upper glacis (they stood up to 13 cm through it)
    P.add('hull', box(1.90, 0.81, 5.55), 0, 0.895, 0.075);                       // tub core x ±0.95 (the 1.02 inner band plane owns the lane)
    P.add('hull', box(2.80, 0.09, 5.06), 0, 1.375, -0.17);                       // sponson floors x ±1.40 ABOVE the animated sweep envelope (track top + bump travel)
    P.add('hull', box(2.80, 0.05, 4.45), 0, 1.471, -0.025);                      // main deck 1.496 (z -2.25..+2.20 — gate ref hull runs FLAT to the glacis knee; the raised crest is TURRET material in the print)
    for (const s of [-1, 1]) P.add('hull', box(0.035, 0.98, 5.55), s * 0.965, 0.81, 0.075); // inner sponson walls (front_hull bot 0.324 @ ±0.95-0.98)
    // 267: one engine-deck plate at 1.455 and two framed louvre fields (carro45tParts.ts) replace the four stepped
    // boxes (1.556/1.543/1.509/1.474) whose seams cut the old flat slats into dashes; VEH-13: no seat for spare links
    addCarroEngineDeck(P);
    withSeatRole(P, 'grille', (P) => addCarroDeckLouvres(P));
    // fuel caps on the engine deck ahead of the louvres (267: off the turret deck, whose 1.52 caps set the turret seat 2 cm
    // higher round their radius)
    for (const s of [-1, 1]) P.add('hullDetail', cylY(0.09, 0.09, 0.025, 12), s * 1.20, 1.4625, -2.33);
    // ---- stern (tail 1.42-1.45 @ -3.42..-3.48, raked plate; plan rear center
    // -3.42..-3.49) -------------------------------------------------------------
    P.add('hull', slab(                                                          // raked tail plate center (the shoe lane owns |x| 1.02..1.58 below 1.26)
      [-0.95, 0.65, -3.24], [0.95, 0.65, -3.24], [0.95, 0.95, -3.385], [-0.95, 0.95, -3.385],
      [-0.95, 1.44, -3.29], [0.95, 1.44, -3.29], [0.95, 1.44, -3.36], [-0.95, 1.44, -3.36]));
    for (const s2 of [-1, 1]) P.add('hull', slab(                                // tail plate outer courses ABOVE the band top
      [s2 * 0.94, 1.26, -3.26], [s2 * 1.38, 1.26, -3.26], [s2 * 1.38, 1.26, -3.34], [s2 * 0.94, 1.26, -3.36],
      [s2 * 0.94, 1.44, -3.29], [s2 * 1.38, 1.44, -3.29], [s2 * 1.38, 1.44, -3.34], [s2 * 0.94, 1.44, -3.36]));
    // The belly rises from the tub's rear edge (z -2.70, y 0.49) to the raked plate's foot (z -3.24, y 0.65) on a
    // lower rear plate (owner 2026-10-19, "the empty gaps in hulls": the engine bay stood open 0.54 m from below, up to
    // the deck), 40 mm into the tub and 10 mm into the raked plate.
    P.add('hull', slab(
      [-0.944, 0.496, -2.66], [0.944, 0.496, -2.66], [0.944, 0.656, -3.25], [-0.944, 0.656, -3.25],
      [-0.944, 0.576, -2.66], [0.944, 0.576, -2.66], [0.944, 0.736, -3.25], [-0.944, 0.736, -3.25]));
    P.add('hull', box(1.90, 0.62, 0.11), 0, 1.02, -3.405);                       // center exhaust recess block (ref plan -3.40..-3.46 across |x|<0.95)
    P.add('hull', box(2.76, 0.29, 0.10), 0, 1.295, -3.38);                       // upper rear plate band (267: top 1.45 -> 1.44, under the gun's stern sweep)
    // 267: the louvred exhaust grille, tail-light clusters and rear clevises (carro45tParts.ts) replace the flat black
    // panel, the hidden louvre field and the buried lamps; the final-drive caps became the skirt's rear panel
    addCarroSternKit(P);
    P.add('hull', box(0.36, 0.16, 0.10), 0, 1.38, -3.42);                        // convoy shield block (band-thin: the tail body edge stays pinned at -3.385)
    // ---- glacis + bow ((2.20,1.47)->(3.10,1.24)->nose 1.03@3.43; chin
    // 0.49@2.80 -> 0.95@3.43; final-drive noses to +3.52) -----------------------
    // upper glacis plane + nose wedge to +3.37 (ref PLAN center front 3.31-3.36), 267: one subdivided loft of the same
    // lines (carro45tParts.ts), so the baked shading draws no diagonal seam across the plate
    P.add('hull', carroGlacisGeometry());
    P.add('hull', box(1.89, 0.138, 0.365), 0, 1.169, 2.8825);                    // bow fill between the chin and the glacis underside (the shortened tub left a 7 L pocket)
    P.add('hull', slab(                                                          // bow chin (tip band stays sub-threshold for the hull-row frame pin;
      [-0.95, 0.49, 2.70], [0.95, 0.49, 2.70], [0.94, 0.96, 3.47], [-0.94, 0.96, 3.47],   // x ±0.95 clear of the idler wrap)
      [-0.95, 1.26, 2.70], [0.95, 1.26, 2.70], [0.94, 1.02, 3.47], [-0.94, 1.02, 3.47]));
    // 267: the outboard shoulder slabs and tips (they stood 3-5 cm through the glacis and nose), the boxed final-drive
    // noses, pod tips and glacis headlight drums are gone: the frustum and nose wedge close the bow, and the driver's
    // hatch, nose lamp clusters and lower-glacis clevises (carro45tParts.ts) carry its fittings.
    addCarroBowKit(P);
    for (const s of [-1, 1]) {
      P.add('hull', slab(                                                        // bow corner closure wedges (inside the 1.017 lane plane, bottoms riding
        [s * 0.95, 0.30, 2.70], [s * 0.985, 0.30, 2.70], [s * 0.985, 1.00, 3.42], [s * 0.95, 1.00, 3.42],  // the ramp line so the side view keeps the print's ramp)
        [s * 0.95, 1.26, 2.70], [s * 0.985, 1.26, 2.70], [s * 0.985, 1.06, 3.42], [s * 0.95, 1.06, 3.42]));
    }
    P.decal('hull', 'number', '45T', 0.26, [-0.72, 1.345, 2.62], 0, -0.255);
  };
  buildCarro45TMarkingsStage1();
  yield 'buildCarro45TMarkingsStage1';
  // ---- fenders + side aprons (front_hull: fender band ±1.40..1.71 tops
  // 1.50-1.53, outer droop 1.40; aprons ±1.62..1.71 down to 0.90; stations
  // w 3.42 the whole run) -----------------------------------------------------
  const buildCarro45THullStage1 = (): void => {
    // 267: bolted skirt panels (carro45tParts.ts) replace the 3 cm apron bays, width strips and painted seams
    addCarroSkirts(P);
    for (const s of [-1, 1]) {
      const buildCarro45THullCourse1 = (): void => {
        for (let k = 0; k < 14; k++) {                                             // fender plane + hem + apron in 0.46 m bays (edge-on prism law:
          const bz = -3.345 + 0.4596 * k + 0.2298;                                 // every 0.50 station slab contains a real end face); the run ENDS at
          // +3.09 like the print's fender line (plan front 3.005-3.093), TAPERING toward the bow; bays inside the turret
          // swing ride at 1.48 (xk2_black_panther sweep law). 267: the bays at both ends step down under the 105's -8
          // degree sweep over the hull corners (bay 11 1.512 -> 1.464, bay 12 1.475 -> 1.44, bay 13 1.40 -> 1.38, stern
          // bays 1.512 -> 1.425)
          const fy = k >= 13 ? 1.38 : k >= 12 ? 1.44 : k <= 1 ? 1.425 : 1.464;
          // owner 2026-10-19 (flaps sweep): every bay widens 15 mm inboard into the hull side the run stood 10 mm off; the
          // stern bay (k 0) also runs 17 mm forward into bay 1 across the 12 mm seam (past the hull's end it has no other seat)
          const bw = 0.285, bl = k === 0 ? 0.4646 : 0.4476, bc = k === 0 ? bz + 0.0085 : bz;
          P.add('hull', box(bw, 0.032, bl), s * (1.68 - bw / 2), fy, bc);         // toward the bow (gate tops 1.38-1.42 over the nose)
          P.add('hull', box(0.035, 0.045, 0.4476), s * 1.6975, fy - 0.087, bz);    // outer hem DROOPED (gate 1.43-1.45 @ ±1.70)
        }
        // 267: the front flap stub, its loose hanger and the 6 cm flap 22 cm ahead of the fender are gone: the skirt's
        // front panel now runs over the idler to the fender's end
        MUDGUARDS.add(P, { hang: true,
          label: `italy-rear-flap-${s}`, x: s * 1.55, y: 1.02, z: -3.30,
          thickness: 0.03, length: 0.24, height: 0.28, material: 'rubber',
          rotation: [0, Math.PI / 2, 0], crown: 0.009, rearCut: 0.035,
        });                                                                        // rear flaps
        // 267: the fender crowbar, shovel, jack bar and jack block are gone: they stood up to 11 cm over the fender bays
        // under them and in the 105's -8 degree sweep over the bow and stern corners (the gun sweep's only hull stops
        // there); the fenders run clean as on the C1 Ariete.
        if (s > 0) {
          // 2026-10-16 (226 gate, the coordinator: an add-on must not stretch the declared dimensions): the deck seat aft of
          // the swing is an engine grille, and the seat solver's remount stood the links on the right apron, 10.5 cm
          // outside the 3.43 m design width (concept check: width +3.2 %). No other hull station holds them inside the
          // envelope, so they ride the turret's right wall, laid on its 34-degree slope under the bustle band, well
          // inside the width (outer face x 1.46) and clear of the smoke bank and the gun's sweep (seats as authored).
          // 267: laid flat on the rebuilt left upper plate between the smoke bank and the bustle bin
          const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.40, seed: 77 });
          seatOnCarroUpperPlate(links, 1, 0.56, -0.26);                            // aft of the insignia seat (z 0.04..0.28)
          P.turretG.add(links);
        }
      };
      buildCarro45THullCourse1();
    }
  };
  buildCarro45THullStage1();
  yield 'buildCarro45THullStage1';
  const buildCarro45TRunningGearStage1 = (): void => {
    liftEye(P, 'hullDetail', -1.05, 1.325, 2.62);                               // bow eyes on the glacis plane, under the fender line
    liftEye(P, 'hullDetail', 1.05, 1.325, 2.62);

    // ---- running gear: exposed six-wheel course print-true (wheel census:
    // idler z+2.69 y0.77 r0.31; wheels z 2.02..-1.88 y0.42 r0.36; rollers
    // z 1.60/0.06/-1.48 y0.945; sprocket z-2.945 y0.76 r0.375; track band
    // x 0.981..1.618, top 1.135) ------------------------------------------------
    buildRunningGear(P, {
      style: 'rubber', wheelR: 0.36, wheelW: 0.24, wheelY: 0.42, xc: 1.30,
      wheelZs: [2.02, 1.23, 0.46, -0.34, -1.11, -1.88],
      idler: { z: 2.69, y: 0.77, r: 0.31 }, sprocket: { z: -2.80, y: 0.89, r: 0.35 },  // sprocket seated so MY taut ramp lifts at the print's -2.05 line (arc 0.44@-3.0, 0.55@-3.2)
      rollers: [1.60, 0.06, -1.48].map((z) => ({ z, y: 0.945, r: 0.125 })),
      trackW: 0.56, topY: 1.08, botY: 0.055, contactZF: 2.15, contactZR: -1.95,
      paintedEnds: true, coveredTop: false, arms: true, armBucket: 'hullRunningGearDetail',
    });

    // ---- turret ---------------------------------------------------------------
    P.turretG.position.set(0, 1.50, -0.30);
  };
  buildCarro45TRunningGearStage1();
  yield 'buildCarro45TRunningGearStage1';
  const L = (zWorld: number): number => zWorld + 0.30;
  // 267 (owner: "now update the ... carro 45t"): the 2026-09-29 continuous crown rebuilt as a welded shell of planar
  // faces (carro45tParts.ts): a vertical belt, one upper-plate lean and a flat roof the whole length, one plan sweep
  // from the side wall to the cheek noses, the bustle undercut and raked at its rear face.
  const crown = carroCrownGeometry();
  // Use the actual triangulated surface to seat roof fittings, including the
  // lower right shoulder. This is construction-time work, never a frame update.
  const roofProbe = new THREE.Mesh(crown, new THREE.MeshBasicMaterial());
  const roofRay = new THREE.Raycaster();
  const roofY = (x: number, z: number): number => {
    roofRay.set(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0));
    const hit = roofRay.intersectObject(roofProbe, false)[0];
    if (!hit) throw new Error(`Carro roof fitting outside shell: ${x}, ${z}`);
    return hit.point.y;
  };
  const buildCarro45TTurretStage1 = (): void => {
    P.add('turret', crown);
    // Closed cheeks meet the crown at z=1.40. Their inner walls form an open
    // 0.88 m gun bay; the mantlet moves in this space instead of through a lip.
    for (const side of [-1, 1] as const) P.add('turret', carroCheekGeometry(side));
    // 267: the crew stations of a three-man autoloader turret, OF-40 / C1 Ariete style: the gunner's roof sight with
    // its lifted visor (right front), the commander's panoramic head and cupola behind it, the left hatch with its two
    // periscopes, the armoured vent over the bustle magazine (every piece in its own hatch/cupola/optics bucket, so
    // the shell stays one closed roof skin).
    addCarroRoofOptics(P);
    addCarroHatches(P);
  };
  buildCarro45TTurretStage1();
  yield 'buildCarro45TTurretStage1';
  // Rear service grille and fittings follow the integral bustle.
  const buildCarro45TTurretStage2 = (): void => {
    // 267: bustle bins a side and the magazine's replenishment hatch on the rear face (carro45tParts.ts), the basket
    // under it on the full raked face, its mount side 10 mm into the plate.
    addCarroBustleBins(P);
    addCarroRearHatch(P);
    const rackD = 0.30;
    addFitting(P, 'turret', FITTINGS.stowageRack({ mats: P.mats, w: 1.80, d: rackD,
      h: 0.30, fill: 0.45, rails: 2, seed: 76 }), 0, 0.20, CARRO_TURRET.rearZ - rackD / 2 + 0.010,
      [0, Math.PI, 0]);                                                          // rear rack: open face points outboard (-Z)
    // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): a working station beside the left hatch
    addFitting(P, 'turret', FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone',
      elev: 0, shield: false, scale: 0.50, seed: 72, working: true, ridingCradle: true }),
    0.20, roofY(0.20, -0.66) - 0.015, -0.66, [0, 0.30, 0]);                     // the Breda, its pedestal embedded in the roof
    // Five-tube banks on the roof's front shoulders, firing forward and outboard (C1 Ariete / OF-40 placement).
    for (const s of [-1, 1]) addFitting(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 5, r: 0.040, len: 0.24, splay: s * 0.42,
      pitch: -0.72, arc: 0.40, spacing: 0.085, slot: 'detail',
      seed: 78 + (s > 0 ? 1 : 0),
    }), s * 0.88, roofY(s * 0.88, 0.40) + 0.018, 0.40);
    // Two whips on pots at the rear roof corners, tips at the 4.05 m record height.
    for (const s of [-1, 1]) {
      const wx = s * 0.82, wz = -1.42, wh = 1.59, wy = roofY(wx, wz);
      P.add('turretDark', cylY(0.040, 0.050, 0.08, 10), wx, wy + 0.03, wz);
      P.add('turretDark', cylY(0.022, 0.022, 0.05, 8), wx, wy + 0.09, wz);
      P.add('turretDetail', antennaPart(box(0.030, wh, 0.030)), wx, wy + 0.11 + wh / 2, wz);
    }
    for (const [x, z] of [[1.0, -1.30], [-1.0, -1.30], [0.95, 0.85], [-0.95, 0.85]]) liftEye(P, 'turretDetail', x, roofY(x, z), z);
  };
  buildCarro45TTurretStage2();
  yield 'buildCarro45TTurretStage2';
  // turret designation, the mantlet and the 105
  const buildCarro45TMarkingsStage2 = (): void => {
    P.decal('turret', 'number', '45T', 0.25, [-CARRO_TURRET.wall - 0.004, 0.17, L(-0.55)], -Math.PI / 2, 0, 0);

    // saddle mantlet (node Object_6: x ±0.39, y 1.589..2.226, z 1.16..2.11;
    // gate top 2.02 @ +1.83..+2.11 with the chin rising 1.72-1.78)
    // 267: one wedge mantlet (carro45tParts.ts) replaces the stacked housing, saddle lip and chin boxes
    P.addGunExtra(carroMantletGeometry());
    P.addGunExtra(cylZ(0.150, 0.26, P.q ? 20 : 12, 0.136), 0, 0, 0.97);         // gun sleeve collar ahead of the wedge nose
    P.addGunExtraDark(cylZ(0.030, 0.012, 10), 0.24, 0.0, 0.842);                // coax port, a flush disc on the nose face
    for (const [bx, by] of [[-0.29, 0.06], [-0.29, -0.06], [0.29, 0.06], [0.29, -0.06]]) {
      P.addGunExtraDark(cylZ(0.014, 0.010, 8), bx, by, 0.842);                  // face-plate bolts, flush heads
    }
    // 105mm: slim tube, mid-tube evacuator drum (side_gun swell r 0.139
    // z 5.47..6.17), plain slim muzzle at +7.11 (overall 10.60)
    buildGun(P, { len: 6.11, r: 0.10, baseR: 0.135, evac: 0.785, evacR: 1.39 });
    muzzleBore(P, { len: 6.11, r: 0.10 });
    P.topY = 2.45;
  };
  buildCarro45TMarkingsStage2();
  roofProbe.material.dispose();
}
function buildCarro45T(...args: Parameters<typeof buildCarro45TSteps>): void {
  drainTankBuild(buildCarro45TSteps(...args));
}
withBuildSteps(buildCarro45T, buildCarro45TSteps);

export const ITALY_PROFILES = {
  c1_ariete_preserie: { build: buildAriete },
  c1_ariete_proto_serie1: { build: buildArieteC1 },
  c2_ariete_proto: { build: buildArieteC2 },
  carro45t: { build: buildCarro45T },
} satisfies VehicleProfileRecord;
