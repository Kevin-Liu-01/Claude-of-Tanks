// Release 269, the second air-defence round (owner 2026-11-03: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV
// 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)"): the ROK Army's K30 Biho on the K200 family's stretched hull
// (profiles/k200Hull.ts, six road wheels), built from its photographs (docs/references/tanks/k30_biho.md):
// - the long, narrow turret on the rear half of the hull (photographs 02, 04, 07): the central front body between the gun
//   housings, its front deck carrying the EOTS head with its window sloped up and back (01, 04); the taller rear body
//   behind it, its flanks bulging out over the set-in base (07's sloping lower panel), the gunner's sight head and the two
//   hatches on its roof, a smoke discharger block low on each flank (02, 04), the stowage basket on its rear face (05, 07);
// - the two KCB 30 mm in armoured housings on the central body's flanks that elevate with them (02: a housing tilted with
//   its barrel), each barrel leaving a collar and its recoil spring on the housing's front (07) for the muzzle brake;
// - the TPS-830K search antenna raised on its mast over the rear of the roof (01, 02, 05, 08): a wide reflector curved
//   about the vertical, its line feed across the front of its upper edge, the IFF box on its top;
// - on the hull, the K30's own fittings (07): the access door and the hatch in the left flank, the tools stowed behind them.
// Every firing datum is the layout's (k30BihoLayout.ts), which the spec (k30BihoSpecs.ts) reads: the ring, the trunnion,
// the twin fire axes (spec.gun.muzzles, one barrel group a side). First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { weaponAssembly } from './weaponStock.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { convexBody, mirrored, type P3 } from './plaAirDefenseChassis.ts';
import { buildK200Hull } from './k200Hull.ts';
import { K30_HULL } from './k200HullLayout.ts';
import { K30_GUN_PIVOT, K30_GUNS, K30_TURRET, K30_TURRET_PIVOT } from './k30BihoLayout.ts';

const { box, cylX, cylY, cylZ, torus } = KIT;

// ------------------------------------------------------------------------------------------------------------ hull --
/** The K30's own fittings on the K200 hull's left flank (photograph 07): the access door and the hatch behind it, the
 * pick and the bar stowed on clamps along the rear half. */
function k30HullFittings(P: TankBuilderPort): void {
  const L = K30_HULL, x = L.sideX;
  for (const [z0, z1] of [[L.at(1.12), L.at(1.73)], [L.at(1.85), L.at(2.46)]] as const) {
    P.add('hullDetail', box(0.016, 0.48, z0 - z1 - 0.02), x + 0.005, 1.47, (z0 + z1) / 2);
    for (const y of [1.30, 1.64]) P.add('hullDark', box(0.03, 0.07, 0.05), x + 0.012, y, z0 - 0.03);
  }
  P.add('hullDark', box(0.03, 0.04, 0.12), x + 0.016, 1.47, L.at(1.62));
  for (const [z0, z1] of [[-0.80, -1.98], [-2.14, -2.98]] as const) {
    P.add('hullDetail', cylZ(0.018, z0 - z1, 8), x + 0.026, 1.30, (z0 + z1) / 2);
    for (const z of [z0 - 0.12, z1 + 0.12]) P.add('hullDark', box(0.04, 0.06, 0.05), x + 0.016, 1.30, z);
  }
  // the pick's head and the bar's claw on their brackets
  P.add('hullDetail', box(0.03, 0.26, 0.05), x + 0.026, 1.30, -0.75);
  P.add('hullDetail', box(0.03, 0.05, 0.16), x + 0.026, 1.30, -3.00);
}

// ---------------------------------------------------------------------------------------------------------- turret --
/** The search antenna's reflector: `width` across, curved about the vertical (its ends `sagitta` forward of its middle),
 * its lower corners rounded up (photograph 01), `thick` deep, centred on the origin facing +z. */
function reflector(P: TankBuilderPort): THREE.BufferGeometry {
  const R = K30_TURRET.radar, n = P.q ? 14 : 8;
  const sections: SolidSection[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -1 + 2 * i / n;
    const zf = R.sagitta * t * t, y0 = -R.height / 2 + 0.14 * t ** 4, y1 = R.height / 2;
    // contour in (-z, y): the face at zf, the back `thick` behind it
    sections.push({ z: t * R.width / 2, ring: [[-zf, y0], [-zf + R.thick, y0], [-zf + R.thick, y1], [-zf, y1]] });
  }
  return sectionSolid(sections, { sideQuadDiagonal: 'convex' }).rotateY(Math.PI / 2);
}

function k30Turret(P: TankBuilderPort): void {
  const T = K30_TURRET, B = T.base, F = T.front, R = T.rear, E = T.eots, n = P.q ? 32 : 18;
  // the race collar on the ring, 2 cm into the deck; the rear body's floor and the front body sit 2 cm into it
  P.add('turret', cylY(B.r, B.r + 0.02, B.topY + 0.02, n), 0, (B.topY - 0.02) / 2, 0);
  // the rear body: set-in base, flanks bulging out from the waist to the shoulder, the roof's edges chamfered
  P.add('turret', convexBody(mirrored([R.rearZ, R.frontZ].flatMap((z) => [
    [R.lowHalf, R.bottomY, z], [R.lowHalf, R.waistY, z], [R.upHalf, R.shoulderY, z], [R.upHalf, R.eaveY, z],
    [R.roofHalf, R.roofY, z],
  ] as P3[]))));
  // the central front body, 5 cm into the rear body: its front face with chamfered corners, the chamfer up to the deck
  P.add('turret', convexBody(mirrored([
    [F.halfX, F.bottomY, F.rearZ], [F.halfX, F.deckY, F.rearZ], [F.halfX, F.deckY, F.deckFrontZ - 0.04],
    [F.halfX - 0.04, F.deckY, F.deckFrontZ], [F.halfX, F.faceTopY, F.frontZ - 0.06], [F.halfX - 0.06, F.faceTopY, F.frontZ],
    [F.halfX - 0.06, F.bottomY + 0.08, F.frontZ], [F.halfX, F.bottomY + 0.08, F.frontZ - 0.06], [F.halfX, F.bottomY, F.frontZ - 0.14],
    [F.halfX - 0.06, F.bottomY, F.frontZ - 0.08],
  ])));
  // the EOTS head on the deck: its chin over the body's chamfer, the window face sloped up and back, two panes, the
  // laser rangefinder's box on its right (photograph 01)
  P.addModuleVisual('optics', 'turret', convexBody(mirrored([
    [E.halfX, E.baseY - 0.01, E.rearZ], [E.halfX, E.topY, E.rearZ], [E.halfX, E.topY, E.browZ], [E.halfX, E.sillY, E.frontZ],
    [E.halfX, F.faceTopY - 0.02, F.frontZ + 0.01], [E.halfX, E.baseY - 0.01, F.deckFrontZ],
  ])));
  const slope = Math.atan2(E.frontZ - E.browZ, E.topY - E.sillY);
  const paneY = (E.topY + E.sillY) / 2, paneZ = (E.browZ + E.frontZ) / 2;
  for (const x of [-0.088, 0.088]) {
    P.addModuleVisual('optics', 'turretGlass', box(0.15, 0.20, 0.012).rotateX(-slope).translate(x, paneY + 0.003 * Math.sin(slope),
      paneZ + 0.003 * Math.cos(slope)));
  }
  P.addModuleVisual('optics', 'turretDetail', box(0.09, 0.17, 0.24), -(E.halfX + 0.04), F.deckY + 0.075, 1.28);
  P.addModuleVisual('optics', 'turretGlass', cylZ(0.03, 0.012, 10), -(E.halfX + 0.04), F.deckY + 0.10, 1.402);
  // the gunner's sight head on the roof's front left (photographs 02, 04, 07): column, drum, dome, window
  const sx = 0.30, sz = 0.02;
  P.addModuleVisual('optics', 'turretDetail', cylY(0.12, 0.12, 0.14, P.q ? 18 : 12), sx, R.roofY + 0.06, sz);
  P.addModuleVisual('optics', 'turretDetail', cylY(0.15, 0.15, 0.15, P.q ? 20 : 12), sx, R.roofY + 0.195, sz);
  P.addModuleVisual('optics', 'turretDetail', KIT.lathe([[0.001, 0], [0.15, 0], [0.13, 0.035], [0.08, 0.06], [0.001, 0.07]], P.q ? 20 : 12),
    sx, R.roofY + 0.265, sz);
  P.addModuleVisual('optics', 'turretGlass', box(0.16, 0.07, 0.06), sx, R.roofY + 0.20, sz + 0.15);
  // the commander's hatch (right) and the radar operator's (left, aft), lifting eyes at the roof's corners
  P.addHatch('turret', cylY(0.27, 0.27, 0.04, P.q ? 22 : 14), -0.40, R.roofY + 0.012, -0.30);
  P.add('turretDark', torus(0.27, 0.011, P.q ? 22 : 14, 4), -0.40, R.roofY + 0.032, -0.30);
  P.addHatch('turret', cylY(0.22, 0.22, 0.04, P.q ? 20 : 12), 0.44, R.roofY + 0.012, -0.66);
  P.add('turretDark', torus(0.22, 0.010, P.q ? 20 : 12, 4), 0.44, R.roofY + 0.032, -0.66);
  for (const s of [-1, 1]) for (const z of [0.08, -1.27]) KIT.liftEye(P, 'turretDetail', s * 0.76, R.roofY + 0.012, z);
  // flanks: the stowage doors, the grab handles under the eaves, the antenna bases at the rear corners
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.012, 0.24, 0.52), s * (R.upHalf + 0.002), 0.885, -0.55);
    P.add('turretDark', box(0.03, 0.05, 0.04), s * (R.upHalf + 0.01), 0.885, -0.27);
    for (const z of [-0.05, -0.95]) P.add('turretDark', box(0.02, 0.03, 0.18), s * (R.upHalf + 0.006), 0.99, z);
    P.add('turretDark', cylY(0.04, 0.05, 0.06, 10), s * 0.50, R.roofY + 0.02, -1.28);
  }
  // a smoke discharger block low on each flank's front, four barrels fired forward, out and up (photographs 02, 04)
  for (const s of [-1, 1]) {
    P.add('turret', convexBody([[0.66, 0.40], [0.86, 0.40], [0.66, 0.62], [0.84, 0.62]].flatMap(([x, y]) => [
      [s * x, y, -0.14], [s * x, y, 0.12]] as P3[])));
    for (const [y, dz] of [[0.46, 0], [0.56, 0], [0.46, -0.09], [0.56, -0.09]] as const) {
      P.add('turretDetail', cylZ(0.034, 0.17, 10), s * 0.86, y, 0.04 + dz, -0.30, s * 0.70, 0);
    }
  }
  // the stowage basket on the rear face: three rails, the posts, the floor's slats (one welded cage, its front ends 1 cm
  // into the face)
  const K = T.basket, bar = (a: P3, b: P3): void => P.add('turretOpenLattice', beamBetween(a, b, 0.016, 6));
  for (const y of [K.topY, (K.topY + K.bottomY) / 2, K.bottomY]) {
    bar([K.half, y, K.frontZ], [K.half, y, K.rearZ]);
    bar([K.half, y, K.rearZ], [-K.half, y, K.rearZ]);
    bar([-K.half, y, K.rearZ], [-K.half, y, K.frontZ]);
  }
  bar([K.half, K.bottomY, K.frontZ], [-K.half, K.bottomY, K.frontZ]);
  for (const [x, z] of [[K.half, K.frontZ], [K.half, (K.frontZ + K.rearZ) / 2], [K.half, K.rearZ], [0, K.rearZ],
    [-K.half, K.rearZ], [-K.half, (K.frontZ + K.rearZ) / 2], [-K.half, K.frontZ]] as const) {
    bar([x, K.bottomY, z], [x, K.topY, z]);
  }
  for (const z of [-1.52, -1.66, -1.80]) bar([K.half, K.bottomY, z], [-K.half, K.bottomY, z]);
  bar([0, K.bottomY, K.frontZ], [0, K.bottomY, K.rearZ]);
  k30Radar(P);
  P.topY = R.roofY + 0.33;
}

/** The TPS-830K raised on its mast: the plinth, the column, the hinge pedestal, the turntable and rotator, the back
 * housing, the reflector, the line feed on its struts and the IFF box on the top. */
function k30Radar(P: TankBuilderPort): void {
  const R = K30_TURRET.radar, roof = K30_TURRET.rear.roofY, z = R.mastZ;
  P.add('turretDetail', box(0.36, 0.08, 0.36), 0, roof + 0.03, z);
  P.add('turretDetail', cylY(0.085, 0.085, R.columnTopY - roof - 0.02, P.q ? 16 : 10), 0, (R.columnTopY + roof + 0.06) / 2, z);
  P.add('turretDetail', box(0.30, R.pedestalTopY - R.columnTopY, 0.30), 0, (R.pedestalTopY + R.columnTopY) / 2, z);
  P.add('turretDark', cylY(0.17, 0.17, R.turntableTopY - R.pedestalTopY + 0.01, P.q ? 20 : 12), 0, (R.turntableTopY + R.pedestalTopY) / 2, z);
  P.add('turretDetail', cylY(0.12, 0.14, 0.12, P.q ? 16 : 10), 0, R.turntableTopY + 0.055, z);
  // the back housing: 1.5 cm down onto the rotator, its front 5 mm into the reflector's back
  const backBottom = R.turntableTopY + 0.10, backTop = R.centreY + 0.13;
  P.add('turretDetail', box(0.66, backTop - backBottom, 0.20), 0, (backTop + backBottom) / 2, R.faceZ - R.thick + 0.005 - 0.10);
  P.add('turretDetail', reflector(P), 0, R.centreY, R.faceZ);
  // the line feed across the face's upper edge, on five struts back to the face
  const feedY = R.centreY + R.height / 2 - 0.06, feedZ = R.faceZ + R.sagitta + 0.04;
  P.add('turretDark', box(1.26, 0.04, 0.04), 0, feedY, feedZ);
  for (const t of [-0.80, -0.40, 0, 0.40, 0.80]) {
    const x = t * R.width / 2;
    P.add('turretDark', beamBetween([x, feedY, feedZ - 0.01], [x, feedY, R.faceZ + R.sagitta * t * t - 0.005], 0.009, 6));
  }
  P.add('turretDetail', box(0.26, R.iffTopY - (R.centreY + R.height / 2) + 0.02, 0.14), 0,
    (R.iffTopY + R.centreY + R.height / 2 - 0.02) / 2, R.faceZ - R.thick / 2);
}

// ------------------------------------------------------------------------------------------------------------ guns --
/** One housing's side profile (gun-local z, y): the front face, the top and bottom running back to an arc about the
 * trunnion, `inset` smaller all round on the outer face (the edges' bevel). */
function housingProfile(inset: number): Array<[number, number]> {
  const G = K30_GUNS, r = G.housingArcR - inset, top = G.housingTopY - inset, bottom = G.housingBottomY + inset;
  const front = G.housingFrontZ - inset;
  const start = Math.PI + Math.asin(-bottom / r), end = Math.PI - Math.asin(top / r);
  const arc: Array<[number, number]> = [];
  for (let k = 0; k <= 6; k++) {
    const a = start + (end - start) * k / 6;
    arc.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return [[front - 0.10, top], [front, top - 0.10], [front, bottom + 0.07], [front - 0.07, bottom], ...arc];
}

function k30Guns(P: TankBuilderPort): void {
  const G = K30_GUNS, n = P.q ? 16 : 10;
  weaponAssembly(P, () => {
    for (const s of [-1, 1]) {
      const x = s * G.gunX, barrel = s < 0 ? 0 : 1;
      // the shaft from the central body into the housing (a body of revolution about the pitch axis)
      P.addGunExtra(cylX(0.09, 0.06, P.q ? 18 : 12), s * 0.655, 0, 0);
      // the housing: inner face full size, the outer face bevelled
      P.addGunExtra(convexBody([
        ...housingProfile(0).map(([z, y]) => [s * G.housingInner, y, z] as P3),
        ...housingProfile(0.025).map(([z, y]) => [s * G.housingOuter, y, z] as P3),
      ]));
      // the trunnion cap and the access cover on the outer face, the case ports under the barrel on the front
      P.addGunExtraDark(cylX(0.10, 0.02, P.q ? 18 : 12), s * (G.housingOuter + 0.008), 0, 0);
      P.addGunExtra(box(0.012, 0.36, 0.44), s * (G.housingOuter + 0.002), -0.02, 0.10);
      for (const y of [-0.17, -0.29]) P.addGunExtraDark(box(0.10, 0.07, 0.02), (s * (G.housingInner + G.housingOuter)) / 2, y, G.housingFrontZ);
      // the collar on the front face, the recoil spring ahead of it with its coils
      P.addGunExtra(cylZ(G.collarR, G.collarFrontZ - G.housingFrontZ + 0.01, n), x, 0, (G.collarFrontZ + G.housingFrontZ - 0.01) / 2);
      P.addGunExtraDark(cylZ(G.springR, G.springFrontZ - G.collarFrontZ + 0.005, n), x, 0, (G.springFrontZ + G.collarFrontZ - 0.005) / 2);
      for (let k = 0; k < 4; k++) {
        P.addGunExtraDark(torus(G.springR, 0.008, n, 4).rotateX(Math.PI / 2), x, 0, G.collarFrontZ + 0.03 + k * 0.045);
      }
      // the barrel group (its own recoil group): the thick root sliding in the spring, the tube, the muzzle brake
      P.add(`gunBarrel${barrel}`, cylZ(G.rootR, G.rootFrontZ - 0.50, n), x, 0, (G.rootFrontZ + 0.50) / 2);
      P.add(`gunBarrel${barrel}`, cylZ(G.barrelR, G.brakeRearZ - G.rootFrontZ + 0.04, n), x, 0, (G.brakeRearZ + G.rootFrontZ) / 2);
      P.add(`gunBarrel${barrel}Dark`, cylZ(G.brakeR, G.muzzleZ - G.brakeRearZ, n), x, 0, (G.muzzleZ + G.brakeRearZ) / 2);
      P.add(`gunBarrel${barrel}Dark`, cylZ(G.brakeR + 0.006, 0.03, n), x, 0, G.brakeRearZ + 0.03);
    }
  }, 'gun', 10);
  P.muzzleZ = G.muzzleZ;
}

export function buildK30Biho(P: TankBuilderPort): void {
  buildK200Hull(P, K30_HULL);
  k30HullFittings(P);
  P.turretG.position.set(...K30_TURRET_PIVOT);
  P.gunG.position.set(...K30_GUN_PIVOT);
  k30Turret(P);
  k30Guns(P);
}

export const K30_BIHO_PROFILES = {
  k30_biho: { build: buildK30Biho },
} as const;
