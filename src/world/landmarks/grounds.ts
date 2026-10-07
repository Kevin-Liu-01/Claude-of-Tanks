// src/world/landmarks/grounds.ts — a set piece's grounds (the landmarks lane, 2026-10-06; gauntlet waves 154-158, both
// critics: "the landmarks exist but sit in no setting" — each stood alone on lawn, mud or sand with no square,
// churchyard, garden, paving, yard or approach).
//
// The grounds a builder lays round its piece, in the piece's frame:
//   - paving and paths draped over the real ground (the builder's `ground` sampler, so a slope keeps its paving on it):
//     a surface a few centimetres proud of the terrain on a metre grid, its edges skirted down into the ground, decor
//     (no collision: a hull drives over a square as over the road);
//   - enclosures as runs of the props' own destructible fence and wall modules (a churchyard's pickets, a yard's
//     wattle, a court's wire netting), with a gate in the gap: a hull breaks them as it breaks any other fence, and they
//     join the props pools once every seeded pass is done, so nothing else on the map moves for them;
//   - the furniture of a churchyard: graves under their crosses.
import { PartSink, type EmitOptions, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';

/** The ground over the piece's base at a point of its frame (LandmarkBuildContext.ground; flat when absent). */
export type GroundAt = ((lx: number, lz: number) => number) | undefined;

/** A set-piece destructible (types.ts LandmarkBuild.destructibles). */
export interface GroundsDestructible { kind: string; x: number; z: number; yawDeg: number; scale?: number }

/** A module's nominal length along its run (the props' destructible kinds: inhabitKit.ts DESTRUCTIBLE_TYPES' hl × 2). */
const MODULE_LENGTH: Readonly<Record<string, number>> = Object.freeze({
  fenceplank: 2.5, fencepicket: 2.5, fencewattle: 2.5, fencerail: 2.5, wallstone: 3.08, walladobe: 3.06, barbedwire: 2.64,
});
/** The gate module's span between its hinge post (its origin) and its latch post along its +z (inhabitKit.ts bGate), and
 * the gap left for it. */
const GATE_SPAN = 1.75, GATE_GAP = 2.3;

export interface FenceRunOptions {
  /** a gate's gap centred this far along the run (m) */
  gateAt?: number;
  /** the destructible hung in the gap ('gate'), or null for an open gap */
  gate?: string | null;
  /** the gap's width (default the gate's) */
  gap?: number;
}

/**
 * A straight run of fence or wall modules from a to b (the piece's frame, x and z), each module scaled to close the run
 * exactly; a gap for a gate where asked. Appends to `out`.
 */
export function fenceRun(out: GroundsDestructible[], kind: string, a: readonly [number, number], b: readonly [number, number],
  opts: FenceRunOptions = {}): void {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 0.8) return;
  const ux = dx / len, uz = dz / len, yawDeg = Math.atan2(ux, uz) * 180 / Math.PI;
  const nominal = MODULE_LENGTH[kind] ?? 2.5;
  // the stretches either side of the gap
  const gap = opts.gateAt !== undefined ? Math.max(0.6, opts.gap ?? GATE_GAP) : 0;
  const stretches: Array<[number, number]> = gap > 0
    ? [[0, Math.max(0, opts.gateAt! - gap / 2)], [Math.min(len, opts.gateAt! + gap / 2), len]]
    : [[0, len]];
  for (const [t0, t1] of stretches) {
    const run = t1 - t0;
    if (run < nominal * 0.45) continue;
    const n = Math.max(1, Math.round(run / nominal)), pitch = run / n;
    const scale = Math.min(1.2, Math.max(0.8, pitch / nominal));
    for (let k = 0; k < n; k++) {
      const t = t0 + pitch * (k + 0.5);
      out.push({ kind, x: a[0] + ux * t, z: a[1] + uz * t, yawDeg, scale });
    }
  }
  if (gap > 0 && opts.gate) {
    // the gate hangs from its hinge post: its origin at the gap's near side, its posts centred in the gap
    const scale = Math.min(1.15, Math.max(0.85, (gap - 0.4) / GATE_SPAN)), t = opts.gateAt! - GATE_SPAN * scale / 2;
    out.push({ kind: opts.gate, x: a[0] + ux * t, z: a[1] + uz * t, yawDeg, scale });
  }
}

/**
 * A closed enclosure round a rectangle (centre cx, cz; half sizes hw along x, hd along z, in the piece's frame), its gate
 * on one side (`gateSide`: the side's outward axis, '+z' the front) at `gateU` along that side from its centre.
 */
export function enclosure(out: GroundsDestructible[], kind: string, rect: { cx: number; cz: number; hw: number; hd: number },
  gate: { side: '+z' | '-z' | '+x' | '-x'; u?: number; kind?: string | null } | null): void {
  const { cx, cz, hw, hd } = rect;
  // counter-clockwise from above, each side's u running along it (the gate's offset from the side's centre)
  const sides: Array<{ side: '+z' | '-z' | '+x' | '-x'; a: [number, number]; b: [number, number] }> = [
    { side: '+z', a: [cx + hw, cz + hd], b: [cx - hw, cz + hd] },
    { side: '-x', a: [cx - hw, cz + hd], b: [cx - hw, cz - hd] },
    { side: '-z', a: [cx - hw, cz - hd], b: [cx + hw, cz - hd] },
    { side: '+x', a: [cx + hw, cz - hd], b: [cx + hw, cz + hd] },
  ];
  for (const s of sides) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    if (gate && gate.side === s.side) fenceRun(out, kind, s.a, s.b, { gateAt: len / 2 + (gate.u ?? 0), gate: gate.kind === undefined ? 'gate' : gate.kind });
    else fenceRun(out, kind, s.a, s.b);
  }
}

export interface DrapeOptions {
  /** the surface's height over the ground (m; default 0.05) */
  lift?: number;
  /** the grid's cell (m; default 1) */
  cell?: number;
  /** how far the edges' skirts reach below the ground (m; default 0.25) */
  skirt?: number;
  /** vertex colour (a coloured bucket) and the like */
  emit?: EmitOptions;
}

/**
 * Paving draped over the ground: a rectangle (centre cx, cz; half sizes hw across, hd along; turned `yaw` radians about
 * its centre, its along axis from +z toward +x) on a grid, each cell two triangles a few centimetres over the ground,
 * the outline skirted into it. Decor.
 */
export function drapedRect(sink: PartSink, bucket: RegionalBucket, ground: GroundAt,
  rect: { cx: number; cz: number; hw: number; hd: number; yaw?: number }, opts: DrapeOptions = {}): void {
  const lift = opts.lift ?? 0.05, cell = opts.cell ?? 1, skirt = opts.skirt ?? 0.25;
  const emit: EmitOptions = { decor: true, ...opts.emit };
  const c = Math.cos(rect.yaw ?? 0), s = Math.sin(rect.yaw ?? 0);
  const nx = Math.max(1, Math.ceil(rect.hw * 2 / cell)), nz = Math.max(1, Math.ceil(rect.hd * 2 / cell));
  const at = (i: number, j: number, drop = 0): Vec3 => {
    const ax = -rect.hw + rect.hw * 2 * i / nx, az = -rect.hd + rect.hd * 2 * j / nz;
    const x = rect.cx + ax * c + az * s, z = rect.cz - ax * s + az * c;
    return [x, (ground?.(x, z) ?? 0) + lift - drop, z];
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    // counter-clockwise from above: (i, j) → (i, j + 1) → (i + 1, j + 1), and (i, j) → (i + 1, j + 1) → (i + 1, j)
    const p00 = at(i, j), p01 = at(i, j + 1), p11 = at(i + 1, j + 1), p10 = at(i + 1, j);
    sink.polygon(bucket, [p00, p01, p11], emit);
    sink.polygon(bucket, [p00, p11, p10], emit);
  }
  // the skirts: each outline edge carried down into the ground, facing out
  const edge = (a: Vec3, b: Vec3, a2: Vec3, b2: Vec3) => sink.quad(bucket, a, a2, b2, b, emit);
  for (let i = 0; i < nx; i++) {
    edge(at(i + 1, 0), at(i, 0), at(i + 1, 0, lift + skirt), at(i, 0, lift + skirt));
    edge(at(i, nz), at(i + 1, nz), at(i, nz, lift + skirt), at(i + 1, nz, lift + skirt));
  }
  for (let j = 0; j < nz; j++) {
    edge(at(0, j), at(0, j + 1), at(0, j, lift + skirt), at(0, j + 1, lift + skirt));
    edge(at(nx, j + 1), at(nx, j), at(nx, j + 1, lift + skirt), at(nx, j, lift + skirt));
  }
}

/** A path draped over the ground from a to b (the piece's frame), `width` wide. Decor. */
export function drapedPath(sink: PartSink, bucket: RegionalBucket, ground: GroundAt, a: readonly [number, number], b: readonly [number, number],
  width: number, opts: DrapeOptions = {}): void {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 0.3) return;
  drapedRect(sink, bucket, ground, { cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2, hw: width / 2, hd: len / 2, yaw: Math.atan2(dx, dz) }, opts);
}

/** A churchyard grave's marker. */
export type GraveMarker = 'orthodox' | 'latin' | 'stone' | 'railed';

const WEATHERED_WOOD: Rgb = [0.36, 0.32, 0.27], IRON_BLACK: Rgb = [0.13, 0.13, 0.13], EARTH: Rgb = [0.27, 0.22, 0.17];

/**
 * A grave at (x, z) facing +z (its marker at the head, the -z end): a low mound of earth, and its marker — the
 * Orthodox cross with its slanted foot bar, a Latin cross, a headstone, or a cross inside the low iron railing of a
 * Russian family plot.
 */
export function grave(sink: PartSink, ground: GroundAt, x: number, z: number, yaw: number, marker: GraveMarker): void {
  const y = ground?.(x, z) ?? 0;
  sink.placed(yaw, x, y, z, () => {
    // the mound (a long low hump of earth, its sides into the ground)
    sink.prism('structureWood', [[-0.42, -0.2, -0.95], [0.42, -0.2, -0.95], [0.32, 0.16, -0.85], [-0.32, 0.16, -0.85]] as Vec3[], [0, 0, 1], 1.8,
      { colour: EARTH, decor: true });
    const hz = -1.05;
    if (marker === 'stone') {
      sink.span('stone', -0.3, -0.2, hz - 0.08, 0.3, 0.75, hz + 0.08, { decor: true });
      sink.span('stone', -0.34, 0.75, hz - 0.1, 0.34, 0.83, hz + 0.1, { decor: true, fine: true });
      return;
    }
    const wood = marker === 'railed' ? 'structureMetal' : 'structureWood';
    const colour = marker === 'railed' ? IRON_BLACK : WEATHERED_WOOD;
    const opts: EmitOptions = { colour, decor: true };
    const h = marker === 'railed' ? 1.35 : 1.6, t = marker === 'railed' ? 0.035 : 0.05;
    sink.span(wood, -t, -0.3, hz - t, t, h, hz + t, opts);
    sink.span(wood, -0.42, h - 0.48, hz - t * 0.8, 0.42, h - 0.38, hz + t * 0.8, opts);
    if (marker === 'orthodox' || marker === 'railed') {
      // the short title bar over the arms and the slanted foot bar (its right end, seen from the front, low)
      sink.span(wood, -0.2, h - 0.2, hz - t * 0.8, 0.2, h - 0.12, hz + t * 0.8, opts);
      sink.member(wood, [-0.26, 0.42, hz], [0.26, 0.24, hz], 0.07, t * 1.6, [0, 0, 1], { ...opts, exposed: true }, t * 0.8);
    }
    if (marker === 'railed') {
      // the family plot's low railing: corner posts and two rails round the mound, open at nothing
      const r = [[-0.65, -1.3], [0.65, -1.3], [0.65, 1.0], [-0.65, 1.0]] as const;
      for (const [px, pz] of r) sink.span('structureMetal', px - 0.025, -0.1, pz - 0.025, px + 0.025, 0.85, pz + 0.025, opts);
      for (let k = 0; k < 4; k++) {
        const [ax, az] = r[k], [bx, bz] = r[(k + 1) % 4];
        for (const ry of [0.3, 0.78]) {
          sink.member('structureMetal', [ax, ry, az], [bx, ry, bz], 0.02, 0.02, [0, 1, 0], { ...opts, exposed: true, fine: true }, 0.01);
        }
      }
    }
  });
}
