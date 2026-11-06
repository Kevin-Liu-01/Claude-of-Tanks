// The Hanwha AS21 Redback (release 269; Main's ruling 2026-11-02 on the owner's "flesh out south african and australian
// tank trees"): the Australian Army's LAND 400 Phase 3 infantry fighting vehicle, 129 ordered in December 2023, built at
// Geelong. One first-party build of the production standard with the trials' EOS R400 station on the roof.
// - hull: tall and flat-sided, its sides two courses of bolted appliqué panels with a ledge at their joint and bolt-head
//   pairs at every seam; the long 11-degree glacis from the nose to the turret, the upper front plate with a square lamp
//   cluster in a guard at each corner, the lower front plate falling to the belly; the rear plate and its ramp.
// - running gear: seven small road wheels a side on in-arm hydropneumatic arms, the sprocket ahead, the idler high
//   astern, Soucy composite rubber band tracks, the return run hidden behind the appliqué skirt.
// - turret: the EOS/Elbit T2000, two-man and faceted: the tall left block with an arrowhead prow, the lower right half
//   with the commander's panoramic sight, the 30 mm Mk44S in its long vented cradle housing between them; the Spike LR2
//   twin launcher on the left wall, Iron Fist launchers and dischargers on pedestals at the rear corners, Iron Fist
//   sensor panels on the walls, the R400 remote station on the left block.
// Datums (redbackDatums.ts): Hanwha's 3.6 m width, Janes' 7.9 m hull; the stations read off the 2021 live-fire profile
// and checked on the production, head-on and Land Forces photographs. A +Z hull's left is +X: the driver sits at the front
// left, the Spike launcher hangs on the turret's left wall.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { KIT, muzzleBore } from './kit.ts';
import { antennaPart } from './antennaPart.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort, TrackShoeBuildParameters } from '../tankFactoryCore.ts';
import { REDBACK as R } from '../redbackDatums.ts';

type P3 = readonly [number, number, number];

/** A closed faceted solid: the convex hull of its corners (outward by construction), its UVs in plan as convexSlab's. */
function facets(points: readonly P3[]): THREE.BufferGeometry {
  const g = new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const p = g.getAttribute('position'), uv: number[] = [];
  for (let i = 0; i < p.count; i++) uv.push(p.getX(i), p.getZ(i));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/** A side plate: its outline in (z, y) extruded across x from x0 to x1. */
function sidePlate(outline: readonly (readonly [number, number])[], x0: number, x1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(-z, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, steps: 1 })
    .rotateY(Math.PI / 2).translate(x0, 0, 0);
}

/** Soucy's composite rubber band a lug pitch at a time: the band's segment with two staggered transverse lugs on its
 *  face, left and right (front34_L_russell2021, front34_L_hace_testtrack); the far level one lug across. A band track
 *  has no pins, horns or grousers to resolve, so the near shoe stays a few boxes (the fleet's cost rule). */
function rubberBandShoe(p: TrackShoeBuildParameters): THREE.BufferGeometry {
  const w = p.trackW, band = 0.024, lug = 0.032, ly = (band + lug) / 2;
  const parts = [new THREE.BoxGeometry(w * 0.97, band, p.pitch * 0.98)];
  if (p.far) parts.push(new THREE.BoxGeometry(w * 0.90, lug, p.pitch * 0.44).translate(0, ly, 0));
  else for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(w * 0.45, lug, p.pitch * 0.50).translate(s * w * 0.235, ly, s * p.pitch * 0.2));
  const g = KIT.mergeAll(parts);
  if (p.radialScale !== 1) g.scale(1, p.radialScale, 1);
  if (p.widthScale !== 1) g.scale(p.widthScale, 1, 1);
  return g;
}

/** The hull's top at z: the flat roof aft of the glacis' knee, the glacis down to the nose. */
const top = (z: number): number => z <= R.glacisZ ? R.roofY
  : R.roofY - (z - R.glacisZ) / (R.noseTopZ - R.glacisZ) * (R.roofY - R.noseTopY);
const GLACIS = Math.atan2(R.roofY - R.noseTopY, R.noseTopZ - R.glacisZ);
/** A point `lift` off the glacis' face at z, as [y, z]. */
const onGlacis = (z: number, lift = 0): [number, number] => [top(z) + Math.cos(GLACIS) * lift, z + Math.sin(GLACIS) * lift];
/** The side appliqué's seams (Hanwha's production vehicle: eleven a side, about 0.66 m apart). */
const SEAMS = [3.30, 2.64, 1.98, 1.32, 0.66, 0.0, -0.66, -1.32, -1.98, -2.64, -3.30];
/** The skirt's foot at z: level, then up its raked front edge to the ledge (front34_L_hace_testtrack). */
const skirtFoot = (z: number): number => z <= R.skirtFootFrontZ ? R.skirtLowY
  : R.skirtLowY + (z - R.skirtFootFrontZ) / (R.skirtTopFrontZ - R.skirtFootFrontZ) * (R.ledgeY - R.skirtLowY);

function* buildRedbackSteps(P: TankBuilderPort): TankProfileBuild {
  const { box, cylX, cylY, cylZ, torus, xform, buildRunningGear, buildGun, headlight, liftEye, periscope } = KIT;
  const seg = P.q ? 20 : 12;
  const T = R.turret;
  // ---------------------------------------------------------------- hull --
  // the upper hull over the tracks: the sponsons' floor to the roof and the glacis, the upper front plate at the nose,
  // the rear plate astern (a chamfer along the roof's edges)
  const upper = (z: number): SolidSection => ({ z, ring: [[-R.wallX, R.sponsonY], [R.wallX, R.sponsonY],
    [R.wallX, top(z) - 0.03], [R.wallX - 0.03, top(z)], [-(R.wallX - 0.03), top(z)], [-R.wallX, top(z) - 0.03]] as SectionPoint[] });
  P.add('hull', sectionSolid([R.sternZ, R.glacisZ, R.noseTopZ].map(upper)));
  // the lower hull between the tracks: the lower front plate falling from the upper plate's band to the belly, the
  // belly, the rear plate's lip
  const belly = (z: number): number => z >= R.lowerNoseZ
    ? R.bellyY + (z - R.lowerNoseZ) / (R.noseTopZ - R.lowerNoseZ) * (R.frontPlateLowY - R.bellyY)
    : z <= R.rearBellyZ ? R.bellyY + (R.rearBellyZ - z) / (R.rearBellyZ - R.sternZ) * (R.rearPlateLowY - R.bellyY) : R.bellyY;
  const tubTop = R.sponsonY + 0.04;
  P.add('hull', sectionSolid([R.sternZ, R.rearBellyZ, R.lowerNoseZ, R.noseTopZ].map((z) => ({ z,
    ring: [[-R.tubX, belly(z)], [R.tubX, belly(z)], [R.tubX, tubTop], [-R.tubX, tubTop]] as SectionPoint[] }))));
  // the side appliqué in two courses (front34_L_hace_testtrack, side34_L_sand_rb10471): the upper course from the ledge
  // to the roof, its top following the glacis to the front edge; the lower course a skirt over the wheels' tops, its
  // front edge raked back to its foot ahead of the first wheel, the sprocket and the band's front run open under the lamp
  // clusters (front34_L_hace_testtrack); the bevelled ledge standing proud at the joint
  for (const s of [-1, 1] as const) {
    const out = s * R.halfWidthM;
    const [ux0, ux1] = s > 0 ? [R.wallX, R.halfWidthM] : [-R.halfWidthM, -R.wallX];
    P.addExternalArmor('hull', sidePlate([[R.sternZ, R.ledgeY], [R.sideFrontZ, R.ledgeY], [R.sideFrontZ, top(R.sideFrontZ)],
      [R.glacisZ, R.roofY], [R.sternZ, R.roofY]], ux0, ux1));
    const [lx0, lx1] = s > 0 ? [R.wallX + 0.01, R.halfWidthM] : [-R.halfWidthM, -(R.wallX + 0.01)];
    P.addEquipment(s < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR', sidePlate([[R.sternZ, R.skirtLowY], [R.skirtFootFrontZ, R.skirtLowY],
      [R.skirtTopFrontZ, R.ledgeY], [R.sternZ, R.ledgeY]], lx0, lx1));
    P.add('hullDetail', box(0.045, 0.08, R.sideFrontZ - R.sternZ), out + s * 0.018, R.ledgeY, (R.sideFrontZ + R.sternZ) / 2);
    // the panels' seams, a bolt-head pair either side of each: three rows on the upper course (fewer where the glacis
    // shortens it), two on the lower (front34_L_hace_testtrack: the heads about 6 cm across)
    for (const z of SEAMS) {
      const yTop = top(z) - 0.03, yFoot = skirtFoot(z) + 0.03;
      P.add('hullDark', box(0.006, yTop - R.ledgeY - 0.06, 0.014), out + s * 0.002, (yTop + R.ledgeY + 0.03) / 2, z);
      P.add('hullDark', box(0.006, R.ledgeY - 0.03 - yFoot, 0.014), out + s * 0.002, (R.ledgeY - 0.03 + yFoot) / 2, z);
      if (!P.q) continue;
      const rows = [R.ledgeY + 0.14, R.ledgeY + 0.38, R.ledgeY + 0.62].filter((y) => y < yTop - 0.08);
      for (const y of [R.ledgeY - 0.12, R.skirtLowY + 0.12]) if (y > yFoot + 0.06) rows.push(y);
      for (const y of rows) for (const dz of [-0.045, 0.045]) P.add('hullDetail', cylX(0.03, 0.024, 6), out + s * 0.012, y, z + dz);
    }
  }
  yield 'buildRedbackHull';

  // ---------------------------------------------------------------- running gear --
  // seven road wheels a side, 0.53 m on a 0.78 m pitch (side_L_livefire2021, front34_L_hace_testtrack); the sprocket ahead
  // and the idler high astern; three small return rollers behind the skirt keep the return run straight; Soucy's
  // composite rubber band, its block lugs (front34_L_russell2021) drawn by rubberBandShoe
  buildRunningGear(P, {
    style: 'rubber', wheelR: R.wheelR, wheelW: 0.24, wheelY: R.wheelY, xc: R.trackXc, wheelZs: [...R.wheelZs],
    sprocket: { ...R.sprocket }, idler: { ...R.idler },
    rollers: [2.15, 0.10, -1.95].map((z) => ({ z, y: 0.955, r: 0.075 })), rollerR: 0.075,
    trackW: R.trackW, trackTh: 0.07, trackPattern: 'british-rubber-pad', trackShoeBuilder: rubberBandShoe,
    topY: 1.10, botY: 0.035,
    contactZF: R.wheelZs[0], contactZR: R.wheelZs.at(-1), paintedEnds: true, coveredTop: true, arms: true, sprocketTeeth: true,
  });
  P.mats.rubber.color.setHex(0x2b2d2a);
  yield 'buildRedbackRunningGear';

  // ---------------------------------------------------------------- hull fittings --
  // the upper front plate: the square lamp cluster at each corner in its black housing (two white lamps, the amber
  // indicator outboard) behind a barred guard (front_commons_cc0, front34_L_russell2021); the dark band along the
  // plate's foot
  for (const s of [-1, 1] as const) {
    const lx = s * 1.44, ly = 1.32, lz = R.noseTopZ;
    P.add('hullDark', box(0.50, 0.20, 0.10), lx, ly, lz + 0.05);
    for (const u of [-0.12, 0.02]) headlight(P, lx + s * u, ly + 0.01, lz + 0.11, 0, 0.042);
    P.add('hullGlass', box(0.07, 0.05, 0.012), lx + s * 0.16, ly + 0.01, lz + 0.106);
    for (const u of [-0.26, -0.05, 0.26]) P.add('hullDetail', box(0.03, 0.24, 0.03), lx + s * u, ly, lz + 0.14);
    for (const dy of [-0.13, 0.13]) P.add('hullDetail', box(0.58, 0.03, 0.15), lx, ly + dy, lz + 0.075);
  }
  P.add('hullDark', box(2 * R.wallX, 0.05, 0.04), 0, R.frontPlateLowY + 0.02, R.noseTopZ + 0.01);
  // (and over each track the black fender lip under the lamp cluster)
  for (const s of [-1, 1] as const) P.add('hullDark', box(0.60, 0.06, 0.16), s * 1.42, R.frontPlateLowY + 0.02, R.noseTopZ - 0.02);
  // the towing eyes on the lower front plate, its two rows of bolt heads (front_commons_cc0)
  {
    const lowerRake = Math.atan2(R.noseTopZ - R.lowerNoseZ, R.frontPlateLowY - R.bellyY);
    const plateZ = (y: number): number => R.lowerNoseZ + (y - R.bellyY) / (R.frontPlateLowY - R.bellyY) * (R.noseTopZ - R.lowerNoseZ);
    if (P.q) for (const y of [0.62, 0.98]) for (let k = 0; k < 6; k++) {
      P.add('hullDetail', cylZ(0.03, 0.024, 6), -0.85 + k * 0.34, y, plateZ(y) + 0.008, lowerRake, 0, 0);
    }
    const k = (0.86 - R.bellyY) / (R.frontPlateLowY - R.bellyY), ez = R.lowerNoseZ + k * (R.noseTopZ - R.lowerNoseZ);
    for (const s of [-1, 1] as const) {
      P.add('hullDark', box(0.14, 0.16, 0.10), s * 0.70, 0.86, ez + 0.02);
      P.add('hullDark', torus(0.06, 0.018, 12, 6), s * 0.70, 0.80, ez + 0.10, Math.PI / 2, 0, 0);
    }
  }
  // the driving camera's hood on the glacis' centre line (sensor_detail_landforces2024): a box under a peaked hood, two
  // lenses forward
  {
    const [gy, gz] = onGlacis(3.30, 0.09);
    P.addEquipment('hull', xform(box(0.44, 0.17, 0.26), 0, 0, 0, GLACIS, 0, 0), 0, gy, gz);
    P.add('hullDark', xform(box(0.50, 0.03, 0.32), 0, 0.10, 0.02, GLACIS, 0, 0), 0, gy, gz);
    for (const dx of [-0.10, 0.10]) P.add('hullGlass', xform(cylZ(0.045, 0.014, 12), dx, 0, 0.134, GLACIS, 0, 0), 0, gy, gz);
  }
  // the driver at the front left: his periscope hump at the glacis' head, his hatch behind it under the turret's prow
  // (front_commons_cc0, front34_L_hace_testtrack)
  {
    const dx = 0.82, [hy, hz] = onGlacis(1.58, 0.05);
    P.addEquipment('hull', xform(box(0.58, 0.10, 0.32), 0, 0, 0, GLACIS, 0, 0), dx, hy, hz);
    for (const ox of [-0.18, 0, 0.18]) P.add('hullGlass', xform(box(0.13, 0.045, 0.012), ox, 0.005, 0.163, GLACIS, 0, 0), dx, hy, hz);
    P.addHatch('hull', cylY(0.30, 0.31, 0.04, seg), dx, R.roofY + 0.02, 1.02);
    P.add('hullDark', box(0.10, 0.04, 0.10), dx - 0.30, R.roofY + 0.04, 1.02);
  }
  // the engine's access covers on the front right of the deck and the panel ahead of the driver, the glacis' bolt rows
  for (const [x, z, w, d] of [[-0.78, 2.40, 0.96, 0.78], [-0.78, 3.20, 0.96, 0.62], [0.78, 2.70, 0.80, 0.70]] as const) {
    const [py, pz] = onGlacis(z, 0.006);
    P.add('hullDetail', xform(box(w, 0.012, d), 0, 0, 0, GLACIS, 0, 0), x, py, pz);
  }
  if (P.q) for (const z of [3.74, 2.02]) for (let k = 0; k < 8; k++) {
    const [by, bz] = onGlacis(z, 0.01);
    P.add('hullDetail', xform(cylY(0.024, 0.024, 0.02, 6), 0, 0, 0, GLACIS, 0, 0), -1.40 + k * 0.40, by, bz);
  }
  // the mirrors on stalks at the glacis' front corners (front_commons_cc0, front34_L_russell2021)
  for (const s of [-1, 1] as const) {
    const my = top(3.62);
    P.add('hullDark', cylY(0.02, 0.025, 0.42, 8), s * 1.62, my + 0.21, 3.62);
    P.add('hullDark', box(0.05, 0.36, 0.20), s * 1.65, my + 0.53, 3.62);
    liftEye(P, 'hullDetail', s * 1.52, top(3.80) + 0.012, 3.80, s * 0.3);
  }
  // the engine's round exhaust grille on the right side's upper course (side34_R_2020, side_detail_landforces2024)
  {
    const ex = -(R.halfWidthM + 0.012), ey = 1.62, ez = 1.62;
    P.add('hullDark', cylX(0.13, 0.024, P.q ? 20 : 14), ex, ey, ez);
    P.add('hullDetail', torus(0.13, 0.022, P.q ? 20 : 14, 6), ex - 0.006, ey, ez, 0, 0, Math.PI / 2);
    if (P.q) for (const dy of [-0.075, -0.025, 0.025, 0.075]) P.add('hullDetail', box(0.012, 0.022, 0.22), ex - 0.008, ey + dy, ez);
  }
  // the rear plate: the ramp's outline and its door, the hinges, the tail-light clusters at the corners, the towing hooks
  const rz = R.sternZ - 0.006;
  P.add('hullDark', box(1.64, 0.02, 0.012), 0, 1.86, rz);
  P.add('hullDark', box(1.64, 0.02, 0.012), 0, 0.88, rz);
  for (const s of [-1, 1] as const) P.add('hullDark', box(0.02, 0.98, 0.012), s * 0.81, 1.37, rz);
  P.add('hullDark', box(0.56, 0.016, 0.012), 0.36, 1.70, rz - 0.002);
  for (const s of [-1, 1] as const) P.add('hullDark', box(0.016, 0.66, 0.012), 0.36 + s * 0.28, 1.37, rz - 0.002);
  P.add('hullDark', box(0.04, 0.12, 0.05), 0.12, 1.37, rz - 0.025);
  for (const s of [-1, 1] as const) {
    P.add('hullDark', cylX(0.05, 0.30, 12), s * 0.52, 0.90, R.sternZ - 0.03);
    P.add('hullDark', box(0.28, 0.14, 0.06), s * 1.40, 1.82, R.sternZ - 0.03);
    for (const dx of [-0.06, 0.06]) P.add('hullGlass', cylZ(0.035, 0.012, 12), s * 1.40 + dx, 1.82, R.sternZ - 0.066);
    P.add('hullDark', box(0.14, 0.16, 0.12), s * 0.98, 1.00, R.sternZ - 0.06);
    P.add('hullDark', torus(0.055, 0.018, 12, 6), s * 0.98, 0.94, R.sternZ - 0.13, 0, 0, Math.PI / 2);
  }
  // the step frames at the rear corners, in line with the sides: two posts rising to a hand rail over the roof, rungs,
  // and the brace under them (front34_L_hace_testtrack's rear left, side34_R_2020's rear right)
  for (const s of [-1, 1] as const) {
    const x = s * 1.72, z0 = R.sternZ - 0.07, z1 = R.sternZ - 0.32;
    for (const z of [z0, z1]) P.add('hullOpenLattice', box(0.04, 1.18, 0.04), x, 1.58, z);
    for (const y of [1.22, 1.48, 1.74, 2.00]) P.add('hullOpenLattice', box(0.035, 0.035, z0 - z1), x, y, (z0 + z1) / 2);
    P.add('hullOpenLattice', box(0.035, 0.035, z0 - z1 + 0.04), x, 2.15, (z0 + z1) / 2);
    for (const y of [1.10, 1.90]) P.add('hullOpenLattice', box(0.035, 0.035, 0.075), x, y, R.sternZ - 0.035);
    P.add('hullOpenLattice', beamBetween([x, 0.99, z1], [x, 0.80, R.sternZ - 0.01], 0.018, 8));
  }
  // the roof: the troops' two hatches aft, the lifting eyes, the whips on the rear corners
  for (const s of [-1, 1] as const) {
    P.addHatch('hull', box(0.72, 0.04, 0.84), s * 0.52, R.roofY + 0.02, -3.05);
    P.add('hullDark', box(0.06, 0.03, 0.70), s * 0.52 + s * 0.38, R.roofY + 0.04, -3.05);
    liftEye(P, 'hullDetail', s * 1.52, R.roofY + 0.012, -3.78, s * 2.8);
    P.add('hullDetail', cylY(0.05, 0.06, 0.08, 10), s * 1.40, R.roofY + 0.04, -3.50);
    P.addEquipment('hull', antennaPart(cylY(0.010, 0.014, 2.4, 6)), s * 1.40, R.roofY + 1.28, -3.50, 0, 0, s * 0.03);
  }
  yield 'buildRedbackHullFittings';

  // ---------------------------------------------------------------- turret (the T2000) --
  P.turretG.position.set(R.ring[0], R.ring[1], R.ring[2]);
  const yF = T.floorY, yR = T.roofY, yB = T.blockTopY;
  P.add('turret', cylY(1.04, 1.06, 0.12, P.q ? 32 : 20), 0, 0.05, 0);
  // the right half: slab walls, the roof's outer edge bevelled, its prow an arrowhead in profile (the upper face falling
  // to a ridge at 0.40 m, the lower face undercut back to the floor) and swept back in plan at its outer corner
  // (front_commons_cc0, front34_L_russell2021)
  P.add('turret', facets([
    [T.rightX, yF, T.rearZ], [T.slotR, yF, T.rearZ], [T.rightX, yR - 0.08, T.rearZ], [T.rightX + 0.08, yR, T.rearZ], [T.slotR, yR, T.rearZ],
    [T.slotR, yR, 0.80], [T.rightX + 0.08, yR, 0.74], [T.rightX, yR - 0.08, 0.70],
    [T.slotR, 0.40, 1.32], [-0.78, 0.40, 1.22], [T.rightX, 0.40, 0.90],
    [T.slotR, yF, 0.98], [T.rightX, yF, 0.62],
  ]));
  // the left block, taller: the same arrowhead prow carried further forward, its ridge at 0.47 m; aft of it the lower
  // left rear (front34_od_turret, front34_L_russell2021)
  P.add('turret', facets([
    [T.slotL, yF, -0.10], [T.leftX, yF, -0.10], [T.leftX, yB - 0.08, -0.10], [T.leftX - 0.08, yB, -0.10], [T.slotL, yB, -0.10],
    [T.slotL, yB, 0.95], [T.leftX - 0.08, yB, 0.88], [T.leftX, yB - 0.08, 0.84],
    [T.slotL, 0.47, T.noseZ], [0.92, 0.47, 1.34], [T.leftX, 0.47, 0.98],
    [T.slotL, yF, 1.10], [T.leftX, yF, 0.66],
  ]));
  P.add('turret', facets([
    [T.slotL, yF, T.rearZ], [T.leftX, yF, T.rearZ], [T.leftX, 0.66, T.rearZ], [T.leftX - 0.08, 0.74, T.rearZ], [T.slotL, 0.74, T.rearZ],
    [T.slotL, yF, -0.05], [T.leftX, yF, -0.05], [T.leftX, 0.66, -0.05], [T.leftX - 0.08, 0.74, -0.05], [T.slotL, 0.74, -0.05],
  ]));
  // the centre between them: the roof over the breech, the gun's slot ahead of it, its floor lip under the housing
  P.add('turret', facets([
    [T.slotR, yF, T.rearZ], [T.slotL, yF, T.rearZ], [T.slotR, yR, T.rearZ], [T.slotL, yR, T.rearZ],
    [T.slotR, yR, 0.72], [T.slotL, yR, 0.72], [T.slotR, 0.20, 0.98], [T.slotL, 0.20, 0.98], [T.slotR, yF, 1.06], [T.slotL, yF, 1.06],
  ]));
  // the Iron Fist sensor panels on the walls behind the prows (front34_L_russell2021, side34_R_2020) and on the rear
  // face's corners, the four quarters covered
  for (const [x, z, y] of [[T.leftX, 0.46, 0.57], [T.rightX, 0.40, 0.46]] as const) {
    const s = Math.sign(x);
    P.addEquipment('turret', box(0.05, 0.30, 0.25), x + s * 0.025, y, z);
    P.add('turretGlass', box(0.012, 0.17, 0.15), x + s * 0.056, y + 0.02, z);
  }
  for (const x of [-0.62, 0.66]) {
    P.addEquipment('turret', box(0.25, 0.28, 0.05), x, 0.42, T.rearZ - 0.025);
    P.add('turretGlass', box(0.15, 0.16, 0.012), x, 0.44, T.rearZ - 0.056);
  }
  // the commander's hatch on the right half with its periscopes, the gunner's on the centre aft
  P.addHatch('turret', cylY(0.30, 0.31, 0.05, seg), -0.62, yR + 0.025, -0.62);
  P.add('turretDark', box(0.10, 0.04, 0.12), -0.62, yR + 0.07, -0.95);
  for (const [dx, ry] of [[-0.24, 0.5], [0, 0], [0.22, -0.5]] as const) periscope(P, 'turretDetail', -0.62 + dx, yR + 0.035, -0.62 + 0.36, ry);
  P.addHatch('turret', cylY(0.24, 0.25, 0.05, seg), -0.02, yR + 0.025, -1.10);
  yield 'buildRedbackTurret';

  // ---------------------------------------------------------------- turret fittings --
  // the commander's stabilised panoramic sight on the right half, inboard by the gun: a turning pedestal and the head
  // with its day and thermal windows under a peak (front_commons_cc0, front34_L_hace_testtrack)
  {
    const sx = -0.42, sz = 0.42;
    P.addModuleVisual('optics', 'turretDetail', cylY(0.10, 0.12, 0.14, 14), sx, yR + 0.07, sz);
    P.addModuleVisual('optics', 'turretDetail', box(0.26, 0.24, 0.30), sx, yR + 0.26, sz);
    for (const dx of [-0.06, 0.06]) P.add('turretGlass', cylZ(0.05, 0.014, 14), sx + dx, yR + 0.27, sz + 0.154);
    P.add('turretDark', box(0.28, 0.02, 0.10), sx, yR + 0.39, sz + 0.11);
  }
  // the Spike LR2 twin launcher on the left wall aft of the prow: its box stood off the wall, the two canister mouths in
  // its face, a dark panel along its side (front34_L_russell2021, front34_od_turret)
  {
    const lx = T.leftX + 0.11, lz0 = -1.16, lz1 = -0.12;
    P.addModuleVisual('missileRack', 'turretDetail', box(0.24, 0.46, lz1 - lz0), lx, 0.44, (lz0 + lz1) / 2);
    for (const y of [0.33, 0.55]) {
      P.add('turretDark', cylZ(0.072, 0.016, 16), lx, y, lz1 + 0.004);
      P.add('turretDetail', torus(0.08, 0.012, 16, 6), lx, y, lz1 + 0.006, Math.PI / 2, 0, 0);
    }
    P.add('turretDark', box(0.012, 0.30, lz1 - lz0 - 0.20), lx + 0.122, 0.44, (lz0 + lz1) / 2);
    P.add('turretDark', box(0.04, 0.06, 0.10), lx - 0.05, 0.70, lz0 + 0.10);
  }
  // Iron Fist at each rear corner: a pedestal stood off the wall, the twin-tube launcher on its turntable aimed forward,
  // out and up; four dischargers on the pedestal's face (front34_L_russell2021, side34_R_2020, front34_od_turret)
  for (const s of [-1, 1] as const) {
    const wall = s > 0 ? T.leftX : -T.rightX, px = s * (wall + 0.10), pz = T.rearZ + 0.22, ay = s * 0.55;
    P.addEquipment('turret', box(0.30, 0.62, 0.36), px, 0.50, pz);
    P.addEquipment('turret', cylY(0.11, 0.12, 0.06, 14), px, 0.84, pz);
    P.addEquipment('turret', xform(box(0.24, 0.17, 0.26), 0, 0, 0, 0, ay, 0), px, 0.955, pz);
    for (const u of [-0.06, 0.06]) {
      // (each tube laid on the launcher's own axes, then the pair turned out and raised together)
      const aim = <G extends THREE.BufferGeometry>(g: G): G => xform(g, 0, 0, 0, -0.45, ay, 0);
      P.add('turretDetail', aim(xform(cylZ(0.046, 0.36, 12), u, 0, 0.06)), px, 0.995, pz);
      P.add('turretDark', aim(xform(cylZ(0.034, 0.012, 12), u, 0, 0.245)), px, 0.995, pz);
    }
    for (const [dx, dy] of [[-0.07, 0], [0.07, 0], [-0.07, 0.12], [0.07, 0.12]] as const) {
      P.add('turretDetail', markSmokeTube(cylZ(0.034, 0.20, P.q ? 12 : 8)), px + dx, 0.40 + dy, pz + 0.22, -0.45, s * 0.40, 0);
    }
  }
  // the EOS R400 remote station on the left block's after part, over the front third of the turret
  // (side_L_livefire2021, side34_R_2020, front34_L_russell2021): its turning base, the cradle with the 12.7 mm on top, the
  // sight head on its right, the tall ammunition box on its left
  {
    const qx = 0.70, qz = 0.36, qb = yB;
    P.addEquipment('turret', cylY(0.24, 0.26, 0.10, seg), qx, qb + 0.05, qz);
    P.addEquipment('turret', box(0.28, 0.42, 0.50), qx, qb + 0.31, qz);
    P.addEquipment('turret', box(0.20, 0.50, 0.44), qx + 0.25, qb + 0.35, qz - 0.03);
    P.addModuleVisual('optics', 'turretDetail', box(0.22, 0.30, 0.32), qx - 0.26, qb + 0.40, qz + 0.04);
    for (const [dx, dy] of [[0.04, 0.06], [-0.05, -0.05]] as const) {
      P.add('turretGlass', cylZ(0.05, 0.014, 14), qx - 0.26 + dx, qb + 0.40 + dy, qz + 0.204);
    }
    P.add('turretDark', box(0.10, 0.10, 0.56), qx, qb + 0.57, qz + 0.04);
    P.add('turretDark', cylZ(0.022, 0.80, 10), qx, qb + 0.57, qz + 0.72);
    P.add('turretDark', cylZ(0.032, 0.10, 10), qx, qb + 0.57, qz + 1.17);
  }
  liftEye(P, 'turretDetail', -0.90, yR + 0.005, -1.35, 2.7);
  liftEye(P, 'turretDetail', -0.90, yR + 0.005, 0.60, 0.3);
  yield 'buildRedbackTurretFittings';

  // ---------------------------------------------------------------- the 30 mm Mk44S --
  // the gun 5 cm left of the ring; its long armoured cradle housing between the halves, three vents a side
  // (front34_L_russell2021, front34_od_turret), its front cut back under; the coaxial MAG 58's port at its foot right;
  // the barrel out of a collar to the muzzle booster, the muzzle at hull z 3.15 (side_L_livefire2021)
  P.gunG.position.set(R.trunnion[0], R.trunnion[1], R.trunnion[2]);
  P.addGunExtra(facets([
    [-0.19, -0.17, 0.05], [0.19, -0.17, 0.05], [-0.19, 0.13, 0.05], [0.19, 0.13, 0.05], [-0.14, 0.19, 0.05], [0.14, 0.19, 0.05],
    [-0.19, 0.13, 1.40], [0.19, 0.13, 1.40], [-0.14, 0.19, 1.40], [0.14, 0.19, 1.40], [-0.19, -0.17, 1.18], [0.19, -0.17, 1.18],
  ]));
  for (const s of [-1, 1] as const) for (const z of [0.58, 0.80, 1.02]) P.addGunExtraDark(box(0.012, 0.085, 0.12), s * 0.193, 0.02, z);
  P.addGunExtraDark(cylZ(0.024, 0.05, 10), -0.12, -0.10, 1.215);
  buildGun(P, { len: R.barrelM, r: 0.038, evac: null, baseR: 0.07, collar: false, tubeInset: 0.20 });
  P.add('gun', cylZ(0.066, 0.06, seg), 0, 0, 1.40);
  P.add('gun', cylZ(0.056, 0.20, seg, 0.050), 0, 0, R.barrelM - 0.10);
  P.add('gunDark', cylZ(0.058, 0.016, seg), 0, 0, R.barrelM - 0.15);
  muzzleBore(P, { z: R.barrelM + 0.004, r: 0.050 });
  P.muzzleZ = R.barrelM;
  P.turretG.userData.redbackTurretReceipt = Object.freeze({ revision: 'redback-269-r1', roadWheels: 7, spikeLauncher: 'left',
    ironFist: true, rubberTracks: true });
  P.topY = R.roofY;
}

/** The AS21 Redback's builder (australia.ts registers it). */
export const buildRedback: (P: TankBuilderPort) => void = steppedBuilder(buildRedbackSteps);
