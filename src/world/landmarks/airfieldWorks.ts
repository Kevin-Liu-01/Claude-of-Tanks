// src/world/landmarks/airfieldWorks.ts — an airfield's works (the maps lane's Kestrel rebuild, 2026-10-15, landing the
// map-content lane's round 3, d2c62cc09: the owner on 10-09 found Kestrel Airfield "unfinished"). The apron floodlight
// mast of a Soviet airport: a tapering steel pole on its concrete base, the caged ladder up one side, the railed platform
// at the head and the bank of floodlights on its frame, turned to the apron (+z), the cable box at the foot.
//
// Drawn in its own frame (x across, y up, z out of its front, ground at y = 0) into the regional part sink: it merges into
// the props' material buckets (no draw call of its own). The pole and its base are structure; the ladder, the rails and
// the lamps are dressing, the lamp bank a piece of its own that a hit brings down (landmarks/pieces.ts).
import { PartSink, rgb, shade, type EmitOptions, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';
import { finishLandmark, piece } from './pieces.ts';

const STEEL = rgb(0x7f868b), STEEL_DARK = rgb(0x4b5157), IRON = rgb(0x2c2e30);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number): number => Math.max(min, Number(ctx.params[key]));

/** A ladder of two stiles and rungs from y0 to y1, its rungs along x at depth z (dressing). */
function ladder(sink: PartSink, z: number, y0: number, y1: number, colour: Rgb): void {
  const o: EmitOptions = { colour, decor: true, fine: true };
  for (const s of [-0.22, 0.22]) bar(sink, 'structureMetal', [s, y0, z], [s, y1, z], 0.05, o);
  for (let y = y0 + 0.3; y < y1 - 0.1; y += 0.35) bar(sink, 'structureMetal', [-0.22, y, z], [0.22, y, z], 0.03, o);
}

/**
 * A floodlight on a frame's face at z0 (its back on the face), facing +z: a round can of 12 sides 0.42 m deep, the bezel
 * ring at its mouth, the lens 4 cm back inside the bezel, the can's lining between them (seen past the bezel's lip).
 */
function floodlight(sink: PartSink, x: number, y: number, z0: number): void {
  const R = 0.27, Ri = 0.21, depth = 0.42, n = 12, zf = z0 + depth, zl = zf - 0.04;
  sink.cylinder('structureMetal', [x, y, z0], 'z', depth, R, n, { colour: IRON, decor: true }, R, false);
  const ring = (r: number, z: number): Vec3[] => Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2;
    return [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
  });
  const outer = ring(R, zf), inner = ring(Ri, zf), lining = ring(Ri, zl);
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    // the bezel (facing +z) and the lining inside it (facing the can's axis)
    sink.quad('structureMetal', outer[k], outer[j], inner[j], inner[k], { colour: shade(IRON, 1.3), decor: true });
    sink.quad('structureMetal', inner[k], inner[j], lining[j], lining[k], { colour: IRON, decor: true, fine: true });
  }
  sink.polygon('glass', lining, { decor: true });
}

/**
 * The apron floodlight mast (`height`, the pole to its head platform). The pole tapers from 0.42 m at its base to 0.2 m
 * under the head; the ladder stands 0.55 m off its back on standoffs, caged from 2.4 m up; the platform's ring and rail,
 * the lamp frame standing on the platform's front and two rows of three lamps on it over the rail, their glass to +z.
 */
export const floodMast: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const H = num(ctx, 'height', 10);
  const mobile = ctx.tier === 'mobile';
  sink.span('stone', -0.9, -0.6 - ctx.groundFall, -0.9, 0.9, 0.4, 0.9);
  sink.cylinder('structureMetal', [0, 0.4, 0], 'y', H - 0.4, 0.42, 10, { colour: STEEL }, 0.2);
  // the ladder on its standoffs off the pole's back, and its cage of hoops and straps above head height
  ladder(sink, -0.55, 0.6, H - 0.3, STEEL_DARK);
  const fine: EmitOptions = { colour: STEEL_DARK, decor: true, fine: true };
  for (let y = 1.5; y < H - 0.4; y += 3) {
    const r = 0.42 + (0.2 - 0.42) * (y - 0.4) / (H - 0.4);
    for (const s of [-0.22, 0.22]) bar(sink, 'structureMetal', [s * 0.5, y, -r + 0.02], [s, y, -0.55], 0.04, fine);
  }
  if (!mobile) {
    // each hoop from one stile round the climber's back to the other (the kit-connectivity law: a member meets something
    // at both ends), the three straps down the hoops' backs
    const hoop = (y: number): Vec3[] => ([[0.22, -0.55], [0.36, -0.75], [0.3, -1.05], [0, -1.15], [-0.3, -1.05], [-0.36, -0.75], [-0.22, -0.55]] as const)
      .map(([x, z]): Vec3 => [x, y, z]);
    const ys: number[] = [];
    for (let y = 2.4; y < H - 0.4; y += 0.9) ys.push(y);
    for (const y of ys) { const h = hoop(y); for (let k = 0; k + 1 < h.length; k++) bar(sink, 'structureMetal', h[k], h[k + 1], 0.025, fine); }
    if (ys.length > 1) for (const k of [1, 3, 5]) bar(sink, 'structureMetal', hoop(ys[0])[k], hoop(ys[ys.length - 1])[k], 0.02, fine);
  }
  // the head: the ring platform and its rail
  sink.cylinder('structureMetal', [0, H - 0.15, 0], 'y', 0.15, 1.4, 12, { colour: STEEL_DARK });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    bar(sink, 'structureMetal', [Math.cos(a) * 1.35, H, Math.sin(a) * 1.35], [Math.cos(a) * 1.35, H + 1.0, Math.sin(a) * 1.35], 0.04, { colour: STEEL_DARK, decor: true, fine: true });
    const b = ((k + 1) / 12) * Math.PI * 2;
    bar(sink, 'structureMetal', [Math.cos(a) * 1.35, H + 1.0, Math.sin(a) * 1.35], [Math.cos(b) * 1.35, H + 1.0, Math.sin(b) * 1.35], 0.04, { colour: STEEL_DARK, decor: true, fine: true });
  }
  // the lamp bank: its frame standing on the platform inside the rail and two rows of three floodlights over the rail —
  // round cans on the frame's face, each lens set back in its can behind a bezel (the maps lane, 2026-10-16; the LOOKS r2
  // sweep: glass squares laid on box faces read as painted openings)
  piece(sink, { name: 'lamps', kind: 'detach', at: 'damaged', fall: 'flat' }, (s) => {
    s.span('structureMetal', -1.0, H, 0.3, 1.0, H + 2.6, 0.45, { colour: STEEL_DARK });
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) floodlight(s, -0.66 + c * 0.66, H + 1.45 + r * 0.7, 0.45);
  });
  // the cable box at the foot
  sink.span('structureMetal', 0.6, 0.4, -0.3, 1.2, 1.5, 0.3, { colour: shade(STEEL, 0.8), decor: true });
  return { parts: finishLandmark(sink) };
};
