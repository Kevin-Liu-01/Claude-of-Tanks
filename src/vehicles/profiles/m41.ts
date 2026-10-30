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

function castSolid(stations: readonly CastStation[], q: boolean | undefined, crispRoof = false): Geo {
  const k = q ? RING_HIGH : RING_LOW;
  const sections = [...stations].sort((a, b) => a.z - b.z).map((s) => ({ z: s.z, ring: castRing(s, k) }));
  const n = sections[0].ring.length;
  // crispRoof: the roof's strips (from the right roof edge across to the left one) keep their face normals, so the flanks
  // meet the roof at a hard edge instead of shading round into it
  const roof0 = k.lo + k.up, roof1 = roof0 + 2 * k.roof - 1;
  const smooth = Array.from({ length: n - (k.floor + 1) }, (_, i) => i).filter((i) => !crispRoof || i < roof0 || i > roof1);
  return sectionSolid(sections, { centeredSideQuads: true, smoothSideEdges: smooth });
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
 * low and leaning in to a 0.74 m roof, the underside rising behind the ring and the long bustle to its rear plate.
 * Round 3 (blind critics against the 1961 and Aalborg photographs): from the cheeks aft the flanks are near-flat plates
 * widest at their foot (nUp 1.3, waist 0.08) meeting the roof at a hard edge (castSolid crispRoof), and the bustle runs
 * nearly as wide as the turret to a square rear plate (it tapered to 58% of the width and read as a pebble). */
const TURRET: readonly CastStation[] = Object.freeze([
  { z: 1.50, bot: 0.07, top: 0.54, hw: 0.62, roof: 0.56, foot: 0.84, waist: 0.30, nUp: 2.6, nLo: 3.5 },
  { z: 1.30, bot: 0.04, top: 0.60, hw: 0.70, roof: 0.62, foot: 0.86, waist: 0.20, nUp: 2.4, nLo: 4 },
  { z: 1.10, bot: 0.04, top: 0.64, hw: 0.81, roof: 0.68, foot: 0.90, waist: 0.15, nUp: 2.0, nLo: 4 },
  { z: 0.90, bot: 0.04, top: 0.67, hw: 0.97, roof: 0.72, foot: 0.93, waist: 0.10, nUp: 1.6, nLo: 4 },
  { z: 0.70, bot: 0.04, top: 0.71, hw: 1.08, roof: 0.75, foot: 0.95, waist: 0.08, nUp: 1.3, nLo: 4 },
  { z: 0.50, bot: 0.03, top: 0.74, hw: 1.13, roof: 0.76, foot: 0.96, waist: 0.08, nUp: 1.3, nLo: 4 },
  { z: 0.00, bot: 0.0, top: 0.74, hw: 1.12, roof: 0.77, foot: 0.96, waist: 0.08, nUp: 1.3, nLo: 4 },
  { z: -0.60, bot: 0.0, top: 0.74, hw: 1.08, roof: 0.79, foot: 0.62, waist: 0.30, nUp: 1.3, nLo: 3 },
  { z: -1.10, bot: 0.0, top: 0.74, hw: 1.01, roof: 0.82, foot: 0.40, waist: 0.40, nUp: 1.3, nLo: 2.5 },
  { z: -1.25, bot: 0.12, top: 0.74, hw: 0.99, roof: 0.83, foot: 0.70, waist: 0.38, nUp: 1.3, nLo: 3 },
  { z: -1.40, bot: 0.21, top: 0.74, hw: 0.97, roof: 0.84, foot: 0.85, waist: 0.34, nUp: 1.3, nLo: 4 },
  { z: -1.80, bot: 0.31, top: 0.73, hw: 0.93, roof: 0.85, foot: 0.92, waist: 0.30, nUp: 1.3, nLo: 4 },
  { z: -2.20, bot: 0.30, top: 0.71, hw: 0.88, roof: 0.86, foot: 0.93, waist: 0.30, nUp: 1.3, nLo: 4 },
  { z: -2.25, bot: 0.30, top: 0.70, hw: 0.87, roof: 0.86, foot: 0.93, waist: 0.30, nUp: 1.3, nLo: 4 },
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
        if (dk && za > 0) continue;
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
      P.hangMudguard('m41-rear-flap', 'hull', box(0.46, 0.22, 0.008), s * H.trackXc, 0.88, -2.93);
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
      // the rubber tyre's outer band (the 1961 Fort Stewart photograph: black tyres round light dished discs)
      P.add('hullRubber', torus(roadWheelR - 0.028, 0.024, P.q ? 28 : 16, 6), s * (H.trackXc + wheelW / 2 - 0.004), roadWheelY, z,
        0, 0, Math.PI / 2);
    }
    for (const rl of rollers) for (const s of [-1, 1] as const) {
      P.add('hullRunningGearDetail', box(0.07, 0.10, 0.12), s * (H.trackXc - H.trackW * 0.5 - 0.02), rl.y + 0.02, rl.z);
    }
    if (dk) {
      // the DK-1's Leopard-pattern skirts (the Aalborg photographs): hinged steel panels in the coat from the fender's edge
      // down over the upper track run and the road wheels' upper half, outboard of the track and the sprocket's rim
      const skirtX = 1.77, top = H.fenderY - 0.01, low = 0.56;
      for (const s of [-1, 1] as const) {
        for (let k = 0; k < 5; k++) {
          const z0 = 2.10 - k * 0.90, z1 = z0 - 0.86;
          P.hangMudguard('m41dk1-skirt', 'hull', box(0.012, top - low, z0 - z1), s * skirtX, (top + low) / 2, (z0 + z1) / 2);
          P.add('hullDetail', box(0.016, top - low + 0.02, 0.03), s * (skirtX + 0.002), (top + low) / 2, z1 - 0.02);
        }
        P.add('hullDetail', box(skirtX - H.fenderX + 0.03, 0.03, 4.60), s * (skirtX + H.fenderX) / 2, H.fenderY - 0.015, -0.26);
      }
    }
    P.mats.rubber.color.setHex(0x34372d);
  };
  buildM41RunningGear();
  yield 'buildM41RunningGear';

  // ---------------------------------------------------------------- hull fittings --
  const buildM41HullFittings = (): void => {
    // the driver's hatch (front left, +x), near flush under the turret nose's 1.48 underside, and his periscope on the
    // step down ahead of it, below the gun shield's sweep at full depression
    P.addCupola('hull', cylY(0.25, 0.26, 0.012, P.q ? 20 : 14), 0.55, deckY(1.55) + 0.006, 1.55);
    P.addEquipment('hull', box(0.16, 0.08, 0.10), 0.55, deckY(1.98) + 0.04, 1.98);
    P.add('hullGlass', box(0.12, 0.04, 0.012), 0.55, deckY(1.98) + 0.05, 2.032);
    // two headlights a side high on the glacis, in a brush guard of bent rod (the M47's pattern)
    for (const s of [-1, 1] as const) {
      const x = s * 0.86, z = 2.50, y = deckY(z) + 0.04;
      for (const dx of [-0.08, 0.08]) headlight(P, x + dx, y + 0.03, z, -0.20);
      const g = [[x - 0.20, y - 0.02, z - 0.04], [x - 0.20, y + 0.16, z + 0.10], [x + 0.20, y + 0.16, z + 0.10], [x + 0.20, y - 0.02, z - 0.04]];
      for (let i = 0; i + 1 < g.length; i++) bar('hullDark', g[i], g[i + 1], 0.012);
      bar('hullDark', [x, y + 0.16, z + 0.10], [x, deckY(z - 0.12) + 0.005, z - 0.12], 0.010);
      P.add('hullDark', box(0.10, 0.12, 0.10), s * 0.62, 0.80, H.noseZ - 0.02);
      P.add('hullDark', torus(0.06, 0.018, 12, 6), s * 0.62, 0.80, H.noseZ + 0.05, Math.PI / 2, 0, 0);
      liftEye(P, 'hullDetail', s * 1.20, deckY(2.02) + 0.015, 2.02, s * 0.4); // on the step, past the gun collar's reach
      // tail lights in their guards
      P.add('hullGlass', box(0.10, 0.08, 0.018), s * 0.96, 1.05, H.sternZ - 0.045);
      P.add('hullDark', box(0.16, 0.14, 0.06), s * 0.96, 1.05, H.sternZ - 0.07);
    }
    if (dk) {
      // the DK-1's spare track: two columns of four links standing off the glacis (the Aalborg photographs)
      const glacis = Math.atan2(1.34 - 0.88, H.noseZ - 1.95), zc = 2.42;
      for (const x of [-0.29, 0.29]) KIT.spareTrackStrip(P, 'hullTrack', x, deckY(zc) + 0.035, zc, 4, glacis, 0);
      // the Leopard-pattern front mudguards: curved over the front of each track down toward the idler's hub, a lamp
      // unit on each, the driver's mirror on the left one
      for (const s of [-1, 1] as const) {
        P.hangMudguard('m41dk1-front-guard-top', 'hull', box(0.62, 0.02, 0.12), s * H.trackXc, H.fenderY + 0.002, 2.51);
        const n = 6, r = 0.40, cz = 2.57, cy = 0.93;
        for (let k = 0; k < n; k++) {
          const a0 = (k / n) * 1.92, a1 = ((k + 1) / n) * 1.92, a = (a0 + a1) / 2, len = r * (a1 - a0) + 0.03;
          P.hangMudguard('m41dk1-front-guard', 'hull', box(0.62, 0.02, len), s * H.trackXc, cy + r * Math.cos(a), cz + r * Math.sin(a), a);
        }
        P.addEquipment('hullDark', box(0.18, 0.10, 0.12), s * H.trackXc, H.fenderY + 0.06, 2.50);
        headlight(P, s * H.trackXc, H.fenderY + 0.07, 2.57, 0, 0.045);
      }
      // the mirror's head kept under the barrel's pass at the front stop (on a 0.36 m stalk it held the gun at +5.5 deg)
      P.addEquipment('hullDark', cylY(0.012, 0.012, 0.12, 8), 1.66, H.fenderY + 0.06, 2.47);
      P.addEquipment('hullDark', box(0.02, 0.10, 0.11), 1.67, H.fenderY + 0.15, 2.47);
      // the low fender bins beside the turret, under the nose's sweep (tops at the deck's 1.44)
      for (const s of [-1, 1] as const) for (const [z0, z1] of [[1.85, 0.80], [0.74, -0.24], [-0.30, -1.24]] as const) {
        P.addEquipment('hull', box(0.29, 0.11, z0 - z1), s * 1.49, H.fenderY + 0.055, (z0 + z1) / 2);
        P.addEquipment('hull', box(0.30, 0.016, z0 - z1 + 0.01), s * 1.49, H.fenderY + 0.118, (z0 + z1) / 2);
        P.addEquipment('hullDark', box(0.012, 0.012, z0 - z1 - 0.02), s * 1.638, H.fenderY + 0.10, (z0 + z1) / 2);
        for (const f of [0.25, 0.75]) P.addEquipment('hullDark', box(0.014, 0.04, 0.04), s * 1.640, H.fenderY + 0.06, z1 + (z0 - z1) * f);
      }
      // the registration plate between the lamp clusters
      P.add('hullCanvasPale', box(0.42, 0.11, 0.012), 0, deckY(2.62) + 0.01, 2.62, glacis, 0, 0);
      P.decal('hull', 'stencil', '26 3-0', 0.40, [0, deckY(2.62) + 0.022, 2.625], 0, -(Math.PI / 2 - glacis));
      // the yellow bridge-class disc beside it (the Aalborg front photograph's "26")
      P.decal('hull', 'mlc', '26', 0.17, [0.50, deckY(2.68) + 0.006, 2.68], 0, -(Math.PI / 2 - glacis));
    } else {
      // the gun's travel lock folded on the engine deck
      P.addEquipment('hullDark', box(0.10, 0.10, 0.10), 0, deckY(-2.30) + 0.05, -2.30);
      bar('hullDark', [-0.08, deckY(-2.30) + 0.06, -2.30], [-0.08, deckY(-2.0) + 0.06, -2.0], 0.02);
      bar('hullDark', [0.08, deckY(-2.30) + 0.06, -2.30], [0.08, deckY(-2.0) + 0.06, -2.0], 0.02);
    }
    if (!dk) towCable(P, [[-0.95, deckY(2.68) + 0.05, 2.68], [0, deckY(2.72) + 0.05, 2.72], [0.95, deckY(2.68) + 0.05, 2.68]], 0.022);
    const glacisRx = -(Math.PI / 2 - Math.atan2(1.34 - 0.88, H.noseZ - 1.95));
    if (mark === 'bw') {
      // the Bundeswehr's white "Y" registration plates front and rear, the yellow bridge-class disc on the glacis
      const glacis = Math.atan2(1.34 - 0.88, H.noseZ - 1.95), text = 'Y-231 456';
      P.add('hullCanvasPale', box(0.52, 0.12, 0.012), 0, deckY(2.36) + 0.012, 2.36, glacis, 0, 0);
      P.decal('hull', 'stencil', text, 0.46, [0, deckY(2.36) + 0.024, 2.365], 0, glacisRx);
      P.add('hullCanvasPale', box(0.52, 0.12, 0.012), 0.55, 1.12, H.sternZ - 0.045);
      P.decal('hull', 'stencil', text, 0.46, [0.55, 1.12, H.sternZ - 0.053], Math.PI);
      P.decal('hull', 'mlc', '24', 0.17, [0.52, deckY(2.50) + 0.006, 2.50], 0, glacisRx);
    } else if (mark === 'jgsdf') {
      // the JGSDF's registration numbers painted white straight onto the glacis and the rear plate (no plates)
      P.decal('hull', 'stencilWhite', '12-3456', 0.46, [0, deckY(2.36) + 0.006, 2.36], 0, glacisRx);
      P.decal('hull', 'stencilWhite', '12-3456', 0.46, [0.55, 1.12, H.sternZ - 0.008], Math.PI);
    } else if (mark === 'us') {
      // the US Army's bumper codes front and rear (unit left, vehicle right)
      for (const [x, text] of [[-0.42, '3-66AR'], [0.42, 'B-24']] as const) {
        P.decal('hull', 'stencil', text, 0.30, [x, deckY(2.40) + 0.006, 2.40], 0, glacisRx);
        P.decal('hull', 'stencil', text, 0.30, [-x, 1.12, H.sternZ - 0.008], Math.PI);
      }
    }
    // fender stowage boxes over the sprocket's run, from z -1.30 aft: the turret nose and the gun shield reach 1.9 m from
    // the ring at 1.48-1.54, so nothing taller than the fender stands inside that radius (gun-depression sweep, 265)
    for (const s of [-1, 1] as const) {
      // (lids in the coat, a dark hinge line: r2 critics read black lids as unpainted); the DK-1 carries a second bin aft
      for (const [zc, len] of (dk ? [[-1.66, 0.72], [-2.30, 0.48]] : [[-1.66, 0.72]]) as readonly (readonly [number, number])[]) {
        P.addEquipment('hull', box(0.30, 0.24, len), s * 1.49, H.fenderY + 0.12, zc);
        P.addEquipment('hull', box(0.31, 0.02, len + 0.01), s * 1.49, H.fenderY + 0.25, zc);
        P.addEquipment('hullDark', box(0.012, 0.012, len - 0.04), s * 1.642, H.fenderY + 0.235, zc);
        for (const z of [zc - 0.24 * len / 0.72, zc + 0.24 * len / 0.72]) P.addEquipment('hullDark', box(0.014, 0.05, 0.04), s * 1.645, H.fenderY + 0.19, z);
      }
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
    // the DK-1's GPS antenna on the step ahead of the turret nose's reach
    if (mark === 'dk1') P.addEquipment('hullDark', cylY(0.06, 0.07, 0.035, 12), -0.95, deckY(2.05) + 0.018, 2.05);
  };
  buildM41HullFittings();
  yield 'buildM41HullFittings';

  // ---------------------------------------------------------------- turret --
  P.turretG.position.set(0, RING.y, RING.z);
  const sideAt = (y: number, z: number): number => castSideAt(TURRET, y, z);
  const buildM41Turret = (): void => {
    P.add('turret', cylY(0.92, 0.96, 0.10, P.q ? 28 : 18), 0, -0.05, 0);
    const body = castSolid(TURRET, P.q, true);
    body.userData.primaryStockRole = 'm41-turret';
    P.add('turret', body);
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
    P.addEquipment('turretDark', cylY(0.03, 0.04, 0.15, 10), cx, ROOF_Y + 0.285, cz - cr - 0.04);
    const mgY = ROOF_Y + 0.37;
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
      // Wegmann dischargers: four large-bore tubes on each basket's rear top (the Aalborg photographs)
      for (const s of [-1, 1] as const) {
        P.addEquipment('turret', box(0.16, 0.06, 0.72), s * 1.20, 0.63, -1.42);
        for (let k = 0; k < 4; k++) {
          P.addEquipment('turret', xform(markSmokeTube(cylZ(0.048, 0.26, P.q ? 12 : 8)), 0, 0, 0, -0.62, s * 0.35, 0),
            s * 1.20, 0.72, -1.16 - k * 0.17);
        }
      }
      // Leopard-pattern mesh baskets (the Aalborg photographs): closed boxes of fine mesh hung on the upper flanks from
      // flush with the turret's front, one either side of the gun, back to the bustle, standing well out from the walls,
      // so the turret reads square and wide from ahead (r3: an open rail fence to the deck read as a balcony). The mesh is
      // a painted face under a fine dark grid.
      const bx = 1.33, bLow = 0.24, bTop = 0.60, bz0 = -1.95, bz1 = 1.40, segs = 5;
      for (const s of [-1, 1] as const) {
        P.addEquipment('turretOpenLattice', box(0.012, bTop - bLow, bz1 - bz0), s * bx, (bLow + bTop) / 2, (bz0 + bz1) / 2);
        for (const y of [bLow, bTop]) P.addEquipment('turretOpenLattice', box(0.03, 0.03, bz1 - bz0 + 0.02), s * bx, y, (bz0 + bz1) / 2);
        for (let k = 0; k <= 30; k++) P.addEquipment('turretOpenLatticeDark', box(0.008, bTop - bLow - 0.03, 0.008), s * (bx + 0.009), (bLow + bTop) / 2, bz0 + (bz1 - bz0) * k / 30);
        for (let k = 1; k < 4; k++) P.addEquipment('turretOpenLatticeDark', box(0.008, 0.008, bz1 - bz0), s * (bx + 0.009), bLow + (bTop - bLow) * k / 4, (bz0 + bz1) / 2);
        for (let k = 0; k < segs; k++) {
          const z0 = bz0 + (bz1 - bz0) * k / segs, z1 = bz0 + (bz1 - bz0) * (k + 1) / segs, zc = (z0 + z1) / 2, wall = sideAt(bLow + 0.04, zc);
          // the floor and the top rail's cross bars back to the wall, a bracket into it
          P.addEquipment('turretOpenLattice', box(bx - wall, 0.02, z1 - z0 - 0.01), s * (bx + wall) / 2, bLow, zc);
          P.addEquipment('turretOpenLattice', box(bx - sideAt(bTop, z1) + 0.02, 0.022, 0.022), s * (bx + sideAt(bTop, z1)) / 2, bTop, z1);
          P.addEquipment('turretDark', box(bx - wall + 0.02, 0.04, 0.04), s * (bx + wall) / 2, bLow + 0.02, zc);
        }
        // the front end's mesh face, beside the gun
        const fw = sideAt((bLow + bTop) / 2, bz1);
        P.addEquipment('turretOpenLattice', box(bx - fw, bTop - bLow, 0.012), s * (bx + fw) / 2, (bLow + bTop) / 2, bz1);
        for (let k = 1; k < 5; k++) P.addEquipment('turretOpenLatticeDark', box(0.008, bTop - bLow - 0.03, 0.008), s * (fw + (bx - fw) * k / 5), (bLow + bTop) / 2, bz1 + 0.009);
        // the crew's kit inside
        stowage(P, 'turretCloth', rng, [[s * 1.12, bLow + 0.16, -1.30, 0.34, 0.28, 0.80], [s * 1.10, bLow + 0.14, 0.10, 0.30, 0.24, 0.70]]);
      }
      // the turret rear's closed stowage box, its faces sloping in toward the back (no deck rails)
      const rearBox = (hw: number, y0: number, y1: number): SectionPoint[] => [[-hw, y0], [hw, y0], [hw, y1], [-hw, y1]];
      P.addEquipment('turret', sectionSolid([{ z: -2.80, ring: rearBox(0.84, 0.30, 0.62) }, { z: -2.20, ring: rearBox(0.94, 0.22, 0.72) }]));
      P.addEquipment('turretDark', box(1.70, 0.02, 0.02), 0, 0.64, -2.79);
      for (const x of [-0.55, 0.55]) P.addEquipment('turretDark', box(0.06, 0.07, 0.025), x, 0.56, -2.81);
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
      // (the DK-1's number rides its rear box: its flanks are behind the baskets)
      if (!dk) P.decal('turret', 'number', P.spec.visual.number || '26', 0.20, [s * (sideAt(0.42, -0.30) + 0.004), 0.42, -0.30], s * Math.PI / 2);
      // the national mark on both flanks, sized to read at range: the US star, the Bundeswehr's cross, the JGSDF's badge
      if (!dk) P.decal('turret', mark === 'us' ? 'star' : mark === 'bw' ? 'cross' : 'emblem', null, 0.40,
        [s * (sideAt(0.40, -1.05) + 0.004), 0.40, -1.05], s * Math.PI / 2);
    }
    if (dk) P.decal('turret', 'number', P.spec.visual.number || '26', 0.26, [0, 0.47, -2.805], Math.PI);
    if (mark === 'bw') P.decal('hull', 'cross', null, 0.34, [-0.55, 1.12, H.sternZ - 0.045], Math.PI);
  };
  buildM41TurretFittings();
  yield 'buildM41TurretFittings';

  // ---------------------------------------------------------------- gun shield, sight and gun --
  const buildM41Gun = (): void => {
    P.gunG.position.set(0, TRUNNION.y, TRUNNION.z);
    // 265 r2 (owner: "the mantelt should be part of and built into the turrets shaping, like with the stb 1"): the gun
    // shield is the casting's own nose. The turret's front section runs on past the trunnion to the print's tip (0.46 m
    // half-wide at the 1.75 m station), lofted in the gun's frame, so at rest its skin is the turret's and it turns round
    // the trunnion with the gun; its rear stations stand inside the casting, so the travel opens no gap, and its floor
    // sits 1.5 cm over the casting's (the mask's seam) to keep the driver's hatch clear at full depression.
    const n0 = stationAt(TURRET, 1.50), inner = stationAt(TURRET, 1.38);
    const NOSE: readonly CastStation[] = [
      { ...inner, hw: inner.hw * 0.96, bot: inner.bot + 0.03, top: inner.top - 0.015 },
      { ...n0, bot: n0.bot + 0.015 },
      { ...n0, z: 1.62, hw: 0.56, bot: 0.10, top: 0.50 },
      { ...n0, z: 1.72, hw: 0.52, bot: 0.12, top: 0.47 },
      { ...n0, z: 1.78, hw: 0.45, bot: 0.15, top: 0.44 },
      { ...n0, z: 1.81, hw: 0.36, bot: 0.18, top: 0.41 },
    ].map((st) => ({ ...st, z: st.z - TRUNNION.z, bot: st.bot - TRUNNION.y, top: st.top - TRUNNION.y }));
    P.addGunExtra(castSolid(NOSE, P.q));
    // the telescope's port on the right of the gun, the coaxial MG's on its left, standing out of the nose's face
    P.addGunExtraDark(box(0.07, 0.07, 0.05), -0.28, 0.07, 0.45);
    P.addGunExtraDark(box(0.06, 0.06, 0.05), 0.30, 0.02, 0.44);
    P.addGunExtra(cylZ(0.12, 0.08, P.q ? 20 : 12, 0.13), 0, 0, 0.53);
    if (dk) {
      // the DK-1's weathered canvas cover gathered round the nose and the tube's root, in folds
      // r3 (the Aalborg photographs; critics: a small pale pillow): a large drab canvas over nearly the whole turret face,
      // sagging in folds, bellows at its sides where it meets the casting; its underside kept at the nose's own -0.21 m
      // (a fold lower held the gun at -4.3 deg over the driver's hatch)
      P.add('gunMountCloth', xform(sph(0.46, P.q ? 20 : 12), 0, 0, 0, 0, 0, 0, [1.70, 0.58, 0.70]), 0, 0.055, 0.28);
      for (const [y, z, len] of [[0.24, 0.30, 1.30], [0.04, 0.56, 1.24], [-0.15, 0.40, 1.08]] as const) {
        P.add('gunMountCloth', xform(cylX(0.038, len, 10), 0, 0, 0, 0, 0, 0), 0, y, z);
      }
      for (const s of [-1, 1] as const) for (const [x, z] of [[0.74, 0.20], [0.66, 0.10]] as const) {
        P.add('gunMountCloth', cylY(0.045, 0.045, 0.40, 8), s * x, 0.05, z);
      }
      P.add('gunMountCloth', cylZ(0.10, 0.22, P.q ? 16 : 10, 0.15), 0, 0, 0.66);
      // the Jahn Anderson thermal sight and the Ericsson laser rangefinder: a tall armoured housing on the shield's right,
      // its hood projecting over the window, the rangefinder's block on top
      // (r3: a third of the turret's face, down onto the nose: it stood on an open frame)
      P.add('gunMount', box(0.50, 0.44, 0.66), -0.50, 0.36, 0.26);
      P.add('gunMount', box(0.54, 0.035, 0.24), -0.50, 0.595, 0.62);
      for (const x of [-0.71, -0.25]) P.add('gunMount', box(0.025, 0.20, 0.18), x, 0.46, 0.64);
      P.add('gunMountDark', box(0.40, 0.24, 0.02), -0.50, 0.38, 0.595);
      P.add('gunMountGlass', box(0.30, 0.16, 0.008), -0.50, 0.38, 0.607);
      P.add('gunMount', box(0.26, 0.12, 0.36), -0.50, 0.64, 0.22);
      P.add('gunMountDark', cylZ(0.05, 0.03, 14), -0.50, 0.64, 0.415);
      P.add('gunMountGlass', cylZ(0.038, 0.008, 14), -0.50, 0.64, 0.432);
      P.add('gunMount', box(0.08, 0.20, 0.32), -0.48, 0.15, 0.14);
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
