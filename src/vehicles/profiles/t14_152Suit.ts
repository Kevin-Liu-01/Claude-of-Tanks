// The T-14 152's camouflage net and garnish (owner 2026-11-05: "full net and ghillie"): the fleet's field suit
// (ghillieSuit.ts, the fleet nets' woodland issue tones and painted net texture, ghillieFleetSuits.ts WOODLAND) fitted to
// the 152 mm Armata as one cover (looks round 2, the critics: "flat, shredded paper scraps on the turret roof and the
// rear slat cage only ... most of the hull and the front are bare"). The turret's net lies over the whole roof, the gun
// house and the bustle out to the drums' bins, humped on the crew's sticks; it opens round the panoramic sight, the
// weapon tower and the roof's launcher caps and keeps off the forward launchers' line of fire. The hull's blanket runs
// from the stern over the deck and the bow shoulders, opened over the crew stations and the drivers' view and round the
// glacis's ERA field, with drapes down the rear slat cages and over the first and third forward skirt panels (the other
// panels' ERA in sight). The drums on the bustle's flanks stay bare. The suit keeps the fleet's field clearances (the
// turret's sweep, the 2A83's swept volume to its measured stops, lenses and launchers). Hull frame and turret frame
// (origin at the ring, profiles/t14X.ts). First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import { addVehicleGhillieSuit, type GhillieConfig } from '../ghillieSuit.ts';
import { T14X_RING } from './t14X.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point2 = readonly [number, number];
type Panels = NonNullable<GhillieConfig['hull']>;
type TopPanel = NonNullable<Panels['top']>[number];
type SidePanel = NonNullable<Panels['side']>[number];

const tz = (worldZ: number) => worldZ - T14X_RING.z;
const ty = (worldY: number) => worldY - T14X_RING.y;
const rect = (x0: number, x1: number, z0: number, z1: number): Point2[] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const pair = (x0: number, x1: number, z0: number, z1: number): Point2[][] => [rect(x0, x1, z0, z1), rect(-x1, -x0, z0, z1)];

/** A net laid over its owner's armour, ending at the armour's edges and opened round its lenses and lids. */
function laid(panel: Omit<TopPanel, 'yAt'> & { y: number }): TopPanel {
  const { y, ...rest } = panel;
  return { yAt: () => y, yFromArmour: true, clipToArmour: true, autoOpeningsM: .07, rimScale: .5, ...rest };
}

/** A drape on both flanks between z0 and z1, from `top` down `drop`, hanging just outside `out`. */
function flanks(z0: number, z1: number, top: number, drop: number, out: number, seed: number): SidePanel[] {
  return [-1, 1].map((side) => ({
    side, z0, z1,
    topAt: () => top,
    bottomAt: (z: number) => top - drop + .04 * Math.sin(z * 3.1 + side) + .025 * Math.sin(z * 7.3 + seed),
    outAt: (_z: number, t: number) => out + (1 - t) * .02,
    seed: seed + side,
  }));
}

const T14_152_SUIT: GhillieConfig = {
  id: 't14_152', seed: 269152, style: 'leafy', density: 1.8, leafScale: .94, boughShare: .42,
  light: 0x6f7e4b, dark: 0x33462d, netColor: 'rgba(40,54,32,0.82)', netTextureSeed: 1101,
  fieldClearanceM: .03, clothClearsGunStops: true, cardsClearGunStops: true, maxHalfWidth: 1.97,
  turret: {
    // one cover over the roof, the gun house (lifted over it: riseLimitM) and the bustle to the drums' bins, humped on
    // the crew's sticks, opened round the panoramic sight, the weapon tower and the roof's launcher caps, kept off the
    // forward launchers' line of fire and the shroud's raked front faces
    top: [laid({
      x0: -1.22, x1: 1.22, z0: tz(-2.80), z1: tz(1.12), nx: 24, nz: 40, y: ty(2.55), riseLimitM: .55, garnishRiseM: .14,
      seed: 11, tents: [[-.62, tz(-2.25), .10], [.80, tz(-2.40), .11], [-.88, tz(-.95), .08], [0, tz(-.30), .06]],
      holes: [
        ...pair(.76, 1.46, tz(-.56), tz(1.40)), ...pair(.98, 1.46, tz(-1.52), tz(-.56)), ...pair(.50, .76, tz(.42), tz(1.40)),
        rect(-.76, -.06, tz(-1.62), tz(-.88)), rect(.12, .68, tz(-2.00), tz(-1.44)),
      ],
    })],
  },
  hull: {
    // one blanket over the deck from the stern to the bow shoulders, under the turret's sweep, opened over the crew
    // stations and the drivers' view ahead of them and round the glacis's ERA field
    top: [laid({ x0: -1.96, x1: 1.96, z0: -4.29, z1: 4.25, nx: 32, nz: 58, y: 1.70, garnishRiseM: .10, reliefScale: .6, seed: 31,
      holes: [rect(-.96, .96, 1.40, 4.40)] })],
    // drapes down the rear slat cages, and over the first and third forward skirt panels, the others' ERA bare
    side: [...flanks(-4.22, -1.32, 1.71, .62, 1.958, 41), ...flanks(-1.20, -.33, 1.70, .58, 1.958, 47),
      ...flanks(.66, 1.54, 1.70, .52, 1.958, 53)],
  },
};

export function addT14_152Suit(P: TankBuilderPort): void {
  addVehicleGhillieSuit(P, T14_152_SUIT);
}
