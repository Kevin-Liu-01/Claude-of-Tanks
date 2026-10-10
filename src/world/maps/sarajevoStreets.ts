// src/world/maps/sarajevoStreets.ts — Ruinspires' streets and slopes as Sarajevo's (the map-revival lane, 2026-10-05; the
// map's `props.extraKits: ['sarajevo']`, dressed from maps/mapKits.ts dressMapExtras). Zmaja od Bosne carried the city's tram line
// down the valley through the whole siege: the double track in its paved bed between low kerbs down the boulevard's
// middle, the rails, the catenary on tubular steel poles at the kerbs with their cross-spans and the contact wires over
// each track (a pole bent here and there, a wire down); the trams burnt out where the shelling caught them, derailed
// and shoved against the kerb; and the shipping containers stood along the kerbs at the crossings as screens against
// the snipers in the hills, behind which people ran across.
//
// On the slopes below the ridges lie the cemeteries the siege filled — Kovači, the Lion cemetery, Bare: the white
// nišani of the Muslim graves in their rows, turbaned and plain, the crosses of the Christian ones among them.
//
// The bed, rails, poles, wires and stones are dressing (no collision: a hull drives over the bed and its kerbs); the burnt trams
// and the containers block like any wreck, each a convex footprint in both collision sinks, and stand clear of every
// road's core (the layout brief's solidPropsInRoad: a hull drives the roads past them). Everything draws from a stream
// of its own (never the props placement stream), and stands only where it clears the records already placed.
import type * as THREE from 'three';
import { PartSink, hashSeed, normalize3, rgb, shade, streamFrom, type Rgb, type Vec3 } from './regional/geometry.ts';
import { getDeviceTier } from '../../engine/quality.ts';
import { cloneCollisionRecord, setConvexShape, type CollisionRecord } from '../collision.ts';
import { yardKeepOut, type YardKeepOut } from './regional/yards.ts';

interface TramContext {
  L: {
    roads?: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
    spawns?: { player: { x: number; z: number }; enemies: ReadonlyArray<{ x: number; z: number }> };
    terrain?: { hardstands?: ReadonlyArray<{ x: number; z: number; width: number; length: number; yawDeg?: number }> };
  };
  heightField: {
    getHeightAt(x: number, z: number): number;
    bridgeDecks?: ReadonlyArray<{ x: number; z: number; ux: number; uz: number; halfLength: number; halfWidth: number; approachM?: number }>;
  };
  buckets: Record<string, THREE.BufferGeometry[] | undefined>;
  obstacles?: CollisionRecord[];
  colliders?: CollisionRecord[];
}

/** The track bed's half width, the track centres off the road's line, the rails off each track centre (standard gauge). */
const BED_HALF = 2.55, TRACK = 1.45, GAUGE_HALF = 0.7175;
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

/**
 * The layout brief's road core (tools/map-layout-metrics.mjs ROAD_CORE_M: 3.5 m either side of a road's line) and a
 * margin for the metric's metre grid: a wreck or a screen keeps this far from every road's line.
 */
const ROAD_CLEAR = 3.5 + 0.4;

/** Does a footprint (centre, half extents along / across a heading) keep ROAD_CLEAR from every road's line? */
function clearOfRoads(roads: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, cx: number, cz: number, hl: number, hw: number,
  tx: number, tz: number): boolean {
  const nx = -tz, nz = tx, na = Math.max(1, Math.ceil(2 * hl)), nb = Math.max(1, Math.ceil(2 * hw));
  for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) {
    const a = -hl + (2 * hl * i) / na, b = -hw + (2 * hw * j) / nb;
    const x = cx + tx * a + nx * b, z = cz + tz * a + nz * b;
    for (const line of roads) for (let k = 0; k + 1 < line.length; k++) {
      const [ax, az] = line[k], [bx, bz] = line[k + 1];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
      const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0;
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < ROAD_CLEAR) return false;
    }
  }
  return true;
}

/**
 * Does a footprint keep off the layout's objective ground (yards.ts yardKeepOut: the spawn pads, the zone-control discs,
 * the kickoff, the aprons and the bridge decks, each with its margin)? A screen in a square would move its zone.
 */
function clearOfKeepOut(keep: YardKeepOut | null, cx: number, cz: number, hl: number, hw: number, tx: number, tz: number): boolean {
  if (!keep) return true;
  const nx = -tz, nz = tx, na = Math.max(1, Math.ceil(2 * hl)), nb = Math.max(1, Math.ceil(2 * hw));
  for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) {
    const a = -hl + (2 * hl * i) / na, b = -hw + (2 * hw * j) / nb;
    const x = cx + tx * a + nx * b, z = cz + tz * a + nz * b;
    if (keep.discs.some(([dx, dz, r]) => Math.hypot(x - dx, z - dz) < r)) return false;
    if (keep.rects.some((q) => {
      const ox = x - q.x, oz = z - q.z;
      return Math.abs(ox * q.ux + oz * q.uz) < q.halfAlong && Math.abs(-ox * q.uz + oz * q.ux) < q.halfAcross;
    })) return false;
  }
  return true;
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
function dressTramBoulevard(ctx: TramContext, keep: YardKeepOut | null, road = 0): void {
  const roads = ctx.L.roads ?? [];
  const line = roads[road];
  if (!line || line.length < 2) return;
  const hf = ctx.heightField;
  const mobile = getDeviceTier() === 'mobile';
  // the placements (what blocks) draw from the seats' own hashes, the looks from a stream: a phone's lighter dressing
  // never moves a wreck or a container, so the collision a host certifies is the desktop's
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
    bed.quad('plaster3', up(L0), up(L1), up(C1), up(C0), { decor: true, uv: { kind: 'world' } });
    bed.quad('plaster3', up(C0), up(C1), up(R1), up(R0), { decor: true, uv: { kind: 'world' } });
    // the bed's low kerbs
    for (const off of [BED_HALF, -BED_HALF]) {
      const p0 = at(a, off), p1 = at(b, off);
      bed.member('stone', up(p0, 0.02), up(p1, 0.02), 0.2, 0.09, [0, 1, 0], { decor: true }, 0.02);
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
  // ---- two burnt trams, rotation-symmetric about the map's centre: derailed and shoved against the kerb, one on each
  // side, each midway between two poles of the catenary (its inner side clear of the boulevard's core)
  const poles = st.filter((_c, i) => i % Math.round(SPAN / 2) === 0);
  const TRAM_OFF = ROAD_CLEAR + 1.25 + 0.1;
  const tramAt = (sTarget: number, side: number) => {
    const bays = poles.slice(0, -1).map((p) => p.s + SPAN / 2).sort((a, b) => Math.abs(a - sTarget) - Math.abs(b - sTarget));
    for (const target of bays.slice(0, 6)) {
      const s = st.reduce((best, c) => (Math.abs(c.s - target) < Math.abs(best.s - target) ? c : best));
      const [cx, , cz] = at(s, side * TRAM_OFF);
      if (!clears(records, cx, cz, 10.9, 1.3, s.tx, s.tz, 0.4) || !clearOfRoads(roads, cx, cz, 10.9, 1.25, s.tx, s.tz)
        || !clearOfKeepOut(keep, cx, cz, 10.9, 1.25, s.tx, s.tz)) continue;
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
  // ---- the container screens at the crossings: along the kerb on each side, clear of the cross street. They stand in
  // rotation pairs about the Square (the layout is its own rotation): each crossing seats its screens from the cross
  // street's own end point, and each seat draws its rotation-canonical seat's lot (turned half round, a seat's side of
  // the boulevard and its way along it flip; the boulevard's heading at the two crossings is the same)
  const seen = new Set<string>();
  for (let r = 0; r < roads.length; r++) {
    if (r === road) continue;
    const other = roads[r];
    for (const end of [other[0], other[other.length - 1]]) {
      const id = `${Math.round(end[0])},${Math.round(end[1])}`;
      if (seen.has(id) || !st.some((c) => Math.hypot(c.x - end[0], c.z - end[1]) < 1.6)) continue;
      seen.add(id);
      // the boulevard's heading at the crossing: the chord of its line 9 m either side (a bend's vertex has no one
      // tangent, and the two crossings of a rotation pair must read the same heading)
      const near = st.filter((c) => Math.hypot(c.x - end[0], c.z - end[1]) < 9);
      const c0 = near[0], c1 = near[near.length - 1], cl = Math.hypot(c1.x - c0.x, c1.z - c0.z) || 1;
      const hit = { tx: (c1.x - c0.x) / cl, tz: (c1.z - c0.z) / cl, nx: -(c1.z - c0.z) / cl, nz: (c1.x - c0.x) / cl };
      const canon = end[0] > 1e-6 || (Math.abs(end[0]) <= 1e-6 && end[1] > 0);
      for (const side of [1, -1]) for (const dir of [1, -1]) {
        const key = canon ? [end[0], end[1], side, dir] : [-end[0], -end[1], -side, -dir];
        if (streamFrom(hashSeed('sarajevo-screen', Math.round(key[0]), Math.round(key[1]), key[2], key[3]))() < 0.5) continue;
        // the corner between the two roads (the street rows keep 9.5 m clear of a crossing road): the first seat clear
        const off = side * (POLE_OFFSET + 1.5);
        for (const at0 of [7.4, 8.6, 9.8]) {
          const along = dir * at0;
          const cx = end[0] + hit.tx * along + hit.nx * off, cz = end[1] + hit.tz * along + hit.nz * off;
          if (!clears(records, cx, cz, BOX_HL, BOX_HW, hit.tx, hit.tz, 0.4) || !clearOfRoads(roads, cx, cz, BOX_HL, BOX_HW, hit.tx, hit.tz)
            || !clearOfKeepOut(keep, cx, cz, BOX_HL, BOX_HW, hit.tx, hit.tz)) continue;
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


/** The cemeteries' plots on Ruinspires' slopes below the ridges (a rotation pair about the Square): centre, half sizes. */
const CEMETERIES: ReadonlyArray<{ x: number; z: number; hx: number; hz: number }> = [
  { x: -170, z: -262, hx: 30, hz: 22 }, { x: 170, z: 262, hx: 30, hz: 22 },
];

/** A cross of white stone on its plinth. (x, z) its foot. */
function cross(sink: PartSink, x: number, y: number, z: number, h: number, yaw: number): void {
  sink.placed(yaw, x, y, z, () => {
    sink.span('stone', -0.16, -0.2, -0.1, 0.16, 0.1, 0.1, { decor: true });
    sink.span('stone', -0.05, 0.1, -0.04, 0.05, h, 0.04, { decor: true });
    sink.span('stone', -0.24, h * 0.66, -0.04, 0.24, h * 0.66 + 0.1, 0.04, { decor: true });
  });
}

/**
 * The cemeteries: rows of graves along the contour, each a white nišan (a turban on a man's, a pointed head on a
 * woman's, the plain rounded pillar of the siege's dead) or a cross, gaps where the rows break, clear of every record.
 */
function dressCemeteries(ctx: TramContext): void {
  const hf = ctx.heightField;
  const mobile = getDeviceTier() === 'mobile';
  const records = [...(ctx.obstacles ?? []), ...(ctx.colliders ?? [])];
  for (const [k, c] of CEMETERIES.entries()) {
    const look = streamFrom(hashSeed('sarajevo-cemetery', k, c.x, c.z));
    const sink = new PartSink([look() * 5, look() * 5]);
    const step = mobile ? 2.2 : 1.15, rowGap = 2.3;
    for (let z = c.z - c.hz; z <= c.z + c.hz; z += rowGap) {
      let x = c.x - c.hx + look() * step;
      while (x <= c.x + c.hx) {
        const gap = look();
        if (gap < 0.22) { x += step * (1 + look() * 3); continue; }
        const px = x + (look() - 0.5) * 0.25, pz = z + (look() - 0.5) * 0.3;
        x += step * (0.85 + look() * 0.3);
        if (!clears(records, px, pz, 0.3, 0.3, 1, 0, 0.25)) continue;
        const y = hf.getHeightAt(px, pz), roll = look(), h = 0.7 + look() * 0.6, yaw = (look() - 0.5) * 0.25;
        if (roll < 0.14) cross(sink, px, y, pz, h + 0.2, yaw);
        else sink.placed(yaw, px, y, pz, () => {
          // a nišan: plinth, shaft, head (turban / pointed / the šehid's rounded pillar)
          sink.span('stone', -0.17, -0.25, -0.12, 0.17, 0.1, 0.12, { decor: true });
          sink.span('stone', -0.12, 0.1, -0.09, 0.12, h, 0.09, { decor: true });
          if (roll < 0.5) sink.cylinder('stone', [0, h - 0.02, 0], 'y', 0.24, 0.17, 6, { decor: true }, 0.13);
          else if (roll < 0.75) sink.cylinder('stone', [0, h, 0], 'y', 0.2, 0.12, 4, { decor: true }, 0.01, true, Math.PI / 4);
          else sink.cylinder('stone', [0, h, 0], 'y', 0.1, 0.12, 6, { decor: true }, 0.07);
        });
      }
    }
    push(ctx, sink);
  }
}

// ------------------------------------------------------------------------------------------------ the siege's streets

/** A value noise in [0, 1) on a turned grid (clumps, never squared to the streets), an integer hash of the cell. */
function clumpNoise(x: number, z: number, scale: number, salt: number): number {
  const fx = (0.8 * x - 0.6 * z) / scale, fz = (0.6 * x + 0.8 * z) / scale;
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const h = (a: number, b: number): number => {
    let k = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ salt;
    k = Math.imul(k ^ (k >>> 15), 0x85ebca6b); k = Math.imul(k ^ (k >>> 13), 0xc2b2ae35);
    return ((k ^ (k >>> 16)) >>> 0) / 4294967296;
  };
  const a = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * sx;
  const b = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * sx;
  return a + (b - a) * sz;
}

/** The kerb line (props.ts kerbs 5.05 m off every line): the pavement's litter lies between it and the frontage. */
const KERB_M = 5.05;
const SPALL = rgb(0x8b8378), BRICK = rgb(0x8a4e3a), CHAR_WOOD = rgb(0x2d2621), STUMP = rgb(0x9a8569), STUMP_TOP = rgb(0xc7ad84);
/** The sheeting the city hung against the snipers: UNHCR's blue-and-white plastic, grey blankets, a rust-red tarp. */
const SHEETS: readonly Rgb[] = [rgb(0x3c6e9f), rgb(0xd3d4cf), rgb(0x8f908a), rgb(0x7d3d2c), rgb(0x4d7fae), rgb(0xc9c7bd)];

/**
 * A heap of the facades' fall swept to the kerb: masonry lumps, brick ends and a plaster slab or two, sunk into the
 * pavement, longer along the kerb than across it (x along the kerb, z across, y up from the ground at its centre).
 */
function kerbHeap(sink: PartSink, look: () => number, size: number, mobile: boolean): void {
  const n = mobile ? 3 : 5 + ((look() * 5) | 0);
  for (let i = 0; i < n; i++) {
    const w = (0.18 + look() * 0.45) * size, h = (0.12 + look() * 0.32) * size, d = (0.15 + look() * 0.35) * size;
    const x = (look() - 0.5) * 2.2 * size, z = (look() - 0.5) * 0.9 * size;
    const lift = h * (0.25 + look() * 0.25) * (1 - Math.min(1, (Math.abs(x) / (1.3 * size)) ** 2));
    sink.placed((look() - 0.5) * 1.6, x, -0.06, z, () => {
      const roll = look();
      if (roll < 0.55) sink.span('structureMetal', -w / 2, lift - h * 0.4, -d / 2, w / 2, lift + h * 0.6, d / 2,
        { colour: shade(SPALL, 0.75 + look() * 0.35), decor: true, shadow: true });
      else if (roll < 0.82) sink.span('structureMetal', -w * 0.4, lift - 0.04, -d * 0.3, w * 0.4, lift + 0.08, d * 0.3,
        { colour: shade(BRICK, 0.8 + look() * 0.3), decor: true, shadow: true });
      else sink.member('structureMetal', [-w * 0.8, lift + 0.02, 0], [w * 0.8, lift + h * 0.7, 0], d * 0.9, 0.06, [0, 0, 1],
        { colour: shade(SPALL, 0.95 + look() * 0.2), decor: true, shadow: true }, 0);
    });
  }
  // a charred joist end from the burnt floors above, now and then
  if (!mobile && look() < 0.3) {
    const a: Vec3 = [-0.9 * size, 0.05, (look() - 0.5) * 0.4], b: Vec3 = [0.6 * size, 0.25 + look() * 0.3, (look() - 0.5) * 0.6];
    sink.member('structureWood', a, b, 0.14, 0.12, [0, 0, 1], { colour: CHAR_WOOD, decor: true, shadow: true }, 0);
  }
}

/** A street tree the siege's winters cut for firewood: the sawn stump, its root flare, the cut face pale. */
function stump(sink: PartSink, look: () => number): void {
  const r = 0.17 + look() * 0.14, h = 0.25 + look() * 0.45;
  sink.cylinder('structureWood', [0, -0.05, 0], 'y', h + 0.05, r, 7, { colour: shade(STUMP, 0.8 + look() * 0.3), decor: true, shadow: true }, r * 0.92);
  sink.cylinder('structureWood', [0, -0.08, 0], 'y', 0.2, r * 1.35, 7, { colour: shade(STUMP, 0.7), decor: true, shadow: true }, r);
  sink.cylinder('structureWood', [0, h, 0], 'y', 0.015, r * 0.9, 7, { colour: STUMP_TOP, decor: true, shadow: true }, r * 0.9);
}

/**
 * Sarajevo's streets under the siege (the map-revival lane, round 4, 2026-10-09; gauntlet wave 319: "a tram street
 * that is spotless for a city under siege"): the fall off the shelled facades swept into heaps along the kerbs, thickest
 * in clumps, the boulevard's street trees cut to stumps for firewood in the first winter, and the sheeting hung across
 * the side streets' mouths at the boulevard against the snipers on the hills, high over the carriageway. All dressing
 * (no collision, nothing a hull or a round meets; casting its shadow); every look from the seat's own hash; clear of the squares' objective
 * ground and every record placed so far.
 */
function dressSiegeStreets(ctx: TramContext, keep: YardKeepOut | null, limit = 330): void {
  const roads = ctx.L.roads ?? [];
  const hf = ctx.heightField;
  const mobile = getDeviceTier() === 'mobile';
  // the facades' fall lies against the facades: it may touch a building's footprint, never another solid placed so far
  // (a wreck, a container screen, the sandbags), never the objective ground, never a road's core
  const solids = [...(ctx.obstacles ?? []), ...(ctx.colliders ?? [])].filter((r) => r.kind !== 'structure');
  const sink = new PartSink([0, 0]);
  const clearAt = (x: number, z: number, r: number, tx = 1, tz = 0) => clears(solids, x, z, r, r, tx, tz, 0.15)
    && clearOfKeepOut(keep, x, z, r, r, tx, tz) && clearOfRoads(roads, x, z, r, r * 0.6, tx, tz);
  for (const [ri, line] of roads.entries()) {
    if (!line || line.length < 2) continue;
    const st = resample(line, mobile ? 4.0 : 2.0, limit);
    for (const s of st) {
      for (const side of [-1, 1]) {
        const look = streamFrom(hashSeed('sarajevo-kerb', ri, Math.round(s.s * 10), side));
        // the heaps keep to their clumps (a heart of rubble here, a swept stretch there), most of a street's length
        const fx = s.x + s.nx * side * (KERB_M + 1.6), fz = s.z + s.nz * side * (KERB_M + 1.6);
        const w = clumpNoise(fx, fz, 11, 0x51e9 + ri);
        if (w > 0.38 && look() < (w - 0.38) * 2.4) {
          // against the frontage: 0.6-2.4 m in from the kerb's line, the heap's long side along the street
          const across = 0.6 + look() * 1.8, along = (look() - 0.5) * 1.6;
          const x = s.x + s.nx * side * (KERB_M + across) + s.tx * along, z = s.z + s.nz * side * (KERB_M + across) + s.tz * along;
          if (clearAt(x, z, 0.9, s.tx, s.tz)) {
            const yaw = -Math.atan2(s.tz, s.tx) + (look() - 0.5) * 0.3;
            sink.placed(yaw, x, hf.getHeightAt(x, z), z, () => kerbHeap(sink, look, 1.0 + look() * 1.1 * w, mobile));
          }
        }
        // the gutter's litter: masonry chips and plaster flakes washed against the kerb, 4.4-4.9 m off the line
        if (!mobile && w > 0.3 && look() < 0.55) {
          const g = KERB_M - 0.2 - look() * 0.5, along = (look() - 0.5) * 1.8;
          const x = s.x + s.nx * side * g + s.tx * along, z = s.z + s.nz * side * g + s.tz * along;
          if (clears(solids, x, z, 0.4, 0.4, s.tx, s.tz, 0.1) && clearOfKeepOut(keep, x, z, 0.4, 0.4, s.tx, s.tz)) {
            sink.placed(look() * 6.28, x, hf.getHeightAt(x, z), z, () => {
              for (let k = 0, n = 2 + ((look() * 4) | 0); k < n; k++) {
                const ww = 0.08 + look() * 0.22, hh = 0.04 + look() * 0.09, dd = 0.06 + look() * 0.18;
                const px = (look() - 0.5) * 0.9, pz = (look() - 0.5) * 0.5;
                sink.span('structureMetal', px - ww / 2, -0.03, pz - dd / 2, px + ww / 2, hh, pz + dd / 2,
                  { colour: shade(look() < 0.7 ? SPALL : BRICK, 0.7 + look() * 0.4), decor: true });
              }
            });
          }
        }
      }
    }
  }
  // the boulevard's stumps (road 0): two trees a catenary bay, between its poles (dressTramBoulevard: a pole every 34 m
  // from the line's start on the same two-metre stations), in the pavement just behind the kerb, most of them cut
  const boulevard = roads[0];
  if (boulevard && boulevard.length > 1) {
    const bst = resample(boulevard, 2.0, limit);
    for (const [i, s] of bst.entries()) {
      const bay = i % Math.round(SPAN / 2);
      if (bay !== 6 && bay !== 11) continue;
      for (const side of [-1, 1]) {
        const look = streamFrom(hashSeed('sarajevo-stump', i, side));
        if (look() < 0.18) continue;
        const off = KERB_M + 0.6;
        const x = s.x + s.nx * side * off, z = s.z + s.nz * side * off;
        if (!clears(solids, x, z, 0.45, 0.45, 1, 0, 0.15) || !clearOfKeepOut(keep, x, z, 0.45, 0.45, 1, 0)) continue;
        sink.placed(look() * 6.28, x, hf.getHeightAt(x, z), z, () => stump(sink, look));
      }
    }
  }
  // the screens: where another road leaves the boulevard, sheets hung on a wire across its mouth, 2.8-6.6 m up
  if (boulevard && !mobile) {
    for (const [ri, line] of roads.entries()) {
      if (ri === 0 || !line || line.length < 2) continue;
      for (const s of resample(line, 2.0, limit)) {
        // the first stretch of the side street 13-19 m from the boulevard's line
        let best = Infinity;
        for (let i = 0; i + 1 < boulevard.length; i++) {
          const [ax, az] = boulevard[i], [bx, bz] = boulevard[i + 1];
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.z - az) * dz) / l2));
          best = Math.min(best, Math.hypot(s.x - ax - dx * t, s.z - az - dz * t));
        }
        if (best < 13 || best > 19) continue;
        const look = streamFrom(hashSeed('sarajevo-screen', ri, Math.round(s.x), Math.round(s.z)));
        if (look() < 0.1) break;
        const half = 7.4, y = hf.getHeightAt(s.x, s.z), top = 6.2 + look() * 0.4;
        const yaw = -Math.atan2(s.nz, s.nx);
        sink.placed(yaw, s.x, y, s.z, () => {
          // the wire from facade to facade, sagging; the sheets on it, overlapping, their lower edges ragged
          sink.member('structureMetal', [-half, top, 0], [0, top - 0.35, 0], 0.03, 0.03, [0, 0, 1], { colour: WIRE, decor: true, shadow: true }, 0);
          sink.member('structureMetal', [0, top - 0.35, 0], [half, top, 0], 0.03, 0.03, [0, 0, 1], { colour: WIRE, decor: true, shadow: true }, 0);
          let u = -half + 0.2;
          while (u < half - 0.5) {
            const w = 1.4 + look() * 2.2, h = 2.6 + look() * 1.2;
            const sag = 0.35 * (1 - Math.abs(u + w / 2) / half);
            const c = SHEETS[(look() * SHEETS.length) | 0];
            sink.span('structureMetal', u, top - sag - h, -0.02 - look() * 0.04, Math.min(half - 0.2, u + w), top - sag - 0.04, 0.02,
              { colour: shade(c, 0.85 + look() * 0.2), decor: true, shadow: true });
            u += w - 0.15 + look() * 0.3;
          }
        });
        break; // one screen a side street's mouth
      }
    }
  }
  push(ctx, sink);
}

/** Ruinspires as Sarajevo: the boulevard's tram line and its street works, the hillside cemeteries. */
export function dressSarajevo(ctx: TramContext, mapId = 'ruinspires'): void {
  // the objective ground the trams and the screens keep off (the squares stay open: their zones seat where authored)
  const decks = (ctx.heightField.bridgeDecks ?? []).map((deck) => ({ ...deck, approachM: deck.approachM ?? 0 }));
  const keep = ctx.L.spawns ? yardKeepOut(mapId, ctx.L.spawns, ctx.L.terrain?.hardstands ?? [], decks) : null;
  dressTramBoulevard(ctx, keep, 0);
  dressCemeteries(ctx);
  dressSiegeStreets(ctx, keep);
}
