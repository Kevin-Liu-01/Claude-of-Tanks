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
import { cloneCollisionRecord, collisionFootprintContainsPoint, setConvexShape, type CollisionRecord } from '../collision.ts';
import { yardKeepOut, type YardKeepOut } from './regional/yards.ts';

interface TramContext {
  L: {
    roads?: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
    spawns?: { player: { x: number; z: number }; enemies: ReadonlyArray<{ x: number; z: number }> };
    terrain?: { hardstands?: ReadonlyArray<{ x: number; z: number; width: number; length: number; yawDeg?: number }> };
    /** The river's cells (the map's liquid marsh chain), in order along its course. */
    marshes?: ReadonlyArray<{ x: number; z: number; r: number }>;
  };
  heightField: {
    getHeightAt(x: number, z: number): number;
    getWaterMaskAt?(x: number, z: number): number;
    getWaterSurfaceHeightAt?(x: number, z: number): number;
    getWaterDepthAt?(x: number, z: number): number;
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
const RAIL = rgb(0x6f645a), POLE = rgb(0x3d4a44), WIRE = rgb(0x26292a), IRON_RAIL = rgb(0x2a2d2e);
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

/** Does a footprint (x, z centre, half extents along / across a heading) clear every record placed so far? The boxes'
 * overlap first, then the footprint's own points (every metre along and across, `pad` grown) against each record's shape:
 * on an avenue that runs off the axes a turned box's corners met every row front beside it (the Miljacka's valley,
 * 2026-10-06: no tram, no barricade stood). */
function clears(records: readonly CollisionRecord[], cx: number, cz: number, hl: number, hw: number, tx: number, tz: number, pad: number): boolean {
  const ex = Math.abs(tx) * hl + Math.abs(tz) * hw + pad, ez = Math.abs(tz) * hl + Math.abs(tx) * hw + pad;
  const nx = -tz, nz = tx, na = Math.max(1, Math.ceil(2 * hl)), nb = Math.max(1, Math.ceil(2 * hw));
  return !records.some((r) => {
    if (r.dead || !(r.max[0] > cx - ex && r.min[0] < cx + ex && r.max[2] > cz - ez && r.min[2] < cz + ez)) return false;
    for (let i = 0; i <= na; i++) for (let j = 0; j <= nb; j++) {
      const a = -hl + (2 * hl * i) / na, b = -hw + (2 * hw * j) / nb;
      if (collisionFootprintContainsPoint(r, cx + tx * a + nx * b, cz + tz * a + nz * b, pad)) return true;
    }
    return false;
  });
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
 * Lay the tram line down an avenue (road `road` of the layout), its catenary, its burnt trams and the container screens
 * at its crossings with the other roads. The layout is its own rotation about the map's centre: the trams stand in
 * rotation pairs, each twin on the avenue's rotation (`twinRoad`, the same road when the avenue is its own rotation, as the
 * old single boulevard was; null lays no trams), and each screen draws its rotation-canonical seat's lot (`frame`:
 * 'self' for an avenue that is its own rotation, 'primary' / 'twin' for the two avenues of a rotation pair, the twin's
 * seats keyed by the primary's).
 */
function dressTramBoulevard(ctx: TramContext, keep: YardKeepOut | null, road = 0, twinRoad: number | null = road,
  frame: 'self' | 'primary' | 'twin' = 'self'): void {
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
  // ---- the catenary: poles in pairs at the kerbs, a cross-span between each standing pair (a lone pole carries a
  // bracket arm out over both tracks instead), the contact wire over each track from span to span. A wire runs only
  // between two supports one bay apart along the line (wave 162: "floating catenary wires" where the line leaves the
  // limit and comes back, or a span had fallen); a bay whose support is down ends its wires, one hanging to the roadway.
  const wires = new PartSink([0, 0]);
  const records = [...(ctx.obstacles ?? []), ...(ctx.colliders ?? [])];
  const BAY = Math.round(SPAN / 2);
  let prev: { y: number; s: Station; carried: boolean } | null = null;
  for (let i = 0; i < st.length; i += BAY) {
    const s = st[i];
    const y = hf.getHeightAt(s.x, s.z);
    const tops: Vec3[] = [];
    const lone: Array<{ side: number; px: number; py: number; pz: number }> = [];
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
        lone.push({ side, px, py, pz });
      }
    }
    // the station carries the contact wires when its span stands, or its one standing pole's bracket arm does
    let carried = tops.length === 2;
    if (!carried && lone.length === 1) {
      const { side, px, py, pz } = lone[0];
      const reach = POLE_OFFSET + TRACK + 0.6;
      const tip: Vec3 = [px - s.nx * side * reach, py + SPAN_Y - 0.25, pz - s.nz * side * reach];
      wires.member('structureMetal', [px, py + SPAN_Y - 0.2, pz], tip, 0.09, 0.09, normalize3([s.tx, 0, s.tz]), { colour: POLE, decor: true, exposed: true }, 0);
      // its tie-rod back to the pole, a metre and a half below
      wires.member('structureMetal', [px, py + SPAN_Y - 1.7, pz], [(px + tip[0]) / 2, py + SPAN_Y - 0.25, (pz + tip[2]) / 2], 0.05, 0.05,
        normalize3([s.tx, 0, s.tz]), { colour: POLE, decor: true, exposed: true }, 0);
      carried = true;
    }
    if (mobile) { prev = { y, s, carried }; continue; }
    if (tops.length === 2) wires.member('structureWood', tops[0], tops[1], 0.03, 0.03, [0, 1, 0], { colour: WIRE, decor: true, fine: true, exposed: true }, 0);
    // one bay back along the line (a station further off means the line left the limit and came back)
    const bayOk = prev !== null && s.s - prev.s.s <= SPAN * 1.25;
    if (prev && bayOk && (prev.carried || carried)) {
      for (const t of [-1, 1]) {
        const a = at(prev.s, t * TRACK), b = at(s, t * TRACK);
        const down = look() < 0.06;
        if (prev.carried && carried && !down) {
          wires.member('structureWood', [a[0], prev.y + WIRE_Y, a[2]], [b[0], y + WIRE_Y, b[2]], 0.025, 0.025, [0, 1, 0], { colour: WIRE, decor: true, fine: true, exposed: true }, 0);
          continue;
        }
        // a wire down: from the support that still holds it, hanging to the roadway mid-bay
        const [from, fy] = prev.carried ? [a, prev.y] : [b, y];
        wires.member('structureWood', [from[0], fy + WIRE_Y, from[2]], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.05, (a[2] + b[2]) / 2], 0.025, 0.025, [0, 1, 0],
          { colour: WIRE, decor: true, fine: true, exposed: true }, 0);
      }
    }
    prev = { y, s, carried };
  }
  push(ctx, wires);
  // ---- two burnt trams, rotation-symmetric about the map's centre: derailed and shoved against the kerb, one on each
  // side, each midway between two poles of the catenary (its inner side clear of the boulevard's core)
  const poles = st.filter((_c, i) => i % Math.round(SPAN / 2) === 0);
  const poleFeet = poles.flatMap((p) => [1, -1].map((side) => { const q = at(p, side * POLE_OFFSET); return [q[0], q[2]] as const; }));
  // (wave 162: "the total absence of any burnt tram car": the kerbs' lamps, rubble and the rows' fronts refused every bay
  // the wrecks tried.) A wreck stands where the trams died, on its track in the boulevard's middle: the other track and
  // both carriageways stay open, and the layout brief counts it a roadblock (tools/map-layout-metrics.mjs
  // ROADBLOCK_KINDS), not dressing in a road; failing its track in a dozen bays, shoved against the kerb as before
  const TRAM_SEATS: Array<{ off: number; onTrack: boolean }> = [{ off: TRACK, onTrack: true }, { off: ROAD_CLEAR + 1.25 + 0.1, onTrack: false }];
  // each wreck stands with its rotation twin about the map's centre (the layout is its own rotation): a seat is taken
  // only when its twin's seat (the twin avenue's station nearest (-x, -z)) clears as well; a seat keeps off every road
  // but its own avenue's
  const tramSeat = (s: Station, side: number, seat: { off: number; onTrack: boolean }, onRoad = road): [number, number] | null => {
    const others = roads.filter((_line, r) => r !== onRoad);
    const [cx, , cz] = at(s, side * seat.off);
    if (!clears(records, cx, cz, 10.9, 1.3, s.tx, s.tz, 0.4) || !clearOfRoads(seat.onTrack ? others : roads, cx, cz, 10.9, 1.25, s.tx, s.tz)
      || !clearOfKeepOut(keep, cx, cz, 10.9, 1.25, s.tx, s.tz)) return null;
    return [cx, cz];
  };
  const placeTram = (s: Station, cx: number, cz: number, onTrack: boolean): void => {
    const y = hf.getHeightAt(cx, cz);
    const sink = new PartSink([look() * 5, look() * 5]);
    sink.placed(Math.atan2(-s.tz, s.tx), cx, y + (onTrack ? 0.08 : 0.02), cz, () => burntTram(sink, look));
    push(ctx, sink);
    block(ctx, cx, cz, 10.9, 1.25, s.tx, s.tz, y, y + 3.1, 'tram-wreck');
    records.push(...(ctx.obstacles ?? []).slice(-1));
  };
  // the twin avenue's stations (an avenue that is its own rotation finds its twins on itself, traversed the other way, so
  // a seat's side flips; the rotation of a separate avenue keeps its sides)
  const twinSt = twinRoad === null ? null : twinRoad === road ? st : resample(roads[twinRoad] ?? [], 2.0, 430);
  const twinSide = twinRoad === road ? -1 : 1;
  const tramPair = (sTarget: number, side: number) => {
    if (!twinSt?.length) return;
    const bays = poles.slice(0, -1).map((p) => p.s + SPAN / 2).sort((a, b) => Math.abs(a - sTarget) - Math.abs(b - sTarget));
    for (const seat of TRAM_SEATS) for (const target of bays.slice(0, 12)) {
      const s = st.reduce((best, c) => (Math.abs(c.s - target) < Math.abs(best.s - target) ? c : best));
      const twin = twinSt.reduce((best, c) => (Math.hypot(c.x + s.x, c.z + s.z) < Math.hypot(best.x + s.x, best.z + s.z) ? c : best));
      if (Math.hypot(twin.x + s.x, twin.z + s.z) > 2.5) continue;
      const a = tramSeat(s, side, seat);
      if (!a) continue;
      const b = tramSeat(twin, twinSide * side, seat, twinRoad ?? road);
      if (!b) continue;
      placeTram(s, a[0], a[1], seat.onTrack);
      placeTram(twin, b[0], b[1], seat.onTrack);
      return;
    }
  };
  const total = st[st.length - 1].s, mid = st.reduce((best, c) => (Math.hypot(c.x, c.z) < Math.hypot(best.x, best.z) ? c : best)).s;
  tramPair(mid - Math.min(110, total * 0.12), 1);
  // a second pair nearer the centre, on the other track
  tramPair(mid - Math.min(45, total * 0.05), -1);
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
        const key = frame === 'primary' ? [end[0], end[1], side, dir] : frame === 'twin' ? [-end[0], -end[1], side, dir]
          : canon ? [end[0], end[1], side, dir] : [-end[0], -end[1], -side, -dir];
        if (streamFrom(hashSeed('sarajevo-screen', Math.round(key[0]), Math.round(key[1]), key[2], key[3]))() < 0.5) continue;
        // the corner between the two roads (the street rows keep 9.5 m clear of a crossing road): the first seat clear
        // (wave 162: "no container screens in view" — one seat in the whole city cleared the kerb's lamps; the seats now
        // run on along the boulevard and step in toward the kerb)
        const seats: Array<[number, number]> = [];
        for (const at0 of [7.4, 8.6, 9.8, 11.4, 13.2, 15.4]) for (const o of [POLE_OFFSET + 1.5, POLE_OFFSET + 0.4]) seats.push([at0, o]);
        for (const [at0, o] of seats) {
          const along = dir * at0, off = side * o;
          const cx = end[0] + hit.tx * along + hit.nx * off, cz = end[1] + hit.tz * along + hit.nz * off;
          // (the catenary's poles are dressing, not records: a screen keeps off their feet)
          if (poleFeet.some(([px, pz]) => Math.hypot(px - cx, pz - cz) < BOX_HL + 0.6)) continue;
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


/** The cemeteries' plots up Ruinspires' flanks below the bench street, between the western and the central terrace
 * streets (Kovači above the old town, the Lion cemetery; a rotation pair about the valley's centre), a garden wall
 * dividing the old plots from the siege's: centre, half sizes. */
const CEMETERIES: ReadonlyArray<{ x: number; z: number; hx: number; hz: number }> = [
  { x: -50, z: 244, hx: 30, hz: 18 }, { x: 50, z: -244, hx: 30, hz: 18 },
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
/** The props scattered before the cemeteries were laid that a grave's tomb can stand over (wave 162: "a dark cube" among
 * the stones, the camp scatter's crate). */
const LOOSE_KINDS = new Set(['crate', 'barrel', 'drum', 'ammobox', 'pallet', 'firewood', 'handcart']);

function dressCemeteries(ctx: TramContext): void {
  const hf = ctx.heightField;
  const mobile = getDeviceTier() === 'mobile';
  const records = [...(ctx.obstacles ?? []), ...(ctx.colliders ?? [])];
  for (const [k, c] of CEMETERIES.entries()) {
    // the streets near the plot (a terrace street past its corner): no grave stands on a carriageway or its verge
    const near = (ctx.L.roads ?? []).filter((line) => line.some(([x, z]) => Math.abs(x - c.x) < c.hx + 90 && Math.abs(z - c.z) < c.hz + 90));
    const look = streamFrom(hashSeed('sarajevo-cemetery', k, c.x, c.z));
    const sink = new PartSink([look() * 5, look() * 5]);
    // a loose prop left on the plot stands inside a tomb: a white stone chest under its gabled lid, along the rows
    for (const r of ctx.obstacles ?? []) {
      if (r.dead || !LOOSE_KINDS.has(r.kind ?? '')) continue;
      const rx = (r.min[0] + r.max[0]) / 2, rz = (r.min[2] + r.max[2]) / 2;
      if (Math.abs(rx - c.x) > c.hx || Math.abs(rz - c.z) > c.hz) continue;
      const hx = Math.max(0.65, (r.max[0] - r.min[0]) / 2 + 0.25), hz = Math.max(1.05, (r.max[2] - r.min[2]) / 2 + 0.25);
      const y0 = Math.min(hf.getHeightAt(rx - hx, rz - hz), hf.getHeightAt(rx + hx, rz + hz), r.min[1]) - 0.15;
      const top = Math.max(r.max[1] + 0.12, y0 + 1.15);
      sink.span('stone', rx - hx - 0.08, y0, rz - hz - 0.08, rx + hx + 0.08, y0 + 0.32, rz + hz + 0.08, { decor: true });
      sink.span('stone', rx - hx, y0 + 0.32, rz - hz, rx + hx, top, rz + hz, { decor: true });
      // the lid: a gabled prism along the chest (its profile counter-clockwise seen from +z, prism()'s extrusion side)
      const z0 = rz - hz - 0.06;
      sink.prism('stone', [[rx - hx - 0.06, top, z0], [rx + hx + 0.06, top, z0], [rx, top + 0.28, z0]], [0, 0, 1], 2 * hz + 0.12, { decor: true });
    }
    const step = mobile ? 2.2 : 1.15, rowGap = 2.3;
    for (let z = c.z - c.hz; z <= c.z + c.hz; z += rowGap) {
      let x = c.x - c.hx + look() * step;
      while (x <= c.x + c.hx) {
        const gap = look();
        if (gap < 0.22) { x += step * (1 + look() * 3); continue; }
        const px = x + (look() - 0.5) * 0.25, pz = z + (look() - 0.5) * 0.3;
        x += step * (0.85 + look() * 0.3);
        if (!clears(records, px, pz, 0.3, 0.3, 1, 0, 0.25) || !clearOfRoads(near, px, pz, 1.6, 1.6, 1, 0)) continue;
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

const HESSIAN = rgb(0x8c7b58);
/** The cars' last paint where the fire left some: a Yugo's red, a Golf's white, a Lada's blue, a Zastava's green. */
const CAR_PAINTS: readonly Rgb[] = [0x8a2f26, 0xb8b4aa, 0x2f4a6a, 0x3d5a3a, 0x6b5a3a].map(rgb);

/** A burnt-out car (x along it, centred on the origin): the shell charred to the metal, rust blooming, a remnant of its
 * paint low on the doors, the glass gone to the dark cabin, sitting on its rims. */
function burntCar(sink: PartSink, look: () => number): void {
  const L = 3.9, W = 1.62, char: Rgb = [0.065, 0.055, 0.05];
  const paint = CAR_PAINTS[Math.floor(look() * CAR_PAINTS.length) % CAR_PAINTS.length];
  const skin = (): Rgb => (look() < 0.55 ? shade(RUST, 0.7 + look() * 0.4) : char);
  sink.span('structureMetal', -L / 2, 0.16, -W / 2, L / 2, 0.52, W / 2, { colour: shade(paint, 0.55) });
  sink.span('structureMetal', -L / 2 + 0.05, 0.52, -W / 2 + 0.02, L / 2 - 0.05, 0.86, W / 2 - 0.02, { colour: skin() });
  // the cabin: its pillars and the sagging roof over the dark
  sink.span('dark', -0.85, 0.86, -W / 2 + 0.14, 0.95, 1.26, W / 2 - 0.14, { decor: true });
  for (const px of [-0.85, 0.05, 0.95]) for (const s of [-1, 1]) {
    sink.span('structureMetal', px - 0.05, 0.86, s * (W / 2 - 0.16) - 0.04, px + 0.05, 1.3, s * (W / 2 - 0.16) + 0.04, { colour: char, decor: true });
  }
  sink.span('structureMetal', -0.9, 1.26 - look() * 0.08, -W / 2 + 0.12, 1.0, 1.33, W / 2 - 0.12, { colour: skin(), decor: true });
  // the rims where the tyres burnt away
  for (const wx of [-1.25, 1.25]) for (const s of [-1, 1]) {
    sink.cylinder('structureMetal', [wx, 0.26, s * (W / 2 - 0.06)], 'z', 0.12, 0.26, 8, { colour: [0.09, 0.085, 0.08], decor: true }, 0.26, true);
  }
}
const BLANKETS: readonly Rgb[] = [0x6a6e6c, 0x5a4636, 0x7c3b30, 0x3f4d5c, 0x8a8576, 0x4d5a45].map(rgb);

/** A sandbag barricade (x along it, centred on the origin): staggered courses of hessian bags to `h`, battered from a
 * foot `2 * foot` thick, each course in three runs of its own shade. */
function sandbagWall(sink: PartSink, len: number, h: number, look: () => number, foot = 0.45): void {
  const course = 0.18, rows = Math.max(3, Math.round(h / course));
  for (let r = 0; r < rows; r++) {
    const half = foot - (foot - 0.25) * r / rows, y0 = r * course - 0.12;
    for (let k = 0; k < 3; k++) {
      const a = -len / 2 + k * len / 3 + (r % 2 ? 0.25 : 0) * (k === 0 ? 1 : 0), b = -len / 2 + (k + 1) * len / 3 - 0.03;
      const kk = 0.8 + look() * 0.26;
      sink.span('structureWood', a, y0, -half, b, y0 + course - 0.012, half, { colour: [HESSIAN[0] * kk, HESSIAN[1] * kk, HESSIAN[2] * kk] });
    }
  }
}

/**
 * The quays' sandbag barricades and the sniper screens (wave 186/187: "sandbags and blankets across sniper crossings").
 * Across each avenue's quay promenade, from the pavement toward the river, a sandbag barricade every 55 m (the river side
 * of both avenues: a rotation pair's same side), each with its rotation twin on the other avenue and only where both
 * stand dry and clear; across each avenue beside every bridgehead, blankets hung from a rope between two poles at the
 * kerbs, the screen the city crossed behind (dressing: no record, a hull passes under).
 */
function dressQuayBarricades(ctx: TramContext, keep: YardKeepOut | null): void {
  const roads = ctx.L.roads ?? [];
  const [north, south] = [roads[0], roads[1]];
  if (!north || !south) return;
  const hf = ctx.heightField;
  const look = streamFrom(hashSeed('sarajevo-barricades', north.length, south.length));
  const records = [...(ctx.obstacles ?? []), ...(ctx.colliders ?? [])];
  const sn = resample(north, 2.0, 430), ss = resample(south, 2.0, 430);
  if (sn.length < 4 || ss.length < 4) return;
  const mid = sn.reduce((best, c) => (Math.hypot(c.x, c.z) < Math.hypot(best.x, best.z) ? c : best)).s;
  const near = (st: Station[], s: number) => st.reduce((best, c) => (Math.abs(c.s - s) < Math.abs(best.s - s) ? c : best));
  // (1.6 m: a hull behind one is masked to its turret ring, the layout brief's hull-down cover; 1.25 m read under it)
  const WALL_H = 1.6, WALL_HW = 0.55, OFF0 = 7.0;
  // a barricade's run across the promenade (the river side: -n on both avenues), shortened to stay dry; null if blocked
  const seat = (c: Station): { len: number } | null => {
    let len = 0;
    // (across the pavement and the promenade to the quay's tree line, 16 m off the avenue's line)
    for (let d = 0; d <= 9; d += 1) {
      const x = c.x - c.nx * (OFF0 + d), z = c.z - c.nz * (OFF0 + d);
      if ((hf.getWaterMaskAt?.(x, z) ?? 0) > 0.02) break;
      len = d;
    }
    len -= 1.5;
    if (len < 6) return null;
    const cx = c.x - c.nx * (OFF0 + len / 2), cz = c.z - c.nz * (OFF0 + len / 2);
    // (the wall's long axis runs along -n; its footprint helpers take the axis as the tangent)
    const tx = -c.nx, tz = -c.nz;
    if (!clears(records, cx, cz, len / 2, WALL_HW, tx, tz, 0.3) || !clearOfRoads(roads, cx, cz, len / 2, WALL_HW, tx, tz)
      || !clearOfKeepOut(keep, cx, cz, len / 2, WALL_HW, tx, tz)) return null;
    return { len };
  };
  const place = (c: Station, len: number): void => {
    const cx = c.x - c.nx * (OFF0 + len / 2), cz = c.z - c.nz * (OFF0 + len / 2), tx = -c.nx, tz = -c.nz;
    const y = Math.min(hf.getHeightAt(c.x - c.nx * OFF0, c.z - c.nz * OFF0), hf.getHeightAt(c.x - c.nx * (OFF0 + len), c.z - c.nz * (OFF0 + len)));
    const sink = new PartSink([look() * 5, look() * 5]);
    sink.placed(Math.atan2(-tz, tx), cx, y, cz, () => sandbagWall(sink, len, WALL_H, look, WALL_HW));
    push(ctx, sink);
    block(ctx, cx, cz, len / 2, WALL_HW, tx, tz, y - 0.1, y + WALL_H - 0.12, 'sandbagwall');
    records.push(...(ctx.obstacles ?? []).slice(-1));
  };
  for (let j = -7; j <= 7; j++) {
    if (j === 0) continue;
    // the pair's seat, or the first of a few to either side along the avenue where both stand
    for (const shift of [0, 4, -4, 8, -8, 12, -12]) {
      const a = near(sn, mid + j * 55 + shift), b = near(ss, mid + j * 55 + shift);
      if (Math.hypot(a.x + b.x, a.z + b.z) > 2.5) continue;
      const sa = seat(a), sb = seat(b);
      if (!sa || !sb) continue;
      const len = Math.min(sa.len, sb.len);
      place(a, len);
      place(b, len);
      break;
    }
  }
  // the burnt-out cars on the quay side's kerb between the barricades, each with its rotation twin on the other avenue
  const CAR_HL = 1.95, CAR_HW = 0.81, CAR_OFF = 6.3;
  const carSeat = (c: Station): [number, number] | null => {
    const cx = c.x - c.nx * CAR_OFF, cz = c.z - c.nz * CAR_OFF;
    if ((hf.getWaterMaskAt?.(cx, cz) ?? 0) > 0.02 || !clears(records, cx, cz, CAR_HL, CAR_HW, c.tx, c.tz, 0.4)
      || !clearOfRoads(roads, cx, cz, CAR_HL, CAR_HW, c.tx, c.tz) || !clearOfKeepOut(keep, cx, cz, CAR_HL, CAR_HW, c.tx, c.tz)) return null;
    return [cx, cz];
  };
  const placeCar = (c: Station, cx: number, cz: number, flip: boolean): void => {
    const y = Math.min(hf.getHeightAt(cx - c.tx * CAR_HL, cz - c.tz * CAR_HL), hf.getHeightAt(cx + c.tx * CAR_HL, cz + c.tz * CAR_HL));
    const sink = new PartSink([look() * 5, look() * 5]);
    sink.placed(Math.atan2(-c.tz, c.tx) + (flip ? Math.PI : 0) + (look() - 0.5) * 0.3, cx, y - 0.04, cz, () => burntCar(sink, look));
    push(ctx, sink);
    block(ctx, cx, cz, CAR_HL, CAR_HW, c.tx, c.tz, y - 0.05, y + 1.33, 'car-wreck');
    records.push(...(ctx.obstacles ?? []).slice(-1));
  };
  for (let j = -7; j <= 6; j++) {
    // (every other bay holds a car, the lot keyed by the pair's seat so both avenues read it alike)
    if (streamFrom(hashSeed('sarajevo-car', j))() < 0.45) continue;
    for (const shift of [0, 5, -5, 10, -10]) {
      const a = near(sn, mid + j * 55 + 27 + shift), b = near(ss, mid + j * 55 + 27 + shift);
      if (Math.hypot(a.x + b.x, a.z + b.z) > 2.5) continue;
      const pa = carSeat(a), pb = carSeat(b);
      if (!pa || !pb) continue;
      const flip = streamFrom(hashSeed('sarajevo-car-way', j))() < 0.5;
      placeCar(a, pa[0], pa[1], flip);
      placeCar(b, pb[0], pb[1], flip);
      break;
    }
  }
  // the blanket screens: across each avenue 9 m to either side of every crossing street that ends on it
  const mobile = getDeviceTier() === 'mobile';
  const screens = new PartSink([0, 0]);
  for (const st of [sn, ss]) {
    for (let k = 0; k < roads.length; k++) {
      if (k === 0 || k === 1) continue;
      for (const end of [roads[k][0], roads[k][roads[k].length - 1]]) {
        if (!st.some((c) => Math.hypot(c.x - end[0], c.z - end[1]) < 1.6)) continue;
        const at0 = st.reduce((best, c) => (Math.hypot(c.x - end[0], c.z - end[1]) < Math.hypot(best.x - end[0], best.z - end[1]) ? c : best));
        for (const dir of [-1, 1]) {
          const c = near(st, at0.s + dir * 9);
          const ends: Vec3[] = [-1, 1].map((side) => { const x = c.x + c.nx * side * 6.4, z = c.z + c.nz * side * 6.4; return [x, hf.getHeightAt(x, z), z]; });
          const top = (p: Vec3): Vec3 => [p[0], p[1] + 5.2, p[2]];
          for (const p of ends) screens.member('structureMetal', [p[0], p[1] - 0.3, p[2]], top(p), 0.12, 0.12, [c.tx, 0, c.tz], { colour: POLE, decor: true, exposed: true }, 0);
          screens.member('structureWood', top(ends[0]), top(ends[1]), 0.03, 0.03, [0, 1, 0], { colour: WIRE, decor: true, exposed: true }, 0);
          if (mobile) continue;
          // the blankets along the rope, sagging, a gap here and there
          const n = 4 + Math.floor(look() * 2);
          for (let b = 0; b < n; b++) {
            if (look() < 0.12) continue;
            const t0 = (b + 0.08) / n, t1 = (b + 0.92) / n, drop = 1.8 + look() * 1.4, sag = 0.15 + look() * 0.25;
            const p0 = top(ends[0]), p1 = top(ends[1]);
            const lerp = (t: number): Vec3 => [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - sag * Math.sin(Math.PI * t), p0[2] + (p1[2] - p0[2]) * t];
            const q0 = lerp(t0), q1 = lerp(t1), colour = BLANKETS[Math.floor(look() * BLANKETS.length) % BLANKETS.length];
            const d0: Vec3 = [q0[0] + c.tx * 0.03, q0[1] - drop, q0[2] + c.tz * 0.03], d1: Vec3 = [q1[0] + c.tx * 0.03, q1[1] - drop * (0.9 + look() * 0.2), q1[2] + c.tz * 0.03];
            // both faces (a blanket is seen from both ways along the avenue)
            screens.quad('plaster', q0, q1, d1, d0, { colour, decor: true, shadow: true });
            screens.quad('plaster', q1, q0, d0, d1, { colour: shade(colour, 0.85), decor: true, shadow: true });
          }
        }
      }
    }
  }
  push(ctx, screens);
}

/**
 * The Miljacka's quays: the Austro-Hungarian embankment's dressed stone laid on each bank's own slope from just under the
 * water to its top (the slope stays the ground a hull drives and fords from), a coping along the top and the iron railing
 * on it, a flight of steps down to the water now and then; nothing at the bridges' decks and their approaches. Dressing:
 * no record.
 */
function dressMiljackaQuays(ctx: TramContext): void {
  const hf = ctx.heightField;
  const river = ctx.L.marshes ?? [];
  if (river.length < 2 || !hf.getWaterMaskAt) return;
  const decks = hf.bridgeDecks ?? [];
  const mobile = getDeviceTier() === 'mobile';
  const look = streamFrom(hashSeed('sarajevo-quays', river.length));
  const sink = new PartSink([look() * 5, look() * 5]);
  const st = resample(river.map((m) => [m.x, m.z] as const), 3, 470);
  const wet = (x: number, z: number) => hf.getWaterMaskAt!(x, z) > 0.5;
  const surface = (x: number, z: number) => hf.getWaterSurfaceHeightAt?.(x, z) ?? hf.getHeightAt(x, z) + (hf.getWaterDepthAt?.(x, z) ?? 0);
  const nearDeck = (x: number, z: number) => decks.some((d) => {
    const ox = x - d.x, oz = z - d.z;
    return Math.abs(ox * d.ux + oz * d.uz) < d.halfLength + (d.approachM ?? 0) + 6 && Math.abs(-ox * d.uz + oz * d.ux) < d.halfWidth + 6;
  });
  const radiusAt = (x: number, z: number) => river.reduce((best, m) => (Math.hypot(m.x - x, m.z - z) < Math.hypot(best.x - x, best.z - z) ? m : best)).r;
  type Edge = { w: number; top: number } | null;
  const edges: Array<[Edge, Edge]> = st.map((s) => {
    if (nearDeck(s.x, s.z)) return [null, null];
    const r = radiusAt(s.x, s.z);
    return [1, -1].map((side) => {
      let w = 0;
      for (let d = 0; d <= r * 1.3; d += 0.5) { if (!wet(s.x + s.nx * side * d, s.z + s.nz * side * d)) { w = d; break; } }
      if (w < 1.5) return null;
      return { w, top: Math.max(w + 2.0, r * 1.05) };
    }) as [Edge, Edge];
  });
  const ROWS = 4;
  for (let i = 0; i + 1 < st.length; i++) {
    const a = st[i], b = st[i + 1];
    if (b.s - a.s > 3.5) continue;
    for (const [k, side] of [[0, 1], [1, -1]] as const) {
      const ea = edges[i][k], eb = edges[i + 1][k];
      if (!ea || !eb) continue;
      const pt = (q: Station, e: { w: number; top: number }, f: number): Vec3 => {
        const d = side * ((e.w - 0.6) + (e.top - e.w + 0.6) * f), x = q.x + q.nx * d, z = q.z + q.nz * d;
        const y = f === 0 ? surface(q.x + q.nx * side * e.w, q.z + q.nz * side * e.w) - 0.35 : hf.getHeightAt(x, z) + 0.035;
        return [x, y, z];
      };
      for (let row = 0; row < ROWS; row++) {
        const f0 = row / ROWS, f1 = (row + 1) / ROWS;
        const p00 = pt(a, ea, f0), p10 = pt(b, eb, f0), p01 = pt(a, ea, f1), p11 = pt(b, eb, f1);
        // counter-clockwise seen from the water (the bank face's outside)
        if (side > 0) sink.quad('stone', p00, p01, p11, p10, { decor: true });
        else sink.quad('stone', p00, p10, p11, p01, { decor: true });
      }
      // the coping along the top, the railing on it: a post every other station, the top rail and the mid rail
      const ca = pt(a, ea, 1), cb = pt(b, eb, 1);
      sink.member('stone', [ca[0], ca[1] + 0.12, ca[2]], [cb[0], cb[1] + 0.12, cb[2]], 0.5, 0.26, [0, 1, 0], { decor: true }, 0.01);
      if (!mobile) {
        if (i % 2 === 0) sink.member('structureMetal', [ca[0], ca[1] + 0.2, ca[2]], [ca[0], ca[1] + 1.25, ca[2]], 0.06, 0.06, [a.tx, 0, a.tz], { colour: IRON_RAIL, decor: true, exposed: true }, 0);
        for (const hgt of [1.2, 0.68]) {
          sink.member('structureWood', [ca[0], ca[1] + hgt, ca[2]], [cb[0], cb[1] + hgt, cb[2]], 0.045, 0.045, [0, 1, 0], { colour: IRON_RAIL, decor: true, fine: hgt < 1, exposed: true }, 0);
        }
      }
      // a flight of steps down to the water now and then
      if (i % 24 === 9 && look() < 0.6) {
        for (let k2 = 0; k2 < 5; k2++) {
          const f = 1 - (k2 + 1) / 6, [sx, sy, sz] = pt(a, ea, f);
          sink.span('stone', sx - 0.6, sy - 0.25, sz - 0.6, sx + 0.6, sy + 0.08, sz + 0.6, { decor: true });
        }
      }
    }
  }
  push(ctx, sink);
}

const LOG = rgb(0x4a3b2c);

/** A sandbag parapet (x along it, centred on the origin, the enemy's side +z): `rows` courses of hessian bags from `y0`
 * to `y1`, battered from a 1.7 m foot to a 0.9 m crest, each course in four runs of its own shade, staggered. */
function parapet(sink: PartSink, len: number, y0: number, y1: number, look: () => number): void {
  const rows = 9, course = (y1 - y0) / rows, runs = 4;
  for (let r = 0; r < rows; r++) {
    const half = 0.85 - 0.4 * r / (rows - 1), b0 = y0 + r * course, stagger = r % 2 ? 0.7 : 0;
    for (let k = 0; k < runs; k++) {
      const a = k === 0 ? -len / 2 : -len / 2 + k * len / runs + stagger;
      const b = k === runs - 1 ? len / 2 : -len / 2 + (k + 1) * len / runs + stagger - 0.03;
      const kk = 0.78 + look() * 0.28;
      sink.span('structureWood', a, b0, -half, b, b0 + course - 0.012, half, { colour: [HESSIAN[0] * kk, HESSIAN[1] * kk, HESSIAN[2] * kk] });
    }
  }
}

/** A log bunker (centred on the origin, its firing slit to +z): walls of five log courses, a log roof under two courses of
 * sandbags, the slit dark across the front, the doorway at the back; from its foot `y0` to its top `y1`. */
function logBunker(sink: PartSink, y0: number, y1: number, look: () => number): void {
  const hl = 2.6, hw = 1.9, log = (y1 - y0 - 0.6) / 5;
  for (let c = 0; c < 5; c++) {
    const y = y0 + c * log, tone = shade(LOG, 0.8 + look() * 0.35);
    // the front course at the slit's height leaves the slit open between two short logs
    if (c === 3) {
      for (const s of [-1, 1]) sink.span('structureWood', s > 0 ? hl - 0.5 : -hl, y, hw - log, s > 0 ? hl : -hl + 0.5, y + log - 0.02, hw, { colour: tone });
      sink.span('dark', -hl + 0.5, y, hw - log * 0.6, hl - 0.5, y + log - 0.02, hw - log * 0.5, { decor: true });
    } else sink.span('structureWood', -hl, y, hw - log, hl, y + log - 0.02, hw, { colour: tone });
    // the back course leaves the doorway (its lintel the fourth log)
    if (c < 4) {
      for (const s of [-1, 1]) sink.span('structureWood', s > 0 ? 0.55 : -hl, y, -hw, s > 0 ? hl : -0.55, y + log - 0.02, -hw + log, { colour: tone });
    } else sink.span('structureWood', -hl, y, -hw, hl, y + log - 0.02, -hw + log, { colour: tone });
    for (const s of [-1, 1]) sink.span('structureWood', s * hl - (s > 0 ? log : 0), y, -hw + log, s * hl + (s > 0 ? 0 : log), y + log - 0.02, hw - log, { colour: tone });
  }
  sink.span('dark', -0.55, y0, -hw + 0.04, 0.55, y0 + 4 * log - 0.02, -hw + log - 0.04, { decor: true });
  // the roof: the log deck, two courses of bags
  const roof = y0 + 5 * log;
  sink.span('structureWood', -hl - 0.25, roof, -hw - 0.25, hl + 0.25, roof + 0.24, hw + 0.25, { colour: shade(LOG, 0.75) });
  for (let r = 0; r < 2; r++) {
    const inset = 0.2 + r * 0.35, kk = 0.8 + look() * 0.25;
    sink.span('structureWood', -hl + inset, roof + 0.24 + r * 0.18, -hw + inset, hl - inset, roof + 0.24 + (r + 1) * 0.18 - 0.012, hw - inset,
      { colour: [HESSIAN[0] * kk, HESSIAN[1] * kk, HESSIAN[2] * kk] });
  }
}

/**
 * The front line on the crests (waves 186/187: the siege's war damage; its lines ringed the city on the hills above it):
 * along each flank's hilltop, on the brow where the climb from the bench reaches the crest's level ground, a sandbag
 * parapet facing the valley in bays of 20 m with a gap between them, a log bunker every fifth bay, the wire's pickets down
 * the slope in front. Each bay seats on the brow (the first station up the climb whose ground behind it, to 36 m, rises no
 * more than a metre over its foot; else the one where it rises least) and stands 1.2 m over that ground, to 2.1 m over
 * its own foot (the outer ridge climbs on behind the brow; no taller, or it closes the crest's lines of sight), so it
 * masks a hull on the crest behind it from the valley
 * (the layout brief's hull-down cover); each clear of every record, road and objective, a few metres along the line if
 * it must; each flank's line the other's rotation.
 */
function dressSiegeLines(ctx: TramContext, keep: YardKeepOut | null): void {
  const hf = ctx.heightField;
  const roads = ctx.L.roads ?? [];
  const mobile = getDeviceTier() === 'mobile';
  const records = [...(ctx.obstacles ?? []), ...(ctx.colliders ?? [])];
  const BAY = 20, PERIOD = 26, HW = 0.95, PARAPET_H = 1.5, BUNKER_H = 2.0;
  for (const side of [1, -1]) {
    const look = streamFrom(hashSeed('sarajevo-siege-line', side));
    const sink = new PartSink([look() * 5, look() * 5]);
    for (let k = 0; k * PERIOD <= 840; k++) {
      const bunker = k % 5 === 2;
      const hl = bunker ? 2.6 : BAY / 2, hw = bunker ? 1.9 : HW;
      // the seat: the brow (the first station up the climb whose ground behind it, toward the edge, rises no more than a
      // metre over its foot; else the station whose ground behind rises least); then the first shift along the line that
      // clears
      let x = NaN, z = NaN, foot = 0, rise = Infinity, y0 = 0;
      for (const shift of [0, 4, -4, 8, -8]) {
        const sx = side * (-420 + k * PERIOD + shift);
        let sz = NaN, sf = 0, sr = Infinity;
        for (let d = 388; d <= 412; d += 2) {
          const at = side * d;
          const f = Math.min(...[-hl, 0, hl].map((a) => hf.getHeightAt(sx + a, at)));
          const behind = Math.max(...[6, 12, 20, 28, 36].flatMap((b) => [-hl, 0, hl].map((a) => hf.getHeightAt(sx + a, at + side * b))));
          if (behind - f < sr - 0.05) { sr = behind - f; sz = at; sf = f; }
          if (sr <= 1.0) break;
        }
        if (sr > 2.0) continue;
        const ys = [-hl, 0, hl].flatMap((a) => [-hw, hw].map((b) => hf.getHeightAt(sx + a, sz + b)));
        const sy = Math.min(...ys) - 0.06;
        if (Math.max(...ys) - sy > 1.4 || (hf.getWaterMaskAt?.(sx, sz) ?? 0) > 0.02 || !clears(records, sx, sz, hl, hw, 1, 0, 0.4)
          || !clearOfRoads(roads, sx, sz, hl, hw + 1, 1, 0) || !clearOfKeepOut(keep, sx, sz, hl, hw, 1, 0)) continue;
        x = sx; z = sz; foot = sf; rise = Math.max(0, sr); y0 = sy;
        break;
      }
      if (Number.isNaN(x)) continue;
      // the valley's side: -z under the north flank's line, +z under the south's (the builders face +z)
      const top = foot + Math.min(2.1, Math.max(bunker ? BUNKER_H : PARAPET_H, rise + 1.2));
      sink.placed(side > 0 ? Math.PI : 0, x, 0, z, () => (bunker ? logBunker(sink, y0, top, look) : parapet(sink, BAY, y0, top, look)));
      block(ctx, x, z, hl, hw, 1, 0, y0 - 0.04, top, bunker ? 'bunker' : 'sandbagwall');
      records.push(...(ctx.obstacles ?? []).slice(-1));
      if (mobile || bunker) continue;
      // the wire: pickets every 3 m, 5 m down the slope in front, three strands between them (dressing)
      const wz = z - side * 5, posts: Vec3[] = [];
      for (let a = -hl + 1.5; a <= hl - 1.5 + 1e-6; a += 3) posts.push([x + a, hf.getHeightAt(x + a, wz), wz]);
      for (const [px, py, pz] of posts) {
        sink.member('structureMetal', [px, py - 0.15, pz], [px, py + 1.1, pz], 0.05, 0.05, [1, 0, 0], { colour: WIRE, decor: true, fine: true, exposed: true }, 0);
      }
      for (let i = 0; i + 1 < posts.length; i++) for (const h of [0.35, 0.7, 1.0]) {
        const [ax, ay, az] = posts[i], [bx, by, bz] = posts[i + 1];
        sink.member('structureMetal', [ax, ay + h, az], [bx, by + h - 0.04, bz], 0.02, 0.02, [0, 1, 0], { colour: WIRE, decor: true, fine: true, exposed: true }, 0);
      }
    }
    push(ctx, sink);
  }
}

const WHITEWASH = rgb(0xd9d4c6), COPING = rgb(0x7a4a36), FOOTING = rgb(0x8d877c);

/** A mahala garden wall (x along it, centred on the origin): a rubble footing, the whitewashed wall to `h`, its tiled
 * coping (a little gable of tiles along the top). */
function avlijaWall(sink: PartSink, len: number, h: number, look: () => number): void {
  const half = 0.28, wash = shade(WHITEWASH, 0.86 + look() * 0.16);
  sink.span('regionalStone', -len / 2, -0.25, -half - 0.04, len / 2, 0.32, half + 0.04, { colour: shade(FOOTING, 0.85 + look() * 0.2) });
  sink.span('regionalPlaster', -len / 2, 0.32, -half, len / 2, h - 0.2, half, { colour: wash });
  const tile = shade(COPING, 0.8 + look() * 0.3);
  // the coping: its profile counter-clockwise seen from +x, extruded along the wall
  sink.prism('regionalRoof', [[-len / 2 - 0.02, h - 0.2, half + 0.12], [-len / 2 - 0.02, h - 0.2, -half - 0.12], [-len / 2 - 0.02, h + 0.06, 0]],
    [1, 0, 0], len + 0.04, { colour: tile });
}

/**
 * The mahalas' garden walls (the avlija: a whitewashed wall round the house's yard, its coping of tiles), run down the
 * fall line in pieces with a gate or a shell's breach between them: across each bench's lip above the slope every 36 m,
 * through the bench's orchards behind the bench street's houses, and through the floor's back lots behind the avenue's
 * blocks, there in short pieces with the yards' wide gates between them (a hull's route along the floor keeps its 5.5 m).
 * A piece stands with its rotation twin on the other flank, or neither stands; a run takes the first shift along the
 * flank where most of its pieces stand. On level ground a wall masks a hull from the valley's ends (the layout brief's
 * hull-down cover).
 */
const AVLIJA_RUNS: ReadonlyArray<readonly [number, number, number, number?]> = [
  // the benches' lips (x, z from, z to, the gap between pieces; the south flank's are the rotations)
  ...Array.from({ length: 24 }, (_, k) => [-418 + 36 * k, 246, 268] as const),
  // the floor's back lots behind the avenue's blocks
  [-98, 100, 132, 12], [-58, 100, 132, 12], [112, 100, 132, 12],
  // the bench's orchards behind the bench street's houses, and the gardens either side of the bench square
  [-394, 306, 336], [-274, 312, 340], [-214, 306, 336], [-148, 312, 340], [-88, 306, 336], [-42, 304, 330],
  [102, 312, 330],
  [282, 312, 340], [342, 306, 336], [402, 312, 340],
];

function dressAvlijaWalls(ctx: TramContext, keep: YardKeepOut | null): void {
  const hf = ctx.heightField;
  const roads = ctx.L.roads ?? [];
  const records = [...(ctx.obstacles ?? []), ...(ctx.colliders ?? [])];
  const look = streamFrom(hashSeed('sarajevo-avlija', roads.length));
  const sink = new PartSink([look() * 5, look() * 5]);
  // (1.7 m: under the brief's 1.9 m target line, so a wall masks a hull without closing a line of sight over it; pieces
  // of 11 m at most, so a sight line down a wall's length is never held for the brief's 24 m)
  const H = 1.7, PIECE = 11, GAP = 2.6, HW = 0.32;
  const stands = (x: number, z: number, hl: number): boolean => {
    const ys = [-hl, 0, hl].map((a) => hf.getHeightAt(x, z + a));
    return Math.max(...ys) - Math.min(...ys) < 2.2 && (hf.getWaterMaskAt?.(x, z) ?? 0) < 0.02
      && clears(records, x, z, hl, HW, 0, 1, 0.4) && clearOfRoads(roads, x, z, hl, HW + 1, 0, 1) && clearOfKeepOut(keep, x, z, hl, HW, 0, 1);
  };
  for (const [x0, z0, z1, gap = GAP] of AVLIJA_RUNS) {
    const n = Math.max(1, Math.ceil((z1 - z0 + gap) / (PIECE + gap)));
    const hl = (z1 - z0 - (n - 1) * gap) / n / 2;
    const zs = Array.from({ length: n }, (_, k) => z0 + hl + k * (2 * hl + gap));
    const pair = (x: number, z: number) => stands(x, z, hl) && stands(-x, -z, hl);
    let best: { x: number; standing: number[] } | null = null;
    for (const shift of [0, 4, -4, 8, -8]) {
      const standing = zs.filter((z) => pair(x0 + shift, z));
      if (!best || standing.length > best.standing.length) best = { x: x0 + shift, standing };
      if (2 * standing.length >= n + 1 || standing.length === n) break;
    }
    if (!best?.standing.length) continue;
    for (const side of [1, -1]) for (const z of best.standing) {
      const cx = side * best.x, cz = side * z;
      const y = Math.min(...[-hl, 0, hl].map((a) => hf.getHeightAt(cx, cz + a))) + 0.05;
      sink.placed(Math.PI / 2, cx, y, cz, () => avlijaWall(sink, 2 * hl, H, look));
      block(ctx, cx, cz, hl, HW, 0, 1, y - 0.1, y + H, 'gardenwall');
      records.push(...(ctx.obstacles ?? []).slice(-1));
    }
  }
  push(ctx, sink);
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
  const n = mobile ? 3 : 4 + ((look() * 4) | 0);
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
    const st = resample(line, mobile ? 5.0 : 3.0, limit);
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
        if (!mobile && w > 0.36 && look() < 0.3) {
          const g = KERB_M - 0.2 - look() * 0.5, along = (look() - 0.5) * 1.8;
          const x = s.x + s.nx * side * g + s.tx * along, z = s.z + s.nz * side * g + s.tz * along;
          if (clears(solids, x, z, 0.4, 0.4, s.tx, s.tz, 0.1) && clearOfKeepOut(keep, x, z, 0.4, 0.4, s.tx, s.tz)) {
            sink.placed(look() * 6.28, x, hf.getHeightAt(x, z), z, () => {
              for (let k = 0, n = 2 + ((look() * 3) | 0); k < n; k++) {
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
  // the avenues' stumps (the valley's two avenues, roads 0 and 1, each the other's rotation): two trees a catenary bay,
  // between its poles (dressTramBoulevard: a pole every 34 m from the line's start on the same two-metre stations), in
  // the pavement just behind the kerb, most of them cut
  const avenues = [roads[0], roads[1]].filter((line): line is NonNullable<typeof line> => !!line && line.length > 1);
  for (const [ai, avenue] of avenues.entries()) {
    const bst = resample(avenue, 2.0, limit);
    for (const [i, s] of bst.entries()) {
      const bay = i % Math.round(SPAN / 2);
      if (bay !== 6 && bay !== 11) continue;
      for (const side of [-1, 1]) {
        const look = streamFrom(hashSeed('sarajevo-stump', ai, i, side));
        if (look() < 0.18) continue;
        const off = KERB_M + 0.6;
        const x = s.x + s.nx * side * off, z = s.z + s.nz * side * off;
        if (!clears(solids, x, z, 0.45, 0.45, 1, 0, 0.15) || !clearOfKeepOut(keep, x, z, 0.45, 0.45, 1, 0)) continue;
        sink.placed(look() * 6.28, x, hf.getHeightAt(x, z), z, () => stump(sink, look));
      }
    }
  }
  // the screens: where another road leaves an avenue, sheets hung on a wire across its mouth, 2.8-6.6 m up
  if (avenues.length && !mobile) {
    for (const [ri, line] of roads.entries()) {
      if (ri <= 1 || !line || line.length < 2) continue;
      for (const s of resample(line, 2.0, limit)) {
        // the first stretch of the side street 13-19 m from an avenue's line
        let best = Infinity;
        for (const avenue of avenues) for (let i = 0; i + 1 < avenue.length; i++) {
          const [ax, az] = avenue[i], [bx, bz] = avenue[i + 1];
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

/** Ruinspires as Sarajevo: the avenues' tram lines and their street works, the quays' barricades and the sniper screens,
 * the Miljacka's quays, the hillside cemeteries, the mahalas' garden walls, the front line on the crests, the siege's
 * streets. */
export function dressSarajevo(ctx: TramContext, mapId = 'ruinspires'): void {
  // the objective ground the trams and the screens keep off (the squares stay open: their zones seat where authored)
  const decks = (ctx.heightField.bridgeDecks ?? []).map((deck) => ({ ...deck, approachM: deck.approachM ?? 0 }));
  const keep = ctx.L.spawns ? yardKeepOut(mapId, ctx.L.spawns, ctx.L.terrain?.hardstands ?? [], decks) : null;
  // the Miljacka's valley (2026-10-06): an avenue on each bank, each the other's rotation; the north bank's carries the
  // trams of both
  dressTramBoulevard(ctx, keep, 0, 1, 'primary');
  dressTramBoulevard(ctx, keep, 1, null, 'twin');
  dressQuayBarricades(ctx, keep);
  dressMiljackaQuays(ctx);
  dressCemeteries(ctx);
  dressAvlijaWalls(ctx, keep);
  dressSiegeLines(ctx, keep);
  // (the map-revival lane's round 4) the siege on the streets: the facades' fall at the kerbs, the gutters' litter, the
  // avenues' trees cut to stumps, the side streets' sniper screens
  dressSiegeStreets(ctx, keep);
}
