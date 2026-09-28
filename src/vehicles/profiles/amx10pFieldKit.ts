// Owner-requested field equipment for the tier-X Dragar, inspired by Warrior
// MILAN X's dressed silhouette. This kit is not a historical configuration claim.
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { AMX10P25_SKIRT_CONTOUR, AMX10P25_SKIRT_STATIONS, amx10p25SkirtPoint } from '../amx10pSkirtLayout.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylZ, torus } = KIT;

function rack(P: TankBuilderPort, owner: 'hull' | 'turret', x: number, y: number,
  z: number, width: number, depth: number, height: number): void {
  const bucket = `${owner}OpenLattice`;
  P.addEquipment(bucket, KIT.openRackGrid(width, depth, .022, 4, 3), x, y, z);
  for (const side of [-1, 1]) {
    for (const level of [height * .45, height]) {
      P.addEquipment(bucket, box(width, .022, .022), x, y + level, z + side * depth / 2);
      P.addEquipment(bucket, box(.022, .022, depth), x + side * width / 2, y + level, z);
    }
    for (const end of [-1, 1])
      P.addEquipment(bucket, box(.024, height, .024), x + side * width / 2,
        y + height / 2, z + end * depth / 2);
  }
}

function sideArmorAndCages(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    // Two continuous, folded standoff assemblies like the Warrior's upper
    // corrugated armor and lower slat screens, fitted to this shorter hull.
    // The moving shoe envelope ends at x=±1.43; even the inner armor skin is
    // outboard of it. Only the upper brackets reach in to the hull stiffeners.
    P.addExternalArmor('hull', sectionSolid(AMX10P25_SKIRT_STATIONS.map(([z], station) => {
      const ring = AMX10P25_SKIRT_CONTOUR.map((_, corner) => {
        const [x, y] = amx10p25SkirtPoint(side, station, corner);
        return [x, y] as const;
      });
      return { z, ring: side < 0 ? ring.reverse() : ring };
    })));
    // Continuous mounting ledge joins the original fender shoulder to the
    // inner skirt skin. It sits above the loaded track's complete sweep;
    // the stand-off space above it and the lower slat openings stay open.
    P.addEquipment('hullDetail', box(.29, .045, 5.32), side * 1.425, 1.255, 0);
    for (const z of [-2.32, -1.24, -.16, .92, 1.70]) {
      for (const y of [1.30, 1.70])
        P.addEquipment('hullDetail', box(.36, .065, .10), side * 1.455, y, z);
      // Visible vertical joint straps and paired fasteners on the armor face.
      P.addEquipment('hullDetail', box(.030, .66, .040), side * 1.72, 1.44, z);
      for (const y of [1.19, 1.68])
        P.addEquipment('hullDark', cylX(.023, .023, 8), side * 1.741, y, z);
    }
    // Open steel slats: actual air between rails, never a painted solid panel.
    for (let row = 0; row < 8; row++) {
      const y = .49 + row * .081;
      P.addEquipment('hullOpenLattice', box(.035, .024, 5.30), side * 1.70, y, 0);
      // The short ends fold inward only to x=±1.51, clear of both end wheels.
      for (const end of [-1, 1])
        P.addEquipment('hullOpenLattice', box(.20, .024, .030), side * 1.60, y, end * 2.65);
    }
    for (let post = 0; post < 14; post++)
      P.addEquipment('hullOpenLattice', box(.035, .68, .030), side * 1.70, .81, -2.65 + post * 5.30 / 13);
    for (const end of [-1, 1])
      P.addEquipment('hullOpenLattice', box(.035, .68, .035), side * 1.51, .81, end * 2.65);
  }
}

function sidePanniers(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    for (const z of [-2.12, -1.30, -.48]) {
      // Cargo is seated above the standoff assemblies rather than hidden
      // behind their armor. Hatches and the hull's exhaust retain their space.
      rack(P, 'hull', side * 1.57, 1.78, z, .28, .67, .39);
      for (const dz of [-.24, .24])
        P.addEquipment('hullDetail', box(.28, .055, .07), side * 1.57, 1.77, z + dz);
      KIT.stowage(P, 'hullCloth', () => .5,
        [[side * 1.57, 1.965, z, .23, .31, .59]]);
    }
    // Low-profile service cases fill the forward shoulder rather than
    // covering the engine louvers or driver periscopes.
    P.addEquipment('hullDetail', box(.14, .24, .47), side * 1.326, 1.51, 1.19);
    P.addEquipment('hullDetail', box(.15, .028, .48), side * 1.326, 1.644, 1.19);
    for (const dz of [-.16, .16])
      P.addEquipment('hullDark', box(.022, .08, .045), side * 1.404, 1.59, 1.19 + dz);
  }
}

function rearDeckEquipment(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    // Paired cans sit behind, not on, the rear troop hatch leaves.
    P.addEquipment('hullDetail', box(.38, .034, .37), side * 1.065, 1.901, -2.73);
    KIT.jerryCan(P, 'hullFittingPaint', side * 1.065, 2.14, -2.73);
    P.addEquipment('hullDetail', box(.24, .035, .64), side * 1.19, 1.902, -2.16);
    KIT.tarpRoll(P, 'hullCloth', side * 1.19, 2.012, -2.16, .60, .095, false, P.q ? 14 : 9);
  }
  // Pioneer tools are restrained in the clear central strip between hatches.
  KIT.shovelTool(P, -.08, 1.925, -2.25, .67);
  P.addEquipment('hullWood', cylZ(.018, .66, 8), .14, 1.926, -2.25);
  P.addEquipment('hullDark', cylX(.024, .28, 8), .14, 1.938, -1.94);
  for (const z of [-2.48, -2.09]) {
    P.addEquipment('hullDetail', box(.39, .033, .044), .04, 1.927, z);
    for (const x of [-.12, .18])
      P.addEquipment('hullDark', box(.025, .023, .065), x, 1.95, z);
  }
}

function recoveryEquipment(P: TankBuilderPort): void {
  // The shared carrier normally paints its feet like the host hull. This
  // field kit uses bare steel rails/feet alongside its worn spare links.
  const steelCarrier: TankBuilderPort['addEquipment'] = (bucket, geometry, ...placement) =>
    P.addEquipment(bucket === 'hullDetail' ? 'hullDark' : bucket, geometry, ...placement);
  for (const side of [-1, 1])
    KIT.spareTrackStrip({ add: P.add, addEquipment: steelCarrier }, 'hull', side * .65, 1.620, 2.46, 3, .447);
  KIT.towCable(P, [[-1.338, 1.82, -.22], [-1.338, 1.79, .23],
    [-1.338, 1.78, .70], [-1.338, 1.81, 1.32]], .016);
  for (const [z, y] of [[-.22, 1.82], [.70, 1.78], [1.32, 1.81]]) {
    P.addEquipment('hullDetail', box(.12, .08, .06), -1.31, y, z);
    P.addEquipment('hullDark', torus(.047, .012, P.q ? 14 : 9, 6),
      -1.35, y, z, 0, Math.PI / 2);
  }
}

function turretEquipment(P: TankBuilderPort): void {
  // Baskets rotate with the turret; their bottoms are above the hull roof.
  // The short bustle keeps the complete sweep clear of the hull commander.
  rack(P, 'turret', 0, .26, -1.065, 1.14, .30, .32);
  for (const side of [-1, 1]) {
    P.addEquipment('turretDetail', box(.07, .08, .22), side * .45, .285, -.955);
    rack(P, 'turret', side * .875, .245, -.29, .25, .70, .35);
    for (const z of [-.55, -.05])
      P.addEquipment('turretDetail', box(.22, .07, .07), side * .81, .28, z);
    KIT.stowage(P, 'turretCloth', () => .5,
      [[side * .885, .415, -.29, .20, .27, .57]]);
  }
  KIT.tarpRoll(P, 'turretCloth', 0, .46, -1.065, 1.03, .135, true, P.q ? 14 : 9);
  // Small backed roof electronics and a second whip complete the silhouette
  // without adding a weapon or obstructing the commander's hatch.
  P.addEquipment('turretDetail', box(.24, .10, .27), .40, .706, -.27);
  P.addEquipment('turretDark', box(.17, .065, .19), .40, .788, -.27);
  P.addEquipment('turretDetail', box(.14, .10, .14), -.47, .647, -.64);
  P.addEquipment('turretDark', KIT.cylY(.031, .046, .10, 10), -.47, .72, -.64);
  P.addEquipment('turretDark', KIT.cylY(.006, .012, 1.08, P.q ? 10 : 6), -.47, 1.30, -.64);
}

export function addAmx10p25FieldKit(P: TankBuilderPort): void {
  sideArmorAndCages(P);
  sidePanniers(P);
  rearDeckEquipment(P);
  recoveryEquipment(P);
  turretEquipment(P);
  P.hullG.userData.fieldKit = 'amx10p25-warrior-inspired';
}
