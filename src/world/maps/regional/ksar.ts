// src/world/maps/regional/ksar.ts — the ksar kit (Sirocco Wadi: the Dahar ksour of southern Tunisia — Ouled Soltane,
// Hadada, Chenini). The fortified granary: ghorfas, barrel-vaulted cells of rubble under mud plaster, stacked two and
// three high round a court, their rounded ends in rows with small timber doors, hoisting beams and steep stairs up the
// fronts; flat-roofed village houses rendered in ochre or whitewash with Tunisian blue doors and window grilles, a stair
// block to the roof terrace and a parapet; a whitewashed mosque with a squat square minaret; the borj, a tapering
// watch tower; a domed hammam.
import { PartSink, faceBox, facePoint, pick, rgb, shade, UV_MEMBER, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, holedBox, holedPolygon, recordShaft, windowRhythm, type HoleRect, type HouseDialect, type Opening } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const BLUES: readonly Rgb[] = [0x2f6a9e, 0x3a7ab0, 0x2e5f8a].map(rgb);
const TIMBER = rgb(0x7a6048);
// mud plaster over rubble: the map's own render (the sourced plaster set under the desert palette), the colour of the
// ground it was dug from (w2 captures: the kit's own saturated plaster3 tone read as orange against the sand)
const MUD: RegionalBucket = 'plaster';

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** One ghorfa cell: rubble walls and a barrel vault running back from its rounded front, a small door, a beam. */
function ghorfa(sink: PartSink, x: number, y: number, z: number, w: number, h: number, d: number, rng: () => number, blue: Rgb): void {
  const r = w / 2;
  // (props census #7, lane B 2026-10-14: the cell's door was a dark plate on its front with the leaf laid over it) the
  // cell's body behind its front wall, the door cut through that wall into its dark, the leaf hung shut at the back of the
  // cut
  const fw = Math.min(0.45, d * 0.3);
  sink.span(MUD, x - r, y, z - d, x + r, y + h, z - fw);
  const front: Face = { origin: [x, 0, z], u: [1, 0, 0], out: [0, 0, 1], width: w };
  holedPolygon(sink, MUD, front, [[-r, y], [r, y], [r, y + h], [-r, y + h]], [{ u0: -0.35, u1: 0.35, y0: y + 0.15, y1: y + 1.25 }], fw, fw - 0.06);
  // the vault: a half drum along -z from the front
  sink.cylinder(MUD, [x, y + h, z - d], 'z', d, r, 8, {}, r, true, -Math.PI / 2, Math.PI);
  faceBox(sink, 'structureWood', front, 0, y + 0.7, -fw + 0.1, 0.66, 1.05, 0.04, { colour: rng() < 0.5 ? blue : shade(TIMBER, 0.9), decor: true, uv: UV_MEMBER });
  if (rng() < 0.6) faceBox(sink, 'structureWood', front, (rng() - 0.5) * w * 0.4, y + h + r * 0.55, 0.3, 0.12, 0.12, 0.6, { colour: TIMBER, decor: true });
}

/**
 * The bed of an upper ghorfa cell on the one below it (that cell at height `y`, `h` to its vault's spring, `w` wide;
 * the upper cell's front at `z`, `d` deep, its floor `tierH` over the lower's): a course of rubble on the lower vault's
 * crown up to the upper floor, and the spandrels between the lower vault and the course filled flush with the upper
 * cell's front and back, wound to face out (the connectivity sweep: the upper tiers stood 0.1 m over the crowns). The
 * spandrels' corners are the vault's own (eight segments over the half turn).
 */
function ghorfaBed(sink: PartSink, x: number, y: number, h: number, w: number, z: number, d: number, tierH: number, back = true): void {
  const r = w / 2, spring = y + h, crown = spring + r;
  sink.span(MUD, x - r, crown, z - d, x + r, y + tierH, z, { decor: true });
  for (const [zf, nz] of back ? [[z, 1], [z - d, -1]] as const : [[z, 1]] as const) for (const s of [-1, 1]) {
    const corner: Vec3 = [x + s * r, crown, zf];
    const at = (j: number): Vec3 => [x + s * r * Math.sin(j * Math.PI / 8), spring + r * Math.cos(j * Math.PI / 8), zf];
    for (let k = 0; k < 4; k++) sink.polygon(MUD, s * nz > 0 ? [corner, at(k), at(k + 1)] : [corner, at(k + 1), at(k)], { decor: true });
  }
}

/** A ghorfa range: rows of vaulted cells stacked two or three high along the sides of a court, steps up the fronts. */
const ghorfaRange: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(14, Math.min(24, ctx.info.w - 0.5)), D = Math.max(12, Math.min(20, ctx.info.d - 0.5));
  const blue = pick(rng, BLUES);
  const cw = 2.4, ch = 1.9, cd = Math.min(6.0, D * 0.35);
  const tiers = rng() < 0.5 ? 3 : 2;
  const tierH = ch + cw / 2 + 0.1;
  // the back range (along x at -z) faces the court (+z); the side ranges face inward along x
  const back = -D / 2 + cd;
  const n = Math.floor(W / (cw + 0.12));
  for (let t = 0; t < tiers; t++) for (let i = 0; i < n; i++) {
    const x = -W / 2 + (cw + 0.12) * (i + 0.5);
    if (t === tiers - 1 && rng() < 0.15) continue;
    ghorfa(sink, x, t * tierH, back, cw, ch, cd, rng, blue);
    if (t > 0) ghorfaBed(sink, x, (t - 1) * tierH, ch, cw, back, cd, tierH);
  }
  for (const side of [-1, 1]) {
    const m = Math.max(2, Math.floor((D - cd - 3) / (cw + 0.12)));
    for (let t = 0; t < Math.max(1, tiers - 1); t++) for (let i = 0; i < m; i++) {
      const z = back + 0.4 + (cw + 0.12) * (i + 0.5);
      // a side range: build the cell facing +z and turn it to face the court (±x)
      sink.placed(side > 0 ? -Math.PI / 2 : Math.PI / 2, side * (W / 2 - cd), 0, z, () => {
        ghorfa(sink, 0, t * tierH, 0, cw, ch, cd, rng, blue);
        if (t > 0) ghorfaBed(sink, 0, (t - 1) * tierH, ch, cw, 0, cd, tierH);
      });
    }
  }
  // steep stairs of jutting stones up the back range's front
  for (let t = 1; t < tiers; t++) {
    const sx = -W / 2 + (cw + 0.12) * (Math.floor(n / 2) + 0.5) + cw / 2 + 0.06;
    for (let k = 0; k < 6; k++) sink.span(MUD, sx - 0.3, (t - 1) * tierH + ch + k * (tierH / 6) - 0.05, back, sx + 0.3, (t - 1) * tierH + ch + k * (tierH / 6) + 0.1, back + 0.35 + (5 - k) * 0.06, { decor: true });
  }
  // the court's enclosing wall and gate on +z
  const wallH = 3.0;
  sink.span(MUD, -W / 2, 0, D / 2 - 0.6, -2.0, wallH, D / 2);
  sink.span(MUD, 2.0, 0, D / 2 - 0.6, W / 2, wallH, D / 2);
  sink.span(MUD, -2.2, 3.2, D / 2 - 0.7, 2.2, 4.0, D / 2 + 0.05);
  for (const sx of [-1, 1]) sink.span(MUD, sx * 2.0 - 0.3, 0, D / 2 - 0.7, sx * 2.0 + 0.3, 3.2, D / 2 + 0.05);
  return sink.finish();
};

/**
 * A souk row of ghorfa shops on the base market row's plot (12 x 5.2 m): vaulted cells side by side along it, their
 * doors on its long side, a second tier over the middle cells reached by jutting stair stones (the ghorfa souk of
 * Medenine). The ghorfa range's court needs a plot three times as deep; this row stays inside its own.
 */
const ghorfaShops: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5, ctx.info.w - 0.5), D = Math.max(3.4, Math.min(6, ctx.info.d - 0.9));
  const blue = pick(rng, BLUES);
  const cw = 2.4, ch = 1.9, tierH = ch + cw / 2 + 0.1;
  const n = Math.max(2, Math.floor(W / (cw + 0.12)));
  const cellX = (i: number) => -n * (cw + 0.12) / 2 + (cw + 0.12) * (i + 0.5);
  for (let i = 0; i < n; i++) ghorfa(sink, cellX(i), 0, D / 2, cw, ch, D, rng, blue);
  // the upper tier over the middle cells, set back a little from the lane
  const first = Math.floor((n - 1) / 2), last = n >= 4 ? first + 1 : first;
  for (let i = first; i <= last; i++) {
    // the terrace's edge over the lower cell's front, its spandrels filled flush with the lane front: the stair's top
    // stones stand against it
    ghorfaBed(sink, cellX(i), 0, ch, cw, D / 2, 0.4, tierH, false);
    if (rng() < 0.2) continue;
    ghorfa(sink, cellX(i), tierH, D / 2 - 0.4, cw, ch, D - 0.4, rng, blue);
    ghorfaBed(sink, cellX(i), 0, ch, cw, D / 2 - 0.4, D - 0.4, tierH);
  }
  // the stair stones jutting from the front between the cells, from the ground up to the upper floor
  const sx = cellX(first) - cw / 2 - 0.06;
  for (let k = 0; k < 6; k++) {
    const y = 0.35 + k * (tierH - 0.35) / 5.5;
    sink.span(MUD, sx - 0.3, y - 0.05, D / 2 - 0.05, sx + 0.3, y + 0.1, D / 2 + 0.3 - k * 0.04, { decor: true });
  }
  return sink.finish();
};

/**
 * The village house: a flat roof behind a parapet, ochre or whitewash, blue door and grilles, a roof stair block.
 * (the looks lane, 2026-10-15; WORKLIST #26, "Ksar adobe (desert, light touch on a ratified look: ... a real roof stair,
 * more openings, palm-beam hoods and spouts)") the look as ratified, and: on most houses the mud stair up the side to the
 * roof terrace, each tread its own block, its low parapet stepping up beside it; the stair-head room on the roof a room
 * (its door cut through its wall to the terrace, a flat roof behind its own parapet), not a solid block; a few more
 * openings (the back's windows, the small square vents high under the parapet); the door and a share of the windows
 * under a hood of palm trunks cantilevered from the wall with the mud laid over them; the rain spouts hollowed palm
 * trunks, open along their tops.
 */
const house: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const Wp = Math.max(5.0, ctx.info.w - 0.3), D = Math.max(5.4, ctx.info.d - 0.3);
  const wall: RegionalBucket = ctx.wallBucket === 'stone' ? MUD : ctx.wallBucket as RegionalBucket;
  const blue = pick(rng, BLUES);
  const style: WindowStyle = { frame: blue, frameWidth: 0.06, frameOut: 0.04, bars: 'six', surround: { bucket: 'plaster', width: 0.12, out: 0.04 }, sill: null, shutters: null };
  const vent: WindowStyle = { frame: TIMBER, frameWidth: 0.04, frameOut: 0.03, bars: 'two', surround: null, sill: null, shutters: null };
  const stair = look() < 0.7 && Wp > 5.8, SW = 0.9, W = stair ? Wp - SW - 0.05 : Wp, cx = stair ? -(SW + 0.05) / 2 : 0;
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * W * 0.3, w: 1.05, y0: 0, h: 2.1 }];
  for (const face of ['front', 'left', 'right'] as const) {
    for (const o of windowRhythm(face, 0, face === 'front' ? W : D, { w: 0.55, h: 0.7, sill: 1.5, spacing: 2.4, margin: 1.0, max: 2,
      avoid: face === 'front' ? [[openings[0].u - 0.8, openings[0].u + 0.8]] : [] })) openings.push(o);
  }
  for (const o of windowRhythm('back', 0, W, { w: 0.5, h: 0.6, sill: 1.6, spacing: 2.6, margin: 1.2, max: 2 })) if (look() < 0.7) openings.push(o);
  // the vents: small square holes high under the parapet, one or two a side, clear of the windows under them
  const wallH = 3.0 + rng() * 0.5;
  for (const face of ['left', 'right', 'back'] as const) {
    const width = face === 'back' ? W : D;
    for (const u of [-width * 0.28, width * 0.28]) {
      if (look() < 0.45 || openings.some((q) => q.face === face && Math.abs(q.u - u) < 0.6)) continue;
      openings.push({ face, storey: 0, kind: 'loft', u, w: 0.28, y0: wallH - 0.62, h: 0.28 });
    }
  }
  const hoods = new Set<Opening>([openings[0], ...openings.filter((o) => o.kind === 'window' && look() < 0.35)]);
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, o.kind === 'loft' ? vent : style, rng, o.kind === 'loft' ? 0 : 0.35),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: blue, frame: { bucket: 'plaster', width: 0.18, out: 0.06, arch: rng() < 0.5 }, steps: { bucket: MUD }, leafKind: 'panel' }, y0 + o.y0),
  };
  const parapet = 0.55 + rng() * 0.3;
  // (the looks lane, 2026-10-16; WORKLIST #26 "rounded arrises, slight batter") the house body laid in a sink of its own
  // so it can be battered as a whole: its walls lean in a hand and a half over their height, their arrises rounded off in
  // a bead of mud at each corner; what stands outside it (the stair) is laid upright beside it
  const hs = new PartSink(sink.uvOffset), batter = 0.1 + look() * 0.06;
  let bodyTop = wallH + parapet + 0.2;
  hs.placed(0, cx, 0, 0, () => {
    const sink = hs;
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.2, out: 0.06, bucket: MUD }, storeys: [{ h: wallH, wall }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.05, verge: 0.05, thickness: 0.18, bucket: wall, parapet },
      gableBucket: wall, openings, chimneys: [], gutters: null, verge: null,
    }, dialect);
    // the palm-trunk hoods over the door and some windows: trunks cantilevered from the wall over the head, the mud
    // laid on them
    for (const o of hoods) {
      const f = frame.faces[o.face], y = frame.floors[0] + o.y0 + o.h + (o.kind === 'door' ? 0.28 : 0.18), n = Math.max(3, Math.round((o.w + 0.4) / 0.2)), out = o.kind === 'door' ? 0.55 : 0.32;
      for (let k = 0; k < n; k++) {
        const u = o.u - (o.w + 0.3) / 2 + (o.w + 0.3) * (k + 0.5) / n;
        // (a cylinder runs along its axis's plus: on a face looking down an axis it is laid from its far end back)
        const start = f.out[0] + f.out[2] > 0 ? facePoint(f, u, y, -0.05) : facePoint(f, u, y, out);
        sink.cylinder('structureWood', start, f.out[0] !== 0 ? 'x' : 'z', out + 0.05, 0.05, 6, { colour: shade(TIMBER, 0.85 + look() * 0.25), decor: true },
          0.045, true, look());
      }
      faceBox(sink, wall, f, o.u, y + 0.1, out / 2, o.w + 0.42, 0.1, out, { decor: true, shade: 0.92 });
    }
    // rainwater spouts: palm-wood channels through the parapet, open along their tops (a sole board and two sides)
    const b = frame.bodies[0];
    for (const x of [-W * 0.3, W * 0.3]) {
      const sp = { colour: TIMBER, decor: true, uv: UV_MEMBER } as const;
      sink.span('structureWood', x - 0.08, wallH - 0.03, b.z1 - 0.2, x + 0.08, wallH, b.z1 + 0.5, sp);
      for (const sx of [-1, 1]) sink.span('structureWood', x + sx * 0.08 - 0.015, wallH, b.z1 - 0.2, x + sx * 0.08 + 0.015, wallH + 0.09, b.z1 + 0.5, { ...sp, colour: shade(TIMBER, 0.85) });
    }
    // the stair-head room on the roof: its door to the terrace cut through its front wall, its own parapet
    if (rng() < 0.5) {
      const rw = W * 0.35, rd = D * 0.3;
      sink.placed(0, -W / 2 + 0.2 + rw / 2, wallH, -D / 2 + 0.2 + rd / 2, () => buildHouse(sink, {
        w: rw, d: rd, plinth: null, storeys: [{ h: 2.0, wall }], roof: { kind: 'flat', pitchDeg: 0, eave: 0.04, verge: 0.04, thickness: 0.15, bucket: wall, parapet: 0.25 },
        gableBucket: wall, openings: [{ face: 'front', storey: 0, kind: 'door', u: rw * 0.18, w: 0.75, y0: 0, h: 1.75 }], chimneys: [], gutters: null, verge: null, skirt: null,
      }, { window: () => {}, door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(blue, 0.85), frame: { bucket: 'plaster', width: 0.12, out: 0.04 }, steps: null, leafKind: 'plank' }, y0 + o.y0) }));
    }
    // the corners' beads: the mud worked round each arris, a quarter round a hand proud of both faces from the plinth to
    // the parapet's top (its arc meets each face's plane 0.4 m from the corner)
    bodyTop = frame.eaveY + 0.18 + parapet;
    const R = 0.28, a = R * Math.SQRT1_2, y0 = frame.floors[0] - 0.02;
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
      const th = Math.atan2(sz, sx);
      sink.cylinder(wall, [sx * (W / 2 - a), y0, sz * (D / 2 - a)], 'y', bodyTop - y0, R, 8, {}, R, true, -(th + Math.PI / 2), Math.PI);
    }
  });
  const body = hs.finish();
  batterParts(body, cx, 0, W / 2, D / 2, bodyTop, batter);
  if (stair) {
    // the mud stair up the +x side from the front corner to the roof terrace: each tread a block to the ground, the
    // low parapet stepping up its outer edge, the landing at the head beside the parapet
    // (its inner side reaching in under the battered wall, so no gap opens between them as the wall leans back)
    const x0 = cx + W / 2 + 0.02 - batter, x1 = cx + W / 2 + 0.02 + SW, headY = wallH + 0.18;
    const n = Math.max(9, Math.round(headY / 0.22)), r = headY / n, run = Math.min(0.3, (D - 1.3) / n), z0 = D / 2 - 0.2;
    for (let k = 0; k < n; k++) {
      const za = z0 - (k + 1) * run, zb = z0 - k * run, tone = 0.95 + look() * 0.1;
      sink.span(MUD, x0, -0.3, za, x1 - 0.14, (k + 1) * r, zb, { tint: [tone, tone, tone * 0.98] });
      sink.span(MUD, x1 - 0.14, -0.3, za, x1, (k + 1) * r + 0.55, zb, { decor: true, shade: 0.95 });
    }
    const zl = z0 - n * run;
    sink.span(MUD, x0, -0.3, zl - 0.9, x1, headY, zl);
    sink.span(MUD, x1 - 0.14, headY, zl - 0.9, x1, headY + 0.55, zl, { decor: true, shade: 0.95 });
  }
  const parts = sink.finish();
  for (const name of Object.keys(body) as Array<keyof RegionalParts>) parts[name].push(...body[name]);
  return parts;
};

/**
 * Batter a body's parts in place (the looks lane, 2026-10-16): every point drawn in toward the body's vertical axis at
 * (cx, cz) in proportion to its height over the foot, `inset` metres at `top` and level with the top above it (a roof
 * room stands on the battered roof); a vertex's normal turned with the wall it lies on (the map's inverse transpose).
 * hx, hz the body's half sizes at its foot: both its faces lean in by the same distance.
 */
function batterParts(parts: RegionalParts, cx: number, cz: number, hx: number, hz: number, top: number, inset: number): void {
  const kx = inset / hx, kz = inset / hz;
  for (const list of Object.values(parts)) for (const g of list) {
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), t = Math.max(0, Math.min(1, y / top)), on = y > 0 && y < top;
      const sx = 1 - kx * t, sz = 1 - kz * t;
      pos.setXYZ(i, cx + (x - cx) * sx, y, cz + (z - cz) * sz);
      if (!nor) continue;
      // J = [[sx, dx/dy, 0], [0, 1, 0], [0, dz/dy, sz]]: the normal's m solves J^T m = n
      const bx = on ? -(x - cx) * kx / top : 0, bz = on ? -(z - cz) * kz / top : 0;
      const n0 = nor.getX(i), n1 = nor.getY(i), n2 = nor.getZ(i);
      const m0 = n0 / sx, m2 = n2 / sz, m1 = n1 - bx * m0 - bz * m2, l = Math.hypot(m0, m1, m2) || 1;
      nor.setXYZ(i, m0 / l, m1 / l, m2 / l);
    }
    pos.needsUpdate = true;
    if (nor) nor.needsUpdate = true;
    g.computeBoundingBox();
  }
}

/** The square Tunisian minaret: whitewashed shaft, a gallery parapet, a lantern of arches and a little dome. */
const minaret: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const S = 2.8, H = 11.5;
  sink.span(MUD, -S / 2 - 0.25, -0.3, -S / 2 - 0.25, S / 2 + 0.25, 0.6, S / 2 + 0.25);
  sink.span('plaster', -S / 2, 0.6, -S / 2, S / 2, H, S / 2);
  sink.span('plaster', -S / 2 - 0.2, H, -S / 2 - 0.2, S / 2 + 0.2, H + 0.25, S / 2 + 0.2);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) sink.span('plaster', sx * (S / 2 + 0.1) - 0.15, H + 0.25, sz * (S / 2 + 0.1) - 0.15, sx * (S / 2 + 0.1) + 0.15, H + 1.0, sz * (S / 2 + 0.1) + 0.15);
  // (props census #5, lane B 2026-10-15) the lantern open on its four corner piers under its head (its arches were dark
  // plates on a solid block); the minaret recorded as a shaft body
  const L = S * 0.62, pw = (L - 0.7) / 2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    sink.span('plaster', sx < 0 ? -L / 2 : L / 2 - pw, H + 0.25, sz < 0 ? -L / 2 : L / 2 - pw, sx < 0 ? -L / 2 + pw : L / 2, H + 1.9, sz < 0 ? -L / 2 + pw : L / 2);
  }
  sink.span('plaster', -L / 2, H + 1.9, -L / 2, L / 2, H + 2.4, L / 2);
  recordShaft(sink, 0, 0, S, H + 3.6, 'plaster');
  sink.cylinder('plaster', [0, H + 2.4, 0], 'y', 0.6, L * 0.5, 10, {}, L * 0.42, false);
  sink.cylinder('plaster', [0, H + 3.0, 0], 'y', 0.6, L * 0.42, 10, {}, 0.05);
  // the green-tiled band under the gallery
  sink.span('structureWood', -S / 2 - 0.02, H - 0.6, -S / 2 - 0.02, S / 2 + 0.02, H - 0.3, S / 2 + 0.02, { colour: rgb(0x3f7a5a), decor: true });
  return sink.finish();
};

/**
 * The borj: a mud-plastered watch tower with a crenellated top and a timber door high in its wall. (Props census #5, lane
 * B 2026-10-15; the judges: "the buried door": its leaf stood inside the battered wall's foot, laid on nothing) a battered
 * talus round its foot; the shaft in two stages, the upper set back over a band, its walls cut: the door raised over the
 * talus with its steps up, loopholes in every face of both stages and a lookout window under the parapet; the palm-trunk
 * beam ends (toron) through the walls under the parapet, its merlons over a parapet band. The shaft is a tower body
 * (it topples in its courses).
 */
const borj: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const S = Math.max(3.2, Math.min(ctx.info.w, ctx.info.d) - 0.6), H = Math.max(7.5, ctx.info.h - 1.5);
  const t = 0.55, cut = 0.42, reveal = 0.34, mid = Math.round(H * 0.55 * 10) / 10, S2 = S - 0.4;
  // the talus, its foot sunk
  sink.cylinder(MUD, [0, -0.3, 0], 'y', 0.8 + 0.3, (S / 2 + 0.3) * Math.SQRT2, 4, {}, (S / 2 + 0.02) * Math.SQRT2, true, Math.PI / 4);
  const loop = (y: number, u = 0): HoleRect => ({ u0: u - 0.09, u1: u + 0.09, y0: y, y1: y + 0.7 });
  const door: HoleRect = { u0: -0.45, u1: 0.45, y0: t + 0.25, y1: t + 0.25 + 1.85 };
  const low = holedBox(sink, MUD, -S / 2, -S / 2, S / 2, S / 2, t, mid, {
    front: [door, loop(mid - 1.4, 0.95)], right: [loop(2.2), loop(mid - 1.2, -0.6)], back: [loop(2.8)], left: [loop(2.0, 0.5), loop(mid - 1.3)],
  }, cut, reveal);
  // the band at the setback
  sink.span(MUD, -S / 2 - 0.05, mid, -S / 2 - 0.05, S / 2 + 0.05, mid + 0.18, S / 2 + 0.05);
  const look: HoleRect = { u0: -0.3, u1: 0.3, y0: H - 1.5, y1: H - 0.65 };
  const high = holedBox(sink, MUD, -S2 / 2, -S2 / 2, S2 / 2, S2 / 2, mid + 0.18, H, {
    front: [look, loop(mid + 1.0, -0.7)], right: [loop(mid + 1.4)], back: [loop(mid + 0.9, 0.4), loop(H - 1.6, -0.4)], left: [loop(mid + 1.2)],
  }, cut - 0.06, reveal - 0.06);
  // the parapet: its band and the merlons along it, corner horns taller
  sink.span(MUD, -S2 / 2 - 0.06, H, -S2 / 2 - 0.06, S2 / 2 + 0.06, H + 0.3, S2 / 2 + 0.06);
  const e = S2 / 2 + 0.06 - 0.15;
  for (const [ax, sgn] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]] as const) {
    for (let k = -2; k <= 2; k++) {
      const c = k * e / 2, tall = Math.abs(k) === 2 ? 0.85 : 0.55;
      if (ax === 'x') sink.span(MUD, sgn * e - 0.15, H + 0.3, c - 0.2, sgn * e + 0.15, H + 0.3 + tall, c + 0.2);
      else if (Math.abs(k) < 2) sink.span(MUD, c - 0.2, H + 0.3, sgn * e - 0.15, c + 0.2, H + 0.3 + tall, sgn * e + 0.15);
    }
  }
  // the toron: palm-trunk beam ends through the upper walls under the parapet
  const beam = { colour: shade(TIMBER, 0.7), decor: true } as const;
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    for (const u of [-S2 * 0.3, 0, S2 * 0.3]) faceBox(sink, 'structureWood', high[name], u, H - 0.3, 0.2, 0.14, 0.14, 0.4, beam);
  }
  // the door at the back of its reveal (the steps up from the talus), the loopholes' dark frames
  sink.recess = reveal;
  try {
    doorUnit(sink, low.front, 0, door.y0, door.u1 - door.u0, door.y1 - door.y0, { leaf: TIMBER, frame: { bucket: 'structureWood', width: 0.1, out: 0.04, colour: shade(TIMBER, 0.8) },
      steps: null, leafKind: 'plank' }, door.y0);
  } finally { sink.recess = 0; }
  // its two steps up from the talus, inside the plot
  sink.span(MUD, -0.55, 0.2, S / 2 - 0.05, 0.55, t + 0.02, S / 2 + 0.42, { decor: true });
  sink.span(MUD, -0.55, 0.2, S / 2 - 0.05, 0.55, t + 0.25, S / 2 + 0.16, { decor: true });
  sink.recess = reveal - 0.06;
  try {
    windowUnit(sink, high.front, 0, look.y0, look.u1 - look.u0, look.y1 - look.y0, { frame: shade(TIMBER, 0.8), frameWidth: 0.05, frameOut: 0.03, bars: 'none',
      surround: null, sill: { bucket: MUD, out: 0.06 }, shutters: null }, ctx.rng, 0.15);
  } finally { sink.recess = 0; }
  recordShaft(sink, 0, 0, S, H + 1.15, MUD, true);
  return sink.finish();
};

/** A domed hammam: a whitewashed block with three domes and a tiny lantern. */
const hammam: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(7, Math.min(12, ctx.info.w - 0.6)), D = Math.max(7, Math.min(12, ctx.info.d - 0.6));
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.25, out: 0.06, bucket: MUD }, storeys: [{ h: 3.6, wall: 'plaster' }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.06, verge: 0.06, thickness: 0.2, bucket: 'plaster', parapet: 0.35 }, gableBucket: 'plaster',
    openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.2, y0: 0, h: 2.3 }], chimneys: [], gutters: null, verge: null,
  }, {
    window: () => {},
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: pick(ctx.rng, BLUES), frame: { bucket: 'plaster', width: 0.2, out: 0.06, arch: true }, steps: { bucket: MUD }, leafKind: 'panel' }, y0 + o.y0),
  });
  const top = frame.eaveY + 0.2;
  for (const [x, z, r] of [[-W * 0.22, -D * 0.15, 1.6], [W * 0.22, -D * 0.15, 1.6], [0, D * 0.18, 2.0]] as const) {
    const prof = [1.0, 0.97, 0.88, 0.7, 0.42, 0.12];
    let y = top;
    for (let k = 0; k + 1 < prof.length; k++) { sink.cylinder('plaster', [x, y, z], 'y', r * 0.24, r * prof[k], 12, {}, r * prof[k + 1], k === prof.length - 2); y += r * 0.24; }
  }
  return sink.finish();
};

/** A collapsed ghorfa range: broken vault stubs and a slump of mud rubble. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.4, ctx.info.w - 0.3), D = Math.max(6, ctx.info.d - 0.3);
  const blue = pick(rng, BLUES);
  const n = Math.max(2, Math.floor(W / 2.5));
  for (let i = 0; i < n; i++) {
    if (rng() < 0.35) continue;
    ghorfa(sink, -W / 2 + 2.5 * (i + 0.5), 0, D / 2, 2.4, 1.6 + rng() * 0.5, D * (0.4 + rng() * 0.5), rng, blue);
  }
  // (props census #7, lane B 2026-10-14; the judges: "the slump a box") the fallen vaults' mud slumped in two low
  // mounds across the range's front, the broken mud bricks of the vaults on them
  const look = ctx.variant;
  for (const [mx, mz, mr, mh] of [[-W * 0.22, -D * 0.12, Math.min(W, D) * 0.3, 0.85], [W * 0.18, -D * 0.05, Math.min(W, D) * 0.22, 0.6]] as const) {
    sink.cylinder(MUD, [mx, -0.2, mz], 'y', mh + 0.2, mr, 9, { decor: true, shadow: true }, mr * 0.4, true, look() * 3);
    for (let k = 0; k < 4; k++) {
      const a = look() * Math.PI * 2, rr = mr * (0.2 + look() * 0.5), sz = 0.22 + look() * 0.18;
      const hy = mh * (1 - (rr / mr) * (rr / mr)) * 0.9;
      sink.span(MUD, mx + Math.cos(a) * rr - sz, hy - 0.06, mz + Math.sin(a) * rr - sz * 0.7, mx + Math.cos(a) * rr + sz, hy + sz * 0.6, mz + Math.sin(a) * rr + sz * 0.7, { decor: true, shade: 0.85 });
    }
  }
  return sink.finish();
};

/**
 * A souk stall (the base market plot): a mud-plastered back wall hung with kilims, two palm-trunk posts and the beams
 * to the wall under a mat of palm ribs (jerid) that lets the sun through in stripes, the fronds hanging ragged over
 * the lane; a plastered counter of baskets of dates and spice, clay jars at its foot (the market lanes of Tataouine
 * and Medenine). The mat and the goods are dressing: shells pass through palm fronds.
 */
const soukStall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(4.5, Math.min(6.4, ctx.info.w - 0.4)), D = Math.max(3.6, Math.min(5.0, ctx.info.d - 0.4));
  stallBody(sink, ctx.variant, W, D);
  return sink.finish();
};

/** The stall itself, W x D about the origin, its counter to +z (the ksar's market plot, Siwa's shop rows). */
function stallBody(sink: PartSink, look: () => number, W: number, D: number, top = 2.55): void {
  const floor = 0.18, wallZ = -D / 2 + 0.4;
  // a beaten-earth platform skimmed with mud, the back wall of mud brick under plaster standing proud of the mat
  sink.span(MUD, -W / 2 - 0.2, -0.3, -D / 2 - 0.2, W / 2 + 0.2, floor, D / 2 + 0.2);
  sink.span(MUD, -W / 2, floor, -D / 2, W / 2, top + 0.45, wallZ);
  // palm-trunk posts at the front, a trunk beam across them, three trunk joists back to the wall
  const palm = rgb(0x6a5a46), postZ = D / 2 - 0.2;
  for (const sx of [-1, 1]) sink.cylinder('structureWood', [sx * (W / 2 - 0.2), floor, postZ], 'y', top - floor, 0.14, 7, { colour: palm, uv: UV_MEMBER }, 0.12);
  sink.member('structureWood', [-W / 2 - 0.1, top + 0.08, postZ], [W / 2 + 0.1, top + 0.08, postZ], 0.18, 0.18, [0, 1, 0], { colour: palm });
  for (const t of [-0.36, 0, 0.36]) sink.member('structureWood', [t * W, top + 0.24, wallZ - 0.1], [t * W, top + 0.24, postZ + 0.15], 0.13, 0.13, [0, 1, 0], { colour: shade(palm, 0.92) });
  // the mat's edge: a pole of bound ribs across the joists' ends, under the last ribs that ran out past them and the
  // fronds hung from those (the connectivity sweep: the mat's edge floated 2 cm off the joists)
  sink.member('structureWood', [-W / 2 - 0.1, top + 0.24, postZ + 0.2], [W / 2 + 0.1, top + 0.24, postZ + 0.2], 0.2, 0.07, [0, 1, 0], { colour: shade(palm, 0.85), decor: true, exposed: true }, 0);
  // the jerid: palm ribs laid across the joists with gaps between them, fresh tan to sun-grey
  const ribs = Math.max(12, Math.round((postZ + 0.3 - wallZ) / 0.21));
  for (let k = 0; k < ribs; k++) {
    // (2026-10-07, the map-revival lane, Oasis round 3; gauntlet wave 135: "clean white plastic slats with dangling white
    // strips") the ribs were authored as display colours in the linear vertex colour, near white on screen: weathered
    // jerid, tan going to sun-grey (sRGB ~0.58/0.50/0.39 to ~0.62/0.60/0.56), the frond tips a shade darker
    const z = wallZ + 0.05 + (postZ + 0.3 - wallZ) * (k + 0.5) / ribs, tone = look();
    const c: Rgb = [0.30 + tone * 0.045, 0.21 + tone * 0.11, 0.13 + tone * 0.15];
    sink.span('structureWood', -W / 2 - 0.2 + look() * 0.15, top + 0.31, z - 0.07, W / 2 + 0.2 - look() * 0.15, top + 0.35, z + 0.07, { colour: c, decor: true, shadow: true });
  }
  // the frond tips hanging ragged over the lane edge, leaning out, some missing
  for (let x = -W / 2 - 0.1; x < W / 2 + 0.1; x += 0.16 + look() * 0.16) {
    if (look() < 0.2) continue;
    const len = 0.2 + look() * 0.4, tone = look();
    sink.member('structureWood', [x, top + 0.33, postZ + 0.3], [x + (look() - 0.5) * 0.16, top + 0.33 - len, postZ + 0.36 + look() * 0.12],
      0.06 + look() * 0.07, 0.02, [0, 0, 1], { colour: [0.25 + tone * 0.06, 0.19 + tone * 0.08, 0.11 + tone * 0.09], decor: true, shadow: true, exposed: true });
  }
  // the counter: a plastered bench across the front, open at one end
  sink.span(MUD, -W / 2 + 0.35, floor, D / 2 - 1.05, W / 2 - 0.95, floor + 0.75, D / 2 - 0.5);
  // the kilims on the back wall: bands of madder, indigo, saffron and undyed wool
  const wall: Face = { origin: [0, 0, wallZ], u: [1, 0, 0], out: [0, 0, 1], width: W };
  const grounds: readonly Rgb[] = [0x8e2f24, 0x8e2f24, 0x2f3a5e, 0x9a5a2a].map(rgb);
  const accents: readonly Rgb[] = [0xd8ccb0, 0xc08a2a, 0x2f3a5e, 0x6e2a3a, 0x2a2522].map(rgb);
  for (const u of [-W * 0.27, W * 0.2]) {
    const rw = 1.0 + look() * 0.4, rh = 1.5 + look() * 0.4, y0 = floor + 0.55, bands = 5 + 2 * Math.floor(look() * 3);
    const ground = pick(look, grounds), unit = rh / (1.45 * (bands + 1) / 2 + 0.55 * (bands - 1) / 2);
    // wide ground bands at either end and between the narrow accent stripes
    for (let b = 0, y = y0; b < bands; b++) {
      const colour = b % 2 ? pick(look, accents) : ground, h = unit * (b % 2 ? 0.55 : 1.45);
      faceBox(sink, 'structureWood', wall, u, y + h / 2, 0.016, rw, h, 0.012, { colour, decor: true });
      y += h;
    }
  }
  // flat baskets of dates, chillies, turmeric and chickpeas on the counter; clay jars by the posts
  const basket = rgb(0xa08a5a), goods: readonly Rgb[] = [0x5a3020, 0xa83a1e, 0xc89a2a, 0xc8b080].map(rgb);
  for (let k = 0; k < 3; k++) {
    const x = -W / 2 + 0.75 + k * (W - 2.1) / 2.4;
    sink.cylinder('structureWood', [x, floor + 0.75, D / 2 - 0.78], 'y', 0.1, 0.22, 8, { colour: basket, decor: true }, 0.24);
    sink.cylinder('structureWood', [x, floor + 0.85, D / 2 - 0.78], 'y', 0.07, 0.2, 8, { colour: pick(look, goods), decor: true }, 0.1);
  }
  const clay: Rgb = rgb(0xa8673e);
  for (let k = 0, n = 2 + Math.floor(look() * 3); k < n; k++) {
    const x = (look() < 0.5 ? -1 : 1) * (W / 2 - 0.55 - look() * 0.5), z = wallZ + 0.4 + look() * 1.2, r = 0.17 + look() * 0.08;
    sink.cylinder('structureWood', [x, floor, z], 'y', r * 1.8, r * 0.7, 8, { colour: clay, decor: true }, r * 1.25);
    sink.cylinder('structureWood', [x, floor + r * 1.8, z], 'y', r * 0.9, r * 1.25, 8, { colour: shade(clay, 0.95), decor: true }, r * 0.45);
  }
}

export const KSAR_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  adobe: house,
  caravanserai: ghorfaRange,
  compound: ghorfaRange,
  compoundSouk: ghorfaRange,
  // the market row: a souk row of vaulted shop cells along the lane
  marketRow: ghorfaShops,
  minaret,
  tower: borj,
  bathhouse: hammam,
  ruin,
  // the base market plot: the generic canvas stall becomes a souk stall
  market: soukStall,
});

export const KSAR_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'ksar',
  region: 'Dahar plateau, southern Tunisia (Ouled Soltane, Hadada, Chenini): vaulted ghorfa granaries and flat-roofed houses',
  surfaces: {
    roof: { kind: 'canal', tint: [0.70, 0.52, 0.38] },
    stone: { kind: 'rubble', tint: [0.68, 0.62, 0.53] },
    sourced: { plaster: true, wood: true },
    tones: {
      plaster: (_h, s, l) => [0.11, Math.min(1, s * 0.2), Math.min(1, l * 1.3 + 0.12)],
      plaster2: (_h, s, l) => [0.09, Math.min(1, s * 0.6 + 0.18), Math.min(1, l * 1.08 + 0.06)],
      plaster3: (_h, s, l) => [0.085, Math.min(1, s * 0.7 + 0.22), Math.min(1, l * 1.02 + 0.03)],
    },
  },
  builders: KSAR_BUILDERS,
  // mud render from fresh pale clay to an older ochre house to house (Ouled Soltane's courts are both); a dry climate
  // (little damp, no moss)
  weather: {
    plaster: [[1, 1, 1], [1.04, 1.02, 0.98], [0.95, 0.9, 0.82], [0.9, 0.84, 0.74], [1.06, 1.05, 1.02]],
    stone: [[1, 1, 1], [0.94, 0.92, 0.9]],
    roof: [[1, 1, 1], [0.9, 0.86, 0.82]],
    damp: 0.25, moss: 0.05,
  },
  wear: 0.15,
  // the courtyards: mud-brick walls round each house's court (hosh), a gate (yards.ts)
  yard: { kinds: ['adobe'], fence: 'walladobe', gate: 'gateadobe', shed: null, garden: false },
});

// ---------------------------------------------------------------------------------------------------------------------
// The siwa variant (the map-revival lane, 2026-10-05). Sunscar Oasis is Siwa, in Egypt's Western Desert: the old town of
// Shali, houses of kershef (salt-crusted mud and rock) heaped up a hill in rounded, battered blocks of one to three
// storeys, their corners thickened, palm-trunk beams through the walls under the roof parapets, small windows behind
// palm-wood shutters and plank doors; the mosque's tapering mud minaret; the springs in their stone rims under palm
// shelters; the souk's stalls under palm-rib mats. It shares the ksar's mud render (MUD), timber, uv offset and its
// palm-rib stall (stallBody, and the market plot's soukStall itself); its own forms follow. Every Siwa builder sizes its
// body from the base's measured reach (ctx.bounds), so no lane opens beside it.

/** Palm-trunk wood: the posts, beams and shutters of Siwa. */
const PALM = rgb(0x6a5a46), PALM_GREY = rgb(0x8a7c68);
/** Older kershef, darker and greyer; the mosque's limewash. */
const KERSHEF_OLD: RegionalBucket = 'plaster2';

function reach(ctx: RegionalBuildContext): { W: number; D: number; cx: number; cz: number; x0: number; x1: number; z0: number; z1: number } {
  const b = ctx.bounds;
  return { W: b.maxX - b.minX, D: b.maxZ - b.minZ, cx: (b.maxX + b.minX) / 2, cz: (b.maxZ + b.minZ) / 2, x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ };
}

/**
 * A rounded rectangle x0..x1 x z0..z1 (each corner cut by two short faces on a circle of radius rc), ordered so a cap
 * through it faces up (counter-clockwise seen from above). Rings of one family (the same corner centres, the radius
 * shrunk with the inset) have parallel edges, so the quads between two of them are planar.
 */
function roundedRing(x0: number, z0: number, x1: number, z1: number, rc: number, inset: number, y: number): Array<[number, number, number]> {
  const r = Math.max(0.02, rc - inset);
  const corners: Array<[number, number, number]> = [[x0 + rc, z0 + rc, -Math.PI / 2], [x0 + rc, z1 - rc, Math.PI], [x1 - rc, z1 - rc, Math.PI / 2], [x1 - rc, z0 + rc, 0]];
  const out: Array<[number, number, number]> = [];
  // from each corner's start angle the arc turns a quarter clockwise in (x, z) (counter-clockwise seen from above)
  // (Oasis round 3, wave 135: "sharp-cornered boxes") five points to each quarter (was three)
  for (const [cx, cz, a0] of corners) for (let k = 0; k < RING_ARC; k++) {
    const a = a0 - k * Math.PI / 2 / (RING_ARC - 1);
    out.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
  }
  return out;
}

/** Quads between two rings of one family (lower, upper), facing out when the rings face up; `inward` reverses them. */
function ringBand(sink: PartSink, bucket: RegionalBucket, lower: ReadonlyArray<readonly [number, number, number]>, upper: ReadonlyArray<readonly [number, number, number]>,
  inward = false, opts: { decor?: boolean; shade?: number; tintAt?: (p: Vec3) => Rgb } = {}, skip?: ReadonlySet<number>): void {
  const n = lower.length;
  for (let k = 0; k < n; k++) {
    if (skip?.has(k)) continue;
    const j = (k + 1) % n;
    if (inward) sink.quad(bucket, lower[j], lower[k], upper[k], upper[j], opts);
    else sink.quad(bucket, lower[k], lower[j], upper[j], upper[k], opts);
  }
}

/**
 * A kershef block from y0, h high, over x0..x1 x z0..z1, as Shali's houses stand: the walls battered (leaning in as
 * they rise), the corners rounded, the parapet a slumped ring with a rounded crest round the roof terrace; small dark
 * windows high in the outer walls (a few behind palm shutters), thin palm-beam ends under the parapet, a plank door in
 * the front when `door`. One closed solid with its parapet ring: no box edges, no corner posts.
 */
type Side = 'front' | 'right' | 'back' | 'left';

/**
 * A slumped kershef mass over x0..x1 x z0..z1 from yb to top: its walls battered in by `batter` at the top, its corners
 * rounded (radius rc at the foot), a parapet ring with a bevelled crest and its inner face down to the roof. Returns
 * the straight run of each side at a height (the batter moves it in as it rises; the run keeps its length, the corner
 * radius shrinking with the inset), where the dressing stands.
 */
function slumpedMass(sink: PartSink, bucket: RegionalBucket, x0: number, z0: number, x1: number, z1: number, yb: number, top: number,
  rc: number, batter: number, ph: number, t = 0.32, holes?: Partial<Record<Side, readonly MassHole[]>>, salt?: (p: Vec3) => Rgb): (name: Side, y: number) => Face {
  const base = roundedRing(x0, z0, x1, z1, rc, 0, yb), crown = roundedRing(x0, z0, x1, z1, rc, batter, top);
  const holed = new Set<number>(), cut = (Object.keys(holes ?? {}) as Side[]).filter((n) => holes![n]!.length);
  for (const name of cut) holed.add(SIDE_SEGMENT[name]);
  ringBand(sink, bucket, base, crown, false, salt ? { tintAt: salt } : {}, holed);
  sink.polygon(bucket, crown);
  sink.polygon(bucket, [...base].reverse());
  const out1 = roundedRing(x0, z0, x1, z1, rc, batter + 0.06, top + ph), crest = roundedRing(x0, z0, x1, z1, rc, batter + 0.06 + t / 2, top + ph + 0.1);
  const in1 = roundedRing(x0, z0, x1, z1, rc, batter + 0.06 + t, top + ph), in0 = roundedRing(x0, z0, x1, z1, rc, batter + 0.06 + t, top);
  ringBand(sink, bucket, crown, out1);
  ringBand(sink, bucket, out1, crest);
  ringBand(sink, bucket, in1, crest, true);
  ringBand(sink, bucket, in0, in1, true, { shade: 0.86 });
  const sideAt = (name: Side, y: number): Face => {
    const i = batter * (y - yb) / (top - yb);
    const fx0 = x0 + rc, fx1 = x1 - rc, fz0 = z0 + rc, fz1 = z1 - rc;
    if (name === 'front') return { origin: [(fx0 + fx1) / 2, 0, z1 - i], u: [1, 0, 0], out: [0, 0, 1], width: fx1 - fx0 };
    if (name === 'back') return { origin: [(fx0 + fx1) / 2, 0, z0 + i], u: [-1, 0, 0], out: [0, 0, -1], width: fx1 - fx0 };
    if (name === 'right') return { origin: [x1 - i, 0, (fz0 + fz1) / 2], u: [0, 0, -1], out: [1, 0, 0], width: fz1 - fz0 };
    return { origin: [x0 + i, 0, (fz0 + fz1) / 2], u: [0, 0, 1], out: [-1, 0, 0], width: fz1 - fz0 };
  };
  for (const name of cut) holedSide(sink, bucket, sideAt, name, yb, top, holes![name]!, salt);
  return sideAt;
}

/** An opening cut through a slumped mass's straight side: `u` its middle along the run, `y0` its foot, w x h, its reveal
 *  `depth` into the mass (props census #26, the looks lane 2026-10-15). */
interface MassHole { u: number; y0: number; w: number; h: number; depth: number }
/** Each straight side's segment in roundedRing's ring: a corner's RING_ARC points, then the side to the next corner. */
const RING_ARC = 5;
const SIDE_SEGMENT: Readonly<Record<Side, number>> = Object.freeze({ left: RING_ARC - 1, front: 2 * RING_ARC - 1, right: 3 * RING_ARC - 1, back: 4 * RING_ARC - 1 });

/** A quad wound to face `n` (the side its normal must point to). */
function facing(sink: PartSink, bucket: RegionalBucket, q: readonly Vec3[], n: Vec3, opts: { decor?: boolean; shade?: number } = {}): void {
  const [a, b, c] = q;
  const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const o = cx * n[0] + cy * n[1] + cz * n[2] >= 0 ? q : [...q].reverse();
  sink.quad(bucket, o[0], o[1], o[2], o[3], opts);
}

/**
 * A straight side of a slumped mass with its openings cut through it: the battered wall in columns at the openings'
 * sides (each column's free heights a quad on the side's leaning plane), each opening's reveal running `depth` back into
 * the mass level — the sill up, the jambs and the head facing into it — and the dark of the room at its back.
 */
function holedSide(sink: PartSink, bucket: RegionalBucket, sideAt: (name: Side, y: number) => Face, name: Side, yb: number, top: number,
  holes: readonly MassHole[], salt?: (p: Vec3) => Rgb): void {
  const P = (u: number, y: number, o = 0): Vec3 => facePoint(sideAt(name, y), u, y, o);
  const W = sideAt(name, yb).width, out = sideAt(name, yb).out, uAx = sideAt(name, yb).u;
  const us = [...new Set([-W / 2, W / 2, ...holes.flatMap((h) => [h.u - h.w / 2, h.u + h.w / 2])])].filter((u) => u >= -W / 2 - 1e-6 && u <= W / 2 + 1e-6).sort((a, b) => a - b);
  for (let i = 0; i + 1 < us.length; i++) {
    const ua = us[i], ub = us[i + 1];
    if (ub - ua < 1e-4) continue;
    const um = (ua + ub) / 2;
    let free: Array<[number, number]> = [[yb, top]];
    for (const h of holes) {
      if (um <= h.u - h.w / 2 || um >= h.u + h.w / 2) continue;
      free = free.flatMap(([a, b]): Array<[number, number]> => (h.y0 + h.h <= a || h.y0 >= b ? [[a, b]] : [...(h.y0 > a ? [[a, h.y0] as [number, number]] : []), ...(h.y0 + h.h < b ? [[h.y0 + h.h, b] as [number, number]] : [])]));
    }
    for (const [a, b] of free) if (b - a > 1e-4) sink.quad(bucket, P(ua, a), P(ub, a), P(ub, b), P(ua, b), salt ? { tintAt: salt } : {});
  }
  for (const h of holes) {
    const u0 = h.u - h.w / 2, u1 = h.u + h.w / 2, y0 = h.y0, y1 = h.y0 + h.h, d = -h.depth;
    const A = P(u0, y0), B = P(u1, y0), C = P(u1, y1), D = P(u0, y1);
    const back = (q: Vec3): Vec3 => [q[0] + out[0] * d, q[1], q[2] + out[2] * d];
    facing(sink, bucket, [A, B, back(B), back(A)], [0, 1, 0], { shade: 0.86 });
    facing(sink, bucket, [D, C, back(C), back(D)], [0, -1, 0], { shade: 0.6 });
    facing(sink, bucket, [A, D, back(D), back(A)], uAx, { shade: 0.7 });
    facing(sink, bucket, [B, C, back(C), back(B)], [-uAx[0], -uAx[1], -uAx[2]], { shade: 0.7 });
    facing(sink, 'dark', [back(A), back(B), back(C), back(D)], out, { decor: true });
  }
}

function kershefBlock(sink: PartSink, x0: number, z0: number, x1: number, z1: number, y0: number, h: number, bucket: RegionalBucket,
  rng: () => number, look: () => number, opts: { door?: boolean; faces?: ReadonlyArray<Side> } = {}): void {
  const yb = y0 > 0 ? y0 : -0.3, top = y0 + h;
  // (Oasis round 3, wave 135: "sharp-cornered boxes ... nothing like Shali's slumped, rounded grey-beige salt-mud
  // masses") the walls battered half again as much and the corners rounded to a fifth of the block (was 0.055 of the
  // height and 0.14 of the block, at most 0.9 m)
  const batter = Math.min(0.45, 0.08 * (top - yb)) * (0.8 + look() * 0.4);
  const rc = Math.max(batter + 0.3, Math.min(1.7, Math.min(x1 - x0, z1 - z0) * 0.21));
  const ph = 0.45 + look() * 0.2;
  // (the looks lane, 2026-10-15; WORKLIST #26 "Siwa kershef compounds with cut windows"; the r2 probe read every window
  // as a dark plate on a mud frame) the openings first, then the mass with them cut through its sides: each small window
  // a hole through the kershef 34 cm deep, its palm-wood frame at the back of the reveal, some behind a palm shutter,
  // some under a palm-log lintel; the door cut into the front with its plank leaf at the back of its reveal
  const runs: Record<Side, number> = { front: x1 - x0 - 2 * rc, back: x1 - x0 - 2 * rc, right: z1 - z0 - 2 * rc, left: z1 - z0 - 2 * rc };
  const faces = opts.faces ?? ['front', 'right', 'back', 'left'] as const;
  const holes: Partial<Record<Side, MassHole[]>> = {};
  const units: Array<{ name: Side; hole: MassHole; dress: number; tone: Rgb }> = [];
  const DEPTH = 0.34;
  for (const name of faces) {
    const width = runs[name], list: MassHole[] = (holes[name] = []);
    const storeys = Math.max(1, Math.round(h / 3.0));
    for (let st = 0; st < storeys; st++) {
      const wy = y0 + st * 3.0 + 1.5;
      if (wy + 0.6 > top - 0.4) continue;
      const m = width > 4.5 ? 2 : 1;
      for (let k = 0; k < m; k++) {
        if (rng() < 0.3) continue;
        const u = m === 1 ? (rng() - 0.5) * width * 0.4 : (k === 0 ? -1 : 1) * width * (0.16 + rng() * 0.14);
        const w = 0.32 + look() * 0.16, hh = 0.42 + look() * 0.2;
        if (Math.abs(u) + w / 2 > width / 2 - 0.15) continue;
        const hole = { u, y0: wy, w, h: hh, depth: DEPTH };
        list.push(hole);
        units.push({ name, hole, dress: look(), tone: look() < 0.5 ? PALM : PALM_GREY });
      }
    }
  }
  let door: MassHole | null = null;
  if (opts.door && y0 === 0) {
    const du = (rng() - 0.5) * Math.max(0, runs.front - 2.4) * 0.6;
    door = { u: du, y0: 0, w: 0.95, h: 1.95, depth: DEPTH + 0.06 };
    const list = (holes.front ??= []);
    // (a window over the door's place gives way to it)
    for (let i = list.length - 1; i >= 0; i--) if (Math.abs(list[i].u - du) < (list[i].w + 0.95) / 2 + 0.15 && list[i].y0 < 2.3) {
      const gone = list.splice(i, 1)[0];
      const j = units.findIndex((x) => x.hole === gone);
      if (j >= 0) units.splice(j, 1);
    }
    list.push(door);
  }
  // (WORKLIST #26 "salt bands") the salt the ground draws up the kershef: a pale crust at the wall's foot fading up it
  const salt = (p: Vec3): Rgb => { const k = Math.max(0, Math.min(1, (p[1] - Math.max(0, yb)) / 1.1)); const t = 1.1 - 0.1 * k; return [t, t, t * 0.99]; };
  const sideAt = slumpedMass(sink, bucket, x0, z0, x1, z1, yb, top, rc, batter, ph, 0.32, holes, y0 === 0 ? salt : undefined);
  // the kershef's lumps: the salt-rock in the mud standing proud of the render here and there (a few to a side)
  for (const name of faces) {
    const n = 2 + Math.floor(look() * 3);
    for (let k = 0; k < n; k++) {
      const yy = y0 + 0.3 + look() * (h - 0.9), f = sideAt(name, yy), u = (look() - 0.5) * (f.width - 0.6), sz = 0.12 + look() * 0.12;
      if ((holes[name] ?? []).some((q) => Math.abs(q.u - u) < q.w / 2 + sz && yy > q.y0 - sz && yy < q.y0 + q.h + sz)) continue;
      faceBox(sink, bucket, f, u, yy, 0.02, sz * 1.4, sz, 0.05, { decor: true, shade: 0.9 + look() * 0.15 });
    }
  }
  for (const name of faces) {
    // the palm-beam ends through the wall under the parapet: thin, a few to a side, not every one
    const fb = sideAt(name, top - 0.25), n = Math.max(1, Math.floor(fb.width / 1.2));
    for (let k = 0; k < n; k++) {
      if (look() < 0.35) continue;
      const u = -fb.width / 2 + (k + 0.5) * fb.width / n + (look() - 0.5) * 0.3;
      // (Oasis round 3, wave 135: "its beam ends are neat rectangular planks rather than round palm trunks") a palm
      // trunk's round end standing out of the wall
      const end = 0.07 + look() * 0.03, outward = fb.out[0] + fb.out[2] > 0, p = facePoint(fb, u, top - 0.25, outward ? -0.05 : 0.25);
      sink.cylinder('structureWood', p, fb.out[0] !== 0 ? 'x' : 'z', 0.3, end, 7, { colour: shade(PALM, 0.8 + look() * 0.3), decor: true }, end * 0.9, true);
    }
  }
  for (const { name, hole, dress, tone } of units) {
    const f = sideAt(name, hole.y0 + hole.h / 2), cy = hole.y0 + hole.h / 2, back = -hole.depth + 0.03;
    const pc = { colour: shade(tone, 0.85), decor: true, uv: UV_MEMBER } as const;
    // the palm-wood frame at the back of the reveal: its two posts and the head and sill pieces
    for (const sx of [-1, 1]) faceBox(sink, 'structureWood', f, hole.u + sx * (hole.w / 2 - 0.03), cy, back, 0.06, hole.h, 0.05, pc, 'caps');
    for (const sy of [-1, 1]) faceBox(sink, 'structureWood', f, hole.u, cy + sy * (hole.h / 2 - 0.03), back, hole.w - 0.12, 0.06, 0.05, pc, 'ends');
    if (dress < 0.3) {
      // a palm-plank shutter closed in the frame
      for (let k = 0; k < 3; k++) faceBox(sink, 'structureWood', f, hole.u - hole.w / 2 + 0.06 + (hole.w - 0.12) * (k + 0.5) / 3, cy, back + 0.035, (hole.w - 0.12) / 3 - 0.008, hole.h - 0.12, 0.025,
        { colour: shade(tone, 0.95 + k * 0.04), decor: true, uv: UV_MEMBER });
    } else {
      // two palm-rib bars across the opening
      for (const t of [-0.17, 0.17]) faceBox(sink, 'structureWood', f, hole.u + t * hole.w, cy, back + 0.02, 0.03, hole.h - 0.1, 0.03, { colour: tone, decor: true, fine: true }, 'caps');
    }
    // a palm-log lintel over some, bedded in the face
    if (dress > 0.55) palmLog(sink, f, hole.u - hole.w / 2 - 0.18, hole.u + hole.w / 2 + 0.18, hole.y0 + hole.h + 0.07, 0.065, shade(PALM, 0.8));
  }
  if (door) {
    const f = sideAt('front', 1.0);
    sink.recess = door.depth;
    try {
      doorUnit(sink, f, door.u, 0, door.w, door.h, { leaf: PALM, frame: { bucket: 'structureWood', width: 0.1, out: 0.04, colour: shade(PALM, 0.8) }, steps: null, leafKind: 'plank' });
    } finally { sink.recess = 0; }
    palmLog(sink, f, door.u - door.w / 2 - 0.25, door.u + door.w / 2 + 0.25, door.h + 0.09, 0.08, shade(PALM, 0.75));
  }
}

/** A palm log lying along a face from u0 to u1 at y, bedded half into it (a lintel). */
function palmLog(sink: PartSink, f: Face, u0: number, u1: number, y: number, r: number, colour: Rgb): void {
  const a = facePoint(f, u0, y, 0), b = facePoint(f, u1, y, 0), alongX = Math.abs(f.u[0]) > 0.5;
  const start = alongX ? (a[0] < b[0] ? a : b) : (a[2] < b[2] ? a : b);
  sink.cylinder('structureWood', start, alongX ? 'x' : 'z', Math.abs(u1 - u0), r, 6, { colour, decor: true });
}

/** A Siwan house (an adobe plot): a kershef block filling the plot, a door to the lane, often an upper room at the back. */
const kershefHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  const x0 = R.x0 + 0.25, x1 = R.x1 - 0.25, z0 = R.z0 + 0.25, z1 = R.z1 - 0.25, h = 3.1 + rng() * 0.5;
  kershefBlock(sink, x0, z0, x1, z1, 0, h, rng() < 0.3 ? KERSHEF_OLD : MUD, rng, look, { door: true });
  if (rng() < 0.55) {
    const ux1 = x0 + (x1 - x0) * (0.5 + rng() * 0.2), uz1 = z0 + (z1 - z0) * (0.45 + rng() * 0.15);
    kershefBlock(sink, x0 + 0.45, z0 + 0.45, ux1, uz1, h, 2.6, MUD, rng, look, { faces: ['front', 'right'] });
  }
  return sink.finish();
};

/**
 * Old Shali (a caravanserai or compound plot): the town's houses heaped together, a block to each cell of the plot,
 * packed against each other (their battered walls lean apart into narrow clefts as they rise), lower at the edges and
 * highest in the middle, a room set back on some roofs; the outer faces on the plot's edge, doors to the front lane.
 */
const shaliCluster: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  const nx = R.W > 15 ? 3 : 2, nz = R.D > 13 ? 3 : 2;
  const cw = R.W / nx, cd = R.D / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    // each cell's block reaches 0.1 m past its inner boundaries (the neighbours' feet meet), 0.25 m in from the plot's edge
    const x0 = R.x0 + i * cw + (i === 0 ? 0.25 : -0.1), x1 = R.x0 + (i + 1) * cw - (i === nx - 1 ? 0.25 : -0.1);
    const z0 = R.z0 + j * cd + (j === 0 ? 0.25 : -0.1), z1 = R.z0 + (j + 1) * cd - (j === nz - 1 ? 0.25 : -0.1);
    const edges = (i === 0 ? 1 : 0) + (i === nx - 1 ? 1 : 0) + (j === 0 ? 1 : 0) + (j === nz - 1 ? 1 : 0);
    const storeys = edges >= 2 ? 1 + Math.floor(rng() * 2) : edges === 1 ? 2 : (rng() < 0.3 ? 4 : 3);
    const h = 2.9 * storeys + rng() * 0.5;
    const outer: Array<'front' | 'right' | 'back' | 'left'> = [];
    if (j === nz - 1) outer.push('front');
    if (i === nx - 1) outer.push('right');
    if (j === 0) outer.push('back');
    if (i === 0) outer.push('left');
    const bucket = rng() < 0.35 ? KERSHEF_OLD : MUD;
    kershefBlock(sink, x0, z0, x1, z1, 0, h, bucket, rng, look, { door: j === nz - 1, faces: outer.length ? outer : ['front'] });
    // a room set back on the roof terrace of some blocks
    if (storeys >= 2 && rng() < 0.45) {
      const ux0 = x0 + (x1 - x0) * (0.18 + rng() * 0.12), uz0 = z0 + (z1 - z0) * (0.18 + rng() * 0.12);
      const ux1 = ux0 + (x1 - x0) * (0.4 + rng() * 0.15), uz1 = uz0 + (z1 - z0) * (0.4 + rng() * 0.15);
      kershefBlock(sink, ux0, uz0, Math.min(x1 - 0.6, ux1), Math.min(z1 - 0.6, uz1), h, 2.4, MUD, rng, look, { faces: outer.length ? outer : ['front'] });
    }
  }
  return sink.finish();
};

/**
 * A square mud tower over S x S tapering to its top: the Shali mosque's minaret (a flat parapet head, a gallery of palm
 * beams and slit openings near the top) or a watch tower with its door high in the wall. Kershef the
 * colour of the town (no limewash, no cap of another colour: a tall pale taper with a coloured top reads as a lighthouse).
 */
/**
 * A slit or a small window in a mud wall (props census #5, lane B 2026-10-15: they were dark plates on a thin raised
 * frame): its dark in the wall's plane and the thick mud surround round it standing 16 cm proud, so the dark is the back
 * of a reveal. (u, y) its centre, w x h the dark.
 */
function slitIn(sink: PartSink, f: Face, u: number, y: number, w: number, h: number): void {
  // (the wall leans back as it rises: the dark stands 4.5 cm off the face's plane so none of it sinks into the batter
  // below, the surround 24 cm deep round it)
  const t = 0.08, o = { decor: true, shade: 0.8 } as const;
  faceBox(sink, 'dark', f, u, y, 0.045, w + 0.02, h + 0.02, 0.008, { decor: true });
  for (const s of [-1, 1]) faceBox(sink, MUD, f, u + s * (w / 2 + t / 2), y, 0.12, t, h + 2 * t, 0.24, o);
  for (const s of [-1, 1]) faceBox(sink, MUD, f, u, y + s * (h / 2 + t / 2), 0.12, w, t, 0.24, o, 'ends');
}

function mudTower(sink: PartSink, S: number, H: number, rng: () => number, minaret: boolean): void {
  // (round 2, the gauntlet's wave 125: "a straight-sided, crenellated castle keep") the tower is battered to its head —
  // two fifths in on a minaret, three tenths on a watch tower — its arrises rounded, a flat parapet head with a
  // bevelled crest, not merlons
  const a0 = S * 0.5, batter = a0 * (minaret ? 0.4 : 0.3), rc = batter + a0 * 0.14;
  const sideAt = slumpedMass(sink, MUD, -a0, -a0, a0, a0, -0.3, H, rc, batter, minaret ? 0.7 : 0.55, 0.26);
  const sides: Side[] = ['front', 'right', 'back', 'left'];
  if (minaret) {
    // the gallery's palm beams and the slit openings under the head, on all four faces
    for (const name of sides) {
      const f = sideAt(name, H - 1.6);
      for (const u of [-0.32, 0.32]) slitIn(sink, f, u * f.width, H - 2.1 + 0.37, 0.2, 0.74);
      const g = sideAt(name, H - 0.75);
      for (let k = -2; k <= 2; k++) faceBox(sink, 'structureWood', g, k * g.width / 5.5, H - 0.75, 0.1, 0.11, 0.11, 0.22, { colour: PALM, decor: true, uv: UV_MEMBER });
    }
  } else {
    // the watch tower's door, high in its front wall, and a beam over it
    const f = sideAt('front', H * 0.35);
    // (the frame 22 cm proud: the leaf at the back of its reveal, not laid on the wall)
    doorUnit(sink, f, 0, H * 0.3, 0.8, 1.6, { leaf: PALM, frame: { bucket: MUD, width: 0.2, out: 0.22 }, steps: null, leafKind: 'plank' });
    faceBox(sink, 'structureWood', f, 0, H * 0.3 + 1.75, 0.14, 1.2, 0.12, 0.28, { colour: PALM, decor: true, uv: UV_MEMBER });
    if (rng() < 0.5) for (const name of sides) {
      const g = sideAt(name, H * 0.7);
      slitIn(sink, g, 0, H * 0.68 + 0.25, 0.3, 0.5);
    }
  }
}

/** The Shali mosque's minaret (a minaret plot): the square mud tower tapering to its crenellated top. */
const shaliMinaret: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const R = reach(ctx);
  const S = Math.max(2.6, Math.min(R.W, R.D) - 0.2);
  const H = Math.max(11, Math.min(15, ctx.info.h - 0.5));
  // (props census #5) the minaret recorded as a shaft body (it topples in its courses)
  sink.placed(0, R.cx, 0, R.cz, () => { mudTower(sink, S, H, ctx.rng, true); recordShaft(sink, 0, 0, S, H, MUD); });
  return sink.finish();
};

/** A kershef watch tower (a tower plot): the square mud tower with its door high up. */
const siwaTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const R = reach(ctx);
  const S = Math.max(3.0, Math.min(R.W, R.D) - 0.2);
  const H = Math.max(7.5, ctx.info.h - 1.5);
  sink.placed(0, R.cx, 0, R.cz, () => { mudTower(sink, S, H, ctx.rng, false); recordShaft(sink, 0, 0, S, H, MUD); });
  return sink.finish();
};

/**
 * A spring (a bath house plot), Siwa's Ain Juba (Cleopatra's Spring) and its like: the round pool in its rim of dressed
 * stone, clear water over the spring's pale sand, steps down; the café's low kershef wall and a palm-rib shelter on its
 * posts on the plot's long side.
 */
const ainSpring: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  const r = Math.max(2.4, Math.min(R.W, R.D) / 2 - 0.35);
  const along = R.W >= R.D;
  const px = along ? R.x0 + 0.3 + r : R.cx, pz = along ? R.cz : R.z0 + 0.3 + r;
  const n = 20;
  // (Oasis round 3, wave 135: "the grey cut-stone block ... reads as modern masonry") the rim is the spring's old mud
  // kerb, plastered and worn round, not dressed grey stone
  for (let k = 0; k < n; k++) {
    const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
    sink.member(KERSHEF_OLD, [px + Math.cos(a0) * r, 0.3, pz + Math.sin(a0) * r], [px + Math.cos(a1) * r, 0.3, pz + Math.sin(a1) * r], 0.8, 0.55,
      [Math.cos(am), 0, Math.sin(am)], { exposed: true }, 0);
  }
  // (the buildings stream, 2026-10-12, the integrity check: the water stood 22 cm in from the ring wall, a slot of bare
  // ground round it, and the steps hung over it short of the wall) the water meets the wall's inner face; the steps run
  // from the wall down into it, each tread over the one below
  sink.cylinder('glass', [px, 0.22, pz], 'y', 0.02, r + 0.02, 24, { decor: true });
  for (let k = 0; k < 3; k++) sink.span(KERSHEF_OLD, px - 0.8, 0.5 - k * 0.2, pz + r - 0.5 - k * 0.35, px + 0.8, 0.62 - k * 0.2, pz + r + 0.05, { decor: true });
  // the rest of the plot: the café's low wall along the far edge and the palm-rib shelter by the pool
  const rest = along ? R.x1 - (px + r + 0.25) : R.z1 - (pz + r + 0.25);
  if (rest > 0.45) {
    if (along) sink.span(MUD, R.x1 - 0.5, -0.3, R.z0 + 0.3, R.x1 - 0.2, 0.9, R.z1 - 0.3);
    else sink.span(MUD, R.x0 + 0.3, -0.3, R.z1 - 0.5, R.x1 - 0.3, 0.9, R.z1 - 0.2);
  }
  if (rest > 3.4) {
    const sw = Math.min(5.5, rest - 0.6), sd = Math.min(4.6, (along ? R.D : R.W) - 0.6);
    if (along) sink.placed(-Math.PI / 2, R.x1 - 0.55 - sw / 2, 0, R.cz, () => stallBody(sink, look, sd, sw));
    else sink.placed(Math.PI, R.cx, 0, R.z1 - 0.55 - sw / 2, () => stallBody(sink, look, sd, sw));
  }
  void rng;
  return sink.finish();
};

/** The souk's shop row (a market row plot): palm-rib stalls side by side along the plot. */
const siwaShops: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const R = reach(ctx);
  const n = Math.max(1, Math.round(R.W / 5.2)), w = R.W / n - 0.2, d = Math.max(3.6, R.D - 0.6);
  // the back wall (0.45 m over the mat's beam) no higher than the market row it replaces: Oasis's east zone stands on an
  // apron above the row, and the objective search counts a solid reaching within half a metre of a zone's floor
  const top = Math.max(2.0, Math.min(2.55, ctx.bounds.maxY - 0.45));
  for (let k = 0; k < n; k++) sink.placed(0, R.x0 + (k + 0.5) * R.W / n, 0, R.cz, () => stallBody(sink, look, w, d, top));
  // (the maps lane, 2026-10-15, Sunscar's blind critics: the rows' backs read as "long blank concrete noise barriers — no
  // openings, buttresses or erosion") the back wall as Siwa's mud walls stand: battered mud buttresses at the stalls'
  // party walls and the row's ends, each stall's plank back door under a palm-trunk lintel or a shuttered hatch, and the
  // wall's top worn into rounded lumps. Drawn after the stalls (their draws are as before); the buttresses stand no
  // higher than the wall, which the zone apron above the row allows.
  const zb = R.cz - d / 2, wallTop = top + 0.45;
  for (let k = 0; k <= n; k++) {
    const x = R.x0 + k * R.W / n;
    sink.span(MUD, x - 0.38, -0.3, zb - 0.55, x + 0.38, 1.1 + look() * 0.3, zb + 0.02);
    sink.span(MUD, x - 0.26, 1.0, zb - 0.32, x + 0.26, wallTop - 0.25 - look() * 0.4, zb + 0.02);
  }
  for (let k = 0; k < n; k++) {
    const cx = R.x0 + (k + 0.5) * R.W / n;
    const back: Face = { origin: [cx, 0, zb], u: [-1, 0, 0], out: [0, 0, -1], width: w };
    const u = (look() - 0.5) * (w - 2.0);
    if (look() < 0.6) {
      faceBox(sink, 'structureWood', back, u, 0.18 + 0.95, 0.03, 0.82, 1.9, 0.06, { colour: look() < 0.5 ? PALM : PALM_GREY, decor: true, uv: UV_MEMBER });
      sink.cylinder('structureWood', facePoint(back, u + 0.65, 2.2, 0.08), 'x', 1.3, 0.08, 7, { colour: shade(PALM, 0.85), decor: true }, 0.07, true);
    } else {
      faceBox(sink, 'structureWood', back, u, 1.75, 0.03, 0.6, 0.55, 0.05, { colour: PALM_GREY, decor: true, uv: UV_MEMBER });
    }
    // the worn top: two or three rounded lumps of the wall's mud along its crest
    for (let j = 0, m = 2 + Math.floor(look() * 2); j < m; j++) {
      const x = cx + (look() - 0.5) * (w - 0.6);
      sink.cylinder(MUD, [x, wallTop - 0.05, zb + 0.2], 'y', 0.18 + look() * 0.12, 0.32 + look() * 0.18, 7, { decor: true }, 0.1, true, look());
    }
  }
  return sink.finish();
};

/** A melted house of old Shali (a ruin plot): the kershef walls slumped to rounded stubs, the roof's rubble inside. */
const shaliRuin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  const W = R.x1 - R.x0 - 0.5, D = R.z1 - R.z0 - 0.5;
  // (props census #7, lane B 2026-10-14; the judges: "span slices to random tops under cones") the ruin grammar: the
  // kershef house's own walls slumped to heads the rain has rounded, its door and small windows cut through where they
  // stand, the palm-trunk roof and its mud fallen in over the heaps
  sink.placed(0, (R.x0 + R.x1) / 2, 0, (R.z0 + R.z1) / 2, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * Math.max(0, W - 2.2), w: 0.9, y0: 0, h: 1.8 }];
    for (const face of ['right', 'left'] as const) openings.push({ face, storey: 0, kind: 'window', u: (rng() - 0.5) * 1.4, w: 0.45, y0: 1.2, h: 0.55 });
    const head = (): RuinHead => ({ a: 0.7 + rng() * 2.4, b: 0.7 + rng() * 2.4, at: rng(), dip: 0.3 + rng() * 0.4, ragged: 0.2 });
    const r = ruinHouse(sink, {
      w: W, d: D, t: 0.45, wall: MUD, plinth: null, floor: 0.1, storeys: [2.6, 2.2], openings,
      heads: { front: head(), right: head(), back: head(), left: head() }, stub: 0.6,
      lintel: { bucket: 'structureWood', colour: PALM }, roof: { bucket: MUD, piece: [0.9, 0.7, 0.1] }, timber: shade(PALM, 0.55), mobile: ctx.tier === 'mobile',
    }, rng, look);
    // the rain-rounded heads: the slumped mud along each wall's top, a lip running the strip (dressing; spaced lumps read
    // as battlements)
    sink.dressing(ctx.tier === 'mobile', () => {
      for (const name of ['front', 'right', 'back', 'left'] as const) {
        const f = r.faces[name], tp = r.tops[name], n = tp.length - 1;
        for (let k = 0; k < n; k++) {
          const u0 = -f.width / 2 + (f.width * k) / n, u1 = -f.width / 2 + (f.width * (k + 1)) / n;
          sink.member(MUD, facePoint(f, u0, tp[k] - 0.06, -0.225), facePoint(f, u1, tp[k + 1] - 0.06, -0.225), 0.5, 0.14, [0, 1, 0], { decor: true, exposed: true }, 0);
        }
      }
    });
  });
  return sink.finish();
};

export const SIWA_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  adobe: kershefHouse,
  caravanserai: shaliCluster,
  compound: shaliCluster,
  compoundSouk: shaliCluster,
  marketRow: siwaShops,
  minaret: shaliMinaret,
  tower: siwaTower,
  bathhouse: ainSpring,
  ruin: shaliRuin,
  // the market plot: the ksar's palm-rib stall, shared
  market: soukStall,
});

export const SIWA_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'siwa',
  region: 'Siwa, Egypt\'s Western Desert: the kershef houses of old Shali heaped on their hill, palm-trunk beams, the tapering mud minaret, the springs in their stone rims, the souk under palm-rib mats',
  surfaces: {
    roof: { kind: 'canal', tint: [0.66, 0.6, 0.52] },
    stone: { kind: 'rubble', tint: [0.7, 0.66, 0.58] },
    // (the kershef is the render canvas, toned: the plaster photo set read as speckled grey granite on the walls, h4)
    sourced: { plaster: false, wood: true },
    // (Oasis round 3, wave 135: "an over-strong, uniform wormy normal pattern that reads as cottage cheese or popcorn
    // ceiling rather than lumpy salt mud") the kershef's render relief at three eighths of the canvas's
    plasterRelief: 0.45,
    // (the facades lane, round 11; waves 319/320: the walls' procedural canvas read as "speckle", "sponge", "cork",
    // "camouflage noise": its 6 cm bumps shade as dots from the street, as Steinburg's did before round 8) the walls
    // painted as the region renders them (regionalSurfaces.ts paintLimeRender), every family under the kit's and the map's
    // tones
    render: { kind: 'limeRender', seed: 0x5d17 },
    tones: {
      // kershef: the salt-crusted mud's warm grey-beige; the older walls darker; limewash
      // (round 2, the gauntlet's wave 125: "kershef tiling noise" — the canvas's lumps at their full contrast read as a
      // dark speckle tiled over every wall; the salt mud keeps half of it, a shade warmer)
      // (Oasis round 3, wave 135: "a uniform pinkish stucco noise", "pink-cream") the salt mud greyer and less pink: a
      // grey-beige a step lighter (was hue 0.084, saturation x0.3 + 0.12)
      // (the maps lane, 2026-10-15, Sunscar's blind critics: "grey-lavender ... the kershef needs warm ochre-tan") the salt
      // mud a warm tan, its old walls a shade browner (was saturation x0.18 + 0.07 and x0.16 + 0.06 at hue 0.1 and 0.095)
      plaster: (_h, s, l) => [0.088, Math.min(1, s * 0.2 + 0.24), Math.min(1, l * 0.46 + 0.36)],
      plaster2: (_h, s, l) => [0.082, Math.min(1, s * 0.18 + 0.22), Math.min(1, l * 0.44 + 0.3)],
      plaster3: (_h, s, l) => [0.11, Math.min(1, s * 0.12), Math.min(1, l * 1.3 + 0.16)],
    },
  },
  builders: SIWA_BUILDERS,
  // a hyper-arid oasis: no moss; the salt draws a pale crust up the wall foot rather than a damp stain
  weather: {
    plaster: [[1, 1, 1], [1.05, 1.04, 1.02], [0.94, 0.92, 0.88], [0.9, 0.87, 0.82], [1.08, 1.07, 1.05]],
    stone: [[1, 1, 1], [0.95, 0.94, 0.92]],
    roof: [[1, 1, 1], [0.9, 0.87, 0.83]],
    damp: 0.12, moss: 0,
  },
  wear: 0.2,
  // the courtyards: palm-rib (jerid) fences round each house's court (yards.ts; round 2, wave 125: the generic adobe wall
  // read as "salmon-pink stucco with fired-brick coping")
  yard: { kinds: ['adobe'], fence: 'fencewattle', gate: null, shed: null, garden: false },
});
