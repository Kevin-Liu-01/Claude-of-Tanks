// Release 268: the Pantsir-S1 combat module on the tracked GM-352M1E (Engineering Technologies 2012, photographs 01-15
// in docs/references/tanks/pantsir_s1.md; photograph 16's 2013 dish variant is not this vehicle). The low octagonal
// platform on the ring, the central body, the tracking radar's big drum forward on it with its round yellow radome
// facing ahead on a stem, the flat search-radar panel on its mast at the back. Either side of the drum a 2A38M
// twin-barrel 30 mm cannon on the trunnion, and outboard of each gun a bank of six 57E6 containers, two columns of
// three, on its cradle box with the armoured side box under its back (photographs 01-03, 08-10).
//
// Combat wiring (gm352Layout.ts PANTSIR, read by gm352AirDefenseSpecs.ts): the ring at GM352_RING, the trunnion at
// gunPivot, one fire axis per gun on its inner bore (barrel groups 0 and 1), the twelve launch exits on the containers'
// front covers. The banks pitch with the guns over the system's -5..+85 degree envelope; they stand short behind the
// trunnion and outboard of the platform, so their backs stay over the deck at every elevation.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS } from './kit.ts';
import { mount } from './fittingMount.ts';
import { weaponAssembly } from './weaponStock.ts';
import { convexSolid } from './gm352Chassis.ts';
import { cannon2A38M, octagonPrism, roundedSideBox } from './tunguskaM.ts';
import { GM352_RING, PANTSIR as M, rackMouths } from './gm352Layout.ts';

type P3 = readonly [number, number, number];

function moduleBody(P: TankBuilderPort): void {
  const { platform, body, radar } = M;
  const n = P.q ? 32 : 18;
  P.add('turret', KIT.cylY(0.88, 0.90, 0.08, n), 0, 0, 0);
  P.add('turret', octagonPrism(platform.bottomApothem, platform.topApothem, platform.bottomY, platform.topY));
  // the central body: its roof edges chamfered, the back sloped
  const c = 0.05;
  P.add('turret', convexSolid([-1, 1].flatMap((s) => [
    [s * body.halfWidth, body.bottomY, body.rearZ], [s * body.halfWidth, body.topY - 0.18, body.rearZ],
    [s * (body.halfWidth - c), body.topY, body.rearZ + 0.20], [s * (body.halfWidth - c), body.topY, body.frontZ],
    [s * body.halfWidth, body.topY - c, body.frontZ], [s * body.halfWidth, body.bottomY, body.frontZ],
  ] as P3[])));
  for (const s of [-1, 1]) {
    // the trunnion's bearing boss on the body side, the side's access panel behind it
    P.add('turret', KIT.cylX(0.14, 0.07, P.q ? 24 : 14), s * (body.halfWidth + 0.025), M.gunPivot[1], M.gunPivot[2]);
    P.add('turretDetail', KIT.box(0.024, 0.40, 0.62), s * (body.halfWidth + 0.002), 0.56, -0.66);
  }
  // the tracking radar: its drum over the body's front on a stem from the platform, the radome, the rim
  P.add('turret', KIT.cylZ(radar.r, radar.frontZ - radar.rearZ, n), 0, radar.y, (radar.rearZ + radar.frontZ) / 2);
  // its pedestal from the body's front out under the drum (the elevation drive's housing)
  P.add('turret', KIT.box(0.36, radar.y - radar.r - platform.topY + 0.08, 0.50), 0,
    (radar.y - radar.r + platform.topY) / 2, body.frontZ + 0.20);
  P.add('turretDark', KIT.torus(radar.r - 0.012, 0.02, n, 6).rotateX(Math.PI / 2), 0, radar.y, radar.frontZ + 0.004);
  const dome = KIT.lathe([[radar.r - 0.03, 0], [radar.r - 0.07, 0.05], [0.32, 0.085], [0.16, 0.103], [0.001, 0.108]], n);
  P.add('turretCanvasPale', dome.rotateX(Math.PI / 2), 0, radar.y, radar.frontZ - 0.005);
  // the small antenna housing on the drum's upper left with its own radome cap
  P.add('turretDetail', KIT.box(0.18, 0.16, 0.26), 0.30, radar.y + 0.38, radar.frontZ - 0.17);
  P.add('turretCanvasPale', KIT.cylZ(0.065, 0.03, P.q ? 16 : 10), 0.30, radar.y + 0.38, radar.frontZ - 0.03);
}

function searchRadar(P: TankBuilderPort): void {
  const { searchRadar: S, body } = M, n = P.q ? 24 : 14;
  // the panel stows with its antenna face to the rear, leaning 6 degrees back (photographs 05-07)
  const tilt = 0.10, cy = (S.panelBottomY + S.panelTopY) / 2, h = S.panelTopY - S.panelBottomY;
  P.add('turret', KIT.cylY(S.mastR, S.mastR + 0.02, S.mastTopY - body.topY + 0.06, n), 0, (S.mastTopY + body.topY - 0.06) / 2, S.z);
  P.add('turret', KIT.box(S.halfWidth * 2, h, S.depth), 0, cy, S.z, tilt, 0, 0);
  /** panel-local (up the face, out of the back) to turret-local (y, z) */
  const at = (dy: number, dz: number): [number, number] =>
    [cy + dy * Math.cos(tilt) - dz * Math.sin(tilt), S.z + dy * Math.sin(tilt) + dz * Math.cos(tilt)];
  const back = -S.depth / 2;
  // the antenna face's frame and centre strip
  for (const dx of [-1, 1]) {
    const [y, z] = at(0, back - 0.007);
    P.add('turretDark', KIT.box(0.05, h - 0.06, 0.03), dx * (S.halfWidth - 0.04), y, z, tilt, 0, 0);
  }
  for (const dy of [-1, 1]) {
    const [y, z] = at(dy * (h / 2 - 0.035), back - 0.007);
    P.add('turretDark', KIT.box(S.halfWidth * 2 - 0.06, 0.05, 0.03), 0, y, z, tilt, 0, 0);
  }
  const [sy, sz] = at(0.08, back - 0.008);
  P.add('turretDetail', KIT.box(0.16, h - 0.36, 0.03), 0, sy, sz, tilt, 0, 0);
  // the IFF rod along the face's foot on three stand-off brackets
  const [by, bz] = at(-h / 2 + 0.11, back - 0.025);
  for (const x of [-0.40, 0, 0.40]) P.add('turretDark', KIT.box(0.04, 0.04, 0.07), x, by, bz, tilt, 0, 0);
  const [ry, rz] = at(-h / 2 + 0.11, back - 0.06);
  P.add('turretDark', KIT.cylX(0.025, S.halfWidth * 2 - 0.10, 8), 0, ry, rz);
  // the stiffening ribs on the panel's front
  for (const x of [-0.42, 0, 0.42]) {
    const [y, z] = at(0, -back + 0.012);
    P.add('turretDetail', KIT.box(0.06, h - 0.08, 0.04), x, y, z, tilt, 0, 0);
  }
}

function moduleKit(P: TankBuilderPort): void {
  const { body, platform } = M;
  // the gunner's (front) and the commander's (rear) hatches down the body's right side behind the drum (the stations
  // internalLayoutRegistry.ts gives the two-man module: gunner front right, commander rear right), their vision blocks
  for (const z of [-0.08, -0.50]) P.add('turretHatch', KIT.cylY(0.19, 0.20, 0.035, P.q ? 24 : 12), -0.26, body.topY + 0.012, z);
  KIT.periscope(P, 'turretDetail', -0.26, body.topY + 0.02, 0.17);
  KIT.periscope(P, 'turretDetail', 0.08, body.topY + 0.02, -0.50);
  // the two whips on the back of the body
  for (const [x, seed] of [[0.40, 2682], [-0.40, 2683]] as const) {
    P.add('turretDetail', KIT.cylY(0.04, 0.05, 0.05, 12), x, body.topY - 0.05, -1.08);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 1.20, r: 0.011, rake: 0.04, seed }), x, body.topY - 0.025, -1.08);
  }
  // the guns' ammunition boxes on the platform either side of the body's back, the cross stencilled on each
  for (const s of [-1, 1]) {
    P.add('turret', KIT.box(0.34, 0.34, 0.40), s * 0.78, platform.topY + 0.16, -0.92);
    for (const a of [-0.65, 0.65]) {
      P.add('turretDetail', KIT.box(0.012, 0.03, 0.30), s * 0.954, platform.topY + 0.16, -0.92, a, 0, 0);
    }
  }
  // the body's back: the equipment box and its lid
  P.add('turretDetail', KIT.box(0.70, 0.30, 0.16), 0, 0.45, body.rearZ - 0.06);
}

function cannons(P: TankBuilderPort): void {
  // the journals run from inside the body side to the bank's inner middle container
  for (const side of [-1, 1]) cannon2A38M(P, side, M.gunX, M.boreDx, M.muzzleZ, [0.48, 1.16]);
  P.muzzleZ = M.muzzleZ;
}

function missileBanks(P: TankBuilderPort): void {
  const { bank: B } = M, n = P.q ? 18 : 10;
  const length = B.mouthZ - 0.01 - B.tubeRearZ;
  for (const side of [-1, 1]) {
    const mirror = (a: number, b: number): [number, number] => side < 0 ? [-b, -a] : [a, b];
    // the cradle box under the containers' back half, and the armoured side box below its outer edge
    const [cx0, cx1] = mirror(B.cradleInnerX, B.cradleOuterX);
    P.addModuleVisual('missileRack', 'gunMount', KIT.box(cx1 - cx0, B.cradleTopY - B.cradleBottomY, B.cradleFrontZ - B.cradleRearZ),
      (cx0 + cx1) / 2, (B.cradleTopY + B.cradleBottomY) / 2, (B.cradleFrontZ + B.cradleRearZ) / 2);
    const [sx0, sx1] = mirror(B.sideInnerX, B.sideOuterX);
    P.addModuleVisual('missileRack', 'gunMount',
      roundedSideBox(sx0, sx1, B.sideRearZ, B.sideFrontZ, B.sideBottomY, B.sideTopY, 0.08, P.q ? 4 : 2));
    // its raised lid panel on the outer face
    P.add('gunMount', roundedSideBox(side < 0 ? -B.sideOuterX - 0.012 : B.sideOuterX - 0.008,
      side < 0 ? -B.sideOuterX + 0.008 : B.sideOuterX + 0.012, B.sideRearZ + 0.12, B.sideFrontZ - 0.12,
      B.sideBottomY + 0.07, B.sideTopY - 0.07, 0.05, P.q ? 3 : 1));
    for (const tx of B.tubeXs) for (const ty of B.tubeYs) {
      const x = side * tx;
      P.addModuleVisual('missileRack', 'gunMount', KIT.cylZ(B.tubeR, length, n), x, ty, B.tubeRearZ + length / 2);
      P.add('gunMountDark', KIT.cylZ(B.tubeR - 0.013, 0.02, n), x, ty, B.mouthZ - 0.01);
      P.add('gunMountDark', KIT.cylZ(B.tubeR - 0.02, 0.016, n), x, ty, B.tubeRearZ - 0.002);
      if (P.q) P.add('gunMount', KIT.cylZ(B.tubeR + 0.007, 0.06, n), x, ty, B.mouthZ - 0.14);
    }
    // the two frames that hold the six containers together
    const fx = side * (B.tubeXs[0] + B.tubeXs[1]) / 2, fy = (B.tubeYs[0] + B.tubeYs[2]) / 2;
    const fw = B.tubeXs[1] - B.tubeXs[0] + 2 * B.tubeR + 0.03, fh = B.tubeYs[2] - B.tubeYs[0] + 2 * B.tubeR + 0.03;
    for (const z of [0.62, 1.50]) P.add('gunMount', KIT.box(fw, fh, 0.05), fx, fy, z);
  }
  P.turretG.userData.airDefenseLauncher = { launcherTubes: rackMouths(B.tubeXs, B.tubeYs, B.mouthZ).length };
}

/** The Pantsir-S1 module on a GM-352M1E hull (the caller builds the chassis first). */
export function buildPantsirModule(P: TankBuilderPort): void {
  P.turretG.position.set(...GM352_RING);
  P.gunG.position.set(...M.gunPivot);
  moduleBody(P);
  searchRadar(P);
  moduleKit(P);
  // VH.14 (roofWeaponPolicy.ts): two 2A38M and twelve 57E6; no machine gun
  weaponAssembly(P, () => cannons(P), 'gun');
  weaponAssembly(P, () => missileBanks(P), 'missileRack');
  P.topY = M.searchRadar.panelTopY;
}
