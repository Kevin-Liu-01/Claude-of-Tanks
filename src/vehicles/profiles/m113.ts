// The Australian Army's M113s (release 269; Main's ruling 2026-11-02 on the owner's "flesh out south african and
// australian tank trees"; docs/references/tanks/m113a1_fsv.md and the packets beside it): one first-party build of the
// M113A1 hull and its three Australian fits.
// - fsv: the M113A1 Fire Support Vehicle (15 converted at Bandiana from 1970, six in Vietnam in 1971, reserve to 1986):
//   the Alvis Saladin's rounded turret with its 76 mm L5A1 under a canvas mantlet cover, three dischargers a side, the
//   commander's cupola; the trim vane folded on the glacis.
// - mrv: the M113A1 Medium Reconnaissance Vehicle (48, 1978-96): the Scorpion's faceted turret with the 76 mm L23A1, its
//   searchlight box and four dischargers a side; slab buoyancy pods on the hull's sides.
// - as4: the M113AS4 (340 from 2007): the hull stretched 0.666 m with a sixth road wheel a side, bolted ceramic appliqué on
//   the sides and glacis, the Tenix one-man turret with its 12.7 mm M2 and sight box, armoured fuel tanks either side of
//   the ramp.
// - all three (owner 2026-11-03: "make our m113s look much much cooler annd have more firepoweer/tow missiles"): a twin TOW
//   launcher on the turret's right flank (an armoured two-tube box on the FSV and MRV, two bare TOW-2 canisters in a
//   cradle on the AS4; the mouths are fleetLauncherMuzzles.ts's), two spare rounds on the FSV's and MRV's roofs, a .50 on
//   their cupolas.
// - a3: the US Army's M113A3 (from 1987; usaM113Specs.ts; the owner 2026-11-03: "make a USA m113 variant, that plays
//   similar to the ares apc"): the A1's hull with the A3's armoured fuel tanks either side of the ramp, the commander's
//   cupola as its one traversing station with the M2 .50 behind an ACAV-style gun shield, a tarp roll and the cargo hatch
//   on the roof; no TOW.
// - m741: the M163 VADS's carrier (an M113A1; buildM113HullSteps alone, the Vulcan turret the twin-aa lane's): no cupola,
//   the A1's internal fuel, the turret's race cut into the roof's rear half where the cargo hatch was and the commander's
//   round hatch behind it at the right rear (m741Datums.ts; the owner's photo of 2026-11-04); no hull whips, the M163's
//   antennas on its turret (Commons photos 03 and 04); `a2FuelTanks` hangs the M113A2's armoured fuel tanks either side
//   of the ramp over the track's ends (the M163A1's and A2's M741A1; Commons photo 07 of the rear), off by default.
// Datums: the published M113A1 (4.863 m long, 2.686 m over the tracks, 0.43 m clearance, 0.381 m tracks, five 0.61 m road
// wheels a side, the sprocket ahead and the idler astern, no return rollers) and the AS4's side profile (Commons,
// scaled on its 5.53 m hull: the roof 1.96 m over its appliqué, the turret's top 2.60 m, the wheels 0.70 m apart, the ring
// 2.55 m behind the nose); the FSV's 2.78 m to its cupola (RM Sotheby's). A +Z hull's left is +X: the driver sits at the
// front left, the engine at the front right.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.ts';
import { antennaPart } from './antennaPart.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { weaponAssembly } from './weaponStock.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

import { M113_BASE as BASE, M113_TOW, m113Datums, type M113Mark, type M113TowMark } from '../m113Datums.ts';
import { M741_COMMANDER_HATCH, M741_RING } from '../m741Datums.ts';

/** The marks this file draws the hull of: the four, and the M163 VADS's carrier, the M741. */
type M113HullMark = M113Mark | 'm741';

/** The twin TOW launcher on the turret's right flank: on the FSV and MRV two tubes in an armoured box with its sight and
 * front collars, on the AS4 two bare canisters in a cradle; two arms from the turret wall carry either. */
function addTowLauncher(P: TankBuilderPort, mark: M113TowMark): void {
  const { box, cylZ } = KIT;
  const T = M113_TOW[mark], seg = P.q ? 20 : 14;
  const z0 = T.mouthZ - T.len, zMid = T.mouthZ - T.len / 2, yMid = (T.ys[0] + T.ys[1]) / 2;
  if (mark === 'as4') {
    // the cradle's inner plate, its two arms to the wall, the canisters with their end collars and the dark mouths
    const plateX = T.x + 0.13;
    P.addEquipment('turret', box(0.04, 0.52, 0.86), plateX, yMid, zMid);
    for (const z of [zMid - 0.30, zMid + 0.30]) P.addEquipment('turret', box(T.wallX - plateX + 0.01, 0.12, 0.14), (plateX + T.wallX) / 2, yMid, z);
    // (the front collar stands 4.5 cm proud of the canister, its dark bore at the launch exit fleetLauncherMuzzles.ts
    // fires from, 5 cm ahead of mouthZ as on the FSV and MRV: flush with the canister the exit hung 43 mm in air)
    for (const y of T.ys) {
      P.addEquipment('turret', cylZ(0.11, T.len, seg), T.x, y, zMid);
      for (const z of [z0 + 0.04, zMid, T.mouthZ + 0.015]) P.add('turretDetail', cylZ(0.124, 0.06, seg), T.x, y, z);
      P.add('turretDark', cylZ(0.09, 0.012, seg), T.x, y, T.mouthZ + 0.046);
      P.add('turretDetail', box(0.02, 0.03, T.len * 0.8), T.x + 0.11, y, zMid);
    }
    // the canisters' straps over the cradle, the umbilical's cable to the turret
    for (const z of [zMid - 0.30, zMid + 0.30]) P.add('turretDark', box(0.27, 0.53, 0.04), T.x + 0.005, yMid, z);
    P.add('turretDark', cylZ(0.018, 0.40, 8), plateX - 0.03, yMid - 0.20, zMid - 0.40);
    return;
  }
  // the armoured box over both tubes, its rear cap, the two arms to the turret wall, the bands round it
  const h = T.ys[1] - T.ys[0] + 0.26, w = 0.28;
  P.addEquipment('turret', box(w, h, T.len), T.x, yMid, zMid);
  P.addEquipment('turret', box(w - 0.04, h - 0.04, 0.05), T.x, yMid, z0 - 0.02);
  const inner = T.x + w / 2;
  for (const z of [zMid - 0.32, zMid + 0.30]) {
    P.addEquipment('turret', box(T.wallX - inner + 0.02, 0.12, 0.16), (inner + T.wallX) / 2, yMid, z);
    P.add('turretDark', box(w + 0.02, h + 0.02, 0.035), T.x, yMid, z);
  }
  // the two front collars round the mouths and their dark bores, the box's divider
  for (const y of T.ys) {
    P.add('turretDetail', cylZ(0.105, 0.05, seg), T.x, y, T.mouthZ + 0.02);
    P.add('turretDark', cylZ(0.085, 0.012, seg), T.x, y, T.mouthZ + 0.046);
  }
  P.add('turretDark', box(w - 0.02, 0.02, 0.012), T.x, yMid, T.mouthZ + 0.006);
  // the TOW sight on the box's top front, its glass forward, and the hinged armour lid's hinge line on top
  P.addEquipment('turret', box(0.18, 0.14, 0.30), T.x + 0.02, yMid + h / 2 + 0.07, T.mouthZ - 0.22);
  P.add('turretGlass', box(0.13, 0.08, 0.012), T.x + 0.02, yMid + h / 2 + 0.07, T.mouthZ - 0.065);
  P.add('turretDark', cylZ(0.016, T.len - 0.40, 8), T.x - w / 2 + 0.03, yMid + h / 2 + 0.006, zMid - 0.10);
}

/** Spare TOW rounds strapped on the hull: two encased rounds lying fore and aft on blocks over the roof's rear left (the
 * FSV's and MRV's), aft of the launcher's sweep and inboard of the whips. */
function addSpareTows(P: TankBuilderPort, x: number, y: number, z: number): void {
  const { box, cylZ } = KIT;
  const seg = P.q ? 18 : 12;
  for (const dx of [-0.12, 0.12]) {
    P.addEquipment('hull', cylZ(0.11, 1.17, seg), x + dx, y + 0.13, z);
    for (const dz of [-0.50, 0.50]) P.add('hullDetail', cylZ(0.122, 0.05, seg), x + dx, y + 0.13, z + dz);
    P.add('hullDark', cylZ(0.088, 0.012, seg), x + dx, y + 0.13, z + 0.586);
  }
  for (const dz of [-0.35, 0.35]) {
    P.addEquipment('hull', box(0.52, 0.05, 0.10), x, y + 0.025, z + dz);
    P.add('hullDark', box(0.50, 0.03, 0.04), x, y + 0.255, z + dz);
  }
}

/** The M113 hull, its running gear, its fittings and the mark's hull kit, no turret: each mark's first four steps, and the
 * M163 VADS's M741 carrier alone (the twin-aa lane: `yield* buildM113HullSteps(P, 'm741')`, its turret on M741_RING;
 * `{ a2FuelTanks: true }` for the M741A1's external tanks). */
export function* buildM113HullSteps(P: TankBuilderPort, mark: M113HullMark,
  opts: { readonly a2FuelTanks?: boolean } = {}): TankProfileBuild {
  const { box, cylX, cylY, torus, xform, buildRunningGear, headlight, liftEye, periscope } = KIT;
  const slab = orientedSlab;
  const as4 = mark === 'as4', a3 = mark === 'a3', m741 = mark === 'm741';
  // (the M741 on the FSV's M113A1 hull datums: its ring is m741Datums.ts's)
  const D = m113Datums(m741 ? 'fsv' : mark), B = BASE;
  // ---------------------------------------------------------------- hull --
  // the upper hull: the flat roof, the glacis falling to the nose; the vertical sides from the roof to their foot over
  // the tracks; the rear plate and ramp vertical
  const top = (z: number): number => (z <= D.glacisTopZ ? B.roofY : B.roofY - (z - D.glacisTopZ) / B.glacisRun * (B.roofY - B.noseY));
  // (269 release check: at sideLowY over the tracks the sides stood in the track band) the foot steps up to shroudY outboard
  // of the tub, over the tracks
  const upper = (z: number): SolidSection => {
    const foot = Math.min(B.shroudY, top(z) - 0.03);
    return { z, ring: [[-B.hw, foot], [-B.tubHw, foot], [-B.tubHw, B.sideLowY], [B.tubHw, B.sideLowY], [B.tubHw, foot],
      [B.hw, foot], [B.hw, top(z) - 0.02], [B.hw - 0.02, top(z)], [-(B.hw - 0.02), top(z)], [-B.hw, top(z) - 0.02]] as SectionPoint[] };
  };
  P.add('hull', sectionSolid([D.sternZ, D.glacisTopZ, D.noseZ].map(upper)));
  // the lower hull between the tracks: the lower front plate rising to the nose, the belly, the rear lip
  const belly = (z: number): number => {
    if (z >= D.noseZ - 0.40) return B.bellyY + (z - (D.noseZ - 0.40)) / 0.40 * (B.sideLowY - B.bellyY);
    if (z <= D.sternZ + 0.12) return B.bellyY + ((D.sternZ + 0.12) - z) / 0.12 * 0.18;
    return B.bellyY;
  };
  P.add('hull', sectionSolid([D.sternZ, D.sternZ + 0.12, D.noseZ - 0.40, D.noseZ - 0.01].map((z) => ({ z,
    ring: [[-B.tubHw, belly(z)], [B.tubHw, belly(z)], [B.tubHw, B.sideLowY + 0.02], [-B.tubHw, B.sideLowY + 0.02]] as SectionPoint[] }))));
  // the sides' foot: a lip over the track along each side
  for (const s of [-1, 1] as const) {
    P.add('hullDetail', box(0.05, 0.05, D.length - 0.30), s * (B.hw - 0.02), B.shroudY + 0.02, -0.05);
  }
  const glacis = Math.atan2(B.roofY - B.noseY, B.glacisRun);
  const onGlacis = (t: number, lift = 0): [number, number] => {
    const z = D.noseZ - t * B.glacisRun, y = B.noseY + t * (B.roofY - B.noseY);
    return [y + Math.cos(glacis) * lift, z + Math.sin(glacis) * lift];
  };
  yield 'buildM113Hull';

  // ---------------------------------------------------------------- running gear (no return rollers) --
  buildRunningGear(P, {
    style: 'dished', wheelR: B.wheelR, wheelW: 0.26, wheelY: B.wheelY, xc: B.xc, wheelZs: [...D.wheelZs],
    sprocket: { z: D.noseZ - B.sprocketBack, y: 0.63, r: 0.24 }, idler: { z: D.sternZ + B.idlerFromRear, y: 0.56, r: 0.24 },
    rollers: [], trackW: B.trackW, topY: 0.74, botY: 0.03, contactZF: D.wheelZs[0], contactZR: D.wheelZs.at(-1),
    paintedEnds: true, coveredTop: false, arms: true, sprocketTeeth: true,
  });
  P.mats.rubber.color.setHex(0x2f312b);
  yield 'buildM113RunningGear';

  // ---------------------------------------------------------------- hull fittings --
  // the trim vane folded flat over the glacis on its hinges and stays (the FSV's and the AS4's photographs)
  {
    const [y0, z0] = onGlacis(0.10, 0.03), [y1, z1] = onGlacis(0.86, 0.03);
    const len = Math.hypot(z1 - z0, y1 - y0);
    P.addEquipment('hull', xform(box(2.14, 0.035, len), 0, 0, 0, glacis, 0, 0), 0, (y0 + y1) / 2, (z0 + z1) / 2);
    for (const x of [-0.70, 0.70]) {
      const [hy, hz] = onGlacis(0.10, 0.06);
      P.add('hullDark', cylX(0.035, 0.22, 10), x, hy, hz);
    }
    for (const x of [-0.98, 0.98]) {
      const [sy, sz] = onGlacis(0.55, 0.07);
      P.add('hullDark', box(0.05, 0.05, 0.30), x, sy, sz, glacis, 0, 0);
    }
  }
  // the lamp clusters on the glacis' top corners in their guards (headlight and blackout lamp), the towing eyes on the
  // nose
  for (const s of [-1, 1] as const) {
    const [ly, lz] = onGlacis(0.93, 0.08);
    P.addEquipment('hull', box(0.30, 0.16, 0.14), s * 1.02, ly, lz);
    for (const dx of [-0.07, 0.07]) headlight(P, s * 1.02 + dx, ly + 0.01, lz + 0.08, 0, 0.045);
    P.add('hullDark', box(0.34, 0.02, 0.18), s * 1.02, ly + 0.10, lz + 0.02);
    P.add('hullDark', box(0.10, 0.10, 0.12), s * 0.70, B.noseY - 0.08, D.noseZ - 0.02);
    P.add('hullDark', torus(0.05, 0.016, 12, 6), s * 0.70, B.noseY - 0.15, D.noseZ + 0.03, Math.PI / 2, 0, 0);
  }
  // the driver's hatch at the front left and its periscopes; the engine's louvred grille and exhaust at the front right
  P.addCupola('hull', cylY(0.30, 0.31, 0.05, P.q ? 20 : 14), 0.72, B.roofY + 0.025, D.glacisTopZ - 0.30);
  for (const dx of [-0.16, 0, 0.16]) periscope(P, 'hullDetail', 0.72 + dx, B.roofY + 0.03, D.glacisTopZ - 0.04, 0);
  P.add('hullDark', box(0.80, 0.012, 0.70), -0.62, B.roofY + 0.006, D.glacisTopZ - 0.50);
  for (let k = 0; k < 6; k++) P.add('hullDetail', box(0.80, 0.014, 0.04), -0.62, B.roofY + 0.013, D.glacisTopZ - 0.20 - k * 0.12);
  P.add('hullDark', box(0.08, 0.18, 0.40), -B.hw - 0.035, B.roofY - 0.25, D.glacisTopZ - 0.55);
  // the rear plate: the ramp's outline, its door, the tail lights, the towing pintle
  P.add('hullDark', box(1.70, 0.012, 0.012), 0, B.roofY - 0.10, D.sternZ - 0.006);
  for (const s of [-1, 1] as const) P.add('hullDark', box(0.012, B.roofY - 0.62, 0.012), s * 0.85, (B.roofY + 0.52) / 2, D.sternZ - 0.006);
  P.add('hullDark', box(0.60, 0.012, 0.012), 0.30, 1.45, D.sternZ - 0.008);
  P.add('hullDark', box(0.012, 0.95, 0.012), 0.60, 0.98, D.sternZ - 0.008);
  for (const s of [-1, 1] as const) {
    P.add('hullDark', box(0.16, 0.14, 0.05), s * 1.10, 1.45, D.sternZ - 0.02);
    P.add('hullGlass', box(0.10, 0.05, 0.012), s * 1.10, 1.45, D.sternZ - 0.05);
    liftEye(P, 'hullDetail', s * 1.10, B.roofY + 0.01, D.sternZ + 0.20, s * 2.8);
    liftEye(P, 'hullDetail', s * 1.10, B.roofY + 0.01, D.glacisTopZ - 0.12, s * 0.3);
  }
  P.add('hullDark', box(0.14, 0.14, 0.12), 0, 0.62, D.sternZ - 0.05);
  yield 'buildM113HullFittings';

  // ---------------------------------------------------------------- the mark's hull kit --
  // the armoured fuel tanks either side of the ramp, their bottoms sloping up to the rear (the AS4's rear and side
  // photographs; the A3's the same pair)
  const addFuelTanks = (): void => {
    for (const s of [-1, 1] as const) {
      const x0 = s * 0.92, x1 = s * 1.27, z0 = D.sternZ, z1 = D.sternZ - 0.52;
      const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
      P.addEquipment('hull', slab([lo, 0.82, z0], [hi, 0.82, z0], [hi, 1.20, z1], [lo, 1.20, z1],
        [lo, 1.80, z0], [hi, 1.80, z0], [hi, 1.80, z1], [lo, 1.80, z1]));
      P.add('hullDark', box(hi - lo + 0.01, 0.012, 0.52), s * 1.095, 1.70, D.sternZ - 0.26);
      P.add('hullDark', cylY(0.05, 0.05, 0.03, 10), s * 1.095, 1.815, D.sternZ - 0.30);
    }
  };
  // the M113A2's armoured fuel tanks either side of the ramp (Commons photo 07 of the M163's rear: 0.43 m deep, the 17 in
  // the A2's tanks add to its length in TM 9-2350-277). The twin-aa lane's r7 read of 07 (builder V and the coordinator):
  // they sit low on the plate just over the track's ends, their bottoms 0.76 m up at the top of the idlers' rims so the
  // idlers and the track's rear wraps show under them; 0.50 m tall, a vertical rear face for the lower half carrying a
  // tail light, then a face sloping 45 degrees forward over the upper half to a short flat top at the plate; on the right
  // tank a flat hinged lid on the slope carrying the filler cap, on the left a recessed channel down the slope between two
  // ridges and the cap above it; two struts under each to the rear plate
  const addA2FuelTanks = (): void => {
    const z0 = D.sternZ, z1 = D.sternZ - 0.43, yLo = 0.76, yTop = 1.26, yFace = yLo + 0.5 * (yTop - yLo), run = yTop - yFace;
    const slope = Math.atan2(yTop - yFace, run), slopeLen = Math.hypot(yTop - yFace, run);
    const onSlope = (u: number, out: number): [number, number] => [yFace + u * (yTop - yFace) + out * Math.cos(slope),
      z1 + u * run - out * Math.sin(slope)];
    const strutY = 0.50, strutZ = z1 + 0.07, strutLen = Math.hypot(yLo - strutY, z0 - strutZ);
    // the tank's side profile [z, y], extruded across x (sectionSolid's stations along +z, turned a quarter about y)
    const profile = [[z0, yLo], [z1, yLo], [z1, yFace], [z1 + run, yTop], [z0, yTop]] as const;
    const ring = profile.map(([z, y]) => [-z, y] as SectionPoint);
    let area = 0;
    for (let i = 0; i < ring.length; i++) area += ring[i][0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * ring[i][1];
    const wound = area > 0 ? ring : [...ring].reverse();
    for (const s of [-1, 1] as const) {
      const lo = s < 0 ? -1.31 : 0.86, hi = s < 0 ? -0.86 : 1.31, x = s * 1.085, w = hi - lo;
      P.addEquipment('hull', xform(sectionSolid([{ z: lo, ring: wound }, { z: hi, ring: wound }]), 0, 0, 0, 0, Math.PI / 2, 0));
      if (s < 0) {
        // the right tank's flat hinged lid on the slope, its hinge along the slope's top edge, the filler cap on it
        const [ly, lz] = onSlope(0.5, 0.006);
        P.add('hullDetail', box(w - 0.06, 0.012, slopeLen - 0.06), x, ly, lz, -slope, 0, 0);
        const [hy, hz] = onSlope(0.97, 0.012);
        P.add('hullDark', cylX(0.015, w - 0.10, 8), x, hy, hz);
        const [cy, cz] = onSlope(0.55, 0.024);
        P.add('hullDark', cylY(0.05, 0.05, 0.025, 10), x, cy, cz, -slope, 0, 0);
      } else {
        // the left tank's recessed channel down the slope between two ridges, the filler cap on the flat top
        const [ry, rz] = onSlope(0.5, 0.012), [gy, gz] = onSlope(0.5, 0.001);
        for (const dx of [-0.055, 0.055]) P.add('hullDetail', box(0.03, 0.03, slopeLen - 0.04), x + dx, ry, rz, -slope, 0, 0);
        P.add('hullDark', box(0.08, 0.004, slopeLen - 0.06), x, gy, gz, -slope, 0, 0);
        P.add('hullDark', cylY(0.05, 0.05, 0.03, 10), x, yTop + 0.012, (z1 + run + z0) / 2);
      }
      P.add('hullDark', box(0.18, 0.09, 0.012), x, yLo + 0.10, z1 - 0.004);
      P.add('hullGlass', box(0.12, 0.04, 0.012), x, yLo + 0.10, z1 - 0.010);
      for (const dx of [-0.15, 0.15]) {
        P.add('hullDark', box(0.04, 0.025, strutLen), x + dx, (yLo + strutY) / 2, (z0 + strutZ) / 2,
          Math.atan2(yLo - strutY, z0 - strutZ), 0, 0);
      }
    }
  };
  if (mark === 'mrv') {
    // the buoyancy pods: two slab panels on each side, the full side from the glacis' top to the rear plate (the Perth and
    // Puckapunyal MRVs; the folded trim vane holds the glacis)
    for (const s of [-1, 1] as const) {
      const x = s * (B.hw + 0.07), zMid = (D.glacisTopZ + D.sternZ) / 2;
      for (const [z0, z1] of [[D.glacisTopZ - 0.05, zMid + 0.01], [zMid - 0.01, D.sternZ + 0.12]] as const) {
        P.addEquipment('hull', box(0.14, 0.78, z0 - z1), x, B.shroudY + 0.40, (z0 + z1) / 2);
        P.add('hullDark', box(0.15, 0.012, z0 - z1 - 0.04), x, 1.76, (z0 + z1) / 2);
      }
      for (const z of [D.glacisTopZ - 0.40, zMid, D.sternZ + 0.50]) P.add('hullDark', cylX(0.025, 0.02, 8), x + s * 0.075, 1.62, z);
    }
  } else if (as4) {
    // the bolted ceramic appliqué: panels on each side in two courses and over the glacis, their bolt heads in rows
    for (const s of [-1, 1] as const) {
      const x = s * (B.hw + 0.035);
      const panels = 4, run = D.glacisTopZ - (D.sternZ + 0.20), pz = run / panels;
      for (let k = 0; k < panels; k++) {
        const z0 = D.glacisTopZ - k * pz - 0.006, z1 = z0 - pz + 0.012;
        P.addExternalArmor('hull', box(0.06, 0.84, z0 - z1), x, B.shroudY + 0.43, (z0 + z1) / 2);
        for (const by of [1.14, 1.66]) for (const f of [0.2, 0.8]) P.add('hullDark', cylX(0.022, 0.016, 8), x + s * 0.035, by, z1 + (z0 - z1) * f);
      }
    }
    // (the appliqué over the glacis' lower half, under the vane's hinges)
    P.addExternalArmor('hull', xform(box(2.30, 0.05, 0.40), 0, 0, 0, glacis, 0, 0), 0, onGlacis(0.25, 0.025)[0], onGlacis(0.25, 0.025)[1]);
    addFuelTanks();
    // bins on the roof's rear corners
    for (const s of [-1, 1] as const) P.addEquipment('hull', box(0.52, 0.26, 0.70), s * 0.90, B.roofY + 0.13, D.sternZ + 0.50);
  }
  if (a3) {
    addFuelTanks();
    // the cargo hatch's outline on the roof's rear and a rolled tarp strapped across the roof ahead of the rear plate
    P.add('hullDark', box(1.30, 0.012, 1.10), 0, B.roofY + 0.006, D.sternZ + 1.05);
    P.addEquipment('hull', cylX(0.11, 1.40, P.q ? 16 : 10), 0, B.roofY + 0.11, D.sternZ + 0.32);
    for (const x of [-0.45, 0.45]) P.add('hullDark', box(0.04, 0.025, 0.24), x, B.roofY + 0.215, D.sternZ + 0.32);
  }
  if (m741) {
    // the M163's turret race over the roof cut where the cargo hatch was; the commander's round hatch behind it, shut, its
    // hinge forward
    const R = M741_RING, H = M741_COMMANDER_HATCH;
    P.add('hullDetail', cylY(R.diameter / 2, R.diameter / 2 + 0.02, R.raceTopY - R.roofY, P.q ? 32 : 20), R.x, (R.roofY + R.raceTopY) / 2, R.z);
    P.addCupola('hull', cylY(H.r - 0.01, H.r, 0.05, P.q ? 20 : 14), H.x, B.roofY + 0.025, H.z);
    P.add('hullDark', cylX(0.025, 0.30, 8), H.x, B.roofY + 0.06, H.z + H.r - 0.02);
    if (opts.a2FuelTanks) addA2FuelTanks();
  }
  // (the AS4's whips stand over its bins: its spares stay inside; the A3 and the M741 carry no TOW)
  if (mark === 'fsv' || mark === 'mrv') addSpareTows(P, 0.60, B.roofY, D.sternZ + 0.85);
  // the whips: two on the roof's rear corners (none on the M741: the M163's ride its turret, and a left-rear whip stood
  // 1.90 m from the ring, inside the Vulcan's 1.99 m sweep)
  if (!m741) for (const s of [-1, 1] as const) {
    P.add('hullDetail', cylY(0.04, 0.05, 0.07, 10), s * 0.95, B.roofY + 0.035, D.sternZ + (as4 ? 1.00 : 0.30));
    P.addEquipment('hull', antennaPart(cylY(0.012, 0.015, 2.2, 8)), s * 0.95, B.roofY + 1.17, D.sternZ + (as4 ? 1.00 : 0.30), 0, 0, s * 0.03);
  }
  yield 'buildM113HullKit';
}

function* buildM113Steps(P: TankBuilderPort, mark: M113Mark): TankProfileBuild {
  yield* buildM113HullSteps(P, mark);
  const { box, cylX, cylY, cylZ, xform, buildGun, liftEye, periscope } = KIT;
  const D = m113Datums(mark), B = BASE;
  const as4 = mark === 'as4', a3 = mark === 'a3';
  // ---------------------------------------------------------------- turret --
  P.turretG.position.set(0, B.roofY, D.ringZ);
  if (mark === 'fsv') {
    // the Saladin's turret: a rounded drum on its ring, sloping in to a flat roof, its front flattened behind the mantlet
    P.add('turret', cylY(0.80, 0.82, 0.06, P.q ? 28 : 18), 0, 0.03, 0);
    P.add('turret', cylY(0.68, 0.80, 0.50, P.q ? 28 : 18), 0, 0.31, -0.04);
    P.add('turret', box(1.00, 0.44, 0.20), 0, 0.28, 0.66);
    // the commander's cupola on the right, its MG and the loader's hatch on the left
    P.addCupola('turret', cylY(0.25, 0.26, 0.10, P.q ? 20 : 14), -0.30, 0.61, -0.20);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      P.add('turretGlass', box(0.06, 0.035, 0.02), -0.30 + Math.sin(a) * 0.25, 0.63, -0.20 + Math.cos(a) * 0.25, 0, a, 0);
    }
    P.addCupola('turret', cylY(0.24, 0.24, 0.04, P.q ? 20 : 14), 0.30, 0.58, -0.30);
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', scale: 0.82, elev: 0.06, shield: false, ammo: true,
      seed: 1131, feed: 'left', working: true, ridingCradle: true });
    mg.name = 'm113a1_fsv_cupola_machine_gun';
    mg.position.set(-0.30, 0.68, -0.20);
    P.turretG.add(mg);
    // three dischargers a side on the front flanks
    for (const s of [-1, 1] as const) {
      P.addEquipment('turret', box(0.10, 0.20, 0.20), s * 0.62, 0.40, 0.42);
      for (const [dx, dy] of [[0, 0.08], [-0.06, -0.02], [0.06, -0.02]] as const) {
        P.add('turretDetail', markSmokeTube(cylZ(0.035, 0.20, 12)), s * (0.66 + dx), 0.48 + dy, 0.50, -0.60, s * 0.35, 0);
      }
    }
    periscope(P, 'turretDetail', 0.20, 0.56, 0.30, 0);
    liftEye(P, 'turretDetail', 0.50, 0.56, -0.40, 2.5);
    liftEye(P, 'turretDetail', -0.55, 0.56, 0.20, 0.5);
    // the 76 mm L5A1: the mantlet's canvas cover round its root and the short tube, no fume extractor
    P.gunG.position.set(0, 0.28, 0.72);
    P.addGunExtra(box(0.46, 0.34, 0.20), 0, 0, 0.06);
    P.add('gunMountCloth', cylZ(0.15, 0.30, P.q ? 18 : 12, 0.10), 0, 0, 0.30);
    buildGun(P, { len: 1.66, r: 0.055, evac: null, baseR: 0.10, collar: true });
    muzzleBore(P, { len: 1.66, r: 0.055 });
    P.muzzleZ = 1.66;
  } else if (mark === 'mrv') {
    // the Scorpion's turret: faceted aluminium, its upper and lower front plates sloping back, the sides leaning in, a
    // flat roof; the bustle box with the jerrycan
    const sec = (z: number, hw: number, yb: number, yt: number): SolidSection => ({ z, ring: [[-hw, yb], [hw, yb],
      [hw - 0.10, yt], [-(hw - 0.10), yt]] as SectionPoint[] });
    P.add('turret', cylY(0.76, 0.78, 0.06, P.q ? 28 : 18), 0, 0.03, 0);
    P.add('turret', sectionSolid([sec(-0.80, 0.72, 0.04, 0.48), sec(0.30, 0.80, 0.04, 0.50), sec(0.62, 0.74, 0.12, 0.44),
      sec(0.80, 0.50, 0.20, 0.30)]));
    P.addEquipment('turret', box(0.90, 0.36, 0.30), 0, 0.24, -0.95);
    const jc = FITTINGS.jerryCans({ mats: P.mats, count: 2, seed: 1132 });
    jc.position.set(-0.25, 0.25, -0.98);
    P.turretG.add(jc);
    // the commander's cupola on the left rear, the gunner's sight on the right, the searchlight box on the left front
    P.addCupola('turret', cylY(0.25, 0.26, 0.10, P.q ? 20 : 14), 0.32, 0.53, -0.30);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      P.add('turretGlass', box(0.06, 0.035, 0.02), 0.32 + Math.sin(a) * 0.25, 0.55, -0.30 + Math.cos(a) * 0.25, 0, a, 0);
    }
    P.addEquipment('turret', box(0.24, 0.16, 0.30), -0.36, 0.56, 0.12);
    P.add('turretGlass', box(0.16, 0.06, 0.012), -0.36, 0.58, 0.272);
    P.addEquipment('turret', box(0.30, 0.24, 0.24), 0.40, 0.62, 0.30);
    P.add('turretGlass', box(0.24, 0.16, 0.012), 0.40, 0.62, 0.425);
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', scale: 0.80, elev: 0.06, shield: false, ammo: true,
      seed: 1133, feed: 'left', working: true, ridingCradle: true });
    mg.name = 'm113a1_mrv_cupola_machine_gun';
    mg.position.set(0.32, 0.60, -0.30);
    P.turretG.add(mg);
    // four dischargers a side on the front cheeks
    for (const s of [-1, 1] as const) {
      P.addEquipment('turret', box(0.10, 0.16, 0.24), s * 0.72, 0.36, 0.48);
      for (let k = 0; k < 4; k++) {
        P.add('turretDetail', markSmokeTube(cylZ(0.035, 0.20, 12)), s * 0.76, 0.32 + (k % 2) * 0.09, 0.42 + Math.floor(k / 2) * 0.12, -0.55, s * 0.35, 0);
      }
    }
    liftEye(P, 'turretDetail', 0.55, 0.50, -0.60, 2.5);
    liftEye(P, 'turretDetail', -0.55, 0.50, -0.60, 3.8);
    // the 76 mm L23A1: a short tube in a narrow mantlet, a collar at its middle
    P.gunG.position.set(0, 0.26, 0.72);
    P.addGunExtra(box(0.36, 0.26, 0.24), 0, 0, 0.06);
    buildGun(P, { len: 1.42, r: 0.05, evac: null, baseR: 0.09, collar: true });
    P.add('gun', cylZ(0.075, 0.12, P.q ? 18 : 12), 0, 0, 0.62);
    muzzleBore(P, { len: 1.42, r: 0.05 });
    P.muzzleZ = 1.42;
  } else if (a3) {
    // the commander's cupola on its ring, its vision blocks round it and its hatch lid thrown open astern on its hinge
    P.add('turret', cylY(0.42, 0.44, 0.08, P.q ? 24 : 16), 0, 0.04, 0);
    P.add('turret', cylY(0.34, 0.38, 0.16, P.q ? 24 : 16), 0, 0.16, 0);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (Math.cos(a) > 0.6) continue;
      P.add('turretGlass', box(0.07, 0.04, 0.02), Math.sin(a) * 0.365, 0.18, Math.cos(a) * 0.365, 0, a, 0);
    }
    P.add('turretDark', cylX(0.025, 0.30, 8), 0, 0.25, -0.36);
    P.addEquipment('turret', xform(cylY(0.30, 0.30, 0.035, P.q ? 20 : 14), 0, 0, 0, Math.PI / 2 - 0.22, 0, 0), 0, 0.53, -0.42);
    // the ACAV-style gun shield: a front plate either side of the gun's window, bridged under and over it, and a wing on
    // each flank on a stay from the ring
    for (const s of [-1, 1] as const) {
      P.addEquipment('turret', box(0.33, 0.52, 0.025), s * 0.235, 0.50, 0.38);
      P.addEquipment('turret', box(0.025, 0.46, 0.28), s * 0.40, 0.47, 0.24);
      P.addEquipment('turret', box(0.06, 0.18, 0.06), s * 0.40, 0.16, 0.24);
    }
    P.addEquipment('turret', box(0.14, 0.14, 0.025), 0, 0.31, 0.38);
    P.addEquipment('turret', box(0.14, 0.20, 0.025), 0, 0.66, 0.38);
    // the M2 .50 on its cradle behind the shield: the receiver, the ammunition can on its left, the spade grips, the barrel
    // through the window to its flash hider
    P.gunG.position.set(0, 0.46, 0.34);
    P.addGunExtra(box(0.13, 0.15, 0.40), 0, 0, -0.22);
    P.addGunExtra(box(0.10, 0.18, 0.26), 0.12, -0.03, -0.20);
    for (const s of [-1, 1] as const) P.add('gunDark', cylY(0.012, 0.012, 0.10, 8), s * 0.04, 0, -0.44);
    P.add('gunDark', cylZ(0.04, 0.24, 10), 0, 0, 0.10);
    buildGun(P, { len: 1.14, r: 0.022, evac: null, baseR: 0.04, collar: false });
    P.add('gunDark', cylZ(0.032, 0.10, 10), 0, 0, 1.09);
    muzzleBore(P, { len: 1.14, r: 0.022 });
    P.muzzleZ = 1.14;
  } else {
    // the Tenix one-man turret: a low faceted box on its ring, the 12.7 mm M2 in its slot on the left front, the EOS sight
    // box over the front and the hatch on the right
    const sec = (z: number, hw: number, yt: number): SolidSection => ({ z, ring: [[-hw, 0.02], [hw, 0.02], [hw - 0.06, yt],
      [-(hw - 0.06), yt]] as SectionPoint[] });
    P.add('turret', cylY(0.62, 0.64, 0.06, P.q ? 24 : 16), 0, 0.03, 0);
    P.add('turret', sectionSolid([sec(-0.66, 0.58, 0.42), sec(0.30, 0.66, 0.46), sec(0.58, 0.56, 0.36), sec(0.70, 0.40, 0.26)]));
    P.addEquipment('turret', box(0.40, 0.20, 0.34), -0.12, 0.56, 0.24);
    P.add('turretGlass', box(0.28, 0.10, 0.012), -0.12, 0.58, 0.412);
    P.addCupola('turret', cylY(0.25, 0.26, 0.05, P.q ? 20 : 14), -0.18, 0.465, -0.30);
    // (its lid shut on the ring)
    P.addEquipment('turret', cylY(0.23, 0.24, 0.03, P.q ? 20 : 14), -0.18, 0.505, -0.30);
    for (const s of [-1, 1] as const) {
      P.addEquipment('turret', box(0.10, 0.14, 0.20), s * 0.62, 0.30, 0.20);
      for (let k = 0; k < 3; k++) P.add('turretDetail', markSmokeTube(cylZ(0.033, 0.18, 12)), s * 0.66, 0.30, 0.12 + k * 0.08, -0.55, s * 0.35, 0);
    }
    // the M2 in its cradle, its barrel out of the turret's front
    P.gunG.position.set(0.22, 0.26, 0.56);
    P.addGunExtra(box(0.20, 0.18, 0.30), 0, 0, -0.05);
    P.add('gunDark', cylZ(0.04, 0.24, 10), 0, 0, 0.22);
    buildGun(P, { len: 1.10, r: 0.022, evac: null, baseR: 0.04, collar: false });
    P.add('gunDark', cylZ(0.032, 0.10, 10), 0, 0, 1.05);
    muzzleBore(P, { len: 1.10, r: 0.022 });
    P.muzzleZ = 1.10;
    // the kangaroo on the turret's front face, left of the M2's cradle (turret_kangaroo_2021; at 0.36 m it stood over the
    // face's top edge in air, which the sealed check read as see-through)
    P.decal('turret', 'flag', 'au-army-kangaroo', 0.17, [-0.12, 0.14, 0.704], 0);
  }
  // the launcher is damageable weapon stock: its mouths are the drawn terminals the launches leave from
  if (mark !== 'a3') weaponAssembly(P, () => addTowLauncher(P, mark));
  P.turretG.userData.m113TurretReceipt = Object.freeze({
    mark, roadWheels: D.wheelZs.length, length: D.length,
    turret: mark === 'fsv' ? 'saladin' : mark === 'mrv' ? 'scorpion' : a3 ? 'acav-cupola' : 'tenix', buoyancyPods: mark === 'mrv',
    applique: as4, fuelTanks: as4 || a3, towTubes: a3 ? 0 : 2,
  });
  P.topY = B.roofY;
  yield 'buildM113Turret';
}

export const buildM113A1Fsv = steppedBuilder((P: TankBuilderPort) => buildM113Steps(P, 'fsv'));
export const buildM113A1Mrv = steppedBuilder((P: TankBuilderPort) => buildM113Steps(P, 'mrv'));
export const buildM113AS4 = steppedBuilder((P: TankBuilderPort) => buildM113Steps(P, 'as4'));
export const buildM113A3 = steppedBuilder((P: TankBuilderPort) => buildM113Steps(P, 'a3'));
