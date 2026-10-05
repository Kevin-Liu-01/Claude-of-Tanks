// src/world/maps/sarajevoStreets.ts — Ruinspires' boulevard as Sarajevo's (the map-revival lane, 2026-10-05; the map's
// `props.extraKits: ['tram']`, dressed from maps/mapKits.ts dressMapExtras). Zmaja od Bosne carried the city's tram line
// down the valley through the whole siege: the double track in its paved bed between low kerbs down the boulevard's
// middle, the rails, the catenary on tubular steel poles at the kerbs with their cross-spans and the contact wires over
// each track (a pole bent here and there, a wire down); the trams burnt out where the shelling caught them, standing on
// the rails; and the shipping containers stood along the kerbs at the crossings as screens against the snipers in the
// hills, behind which people ran across.
//
// The bed, rails, poles and wires are dressing (no collision: a hull drives over the bed and its kerbs); the burnt trams
// and the containers block like any wreck, each a convex footprint in both collision sinks. Everything draws from a
// stream of its own (never the props placement stream), and stands only where it clears the records already placed.
import type * as THREE from 'three';
import { PartSink, hashSeed, normalize3, rgb, shade, streamFrom, type Rgb, type Vec3 } from './regional/geometry.ts';
import { getDeviceTier } from '../../engine/quality.ts';
import { cloneCollisionRecord, setConvexShape, type CollisionRecord } from '../collision.ts';

interface TramContext {
  L: { roads?: ReadonlyArray<ReadonlyArray<readonly [number, number]>> };
  heightField: { getHeightAt(x: number, z: number): number };
  buckets: Record<string, THREE.BufferGeometry[] | undefined>;
  obstacles?: CollisionRecord[];
  colliders?: CollisionRecord[];
}

/** The track bed's half width, the track centres off the road's line, the rails off each track centre (standard gauge). */
const BED_HALF = 2.9, TRACK = 1.55, GAUGE_HALF = 0.7175;
/** The poles stand behind the kerb line (props.ts kerbs at 5.05 m), every SPAN metres along the line. */
const POLE_OFFSET = 5.65, SPAN = 34, WIRE_Y = 5.7, SPAN_Y = 6.7, POLE_H = 7.6;
const RAIL = rgb(0x6f645a), POLE = rgb(0x3d4a44), WIRE = rgb(0x26292a);
const LIVERY_RED = rgb(0x8c3026), LIVERY_CREAM = rgb(0xcbc1a3), RUST = rgb(0x6a4030);
const CONTAINERS: readonly Rgb[] = [0x7a4a32, 0x3f5f7a, 0x5f6a5c, 0x8a7d62, 0x6e3a30].map(rgb);

interface Station { x: number; z: number; tx: number; tz: number; nx: number; nz: number; s: number }

/** The road's line resampled every `step` metres (with tangent and left normal), inside |x|, |z| <= limit. */
function resample(points: ReadonlyArray<readonly [number, number]>, step: number, limit: number): Station[] {
  const out: Station[] = [];
  let s = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const tx = (bx - ax) / len, tz = (bz - az) / len;
    for (let d = out.length ? step - ((s % step) || step) : 0; d < len; d += step) {
      const x = ax + tx * d, z = az + tz * d;
      if (Math.abs(x) <= limit && Math.abs(z) <= limit) out.push({ x, z, tx, tz, nx: -tz, nz: tx, s: s + d });
    }
    s += len;
  }
  return out;
}

/** Does a footprint (x, z centre, half extents along / across a heading) clear every record placed so far? */
function clears(records: readonly CollisionRecord[], cx: number, cz: number, hl: number, hw: number, tx: number, tz: number, pad: number): boolean {
  const ex = Math.abs(tx) * hl + Math.abs(tz) * hw + pad, ez = Math.abs(tz) * hl + Math.abs(tx) * hw + pad;
  return !records.some((r) => !r.dead && r.max[0] > cx - ex && r.min[0] < cx + ex && r.max[2] > cz - ez && r.min[2] < cz + ez);
}

/** A convex box footprint in both collision sinks. */
function block(ctx: TramContext, cx: number, cz: number, hl: number, hw: number, tx: number, tz: number, y0: number, y1: number, kind: string): void {
  const nx = -tz, nz = tx;
  const pts = [[1, 1], [1, -1], [-1, -1], [-1, 1]].flatMap(([a, b]) => [cx + tx * hl * a + nx * hw * b, cz + tz * hl * a + nz * hw * b]);
  const record = setConvexShape({ min: [0, y0, 0], max: [0, y1, 0], kind }, pts);
  ctx.obstacles?.push(record);
  ctx.colliders?.push(cloneCollisionRecord(record));
}

function push(ctx: TramContext, sink: PartSink): void {
  const parts = sink.finish();
  for (const [bucket, list] of Object.entries(parts)) for (const g of list) (ctx.buckets[bucket] ??= []).push(g);
}

/**
 * A burnt tram on the track: two sections and their articulation, the lower panels' paint burnt to rust and char, the
 * windows gone to the dark, the roof sagging, the pantograph bent. Built in the frame of the track (x along it).
 */
function burntTram(sink: PartSink, look: () => number): void {
  const L = 10.2, W = 2.44, H = 3.1, gap = 0.7;
  for (const k of [-1, 1]) {
    const cx = k * (L + gap) / 2;
    const paint = (base: Rgb) => (look() < 0.55 ? shade(RUST, 0.8 + look() * 0.4) : look() < 0.5 ? [0.07, 0.06, 0.055] as Rgb : base);
    // the bogies and the underframe
    for (const bx of [-L * 0.32, L * 0.32]) sink.span('structureMetal', cx + bx - 1.1, 0.05, -0.9, cx + bx + 1.1, 0.75, 0.9, { colour: [0.08, 0.075, 0.07] });
    // the body: the lower panel band, the window band (dark, the frames), the roof
    sink.span('structureMetal', cx - L / 2, 0.75, -W / 2, cx + L / 2, 1.85, W / 2, { colour: paint(LIVERY_RED) });
    sink.span('dark', cx - L / 2 + 0.06, 1.85, -W / 2 + 0.04, cx + L / 2 - 0.06, 2.75, W / 2 - 0.04);
    for (let p = 0; p <= 6; p++) {
      const px = cx - L / 2 + 0.1 + (L - 0.2) * p / 6;
      for (const s of [-1, 1]) sink.span('structureMetal', px - 0.08, 1.85, s * W / 2 - 0.05, px + 0.08, 2.75, s * W / 2 + 0.05, { colour: paint(LIVERY_CREAM), decor: true });
    }
    sink.span('structureMetal', cx - L / 2, 2.75, -W / 2, cx + L / 2, 2.95, W / 2, { colour: paint(LIVERY_CREAM) });
    // the roof sagging into the burnt shell
    const sag = 0.15 + look() * 0.3;
    sink.member('structureMetal', [cx - L / 2 + 0.1, H - 0.05, 0], [cx, H - sag, 0], W - 0.1, 0.06, [0, 1, 0], { colour: [0.12, 0.1, 0.09], decor: true, exposed: true }, 0);
    sink.member('structureMetal', [cx, H - sag, 0], [cx + L / 2 - 0.1, H - 0.05, 0], W - 0.1, 0.06, [0, 1, 0], { colour: [0.12, 0.1, 0.09], decor: true, exposed: true }, 0);
    // the cab's dark front at the outer end
    sink.span('dark', cx + k * (L / 2 - 0.02) - 0.03, 1.9, -W / 2 + 0.25, cx + k * (L / 2 - 0.02) + 0.03, 2.7, W / 2 - 0.25, { decor: true });
  }
  // the articulation's bellows, the bent pantograph
  sink.span('structureMetal', -gap / 2 - 0.05, 0.8, -W / 2 + 0.2, gap / 2 + 0.05, 2.9, W / 2 - 0.2, { colour: [0.1, 0.09, 0.085] });
  const pa: Vec3 = [-2.5, H, 0], pb: Vec3 = [-1.2, H + 1.0, 0.3], pc: Vec3 = [-0.3, H + 0.7 + look() * 0.4, -0.2];
  sink.member('structureMetal', pa, pb, 0.06, 0.06, [0, 0, 1], { colour: WIRE, decor: true, exposed: true }, 0);
  sink.member('structureMetal', pb, pc, 0.06, 0.06, [0, 0, 1], { colour: WIRE, decor: true, exposed: true }, 0);
}

/** A twenty-foot shipping container on the kerb (x along it), its corrugations, its doors at the ends. */
const BOX_HL = 6.06 / 2, BOX_HW = 2.44 / 2;
function container(sink: PartSink, colour: Rgb, look: () => number, mobile: boolean): void {
  const L = BOX_HL, W = BOX_HW, H = 2.59;
  sink.span('structureMetal', -L, 0, -W, L, H, W, { colour });
  if (mobile) return;
  for (let x = -L + 0.3; x < L - 0.2; x += 0.6) for (const s of [-1, 1]) {
    sink.span('structureMetal', x - 0.1, 0.12, s * W - 0.03, x + 0.1, H - 0.12, s * W + 0.03, { colour: shade(colour, 0.84 + look() * 0.1), decor: true, fine: true });
  }
  for (const s of [-1, 1]) sink.span('structureMetal', s * L - 0.05, 0.1, -W + 0.08, s * L + 0.05, H - 0.1, W - 0.08, { colour: shade(colour, 0.7), decor: true });
}

/**
 * Lay the tram line down the boulevard (road `road` of the layout), its catenary, two burnt trams in rotation about the
 * map's centre, and the container screens at the crossings with the other roads.
 */
export function dressTramBoulevard(ctx: TramContext, road = 0): void {
  const roads = ctx.L.roads ?? [];
  const line = roads[road];
  if (!line || line.length < 2) return;
  const hf = ctx.heightField;
  const mobile = getDeviceTier() === 'mobile';
  // the placements (what blocks) draw from one stream, the looks from another: a phone's lighter dressing never moves a
  // wreck or a container, so the collision a host certifies is the desktop's
  const place = streamFrom(hashSeed('sarajevo-tram-place', road, line.length));
  const look = streamFrom(hashSeed('sarajevo-tram', road, line.length));
  const st = resample(line, 2.0, 430);
  if (st.length < 4) return;
  const at = (s: Station, off: number): Vec3 => { const x = s.x + s.nx * off, z = s.z + s.nz * off; return [x, hf.getHeightAt(x, z), z]; };
  // ---- the bed (setts between two low kerbs) and the rails, per two-metre segment
  const bed = new PartSink([0, 0]);
  for (let i = 0; i + 1 < st.length; i++) {
    const a = st[i], b = st[i + 1];
    if (b.s - a.s > 2.5) continue; // a gap where the line leaves the limit and comes back
    const L0 = at(a, BED_HALF), L1 = at(b, BED_HALF), R0 = at(a, -BED_HALF), R1 = at(b, -BED_HALF), C0 = at(a, 0), C1 = at(b, 0);
    const lift = 0.045;
    const up = (p: Vec3, k = lift): Vec3 => [p[0], p[1] + k, p[2]];
    bed.quad('stone', up(L0), up(L1), up(C1), up(C0), { decor: true, uv: { kind: 'world' }, density: 0.9 });
    bed.quad('stone', up(C0), up(C1), up(R1), up(R0), { decor: true, uv: { kind: 'world' }, density: 0.9 });
    // the bed's low kerbs
    for (const off of [BED_HALF, -BED_HALF]) {
      const p0 = at(a, off), p1 = at(b, off);
      bed.member('stone', up(p0, 0.02), up(p1, 0.02), 0.2, 0.12, [0, 1, 0], { decor: true }, 0.02);
    }
    // the rails, a few millimetres proud of the setts (fine: a long view cannot resolve them)
    for (const t of [-1, 1]) for (const g of [-1, 1]) {
      const off = t * TRACK + g * GAUGE_HALF, p0 = at(a, off), p1 = at(b, off);
      bed.member('structureWood', up(p0, lift + 0.005), up(p1, lift + 0.005), 0.075, 0.035, [0, 1, 0], { decor: true, colour: RAIL, fine: true }, 0.02);
    }
  }
  push(ctx, bed);
  // ---- the catenary: poles in pairs at the kerbs, cross-spans, the contact wire over each track between the spans
  const wires = new PartSink([0, 0]);
  const records = [...(ctx.obstacles ?? []), ...(ctx.colliders ?? [])];
  let prev: { y: number; s: Station } | null = null;
  for (let i = 0; i < st.length; i += Math.round(SPAN / 2)) {
    const s = st[i];
    const y = hf.getHeightAt(s.x, s.z);
    const tops: Vec3[] = [];
    for (const side of [1, -1]) {
      const [px, , pz] = at(s, side * POLE_OFFSET);
      if (!clears(records, px, pz, 0.3, 0.3, s.tx, s.tz, 0.2)) continue;
      const py = hf.getHeightAt(px, pz);
      const bent = look() < 0.12;
      const h = bent ? POLE_H * (0.55 + look() * 0.3) : POLE_H;
      const lean = bent ? 0.25 + look() * 0.3 : 0;
      const top: Vec3 = [px - s.nx * side * lean * h * 0.4, py + h, pz - s.nz * side * lean * h * 0.4];
      wires.member('structureMetal', [px, py - 0.3, pz], top, 0.22, 0.22, normalize3([s.tx, 0, s.tz]), { colour: POLE, decor: true, exposed: true }, 0);
      if (!bent) {
        wires.member('structureMetal', [px, py + SPAN_Y - 0.3, pz], [px - s.nx * side * 1.3, py + SPAN_Y - 0.1, pz - s.nz * side * 1.3], 0.08, 0.08,
          normalize3([s.tx, 0, s.tz]), { colour: POLE, decor: true, exposed: true }, 0);
        tops.push([px, py + SPAN_Y, pz]);
      }
    }
    if (mobile) { prev = { y, s }; continue; }
    if (tops.length === 2) wires.member('structureWood', tops[0], tops[1], 0.03, 0.03, [0, 1, 0], { colour: WIRE, decor: true, fine: true, exposed: true }, 0);
    if (prev && i > 0) {
      for (const t of [-1, 1]) {
        const a = at(prev.s, t * TRACK), b = at(s, t * TRACK);
        const down = look() < 0.06;
        if (down) {
          // a wire down: from the span it hangs to the roadway
          wires.member('structureWood', [a[0], prev.y + WIRE_Y, a[2]], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.05, (a[2] + b[2]) / 2], 0.025, 0.025, [0, 1, 0],
            { colour: WIRE, decor: true, fine: true, exposed: true }, 0);
          continue;
        }
        wires.member('structureWood', [a[0], prev.y + WIRE_Y, a[2]], [b[0], y + WIRE_Y, b[2]], 0.025, 0.025, [0, 1, 0], { colour: WIRE, decor: true, fine: true, exposed: true }, 0);
      }
    }
    prev = { y, s };
  }
  push(ctx, wires);
  // ---- two burnt trams, rotation-symmetric about the map's centre: one on each track
  const tramAt = (sTarget: number, track: number) => {
    for (const shift of [0, 8, -8, 16, -16, 24]) {
      const s = st.reduce((best, c) => (Math.abs(c.s - sTarget - shift) < Math.abs(best.s - sTarget - shift) ? c : best));
      const [cx, , cz] = at(s, track * TRACK);
      if (!clears(records, cx, cz, 10.9, 1.3, s.tx, s.tz, 0.4)) continue;
      const y = hf.getHeightAt(cx, cz);
      const sink = new PartSink([look() * 5, look() * 5]);
      sink.placed(Math.atan2(-s.tz, s.tx), cx, y + 0.02, cz, () => burntTram(sink, look));
      push(ctx, sink);
      block(ctx, cx, cz, 10.9, 1.25, s.tx, s.tz, y, y + 3.1, 'tram-wreck');
      records.push(...(ctx.obstacles ?? []).slice(-1));
      return;
    }
  };
  const total = st[st.length - 1].s, mid = st.reduce((best, c) => (Math.hypot(c.x, c.z) < Math.hypot(best.x, best.z) ? c : best)).s;
  tramAt(mid - Math.min(110, total * 0.12), 1);
  tramAt(mid + Math.min(110, total * 0.12), -1);
  // ---- the container screens at the crossings: along the kerb on each side, clear of the cross street
  for (let r = 0; r < roads.length; r++) {
    if (r === road) continue;
    const other = roads[r];
    for (const end of [other[0], other[other.length - 1]]) {
      const hit = st.find((c) => Math.hypot(c.x - end[0], c.z - end[1]) < 1.6);
      if (!hit) continue;
      for (const side of [1, -1]) for (const dir of [1, -1]) {
        if (place() < 0.3) continue;
        // the corner between the two roads (the street rows keep 9.5 m clear of a crossing road): the first seat clear
        const off = side * (POLE_OFFSET + 1.5);
        for (const at0 of [7.2, 8.4, 6.2]) {
          const along = dir * at0;
          const cx = hit.x + hit.tx * along + hit.nx * off, cz = hit.z + hit.tz * along + hit.nz * off;
          if (!clears(records, cx, cz, BOX_HL, BOX_HW, hit.tx, hit.tz, 0.4)) continue;
          const y = Math.min(hf.getHeightAt(cx - hit.tx * BOX_HL, cz - hit.tz * BOX_HL), hf.getHeightAt(cx + hit.tx * BOX_HL, cz + hit.tz * BOX_HL));
          const sink = new PartSink([look() * 5, look() * 5]);
          sink.placed(Math.atan2(-hit.tz, hit.tx), cx, y - 0.05, cz, () => container(sink, CONTAINERS[Math.floor(look() * CONTAINERS.length) % CONTAINERS.length], look, mobile));
          push(ctx, sink);
          block(ctx, cx, cz, BOX_HL, BOX_HW, hit.tx, hit.tz, y, y + 2.6, 'container-screen');
          records.push(...(ctx.obstacles ?? []).slice(-1));
          break;
        }
      }
    }
  }
}

