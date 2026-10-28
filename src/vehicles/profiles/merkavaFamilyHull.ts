// Merkava family hull and running gear (release 262). One construction for the six marks: a front-engine hull lofted
// from its measured courses (merkavaFamilyMarks.ts: the deck, the engine deck and nose, the belly, the raked stern),
// sponsons over the tracks from the lower hull's side out to their measured width, between their measured undersides
// and tops, fenders over the track ends, the stern door, and the running gear at the source's stations: six road wheels
// a side, the return rollers at their own heights and sizes, the front sprocket and rear idler. Skirts, sponson boxes
// and the rest of the kit are the measured detail parts (merkavaFamilyDetails.ts). Hull frame: ground y = 0, +Z the
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
  /** The rear door: centre height, width, height (on the stern plate). */
  readonly rearDoor: readonly [y: number, width: number, height: number];
  /** The exhaust louvre on the right hull side: z0, z1. */
  readonly exhaust: readonly [z0: number, z1: number];
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

/** The central hull: the lower hull between the tracks, from the belly to the deck, lofted along its courses. */
function centralHull(spec: MerkavaHullSpec): THREE.BufferGeometry {
  const bevel = 0.05, taper = spec.noseTaper;
  const z0 = Math.max(spec.top[0]![0], spec.bottom[0]![0]);
  const z1 = Math.min(spec.top[spec.top.length - 1]![0], spec.bottom[spec.bottom.length - 1]![0]);
  const sections: SolidSection[] = stationZs([spec.top, spec.bottom, taper], z0, z1).map((z) => {
    const top = lineAt(spec.top, z), bot = Math.min(lineAt(spec.bottom, z), top - 0.01);
    const hw = z >= taper[0]![0] ? Math.min(spec.lowerHalfWidth, lineAt(taper, z)) : spec.lowerHalfWidth;
    const b = Math.min(bevel, (top - bot) * 0.3, hw * 0.3);
    const ring: SectionPoint[] = [
      [-hw + b, bot], [hw - b, bot], [hw, bot + b], [hw, top - b * 0.6], [hw - b * 0.6, top],
      [-hw + b * 0.6, top], [-hw, top - b * 0.6], [-hw, bot + b],
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

/** Hull body: the central loft, the two sponsons and the fenders over the track ends, in 'hull'. */
export function buildMerkavaHullBody(P: TankBuilderPort, spec: MerkavaHullSpec, gear: MerkavaGearSpec): void {
  P.add('hull', centralHull(spec));
  const [z0, z1] = sponsonRange(spec);
  const line = spec.sponsonTop, tail = line[0]![0], nose = line[line.length - 1]![0];
  for (const side of [1, -1] as const) {
    P.add('hull', sponson(spec, side, z0, z1));
    if (z1 < nose - 0.05) P.add('hull', fender(spec, side, z1 - 0.02, nose));
    if (z0 > tail + 0.05) P.add('hull', fender(spec, side, tail, z0 + 0.02));
    // the front mudflap hung under the fender's nose
    const flapZ = nose - 0.05;
    P.hangMudguard(`merkavaBowFlap${side > 0 ? 'L' : 'R'}`, 'hullRubber', KIT.box(gear.trackW * 0.95, 0.20, 0.012),
      side * gear.trackX, lineAt(line, flapZ) - 0.15, flapZ);
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

/** The rear door (the two-leaf clamshell), its hinges and handle, and the exhaust louvre on the right side. */
export function buildMerkavaStern(P: TankBuilderPort, spec: MerkavaHullSpec): void {
  const { box, cylY, cylX } = KIT;
  const [doorY, doorW, doorH] = spec.rearDoor;
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
  const zDoor = sternAt(doorY) - 0.03;
  P.add('hullDetail', box(doorW, doorH, 0.06), 0, doorY, zDoor);
  P.add('hullDark', box(doorW * 0.96, 0.014, 0.012), 0, doorY, zDoor - 0.034);
  for (const side of [-1, 1]) {
    for (const dy of [-0.30, 0.30]) P.add('hullDark', cylY(0.028, 0.028, 0.11, 10), side * (doorW / 2 + 0.03), doorY + dy * doorH, zDoor + 0.005);
  }
  P.add('hullDark', cylX(0.014, doorW * 0.5, 8), 0, doorY - doorH * 0.2, zDoor - 0.045);
  const [ez0, ez1] = spec.exhaust;
  const ey = lineAt(spec.sponsonTop, (ez0 + ez1) / 2) - 0.20;
  P.add('hullDetail', box(0.03, 0.04, ez1 - ez0 + 0.06), -(spec.upperHalfWidth + 0.01), ey + 0.13, (ez0 + ez1) / 2);
  for (let k = 0; k < 5; k++) {
    P.add('hullDark', box(0.02, 0.025, ez1 - ez0), -(spec.upperHalfWidth + 0.004), ey + 0.08 - k * 0.04, (ez0 + ez1) / 2, 0, 0, 0.5);
  }
}
