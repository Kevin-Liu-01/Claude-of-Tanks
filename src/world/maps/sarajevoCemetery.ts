// src/world/maps/sarajevoCemetery.ts — Ruinspires' siege cemeteries on the slopes below the ridges (props census #11, the
// looks lane, 2026-10-15; moved out of sarajevoStreets.ts at 379197183). Kovači, the Lion cemetery, Bare: the šehidsko
// mezarje the siege filled, its graves in terraced rows along the hill's contour, each row kept by a low dry-stone
// retaining wall with its coping, a stepped path down through them every few bays. Each Muslim grave a head nišan and
// most a foot nišan: the šehid's slender white marble pillar with its arched head and its engraved panel (the siege's
// dead, most of them), the older grey limestone men's nišan with its octagonal shaft, its neck and its turban (sarık)
// or fez (kavuk), the women's slab with its pointed head; among them the Christian graves with their kerbs and their
// white crosses, and the partisans' obelisks with the red star.
//
// The stones are dressing in the kit's vertex-coloured stone (the regionalStone print's flat texel under each stone's
// own colour: Ruinspires adopts the Sarajevo kit, so props.ts makes that material); a hull drives over the walls. The
// graves are crushable clutter (crushableClutter.ts, the props' clutter sink): each row's graves in runs of about
// 4.5 m, one movement and one shell record a run (the stones' hull, their tops), a hull or a round flattening a run
// where it stood. The layout draws from the cemetery's own stream and never from the tier: a phone lays the same runs
// and records (docs/DESTRUCTION.md §8.4) and draws lighter stones. Everything stands where it clears the records
// already placed and keeps off the roads.
import type * as THREE from 'three';
import { PartSink, hashSeed, streamFrom, type Rgb, type Vec3, type UvMode } from './regional/geometry.ts';
import { getDeviceTier } from '../../engine/quality.ts';
import { cloneCollisionRecord, convexHull2, setConvexShape, type CollisionRecord } from '../collision.ts';
import { createRecordClearance } from './recordClearance.ts';
import { CrushableClutter } from '../crushableClutter.ts';
import { STONE_FLAT_TEXEL, lin } from './craftMesh.ts';
import { SARAJEVO_STYLE } from './regional/sarajevo.ts';

/** What the cemeteries read of the dressing context (sarajevoStreets.ts TramContext; mapKits.ts's focused context). */
interface CemeteryContext {
  L?: { roads?: ReadonlyArray<ReadonlyArray<readonly [number, number]>> };
  heightField: { getHeightAt(x: number, z: number): number };
  buckets: Record<string, THREE.BufferGeometry[] | undefined>;
  obstacles?: CollisionRecord[];
  colliders?: CollisionRecord[];
  /** The props' crushable-clutter sink (mapKits.ts DressingContext.clutter); omitted, the graves are dressing only. */
  clutter?: (clutter: CrushableClutter) => void;
}

/** The cemeteries' plots up Ruinspires' flanks below the bench street, between the western and the central terrace
 * streets (Kovači above the old town, the Lion cemetery; a rotation pair about the valley's centre): centre, half sizes.
 * (the Miljacka valley round, 2026-10-07, landed 2026-10-17: the plots moved with the valley's layout; landUse.ts lays
 * their mown grass on the same ground) */
const CEMETERIES: ReadonlyArray<{ x: number; z: number; hx: number; hz: number }> = [
  { x: -50, z: 244, hx: 30, hz: 18 }, { x: 50, z: -244, hx: 30, hz: 18 },
];

/** The props scattered before the cemeteries were laid that a grave's tomb can stand over (wave 162: "a dark cube" among
 * the stones, the camp scatter's crate). */
const LOOSE_KINDS = new Set(['crate', 'barrel', 'drum', 'ammobox', 'pallet', 'firewood', 'handcart']);

const ROW_PITCH = 2.5, GRAVE_PITCH = 1.3, RUN_M = 4.5, PATH_EVERY = 15, PATH_HALF = 0.85, ROAD_CLEAR = 4.2;

// the kit stone's flattest texel (craftMesh.ts STONE_FLAT_TEXEL) under the kit's tint: each stone's colour is its albedo
// over that texel's, so the print reads as the stone's own surface and not as the kit's masonry courses
const KIT_STONE = SARAJEVO_STYLE.surfaces.stone;
const TEXEL = STONE_FLAT_TEXEL[`${KIT_STONE.kind}${KIT_STONE.dressed ? ':dressed' : ''}`] ?? STONE_FLAT_TEXEL[KIT_STONE.kind] ?? STONE_FLAT_TEXEL.limestone;
const TEXEL_LIN: Rgb = [lin(TEXEL.srgb[0] * KIT_STONE.tint[0]), lin(TEXEL.srgb[1] * KIT_STONE.tint[1]), lin(TEXEL.srgb[2] * KIT_STONE.tint[2])];
const onPrint = (a: Rgb): Rgb => [a[0] / TEXEL_LIN[0], a[1] / TEXEL_LIN[1], a[2] / TEXEL_LIN[2]];
const ZERO: Vec3 = [0, 0, 0];
const FLAT_UV: UvMode = Object.freeze({ kind: 'plane' as const, origin: ZERO, u: ZERO, v: ZERO });

// the stones' albedos (linear)
const MARBLE: Rgb = [0.74, 0.74, 0.72], LIMESTONE: Rgb = [0.4, 0.385, 0.355], WALL: Rgb = [0.3, 0.29, 0.27];
const COPING: Rgb = [0.4, 0.39, 0.36], CONCRETE: Rgb = [0.46, 0.455, 0.44], STAR_RED: Rgb = [0.42, 0.05, 0.035];
const ENGRAVED: Rgb = [0.5, 0.52, 0.5], LICHEN: Rgb = [0.34, 0.36, 0.27];

const hash01 = (a: number, b: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** A stone's weathering in its own frame (its foot at y 0): damp and darker at the foot, lichen spotted on its upper faces. */
function weather(base: Rgb, seed: number, lichen: number): (p: Vec3) => Rgb {
  return (p) => {
    const foot = 0.8 + 0.2 * Math.min(1, Math.max(0, p[1] / 0.35));
    const spot = lichen > 0 && hash01(Math.round(p[0] * 9 + seed), Math.round(p[1] * 9 + p[2] * 5)) > 1 - lichen ? 0.55 : 0;
    const k = foot * (0.96 + 0.08 * hash01(seed, Math.round(p[1] * 7)));
    return onPrint([(base[0] * (1 - spot) + LICHEN[0] * spot) * k, (base[1] * (1 - spot) + LICHEN[1] * spot) * k, (base[2] * (1 - spot) + LICHEN[2] * spot) * k]);
  };
}

/** Emission options of a stone: decor in the kit stone, the flat texel's uv, a colour by corner. */
const stone = (colourAt: (p: Vec3) => Rgb) => ({ decor: true, uv: FLAT_UV, colourAt, colour: colourAt([0, 0.5, 0]) });

/** A box from (x0, y0, z0) to (x1, y1, z1), its underside left out. */
function block(sink: PartSink, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, colourAt: (p: Vec3) => Rgb, top = true): void {
  sink.box('regionalStone', [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2], stone(colourAt), undefined, { ny: true, py: !top });
}

/** A polygon in the XY plane (counter-clockwise seen from +z) extruded from z0 to z1: an arched head, a pointed slab. */
function slabXY(sink: PartSink, pts: ReadonlyArray<readonly [number, number]>, z0: number, z1: number, colourAt: (p: Vec3) => Rgb): void {
  sink.prism('regionalStone', pts.map(([x, y]) => [x, y, z0] as Vec3), [0, 0, 1], z1 - z0, stone(colourAt));
}

/** A regular `n`-gon shaft on the vertical from y0 to y1, radius r (an octagonal shaft, a neck); `top` closes its head. */
function shaftY(sink: PartSink, n: number, r: number, y0: number, y1: number, colourAt: (p: Vec3) => Rgb, top = true, phase = Math.PI / 8): void {
  const o = stone(colourAt), at = (k: number, y: number): Vec3 => { const a = phase + (k / n) * Math.PI * 2; return [Math.cos(a) * r, y, Math.sin(a) * r]; };
  for (let k = 0; k < n; k++) sink.quad('regionalStone', at(k, y0), at(k, y1), at(k + 1, y1), at(k + 1, y0), o);
  if (top) sink.polygon('regionalStone', Array.from({ length: n }, (_, k) => at(n - k, y1)), o);
}

/** A lathe on the vertical from its foot at y0: [radius, height] profile, `n` sides, the top closed (a turban, a fez). */
function latheY(sink: PartSink, profile: ReadonlyArray<readonly [number, number]>, n: number, y0: number, colourAt: (p: Vec3) => Rgb): void {
  const at = (k: number, j: number): Vec3 => {
    const a = (j / n) * Math.PI * 2;
    return [Math.cos(a) * profile[k][0], y0 + profile[k][1], Math.sin(a) * profile[k][0]];
  };
  const o = stone(colourAt);
  for (let k = 0; k + 1 < profile.length; k++) {
    for (let j = 0; j < n; j++) {
      const a = at(k, j), b = at(k, j + 1), c = at(k + 1, j + 1), d = at(k + 1, j);
      if (profile[k + 1][0] < 1e-6) sink.polygon('regionalStone', [a, d, b], o);
      else sink.quad('regionalStone', a, d, c, b, o);
    }
  }
}

/** An arched head over a w x d pillar at y (the šehid's, a foot stone's). */
function archedHead(sink: PartSink, w: number, d: number, y: number, rise: number, colourAt: (p: Vec3) => Rgb, seg = 4): void {
  const pts: Array<[number, number]> = [];
  for (let k = 0; k <= seg; k++) { const a = (k / seg) * Math.PI; pts.push([Math.cos(a) * w / 2, y + Math.sin(a) * rise]); }
  slabXY(sink, pts, -d / 2, d / 2, colourAt);
}

type GraveKind = 'sehid' | 'turban' | 'fez' | 'woman' | 'cross' | 'star';

/** A grave's head stone, its foot at (0, 0, 0) and its face toward +z (down the slope), `h` its shaft's height. */
function headStone(sink: PartSink, kind: GraveKind, h: number, seed: number, mobile: boolean): void {
  if (kind === 'sehid') {
    const c = weather(MARBLE, seed, 0.02);
    block(sink, -0.07, -0.3, -0.055, 0.07, h, 0.055, c, false);
    archedHead(sink, 0.14, 0.11, h, 0.07, c, mobile ? 2 : 4);
    // the engraved field on its face: the name, the dates, the šehid's line, cut shallow and gone grey
    if (!mobile) sink.quad('regionalStone', [-0.045, h - 0.42, 0.057], [0.045, h - 0.42, 0.057], [0.045, h - 0.1, 0.057], [-0.045, h - 0.1, 0.057], stone(() => onPrint(ENGRAVED)));
    return;
  }
  if (kind === 'turban' || kind === 'fez') {
    const c = weather(LIMESTONE, seed, 0.12);
    if (!mobile) block(sink, -0.13, -0.25, -0.11, 0.13, 0.06, 0.11, c);
    shaftY(sink, mobile ? 4 : 6, 0.1, mobile ? -0.25 : 0.06, h, c, true, Math.PI / 6);
    if (mobile) { block(sink, -0.12, h, -0.12, 0.12, h + 0.14, 0.12, c); return; }
    shaftY(sink, 6, 0.072, h, h + 0.05, c, false, Math.PI / 6);
    latheY(sink, kind === 'turban'
      ? [[0.1, 0], [0.152, 0.04], [0.14, 0.11], [0.07, 0.15], [0, 0.16]]
      : [[0.095, 0], [0.115, 0.07], [0.115, 0.17], [0.09, 0.22], [0, 0.23]], 6, h + 0.05, c);
    return;
  }
  if (kind === 'woman') {
    const c = weather(LIMESTONE, seed, 0.12);
    slabXY(sink, [[-0.12, -0.25], [0.12, -0.25], [0.12, h], [0.07, h + 0.08], [0, h + 0.13], [-0.07, h + 0.08], [-0.12, h]], -0.035, 0.035, c);
    return;
  }
  if (kind === 'cross') {
    const c = weather(MARBLE, seed, 0.05);
    block(sink, -0.17, -0.2, -0.1, 0.17, 0.12, 0.1, c);
    block(sink, -0.04, 0.12, -0.035, 0.04, h + 0.2, 0.035, c);
    block(sink, -0.2, h * 0.68 + 0.08, -0.035, 0.2, h * 0.68 + 0.16, 0.035, c);
    return;
  }
  // the partisans' obelisk: a tapering square shaft on its base, the red star on its face
  const c = weather(CONCRETE, seed, 0.08);
  block(sink, -0.16, -0.2, -0.16, 0.16, 0.14, 0.16, c);
  const b = 0.1, t = 0.06, y0 = 0.14, y1 = h + 0.25;
  const P = (x: number, y: number, z: number): Vec3 => [x, y, z];
  const o = stone(c);
  sink.quad('regionalStone', P(-b, y0, b), P(b, y0, b), P(t, y1, t), P(-t, y1, t), o);
  sink.quad('regionalStone', P(b, y0, -b), P(-b, y0, -b), P(-t, y1, -t), P(t, y1, -t), o);
  sink.quad('regionalStone', P(b, y0, b), P(b, y0, -b), P(t, y1, -t), P(t, y1, t), o);
  sink.quad('regionalStone', P(-b, y0, -b), P(-b, y0, b), P(-t, y1, t), P(-t, y1, -t), o);
  sink.polygon('regionalStone', [P(-t, y1, t), P(t, y1, t), P(0, y1 + 0.08, 0)], o);
  sink.polygon('regionalStone', [P(t, y1, -t), P(-t, y1, -t), P(0, y1 + 0.08, 0)], o);
  sink.polygon('regionalStone', [P(t, y1, t), P(t, y1, -t), P(0, y1 + 0.08, 0)], o);
  sink.polygon('regionalStone', [P(-t, y1, -t), P(-t, y1, t), P(0, y1 + 0.08, 0)], o);
  if (mobile) return;
  // the star: its pentagon and its five points, each a convex plate
  const sy = y1 - 0.14, zf = t + (b - t) * (0.14 / (y1 - y0)), red = () => onPrint(STAR_RED);
  const pt = (k: number, r: number): [number, number] => { const a = Math.PI / 2 + (k / 10) * Math.PI * 2; return [Math.cos(a) * r, sy + Math.sin(a) * r]; };
  slabXY(sink, [1, 3, 5, 7, 9].map((k) => pt(k, 0.022)), zf, zf + 0.01, red);
  for (const k of [0, 2, 4, 6, 8]) slabXY(sink, [pt(k - 1, 0.022), pt(k, 0.055), pt(k + 1, 0.022)], zf, zf + 0.01, red);
}

/** A grave's foot stone (a small plain nišan), its foot at the origin. */
function footStone(sink: PartSink, h: number, marble: boolean, seed: number): void {
  const c = weather(marble ? MARBLE : LIMESTONE, seed, marble ? 0.02 : 0.12);
  block(sink, -0.055, -0.25, -0.045, 0.055, h, 0.045, c, false);
  archedHead(sink, 0.11, 0.09, h, 0.05, c, 2);
}

/** A Christian grave's kerb round its bed, each side stepping with the ground (`yAt` its height along the grave). */
function kerb(sink: PartSink, yHead: number, yFoot: number, seed: number): void {
  const c = weather(CONCRETE, seed, 0.06), w = 0.36, L = 0.95;
  block(sink, -w, yHead - 0.2, L - 0.07, w, yHead + 0.11, L, c);
  block(sink, -w, yFoot - 0.2, -L, w, yFoot + 0.11, -L + 0.07, c);
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? w - 0.07 : -w, x1 = s > 0 ? w : -w + 0.07;
    block(sink, x0, yHead - 0.25, 0, x1, yHead + 0.1, L - 0.07, c);
    block(sink, x0, yFoot - 0.25, -L + 0.07, x1, yFoot + 0.1, 0, c);
  }
}

interface Grave { x: number; z: number; y: number; kind: GraveKind; h: number; foot: number; footY: number; headY: number; yaw: number; seed: number; top: number }

/**
 * The cemeteries: terraced rows along the contour, retaining walls under each row, paths stepping down through them,
 * the graves of each row in crushable runs.
 */
function dressCemeteries(ctx: CemeteryContext): void {
  const hf = ctx.heightField;
  const mobile = getDeviceTier() === 'mobile';
  const records = createRecordClearance([...(ctx.obstacles ?? []), ...(ctx.colliders ?? [])]);
  const roads = ctx.L?.roads ?? [];
  const nearRoad = (x: number, z: number): boolean => roads.some((line) => {
    for (let k = 0; k + 1 < line.length; k++) {
      const [ax, az] = line[k], [bx, bz] = line[k + 1];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
      const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < ROAD_CLEAR) return true;
    }
    return false;
  });
  const runs: Array<{ graves: Grave[] }> = [];
  for (const [k, c] of CEMETERIES.entries()) {
    const look = streamFrom(hashSeed('sarajevo-cemetery-r2', k, c.x, c.z));
    // the contour: uphill N across the rows, T along them (a flat plot keeps its rows along x)
    const gx = (hf.getHeightAt(c.x + 8, c.z) - hf.getHeightAt(c.x - 8, c.z)) / 16, gz = (hf.getHeightAt(c.x, c.z + 8) - hf.getHeightAt(c.x, c.z - 8)) / 16;
    const gl = Math.hypot(gx, gz);
    const N: [number, number] = gl > 0.02 ? [gx / gl, gz / gl] : [0, 1], T: [number, number] = [-N[1], N[0]];
    const S = c.hx * Math.abs(N[0]) + c.hz * Math.abs(N[1]), TM = c.hx * Math.abs(T[0]) + c.hz * Math.abs(T[1]);
    const P = (t: number, s: number): [number, number] => [c.x + T[0] * t + N[0] * s, c.z + T[1] * t + N[1] * s];
    const inside = (x: number, z: number, m: number) => Math.abs(x - c.x) <= c.hx - m && Math.abs(z - c.z) <= c.hz - m;
    const yaw = Math.atan2(-N[0], -N[1]);
    const pathPhase = look() * PATH_EVERY;
    const sink = new PartSink([TEXEL.uv[0], TEXEL.uv[1]]);
    // (the Miljacka valley round, wave 162) a loose prop left on the plot stands inside a tomb: a white stone chest on its
    // footing under a gabled lid (dressing round the prop, whose record stays the solid)
    for (const r of ctx.obstacles ?? []) {
      if (r.dead || !LOOSE_KINDS.has(r.kind ?? '')) continue;
      const rx = (r.min[0] + r.max[0]) / 2, rz = (r.min[2] + r.max[2]) / 2;
      if (Math.abs(rx - c.x) > c.hx || Math.abs(rz - c.z) > c.hz) continue;
      const hx = Math.max(0.65, (r.max[0] - r.min[0]) / 2 + 0.25), hz = Math.max(1.05, (r.max[2] - r.min[2]) / 2 + 0.25);
      const y0 = Math.min(hf.getHeightAt(rx - hx, rz - hz), hf.getHeightAt(rx + hx, rz + hz), r.min[1]) - 0.15;
      const h = Math.max(r.max[1] + 0.12, y0 + 1.15) - y0, tc = weather(MARBLE, Math.round(rx * 13 + rz * 7), 0.04);
      sink.placed(0, rx, y0, rz, () => {
        block(sink, -hx - 0.08, 0, -hz - 0.08, hx + 0.08, 0.32, hz + 0.08, tc);
        block(sink, -hx, 0.32, -hz, hx, h, hz, tc);
        slabXY(sink, [[-hx - 0.06, h], [hx + 0.06, h], [0, h + 0.28]], -hz - 0.06, hz + 0.06, tc);
      });
    }
    for (let s = -S + 1.4; s <= S - 1.2; s += ROW_PITCH) {
      // the graves of the row, the row's own lot: its share of the siege's šehid stones, of the old stones, the
      // Christian and the partisans' graves
      const rowSehid = 0.45 + look() * 0.3;
      let run: Grave[] = [], runT = -Infinity;
      const flush = () => { if (run.length) runs.push({ graves: run }); run = []; };
      const wallSpans: Array<[number, number]> = [];
      let spanStart: number | null = null, lastT = 0;
      for (let t = -TM + 0.6 + look() * 0.5; t <= TM - 0.6; t += GRAVE_PITCH * (0.92 + look() * 0.16)) {
        const gap = look(), kindRoll = look(), hRoll = look(), footRoll = look(), jit = look(), jit2 = look();
        const onPath = Math.abs(((t - pathPhase) % PATH_EVERY + PATH_EVERY) % PATH_EVERY - PATH_EVERY / 2) > PATH_EVERY / 2 - PATH_HALF;
        const [x, z] = P(t + (jit - 0.5) * 0.12, s + (jit2 - 0.5) * 0.1);
        const ok = !onPath && inside(x, z, 0.8) && !nearRoad(x, z) && records.clears(x, z, 1.05, 0.42, N[0], N[1], 0.2);
        if (ok && spanStart === null) spanStart = t;
        if ((!ok || onPath) && spanStart !== null) { wallSpans.push([spanStart - 0.7, lastT + 0.7]); spanStart = null; }
        if (!ok) { flush(); continue; }
        lastT = t;
        if (gap < 0.18) continue; // an empty plot in the row
        const kind: GraveKind = kindRoll < rowSehid ? 'sehid' : kindRoll < rowSehid + 0.17 ? (hRoll < 0.6 ? 'turban' : 'fez')
          : kindRoll < rowSehid + 0.27 ? 'woman' : kindRoll < 0.96 ? 'cross' : 'star';
        const h = kind === 'sehid' ? 1.0 + hRoll * 0.3 : kind === 'woman' ? 0.7 + hRoll * 0.25 : kind === 'cross' ? 0.75 + hRoll * 0.3 : kind === 'star' ? 1.0 + hRoll * 0.3 : 0.8 + hRoll * 0.35;
        const [hx, hz] = [x + N[0] * 0.85, z + N[1] * 0.85], [fx, fz] = [x - N[0] * 0.8, z - N[1] * 0.8];
        const g: Grave = {
          x, z, y: hf.getHeightAt(x, z), kind, h, foot: kind === 'cross' || kind === 'star' || footRoll < 0.45 ? 0 : 0.45 + footRoll * 0.25,
          headY: hf.getHeightAt(hx, hz), footY: hf.getHeightAt(fx, fz), yaw: yaw + (jit - 0.5) * 0.08, seed: Math.round(x * 13 + z * 7),
          top: h + (kind === 'fez' ? 0.28 : kind === 'turban' ? 0.21 : kind === 'cross' || kind === 'star' ? 0.33 : 0.08),
        };
        if (t - runT > RUN_M) { flush(); runT = t; }
        run.push(g);
      }
      flush();
      if (spanStart !== null) wallSpans.push([spanStart - 0.7, lastT + 0.7]);
      // the row's retaining wall under its graves' feet: its face from the ground below up to the terrace's level, its
      // coping; where a path crosses, a tread steps up through it
      const sw = s - 1.2;
      for (const [t0, t1] of wallSpans) {
        const n = Math.max(1, Math.round((t1 - t0) / 2));
        for (let i = 0; i < n; i++) {
          const ta = t0 + ((t1 - t0) * i) / n, tb = t0 + ((t1 - t0) * (i + 1)) / n;
          const [ax, az] = P(ta, sw), [bx, bz] = P(tb, sw);
          if (!inside(ax, az, 0.3) || !inside(bx, bz, 0.3)) continue;
          const lowA = hf.getHeightAt(ax, az), lowB = hf.getHeightAt(bx, bz);
          const [ux, uz] = P(ta, sw + 0.9), [vx, vz] = P(tb, sw + 0.9);
          const topA = Math.max(lowA + 0.16, hf.getHeightAt(ux, uz) + 0.06), topB = Math.max(lowB + 0.16, hf.getHeightAt(vx, vz) + 0.06);
          const wallC = weather(WALL, Math.round(ta * 31 + s * 7), 0.1), copC = weather(COPING, Math.round(ta * 17 + s), 0.15);
          const back = (x: number, z: number): Vec3 => [x + N[0] * 0.3, 0, z + N[1] * 0.3];
          const ba = back(ax, az), bb = back(bx, bz);
          sink.quad('regionalStone', [ax, lowA - 0.12, az], [bx, lowB - 0.12, bz], [bx, topB, bz], [ax, topA, az], { ...stone((p) => wallC([p[0], p[1] - lowA, p[2]])) });
          sink.quad('regionalStone', [ax - N[0] * 0.04, topA, az - N[1] * 0.04], [bx - N[0] * 0.04, topB, bz - N[1] * 0.04],
            [bb[0], topB + 0.05, bb[2]], [ba[0], topA + 0.05, ba[2]], { ...stone((p) => copC([p[0], 0.4, p[2]])) });
          sink.quad('regionalStone', [ax - N[0] * 0.04, topA - 0.05, az - N[1] * 0.04], [bx - N[0] * 0.04, topB - 0.05, bz - N[1] * 0.04],
            [bx - N[0] * 0.04, topB, bz - N[1] * 0.04], [ax - N[0] * 0.04, topA, az - N[1] * 0.04], { ...stone((p) => copC([p[0], 0.3, p[2]])) });
        }
        // the wall's two ends, where a path or the plot's edge cuts it
        for (const [te, sgn] of [[t0, -1], [t1, 1]] as const) {
          const [ex, ez] = P(te, sw);
          if (!inside(ex, ez, 0.3)) continue;
          const el = hf.getHeightAt(ex, ez), [qx, qz] = P(te, sw + 0.9);
          const ey = Math.max(el + 0.16, hf.getHeightAt(qx, qz) + 0.06), wc = weather(WALL, Math.round(te * 31 + s * 7), 0.1);
          const pts: Vec3[] = [[ex, el - 0.12, ez], [ex + N[0] * 0.3, el - 0.12, ez + N[1] * 0.3], [ex + N[0] * 0.3, ey + 0.05, ez + N[1] * 0.3], [ex, ey, ez]];
          if (sgn < 0) pts.reverse();
          sink.polygon('regionalStone', pts, stone((p) => wc([p[0], 0.2, p[2]])));
        }
      }
      // the treads where the paths cross this row's wall
      for (let tp = pathPhase - PATH_EVERY * Math.ceil((TM + pathPhase) / PATH_EVERY); tp <= TM; tp += PATH_EVERY) {
        const [px, pz] = P(tp, sw);
        if (!inside(px, pz, 1) || nearRoad(px, pz)) continue;
        const y = hf.getHeightAt(px, pz);
        sink.placed(yaw, px, y, pz, () => block(sink, -PATH_HALF + 0.1, -0.15, -0.18, PATH_HALF - 0.1, 0.12, 0.2, weather(COPING, Math.round(px * 5 + pz), 0.2)));
      }
    }
    push(ctx, sink);
  }
  // the graves, a run each: its own geometry (the clutter flattens its own spans) and its records
  for (const run of runs) {
    const sink = new PartSink([TEXEL.uv[0], TEXEL.uv[1]]);
    const pts: Array<[number, number]> = [];
    let low = Infinity, high = -Infinity;
    for (const g of run.graves) {
      const c = Math.cos(g.yaw), s = Math.sin(g.yaw);
      // the grave's frame: +z its foot (down the slope), the head stone 0.85 up it
      const at = (lx: number, lz: number): [number, number] => [g.x + lx * c + lz * s, g.z - lx * s + lz * c];
      const [hx, hz] = at(0, -0.85), [fx, fz] = at(0, 0.8);
      sink.placed(g.yaw, hx, g.headY, hz, () => headStone(sink, g.kind, g.h, g.seed, mobile));
      if (g.foot > 0 && !mobile) sink.placed(g.yaw, fx, g.footY, fz, () => footStone(sink, g.foot, g.kind === 'sehid', g.seed + 3));
      if ((g.kind === 'cross' || g.kind === 'star') && !mobile) sink.placed(g.yaw + Math.PI, g.x, g.y, g.z, () => kerb(sink, g.headY - g.y, g.footY - g.y, g.seed + 5));
      for (const [lx, lz] of [[-0.38, -1.0], [0.38, -1.0], [0.38, 0.95], [-0.38, 0.95]] as const) pts.push(at(lx, lz));
      low = Math.min(low, g.headY, g.footY, g.y);
      high = Math.max(high, g.headY + g.top);
    }
    const parts = sink.finish();
    const geometries: THREE.BufferGeometry[] = [];
    for (const [bucket, list] of Object.entries(parts)) for (const g of list) { (ctx.buckets[bucket] ??= []).push(g); geometries.push(g); }
    if (!ctx.clutter || !ctx.obstacles || !ctx.colliders) continue;
    const record = setConvexShape({ min: [0, low - 0.1, 0], max: [0, high, 0], kind: 'rubble' }, convexHull2(pts));
    const shell = cloneCollisionRecord(record);
    ctx.obstacles.push(record);
    ctx.colliders.push(shell);
    let cx = 0, cz = 0;
    for (const [x, z] of pts) { cx += x; cz += z; }
    cx /= pts.length; cz /= pts.length;
    let r = 0;
    for (const [x, z] of pts) r = Math.max(r, Math.hypot(x - cx, z - cz));
    const clutter = new CrushableClutter('rubble', cx, low, cz, r, high - low, [record], [shell]);
    for (const g of geometries) clutter.ownPiece(g);
    ctx.clutter(clutter);
  }
}

function push(ctx: CemeteryContext, sink: PartSink): void {
  const parts = sink.finish();
  for (const [bucket, list] of Object.entries(parts)) for (const g of list) (ctx.buckets[bucket] ??= []).push(g);
}

export { dressCemeteries };
