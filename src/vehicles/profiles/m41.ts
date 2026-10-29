// The M41 Walker Bulldog family (release 265; owner 2026-10-29: "lets make a m41", the original US tank and other
// countries', taking from the M46 and M47 Pattons; Main's ruling the same day): one first-party build of the M41's welded
// and cast hull and turret, with the marks as they differ (docs/references/tanks/m41a3.md and the packets beside it).
// - us: the US Army's M41A3: no skirts, the .50 cal on the commander's cupola, the 76 mm M32 with its T-shaped blast
//   deflector and bore evacuator, fender boxes, a bustle rack, brush-guarded headlights, the gun's travel lock.
// - bw: the Bundeswehr's M41 (1956-66): the same tank in RAL 6014 with German markings and stowage.
// - jgsdf: the Japan Ground Self-Defense Force's M41: the same tank in JGSDF olive with its markings and stowage.
// - dk1: the Danish M41 DK-1 of the late 1980s (armyvehicles.dk/m41dk1.htm; the Aalborg museum's tank): Leopard-type
//   skirts, the Jahn Anderson thermal sight and Ericsson laser rangefinder in a box on the mantlet's right, the mantlet's
//   canvas cover, Wegmann dischargers, mesh baskets on the turret's sides and rear, the Cummins diesel's deck, the .30 cal
//   on the cupola.
// Datums: the published 5.82 m hull, 3.20 m over the tracks, five 25.5 in dual road wheels a side, three return rollers,
// the drive sprocket at the rear; the turret's stations from the Aalborg DK-1's photographs. The cast loft (a station is
// a floor, walls rising to the widest point and a superellipse shoulder onto the roof) is the Patton rebuild's
// (profiles/pattonCast.ts castRing), here with squarer shoulders for the M41's welded flanks. A +Z hull's right is -X.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type M41Mark = 'us' | 'bw' | 'jgsdf' | 'dk1';
type Geo = THREE.BufferGeometry;

// ------------------------------------------------------------------------------------------------- the cast loft --
/** One station of a cast loft (turret metres: y from the turret base, z from the ring). */
interface CastStation {
  readonly z: number;
  readonly bot: number;
  readonly top: number;
  readonly hw: number;
  /** Roof flat and floor half-widths as fractions of hw; the widest point's height as a fraction of bot..top. */
  readonly roof: number;
  readonly foot: number;
  readonly waist: number;
  readonly nUp?: number;
  readonly nLo?: number;
}

const RING_HIGH = { lo: 4, up: 8, roof: 4, floor: 3 };
const RING_LOW = { lo: 3, up: 5, roof: 2, floor: 2 };

function castRing(s: CastStation, k: typeof RING_HIGH): SectionPoint[] {
  const nUp = s.nUp ?? 3, nLo = s.nLo ?? 4;
  const yM = s.bot + (s.top - s.bot) * s.waist;
  const hwR = Math.max(0.02, s.hw * s.roof), hwB = Math.max(0.02, s.hw * s.foot);
  const pw = (v: number, n: number): number => Math.pow(Math.max(0, v), 2 / n);
  const right: [number, number][] = [];
  for (let i = 0; i <= k.lo; i++) {
    const phi = (-Math.PI / 2) * (1 - i / k.lo);
    right.push([hwB + (s.hw - hwB) * pw(Math.cos(phi), nLo), yM - (yM - s.bot) * pw(Math.abs(Math.sin(phi)), nLo)]);
  }
  for (let j = 1; j <= k.up; j++) {
    const phi = (Math.PI / 2) * (j / k.up);
    right.push([hwR + (s.hw - hwR) * pw(Math.cos(phi), nUp), yM + (s.top - yM) * pw(Math.sin(phi), nUp)]);
  }
  for (let j = 1; j <= k.roof; j++) right.push([hwR * (1 - j / k.roof), s.top]);
  const left = right.slice(0, -1).reverse().map(([x, y]) => [-x, y] as [number, number]);
  const floor: [number, number][] = [];
  for (let i = 1; i <= k.floor; i++) floor.push([-hwB + 2 * hwB * i / (k.floor + 1), s.bot]);
  return [...right, ...left, ...floor];
}

function castSolid(stations: readonly CastStation[], q: boolean | undefined): Geo {
  const k = q ? RING_HIGH : RING_LOW;
  const sections = [...stations].sort((a, b) => a.z - b.z).map((s) => ({ z: s.z, ring: castRing(s, k) }));
  const n = sections[0].ring.length;
  return sectionSolid(sections, { centeredSideQuads: true, smoothSideEdges: Array.from({ length: n - (k.floor + 1) }, (_, i) => i) });
}

function stationAt(stations: readonly CastStation[], z: number): CastStation {
  const s = [...stations].sort((a, b) => a.z - b.z);
  if (z <= s[0].z) return s[0];
  if (z >= s[s.length - 1].z) return s[s.length - 1];
  let i = 0;
  while (s[i + 1].z < z) i++;
  const a = s[i], b = s[i + 1], t = (z - a.z) / (b.z - a.z), m = (u: number, v: number): number => u + (v - u) * t;
  return { z, bot: m(a.bot, b.bot), top: m(a.top, b.top), hw: m(a.hw, b.hw), roof: m(a.roof, b.roof), foot: m(a.foot, b.foot),
    waist: m(a.waist, b.waist), nUp: m(a.nUp ?? 3, b.nUp ?? 3), nLo: m(a.nLo ?? 4, b.nLo ?? 4) };
}

/** The casting's side wall half-width at height y, station z. */
function castSideAt(stations: readonly CastStation[], y: number, z: number): number {
  const s = stationAt(stations, z), yM = s.bot + (s.top - s.bot) * s.waist;
  const hwR = Math.max(0.02, s.hw * s.roof), hwB = Math.max(0.02, s.hw * s.foot);
  if (y >= yM) {
    const n = s.nUp ?? 3, v = Math.min(1, (y - yM) / (s.top - yM));
    return hwR + (s.hw - hwR) * Math.pow(Math.max(0, 1 - Math.pow(v, n)), 1 / n);
  }
  const n = s.nLo ?? 4, v = Math.min(1, (yM - y) / (yM - s.bot));
  return hwB + (s.hw - hwB) * Math.pow(Math.max(0, 1 - Math.pow(v, n)), 1 / n);
}

// ------------------------------------------------------------------------------------------------- datums --
const H = Object.freeze({
  noseZ: 2.91, sternZ: -2.91, bellyY: 0.44, fenderY: 1.02, deckY: 1.55, deckEdgeX: 1.30, sponsonX: 1.56,
  hullSideX: 0.98, noseY: 1.04, glacisBreakZ: 1.98, trackXc: 1.335, trackW: 0.533, skirtX: 1.64,
});
const ROAD_WHEEL_ZS = [1.55, 0.79, 0.03, -0.73, -1.49];
const RING = Object.freeze({ y: H.deckY + 0.02, z: 0.30 });
/** The turret (turret metres): the nose plate leaning back over the gun shield, the welded flanks squared (superellipse
 * exponents of 7-8, a hard chine onto the roof), the long bustle overhanging the engine deck, its floor stepping up
 * behind the ring. */
const TURRET: readonly CastStation[] = Object.freeze([
  { z: 1.08, bot: 0.12, top: 0.50, hw: 0.80, roof: 0.75, foot: 0.90, waist: 0.30, nUp: 6, nLo: 8 },
  { z: 0.78, bot: 0.02, top: 0.84, hw: 1.04, roof: 0.80, foot: 0.92, waist: 0.30, nUp: 7, nLo: 8 },
  { z: 0.20, bot: 0.0, top: 0.86, hw: 1.13, roof: 0.82, foot: 0.93, waist: 0.32, nUp: 8, nLo: 8 },
  { z: -0.80, bot: 0.0, top: 0.85, hw: 1.11, roof: 0.82, foot: 0.93, waist: 0.32, nUp: 8, nLo: 8 },
  { z: -1.22, bot: 0.14, top: 0.82, hw: 1.06, roof: 0.82, foot: 0.93, waist: 0.34, nUp: 8, nLo: 8 },
  { z: -1.88, bot: 0.26, top: 0.77, hw: 0.94, roof: 0.80, foot: 0.93, waist: 0.38, nUp: 7, nLo: 8 },
  { z: -1.96, bot: 0.30, top: 0.72, hw: 0.88, roof: 0.78, foot: 0.92, waist: 0.40, nUp: 5, nLo: 6 },
]);
const ROOF_Y = 0.86;
const TRUNNION = Object.freeze({ y: 0.40, z: 1.02 });

function* buildM41Steps(P: TankBuilderPort, mark: M41Mark): TankProfileBuild {
  const { box, cylX, cylY, cylZ, sph, xform, buildRunningGear, headlight, liftEye, towCable, stowage, jerryCan, tarpRoll,
    torus } = KIT;
  const slab = orientedSlab;
  const { rng } = P;
  const dk = mark === 'dk1';
  const bar = (slot: string, a: readonly number[], b: readonly number[], r: number): void => {
    P.add(slot, beamBetween([a[0], a[1], a[2]], [b[0], b[1], b[2]], r, 8));
  };
  const deckY = (z: number): number => z > H.glacisBreakZ
    ? H.deckY - (z - H.glacisBreakZ) * (H.deckY - H.noseY) / (H.noseZ - H.glacisBreakZ)
    : z < -2.55 ? H.deckY - (-2.55 - z) * 0.25 : H.deckY;

  // ---------------------------------------------------------------- hull --
  const buildM41Hull = (): void => {
    P.add('hull', sectionSolid([
      { z: -2.86, ring: [[-H.hullSideX, 0.62], [H.hullSideX, 0.62], [H.hullSideX, H.fenderY], [-H.hullSideX, H.fenderY]] },
      { z: -2.55, ring: [[-H.hullSideX, H.bellyY], [H.hullSideX, H.bellyY], [H.hullSideX, H.fenderY], [-H.hullSideX, H.fenderY]] },
      { z: 2.40, ring: [[-H.hullSideX, H.bellyY], [H.hullSideX, H.bellyY], [H.hullSideX, H.fenderY], [-H.hullSideX, H.fenderY]] },
      { z: 2.88, ring: [[-H.hullSideX, 0.86], [H.hullSideX, 0.86], [H.hullSideX, H.fenderY], [-H.hullSideX, H.fenderY]] },
    ]));
    const upper = (z: number): readonly SectionPoint[] => [
      [-H.sponsonX, H.fenderY - 0.02], [H.sponsonX, H.fenderY - 0.02], [H.deckEdgeX, deckY(z) - 0.03],
      [H.deckEdgeX - 0.18, deckY(z)], [-(H.deckEdgeX - 0.18), deckY(z)], [-H.deckEdgeX, deckY(z) - 0.03],
    ];
    P.add('hull', sectionSolid([H.sternZ, -2.55, 0.0, H.glacisBreakZ].map((z) => ({ z, ring: upper(z) }))));
    P.add('hull', slab(
      [-H.deckEdgeX, H.deckY - 0.06, H.glacisBreakZ], [H.deckEdgeX, H.deckY - 0.06, H.glacisBreakZ],
      [0.98, H.noseY - 0.06, H.noseZ], [-0.98, H.noseY - 0.06, H.noseZ],
      [-H.deckEdgeX, H.deckY, H.glacisBreakZ], [H.deckEdgeX, H.deckY, H.glacisBreakZ],
      [0.98, H.noseY, H.noseZ], [-0.98, H.noseY, H.noseZ]));
    for (const s of [-1, 1] as const) {
      P.add('hull', slab(
        [s * 0.98, H.noseY - 0.06, H.noseZ], [s * 1.54, H.fenderY - 0.02, 2.86],
        [s * H.sponsonX, H.fenderY - 0.02, H.glacisBreakZ], [s * H.deckEdgeX, H.deckY - 0.08, H.glacisBreakZ],
        [s * 0.98, H.noseY, H.noseZ], [s * 1.54, H.fenderY + 0.02, 2.86],
        [s * H.sponsonX, H.fenderY + 0.02, H.glacisBreakZ], [s * H.deckEdgeX, H.deckY - 0.02, H.glacisBreakZ]));
    }
    P.add('hull', slab(
      [-0.98, H.bellyY, 2.40], [0.98, H.bellyY, 2.40], [0.98, H.bellyY + 0.05, 2.36], [-0.98, H.bellyY + 0.05, 2.36],
      [-0.98, H.noseY - 0.04, H.noseZ], [0.98, H.noseY - 0.04, H.noseZ], [0.98, H.noseY - 0.10, H.noseZ - 0.06],
      [-0.98, H.noseY - 0.10, H.noseZ - 0.06]));
    P.add('hull', box(2.10, H.deckY - 0.25 - 0.60, 0.06), 0, (H.deckY - 0.25 + 0.60) / 2, H.sternZ + 0.03);
    // fenders over the tracks on brackets under their outer edge (the Pattons' run), falling over the idlers
    for (const s of [-1, 1] as const) {
      // (the fender's outer lip on the track's outer edge: the published 3.20 m over the tracks)
      P.add('hullDetail', box(0.63, 0.025, 5.74), s * 1.295, H.fenderY - 0.0125, 0.0);
      P.add('hullDetail', box(0.012, 0.07, 5.74), s * 1.594, H.fenderY - 0.045, 0.0);
      P.add('hullDetail', slab(
        [s * 1.00, H.fenderY - 0.025, 2.87], [s * 1.60, H.fenderY - 0.025, 2.87], [s * 1.60, 0.84, 3.10], [s * 1.00, 0.84, 3.10],
        [s * 1.00, H.fenderY, 2.87], [s * 1.60, H.fenderY, 2.87], [s * 1.60, 0.865, 3.09], [s * 1.00, 0.865, 3.09]));
      if (!dk) for (const z of [-2.0, -0.70, 0.60, 1.80]) {
        P.add('hullDetail', box(0.03, 0.10, 0.04), s * 1.57, H.fenderY - 0.08, z);
        P.add('hullDetail', box(0.58, 0.025, 0.04), s * 1.29, H.fenderY - 0.10, z, 0, 0, s * 0.18);
      }
      // the rear mud flaps under the fender's overhang
      P.hangMudguard('m41-rear-flap', 'hullRubber', box(0.50, 0.32, 0.012), s * 1.38, H.fenderY - 0.18, H.sternZ - 0.06);
    }
  };
  buildM41Hull();
  yield 'buildM41Hull';

  // ---------------------------------------------------------------- running gear (the Pattons') --
  const roadWheelR = 0.324, roadWheelY = 0.354, wheelW = 0.21;
  const rollers = [1.17, 0.03, -1.11].map((z) => ({ z, y: 0.86, r: 0.11 }));
  const buildM41RunningGear = (): void => {
    buildRunningGear(P, {
      style: 'dished', wheelR: roadWheelR, wheelW, wheelY: roadWheelY, xc: H.trackXc, wheelZs: [...ROAD_WHEEL_ZS],
      sprocket: { z: -2.30, y: 0.66, r: 0.30 }, idler: { z: 2.26, y: 0.58, r: 0.26 }, rollers,
      trackW: H.trackW, topY: 0.86 + 0.04, botY: 0.05, contactZF: ROAD_WHEEL_ZS[0], contactZR: ROAD_WHEEL_ZS.at(-1),
      paintedEnds: true, coveredTop: false, arms: true, sprocketTeeth: false,
    });
    for (const z of ROAD_WHEEL_ZS) for (const s of [-1, 1] as const) {
      P.add('hullRunningGearDark', torus(roadWheelR * 0.3, 0.015, P.q ? 16 : 10), s * (H.trackXc + wheelW / 2 + 0.012), roadWheelY, z,
        0, 0, Math.PI / 2);
    }
    for (const rl of rollers) for (const s of [-1, 1] as const) {
      P.add('hullRunningGearDetail', box(0.07, 0.10, 0.12), s * (H.trackXc - H.trackW * 0.5 - 0.02), rl.y + 0.02, rl.z);
    }
    if (dk) {
      // the DK-1's Leopard-pattern skirts hung from the fender edge over the wheels' upper half
      for (const s of [-1, 1] as const) {
        for (let k = 0; k < 5; k++) {
          const z0 = 2.10 - k * 0.90, z1 = z0 - 0.86;
          P.hangMudguard('m41dk1-skirt', 'hull', box(0.012, 0.36, z0 - z1), s * H.skirtX, H.fenderY - 0.18, (z0 + z1) / 2);
          P.add('hullDetail', box(0.016, 0.38, 0.03), s * (H.skirtX + 0.002), H.fenderY - 0.18, z1 - 0.02);
        }
        P.add('hullDetail', box(0.06, 0.03, 4.60), s * (H.skirtX - 0.025), H.fenderY - 0.015, -0.26);
      }
    }
    P.mats.rubber.color.setHex(0x34372d);
  };
  buildM41RunningGear();
  yield 'buildM41RunningGear';

  // ---------------------------------------------------------------- hull fittings --
  const buildM41HullFittings = (): void => {
    // the driver's hatch (front left, +x) and periscope
    P.addCupola('hull', cylY(0.25, 0.26, 0.05, P.q ? 20 : 14), 0.55, deckY(1.55) + 0.025, 1.55);
    P.addEquipment('hull', box(0.16, 0.08, 0.10), 0.55, deckY(1.55) + 0.08, 1.80);
    P.add('hullGlass', box(0.12, 0.04, 0.012), 0.55, deckY(1.55) + 0.09, 1.852);
    // two headlights a side high on the glacis, in a brush guard of bent rod (the M47's pattern)
    for (const s of [-1, 1] as const) {
      const x = s * 0.86, z = 2.58, y = deckY(z) + 0.04;
      for (const dx of [-0.08, 0.08]) headlight(P, x + dx, y + 0.03, z, -0.20);
      const g = [[x - 0.20, y - 0.02, z - 0.04], [x - 0.20, y + 0.16, z + 0.10], [x + 0.20, y + 0.16, z + 0.10], [x + 0.20, y - 0.02, z - 0.04]];
      for (let i = 0; i + 1 < g.length; i++) bar('hullDark', g[i], g[i + 1], 0.012);
      bar('hullDark', [x, y + 0.16, z + 0.10], [x, deckY(z - 0.12) + 0.005, z - 0.12], 0.010);
      P.add('hullDark', box(0.10, 0.12, 0.10), s * 0.62, 0.80, 2.86);
      P.add('hullDark', torus(0.06, 0.018, 12, 6), s * 0.62, 0.80, 2.93, Math.PI / 2, 0, 0);
      liftEye(P, 'hullDetail', s * 1.20, deckY(1.70) + 0.015, 1.70, s * 0.4);
      // tail lights in their guards
      P.add('hullGlass', box(0.10, 0.08, 0.018), s * 0.96, 1.30, H.sternZ - 0.005);
      P.add('hullDark', box(0.16, 0.14, 0.06), s * 0.96, 1.30, H.sternZ - 0.03);
    }
    if (dk) {
      // the DK-1's spare track links in brackets on the glacis, two blocks either side of the centre
      for (const x of [-0.28, 0.28]) for (let k = 0; k < 3; k++) {
        const z = 2.12 + k * 0.17, y = deckY(z) + 0.035;
        P.addEquipment('hullDark', box(0.30, 0.05, 0.15), x, y, z);
        P.addEquipment('hullDark', box(0.08, 0.07, 0.05), x, y + 0.02, z);
      }
    } else {
      // the gun's travel lock folded on the engine deck
      P.addEquipment('hullDark', box(0.10, 0.10, 0.10), 0, H.deckY + 0.05, -2.45);
      bar('hullDark', [-0.08, H.deckY + 0.06, -2.45], [-0.08, H.deckY + 0.08, -1.95], 0.02);
      bar('hullDark', [0.08, H.deckY + 0.06, -2.45], [0.08, H.deckY + 0.08, -1.95], 0.02);
    }
    towCable(P, [[-0.95, deckY(2.40) + 0.05, 2.40], [0, deckY(2.45) + 0.05, 2.45], [0.95, deckY(2.40) + 0.05, 2.40]], 0.022);
    // fender stowage boxes: the long box amidships each side, the rear pair over the sprocket's run
    for (const s of [-1, 1] as const) {
      P.addEquipment('hull', box(0.46, 0.32, 1.10), s * 1.36, H.fenderY + 0.16, -0.55);
      P.addEquipment('hullDark', box(0.47, 0.02, 1.11), s * 1.36, H.fenderY + 0.33, -0.55);
      for (const z of [-0.85, -0.25]) P.addEquipment('hullDark', box(0.014, 0.05, 0.04), s * 1.597, H.fenderY + 0.26, z);
      P.addEquipment('hull', box(0.44, 0.30, 0.80), s * 1.36, H.fenderY + 0.15, -1.80);
      P.addEquipment('hullDark', box(0.45, 0.02, 0.81), s * 1.36, H.fenderY + 0.31, -1.80);
    }
    // the engine deck: grille fields either side, the rear exhaust box over the plate (the DK-1's Cummins deck carries a
    // larger box and its own grilles)
    for (const s of [-1, 1] as const) {
      P.add('hullDark', box(0.86, 0.018, 1.10), s * 0.55, H.deckY + 0.009, -1.55);
      for (let k = 0; k < 6; k++) P.addEquipment('hull', box(0.80, 0.014, 0.035), s * 0.55, H.deckY + 0.012, -1.10 - k * 0.18);
    }
    const exhaustW = dk ? 1.40 : 1.10;
    P.addEquipment('hullDark', box(exhaustW, 0.22, 0.30), 0, deckY(-2.70) + 0.10, -2.70);
    for (let k = 0; k < 5; k++) P.addEquipment('hull', box(exhaustW - 0.10, 0.015, 0.03), 0, deckY(-2.70) + 0.215, -2.58 - k * 0.055);
    if (!dk) for (const s of [-1, 1] as const) {
      // the gasoline M41's twin exhaust deflectors on the rear plate
      P.addEquipment('hullDark', box(0.34, 0.16, 0.12), s * 0.50, 1.12, H.sternZ - 0.06);
      P.addEquipment('hullDark', cylZ(0.07, 0.10, 12), s * 0.50, 1.12, H.sternZ - 0.15);
    }
    jerryCan(P, 'hullCloth', -1.20, H.fenderY + 0.26, -2.55, 0.16);
    if (mark === 'dk1') P.addEquipment('hullDark', cylY(0.06, 0.07, 0.035, 12), -0.95, deckY(1.25) + 0.018, 1.25);
  };
  buildM41HullFittings();
  yield 'buildM41HullFittings';

  // ---------------------------------------------------------------- turret --
  P.turretG.position.set(0, RING.y, RING.z);
  const sideAt = (y: number, z: number): number => castSideAt(TURRET, y, z);
  const buildM41Turret = (): void => {
    P.add('turret', cylY(0.92, 0.96, 0.10, P.q ? 28 : 18), 0, -0.05, 0);
    const body = castSolid(TURRET, P.q);
    body.userData.primaryStockRole = 'm41-turret';
    P.add('turret', body);
    // the gun opening's frame in the nose, behind the gun shield
    P.add('turret', box(1.20, 0.58, 0.10), 0, TRUNNION.y, TRUNNION.z - 0.04);
    for (const s of [-1, 1] as const) {
      liftEye(P, 'turretDetail', s * 0.84, ROOF_Y + 0.005, 0.40, s * 0.4);
      liftEye(P, 'turretDetail', s * 0.70, 0.75, -1.70, s * 2.7);
    }
  };
  buildM41Turret();
  yield 'buildM41Turret';

  const buildM41TurretFittings = (): void => {
    // the commander's cupola (right, -x): armoured ring, vision blocks, hatch; its machine gun on a pintle at the rear
    const cx = -0.44, cz = -0.48, cr = 0.31;
    P.addCupola('turret', cylY(cr, cr * 1.06, 0.16, P.q ? 24 : 14), cx, ROOF_Y + 0.08, cz);
    P.addCupola('turret', cylY(cr * 0.94, cr * 0.98, 0.05, P.q ? 24 : 14), cx, ROOF_Y + 0.185, cz);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      P.add('turretDetail', box(0.10, 0.07, 0.05), cx + Math.sin(a) * cr, ROOF_Y + 0.10, cz + Math.cos(a) * cr, 0, a, 0);
      P.add('turretGlass', box(0.075, 0.035, 0.012), cx + Math.sin(a) * (cr + 0.026), ROOF_Y + 0.10, cz + Math.cos(a) * (cr + 0.026), 0, a, 0);
    }
    P.addEquipment('turretDark', cylY(0.03, 0.04, 0.28, 10), cx, ROOF_Y + 0.35, cz - cr - 0.04);
    const mgY = ROOF_Y + 0.50;
    if (dk) {
      const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', elev: 0.04, scale: 0.96, seed: 4161, shield: false,
        ammo: true, working: true, ridingCradle: true });
      mg.name = 'm41CommanderMg30';
      mg.position.set(cx, mgY, cz - cr - 0.04);
      P.turretG.add(mg);
    } else {
      const mg = FITTINGS.americanM2({ mats: P.mats, tone: 'dark', ammoSide: 1, barrelLength: 0.62, elev: 0.03, ring: false,
        shield: false, seed: 4141, working: true });
      mg.name = 'm41CommanderM2';
      mg.position.set(cx, mgY, cz - cr - 0.04);
      P.turretG.add(mg);
    }
    // the loader's hatch (left, +x), the gunner's periscope ahead of the commander, the roof ventilator
    P.addCupola('turret', cylY(0.25, 0.26, 0.06, P.q ? 22 : 12), 0.44, ROOF_Y + 0.03, -0.42);
    P.add('turretDetail', cylY(0.22, 0.23, 0.03, P.q ? 22 : 12), 0.44, ROOF_Y + 0.075, -0.42);
    P.addEquipment('turret', box(0.20, 0.13, 0.22), -0.30, ROOF_Y + 0.065, 0.48);
    P.add('turretGlass', box(0.14, 0.07, 0.012), -0.30, ROOF_Y + 0.07, 0.597);
    P.add('turret', cylY(0.17, 0.20, 0.05, P.q ? 18 : 10), 0.0, ROOF_Y + 0.015, -1.30);
    P.add('turret', xform(sph(0.17, P.q ? 16 : 10, P.q ? 8 : 5), 0, 0, 0, 0, 0, 0, [1, 0.45, 1]), 0.0, ROOF_Y + 0.04, -1.30);
    if (dk) {
      // the Texas Instruments night periscope's armoured head on the left of the roof front
      P.addEquipment('turret', box(0.26, 0.20, 0.28), 0.40, ROOF_Y + 0.10, 0.55);
      P.add('turretGlass', box(0.18, 0.10, 0.012), 0.40, ROOF_Y + 0.12, 0.695);
      // Wegmann dischargers: four tubes high on each flank ahead of the bustle
      for (const s of [-1, 1] as const) {
        const x = sideAt(0.62, -0.95);
        P.addEquipment('turret', box(0.10, 0.10, 0.64), s * (x + 0.03), 0.62, -0.95);
        for (let k = 0; k < 4; k++) {
          P.addEquipment('turret', xform(markSmokeTube(cylZ(0.038, 0.21, P.q ? 12 : 8)), 0, 0, 0, -0.62, s * 0.35, 0),
            s * (x + 0.09), 0.70, -0.72 - k * 0.15);
        }
      }
      // Leopard-pattern mesh baskets along both flanks and across the rear, on brackets off the walls
      for (const s of [-1, 1] as const) {
        const x = s * 1.30, z0 = -1.86, z1 = 0.20;
        P.addEquipment('turretOpenLattice', box(0.03, 0.03, z1 - z0), x, 0.50, (z0 + z1) / 2);
        P.addEquipment('turretOpenLattice', box(0.03, 0.03, z1 - z0), x, 0.12, (z0 + z1) / 2);
        for (let k = 0; k <= 8; k++) P.addEquipment('turretOpenLattice', box(0.02, 0.40, 0.02), x, 0.31, z0 + (z1 - z0) * k / 8);
        for (let k = 1; k < 4; k++) P.addEquipment('turretOpenLattice', box(0.012, 0.012, z1 - z0), x, 0.12 + k * 0.095, (z0 + z1) / 2);
        P.addEquipment('turretOpenLattice', box(0.22, 0.025, z1 - z0), s * 1.19, 0.12, (z0 + z1) / 2);
        for (const z of [z0 + 0.10, (z0 + z1) / 2, z1 - 0.10]) {
          const wall = sideAt(0.48, z);
          P.addEquipment('turretDark', box(1.30 - wall + 0.02, 0.04, 0.04), s * (wall + 1.30) / 2, 0.48, z);
        }
      }
      const z = -2.26;
      P.addEquipment('turretOpenLattice', box(2.60, 0.03, 0.03), 0, 0.50, z);
      P.addEquipment('turretOpenLattice', box(2.60, 0.03, 0.03), 0, 0.20, z);
      for (let k = 0; k <= 10; k++) P.addEquipment('turretOpenLattice', box(0.02, 0.33, 0.02), -1.30 + k * 0.26, 0.35, z);
      P.addEquipment('turretOpenLattice', box(2.58, 0.025, 0.36), 0, 0.20, z + 0.18);
      for (const s of [-1, 1] as const) P.addEquipment('turretOpenLattice', box(0.03, 0.03, 0.42), s * 1.30, 0.50, z + 0.21);
      stowage(P, 'turretCloth', rng, [[-0.62, 0.36, -2.08, 0.62, 0.30, 0.32], [0.48, 0.36, -2.08, 0.70, 0.30, 0.32]]);
    } else {
      // the US bustle rack: rails round the bustle's tail with a canvas load (the Pattons' rack); the BW and JGSDF
      // tanks load it with their own kit
      const z0 = -1.70, z1 = -2.20, half = 0.86, floorY = 0.30, railY = 0.66;
      for (const s of [-1, 1] as const) {
        P.addEquipment('turretDetail', box(0.03, 0.03, z0 - z1), s * half, railY, (z0 + z1) / 2);
        P.addEquipment('turretDetail', box(0.03, 0.03, z0 - z1), s * half, floorY, (z0 + z1) / 2);
        for (const z of [z0 - 0.02, (z0 + z1) / 2, z1 + 0.02]) P.addEquipment('turretDetail', box(0.028, railY - floorY + 0.03, 0.028), s * half, (railY + floorY) / 2, z);
      }
      P.addEquipment('turretDetail', box(half * 2, 0.03, 0.03), 0, railY, z1 + 0.015);
      P.addEquipment('turretDetail', box(half * 2, 0.03, 0.03), 0, floorY, z1 + 0.015);
      for (const fx of [-0.6, 0, 0.6]) P.addEquipment('turretDetail', box(0.04, 0.025, z0 - z1), fx * half, floorY, (z0 + z1) / 2);
      tarpRoll(P, 'turretCloth', -half * 0.25, floorY + 0.10, z1 + 0.14, half * 1.1, 0.085, true, P.q ? 12 : 8);
      const load: [number, number, number, number, number, number][] = mark === 'bw'
        ? [[-0.40, floorY + 0.16, -1.95, 0.60, 0.28, 0.36], [0.42, floorY + 0.14, -1.95, 0.56, 0.24, 0.34]]
        : mark === 'jgsdf'
          ? [[0.0, floorY + 0.15, -1.95, 1.20, 0.26, 0.36]]
          : [[half * 0.35, floorY + 0.16, -1.92, half * 0.7, 0.29, 0.28]];
      stowage(P, 'turretCloth', rng, load);
      if (mark === 'bw') jerryCan(P, 'turretCloth', -0.70, floorY + 0.20, -1.86, 0.16);
      if (mark === 'jgsdf') P.addEquipment('turretDark', box(0.40, 0.22, 0.28), 0.45, floorY + 0.12, -1.94);
    }
    // whip antennas on the bustle
    for (const s of [-1, 1] as const) {
      P.addEquipment('turret', box(0.08, 0.08, 0.08), s * 0.60, 0.78, -1.55);
      P.addEquipment('turret', cylY(0.013, 0.015, 2.0, 8), s * 0.60, 0.78 + 1.0, -1.55, 0, 0, s * 0.03);
    }
    P.turretG.userData.m41TurretReceipt = {
      revision: 'm41-265', mark, roofY: ROOF_Y, turretHalfWidth: 1.13, bustleRearZ: -1.96,
      sideBaskets: dk, rearBasket: dk, bustleRack: !dk, dischargers: dk ? 8 : 0, thermalSightBox: dk,
    };
    for (const s of [-1, 1] as const) {
      P.decal('turret', 'number', P.spec.visual.number || '26', 0.20, [s * (sideAt(0.42, -0.30) + 0.004), 0.42, -0.30], s * Math.PI / 2);
    }
  };
  buildM41TurretFittings();
  yield 'buildM41TurretFittings';

  // ---------------------------------------------------------------- gun shield, sight and gun --
  const buildM41Gun = (): void => {
    P.gunG.position.set(0, TRUNNION.y, TRUNNION.z);
    // the cast gun shield: a rounded block standing proud of the nose, the coax and telescope ports in its face
    P.addGunExtra(castSolid([
      { z: -0.14, bot: -0.31, top: 0.31, hw: 0.62, roof: 0.70, foot: 0.70, waist: 0.5, nUp: 4, nLo: 4 },
      { z: 0.20, bot: -0.29, top: 0.29, hw: 0.60, roof: 0.66, foot: 0.66, waist: 0.5, nUp: 3.4, nLo: 3.4 },
      { z: 0.36, bot: -0.20, top: 0.20, hw: 0.46, roof: 0.54, foot: 0.54, waist: 0.5, nUp: 2.6, nLo: 2.6 },
    ], P.q));
    P.addGunExtraDark(box(0.06, 0.06, 0.04), 0.30, 0.04, 0.36);
    P.addGunExtraDark(box(0.07, 0.07, 0.04), -0.28, 0.10, 0.35);
    if (dk) {
      // the DK-1's canvas cover gathered round the shield and the tube
      P.add('gunMountCloth', xform(sph(0.46, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [1.36, 0.70, 0.66]), 0, -0.01, 0.22);
      for (const x of [-0.30, 0, 0.30]) P.add('gunMountCloth', box(0.04, 0.40, 0.20), x, -0.01, 0.30);
      // the Jahn Anderson thermal sight and the Ericsson laser rangefinder in one armoured box on the mantlet's right
      P.add('gunMount', box(0.38, 0.26, 0.58), -0.44, 0.42, 0.18);
      P.add('gunMountDark', box(0.30, 0.16, 0.02), -0.44, 0.42, 0.475);
      P.add('gunMountGlass', box(0.24, 0.11, 0.008), -0.44, 0.42, 0.487);
      P.add('gunMount', box(0.06, 0.18, 0.30), -0.44, 0.22, 0.10);
    } else {
      // the halogen searchlight's bracket on the shield's top (the lamp itself rides in the fender box in transit)
      P.add('gunMountDark', box(0.30, 0.04, 0.12), 0, 0.27, 0.16);
    }
    // 76 mm M32: a slight taper, the bore evacuator near the muzzle, the T-shaped blast deflector (pattonCast's M36 at
    // the 76 mm gun's size)
    // (the muzzle 5.30 m ahead of the hull's origin: the published 8.21 m over the gun from the 2.91 m stern)
    const len = 3.98, r0 = 0.062, r1 = 0.050, devL = 0.24, tube0 = 0.20, seg = P.q ? 22 : 12;
    const tubeL = len - tube0 - devL;
    P.add('gun', cylZ(r1, tubeL, seg, r0), 0, 0, tube0 + tubeL / 2);
    const ez0 = 2.52, ez1 = 3.08, er = 0.095;
    P.add('gun', cylZ(er, ez1 - ez0 - 0.08, seg), 0, 0, (ez0 + ez1) / 2);
    P.add('gun', cylZ(er, 0.04, seg, r0 * 0.9), 0, 0, ez0 + 0.02);
    P.add('gun', cylZ(r1 * 0.98, 0.04, seg, er), 0, 0, ez1 - 0.02);
    const z0 = len - devL;
    P.add('gun', cylZ(r1, devL, seg), 0, 0, z0 + devL / 2);
    P.add('gun', cylX(0.095, 0.50, seg), 0, 0, len - 0.22);
    for (const s of [-1, 1] as const) P.add('gunDark', cylX(0.075, 0.012, seg), s * 0.251, 0, len - 0.22);
    P.add('gun', box(0.36, 0.15, 0.11), 0, 0, len - 0.07);
    P.add('gun', cylZ(r1 * 1.3, 0.06, seg), 0, 0, z0 + 0.03);
    muzzleBore(P, { z: len + 0.004, r: r1 * 0.78 });
    P.muzzleZ = len;
    P.gunG.userData.m41MantletReceipt = { thermalSightBox: dk ? 'right' : null, canvasCover: dk, barrelRadius: r1, device: 'T-deflector' };
    P.mats.glass.color.setHex(0x3e493b);
    P.mats.glass.roughness = 0.48;
    P.mats.glass.metalness = 0.30;
    P.topY = RING.y;
  };
  buildM41Gun();
}

export const buildM41A3 = steppedBuilder((P: TankBuilderPort) => buildM41Steps(P, 'us'));
export const buildM41BW = steppedBuilder((P: TankBuilderPort) => buildM41Steps(P, 'bw'));
export const buildM41JGSDF = steppedBuilder((P: TankBuilderPort) => buildM41Steps(P, 'jgsdf'));
export const buildM41DK1 = steppedBuilder((P: TankBuilderPort) => buildM41Steps(P, 'dk1'));

export const M41_PROFILES = {
  m41a3: { build: buildM41A3 },
  m41_bw: { build: buildM41BW },
  m41_jgsdf: { build: buildM41JGSDF },
  m41dk1: { build: buildM41DK1 },
};
