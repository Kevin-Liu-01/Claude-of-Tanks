// Italian tracked-vehicle family — §5.248 GROUND-UP REBUILDS (italy wave).
//
// All geometry in this module is first-party procedural, authored §K-style
// (measure -> loft to measured lines -> close with real geometry -> prove in
// pixels) from the two LOCAL-ONLY §5.248 batch-B prints:
//   ariete_c1_arrafi.glb  (CC-BY-4.0 M. M. Arrafi; semantic material split
//     Hull/Turret/Cannon/SideSkirts/Applique/Glass/Gear) — governs ariete_c1
//     and serves as the ariete_c2 influence print.
//   carro45t_hlebov.glb   (CC-BY-4.0 D. Hlebov; paper vehicle — the print IS
//     the primary source; orientation heuristic misfire adjudicated: gun end
//     carries the glacis+casemate, sprocket at the stern).
// Measured via tools/vertex-extract.mjs + the gate's own traced curves
// (tools/tmp-italy-curves.mjs -> scratchpad gatecurves; the gate curves are
// the authoritative hull/turret split — the extract's follower regex missed
// Object_2/6, so raw-extract splits are cited only where the gate agrees).
// No source object, topology, texture, or converted vertex payload ships.
//
// FRAME LAW (packet-documented): every ariete_c1/_c2 coordinate below is the
// arrafi print's measured line with z normalized x1.08803 (published hull
// 7.59 / print hull-mask 6.976 — the print is uniformly z-compressed; y/x
// carried at width-anchored print scale, which reads height/width right).
// The gate measures the UNWARPED print, so length-coupled curve rows carry a
// structural residual until the §E z-warp lands (recipe banked in the
// packet); dims/stations/floaters and all y/x-driven reads are exact.
// carro45t is print-true at K=1 (spec row anchors: 6.98/10.60/3.43 all match
// the print within 0.3%; heightM 2.95 stays the gameplay anchor while the
// gate compares the print's own p95 body envelope via silhouetteHeightM).
// The base `ariete` (Preserie) stays its own graduated tank in misc.ts —
// UNTOUCHED donor, byte-held.

import * as THREE from 'three';
import { KIT, FITTINGS, MUDGUARDS, muzzleBore, orientedSlab } from './kit.ts';
import { buildAriete } from './misc.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

type Vec3Tuple = [number, number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';
type Quad = [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple];
type ArieteMark = 'c1' | 'c2';

interface ItalyBuilderPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: unknown;
  readonly rng: unknown;
  readonly q?: boolean;
  readonly geometryReceipt?: boolean;
  readonly gear?: {
    contactGeom: {
      halfLenM: number;
      zCenterM: number;
      halfWidM: number;
      bottomYM: number;
      endRise?: { dzM: number; frontM: number; rearM: number };
    };
    trackHitbox: Array<{ x0: number; x1: number; poly: Array<[number, number]> }>;
  } | null;
  muzzleZ: number;
  topY?: number;
  add(slot: string, geometry: unknown, ...transform: number[]): unknown;
  addCupola(
    owner: VehicleAssemblyOwner,
    geometry: unknown,
    ...transform: number[]
  ): unknown;
  addEquipment(
    owner: VehicleAssemblyOwner,
    geometry: unknown,
    ...transform: number[]
  ): unknown;
  addGunExtra(geometry: unknown, ...transform: number[]): unknown;
  addGunExtraDark(geometry: unknown, ...transform: number[]): unknown;
  addMudguard(key: string, slot: string, geometry: unknown, ...transform: number[]): unknown;
  decal(
    owner: VehicleAssemblyOwner,
    kind: string,
    label: string,
    scale: number,
    position: Vec3Tuple,
    ...orientation: number[]
  ): unknown;
  scaleAllBuckets(x?: number, y?: number, z?: number): void;
  scaleDecals(scale: number): void;
  offsetBuckets(names: readonly string[], x: number, y: number, z: number): unknown;
  visualEraCluster(
    key: string,
    owner: VehicleAssemblyOwner,
    build: () => void,
  ): unknown;
}

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

function addFitting(
  P: ItalyBuilderPort,
  owner: VehicleAssemblyOwner,
  fitting: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  rotation: Vec3Tuple | null = null,
): void {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

// Sample the actual carrier quad so add-on modules inherit its compound
// pitch/sweep instead of approximating the surface with hand-tuned Eulers.
function sampleArmorFace(
  p00: Vec3Tuple,
  p10: Vec3Tuple,
  p11: Vec3Tuple,
  p01: Vec3Tuple,
  u: number,
  v: number,
  outwardHint: Vec3Tuple,
): Required<ArmorFaceSample> {
  const a = new THREE.Vector3(...p00);
  const b = new THREE.Vector3(...p10);
  const c = new THREE.Vector3(...p11);
  const d = new THREE.Vector3(...p01);
  const point = a.clone().multiplyScalar((1 - u) * (1 - v))
    .addScaledVector(b, u * (1 - v))
    .addScaledVector(c, u * v)
    .addScaledVector(d, (1 - u) * v);
  const du = b.clone().sub(a).multiplyScalar(1 - v)
    .add(c.clone().sub(d).multiplyScalar(v));
  const dv = d.clone().sub(a).multiplyScalar(1 - u)
    .add(c.clone().sub(b).multiplyScalar(u));
  const normal = new THREE.Vector3().crossVectors(du, dv).normalize();
  if (normal.dot(new THREE.Vector3(...outwardHint)) < 0) normal.negate();
  return { point, normal, du, dv };
}

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
// ---------------------------------------------------------------------------
function buildArieteMk(P: ItalyBuilderPort, mark: ArieteMark): void {
  const { box, cylY, cylZ, openRackGrid, torus, buildGun, buildRunningGear,
    headlight, liftEye, periscope, towCable, stowage } = KIT;
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
  // The supplied Arrafi reference carries a 1.06 m running-gear envelope
  // and ~0.60 m shoes. Keep that mechanical course rooted at the terrain,
  // then raise the armored body on its suspension before applying the final
  // uniform owner scale; this preserves the corrected body/course relation.
  const BODY_RIDE_LIFT = 0.10;
  // Establish the articulation frame before adding the C2's marked shoulder
  // modules.  They used to be authored into hull buckets, so their boxes
  // stayed behind when the turret yawed.  L() and localY() preserve their
  // exact zero-yaw world seats while transferring ownership to rig_turret.
  P.turretG.position.set(0, 1.30 + BODY_RIDE_LIFT, -0.10);
  const L = (zWorld: number): number => zWorld + 0.10;                         // world z -> turret local
  const localY = (yWorldBeforeLift: number): number => yWorldBeforeLift - 1.30;

  // ---- hull tub + sponsons -------------------------------------------------
  // Narrow buried belly core: the former ±0.95 m face occupied the linked
  // shoe guide-horn sweep (68 strict voxels before the owner scale, 80
  // after). The visible sponsons/skirts and armor frame retain their exact
  // reviewed widths; only this hidden inner tub clears the animated course.
  P.add('hull', box(1.60, 0.90, 6.30), 0, 0.85, 0.05);                         // tub x ±0.80, belly 0.40
  P.add('hull', box(3.07, 0.15, 5.24), 0, 1.435, -0.95);                       // hull side walls ±1.535 (stations st0-5 w 3.04-3.07), y 1.36..1.51 —
  // §5.299: walls END at the driver line +1.67 (the old +2.87 overshoot
  // painted a flat 1.51 shelf over the whole glacis; the print's own side
  // silhouette rakes 1.51@1.62 -> 1.17@3.7 — rear extreme -3.57 byte-held)
  // ---- decks (gate ref side_hull) -------------------------------------------
  P.add('hull', box(3.05, 0.05, 1.31), 0, 1.475, -2.445);                      // rear deck 1.50 (z -3.10..-1.79)
  P.add('hull', box(3.05, 0.05, 0.72), 0, 1.465, -1.43);                       // mid deck 1.49 (z -1.79..-1.07)
  P.add('hull', box(3.05, 0.045, 0.24), 0, 1.4275, -0.95);                     // dip step 1.45 (z -1.07..-0.83)
  P.add('hull', box(3.05, 0.045, 0.30), 0, 1.3375, -0.68);                     // dip low 1.36 (z -0.83..-0.53)
  P.add('hull', box(3.05, 0.05, 1.10), 0, 1.415, 0.02);                        // ring deck 1.44 (z -0.53..+0.57, under the cage)
  P.add('hull', box(3.05, 0.05, 1.10), 0, 1.42, 1.12);                         // fore deck 1.445 (z +0.57..+1.67, under the fairing)
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
    [-0.95, 1.24, 3.00], [0.95, 1.24, 3.00], [0.90, 1.19, 3.79], [-0.90, 1.19, 3.79]));
  for (const s of [-1, 1]) {
    P.add('hull', slab(                                                        // bow shoulder closures tub->nose (idler pocket, §5.18 no-air;
      [s * 0.88, 0.42, 3.00], [s * 0.95, 0.42, 3.00], [s * 0.95, 0.70, 3.55], [s * 0.88, 0.70, 3.55],  // outer face ±0.95 clear of the lane)
      [s * 0.88, 1.26, 3.00], [s * 0.95, 1.26, 3.00], [s * 0.95, 1.15, 3.55], [s * 0.88, 1.15, 3.55])); // tops tucked under the §5.299 raked B plane
    P.add('hull', box(0.18, 0.14, 0.19), s * 0.87, 1.20, 3.705);               // nose center bumps to +3.80 (plan_hull 3.803 @ x ±0.825..0.915)
    headlight(P, s * 0.87, 1.10, 3.70, -0.22, 0.05);                           // headlight pods on the bumps
    P.add('hullDetail', torus(0.075, 0.015, 10), s * 0.50, 0.62, 3.70, Math.PI / 2, 0, 0); // bow tow eyes
    // s5322-C4 headlight BRUSH GUARDS (§5.283 debt; thin low-kit bars also
    // armor the razor-margin bow anchor columns per the whip-rough law).
    P.add('hullDetail', box(0.014, 0.16, 0.014), s * 0.79, 1.12, 3.76);        // guard verticals (feet buried in the chin plane)
    P.add('hullDetail', box(0.014, 0.16, 0.014), s * 0.95, 1.12, 3.76);
    P.add('hullDetail', box(0.174, 0.014, 0.014), s * 0.87, 1.205, 3.76);      // guard hoop bar under the bump crest
    P.add('hullDetail', box(0.012, 0.012, 0.085), s * 0.79, 1.19, 3.7475);     // stays tied back into the bump face
    P.add('hullDetail', box(0.012, 0.012, 0.085), s * 0.95, 1.19, 3.7475);
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
  P.add('hullDark', box(1.24, 0.009, 0.28), 0.22, 1.3667, 1.86, 0.0638, 0, 0);
  P.add('hullDetail', box(1.18, 0.011, 0.022), 0.22, 1.3826, 1.77, 0.0638, 0, 0);
  P.add('hullDetail', box(1.18, 0.011, 0.022), 0.22, 1.3767, 1.86, 0.0638, 0, 0);
  P.add('hullDetail', box(1.18, 0.011, 0.022), 0.22, 1.3710, 1.95, 0.0638, 0, 0);
  for (let k = 0; k < 5; k++) {
    P.add('hullDetail', box(0.022, 0.011, 0.26), -0.26 + k * 0.24, 1.3767, 1.86, 0.0638, 0, 0);
  }
  for (const s of [-1, 1]) P.add('hullDetail', box(0.78, 0.04, 0.05), s * 0.39, 1.34, 2.30, -0.055, s * 0.42, 0); // V splash rail riding the raked plane (crest ~1.36, the print's furniture line)
  towCable(P, [[-1.06, 1.30, 2.50], [0, 1.355, 2.05], [1.06, 1.30, 2.50]]);     // drape re-seated on the §5.299 slope (was fully buried under the flat plate)
  // ---- amidships superstructure (gate-true: the print's tall mid content is
  // sponson bins + ring-cage posts + the left stack — NOT rear-deck towers).
  // side band: 2.16 (zW -0.45..+0.28) stepping 2.02..1.95 (+0.3..+1.0);
  // front comb: bins ±(1.03..1.48) to 1.86-2.03, posts -0.83(2.32),
  // -0.65(2.17), +0.30..+0.71(2.09-2.11) --------------------------------------
  for (const s of [-1, 1]) {
    const armorBucket = c2 ? 'turret' : 'hull';
    const darkBucket = c2 ? 'turretDark' : 'hullDark';
    const detailBucket = c2 ? 'turretDetail' : 'hullDetail';
    const y = (value: number): number => c2 ? localY(value) : value;
    const z = (value: number): number => c2 ? L(value) : value;
    P.add(armorBucket, box(0.42, 0.49, 0.66), s * 1.25, y(1.745), z(-0.06));    // sponson bin aft (top 1.99; ref inner edge 2.02)
    P.add(armorBucket, box(0.42, 0.40, 0.62), s * 1.25, y(1.70), z(0.62));      // sponson bin fore (top 1.90)
    P.add(darkBucket, box(0.38, 0.02, 0.58), s * 1.25, y(2.00), z(-0.06));     // bin lids
    P.add(darkBucket, box(0.38, 0.02, 0.54), s * 1.25, y(1.915), z(0.62));
    P.add(detailBucket, box(0.43, 0.03, 0.03), s * 1.25, y(1.80), z(-0.06));   // strap lines
    P.add(detailBucket, box(0.43, 0.03, 0.03), s * 1.25, y(1.78), z(0.62));
  }
  P.add('hull', cylY(0.84, 0.86, 0.08, P.q ? 26 : 14), 0, 1.48, 0.02);         // low turret race ring (top 1.52 — the ref's inter-post line)
  // LEFT equipment group (gate front comb: 2.32@-0.83, 2.17@-0.65..-0.55,
  // 2.16@-0.48): stack + boxes + fairing wedge onto the glacis
  P.add('hull', box(0.57, 0.72, 0.80), -0.565, 1.80, 0.02);                    // left group body (top 2.16, x -0.85..-0.28 per the gate front comb)
  P.add('hull', box(0.08, 0.86, 0.22), -0.815, 1.90, 0.06);                    // LEFT stack to 2.32 (ref column x -0.855..-0.775 ONLY)
  P.add('hullDark', box(0.06, 0.03, 0.18), -0.815, 2.345, 0.06);
  P.add('hull', slab(                                                          // §5.299 fairing re-loft to the print's stepped band: crest 2.02@+0.42 ->
    [-0.85, 1.44, 0.42], [-0.48, 1.44, 0.42], [-0.48, 1.42, 1.05], [-0.85, 1.42, 1.05],  // 1.95@+1.05 (gate side band "2.02..1.95 @ +0.3..+1.0")
    [-0.85, 2.02, 0.42], [-0.48, 2.02, 0.42], [-0.48, 1.95, 1.05], [-0.85, 1.95, 1.05]));
  P.add('hull', slab(                                                          // fairing ramp 1.95@+1.05 -> 1.475@+1.66 (K-frame print ramp 1.96@0.98 ->
    [-0.85, 1.42, 1.05], [-0.48, 1.42, 1.05], [-0.48, 1.34, 1.78], [-0.85, 1.34, 1.78],  // 1.51@1.62 — the old single 2.10->1.36 plane read 0.12-0.20 LOW), nose
    [-0.85, 1.95, 1.05], [-0.48, 1.95, 1.05], [-0.48, 1.475, 1.66], [-0.85, 1.475, 1.66]));  // landing buried under the glacis-A plate
  // RIGHT side: the gate front comb is POSTS at +0.30/+0.51/+0.77 with the
  // 1.49 valley floor between them (no solid group, no right wedge)
  P.add('hull', box(0.58, 0.24, 0.72), 0.55, 1.57, -0.04);                     // low right chest (top 1.49)
  for (const [px, pt] of [[0.30, 2.11], [0.51, 2.10], [0.77, 2.09]]) {
    P.add('hull', box(0.10, pt - 1.49, 0.14), px, (pt + 1.49) / 2, 0.10);      // right comb posts
  }
  P.add('hullDark', box(0.50, 0.02, 0.50), -0.565, 2.145, 0.02);               // left group lids
  // CENTER driver valley (gate front: 1.51-1.79 between the groups): plate,
  // flush hatch, episcope row, small center pod
  P.add('hull', box(0.76, 0.045, 1.66), -0.11, 1.485, 0.52);                   // driver plate 1.51 (x -0.49..+0.27)
  P.add('hullDark', box(0.40, 0.012, 0.44), -0.11, 1.514, 0.62);               // hatch seam
  for (let k = -1; k <= 1; k++) periscope(P, 'hullDetail', -0.11 + k * 0.15, 1.53, 1.06, k * 0.08);
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
    P.add('hullDark', box(0.018, 0.02, 2.07), s * 1.527, 1.50, 0.585);         // s5322-C6 fender shadow line under the sponson crest (outer face flush w/ the 1.536 wall — the 1.5535 seat nicked the front-view corner, measured + pulled in)
  }
  stowage(P, 'hullCloth', rng, [[-1.25, 1.53, -2.62, 0.42, 0.10, 0.72]]);
  {
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 4, width: 0.44, seed: 7 });
    links.position.set(0.98, 1.525 + BODY_RIDE_LIFT, -2.62);
    P.hullG.add(links);
  }
  // ---- skirts (plan: heavy applique run z -0.41..+3.09 ONLY; stations rear
  // 3.04-3.07 = no wide rear skirt. WIDTH GUARD: max |x| = 1.80) -------------
  const skirtRear = c2 ? -2.92 : -0.41;                                        // C2 package: full-run heavy skirts (photo-class)
  for (const s of [-1, 1]) {
    const skirtBucket = s < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR';
    const skirtDarkBucket = s < 0 ? 'hullTrackTrimL' : 'hullTrackTrimR';
    P.add(skirtBucket, box(0.03, 0.59, 5.82), s * 1.665, 0.835, -0.01);        // base thin skirt re-wrapped just outside the wider native course
    // s5322-C1 real C1 SEVEN-section front-half skirt run (owner MBT order;
    // c2 keeps its 13-panel AMV run) + per-panel hinge/bolt hardware both
    // marks. 0.50 pitch < the 0.54 station slab (edge-on prism law holds);
    // every new read stays inside the ±1.80 WIDTH GUARD (max 1.799).
    const panels = c2 ? 13 : 7;
    const z0 = 3.09, panelD = (3.09 - skirtRear) / panels;
    // C2's visual ERA owns the outer 40 mm of the 1.80 m half-width. Pull
    // its carrier plates inboard so the cassettes finish exactly on the
    // published width plane instead of floating beyond the side armor.
    const panelCenterX = c2 ? 1.7425 : 1.780;
    const panelCarrierX = c2 ? 1.760 : 1.7975;
    for (let k = 0; k < panels; k++) {
      const zc = z0 - panelD * (k + 0.5);
      P.add(skirtBucket, box(0.035, 0.68, panelD - 0.025), s * panelCenterX, 0.94, zc); // heavy applique carrier, physically joined to the hanger rail
      P.add(skirtDarkBucket, box(0.012, 0.60, 0.02), s * (panelCarrierX - 0.008), 0.94, zc - panelD / 2 + 0.012); // panel seams stay on the carrier face
      P.add(skirtDarkBucket, box(0.004, 0.026, 0.026), s * (panelCarrierX - 0.001), 1.09, zc - panelD * 0.22);
      P.add(skirtDarkBucket, box(0.004, 0.026, 0.026), s * (panelCarrierX - 0.001), 0.79, zc + panelD * 0.22);
      if (k > 0) P.add(skirtBucket, box(0.03, 0.14, 0.07), s * (panelCenterX + 0.004), 1.245, zc + panelD / 2 - 0.0125); // hinge straps rail->panel at every interior seam
      if (c2) {
        for (const y of [0.79, 1.09]) {
          const face = {
            point: new THREE.Vector3(s * panelCarrierX, y, zc),
            normal: new THREE.Vector3(s, 0, 0),
            dv: new THREE.Vector3(0, 0, 1),
          };
          faceSeatedArmorCassette(P, 'hull', face, face.dv,
            0.275, 0.040, panelD - 0.055, C2_ERA_EMBED_M);
          if (c2EraReceipt) c2EraReceipt.sideSkirtCassettes += 1;
        }
      }
    }
    P.add(skirtBucket, box(0.045, 0.56, 0.42), s * 1.7775, 0.92, 2.86);        // widthM edge strip, outer face EXACTLY ±1.80 (WIDTH GUARD)
    P.add(skirtBucket, box(0.14, 0.10, 3.09 - skirtRear), s * 1.72, 1.315, (3.09 + skirtRear) / 2); // hanger rail tying panels to the sponson
    // front mudguards (plan ±1.545..1.795 -> z 3.005..3.093; front-view
    // crest 1.33, outer droop 1.22)
    P.add(skirtBucket, box(0.14, 0.10, 0.46), s * 1.72, 1.275, 2.86);
    P.add(skirtBucket, box(0.055, 0.26, 0.46), s * 1.7725, 1.19, 2.86);
    P.add(skirtBucket, box(0.14, 0.05, 0.10), s * 1.72, 1.10, 3.10);
  }
  // ---- running gear: SEVEN wheels, gate-ref stations (contact [-2.44,
  // +2.52]; ramp 0.30@-2.92 / 0.66@-3.29 / 0.87@-3.67; front wrap crest
  // 0.81-0.89 @ +3.49..+3.63) -------------------------------------------------
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.38, wheelW: 0.31, wheelY: 0.53, xc: 1.30,
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
    dishR: 0.82, tireHex: 0x242522, wheelHex: 0x3d4433,
  });
  P.hullG.userData.arieteRunningGearReceipt = Object.freeze({
    roadWheelRadiusM: 0.38,
    roadWheelStations: 7,
    rearSprocketRadiusM: 0.25,
    rearSprocketOriginalRadiusM: 0.37,
    rearSprocketRadiusRatio: 0.25 / 0.37,
    rearSprocketCenterYM: 0.84,
    rearTrackContactZM: -2.50,
    linkedCourseAdjusted: true,
  });
  liftEye(P, 'hullDetail', -1.40, 1.52, -1.60);
  liftEye(P, 'hullDetail', 1.40, 1.52, -1.60);
  P.decal('hull', 'number', c2 ? 'EI 135' : 'EI 121', 0.24,
    [-0.80, 1.29 + BODY_RIDE_LIFT, 2.72], 0, -0.16);

  // ---- turret ---------------------------------------------------------------
  // main shell loft: front plate behind the mantlet at +1.30, cheek corner
  // (±1.17,+1.28), walls ±1.24..1.28, to the bustle break at -1.12
  const ARIETE_SHELL = [
    [-0.42, L(1.30)], [0.42, L(1.30)], [1.17, L(1.28)],
    [1.24, L(0.04)], [1.28, L(-0.42)], [1.28, L(-0.92)], [1.14, L(-1.12)],
    [-1.14, L(-1.12)], [-1.28, L(-0.92)], [-1.28, L(-0.42)], [-1.24, L(0.04)],
    [-1.17, L(1.28)],
  ];
  P.add('turret', KIT.polyMultiLoft(ARIETE_SHELL, [
    { height: 0.03, inset: 1.0 },
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
    P.add('turret', slab(                                                      // upper cheek: ridge sweeping (±0.20,+2.10) -> wall corner (±1.17,+1.28)
      [s * 0.20, 0.14, L(2.06)], [s * 1.08, 0.20, L(1.70)], [s * 1.17, 0.20, L(1.26)], [s * 0.20, 0.14, L(1.28)],
      [s * 0.20, 0.64, L(1.62)], [s * 1.08, 0.62, L(1.42)], [s * 1.17, 0.70, L(1.24)], [s * 0.20, 0.72, L(1.26)]));
    P.add('turret', slab(                                                      // lower cheek chin: raked underside 1.44@+1.30 -> 1.56@+2.02
      [s * 0.20, 0.14, L(2.02)], [s * 0.96, 0.16, L(1.66)], [s * 1.10, 0.14, L(1.30)], [s * 0.20, 0.14, L(1.30)],
      [s * 0.20, 0.30, L(2.04)], [s * 0.98, 0.32, L(1.68)], [s * 1.14, 0.30, L(1.31)], [s * 0.20, 0.30, L(1.31)]));
    // s5322-B3 cheek LIFTING LUGS on the §5.299 raked faces (owner MBT
    // order; leaned D-rings + seat plates, tops flush with the certified
    // climbing face line 1.99-2.005 — zero silhouette).
    P.add('turret', box(0.06, 0.016, 0.05), s * 0.55, 0.648, L(1.50), -0.22, 0, 0);
    P.add('turretDetail', torus(0.034, 0.010, 10), s * 0.55, 0.652, L(1.50), 1.05, 0, s * 0.35);
    P.add('turret', box(0.06, 0.016, 0.05), s * 0.85, 0.652, L(1.38), -0.22, 0, 0);
    P.add('turretDetail', torus(0.034, 0.010, 10), s * 0.85, 0.657, L(1.38), 1.05, 0, s * 0.35);
  }
  P.add('turret', box(0.84, 0.52, 0.30), 0, 0.38, L(1.42));                    // mantlet cavity back wall (closes the nose between cheeks)
  for (const s2 of [-1, 1]) P.add('turret', slab(                              // cavity side cheeks to the mantlet flanks (no see-through at yaw)
    [s2 * 0.375, 0.16, L(1.56)], [s2 * 0.42, 0.16, L(1.56)], [s2 * 0.42, 0.16, L(1.30)], [s2 * 0.375, 0.16, L(1.30)],
    [s2 * 0.375, 0.62, L(1.52)], [s2 * 0.42, 0.62, L(1.52)], [s2 * 0.42, 0.64, L(1.28)], [s2 * 0.375, 0.64, L(1.28)]));
  // ring skirt chin: gate ref bottoms dip 1.21-1.26 @ +0.30..+0.72
  P.add('turret', box(1.60, 0.14, 0.46), 0, -0.025, L(0.51));
  // bustle: roof continues the 2.16 line to -1.69, underside 1.40
  const ARIETE_BUSTLE = [
    [-1.13, L(-1.02)], [1.13, L(-1.02)], [1.13, L(-1.69)], [-1.13, L(-1.69)],
  ];
  P.add('turret', KIT.polyMultiLoft(ARIETE_BUSTLE, [
    { height: 0.02, inset: 1.0 },
    { height: 0.70, inset: 0.995 },
    { height: 0.76, inset: 0.93 },
  ]), 0, 0.10, 0);
  // rear baskets: tops 2.03 -> 1.98, bottoms 1.43, center bay to -2.44
  // (§K.4 real rack: frames + mesh floor + fill, no marker-only census)
  P.add('turret', box(2.10, 0.055, 0.68), 0, 0.70, L(-2.03));                  // basket top frame 2.00 (z -1.69..-2.37: the ref's -2.44 end pairs here
  P.add('turret', box(2.10, 0.05, 0.66), 0, 0.155, L(-2.03));                  // under the measured compression registration — packet-documented)
  for (const bx of [-1.02, -0.35, 0.35, 1.02]) {
    P.add('turret', box(0.05, 0.60, 0.52), bx, 0.43, L(-1.99));                // basket dividers
  }
  P.add('turretDark', openRackGrid(2.04, 0.44, 0.020, 5, 10),
    0, 0.42, L(-2.36), Math.PI / 2, 0, 0);                                     // open rear mesh face in the registered frame
  for (const [bx2, blen] of [[-0.70, 0.52], [0.02, 0.44], [0.72, 0.48]]) {
    P.add('turretDetail', KIT.xform(KIT.cylX(0.085, blen, 12), 0, 0, 0), bx2, 0.30, L(-1.99)); // strapped stores bottles in the bays (owner c425f495)
    P.add('turretDark', box(0.03, 0.18, 0.14), bx2 - blen * 0.28, 0.30, L(-1.99));
    P.add('turretDark', box(0.03, 0.18, 0.14), bx2 + blen * 0.28, 0.30, L(-1.99));
  }
  stowage(P, 'turretDetail', rng, [[-0.66, 0.50, L(-1.98), 0.52, 0.20, 0.42], [0.42, 0.48, L(-1.98), 0.62, 0.16, 0.40],
    [-0.05, 0.52, L(-2.02), 0.55, 0.18, 0.40], [0.80, 0.46, L(-1.98), 0.32, 0.14, 0.34]]);  // s5322-B2 bustle bays read as CARGO (owner MBT order; tops <= 1.91 world; right item CLAMPED inside the ±1.13 bustle plan — the 1.17 overflow cost plan_turret, measured + pulled in)
  for (const sx of [-0.66, -0.05, 0.42, 0.80]) {
    P.add('turretDark', box(0.022, 0.30, 0.014), sx, 0.45, L(-2.17));          // s5322-B2 cargo lash straps ON the bundle faces (inside the -2.37 plan boundary; the mesh-face seats poked it, measured + re-seated)
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
    P.add('turret', box(0.05, 0.07, 3.55), s * 1.50, 0.18, L(-0.805));         // side rack rail at 1.44..1.51 (gate front cols ±1.5 read 1.44-1.50;
    for (const rz of [0.90, 0.30, -0.44, -1.10, -1.76, -2.42]) {               // end caps stay out of the st1 slab — prism law)
      P.add('turret', box(0.045, 0.16, 0.06), s * 1.50, 0.24, L(rz));          // stanchions tying the rail to the bay lip
    }
    P.add('turret', box(0.05, 0.11, 0.04), s * 1.50, 0.155, L(-2.556));        // s5322-B1 rack-end cap plates (inside the certified envelope)
    P.add('turretDark', box(0.056, 0.05, 0.014), s * 1.50, 0.185, L(-2.572));  // cap end faces (dark hardware read)
    for (const az of [-0.50, -1.44, -2.10]) {
      P.add('turret', box(0.29, 0.06, 0.05), s * 1.355, 0.34, L(az));          // rack arms overlap the shell/panel and the outer rail
    }
    // Owner-marked panel re-seat. Its old inner face sat at |x|=1.40 while
    // the turret/bustle carrier is |x|≈1.13, leaving 27 cm of daylight. The
    // new 115 mm cassette overlaps that carrier by 15 mm and remains wholly
    // turret-local. An aft bridge returns the cantilever into the rear basket
    // frame, while the three rack arms tie its outer face to the rail.
    P.add('turret', slab(
      [s * 1.115, 0.15, L(-1.20)], [s * 1.235, 0.15, L(-1.20)], [s * 1.235, 0.15, L(-2.55)], [s * 1.115, 0.15, L(-2.55)],
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
  P.add('turret', box(0.40, 0.13, 0.38), 0.76, 0.925, L(0.22));                // TURMS plinth
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
  cupolaRing(P, 0.45, 0.86, L(-0.42), 0.24);                                   // commander hatch ring
  P.add('turret', box(0.36, 0.022, 0.32), 0.45, 0.925, L(-0.42), 0, -0.08, 0); // split lid (owner c425f495 crew-station cadence)
  // s5322-A2 commander's MG 42/59 at the TURMS-station cupola (owner MBT
  // order; real C1 carries one) — CENSUS pintleMG on the ring's FRONT-right
  // rim, stowed forward alongside the TURMS housing so the entire mass nests
  // UNDER the certified side silhouette (pano 2.47 covers z −0.32..0.00,
  // TURMS 2.46 covers +0.06..+0.38; MG top 2.395 world). Two aft/hatch-band
  // sweeps measured −0.2 whole each under the documented dAlong 0.739
  // registration residual — receipts banked, this seat is the measured
  // dims-100 + curve-neutral exchange (§5.265/§5.290).
  if (!c2) {
    const commanderMg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone',
      elev: 0, shield: false, scale: 0.62, seed: 44 });
    commanderMg.name = 'arieteC1CommanderMg';
    addFitting(P, 'turret', commanderMg, 0.68, 0.87, L(-0.24), [0, 0.35, 0]);
  }
  cupolaRing(P, -0.42, 0.86, L(-0.62), 0.23);                                  // loader hatch ring
  P.add('turret', box(0.34, 0.022, 0.30), -0.42, 0.925, L(-0.62), 0, 0.10, 0);
  for (let k = 0; k < 3; k++) periscope(P, 'turretDetail', 0.30 + k * 0.16, 0.90, L(-0.10), 0.1);
  for (const [px, pz, yw] of [[-0.60, -0.28, 0.14], [-0.22, -0.30, -0.06], [0.14, -0.62, 0.08]]) {
    periscope(P, 'turretDetail', px, 0.895, L(pz), yw);                        // commander/loader periscope arcs (owner cadence)
  }
  // welded roof panel cadence (owner c425f495: flat dark fields + fastener
  // strips — zero silhouette)
  for (const [px, pz, w, dd] of [[-0.68, -1.30, 0.46, 0.40], [0.02, -1.34, 0.58, 0.42],
    [0.70, -1.28, 0.44, 0.40], [-0.55, -1.90, 0.54, 0.34], [0.14, -1.94, 0.60, 0.32]]) {
    P.add('turretDark', box(w, 0.02, dd), px, 0.875, L(pz));
    P.add('turretDetail', box(w * 0.8, 0.016, 0.026), px, 0.888, L(pz + dd * 0.38));
  }
  P.addEquipment('turret', box(0.30, 0.145, 0.26), 0.10, 0.93, L(0.30));                // gunner's aux sight hood (front_whole 2.31 @ x +0.14)
  // crosswind mast folded low on the rear roof (k2 height-law: no p95 spike)
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
  P.add('turretDark', cylY(0.035, 0.04, 0.09, 8), -0.87, 0.905, L(-0.885));    // left whip base drum, rod stowed
  // s5322-B8 antenna BASES realized: AB-armored feed boxes + cable loops at
  // both whip stations (tops nest under the certified 2.25 base-drum column).
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.05, 0.05, 0.07), s * 0.795, 0.895, L(-0.90));    // tuner feed box inboard of the pot
    P.add('turretDetail', torus(0.030, 0.008, 8), s * 0.76, 0.856, L(-0.90));  // coiled cable service loop nested under the base-drum column
  }
  // mantlet: protruding central block + backward-raked wedge cheeks + coax
  // (gate ref band 1.55..1.86 over +1.7..+2.12 zW)
  P.addGunExtra(box(0.75, 0.33, 0.44), 0, 0.045, 0.95);                        // central mantlet block 1.53..1.86 (world z 1.68..2.12)
  P.addGunExtra(box(0.52, 0.40, 0.34), 0, 0.02, 0.62);                         // collar shroud closing the cavity behind the block (§5.18 no-air)
  P.addGunExtra(cylZ(0.165, 0.30, 14, 0.14), 0, 0, 1.22);                      // gun collar lead
  // s5322-A1 coax MG 42/59 — REAL aperture (owner MBT order): armored collar
  // ring at the block face + recessed dark throat + 5cm stub barrel w/
  // booster cap. Protrusion budget measured twice (0.30-proud rod −0.67
  // plan_turret, 0.16-proud −0.38 — both pulled back per §5.290): the port
  // now reads via the collar/tone with ≤0.06 proud of the face, sub-column
  // beside the bare ref tube. Gun-bucketed so the coax ELEVATES with the
  // 120mm (§B5/§B3.1).
  P.addGunExtra(cylZ(0.050, 0.055, 10), 0.28, 0.07, 1.145);                    // aperture collar at the block face
  P.addGunExtraDark(cylZ(0.034, 0.09, 8), 0.28, 0.07, 1.135);                  // port throat (recessed dark)
  P.addGunExtraDark(cylZ(0.014, 0.04, 8), 0.28, 0.07, 1.185);                  // MG 42/59 stub muzzle
  P.addGunExtraDark(cylZ(0.019, 0.025, 8), 0.28, 0.07, 1.215);                 // booster cap
  for (const s of [-1, 1]) {
    P.add('turret', slab(                                                      // raked mantlet wedge cheeks (turret-fixed) — tops pulled back with the
      [s * 0.375, 0.26, L(2.00)], [s * 0.55, 0.26, L(1.76)], [s * 0.55, 0.26, L(1.58)], [s * 0.375, 0.26, L(1.70)],  // §5.299 cheek rake (33°) so the wedges hug
      [s * 0.375, 0.57, L(1.80)], [s * 0.55, 0.54, L(1.58)], [s * 0.55, 0.54, L(1.54)], [s * 0.375, 0.58, L(1.64)]));  // the new face; rear contacts byte-held
  }
  liftEye(P, 'turretDetail', -1.05, 0.90, L(0.60), 0.3);
  liftEye(P, 'turretDetail', 1.05, 0.90, L(0.60), -0.3);

  if (c2) {
    // ---- C2/AMV upgrade package (photo-class; print is C1-only here) -------
    for (const s of [-1, 1]) {
      const cheekBottom: Quad = [
        [s * 0.40, 0.16, L(2.04)], [s * 1.10, 0.24, L(1.72)],
        [s * 1.18, 0.22, L(1.30)], [s * 0.42, 0.16, L(1.58)],
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
      for (const u of [0.10, 0.30, 0.50, 0.70, 0.90]) for (const v of [0.27, 0.73]) {
        const face = sampleArmorFace(...cheekFrontFace, u, v, [s, 1, 1]);
        faceSeatedArmorCassette(P, 'turret', face, face.dv,
          0.13, 0.055, 0.20, C2_ERA_EMBED_M);
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
        for (const yOffset of [-0.22, 0.22]) for (const zOffset of [-0.24, 0.24]) {
          const face = {
            point: new THREE.Vector3(s * 1.46,
              carrier.y + carrier.h * yOffset,
              carrier.z + carrier.d * zOffset),
            normal: new THREE.Vector3(s, 0, 0),
            dv: new THREE.Vector3(0, 0, 1),
          };
          faceSeatedArmorCassette(P, 'turret', face, face.dv,
            carrier.h * 0.34, 0.055, carrier.d * 0.37, C2_ERA_EMBED_M);
          if (c2EraReceipt) c2EraReceipt.turretSideCassettes += 1;
        }
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
      for (const [i, py, prx] of [[0, 1.364, -0.064], [1, 1.345, -0.10], [2, 1.315, -0.10]]) {
        P.add('hull', box(0.44, 0.09, 0.52), s * (0.28 + i * 0.47), py, 2.30 + i * 0.30, prx, 0, 0); // glacis add-on rows re-seated ON the §5.299 raked plane
      }
    }
    P.addEquipment('turret', box(0.30, 0.15, 0.30), -0.76, 1.295, L(-0.16));            // new commander sight housing over the pano
    P.add('turretGlass', box(0.18, 0.08, 0.02), -0.76, 1.32, L(-0.005));
    P.add('hull', box(0.26, 0.10, 0.16), 0.0, 1.72, 0.90);                     // driver thermal camera pod on the fairing
    P.add('hullGlass', box(0.16, 0.05, 0.02), 0.0, 1.73, 0.985);
    P.add('turret', box(0.44, 0.34, 0.60), -1.14, localY(1.70), L(-1.35));     // yawing APU/shoulder box, zero-yaw world seat retained
    P.add('turretDark', box(0.38, 0.26, 0.02), -1.14, localY(1.68), L(-1.04));
    stowage(P, 'turretDetail', rng, [[0.62, 0.76, L(-2.06), 0.48, 0.18, 0.24]]);
    addFitting(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 1.05, r: 0.02, rake: 0, seed: 52 }),
      -0.87, 0.86, L(-0.885));                                                 // second whip rigged on the C2 fit
    // T-90-style automated weapon tower on the right roof.  The low race is
    // the only structural part; pedestal, yoke, shields and gun remain
    // equipment so they cannot inflate the turret armor receipt.
    const rwsX = 0.54, rwsZ = L(-0.57);
    P.addCupola('turret', cylY(0.18, 0.21, 0.10, 16), rwsX, 0.94, rwsZ);
    P.addEquipment('turret', box(0.30, 0.20, 0.28), rwsX, 1.07, rwsZ);
    P.addEquipment('turret', box(0.06, 0.22, 0.24), rwsX - 0.18, 1.20, rwsZ + 0.03, 0, 0, -0.08);
    P.addEquipment('turret', box(0.06, 0.22, 0.24), rwsX + 0.18, 1.20, rwsZ + 0.03, 0, 0, 0.08);
    P.addEquipment('turret', box(0.17, 0.18, 0.17), rwsX + 0.25, 1.09, rwsZ + 0.14);
    P.add('turretGlass', box(0.11, 0.10, 0.014), rwsX + 0.25, 1.10, rwsZ + 0.232);
    const remoteRws = FITTINGS.pintleMG({ mats: P.mats, cls: 'nsvt', tone: 'two-tone',
      elev: -0.04, ammo: true, shield: true, scale: 0.88, seed: 46 });
    remoteRws.name = 'arieteC2RemoteRws';
    remoteRws.userData.remoteControlled = true;
    addFitting(P, 'turret', remoteRws, rwsX, 1.17, rwsZ + 0.02, [0, 0.08, 0]);
    P.decal('turret', 'number', 'C2 01', 0.24, [-1.29, 0.40, L(-0.55)], -Math.PI / 2, 0, -0.02);
  } else {
    const loaderMg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone',
      elev: 0, shield: false, scale: 0.62, seed: 45 });
    loaderMg.name = 'arieteC1LoaderMg';
    addFitting(P, 'turret', loaderMg, -0.42, 0.87, L(-0.60), [0, 2.9, 0]);
    P.decal('turret', 'number', 'C1 32', 0.24, [-1.29, 0.40, L(-0.55)], -Math.PI / 2, 0, -0.02);
  }
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
  if (c2 && c2EraReceipt) {
    c2EraReceipt.totalTurretCassettes = c2EraReceipt.turretCheekCassettes
      + c2EraReceipt.turretSideCassettes + c2EraReceipt.turretBustleCassettes;
    c2EraReceipt.totalCassettes = c2EraReceipt.totalTurretCassettes
      + c2EraReceipt.sideSkirtCassettes;
    P.turretG.userData.arieteC2EraReceipt = Object.freeze(c2EraReceipt);
  }
  P.turretG.userData.arieteEquipmentReceipt = Object.freeze(c2 ? {
    roofWeaponStations: 1,
    remoteWeapon: 'nsvt',
    remoteControlled: true,
    remoteWeaponSide: 'right',
    armoredTower: true,
    rotatingShoulderModules: 4,
    rotatingApuAssembly: true,
  } : {
    roofWeaponStations: 2,
    manualPintles: 2,
    remoteControlled: false,
    rotatingShoulderModules: 0,
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

  // Owner scale pass: bake the full C1/C2 family into a genuinely 10%
  // larger authored frame. Geometry buckets, direct smart-running-gear and
  // fitting children, decals, pivots, muzzle/top anchors, and collision
  // metadata all move together; the articulation rigs themselves stay at
  // identity scale so downstream anatomy and metrology see actual metres.
  const scale = 1.10;
  P.scaleAllBuckets(scale);
  P.scaleDecals(scale);
  for (const child of [...P.hullG.children]) {
    child.position.multiplyScalar(scale);
    child.scale.multiplyScalar(scale);
  }
  for (const child of [...P.turretG.children]) {
    if (child === P.gunG) continue;
    child.position.multiplyScalar(scale);
    child.scale.multiplyScalar(scale);
  }
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
  P.topY = (2.55 + BODY_RIDE_LIFT) * scale;
  const scaleReceipt = Object.freeze({
    uniformScale: scale,
    bakedGeometry: true,
    armorFrameScaled: true,
    turretPivotScaled: true,
    trackContactMetadataScaled: true,
    trackHitGeometryScaled: true,
  });
  P.hullG.userData.arieteFamilyScaleReceipt = scaleReceipt;
  P.turretG.userData.arieteFamilyScaleReceipt = scaleReceipt;
}

function buildArieteC1(P: ItalyBuilderPort): void { buildArieteMk(P, 'c1'); }
function buildArieteC2(P: ItalyBuilderPort): void { buildArieteMk(P, 'c2'); }

// ---------------------------------------------------------------------------
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
function buildCarro45T(P: ItalyBuilderPort): void {
  const { box, cylY, cylZ, torus, frustum, polyMultiLoft, buildGun,
    buildRunningGear, headlight, periscope, liftEye, towCable, stowage } = KIT;
  const slab = orientedSlab;
  const { rng } = P;

  // ---- hull tub + decks -----------------------------------------------------
  P.add('hull', box(1.90, 0.85, 5.60), 0, 0.915, 0.10);                        // tub core x ±0.95 (the 1.02 inner band plane owns the lane)
  P.add('hull', box(2.80, 0.09, 5.60), 0, 1.375, 0.10);                        // sponson floors x ±1.40 ABOVE the animated sweep envelope (track top + bump travel)
  P.add('hull', box(2.80, 0.05, 4.45), 0, 1.471, -0.025);                      // main deck 1.496 (z -2.25..+2.20 — gate ref hull runs FLAT to the glacis knee; the raised crest is TURRET material in the print)
  for (const s of [-1, 1]) P.add('hull', box(0.035, 1.03, 5.60), s * 0.965, 0.835, 0.10); // inner sponson walls (front_hull bot 0.324 @ ±0.95-0.98)
  P.add('hull', box(2.80, 0.06, 0.34), 0, 1.526, -3.15);                       // rear deck 1.556 (z -3.32..-2.98)
  P.add('hull', box(2.80, 0.05, 0.19), 0, 1.518, -2.885);                      // step 1.543
  P.add('hull', box(2.80, 0.05, 0.28), 0, 1.484, -2.53);                       // step 1.509
  P.add('hull', box(2.80, 0.045, 0.14), 0, 1.474, -2.32);                      // step to the main deck
  // engine deck dressing: grille fields + fuel caps (§B3.2 density)
  P.add('hullDark', box(2.10, 0.012, 0.78), 0, 1.53, -2.72);
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(2.04, 0.014, 0.05), 0, 1.537, -2.44 - k * 0.115);
  P.add('hullDark', box(1.90, 0.012, 0.62), 0, 1.505, -1.70);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.84, 0.013, 0.05), 0, 1.512, -1.50 - k * 0.13);
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.09, 0.09, 0.025, 12), s * 1.05, 1.508, -1.32);
  // ---- stern (tail 1.42-1.45 @ -3.42..-3.48, raked plate; plan rear center
  // -3.42..-3.49) -------------------------------------------------------------
  P.add('hull', slab(                                                          // raked tail plate center (the shoe lane owns |x| 1.02..1.58 below 1.26)
    [-0.95, 0.65, -3.24], [0.95, 0.65, -3.24], [0.95, 0.95, -3.385], [-0.95, 0.95, -3.385],
    [-0.95, 1.45, -3.29], [0.95, 1.45, -3.29], [0.95, 1.45, -3.36], [-0.95, 1.45, -3.36]));
  for (const s2 of [-1, 1]) P.add('hull', slab(                                // tail plate outer courses ABOVE the band top
    [s2 * 0.94, 1.26, -3.26], [s2 * 1.38, 1.26, -3.26], [s2 * 1.38, 1.26, -3.34], [s2 * 0.94, 1.26, -3.36],
    [s2 * 0.94, 1.45, -3.29], [s2 * 1.38, 1.45, -3.29], [s2 * 1.38, 1.45, -3.34], [s2 * 0.94, 1.45, -3.36]));
  P.add('hull', box(1.90, 0.62, 0.11), 0, 1.02, -3.405);                       // center exhaust recess block (ref plan -3.40..-3.46 across |x|<0.95)
  P.add('hullDark', box(1.82, 0.50, 0.02), 0, 1.02, -3.455);
  P.add('hull', box(2.76, 0.30, 0.10), 0, 1.30, -3.38);                        // upper rear plate band
  P.add('hullDark', box(1.70, 0.34, 0.035), 0, 1.06, -3.40);                   // rear louvre grille
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(1.66, 0.026, 0.04), 0, 0.93 + k * 0.10, -3.415);
  for (const s of [-1, 1]) {
    P.add('hullDark', box(0.12, 0.07, 0.04), s * 1.15, 1.38, -3.395);          // taillights (seated on the -3.385 plate)
    P.add('hullDetail', torus(0.07, 0.014, 10), s * 0.62, 0.94, -3.36, Math.PI / 2, 0, 0); // tow eyes (bottom at the ref's 0.83 tail band)
    P.add('hull', box(0.045, 0.42, 0.60), s * 1.6925, 1.13, -2.95);            // final-drive outer caps OUTSIDE the shoe faces (1.583+0.08 radial pads; front cols ±1.66 read bottom 0.90)
  }
  P.add('hull', box(0.36, 0.16, 0.10), 0, 1.38, -3.42);                        // convoy shield block (band-thin: the tail body edge stays pinned at -3.385)
  // ---- glacis + bow ((2.20,1.47)->(3.10,1.24)->nose 1.03@3.43; chin
  // 0.49@2.80 -> 0.95@3.43; final-drive noses to +3.52) -----------------------
  P.add('hull', frustum(1.40, 3.10, 2.20, 1.40, 2.24, 2.20, 1.24, 1.468));     // upper glacis plane
  P.add('hull', frustum(1.40, 3.37, 3.06, 1.40, 3.08, 3.06, 1.06, 1.25));     // nose wedge to +3.37 (ref PLAN center front 3.31-3.36; the pods own 3.487)
  P.add('hull', slab(                                                          // bow chin (tip band stays sub-threshold for the hull-row frame pin;
    [-0.95, 0.49, 2.70], [0.95, 0.49, 2.70], [0.94, 0.96, 3.47], [-0.94, 0.96, 3.47],   // x ±0.95 clear of the idler wrap)
    [-0.95, 1.26, 2.70], [0.95, 1.26, 2.70], [0.94, 1.02, 3.47], [-0.94, 1.02, 3.47]));
  for (const s2 of [-1, 1]) {
    P.add('hull', slab(                                                        // outboard chin shoulders ABOVE the wrap+shoe crown (flat run)
      [s2 * 0.96, 1.27, 2.70], [s2 * 1.38, 1.27, 2.70], [s2 * 1.34, 1.27, 3.05], [s2 * 0.95, 1.27, 3.05],
      [s2 * 0.96, 1.33, 2.70], [s2 * 1.38, 1.33, 2.70], [s2 * 1.34, 1.30, 3.05], [s2 * 0.95, 1.30, 3.05]));
    P.add('hull', slab(                                                        // shoulder tips tapering to the ref's 1.10 nose line (past the wrap)
      [s2 * 0.95, 1.25, 3.05], [s2 * 1.34, 1.25, 3.05], [s2 * 1.30, 1.08, 3.30], [s2 * 0.94, 1.08, 3.30],
      [s2 * 0.95, 1.28, 3.05], [s2 * 1.34, 1.28, 3.05], [s2 * 1.30, 1.14, 3.30], [s2 * 0.94, 1.14, 3.30]));
  }
  for (const s of [-1, 1]) {
    P.add('hull', box(0.34, 0.40, 0.25), s * 0.80, 1.00, 3.175);               // final-drive noses (FRAME LOCK: bow body edge PINNED at +3.30 — the
    P.add('hull', box(0.22, 0.18, 0.30), s * 0.80, 1.01, 3.34);                // 0.48 band ends there and everything beyond stays sub-threshold);
    P.add('hullDark', box(0.10, 0.10, 0.04), s * 0.80, 1.00, 3.475);           // pod tips carry the ref's 3.487 plan corners (thin: side band stays sub)
    headlight(P, s * 0.35, 1.38, 3.04, -0.22, 0.052);                          // headlight pods (side 1.415@2.96-3.08, plan 3.36@±0.33..0.37)
    P.add('hull', slab(                                                        // bow corner closure wedges (inside the 1.017 lane plane, bottoms riding
      [s * 0.95, 0.30, 2.70], [s * 0.985, 0.30, 2.70], [s * 0.985, 1.00, 3.42], [s * 0.95, 1.00, 3.42],  // the ramp line so the side view keeps the print's ramp)
      [s * 0.95, 1.26, 2.70], [s * 0.985, 1.26, 2.70], [s * 0.985, 1.06, 3.42], [s * 0.95, 1.06, 3.42]));
    P.add('hullDetail', torus(0.075, 0.015, 10), s * 0.55, 0.92, 3.38, Math.PI / 2, 0, 0); // bow tow eyes at the ref's 0.91 bow-band line
  }
  addFitting(P, 'hull', FITTINGS.towCable({ mats: P.mats, seed: 71,
    pts: [[-1.02, -0.04, 0.13], [0, 0.08, -0.14], [1.02, -0.04, 0.13]] }),
    0, 1.36, 2.42);                                                            // draped tow cable (print bumps 1.52 @ 2.49-2.62)
  P.decal('hull', 'number', '45T', 0.26, [-0.72, 1.345, 2.62], 0, -0.255);
  // ---- fenders + side aprons (front_hull: fender band ±1.40..1.71 tops
  // 1.50-1.53, outer droop 1.40; aprons ±1.62..1.71 down to 0.90; stations
  // w 3.42 the whole run) -----------------------------------------------------
  for (const s of [-1, 1]) {
    for (let k = 0; k < 14; k++) {                                             // fender plane + hem + apron in 0.46 m bays (edge-on prism law:
      const bz = -3.345 + 0.4596 * k + 0.2298;                                 // every 0.50 station slab contains a real end face); the run ENDS at
      const fy = k >= 13 ? 1.40 : k >= 12 ? 1.475                              // +3.09 like the print's fender line (plan front 3.005-3.093), TAPERING
        : (k >= 2 && k <= 10) ? 1.464 : 1.512;                                 // toward the bow; bays inside the turret swing ride at 1.48 (k2 sweep law)
      P.add('hull', box(0.27, 0.032, 0.4476), s * 1.545, fy, bz);              // toward the bow (gate tops 1.38-1.42 over the nose)
      P.add('hull', box(0.035, 0.045, 0.4476), s * 1.6975, fy - 0.087, bz);    // outer hem DROOPED (gate 1.43-1.45 @ ±1.70)
      if (bz > -3.16 && bz < 2.88) P.add('hull', box(0.03, 0.56, 0.4476), s * 1.695, 1.19, bz);
    }
    P.add('hull', box(0.045, 0.40, 0.40), s * 1.690, 1.15, 2.05);              // widthM strips, outer face ±1.7125 (pixel width 3.425 vs spec 3.43; guard;
    P.add('hull', box(0.045, 0.40, 0.40), s * 1.690, 1.15, -2.05);             // z inside the ref's ±1.74 plan front line)
    for (let k = 0; k < 7; k++) P.add('hullDark', box(0.034, 0.50, 0.016), s * 1.696, 1.19, 2.55 - k * 0.95); // apron seams
    P.add('hull', box(0.27, 0.05, 0.10), s * 1.545, 1.42, 3.13);              // mudguard tip stub (ref front edge 3.09-3.15)
    MUDGUARDS.add(P, {
      label: `italy-front-flap-${s}`, x: s * 1.695, y: 1.05, z: 3.31,
      thickness: 0.03, length: 0.06, height: 0.20, material: 'rubber',
      crown: 0.006, frontCut: 0.02,
    });                                                                        // front flap stubs outboard of the shoe lane
    P.add('hullDetail', box(0.04, 0.05, 0.24), s * 1.695, 1.145, 3.20);       // fender-to-flap hanger
    MUDGUARDS.add(P, {
      label: `italy-rear-flap-${s}`, x: s * 1.55, y: 1.02, z: -3.30,
      thickness: 0.03, length: 0.24, height: 0.28, material: 'rubber',
      rotation: [0, Math.PI / 2, 0], crown: 0.009, rearCut: 0.035,
    });                                                                        // rear flaps
    if (s > 0) {
      P.add('hullDetail', box(0.06, 0.03, 1.10), 1.50, 1.545, 2.62);           // crowbar on the bow fender (outside the turret swing circle)
      P.add('hullDetail', box(0.09, 0.04, 0.60), 1.52, 1.545, -2.45);          // shovel aft of the swing circle, clear of the st0/st1 windows
      const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.40, seed: 77 });
      links.position.set(1.05, 1.56, -2.45);                                   // spare links aft of the swing, clear of the st windows
      P.hullG.add(links);
    } else {
      P.add('hullDetail', box(0.07, 0.03, 0.90), -1.50, 1.545, 2.72);          // jack bar on the bow fender (outside the swing circle)
      P.add('hullDark', box(0.16, 0.05, 0.30), -1.52, 1.55, -2.45);            // jack block aft of the swing
    }
  }
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
  const L = (zWorld: number): number => zWorld + 0.30;
  const CARRO_SHELL = [
    [-0.50, L(1.81)], [-0.31, L(1.81)], [-0.30, L(1.55)], [0.30, L(1.55)],
    [0.31, L(1.81)], [0.50, L(1.81)], [1.50, L(0.64)], [1.51, L(0.40)],
    [1.55, L(-1.01)], [1.53, L(-1.44)], [1.50, L(-1.60)], [1.26, L(-1.74)],
    [-1.26, L(-1.74)], [-1.50, L(-1.60)], [-1.53, L(-1.44)], [-1.55, L(-1.01)],
    [-1.51, L(0.40)], [-1.50, L(0.64)],
  ];
  P.add('turret', polyMultiLoft(CARRO_SHELL, [
    { height: 0.03, inset: 1.0 },
    // mid ring: the wall OUTER top line (gate front: 1.60 @ ±1.54)
    { height: [0.27, 0.26, 0.25, 0.25, 0.26, 0.27, 0.11, 0.11, 0.10, 0.11, 0.14, 0.26, 0.26, 0.14, 0.11, 0.10, 0.11, 0.11], inset: 0.998 },
    // crown ring: steep inward cant — LEFT crown 2.33 @ ±1.14, RIGHT crown
    // 2.19 under the shelf rim, rear 2.16, nose 1.79-1.82
    { height: [0.31, 0.29, 0.28, 0.28, 0.29, 0.31, 0.68, 0.69, 0.69, 0.68, 0.67, 0.66, 0.66, 0.67, 0.82, 0.83, 0.83, 0.82],
      inset: [0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.80, 0.79, 0.77, 0.79, 0.81, 0.84, 0.84, 0.81, 0.75, 0.74, 0.74, 0.75] },
  ]));
  // bustle underplate: rear body rides 1.545-1.575 (side_turret bottoms)
  P.add('turret', polyMultiLoft([
    [-1.24, L(-1.00)], [1.24, L(-1.00)], [1.24, L(-1.72)], [-1.24, L(-1.72)],
  ], [
    { height: 0.02, inset: 1.0 },
    { height: 0.10, inset: 0.99 },
  ]), 0, 0.045, 0);
  // LEFT raised roof plateau 2.353 (x -1.14..+0.48) — extends aft to -1.40
  // (gate: 2.35@-1.40 before the rear slope)
  // The plateau used to be a shallow box resting above the shell's fan cap.
  // Give it a conforming armored seat whose upper ring overlaps that box by
  // 7.5 mm and whose lower ring sinks into the shell. This removes the dark
  // horizontal air seam without flattening either neighboring roof course.
  P.add('turret', slab(
    [-1.12, 0.64, L(-1.42)], [0.46, 0.64, L(-1.42)], [0.46, 0.61, L(-0.42)], [-1.12, 0.68, L(-0.42)],
    [-1.12, 0.785, L(-1.40)], [0.46, 0.785, L(-1.40)], [0.46, 0.785, L(-0.44)], [-1.12, 0.785, L(-0.44)]));
  P.add('turret', box(1.62, 0.075, 0.96), -0.33, 0.815, L(-0.92));            // plateau rear flat 2.353 (z -1.40..-0.44)
  P.add('turret', slab(                                                        // plateau front sloping 2.35@-0.44 -> 2.25@+0.99 (gate 2.283@+0.25)
    [-1.14, 0.70, L(-0.44)], [0.48, 0.70, L(-0.44)], [0.48, 0.64, L(0.99)], [-1.14, 0.64, L(0.99)],
    [-1.14, 0.85, L(-0.44)], [0.48, 0.85, L(-0.44)], [0.48, 0.75, L(0.99)], [-1.14, 0.75, L(0.99)]));
  // Cheek-aligned crown transition. The former single skewed patch tapered
  // only on vehicle-left, so its vehicle-right edge cut across the cheek
  // sweep instead of following it. Two joined courses now inherit the left
  // plateau and right closure heights independently, while their outer edges
  // converge symmetrically on the mantlet throat.
  P.add('turret', slab(                                                        // left crown course
    [-1.10, 0.62, L(0.99)], [0.44, 0.62, L(0.99)], [0, 0.52, L(1.70)], [-0.31, 0.52, L(1.70)],
    [-1.10, 0.71, L(0.97)], [0.44, 0.75, L(0.99)], [0, 0.62, L(1.72)], [-0.31, 0.62, L(1.72)]));
  P.add('turret', slab(                                                        // right crown course
    [0.44, 0.62, L(0.99)], [1.02, 0.53, L(0.99)], [0.31, 0.52, L(1.70)], [0, 0.52, L(1.70)],
    [0.44, 0.75, L(0.99)], [1.02, 0.63, L(0.99)], [0.31, 0.62, L(1.72)], [0, 0.62, L(1.72)]));
  // Paired crown-to-cheek joiners. Their outer vertices are the shell loft's
  // exact crown-ring stations, while the inner vertices overlap the two crown
  // courses by 5-10 mm. The former arrangement merely projected those courses
  // over the fan cap, leaving shadowed triangular slots at both shoulders.
  P.add('turret', slab(                                                        // vehicle-left crown shoulder
    [-0.49, 0.29, 2.045], [-0.30, 0.49, L(1.70)], [-1.105, 0.58, L(0.99)], [-1.135, 0.64, 0.78],
    [-0.48, 0.32, 2.03947], [-0.31, 0.625, L(1.72)], [-1.105, 0.715, L(0.975)], [-1.125, 0.825, 0.79167]));
  P.add('turret', slab(                                                        // vehicle-right crown shoulder
    [0.30, 0.49, L(1.70)], [0.49, 0.29, 2.045], [1.21, 0.58, 0.81], [1.015, 0.48, L(0.99)],
    [0.31, 0.625, L(1.72)], [0.48, 0.32, 2.03947], [1.20, 0.685, 0.82133], [1.025, 0.635, L(0.985)]));
  if (P.geometryReceipt) {
    P.turretG.userData.carro45tFitReceipt = Object.freeze({
      frontCrownJoiners: 2,
      crownCourseOverlapM: 0.01,
      rearPlateauSeat: true,
      rearPlateauOverlapM: 0.0075,
    });
  }
  P.add('turret', slab(                                                        // crest chin: closes the fairing underside to the shell nose (bottom
    [-0.31, 0.08, L(1.68)], [0.31, 0.08, L(1.68)], [0.28, 0.05, L(1.30)], [-0.28, 0.05, L(1.30)],  // rises like the ref's 1.58@+1.71 step)
    [-0.31, 0.52, L(1.70)], [0.31, 0.52, L(1.70)], [0.28, 0.30, L(1.32)], [-0.28, 0.30, L(1.32)]));
  P.add('turretDark', box(0.36, 0.014, 0.30), -0.16, 0.795, L(1.18));          // driver hatch seam on the nose (print: hatch rides the turret crest)
  for (let k = -1; k <= 1; k++) periscope(P, 'turretDetail', 0.16 * k, 0.73, L(1.52), k * 0.10);
  P.add('turret', slab(                                                        // rear slope 2.35@-1.40 -> 2.16@-2.24 (gate line; aft corners taper to
    [-1.10, 0.66, L(-1.38)], [0.44, 0.66, L(-1.38)], [0.40, 0.64, L(-2.20)], [-1.06, 0.64, L(-2.20)],  // the ref's narrower rear edge)
    [-1.10, 0.853, L(-1.40)], [0.44, 0.853, L(-1.40)], [0.40, 0.66, L(-2.22)], [-1.06, 0.66, L(-2.22)]));
  // Vehicle-right roof closure. The former 0.36 x 2.10 m horizontal shelf
  // started at x=1.215, leaving an open trough between it and the x=0.48
  // crown. From head-on it read as a floating plank over an unfinished roof.
  // These two structural courses continue the crown into the shell instead:
  // their inboard edges share the plateau heights, their outboard edges meet
  // the canted wall, and the fore course follows the roof's falling rake.
  P.add('turret', slab(                                                        // rear roof closure, z -1.40..-0.44
    [0.44, 0.66, L(-1.40)], [1.12, 0.61, L(-1.40)], [1.18, 0.61, L(-0.44)], [0.44, 0.66, L(-0.44)],
    [0.44, 0.853, L(-1.40)], [1.12, 0.70, L(-1.40)], [1.18, 0.70, L(-0.44)], [0.44, 0.853, L(-0.44)]));
  P.add('turret', slab(                                                        // fore roof closure, z -0.44..+0.99
    [0.44, 0.66, L(-0.44)], [1.18, 0.61, L(-0.44)], [1.02, 0.53, L(0.99)], [0.44, 0.58, L(0.99)],
    [0.48, 0.85, L(-0.44)], [1.18, 0.70, L(-0.44)], [1.02, 0.63, L(0.99)], [0.44, 0.75, L(0.99)]));
  // Compact commander's sight is seated through the new roof skin rather
  // than suspended under the retired shelf.
  P.addEquipment('turret', box(0.32, 0.14, 0.42), 0.94, 0.80, L(-0.35));
  P.add('turretGlass', box(0.026, 0.10, 0.28), 1.105, 0.80, L(-0.30));
  P.add('turretDark', box(0.28, 0.02, 0.36), 0.94, 0.875, L(-0.35));
  // cupola (x 0, z -0.78, top 2.421) + loader ring + periscopes
  P.add('turret', cylY(0.20, 0.28, 0.036, P.q ? 20 : 12), -0.01, 0.872, L(-0.78)); // cupola base cone (tapered: the station slab edge reads the low rim)
  P.add('turret', cylY(0.155, 0.195, 0.022, P.q ? 20 : 12), -0.01, 0.910, L(-0.78)); // dome step to 2.421
  P.add('turretDark', torus(0.175, 0.012, 18), -0.01, 0.898, L(-0.78));
  P.add('turret', box(0.22, 0.012, 0.20), -0.01, 0.912, L(-0.78), 0, 0.10, 0); // split hatch lid FLAT (owner cadence; inside the 2.42 cupola datum)
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    periscope(P, 'turretDetail', -0.01 + Math.sin(a) * 0.19, 0.875, L(-0.78) + Math.cos(a) * 0.19, a);
  }
  P.add('turret', cylY(0.205, 0.235, 0.040, P.q ? 20 : 12), -0.55, 0.805, L(0.10)); // loader hatch shoe buried into the sloping roof
  P.add('turret', cylY(0.180, 0.190, 0.022, P.q ? 20 : 12), -0.55, 0.838, L(0.10)); // shallow oval-read lid, still below the 2.42 m cupola datum
  P.add('turretDark', torus(0.205, 0.012, 16), -0.55, 0.835, L(0.10));
  P.add('turretDark', box(0.30, 0.014, 0.025), -0.55, 0.855, L(0.10), 0, -0.10, 0); // split-lid seam
  P.add('turret', box(0.06, 0.055, 0.10), -0.34, 0.815, L(0.10));              // seated hinge block
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4;
    periscope(P, 'turretDetail', -0.55 + Math.sin(a) * 0.22, 0.835,
      L(0.10) + Math.cos(a) * 0.22, a);
  }
  P.addEquipment('turret', box(0.22, 0.155, 0.20), 0.73, 0.775, L(0.70));               // gunner periscope hood (side 2.387 @ +0.73; ref top 2.38-2.39)
  P.add('turretGlass', box(0.14, 0.05, 0.02), 0.73, 0.83, L(0.805));
  // rear: underside closure + backed service wall (owner c425f495 cadence
  // absorbed onto the measured rear: plan rear -2.13 at |x|<=1.26, face
  // bottoms 1.57@-1.88 -> 1.64@-2.12)
  P.add('turret', slab(                                                        // bustle underside closure to the rear face
    [-1.24, 0.045, L(-1.70)], [1.24, 0.045, L(-1.70)], [1.20, 0.14, L(-2.12)], [-1.20, 0.14, L(-2.12)],
    [-1.24, 0.145, L(-1.70)], [1.24, 0.145, L(-1.70)], [1.20, 0.24, L(-2.12)], [-1.20, 0.24, L(-2.12)]));
  // Structural transition between the shell's raked rear and the vertical
  // bustle wall. This fills the 5-30 cm wedge that was previously open above
  // the underplate, without flattening the shell's rear armor angle.
  P.add('turret', slab(
    [-1.24, 0.24, L(-1.74)], [1.24, 0.24, L(-1.74)], [1.06, 0.66, L(-1.44)], [-1.06, 0.66, L(-1.44)],
    [-1.18, 0.24, L(-1.79)], [1.18, 0.24, L(-1.79)], [1.18, 0.60, L(-1.79)], [-1.18, 0.60, L(-1.79)]));
  P.add('turret', box(2.40, 0.40, 0.30), 0, 0.42, L(-1.94));                   // backed rear service wall (to -2.09; face pairs the print's -2.13..-2.24 read)
  P.add('turretDark', box(2.28, 0.30, 0.04), 0, 0.42, L(-2.10));               // rear louvre field
  for (let i = 0; i < 9; i++) P.add('turretDetail', box(0.028, 0.34, 0.05), -1.12 + i * 0.28, 0.42, L(-2.11)); // rib cadence (owner)
  for (const s2 of [-1, 1]) P.add('turretDetail', box(0.032, 0.34, 0.42), s2 * 1.19, 0.42, L(-1.92)); // corner stanchions
  addFitting(P, 'turret', FITTINGS.stowageRack({ mats: P.mats, w: 1.30, d: 0.14,
    h: 0.24, fill: 0.35, rails: 2, seed: 76 }), -0.05, 0.44, L(-2.10),
    [0, Math.PI, 0]);                                                          // rear rack: embedded feet, open face points outboard (-Z)
  addFitting(P, 'turret', FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone',
    elev: 0, shield: false, scale: 0.50, seed: 72 }), 0.30, 0.72, L(-0.62), [0, 2.85, 0]); // commander's Breda stowed LOW at the cupola (top under the 2.42 p95 datum; owner c425f495 carried one)
  // The print carries canted corner launchers rather than a featureless rear
  // roof edge.  Both banks have broad fitting-library shoes and remain under
  // the existing commander-cupola height datum.
  for (const s of [-1, 1]) addFitting(P, 'turret', FITTINGS.smokeBank({
    mats: P.mats, count: 5, r: 0.040, len: 0.24, splay: s * 0.95,
    pitch: -0.34, arc: 0.62, spacing: 0.085, slot: 'detail',
    rotation: [0, 0, -s * 0.10], seed: 78 + (s > 0 ? 1 : 0),
  }), s * 1.02, 0.89, L(-0.92));

  // Low supported crown rail follows the source roof lattice.  Each rail is
  // returned into the plateau by short uprights; there are no sky-supported
  // rods.  The darker rail reads clearly against the painted crown without
  // overtopping the certified cupola datum.
  for (const x of [-0.98, 0.35]) {
    P.add('turretDark', box(0.025, 0.025, 0.84), x, 0.910, L(-0.94));
    for (const z of [-1.34, -0.54]) P.add('turretDark', box(0.030, 0.120, 0.030),
      x, 0.850, L(z));
  }
  for (const z of [-1.34, -0.54]) P.add('turretDark', box(1.35, 0.025, 0.025),
    -0.315, 0.910, L(z));
  for (const [wx, wy, wz, wh] of [[-0.385, 0.822, -1.535, 1.63], [0.385, 0.817, -1.565, 1.64]]) {
    P.add('turretDark', cylY(0.035, 0.045, 0.08, 10), wx, wy + 0.04, L(wz - 0.055)); // offset-mount whips: pot clear of the st4 window, VERTICAL rod in
    P.add('turretDark', box(0.024, 0.05, 0.075), wx, wy + 0.10, L(wz - 0.028)); // the print's own trace column (tips ~4.10; the fitting's inline pot
    P.add('turretDetail', box(0.038, wh, 0.038), wx, wy + 0.125 + wh / 2, L(wz)); // could not satisfy both station windows at once)
    P.add('turretDark', box(0.05, 0.035, 0.05), wx, wy + 0.135, L(wz));
  }
                                                                               // the print's -1.52 station read one column rear; st3/st4 carry the
                                                                               // paired station reads and the trim absorbs them, packet-documented)
  for (const s2 of [-1, 1]) {
    for (let i = 0; i < 3; i++) {                                              // side access-panel seams, riding the canted wall face (owner's proud
      const pz = 0.16 - i * 0.57;                                              // panels superseded: the print walls cant 1.60@±1.54 -> 2.33@±1.15)
      P.add('turret', box(0.030, 0.26, 0.38), s2 * 1.40, 0.30, L(pz), 0, 0, s2 * 0.50);
      P.add('turretDark', box(0.018, 0.20, 0.30), s2 * 1.425, 0.30, L(pz), 0, 0, s2 * 0.50);
      for (const dy of [-0.065, 0, 0.065]) P.add('turretDetail', box(0.020, 0.014, 0.27),
        s2 * 1.438, 0.30 + dy, L(pz), 0, 0, s2 * 0.50);
    }
  }
  for (const s2 of [-1, 1]) P.add('turretDetail', box(0.02, 0.10, 0.16), s2 * 1.435, 0.30, L(-1.30)); // flush shackle plates (lift eyes read 2.32 over the 1.9-2.1 cant)
  // roof lid cadence (owner c425f495): unequal service plates + hinge bars
  for (const [lx, lz, w, dd] of [[-0.74, -0.30, 0.44, 0.38], [-0.20, -0.34, 0.42, 0.36],
    [0.30, -0.32, 0.40, 0.36]]) {
    P.add('turretDark', box(w, 0.016, dd), lx, 0.845, L(lz));                  // rear service lids, FLUSH (st-window roof-height law)
    P.add('turretDetail', box(w * 0.78, 0.012, 0.026), lx, 0.855, L(lz + dd * 0.38));
  }
  P.decal('turret', 'number', '45T', 0.25, [-1.53, 0.38, L(-0.55)], -Math.PI / 2, 0, 0);

  // saddle mantlet (node Object_6: x ±0.39, y 1.589..2.226, z 1.16..2.11;
  // gate top 2.02 @ +1.83..+2.11 with the chin rising 1.72-1.78)
  P.addGunExtra(box(0.62, 0.43, 0.56), 0, -0.105, 0.58);                       // central housing 1.585..2.015 (world z 1.30..1.86; the chin chamfer owns the tip band 1.86..2.14)
  P.addGunExtra(box(0.78, 0.36, 0.38), 0, 0.07, 0.42);                         // top saddle lip to 2.15 (world z 1.16..1.54)
  P.addGunExtra(KIT.xform(box(0.44, 0.30, 0.36), 0, 0, 0), 0, -0.06, 1.02, 0.75, 0, 0); // chin chamfer 1.70 -> 1.84 owning the mantlet tip (ref bottoms 1.72@+1.95, 1.78@+2.07)
  P.addGunExtra(cylZ(0.155, 0.34, 14, 0.125), 0, 0, 1.18);                     // collar lead
  P.addGunExtraDark(cylZ(0.030, 0.09, 8), 0.26, 0.09, 0.95);                   // coax port
  // 105mm: slim tube, mid-tube evacuator drum (side_gun swell r 0.139
  // z 5.47..6.17), plain slim muzzle at +7.11 (overall 10.60)
  buildGun(P, { len: 6.11, r: 0.10, baseR: 0.135, evac: 0.785, evacR: 1.39 });
  muzzleBore(P, { len: 6.11, r: 0.10 });
  P.topY = 2.45;
}

export const ITALY_PROFILES = {
  ariete: { build: buildAriete },
  ariete_c1: { build: buildArieteC1 },
  ariete_c2: { build: buildArieteC2 },
  carro45t: { build: buildCarro45T },
} satisfies VehicleProfileRecord;
