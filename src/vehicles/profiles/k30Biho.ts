// Release 269, the second air-defence round (owner 2026-11-03: "also add the Japanese type 87 SPAAG, UK Marksman, LVKV
// 9040 (swedish), K30 Bi Ho (korea), PZA Loara (poland)"): the ROK Army's K30 Biho on the K200 family's stretched hull
// (profiles/k200Hull.ts, six road wheels), built from its photographs (docs/references/tanks/k30_biho.md):
// - the long, low turret on the rear half of the hull (photographs 02-08; fix rounds 1-2 after the blind critic and
//   judge): the central body running forward past the gun housings, its deck 0.15 m under their tops, with the EOTS
//   housing rising at its tip, its glass sloped at 45 degrees (01, 04, 05, 07); the rear body behind it with the gunner's
//   sight head on its stand and two hatches on its roof, a storage box overhanging each flank with its underside rising
//   to the rear and two rows of three smoke dischargers on its outer face (02, 04, 05, 07, 08); the bodies down to 4 cm
//   over the hull roof along the turret's length on a dark race collar (05, 07); a separate cage at each rear corner
//   (01, 02, 05, 07); a tall whip at each rear corner (01, 05, 06);
// - the two KCB 30 mm in armoured housings built into the central body's flanks, elevating with the guns (02: a housing
//   tilted with its barrel), rounded on top with a flat bolted face, the barrel's collar in the upper third of a flat
//   front (04, 07), the feed openings in the recess under them (02); each barrel leaving a collar and its recoil spring
//   (07) for the muzzle brake;
// - the TPS-830K search antenna raised over its mast housing at the rear of the roof (01, 02, 05, 08): a wide reflector
//   curved about the vertical on two support arms, its line feed across the front of its upper edge, the IFF box on top;
// - on the hull, the K30's own fittings (07): the access door and the hatch in the left flank, the tools stowed behind them.
// Every firing datum is the layout's (k30BihoLayout.ts), which the spec (k30BihoSpecs.ts) reads: the ring, the trunnion,
// the twin fire axes (spec.gun.muzzles, one barrel group a side). First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS } from './kit.ts';
import { mount } from './fittingMount.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
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
  const T = K30_TURRET, C = T.collar, F = T.front, R = T.rear, X = T.boxes, E = T.eots, n = P.q ? 32 : 18;
  // the dark race collar on the ring, 2 cm into the deck, the bodies standing 1 cm into its top (photograph 07's dark
  // lower turret)
  P.add('turretDark', cylY(C.r, C.r + 0.02, C.topY + 0.02, n), 0, (C.topY - 0.02) / 2, 0);
  // the rear body between the storage boxes: its roof's edges chamfered, its rear-bottom edge chamfered up
  P.add('turret', convexBody(mirrored([R.rearZ, R.frontZ].flatMap((z) => [
    [R.halfX, z === R.rearZ ? 0.20 : R.bottomY, z], [R.halfX, R.eaveY, z], [R.roofHalf, R.roofY, z],
  ] as P3[]).concat([[R.halfX, R.bottomY, R.rearZ + 0.16]]))));
  // the central body, 5 cm into the rear body, running forward past the housings to its nose: the front face with
  // chamfered corners, the chamfer up to the deck 0.15 m under the housings' tops, the bottom 4 cm over the hull roof
  P.add('turret', convexBody(mirrored([
    [F.halfX, F.bottomY, F.rearZ], [F.halfX, F.deckY, F.rearZ], [F.halfX, F.deckY, F.deckFrontZ - 0.04],
    [F.halfX - 0.04, F.deckY, F.deckFrontZ], [F.halfX, F.faceTopY, F.frontZ - 0.06], [F.halfX - 0.06, F.faceTopY, F.frontZ],
    [F.halfX - 0.06, F.bottomY + 0.08, F.frontZ], [F.halfX, F.bottomY + 0.08, F.frontZ - 0.06], [F.halfX, F.bottomY, F.frontZ - 0.12],
    [F.halfX - 0.06, F.bottomY, F.frontZ - 0.08],
  ])));
  // the recess under each housing: two ammunition-feed openings in the central body's flank (photograph 02)
  for (const s of [-1, 1]) for (const z of [0.95, 1.20]) P.add('turretDark', box(0.012, 0.10, 0.18), s * (F.halfX - 0.004), 0.13, z);
  // the storage boxes on the flanks (photographs 04, 07): 2 cm into the rear body, their tops flush with its roof, the
  // outer top edge chamfered, their outer faces' lower edge rising from the front to the rear and the underside sloping
  // in from it to the rear body's foot (07's dark lower turret; no pocket under an overhang)
  for (const s of [-1, 1]) {
    P.add('turret', convexBody([X.frontZ, X.rearZ].flatMap((z) => {
      const bottom = z === X.frontZ ? X.frontBottomY : X.rearBottomY;
      return [[X.inner, X.footY], [X.outer, bottom], [X.outer, X.eaveY], [X.outer - 0.04, X.topY], [X.inner, X.topY]]
        .map(([x, y]) => [s * x, y, z] as P3);
    })));
    // the lid's seam and its two latches, the hinged door on the outer face behind the smoke dischargers
    P.add('turretDark', box(0.012, 0.012, X.frontZ - X.rearZ - 0.08), s * (X.outer + 0.002), X.eaveY - 0.05, (X.frontZ + X.rearZ) / 2);
    for (const z of [-0.20, -0.80]) P.add('turretDark', box(0.03, 0.06, 0.05), s * (X.outer + 0.01), X.eaveY - 0.09, z);
    P.add('turretDetail', box(0.012, 0.26, 0.48), s * (X.outer + 0.002), 0.74, -0.62);
  }
  k30SmokeDischargers(P);
  // the EOTS housing at the nose's tip, rising over the deck: its chin over the nose's chamfer, the glass sloped at 45
  // degrees in two panes, the laser rangefinder's box on its right (photographs 01, 04, 05, 07)
  P.addModuleVisual('optics', 'turret', convexBody(mirrored([
    [E.halfX, E.baseY, E.rearZ], [E.halfX, E.topY, E.rearZ], [E.halfX, E.topY, E.browZ], [E.halfX, E.sillY, E.frontZ],
    [E.halfX, F.faceTopY - 0.01, F.frontZ + 0.01], [E.halfX, E.baseY - 0.005, F.deckFrontZ],
  ])));
  const slope = Math.atan2(E.frontZ - E.browZ, E.topY - E.sillY);
  const paneY = (E.topY + E.sillY) / 2, paneZ = (E.browZ + E.frontZ) / 2, paneL = Math.hypot(E.frontZ - E.browZ, E.topY - E.sillY);
  for (const x of [-0.11, 0.11]) {
    P.addModuleVisual('optics', 'turretGlass', box(0.19, paneL - 0.06, 0.012).rotateX(-slope).translate(x, paneY + 0.003 * Math.sin(slope),
      paneZ + 0.003 * Math.cos(slope)));
  }
  P.addModuleVisual('optics', 'turretDetail', box(0.10, 0.20, 0.26), -(E.halfX + 0.045), F.deckY + 0.09, E.rearZ + 0.16);
  P.addModuleVisual('optics', 'turretGlass', cylZ(0.035, 0.012, 10), -(E.halfX + 0.045), F.deckY + 0.12, E.rearZ + 0.292);
  // the gunner's sight head on its stand at the roof's front left (photographs 02, 04, 05, 07): stand, drum, dome, window
  const S = T.sight, headY0 = S.standTopY - 0.01;
  P.addModuleVisual('optics', 'turretDetail', cylY(S.standR, S.standR + 0.02, S.standTopY - R.roofY + 0.01, P.q ? 18 : 12),
    S.x, (S.standTopY + R.roofY - 0.01) / 2, S.z);
  P.addModuleVisual('optics', 'turretDetail', cylY(S.headR, S.headR, S.headTopY - headY0, P.q ? 22 : 14), S.x, (S.headTopY + headY0) / 2, S.z);
  P.addModuleVisual('optics', 'turretDetail', KIT.lathe([[0.001, 0], [S.headR, 0], [S.headR - 0.03, 0.04], [S.headR - 0.09, 0.07],
    [0.001, 0.08]], P.q ? 22 : 14), S.x, S.headTopY - 0.005, S.z);
  P.addModuleVisual('optics', 'turretGlass', box(0.22, 0.09, 0.08), S.x, (S.headTopY + headY0) / 2 + 0.02, S.z + S.headR - 0.02);
  // the commander's hatch (right) and the radar operator's (left, aft), lifting eyes at the roof's corners
  P.addHatch('turret', cylY(0.27, 0.27, 0.04, P.q ? 22 : 14), -0.42, R.roofY + 0.012, -0.15);
  P.add('turretDark', torus(0.27, 0.011, P.q ? 22 : 14, 4), -0.42, R.roofY + 0.032, -0.15);
  P.addHatch('turret', cylY(0.22, 0.22, 0.04, P.q ? 20 : 12), 0.46, R.roofY + 0.012, -0.62);
  P.add('turretDark', torus(0.22, 0.010, P.q ? 20 : 12, 4), 0.46, R.roofY + 0.032, -0.62);
  for (const s of [-1, 1]) for (const z of [0.10, -0.86]) KIT.liftEye(P, 'turretDetail', s * 0.80, R.roofY + 0.012, z);
  // the whips on the boxes' rear corners, about twice the turret's height (photographs 01, 05, 06)
  for (const s of [-1, 1]) {
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: T.whip.h, r: 0.012, rake: s * -0.05, seed: 2694 + (s > 0 ? 1 : 0) }),
      s * T.whip.x, R.roofY, T.whip.z);
  }
  k30Baskets(P);
  k30Radar(P);
  P.topY = R.roofY + 0.33;
}

/** Two rows of three smoke dischargers on a bracket low on each storage box's outer face, at its front, fired forward,
 * out and up (photographs 02, 04, 05): outboard of the housings' sweep, read from the side and the quarters. */
function k30SmokeDischargers(P: TankBuilderPort): void {
  const X = K30_TURRET.boxes, M = K30_TURRET.smoke;
  const zMid = (M.zs[0] + M.zs[M.zs.length - 1]) / 2, yMid = (M.ys[0] + M.ys[M.ys.length - 1]) / 2;
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.07, M.ys[1] - M.ys[0] + 0.14, M.zs[2] - M.zs[0] + 0.16), s * (X.outer + 0.025), yMid, zMid);
    for (const y of M.ys) for (const z of M.zs) {
      P.add('turretDetail', markSmokeTube(cylZ(0.036, 0.22, 10)), s * M.x, y, z, -M.pitch, s * M.yaw, 0);
    }
  }
}

/** A separate cage at each rear corner (photographs 01, 02, 05, 07): its side standing 0.30 m out from the storage box,
 * its back 0.30 m behind the rear face, three rails, the posts, the floor's slats; one welded cage a corner, its inner
 * rails 1 cm into the box's outer face, its sloping underside and the rear face. */
function k30Baskets(P: TankBuilderPort): void {
  const K = K30_TURRET.basket, R = K30_TURRET.rear, X = K30_TURRET.boxes;
  const bar = (a: P3, b: P3): void => P.add('turretOpenLattice', beamBetween(a, b, 0.016, 6));
  // where the floor's height meets the box's sloping underside, 1 cm in
  const outerBottom = (z: number): number => X.frontBottomY + (X.frontZ - z) * (X.rearBottomY - X.frontBottomY) / (X.frontZ - X.rearZ);
  const floorIn = (z: number): number => X.inner + (K.bottomY - X.footY) / (outerBottom(z) - X.footY) * (X.outer - X.inner) - 0.01;
  const box = K.boxFace - 0.01, face = R.rearZ + 0.01, ys = [K.topY, (K.topY + K.bottomY) / 2, K.bottomY];
  for (const s of [-1, 1]) {
    const o = s * K.outer, i = s * K.inner;
    for (const y of ys) {
      bar([s * (y === K.bottomY ? floorIn(K.frontZ) : box), y, K.frontZ], [o, y, K.frontZ]);
      bar([o, y, K.frontZ], [o, y, K.rearZ]);
      bar([o, y, K.rearZ], [i, y, K.rearZ]);
      bar([i, y, K.rearZ], [i, y, face]);
    }
    for (const [x, z] of [[o, K.frontZ], [o, (K.frontZ + K.rearZ) / 2], [o, K.rearZ], [(o + i) / 2, K.rearZ], [i, K.rearZ]] as const) {
      bar([x, K.bottomY, z], [x, K.topY, z]);
    }
    // the floor: along the box's underside and the rear face, two slats across the side, one across the back
    bar([s * floorIn(K.frontZ), K.bottomY, K.frontZ], [s * floorIn(face), K.bottomY, face]);
    bar([s * floorIn(face), K.bottomY, face], [i, K.bottomY, face]);
    for (const z of [-0.80, -1.10]) bar([s * floorIn(z), K.bottomY, z], [o, K.bottomY, z]);
    bar([s * 0.70, K.bottomY, face], [s * 0.70, K.bottomY, K.rearZ]);
  }
}

/** The TPS-830K raised over its mast housing (photographs 02, 05): the housing standing 0.55 m on the roof, the turntable
 * and the rotator, two support arms to the antenna's back housing, the reflector, the line feed on its struts and the
 * IFF box on the top. */
function k30Radar(P: TankBuilderPort): void {
  const R = K30_TURRET.radar, roof = K30_TURRET.rear.roofY, z = R.mastZ;
  P.add('turretDetail', convexBody(mirrored([[0.21, roof - 0.01, z - 0.22], [0.21, roof - 0.01, z + 0.20],
    [0.17, R.housingTopY, z - 0.18], [0.17, R.housingTopY, z + 0.16]])));
  P.add('turretDark', box(0.30, 0.012, 0.012), 0, R.housingTopY - 0.12, z + 0.170);
  P.add('turretDark', cylY(0.18, 0.18, R.turntableTopY - R.housingTopY + 0.01, P.q ? 20 : 12), 0, (R.turntableTopY + R.housingTopY) / 2, z);
  P.add('turretDetail', cylY(0.12, 0.14, 0.10, P.q ? 16 : 10), 0, R.turntableTopY + 0.045, z);
  // the back housing over the rotator, its front 5 mm into the reflector's back, and its two support arms
  const backZ = R.faceZ - R.thick + 0.005 - 0.10, backBottom = R.centreY - 0.10, backTop = R.centreY + 0.13;
  P.add('turretDetail', box(0.66, backTop - backBottom, 0.20), 0, (backTop + backBottom) / 2, backZ);
  P.add('turretDetail', cylY(0.06, 0.06, backBottom - R.turntableTopY - 0.06, 10), 0, (backBottom + R.turntableTopY + 0.07) / 2, z);
  for (const s of [-1, 1]) {
    P.add('turretDark', beamBetween([s * 0.05, R.turntableTopY + 0.05, z], [s * 0.28, backBottom + 0.02, backZ], 0.022, 8));
  }
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
/** One housing's side profile (gun-local z, y): the flat front round the collar, its top front edge and its rear top
 * rounded, the rear chamfered under the trunnion's reach; `inset` smaller all round on the outer face (the edges' bevel). */
function housingProfile(inset: number, steps: number): Array<[number, number]> {
  const G = K30_GUNS, top = G.housingTopY - inset, bottom = G.housingBottomY + inset;
  const front = G.housingFrontZ - inset, rear = G.housingRearZ + inset;
  const out: Array<[number, number]> = [];
  const arc = (cz: number, cy: number, r: number, a0: number, a1: number): void => {
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (a1 - a0) * k / steps;
      out.push([cz + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  out.push([front, bottom + 0.04], [front - 0.04, bottom]);
  out.push([-0.22, bottom], [rear, -0.18]);
  arc(rear + G.rearRound, top - G.rearRound, G.rearRound, Math.PI, Math.PI / 2);
  arc(front - G.frontRound, top - G.frontRound, G.frontRound, Math.PI / 2, 0);
  return out;
}

function k30Guns(P: TankBuilderPort): void {
  const G = K30_GUNS, n = P.q ? 16 : 10, steps = P.q ? 4 : 2;
  weaponAssembly(P, () => {
    for (const s of [-1, 1]) {
      const x = s * G.gunX, barrel = s < 0 ? 0 : 1;
      // the shaft from the central body into the housing (a body of revolution about the pitch axis)
      P.addGunExtra(cylX(0.09, 0.06, P.q ? 18 : 12), s * 0.655, 0, 0);
      // the housing, rounded on top: inner face full size, the outer face bevelled
      P.addGunExtra(convexBody([
        ...housingProfile(0, steps).map(([z, y]) => [s * G.housingInner, y, z] as P3),
        ...housingProfile(0.025, steps).map(([z, y]) => [s * G.housingOuter, y, z] as P3),
      ]));
      // the bolted cover on the outer face and its bolt heads
      P.addGunExtra(box(0.012, 0.34, 0.56), s * (G.housingOuter + 0.002), -0.11, 0.0);
      for (const y of [0.02, -0.24]) for (const z of [-0.22, 0, 0.22]) {
        P.addGunExtraDark(cylX(0.016, 0.012, 8), s * (G.housingOuter + 0.009), y, z);
      }
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
