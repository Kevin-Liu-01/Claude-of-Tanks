// src/world/maps/vehicleCoachwork.ts — the map-vehicles lane's coachbuilder (2026-10-05).
//
// A vehicle is built the way it is drawn on a coachbuilder's board: a lower body lofted from cross-sections along its
// length (the sill, the side with its bulge and tuck, the shoulder, the bonnet and deck crowned across), the wheel
// arches cut into those sections where the wheels stand (the well's inner wall and roof are part of the same
// surface), a greenhouse lofted over the waist (the windscreen raked, the roof crowned, the side glass leaning in, the
// pillars where the doors stop), and the parts hung on it: tyres turned with a shoulder and a tread, rims with their
// hubs, lamps, grilles, bumpers, mirrors, handles, plates, wipers, seams. Every dimension is a real vehicle's (the
// fleets in vehicleFleets.ts name the types), so a Lada reads as a Lada at 15 m and a GAZ-AA as a GAZ-AA.
//
// Local frame: +z is the nose, x across, y up, the tyres stand on y = 0; the footprint is centred.

import {
  material, linearHex, type VehicleMesh, type Vec3, type VehicleMaterial,
} from './vehicleMesh.ts';

// ---------------------------------------------------------------------------------------------------- materials

/** The body paint: a light neutral the instance colour multiplies (paint mask 1). Satin, a little sky in it. */
export const PAINT = material('paint', [0.80, 0.80, 0.80], 0.44, 0.0, 1, 1);
/** Paint that keeps its own colour (no instance tint): two-tone roofs, liveries, military finishes. */
export function fixedPaint(hex: number, rough = 0.5, weather = 1): VehicleMaterial {
  return material('paint', linearHex(hex), rough, 0, 0, weather);
}
export const GLASS = material('glass', [0.018, 0.022, 0.026], 0.05, 0, 0, 0.15);
export const CHROME = material('chrome', [0.60, 0.60, 0.58], 0.22, 1, 0, 0.5);
export const BRIGHT = material('chrome', [0.48, 0.48, 0.46], 0.34, 0.85, 0, 0.6);
export const RUBBER = material('rubber', [0.028, 0.027, 0.026], 0.92, 0, 0, 0.9);
export const TYRE_WALL = material('rubber', [0.040, 0.038, 0.036], 0.86, 0, 0, 0.9);
export const TRIM = material('trim', [0.032, 0.032, 0.033], 0.55, 0, 0, 0.7);
export const UNDER = material('under', [0.034, 0.031, 0.029], 0.9, 0, 0, 1);
export const INTERIOR = material('interior', [0.028, 0.026, 0.025], 0.9, 0, 0, 0.2);
export const LAMP = material('lamp', [0.72, 0.72, 0.68], 0.07, 0.65, 0, 0.1);
export const LAMP_RED = material('lampRed', [0.40, 0.02, 0.014], 0.14, 0, 0, 0.1);
export const LAMP_AMBER = material('lampAmber', [0.55, 0.22, 0.02], 0.14, 0, 0, 0.1);
export const PLATE = material('plate', [0.60, 0.60, 0.56], 0.5, 0, 0, 0.5);
export const PLATE_YELLOW = material('plate', [0.62, 0.48, 0.06], 0.5, 0, 0, 0.5);
export const STEEL = material('steel', [0.10, 0.096, 0.092], 0.62, 0.35, 0, 1);
export const RIM_STEEL = material('steel', [0.28, 0.28, 0.27], 0.45, 0.5, 0, 0.9);
export const WOOD = material('wood', [0.16, 0.105, 0.062], 0.86, 0, 0, 1);
export const WOOD_GREY = material('wood', [0.19, 0.17, 0.14], 0.9, 0, 0, 1);
export const CANVAS = material('canvas', [0.14, 0.14, 0.095], 0.96, 0, 0, 1);

// ---------------------------------------------------------------------------------------------------- small math

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Sorted (descending), de-duplicated stations: a base spacing plus every feature station. */
export function stations(from: number, to: number, spacing: number, features: readonly number[]): number[] {
  const out: number[] = [];
  const n = Math.max(2, Math.ceil((to - from) / spacing));
  for (let k = 0; k <= n; k++) out.push(from + (to - from) * (k / n));
  for (const f of features) if (f > from + 1e-4 && f < to - 1e-4) out.push(f);
  out.sort((a, b) => b - a);
  const dedup: number[] = [];
  for (const z of out) if (!dedup.length || Math.abs(dedup[dedup.length - 1] - z) > 0.02) dedup.push(z);
  return dedup;
}

// ---------------------------------------------------------------------------------------------------- the car body

export interface CarBodySpec {
  /** Body length and width (mirrors and bumpers outside). */
  length: number;
  width: number;
  /** z of the front and rear axles. */
  frontAxle: number;
  rearAxle: number;
  wheelR: number;
  tyreW: number;
  /** Distance between the wheel centres across. */
  track: number;
  /** Underside of the sill (ground clearance of the side). */
  sill: number;
  /** Bottom of the front and rear faces (valances). */
  noseBottom: number;
  tailBottom: number;
  /** Top of the doors / bottom of the side glass; `beltRise` lifts it toward the tail (a wedge). */
  belt: number;
  beltRise?: number;
  /** Height of the bonnet's leading edge and of the deck's trailing edge. */
  noseH: number;
  tailH: number;
  /** Windscreen base and rear window base (the tail itself on a hatch or estate). */
  cowlZ: number;
  glassRearZ: number;
  /** Where the roof reaches full height (front and rear). */
  roofFrontZ: number;
  roofRearZ: number;
  roofH: number;
  /** Roof half-width over the waist half-width (tumblehome). */
  roofTaper: number;
  bonnetCrown: number;
  roofCrown: number;
  /** Radius of the body's top edge (the shoulder) and of the sill's lower edge. */
  shoulderR: number;
  sillR: number;
  /** Plan-view rounding of the front and rear corners. */
  noseRound: number;
  tailRound: number;
  /** A period car's engine cover between its wings: the body narrows to this width ahead of the cowl. */
  noseWidth?: number;
  /** Side tuck under the waist (the sill narrower) and over it (the shoulder rolling in), as fractions. */
  tuckLow: number;
  tuckHigh: number;
  /** Arch radius over the tyre. */
  archR: number;
  /** Door cut lines (z) and the pillars between the side windows (z), with the pillar half-width. */
  doorCuts: readonly number[];
  pillars: readonly number[];
  pillarW: number;
  /** The rear end: notchback (a deck behind the rear window), hatch or estate (the rear window is the tail). */
  rear: 'notch' | 'hatch' | 'estate';
  /** A hatch's deck behind the rear glass falls to `tailH` like a notchback's (a Beetle's engine lid, a 2CV's boot). */
  tailSlope?: boolean;
  /** Side glass only between these stations (a panel van's cab); omitted, the whole greenhouse side. */
  sideGlassFrom?: number;
  sideGlassTo?: number;
  /** Window surround (black rubber, chrome on the period cars). */
  windowFrame?: VehicleMaterial;
  /** The roof's own material (a 2CV's rolled canvas, a two-tone roof); omitted, the body paint. */
  roofMat?: VehicleMaterial;
  /** The body behind a station in its own material (a woody's ash-framed wooden body behind the cowl). */
  rearMat?: { fromZ: number; mat: VehicleMaterial };
  /** The rear screen of a cab-like greenhouse (a pickup, a van's back door): only this share of the width (from the
   * centre) and of the height (from the roof down) is glass; omitted, the whole rear zone. `top` keeps that share of the
   * slope under the roof painted (the header over a fastback's small window); `split` a post down the middle (a van's
   * two back doors, a split rear window). */
  backlight?: { w: number; h: number; top?: number; split?: boolean };
  /** The side glass's height over the waist: the band above it to the roof's edge, and the windscreen above the same
   * rise, are painted (the period cars' and the vans' tall roof sides and the header over the screen); omitted, the
   * glass reaches the roof's edge. */
  glassH?: number;
  /** The radius of the roof's edge over the side glass (the period cars' rounded "turret tops"); omitted, 0.1 m. */
  roofEdgeR?: number;
  /** A two-pane windscreen: a bar down the middle. */
  splitScreen?: boolean;
  /** The greenhouse's own paint (a two-tone's upper colour: the pillars, the header and the back round the rear
   * window); omitted, the body's. */
  upperMat?: VehicleMaterial;
  /** Mobile tier: coarser stations and sections. */
  coarse?: boolean;
  /** Build only the lower body (a truck's wide front, a pickup's bed sides): no greenhouse. */
  lowerOnly?: boolean;
}

interface Section { x: Float64Array; y: Float64Array; }

/** The shared reading of a spec: the profile functions along z. */
export class CarProfile {
  readonly zNose: number;
  readonly zTail: number;
  readonly wheelY: number;
  readonly xWell: number;
  readonly s: CarBodySpec;
  constructor(s: CarBodySpec) {
    this.s = s;
    this.zNose = s.length / 2;
    this.zTail = -s.length / 2;
    this.wheelY = s.wheelR;
    // the well's inner wall: inboard of the tyre's inner face with a few centimetres of air
    this.xWell = Math.max(0.2, s.track / 2 - s.tyreW / 2 - 0.05);
  }

  /** Half-width at z, the plan's corners rounded. */
  halfW(z: number): number {
    const s = this.s;
    const w = s.noseWidth === undefined ? s.width / 2
      : lerp(s.width / 2, s.noseWidth / 2, smooth(s.cowlZ - 0.05, s.cowlZ + 0.35, z));
    if (z > this.zNose - s.noseRound) {
      const d = z - (this.zNose - s.noseRound);
      return w - s.noseRound + Math.sqrt(Math.max(0, s.noseRound * s.noseRound - d * d));
    }
    if (z < this.zTail + s.tailRound) {
      const d = (this.zTail + s.tailRound) - z;
      return w - s.tailRound + Math.sqrt(Math.max(0, s.tailRound * s.tailRound - d * d));
    }
    return w;
  }

  belt(z: number): number {
    const s = this.s;
    return s.belt + (s.beltRise ?? 0) * clamp((s.cowlZ - z) / Math.max(0.1, s.cowlZ - this.zTail), 0, 1);
  }

  /** Top of the lower body along the centre line (bonnet, waist, deck). */
  topY(z: number): number {
    const s = this.s;
    if (z >= s.cowlZ) {
      const t = (z - s.cowlZ) / Math.max(0.01, this.zNose - s.cowlZ);
      return lerp(this.belt(s.cowlZ) + 0.015, s.noseH, t * t * 0.55 + t * 0.45);
    }
    if ((s.rear !== 'notch' && !s.tailSlope) || z >= s.glassRearZ) return this.belt(z);
    const t = (s.glassRearZ - z) / Math.max(0.01, s.glassRearZ - this.zTail);
    return lerp(this.belt(s.glassRearZ) + 0.01, s.tailH, t * t * 0.5 + t * 0.5);
  }

  /** Underside of the body side: the sill, rising to the valances past the arches. */
  bottomY(z: number): number {
    const s = this.s;
    const frontEnd = s.frontAxle + s.archR * 0.9, rearEnd = s.rearAxle - s.archR * 0.9;
    if (z > frontEnd) return lerp(s.sill, s.noseBottom, smooth(frontEnd, this.zNose, z));
    if (z < rearEnd) return lerp(s.sill, s.tailBottom, smooth(rearEnd, this.zTail, z));
    return s.sill;
  }

  /** Top of the wheel arch at z (the lip), or -Infinity outside the arches. */
  archTop(z: number): number {
    const s = this.s;
    let top = -Infinity;
    for (const axle of [s.frontAxle, s.rearAxle]) {
      const d = z - axle;
      if (Math.abs(d) < s.archR) top = Math.max(top, this.wheelY + Math.sqrt(s.archR * s.archR - d * d) * 0.96);
    }
    return top;
  }

  private sideAt(y: number, hw: number, top: number): number {
    const s = this.s;
    const t = clamp((y - s.sill) / Math.max(0.05, top - s.sill), 0, 1);
    return hw * (1 - s.tuckLow * (1 - t) ** 3 - s.tuckHigh * t ** 3);
  }

  /** The outer side's x at (z, y), for parts hung on the doors. */
  sideX(z: number, y: number): number {
    return this.sideAt(y, this.halfW(z), this.topY(z));
  }

  /** The lower body's half-section at z, from the floor's centre round the side to the bonnet's centre. */
  section(z: number, coarse: boolean): Section {
    const s = this.s;
    const hw = this.halfW(z), top = this.topY(z), bottom = this.bottomY(z);
    const lip = Math.max(bottom, Math.min(this.archTop(z), top - s.shoulderR - 0.06));
    const xs: number[] = [], ys: number[] = [];
    const add = (x: number, y: number) => { xs.push(x); ys.push(y); };
    const xIn = Math.min(this.xWell, hw - 0.12);
    // floor and the well (collapsed where there is no arch)
    add(0, bottom + 0.02);
    add(xIn, bottom + 0.02);
    add(xIn, lip);
    // the side: from the lip (or the sill) up to the shoulder
    const r = Math.min(s.sillR, (top - lip) * 0.25);
    add(this.sideAt(lip + r, hw, top) - r, lip);
    add(this.sideAt(lip + r, hw, top) - r * 0.3, lip + r * 0.3);
    const sr = Math.min(s.shoulderR, (top - lip) * 0.45, hw * 0.5);
    const sideTop = top - sr;
    const sideN = coarse ? 2 : 3;
    for (let k = 0; k <= sideN; k++) {
      const y = lip + r + (sideTop - (lip + r)) * (k / sideN);
      add(this.sideAt(y, hw, top), y);
    }
    // the shoulder: a quarter round into the top
    const xs0 = this.sideAt(sideTop, hw, top);
    const shoulderN = coarse ? 1 : 3;
    for (let k = 1; k <= shoulderN; k++) {
      const a = (k / shoulderN) * Math.PI / 2;
      add(xs0 - sr + Math.cos(a) * sr, sideTop + Math.sin(a) * sr);
    }
    // the bonnet / deck, crowned across
    const xTop = xs0 - sr;
    const topN = coarse ? 1 : 3;
    const crown = z >= s.cowlZ || ((s.rear === 'notch' || s.tailSlope) && z < s.glassRearZ) ? s.bonnetCrown : 0;
    for (let k = 1; k <= topN; k++) {
      const x = xTop * (1 - k / topN);
      add(x, top + crown * (1 - (x / Math.max(0.01, xTop)) ** 2));
    }
    return { x: Float64Array.from(xs), y: Float64Array.from(ys) };
  }

  /** The greenhouse's height over the waist at z: zero at the cowl and the rear glass base, the roof between. */
  roofAt(z: number): number {
    const s = this.s;
    if (z >= s.roofFrontZ) {
      const t = clamp((s.cowlZ - z) / Math.max(0.01, s.cowlZ - s.roofFrontZ), 0, 1);
      return lerp(0, s.roofH - this.belt(z), Math.sin(t * Math.PI / 2) ** 0.9);
    }
    if (z <= s.roofRearZ) {
      const t = clamp((z - s.glassRearZ) / Math.max(0.01, s.roofRearZ - s.glassRearZ), 0, 1);
      const full = s.roofH - this.belt(z);
      // an estate's tailgate drops near-vertically; a hatch's rear screen is raked
      return s.rear === 'estate' ? lerp(0, full, s.backlight ? t : Math.min(1, t * 1.6)) : lerp(0, full, Math.sin(t * Math.PI / 2) ** 0.8);
    }
    return s.roofH - this.belt(z);
  }

  /** The greenhouse's half-width at the waist (z) and at the roof. */
  ghBase(z: number): number { return this.halfW(z) - this.s.shoulderR * 0.6; }
}

/** The greenhouse section's rows: the side glass band (with its thin frame row), the roof corner, the roof. */
const GH_SIDE_T = [0, 0.09, 0.5, 1];
const GH_CORNER = 2, GH_ROOF = 4;

/**
 * The lower body and the greenhouse of a car (or a car-derived van or pickup front), mirrored: the body paint, the
 * wells and floor dark, the glass where the windows are and the pillars painted.
 */
export function carBody(mesh: VehicleMesh, spec: CarBodySpec, paint: VehicleMaterial = PAINT): CarProfile {
  const prof = new CarProfile(spec);
  const coarse = !!spec.coarse;
  const features: number[] = [spec.cowlZ, spec.glassRearZ, ...spec.doorCuts];
  for (const axle of [spec.frontAxle, spec.rearAxle]) {
    const n = coarse ? 4 : 6;
    for (let k = 0; k <= n; k++) features.push(axle + spec.archR * Math.cos((k / n) * Math.PI) * 0.999);
  }
  const rounds = coarse ? 1 : 3;
  for (let k = 1; k <= rounds; k++) {
    features.push(prof.zNose - spec.noseRound * (1 - Math.cos((k / rounds) * Math.PI / 2)));
    features.push(prof.zTail + spec.tailRound * (1 - Math.cos((k / rounds) * Math.PI / 2)));
  }
  const zs = stations(prof.zTail, prof.zNose, coarse ? 0.36 : 0.26, features);
  const sections = zs.map((z) => prof.section(z, coarse));
  const nj = sections[0].x.length - 1;
  mesh.mirrored(() => {
    mesh.grid(zs.length - 1, nj, (i, j, out) => {
      out[0] = sections[i].x[j]; out[1] = sections[i].y[j]; out[2] = zs[i];
    }, (i, j) => (j < 3 ? UNDER : spec.rearMat && (zs[i] + zs[i + 1]) / 2 < spec.rearMat.fromZ ? spec.rearMat.mat : paint),
    { creaseJ: [1, 2, 3] });
    // the front and rear faces: the end sections fanned from the centre
    for (const end of [0, zs.length - 1]) {
      const sec = sections[end], z = zs[end], nz = end === 0 ? 1 : -1;
      const c = mesh.vert(0, (sec.y[0] + sec.y[nj]) / 2, z, 0, 0, nz, paint);
      const ring: number[] = [];
      for (let j = 0; j <= nj; j++) ring.push(mesh.vert(sec.x[j], sec.y[j], z, 0, 0, nz, paint));
      for (let j = 0; j < nj; j++) {
        if (end === 0) mesh.tri(c, ring[j], ring[j + 1]);
        else mesh.tri(c, ring[j + 1], ring[j]);
      }
    }
  });
  if (!spec.lowerOnly) greenhouse(mesh, prof, paint);
  return prof;
}

function greenhouse(mesh: VehicleMesh, prof: CarProfile, paint: VehicleMaterial): void {
  const s = prof.s, coarse = !!s.coarse;
  const frame = s.windowFrame ?? TRIM;
  const header = s.glassH !== undefined, glassH = s.glassH ?? 0;
  const centre = s.splitScreen || s.backlight?.split ? 1 : 0;
  const features = [s.roofFrontZ, s.roofRearZ, ...s.pillars.flatMap((p) => [p - s.pillarW, p + s.pillarW])];
  if (s.sideGlassFrom !== undefined) features.push(s.sideGlassFrom);
  if (s.sideGlassTo !== undefined) features.push(s.sideGlassTo);
  // the windscreen's top: where its rise from the cowl reaches the side glass's height (the painted header above)
  let zScreenTop = s.roofFrontZ;
  if (header && prof.roofAt(s.roofFrontZ) > glassH) {
    let lo = s.roofFrontZ, hi = s.cowlZ;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (prof.roofAt(mid) > glassH) lo = mid; else hi = mid;
    }
    zScreenTop = (lo + hi) / 2;
    features.push(zScreenTop);
  }
  const rakeN = coarse ? 2 : 4, rearN = s.backlight ? (coarse ? 3 : 6) : rakeN;
  for (let k = 1; k < rakeN; k++) features.push(lerp(s.cowlZ, zScreenTop, k / rakeN));
  if (zScreenTop !== s.roofFrontZ && !coarse) features.push((zScreenTop + s.roofFrontZ) / 2);
  for (let k = 1; k < rearN; k++) features.push(lerp(s.glassRearZ, s.roofRearZ, k / rearN));
  const zs = stations(s.glassRearZ, s.cowlZ, coarse ? 0.4 : 0.26, features);
  const nSide = header ? 4 : GH_SIDE_T.length - 1, nRoof = GH_ROOF + centre, nj = nSide + GH_CORNER + nRoof;
  const secX: Float64Array[] = [], secY: Float64Array[] = [];
  for (const z of zs) {
    const h = prof.roofAt(z);
    const baseY = prof.topY(z);
    const baseX = prof.ghBase(z);
    const roofX = baseX * s.roofTaper;
    const rr = s.roofEdgeR === undefined ? Math.min(0.1, h * 0.3) : Math.min(s.roofEdgeR, h * 0.4);
    const xs = new Float64Array(nj + 1), ys = new Float64Array(nj + 1);
    const tg = header ? clamp(glassH / Math.max(1e-4, h - rr), 0, 1) : 1;
    const sideT = header ? [0, 0.09 * tg, 0.55 * tg, tg, 1] : GH_SIDE_T;
    for (let k = 0; k <= nSide; k++) {
      const t = sideT[k];
      ys[k] = baseY + (h - rr) * t;
      xs[k] = lerp(baseX, roofX + (baseX - roofX) * 0.0, t * (0.8 + 0.2 * t));
    }
    for (let k = 1; k <= GH_CORNER; k++) {
      const a = (k / GH_CORNER) * Math.PI / 2;
      xs[nSide + k] = xs[nSide] - rr + Math.cos(a) * rr;
      ys[nSide + k] = baseY + h - rr + Math.sin(a) * rr;
    }
    const x0 = xs[nSide] - rr;
    // with a centre bar the roof's last row is a narrow strip either side of the centre line
    const xc = centre ? Math.min(0.028, x0 * 0.2) : 0;
    for (let k = 1; k <= GH_ROOF; k++) {
      const x = xc + (x0 - xc) * (1 - k / GH_ROOF);
      xs[nSide + GH_CORNER + k] = x;
      ys[nSide + GH_CORNER + k] = baseY + h + s.roofCrown * (1 - (x / Math.max(0.01, x0)) ** 2);
    }
    if (centre) { xs[nj] = 0; ys[nj] = baseY + h + s.roofCrown; }
    secX.push(xs); secY.push(ys);
  }
  const inPillar = (z: number) => s.pillars.some((p) => Math.abs(z - p) < s.pillarW);
  const bodyAt = (z: number) => (s.rearMat && z < s.rearMat.fromZ ? s.rearMat.mat : paint);
  const upperAt = (z: number) => s.upperMat ?? bodyAt(z);
  const sideGlass = (z: number) => (s.sideGlassFrom === undefined || z <= s.sideGlassFrom)
    && (s.sideGlassTo === undefined || z >= s.sideGlassTo);
  const roof0 = nSide + GH_CORNER;
  const matAt = (i: number, j: number): VehicleMaterial => {
    const zMid = (zs[i] + zs[i + 1]) / 2;
    const windscreen = zMid > s.roofFrontZ, rearScreen = zMid < s.roofRearZ;
    // the screen's glass is the rise below its top; above it (with a header) the roof's paint
    const screen = windscreen && zMid > zScreenTop;
    if (j < nSide) {
      // the side glass band; behind a notchback's rear door the quarter is the C-pillar
      if (inPillar(zMid) || !sideGlass(zMid) || (rearScreen && s.rear === 'notch')) return upperAt(zMid);
      if (header && j === nSide - 1) return upperAt(zMid);
      if (j === 0) return frame;
      return GLASS;
    }
    if (j < roof0) return screen || (rearScreen && !s.backlight) ? frame : upperAt(zMid);
    const middle = centre && j === nj - 1;
    if (rearScreen && s.backlight) {
      // the back face is the rear zone's top columns: rows near the roof are its top (by height: a fastback's or a
      // notchback's eased slope keeps its window off the roof's curve), columns near the centre its middle
      if (middle && s.backlight.split) return upperAt(zMid);
      const up = prof.roofAt(zMid) / Math.max(0.01, s.roofH - prof.belt(zMid));
      const outer = secX[i][j] / Math.max(1e-4, secX[i][roof0]); // the quad's outer edge as a share of the half-width
      return up > 1 - s.backlight.h && up < 1 - (s.backlight.top ?? 0) && outer <= s.backlight.w + 0.01 ? GLASS : upperAt(zMid);
    }
    if (screen) return middle && s.splitScreen ? frame : GLASS;
    if (rearScreen) return GLASS;
    return s.roofMat ?? (windscreen ? upperAt(zMid) : paint);
  };
  mesh.mirrored(() => {
    mesh.grid(zs.length - 1, nj, (i, j, out) => { out[0] = secX[i][j]; out[1] = secY[i][j]; out[2] = zs[i]; }, matAt,
      { creaseJ: [nSide] });
  });
}

// ---------------------------------------------------------------------------------------------------- box lofts

/** A rounded-rectangle section at one station: half-width, bottom and top, the top corners' radius, the top's crown
 * and how far the top narrows (tumblehome). Bottom corners take `rb`. */
export interface BoxSection {
  hw: number;
  y0: number;
  y1: number;
  r: number;
  rb?: number;
  crown?: number;
  tumble?: number;
}

/**
 * A closed box-like body lofted along z (stations descending from the front): cabs, bonnets, van and bus bodies,
 * cargo boxes, tanks. `ys` adds side rows at given heights (window sills and heads) so a window's edges are crisp;
 * `matAt(zMid, yMid, part)` colours each quad (part: 'bottom' | 'side' | 'corner' | 'top'); the front and back are
 * capped flat with `capMat(end)` (or left open when it returns null).
 */
export function boxLoft(mesh: VehicleMesh, zs: readonly number[], sec: (z: number) => BoxSection,
  matAt: (zMid: number, yMid: number, part: 'bottom' | 'side' | 'corner' | 'top') => VehicleMaterial,
  opts: { ys?: readonly number[]; capMat?: (end: 'front' | 'back') => VehicleMaterial | null; coarse?: boolean } = {}): void {
  const coarse = !!opts.coarse;
  const cornerN = coarse ? 1 : 3, topN = coarse ? 1 : 2, bottomCornerN = 1;
  type Pt = { x: number; y: number; part: 'bottom' | 'side' | 'corner' | 'top' };
  const sectionAt = (z: number): Pt[] => {
    const q = sec(z);
    const r = Math.min(q.r, (q.y1 - q.y0) * 0.45, q.hw * 0.9), rb = Math.min(q.rb ?? 0.02, (q.y1 - q.y0) * 0.3, q.hw * 0.5);
    const tumble = q.tumble ?? 0;
    const sideX = (y: number) => q.hw - tumble * clamp((y - q.y0) / Math.max(0.01, q.y1 - q.y0), 0, 1);
    const pts: Pt[] = [{ x: 0, y: q.y0, part: 'bottom' }];
    pts.push({ x: q.hw - rb, y: q.y0, part: 'bottom' });
    for (let k = 1; k <= bottomCornerN; k++) {
      const a = -Math.PI / 2 + (k / bottomCornerN) * Math.PI / 2;
      pts.push({ x: q.hw - rb + Math.cos(a) * rb, y: q.y0 + rb + Math.sin(a) * rb, part: 'side' });
    }
    const sideTop = q.y1 - r;
    const rows = [q.y0 + rb, ...(opts.ys ?? []).filter((y) => y > q.y0 + rb + 0.01 && y < sideTop - 0.01), sideTop];
    for (let k = 1; k < rows.length; k++) pts.push({ x: sideX(rows[k]), y: rows[k], part: 'side' });
    const x0 = sideX(sideTop);
    for (let k = 1; k <= cornerN; k++) {
      const a = (k / cornerN) * Math.PI / 2;
      pts.push({ x: x0 - r + Math.cos(a) * r, y: sideTop + Math.sin(a) * r, part: 'corner' });
    }
    const xt = x0 - r;
    for (let k = 1; k <= topN; k++) {
      const x = xt * (1 - k / topN);
      pts.push({ x, y: q.y1 + (q.crown ?? 0) * (1 - (x / Math.max(0.01, xt)) ** 2), part: 'top' });
    }
    return pts;
  };
  const secs = zs.map(sectionAt);
  const nj = secs[0].length - 1;
  for (const s of secs) if (s.length !== nj + 1) throw new Error('boxLoft: the window rows must sit inside every section');
  mesh.mirrored(() => {
    mesh.grid(zs.length - 1, nj, (i, j, out) => { out[0] = secs[i][j].x; out[1] = secs[i][j].y; out[2] = zs[i]; },
      (i, j) => matAt((zs[i] + zs[i + 1]) / 2, (secs[i][j].y + secs[i][j + 1].y + secs[i + 1][j].y + secs[i + 1][j + 1].y) / 4,
        secs[i][j + 1].part), { creaseJ: [1] });
    for (const end of [0, zs.length - 1]) {
      const m = opts.capMat ? opts.capMat(end === 0 ? 'front' : 'back') : matAt(zs[end], 0, 'side');
      if (!m) continue;
      const sc = secs[end], z = zs[end], nz = end === 0 ? 1 : -1;
      const c = mesh.vert(0, (sc[0].y + sc[nj].y) / 2, z, 0, 0, nz, m);
      const ring = sc.map((p) => mesh.vert(p.x, p.y, z, 0, 0, nz, m));
      for (let j = 0; j < nj; j++) {
        if (end === 0) mesh.tri(c, ring[j], ring[j + 1]);
        else mesh.tri(c, ring[j + 1], ring[j]);
      }
    }
  });
}

// ---------------------------------------------------------------------------------------------------- cab lofts

/** A cab's plan at one height: front and back z, half-width, plan corner radius. */
export interface CabPlan {
  zF: number;
  zB: number;
  hw: number;
  r: number;
}

export type CabFace = 'front' | 'side' | 'back' | 'corner';

/**
 * A cab (or a van's front, a bus or tram body) lofted UP through plan sections: the windscreen raked by letting the
 * front recede with height, the sides leaning in, the roof's edge rounded by the last stations closing in, the roof a
 * flat cap. `ys` are the station heights (bottom to the roof's edge); `roofR` rounds the roof edge over the top
 * `roofR` metres. The perimeter (half, from the front centre round to the back centre) breaks at `frontBreaks` (x
 * fractions of the front's flat half), `sideBreaks` (z fractions along the side's flat) and `backBreaks`, so window
 * edges fall on vertices. `matAt(yMid, face, u)` colours each quad: u is x/hw on the front and back faces, the z
 * fraction from front (0) to back (1) along the side.
 */
export function cabLoft(mesh: VehicleMesh, ys: readonly number[], plan: (y: number) => CabPlan,
  matAt: (yMid: number, face: CabFace, u: number) => VehicleMaterial,
  opts: { roofR?: number; frontBreaks?: readonly number[]; sideBreaks?: readonly number[]; backBreaks?: readonly number[];
    roofMat?: VehicleMaterial; floorMat?: VehicleMaterial | null; coarse?: boolean } = {}): void {
  const coarse = !!opts.coarse;
  const cornerN = coarse ? 2 : 3;
  const roofR = opts.roofR ?? 0;
  const yTop = ys[ys.length - 1];
  const stations = [...ys];
  if (roofR > 0) {
    const n = coarse ? 2 : 3;
    for (let k = 1; k <= n; k++) stations.push(yTop + roofR * Math.sin((k / n) * Math.PI / 2));
  }
  const fb = [0, ...(opts.frontBreaks ?? []), 1];
  const sb = [0, ...(opts.sideBreaks ?? []), 1];
  const bb = [1, ...[...(opts.backBreaks ?? [])].reverse(), 0];
  type P = { x: number; z: number; face: CabFace; u: number };
  const ring = (y: number): P[] => {
    const inset = y > yTop && roofR > 0 ? roofR - Math.sqrt(Math.max(0, roofR * roofR - (y - yTop) ** 2)) : 0;
    const q = plan(Math.min(y, yTop));
    const hw = q.hw - inset, zF = q.zF - inset, zB = q.zB + inset, r = Math.max(0.005, Math.min(q.r, hw * 0.9, (zF - zB) * 0.45));
    const pts: P[] = [];
    for (const f of fb) pts.push({ x: (hw - r) * f, z: zF, face: 'front', u: ((hw - r) * f) / hw });
    for (let k = 1; k < cornerN; k++) {
      const a = (k / cornerN) * Math.PI / 2;
      pts.push({ x: hw - r + Math.sin(a) * r, z: zF - r + Math.cos(a) * r, face: 'corner', u: 0 });
    }
    for (const f of sb) pts.push({ x: hw, z: lerp(zF - r, zB + r, f), face: 'side', u: f });
    for (let k = 1; k < cornerN; k++) {
      const a = (k / cornerN) * Math.PI / 2;
      pts.push({ x: hw - r + Math.cos(a) * r, z: zB + r - Math.sin(a) * r, face: 'corner', u: 1 });
    }
    for (const f of bb) pts.push({ x: (hw - r) * f, z: zB, face: 'back', u: ((hw - r) * f) / hw });
    return pts;
  };
  const rings = stations.map(ring);
  const nj = rings[0].length - 1;
  mesh.mirrored(() => {
    mesh.grid(stations.length - 1, nj, (i, j, out) => { out[0] = rings[i][j].x; out[1] = stations[i]; out[2] = rings[i][j].z; },
      (i, j) => {
        const yMid = (stations[i] + stations[i + 1]) / 2;
        if (stations[i] >= yTop - 1e-6 && roofR > 0) return opts.roofMat ?? matAt(yMid, 'side', 0.5);
        const a = rings[i][j], b = rings[i][j + 1];
        const face: CabFace = a.face === b.face ? a.face : (a.face === 'corner' || b.face === 'corner' ? 'corner' : a.face);
        const u = face === 'side' ? (a.u + b.u) / 2 : (Math.abs(a.u) + Math.abs(b.u)) / 2;
        return matAt(yMid, face, u);
      }, { flip: true });
    // the roof cap and the floor
    const roof = rings[rings.length - 1], yR = stations[stations.length - 1];
    const roofM = opts.roofMat ?? matAt(yR, 'side', 0.5);
    const cTop = mesh.vert(0, yR, (roof[0].z + roof[nj].z) / 2, 0, 1, 0, roofM);
    const ringTop = roof.map((p) => mesh.vert(p.x, yR, p.z, 0, 1, 0, roofM));
    for (let j = 0; j < nj; j++) mesh.tri(cTop, ringTop[j], ringTop[j + 1]);
    if (opts.floorMat !== null) {
      const floor = rings[0], y0 = stations[0], fm = opts.floorMat ?? UNDER;
      const cB = mesh.vert(0, y0, (floor[0].z + floor[nj].z) / 2, 0, -1, 0, fm);
      const ringB = floor.map((p) => mesh.vert(p.x, y0, p.z, 0, -1, 0, fm));
      for (let j = 0; j < nj; j++) mesh.tri(cB, ringB[j + 1], ringB[j]);
    }
  });
}

// ---------------------------------------------------------------------------------------------------- car details

export interface CarDetailSpec {
  /** Door handles (chrome or black) and their z, mirrors at the front door's leading edge. */
  handles?: VehicleMaterial;
  mirrors?: 'door' | 'wing' | 'none';
  mirrorMat?: VehicleMaterial;
  wipers?: boolean;
  /** Seams for the doors' cuts and the bonnet / boot shut lines. */
  seams?: boolean;
  /** A rubbing strip or chrome trim along the side at this height. */
  sideTrim?: { y: number; mat: VehicleMaterial };
}

/** Door seams, handles, mirrors, wipers and side trim on a car body. */
export function carDetails(mesh: VehicleMesh, prof: CarProfile, d: CarDetailSpec): void {
  const s = prof.s, coarse = !!s.coarse;
  mesh.mirrored(() => {
    if (d.seams !== false && !coarse) {
      for (const z of s.doorCuts) {
        const lo = Math.max(prof.bottomY(z), prof.archTop(z)) + 0.05, hi = prof.belt(z) - 0.01;
        const pts: Vec3[] = [], ns: Vec3[] = [];
        for (let k = 0; k <= 4; k++) {
          const y = lerp(lo, hi, k / 4);
          pts.push([prof.sideX(z, y), y, z]);
          ns.push([1, 0, 0]);
        }
        mesh.dressing(() => seam(mesh, pts, ns, 0.01));
      }
    }
    if (d.handles) {
      for (let k = 0; k + 1 < s.doorCuts.length; k++) {
        const z = s.doorCuts[k + 1] + 0.16, y = prof.belt(z) - 0.09;
        const x = prof.sideX(z, y);
        mesh.dressing(() => mesh.box(x + 0.012, y, z, 0.02, 0.025, 0.13, d.handles!, 0.006));
      }
    }
    if (d.sideTrim) {
      const y = d.sideTrim.y, z0 = s.frontAxle + s.archR * 1.05, z1 = s.rearAxle - s.archR * 1.05;
      const zA = s.frontAxle - s.archR * 1.05, zB = s.rearAxle + s.archR * 1.05;
      for (const [a, b] of [[zA, zB], [prof.zNose - s.noseRound, z0], [z1, prof.zTail + s.tailRound]]) {
        if (a - b < 0.1 || prof.archTop((a + b) / 2) > y) continue;
        const pts: Vec3[] = [], ns: Vec3[] = [];
        for (let k = 0; k <= 4; k++) { const z = lerp(a, b, k / 4); pts.push([prof.sideX(z, y) + 0.004, y, z]); ns.push([1, 0, 0]); }
        mesh.dressing(() => seam(mesh, pts, ns, 0.022, d.sideTrim!.mat));
      }
    }
    if (d.mirrors && d.mirrors !== 'none') {
      const m = d.mirrorMat ?? TRIM;
      const z = d.mirrors === 'door' ? s.cowlZ - 0.1 : s.frontAxle - s.archR * 0.2;
      const y = d.mirrors === 'door' ? prof.belt(z) + 0.06 : prof.topY(z) + 0.05;
      const x = d.mirrors === 'door' ? prof.ghBase(z) + 0.02 : prof.halfW(z) - 0.12;
      mesh.outboard(() => {
        mesh.box(x + 0.06, y, z, 0.12, 0.025, 0.03, m);
        mesh.box(x + 0.13, y + 0.04, z - 0.01, 0.05, 0.09, 0.13, m, 0.012);
      });
    }
  });
  if (d.wipers && !coarse) {
    for (const x of [-0.18, 0.28]) {
      const z = s.cowlZ - 0.03, y = prof.belt(z) + 0.04;
      mesh.push().translate(x, y, z).rotateZ(0.12).rotateX(-0.45);
      mesh.dressing(() => mesh.box(0, 0, 0, 0.42, 0.012, 0.012, TRIM));
      mesh.pop();
    }
  }
}

/** A bumper across the nose (end 1) or the tail (-1): a chrome blade, a painted bar or a black block, wrapped round the corners. */
export function bumper(mesh: VehicleMesh, prof: CarProfile, end: 1 | -1, y: number, h: number,
  style: 'chrome' | 'painted' | 'black' | 'tube', paint: VehicleMaterial = PAINT, overriders = false): void {
  const s = prof.s;
  const zFace = end > 0 ? prof.zNose : prof.zTail;
  const m = style === 'chrome' ? CHROME : style === 'painted' ? paint : style === 'tube' ? STEEL : TRIM;
  const depth = style === 'black' ? 0.12 : 0.07;
  const hw = s.width / 2 + (style === 'black' ? 0.01 : 0.02);
  // the bar, its ends swept back round the corners
  const pts: Vec3[] = [];
  const n = 8;
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = lerp(-hw, hw, t);
    const wrap = smooth(0.72, 1.0, Math.abs(x) / hw);
    pts.push([x, y, zFace + end * (depth * 0.5 + 0.02 - wrap * (s.noseRound * 0.8 + 0.08))]);
  }
  const section: [number, number][] = style === 'tube'
    ? Array.from({ length: 8 }, (_, k) => [Math.cos(k / 8 * Math.PI * 2) * h / 2, Math.sin(k / 8 * Math.PI * 2) * h / 2] as [number, number])
    : [[-depth / 2, -h / 2], [depth / 2, -h / 2], [depth / 2 + 0.01, 0], [depth / 2, h / 2], [-depth / 2, h / 2]];
  mesh.sweep(pts, section, () => m, { closedSection: true, caps: true, up: [0, 1, 0] });
  // brackets into the body
  for (const x of [-hw * 0.55, hw * 0.55]) mesh.box(x, y, zFace + end * 0.01, 0.06, 0.05, 0.06, UNDER);
  if (overriders) {
    for (const x of [-0.32, 0.32]) mesh.box(x, y + h * 0.4, zFace + end * (depth + 0.03), 0.06, h * 1.9, 0.07, m, 0.02);
  }
}

// ---------------------------------------------------------------------------------------------------- wheels

export interface WheelSpec {
  r: number;
  w: number;
  /** Rim radius over the tyre radius. */
  rim: number;
  style: 'hubcap' | 'car' | 'truck' | 'spoke' | 'disc';
  rimMat?: VehicleMaterial;
  dual?: boolean;
  coarse?: boolean;
  /** A flat (burnt) wheel: the bare rim on the ground, no tyre. */
  bare?: boolean;
}

/**
 * A wheel at (x, y, z), its outer face toward +x when `side` is 1: the tyre turned with rounded shoulders, a
 * sidewall bulge and tread blocks round the crown; the rim dished in with a hub (a chrome cap on a car, nuts and a
 * hub on a truck, spokes on the old ones). The tyre's inner wall is one band (the arch hides it).
 */
export function wheel(mesh: VehicleMesh, x: number, y: number, z: number, side: 1 | -1, spec: WheelSpec): void {
  const segs = spec.coarse ? 10 : 12;
  const r = spec.r, w = spec.w, rr = r * spec.rim;
  mesh.push().translate(x, y, z).scale(side, 1, 1);
  const tyre: [number, number][] = spec.coarse
    ? [[rr * 0.97, -w * 0.45], [r, -w * 0.32], [r, w * 0.32], [r * 0.9, w * 0.5], [rr * 0.99, w * 0.43]]
    : [
      [rr * 0.97, -w * 0.45], [r * 0.97, -w * 0.48], [r, -w * 0.3], [r, w * 0.3], [r * 0.975, w * 0.44],
      [r * 0.9, w * 0.5], [r * 0.8, w * 0.49], [rr * 0.99, w * 0.43],
    ];
  if (!spec.bare) {
    const tread = spec.coarse ? undefined : (k: number, sIdx: number) => ((k === 2 || k === 3) ? (sIdx % 2 === 0 ? 1.0 : 0.982) : 1);
    mesh.lathe(tyre, spec.coarse ? segs : segs * 2, (k) => (spec.coarse ? (k === 1 ? RUBBER : TYRE_WALL) : k >= 1 && k <= 3 ? RUBBER : TYRE_WALL),
      tread ? { radial: tread } : {});
  }
  // rim: a dish from the bead seat into the hub
  const rimMat = spec.rimMat ?? RIM_STEEL;
  const face = w * 0.42;
  const rim: [number, number][] = spec.bare
    ? [[rr, -w * 0.4], [rr * 1.04, -w * 0.38], [rr * 1.04, face], [rr * 0.9, face - 0.02], [rr * 0.5, face - 0.04], [rr * 0.3, face - 0.02]]
    : [[rr * 0.99, face], [rr * 0.9, face - 0.02], [rr * 0.55, face - 0.045], [rr * 0.3, face - 0.02]];
  mesh.lathe(rim, segs, () => rimMat);
  if (spec.style === 'hubcap' || spec.style === 'car') {
    const cap: [number, number][] = [[rr * 0.62, face - 0.03], [rr * 0.5, face + 0.008], [rr * 0.25, face + 0.03], [0.0001, face + 0.036]];
    mesh.lathe(cap, segs, () => (spec.style === 'hubcap' ? CHROME : rimMat));
  } else if (spec.style === 'truck' || spec.style === 'disc') {
    const hub: [number, number][] = [[rr * 0.34, face - 0.02], [rr * 0.32, face + 0.05], [rr * 0.17, face + 0.07], [0.0001, face + 0.075]];
    mesh.lathe(hub, spec.coarse ? 8 : 10, () => STEEL);
    if (!spec.coarse && spec.style === 'truck') {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        mesh.box(face - 0.01, Math.cos(a) * rr * 0.44, Math.sin(a) * rr * 0.44, 0.035, 0.03, 0.03, STEEL);
      }
    }
  } else if (spec.style === 'spoke') {
    const hub: [number, number][] = [[rr * 0.3, face - 0.06], [rr * 0.28, face + 0.02], [0.0001, face + 0.04]];
    mesh.lathe(hub, 10, () => STEEL);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      mesh.push().translate(face - 0.05, 0, 0).rotateX(a);
      mesh.box(0, rr * 0.62, 0, 0.05, rr * 0.66, 0.07, rimMat);
      mesh.pop();
    }
  }
  if (spec.dual && !spec.bare) {
    // the inner twin: mostly hidden behind the outer tyre, so a plain turn without the tread
    mesh.push().translate(-w * 1.04, 0, 0);
    mesh.lathe([[rr * 0.97, -w * 0.45], [r, -w * 0.32], [r, w * 0.32], [r * 0.9, w * 0.5]], segs, (k) => (k === 1 ? RUBBER : TYRE_WALL));
    mesh.pop();
  }
  mesh.pop();
}

// ---------------------------------------------------------------------------------------------------- lamps & co

/** A round lamp on a face pointing +z (or -z with dir -1): a bezel ring, a domed lens. */
export function roundLamp(mesh: VehicleMesh, x: number, y: number, z: number, r: number, lens: VehicleMaterial,
  bezel: VehicleMaterial, dir: 1 | -1 = 1, depth = 0.05, segs = 12): void {
  mesh.push().translate(x, y, z).rotateY(dir > 0 ? -Math.PI / 2 : Math.PI / 2);
  // along local +x (outward): the bezel's back, its ring, the lens dome
  mesh.lathe([[r * 1.1, -depth], [r * 1.15, 0.004], [r * 1.0, 0.014]], segs, () => bezel);
  mesh.lathe([[r * 1.0, 0.012], [r * 0.7, 0.026], [0.0001, 0.032]], segs, () => lens);
  mesh.pop();
}

/** A rectangular lamp lens on a face pointing +z (or -z), with a thin frame. */
export function rectLamp(mesh: VehicleMesh, x: number, y: number, z: number, w: number, h: number, lens: VehicleMaterial,
  frame: VehicleMaterial, dir: 1 | -1 = 1): void {
  mesh.box(x, y, z + dir * 0.008, w + 0.025, h + 0.025, 0.018, frame, 0.004);
  mesh.box(x, y, z + dir * 0.019, w, h, 0.01, lens, 0.003);
}

/** A grille on a face pointing +z: a frame and bars (vertical, horizontal, a cross mesh or slots) over a dark recess. */
export function grille(mesh: VehicleMesh, x: number, y: number, z: number, w: number, h: number,
  style: 'vbars' | 'hbars' | 'mesh' | 'slots', bar: VehicleMaterial, frame: VehicleMaterial, count: number): void {
  mesh.box(x, y, z - 0.012, w, h, 0.026, INTERIOR);
  const t = 0.025;
  mesh.box(x, y + h / 2, z + 0.004, w + t, t, 0.028, frame, 0.006);
  mesh.box(x, y - h / 2, z + 0.004, w + t, t, 0.028, frame, 0.006);
  mesh.box(x - w / 2, y, z + 0.004, t, h, 0.028, frame, 0.006);
  mesh.box(x + w / 2, y, z + 0.004, t, h, 0.028, frame, 0.006);
  if (style === 'vbars' || style === 'mesh') {
    for (let k = 1; k < count; k++) mesh.box(x - w / 2 + (w * k) / count, y, z + 0.002, 0.012, h - 0.01, 0.02, bar);
  }
  if (style === 'hbars' || style === 'mesh' || style === 'slots') {
    const n = style === 'mesh' ? Math.max(2, Math.round(count * h / w)) : count;
    for (let k = 1; k < n; k++) mesh.box(x, y - h / 2 + (h * k) / n, z + 0.002, w - 0.01, style === 'slots' ? 0.026 : 0.012, 0.02, bar);
  }
}

/** A number plate on a face pointing +z (or -z). */
export function plate(mesh: VehicleMesh, x: number, y: number, z: number, w: number, h: number, dir: 1 | -1, m: VehicleMaterial = PLATE): void {
  mesh.box(x, y, z + dir * 0.006, w, h, 0.01, m, 0.003);
  mesh.box(x, y, z + dir * 0.0115, w * 0.86, h * 0.5, 0.002, TRIM);
}

/** A thin seam on a surface: a strip through points with their outward normals, lifted a few millimetres. */
export function seam(mesh: VehicleMesh, points: readonly Vec3[], normals: readonly Vec3[], width = 0.012, m: VehicleMaterial = TRIM): void {
  if (points.length < 2) return;
  const lift = 0.003;
  const verts: number[] = [];
  for (let k = 0; k < points.length; k++) {
    const p = points[k], n = normals[k];
    const prev = points[Math.max(0, k - 1)], next = points[Math.min(points.length - 1, k + 1)];
    const t: Vec3 = [next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]];
    let bx = n[1] * t[2] - n[2] * t[1], by = n[2] * t[0] - n[0] * t[2], bz = n[0] * t[1] - n[1] * t[0];
    const l = Math.hypot(bx, by, bz) || 1; bx /= l; by /= l; bz /= l;
    const q: Vec3 = [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift];
    verts.push(mesh.vert(q[0] - bx * width / 2, q[1] - by * width / 2, q[2] - bz * width / 2, n[0], n[1], n[2], m));
    verts.push(mesh.vert(q[0] + bx * width / 2, q[1] + by * width / 2, q[2] + bz * width / 2, n[0], n[1], n[2], m));
  }
  for (let k = 0; k + 1 < points.length; k++) {
    const a = verts[k * 2], b = verts[k * 2 + 1], c = verts[k * 2 + 3], d = verts[k * 2 + 2];
    // wound to face the given normal: the strip's side vector is n x t, so (a, b, c) turns about n
    mesh.tri(a, c, b); mesh.tri(a, d, c);
  }
}

export { clamp, lerp, smooth };
