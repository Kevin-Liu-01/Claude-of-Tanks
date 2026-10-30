// Merkava family hull and running gear (release 262). One construction for the six marks: a front-engine hull lofted
// from its measured courses (merkavaFamilyMarks.ts: the deck, the engine deck and nose, the belly, the raked stern),
// sponsons over the tracks from the lower hull's side out to their measured width, between their measured undersides
// and tops, fenders over the track ends, the stern door, and the running gear at the source's stations: six road wheels
// a side, the return rollers at their own heights and sizes, the front sprocket and rear idler; the front fender boxes
// over the sprockets and the nose's hooks, brackets and rails as measured. Skirts, sponson boxes and the rest of the kit
// are the measured detail parts (merkavaFamilyDetails.ts). Hull frame: ground y = 0, +Z the
// nose, +X the vehicle's left.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { merkavaDishedFaceLayers } from '../nationWheelConstructions.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** [z, y] along the hull. */
export type HullLinePoint = readonly [z: number, y: number];

export interface MerkavaHullSpec {
  /** The centre hull's top course, stern to nose: the raked stern, the deck, the engine deck and the nose. */
  readonly top: readonly HullLinePoint[];
  /** The bottom course, stern to nose: the lower stern plate, the belly and the lower glacis. */
  readonly bottom: readonly HullLinePoint[];
  /** The sponsons' top course over the tracks, stern to nose (the fenders follow it past the sponsons' ends). */
  readonly sponsonTop: readonly HullLinePoint[];
  /** The sponsons' underside over the track's top run. */
  readonly sponsonUnderY: number;
  /** Half-width of the lower hull between the tracks and of the sponsons; the lower hull narrows along `noseTaper` [z,
   *  half-width] toward the nose. */
  readonly lowerHalfWidth: number;
  readonly noseTaper: readonly HullLinePoint[];
  readonly upperHalfWidth: number;
  /** The rear door: centre height, width, height (on the stern plate); null where the source's door leaves are its own
   *  measured parts (the Mk 1 and Mk 2). */
  readonly rearDoor: readonly [y: number, width: number, height: number] | null;
  /** The exhaust louvre on the right hull side: its panel's z0 and z1, its vanes' first and last z and their y0 and y1
   *  (eight vertical vanes); null where the source shows none (the Mk 4's is under its side plates). */
  readonly exhaust: readonly [z0: number, z1: number, vane0: number, vane1: number, y0: number, y1: number] | null;
  /** The raised front plate on the glacis's -X side (the Mk 1 to Mk 3): its top course from its back edge to the nose
   *  and its inboard edge's x along z (the step runs diagonally to the nose); null where the glacis is one course. */
  readonly raisedPlate: { readonly top: readonly HullLinePoint[]; readonly stepX: readonly HullLinePoint[] } | null;
  readonly nose: MerkavaNoseFittings;
}

/** The nose's fittings as measured on the source's hull plates (at +X and mirrored, but for the shackle). */
export interface MerkavaNoseFittings {
  /** The tow hooks: x; the base bracket along the lower plate from (y0, z0) to (y1, z1); the hook forward to tipZ. */
  readonly hook: readonly [x: number, y0: number, z0: number, y1: number, z1: number, tipZ: number];
  /** The brackets standing on the lower plate: their x and the run they lie along it, (y0, z0) to (y1, z1). */
  readonly lugXs: readonly number[];
  readonly lugRun: readonly [y0: number, z0: number, y1: number, z1: number];
  /** The paired guard rails on the glacis: their x and z run. */
  readonly railXs: readonly number[];
  readonly railRun: readonly [z0: number, z1: number];
  /** The towing shackle under the +X lower plate: x, its loop's bottom and top, z. */
  readonly shackle: readonly [x: number, y0: number, y1: number, z: number] | null;
}

/** The front fender box over a sprocket as measured (the +X box; the -X box mirrors it): its inboard and outboard x, its
 *  z from the sponson's end to its front plate, its top plate's height at each, its side and front plates' lower edge
 *  and the z where the side plate reaches it. */
export interface MerkavaFender {
  readonly xi: number; readonly xo: number; readonly z0: number; readonly z1: number;
  readonly top0: number; readonly top1: number; readonly bottom: number; readonly side0: number;
}

export interface MerkavaGearSpec {
  readonly wheelR: number;
  readonly wheelW: number;
  readonly axleY: number;
  /** Six stations, stern to nose. */
  readonly wheelZs: readonly number[];
  readonly sprocket: { readonly z: number; readonly y: number; readonly r: number };
  readonly idler: { readonly z: number; readonly y: number; readonly r: number };
  /** Return rollers: z, axle height, radius. */
  readonly rollers: readonly (readonly [z: number, y: number, r: number])[];
  readonly trackW: number;
  readonly trackTh: number;
  /** The track's centre off the centreline. */
  readonly trackX: number;
}

/** Linear interpolation over a [z, y] line (held past its ends). */
export function lineAt(line: readonly HullLinePoint[], z: number): number {
  if (z <= line[0]![0]) return line[0]![1];
  for (let k = 1; k < line.length; k++) {
    const [z1, y1] = line[k]!;
    if (z <= z1) {
      const [z0, y0] = line[k - 1]!;
      return y0 + (y1 - y0) * ((z - z0) / Math.max(1e-9, z1 - z0));
    }
  }
  return line[line.length - 1]![1];
}

const mirror = (ring: SectionPoint[]): SectionPoint[] => ring.map(([x, y]): SectionPoint => [-x, y]).reverse();

function stationZs(lines: readonly (readonly HullLinePoint[])[], z0: number, z1: number): number[] {
  const zs = new Set<number>([z0, z1]);
  for (const line of lines) for (const [z] of line) if (z > z0 && z < z1) zs.add(z);
  return [...zs].sort((a, b) => a - b);
}

/** The glacis's height over (x, z): the -X side's raised front plate inboard of its step, else the top course. */
function deckAt(spec: MerkavaHullSpec, x: number, z: number): number {
  const r = spec.raisedPlate, top = lineAt(spec.top, z);
  return r && z >= r.top[0]![0] && x < lineAt(r.stepX, z) ? Math.max(top, lineAt(r.top, z)) : top;
}

/** The central hull: the lower hull between the tracks, from the belly to the deck, lofted along its courses; on the
 *  Mk 1 to Mk 3 the glacis's -X side stands on its raised front plate, stepped up along the plate's inboard edge. */
function centralHull(spec: MerkavaHullSpec): THREE.BufferGeometry {
  const bevel = 0.05, taper = spec.noseTaper, raised = spec.raisedPlate;
  const z0 = Math.max(spec.top[0]![0], spec.bottom[0]![0]);
  const z1 = Math.min(spec.top[spec.top.length - 1]![0], spec.bottom[spec.bottom.length - 1]![0]);
  const lines = [spec.top, spec.bottom, taper, ...(raised ? [raised.top, raised.stepX] : [])];
  const sections: SolidSection[] = stationZs(lines, z0, z1).map((z) => {
    const top = lineAt(spec.top, z), xs = raised ? lineAt(raised.stepX, z) : 0;
    const high = Math.max(top, deckAt(spec, xs - 0.02, z)), bot = Math.min(lineAt(spec.bottom, z), top - 0.01);
    const hw = z >= taper[0]![0] ? Math.min(spec.lowerHalfWidth, lineAt(taper, z)) : spec.lowerHalfWidth;
    const b = Math.min(bevel, (top - bot) * 0.3, hw * 0.3);
    const ring: SectionPoint[] = [
      [-hw + b, bot], [hw - b, bot], [hw, bot + b], [hw, top - b * 0.6], [hw - b * 0.6, top], [xs + 0.01, top],
      [xs - 0.01, high], [-hw + b * 0.6, high], [-hw, high - b * 0.6], [-hw, bot + b],
    ];
    return { z, ring };
  });
  return sectionSolid(sections, { sideQuadDiagonal: 'convex' });
}

/** The z range where the sponson stands at least `minDepth` over its underside (past it the fenders run on). */
export function sponsonRange(spec: MerkavaHullSpec, minDepth = 0.12): [number, number] {
  const line = spec.sponsonTop, z0 = line[0]![0], z1 = line[line.length - 1]![0];
  const depth = (z: number): number => lineAt(line, z) - spec.sponsonUnderY;
  let a = z0, b = z1;
  while (a < z1 && depth(a) < minDepth) a += 0.01;
  while (b > a && depth(b) < minDepth) b -= 0.01;
  return [Math.round(a * 100) / 100, Math.round(b * 100) / 100];
}

/** A sponson: from inside the lower hull's side out to the sponson's width, between its underside and its top course. */
function sponson(spec: MerkavaHullSpec, side: 1 | -1, z0: number, z1: number): THREE.BufferGeometry {
  const xi = spec.lowerHalfWidth - 0.03, xo = spec.upperHalfWidth, under = spec.sponsonUnderY;
  const sections: SolidSection[] = stationZs([spec.sponsonTop], z0, z1).map((z) => {
    const top = Math.max(lineAt(spec.sponsonTop, z), under + 0.06);
    const ring: SectionPoint[] = [[xi, under], [xo - 0.02, under], [xo, under + 0.02], [xo, top - 0.02], [xo - 0.025, top], [xi, top]];
    return { z, ring: side > 0 ? ring : mirror(ring) };
  });
  return sectionSolid(sections, { sideQuadDiagonal: 'convex' });
}

/** A fender plate over a track end: 4 cm of steel under the sponson course, across the track, from z0 to z1. */
function fender(spec: MerkavaHullSpec, side: 1 | -1, z0: number, z1: number): THREE.BufferGeometry {
  const xi = spec.lowerHalfWidth - 0.03, xo = spec.upperHalfWidth;
  return sectionSolid(stationZs([spec.sponsonTop], z0, z1).map((z) => {
    const top = lineAt(spec.sponsonTop, z);
    const ring: SectionPoint[] = [[xi, top - 0.045], [xo, top - 0.045], [xo, top - 0.005], [xi, top - 0.005]];
    return { z, ring: side > 0 ? ring : mirror(ring) };
  }));
}

/** A front fender box over the sprocket: its sloped top plate, front plate, outboard side plate (raked up to the top
 *  plate's back edge) and the inboard plate's upper band; 2 cm steel. The outboard front corner is bent round in plan,
 *  as the sources' boxes are (a quarter turn of up to 22 cm): the top plate's edge follows the bend, which is five
 *  plates along its chords between the side plate and the front plate.
 *  The box keeps clear of the track (the strict clip, tools/track-clip-audit.mjs --exact --strict: the belt's 2 cm
 *  cells dilated one cell, which over the sprocket reach 0.41 m from its centre and out to 2 cm past the track's outer
 *  edge): the side plate's inner face stands 2.2 cm past that edge, the top plate's nose rises until its underside
 *  clears the sprocket's radius and 6 cm, and a corner chord over the belt stops short of it. The Mk 1-3 sources' boxes
 *  sit flush on their 0.64 m track (their side plates 0.5 cm off its edge, their noses 3-4 cm into the wrap); the Mk 4B's
 *  narrower track leaves its box as measured. */
function fenderBox(f0: MerkavaFender, side: 1 | -1, gear: MerkavaGearSpec): THREE.BufferGeometry[] {
  const t = 0.02, { z: sz, y: sy } = gear.sprocket, clear = gear.sprocket.r + 0.06, edgeX = gear.trackX + gear.trackW / 2;
  const wrap = (z: number): number => sy + Math.sqrt(Math.max(0, clear * clear - (z - sz) ** 2));
  let top1 = f0.top1;
  for (let k = 1; k <= 40; k++) {
    const z = f0.z0 + (f0.z1 - f0.z0) * (k / 40);
    if (Math.abs(z - sz) < clear) top1 = Math.max(top1, f0.top0 + (wrap(z) + t - f0.top0) / (k / 40));
  }
  const f: MerkavaFender = { ...f0, xo: Math.max(f0.xo, edgeX + 0.022 + t), top1 };
  const topAt = (z: number): number => f.top0 + (f.top1 - f.top0) * ((z - f.z0) / Math.max(1e-6, f.z1 - f.z0));
  const plate = (stations: readonly (readonly [z: number, x0: number, x1: number, y0: number, y1: number])[]): THREE.BufferGeometry =>
    sectionSolid(stations.map(([z, x0, x1, y0, y1]) => {
      const ring: SectionPoint[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      return { z, ring: side > 0 ? ring : mirror(ring) };
    }));
  // the bend's radius and centre (cx, cz); the top plate's outboard edge at z
  const r = Math.min(0.22, (f.xo - f.xi) * 0.35, (f.z1 - f.side0) * 0.8), cx = f.xo - r, cz = f.z1 - r;
  const edge = (z: number): number => (z <= cz ? f.xo : cx + Math.sqrt(Math.max(0, r * r - (z - cz) ** 2)));
  const topZs = [f.z0, cz, ...Array.from({ length: 6 }, (_, k) => cz + r * Math.sin(((k + 1) / 7) * Math.PI / 2)), f.z1];
  const parts = [
    plate(topZs.map((z) => [z, f.xi, edge(z), topAt(z) - t, topAt(z)] as const)),
    plate([[f.z1 - t, f.xi, cx, f.bottom, topAt(f.z1 - t) - t], [f.z1, f.xi, cx, f.bottom, f.top1 - t]]),
    plate([[f.z0, f.xo - t, f.xo, f.top0 - 0.10, f.top0 - t], [f.side0, f.xo - t, f.xo, f.bottom, topAt(f.side0) - t],
      [cz, f.xo - t, f.xo, f.bottom, topAt(cz) - t]]),
    plate([[f.z0, f.xi, f.xi + t, f.top0 - 0.25, f.top0 - t], [f.z1 - t, f.xi, f.xi + t, Math.max(f.bottom, f.top1 - 0.25), topAt(f.z1 - t) - t]]),
  ];
  for (let k = 0; k < 5; k++) {
    const a0 = (k / 5) * Math.PI / 2, a1 = ((k + 1) / 5) * Math.PI / 2, am = (a0 + a1) / 2;
    const x0 = cx + r * Math.cos(a0), z0 = cz + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), z1 = cz + r * Math.sin(a1);
    const xm = (x0 + x1) / 2 - (t / 2) * Math.cos(am), zm = (z0 + z1) / 2 - (t / 2) * Math.sin(am);
    // over the belt (inboard of its edge's clearance, short of the wrap's front) the chord stops above the wrap
    const bottom = Math.min(x0, x1) - t < edgeX + 0.022 && Math.min(z0, z1) < sz + clear ? Math.max(f.bottom, wrap(Math.min(z0, z1))) : f.bottom;
    const h = topAt(zm) - t - bottom, ry = Math.atan2(x1 - x0, z1 - z0);
    parts.push(KIT.xform(KIT.box(t, h, Math.hypot(x1 - x0, z1 - z0) + 0.006), side * xm, bottom + h / 2, zm, 0, side * ry, 0));
  }
  return parts;
}

/** Hull body: the central loft, the two sponsons and the fenders over the track ends in 'hull'; the front fender boxes
 *  over the sprockets in 'hullDetail'. */
export function buildMerkavaHullBody(P: TankBuilderPort, spec: MerkavaHullSpec, gear: MerkavaGearSpec,
  box: MerkavaFender | null): void {
  P.add('hull', centralHull(spec));
  // the sponsons run on to the fender boxes, over the glacis's last shallow course
  const [z0, zEnd] = sponsonRange(spec), z1 = box ? Math.max(zEnd, box.z0 + 0.02) : zEnd;
  const line = spec.sponsonTop, tail = line[0]![0], nose = line[line.length - 1]![0];
  for (const side of [1, -1] as const) {
    P.add('hull', sponson(spec, side, z0, z1));
    if (!box && z1 < nose - 0.05) P.add('hull', fender(spec, side, z1 - 0.02, nose));
    if (z0 > tail + 0.05) P.add('hull', fender(spec, side, tail, z0 + 0.02));
    // the fender boxes are sheet steel over the sprockets, not armour
    if (box) for (const g of fenderBox(box, side, gear)) P.add('hullDetail', g);
    // the front mudflap hung under the fender's nose
    const flapZ = box ? box.z1 - 0.03 : nose - 0.05, flapY = box ? box.bottom - 0.10 : lineAt(line, flapZ) - 0.15;
    P.hangMudguard(`merkavaBowFlap${side > 0 ? 'L' : 'R'}`, 'hullRubber', KIT.box(gear.trackW * 0.95, 0.20, 0.012),
      side * gear.trackX, flapY, flapZ);
  }
}

/** A station of the belly's add-on armour plate: z, its underside and top, its half-width. */
export type BellyStation = readonly [z: number, y0: number, y1: number, halfWidth: number];

/** The belly's add-on armour plate (the 2D and Baz): lofted through its measured stations under the belly and up the
 *  lower plate, removable hull armour. */
export function buildMerkavaBelly(P: TankBuilderPort, stations: readonly BellyStation[]): void {
  const sections: SolidSection[] = stations.map(([z, y0, y1, hw]) => ({ z, ring: [[-hw, y0], [hw, y0], [hw, Math.max(y1, y0 + 0.01)], [-hw, Math.max(y1, y0 + 0.01)]] }));
  P.addExternalArmor('hull', sectionSolid(sections));
}

/** The nose's fittings (MerkavaNoseFittings): the tow hooks on their brackets, the brackets standing on the lower plate
 *  with their pins, the guard rails down the glacis and the towing shackle. */
export function buildMerkavaNose(P: TankBuilderPort, spec: MerkavaHullSpec): void {
  const { box, cylX, torus, xform } = KIT, n = spec.nose;
  // a bar lying along the plate from (y0, z0) to (y1, z1), standing d off it (out: +1 forward and down off the lower
  // plate, -1 up off the glacis)
  const along = (bucket: string, x: number, y0: number, z0: number, y1: number, z1: number, w: number, d: number, out = 1): void => {
    const dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dy, dz), uy = dy / len, uz = dz / len;
    P.add(bucket, box(w, len, d), x, (y0 + y1) / 2 - out * uz * d / 2, (z0 + z1) / 2 + out * uy * d / 2, Math.atan2(uz, uy), 0, 0);
  };
  const [hx, hy0, hz0, hy1, hz1, tipZ] = n.hook, [ly0, lz0, ly1, lz1] = n.lugRun;
  for (const side of [1, -1]) {
    // the tow hook: its bracket on the lower plate, the hook's body forward of the plate and its curled tip
    along('hullDetail', side * hx, hy0, hz0, hy1, hz1, 0.10, 0.07);
    const hy = hy1 - 0.08, len = tipZ - 0.05 - (hz1 - 0.03);
    P.add('hullDetail', box(0.075, 0.075, len), side * hx, hy, hz1 - 0.03 + len / 2);
    P.add('hullDetail', xform(torus(0.042, 0.02, 14, 8), 0, 0, 0, 0, 0, Math.PI / 2), side * hx, hy - 0.035, tipZ - 0.05);
    for (const x of n.lugXs) {
      along('hullDetail', side * x, ly0, lz0, ly1, lz1, 0.07, 0.05);
      for (const t of [0.3, 0.85]) {
        const y = ly0 + (ly1 - ly0) * t, z = lz0 + (lz1 - lz0) * t;
        P.add('hullDark', cylX(0.018, 0.10, 10), side * x, y - 0.03, z + 0.03);
      }
    }
    const [rz0, rz1] = n.railRun;
    for (const x of n.railXs) along('hullDetail', side * x, deckAt(spec, side * x, rz0), rz0, deckAt(spec, side * x, rz1), rz1, 0.035, 0.05, -1);
  }
  if (n.shackle) {
    const [sx, sy0, sy1, sz] = n.shackle, r = (sy1 - sy0) / 2;
    P.add('hullDetail', box(0.19, 0.07, 0.07), sx, sy1 + 0.035, sz);
    P.add('hullDark', xform(torus(r, 0.014, 16, 8), 0, 0, 0, Math.PI / 2, 0, 0), sx, sy0 + r, sz + 0.02);
  }
}

/** The running gear at the source's stations, the Israel MBT dished face on the road wheels (nationWheelConstructions.ts). */
export function buildMerkavaRunningGear(P: TankBuilderPort, gear: MerkavaGearSpec): void {
  const faceHalf = Math.min(0.23, gear.trackW * 0.37) / 2;
  const layers = merkavaDishedFaceLayers(gear.wheelR, faceHalf, Boolean(P.q)).map((layer) => ({
    geometry: layer.geometry, material: layer.paint === 'dark' ? P.mats.dark : P.mats.wheels,
    outset: layer.outset, name: layer.name, appearanceRole: layer.role,
  }));
  const topRun = Math.max(...gear.rollers.map(([, y, r]) => y + r)) + gear.trackTh * 0.5;
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: gear.wheelR, wheelW: faceHalf * 2, wheelY: gear.axleY, xc: gear.trackX,
    wheelZs: [...gear.wheelZs],
    sprocket: { ...gear.sprocket }, idler: { ...gear.idler },
    rollers: gear.rollers.map(([z, y, r]) => ({ z, y, r })),
    trackW: gear.trackW, trackTh: gear.trackTh, topY: topRun,
    paintedEnds: true, coveredTop: true, arms: true, suspensionPattern: 'paired-bogie',
    armBucket: 'hullRunningGearDetail', linkPitchM: 0.115, shoeRadialScale: 0.92, shoeWidthScale: 1,
    dishR: 0.78, wheelFaceLayers: layers,
  });
}

/** The rear door (the two-leaf clamshell), its hinges and handle, and the exhaust louvre on the right side: a dark
 *  recessed panel, its top lip and eight vertical vanes. */
export function buildMerkavaStern(P: TankBuilderPort, spec: MerkavaHullSpec): void {
  const { box, cylY, cylX } = KIT;
  // the stern plate's z at a height (the stern rakes up its top course from the bottom course's end)
  const sternAt = (y: number): number => {
    const top = spec.top;
    for (let k = 1; k < top.length; k++) {
      if (top[k]![1] >= y) {
        const [za, ya] = top[k - 1]!, [zb, yb] = top[k]!;
        return za + (zb - za) * Math.min(1, Math.max(0, (y - ya) / Math.max(1e-6, yb - ya)));
      }
    }
    return top[0]![0];
  };
  if (spec.rearDoor) {
    const [doorY, doorW, doorH] = spec.rearDoor, zDoor = sternAt(doorY) - 0.03;
    P.add('hullDetail', box(doorW, doorH, 0.06), 0, doorY, zDoor);
    P.add('hullDark', box(doorW * 0.96, 0.014, 0.012), 0, doorY, zDoor - 0.034);
    for (const side of [-1, 1]) {
      for (const dy of [-0.30, 0.30]) P.add('hullDark', cylY(0.028, 0.028, 0.11, 10), side * (doorW / 2 + 0.03), doorY + dy * doorH, zDoor + 0.005);
    }
    P.add('hullDark', cylX(0.014, doorW * 0.5, 8), 0, doorY - doorH * 0.2, zDoor - 0.045);
  }
  if (!spec.exhaust) return;
  const [ez0, ez1, v0, v1, ey0, ey1] = spec.exhaust, side = -(spec.upperHalfWidth + 0.004), h = ey1 - ey0;
  P.add('hullDark', box(0.012, h, ez1 - ez0), side, (ey0 + ey1) / 2, (ez0 + ez1) / 2);
  P.add('hullDetail', box(0.035, 0.03, ez1 - ez0 + 0.04), side - 0.01, ey1 + 0.015, (ez0 + ez1) / 2);
  for (let k = 0; k < 8; k++) {
    P.add('hullDetail', box(0.035, h, 0.022), side - 0.012, (ey0 + ey1) / 2, v0 + (v1 - v0) * (k / 7), 0, 0.45, 0);
  }
}
