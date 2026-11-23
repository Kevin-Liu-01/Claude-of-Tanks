// src/world/maps/regional/ksar.ts — the ksar kit (Sirocco Wadi: the Dahar ksour of southern Tunisia — Ouled Soltane,
// Hadada, Chenini). The fortified granary: ghorfas, barrel-vaulted cells of rubble under mud plaster, stacked two and
// three high round a court, their rounded ends in rows with small timber doors, hoisting beams and steep stairs up the
// fronts; flat-roofed village houses rendered in ochre or whitewash with Tunisian blue doors and window grilles, a stair
// block to the roof terrace and a parapet; a whitewashed mosque with a squat square minaret; the borj, a tapering
// watch tower; a domed hammam.
import * as THREE from 'three';
import { PartSink, bodyFaces, faceBox, facePoint, pick, rgb, shade, UV_MEMBER, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { finialOn, glassBosses, roundDrum, smoothDome } from './domes.ts';
import { buildHouse, holedBox, holedPolygon, leanTo, recordShaft, roofGeometry, windowRhythm, withHousePlans, type HoleRect, type HouseDialect, type HouseFrame, type Opening } from './house.ts';
import { paintBand } from './facade.ts';
import { bench, pottedPlant } from './dressing.ts';
import { roundBody, type BodyBox } from './roundedBody.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { ringSolid } from './millWorks.ts';
import { ksarGhorfaSouk, souqStall } from './souqs.ts'; // props #23: the ghorfa souk and the souk stall

const BLUES: readonly Rgb[] = [0x2f6a9e, 0x3a7ab0, 0x2e5f8a].map(rgb);
const TIMBER = rgb(0x7a6048), BRASS = rgb(0xa8843c);
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
  // (props census #23, the looks lane 2026-10-15) the souk's cells member-built in souqs.ts
  const sink = ksarGhorfaSouk(ctx, { blues: BLUES, timber: TIMBER, mud: MUD });
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
 * hx, hz the body's half sizes at its foot: both its faces lean in by the same distance. `y0` the foot (a room on a
 * roof stands on its own foot).
 */
function batterParts(parts: RegionalParts, cx: number, cz: number, hx: number, hz: number, top: number, inset: number, y0 = 0): void {
  const kx = inset / hx, kz = inset / hz, span = top - y0;
  for (const list of Object.values(parts)) for (const g of list) {
    // (the CPU gate, facade.selftest: the wall-foot apron moved off the ground it was draped on) what the house laid on
    // the ground (its apron and door paths: userData.onGround) stays where it lies
    if (g.userData?.onGround) continue;
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), t = Math.max(0, Math.min(1, (y - y0) / span)), on = y > y0 && y < top;
      const sx = 1 - kx * t, sz = 1 - kz * t;
      pos.setXYZ(i, cx + (x - cx) * sx, y, cz + (z - cz) * sz);
      if (!nor) continue;
      // J = [[sx, dx/dy, 0], [0, 1, 0], [0, dz/dy, sz]]: the normal's m solves J^T m = n
      const bx = on ? -(x - cx) * kx / span : 0, bz = on ? -(z - cz) * kz / span : 0;
      const n0 = nor.getX(i), n1 = nor.getY(i), n2 = nor.getZ(i);
      const m0 = n0 / sx, m2 = n2 / sz, m1 = n1 - bx * m0 - bz * m2, l = Math.hypot(m0, m1, m2) || 1;
      nor.setXYZ(i, m0 / l, m1 / l, m2 / l);
    }
    pos.needsUpdate = true;
    if (nor) nor.needsUpdate = true;
    g.computeBoundingBox();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Face-frame parts for the hammam and the minaret (dome-detail-275): relief laid on a body's faces in the face's own
// (u, y, out) frame, which bodyFaces keeps right-handed (u x up = out) on every side.

/** A box between two corners given in a face's frame (u, y, out): an axis-aligned face's span (dome-detail-275). */
function faceSpan(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, u1: number, y0: number, y1: number, o0: number, o1: number,
  opts: EmitOptions = {}): void {
  // relief seated on the face (from its plane out) leaves out the back it lays against
  if (Math.abs(o0) < 0.002) { faceBox(sink, bucket, face, (u0 + u1) / 2, (y0 + y1) / 2, o1 / 2, Math.abs(u1 - u0), y1 - y0, o1, opts); return; }
  const a = facePoint(face, u0, y0, o0), b = facePoint(face, u1, y1, o1);
  sink.span(bucket, a[0], a[1], a[2], b[0], b[1], b[2], opts);
}

/**
 * A section drawn in a face's (out, y) plane, counter-clockwise in (out, y), run along the face from u0 to u1: a sloped
 * buttress, a splash skirt, a corbel (dome-detail-275). The section must be convex.
 */
function runSection(sink: PartSink, bucket: RegionalBucket, face: Face, u0: number, u1: number, section: ReadonlyArray<readonly [number, number]>,
  opts: EmitOptions = {}): void {
  // (seen from +u the (out, y) plane turns the other way: the prism wants its points counter-clockwise from +u)
  sink.prism(bucket, [...section].reverse().map(([o, y]) => facePoint(face, u0, y, o)), face.u, u1 - u0, opts);
}

/** The two spandrels of a round arch of radius r springing at y over u: the wall between the arch and its square head. */
function spandrels(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, r: number, o0: number, depth: number,
  opts: EmitOptions = {}, n = 4): void {
  const at = (t: number): Vec3 => facePoint(face, u + Math.cos(t) * r, y + Math.sin(t) * r, o0);
  // each fanned from its square corner (the region is star-shaped from it): left from the springing up to the crown,
  // right from the crown down to the springing
  const left: Vec3[] = [facePoint(face, u - r, y + r, o0)], right: Vec3[] = [facePoint(face, u + r, y + r, o0)];
  for (let i = 0; i <= n; i++) { left.push(at(Math.PI - i / n * Math.PI / 2)); right.push(at(Math.PI / 2 - i / n * Math.PI / 2)); }
  sink.prism(bucket, left, face.out, depth, opts);
  sink.prism(bucket, right, face.out, depth, opts);
}

/** A ring of voussoirs over a round head (the face only, `o` proud), each its own bucket and paint by its index. */
function voussoirs(sink: PartSink, face: Face, u: number, y: number, r: number, ringW: number, n: number, o: number,
  paint: (j: number) => readonly [RegionalBucket, EmitOptions]): void {
  const at = (t: number, rr: number) => facePoint(face, u + Math.cos(t) * rr, y + Math.sin(t) * rr, o);
  for (let j = 0; j < n; j++) {
    const a = Math.PI * j / n, b = Math.PI * (j + 1) / n, [bucket, opts] = paint(j);
    sink.quad(bucket, at(a, r), at(a, r + ringW), at(b, r + ringW), at(b, r), { decor: true, ...opts });
  }
}

/** A block with a round head on a face (a Jerid parapet's merlon): w wide, its head springing h over its foot y. */
function roundMerlon(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, w: number, h: number, o0: number, depth: number,
  opts: EmitOptions = {}): void {
  const r = w / 2, pts: Vec3[] = [facePoint(face, u - r, y, o0), facePoint(face, u + r, y, o0)];
  for (let i = 0; i <= 4; i++) { const t = i / 4 * Math.PI; pts.push(facePoint(face, u + Math.cos(t) * r, y + h + Math.sin(t) * r, o0)); }
  sink.prism(bucket, pts, face.out, depth, opts);
}

/**
 * A run of glazed tiles on a face (Nabeul's, round a Tunisian door and up a minaret): the bedding strip in `ground`
 * (it reads as the band at any range) and the tiles over it in a chequer of `colours` (near the camera only).
 */
function tileRun(sink: PartSink, face: Face, u0: number, u1: number, y0: number, y1: number, o: number, size: number, ground: Rgb,
  colours: readonly Rgb[], start = 0): void {
  const P = (u: number, y: number, oo: number) => facePoint(face, u, y, oo);
  sink.quad('structureWood', P(u0, y0, o), P(u1, y0, o), P(u1, y1, o), P(u0, y1, o), { colour: ground, decor: true });
  const nu = Math.max(1, Math.round((u1 - u0) / size)), ny = Math.max(1, Math.round((y1 - y0) / size));
  const su = (u1 - u0) / nu, sy = (y1 - y0) / ny, g = 0.012, oo = o + 0.006;
  for (let i = 0; i < nu; i++) for (let j = 0; j < ny; j++) {
    const a = u0 + i * su + g, b = u0 + (i + 1) * su - g, c = y0 + j * sy + g, d = y0 + (j + 1) * sy - g;
    sink.quad('structureWood', P(a, c, oo), P(b, c, oo), P(b, d, oo), P(a, d, oo), { colour: colours[(i + j + start) % colours.length], decor: true, fine: 'near' });
  }
}

/** The rain's stain under a spout or a ledge: bands narrowing and fading down the wall from yTop to yBot. */
function rainStreak(sink: PartSink, bucket: RegionalBucket, face: Face | ((y: number) => Face), u: number, yTop: number, yBot: number, w: number, k0: number): void {
  // (dome-detail-275) on a battered wall the face its height's (slumpedMass's sideAt)
  const n = 6, F = typeof face === 'function' ? face : () => face;
  for (let b = 0; b < n; b++) {
    const t0 = b / n, t1 = (b + 1) / n, ya = yTop - (yTop - yBot) * t1 - 0.001, yb = yTop - (yTop - yBot) * t0 + 0.001;
    const h0 = w * (1 - 0.6 * t1) / 2, h1 = w * (1 - 0.6 * t0) / 2, o = b % 2 ? 0.0065 : 0.004, k = k0 + (0.76 - k0) * Math.pow((t0 + t1) / 2, 1.4);
    const fa = F(ya), fb = F(yb);
    sink.polygon(bucket, [facePoint(fa, u - h0, ya, o), facePoint(fa, u + h0, ya, o), facePoint(fb, u + h1, yb, o), facePoint(fb, u - h1, yb, o)],
      { decor: true, tint: [k, k * 0.95, k * 0.86] });
  }
}

/**
 * A Tunisian door's leaf as the hammam's (dome-detail-275): the leaf carried up into the round head of its opening, and
 * its black nail heads hammered in the old pattern — a border round the leaf and up its arch, an inner arch, a rosette,
 * the split between its two leaves and the brass knockers. Over doorUnit's leaf at the back of its reveal (sink.recess).
 */
function studdedLeaf(sink: PartSink, face: Face, u: number, y: number, w: number, spring: number, leaf: Rgb): void {
  const lo = sink.recess > 0 ? -sink.recess + 0.022 : 0.012, r = w / 2;
  const head: Vec3[] = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8 * Math.PI; head.push(facePoint(face, u + Math.cos(t) * (r - 0.01), y + spring + Math.sin(t) * (r - 0.01), lo + 0.02)); }
  sink.polygon('structureWood', head, { colour: shade(leaf, 0.9), decor: true });
  const pts: Array<[number, number]> = [], e = r - 0.08, ia = Math.min(0.2, r * 0.36), iy = spring * 0.7;
  for (let yy = 0.16; yy < spring; yy += 0.16) pts.push([-e, yy], [e, yy]);
  for (let k = 0; k <= 8; k++) { const t = k / 8 * Math.PI; pts.push([Math.cos(t) * e, spring + Math.sin(t) * e]); }
  for (let uu = -e + 0.16; uu < e - 0.08; uu += 0.16) pts.push([uu, 0.16]);
  for (let yy = 0.45; yy < iy; yy += 0.17) pts.push([-ia, yy], [ia, yy]);
  for (let k = 0; k <= 4; k++) { const t = k / 4 * Math.PI; pts.push([Math.cos(t) * ia, iy + Math.sin(t) * ia]); }
  const ry = Math.min(spring + e * 0.45, iy + ia + 0.25);
  for (const [du, dy] of [[0, 0.1], [0.1, 0], [0, -0.1], [-0.1, 0], [0, 0]] as const) pts.push([du, ry + dy]);
  const s = 0.018, o = lo + 0.047, stud = { colour: rgb(0x1c1a18), decor: true, fine: 'near' } as const;
  for (const [pu, py] of pts) {
    sink.quad('structureMetal', facePoint(face, u + pu - s, y + py - s, o), facePoint(face, u + pu + s, y + py - s, o), facePoint(face, u + pu + s, y + py + s, o),
      facePoint(face, u + pu - s, y + py + s, o), stud);
  }
  sink.quad('structureMetal', facePoint(face, u - 0.008, y, o - 0.004), facePoint(face, u + 0.008, y, o - 0.004), facePoint(face, u + 0.008, y + spring + r - 0.02, o - 0.004),
    facePoint(face, u - 0.008, y + spring + r - 0.02, o - 0.004), stud);
  for (const sx of [-1, 1]) faceBox(sink, 'structureMetal', face, u + sx * 0.13, y + spring * 0.58, o + 0.012, 0.07, 0.1, 0.025, { colour: BRASS, decor: true, fine: 'near' });
}

/** The Nabeul tiles' glazes: copper green, cobalt, the yellow of antimony, the tin-white ground. */
const TILE_GREEN = rgb(0x2f7a4c), TILE_BLUE = rgb(0x2c5c9a), TILE_YELLOW = rgb(0xd2a23a), TILE_WHITE = rgb(0xe6ddc6);
/** Fired Jerid brick (the Ouled el-Hadef quarter of Tozeur): the brick tone over the mud render, and its paint. */
const BRICK: readonly [RegionalBucket, EmitOptions] = [MUD, { tint: [1.04, 0.74, 0.52] }];

/**
 * The square Maghrebi minaret of the Jerid and the Sahel (dome-detail-275: a plain tapered box of 260 triangles). On a
 * stepped base of mud render, the lime-washed shaft in two stages over its door, string courses between them; on each
 * face the lower stage's tall blind arch and the upper's twin arches on a colonnette, each framed in its alfiz, a small
 * window cut through the wall under each arch, the rain's stains down the pilasters; the frieze of green-glazed tiles
 * under the gallery, the gallery corbelled out on stepped courses and brackets, its parapet's stepped merlons and its
 * spouts; the lantern open on an arch each side round its dark stair head, the arches ringed in green tile and lime,
 * its stepped cornice, a small pointed dome on its haunch and the brass alem. The minaret recorded as a shaft body.
 */
const minaret: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant, LIME: RegionalBucket = 'plaster2', decor = { decor: true } as const;
  // the shaft's half girth; its door's sill, the string courses, the frieze, the corbels, the gallery's soffit and floor
  const S = 2.8, h = S / 2, yb = 0.75, s1 = 2.5, s2 = 6.5, s3 = 8.85, fy = 9.0, cy = 9.55, gy = 10.05, gf = 10.25;
  // the stepped base: a sunk course of mud render, the lime step over it, the dust darker at their feet
  sink.span(MUD, -1.85, -0.3, -1.85, 1.85, 0.35, 1.85, { shadeAt: (p: Vec3) => (p[1] < 0.2 ? 0.84 : 0.95) });
  sink.span(LIME, -1.62, 0.35, -1.62, 1.62, yb, 1.62, { shadeAt: (p: Vec3) => (p[1] < 0.5 ? 0.9 : 1) });
  // the shaft to the gallery's corbels, its door, the lower stage's windows and the upper stage's twin lights cut through
  const low: HoleRect = { u0: -0.12, u1: 0.12, y0: 4.2, y1: 5.0 };
  const twin = [-0.47, 0.47].map((u): HoleRect => ({ u0: u - 0.08, u1: u + 0.08, y0: 7.45, y1: 8.05 }));
  const door: HoleRect = { u0: -0.42, u1: 0.42, y0: yb, y1: yb + 1.6 };
  const F = holedBox(sink, LIME, -h, -h, h, h, yb, cy, { front: [door, low, ...twin], right: [low, ...twin], back: [low, ...twin], left: [low, ...twin] }, 0.32, 0.24);
  const blue = pick(ctx.rng, BLUES), leaf = look() < 0.65 ? blue : shade(TIMBER, 1.1);
  // the door at the back of its reveal; the slits left open on the stair's dark, as a minaret's are
  sink.recess = 0.24;
  try {
    doorUnit(sink, F.front, 0, yb, door.u1 - door.u0, door.y1 - door.y0, { leaf, frame: { bucket: 'structureWood', width: 0.08, out: 0.03, colour: shade(TIMBER, 0.8) },
      steps: null, leafKind: 'plank' }, yb);
  } finally { sink.recess = 0; }
  faceBox(sink, 'structureWood', F.front, 0, door.y1 + 0.06, 0.03, 1.1, 0.12, 0.06, { colour: shade(TIMBER, 0.75), decor: true });
  // the string courses round the shaft between its stages
  for (const y of [s1, s2]) sink.band(LIME, -h - 0.06, y, -h - 0.06, h + 0.06, y + 0.16, h + 0.06, decor);
  sink.band(LIME, -h - 0.06, s3, -h - 0.06, h + 0.06, fy, h + 0.06, decor);
  // each face's relief, 8 cm proud: the pilasters up its arrises (meeting their neighbours round the corner), the lower
  // stage's tall blind arch under its band, ringed in brick and lime; the upper stage's twin arches on their colonnette
  // and its capital, the strips beside them and the band over them (the alfiz); the rain's stains down the pilasters
  const pl = h - 0.26, ra = 0.75, sa = s2 - 0.12 - ra, r2 = 0.42, sb = s3 - 0.1 - r2, P = 0.08;
  for (const fn of ['front', 'right', 'back', 'left'] as const) {
    const f = F[fn];
    for (const e of [-1, 1]) {
      faceSpan(sink, LIME, f, e * pl, e * (h + P), s1 + 0.16, s3, 0, P, decor);
      faceSpan(sink, LIME, f, e * ra, e * pl, s1 + 0.16, s2, 0, P, decor);
    }
    spandrels(sink, LIME, f, 0, sa, ra, 0, P, decor, 5);
    faceSpan(sink, LIME, f, -ra, ra, sa + ra, s2, 0, P, decor);
    voussoirs(sink, f, 0, sa, ra, 0.14, 9, P + 0.005, (j) => j % 2 ? BRICK : [LIME, { shade: 1.04 }]);
    for (const e of [-1, 1]) {
      faceSpan(sink, LIME, f, e * (2 * r2 + 0.05), e * pl, s2 + 0.16, s3, 0, P, decor);
      spandrels(sink, LIME, f, e * (r2 + 0.05), sb, r2, 0, P, decor, 3);
    }
    faceSpan(sink, LIME, f, -0.05, 0.05, s2 + 0.16, sb + r2, 0, P, decor);
    faceSpan(sink, LIME, f, -0.1, 0.1, sb - 0.1, sb, 0, P + 0.03, decor);
    faceSpan(sink, LIME, f, -(2 * r2 + 0.05), 2 * r2 + 0.05, sb + r2, s3, 0, P, decor);
    const pf: Face = { ...f, origin: facePoint(f, 0, 0, P) };
    for (const e of [-1, 1]) if (look() < 0.7) rainStreak(sink, LIME, pf, e * (h - 0.09), s3 - 0.01, s2 + 0.4 + look() * 1.2, 0.2, 0.55);
  }
  // the frieze under the gallery: a run of glazed tiles round the shaft in a chequer, its bedding wrapped round the corners
  const second = look() < 0.5 ? TILE_WHITE : TILE_YELLOW;
  for (const fn of ['front', 'right', 'back', 'left'] as const) {
    faceBox(sink, 'structureWood', F[fn], 0, (fy + cy) / 2, 0.015, S + 0.06, cy - fy, 0.03, { colour: shade(TILE_GREEN, 0.75), decor: true });
    tileRun(sink, F[fn], -h - 0.02, h + 0.02, fy + 0.05, cy - 0.05, 0.032, 0.2, shade(TILE_GREEN, 0.75), [TILE_GREEN, second], fn === 'front' || fn === 'back' ? 0 : 1);
  }
  // the gallery corbelled out: two stepped courses and a core course over them, the brackets on its faces carrying the
  // gallery's floor
  sink.span(LIME, -h - 0.1, cy, -h - 0.1, h + 0.1, cy + 0.14, h + 0.1);
  sink.span(LIME, -h - 0.2, cy + 0.14, -h - 0.2, h + 0.2, gy, h + 0.2);
  for (const fn of ['front', 'right', 'back', 'left'] as const) for (let k = 0; k < 5; k++) {
    const u = -h + (k + 0.5) * S / 5;
    runSection(sink, LIME, F[fn], u - 0.07, u + 0.07, [[0.18, cy + 0.3], [0.41, gy - 0.07], [0.41, gy + 0.005], [0.18, gy + 0.005]], { decor: true, shade: 0.97 });
  }
  const G = h + 0.42, gw = 0.14, ph = 0.55;
  sink.span(LIME, -G, gy, -G, G, gf, G);
  // the gallery's parapet, its stepped merlons (each face starting the next round the corner) and a spout each side
  sink.span(LIME, -G, gf, G - gw, G, gf + ph, G);
  sink.span(LIME, -G, gf, -G, G, gf + ph, -G + gw);
  sink.span(LIME, G - gw, gf, -G + gw, G, gf + ph, G - gw);
  sink.span(LIME, -G, gf, -G + gw, -G + gw, gf + ph, G - gw);
  const GF = bodyFaces(2 * G, 2 * G), mt = gf + ph;
  for (const fn of ['front', 'right', 'back', 'left'] as const) {
    const f = GF[fn];
    for (let k = 0; k < 4; k++) {
      const u = -G + 0.2 + k * (2 * G - 0.4) / 4;
      faceSpan(sink, LIME, f, u - 0.16, u + 0.16, mt - 0.01, mt + 0.22, -gw, 0, decor);
      faceSpan(sink, LIME, f, u - 0.08, u + 0.08, mt + 0.22, mt + 0.4, -gw + 0.02, -0.02, decor);
    }
    const u = (look() - 0.5) * 0.6;
    faceSpan(sink, 'structureWood', f, u - 0.06, u + 0.06, gf - 0.01, gf + 0.05, -0.12, 0.35, { colour: TIMBER, decor: true, uv: UV_MEMBER });
  }
  // the lantern: its four corner piers, the arch each side between them (its spandrels through the wall), the head over
  // them; the dark of the stair head inside; each arch ringed in green tile and lime
  const Lh = 0.85, pp = 0.4, rr = Lh - pp, ls = gf + 1.15, crown = ls + rr, lt = crown + 0.4;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    sink.span(LIME, sx < 0 ? -Lh : Lh - pp, gf, sz < 0 ? -Lh : Lh - pp, sx < 0 ? -Lh + pp : Lh, crown, sz < 0 ? -Lh + pp : Lh);
  }
  sink.span(LIME, -Lh, crown, -Lh, Lh, lt, Lh);
  sink.span('dark', -0.32, gf, -0.32, 0.32, crown, 0.32, decor);
  const LF = bodyFaces(2 * Lh, 2 * Lh);
  for (const fn of ['front', 'right', 'back', 'left'] as const) {
    spandrels(sink, LIME, LF[fn], 0, ls, rr, -0.3, 0.3, {}, 4);
    voussoirs(sink, LF[fn], 0, ls, rr, 0.13, 7, 0.02, (j) => j % 2 ? ['structureWood', { colour: TILE_GREEN }] : [LIME, {}]);
  }
  // its stepped cornice, the little dome on its haunch and the alem
  sink.band(LIME, -Lh - 0.08, lt, -Lh - 0.08, Lh + 0.08, lt + 0.1, Lh + 0.08);
  sink.span(LIME, -Lh - 0.16, lt + 0.1, -Lh - 0.16, Lh + 0.16, lt + 0.2, Lh + 0.16);
  const cap = smoothDome(sink, LIME, 0, lt + 0.2, 0, 0.74, { form: 'pointed', stilt: 0.1, haunch: true });
  finialOn(sink, 0, cap.top, 0, 0.8, BRASS);
  recordShaft(sink, 0, 0, S, cap.top, LIME);
  return sink.finish();
};

/**
 * The borj: a mud-plastered watch tower with a crenellated top and a timber door high in its wall. (Props census #5, lane
 * B 2026-10-15; the judges: "the buried door": its leaf stood inside the battered wall's foot, laid on nothing) a battered
 * talus round its foot; the shaft in two stages, the upper set back over a band, its walls cut: the door raised over the
 * talus with its steps up, loopholes in every face of both stages and a lookout window under the parapet; the palm-trunk
 * beam ends (toron) through the walls under the parapet, its merlons over a parapet band. The shaft is a tower body
 * (it topples in its courses). (dome-detail-275: "stepped plain blocks with slit windows") The shaft battered as a
 * whole as the hammam's walls are, its arrises worked round; founded on a course of rubble under the talus; the setback
 * a ledge of flat stones over the upper floor's palm joists; a timber lintel over every loophole and a palm log over the
 * door, stone steps up to it; the bretèche (a box machicolation) corbelled out over the door at the roof; the parapet a
 * wall round the roof terrace with the Jerid's rounded merlons and the corner horns, a palm spout through each side and
 * the rain's stain under it; the render fallen in patches off the rubble, stones at the foot.
 */
const borj: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const S = Math.max(3.2, Math.min(ctx.info.w, ctx.info.d) - 0.6), H = Math.max(7.5, ctx.info.h - 1.5);
  const t = 0.55, cut = 0.42, reveal = 0.34, mid = Math.round(H * 0.55 * 10) / 10, S2 = S - 0.4;
  const RUBBLE = { tint: [0.92, 0.86, 0.76] as Rgb };
  // (dome-detail-275) the rubble footing course under the talus, its stones showing at the foot
  sink.span('stone', -S / 2 - 0.28, -0.3, -S / 2 - 0.28, S / 2 + 0.28, 0.14, S / 2 + 0.28, RUBBLE);
  // the talus, its foot on the footing, the dust darker at it
  sink.cylinder(MUD, [0, 0.12, 0], 'y', 0.68, (S / 2 + 0.2) * Math.SQRT2, 4, { shadeAt: (p: Vec3) => (p[1] < 0.3 ? 0.86 : 0.97) }, (S / 2 + 0.02) * Math.SQRT2, true, Math.PI / 4);
  const loop = (y: number, u = 0): HoleRect => ({ u0: u - 0.09, u1: u + 0.09, y0: y, y1: y + 0.7 });
  const door: HoleRect = { u0: -0.45, u1: 0.45, y0: t + 0.25, y1: t + 0.25 + 1.85 };
  const lookout: HoleRect = { u0: -0.3, u1: 0.3, y0: H - 2.3, y1: H - 1.45 };
  const lowHoles = { front: [door, loop(mid - 1.4, 0.95)], right: [loop(2.2), loop(mid - 1.2, -0.6)], back: [loop(2.8)], left: [loop(2.0, 0.5), loop(mid - 1.3)] };
  const highHoles = { front: [lookout, loop(mid + 1.0, -0.7)], right: [loop(mid + 1.4)], back: [loop(mid + 0.9, 0.4), loop(H - 1.6, -0.4)], left: [loop(mid + 1.2)] };
  // (dome-detail-275) the shaft in a sink of its own, battered as a whole to the parapet (batterParts)
  const ts = new PartSink(sink.uvOffset), inset = 0.2 + look() * 0.08, pt = H + 0.65;
  const low = holedBox(ts, MUD, -S / 2, -S / 2, S / 2, S / 2, t, mid, lowHoles, cut, reveal);
  // the setback: a ledge of flat stones over the upper floor's palm joists, their ends through the wall under it
  ts.span('stone', -S / 2 - 0.1, mid, -S / 2 - 0.1, S / 2 + 0.1, mid + 0.18, S / 2 + 0.1, RUBBLE);
  const high = holedBox(ts, MUD, -S2 / 2, -S2 / 2, S2 / 2, S2 / 2, mid + 0.18, H, highHoles, cut - 0.06, reveal - 0.06);
  for (const name of SIDES) for (let k = 0; k < 4; k++) {
    const u = -S * 0.36 + k * S * 0.24 + (look() - 0.5) * 0.12;
    if (name === 'front' && Math.abs(u - 0.95) < 0.3) continue;
    trunkEnd(ts, low[name], u, mid - 0.16, 0.075, 0.3, 0.16 + look() * 0.08, shade(TIMBER, 0.62 + look() * 0.2), look());
  }
  // the arrises worked round: a quarter round of mud at each corner of both stages
  for (const [a0, y0, y1, R] of [[S / 2, t - 0.02, mid, 0.22], [S2 / 2, mid + 0.18, pt, 0.2]] as const) {
    const a = R * Math.SQRT1_2;
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
      ts.cylinder(MUD, [sx * (a0 - a), y0, sz * (a0 - a)], 'y', y1 - y0, R, 8, {}, R, false, -(Math.atan2(sz, sx) + Math.PI / 2), Math.PI);
    }
  }
  // a timber lintel over each loophole, bedded in the mud
  for (const [faces, holes] of [[low, lowHoles], [high, highHoles]] as const) for (const name of SIDES) for (const h of holes[name]) {
    if (h.u1 - h.u0 > 0.3) continue;
    faceBox(ts, 'structureWood', faces[name], (h.u0 + h.u1) / 2, h.y1 + 0.05, 0.02, 0.42, 0.08, 0.05, { colour: shade(TIMBER, 0.7), decor: true, fineSides: true });
  }
  // the door at the back of its reveal under a palm-log lintel, the lookout under the parapet
  ts.recess = reveal;
  try {
    doorUnit(ts, low.front, 0, door.y0, door.u1 - door.u0, door.y1 - door.y0, { leaf: TIMBER, frame: { bucket: 'structureWood', width: 0.1, out: 0.04, colour: shade(TIMBER, 0.8) },
      steps: null, leafKind: 'plank' }, door.y0);
  } finally { ts.recess = 0; }
  palmLog(ts, low.front, -0.72, 0.72, door.y1 + 0.1, 0.09, shade(TIMBER, 0.75));
  ts.recess = reveal - 0.06;
  try {
    windowUnit(ts, high.front, 0, lookout.y0, lookout.u1 - lookout.u0, lookout.y1 - lookout.y0, { frame: shade(TIMBER, 0.8), frameWidth: 0.05, frameOut: 0.03, bars: 'none',
      surround: null, sill: { bucket: MUD, out: 0.06 }, shutters: null }, ctx.rng, 0.15);
  } finally { ts.recess = 0; }
  // the parapet: a wall round the roof terrace, a hand proud of the shaft, its rounded merlons and the corner horns
  const P = S2 / 2 + 0.06, pw = 0.24;
  ts.span(MUD, -P, H, P - pw, P, pt, P);
  ts.span(MUD, -P, H, -P, P, pt, -P + pw);
  ts.span(MUD, P - pw, H, -P + pw, P, pt, P - pw);
  ts.span(MUD, -P, H, -P + pw, -P + pw, pt, P - pw);
  const PF = bodyFaces(2 * P, 2 * P);
  for (const name of SIDES) {
    for (const u of [-P * 0.42, 0, P * 0.42]) roundMerlon(ts, MUD, PF[name], u + (look() - 0.5) * 0.06, pt - 0.01, 0.4, 0.3, -pw + 0.02, pw - 0.04, { decor: true });
    // a palm spout through the parapet's foot, open along its top, and the rain's stain down the shaft under it
    const u = (name === 'front' ? -1.0 : 0) + (look() - 0.5) * 0.4, sp = { colour: TIMBER, decor: true, uv: UV_MEMBER } as const;
    faceSpan(ts, 'structureWood', PF[name], u - 0.08, u + 0.08, H + 0.02, H + 0.05, -0.2, 0.5, sp);
    for (const s of [-1, 1]) faceSpan(ts, 'structureWood', PF[name], u + s * 0.08 - 0.015, u + s * 0.08 + 0.015, H + 0.05, H + 0.13, -0.2, 0.5, { ...sp, colour: shade(TIMBER, 0.85) });
    rainStreak(ts, MUD, high[name], u, H - 0.02, mid + 0.6 + look() * 1.2, 0.36, 0.62);
    // the toron: palm-trunk beam ends through the walls under the parapet (clear of the spout and the bretèche)
    for (const tu of [-S2 * 0.32, S2 * 0.32]) {
      if (Math.abs(tu - u) < 0.3 || (name === 'front' && Math.abs(tu) < 0.85)) continue;
      trunkEnd(ts, high[name], tu, H - 0.3, 0.08, 0.55, 0.3 + look() * 0.12, shade(TIMBER, 0.6 + look() * 0.2), look());
    }
  }
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
    ts.revolve(MUD, [sx * (P - 0.12), pt - 0.01, sz * (P - 0.12)], 'y', [[0, 0.21], [0.22, 0.2], [0.44, 0.13], [0.6, 0.05], [0.68, 0]], 8, { decor: true });
  }
  // the bretèche over the door at the roof: a box of mud corbelled out on three stepped brackets, a loophole through its
  // front, its floor open over the door (the dark of its slot), two merlons on its head
  const fb = high.front, bw = 0.72, bo = 0.7, by = H - 0.42;
  for (const u of [-bw + 0.1, 0, bw - 0.1]) for (let k = 0; k < 3; k++) {
    faceSpan(ts, MUD, fb, u - 0.09, u + 0.09, by - 0.6 + k * 0.2, by - 0.4 + k * 0.2, 0, 0.2 + k * 0.2, { decor: true, shade: 0.94 });
  }
  faceSpan(ts, MUD, fb, -bw, bw, by - 0.02, by + 0.14, 0, bo, { decor: true });
  faceSpan(ts, 'dark', fb, -0.38, 0.38, by - 0.035, by - 0.02, 0.18, bo - 0.12, { decor: true });
  faceSpan(ts, MUD, fb, -bw, bw, by + 0.14, pt, bo - 0.16, bo, { decor: true });
  for (const s of [-1, 1]) faceSpan(ts, MUD, fb, s > 0 ? bw - 0.16 : -bw, s > 0 ? bw : -bw + 0.16, by + 0.14, pt, 0, bo - 0.16, { decor: true });
  faceSpan(ts, 'dark', fb, -0.07, 0.07, by + 0.5, by + 0.95, bo + 0.003, bo + 0.008, { decor: true });
  const BF: Face = { ...fb, origin: facePoint(fb, 0, 0, bo) };
  for (const u of [-0.36, 0.36]) roundMerlon(ts, MUD, BF, u, pt - 0.01, 0.34, 0.26, -0.16, 0.14, { decor: true });
  // the render fallen in patches off the rubble it was laid on: the stones bare, a lip of render round them
  for (const [name, u, y, w, h] of [['left', -0.75, 0.95, 0.9, 0.7], ['back', 0.65, mid - 1.0, 0.7, 0.55], ['right', 0.75, 1.2, 0.6, 0.8]] as const) {
    const f = low[name], du = (look() - 0.5) * 0.2, dy = (look() - 0.5) * 0.3;
    // (two overlapping lumps of loss, so the bare patch has no plaque's straight edges)
    faceBox(ts, 'stone', f, u + du, y + dy, 0.006, w, h, 0.012, { decor: true, tint: [0.84, 0.78, 0.68] });
    faceBox(ts, 'stone', f, u + du + w * 0.32, y + dy - h * 0.3, 0.007, w * 0.5, h * 0.55, 0.014, { decor: true, tint: [0.84, 0.78, 0.68] });
    for (let k = 0; k < 3; k++) {
      faceBox(ts, 'stone', f, u + du + (look() - 0.5) * (w - 0.2), y + dy + (look() - 0.5) * (h - 0.16), 0.02, 0.18 + look() * 0.1, 0.1 + look() * 0.05, 0.035,
        { decor: true, fine: 'near', tint: [0.86, 0.8, 0.7] });
    }
  }
  const body = ts.finish();
  batterParts(body, 0, 0, S / 2, S / 2, pt, inset, t);
  // stone steps up from the talus to the door's sill, inside the plot
  for (let k = 0; k < 3; k++) {
    sink.span('stone', -0.58, 0.1, S / 2 - 0.1, 0.58, (door.y0 + 0.01) * (k + 1) / 3, S / 2 + 0.14 + (2 - k) * 0.26, { decor: true, ...RUBBLE, shade: 0.96 - k * 0.03 });
  }
  // the stones fallen at the foot and the sand drifted against the talus on the windward side
  for (let k = 0; k < 6; k++) {
    const side = SIDES[1 + (k % 3)], f = bodyFaces(S + 0.5, S + 0.5)[side], u = (look() - 0.5) * S, sz = 0.14 + look() * 0.14;
    const c = facePoint(f, u, 0, 0.05 + look() * 0.3);
    sink.span('stone', c[0] - sz, -0.05, c[2] - sz * 0.8, c[0] + sz, sz * 0.8, c[2] + sz * 0.8, { decor: true, tint: [0.88, 0.82, 0.72] });
  }
  sink.cylinder(MUD, [-S / 2 - 0.05, -0.2, -S * 0.15], 'y', 0.5, 0.75, 9, { decor: true, tint: [0.98, 0.92, 0.82] }, 0.18, true, look() * 3);
  recordShaft(sink, 0, 0, S, H + 1.15, MUD, true);
  return withParts(sink.finish(), [body]);
};

/**
 * A domed hammam of the Jerid (Tozeur, Nefta): a whitewashed block under three domes, the hot room's great one against
 * the furnace. (Props census #15, Lane C 2026-10-16: "no lantern, no vent, no furnace and no spout"; a blank box.) The
 * bath block carries its domes pierced by glass bosses (the qamariyat) and the lantern on the great dome, high lights in
 * its long walls and vents under the parapet, all cut through the walls, the parapet's spouts; behind it the furnace
 * room, a body of its own against the back wall, its stoke hole cut low with the soot over it, the fuel stacked by it
 * and the flue stack rising past the domes. (dome-detail-275: the body was a plain whitewashed box) The bath block's
 * mud walls battered and their arrises rounded, angle buttresses down its flanks, a sloped splash skirt round its foot;
 * the entrance portal standing proud with its round-headed niche ringed in brick and lime, its tile frame and name
 * board, the studded door in it, the masonry benches either side and the paving before it; the parapet's rounded
 * merlons and corner horns, a brick dentil course and cornice under it; the spouts palm channels, the rain's stains
 * under them; the drain from the hot room in its open channel to a soak pit; the furnace room battered too, its stoke
 * hole ringed in brick, the ash raked out, the palm wood and date stones by it, its tapering stack under a cap and its
 * cistern on the roof.
 */
const hammam: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  // (dome-detail-275) the walls and domes the warm lime wash (plaster2) over the mud render of the plinth, the skirt, the
  // furnace room and its stack (MUD)
  const LIME: RegionalBucket = 'plaster2';
  const W = Math.max(7, Math.min(11.2, ctx.info.w - 1.4)), hd = Math.max(4.5, ctx.info.d / 2);
  // the bath block from a metre inside the plot's front (the portal, the benches and the paving before it) back to the
  // furnace room, which fills the plot's back 2.1 m
  const fd = 2.1, zF = hd - 1.0, zB = -hd + 0.15, zb = zB + fd, Dm = zF - zb, zc = (zF + zb) / 2, H = 3.6;
  const roof = { kind: 'flat', pitchDeg: 0, eave: 0.06, verge: 0.06, thickness: 0.2, bucket: LIME, parapet: 0.35 } as const;
  const doorW = 1.15, doorS = 1.95;
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: doorW, y0: 0, h: doorS, arch: { spring: doorS } }];
  for (const face of ['left', 'right'] as const) openings.push(...windowRhythm(face, 0, Dm, { w: 0.45, h: 0.45, sill: 2.55, spacing: 2.4, margin: 1.3, max: 2 }));
  for (const u of [-W * 0.33, W * 0.33]) openings.push({ face: 'front', storey: 0, kind: 'window', u, w: 0.4, h: 0.4, y0: 2.6 });
  for (const u of [-W * 0.33, W * 0.33]) openings.push({ face: 'back', storey: 0, kind: 'loft', u, w: 0.22, h: 0.3, y0: 3.0 });
  const lights: WindowStyle = { frame: shade(TIMBER, 0.8), frameWidth: 0.04, frameOut: 0.02, bars: 'cross', surround: { bucket: LIME, width: 0.1, out: 0.03 },
    sill: { bucket: MUD, out: 0.05 }, shutters: null };
  const blue = pick(ctx.rng, BLUES), leaf = look() < 0.3 ? rgb(0xb8862e) : blue;
  const quiet: HouseDialect = {
    // a vent or a stoke hole is left empty: its reveal and the dark behind it
    window: (s, face, o, y0) => { if (o.kind !== 'loft') windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, lights, ctx.rng, 0.15); },
    door: (s, face, o, y0) => {
      if (o.w < 1) return;
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf, frame: { bucket: LIME, width: 0.14, out: 0.05 }, steps: { bucket: MUD }, leafKind: 'plank' }, y0 + o.y0);
      studdedLeaf(s, face, o.u, y0 + o.y0, o.w, o.h, leaf);
    },
  };
  // the bath block in a sink of its own, battered as a whole as the ksar's houses are (batterParts)
  const hs = new PartSink(sink.uvOffset), batter = 0.1 + look() * 0.05;
  let top = 0, eaveY = 0, parTop = 0;
  hs.placed(0, 0, 0, zc, () => {
    const sink = hs;
    const frame = buildHouse(sink, {
      w: W, d: Dm, plinth: { h: 0.25, out: 0.06, bucket: MUD }, storeys: [{ h: H, wall: LIME }], roof, gableBucket: LIME,
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.3, core: 'adobe',
    }, quiet);
    eaveY = frame.eaveY; top = eaveY + 0.2; parTop = top + 0.35;
    const y0 = frame.floors[0], F = frame.faces;
    // (dome-detail-275) the arrises rounded: a quarter round of lime worked round each corner from the plinth to the
    // parapet's top
    const R = 0.24, a = R * Math.SQRT1_2;
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
      const th = Math.atan2(sz, sx);
      sink.cylinder(LIME, [sx * (W / 2 - a), y0 - 0.02, sz * (Dm / 2 - a)], 'y', parTop - y0 + 0.02, R, 8, {}, R, true, -(th + Math.PI / 2), Math.PI);
    }
    // (dome-detail-275) the angle buttresses: a sloped mud spur at each end of both flanks against the domes' thrust
    for (const fn of ['left', 'right'] as const) for (const e of [-1, 1]) {
      const u = e * (Dm / 2 - 0.55), bh = eaveY * 0.74;
      runSection(sink, LIME, F[fn], u - 0.36, u + 0.36, [[-0.05, -0.25], [0.58, -0.25], [0.22, bh * 0.82], [0.1, bh], [-0.05, bh]]);
    }
    // (dome-detail-275) the splash skirt: the foot's sloped apron of mud rendered over the plinth, darker with the damp
    // and the dust, round the flanks and the back and either side of the benches
    const skirt = { decor: true, tint: [0.9, 0.84, 0.76] as Rgb };
    const sec: Array<[number, number]> = [[-0.02, -0.25], [0.32, -0.25], [0.32, 0.05], [-0.02, 0.52]];
    for (const fn of ['left', 'right'] as const) runSection(sink, MUD, F[fn], -Dm / 2, Dm / 2, sec, skirt);
    const fwb = Math.min(3.6, W - 1.6) / 2;
    for (const e of [-1, 1]) runSection(sink, MUD, F.back, e < 0 ? -W / 2 : fwb, e < 0 ? -fwb : W / 2, sec, skirt);
    // the entrance portal: its piers and head standing proud of the front to over the parapet, the round-headed niche
    // between them (the door at its back), its ring of voussoirs alternately fired brick and lime, the frame of tiles
    // round it (the alfiz), the name board over it, the brick dentils and cornice on top and three merlons over them
    const f = F.front, po = 0.42, g = 0.86, pier = 0.6, pw = 2 * (g + pier), pTop = parTop + 0.55;
    const ys = y0 + doorS + doorW / 2 + 0.1, crown = ys + g;
    for (const e of [-1, 1]) faceSpan(sink, LIME, f, e * g, e * (g + pier), -0.25, pTop, 0, po);
    faceSpan(sink, LIME, f, -g, g, crown, pTop, 0, po);
    spandrels(sink, LIME, f, 0, ys, g, 0, po, { tint: [1.0, 0.97, 0.9] }, 5);
    voussoirs(sink, f, 0, ys, g, 0.2, 11, po + 0.025, (j) => j % 2 ? BRICK : [LIME, { shade: 1.04 }]);
    for (const e of [-1, 1]) tileRun(sink, f, e > 0 ? g + 0.26 : -(g + 0.44), e > 0 ? g + 0.44 : -(g + 0.26), y0 + 0.55, crown + 0.42, po + 0.012, 0.16, TILE_GREEN,
      [TILE_WHITE, TILE_GREEN, TILE_YELLOW, TILE_BLUE], e > 0 ? 1 : 0);
    tileRun(sink, f, -(g + 0.44), g + 0.44, crown + 0.26, crown + 0.42, po + 0.013, 0.16, TILE_GREEN, [TILE_WHITE, TILE_BLUE, TILE_YELLOW, TILE_GREEN]);
    faceBox(sink, LIME, f, 0, crown + 0.76, po + 0.025, 1.15, 0.38, 0.05, { decor: true, tint: [1.03, 1.02, 0.98] });
    for (const [du, dw] of [[-0.3, 0.32], [0.05, 0.22], [0.33, 0.18]] as const) {
      faceBox(sink, 'structureWood', f, du, crown + 0.76, po + 0.052, dw, 0.045, 0.006, { colour: TILE_GREEN, decor: true, fine: 'near' });
    }
    for (let k = 0, n = Math.round(pw / 0.22); k < n; k++) {
      faceBox(sink, BRICK[0], f, -pw / 2 + (k + 0.5) * pw / n, pTop - 0.1, po + 0.04, 0.11, 0.08, 0.08, { decor: true, fineSides: true, ...BRICK[1] });
    }
    faceSpan(sink, LIME, f, -pw / 2 - 0.1, pw / 2 + 0.1, pTop, pTop + 0.14, -0.1, po + 0.1, { decor: true });
    for (const u of [-pw * 0.3, 0, pw * 0.3]) roundMerlon(sink, LIME, f, u, pTop + 0.14, 0.36, 0.18, 0.02, 0.32, { decor: true });
    // the benches (dokkana) either side of the portal: whitewashed masonry, a tiled riser, a lime slab on top
    for (const e of [-1, 1]) {
      const u0 = e * (pw / 2 + 0.06), u1 = e * (pw / 2 + 1.3), lo = Math.min(u0, u1), hi = Math.max(u0, u1);
      faceSpan(sink, LIME, f, lo, hi, -0.2, 0.44, 0, 0.5, { decor: true });
      faceSpan(sink, LIME, f, lo - 0.04, hi + 0.04, 0.44, 0.52, 0, 0.55, { decor: true, shade: 0.96 });
      tileRun(sink, f, lo + 0.06, hi - 0.06, 0.06, 0.38, 0.5, 0.16, TILE_BLUE, [TILE_WHITE, TILE_BLUE], e > 0 ? 1 : 0);
    }
    // the cornice under the parapet round the block, the fired brick dentils under it along the front
    sink.band(LIME, -W / 2 - 0.05, eaveY - 0.3, -Dm / 2 - 0.05, W / 2 + 0.05, eaveY - 0.12, Dm / 2 + 0.05, { decor: true });
    for (let u = -W / 2 + 0.35; u < W / 2 - 0.3; u += 0.24) {
      if (Math.abs(u) < pw / 2 + 0.1) continue;
      faceBox(sink, BRICK[0], f, u, eaveY - 0.37, 0.04, 0.12, 0.08, 0.08, { decor: true, fineSides: true, ...BRICK[1] });
    }
    // the parapet's rounded merlons along each side (clear of the portal) and the horns at its corners
    for (const fn of ['front', 'back', 'left', 'right'] as const) {
      const span = F[fn].width + 0.12 - 1.1, n = Math.max(2, Math.round(span / 0.8) + 1);
      for (let k = 0; k < n; k++) {
        const u = -span / 2 + span * k / (n - 1);
        if (fn === 'front' && Math.abs(u) < pw / 2 + 0.3) continue;
        roundMerlon(sink, LIME, F[fn], u, parTop - 0.01, 0.34, 0.14, -0.16, 0.22, { decor: true });
      }
    }
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
      sink.revolve(LIME, [sx * (W / 2 - 0.05), parTop - 0.01, sz * (Dm / 2 - 0.05)], 'y', [[0, 0.19], [0.2, 0.18], [0.42, 0.12], [0.58, 0.05], [0.64, 0]], 10, { decor: true });
    }
    // the spouts: palm channels through the parapet over the flanks, open along their tops, clear of the lights, and the
    // rain's stain down the lime under each
    for (const fn of ['left', 'right'] as const) for (const u0 of [-0.55, 0.55]) {
      const u = u0 + (look() - 0.5) * 0.3, F0 = F[fn], sp = { colour: TIMBER, decor: true, uv: UV_MEMBER } as const;
      faceSpan(sink, 'structureWood', F0, u - 0.08, u + 0.08, top - 0.03, top, -0.2, 0.6, sp);
      for (const s of [-1, 1]) faceSpan(sink, 'structureWood', F0, u + s * 0.08 - 0.015, u + s * 0.08 + 0.015, top, top + 0.09, -0.2, 0.6, { ...sp, colour: shade(TIMBER, 0.85) });
      rainStreak(sink, LIME, F0, u, eaveY - 0.3, 1.7 + look() * 0.5, 0.42, 0.5);
    }
  });
  const body = hs.finish();
  batterParts(body, 0, zc, W / 2, Dm / 2, eaveY, batter);
  // the domes on the roof (unbattered: their drums stand on the roof's middle): the hot room's great dome at the back
  // over the furnace, the warm rooms' two smaller domes forward (dome-detail-275: they were five frustums of twelve flat
  // facets, conical, with no drum): each on a low round drum under its stepped cornice, the shell a little pointed and
  // stilted as the Jerid's are, on the Maghreb's stepped haunch, turned smooth (domes.ts), the rain's grey down its lower
  // haunch, its bosses seated on the true shell
  const gR = Math.min(1.9, Dm * 0.28, W * 0.2), sr = gR * 0.66;
  const domes: Array<[number, number, number, boolean]> = [
    [0, zc - Dm / 2 + 0.4 + gR + 0.25, gR, true],
    ...[-1, 1].map((s): [number, number, number, boolean] => [s * (W / 2 - 0.4 - sr - 0.25), zc + Dm / 2 - 0.4 - sr - 0.25, sr, false]),
  ];
  for (const [x, z, r, great] of domes) {
    const phase = look() * 6.28;
    const tintAt = (p: Vec3): Rgb => {
      const h = Math.min(1, Math.max(0, (p[1] - top) / (r * 1.3)));
      const k = 0.9 + 0.1 * Math.sqrt(h) - (0.5 + 0.5 * Math.sin(Math.atan2(p[2] - z, p[0] - x) * 8 + phase)) * (1 - h) * 0.06;
      return [k, k * 0.98, k * 0.95];
    };
    const spring = roundDrum(sink, LIME, x, top - 0.05, z, r + 0.06, 0.3, LIME);
    const shell = smoothDome(sink, LIME, x, spring - 0.04, z, r, { form: 'pointed', stilt: 0.08, haunch: true, ...(great ? { openTop: 0.3 } : {}), emit: { tintAt } });
    glassBosses(sink, shell, [[0.5, great ? 10 : 7], [0.9, great ? 6 : 4]], 0.075, look, { fine: true });
    if (great) {
      // the lantern over the hot room: a little drum, its cornice and its own cap under the alem
      sink.revolve(LIME, [x, shell.top - 0.05, z], 'y', [[0, 0.34], [0.42, 0.33], [0.42, 0]], 24);
      sink.revolve(LIME, [x, shell.top + 0.37, z], 'y', [[0, 0.33], [0, 0.4], [0.08, 0.4], [0.08, 0]], 24, { decor: true });
      const cap = smoothDome(sink, LIME, x, shell.top + 0.45, z, 0.36, { form: 'pointed' });
      finialOn(sink, x, cap.top, z, 0.5, BRASS);
    } else finialOn(sink, x, shell.top, z, 0.55, BRASS);
  }
  // the paving before the portal: its slabs a little uneven, worn darker in the door's path
  const pw = 2 * (0.86 + 0.6), pz0 = zF + 0.02, pz1 = hd - 0.05;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
    const x0 = -pw / 2 - 1.3 + i * (pw + 2.6) / 6, x1 = x0 + (pw + 2.6) / 6 - 0.03, z0 = pz0 + j * (pz1 - pz0) / 2, z1 = z0 + (pz1 - pz0) / 2 - 0.03;
    const worn = Math.abs((x0 + x1) / 2) < 0.8 ? 0.84 : 0.95;
    sink.span(MUD, x0, -0.12, z0, x1, 0.05 + look() * 0.02, z1, { decor: true, shade: worn - look() * 0.06, tint: [0.96, 0.92, 0.86] });
  }
  // the drain: the hot room's waste out through the right flank's foot in a clay pipe, its open channel along the wall
  // to the soak pit by the front, the ground wet in it
  const dx = W / 2 + 0.38, dz0 = zc - Dm / 2 + 1.3, dz1 = zc + Dm * 0.12;
  sink.pipe('structureWood', [W / 2 - 0.1, 0.3, dz0], [dx + 0.05, 0.22, dz0], 0.07, 8, { colour: rgb(0xa0583a), decor: true, caps: true });
  for (const x of [dx - 0.06, dx + 0.32]) sink.span(MUD, x, -0.1, dz0 - 0.15, x + 0.08, 0.09, dz1, { decor: true, shade: 0.82 });
  sink.span(MUD, dx + 0.02, -0.1, dz0 - 0.15, dx + 0.32, 0.015, dz1, { decor: true, shade: 0.55, tint: [0.8, 0.76, 0.7] });
  sink.revolve(MUD, [dx + 0.15, -0.1, dz1 + 0.32], 'y', [[0, 0.36], [0.2, 0.36], [0.2, 0.26], [0.12, 0.26]], 12, { decor: true, shade: 0.8 });
  sink.cylinder(MUD, [dx + 0.15, -0.1, dz1 + 0.32], 'y', 0.14, 0.27, 12, { decor: true, shade: 0.4, tint: [0.7, 0.68, 0.64] });
  // the furnace room: a low mud body against the bath's back wall, battered, its stoke hole cut low in its back under a
  // ring of brick, its flue stack
  const fw = Math.min(3.6, W - 1.6), fz = zB + fd / 2, fh = 2.3;
  const fs = new PartSink(sink.uvOffset);
  fs.placed(0, 0, 0, fz, () => {
    buildHouse(fs, {
      w: fw, d: fd, plinth: null, storeys: [{ h: fh, wall: MUD }], roof: { ...roof, bucket: MUD, parapet: 0.2 }, gableBucket: MUD,
      openings: [{ face: 'back', storey: 0, kind: 'door', u: -fw * 0.18, w: 0.75, y0: 0.15, h: 0.8, arch: { spring: 0.55 } },
        { face: 'right', storey: 0, kind: 'door', u: 0, w: 0.8, y0: 0, h: 1.65 }],
      chimneys: [], gutters: null, verge: null, reveal: 0.35, core: 'adobe',
    }, {
      // the stoke hole left open on its dark; (dome-detail-275) the stoker's plank door in the room's side
      window: () => undefined,
      door: (s, face, o, y0) => {
        if (o.face !== 'right') return;
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(TIMBER, 0.85), frame: { bucket: 'structureWood', width: 0.08, out: 0.03, colour: shade(TIMBER, 0.7) },
          steps: null, leafKind: 'plank' }, y0 + o.y0);
      },
    });
    const back: Face = { origin: [0, 0, -fd / 2], u: [-1, 0, 0], out: [0, 0, -1], width: fw };
    voussoirs(fs, back, -fw * 0.18, 0.7, 0.375, 0.16, 7, 0.02, (j) => j % 2 ? [MUD, { tint: [0.9, 0.62, 0.44] }] : BRICK);
    // the soot up the wall over the stoke hole (the looks lane, 227; the r2 sweep: a dark plate 0.9 x 1.1 m on the wall):
    // a plume from the hole's head narrowing as it climbs, black over the head and fading into the lime as it rises, laid
    // in bands a hand's breadth apart in tone
    const su = -fw * 0.18, sy0 = 1.12, sy1 = 2.12, bands = 24, half = (t: number) => 0.44 - 0.3 * t;
    for (let b = 0; b < bands; b++) {
      // (the 227 blind pair: a hairline of lime showed between the bands) each band overlapping the next by 2 mm, the bands
      // standing alternately 4 and 6.5 mm off the wall so none shares an edge with the next; the black held longer
      const t0 = b / bands, t1 = (b + 1) / bands, ya = sy0 + (sy1 - sy0) * t0 - 0.001, yb = sy0 + (sy1 - sy0) * t1 + 0.001, o = b % 2 ? 0.0065 : 0.004;
      const k = 0.26 + 0.64 * Math.pow((t0 + t1) / 2, 1.3);
      fs.polygon(MUD, [facePoint(back, su - half(t0), ya, o), facePoint(back, su + half(t0), ya, o), facePoint(back, su + half(t1), yb, o),
        facePoint(back, su - half(t1), yb, o)], { decor: true, tint: [k, k * 0.96, k * 0.92] });
    }
    // the cistern on the furnace room's roof against the bath's back wall, its copper feed into the hot room over it
    const cx0 = -fw / 2 + 0.25, cx1 = -fw * 0.05;
    fs.span(MUD, cx0, fh, fd / 2 - 1.0, cx1, fh + 0.85, fd / 2 + 0.05);
    fs.span(MUD, cx0 - 0.05, fh + 0.85, fd / 2 - 1.05, cx1 + 0.05, fh + 0.95, fd / 2 + 0.05, { decor: true });
    const px = (cx0 + cx1) / 2, copper = { colour: rgb(0x5f8a6a), decor: true } as const;
    fs.pipe('structureMetal', [px, fh + 0.9, fd / 2 - 0.35], [px, fh + 1.15, fd / 2 - 0.35], 0.05, 6, copper);
    fs.pipe('structureMetal', [px, fh + 1.15, fd / 2 - 0.35], [px, fh + 1.15, fd / 2 + 0.05], 0.05, 6, copper);
  });
  const furnace = fs.finish();
  batterParts(furnace, 0, fz, fw / 2, fd / 2, fh, 0.08);
  // the fuel and the ash behind the furnace room (unbattered, on the ground): the palm wood stacked in two layers by the
  // stoke hole, a heap of date stones (the Jerid's fuel), the ash raked out under the hole, palm fronds leaning on the
  // room's side
  sink.placed(0, 0, 0, fz, () => {
    const by = -fd / 2;
    for (let k = 0; k < 6; k++) {
      sink.cylinder('structureWood', [-fw / 2 + 0.15, 0.08 + Math.floor(k / 3) * 0.15, by - 0.12 - (k % 3) * 0.14], 'x', 1.0 + look() * 0.15, 0.07, 6,
        { colour: shade(TIMBER, 0.7 + look() * 0.3), decor: true });
    }
    for (let k = 0; k < 3; k++) sink.cylinder('structureWood', [-fw / 2 + 0.3 + k * 0.32, 0.36, by - 0.5], 'z', 0.44, 0.06, 6, { colour: shade(TIMBER, 0.65 + look() * 0.3), decor: true });
    sink.revolve('structureWood', [-fw / 2 - 0.15, -0.1, by - 0.34], 'y', [[0, 0.36], [0.14, 0.29], [0.28, 0.12], [0.32, 0]], 10, { colour: rgb(0x4a3020), decor: true });
    sink.revolve(MUD, [fw * 0.18, -0.1, by - 0.3], 'y', [[0, 0.42], [0.12, 0.32], [0.22, 0.14], [0.25, 0]], 10, { decor: true, shade: 0.42, tint: [0.7, 0.68, 0.66] });
    // (dome-detail-275) each frond splayed from its neighbours, its bare stem from the ground and its dry blade of leaflets
    // flat against the wall above
    const side: Face = { origin: [-fw / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: fd };
    for (let k = 0; k < 5; k++) {
      const u = -fd / 2 + 0.45 + k * 0.3 + look() * 0.1, tip = 2.0 + look() * 0.45, splay = (look() - 0.5) * 0.6, foot = 0.55 + look() * 0.3;
      const a = facePoint(side, u, 0, foot), m = facePoint(side, u + splay * 0.35, tip * 0.38, foot * 0.62 + 0.02), b = facePoint(side, u + splay, tip, 0.06);
      const ay = [b[0] - m[0], b[1] - m[1], b[2] - m[2]], l = Math.hypot(ay[0], ay[1], ay[2]);
      const ax: Vec3 = [0, -ay[2] / l, ay[1] / l], n = Math.hypot(ax[1], ax[2]) || 1;
      const flat: Vec3 = [(ax[1] / n) * ay[2] / l - (ax[2] / n) * ay[1] / l, (ax[2] / n) * ay[0] / l, -(ax[1] / n) * ay[0] / l];
      const tone = shade(rgb(0xa89062), 0.78 + look() * 0.25);
      sink.member('structureWood', a, b, 0.06, 0.045, flat, { colour: shade(tone, 0.85), decor: true, exposed: true });
      // the blade tapering from the stem's knee to its tip, both its faces
      const sx = ax[1] / n, sz = ax[2] / n, at = (p: Vec3, w: number, o: number): Vec3 => [p[0] + flat[0] * o, p[1] + sx * w, p[2] + sz * w];
      const blade: Vec3[] = [at(m, -0.19, 0.03), at(m, 0.19, 0.03), at(b, 0.03, 0.03), at(b, -0.03, 0.03)];
      sink.polygon('structureWood', blade, { colour: tone, decor: true });
      sink.polygon('structureWood', [...blade].reverse(), { colour: shade(tone, 0.8), decor: true });
    }
  });
  // the flue: a tapering mud stack from the furnace room's roof to over the great dome's haunch, its band at the bath's
  // roof, the soot darkening it upward, its cap on four stubs over the smoke's gaps
  const kx = fw * 0.22, kh = top + 2.7, sootY = top + 0.6;
  const soot = { shadeAt: (p: Vec3) => (p[1] > sootY ? Math.max(0.5, 1 - (p[1] - sootY) * 0.22) : 1) };
  sink.cylinder(MUD, [kx, fh, fz], 'y', kh - fh, 0.46 * Math.SQRT2, 4, soot, 0.33 * Math.SQRT2, true, Math.PI / 4);
  sink.cylinder(MUD, [kx, top + 0.1, fz], 'y', 0.16, 0.44 * Math.SQRT2, 4, { decor: true }, 0.44 * Math.SQRT2, true, Math.PI / 4);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) sink.span(MUD, kx + a * 0.33 - (a > 0 ? 0.14 : 0), kh, fz + b * 0.33 - (b > 0 ? 0.14 : 0), kx + a * 0.33 + (a < 0 ? 0.14 : 0), kh + 0.3, fz + b * 0.33 + (b < 0 ? 0.14 : 0), { shade: 0.5 });
  sink.span(MUD, kx - 0.45, kh + 0.3, fz - 0.45, kx + 0.45, kh + 0.44, fz + 0.45, { shade: 0.55 });
  const parts = sink.finish();
  for (const piece of [body, furnace]) for (const name of Object.keys(piece) as Array<keyof RegionalParts>) parts[name].push(...piece[name]);
  return parts;
};

/**
 * A collapsed ghorfa range: broken vault stubs and a slump of mud rubble. (dome-detail-275: two whole cells and two
 * cones of mud) A row of cells side by side, each fallen its own way: some still under the front of their vault, its
 * shell broken off ragged where the crown fell first and the rubble core showing in the break, the hoisting beam still
 * through its front; some open to the sky, their fronts broken off slanting and only the springers of the vault left;
 * some down to stubs of wall either side of the doorway. The party walls broken down in courses toward the back, the
 * fallen vaults heaped inside them, the render off the rubble here and there, a door leaf still hanging in some, a palm
 * beam leant against a front and the spill of mud and stone before the range.
 */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const W = Math.max(5.4, ctx.info.w - 0.3), D = Math.max(6, ctx.info.d - 0.3);
  const blue = pick(rng, BLUES);
  const cw = 2.1, n = Math.max(2, Math.floor(W / cw)), r = cw / 2, t = 0.32, fw = 0.42, shell = 0.26, zf = D / 2 - 1.0, zs = zf - fw;
  const core = { decor: true, tint: [0.9, 0.84, 0.74] as Rgb }, heap = { decor: true, shadow: true, tint: [0.95, 0.9, 0.82] as Rgb };
  const door: HoleRect = { u0: -0.36, u1: 0.36, y0: 0.15, y1: 1.15 };
  const fates: string[] = [];
  for (let i = 0; i < n; i++) {
    const fate = rng(), h = 1.6 + rng() * 0.5, d = Math.min(D - 1.6, D * (0.5 + rng() * 0.3));
    // (every range keeps one cell under the front of its vault and has one fallen open)
    let state = fate < 0.3 ? 'stub' : fate < 0.65 ? 'broken' : 'vault';
    if (i === n - 1 && !fates.includes('vault')) state = 'vault';
    else if (i === n - 1 && fates.every((f) => f === 'vault')) state = 'broken';
    fates.push(state);
    sink.placed(0, -n * cw / 2 + cw * (i + 0.5), 0, 0, () => {
      const zb = zf - d, run = d - fw, front: Face = { origin: [0, 0, zf], u: [1, 0, 0], out: [0, 0, 1], width: cw };
      // how far back the vault still stands; the party walls (each cell its right one, the first its left too) full
      // height under it and broken down in courses behind it
      const keep = state === 'vault' ? 0.3 + look() * 0.3 : state === 'broken' ? 0.12 + look() * 0.12 : 0;
      // (each length of wall its top sloping down from its last, a broken course stepping it here and there: spaced
      // blocks read as battlements)
      const sk = state === 'stub' ? 0 : Math.min(0.9, keep + 0.25 / run), m = Math.max(2, Math.round(run * (1 - sk) / 1.9));
      const cuts = [...(sk > 0 ? [0] : []), ...Array.from({ length: m + 1 }, (_, k) => sk + (1 - sk) * k / m)];
      for (const sx of i === 0 ? [-1, 1] : [1]) {
        let y = state === 'stub' ? 0.7 + look() * 0.5 : h;
        for (let k = 0; k + 1 < cuts.length; k++) {
          const flat = sk > 0 && k === 0, f = (cuts[k + 1] - sk) / (1 - sk);
          const y0 = flat ? h : Math.max(0.4, y + (look() - 0.5) * 0.24);
          const y1 = flat ? h : state === 'stub' ? 0.45 + look() * 0.6 : Math.max(0.45, h - f * (h - 0.55) * (0.8 + look() * 0.3) + (look() - 0.5) * 0.25);
          const za = zs - run * cuts[k], zc = zs - run * cuts[k + 1];
          sink.prism(MUD, [[0, -0.2, za], [0, -0.2, zc], [0, y1, zc], [0, y0, za]].map(([, py, pz]): Vec3 => [sx < 0 ? -r : r - t, py, pz]), [1, 0, 0], t);
          y = y1;
        }
      }
      // the back wall, broken lower
      for (const e of [-1, 1]) sink.span(MUD, e < 0 ? -r : 0, -0.2, zb, e < 0 ? 0 : r, 0.45 + look() * 0.7, zb + t);
      // the front: whole to the vault's springing under its tympanum, broken off slanting, or two stubs by the doorway
      if (state === 'stub') {
        for (const e of [-1, 1]) sink.span(MUD, e < 0 ? -r : door.u1 + 0.02, -0.2, zs, e < 0 ? door.u0 - 0.02 : r, 0.6 + look() * 0.5, zf);
      } else {
        const hl = state === 'vault' ? h : h + (look() - 0.3) * 0.6, hr = state === 'vault' ? h : Math.max(1.4, h * 0.75 + look() * 0.4);
        // (the cell behind it open to the sky: the wall's back drawn and no room's dark at the back of the doorway)
        holedPolygon(sink, MUD, front, [[-r, -0.2], [r, -0.2], [r, hr], [-r, hl]], [door], fw, 0, {}, [], [], true);
        faceBox(sink, 'structureWood', front, 0, door.y1 + 0.07, 0.03, 0.95, 0.1, 0.06, { colour: shade(TIMBER, 0.75), decor: true, fineSides: true });
        if (state === 'vault' || look() < 0.5) {
          // (a whole board: the cell behind it is open, its back seen)
          const la = facePoint(front, 0.05 - 0.31, door.y0 + 0.03, -fw + 0.08), lb = facePoint(front, 0.05 + 0.31, door.y1 - 0.03, -fw + 0.12);
          sink.span('structureWood', la[0], la[1], la[2], lb[0], lb[1], lb[2], { colour: look() < 0.5 ? shade(blue, 0.8) : shade(TIMBER, 0.85), decor: true, uv: UV_MEMBER });
        }
        // the render fallen off the rubble beside the door
        const su = (look() < 0.5 ? -1 : 1) * (0.68 + look() * 0.12);
        faceBox(sink, 'stone', front, su, 0.55 + look() * 0.5, 0.006, 0.42, 0.5 + look() * 0.3, 0.012, core);
      }
      if (state !== 'stub') {
        // the vault: its shell broken off where it fell, ragged (the crown first), the rubble core in the break; a broken
        // cell keeps only its springers
        const P = (a: number, rr: number, z: number): Vec3 => [Math.cos(a) * rr, h + Math.sin(a) * rr, z], N = 8;
        const len = Array.from({ length: N }, (_, j) => {
          const m = Math.sin(Math.PI * (j + 0.5) / N);
          const L = state === 'vault' ? (keep * run + 0.2) * (1 - m * (0.2 + look() * 0.3)) : (0.5 + look() * 0.6) * (1 - m * 1.6);
          return L < 0.15 ? 0 : L;
        });
        for (let j = 0; j < N; j++) {
          const a0 = Math.PI * j / N, a1 = Math.PI * (j + 1) / N, am = (a0 + a1) / 2, rad: Vec3 = [Math.cos(am), Math.sin(am), 0];
          if (len[j] > 0) {
            const ze = zs - len[j];
            facing(sink, MUD, [P(a0, r, zs), P(a1, r, zs), P(a1, r, ze), P(a0, r, ze)], rad, { decor: true });
            facing(sink, MUD, [P(a0, r - shell, zs), P(a1, r - shell, zs), P(a1, r - shell, ze), P(a0, r - shell, ze)], [-rad[0], -rad[1], 0], { decor: true, shade: 0.78 });
            facing(sink, 'stone', [P(a0, r - shell, ze), P(a0, r, ze), P(a1, r, ze), P(a1, r - shell, ze)], [0, 0, -1], core);
            if (state === 'broken') facing(sink, MUD, [P(a0, r - shell, zs), P(a0, r, zs), P(a1, r, zs), P(a1, r - shell, zs)], [0, 0, 1], { decor: true });
          }
          if (j + 1 < N && Math.abs(len[j] - len[j + 1]) > 0.01) {
            const zA = zs - Math.min(len[j], len[j + 1]), zB = zs - Math.max(len[j], len[j + 1]), tg: Vec3 = [-Math.sin(a1), Math.cos(a1), 0];
            facing(sink, 'stone', [P(a1, r - shell, zA), P(a1, r, zA), P(a1, r, zB), P(a1, r - shell, zB)], len[j] > len[j + 1] ? tg : [-tg[0], -tg[1], 0], core);
          }
        }
        if (state === 'vault') {
          // the tympanum over the front wall, and the hoisting beam still through it
          const arc = Array.from({ length: 9 }, (_, k): Vec3 => P(Math.PI * k / 8, r, zs));
          sink.prism(MUD, arc, [0, 0, 1], fw);
          trunkEnd(sink, front, (look() - 0.5) * 0.6, h + r * 0.5, 0.06, 0.8, 0.45 + look() * 0.2, shade(TIMBER, 0.7 + look() * 0.2), look());
        }
      }
      // the fallen vault heaped inside the walls, and its broken bricks on the heap
      const zm = zs - run * (keep + (1 - keep) * 0.5), mh = state === 'stub' ? 0.9 + look() * 0.3 : 0.6 + look() * 0.3;
      sink.cylinder(MUD, [0, -0.2, zm], 'y', mh + 0.2, r - 0.12, 9, heap, 0.3, true, look() * 3);
      if (run * (1 - keep) > 2.6) sink.cylinder(MUD, [0, -0.2, zm - run * (1 - keep) * 0.3], 'y', mh * 0.8, r - 0.2, 9, heap, 0.25, true, look() * 3);
      for (let k = 0; k < 2; k++) {
        // (each seated in the heap's slope where it lies)
        const bx = (look() - 0.5) * (r - 0.4), bz = zm + (look() - 0.5) * 0.8, sz = 0.16 + look() * 0.14, R0 = r - 0.12;
        const by = -0.2 + (mh + 0.2) * Math.max(0, Math.min(1, (R0 - Math.hypot(bx, bz - zm)) / (R0 - 0.3)));
        sink.span(look() < 0.5 ? 'stone' : MUD, bx - sz, by - 0.1, bz - sz * 0.7, bx + sz, by + sz * 0.6, bz + sz * 0.7, { decor: true, shade: 0.88, ...(look() < 0.5 ? { tint: core.tint } : {}) });
      }
      // the spill before the front: a low slump of mud and stones, a palm beam leant against the front on some
      if (state !== 'vault') {
        sink.cylinder(MUD, [(look() - 0.5) * 0.6, -0.2, zf + 0.35], 'y', 0.55 + look() * 0.2, 0.95, 9, heap, 0.3, true, look() * 3);
        for (let k = 0; k < 2; k++) {
          const bx = (look() - 0.5) * 1.6, bz = zf + 0.2 + look() * 0.8, sz = 0.12 + look() * 0.12;
          sink.span('stone', bx - sz, -0.05, bz - sz * 0.8, bx + sz, sz * 0.9, bz + sz * 0.8, { decor: true, tint: [0.88, 0.82, 0.72] });
        }
        if (state === 'broken' && look() < 0.7) {
          const u = (look() < 0.5 ? -1 : 1) * (0.55 + look() * 0.25);
          sink.pipe('structureWood', [u + 0.2, 0.07, zf + 1.05], [u, 1.25 + look() * 0.1, zf - 0.03], 0.075, 6, { colour: shade(TIMBER, 0.6 + look() * 0.2), decor: true, caps: true });
        }
      }
    });
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
  // (props census #23, the looks lane 2026-10-15) member-built in souqs.ts: footings, the wall's courses and its store door
  souqStall(sink, look, W, D, top, { mud: MUD });
}

const KSAR_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
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
    // (buildings-270, the census and the batch-1 A/B: under the sourced plaster photo no tone the map gave the walls showed,
    // and the houses stayed the sand's own colour) the walls the procedural mud plaster under lime wash
    // (regionalSurfaces.ts paintLimeRender since the round-3 pairs: the soft wash read flat beside the photos' weathered mud),
    // each family's tone measured on that canvas against the Dahar photos: the ochre
    // mud-lime render (the map's plaster, #d0a671 against #c79a5a-#d8b47a), the warm lime wash of the houses and cell bands
    // (#d4cec4), the older, deeper ochre (#ce955a)
    sourced: { plaster: false, wood: true },
    render: { kind: 'limeRender', seed: 0x4b3d },
    tones: {
      plaster: (_h, s, l) => [0.095, Math.min(1, s * 0.4 + 0.36), Math.min(1, l + 0.2)],
      // (the round-2 critics: the cool lime wash read grey and washed out) a warm lime wash (#d4cec4) and the older, deeper
      // ochre (#ce955a against #a87842)
      plaster2: (_h, s, l) => [0.1, Math.min(1, s * 0.25 + 0.14), Math.min(1, l * 0.6 + 0.5)],
      plaster3: (_h, s, l) => [0.085, Math.min(1, s * 0.4 + 0.5), Math.min(1, l + 0.08)],
    },
  },
  builders: KSAR_BUILDERS,
  // mud render from fresh pale clay to an older ochre house to house (Ouled Soltane's courts are both); a dry climate
  // (little damp, no moss)
  weather: {
    plaster: [[1, 1, 1], [1.04, 1.02, 0.98], [0.95, 0.9, 0.82], [0.9, 0.84, 0.74], [1.06, 1.05, 1.02]],
    stone: [[1, 1, 1], [0.94, 0.92, 0.9]],
    roof: [[1, 1, 1], [0.9, 0.86, 0.82]],
  },
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
  rc: number, batter: number, ph: number, t = 0.32, more: { horn?: number; vented?: readonly Side[]; ledge?: number; salt?: number } = {}): (name: Side, y: number) => Face {
  // (dome-detail-275) `more`: the parapet's horns and vents (kershefParapet); a `ledge` corbelled out that far round the
  // crown on a sloped course under it (a gallery's floor); the salt's pale crust `salt` metres up the foot
  const ring = (inset: number, y: number) => roundedRing(x0, z0, x1, z1, rc, inset, y), at = (y: number) => batter * (y - yb) / (top - yb);
  const ledge = more.ledge ?? 0, wallTop = ledge > 0 ? top - 0.42 : top;
  const base = ring(0, yb), wallCrown = ring(at(wallTop), wallTop);
  if (more.salt) {
    const ys = yb + more.salt, foot = ring(at(ys), ys);
    ringBand(sink, bucket, base, foot, false, { tintAt: (p: Vec3): Rgb => (p[1] < ys - 0.01 ? [1.1, 1.1, 1.09] : [1, 1, 1]) });
    ringBand(sink, bucket, foot, wallCrown);
  } else ringBand(sink, bucket, base, wallCrown, false, {}, new Set());
  let inset = at(wallTop);
  if (ledge > 0) {
    inset = at(top) - ledge;
    const lip = ring(inset, top - 0.2);
    ringBand(sink, bucket, wallCrown, lip, false, { shade: 0.9 });
    ringBand(sink, bucket, lip, ring(inset, top));
  }
  const crown = ring(inset, top);
  sink.polygon(bucket, crown);
  sink.polygon(bucket, [...base].reverse());
  kershefParapet(sink, bucket, x0, z0, x1, z1, rc, inset, top, ph, t, more.horn ?? 0, more.vented ?? []);
  const sideAt = (name: Side, y: number): Face => {
    const i = at(Math.min(y, wallTop));
    const fx0 = x0 + rc, fx1 = x1 - rc, fz0 = z0 + rc, fz1 = z1 - rc;
    if (name === 'front') return { origin: [(fx0 + fx1) / 2, 0, z1 - i], u: [1, 0, 0], out: [0, 0, 1], width: fx1 - fx0 };
    if (name === 'back') return { origin: [(fx0 + fx1) / 2, 0, z0 + i], u: [-1, 0, 0], out: [0, 0, -1], width: fx1 - fx0 };
    if (name === 'right') return { origin: [x1 - i, 0, (fz0 + fz1) / 2], u: [0, 0, -1], out: [1, 0, 0], width: fz1 - fz0 };
    return { origin: [x0 + i, 0, (fz0 + fz1) / 2], u: [0, 0, 1], out: [-1, 0, 0], width: fz1 - fz0 };
  };
  return sideAt;
}

/**
 * The parapet on a rounded crown ring (`inset` in from x0..x1 x z0..z1 at `top`, corners of radius rc): its outer face
 * leaning in 6 cm to a bevelled crest `ph` over the roof, its inner face `t` in from the outer down to the roof. (Round 3,
 * gauntlet wave 358b: "pale stacked boxes with crisp edges and almost no openings") the corners rise into Siwa's rounded
 * horns, `horn` at each corner's middle and 0.45 of it along the straight runs; on the `vented` sides a row of small
 * triangular vents is pierced through the parapet, as Siwa's builders pierced theirs: through holes, their reveals the
 * parapet's thickness, the terrace and the sky seen through them (no dark plate laid on the mud).
 */
function kershefParapet(sink: PartSink, bucket: RegionalBucket, x0: number, z0: number, x1: number, z1: number, rc: number, inset: number, top: number,
  ph: number, t: number, horn: number, vented: readonly Side[]): void {
  const crown = roundedRing(x0, z0, x1, z1, rc, inset, top);
  const out1 = horned(roundedRing(x0, z0, x1, z1, rc, inset + 0.06, top + ph), horn), crest = horned(roundedRing(x0, z0, x1, z1, rc, inset + 0.06 + t / 2, top + ph + 0.1), horn);
  const in1 = horned(roundedRing(x0, z0, x1, z1, rc, inset + 0.06 + t, top + ph), horn), in0 = roundedRing(x0, z0, x1, z1, rc, inset + 0.06 + t, top);
  const skip = new Set(vented.map((name) => SIDE_SEGMENT[name]));
  ringBand(sink, bucket, crown, out1, false, {}, skip);
  ringBand(sink, bucket, out1, crest);
  ringBand(sink, bucket, in1, crest, true);
  ringBand(sink, bucket, in0, in1, true, { shade: 0.86 }, skip);
  for (const name of vented) {
    const k = SIDE_SEGMENT[name], j = (k + 1) % crown.length;
    const L = Math.hypot(crown[j][0] - crown[k][0], crown[j][2] - crown[k][2]), H = out1[k][1] - top;
    const nv = Math.max(2, Math.floor((L - 0.4) / 0.85)), v0 = (ph * 0.35) / H, v1 = (ph * 0.35 + 0.22) / H;
    if (L < 0.8 || v1 > 0.9) {
      ringBand(sink, bucket, [crown[k], crown[j]], [out1[k], out1[j]], false, {}, new Set([1]));
      ringBand(sink, bucket, [in0[k], in0[j]], [in1[k], in1[j]], true, { shade: 0.86 }, new Set([1]));
      continue;
    }
    const vents = Array.from({ length: nv }, (_, i) => ({ s: (0.2 + (i + 0.5) * (L - 0.4) / nv) / L, hw: 0.1 / L, v0, v1 }));
    const outer = bandPoint(crown[k], crown[j], out1[j], out1[k]), inner = bandPoint(in0[k], in0[j], in1[j], in1[k]);
    ventedBand(sink, bucket, outer, vents, false, {});
    ventedBand(sink, bucket, inner, vents, true, { shade: 0.86 });
    // each vent's reveal through the parapet: its sill facing up, its two raking sides facing into the hole
    for (const v of vents) {
      const eL: [number, number] = [v.s - v.hw, v.v0], eR: [number, number] = [v.s + v.hw, v.v0], eA: [number, number] = [v.s, v.v1];
      const mid = outer(v.s, (2 * v.v0 + v.v1) / 3);
      for (const [a, b] of [[eL, eR], [eL, eA], [eA, eR]] as const) {
        const m = outer((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        const n: Vec3 = a === eL && b === eR ? [0, 1, 0] : [mid[0] - m[0], mid[1] - m[1], mid[2] - m[2]];
        facing(sink, bucket, [outer(a[0], a[1]), outer(b[0], b[1]), inner(b[0], b[1]), inner(a[0], a[1])], n, { shade: a === eL && b === eR ? 0.86 : 0.7 });
      }
    }
  }
}

/** The corners' horns (kershefParapet): each arc's points lifted toward its middle (RING_ARC points to an arc). */
const HORN_SHAPE: readonly number[] = [0, 0.5, 1, 0.5, 0];
function horned(ring: Array<[number, number, number]>, horn: number): Array<[number, number, number]> {
  return horn > 0 ? ring.map(([x, y, z], i): [number, number, number] => [x, y + horn * (0.45 + 0.55 * HORN_SHAPE[i % RING_ARC]), z]) : ring;
}

/** A planar band quad (a, b along its foot, c, d over them) as a map of (s along it, v up it) in 0..1. */
function bandPoint(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]): (s: number, v: number) => Vec3 {
  return (s, v) => {
    const lo = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
    const hi = [d[0] + (c[0] - d[0]) * s, d[1] + (c[1] - d[1]) * s, d[2] + (c[2] - d[2]) * s];
    return [lo[0] + (hi[0] - lo[0]) * v, lo[1] + (hi[1] - lo[1]) * v, lo[2] + (hi[2] - lo[2]) * v];
  };
}

/**
 * A band (bandPoint) with triangular vents through it, each from its sill at v0 (s ± hw) to its apex at v1: the band in
 * columns at the vents' corners, each column's parts round its vent convex. Wound to face out of the ring (or in).
 */
function ventedBand(sink: PartSink, bucket: RegionalBucket, at: (s: number, v: number) => Vec3, vents: ReadonlyArray<{ s: number; hw: number; v0: number; v1: number }>,
  inward: boolean, opts: { shade?: number }): void {
  const cuts = [...new Set([0, 1, ...vents.flatMap((v) => [v.s - v.hw, v.s, v.s + v.hw])])].sort((p, q) => p - q);
  const emit = (pts: ReadonlyArray<readonly [number, number]>): void => {
    const q = pts.map(([s, v]) => at(s, v));
    sink.polygon(bucket, inward ? q.reverse() : q, opts);
  };
  for (let i = 0; i + 1 < cuts.length; i++) {
    const sa = cuts[i], sb = cuts[i + 1];
    if (sb - sa < 1e-6) continue;
    const left = vents.find((v) => Math.abs(v.s - v.hw - sa) < 1e-9 && Math.abs(v.s - sb) < 1e-9);
    const right = vents.find((v) => Math.abs(v.s - sa) < 1e-9 && Math.abs(v.s + v.hw - sb) < 1e-9);
    const v = left ?? right;
    if (!v) { emit([[sa, 0], [sb, 0], [sb, 1], [sa, 1]]); continue; }
    emit([[sa, 0], [sb, 0], [sb, v.v0], [sa, v.v0]]);
    emit(left ? [[sa, v.v0], [sb, v.v1], [sb, 1], [sa, 1]] : [[sa, v.v1], [sb, v.v0], [sb, 1], [sa, 1]]);
  }
}

/** Each straight side's segment in roundedRing's ring: a corner's RING_ARC points, then the side to the next corner. */
const RING_ARC = 5;
const SIDE_SEGMENT: Readonly<Record<Side, number>> = Object.freeze({ left: RING_ARC - 1, front: 2 * RING_ARC - 1, right: 3 * RING_ARC - 1, back: 4 * RING_ARC - 1 });

/** A quad wound to face `n` (the side its normal must point to). */
function facing(sink: PartSink, bucket: RegionalBucket, q: readonly Vec3[], n: Vec3, opts: EmitOptions = {}): void {
  const [a, b, c] = q;
  const cx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const o = cx * n[0] + cy * n[1] + cz * n[2] >= 0 ? q : [...q].reverse();
  sink.quad(bucket, o[0], o[1], o[2], o[3], opts);
}

/** A block's four sides in the house grammar's order. */
const SIDES: readonly Side[] = ['front', 'right', 'back', 'left'];
/** The share of a kershef house's windows behind palm-plank shutters (E10), and the dress over which a palm lintel heads one (E11). */
const SHUTTERED = 0.5, LINTELLED = 0.68;

/**
 * A kershef window (props census #26 cut it through the mass; WORKPLAN-227 §5 builds it as Verdant's are, through
 * windowUnit): a small opening deep in the wall, its palm-wood frame and a palm-rib mullion at the back of the reveal,
 * the mud worked out round it into a lip, a palm board for its sill through the reveal; on some palm-plank shutters, on
 * others a palm-wood lintel over it.
 */
function kershefWindow(wall: RegionalBucket, dress: number, tone: Rgb): WindowStyle {
  return {
    frame: shade(tone, 0.85), frameWidth: 0.05, frameOut: 0.04, bars: 'two',
    // (a window under a palm lintel has no lip: the lintel bears on the mud either side of it)
    surround: dress > LINTELLED ? null : { bucket: wall, width: 0.09, out: 0.04 },
    sill: { bucket: 'structureWood', out: 0.06, colour: shade(PALM, 0.75) },
    // (closed, most of them, against the sun: the leaves inside the deep reveal)
    shutters: dress < SHUTTERED ? { colour: tone, kind: 'plank', closed: 0.65 } : null,
    head: dress > LINTELLED ? { kind: 'lintel', bucket: 'structureWood', h: 0.12, out: 0.1, ext: 0.12, colour: shade(PALM, 0.8) } : null,
  };
}

/** A block's side along its straight run (the wall between its rounded corners, at its foot), `out` past the wall. */
function runFace(x0: number, z0: number, x1: number, z1: number, rc: number, name: Side, out = 0): Face {
  const fx0 = x0 + rc, fx1 = x1 - rc, fz0 = z0 + rc, fz1 = z1 - rc;
  if (name === 'front') return { origin: [(fx0 + fx1) / 2, 0, z1 + out], u: [1, 0, 0], out: [0, 0, 1], width: fx1 - fx0 };
  if (name === 'back') return { origin: [(fx0 + fx1) / 2, 0, z0 - out], u: [-1, 0, 0], out: [0, 0, -1], width: fx1 - fx0 };
  if (name === 'right') return { origin: [x1 + out, 0, (fz0 + fz1) / 2], u: [0, 0, -1], out: [1, 0, 0], width: fz1 - fz0 };
  return { origin: [x0 - out, 0, (fz0 + fz1) / 2], u: [0, 0, 1], out: [-1, 0, 0], width: fz1 - fz0 };
}

/** (WORKLIST #26 "salt bands") the salt the ground draws up the kershef: a pale crust at the wall's foot fading up it. */
function saltCrust(list: readonly THREE.BufferGeometry[], foot: number): void {
  for (const g of list) {
    const pos = g.getAttribute('position');
    if (!pos) continue;
    let tint = g.getAttribute('tint') as THREE.BufferAttribute | undefined;
    if (!tint) { tint = new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3); g.setAttribute('tint', tint); }
    for (let i = 0; i < pos.count; i++) {
      const t = 1.1 - 0.1 * Math.max(0, Math.min(1, (pos.getY(i) - foot) / 1.1));
      tint.setXYZ(i, tint.getX(i) * t, tint.getY(i) * t, tint.getZ(i) * t * 0.99);
    }
  }
}

/** Add parts built in other sinks to a builder's own. */
function withParts(parts: RegionalParts, more: readonly RegionalParts[]): RegionalParts {
  for (const m of more) for (const name of Object.keys(m) as Array<keyof RegionalParts>) parts[name].push(...m[name]);
  return parts;
}

/**
 * A kershef block from y0, h high, over x0..x1 x z0..z1, as Shali's houses stand, built the way Verdant's houses are
 * (WORKPLAN-227 §5, the looks lane 2026-10-17). The house grammar lays its body (house.ts buildHouse): on the ground a
 * footing course of the rock the town stands on, the storeys' walls cut by their openings in reveals the kershef's
 * thickness deep, the palm-framed windows and the plank door in them with the stone steps up to its sill, the facade
 * craft's sill runs, spall and foot grime, and its plan for the damage reading. Its corners are then worn round
 * (roundedBody.ts; Oasis round 3, wave 135: "sharp-cornered boxes ... nothing like Shali's slumped, rounded grey-beige
 * salt-mud masses": a fifth of the block across), its parapet laid on the rounded crown with its horns and vents
 * (kershefParapet), and the whole battered in as it rises (batterParts). The region's craft over the grammar's: the palm
 * beams' ends under the parapet, the salt-rock lumps standing proud of the render, palm-wood rain spouts through the
 * parapet, a palm-trunk hood over the door and its doorway limewashed, a bench and a jar beside it, the clods fallen at
 * the wall's foot and on some terraces a jerid shade. A block in a cluster dresses its outer `faces` only. Its parts are
 * built in sinks of its own and returned for the builder to add (withParts); its dressing on the lane goes to `sink`.
 */
function kershefBlock(sink: PartSink, x0: number, z0: number, x1: number, z1: number, y0: number, h: number, bucket: RegionalBucket,
  rng: () => number, look: () => number, opts: { door?: boolean; faces?: ReadonlyArray<Side>; shade?: boolean; packed?: boolean; onto?: KershefPlan | null } = {}):
  { parts: RegionalParts; plan: KershefPlan | null } {
  const ground = y0 === 0, top = y0 + h;
  const batter = Math.min(0.45, 0.08 * (top - (ground ? -0.3 : y0))) * (0.8 + look() * 0.4);
  const rc = Math.max(batter + 0.3, Math.min(1.7, Math.min(x1 - x0, z1 - z0) * 0.21));
  const ph = 0.45 + look() * 0.2, horn = 0.34 + look() * 0.26;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const run = (name: Side): number => (name === 'front' || name === 'back' ? W : D) - 2 * rc;
  const faces = opts.faces ?? SIDES;
  // the footing course (E1, and its water table E2): the town's rock a hand over the lane under the ground storeys
  const foot = ground ? 0.24 + look() * 0.1 : 0;
  // its floors 2.9 m or so apart, the windows in a row to each; the walls one lift of mud from the footing to the roof
  // (the grammar's storey: the kershef was raised in courses, not floor by floor)
  const storeys = Math.max(1, Math.round((h - foot) / 2.9)), sh = (h - foot) / storeys;
  const door = opts.door && ground ? { u: (rng() - 0.5) * Math.max(0, run('front') - 2.4) * 0.6, w: 0.95, h: 1.95 } : null;
  const openings: Opening[] = door ? [{ face: 'front', storey: 0, kind: 'door', u: door.u, w: door.w, y0: 0, h: door.h }] : [];
  const dressing = new Map<Opening, { dress: number; tone: Rgb }>();
  for (const name of faces) {
    // (round 3, gauntlet wave 358b: "almost no openings") small square windows in rows storey by storey along the
    // straight runs, fewer on the ground storey and clear of the doorway
    const width = run(name);
    for (let st = 0; st < storeys; st++) {
      const low = st === 0 && ground, sill = low ? 1.3 - foot : 1.15;
      if (sill + 0.62 > sh - 0.35) continue;
      // (a block packed in old Shali's heap, its windows sparser: the heap's many faces carry the town's openings)
      const m = Math.max(1, Math.floor((width - 0.6) / (low ? (opts.packed ? 2.1 : 1.5) : (opts.packed ? 1.8 : 1.2))));
      for (let k = 0; k < m; k++) {
        if (rng() < (low ? (opts.packed ? 0.45 : 0.38) : (opts.packed ? 0.3 : 0.16))) continue;
        const u = -width / 2 + 0.3 + (k + 0.5) * (width - 0.6) / m + (rng() - 0.5) * 0.2;
        const w = 0.42 + look() * 0.14, hh = 0.48 + look() * 0.14, dress = look(), tone = look() < 0.5 ? PALM : PALM_GREY;
        // its reach along the wall: room for its shutters folded back beside it, whether it has them or not (no window
        // dropped for its dress); the corners' arcs stay clear
        const reach = w + 0.06;
        if (Math.abs(u) + reach > width / 2) continue;
        if (name === 'front' && door && low && Math.abs(u - door.u) < door.w / 2 + 0.45 + reach) continue;
        const o: Opening = { face: name, storey: 0, kind: 'window', u, w, y0: st * sh + sill, h: hh };
        openings.push(o);
        dressing.set(o, { dress, tone });
      }
    }
  }
  const vents = faces.filter(() => look() < 0.5);
  const dialect: HouseDialect = {
    window: (s, face, o, fy) => {
      const d = dressing.get(o) ?? { dress: 0.5, tone: PALM };
      windowUnit(s, face, o.u, fy + o.y0, o.w, o.h, kershefWindow(bucket, d.dress, d.tone), rng, 0.3);
    },
    door: (s, face, o, fy) => {
      doorUnit(s, face, o.u, fy + o.y0, o.w, o.h, { leaf: PALM, frame: { bucket: 'structureWood', width: 0.1, out: 0.04, colour: shade(PALM, 0.8) },
        steps: { bucket: 'stone' }, leafKind: 'plank' }, fy + o.y0);
      // the palm-trunk lintel over it, its ends bedded in the wall
      palmLog(s, face, o.u - o.w / 2 - 0.25, o.u + o.w / 2 + 0.25, fy + o.y0 + o.h + 0.09, 0.08, shade(PALM, 0.75));
    },
  };
  const hs = new PartSink(sink.uvOffset);
  let plan: HouseFrame | null = null;
  hs.placed(0, cx, y0, cz, () => {
    // (E15: its rain goods, the palm spouts this builder lays through the parapet with its own roof)
    // (a room on a roof is described as the upper storeys of the house under it, its own plan folded into that one's:
    // stackPlan)
    const house = (): HouseFrame => buildHouse(hs, {
      // (the footing is rubble with no dressed course over it: the mud band at the wall's foot is its band)
      w: W, d: D, plinth: ground ? { h: foot, out: 0.07, bucket: 'stone', course: false } : null,
      storeys: [{ h: h - foot, wall: bucket }],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0, verge: 0, thickness: 0.3, bucket, parapet: ph }, ownRoof: true,
      gableBucket: bucket, openings, chimneys: [], gutters: { colour: PALM }, verge: null, reveal: 0.34, core: 'adobe',
      // (no stone apron round a Siwan house: the lane's sand runs to its footing)
      skirt: null,
    }, dialect);
    const frame = plan = opts.onto ? withHousePlans(house)[0] : house();
    if (!door) return;
    const f = frame.faces.front, fy = frame.floors[0], e = door.w / 2 + 0.1, band = 0.42 + look() * 0.18;
    // the doorway limewashed round its frame on most houses (E16), its head over the lintel
    const limed = look() < 0.65;
    if (limed) {
      const head = fy + door.h + 0.1;
      paintBand(hs, 'plaster3', f, door.u - e - 0.32, door.u + e + 0.32, fy, head, [1, 1, 1], [[door.u - e, door.u + e]]);
      paintBand(hs, 'plaster3', f, door.u - e - 0.32, door.u + e + 0.32, head, head + 0.38, [1, 1, 1]);
    }
    // (E2) a house's wall foot rendered in a darker mud over its footing, a band round the body (bent round its corners
    // with the walls), broken at the doorway and its limewash (the blind pair: a band run across the door read as a block
    // in its foot)
    for (const name of SIDES) {
      const g = frame.faces[name], gap: Array<[number, number]> = name === 'front' ? [limed ? [door.u - e - 0.32, door.u + e + 0.32] : [door.u - e, door.u + e]] : [];
      paintBand(hs, bucket, g, -g.width / 2, g.width / 2, fy, fy + band, [0.8, 0.72, 0.63], gap);
    }
    // the hood over the door (E13): palm trunks cantilevered out of the wall over its lintel, a mud slab laid on them, a
    // lean-to roof on the wall with no posts
    const y = fy + door.h + 0.3, out = 0.6, n = 6;
    for (let k = 0; k < n; k++) {
      const u = door.u - 0.72 + 1.44 * (k + 0.5) / n;
      trunkEnd(hs, f, u, y, 0.06, out + 0.06, out, shade(PALM, 0.85 + look() * 0.25), look());
    }
    leanTo(hs, { face: f, u0: door.u - 0.8, u1: door.u + 0.8, depth: out, highY: y + 0.055, posts: null,
      roof: { pitchDeg: 5, eave: 0.03, verge: 0.03, thickness: 0.1, bucket, decor: true } });
  });
  const body = hs.finish(), box: BodyBox = { x0, z0, x1, z1 };
  // (the floors between its storeys, its underside and its footing's buried base stay whole: hidden in the body)
  roundBody(body, box, rc, { uncut: (y, ny) => (y > y0 + foot + 1e-3 && y < top - 1e-3) || y < y0 - 0.05 || (ny < -0.5 && Math.abs(y - y0 - foot) < 1e-3) });
  if (ground) saltCrust(body[bucket], foot);
  // the crown and the region's craft on the rounded body, battered with it
  const ps = new PartSink(sink.uvOffset);
  kershefParapet(ps, bucket, x0, z0, x1, z1, rc, 0, top, ph, 0.32, horn, vents);
  const at = (name: Side, out = 0): Face => runFace(x0, z0, x1, z1, rc, name, out);
  const clear = (name: Side, u: number, y: number, r: number): boolean => !openings.some((o) => {
    const oy = y0 + foot + o.y0;
    return o.face === name && Math.abs(o.u - u) < o.w / 2 + r + (o.kind === 'door' ? 0.5 : 0.28) && y > oy - r - 0.15 && y < oy + o.h + r + 0.2;
  });
  for (const name of faces) {
    // (round 3, wave 358b) the palm beams' ends in a row under the parapet, a few missing; (wave 135: "neat rectangular
    // planks rather than round palm trunks") each a trunk's round end standing out of the wall
    const fb = at(name), n = Math.max(2, Math.floor(fb.width / (opts.packed ? 0.95 : 0.75)));
    for (let k = 0; k < n; k++) {
      if (look() < 0.18) continue;
      const u = -fb.width / 2 + (k + 0.5) * fb.width / n + (look() - 0.5) * 0.12, end = 0.07 + look() * 0.03;
      // (the blind pair: five-sided dark ends read as rocks) seven sides on a house, the sun-greyed palm among them
      trunkEnd(ps, fb, u, top - 0.25, end, 0.3, 0.25, shade(look() < 0.5 ? PALM : PALM_GREY, 0.85 + look() * 0.3), 0, opts.packed ? 5 : 7);
    }
    // the kershef's lumps: the salt-rock in the mud standing proud of the render here and there
    for (let k = 0, m = (opts.packed ? 0 : 2) + Math.floor(look() * (opts.packed ? 2.5 : 3)); k < m; k++) {
      const yy = y0 + foot + 0.3 + look() * (h - foot - 0.9), u = (look() - 0.5) * (fb.width - 0.6), sz = 0.12 + look() * 0.12;
      if (clear(name, u, yy, sz)) faceBox(ps, bucket, fb, u, yy, 0.02, sz * 1.4, sz, 0.05, { decor: true, shade: 0.9 + look() * 0.15 });
    }
  }
  // the rain spouts (E15): palm-wood channels through the parapet at the roof, open along their tops (a sole board and
  // two sides), one or two to a roof on its first dressed side, never over the door
  // (a room on a roof drains onto the terrace below it: the blind pair read its spout as a trough over the roofline)
  if (ground) {
    const name = faces[0], f = at(name), sp = { colour: PALM, decor: true, uv: UV_MEMBER } as const;
    for (const u of f.width > 3.6 && look() < 0.5 ? [-f.width * 0.28, f.width * 0.28] : [(look() - 0.5) * f.width * 0.5]) {
      if (name === 'front' && door && Math.abs(u - door.u) < 0.9) continue;
      faceBox(ps, 'structureWood', f, u, top - 0.015, 0.03, 0.16, 0.03, 0.9, sp);
      for (const s of [-1, 1]) faceBox(ps, 'structureWood', f, u + s * 0.08, top + 0.03, 0.03, 0.03, 0.09, 0.9, { ...sp, colour: shade(PALM, 0.85) });
    }
  }
  // (round 3) the clods fallen from the crest, heaped at the wall's foot past the footing (dressing on the ground)
  if (ground) for (const name of faces) {
    const ff = at(name, 0.07), clods = 1 + Math.floor(look() * (opts.packed ? 2 : 3));
    for (let k = 0; k < clods; k++) {
      const u = (look() - 0.5) * (ff.width - 0.8), r = 0.12 + look() * 0.12;
      const c = facePoint(ff, u, -0.06, r * 0.6);
      ps.cylinder(KERSHEF_OLD, c, 'y', 0.08 + r * 0.5, r, 5, { decor: true }, r * 0.35, true, look() * 3);
    }
  }
  // (round 3) a jerid shade on the roof terrace: four palm posts and a mat of palm ribs on their beams, in the terrace's
  // back corner and inside its rounded parapet (its posts within the inner face's arc)
  if (opts.shade) {
    const inner = 0.06 + 0.32, off = Math.max(inner + 0.15, rc - (rc - inner - 0.12) / Math.SQRT2);
    const sx0 = x0 + off, sz0 = z0 + off, sw = Math.min(2.6, W - 2 * off), sd = Math.min(2.4, D - 2 * off);
    if (sw > 1.2 && sd > 1.2) {
      const hs2 = 1.95, palm = { colour: shade(PALM, 0.9), decor: true, uv: UV_MEMBER } as const;
      for (const [px, pz] of [[sx0, sz0], [sx0 + sw, sz0], [sx0, sz0 + sd], [sx0 + sw, sz0 + sd]] as const) ps.span('structureWood', px - 0.06, top - 0.02, pz - 0.06, px + 0.06, top + hs2, pz + 0.06, palm);
      for (const pz of [sz0, sz0 + sd]) ps.span('structureWood', sx0 - 0.1, top + hs2 - 0.02, pz - 0.06, sx0 + sw + 0.1, top + hs2 + 0.1, pz + 0.06, palm);
      const mat = shade(PALM_GREY, 0.95 + look() * 0.1);
      ps.span('structureWood', sx0 - 0.25, top + hs2 + 0.1, sz0 - 0.2, sx0 + sw + 0.25, top + hs2 + 0.16, sz0 + sd + 0.2, { colour: mat, decor: true });
      // (the integrity gate: an open frame on the roof read as a see-through gap) its back and its two ends screened with
      // jerid panels from the terrace to the mat, as Siwa's roof shelters stand against the wind; open to the terrace
      const screen = { colour: shade(mat, 0.92), decor: true } as const;
      ps.span('structureWood', sx0 - 0.02, top - 0.02, sz0 - 0.04, sx0 + sw + 0.02, top + hs2 + 0.1, sz0 + 0.0, screen);
      for (const x of [sx0, sx0 + sw]) ps.span('structureWood', x - 0.02, top - 0.02, sz0, x + 0.02, top + hs2 + 0.1, sz0 + sd, screen);
    }
  }
  withParts(body, [ps.finish()]);
  batterParts(body, cx, cz, W / 2, D / 2, top, batter, y0);
  // the lived-in dressing by the door (E17), on the lane: a palm-wood bench against the wall to one side, a jar on the other
  if (door) {
    const f = at('front', 0.12), len = 1.1 + look() * 0.4, half = f.width / 2, first = look() < 0.5 ? 1 : -1;
    let jar = -first;
    for (const s of [first, -first]) {
      const ub = door.u + s * (door.w / 2 + 0.85 + len / 2);
      if (Math.abs(ub) + len / 2 > half - 0.1) continue;
      bench(sink, f, ub, len, shade(PALM, 0.9 + look() * 0.15));
      jar = -s;
      break;
    }
    // (the blind pair: the same bright pot at every door read as a toy) a smaller one by some doors
    const uj = door.u + jar * (door.w / 2 + 0.75);
    if (look() < 0.4 && Math.abs(uj) < half - 0.3) {
      const p = facePoint(f, uj, 0, 0.3);
      pottedPlant(sink, p[0], 0, p[2], 0.42, look);
    }
  }
  if (!plan) return { parts: body, plan: null };
  batteredPlan(plan, batter, top - y0, storeys);
  if (opts.onto) stackPlan(opts.onto, plan, [cx, y0, cz]);
  return { parts: body, plan: { frame: plan, at: [cx, y0, cz] } };
}

/** A kershef block's house plan and the origin of its frame (the block's foot in the builder's frame). */
interface KershefPlan { frame: HouseFrame; at: readonly [number, number, number] }

/**
 * A room on a roof described as the upper storeys of the house it stands on (houseDamage: its own body's collapse
 * left its walls' stubs standing in the air over the heap of the house under it): its bands appended to that plan,
 * moved into its frame, its openings re-hung in them, the plan's eave and roof the room's.
 */
function stackPlan(base: KershefPlan, room: HouseFrame, at: readonly [number, number, number]): void {
  const dx = at[0] - base.at[0], dy = at[1] - base.at[1], dz = at[2] - base.at[2];
  const b = base.frame, n = b.bodies.length;
  for (const r of room.bodies) b.bodies.push({ x0: r.x0 + dx, x1: r.x1 + dx, z0: r.z0 + dz, z1: r.z1 + dz, y0: r.y0 + dy, y1: r.y1 + dy });
  b.floors.push(...room.floors.map((y) => y + dy));
  b.spec.storeys.push(...room.spec.storeys);
  for (const o of room.spec.openings) b.spec.openings.push({ ...o, storey: o.storey + n });
  b.eaveY = room.eaveY + dy;
  b.roof = roofGeometry(room.roof.s * 2, room.roof.halfD * 2, b.eaveY, b.spec.roof);
}

/**
 * The plan the damage reads, made to follow the batter (the coordinator, 2026-10-17: a breach the damage draws on the
 * grammar's upright face stood up to the batter off the leaning wall — the floating dark patch the owner flags): the
 * storey cut at the house's floors (`floors` of them, its window rows one to each), each floor's body drawn in by the
 * batter seven tenths up it (batterParts: `batter` at the block's top, `span` over its foot), the openings re-hung in
 * their floors, the roof over the top one. The walls drawn are the grammar's one lift of mud battered whole; only the
 * description the damage reads changes, so a breach at a tank's gun height lands within a hand of the leaning wall
 * (houseDamage: the cuts are real floors — a roof's fall stops on the top floor, a stub stands from the ground floor).
 * The rounded corners stay outside the description (its faces run the body's full width, so a wall panel's fall takes
 * its corners): a breach centred on a corner's arc still stands off it by up to the arc's depth there. Run after the
 * builder's own last use of the openings (their heights become their floors').
 */
function batteredPlan(frame: HouseFrame, batter: number, span: number, floors: number): void {
  const spec = frame.spec, b0 = frame.bodies[0], foot = b0.y0, top = b0.y1;
  const cuts = Array.from({ length: floors + 1 }, (_, k) => foot + (top - foot) * k / floors);
  const wall = spec.storeys[0];
  const bands = cuts.slice(0, -1).map((y0, k) => {
    const y1 = cuts[k + 1], inset = batter * (y0 + 0.7 * (y1 - y0)) / span;
    return { x0: b0.x0 + inset, x1: b0.x1 - inset, z0: b0.z0 + inset, z1: b0.z1 - inset, y0, y1 };
  });
  for (const o of spec.openings) {
    const at = foot + o.y0, k = Math.max(0, bands.findIndex((b) => at >= b.y0 - 1e-6 && at < b.y1 - 1e-6));
    o.storey = k;
    o.y0 = at - bands[k].y0;
  }
  spec.storeys = bands.map((b) => ({ ...wall, h: b.y1 - b.y0 }));
  frame.bodies.splice(0, frame.bodies.length, ...bands);
  frame.floors.splice(0, frame.floors.length, ...bands.map((b) => b.y0));
  frame.faces = bodyFaces(b0.x1 - b0.x0, b0.z1 - b0.z0);
  const t = bands[bands.length - 1];
  frame.roof = roofGeometry(t.x1 - t.x0, t.z1 - t.z0, frame.eaveY, spec.roof);
}

/**
 * A palm trunk run out of a wall square to its face (`f`), its end `out` past the face and `len` long (the rest buried in
 * the wall): `sides` sides tapering a little to its end and the end's cap, no cap inside the wall. (u, y) its axis on
 * the face, r its radius, `turn` its roll in a side's turn.
 */
function trunkEnd(sink: PartSink, f: Face, u: number, y: number, r: number, len: number, out: number, colour: Rgb, turn = 0, sides = 5): void {
  const ring = (o: number, rr: number): Vec3[] => Array.from({ length: sides }, (_, k) => {
    const a = (k + turn) * Math.PI * 2 / sides + Math.PI / 2;
    return facePoint(f, u + Math.cos(a) * rr, y + Math.sin(a) * rr, o);
  });
  const a0 = ring(out - len, r), a1 = ring(out, r * 0.9), opts = { colour, decor: true } as const;
  for (let k = 0; k < sides; k++) sink.quad('structureWood', a0[k], a0[(k + 1) % sides], a1[(k + 1) % sides], a1[k], opts);
  sink.polygon('structureWood', a1, opts);
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
  const bucket = rng() < 0.3 ? KERSHEF_OLD : MUD, upper = rng() < 0.55;
  // (a house without its upper room keeps a jerid shade on its roof terrace instead, on most plots)
  const house = kershefBlock(sink, x0, z0, x1, z1, 0, h, bucket, rng, look, { door: true, shade: !upper && look() < 0.7 }), blocks = [house.parts];
  if (upper) {
    const ux1 = x0 + (x1 - x0) * (0.5 + rng() * 0.2), uz1 = z0 + (z1 - z0) * (0.45 + rng() * 0.15);
    blocks.push(kershefBlock(sink, x0 + 0.45, z0 + 0.45, ux1, uz1, h, 2.6, MUD, rng, look, { faces: ['front', 'right'], onto: house.plan }).parts);
  }
  return withParts(sink.finish(), blocks);
};

/**
 * Old Shali (a caravanserai or compound plot): the town's houses heaped together, a block to each cell of the plot,
 * packed against each other (their battered walls lean apart into narrow clefts as they rise), lower at the edges and
 * highest in the middle, a room set back on some roofs; the outer faces on the plot's edge, doors to the front lane. A
 * caravanserai's heap stands round an open court. Each block a kershef house of the grammar (kershefBlock).
 */
const shaliCluster: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  // (looks 227: a cell about a house's size, 6-8 m: a compound's 14.5 m depth two of them)
  const nx = R.W > 15 ? 3 : 2, nz = R.D > 16.5 ? 3 : 2;
  const cw = R.W / nx, cd = R.D / nz, blocks: RegionalParts[] = [];
  // (looks 227) a caravanserai's houses stand round its court: a heap of nine leaves its middle cell open
  const court = ctx.structureId === 'caravanserai' && nx === 3 && nz === 3;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    if (court && i === 1 && j === 1) continue;
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
    // (a room on fewer roofs of a heap of nine: the kits' triangle budget holds the whole heap)
    const bucket = rng() < 0.35 ? KERSHEF_OLD : MUD, room = storeys >= 2 && rng() < (nx * nz > 6 ? 0.3 : 0.45);
    const block = kershefBlock(sink, x0, z0, x1, z1, 0, h, bucket, rng, look, { door: j === nz - 1, faces: outer.length ? outer : ['front'], shade: !room && look() < 0.4, packed: true });
    blocks.push(block.parts);
    // a room set back on the roof terrace of some blocks
    if (room) {
      const ux0 = x0 + (x1 - x0) * (0.18 + rng() * 0.12), uz0 = z0 + (z1 - z0) * (0.18 + rng() * 0.12);
      const ux1 = ux0 + (x1 - x0) * (0.4 + rng() * 0.15), uz1 = uz0 + (z1 - z0) * (0.4 + rng() * 0.15);
      blocks.push(kershefBlock(sink, ux0, uz0, Math.min(x1 - 0.6, ux1), Math.min(z1 - 0.6, uz1), h, 2.4, MUD, rng, look,
        { faces: outer.length ? outer : ['front'], packed: true, onto: block.plan }).parts);
    }
  }
  return withParts(sink.finish(), blocks);
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

function mudTower(sink: PartSink, S: number, H: number, rng: () => number, minaret: boolean, look: () => number): void {
  // (round 2, the gauntlet's wave 125: "a straight-sided, crenellated castle keep") the tower is battered to its head —
  // two fifths in on a minaret, three tenths on a watch tower — its arrises rounded, a flat parapet head with a
  // bevelled crest, not merlons
  const a0 = S * 0.5, batter = a0 * (minaret ? 0.34 : 0.3), rc = batter + a0 * 0.14;
  const decor = { decor: true } as const, palm = (k: number) => shade(PALM, k + look() * 0.2);
  // (dome-detail-275: "a plain tapered shaft with slit openings") the tower founded on a course of the salt rock the town
  // stands on, a hand proud of its foot; the kershef's pale salt crust up the foot
  const foot = (y: number) => roundedRing(-a0, -a0, a0, a0, rc, -0.07, y);
  ringBand(sink, 'stone', foot(-0.3), foot(0.2), false, { tintAt: () => [0.96, 0.92, 0.84] });
  sink.polygon('stone', foot(0.2), { tint: [0.96, 0.92, 0.84] });
  sink.polygon('stone', [...foot(-0.3)].reverse());
  // the minaret's gallery: the shaft's head corbelled out on a sloped course over the stair's palm joists, its parapet
  // horned at the corners and pierced with Siwa's triangular vents; the watch tower's parapet horned too, vented on its
  // flanks
  const top = minaret ? H - 3.2 : H, ledge = minaret ? 0.16 : 0;
  const sideAt = slumpedMass(sink, MUD, -a0, -a0, a0, a0, 0.2, top, rc, batter, minaret ? 0.95 : 0.6, minaret ? 0.22 : 0.26,
    { horn: minaret ? 0.32 : 0.26, vented: minaret ? SIDES : ['left', 'right'], ledge, salt: 0.9 });
  const inset = batter - ledge;
  // palm spouts through the parapet's foot and the rain's runnels down the battered wall under them; the palm trunks'
  // ends through the wall in rows (a floor's beams, the joists under the gallery)
  const spouts: readonly Side[] = minaret ? ['right', 'left', 'back'] : ['left', 'right'];
  for (const name of spouts) {
    const pf = runFace(-a0, -a0, a0, a0, rc, name, -inset), u = (look() - 0.5) * pf.width * 0.5, sp = { colour: PALM, decor: true, uv: UV_MEMBER } as const;
    faceSpan(sink, 'structureWood', pf, u - 0.08, u + 0.08, top + 0.02, top + 0.05, -0.2, 0.55, sp);
    for (const s of [-1, 1]) faceSpan(sink, 'structureWood', pf, u + s * 0.08 - 0.015, u + s * 0.08 + 0.015, top + 0.05, top + 0.13, -0.2, 0.55, { ...sp, colour: shade(PALM, 0.85) });
    rainStreak(sink, MUD, (y) => sideAt(name, y), u, top - (ledge ? 0.44 : 0.02), top - 2.6 - look() * 1.6, 0.42, 0.6);
  }
  const rows = minaret ? [[top - 0.6, 4], [top * 0.52, 2]] as const : [[top - 0.42, 3], [H * 0.56, 2]] as const;
  for (const [y, n] of rows) for (const name of SIDES) {
    const f = sideAt(name, y);
    for (let k = 0; k < n; k++) {
      const u = (k - (n - 1) / 2) * f.width / n + (look() - 0.5) * 0.12;
      if (!minaret && name === 'front' && Math.abs(u) < 0.75) continue;
      trunkEnd(sink, f, u, y, 0.07 + look() * 0.02, 0.35, 0.18 + look() * 0.14, palm(0.65), look());
    }
  }
  // the clods the rain has brought down off the walls, slumped at the foot
  for (let k = 0; k < 3; k++) {
    const f = runFace(-a0, -a0, a0, a0, rc, SIDES[1 + (k % 3)], 0), c = facePoint(f, (look() - 0.5) * f.width, 0, 0.1 + look() * 0.15);
    sink.cylinder(MUD, [c[0], 0.1, c[2]], 'y', 0.16 + look() * 0.12, 0.22 + look() * 0.12, 7, { decor: true, tint: [0.95, 0.92, 0.86] }, 0.07, true, look());
  }
  // the slits and small windows (each its face's u and height), and the salt-rock lumps standing proud of the render clear
  // of them
  const slits: Array<[Side, number, number, number, number]> = [];
  if (minaret) {
    for (let k = 0; k < 5; k++) slits.push([SIDES[(k + 1) % 4], (look() - 0.5) * 0.7, 2.4 + k * (top - 3.9) / 4, 0.16, 0.56]);
    for (const name of SIDES) slits.push([name, (look() - 0.5) * 0.3, top - 1.5, 0.22, 0.62]);
  } else if (rng() < 0.5) for (const name of SIDES) slits.push([name, 0, H * 0.68 + 0.25, 0.3, 0.5]);
  else for (const name of ['back', 'left', 'right'] as const) slits.push([name, (look() - 0.5) * 0.6, H * 0.55, 0.18, 0.55]);
  for (const [name, u, y, w, h] of slits) slitIn(sink, sideAt(name, y), u, y, w, h);
  for (const name of SIDES) for (let k = 0; k < 2; k++) {
    const y = 1.4 + look() * (top - 2.8), f = sideAt(name, y), u = (look() - 0.5) * (f.width - 0.6), sz = 0.1 + look() * 0.1;
    if (slits.some(([n, su, sy]) => n === name && Math.abs(su - u) < 0.5 && Math.abs(sy - y) < 0.7) || (name === 'front' && y < H * 0.3 + 2.3 && Math.abs(u) < 0.8)) continue;
    faceBox(sink, MUD, f, u, y, 0.02, sz * 1.4, sz, 0.05, { decor: true, shade: 0.9 + look() * 0.15 });
  }
  if (minaret) {
    // the stair's door at the foot under a palm-log lintel, a step of the rock before it; the stair's slits climbing
    // round the shaft, a window under the gallery on every face
    const fd = sideAt('front', 1.0);
    doorUnit(sink, fd, 0, 0.2, 0.85, 1.8, { leaf: PALM_GREY, frame: { bucket: MUD, width: 0.2, out: 0.22 }, steps: null, leafKind: 'plank' });
    palmLog(sink, sideAt('front', 2.34), -0.66, 0.66, 2.34, 0.085, palm(0.7));
    sink.span('stone', -0.62, -0.1, a0 - 0.02, 0.62, 0.2, a0 + 0.36, { decor: true, tint: [0.92, 0.88, 0.8] });
    // the lantern on the gallery: four piers of kershef, an arch each side between them round the stair head's dark, its
    // head and cornice, the little pointed cap of the same mud and its knob (no cap of another colour)
    const Lh = 0.78, pp = 0.36, rr = Lh - pp, ls = top + 1.25, crown = ls + rr, lt = crown + 0.36;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      sink.span(MUD, sx < 0 ? -Lh : Lh - pp, top, sz < 0 ? -Lh : Lh - pp, sx < 0 ? -Lh + pp : Lh, crown, sz < 0 ? -Lh + pp : Lh);
    }
    sink.span(MUD, -Lh, crown, -Lh, Lh, lt, Lh);
    sink.span('dark', -0.3, top, -0.3, 0.3, crown, 0.3, decor);
    const LF = bodyFaces(2 * Lh, 2 * Lh);
    for (const fn of SIDES) {
      spandrels(sink, MUD, LF[fn], 0, ls, rr, -0.3, 0.3, {}, 4);
      trunkEnd(sink, LF[fn], 0, lt - 0.16, 0.055, 0.25, 0.16, palm(0.6), look());
    }
    sink.band(MUD, -Lh - 0.08, lt, -Lh - 0.08, Lh + 0.08, lt + 0.12, Lh + 0.08);
    sink.span(MUD, -Lh - 0.14, lt + 0.12, -Lh - 0.14, Lh + 0.14, lt + 0.22, Lh + 0.14);
    const cap = smoothDome(sink, MUD, 0, lt + 0.22, 0, 0.7, { form: 'pointed', stilt: 0.14, haunch: true });
    sink.revolve(MUD, [0, cap.top - 0.04, 0], 'y', [[0, 0.1], [0.12, 0.13], [0.24, 0.07], [0.32, 0]], 10, decor);
  } else {
    // the watch tower's door, high in its front wall under a palm-log lintel, and the palm-trunk ladder up to it
    const f = sideAt('front', H * 0.35);
    // (the frame 22 cm proud: the leaf at the back of its reveal, not laid on the wall)
    doorUnit(sink, f, 0, H * 0.3, 0.8, 1.6, { leaf: PALM, frame: { bucket: MUD, width: 0.2, out: 0.22 }, steps: null, leafKind: 'plank' });
    palmLog(sink, sideAt('front', H * 0.3 + 1.92), -0.72, 0.72, H * 0.3 + 1.92, 0.085, palm(0.7));
    const zt = sideAt('front', H * 0.3 + 0.2).origin[2] + 0.2, zg = Math.min(a0 + 0.62, zt + 0.75), lad = { colour: palm(0.75), decor: true } as const;
    for (const x of [-0.5, 0.5]) sink.pipe('structureWood', [x, -0.05, zg], [x, H * 0.3 + 0.2, zt], 0.05, 6, { ...lad, caps: true });
    for (let k = 1; k * 0.36 < H * 0.3; k++) {
      const y = k * 0.36, z = zg + (zt - zg) * (y + 0.05) / (H * 0.3 + 0.25);
      sink.pipe('structureWood', [-0.5, y, z], [0.5, y, z], 0.03, 5, { ...lad, fine: 'near' });
    }
    // the lookout's shade on the roof terrace: four palm posts, their beams and a mat of palm ribs over them, screened
    // with jerid on the windward side
    const sh = a0 - batter - 0.06 - 0.26 - 0.22, hs = 1.75, pm = { colour: palm(0.8), decor: true, uv: UV_MEMBER } as const;
    for (const [px, pz] of [[-sh, -sh], [sh, -sh], [-sh, sh], [sh, sh]] as const) sink.span('structureWood', px - 0.06, H - 0.02, pz - 0.06, px + 0.06, H + hs, pz + 0.06, pm);
    for (const pz of [-sh, sh]) sink.span('structureWood', -sh - 0.12, H + hs - 0.02, pz - 0.06, sh + 0.12, H + hs + 0.1, pz + 0.06, pm);
    const mat = shade(PALM_GREY, 0.92 + look() * 0.12);
    sink.span('structureWood', -sh - 0.3, H + hs + 0.1, -sh - 0.25, sh + 0.3, H + hs + 0.16, sh + 0.25, { colour: mat, decor: true });
    sink.span('structureWood', -sh - 0.02, H + 0.6, -sh - 0.04, sh + 0.02, H + hs + 0.1, -sh, { colour: shade(mat, 0.9), decor: true });
  }
}

/** The Shali mosque's minaret (a minaret plot): the square mud tower tapering to its crenellated top. */
const shaliMinaret: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const R = reach(ctx);
  const S = Math.max(2.6, Math.min(R.W, R.D) - 0.2);
  const H = Math.max(11, Math.min(15, ctx.info.h - 0.5));
  // (props census #5) the minaret recorded as a shaft body (it topples in its courses)
  sink.placed(0, R.cx, 0, R.cz, () => { mudTower(sink, S, H, ctx.rng, true, ctx.variant); recordShaft(sink, 0, 0, S, H, MUD); });
  return sink.finish();
};

/** A kershef watch tower (a tower plot): the square mud tower with its door high up. */
const siwaTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const R = reach(ctx);
  const S = Math.max(3.0, Math.min(R.W, R.D) - 0.2);
  const H = Math.max(7.5, ctx.info.h - 1.5);
  sink.placed(0, R.cx, 0, R.cz, () => { mudTower(sink, S, H, ctx.rng, false, ctx.variant); recordShaft(sink, 0, 0, S, H, MUD); });
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
  // (Oasis round 3, wave 135: "the grey cut-stone block ... reads as modern masonry") the rim is the spring's old mud
  // kerb, plastered and worn round, not dressed grey stone. (Props census #15, Lane C 2026-10-16: "a ring of 20 plain
  // stone boxes 0.5 m high (no coping, no inner face, no floor)") the kerb is one solid ring, its outer face from the
  // ground and its inner face down past the water to the pool's floor of pale sand, its worn coping a hand proud of both
  const up: Vec3 = [0, 1, 0], e1: Vec3 = [0, 0, 1], e2: Vec3 = [1, 0, 0];
  ringSolid(sink, KERSHEF_OLD, [px, -0.9, pz], up, e1, e2, r - 0.45, r, 1.45, 28, {});
  ringSolid(sink, KERSHEF_OLD, [px, 0.55, pz], up, e1, e2, r - 0.5, r + 0.05, 0.1, 28, { decor: true, tint: [1.06, 1.04, 1.0] });
  sink.cylinder('stone', [px, -0.95, pz], 'y', 0.05, r - 0.44, 24, { decor: true, tint: [1.12, 1.06, 0.9] });
  // the water to the kerb's inner face; the steps run from the kerb down into it, each tread over the one below
  sink.cylinder('glass', [px, 0.22, pz], 'y', 0.02, r - 0.44, 24, { decor: true });
  for (let k = 0; k < 3; k++) sink.span(KERSHEF_OLD, px - 0.8, 0.5 - k * 0.2, pz + r - 0.95 - k * 0.35, px + 0.8, 0.62 - k * 0.2, pz + r - 0.4, { decor: true });
  // the overflow's channel (the saqiya) out of the kerb toward the gardens: two low kerbs, the running water between
  // (toward the plot's near side, clear of the café's wall and shelter on the far one)
  const ch = along ? [0, -1] : [-1, 0], cx0 = px + ch[0] * (r - 0.1), cz0 = pz + ch[1] * (r - 0.1), cl = 1.6;
  for (const side of [-1, 1]) {
    const ox = -ch[1] * side * 0.32, oz = ch[0] * side * 0.32;
    const x0 = cx0 + ox, z0 = cz0 + oz, x1 = x0 + ch[0] * cl, z1 = z0 + ch[1] * cl;
    sink.span(KERSHEF_OLD, Math.min(x0, x1) - 0.1, -0.2, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, 0.32, Math.max(z0, z1) + 0.1, { decor: true });
  }
  sink.span('glass', Math.min(cx0, cx0 + ch[0] * cl) - (ch[1] ? 0.22 : 0), 0.16, Math.min(cz0, cz0 + ch[1] * cl) - (ch[0] ? 0.22 : 0),
    Math.max(cx0, cx0 + ch[0] * cl) + (ch[1] ? 0.22 : 0), 0.18, Math.max(cz0, cz0 + ch[1] * cl) + (ch[0] ? 0.22 : 0), { decor: true });
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

const SIWA_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
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
  },
  // the courtyards: palm-rib (jerid) fences round each house's court (yards.ts; round 2, wave 125: the generic adobe wall
  // read as "salmon-pink stucco with fired-brick coping")
  yard: { kinds: ['adobe'], fence: 'fencewattle', gate: null, shed: null, garden: false },
});
