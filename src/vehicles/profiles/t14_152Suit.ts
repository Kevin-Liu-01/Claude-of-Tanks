// The T-14 152's camouflage net and garnish (owner 2026-11-05: "full net and ghillie"): the fleet's field suit
// (ghillieSuit.ts, the fleet nets' woodland issue tones and painted net texture, ghillieFleetSuits.ts WOODLAND) fitted to
// the 152 mm Armata. The turret's net is laid over the whole roof, the gun house and the drums on the bustle, opened round
// the panoramic sight, the weapon tower and the roof's launcher caps and kept off the front shroud's forward launchers,
// and drapes hang down the bustle's flanks over its side bins. The hull's net covers the engine deck from
// the turret's sweep to the stern stowage and hangs in drapes down the rear slat cages; the glacis and the forward skirts
// stay bare, their new ERA in sight. The suit keeps the fleet's field clearances (the turret's sweep, the 2A83's swept
// volume to its measured stops, lenses and launchers). Hull frame and turret frame (origin at the ring, profiles/t14X.ts).
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
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
    top: [laid({
      x0: -1.42, x1: 1.42, z0: tz(-3.46), z1: tz(1.28), nx: 32, nz: 54, y: ty(2.55), garnishRiseM: .14, seed: 11,
      holes: [
        // the front shroud's forward launchers and their line of fire, the bustle's roof launcher caps, and the shroud's
        // raked front faces beside the gun house (the net ends at the shroud's top edge instead of hanging down its face)
        ...pair(.76, 1.46, tz(-.56), tz(1.40)), ...pair(.98, 1.46, tz(-1.52), tz(-.56)), ...pair(.44, .76, tz(.42), tz(1.40)),
        // the panoramic sight and the weapon tower
        rect(-.76, -.06, tz(-1.62), tz(-.88)), rect(.10, .70, tz(-2.02), tz(-1.42)),
      ],
    })],
    // the bustle's flanks over its side bins, from the roof's edge to the bustle's chin
    side: flanks(tz(-2.70), tz(-.80), ty(2.555), .42, 1.225, 17),
  },
  hull: {
    top: [laid({ x0: -1.96, x1: 1.96, z0: -4.31, z1: -1.12, nx: 38, nz: 34, y: 1.70, garnishRiseM: .10, reliefScale: .6, seed: 31 })],
    side: flanks(-4.22, -1.42, 1.71, .62, 1.958, 41),
  },
};

export function addT14_152Suit(P: TankBuilderPort): void {
  addVehicleGhillieSuit(P, T14_152_SUIT);
}
