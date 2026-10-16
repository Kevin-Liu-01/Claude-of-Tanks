// src/world/maps/regional/souqs.ts — the souq rows and souk stalls of the desert and the Levant, member-built (props
// census #23, the looks lane 2026-10-15; WORKLIST.md "Markets & stalls"): the Wadi Rum village's souq row, the ksar's
// ghorfa souk, the souk stall of the ksar and of Siwa with Siwa's row of them, the Navajo roadside stands and the Chouf
// souk of Deir el-Qamar. The kits keep one re-pointing line each (or a body handed its sink); what a builder needs of its
// kit's own palette or helpers its call hands in.
import { LocalFrame, PartSink, faceBox, facePoint, pick, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, holedFace, holedPolygon, recordBody, windowRhythm, type HouseDialect, type Opening } from './house.ts';
import { doorUnit, rollerDoor, windowUnit, type WindowStyle } from './openings.ts';
import { archHead } from './sarajevoParts.ts';
import { recordLattice } from './lattice.ts';
import { recordShed } from './shedFall.ts';
import type { RegionalBuildContext } from './types.ts';
import { board, rod } from './r2Members.ts';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];
const IRON: Rgb = [0.12, 0.12, 0.12];

/** A box standing free (both its faces), its long axis `ax` in the ground plane. */
function freeBox(sink: PartSink, bucket: RegionalBucket, c: Vec3, size: Vec3, opts: EmitOptions, ax: Vec3 = [1, 0, 0]): void {
  const az: Vec3 = [-ax[2], 0, ax[0]];
  sink.box(bucket, c, [size[0] / 2, size[1] / 2, size[2] / 2], { ...opts, uv: opts.uv ?? { kind: 'world' } }, new LocalFrame(ax, [0, 1, 0], az, [0, 0, 0]));
}

/**
 * An open shop cell behind a cut opening in a front wall `t` thick (the opening u0..u1, y0..y1 on `face`): its jambs,
 * head and sill through the wall, then the cell `deep` deep — its floor, its back, its sides and its ceiling, all facing
 * in — the room a shop's goods stand in (no dark plate: the cell is seen into). The back is structure; the rest dressing.
 */
function shopCell(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, u1: number, y0: number, y1: number, t: number, deep: number,
  inner: EmitOptions = {}): void {
  const P = (u: number, y: number, o: number) => facePoint(face, u, y, o);
  const rv = { ...inner, shade: 0.72 };
  sink.quad(bucket, P(u0, y0, 0), P(u0, y0, -t), P(u0, y1, -t), P(u0, y1, 0), rv);
  sink.quad(bucket, P(u1, y0, 0), P(u1, y1, 0), P(u1, y1, -t), P(u1, y0, -t), rv);
  sink.quad(bucket, P(u0, y1, 0), P(u0, y1, -t), P(u1, y1, -t), P(u1, y1, 0), { ...inner, shade: 0.62 });
  sink.quad(bucket, P(u0, y0, 0), P(u1, y0, 0), P(u1, y0, -t), P(u0, y0, -t), { ...inner, shade: 0.88 });
  const a = -t, b = -t - deep, m = 0.25;
  // the room: a little wider and taller than its opening, its back wall the collision
  const v0 = u0 - m, v1 = u1 + m, top = y1 + 0.3;
  sink.quad(bucket, P(v0, y0, b), P(v1, y0, b), P(v1, top, b), P(v0, top, b), { ...inner, shade: 0.5 });
  sink.quad(bucket, P(v0, y0, a), P(v0, y0, b), P(v0, top, b), P(v0, top, a), { ...inner, shade: 0.45, decor: true });
  sink.quad(bucket, P(v1, y0, b), P(v1, y0, a), P(v1, top, a), P(v1, top, b), { ...inner, shade: 0.45, decor: true });
  sink.quad(bucket, P(v0, top, b), P(v1, top, b), P(v1, top, a), P(v0, top, a), { ...inner, shade: 0.35, decor: true });
  sink.quad(bucket, P(v0, y0 + 0.002, a), P(v1, y0 + 0.002, a), P(v1, y0 + 0.002, b), P(v0, y0 + 0.002, b), { ...inner, shade: 0.6, decor: true });
  // (the room's outsides: it stands inside a body whose other openings look into it)
  sink.quad(bucket, P(v1, y0, b - 0.01), P(v0, y0, b - 0.01), P(v0, top, b - 0.01), P(v1, top, b - 0.01), { ...inner, shade: 0.4, decor: true });
  sink.quad(bucket, P(v0 - 0.01, y0, b), P(v0 - 0.01, y0, a), P(v0 - 0.01, top, a), P(v0 - 0.01, top, b), { ...inner, shade: 0.4, decor: true });
  sink.quad(bucket, P(v1 + 0.01, y0, a), P(v1 + 0.01, y0, b), P(v1 + 0.01, top, b), P(v1 + 0.01, top, a), { ...inner, shade: 0.4, decor: true });
  sink.quad(bucket, P(v0, top + 0.01, a), P(v1, top + 0.01, a), P(v1, top + 0.01, b), P(v0, top + 0.01, b), { ...inner, shade: 0.4, decor: true });
  // the wall's own inner face beside and over the opening (seen from inside the room past the jambs)
  sink.quad(bucket, P(v0, y0, a), P(v0, top, a), P(u0, top, a), P(u0, y0, a), { ...inner, shade: 0.45, decor: true });
  sink.quad(bucket, P(u1, y0, a), P(u1, top, a), P(v1, top, a), P(v1, y0, a), { ...inner, shade: 0.45, decor: true });
  sink.quad(bucket, P(u0, y1, a), P(u0, top, a), P(u1, top, a), P(u1, y1, a), { ...inner, shade: 0.4, decor: true });
}

// ------------------------------------------------------------------------------------------------ Wadi Rum

/** What the Wadi Rum souq takes from its kit: its roof furniture, its sheets, doors and goods. */
export interface RumKit {
  rooftop: (sink: PartSink, W: number, D: number, top: number, rng: () => number) => void;
  sheets: readonly Rgb[];
  doors: readonly Rgb[];
  goods: readonly Rgb[];
}

/**
 * The souq row of the Wadi Rum village (kit:wadirum/marketRow; the judges: "one solid render box; the shopfronts
 * painted: a dark faceBox with a grey shutter slab over it"): a row of concrete-block shops on the house grammar (its
 * plinth sunk, its walls rendered over block, its parapet and the roof's tanks, rebar stubs and dish; its back doors and
 * windows cut; a house plan that breaks it as block): the shop fronts cut through the street wall, each shop a room seen
 * into with its shelves of goods, its roller shutter half raised on its drum in its guides at the head of the opening, the
 * sacks, crates, gas bottles and plastic chairs out before it; a cantilevered concrete canopy on its brackets along the
 * front, the signboards over the shops with their lettering, the air-conditioners and the cable runs; the render fallen
 * away in patches to the block. Laid in the kit's own sink, in its frame along the plot (`plot`: the kit's plotAxes), its
 * shop fronts to +x; the kit coats it.
 */
export function wadirumSouq(sink: PartSink, ctx: RegionalBuildContext, plot: { turned: boolean; w: number; d: number }, kit: RumKit): void {
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const turned = plot.turned;
  const W = clamp(plot.w - 0.6, turned ? 4.2 : 6, 10), D = clamp(plot.d - 0.6, turned ? 6 : 10, 18);
  const H = 3.6, plinth = 0.25, t = 0.25, wall: RegionalBucket = ctx.wallBucket === 'stone' ? 'plaster' : ctx.wallBucket as RegionalBucket;
  const n = Math.max(2, Math.floor(D / 3.2)), bay = D / n, sw = bay - 0.9, sh = 2.7, cellD = clamp(W - 1.4, 1.6, 3.2);
  const us = Array.from({ length: n }, (_, k) => -D / 2 + (k + 0.5) * bay);
  const style: WindowStyle = { frame: rgb(0x5a5e60), frameWidth: 0.05, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'plaster', out: 0.06 }, shutters: null };
  const openings: Opening[] = [];
  // the back: two doors and windows between them; the ends: a window each
  const backDoors = [-D * 0.28, D * 0.22];
  for (const u of backDoors) openings.push({ face: 'left', storey: 0, kind: 'door', u, w: 0.95, y0: 0, h: 2.1 });
  for (const o of windowRhythm('left', 0, D, { w: 0.9, h: 1.0, sill: 1.3, spacing: 3.0, margin: 1.2, avoid: backDoors.map((u) => [u - 1.0, u + 1.0] as const), max: 4 })) openings.push(o);
  for (const face of ['front', 'back'] as const) openings.push({ face, storey: 0, kind: 'window', u: 0, w: 0.9, y0: 1.3, h: 1.0 });
  const door = pick(rng, kit.doors);
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.3),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'plaster', width: 0.1, out: 0.04 }, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0),
  };
  const lay = () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: plinth, out: 0.05, bucket: 'stone' }, storeys: [{ h: H, wall }], core: 'concrete',
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.05, verge: 0.05, thickness: 0.18, bucket: wall, parapet: 0.6 },
      gableBucket: wall, openings, chimneys: [], gutters: null, verge: null, reveal: 0.22,
      // the street front is the shops' own wall (below), cut by their fronts
      abutted: [{ face: 'right', u0: -D / 2, u1: D / 2 }],
    }, dialect);
    const f = frame.faces.right, y0 = plinth, top = plinth + H;
    // the shop step: a concrete pavement along the street front at the shops' floor, its kerb to the road (the goods out on it)
    faceBox(sink, 'stone', f, 0, (y0 - 0.25) / 2, 0.6, D + 0.1, y0 + 0.25, 1.2, { decor: true, tint: [0.86, 0.85, 0.82] });
    // the street wall: its block cut by the shop fronts (their rooms behind), rendered
    holedFace(sink, wall, { ...f, origin: facePoint(f, 0, 0, 0) }, { u0: -D / 2, u1: D / 2, y0, y1: top },
      us.map((u) => ({ u0: u - sw / 2, u1: u + sw / 2, y0, y1: y0 + sh, bare: true })), 0);
    us.forEach((u, k) => {
      shopCell(sink, wall, f, u - sw / 2, u + sw / 2, y0, y0 + sh, t, cellD, { tint: [0.92, 0.9, 0.86] });
      // the roller shutter: its drum box under the canopy, its guides, the curtain half raised at the head
      sink.recess = t;
      try { rollerDoor(sink, f, u, y0, sw, sh, 0.55 + look() * 0.35, pick(look, [rgb(0x8a8e90), rgb(0x6a7276), rgb(0x9a9a94)]), rgb(0x5a5e60), mobile); }
      finally { sink.recess = 0; }
      sink.dressing(mobile, () => {
        // the shop's shelves on its back wall with the goods, the counter at its side
        const back = -t - cellD + 0.02;
        for (const sy of [y0 + 0.6, y0 + 1.25, y0 + 1.9]) {
          faceBox(sink, 'structureWood', f, u, sy, back + 0.18, sw + 0.3, 0.04, 0.36, { colour: rgb(0x8a7a66), decor: true });
          for (let a = u - sw / 2 + 0.1; a < u + sw / 2 + 0.05; a += 0.3) {
            if (look() < 0.18) continue;
            const h = 0.14 + look() * 0.2;
            faceBox(sink, 'structureWood', f, a, sy + 0.02 + h / 2, back + 0.18, 0.22 + look() * 0.05, h, 0.24, { colour: pick(look, kit.goods), decor: true });
          }
        }
        faceBox(sink, 'structureWood', f, u + sw / 2 - 0.35, y0 + 0.45, -t - 0.45, 0.6, 0.9, 0.55, { colour: rgb(0x9a8a72), decor: true });
        // out before it: sacks, a crate of produce, the gas bottles, a plastic chair
        const o0 = 0.35 + look() * 0.2;
        if (look() < 0.6) for (let j = 0; j < 3; j++) {
          const p = facePoint(f, u - sw / 2 + 0.35 + j * 0.42, 0, o0);
          sink.cylinder('structureWood', [p[0], y0 - 0.0, p[2]], 'y', 0.55, 0.2, 7, { colour: shade(rgb(0xc8b48a), 0.85 + look() * 0.2), decor: true }, 0.15);
        }
        if (look() < 0.5) {
          const p = facePoint(f, u + 0.3, 0, o0 + 0.1);
          sink.span('structureWood', p[0] - 0.3, y0 - 0.0, p[2] - 0.22, p[0] + 0.3, y0 + 0.32, p[2] + 0.22, { colour: rgb(0x9a7a52), decor: true });
          sink.span('structureWood', p[0] - 0.26, y0 + 0.32, p[2] - 0.18, p[0] + 0.26, y0 + 0.4, p[2] + 0.18, { colour: pick(look, [rgb(0xb8452e), rgb(0xc9a23a), rgb(0x5f8a3a)]), decor: true });
        }
        if (k % 2 === 0) for (const dz of [-0.2, 0.15]) {
          const p = facePoint(f, u + sw / 2 + 0.1 + dz, 0, 0.3);
          sink.cylinder('structureMetal', [p[0], y0, p[2]], 'y', 0.55, 0.15, 8, { colour: pick(look, [rgb(0x2e5f9a), rgb(0xb8302a), rgb(0xc8c4b4)]), decor: true });
          sink.cylinder('structureMetal', [p[0], y0 + 0.55, p[2]], 'y', 0.08, 0.06, 6, { colour: IRON, decor: true });
        }
        if (k % 3 === 1) {
          // a white plastic chair: its seat, its back, its four legs
          const p = facePoint(f, u - sw / 2 - 0.2, 0, 0.6), c = rgb(0xdedad0), ax: Vec3 = [f.u[0], 0, f.u[2]];
          freeBox(sink, 'structureWood', [p[0], y0 + 0.44, p[2]], [0.44, 0.04, 0.42], { colour: c, decor: true }, ax);
          freeBox(sink, 'structureWood', [p[0] - f.out[0] * 0.2, y0 + 0.72, p[2] - f.out[2] * 0.2], [0.44, 0.52, 0.03], { colour: c, decor: true }, ax);
          for (const a of [-0.19, 0.19]) for (const b of [-0.18, 0.18]) {
            sink.cylinder('structureWood', [p[0] + ax[0] * a + f.out[0] * b, y0, p[2] + ax[2] * a + f.out[2] * b], 'y', 0.43, 0.018, 5, { colour: c, decor: true });
          }
        }
      });
    });
    // the canopy: a concrete slab cantilevered from the wall over the shop fronts, on its brackets between the shops
    const cy = y0 + sh + 0.72, cd = 1.1;
    faceBox(sink, 'plaster', f, 0, cy, cd / 2, D + 0.1, 0.14, cd, { decor: true, tint: [0.9, 0.9, 0.88] });
    for (let k = 0; k <= n; k++) {
      const u = -D / 2 + k * bay + (k === 0 ? 0.15 : k === n ? -0.15 : 0);
      sink.prism('plaster', [facePoint(f, u - 0.08, cy - 0.07, 0), facePoint(f, u - 0.08, cy - 0.07, cd - 0.15), facePoint(f, u - 0.08, cy - 0.6, 0)] as Vec3[],
        [f.u[0], 0, f.u[2]], 0.16, { decor: true, tint: [0.88, 0.88, 0.86] });
    }
    sink.dressing(mobile, () => {
      // the signboards standing on the canopy's front edge, their lettering in a band of strokes from the right
      us.forEach((u) => {
        const c = pick(look, [rgb(0x2a6a3a), rgb(0x2a4a8a), rgb(0x8a2a24), rgb(0xd8c8a0)]);
        faceBox(sink, 'structureWood', f, u, cy + 0.32, cd - 0.04, sw, 0.5, 0.04, { colour: c, decor: true });
        for (let j = 0, m = 4 + Math.floor(look() * 4); j < m; j++) {
          const a = u + sw / 2 - 0.25 - j * (sw - 0.5) / Math.max(1, m), len = 0.12 + look() * 0.22;
          faceBox(sink, 'structureWood', f, a - len / 2, cy + 0.3 + look() * 0.12, cd - 0.015, len, 0.05, 0.01, { colour: [0.94, 0.92, 0.86], decor: true, fine: true });
        }
      });
      // the air-conditioners on the end wall and the back, their cable runs up to the roof
      for (const [fn, u] of [['front', W * 0.2], ['left', D * 0.1]] as const) {
        const af = frame.faces[fn];
        faceBox(sink, 'structureMetal', af, u, y0 + 2.45, 0.2, 0.8, 0.55, 0.4, { colour: rgb(0xd8d6ce), decor: true });
        faceBox(sink, 'structureMetal', af, u, y0 + 2.45, 0.41, 0.42, 0.42, 0.01, { colour: rgb(0x3a3a3a), decor: true, fine: true });
        faceBox(sink, 'structureMetal', af, u + 0.5, (y0 + 2.45 + top) / 2, 0.02, 0.025, top - y0 - 2.45, 0.025, { colour: rgb(0x2a2a2a), decor: true, fine: true });
      }
      // the render fallen away in patches to the block on the end walls and the back
      for (const fn of ['front', 'back', 'left'] as const) {
        const pf = frame.faces[fn];
        for (let j = 0; j < 3; j++) {
          if (look() < 0.35) continue;
          const u = (look() - 0.5) * pf.width * 0.8, y = y0 + 0.3 + look() * (H - 1.0), w = 0.5 + look() * 0.9, h = 0.3 + look() * 0.5;
          faceBox(sink, 'stone', pf, u, y, 0.004, w, h, 0.008, { decor: true, tint: [0.82, 0.8, 0.76] });
        }
      }
    });
    kit.rooftop(sink, W, D, top, rng);
  };
  lay();
}

// ------------------------------------------------------------------------------------------------ the ksar

/** What the ghorfa souk takes from its kit: its door blues, its palm timber, its mud's bucket. */
export interface KsarKit { blues: readonly Rgb[]; timber: Rgb; mud: RegionalBucket }

/**
 * One ghorfa cell of the souk: its mud body on a footing sunk into the lane, its front and back walls cut, its barrel
 * vault with the crown's ridge and its front's slumped lip, its foot eroded to the rubble; a store's door (palm planks on
 * battens, a wooden lock, set back in the reveal under a palm-log lintel) or a shop's wider opening with the goods out
 * before it and the kilims on their pegs; `back` cuts a door in its back wall too.
 */
function souqCell(sink: PartSink, kit: KsarKit, x: number, y: number, z: number, w: number, h: number, d: number, look: () => number,
  opts: { open: boolean; back: boolean; blue: Rgb; mobile: boolean; foot: number }): void {
  const r = w / 2, fw = Math.min(0.42, d * 0.3), k = 0.94 + look() * 0.12, tint: Rgb = [k, k * (0.98 + look() * 0.04), k * 0.97];
  const mud = { tint } as EmitOptions;
  const yb = y - opts.foot;
  sink.span(kit.mud, x - r, yb, z - d + fw, x + r, y + h, z - fw, mud);
  const front: Face = { origin: [x, 0, z], u: [1, 0, 0], out: [0, 0, 1], width: w };
  const hole = opts.open ? { u0: -0.55, u1: 0.55, y0: y + 0.08, y1: y + 1.55 } : { u0: -0.36, u1: 0.36, y0: y + 0.15, y1: y + 1.3 };
  holedPolygon(sink, kit.mud, front, [[-r, yb], [r, yb], [r, y + h], [-r, y + h]], [hole], fw, fw - 0.06, mud);
  const back: Face = { origin: [x, 0, z - d], u: [-1, 0, 0], out: [0, 0, -1], width: w };
  holedPolygon(sink, kit.mud, back, [[-r, yb], [r, yb], [r, y + h], [-r, y + h]], opts.back ? [{ u0: -0.34, u1: 0.34, y0: y + 0.15, y1: y + 1.25 }] : [], fw, fw - 0.06, mud);
  // the vault, its front's slumped lip, its crown's ridge
  sink.cylinder(kit.mud, [x, y + h, z - d], 'z', d, r, 8, mud, r, true, -Math.PI / 2, Math.PI);
  sink.dressing(opts.mobile, () => {
    sink.cylinder(kit.mud, [x, y + h, z - 0.12], 'z', 0.16, r + 0.05, 8, { decor: true, tint: [tint[0] * 1.04, tint[1] * 1.04, tint[2] * 1.03] }, r + 0.03, false, -Math.PI / 2, Math.PI);
    sink.cylinder(kit.mud, [x, y + h + r - 0.03, z - d + 0.05], 'z', d - 0.1, 0.07, 5, { decor: true, tint: [tint[0] * 0.96, tint[1] * 0.95, tint[2] * 0.94] }, 0.06);
    // the foot eroded back to the rubble it was laid on, in a ragged band
    for (let u = -r + 0.05; u < r - 0.1; u += 0.5) {
      const hh = 0.18 + look() * 0.22;
      faceBox(sink, 'stone', front, Math.min(r - 0.3, u + 0.25), yb + opts.foot + hh / 2 - 0.05, 0.012, 0.48, hh, 0.024, { decor: true, tint: [0.78, 0.74, 0.68] });
    }
  });
  // the doors and their lintels
  const leafC = opts.blue, go = -fw + 0.03, P = (u: number, yy: number, o: number) => facePoint(front, u, yy, o);
  const lintel = (f: Face, a: number, b: number, yy: number) => {
    sink.member('structureWood', facePoint(f, a - 0.24, yy + 0.07, 0.055), facePoint(f, b + 0.24, yy + 0.07, 0.055), 0.12, 0.12, [0, 1, 0], { colour: shade(kit.timber, 0.85 + look() * 0.2), decor: true, exposed: true }, 0);
  };
  const leaf = (f: Face, hl: { u0: number; u1: number; y0: number; y1: number }) => {
    const wl = hl.u1 - hl.u0, n = Math.max(3, Math.round(wl / 0.17));
    for (let j = 0; j < n; j++) {
      const u = hl.u0 + (j + 0.5) * wl / n;
      faceBox(sink, 'structureWood', f, u, (hl.y0 + hl.y1) / 2, go + (j % 2) * 0.004, wl / n - 0.008, hl.y1 - hl.y0 - 0.02, 0.035, { colour: shade(leafC, 0.85 + look() * 0.25), decor: true });
    }
    sink.dressing(opts.mobile, () => {
      for (const t of [0.18, 0.82]) faceBox(sink, 'structureWood', f, (hl.u0 + hl.u1) / 2, hl.y0 + (hl.y1 - hl.y0) * t, go + 0.03, wl - 0.06, 0.08, 0.025, { colour: shade(leafC, 0.75), decor: true, fine: true });
      // the wooden lock (a box of palm wood on the leaf, its key bar)
      faceBox(sink, 'structureWood', f, hl.u1 - 0.14, (hl.y0 + hl.y1) / 2 + 0.05, go + 0.05, 0.12, 0.3, 0.05, { colour: kit.timber, decor: true });
    });
  };
  if (!opts.open) leaf(front, hole);
  lintel(front, hole.u0, hole.u1, hole.y1);
  if (opts.back) { leaf(back, { u0: -0.34, u1: 0.34, y0: y + 0.15, y1: y + 1.25 }); lintel(back, -0.34, 0.34, y + 1.25); }
  if (opts.open) sink.dressing(opts.mobile, () => {
    // the goods out of the shop: sacks of grain, baskets, a jar or two; the kilims on their pegs beside the door
    for (let j = 0; j < 4; j++) {
      const p = P(-0.75 + j * 0.5 + (look() - 0.5) * 0.15, 0, 0.35 + look() * 0.35);
      if (look() < 0.5) sink.cylinder('structureWood', [p[0], y, p[2]], 'y', 0.5, 0.2, 7, { colour: shade(rgb(0xc8b48a), 0.85 + look() * 0.2), decor: true }, 0.15);
      else {
        sink.cylinder('structureWood', [p[0], y, p[2]], 'y', 0.22, 0.24, 8, { colour: shade(rgb(0xa08a5a), 0.9 + look() * 0.2), decor: true }, 0.26, false);
        sink.cylinder('structureWood', [p[0], y + 0.02, p[2]], 'y', 0.16, 0.22, 7, { colour: pick(look, [rgb(0xa83a1e), rgb(0xc89a2a), rgb(0x5a3020), rgb(0xc8b080)]), decor: true }, 0.1);
      }
    }
    const jar = rgb(0xa8673e), jp = P(r - 0.3, 0, 0.3);
    sink.cylinder('structureWood', [jp[0], y, jp[2]], 'y', 0.4, 0.13, 8, { colour: jar, decor: true }, 0.2);
    sink.cylinder('structureWood', [jp[0], y + 0.4, jp[2]], 'y', 0.2, 0.2, 8, { colour: shade(jar, 0.95), decor: true }, 0.08);
    const ku = hole.u0 - 0.04 - 0.22 < -r + 0.05 ? hole.u1 + 0.26 : hole.u0 - 0.26;
    if (Math.abs(ku) + 0.22 < r) {
      for (const pu of [ku - 0.15, ku + 0.15]) faceBox(sink, 'structureWood', front, pu, y + 1.62, 0.06, 0.04, 0.04, 0.12, { colour: kit.timber, decor: true, fine: true });
      const bands: Rgb[] = [rgb(0x8e2f24), rgb(0xd8ccb0), rgb(0x2f3a5e), rgb(0xc08a2a), rgb(0x8e2f24)];
      bands.forEach((c, j) => faceBox(sink, 'structureWood', front, ku, y + 1.55 - (j + 0.5) * 0.24, 0.025, 0.42, 0.24, 0.012, { colour: c, decor: true }));
      for (let j = 0; j < 5; j++) faceBox(sink, 'structureWood', front, ku - 0.17 + j * 0.085, y + 1.55 - 1.2 - 0.04, 0.026, 0.02, 0.08, 0.006, { colour: rgb(0xd8ccb0), decor: true, fine: true });
    }
  });
}

/**
 * The ghorfa souk (kit:ksar/marketRow; the judges: "every door painted on: a dark faceBox with a plank box laid 3 cm
 * proud; one smooth mud tone, no members, no footing, no goods: a souk of closed store cells"): vaulted cells side by
 * side along the row's plot on their footings, each its own tone of mud, their store doors hung in cut openings under
 * palm-log lintels and every other ground cell open as a shop with its goods out on the lane; an upper tier over the
 * middle cells on the lower vaults' beds, reached by the stair stones, the hoist poles out over the upper doors; the
 * rear worked with its back doors. Returns the sink (the kit's call finishes it).
 */
export function ksarGhorfaSouk(ctx: RegionalBuildContext, kit: KsarKit): PartSink {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const W = Math.max(5, ctx.info.w - 0.5), D = Math.max(3.4, Math.min(6, ctx.info.d - 0.9));
  const blue = pick(rng, kit.blues);
  const cw = 2.4, ch = 1.9, tierH = ch + cw / 2 + 0.1;
  const n = Math.max(2, Math.floor(W / (cw + 0.12)));
  const cellX = (i: number) => -n * (cw + 0.12) / 2 + (cw + 0.12) * (i + 0.5);
  for (let i = 0; i < n; i++) {
    souqCell(sink, kit, cellX(i), 0, D / 2, cw, ch, D, look, { open: i % 2 === 0, back: i === n - 1, blue: look() < 0.7 ? blue : shade(kit.timber, 0.95), mobile, foot: 0.3 });
    // the seam between this cell and the next: a dark crack down the join
    if (i < n - 1) sink.dressing(mobile, () => faceBox(sink, 'dark', { origin: [cellX(i) + cw / 2 + 0.06, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: 0.12 }, 0, ch / 2, -0.02, 0.12, ch, 0.02, { decor: true }));
  }
  // the upper tier over the middle cells, on the lower vaults' beds, set back a little from the lane
  const first = Math.floor((n - 1) / 2), last = n >= 4 ? first + 1 : first;
  for (let i = first; i <= last; i++) {
    const x = cellX(i), r = cw / 2, spring = ch, crown = spring + r;
    // the bed: a course on the lower crown up to the upper floor, its spandrels filled flush with the fronts
    sink.span(kit.mud, x - r, crown - 0.05, -D / 2 + 0.4, x + r, tierH, D / 2 - 0.4, { decor: true });
    for (const [zf, nz] of [[D / 2 - 0.4, 1], [-D / 2 + 0.4, -1]] as const) for (const s of [-1, 1]) {
      const corner: Vec3 = [x + s * r, tierH, zf];
      const at = (j: number): Vec3 => [x + s * r * Math.sin(j * Math.PI / 8), spring + r * Math.cos(j * Math.PI / 8), zf];
      for (let q = 0; q < 4; q++) sink.polygon(kit.mud, s * nz > 0 ? [corner, at(q), at(q + 1)] : [corner, at(q + 1), at(q)], { decor: true });
      sink.polygon(kit.mud, s * nz > 0 ? [corner, at(4), [x + s * r, tierH, zf]] : [corner, [x + s * r, tierH, zf], at(4)], { decor: true });
    }
    if (rng() < 0.2) continue;
    souqCell(sink, kit, x, tierH, D / 2 - 0.4, cw, ch, D - 0.8, look, { open: false, back: false, blue, mobile, foot: 0 });
    // the hoist pole out over the upper door, a palm trunk with its rope
    sink.dressing(mobile, () => {
      const hy = tierH + ch + r * 0.7;
      sink.cylinder('structureWood', [x + 0.4, hy, D / 2 - 0.9], 'z', 1.3, 0.07, 6, { colour: shade(kit.timber, 0.9), decor: true }, 0.06);
      sink.member('structureWood', [x + 0.4, hy - 0.06, D / 2 + 0.32], [x + 0.4, tierH + 0.4, D / 2 + 0.32], 0.02, 0.02, [1, 0, 0], { colour: rgb(0x8a7a5a), decor: true, exposed: true, fine: true }, 0);
    });
  }
  // the stair stones jutting from the front between the cells, from the ground up to the upper floor
  const sx = cellX(first) - cw / 2 - 0.06;
  for (let k = 0; k < 6; k++) {
    const y = 0.35 + k * (tierH - 0.35) / 5.5;
    sink.span(kit.mud, sx - 0.3, y - 0.05, k >= 4 ? D / 2 - 0.42 : D / 2 - 0.05, sx + 0.3, y + 0.1, D / 2 + 0.3 - k * 0.04, { decor: true });
  }
  return sink;
}

/** What a souk stall takes from its kit: its mud's bucket. */
export interface StallKit { mud: RegionalBucket }

/**
 * The souk stall of the ksar and of Siwa (kit:ksar/market, kit:siwa/market, the stalls of Siwa's row; the judges: "the
 * back wall one 3 m plaster slab, blank on its back face; the counter a plain box; the posts on the slab with no footing;
 * the kilims flat bands; the default kit's destruction"), `W` x `D` about the origin, its counter to +z: a platform of
 * beaten earth with its worn lip and step; the palm trunks on their stone footings under the trunk beam and joists; the
 * jerid laid rib by rib with the frond tips ragged over the lane; the back wall of mud brick under its plaster — its
 * courses showing through, its arrises slumped round, its coping rounded, its foot eroded — with the store's door hung
 * at the back of its reveal under a palm-log lintel; the plastered counter with its rounded nosing; the kilims on their
 * pegs with their fringes, the baskets of dates and spice, the clay jars. The back wall is a body of the house plan
 * (it breaks in its own mud), the frame an open frame with the mat its crown (the trunks snap, the mat drops).
 */
export function souqStall(sink: PartSink, look: () => number, W: number, D: number, top: number, kit: StallKit): void {
  const MUD = kit.mud, floor = 0.18, wallZ = -D / 2 + 0.4, wt = 0.4, wallTop = top + 0.45;
  const palm = rgb(0x6a5a46), postZ = D / 2 - 0.2;
  // the platform of beaten earth, skimmed with mud; its lip worn and a step down to the lane
  sink.span(MUD, -W / 2 - 0.2, -0.3, -D / 2 - 0.2, W / 2 + 0.2, floor, D / 2 + 0.2);
  for (let x = -W / 2 - 0.2; x < W / 2 + 0.1; x += 0.7) {
    const len = Math.min(0.7, W / 2 + 0.2 - x), drop = 0.03 + look() * 0.06;
    sink.span(MUD, x + 0.01, floor - 0.2, D / 2 + 0.2, x + len - 0.01, floor - drop, D / 2 + 0.32, { decor: true, tint: [0.94, 0.92, 0.88] });
  }
  sink.span(MUD, -0.6, -0.3, D / 2 + 0.2, 0.6, floor * 0.5, D / 2 + 0.55, { decor: true, tint: [0.92, 0.9, 0.86] });
  // the palm trunks on their stone footings, the trunk beam across them, the joists back to the wall
  const legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.2);
    sink.cylinder('stone', [x, -0.15, postZ], 'y', floor + 0.25, 0.22, 7, { tint: [0.86, 0.82, 0.76] }, 0.2);
    sink.cylinder('structureWood', [x, floor + 0.1, postZ], 'y', top - floor - 0.1, 0.14, 7, { colour: palm }, 0.12);
    legs.push({ foot: [x, floor + 0.1, postZ], head: [x, top, postZ] });
  }
  sink.member('structureWood', [-W / 2 - 0.1, top + 0.08, postZ], [W / 2 + 0.1, top + 0.08, postZ], 0.18, 0.18, [0, 1, 0], { colour: palm, exposed: true });
  for (const t of [-0.36, 0, 0.36]) sink.member('structureWood', [t * W, top + 0.24, wallZ - 0.1], [t * W, top + 0.24, postZ + 0.15], 0.13, 0.13, [0, 1, 0], { colour: shade(palm, 0.92), exposed: true });
  sink.member('structureWood', [-W / 2 - 0.1, top + 0.24, postZ + 0.2], [W / 2 + 0.1, top + 0.24, postZ + 0.2], 0.2, 0.07, [0, 1, 0], { colour: shade(palm, 0.85), decor: true, exposed: true }, 0);
  const ribs = Math.max(12, Math.round((postZ + 0.3 - wallZ) / 0.21));
  for (let k = 0; k < ribs; k++) {
    const z = wallZ + 0.05 + (postZ + 0.3 - wallZ) * (k + 0.5) / ribs, tone = look();
    const c: Rgb = [0.30 + tone * 0.045, 0.21 + tone * 0.11, 0.13 + tone * 0.15];
    sink.span('structureWood', -W / 2 - 0.2 + look() * 0.15, top + 0.31, z - 0.07, W / 2 + 0.2 - look() * 0.15, top + 0.35, z + 0.07, { colour: c, decor: true, shadow: true });
  }
  for (let x = -W / 2 - 0.1; x < W / 2 + 0.1; x += 0.16 + look() * 0.16) {
    if (look() < 0.2) continue;
    const len = 0.2 + look() * 0.4, tone = look();
    sink.member('structureWood', [x, top + 0.33, postZ + 0.3], [x + (look() - 0.5) * 0.16, top + 0.33 - len, postZ + 0.36 + look() * 0.12],
      0.06 + look() * 0.07, 0.02, [0, 0, 1], { colour: [0.25 + tone * 0.06, 0.19 + tone * 0.08, 0.11 + tone * 0.09], decor: true, shadow: true, exposed: true });
  }
  // the back wall: mud brick through its depth, the store's door cut through it with its reveal
  const wall: Face = { origin: [0, 0, wallZ], u: [1, 0, 0], out: [0, 0, 1], width: W };
  const du = W * 0.28, door = { u0: du - 0.42, u1: du + 0.42, y0: floor, y1: floor + 1.85 };
  holedPolygon(sink, MUD, wall, [[-W / 2, floor], [W / 2, floor], [W / 2, wallTop], [-W / 2, wallTop]], [door], wt, wt - 0.06);
  // the wall's back face (holedPolygon lays its front and its cuts' sides), closing the store's niche behind its door
  sink.quad(MUD, facePoint(wall, W / 2, floor, -wt), facePoint(wall, -W / 2, floor, -wt), facePoint(wall, -W / 2, wallTop, -wt), facePoint(wall, W / 2, wallTop, -wt));
  sink.span(MUD, -W / 2, -0.3, wallZ - wt, W / 2, floor, wallZ);
  recordBody(sink, 0, wallZ - wt / 2, W, wt, wallTop, MUD);
  sink.recess = wt - 0.06;
  try {
    doorUnit(sink, wall, du, floor, 0.84, 1.85, { leaf: rgb(0x7a6048), frame: { bucket: 'structureWood', width: 0.08, out: 0.04, colour: shade(palm, 0.9) }, steps: null, leafKind: 'plank' });
  } finally { sink.recess = 0; }
  // the palm-log lintel over the door, its ends in the wall
  sink.member('structureWood', facePoint(wall, du - 0.68, floor + 1.95, 0.05), facePoint(wall, du + 0.68, floor + 1.95, 0.05), 0.16, 0.14, [0, 1, 0], { colour: shade(palm, 0.85), decor: true, exposed: true }, 0);
  sink.dressing(false, () => {
    // the wall's rounded coping, its slumped arrises at the ends, its courses where the plaster has thinned, its foot
    sink.cylinder(MUD, [-W / 2 - 0.02, wallTop - 0.04, wallZ - wt / 2], 'x', W + 0.04, wt / 2 + 0.03, 7, { decor: true, tint: [1.03, 1.02, 1.0] }, wt / 2 + 0.03, true, -Math.PI / 2, Math.PI);
    for (const sx of [-1, 1]) sink.cylinder(MUD, [sx * (W / 2), floor, wallZ - wt / 2], 'y', wallTop - floor - 0.05, wt / 2 + 0.02, 7, { decor: true, tint: [0.98, 0.97, 0.95] }, wt / 2 - 0.02);
    for (let y = floor + 0.32; y < wallTop - 0.3; y += 0.3) {
      for (let u = -W / 2 + 0.25; u < W / 2 - 0.3; u += 0.9 + look() * 0.6) {
        if (u > door.u0 - 0.2 && u < door.u1 + 0.2) continue;
        if (look() < 0.55) continue;
        const len = Math.min(0.5 + look() * 0.6, W / 2 - 0.2 - u);
        faceBox(sink, MUD, wall, u + len / 2, y, 0.006, len, 0.025, 0.012, { decor: true, tint: [0.8, 0.77, 0.72] });
      }
    }
    for (let u = -W / 2 + 0.05; u < W / 2 - 0.1; u += 0.55) {
      if (u > door.u0 - 0.6 && u < door.u1) continue;
      const hh = 0.12 + look() * 0.18;
      faceBox(sink, MUD, wall, u + 0.27, floor + hh / 2, 0.01, 0.54, hh, 0.02, { decor: true, tint: [0.84, 0.8, 0.74] });
    }
  });
  // the counter: a plastered bench across the front, open at one end, its top's edge rounded
  sink.span(MUD, -W / 2 + 0.35, floor, D / 2 - 1.05, W / 2 - 0.95, floor + 0.7, D / 2 - 0.5);
  sink.cylinder(MUD, [-W / 2 + 0.35, floor + 0.7, D / 2 - 0.55], 'x', W - 1.3, 0.07, 6, { decor: true, tint: [1.04, 1.02, 1.0] }, 0.07, true, -Math.PI / 2, Math.PI);
  sink.span(MUD, -W / 2 + 0.33, floor + 0.7, D / 2 - 1.07, W / 2 - 0.93, floor + 0.76, D / 2 - 0.55, { decor: true, tint: [1.03, 1.01, 0.99] });
  // the kilims on their pegs, their fringes
  const grounds: readonly Rgb[] = [0x8e2f24, 0x8e2f24, 0x2f3a5e, 0x9a5a2a].map(rgb);
  const accents: readonly Rgb[] = [0xd8ccb0, 0xc08a2a, 0x2f3a5e, 0x6e2a3a, 0x2a2522].map(rgb);
  for (const u of [-W * 0.27, -W * 0.02]) {
    if (u + 0.7 > door.u0) continue;
    const rw = 0.9 + look() * 0.35, rh = 1.4 + look() * 0.35, y0 = floor + 0.5, bands = 5 + 2 * Math.floor(look() * 3);
    const ground = pick(look, grounds), unit = rh / (1.45 * (bands + 1) / 2 + 0.55 * (bands - 1) / 2);
    let y = y0;
    for (let b = 0; b < bands; b++) {
      const colour = b % 2 ? pick(look, accents) : ground, h = unit * (b % 2 ? 0.55 : 1.45);
      faceBox(sink, 'structureWood', wall, u, y + h / 2, 0.016, rw, h, 0.012, { colour, decor: true });
      y += h;
    }
    for (const pu of [u - rw / 2 + 0.08, u + rw / 2 - 0.08]) faceBox(sink, 'structureWood', wall, pu, y + 0.05, 0.05, 0.04, 0.04, 0.1, { colour: palm, decor: true, fine: true });
    for (let j = 0, m = Math.round(rw / 0.07); j < m; j++) faceBox(sink, 'structureWood', wall, u - rw / 2 + 0.035 + j * 0.07, y0 - 0.05, 0.017, 0.02, 0.1, 0.006, { colour: [0.82, 0.76, 0.62], decor: true, fine: true });
  }
  // flat baskets of dates, chillies, turmeric and chickpeas on the counter; clay jars by the posts
  const basket = rgb(0xa08a5a), goods: readonly Rgb[] = [0x5a3020, 0xa83a1e, 0xc89a2a, 0xc8b080].map(rgb);
  for (let k = 0; k < 3; k++) {
    const x = -W / 2 + 0.75 + k * (W - 2.1) / 2.4;
    sink.cylinder('structureWood', [x, floor + 0.76, D / 2 - 0.8], 'y', 0.1, 0.22, 8, { colour: basket, decor: true }, 0.24);
    sink.cylinder('structureWood', [x, floor + 0.86, D / 2 - 0.8], 'y', 0.07, 0.2, 8, { colour: pick(look, goods), decor: true }, 0.1);
  }
  const clay: Rgb = rgb(0xa8673e);
  for (let k = 0, n = 2 + Math.floor(look() * 3); k < n; k++) {
    const x = (look() < 0.5 ? -1 : 1) * (W / 2 - 0.55 - look() * 0.5), z = wallZ + 0.4 + look() * 1.2, r = 0.17 + look() * 0.08;
    sink.cylinder('structureWood', [x, floor, z], 'y', r * 1.8, r * 0.7, 8, { colour: clay, decor: true }, r * 1.25);
    sink.cylinder('structureWood', [x, floor + r * 1.8, z], 'y', r * 0.9, r * 1.25, 8, { colour: shade(clay, 0.95), decor: true }, r * 0.45);
  }
  recordLattice(sink, legs, [top], 0.28, 'structureWood', palm, { x0: -1.0, x1: 1.0, y0: top, y1: top + 1.2, z0: -0.8, z1: 0.8, bucket: 'structureWood', tint: [0.42, 0.34, 0.24] });
}

// ------------------------------------------------------------------------------------------------ the Navajo stands

/** A 3 x 5 block letter's rows, top to bottom ('#' is paint). */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: [' # ', '# #', '###', '# #', '# #'], B: ['## ', '# #', '## ', '# #', '## '], D: ['## ', '# #', '# #', '# #', '## '],
  E: ['###', '#  ', '## ', '#  ', '###'], F: ['###', '#  ', '## ', '#  ', '#  '], G: ['###', '#  ', '# #', '# #', '###'],
  J: [' ##', '  #', '  #', '# #', ' # '], L: ['#  ', '#  ', '#  ', '#  ', '###'], R: ['## ', '# #', '## ', '# #', '# #'],
  S: ['###', '#  ', '###', '  #', '###'], U: ['# #', '# #', '# #', '# #', '###'], W: ['# #', '# #', '# #', '###', '# #'],
  Y: ['# #', '# #', ' # ', ' # ', ' # '], ' ': ['   ', '   ', '   ', '   ', '   '],
};
/** Paint a word in block letters on a face, centred at (u, y), `cell` a square of the letters' grid. Dressing. */
function lettering(sink: PartSink, face: Face, word: string, u: number, y: number, o: number, cell: number, colour: Rgb): void {
  const width = (word.length * 4 - 1) * cell;
  [...word].forEach((ch, i) => {
    const rows = GLYPHS[ch] ?? GLYPHS[' '];
    rows.forEach((row, r) => [...row].forEach((c, k) => {
      if (c !== '#') return;
      const cu = u - width / 2 + (i * 4 + k + 0.5) * cell, cy = y + (2 - r) * cell;
      const P = (a: number, b: number) => facePoint(face, cu + a * cell / 2, cy + b * cell / 2, o);
      sink.quad('structureWood', P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), { colour, decor: true, fine: true });
    }));
  });
}

/** What the Navajo stands take from their kit: its pole, its juniper and its planks. */
export interface StandsKit { pole: (sink: PartSink, a: Vec3, b: Vec3, r: number, colour: Rgb, decor: boolean) => void; juniper: readonly Rgb[]; plank: Rgb }

/**
 * The roadside stands on the highway through Oljato (kit:navajo/marketRow; the judges: "the plywood flat slabs with no
 * sheet joints, the back one blank ply plane, the brush one flat strip, the lettering colour bars, the counters boxes"):
 * juniper posts sunk in the sand, the back and the partitions of plywood sheets with their joints, their sun-bleached
 * edges and their screws on a frame of 2x4 studs and rails; ply roofs sloping to the road on pole rafters under bundles
 * of juniper and willow brush; plank tables on trestles laid with the jewellers' boards of silver and turquoise; a rug on
 * the back; the painted signs on their posts lettered JEWELRY, FRY BREAD, RUGS; a cooler by a stand. Laid in the kit's
 * own sink and frame (its bounds' centre); its posts recorded as an open frame with the brush its crown. (The r2 sweep,
 * 2026-10-16: box share 0.98, every sheet, stud, rafter, bundle and board a plain box) the ply sheets with their edges
 * eased, the 2x4s, the table, the trestles, the signs and their posts sawn boards with their arrises; the rafters poles,
 * the brush bundles round; the screw heads their heads alone.
 */
export function navajoStands(sink: PartSink, ctx: RegionalBuildContext, kit: StandsKit): void {
  const look = ctx.variant, mobile = ctx.tier === 'mobile';
  const bb = ctx.bounds;
  const W = Math.max(6, bb.maxX - bb.minX - 0.5), D = Math.max(2.8, bb.maxZ - bb.minZ - 0.5);
  const n = Math.max(2, Math.round(W / 3.8)), bw = W / n, H = 2.35;
  const ply: readonly Rgb[] = [0xb8a07a, 0xa89272, 0xc4b08c].map(rgb);
  const paint: readonly Rgb[] = [0x2f6a9a, 0x9a2e24, 0x3d8a86, 0xd8b04a].map(rgb);
  const words = ['JEWELRY', 'FRY BREAD', 'RUGS'];
  const legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  for (let k = 0; k <= n; k++) {
    const x = -W / 2 + k * bw + (k === 0 ? 0.1 : k === n ? -0.1 : 0);
    for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) {
      const top = H + (z < 0 ? 0.3 : 0);
      kit.pole(sink, [x, -0.3, z], [x, top, z], 0.07, pick(look, kit.juniper), false);
      legs.push({ foot: [x, 0, z], head: [x, top, z] });
    }
  }
  // a plywood wall from (x0) to (x1) on the line z (along x), or a partition at x (along z): sheets 1.22 m wide with their
  // joints, each sheet its own tone, its edges bleached; the studs and rails behind (structure: the sheets)
  const sheetRun = (along: 'x' | 'z', a0: number, a1: number, at: number, y1: number, inward: number) => {
    const len = a1 - a0, m = Math.max(1, Math.round(len / 1.22));
    for (let j = 0; j < m; j++) {
      const s0 = a0 + len * j / m + 0.006, s1 = a0 + len * (j + 1) / m - 0.006, c = shade(pick(look, ply), 0.9 + look() * 0.18);
      if (along === 'x') board(sink, 'structureWood', [s0, y1 / 2, at], [s1, y1 / 2, at], [0, 1, 0], y1, 0.024, 0.006, { colour: c });
      else board(sink, 'structureWood', [at, y1 / 2, s0], [at, y1 / 2, s1], [0, 1, 0], y1, 0.024, 0.006, { colour: c });
      if (mobile) continue;
      // the bleached edge along the sheet's top, the screw heads down its sides
      if (along === 'x') sink.span('structureWood', s0, y1 - 0.12, at + 0.012, s1, y1 - 0.02, at + 0.016, { colour: shade(c, 1.18), decor: true, fine: true });
      for (let y = 0.3; y < y1 - 0.2; y += 0.5) for (const e of [s0 + 0.04, s1 - 0.04]) {
        // (a head 3 mm proud of the sheet: its face alone, its edges below a pixel)
        const zf = at + 0.015;
        if (along === 'x') sink.quad('structureMetal', [e - 0.008, y - 0.008, zf], [e + 0.008, y - 0.008, zf], [e + 0.008, y + 0.008, zf], [e - 0.008, y + 0.008, zf], { colour: [0.3, 0.3, 0.3], decor: true, fine: true });
      }
    }
    sink.dressing(mobile, () => {
      // the 2x4s: a rail at the foot, one at the head, studs every sheet's edge, on the sheets' back
      const back = at + inward * 0.056;
      for (const y of [0.08, y1 - 0.06]) {
        if (along === 'x') board(sink, 'structureWood', [a0, y, back], [a1, y, back], [0, 1, 0], 0.09, 0.088, 0.008, { colour: shade(kit.plank, 1.15), decor: true });
        else board(sink, 'structureWood', [back, y, a0], [back, y, a1], [0, 1, 0], 0.09, 0.088, 0.008, { colour: shade(kit.plank, 1.15), decor: true });
      }
      for (let j = 0; j <= m; j++) {
        const s = a0 + len * j / m;
        if (along === 'x') board(sink, 'structureWood', [s, 0.125, back], [s, y1 - 0.105, back], [1, 0, 0], 0.09, 0.088, 0.008, { colour: shade(kit.plank, 1.1), decor: true });
        else board(sink, 'structureWood', [back, 0.125, s], [back, y1 - 0.105, s], [0, 0, 1], 0.09, 0.088, 0.008, { colour: shade(kit.plank, 1.1), decor: true });
      }
    });
  };
  sheetRun('x', -W / 2 + 0.05, W / 2 - 0.05, -D / 2 + 0.06, H + 0.2, -1);
  for (let k = 0; k <= n; k++) {
    const x = Math.max(-W / 2 + 0.06, Math.min(W / 2 - 0.06, -W / 2 + k * bw));
    sheetRun('z', -D / 2 + 0.1, D / 2 - 0.25, x, H, k === 0 ? 1 : -1);
  }
  for (let k = 0; k < n; k++) {
    const x = -W / 2 + (k + 0.5) * bw, c = pick(look, ply);
    // the ply roof sloping to the road on its two pole rafters (on the posts' heads), the brush laid over it in bundles
    const dz = D + 0.4, dy = -0.3, sl = Math.hypot(dz, dy), nY = dz / sl, nZ = -dy / sl;
    for (const s of [-1, 1]) rod(sink, 'structureWood', [x + s * (bw / 2 - 0.1), H + 0.3, -D / 2 - 0.15], [x + s * (bw / 2 - 0.1), H, D / 2 + 0.25], 0.05, 6, { colour: pick(look, kit.juniper), decor: true });
    // the ply on the rafters' tops, its underside on them (the slope's normal n: the sheet 3 cm thick along it)
    board(sink, 'structureWood', [x, H + 0.37 + nY * 0.015, -D / 2 - 0.15 + nZ * 0.015], [x, H + 0.07 + nY * 0.015, D / 2 + 0.25 + nZ * 0.015], [1, 0, 0], bw - 0.06, 0.03, 0.008,
      { colour: c, decor: true, shadow: true });
    sink.dressing(mobile, () => {
      for (let b = 0, m = Math.round((bw - 0.3) / 0.32); b < m; b++) {
        const bx = x - bw / 2 + 0.25 + b * (bw - 0.5) / Math.max(1, m - 1), tone = shade(look() < 0.5 ? rgb(0x7a6a4a) : rgb(0x6a7448), 0.85 + look() * 0.25);
        // a bundle of brush, round, bedded a centimetre in the ply (its stems lie along the slope)
        for (const dzb of [-0.04, 0.04]) {
          const ya = H + 0.4 + look() * 0.015 + nY * 0.025, yb = H + 0.1 + look() * 0.015 + nY * 0.025;
          rod(sink, 'structureWood', [bx + dzb, ya, -D / 2 - 0.25 + nZ * 0.025], [bx - dzb, yb, D / 2 + 0.35 + nZ * 0.025], 0.042, 5, { colour: tone, decor: true });
        }
      }
    });
    // the table on its trestles laid with the jewellers' boards
    const t0 = x - bw / 2 + 0.3, t1 = x + bw / 2 - 0.3, tz0 = D / 2 - 0.85, tz1 = D / 2 - 0.3, ty = 0.82;
    const tzc = (tz0 + tz1) / 2;
    board(sink, 'structureWood', [t0, ty + 0.025, tzc], [t1, ty + 0.025, tzc], [0, 0, 1], tz1 - tz0, 0.05, 0.01, { colour: shade(kit.plank, 1.1) });
    for (const tx of [t0 + 0.25, t1 - 0.25]) for (const s of [-1, 1]) {
      board(sink, 'structureWood', [tx + s * 0.22, 0, tzc + 0.025], [tx, ty, tzc + 0.025], [0, 0, 1], 0.05, 0.06, 0.008, { colour: shade(kit.plank, 0.9) });
    }
    board(sink, 'structureWood', [t0 + 0.05, ty + 0.06, tzc], [t1 - 0.05, ty + 0.06, tzc], [0, 0, 1], tz1 - tz0 - 0.06, 0.02, 0.008, { colour: rgb(0xe9e4da), decor: true });
    for (let b = 0; b < 3; b++) {
      const bx = t0 + 0.3 + b * (t1 - t0 - 0.6) / 2;
      // the jeweller's board, its velvet over a padded edge
      board(sink, 'structureWood', [bx - 0.28, ty + 0.085, tzc], [bx + 0.28, ty + 0.085, tzc], [0, 0, 1], tz1 - tz0 - 0.2, 0.03, 0.01,
        { colour: pick(look, [rgb(0x1f2a44), rgb(0x3a1f2a), rgb(0x1e1e22)]), decor: true, fine: true });
      for (let j = 0; j < 4; j++) {
        const jx = bx - 0.2 + j * 0.13;
        sink.span('structureWood', jx - 0.035, ty + 0.1, tz0 + 0.2 + (j % 2) * 0.12, jx + 0.035, ty + 0.125, tz0 + 0.27 + (j % 2) * 0.12, { colour: j % 2 ? rgb(0x3fb3a8) : rgb(0xc9cdd1), decor: true, fine: true });
      }
    }
    // a rug on the back, the sign over the front on its posts, lettered
    const rug = pick(look, [rgb(0x8e2f24), rgb(0x2f3a5e), rgb(0xd8ccb0)]);
    board(sink, 'structureWood', [x - 0.6, 1.5, -D / 2 + 0.085], [x + 0.6, 1.5, -D / 2 + 0.085], [0, 1, 0], 1.0, 0.03, 0.01, { colour: rug, decor: true });
    // the pole it hangs from, nailed to the sheets
    rod(sink, 'structureWood', [x - 0.68, 2.02, -D / 2 + 0.1], [x + 0.68, 2.02, -D / 2 + 0.1], 0.025, 6, { colour: shade(kit.plank, 0.9), decor: true });
    sink.span('structureWood', x - 0.6, 1.3, -D / 2 + 0.1, x + 0.6, 1.4, -D / 2 + 0.115, { colour: rgb(0x1e1e22), decor: true, fine: true });
    const sign: Face = { origin: [x, 0, D / 2 - 0.08], u: [1, 0, 0], out: [0, 0, 1], width: bw };
    board(sink, 'structureWood', [x - (bw - 0.4) / 2, H + 0.6, D / 2 - 0.08], [x + (bw - 0.4) / 2, H + 0.6, D / 2 - 0.08], [0, 1, 0], 0.55, 0.04, 0.008, { colour: rgb(0xe8e1d0), decor: true });
    const word = words[k % words.length];
    lettering(sink, sign, word, 0, H + 0.6, 0.022, Math.min(0.07, (bw - 0.6) / (word.length * 4)), pick(look, paint));
    for (const s of [-1, 1]) board(sink, 'structureWood', [x + s * (bw / 2 - 0.35), H, D / 2 - 0.085], [x + s * (bw / 2 - 0.35), H + 0.88, D / 2 - 0.085], [1, 0, 0], 0.08, 0.07, 0.01, { colour: kit.plank, decor: true });
    if (k === n - 1) sink.dressing(mobile, () => {
      // the cooler beside the last stand
      const cx = x + bw / 2 - 0.5, cz = D / 2 + 0.1;
      board(sink, 'structureWood', [cx - 0.32, 0.2, cz], [cx + 0.32, 0.2, cz], [0, 1, 0], 0.4, 0.44, 0.035, { colour: rgb(0xd8d4c8), decor: true });
      board(sink, 'structureWood', [cx - 0.33, 0.43, cz], [cx + 0.33, 0.43, cz], [0, 1, 0], 0.06, 0.46, 0.02, { colour: rgb(0x9a2e24), decor: true });
    });
  }
  // (the r2 sweep fix b-west 2026-10-16: as an open frame it folded its posts flat to one side and covered a quarter of
  // its plan) recorded as an open shed (shedFall.ts recordShed, the ramada's): its posts snap over their feet, its ply
  // back and partitions and its ply-and-brush roofs come down over them in their lengths. The shed's frame: x from the
  // back to the road (the stands' z), z along the row
  sink.placed(-Math.PI / 2, 0, 0, 0, () => {
    const posts = legs.map((l): [number, number, number, number] => [l.foot[2], -l.foot[0], -0.3, l.head[1]]);
    recordShed(sink, posts.map(([x, z, f, h]) => ({ foot: [x, f, z] as Vec3, head: [x, h, z] as Vec3 })), {
      W: D, D: W, pitchDeg: Math.atan2(0.3, D + 0.4) * 180 / Math.PI, eaveY: H + 0.07, eave: 0.25, verge: 0.1, deck: 0.1, post: 0.14, posts, pad: null,
      timber: kit.juniper[0], boards: ply[0], boardW: 1.22, back: true, ends: true,
      roof: { bucket: 'structureWood', colour: [0.42, 0.39, 0.26], shape: 'splinter', lattice: true }, stone: null, pile: 0,
    });
  });
}

// ------------------------------------------------------------------------------------------------ the Chouf

/**
 * A round-arched shop opening cut through a wall `t` thick (centre u, `w` wide, its floor y0, its springing `spring`):
 * the jambs and the intrados through the wall in `n` segments, the sill; behind it the barrel-vaulted cell `deep` deep,
 * its floor, its back wall (the arch's own shape), its sides to the springing and its vault, all facing in.
 */
function archCell(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, w: number, y0: number, spring: number, t: number, deep: number,
  inner: EmitOptions = {}): void {
  const r = w / 2, n = r < 0.8 ? 4 : r < 1.3 ? 6 : 8, P = (a: number, y: number, o: number) => facePoint(face, a, y, o);
  const at = (j: number, rr = r): [number, number] => [u + Math.cos(Math.PI * j / n) * rr, spring + Math.sin(Math.PI * j / n) * rr];
  sink.quad(bucket, P(u - r, y0, 0), P(u - r, y0, -t), P(u - r, spring, -t), P(u - r, spring, 0), { ...inner, shade: 0.72 });
  sink.quad(bucket, P(u + r, y0, 0), P(u + r, spring, 0), P(u + r, spring, -t), P(u + r, y0, -t), { ...inner, shade: 0.72 });
  for (let j = 0; j < n; j++) {
    const [ua, ya] = at(j), [ub, yb] = at(j + 1);
    sink.quad(bucket, P(ua, ya, 0), P(ub, yb, 0), P(ub, yb, -t), P(ua, ya, -t), { ...inner, shade: 0.64 });
  }
  sink.quad(bucket, P(u - r, y0, 0), P(u + r, y0, 0), P(u + r, y0, -t), P(u - r, y0, -t), { ...inner, shade: 0.88 });
  // the cell behind, a hand wider than its arch: its vault springing from its sides
  const R = r + 0.2, a = -t, b = -t - deep;
  const atR = (j: number): [number, number] => [u + Math.cos(Math.PI * j / n) * R, spring + Math.sin(Math.PI * j / n) * R];
  sink.quad(bucket, P(u - R, y0 + 0.002, a), P(u + R, y0 + 0.002, a), P(u + R, y0 + 0.002, b), P(u - R, y0 + 0.002, b), { ...inner, shade: 0.6, decor: true });
  sink.quad(bucket, P(u - R, y0, a), P(u - R, y0, b), P(u - R, spring, b), P(u - R, spring, a), { ...inner, shade: 0.45, decor: true });
  sink.quad(bucket, P(u + R, y0, b), P(u + R, y0, a), P(u + R, spring, a), P(u + R, spring, b), { ...inner, shade: 0.45, decor: true });
  sink.quad(bucket, P(u - R, y0, b), P(u + R, y0, b), P(u + R, spring, b), P(u - R, spring, b), { ...inner, shade: 0.5 });
  const fan: Vec3[] = [P(u, spring, b)];
  for (let j = 0; j <= n; j++) { const [x, y] = atR(j); fan.push(P(x, y, b)); }
  sink.polygon(bucket, fan, { ...inner, shade: 0.45 });
  for (let j = 0; j < n; j++) {
    const [ua, ya] = atR(j), [ub, yb] = atR(j + 1);
    sink.quad(bucket, P(ua, ya, a), P(ub, yb, a), P(ub, yb, b), P(ua, ya, b), { ...inner, shade: 0.38, decor: true });
  }
  // the wall's inner face round the arch (seen from inside past the jambs), in the arch's segments
  for (let j = 0; j < n; j++) {
    const [ua, ya] = at(j), [ub, yb] = at(j + 1), [Ua, Ya] = atR(j), [Ub, Yb] = atR(j + 1);
    sink.quad(bucket, P(ua, ya, a), P(Ua, Ya, a), P(Ub, Yb, a), P(ub, yb, a), { ...inner, shade: 0.42, decor: true });
  }
  sink.quad(bucket, P(u - R, y0, a), P(u - R, spring, a), P(u - r, spring, a), P(u - r, y0, a), { ...inner, shade: 0.42, decor: true });
  sink.quad(bucket, P(u + r, y0, a), P(u + r, spring, a), P(u + R, spring, a), P(u + R, y0, a), { ...inner, shade: 0.42, decor: true });
}

/** What the Chouf souk takes from its kit: its state (shutters, windows), its dialect, its earth roof, its spouts. */
export interface ChoufKit<S> {
  st: S;
  dialect: (st: S) => HouseDialect;
  roof: import('./house.ts').RoofSpec;
  spouts: (sink: PartSink, frame: import('./house.ts').HouseFrame, sides: ReadonlyArray<'left' | 'right' | 'back'>, look: () => number) => void;
}

/**
 * The souk of Deir el-Qamar (kit:chouf/marketRow; the judges: "the shop interior a dark plate, the round arch a painted
 * glass half-disc over a square head, the doors and awnings flat slabs, all openings on one face"): a row of sandstone
 * shops on its plinth under the earth roof behind its parapet with its spouts and its roller stone; each shop's round
 * arch cut through the street wall with its voussoirs and keystone, a barrel-vaulted cell behind it with its shelves and
 * the goods spilling out (sacks, copper, crates), its plank doors on their pintles folded back against the wall with
 * their battens and iron straps, an awning of cloth on iron brackets over some; the back and the ends with their
 * windows and a door. The row's house plan breaks it.
 */
export function choufSouk<S extends { rng: () => number; look: () => number; shutter: Rgb }>(ctx: RegionalBuildContext, kit: ChoufKit<S>): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = kit.st, rng = st.rng, look = st.look, mobile = ctx.tier === 'mobile';
  const b = ctx.bounds, ok = Number.isFinite(b.minX) && b.maxX - b.minX > 0.5 && b.maxZ - b.minZ > 0.5;
  const fw = ok ? b.maxX - b.minX : ctx.info.w, fd = ok ? b.maxZ - b.minZ : ctx.info.d, fcx = ok ? (b.minX + b.maxX) / 2 : 0, fcz = ok ? (b.minZ + b.maxZ) / 2 : 0;
  const turned = fw > fd + 0.5, Wf = turned ? fd : fw, Df = turned ? fw : fd;
  const H = 3.6, plinth = 0.45, t = 0.4;
  const W = Math.max(3.5, Wf - 0.1), L = Math.max(5, Df - 0.1), nb = Math.max(2, Math.round(L / 3.0)), bay = L / nb;
  const aw = Math.min(1.9, bay - 0.8), spring = plinth + 2.0, cellD = clamp(W - 1.0, 1.4, 3.0);
  const us = Array.from({ length: nb }, (_, k) => -L / 2 + (k + 0.5) * bay);
  const openings: Opening[] = [
    { face: 'left', storey: 0, kind: 'door', u: L * 0.18, w: 0.95, y0: 0, h: 2.1 },
    { face: 'left', storey: 0, kind: 'window', u: -L * 0.22, w: 0.8, y0: 1.2, h: 1.1 },
    { face: 'front', storey: 0, kind: 'window', u: 0, w: 0.8, y0: 1.2, h: 1.1 },
    { face: 'back', storey: 0, kind: 'window', u: 0, w: 0.8, y0: 1.2, h: 1.1 },
  ];
  const lay = () => {
    const frame = buildHouse(sink, {
      w: W, d: L, plinth: { h: plinth, out: 0.08, bucket: 'stone' }, storeys: [{ h: H, wall: 'stone' }], roof: kit.roof, gableBucket: 'stone', openings,
      chimneys: [], gutters: null, verge: null, reveal: t, spall: null, abutted: [{ face: 'right', u0: -L / 2, u1: L / 2 }],
    }, kit.dialect(st));
    const f = frame.faces.right, y0 = plinth, top = plinth + H;
    // the mastaba: the stone bench-step along the shop fronts at their floor, the goods out on it
    faceBox(sink, 'stone', f, 0, (y0 - 0.25) / 2, 0.5, L + 0.2, y0 + 0.25, 1.0, { decor: true, tint: [0.94, 0.92, 0.88] });
    holedFace(sink, 'stone', f, { u0: -L / 2, u1: L / 2, y0, y1: top }, us.map((u) => ({ u0: u - aw / 2, u1: u + aw / 2, y0, y1: spring + aw / 2, spring, bare: true })), 0);
    const leafC = shade(st.shutter, 0.85);
    us.forEach((u, k) => {
      archCell(sink, 'stone', f, u, aw, y0, spring, t, cellD, { tint: [0.9, 0.88, 0.84] });
      archHead(sink, f, u, spring, aw / 2, 'stone', 0.22, 9);
      faceBox(sink, 'stone', f, u, spring + aw / 2 + 0.13, 0.05, 0.3, 0.38, 0.1, { decor: true, tint: [1.06, 1.04, 1.0] });
      // the plank doors on their pintles, folded back against the wall either side, their battens and straps
      for (const side of [-1, 1]) {
        const cu = u + side * (aw / 2 + 0.33), hh = spring - y0 - 0.05;
        for (let j = 0; j < 4; j++) faceBox(sink, 'structureWood', f, cu - 0.24 + j * 0.16, y0 + hh / 2, 0.03 + (j % 2) * 0.004, 0.15, hh, 0.04, { colour: shade(leafC, 0.88 + look() * 0.2), decor: true });
        sink.dressing(mobile, () => {
          for (const yy of [y0 + 0.35, y0 + hh - 0.35]) {
            faceBox(sink, 'structureWood', f, cu, yy, 0.065, 0.6, 0.1, 0.025, { colour: shade(leafC, 0.75), decor: true, fine: true });
            faceBox(sink, 'structureMetal', f, cu - side * 0.05, yy + 0.08, 0.075, 0.5, 0.04, 0.008, { colour: IRON, decor: true, fine: true });
            faceBox(sink, 'structureMetal', f, u + side * (aw / 2 + 0.03), yy + 0.08, 0.04, 0.05, 0.08, 0.06, { colour: IRON, decor: true, fine: true });
          }
        });
      }
      sink.dressing(mobile, () => {
        // the shelves in the cell's back with the goods; the goods out on the step: sacks, a copper pot, a crate
        for (const sy of [y0 + 0.7, y0 + 1.3]) {
          faceBox(sink, 'structureWood', f, u, sy, -t - cellD + 0.2, aw + 0.3, 0.04, 0.36, { colour: rgb(0x7a6048), decor: true });
          for (let a = u - aw / 2 + 0.05; a < u + aw / 2 + 0.1; a += 0.3) {
            if (look() < 0.2) continue;
            const h = 0.14 + look() * 0.18;
            faceBox(sink, 'structureWood', f, a, sy + 0.02 + h / 2, -t - cellD + 0.2, 0.22, h, 0.24, { colour: pick(look, [rgb(0xc9b48a), rgb(0xa8442f), rgb(0x6a7a3a), rgb(0xb87333), rgb(0xd8d0b8)]), decor: true });
          }
        }
        for (let j = 0; j < 3; j++) {
          const p = facePoint(f, u - aw / 2 + 0.3 + j * 0.5, 0, 0.4 + look() * 0.2);
          if (j === 1) {
            sink.cylinder('structureMetal', [p[0], y0, p[2]], 'y', 0.32, 0.2, 10, { colour: rgb(0xb87333), decor: true }, 0.24);
            sink.cylinder('structureMetal', [p[0], y0 + 0.32, p[2]], 'y', 0.04, 0.24, 10, { colour: shade(rgb(0xb87333), 0.8), decor: true }, 0.24);
          } else sink.cylinder('structureWood', [p[0], y0, p[2]], 'y', 0.5, 0.2, 7, { colour: shade(rgb(0xc8b48a), 0.85 + look() * 0.2), decor: true }, 0.15);
        }
        // an awning of cloth on its iron brackets over some of the shops
        if (rng() < 0.55) {
          const c = pick(rng, [rgb(0x9a3a2c), rgb(0x2f5a7a), rgb(0xc8b88a), rgb(0x4f6a3a)]), ay = spring + aw / 2 + 0.45;
          faceBox(sink, 'structureWood', f, u, ay, 0.55, aw + 0.6, 0.04, 1.1, { colour: c, decor: true });
          for (const side of [-1, 1]) sink.member('structureMetal', facePoint(f, u + side * (aw / 2 + 0.2), ay - 0.5, 0), facePoint(f, u + side * (aw / 2 + 0.2), ay - 0.02, 1.0), 0.03, 0.03, [f.u[0], 0, f.u[2]],
            { colour: IRON, decor: true, exposed: true }, 0);
        }
      });
      void k;
    });
    kit.spouts(sink, frame, ['left', 'back'], look);
    // the roller stone on the earth roof, lying where it was last left
    sink.dressing(mobile, () => sink.cylinder('stone', [-0.4, top + kit.roof.thickness, L * 0.1], 'x', 0.8, 0.22, 10, { decor: true, tint: [0.9, 0.88, 0.84] }, 0.22));
  };
  if (turned) sink.placed(-Math.PI / 2, fcx, 0, fcz, lay); else sink.placed(0, fcx, 0, fcz, lay);
  return sink.finish();
}
