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
  readonly idler: { readonly z: number; readonly y: number; readonly r: number };
  readonly sprocket: { readonly z: number; readonly y: number; readonly r: number };
  readonly tension?: { readonly z: number; readonly y: number; readonly r: number };
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
  const wheelZs = evenStations(6, G.span[0] - G.span[1], (G.span[0] + G.span[1]) / 2);
  const rs = G.rollerSpan ?? [G.span[0] - 0.25, G.span[1] + 0.25];
  const rollers = evenStations(G.rollerN, rs[0] - rs[1], (rs[0] + rs[1]) / 2).map((z) => ({ z, y: G.rollerY, r: 0.11 }));
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
    sprocket: G.sprocket, idler: G.idler, rollers: G.tension ? [...rollers, G.tension] : rollers, trackW,
    topY: G.rollerY + 0.04, paintedEnds: true, coveredTop: false, arms: true, sprocketTeeth: false,
    contactZF: G.contactZF, contactZR: G.contactZR, botY: G.botY,
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
}

function* pershingHullSteps(P: CastPort, H: PershingHullSpec): Generator<string, HullFrame> {
  const { box, cylX, cylY, cylZ } = KIT;
  const iw = H.xc - H.trackW / 2 - 0.04;           // tub half-width, inside the track lanes
  const deckAt = (z: number): number => {
    if (z >= H.knee[0]) return H.knee[1] + (H.toe[1] - H.knee[1]) * Math.min(1, (z - H.knee[0]) / (H.toe[0] - H.knee[0]));
    if (z >= H.engineDeckZ) return H.deckY;
    if (z >= H.tailZ + 0.30) return H.engineDeckY;
    return H.engineDeckY + (H.tailTopY - H.engineDeckY) * ((H.tailZ + 0.30 - z) / 0.30);
  };
  // 1. The tub between the tracks: belly to deck, the lower glacis and the rear plate.
  const tubSt: HullStation[] = [];
  const tubAt = (z: number, bot: number, top: number, w = iw): HullStation =>
    ({ z, bot, top, hwTop: w - 0.02, hw: w, hwBot: w - 0.05, yW: bot + (top - bot) * 0.55, roll: 0.15 });
  tubSt.push(tubAt(H.tailZ, H.tailBotY, H.tailTopY, iw - 0.06));
  tubSt.push(tubAt(H.tailZ + 0.12, H.tailBotY - 0.12, deckAt(H.tailZ + 0.12), iw - 0.02));
  tubSt.push(tubAt(H.bellyRearZ, H.bellyY, deckAt(H.bellyRearZ)));
  for (const z of [H.engineDeckZ - 0.02, H.engineDeckZ + 0.02]) tubSt.push(tubAt(z, H.bellyY, deckAt(z)));
  tubSt.push(tubAt(H.bellyFrontZ, H.bellyY, deckAt(H.bellyFrontZ)));
  tubSt.push(tubAt(H.knee[0], H.bellyY + (H.toe[1] - 0.08 - H.bellyY) * ((H.knee[0] - H.bellyFrontZ) / (H.toe[0] - H.bellyFrontZ)), H.knee[1]));
  tubSt.push(tubAt(H.toe[0] - 0.06, H.toe[1] - 0.16, H.toe[1] + 0.03, iw - 0.03));
  tubSt.push(tubAt(H.toe[0], H.toe[1] - 0.08, H.toe[1], iw - 0.05));
  P.add('hull', hullSolid(tubSt.filter((s, i, a) => i === 0 || s.z > a[i - 1].z + 1e-4), P.q));
  yield 'pershingHullTub';
  // 2. The sponsons over the tracks, flush with the deck, closed by the glacis wings and the rear plate.
  const spSt: HullStation[] = [];
  const spAt = (z: number, top: number, w = H.sponsonHW): HullStation =>
    ({ z, bot: H.sponsonY, top: Math.max(top, H.sponsonY + 0.06), hwTop: w - 0.05, hw: w, hwBot: w, yW: H.sponsonY + 0.02, roll: 0.35 });
  const spZ = H.tailZ + (H.mark === 'm47' ? 0.90 : 0.72);
  spSt.push(spAt(spZ, deckAt(spZ) - 0.02, H.sponsonHW - 0.04));
  for (const z of [spZ + 0.08, H.engineDeckZ - 0.02, H.engineDeckZ + 0.02, H.knee[0]]) spSt.push(spAt(z, deckAt(z)));
  const wingZ = H.knee[0] + (H.toe[0] - H.knee[0]) * 0.55;
  spSt.push(spAt(wingZ, deckAt(wingZ) - 0.01, H.sponsonHW - 0.08));
  P.add('hull', hullSolid(spSt, P.q));
  yield 'pershingHullSponsons';
  // 3. Fenders: the full-length plates over the tracks, ramping down at the bow and the stern.
  const fx0 = H.sponsonHW - 0.02, fx1 = H.fenderHW;
  for (const side of [-1, 1]) {
    const [a, b] = side > 0 ? [fx0, fx1] : [-fx1, -fx0];
    P.add('hull', fenderRun(a, b, [
      [H.tailZ - 0.02, H.fenderY - 0.10], [H.tailZ + 0.25, H.fenderY], [H.knee[0] - 0.05, H.fenderY],
      [H.toe[0] - 0.35, H.fenderY - 0.12], [H.toe[0] + 0.02, H.fenderY - 0.40],
    ], 0.03));
    // the fender's outer lip
    P.add('hullDetail', box(0.025, 0.07, H.knee[0] - H.tailZ - 0.25), side * (fx1 - 0.012), H.fenderY - 0.045,
      (H.knee[0] + H.tailZ + 0.25) / 2 - 0.05);
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
  // 5. The exhaust mufflers in the rear corners under the fenders (the M46/M47 tell): drums in their guard hoops, the
  // elbow from the engine deck, the X-braced end guards
  for (const side of [-1, 1]) {
    const mx = side * 1.33, mr = 0.19, my = H.fenderY - mr - 0.025;
    const mz0 = H.tailZ + 0.03, mz1 = H.tailZ + (H.mark === 'm47' ? 0.86 : 0.68);
    P.add('hullDetail', cylZ(mr, mz1 - mz0, P.q ? 20 : 12), mx, my, (mz0 + mz1) / 2);
    P.add('hullDark', cylZ(mr * 0.84, 0.02, P.q ? 20 : 12), mx, my, mz0 - 0.005);
    for (const r of [0.6, -0.6]) P.add('hullDark', box(0.03, mr * 2.0, 0.02), mx, my, mz0 - 0.018, 0, 0, r);
    for (const dz of [0.12, (mz1 - mz0) - 0.12]) P.add('hullDark', cylZ(mr + 0.012, 0.04, P.q ? 20 : 12), mx, my, mz0 + dz);
    P.add('hullDark', cylZ(0.07, 0.24, 10), side * 1.30, my + 0.05, mz1 + 0.10);
    P.add('hullDark', box(0.06, H.fenderY - my - mr + 0.02, 0.05), mx, (H.fenderY + my + mr) / 2 - 0.01, mz0 + 0.33);
  }
  yield 'pershingHullMufflers';
  // 6. Bow: driver's and co-driver's hatches with periscopes, headlight groups with brush guards, tow eyes, the bow gun.
  for (const side of [-1, 1]) {
    const hx = side * 0.55, hz = H.knee[0] - 0.42;
    P.add('hull', cylY(0.30, 0.31, 0.05, P.q ? 20 : 12), hx, H.deckY + 0.025, hz);
    P.add('hullDetail', cylY(0.26, 0.27, 0.03, P.q ? 20 : 12), hx, H.deckY + 0.065, hz);
    P.add('hullDark', box(0.06, 0.025, 0.12), hx + side * 0.24, H.deckY + 0.06, hz - 0.12);
    KIT.periscope(P, 'hullDetail', hx, H.deckY + 0.11, hz + 0.20);
  }
  for (const side of [-1, 1]) {
    const lights = FITTINGS.lightCluster({ mats: P.mats, pods: H.mark === 'm47' ? 2 : 1, spacing: 0.14, r: 0.062,
      rake: -0.20, seed: side > 0 ? 471 : 469, nightKind: 'headlight' });
    const lz = H.toe[0] - 0.42, lx = side * 0.98;
    lights.position.set(lx, deckAt(lz) + 0.05, lz);
    P.hullG.add(lights);
    // its bracket down to the glacis
    P.add('hullDark', box(0.05, 0.10, 0.05), lx, deckAt(lz) + 0.0, lz);
  }
  for (const side of [-1, 1]) KIT.liftEye(P, 'hullDetail', side * 0.70, H.toe[1] - 0.10, H.toe[0] + 0.02, 0);
  if (H.mark === 'm47' || H.mark === 'm46') {
    // .30 cal bow gun in its ball mount on the right of the glacis
    const bz = H.knee[0] + (H.toe[0] - H.knee[0]) * 0.45, by = deckAt(bz);
    const ang = Math.atan2(H.knee[1] - H.toe[1], H.toe[0] - H.knee[0]);
    P.add('hull', KIT.sph(0.14, P.q ? 16 : 10, P.q ? 10 : 6), -0.55, by - 0.02, bz);
    P.add('hullDark', cylZ(0.022, 0.32, 8), -0.55, by + 0.01, bz + 0.20, 0.05, 0, 0);
    void ang;
  }
  yield 'pershingHullBow';
  // 7. Rear plate: tail lights, the towing pintle, the transmission doors.
  for (const side of [-1, 1]) {
    KIT.headlight(P, side * 0.72, H.tailTopY - 0.14, H.tailZ - 0.03, Math.PI, 0.045, false);
    KIT.liftEye(P, 'hullDetail', side * 0.85, H.tailBotY + 0.10, H.tailZ - 0.02, Math.PI);
  }
  P.add('hullDetail', box(1.10, 0.38, 0.03), 0, (H.tailBotY + H.tailTopY) / 2, H.tailZ - 0.012);
  P.add('hullDark', box(0.14, 0.10, 0.08), 0, H.tailBotY + 0.10, H.tailZ - 0.03);
  P.add('hullDark', cylX(0.035, 0.16, 8), 0, H.tailBotY + 0.10, H.tailZ - 0.05);
  yield 'pershingHullRear';
  pattonGear(P, H.xc, H.trackW, H.gear);
  // mud flaps at the fender ends
  for (const [fz, fy0, fy1] of [[H.toe[0] - 0.02, H.fenderY - 0.62, H.fenderY - 0.40], [H.tailZ + 0.02, H.fenderY - 0.40, H.fenderY - 0.10]] as const) {
    for (const side of [-1, 1]) {
      MUDGUARDS.add(P, {
        label: `patton-cast-${fz < 0 ? 'rear' : 'front'}-flap-${side}`, x: side * H.xc, y: (fy0 + fy1) / 2, z: fz,
        thickness: 0.03, length: H.trackW * 0.92, height: fy1 - fy0, material: 'rubber', rotation: [0, Math.PI / 2, 0],
        crown: 0.012, frontCut: 0.025, rearCut: 0.018,
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
  const devL = G.device === 'm3a1' ? 0.34 : G.device === 'm36' ? 0.30 : 0;
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
    P.add('gun', xform(cylZ(0.15, devL, seg), 0, 0, 0, 0, 0, 0, [1.45, 1, 1]), 0, 0, z0 + devL / 2);
    for (const side of [-1, 1]) P.add('gunDark', box(0.012, 0.13, devL * 0.42), side * 0.214, 0, z0 + devL * 0.52);
    P.add('gun', cylZ(G.r1 * 1.25, 0.05, seg), 0, 0, z0 - 0.02);
  } else if (G.device === 'm36') {
    // 90 mm M36: the T-shaped blast deflector, a short cylinder across the muzzle with the bore running through it to
    // its own collar at the mouth
    const z0 = len - devL;
    P.add('gun', cylZ(G.r1, devL, seg), 0, 0, z0 + devL / 2);
    P.add('gun', xform(KIT.cylX(0.112, 0.54, seg), 0, 0, 0), 0, 0, len - 0.13);
    for (const side of [-1, 1]) P.add('gunDark', KIT.cylX(0.088, 0.012, seg), side * 0.271, 0, len - 0.13);
    P.add('gun', cylZ(G.r1 * 1.18, 0.05, seg), 0, 0, len - 0.025);
    P.add('gun', cylZ(G.r1 * 1.3, 0.06, seg), 0, 0, z0 + 0.03);
  }
  muzzleBore(P, { z: len + 0.004, r: G.r1 * 0.78 });
  P.muzzleZ = len;
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
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025,
    bevelSegments: q ? 3 : 1, curveSegments: 1 });
  // shape (u along the bore, v up), extruded across: map to the gun frame (x across, y up, z along the bore)
  g.translate(0, 0, -w / 2);
  g.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
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
}
const tl = (T: TurretFrame) => ({ y: (y: number): number => y - T.ringY, z: (z: number): number => z - T.ringZ });

/** Commander's vision cupola: armoured ring with vision blocks, split hatch, seated on the roof (world x, z). */
function visionCupola(P: CastPort, T: TurretFrame, x: number, z: number, r: number, h: number, blocks: number): number {
  const { cylY, box } = KIT;
  const L = tl(T);
  const base = castTopAt(T.stations, x, z) - 0.03;
  P.add('turret', cylY(r, r * 1.08, h, P.q ? 24 : 14), x, L.y(base + h / 2), L.z(z));
  P.add('turret', cylY(r * 0.94, r * 0.98, 0.05, P.q ? 24 : 14), x, L.y(base + h + 0.025), L.z(z));
  P.add('turretDark', box(r * 1.7, 0.015, 0.03), x, L.y(base + h + 0.055), L.z(z));
  for (let k = 0; k < blocks; k++) {
    const a = (k / blocks) * Math.PI * 2;
    const px = x + Math.sin(a) * r * 1.0, pz = z + Math.cos(a) * r * 1.0;
    P.add('turretDetail', box(0.10, 0.07, 0.05), px, L.y(base + h * 0.62), L.z(pz), 0, a, 0);
    P.add('turretGlass', box(0.075, 0.035, 0.012), x + Math.sin(a) * (r + 0.026), L.y(base + h * 0.62),
      L.z(z + Math.cos(a) * (r + 0.026)), 0, a, 0);
  }
  return base + h + 0.05;
}

/** Loader's hatch: low ring and a flat lid with its hinge (world x, z). */
function loaderHatch(P: CastPort, T: TurretFrame, x: number, z: number, r: number): number {
  const { cylY, box } = KIT;
  const L = tl(T);
  const base = castTopAt(T.stations, x, z) - 0.02;
  P.add('turret', cylY(r, r * 1.05, 0.06, P.q ? 22 : 12), x, L.y(base + 0.03), L.z(z));
  P.add('turretDetail', cylY(r * 0.88, r * 0.9, 0.03, P.q ? 22 : 12), x, L.y(base + 0.075), L.z(z));
  P.add('turretDark', box(0.10, 0.04, 0.06), x, L.y(base + 0.075), L.z(z - r * 0.92));
  return base + 0.09;
}

/** Roof periscope / sight hood seated on the casting (world). */
function roofScope(P: CastPort, T: TurretFrame, x: number, z: number, ry = 0, tall = 0.07): void {
  const { box } = KIT;
  const L = tl(T);
  const y = castTopAt(T.stations, x, z);
  P.add('turret', box(0.16, tall + 0.03, 0.18), x, L.y(y + tall / 2 - 0.01), L.z(z), 0, ry, 0);
  P.add('turretGlass', box(0.12, 0.035, 0.012), x + Math.sin(ry) * 0.092, L.y(y + tall * 0.7), L.z(z + Math.cos(ry) * 0.092), 0, ry, 0);
}

/** Roof ventilator dome (world). */
function ventilator(P: CastPort, T: TurretFrame, x: number, z: number, r: number): void {
  const L = tl(T);
  const y = castTopAt(T.stations, x, z);
  P.add('turret', KIT.cylY(r * 0.85, r, 0.05, P.q ? 18 : 10), x, L.y(y + 0.015), L.z(z));
  P.add('turret', KIT.xform(KIT.sph(r * 0.85, P.q ? 16 : 10, P.q ? 8 : 5), 0, 0, 0, 0, 0, 0, [1, 0.45, 1]), x, L.y(y + 0.04), L.z(z));
}

/** Browning M2 HB on a working mount (world base). */
function roofM2(P: CastPort, T: TurretFrame, x: number, z: number, baseY: number, opts: { barrel?: number; cls?: 'm2' | 'mag';
  scale?: number; seed: number }): void {
  const L = tl(T);
  const mg = FITTINGS.americanM2({
    mats: P.mats, tone: 'dark', ammoSide: 1, barrelLength: opts.barrel ?? 0.65, elev: 0.03,
    ring: { r: 0.22, stubs: 4 }, shield: false, seed: opts.seed, working: true, cls: opts.cls, scale: opts.scale,
  });
  mg.position.set(x, L.y(baseY), L.z(z));
  P.turretG.add(mg);
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

/** Lifting eyes on the casting's flanks (world z, at a fraction of the side's height). */
function liftEyes(P: CastPort, T: TurretFrame, zs: readonly number[], frac = 0.7): void {
  const L = tl(T);
  for (const z of zs) {
    const s = stationAt(T.stations, z);
    const y = s.bot + (s.top - s.bot) * frac;
    for (const side of [-1, 1]) {
      const x = side * castSideAt(T.stations, y, z);
      KIT.liftEye(P, 'turretDetail', x + side * 0.02, L.y(y), L.z(z), side * Math.PI / 2);
    }
  }
}

function antennaWhips(P: CastPort, T: TurretFrame, at: readonly (readonly [number, number])[], h: number, seed: number): void {
  const L = tl(T);
  at.forEach(([x, z], i) => {
    const y = castTopAt(T.stations, x, z);
    P.add('turretDark', KIT.cylY(0.04, 0.05, 0.08, 10), x, L.y(y + 0.03), L.z(z));
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.009, rake: (x < 0 ? -1 : 1) * 0.05, seed: seed + i });
    whip.position.set(x, L.y(y + 0.07), L.z(z));
    P.turretG.add(whip);
  });
}

function bustleNumbers(P: CastPort, T: TurretFrame, z: number, frac: number, scale: number): void {
  const L = tl(T);
  const s = stationAt(T.stations, z);
  const y = s.bot + (s.top - s.bot) * frac;
  const hw = castSideAt(T.stations, y, z);
  P.decal('turret', 'number', P.spec.visual.number || '', scale, [hw + 0.01, L.y(y), L.z(z)], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', scale, [-hw - 0.01, L.y(y), L.z(z)], -Math.PI / 2);
}

/** What pattonCastProportions.selftest.mjs reads back from a build: the authored datums and the running gear's counts. */
interface PattonCastReceipt {
  readonly mark: 'm46' | 'm47' | 'm48a5';
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
  if (receipt.mark !== 'm48a5') {
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
// The Pershing turret on the M46: flat cast front plate at z 0.47, sides to 1.00 half-width over the ring, the short
// bustle to -2.07; 1.74 floor, 2.60 roof (docs/references/tanks/m46_patton.md, gap table).
const M46_TURRET: readonly CastStation[] = [
  { z: 0.50, bot: 1.80, top: 2.50, hw: 0.70, roof: 0.78, foot: 0.86, waist: 0.40, nUp: 3.2, nLo: 5 },
  { z: 0.44, bot: 1.76, top: 2.57, hw: 0.84, roof: 0.80, foot: 0.86, waist: 0.40, nUp: 3.2, nLo: 5 },
  { z: 0.22, bot: 1.74, top: 2.60, hw: 0.94, roof: 0.80, foot: 0.88, waist: 0.38, nUp: 3.4, nLo: 5 },
  { z: -0.10, bot: 1.74, top: 2.61, hw: 0.99, roof: 0.80, foot: 0.90, waist: 0.38, nUp: 3.4, nLo: 5 },
  { z: -0.55, bot: 1.74, top: 2.61, hw: 1.00, roof: 0.80, foot: 0.90, waist: 0.38, nUp: 3.4, nLo: 5 },
  { z: -0.95, bot: 1.76, top: 2.61, hw: 0.94, roof: 0.80, foot: 0.90, waist: 0.38, nUp: 3.4, nLo: 5 },
  { z: -1.30, bot: 1.82, top: 2.60, hw: 0.84, roof: 0.80, foot: 0.90, waist: 0.40, nUp: 3.2, nLo: 5 },
  { z: -1.45, bot: 1.94, top: 2.58, hw: 0.79, roof: 0.80, foot: 0.92, waist: 0.40, nUp: 3.2, nLo: 5 },
  { z: -1.85, bot: 1.97, top: 2.55, hw: 0.73, roof: 0.78, foot: 0.92, waist: 0.42, nUp: 3.0, nLo: 5 },
  { z: -2.02, bot: 2.00, top: 2.50, hw: 0.65, roof: 0.72, foot: 0.90, waist: 0.45, nUp: 2.8, nLo: 4 },
  { z: -2.08, bot: 2.04, top: 2.42, hw: 0.52, roof: 0.66, foot: 0.86, waist: 0.48, nUp: 2.6, nLo: 4 },
];
const M46_GUN: GunSpec = {
  trunnionZ: 0.40, axisY: 2.07, muzzleZ: 4.23, r0: 0.118, r1: 0.105,
  evac: { z0: 3.36, z1: 3.86, r: 0.150 }, device: 'm3a1',
};

function* m46TurretSteps(P: CastPort): TankProfileBuild {
  const { box, cylX, cylY, cylZ } = KIT;
  const T: TurretFrame = { ringY: M46_RING.y, ringZ: M46_RING.z, stations: M46_TURRET };
  const L = tl(T);
  P.turretG.position.set(0, T.ringY, T.ringZ);
  P.add('turret', castSolid(M46_TURRET, P.q, T.ringZ, T.ringY));
  // the basket under the ring (the crew's floor, in the hull's well)
  P.add('turretDark', cylY(0.92, 0.92, 0.70, P.q ? 24 : 12), 0, L.y(1.22), 0);
  yield 'm46TurretCasting';
  // roof: commander's vision cupola on the right rear, loader's hatch on the left, the gunner's periscope ahead of the
  // cupola, the ventilator over the gun, the M2 on its post at the cupola
  visionCupola(P, T, -0.52, -0.72, 0.30, 0.15, 6);
  loaderHatch(P, T, 0.50, -0.52, 0.30);
  roofScope(P, T, -0.42, 0.12, 0, 0.09);
  roofScope(P, T, 0.30, -0.02, 0, 0.05);
  ventilator(P, T, 0.12, 0.20, 0.13);
  const postY = castTopAt(M46_TURRET, -0.06, -1.05);
  P.add('turretDark', cylY(0.035, 0.05, 0.30, 10), -0.06, L.y(postY + 0.15), L.z(-1.05));
  roofM2(P, T, -0.06, -1.05, postY + 0.30, { barrel: 0.68, seed: 461 });
  yield 'm46TurretRoof';
  // the bustle's stowage rack on its rear face, lifting eyes, whips, numbers
  bustleBasket(P, T, -2.04, -2.42, 0.62, 2.00, 2.36, 466);
  liftEyes(P, T, [-0.20, -1.55], 0.72);
  antennaWhips(P, T, [[0.55, -1.55], [-0.55, -1.62]], 0.70, 468);
  bustleNumbers(P, T, -1.70, 0.55, 0.22);
  yield 'm46TurretFittings';
  // gun: the rotor shield on the trunnion (coax and sight ports), the cast front plate's cheeks around it
  const G = M46_GUN;
  P.gunG.position.set(0, G.axisY - T.ringY, G.trunnionZ - T.ringZ);
  P.addGunExtra(rotorShield(0.54, 0.10, 1.02, -0.58, 0.62, P.q), 0, 0, 0);
  P.addGunExtra(cylX(0.11, 0.82, P.q ? 18 : 10), 0, -0.02, 0.48);
  P.addGunExtraDark(box(0.07, 0.07, 0.04), 0.30, 0.04, 0.555);
  P.addGunExtraDark(box(0.09, 0.09, 0.04), -0.32, 0.10, 0.545);
  P.addGunExtra(cylZ(0.15, 0.20, P.q ? 18 : 10, 0.17), 0, 0, 0.62);
  // the front plate's opening frame the shield turns in
  P.add('turret', box(1.20, 0.10, 0.10), 0, L.y(2.47), L.z(0.50));
  P.add('turret', box(1.20, 0.08, 0.10), 0, L.y(1.82), L.z(0.50));
  pattonGun(P, G);
  P.topY = L.y(3.18) + 0.12;
  yield 'm46Gun';
}

const M46_HULL_SPEC: PershingHullSpec = {
  mark: 'm46', tailZ: -4.25, toe: [2.09, 1.10], knee: [1.55, 1.62], bellyFrontZ: 1.30, bellyRearZ: -3.30, bellyY: 0.46,
  deckY: 1.62, engineDeckY: 1.65, engineDeckZ: -1.30, tailTopY: 1.52, tailBotY: 0.68,
  sponsonHW: 1.45, sponsonY: 1.13, fenderHW: 1.756, fenderY: 1.56, trackW: 0.584, xc: 1.397,
  gear: {
    wheelR: 0.33, wheelY: 0.36, span: [1.02, -2.68], rollerN: 5, rollerY: 1.04, rollerSpan: [0.55, -2.40],
    idler: { z: 1.70, y: 0.70, r: 0.33 }, sprocket: { z: -3.80, y: 0.88, r: 0.33 },
    tension: { z: -3.22, y: 0.50, r: 0.20 }, contactZF: 1.10, contactZR: -2.80,
  },
};

export function* buildM46CastSteps(P: CastPort, finish: TrackFinish): TankProfileBuild {
  yield* pershingHullSteps(P, { ...M46_HULL_SPEC, gear: { ...M46_HULL_SPEC.gear, ...finish } });
  yield* m46TurretSteps(P);
  const H = M46_HULL_SPEC, G = M46_GUN;
  publishReceipt(P, {
    mark: 'm46', ring: [M46_RING.y, M46_RING.z], trunnion: [G.axisY, G.trunnionZ], muzzleZ: G.muzzleZ, device: G.device,
    evacuator: [G.evac?.z0 ?? 0, G.evac?.z1 ?? 0], roadWheels: 6, wheelR: H.gear.wheelR, returnRollers: H.gear.rollerN,
    tensionWheel: Boolean(H.gear.tension), trackW: H.trackW, trackCentres: H.xc * 2, glacisFromVerticalDeg: glacisDeg(H.toe, H.knee),
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// M47 Patton (Patton II)
// ---------------------------------------------------------------------------------------------------------------------

const M47_RING = { y: 1.62, z: -0.35 };
// The T42-derived cast turret: the long sloped nose to the narrow gun shield at z 0.72, roof 2.80 over the ring, the
// stepped long bustle at 2.58 to -2.66, stereo rangefinder ears at z 0.12.
const M47_TURRET: readonly CastStation[] = [
  { z: 0.74, bot: 1.92, top: 2.24, hw: 0.30, roof: 0.50, foot: 0.80, waist: 0.30, nUp: 1.9, nLo: 3 },
  { z: 0.62, bot: 1.84, top: 2.37, hw: 0.46, roof: 0.56, foot: 0.82, waist: 0.28, nUp: 1.9, nLo: 3 },
  { z: 0.40, bot: 1.76, top: 2.58, hw: 0.66, roof: 0.62, foot: 0.86, waist: 0.26, nUp: 2.0, nLo: 3.5 },
  { z: 0.18, bot: 1.74, top: 2.76, hw: 0.82, roof: 0.68, foot: 0.90, waist: 0.26, nUp: 2.2, nLo: 4 },
  { z: -0.20, bot: 1.74, top: 2.79, hw: 0.98, roof: 0.72, foot: 0.92, waist: 0.26, nUp: 2.2, nLo: 4 },
  { z: -0.60, bot: 1.74, top: 2.80, hw: 1.01, roof: 0.73, foot: 0.92, waist: 0.26, nUp: 2.2, nLo: 4 },
  { z: -1.00, bot: 1.76, top: 2.80, hw: 0.96, roof: 0.73, foot: 0.92, waist: 0.27, nUp: 2.2, nLo: 4 },
  { z: -1.34, bot: 1.82, top: 2.78, hw: 0.88, roof: 0.73, foot: 0.92, waist: 0.28, nUp: 2.2, nLo: 4 },
  { z: -1.50, bot: 1.92, top: 2.70, hw: 0.84, roof: 0.72, foot: 0.92, waist: 0.30, nUp: 2.2, nLo: 4 },
];
const M47_BUSTLE: readonly CastStation[] = [
  { z: -1.30, bot: 1.95, top: 2.60, hw: 0.86, roof: 0.78, foot: 0.94, waist: 0.32, nUp: 2.6, nLo: 5 },
  { z: -1.80, bot: 1.96, top: 2.59, hw: 0.78, roof: 0.78, foot: 0.94, waist: 0.32, nUp: 2.6, nLo: 5 },
  { z: -2.30, bot: 1.97, top: 2.58, hw: 0.70, roof: 0.78, foot: 0.94, waist: 0.33, nUp: 2.6, nLo: 5 },
  { z: -2.60, bot: 1.99, top: 2.55, hw: 0.64, roof: 0.76, foot: 0.92, waist: 0.35, nUp: 2.5, nLo: 5 },
  { z: -2.67, bot: 2.03, top: 2.48, hw: 0.56, roof: 0.70, foot: 0.88, waist: 0.40, nUp: 2.4, nLo: 4 },
];
const M47_GUN: GunSpec = {
  trunnionZ: 0.48, axisY: 2.07, muzzleZ: 4.33, r0: 0.118, r1: 0.105,
  evac: { z0: 3.36, z1: 3.94, r: 0.148 }, device: 'm36',
};

function* m47TurretSteps(P: CastPort): TankProfileBuild {
  const { box, cylX, cylY, cylZ, sph } = KIT;
  const T: TurretFrame = { ringY: M47_RING.y, ringZ: M47_RING.z, stations: [...M47_TURRET, ...M47_BUSTLE.slice(1)] };
  const L = tl(T);
  P.turretG.position.set(0, T.ringY, T.ringZ);
  P.add('turret', castSolid(M47_TURRET, P.q, T.ringZ, T.ringY));
  P.add('turret', castSolid(M47_BUSTLE, P.q, T.ringZ, T.ringY));
  P.add('turretDark', cylY(0.92, 0.92, 0.70, P.q ? 24 : 12), 0, L.y(1.22), 0);
  yield 'm47TurretCasting';
  // the M12 stereoscopic rangefinder's armoured ends: a blister on each cheek
  for (const side of [-1, 1]) {
    const z = 0.10, y = 2.36;
    const x = side * castSideAt(M47_TURRET, y, z);
    P.add('turret', KIT.xform(sph(0.13, P.q ? 18 : 10, P.q ? 12 : 6), 0, 0, 0, 0, 0, 0, [0.75, 0.9, 1.15]), x, L.y(y), L.z(z));
    P.add('turretGlass', box(0.012, 0.06, 0.10), x + side * 0.097, L.y(y), L.z(z + 0.01));
    P.add('turretDark', cylX(0.07, 0.03, P.q ? 14 : 8), x + side * 0.085, L.y(y), L.z(z));
  }
  yield 'm47TurretRangefinder';
  // roof: the commander's cupola on the right with the M2, the loader's hatch on the left, gunner's periscope, vent
  const cupTop = visionCupola(P, T, -0.50, -0.72, 0.30, 0.16, 6);
  loaderHatch(P, T, 0.50, -0.60, 0.29);
  roofScope(P, T, -0.40, 0.18, 0, 0.09);
  ventilator(P, T, 0.30, -1.15, 0.12);
  P.add('turretDark', cylY(0.03, 0.045, 0.24, 10), -0.50, L.y(cupTop + 0.12), L.z(-0.72));
  roofM2(P, T, -0.50, -0.72, cupTop + 0.24, { barrel: 0.70, seed: 471 });
  yield 'm47TurretRoof';
  // the long bustle: the stowage basket on its tail, the side bins, eyes, whips, numbers
  bustleBasket(P, T, -2.65, -3.00, 0.60, 2.00, 2.42, 476);
  for (const side of [-1, 1]) {
    const z0 = -1.55, z1 = -2.45, y = 2.12;
    const x = side * (castSideAt(T.stations, y, (z0 + z1) / 2) + 0.10);
    P.add('turretDetail', box(0.18, 0.30, z0 - z1), x, L.y(y + 0.05), L.z((z0 + z1) / 2));
    P.add('turretDark', box(0.19, 0.025, z0 - z1 + 0.01), x, L.y(y + 0.21), L.z((z0 + z1) / 2));
  }
  liftEyes(P, T, [-0.30, -1.70], 0.75);
  antennaWhips(P, T, [[0.55, -1.75], [-0.55, -1.85]], 0.78, 478);
  bustleNumbers(P, T, -2.05, 0.50, 0.22);
  yield 'm47TurretFittings';
  const G = M47_GUN;
  P.gunG.position.set(0, G.axisY - T.ringY, G.trunnionZ - T.ringZ);
  // the narrow curved gun shield in the nose, its coax and sight ports
  P.addGunExtra(rotorShield(0.44, 0.12, 0.58, -0.55, 0.55, P.q), 0, 0, 0);
  P.addGunExtraDark(box(0.06, 0.06, 0.04), 0.20, 0.02, 0.395);
  P.addGunExtraDark(box(0.07, 0.07, 0.04), -0.21, 0.08, 0.385);
  P.addGunExtra(cylZ(0.14, 0.18, P.q ? 18 : 10, 0.16), 0, 0, 0.47);
  pattonGun(P, G);
  P.topY = L.y(3.35) + 0.12;
  yield 'm47Gun';
}

const M47_HULL_SPEC: PershingHullSpec = {
  mark: 'm47', tailZ: -4.18, toe: [2.15, 1.12], knee: [1.28, 1.62], bellyFrontZ: 1.36, bellyRearZ: -3.25, bellyY: 0.47,
  deckY: 1.62, engineDeckY: 1.65, engineDeckZ: -1.32, tailTopY: 1.52, tailBotY: 0.70,
  sponsonHW: 1.45, sponsonY: 1.13, fenderHW: 1.756, fenderY: 1.56, trackW: 0.584, xc: 1.397,
  gear: {
    wheelR: 0.33, wheelY: 0.36, span: [0.78, -2.70], rollerN: 3, rollerY: 1.04, rollerSpan: [0.25, -2.15],
    idler: { z: 1.78, y: 0.80, r: 0.33 }, sprocket: { z: -3.78, y: 0.92, r: 0.33 },
    tension: { z: -3.25, y: 0.52, r: 0.20 }, contactZF: 1.00, contactZR: -2.85,
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
// M48A5 Patton
// ---------------------------------------------------------------------------------------------------------------------

const M48_RING = { y: 1.595, z: 0.48 };
// The elliptical cast dome of the supplied A5 (docs/references/tanks/m48a5_patton.md): 2.40 m wide over the ring, the
// egg nose at z 1.86 round the gun shield, the tail rolled under the bustle rack at -1.14; floor 1.84, roof 2.64.
const M48_TURRET: readonly CastStation[] = [
  { z: 1.86, bot: 1.92, top: 2.08, hw: 0.32, roof: 0.30, foot: 0.80, waist: 0.30, nUp: 2.0, nLo: 3 },
  { z: 1.76, bot: 1.87, top: 2.24, hw: 0.60, roof: 0.34, foot: 0.84, waist: 0.30, nUp: 2.1, nLo: 3 },
  { z: 1.56, bot: 1.85, top: 2.39, hw: 0.86, roof: 0.38, foot: 0.86, waist: 0.30, nUp: 2.2, nLo: 3.5 },
  { z: 1.25, bot: 1.84, top: 2.51, hw: 1.02, roof: 0.42, foot: 0.88, waist: 0.32, nUp: 2.3, nLo: 4 },
  { z: 0.90, bot: 1.84, top: 2.59, hw: 1.12, roof: 0.45, foot: 0.90, waist: 0.32, nUp: 2.3, nLo: 4 },
  { z: 0.45, bot: 1.84, top: 2.63, hw: 1.18, hwL: 1.15, roof: 0.47, foot: 0.90, waist: 0.32, nUp: 2.3, nLo: 4 },
  { z: 0.00, bot: 1.84, top: 2.64, hw: 1.20, hwL: 1.16, roof: 0.47, foot: 0.90, waist: 0.32, nUp: 2.3, nLo: 4 },
  { z: -0.45, bot: 1.84, top: 2.62, hw: 1.15, hwL: 1.12, roof: 0.45, foot: 0.90, waist: 0.33, nUp: 2.3, nLo: 4 },
  { z: -0.80, bot: 1.85, top: 2.54, hw: 1.02, roof: 0.42, foot: 0.88, waist: 0.35, nUp: 2.2, nLo: 3.5 },
  { z: -1.02, bot: 1.87, top: 2.44, hw: 0.82, roof: 0.38, foot: 0.86, waist: 0.38, nUp: 2.1, nLo: 3 },
  { z: -1.14, bot: 1.91, top: 2.30, hw: 0.52, roof: 0.32, foot: 0.82, waist: 0.40, nUp: 2.0, nLo: 3 },
];

interface M48HullSpec {
  readonly gear: GearSpec;
}

/** The cast boat hull: rounded bow under a single glacis, sloped sponson sides, the flat deck and the grille-door rear. */
function* m48HullSteps(P: CastPort, H: M48HullSpec): Generator<string, HullFrame> {
  const { box, cylY, cylZ } = KIT;
  const deck = 1.80, belly = 0.43, xc = 1.4605, trackW = 0.711;
  // the boat bow: z, deck/glacis top, floor, half-width at the deck edge
  const bow: readonly (readonly [number, number, number, number])[] = [
    [3.46, 1.06, 0.98, 0.92], [3.36, 1.20, 0.80, 1.14], [3.12, 1.40, 0.62, 1.36], [2.80, 1.60, 0.50, 1.48], [2.38, 1.79, 0.44, 1.52],
  ];
  const deckAt = (z: number): number => {
    if (z > 2.38) {
      for (let i = bow.length - 1; i > 0; i--) {
        const [za, ya] = bow[i], [zb, yb] = bow[i - 1];
        if (z >= za && z <= zb) return ya + (yb - ya) * ((z - za) / (zb - za));
      }
      return bow[0][1];
    }
    if (z < -2.98) return deck - (deck - 1.70) * Math.min(1, (-2.98 - z) / 0.38);
    return deck;
  };
  // lower hull vertical inside the track lanes to 1.34 (over the return run), the sponsons out to 1.62 above it
  const lw = xc - trackW / 2 - 0.035;
  const st: HullStation[] = [];
  st.push({ z: -3.38, bot: 1.02, top: 1.70, hwTop: 1.44, hw: 1.52, hwBot: lw - 0.05, yK: 1.30, yW: 1.40, roll: 0.30 });
  st.push({ z: -3.26, bot: 0.80, top: 1.76, hwTop: 1.50, hw: 1.58, hwBot: lw - 0.02, yK: 1.34, yW: 1.42, roll: 0.30 });
  st.push({ z: -2.95, bot: 0.50, top: deck, hwTop: 1.52, hw: 1.62, hwBot: lw, yK: 1.34, yW: 1.42, roll: 0.30 });
  st.push({ z: -2.60, bot: belly, top: deck, hwTop: 1.52, hw: 1.62, hwBot: lw, yK: 1.34, yW: 1.42, roll: 0.30 });
  st.push({ z: 2.00, bot: belly, top: deck, hwTop: 1.52, hw: 1.62, hwBot: lw, yK: 1.34, yW: 1.42, roll: 0.30 });
  for (const [z, top, bot, hwt] of [...bow].reverse()) {
    const yK = Math.min(1.34, bot + (top - bot) * 0.55), yW = Math.min(1.42, bot + (top - bot) * 0.75);
    st.push({ z, bot, top, hwTop: hwt - 0.04, hw: Math.min(1.62, hwt + 0.06), hwBot: Math.min(lw, hwt * 0.80), yK, yW,
      roll: z > 3.0 ? 0.6 : 0.4 });
  }
  P.add('hull', hullSolid(st, P.q));
  yield 'm48HullCasting';
  // fenders: full length at 1.70, the bow ends ramping down over the idlers, the rear ends over the sprockets
  for (const side of [-1, 1]) {
    const [a, b] = side > 0 ? [1.50, 1.815] : [-1.815, -1.50];
    P.add('hull', fenderRun(a, b, [[-3.38, 1.66], [-3.00, 1.78], [2.40, 1.78], [3.20, 1.60], [3.55, 1.40]], 0.03));
    P.add('hullDetail', box(0.02, 0.06, 5.4), side * 1.806, 1.745, -0.30);
  }
  yield 'm48HullFenders';
  // fender stowage: the rear bins on both fenders, the tool box ahead of the right sponson
  for (const [side, z0, z1, h] of [[1, -1.95, -3.05, 0.20], [-1, -1.95, -3.05, 0.20], [-1, 2.05, 1.30, 0.18], [1, -0.90, -1.45, 0.16]] as const) {
    P.add('hullDetail', moldedBox(0.30, h, z0 - z1, 0.02, P.q ? 2 : 1, 0.01), side * 1.66, 1.78 + h / 2, (z0 + z1) / 2);
  }
  yield 'm48HullBins';
  // bow: driver's hatch and periscopes on the centre line, the headlight groups on the fender ends, tow eyes
  P.add('hull', cylY(0.33, 0.34, 0.05, P.q ? 22 : 12), 0, deck + 0.025, 1.90);
  P.add('hullDetail', cylY(0.29, 0.30, 0.03, P.q ? 22 : 12), 0, deck + 0.06, 1.90);
  for (const dx of [-0.24, 0, 0.24]) KIT.periscope(P, 'hullDetail', dx, deck + 0.05, 2.17, 0);
  for (const side of [-1, 1]) {
    const lights = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.15, r: 0.062, rake: -0.18,
      seed: side > 0 ? 481 : 483, nightKind: 'headlight' });
    lights.position.set(side * 1.62, 1.62, 2.95);
    P.hullG.add(lights);
    P.add('hullDark', box(0.06, 0.12, 0.06), side * 1.62, 1.56, 2.95);
    KIT.liftEye(P, 'hullDetail', side * 0.68, 1.12, 3.27, 0);
  }
  yield 'm48HullBow';
  // engine deck: two grille fields, the top access doors and their handles
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(1.02, 0.02, 1.25), side * 0.68, deck + 0.01, -1.65);
    for (let i = 0; i < 9; i++) P.add('hullDark', box(0.92, 0.012, 0.03), side * 0.68, deck + 0.022, -1.12 - i * 0.13);
    P.add('hullDetail', box(1.02, 0.02, 0.55), side * 0.68, deck + 0.01, -2.62);
  }
  yield 'm48HullDeck';
  // rear: the grille doors on the upper rear plate, tail lights, the towing pintle, the infantry phone box
  const rearZ = -3.25;
  P.add('hullDetail', box(2.10, 0.42, 0.04), 0, 1.36, rearZ - 0.005, -0.25, 0, 0);
  for (let i = 0; i < 6; i++) P.add('hullDark', box(1.96, 0.022, 0.02), 0, 1.20 + i * 0.065, rearZ - 0.02 - i * 0.016, -0.25, 0, 0);
  for (const side of [-1, 1]) {
    KIT.headlight(P, side * 1.08, 1.30, -3.33, Math.PI, 0.045, false);
    KIT.liftEye(P, 'hullDetail', side * 0.82, 0.94, -3.30, Math.PI);
  }
  P.add('hullDark', box(0.14, 0.10, 0.12), 0, 0.98, -3.32);
  P.add('hullDetail', box(0.20, 0.22, 0.10), 0.62, 1.05, -3.30);
  yield 'm48HullRear';
  pattonGear(P, xc, trackW, H.gear);
  for (const [fz, fy0, fy1] of [[3.40, 0.98, 1.24], [-3.34, 1.24, 1.58]] as const) {
    for (const side of [-1, 1]) {
      MUDGUARDS.add(P, {
        label: `patton-cast-${fz < 0 ? 'rear' : 'front'}-flap-${side}`, x: side * xc, y: (fy0 + fy1) / 2, z: fz,
        thickness: 0.03, length: trackW * 0.92, height: fy1 - fy0, material: 'rubber', rotation: [0, Math.PI / 2, 0],
        crown: 0.012, frontCut: 0.025, rearCut: 0.018,
      });
    }
  }
  yield 'm48HullGear';
  void cylZ;
  return { xc, trackW, deckAt };
}

const M48_GEAR: GearSpec = {
  wheelR: 0.33, wheelY: 0.43, span: [1.97, -2.01], rollerN: 5, rollerY: 1.15, rollerSpan: [1.44, -1.78],
  idler: { z: 2.79, y: 0.89, r: 0.30 }, sprocket: { z: -2.89, y: 1.07, r: 0.30 },
  contactZF: 2.15, contactZR: -2.20, botY: 0.045,
};

function* m48TurretSteps(P: CastPort): TankProfileBuild {
  const { box, cylX, cylY, cylZ } = KIT;
  const T: TurretFrame = { ringY: M48_RING.y, ringZ: M48_RING.z, stations: M48_TURRET };
  const L = tl(T);
  P.turretG.position.set(0, T.ringY, T.ringZ);
  P.add('turret', castSolid(M48_TURRET, P.q, T.ringZ, T.ringY));
  P.add('turretDark', cylY(1.00, 1.00, 0.70, P.q ? 24 : 12), 0, L.y(1.22), L.z(0.40));
  yield 'm48TurretCasting';
  // roof: the low-profile (Israeli-designed) cupola on the right with the commander's M60D, the loader's hatch on the
  // left with his M60D, the gunner's sight hood forward on the right, the ventilator
  const cupTop = visionCupola(P, T, -0.60, 0.12, 0.42, 0.20, 8);
  roofM2(P, T, -0.60, 0.30, cupTop + 0.04, { cls: 'mag', barrel: 0.60, scale: 0.95, seed: 485 });
  const hatchTop = loaderHatch(P, T, 0.55, -0.22, 0.31);
  roofM2(P, T, 0.62, -0.02, hatchTop + 0.05, { cls: 'mag', scale: 0.95, seed: 486 });
  roofScope(P, T, -0.62, 1.10, 0, 0.12);
  roofScope(P, T, 0.30, 0.78, 0, 0.06);
  ventilator(P, T, 0.05, -0.62, 0.12);
  yield 'm48TurretRoof';
  // the bustle rack wrapping the rear, side stowage boxes
  bustleBasket(P, T, -0.50, -1.72, 1.20, 1.96, 2.34, 488);
  for (const side of [-1, 1]) {
    const z0 = 0.30, z1 = -0.55, y = 2.02;
    const x = side * (castSideAt(M48_TURRET, y, (z0 + z1) / 2) + 0.12);
    P.add('turretDetail', moldedBox(0.22, 0.30, z0 - z1, 0.02, P.q ? 2 : 1, 0.01), x, L.y(y), L.z((z0 + z1) / 2));
  }
  liftEyes(P, T, [0.95, -0.70], 0.55);
  antennaWhips(P, T, [[0.85, -0.55], [-0.95, -0.62]], 0.80, 491);
  bustleNumbers(P, T, -0.20, 0.42, 0.26);
  yield 'm48TurretFittings';
  // gun: the trunnion at 2.10 (the owner's 2026-10-26 mantlet fix); the compact cast shield, the canvas cover to the
  // root, the AN/VSS-1 searchlight riding the shield
  P.gunG.position.set(0, 2.10 - T.ringY, 1.514 - T.ringZ);
  P.addGunExtra(moldedBox(0.90, 0.46, 0.24, 0.09, P.q ? 3 : 2, 0.05), 0, 0.05, 0.25);
  P.addGunExtra(KIT.xform(cylX(0.18, 0.80, P.q ? 20 : 12), 0, 0, 0), 0, 0.0, 0.08);
  P.addGunExtraDark(box(0.07, 0.07, 0.03), 0.28, 0.06, 0.375);
  P.addGunExtraDark(box(0.09, 0.08, 0.03), -0.30, 0.12, 0.375);
  P.add('gunMountCloth', cylZ(0.12, 0.30, P.q ? 16 : 10, 0.17), 0, 0.0, 0.52);
  for (const z of [0.46, 0.60]) P.add('gunMountCloth', cylZ(0.176 - (z - 0.40) * 0.18, 0.025, P.q ? 16 : 10), 0, 0.0, z);
  P.addGunExtraDark(cylZ(0.13, 0.05, 12), 0, 0, 0.695);
  // AN/VSS-1: the drum housing with its armoured shutter on brackets over the tube, ahead of the shield
  P.addGunExtra(moldedBox(0.46, 0.28, 0.46, 0.05, P.q ? 2 : 1, 0.03), 0, 0.34, 0.68);
  P.addGunExtraDark(box(0.36, 0.20, 0.02), 0, 0.34, 0.915);
  for (const side of [-1, 1]) P.addGunExtra(box(0.04, 0.16, 0.30), side * 0.16, 0.18, 0.50);
  const len = 4.40;
  KIT.buildGun(P, { len, r: 0.077, sleeve: false, evac: null, evacR: 1.62, collar: false, baseR: 0.13 });
  { // M68 bore evacuator, two fifths of the way out
    const seg = P.q ? 20 : 12;
    P.add('gun', cylZ(0.128, 0.50, seg), 0, 0, 2.33);
    P.add('gun', cylZ(0.128, 0.06, seg, 0.094), 0, 0, 2.05);
    P.add('gun', cylZ(0.094, 0.06, seg, 0.128), 0, 0, 2.61);
  }
  muzzleBore(P, { len, r: 0.077 });
  P.muzzleZ = len;
  P.topY = L.y(3.06) + 0.12;
  yield 'm48Gun';
}

export function* buildM48A5CastSteps(P: CastPort): TankProfileBuild {
  yield* m48HullSteps(P, { gear: M48_GEAR });
  yield* m48TurretSteps(P);
  publishReceipt(P, {
    mark: 'm48a5', ring: [M48_RING.y, M48_RING.z], trunnion: [2.10, 1.514], muzzleZ: 1.514 + 4.40, device: 'none',
    evacuator: [1.514 + 2.05, 1.514 + 2.61], roadWheels: 6, wheelR: M48_GEAR.wheelR, returnRollers: M48_GEAR.rollerN,
    tensionWheel: Boolean(M48_GEAR.tension), trackW: 0.711, trackCentres: 1.4605 * 2, glacisFromVerticalDeg: glacisDeg([3.36, 1.20], [2.38, 1.79]),
  });
}
