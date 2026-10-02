// Owner-requested AMX 56 field package, inspired by the AMX-10P 25 kit.
// Original equipment addition; not a claim about the supplied Leclerc source.
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import { classicTurret } from './leclercClassicXFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX } = KIT;
const STATIONS = [
  [-3.24, 1.60, 1.92], [-2.12, 1.54, 2.02],
  [1.30, 1.50, 2.02], [2.24, 1.46, 2.00], [3.27, 1.29, 1.91],
] as const;

function armoredSides(P: TankBuilderPort, side: number): void {
  // Thick folded side modules sit outside the unchanged track course.
  // The upper bridge overlaps the existing fender; the lower cage stays open.
  P.addExternalArmor('hull', sectionSolid(STATIONS.map(([z, top, outer]) => {
    const ring: [number, number][] = [[1.79, .94], [outer - .045, .94],
      [outer, 1.08], [outer, top - .085], [outer - .065, top],
      [1.65, top], [1.65, top - .04], [1.79, top - .04]];
    return { z, ring: side < 0 ? ring.map(([x, y]) => [-x, y] as [number, number]).reverse() : ring };
  })));
  for (const [z, top, x] of [[-2.65, 1.57, 1.968], [-1.64, 1.54, 2.02],
    [-.64, 1.525, 2.02], [.38, 1.51, 2.02], [1.42, 1.495, 2.017], [2.58, 1.404, 1.970]]) {
    P.addEquipment('hullDetail', box(.034, top - .955, .055), side * (x + .008), (top + .955) / 2, z);
    for (const y of [1.04, top - .065])
      P.addEquipment('hullDark', cylX(.021, .025, 8), side * (x + .030), y, z);
    P.addEquipment('hullDetail', box(.18, .045, .12), side * 1.75, top - .034, z);
  }
}

function lowerScreens(P: TankBuilderPort, side: number): void {
  // Slats have real gaps and short folded ends, with no backing sheet.
  for (let row = 0; row < 8; row++) {
    const y = .43 + row * .078;
    P.addEquipment('hullOpenLattice', box(.032, .024, 6.30), side * 1.96, y, 0);
    for (const end of [-1, 1])
      P.addEquipment('hullOpenLattice', box(.18, .024, .032), side * 1.87, y, end * 3.15);
  }
  for (let i = 0; i <= 14; i++)
    P.addEquipment('hullOpenLattice', box(.036, .63, .033), side * 1.96, .72, -3.15 + i * .45);
  for (const end of [-1, 1]) {
    P.addEquipment('hullOpenLattice', box(.032, .63, .036), side * 1.78, .72, end * 3.15);
    P.addEquipment('hullDetail', box(.25, .05, .07), side * 1.855, 1.01, end * 3.15);
  }
}

function turretCarriers(P: TankBuilderPort, side: number): void {
  // The side baskets and their cargo rotate with the bustle. Their supports
  // overlap the turret side at Y2.02; all stock clears the fixed engine deck.
  const inner = side < 0 ? -1.66 : 1.56, outer = side * 1.94;
  const x = (inner + outer) / 2, width = Math.abs(outer - inner);
  for (const z of [-1.38, -.69]) {
    classicTurret(P, 'turretOpenLattice', KIT.openRackGrid(width, .60, .023, 2, 3), x, 2.02, z);
    for (const end of [-1, 1]) {
      classicTurret(P, 'turretDetail', box(width + .04, .06, .07), x, 2.017, z + end * .25);
      classicTurret(P, 'turretOpenLattice', box(width, .025, .025), x, 2.31, z + end * .30);
      for (const edge of [inner, outer])
        classicTurret(P, 'turretOpenLattice', box(.025, .31, .025), edge, 2.165, z + end * .30);
    }
    for (const y of [2.17, 2.31])
      classicTurret(P, 'turretOpenLattice', box(.025, .025, .60), outer, y, z);
    // Restrained cloth bags instead of camouflage-painted boxes.
    classicTurret(P, 'turretCloth', box(width - .055, .23, .49), x, 2.155, z);
    for (const dz of [-.16, .16])
      classicTurret(P, 'turretDark', box(width - .045, .012, .025), x, 2.273, z + dz);
  }
}

function bustleAndTools(P: TankBuilderPort): void {
  // Outboard guard around the existing asymmetric basket/bin pair. It keeps
  // the source floor, fuel brackets and exhaust aperture accessible below.
  for (const y of [1.96, 2.13, 2.30])
    classicTurret(P, 'turretOpenLattice', box(2.92, .025, .028), -.16, y, -2.71);
  for (const x of [-1.62, -.85, -.05, .70, 1.30]) {
    classicTurret(P, 'turretOpenLattice', box(.028, .365, .028), x, 2.1275, -2.71);
    classicTurret(P, 'turretDetail', box(.055, .055, .77), x, 1.950, -2.325);
  }
  for (const side of [-1, 1]) {
    const x = side < 0 ? -1.62 : 1.30;
    for (const y of [1.96, 2.30])
      classicTurret(P, 'turretOpenLattice', box(.025, .025, .58), x, y, -2.42);
  }
  // Two restrained cases on the source starboard bin, clear of roof sights.
  for (const x of [.38, .72]) {
    classicTurret(P, 'turretFittingPaint', box(.26, .23, .32), x, 2.476, -2.02);
    classicTurret(P, 'turretDark', box(.028, .026, .34), x, 2.601, -2.02);
    classicTurret(P, 'turretDetail', box(.28, .035, .34), x, 2.355, -2.02);
  }
}

export function addLeclercClassicXFieldKit(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    armoredSides(P, side);
    lowerScreens(P, side);
    turretCarriers(P, side);
  }
  bustleAndTools(P);
  P.hullG.userData.fieldKit = 'amx56-amx10p25-inspired';
}
