// Release 268: the Pantsir-S1 combat module on the tracked GM-352M1E (Engineering Technologies 2012, photographs 01-15
// in docs/references/tanks/pantsir_s1.md; photograph 16's 2013 dish variant is not this vehicle). The low octagonal
// platform on the ring, the central body, the tracking radar's big drum forward on it with its round yellow radome
// facing ahead on a stem, the search radar's landscape box antenna on its mast at the back with the IFF horns under
// its back face. Either side of the drum a 2A38M twin-barrel 30 mm cannon, and outboard of each gun a bank of six 57E6
// containers, two columns of three, on its cradle, held by two thin bands, the long flat armoured slab over its
// outer side's back and the ribbed casing on its inner side (photographs 01-03, 08-12).
//
// Combat wiring (gm352Layout.ts PANTSIR, read by gm352AirDefenseSpecs.ts): the ring at GM352_RING, the trunnion at
// gunPivot, one fire axis per gun on its inner bore (barrel groups 0 and 1), the twelve launch exits on the containers'
// domed front covers. The banks pitch with the guns over the system's -5..+85 degree envelope on a trunnion at the
// module's back, under the slabs' back ends: everything stands ahead of it or close round it, so nothing swings down
// into the deck, and the search radar stands between the guns' receivers.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS } from './kit.ts';
import { mount } from './fittingMount.ts';
import { weaponAssembly } from './weaponStock.ts';
import { convexSolid, roundedSideBox } from './gm352Chassis.ts';
import { cannon2A38M, octagonPrism, packBand } from './tunguskaM.ts';
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
    P.add('turretDetail', KIT.box(0.024, 0.40, 0.56), s * (body.halfWidth + 0.002), 0.56, -0.16);
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
  // the box antenna stows leaning 6 degrees back, its back face (the fans, the IFF horns) to the rear (photographs
  // 05-07, 09, 12): 1.24 x 0.85 x 0.45 m, landscape, its two top corners chamfered
  const tilt = 0.10, cy = (S.panelBottomY + S.panelTopY) / 2, h = S.panelTopY - S.panelBottomY, w = S.halfWidth;
  P.add('turret', KIT.cylY(S.mastR, S.mastR + 0.02, S.mastTopY - body.topY + 0.06, n), 0, (S.mastTopY + body.topY - 0.06) / 2, S.z);
  /** panel-local (x across, up the face, out of the back) to turret-local */
  const at = (x: number, dy: number, dz: number): P3 =>
    [x, cy + dy * Math.cos(tilt) - dz * Math.sin(tilt), S.z + dy * Math.sin(tilt) + dz * Math.cos(tilt)];
  const outline: [number, number][] = [[-w, -h / 2], [w, -h / 2], [w, h / 2 - S.chamfer], [w - S.chamfer, h / 2],
    [-w + S.chamfer, h / 2], [-w, h / 2 - S.chamfer]];
  // raised equipment on its mast (open air under it, as photographs 07 and 09 show): the stock kept drawn at every range,
  // not the armour body's own mesh
  P.add('turretCupola', convexSolid([-1, 1].flatMap((side) => outline.map(([x, dy]) => at(x, dy, side * S.depth / 2)))));
  const back = -S.depth / 2;
  // the back face: a column of fan grilles down each side, the centre's raised panels and the horn bracket's spine
  for (const side of [-1, 1]) {
    P.add('turretDark', KIT.box(0.20, h - 0.20, 0.02), ...at(side * (w - 0.15), -0.04, back - 0.006), tilt, 0, 0);
    if (P.q) for (let k = 0; k < 6; k++) {
      P.add('turretDetail', KIT.cylZ(0.055, 0.012, 12), ...at(side * (w - 0.15), -h / 2 + 0.16 + k * 0.105, back - 0.012), tilt, 0, 0);
    }
    P.add('turretDetail', KIT.box(0.24, h - 0.24, 0.025), ...at(side * 0.22, -0.02, back - 0.008), tilt, 0, 0);
  }
  P.add('turretDetail', KIT.box(0.16, 0.30, 0.05), ...at(0, 0.12, back - 0.02), tilt, 0, 0);
  P.add('turretDetail', KIT.box(0.12, h * 0.55, 0.06), ...at(0, -h / 2 + h * 0.27, back - 0.025), tilt, 0, 0);
  // the IFF antenna under the back face (photograph 12): its bracket on the face's foot and two horizontal rows on it,
  // each a rod with two fat bodies and a flared horn at one end out past the box's side, the upper row's to the left,
  // the lower row's (under the box's foot) to the right
  P.add('turretDetail', KIT.box(0.16, 0.32, 0.20), ...at(0, -h / 2 + 0.02, back - 0.09), tilt, 0, 0);
  for (const [side, dy] of [[1, -h / 2 + 0.10], [-1, -h / 2 - 0.04]] as const) {
    const [, y, z] = at(0, dy, back - 0.12), q = P.q ? 14 : 8;
    P.add('turretDetail', KIT.cylX(0.022, 1.24, q), 0, y, z);
    for (const bx of [-0.26, 0.26]) P.add('turretDetail', KIT.cylX(0.05, 0.22, q), bx, y, z);
    const horn = KIT.lathe([[0.022, 0], [0.03, 0.06], [0.068, 0.22], [0.074, 0.24], [0.001, 0.24]], q);
    P.add('turretDetail', horn.rotateZ(-side * Math.PI / 2), side * 0.615, y, z);
  }
  // the front face's stiffening frame
  for (const side of [-1, 1]) {
    P.add('turretDetail', KIT.box(0.05, h - 0.30, 0.03), ...at(side * (w - 0.04), -0.08, -back + 0.01), tilt, 0, 0);
  }
  P.add('turretDetail', KIT.box(2 * w - 0.12, 0.05, 0.03), ...at(0, -h / 2 + 0.05, -back + 0.01), tilt, 0, 0);
}

function moduleKit(P: TankBuilderPort): void {
  const { body, platform } = M;
  // the gunner's (front) and the commander's (rear) hatches down the body's right side behind the drum (the stations
  // internalLayoutRegistry.ts gives the two-man module: gunner front right, commander rear right), their vision blocks
  for (const z of [-0.08, -0.50]) P.add('turretHatch', KIT.cylY(0.19, 0.20, 0.035, P.q ? 24 : 12), -0.26, body.topY + 0.012, z);
  KIT.periscope(P, 'turretDetail', -0.26, body.topY + 0.02, 0.17);
  KIT.periscope(P, 'turretDetail', 0.08, body.topY + 0.02, -0.50);
  // the two whips on the body's roof ahead of the search radar, inboard of the guns
  for (const [x, seed] of [[0.44, 2682], [-0.44, 2683]] as const) {
    P.add('turretDetail', KIT.cylY(0.04, 0.05, 0.05, 12), x, body.topY, -0.30);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 1.20, r: 0.011, rake: 0.04, seed }), x, body.topY + 0.025, -0.30);
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
  // the journals run from inside the body side to the bank's cradle; the receivers stand out along the bores
  for (const side of [-1, 1]) cannon2A38M(P, side, M.gunX, M.boreDx, M.muzzleZ, [0.48, 1.16], M.gunDz);
  P.muzzleZ = M.muzzleZ;
}

function missileBanks(P: TankBuilderPort): void {
  const { bank: B } = M, n = P.q ? 18 : 10;
  const length = B.mouthZ - B.tubeRearZ - 0.02;
  for (const side of [-1, 1]) {
    const mirror = (a: number, b: number): [number, number] => side < 0 ? [-b, -a] : [a, b];
    // the cradle under the containers
    const [cx0, cx1] = mirror(B.cradleInnerX, B.cradleOuterX);
    P.addModuleVisual('missileRack', 'gunMount', KIT.box(cx1 - cx0, B.cradleTopY - B.cradleBottomY, B.cradleFrontZ - B.cradleRearZ),
      (cx0 + cx1) / 2, (B.cradleTopY + B.cradleBottomY) / 2, (B.cradleFrontZ + B.cradleRearZ) / 2);
    // the armoured slab over the outer side's back, its recessed rounded panel (photograph 09)
    const [sx0, sx1] = mirror(B.slabInnerX, B.slabOuterX);
    P.addModuleVisual('missileRack', 'gunMount',
      roundedSideBox(sx0, sx1, B.slabRearZ, B.slabFrontZ, B.slabBottomY, B.slabTopY, 0.10, P.q ? 4 : 2));
    const face = side < 0 ? -B.slabOuterX : B.slabOuterX;
    P.add('gunMountDark', roundedSideBox(face - 0.004, face + 0.004, B.slabRearZ + 0.30, B.slabFrontZ - 0.30,
      B.slabBottomY + 0.12, B.slabTopY - 0.14, 0.10, P.q ? 4 : 2));
    const [p0, p1] = side < 0 ? [face - 0.008, face + 0.002] : [face - 0.002, face + 0.008];
    P.add('gunMount', roundedSideBox(p0, p1, B.slabRearZ + 0.34, B.slabFrontZ - 0.34, B.slabBottomY + 0.16,
      B.slabTopY - 0.18, 0.08, P.q ? 4 : 2));
    // the ribbed casing along the inner column's inner side
    const inner = side * (B.tubeXs[0] - B.tubeR - 0.025), y0 = B.tubeYs[0] - 0.05, y1 = B.tubeYs[2] + 0.05;
    P.add('gunMount', KIT.box(0.05, y1 - y0, B.cradleFrontZ - 0.10), inner, (y0 + y1) / 2, B.cradleFrontZ / 2 + 0.05);
    if (P.q) for (let z = 0.20; z < B.cradleFrontZ - 0.05; z += 0.16) {
      P.add('gunMountDark', KIT.box(0.012, y1 - y0 - 0.06, 0.03), inner - side * 0.028, (y0 + y1) / 2, z);
    }
    for (const tx of B.tubeXs) for (const ty of B.tubeYs) {
      const x = side * tx;
      P.addModuleVisual('missileRack', 'gunMount', KIT.cylZ(B.tubeR, length, n), x, ty, B.tubeRearZ + length / 2);
      // the shallow domed front cover over the launch exit (its crown the exit), the collar behind it
      const dome = KIT.lathe([[B.tubeR - 0.006, 0], [B.tubeR - 0.03, 0.012], [0.03, 0.019], [0.001, 0.02]], n);
      P.add('gunMountDark', dome.rotateX(Math.PI / 2), x, ty, B.mouthZ - 0.02);
      P.add('gunMountDark', KIT.cylZ(0.032, 0.003, n), x, ty, B.mouthZ - 0.0015);
      P.add('gunMountDark', KIT.cylZ(B.tubeR - 0.02, 0.016, n), x, ty, B.tubeRearZ - 0.002);
      if (P.q) P.add('gunMount', KIT.cylZ(B.tubeR + 0.007, 0.06, n), x, ty, B.mouthZ - 0.06);
    }
    // two thin bands round the six containers
    const fx = side * (B.tubeXs[0] + B.tubeXs[1]) / 2, fy = (B.tubeYs[0] + B.tubeYs[2]) / 2;
    const fw = B.tubeXs[1] - B.tubeXs[0] + 2 * B.tubeR, fh = B.tubeYs[2] - B.tubeYs[0] + 2 * B.tubeR;
    for (const z of [B.slabFrontZ + 0.10, B.mouthZ - 0.25]) packBand(P, fx, fy, fw, fh, z);
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
