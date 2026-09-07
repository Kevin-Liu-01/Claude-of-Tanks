// Original folded-cap and forged-hook primitives informed by AESP Fig21 and
// the Tank Museum front photograph. Small dimensions are drawing-led estimates;
// the existing 4.195 m nose envelope and all running-gear stations are retained.
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number];
const OFFSETS = [-.352, -.326, -.286, 0, .286, .326, .352] as const;
const CROSSFALL = [.047, .022, .004, 0, .004, .022, .047] as const;

function foldedCap(x: number) {
  const rows = [[2.61, 1.467], [3.30, 1.405], [3.72, 1.337],
    [3.91, 1.312], [4.055, 1.285], [4.145, 1.244], [4.195, 1.210]];
  return sectionSolid(rows.map(([z, crown]) => {
    const fold = Math.max(0, Math.min(1, (z - 3.30) / .42));
    const top: Point[] = OFFSETS.map((dx, i) => [x + dx, crown - CROSSFALL[i] * fold]);
    return { z, ring: [...top.map(([a, y]) => [a, y - .034] as const), ...[...top].reverse()] };
  }));
}

function hangingRubber(x: number) {
  // Rubber continues beneath the bent steel crown. Rounded lower corners do
  // not turn the entire end into a deep square armor box.
  const ring: Point[] = [[x - .352, 1.083], [x - .327, 1.044],
    [x - .280, 1.024], [x + .280, 1.024], [x + .327, 1.044],
    [x + .352, 1.083], [x + .352, 1.175], [x + .286, 1.214],
    [x, 1.218], [x - .286, 1.214], [x - .352, 1.175]];
  return sectionSolid([{ z: 4.164, ring }, { z: 4.191, ring }]);
}

export function addChallenger1XFrontCaps(P: TankBuilderPort, side: number): void {
  const x = side * 1.382;
  P.addMudguard(`challenger1_x_front_guard_${side}`, 'hullDetail', foldedCap(x));
  P.addMudguard(`challenger1_x_front_flap_${side}`, 'hullDark', hangingRubber(x));
}

function hook(x: number) {
  // A closed U-shaped forging with a genuine upper throat, not a full disk.
  // The 18 mm buried root lies inside the existing Z4.13 permanent toe plate.
  const ring: Point[] = [[x - .077, 1.153], [x - .077, 1.006],
    [x - .057, .973], [x - .026, .956], [x + .029, .956],
    [x + .061, .977], [x + .079, 1.014], [x + .079, 1.178],
    [x + .032, 1.178], [x + .032, 1.034], [x + .015, 1.019],
    [x - .017, 1.019], [x - .032, 1.034], [x - .032, 1.153]];
  return sectionSolid([{ z: 4.112, ring }, { z: 4.193, ring }]);
}

export function addChallenger1XBowHooks(P: TankBuilderPort): void {
  for (const side of [-1, 1]) P.addEquipment('hullDetail', hook(side * .77));
}
