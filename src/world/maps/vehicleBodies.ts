// src/world/maps/vehicleBodies.ts — the map-vehicles lane's body types (2026-10-05): the assemblers that turn a real
// vehicle's dimensions (vehicleFleets.ts) into coachwork (vehicleCoachwork.ts): cars, vans, pickups, utility 4x4s and
// open jeeps, and trucks — bonneted with a narrow engine cover, separate wings and running boards (the 1930s-50s:
// GAZ-AA, ZIS-5, Opel Blitz, GMC, CMP), bonneted with a wide alligator front (GAZ-53, ZIL-130), or forward control
// (KamAZ, TAM, Isuzu) — with their cargo bodies: wooden drop sides, a canvas tilt over hoops, a box van, a flatbed with
// its load, a tanker, log bunks.

import { material, linearHex, type VehicleMesh, type VehicleMaterial, type Vec3 } from './vehicleMesh.ts';
import {
  PAINT, GLASS, CHROME, BRIGHT, TRIM, UNDER, INTERIOR, LAMP, LAMP_RED, LAMP_AMBER, STEEL, RIM_STEEL, WOOD, CANVAS, RUBBER,
  WOOD_GREY,
  carBody, carDetails, bumper, wheel, roundLamp, rectLamp, grille, plate, boxLoft, cabLoft, stations,
  clamp, lerp, type CarBodySpec, type CarDetailSpec, type WheelSpec, type BoxSection, type CabFace,
} from './vehicleCoachwork.ts';

// ---------------------------------------------------------------------------------------------------- faces

/** A lamp on the front or rear face (mirrored about x = 0). */
export interface LampSpec {
  shape: 'round' | 'rect';
  x: number;
  y: number;
  /** Radius (round) or width and height (rect). */
  r?: number;
  w?: number;
  h?: number;
  lens?: 'white' | 'red' | 'amber';
  bezel?: 'chrome' | 'black' | 'body';
  /** z offset from the face (a pod standing proud). */
  dz?: number;
}

export interface FaceSpec {
  lamps: readonly LampSpec[];
  grille?: { x?: number; y: number; w: number; h: number; style: 'vbars' | 'hbars' | 'mesh' | 'slots'; bars: number;
    chrome?: boolean; frame?: 'chrome' | 'black' | 'body' };
  bumper?: { y: number; h: number; style: 'chrome' | 'painted' | 'black' | 'tube'; overriders?: boolean };
  plate?: { y: number; w: number; h: number; yellow?: boolean };
}

function lensMat(l: LampSpec): VehicleMaterial {
  return l.lens === 'red' ? LAMP_RED : l.lens === 'amber' ? LAMP_AMBER : LAMP;
}

function bezelMat(l: LampSpec | undefined, paint: VehicleMaterial, fallback: 'chrome' | 'black' | 'body' = 'chrome'): VehicleMaterial {
  const b = l?.bezel ?? fallback;
  return b === 'chrome' ? CHROME : b === 'black' ? TRIM : paint;
}

/** A face's plan: its half-width before the corners round, and the corners' radius. */
interface FacePlan { hw: number; r: number }

/** How far a face's rounded plan corner has fallen back at |x|, and the surface's yaw there. */
function cornerAt(plan: FacePlan | undefined, ax: number): { back: number; yaw: number } {
  if (!plan || plan.r <= 0.005) return { back: 0, yaw: 0 };
  const c = plan.hw - plan.r;
  if (ax <= c) return { back: 0, yaw: 0 };
  const d = Math.min(plan.r * 0.97, ax - c);
  return { back: plan.r - Math.sqrt(plan.r * plan.r - d * d), yaw: Math.asin(d / plan.r) };
}

/** Lamps, grille, bumper and plate on a face at z (dir 1 the front, -1 the back); lamps near a rounded corner follow
 * it round (set back and turned, a wide lamp in segments), never standing proud of the body. */
function face(mesh: VehicleMesh, z: number, dir: 1 | -1, f: FaceSpec, paint: VehicleMaterial, coarse: boolean,
  bumperFn?: (y: number, h: number, style: 'chrome' | 'painted' | 'black' | 'tube', overriders: boolean) => void,
  plan?: FacePlan): void {
  for (const l of f.lamps) {
    for (const side of l.x === 0 ? [1] : [1, -1]) {
      const zz = z + dir * (l.dz ?? 0);
      if (l.shape === 'round') {
        const r = l.r ?? 0.08, c = cornerAt(plan, l.x + r * 0.5);
        mesh.push().translate(side * l.x, 0, zz - dir * c.back).rotateY(dir * side * c.yaw);
        roundLamp(mesh, 0, l.y, 0, r, lensMat(l), bezelMat(l, paint), dir, 0.05, coarse ? 8 : 12);
        mesh.pop();
        continue;
      }
      const w = l.w ?? 0.15, curved = cornerAt(plan, l.x + w / 2).back > 0.004;
      const n = curved ? (coarse ? 2 : 3) : 1;
      for (let k = 0; k < n; k++) {
        const ax = l.x - w / 2 + ((k + 0.5) * w) / n, c = cornerAt(plan, ax);
        mesh.push().translate(side * ax, 0, zz - dir * c.back).rotateY(dir * side * c.yaw);
        rectLamp(mesh, 0, l.y, 0, w / n + (n > 1 ? 0.014 : 0), l.h ?? 0.08, lensMat(l), bezelMat(l, paint, 'black'), dir);
        mesh.pop();
      }
    }
  }
  if (f.grille) {
    const g = f.grille;
    const frame = g.frame === 'black' ? TRIM : g.frame === 'body' ? paint : CHROME;
    mesh.push().translate(0, 0, z).scale(1, 1, dir);
    grille(mesh, g.x ?? 0, g.y, 0, g.w, g.h, g.style, g.chrome === false ? TRIM : BRIGHT, frame, coarse ? Math.ceil(g.bars / 2) : g.bars);
    mesh.pop();
  }
  if (f.bumper && bumperFn) bumperFn(f.bumper.y, f.bumper.h, f.bumper.style, !!f.bumper.overriders);
  if (f.plate) plate(mesh, 0, f.plate.y, z + dir * 0.005, f.plate.w, f.plate.h, dir);
}

// ---------------------------------------------------------------------------------------------------- cars

export interface CarModel {
  kind: 'car';
  body: Omit<CarBodySpec, 'coarse'>;
  wheel: Omit<WheelSpec, 'r' | 'w' | 'coarse'>;
  front: FaceSpec;
  rear: FaceSpec;
  details: CarDetailSpec;
  /** A spare wheel on the tail (the Beetle's bonnet has none; old utility estates carry it outside). */
  spareOnTail?: boolean;
  /** A roof rack. */
  roofRack?: boolean;
}

export interface BuildOptions {
  coarse: boolean;
  burnt: boolean;
  paint?: VehicleMaterial;
}

/** A car, a van, an estate or a utility body on the car loft. */
export function buildCar(mesh: VehicleMesh, m: CarModel, o: BuildOptions): void {
  const paint = o.paint ?? PAINT;
  const spec: CarBodySpec = { ...m.body, coarse: o.coarse };
  const prof = carBody(mesh, spec, paint);
  carDetails(mesh, prof, o.coarse ? { ...m.details, seams: false, wipers: false } : m.details);
  const ws: WheelSpec = { ...m.wheel, r: spec.wheelR, w: spec.tyreW, coarse: o.coarse, bare: o.burnt };
  const drop = o.burnt ? spec.wheelR * (1 - m.wheel.rim * 1.04) : 0;
  for (const side of [1, -1] as const) for (const z of [spec.frontAxle, spec.rearAxle]) {
    wheel(mesh, side * spec.track / 2, spec.wheelR - drop, z, side, ws);
  }
  face(mesh, prof.zNose, 1, m.front, paint, o.coarse, (y, h, style, ov) => bumper(mesh, prof, 1, y, h, style, paint, ov),
    { hw: prof.halfW(prof.zNose - spec.noseRound), r: spec.noseRound });
  face(mesh, prof.zTail, -1, m.rear, paint, o.coarse, (y, h, style, ov) => bumper(mesh, prof, -1, y, h, style, paint, ov),
    { hw: prof.halfW(prof.zTail + spec.tailRound), r: spec.tailRound });
  if (m.spareOnTail) {
    mesh.push().translate(0, spec.belt * 0.62, prof.zTail - 0.11).rotateY(Math.PI / 2);
    wheel(mesh, 0, 0, 0, 1, { ...ws, style: 'disc', rim: 0.55 });
    mesh.pop();
  }
  if (m.roofRack && !o.coarse) {
    const y = spec.roofH + spec.roofCrown + 0.06, z0 = spec.roofFrontZ - 0.05, z1 = spec.roofRearZ + 0.1;
    const hw = (prof.ghBase(z0) * spec.roofTaper) - 0.06;
    for (const x of [-hw, hw]) mesh.box(x, y, (z0 + z1) / 2, 0.03, 0.03, z0 - z1, TRIM);
    for (let k = 0; k <= 3; k++) mesh.box(0, y, lerp(z0, z1, k / 3), hw * 2, 0.025, 0.025, TRIM);
  }
  underbody(mesh, prof.zNose - 0.3, prof.zTail + 0.3, spec.track / 2 - spec.tyreW, spec.sill + 0.02, o.coarse);
}

/** The underside's floor pan and exhaust, seen from low angles. */
function underbody(mesh: VehicleMesh, zF: number, zB: number, hw: number, y: number, coarse: boolean): void {
  mesh.box(0, y - 0.03, (zF + zB) / 2, hw * 2, 0.04, zF - zB, UNDER);
  if (!coarse) mesh.tube([[0.35, y - 0.08, zF - 0.6], [0.38, y - 0.09, zB + 0.1], [0.38, y - 0.07, zB - 0.12]], 0.03, 6, STEEL);
}

// ---------------------------------------------------------------------------------------------------- open tubs

/**
 * An open tub lofted along z (a pickup's bed, an open jeep's body): the outer side with the rear wheel's arch cut,
 * a rail along the top, the inner side down to the floor. `archAxle` null leaves the side whole. Stations descend.
 */
function tub(mesh: VehicleMesh, zF: number, zB: number, hw: number, bottom: number, floorTop: number, top: number,
  wall: number, arch: { axle: number; r: number; wheelY: number; xWell: number } | null, outer: VehicleMaterial,
  inner: VehicleMaterial, coarse: boolean, opts: { frontRound?: number; rearRound?: number; topAt?: (z: number) => number;
    cut?: readonly number[] } = {}): void {
  const features: number[] = [...(opts.cut ?? [])];
  if (arch) for (let k = 0; k <= (coarse ? 4 : 6); k++) features.push(arch.axle + arch.r * Math.cos((k / (coarse ? 4 : 6)) * Math.PI) * 0.999);
  const zs = stations(zB, zF, coarse ? 0.4 : 0.28, features);
  const halfW = (z: number) => {
    let w = hw;
    const fr = opts.frontRound ?? 0, rr = opts.rearRound ?? 0;
    if (fr > 0 && z > zF - fr) w = hw - fr + Math.sqrt(Math.max(0, fr * fr - (z - (zF - fr)) ** 2));
    if (rr > 0 && z < zB + rr) w = hw - rr + Math.sqrt(Math.max(0, rr * rr - ((zB + rr) - z) ** 2));
    return w;
  };
  const archTop = (z: number) => {
    if (!arch) return -Infinity;
    const d = z - arch.axle;
    return Math.abs(d) < arch.r ? arch.wheelY + Math.sqrt(arch.r * arch.r - d * d) * 0.97 : -Infinity;
  };
  const secs = zs.map((z) => {
    const topZ = opts.topAt ? opts.topAt(z) : top;
    const w = halfW(z), lip = Math.max(bottom, Math.min(archTop(z), topZ - 0.12));
    const xWell = arch ? Math.min(arch.xWell, w - 0.06) : w - 0.06;
    const r = 0.025;
    return [
      [0, bottom], [xWell, bottom], [xWell, lip], [w - r, lip], [w, lip + r], [w, (lip + topZ) / 2], [w, topZ - 0.012],
      [w - 0.012, topZ], [w - wall, topZ], [w - wall, floorTop], [0, floorTop],
    ] as [number, number][];
  });
  const nj = secs[0].length - 1;
  mesh.mirrored(() => {
    mesh.grid(zs.length - 1, nj, (i, j, out) => { out[0] = secs[i][j][0]; out[1] = secs[i][j][1]; out[2] = zs[i]; },
      (_i, j) => (j < 2 ? UNDER : j >= 8 ? inner : outer), { creaseJ: [1, 2, 3, 6, 8, 9] });
  });
}

// ---------------------------------------------------------------------------------------------------- pickups

export interface PickupModel {
  kind: 'pickup';
  /** The front and the cab: a car body whose tail is the cab's back (its rear axle lies outside it). */
  cab: Omit<CarBodySpec, 'coarse' | 'rearAxle' | 'rear' | 'lowerOnly'>;
  /** z of the cab body's centre in the vehicle frame, and the rear axle's z. */
  cabZ: number;
  rearAxle: number;
  trackR: number;
  wheel: Omit<WheelSpec, 'r' | 'w' | 'coarse'>;
  bed: { zF: number; zB: number; hw: number; floor: number; top: number; wood?: boolean; archR: number };
  front: FaceSpec;
  rearLamps: readonly LampSpec[];
  details: CarDetailSpec;
  tailgate?: 'painted' | 'wood';
  rearBumper?: 'chrome' | 'black' | 'tube';
}

/** A pickup: the car-built front and cab, an open bed with its arches, a tailgate. */
export function buildPickup(mesh: VehicleMesh, m: PickupModel, o: BuildOptions): void {
  const paint = o.paint ?? PAINT;
  const spec: CarBodySpec = { ...m.cab, rearAxle: -40, rear: 'estate', coarse: o.coarse };
  mesh.push().translate(0, 0, m.cabZ);
  const prof = carBody(mesh, spec, paint);
  carDetails(mesh, prof, o.coarse ? { ...m.details, seams: false, wipers: false } : m.details);
  face(mesh, prof.zNose, 1, m.front, paint, o.coarse, (y, h, style, ov) => bumper(mesh, prof, 1, y, h, style, paint, ov));
  mesh.pop();
  const b = m.bed, wood = b.wood ? WOOD : paint;
  tub(mesh, b.zF, b.zB, b.hw, Math.max(spec.sill, b.floor - 0.12), b.floor, b.top, 0.05,
    { axle: m.rearAxle, r: b.archR, wheelY: spec.wheelR, xWell: m.trackR / 2 - spec.tyreW / 2 - 0.05 }, paint, wood, o.coarse);
  // the bed's front wall and the tailgate
  mesh.box(0, (b.floor + b.top) / 2, b.zF - 0.025, b.hw * 2 - 0.02, b.top - b.floor, 0.05, paint, 0.01);
  mesh.box(0, (b.floor + b.top) / 2 - 0.01, b.zB + 0.03, b.hw * 2 - 0.02, b.top - b.floor - 0.02, 0.05, m.tailgate === 'wood' ? WOOD : paint, 0.012);
  const ws: WheelSpec = { ...m.wheel, r: spec.wheelR, w: spec.tyreW, coarse: o.coarse, bare: o.burnt };
  const drop = o.burnt ? spec.wheelR * (1 - m.wheel.rim * 1.04) : 0;
  for (const side of [1, -1] as const) {
    wheel(mesh, side * spec.track / 2, spec.wheelR - drop, m.cabZ + spec.frontAxle, side, ws);
    wheel(mesh, side * m.trackR / 2, spec.wheelR - drop, m.rearAxle, side, ws);
  }
  for (const l of m.rearLamps) {
    for (const side of [1, -1]) {
      if (l.shape === 'round') roundLamp(mesh, side * l.x, l.y, b.zB, l.r ?? 0.05, lensMat(l), TRIM, -1, 0.04, o.coarse ? 8 : 10);
      else rectLamp(mesh, side * l.x, l.y, b.zB, l.w ?? 0.1, l.h ?? 0.16, lensMat(l), TRIM, -1);
    }
  }
  if (m.rearBumper) {
    const bm = m.rearBumper === 'chrome' ? CHROME : m.rearBumper === 'tube' ? STEEL : TRIM;
    mesh.box(0, b.floor - 0.18, b.zB - 0.06, b.hw * 2 + 0.02, 0.12, 0.1, bm, 0.02);
  }
  plate(mesh, 0, b.floor - 0.05, b.zB - 0.004, 0.36, 0.13, -1);
  underbody(mesh, m.cabZ + prof.zNose - 0.3, b.zB + 0.3, m.trackR / 2 - spec.tyreW, spec.sill + 0.02, o.coarse);
}

// ---------------------------------------------------------------------------------------------------- open jeeps

export interface JeepModel {
  kind: 'jeep';
  length: number;
  frontAxle: number;
  rearAxle: number;
  wheelR: number;
  tyreW: number;
  track: number;
  wheel: Omit<WheelSpec, 'r' | 'w' | 'coarse'>;
  /** The tub: half-width, its floor, its top (the door line) and its front at the cowl. */
  tub: { hw: number; floor: number; top: number; zF: number; rearRound: number };
  /** The engine cover from the grille to the cowl. */
  bonnet: { hw: number; top: number; slope: number };
  /** The grille face: slots (Willys, CJ), bars (GAZ-67), or none (a rear-engined Kubelwagen's smooth nose). */
  grille: { style: 'slots' | 'vbars' | 'none'; w: number; h: number; y: number; count: number };
  /** Headlamps in the grille, on the nose, or faired into the wings' crowns (`mount: 'wing'`, the Kubelwagen's). */
  lamps: { x: number; y: number; r: number; inGrille: boolean; mount?: 'wing' };
  /** The flat wings over the front wheels: their width and the flat top's height over the ground (metres). */
  wings: { w: number; flatTop: number };
  /** Doors (the Kubelwagen's four): slab sides at the tub's full height, a seam at each cut line (z). */
  doors?: readonly number[];
  /** A rear-engined car's engine deck closing the tub behind the rear seat: from zF at `top` down to `tail` at the back. */
  rearDeck?: { zF: number; top: number; tail: number };
  windscreen: { h: number; folded: boolean };
  top: 'none' | 'canvas';
  spare: 'rear' | 'side' | 'bonnet' | 'none';
  /** A sloped nose instead of an upright grille (the Kubelwagen). */
  slopeNose?: boolean;
}

/** An open utility car: a flat-sided tub, a bonnet, flat wings, a windscreen frame, seats, a spare, a canvas top. */
export function buildOpenJeep(mesh: VehicleMesh, m: JeepModel, o: BuildOptions): void {
  const paint = o.paint ?? PAINT;
  const coarse = o.coarse;
  const zNose = m.length / 2, zTail = -m.length / 2;
  const t = m.tub;
  // the tub, its rear arch cut, a rounded rear
  // the side dips at the cockpit (no doors): the cut from the scuttle back past the front seats
  const cutF = t.zF - 0.08, cutB = t.zF - 0.95, dip = m.doors ? 0 : (t.top - t.floor) * 0.42;
  // a rear-engined car's sides follow its engine deck down to the tail
  const deckAt = (z: number) => {
    const d = m.rearDeck!, f = clamp((d.zF - z) / Math.max(0.01, d.zF - zTail), 0, 1);
    return lerp(d.top, d.tail, f * (0.6 + 0.4 * f));
  };
  const topAt = (z: number) => (m.rearDeck && z < m.rearDeck.zF ? deckAt(z)
    : t.top - dip * Math.min(clamp((cutF - z) / 0.18, 0, 1), clamp((z - cutB) / 0.22, 0, 1)));
  tub(mesh, t.zF, zTail, t.hw, t.floor - 0.12, t.floor, t.top, 0.035,
    { axle: m.rearAxle, r: m.wheelR + 0.06, wheelY: m.wheelR, xWell: m.track / 2 - m.tyreW / 2 - 0.05 }, paint, paint, coarse,
    { rearRound: t.rearRound, topAt, cut: [cutF, cutF - 0.09, cutF - 0.18, cutB + 0.22, cutB + 0.11, cutB] });
  const tailTop = m.rearDeck ? m.rearDeck.tail : t.top;
  mesh.box(0, (t.floor + tailTop) / 2, zTail + 0.02, t.hw * 2 - t.rearRound, tailTop - t.floor, 0.04, paint, 0.01);
  // the scuttle (dash) and the bonnet
  const bonnetZ0 = t.zF + 0.02, bonnetZ1 = zNose - 0.08;
  mesh.box(0, (t.floor + m.bonnet.top) / 2 + 0.05, t.zF - 0.02, t.hw * 2, m.bonnet.top - t.floor + 0.1, 0.06, paint, 0.012);
  const zsB = stations(bonnetZ0, bonnetZ1, coarse ? 0.5 : 0.3, []);
  boxLoft(mesh, zsB, (z) => {
    const f = clamp((z - bonnetZ0) / Math.max(0.01, bonnetZ1 - bonnetZ0), 0, 1);
    return { hw: m.bonnet.hw, y0: t.floor + 0.05, y1: m.bonnet.top - m.bonnet.slope * f, r: m.slopeNose ? 0.12 : 0.03, crown: 0.02, rb: 0.01 };
  }, () => paint, { coarse });
  // the grille face: a pressed panel, its slots (Willys, CJ) or bars (GAZ-67) dark in it
  if (m.grille.style !== 'none') {
    const gz = bonnetZ1 + 0.02;
    mesh.box(0, m.grille.y, gz, m.grille.w + 0.06, m.grille.h + 0.06, 0.04, paint, 0.012);
    const n = coarse ? Math.ceil(m.grille.count / 2) : m.grille.count;
    const slotW = m.grille.style === 'slots' ? (m.grille.w * 0.55) / n : (m.grille.w * 0.75) / n;
    for (let k = 0; k < n; k++) {
      const x = -m.grille.w / 2 + (m.grille.w * (k + 0.5)) / n;
      if (m.lamps.inGrille && Math.abs(Math.abs(x) - m.lamps.x) < m.lamps.r + slotW) continue;
      mesh.box(x, m.grille.y + (m.grille.style === 'slots' ? 0.03 : 0), gz + 0.012, slotW, m.grille.h * (m.grille.style === 'slots' ? 0.72 : 0.9), 0.024, INTERIOR, 0.004);
    }
  }
  const R = m.wheelR + 0.06, fy = (m.wings.flatTop - m.wheelR) / R;
  for (const side of [1, -1]) {
    if (m.lamps.mount === 'wing') {
      // a pod on the wing's crown, the lens ahead (the Kubelwagen's, the Beetle's)
      const x = side * m.lamps.x, y = m.wings.flatTop + m.lamps.r * 0.7, z = m.frontAxle + R * 0.7;
      mesh.push().translate(x, y, z).rotateX(0.08);
      mesh.lathe([[0.0001, -0.22], [m.lamps.r * 0.85, -0.18], [m.lamps.r * 1.06, -0.05], [m.lamps.r * 1.07, 0.0]], coarse ? 8 : 12, () => paint);
      mesh.pop();
      roundLamp(mesh, x, y, z, m.lamps.r, LAMP, paint, 1, 0.01, coarse ? 8 : 12);
      continue;
    }
    const lz = m.lamps.inGrille ? bonnetZ1 + 0.05 : bonnetZ1 - 0.1;
    roundLamp(mesh, side * m.lamps.x, m.lamps.y, lz, m.lamps.r, LAMP, m.lamps.inGrille ? TRIM : paint, 1, 0.08, coarse ? 8 : 12);
  }
  // flat wings over the front wheels, from beside the grille back to the scuttle
  mesh.mirrored(() => {
    wing(mesh, m.track / 2, m.frontAxle, m.wheelR, R,
      [[1.22, fy - 0.42], [1.18, fy], [0.6, fy + 0.03], [-0.4, fy + 0.03], [-0.92, fy - 0.08]],
      [t.zF - 0.02, t.floor + 0.08], m.wings.w, paint, coarse);
  });
  // the doors' seams on the slab sides
  if (m.doors && !coarse) {
    mesh.mirrored(() => {
      for (const z of m.doors!) mesh.box(t.hw + 0.002, (t.floor + t.top) / 2 + 0.02, z, 0.006, t.top - t.floor - 0.1, 0.012, TRIM);
    });
  }
  // the engine deck behind the rear seat: a loft falling to the tail, louvres across it
  if (m.rearDeck) {
    const d = m.rearDeck, z1 = zTail + 0.03;
    const zsD = stations(z1, d.zF, coarse ? 0.5 : 0.25, []);
    boxLoft(mesh, zsD, (z) => {
      const f = clamp((d.zF - z) / Math.max(0.01, d.zF - z1), 0, 1);
      return { hw: t.hw - 0.025 - t.rearRound * 0.5 * f * f, y0: t.floor, y1: deckAt(z) + 0.01, r: 0.08, crown: 0.02, rb: 0.01 };
    }, () => paint, { coarse, capMat: (end) => (end === 'front' ? paint : null) });
    if (!coarse) {
      for (let k = 0; k < 5; k++) {
        const z = lerp(d.zF - 0.25, d.zF - 0.55, k / 4);
        mesh.box(0, deckAt(z) + 0.022, z, t.hw * 0.7, 0.012, 0.03, TRIM);
      }
    }
  }
  // the windscreen frame and glass
  const wsY0 = t.top + 0.02, wsH = m.windscreen.h;
  mesh.push().translate(0, wsY0, t.zF + 0.05).rotateX(m.windscreen.folded ? -1.45 : -0.08);
  for (const x of [-t.hw + 0.03, t.hw - 0.03]) mesh.box(x, wsH / 2, 0, 0.035, wsH, 0.035, paint);
  mesh.box(0, wsH, 0, t.hw * 2 - 0.02, 0.035, 0.035, paint);
  mesh.box(0, 0.02, 0, t.hw * 2 - 0.02, 0.04, 0.04, paint);
  mesh.box(0, wsH / 2, 0, t.hw * 2 - 0.08, wsH - 0.05, 0.012, GLASS);
  mesh.pop();
  // seats, the wheel, a jerrycan
  if (!coarse) {
    for (const x of [-t.hw * 0.48, t.hw * 0.48]) {
      mesh.box(x, t.floor + 0.18, t.zF - 0.55, 0.42, 0.12, 0.42, CANVAS, 0.03);
      mesh.box(x, t.floor + 0.45, t.zF - 0.78, 0.42, 0.45, 0.08, CANVAS, 0.03);
    }
    mesh.box(0, t.floor + 0.2, zTail + 0.55, t.hw * 1.7, 0.12, 0.4, CANVAS, 0.03);
    mesh.push().translate(t.hw * 0.48, t.top + 0.1, t.zF - 0.25).rotateX(-1.05);
    mesh.tube(Array.from({ length: 9 }, (_, k) => { const a = (k / 8) * Math.PI * 2; return [Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18] as [number, number, number]; }),
      0.012, 4, TRIM, { closed: true });
    mesh.pop();
  }
  // the canvas top on its bows (burnt away on a burnt-out jeep)
  if (m.top === 'canvas' && !o.burnt) {
    const zs = stations(zTail + 0.06, t.zF + 0.02, coarse ? 0.6 : 0.3, []);
    boxLoft(mesh, zs, () => ({ hw: t.hw + 0.01, y0: t.top - 0.02, y1: t.top + wsH + 0.02, r: 0.12, rb: 0.01, crown: 0.03, tumble: 0.02 }),
      () => CANVAS, { coarse, capMat: (end) => (end === 'back' ? CANVAS : null) });
  }
  // the spare
  const ws: WheelSpec = { ...m.wheel, r: m.wheelR, w: m.tyreW, coarse, bare: o.burnt };
  if (m.spare === 'rear') {
    mesh.push().translate(0, (t.floor + t.top) / 2 + 0.05, zTail - m.tyreW * 0.5 - 0.04).rotateY(Math.PI / 2);
    wheel(mesh, 0, 0, 0, -1, ws);
    mesh.pop();
  } else if (m.spare === 'side') {
    mesh.push().translate(t.hw + m.tyreW * 0.5 + 0.03, (t.floor + t.top) / 2, t.zF - 0.45);
    wheel(mesh, 0, 0, 0, 1, ws);
    mesh.pop();
  } else if (m.spare === 'bonnet') {
    mesh.push().translate(0, m.bonnet.top + m.tyreW * 0.5, (bonnetZ0 + bonnetZ1) / 2).rotateZ(Math.PI / 2);
    wheel(mesh, 0, 0, 0, 1, ws);
    mesh.pop();
  }
  const drop = o.burnt ? m.wheelR * (1 - m.wheel.rim * 1.04) : 0;
  for (const side of [1, -1] as const) for (const z of [m.frontAxle, m.rearAxle]) wheel(mesh, side * m.track / 2, m.wheelR - drop, z, side, ws);
  // bumper, tail lamps, the frame under the tub
  mesh.box(0, m.wheelR * 0.95, zNose - 0.02, m.track + m.tyreW * 0.6, 0.1, 0.08, STEEL, 0.015);
  for (const side of [1, -1]) rectLamp(mesh, side * (t.hw - 0.12), t.floor + 0.12, zTail, 0.06, 0.08, LAMP_RED, TRIM, -1);
  underbody(mesh, zNose - 0.2, zTail + 0.2, m.track / 2 - m.tyreW, t.floor - 0.1, coarse);
}

// ---------------------------------------------------------------------------------------------------- period cars

export interface PeriodCarModel {
  kind: 'period';
  /** The body between the wings: a car loft with a narrow engine cover (noseWidth) and no arches. */
  body: Omit<CarBodySpec, 'coarse' | 'archR'>;
  wheel: Omit<WheelSpec, 'r' | 'w' | 'coarse'>;
  /** The wings: their width over the tyre, the front wing's reach ahead of the axle, the rear's sweep. */
  wings: { w: number; front: readonly (readonly [number, number])[]; rear: readonly (readonly [number, number])[] };
  runningBoardY: number;
  /** The upright grille on the nose face: its width and height, a V (the Emka's, the Opel's) or flat; none on a
   * rear-engined car (the Beetle's smooth nose). */
  grille: { w: number; h: number; y: number; v: number; bars: number; chrome: boolean; vertical?: boolean } | null;
  /** Headlamps on stalks between the wings and the grille (x, y over the ground, z ahead of the front axle), or set
   * into the wings' crowns (mount 'wing': the Beetle's, the 2CV's). */
  lamps: { x: number; y: number; dz: number; r: number; mount?: 'stalk' | 'wing' };
  bumpers: 'chrome' | 'painted' | 'none';
  spare: 'tail' | 'side' | 'none';
  rearLamps: readonly LampSpec[];
  details: CarDetailSpec;
  /** A pickup on the car's front (the GAZ-M415, the Ford A): the body ends at the cab's back and a wooden bed follows. */
  bed?: { zF: number; zB: number; hw: number; floor: number; top: number };
}

/** A 1930s-40s car: the body between separate wings, running boards, an upright grille, lamps on stalks. */
export function buildPeriodCar(mesh: VehicleMesh, m: PeriodCarModel, o: BuildOptions): void {
  const paint = o.paint ?? PAINT;
  const coarse = o.coarse;
  const full: CarBodySpec = { ...m.body, archR: 0.001, coarse };
  // a pickup's body is the front and the cab only: re-centred on its own length, its back upright with a small window
  const bed = m.bed;
  const zOff = bed ? (full.length / 2 + bed.zF) / 2 : 0;
  const spec: CarBodySpec = bed ? {
    ...full, length: full.length / 2 - bed.zF, frontAxle: full.frontAxle - zOff, rearAxle: -40,
    cowlZ: full.cowlZ - zOff, roofFrontZ: full.roofFrontZ - zOff, roofRearZ: -(full.length / 2 - bed.zF) / 2 + 0.07,
    glassRearZ: -(full.length / 2 - bed.zF) / 2, rear: 'estate', backlight: { w: 0.5, h: 0.55 }, doorCuts: full.doorCuts.slice(0, 2).map((z) => z - zOff),
    pillars: [], sideGlassTo: -(full.length / 2 - bed.zF) / 2 + 0.16,
  } : full;
  mesh.push().translate(0, 0, zOff);
  const prof = carBody(mesh, spec, paint);
  carDetails(mesh, prof, coarse ? { ...m.details, seams: false, wipers: false } : m.details);
  mesh.pop();
  if (bed) {
    tub(mesh, bed.zF, bed.zB, bed.hw, bed.floor - 0.1, bed.floor, bed.top, 0.045, null, WOOD, WOOD, coarse);
    mesh.box(0, (bed.floor + bed.top) / 2, bed.zF - 0.02, bed.hw * 2, bed.top - bed.floor, 0.04, WOOD, 0.008);
    mesh.box(0, (bed.floor + bed.top) / 2, bed.zB + 0.02, bed.hw * 2, bed.top - bed.floor, 0.04, WOOD, 0.008);
  }
  const R = full.wheelR + 0.07, xW = full.track / 2;
  const rb = m.runningBoardY;
  const frontFoot: [number, number] = [full.cowlZ - 0.05, rb + 0.02];
  // the wings reach the nose: the front wing's forward control points stretch to the body's overhang (the grille stands
  // between the wings' noses, never ahead of them); the rear wing's to the tail
  const reachF = Math.max(1, (full.length / 2 - full.frontAxle - 0.08) / (R * Math.max(...m.wings.front.map((q) => q[0]))));
  const frontCtrl = m.wings.front.map(([dz, dy]) => [dz > 0 ? dz * reachF : dz, dy] as const);
  mesh.mirrored(() => {
    wing(mesh, xW, full.frontAxle, full.wheelR, R, frontCtrl, frontFoot, m.wings.w, paint, coarse);
    // the rear wing: from the running board's end up over the wheel and down behind it
    const rearCtrl = m.wings.rear;
    wing(mesh, xW, full.rearAxle, full.wheelR, R, rearCtrl, null, m.wings.w * 0.95, paint, coarse);
    const zA = frontFoot[0], zB = full.rearAxle + R * (rearCtrl[0]?.[0] ?? 1.0);
    mesh.box(xW - 0.02, rb, (zA + zB) / 2, m.wings.w * 0.9, 0.035, zA - zB, TRIM, 0.01);
  });
  // the grille: a V-faced shell on the nose, bars across
  const zF = prof.zNose + zOff;
  const g = m.grille;
  const trimMat = g?.chrome ?? true ? CHROME : paint;
  if (g) {
    mesh.push().translate(0, g.y, zF + 0.02);
    const shellD = 0.06 + g.v;
    for (const side of [1, -1]) {
      mesh.push().scale(side, 1, 1).rotateY(-Math.atan2(g.v, g.w / 2));
      mesh.box(g.w / 4, 0, g.v / 2, g.w / 2 + 0.02, g.h, 0.03, g.chrome ? CHROME : paint, 0.01);
      mesh.box(g.w / 4, 0, g.v / 2 + 0.012, g.w / 2 - 0.05, g.h - 0.06, 0.012, INTERIOR);
      const bars = coarse ? 4 : g.bars;
      for (let k = 1; k < bars; k++) {
        if (g.vertical) mesh.box((g.w / 2) * (k / bars), 0, g.v / 2 + 0.02, 0.012, g.h - 0.05, 0.012, g.chrome ? BRIGHT : TRIM);
        else mesh.box(g.w / 4, -g.h / 2 + (g.h * k) / bars, g.v / 2 + 0.018, g.w / 2 - 0.03, 0.012, 0.012, g.chrome ? BRIGHT : TRIM);
      }
      mesh.pop();
    }
    mesh.box(0, g.h / 2 + 0.02, shellD / 2, 0.06, 0.04, shellD, g.chrome ? CHROME : paint, 0.01);
    mesh.pop();
  }
  // headlamps on stalks, or set into the wings
  for (const side of [1, -1]) {
    const x = side * m.lamps.x, z = full.frontAxle + m.lamps.dz;
    if (m.lamps.mount === 'wing') {
      // a pod faired into the wing's crown, the lens facing ahead
      mesh.push().translate(x, m.lamps.y, z - 0.06).rotateX(0.12);
      mesh.lathe([[0.0001, -0.2], [m.lamps.r * 0.8, -0.17], [m.lamps.r * 1.05, -0.05], [m.lamps.r * 1.06, 0.0]].map(([r, a]) => [r, a] as [number, number]),
        coarse ? 8 : 12, () => paint);
      mesh.pop();
      roundLamp(mesh, x, m.lamps.y, z - 0.06, m.lamps.r, LAMP, CHROME, 1, 0.01, coarse ? 8 : 12);
      continue;
    }
    if (!coarse) mesh.box(x, m.lamps.y - m.lamps.r - 0.08, z - 0.04, 0.03, 0.16, 0.03, TRIM);
    mesh.push().translate(x, m.lamps.y, z - 0.1);
    mesh.lathe([[0.0001, -0.12], [m.lamps.r * 0.7, -0.1], [m.lamps.r * 1.02, -0.02], [m.lamps.r * 1.05, 0.0]].map(([r, a]) => [r, a] as [number, number]),
      coarse ? 8 : 12, () => trimMat);
    mesh.pop();
    roundLamp(mesh, x, m.lamps.y, z - 0.1, m.lamps.r, LAMP, trimMat, 1, 0.01, coarse ? 8 : 12);
  }
  if (m.bumpers !== 'none') {
    const style = m.bumpers === 'chrome' ? 'chrome' : 'painted';
    mesh.push().translate(0, 0, zOff);
    bumper(mesh, prof, 1, full.noseBottom + 0.06, 0.07, style, paint, true);
    mesh.pop();
    if (!bed) bumper(mesh, prof, -1, full.tailBottom + 0.06, 0.07, style, paint, true);
  }
  const zTail = bed ? bed.zB : prof.zTail;
  const ws: WheelSpec = { ...m.wheel, r: full.wheelR, w: full.tyreW, coarse, bare: o.burnt };
  if (m.spare === 'tail' && !bed) {
    mesh.push().translate(0, full.tailBottom + full.wheelR + 0.08, zTail - full.tyreW * 0.5 - 0.02).rotateY(Math.PI / 2);
    wheel(mesh, 0, 0, 0, -1, ws);
    mesh.pop();
  } else if (m.spare === 'side' || (m.spare === 'tail' && bed)) {
    mesh.push().translate(full.width / 2 + full.tyreW * 0.2, full.wheelR + 0.12, full.cowlZ - 0.15).rotateZ(-0.12);
    wheel(mesh, 0, 0, 0, 1, ws);
    mesh.pop();
  }
  const drop = o.burnt ? full.wheelR * (1 - m.wheel.rim * 1.04) : 0;
  for (const side of [1, -1] as const) for (const z of [full.frontAxle, full.rearAxle]) wheel(mesh, side * xW, full.wheelR - drop, z, side, ws);
  for (const l of m.rearLamps) {
    for (const side of [1, -1]) roundLamp(mesh, side * l.x, l.y, zTail + (l.dz ?? 0), l.r ?? 0.04, lensMat(l), CHROME, -1, 0.04, coarse ? 8 : 10);
  }
  underbody(mesh, prof.zNose + zOff - 0.3, zTail + 0.3, full.track / 2 - full.tyreW, full.sill + 0.02, coarse);
}

// ---------------------------------------------------------------------------------------------------- trucks

export interface TruckCabSpec {
  zF: number;
  zB: number;
  hw: number;
  y0: number;
  belt: number;
  win: number;
  roof: number;
  /** How far the front recedes per metre of height above the belt (a raked windscreen). */
  rake: number;
  tumble: number;
  /** Plan corner radius and the roof's edge radius. */
  r: number;
  roofR: number;
  /** A centre pillar in the windscreen (the period two-pane screens). */
  split: boolean;
  /** The door window along the side, as fractions from the cab's front (0) to its back (1). */
  doorFrom: number;
  doorTo: number;
  rearWindow: boolean;
  /** A visor over the screen (the GAZ-AA's and many period cabs). */
  visor?: boolean;
  /** A canvas top over an open cab (the Dodge WC's, the CCKW's): the cab above the waist is canvas, its windows open. */
  soft?: boolean;
  /** The cab is the front of the box body (an ambulance, a van-bodied truck): no back wall, the body's paint. */
  intoBody?: boolean;
}

export type TruckBodyType = 'tilt' | 'dropside' | 'box' | 'flatbed' | 'tanker' | 'logs';

export interface TruckBodySpec {
  type: TruckBodyType;
  zF: number;
  zB: number;
  hw: number;
  floorY: number;
  /** Height of the drop sides (or the box / tank / tilt top over the floor). */
  sideH: number;
  top?: number;
  /** Wooden boards (the period beds) or painted steel. */
  wood: boolean;
  /** What a flatbed carries. */
  load?: 'crates' | 'sacks' | 'hay' | 'logs' | 'pipes' | 'coal' | 'none';
  /** A fixed colour for the box or the tilt (a livery), else the canvas or the paint. */
  colour?: VehicleMaterial;
}

export interface TruckModel {
  kind: 'truck';
  length: number;
  width: number;
  frontAxle: number;
  rearAxles: readonly number[];
  wheelR: number;
  tyreW: number;
  trackF: number;
  trackR: number;
  dualRear: boolean;
  wheelStyle: WheelSpec['style'];
  /** Top of the chassis rails and their half-spacing. */
  frameY: number;
  frameHW: number;
  front: 'narrow' | 'wide' | 'cabover';
  /** Narrow front: the engine cover from the radiator back to the cab, the radiator shell, the wings. */
  bonnet?: { zRad: number; hwFront: number; hwRear: number; yTop: number; r: number; louvres: boolean };
  radiator?: { w: number; h: number; y: number; style: 'vbars' | 'hbars' | 'mesh'; round: number; chrome: boolean; bars: number };
  wings?: { style: 'flat' | 'round'; w: number; reach: number };
  runningBoardY?: number;
  /** Wide front: a lower-body loft from the bumper to the cab (integrated wings and arches). */
  wide?: { zNose: number; noseH: number; topH: number; noseBottom: number; archR: number; shoulderR: number; noseRound: number };
  cab: TruckCabSpec;
  frontFace: FaceSpec;
  rearLamps: readonly LampSpec[];
  body: TruckBodySpec;
  spare?: 'side' | 'under' | 'none';
  fuelTank?: 'side' | 'none';
  mirrors?: boolean;
}

/** A truck: chassis, wheels, the front (narrow, wide or forward control), the cab, the cargo body, the hardware. */
export function buildTruck(mesh: VehicleMesh, m: TruckModel, o: BuildOptions): void {
  const paint = o.paint ?? PAINT;
  const coarse = o.coarse;
  const zNose = m.length / 2, zTail = -m.length / 2;
  // ---- chassis: the rails, cross members, axles
  const railZ0 = zNose - 0.18, railZ1 = m.body.zB + 0.05;
  for (const x of [-m.frameHW, m.frameHW]) mesh.box(x, m.frameY - 0.09, (railZ0 + railZ1) / 2, 0.07, 0.18, railZ0 - railZ1, UNDER);
  if (!coarse) for (const z of [m.frontAxle, ...m.rearAxles, railZ1 + 0.1]) mesh.box(0, m.frameY - 0.1, z, m.frameHW * 2, 0.1, 0.07, UNDER);
  const drop = o.burnt ? m.wheelR * 0.42 : 0;
  mesh.box(0, m.wheelR - 0.04 - drop, m.frontAxle, m.trackF - m.tyreW, 0.09, 0.09, UNDER);
  for (const z of m.rearAxles) {
    mesh.tube([[-(m.trackR / 2 - m.tyreW), m.wheelR - drop, z], [m.trackR / 2 - m.tyreW, m.wheelR - drop, z]], 0.06, 8, UNDER);
    if (!coarse) mesh.box(0, m.wheelR - drop, z, 0.32, 0.3, 0.3, UNDER, 0.08);
  }
  // ---- wheels
  const ws: WheelSpec = { r: m.wheelR, w: m.tyreW, rim: 0.56, style: m.wheelStyle, coarse, bare: o.burnt };
  for (const side of [1, -1] as const) {
    wheel(mesh, side * m.trackF / 2, m.wheelR - drop, m.frontAxle, side, ws);
    for (const z of m.rearAxles) wheel(mesh, side * m.trackR / 2, m.wheelR - drop, z, side, { ...ws, dual: m.dualRear });
  }
  // ---- the front
  if (m.front === 'narrow') narrowFront(mesh, m, paint, coarse, zNose);
  else if (m.front === 'wide') wideFront(mesh, m, paint, coarse);
  else cabOverFront(mesh, m, paint, coarse, zNose);
  // ---- the cab
  truckCab(mesh, m, paint, coarse);
  // ---- the cargo body
  truckBody(mesh, m, paint, coarse, o.burnt);
  // ---- hardware: the front bumper, mirrors, tank, spare, rear lamps, mudflaps
  const fb = m.frontFace.bumper;
  if (fb) {
    const bm = fb.style === 'chrome' ? CHROME : fb.style === 'painted' ? paint : fb.style === 'black' ? TRIM : STEEL;
    mesh.box(0, fb.y, zNose - 0.06, m.width * 0.96, fb.h, 0.12, bm, 0.02);
  }
  if (m.mirrors !== false) {
    mesh.mirrored(() => {
      const z = m.cab.zF - 0.08, y = m.cab.belt + 0.25, x = m.cab.hw;
      mesh.outboard(() => {
        mesh.tube([[x - 0.02, m.cab.belt + 0.05, z], [x + 0.2, y + 0.05, z], [x + 0.22, y + 0.3, z]], 0.012, 5, TRIM);
        mesh.box(x + 0.25, y + 0.18, z - 0.02, 0.05, 0.26, 0.15, TRIM, 0.01);
      });
    });
  }
  if (m.fuelTank === 'side') {
    const z = m.cab.zB - 0.4;
    mesh.push().translate(m.frameHW + 0.24, m.frameY - 0.22, z).rotateY(Math.PI / 2).rotateZ(Math.PI / 2);
    mesh.lathe([[0.0001, -0.32], [0.17, -0.31], [0.2, -0.27], [0.2, 0.27], [0.17, 0.31], [0.0001, 0.32]], coarse ? 8 : 12, () => STEEL);
    mesh.pop();
  }
  if (m.spare === 'side') {
    mesh.push().translate(-(m.frameHW + 0.2), m.frameY - 0.05, m.cab.zB - 0.55).rotateZ(0.05);
    wheel(mesh, 0, 0, 0, -1, { ...ws, dual: false, bare: o.burnt });
    mesh.pop();
  } else if (m.spare === 'under') {
    mesh.push().translate(0, m.frameY - 0.25, m.body.zB + 0.55).rotateZ(Math.PI / 2);
    wheel(mesh, 0, 0, 0, 1, { ...ws, dual: false, bare: o.burnt });
    mesh.pop();
  }
  for (const l of m.rearLamps) {
    for (const side of [1, -1]) {
      if (l.shape === 'round') roundLamp(mesh, side * l.x, l.y, m.body.zB - 0.02, l.r ?? 0.06, lensMat(l), TRIM, -1, 0.04, coarse ? 8 : 10);
      else rectLamp(mesh, side * l.x, l.y, m.body.zB - 0.02, l.w ?? 0.16, l.h ?? 0.08, lensMat(l), TRIM, -1);
    }
  }
  if (!coarse) {
    // the mudflaps behind the last axle, across the tyre (both twins of a dual) and never wider than it
    for (const side of [1, -1]) {
      const z = m.rearAxles[m.rearAxles.length - 1] - m.wheelR - 0.12;
      const across = m.tyreW * (m.dualRear ? 2.0 : 0.96), mid = m.trackR / 2 - (m.dualRear ? m.tyreW * 0.52 : 0);
      mesh.box(side * mid, m.wheelR * 0.62, z, across, m.wheelR * 0.9, 0.012, RUBBER);
    }
  }
  void zTail;
}

/** Catmull-Rom through control points (open), `per` samples per span. */
function spline(points: readonly (readonly [number, number])[], per: number): [number, number][] {
  const out: [number, number][] = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push([points[n - 1][0], points[n - 1][1]]);
  return out;
}

/**
 * A wing over a wheel at (x, axleZ): control points (dz, dy) in units of R from the axle and the wheel centre,
 * smoothed, run on (when `tail` is given) down to a running board's front at (z, y). The section is crowned across
 * with a turned-down outer skirt, a sheet 2 cm thick; its "up" is the path's normal away from the wheel.
 */
export function wing(mesh: VehicleMesh, x: number, axleZ: number, wheelY: number, R: number,
  ctrl: readonly (readonly [number, number])[], tail: readonly [number, number] | null, w: number, m: VehicleMaterial,
  coarse: boolean): void {
  const pts = ctrl.map(([dz, dy]) => [axleZ + dz * R, wheelY + dy * R] as [number, number]);
  if (tail) {
    const last = pts[pts.length - 1];
    pts.push([lerp(last[0], tail[0], 0.45), lerp(last[1], tail[1], 0.75)], [tail[0], tail[1]]);
  }
  const path = spline(pts, coarse ? 1 : 3);
  const sec: [number, number][] = coarse
    ? [[w / 2 + 0.012, -0.09], [w / 2, 0.01], [-w / 2, 0.01], [-w / 2, -0.03]]
    : [[w / 2 + 0.012, -0.09], [w / 2, 0], [w * 0.25, 0.028], [-w * 0.25, 0.028], [-w / 2, 0], [-w / 2, -0.03]];
  const nP = path.length, nS = sec.length;
  const normals: [number, number][] = path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], c = path[Math.min(nP - 1, i + 1)];
    let tz = c[0] - a[0], ty = c[1] - a[1];
    const l = Math.hypot(tz, ty) || 1; tz /= l; ty /= l;
    let nz = -ty, ny = tz;
    if (nz * (p[0] - axleZ) + ny * (p[1] - wheelY) < 0) { nz = -nz; ny = -ny; }
    return [nz, ny];
  });
  // closed section: the top surface out and back along the underside 2 cm below
  mesh.grid(nP - 1, 2 * nS - 1, (i, j, out) => {
    const jj = j < nS ? j : 2 * nS - 1 - j, under = j >= nS ? -0.02 : 0;
    const [sx, sy] = sec[jj], [nz, ny] = normals[i];
    out[0] = x + sx; out[1] = path[i][1] + ny * (sy + under); out[2] = path[i][0] + nz * (sy + under);
  }, () => m, { closeV: true, creaseJ: coarse ? [] : [1, nS - 1] });
}

/** The 1930s-50s front: a narrow engine cover, the radiator shell with its grille, wings swept over the wheels into
 * running boards, pod headlamps. */
function narrowFront(mesh: VehicleMesh, m: TruckModel, paint: VehicleMaterial, coarse: boolean, zNose: number): void {
  const b = m.bonnet!, rad = m.radiator!;
  const zs = stations(m.cab.zF - 0.02, b.zRad, coarse ? 0.5 : 0.25, []);
  boxLoft(mesh, zs, (z) => {
    const t = clamp((z - (m.cab.zF - 0.02)) / Math.max(0.01, b.zRad - (m.cab.zF - 0.02)), 0, 1);
    return { hw: lerp(b.hwRear, b.hwFront, t), y0: m.frameY, y1: b.yTop, r: b.r, crown: 0.02, rb: 0.01 };
  }, () => paint, { coarse, capMat: (end) => (end === 'front' ? INTERIOR : paint) });
  if (b.louvres && !coarse) {
    mesh.mirrored(() => {
      const n = 6, z0 = b.zRad - 0.12, z1 = m.cab.zF + 0.18;
      for (let k = 0; k < n; k++) {
        const z = lerp(z0, z1, k / (n - 1));
        const t = clamp((z - (m.cab.zF - 0.02)) / Math.max(0.01, b.zRad - (m.cab.zF - 0.02)), 0, 1);
        const x = lerp(b.hwRear, b.hwFront, t);
        mesh.box(x + 0.004, (m.frameY + b.yTop) / 2 + 0.05, z, 0.01, (b.yTop - m.frameY) * 0.4, 0.025, TRIM);
      }
    });
  }
  // the radiator shell: a rounded box standing proud of the cover, the grille in its face, a filler cap on top
  const shellZ = b.zRad + 0.05, shellD = 0.12;
  const shellZs = [shellZ + shellD / 2, shellZ - shellD / 2];
  boxLoft(mesh, shellZs, () => ({ hw: rad.w / 2, y0: rad.y - rad.h / 2, y1: rad.y + rad.h / 2, r: rad.round, rb: 0.02 }),
    () => (rad.chrome ? CHROME : paint), { coarse });
  mesh.push().translate(0, 0, shellZ + shellD / 2);
  grille(mesh, 0, rad.y - 0.02, 0.004, rad.w - 0.09, rad.h - 0.1 - rad.round * 0.6, rad.style, rad.chrome ? BRIGHT : TRIM,
    rad.chrome ? CHROME : paint, coarse ? Math.ceil(rad.bars / 2) : rad.bars);
  mesh.pop();
  if (!coarse) mesh.box(0, rad.y + rad.h / 2 + 0.03, shellZ, 0.07, 0.06, 0.07, CHROME, 0.02);
  // wings over the front wheels, swept down into the running boards
  const w = m.wings!, rb = m.runningBoardY ?? m.frameY - 0.1;
  const xW = m.trackF / 2, R = m.wheelR + 0.07;
  const ctrl: [number, number][] = w.style === 'flat'
    ? [[1.05 * w.reach, 0.2], [0.98 * w.reach, 0.6], [0.62, 0.86], [0.0, 0.93], [-0.55, 0.88], [-0.95, 0.6]]
    : [[1.0 * w.reach, 0.15], [0.9, 0.55], [0.55, 0.88], [0.0, 1.0], [-0.55, 0.88], [-0.92, 0.5]];
  mesh.mirrored(() => {
    wing(mesh, xW, m.frontAxle, m.wheelR, R, ctrl, [m.cab.zF - 0.05, rb + 0.03], w.w, paint, coarse);
    // the running board, from the wing's foot back to the cab's rear
    const tailZ = m.cab.zF - 0.05;
    mesh.box(xW + 0.02, rb, (tailZ + m.cab.zB) / 2 - 0.05, w.w * 0.95, 0.04, tailZ - m.cab.zB + 0.1, STEEL, 0.01);
  });
  // headlamps on pods / brackets beside the radiator
  for (const l of m.frontFace.lamps) {
    for (const side of [1, -1]) {
      const x = side * l.x;
      if (l.dz !== undefined && !coarse) mesh.box(x * 0.82, l.y - 0.1, (l.dz ?? 0) + zNose - 0.32, Math.abs(x) * 0.36, 0.03, 0.03, TRIM);
      roundLamp(mesh, x, l.y, zNose - 0.32 + (l.dz ?? 0), l.r ?? 0.1, lensMat(l), bezelMat(l, paint, 'body'), 1, 0.12, coarse ? 8 : 12);
    }
  }
}

/** The 1960s+ bonneted front: a wide alligator bonnet with the wings and arches in it, lamps and grille in its face. */
function wideFront(mesh: VehicleMesh, m: TruckModel, paint: VehicleMaterial, coarse: boolean): void {
  const w = m.wide!;
  const zCab = m.cab.zF + 0.04;
  const len = w.zNose - zCab, mid = (w.zNose + zCab) / 2;
  const spec: CarBodySpec = {
    length: len, width: m.width - 0.04, frontAxle: m.frontAxle - mid, rearAxle: -20, wheelR: m.wheelR, tyreW: m.tyreW,
    track: m.trackF, sill: m.frameY - 0.05, noseBottom: w.noseBottom, tailBottom: m.frameY - 0.05,
    belt: w.topH, noseH: w.noseH, tailH: w.topH, cowlZ: -len / 2 - 0.01, glassRearZ: -len / 2 - 0.02,
    roofFrontZ: -len, roofRearZ: -len, roofH: w.topH, roofTaper: 1, bonnetCrown: 0.03, roofCrown: 0,
    shoulderR: w.shoulderR, sillR: 0.03, noseRound: w.noseRound, tailRound: 0.02, tuckLow: 0.02, tuckHigh: 0.03,
    archR: w.archR, doorCuts: [], pillars: [], pillarW: 0, rear: 'notch', lowerOnly: true, coarse,
  };
  mesh.push().translate(0, 0, mid);
  carBody(mesh, spec, paint);
  mesh.pop();
  face(mesh, w.zNose, 1, { ...m.frontFace, bumper: undefined }, paint, coarse);
}

/** Forward control: the cab stands over the front axle; below it the bumper, the steps and the wings round the wheels. */
function cabOverFront(mesh: VehicleMesh, m: TruckModel, paint: VehicleMaterial, coarse: boolean, zNose: number): void {
  const R = m.wheelR + 0.08;
  mesh.mirrored(() => {
    const n = coarse ? 5 : 9, path: [number, number, number][] = [];
    for (let k = 0; k <= n; k++) {
      const a = lerp(0.05, Math.PI * 0.95, k / n);
      path.push([m.trackF / 2, m.wheelR + Math.sin(a) * R, m.frontAxle + Math.cos(a) * R]);
    }
    mesh.sweep(path, [[-m.tyreW * 0.75, -0.015], [m.tyreW * 0.75, -0.015], [m.tyreW * 0.75, 0.015], [-m.tyreW * 0.75, 0.015]],
      () => TRIM, { closedSection: true, caps: true, up: [1, 0, 0] });
    if (!coarse) mesh.box(m.cab.hw - 0.12, m.cab.y0 - 0.25, zNose - 0.2, 0.22, 0.03, 0.18, STEEL);
  });
  face(mesh, zNose, 1, { ...m.frontFace, bumper: undefined }, paint, coarse);
}

function truckCab(mesh: VehicleMesh, m: TruckModel, paint: VehicleMaterial, coarse: boolean): void {
  const c = m.cab;
  const ys = [c.y0, c.belt, c.belt + 0.04, c.win, c.roof - c.roofR];
  const plan = (y: number) => {
    const up = Math.max(0, y - c.belt);
    const t = clamp((y - c.belt) / Math.max(0.01, c.roof - c.belt), 0, 1);
    return { zF: c.zF - c.rake * up, zB: c.zB, hw: c.hw - c.tumble * t, r: c.r };
  };
  const doorFrom = c.doorFrom, doorTo = c.doorTo;
  const upper = c.soft ? CANVAS : paint;
  const opening = c.soft ? INTERIOR : GLASS;
  const matAt = (y: number, f: CabFace, u: number): VehicleMaterial => {
    const inWin = y > c.belt + 0.04 && y < c.win;
    const top = y > c.belt + 0.04 ? upper : paint;
    if (!inWin) return top;
    if (f === 'front') return c.split && u < 0.035 ? paint : u < 0.9 ? GLASS : paint;
    if (f === 'side') return u > doorFrom && u < doorTo ? opening : top;
    if (f === 'back') return c.rearWindow && u < 0.45 && y > c.belt + 0.12 ? opening : top;
    return top;
  };
  const sideBreaks = [doorFrom, doorTo];
  cabLoft(mesh, ys, plan, matAt, { roofR: c.roofR, frontBreaks: c.split ? [0.04, 0.9] : [0.9], sideBreaks, backBreaks: [0.45], coarse,
    roofMat: upper });
  if (c.visor && !coarse) {
    const p = plan(c.roof);
    mesh.box(0, c.roof - c.roofR * 0.6, p.zF + 0.12, c.hw * 1.8, 0.03, 0.25, paint, 0.01);
  }
  // a door seam and a handle
  if (!coarse) {
    mesh.mirrored(() => {
      const zDoorB = lerp(c.zF - c.r, c.zB + c.r, doorTo + 0.06);
      mesh.box(c.hw + 0.003, (c.y0 + c.win) / 2, zDoorB, 0.006, c.win - c.y0 - 0.1, 0.012, TRIM);
      mesh.box(c.hw + 0.01, c.belt - 0.06, zDoorB + 0.1, 0.02, 0.025, 0.12, BRIGHT, 0.005);
    });
  }
}

// ---------------------------------------------------------------------------------------------------- box sides

/** A shade of a material: its colour scaled by `f` (clamped), the rest kept, so a paint-masked shade still takes the
 *  instance colour (one material object per shade, so a build's material table stays small). */
const SHADES = new WeakMap<VehicleMaterial, Map<string, VehicleMaterial>>();
function shade(m: VehicleMaterial, f: number, rough = m.rough): VehicleMaterial {
  let byKey = SHADES.get(m);
  if (!byKey) { byKey = new Map(); SHADES.set(m, byKey); }
  const key = `${f}:${rough}`;
  let out = byKey.get(key);
  if (!out) {
    const c = (v: number) => Math.min(1, v * f);
    out = material(m.role, [c(m.rgb[0]), c(m.rgb[1]), c(m.rgb[2])], rough, m.metal, m.paint, m.weather);
    byKey.set(key, out);
  }
  return out;
}

/** Paint worn through to a steel box's oxide, run down its side in streaks. */
const RUST_RUN = material('steel', linearHex(0x5e3a24), 0.86, 0.12, 0, 1);

/** A deterministic 0..1 from two integers. */
function h01(k: number, salt: number): number {
  const v = Math.sin(k * 127.1 + salt * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** A flat convex polygon facing `n` whichever way its points run. */
function flatFace(mesh: VehicleMesh, p: readonly Vec3[], n: Vec3, m: VehicleMaterial): void {
  const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
  const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
  const d = (ay * bz - az * by) * n[0] + (az * bx - ax * bz) * n[1] + (ax * by - ay * bx) * n[2];
  mesh.polygon(d < 0 ? [...p].reverse() : p, m);
}

/**
 * Round 5 (2026-10-08, the media lane's blind critics on Verdant's GAZ-AA furgon: its box "untextured, a flat
 * material"): a box body's sides told in shades, since the baked colours carry the detail (desktop tier, dressing).
 * A wooden box: horizontal planks in two shades of its paint with dark grooves between them and butt joints staggered
 * course by course, framing posts and a rail along the top and the floor a shade darker, and the paint worn back to grey
 * wood along the floor and under the top rail, at the rear corner and the doors' meeting edge. A steel box: its pressed
 * ribs catching the light with their shadow aft of them, a darker rail top and bottom, scuffs low down and rust run
 * from the rails' ends and the ribs' feet.
 */
function boxSides(mesh: VehicleMesh, b: TruckBodySpec, top: number, boxMat: VehicleMaterial): void {
  const y0 = b.floorY + 0.02, y1 = top, H = y1 - y0, len = b.zF - b.zB, zMid = (b.zF + b.zB) / 2;
  const groove = shade(boxMat, 0.42, 0.8), plankB = shade(boxMat, 0.86), batten = shade(boxMat, 0.7);
  const lift = shade(boxMat, 1.18, Math.max(0.2, boxMat.rough - 0.08)), scuff = shade(boxMat, 0.6, 0.8);
  // the skins: the side's a few millimetres proud of the loft (+x), the back's behind it (-z, half: mirrored)
  const XS = b.hw + 0.003, ZB = b.zB - 0.003;
  const side = (ya: number, yb: number, za: number, zb: number, m: VehicleMaterial, out = 0) =>
    flatFace(mesh, [[XS + out, ya, za], [XS + out, ya, zb], [XS + out, yb, zb], [XS + out, yb, za]], [1, 0, 0], m);
  const back = (ya: number, yb: number, xa: number, xb: number, m: VehicleMaterial, out = 0) =>
    flatFace(mesh, [[xa, ya, ZB - out], [xb, ya, ZB - out], [xb, yb, ZB - out], [xa, yb, ZB - out]], [0, 0, -1], m);
  // a chip of worn paint: a jittered rectangle centred at (u, y) on the side (u = z) or the back (u = x)
  const chip = (onBack: boolean, u: number, y: number, hu: number, hy: number, k: number, m: VehicleMaterial) => {
    const j = (q: number) => 0.55 + 0.45 * h01(k, q);
    const pts: Vec3[] = [[-hu * j(1), -hy * j(2)], [hu * j(3), -hy * j(4)], [hu * j(5), hy * j(6)], [-hu * j(7), hy * j(8)]]
      .map(([du, dy]) => (onBack ? [u + du, y + dy, ZB - 0.006] : [XS + 0.006, y + dy, u + du]) as Vec3);
    flatFace(mesh, pts, onBack ? [0, 0, -1] : [1, 0, 0], m);
  };
  const posts = Math.max(2, Math.round(len / 0.6));
  mesh.dressing(() => mesh.mirrored(() => {
    if (b.wood) {
      const planks = Math.max(6, Math.round(H / 0.135)), ph = H / planks;
      for (let k = 0; k < planks; k++) {
        const ya = y0 + k * ph, yb = ya + ph;
        if (k % 2 === 1) {
          side(ya + 0.007, yb - 0.007, b.zF - 0.03, b.zB + 0.03, plankB);
          back(ya + 0.007, yb - 0.007, 0.012, b.hw - 0.03, plankB);
        }
        if (k > 0) {
          side(ya - 0.007, ya + 0.007, b.zF - 0.03, b.zB + 0.03, groove, 0.0015);
          back(ya - 0.007, ya + 0.007, 0.012, b.hw - 0.03, groove, 0.0015);
        }
        // the boards come in lengths: a butt joint a course, staggered
        const zj = lerp(b.zF, b.zB, 0.22 + 0.56 * h01(k, 11));
        side(ya + 0.007, yb - 0.007, zj + 0.006, zj - 0.006, groove, 0.0015);
      }
      // the frame's posts (the corners among them) and its rails along the top and the floor
      for (let k = 0; k <= posts; k++) mesh.box(b.hw + 0.01, (y0 + y1) / 2, lerp(b.zF - 0.035, b.zB + 0.035, k / posts), 0.016, H - 0.02, 0.06, batten);
      for (const y of [y0 + 0.04, y1 - 0.05]) mesh.box(b.hw + 0.01, y, zMid, 0.016, 0.07, len - 0.03, batten);
      // worn back to grey wood: along the floor (boots and loads), under the top rail (the weather), at the rear corner
      // and the doors' meeting edge (hands)
      for (let k = 0; k < 10; k++) {
        const low = k < 4, z = lerp(b.zF - 0.15, b.zB + 0.15, h01(k, 21));
        const y = low ? y0 + 0.1 + 0.12 * h01(k, 23) : k < 7 ? y1 - 0.12 - 0.08 * h01(k, 25) : lerp(y0 + 0.2, y1 - 0.2, h01(k, 27));
        const zz = k >= 7 ? b.zB + 0.06 + 0.04 * h01(k, 29) : z;
        chip(false, zz, y, 0.03 + 0.06 * h01(k, 31), 0.012 + 0.03 * h01(k, 33), k, WOOD_GREY);
      }
      for (let k = 0; k < 5; k++) {
        const x = k < 3 ? 0.03 + 0.05 * h01(k, 41) : lerp(0.15, b.hw - 0.12, h01(k, 43));
        const y = k < 3 ? lerp(y0 + 0.5, y0 + 1.1, h01(k, 45)) : y0 + 0.08 + 0.1 * h01(k, 47);
        chip(true, x, y, 0.02 + 0.04 * h01(k, 49), 0.015 + 0.035 * h01(k, 51), k + 20, WOOD_GREY);
      }
    } else {
      // the pressed ribs: a highlight on the rib, its shadow aft of it
      for (let k = 1; k < posts; k++) {
        const z = lerp(b.zF, b.zB, k / posts);
        mesh.box(b.hw + 0.006, (y0 + y1) / 2, z, 0.012, H - 0.1, 0.03, lift);
        side(y0 + 0.06, y1 - 0.06, z - 0.017, z - 0.045, groove, 0.0015);
      }
      for (const y of [y0 + 0.035, y1 - 0.04]) mesh.box(b.hw + 0.008, y, zMid, 0.014, 0.055, len - 0.03, batten);
      // scuffs low down and by the doors, rust run down from the top rail's ends and two ribs' heads
      for (let k = 0; k < 6; k++) {
        const z = k < 4 ? lerp(b.zF - 0.2, b.zB + 0.2, h01(k, 61)) : b.zB + 0.08 + 0.05 * h01(k, 63);
        chip(false, z, y0 + 0.12 + (k < 4 ? 0.15 : 0.6) * h01(k, 65), 0.04 + 0.07 * h01(k, 67), 0.01 + 0.025 * h01(k, 69), k + 40, scuff);
      }
      for (const [k, z] of [[0, b.zF - 0.06], [1, b.zB + 0.06], [2, lerp(b.zF, b.zB, 1 / posts) - 0.02], [3, lerp(b.zF, b.zB, (posts - 1) / posts) - 0.02]] as const) {
        const w = 0.008 + 0.01 * h01(k, 71), drop = 0.15 + 0.3 * h01(k, 73), ya = y1 - 0.07;
        flatFace(mesh, [[XS + 0.006, ya, z - w], [XS + 0.006, ya, z + w], [XS + 0.006, ya - drop, z + w * 0.4], [XS + 0.006, ya - drop, z - w * 0.4]], [1, 0, 0], RUST_RUN);
      }
    }
  }));
}

/**
 * Round 5 (2026-10-08, with the box sides): a drop-side bed's boards told apart — the middle board a shade darker
 * than its neighbours on the sides and the tailgate, and the boards worn pale along the top edge where loads drag over
 * it and at the corners (desktop tier, dressing).
 */
function boardFaces(mesh: VehicleMesh, b: TruckBodySpec, sh: number, boards: number, boardMat: VehicleMaterial): void {
  const bh = sh / boards, mid = shade(boardMat, 0.8), worn = b.wood ? WOOD_GREY : shade(boardMat, 1.25, 0.8);
  const XS = b.hw + 0.0015, ZB = b.zB - 0.0015;
  mesh.dressing(() => mesh.mirrored(() => {
    for (let k = 1; k < boards; k += 2) {
      const ya = b.floorY + k * bh + 0.007, yb = b.floorY + (k + 1) * bh - 0.007;
      flatFace(mesh, [[XS, ya, b.zF - 0.03], [XS, ya, b.zB + 0.03], [XS, yb, b.zB + 0.03], [XS, yb, b.zF - 0.03]], [1, 0, 0], mid);
      flatFace(mesh, [[0.02, ya, ZB], [b.hw - 0.03, ya, ZB], [b.hw - 0.03, yb, ZB], [0.02, yb, ZB]], [0, 0, -1], mid);
    }
    const yTop = b.floorY + sh;
    for (let k = 0; k < 6; k++) {
      const z = k < 4 ? lerp(b.zF - 0.2, b.zB + 0.2, h01(k, 81)) : b.zB + 0.05 + 0.06 * h01(k, 83);
      const w = 0.05 + 0.1 * h01(k, 85), d = 0.015 + 0.035 * h01(k, 87), x = XS + 0.0015;
      flatFace(mesh, [[x, yTop - 0.004, z - w], [x, yTop - 0.004, z + w], [x, yTop - d, z + w * 0.6], [x, yTop - d * 0.7, z - w * 0.7]], [1, 0, 0], worn);
    }
  }));
}

/** The cargo body on the frame. */
function truckBody(mesh: VehicleMesh, m: TruckModel, paint: VehicleMaterial, coarse: boolean, burnt: boolean): void {
  const b = m.body;
  const boardMat = b.wood ? WOOD : paint;
  const len = b.zF - b.zB, zMid = (b.zF + b.zB) / 2;
  // bearers under the floor, the floor
  if (!coarse) for (let k = 0; k <= 4; k++) mesh.box(0, b.floorY - 0.07, lerp(b.zF - 0.1, b.zB + 0.1, k / 4), b.hw * 2, 0.08, 0.08, UNDER);
  mesh.box(0, b.floorY - 0.02, zMid, b.hw * 2, 0.06, len, boardMat);
  if (b.type === 'dropside' || b.type === 'tilt' || b.type === 'flatbed') {
    const sh = b.type === 'flatbed' ? Math.min(0.3, b.sideH) : b.sideH;
    const boards = b.type === 'flatbed' ? 1 : 3;
    mesh.mirrored(() => {
      mesh.box(b.hw - 0.025, b.floorY + sh / 2, zMid, 0.05, sh, len, boardMat, 0.008);
      if (!coarse) {
        for (let k = 1; k < boards; k++) mesh.box(b.hw + 0.002, b.floorY + (sh * k) / boards, zMid, 0.006, 0.012, len - 0.04, TRIM);
        const posts = Math.max(2, Math.round(len / 0.9));
        for (let k = 0; k <= posts; k++) mesh.box(b.hw + 0.012, b.floorY + sh / 2, lerp(b.zF - 0.05, b.zB + 0.05, k / posts), 0.03, sh + 0.02, 0.05, STEEL);
      }
    });
    if (!coarse && boards > 1) boardFaces(mesh, b, sh, boards, boardMat);
    // headboard and tailgate
    mesh.box(0, b.floorY + sh / 2 + (b.type === 'tilt' ? 0 : 0.06), b.zF - 0.025, b.hw * 2, sh + (b.type === 'tilt' ? 0 : 0.12), 0.05, boardMat, 0.008);
    mesh.box(0, b.floorY + sh / 2, b.zB + 0.025, b.hw * 2, sh, 0.05, boardMat, 0.008);
    if (!coarse) for (let k = 1; k < boards; k++) mesh.box(0, b.floorY + (sh * k) / boards, b.zB - 0.002, b.hw * 2 - 0.04, 0.012, 0.006, TRIM);
  }
  if (b.type === 'tilt' && burnt) {
    // the canvas burnt away: the bare hoops over the charred bed
    const top = b.top ?? b.floorY + 1.7;
    const hoops = Math.max(3, Math.round(len / 1.0));
    for (let k = 0; k <= hoops; k++) {
      const z = lerp(b.zF - 0.04, b.zB + 0.04, k / hoops), y0 = b.floorY + b.sideH - 0.1;
      const n = coarse ? 4 : 8, pts: [number, number, number][] = [];
      for (let q = 0; q <= n; q++) {
        const a = Math.PI * (q / n);
        const rx = b.hw - 0.02, ry = top - y0 - 0.04;
        pts.push([Math.cos(a) * rx, y0 + Math.min(ry, Math.sin(a) * ry * 1.4), z]);
      }
      mesh.tube(pts, 0.018, 4, STEEL);
    }
  } else if (b.type === 'tilt') {
    const top = b.top ?? b.floorY + 1.7;
    const hoops = Math.max(3, Math.round(len / 1.0));
    const hz: number[] = [];
    for (let k = 0; k <= hoops; k++) hz.push(lerp(b.zF - 0.04, b.zB + 0.04, k / hoops));
    const zs = stations(b.zB + 0.02, b.zF - 0.02, coarse ? 0.6 : 0.25, hz);
    const canvas = b.colour ?? CANVAS;
    boxLoft(mesh, zs, (z) => {
      // the canvas sags a few centimetres between the hoops
      let sag = 1;
      for (const h of hz) sag = Math.min(sag, Math.abs(z - h) / (len / hoops / 2));
      return { hw: b.hw + 0.015, y0: b.floorY + b.sideH - 0.12, y1: top - 0.035 * clamp(sag, 0, 1), r: 0.28, rb: 0.01, crown: 0.04, tumble: 0.02 };
    }, () => canvas, { coarse, capMat: (end) => (end === 'back' ? INTERIOR : canvas) });
    if (!coarse) {
      // rope ties along the bottom edge and the rear flap's roll
      mesh.mirrored(() => {
        for (let k = 0; k <= hoops * 2; k++) mesh.box(b.hw + 0.025, b.floorY + b.sideH - 0.1, lerp(b.zF - 0.1, b.zB + 0.1, k / (hoops * 2)), 0.01, 0.08, 0.015, TRIM);
      });
      mesh.tube([[-b.hw + 0.05, top - 0.25, b.zB + 0.03], [b.hw - 0.05, top - 0.25, b.zB + 0.03]], 0.07, 8, canvas);
    }
  } else if (b.type === 'box') {
    const top = b.top ?? b.floorY + 1.9;
    const boxMat = b.colour ?? paint;
    const zs = [b.zF, ...(coarse ? [] : Array.from({ length: Math.round(len / 0.6) - 1 }, (_, k) => lerp(b.zF, b.zB, (k + 1) / Math.round(len / 0.6)))), b.zB];
    boxLoft(mesh, zs, () => ({ hw: b.hw, y0: b.floorY + 0.02, y1: top, r: 0.035, rb: 0.01 }), () => boxMat, { coarse });
    if (!coarse) {
      boxSides(mesh, b, top, boxMat);
      mesh.mirrored(() => {
        mesh.box(0.004, (b.floorY + top) / 2, b.zB - 0.004, 0.012, top - b.floorY - 0.1, 0.008, TRIM);
        mesh.box(0.08, b.floorY + 1.0, b.zB - 0.012, 0.04, 0.3, 0.02, STEEL);
        for (const y of [b.floorY + 0.4, top - 0.4]) mesh.box(b.hw - 0.06, y, b.zB - 0.01, 0.08, 0.06, 0.02, STEEL);
      });
    }
  } else if (b.type === 'tanker') {
    const r = Math.min(b.hw, (b.top ?? b.floorY + 1.3) - b.floorY) * 0.5;
    const cy = b.floorY + r + 0.06;
    const ell = b.hw / r;
    mesh.push().translate(0, cy, zMid).rotateY(Math.PI / 2).scale(1, 1, ell);
    const L = len / 2 - 0.05;
    mesh.lathe([[0.0001, -L - r * 0.25], [r * 0.6, -L - r * 0.2], [r * 0.92, -L - r * 0.08], [r, -L], [r, L], [r * 0.92, L + r * 0.08], [r * 0.6, L + r * 0.2], [0.0001, L + r * 0.25]],
      coarse ? 10 : 18, () => b.colour ?? paint);
    mesh.pop();
    if (!coarse) {
      for (const z of [zMid + len * 0.25, zMid - len * 0.25]) {
        mesh.push().translate(0, cy + r + 0.0, z);
        mesh.lathe([[0.2, -0.02], [0.2, 0.08], [0.0001, 0.1]].map(([a, y]) => [a, y] as [number, number]), 10, () => STEEL);
        mesh.pop();
      }
      mesh.box(0, cy + r + 0.05, zMid, 0.3, 0.02, len * 0.8, STEEL);
      for (const z of [b.zF - 0.3, b.zB + 0.3]) mesh.box(0, b.floorY + 0.05, z, b.hw * 2, 0.1, 0.12, UNDER);
    }
  } else if (b.type === 'logs') {
    const bunks = [b.zF - 0.25, zMid, b.zB + 0.25];
    for (const z of bunks) {
      mesh.box(0, b.floorY + 0.05, z, b.hw * 2, 0.1, 0.12, STEEL);
      for (const x of [-b.hw + 0.04, b.hw - 0.04]) mesh.box(x, b.floorY + 0.55, z, 0.07, 1.0, 0.07, STEEL);
    }
    logLoad(mesh, b, coarse);
  }
  if (b.type === 'flatbed' && b.load && b.load !== 'none') {
    if (b.load === 'logs') logLoad(mesh, b, coarse);
    else if (b.load === 'crates' || b.load === 'sacks' || b.load === 'hay') cargoLoad(mesh, b, b.load, coarse);
    else if (b.load === 'coal') {
      // a heaped load of coal: a ridge along the bed, its slopes at the angle of repose, lumps on it
      const zs = stations(b.zB + 0.08, b.zF - 0.08, coarse ? 0.6 : 0.3, []);
      boxLoft(mesh, zs, (z) => {
        const t = Math.min(1, (b.zF - 0.08 - z) / 0.5, (z - b.zB - 0.08) / 0.5);
        return { hw: b.hw - 0.06, y0: b.floorY + 0.02, y1: b.floorY + 0.25 + 0.3 * t, r: 0.45, rb: 0.01, crown: 0.18 * t };
      }, () => COAL, { coarse });
    }
    else if (b.load === 'pipes') {
      for (let k = 0; k < 5; k++) {
        const x = lerp(-b.hw * 0.7, b.hw * 0.7, k / 4), y = b.floorY + 0.14 + (k % 2) * 0.22;
        mesh.tube([[x, y, b.zF - 0.1], [x, y, b.zB - 0.2]], 0.12, coarse ? 6 : 10, STEEL);
      }
    }
  }
}

function logLoad(mesh: VehicleMesh, b: TruckBodySpec, coarse: boolean): void {
  const rows = [[-0.62, 0], [-0.2, 0], [0.22, 0], [0.62, 0], [-0.4, 1], [0.0, 1], [0.42, 1], [-0.2, 2], [0.2, 2]];
  const end = WOOD;
  rows.forEach(([fx, layer], k) => {
    const r = 0.17 + ((k * 37) % 7) * 0.008;
    const x = fx * b.hw / 0.8, y = b.floorY + 0.12 + r + layer * 0.31;
    const over = 0.15 + ((k * 13) % 5) * 0.05;
    mesh.push().translate(x, y, (b.zF + b.zB) / 2).rotateY(Math.PI / 2);
    const L = (b.zF - b.zB) / 2 + over;
    mesh.lathe([[0.0001, -L], [r * 0.95, -L], [r, -L + 0.03], [r, L - 0.03], [r * 0.95, L], [0.0001, L]], coarse ? 6 : 9,
      (s) => (s === 0 || s === 4 ? end : WOOD));
    mesh.pop();
  });
}

function cargoLoad(mesh: VehicleMesh, b: TruckBodySpec, kind: 'crates' | 'sacks' | 'hay', coarse: boolean): void {
  const len = b.zF - b.zB;
  const n = Math.max(2, Math.floor(len / 0.7));
  for (let k = 0; k < n; k++) for (const sx of [-1, 1]) {
    const z = lerp(b.zF - 0.4, b.zB + 0.4, k / Math.max(1, n - 1)), x = sx * b.hw * 0.48;
    const jitter = ((k * 31 + (sx > 0 ? 7 : 0)) % 9) / 9;
    if (kind === 'crates') {
      mesh.box(x, b.floorY + 0.32, z, b.hw * 0.86, 0.6, 0.62, WOOD, 0.015);
      if (jitter > 0.4 && !coarse) mesh.box(x + 0.05, b.floorY + 0.86, z, b.hw * 0.6, 0.46, 0.5, WOOD, 0.015);
    } else if (kind === 'sacks') {
      for (let l = 0; l < 2; l++) mesh.box(x, b.floorY + 0.14 + l * 0.24, z + (l ? 0.06 : 0), b.hw * 0.86, 0.24, 0.55, CANVAS, 0.08);
    } else {
      for (let l = 0; l < 3; l++) mesh.box(x, b.floorY + 0.22 + l * 0.42, z, b.hw * 0.9, 0.42, 0.62, HAY_BALE, 0.06);
    }
  }
}

const HAY_BALE = { ...WOOD, rgb: [0.34, 0.27, 0.12] as const, rough: 0.95 } as VehicleMaterial;
const COAL = { ...WOOD, role: 'cargo', rgb: [0.022, 0.021, 0.02] as const, rough: 0.7 } as VehicleMaterial;

// ---------------------------------------------------------------------------------------------------- re-exports used by the fleets
export { PAINT, CHROME, BRIGHT, TRIM, GLASS, RIM_STEEL, STEEL, CANVAS, WOOD, INTERIOR, type BoxSection };

// ---------------------------------------------------------------------------------------------------- dispatch

export type VehicleModel = CarModel | TruckModel | PickupModel | JeepModel | PeriodCarModel;

/** Build any model into the mesh. */
export function buildModel(mesh: VehicleMesh, m: VehicleModel, o: BuildOptions): void {
  if (m.kind === 'car') buildCar(mesh, m, o);
  else if (m.kind === 'truck') buildTruck(mesh, m, o);
  else if (m.kind === 'pickup') buildPickup(mesh, m, o);
  else if (m.kind === 'jeep') buildOpenJeep(mesh, m, o);
  else buildPeriodCar(mesh, m, o);
}

/** The model's wheels (axle z, centre height, radius): the spray zones its weathering darkens. */
export function modelWheels(m: VehicleModel): { z: number; y: number; r: number }[] {
  if (m.kind === 'truck') return [m.frontAxle, ...m.rearAxles].map((z) => ({ z, y: m.wheelR, r: m.wheelR }));
  if (m.kind === 'jeep') return [m.frontAxle, m.rearAxle].map((z) => ({ z, y: m.wheelR, r: m.wheelR }));
  if (m.kind === 'pickup') return [m.cabZ + m.cab.frontAxle, m.rearAxle].map((z) => ({ z, y: m.cab.wheelR, r: m.cab.wheelR }));
  return [m.body.frontAxle, m.body.rearAxle].map((z) => ({ z, y: m.body.wheelR, r: m.body.wheelR }));
}
