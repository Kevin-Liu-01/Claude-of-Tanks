// src/world/maps/shanghaiStreets.ts — Suzhou Creek's streets and water as Shanghai's in 1937 (the map-revival lane,
// 2026-10-05; the map's `props.extraKits: ['shanghai']`, dressed from maps/mapKits.ts dressMapExtras after the creek's
// bridges):
//   - the tram line down the Settlement's avenue (road 2): the double track in its bed between low kerbs, the rails, the
//     catenary on steel poles at the kerbs with their cross-spans and the contact wire over each track (a pole bent, a
//     wire down where the shells fell), and two trams burnt out where the fighting caught them, shoved against the kerb
//     in the green and cream of the Settlement's tramways;
//   - the bridgeheads: the sandbagged posts the Settlement's garrison and the Chinese army built at both ends of every
//     bridge, a horseshoe of bags either side of the road, the wire coiled along the bank;
//   - the creek's sampans: moored in rafts of two and three along both banks, their arched mat roofs over the middle,
//     the scull at the stern, clear of the bridges;
//   - North Station's ground (Suzhou round 3, wave 209: "the station sits on bare dirt"): its forecourt paved before the
//     head building, its lamps, the tracks out of the train shed's open end on their sleepers and ballast, the island
//     platforms under the shed and the buffer stops at the concourse.
// The bed, rails, poles, wires, sandbags, wire and boats are dressing (no collision: a hull drives over the bed, through
// the bags and wades past the boats); the burnt trams block like any wreck, each a convex footprint in both collision
// sinks, clear of every road's core and of the objective ground. Everything draws from streams of its own (never the
// props placement stream) and stands only where it clears the records already placed.
import type * as THREE from 'three';
import { PartSink, hashSeed, normalize3, rgb, shade, streamFrom, type Rgb, type Vec3 } from './regional/geometry.ts';
import { getDeviceTier } from '../../engine/quality.ts';
import { cloneCollisionRecord, collisionFootprintContainsPoint, setConvexShape, type CollisionRecord } from '../collision.ts';
import { yardKeepOut, type YardKeepOut } from './regional/yards.ts';
import { bankOf } from './regional/shanghaiParts.ts';
import type { RegionalBuildContext } from './regional/types.ts';

interface BridgeDeck { x: number; z: number; ux: number; uz: number; halfLength: number; halfWidth: number; approachM?: number; waterY?: number }

interface StreetContext {
  L: {
    roads?: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
    marshes?: ReadonlyArray<{ x: number; z: number; r: number }>;
    spawns?: { player: { x: number; z: number }; enemies: ReadonlyArray<{ x: number; z: number }> };
    terrain?: { hardstands?: ReadonlyArray<{ x: number; z: number; width: number; length: number; yawDeg?: number }> };
  };
  heightField: {
    getHeightAt(x: number, z: number): number;
    getWaterMaskAt?(x: number, z: number): number;
    getWaterDepthAt?(x: number, z: number): number;
    getWaterSurfaceHeightAt?(x: number, z: number): number;
    bridgeDecks?: ReadonlyArray<BridgeDeck>;
  };
  buckets: Record<string, THREE.BufferGeometry[] | undefined>;
  obstacles?: CollisionRecord[];
  colliders?: CollisionRecord[];
  /** the buildings placed (props.ts buildingFeatures, the plan's with their structure kind): the station's seat */
  buildings?: ReadonlyArray<{ x: number; z: number; w: number; d: number; rot: number; kind?: string }>;
}

/** The track bed's half width, the track centres off the road's line, the rails off each track centre (standard gauge). */
const BED_HALF = 2.55, TRACK = 1.45, GAUGE_HALF = 0.7175;
/** The poles stand at the kerbs, every SPAN metres along the line. */
const POLE_OFFSET = 5.4, SPAN = 32, WIRE_Y = 5.6, SPAN_Y = 6.5, POLE_H = 7.4;
const RAIL = rgb(0x6f645a), POLE = rgb(0x3a4540), WIRE = rgb(0x26292a);
const LIVERY_GREEN = rgb(0x2f4a3a), LIVERY_CREAM = rgb(0xcfc4a2), RUST = rgb(0x6a4030);
const HESSIAN = rgb(0x9a8a6a), HULL = rgb(0x3e3226), MAT = rgb(0x6b5a3e);

interface Station { x: number; z: number; tx: number; tz: number; nx: number; nz: number; s: number }

/** The line resampled every `step` metres (with tangent and left normal), inside |x|, |z| <= limit. */
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

/** The layout brief's road core (tools/map-layout-metrics.mjs ROAD_CORE_M, 3.5 m) and a margin for its metre grid. */
const ROAD_CLEAR = 3.5 + 0.4;

/** Does a footprint keep ROAD_CLEAR from every road's line? */
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

/** Does a footprint keep off the layout's objective ground (yards.ts yardKeepOut: pads, zone discs, kickoff, decks)? */
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
function block(ctx: StreetContext, cx: number, cz: number, hl: number, hw: number, tx: number, tz: number, y0: number, y1: number, kind: string): void {
  const nx = -tz, nz = tx;
  const pts = [[1, 1], [1, -1], [-1, -1], [-1, 1]].flatMap(([a, b]) => [cx + tx * hl * a + nx * hw * b, cz + tz * hl * a + nz * hw * b]);
  const record = setConvexShape({ min: [0, y0, 0], max: [0, y1, 0], kind }, pts);
  ctx.obstacles?.push(record);
  ctx.colliders?.push(cloneCollisionRecord(record));
}

function push(ctx: StreetContext, sink: PartSink): void {
  const parts = sink.finish();
  for (const [bucket, list] of Object.entries(parts)) for (const g of list) (ctx.buckets[bucket] ??= []).push(g);
}

/**
 * A burnt single-deck tram of the Settlement's lines: the body on its two trucks, the paint burnt to rust and char, the
 * windows gone to the dark, the clerestory roof sagging, the trolley pole bent. Built in the frame of the track.
 */
function burntTram(sink: PartSink, look: () => number): void {
  const L = 11.2, W = 2.2, H = 3.2;
  const paint = (base: Rgb) => (look() < 0.55 ? shade(RUST, 0.8 + look() * 0.4) : look() < 0.5 ? [0.07, 0.06, 0.055] as Rgb : base);
  for (const bx of [-L * 0.3, L * 0.3]) sink.span('structureMetal', bx - 1.0, 0.05, -0.85, bx + 1.0, 0.72, 0.85, { colour: [0.08, 0.075, 0.07] });
  sink.span('structureMetal', -L / 2, 0.72, -W / 2, L / 2, 1.75, W / 2, { colour: paint(LIVERY_GREEN) });
  sink.span('dark', -L / 2 + 0.06, 1.75, -W / 2 + 0.04, L / 2 - 0.06, 2.65, W / 2 - 0.04);
  for (let p = 0; p <= 8; p++) {
    const px = -L / 2 + 0.1 + (L - 0.2) * p / 8;
    for (const s of [-1, 1]) sink.span('structureMetal', px - 0.07, 1.75, s * W / 2 - 0.05, px + 0.07, 2.65, s * W / 2 + 0.05, { colour: paint(LIVERY_CREAM), decor: true });
  }
  sink.span('structureMetal', -L / 2, 2.65, -W / 2, L / 2, 2.85, W / 2, { colour: paint(LIVERY_CREAM) });
  const sag = 0.12 + look() * 0.28;
  sink.member('structureMetal', [-L / 2 + 0.1, H - 0.05, 0], [0, H - sag, 0], W * 0.62, 0.06, [0, 1, 0], { colour: [0.12, 0.1, 0.09], decor: true, exposed: true }, 0);
  sink.member('structureMetal', [0, H - sag, 0], [L / 2 - 0.1, H - 0.05, 0], W * 0.62, 0.06, [0, 1, 0], { colour: [0.12, 0.1, 0.09], decor: true, exposed: true }, 0);
  for (const k of [-1, 1]) sink.span('dark', k * (L / 2 - 0.02) - 0.03, 1.8, -W / 2 + 0.25, k * (L / 2 - 0.02) + 0.03, 2.6, W / 2 - 0.25, { decor: true });
  const pa: Vec3 = [-1.0, H, 0], pb: Vec3 = [2.2, H + 1.1 + look() * 0.6, 0.3 + look() * 0.4];
  sink.member('structureMetal', pa, pb, 0.05, 0.05, [0, 0, 1], { colour: WIRE, decor: true, exposed: true }, 0);
}

/** The tram line down the Settlement's avenue (road `road`), its catenary and two burnt trams. */
function dressTramAvenue(ctx: StreetContext, keep: YardKeepOut | null, road: number): void {
  const roads = ctx.L.roads ?? [];
  const line = roads[road];
  if (!line || line.length < 2) return;
  const hf = ctx.heightField;
  const mobile = getDeviceTier() === 'mobile';
  // the placements draw from the seats' own hashes, the looks from a stream: a phone's lighter dressing never moves a
  // wreck, so the collision a host certifies is the desktop's
  const look = streamFrom(hashSeed('shanghai-tram', road, line.length));
  const st = resample(line, 2.0, 430);
  if (st.length < 4) return;
  const at = (s: Station, off: number): Vec3 => { const x = s.x + s.nx * off, z = s.z + s.nz * off; return [x, hf.getHeightAt(x, z), z]; };
  const decks = hf.bridgeDecks ?? [];
  const onDeck = (x: number, z: number) => decks.some((d) => {
    const ox = x - d.x, oz = z - d.z;
    return Math.abs(ox * d.ux + oz * d.uz) < d.halfLength + (d.approachM ?? 0) + 2 && Math.abs(-ox * d.uz + oz * d.ux) < d.halfWidth + 2;
  });
  const bed = new PartSink([0, 0]);
  for (let i = 0; i + 1 < st.length; i++) {
    const a = st[i], b = st[i + 1];
    if (b.s - a.s > 2.5 || onDeck(a.x, a.z) || onDeck(b.x, b.z)) continue;
    const L0 = at(a, BED_HALF), L1 = at(b, BED_HALF), R0 = at(a, -BED_HALF), R1 = at(b, -BED_HALF), C0 = at(a, 0), C1 = at(b, 0);
    const lift = 0.045;
    const up = (p: Vec3, k = lift): Vec3 => [p[0], p[1] + k, p[2]];
    bed.quad('plaster3', up(L0), up(L1), up(C1), up(C0), { decor: true, uv: { kind: 'world' } });
    bed.quad('plaster3', up(C0), up(C1), up(R1), up(R0), { decor: true, uv: { kind: 'world' } });
    for (const off of [BED_HALF, -BED_HALF]) bed.member('stone', up(at(a, off), 0.02), up(at(b, off), 0.02), 0.2, 0.09, [0, 1, 0], { decor: true }, 0.02);
    for (const t of [-1, 1]) for (const g of [-1, 1]) {
      const off = t * TRACK + g * GAUGE_HALF;
      bed.member('structureWood', up(at(a, off), lift + 0.005), up(at(b, off), lift + 0.005), 0.075, 0.035, [0, 1, 0], { decor: true, colour: RAIL, fine: true }, 0.02);
    }
  }
  push(ctx, bed);
  // the catenary: poles in pairs at the kerbs, a cross-span between each standing pair (a lone pole carries a bracket arm
  // out over both tracks instead), the contact wire over each track from support to support. A wire runs only between
  // two supports one bay apart along the line (Ruinspires' wave 162: "floating catenary wires" where a line leaves the
  // limit and comes back, or a span had fallen); a bay whose support is down ends its wires, one hanging to the roadway
  const wires = new PartSink([0, 0]);
  const records = [...(ctx.obstacles ?? []), ...(ctx.colliders ?? [])];
  const BAY = Math.round(SPAN / 2);
  let prev: { y: number; s: Station; carried: boolean } | null = null;
  for (let i = 0; i < st.length; i += BAY) {
    const s = st[i];
    if (onDeck(s.x, s.z)) { prev = null; continue; }
    const y = hf.getHeightAt(s.x, s.z);
    const tops: Vec3[] = [];
    const lone: Array<{ side: number; px: number; py: number; pz: number }> = [];
    for (const side of [1, -1]) {
      const [px, , pz] = at(s, side * POLE_OFFSET);
      if (!clears(records, px, pz, 0.3, 0.3, s.tx, s.tz, 0.2)) continue;
      const py = hf.getHeightAt(px, pz);
      const bent = look() < 0.1;
      const h = bent ? POLE_H * (0.55 + look() * 0.3) : POLE_H;
      const lean = bent ? 0.25 + look() * 0.3 : 0;
      const top: Vec3 = [px - s.nx * side * lean * h * 0.4, py + h, pz - s.nz * side * lean * h * 0.4];
      wires.member('structureMetal', [px, py - 0.3, pz], top, 0.2, 0.2, normalize3([s.tx, 0, s.tz]), { colour: POLE, decor: true, exposed: true }, 0);
      if (!bent) {
        wires.member('structureMetal', [px, py + SPAN_Y - 0.3, pz], [px - s.nx * side * 1.2, py + SPAN_Y - 0.1, pz - s.nz * side * 1.2], 0.08, 0.08,
          normalize3([s.tx, 0, s.tz]), { colour: POLE, decor: true, exposed: true }, 0);
        tops.push([px, py + SPAN_Y, pz]);
        lone.push({ side, px, py, pz });
      }
    }
    let carried = tops.length === 2;
    if (!carried && lone.length === 1) {
      const { side, px, py, pz } = lone[0];
      const reach = POLE_OFFSET + TRACK + 0.6;
      const tip: Vec3 = [px - s.nx * side * reach, py + SPAN_Y - 0.25, pz - s.nz * side * reach];
      wires.member('structureMetal', [px, py + SPAN_Y - 0.2, pz], tip, 0.09, 0.09, normalize3([s.tx, 0, s.tz]), { colour: POLE, decor: true, exposed: true }, 0);
      wires.member('structureMetal', [px, py + SPAN_Y - 1.7, pz], [(px + tip[0]) / 2, py + SPAN_Y - 0.25, (pz + tip[2]) / 2], 0.05, 0.05,
        normalize3([s.tx, 0, s.tz]), { colour: POLE, decor: true, exposed: true }, 0);
      carried = true;
    }
    if (mobile) { prev = { y, s, carried }; continue; }
    if (tops.length === 2) wires.member('structureWood', tops[0], tops[1], 0.03, 0.03, [0, 1, 0], { colour: WIRE, decor: true, fine: true, exposed: true }, 0);
    const bayOk = prev !== null && s.s - prev.s.s <= SPAN * 1.25;
    if (prev && bayOk && (prev.carried || carried)) {
      for (const t of [-1, 1]) {
        const a = at(prev.s, t * TRACK), b = at(s, t * TRACK);
        const down = look() < 0.06;
        if (prev.carried && carried && !down) {
          wires.member('structureWood', [a[0], prev.y + WIRE_Y, a[2]], [b[0], y + WIRE_Y, b[2]], 0.025, 0.025, [0, 1, 0], { colour: WIRE, decor: true, fine: true, exposed: true }, 0);
          continue;
        }
        const [from, fy] = prev.carried ? [a, prev.y] : [b, y];
        wires.member('structureWood', [from[0], fy + WIRE_Y, from[2]], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.05, (a[2] + b[2]) / 2], 0.025, 0.025, [0, 1, 0],
          { colour: WIRE, decor: true, fine: true, exposed: true }, 0);
      }
    }
    prev = { y, s, carried };
  }
  push(ctx, wires);
  // burnt trams where they died, derailed off their track toward the kerb: inside the avenue (the layout brief counts a
  // wreck a roadblock, tools/map-layout-metrics.mjs ROADBLOCK_KINDS) but clear of the middle a hull drives (the road
  // crossing sweep's driver keeps to the line: a wreck on the track stopped it short of road 2's causeway), each with
  // its rotation twin about the map's centre where the avenue has one; failing that in a dozen bays, shoved against
  // the kerb. Midway between two poles.
  const poles = st.filter((_c, i) => i % Math.round(SPAN / 2) === 0);
  const TRAM_HL = 5.7, TRAM_HW = 1.15;
  const others = roads.filter((_line, r) => r !== road);
  const TRAM_SEATS: Array<{ off: number; onTrack: boolean }> = [{ off: 3.7, onTrack: true }, { off: ROAD_CLEAR + TRAM_HW + 0.1, onTrack: false }];
  const tramSeat = (s: Station, side: number, seat: { off: number; onTrack: boolean }): [number, number] | null => {
    const [cx, , cz] = at(s, side * seat.off);
    if (!clears(records, cx, cz, TRAM_HL, TRAM_HW + 0.05, s.tx, s.tz, 0.4) || !clearOfRoads(seat.onTrack ? others : roads, cx, cz, TRAM_HL, TRAM_HW, s.tx, s.tz)
      || !clearOfKeepOut(keep, cx, cz, TRAM_HL, TRAM_HW, s.tx, s.tz) || onDeck(cx, cz)) return null;
    return [cx, cz];
  };
  const placeTram = (s: Station, cx: number, cz: number, onTrack: boolean): void => {
    const y = hf.getHeightAt(cx, cz);
    const sink = new PartSink([look() * 5, look() * 5]);
    sink.placed(Math.atan2(-s.tz, s.tx), cx, y + (onTrack ? 0.08 : 0.02), cz, () => burntTram(sink, look));
    push(ctx, sink);
    block(ctx, cx, cz, TRAM_HL, TRAM_HW, s.tx, s.tz, y, y + 3.2, 'tram-wreck');
    records.push(...(ctx.obstacles ?? []).slice(-1));
  };
  // a pair when the avenue has a rotation twin for the seat; Suzhou Creek's avenue is no rotation of itself (its
  // district replays the head's plan), so each wreck then takes its own seat
  const tramAt = (sTarget: number, side: number, paired: boolean): boolean => {
    const bays = poles.slice(0, -1).map((p) => p.s + SPAN / 2).sort((a, b) => Math.abs(a - sTarget) - Math.abs(b - sTarget));
    for (const seat of TRAM_SEATS) for (const target of bays.slice(0, 12)) {
      const s = st.reduce((best, c) => (Math.abs(c.s - target) < Math.abs(best.s - target) ? c : best));
      const a = tramSeat(s, side, seat);
      if (!a) continue;
      if (paired) {
        const twin = st.reduce((best, c) => (Math.hypot(c.x + s.x, c.z + s.z) < Math.hypot(best.x + s.x, best.z + s.z) ? c : best));
        if (Math.hypot(twin.x + s.x, twin.z + s.z) > 2.5) return false;
        const b = tramSeat(twin, -side, seat);
        if (!b) continue;
        placeTram(s, a[0], a[1], seat.onTrack);
        placeTram(twin, b[0], b[1], seat.onTrack);
        return true;
      }
      placeTram(s, a[0], a[1], seat.onTrack);
      return true;
    }
    return false;
  };
  const total = st[st.length - 1].s, mid = st.reduce((best, c) => (Math.hypot(c.x, c.z) < Math.hypot(best.x, best.z) ? c : best)).s;
  for (const [k, side] of [[0.13, 1], [0.06, -1]] as const) {
    const d = Math.min(k > 0.1 ? 120 : 50, total * k);
    if (!tramAt(mid - d, side, true)) { tramAt(mid - d, side, false); tramAt(mid + d, -side, false); }
  }
}

/**
 * The bridgeheads: at both ends of every bridge, a horseshoe of sandbags either side of the road (open to the bridge,
 * its mouth toward the far bank), the wire coiled along the bank beside it. Dressing; the road itself stays clear.
 */
function dressBridgeheads(ctx: StreetContext): void {
  const hf = ctx.heightField;
  const mobile = getDeviceTier() === 'mobile';
  const records = [...(ctx.obstacles ?? []), ...(ctx.colliders ?? [])];
  for (const [k, d] of (hf.bridgeDecks ?? []).entries()) {
    const look = streamFrom(hashSeed('shanghai-bridgehead', k, d.x, d.z));
    const sink = new PartSink([look() * 5, look() * 5]);
    for (const end of [-1, 1]) {
      const along = end * (d.halfLength + (d.approachM ?? 0) + 5.5);
      for (const side of [-1, 1]) {
        const across = side * (d.halfWidth + 3.6);
        const cx = d.x + d.ux * along - d.uz * across, cz = d.z + d.uz * along + d.ux * across;
        if (!clears(records, cx, cz, 2.0, 2.0, d.ux, d.uz, 0.2)) continue;
        const y = hf.getHeightAt(cx, cz);
        // the horseshoe in the road's frame: x along the road (the mouth toward the bridge), z across
        sink.placed(Math.atan2(-d.uz, d.ux) + (end < 0 ? 0 : Math.PI), cx, y, cz, () => {
          const bag = (x0: number, z0: number, x1: number, z1: number, rows: number) => {
            const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.6));
            for (let r = 0; r < rows; r++) for (let b = 0; b < n; b++) {
              const t = (b + 0.5 + (r % 2) * 0.25) / n;
              if (t > 1) continue;
              const bx = x0 + (x1 - x0) * t, bz = z0 + (z1 - z0) * t;
              sink.placed(Math.atan2(-(z1 - z0), x1 - x0), bx, 0, bz, () => sink.span('structureWood', -0.29, r * 0.2 - 0.05, -0.25, 0.29, r * 0.2 + 0.15, 0.25,
                { colour: shade(HESSIAN, 0.84 + look() * 0.24), decor: true }));
            }
          };
          bag(1.6, -1.8, -1.6, -1.8, 6);
          bag(-1.6, -1.8, -1.6, 1.6, 6);
          bag(-1.6, 1.6, 1.6, 1.6, 6);
          if (!mobile) {
            // the coil of wire along the bank behind the post
            for (let c = 0; c < 6; c++) {
              sink.cylinder('structureMetal', [-2.4 + c * 0.9, 0.42, 2.6 * side], 'x', 0.86, 0.4, 6, { colour: rgb(0x3a3631), decor: true, fine: true }, 0.4, false);
            }
          }
        });
      }
    }
    push(ctx, sink);
  }
}

/** A sampan moored in the creek (x along it): its flat hull and raised ends, the arched mat roof, the scull. */
function sampan(sink: PartSink, look: () => number): void {
  const L = 6.2 + look() * 1.6, W = 1.7, H = 0.5;
  const wood = { colour: shade(HULL, 0.85 + look() * 0.3), decor: true };
  sink.span('structureWood', -L / 2 + 0.6, -0.25, -W / 2, L / 2 - 0.6, H, W / 2, wood);
  for (const e of [-1, 1]) {
    // the raised end: a wedge rising to the bow (and the stern), counter-clockwise seen from +z
    const x0 = e * (L / 2 - 0.6), x1 = e * L / 2;
    const pts: Vec3[] = e > 0
      ? [[x0, -0.25, -W / 2 + 0.15], [x1, H + 0.35, -W / 2 + 0.15], [x1, H + 0.55, -W / 2 + 0.15], [x0, H, -W / 2 + 0.15]]
      : [[x1, H + 0.55, -W / 2 + 0.15], [x1, H + 0.35, -W / 2 + 0.15], [x0, -0.25, -W / 2 + 0.15], [x0, H, -W / 2 + 0.15]];
    sink.prism('structureWood', pts, [0, 0, 1], W - 0.3, wood);
  }
  // the mat roof over the middle, its open ends dark
  const roofL = L * (0.34 + look() * 0.1), rx = (look() - 0.5) * L * 0.2;
  sink.cylinder('structureWood', [rx - roofL / 2, H, 0], 'x', roofL, W / 2 - 0.05, 8, { colour: shade(MAT, 0.85 + look() * 0.3), decor: true }, W / 2 - 0.05, true, -Math.PI / 2, Math.PI);
  sink.span('dark', rx - roofL / 2 + 0.05, H, -W / 2 + 0.15, rx + roofL / 2 - 0.05, H + 0.55, W / 2 - 0.15, { decor: true });
  // the scull over the stern
  sink.member('structureWood', [-L / 2 + 0.3, H + 0.3, 0.2], [-L / 2 - 1.6, H - 0.3, 0.45], 0.08, 0.08, [0, 1, 0], { colour: shade(HULL, 1.2), decor: true, exposed: true }, 0);
}

/**
 * The sampans: along the creek's line (its marsh stations), rafts of one to three moored near a bank where the water is
 * open all round them, none within 18 m of a bridge's axis. Dressing; the boats float on the water's surface.
 */
function dressSampans(ctx: StreetContext): void {
  const hf = ctx.heightField;
  const creek = ctx.L.marshes ?? [];
  if (creek.length < 2 || !hf.getWaterMaskAt) return;
  const decks = hf.bridgeDecks ?? [];
  const look = streamFrom(hashSeed('shanghai-sampans', creek.length));
  const sink = new PartSink([look() * 5, look() * 5]);
  const centre = creek.map((m) => [m.x, m.z] as const);
  const st = resample(centre, 11, 470);
  const water = (x: number, z: number) => hf.getWaterMaskAt!(x, z) > 0.9;
  const surface = (x: number, z: number) => hf.getWaterSurfaceHeightAt?.(x, z) ?? hf.getHeightAt(x, z) + (hf.getWaterDepthAt?.(x, z) ?? 0);
  for (const s of st) {
    if (decks.some((d) => Math.hypot(s.x - d.x, s.z - d.z) < d.halfWidth + 18)) continue;
    // (round 2: "brown and crowded" — most stretches hold a raft, up to four boats along a bank)
    if (look() < 0.2) continue;
    const side = look() < 0.5 ? 1 : -1, n = 1 + Math.floor(look() * 4);
    const r = creek.reduce((best, m) => (Math.hypot(m.x - s.x, m.z - s.z) < Math.hypot(best.x - s.x, best.z - s.z) ? m : best)).r;
    for (let k = 0; k < n; k++) {
      const off = side * (r * 0.5 - 1.2 - k * 1.95), shift = (look() - 0.5) * 2.0;
      const x = s.x + s.nx * off + s.tx * shift, z = s.z + s.nz * off + s.tz * shift;
      const ok = [[3.6, 0], [-3.6, 0], [0, 1.1], [0, -1.1]].every(([a, b]) => water(x + s.tx * a + s.nx * b, z + s.tz * a + s.nz * b));
      if (!ok) continue;
      const y = surface(x, z) - 0.12;
      const yaw = Math.atan2(-s.tz, s.tx) + (look() < 0.5 ? 0 : Math.PI) + (look() - 0.5) * 0.12;
      sink.placed(yaw, x, y, z, () => sampan(sink, look));
    }
  }
  push(ctx, sink);
}

/**
 * The creek's masonry banks through the city (round 2, wave 149: "clean blue water between bare slopes", "the creek banks
 * are bare sand and dirt slopes rather than masonry quays"): along both banks, from a hand under the waterline up to the
 * bank's top, a revetment of granite blocks laid on the bank's own slope (the terrain stays the ground a hull drives),
 * a granite coping along the top with its mooring posts, and a flight of landing steps down to the water now and then.
 * Dressing only; clear of every bridge's deck and approach.
 */
function dressCreekQuays(ctx: StreetContext): void {
  const hf = ctx.heightField;
  const creek = ctx.L.marshes ?? [];
  if (creek.length < 2 || !hf.getWaterMaskAt) return;
  const decks = hf.bridgeDecks ?? [];
  const mobile = getDeviceTier() === 'mobile';
  const look = streamFrom(hashSeed('shanghai-quays', creek.length));
  const sink = new PartSink([look() * 5, look() * 5]);
  const st = resample(creek.map((m) => [m.x, m.z] as const), 3, 330);
  const wet = (x: number, z: number) => hf.getWaterMaskAt!(x, z) > 0.5;
  const surface = (x: number, z: number) => hf.getWaterSurfaceHeightAt?.(x, z) ?? hf.getHeightAt(x, z) + (hf.getWaterDepthAt?.(x, z) ?? 0);
  const nearDeck = (x: number, z: number) => decks.some((d) => {
    const ox = x - d.x, oz = z - d.z;
    return Math.abs(ox * d.ux + oz * d.uz) < d.halfLength + (d.approachM ?? 0) + 6 && Math.abs(-ox * d.uz + oz * d.ux) < d.halfWidth + 6;
  });
  const radiusAt = (x: number, z: number) => creek.reduce((best, m) => (Math.hypot(m.x - x, m.z - z) < Math.hypot(best.x - x, best.z - z) ? m : best)).r;
  // per station and side: the waterline's offset and the bank top's (null where the bank is a deck's or not water at all)
  type Edge = { w: number; top: number } | null;
  const edges: Array<[Edge, Edge]> = st.map((s) => {
    if (nearDeck(s.x, s.z)) return [null, null];
    const r = radiusAt(s.x, s.z);
    return [1, -1].map((side) => {
      let w = 0;
      for (let d = 0; d <= r * 1.2; d += 0.5) { if (!wet(s.x + s.nx * side * d, s.z + s.nz * side * d)) { w = d; break; } }
      if (w < 1.5) return null;
      return { w, top: Math.max(w + 1.5, r * 0.96) };
    }) as [Edge, Edge];
  });
  const ROWS = 4;
  for (let i = 0; i + 1 < st.length; i++) {
    const a = st[i], b = st[i + 1];
    if (b.s - a.s > 3.5) continue;
    for (const [k, side] of [[0, 1], [1, -1]] as const) {
      const ea = edges[i][k], eb = edges[i + 1][k];
      if (!ea || !eb) continue;
      // the rows of the revetment from just under the water to the top: each corner on the slope a few centimetres up
      const pt = (s: Station, e: { w: number; top: number }, f: number): Vec3 => {
        const d = side * ((e.w - 0.6) + (e.top - e.w + 0.6) * f), x = s.x + s.nx * d, z = s.z + s.nz * d;
        const y = f === 0 ? surface(s.x + s.nx * side * e.w, s.z + s.nz * side * e.w) - 0.35 : hf.getHeightAt(x, z) + 0.035;
        return [x, y, z];
      };
      for (let row = 0; row < ROWS; row++) {
        const f0 = row / ROWS, f1 = (row + 1) / ROWS;
        const p00 = pt(a, ea, f0), p10 = pt(b, eb, f0), p01 = pt(a, ea, f1), p11 = pt(b, eb, f1);
        // counter-clockwise seen from the water (the outside of the bank's face); a map kit's dressing carries no
        // occlusion record (the weathering pass that consumes one runs on the buildings only)
        if (side > 0) sink.quad('stone', p00, p01, p11, p10, { decor: true });
        else sink.quad('stone', p00, p10, p11, p01, { decor: true });
      }
      // the coping along the top
      const ca = pt(a, ea, 1), cb = pt(b, eb, 1);
      sink.member('stone', [ca[0], ca[1] + 0.12, ca[2]], [cb[0], cb[1] + 0.12, cb[2]], 0.45, 0.24, [0, 1, 0], { decor: true }, 0.01);
      // a mooring post every few stations, a flight of steps now and then
      if (!mobile && i % 4 === 0 && look() < 0.7) {
        const [px, py, pz] = pt(a, ea, 0.97);
        sink.cylinder('stone', [px, py, pz], 'y', 0.55, 0.14, 6, { decor: true }, 0.12);
      }
      if (i % 20 === 7 && look() < 0.6) {
        for (let k2 = 0; k2 < 5; k2++) {
          const f = 1 - (k2 + 1) / 6, [sx, sy, sz] = pt(a, ea, f);
          sink.span('stone', sx - 0.6, sy - 0.25, sz - 0.6, sx + 0.6, sy + 0.08, sz + 0.6, { decor: true });
        }
      }
    }
  }
  push(ctx, sink);
}

/** Suzhou Creek as Shanghai's: the tram line down the Settlement's avenue, the bridgeheads' posts, the creek's sampans. */
export function dressShanghai(ctx: StreetContext, mapId = 'blackglass'): void {
  const decks = (ctx.heightField.bridgeDecks ?? []).map((deck) => ({ ...deck, approachM: deck.approachM ?? 0 }));
  const keep = ctx.L.spawns ? yardKeepOut(mapId, ctx.L.spawns, ctx.L.terrain?.hardstands ?? [], decks) : null;
  dressTramAvenue(ctx, keep, 2);
  dressBridgeheads(ctx);
  dressCreekQuays(ctx);
  dressSampans(ctx);
  dressNorthStation(ctx);
}

const BALLAST = rgb(0x4a463f), SLEEPER = rgb(0x3b2f25), BUFFER_RED = rgb(0x7a2a22), LAMP_IRON = rgb(0x22272a);

/**
 * Shanghai North Station's ground: every civic hall the kit builds as the station (shanghaiBund.ts: the Zhabei bank's)
 * gets its forecourt and its tracks, laid in the station's own frame (its seat's yaw; skyline.ts stationHall: the head
 * building to +z, the train shed's open end to -z, held to the plot's depth). All dressing, no collision record: a hull
 * drives over the setts, the rails and the platforms' ends as over the tram bed. Every piece stands only where it clears
 * the records already placed and the roads' cores, so the street's own surface and the neighbours keep theirs.
 */
function dressNorthStation(ctx: StreetContext): void {
  const hf = ctx.heightField, roads = ctx.L.roads ?? [];
  const records = [...(ctx.obstacles ?? []), ...(ctx.colliders ?? [])];
  for (const b of ctx.buildings ?? []) {
    if (b.kind !== 'civichall' || bankOf({ x: b.x, z: b.z } as RegionalBuildContext) !== 'zhabei') continue;
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    const world = (lx: number, lz: number): [number, number] => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
    const ground = (lx: number, lz: number, lift: number): Vec3 => { const [x, z] = world(lx, lz); return [x, hf.getHeightAt(x, z) + lift, z]; };
    // the station's plot as stationHall fits it, held to the seat's depth
    const W = Math.max(20, b.w - 0.8), halfD = Math.min(13, (b.d - 0.8) / 2);
    const shedX0 = -W / 2 + 0.5, width = W - 1, spans = width > 26 ? 2 : 1, half = width / spans / 2;
    const tz = s, tx = c; // the station's local +z, +x in the world
    const look = streamFrom(hashSeed('shanghai-station', Math.round(b.x), Math.round(b.z)));
    const sink = new PartSink([0, 0]);
    // the records round the station, not its own (a record whose middle stands inside the station's plot is the station's:
    // its pavilion and steps reach a little past the plot's front, where the forecourt meets them)
    const others = records.filter((q) => {
      const mx = (q.min[0] + q.max[0]) / 2 - b.x, mz = (q.min[2] + q.max[2]) / 2 - b.z;
      const lx = mx * c - mz * s, lz = mx * s + mz * c;
      return !(Math.abs(lx) < W / 2 + 0.5 && Math.abs(lz) < halfD + 1.0);
    });
    const freeCell = (lx: number, lz: number, r: number) => {
      const [x, z] = world(lx, lz);
      // (a record's own footprint, not its box: a turned building's box reaches far past its walls)
      return clearOfRoads(roads, x, z, r, r, tz, -tx) && !others.some((q) => !q.dead && collisionFootprintContainsPoint(q, x, z, r));
    };
    // the forecourt: granite setts before the head building, one rectangle as deep and as wide as stays clear of the
    // roads' cores and the neighbours' footprints (its edges straight, never stepped round a cell grid), kerbed along its
    // three open sides; laid in 2 m strips that follow the ground
    const clearRect = (x0: number, x1: number, z0: number, z1: number) => {
      for (let lz = z0; lz <= z1 + 1e-6; lz += 1) for (let lx = x0; lx <= x1 + 1e-6; lx += 1) if (!freeCell(lx, lz, 0.4)) return false;
      return true;
    };
    let fw = W / 2 - 1, fz1 = halfD + 0.4 + 14;
    while (fz1 > halfD + 4 && !clearRect(-fw, fw, halfD + 0.4, fz1)) fz1 -= 1;
    while (fw > 6 && !clearRect(-fw, fw, halfD + 0.4, fz1)) fw -= 1;
    const fz0 = halfD + 0.4;
    if (clearRect(-fw, fw, fz0, fz1)) {
      const CELL = 2;
      for (let lz = fz0; lz < fz1 - 1e-6; lz += CELL) {
        const lzb = Math.min(fz1, lz + CELL);
        for (let lx = -fw; lx < fw - 1e-6; lx += CELL) {
          const lxb = Math.min(fw, lx + CELL);
          sink.quad('stone', ground(lx, lzb, 0.035), ground(lxb, lzb, 0.035), ground(lxb, lz, 0.035), ground(lx, lz, 0.035), { decor: true, uv: { kind: 'world' } });
        }
      }
      // the kerb along the open sides: a granite band, its top a little proud of the setts
      const kerb = (ax: number, az: number, bx: number, bz: number) => {
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = (k + 1) / n;
          sink.member('stone', ground(ax + (bx - ax) * t0, az + (bz - az) * t0, 0.02), ground(ax + (bx - ax) * t1, az + (bz - az) * t1, 0.02), 0.3, 0.16,
            [0, 1, 0], { decor: true }, 0.08);
        }
      };
      kerb(-fw, fz1, fw, fz1); kerb(-fw, fz0, -fw, fz1); kerb(fw, fz0, fw, fz1);
    }
    // the forecourt's two cast-iron lamps at its outer corners, where they stand clear
    for (const side of [-1, 1]) {
      const lx = side * (fw - 1.5), lz = fz1 - 1.5;
      if (!freeCell(lx, lz, 0.6)) continue;
      const foot = ground(lx, lz, -0.1);
      sink.cylinder('structureMetal', foot, 'y', 4.6, 0.09, 6, { decor: true, colour: LAMP_IRON }, 0.06);
      sink.span('structureMetal', foot[0] - 0.2, foot[1] + 4.4, foot[2] - 0.2, foot[0] + 0.2, foot[1] + 4.85, foot[2] + 0.2, { decor: true, colour: LAMP_IRON });
    }
    // the tracks: two to a span, the island platform between them under the shed, the buffer stops at the concourse,
    // the rails out of the open end on their sleepers and ballast until a road's core or a record stops them
    const SHED_END = -halfD, CONCOURSE = halfD - 8.6, OUT = 46;
    for (let sp = 0; sp < spans; sp++) {
      const cx = shedX0 + half * (2 * sp + 1);
      // the island platform: a low stone slab under the shed, its coping a lighter course
      const p0 = ground(cx, SHED_END + 1.5, 0), p1 = ground(cx, CONCOURSE - 0.6, 0);
      const foot = Math.min(p0[1], p1[1]) - 0.3, py = Math.max(p0[1], p1[1]) + 0.9;
      // (corners counter-clockwise seen from above)
      const corners = [[-1.25, CONCOURSE - 0.6], [1.25, CONCOURSE - 0.6], [1.25, SHED_END + 1.5], [-1.25, SHED_END + 1.5]] as const;
      sink.prism('stone', corners.map(([dx, lz]): Vec3 => { const [x, z] = world(cx + dx, lz); return [x, foot, z]; }), [0, 1, 0], py - foot, { decor: true });
      for (const t of [-1, 1]) {
        const lx = cx + t * 2.6;
        // the buffer stop at the concourse: two posts, the beam and its red face
        const bf = ground(lx, CONCOURSE, 0);
        sink.member('structureMetal', ground(lx - 0.8, CONCOURSE, -0.1), ground(lx - 0.8, CONCOURSE, 1.1), 0.18, 0.18, [tz, 0, tx], { decor: true, colour: LAMP_IRON, exposed: true }, 0);
        sink.member('structureMetal', ground(lx + 0.8, CONCOURSE, -0.1), ground(lx + 0.8, CONCOURSE, 1.1), 0.18, 0.18, [tz, 0, tx], { decor: true, colour: LAMP_IRON, exposed: true }, 0);
        sink.member('structureMetal', [bf[0] - tx * 1.0, bf[1] + 0.95, bf[2] + s * 1.0], [bf[0] + tx * 1.0, bf[1] + 0.95, bf[2] - s * 1.0], 0.3, 0.22,
          [-tz, 0, -tx], { decor: true, colour: BUFFER_RED, exposed: true }, 0);
        // the track from the concourse out of the shed: 2 m stations, stopped by the first blocked one past the shed
        for (let lz = CONCOURSE; lz > SHED_END - OUT; lz -= 2) {
          const lz1 = lz - 2;
          const [mx, mz] = world(lx, lz1 - 1);
          // past the shed: a road's core takes the rails flush (a level crossing), a record stops the track
          if (lz1 < SHED_END && others.some((q) => !q.dead && collisionFootprintContainsPoint(q, mx, mz, 1.6))) break;
          if (lz1 < SHED_END && !clearOfRoads(roads, mx, mz, 1.0, 1.0, tz, -tx)) {
            for (const g of [-0.7175, 0.7175]) {
              sink.member('structureMetal', ground(lx + g, lz, 0.025), ground(lx + g, lz1, 0.025), 0.07, 0.03, [0, 1, 0], { decor: true, colour: RAIL }, 0.02);
            }
            continue;
          }
          const bedA = [ground(lx - 1.4, lz, 0.03), ground(lx + 1.4, lz, 0.03)], bedE = [ground(lx - 1.4, lz1, 0.03), ground(lx + 1.4, lz1, 0.03)];
          // (the ballast's quad counter-clockwise seen from above)
          sink.quad('structureMetal', bedA[1], bedE[1], bedE[0], bedA[0], { decor: true, colour: shade(BALLAST, 0.9 + look() * 0.2) });
          for (const k of [0, 0.66, 1.33]) {
            if (look() < 0.06) continue; // a sleeper burnt out or taken for the fires
            const sl = ground(lx, lz - k, 0.06);
            sink.member('structureWood', [sl[0] - tx * 1.3, sl[1], sl[2] + s * 1.3], [sl[0] + tx * 1.3, sl[1], sl[2] - s * 1.3], 0.24, 0.12, [0, 1, 0],
              { decor: true, colour: SLEEPER }, 0.04);
          }
          for (const g of [-0.7175, 0.7175]) {
            sink.member('structureMetal', ground(lx + g, lz, 0.13), ground(lx + g, lz1, 0.13), 0.07, 0.12, [0, 1, 0], { decor: true, colour: RAIL }, 0.04);
          }
        }
      }
    }
    push(ctx, sink);
  }
}
