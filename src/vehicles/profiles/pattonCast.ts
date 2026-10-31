/**
 * pattonCast.ts — the M46, M47 and M48A5 Pattons rebuilt from their references (release 262).
 *
 * Copyright © 2026 Kevin B. Liu. Created, designed and directed by Kevin B. Liu; first-party Reserved Content
 * (LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0, LICENSE-POLICY.md, NOTICE.md). Claude was a development tool for
 * this file, not an author. provenance: urn:claude-of-tanks:vehicle-profile:patton-cast.
 *
 * The owner, 2026-10-27: "also should update/redesign the m47, m46, and m48 pattons", and for the same batch "update/
 * redesign ... turrets and hullls as well based on proper historical referrences so they will no longer look so chungus".
 * The old builds (patton.ts buildPershing / buildM48) were mask-fitted to their comparison prints and then squashed:
 * the August "lower turrets" pass compressed the M46/M47 castings to 0.78/0.65 of their height and widened their
 * cheeks, which left 0.8 m-tall, 2.35 m-wide slabs on wide flat hulls. Here every hull and turret is new geometry:
 *
 * - The castings are closed lofts (sectionSolid) of measured stations. A station is a rounded cast section: a floor,
 *   walls rising to the widest point and a shoulder rolling onto the roof (a superellipse quarter on each side), so a
 *   station table of a dozen numbers per row carries a whole turret. The stations come from the published dimensions
 *   and the walkaround photographs in docs/references/tanks/<id>.md, checked against the registered comparison prints.
 * - The three marks are built as they really differ: the M46's Pershing turret (flat cast front plate, wide rotor
 *   shield, short bustle) on the M26-derived hull; the M47's long T42-derived turret (sloped needle nose, stepped long
 *   bustle, stereo rangefinder ears) with the bow gun; the M48A5's elliptical cast dome on the cast boat hull.
 * - Running gear: six 26 in road wheels, five return rollers and the small track-tension idler ahead of the rear
 *   sprocket on all three (KIT.buildRunningGear and the nation wheel sets draw them).
 *
 * Coordinates are world metres (y up from the ground, +z forward, -x the right side); turret parts are authored in
 * world and moved into the rig_turret frame, gun parts in the gun frame (z from the trunnion along the bore).
 */
import * as THREE from 'three';
import { KIT, FITTINGS, MUDGUARDS, evenStations, muzzleBore } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { moldedBox } from '../accessoryPrimitives.ts';
import { buildNationWheel } from '../nationWheelConstructions.ts';
import { STANDARD_WHEEL_AXIAL_ENVELOPE, TRACK_WIDTH_WHEEL_CAP } from '../roadWheelGeometry.ts';
import type { TankProfileBuild } from '../tankBuildCooperation.ts';

type Geo = THREE.BufferGeometry;

/** The part of the Patton builder port these builders use (structurally the patton.ts port). */
interface CastPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: Readonly<Record<string, THREE.Material>>;
  readonly disposables: { dispose(): void }[];
  readonly rng: () => number;
  readonly q?: boolean;
  readonly spec: { readonly visual: { readonly number?: string } };
  muzzleZ: number;
  topY: number;
  add(slot: string, geometry: Geo, x?: number, y?: number, z?: number, rx?: number, ry?: number, rz?: number,
    scale?: number | readonly number[]): void;
  addGunExtra(geometry: Geo, ...transform: number[]): void;
  addGunExtraDark(geometry: Geo, ...transform: number[]): void;
  addModuleVisual(module: string, slot: string, geometry: Geo, ...transform: number[]): void;
  addExternalArmor(owner: 'hull' | 'turret', geometry: Geo, ...transform: number[]): void;
  destructibleCluster(plateName: string, fill: () => void): void;
  snapGroup(label: string, build: () => void, options?: { reachM?: number }): void;
  decal(owner: 'hull' | 'turret', kind: string, value: string | null, scale: number, position: readonly number[],
    ...rotation: number[]): void;
}

// ---------------------------------------------------------------------------------------------------------------------
// Cast sections
// ---------------------------------------------------------------------------------------------------------------------

/** One station of a cast loft (world metres). */
interface CastStation {
  readonly z: number;
  /** Floor and roof heights. */
  readonly bot: number;
  readonly top: number;
  /** Widest half-width (the right side; `hwL` the left when the casting is asymmetric). */
  readonly hw: number;
  readonly hwL?: number;
  /** Roof flat half-width and floor half-width as fractions of hw. */
  readonly roof: number;
  readonly foot: number;
  /** Height of the widest point as a fraction of bot..top. */
  readonly waist: number;
  /** Superellipse exponents of the shoulder (upper) and lower wall: 2 an ellipse, larger squarer. */
  readonly nUp?: number;
  readonly nLo?: number;
  /** Roof crown rise at the centreline (m). */
  readonly crown?: number;
}

interface RingCounts { lo: number; up: number; roof: number; floor: number }
const RING_HIGH: RingCounts = { lo: 4, up: 8, roof: 4, floor: 3 };
const RING_LOW: RingCounts = { lo: 3, up: 5, roof: 2, floor: 2 };

/** A counter-clockwise ring (viewed from +z) for one station: floor, right wall, shoulder, roof, left side. */
function castRing(s: CastStation, k: RingCounts): SectionPoint[] {
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
  const crown = s.crown ?? 0;
  for (let j = 1; j <= k.roof; j++) {
    const x = hwR * (1 - j / k.roof);
    right.push([x, s.top + crown * (1 - (x / hwR) ** 2)]);
  }
  const scaleL = (s.hwL ?? s.hw) / s.hw;
  const left = right.slice(0, -1).reverse().map(([x, y]) => [-x * scaleL, y] as [number, number]);
  const floor: [number, number][] = [];
  for (let i = 1; i <= k.floor; i++) {
    const t = i / (k.floor + 1);
    floor.push([-hwB * scaleL + (hwB + hwB * scaleL) * t, s.bot]);
  }
  return [...right, ...left, ...floor];
}

/** A closed, smooth cast solid through the stations (front to rear or rear to front), floor edges creased. */
function castSolid(stations: readonly CastStation[], q: boolean | undefined, dz = 0, dy = 0): Geo {
  const k = q ? RING_HIGH : RING_LOW;
  const ordered = [...stations].sort((a, b) => a.z - b.z);
  const sections = ordered.map((s) => ({
    z: s.z - dz,
    ring: castRing(s, k).map(([x, y]) => [x, y - dy] as const),
  }));
  const n = sections[0].ring.length;
  const floorEdges = k.floor + 1;
  const smooth = Array.from({ length: n - floorEdges }, (_, i) => i);
  const g = sectionSolid(sections, { centeredSideQuads: true, smoothSideEdges: smooth });
  g.userData.pattonCastLoft = 'turret';
  return g;
}

/** Linear interpolation of a station table at z (clamped). */
function stationAt(stations: readonly CastStation[], z: number): CastStation {
  const s = [...stations].sort((a, b) => a.z - b.z);
  if (z <= s[0].z) return s[0];
  if (z >= s[s.length - 1].z) return s[s.length - 1];
  let i = 0;
  while (s[i + 1].z < z) i++;
  const a = s[i], b = s[i + 1], t = (z - a.z) / (b.z - a.z);
  const m = (u: number, v: number): number => u + (v - u) * t;
  return {
    z, bot: m(a.bot, b.bot), top: m(a.top, b.top), hw: m(a.hw, b.hw), hwL: m(a.hwL ?? a.hw, b.hwL ?? b.hw),
    roof: m(a.roof, b.roof), foot: m(a.foot, b.foot), waist: m(a.waist, b.waist),
    nUp: m(a.nUp ?? 3, b.nUp ?? 3), nLo: m(a.nLo ?? 4, b.nLo ?? 4), crown: m(a.crown ?? 0, b.crown ?? 0),
  };
}

/** The casting's outer surface height at (x, z): the roof or the shoulder roll (world). */
function castTopAt(stations: readonly CastStation[], x: number, z: number): number {
  const s = stationAt(stations, z);
  const hw = x < 0 ? s.hw : (s.hwL ?? s.hw);
  const ax = Math.abs(x);
  const hwR = Math.max(0.02, hw * s.roof);
  const yM = s.bot + (s.top - s.bot) * s.waist;
  if (ax <= hwR) return s.top + (s.crown ?? 0) * (1 - (ax / hwR) ** 2);
  if (ax >= hw) return yM;
  const n = s.nUp ?? 3;
  // superellipse: ((ax-hwR)/(hw-hwR))^n + ((y-yM)/(top-yM))^n = 1
  const u = (ax - hwR) / (hw - hwR);
  return yM + (s.top - yM) * Math.pow(Math.max(0, 1 - Math.pow(u, n)), 1 / n);
}

/** The casting's side wall half-width at height y and station z (right side). */
function castSideAt(stations: readonly CastStation[], y: number, z: number): number {
  const s = stationAt(stations, z);
  const yM = s.bot + (s.top - s.bot) * s.waist;
  const hwR = Math.max(0.02, s.hw * s.roof), hwB = Math.max(0.02, s.hw * s.foot);
  if (y >= yM) {
    const n = s.nUp ?? 3, v = Math.min(1, (y - yM) / (s.top - yM));
    return hwR + (s.hw - hwR) * Math.pow(Math.max(0, 1 - Math.pow(v, n)), 1 / n);
  }
  const n = s.nLo ?? 4, v = Math.min(1, (yM - y) / (yM - s.bot));
  return hwB + (s.hw - hwB) * Math.pow(Math.max(0, 1 - Math.pow(v, n)), 1 / n);
}

// ---------------------------------------------------------------------------------------------------------------------
// Hulls
// ---------------------------------------------------------------------------------------------------------------------

/** A hull body station: a rounded-edged section between the floor and the deck. */
interface HullStation {
  readonly z: number;
  readonly bot: number;
  readonly top: number;
  /** Half-width at the deck edge, at the widest point and at the floor. */
  readonly hwTop: number;
  readonly hw: number;
  readonly hwBot: number;
  /** Height of the widest point (absolute y). */
  readonly yW: number;
  /** Top of a vertical lower side at hwBot (inside the track lanes), under the sponson's floor. */
  readonly yK?: number;
  /** Edge roll radius fraction 0..1 (0 a hard chine, 1 a full round). */
  readonly roll?: number;
}

/** A hull section ring: floor, sloped or vertical sides through the widest point, the deck edge rolled by a quadratic
 * corner (always the same point count, so every station corresponds). */
function hullRing(s: HullStation, q: boolean | undefined): SectionPoint[] {
  const f = Math.max(0.04, Math.min(0.9, s.roll ?? 0.25));
  const steps = q ? 4 : 2;
  const yK = s.yK ?? (s.bot + s.yW) / 2;
  const xK = s.yK != null ? s.hwBot : (s.hwBot + s.hw) / 2;
  const right: [number, number][] = [[s.hwBot, s.bot], [xK, yK], [s.hw, s.yW]];
  const p0: [number, number] = [s.hw + (s.hwTop - s.hw) * (1 - f), s.yW + (s.top - s.yW) * (1 - f)];
  const c: [number, number] = [s.hwTop, s.top];
  const p2: [number, number] = [Math.max(0.03, s.hwTop * (1 - f * 0.5)), s.top];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    right.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]]);
  }
  right.push([0, s.top]);
  const left = right.slice(0, -1).reverse().map(([x, y]) => [-x, y] as [number, number]);
  return [...right, ...left, [0, s.bot]];
}

function hullSolid(stations: readonly HullStation[], q: boolean | undefined, smooth = true): Geo {
  const sections = [...stations].sort((a, b) => a.z - b.z).map((s) => ({ z: s.z, ring: hullRing(s, q) }));
  const n = sections[0].ring.length;
  // the floor's two edges stay creased; the rolled deck edges and the sides shade as one plate
  const edges = smooth ? Array.from({ length: n }, (_, i) => i).filter((i) => i !== 0 && i !== n - 1 && i !== n - 2) : [];
  const g = sectionSolid(sections, { centeredSideQuads: true, smoothSideEdges: edges });
  g.userData.pattonCastLoft = 'hull';
  return g;
}

/** Thin closed plate following a polyline in (z, y) at constant x span. */
function fenderRun(x0: number, x1: number, pts: readonly (readonly [number, number])[], th: number): Geo {
  const sorted = [...pts].sort((a, b) => a[0] - b[0]);
  const sections = sorted.map(([z, y]) => ({
    z,
    ring: [[x0, y - th], [x1, y - th], [x1, y], [x0, y]] as SectionPoint[],
  }));
  return sectionSolid(sections, {});
}

interface GearSpec {
  readonly wheelR: number;
  readonly wheelY: number;
  /** Front and rear road-wheel stations. */
  readonly span: readonly [number, number];
  readonly rollerN: number;
  readonly rollerY: number;
  readonly rollerSpan?: readonly [number, number];
  /** Measured stations where the road wheels or return rollers are not evenly pitched, and the rollers' radius. */
  readonly wheelZs?: readonly number[];
  /** Each side's own road-wheel stations (a torsion-bar hull's stagger), -x side first. */
  readonly wheelZsBySide?: readonly [readonly number[], readonly number[]];
  readonly rollerZs?: readonly number[];
  readonly rollerR?: number;
  readonly idler: { readonly z: number; readonly y: number; readonly r: number };
  /** The sprocket; its axial scales narrow the casting's hub inside the fender's line (the track lane stays). */
  readonly sprocket: { readonly z: number; readonly y: number; readonly r: number; readonly axialScaleLeft?: number;
    readonly axialScaleRight?: number };
  readonly tension?: { readonly z: number; readonly y: number; readonly r: number };
  /** The tension wheel rides inside the track's rising lower run (the M48's): it stays out of the top run's path. */
  readonly tensionInside?: boolean;
  readonly contactZF?: number;
  readonly contactZR?: number;
  readonly botY?: number;
  readonly trackBandHex?: number;
  readonly trackBandRoughness?: number;
  readonly trackBandEnvMapIntensity?: number;
}

interface HullFrame {
  /** Track centre line half-width and the track's width. */
  readonly xc: number;
  readonly trackW: number;
  readonly deckAt: (z: number) => number;
}

/** Running gear: six road wheels, return rollers, the track-tension idler, front idler, rear sprocket. */
function pattonGear(P: CastPort, xc: number, trackW: number, G: GearSpec): void {
  const { box, cylX, torus } = KIT;
  const wheelZs = G.wheelZs ?? evenStations(6, G.span[0] - G.span[1], (G.span[0] + G.span[1]) / 2);
  const rs = G.rollerSpan ?? [G.span[0] - 0.25, G.span[1] + 0.25];
  const rollers = (G.rollerZs ?? evenStations(G.rollerN, rs[0] - rs[1], (rs[0] + rs[1]) / 2))
    .map((z) => ({ z, y: G.rollerY, r: G.rollerR ?? 0.11 }));
  const wheelW = Math.min(0.26, trackW * 0.42);
  // the tension idler runs on the track's lower run between the last road wheel and the sprocket
  if (G.tension) for (const side of [-1, 1]) {
    P.add('hullRunningGearDetail', cylX(G.tension.r, 0.17, P.q ? 16 : 10), side * xc, G.tension.y, G.tension.z);
    P.add('hullRunningGearDark', cylX(G.tension.r * 0.45, 0.19, 8), side * xc, G.tension.y, G.tension.z);
    // its crank arm to the hull side
    P.add('hullRunningGearDetail', box(0.06, 0.07, 0.36), side * (xc - 0.13), G.tension.y + 0.08, G.tension.z + 0.14, 0.45, 0, 0);
  }
  KIT.buildRunningGear(P, {
    style: 'dished', wheelR: G.wheelR, wheelW, wheelY: G.wheelY, xc, wheelZs,
    sprocket: G.sprocket, idler: G.idler, rollers: G.tension && !G.tensionInside ? [...rollers, G.tension] : rollers, trackW,
    topY: G.rollerY + 0.04, paintedEnds: true, coveredTop: false, arms: true, sprocketTeeth: false,
    contactZF: G.contactZF, contactZR: G.contactZR, botY: G.botY,
    ...(G.wheelZsBySide ? { wheelZsLeftM: G.wheelZsBySide[0], wheelZsRightM: G.wheelZsBySide[1], fitStaggeredGroundRun: true } : {}),
    trackBandHex: G.trackBandHex, trackBandRoughness: G.trackBandRoughness,
    trackBandEnvMapIntensity: G.trackBandEnvMapIntensity,
  });
  for (const z of wheelZs) {
    for (const side of [-1, 1]) {
      const fx = side * (xc + wheelW / 2 + 0.012);
      P.add('hullRunningGearDark', torus(G.wheelR * 0.3, 0.015, P.q ? 16 : 10), fx, G.wheelY, z, 0, 0, Math.PI / 2);
    }
  }
  // return-roller brackets from the hull side
  for (const rl of rollers) for (const side of [-1, 1]) {
    P.add('hullRunningGearDetail', box(0.07, 0.10, 0.12), side * (xc - trackW * 0.5 - 0.02), rl.y + 0.02, rl.z);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// The M26-derived hull (M46, M47)
// ---------------------------------------------------------------------------------------------------------------------

interface PershingHullSpec {
  /** Tail plate top and the bow: toe of the upper glacis, knee onto the deck. */
  readonly tailZ: number;
  readonly toe: readonly [number, number];
  readonly knee: readonly [number, number];
  /** Lower glacis foot on the belly. */
  readonly bellyFrontZ: number;
  readonly bellyRearZ: number;
  readonly bellyY: number;
  readonly deckY: number;
  readonly engineDeckY: number;
  readonly engineDeckZ: number;
  readonly tailTopY: number;
  readonly tailBotY: number;
  /** Sponson (over the tracks) half-width and floor. */
  readonly sponsonHW: number;
  readonly sponsonY: number;
  readonly fenderHW: number;
  readonly fenderY: number;
  readonly trackW: number;
  readonly xc: number;
  readonly gear: GearSpec;
  readonly mark: 'm46' | 'm47';
  /** The fender's top line, rear to front (z, y), where it steps (the reference's rear muffler deck, the low front
   *  fenders), its stowage boxes' height and the mufflers' centre height. */
  readonly fenderLine?: readonly (readonly [number, number])[];
  readonly fenderBoxH?: number;
  readonly mufflerY?: number;
  /** The fender boxes' runs (z0 > z1) and their outboard band (x0, x1); no mufflers on a reference that has none. */
  readonly fenderBoxes?: readonly (readonly [number, number])[];
  readonly fenderBoxX?: readonly [number, number];
  readonly mufflers?: false;
  /** Headlights on brackets ahead of the nose (x, y, z) when the glacis carries none. */
  readonly bowLights?: readonly [number, number, number];
  /** The nose's depth under the toe (m) and stowage boxes on the sponsons' fronts (x0, x1, y0, y1, z0, z1). */
  readonly noseDepth?: number;
  readonly sponsonFrontBox?: readonly [number, number, number, number, number, number];
  readonly rearFlapH?: number;
  readonly rearFlapX?: readonly [number, number];
  /** The rear plate's depth outboard of the track (over the track it keeps rearFlapH, clear of the sprocket's wrap). */
  readonly rearFlapOuterH?: number;
  /** No front mud flap (one at the fender's end would hang on the track over the idler). */
  readonly frontFlap?: false;
  /** The bow's towing eyes up on the glacis face (the reference's bow carries none low). */
  readonly bowEyesOnGlacis?: true;
  /** A box on the fender's outer edge (x0, x1, y0, y1, z0, z1). */
  readonly outerBox?: readonly [number, number, number, number, number, number];
  /** Where the knee's rounding meets the flat upper glacis plate (the plate runs from here to the toe). */
  readonly glacisShoulder?: readonly [number, number];
  /** The fender's support brackets under its outer edge (z stations), where the reference shows them. */
  readonly fenderBrackets?: readonly number[];
  /** The engine-exhaust grille box over the rear plate's top (half-width, bottom, top, depth aft of the plate) with the
   *  big towing eyes on its sides; the tail lights then stand outboard of it. A fifth value recesses its middle (the
   *  centre bay's half-width, at half the depth). */
  readonly rearGrille?: readonly [number, number, number, number, number?];
}

function* pershingHullSteps(P: CastPort, H: PershingHullSpec): Generator<string, HullFrame> {
  const { box, cylX, cylY, cylZ } = KIT;
  const iw = H.xc - H.trackW / 2 - 0.04;           // tub half-width, inside the track lanes
  const deckAt = (z: number): number => {
    const sh = H.glacisShoulder;
    if (sh && z >= H.knee[0] && z < sh[0]) return H.knee[1] + (sh[1] - H.knee[1]) * ((z - H.knee[0]) / (sh[0] - H.knee[0]));
    if (sh && z >= sh[0]) return sh[1] + (H.toe[1] - sh[1]) * Math.min(1, (z - sh[0]) / (H.toe[0] - sh[0]));
    if (z >= H.knee[0]) return H.knee[1] + (H.toe[1] - H.knee[1]) * Math.min(1, (z - H.knee[0]) / (H.toe[0] - H.knee[0]));
    if (z >= H.engineDeckZ) return H.deckY;
    if (z >= H.tailZ + 0.30) return H.engineDeckY;
    return H.engineDeckY + (H.tailTopY - H.engineDeckY) * ((H.tailZ + 0.30 - z) / 0.30);
  };
  // 1. The tub between the tracks: belly to deck, the lower glacis and the rear plate.
  const tubSt: HullStation[] = [];
  const tubAt = (z: number, bot: number, top: number, w = iw): HullStation =>
    ({ z, bot, top, hwTop: w - 0.02, hw: w, hwBot: w - 0.05, yW: bot + (top - bot) * 0.55, roll: 0.15 });
  // the lower glacis rises from the belly's front to the nose's foot
  const botAt = (z: number): number => z <= H.bellyFrontZ ? H.bellyY
    : H.bellyY + (H.toe[1] - (H.noseDepth ?? 0.26) - H.bellyY) * Math.min(1, (z - H.bellyFrontZ) / (H.toe[0] - H.bellyFrontZ));
  tubSt.push(tubAt(H.tailZ, H.tailBotY, H.tailTopY, iw - 0.06));
  tubSt.push(tubAt(H.tailZ + 0.12, H.tailBotY - 0.12, deckAt(H.tailZ + 0.12), iw - 0.02));
  const mid = [H.bellyRearZ, H.engineDeckZ - 0.02, H.engineDeckZ + 0.02, H.knee[0], H.bellyFrontZ].sort((a, b) => a - b);
  for (const z of mid) tubSt.push(tubAt(z, botAt(z), deckAt(z)));
  // the rounded cast nose: about 0.4 m deep where the glaces meet
  tubSt.push(tubAt(H.toe[0] - 0.10, Math.max(botAt(H.toe[0] - 0.10), H.toe[1] - 0.42), H.toe[1] + 0.05, iw - 0.03));
  tubSt.push(tubAt(H.toe[0] - 0.03, Math.max(botAt(H.toe[0] - 0.03), H.toe[1] - 0.36), H.toe[1] + 0.01, iw - 0.05));
  const noseBot = H.toe[1] - (H.noseDepth ?? 0.26);
  tubSt.push(tubAt(H.toe[0], noseBot, Math.max(H.toe[1] - 0.04, noseBot + 0.05), iw - 0.07));
  P.add('hull', hullSolid(tubSt.filter((s, i, a) => i === 0 || s.z > a[i - 1].z + 1e-4), P.q));
  yield 'pershingHullTub';
  // 2. The sponsons over the tracks, flush with the deck, closed by the glacis wings and the rear plate.
  const spSt: HullStation[] = [];
  const spAt = (z: number, top: number, w = H.sponsonHW): HullStation =>
    ({ z, bot: H.sponsonY, top: Math.max(top, H.sponsonY + 0.06), hwTop: w - 0.05, hw: w, hwBot: w, yW: H.sponsonY + 0.02, roll: 0.35 });
  const spZ = H.tailZ + (H.mark === 'm47' ? 0.90 : 0.72);
  spSt.push(spAt(spZ, deckAt(spZ) - 0.02, H.sponsonHW - 0.04));
  for (const z of [spZ + 0.08, H.engineDeckZ - 0.02, H.engineDeckZ + 0.02, H.knee[0]]) spSt.push(spAt(z, deckAt(z)));
  // the sponson's front runs down the glacis until it meets its own floor (no square end over the idler)
  const glacisEnd = H.knee[0] + (H.toe[0] - H.knee[0]) * ((H.knee[1] - H.sponsonY - 0.05) / (H.knee[1] - H.toe[1]));
  for (const f of [0.35, 0.7, 1]) {
    const z = H.knee[0] + (glacisEnd - H.knee[0]) * f;
    spSt.push(spAt(z, deckAt(z) - 0.004, H.sponsonHW - 0.03 * f));
  }
  P.add('hull', hullSolid(spSt, P.q));
  if (H.outerBox) {
    const [x0, x1, y0, y1, z0, z1] = H.outerBox;
    for (const side of [-1, 1]) {
      P.add('hullDetail', moldedBox(x1 - x0, y1 - y0, z1 - z0, 0.012, P.q ? 2 : 1, 0.006), side * (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    }
  }
  if (H.sponsonFrontBox) {
    const [x0, x1, y0, y1, z0, z1] = H.sponsonFrontBox;
    for (const side of [-1, 1]) {
      P.add('hullDetail', moldedBox(x1 - x0, y1 - y0, z1 - z0, 0.015, P.q ? 2 : 1, 0.008), side * (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      // a bracket down to the glacis wing where the box stands over it, under its inner edge clear of the track
      const foot = deckAt((z0 + z1) / 2) - 0.02;
      if (y0 - foot > 0.03) P.add('hullDark', box(0.06, y0 - foot + 0.02, 0.06), side * (x0 + 0.04), (y0 + foot) / 2, (z0 + z1) / 2);
    }
  }
  yield 'pershingHullSponsons';
  // 3. Fenders: the full-length plates over the tracks, ramping down at the bow and the stern.
  const fx0 = H.sponsonHW - 0.12, fx1 = H.fenderHW;
  const line = H.fenderLine ?? [
    [H.tailZ - 0.02, H.fenderY - 0.10], [H.tailZ + 0.25, H.fenderY], [H.knee[0] - 0.05, H.fenderY],
    [H.toe[0] - 0.55, H.fenderY - 0.05], [H.toe[0] - 0.25, H.fenderY - 0.25], [H.toe[0] + 0.05, H.fenderY - 0.62],
  ];
  // the full-height run the lip and the boxes stand on
  const full = line.filter(([, y]) => y >= H.fenderY - 1e-6);
  const [lip0, lip1] = H.fenderLine ? [full[0][0], full[full.length - 1][0]] : [H.tailZ + 0.25, H.knee[0] - 0.05];
  for (const side of [-1, 1]) {
    const [a, b] = side > 0 ? [fx0, fx1] : [-fx1, -fx0];
    P.add('hull', fenderRun(a, b, line, 0.03));
    // the fender's outer lip
    P.add('hullDetail', box(0.025, 0.07, lip1 - lip0), side * (fx1 - 0.012), H.fenderY - 0.045, (lip0 + lip1) / 2);
  }
  // (none over the sprocket: since the rear-track fix the top run rises straight over it, 3 cm under the fender)
  for (const z of H.fenderBrackets ?? []) {
    for (const side of [-1, 1]) P.add('hullDark', box(0.10, 0.10, 0.06), side * (H.fenderHW - 0.05), H.fenderY - 0.08, z);
  }
  const boxH = H.fenderBoxH ?? 0.22;
  const [bx0, bx1] = H.fenderBoxX ?? [H.fenderHW - 0.28, H.fenderHW - 0.02];
  for (const side of [-1, 1]) {
    for (const [z0, z1] of H.fenderBoxes ?? [[Math.min(0.90, lip1 - 0.03), 0.02], [-0.40, -1.28], [-1.66, -2.54]]) {
      P.add('hullDetail', moldedBox(bx1 - bx0, boxH, z0 - z1, 0.02, P.q ? 2 : 1, 0.01), side * (bx0 + bx1) / 2, H.fenderY + boxH / 2, (z0 + z1) / 2);
    }
  }
  yield 'pershingHullFenders';
  // 4. Engine deck: louvred grille bays, the centre access doors, fuel caps.
  const eZ0 = H.engineDeckZ - 0.20, eZ1 = H.tailZ + 0.40;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 2; k++) {
      const z0 = eZ0 - k * (eZ0 - eZ1) / 2, z1 = z0 - (eZ0 - eZ1) / 2 + 0.06;
      P.add('hullDetail', box(0.72, 0.018, z0 - z1), side * 0.60, H.engineDeckY + 0.009, (z0 + z1) / 2);
      const n = 7;
      for (let i = 0; i < n; i++) {
        const z = z0 - 0.06 - (i / (n - 1)) * (z0 - z1 - 0.12);
        P.add('hullDark', box(0.64, 0.012, 0.022), side * 0.60, H.engineDeckY + 0.020, z);
      }
    }
  }
  P.add('hullDetail', box(0.36, 0.014, eZ0 - eZ1), 0, H.engineDeckY + 0.007, (eZ0 + eZ1) / 2);
  for (const side of [-1, 1]) P.add('hullDetail', cylY(0.07, 0.07, 0.03, 12), side * 1.18, H.engineDeckY + 0.015, H.engineDeckZ - 0.30);
  yield 'pershingHullDeck';
  // 5. The exhaust mufflers on the rear fenders (the M46/M47 tell): drums in their guard hoops, the elbow from the
  // engine deck, the X-braced end guards
  if (H.mufflers !== false) for (const side of [-1, 1]) {
    const mx = side * 1.58, mr = 0.13, my = H.mufflerY ?? H.fenderY + mr + 0.004;
    const mz0 = H.tailZ + 0.03, mz1 = H.tailZ + (H.mark === 'm47' ? 0.86 : 0.68);
    P.add('hullDetail', cylZ(mr, mz1 - mz0, P.q ? 20 : 12), mx, my, (mz0 + mz1) / 2);
    P.add('hullDark', cylZ(mr * 0.84, 0.02, P.q ? 20 : 12), mx, my, mz0 - 0.005);
    for (const r of [0.6, -0.6]) P.add('hullDark', box(0.03, mr * 2.0, 0.02), mx, my, mz0 - 0.018, 0, 0, r);
    for (const dz of [0.12, (mz1 - mz0) - 0.12]) P.add('hullDark', cylZ(mr + 0.012, 0.04, P.q ? 20 : 12), mx, my, mz0 + dz);
    // the elbow from the engine deck into the muffler's front, and the straps to the fender
    P.add('hullDark', cylZ(0.06, 0.22, 10), side * 1.50, my + 0.02, mz1 + 0.09, 0, side * 0.35, 0);
    for (const dz of [0.22, (mz1 - mz0) - 0.22]) P.add('hullDark', box(mr * 2.2, 0.03, 0.05), mx, my - mr + 0.008, mz0 + dz);
  }
  yield 'pershingHullMufflers';
  // 6. Bow: driver's and co-driver's hatches with periscopes, headlight groups with brush guards, tow eyes, the bow gun.
  for (const side of [-1, 1]) {
    const hx = side * 0.55, hz = H.knee[0] - 0.42;
    // near-flush hatch rings and lids (the gun's shield passes over them at full depression)
    P.add('hull', cylY(0.30, 0.31, 0.03, P.q ? 20 : 12), hx, H.deckY + 0.012, hz);
    P.add('hullDetail', cylY(0.26, 0.27, 0.02, P.q ? 20 : 12), hx, H.deckY + 0.035, hz);
    P.add('hullDark', box(0.06, 0.025, 0.12), hx + side * 0.24, H.deckY + 0.035, hz - 0.12);
    // the periscope in the lid's rear half, clear of the gun shield's sweep at full depression
    KIT.periscope(P, 'hullDetail', hx, H.deckY + 0.055, hz - 0.06);
  }
  for (const side of [-1, 1]) {
    const lights = FITTINGS.lightCluster({ mats: P.mats, pods: H.mark === 'm47' ? 2 : 1, spacing: 0.14, r: 0.062,
      rake: -0.20, seed: side > 0 ? 471 : 469, nightKind: 'headlight' });
    if (H.bowLights) {
      // on a bracket from the nose, ahead of it
      const [bx, by, bz] = H.bowLights;
      lights.position.set(side * bx, by, bz);
      P.hullG.add(lights);
      // (the M47's lamps stand over the glacis, behind the nose: the arm runs forward to it, its length always positive,
      // or the box turns inside out)
      P.add('hullDark', box(0.06, 0.06, Math.abs(bz - H.toe[0] + 0.06)), side * bx, by - 0.08, (bz + H.toe[0] - 0.06) / 2);
      // the bracket's post down to the glacis
      const gy = deckAt(H.toe[0] - 0.08);
      P.add('hullDark', box(0.05, by - 0.08 - gy + 0.03, 0.05), side * bx, (by - 0.08 + gy) / 2, H.toe[0] - 0.08);
      // its brush guard: rods from the bracket over the lamp to a cross bar 0.2 m ahead of the nose, the middle one
      // splitting the guard's window
      for (const dx of [-0.04, 0, 0.04]) bar(P, 'hullDark', [side * (bx + dx), by - 0.05, bz - 0.06], [side * (bx + dx), by + 0.04, bz + 0.19], 0.01);
      P.add('hullDark', box(0.10, 0.012, 0.012), side * bx, by + 0.04, bz + 0.19);
      continue;
    }
    const lz = H.toe[0] - 0.42, lx = side * 0.98;
    lights.position.set(lx, deckAt(lz) + 0.05, lz);
    P.hullG.add(lights);
    // its bracket down to the glacis
    P.add('hullDark', box(0.05, 0.10, 0.05), lx, deckAt(lz) + 0.0, lz);
  }
  for (const side of [-1, 1]) {
    if (H.bowEyesOnGlacis) KIT.liftEye(P, 'hullDetail', side * 0.70, deckAt(H.toe[0] - 0.08) + 0.03, H.toe[0] - 0.08, 0);
    else KIT.liftEye(P, 'hullDetail', side * 0.70, H.toe[1] - 0.10, H.toe[0] + 0.02, 0);
  }
  if (H.mark === 'm47' || H.mark === 'm46') {
    // .30 cal bow gun in its ball mount on the right of the glacis
    const bz = H.knee[0] + (H.toe[0] - H.knee[0]) * 0.45, by = deckAt(bz);
    const ang = Math.atan2(H.knee[1] - H.toe[1], H.toe[0] - H.knee[0]);
    P.add('hull', KIT.sph(0.14, P.q ? 16 : 10, P.q ? 10 : 6), -0.55, by - 0.02, bz);
    P.add('hullDark', cylZ(0.022, 0.16, 8), -0.55, by + 0.01, bz + 0.13, 0.05, 0, 0);
    void ang;
  }
  yield 'pershingHullBow';
  // 7. Rear plate: tail lights, the towing pintle, the transmission doors.
  const grille = H.rearGrille;
  // a grille box across the whole plate carries the tail lights on its face and leaves the eyes, the pintle and the
  // doors on the plate under it
  const wide = grille !== undefined && grille[0] > 0.80;
  const lowY = (y: number): number => (wide && grille ? Math.min(y, grille[1] - 0.12) : y);
  if (grille) {
    // the grille box over the plate's top, its louvres facing aft, and the big towing eyes on lugs on its sides
    const [gw, gy0, gy1, gd, bay] = grille, gz = H.tailZ - gd;
    if (bay) {
      // the deep outer grille doors either side of the shallower centre bay
      for (const side of [-1, 1]) {
        P.add('hull', moldedBox(gw - bay, gy1 - gy0, gd + 0.03, 0.015, P.q ? 2 : 1, 0.008), side * (gw + bay) / 2, (gy0 + gy1) / 2,
          gz + (gd + 0.03) / 2);
      }
      P.add('hull', moldedBox(bay * 2, gy1 - gy0, gd / 2 + 0.03, 0.015, P.q ? 2 : 1, 0.008), 0, (gy0 + gy1) / 2, gz + gd / 2 + (gd / 2 + 0.03) / 2);
    } else {
      P.add('hull', moldedBox(gw * 2, gy1 - gy0, gd + 0.03, 0.015, P.q ? 2 : 1, 0.008), 0, (gy0 + gy1) / 2, gz + (gd + 0.03) / 2);
    }
    // the louvres across each face: the doors' at their depth, the bay's at its own
    const faces: (readonly [number, number, number])[] = bay
      ? [[-(gw + bay) / 2, gw - bay - 0.08, gz], [(gw + bay) / 2, gw - bay - 0.08, gz], [0, bay * 2 - 0.08, gz + gd / 2]]
      : [[0, gw * 2 - 0.16, gz]];
    for (const [fx, fw, fz] of faces) {
      for (let i = 0; i < 4; i++) P.add('hullDark', box(fw, 0.014, 0.02), fx, gy0 + 0.06 + i * (gy1 - gy0 - 0.12) / 3, fz - 0.004);
    }
    // (the narrow box's towing eyes; a box across the whole plate leaves them on the plate under it)
    if (!wide) for (const side of [-1, 1]) {
      P.add('hullDetail', box(0.06, 0.11, 0.12), side * (gw + 0.03), (gy0 + gy1) / 2, gz + 0.03);
      P.add('hullDark', KIT.xform(KIT.torus(0.062, 0.018, P.q ? 14 : 8), 0, 0, 0, 0, Math.PI / 2, 0), side * (gw + 0.03),
        (gy0 + gy1) / 2 + 0.01, gz + 0.055);
    }
  }
  for (const side of [-1, 1]) {
    const lz = wide && grille ? H.tailZ - grille[3] - 0.01 : H.tailZ - 0.03;
    // (beside a narrow grille box the light stands against its eye's lug, closing no pocket between them)
    KIT.headlight(P, side * (grille && !wide ? grille[0] + 0.12 : 0.72), H.tailTopY - 0.14, lz, Math.PI, 0.045, false);
    KIT.liftEye(P, 'hullDetail', side * 0.85, lowY(1.10), H.tailZ - 0.02, Math.PI);
  }
  const doorTop = wide && grille ? grille[1] : H.tailTopY;
  P.add('hullDetail', box(1.10, Math.min(0.38, doorTop - H.tailBotY - 0.04), 0.03), 0, (H.tailBotY + doorTop) / 2, H.tailZ - 0.012);
  // the towing pintle high on the plate, clear of the departure angle
  P.add('hullDark', box(0.14, 0.10, 0.08), 0, lowY(1.02), H.tailZ - 0.03);
  P.add('hullDark', cylX(0.035, 0.16, 8), 0, lowY(1.02), H.tailZ - 0.05);
  yield 'pershingHullRear';
  pattonGear(P, H.xc, H.trackW, H.gear);
  // mud flaps at the fender ends
  const [lineR, lineF] = [line[0], line[line.length - 1]];
  const flaps = H.fenderLine
    ? [[lineF[0] - 0.02, lineF[1] - 0.22, lineF[1]], [lineR[0] + 0.02, lineR[1] - (H.rearFlapH ?? 0.12), lineR[1]]] as const
    : [[H.toe[0] - 0.02, H.fenderY - 0.62, H.fenderY - 0.40], [H.tailZ + 0.02, H.fenderY - 0.40, H.fenderY - 0.10]] as const;
  for (const [fz, fy0, fy1] of flaps) {
    if (fz > 0 && H.frontFlap === false) continue;
    // a rear end plate across the whole fender where the reference draws one; over the track it stops above the
    // sprocket's wrap, and outboard of the track it hangs to the reference's depth
    const [fx0, fxEnd] = fz < 0 && H.rearFlapX ? H.rearFlapX : [H.xc - H.trackW * 0.46, H.xc + H.trackW * 0.46];
    const outer = fz < 0 && H.rearFlapOuterH ? H.xc + H.trackW / 2 + 0.02 : 0;
    const fx1 = outer || fxEnd;
    for (const side of [-1, 1]) {
      MUDGUARDS.add(P, {
        label: `patton-cast-${fz < 0 ? 'rear' : 'front'}-flap-${side}`, x: side * (fx0 + fx1) / 2, y: (fy0 + fy1) / 2, z: fz,
        thickness: 0.03, length: fx1 - fx0, height: fy1 - fy0, material: 'rubber', rotation: [0, Math.PI / 2, 0],
        crown: 0.012, frontCut: 0.025, rearCut: 0.018,
      });
      if (!outer) continue;
      const oy0 = fy1 - (H.rearFlapOuterH ?? 0);
      MUDGUARDS.add(P, {
        label: `patton-cast-rear-flap-outer-${side}`, x: side * (outer + fxEnd) / 2, y: (oy0 + fy1) / 2, z: fz,
        thickness: 0.03, length: fxEnd - outer, height: fy1 - oy0, material: 'rubber', rotation: [0, Math.PI / 2, 0],
        crown: 0.006, frontCut: 0.01, rearCut: 0.01,
      });
    }
  }
  yield 'pershingHullGear';
  return { xc: H.xc, trackW: H.trackW, deckAt };
}

// ---------------------------------------------------------------------------------------------------------------------
// Guns
// ---------------------------------------------------------------------------------------------------------------------

interface GunSpec {
  /** World trunnion (the gun group's origin) and the muzzle station. */
  readonly trunnionZ: number;
  readonly axisY: number;
  readonly muzzleZ: number;
  /** Tube radii at the root and at the muzzle. */
  readonly r0: number;
  readonly r1: number;
  readonly evac?: { readonly z0: number; readonly z1: number; readonly r: number };
  readonly device: 'm3a1' | 'm36' | 'none';
}

function pattonGun(P: CastPort, G: GunSpec): void {
  const { cylZ, box, xform } = KIT;
  const seg = P.q ? 22 : 12;
  const len = G.muzzleZ - G.trunnionZ;
  const w2l = (z: number): number => z - G.trunnionZ;
  // tube: a slight taper, from inside the mantlet to the device
  const tube0 = 0.20;
  const devL = G.device === 'm3a1' ? 0.28 : G.device === 'm36' ? 0.30 : 0;
  const tubeL = len - tube0 - devL;
  P.add('gun', cylZ(G.r1, tubeL, seg, G.r0), 0, 0, tube0 + tubeL / 2);
  if (G.evac) {
    const e = G.evac, el = e.z1 - e.z0, zc = w2l((e.z0 + e.z1) / 2);
    P.add('gun', cylZ(e.r, el - 0.08, seg), 0, 0, zc);
    P.add('gun', cylZ(e.r, 0.04, seg, G.r0 * 0.98), 0, 0, zc - el / 2 + 0.02);
    P.add('gun', cylZ(G.r0 * 0.98, 0.04, seg, e.r), 0, 0, zc + el / 2 - 0.02);
  }
  if (G.device === 'm3a1') {
    // 90 mm M3A1: the single-baffle muzzle brake, a wide flat drum with its side ports
    const z0 = len - devL;
    P.add('gun', xform(cylZ(0.175, devL, seg), 0, 0, 0, 0, 0, 0, [1.5, 1, 1]), 0, 0, z0 + devL / 2);
    for (const side of [-1, 1]) P.add('gunDark', box(0.012, 0.15, devL * 0.42), side * 0.262, 0, z0 + devL * 0.52);
    P.add('gun', cylZ(G.r1 * 1.25, 0.05, seg), 0, 0, z0 - 0.02);
    // 263 (muzzle-bore probe: a mouth's lip fits its terminal support, ratio 0.35-1): the bore leaves the drum through
    // a short collar 1 cm proud of its 0.26 m face, so the mouth seats on a ring of the tube's size
    P.add('gun', cylZ(G.r1 * 1.15, 0.03, seg), 0, 0, len - 0.005);
  } else if (G.device === 'm36') {
    // 90 mm M36: the T-shaped blast deflector, a short cylinder across the muzzle with the bore running through it to
    // its own collar at the mouth
    const z0 = len - devL;
    P.add('gun', cylZ(G.r1, devL, seg), 0, 0, z0 + devL / 2);
    P.add('gun', xform(KIT.cylX(0.125, 0.68, seg), 0, 0, 0), 0, 0, len - 0.29);
    for (const side of [-1, 1]) P.add('gunDark', KIT.cylX(0.10, 0.012, seg), side * 0.341, 0, len - 0.29);
    P.add('gun', box(0.49, 0.20, 0.14), 0, 0, len - 0.08);
    P.add('gun', cylZ(G.r1 * 1.3, 0.06, seg), 0, 0, z0 + 0.03);
  }
  const mouth = G.device === 'm3a1' ? len + 0.01 : len;
  muzzleBore(P, { z: mouth + 0.004, r: G.r1 * 0.78 });
  P.muzzleZ = mouth;
}

/** A rotor shield: a D-section casting on the trunnion (gun frame): its face an arc of radius r about the trunnion axis
 * between the angles a0..a1, flat top and bottom running back to `back` (inside the turret's front opening). */
function rotorShield(r: number, back: number, w: number, a0: number, a1: number, q?: boolean): Geo {
  const n = q ? 14 : 7;
  const shape = new THREE.Shape();
  shape.moveTo(back, Math.sin(a0) * r);
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.lineTo(back, Math.sin(a1) * r);
  shape.lineTo(back, Math.sin(a0) * r);
  const bevel = Math.min(0.07, w * 0.09);
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.05, w - 2 * bevel), bevelEnabled: true, bevelThickness: bevel,
    bevelSize: bevel * 0.7, bevelSegments: q ? 4 : 2, curveSegments: 1 });
  // shape (u along the bore, v up), extruded across: turn it into the gun frame (x across, y up, z along the bore). A
  // proper rotation (not an axis swap, which mirrors the casting inside out); the extrusion is centred, so x's sign is free
  g.translate(0, 0, -Math.max(0.05, w - 2 * bevel) / 2);
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------------------------------------------------
// Turret fittings
// ---------------------------------------------------------------------------------------------------------------------

interface TurretFrame {
  readonly ringY: number;
  readonly ringZ: number;
  readonly stations: readonly CastStation[];
  /** The surface of a casting that is not a CastStation loft (the M48A5's landmark dome). */
  readonly seat?: CastSeat;
}
interface CastSeat {
  topAt(x: number, z: number): number;
  sideAt(y: number, z: number): number;
  span(z: number): readonly [number, number];
}
const tl = (T: TurretFrame) => ({ y: (y: number): number => y - T.ringY, z: (z: number): number => z - T.ringZ });
const frameTop = (T: TurretFrame, x: number, z: number): number => T.seat ? T.seat.topAt(x, z) : castTopAt(T.stations, x, z);
const frameSide = (T: TurretFrame, y: number, z: number): number =>
  T.seat ? T.seat.sideAt(y, z) : castSideAt(T.stations, y, z);
function frameSpan(T: TurretFrame, z: number): readonly [number, number] {
  if (T.seat) return T.seat.span(z);
  const s = stationAt(T.stations, z);
  return [s.bot, s.top];
}

/** Commander's vision cupola: armoured ring with vision blocks, split hatch, seated on the roof (world x, z). */
function visionCupola(P: CastPort, T: TurretFrame, x: number, z: number, r: number, h: number, blocks: number, long = 1): number {
  const { cylY, box } = KIT;
  const L = tl(T);
  const base = frameTop(T, x, z) - 0.03;
  // `long` stretches the ring fore and aft (an oval cupola)
  const oval = (g: Geo): Geo => long === 1 ? g : KIT.xform(g, 0, 0, 0, 0, 0, 0, [1, 1, long]);
  P.add('turret', oval(cylY(r, r * 1.08, h, P.q ? 24 : 14)), x, L.y(base + h / 2), L.z(z));
  P.add('turret', oval(cylY(r * 0.94, r * 0.98, 0.05, P.q ? 24 : 14)), x, L.y(base + h + 0.025), L.z(z));
  P.add('turretDark', box(r * 1.7, 0.015, 0.03), x, L.y(base + h + 0.055), L.z(z));
  for (let k = 0; k < blocks; k++) {
    const a = (k / blocks) * Math.PI * 2;
    const px = x + Math.sin(a) * r * 1.0, pz = z + Math.cos(a) * r * long;
    P.add('turretDetail', box(0.10, 0.07, 0.05), px, L.y(base + h * 0.62), L.z(pz), 0, a, 0);
    P.add('turretGlass', box(0.075, 0.035, 0.012), x + Math.sin(a) * (r + 0.026), L.y(base + h * 0.62),
      L.z(z + Math.cos(a) * (r * long + 0.026)), 0, a, 0);
  }
  return base + h + 0.05;
}

/** Loader's hatch: low ring and a flat lid with its hinge (world x, z). */
function loaderHatch(P: CastPort, T: TurretFrame, x: number, z: number, r: number): number {
  const { cylY, box } = KIT;
  const L = tl(T);
  const base = frameTop(T, x, z) - 0.02;
  P.add('turret', cylY(r, r * 1.05, 0.06, P.q ? 22 : 12), x, L.y(base + 0.03), L.z(z));
  P.add('turretDetail', cylY(r * 0.88, r * 0.9, 0.03, P.q ? 22 : 12), x, L.y(base + 0.075), L.z(z));
  P.add('turretDark', box(0.10, 0.04, 0.06), x, L.y(base + 0.075), L.z(z - r * 0.92));
  return base + 0.09;
}

/** Roof periscope / sight hood seated on the casting (world). */
function roofScope(P: CastPort, T: TurretFrame, x: number, z: number, ry = 0, tall = 0.07): void {
  const { box } = KIT;
  const L = tl(T);
  const y = frameTop(T, x, z);
  P.add('turret', box(0.16, tall + 0.03, 0.18), x, L.y(y + tall / 2 - 0.01), L.z(z), 0, ry, 0);
  P.add('turretGlass', box(0.12, 0.035, 0.012), x + Math.sin(ry) * 0.092, L.y(y + tall * 0.7), L.z(z + Math.cos(ry) * 0.092), 0, ry, 0);
}

/** Roof ventilator dome (world). */
function ventilator(P: CastPort, T: TurretFrame, x: number, z: number, r: number): void {
  const L = tl(T);
  const y = frameTop(T, x, z);
  P.add('turret', KIT.cylY(r * 0.85, r, 0.05, P.q ? 18 : 10), x, L.y(y + 0.015), L.z(z));
  P.add('turret', KIT.xform(KIT.sph(r * 0.85, P.q ? 16 : 10, P.q ? 8 : 5), 0, 0, 0, 0, 0, 0, [1, 0.45, 1]), x, L.y(y + 0.04), L.z(z));
}

/** Browning M2 HB on a working mount (world base). */
function roofM2(P: CastPort, T: TurretFrame, x: number, z: number, baseY: number, opts: { barrel?: number; cls?: 'm2' | 'mag';
  scale?: number; seed: number; ring?: false; elev?: number; ammo?: false; station?: string }): void {
  const L = tl(T);
  const mg = FITTINGS.americanM2({
    mats: P.mats, tone: 'dark', ammoSide: 1, barrelLength: opts.barrel ?? 0.65, elev: opts.elev ?? 0.03,
    ring: opts.ring ?? { r: 0.22, stubs: 4 }, shield: false, seed: opts.seed, working: true, cls: opts.cls, scale: opts.scale,
    ammo: opts.ammo,
  });
  mg.position.set(x, L.y(baseY), L.z(z));
  // 263 (integrator, roofWeaponPolicy.selftest): a second station on one roof keeps its own name, which the auxiliary
  // presentation finds it by (the M48A5's loader's M60D beside the commander's)
  if (opts.station) mg.name = `${mg.name}_${opts.station}`;
  P.turretG.add(mg);
}

/** The M60D's back plate and its spade grips either side of it, behind the receiver (z0 the receiver's back face, y the
 * grips' centre; turret-local frame). */
function m60dGrips(P: CastPort, L: ReturnType<typeof tl>, x: number, z0: number, y: number): void {
  // the back plate runs forward into the fitting's receiver (its back face stands 6-7 cm ahead of the model's)
  P.add('turretDark', KIT.box(0.087, 0.12, 0.164), x, L.y(y), L.z(z0 - 0.012));
  for (const dx of [-0.05, 0.05]) P.add('turretDark', KIT.box(0.056, 0.137, 0.086), x + dx, L.y(y), L.z(z0 - 0.077));
}

/** The M60D's raised rear-sight leaf and the feed cover's front latch block on its receiver (the model's: leaf top 0.16 m
 * over the bore at 0.43 m ahead of the receiver's back face, the latch 0.09 m behind it and 0.035 m outboard). */
function m60dSight(P: CastPort, L: ReturnType<typeof tl>, x: number, z0: number, bore: number): void {
  P.add('turretDark', KIT.box(0.072, 0.10, 0.012), x - 0.01, L.y(bore + 0.11), L.z(z0 + 0.429));
  P.add('turretDark', KIT.box(0.08, 0.063, 0.05), x + 0.025, L.y(bore + 0.074), L.z(z0 + 0.521));
}

/** A turret-side stowage rack over the bustle or flank: rails, posts, a canvas load (world). */
function bustleBasket(P: CastPort, T: TurretFrame, z0: number, z1: number, halfW: number, floorY: number, railY: number,
  seed: number): void {
  const { box, tarpRoll, stowage } = KIT;
  const L = tl(T);
  const d = z0 - z1;
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.03, 0.03, d), side * halfW, L.y(railY), L.z((z0 + z1) / 2));
    P.add('turretDetail', box(0.03, 0.03, d), side * halfW, L.y(floorY), L.z((z0 + z1) / 2));
    for (const z of [z0 - 0.02, (z0 + z1) / 2, z1 + 0.02]) {
      P.add('turretDetail', box(0.028, railY - floorY + 0.03, 0.028), side * halfW, L.y((railY + floorY) / 2), L.z(z));
    }
  }
  P.add('turretDetail', box(halfW * 2, 0.03, 0.03), 0, L.y(railY), L.z(z1 + 0.015));
  P.add('turretDetail', box(halfW * 2, 0.03, 0.03), 0, L.y(floorY), L.z(z1 + 0.015));
  for (const fx of [-0.6, 0, 0.6]) P.add('turretDetail', box(0.04, 0.025, d), fx * halfW, L.y(floorY), L.z((z0 + z1) / 2));
  const rng = mulberry(seed);
  tarpRoll(P, 'turretCloth', -halfW * 0.25, L.y(floorY + 0.10), L.z(z1 + 0.14), halfW * 1.1, 0.085, true, P.q ? 12 : 8);
  stowage(P, 'turretCloth', rng, [[halfW * 0.35, L.y(floorY + (railY - floorY) * 0.45), L.z((z0 + z1) / 2 + 0.05), halfW * 0.7,
    (railY - floorY) * 0.8, d * 0.55]]);
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function antennaWhips(P: CastPort, T: TurretFrame, at: readonly (readonly [number, number])[], h: number, seed: number,
  opts: { top?: number; rake?: number } = {}): void {
  const L = tl(T);
  at.forEach(([x, z], i) => {
    const y = frameTop(T, x, z);
    P.add('turretDark', KIT.cylY(0.04, 0.05, 0.08, 10), x, L.y(y + 0.03), L.z(z));
    // `top` stands the whip's tip at a world height (its base and tip cap add 0.19 m over the mast)
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: opts.top === undefined ? h : opts.top - y - 0.19, r: 0.009,
      rake: opts.rake ?? (x < 0 ? -1 : 1) * 0.05, seed: seed + i });
    whip.position.set(x, L.y(y + 0.07), L.z(z));
    P.turretG.add(whip);
  });
}

function bustleNumbers(P: CastPort, T: TurretFrame, z: number, frac: number, scale: number): void {
  const L = tl(T);
  const [bot, top] = frameSpan(T, z);
  const y = bot + (top - bot) * frac;
  const hw = frameSide(T, y, z);
  P.decal('turret', 'number', P.spec.visual.number || '', scale, [hw + 0.01, L.y(y), L.z(z)], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', scale, [-hw - 0.01, L.y(y), L.z(z)], -Math.PI / 2);
}

/** What pattonCastProportions.selftest.mjs reads back from a build: the authored datums and the running gear's counts. */
interface PattonCastReceipt {
  readonly mark: 'm46' | 'm47' | M48Mark;
  readonly ring: readonly [number, number];
  readonly trunnion: readonly [number, number];
  readonly muzzleZ: number;
  readonly device: GunSpec['device'];
  readonly evacuator: readonly [number, number];
  readonly roadWheels: number;
  readonly wheelR: number;
  readonly returnRollers: number;
  readonly tensionWheel: boolean;
  readonly trackW: number;
  readonly trackCentres: number;
  readonly glacisFromVerticalDeg: number;
}

function publishReceipt(P: CastPort, receipt: PattonCastReceipt): void {
  P.turretG.userData.pattonCastReceipt = Object.freeze({ revision: 'patton-cast-262', ...receipt });
  if (receipt.mark === 'm46' || receipt.mark === 'm47') {
    // the post-war American fit the M46/M47 carry (americanModernization.selftest.mjs): the Sheridan-derived M2HB, the
    // paired guarded headlight groups, two radio whips and the seated bustle stowage
    P.turretG.userData.americanModernizationReceipt = Object.freeze({
      standardMachineGun: 'sheridan-m2hb-v2', guardedLightClusters: 2, antennaWhips: 2, equipmentRack: true, mark: receipt.mark,
    });
  }
}

const glacisDeg = (toe: readonly [number, number], knee: readonly [number, number]): number =>
  +(90 - Math.atan2(knee[1] - toe[1], toe[0] - knee[0]) / (Math.PI / 180)).toFixed(1);

// ---------------------------------------------------------------------------------------------------------------------
// M46 Patton
// ---------------------------------------------------------------------------------------------------------------------

/** M46 / M47 track finish (neutral weathered steel), as the family kept it. */
export interface TrackFinish { readonly trackBandHex: number; readonly trackBandRoughness: number; readonly trackBandEnvMapIntensity: number }

const M46_RING = { y: 1.62, z: -0.34 };
// The Pershing turret on the M46, read off the gate's reference model (docs/references/tanks/m46_patton.md, "Rebuilt
// against the gate's reference model"): the cast front plate at z 0.50, 1.03-1.05 half-width over the ring, the short
// bustle narrowing to 0.45 at -2.08; floor 1.63, roof 2.47 at the front rising to 2.59 over the bustle.
const M46_TURRET: readonly CastStation[] = [
  { z: 0.50, bot: 1.76, top: 2.47, hw: 0.70, roof: 0.78, foot: 0.92, waist: 0.40, nUp: 3.2, nLo: 5 },
  { z: 0.44, bot: 1.65, top: 2.50, hw: 0.82, roof: 0.86, foot: 0.92, waist: 0.40, nUp: 3.2, nLo: 5 },
  { z: 0.22, bot: 1.63, top: 2.52, hw: 0.96, roof: 0.80, foot: 0.96, waist: 0.30, nUp: 2.0, nLo: 5 },
  { z: -0.10, bot: 1.63, top: 2.53, hw: 1.03, roof: 0.80, foot: 0.97, waist: 0.30, nUp: 2.0, nLo: 5 },
  { z: -0.55, bot: 1.63, top: 2.56, hw: 1.02, roof: 0.80, foot: 0.97, waist: 0.30, nUp: 2.0, nLo: 5 },
  { z: -0.95, bot: 1.63, top: 2.58, hw: 0.88, roof: 0.80, foot: 0.96, waist: 0.32, nUp: 2.0, nLo: 5 },
  { z: -1.30, bot: 1.66, top: 2.59, hw: 0.76, roof: 0.86, foot: 0.92, waist: 0.42, nUp: 3.2, nLo: 5 },
  { z: -1.45, bot: 1.84, top: 2.59, hw: 0.67, roof: 0.86, foot: 0.92, waist: 0.42, nUp: 3.2, nLo: 5 },
  { z: -1.85, bot: 1.87, top: 2.54, hw: 0.63, roof: 0.80, foot: 0.92, waist: 0.32, nUp: 2.0, nLo: 5 },
  { z: -2.02, bot: 1.92, top: 2.48, hw: 0.56, roof: 0.74, foot: 0.90, waist: 0.45, nUp: 2.8, nLo: 4 },
  { z: -2.08, bot: 1.98, top: 2.40, hw: 0.45, roof: 0.66, foot: 0.86, waist: 0.48, nUp: 2.6, nLo: 4 },
];
const M46_GUN: GunSpec = {
  trunnionZ: 0.40, axisY: 2.07, muzzleZ: 4.25, r0: 0.125, r1: 0.095,
  evac: { z0: 3.04, z1: 3.83, r: 0.140 }, device: 'm3a1',
};

function* m46TurretSteps(P: CastPort): TankProfileBuild {
  const { box, cylX, cylY, cylZ } = KIT;
  const T: TurretFrame = { ringY: M46_RING.y, ringZ: M46_RING.z, stations: M46_TURRET };
  const L = tl(T);
  P.turretG.position.set(0, T.ringY, T.ringZ);
  P.add('turret', castSolid(M46_TURRET, P.q, T.ringZ, T.ringY));
  // the basket under the ring (the crew's floor, in the hull's well; inside the ring's rim, so the seat leaves it)
  P.add('turretDark', cylY(0.70, 0.70, 0.64, P.q ? 24 : 12), 0, L.y(1.16), L.z(-0.31));
  // the stowage boxes stacked on the left cheek
  for (const [y0, y1, z0, z1, xo] of [[1.88, 2.08, -0.55, -0.11, 1.21], [2.10, 2.28, -0.57, -0.09, 1.17], [2.30, 2.46, -0.57, 0.05, 1.13]] as const) {
    const x = castSideAt(M46_TURRET, (y0 + y1) / 2, (z0 + z1) / 2);
    P.add('turretDetail', moldedBox(xo - x + 0.03, y1 - y0, z1 - z0, 0.012, P.q ? 2 : 1, 0.006), (x - 0.03 + xo) / 2,
      L.y((y0 + y1) / 2), L.z((z0 + z1) / 2));
  }
  yield 'm46TurretCasting';
  // roof: commander's vision cupola on the right rear, loader's hatch on the left, the gunner's periscope ahead of the
  // cupola, the ventilator over the gun, the M2 on its post at the cupola
  // the cupola's low vision-block ring under its domed hatch (the reference's: 0.77 across at 2.70, the dome to 2.84)
  {
    const top = visionCupola(P, T, -0.46, -0.775, 0.355, 0.14, 8);
    P.add('turret', KIT.xform(KIT.sph(0.29, P.q ? 20 : 12, P.q ? 10 : 6), 0, 0, 0, 0, 0, 0, [1, 0.42, 1]), -0.46,
      L.y(top - 0.035), L.z(-0.775));
  }
  loaderHatch(P, T, 0.50, -0.52, 0.30);
  roofScope(P, T, -0.42, 0.12, 0, 0.09);
  // the commander's vane sight on the roof's right front corner, ahead of the cupola
  {
    const vy = castTopAt(M46_TURRET, -0.90, 0.10);
    P.add('turretDark', box(0.04, 0.04, 0.06), -0.90, L.y(vy + 0.01), L.z(0.10));
    P.add('turretDark', box(0.012, 0.14, 0.07), -0.90, L.y(vy + 0.09), L.z(0.10));
  }
  roofScope(P, T, 0.30, -0.02, 0, 0.05);
  roofScope(P, T, 0.53, -1.20, 0, 0.12);
  ventilator(P, T, 0.12, 0.20, 0.13);
  P.add('turretDetail', box(0.15, 0.10, 0.16), -0.195, L.y(castTopAt(M46_TURRET, -0.195, -1.80) + 0.04), L.z(-1.80));
  // the M2 on its pedestal right of the gun, ahead of the cupola (the reference's: z -0.47 to 1.23, its top 3.17)
  // (1.71 m from its grips to the flash hider, scale 1.06), its ammunition chest on its left on the pedestal's arm
  const postY = castTopAt(M46_TURRET, -0.07, 0.14);
  P.add('turretDark', cylY(0.03, 0.04, 3.12 - postY, 10), -0.07, L.y((3.12 + postY) / 2), L.z(0.14));
  P.add('turretDark', box(0.42, 0.05, 0.08), -0.26, L.y(2.70), L.z(0.0));
  roofM2(P, T, -0.48, -0.165, 2.726, { barrel: 0.735, seed: 461, ring: false, elev: 0, scale: 1.06, ammo: false });
  P.add('turretDetail', moldedBox(0.24, 0.30, 0.46, 0.012, P.q ? 2 : 1, 0.006), -0.25, L.y(3.00), L.z(0.11));
  yield 'm46TurretRoof';
  // the bustle's stowage rack on its rear face, lifting eyes, whips, numbers
  // the rack's load ends at -2.14, its floor at 2.00 and rail at 2.29; its side rails run on to the corner posts at -2.36
  bustleBasket(P, T, -2.00, -2.14, 0.55, 2.00, 2.29, 466);
  for (const side of [-1, 1]) {
    for (const y of [2.10, 2.34]) P.add('turretDetail', box(0.03, 0.03, 0.22), side * 0.45, L.y(y), L.z(-2.25));
    P.add('turretDetail', box(0.03, 0.27, 0.03), side * 0.45, L.y(2.22), L.z(-2.35));
  }
  // the cast lifting lugs on the bustle's flanks, their rings standing out of them
  for (const side of [-1, 1]) {
    const [ez, ey] = [-1.56, 2.15];
    const x = castSideAt(M46_TURRET, ey, ez);
    P.add('turret', box(0.12, 0.07, 0.10), side * (x + 0.04), L.y(ey), L.z(ez));
    P.add('turretDark', KIT.xform(KIT.torus(0.05, 0.016, P.q ? 14 : 8), 0, 0, 0, 0, Math.PI / 2, 0), side * (x + 0.10), L.y(ey + 0.02), L.z(ez));
  }
  bustleNumbers(P, T, -1.70, 0.55, 0.22);
  yield 'm46TurretFittings';
  // gun: the rotor shield on the trunnion (coax and sight ports), the cast front plate's cheeks around it
  const G = M46_GUN;
  P.gunG.position.set(0, G.axisY - T.ringY, G.trunnionZ - T.ringZ);
  // (its bevelled foot at 1.83 keeps the corners clear of the hatch lids at -10 and of the engine deck's grilles as it
  // traverses)
  P.addGunExtra(rotorShield(0.54, 0.10, 1.32, -0.36, 0.42, P.q), 0, 0, 0);
  // the trunnion bar's bosses standing out of the shield's sides
  P.addGunExtra(cylX(0.11, 1.48, P.q ? 18 : 10), 0, -0.02, 0.48);
  P.addGunExtraDark(box(0.07, 0.07, 0.04), 0.30, 0.04, 0.555);
  P.addGunExtraDark(box(0.09, 0.09, 0.04), -0.32, 0.10, 0.545);
  P.addGunExtra(cylZ(0.16, 0.16, P.q ? 18 : 10), 0, 0, 0.60);
  // the front plate's opening frame the shield turns in
  P.add('turret', box(1.20, 0.10, 0.10), 0, L.y(2.47), L.z(0.50));
  P.add('turret', box(1.20, 0.08, 0.10), 0, L.y(1.82), L.z(0.50));
  pattonGun(P, G);
  P.topY = L.y(3.18) + 0.12;
  yield 'm46Gun';
}

const M46_HULL_SPEC: PershingHullSpec = {
  mark: 'm46', tailZ: -4.05, toe: [1.72, 0.95], knee: [1.17, 1.65], glacisShoulder: [1.36, 1.31], bellyFrontZ: 1.45, bellyRearZ: -3.30, bellyY: 0.46,
  deckY: 1.62, engineDeckY: 1.73, engineDeckZ: -1.30, tailTopY: 1.61, tailBotY: 0.64,
  sponsonHW: 1.45, sponsonY: 1.40, fenderHW: 1.756, fenderY: 1.40, trackW: 0.64, xc: 1.36,
  fenderLine: [[-4.24, 1.40], [1.45, 1.40], [1.62, 1.32]], rearFlapH: 0.20, rearFlapOuterH: 0.37, rearFlapX: [1.06, 1.75], frontFlap: false, noseDepth: 0.10,
  sponsonFrontBox: [0.94, 1.17, 1.45, 1.68, 1.50, 1.68], fenderBrackets: [-1.80, 0, 0.45, 0.90], fenderBoxH: 0.25, fenderBoxX: [1.45, 1.61],
  fenderBoxes: [[1.20, 0.25], [0.20, -0.75], [-0.80, -1.85], [-1.90, -3.05]], mufflers: false, bowLights: [0.70, 1.15, 1.90],
  rearGrille: [0.64, 1.25, 1.52, 0.17],
  gear: {
    wheelR: 0.33, wheelY: 0.36, span: [1.02, -2.68], rollerN: 5, rollerY: 1.04, rollerSpan: [0.55, -2.40],
    idler: { z: 1.63, y: 0.88, r: 0.30 }, sprocket: { z: -3.86, y: 1.02, r: 0.33, axialScaleLeft: 0.94, axialScaleRight: 0.94 },
    tension: { z: -3.22, y: 0.513, r: 0.20 }, tensionInside: true, contactZF: 1.15, contactZR: -2.80,
  },
};

export function* buildM46CastSteps(P: CastPort, finish: TrackFinish): TankProfileBuild {
  yield* pershingHullSteps(P, { ...M46_HULL_SPEC, gear: { ...M46_HULL_SPEC.gear, ...finish } });
  yield* m46TurretSteps(P);
  const H = M46_HULL_SPEC, G = M46_GUN;
  publishReceipt(P, {
    mark: 'm46', ring: [M46_RING.y, M46_RING.z], trunnion: [G.axisY, G.trunnionZ], muzzleZ: G.muzzleZ, device: G.device,
    evacuator: [G.evac?.z0 ?? 0, G.evac?.z1 ?? 0], roadWheels: 6, wheelR: H.gear.wheelR, returnRollers: H.gear.rollerN,
    tensionWheel: Boolean(H.gear.tension), trackW: H.trackW, trackCentres: H.xc * 2,
    glacisFromVerticalDeg: glacisDeg(H.toe, H.glacisShoulder ?? H.knee),
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// M47 Patton (Patton II)
// ---------------------------------------------------------------------------------------------------------------------

const M47_RING = { y: 1.62, z: -0.35 };
// The T42-derived cast turret, read off the gate's reference model (docs/references/tanks/m47_patton.md): near-vertical
// flanks 1.10 out to 2.30, a straight chamfer to the 0.60 m roof edge at 2.72, the long sloped nose to 1.10; the bustle
// carries its stowage 0.73 wide back to -2.70.
const M47_TURRET: readonly CastStation[] = [
  { z: 0.84, bot: 1.70, top: 2.46, hw: 0.50, roof: 0.60, foot: 0.90, waist: 0.65, nUp: 1.2, nLo: 3 },
  { z: 0.70, bot: 1.63, top: 2.55, hw: 0.62, roof: 0.58, foot: 0.85, waist: 0.65, nUp: 1.2, nLo: 3 },
  { z: 0.50, bot: 1.63, top: 2.63, hw: 0.82, roof: 0.73, foot: 0.92, waist: 0.65, nUp: 1.2, nLo: 4 },
  { z: 0.30, bot: 1.63, top: 2.68, hw: 0.97, roof: 0.62, foot: 0.95, waist: 0.64, nUp: 1.2, nLo: 4 },
  { z: 0.10, bot: 1.63, top: 2.71, hw: 1.06, roof: 0.57, foot: 0.97, waist: 0.62, nUp: 1.2, nLo: 4 },
  { z: -0.20, bot: 1.63, top: 2.72, hw: 1.10, roof: 0.55, foot: 0.98, waist: 0.61, nUp: 1.2, nLo: 4 },
  { z: -0.60, bot: 1.63, top: 2.72, hw: 1.10, roof: 0.55, foot: 0.97, waist: 0.61, nUp: 1.2, nLo: 4 },
  { z: -0.90, bot: 1.63, top: 2.71, hw: 1.04, roof: 0.58, foot: 0.90, waist: 0.62, nUp: 1.2, nLo: 4 },
  { z: -1.10, bot: 1.66, top: 2.69, hw: 0.97, roof: 0.62, foot: 0.80, waist: 0.62, nUp: 1.2, nLo: 4 },
  { z: -1.34, bot: 1.80, top: 2.66, hw: 0.88, roof: 0.68, foot: 0.80, waist: 0.58, nUp: 1.2, nLo: 4 },
  { z: -1.50, bot: 1.89, top: 2.64, hw: 0.84, roof: 0.71, foot: 0.85, waist: 0.55, nUp: 1.2, nLo: 4 },
];
const M47_BUSTLE: readonly CastStation[] = [
  { z: -1.30, bot: 1.85, top: 2.64, hw: 0.86, roof: 0.66, foot: 0.85, waist: 0.58, nUp: 1.4, nLo: 4 },
  { z: -1.80, bot: 1.95, top: 2.61, hw: 0.76, roof: 0.66, foot: 0.90, waist: 0.55, nUp: 1.4, nLo: 4 },
  { z: -2.10, bot: 1.95, top: 2.58, hw: 0.65, roof: 0.70, foot: 0.92, waist: 0.57, nUp: 1.4, nLo: 4 },
  { z: -2.30, bot: 1.96, top: 2.57, hw: 0.73, roof: 0.78, foot: 0.84, waist: 0.57, nUp: 1.4, nLo: 5 },
  { z: -2.50, bot: 1.96, top: 2.56, hw: 0.73, roof: 0.80, foot: 0.84, waist: 0.58, nUp: 1.4, nLo: 5 },
  { z: -2.64, bot: 1.99, top: 2.54, hw: 0.70, roof: 0.78, foot: 0.84, waist: 0.58, nUp: 1.4, nLo: 5 },
  { z: -2.70, bot: 2.03, top: 2.48, hw: 0.47, roof: 0.66, foot: 0.86, waist: 0.60, nUp: 1.4, nLo: 4 },
];
const M47_GUN: GunSpec = {
  trunnionZ: 0.55, axisY: 2.07, muzzleZ: 4.40, r0: 0.125, r1: 0.095,
  evac: { z0: 3.36, z1: 3.94, r: 0.138 }, device: 'm36',
};

function* m47TurretSteps(P: CastPort): TankProfileBuild {
  const { box, cylX, cylY, cylZ, sph } = KIT;
  const T: TurretFrame = { ringY: M47_RING.y, ringZ: M47_RING.z, stations: [...M47_TURRET, ...M47_BUSTLE.slice(1)] };
  const L = tl(T);
  P.turretG.position.set(0, T.ringY, T.ringZ);
  P.add('turret', castSolid(M47_TURRET, P.q, T.ringZ, T.ringY));
  P.add('turret', castSolid(M47_BUSTLE, P.q, T.ringZ, T.ringY));
  // the basket under the ring (inside the ring's rim, so the seat leaves it)
  P.add('turretDark', cylY(0.69, 0.69, 0.64, P.q ? 24 : 12), 0, L.y(1.16), L.z(-0.33));
  yield 'm47TurretCasting';
  // the M12 stereoscopic rangefinder's armoured end blisters high on the cheeks with their ports, the stowage rail along
  // the flanks
  for (const side of [-1, 1]) {
    const z = 0.20, y = 2.52;
    const x = side * castSideAt(M47_TURRET, y, z);
    P.add('turret', KIT.xform(sph(0.13, P.q ? 18 : 10, P.q ? 12 : 6), 0, 0, 0, 0, 0, 0, [0.55, 0.75, 1.0]), x - side * 0.02, L.y(y), L.z(z));
    P.add('turretGlass', box(0.012, 0.07, 0.10), x + side * 0.054, L.y(y), L.z(z + 0.01));
    P.add('turretDark', cylX(0.06, 0.03, P.q ? 14 : 8), x + side * 0.038, L.y(y), L.z(z));
    const rail: number[][] = [];
    for (let z0 = -1.15; z0 <= 0.22; z0 += 0.2741) rail.push([side * (castSideAt(M47_TURRET, 2.22, z0) + (side > 0 ? 0.035 : 0.015)), L.y(2.22), L.z(z0)]);
    for (let i = 0; i + 1 < rail.length; i++) bar(P, 'turretDetail', rail[i], rail[i + 1], 0.016);
  }
  yield 'm47TurretRangefinder';
  // roof: the commander's cupola on the right with the M2, the loader's hatch on the left, gunner's periscope, vent
  // (the cupola an oval 0.68 by 0.95 m, its rear rim over the bustle's start)
  visionCupola(P, T, -0.43, -0.78, 0.34, 0.22, 8, 1.40);
  loaderHatch(P, T, 0.50, -0.60, 0.29);
  roofScope(P, T, -0.40, 0.18, 0, 0.09);
  ventilator(P, T, 0, -2.11, 0.23);
  // the radio antenna's mount on the bustle roof's right, ahead of the ventilator
  P.add('turretDark', cylY(0.06, 0.07, 0.16, 12), -0.31, L.y(castTopAt(T.stations, -0.31, -1.88) + 0.07), L.z(-1.88));
  // the M2 on its post between the cupola and the centre line (the reference's: z -0.84 to 0.86, its top 3.39), the
  // ammunition chest on its left
  const postY = castTopAt(T.stations, 0, -0.73);
  P.add('turretDark', cylY(0.035, 0.045, 2.95 - postY, 10), 0, L.y((2.95 + postY) / 2), L.z(-0.73));
  roofM2(P, T, 0, -0.533, 2.946, { barrel: 0.68, seed: 471, ring: false, elev: 0, scale: 1.06, ammo: false });
  P.add('turretDetail', moldedBox(0.21, 0.29, 0.18, 0.01, P.q ? 2 : 1, 0.005), 0.185, L.y(3.225), L.z(-0.22));
  // the cradle off the cupola's ring that carries it
  P.add('turretDark', moldedBox(0.08, 0.50, 0.24, 0.012, P.q ? 2 : 1, 0.006), -0.18, L.y(3.13), L.z(-0.75));
  yield 'm47TurretRoof';
  // the long bustle: the stowage rack on its tail (its floor at the casting's bottom edge), numbers
  bustleBasket(P, T, -2.66, -2.80, 0.60, 2.04, 2.22, 474);
  bustleNumbers(P, T, -2.05, 0.50, 0.22);
  yield 'm47TurretFittings';
  const G = M47_GUN;
  P.gunG.position.set(0, G.axisY - T.ringY, G.trunnionZ - T.ringZ);
  // the narrow curved gun shield in the nose, its coax and sight ports
  // the rounded gun shield standing proud of the casting's nose (the casting ends at z 0.84, the shield's face at 1.10),
  // its bevelled foot at 1.81 clear of the hatch fittings at -10 and of the engine deck's grilles as it traverses
  P.addGunExtra(rotorShield(0.55, 0.10, 0.70, -0.40, 0.45, P.q), 0, 0, 0);
  P.addGunExtraDark(box(0.06, 0.06, 0.04), 0.26, 0.02, 0.48);
  P.addGunExtraDark(box(0.07, 0.07, 0.04), -0.27, 0.08, 0.47);
  P.addGunExtra(cylZ(0.15, 0.14, P.q ? 18 : 10), 0, 0, 0.58);
  pattonGun(P, G);
  P.topY = L.y(3.35) + 0.12;
  yield 'm47Gun';
}

const M47_HULL_SPEC: PershingHullSpec = {
  mark: 'm47', tailZ: -4.00, toe: [2.01, 1.00], knee: [0.92, 1.61], bellyFrontZ: 1.62, bellyRearZ: -3.25, bellyY: 0.47,
  deckY: 1.62, engineDeckY: 1.71, engineDeckZ: -1.20, tailTopY: 1.50, tailBotY: 0.70,
  sponsonHW: 1.45, sponsonY: 1.40, fenderHW: 1.756, fenderY: 1.40, trackW: 0.64, xc: 1.36,
  // the rear fender stays level over the sprocket, then turns down behind its wrap
  // the rear flaps hang under the fender's overhang only: across the whole track they closed a plan pocket between the
  // track's end, the flap and the hull's corner
  fenderLine: [[-4.12, 1.08], [-4.00, 1.26], [-3.85, 1.40], [1.75, 1.40], [2.12, 1.10]], rearFlapX: [1.33, 1.70],
  noseDepth: 0.04,
  fenderBoxH: 0.26, fenderBoxX: [1.45, 1.66], fenderBoxes: [[0.50, -0.40], [-0.45, -1.45], [-1.50, -2.90]],
  outerBox: [1.66, 1.75, 1.40, 1.58, -2.00, -1.80],
  // the headlight groups high on the glacis by its edges; the rear plate under the engine grilles' overhang
  mufflers: false, bowLights: [0.90, 1.44, 1.62], frontFlap: false, bowEyesOnGlacis: true, rearGrille: [0.94, 1.00, 1.50, 0.16, 0.56],
  sponsonFrontBox: [0.94, 1.30, 1.45, 1.63, 0.92, 1.18], fenderBrackets: [-0.45, 0, 0.43, 1.30],
  gear: {
    wheelR: 0.33, wheelY: 0.36, span: [0.92, -2.65], rollerN: 3, rollerY: 1.04, rollerSpan: [0.25, -2.15],
    idler: { z: 1.64, y: 0.88, r: 0.30 }, sprocket: { z: -3.65, y: 1.04, r: 0.30, axialScaleLeft: 0.94, axialScaleRight: 0.94 },
    tension: { z: -3.25, y: 0.611, r: 0.20 }, tensionInside: true, contactZF: 1.15, contactZR: -2.85,
  },
};

export function* buildM47CastSteps(P: CastPort, finish: TrackFinish): TankProfileBuild {
  yield* pershingHullSteps(P, { ...M47_HULL_SPEC, gear: { ...M47_HULL_SPEC.gear, ...finish } });
  yield* m47TurretSteps(P);
  const H = M47_HULL_SPEC, G = M47_GUN;
  publishReceipt(P, {
    mark: 'm47', ring: [M47_RING.y, M47_RING.z], trunnion: [G.axisY, G.trunnionZ], muzzleZ: G.muzzleZ, device: G.device,
    evacuator: [G.evac?.z0 ?? 0, G.evac?.z1 ?? 0], roadWheels: 6, wheelR: H.gear.wheelR, returnRollers: H.gear.rollerN,
    tensionWheel: Boolean(H.gear.tension), trackW: H.trackW, trackCentres: H.xc * 2, glacisFromVerticalDeg: glacisDeg(H.toe, H.knee),
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Landmark lofts (the M48A5)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A landmark station (docs/tank-generation/geometry-methods.md §2: sparse measured landmarks, never sampled contours):
 * [z, keel y, crown y, five knots on the half section as x, y pairs from the keel round to the crown, the bulge of each
 * of the six spans between keel, knots and crown (m: the span's midpoint off its chord, + outward)]. The curve through
 * the knots is ours: a quadratic arc per span.
 */
type LandmarkStation = readonly [number, number, number, readonly number[], readonly number[]];

interface LandmarkRule {
  /** Points inside each of the six spans at high and low quality. */
  readonly high: readonly number[];
  readonly low: readonly number[];
  /** Spans whose faces shade as one casting (the rest keep their facets). */
  readonly smooth: readonly number[];
  /** Smooth stations inserted between measured rows at high quality. */
  readonly between: number;
}

function landmarkHalf(s: LandmarkStation, samples: readonly number[]): [number, number][] {
  const [, keel, crown, k, b] = s;
  const pts: [number, number][] = [[0, keel], [k[0], k[1]], [k[2], k[3]], [k[4], k[5]], [k[6], k[7]], [k[8], k[9]], [0, crown]];
  const out: [number, number][] = [pts[0]];
  for (let j = 0; j < 6; j++) {
    const [ax, ay] = pts[j], [bx, by] = pts[j + 1];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    const nx = len > 1e-9 ? dy / len : 0, ny = len > 1e-9 ? -dx / len : 0;
    const cx = (ax + bx) / 2 + 2 * b[j] * nx, cy = (ay + by) / 2 + 2 * b[j] * ny;
    for (let i = 1; i <= samples[j]; i++) {
      const t = i / (samples[j] + 1), u = 1 - t;
      out.push([Math.max(0.004, u * u * ax + 2 * u * t * cx + t * t * bx), u * u * ay + 2 * u * t * cy + t * t * by]);
    }
    out.push([bx, by]);
  }
  return out;
}

/** Smooth stations between the measured rows (high quality): every scalar of a row (z, keel, crown, knots, bulges)
 * follows a Catmull-Rom curve through its neighbours, so a bow or a dome nose rolls through its stations instead of
 * breaking at each one. The measured rows stay on the curve. */
function refineStations(stations: readonly LandmarkStation[], between: number): LandmarkStation[] {
  const flat = stations.map(([z, keel, crown, k, b]) => [z, keel, crown, ...k, ...b]);
  const out: LandmarkStation[] = [];
  const row = (v: readonly number[]): LandmarkStation => [v[0], v[1], v[2], v.slice(3, 13), v.slice(13, 19)];
  for (let i = 0; i < flat.length - 1; i++) {
    const p0 = flat[Math.max(0, i - 1)], p1 = flat[i], p2 = flat[i + 1], p3 = flat[Math.min(flat.length - 1, i + 2)];
    out.push(row(p1));
    for (let j = 1; j <= between; j++) {
      const t = j / (between + 1), t2 = t * t, t3 = t2 * t;
      // z stays linear (the loft needs rising stations); the section follows the curve
      out.push(row(p1.map((v, k) => k === 0 ? v + (p2[0] - v) * t : 0.5 * (2 * v + (-p0[k] + p2[k]) * t
        + (2 * p0[k] - 5 * v + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * v - 3 * p2[k] + p3[k]) * t3))));
    }
  }
  out.push(row(flat[flat.length - 1]));
  return out;
}

/** The half section at z, the neighbouring stations' points blended as the loft's faces blend them. */
function landmarkHalfAt(stations: readonly LandmarkStation[], samples: readonly number[], z: number): [number, number][] {
  const last = stations.length - 1;
  let i = 0;
  while (i < last - 1 && stations[i + 1][0] < z) i++;
  const a = stations[i], b = stations[i + 1];
  const t = Math.max(0, Math.min(1, (z - a[0]) / (b[0] - a[0])));
  const ha = landmarkHalf(a, samples), hb = landmarkHalf(b, samples);
  return ha.map(([x, y], k) => [x + (hb[k][0] - x) * t, y + (hb[k][1] - y) * t]);
}

/** The surface seats of a landmark loft (world): the roof height at (x, z), the side's half-width at (y, z). */
function landmarkSeat(measured: readonly LandmarkStation[], rule: LandmarkRule): CastSeat {
  const stations = refineStations(measured, rule.between);
  return {
    topAt(x: number, z: number): number {
      const h = landmarkHalfAt(stations, rule.high, z), ax = Math.abs(x);
      for (let k = h.length - 1; k > 0; k--) {
        const [x1, y1] = h[k], [x0, y0] = h[k - 1];
        if ((x0 - ax) * (x1 - ax) <= 0 && x0 !== x1) return y1 + (y0 - y1) * ((ax - x1) / (x0 - x1));
      }
      return h[0][1];
    },
    sideAt(y: number, z: number): number {
      const h = landmarkHalfAt(stations, rule.high, z);
      let best = 0;
      for (let k = 1; k < h.length; k++) {
        const [x0, y0] = h[k - 1], [x1, y1] = h[k];
        if ((y0 - y) * (y1 - y) <= 0 && y0 !== y1) best = Math.max(best, x0 + (x1 - x0) * ((y - y0) / (y1 - y0)));
      }
      return best;
    },
    span(z: number): readonly [number, number] {
      const h = landmarkHalfAt(stations, rule.high, z);
      return [h[0][1], h[h.length - 1][1]];
    },
  };
}

/** A closed loft through landmark stations (ascending z), moved by (dy, dz) into a rig frame. */
function landmarkLoft(stations: readonly LandmarkStation[], rule: LandmarkRule, q: boolean | undefined, dz = 0, dy = 0): Geo {
  const samples = q ? rule.high : rule.low;
  const sections = (q ? refineStations(stations, rule.between) : stations).map((s) => {
    const half = landmarkHalf(s, samples);
    const ring = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y] as [number, number])];
    return { z: s[0] - dz, ring: ring.map(([x, y]) => [x, y - dy] as const) };
  });
  const h = landmarkHalf(stations[0], samples).length, n = 2 * h - 2;
  const spanOf: number[] = [];
  samples.forEach((c, j) => { for (let i = 0; i <= c; i++) spanOf.push(j); });
  const smooth: number[] = [];
  for (let e = 0; e < n; e++) if (rule.smooth.includes(spanOf[e < h - 1 ? e : n - 1 - e])) smooth.push(e);
  // the end stations' flat floors carry collinear points: keep each in the caps so the shell stays closed
  const g = sectionSolid(sections, { centeredSideQuads: true, smoothSideEdges: smooth, preserveCapBoundary: true });
  g.userData.pattonCastLoft = 'landmark';
  return g;
}

/** A plate between two (z, yBottom, yTop) runs at constant x span (the fenders' inner skirts). */
function skirtRun(x0: number, x1: number, rows: readonly (readonly [number, number, number])[]): Geo {
  return sectionSolid([...rows].sort((a, b) => a[0] - b[0]).map(([z, yb, yt]) => ({
    z, ring: [[x0, yb], [x1, yb], [x1, yt], [x0, yt]] as SectionPoint[],
  })), {});
}

/** A round bar from a to b (world or frame points). */
function bar(P: CastPort, slot: string, a: readonly number[], b: readonly number[], r: number, seg = 8): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  // Euler XYZ: Rx(a) Ry(b) carries +z to (sin b, -cos b sin a, cos b cos a)
  P.add(slot, KIT.cylZ(r, len, seg), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2,
    Math.atan2(-dy, dz), Math.asin(dx / len), 0);
}

// ---------------------------------------------------------------------------------------------------------------------
// M48A5 Patton
// ---------------------------------------------------------------------------------------------------------------------

// The owner's supplied model (ater.studio; "use this patton for the m48", then "just redesign the m48 off of the model
// ... completely update hull and shaping" and "match its geometry!") read as landmark stations, 1 cm, at the stations
// where its sections change: docs/references/tanks/m48a5_patton.md. The turret ring is centred at z 0.58 on the deck
// collar's 1.633 m top; the 105 mm's trunnion at the model's 1.921 m bore axis (the 258 fix's 2.10 m was for the old
// 1.80 m deck: the model's driver's deck is 1.47-1.53 and its turret deck 1.51, so the low mantlet clears at -9 deg).
const M48_RING = { y: 1.633, z: 0.58 };
// The gun pivots where the source-world certificate puts it (tools/source-world-registration.mjs): the model's gun node
// station on its bore axis. Its fittings are authored from the bore's station 1.514 (GUN_Z0) and moved onto the pivot.
const M48_TRUNNION = { y: 1.921, z: 1.7616 };
const GUN_Z0 = 1.514 - M48_TRUNNION.z;

/** The cast boat hull: keel, chine knee, the widest bilge ridge, the waist under the deck edge, the deck edge, the
 * engine deck's raised centre (the hump knot), crown. Along the track's top run the waist tucks under the run and inside
 * its inner edge (the model's bilge-to-waist slope ran through the belt): the bilge ridge becomes a shelf 4 cm under the
 * run, and the side rises from it inboard of the track. */
const M48_HULL_RULE: LandmarkRule = { high: [2, 3, 2, 2, 2, 2], low: [1, 1, 0, 0, 0, 1], smooth: [0, 1, 2, 3, 4, 5], between: 1 };
const M48_HULL: readonly LandmarkStation[] = [
  [-3.05, 1.05, 1.77, [0.80, 1.06, 0.89, 1.20, 0.89, 1.42, 0.88, 1.62, 0.62, 1.79], [0.006, 0.042, 0, 0.003, 0.027, 0.010]],
  [-2.92, 0.84, 1.79, [0.80, 0.85, 0.89, 1.10, 0.89, 1.40, 0.90, 1.64, 0.62, 1.80], [0, 0.048, 0, 0, 0.020, 0.004]],
  [-2.75, 0.69, 1.80, [0.84, 0.71, 0.89, 0.95, 0.89, 1.40, 0.90, 1.64, 0.66, 1.80], [0.007, 0.029, 0, 0, 0.019, 0.012]],
  [-2.62, 0.60, 1.82, [0.84, 0.67, 0.90, 0.90, 0.89, 1.40, 0.90, 1.63, 0.62, 1.82], [0, 0.027, 0, 0, 0.032, 0]],
  [-2.48, 0.51, 1.83, [0.80, 0.60, 0.90, 0.86, 0.92, 1.32, 1.04, 1.58, 0.58, 1.84], [0.005, 0.049, 0, 0, 0.023, 0]],
  [-2.32, 0.41, 1.85, [0.70, 0.47, 1.27, 1.10, 1.08, 1.255, 1.12, 1.60, 0.60, 1.85], [0.003, 0.089, 0, 0, 0, 0]],
  [-2.15, 0.38, 1.85, [0.64, 0.47, 1.31, 1.10, 1.08, 1.25, 1.12, 1.62, 0.60, 1.85], [0.013, 0.099, 0, 0, 0, 0]],
  [-1.60, 0.38, 1.83, [0.64, 0.47, 1.31, 1.10, 1.08, 1.25, 1.12, 1.62, 0.55, 1.83], [0.015, 0.091, 0, 0, 0, 0]],
  [-1.30, 0.38, 1.77, [0.64, 0.47, 1.31, 1.10, 1.08, 1.25, 1.10, 1.60, 0.48, 1.77], [0.014, 0.092, 0, 0, 0, 0]],
  [-1.00, 0.38, 1.69, [0.64, 0.47, 1.31, 1.10, 1.08, 1.25, 1.06, 1.58, 0.40, 1.69], [0.011, 0.096, 0, 0, 0, 0]],
  [-0.70, 0.38, 1.64, [0.64, 0.47, 1.30, 1.09, 1.08, 1.25, 1.06, 1.55, 0.34, 1.64], [0.012, 0.091, 0, 0, 0, 0]],
  [-0.40, 0.38, 1.53, [0.64, 0.47, 1.29, 1.07, 1.08, 1.25, 1.04, 1.51, 0.50, 1.52], [0.011, 0.090, 0, 0, 0, 0]],
  [0.00, 0.38, 1.51, [0.64, 0.47, 1.29, 1.05, 1.08, 1.25, 1.02, 1.51, 0.50, 1.51], [0.010, 0.081, 0, 0, 0, 0]],
  [1.60, 0.39, 1.51, [0.64, 0.48, 1.28, 1.05, 1.08, 1.25, 1.00, 1.51, 0.50, 1.51], [0.015, 0.085, 0, 0, 0, 0]],
  [1.95, 0.39, 1.50, [0.64, 0.48, 1.28, 1.05, 1.06, 1.19, 0.90, 1.48, 0.55, 1.52], [0.013, 0.080, 0, 0.026, 0.028, 0]],
  [2.20, 0.39, 1.48, [0.66, 0.48, 1.25, 1.05, 1.06, 1.17, 0.90, 1.40, 0.50, 1.49], [0.011, 0.097, 0.020, 0.015, 0.026, 0]],
  [2.50, 0.40, 1.49, [0.80, 0.45, 1.16, 1.03, 1.06, 1.24, 0.81, 1.35, 0.43, 1.46], [0, 0.054, 0.012, 0.005, 0.007, 0.029]],
  [2.60, 0.41, 1.49, [0.70, 0.51, 1.13, 1.03, 1.03, 1.23, 0.78, 1.33, 0.40, 1.43], [0.005, 0.108, 0.033, 0.003, 0.004, 0.008]],
  [2.70, 0.46, 1.45, [0.62, 0.57, 1.07, 1.02, 1.01, 1.23, 0.72, 1.31, 0.37, 1.39], [0.020, 0.117, 0.035, 0, 0.005, 0.009]],
  [2.85, 0.54, 1.37, [0.71, 0.69, 1.18, 1.03, 0.99, 1.22, 0.65, 1.27, 0.32, 1.33], [0.022, 0.086, 0.031, 0.004, 0.003, 0.009]],
  [3.00, 0.64, 1.28, [0.56, 0.76, 1.19, 0.96, 1.05, 1.12, 0.63, 1.20, 0.36, 1.24], [0.026, 0.077, 0.053, 0.041, 0, 0.009]],
  [3.12, 0.74, 1.21, [0.52, 0.88, 1.01, 0.97, 0.83, 1.09, 0.50, 1.11, 0.30, 1.17], [0.028, 0.030, 0.040, 0, 0.003, 0.007]],
  [3.22, 0.84, 1.13, [0.33, 0.93, 0.42, 1.04, 0.34, 1.08, 0.24, 1.10, 0.12, 1.13], [0.022, 0.018, 0, 0.003, 0, 0]],
  [3.30, 0.96, 1.07, [0.15, 0.99, 0.19, 1.01, 0.16, 1.04, 0.12, 1.06, 0.06, 1.07], [0.010, 0.004, 0.008, 0.005, 0, 0]],
];

/** The egg dome: floor centre, the floor's outer corner (the foot), then the wall at 18, 52 and 84 % of the casting's
 * height and the roof's edge 2 cm under the crown, so every station's knots sit at the same heights and the loft never
 * twists; the bustle's tail rolls under to z -1.51. */
const M48_DOME_RULE: LandmarkRule = { high: [1, 2, 2, 3, 3, 3], low: [0, 1, 0, 1, 1, 1], smooth: [1, 2, 3, 4, 5], between: 1 };
const M48_DOME: readonly LandmarkStation[] = [
  [-1.51, 1.840, 1.89, [0.10, 1.85, 0.13, 1.86, 0.10, 1.88, 0.06, 1.89, 0.03, 1.89], [-0.005, 0, 0.005, 0, -0.002, 0]],
  [-1.46, 1.830, 2.00, [0.32, 1.84, 0.40, 1.86, 0.31, 1.92, 0.17, 1.97, 0.14, 1.98], [0.004, 0.006, 0, 0.008, 0, 0.002]],
  [-1.40, 1.820, 2.09, [0.52, 1.83, 0.54, 1.87, 0.45, 1.96, 0.28, 2.05, 0.21, 2.07], [0.002, 0.011, 0, 0.009, 0, 0]],
  [-1.33, 1.810, 2.18, [0.65, 1.82, 0.66, 1.88, 0.55, 2.00, 0.33, 2.12, 0.20, 2.16], [0, 0.015, 0.003, 0.011, 0.003, 0]],
  [-1.25, 1.800, 2.29, [0.75, 1.81, 0.76, 1.89, 0.62, 2.06, 0.36, 2.21, 0.13, 2.27], [0, 0.02, 0.007, 0.005, 0.006, 0]],
  [-1.18, 1.790, 2.37, [0.84, 1.80, 0.83, 1.89, 0.66, 2.09, 0.39, 2.28, 0.15, 2.35], [0, 0.023, 0.021, 0.009, 0.024, 0]],
  [-0.92, 1.740, 2.54, [0.80, 1.78, 1.02, 1.88, 0.84, 2.16, 0.55, 2.41, 0.24, 2.52], [0.005, 0.061, 0.012, 0.009, 0.016, 0.002]],
  [-0.80, 1.710, 2.54, [0.86, 1.75, 1.09, 1.86, 0.92, 2.14, 0.67, 2.41, 0.42, 2.52], [0.003, 0.049, 0.005, 0.015, 0.014, 0.012]],
  [-0.65, 1.680, 2.54, [0.90, 1.71, 1.15, 1.83, 1.01, 2.13, 0.79, 2.40, 0.57, 2.52], [0, 0.031, 0.008, 0.008, 0.015, 0.014]],
  [-0.50, 1.633, 2.54, [0.62, 1.65, 1.18, 1.80, 1.00, 2.10, 0.83, 2.40, 0.58, 2.52], [0.006, 0.01, 0.021, -0.018, 0.055, 0.013]],
  [-0.25, 1.633, 2.54, [0.90, 1.64, 1.21, 1.80, 1.04, 2.10, 0.80, 2.40, 0.67, 2.52], [0.004, 0.026, 0.019, 0.005, -0.003, -0.007]],
  [0.00, 1.633, 2.54, [1.08, 1.64, 1.22, 1.80, 1.06, 2.10, 0.84, 2.40, 0.70, 2.52], [0.004, 0.042, 0.015, 0.005, -0.003, 0.014]],
  [0.30, 1.633, 2.54, [1.21, 1.64, 1.21, 1.80, 1.07, 2.10, 0.85, 2.40, 0.72, 2.52], [0.004, 0.014, 0.013, 0.006, 0.045, 0.014]],
  [0.60, 1.633, 2.54, [1.24, 1.64, 1.20, 1.80, 1.07, 2.10, 0.85, 2.40, 0.67, 2.52], [0.004, 0, 0.009, 0.008, 0.05, 0.011]],
  [0.85, 1.633, 2.52, [1.21, 1.64, 1.16, 1.79, 1.03, 2.09, 0.79, 2.38, 0.52, 2.50], [0.004, 0, 0.008, 0.02, 0.015, 0.01]],
  [1.05, 1.633, 2.50, [1.15, 1.64, 1.10, 1.79, 0.97, 2.08, 0.70, 2.36, 0.37, 2.48], [0.004, 0, 0.009, 0.025, 0.022, 0]],
  [1.25, 1.633, 2.44, [1.04, 1.64, 0.99, 1.78, 0.87, 2.05, 0.62, 2.31, 0.35, 2.42], [0.004, 0, 0.009, 0.02, 0.017, 0.007]],
  [1.40, 1.633, 2.37, [0.93, 1.64, 0.88, 1.77, 0.76, 2.02, 0.54, 2.25, 0.29, 2.35], [0.004, -0.002, 0.008, 0.019, 0.006, 0.008]],
  [1.52, 1.633, 2.28, [0.81, 1.64, 0.77, 1.75, 0.65, 1.97, 0.43, 2.18, 0.26, 2.26], [0.004, 0, 0.008, 0.015, 0.017, 0.011]],
  [1.62, 1.633, 2.22, [0.67, 1.64, 0.63, 1.74, 0.50, 1.94, 0.37, 2.13, 0.20, 2.20], [0.004, 0, 0.014, -0.014, 0.018, 0]],
  [1.72, 1.633, 2.13, [0.49, 1.64, 0.44, 1.72, 0.39, 1.89, 0.34, 2.05, 0.16, 2.11], [0.004, 0, -0.002, 0, 0.019, 0]],
  [1.80, 1.633, 2.01, [0.22, 1.66, 0.34, 1.82, 0.31, 1.91, 0.22, 1.96, 0.10, 1.99], [0.014, 0.005, 0.01, 0.007, -0.004, -0.005]],
  [1.86, 1.770, 1.86, [0.10, 1.79, 0.18, 1.80, 0.15, 1.83, 0.08, 1.85, 0.03, 1.86], [0.002, 0.002, 0.011, -0.003, -0.005, 0]],
];

/** The M48 marks drawn on these castings (release 266; the owner, 2026-10-28: "add the israeli m48 variant to israel and
 * add a new m48 variant for the usa since its a really great modeel", then "also add the m48 super to germany as well as
 * the kpfz m48 a2 g a2"). The hull and the dome are the A5's measured castings; a mark changes only what it carried
 * (docs/references/tanks/<id>.md). The A5's own spec reproduces its release-262 build exactly. */
export type M48Mark = 'm48a5' | 'm48a3' | 'magach3' | 'm48a2ga2' | 'm48super';
interface M48Variant {
  readonly mark: M48Mark;
  /** The A5's 105 mm M68 (eccentric evacuator), the L7A3 in its thermal sleeve (concentric fume extractor), the 90 mm M41
   * with its cylindrical blast deflector. */
  readonly gun: 'm68' | 'l7a3' | 'm41';
  /** The commander's cupola: the A5's low cupola with its M60D (the Magach's Urdan is its twin), the M1 on its
   * vision-block riser, the GA2's low cast collar with the Leopard hatch and the MG3 on its ring. */
  readonly cupola: 'a5' | 'm1' | 'ga2';
  /** Running gear: the A5 model's (five return rollers), the early hull's (five and the track-tension wheel), the A2
   * hull's three. */
  readonly gear: 'a5' | 'a1' | 'a2';
  /** The AVDS-1790's air cleaners on the rear fenders (the diesel marks). */
  readonly airCleaners: boolean;
}
const M48_VARIANTS: Readonly<Record<M48Mark, M48Variant>> = Object.freeze({
  m48a5: { mark: 'm48a5', gun: 'm68', cupola: 'a5', gear: 'a5', airCleaners: true },
  m48a3: { mark: 'm48a3', gun: 'm41', cupola: 'm1', gear: 'a5', airCleaners: true },
  magach3: { mark: 'magach3', gun: 'm68', cupola: 'a5', gear: 'a1', airCleaners: true },
  m48a2ga2: { mark: 'm48a2ga2', gun: 'l7a3', cupola: 'ga2', gear: 'a2', airCleaners: false },
  m48super: { mark: 'm48super', gun: 'l7a3', cupola: 'ga2', gear: 'a2', airCleaners: false },
});

const M48_GEAR: GearSpec = {
  wheelR: 0.33, wheelY: 0.41, span: [2.049, -1.959], rollerN: 5, rollerY: 1.123, rollerR: 0.18,
  // the torsion bars stagger the sides: the -x side's stations run 10 cm behind the +x side's; the return rollers (one
  // station list for both sides) sit between the two
  wheelZs: [-1.959, -1.085, -0.309, 0.469, 1.262, 2.049],
  wheelZsBySide: [[-2.060, -1.186, -0.411, 0.368, 1.161, 1.948], [-1.959, -1.085, -0.309, 0.469, 1.262, 2.049]],
  rollerZs: [-1.723, -0.844, -0.065, 0.715, 1.492],
  idler: { z: 2.826, y: 0.883, r: 0.328 }, sprocket: { z: -2.884, y: 1.014, r: 0.348 },
  contactZF: 2.20, contactZR: -2.12, botY: 0.045,
};
/** The other hulls' running gear on the same stations: the Magach 3's early hull keeps the small track-tension wheel
 * behind the last road wheel (the Sultan Yacoub tank; the Latrun M48A3 has none, as the A5); the A2 hull carries three
 * return rollers (the GA2's photographs). */
function m48Gear(V: M48Variant): GearSpec {
  // (its centre 0.18 m inside the run's inner face, the common tangent below the last road wheel and the sprocket)
  if (V.gear === 'a1') return { ...M48_GEAR, tension: { z: -2.60, y: 0.61, r: 0.18 }, tensionInside: true };
  // (2.5 cm higher than the A5's five: a 1.66 m span hangs its full 6.5 cm, and the run's inner edge kept 2 cm over the
  // hull's lower chamfer; raised it keeps 4.6 cm there and 4.5 cm under the fender boxes)
  if (V.gear === 'a2') return { ...M48_GEAR, rollerN: 3, rollerY: M48_GEAR.rollerY + 0.025, rollerZs: [-1.723, -0.065, 1.492] };
  return M48_GEAR;
}
// the model's track centres (1.6 cm a side over the published 115 in) and the 28 in track: the gate measures this hull
// against the certified model's own envelope
const M48_XC = 1.4765, M48_TRACK_W = 0.711;

function* m48HullSteps(P: CastPort, V: M48Variant): Generator<string, HullFrame> {
  const { box, cylX, cylY, cylZ, sph } = KIT;
  const seat = landmarkSeat(M48_HULL, M48_HULL_RULE);
  const deckAt = (z: number): number => seat.topAt(0, z);
  const deckY = (x: number, z: number): number => seat.topAt(x, z);
  P.add('hull', landmarkLoft(M48_HULL, M48_HULL_RULE, P.q));
  // the raised turret-race collar on the deck, its top the turret's seat
  P.add('hull', cylY(1.242, 1.25, 0.13, P.q ? 40 : 20), 0, M48_RING.y - 0.065, M48_RING.z);
  yield 'm48HullCasting';
  // fenders: the flat plate at 1.49-1.51 from the rear downturn to the front one, its outer lip, the inner skirt plates
  // ahead of the bow that hang to the idlers, the cross brace over each idler
  for (const side of [-1, 1]) {
    const [a, b] = side > 0 ? [1.00, 1.815] : [-1.815, -1.00];
    P.add('hull', fenderRun(a, b, [[-3.37, 1.25], [-3.30, 1.32], [-3.20, 1.43], [-3.10, 1.51], [-2.50, 1.525],
      [-1.00, 1.50], [1.00, 1.49], [3.20, 1.49], [3.30, 1.415], [3.40, 1.325], [3.50, 1.27], [3.55, 1.25]], 0.03));
    P.add('hullDetail', box(0.02, 0.04, 6.30), side * 1.805, 1.455, -0.05);
    const [s0, s1] = side > 0 ? [1.00, 1.022] : [-1.022, -1.00];
    P.add('hull', skirtRun(s0, s1, [[1.80, 1.352, 1.47], [2.20, 1.330, 1.47], [2.60, 1.266, 1.47], [2.80, 1.217, 1.47],
      [3.00, 1.087, 1.47], [3.10, 1.038, 1.47], [3.20, 1.066, 1.47], [3.30, 1.093, 1.40], [3.40, 1.121, 1.31]]));
    P.add('hullDetail', box(0.78, 0.18, 0.02), side * 1.41, 1.37, 2.80);
  }
  yield 'm48HullFenders';
  // fender stowage: the long low boxes from the turret forward, the rear boxes over the sprockets, the round lid on the
  // left front fender, the bar across the right front fender, the box latches
  for (const side of [-1, 1]) {
    // (3.5 cm lower than the model's so the gun shield's foot keeps its 2.6 cm over them abeam at -9 deg)
    P.add('hullDetail', moldedBox(0.38, 0.155, 2.00, 0.02, P.q ? 2 : 1, 0.01), side * 1.46, 1.5625, 0.64);
    P.add('hullDetail', moldedBox(0.49, 0.20, 0.77, 0.02, P.q ? 2 : 1, 0.01), side * 1.405, 1.58, -1.93);
    for (const x of [1.24, 1.46]) P.add('hullDark', box(0.06, 0.13, 0.10), side * x, 1.62, -0.42);
    P.add('hullDetail', box(0.10, 0.17, 0.18), side * 1.04, 1.59, -2.57);
    // the AVDS-1790's air cleaners: the tall boxes ahead of the rear bins, their tops chamfered down at the front
    if (V.airCleaners) {
      const [c0, c1] = side > 0 ? [1.16, 1.595] : [-1.595, -1.16];
      P.add('hullDetail', skirtRun(c0, c1, [[-1.54, 1.495, 1.795], [-0.98, 1.495, 1.80], [-0.63, 1.495, 1.77], [-0.56, 1.495, 1.67]]));
      P.add('hullDark', box(0.36, 0.02, 0.30), side * 1.395, 1.805, -1.25);
    } else {
      // the petrol AV-1790's deck: a low bin where the diesel's cleaners stand
      P.add('hullDetail', moldedBox(0.42, 0.16, 0.95, 0.02, P.q ? 2 : 1, 0.01), side * 1.38, 1.575, -1.05);
    }
  }
  // (the A5 model's drum on the left front fender and its tow cable along the left bins are that tank's own load: the
  // other marks' photographs show neither)
  if (V.mark === 'm48a5') P.add('hullDetail', box(0.59, 0.035, 0.56), 1.33, 1.53, 2.01);
  if (V.mark === 'm48a5') P.add('hullDetail', cylY(0.30, 0.31, 0.15, P.q ? 28 : 14), 1.33, 1.62, 2.01);
  if (V.mark === 'm48a5') P.add('hullDark', cylY(0.20, 0.20, 0.02, P.q ? 24 : 12), 1.33, 1.70, 2.01);
  P.add('hullDetail', box(0.61, 0.065, 0.06), -1.58, 1.58, 1.725);
  // the tow cable laid along the left fender boxes
  if (V.mark === 'm48a5') bar(P, 'hullDark', [1.66, 1.685, -2.94], [1.66, 1.685, 2.01], 0.045);
  P.add('hullDetail', box(0.78, 0.17, 0.02), -1.41, 1.57, 1.655);
  yield 'm48HullBins';
  // bow: the driver's hatch and its three periscopes, the headlight groups on the glacis with their guards, the bow's
  // towing eyes on the cast corners
  P.add('hullDetail', box(0.90, 0.025, 0.42), 0, deckAt(2.12) + 0.01, 2.12);
  P.add('hull', cylY(0.165, 0.17, 0.06, P.q ? 22 : 12), 0, deckAt(2.25) + 0.05, 2.25);
  for (const dx of [-0.11, 0, 0.11]) KIT.periscope(P, 'hullDetail', dx, deckY(dx, 2.455) - 0.01, 2.455, 0);
  P.add('hullDark', box(0.08, 0.12, 0.06), -0.30, deckY(-0.30, 2.525) + 0.06, 2.525);
  for (const side of [-1, 1]) {
    const lights = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.14, r: 0.058, rake: -0.12,
      seed: side > 0 ? 481 : 483, nightKind: 'headlight' });
    lights.position.set(side * 0.71, 1.42, 2.95);
    P.hullG.add(lights);
    P.add('hullDetail', box(0.20, 0.10, 0.28), side * 0.77, deckY(0.77, 2.57) + 0.03, 2.57);
    // (the Magach's Blazer slabs run between the lights where the guards stood)
    if (V.mark !== 'magach3') P.add('hullDark', box(0.42, 0.03, 0.05), side * 0.665, 1.50, 3.02);
    if (V.mark !== 'magach3') for (const x of [0.47, 0.86]) P.add('hullDark', box(0.03, 0.31, 0.05), side * x, 1.345, 3.02);
    KIT.liftEye(P, 'hullDetail', side * 0.83, 0.86, 3.24, Math.PI / 2);
    // its bracket plate back into the nose (in plan the ring alone left a pocket against the casting's edge)
    P.add('hullDetail', box(0.16, 0.06, 0.12), side * 0.80, 0.86, 3.17);
    // the towing shackle hanging in the eye
    P.add('hullDark', KIT.xform(KIT.torus(0.055, 0.016, P.q ? 14 : 8), 0, 0, 0, 0, Math.PI / 2, 0, [1, 1.3, 1]), side * 0.83, 0.79, 3.27);
  }
  yield 'm48HullBow';
  // engine deck: the hinge pairs along the seams of the centre doors and the side grille doors, the rear access plate
  for (const side of [-1, 1]) {
    for (const [x, z] of [[0.47, -0.84], [0.48, -1.03], [0.55, -1.22], [0.66, -1.47], [0.81, -1.80], [0.93, -2.24]] as const) {
      P.add('hullDark', box(0.08, 0.03, 0.10), side * x, deckY(x, z) + 0.012, z);
    }
    for (const [x, z] of [[0.54, -1.40], [0.66, -1.67], [0.77, -1.93], [0.86, -2.03]] as const) {
      P.add('hullDetail', box(0.05, 0.025, 0.09), side * x, deckY(x, z) + 0.03, z);
    }
  }
  P.add('hullDetail', box(0.34, 0.05, 0.48), 0, deckAt(-2.99) + 0.02, -2.99);
  yield 'm48HullDeck';
  // rear: the louvred grille doors filling the rear plate, the tail-light groups and their guards at its corners, the
  // final drives, the rear plate's brackets, the towing pintle and the hooks
  const rearZ = -3.05;
  P.add('hull', box(1.78, 0.66, 0.08), 0, 1.47, rearZ - 0.04);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) P.add('hullDark', box(0.78, 0.022, 0.03), side * 0.43, 1.18 + i * 0.068, rearZ - 0.085);
    P.add('hullDetail', box(0.05, 0.64, 0.04), side * 0.86, 1.47, rearZ - 0.09);
    P.add('hullDetail', box(0.26, 0.62, 0.05), side * 0.89, 1.19, rearZ - 0.10);
    for (const y of [1.315, 1.585]) KIT.headlight(P, side * 0.925, y, rearZ - 0.03, Math.PI, 0.04, false);
    P.add('hullRunningGearDetail', cylX(0.27, 0.22, P.q ? 20 : 12), side * 1.00, 1.014, -2.78);
    P.add('hullDetail', box(0.35, 0.27, 0.20), side * 0.375, 0.925, -2.99);
    KIT.liftEye(P, 'hullDetail', side * 0.49, 0.66, -2.96, Math.PI / 2);
  }
  P.add('hullDark', box(0.03, 0.66, 0.05), 0, 1.47, rearZ - 0.09);
  P.add('hullDetail', moldedBox(0.62, 0.32, 0.14, 0.015, P.q ? 2 : 1, 0.008), -0.11, 1.67, -3.18);
  P.add('hullDetail', box(0.34, 0.27, 0.24), 0, 0.79, -2.96);
  P.add('hullDark', cylZ(0.05, 0.20, P.q ? 12 : 8), 0, 0.76, -3.17);
  P.add('hullDark', KIT.xform(KIT.torus(0.06, 0.018, P.q ? 14 : 8), 0, 0, 0, Math.PI / 2, 0, 0), 0, 0.76, -3.28);
  yield 'm48HullRear';
  // running gear at the model's stations: six road wheels (the rearmost pitched long), five large return rollers, the
  // idler on its arm, no tension wheel; shock absorbers at the first two and last stations, bump stops at every arm
  const gear = m48Gear(V);
  pattonGear(P, M48_XC, M48_TRACK_W, gear);
  for (const side of [-1, 1]) {
    for (const z of M48_GEAR.wheelZsBySide?.[side < 0 ? 0 : 1] ?? []) {
      P.add('hullRunningGearDark', box(0.16, 0.21, 0.16), side * 1.14, 0.73, z);
      // the road-wheel arm's housing under the hull's edge, 0.40 m ahead of its wheel, on a flange into the belly
      P.add('hullRunningGearDetail', cylX(0.09, 0.22, P.q ? 16 : 10), side * 0.99, 0.46, z + 0.40);
      P.add('hullRunningGearDetail', box(0.16, 0.14, 0.18), side * 0.97, 0.58, z + 0.40);
    }
    for (const [z, dz] of [[2.05, 1], [1.26, 1], [-1.96, -1]] as const) {
      bar(P, 'hullRunningGearDetail', [side * 1.36, 0.88, z + dz * 0.20], [side * 1.38, 1.10, z + dz * 0.42], 0.045);
    }
    P.add('hullRunningGearDetail', box(0.17, 0.44, 0.21), side * 1.22, 0.90, 2.93);
    P.add('hullRunningGearDetail', box(0.21, 0.23, 0.33), side * 1.13, 0.75, 2.02);
  }
  for (const [fz, fy0, fy1] of [[3.50, 1.00, 1.25], [-3.36, 1.19, 1.31]] as const) {
    for (const side of [-1, 1]) {
      MUDGUARDS.add(P, {
        label: `patton-cast-${fz < 0 ? 'rear' : 'front'}-flap-${side}`, x: side * M48_XC, y: (fy0 + fy1) / 2, z: fz,
        thickness: 0.03, length: M48_TRACK_W * 0.92, height: fy1 - fy0, material: 'rubber', rotation: [0, Math.PI / 2, 0],
        crown: 0.012, frontCut: 0.025, rearCut: 0.018,
      });
    }
  }
  yield 'm48HullGear';
  if (V.mark === 'm48super') { m48SuperSkirts(P); yield 'm48HullSkirts'; }
  if (V.mark === 'magach3') { magachGlacisEra(P, deckY); yield 'm48HullEra'; }
  void sph;
  return { xc: M48_XC, trackW: M48_TRACK_W, deckAt };
}

/** The bustle rack: a band round the dome's tail at its floor, posts and three rails (world). The dome outline at y is
 * found along rays from (0, zc), so the rack follows the casting. */
function bustleRing(P: CastPort, T: TurretFrame, seat: CastSeat, a0: number, a1: number, zc: number, y: number,
  rails: readonly number[], out: number, mesh = 0): void {
  const { box } = KIT;
  const L = tl(T);
  const n = P.q ? 14 : 8;
  const outline: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n), dx = Math.sin(a), dz = Math.cos(a);
    let lo = 0, hi = 2.6;
    for (let k = 0; k < 24; k++) {
      const r = (lo + hi) / 2, x = dx * r, z = zc + dz * r;
      if (z > -1.51 && Math.abs(x) <= seat.sideAt(y, z)) lo = r; else hi = r;
    }
    outline.push([dx * (lo + out), zc + dz * (lo + out)]);
  }
  const top = rails[rails.length - 1];
  for (let i = 0; i < n; i++) {
    const [x0, z0] = outline[i], [x1, z1] = outline[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(x1 - x0, z1 - z0);
    P.add('turretDetail', box(0.30, 0.025, len + 0.01), (x0 + x1) / 2, L.y(y - 0.02), L.z((z0 + z1) / 2), 0, ry, 0);
    for (const ry0 of rails) P.add('turretDetail', box(0.028, 0.028, len + 0.02), (x0 + x1) / 2, L.y(ry0), L.z((z0 + z1) / 2), 0, ry, 0);
  }
  outline.forEach(([x, z], i) => {
    if (i % 2) return;
    P.add('turretDetail', box(0.03, top - y + 0.02, 0.03), x, L.y((top + y) / 2), L.z(z));
  });
  // (the IDF basket's mesh: wires every `mesh` metres along each panel)
  if (mesh > 0) {
    for (let i = 0; i < n; i++) {
      const [x0, z0] = outline[i], [x1, z1] = outline[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0), m = Math.max(1, Math.round(len / mesh));
      for (let k = 1; k < m; k++) {
        const t = k / m;
        P.add('turretOpenLattice', box(0.012, top - y, 0.012), x0 + (x1 - x0) * t, L.y((top + y) / 2), L.z(z0 + (z1 - z0) * t));
      }
    }
  }
}

function* m48TurretSteps(P: CastPort, V: M48Variant): TankProfileBuild {
  const { box, cylY, cylZ, sph, xform } = KIT;
  const seat = landmarkSeat(M48_DOME, M48_DOME_RULE);
  const T: TurretFrame = { ringY: M48_RING.y, ringZ: M48_RING.z, stations: [], seat };
  const L = tl(T);
  P.turretG.position.set(0, T.ringY, T.ringZ);
  P.add('turret', landmarkLoft(M48_DOME, M48_DOME_RULE, P.q, T.ringZ, T.ringY));
  P.add('turretDark', cylY(1.05, 1.05, 0.70, P.q ? 24 : 12), 0, L.y(1.27), 0);
  yield 'm48TurretCasting';
  // roof: the commander's cupola on the right (the A5's low cupola and its M60D on the rim's pintle), the loader's hatch
  // on the left (on the A5 with his M60D), the gunner's sight hood ahead of the cupola, the M17 rangefinder's armoured
  // ends, the front lifting eye on the centre line
  if (V.cupola === 'a5') m48A5Cupola(P, T);
  else if (V.cupola === 'm1') m48M1Cupola(P, T);
  // (the Super's drum stands taller, clear of its armour's shelf)
  else m48Ga2Cupola(P, T, V.mark === 'm48super' ? 0.34 : 0.22);
  m48LoaderHatch(P, T);
  if (V.cupola !== 'ga2') m48LoaderM60(P, T, seat);
  m48SightHood(P, T, seat);
  // (the M48 Super ranges by laser and its armour, like the Magach's Blazer, covers the rangefinder's ends)
  if (V.mark !== 'm48super' && V.mark !== 'magach3') m48RangefinderEnds(P, T, seat);
  m48LiftEyes(P, T, seat);
  yield 'm48TurretRoof';
  if (V.mark === 'm48a5') m48A5Bustle(P, T, seat);
  else m48MarkBustle(P, T, seat, V);
  yield 'm48TurretBustle';
  if (V.mark === 'm48a5') m48A5Fittings(P, T, seat);
  else yield* m48MarkFittings(P, T, seat, V);
  yield 'm48TurretFittings';
  // gun: the trunnion on the model's bore axis; the sloped cast mantlet (its face leans back 25 deg), the gun's root
  // boss and bolted plate, the coax and telescope ports, the AN/VSS-1 searchlight on its posts and side rails
  P.gunG.position.set(0, M48_TRUNNION.y - T.ringY, M48_TRUNNION.z - T.ringZ);
  // (the GA2's own shield replaces the A5's)
  if (V.mark !== 'm48a2ga2') P.addGunExtra(m48Mantlet(P.q), 0, 0, GUN_Z0);
  // the boss ring on the shield's face round the bore, the gun's root sleeve through it, the coax and sight ports
  P.addGunExtra(cylZ(0.20, 0.08, P.q ? 24 : 12), 0, 0, GUN_Z0 + 0.33);
  P.addGunExtra(cylZ(0.13, 0.27, P.q ? 20 : 12), 0, 0, GUN_Z0 + 0.42);
  // (the AN/VSS-1 rides the A5 and the A3; the Magach 3's armour, the GA2's own light and the Super's thermal sight replace
  // it)
  const vss1 = V.mark === 'm48a5' || V.mark === 'm48a3';
  for (const side of [-1, 1]) {
    P.addGunExtraDark(cylZ(side > 0 ? 0.045 : 0.065, 0.06, P.q ? 12 : 8), side * 0.31, 0.11, GUN_Z0 + 0.26);
    if (vss1) P.addGunExtra(box(0.045, 0.37, 0.09), side * 0.247, 0.39, GUN_Z0 + 0.425);
    P.addGunExtra(box(0.05, 0.10, 0.26), side * 0.307, 0.32, GUN_Z0 + 0.25);
    if (vss1) P.addGunExtra(box(0.06, 0.05, 0.36), side * 0.305, 0.42, GUN_Z0 + 0.687);
  }
  if (vss1) {
    P.addGunExtra(moldedBox(0.58, 0.44, 0.63, 0.07, P.q ? 2 : 1, 0.03), 0, 0.39, GUN_Z0 + 0.621);
    if (V.mark === 'm48a3') {
      // the A3's light under its canvas cover (the Vietnam photographs), its drawstring band; the cast shield left bare
      // like the Kubinka tank's
      P.add('gunMountCloth', moldedBox(0.64, 0.50, 0.36, 0.09, P.q ? 3 : 2, 0.03), 0, 0.39, GUN_Z0 + 0.79);
      P.add('gunMountCloth', moldedBox(0.66, 0.52, 0.05, 0.04, 1, 0.01), 0, 0.39, GUN_Z0 + 0.63);
    } else {
      P.addGunExtraDark(box(0.46, 0.32, 0.02), 0, 0.39, GUN_Z0 + 0.935);
      P.addGunExtra(xform(sph(0.10, P.q ? 18 : 10, P.q ? 12 : 6), 0, 0, 0, 0, 0, 0, [1, 1, 0.45]), 0, 0.41, GUN_Z0 + 0.89);
    }
    P.addGunExtraDark(xform(KIT.torus(0.065, 0.012, P.q ? 14 : 8), 0, 0, 0, 0, Math.PI / 2, 0), 0, 0.43, GUN_Z0 + 0.40);
  } else if (V.mark === 'm48a2ga2') {
    // the GA2's larger cast gun shield (Tank Encyclopedia; the Munster and Dresden tanks): a squared block ahead of the
    // turret's nose, the gun through its collar high in its face; the square IR/white-light searchlight on its bracket
    // over the block's top left, its cover closed
    P.addGunExtra(ga2Mantlet(P.q), 0, 0, 0);
    // the gun's collar on the block's face and its rubber boot, the coax's and the sight's ports
    P.addGunExtra(cylZ(0.20, 0.10, P.q ? 24 : 12), 0, 0, 0.67);
    P.addGunExtraDark(cylZ(0.15, 0.10, P.q ? 20 : 12, 0.17), 0, 0, 0.76);
    for (const side of [-1, 1]) P.addGunExtraDark(cylZ(side > 0 ? 0.045 : 0.06, 0.03, P.q ? 12 : 8), side * 0.38, 0.12, 0.64);
    P.addGunExtra(box(0.12, 0.10, 0.22), 0.32, 0.51, 0.40);
    P.addGunExtra(moldedBox(0.56, 0.50, 0.52, 0.05, P.q ? 2 : 1, 0.02), 0.32, 0.81, 0.40);
    P.addGunExtraDark(box(0.52, 0.46, 0.012), 0.32, 0.81, 0.665);
    P.addGunExtra(moldedBox(0.48, 0.42, 0.04, 0.02, 1, 0.01), 0.32, 0.81, 0.675);
    for (const side of [-1, 1]) {
      for (const dy of [-0.14, 0, 0.14]) P.addGunExtra(box(0.025, 0.03, 0.44), 0.32 + side * 0.29, 0.81 + dy, 0.40);
    }
  } else if (V.mark === 'm48super') {
    // the Super's flat armour plate over the mantlet, as tall as the turret armour and level with the cheeks' fronts (War
    // Thunder's model): the gun through its collar low in the middle, two small ports above it on the left
    P.addGunExtra(box(1.06, 0.92, 0.20), 0, 0.24, 0.18);
    P.addGunExtra(cylZ(0.18, 0.10, P.q ? 24 : 12), 0, 0, 0.33);
    // the sight's window over the gun on the left, in its raised frame
    P.addGunExtra(box(0.34, 0.18, 0.04), 0.29, 0.44, 0.30);
    P.addGunExtraDark(box(0.25, 0.10, 0.012), 0.29, 0.44, 0.322);
  } else if (V.mark === 'magach3') {
    // the Magach's mantlet under its Blazer (the Sultan Yacoub tank): the canvas boot round the gun's root, two flat
    // boxes either side of the barrel at its height, their faces raked back, and a brow of four lying over the mantlet's
    // top like a roof sloping forward 30 degrees, flush with the cheeks' wall
    // (the boot painted over in the tank's sand like the rest of its canvas)
    // (its rear no wider than 0.19 m: the hull's ring face lies 0.29 m under the bore)
    P.addGunExtra(cylZ(0.15, 0.32, P.q ? 20 : 12, 0.19), 0, 0, 0.22);
    for (const [z, r] of [[0.10, 0.18], [0.17, 0.17], [0.24, 0.16], [0.31, 0.15]] as const) {
      P.addGunExtra(xform(KIT.torus(r, 0.022, P.q ? 20 : 12), 0, 0, 0, Math.PI / 2, 0, 0), 0, 0, z);
    }
    for (const side of [-1, 1]) {
      for (const x of [0.30, 0.47]) P.addGunExtra(xform(box(0.16, 0.30, 0.12), 0, 0, 0, -0.30, 0, 0), side * x, 0.02, 0.18);
    }
    for (const x of [-0.39, -0.13, 0.13, 0.39]) {
      P.addGunExtra(xform(box(0.25, 0.08, 0.42), 0, 0, 0, 0.52, 0, 0), x, 0.40, 0.10);
    }
  }
  if (V.gun === 'm68') m48Gun(P);
  else if (V.gun === 'l7a3') m48SleevedL7(P);
  else m48M41(P);
  P.topY = L.y(3.06) + 0.12;
  yield 'm48Gun';
}

/** The A5's commander's station: the low cupola, its domed hatch and hinge, the M60D on the rim's pintle (world). */
function m48A5Cupola(P: CastPort, T: TurretFrame): void {
  const { box, cylY, sph, xform } = KIT;
  const L = tl(T);
  const cupTop = visionCupola(P, T, -0.557, 0.05, 0.45, 0.20, 8);
  P.add('turret', xform(sph(0.24, P.q ? 18 : 10, P.q ? 10 : 5), 0, 0, 0, 0, 0, 0, [1, 0.42, 1]), -0.557, L.y(cupTop - 0.01), L.z(0.05));
  P.add('turretDark', box(0.43, 0.025, 0.13), -0.56, L.y(cupTop + 0.03), L.z(-0.16));
  // the M60Ds ride pintle posts (no ring): the commander's on the cupola rim, the loader's on a post from the roof
  // (the model's guns span z -0.22 to 1.11 with their bores at 3.056 and 2.92), each with its ammunition box outboard;
  // drawn at the M60D's 1.10 m on the model's bores
  // the commander's pintle post up the cupola's flank to the gun's yoke
  P.add('turretDark', cylY(0.03, 0.035, 2.815 - (cupTop - 0.20), 10), -1.00, L.y((2.815 + cupTop - 0.20) / 2), L.z(0.24));
  roofM2(P, T, -1.00, 0.24, 2.805, { cls: 'mag', barrel: 0.72, scale: 1.15, seed: 485, ring: false, elev: 0, ammo: false });
  m60dGrips(P, L, -1.00, -0.095, 3.055);
  m60dSight(P, L, -1.00, -0.095, 3.056);
  P.add('turretDetail', box(0.09, 0.17, 0.27), -0.817, L.y(2.983), L.z(0.239), 0, Math.PI / 2, 0);
}

/** The loader's hatch on the left and its two bars. */
function m48LoaderHatch(P: CastPort, T: TurretFrame): void {
  const { box } = KIT;
  const L = tl(T);
  const hatchTop = loaderHatch(P, T, 0.33, -0.28, 0.27);
  for (const x of [0.245, 0.417]) P.add('turretDark', box(0.05, 0.05, 0.31), x, L.y(hatchTop - 0.01), L.z(-0.28));
}

/** The loader's M60D on its post. */
function m48LoaderM60(P: CastPort, T: TurretFrame, seat: CastSeat): void {
  const { box, cylY } = KIT;
  const L = tl(T);
  {
    // the loader's post on its base plate up to the gun's yoke
    const roof = seat.topAt(0.60, 0.23);
    P.add('turretDark', box(0.106, 0.04, 0.115), 0.60, L.y(roof + 0.01), L.z(0.23));
    P.add('turretDark', cylY(0.035, 0.045, 2.68 - roof, 10), 0.60, L.y((2.68 + roof) / 2), L.z(0.23));
    roofM2(P, T, 0.60, 0.23, 2.67, { cls: 'mag', barrel: 0.72, scale: 1.15, seed: 486, ring: false, elev: 0, ammo: false, station: 'loader' });
    m60dGrips(P, L, 0.60, -0.109, 2.92);
    m60dSight(P, L, 0.60, -0.109, 2.92);
    P.add('turretDetail', box(0.09, 0.17, 0.27), 0.785, L.y(2.848), L.z(0.225), 0, Math.PI / 2, 0);
  }
}

/** The gunner's sight hood ahead of the cupola. */
function m48SightHood(P: CastPort, T: TurretFrame, seat: CastSeat): void {
  const { box } = KIT;
  const L = tl(T);
  {
    const y = seat.topAt(-0.563, 0.88);
    P.add('turret', box(0.41, 0.11, 0.22), -0.563, L.y(y + 0.04), L.z(0.88));
    P.add('turretGlass', box(0.34, 0.05, 0.012), -0.563, L.y(y + 0.06), L.z(0.995));
  }
}

/** The M17 rangefinder's armoured ends on the dome's flanks. */
function m48RangefinderEnds(P: CastPort, T: TurretFrame, seat: CastSeat): void {
  const { cylX, sph } = KIT;
  const L = tl(T);
  for (const side of [-1, 1]) {
    // the left end stands proud of the casting as the model draws it; the right one is half sunk under the cupola
    const x = side * (seat.sideAt(2.425, 0.37) + (side > 0 ? 0.0925 : -0.03));
    P.add('turret', sph(0.10, P.q ? 16 : 10, P.q ? 10 : 6), x, L.y(2.425), L.z(0.37));
    P.add('turretGlass', cylX(0.05, 0.012, P.q ? 12 : 8), x + side * 0.098, L.y(2.425), L.z(0.37));
  }
}

/** The roof's lifting eyes. */
function m48LiftEyes(P: CastPort, T: TurretFrame, seat: CastSeat): void {
  const { box } = KIT;
  const L = tl(T);
  { // the lifting eyes on their pads: the front one on the centre line, the rear one just left of it (the model's 2.64,
    // 2.69), behind the mission dock's seat on the roof
    for (const [x, z, pad] of [[0, 1.19, 0.08], [0.10, -1.08, 0.06]] as const) {
      const roof = seat.topAt(x, z);
      P.add('turretDetail', box(0.12, pad + 0.02, 0.16), x, L.y(roof + pad / 2), L.z(z));
      KIT.liftEye(P, 'turretDetail', x, L.y(roof + pad), L.z(z), Math.PI / 2);
    }
  }
}

/** The A5 model's bustle rack and load, its spare wheel, the ventilator, the flank fitting. */
function m48A5Bustle(P: CastPort, T: TurretFrame, seat: CastSeat): void {
  const { box, cylY, sph, xform } = KIT;
  const L = tl(T);
  // the bustle rack round the tail and its load: the drum on the right, bedroll and bags across the back, the
  // ventilator housing on the left rear roof, the jerrycan
  bustleRing(P, T, seat, Math.PI * 0.62, Math.PI * 1.42, -0.20, 1.99, [2.15, 2.29, 2.43], 0.02);
  { // the spare road wheel tipped up on the right rear (the model's drum is the tank's own wheel: 0.45 m wide, its axis
    // -0.77, 0.46, -0.44), drawn by the same nation construction and request as the running gear's wheels
    const wheelW = Math.min(0.26, M48_TRACK_W * 0.42);
    const spare = buildNationWheel('m60a3-cast-spoke', {
      radiusM: M48_GEAR.wheelR, tireWidthM: wheelW, high: Boolean(P.q), segments: P.q ? 28 : 12,
      maxWidthM: Math.max(wheelW * STANDARD_WHEEL_AXIAL_ENVELOPE, M48_TRACK_W * TRACK_WIDTH_WHEEL_CAP),
    });
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-0.768, 0.464, -0.441).normalize()));
    const at = (slot: string, g: Geo | null): void => { if (g) P.add(slot, g, -1.254, L.y(2.395), L.z(-1.18), e.x, e.y, e.z); };
    // its stub axle into the bustle's side
    const ax = new THREE.Vector3(-0.768, 0.464, -0.441).normalize();
    const axle = (d: number): number[] => [-1.254 - ax.x * d, L.y(2.395 - ax.y * d), L.z(-1.18 - ax.z * d)];
    bar(P, 'turretDark', axle(0), axle(0.40), 0.06);
    // its flange bolted to the casting
    bar(P, 'turretDark', axle(0.36), axle(0.40), 0.12, 12);
    at('turretDark', spare.tire);
    at('turretDetail', spare.disc);
    at('turretDark', spare.dark);
    for (const layer of spare.layers) {
      if (layer.side === -1) { layer.geometry.dispose(); continue; }
      at(layer.paint === 'dish' ? 'turretDetail' : 'turretDark', xform(layer.geometry, layer.outset ?? 0, 0, 0));
    }
  }
  KIT.tarpRoll(P, 'turretCloth', -0.064, L.y(2.34), L.z(-1.286), 0.99, 0.19, true, P.q ? 12 : 8);
  KIT.stowage(P, 'turretCloth', mulberry(488), [
    [0.278, L.y(2.23), L.z(-1.616), 0.50, 0.40, 0.31], [-0.148, L.y(2.235), L.z(-1.638), 0.45, 0.40, 0.29],
  ]);
  // the ventilator's drum and dome to the model's 2.57 m
  P.add('turret', cylY(0.265, 0.27, 0.24, P.q ? 22 : 12), 0.68, L.y(seat.topAt(0.68, -1.0) + 0.10), L.z(-1.0));
  P.add('turret', xform(sph(0.265, P.q ? 18 : 10, P.q ? 8 : 5), 0, 0, 0, 0, 0, 0, [1, 0.44, 1]), 0.68, L.y(seat.topAt(0.68, -1.0) + 0.22), L.z(-1.0));
  P.add('turretDetail', xform(box(0.165, 0.40, 0.26), 0, 0, 0, 0, 0.4, 0.47), 1.13, L.y(2.17), L.z(-0.68));
}

/** The A5 model's flank racks, rucksacks, handrails, helmets, whips and numbers. */
function m48A5Fittings(P: CastPort, T: TurretFrame, seat: CastSeat): void {
  const { box, sph, xform } = KIT;
  const L = tl(T);
  // the flank racks: two tiers of slim ammunition boxes hung against each side of the casting (the model's stations
  // differ a side), a rucksack hung over each rack, the handrails, two helmets on the left; whips, numbers
  for (const [side, zs] of [[1, [-0.34, -0.02, 0.40, 0.72]], [-1, [-0.20, 0.12, 0.50, 0.81]]] as const) {
    for (const y of [1.87, 2.05]) {
      for (const z of zs) {
        P.add('turretDetail', moldedBox(0.15, 0.20, 0.27, 0.012, P.q ? 2 : 1, 0.006), side * (seat.sideAt(y, z) + 0.07), L.y(y), L.z(z));
      }
    }
    for (const z of side > 0 ? [-0.19, 0.57] : [-0.05, 0.67]) {
      for (const y of [1.78, 2.0]) P.add('turretDetail', box(0.20, 0.16, 0.05), side * (seat.sideAt(y, z) + 0.09), L.y(y), L.z(z));
    }
  }
  // two rucksacks a side over the racks, standing out to the model's 1.50 m (left) and 1.60 m (right)
  KIT.stowage(P, 'turretCloth', mulberry(489), [
    [seat.sideAt(1.96, 0.30) + 0.183, L.y(1.96), L.z(0.30), 0.32, 0.28, 0.46],
    [seat.sideAt(1.95, -0.10) + 0.19, L.y(1.95), L.z(-0.10), 0.28, 0.28, 0.34],
    [-(seat.sideAt(2.02, 0.40) + 0.303), L.y(2.02), L.z(0.40), 0.34, 0.38, 0.50],
    [-(seat.sideAt(2.0, -0.12) + 0.24), L.y(2.0), L.z(-0.12), 0.30, 0.32, 0.40],
  ]);
  for (const side of [-1, 1]) {
    const rail: number[][] = [];
    for (let z = -0.5; z <= 1.36; z += 0.31) rail.push([side * (seat.sideAt(2.15, z) + 0.07), L.y(2.15), L.z(z)]);
    for (let i = 0; i + 1 < rail.length; i++) bar(P, 'turretDetail', rail[i], rail[i + 1], 0.016);
  }
  for (const [x, z] of [[1.315, -0.18], [1.11, -0.379]] as const) {
    P.add('turretDetail', xform(sph(0.11, P.q ? 14 : 8, P.q ? 8 : 5), 0, 0, 0, 0, 0, 0, [1, 0.75, 1]), x, L.y(2.10), L.z(z));
  }
  // the model's whips stand at (0.71, -0.48) and (-0.31, -1.03) to 3.727 m; each whip's own set bows its tip 2 cm out
  antennaWhips(P, T, [[0.698, -0.48], [-0.292, -1.03]], 1.21, 490, { top: 3.727, rake: 0 });
  bustleNumbers(P, T, -0.95, 0.40, 0.24);
}

/** The M1 cupola (the A3): the riser ring of vision blocks under it (the Vietnam fit, Wikipedia's G305), the squat cast
 * body with the sloped housing of its caliber .50 at the front and the gun port, the domed hatch, the M28 sight's head;
 * in Vietnam an M2 rode the hatch ring (the Vietnam and Latrun photographs). */
function m48M1Cupola(P: CastPort, T: TurretFrame): void {
  const { box, cylY, sph, xform } = KIT;
  const L = tl(T);
  const x = -0.557, z = 0.05, seg = P.q ? 26 : 14;
  const base = frameTop(T, x, z) - 0.03;
  P.add('turret', cylY(0.50, 0.53, 0.15, seg), x, L.y(base + 0.075), L.z(z));
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.35;
    P.add('turretGlass', box(0.09, 0.05, 0.012), x + Math.sin(a) * 0.507, L.y(base + 0.085), L.z(z + Math.cos(a) * 0.507), 0, a, 0);
  }
  const b0 = base + 0.15;
  P.add('turret', cylY(0.43, 0.48, 0.28, seg), x, L.y(b0 + 0.14), L.z(z));
  // the .50's housing: a sloped box ahead of the body, its port a dark slot
  P.add('turret', xform(moldedBox(0.40, 0.25, 0.36, 0.04, P.q ? 2 : 1, 0.02), 0, 0, 0, -0.32, 0, 0), x + 0.06, L.y(b0 + 0.15), L.z(z + 0.36));
  P.add('turretDark', box(0.06, 0.05, 0.03), x + 0.14, L.y(b0 + 0.18), L.z(z + 0.555), -0.32, 0, 0);
  for (let k = 0; k < 5; k++) {
    const a = Math.PI * (0.55 + k * 0.225);
    P.add('turretGlass', box(0.09, 0.045, 0.012), x + Math.sin(a) * 0.485, L.y(b0 + 0.13), L.z(z + Math.cos(a) * 0.485), 0, a, 0);
  }
  P.add('turret', cylY(0.40, 0.43, 0.05, seg), x, L.y(b0 + 0.305), L.z(z - 0.02));
  P.add('turret', xform(sph(0.38, P.q ? 18 : 10, P.q ? 8 : 5), 0, 0, 0, 0, 0, 0, [1, 0.09, 1]), x, L.y(b0 + 0.33), L.z(z - 0.02));
  P.add('turretDark', box(0.30, 0.03, 0.08), x, L.y(b0 + 0.30), L.z(z - 0.40));
  P.add('turret', box(0.13, 0.11, 0.16), x - 0.20, L.y(b0 + 0.33), L.z(z + 0.20));
  P.add('turretGlass', box(0.10, 0.04, 0.012), x - 0.20, L.y(b0 + 0.35), L.z(z + 0.285));
  roofM2(P, T, x + 0.04, z + 0.10, b0 + 0.36, { barrel: 0.82, seed: 492, ring: false, elev: 0.02 });
}

/** The GA2's commander's station (Tank Encyclopedia; the Munster tank): a low cast collar tapering to its rim with eight
 * periscopes under it, the Leopard 1's round hatch on its rear hinge, the MG3 on its mount on the rim's front with the
 * ammunition box beside it. */
function m48Ga2Cupola(P: CastPort, T: TurretFrame, h = 0.22): void {
  const { box, cylY, sph, xform } = KIT;
  const L = tl(T);
  const x = -0.557, z = 0.05, seg = P.q ? 26 : 14;
  const base = frameTop(T, x, z) - 0.03;
  P.add('turret', cylY(0.38, 0.45, h, seg), x, L.y(base + h / 2), L.z(z));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    P.add('turretDetail', box(0.12, 0.08, 0.07), x + Math.sin(a) * 0.40, L.y(base + h - 0.03), L.z(z + Math.cos(a) * 0.40), 0, a, 0);
    P.add('turretGlass', box(0.09, 0.04, 0.012), x + Math.sin(a) * 0.438, L.y(base + h - 0.03), L.z(z + Math.cos(a) * 0.438), 0, a, 0);
  }
  P.add('turret', xform(sph(0.34, P.q ? 18 : 10, P.q ? 8 : 5), 0, 0, 0, 0, 0, 0, [1, 0.16, 1]), x, L.y(base + h + 0.005), L.z(z));
  P.add('turretDark', box(0.28, 0.035, 0.07), x, L.y(base + h + 0.02), L.z(z - 0.36));
  // the MG3's cradle on the rim's front, the gun, its ammunition box on the right
  P.add('turretDark', box(0.10, 0.06, 0.12), x + 0.10, L.y(base + h + 0.03), L.z(z + 0.34));
  roofM2(P, T, x + 0.10, z + 0.36, base + h + 0.03, { cls: 'mag', barrel: 0.58, scale: 1.0, seed: 491, ring: false, elev: 0, ammo: false });
  P.add('turretDetail', box(0.10, 0.14, 0.22), x - 0.02, L.y(base + h + 0.10), L.z(z + 0.30));
}

/** A reactive box seated on a surface point (world): its back on the surface along the outward normal n, its long side
 * along `up` laid into the surface, `roll` turning it about that side (the shingled glacis courses); the cassette and its
 * inset lid, external armour of the open cluster. */
function eraBox(P: CastPort, owner: 'hull' | 'turret', c: THREE.Vector3, n: THREE.Vector3, up: THREE.Vector3, w: number,
  h: number, d: number, roll = 0, embed = 0.02): void {
  const nz = n.clone().normalize();
  const v = up.clone().addScaledVector(nz, -up.dot(nz)).normalize();
  if (roll) nz.applyAxisAngle(v, roll);
  const u = new THREE.Vector3().crossVectors(v, nz);
  const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, nz));
  const p = c.clone().addScaledVector(nz, d / 2 - embed);
  if (owner === 'turret') p.sub(new THREE.Vector3(0, M48_RING.y, M48_RING.z));
  P.addExternalArmor(owner, KIT.box(w, h, d), p.x, p.y, p.z, e.x, e.y, e.z);
  const lid = KIT.box(w * 0.82, h * 0.82, 0.014);
  lid.translate(0, 0, d / 2 + 0.004);
  P.addExternalArmor(owner, lid, p.x, p.y, p.z, e.x, e.y, e.z);
}

/** A point on the dome's flank (world) at height y and station z on one side, and its outward normal. */
function domeFlank(seat: CastSeat, side: number, y: number, z: number): [THREE.Vector3, THREE.Vector3] {
  const e = 0.01;
  const f = (yy: number, zz: number): number => side * seat.sideAt(yy, zz);
  const n = new THREE.Vector3(1, -(f(y + e, z) - f(y - e, z)) / (2 * e), -(f(y, z + e) - f(y, z - e)) / (2 * e));
  if (n.x * side < 0) n.negate();
  return [new THREE.Vector3(f(y, z), y, z), n.normalize()];
}

/** The station on the dome's front where its flank stands at |x| (height y): bisection over the nose. */
function domeFrontZ(seat: CastSeat, ax: number, y: number): number {
  let lo = 0.6, hi = 1.86;
  for (let k = 0; k < 30; k++) {
    const m = (lo + hi) / 2;
    if (seat.sideAt(y, m) > ax) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

/** The Magach 3's Blazer on the turret (the Sultan Yacoub tank, 1982: Latrun and Kubinka photographs): along each flank
 * eight tall boxes on brackets standing off the casting's widest bulge, their tops leaning out and each turned so its front
 * edge laps outboard of the next; on each cheek a stack of three rows of two boxes turned 40 degrees out from the bore; a
 * row lying along the roof's front edge. Each side one consumable cluster (the mantlet's own boxes ride the gun,
 * m48TurretSteps); the brackets stay on the casting. */
function magachTurretEra(P: CastPort, seat: CastSeat): void {
  const up = new THREE.Vector3(0, 1, 0);
  const at = (x: number, y: number, z: number): [number, number, number] => [x, y - M48_RING.y, z - M48_RING.z];
  // a flank tile: its own box with a gap to the next, its top a little lower than the one ahead, its rear edge turned out
  // 15 degrees (a sawtooth in plan)
  const flankBox = (side: number, z: number, k: number): void => {
    const y0 = 1.80, y1 = 2.44 - 0.03 * k;
    let ax = 0;
    for (let y = y0; y <= y1 + 1e-9; y += 0.032) ax = Math.max(ax, seat.sideAt(y, z));
    const [, n0] = domeFlank(seat, side, 1.95, z);
    const plan = new THREE.Vector3(n0.x, 0, n0.z).normalize().applyAxisAngle(up, side * 0.26);
    const n = plan.multiplyScalar(Math.cos(0.10)).add(new THREE.Vector3(0, -Math.sin(0.10), 0)).normalize();
    eraBox(P, 'turret', new THREE.Vector3(side * (ax + 0.08), (y0 + y1) / 2, z), n, up, 0.26, y1 - y0, 0.10, 0, 0);
  };
  // the short upper course laid on the shoulder over the flank tiles, each square to the casting
  const shoulderBox = (side: number, z: number): void => {
    const [c, n] = domeFlank(seat, side, 2.40, z);
    eraBox(P, 'turret', c, n, new THREE.Vector3(0, 0, 1), 0.28, 0.30, 0.08, 0, 0.03);
  };
  const brackets = (side: number, z: number): void => {
    for (const y of [1.92, 2.30]) {
      let ax = 0;
      for (let yy = 1.80; yy <= 2.44 + 1e-9; yy += 0.032) ax = Math.max(ax, seat.sideAt(yy, z));
      const sx = seat.sideAt(y, z) - 0.02, ex = ax + 0.07 + (y - 2.12) * 0.10;
      P.add('turretDetail', KIT.box(ex - sx, 0.04, 0.05), ...at(side * (sx + ex) / 2, y, z));
    }
  };
  // a course round the cheek at height y: boxes 0.30 m wide a centimetre apart along the casting's plan contour from the
  // mantlet's edge back into the flank row, each square to the contour and leaning back a little
  const cheekCourse = (side: number, y: number, count: number): void => {
    const pts: [number, number][] = [];
    for (let z = domeFrontZ(seat, 0.58, y); z >= 0.95; z -= 0.005) pts.push([seat.sideAt(y, z), z]);
    let run = 0, next = 0.16;
    for (let k = 1; k < pts.length && count > 0; k++) {
      const [x0, z0] = pts[k - 1], [x1, z1] = pts[k];
      run += Math.hypot(x1 - x0, z1 - z0);
      if (run < next) continue;
      const plan = new THREE.Vector3(side * (z0 - z1), 0, x1 - x0).normalize();
      if (plan.x * side < 0) plan.negate();
      plan.applyAxisAngle(up, -side * 0.44);
      const n = plan.multiplyScalar(Math.cos(0.12)).add(new THREE.Vector3(0, Math.sin(0.12), 0)).normalize();
      eraBox(P, 'turret', new THREE.Vector3(side * x1, y, z1), n, up, 0.30, 0.22, 0.12, 0, 0.04);
      next += 0.31; count--;
    }
  };
  const roofBox = (side: number, x: number): void => {
    let z = 1.60;
    while (z > 0.40 && seat.topAt(x, z) < 2.40) z -= 0.02;
    const e = 0.02, t = (xx: number, zz: number): number => seat.topAt(xx, zz);
    const n = new THREE.Vector3(-side * (t(x + e, z) - t(x - e, z)) / (2 * e), 1, -(t(x, z + e) - t(x, z - e)) / (2 * e)).normalize();
    eraBox(P, 'turret', new THREE.Vector3(side * x, t(x, z), z), n, new THREE.Vector3(1, 0, 0), 0.35, 0.25, 0.08, 0, 0.03);
  };
  for (const side of [1, -1]) {
    for (let k = 0; k < 7; k++) brackets(side, 0.95 - k * 0.29);
    P.destructibleCluster(`magach3_turret_era_${side > 0 ? 'L' : 'R'}`, () => {
      for (let k = 0; k < 7; k++) flankBox(side, 0.95 - k * 0.29, k);
      for (const z of [0.70, 0.40, 0.10, -0.20, -0.50]) shoulderBox(side, z);
      for (const y of [1.98, 2.22]) cheekCourse(side, y, 5);
      for (const x of [0.20, 0.50, 0.80]) roofBox(side, x);
    });
  }
}

/** The Magach 3's Blazer on the hull (the same photographs): seven parallel slabs lying flush up the glacis between the
 * light clusters, a row of nine boxes wrapping the nose below them, one either side of the driver's hatch. */
function magachGlacisEra(P: CastPort, deckY: (x: number, z: number) => number): void {
  const at = (x: number, z: number): [THREE.Vector3, THREE.Vector3] => {
    const e = 0.01;
    const n = new THREE.Vector3(-(deckY(x + e, z) - deckY(x - e, z)) / (2 * e), 1, -(deckY(x, z + e) - deckY(x, z - e)) / (2 * e));
    return [new THREE.Vector3(x, deckY(x, z), z), n.normalize()];
  };
  const fwd = new THREE.Vector3(0, 0, 1);
  P.destructibleCluster('magach3_glacis_era', () => {
    // parallel, on the glacis's centre-line slope
    const [, n0] = at(0, 2.84);
    const slope = new THREE.Vector3(0, n0.y, n0.z).normalize();
    for (let i = 0; i < 8; i++) {
      const x = -0.7525 + i * 0.215;
      const [c] = at(x, 2.86);
      eraBox(P, 'hull', c, slope, fwd, 0.205, 0.40, 0.12, 0.18);
    }
    for (let i = 0; i < 7; i++) {
      const x = -0.81 + i * 0.27;
      const [c, n] = at(x, 3.20 - 0.12 * (x / 0.81) ** 2);
      eraBox(P, 'hull', c, n, new THREE.Vector3(0, 1, 0), 0.25, 0.20, 0.12);
    }
    for (const x of [-0.42, 0.42]) {
      const [c, n] = at(x, 2.20);
      eraBox(P, 'hull', c, n, fwd, 0.26, 0.34, 0.09);
    }
  });
}

/** The M48 Super's spaced armour (turret, world; War Thunder's model and the owner's photographs of the 1994
 * demonstrator): flat plates wrapping the cast turret into a flat-topped faceted box standing a little over its roof, its
 * faces leaning in 8 degrees: the cheeks raked 45 degrees back from the flat plate over the mantlet (the gun frame's) to
 * the flank, two flank facets, the tail wrapped; a shelf round the bare cast roof; each cheek's rangefinder port, a few
 * large bolts, a handrail and the dischargers' housing on each flank. Each side is one prism from its outer faces into
 * the casting, meeting its twin on the centre line behind the roof. */
function m48SuperArmour(P: CastPort, T: TurretFrame, seat: CastSeat): void {
  const { box } = KIT;
  const L = tl(T);
  const yb = 1.70, yw = 2.42, yt = 2.60, h = yt - yb;
  // the walls lean in 6 % up to the roof line at yw; above it a strip at 40 degrees draws in 0.20 m toward the ring's axis
  const lean = (x: number, y: number, z: number): [number, number] => {
    const t = Math.min(1, Math.max(0, (y - yb) / (yw - yb)));
    const wx = x * (1 - 0.06 * t), wz = T.ringZ + (z - T.ringZ) * (1 - 0.04 * t);
    if (y <= yw) return [wx, wz];
    const r = Math.hypot(wx, wz - T.ringZ), k = r > 0.3 ? 1 - (0.20 * Math.min(1, (y - yw) / (yt - yw))) / r : 1;
    return [wx * k, T.ringZ + (wz - T.ringZ) * k];
  };
  const outer: readonly (readonly [number, number])[] = [[0.56, 2.04], [1.06, 1.52], [1.36, 1.05], [1.38, 0.0], [1.33, -0.85],
    [1.14, -1.18], [0.70, -1.56], [0, -1.66]];
  // the inner run inside the casting under its roof's edge; ahead of z 1.0 the cheeks are solid to the gun's slot, behind
  // the roof the tail is solid to the centre line
  const inner: [number, number][] = [];
  for (let z = -1.00; z <= 1.36 + 1e-9; z += 0.12) {
    const dome = Math.min(seat.sideAt(2.42, z), seat.sideAt(yb, z)) - 0.04;
    inner.push([z > 1.0 ? 0.56 : Math.max(0.30, dome), z]);
  }
  inner.push([0.56, 1.38]);
  const tail: [number, number][] = [[0, -1.12], [0.30, -1.06]];
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    // round the outline: the outer faces front to tail, then the inner run tail to front
    const pts = [...outer, ...tail, ...inner];
    pts.forEach(([x, z], i) => (i ? shape.lineTo(side * x, -z) : shape.moveTo(side * x, -z)));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, steps: 2, bevelEnabled: false, curveSegments: 1 });
    g.rotateX(-Math.PI / 2);
    const pos = g.getAttribute('position');
    // three levels (the floor, the roof line, the strip's top); above the floor the inner run follows the casting's
    // surface, so the shelf meets the cast roof with no well
    const isInner = (x: number, z: number): boolean => z <= 1.0 && inner.some(([ix, iz]) => Math.abs(ix - Math.abs(x)) < 1e-4 && Math.abs(iz - z) < 1e-4);
    for (let k = 0; k < pos.count; k++) {
      const level = Math.round(pos.getY(k) / (h / 2)), y = [yb, yw, yt][level];
      const x0 = pos.getX(k), z0 = pos.getZ(k);
      let [x, z] = lean(x0, y, z0);
      if (level > 0 && isInner(x0, z0)) x = side * Math.max(0.32, Math.min(Math.abs(x) + 0.30, seat.sideAt(y, z0) - 0.03));
      pos.setXYZ(k, x, y, z);
    }
    g.translate(0, -T.ringY, -T.ringZ);
    g.computeVertexNormals();
    P.add('turret', g);
    // two rows of large bolts on each outer face
    for (let i = 0; i + 1 < outer.length - 2; i++) {
      const [x0, z0] = outer[i], [x1, z1] = outer[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      // the face's outward normal (away from the turret's axis)
      const n = new THREE.Vector3(side * (z0 - z1), 0, x1 - x0).normalize();
      if (n.x * side * (x0 + x1) + n.z * (z0 + z1 - 2 * T.ringZ) < 0) n.negate();
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
      const count = Math.max(1, Math.round(len / 0.25));
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        for (const y of [yb + 0.10, yw - 0.10]) {
          const [bx, bz] = lean(side * (x0 + (x1 - x0) * t), y, z0 + (z1 - z0) * t);
          P.add('turretDark', KIT.cylY(0.02, 0.02, 0.02, 10), bx + n.x * 0.01, y - T.ringY, bz + n.z * 0.01 - T.ringZ, e.x, e.y, e.z);
        }
      }
      // the seam where the next plate meets this one
      if (i > 0) {
        const [sx0, sz0] = lean(side * x0, yb + 0.02, z0), [sx1, sz1] = lean(side * x0, yw, z0);
        bar(P, 'turretDark', [sx0, L.y(yb + 0.02), L.z(sz0)], [sx1, L.y(yw), L.z(sz1)], 0.012);
      }
      if (i === 0) {
        // the rangefinder's window near the cheek's top outer corner, in its raised frame
        const t = 0.75, ry = Math.atan2(n.x, n.z), y = yw - 0.16;
        const [px, pz] = lean(side * (x0 + (x1 - x0) * t), y, z0 + (z1 - z0) * t);
        P.add('turretDetail', box(0.34, 0.18, 0.04), px + n.x * 0.01, L.y(y), L.z(pz) + n.z * 0.01, 0, ry, 0);
        P.add('turretDark', box(0.25, 0.10, 0.012), px + n.x * 0.033, L.y(y), L.z(pz) + n.z * 0.033, 0, ry, 0);
      }
    }
    // the flank handrail on its three standoffs
    const [fx] = lean(side * 1.375, 2.30, 0.4);
    const rail = [0.85, 0.15, -0.55].map((z) => [fx + side * 0.075, L.y(2.30), L.z(z)]);
    bar(P, 'turretDetail', rail[0], rail[2], 0.016);
    for (const r of rail) bar(P, 'turretDetail', r, [fx, r[1], r[2]], 0.014);
    // the dischargers' housing on the flank's rear, its four tubes raked forward and up out of its front
    const [hx, hz] = lean(side * 1.34, 2.20, -0.62);
    P.add('turretDetail', moldedBox(0.20, 0.30, 0.46, 0.02, P.q ? 2 : 1, 0.01), hx + side * 0.09, L.y(2.20), L.z(hz));
    const bank = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: 0.04, len: 0.16, pitch: -0.55, splay: side * 0.20,
      arc: 0.2, spacing: 0.075, base: false, seed: side > 0 ? 497 : 498 });
    bank.position.set(hx + side * 0.09, L.y(2.26), L.z(hz + 0.22));
    P.turretG.add(bank);
    // the tactical number on the flank's plate
    const [nx, nz] = lean(side * 1.375, 2.0, 0.40);
    P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [nx + side * 0.02, L.y(2.0), L.z(nz)], side * Math.PI / 2);
  }
}

/** The M48 Super's skirts (hull, world): steel plates hung from the fender edges over the upper run and the return
 * rollers down to the road wheels' tops, their lower edges four broad shallow lobes between points at the panel joins,
 * the front raked up to the fender's nose; a flange closes the gap to the fender's lip. */
function m48SuperSkirts(P: CastPort): void {
  const shape = new THREE.Shape();
  const top = 1.50, notch = 0.76, lobe = 0.55, z0 = 2.55, z1 = -2.80;
  shape.moveTo(z1, top);
  shape.lineTo(z0, top);
  const zf = z0 - 0.26;
  shape.lineTo(zf, notch);
  const n = 6, pitch = (zf - z1) / n, steps = P.q ? 8 : 4;
  for (let k = 0; k < n; k++) {
    // each lobe a parabola through the notches, its lowest point the lobe's (the last ends at the rear edge)
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      shape.lineTo(zf - (k + t) * pitch, notch - (notch - lobe) * 4 * t * (1 - t));
    }
  }
  shape.closePath();
  for (const side of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: false, curveSegments: P.q ? 8 : 4 });
    g.rotateY(-Math.PI / 2);
    g.translate(side * 1.87 + (side > 0 ? 0.025 : 0), 0, 0);
    g.computeVertexNormals();
    P.add('hullDetail', g);
    P.add('hullDetail', KIT.box(0.09, 0.06, z0 - z1 - 0.05), side * 1.84, top - 0.02, (z0 + z1) / 2);
    // the joints between its panels, one at each notch
    for (let k = 1; k < n; k++) {
      P.add('hullDark', KIT.box(0.032, top - notch - 0.06, 0.012), side * 1.8825, (top + notch) / 2 - 0.03, zf - k * pitch);
    }
    // its hangers under the fender lip
    for (let zz = z0 - 0.35; zz > z1 + 0.2; zz -= 0.85) P.add('hullDark', KIT.box(0.05, 0.06, 0.08), side * 1.835, 1.46, zz);
  }
}

/** The bustle and its load on the A5's other marks (world): the rack round the tail (the Magach's IDF basket stands
 * taller and wider), the bedroll and bags, the ventilator. */
function m48MarkBustle(P: CastPort, T: TurretFrame, seat: CastSeat, V: M48Variant): void {
  const { cylY, sph, xform } = KIT;
  const L = tl(T);
  // (the racks start behind the flanks, inside the turret's outline seen from the front; the Magach's runs behind its
  // Blazer wall, and the Super's armour wraps the tail)
  if (V.mark === 'magach3') bustleRing(P, T, seat, Math.PI * 0.70, Math.PI * 1.30, -0.20, 1.99, [2.12, 2.26, 2.40, 2.54], 0.10, 0.09);
  else if (V.mark !== 'm48super' && V.mark !== 'm48a2ga2') {
    bustleRing(P, T, seat, Math.PI * 0.70, Math.PI * 1.30, -0.20, 1.99, [2.15, 2.29, 2.43], 0.02);
  }
  if (V.mark === 'm48a2ga2') {
    // the Bundeswehr's flat-sided stowage box across the bustle's tail on two brackets (the Munster tank), its lid seam
    // and hasps
    P.add('turretDetail', moldedBox(1.30, 0.48, 0.46, 0.03, P.q ? 2 : 1, 0.015), 0, L.y(2.20), L.z(-1.50));
    P.add('turretDark', KIT.box(1.24, 0.015, 0.02), 0, L.y(2.36), L.z(-1.735));
    for (const x of [-0.40, 0.40]) {
      P.add('turretDark', KIT.box(0.06, 0.08, 0.02), x, L.y(2.30), L.z(-1.735));
      P.add('turretDetail', KIT.box(0.06, 0.05, 0.36), x, L.y(1.98), L.z(-1.30));
    }
  }
  if (V.mark !== 'm48super' && V.mark !== 'm48a2ga2') KIT.tarpRoll(P, 'turretCloth', -0.064, L.y(2.34), L.z(-1.286), 0.99, 0.19, true, P.q ? 12 : 8);
  if (V.mark === 'm48a3' || V.mark === 'magach3') {
    KIT.stowage(P, 'turretCloth', mulberry(V.mark === 'magach3' ? 501 : 502), [
      [0.30, L.y(2.23), L.z(-1.60), 0.52, 0.40, 0.32], [-0.20, L.y(2.24), L.z(-1.62), 0.46, 0.42, 0.30],
      ...(V.mark === 'magach3' ? [[0.62, L.y(2.30), L.z(-1.40), 0.36, 0.50, 0.34] as [number, number, number, number, number, number],
        [-0.66, L.y(2.30), L.z(-1.38), 0.34, 0.48, 0.32] as [number, number, number, number, number, number]] : []),
    ]);
  }
  if (V.mark === 'm48super') return;
  P.add('turret', cylY(0.265, 0.27, 0.24, P.q ? 22 : 12), 0.68, L.y(seat.topAt(0.68, -1.0) + 0.10), L.z(-1.0));
  P.add('turret', xform(sph(0.265, P.q ? 18 : 10, P.q ? 8 : 5), 0, 0, 0, 0, 0, 0, [1, 0.44, 1]), 0.68, L.y(seat.topAt(0.68, -1.0) + 0.22), L.z(-1.0));
}

/** The flank fittings of the A5's other marks: the handrails (not under the Magach's boxes or the Super's armour), the
 * GA2's Wegmann dischargers (four in a row on each cheek), the Super's armour, its dischargers on the armour's shoulders
 * and its roof sight, the Magach's Blazer; the whips and the numbers. */
function* m48MarkFittings(P: CastPort, T: TurretFrame, seat: CastSeat, V: M48Variant): TankProfileBuild {
  const L = tl(T);
  if (V.mark === 'm48a3' || V.mark === 'm48a2ga2') {
    for (const side of [-1, 1]) {
      const rail: number[][] = [];
      for (let z = -0.5; z <= 1.36; z += 0.31) rail.push([side * (seat.sideAt(2.15, z) + 0.07), L.y(2.15), L.z(z)]);
      for (let i = 0; i + 1 < rail.length; i++) bar(P, 'turretDetail', rail[i], rail[i + 1], 0.016);
    }
  }
  if (V.mark === 'm48a2ga2') {
    for (const side of [-1, 1]) {
      const bank = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: 0.05, len: 0.34, pitch: -0.78, splay: side * 0.30,
        arc: 0.4, spacing: 0.12, seed: side > 0 ? 495 : 496 });
      const bx = side * (seat.sideAt(2.06, 1.00) + 0.10);
      bank.position.set(bx, L.y(2.08), L.z(1.00));
      P.turretG.add(bank);
      P.add('turretDetail', moldedBox(0.08, 0.10, 0.52, 0.01, 1, 0.005), bx - side * 0.03, L.y(1.99), L.z(1.00));
    }
  }
  if (V.mark === 'm48super') {
    m48SuperArmour(P, T, seat);
    yield 'm48SuperArmour';
    // the commander's stabilised sight head at the cupola's front, the sensor mast with its ball left of the roof's centre
    const y = seat.topAt(-0.42, 0.60);
    P.add('turret', moldedBox(0.28, 0.28, 0.30, 0.03, P.q ? 2 : 1, 0.015), -0.42, L.y(y + 0.12), L.z(0.60));
    P.add('turretGlass', KIT.box(0.20, 0.14, 0.012), -0.42, L.y(y + 0.15), L.z(0.756));
    const ym = seat.topAt(0.40, 0.55);
    P.add('turretDark', KIT.cylY(0.022, 0.03, 0.90, 10), 0.40, L.y(ym + 0.45), L.z(0.55));
    P.add('turretDetail', KIT.sph(0.065, P.q ? 14 : 8, P.q ? 10 : 6), 0.40, L.y(ym + 0.93), L.z(0.55));
  }
  if (V.mark === 'magach3') {
    magachTurretEra(P, seat);
    yield 'magachTurretEra';
  }
  antennaWhips(P, T, [[0.698, -0.48], [-0.292, -1.03]], 1.21, 490, { top: 3.727, rake: 0 });
  if (V.mark !== 'm48super') bustleNumbers(P, T, -0.95, 0.40, 0.24);
}

/** The GA2's cast gun shield (gun frame; the Munster and Dresden tanks): a squared block standing well ahead of the
 * turret's nose, 1.2 m across and 0.72 m tall with its bore in its upper half, its sides and lower edge rounded, its flat
 * face 0.63 m ahead of the trunnion, its back sunk into the casting; its underside 0.24 m under the bore at the turret
 * (over the hull's ring face, 1.633 m, out to the turret's front edge), rising 13 degrees to its face so it clears the
 * engine deck's grilles (1.68 to 1.79 m) with the gun depressed over the rear. */
function ga2Mantlet(q: boolean | undefined): Geo {
  // z (along the bore), half-width, top and bottom over the bore, corner radius
  const rows: readonly (readonly [number, number, number, number, number])[] = [
    [-0.02, 0.58, 0.44, -0.24, 0.14], [0.30, 0.60, 0.46, -0.20, 0.15], [0.48, 0.60, 0.46, -0.15, 0.15],
    [0.58, 0.58, 0.45, -0.12, 0.13], [0.63, 0.55, 0.43, -0.09, 0.11],
  ];
  const n = q ? 5 : 3;
  const sections = rows.map(([z, w, t, b, r]) => {
    const ring: SectionPoint[] = [];
    const h = (t - b) / 2, cy0 = (t + b) / 2;
    // a rounded rectangle, counter-clockwise from the right side's middle
    for (const [cx, cy, a0] of [[w - r, h - r, 0], [-(w - r), h - r, Math.PI / 2], [-(w - r), -(h - r), Math.PI],
      [w - r, -(h - r), Math.PI * 1.5]] as const) {
      for (let i = 0; i <= n; i++) {
        const a = a0 + (Math.PI / 2) * (i / n);
        ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r + cy0]);
      }
    }
    return { z, ring };
  });
  return sectionSolid(sections, { centeredSideQuads: true, smoothSideEdges: sections[0].ring.map((_, i) => i) });
}

/** The A5's gun shield (gun frame): a cast plate 6.5 cm thick lofted up its height, its face leaning back from 0.415 m
 * ahead of the trunnion at its foot (0.23 m under the bore) to 0.07 m at its crown (the model's 25 deg), bowed 3 cm
 * forward across its width, the front outline the model's rounded rectangle (1.03 m wide through the middle, its lower
 * corners rounded at about 0.15 m, 0.50 m across the crown). */
function m48Mantlet(q: boolean | undefined): Geo {
  // h (over the bore axis), half-width
  const rows: readonly (readonly [number, number])[] = [
    [-0.23, 0.30], [-0.215, 0.39], [-0.19, 0.445], [-0.15, 0.485], [-0.09, 0.51], [0.04, 0.515], [0.14, 0.515],
    [0.24, 0.51], [0.34, 0.48], [0.39, 0.42], [0.44, 0.35], [0.49, 0.25],
  ];
  const t = 0.065, bow = 0.03;
  const n = q ? 8 : 4;
  const sections = rows.map(([h, w]) => {
    const f = 0.415 - (h + 0.23) * 0.483;
    // counter-clockwise viewed from +h in (x, -d): the face left to right, then the back right to left
    const ring: SectionPoint[] = [];
    for (let i = 0; i <= n; i++) {
      const x = -w + (2 * w * i) / n;
      ring.push([x, -(f + bow * (1 - (x / w) ** 2))]);
    }
    for (let i = n; i >= 0; i--) {
      const x = -w + (2 * w * i) / n;
      ring.push([x, -(f - t + bow * (1 - (x / w) ** 2))]);
    }
    return { z: h, ring };
  });
  const m = sections[0].ring.length;
  // the face and the back shade round; the two thin ends keep their edges
  const smooth = Array.from({ length: m }, (_, i) => i).filter((i) => i !== n && i !== m - 1);
  const g = sectionSolid(sections, { centeredSideQuads: true, smoothSideEdges: smooth });
  // loft axis (z) up, the ring's second axis back along the bore: (x, y, z) -> (x, z, -y)
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  return g;
}

/** The 105 mm M68 (gun frame) at the model's stations from the bore station 1.514: the thick breech-end tube to 1.28,
 * the stepped tube to the collars, the square-ended bore evacuator riding 1.5 cm above the bore (the M68's eccentric
 * evacuator), the tapering chase in two steps and the thicker muzzle band, 4.313 m out. */
function m48Gun(P: CastPort): void {
  const { cylZ } = KIT;
  const seg = P.q ? 22 : 12;
  const len = 4.313;
  const tube = (r0: number, r1: number, s0: number, s1: number, y = 0): void => {
    P.add('gun', cylZ(r1, s1 - s0, seg, r0), 0, y, GUN_Z0 + (s0 + s1) / 2);
  };
  tube(0.094, 0.092, 0.51, 1.28);
  tube(0.086, 0.085, 1.28, 1.99);
  tube(0.098, 0.098, 1.99, 2.026);
  tube(0.128, 0.128, 2.026, 2.596, 0.015);
  tube(0.098, 0.098, 2.596, 2.676);
  tube(0.083, 0.082, 2.676, 3.34);
  tube(0.081, 0.080, 3.34, 4.10);
  tube(0.086, 0.086, 4.10, len);
  muzzleBore(P, { z: GUN_Z0 + len + 0.004, r: 0.086 * 0.78 });
  P.muzzleZ = GUN_Z0 + len;
}

/** The L7A3 in its thermal sleeve (gun frame), on the M68's stations (the two are the same 105 mm tube): the root out of
 * the boss, the sleeve's rear run in three clamped sections, the concentric fume extractor where the M68 carries its
 * evacuator, the front run in three sections, the bare muzzle band. */
function m48SleevedL7(P: CastPort): void {
  const { cylZ } = KIT;
  const seg = P.q ? 22 : 12;
  const len = 4.313;
  const tube = (r0: number, r1: number, s0: number, s1: number): void => {
    P.add('gun', cylZ(r1, s1 - s0, seg, r0), 0, 0, GUN_Z0 + (s0 + s1) / 2);
  };
  tube(0.094, 0.092, 0.51, 0.62);
  tube(0.112, 0.112, 0.62, 1.30);
  tube(0.108, 0.108, 1.30, 2.30);
  tube(0.112, 0.135, 2.30, 2.38);
  tube(0.135, 0.135, 2.38, 2.84);
  tube(0.135, 0.112, 2.84, 2.92);
  tube(0.104, 0.104, 2.92, 3.62);
  tube(0.100, 0.100, 3.62, 4.13);
  tube(0.086, 0.086, 4.13, len);
  // the sleeve's clamp bands at its section joints
  for (const [s0, r] of [[0.62, 0.124], [1.28, 0.122], [1.80, 0.120], [2.25, 0.120], [2.92, 0.116], [3.60, 0.114],
    [4.08, 0.112]] as const) tube(r, r, s0, s0 + 0.05);
  muzzleBore(P, { z: GUN_Z0 + len + 0.004, r: 0.086 * 0.78 });
  P.muzzleZ = GUN_Z0 + len;
}

/** The A3's 90 mm M41 (gun frame) from the bore station 1.514 (the Kubinka and Latrun tanks): the root out of the boss,
 * the tube tapering to the long bore evacuator right behind the muzzle, the collar and the T-shaped blast deflector
 * across the muzzle (its two dark side ports), 3.80 m out (8.68 m overall, AFV Database). */
function m48M41(P: CastPort): void {
  const { cylX, cylZ } = KIT;
  const seg = P.q ? 22 : 12;
  const len = 3.80;
  const tube = (r0: number, r1: number, s0: number, s1: number): void => {
    P.add('gun', cylZ(r1, s1 - s0, seg, r0), 0, 0, GUN_Z0 + (s0 + s1) / 2);
  };
  tube(0.095, 0.088, 0.51, 1.00);
  tube(0.084, 0.077, 1.00, 2.62);
  tube(0.077, 0.118, 2.62, 2.68);
  tube(0.118, 0.118, 2.68, 3.48);
  tube(0.118, 0.094, 3.48, 3.53);
  tube(0.094, 0.094, 3.53, 3.58);
  // the deflector: a cross tube on the bore, its ends open
  P.add('gun', cylX(0.13, 0.60, seg), 0, 0, GUN_Z0 + 3.665);
  for (const side of [-1, 1]) P.add('gunDark', cylX(0.105, 0.012, seg), side * 0.296, 0, GUN_Z0 + 3.665);
  // its forward mouth round the bore
  tube(0.082, 0.082, 3.70, len);
  muzzleBore(P, { z: GUN_Z0 + len + 0.004, r: 0.058 });
  P.muzzleZ = GUN_Z0 + len;
}

export function* buildM48A5CastSteps(P: CastPort): TankProfileBuild {
  yield* m48HullSteps(P, M48_VARIANTS.m48a5);
  yield* m48TurretSteps(P, M48_VARIANTS.m48a5);
  publishReceipt(P, {
    mark: 'm48a5', ring: [M48_RING.y, M48_RING.z], trunnion: [M48_TRUNNION.y, M48_TRUNNION.z],
    muzzleZ: 1.514 + 4.313, device: 'none', evacuator: [1.514 + 2.026, 1.514 + 2.596],
    roadWheels: 6, wheelR: M48_GEAR.wheelR, returnRollers: M48_GEAR.rollerN, tensionWheel: Boolean(M48_GEAR.tension),
    trackW: M48_TRACK_W, trackCentres: M48_XC * 2, glacisFromVerticalDeg: glacisDeg([3.22, 1.13], [2.50, 1.49]),
  });
}

/** A release-266 M48 mark on the A5's castings (M48_VARIANTS). */
export function* buildM48VariantCastSteps(P: CastPort, mark: Exclude<M48Mark, 'm48a5'>): TankProfileBuild {
  const V = M48_VARIANTS[mark];
  yield* m48HullSteps(P, V);
  yield* m48TurretSteps(P, V);
  publishReceipt(P, {
    mark, ring: [M48_RING.y, M48_RING.z], trunnion: [M48_TRUNNION.y, M48_TRUNNION.z],
    muzzleZ: M48_TRUNNION.z + P.muzzleZ, device: V.gun === 'm41' ? 'm36' : 'none',
    evacuator: V.gun === 'm41' ? [1.514 + 2.68, 1.514 + 3.48] : V.gun === 'l7a3' ? [1.514 + 2.36, 1.514 + 2.86] : [1.514 + 2.026, 1.514 + 2.596],
    roadWheels: 6, wheelR: M48_GEAR.wheelR, returnRollers: m48Gear(V).rollerN, tensionWheel: Boolean(m48Gear(V).tension),
    trackW: M48_TRACK_W, trackCentres: M48_XC * 2, glacisFromVerticalDeg: glacisDeg([3.22, 1.13], [2.50, 1.49]),
  });
}
