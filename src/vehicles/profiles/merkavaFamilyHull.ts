// Merkava family hull, running gear and skirts (release 262). One construction for the six marks: a front-engine hull
// lofted from its measured side line (the long shallow engine deck, the steeper nose plate, the lower glacis and the
// stern), sponsons over the tracks whose undersides follow the track's top run, the front sprocket and rear idler with
// six road wheels a side in three sprung pairs, and each mark's skirt run. Every number comes from the mark's record
// (merkavaFamilyMarks.ts); nothing here names a mark. Hull frame: ground y = 0, hull centre z = 0, +Z the nose.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { profileSkirtGeometry, skirtSegment, type ProfileSkirt, type SkirtStation } from './profileSkirt.ts';
import { merkavaDishedFaceLayers } from '../nationWheelConstructions.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** [z, y] along the hull's centreline. */
export type HullLinePoint = readonly [z: number, y: number];

export interface MerkavaHullSpec {
  /** The hull's top line, stern to nose: the rear deck edge, the turret deck, the engine deck's knee and the nose. */
  readonly top: readonly HullLinePoint[];
  /** The hull's bottom line, stern to nose: the lower stern plate, the belly and the lower glacis to the nose's edge. */
  readonly bottom: readonly HullLinePoint[];
  /** Half-width of the lower hull between the tracks and of the upper hull over them (to the sponson sides). */
  readonly lowerHalfWidth: number;
  readonly upperHalfWidth: number;
  /** How far the sponson underside stands over the track's top run. */
  readonly sponsonClearance: number;
  /** The rear door: centre height, width, height (on the stern plate). */
  readonly rearDoor: readonly [y: number, width: number, height: number];
  /** The driver's hatch on the glacis, left of centre: x, z. */
  readonly driverHatch: readonly [x: number, z: number];
  /** The engine grille on the glacis, right of centre: x, z0, z1, half-width. */
  readonly engineGrille: readonly [x: number, z0: number, z1: number, halfWidth: number];
  /** The exhaust louvre on the right hull side: z0, z1. */
  readonly exhaust: readonly [z0: number, z1: number];
  /** Mesh stowage baskets either side of the rear door (Mk 2 onward): their outer half-width, depth and top. */
  readonly rearBaskets: readonly [outer: number, depth: number, top: number] | null;
  /** Armoured rear fuel tanks in the stern plate (Mk 3): how far they stand proud of it, or 0. */
  readonly rearFuelTanks: number;
  /** Dor Dalet appliqué on the sponson sides above the skirts (Mk 2D): z0, z1, thickness, or null. */
  readonly sponsonAppliqué: readonly [z0: number, z1: number, thickness: number] | null;
}

export interface MerkavaGearSpec {
  readonly wheelR: number;
  readonly wheelW: number;
  readonly axleY: number;
  /** Six stations, stern to nose, in three sprung pairs. */
  readonly wheelZs: readonly number[];
  readonly sprocket: { readonly z: number; readonly y: number; readonly r: number };
  readonly idler: { readonly z: number; readonly y: number; readonly r: number };
  readonly returnRollers: readonly number[];
  readonly returnRollerY: number;
  readonly trackW: number;
  readonly trackTh: number;
  /** The track's centre off the centreline. */
  readonly trackX: number;
  /** The track's top run (its upper face) at the return rollers. */
  readonly trackTopY: number;
}

export interface MerkavaSkirtSpec {
  /** The skirt's stations (z, bottom, top) stern to nose. */
  readonly stations: readonly SkirtStation[];
  readonly inner: number;
  readonly outer: number;
  /** Panel joints along the run (z): each joint a seam and a bolt strip. */
  readonly joints: readonly number[];
  /** Rubber flap below the skirt's bottom edge (0 for none). */
  readonly flapDepth: number;
  /** Bolt-head rows on the panels (the Mk 3 and Mk 4 removable armour modules). */
  readonly boltRows: number;
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

/** The track's upper face along the hull, from the idler's top over the return rollers to the sprocket's top. */
export function trackTopAt(gear: MerkavaGearSpec, z: number): number {
  const front = gear.sprocket.y + gear.sprocket.r + gear.trackTh;
  const rear = gear.idler.y + gear.idler.r + gear.trackTh;
  const rollers = gear.returnRollers;
  const firstRoller = Math.max(...rollers), lastRoller = Math.min(...rollers);
  if (z >= firstRoller) {
    const t = (z - firstRoller) / Math.max(1e-6, gear.sprocket.z - firstRoller);
    return gear.trackTopY + (front - gear.trackTopY) * Math.min(1, Math.max(0, t));
  }
  if (z <= lastRoller) {
    const t = (lastRoller - z) / Math.max(1e-6, lastRoller - gear.idler.z);
    return gear.trackTopY + (rear - gear.trackTopY) * Math.min(1, Math.max(0, t));
  }
  return gear.trackTopY;
}

function hullStationZs(spec: MerkavaHullSpec, extra: readonly number[]): number[] {
  const zs = new Set<number>([...spec.top.map(([z]) => z), ...spec.bottom.map(([z]) => z), ...extra]);
  const z0 = Math.max(spec.top[0]![0], spec.bottom[0]![0]);
  const z1 = Math.min(spec.top[spec.top.length - 1]![0], spec.bottom[spec.bottom.length - 1]![0]);
  return [...zs].filter((z) => z >= z0 - 1e-9 && z <= z1 + 1e-9).sort((a, b) => a - b);
}

/** The central hull: the lower hull between the tracks, from the belly to the deck, lofted along its side lines. */
function centralHull(spec: MerkavaHullSpec): THREE.BufferGeometry {
  const hw = spec.lowerHalfWidth, bevel = 0.05;
  const sections: SolidSection[] = hullStationZs(spec, []).map((z) => {
    const top = lineAt(spec.top, z), bot = Math.min(lineAt(spec.bottom, z), top - 0.004);
    const b = Math.min(bevel, (top - bot) * 0.3);
    const ring: SectionPoint[] = [
      [-hw + b, bot], [hw - b, bot], [hw, bot + b], [hw, top - b * 0.6], [hw - b * 0.6, top],
      [-hw + b * 0.6, top], [-hw, top - b * 0.6], [-hw, bot + b],
    ];
    return { z, ring };
  });
  return sectionSolid(sections, { sideQuadDiagonal: 'convex' });
}

/** A sponson over one track: from the lower hull's side out to the upper hull's, its underside over the track's top
 *  run, its top the hull's top line, raked at both ends with the hull's own end lines. */
function sponson(spec: MerkavaHullSpec, gear: MerkavaGearSpec, side: 1 | -1, z0: number, z1: number): THREE.BufferGeometry {
  const xi = spec.lowerHalfWidth - 0.03, xo = spec.upperHalfWidth;
  const zs = hullStationZs(spec, [z0, z1, ...gear.returnRollers, gear.sprocket.z, gear.idler.z])
    .filter((z) => z >= z0 - 1e-9 && z <= z1 + 1e-9);
  const sections: SolidSection[] = zs.map((z) => {
    const top = lineAt(spec.top, z);
    const under = Math.min(top - 0.02, trackTopAt(gear, z) + spec.sponsonClearance);
    const ring: SectionPoint[] = [[xi, under], [xo - 0.02, under], [xo, under + 0.02], [xo, top - 0.025], [xo - 0.03, top], [xi, top]];
    return { z, ring: side > 0 ? ring : ring.map(([x, y]): SectionPoint => [-x, y]).reverse() };
  });
  return sectionSolid(sections, { sideQuadDiagonal: 'convex' });
}

/** The running gear: six road wheels a side on the Israel MBT dished face (nationWheelConstructions.ts), the front
 *  sprocket and rear idler, the return rollers over the top run, and the sprung paired arms. */
export function buildMerkavaRunningGear(P: TankBuilderPort, gear: MerkavaGearSpec): void {
  const faceHalf = Math.min(0.23, gear.trackW * 0.37) / 2;
  const layers = merkavaDishedFaceLayers(gear.wheelR, faceHalf, Boolean(P.q)).map((layer) => ({
    geometry: layer.geometry, material: layer.paint === 'dark' ? P.mats.dark : P.mats.wheels,
    outset: layer.outset, name: layer.name, appearanceRole: layer.role,
  }));
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: gear.wheelR, wheelW: faceHalf * 2, wheelY: gear.axleY, xc: gear.trackX,
    wheelZs: [...gear.wheelZs],
    sprocket: { ...gear.sprocket }, idler: { ...gear.idler },
    rollers: gear.returnRollers.map((z) => ({ z, y: gear.returnRollerY, r: 0.085 })),
    trackW: gear.trackW, trackTh: gear.trackTh, topY: gear.trackTopY - gear.trackTh * 0.5,
    paintedEnds: true, coveredTop: true, arms: true, suspensionPattern: 'paired-bogie',
    armBucket: 'hullRunningGearDetail', linkPitchM: 0.115, shoeRadialScale: 0.92, shoeWidthScale: 1,
    dishR: 0.78, wheelFaceLayers: layers,
  });
}

/** The z range over which a sponson stands at least `minDepth` deep over the track (its ends are fenders). */
export function sponsonRange(spec: MerkavaHullSpec, gear: MerkavaGearSpec, minDepth = 0.12): [number, number] {
  const z0 = spec.top[0]![0], z1 = spec.top[spec.top.length - 1]![0];
  const depth = (z: number): number => lineAt(spec.top, z) - (trackTopAt(gear, z) + spec.sponsonClearance);
  const step = 0.01;
  let a = z0, b = z1;
  while (a < z1 && depth(a) < minDepth) a += step;
  while (b > a && depth(b) < minDepth) b -= step;
  return [Math.round(a * 100) / 100, Math.round(b * 100) / 100];
}

/** A fender plate over a track end (the sprocket or the idler): 4 cm of steel under the hull's top line, from the
 *  sponson's end to the hull's end, across the track. */
function fender(spec: MerkavaHullSpec, side: 1 | -1, z0: number, z1: number): THREE.BufferGeometry {
  const xi = spec.lowerHalfWidth - 0.03, xo = spec.upperHalfWidth;
  const zs = [z0, ...spec.top.map(([z]) => z).filter((z) => z > z0 && z < z1), z1];
  return sectionSolid(zs.map((z) => {
    const top = lineAt(spec.top, z);
    const ring: SectionPoint[] = [[xi, top - 0.045], [xo, top - 0.045], [xo, top - 0.005], [xi, top - 0.005]];
    return { z, ring: side > 0 ? ring : mirror(ring) };
  }));
}

const mirror = (ring: SectionPoint[]): SectionPoint[] => ring.map(([x, y]): SectionPoint => [-x, y]).reverse();

/** Hull body: the central loft, the two sponsons and the fenders over the track ends, in 'hull'. */
export function buildMerkavaHullBody(P: TankBuilderPort, spec: MerkavaHullSpec, gear: MerkavaGearSpec): void {
  P.add('hull', centralHull(spec));
  const [z0, z1] = sponsonRange(spec, gear);
  const tail = spec.top[0]![0], nose = spec.top[spec.top.length - 1]![0];
  for (const side of [1, -1] as const) {
    P.add('hull', sponson(spec, gear, side, z0, z1));
    if (z1 < nose - 0.05) P.add('hull', fender(spec, side, z1 - 0.02, nose - 0.01));
    if (z0 > tail + 0.05) P.add('hull', fender(spec, side, tail + 0.01, z0 + 0.02));
    // the front mudflap hung under the fender's nose
    const flapZ = nose - 0.06;
    P.hangMudguard(`merkavaBowFlap${side > 0 ? 'L' : 'R'}`, 'hullRubber', KIT.box(gear.trackW * 0.95, 0.22, 0.012),
      side * gear.trackX, lineAt(spec.top, flapZ) - 0.17, flapZ);
  }
}

/** The rear baskets (Mk 2 on), the Mk 3's armoured rear fuel tanks and the Mk 2D's sponson appliqué. */
export function buildMerkavaHullKit(P: TankBuilderPort, spec: MerkavaHullSpec): void {
  const { box } = KIT;
  const tail = spec.top[0]![0];
  const doorHalf = spec.rearDoor[1] / 2;
  if (spec.rearFuelTanks > 0) {
    for (const side of [1, -1]) {
      const x0 = doorHalf + 0.06, x1 = spec.lowerHalfWidth + 0.20;
      P.add('hullExternalArmor', box(x1 - x0, 0.62, spec.rearFuelTanks), side * (x0 + x1) / 2, spec.rearDoor[0] + 0.05,
        tail - spec.rearFuelTanks / 2 + 0.02);
    }
  }
  if (spec.rearBaskets) {
    const [outer, depth, top] = spec.rearBaskets;
    const back = tail - spec.rearFuelTanks;
    for (const side of [1, -1]) {
      const x0 = doorHalf + 0.08, x1 = outer, xc = side * (x0 + x1) / 2, w = x1 - x0, bottom = top - 0.62;
      // an open welded frame, its mesh face and floor
      P.add('hullOpenLattice', box(w, 0.03, depth), xc, bottom, back - depth / 2);
      for (const y of [bottom + 0.30, top]) P.add('hullOpenLattice', box(w, 0.03, 0.03), xc, y, back - depth + 0.015);
      for (const x of [x0, x1]) P.add('hullOpenLattice', box(0.03, top - bottom, 0.03), side * x, (top + bottom) / 2, back - depth + 0.015);
      P.add('hullOpenLatticeDark', box(w - 0.04, top - bottom - 0.04, 0.006), xc, (top + bottom) / 2, back - depth + 0.03);
    }
  }
  if (spec.sponsonAppliqué) {
    const [z0, z1, t] = spec.sponsonAppliqué;
    for (const side of [1, -1]) {
      const y0 = lineAt(spec.top, z1) - 0.42, y1 = Math.min(lineAt(spec.top, z0), lineAt(spec.top, z1)) - 0.06;
      P.add('hullExternalArmor', box(t, y1 - y0, z1 - z0), side * (spec.upperHalfWidth + t / 2 - 0.005), (y0 + y1) / 2, (z0 + z1) / 2);
    }
  }
}

/** The rear door, its hinges and handle, the tail lights and tow eyes on the stern plate. */
export function buildMerkavaStern(P: TankBuilderPort, spec: MerkavaHullSpec): void {
  const { box, cylY, cylX } = KIT;
  const tailZ = spec.top[0]![0];
  const [doorY, doorW, doorH] = spec.rearDoor;
  // the stern plate's own z at the door's centre height (the stern rakes between the deck edge and the lower plate)
  const sternAt = (y: number): number => {
    const topRear = spec.top[0]!, botRear = spec.bottom[0]!;
    const t = (y - botRear[1]) / Math.max(1e-6, topRear[1] - botRear[1]);
    return botRear[0] + (topRear[0] - botRear[0]) * Math.min(1, Math.max(0, t));
  };
  const zDoor = Math.min(sternAt(doorY), tailZ) - 0.035;
  P.add('hullDetail', box(doorW, doorH, 0.07), 0, doorY, zDoor);
  P.add('hullDark', box(doorW * 0.96, 0.014, 0.012), 0, doorY + doorH * 0.12, zDoor - 0.038);
  for (const side of [-1, 1]) {
    for (const dy of [-0.32, 0.32]) {
      P.add('hullDark', cylY(0.03, 0.03, 0.12, 10), side * (doorW / 2 + 0.035), doorY + dy * doorH, zDoor + 0.005);
    }
    // tail light clusters (in housings) and tow eyes outboard of the door
    const ly = doorY + doorH * 0.36, lz = sternAt(ly);
    P.add('hullDetail', box(0.14, 0.10, 0.05), side * (spec.lowerHalfWidth - 0.16), ly, lz - 0.02);
    P.addEquipment('hullGlass', markVehicleNightLens(KIT.xform(box(0.10, 0.06, 0.010), 0, 0, 0, 0, Math.PI, 0), 'marker'),
      side * (spec.lowerHalfWidth - 0.16), ly, lz - 0.047);
    P.add('hullDark', KIT.torus(0.06, 0.018, 12, 6), side * (spec.lowerHalfWidth - 0.25), spec.bottom[0]![1] + 0.12,
      sternAt(spec.bottom[0]![1] + 0.12) - 0.03, 0, 0, Math.PI / 2);
  }
  P.add('hullDark', cylX(0.014, doorW * 0.5, 8), 0, doorY - doorH * 0.18, zDoor - 0.05);
}

/** The glacis fittings: the driver's hatch and periscopes, the engine grille, the headlights and the front tow eyes. */
export function buildMerkavaGlacis(P: TankBuilderPort, spec: MerkavaHullSpec): void {
  const { box, cylY } = KIT;
  const slopeAt = (z: number): number => {
    const d = 0.05;
    return Math.atan2(lineAt(spec.top, z - d) - lineAt(spec.top, z + d), 2 * d);
  };
  const [hx, hz] = spec.driverHatch;
  const hy = lineAt(spec.top, hz), ha = slopeAt(hz);
  P.add('hullHatch', cylY(0.30, 0.31, 0.05, P.q ? 24 : 14), hx, hy + 0.02, hz, ha, 0, 0);
  for (const dx of [-0.17, 0, 0.17]) {
    P.add('hullDark', box(0.10, 0.06, 0.05), hx + dx, lineAt(spec.top, hz + 0.32) + 0.03, hz + 0.32, ha, 0, 0);
  }
  const [gx, gz0, gz1, ghw] = spec.engineGrille;
  for (let z = gz0; z <= gz1 + 1e-9; z += (gz1 - gz0) / 7) {
    P.add('hullDark', box(ghw * 2, 0.012, 0.035), gx, lineAt(spec.top, z) + 0.006, z, slopeAt(z), 0, 0);
  }
  const noseZ = spec.top[spec.top.length - 1]![0], noseY = spec.top[spec.top.length - 1]![1];
  for (const side of [-1, 1]) {
    // headlight housings on the front fender shoulders, their lenses facing forward
    const lz = noseZ - 0.35, lx = side * (spec.upperHalfWidth - 0.22), ly = lineAt(spec.top, lz) + 0.085;
    P.add('hullDetail', box(0.22, 0.15, 0.13), lx, ly, lz);
    P.addEquipment('hullGlass', markVehicleNightLens(box(0.15, 0.09, 0.010), 'headlight'), lx, ly, lz + 0.068);
    P.add('hullDark', KIT.torus(0.065, 0.02, 12, 6), side * 0.45, noseY - 0.10, noseZ + 0.01, 0, 0, Math.PI / 2);
  }
  // the exhaust louvre on the right hull side (-X): slats under a lip
  const [ez0, ez1] = spec.exhaust;
  const ey = lineAt(spec.top, (ez0 + ez1) / 2) - 0.22;
  P.add('hullDetail', box(0.03, 0.04, ez1 - ez0 + 0.06), -(spec.upperHalfWidth + 0.01), ey + 0.13, (ez0 + ez1) / 2);
  for (let k = 0; k < 5; k++) {
    P.add('hullDark', box(0.02, 0.025, ez1 - ez0), -(spec.upperHalfWidth + 0.004), ey + 0.08 - k * 0.04, (ez0 + ez1) / 2, 0, 0, 0.5);
  }
}

/** The skirt run: profile panels with seams, bolt rows and rubber flaps, on both sides. */
export function buildMerkavaSkirts(P: TankBuilderPort, skirt: MerkavaSkirtSpec): void {
  const { box } = KIT;
  const first = skirt.stations[0]![0], last = skirt.stations[skirt.stations.length - 1]![0];
  const cuts = [first, ...skirt.joints.filter((z) => z > first && z < last), last];
  for (const side of [1, -1] as const) {
    const slot = side > 0 ? 'hullTrackGuardR' : 'hullTrackGuardL';
    for (let k = 0; k + 1 < cuts.length; k++) {
      const panel: ProfileSkirt = skirtSegment(skirt, cuts[k]! + (k > 0 ? 0.006 : 0), cuts[k + 1]! - (k + 2 < cuts.length ? 0.006 : 0));
      P.addExternalArmor(slot, profileSkirtGeometry(panel, side));
      if (skirt.boltRows > 0) {
        const zMid = (cuts[k]! + cuts[k + 1]!) / 2;
        const top = panel.stations.reduce((y, s) => Math.min(y, s[2]), Infinity);
        const bottom = panel.stations.reduce((y, s) => Math.max(y, s[1]), -Infinity);
        for (let row = 0; row < skirt.boltRows; row++) {
          const y = top - 0.05 - row * Math.max(0.08, (top - bottom - 0.10) / Math.max(1, skirt.boltRows - 1));
          if (y < bottom + 0.04) break;
          for (const dz of [-0.33, 0, 0.33]) {
            const z = zMid + dz * (cuts[k + 1]! - cuts[k]!);
            P.add('hullDetail', KIT.cylX(0.016, 0.014, 8), side * (skirt.outer + 0.006), y, z);
          }
        }
      }
    }
    if (skirt.flapDepth > 0) {
      for (let k = 0; k + 1 < cuts.length; k++) {
        const zA = cuts[k]! + 0.02, zB = cuts[k + 1]! - 0.02;
        const bottom = Math.max(...skirt.stations.filter(([z]) => z >= zA && z <= zB).map((s) => s[1]), skirt.stations[0]![1]);
        P.hangMudguard(`merkavaSkirtFlap${side > 0 ? 'R' : 'L'}${k}`, 'hullRubber',
          box(0.012, skirt.flapDepth, zB - zA), side * (skirt.outer - 0.012), bottom - skirt.flapDepth / 2 + 0.01, (zA + zB) / 2);
      }
    }
  }
}
