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
// Every datum is the supplied model's (docs/references/tanks/m41a3.md: SIpriv's "Low poly M41Walker Bulldog", CC-BY-4.0,
// sha256 127ca9ed…, a comparison print only): turned to face +Z, centred on its hull, ground at its lowest point and
// scaled once (x1.8484) to the published 5.82 m hull. Measured by raycasts (.qa-dev m41rays): the belly at 0.29, the
// lower hull's sides at ±1.15, the sponsons at ±1.33 to a 1.44 deck, the fenders' outer edge at ±1.65, the 37 degree
// glacis to a nose at 0.88, five 0.716 m road wheels on a 0.81 m pitch, three return rollers, the track 0.58 m wide on
// ±1.43 (3.38 m over the tracks against the published 3.20: the print's width, recorded as a conflict).
const H = Object.freeze({
  noseZ: 2.86, sternZ: -2.68, bellyY: 0.29, lowerX: 1.15, sponsonX: 1.33, sponsonY: 1.22, fenderX: 1.65, fenderY: 1.33,
  deckY: 1.44, trackXc: 1.43, trackW: 0.58, skirtX: 1.70,
});
const ROAD_WHEEL_ZS = [1.572, 0.764, -0.045, -0.854, -1.662];
const RING = Object.freeze({ y: 1.44, z: 0.20 });
/** The turret (turret metres), the print's stations: the long cast nose narrowing to the gun shield, the flanks widest
 * low and leaning in to a 0.74 m roof, the underside rising behind the ring and the long bustle tapering to its rear
 * plate. */
const TURRET: readonly CastStation[] = Object.freeze([
  { z: 1.50, bot: 0.07, top: 0.54, hw: 0.62, roof: 0.56, foot: 0.84, waist: 0.30, nUp: 2.6, nLo: 3.5 },
  { z: 1.30, bot: 0.04, top: 0.60, hw: 0.70, roof: 0.62, foot: 0.86, waist: 0.20, nUp: 2.8, nLo: 4 },
  { z: 1.10, bot: 0.04, top: 0.64, hw: 0.81, roof: 0.68, foot: 0.88, waist: 0.17, nUp: 3, nLo: 4 },
  { z: 0.90, bot: 0.04, top: 0.67, hw: 0.97, roof: 0.72, foot: 0.90, waist: 0.15, nUp: 3, nLo: 4 },
  { z: 0.70, bot: 0.04, top: 0.71, hw: 1.08, roof: 0.75, foot: 0.92, waist: 0.15, nUp: 3, nLo: 4 },
  { z: 0.50, bot: 0.03, top: 0.74, hw: 1.13, roof: 0.76, foot: 0.93, waist: 0.15, nUp: 3, nLo: 4 },
  { z: 0.00, bot: 0.0, top: 0.74, hw: 1.12, roof: 0.76, foot: 0.93, waist: 0.15, nUp: 3, nLo: 4 },
  { z: -0.60, bot: 0.0, top: 0.74, hw: 1.04, roof: 0.78, foot: 0.62, waist: 0.40, nUp: 3, nLo: 3 },
  { z: -1.10, bot: 0.0, top: 0.74, hw: 0.88, roof: 0.80, foot: 0.40, waist: 0.50, nUp: 3, nLo: 2.5 },
  { z: -1.25, bot: 0.12, top: 0.74, hw: 0.84, roof: 0.81, foot: 0.70, waist: 0.45, nUp: 3, nLo: 3 },
  { z: -1.40, bot: 0.21, top: 0.74, hw: 0.80, roof: 0.82, foot: 0.85, waist: 0.40, nUp: 3, nLo: 4 },
  { z: -1.80, bot: 0.31, top: 0.73, hw: 0.70, roof: 0.84, foot: 0.90, waist: 0.40, nUp: 3, nLo: 4 },
  { z: -2.25, bot: 0.30, top: 0.70, hw: 0.66, roof: 0.84, foot: 0.90, waist: 0.40, nUp: 3, nLo: 4 },
]);
const ROOF_Y = 0.74;
const TRUNNION = Object.freeze({ y: 0.315, z: 1.30 });

function* buildM41Steps(P: TankBuilderPort, mark: M41Mark): TankProfileBuild {
  const { box, cylX, cylY, cylZ, sph, xform, buildRunningGear, headlight, liftEye, towCable, stowage, jerryCan, tarpRoll,
    torus } = KIT;
  const slab = orientedSlab;
  const { rng } = P;
  const dk = mark === 'dk1';
  const bar = (slot: string, a: readonly number[], b: readonly number[], r: number): void => {
    P.add(slot, beamBetween([a[0], a[1], a[2]], [b[0], b[1], b[2]], r, 8));
  };
  // the deck: level at 1.44-1.45 (a step down onto the glacis ahead of the driver), sloping from 2.0 m aft to the
  // rear plate; the glacis 37 degrees to the nose
  const DECK: readonly (readonly [number, number])[] = [[H.sternZ, 1.17], [-2.40, 1.29], [-2.00, 1.41], [1.85, 1.45],
    [1.95, 1.34], [2.15, 1.33], [H.noseZ, 0.88]];
  const deckY = (z: number): number => {
    if (z <= DECK[0][0]) return DECK[0][1];
    for (let i = 0; i + 1 < DECK.length; i++) {
      const [z0, y0] = DECK[i], [z1, y1] = DECK[i + 1];
      if (z <= z1) return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
    }
    return DECK.at(-1)![1];
  };

  // ---------------------------------------------------------------- hull --
  const buildM41Hull = (): void => {
    // the lower hull between the tracks: the belly, its rise to the nose and to the rear plate
    const BELLY: readonly (readonly [number, number, number])[] = [[H.sternZ, 0.80, 1.15], [-2.45, 0.30, 1.24],
      [-2.30, 0.29, 1.27], [1.70, 0.29, 1.27], [2.30, 0.50, 1.10], [H.noseZ - 0.02, 0.76, 0.84]];
    P.add('hull', sectionSolid(BELLY.map(([z, b, top]) => ({ z, ring: [[-H.lowerX, b], [H.lowerX, b], [H.lowerX, top], [-H.lowerX, top]] }))));
    // the upper hull over the tracks to the deck, the deck stations above
    const upper = (z: number): readonly SectionPoint[] => [
      [-H.sponsonX, H.sponsonY], [H.sponsonX, H.sponsonY], [H.sponsonX, deckY(z) - 0.03], [H.sponsonX - 0.05, deckY(z)],
      [-(H.sponsonX - 0.05), deckY(z)], [-H.sponsonX, deckY(z) - 0.03],
    ];
    P.add('hull', sectionSolid([-2.30, -2.00, 1.85, 1.95].map((z) => ({ z, ring: upper(z) }))));
    // the rear deck falling to the rear plate, the sponsons' width
    P.add('hull', slab(
      [-H.sponsonX, deckY(H.sternZ) - 0.05, H.sternZ], [H.sponsonX, deckY(H.sternZ) - 0.05, H.sternZ],
      [H.sponsonX, H.sponsonY, -2.30], [-H.sponsonX, H.sponsonY, -2.30],
      [-H.sponsonX, deckY(H.sternZ), H.sternZ], [H.sponsonX, deckY(H.sternZ), H.sternZ],
      [H.sponsonX, deckY(-2.30), -2.30], [-H.sponsonX, deckY(-2.30), -2.30]));
    // the glacis from the step to the nose, the full width of the sponsons
    P.add('hull', slab(
      [-H.sponsonX, 1.27, 1.95], [H.sponsonX, 1.27, 1.95], [H.lowerX, 0.82, H.noseZ], [-H.lowerX, 0.82, H.noseZ],
      [-H.sponsonX, 1.34, 1.95], [H.sponsonX, 1.34, 1.95], [H.lowerX, 0.88, H.noseZ], [-H.lowerX, 0.88, H.noseZ]));
    P.add('hull', box(H.sponsonX * 2, 0.08, 0.22), 0, 1.30, 2.06);
    // the rear plate
    P.add('hull', box(H.sponsonX * 2, 0.40, 0.06), 0, 0.98, H.sternZ - 0.01);
    // fenders over the tracks on brackets under their outer edge, sloping down over the idlers and the sprockets
    for (const s of [-1, 1] as const) {
      P.add('hullDetail', box(H.fenderX - H.sponsonX + 0.02, 0.025, 4.90), s * (H.sponsonX + H.fenderX) / 2, H.fenderY - 0.0125, 0.0);
      P.add('hullDetail', box(0.012, 0.06, 4.90), s * (H.fenderX - 0.006), H.fenderY - 0.04, 0.0);
      for (const [za, zb] of [[2.45, 2.91], [-2.45, -2.91]] as const) {
        const ya = H.fenderY, yb = 1.00;
        P.add('hullDetail', slab(
          [s * (H.sponsonX - 0.02), ya - 0.025, za], [s * H.fenderX, ya - 0.025, za], [s * H.fenderX, yb - 0.025, zb], [s * (H.sponsonX - 0.02), yb - 0.025, zb],
          [s * (H.sponsonX - 0.02), ya, za], [s * H.fenderX, ya, za], [s * H.fenderX, yb, zb], [s * (H.sponsonX - 0.02), yb, zb]));
      }
      if (!dk) for (const z of [-2.0, -0.70, 0.60, 1.80]) {
        P.add('hullDetail', box(0.03, 0.10, 0.04), s * (H.fenderX - 0.03), H.fenderY - 0.07, z);
        P.add('hullDetail', box(H.fenderX - H.sponsonX, 0.025, 0.04), s * (H.sponsonX + H.fenderX) / 2, H.fenderY - 0.09, z, 0, 0, s * 0.18);
      }
      // the rear mud flaps under the fender's tail
      P.hangMudguard('m41-rear-flap', 'hullRubber', box(0.50, 0.30, 0.012), s * H.trackXc, 0.84, -2.93);
    }
  };
  buildM41Hull();
  yield 'buildM41Hull';

  // ---------------------------------------------------------------- running gear (the Pattons') --
  const roadWheelR = 0.358, roadWheelY = 0.404, wheelW = 0.26;
  const rollers = [1.226, -0.276, -1.316].map((z) => ({ z, y: 0.993, r: 0.116 }));
  const buildM41RunningGear = (): void => {
    buildRunningGear(P, {
      style: 'dished', wheelR: roadWheelR, wheelW, wheelY: roadWheelY, xc: H.trackXc, wheelZs: [...ROAD_WHEEL_ZS],
      sprocket: { z: -2.321, y: 0.820, r: 0.358 }, idler: { z: 2.277, y: 0.797, r: 0.329 }, rollers,
      trackW: H.trackW, topY: 0.993 + 0.04, botY: 0.03, contactZF: ROAD_WHEEL_ZS[0], contactZR: ROAD_WHEEL_ZS.at(-1),
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
          P.hangMudguard('m41dk1-skirt', 'hull', box(0.012, 0.34, z0 - z1), s * H.skirtX, H.fenderY - 0.19, (z0 + z1) / 2);
          P.add('hullDetail', box(0.016, 0.36, 0.03), s * (H.skirtX + 0.002), H.fenderY - 0.19, z1 - 0.02);
        }
        P.add('hullDetail', box(0.07, 0.03, 4.60), s * (H.skirtX - 0.03), H.fenderY - 0.015, -0.26);
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
      const x = s * 0.86, z = 2.50, y = deckY(z) + 0.04;
      for (const dx of [-0.08, 0.08]) headlight(P, x + dx, y + 0.03, z, -0.20);
      const g = [[x - 0.20, y - 0.02, z - 0.04], [x - 0.20, y + 0.16, z + 0.10], [x + 0.20, y + 0.16, z + 0.10], [x + 0.20, y - 0.02, z - 0.04]];
      for (let i = 0; i + 1 < g.length; i++) bar('hullDark', g[i], g[i + 1], 0.012);
      bar('hullDark', [x, y + 0.16, z + 0.10], [x, deckY(z - 0.12) + 0.005, z - 0.12], 0.010);
      P.add('hullDark', box(0.10, 0.12, 0.10), s * 0.62, 0.80, H.noseZ - 0.02);
      P.add('hullDark', torus(0.06, 0.018, 12, 6), s * 0.62, 0.80, H.noseZ + 0.05, Math.PI / 2, 0, 0);
      liftEye(P, 'hullDetail', s * 1.20, deckY(1.70) + 0.015, 1.70, s * 0.4);
      // tail lights in their guards
      P.add('hullGlass', box(0.10, 0.08, 0.018), s * 0.96, 1.05, H.sternZ - 0.045);
      P.add('hullDark', box(0.16, 0.14, 0.06), s * 0.96, 1.05, H.sternZ - 0.07);
    }
    if (dk) {
      // the DK-1's spare track links in brackets on the glacis, two blocks either side of the centre
      for (const x of [-0.28, 0.28]) for (let k = 0; k < 3; k++) {
        const z = 2.22 + k * 0.17, y = deckY(z) + 0.035;
        P.addEquipment('hullDark', box(0.30, 0.05, 0.15), x, y, z);
        P.addEquipment('hullDark', box(0.08, 0.07, 0.05), x, y + 0.02, z);
      }
    } else {
      // the gun's travel lock folded on the engine deck
      P.addEquipment('hullDark', box(0.10, 0.10, 0.10), 0, deckY(-2.30) + 0.05, -2.30);
      bar('hullDark', [-0.08, deckY(-2.30) + 0.06, -2.30], [-0.08, deckY(-2.0) + 0.06, -2.0], 0.02);
      bar('hullDark', [0.08, deckY(-2.30) + 0.06, -2.30], [0.08, deckY(-2.0) + 0.06, -2.0], 0.02);
    }
    towCable(P, [[-0.95, deckY(2.68) + 0.05, 2.68], [0, deckY(2.72) + 0.05, 2.72], [0.95, deckY(2.68) + 0.05, 2.68]], 0.022);
    // fender stowage boxes: the long box amidships each side, the rear pair over the sprocket's run
    for (const s of [-1, 1] as const) {
      P.addEquipment('hull', box(0.30, 0.26, 1.10), s * 1.49, H.fenderY + 0.13, -0.55);
      P.addEquipment('hullDark', box(0.31, 0.02, 1.11), s * 1.49, H.fenderY + 0.27, -0.55);
      for (const z of [-0.85, -0.25]) P.addEquipment('hullDark', box(0.014, 0.05, 0.04), s * 1.645, H.fenderY + 0.20, z);
      P.addEquipment('hull', box(0.30, 0.24, 0.70), s * 1.49, H.fenderY + 0.12, -1.75);
      P.addEquipment('hullDark', box(0.31, 0.02, 0.71), s * 1.49, H.fenderY + 0.25, -1.75);
    }
    // the engine deck: grille fields either side, the rear exhaust box over the plate (the DK-1's Cummins deck carries a
    // larger box and its own grilles)
    for (const s of [-1, 1] as const) {
      P.add('hullDark', box(0.86, 0.018, 1.10), s * 0.55, deckY(-1.55) + 0.009, -1.55);
      for (let k = 0; k < 6; k++) P.addEquipment('hull', box(0.80, 0.014, 0.035), s * 0.55, deckY(-1.55) + 0.012, -1.10 - k * 0.18);
    }
    const exhaustW = dk ? 1.40 : 1.10;
    P.addEquipment('hullDark', box(exhaustW, 0.20, 0.26), 0, deckY(-2.52) + 0.08, -2.52);
    for (let k = 0; k < 4; k++) P.addEquipment('hull', box(exhaustW - 0.10, 0.015, 0.03), 0, deckY(-2.52) + 0.185, -2.43 - k * 0.055);
    if (!dk) for (const s of [-1, 1] as const) {
      // the gasoline M41's twin exhaust deflectors on the rear plate
      P.addEquipment('hullDark', box(0.34, 0.16, 0.12), s * 0.50, 0.98, H.sternZ - 0.10);
      P.addEquipment('hullDark', cylZ(0.07, 0.10, 12), s * 0.50, 0.98, H.sternZ - 0.19);
    }
    jerryCan(P, 'hullCloth', -1.49, H.fenderY + 0.18, -2.25, 0.16);
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
    P.add('turret', box(0.96, 0.44, 0.10), 0, TRUNNION.y, TRUNNION.z + 0.16);
    for (const s of [-1, 1] as const) {
      liftEye(P, 'turretDetail', s * 0.80, ROOF_Y + 0.005, 0.50, s * 0.4);
      liftEye(P, 'turretDetail', s * 0.56, ROOF_Y + 0.005, -1.80, s * 2.7);
    }
  };
  buildM41Turret();
  yield 'buildM41Turret';

  const buildM41TurretFittings = (): void => {
    // the commander's cupola (right, -x): armoured ring, vision blocks, hatch; its machine gun on a pintle at the rear
    const cx = -0.45, cz = -0.25, cr = 0.31;
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
        const x = s * 1.22, z0 = -2.00, z1 = 0.10;
        P.addEquipment('turretOpenLattice', box(0.03, 0.03, z1 - z0), x, 0.50, (z0 + z1) / 2);
        P.addEquipment('turretOpenLattice', box(0.03, 0.03, z1 - z0), x, 0.12, (z0 + z1) / 2);
        for (let k = 0; k <= 8; k++) P.addEquipment('turretOpenLattice', box(0.02, 0.40, 0.02), x, 0.31, z0 + (z1 - z0) * k / 8);
        for (let k = 1; k < 4; k++) P.addEquipment('turretOpenLattice', box(0.012, 0.012, z1 - z0), x, 0.12 + k * 0.095, (z0 + z1) / 2);
        P.addEquipment('turretOpenLattice', box(0.22, 0.025, z1 - z0), s * 1.11, 0.12, (z0 + z1) / 2);
        for (const z of [z0 + 0.10, (z0 + z1) / 2, z1 - 0.10]) {
          const wall = sideAt(0.48, z);
          P.addEquipment('turretDark', box(1.22 - wall + 0.02, 0.04, 0.04), s * (wall + 1.22) / 2, 0.48, z);
        }
      }
      const z = -2.62;
      P.addEquipment('turretOpenLattice', box(2.00, 0.03, 0.03), 0, 0.62, z);
      P.addEquipment('turretOpenLattice', box(2.00, 0.03, 0.03), 0, 0.32, z);
      for (let k = 0; k <= 8; k++) P.addEquipment('turretOpenLattice', box(0.02, 0.33, 0.02), -1.0 + k * 0.25, 0.47, z);
      P.addEquipment('turretOpenLattice', box(1.98, 0.025, 0.40), 0, 0.32, z + 0.19);
      for (const s of [-1, 1] as const) P.addEquipment('turretOpenLattice', box(0.03, 0.03, 0.42), s * 1.0, 0.62, z + 0.21);
      stowage(P, 'turretCloth', rng, [[-0.48, 0.48, -2.44, 0.62, 0.28, 0.30], [0.42, 0.48, -2.44, 0.66, 0.28, 0.30]]);
    } else {
      // the US bustle rack: rails round the bustle's tail with a canvas load (the Pattons' rack); the BW and JGSDF
      // tanks load it with their own kit
      const z0 = -2.24, z1 = -2.62, half = 0.70, floorY = 0.32, railY = 0.64;
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
        ? [[-0.34, floorY + 0.15, -2.43, 0.56, 0.26, 0.30], [0.36, floorY + 0.13, -2.43, 0.52, 0.22, 0.30]]
        : mark === 'jgsdf'
          ? [[0.0, floorY + 0.14, -2.43, 1.10, 0.24, 0.30]]
          : [[half * 0.35, floorY + 0.15, -2.43, half * 0.7, 0.26, 0.26]];
      stowage(P, 'turretCloth', rng, load);
      if (mark === 'bw') jerryCan(P, 'turretCloth', -0.56, floorY + 0.20, -2.36, 0.16);
      if (mark === 'jgsdf') P.addEquipment('turretDark', box(0.36, 0.20, 0.26), 0.42, floorY + 0.11, -2.43);
    }
    // whip antennas on the bustle
    for (const s of [-1, 1] as const) {
      P.addEquipment('turret', box(0.08, 0.08, 0.08), s * 0.45, ROOF_Y + 0.03, -1.70);
      P.addEquipment('turret', cylY(0.013, 0.015, 2.0, 8), s * 0.45, ROOF_Y + 1.03, -1.70, 0, 0, s * 0.03);
    }
    P.turretG.userData.m41TurretReceipt = {
      revision: 'm41-265-oracle', mark, roofY: ROOF_Y, turretHalfWidth: 1.13, bustleRearZ: -2.25,
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
    // the cast gun shield closing the nose (the print's tip: 0.46 m half-wide at the turret's 1.75 m station), the coax
    // and telescope ports in its face
    P.addGunExtra(castSolid([
      { z: -0.06, bot: -0.25, top: 0.25, hw: 0.62, roof: 0.58, foot: 0.70, waist: 0.5, nUp: 3, nLo: 3 },
      { z: 0.22, bot: -0.21, top: 0.21, hw: 0.56, roof: 0.56, foot: 0.62, waist: 0.5, nUp: 2.8, nLo: 2.8 },
      { z: 0.48, bot: -0.14, top: 0.14, hw: 0.44, roof: 0.50, foot: 0.50, waist: 0.5, nUp: 2.4, nLo: 2.4 },
    ], P.q));
    P.addGunExtraDark(box(0.06, 0.06, 0.04), 0.30, 0.02, 0.43);
    P.addGunExtraDark(box(0.07, 0.07, 0.04), -0.28, 0.07, 0.42);
    P.addGunExtra(cylZ(0.17, 0.10, P.q ? 20 : 12, 0.18), 0, 0, 0.52);
    if (dk) {
      // the DK-1's canvas cover gathered round the shield and the tube
      P.add('gunMountCloth', xform(sph(0.46, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [1.36, 0.58, 0.62]), 0, -0.01, 0.30);
      for (const x of [-0.30, 0, 0.30]) P.add('gunMountCloth', box(0.04, 0.34, 0.20), x, -0.01, 0.40);
      // the Jahn Anderson thermal sight and the Ericsson laser rangefinder in one armoured box on the shield's right
      P.add('gunMount', box(0.36, 0.25, 0.56), -0.44, 0.33, 0.26);
      P.add('gunMountDark', box(0.30, 0.16, 0.02), -0.44, 0.33, 0.545);
      P.add('gunMountGlass', box(0.24, 0.11, 0.008), -0.44, 0.33, 0.557);
      P.add('gunMount', box(0.06, 0.16, 0.30), -0.44, 0.15, 0.16);
    } else {
      // the halogen searchlight's bracket on the shield's top (the lamp rides in the fender box in transit)
      P.add('gunMountDark', box(0.30, 0.04, 0.12), 0, 0.24, 0.20);
    }
    // 76 mm M32: a slight taper, the bore evacuator 0.5 m short of the muzzle, the T-shaped blast deflector (pattonCast's
    // M36 at the 76 mm gun's size); the muzzle on the print's 5.21 m
    const len = 5.21 - (RING.z + TRUNNION.z), r0 = 0.066, r1 = 0.058, devL = 0.22, tube0 = 0.20, seg = P.q ? 22 : 12;
    const tubeL = len - tube0 - devL;
    P.add('gun', cylZ(r1, tubeL, seg, r0), 0, 0, tube0 + tubeL / 2);
    const ez0 = len - 0.72, ez1 = len - 0.36, er = 0.085;
    P.add('gun', cylZ(er, ez1 - ez0 - 0.08, seg), 0, 0, (ez0 + ez1) / 2);
    P.add('gun', cylZ(er, 0.04, seg, r0 * 0.9), 0, 0, ez0 + 0.02);
    P.add('gun', cylZ(r1 * 0.98, 0.04, seg, er), 0, 0, ez1 - 0.02);
    const z0 = len - devL;
    P.add('gun', cylZ(r1, devL, seg), 0, 0, z0 + devL / 2);
    P.add('gun', cylX(0.085, 0.44, seg), 0, 0, len - 0.20);
    for (const s of [-1, 1] as const) P.add('gunDark', cylX(0.066, 0.012, seg), s * 0.221, 0, len - 0.20);
    P.add('gun', box(0.30, 0.13, 0.10), 0, 0, len - 0.06);
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
