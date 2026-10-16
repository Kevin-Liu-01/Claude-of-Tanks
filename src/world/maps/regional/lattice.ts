// src/world/maps/regional/lattice.ts — the open frames several kits stand their tanks, wheels and radomes on (props
// census #3, lane B 2026-10-14; the judges on the queenstown trestle, the navajo windmill, the glencanyon tank and the
// arctic radar tower: "no diagonal braces", "girts at two levels and only two diagonals", "the legs plunge to -0.4 m
// with no anchor piers", and every one falling as solid drums through the shaft reading).
//
// latticeFrame lays four legs (tapering or plumb) from their footings to their heads, the girts round them at the
// panel heights and the X braces in every panel of every face, on concrete pads or piers; it records the frame
// (recordLattice, kept in the kit's plan beside its houses) so the damage reading (damage.ts describeLattice) brings
// the frame down as its members, not as a shaft's drums.
import { PartSink, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';

/** A lattice frame as its builder laid it, in the building's frame (PartSink.framePoint). */
export interface LatticeReading {
  /** the legs' feet and heads */
  legs: Array<{ foot: Vec3; head: Vec3 }>;
  /** the girt heights, foot to head */
  girts: number[];
  size: number;
  bucket: RegionalBucket;
  colour: Rgb | null;
  /** what stood on the frame (a tank, a wheel head, a radome): its box, bucket and tint */
  crown: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; bucket: string; tint: Rgb } | null;
  shed?: import('./shedFall.ts').ShedWreck; // an open shed's own reading (shedFall.ts recordShed): it falls as a shed
  /**
   * Which of the frame's faces (leg k to leg k + 1) are braced bays (absent: all): a portal crane's leg towers are braced
   * across their A-frames and stand open along the bridge (latticeFall.ts stands only the braced bays' girts and braces)
   */
  faces?: boolean[];
  /**
   * The share of its height the frame stands to when it falls (absent: latticeFall.ts LATTICE_STAND_SHARE; a column,
   * one leg, 0.8): a conveyor's trestle stands, bent at its head, when the gallery comes off it
   */
  stand?: number;
  /** a penstock run's own reading (penstockFall.ts): it falls as its pipe off its supports */
  penstock?: import('./penstockFall.ts').PenstockWreck;
}

/**
 * A frame a builder outside the regional kits laid (a catalog gantry: railKit.ts), carried on one of its geometries so its
 * damage kit (latticeFall.ts registerLatticeFrameKit) reads it from the parts: in the building's own frame.
 */
export function tagLatticeReading(geometry: { userData: Record<string, unknown> }, reading: LatticeReading): void {
  geometry.userData.latticeReading = reading;
}
/** The frame a builder outside the kits carried on its parts (tagLatticeReading), or null. */
export function latticeReadingOfParts(parts: Readonly<Record<string, readonly { userData: Record<string, unknown> }[]>>): LatticeReading | null {
  for (const list of Object.values(parts)) for (const g of list) if (g.userData?.latticeReading) return g.userData.latticeReading as LatticeReading;
  return null;
}

let latticeSink: LatticeReading[] | null = null;
/** Run a kit build keeping every lattice frame it lays (index.ts buildRegionalParts). */
export function withLattices<T>(build: () => T): [T, LatticeReading[]] {
  const prior = latticeSink, list: LatticeReading[] = [];
  latticeSink = list;
  try { return [build(), list]; } finally { latticeSink = prior; }
}

export interface LatticeSpec {
  /** the half spans of the square at the feet and at the heads (a plumb frame: equal) */
  foot: number;
  head: number;
  /** the frame's centre in the emitting frame, its foot and head heights */
  cx?: number;
  cz?: number;
  y0: number;
  y1: number;
  /** the legs' section, the girts' and braces' sections */
  size: number;
  girt: number;
  brace: number;
  /** the panel heights (girt levels, the head's included); X braces in every panel when `braces` */
  panels: number;
  braces?: boolean;
  bucket: RegionalBucket;
  colour?: Rgb;
  /** a concrete pad under each leg (bucket), sunk to -0.4 */
  pad?: { bucket: RegionalBucket; size: number; top: number } | null;
  /** the frame's members as dressing past its legs (the legs carry the collision) */
  mobile?: boolean;
}

/**
 * Lay a four-legged lattice frame (legs, girts at its panel heights, X braces in every panel of every face, pads) and
 * record it for the damage reading with what stands on it (`crown`, in the emitting frame). Returns the legs' heads.
 */
export function latticeFrame(sink: PartSink, spec: LatticeSpec, crown: LatticeReading['crown'] = null): Vec3[] {
  const cx = spec.cx ?? 0, cz = spec.cz ?? 0;
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const at = (k: number, y: number): Vec3 => {
    const t = (y - spec.y0) / Math.max(1e-6, spec.y1 - spec.y0), half = spec.foot + (spec.head - spec.foot) * t;
    return [cx + corners[k][0] * half, y, cz + corners[k][1] * half];
  };
  const opts = { ...(spec.colour ? { colour: spec.colour } : {}) };
  const legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  for (let k = 0; k < 4; k++) {
    const foot = at(k, spec.y0), head = at(k, spec.y1);
    const under: Vec3 = [foot[0] + (foot[0] - head[0]) * 0.4 / Math.max(1e-6, spec.y1 - spec.y0), -0.4, foot[2] + (foot[2] - head[2]) * 0.4 / Math.max(1e-6, spec.y1 - spec.y0)];
    sink.member(spec.bucket, spec.pad ? foot : under, head, spec.size, spec.size, [corners[k][0], 0, 0], { ...opts, exposed: true }, 0);
    if (spec.pad) {
      const p = spec.pad;
      sink.span(p.bucket, foot[0] - p.size / 2, -0.4, foot[2] - p.size / 2, foot[0] + p.size / 2, p.top, foot[2] + p.size / 2, { decor: true, shade: 0.9 });
    }
    legs.push({ foot: sink.framePoint(foot), head: sink.framePoint(head) });
  }
  const girts: number[] = [];
  sink.dressing(!!spec.mobile, () => {
    const n = Math.max(1, spec.panels);
    const levels = Array.from({ length: n + 1 }, (_, i) => spec.y0 + (spec.y1 - spec.y0) * (i / n));
    for (let i = 1; i <= n; i++) {
      const y = levels[i];
      girts.push(y);
      for (let k = 0; k < 4; k++) {
        const j = (k + 1) % 4;
        sink.member(spec.bucket, at(k, y), at(j, y), spec.girt, spec.girt, [0, 1, 0], { ...opts, decor: true, exposed: true }, 0);
      }
    }
    if (spec.braces !== false) {
      for (let i = 0; i < n; i++) {
        const ya = levels[i] + (i === 0 ? 0.3 : 0), yb = levels[i + 1];
        for (let k = 0; k < 4; k++) {
          const j = (k + 1) % 4;
          const out: Vec3 = [corners[k][0] + corners[j][0], 0, corners[k][1] + corners[j][1]];
          sink.member(spec.bucket, at(k, ya), at(j, yb), spec.brace, spec.brace, out, { ...opts, decor: true, exposed: true }, 0);
          sink.member(spec.bucket, at(j, ya), at(k, yb), spec.brace, spec.brace, out, { ...opts, decor: true, exposed: true }, 0);
        }
      }
    }
  });
  if (!girts.length) for (let i = 1; i <= Math.max(1, spec.panels); i++) girts.push(spec.y0 + (spec.y1 - spec.y0) * (i / Math.max(1, spec.panels)));
  if (latticeSink) {
    const c = crown ? (() => {
      const a = sink.framePoint([crown.x0, crown.y0, crown.z0]), b = sink.framePoint([crown.x1, crown.y1, crown.z1]);
      return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: a[1], y1: b[1], z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]), bucket: crown.bucket, tint: crown.tint };
    })() : null;
    latticeSink.push({ legs, girts, size: spec.size, bucket: spec.bucket, colour: spec.colour ?? null, crown: c });
  }
  return [at(0, spec.y1), at(1, spec.y1), at(2, spec.y1), at(3, spec.y1)];
}

/**
 * Record a frame a builder laid member by member itself (a headframe's battered legs and back-legs): its legs' feet
 * and heads and its crown in the emitting frame, so it falls as its frame (damage.ts describeLattice).
 */
export function recordLattice(sink: PartSink, legs: Array<{ foot: Vec3; head: Vec3 }>, girts: number[], size: number, bucket: RegionalBucket,
  colour: Rgb | null, crown: LatticeReading['crown'], shed?: LatticeReading['shed'],
  extra: Pick<LatticeReading, 'faces' | 'stand' | 'penstock'> = {}): void {
  if (!latticeSink) return;
  const c = crown ? (() => {
    const a = sink.framePoint([crown.x0, crown.y0, crown.z0]), b = sink.framePoint([crown.x1, crown.y1, crown.z1]);
    return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: a[1], y1: b[1], z0: Math.min(a[2], b[2]), z1: Math.max(a[2], b[2]), bucket: crown.bucket, tint: crown.tint };
  })() : null;
  latticeSink.push({ legs: legs.map((l) => ({ foot: sink.framePoint(l.foot), head: sink.framePoint(l.head) })), girts, size, bucket, colour, crown: c,
    ...(shed ? { shed } : {}), ...extra });
}
