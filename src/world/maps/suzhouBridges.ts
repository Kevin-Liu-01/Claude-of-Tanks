// src/world/maps/suzhouBridges.ts — Suzhou Creek's bridges on Blackglass (Shanghai, autumn 1937) on the decks terrain.ts
// resolves for the stations' authored crossings (Lane C, #27, 2026-10-15).
//
// The creek's crossings of the Settlement were steel and concrete, not masonry arches: riveted plate girders on dressed
// granite piers with concrete balustrades and cast-iron lamp standards (the Zhapu, Sichuan and Henan Road crossings),
// and at the creek's mouth by the Bund the Garden Bridge (Waibaidu, 1907), a camelback Pratt through truss over the
// roadway with the footways carried outside its trusses. 'girder' builds the first, 'truss' the second. Both stand on
// granite abutments with quoined corners; a span over 18 m takes a pier with pointed cutwaters.
//
// The record follows the parts a hull meets: the deck from a metre under it (a hull on the approach mounts it as its
// floor), the abutments and the pier from the footing to the deck part, and the two sides (the balustrades, or the
// trusses) a parapet's height over the deck; the water under the girders is open (no vault). Geometry in the regional
// buckets Blackglass draws already (structureMetal, regionalStone, regionalPlaster3): no draw of its own.
//
// Authored by Kevin B. Liu (NOTICE.md).
import { PartSink, rgb, shade, type Rgb, type Vec3 } from './regional/geometry.ts';
import { cloneCollisionRecord, setCompoundShape, type SimpleCollisionShape } from '../collision.ts';
import type { DressingBridgeDeck } from './archedStoneBridge.ts';
import type { DressingBuckets, DressingHeightField, FocusedDressingContext } from './mapKits.ts';

export type SuzhouBridgeForm = 'girder' | 'truss';

const GRANITE: Rgb = rgb(0x8e8a82), GRANITE_DARK: Rgb = rgb(0x6f6b64), CONCRETE: Rgb = rgb(0xa49e92);
const STEEL: Rgb = rgb(0x3f4640), STEEL_DARK: Rgb = rgb(0x2c312d), IRON: Rgb = rgb(0x24262a), LAMP: Rgb = rgb(0xd8cfa8);
/** The deck part's depth (the hull's floor), the parapet's height and thickness (m), as the arched bridges'. */
const DECK_PART_M = 1.0, PARAPET_H = 1.1, PARAPET_T = 0.4;

/** The bucket a part lands in: Blackglass's regional ones. */
const STONE = 'regionalStone' as const, METAL = 'structureMetal' as const, PLASTER = 'regionalPlaster3' as const;

export function addSuzhouBridge(deck: DressingBridgeDeck, heightField: DressingHeightField, buckets: DressingBuckets,
  ctx: FocusedDressingContext, form: SuzhouBridgeForm): void {
  const { x: cx, z: cz, ux, uz, halfLength, halfWidth, deckY, bedY } = deck;
  const sink = new PartSink([((cx * 0.37) % 5 + 5) % 5, ((cz * 0.29) % 5 + 5) % 5]);
  const bodyHalf = halfLength + 1.0;
  const bottom = bedY - 0.6;
  const seat = deckY - (form === 'truss' ? 0.65 : 1.2); // the bearing level the girders or the truss's floor sit on
  const face = halfLength - 2.0; // the abutments' river faces
  const span = face * 2;
  const pier = span > 18;
  const W = halfWidth;
  // ---- in the bridge's own frame: x along the road, y up, z across (placed below)
  sink.placed(Math.atan2(-uz, ux), cx, 0, cz, () => {
    // the abutments: dressed granite from the footing to the seat, quoins at the river corners, a coping course
    for (const end of [-1, 1]) {
      const x0 = end * face, x1 = end * bodyHalf;
      sink.span(STONE, x0, bottom, -W - 0.3, x1, seat, W + 0.3, { colour: GRANITE });
      sink.span(STONE, x0 - end * 0.12, seat - 0.3, -W - 0.42, x1, seat, W + 0.42, { colour: GRANITE_DARK, decor: true });
      for (const sz of [-1, 1]) for (let y = bottom + 0.3, k = 0; y < seat - 0.5; y += 0.55, k++) {
        const long = k % 2 === 0;
        sink.quoin(STONE, x0 - end * 0.04, y, sz * (W + 0.3) - sz * (long ? 0.9 : 0.5), x0 + end * (long ? 0.5 : 0.9), y + 0.5, sz * (W + 0.34),
          -end, sz, { colour: shade(GRANITE, k % 3 === 0 ? 0.92 : 1.04), decor: true });
      }
    }
    // the pier over a long span: a granite shaft with pointed cutwaters both ways and a coping
    if (pier) {
      const pw = 0.9;
      sink.span(STONE, -pw, bottom, -W - 0.2, pw, seat, W + 0.2, { colour: GRANITE });
      sink.span(STONE, -pw - 0.12, seat - 0.3, -W - 0.32, pw + 0.12, seat, W + 0.32, { colour: GRANITE_DARK, decor: true });
      for (const sz of [-1, 1]) {
        const zf = sz * (W + 0.2), tip = zf + sz * 1.6, capTop = Math.min(seat - 0.4, deck.waterY + 1.2);
        // (counter-clockwise seen from above: the nose's three corners)
        const pts: Vec3[] = sz > 0 ? [[0, bottom, tip], [pw, bottom, zf], [-pw, bottom, zf]] : [[0, bottom, tip], [-pw, bottom, zf], [pw, bottom, zf]];
        sink.prism(STONE, pts, [0, 1, 0], capTop - bottom, { colour: GRANITE });
        // the starling: its cap sloping back to the shaft (both windings: a face seen from either side)
        const apex: Vec3 = [0, capTop + 0.9, zf], nose: Vec3 = [0, capTop, tip];
        for (const corner of [[-pw, capTop, zf], [pw, capTop, zf]] as Vec3[]) {
          sink.polygon(STONE, [corner, nose, apex], { colour: GRANITE_DARK, decor: true });
          sink.polygon(STONE, [nose, corner, apex], { colour: GRANITE_DARK, decor: true });
        }
      }
    }
    if (form === 'girder') girderSpan(sink, bodyHalf, face, W, deckY, seat, pier, !ctx.structure);
    else trussSpan(sink, bodyHalf, face, W, deckY, seat);
  });
  // (#27) with the props' structure sink a girder bridge's balustrades stand as structures of their own, a run from pylon
  // to pylon (the pylon and its lamp standard with it): a round's blow or a ram brings a run down, the deck stays
  const balustradeRuns = form === 'girder' && !!ctx.structure;
  if (balustradeRuns) girderBalustradeRuns(ctx, cx, cz, ux, uz, W, deckY, bodyHalf, pier);
  const parts = sink.finish();
  for (const [bucket, list] of Object.entries(parts)) for (const g of list) ((buckets as unknown as Record<string, unknown[]>)[bucket] ??= []).push(g);
  // ---- the record (world): the deck, the abutments and the pier, the two sides
  const yaw = Math.atan2(ux, uz);
  const vx = -uz, vz = ux;
  const recordParts: SimpleCollisionShape[] = [{ kind: 'obb', cx, cz, hw: W, hl: bodyHalf, yaw, y0: deckY - DECK_PART_M, y1: deckY }];
  const solid = (from: number, to: number, hw: number, y0: number, y1: number) => {
    const at = (from + to) / 2;
    recordParts.push({ kind: 'obb', cx: cx + ux * at, cz: cz + uz * at, hw, hl: (to - from) / 2, yaw, y0, y1 });
  };
  solid(-bodyHalf, -face, W + 0.3, bottom, deckY - DECK_PART_M);
  solid(face, bodyHalf, W + 0.3, bottom, deckY - DECK_PART_M);
  if (pier) solid(-0.9, 0.9, W + 0.2, bottom, Math.min(seat, deckY - DECK_PART_M));
  const sideAt = form === 'truss' ? W - 1.6 : W - PARAPET_T / 2;
  for (const side of balustradeRuns ? [] : [-1, 1]) {
    recordParts.push({ kind: 'obb', cx: cx + vx * sideAt * side, cz: cz + vz * sideAt * side, hw: PARAPET_T / 2, hl: form === 'truss' ? face : bodyHalf,
      yaw, y0: deckY, y1: deckY + PARAPET_H });
  }
  const record = setCompoundShape({ min: [0, bottom, 0], max: [0, deckY + PARAPET_H, 0], kind: 'bridge' }, recordParts);
  ctx.obstacles?.push(record);
  ctx.colliders?.push(cloneCollisionRecord(record));
  void heightField;
}

/** Riveted steel plate girders from abutment to abutment (over the pier), the concrete deck on them, the balustrades with
 *  their pylons and the lamp standards over the abutments and the pier. */
function girderSpan(sink: PartSink, bodyHalf: number, face: number, W: number, deckY: number, seat: number, pier: boolean, balustrade = true): void {
  const slab = 0.25, webTop = deckY - slab, webBot = seat;
  const girders = [-(W - 0.8), -(W * 0.35), W * 0.35, W - 0.8];
  for (const z of girders) {
    sink.span(METAL, -face - 0.6, webBot, z - 0.05, face + 0.6, webTop, z + 0.05, { colour: STEEL });
    for (const y of [webBot, webTop - 0.06]) sink.span(METAL, -face - 0.6, y, z - 0.22, face + 0.6, y + 0.06, z + 0.22, { colour: STEEL_DARK });
  }
  // the outer girders' web stiffeners (riveted angles) every metre and a half on their outward faces
  for (const sz of [-1, 1]) {
    const z = sz * (W - 0.8);
    for (let x = -face; x <= face + 1e-6; x += 1.5) sink.span(METAL, x - 0.05, webBot + 0.06, z + sz * 0.05, x + 0.05, webTop - 0.06, z + sz * 0.14, { colour: STEEL_DARK, decor: true });
  }
  // the deck slab, flush with the approaches; a concrete fascia beam along each edge over the outer girders
  sink.span(PLASTER, -bodyHalf, deckY - slab, -W, bodyHalf, deckY, W, { colour: CONCRETE });
  for (const sz of [-1, 1]) sink.span(PLASTER, -bodyHalf, deckY - 0.75, sz * (W - 0.12), bodyHalf, deckY + 0.02, sz * (W + 0.08), { colour: shade(CONCRETE, 0.9) });
  // the balustrades: plinth, balusters, rail; pylons at the ends and over the pier (or their runs, structures of their
  // own: girderBalustradeRuns)
  if (!balustrade) return;
  const pylons = pier ? [-bodyHalf + 0.3, 0, bodyHalf - 0.3] : [-bodyHalf + 0.3, bodyHalf - 0.3];
  for (const sz of [-1, 1]) {
    const zi = sz * (W - PARAPET_T), zo = sz * W;
    sink.span(PLASTER, -bodyHalf, deckY, Math.min(zi, zo), bodyHalf, deckY + 0.28, Math.max(zi, zo), { colour: CONCRETE });
    sink.span(PLASTER, -bodyHalf, deckY + PARAPET_H - 0.16, Math.min(zi, zo) - 0.04, bodyHalf, deckY + PARAPET_H, Math.max(zi, zo) + 0.04, { colour: CONCRETE });
    for (let x = -bodyHalf + 0.5; x < bodyHalf - 0.3; x += 0.36) {
      if (pylons.some((p) => Math.abs(p - x) < 0.5)) continue;
      sink.span(PLASTER, x - 0.07, deckY + 0.28, sz * (W - PARAPET_T * 0.5) - 0.07, x + 0.07, deckY + PARAPET_H - 0.16, sz * (W - PARAPET_T * 0.5) + 0.07,
        { colour: shade(CONCRETE, 1.04), decor: true, fine: true });
    }
    for (const px of pylons) {
      sink.span(PLASTER, px - 0.3, deckY, sz * (W - PARAPET_T) - 0.06, px + 0.3, deckY + PARAPET_H + 0.3, sz * W + 0.06, { colour: shade(CONCRETE, 0.95) });
      // the cast-iron lamp standard on the pylon: base, fluted column, bracket and lantern
      const zl = sz * (W - PARAPET_T * 0.5), y0 = deckY + PARAPET_H + 0.3;
      sink.span(METAL, px - 0.14, y0, zl - 0.14, px + 0.14, y0 + 0.35, zl + 0.14, { colour: IRON, decor: true });
      sink.member(METAL, [px, y0 + 0.35, zl], [px, y0 + 3.9, zl], 0.09, 0.09, [0, 0, 1], { colour: IRON, decor: true, exposed: true });
      sink.member(METAL, [px, y0 + 3.7, zl], [px, y0 + 3.7, zl - sz * 0.7], 0.06, 0.06, [0, 1, 0], { colour: IRON, decor: true, exposed: true });
      sink.span(METAL, px - 0.17, y0 + 3.2, zl - sz * 0.7 - 0.17, px + 0.17, y0 + 3.62, zl - sz * 0.7 + 0.17, { colour: LAMP, decor: true });
    }
  }
}

/**
 * (#27) The girder bridge's balustrades as structures, one run a side between two pylons, built in the run's frame (x
 * along the road from the run's middle, y over the deck, z across with the balustrade's line at 0, the road toward
 * -side): the plinth, the balusters and the rail between, the pylon at the run's start (and the last pylon on the last
 * run) with its cast-iron lamp standard over the road.
 */
function girderBalustradeRuns(ctx: FocusedDressingContext, cx: number, cz: number, ux: number, uz: number, W: number, deckY: number,
  bodyHalf: number, pier: boolean): void {
  if (!ctx.structure) return;
  const pylons = pier ? [-bodyHalf + 0.3, 0, bodyHalf - 0.3] : [-bodyHalf + 0.3, bodyHalf - 0.3];
  const vx = -uz, vz = ux, rot = Math.atan2(-uz, ux), line = W - PARAPET_T / 2;
  for (const sz of [-1, 1]) for (let i = 0; i + 1 < pylons.length; i++) {
    const a = pylons[i], b = pylons[i + 1], mid = (a + b) / 2, half = (b - a) / 2;
    const sink = new PartSink([((mid * 0.31) % 5 + 5) % 5, sz > 0 ? 1.3 : 3.7]);
    const t = PARAPET_T / 2;
    sink.span(PLASTER, -half - 0.3, 0, -t, half + (i + 2 === pylons.length ? 0.3 : -0.3), 0.28, t, { colour: CONCRETE });
    sink.span(PLASTER, -half, PARAPET_H - 0.16, -t - 0.04, half, PARAPET_H, t + 0.04, { colour: CONCRETE });
    for (let x = -half + 0.5; x < half - 0.4; x += 0.36) {
      sink.span(PLASTER, x - 0.07, 0.28, -0.07, x + 0.07, PARAPET_H - 0.16, 0.07, { colour: shade(CONCRETE, 1.04), decor: true, fine: true });
    }
    for (const px of i + 2 === pylons.length ? [-half, half] : [-half]) {
      sink.span(PLASTER, px - 0.3, 0, -t - 0.06, px + 0.3, PARAPET_H + 0.3, t + 0.06, { colour: shade(CONCRETE, 0.95) });
      const y0 = PARAPET_H + 0.3, toward = -sz; // the lamp's bracket reaches over the road
      sink.span(METAL, px - 0.14, y0, -0.14, px + 0.14, y0 + 0.35, 0.14, { colour: IRON, decor: true });
      sink.member(METAL, [px, y0 + 0.35, 0], [px, y0 + 3.9, 0], 0.09, 0.09, [0, 0, 1], { colour: IRON, decor: true, exposed: true });
      sink.member(METAL, [px, y0 + 3.7, 0], [px, y0 + 3.7, toward * 0.7], 0.06, 0.06, [0, 1, 0], { colour: IRON, decor: true, exposed: true });
      sink.span(METAL, px - 0.17, y0 + 3.2, toward * 0.7 - 0.17, px + 0.17, y0 + 3.62, toward * 0.7 + 0.17, { colour: LAMP, decor: true });
    }
    const parts = sink.finish() as unknown as Record<string, import('three').BufferGeometry[]>;
    ctx.structure('bridge-balustrade', parts, cx + ux * mid + vx * line * sz, deckY, cz + uz * mid + vz * line * sz, rot);
  }
}

/** The Garden Bridge's span: two camelback Pratt trusses on the deck between the roadway and the footways, their
 *  verticals and diagonals, the portals and the top struts between them; the concrete deck and the footways on brackets
 *  outside the trusses with their iron railings. */
function trussSpan(sink: PartSink, bodyHalf: number, face: number, W: number, deckY: number, seat: number): void {
  const L = face * 2, panels = 8, dx = L / panels;
  const zt = W - 1.6; // the trusses' planes
  const bottom = deckY - 0.1;
  const height = (x: number) => 4.4 + 1.8 * (1 - Math.pow((2 * x) / L, 2)); // the camelback's top chord over the deck
  const top = (i: number): Vec3 => { const x = -face + i * dx; return [x, deckY + height(x), 0]; };
  for (const sz of [-1, 1]) {
    const z = sz * zt, out: Vec3 = [0, 0, sz];
    const at = (p: Vec3): Vec3 => [p[0], p[1], z];
    const bot = (i: number): Vec3 => [-face + i * dx, bottom, z];
    // the bottom chord, the top chord panel by panel (the end panels' inclined end posts), the verticals and diagonals
    sink.member(METAL, bot(0), bot(panels), 0.42, 0.36, out, { colour: STEEL, exposed: true });
    sink.member(METAL, bot(0), at(top(1)), 0.4, 0.36, out, { colour: STEEL, exposed: true });
    sink.member(METAL, bot(panels), at(top(panels - 1)), 0.4, 0.36, out, { colour: STEEL, exposed: true });
    for (let i = 1; i < panels - 1; i++) sink.member(METAL, at(top(i)), at(top(i + 1)), 0.4, 0.36, out, { colour: STEEL, exposed: true });
    for (let i = 1; i < panels; i++) sink.member(METAL, bot(i), at(top(i)), 0.24, 0.24, out, { colour: STEEL_DARK, exposed: true });
    for (let i = 1; i < panels - 1; i++) {
      // Pratt: each diagonal falls toward the middle
      const a = i < panels / 2 ? at(top(i)) : at(top(i + 1)), b = i < panels / 2 ? bot(i + 1) : bot(i);
      sink.member(METAL, a, b, 0.16, 0.2, out, { colour: STEEL_DARK, exposed: true });
    }
    // the gusset plates at the top panel points (dressing)
    for (let i = 1; i < panels; i++) {
      const p = top(i);
      sink.span(METAL, p[0] - 0.35, p[1] - 0.45, z - sz * 0.02 - 0.03, p[0] + 0.35, p[1] + 0.05, z - sz * 0.02 + 0.03, { colour: STEEL_DARK, decor: true, fine: true });
    }
    // the footway outside the truss on its brackets, its railing
    const zf0 = sz * (zt + 0.25), zf1 = sz * W;
    sink.span(PLASTER, -face, deckY - 0.18, Math.min(zf0, zf1), face, deckY + 0.05, Math.max(zf0, zf1), { colour: CONCRETE });
    for (let i = 0; i <= panels; i++) sink.member(METAL, [-face + i * dx, deckY - 0.2, sz * zt], [-face + i * dx, deckY - 0.75, sz * (zt - 0.05)], 0.14, 0.14, [1, 0, 0], { colour: STEEL_DARK, decor: true, exposed: true });
    for (let x = -face; x <= face + 1e-6; x += 1.6) sink.member(METAL, [x, deckY + 0.05, sz * (W - 0.06)], [x, deckY + 1.1, sz * (W - 0.06)], 0.05, 0.05, [0, 0, sz], { colour: IRON, decor: true, exposed: true });
    for (const y of [deckY + 0.55, deckY + 1.1]) sink.member(METAL, [-face, y, sz * (W - 0.06)], [face, y, sz * (W - 0.06)], 0.05, 0.05, [0, 1, 0], { colour: IRON, decor: true, exposed: true });
  }
  // the top struts across between the trusses at every top panel point, and the portals at the ends
  for (let i = 1; i < panels; i++) {
    const p = top(i);
    sink.member(METAL, [p[0], p[1] - 0.1, -zt], [p[0], p[1] - 0.1, zt], 0.22, 0.22, [1, 0, 0], { colour: STEEL_DARK, exposed: true });
  }
  for (const i of [1, panels - 1]) {
    const p = top(i);
    sink.member(METAL, [p[0], p[1] - 0.9, -zt], [p[0], p[1] - 0.9, zt], 0.5, 0.3, [1, 0, 0], { colour: STEEL, exposed: true });
    for (const sz of [-1, 1]) sink.member(METAL, [p[0], p[1] - 0.9, sz * zt], [p[0], p[1] - 0.1, sz * (zt - 1.2)], 0.14, 0.14, [1, 0, 0], { colour: STEEL_DARK, exposed: true });
  }
  // the deck between the trusses (the floor beams under it), flush with the approaches; the approach slabs
  sink.span(PLASTER, -bodyHalf, deckY - 0.3, -zt, bodyHalf, deckY, zt, { colour: CONCRETE });
  for (let i = 0; i <= panels; i++) sink.span(METAL, -face + i * dx - 0.15, seat, -zt - 0.2, -face + i * dx + 0.15, deckY - 0.3, zt + 0.2, { colour: STEEL_DARK });
  for (const end of [-1, 1]) sink.span(PLASTER, end * face, deckY - 0.3, -W, end * bodyHalf, deckY, W, { colour: CONCRETE });
}
